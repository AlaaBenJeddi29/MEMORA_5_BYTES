"""AI service layer for the audio app — Groq only.

Capabilities:
  1. Transcription      POST /v1/audio/transcriptions  (whisper-large-v3-turbo)
  2. Language detection POST /v1/chat/completions      (LLM, structured JSON)
  3. Sentiment analysis POST /v1/chat/completions      (LLM, structured JSON)
  4. Summarisation      POST /v1/chat/completions      (LLM, plain text)

Groq's Whisper endpoint does not report the spoken language, so language
detection is a separate LLM call over the transcript.

Never mask a real failure: authentication, quota, missing model, bad audio
format and timeout each raise their own error type, and the orchestrator
stores an explicit message on the entry.  Stub responses exist only when
GROQ_MOCK=true, which is meant for tests and offline demos; every stub string
is prefixed "[Mock]" so it can never be mistaken for a real AI result.
"""

import json
import logging
import os
import re
import time

import requests

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

GROQ_BASE_URL = "https://api.groq.com/openai/v1"
TRANSCRIPTION_URL = f"{GROQ_BASE_URL}/audio/transcriptions"
CHAT_URL = f"{GROQ_BASE_URL}/chat/completions"

DEFAULT_ASR_MODEL = "whisper-large-v3-turbo"
DEFAULT_LLM_MODEL = "openai/gpt-oss-20b"

# Reasoning models (gpt-oss) spend part of the budget before answering: a 40-token
# cap truncates them and Groq answers "Failed to generate JSON".
LLM_JSON_MAX_TOKENS = 400
LLM_TEXT_MAX_TOKENS = 600

# Groq accepts audio up to 25 MB on the free tier — the same ceiling the
# upload serializer enforces, so no extra truncation is applied here.
MAX_AUDIO_BYTES = 25 * 1024 * 1024

ASR_TIMEOUT = 120
LLM_TIMEOUT = 60
MAX_RETRIES = 2
RETRY_DELAY = 5

SENTIMENT_LABELS = ("positive", "negative", "neutral")
SENTIMENT_MIN_CONFIDENCE = 0.5
SUMMARY_MAX_WORDS = 40
SUMMARY_MIN_CHARS = 80
# The transcript is truncated before it reaches the LLM to bound cost/latency.
LLM_INPUT_MAX_CHARS = 6000


def asr_model() -> str:
    return os.environ.get("GROQ_ASR_MODEL", DEFAULT_ASR_MODEL).strip() or DEFAULT_ASR_MODEL


def llm_model() -> str:
    return os.environ.get("GROQ_LLM_MODEL", DEFAULT_LLM_MODEL).strip() or DEFAULT_LLM_MODEL


# ---------------------------------------------------------------------------
# Errors
# ---------------------------------------------------------------------------

class AudioAIError(Exception):
    """Base class for every audio AI failure."""


class AINotConfigured(AudioAIError):
    """No API key, or the key was rejected — never replaced by a stub."""


class AIQuotaExceeded(AudioAIError):
    """Groq rate limit or quota reached."""


class AIModelUnavailable(AudioAIError):
    """The requested model id does not exist or is not served."""


class AudioFormatError(AudioAIError):
    """Groq refused the audio payload (bad format, corrupt or too large)."""


class AITimeoutError(AudioAIError):
    """Groq did not answer within the configured timeout."""


class AIUnavailableError(AudioAIError):
    """Groq is temporarily failing (5xx) after retries."""


class AIUnexpectedOutput(AudioAIError):
    """The model answered but the payload could not be parsed."""


# ---------------------------------------------------------------------------
# Mock helpers (tests / offline demo only)
# ---------------------------------------------------------------------------

def _use_mock() -> bool:
    return os.environ.get("GROQ_MOCK", "false").strip().lower() in ("1", "true", "yes")


def _mock_transcript() -> str:
    return "[Mock] Simulated transcript — GROQ_MOCK is enabled, no real AI ran."


# ---------------------------------------------------------------------------
# HTTP plumbing
# ---------------------------------------------------------------------------

def _api_key() -> str:
    key = os.environ.get("GROQ_API_KEY", "").strip()
    if not key:
        raise AINotConfigured(
            "GROQ_API_KEY is not set. Add your Groq API key to .env to run the "
            "transcription, sentiment and summary models."
        )
    return key


def _headers() -> dict:
    return {"Authorization": f"Bearer {_api_key()}"}


