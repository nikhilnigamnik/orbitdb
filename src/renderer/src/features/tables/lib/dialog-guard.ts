/**
 * Whether a window-level shortcut belongs to the table view or to a dialog
 * sitting over it.
 *
 * Cmd+Z and Cmd+I listen on the window, so without this they fired through an
 * open sheet or confirm - undoing a grid edit the user could not even see.
 */

const DIALOG_SELECTOR = '[role="dialog"], [role="alertdialog"]'

// The sheets open with auto-focus prevented, so focus can still be sitting on
// the grid while one is up. An open modal therefore counts even when the key
// was not pressed inside it.
const OPEN_DIALOG_SELECTOR =
  '[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"]'

export function isDialogInTheWay(target: EventTarget | null, root: ParentNode = document): boolean {
  if (target instanceof Element && target.closest(DIALOG_SELECTOR)) return true
  return root.querySelector(OPEN_DIALOG_SELECTOR) != null
}
