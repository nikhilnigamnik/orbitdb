import * as React from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import * as VisuallyHidden from '@radix-ui/react-visually-hidden'

export interface HeadingRegistry {
  registerTitle: () => () => void
  registerDescription: () => () => void
}

const HeadingRegistryContext = React.createContext<HeadingRegistry | null>(null)

interface DialogHeadingOptions {
  title?: string
  description?: string
  /** Used only when the caller gives no name at all, visible or hidden. */
  fallbackTitle: string
}

interface DialogHeading {
  /** Pass to `DialogHeadingScope` around the content, so a visible title can register. */
  registry: HeadingRegistry
  /** Visually hidden title and description, for content that renders neither. */
  hidden: React.ReactNode
  /** Spread on the Radix Content: drops aria-describedby when nothing describes it. */
  contentProps: { 'aria-describedby'?: undefined }
}

/**
 * Names a Radix dialog for screen readers. A panel that renders its own
 * `DialogTitle` / `DialogDescription` registers them, and the hidden copies
 * step aside - registration runs in a layout effect, so the swap lands before
 * paint and before Radix checks for a title.
 */
export function useDialogHeading({
  title,
  description,
  fallbackTitle
}: DialogHeadingOptions): DialogHeading {
  const [visibleTitles, setVisibleTitles] = React.useState(0)
  const [visibleDescriptions, setVisibleDescriptions] = React.useState(0)

  const registry = React.useMemo<HeadingRegistry>(
    () => ({
      registerTitle: () => {
        setVisibleTitles((n) => n + 1)
        return () => setVisibleTitles((n) => n - 1)
      },
      registerDescription: () => {
        setVisibleDescriptions((n) => n + 1)
        return () => setVisibleDescriptions((n) => n - 1)
      }
    }),
    []
  )

  const hasVisibleTitle = visibleTitles > 0
  const hasVisibleDescription = visibleDescriptions > 0
  const hiddenDescription = hasVisibleDescription ? undefined : description

  const hidden =
    hasVisibleTitle && !hiddenDescription ? null : (
      <VisuallyHidden.Root>
        {!hasVisibleTitle && (
          <DialogPrimitive.Title>{title ?? fallbackTitle}</DialogPrimitive.Title>
        )}
        {hiddenDescription && (
          <DialogPrimitive.Description>{hiddenDescription}</DialogPrimitive.Description>
        )}
      </VisuallyHidden.Root>
    )

  const isDescribed = hasVisibleDescription || Boolean(description)
  return {
    registry,
    hidden,
    contentProps: isDescribed ? {} : { 'aria-describedby': undefined }
  }
}

interface DialogHeadingScopeProps {
  registry: HeadingRegistry
  children: React.ReactNode
}

export function DialogHeadingScope({ registry, children }: DialogHeadingScopeProps) {
  return (
    <HeadingRegistryContext.Provider value={registry}>{children}</HeadingRegistryContext.Provider>
  )
}

/** A visible title that names the dialog or sheet it sits in. Takes `asChild`. */
export function DialogTitle(props: React.ComponentProps<typeof DialogPrimitive.Title>) {
  const registry = React.useContext(HeadingRegistryContext)
  React.useLayoutEffect(() => registry?.registerTitle(), [registry])
  return <DialogPrimitive.Title {...props} />
}

/** A visible description read after the title. Takes `asChild`. */
export function DialogDescription(props: React.ComponentProps<typeof DialogPrimitive.Description>) {
  const registry = React.useContext(HeadingRegistryContext)
  React.useLayoutEffect(() => registry?.registerDescription(), [registry])
  return <DialogPrimitive.Description {...props} />
}
