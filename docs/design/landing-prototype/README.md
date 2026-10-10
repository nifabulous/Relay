# Landing page reference prototype

`index.html` is the visual reference for
[the landing page spec](../../superpowers/specs/2026-10-01-relay-landing-and-visual-language-design.md).
It is a self-contained static file. It is not served by the app, and nothing should import from it.

Open it directly in a browser. It loads Geist from Google Fonts; the production page self-hosts.

## What it is good for

- Layout, the lines system, type scale, colour use and motion, at 390, 768, 1024 and 1440px.
- The interaction model: globe drag and corridor tour, the scroll-driven route and plates, the rails
  tabs and the IBAN demo.

## What it is not

- **A source of numbers.** Its counts are a de-duplicated snapshot taken on 2026-10-01 from the unmerged
  `feat/correspondent-atlas` branch, whose data differs from `main`. The shipped page takes every number
  from the generated facts file. Some of its tool examples were also untrue of the code; the spec's
  prototype deltas 19–25 list the corrections.
- **Production code.** It inlines about 5,800 globe points and every script, and it has no build step.

Prototype deltas 1–3, 6–12 and 14–18 from the spec are already applied here:

- muted text `#5F6F85`
- ink globe labels with a colour swatch
- pending rows and route tags in the muted token, not reduced opacity
- theme-token accent text
- a theme writer that never overwrites a record with another `schemaVersion`
- a Pause tour / Play tour control on the globe
- an IBAN demo that plays once and offers Replay
- no "Sign in"; nav links point at `/app` routes
- count-up animation on an `aria-hidden` overlay
- rails that follow the content container at every width, with outer rails at 1400px and wider
- `touch-action: pan-y` on the globe, so a swipe on it scrolls the page
- `[ simulation ]` labels in every payment-shaped section
- real link targets

Not applied: delta 4 (the inert Menu button), delta 5 (the snapshot counts) and delta 13 (globe points inlined at 2 decimals).

It supports light, dark and black: use the footer control, or set the OS appearance.
