// Cap how much schema context we feed the model so prompts stay small/cheap.
// Which tables fill it is decided by relevance to the request (schema-relevance.ts).
export const MAX_SCHEMA_TABLES = 60

// Tables read as candidates for those 60 before the remaining schemas are left
// unread. Far above any one schema; it only bounds a database with hundreds.
export const MAX_CANDIDATE_TABLES = 2_000

// SQL handed to the model to revise, fix or explain. Generous for a hand-written
// query, but a pasted migration of thousands of lines is cut rather than sent
// whole - the model is told when that happened.
export const MAX_SQL_CHARS = 20_000

// Enum labels are what stop the model guessing 'update' for an 'Update' label, so
// they earn their tokens - but an enum longer than this is a lookup table in
// disguise and would crowd out the rest of the table description.
export const MAX_ENUM_LABELS = 24

// A hung model call would otherwise leave the UI spinning with nothing to
// cancel - the same reason the D1 driver has one.
export const AI_REQUEST_TIMEOUT_MS = 60_000

// Schemas fetched at once when building the whole-database map. Each one is
// several catalogue queries - and on D1 several HTTPS calls per table - so a
// database with dozens of schemas must not fire them all together.
export const SCHEMA_FETCH_CONCURRENCY = 4
