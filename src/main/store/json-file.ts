import { randomUUID } from 'crypto'
import {
  closeSync,
  existsSync,
  fsyncSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  writeSync
} from 'fs'
import { format } from 'date-fns/format'

/**
 * Read and parse a store file. `undefined` means there is nothing to load: the
 * file does not exist, or it did not parse and has been moved aside.
 *
 * A parse failure used to read as empty state, and the next write then replaced
 * the file - so one torn write or stray edit cost every saved connection. The
 * bad bytes are now kept under `<name>.corrupt-<timestamp>` before the caller
 * starts over. Any other read error is thrown rather than treated as empty, for
 * the same reason: an empty read is a licence to overwrite.
 */
export function readJsonFile(path: string): unknown {
  let text: string
  try {
    text = readFileSync(path, 'utf8')
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return undefined
    throw err
  }
  try {
    return JSON.parse(text)
  } catch (err) {
    quarantineJsonFile(path, err instanceof Error ? err.message : String(err))
    return undefined
  }
}

/**
 * Move a store file aside so the next write cannot destroy it. For callers that
 * parsed the JSON but cannot recognise its shape - the same data-loss path as a
 * parse failure, one step later.
 */
export function quarantineJsonFile(path: string, reason: string): void {
  const stamp = format(new Date(), "yyyyMMdd'T'HHmmss")
  let target = `${path}.corrupt-${stamp}`
  for (let n = 1; existsSync(target); n++) target = `${path}.corrupt-${stamp}-${n}`
  // Not caught: if the file cannot be preserved, the store must not go on to
  // write over it.
  renameSync(path, target)
  console.error(`[store] ${path} could not be read (${reason}); kept it as ${target}`)
}

/**
 * Write via a temp file in the same directory and a rename, so a crash or a
 * full disk leaves either the old file or the new one - never half of either.
 * `0o600` because connections.json holds credentials, sealed or not.
 */
export function writeJsonFileAtomic(path: string, value: unknown, space?: number): void {
  const tmp = `${path}.${randomUUID()}.tmp`
  try {
    const fd = openSync(tmp, 'w', 0o600)
    try {
      writeSync(fd, JSON.stringify(value, null, space))
      fsyncSync(fd)
    } finally {
      closeSync(fd)
    }
    renameSync(tmp, path)
  } catch (err) {
    rmSync(tmp, { force: true })
    throw err
  }
}
