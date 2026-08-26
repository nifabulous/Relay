from __future__ import annotations

import hashlib
import json
import os
import re
import shutil
import tempfile
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path

import pycountry

from . import __version__
from .domain import RegistryInput, ReleaseStatus, ReviewStatus, RightsStatus


@dataclass(frozen=True)
class ValidationIssue:
    code: str
    path: str
    message: str


class ReleaseValidationError(ValueError):
    def __init__(self, issues: tuple[ValidationIssue, ...]):
        self.issues = issues
        super().__init__("; ".join(f"{issue.code} at {issue.path}: {issue.message}" for issue in issues))


SEMVER_RE = re.compile(r"^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9A-Za-z-]*))*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$")

SCHEMA_VERSION = "1.0.0"


def _is_valid_country_code(code: str) -> bool:
    if code == "XX":
        return False
    return pycountry.countries.get(alpha_2=code) is not None


def _validate_semver(version: str) -> bool:
    return bool(SEMVER_RE.match(version))


def _deterministic_json(obj) -> str:
    return json.dumps(obj, ensure_ascii=False, sort_keys=True, separators=(",", ":")) + "\n"


def _hash_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def _hash_json(obj) -> str:
    return _hash_bytes(_deterministic_json(obj).encode("utf-8"))


class ReleaseBuilder:
    def validate(self, registry: RegistryInput, generation_commit: str) -> list[ValidationIssue]:
        issues: list[ValidationIssue] = []
        # Check duplicate IDs
        for field, key in [
            ("institutions", lambda x: x.id),
            ("brands", lambda x: x.id),
            ("assets", lambda x: x.id),
            ("sources", lambda x: x.id),
            ("relationships", lambda x: x.id),
            ("rekey_events", lambda x: x.id),
        ]:
            items = getattr(registry, field)
            seen = set()
            for item in items:
                kid = key(item)
                if kid in seen:
                    issues.append(ValidationIssue("duplicate_id", f"{field}/{kid}", f"duplicate ID {kid} in {field}"))
                seen.add(kid)
        # Build lookup sets
        institution_ids = {inst.id for inst in registry.institutions}
        brand_ids = {b.id for b in registry.brands}
        source_ids = {s.id for s in registry.sources}
        all_entity_ids = institution_ids | brand_ids

        # Country code validation for published records (institution, brand, identifier)
        for inst in registry.institutions:
            if not _is_valid_country_code(inst.country_code):
                issues.append(ValidationIssue("invalid_country", f"institutions/{inst.id}/country_code", f"invalid country code {inst.country_code}"))
            if not _is_valid_country_code(inst.regulator_jurisdiction):
                issues.append(ValidationIssue("invalid_country", f"institutions/{inst.id}/regulator_jurisdiction", f"invalid regulator jurisdiction {inst.regulator_jurisdiction}"))
            for market in inst.operating_markets:
                if not _is_valid_country_code(market):
                    issues.append(ValidationIssue("invalid_country", f"institutions/{inst.id}/operating_markets", f"invalid market {market}"))
            for j in inst.jurisdictions:
                if not _is_valid_country_code(j):
                    issues.append(ValidationIssue("invalid_country", f"institutions/{inst.id}/jurisdictions", f"invalid jurisdiction {j}"))
            if not inst.source_ids:
                issues.append(ValidationIssue("missing_provenance", f"institutions/{inst.id}", "institution missing source reference"))
            else:
                for sid in inst.source_ids:
                    if sid not in source_ids:
                        issues.append(ValidationIssue("dangling_reference", f"institutions/{inst.id}/source_ids", f"source {sid} not found"))
            if not inst.legal_name or not inst.legal_name.strip():
                issues.append(ValidationIssue("missing_field", f"institutions/{inst.id}/legal_name", "legal_name must be non-empty"))
        for brand in registry.brands:
            for cc in brand.country_codes:
                if not _is_valid_country_code(cc):
                    issues.append(ValidationIssue("invalid_country", f"brands/{brand.id}/country_codes", f"invalid country {cc}"))
            if not brand.source_ids:
                issues.append(ValidationIssue("missing_provenance", f"brands/{brand.id}", "brand missing source reference"))
            else:
                for sid in brand.source_ids:
                    if sid not in source_ids:
                        issues.append(ValidationIssue("dangling_reference", f"brands/{brand.id}/source_ids", f"source {sid} not found"))
            if not brand.display_name or not brand.display_name.strip():
                issues.append(ValidationIssue("missing_field", f"brands/{brand.id}/display_name", "display_name must be non-empty"))
        for ident in registry.identifiers:
            if ident.owner_id not in all_entity_ids:
                issues.append(ValidationIssue("dangling_reference", f"identifiers/{ident.owner_id}", f"identifier owner {ident.owner_id} not found"))
            if ident.country_code and not _is_valid_country_code(ident.country_code):
                issues.append(ValidationIssue("invalid_country", f"identifiers/{ident.owner_id}/country_code", f"invalid country {ident.country_code}"))
            if not ident.source_id or ident.source_id not in source_ids:
                issues.append(ValidationIssue("missing_provenance", f"identifiers/{ident.owner_id}", f"identifier missing valid source {ident.source_id}"))
        for alias in registry.aliases:
            if alias.owner_id not in all_entity_ids:
                issues.append(ValidationIssue("dangling_reference", f"aliases/{alias.owner_id}", f"alias owner {alias.owner_id} not found"))
            if alias.source_id not in source_ids:
                issues.append(ValidationIssue("missing_provenance", f"aliases/{alias.owner_id}", f"alias missing valid source {alias.source_id}"))
        for rel in registry.relationships:
            if rel.from_id not in all_entity_ids:
                issues.append(ValidationIssue("dangling_reference", f"relationships/{rel.id}/from_id", f"relationship from_id {rel.from_id} not found"))
            if rel.to_id not in all_entity_ids:
                issues.append(ValidationIssue("dangling_reference", f"relationships/{rel.id}/to_id", f"relationship to_id {rel.to_id} not found"))
            if rel.source_id not in source_ids:
                issues.append(ValidationIssue("missing_provenance", f"relationships/{rel.id}", f"relationship missing valid source {rel.source_id}"))
        for rekey in registry.rekey_events:
            if rekey.owner_id not in all_entity_ids:
                issues.append(ValidationIssue("dangling_reference", f"rekey_events/{rekey.id}", f"rekey owner {rekey.owner_id} not found"))
            if rekey.source_id not in source_ids:
                issues.append(ValidationIssue("missing_provenance", f"rekey_events/{rekey.id}", f"rekey missing valid source {rekey.source_id}"))
        # Check that every source has a successful run (stale source check)
        from .domain import SourceRunStatus

        successful_sources = {run.source_id for run in registry.source_runs if run.status == SourceRunStatus.SUCCEEDED}
        for source in registry.sources:
            if source.id not in successful_sources:
                issues.append(ValidationIssue("stale_source", f"sources/{source.id}", f"source {source.id} has no successful run"))
        # Also check that every published record's source has successful run
        for inst in registry.institutions:
            for sid in inst.source_ids:
                if sid not in successful_sources:
                    issues.append(ValidationIssue("stale_source", f"institutions/{inst.id}/source_ids", f"institution source {sid} has no successful run"))
        for brand in registry.brands:
            for sid in brand.source_ids:
                if sid not in successful_sources:
                    issues.append(ValidationIssue("stale_source", f"brands/{brand.id}/source_ids", f"brand source {sid} has no successful run"))
        # Asset validations
        binary_paths_seen = set()
        for asset in registry.assets:
            if asset.owner_id not in all_entity_ids:
                issues.append(ValidationIssue("dangling_reference", f"assets/{asset.id}/owner_id", f"asset owner {asset.owner_id} not found"))
            if asset.source_id not in source_ids:
                issues.append(ValidationIssue("missing_provenance", f"assets/{asset.id}", f"asset missing valid source {asset.source_id}"))
            # Check duplicate binary paths and reserved names
            RESERVED = {
                "institutions.json",
                "brands.json",
                "identifiers.json",
                "aliases.json",
                "rekey-events.json",
                "relationships.json",
                "assets-manifest.json",
                "sources.json",
                "checksums.txt",
                "schema-version.json",
            }
            if asset.binary_path:
                if asset.binary_path in binary_paths_seen:
                    issues.append(ValidationIssue("duplicate_binary_path", f"assets/{asset.id}/binary_path", f"duplicate binary path {asset.binary_path}"))
                else:
                    binary_paths_seen.add(asset.binary_path)
                # Binary path must be relative and not contain .. or absolute
                if Path(asset.binary_path).is_absolute() or ".." in Path(asset.binary_path).parts:
                    issues.append(ValidationIssue("invalid_binary_path", f"assets/{asset.id}/binary_path", f"binary path must be relative without traversal: {asset.binary_path}"))
                # Must be under assets/ and derived from stable asset ID, and not overwrite reserved files
                expected = f"assets/{asset.id}.{asset.format.value}"
                if asset.binary_path != expected:
                    issues.append(ValidationIssue("invalid_binary_path", f"assets/{asset.id}/binary_path", f"binary path must be derived from asset ID: expected {expected}, got {asset.binary_path}"))
                if Path(asset.binary_path).name in RESERVED or asset.binary_path in RESERVED:
                    issues.append(ValidationIssue("invalid_binary_path", f"assets/{asset.id}/binary_path", f"binary path must not overwrite reserved file: {asset.binary_path}"))
                if not asset.binary_path.startswith("assets/"):
                    issues.append(ValidationIssue("invalid_binary_path", f"assets/{asset.id}/binary_path", f"binary path must be under assets/: {asset.binary_path}"))
            # Rights checks
            # Restricted rights cannot have binary
            if asset.rights_status in {RightsStatus.SOURCE_LINK_ONLY, RightsStatus.UNKNOWN, RightsStatus.REMOVED}:
                if asset.binary_path or asset.sha256:
                    issues.append(ValidationIssue("rights_violation", f"assets/{asset.id}", f"restricted rights {asset.rights_status.value} cannot have public binary"))
            else:
                # Permitted rights: if has binary, must have all fields
                has_binary = asset.binary_path is not None or asset.sha256 is not None
                if has_binary:
                    if not asset.source_uri or not asset.sha256 or not asset.binary_path:
                        issues.append(ValidationIssue("missing_binary_metadata", f"assets/{asset.id}", "public binaries require source URI, checksum, and binary path"))
                    if len(asset.sha256 or "") != 64 or any(c not in "0123456789abcdef" for c in (asset.sha256 or "")):
                        issues.append(ValidationIssue("invalid_checksum", f"assets/{asset.id}/sha256", "sha256 must be 64 char lowercase hex"))
                    if asset.review_status != ReviewStatus.APPROVED:
                        issues.append(ValidationIssue("unapproved_binary", f"assets/{asset.id}", "binary assets must have approved review status"))
                    if asset.rights_status not in {RightsStatus.REDISTRIBUTABLE, RightsStatus.LICENSED}:
                        issues.append(ValidationIssue("rights_violation", f"assets/{asset.id}", f"binary rights {asset.rights_status.value} not permitted"))
                    if asset.rights_status == RightsStatus.LICENSED and not asset.permission_reference:
                        issues.append(ValidationIssue("missing_permission", f"assets/{asset.id}", "licensed binaries require permission_reference"))
            # Staging path checks
            if asset.staging_path:
                if Path(asset.staging_path).is_absolute() or ".." in Path(asset.staging_path).parts:
                    issues.append(ValidationIssue("staging_traversal", f"assets/{asset.id}/staging_path", f"staging path must be relative without traversal: {asset.staging_path}"))
        return issues

    def build(
        self,
        registry: RegistryInput,
        version: str,
        generated_at: datetime,
        output_dir: Path | str,
        generation_commit: str,
        lifecycle: ReleaseStatus = ReleaseStatus.VALIDATED,
    ):
        output_dir = Path(output_dir)
        # Validate semver and lifecycle
        issues: list[ValidationIssue] = []
        if lifecycle not in {ReleaseStatus.DRAFT, ReleaseStatus.VALIDATED}:
            issues.append(ValidationIssue("invalid_lifecycle", "lifecycle", f"build lifecycle must be draft or validated, got {lifecycle}"))
        if not _validate_semver(version):
            issues.append(ValidationIssue("invalid_semver", "release_version", f"version {version} is not valid SemVer 2.0.0"))
        if generated_at.tzinfo is None or generated_at.utcoffset() is None or generated_at.utcoffset().total_seconds() != 0:
            issues.append(ValidationIssue("invalid_timestamp", "generated_at", "generated_at must be timezone-aware UTC"))
        # Validate registry
        reg_issues = self.validate(registry, generation_commit)
        issues.extend(reg_issues)
        # Additional per-asset checks that require generated_at for expiry/territory
        # Territory and expiry checks for licensed assets
        # Build maps for owner lookup
        inst_by_id = {inst.id: inst for inst in registry.institutions}
        brand_by_id = {b.id: b for b in registry.brands}
        for asset in registry.assets:
            # Licensed specific checks with generated_at
            if asset.rights_status == RightsStatus.LICENSED and asset.binary_path:
                # Expiry check
                if asset.expires_at and asset.expires_at <= generated_at:
                    issues.append(ValidationIssue("expired_rights", f"assets/{asset.id}/expires_at", f"licensed asset {asset.id} rights have expired"))
                # Territory check: licensed must have explicit territory coverage
                if not asset.territories:
                    issues.append(ValidationIssue("missing_territory", f"assets/{asset.id}/territories", f"licensed asset {asset.id} requires explicit territory coverage"))
                else:
                    owner = inst_by_id.get(asset.owner_id) or brand_by_id.get(asset.owner_id)
                    if owner is not None:
                        if hasattr(owner, "country_code"):
                            owner_country = getattr(owner, "country_code", None)
                            if owner_country and owner_country not in asset.territories:
                                issues.append(ValidationIssue("territory_violation", f"assets/{asset.id}/territories", f"licensed asset {asset.id} territory {asset.territories} does not cover owner country {owner_country}"))
                        elif hasattr(owner, "country_codes"):
                            country_codes = getattr(owner, "country_codes", [])
                            if country_codes and not any(cc in asset.territories for cc in country_codes):
                                issues.append(ValidationIssue("territory_violation", f"assets/{asset.id}/territories", f"licensed asset {asset.id} territory {asset.territories} does not cover owner market {country_codes}"))
                # Also need permission reference already checked earlier, but double-check for build
                if not asset.permission_reference:
                    # Already added, but ensure message contains permission
                    if not any(i.code == "missing_permission" for i in issues):
                        issues.append(ValidationIssue("missing_permission", f"assets/{asset.id}", "licensed binaries require permission_reference"))
            # Unknown/removed/source_link_only already checked, but also ensure they have no binary
            # Staging path file checks
            if asset.staging_path:
                if ".." in Path(asset.staging_path).parts or Path(asset.staging_path).is_absolute():
                    # Already added, ensure code is staging_traversal
                    pass
                else:
                    # Check file exists, not symlink, sha matches if not already failed
                    if registry.asset_root:
                        asset_root = Path(registry.asset_root).resolve()
                        staging_full = (asset_root / asset.staging_path).resolve()
                        try:
                            staging_full.relative_to(asset_root)
                        except ValueError:
                            issues.append(ValidationIssue("staging_traversal", f"assets/{asset.id}/staging_path", f"staging path escapes asset root: {asset.staging_path}"))
                        else:
                            # Check exists and not symlink
                            # Need to check the symlink before resolve? Check the original path's symlink status
                            original_path = Path(registry.asset_root) / asset.staging_path
                            if original_path.is_symlink():
                                issues.append(ValidationIssue("staging_symlink", f"assets/{asset.id}/staging_path", "staging path must not be a symlink"))
                            elif not staging_full.exists():
                                issues.append(ValidationIssue("missing_staging_file", f"assets/{asset.id}/staging_path", f"staging file not found: {asset.staging_path}"))
                            else:
                                # Check sha256 matches
                                try:
                                    data = staging_full.read_bytes()
                                    actual_sha = hashlib.sha256(data).hexdigest()
                                    if asset.sha256 and actual_sha != asset.sha256:
                                        issues.append(ValidationIssue("checksum_mismatch", f"assets/{asset.id}/sha256", f"staging file checksum mismatch for {asset.staging_path}"))
                                except Exception as exc:
                                    issues.append(ValidationIssue("staging_read_error", f"assets/{asset.id}/staging_path", str(exc)))
                    else:
                        issues.append(ValidationIssue("missing_asset_root", f"assets/{asset.id}/staging_path", "asset_root required for staging path"))


        if issues:
            raise ReleaseValidationError(tuple(issues))

        # Prepare deterministic data
        # Sort all lists
        institutions = sorted(registry.institutions, key=lambda x: x.id)
        brands = sorted(registry.brands, key=lambda x: x.id)
        identifiers = sorted(registry.identifiers, key=lambda x: (x.owner_id, x.type, x.value))
        aliases = sorted(registry.aliases, key=lambda x: (x.owner_id, x.alias_value))
        rekey_events = sorted(registry.rekey_events, key=lambda x: x.id)
        relationships = sorted(registry.relationships, key=lambda x: x.id)
        assets = sorted(registry.assets, key=lambda x: x.id)
        sources = sorted(registry.sources, key=lambda x: x.id)
        source_runs = sorted(registry.source_runs, key=lambda x: x.id)

        # Compute input_sha256 as hash of canonical JSON of registry (sorted)
        # Use model_dump with exclude_none
        input_obj = {
            "institutions": [json.loads(i.model_dump_json(exclude_none=True)) for i in institutions],
            "brands": [json.loads(b.model_dump_json(exclude_none=True)) for b in brands],
            "identifiers": [json.loads(i.model_dump_json(exclude_none=True)) for i in identifiers],
            "aliases": [json.loads(a.model_dump_json(exclude_none=True)) for a in aliases],
            "rekey_events": [json.loads(r.model_dump_json(exclude_none=True)) for r in rekey_events],
            "relationships": [json.loads(r.model_dump_json(exclude_none=True)) for r in relationships],
            "assets": [json.loads(a.model_dump_json(exclude_none=True)) for a in assets],
            "sources": [json.loads(s.model_dump_json(exclude_none=True)) for s in sources],
            "source_runs": [json.loads(s.model_dump_json(exclude_none=True)) for s in source_runs],
        }
        # Need to sort keys inside each object via deterministic json
        input_json_str = _deterministic_json(input_obj)
        input_sha = _hash_bytes(input_json_str.encode("utf-8"))

        # Processor version
        processor_version = __version__

        # Build files in temp directory
        # Use output_dir.parent / f".{output_dir.name}.tmp-<random>"
        parent = output_dir.parent.resolve()
        parent.mkdir(parents=True, exist_ok=True)
        tmp_dir = Path(tempfile.mkdtemp(prefix=f".{output_dir.name}.tmp-", dir=str(parent)))
        try:
            # Write JSON files
            def write_json(name, data):
                p = tmp_dir / name
                p.parent.mkdir(parents=True, exist_ok=True)
                # data is list or dict; already sorted
                # Serialize with deterministic json
                # For Pydantic models, we already have dicts
                content = _deterministic_json(data)
                p.write_text(content, encoding="utf-8")
                # fsync
                with p.open("rb") as f:
                    os.fsync(f.fileno())
                return p

            # Write each file
            # institutions.json
            write_json("institutions.json", [json.loads(i.model_dump_json(exclude_none=True)) for i in institutions])
            write_json("brands.json", [json.loads(b.model_dump_json(exclude_none=True)) for b in brands])
            write_json("identifiers.json", [json.loads(i.model_dump_json(exclude_none=True)) for i in identifiers])
            write_json("aliases.json", [json.loads(a.model_dump_json(exclude_none=True)) for a in aliases])
            write_json("rekey-events.json", [json.loads(r.model_dump_json(exclude_none=True)) for r in rekey_events])
            write_json("relationships.json", [json.loads(r.model_dump_json(exclude_none=True)) for r in relationships])
            # assets-manifest.json: for release, we should emit assets without staging_path? The public manifest includes binary_path etc but not staging_path per spec: staging_path is never emitted.
            # We should output assets with staging_path excluded
            assets_public = []
            for a in assets:
                d = json.loads(a.model_dump_json(exclude_none=True))
                d.pop("staging_path", None)
                assets_public.append(d)
            write_json("assets-manifest.json", assets_public)
            write_json("sources.json", [json.loads(s.model_dump_json(exclude_none=True)) for s in sources])
            # Note: source_runs not necessarily emitted? But counts may include them
            # For now not emitted as separate file; but we need to ensure manifest counts

            # Copy asset binaries
            # Each asset with binary_path should have staging file copied to assets/<binary_path>
            # But binary_path is like "assets/asset_demo.svg" -> we should copy to tmp_dir / binary_path
            if registry.asset_root:
                asset_root = Path(registry.asset_root).resolve()
                for asset in assets:
                    if asset.binary_path and asset.staging_path and asset.sha256:
                        # Only copy if rights permitted (already validated)
                        if asset.rights_status in {RightsStatus.REDISTRIBUTABLE, RightsStatus.LICENSED}:
                            src = (asset_root / asset.staging_path).resolve()
                            # Double-check containment and no symlink (already validated)
                            dest = tmp_dir / asset.binary_path
                            dest.parent.mkdir(parents=True, exist_ok=True)
                            # Copy file content (already verified sha)
                            data = src.read_bytes()
                            # Verify again sha matches before copy
                            if hashlib.sha256(data).hexdigest() != asset.sha256:
                                raise ReleaseValidationError(
                                    (ValidationIssue("checksum_mismatch", f"assets/{asset.id}", "checksum mismatch at copy time"),)
                                )
                            dest.write_bytes(data)
                            with dest.open("rb") as f:
                                os.fsync(f.fileno())
                            # Also fsync directory
                            try:
                                dir_fd = os.open(dest.parent, os.O_RDONLY)
                                try:
                                    os.fsync(dir_fd)
                                finally:
                                    os.close(dir_fd)
                            except OSError:
                                pass
                    elif asset.binary_path and asset.rights_status in {RightsStatus.SOURCE_LINK_ONLY, RightsStatus.UNKNOWN, RightsStatus.REMOVED}:
                        # Should have been rejected earlier; but if we are here, don't copy
                        pass

            # Prepare manifest - collect current files
            initial_files = []
            for p in tmp_dir.rglob("*"):
                if p.is_file():
                    rel = p.relative_to(tmp_dir).as_posix()
                    initial_files.append(rel)
            initial_files_sorted = sorted(initial_files)
            initial_checksums: dict[str, str] = {}
            for rel in initial_files_sorted:
                data = (tmp_dir / rel).read_bytes()
                initial_checksums[rel] = _hash_bytes(data)

            from .domain import ReleaseManifest

            counts = {
                "institutions": len(institutions),
                "brands": len(brands),
                "identifiers": len(identifiers),
                "aliases": len(aliases),
                "rekey_events": len(rekey_events),
                "relationships": len(relationships),
                "assets": len(assets),
                "sources": len(sources),
            }
            total_records = len(institutions) + len(brands) + len(identifiers) + len(assets) + len(relationships)
            if total_records == 0:
                coverage = 1.0
            else:
                with_source = len([i for i in institutions if i.source_ids]) + len([b for b in brands if b.source_ids]) + len(identifiers) + len(assets) + len(relationships)
                coverage = with_source / total_records if total_records else 1.0

            # Create manifest with self-reference: include schema-version.json with placeholder checksum to avoid circular hash
            expected_files = sorted(initial_files_sorted + ["schema-version.json"])
            placeholder_checksums = dict(initial_checksums)
            placeholder_checksums["schema-version.json"] = "0" * 64
            # Compute stale and unresolved
            from .domain import SourceRunStatus

            successful = {r.source_id for r in source_runs if r.status == SourceRunStatus.SUCCEEDED}
            stale = len([s for s in sources if s.id not in successful])
            # unresolved_matches could be count of failed runs or 0
            manifest = ReleaseManifest(
                release_version=version,
                schema_version=SCHEMA_VERSION,
                generated_at=generated_at,
                lifecycle_status=lifecycle,
                generation_commit=generation_commit,
                source_run_ids=sorted([r.id for r in source_runs]),
                counts=counts,
                unresolved_matches=0,
                stale_sources=stale,
                provenance_coverage=coverage,
                input_sha256=input_sha,
                processor_version=processor_version,
                files=expected_files,
                checksums=placeholder_checksums,
            )
            manifest_dict = json.loads(manifest.model_dump_json(exclude_none=True))
            write_json("schema-version.json", manifest_dict)

            # Now compute final checksums for checksums.txt including the manifest (with placeholder)
            all_files = []
            for p in tmp_dir.rglob("*"):
                if p.is_file():
                    rel = p.relative_to(tmp_dir).as_posix()
                    if rel == "checksums.txt":
                        continue
                    all_files.append(rel)
            all_files_sorted = sorted(all_files)
            final_checksums: dict[str, str] = {}
            for rel in all_files_sorted:
                data = (tmp_dir / rel).read_bytes()
                final_checksums[rel] = _hash_bytes(data)
            # Update manifest object to have final checksums (file still has placeholder, but actual file hash matches final)
            manifest = manifest.model_copy(update={"files": all_files_sorted, "checksums": final_checksums})

            # Write checksums.txt with final checksums (including manifest)
            lines = [f"{final_checksums[rel]}  {rel}" for rel in sorted(final_checksums.keys())]
            checksums_content = "\n".join(lines) + "\n" if lines else ""
            (tmp_dir / "checksums.txt").write_text(checksums_content, encoding="utf-8")
            with (tmp_dir / "checksums.txt").open("rb") as f:
                os.fsync(f.fileno())

            # Validate completed manifest and checksums before rename
            if set(manifest.files) != set(manifest.checksums.keys()):
                raise ReleaseValidationError((ValidationIssue("checksum_manifest_mismatch", "manifest", "files and checksums mismatch"),))
            for rel, expected_sha in manifest.checksums.items():
                actual = _hash_bytes((tmp_dir / rel).read_bytes())
                if actual != expected_sha:
                    raise ReleaseValidationError((ValidationIssue("checksum_mismatch", rel, "checksum mismatch"),))

            # Atomically rename
            # If output_dir exists, we should not overwrite? But for now, if exists, we need to handle: existing output should be left untouched on failure, but on success we replace?
            # For byte reproducibility tests, they use different output dirs, so we can just rename.
            # Ensure parent exists
            # If output_dir already exists, remove it? But spec says leave existing untouched on failure only; on success we can replace.
            # Use os.replace for atomic rename.
            # First, ensure tmp_dir is fsynced
            try:
                dir_fd = os.open(tmp_dir, os.O_RDONLY)
                try:
                    os.fsync(dir_fd)
                finally:
                    os.close(dir_fd)
            except OSError:
                pass
            # Atomic replace: never delete existing output before replacement is ready
            # Use os.replace for atomicity (POSIX) - handles existing directory atomically
            if output_dir.exists():
                # Use backup + replace to ensure atomicity and no data loss on crash
                # First, try os.replace directly (works for files and on some Unix for dirs)
                try:
                    os.replace(tmp_dir, output_dir)
                except OSError:
                    # Fallback: move existing to backup, then promote temp, then remove backup
                    import uuid

                    backup = parent / f".{output_dir.name}.backup-{uuid.uuid4().hex[:8]}"
                    output_dir.rename(backup)
                    try:
                        tmp_dir.rename(output_dir)
                        shutil.rmtree(backup)
                    except Exception:
                        # Restore backup on failure
                        if backup.exists():
                            if output_dir.exists():
                                shutil.rmtree(output_dir)
                            backup.rename(output_dir)
                        raise
            else:
                tmp_dir.rename(output_dir)
            # Fsync parent directory after rename
            try:
                dir_fd = os.open(parent, os.O_RDONLY)
                try:
                    os.fsync(dir_fd)
                finally:
                    os.close(dir_fd)
            except OSError:
                pass

            return manifest
        except Exception:
            # Cleanup temp dir on failure
            if tmp_dir.exists():
                shutil.rmtree(tmp_dir)
            raise
        finally:
            # Ensure temp dir is cleaned up if rename succeeded, tmp_dir no longer exists; if exception, already cleaned
            pass


