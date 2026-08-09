import { describe, expect, it } from 'vitest'
import { safeExternalUrl } from '../../../src/main/app/open-external'

describe('what may be handed to the OS', () => {
  it('web links', () => {
    expect(safeExternalUrl('https://example.com/docs')).toBe('https://example.com/docs')
    expect(safeExternalUrl('http://localhost:5173/')).toBe('http://localhost:5173/')
  })

  it('preserves the query and fragment', () => {
    expect(safeExternalUrl('https://example.com/a?b=1#c')).toBe('https://example.com/a?b=1#c')
  })
})

describe('what must not be', () => {
  it('schemes that launch something rather than open a page', () => {
    // The reason this check exists: a link in rendered content reaches the OS
    // handler, and these do more than display a page.
    expect(safeExternalUrl('file:///etc/passwd')).toBeNull()
    expect(safeExternalUrl('smb://host/share')).toBeNull()
    expect(safeExternalUrl('vscode://file/Users/me/.ssh/id_rsa')).toBeNull()
    expect(safeExternalUrl('ms-msdt:/id')).toBeNull()
  })

  it('javascript and data URLs', () => {
    expect(safeExternalUrl('javascript:alert(1)')).toBeNull()
    expect(safeExternalUrl('data:text/html,<script>alert(1)</script>')).toBeNull()
  })

  it('anything that is not a URL at all', () => {
    expect(safeExternalUrl('')).toBeNull()
    expect(safeExternalUrl('not a url')).toBeNull()
    expect(safeExternalUrl('/relative/path')).toBeNull()
  })

  it('a scheme that only looks like http', () => {
    expect(safeExternalUrl('httpx://example.com')).toBeNull()
    expect(safeExternalUrl('javascript:void(location="http://x")')).toBeNull()
  })
})

describe('normalisation', () => {
  it('returns the parsed form, not the raw string', () => {
    // Whatever is opened is what was parsed and checked, never the original.
    expect(safeExternalUrl('HTTPS://Example.com')).toBe('https://example.com/')
  })
})
