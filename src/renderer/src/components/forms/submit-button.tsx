import * as React from 'react'
import { Button } from '@renderer/components/ui/button'
import { Spinner } from '@renderer/components/ui/spinner'

interface SubmitButtonProps extends React.ComponentProps<typeof Button> {
  isSubmitting?: boolean
  loadingText?: string
}

export function SubmitButton({
  isSubmitting,
  loadingText = 'Saving…',
  children,
  disabled,
  ...props
}: SubmitButtonProps) {
  return (
    <Button type="submit" disabled={isSubmitting || disabled} {...props}>
      {isSubmitting ? (
        <>
          <Spinner size={14} className="text-current" />
          {loadingText}
        </>
      ) : (
        children
      )}
    </Button>
  )
}