class ReleaseLifecycle:
    _allowed = {
        ReleaseStatus.DRAFT: {ReleaseStatus.VALIDATED},
        ReleaseStatus.VALIDATED: {ReleaseStatus.PUBLISHED},
        ReleaseStatus.PUBLISHED: {ReleaseStatus.SUPERSEDED, ReleaseStatus.WITHDRAWN},
    }

    @classmethod
    def promote(cls, manifest, target, successor=None, reason=None, validation_issues=(), at=None):
        if target not in cls._allowed.get(manifest.lifecycle_status, set()):
            raise ValueError("invalid release lifecycle transition")
        if target is ReleaseStatus.VALIDATED and validation_issues:
            raise ValueError("cannot validate release with unresolved issues")
        if target is ReleaseStatus.PUBLISHED:
            if not manifest.files or set(manifest.files) != set(manifest.checksums):
                raise ValueError("published release requires complete checksum manifest")
        if target is ReleaseStatus.SUPERSEDED and not successor:
            raise ValueError("superseded release requires successor version")
        if target is ReleaseStatus.WITHDRAWN and not reason:
            raise ValueError("withdrawn release requires reason")
        if target is ReleaseStatus.WITHDRAWN and (at is None or at.tzinfo is None or at.utcoffset() is None):
            raise ValueError("withdrawn release requires a timezone-aware transition timestamp")
        return manifest.model_copy(
            update={
                "lifecycle_status": target,
                "successor_release": successor if target is ReleaseStatus.SUPERSEDED else manifest.successor_release,
                "withdrawal_reason": reason if target is ReleaseStatus.WITHDRAWN else manifest.withdrawal_reason,
                "withdrawn_at": at if target is ReleaseStatus.WITHDRAWN else manifest.withdrawn_at,
            }
        )
