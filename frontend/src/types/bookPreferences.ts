/** Stable identifiers accepted by GET/PUT /api/summaries/book-preferences/. */

export type BookCoverStyleId =
  | 'classic'
  | 'nature'
  | 'minimal'
  | 'travel'
  | 'memories'
  | 'night'

export type BookThemeId =
  | 'paper'
  | 'nature'
  | 'ocean'
  | 'blush'
  | 'night'
  | 'minimal'

export type BookFontStyleId = 'editorial' | 'modern' | 'handwritten'

export interface BookPreferences {
  cover_style: BookCoverStyleId
  theme_id: BookThemeId
  font_style: BookFontStyleId
}
