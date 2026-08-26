from financial_registry.ids import StableIdAllocator


def test_stable_ids_are_deterministic_and_kind_scoped():
    allocator = StableIdAllocator()
    first = allocator.allocate("institution", "institution:demo-bank-gb")
    second = allocator.allocate("institution", "institution:demo-bank-gb")
    brand = allocator.allocate("brand", "brand:demo-bank")
    assert first == second
    assert first.startswith("inst_")
    assert brand.startswith("brand_")
    assert brand != first


def test_source_identifier_changes_do_not_change_curated_id():
    allocator = StableIdAllocator()
    canonical = allocator.allocate("institution", "institution:demo-bank-gb")
    assert allocator.allocate("institution", "institution:demo-bank-gb") == canonical
