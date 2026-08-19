"""Tutor configuration: defaults, parsing, availability, and secret isolation.

The governing invariant for this module is that **the base install boots and
serves every existing route with no AI provider package and no provider key**.
Every test here defends some part of that.
"""
import subprocess
import sys

import pytest

from app.config import (
    TutorAvailability,
    tutor_availability,
    tutor_provider_api_key,
    tutor_settings,
)

_TUTOR_ENV_NAMES = (
    "TUTOR_ENABLED",
    "TUTOR_PROVIDER",
    "TUTOR_MODEL",
    "TUTOR_MAX_RETRIEVED_DOCS",
    "TUTOR_MAX_HISTORY_TURNS",
    "TUTOR_MAX_INPUT_TOKENS",
    "TUTOR_MAX_OUTPUT_TOKENS",
    "TUTOR_RATE_LIMIT_REDIS_URL",
    "TUTOR_RATE_LIMIT_REDIS_TOKEN",
    "TUTOR_TRACING_ENABLED",
    "OPENAI_API_KEY",
)


@pytest.fixture
def clean_tutor_env(monkeypatch):
    """A process with no tutor configuration at all — the default install."""
    for name in _TUTOR_ENV_NAMES:
        monkeypatch.delenv(name, raising=False)
    return monkeypatch


def test_defaults_are_off_and_safe(clean_tutor_env):
    settings = tutor_settings()
    assert settings.enabled is False
    assert settings.provider == "openai"
    assert settings.model == ""
    assert settings.max_retrieved_docs == 6
    assert settings.max_history_turns == 8
    assert settings.max_input_tokens == 14000
    assert settings.max_output_tokens == 4000
    assert settings.rate_limit_redis_url == ""
    assert settings.rate_limit_redis_token == ""
    assert settings.tracing_enabled is False


def test_settings_are_read_per_call_not_frozen_at_import(clean_tutor_env):
    """Reading at import time would make the flag untestable and undeployable.

    A module-level constant is captured once, so a platform that injects env
    vars after the module graph loads would silently keep the default.
    """
    assert tutor_settings().enabled is False
    clean_tutor_env.setenv("TUTOR_ENABLED", "true")
    assert tutor_settings().enabled is True


@pytest.mark.parametrize("raw", ["true", "TRUE", "True", "1", "yes", "on"])
def test_truthy_flag_spellings_all_enable(clean_tutor_env, raw):
    clean_tutor_env.setenv("TUTOR_ENABLED", raw)
    assert tutor_settings().enabled is True


@pytest.mark.parametrize("raw", ["false", "FALSE", "0", "no", "off", "", "  "])
def test_falsy_flag_spellings_all_disable(clean_tutor_env, raw):
    """Anything that is not affirmatively true leaves the tutor off.

    Fail-closed matters more here than tolerant parsing: a typo in a deploy
    variable must not turn on a paid external provider.
    """
    clean_tutor_env.setenv("TUTOR_ENABLED", raw)
    assert tutor_settings().enabled is False


def test_numeric_settings_are_read_as_integers(clean_tutor_env):
    clean_tutor_env.setenv("TUTOR_MAX_RETRIEVED_DOCS", "3")
    clean_tutor_env.setenv("TUTOR_MAX_HISTORY_TURNS", "2")
    clean_tutor_env.setenv("TUTOR_MAX_INPUT_TOKENS", "1500")
    clean_tutor_env.setenv("TUTOR_MAX_OUTPUT_TOKENS", "400")
    settings = tutor_settings()
    assert settings.max_retrieved_docs == 3
    assert settings.max_history_turns == 2
    assert settings.max_input_tokens == 1500
    assert settings.max_output_tokens == 400


@pytest.mark.parametrize("raw", ["not-a-number", "", "6.5", "-1", "0"])
def test_unparseable_or_nonpositive_numeric_settings_fall_back_to_the_default(
    clean_tutor_env, raw
):
    """A malformed limit must not become an unbounded or negative limit.

    Raising at import time would take the whole app down over a tutor setting
    that is off by default, so the safe response is the documented default.
    """
    clean_tutor_env.setenv("TUTOR_MAX_RETRIEVED_DOCS", raw)
    assert tutor_settings().max_retrieved_docs == 6


def test_history_turns_cannot_exceed_the_schema_maximum(clean_tutor_env):
    """`TutorRequest.history` is capped at 8 by Pydantic.

    A larger configured value could only ever be rejected at the boundary, so
    clamping here keeps configuration and schema from disagreeing.
    """
    clean_tutor_env.setenv("TUTOR_MAX_HISTORY_TURNS", "50")
    assert tutor_settings().max_history_turns == 8


def test_availability_is_disabled_when_the_flag_is_off(clean_tutor_env):
    clean_tutor_env.setenv("TUTOR_MODEL", "gpt-5")
    clean_tutor_env.setenv("OPENAI_API_KEY", "sk-test-value")
    assert tutor_availability() is TutorAvailability.DISABLED


def test_availability_is_unconfigured_when_enabled_without_a_model(clean_tutor_env):
    clean_tutor_env.setenv("TUTOR_ENABLED", "true")
    clean_tutor_env.setenv("OPENAI_API_KEY", "sk-test-value")
    assert tutor_availability() is TutorAvailability.UNCONFIGURED


def test_availability_is_unconfigured_when_enabled_without_a_key(clean_tutor_env):
    clean_tutor_env.setenv("TUTOR_ENABLED", "true")
    clean_tutor_env.setenv("TUTOR_MODEL", "gpt-5")
    assert tutor_availability() is TutorAvailability.UNCONFIGURED


