"""Admin-only data import endpoints (Fedwire, FedACH, SSI)."""
import csv
import io

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy.orm import Session

from ..auth import admin_required
from ..db import get_db
from ..schemas import ImportResponse
from ..services.fed_importer import import_fedach, import_fedwire

router = APIRouter(prefix="/api", tags=["swift"])


@router.post("/import/fedwire", response_model=ImportResponse, dependencies=[Depends(admin_required)])
def trigger_fedwire_import(db: Session = Depends(get_db)):
    """
    Reload the Fedwire directory. Pulls the public FRB E-Payments snapshot.
    Heavy operation (~7,500 rows); intended for admin/CLI use, not per-request.
    Requires FEDWIRE_URL env var pointing at a trusted FRB-downloaded copy.
    """
    try:
        result = import_fedwire(db)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return ImportResponse(
        source=result.source,
        inserted=result.inserted,
        total_lines=result.total_lines,
        message=f"Imported {result.inserted} Fedwire banks.",
    )


@router.post("/import/fedach", response_model=ImportResponse, dependencies=[Depends(admin_required)])
def trigger_fedach_import(db: Session = Depends(get_db)):
    """Reload the FedACH directory (~25,000 rows). Admin/CLI use.
    Requires FEDACH_URL env var pointing at a trusted FRB-downloaded copy."""
    try:
        result = import_fedach(db)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return ImportResponse(
        source=result.source,
        inserted=result.inserted,
        total_lines=result.total_lines,
        message=f"Imported {result.inserted} FedACH banks.",
    )


# ---------------------------------------------------------------------------
# SSI import — upload CSV/JSON of Standard Settlement Instructions
# ---------------------------------------------------------------------------


@router.post("/import/ssi", dependencies=[Depends(admin_required)])
async def trigger_ssi_import(
    file: UploadFile = File(..., description="CSV or JSON file of SSI records"),
    db: Session = Depends(get_db),
):
    """
    Upload a CSV or JSON file of Standard Settlement Instructions.

    Format auto-detected from filename extension (.csv / .json).

    CSV columns: beneficiary_bic, beneficiary_bank_name, currency,
                 intermediary_bic, intermediary_bank_name,
                 intermediary_account, beneficiary_account,
                 charge_code, value_date, notes

    JSON: an array of objects with the same keys, or {"records": [...]}.

    Upsert by (beneficiary_bic, currency, intermediary_bic) — re-importing
    updates account numbers rather than duplicating.
    """
    from ..services.ssi_importer import import_ssi_file

    content = await file.read()
    format_hint = "json" if (file.filename or "").lower().endswith(".json") else "csv"

    try:
        # Decode + wrap as a file-like object for the parser.
        # handle BOM from Excel exports; catch decode errors as 400, not 500.
        # The parsers treat a bare str as a path when one exists on disk, so
        # uploaded content must reach them as a stream, never as a str.
        text = content.decode("utf-8-sig")
        result = import_ssi_file(db, io.StringIO(text), format_hint=format_hint)
    except UnicodeDecodeError:
        raise HTTPException(
            status_code=400,
            detail="File is not valid UTF-8. Save as UTF-8 (Excel: 'CSV UTF-8').",
        )
    except (ValueError, csv.Error) as e:
        # The file's own problem, so the uploader sees what failed to parse.
        # Anything else (a database fault) is a 500 without its SQL text.
        db.rollback()
        raise HTTPException(status_code=400, detail=f"Parse error: {e}")

    return {
        "source": "ssi",
        "inserted": result.inserted,
        "updated": result.updated,
        "rejected": result.rejected,
        "total_rows": result.total_rows,
        "message": result.summary(),
        "errors": [
            {"row": e.row_number, "errors": e.errors}
            for e in result.errors
        ],
    }
