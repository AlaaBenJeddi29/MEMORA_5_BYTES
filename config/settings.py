"""Django settings for the MEMORA project.

MEMORA is a private, personal multimodal journal (text, audio, images,
people) built as a university Django project.

Configuration values that differ between machines or are secret are
read from environment variables. For local development, they are loaded
from a .env file in the project root.

Docs: https://docs.djangoproject.com/en/5.2/ref/settings/
"""

import os
from pathlib import Path

from django.core.exceptions import ImproperlyConfigured
from dotenv import load_dotenv


# ============================================================
# BASE DIRECTORY AND ENVIRONMENT VARIABLES
# ============================================================

# BASE_DIR is the folder containing manage.py.
BASE_DIR = Path(__file__).resolve().parent.parent

# Load environment variables from the project root .env file.
load_dotenv(BASE_DIR / ".env")


def env_bool(name, default=False):
    """Read a boolean environment variable."""
    return os.environ.get(name, str(default)).strip().lower() in (
        "1",
        "true",
        "yes",
        "on",
    )


def env_list(name, default=""):
    """Read a comma-separated environment variable into a list."""
    return [
        item.strip()
        for item in os.environ.get(name, default).split(",")
        if item.strip()
    ]


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


def env_int(name, default):
    """Read an integer environment variable, using a fallback if invalid."""
    try:
        return int(os.environ.get(name, "").strip() or default)
    except ValueError:
        return default


# Deployment profile: "development" (default) or "production". Production
# turns on the secure-cookie/HSTS settings and rejects development secrets.
# The test runner also runs as development even though Django forces DEBUG
# off under tests.
DEPLOYMENT_ENV = os.environ.get("DJANGO_ENV", "development").strip().lower()
IS_PRODUCTION = DEPLOYMENT_ENV == "production"


# ============================================================
# SECURITY
# ============================================================

# Keep the real secret key in .env. The fallback only exists for local work.
DEV_SECRET_KEY = "django-insecure-dev-only-do-not-use-in-production"
SECRET_KEY = os.environ.get("DJANGO_SECRET_KEY", DEV_SECRET_KEY)

if IS_PRODUCTION and (SECRET_KEY == DEV_SECRET_KEY or len(SECRET_KEY) < 50):
    raise ImproperlyConfigured(
        "Set DJANGO_SECRET_KEY to a unique value of at least 50 characters "
        "when DJANGO_ENV=production."
    )

# Never use DEBUG=True in production.
DEBUG = env_bool("DJANGO_DEBUG", default=not IS_PRODUCTION)
if IS_PRODUCTION and DEBUG:
    raise ImproperlyConfigured("DJANGO_DEBUG cannot be enabled in production.")

# Allowed hosts for local development.
ALLOWED_HOSTS = env_list(
    "DJANGO_ALLOWED_HOSTS",
    "127.0.0.1,localhost,testserver",
)
if not IS_PRODUCTION and "testserver" not in ALLOWED_HOSTS:
    # Django's test client uses the host "testserver"; .env files often list
    # only real dev hosts, so make the test runner independent of them.
    ALLOWED_HOSTS.append("testserver")


# ============================================================
# APPLICATIONS
# ============================================================

INSTALLED_APPS = [
    # Django built-in applications
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",

    # Third-party applications
    "rest_framework",
    "corsheaders",

    # MEMORA local applications
    "apps.accounts",
    "apps.journal",
    "apps.audio",
    "apps.summaries",
    "apps.media_library",
    "apps.people",
]


# ============================================================
# MIDDLEWARE
# ============================================================

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",

    # CORS middleware must be placed before CommonMiddleware.
    "corsheaders.middleware.CorsMiddleware",

    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]


# ============================================================
# URLS AND TEMPLATES
# ============================================================

ROOT_URLCONF = "config.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [BASE_DIR / "templates"],
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


# ============================================================
# DATABASE
# ============================================================

# SQLite database for local development.
DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.sqlite3",
        "NAME": BASE_DIR / "db.sqlite3",
    }
}


# ============================================================
# PASSWORD VALIDATION
# ============================================================

