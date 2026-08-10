# Lab 3 VoP Form Redesign

## Goal

Make the Verification of Payee exercise feel like a normal payment-check workflow: enter the account details, enter the payee name, submit the form, and read the VoP response. Improve spacing so the reference table, form, shortcuts, result, and decision drill read as separate learning steps.

## Approved experience

The “Try it: Verify a payee” section becomes one payment-details form card with two editable text inputs:

- IBAN, prefilled with the teaching example but editable.
- Payee name, initially empty with a useful example placeholder.

The primary action is a single `Verify payee` submit button. Submitting sends the current IBAN and payee name to the existing `/api/verify-payee` endpoint and renders the existing MATCH, CLOSE_MATCH, NO_MATCH, or NOT_CHECKED result below the form.

The existing scenario shortcuts remain as learning aids. They are relabeled as “Use exact match”, “Use close match”, and “Use fraud example” and fill the payee-name field without submitting. The learner still presses `Verify payee`, making the request/result relationship explicit.

## Layout and visual treatment

- Keep the outcome reference table as the first section.
- Add a visually distinct payment-details form card with clear field labels. Use two columns for the fields on wide screens and stack them on narrow screens.
- Put scenario shortcuts below the primary form action with a divider and supporting text.
- Render the VoP result in a separate result panel with clear spacing from the form.
- Increase vertical separation before the decision drill so the result and judgment exercises do not visually run together.
- Use existing Relay tokens and shared lab styles; no new visual language or component library is introduced.

## Form semantics and accessibility

- Use a native `<form>` with `onSubmit` and a submit button; shortcut controls remain explicit `type="button"` controls.
- Both fields use ordinary `type="text"` inputs with visible labels, stable accessible names, and no read-only behavior.
- Empty-field validation appears in an inline `role="alert"` message and prevents the network request.
- The returned VoP result is exposed as a status/live region so the response is announced after submission.
- The form remains usable with keyboard-only navigation and collapses to one column on narrow screens.

## Behavior and data flow

1. `iban` is stored as local component state and starts with the published example.
2. `name` remains local component state and starts empty.
3. Form submission trims both values and rejects an empty IBAN or name with an inline alert; no request or checkpoint fires for invalid local input.
4. A valid submission calls `/api/verify-payee` with the current values and displays the parsed response.
5. The existing outcome checkpoints continue to fire from server responses: MATCH, CLOSE_MATCH, and NO_MATCH each unlock their corresponding learning checkpoint.
6. Shortcut buttons update the name field, clear any stale result/error, and do not call the API.
7. Decision-drill checkpoints and the shared lab completion checklist are unchanged.

No backend or API contract changes are required; this is a frontend interaction and presentation change using the existing `/api/verify-payee` response schema.

## Testing

- Update Lab 3 rendering assertions to verify both fields are editable normal text inputs.
- Verify submission sends the learner-entered IBAN and name and renders the returned outcome.
- Verify an empty field shows a useful validation message without calling the API or emitting a checkpoint.
- Verify scenario shortcuts fill the form without submitting.
- Preserve existing outcome, score, privacy, error, and decision-drill coverage.
- Run the full frontend test suite, production build, and live browser smoke test.
