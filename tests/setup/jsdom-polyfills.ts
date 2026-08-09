/**
 * jsdom is missing a handful of DOM APIs that Radix's floating components call
 * unconditionally — without these, rendering a Select or Popover throws inside
 * the component rather than failing an assertion.
 *
 * Applied to every spec; the guard makes it a no-op for the node-environment
 * ones.
 */
if (typeof window !== 'undefined') {
  if (!('ResizeObserver' in window)) {
    // Deliberately inert: nothing under test depends on resize callbacks, only
    // on the constructor existing.
    const noop = (): void => undefined
    window.ResizeObserver = class {
      observe = noop
      unobserve = noop
      disconnect = noop
    } as unknown as typeof ResizeObserver
  }

  if (!('DOMRect' in window)) {
    window.DOMRect = class {
      constructor(
        public x = 0,
        public y = 0,
        public width = 0,
        public height = 0
      ) {}
      get top(): number {
        return this.y
      }
      get left(): number {
        return this.x
      }
      get right(): number {
        return this.x + this.width
      }
      get bottom(): number {
        return this.y + this.height
      }
      static fromRect(): DOMRect {
        return new window.DOMRect()
      }
      toJSON(): unknown {
        return this
      }
    } as unknown as typeof DOMRect
  }

  // Pointer capture: Radix Select routes its open/close through these.
  Element.prototype.hasPointerCapture ??= () => false
  Element.prototype.setPointerCapture ??= () => undefined
  Element.prototype.releasePointerCapture ??= () => undefined
  Element.prototype.scrollIntoView ??= () => undefined
}
