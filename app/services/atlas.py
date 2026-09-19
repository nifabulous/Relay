"""Read-only aggregation for the correspondent atlas.

The atlas deliberately loads one narrow SSI snapshot per request and aggregates
in Python. This keeps the scope filter in one place, makes distinct-count
semantics obvious, and gives the performance test a fixed one-query database
boundary without hydrating full ORM instances.
"""

from __future__ import annotations

from collections import Counter, defaultdict
from dataclasses import dataclass, field
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


@dataclass(frozen=True, slots=True)
class AtlasSnapshotRow:
    """The read-only SSI projection required by the atlas."""

    beneficiary_bic: str
    beneficiary_bank_name: str | None
    currency: str
    intermediary_bic: str
    intermediary_bank_name: str | None
    status: str
    bic_only: bool


@dataclass(slots=True)
class _SpokeRollup:
    rows: int = 0
    beneficiary_bics: set[str] = field(default_factory=set)
    status_counts: Counter = field(default_factory=Counter)


@dataclass(slots=True)
class _HubCountryRollup:
    beneficiary_bics: set[str] = field(default_factory=set)
    currencies: set[str] = field(default_factory=set)
    intermediary_bics: set[str] = field(default_factory=set)


@dataclass(slots=True)
class _HubRollup:
    beneficiary_bics: set[str] = field(default_factory=set)
    currencies: set[str] = field(default_factory=set)
    names: set[str] = field(default_factory=set)


def _country_code(bic: str) -> str:
    return bic[4:6].upper()


def _snapshot(session: Session) -> list[AtlasSnapshotRow]:
    columns = (
        SSI.beneficiary_bic,
        SSI.beneficiary_bank_name,
        SSI.currency,
        SSI.intermediary_bic,
        SSI.intermediary_bank_name,
        SSI.status,
        SSI.bic_only,
    )
    return [AtlasSnapshotRow(*row) for row in session.connection().execute(select(*columns))]


def _in_scope(row: AtlasSnapshotRow, scope: AtlasScope) -> bool:
    return scope == "all" or not row.bic_only


def _status_counts(rows: Iterable[AtlasSnapshotRow]) -> Counter:
    return Counter((row.status, row.bic_only) for row in rows)


def _canonical_name(rows: Iterable[AtlasSnapshotRow], attribute: str, fallback: str) -> str:
    names = sorted({(getattr(row, attribute) or "").strip() for row in rows if (getattr(row, attribute) or "").strip()})
    return names[0] if names else fallback


def _status_tier(rows: Iterable[AtlasSnapshotRow]) -> list[AtlasStatusTier]:
    counts = _status_counts(rows)
    return [
        AtlasStatusTier(status=status, bic_only=bic_only, count=counts[(status, bic_only)])
        for status in SSI_STATUSES
        for bic_only in (False, True)
    ]


def _evidence(rows: Iterable[AtlasSnapshotRow]) -> list[AtlasEvidence]:
    """Return only non-empty status/tier cells for compact spoke tooltips."""
    counts = _status_counts(rows)
    return [
        AtlasEvidence(status=status, bic_only=bic_only, count=count)
        for status in SSI_STATUSES
        for bic_only in (False, True)
        if (count := counts[(status, bic_only)])
    ]


def _status_tier_from_counts(counts: Counter) -> list[AtlasStatusTier]:
    return [
        AtlasStatusTier(status=status, bic_only=bic_only, count=counts[(status, bic_only)])
        for status in SSI_STATUSES
        for bic_only in (False, True)
    ]


def _evidence_from_counts(counts: Counter) -> list[AtlasEvidence]:
    return [
        AtlasEvidence(status=status, bic_only=bic_only, count=count)
        for status in SSI_STATUSES
        for bic_only in (False, True)
        if (count := counts[(status, bic_only)])
    ]


