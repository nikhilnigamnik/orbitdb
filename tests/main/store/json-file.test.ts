import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  quarantineJsonFile,
  readJsonFile,
  writeJsonFileAtomic
} from '../../../src/main/store/json-file'

let dir: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'orbitdb-json-'))
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
})

afterEach(() => {
  vi.restoreAllMocks()
  rmSync(dir, { recursive: true, force: true })
})

describe('an atomic write', () => {
  it('writes the whole document and leaves no temp file behind', () => {
    const path = join(dir, 'store.json')
    writeJsonFileAtomic(path, { a: 1 }, 2)
    writeJsonFileAtomic(path, { a: 2 }, 2)

    expect(JSON.parse(readFileSync(path, 'utf8'))).toEqual({ a: 2 })
    expect(readdirSync(dir)).toEqual(['store.json'])
  })

  it('leaves the previous file intact when the new one cannot be written', () => {
    const path = join(dir, 'store.json')
    writeJsonFileAtomic(path, { kept: true })
    const circular: Record<string, unknown> = {}
    circular.self = circular

    expect(() => writeJsonFileAtomic(path, circular)).toThrow()
    expect(JSON.parse(readFileSync(path, 'utf8'))).toEqual({ kept: true })
    expect(readdirSync(dir)).toEqual(['store.json'])
  })

  it('is readable only by its owner, since one of these files holds credentials', () => {
    if (process.platform === 'win32') return
    const path = join(dir, 'store.json')
    writeJsonFileAtomic(path, {})
    expect(statSync(path).mode & 0o777).toBe(0o600)
  })
})

describe('reading', () => {
  it('reads a missing file as nothing to load', () => {
    expect(readJsonFile(join(dir, 'absent.json'))).toBeUndefined()
  })

  it('moves an unparseable file aside instead of letting the next write replace it', () => {
    const path = join(dir, 'store.json')
    writeFileSync(path, '{ torn', 'utf8')

    expect(readJsonFile(path)).toBeUndefined()

    const [aside] = readdirSync(dir)
    expect(aside).toMatch(/^store\.json\.corrupt-\d{8}T\d{6}$/)
    expect(readFileSync(join(dir, aside), 'utf8')).toBe('{ torn')

    writeJsonFileAtomic(path, { fresh: true })
    expect(readFileSync(join(dir, aside), 'utf8')).toBe('{ torn')
  })

  it('never overwrites an earlier quarantined copy', () => {
    const path = join(dir, 'store.json')
    writeFileSync(path, 'first', 'utf8')
    quarantineJsonFile(path, 'test')
    writeFileSync(path, 'second', 'utf8')
    quarantineJsonFile(path, 'test')

    const contents = readdirSync(dir).map((name) => readFileSync(join(dir, name), 'utf8'))
    expect(contents.sort()).toEqual(['first', 'second'])
  })
})
