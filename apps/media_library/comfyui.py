"""Local ComfyUI image-generation service.

Only this server-side module talks to ComfyUI. It submits an API-format
workflow, polls the job with a bounded deadline, downloads the declared output
through ComfyUI's validated ``/view`` route, and returns a metadata-free PNG.

No hosted providers, API keys, or tokens are involved.
"""

from __future__ import annotations

import json
import re
import secrets
import time
from dataclasses import dataclass
from io import BytesIO
from pathlib import Path
from typing import Any, Callable, Mapping
from urllib.parse import urlparse

import requests
from django.conf import settings
from PIL import Image, UnidentifiedImageError

POLL_INTERVAL_SECONDS = 0.75
MAX_DOWNLOAD_BYTES = 20 * 1024 * 1024
REQUIRED_PLACEHOLDERS = (
    "__CHECKPOINT__",
    "__PROMPT__",
    "__SEED__",
    "__WIDTH__",
    "__HEIGHT__",
    "__STEPS__",
)
FORMAT_CONTENT_TYPES = {
    "JPEG": "image/jpeg",
    "PNG": "image/png",
    "WEBP": "image/webp",
}
SAFE_PROMPT_ID = re.compile(r"^[A-Za-z0-9_-]{1,128}$")


class ComfyUIError(Exception):
    """Base class for expected, safe-to-report ComfyUI failures."""


class ComfyUIConfigurationError(ComfyUIError):
    """The local endpoint or workflow is missing or malformed."""


class ComfyUIUnavailableError(ComfyUIError):
    """ComfyUI cannot be reached or returned a server error."""


class ComfyUITimeoutError(ComfyUIError):
    """ComfyUI did not finish within the configured deadline."""


class ComfyUIGenerationError(ComfyUIError):
    """ComfyUI rejected the workflow or reported a generation failure."""


class ComfyUIInvalidOutputError(ComfyUIError):
    """ComfyUI returned an invalid or unsafe output reference/image."""


@dataclass(frozen=True, slots=True)
class GeneratedImage:
    data: bytes
    content_type: str


def _resolve_workflow_path(value: str | Path) -> Path:
    path = Path(value)
    if not path.is_absolute():
        path = settings.BASE_DIR / path
    return path


def _reject_unsafe_path_part(value: str) -> bool:
    return (
        any(ord(character) < 32 for character in value)
        or "/" in value
        or "\\" in value
        or ":" in value
        or value in {".", ".."}
    )


def _validate_output_reference(item: Mapping[str, Any]) -> tuple[str, str]:
    if item.get("type") != "output":
        raise ComfyUIInvalidOutputError("ComfyUI returned a non-output image.")

    filename = item.get("filename")
    if (
        not isinstance(filename, str)
        or not filename
        or len(filename) > 255
        or _reject_unsafe_path_part(filename)
    ):
        raise ComfyUIInvalidOutputError("ComfyUI returned an unsafe output filename.")

    subfolder = item.get("subfolder", "")
    if subfolder is None:
        subfolder = ""
    if not isinstance(subfolder, str) or len(subfolder) > 512:
        raise ComfyUIInvalidOutputError("ComfyUI returned an unsafe output folder.")
    if subfolder:
        parts = subfolder.split("/")
        if any(not part or _reject_unsafe_path_part(part) for part in parts):
            raise ComfyUIInvalidOutputError("ComfyUI returned an unsafe output folder.")

    return filename, subfolder


def _pick_output_image(entry: Mapping[str, Any]) -> tuple[str, str]:
    outputs = entry.get("outputs")
    if not isinstance(outputs, Mapping):
        raise ComfyUIInvalidOutputError("ComfyUI returned no generation outputs.")

    for node_output in outputs.values():
        if not isinstance(node_output, Mapping):
            continue
        images = node_output.get("images")
        if not isinstance(images, list):
            continue
        for item in images:
            if isinstance(item, Mapping) and item.get("type") == "output":
                return _validate_output_reference(item)

    raise ComfyUIInvalidOutputError("ComfyUI returned no output image.")


