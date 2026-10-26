/**
 * TypeScript types for the audio feature.
 * Mirrors AudioEntrySerializer fields and the AI-state contract (§1.9).
 */

export type AudioStatus = 'pending' | 'processing' | 'succeeded' | 'failed'

export type AudioSentiment = 'positive' | 'negative' | 'neutral' | 'mixed' | null

export interface AudioEntry {
  id: number
  file: string
  duration_seconds: number | null

  // 1. Transcription
  transcript: string | null

  // 3. Language detection (LLM — Groq Whisper does not report the language)
  language_code: string | null
  language_name: string | null

  // 2. Sentiment analysis
  sentiment: AudioSentiment
  sentiment_score: number | null

  // 4. Summary
  summary: string | null

  // AI processing state
  status: AudioStatus
  error: string | null

  created_at: string
  updated_at: string
}
