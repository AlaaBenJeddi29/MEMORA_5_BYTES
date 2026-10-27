import { Button } from '../../../components/Button'
import { Icon } from '../../../components/Icon'
import type {
  CompanionVoiceGender,
  CompanionVoicePreference,
} from '../../../types/companion'
import type { VoiceSaveStatus } from '../useCompanionVoicePreferences'
import {
  VOICE_GENDER_LABELS,
  VOICE_LANGUAGES,
  VOICE_LANGUAGE_LABELS,
  VOICE_RATES,
  hasVoiceForLanguage,
  resolveCompanionVoice,
  voiceLanguageAdjective,
  voiceRateLabel,
} from '../voice'

interface CompanionVoiceSettingsProps {
  supported: boolean
  voices: readonly SpeechSynthesisVoice[]
  preference: CompanionVoicePreference
  onChange: (patch: Partial<CompanionVoicePreference>) => void
  onPreview: (gender: CompanionVoiceGender) => void
  previewingGender: CompanionVoiceGender | null
  previewError: string | null
  onSave: () => void
  isDirty: boolean
  loading: boolean
  loadFailed: boolean
  saveStatus: VoiceSaveStatus
  saveError: string | null
}

const GENDERS: readonly CompanionVoiceGender[] = ['feminine', 'masculine']

/**
 * Voice settings visible before an answer is requested. Previews use the same
 * global speaker as the answer, so only one voice is ever heard.
 */
export function CompanionVoiceSettings({
  supported,
  voices,
  preference,
  onChange,
  onPreview,
  previewingGender,
  previewError,
  onSave,
  isDirty,
  loading,
  loadFailed,
  saveStatus,
  saveError,
}: CompanionVoiceSettingsProps) {
  const resolved = resolveCompanionVoice(voices, preference)
  const languageVoiceAvailable = hasVoiceForLanguage(voices, preference.language)
  const languageLabel = VOICE_LANGUAGE_LABELS[preference.language]
  const adjective = voiceLanguageAdjective(preference.language)
  const genderLabel = VOICE_GENDER_LABELS[preference.gender]

  let currentVoice: string
  if (!supported) {
    currentVoice = 'La lecture vocale n’est pas disponible dans ce navigateur.'
  } else if (!resolved.voice && !languageVoiceAvailable) {
    currentVoice =
      voices.length === 0
        ? 'Voix par défaut du navigateur. La liste des voix de cet appareil n’est pas encore disponible.'
        : `Aucune voix ${adjective} n’est installée. Le navigateur utilisera sa voix par défaut.`
  } else if (!resolved.voice) {
    currentVoice = `Aucune voix ${adjective} n’est disponible. Le navigateur utilisera sa voix par défaut.`
  } else if (resolved.genderMatched) {
    currentVoice = `Voix actuelle : ${resolved.voice.name} (${languageLabel}, ${genderLabel}).`
  } else {
    currentVoice = `Aucune voix ${genderLabel} identifiée sur cet appareil. Lecture avec ${resolved.voice.name}, dont le genre n’est pas déclaré.`
  }

  return (
    <section
      className="companion-voice"
      aria-labelledby="companion-voice-heading"
    >
      <div className="companion-voice__head">
        <span className="companion-voice__mark" aria-hidden="true">
          <Icon name="wave" size={18} />
        </span>
        <div>
          <h3 id="companion-voice-heading">Voix de l’assistant</h3>
          <p className="muted">
            Choisissez une voix, une langue et une vitesse. Les aperçus utilisent
            uniquement les voix déjà installées sur cet appareil.
          </p>
        </div>
      </div>

      <div className="companion-voice__grid">
        <fieldset className="companion-voice__group">
          <legend>Voix</legend>
          <div className="companion-voice__genders">
            {GENDERS.map((gender) => {
              const label = VOICE_GENDER_LABELS[gender]
              const previewing = previewingGender === gender
              return (
                <div className="companion-voice__gender" key={gender}>
                  <label className="companion-voice__radio">
                    <input
                      type="radio"
                      name="companion-voice-gender"
                      value={gender}
                      checked={preference.gender === gender}
                      disabled={!supported}
                      onChange={() => onChange({ gender })}
                    />
                    <span>Voix {label}</span>
                  </label>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={!supported}
                    onClick={() => onPreview(gender)}
                    aria-label={`${previewing ? 'Arrêter' : 'Écouter'} un aperçu de la voix ${label}`}
                  >
                    <Icon name="volume" size={14} />
                    {previewing ? 'Arrêter l’aperçu' : 'Aperçu'}
                  </Button>
                </div>
              )
            })}
          </div>
        </fieldset>

        <label className="companion-voice__field">
          <span>Langue de la voix</span>
          <select
            className="input"
            aria-label="Langue de la voix"
            value={preference.language}
            disabled={!supported}
            onChange={(event) =>
              onChange({
                language: event.target.value as CompanionVoicePreference['language'],
              })
            }
          >
            {VOICE_LANGUAGES.map((language) => (
              <option key={language.value} value={language.value}>
                {language.label}
              </option>
            ))}
          </select>
        </label>

        <label className="companion-voice__field">
          <span>Vitesse de lecture</span>
          <select
            className="input"
            aria-label="Vitesse de lecture"
            value={String(preference.rate)}
            disabled={!supported}
            onChange={(event) =>
              onChange({
                rate: Number(event.target.value) as CompanionVoicePreference['rate'],
              })
            }
          >
            {VOICE_RATES.map((rate) => (
              <option key={rate} value={rate}>
                {voiceRateLabel(rate)}
              </option>
            ))}
          </select>
        </label>
      </div>

      <p className="companion-voice__current" role="status" aria-live="polite">
        <Icon name="volume" size={14} />
        {currentVoice}
      </p>

      {loading && (
        <p className="muted companion-voice__note">
          Chargement de vos préférences…
        </p>
      )}

      {loadFailed && (
        <p className="companion-voice__note" role="note">
          Vos préférences n’ont pas pu être chargées. Les valeurs par défaut sont
          utilisées.
        </p>
      )}

      {previewError && (
        <p className="companion-voice__error" role="alert">
          {previewError}
        </p>
      )}

      <div className="companion-voice__actions">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={!isDirty || loading || saveStatus === 'saving'}
          onClick={onSave}
        >
          {saveStatus === 'saving'
            ? 'Enregistrement…'
            : 'Enregistrer mes préférences'}
        </Button>
        {saveStatus === 'saved' && (
          <span className="companion-voice__saved" role="status">
            Préférences enregistrées.
          </span>
        )}
        {saveStatus === 'error' && saveError && (
          <span className="companion-voice__error" role="alert">
            {saveError}
          </span>
        )}
      </div>
    </section>
  )
}
