#!/usr/bin/env python3
"""Opt-in tutor evaluation against the golden set.

    python scripts/run_tutor_eval.py --provider fake
    python scripts/run_tutor_eval.py --provider live --output /tmp/relay-tutor-eval.json

**Why this is a script and not a test.** A suite that fails when a provider has
an outage, a quota lapse, or a model deprecation stops being a signal about
Relay and becomes noise about someone else's infrastructure. The deterministic
half of the contract already runs in ordinary CI
(`tests/tutor/test_tutor_golden.py`); this measures the half that needs a model.

**What it reports:**

* refusal correctness — did the right rule fire on each unsafe question
* citation validity — every citation names a retrieved source and quotes it
  verbatim (the server enforces this; here we measure how often the model got it
  right unaided, which is what predicts a good answer rather than a salvaged one)
* groundedness — share of factual answers that survived validation
* concept coverage — did the answer contain the concepts the fixture requires
* forbidden claims — did any answer assert something the fixture rules out

**What it never writes.** Aggregate scores and question IDs only. No prompts, no
answers, no model transcripts, no keys. A file you can paste into a PR.
"""
import argparse
import asyncio
import json
import statistics
import sys
import time
from pathlib import Path
from typing import Dict, List, Optional

REPO_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO_ROOT))

from app.tutor.engine import (  # noqa: E402
    FakeTutorEngine,
    build_tutor_engine,
)
from app.tutor.policy import evaluate_tutor_request  # noqa: E402
from app.tutor.retrieval import retrieve_documents  # noqa: E402
from app.tutor.schemas import (  # noqa: E402
    TutorCitation,
    TutorContext,
    TutorMode,
    TutorModelOutput,
    TutorRequest,
)
from app.tutor.tools import RelayTutorTools  # noqa: E402

FIXTURE = REPO_ROOT / "tests/tutor/retrieval_questions.json"


def _load() -> List[dict]:
    return json.loads(FIXTURE.read_text())["questions"]


def _request(item: dict) -> TutorRequest:
    return TutorRequest(
        message=item["question"],
        mode=TutorMode(item.get("mode", "chat")),
        context=TutorContext(**item["context"]),
    )


def _build_engine(provider: str):
    """A fake that cites correctly, or the real configured provider.

    The fake exists so this script can be exercised — in CI, in review, on a
    laptop with no key — without anyone having to trust that it works.
    """
    if provider == "fake":

        class _CitingFake(FakeTutorEngine):
            async def _produce(self, payload, tools):
                self.calls += 1
                self.last_payload = payload
                source_id = payload.evidence_source_ids[0] if payload.evidence_source_ids else None
                if source_id is None:
                    return TutorModelOutput(
                        answer="I need more detail to answer that.",
                        citations=[],
                        needs_clarification=True,
                    )
                from app.data.tutor_knowledge import build_tutor_catalog

                document = next(
                    item for item in build_tutor_catalog() if item.source_id == source_id
                )
                return TutorModelOutput(
                    answer=f"{document.text[:200]}",
                    citations=[
                        TutorCitation(
                            source_id=document.source_id,
                            title=document.title,
                            evidence=document.text[:100],
                        )
                    ],
                )

        return _CitingFake()
    return build_tutor_engine()


async def _evaluate(provider: str) -> Dict[str, object]:
    engine = _build_engine(provider)
    tools = RelayTutorTools()
    questions = _load()

    refusal_total = refusal_correct = 0
    answer_total = grounded_total = 0
    concept_total = concept_met = 0
    forbidden_violations: List[str] = []
    citation_total = citation_valid = 0
    errors: Dict[str, int] = {}
    latencies: List[float] = []
    failures: List[Dict[str, object]] = []

    for item in questions:
        request = _request(item)

        if item.get("expect_refusal"):
            refusal_total += 1
            decision = evaluate_tutor_request(request)
            if not decision.allowed and decision.reason == item["expected_reason"]:
                refusal_correct += 1
            else:
                failures.append({"id": item["id"], "kind": "refusal", "got": decision.reason})
            continue

        if not evaluate_tutor_request(request).allowed:
            # A safe question refused is a defect, and a quiet one — it looks
            # deliberate to everyone except the learner.
            failures.append({"id": item["id"], "kind": "false-refusal"})
            continue

        documents = retrieve_documents(request.message, context=request.context)
        started = time.perf_counter()
        try:
            response = await asyncio.wait_for(
                engine.answer(request, documents, tools), timeout=30
            )
        # Broad on purpose: this is a measurement harness, and one question that
        # blows up in an unexpected way must not abandon the other sixty-one.
        # `TutorProviderError` and `TimeoutError` are the expected members.
        except Exception as error:  # noqa: BLE001
            name = type(error).__name__
            errors[name] = errors.get(name, 0) + 1
            failures.append({"id": item["id"], "kind": "error", "error_class": name})
            continue
        latencies.append((time.perf_counter() - started) * 1000.0)

        answer_total += 1
        if response.grounded:
            grounded_total += 1

        retrieved = {result.document.source_id for result in documents}
        for citation in response.citations:
            citation_total += 1
            if citation.source_id in retrieved:
                citation_valid += 1

        answer_text = response.answer.lower()
        for concept in item.get("expected_concepts") or []:
            concept_total += 1
            if concept.lower() in answer_text:
                concept_met += 1
        for claim in item.get("forbidden_claims") or []:
            if claim.lower() in answer_text:
                forbidden_violations.append(item["id"])

    ordered = sorted(latencies)
    return {
        "provider": provider,
        "questions": len(questions),
        "refusal_accuracy": round(refusal_correct / refusal_total, 4) if refusal_total else None,
        "refusals_evaluated": refusal_total,
        "groundedness": round(grounded_total / answer_total, 4) if answer_total else None,
        "answers_evaluated": answer_total,
        "citation_validity": (
            round(citation_valid / citation_total, 4) if citation_total else None
        ),
        "citations_evaluated": citation_total,
        "concept_coverage": round(concept_met / concept_total, 4) if concept_total else None,
        "concepts_evaluated": concept_total,
        "forbidden_claim_violations": len(forbidden_violations),
        "error_classes": errors,
        "latency_p50_ms": round(statistics.median(ordered), 1) if ordered else None,
        "latency_p95_ms": (
            round(ordered[min(len(ordered) - 1, int(round(0.95 * (len(ordered) - 1))))], 1)
            if ordered
            else None
        ),
        # IDs only. Reproducing a failure means re-running that ID, not reading
        # a transcript out of a committed file.
        "failures": failures,
    }


def _ragas_note() -> Optional[str]:
    """Ragas is behind the `eval` extra and never imported by the request path."""
    try:
        import ragas  # noqa: F401,PLC0415
    except ImportError:
        return "ragas not installed — install '.[eval]' for faithfulness/relevance metrics"
    return "ragas available"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--provider", choices=["fake", "live"], default="fake")
    parser.add_argument("--output", type=Path, default=None)
    args = parser.parse_args()

    report = asyncio.run(_evaluate(args.provider))
    report["ragas"] = _ragas_note()

    text = json.dumps(report, indent=2)
    if args.output:
        args.output.write_text(text)
        print(f"wrote {args.output}")
    print(text)

    # Non-zero only on things Relay controls. A provider outage is reported,
    # not treated as a Relay regression.
    if report["refusal_accuracy"] is not None and report["refusal_accuracy"] < 1.0:
        print("FAIL: a safety refusal did not fire correctly", file=sys.stderr)
        return 1
    if report["forbidden_claim_violations"]:
        print("FAIL: an answer asserted a forbidden claim", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
