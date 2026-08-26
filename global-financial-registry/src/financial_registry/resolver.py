from __future__ import annotations

import difflib
from dataclasses import dataclass, field

from .domain import Institution, RegistryInput
from .normalize import normalize_domain, normalize_identifier, normalize_name


@dataclass(frozen=True)
class Resolution:
    action: str
    matched_id: str | None
    match_method: str
    confidence: float
    reasons: tuple[str, ...]
    competing_ids: tuple[str, ...]


@dataclass(frozen=True)
class FuzzyCandidate:
    id: str
    score: float


@dataclass(frozen=True)
class ResolverIndex:
    institutions: tuple[Institution, ...]
    identifiers_by_key: dict[tuple[str, str], tuple[str, ...]]
    verified_domains: dict[str, tuple[str, ...]]
    names_by_country: dict[tuple[str, str], tuple[str, ...]]
    aliases_by_institution: dict[str, tuple[str, ...]] = field(default_factory=dict)

    @classmethod
    def from_parts(cls, institutions, identifiers, verified_domains: dict[str, tuple[str, ...]]):
        registry = RegistryInput(
            institutions=list(institutions),
            identifiers=list(identifiers),
            sources=[],
        )
        index = cls.from_registry(registry)
        return cls(index.institutions, index.identifiers_by_key, verified_domains, index.names_by_country, index.aliases_by_institution)

    @classmethod
    def from_registry(cls, registry: RegistryInput) -> ResolverIndex:
        institutions = tuple(sorted(registry.institutions, key=lambda item: item.id))
        ids = {item.id for item in institutions}
        if len(ids) != len(institutions):
            raise ValueError("duplicate institution ID")
        identifier_map: dict[tuple[str, str], list[str]] = {}
        for item in registry.identifiers:
            if item.owner_id not in ids:
                raise ValueError(f"identifier owner does not resolve: {item.owner_id}")
            key = (item.type, normalize_identifier(item.type, item.value))
            identifier_map.setdefault(key, []).append(item.owner_id)
        domain_map: dict[str, list[str]] = {}
        trusted_sources = {
            source.id
            for source in registry.sources
            if source.trust_tier.value in {"authoritative", "official", "approved"}
        }
        for item in institutions:
            if not trusted_sources.intersection(item.source_ids):
                continue
            for domain in item.domains:
                domain_map.setdefault(normalize_domain(domain), []).append(item.id)
        name_map: dict[tuple[str, str], list[str]] = {}
        for item in institutions:
            key = (item.country_code, normalize_name(item.normalized_name))
            name_map.setdefault(key, []).append(item.id)
        institution_by_id = {item.id: item for item in institutions}
        for alias in registry.aliases:
            owner = institution_by_id.get(alias.owner_id)
            if owner:
                key = (owner.country_code, normalize_name(alias.alias_value))
                name_map.setdefault(key, []).append(owner.id)
        # Build aliases_by_institution for fuzzy (both Institution.aliases and IdentityAlias)
        aliases_by_inst: dict[str, list[str]] = {inst.id: list(inst.aliases) for inst in institutions}
        for alias in registry.aliases:
            if alias.owner_id in aliases_by_inst:
                aliases_by_inst[alias.owner_id].append(alias.alias_value)
        aliases_by_institution = {k: tuple(sorted(set(v))) for k, v in aliases_by_inst.items()}
        return cls(
            institutions=institutions,
            identifiers_by_key={key: tuple(sorted(set(values))) for key, values in identifier_map.items()},
            verified_domains={key: tuple(sorted(set(values))) for key, values in domain_map.items()},
            names_by_country={key: tuple(sorted(set(values))) for key, values in name_map.items()},
            aliases_by_institution=aliases_by_institution,
        )

    def ids_for_identifier(self, identifiers: list) -> tuple[str, ...]:
        ids: set[str] = set()
        for ident in identifiers:
            key = (ident.type, normalize_identifier(ident.type, ident.value))
            if key in self.identifiers_by_key:
                ids.update(self.identifiers_by_key[key])
        return tuple(sorted(ids))

    def ids_for_verified_domains(self, domains: list[str]) -> tuple[str, ...]:
        ids: set[str] = set()
        for domain in domains:
            nd = normalize_domain(domain)
            if nd in self.verified_domains:
                ids.update(self.verified_domains[nd])
        return tuple(sorted(ids))

    def ids_for_name_and_country(self, legal_name: str, country_code: str) -> tuple[str, ...]:
        key = (country_code, normalize_name(legal_name))
        return self.names_by_country.get(key, ())

    def fuzzy_candidates(self, legal_name: str, country_code: str, threshold: float = 0.6) -> list[FuzzyCandidate]:
        normalized = normalize_name(legal_name)
        candidates: list[FuzzyCandidate] = []
        for inst in self.institutions:
            if inst.country_code != country_code:
                continue
            inst_norm = normalize_name(inst.normalized_name)
            # Skip exact matches (they would have been caught earlier)
            if inst_norm == normalized:
                continue
            score = difflib.SequenceMatcher(None, inst_norm, normalized).ratio()
            if score >= threshold:
                candidates.append(FuzzyCandidate(id=inst.id, score=score))
            # Check aliases including IdentityAlias via aliases_by_institution
            alias_vals = self.aliases_by_institution.get(inst.id, ())
            for alias_val in alias_vals:
                alias_norm = normalize_name(alias_val)
                if alias_norm == normalized:
                    continue
                a_score = difflib.SequenceMatcher(None, alias_norm, normalized).ratio()
                if a_score >= threshold:
                    existing = next((c for c in candidates if c.id == inst.id), None)
                    if existing is None or a_score > existing.score:
                        if existing is not None:
                            candidates = [c for c in candidates if c.id != inst.id]
                        candidates.append(FuzzyCandidate(id=inst.id, score=a_score))
        # Sort by descending score then stable ID
        candidates.sort(key=lambda c: (-c.score, c.id))
        return candidates


