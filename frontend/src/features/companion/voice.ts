import type {
  CompanionVoiceGender,
  CompanionVoiceLanguage,
  CompanionVoicePreference,
  CompanionVoiceRate,
} from '../../types/companion'

export const ANSWER_SPEECH_KEY = 'companion:answer'

export const VOICE_RATES: readonly CompanionVoiceRate[] = [0.75, 1, 1.25, 1.5]

export const VOICE_LANGUAGES: readonly {
  value: CompanionVoiceLanguage
  label: string
}[] = [
  { value: 'fr-FR', label: 'Français' },
  { value: 'en-US', label: 'English' },
]

export const VOICE_GENDER_LABELS: Record<CompanionVoiceGender, string> = {
  feminine: 'féminine',
  masculine: 'masculine',
}

export const VOICE_LANGUAGE_LABELS: Record<CompanionVoiceLanguage, string> = {
  'fr-FR': 'français',
  'en-US': 'English',
}

const VOICE_LANGUAGE_ADJECTIVES: Record<CompanionVoiceLanguage, string> = {
  'fr-FR': 'française',
  'en-US': 'anglaise',
}

export const DEFAULT_COMPANION_VOICE: CompanionVoicePreference = {
  gender: 'feminine',
  language: 'fr-FR',
  rate: 1,
}

const PREVIEW_TEXT: Record<CompanionVoiceLanguage, string> = {
  'fr-FR':
    'Bonjour. Je suis votre compagnon de souvenirs. Prenons un instant pour écouter ensemble.',
  'en-US':
    'Hello. I am your memory companion. Let us take a moment to listen together.',
}

/**
 * Conservative voice-name hints. The Web Speech API does not expose gender, so
 * only names that clearly identify a voice are classified. Anything else stays
 * unknown and is never presented as feminine or masculine.
 */
const FEMININE_VOICE_NAMES = new Set([
  'amelie',
  'aria',
  'ashley',
  'audrey',
  'aurelie',
  'ava',
  'brigitte',
  'celine',
  'charlotte',
  'chloe',
  'claire',
  'cora',
  'elizabeth',
  'emma',
  'hortense',
  'jenny',
  'julie',
  'karen',
  'katja',
  'michelle',
  'moira',
  'monica',
  'nancy',
  'samantha',
  'sara',
  'serena',
  'sonia',
  'tessa',
  'victoria',
  'zira',
])

const MASCULINE_VOICE_NAMES = new Set([
  'alain',
  'alex',
  'antoine',
  'arnaud',
  'benjamin',
  'brian',
  'bruno',
  'christophe',
  'christopher',
  'daniel',
  'david',
  'davis',
  'diego',
  'edouard',
  'emmanuel',
  'eric',
  'fabien',
  'francois',
  'frederic',
  'gabriel',
  'georges',
  'gerard',
  'gordon',
  'gregory',
  'guillaume',
  'guy',
  'henri',
  'hugo',
  'jacques',
  'james',
  'jean',
  'jerome',
  'jonathan',
  'jules',
  'julien',
  'kevin',
  'laurent',
  'luc',
  'lucas',
  'marcel',
  'marc',
  'martin',
  'mathieu',
  'maxime',
  'michel',
  'nicolas',
  'olivier',
  'patrick',
  'paul',
  'philippe',
  'pierre',
  'raymond',
  'remi',
  'rene',
  'richard',
  'rishi',
  'robert',
  'roger',
  'sebastien',
  'serge',
  'stephane',
  'sylvain',
  'thibault',
  'thierry',
  'thomas',
  'timothee',
  'vincent',
  'william',
  'xavier',
  'yann',
])

