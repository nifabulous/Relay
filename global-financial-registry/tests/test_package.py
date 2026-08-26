from typer.testing import CliRunner

from financial_registry import __version__
from financial_registry.cli import app


def test_package_version_is_exposed():
    assert __version__ == "0.1.0"


def test_cli_help_is_available():
    result = CliRunner().invoke(app, ["--help"])
    assert result.exit_code == 0
    assert "validate" in result.stdout
    assert "release-build" in result.stdout
