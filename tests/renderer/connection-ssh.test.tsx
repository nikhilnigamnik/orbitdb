// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SshTunnelFields } from '@renderer/features/connections/components/ssh-tunnel-fields'
import { SshTunnelRoute } from '@renderer/features/connections/components/ssh-tunnel-route'
import { connectionSchema, type ConnectionFormValues } from '@renderer/features/connections/schema'
import { DEFAULT_CONNECTION_VALUES } from '@renderer/config/site'

afterEach(cleanup)

function values(overrides: Partial<ConnectionFormValues> = {}): ConnectionFormValues {
  // A name is always required, so give one - these cases are about the tunnel.
  return {
    ...DEFAULT_CONNECTION_VALUES,
    name: 'a connection',
    ...overrides
  } as ConnectionFormValues
}

function issuesFor(input: Partial<ConnectionFormValues>): string[] {
  const result = connectionSchema.safeParse(values(input))
  if (result.success) return []
  return result.error.issues.map((issue) => String(issue.path[0]))
}

describe('validation', () => {
  it('asks for nothing while the tunnel is off', () => {
    expect(issuesFor({ sshEnabled: false, sshHost: '', sshUser: '' })).toEqual([])
  })

  it('requires a bastion host and user once it is on', () => {
    const issues = issuesFor({ sshEnabled: true, sshHost: '', sshUser: '' })
    expect(issues).toContain('sshHost')
    expect(issues).toContain('sshUser')
  })

  it('requires a credential only for the method that needs one', () => {
    const common = { sshEnabled: true, sshHost: 'bastion', sshUser: 'ubuntu' } as const

    expect(issuesFor({ ...common, sshAuthMethod: 'password', sshPassword: '' })).toContain(
      'sshPassword'
    )
    expect(issuesFor({ ...common, sshAuthMethod: 'key', sshPrivateKey: '' })).toContain(
      'sshPrivateKey'
    )
    // The agent holds the credential itself, so nothing is stored here.
    expect(issuesFor({ ...common, sshAuthMethod: 'agent' })).toEqual([])
  })

  it('leaves D1 alone, since it has no socket to tunnel', () => {
    expect(
      issuesFor({
        engine: 'd1',
        accountId: 'a',
        databaseId: 'b',
        apiToken: 'c',
        sshEnabled: true,
        sshHost: '',
        sshUser: ''
      })
    ).toEqual([])
  })
})

describe('the route', () => {
  it('composes each hop from the fields, so the two hosts cannot be confused', () => {
    render(
      <SshTunnelRoute
        sshUser="ubuntu"
        sshHost="bastion.example.com"
        sshPort={2222}
        host="db.internal"
        port={5432}
        engine="postgres"
      />
    )
    expect(screen.getByText('ubuntu@bastion.example.com:2222')).toBeTruthy()
    expect(screen.getByText('db.internal:5432')).toBeTruthy()
  })

  it('shows placeholders rather than a half-built address', () => {
    render(<SshTunnelRoute sshUser="" sshHost="" sshPort={22} host="" port={5432} engine="mysql" />)
    expect(screen.getByText('bastion host')).toBeTruthy()
    expect(screen.getByText('database host')).toBeTruthy()
    // No stray "@" or ":22" from interpolating empty values.
    expect(screen.queryByText(/@|:22/)).toBeNull()
  })
})

describe('the fields', () => {
  it('shows nothing but the switch until the tunnel is turned on', () => {
    const { rerender } = render(
      <SshTunnelFields values={values({ sshEnabled: false })} errors={{}} onChange={() => {}} />
    )
    expect(screen.queryByLabelText('SSH host')).toBeNull()

    rerender(
      <SshTunnelFields values={values({ sshEnabled: true })} errors={{}} onChange={() => {}} />
    )
    expect(screen.getByLabelText('SSH host')).toBeTruthy()
  })

  it('asks for a password only under password auth', () => {
    render(
      <SshTunnelFields
        values={values({ sshEnabled: true, sshAuthMethod: 'agent' })}
        errors={{}}
        onChange={() => {}}
      />
    )
    expect(screen.queryByLabelText('SSH password')).toBeNull()

    cleanup()
    render(
      <SshTunnelFields
        values={values({ sshEnabled: true, sshAuthMethod: 'password' })}
        errors={{}}
        onChange={() => {}}
      />
    )
    expect(screen.getByLabelText('SSH password')).toBeTruthy()
  })

  it('stores the contents of the picked key, not its path', async () => {
    const onChange = vi.fn()
    const pickSshKey = vi.fn().mockResolvedValue({
      success: true,
      data: { path: '/home/me/.ssh/id_ed25519', contents: 'PEM BODY' }
    })
    Object.assign(window, { api: { connections: { pickSshKey } } })

    render(
      <SshTunnelFields
        values={values({ sshEnabled: true, sshAuthMethod: 'key' })}
        errors={{}}
        onChange={onChange}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: /Choose key file/ }))

    await waitFor(() => expect(onChange).toHaveBeenCalledWith('sshPrivateKey', 'PEM BODY'))
    expect(onChange).not.toHaveBeenCalledWith('sshPrivateKey', '/home/me/.ssh/id_ed25519')
  })

  it('offers to clear a pinned host key, because a rebuild is a real thing', () => {
    const onChange = vi.fn()
    render(
      <SshTunnelFields
        values={values({ sshEnabled: true, sshHostKeyFingerprint: 'SHA256:abc' })}
        errors={{}}
        onChange={onChange}
      />
    )
    expect(screen.getByText('SHA256:abc')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Clear' }))
    expect(onChange).toHaveBeenCalledWith('sshHostKeyFingerprint', '')
  })
})
