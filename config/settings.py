"""
Django settings for the MEMORA project.

MEMORA is a private, personal multimodal journal (text, audio, images,
people) built as a university Django project. This file is intentionally
kept to Django defaults plus the small amount of configuration the
scaffold needs, so it stays easy to read for beginners.

Configuration values that differ between machines or that are secret are
read from environment variables. For local development they are loaded
from a ``.env`` file in the project root (copy ``.env.example`` to
``.env`` and fill it in). Sensible development fallbacks are used when a
variable is missing, so the project still runs out of the box.

Docs: https://docs.djangoproject.com/en/5.2/ref/settings/
"""

import os
from pathlib import Path

from django.core.exceptions import ImproperlyConfigured
from dotenv import load_dotenv

# BASE_DIR is the folder that contains manage.py (the project root).
BASE_DIR = Path(__file__).resolve().parent.parent

# Read KEY=VALUE pairs from .env into the environment. Safe to call even
# if the file does not exist: it simply does nothing.
load_dotenv(BASE_DIR / ".env")


def env_bool(name, default=False):
    """Read a boolean environment variable ("true"/"1"/"yes" => True)."""
    return os.environ.get(name, str(default)).strip().lower() in ("1", "true", "yes", "on")


def env_list(name, default=""):
    """Read a comma-separated environment variable into a list of strings."""
    return [item.strip() for item in os.environ.get(name, default).split(",") if item.strip()]


def env_generation_sizes(name, default):
    """Read ``WIDTHxHEIGHT`` pairs used by the local generation workflow."""
    sizes = []
    for item in env_list(name, default):
        try:
            width_text, height_text = item.lower().split("x", 1)
            width, height = int(width_text), int(height_text)
        except ValueError as exc:
            raise ImproperlyConfigured(
                f"{name} must contain WIDTHxHEIGHT pairs, e.g. 512x512."
            ) from exc
        if width <= 0 or height <= 0 or width % 64 or height % 64:
            raise ImproperlyConfigured(
                f"{name} sizes must be positive multiples of 64."
            )
        if (width, height) not in sizes:
            sizes.append((width, height))
    if not sizes:
        raise ImproperlyConfigured(f"{name} must contain at least one size.")
    return tuple(sizes)


# SECURITY WARNING: keep the secret key secret in production.
# The fallback below is for local development only.
SECRET_KEY = os.environ.get(
    "DJANGO_SECRET_KEY", "django-insecure-dev-only-do-not-use-in-production"
)

# SECURITY WARNING: never run with DEBUG = True in production.
DEBUG = env_bool("DJANGO_DEBUG", default=True)

# Hosts the site is allowed to serve. Defaults cover local development.
ALLOWED_HOSTS = env_list("DJANGO_ALLOWED_HOSTS", "127.0.0.1,localhost")


# Application definition

INSTALLED_APPS = [
    # Django built-in apps
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    # Third-party apps
    "rest_framework",
    "corsheaders",
    # Local apps (all live under the `apps/` package)
    "apps.accounts",
    "apps.journal",
    "apps.audio",
    "apps.summaries",
    "apps.media_library",
    "apps.people",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    # CorsMiddleware must sit as high as possible, above CommonMiddleware.
    "corsheaders.middleware.CorsMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "config.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "config.wsgi.application"


# Database
# SQLite is used for local development (a single file, no server needed).

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.sqlite3",
        "NAME": BASE_DIR / "db.sqlite3",
    }
}


# Password validation
# https://docs.djangoproject.com/en/5.2/ref/settings/#auth-password-validators

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

# MEMORA uses Django's built-in User model for now. No custom
# authentication is implemented at this stage.


# Internationalization
# https://docs.djangoproject.com/en/5.2/topics/i18n/

LANGUAGE_CODE = "en-us"
TIME_ZONE = "UTC"
USE_I18N = True
USE_TZ = True


# Static files (CSS, JavaScript, images shipped with the code)
# https://docs.djangoproject.com/en/5.2/howto/static-files/

STATIC_URL = "static/"
# Where `collectstatic` gathers files for deployment (local dev ignores it).
STATIC_ROOT = BASE_DIR / "staticfiles"


