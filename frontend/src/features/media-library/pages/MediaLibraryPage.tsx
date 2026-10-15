import { ModulePlaceholder } from '../../../components/ModulePlaceholder'
import { useDocumentTitle } from '../../../hooks/useDocumentTitle'

export function MediaLibraryPage() {
  useDocumentTitle('Media library · MEMORA')

  return (
    <ModulePlaceholder
      title="Media library"
      description="Photos and videos attached to your journal."
      plannedEndpoints={['GET / POST /api/media/', 'DELETE /api/media/{id}/']}
    />
  )
}
