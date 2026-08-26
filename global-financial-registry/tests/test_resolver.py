from financial_registry.domain import CandidateRecord, Identifier, Institution
from financial_registry.resolver import EntityResolver, ResolverIndex


def test_exact_identifier_matches_without_review():
    existing = [
        Institution(
            id="inst_demo",
            canonical_key="institution:demo-bank-gb",
            legal_name="Demo Bank",
            normalized_name="demo bank",
            country_code="GB",
            regulator_jurisdiction="GB",
        )
    ]
    identifiers = [
        Identifier(owner_id="inst_demo", type="bic", value="DEMO GB2L", source_id="src")
    ]
    candidate = CandidateRecord(
        source_id="src_new",
        source_record_id="row-1",
        legal_name="Different Display Name",
        country_code="GB",
        identifiers=[
            Identifier(
                owner_id="inst_candidate",
                type="bic",
                value="DEMOGB2L",
                source_id="src_new",
            )
        ],
    )
    index = ResolverIndex.from_parts(existing, identifiers, verified_domains={})
    result = EntityResolver().resolve(candidate, index)
    assert result.action == "match"
    assert result.matched_id == "inst_demo"
    assert result.match_method == "exact_identifier"


def test_fuzzy_name_match_creates_review_not_merge():
    existing = [
        Institution(
            id="inst_demo",
            canonical_key="institution:demo-bank-gb",
            legal_name="Demo Bank",
            normalized_name="demo bank",
            country_code="GB",
            regulator_jurisdiction="GB",
        )
    ]
    candidate = CandidateRecord(
        source_id="src_new",
        source_record_id="row-2",
        legal_name="Demo Banking Group",
        country_code="GB",
    )
    index = ResolverIndex.from_parts(existing, identifiers=[], verified_domains={})
    result = EntityResolver().resolve(candidate, index)
    assert result.action == "review"
    assert result.matched_id == "inst_demo"


def test_conflicting_exact_identifiers_never_auto_merge():
    existing = [
        Institution(
            id="inst_a",
            canonical_key="institution:a-gb",
            legal_name="Demo A",
            normalized_name="demo a",
            country_code="GB",
            regulator_jurisdiction="GB",
        ),
        Institution(
            id="inst_b",
            canonical_key="institution:b-gb",
            legal_name="Demo B",
            normalized_name="demo b",
            country_code="GB",
            regulator_jurisdiction="GB",
        ),
    ]
    identifiers = [
        Identifier(owner_id="inst_a", type="bic", value="DEMO GB2L", source_id="src_a"),
        Identifier(owner_id="inst_b", type="bic", value="DEMOGB2L", source_id="src_b"),
    ]
    candidate = CandidateRecord(
        source_id="src_new",
        source_record_id="row-conflict",
        legal_name="Demo",
        country_code="GB",
        identifiers=[Identifier(owner_id="candidate", type="bic", value="DEMOGB2L", source_id="src_new")],
    )
    result = EntityResolver().resolve(candidate, ResolverIndex.from_parts(existing, identifiers, {}))
    assert result.action == "review"
    assert result.match_method == "conflicting_identifier"
    assert result.competing_ids == ("inst_a", "inst_b")
