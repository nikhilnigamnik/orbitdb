import { createHash, generateKeyPairSync } from 'crypto'
import { createServer, connect, type Server as NetServer } from 'net'
import { Server as SshServer } from 'ssh2'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  buildSshConnectConfig,
  closeTunnel,
  fingerprintHostKey,
  isSshEnabled,
  openEphemeralTunnel
} from '../../../src/main/db/ssh-tunnel'
import { usesSshTunnel, type ConnectionInput } from '../../../src/shared/types'

function baseInput(overrides: Partial<ConnectionInput> = {}): ConnectionInput {
  return {
    name: 'test',
    engine: 'postgres',
    environment: 'dev',
    host: 'db.internal',
    port: 5432,
    database: 'app',
    user: 'app',
    password: 'pw',
    ssl: false,
    sshEnabled: true,
    sshHost: 'bastion.example.com',
    sshPort: 22,
    sshUser: 'ubuntu',
    sshAuthMethod: 'password',
    sshPassword: 'secret',
    ...overrides
  }
}

describe('isSshEnabled', () => {
  it('is off unless explicitly enabled', () => {
    expect(isSshEnabled({ engine: 'postgres', sshEnabled: undefined })).toBe(false)
    expect(isSshEnabled({ engine: 'postgres', sshEnabled: false })).toBe(false)
    expect(isSshEnabled({ engine: 'postgres', sshEnabled: true })).toBe(true)
  })

  it('never tunnels D1, which has no socket to forward', () => {
    expect(isSshEnabled({ engine: 'd1', sshEnabled: true })).toBe(false)
  })

  it('is the same rule the renderer badges with', () => {
    // Switching a tunnelled connection to D1 hides the section without
    // clearing the flag, so `sshEnabled: true` on a D1 row is reachable. Both
    // sides must read it the same way or the card claims a tunnel that the
    // driver ignores.
    expect(isSshEnabled).toBe(usesSshTunnel)
  })
})

describe('fingerprintHostKey', () => {
  it('renders the OpenSSH SHA256 form without base64 padding', () => {
    const key = Buffer.from('a host key')
    const expected = createHash('sha256').update(key).digest('base64').replace(/=+$/, '')
    const actual = fingerprintHostKey(key)
    expect(actual).toBe(`SHA256:${expected}`)
    expect(actual.endsWith('=')).toBe(false)
  })
})

describe('buildSshConnectConfig', () => {
  it('carries the bastion address and user', () => {
    const config = buildSshConnectConfig(baseInput())
    expect(config.host).toBe('bastion.example.com')
    expect(config.port).toBe(22)
    expect(config.username).toBe('ubuntu')
    expect(config.password).toBe('secret')
  })

  it('falls back to port 22 when none is set', () => {
    expect(buildSshConnectConfig(baseInput({ sshPort: undefined })).port).toBe(22)
    expect(buildSshConnectConfig(baseInput({ sshPort: 0 })).port).toBe(22)
  })

  it('rejects an enabled tunnel with no host or user', () => {
    expect(() => buildSshConnectConfig(baseInput({ sshHost: '  ' }))).toThrow(/bastion host/)
    expect(() => buildSshConnectConfig(baseInput({ sshUser: '' }))).toThrow(/SSH user/)
  })

  it('sends the key and passphrase for key auth', () => {
    const config = buildSshConnectConfig(
      baseInput({
        sshAuthMethod: 'key',
        sshPrivateKey: '-----BEGIN OPENSSH PRIVATE KEY-----\nx\n',
        sshPassphrase: 'unlock'
      })
    )
    expect(config.privateKey).toContain('PRIVATE KEY')
    expect(config.passphrase).toBe('unlock')
    expect(config.password).toBeUndefined()
  })

  it('omits an empty passphrase rather than sending one', () => {
    const config = buildSshConnectConfig(
      baseInput({
        sshAuthMethod: 'key',
        sshPrivateKey: '-----BEGIN OPENSSH PRIVATE KEY-----\nx\n',
        sshPassphrase: ''
      })
    )
    expect('passphrase' in config).toBe(false)
  })

  it('refuses key auth with nothing stored, rather than failing at the bastion', () => {
    expect(() =>
      buildSshConnectConfig(baseInput({ sshAuthMethod: 'key', sshPrivateKey: '   ' }))
    ).toThrow(/no private key/)
  })

  it('refuses password auth with no password', () => {
    expect(() => buildSshConnectConfig(baseInput({ sshPassword: '' }))).toThrow(/no password/)
  })

  it('uses the running agent and stores no secret', () => {
    vi.stubEnv('SSH_AUTH_SOCK', '/tmp/agent.sock')
    const config = buildSshConnectConfig(baseInput({ sshAuthMethod: 'agent' }))
    // SSH_AUTH_SOCK wins on every platform, Windows included - the built-in
    // OpenSSH agent there exports a named pipe through it, and answering
    // 'pageant' regardless would leave those users unable to reach their agent.
    expect(config.agent).toBe('/tmp/agent.sock')
    expect(config.password).toBeUndefined()
    expect(config.privateKey).toBeUndefined()
    vi.unstubAllEnvs()
  })

  it('says so when agent auth is chosen with no agent running', () => {
    if (process.platform === 'win32') return
    vi.stubEnv('SSH_AUTH_SOCK', '')
    expect(() => buildSshConnectConfig(baseInput({ sshAuthMethod: 'agent' }))).toThrow(
      /SSH_AUTH_SOCK/
    )
    vi.unstubAllEnvs()
  })
})

