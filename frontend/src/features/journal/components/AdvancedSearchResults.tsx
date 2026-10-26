import type { JournalEntry } from '../../../types/journal'
import { Button } from '../../../components/Button'
import { EmptyState } from '../../../components/EmptyState'
import type { AdvancedSearchResponse } from '../../../services/advancedSearch'

export interface AdvancedSearchResultsProps {
  results: AdvancedSearchResponse | null
  onEdit: (entry: JournalEntry) => void
  onDelete: (id: number) => void
  isLoading?: boolean
}

export function AdvancedSearchResults({
  results,
  onEdit,
  onDelete,
  isLoading = false,
}: AdvancedSearchResultsProps) {
  if (isLoading) {
    return (
      <div className="search-results-loading">
        <p>🔍 Searching...</p>
      </div>
    )
  }

  if (!results || results.results.length === 0) {
    return (
      <EmptyState
        title="No results found"
        description="Try a different search query or adjust your filters"
      />
    )
  }

  return (
    <div className="advanced-search-results">
      {/* AI Analysis Summary */}
      {results.ai_analysis && (
        <div className="ai-analysis-summary">
          <div className="analysis-header">
            <h3>🤖 AI Analysis</h3>
          </div>
          
          {results.ai_analysis.summary && (
            <p className="analysis-summary">{results.ai_analysis.summary}</p>
          )}

          <div className="analysis-details">
            {results.ai_analysis.extracted_sentiments.length > 0 && (
              <div className="analysis-item">
                <span className="label">Sentiments:</span>
                <div className="tags">
                  {results.ai_analysis.extracted_sentiments.map((s) => (
                    <span key={s} className="tag sentiment-tag">
                      💭 {s}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {results.ai_analysis.extracted_themes.length > 0 && (
              <div className="analysis-item">
                <span className="label">Themes:</span>
                <div className="tags">
                  {results.ai_analysis.extracted_themes.slice(0, 5).map((t) => (
                    <span key={t} className="tag theme-tag">
                      🏷️ {t}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Results Count */}
      <div className="results-header">
        <h3>
          Found <span className="result-count">{results.total}</span> entries
        </h3>
      </div>

      {/* Results List */}
      <div className="search-results-list">
        {results.results.map((entry) => (
          <article key={entry.id} className="search-result-card">
            <div className="result-header">
              <h4 className="result-title">{entry.title}</h4>
              <time className="result-date" dateTime={entry.created_at}>
                {new Date(entry.created_at).toLocaleDateString('fr-FR', {
                  weekday: 'short',
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                })}
              </time>
            </div>

            <p className="result-preview">
              {entry.text.substring(0, 300)}
              {entry.text.length > 300 ? '…' : ''}
            </p>

            {entry.sentiment && (
              <div className="result-meta">
                <span className="result-sentiment">💭 {entry.sentiment}</span>
              </div>
            )}

            <div className="result-actions">
              <Button
                onClick={() => onEdit(entry)}
                disabled={isLoading}
                variant="secondary"
                size="sm"
              >
                ✏️ Edit
              </Button>
              <Button
                onClick={() => {
                  if (confirm('Delete this entry?')) {
                    onDelete(entry.id)
                  }
                }}
                disabled={isLoading}
                variant="secondary"
                size="sm"
              >
                🗑️ Delete
              </Button>
            </div>
          </article>
        ))}
      </div>
    </div>
  )
}