AUTH_PASSWORD_VALIDATORS = [
    {
        "NAME": (
            "django.contrib.auth.password_validation."
            "UserAttributeSimilarityValidator"
        ),
    },
    {
        "NAME": (
            "django.contrib.auth.password_validation."
            "MinimumLengthValidator"
        ),
        "OPTIONS": {"min_length": 10},
    },
    {
        "NAME": (
            "django.contrib.auth.password_validation."
            "CommonPasswordValidator"
        ),
    },
    {
        "NAME": (
            "django.contrib.auth.password_validation."
            "NumericPasswordValidator"
        ),
    },
]

# Modern PBKDF2 hashing, selected explicitly so the policy is visible and
# stable across Django upgrades.
PASSWORD_HASHERS = [
    "django.contrib.auth.hashers.PBKDF2PasswordHasher",
]

# Custom user model (accounts.User). It intentionally shares the historical
# auth_user table; see apps/accounts/migrations/0001_initial.py.
AUTH_USER_MODEL = "accounts.User"

# HTML pages use the dedicated sign-in page; the SPA keeps its own /login route.
LOGIN_URL = "/accounts/login/"
LOGIN_REDIRECT_URL = "/people/"
LOGOUT_REDIRECT_URL = "/accounts/login/"

# Brute-force protection (per account, stored in the database).
LOGIN_LOCKOUT_MAX_ATTEMPTS = env_int("LOGIN_LOCKOUT_MAX_ATTEMPTS", 5)
LOGIN_LOCKOUT_SECONDS = env_int("LOGIN_LOCKOUT_SECONDS", 900)


# ============================================================
# EMAIL
# ============================================================

# Console backend in development prints verification and reset emails in the
# runserver terminal. Production must provide real SMTP settings.
DEFAULT_FROM_EMAIL = os.environ.get(
    "DJANGO_DEFAULT_FROM_EMAIL",
    "MEMORA <no-reply@memora.local>",
)
EMAIL_BACKEND = os.environ.get(
    "DJANGO_EMAIL_BACKEND",
    (
        "django.core.mail.backends.smtp.EmailBackend"
        if IS_PRODUCTION
        else "django.core.mail.backends.console.EmailBackend"
    ),
)
EMAIL_HOST = os.environ.get("DJANGO_EMAIL_HOST", "localhost")
EMAIL_PORT = env_int("DJANGO_EMAIL_PORT", 587)
EMAIL_HOST_USER = os.environ.get("DJANGO_EMAIL_HOST_USER", "")
EMAIL_HOST_PASSWORD = os.environ.get("DJANGO_EMAIL_HOST_PASSWORD", "")
EMAIL_USE_TLS = env_bool("DJANGO_EMAIL_USE_TLS", default=True)
EMAIL_TIMEOUT = env_int("DJANGO_EMAIL_TIMEOUT", 10)


# ============================================================
# INTERNATIONALIZATION
# ============================================================

LANGUAGE_CODE = "en-us"

TIME_ZONE = "UTC"

USE_I18N = True

USE_TZ = True


# ============================================================
# STATIC FILES
# ============================================================

STATIC_URL = "static/"

STATIC_ROOT = BASE_DIR / "staticfiles"


# ============================================================
# MEDIA FILES
# ============================================================

# User-uploaded audio files, photos, and other media.
# Django serves these during development through config/urls.py.

MEDIA_URL = "media/"

MEDIA_ROOT = BASE_DIR / "media"

# Maximum accepted image upload size (bytes) and decoded pixel count.
MEDIA_IMAGE_MAX_BYTES = int(os.environ.get("MEDIA_IMAGE_MAX_BYTES", 10 * 1024 * 1024))
MEDIA_IMAGE_MAX_PIXELS = int(os.environ.get("MEDIA_IMAGE_MAX_PIXELS", 40_000_000))


# Local ComfyUI image generation. The Django backend is the only component
# that talks to ComfyUI; the browser never receives this URL or workflow.
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

# Server-side generation guardrails.
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


# ============================================================
# DEFAULT PRIMARY KEY
# ============================================================

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"


# ============================================================
# DJANGO REST FRAMEWORK
# ============================================================

REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": [
        "rest_framework.authentication.SessionAuthentication",
    ],
    "DEFAULT_PERMISSION_CLASSES": [
        "rest_framework.permissions.IsAuthenticated",
    ],
}


# ============================================================
# CORS — REACT / VITE FRONTEND
# ============================================================

