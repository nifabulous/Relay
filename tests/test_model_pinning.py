"""Model-pinning drift test (T6, loop-engineering plan §9.1).

§9.1 keeps every model slot swappable with three rules, and this test is the
"drift test in the automation suite" rule 3 says must enforce the ban
mechanically:

1. Tier aliases, never versioned IDs. Every Claude agent under
   `.claude/agents/*.md` must declare `model: opus` / `sonnet` / `haiku` /
   `fable` — never a versioned id like `claude-opus-5-20260101`. That ban is
   absolute: there is no sanctioned fallback shape for a *Claude* model id
   (only externally-hosted slots get the fallback carve-out below), so a
   versioned Claude id fails wherever it appears.
2. External models bind through a variable with a fallback default, not a
   bare hardcoded id. The workflows legitimately contain
   `${{ vars.CODEX_MODEL || 'gpt-5.3-codex' }}` (`.github/workflows/codex-pr-
   review.yml`, `codex-issue-triage.yml`) — the sanctioned "external model
   binds through a variable, with a default" shape. A hardcoded vendor model
   id is only banned when it sits OUTSIDE that `|| '<id>'` / `|| "<id>"`
   shape; the same literal appearing a second time, unguarded, still fails.
3. The scan covers exactly the three places a model id could hide:
   `.claude/agents/*.md`, `scripts/`, and `.github/workflows/`.

Deliberately NOT scanned/asserted here: bare variable uses such as
`--model "$CODEX_MODEL"` or `: "${CODEX_MODEL:?CODEX_MODEL is required}"`.
Those name a variable, not a model id, so neither regex below matches them
at all -- see test_codex_model_variable_uses_are_not_flagged for a regression
guard that keeps it that way.
"""

import re
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
AGENTS_DIR = ROOT / ".claude" / "agents"
SCAN_ROOTS = [AGENTS_DIR, ROOT / "scripts", ROOT / ".github" / "workflows"]
SCAN_SUFFIXES = {".md", ".py", ".sh", ".yml", ".yaml", ".json", ".toml", ".cfg", ".ini"}

ALLOWED_TIERS = {"opus", "sonnet", "haiku", "fable"}
REQUIRED_AGENTS = {
    "feasibility-researcher.md",
    "precedent-researcher.md",
    "impact-researcher.md",
    "domain-researcher.md",
    "verifying-executor.md",
}

# Rule 1: versioned Claude ids are banned unconditionally, everywhere scanned.
# e.g. "claude-opus-5-20260101" -- never a bare version number ("claude-3"),
# always vendor + tier-word + a leading digit of a version/date.
CLAUDE_VERSIONED_RE = re.compile(r"claude-[a-z]+-[0-9]", re.IGNORECASE)

# Rule 2: hardcoded vendor model ids are banned unless they sit inside the
# sanctioned `|| '<id>'` fallback shape. Scoped to known LLM vendor id
# shapes (gpt-/o-series, gemini, grok, mistral, llama, deepseek) rather than
# a bare word-digit pattern, so the scan does not trip over unrelated
# hyphenated version strings that fill scripts/ and workflow files (action
# versions, Python version pins, etc).
VENDOR_MODEL_ID_RE = re.compile(
    r"\b(?:gpt-[0-9][\w.\-]*|o[0-9][\w.\-]*|gemini-[\w.\-]+|grok-[\w.\-]+"
    r"|mistral-[\w.\-]+|llama-?[0-9][\w.\-]*|deepseek-[\w.\-]+)\b",
    re.IGNORECASE,
)

# The sanctioned fallback shape itself: `|| '<id>'` / `|| "<id>"` (shell
# `${VAR:-'<id>'}` and GitHub Actions `${{ vars.X || '<id>' }}` both produce
# this same `|| '<id>'` text). Only an id whose *occurrence* falls inside one
# of these captured spans is allowlisted -- the same literal string appearing
# a second time elsewhere in the file is still a hardcoded id.
FALLBACK_RE = re.compile(r"\|\|\s*(['\"])(?P<id>[^'\"]+)\1")

