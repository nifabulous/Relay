# Five-case learner research readout

Status: **Ready for sessions — no sessions recorded yet**

Protocol: [Relay Telemetry and Learner Research Design](../specs/2026-08-12-relay-telemetry-and-learner-research-design.md)

This readout is the evidence gate for the next Relay product intervention. Do not add new Case Desk content or enable a gated search, directory, schemes, or tutor slice until the readout names one primary outcome and one selected intervention.

## Research guardrails

- Use participant codes (`P01`, `P02`), never names, emails, account numbers, or real payment data.
- Obtain consent before external recording or notes. Declining must not block product use.
- Keep raw notes separate from Relay analytics. Analytics cannot capture reasoning quality.
- Use the neutral prompt: “Use Relay to decide how this payment should be handled. Think aloud, but do not search for the answer externally.”
- Record observed behavior and de-identified paraphrases, not inferred opinions or verbatim quotes unless quotation consent is separately granted.

## Participant data handling

Complete the consent and storage details before each session. Product-use consent is separate from every research-capture choice.

- Record only in the team's approved access-controlled research storage. Name the storage location and data owner in the session record before collection; never store raw notes, recordings, transcripts, or consent details in Git, pull requests, issues, personal drives, or chat.
- Ask separately for: researcher notes, audio/video recording, transcription, and use of a de-identified quotation. A participant may use Relay without agreeing to any of these. Do not record or transcribe without the corresponding consent.
- Write only participant-code-based, behavior-focused summaries. Do not paste learner free text, names, contact details, account/payment values, screenshots, or full recordings into the worksheet. Paraphrase quotes unless the participant separately approved a de-identified quotation; redact any identifying or payment detail before it reaches the research record.
- If a participant volunteers sensitive information, stop copying or recording that detail, ask them to rephrase without it, and delete or redact the captured fragment before continuing. Do not preserve it in the readout.
- Keep the consent log, withdrawal contact, and any key linking a participant code to a person separate from research notes, with access limited to the research owner. Share the withdrawal process before the session. A participant may withdraw through synthesis lock; delete their raw materials and remove their code from the analysis. Explain that fully aggregate, de-identified findings completed after the lock may no longer be traceable to remove.
- Set the deletion date before collection. Delete raw audio/video, transcripts, and working notes no later than 30 days after the final session, or sooner on withdrawal; retain only the aggregate, de-identified readout and the minimum consent record required by the team's approved policy.

## Case coverage

| Case | Decision to observe | Participant code | Status |
|---|---|---|---|
| `canada-us-supplier` | Distinguish Interac, cross-border ACH, and SWIFT/Fedwire for an urgent USD supplier payment | — | Not run |
| `uk-eurozone-supplier` | Select the appropriate EUR rail for a UK-to-Eurozone supplier payment | — | Not run |
| `nigeria-uk-contractor` | Choose a local GBP collection route or a SWIFT fallback | — | Not run |
| `us-mexico-vendor` | Reject domestic-only options and choose a viable Mexico route | — | Not run |
| `us-nigeria-family-support` | Prefer an IMTO NGN payout when a USD wire is a poor fit | — | Not run |

## Session worksheet

Complete one copy per session. Use the authored transfer variant when available.

```text
Participant: P__    Case(s): ____    Researcher: ____    Date: ____
Product-use consent: yes / no
Researcher notes: yes / no    Audio/video: yes / no
Transcription: yes / no       De-identified quotation: yes / no
Approved storage/data owner: ____    Withdrawal process shared: yes / no

Task success: pass / partial / fail
Evidence requested or cited: ____
Transfer result: pass / partial / fail / not run
Confidence calibration: ____
Observed friction: ____
Most important de-identified behavior (paraphrase unless quotation consented): ____
Recommended product change: ____
Severity: blocker / important / polish
```

## Synthesis

After at least five sessions, summarize the evidence without averaging away blockers.

```text
Sessions completed: __ / 5 minimum
Cases observed: ____

Primary outcome:
  Can learners choose and defend a rail using the Case Desk evidence flow?
  Result: pass / partial / fail
  Evidence: ____

Recurring friction observed in at least two sessions: ____
Blocked participants: ____
Transfer performance: pass / partial / fail
Confidence calibration pattern: ____

Selected intervention: Case Desk orientation/resume / search-directory / schemes comparison / none yet
Why this intervention addresses the primary outcome: ____
Out of scope for the next slice: ____
Follow-up PR or issue: ____
```

## Decision gate

The next implementation slice may proceed only when:

- [ ] Five authored cases have been observed, with a second corridor where time permits.
- [ ] Each session has a completed worksheet and participant code.
- [ ] The readout names one primary learning outcome with supporting evidence.
- [ ] Recurring friction is separated from one-off polish feedback.
- [ ] One intervention is selected and linked to the follow-up implementation work.
- [ ] No new case or broad navigation surface is added without this readout.