CORS_ALLOWED_ORIGINS = env_list(
    "DJANGO_CORS_ALLOWED_ORIGINS",
    (
        "http://localhost:3000,"
        "http://127.0.0.1:3000,"
        "http://localhost:3001,"
        "http://127.0.0.1:3001,"
        "http://localhost:5173,"
        "http://127.0.0.1:5173"
    ),
)

CORS_ALLOW_CREDENTIALS = True


# ============================================================
# SESSION COOKIE SETTINGS
# ============================================================

SESSION_COOKIE_SAMESITE = "Lax"
SESSION_COOKIE_SECURE = env_bool(
    "DJANGO_SESSION_COOKIE_SECURE",
    default=IS_PRODUCTION,
)
SESSION_COOKIE_HTTPONLY = True


# ============================================================
# CSRF COOKIE SETTINGS
# ============================================================

# The SPA reads this cookie and echoes it in X-CSRFToken, so it cannot be
# HTTP-only; the token is still protected by SameSite + double-submit.
CSRF_COOKIE_HTTPONLY = False
CSRF_COOKIE_SAMESITE = "Lax"
CSRF_COOKIE_SECURE = env_bool(
    "DJANGO_CSRF_COOKIE_SECURE",
    default=IS_PRODUCTION,
)
CSRF_FAILURE_VIEW = "config.views.csrf_failure"


# ============================================================
# CSRF TRUSTED ORIGINS
# ============================================================

CSRF_TRUSTED_ORIGINS = env_list(
    "DJANGO_CSRF_TRUSTED_ORIGINS",
    (
        "http://localhost:3000,"
        "http://127.0.0.1:3000,"
        "http://localhost:3001,"
        "http://127.0.0.1:3001,"
        "http://localhost:5173,"
        "http://127.0.0.1:5173"
    ),
)


# ============================================================
# GOOGLE GEMINI CONFIGURATION
# ============================================================

GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "").strip()

GEMINI_MODEL = os.environ.get("GEMINI_MODEL", "").strip()

GEMINI_TIMEOUT_SECONDS = env_int(
    "GEMINI_TIMEOUT_SECONDS",
    30,
)


# ============================================================
# ADMIN URL AND SECURITY HEADERS
# ============================================================

# Moving the admin off /admin/ makes automated probing of the default path
# useless. It is still staff-only; Django enforces that itself.
ADMIN_URL = (
    os.environ.get("DJANGO_ADMIN_URL", "memory-admin/").strip("/")
    or "memory-admin"
) + "/"

SECURE_SSL_REDIRECT = env_bool(
    "DJANGO_SECURE_SSL_REDIRECT",
    default=IS_PRODUCTION,
)
SECURE_HSTS_SECONDS = env_int(
    "DJANGO_SECURE_HSTS_SECONDS",
    31536000 if IS_PRODUCTION else 0,
)
SECURE_HSTS_INCLUDE_SUBDOMAINS = env_bool(
    "DJANGO_SECURE_HSTS_INCLUDE_SUBDOMAINS",
    default=IS_PRODUCTION,
)
SECURE_HSTS_PRELOAD = env_bool(
    "DJANGO_SECURE_HSTS_PRELOAD",
    default=IS_PRODUCTION,
)
SECURE_CONTENT_TYPE_NOSNIFF = True
SECURE_REFERRER_POLICY = "same-origin"
X_FRAME_OPTIONS = "DENY"
# Honour the reverse proxy's TLS header when the deployment terminates TLS
# in front of Django.
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")


# ============================================================
# LOGGING
# ============================================================

# Security events (failed/locked logins, verification, permission denied) are
# logged by apps.accounts; Django's own security logger is kept at WARNING.
LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {
        "verbose": {
            "format": "{levelname} {asctime} {name} {message}",
            "style": "{",
        },
    },
    "handlers": {
        "console": {
            "class": "logging.StreamHandler",
            "formatter": "verbose",
        },
    },
    "root": {
        "handlers": ["console"],
        "level": "INFO",
    },
    "loggers": {
        "django.request": {
            "handlers": ["console"],
            "level": "ERROR",
            "propagate": False,
        },
        "django.security": {
            "handlers": ["console"],
            "level": "WARNING",
            "propagate": False,
        },
        "apps.accounts": {
            "handlers": ["console"],
            "level": "INFO",
            "propagate": False,
        },
    },
}