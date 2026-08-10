# Glossary and Navigation Design

## Goal

Make the glossary easier to scan and ensure inactive primary navigation items remain neutral grey across visited and unvisited states.

## Approved direction

Use a categorized card layout (option A) for the glossary. Terms are grouped into three learning-oriented categories:

- Identifiers: BIC, SWIFT code, IBAN, MOD-97.
- Correspondent banking: Nostro, Vostro, Correspondent bank, Intermediary bank, SSI.
- Tracking and messaging: UETR, gpi, MT103, pacs.008.
- Additional terms remain discoverable in an “Other payment terms” group so no glossary content is lost.

The page keeps the current client-side filtering and `?term=` deep-link behavior. The filter receives a result count and a clear no-results state. A deep-linked term is highlighted in its card and category.

## Navigation state

The active desktop and mobile destination retains the blue action treatment. Inactive destinations use the neutral ink-muted token even if the browser marks their links as visited. Hover and focus remain discoverable without adding underlines.

## Responsive behavior

Glossary cards use two columns at desktop widths and collapse to one column on narrow screens. Category headings and the result summary remain in document order and are not dependent on color.

## Accessibility

The filter remains a labelled search input. Glossary groupings use headings, term/definition pairs use a semantic `dl`, and highlighted deep-link cards expose a visual state without changing reading order.