# Media files (user uploads: audio, photos, ...)
# Served by Django only while DEBUG = True (see config/urls.py).

MEDIA_URL = "media/"
MEDIA_ROOT = BASE_DIR / "media"

# Maximum accepted image upload size (bytes) and decoded pixel count.
# Both are configurable per environment; keep the defaults modest for a
# local, single-user development storage setup.
MEDIA_IMAGE_MAX_BYTES = int(os.environ.get("MEDIA_IMAGE_MAX_BYTES", 10 * 1024 * 1024))
MEDIA_IMAGE_MAX_PIXELS = int(os.environ.get("MEDIA_IMAGE_MAX_PIXELS", 40_000_000))


# Local ComfyUI image generation. The Django backend is the only component
# that talks to ComfyUI; the browser never receives this URL or workflow.
# There are no hosted providers, API keys, or tokens in this configuration.

COMFYUI_BASE_URL = os.environ.get(
    "COMFYUI_BASE_URL", "http://127.0.0.1:8188"
).strip()
COMFYUI_WORKFLOW_PATH = os.environ.get(
    "COMFYUI_WORKFLOW_PATH",
    str(BASE_DIR / "apps/media_library/workflows/stable_diffusion_1_5_text_to_image.json"),
).strip()
COMFYUI_CHECKPOINT = os.environ.get("COMFYUI_CHECKPOINT", "").strip()
COMFYUI_TIMEOUT = float(os.environ.get("COMFYUI_TIMEOUT", "180"))
COMFYUI_REQUEST_TIMEOUT = float(os.environ.get("COMFYUI_REQUEST_TIMEOUT", "15"))

# Server-side generation guardrails. The first allowed size is the default.
# These bounds mirror the local SD 1.5 workflow's supported inputs; they are
# configurable for tuning, not for exposing extra provider parameters.
MEDIA_GENERATION_MAX_PROMPT_LENGTH = int(
    os.environ.get("MEDIA_GENERATION_MAX_PROMPT_LENGTH", "1000")
)
MEDIA_GENERATION_ALLOWED_SIZES = env_generation_sizes(
    "MEDIA_GENERATION_ALLOWED_SIZES",
    "512x512,512x768,768x512",
)
MEDIA_GENERATION_MIN_STEPS = int(os.environ.get("MEDIA_GENERATION_MIN_STEPS", "1"))
MEDIA_GENERATION_MAX_STEPS = int(os.environ.get("MEDIA_GENERATION_MAX_STEPS", "30"))
MEDIA_GENERATION_DEFAULT_STEPS = int(
    os.environ.get("MEDIA_GENERATION_DEFAULT_STEPS", "20")
)
if (
    MEDIA_GENERATION_MAX_PROMPT_LENGTH < 1
    or MEDIA_GENERATION_MIN_STEPS < 1
    or MEDIA_GENERATION_MAX_STEPS < MEDIA_GENERATION_MIN_STEPS
    or not (
        MEDIA_GENERATION_MIN_STEPS
        <= MEDIA_GENERATION_DEFAULT_STEPS
        <= MEDIA_GENERATION_MAX_STEPS
    )
):
    raise ImproperlyConfigured(
        "Generation prompt or step limits are invalid. Check the "
        "MEDIA_GENERATION_* environment variables."
    )


# Default primary key field type
# https://docs.djangoproject.com/en/5.2/ref/settings/#default-auto-field

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"


# Django REST Framework
# A minimal, safe default: requests must be authenticated unless a view
# overrides it. The browsable API stays available for manual testing.

REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": [
        "rest_framework.authentication.SessionAuthentication",
    ],
    "DEFAULT_PERMISSION_CLASSES": [
        "rest_framework.permissions.IsAuthenticated",
    ],
}


# Cross-Origin Resource Sharing (for the separate React frontend).
# Only the listed origins may call the API from a browser. During local
# development the React dev server usually runs on port 3000.

CORS_ALLOWED_ORIGINS = env_list(
    "DJANGO_CORS_ALLOWED_ORIGINS",
    "http://localhost:3000,http://127.0.0.1:3000",
)
CORS_ALLOW_CREDENTIALS = True
