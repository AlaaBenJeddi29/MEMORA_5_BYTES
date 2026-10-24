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


def env_int(name, default):
    """Read an integer environment variable, falling back on invalid input."""
    try:
        return int(os.environ.get(name, "").strip() or default)
    except ValueError:
        return default


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

# Unsafe requests from the separate React origin (POST/PATCH/DELETE) are
# rejected by Django's CSRF check unless that origin is trusted. Keep this in
# sync with CORS_ALLOWED_ORIGINS; both are development defaults.
CSRF_TRUSTED_ORIGINS = env_list(
    "DJANGO_CSRF_TRUSTED_ORIGINS",
    "http://localhost:3000,http://127.0.0.1:3000",
)


# Google Gemini (used by apps.summaries.services.gemini).
# These values stay on the server: the API key is never sent to the frontend.
# An empty key or model is allowed at startup and produces a clear
# configuration error only when generation is attempted.

GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "").strip()
GEMINI_MODEL = os.environ.get("GEMINI_MODEL", "").strip()
GEMINI_TIMEOUT_SECONDS = env_int("GEMINI_TIMEOUT_SECONDS", 30)