function stripAccents(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

function normalizeLanguage(value: string): string {
  return value.trim().toLowerCase().replace(/_/g, '-')
}

function baseLanguage(value: string): string {
  return normalizeLanguage(value).split('-')[0]
}

function languageMatches(voiceLang: string, wanted: CompanionVoiceLanguage): boolean {
  return baseLanguage(voiceLang) === baseLanguage(wanted)
}

export function hasVoiceForLanguage(
  voices: readonly SpeechSynthesisVoice[],
  language: CompanionVoiceLanguage,
): boolean {
  return voices.some((voice) => languageMatches(voice.lang, language))
}

export function classifyVoiceGender(
  voice: Pick<SpeechSynthesisVoice, 'name'>,
): CompanionVoiceGender | null {
  const name = stripAccents(voice.name ?? '').toLowerCase()
  if (!name) {
    return null
  }

  if (/\b(female|feminine|feminin|woman)\b/.test(name)) {
    return 'feminine'
  }
  if (/\b(male|masculine|masculin|man)\b/.test(name)) {
    return 'masculine'
  }

  for (const token of name.split(/[^a-z]+/)) {
    if (FEMININE_VOICE_NAMES.has(token)) {
      return 'feminine'
    }
    if (MASCULINE_VOICE_NAMES.has(token)) {
      return 'masculine'
    }
  }
  return null
}

function qualityScore(voice: SpeechSynthesisVoice, language: CompanionVoiceLanguage): number {
  const name = voice.name.toLowerCase()
  let score = 0
  if (normalizeLanguage(voice.lang) === normalizeLanguage(language)) {
    score += 4
  }
  if (/(natural|neural|premium|enhanced|online)/.test(name)) {
    score += 3
  }
  if (voice.default) {
    score += 1
  }
  if (voice.localService) {
    score += 0.5
  }
  return score
}

export interface ResolvedCompanionVoice {
  voice: SpeechSynthesisVoice | null
  /** True when the chosen voice is known to match the requested gender. */
  genderMatched: boolean
}

/**
 * Resolve a device voice for the stored preference. If no voice of the wanted
 * gender can be identified, the best voice for the language is used and the UI
 * says that its gender is not declared. No gender is guessed.
 */
export function resolveCompanionVoice(
  voices: readonly SpeechSynthesisVoice[],
  preference: Pick<CompanionVoicePreference, 'gender' | 'language'>,
): ResolvedCompanionVoice {
  const languageVoices = voices.filter((voice) =>
    languageMatches(voice.lang, preference.language),
  )
  if (languageVoices.length === 0) {
    return { voice: null, genderMatched: false }
  }

  const genderVoices = languageVoices.filter(
    (voice) => classifyVoiceGender(voice) === preference.gender,
  )
  const candidates = genderVoices.length > 0 ? genderVoices : languageVoices
  const voice = [...candidates].sort(
    (left, right) =>
      qualityScore(right, preference.language) -
        qualityScore(left, preference.language) ||
      left.name.localeCompare(right.name),
  )[0]

  return {
    voice: voice ?? null,
    genderMatched: Boolean(
      voice && classifyVoiceGender(voice) === preference.gender,
    ),
  }
}

export function normalizeCompanionVoicePreference(
  value: unknown,
): CompanionVoicePreference {
  if (!value || typeof value !== 'object') {
    return { ...DEFAULT_COMPANION_VOICE }
  }

  const record = value as Record<string, unknown>
  const gender =
    record.gender === 'feminine' || record.gender === 'masculine'
      ? record.gender
      : DEFAULT_COMPANION_VOICE.gender
  const language =
    record.language === 'fr-FR' || record.language === 'en-US'
      ? record.language
      : DEFAULT_COMPANION_VOICE.language
  const numericRate = Number(record.rate)
  const rate = VOICE_RATES.includes(numericRate as CompanionVoiceRate)
    ? (numericRate as CompanionVoiceRate)
    : DEFAULT_COMPANION_VOICE.rate

  return { gender, language, rate }
}

export function previewSpeechKey(gender: CompanionVoiceGender): string {
  return `companion:preview:${gender}`
}

export function previewText(language: CompanionVoiceLanguage): string {
  return PREVIEW_TEXT[language]
}

export function voiceRateLabel(rate: CompanionVoiceRate): string {
  return `${String(rate).replace('.', ',')}×`
}

export function voiceLanguageAdjective(language: CompanionVoiceLanguage): string {
  return VOICE_LANGUAGE_ADJECTIVES[language]
}