def _sanitize_image(
    data: bytes,
    declared_content_type: str,
    expected_size: tuple[int, int],
) -> bytes:
    if not data:
        raise ComfyUIInvalidOutputError("ComfyUI returned an empty image.")

    try:
        with Image.open(BytesIO(data)) as image:
            image_format = (image.format or "").upper()
            if image_format not in FORMAT_CONTENT_TYPES:
                raise ComfyUIInvalidOutputError(
                    "ComfyUI returned an unsupported image format."
                )
            if getattr(image, "is_animated", False):
                raise ComfyUIInvalidOutputError(
                    "ComfyUI returned an animated image."
                )

            width, height = image.size
            if (
                width <= 0
                or height <= 0
                or width * height > settings.MEDIA_IMAGE_MAX_PIXELS
                or (width, height) != expected_size
            ):
                raise ComfyUIInvalidOutputError(
                    "ComfyUI returned an image with unexpected dimensions."
                )

            image.load()
            if image.mode not in ("RGB", "RGBA", "L"):
                image = image.convert("RGB")

            # Drop every source metadata block (text chunks, EXIF, ICC, DPI)
            # before re-encoding. ComfyUI's SaveImage normally embeds the
            # prompt/workflow in PNG text chunks, but the provider must not
            # decide which metadata reaches stored images.
            image.info.clear()
            output = BytesIO()
            image.save(output, format="PNG")
    except ComfyUIError:
        raise
    except (
        UnidentifiedImageError,
        Image.DecompressionBombError,
        OSError,
        SyntaxError,
        ValueError,
    ) as exc:
        raise ComfyUIInvalidOutputError(
            "ComfyUI returned an invalid image."
        ) from exc

    if FORMAT_CONTENT_TYPES[image_format] != declared_content_type:
        raise ComfyUIInvalidOutputError(
            "ComfyUI's image type did not match its content type."
        )

    sanitized = output.getvalue()
    if not sanitized or len(sanitized) > MAX_DOWNLOAD_BYTES:
        raise ComfyUIInvalidOutputError("ComfyUI returned an invalid image size.")
    return sanitized