class EntityResolver:
    def resolve(self, candidate, index: ResolverIndex) -> Resolution:
        reasons: list[str] = []
        # Identifier matching
        identifier_ids = index.ids_for_identifier(candidate.identifiers)
        if len(identifier_ids) == 1:
            reasons.append(f"exact identifier match: {identifier_ids[0]}")
            return Resolution("match", identifier_ids[0], "exact_identifier", 1.0, tuple(reasons), ())
        if len(identifier_ids) > 1:
            reasons.append(f"conflicting identifiers: {', '.join(identifier_ids)}")
            return Resolution("review", None, "conflicting_identifier", 0.0, tuple(reasons), identifier_ids)
        # Verified domain
        domain_ids = index.ids_for_verified_domains(candidate.domains)
        if len(domain_ids) == 1:
            reasons.append(f"verified domain match: {domain_ids[0]}")
            return Resolution("match", domain_ids[0], "verified_domain", 0.98, tuple(reasons), ())
        if len(domain_ids) > 1:
            reasons.append(f"conflicting verified domains: {', '.join(domain_ids)}")
            return Resolution("review", None, "conflicting_verified_domain", 0.0, tuple(reasons), domain_ids)
        # Exact name per country
        name_ids = index.ids_for_name_and_country(candidate.legal_name, candidate.country_code)
        if name_ids:
            reasons.append(f"name and country match: {', '.join(name_ids)}")
            # Exact name can never be automatic match, only review
            return Resolution("review", name_ids[0], "name_country", 0.90, tuple(reasons), name_ids)
        # Fuzzy candidates
        fuzzy_ids = index.fuzzy_candidates(candidate.legal_name, candidate.country_code)
        if fuzzy_ids:
            reasons.append(f"fuzzy name candidates: {', '.join(c.id for c in fuzzy_ids)}")
            return Resolution(
                "review",
                fuzzy_ids[0].id,
                "fuzzy_name",
                fuzzy_ids[0].score,
                tuple(reasons),
                tuple(item.id for item in fuzzy_ids),
            )
        reasons.append("no match found")
        return Resolution("create", None, "no_match", 0.0, tuple(reasons), ())
