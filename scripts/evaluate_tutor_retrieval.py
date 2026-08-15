#!/usr/bin/env python3
"""Measure lexical retrieval against the labelled fixture — the pgvector gate.

Run:
    python scripts/evaluate_tutor_retrieval.py
    python scripts/evaluate_tutor_retrieval.py --format json

The point of this script is to make "should we add a vector database?" a
measured question rather than an architectural preference. It reports:

* top-1 / top-3 recall — did the document that should ground the answer come
  back, and how near the top
* no-match precision — of the questions that should retrieve nothing, how many
  correctly retrieved nothing. This is the metric that protects against a
  retriever that looks good by always returning *something*
* p50 / p95 latency

The fixture is authored input, not generated output. Nothing here writes back
into the questions file.
"""
import argparse
import json
import statistics
import sys
import time
from pathlib import Path
from typing import Dict, List

REPO_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO_ROOT))

from app.tutor.retrieval import retrieve_documents  # noqa: E402
from app.tutor.schemas import TutorContext  # noqa: E402

FIXTURE = REPO_ROOT / "tests/tutor/retrieval_questions.json"

# The upgrade gate from plan Task 1.3. Adopt pgvector only if one of these
# fails; a passing gate means the lexical retriever is doing its job and a
# vector store would add a service, a migration, and an embedding call on the
# request path for no measured benefit.
GATE_MIN_TOP3_RECALL = 0.85
GATE_MAX_P95_MS = 100.0
GATE_MAX_CATALOG_SIZE = 10_000


def evaluate(limit: int = 6) -> Dict[str, object]:
    payload = json.loads(FIXTURE.read_text())
    questions = payload["questions"]

    latencies: List[float] = []
    top1_hits = 0
    top3_hits = 0
    graded = 0
    no_match_expected = 0
    no_match_correct = 0
    refusals_skipped = 0
    misses: List[Dict[str, object]] = []

    for item in questions:
        # Refusal questions share this fixture with the golden set but never
        # reach retrieval — the deterministic policy answers them before any
        # lookup happens. Grading them here would score the retriever on
        # questions it is never asked, which is what silently dropped measured
        # recall from 100% to 79% the moment they were added.
        if item.get("expect_refusal"):
            refusals_skipped += 1
            continue

        context = TutorContext(**item["context"])
        started = time.perf_counter()
        results = retrieve_documents(item["question"], context=context, limit=limit)
        latencies.append((time.perf_counter() - started) * 1000.0)

        returned = [result.document.source_id for result in results]
        expected = set(item.get("expected_source_ids") or [])

        if item.get("expect_no_result"):
            no_match_expected += 1
            if not returned:
                no_match_correct += 1
            else:
                misses.append(
                    {"id": item["id"], "kind": "false-positive", "returned": returned[:3]}
                )
            continue

        graded += 1
        if returned[:1] and returned[0] in expected:
            top1_hits += 1
        if expected & set(returned[:3]):
            top3_hits += 1
        else:
            misses.append(
                {
                    "id": item["id"],
                    "kind": "miss",
                    "expected": sorted(expected),
                    "returned": returned[:3],
                }
            )

    from app.data.tutor_knowledge import build_tutor_catalog

    catalog_size = len(build_tutor_catalog())
    ordered = sorted(latencies)
    p50 = statistics.median(ordered)
    p95 = ordered[min(len(ordered) - 1, int(round(0.95 * (len(ordered) - 1))))]
    top3_recall = top3_hits / graded if graded else 0.0

    return {
        "questions": len(questions),
        "graded": graded,
        "refusals_skipped": refusals_skipped,
        "catalog_documents": catalog_size,
        "top1_recall": round(top1_hits / graded, 4) if graded else 0.0,
        "top3_recall": round(top3_recall, 4),
        "no_match_expected": no_match_expected,
        "no_match_precision": (
            round(no_match_correct / no_match_expected, 4) if no_match_expected else None
        ),
        "latency_p50_ms": round(p50, 3),
        "latency_p95_ms": round(p95, 3),
        "gate": {
            "min_top3_recall": GATE_MIN_TOP3_RECALL,
            "max_p95_ms": GATE_MAX_P95_MS,
            "max_catalog_documents": GATE_MAX_CATALOG_SIZE,
            "pgvector_indicated": (
                top3_recall < GATE_MIN_TOP3_RECALL
                or p95 > GATE_MAX_P95_MS
                or catalog_size > GATE_MAX_CATALOG_SIZE
            ),
        },
        "misses": misses,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--format", choices=["text", "json"], default="text")
    parser.add_argument("--limit", type=int, default=6)
    args = parser.parse_args()

    report = evaluate(limit=args.limit)

    if args.format == "json":
        print(json.dumps(report, indent=2))
        return 0

    gate = report["gate"]
    print(
        f"questions            {report['questions']} "
        f"({report['graded']} graded, {report['refusals_skipped']} refusals not retrieval-graded)"
    )
    print(f"catalogue documents  {report['catalog_documents']}")
    print(f"top-1 recall         {report['top1_recall']:.1%}")
    print(f"top-3 recall         {report['top3_recall']:.1%}  (gate: >= {gate['min_top3_recall']:.0%})")
    print(f"no-match precision   {report['no_match_precision']:.1%}  ({report['no_match_expected']} questions)")
    print(f"latency p50 / p95    {report['latency_p50_ms']:.2f} ms / {report['latency_p95_ms']:.2f} ms  (gate: p95 <= {gate['max_p95_ms']:.0f} ms)")
    print()
    print("pgvector indicated:  " + ("YES" if gate["pgvector_indicated"] else "no"))
    if report["misses"]:
        print()
        print(f"{len(report['misses'])} item(s) needing attention:")
        for miss in report["misses"]:
            print(f"  {miss['id']:>4}  {miss['kind']:<14} {miss.get('expected', '')} -> {miss['returned']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
