import { describe, expect, it } from 'vitest'

import { ApiError } from '../../services/errors'
import type { JournalEntry } from '../../types/journal'
import type { Summary } from '../../types/summaries'
import {
  buildJournalArtPrompt,
  classifyGenerationFailure,
  resolveArtPrompt,
} from './artHelpers'
import { MAX_PROMPT_LENGTH } from './mediaHelpers'

function entry(overrides: Partial<JournalEntry> = {}): JournalEntry {
  return {
    id: 2,
    user: 1,
    title: 'Morning walk',
    text: 'A private body that must never be sent.',
    audio_file: '',
    summary_text: 'A calm walk before breakfast.',
    sentiment: '',
    created_at: '2026-09-15T08:00:00Z',
    photos: [],
    ...overrides,
  }
}

function summary(overrides: Partial<Summary> = {}): Summary {
  return {
    id: 3,
    owner: 1,
    journal_entry_id: 2,
    summary_text: 'A calm walk before breakfast.',
    mood: 'calm',
    themes: ['nature'],
    illustration_prompt: 'A quiet park path at sunrise.',
    created_at: '2026-09-15T09:00:00Z',
    updated_at: '2026-09-15T09:00:00Z',
    ...overrides,
  }
}

describe('buildJournalArtPrompt', () => {
  it('mirrors the server title-and-recap prompt', () => {
    expect(buildJournalArtPrompt(entry())).toBe(
      'Illustrate this journal memory titled "Morning walk". A calm walk before breakfast.',
    )
  })

  it('normalizes whitespace and never includes the entry body', () => {
    const prompt = buildJournalArtPrompt(
      entry({
        title: '  Morning\n walk  ',
        summary_text: 'A calm   walk\tbefore breakfast.',
      }),
    )
    expect(prompt).toBe(
      'Illustrate this journal memory titled "Morning walk". A calm walk before breakfast.',
    )
    expect(prompt).not.toContain('private body')
  })

  it('works with a title only or a recap only', () => {
    expect(buildJournalArtPrompt(entry({ summary_text: '' }))).toBe(
      'Illustrate this journal memory titled "Morning walk".',
    )
    expect(buildJournalArtPrompt(entry({ title: '' }))).toBe(
      'A calm walk before breakfast.',
    )
  })

  it('is empty without a title or recap', () => {
    expect(buildJournalArtPrompt(entry({ title: '', summary_text: '' }))).toBe('')
  })

  it('caps the prompt at the server maximum', () => {
    const prompt = buildJournalArtPrompt(
      entry({ title: '', summary_text: 'x'.repeat(MAX_PROMPT_LENGTH + 40) }),
    )
    expect(prompt).toHaveLength(MAX_PROMPT_LENGTH)
  })
})

describe('resolveArtPrompt', () => {
  it('lets an explicit prompt win over the summary and entry', () => {
    expect(
      resolveArtPrompt('  A hand-written scene  ', summary(), entry(), true),
    ).toEqual({
      prompt: 'A hand-written scene',
      source: 'manual',
      label: 'Your edited prompt',
    })
  })

  it('uses the saved summary prompt before the journal recap', () => {
    expect(resolveArtPrompt('', summary(), entry(), true)).toEqual({
      prompt: 'A quiet park path at sunrise.',
      source: 'summary',
      label: 'Saved illustration prompt from Summary #3',
    })
  })

  it('does not silently fall back to the journal when the summary prompt is empty', () => {
    expect(
      resolveArtPrompt('', summary({ illustration_prompt: '' }), entry(), true),
    ).toEqual({
      prompt: '',
      source: 'summary_missing',
      label: 'This summary has no saved illustration prompt.',
    })
  })

  it('uses the journal title and recap when no summary is selected', () => {
    expect(resolveArtPrompt('', null, entry(), false)).toEqual({
      prompt:
        'Illustrate this journal memory titled "Morning walk". A calm walk before breakfast.',
      source: 'journal',
      label: 'Built from the journal title and recap',
    })
  })

  it('reports an unillustratable journal entry', () => {
    expect(
      resolveArtPrompt('', null, entry({ title: '', summary_text: '' }), false),
    ).toEqual({
      prompt: '',
      source: 'journal_empty',
      label: 'This memory has no title or recap to illustrate.',
    })
  })

  it('returns nothing without a source', () => {
    expect(resolveArtPrompt('', null, null, false)).toEqual({
      prompt: '',
      source: 'none',
      label: '',
    })
  })
})

describe('classifyGenerationFailure', () => {
  it('distinguishes a missing ComfyUI configuration', () => {
    const failure = classifyGenerationFailure(
      new ApiError(503, { detail: 'Image generation is not configured.' }),
    )
    expect(failure?.kind).toBe('configuration')
    expect(failure?.guidance).toContain('COMFYUI_CHECKPOINT')
  })

  it('explains an offline ComfyUI service', () => {
    const failure = classifyGenerationFailure(
      new ApiError(503, {
        detail: 'The local image generation service is unavailable.',
      }),
    )
    expect(failure?.kind).toBe('unavailable')
    expect(failure?.guidance).toContain('COMFYUI_BASE_URL')
  })

  it('maps timeouts and provider failures to local guidance', () => {
    expect(
      classifyGenerationFailure(
        new ApiError(504, { detail: 'Image generation timed out. Try again.' }),
      )?.kind,
    ).toBe('timeout')
    expect(
      classifyGenerationFailure(new ApiError(502, { detail: 'failed' }))?.kind,
    ).toBe('failed')
  })

  it('maps network failures and ignores ordinary validation errors', () => {
    expect(classifyGenerationFailure(new TypeError('Failed to fetch'))?.kind).toBe(
      'network',
    )
    expect(
      classifyGenerationFailure(
        new ApiError(400, { summary_id: ['Summary not found.'] }),
      ),
    ).toBeNull()
  })
})