def _classify_response(response: requests.Response) -> None:
    """Turn a non-OK Groq response into a specific, actionable error type."""
    status = response.status_code
    try:
        body = response.json()
        message = ((body.get("error") or {}).get("message") or "").strip()
        err_type = ((body.get("error") or {}).get("type") or "").strip().lower()
    except ValueError:
        body, message, err_type = {}, response.text[:200], ""

    lowered = message.lower()

    if status in (401, 403):
        raise AINotConfigured(
            f"Groq rejected the API key (HTTP {status}). Verify GROQ_API_KEY in .env."
        )

    if status == 429:
        retry_after = response.headers.get("retry-after")
        hint = f" Retry in {retry_after}s." if retry_after else ""
        if "quota" in lowered or "billing" in lowered:
            raise AIQuotaExceeded(f"Groq account quota exhausted: {message}.{hint}")
        raise AIQuotaExceeded(
            f"Groq rate limit reached ({err_type or 'rate_limit_exceeded'}).{hint}"
        )

    if status in (404,) or ("model" in lowered and ("not found" in lowered or "does not exist" in lowered or "invalid" in lowered)):
        raise AIModelUnavailable(f"Model unavailable on Groq: {message}")

    if status == 400 and any(
        token in lowered
        for token in ("audio", "file", "format", "corrupt", "duration", "input")
    ):
        raise AudioFormatError(f"Groq refused the audio file: {message}")

    if status >= 500:
        raise AIUnavailableError(f"Groq is unavailable (HTTP {status}): {message}")

    raise AudioAIError(f"Groq API returned HTTP {status}: {message or response.text[:200]}")


def _request(url: str, *, files=None, form=None, payload=None, timeout: int) -> dict:
    """POST to Groq with retries for transient failures."""
    headers = _headers()
    last_error: AudioAIError | None = None

    for attempt in range(1, MAX_RETRIES + 1):
        try:
            if files is not None:
                response = requests.post(
                    url, headers=headers, files=files, data=form or {}, timeout=timeout
                )
            else:
                response = requests.post(
                    url,
                    headers={**headers, "Content-Type": "application/json"},
                    data=json.dumps(payload),
                    timeout=timeout,
                )
        except requests.exceptions.Timeout as exc:
            raise AITimeoutError(
                f"The Groq request timed out after {timeout}s. Try a shorter memo."
            ) from exc
        except requests.exceptions.RequestException as exc:
            raise AudioAIError(f"Network error calling Groq: {exc}") from exc

        if response.ok:
            try:
                return response.json()
            except ValueError as exc:
                raise AIUnexpectedOutput("Groq returned a non-JSON response.") from exc

        try:
            _classify_response(response)
        except (AIUnavailableError, AIQuotaExceeded) as exc:
            # Transient enough to deserve a retry, but only briefly.
            last_error = exc
            if attempt < MAX_RETRIES:
                logger.debug("Groq %s; retrying in %ss", exc, RETRY_DELAY)
                time.sleep(RETRY_DELAY)
                continue
            raise

    raise last_error  # pragma: no cover - guarded by the loop above


# ---------------------------------------------------------------------------
# 1. Transcription
# ---------------------------------------------------------------------------

_AUDIO_MIME_BY_EXT = {
    ".wav": "audio/wav",
    ".mp3": "audio/mpeg",
    ".webm": "audio/webm",
    ".m4a": "audio/mp4",
    ".mp4": "audio/mp4",
    ".ogg": "audio/ogg",
    ".flac": "audio/flac",
    ".mpeg": "audio/mpeg",
}


def _audio_mime(name: str) -> str:
    for ext, mime in _AUDIO_MIME_BY_EXT.items():
        if name.lower().endswith(ext):
            return mime
    return "audio/wav"


def transcribe_audio(file_obj) -> str:
    """Transcribe an audio file with Groq Whisper and return the text."""
    if _use_mock():
        logger.info("GROQ_MOCK enabled -- returning mock transcript.")
        return _mock_transcript()

    file_obj.seek(0)
    raw = file_obj.read()
    if not raw:
        raise AudioFormatError("The audio file is empty.")
    if len(raw) > MAX_AUDIO_BYTES:
        raise AudioFormatError(
            f"Audio file is {len(raw) // (1024 * 1024)} MB; Groq accepts at most "
            f"{MAX_AUDIO_BYTES // (1024 * 1024)} MB."
        )

    name = getattr(file_obj, "name", "") or "audio.wav"
    files = {"file": (name, raw, _audio_mime(name))}
    form = {
        "model": asr_model(),
        "response_format": "verbose_json",
        "temperature": "0",
    }

    result = _request(TRANSCRIPTION_URL, files=files, form=form, timeout=ASR_TIMEOUT)
    text = (result.get("text") or "").strip()
    if not text:
        raise AudioFormatError("Whisper produced no speech for this audio.")
    return text


