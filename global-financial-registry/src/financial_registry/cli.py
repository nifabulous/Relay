from datetime import datetime
from pathlib import Path
import json

import typer
from pydantic import ValidationError

from .domain import RegistryInput
from .release import ReleaseBuilder, ReleaseValidationError

app = typer.Typer(no_args_is_help=True)


def _resolve_input_path(path: str) -> Path:
    p = Path(path)
    if p.is_absolute():
        return p.resolve()
    # Try relative to cwd
    cwd_candidate = (Path.cwd() / p).resolve()
    if cwd_candidate.exists():
        return cwd_candidate
    # Try relative to global-financial-registry dir
    alt = (Path.cwd() / "global-financial-registry" / p).resolve()
    if alt.exists():
        return alt
    # Try relative to package root (for tests running from different cwd)
    pkg_root = Path(__file__).resolve().parents[2]
    alt2 = (pkg_root / p).resolve() if (pkg_root / p).exists() else None
    if alt2 and alt2.exists():
        return alt2
    # Fallback to resolve relative to cwd (will raise FileNotFound later)
    return p.resolve()


def _load(path: str) -> RegistryInput:
    input_path = _resolve_input_path(path)
    registry = RegistryInput.model_validate(json.loads(input_path.read_text(encoding="utf-8")))
    if registry.asset_root and not Path(registry.asset_root).is_absolute():
        # Resolve relative to input file's parent
        # Also handle case where asset_root is "logos" and input is in data/fixtures
        resolved = (input_path.parent / registry.asset_root).resolve()
        # If not exists, try alternative resolution via package root
        if not resolved.exists():
            # Try input_path.parent is already resolved, so try again with cwd prefix
            alt = (Path.cwd() / "global-financial-registry" / "data" / "fixtures" / registry.asset_root).resolve()
            if alt.exists():
                resolved = alt
        registry = registry.model_copy(update={"asset_root": str(resolved)})
    return registry


@app.command("validate")
def validate(input_path: str = typer.Argument(...)) -> None:
    try:
        registry = _load(input_path)
        issues = ReleaseBuilder().validate(registry, generation_commit="validation")
    except FileNotFoundError as exc:
        typer.echo(f"error[input_not_found] {exc}", err=True)
        raise typer.Exit(code=1) from exc
    except (json.JSONDecodeError, ValidationError) as exc:
        typer.echo(f"error[input_invalid] {exc}", err=True)
        raise typer.Exit(code=1) from exc
    except ReleaseValidationError as exc:
        typer.echo(f"error[release_invalid] {exc}", err=True)
        raise typer.Exit(code=1) from exc
    except OSError as exc:
        typer.echo(f"error[release_io] {exc}", err=True)
        raise typer.Exit(code=1) from exc
    except ValueError as exc:
        typer.echo(f"error[release_invalid] {exc}", err=True)
        raise typer.Exit(code=1) from exc
    if issues:
        for issue in issues:
            typer.echo(f"error[release_invalid] {issue}", err=True)
        raise typer.Exit(code=1)
    typer.echo(f"valid: {input_path}")


@app.command("release-build")
def release_build(
    input_path: str = typer.Argument(...),
    output_dir: str = typer.Argument(...),
    version: str = typer.Option(..., "--version"),
    generated_at: str = typer.Option(..., "--generated-at"),
    generation_commit: str = typer.Option(..., "--generation-commit"),
) -> None:
    try:
        registry = _load(input_path)
        timestamp = datetime.fromisoformat(generated_at)
        manifest = ReleaseBuilder().build(
            registry,
            version,
            timestamp,
            Path(output_dir),
            generation_commit=generation_commit,
        )
    except FileNotFoundError as exc:
        typer.echo(f"error[input_not_found] {exc}", err=True)
        raise typer.Exit(code=1) from exc
    except (json.JSONDecodeError, ValidationError) as exc:
        typer.echo(f"error[input_invalid] {exc}", err=True)
        raise typer.Exit(code=1) from exc
    except ReleaseValidationError as exc:
        typer.echo(f"error[release_invalid] {exc}", err=True)
        raise typer.Exit(code=1) from exc
    except OSError as exc:
        typer.echo(f"error[release_io] {exc}", err=True)
        raise typer.Exit(code=1) from exc
    except ValueError as exc:
        typer.echo(f"error[release_invalid] {exc}", err=True)
        raise typer.Exit(code=1) from exc
    typer.echo(f"release {manifest.release_version}: {output_dir}")


def main() -> None:
    app()
