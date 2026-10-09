import { describe, expect, it } from 'vitest'
import { CSV_BOM, escapeCsvField, normalizeCell, toCsv } from '@renderer/lib/export'

describe('escapeCsvField', () => {
  it('leaves plain text and numbers alone', () => {
    expect(escapeCsvField('Ada')).toBe('Ada')
    expect(escapeCsvField(42)).toBe('42')
    expect(escapeCsvField(true)).toBe('true')
  })

  it('writes NULL as an empty field', () => {
    expect(escapeCsvField(null)).toBe('')
  })

  it('quotes fields holding a comma, a quote or a line break, doubling the quotes', () => {
    expect(escapeCsvField('a,b')).toBe('"a,b"')
    expect(escapeCsvField('say "hi"')).toBe('"say ""hi"""')
    expect(escapeCsvField('one\ntwo')).toBe('"one\ntwo"')
  })

  it.each(['=1+1', '+SUM(A1)', '-2+3', '@cmd', '\tx', '\rx'])(
    'neutralises %j, which a spreadsheet would run as a formula',
    (value) => {
      expect(escapeCsvField(value).replace(/^"/, '')).toMatch(/^'/)
    }
  )

  it('quotes a neutralised field that also needs quoting', () => {
    expect(escapeCsvField('=HYPERLINK("http://x","y")')).toBe('"\'=HYPERLINK(""http://x"",""y"")"')
  })

  it('does not touch a negative number, even one that arrived as text', () => {
    // pg returns numeric and bigint as strings.
    expect(escapeCsvField(-5)).toBe('-5')
    expect(escapeCsvField('-12.50')).toBe('-12.50')
    expect(escapeCsvField('+3e10')).toBe('+3e10')
  })
})

describe('normalizeCell', () => {
  it('turns NULL and undefined into null', () => {
    expect(normalizeCell(null)).toBeNull()
    expect(normalizeCell(undefined)).toBeNull()
  })

  it('writes bigints and dates as text', () => {
    expect(normalizeCell(BigInt('9007199254740993'))).toBe('9007199254740993')
    expect(normalizeCell(new Date('2026-01-02T03:04:05.000Z'))).toBe('2026-01-02T03:04:05.000Z')
  })

  it('writes objects as JSON, with bigints inside them as text', () => {
    expect(normalizeCell({ a: 1, b: BigInt(2) })).toBe('{"a":1,"b":"2"}')
  })

  it('keeps primitives as they are', () => {
    expect(normalizeCell('x')).toBe('x')
    expect(normalizeCell(1.5)).toBe(1.5)
    expect(normalizeCell(false)).toBe(false)
  })
})

describe('toCsv', () => {
  it('starts with a BOM so Excel reads it as UTF-8', () => {
    expect(toCsv([{ a: 1 }]).startsWith(CSV_BOM)).toBe(true)
  })

  it('writes a header, then one CRLF-separated line per row in column order', () => {
    const csv = toCsv(
      [
        { id: 1, name: 'Ada', note: null },
        { id: 2, name: '=cmd', note: 'a,b' }
      ],
      ['name', 'id', 'note']
    )
    expect(csv.slice(CSV_BOM.length)).toBe('name,id,note\r\nAda,1,\r\n\'=cmd,2,"a,b"')
  })

  it('takes the header from the rows when no columns are given', () => {
    expect(toCsv([{ a: 1 }, { b: 2 }]).slice(CSV_BOM.length)).toBe('a,b\r\n1,\r\n,2')
  })
})
