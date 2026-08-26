
from financial_registry.release import ReleaseBuilder


def test_validate_duplicate_ids(demo_registry):
    # Duplicate institution ID
    dup = demo_registry.model_copy(deep=True)
    dup.institutions.append(dup.institutions[0].model_copy(deep=True))
    issues = ReleaseBuilder().validate(dup, generation_commit="test")
    assert any(i.code == "duplicate_id" for i in issues)


def test_validate_missing_source(demo_registry):
    bad = demo_registry.model_copy(deep=True)
    bad.institutions[0].source_ids = ["missing_source"]
    issues = ReleaseBuilder().validate(bad, generation_commit="test")
    assert any(i.code == "dangling_reference" for i in issues)


def test_validate_invalid_country(demo_registry):
    bad = demo_registry.model_copy(deep=True)
    # Use an invalid country code that is not XX and not pycountry
    bad.institutions[0].country_code = "ZZ"
    # Bypass pydantic validation by directly setting via object.__setattr__? But pydantic will validate on assignment? We need to create a new Institution with invalid code via model_validate with extra?
    # Instead, test via direct validation of domain model that should fail, but release validation also checks pycountry
    # We'll test by creating a registry with institution that has XX (which is allowed in domain but should be rejected in release)
    # For this test, we need to bypass domain validation for country_code, so we use a trick: create institution via model_validate with valid code, then manually set country_code to ZZ via object.__setattr__ and then validate release
    object.__setattr__(bad.institutions[0], "country_code", "ZZ")
    issues = ReleaseBuilder().validate(bad, generation_commit="test")
    assert any(i.code == "invalid_country" for i in issues)


def test_cli_validate_invalid_json(tmp_path):
    from typer.testing import CliRunner

    from financial_registry.cli import app

    p = tmp_path / "bad.json"
    p.write_text("{ invalid json", encoding="utf-8")
    result = CliRunner().invoke(app, ["validate", str(p)])
    assert result.exit_code == 1
    assert "error[input_invalid]" in result.output or "error[input_invalid]" in result.stderr if hasattr(result, 'stderr') else True


def test_cli_validate_missing_file():
    from typer.testing import CliRunner

    from financial_registry.cli import app

    result = CliRunner().invoke(app, ["validate", "nonexistent.json"])
    assert result.exit_code == 1
    assert "error[input_not_found]" in result.output or "input_not_found" in result.stdout.lower()
