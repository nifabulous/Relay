"""Tutor telemetry: enough to debug a bad answer, never enough to read a conversation.

The tension this resolves: an operator needs to know *which sources* grounded a
poor answer, how long it took, and whether it failed — and must not be able to
read what a learner asked. Recording source IDs and omitting text satisfies both,
because the sources are catalogue data that was never private.

The second rule is that telemetry cannot break a request. A tracing backend that
is down, misconfigured, or slow must cost the learner nothing.
"""
import pytest

from app.tutor.telemetry import TutorTelemetry, build_tutor_telemetry


class _RecordingSink:
    def __init__(self, explode=False):
        self.events = []
        self._explode = explode

    def __call__(self, event):
        if self._explode:
            raise RuntimeError("tracing backend is down")
        self.events.append(event)


def _record(telemetry, **overrides):
    payload = {
        "turn_id": "b7a66317-f6ea-4d22-adec-b0600d67c148",
        "mode": "chat",
        "surface": "lesson",
        "model": "gpt-5",
        "source_ids": ["relay-concept-iban", "relay-lesson-lab-1"],
        "retrieved_count": 2,
        "latency_ms": 812.5,
        "grounded": True,
    }
    payload.update(overrides)
    return telemetry.record_run(**payload)


# ── What is recorded ────────────────────────────────────────────────────────


def test_a_run_records_the_fields_an_operator_needs_to_diagnose_it():
    sink = _RecordingSink()
    event = _record(TutorTelemetry(sink=sink))
    assert sink.events == [event]
    assert event.model == "gpt-5"
    assert event.mode == "chat"
    assert event.surface == "lesson"
    assert event.source_ids == ["relay-concept-iban", "relay-lesson-lab-1"]
    assert event.retrieved_count == 2
    assert event.latency_ms == 812.5
    assert event.grounded is True
    assert event.error_class is None


def test_a_failed_run_records_the_error_class_but_not_its_message():
    """The class says which failure mode to investigate.

    The message frequently carries provider request IDs, quota text, or an echo
    of the prompt — none of which an operator needs and all of which turns an
    error log into a partial transcript.
    """
    sink = _RecordingSink()
    event = _record(
        TutorTelemetry(sink=sink),
        grounded=False,
        error=ValueError("failed while answering: what is IBAN DE89370400440532013000"),
    )
    assert event.error_class == "ValueError"
    serialised = str(event.as_dict())
    assert "DE89370400440532013000" not in serialised
    assert "failed while answering" not in serialised


def test_truncation_flags_are_recorded_so_a_thin_answer_is_explainable():
    sink = _RecordingSink()
    event = _record(TutorTelemetry(sink=sink), truncated_history=True, truncated_evidence=True)
    assert event.truncated_history is True
    assert event.truncated_evidence is True


def test_token_counts_are_recorded_when_the_provider_supplies_them():
    sink = _RecordingSink()
    event = _record(TutorTelemetry(sink=sink), input_tokens=1200, output_tokens=310)
    assert event.input_tokens == 1200
    assert event.output_tokens == 310


def test_token_counts_are_absent_rather_than_zero_when_unknown():
    """Zero is a measurement; absent is the truth when the provider said nothing."""
    event = _record(TutorTelemetry(sink=_RecordingSink()))
    assert event.input_tokens is None
    assert event.output_tokens is None


# ── What is never recorded ──────────────────────────────────────────────────


def test_the_event_has_no_field_that_could_hold_learner_text():
    """Structural, not filtered.

    A redaction step here would be a filter someone can forget to apply. There
    is simply no field on the event for a message, an answer, or a summary, so
    capturing one requires changing the type.
    """
    event = _record(TutorTelemetry(sink=_RecordingSink()))
    forbidden = {"message", "answer", "question", "result_summary", "text", "prompt",
                 "evidence", "content", "history"}
    assert not (forbidden & set(event.as_dict()))


def test_record_run_rejects_unexpected_keyword_arguments():
    """A caller that tries to attach the message gets a TypeError, not silence."""
    with pytest.raises(TypeError):
        TutorTelemetry(sink=_RecordingSink()).record_run(
            turn_id="b7a66317-f6ea-4d22-adec-b0600d67c148",
            mode="chat",
            surface="lesson",
            model="gpt-5",
            source_ids=[],
            retrieved_count=0,
            latency_ms=1.0,
            grounded=False,
            message="What is my IBAN?",
        )


def test_source_ids_are_catalogue_identifiers_not_document_text():
    event = _record(TutorTelemetry(sink=_RecordingSink()))
    for source_id in event.source_ids:
        assert source_id.startswith("relay-")
        assert len(source_id) < 100


def test_source_ids_are_bounded_so_one_event_cannot_grow_unboundedly():
    event = _record(
        TutorTelemetry(sink=_RecordingSink()),
        source_ids=[f"relay-concept-{index}" for index in range(200)],
    )
    assert len(event.source_ids) <= 16


# ── Robustness ──────────────────────────────────────────────────────────────


def test_a_sink_that_raises_never_breaks_the_caller():
    """A tracing backend being down must cost the learner nothing.

    The alternative is a 500 on a working tutor answer because an observability
    service had an outage.
    """
    telemetry = TutorTelemetry(sink=_RecordingSink(explode=True))
    event = _record(telemetry)
    assert event is not None


def test_telemetry_with_no_sink_still_returns_an_event():
    """The default is a no-op sink, so callers need no branch of their own."""
    assert _record(TutorTelemetry()) is not None


def test_tracing_disabled_means_no_sink_is_built(monkeypatch):
    monkeypatch.delenv("TUTOR_TRACING_ENABLED", raising=False)
    telemetry = build_tutor_telemetry()
    assert telemetry.is_active is False


def test_tracing_enabled_without_the_package_degrades_to_a_no_op(monkeypatch):
    """`langfuse` lives behind an optional extra the base install does not have.

    Enabling the flag on a deployment that never installed it must not crash the
    tutor — it just means no traces.
    """
    monkeypatch.setenv("TUTOR_TRACING_ENABLED", "true")
    telemetry = build_tutor_telemetry()
    assert _record(telemetry) is not None


# ── The turn_id contract ────────────────────────────────────────────────────


def test_turn_id_is_preserved_exactly_so_feedback_can_join_on_it():
    event = _record(TutorTelemetry(sink=_RecordingSink()))
    assert event.turn_id == "b7a66317-f6ea-4d22-adec-b0600d67c148"


def test_a_generated_turn_id_is_lowercase():
    """The frontend analytics allowlist is `^[a-z0-9]+(?:-[a-z0-9]+)*$`.

    An uppercased UUID would not error — the event would be dropped silently and
    the feedback would simply never arrive. `uuid4()` stringifies lowercase
    today; this pins that rather than relying on it.
    """
    from app.tutor.schemas import TutorModelOutput, TutorResponse

    for _ in range(20):
        response = TutorResponse.from_model_output(
            TutorModelOutput(answer="x"), mode="chat", grounded=False
        )
        assert response.turn_id == response.turn_id.lower()
        assert "_" not in response.turn_id