# A bare, flush-left `model:` frontmatter key. Anchored so a `>`-folded
# description line that happens to contain the word "model" (indented, as
# any block-scalar continuation line must be) can never match.
FRONTMATTER_MODEL_RE = re.compile(r"^model:\s*(\S+)", re.MULTILINE)


def _iter_scanned_files():
    for root in SCAN_ROOTS:
        if not root.exists():
            continue
        for path in sorted(root.rglob("*")):
            if path.is_file() and path.suffix in SCAN_SUFFIXES:
                yield path


def _fallback_spans(text: str) -> list[tuple[int, int]]:
    return [match.span("id") for match in FALLBACK_RE.finditer(text)]


def _inside_any(span: tuple[int, int], spans: list[tuple[int, int]]) -> bool:
    start, end = span
    return any(s <= start and end <= e for s, e in spans)


def _frontmatter_block(path: Path) -> str:
    text = path.read_text()
    assert text.startswith("---\n"), f"{path.name}: missing YAML frontmatter fence"
    end = text.find("\n---", 4)
    assert end != -1, f"{path.name}: unterminated YAML frontmatter fence"
    return text[4:end]


def _agent_model(path: Path) -> str | None:
    match = FRONTMATTER_MODEL_RE.search(_frontmatter_block(path))
    return match.group(1) if match else None


_SCANNED_FILES = list(_iter_scanned_files())
_AGENT_FILES = sorted(AGENTS_DIR.glob("*.md")) if AGENTS_DIR.exists() else []


def test_agent_files_exist():
    actual = {p.name for p in AGENTS_DIR.glob("*.md")}
    missing = REQUIRED_AGENTS - actual
    assert not missing, f"missing required agent definitions: {sorted(missing)}"


def test_scan_covers_all_three_locations():
    # A silently-empty scan root (typo'd path, directory renamed) would make
    # every test below vacuously pass. Fail loudly instead.
    for root in SCAN_ROOTS:
        assert root.is_dir(), f"expected scan root {root} to exist"
    assert _SCANNED_FILES, "no files collected across .claude/agents, scripts, .github/workflows"


@pytest.mark.parametrize(
    "path", _AGENT_FILES, ids=[p.name for p in _AGENT_FILES]
)
def test_agent_model_is_a_tier_alias(path: Path):
    model = _agent_model(path)
    assert model in ALLOWED_TIERS, (
        f"{path.name}: model: {model!r} is not a bare tier alias "
        f"({sorted(ALLOWED_TIERS)}) -- plan §9.1 rule 1 bans versioned ids "
        "in agent frontmatter."
    )


@pytest.mark.parametrize(
    "path", _SCANNED_FILES, ids=[str(p.relative_to(ROOT)) for p in _SCANNED_FILES]
)
def test_no_versioned_claude_id(path: Path):
    text = path.read_text()
    match = CLAUDE_VERSIONED_RE.search(text)
    assert match is None, (
        f"{path.relative_to(ROOT)}: versioned Claude model id {match.group()!r} "
        "found -- agents must declare a tier alias (opus/sonnet/haiku/fable), "
        "never a versioned id, and no fallback shape excuses this (plan §9.1 "
        "rule 1)."
    )


@pytest.mark.parametrize(
    "path", _SCANNED_FILES, ids=[str(p.relative_to(ROOT)) for p in _SCANNED_FILES]
)
def test_no_hardcoded_vendor_id_outside_fallback(path: Path):
    text = path.read_text()
    allowed = _fallback_spans(text)
    offenders = [
        match.group()
        for match in VENDOR_MODEL_ID_RE.finditer(text)
        if not _inside_any(match.span(), allowed)
    ]
    assert not offenders, (
        f"{path.relative_to(ROOT)}: hardcoded vendor model id(s) "
        f"{offenders!r} outside the sanctioned `|| '<id>'` fallback shape "
        "(plan §9.1 rule 2). Bind through a variable with a fallback "
        "default instead, the way CODEX_MODEL does."
    )


