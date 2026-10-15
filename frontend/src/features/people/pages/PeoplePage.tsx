import { ModulePlaceholder } from '../../../components/ModulePlaceholder'
import { useDocumentTitle } from '../../../hooks/useDocumentTitle'

export function PeoplePage() {
  useDocumentTitle('People · MEMORA')

  return (
    <ModulePlaceholder
      title="People"
      description="The people who appear in your entries."
      plannedEndpoints={['GET / POST /api/people/']}
    />
  )
}