/**
 * The piping between the local listener and the forwarded channel cannot be
 * unit tested, so this stands up a real SSH server and a real target and checks
 * that bytes make the round trip.
 */
describe('the tunnel end to end', () => {
  const cleanups: Array<() => void> = []

  afterEach(() => {
    while (cleanups.length) cleanups.pop()?.()
  })

  function startEchoServer(): Promise<{ port: number; server: NetServer }> {
    return new Promise((resolve) => {
      const server = createServer((socket) => {
        socket.on('data', (chunk) => socket.write(chunk.toString('utf8').toUpperCase()))
      })
      server.listen(0, '127.0.0.1', () => {
        const address = server.address()
        if (address === null || typeof address === 'string') throw new Error('no port')
        resolve({ port: address.port, server })
      })
    })
  }

  function startSshServer(password: string): Promise<{ port: number; server: SshServer }> {
    const { privateKey } = generateKeyPairSync('rsa', {
      modulusLength: 2048,
      privateKeyEncoding: { type: 'pkcs1', format: 'pem' },
      publicKeyEncoding: { type: 'spki', format: 'pem' }
    })
    return new Promise((resolve) => {
      const server = new SshServer({ hostKeys: [privateKey] }, (client) => {
        // Rejecting the host key aborts the key exchange, which the server
        // reports as an error - unhandled, it fails the run from outside any test.
        client.on('error', () => undefined)
        client.on('authentication', (ctx) => {
          if (ctx.method === 'password' && ctx.password === password) ctx.accept()
          else if (ctx.method === 'none') ctx.reject(['password'])
          else ctx.reject()
        })
        client.on('ready', () => {
          // direct-tcpip is what forwardOut asks for; join it to the real target.
          client.on('tcpip', (accept, reject, info) => {
            const target = connect(info.destPort, info.destIP, () => {
              const channel = accept()
              channel.pipe(target).pipe(channel)
            })
            target.on('error', () => reject())
          })
        })
      })
      server.listen(0, '127.0.0.1', () => resolve({ port: server.address().port, server }))
    })
  }

  function roundTrip(host: string, port: number, message: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const socket = connect(port, host, () => socket.write(message))
      socket.on('data', (chunk) => {
        resolve(chunk.toString('utf8'))
        socket.end()
      })
      socket.on('error', reject)
    })
  }

  async function setup() {
    const password = 'hunter2'
    const echo = await startEchoServer()
    const ssh = await startSshServer(password)
    cleanups.push(() => echo.server.close())
    cleanups.push(() => ssh.server.close())
    return {
      input: baseInput({
        host: '127.0.0.1',
        port: echo.port,
        sshHost: '127.0.0.1',
        sshPort: ssh.port,
        sshAuthMethod: 'password',
        sshPassword: password
      })
    }
  }

  it('gives concurrent tests their own tunnel, so neither closes the other', async () => {
    const { input } = await setup()
    // The connections page health-checks every saved connection at once, so
    // two tests really do overlap. A shared key made the second overwrite the
    // first - orphaning it past the reach of closeTunnel - and let whichever
    // finished first tear down the other's live tunnel mid-query.
    const [a, b] = await Promise.all([openEphemeralTunnel(input), openEphemeralTunnel(input)])
    cleanups.push(() => closeTunnel(a.key))
    cleanups.push(() => closeTunnel(b.key))

    expect(a.key).not.toBe(b.key)
    expect(a.port).not.toBe(b.port)

    closeTunnel(a.key)
    // b is untouched by a's teardown and still carries bytes.
    await expect(roundTrip(b.host, b.port, 'still here')).resolves.toBe('STILL HERE')
  })

  it('forwards bytes to the target and pins the host key', async () => {
    const { input } = await setup()
    const endpoint = await openEphemeralTunnel(input)
    cleanups.push(() => closeTunnel(endpoint.key))

    // The forward is loopback-only, and on a port nobody chose by hand.
    expect(endpoint.host).toBe('127.0.0.1')
    expect(endpoint.port).not.toBe(input.port)
    expect(endpoint.learnedFingerprint).toMatch(/^SHA256:/)

    await expect(roundTrip(endpoint.host, endpoint.port, 'ping')).resolves.toBe('PING')
  })

  it('reports no new fingerprint when one is already pinned and matches', async () => {
    const { input } = await setup()
    const first = await openEphemeralTunnel(input)
    cleanups.push(() => closeTunnel(first.key))
    const pinned = first.learnedFingerprint
    expect(pinned).toBeTruthy()

    const second = await openEphemeralTunnel({ ...input, sshHostKeyFingerprint: pinned })
    cleanups.push(() => closeTunnel(second.key))
    expect(second.learnedFingerprint).toBeUndefined()
    await expect(roundTrip(second.host, second.port, 'ok')).resolves.toBe('OK')
  })

  it('refuses to connect when the pinned host key does not match', async () => {
    const { input } = await setup()
    await expect(
      openEphemeralTunnel({ ...input, sshHostKeyFingerprint: 'SHA256:not-the-real-key' })
    ).rejects.toThrow(/host key for 127\.0\.0\.1 changed/)
  })

  it('refuses a bad SSH credential with a message naming the tunnel', async () => {
    const { input } = await setup()
    await expect(openEphemeralTunnel({ ...input, sshPassword: 'wrong' })).rejects.toThrow(
      /SSH tunnel to 127\.0\.0\.1/
    )
  })
})