# ---------------------------------------------------------------------------
# 2. Language detection (LLM — Whisper does not report it)
# ---------------------------------------------------------------------------

def detect_language(transcript: str) -> dict:
    """Identify the language of the spoken content as {"code", "name"}."""
    if _use_mock():
        return {"code": "en", "name": "English"}

    if not transcript or not transcript.strip():
        return {"code": None, "name": None}

    data = _chat_json(
        system_prompt=(
            "You detect the language of a text. Answer with JSON only, using exactly "
            'these keys: "language_code" (ISO 639-1 two-letter code, e.g. "fr"), '
            'and "language_name" (the English name of that language, e.g. "French"). '
            "No other text."
        ),
        user_content=transcript[:LLM_INPUT_MAX_CHARS],
        max_tokens=LLM_JSON_MAX_TOKENS,
    )

    code = _normalize_language_code(str(data.get("language_code") or ""))
    if not code:
        raise AIUnexpectedOutput("Language detection returned no usable language code.")
    return {"code": code, "name": str(data.get("language_name") or "").strip() or _language_name(code)}


# ---------------------------------------------------------------------------
# 3. Sentiment analysis (LLM, structured output)
# ---------------------------------------------------------------------------

def analyse_sentiment(text: str) -> dict:
    """Classify the sentiment of a transcript as positive / negative / neutral."""
    if not text or not text.strip():
        return {"label": "neutral", "score": 1.0}

    if _use_mock():
        return {"label": "neutral", "score": 0.0, "mock": True}

    data = _chat_json(
        system_prompt=(
            "You analyse the sentiment of personal journal voice notes, in any language. "
            "Answer with JSON only, using exactly these keys: "
            '"sentiment" (one of "positive", "negative", "neutral"), and '
            '"confidence" (a number between 0 and 1 for that label). No other text.'
        ),
        user_content=text[:LLM_INPUT_MAX_CHARS],
        max_tokens=LLM_JSON_MAX_TOKENS,
    )

    label = str(data.get("sentiment") or "").strip().lower()
    if label not in SENTIMENT_LABELS:
        raise AIUnexpectedOutput(f"Sentiment model returned an unknown label: {label!r}")

    score = _as_confidence(data.get("confidence"))
    # A low-confidence positive/negative is reported as neutral.
    if label != "neutral" and score < SENTIMENT_MIN_CONFIDENCE:
        label = "neutral"

    return {"label": label, "score": score}


# ---------------------------------------------------------------------------
# 4. Summarisation (LLM, plain text)
# ---------------------------------------------------------------------------

def summarise_text(text: str) -> str:
    """Summarise a transcript concisely. Returns "" when there is nothing to say."""
    if not text or len(text.strip()) < SUMMARY_MIN_CHARS:
        return ""

    if _use_mock():
        return "[Mock summary] " + " ".join(text.split()[:10])

    return _chat_text(
        system_prompt=(
            f"You summarize personal journal voice notes. Reply with a single short "
            f"paragraph of at most {SUMMARY_MAX_WORDS} words, in the language of the note. "
            "No preamble, no title."
        ),
        user_content=text[:LLM_INPUT_MAX_CHARS],
        max_tokens=LLM_TEXT_MAX_TOKENS,
    )


# ---------------------------------------------------------------------------
# LLM plumbing
# ---------------------------------------------------------------------------

def _chat_payload(user_content: str, system_prompt: str, max_tokens: int, json_mode: bool) -> dict:
    payload = {
        "model": llm_model(),
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_content},
        ],
        "temperature": 0,
        "max_tokens": max_tokens,
    }
    if json_mode:
        payload["response_format"] = {"type": "json_object"}
    return payload