class ComfyUIClient:
    """Small HTTP client for a local ComfyUI instance."""

    def __init__(
        self,
        *,
        base_url: str | None = None,
        workflow_path: str | Path | None = None,
        checkpoint: str | None = None,
        timeout: float | None = None,
        request_timeout: float | None = None,
        poll_interval: float = POLL_INTERVAL_SECONDS,
        session: requests.Session | None = None,
        sleep_func: Callable[[float], None] = time.sleep,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        self.base_url = (base_url or settings.COMFYUI_BASE_URL).rstrip("/")
        parsed = urlparse(self.base_url)
        if parsed.scheme not in {"http", "https"} or not parsed.netloc:
            raise ComfyUIConfigurationError("The ComfyUI base URL is invalid.")

        self.workflow_path = _resolve_workflow_path(
            workflow_path or settings.COMFYUI_WORKFLOW_PATH
        )
        self.checkpoint = (
            checkpoint if checkpoint is not None else settings.COMFYUI_CHECKPOINT
        ).strip()
        self.timeout = float(
            settings.COMFYUI_TIMEOUT if timeout is None else timeout
        )
        self.request_timeout = float(
            settings.COMFYUI_REQUEST_TIMEOUT
            if request_timeout is None
            else request_timeout
        )
        self.poll_interval = max(0.0, float(poll_interval))
        if session is None:
            session = requests.Session()
            # ComfyUI is local; never route its traffic through an HTTP proxy.
            session.trust_env = False
        self.session = session
        self.client_id = secrets.token_hex(16)
        self._sleep = sleep_func
        self._clock = clock

    def generate(
        self,
        *,
        prompt: str,
        width: int,
        height: int,
        steps: int,
        seed: int | None = None,
    ) -> GeneratedImage:
        prompt = " ".join(prompt.split())
        if not prompt or len(prompt) > settings.MEDIA_GENERATION_MAX_PROMPT_LENGTH:
            raise ComfyUIGenerationError("The generation prompt is invalid.")

        if (width, height) not in settings.MEDIA_GENERATION_ALLOWED_SIZES:
            raise ComfyUIGenerationError("The requested image size is not supported.")
        if not (
            settings.MEDIA_GENERATION_MIN_STEPS
            <= steps
            <= settings.MEDIA_GENERATION_MAX_STEPS
        ):
            raise ComfyUIGenerationError("The requested step count is not supported.")

        deadline = self._clock() + self.timeout
        workflow = self._build_workflow(
            prompt=prompt,
            width=width,
            height=height,
            steps=steps,
            seed=secrets.randbelow(2**63) if seed is None else seed,
        )
        prompt_id = self._submit(workflow, deadline)
        return self._wait_for_result(prompt_id, deadline, (width, height))

    def _build_workflow(
        self,
        *,
        prompt: str,
        width: int,
        height: int,
        steps: int,
        seed: int,
    ) -> dict[str, Any]:
        if not self.checkpoint:
            raise ComfyUIConfigurationError(
                "The ComfyUI checkpoint is not configured."
            )

        try:
            template = json.loads(self.workflow_path.read_text(encoding="utf-8"))
        except (OSError, ValueError) as exc:
            raise ComfyUIConfigurationError(
                "The ComfyUI workflow could not be loaded."
            ) from exc

        if not isinstance(template, dict) or not template:
            raise ComfyUIConfigurationError("The ComfyUI workflow is invalid.")

        replacements = {
            "__CHECKPOINT__": self.checkpoint,
            "__PROMPT__": prompt,
            "__SEED__": int(seed),
            "__WIDTH__": int(width),
            "__HEIGHT__": int(height),
            "__STEPS__": int(steps),
        }
        counts = {placeholder: 0 for placeholder in REQUIRED_PLACEHOLDERS}

        def replace(node):
            if isinstance(node, dict):
                return {key: replace(value) for key, value in node.items()}
            if isinstance(node, list):
                return [replace(value) for value in node]
            if isinstance(node, str) and node in replacements:
                counts[node] += 1
                return replacements[node]
            return node

        workflow = replace(template)
        if any(count != 1 for count in counts.values()):
            raise ComfyUIConfigurationError(
                "Each ComfyUI workflow placeholder must appear exactly once."
            )
        return workflow

    def _remaining(self, deadline: float) -> float:
        remaining = deadline - self._clock()
        if remaining <= 0:
            raise ComfyUITimeoutError("Image generation timed out.")
        return remaining

    def _request_timeout(self, deadline: float) -> float:
        return max(0.1, min(self.request_timeout, self._remaining(deadline)))

    def _json(self, response: requests.Response) -> Any:
        try:
            return response.json()
        except ValueError as exc:
            raise ComfyUIInvalidOutputError(
                "ComfyUI returned an invalid response."
            ) from exc

    def _submit(self, workflow: Mapping[str, Any], deadline: float) -> str:
        try:
            response = self.session.post(
                f"{self.base_url}/prompt",
                json={"prompt": workflow, "client_id": self.client_id},
                timeout=self._request_timeout(deadline),
            )
        except requests.Timeout as exc:
            raise ComfyUITimeoutError("Image generation timed out.") from exc
        except requests.RequestException as exc:
            raise ComfyUIUnavailableError(
                "The local image generation service is unavailable."
            ) from exc

        if response.status_code >= 500:
            raise ComfyUIUnavailableError(
                "The local image generation service is unavailable."
            )
        if response.status_code != 200:
            raise ComfyUIGenerationError(
                "ComfyUI rejected the generation workflow."
            )

        payload = self._json(response)
        if not isinstance(payload, Mapping):
            raise ComfyUIInvalidOutputError(
                "ComfyUI returned an invalid submission response."
            )
        if payload.get("node_errors"):
            raise ComfyUIGenerationError(
                "ComfyUI rejected the generation workflow."
            )

        prompt_id = payload.get("prompt_id")
        if not isinstance(prompt_id, str) or not SAFE_PROMPT_ID.fullmatch(prompt_id):
            raise ComfyUIInvalidOutputError(
                "ComfyUI returned an invalid job id."
            )
        return prompt_id

    def _wait_for_result(
        self,
        prompt_id: str,
        deadline: float,
        expected_size: tuple[int, int],
    ) -> GeneratedImage:
        while True:
            try:
                response = self.session.get(
                    f"{self.base_url}/history/{prompt_id}",
                    timeout=self._request_timeout(deadline),
                )
            except requests.Timeout as exc:
                raise ComfyUITimeoutError("Image generation timed out.") from exc
            except requests.RequestException as exc:
                raise ComfyUIUnavailableError(
                    "The local image generation service is unavailable."
                ) from exc

            if response.status_code >= 500:
                raise ComfyUIUnavailableError(
                    "The local image generation service is unavailable."
                )
            if response.status_code == 404:
                raise ComfyUIGenerationError(
                    "ComfyUI could not find the generation job."
                )
            if response.status_code != 200:
                raise ComfyUIGenerationError("Image generation failed.")

            payload = self._json(response)
            if not isinstance(payload, Mapping):
                raise ComfyUIInvalidOutputError(
                    "ComfyUI returned an invalid history response."
                )

            entry = payload.get(prompt_id)
            if entry is not None:
                if not isinstance(entry, Mapping):
                    raise ComfyUIInvalidOutputError(
                        "ComfyUI returned an invalid history entry."
                    )

                status_info = entry.get("status")
                if (
                    isinstance(status_info, Mapping)
                    and status_info.get("status_str") == "error"
                ):
                    raise ComfyUIGenerationError("ComfyUI reported a generation error.")
                if (
                    isinstance(status_info, Mapping)
                    and status_info.get("completed") is False
                ):
                    self._pause(deadline)
                    continue

                filename, subfolder = _pick_output_image(entry)
                return self._download(
                    filename,
                    subfolder,
                    deadline,
                    expected_size,
                )

            self._pause(deadline)

    def _pause(self, deadline: float) -> None:
        self._sleep(min(self.poll_interval, self._remaining(deadline)))

    def _download(
        self,
        filename: str,
        subfolder: str,
        deadline: float,
        expected_size: tuple[int, int],
    ) -> GeneratedImage:
        try:
            response = self.session.get(
                f"{self.base_url}/view",
                params={
                    "filename": filename,
                    "subfolder": subfolder,
                    "type": "output",
                },
                stream=True,
                timeout=self._request_timeout(deadline),
                allow_redirects=False,
            )
        except requests.Timeout as exc:
            raise ComfyUITimeoutError("Image generation timed out.") from exc
        except requests.RequestException as exc:
            raise ComfyUIUnavailableError(
                "The local image generation service is unavailable."
            ) from exc

        try:
            if response.status_code >= 500:
                raise ComfyUIUnavailableError(
                    "The local image generation service is unavailable."
                )
            if response.status_code != 200:
                raise ComfyUIGenerationError(
                    "ComfyUI could not return the generated image."
                )

            content_type = response.headers.get("Content-Type", "")
            content_type = content_type.split(";", 1)[0].strip().lower()
            if content_type not in FORMAT_CONTENT_TYPES.values():
                raise ComfyUIInvalidOutputError(
                    "ComfyUI returned an unsupported image content type."
                )

            content_length = response.headers.get("Content-Length")
            if content_length is not None:
                try:
                    declared_length = int(content_length)
                except (TypeError, ValueError) as exc:
                    raise ComfyUIInvalidOutputError(
                        "ComfyUI returned an invalid image size."
                    ) from exc
                if declared_length <= 0 or declared_length > MAX_DOWNLOAD_BYTES:
                    raise ComfyUIInvalidOutputError(
                        "ComfyUI returned an invalid image size."
                    )

            buffer = BytesIO()
            total = 0
            try:
                for chunk in response.iter_content(chunk_size=64 * 1024):
                    self._remaining(deadline)
                    if not chunk:
                        continue
                    total += len(chunk)
                    if total > MAX_DOWNLOAD_BYTES:
                        raise ComfyUIInvalidOutputError(
                            "ComfyUI returned an image that is too large."
                        )
                    buffer.write(chunk)
            except requests.Timeout as exc:
                raise ComfyUITimeoutError("Image generation timed out.") from exc
            except requests.RequestException as exc:
                raise ComfyUIUnavailableError(
                    "The local image generation service is unavailable."
                ) from exc

            sanitized = _sanitize_image(
                buffer.getvalue(),
                content_type,
                expected_size,
            )
            return GeneratedImage(data=sanitized, content_type="image/png")
        finally:
            close = getattr(response, "close", None)
            if close is not None:
                close()


def build_client() -> ComfyUIClient:
    """Create a client from Django settings for the generation view."""

    return ComfyUIClient()
