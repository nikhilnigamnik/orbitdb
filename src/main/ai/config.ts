// Cap how much schema context we feed the model so prompts stay small/cheap.
export const MAX_SCHEMA_TABLES = 60

// Enum labels are what stop the model guessing 'update' for an 'Update' label, so
// they earn their tokens - but an enum longer than this is a lookup table in
// disguise and would crowd out the rest of the table description.
export const MAX_ENUM_LABELS = 24

// A hung model call would otherwise leave the UI spinning with nothing to
// cancel - the same reason the D1 driver has one.
export const AI_REQUEST_TIMEOUT_MS = 60_000
