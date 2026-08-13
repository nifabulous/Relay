import "./CorrespondentOptions.css";

export interface CorrespondentOption {
  bic: string;
  bank: string;
  corridor?: string;
  confidence: string;
}

interface CorrespondentOptionsProps {
  options: CorrespondentOption[];
  currency?: string;
  notes?: string;
  routingBasis?: "published-ssi" | "corridor-heuristic";
}

export function CorrespondentOptions({ options, currency, notes, routingBasis = "corridor-heuristic" }: CorrespondentOptionsProps) {
  const published = routingBasis === "published-ssi";
  return (
    <div className="correspondent-options" role="group" aria-labelledby="correspondent-options-title">
      <div className="correspondent-options__header">
        <div>
          <h3 id="correspondent-options-title">
            {published ? "Published correspondents" : "Possible correspondent options"}
          </h3>
          <p className="correspondent-options__note">
            {published
              ? "This is the beneficiary bank's own published correspondent list — the authoritative instruction, not a guess."
              : "These are candidates, not a confirmed chain. Your bank may route through one or more of them, or through a different bank, depending on its Nostro relationships."}
          </p>
        </div>
        {currency && <span className="correspondent-options__currency mono">{currency}</span>}
      </div>

      <div className="correspondent-options__diagram" aria-hidden="true">
        <span className="correspondent-options__endpoint">Your bank</span>
        <span className="correspondent-options__bridge">
          {published ? `uses ${options.length} published correspondents` : `selects from ${options.length} candidates`}
        </span>
        <span className="correspondent-options__endpoint">Beneficiary bank</span>
      </div>

      {notes && <p className="correspondent-options__notes">{notes}</p>}

      <h4>{published ? "Published correspondent details" : "Candidate details"}</h4>
      <table className="correspondent-options__table">
        <thead>
          <tr><th>#</th><th>Bank</th><th>BIC</th><th>Corridor</th><th>Confidence</th></tr>
        </thead>
        <tbody>
          {options.map((option, index) => (
            <tr key={`${option.bic}-${index}`}>
              <td className="mono">{index + 1}</td>
              <td>{option.bank}</td>
              <td className="mono">{option.bic}</td>
              <td className="mono">{option.corridor ?? "—"}</td>
              <td>{option.confidence}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
