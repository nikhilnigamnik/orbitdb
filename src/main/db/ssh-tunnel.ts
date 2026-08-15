import { createHash } from 'crypto'
import { createServer, type Server, type Socket } from 'net'
import { Client, type ConnectConfig } from 'ssh2'
import {
  SSH_DEFAULT_PORT,
  usesSshTunnel,
  type ConnectionInput,
  type SavedConnection
} from '../../shared/types'

/** ssh2 reports "All configured authentication methods failed" and nothing else. */
const READY_TIMEOUT_MS = 10_000

export interface TunnelEndpoint {
  host: string
  port: number
  /** Set when this connect pinned a fingerprint that was not pinned before. */
  learnedFingerprint?: string
}

export interface EphemeralTunnel extends TunnelEndpoint {
  /** Pass back to closeTunnel - the caller owns this one's lifetime. */
  key: string
}

export interface SshHostKeyMismatchDetails {
  expected: string
  actual: string
}

export class SshHostKeyMismatchError extends Error {
  readonly expected: string
  readonly actual: string

  constructor(host: string, { expected, actual }: SshHostKeyMismatchDetails) {
    super(
      `The SSH host key for ${host} changed. Expected ${expected} but the server offered ` +
        `${actual}. If this is a deliberate rebuild, clear the pinned fingerprint on the ` +
        `connection; otherwise stop, because something is impersonating the server.`
    )
    this.name = 'SshHostKeyMismatchError'
    this.expected = expected
    this.actual = actual
  }
}

// Re-exported under the name the drivers read better with; the rule itself is
// shared with the renderer so a badge and a tunnel cannot disagree.
export { usesSshTunnel as isSshEnabled }

export function fingerprintHostKey(key: Buffer): string {
  return `SHA256:${createHash('sha256').update(key).digest('base64').replace(/=+$/, '')}`
}

/**
 * SSH_AUTH_SOCK wins on every platform - on Windows that is the named pipe the
 * built-in OpenSSH agent exports (`\\.\pipe\openssh-ssh-agent`), which ssh2
 * accepts directly. Only fall back to the literal 'pageant' when nothing set
 * it, since answering 'pageant' unconditionally leaves an OpenSSH-agent user on
 * Windows no way to point at their real agent.
 */
function agentAddress(): string | undefined {
  const fromEnv = process.env.SSH_AUTH_SOCK
  if (fromEnv) return fromEnv
  if (process.platform === 'win32') return 'pageant'
  return undefined
}

/**
 * Map a saved connection onto ssh2's ConnectConfig. Split out from the tunnel
 * itself because every decision that can be wrong lives here.
 */
export function buildSshConnectConfig(input: ConnectionInput): ConnectConfig {
  const host = input.sshHost?.trim()
  if (!host) throw new Error('SSH tunnel is enabled but no bastion host is set.')
  const user = input.sshUser?.trim()
  if (!user) throw new Error('SSH tunnel is enabled but no SSH user is set.')

  const config: ConnectConfig = {
    host,
    port: input.sshPort && input.sshPort > 0 ? input.sshPort : SSH_DEFAULT_PORT,
    username: user,
    readyTimeout: READY_TIMEOUT_MS,
    keepaliveInterval: 15_000
  }

  const method = input.sshAuthMethod ?? 'password'
  if (method === 'agent') {
    const agent = agentAddress()
    if (!agent) {
      throw new Error(
        'SSH agent authentication was selected but SSH_AUTH_SOCK is not set. Start an agent ' +
          'and add your key, or choose another authentication method.'
      )
    }
    config.agent = agent
    return config
  }

  if (method === 'key') {
    const privateKey = input.sshPrivateKey
    if (!privateKey?.trim()) {
      throw new Error('SSH key authentication was selected but no private key is stored.')
    }
    config.privateKey = privateKey
    // An empty passphrase and an absent one mean different things to ssh2.
    if (input.sshPassphrase) config.passphrase = input.sshPassphrase
    return config
  }

  const password = input.sshPassword
  if (!password) {
    throw new Error('SSH password authentication was selected but no password is stored.')
  }
  config.password = password
  return config
}

interface Tunnel {
  server: Server
  client: Client
  port: number
  sockets: Set<Socket>
}

const tunnels = new Map<string, Tunnel>()

/**
 * getPool is async now, so two queries arriving on a cold connection both reach
 * openTunnel before either finishes. Without this they would each stand up a
 * bastion connection and the loser would leak.
 */
const pending = new Map<string, Promise<TunnelEndpoint>>()

/**
 * Called when an SSH connection dies under a live tunnel. The local listener
 * would otherwise stay up and accept sockets it can no longer forward, so the
 * pool must be evicted alongside it or every later query fails on a dead tunnel.
 */
type PoolEvictor = (connectionId: string) => void

const evictors: PoolEvictor[] = []

