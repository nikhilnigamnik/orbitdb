import { useCallback, useState } from 'react'

export function useDisclosure(initial = false): {
  isOpen: boolean
  open: () => void
  close: () => void
  toggle: () => void
} {
  const [isOpen, setIsOpen] = useState(initial)
  const open = useCallback(() => setIsOpen(true), [])
  const close = useCallback(() => setIsOpen(false), [])
  const toggle = useCallback(() => setIsOpen((v) => !v), [])
  return { isOpen, open, close, toggle }
}
