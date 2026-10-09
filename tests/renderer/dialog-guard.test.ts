// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { isDialogInTheWay } from '@renderer/features/tables/lib/dialog-guard'

afterEach(() => {
  document.body.innerHTML = ''
})

describe('isDialogInTheWay', () => {
  it('lets a key on the page through when nothing is open', () => {
    document.body.innerHTML = '<div id="grid"></div>'
    expect(isDialogInTheWay(document.getElementById('grid'))).toBe(false)
  })

  it.each(['dialog', 'alertdialog'])('stops a key pressed inside a %s', (role) => {
    document.body.innerHTML = `<div role="${role}"><button id="inside"></button></div>`
    expect(isDialogInTheWay(document.getElementById('inside'))).toBe(true)
  })

  it('stops a key aimed at the page while a sheet is open over it', () => {
    // The sheets open without moving focus, so the target can still be the grid.
    document.body.innerHTML =
      '<div id="grid"></div><div role="dialog" data-state="open"><input /></div>'
    expect(isDialogInTheWay(document.getElementById('grid'))).toBe(true)
  })

  it('ignores a dialog that is closing', () => {
    document.body.innerHTML = '<div id="grid"></div><div role="dialog" data-state="closed"></div>'
    expect(isDialogInTheWay(document.getElementById('grid'))).toBe(false)
  })

  it('copes with a key dispatched at the document', () => {
    expect(isDialogInTheWay(document)).toBe(false)
  })
})
