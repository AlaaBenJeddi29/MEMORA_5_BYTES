const peopleDateTimeFormatter = new Intl.DateTimeFormat('fr-FR', {
  dateStyle: 'medium',
  timeStyle: 'short',
})

/** French timestamp used across the French-language people module. */
export function formatPeopleDateTime(isoString: string): string {
  const date = new Date(isoString)
  if (Number.isNaN(date.getTime())) {
    return isoString
  }
  return peopleDateTimeFormatter.format(date)
}
