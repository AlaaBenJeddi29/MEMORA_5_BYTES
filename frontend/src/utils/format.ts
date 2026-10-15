const dateTimeFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'medium',
  timeStyle: 'short',
})

/** Formats an ISO-8601 string (UTC) for display in the viewer's local time. */
export function formatDateTime(isoString: string): string {
  const date = new Date(isoString)
  if (Number.isNaN(date.getTime())) {
    return isoString
  }
  return dateTimeFormatter.format(date)
}
