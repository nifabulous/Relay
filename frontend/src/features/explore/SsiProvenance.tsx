/**
 * Provenance badge for a settlement instruction.
 *
 * `status` says how the instruction was obtained, never how old it is:
 * "published" was read from the bank's live page, "archived" from a
 * point-in-time snapshot that may since have changed, "illustrative" from
 * nothing at all. Only "archived" and "illustrative" are surfaced — a
 * published instruction is the unremarkable case and a badge on every row
 * would train people to ignore all of them.
 */

interface SsiProvenanceProps {
  status?: string;
  asOf?: string | null;
}

const LABELS: Record<string, { short: string; title: string }> = {
  archived: {
    short: "Archived",
    title:
      "Read from an archived snapshot of the bank's page, not the live page. " +
      "Verify against the bank before use.",
  },
  illustrative: {
    short: "Illustrative",
    title: "Not sourced from a bank's published instructions. Example data only.",
  },
};

export function SsiProvenance({ status, asOf }: SsiProvenanceProps) {
  const label = status ? LABELS[status] : undefined;
  if (!label) return null;
  const dated = asOf ? `${label.short} ${asOf}` : label.short;
  return (
    <span className={`ssi-provenance ssi-provenance--${status}`} title={label.title}>
      {/* Text carries the meaning; the glyph and colour only reinforce it. */}
      <span aria-hidden="true">⚠ </span>
      {dated}
    </span>
  );
}