def _chat_json(system_prompt: str, user_content: str, max_tokens: int) -> dict:
    """Ask the LLM for a JSON object and parse it defensively."""
    try:
        result = _request(
            CHAT_URL,
            payload=_chat_payload(user_content, system_prompt, max_tokens, json_mode=True),
            timeout=LLM_TIMEOUT,
        )
    except AudioAIError as exc:
        if "json" not in str(exc).lower():
            raise
        # Groq refuses json_object on models that cannot produce valid JSON for the
        # prompt; the same prompt still answers in prose, salvaged below.
        logger.info("Groq rejected JSON mode (%s); retrying as plain text", exc)
        result = _request(
            CHAT_URL,
            payload=_chat_payload(user_content, system_prompt, max_tokens, json_mode=False),
            timeout=LLM_TIMEOUT,
        )

    content = _first_message(result)
    try:
        data = json.loads(content)
    except ValueError:
        # Some deployments ignore json_mode; salvage the first {...} block.
        match = re.search(r"\{.*\}", content, re.DOTALL)
        if not match:
            raise AIUnexpectedOutput(f"LLM answer was not JSON: {content[:120]!r}")
        try:
            data = json.loads(match.group(0))
        except ValueError as exc:
            raise AIUnexpectedOutput(f"LLM JSON could not be parsed: {content[:120]!r}") from exc
    if not isinstance(data, dict):
        raise AIUnexpectedOutput("LLM returned JSON that is not an object.")
    return data


def _chat_text(system_prompt: str, user_content: str, max_tokens: int) -> str:
    result = _request(
        CHAT_URL,
        payload=_chat_payload(user_content, system_prompt, max_tokens, json_mode=False),
        timeout=LLM_TIMEOUT,
    )
    content = _first_message(result).strip()
    if not content:
        raise AIUnexpectedOutput("The summary model returned an empty answer.")
    return content


def _first_message(result: dict) -> str:
    choices = result.get("choices") or []
    if not choices:
        raise AIUnexpectedOutput("Groq returned no completion choices.")
    content = (choices[0].get("message") or {}).get("content")
    if content is None:
        raise AIUnexpectedOutput("Groq returned a completion without content.")
    return str(content)


def _as_confidence(value) -> float:
    try:
        score = float(value)
    except (TypeError, ValueError):
        return 0.0
    return max(0.0, min(score, 1.0))


# ---------------------------------------------------------------------------
# Language code helpers
# ---------------------------------------------------------------------------

_LANG_NAMES: dict[str, str] = {
    "af": "Afrikaans", "ar": "Arabic", "bg": "Bulgarian", "bn": "Bengali",
    "ca": "Catalan", "cs": "Czech", "cy": "Welsh", "da": "Danish",
    "de": "German", "el": "Greek", "en": "English", "es": "Spanish",
    "et": "Estonian", "fa": "Persian", "fi": "Finnish", "fr": "French",
    "gl": "Galician", "gu": "Gujarati", "he": "Hebrew", "hi": "Hindi",
    "hr": "Croatian", "hu": "Hungarian", "hy": "Armenian", "id": "Indonesian",
    "is": "Icelandic", "it": "Italian", "ja": "Japanese", "ka": "Georgian",
    "kk": "Kazakh", "km": "Khmer", "kn": "Kannada", "ko": "Korean",
    "lb": "Luxembourgish", "lo": "Lao", "lt": "Lithuanian", "lv": "Latvian",
    "mk": "Macedonian", "ml": "Malayalam", "mn": "Mongolian", "mr": "Marathi",
    "ms": "Malay", "mt": "Maltese", "my": "Burmese", "ne": "Nepali",
    "nl": "Dutch", "no": "Norwegian", "pa": "Punjabi", "pl": "Polish",
    "pt": "Portuguese", "ro": "Romanian", "ru": "Russian", "si": "Sinhala",
    "sk": "Slovak", "sl": "Slovenian", "sq": "Albanian", "sr": "Serbian",
    "su": "Sundanese", "sv": "Swedish", "sw": "Swahili", "ta": "Tamil",
    "te": "Telugu", "tg": "Tajik", "th": "Thai", "tl": "Filipino",
    "tr": "Turkish", "uk": "Ukrainian", "ur": "Urdu", "uz": "Uzbek",
    "vi": "Vietnamese", "yi": "Yiddish", "yo": "Yoruba", "zh": "Chinese",
}

# Some models answer with ISO 639-2 codes; the rest of the app keys on ISO 639-1.
_LANG_CODE_ALIASES = {
    "eng": "en", "fra": "fr", "fre": "fr", "ara": "ar", "deu": "de", "ger": "de",
    "spa": "es", "ita": "it", "por": "pt", "nld": "nl", "dut": "nl", "rus": "ru",
    "zho": "zh", "chi": "zh", "jpn": "ja", "tur": "tr", "pol": "pl", "swe": "sv",
    "ukr": "uk", "heb": "he", "nor": "no", "ell": "el", "gre": "el",
}


