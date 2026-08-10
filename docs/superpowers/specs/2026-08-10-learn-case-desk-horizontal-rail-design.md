# Learn Customer Case Desk Horizontal Rail

**Date:** 2026-08-10  
**Status:** Design approved in conversation; written-spec review pending

## Problem

The Learn landing page currently renders every Customer Case Desk as a
full-width vertical block. With four independent case desks, this makes the
page unnecessarily long and hides the fact that the cases are a browsable
collection.

## Goals

- Present all Customer Case Desk entries in a horizontal scrolling rail.
- Keep the rail scrollable on desktop, tablet, and mobile.
- Preserve each card's existing state, copy, links, buttons, and persistence.
- Make the next card partially visible so horizontal scrolling is discoverable.
- Keep mouse, touch, trackpad, keyboard, and native scrollbar interactions
  usable without custom carousel state.
- Avoid changing the technical labs, Daily Practice strip, or Case Desk route.

## Non-goals

- No JavaScript carousel state or custom Previous/Next controls.
- No reordering, filtering, pagination, or automatic rotation of cases.
- No changes to the Case Desk investigation workflow or grading behavior.
- No new visual treatment that changes the meaning of completed or under-review
  states.

## Design

### 1. Rail structure

`LearnIndexPage` will wrap the mapped `CaseEntry` components in a labelled
Customer Case Desk collection and a dedicated rail track. The card component
will remain responsible only for its existing entry presentation and state.

The track will:

- use a flex row with a consistent token-based gap;
- allow horizontal overflow while preventing accidental vertical overflow;
- use `scroll-snap-type: x mandatory`;
- set each card to `flex: 0 0 auto` so cards cannot collapse into a vertical
  stack;
- use `scroll-snap-align: start` and `scroll-margin-inline` for predictable
  stopping and keyboard focus placement;
- retain all cards in the DOM and in normal tab order.

### 2. Responsive sizing

The rail will remain horizontal at every breakpoint. Card widths will be
responsive rather than fixed to the desktop viewport:

- on narrow screens, a card will occupy most of the viewport with a visible
  portion of the next card;
- on wider screens, multiple cards will be visible while the remaining cards
  remain reachable by horizontal scrolling;
- the rail will use the existing content width and spacing tokens rather than
  introducing a separate page-wide layout system.

The native scrollbar will remain available where the browser or platform
provides it. Touch and trackpad users will be able to drag/scroll the rail,
while keyboard users can tab to a card action and rely on the browser to bring
the focused card into view.

### 3. Accessibility and motion

The collection will have the accessible label “Customer case desks.”
Each existing card keeps its `aria-labelledby` heading relationship. No card
will receive a fake carousel role or hidden controls because the experience is
a collection, not a single-item carousel.

The implementation will not add animated programmatic scrolling. This keeps
the interaction compatible with reduced-motion preferences and avoids focus
being moved unexpectedly.

## Testing and verification

- Add or update Learn index tests to confirm all catalog cases render inside the
  rail and retain unique links.
- Verify the rail's overflow and card sizing at desktop and mobile viewport
  widths.
- Verify keyboard focus reaches every card action and the focused card is not
  clipped by the rail.
- Run the relevant frontend test suite and production build.
- Recheck the live Learn page at `http://127.0.0.1:5173/app/learn` at desktop
  and mobile widths.

## Acceptance criteria

1. The four Customer Case Desk cards appear in one horizontal row.
2. The row can be scrolled horizontally on desktop, tablet, and mobile.
3. A partial next-card preview makes the overflow discoverable without extra
   instructional copy.
4. Existing Start, Resume, Review, Completed, and Under review behavior is
   unchanged.
5. Technical labs and Daily Practice remain below the rail in their current
   order.
6. No horizontal overflow is introduced on the page outside the rail.
