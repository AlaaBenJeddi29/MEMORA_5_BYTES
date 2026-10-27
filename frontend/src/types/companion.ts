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

export type CompanionVoiceGender = 'feminine' | 'masculine'
export type CompanionVoiceLanguage = 'fr-FR' | 'en-US'
export type CompanionVoiceRate = 0.75 | 1 | 1.25 | 1.5

/** Portable voice settings stored per user; the device voice is resolved locally. */
export interface CompanionVoicePreference {
  gender: CompanionVoiceGender
  language: CompanionVoiceLanguage
  rate: CompanionVoiceRate
}
