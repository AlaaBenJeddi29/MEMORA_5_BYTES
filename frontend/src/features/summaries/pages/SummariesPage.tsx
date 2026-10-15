import { ModulePlaceholder } from '../../../components/ModulePlaceholder'
import { useDocumentTitle } from '../../../hooks/useDocumentTitle'

export function SummariesPage() {
  useDocumentTitle('Summaries · MEMORA')

  return (
    <ModulePlaceholder
      title="Summaries"
      description="AI-generated recaps of your entries (future)."
      plannedEndpoints={['POST /api/summaries/generate/', 'GET /api/summaries/']}
    />
  )
}
