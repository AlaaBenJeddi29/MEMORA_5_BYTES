import type {
  BookCoverStyleId,
  BookFontStyleId,
  BookPreferences,
  BookThemeId,
} from '../../types/bookPreferences'

export interface BookCoverStyleOption {
  id: BookCoverStyleId
  label: string
  description: string
}

export interface BookThemeOption {
  id: BookThemeId
  label: string
  description: string
}

export interface BookFontStyleOption {
  id: BookFontStyleId
  label: string
  description: string
}

export const BOOK_COVER_STYLES: readonly BookCoverStyleOption[] = [
  {
    id: 'classic',
    label: 'Classique',
    description: 'Reliure sobre, vert profond et dorures discrètes.',
  },
  {
    id: 'nature',
    label: 'Nature',
    description: 'Feuillages délicats sur lin sauge.',
  },
  {
    id: 'minimal',
    label: 'Minimaliste',
    description: 'Lignes fines et composition contemporaine.',
  },
  {
    id: 'travel',
    label: 'Voyage',
    description: 'Carnet d’exploration aux tons chauds.',
  },
  {
    id: 'memories',
    label: 'Souvenirs',
    description: 'Papier intimiste et détails chaleureux.',
  },
  {
    id: 'night',
    label: 'Nuit étoilée',
    description: 'Bleu profond et étoiles contemplatives.',
  },
]

export const BOOK_THEMES: readonly BookThemeOption[] = [
  {
    id: 'paper',
    label: 'Papier classique',
    description: 'Crème, beige et brun doux.',
  },
  {
    id: 'nature',
    label: 'Nature apaisante',
    description: 'Vert sauge et ivoire.',
  },
  {
    id: 'ocean',
    label: 'Océan',
    description: 'Bleu doux et blanc cassé.',
  },
  {
    id: 'blush',
    label: 'Rose poudré',
    description: 'Rose très léger et crème.',
  },
  {
    id: 'night',
    label: 'Nuit',
    description: 'Fond sombre et texte clair.',
  },
  {
    id: 'minimal',
    label: 'Minimaliste',
    description: 'Fond neutre et interface épurée.',
  },
]

export const BOOK_FONT_STYLES: readonly BookFontStyleOption[] = [
  {
    id: 'editorial',
    label: 'Éditorial',
    description: 'Serif classique, chaleureux et lisible.',
  },
  {
    id: 'modern',
    label: 'Contemporain',
    description: 'Sans-serif net et actuel.',
  },
  {
    id: 'handwritten',
    label: 'Manuscrit',
    description: 'Titres manuscrits, texte courant serif.',
  },
]

export const DEFAULT_BOOK_PREFERENCES: BookPreferences = {
  cover_style: 'classic',
  theme_id: 'paper',
  font_style: 'editorial',
}

const COVER_IDS = new Set<string>(BOOK_COVER_STYLES.map((option) => option.id))
const THEME_IDS = new Set<string>(BOOK_THEMES.map((option) => option.id))
const FONT_IDS = new Set<string>(BOOK_FONT_STYLES.map((option) => option.id))

function knownId<T extends string>(
  value: unknown,
  allowed: Set<string>,
  fallback: T,
): T {
  return typeof value === 'string' && allowed.has(value)
    ? (value as T)
    : fallback
}

/**
 * Keeps the book usable when the API is unavailable or returns an identifier
 * this build does not know: each unknown field falls back independently.
 */
export function normalizeBookPreferences(value: unknown): BookPreferences {
  if (!value || typeof value !== 'object') {
    return { ...DEFAULT_BOOK_PREFERENCES }
  }
  const record = value as Record<string, unknown>
  return {
    cover_style: knownId(
      record.cover_style,
      COVER_IDS,
      DEFAULT_BOOK_PREFERENCES.cover_style,
    ),
    theme_id: knownId(
      record.theme_id,
      THEME_IDS,
      DEFAULT_BOOK_PREFERENCES.theme_id,
    ),
    font_style: knownId(
      record.font_style,
      FONT_IDS,
      DEFAULT_BOOK_PREFERENCES.font_style,
    ),
  }
}

/** CSS scope classes shared by the real book and the dialog preview. */
export function bookThemeClassName(preferences: BookPreferences): string {
  return [
    `book-theme--${preferences.theme_id}`,
    `book-font--${preferences.font_style}`,
    `book-cover-style--${preferences.cover_style}`,
  ].join(' ')
}