def build_network(session: Session, scope: AtlasScope = "all") -> AtlasNetworkResponse:
    all_rows = _snapshot(session)
    beneficiary_bics: set[str] = set()
    intermediary_bics: set[str] = set()
    currencies: set[str] = set()
    status_counts: Counter = Counter()

    spoke_rows: dict[str, _SpokeRollup] = {}
    hub_country_rows: dict[str, _HubCountryRollup] = {}
    all_spoke_rows: dict[str, _SpokeRollup] = {}
    all_hub_country_rows: dict[str, _HubCountryRollup] = {}
    hub_rows: dict[str, _HubRollup] = {}

    for row in all_rows:
        beneficiary_iso2 = _country_code(row.beneficiary_bic)
        intermediary_iso2 = _country_code(row.intermediary_bic)
        all_spoke = all_spoke_rows.get(beneficiary_iso2)
        if all_spoke is None:
            all_spoke = _SpokeRollup()
            all_spoke_rows[beneficiary_iso2] = all_spoke
        all_spoke.rows += 1
        all_spoke.beneficiary_bics.add(row.beneficiary_bic)
        all_spoke.status_counts[(row.status, row.bic_only)] += 1

        all_hub_country = all_hub_country_rows.get(intermediary_iso2)
        if all_hub_country is None:
            all_hub_country = _HubCountryRollup()
            all_hub_country_rows[intermediary_iso2] = all_hub_country
        all_hub_country.beneficiary_bics.add(row.beneficiary_bic)
        all_hub_country.currencies.add(row.currency)
        all_hub_country.intermediary_bics.add(row.intermediary_bic)

        if not _in_scope(row, scope):
            continue
        beneficiary_bics.add(row.beneficiary_bic)
        intermediary_bics.add(row.intermediary_bic)
        currencies.add(row.currency)
        status_counts[(row.status, row.bic_only)] += 1
        spoke = spoke_rows.get(beneficiary_iso2)
        if spoke is None:
            spoke = _SpokeRollup()
            spoke_rows[beneficiary_iso2] = spoke
        spoke.rows += 1
        spoke.beneficiary_bics.add(row.beneficiary_bic)
        spoke.status_counts[(row.status, row.bic_only)] += 1

        hub_country = hub_country_rows.get(intermediary_iso2)
        if hub_country is None:
            hub_country = _HubCountryRollup()
            hub_country_rows[intermediary_iso2] = hub_country
        hub_country.beneficiary_bics.add(row.beneficiary_bic)
        hub_country.currencies.add(row.currency)
        hub_country.intermediary_bics.add(row.intermediary_bic)

        hub = hub_rows.get(row.intermediary_bic)
        if hub is None:
            hub = _HubRollup()
            hub_rows[row.intermediary_bic] = hub
        hub.beneficiary_bics.add(row.beneficiary_bic)
        hub.currencies.add(row.currency)
        if row.intermediary_bank_name and row.intermediary_bank_name.strip():
            hub.names.add(row.intermediary_bank_name.strip())

    totals = AtlasTotals(
        ssi_rows=sum(rollup.rows for rollup in spoke_rows.values()),
        beneficiary_banks=len(beneficiary_bics),
        correspondents=len(intermediary_bics),
        currencies=len(currencies),
    )

    spokes = []
    for iso2 in sorted(all_spoke_rows):
        country_rows = spoke_rows.get(iso2)
        spokes.append(
            AtlasSpoke(
                iso2=iso2,
                beneficiary_banks=len(country_rows.beneficiary_bics) if country_rows else 0,
                rows=country_rows.rows if country_rows else 0,
                evidence=_evidence_from_counts(country_rows.status_counts) if country_rows else [],
            )
        )
    spokes.sort(key=lambda item: item.iso2)

    hub_countries = [
        AtlasHubCountry(
            iso2=iso2,
            banks_served=len(hub_country_rows[iso2].beneficiary_bics) if iso2 in hub_country_rows else 0,
            currencies=len(hub_country_rows[iso2].currencies) if iso2 in hub_country_rows else 0,
            correspondents=len(hub_country_rows[iso2].intermediary_bics) if iso2 in hub_country_rows else 0,
        )
        for iso2 in sorted(all_hub_country_rows)
    ]
    hub_countries.sort(key=lambda item: (-item.banks_served, item.iso2))

    hubs = [
        AtlasHub(
            bic=bic,
            name=min(bank_rollup.names) if bank_rollup.names else bic,
            iso2=_country_code(bic),
            banks_served=len(bank_rollup.beneficiary_bics),
            currencies=len(bank_rollup.currencies),
        )
        for bic, bank_rollup in hub_rows.items()
    ]
    hubs.sort(key=lambda item: (-item.banks_served, item.name, item.bic))

    return AtlasNetworkResponse(
        scope=scope,
        totals=totals,
        by_status_and_tier=_status_tier_from_counts(status_counts),
        spokes=spokes,
        hub_countries=hub_countries,
        hubs=hubs,
        observed_beneficiary_country_codes=sorted(
            all_spoke_rows
        ),
        observed_intermediary_country_codes=sorted(
            all_hub_country_rows
        ),
        disclaimer=_ATLAS_DISCLAIMER,
    )


def _country_counts(rows: list[AtlasSnapshotRow], total_rows: int, total_banks: int) -> AtlasCountryCounts:
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

    correspondent_rows: dict[str, list[AtlasSnapshotRow]] = defaultdict(list)
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
