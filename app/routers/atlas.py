"""Correspondent Atlas API."""

from typing import Annotated

from fastapi import APIRouter, Depends, Path, Query
from sqlalchemy.orm import Session

from ..db import get_db
from ..schemas import AtlasCountryResponse, AtlasNetworkResponse, AtlasScope
from ..services.atlas import build_country, build_network

router = APIRouter(prefix="/api/atlas", tags=["atlas"])


@router.get("/network", response_model=AtlasNetworkResponse)
def get_network(
    scope: AtlasScope = Query("all"),
    db: Session = Depends(get_db),
) -> AtlasNetworkResponse:
    return build_network(db, scope)


@router.get("/country/{iso2}", response_model=AtlasCountryResponse)
def get_country(
    iso2: Annotated[str, Path(min_length=2, max_length=2, pattern=r"^[A-Za-z]{2}$")],
    scope: AtlasScope = Query("all"),
    db: Session = Depends(get_db),
) -> AtlasCountryResponse:
    return build_country(db, iso2, scope)
