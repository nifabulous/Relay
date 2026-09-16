from scripts.benchmark_atlas import make_synthetic_database, measure


def test_synthetic_benchmark_executes_real_rollups_and_counts_one_snapshot_query():
    synthetic_engine, synthetic_sessions = make_synthetic_database(24)
    try:
        all_result = measure("all", synthetic_sessions, synthetic_engine)
        settleable_result = measure("settleable", synthetic_sessions, synthetic_engine)
        assert all_result["rows"] == 24
        assert settleable_result["rows"] < all_result["rows"]
        assert all_result["sql_selects"] == settleable_result["sql_selects"] == 1
        assert all_result["elapsed_ms"] >= 0
    finally:
        synthetic_engine.dispose()
