/**
 * Keyboard focus for controls that otherwise set `outline-none`: a solid 2px
 * accent outline clear of the control's edge, which holds 3:1 against the
 * canvas where the old translucent halo managed under 2:1. `outline-solid` is
 * load-bearing - `outline-none` sets the style variable `outline-2` reads.
 */
export const FOCUS_RING =
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-solid focus-visible:outline-accent'

/** Keyboard focus for fields: the accent border thickened to a 2px edge. */
export const FIELD_FOCUS =
  'focus-visible:border-accent focus-visible:ring-1 focus-visible:ring-accent'
