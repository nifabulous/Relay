"""
CLI for the SWIFT routing service.

Usage:
    python -m app.cli import-fedwire
    python -m app.cli import-fedach
    python -m app.cli import-ssi <file.csv|file.json>
    python -m app.cli stats
"""
import sys

from .db import Base, SessionLocal, engine
from .models import Bank, CorridorRule, FedACHBank, FedwireBank, SSI
from .services.fed_importer import import_fedach, import_fedwire
from .services.seed import seed_if_empty
from .services.ssi_importer import import_ssi_file


def ensure_schema():
    Base.metadata.create_all(bind=engine)


def cmd_import_fedwire():
    ensure_schema()
    with SessionLocal() as session:
        result = import_fedwire(session)
    print(f"[fedwire] inserted={result.inserted} source={result.source}")


def cmd_import_fedach():
    ensure_schema()
    with SessionLocal() as session:
        result = import_fedach(session)
    print(f"[fedach] inserted={result.inserted} source={result.source}")


def cmd_import_ssi():
    if len(sys.argv) < 3:
        print("Usage: python -m app.cli import-ssi <file.csv|file.json>", file=sys.stderr)
        return 1
    path = sys.argv[2]
    ensure_schema()
    with SessionLocal() as session:
        result = import_ssi_file(session, path)
    print(f"[ssi] {result.summary()}")
    if result.errors:
        print(f"\n  {len(result.errors)} row(s) rejected:")
        for err in result.errors:
            print(f"    row {err.row_number}: {'; '.join(err.errors)}")
    return 0


def cmd_stats():
    ensure_schema()
    with SessionLocal() as session:
        # Seed the curated SWIFT directory too, so stats show everything.
        seed_if_empty(session)
        print("=== SWIFT Routing DB stats ===")
        print(f"  SWIFT banks (curated): {session.query(Bank).count()}")
        print(f"  Corridor rules:        {session.query(CorridorRule).count()}")
        print(f"  Fedwire banks:         {session.query(FedwireBank).count()}")
        print(f"  FedACH banks:          {session.query(FedACHBank).count()}")
        print(f"  SSI records:           {session.query(SSI).count()}")


COMMANDS = {
    "import-fedwire": cmd_import_fedwire,
    "import-fedach": cmd_import_fedach,
    "import-ssi": cmd_import_ssi,
    "stats": cmd_stats,
}


def main(argv=None):
    argv = argv or sys.argv[1:]
    if not argv or argv[0] in ("-h", "--help", "help"):
        print(__doc__)
        print("Commands:", ", ".join(COMMANDS))
        return 0
    cmd = argv[0]
    if cmd not in COMMANDS:
        print(f"Unknown command: {cmd}", file=sys.stderr)
        print("Commands:", ", ".join(COMMANDS), file=sys.stderr)
        return 1
    return COMMANDS[cmd]()


if __name__ == "__main__":
    sys.exit(main())