def _normalize_language_code(label: str) -> str | None:
    """Map 'fr', 'FR', 'fra', 'french', 'French (fr)' … to a 2-letter code."""
    text = (label or "").strip().lower()
    if not text:
        return None
    for prefix in ("label_", "label-", "lang_", "lang-"):
        if text.startswith(prefix):
            text = text[len(prefix):]
    text = text.split("-")[0].split("_")[0].strip()
    if text in _LANG_NAMES:
        return text
    if text in _LANG_CODE_ALIASES:
        return _LANG_CODE_ALIASES[text]
    for code, name in _LANG_NAMES.items():
        if name.lower() == text:
            return code
    return text if 2 <= len(text) <= 3 else None


def _language_name(code: str) -> str:
    return _LANG_NAMES.get(code.lower(), code.upper() if code else "Unknown")


# ---------------------------------------------------------------------------
# Orchestrator  --  called from views
# ---------------------------------------------------------------------------

# User-facing texts: explicit about the cause, never carrying the API key.
_ERROR_MESSAGES = {
    AINotConfigured: "AI service not configured. Set GROQ_API_KEY in the server environment.",
    AIQuotaExceeded: "AI quota reached on the Groq account. Retry later or raise the tier.",
    AIModelUnavailable: "The configured Groq model is unavailable. Check GROQ_ASR_MODEL / GROQ_LLM_MODEL.",
    AudioFormatError: "The audio file could not be processed. Check that it is valid MP3/WAV/WebM audio.",
    AITimeoutError: "The AI service took too long to answer. Please try again.",
    AIUnavailableError: "The AI service is temporarily unavailable. Please try again.",
    AIUnexpectedOutput: "The AI service returned an unusable answer. Please try again.",
}


def _error_message_for(exc: Exception) -> str:
    for error_type, message in _ERROR_MESSAGES.items():
        if isinstance(exc, error_type):
            return message
    return "AI processing failed. Please try again."


def process_audio_entry(audio_entry) -> None:
    """Run the Groq pipeline on an AudioEntry and persist the results."""
    from .models import AudioEntry  # local import to avoid circular import

    audio_entry.status = AudioEntry.Status.PROCESSING
    audio_entry.save(update_fields=["status", "updated_at"])

    try:
        # Step 0 -- audio duration (local metadata, no API call)
        try:
            import mutagen  # noqa: PLC0415
            with audio_entry.file.open("rb") as fh:
                mf = mutagen.File(fh)
            if mf is not None and mf.info:
                audio_entry.duration_seconds = mf.info.length
        except Exception:  # noqa: BLE001
            pass

        # Step 1 -- Transcription (Groq Whisper)
        with audio_entry.file.open("rb") as fh:
            transcript = transcribe_audio(fh)
        audio_entry.transcript = transcript

        # Step 2 -- Language detection (LLM)
        # Not blocking: a missing language must not lose the transcript.
        try:
            lang = detect_language(transcript)
            audio_entry.language_code = lang["code"]
            audio_entry.language_name = lang["name"]
        except AudioAIError as exc:
            logger.warning("Language detection failed for AudioEntry #%s: %s", audio_entry.pk, exc)

        # Step 3 -- Sentiment analysis (LLM)
        sent = analyse_sentiment(transcript)
        audio_entry.sentiment       = sent["label"]
        audio_entry.sentiment_score = sent["score"]

        # Step 4 -- Summary (LLM, non-blocking)
        try:
            audio_entry.summary = summarise_text(transcript)
        except AudioAIError as exc:
            logger.warning("Summary failed for AudioEntry #%s: %s", audio_entry.pk, exc)
            audio_entry.summary = None

        audio_entry.status = AudioEntry.Status.SUCCEEDED
        audio_entry.error  = None

    except AudioAIError as exc:
        logger.error("Groq AI error for AudioEntry #%s: %s", audio_entry.pk, exc)
        audio_entry.status = AudioEntry.Status.FAILED
        audio_entry.error  = _error_message_for(exc)

    except Exception:  # noqa: BLE001
        logger.exception("Unexpected error for AudioEntry #%s", audio_entry.pk)
        audio_entry.status = AudioEntry.Status.FAILED
        audio_entry.error  = "An unexpected error occurred."

    finally:
        audio_entry.save(update_fields=[
            "duration_seconds", "transcript", "language_code", "language_name",
            "sentiment", "sentiment_score", "summary", "status", "error", "updated_at",
        ])