/** Each driver registers its own; evicting an id it does not hold is a no-op. */
export function addTunnelPoolEvictor(fn: PoolEvictor): void {
  evictors.push(fn)
}

function evictPool(connectionId: string): void {
  for (const evict of evictors) evict(connectionId)
}

function destroyTunnel(tunnel: Tunnel): void {
  for (const socket of tunnel.sockets) socket.destroy()
  tunnel.sockets.clear()
  tunnel.server.close()
  tunnel.client.end()
}

function connectClient(
  config: ConnectConfig,
  pinnedFingerprint: string | undefined,
  host: string
): Promise<{ client: Client; fingerprint: string }> {
  return new Promise((resolve, reject) => {
    const client = new Client()
    let fingerprint = ''
    let settled = false
    let mismatch: SshHostKeyMismatchError | null = null

    const fail = (err: Error): void => {
      if (settled) return
      settled = true
      client.end()
      reject(err)
    }

    client.on('ready', () => {
      if (settled) return
      settled = true
      resolve({ client, fingerprint })
    })

    client.on('error', (err) => {
      // A rejected host key surfaces here as a generic handshake failure; the
      // verifier already built the precise error, so do not overwrite it.
      if (mismatch) fail(mismatch)
      else fail(new Error(`SSH tunnel to ${host}: ${err.message}`))
    })

    client.connect({
      ...config,
      hostVerifier: (key: Buffer): boolean => {
        fingerprint = fingerprintHostKey(key)
        if (!pinnedFingerprint) return true
        if (pinnedFingerprint === fingerprint) return true
        mismatch = new SshHostKeyMismatchError(host, {
          expected: pinnedFingerprint,
          actual: fingerprint
        })
        return false
      }
    })
  })
}

export function openTunnel(saved: SavedConnection): Promise<TunnelEndpoint> {
  const existing = tunnels.get(saved.id)
  if (existing) return Promise.resolve({ host: '127.0.0.1', port: existing.port })
  const inFlight = pending.get(saved.id)
  if (inFlight) return inFlight
  const promise = createTunnel(saved, saved.id).finally(() => pending.delete(saved.id))
  pending.set(saved.id, promise)
  return promise
}

let ephemeralCount = 0

/**
 * Testing an unsaved connection still needs a tunnel, so it opens one under a
 * synthetic id that the caller tears down itself with the returned key.
 *
 * The key is unique per call rather than one constant per engine: the
 * connections page health-checks every saved connection at once, so two tests
 * run concurrently. A shared key would let the second overwrite the first -
 * orphaning its client and listener beyond the reach of closeTunnel - and let
 * whichever finished first tear down the other's live tunnel mid-query.
 */
export async function openEphemeralTunnel(input: ConnectionInput): Promise<EphemeralTunnel> {
  const key = `<ephemeral:${++ephemeralCount}>`
  const endpoint = await createTunnel(input, key)
  return { ...endpoint, key }
}

async function createTunnel(input: ConnectionInput, key: string): Promise<TunnelEndpoint> {
  const config = buildSshConnectConfig(input)
  const bastion = String(config.host)
  const pinned = input.sshHostKeyFingerprint?.trim() || undefined
  const { client, fingerprint } = await connectClient(config, pinned, bastion)

  const targetHost = input.host
  const targetPort = input.port
  const sockets = new Set<Socket>()

  const server = createServer((socket) => {
    sockets.add(socket)
    socket.on('error', () => socket.destroy())
    socket.on('close', () => sockets.delete(socket))
    client.forwardOut('127.0.0.1', 0, targetHost, targetPort, (err, stream) => {
      if (err) {
        socket.destroy()
        return
      }
      stream.on('error', () => socket.destroy())
      socket.pipe(stream).pipe(socket)
    })
  })

  const port = await new Promise<number>((resolve, reject) => {
    server.on('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (address === null || typeof address === 'string') {
        server.close()
        reject(new Error('Could not determine the local tunnel port.'))
        return
      }
      resolve(address.port)
    })
  }).catch((err: Error) => {
    client.end()
    throw err
  })

  const tunnel: Tunnel = { server, client, port, sockets }
  tunnels.set(key, tunnel)

  const teardown = (): void => {
    if (tunnels.get(key) !== tunnel) return
    tunnels.delete(key)
    destroyTunnel(tunnel)
    evictPool(key)
  }
  client.on('close', teardown)
  client.on('error', teardown)

  return {
    host: '127.0.0.1',
    port,
    learnedFingerprint: pinned ? undefined : fingerprint
  }
}

export function closeTunnel(connectionId: string): void {
  const tunnel = tunnels.get(connectionId)
  if (!tunnel) return
  tunnels.delete(connectionId)
  destroyTunnel(tunnel)
}

export function closeAllTunnels(): void {
  for (const id of [...tunnels.keys()]) closeTunnel(id)
}
