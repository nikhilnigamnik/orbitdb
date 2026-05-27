import { safeStorage } from 'electron'

const ENC_PREFIX = 'enc:v1:'

let availabilityChecked = false
let encryptionAvailable = false

function checkAvailability(): boolean {
  if (availabilityChecked) return encryptionAvailable
  availabilityChecked = true
  try {
    encryptionAvailable = safeStorage.isEncryptionAvailable()
  } catch {
    encryptionAvailable = false
  }
  if (!encryptionAvailable) {
    console.warn(
      '[connections-store] safeStorage unavailable on this system; ' +
        'credentials will fall back to plaintext on disk.'
    )
  }
  return encryptionAvailable
}

export function isEncryptionAvailable(): boolean {
  return checkAvailability()
}

export function isEncrypted(value: unknown): value is string {
  return typeof value === 'string' && value.startsWith(ENC_PREFIX)
}

export function encryptString(plain: string): string {
  if (!plain) return plain
  if (isEncrypted(plain)) return plain
  if (!checkAvailability()) return plain
  const buf = safeStorage.encryptString(plain)
  return ENC_PREFIX + buf.toString('base64')
}

export function decryptString(value: string): string {
  if (!isEncrypted(value)) return value
  if (!checkAvailability()) return ''
  try {
    const buf = Buffer.from(value.slice(ENC_PREFIX.length), 'base64')
    return safeStorage.decryptString(buf)
  } catch (err) {
    console.error('[connections-store] decryption failed:', err)
    return ''
  }
}
