"""Read-only aggregation for the correspondent atlas.

The atlas deliberately loads the SSI snapshot once per request and aggregates in
Python. This keeps the scope filter in one place, makes distinct-count semantics
obvious, and gives the performance test a fixed one-query database boundary.
"""

from collections import Counter, defaultdict
from typing import Iterable

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..models import SSI
from ..routers._shared import _ATLAS_DISCLAIMER
from ..schemas import (
    SSI_STATUSES,
    AtlasCountryCorrespondent,
    AtlasCountryCounts,
    AtlasCountryResponse,
    AtlasDisclosure,
    AtlasEvidence,
    AtlasHub,
    AtlasHubCountry,
    AtlasNetworkResponse,
    AtlasScope,
    AtlasSpoke,
    AtlasStatusTier,
    AtlasTotals,
)


def _country_code(bic: str) -> str:
    return bic[4:6].upper()


def _snapshot(session: Session) -> list[SSI]:
    return list(session.execute(select(SSI)).scalars())


def _in_scope(row: SSI, scope: AtlasScope) -> bool:
    return scope == "all" or not row.bic_only


def _status_counts(rows: Iterable[SSI]) -> Counter:
    return Counter((row.status, row.bic_only) for row in rows)


def _canonical_name(rows: Iterable[SSI], attribute: str, fallback: str) -> str:
    names = sorted({(getattr(row, attribute) or "").strip() for row in rows if (getattr(row, attribute) or "").strip()})
    return names[0] if names else fallback


def _status_tier(rows: Iterable[SSI]) -> list[AtlasStatusTier]:
    counts = _status_counts(rows)
    return [
        AtlasStatusTier(status=status, bic_only=bic_only, count=counts[(status, bic_only)])
        for status in SSI_STATUSES
        for bic_only in (False, True)
    ]


def _evidence(rows: Iterable[SSI]) -> list[AtlasEvidence]:
    """Return only non-empty status/tier cells for compact spoke tooltips."""
    counts = _status_counts(rows)
    return [
        AtlasEvidence(status=status, bic_only=bic_only, count=count)
        for status in SSI_STATUSES
        for bic_only in (False, True)
        if (count := counts[(status, bic_only)])
    ]


def build_network(session: Session, scope: AtlasScope = "all") -> AtlasNetworkResponse:
    all_rows = _snapshot(session)
    rows = [row for row in all_rows if _in_scope(row, scope)]

    beneficiary_bics = {row.beneficiary_bic for row in rows}
    intermediary_bics = {row.intermediary_bic for row in rows}
    totals = AtlasTotals(
        ssi_rows=len(rows),
        beneficiary_banks=len(beneficiary_bics),
        correspondents=len(intermediary_bics),
        currencies=len({row.currency for row in rows}),
    )

    spoke_rows: dict[str, list[SSI]] = defaultdict(list)
    all_spoke_rows: dict[str, list[SSI]] = defaultdict(list)
    for row in all_rows:
        all_spoke_rows[_country_code(row.beneficiary_bic)].append(row)
    for row in rows:
        spoke_rows[_country_code(row.beneficiary_bic)].append(row)
    spokes = []
    for iso2 in sorted(all_spoke_rows):
        country_rows = spoke_rows.get(iso2, [])
        spokes.append(
            AtlasSpoke(
                iso2=iso2,
                beneficiary_banks=len({row.beneficiary_bic for row in country_rows}),
                rows=len(country_rows),
                evidence=_evidence(country_rows),
            )
        )
    spokes.sort(key=lambda item: item.iso2)

    hub_country_rows: dict[str, list[SSI]] = defaultdict(list)
    all_hub_country_rows: dict[str, list[SSI]] = defaultdict(list)
    for row in all_rows:
        all_hub_country_rows[_country_code(row.intermediary_bic)].append(row)
    for row in rows:
        hub_country_rows[_country_code(row.intermediary_bic)].append(row)
    hub_countries = [
        AtlasHubCountry(
            iso2=iso2,
            banks_served=len({row.beneficiary_bic for row in hub_country_rows.get(iso2, [])}),
            currencies=len({row.currency for row in hub_country_rows.get(iso2, [])}),
            correspondents=len({row.intermediary_bic for row in hub_country_rows.get(iso2, [])}),
        )
        for iso2 in sorted(all_hub_country_rows)
    ]
    hub_countries.sort(key=lambda item: (-item.banks_served, item.iso2))

    hub_rows: dict[str, list[SSI]] = defaultdict(list)
    for row in rows:
        hub_rows[row.intermediary_bic].append(row)
    hubs = [
        AtlasHub(
            bic=bic,
            name=_canonical_name(bank_rows, "intermediary_bank_name", bic),
            iso2=_country_code(bic),
            banks_served=len({row.beneficiary_bic for row in bank_rows}),
            currencies=len({row.currency for row in bank_rows}),
        )
        for bic, bank_rows in hub_rows.items()
    ]
    hubs.sort(key=lambda item: (-item.banks_served, item.name, item.bic))

    return AtlasNetworkResponse(
        scope=scope,
        totals=totals,
        by_status_and_tier=_status_tier(rows),
        spokes=spokes,
        hub_countries=hub_countries,
        hubs=hubs,
        observed_beneficiary_country_codes=sorted(
            {_country_code(row.beneficiary_bic) for row in all_rows}
        ),
        observed_intermediary_country_codes=sorted(
            {_country_code(row.intermediary_bic) for row in all_rows}
        ),
        disclaimer=_ATLAS_DISCLAIMER,
    )


