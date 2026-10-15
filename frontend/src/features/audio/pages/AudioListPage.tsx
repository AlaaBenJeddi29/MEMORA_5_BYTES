import { ModulePlaceholder } from '../../../components/ModulePlaceholder'
import { useDocumentTitle } from '../../../hooks/useDocumentTitle'

export function AudioListPage() {
  useDocumentTitle('Audio & voice memos · MEMORA')

  return (
    <ModulePlaceholder
      title="Audio & voice memos"
      description="Record and store voice memos."
      plannedEndpoints={['POST /api/audio/', 'GET /api/audio/{id}/']}
    />
  )
}