def test_sanctioned_fallback_pattern_is_not_flagged():
    """Positive control: the workflows' sanctioned
    `${{ vars.CODEX_MODEL || 'gpt-5.3-codex' }}` shape (§9.1 rule 2) must be
    present and must be recognized as allowlisted, not merely absent-of-
    violations by coincidence. Guards against the allowlist regex rotting
    into one that allowlists nothing (making the other tests pass vacuously)
    or everything (making them meaningless)."""
    for name in ("codex-pr-review.yml", "codex-issue-triage.yml"):
        path = ROOT / ".github" / "workflows" / name
        text = path.read_text()
        assert "vars.CODEX_MODEL || 'gpt-5.3-codex'" in text, (
            f"{name}: expected the sanctioned CODEX_MODEL fallback literal"
        )
        allowed = _fallback_spans(text)
        matches = list(VENDOR_MODEL_ID_RE.finditer(text))
        assert matches, f"{name}: expected the sanctioned literal to match the vendor-id shape"
        unguarded = [m.group() for m in matches if not _inside_any(m.span(), allowed)]
        assert not unguarded, f"{name}: sanctioned literal was not recognized as allowlisted"


def test_codex_model_variable_uses_are_not_flagged():
    """Regression guard for the brief's explicit callout: `CODEX_MODEL`
    variable uses (`--model "$CODEX_MODEL"`, the required-var check, the
    workflow env declaration) are variable references, not hardcoded ids,
    and must never trip either banned-pattern check."""
    for relpath in (
        "scripts/codex_review_pr.sh",
        "scripts/codex_triage_issue.sh",
        ".github/workflows/codex-pr-review.yml",
        ".github/workflows/codex-issue-triage.yml",
    ):
        path = ROOT / relpath
        text = path.read_text()
        assert "$CODEX_MODEL" in text or "CODEX_MODEL:" in text, (
            f"{relpath}: expected a CODEX_MODEL variable use to check against"
        )
        assert CLAUDE_VERSIONED_RE.search(text) is None
        allowed = _fallback_spans(text)
        offenders = [
            m.group() for m in VENDOR_MODEL_ID_RE.finditer(text) if not _inside_any(m.span(), allowed)
        ]
        assert not offenders, f"{relpath}: variable uses unexpectedly flagged as {offenders!r}"


def test_scan_suffixes_include_config_formats():
    """A versioned model id can hide in a config file as easily as in a
    script or doc -- scripts/ssi-autopilot/regions.json already exists as a
    real .json config under a scanned root, and was invisible to the drift
    scan before this suffix set covered it. Positively assert the coverage
    so a future trim of SCAN_SUFFIXES can't silently reopen the gap."""
    missing = {".json", ".toml", ".cfg", ".ini"} - SCAN_SUFFIXES
    assert not missing, f"SCAN_SUFFIXES is missing config suffixes: {sorted(missing)}"


def test_versioned_claude_id_in_json_config_is_caught():
    """Regression, proven by planting a real violation rather than merely
    asserting suffix membership: a versioned Claude id hiding in a .json
    config under a scanned root must not be invisible just because the file
    is JSON instead of one of the original script/doc suffixes. Plants a
    temp .json file under scripts/ (a scanned root, alongside the real
    scripts/ssi-autopilot/regions.json), re-runs the module's own
    suffix-filtered file walk, and proves the planted id is both collected
    and flagged by the drift regex."""
    planted = ROOT / "scripts" / "_test_model_pinning_drift_plant.json"
    assert not planted.exists(), f"stale fixture file left over from a previous run: {planted}"
    planted.write_text('{"model": "claude-opus-5-20260101"}\n')
    try:
        rescanned = list(_iter_scanned_files())
        assert planted in rescanned, (
            f"{planted.name}: a .json file under a scanned root was not "
            "collected by _iter_scanned_files() -- SCAN_SUFFIXES is missing "
            "'.json'"
        )
        match = CLAUDE_VERSIONED_RE.search(planted.read_text())
        assert match is not None, (
            f"{planted.name}: planted versioned Claude id "
            "'claude-opus-5-20260101' was not detected by CLAUDE_VERSIONED_RE"
        )
    finally:
        planted.unlink(missing_ok=True)
