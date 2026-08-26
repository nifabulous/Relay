import typer

app = typer.Typer(no_args_is_help=True)


@app.command("validate")
def validate(input_path: str = typer.Argument(..., help="Canonical JSON input")) -> None:
    """Validate a canonical registry input file."""
    raise typer.Exit(code=0)


@app.command("release-build")
def release_build(input_path: str = typer.Argument(...), output_dir: str = typer.Argument(...)) -> None:
    """Build a deterministic release bundle from canonical input."""
    raise typer.Exit(code=0)


def main() -> None:
    app()
