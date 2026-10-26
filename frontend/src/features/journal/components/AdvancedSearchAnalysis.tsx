import type { AiAnalysis } from '../../../types/journal'

interface Props {
  analysis: AiAnalysis
}

export function AdvancedSearchAnalysis({ analysis }: Props) {
  if (!analysis.summary && !analysis.extracted_themes.length && !analysis.extracted_sentiments.length) {
    return null
  }
  return (
    <div className="ai-analysis-summary">
      <div className="analysis-header">
        <h3>AI Analysis</h3>
      </div>
      {analysis.summary && <p className="analysis-summary">{analysis.summary}</p>}
      <div className="analysis-details">
        {analysis.extracted_themes.length > 0 && (
          <div className="analysis-item">
            <span className="label">Themes</span>
            <div className="tags">
              {analysis.extracted_themes.map(t => <span key={t} className="tag theme-tag">{t}</span>)}
            </div>
          </div>
        )}
        {analysis.extracted_sentiments.length > 0 && (
          <div className="analysis-item">
            <span className="label">Sentiments</span>
            <div className="tags">
              {analysis.extracted_sentiments.map(s => <span key={s} className="tag sentiment-tag">{s}</span>)}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
