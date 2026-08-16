/**
 * Provenance badge for a settlement instruction.
 *
 * `status` says what is known about the source, never how old it is.
 * "published" means someone verified the bank still publishes it and is the
 * only unbadged case; "unverified" means a bank document was read but its
 * currency was never re-checked; "archived" means a point-in-time snapshot;
 * "illustrative" means no bank source at all.
 *
 * "unverified" is badged deliberately, even though it is the common case
 * today. The alternative was to call these rows published, which asserts a
 * currency nobody checked — on payment instructions that is the wrong
 * direction to be wrong in.
 */

interface SsiProvenanceProps {
  status?: string;
  asOf?: string | null;
}

const LABELS: Record<string, { short: string; title: string }> = {
  unverified: {
    short: "Unverified",
    title:
      "Read from a bank document, but nobody has confirmed the bank still " +
      "publishes it. Check with the bank before use.",
  },
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
