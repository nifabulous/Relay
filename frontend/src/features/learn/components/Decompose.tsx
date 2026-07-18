export type DecomposeTone = "accent" | "info" | "warning" | "danger";

export interface DecomposeSegment {
  value: string;
  tone: DecomposeTone;
  label: string;
}

interface DecomposeProps {
  segments: DecomposeSegment[];
}

export function Decompose({ segments }: DecomposeProps) {
  return (
    <dl className="lab-decompose">
      {segments.map((seg, i) => (
        <div key={i} className="lab-decompose__segment">
          <dd className={`lab-decompose__value lab-decompose__value--${seg.tone}`}>
            {seg.value}
          </dd>
          <dt className="lab-decompose__label">{seg.label}</dt>
        </div>
      ))}
    </dl>
  );
}
