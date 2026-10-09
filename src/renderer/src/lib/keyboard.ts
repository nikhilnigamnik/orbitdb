/** True when a keystroke belongs to whatever the user is typing into. */
export function isTyping(target: EventTarget | null): boolean {
  // An instanceof check rather than a cast: a keydown can be dispatched at the
  // document, which has neither `tagName` nor `closest`.
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName
  return (
    tag === 'INPUT' ||
    tag === 'TEXTAREA' ||
    tag === 'SELECT' ||
    target.isContentEditable ||
    // The SQL editor is a contenteditable inside this class rather than a
    // textarea, and a single-character shortcut is something someone may well
    // be typing.
    target.closest('.cm-editor') != null
  )
}

/** True while a modal, sheet or menu owns the keyboard. */
export function hasOpenOverlay(root: ParentNode = document): boolean {
  return (
    root.querySelector(
      '[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"], [role="menu"][data-state="open"]'
    ) != null
  )
}