def test_availability_is_ready_only_with_flag_model_and_key(clean_tutor_env):
    clean_tutor_env.setenv("TUTOR_ENABLED", "true")
    clean_tutor_env.setenv("TUTOR_MODEL", "gpt-5")
    clean_tutor_env.setenv("OPENAI_API_KEY", "sk-test-value")
    assert tutor_availability() is TutorAvailability.READY


def test_the_provider_key_is_not_a_field_on_the_settings_object(clean_tutor_env):
    """The key is deliberately reachable only through its own accessor.

    If it were a settings field, every future `model_dump()`/`asdict()` of the
    settings — in telemetry, a debug endpoint, an error report — would carry
    the secret by default. Keeping it off the serializable surface means a
    leak has to be written on purpose rather than inherited.
    """
    clean_tutor_env.setenv("OPENAI_API_KEY", "sk-test-value")
    dumped = repr(tutor_settings())
    assert "sk-test-value" not in dumped
    assert not any("key" in field.lower() for field in vars(tutor_settings()))
    assert tutor_provider_api_key() == "sk-test-value"


def test_importing_configuration_does_not_import_a_provider_sdk(clean_tutor_env):
    """Configuration stays provider-free even when the AI extra is installed.

    The full suite may have already imported PydanticAI through Sentry's
    optional auto-integration. A fresh interpreter tests the invariant at the
    module boundary instead of depending on test ordering.
    """
    del clean_tutor_env
    result = subprocess.run(
        [
            sys.executable,
            "-c",
            (
                "import sys; "
                "from app.config import tutor_settings, tutor_availability; "
                "tutor_settings(); tutor_availability(); "
                "assert not any(name == 'pydantic_ai' or "
                "name.startswith('pydantic_ai.') for name in sys.modules)"
            ),
        ],
        check=False,
        capture_output=True,
        text=True,
    )
    assert result.returncode == 0, result.stderr


# ── Dependency isolation ────────────────────────────────────────────────────
#
# These assert on packaging metadata rather than behaviour, because the
# invariant they defend is a packaging one: the request path must be installable
# and importable with no AI dependency at all.

def _pyproject() -> dict:
    # `tomllib` is 3.11+. The project floor is 3.10, so the backport carries
    # that one version rather than the packaging assertions silently skipping
    # there — a skipped dependency-isolation test still reports green.
    try:
        import tomllib
    except ModuleNotFoundError:  # Python 3.10
        import tomli as tomllib

    from app.config import BASE_DIR

    with open(BASE_DIR / "pyproject.toml", "rb") as handle:
        return tomllib.load(handle)


_AI_PACKAGE_MARKERS = ("pydantic-ai", "openai", "anthropic", "langfuse", "ragas", "presidio")


def test_no_ai_package_is_a_base_runtime_dependency():
    """The base install must stay free of provider and evaluation packages."""
    base = " ".join(_pyproject()["project"]["dependencies"]).lower()
    for marker in _AI_PACKAGE_MARKERS:
        assert marker not in base


def test_the_ai_extra_carries_the_provider_adapter():
    extras = _pyproject()["project"]["optional-dependencies"]
    ai = " ".join(extras["ai"]).lower()
    assert "pydantic-ai" in ai
    assert "openai" in ai


def test_evaluation_and_tracing_are_separate_extras_from_the_request_path():
    """Ragas must never be reachable from a request.

    Putting it in `ai` would install it on every production function build and
    make an accidental import at request time possible. It belongs behind its
    own extra that production never installs.
    """
    extras = _pyproject()["project"]["optional-dependencies"]
    ai = " ".join(extras["ai"]).lower()
    assert "ragas" not in ai
    assert "langfuse" not in ai
    assert "ragas" in " ".join(extras["eval"]).lower()
    assert "langfuse" in " ".join(extras["tracing"]).lower()


def test_the_vercel_function_build_installs_the_ai_extra():
    """Without an explicit installCommand the function ships without a provider.

    The tutor would then answer 503 "unconfigured" in production no matter what
    the environment variables said — a failure that only shows up after deploy.
    """
    import json

    from app.config import BASE_DIR

    with open(BASE_DIR / "vercel.json") as handle:
        vercel = json.load(handle)
    assert ".[ai]" in vercel["installCommand"]


def test_the_vercel_build_and_function_budget_match_the_tutor_contract():
    """The release configuration must preserve JSON headroom for the tutor.

    Vercel's function deadline is configuration, not an assumption encoded in
    a comment. Keep the build path and the request budget tied to the same
    checked artifact so a deployment change cannot silently reintroduce an
    opaque platform timeout.
    """
    import json

    from app.config import BASE_DIR
    from app.routers.tutor import TUTOR_TIMEOUT_SECONDS

    with open(BASE_DIR / "vercel.json") as handle:
        vercel = json.load(handle)

    assert vercel["installCommand"] == "cd frontend && npm ci && cd .. && pip install '.[ai]'"
    assert vercel["buildCommand"] == "cd frontend && npm run build"
    max_duration = vercel["functions"]["app/main.py"]["maxDuration"]
    assert isinstance(max_duration, int)
    assert max_duration == 30
    assert TUTOR_TIMEOUT_SECONDS <= max_duration - 5


def test_the_ai_extra_versions_are_locked_for_the_deployed_adapter():
    """Vercel and the provider-contract job must resolve the same SDK pair."""
    ai = _pyproject()["project"]["optional-dependencies"]["ai"]
    assert "pydantic-ai==2.31.1" in ai
    assert "openai==3.3.0" in ai


def test_env_example_documents_every_tutor_variable():
    """`.env.example` is the only discoverable list of what the app reads."""
    from app.config import BASE_DIR

    text = (BASE_DIR / ".env.example").read_text()
    for name in _TUTOR_ENV_NAMES:
        assert name in text, f"{name} is missing from .env.example"
