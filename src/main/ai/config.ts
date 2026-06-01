// Read from .env (gitignored). electron-vite injects MAIN_VITE_* into the main
// process via import.meta.env; fall back to a real shell env var if set.
export const GROQ_API_KEY =
  import.meta.env.MAIN_VITE_GROQ_API_KEY ?? process.env.GROQ_API_KEY ?? ''

export const GROQ_MODEL = 'openai/gpt-oss-120b'

// Cap how much schema context we feed the model so prompts stay small/cheap.
export const MAX_SCHEMA_TABLES = 60
