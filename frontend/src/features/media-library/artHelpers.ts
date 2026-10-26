import { ApiError } from '../../services/errors'
import type { JournalEntry } from '../../types/journal'
import type { Summary } from '../../types/summaries'
import { MAX_PROMPT_LENGTH } from './mediaHelpers'

export type ArtPromptSource =
  | 'manual'
  | 'summary'
  | 'journal'
  | 'summary_missing'
  | 'journal_empty'
  | 'none'

export interface ArtPromptResolution {
  prompt: string
  source: ArtPromptSource
  label: string
}

/**
 * Mirrors the server's ``build_journal_prompt`` so the user can review the
 * title-and-recap prompt before generating. Only the title and recap are used;
 * the entry body is never part of this prompt.
 */
export function buildJournalArtPrompt(entry: JournalEntry): string {
  const title = entry.title.replace(/\s+/g, ' ').trim()
  const recap = entry.summary_text.replace(/\s+/g, ' ').trim()

  const parts: string[] = []
  if (title) {
    parts.push(`Illustrate this journal memory titled "${title}".`)
  }
  if (recap) {
    parts.push(recap)
  }

  return parts.join(' ').slice(0, MAX_PROMPT_LENGTH).trimEnd()
}

/**
 * The prompt the server will use, following its precedence:
 * manual prompt → summary illustration prompt → journal title and recap.
 * A selected summary never falls back to the journal when its prompt is empty,
 * matching the server's validation.
 */
export function resolveArtPrompt(
  manualPrompt: string,
  selectedSummary: Summary | null,
  selectedEntry: JournalEntry | null,
  summarySelected: boolean,
): ArtPromptResolution {
  const manual = manualPrompt.trim()
  if (manual) {
    return { prompt: manual, source: 'manual', label: 'Your edited prompt' }
  }

  if (summarySelected) {
    if (!selectedSummary) {
      return { prompt: '', source: 'none', label: '' }
    }
    const saved = selectedSummary.illustration_prompt.trim()
    if (saved) {
      return {
        prompt: saved,
        source: 'summary',
        label: `Saved illustration prompt from Summary #${selectedSummary.id}`,
      }
    }
    return {
      prompt: '',
      source: 'summary_missing',
      label: 'This summary has no saved illustration prompt.',
    }
  }

  if (selectedEntry) {
    const built = buildJournalArtPrompt(selectedEntry)
    if (built) {
      return {
        prompt: built,
        source: 'journal',
        label: 'Built from the journal title and recap',
      }
    }
    return {
      prompt: '',
      source: 'journal_empty',
      label: 'This memory has no title or recap to illustrate.',
    }
  }

  return { prompt: '', source: 'none', label: '' }
}

export type GenerationFailureKind =
  | 'configuration'
  | 'unavailable'
  | 'timeout'
  | 'failed'
  | 'network'

export interface GenerationFailure {
  kind: GenerationFailureKind
  title: string
  guidance: string
}

function errorDetail(data: unknown): string {
  if (!data || typeof data !== 'object') {
    return ''
  }
  const detail = (data as Record<string, unknown>).detail
  return typeof detail === 'string' ? detail : ''
}

/**
 * Turns a failed generation into local, actionable guidance. Prompts and
 * provider response bodies are never echoed here; only the server's safe
 * detail strings and HTTP status are inspected.
 */
export function classifyGenerationFailure(
  error: unknown,
): GenerationFailure | null {
  if (error instanceof TypeError) {
    return {
      kind: 'network',
      title: 'We couldn’t reach MEMORA',
      guidance:
        'Check your connection and try again. Nothing was generated or saved.',
    }
  }

  if (!(error instanceof ApiError)) {
    return null
  }

  if (error.status === 503) {
    const detail = errorDetail(error.data)
    if (/not configured/i.test(detail)) {
      return {
        kind: 'configuration',
        title: 'ComfyUI isn’t configured',
        guidance:
          'The server has no local checkpoint or workflow. Set COMFYUI_CHECKPOINT (and COMFYUI_WORKFLOW_PATH if needed), restart Django, then try again. Nothing was saved.',
      }
    }
    return {
      kind: 'unavailable',
      title: 'ComfyUI isn’t reachable',
      guidance:
        'Start the local ComfyUI service at COMFYUI_BASE_URL, then try again. Your memory is unchanged and nothing was saved.',
    }
  }

  if (error.status === 504) {
    return {
      kind: 'timeout',
      title: 'ComfyUI took too long',
      guidance:
        'The local model did not finish in time. Try a smaller size or fewer steps. Nothing was saved.',
    }
  }

  if (error.status === 502) {
    return {
      kind: 'failed',
      title: 'ComfyUI couldn’t finish the artwork',
      guidance:
        'Check that the configured checkpoint exists and the workflow is valid, then try again. Nothing was saved.',
    }
  }

  return null
}