def _country_counts(rows: list[SSI], total_rows: int, total_banks: int) -> AtlasCountryCounts:
    return AtlasCountryCounts(
        beneficiary_banks=len({row.beneficiary_bic for row in rows}),
        beneficiary_banks_total=total_banks,
        rows=len(rows),
        ssi_rows_total=total_rows,
    )


def build_country(session: Session, iso2: str, scope: AtlasScope = "all") -> AtlasCountryResponse:
    normalized = iso2.upper()
    all_rows = _snapshot(session)
    rows = [row for row in all_rows if _in_scope(row, scope)]
    scoped_total_banks = len({row.beneficiary_bic for row in rows})
    all_country_rows = [
        row for row in all_rows if _country_code(row.beneficiary_bic) == normalized
    ]
    country_rows = [row for row in all_country_rows if _in_scope(row, scope)]

    correspondent_rows: dict[str, list[SSI]] = defaultdict(list)
    for row in country_rows:
        correspondent_rows[row.intermediary_bic].append(row)
    correspondents = []
    for bic, bank_rows in correspondent_rows.items():
        disclosure_rows: dict[tuple[str, str, bool], int] = Counter()
        disclosure_names: dict[tuple[str, str, bool], set[str]] = defaultdict(set)
        for row in bank_rows:
            key = (
                row.beneficiary_bic,
                row.status,
                row.bic_only,
            )
            disclosure_rows[key] += 1
            if row.beneficiary_bank_name and row.beneficiary_bank_name.strip():
                disclosure_names[key].add(row.beneficiary_bank_name.strip())
        disclosures = [
            AtlasDisclosure(
                beneficiary_bic=beneficiary_bic,
                beneficiary_bank_name=sorted(disclosure_names[(beneficiary_bic, status, bic_only)])[0] if disclosure_names[(beneficiary_bic, status, bic_only)] else beneficiary_bic,
                status=status,
                bic_only=bic_only,
                row_count=row_count,
            )
            for (beneficiary_bic, status, bic_only), row_count
            in disclosure_rows.items()
        ]
        disclosures.sort(key=lambda item: (item.beneficiary_bank_name, item.beneficiary_bic, item.status, item.bic_only))
        correspondents.append(
            AtlasCountryCorrespondent(
                bic=bic,
                name=_canonical_name(bank_rows, "intermediary_bank_name", bic),
                iso2=_country_code(bic),
                beneficiary_banks=len({row.beneficiary_bic for row in bank_rows}),
                currencies=sorted({row.currency for row in bank_rows}),
                disclosures=disclosures,
            )
        )
    correspondents.sort(key=lambda item: (-item.beneficiary_banks, item.name, item.bic))

    return AtlasCountryResponse(
        scope=scope,
        iso2=normalized,
        collected=bool(all_country_rows),
        in_scope=_country_counts(country_rows, len(rows), scoped_total_banks),
        all_scopes=_country_counts(
            all_country_rows,
            len(all_rows),
            len({row.beneficiary_bic for row in all_rows}),
        ),
        correspondents=correspondents,
        disclaimer=_ATLAS_DISCLAIMER,
    )
