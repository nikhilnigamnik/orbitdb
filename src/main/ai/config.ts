// Cap how much schema context we feed the model so prompts stay small/cheap.
export const MAX_SCHEMA_TABLES = 60

// A hung model call would otherwise leave the UI spinning with nothing to
// cancel — the same reason the D1 driver has one.
export const AI_REQUEST_TIMEOUT_MS = 60_000
