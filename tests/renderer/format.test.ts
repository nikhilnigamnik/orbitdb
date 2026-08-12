import { describe, expect, it } from 'vitest'
import {
  formatBytes,
  formatCellValue,
  formatNumber,
  isBinaryValue,
  isBlankString,
  shortServerVersion,
  stringifyDate
} from '@renderer/lib/format'
import { stringifyValue } from '@renderer/features/tables/lib/cell-value'

// vitest.config.ts pins TZ to Asia/Kolkata, so these offsets are the same on
// any machine - and a non-zero offset means the zone actually renders, rather
// than collapsing to the 'Z' that UTC would produce.
const OFFSET = '+05:30'

describe('formatCellValue', () => {
  it('names null rather than showing a blank', () => {
    expect(formatCellValue(null)).toBe('NULL')
  })

  it('renders binary as a size, not as its bytes', () => {
    // bytea arrives as bytes and used to fall through to JSON.stringify, filling
    // the cell and its tooltip with hundreds of numbers.
    expect(formatCellValue(new Uint8Array([137, 80, 78, 71]))).toBe('<binary, 4 B>')
    expect(formatCellValue(new Uint8Array(2048))).toBe('<binary, 2.0 kB>')
    expect(formatCellValue(new Uint8Array(3 * 1024 * 1024))).toBe('<binary, 3.0 MB>')
  })

  it('renders objects compactly, unlike the editor which pretty-prints', () => {
    expect(formatCellValue({ a: 1 })).toBe('{"a":1}')
  })

  it('spells booleans out', () => {
    expect(formatCellValue(true)).toBe('true')
    expect(formatCellValue(false)).toBe('false')
  })

  it('agrees with the editor about a timestamptz', () => {
    // The grid used to drop the offset while the editor kept it, so the same
    // value read differently before and after a double-click.
    const value = new Date('2026-08-09T12:00:00Z')
    expect(formatCellValue(value, 'timestamptz')).toBe(stringifyValue(value, 'timestamptz'))
    expect(formatCellValue(value, 'timestamptz')).toBe(`2026-08-09 17:30:00${OFFSET}`)
  })

  it('agrees with the editor about a date column', () => {
    const value = new Date(2026, 7, 9, 15, 30)
    expect(formatCellValue(value, 'date')).toBe(stringifyValue(value, 'date'))
  })

  it('leaves the offset off a plain timestamp, which carries no zone', () => {
    const value = new Date(2026, 7, 9, 15, 30)
    expect(formatCellValue(value, 'timestamp')).toBe('2026-08-09 15:30:00')
  })

  it('formats a date with no column type, as raw query results have none', () => {
    expect(formatCellValue(new Date(2026, 7, 9, 15, 30))).toBe('2026-08-09 15:30:00')
  })

  it('shows an invalid date as itself rather than crashing', () => {
    expect(formatCellValue(new Date('nope'))).toContain('Invalid Date')
  })
})

describe('stringifyDate', () => {
  it('keeps milliseconds only when there are some', () => {
    expect(stringifyDate(new Date(2026, 7, 9, 15, 30, 0, 0))).toBe('2026-08-09 15:30:00')
    expect(stringifyDate(new Date(2026, 7, 9, 15, 30, 0, 250))).toBe('2026-08-09 15:30:00.250')
  })
})

describe('isBinaryValue', () => {
  it('recognises bytes and nothing else', () => {
    expect(isBinaryValue(new Uint8Array([1]))).toBe(true)
    expect(isBinaryValue([1, 2])).toBe(false)
    expect(isBinaryValue('abc')).toBe(false)
    expect(isBinaryValue(null)).toBe(false)
  })
})

describe('isBlankString', () => {
  it('catches the strings that render as an empty cell', () => {
    expect(isBlankString('')).toBe(true)
    expect(isBlankString('   ')).toBe(true)
    expect(isBlankString('\t\n')).toBe(true)
  })

  it('leaves anything visible alone', () => {
    expect(isBlankString(' a ')).toBe(false)
    expect(isBlankString('0')).toBe(false)
    expect(isBlankString(null)).toBe(false)
    expect(isBlankString(0)).toBe(false)
  })
})

describe('formatNumber', () => {
  it('marks an unknown count rather than printing zero', () => {
    expect(formatNumber(null)).toBe('--')
    expect(formatNumber(undefined)).toBe('--')
    expect(formatNumber(0)).toBe('0')
  })
})

describe('shortServerVersion', () => {
  it('shortens each engine’s version banner', () => {
    expect(shortServerVersion('PostgreSQL 16.2 on aarch64-apple-darwin')).toBe('Postgres 16.2')
    expect(shortServerVersion('SQLite 3.53.4')).toBe('SQLite 3.53.4')
    expect(shortServerVersion('10.11.6-MariaDB-1:10.11.6+maria~ubu2204')).toBe('MariaDB 10.11.6')
    expect(shortServerVersion('8.0.36')).toBe('MySQL 8.0.36')
  })

  it('falls back to a clipped string for anything unrecognised', () => {
    expect(shortServerVersion('')).toBe('')
    expect(shortServerVersion('Some Other Engine')).toBe('Some Other Engine')
  })
})

describe('byte sizes', () => {
  it('steps through the units', () => {
    expect(formatBytes(512)).toBe('512 B')
    expect(formatBytes(2048)).toBe('2.0 kB')
    expect(formatBytes(3 * 1024 ** 2)).toBe('3.0 MB')
  })

  it('goes past a megabyte, which a database does routinely', () => {
    // "13312.0 MB" is a number nobody reads.
    expect(formatBytes(13 * 1024 ** 3)).toBe('13.0 GB')
    expect(formatBytes(2 * 1024 ** 4)).toBe('2.0 TB')
  })

  it('switches unit exactly at the boundary', () => {
    expect(formatBytes(1024 ** 3 - 1)).toContain('MB')
    expect(formatBytes(1024 ** 3)).toBe('1.0 GB')
  })
})
