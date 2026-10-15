import { Alert } from './Alert'
import { EmptyState } from './EmptyState'
import { PageHeader } from './PageHeader'
import { StatusBadge } from './StatusBadge'

export type ModulePlaceholderProps = {
  title: string
  description: string
  /** Endpoints proposed in docs/API_CONTRACT.md, shown as planned-only. */
  plannedEndpoints?: string[]
}

/**
 * A consistent "not built yet" shell shared by every business module. Each
 * module has no backend models or endpoints today, so this renders an honest
 * empty state and a note that data features arrive only once the API exists.
 */
export function ModulePlaceholder({ title, description, plannedEndpoints = [] }: ModulePlaceholderProps) {
  return (
    <>
      <PageHeader
        title={title}
        description={description}
        badge={<StatusBadge status="neutral">Not built yet</StatusBadge>}
      />

      <div className="stack">
        <Alert variant="info" title="Under construction">
          This module has no backend API yet, so it can’t load or save anything. Its data features
          will become available once the backend endpoints are implemented — nothing on this page
          is real data.
        </Alert>

        <EmptyState
          title="Nothing to show yet"
          description={`Once the ${title} API is implemented, your content will appear here.`}
        />

        {plannedEndpoints.length > 0 && (
          <div className="placeholder">
            <h2>Planned endpoints</h2>
            <p className="muted">
              Proposed in <code>docs/API_CONTRACT.md</code> — not available yet. Do not call these.
            </p>
            <ul className="placeholder__endpoints">
              {plannedEndpoints.map((endpoint) => (
                <li key={endpoint}>
                  <code>{endpoint}</code>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </>
  )
}
