// Read from .env (gitignored). electron-vite injects MAIN_VITE_* into the main
// process via import.meta.env; fall back to a real shell env var if set.
export const GROQ_API_KEY = import.meta.env.MAIN_VITE_GROQ_API_KEY ?? process.env.GROQ_API_KEY ?? ''

// Managed AI proxy (ai-proxy/). When a URL is set we route AI calls through the
// Worker — it holds the real Groq key server-side, so distributed builds ship
// only the device token, never the key itself. URL ends in /v1; the token is
// sent as the Bearer credential and swapped for the real key by the Worker.
export const AI_PROXY_URL = import.meta.env.MAIN_VITE_AI_PROXY_URL ?? process.env.AI_PROXY_URL ?? ''

export const AI_PROXY_TOKEN =
  import.meta.env.MAIN_VITE_AI_PROXY_TOKEN ?? process.env.AI_PROXY_TOKEN ?? ''

export const IS_PROXY_ENABLED = AI_PROXY_URL !== ''

export const GROQ_MODEL = 'openai/gpt-oss-120b'

// Cap how much schema context we feed the model so prompts stay small/cheap.
export const MAX_SCHEMA_TABLES = 60

// A hung model call would otherwise leave the UI spinning with nothing to
// cancel — the same reason the D1 driver has one.
export const AI_REQUEST_TIMEOUT_MS = 60_000
