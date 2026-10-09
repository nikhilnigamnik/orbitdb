import { differenceInDays, differenceInHours, differenceInMinutes, format } from 'date-fns'

/**
 * A short "how long ago" for a log row: "just now", "5m ago", "3h ago",
 * "2d ago", then a date. date-fns' formatDistanceToNow reads better in prose
 * but runs to "less than a minute ago", which a table column truncates.
 */
export function formatShortAgo(date: Date, now: Date = new Date()): string {
  const minutes = differenceInMinutes(now, date)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = differenceInHours(now, date)
  if (hours < 24) return `${hours}h ago`
  const days = differenceInDays(now, date)
  if (days < 7) return `${days}d ago`
  return format(date, 'd MMM yyyy')
}

/** The exact moment, for the hover title behind the short form. */
export function formatExactTime(date: Date): string {
  return format(date, 'd MMM yyyy, HH:mm:ss')
}
