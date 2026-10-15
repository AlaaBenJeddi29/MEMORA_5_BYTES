import { ModulePlaceholder } from '../../../components/ModulePlaceholder'
import { useDocumentTitle } from '../../../hooks/useDocumentTitle'

export function JournalListPage() {
  useDocumentTitle('Journal · MEMORA')

  return (
    <ModulePlaceholder
      title="Journal"
      description="Write and revisit text entries."
      plannedEndpoints={[
        'GET / POST /api/journal/entries/',
        'GET / PATCH / DELETE /api/journal/entries/{id}/',
      ]}
    />
  )
}
