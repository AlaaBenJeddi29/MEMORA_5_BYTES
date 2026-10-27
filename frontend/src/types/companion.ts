import type { Summary } from './summaries'

/** One summary the companion actually used, with a short stored excerpt. */
export interface CompanionSource {
  summary: Summary
  excerpt: string
}

/** Response from POST /api/summaries/companion/. */
export interface CompanionAnswer {
  answer: string
  reflection_questions: string[]
  insufficient_information: boolean
  sources: CompanionSource[]
}

export interface CompanionQuestionInput {
  question: string
}

export interface PatternLabel {
  name: string
  count: number
}

export interface PatternPeriod {
  start: string
  end: string
}

export interface PatternMonth {
  month: string
  count: number
  themes: string[]
  moods: string[]
}

/** Response from GET /api/summaries/patterns/ (stored data only, no AI). */
export interface EmotionalPatterns {
  has_data: boolean
  total_summaries: number
  period: PatternPeriod | null
  themes: PatternLabel[]
  moods: PatternLabel[]
  months: PatternMonth[]
  method: string
  limitations: string
}
