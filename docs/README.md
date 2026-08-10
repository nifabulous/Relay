# Documentation

Reference and how-to documentation for the swift-routing repository.

## Documentation style

All docs in this folder follow the
[Google developer documentation style guide](https://developers.google.com/style).
Key rules we hold to:

- **Lead with the most important information.** State what the reader needs first, then
  the detail.
- **Second person and imperative mood** for instructions. Write "Set the flag," not
  "The system sets the flag" or "The user should set the flag."
- **Present tense, active voice.** "The sweeper reads pending rows," not "Pending rows
  are read."
- **Sentence case headings**, with no trailing numbers. Descriptive, not clever.
- **Descriptive link text.** Link the words that name the target, never "click here."
- **Define terms and spell out acronyms on first use.** For example, UAT (User
  Acceptance Testing).
- **Avoid "simply," "easily," and "just."** They hide real difficulty.
- **Use "for example" and "that is,"** not "e.g." and "i.e." Use the Oxford comma.
- **Diagrams use [Mermaid](https://mermaid.js.org/)** in fenced code blocks, so they
  render on GitHub, GitLab, and most Markdown readers without extra tooling.

When a doc is a ranked list of findings (such as the improvements doc), numbered
headings are fine, because other docs reference the items by number.

## Sentence construction: Simplified Technical English

Write every sentence to [ASD-STE100 Simplified Technical English (STE)](https://asd-ste100.org/).
STE is the controlled-language standard the aerospace industry uses for maintenance
documentation. We use it here for the same reason they do: our readers include people who
do not speak English as a first language, and our subject is money movement, where an
ambiguous sentence costs real money.

Google style governs structure, tone, headings, and formatting. STE governs how you build
the individual sentence. They rarely conflict; when they do, STE wins inside the sentence
and Google style wins everywhere else.

The rules we hold to:

- **One word, one meaning, one part of speech.** Pick a term and reuse it exactly. If a
  transaction is "dispatched," it is never later "pushed," "sent," or "released." Do not
  vary words for elegance. Never use a noun as a verb.
- **Active voice, always.** "The consumer dispatches the transaction," not "the transaction
  is dispatched."
- **Keep the articles.** Write "the approval chain," not "approval chain." Dropping
  articles saves nothing and creates ambiguity.
- **Short sentences.** 20 words maximum for an instruction, 25 for description. One
  instruction per sentence.
- **Six sentences maximum per paragraph.** One topic per paragraph.
- **Simple tenses.** Use the simple present, past, or future. Avoid the perfect and
  progressive forms where a simple tense carries the meaning.
- **Avoid `-ing` forms** unless the word is a technical name. "When the handler publishes
  the message," not "on publishing the message."
- **Three nouns maximum in a row.** "The marker for the dispatched transaction," not "the
  dispatched transaction marker state."
- **Say it positively.** "The guard rejects the request," not "the guard does not permit
  the request."
- **Use a vertical list** when a sentence carries more than two conditions or steps.
- **Do not omit words to shorten.** Keep "that," keep the articles, keep the auxiliary
  verbs. Compression is not brevity.
- **Prefer a period to a dash.** Two short sentences beat one sentence with an em dash.

The approved-vocabulary dictionary is part of the ASD-STE100 specification, which you can
download from [asd-ste100.org](https://asd-ste100.org/). We do not enforce the dictionary
word by word. We enforce the writing rules above, plus the one-meaning-per-term rule
within each document.

STE does not mean writing without technical terms. Product nouns, class names, statuses,
and enum members are technical names: use them exactly as the code spells them, in
backticks.

## Index

| Document | What it covers |
|---|---|
| [PROJECT_OVERVIEW.md](PROJECT_OVERVIEW.md) | What Relay is, the features it simulates, and the roadmap. |
