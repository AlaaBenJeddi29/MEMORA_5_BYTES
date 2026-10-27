import { PageHeader } from '../../../components/PageHeader'
import { useDocumentTitle } from '../../../hooks/useDocumentTitle'
import { EmotionalPatterns } from '../components/EmotionalPatterns'
import { MemoryCompanion } from '../components/MemoryCompanion'
import '../companion.css'

export function MemoryCompanionPage() {
  useDocumentTitle('AI Memory Companion · MEMORA')

  return (
    <div className="companion-page">
      <PageHeader
        eyebrow="AI memory companion"
        title="AI Memory Companion"
        description="Ask about the memories you have already saved. Answers use only your summaries and their stored themes, moods, and dates. The companion never invents an event, a feeling, or a date."
      />

      <div className="companion-layout">
        <MemoryCompanion />
        <EmotionalPatterns />
      </div>
    </div>
  )
}
