# Lab Navigation and Content Polish Design

## Goal

Make the Lab 3 learning flow easier to scan and safer to navigate without changing its completion rules or API behavior.

## Approved design

1. Show the estimated duration as a compact `12 min` pill beside the module title. Remove the separate metadata row so the title block is more compact.
2. Add deliberate spacing between the prepared examples and any validation/error message in the VoP form.
3. Rename the decision section to `Choose the safest next step`, update its supporting copy, and shorten the two question prompts while preserving their meaning and answer options.
4. Keep module navigation visible with `position: sticky` at the bottom of the module content. The previous module remains active. The next module is rendered as a visibly disabled control with an accessible explanation until the current module is complete; it becomes a normal link after completion.

## Constraints

- Preserve the existing checkpoint IDs and completion persistence.
- Do not change the VoP API request or response schema.
- Do not add dependencies or introduce a fixed viewport overlay.
- Keep navigation usable on narrow screens and with keyboard/screen-reader interaction.

## Verification

- Add component tests for the new header pill, revised decision copy, and disabled/enabled next navigation states.
- Keep existing Lab 3 interaction tests passing.
- Run the full frontend test suite, production build, diff check, and live browser smoke test.
