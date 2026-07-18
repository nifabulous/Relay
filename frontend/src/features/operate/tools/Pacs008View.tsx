import type { TranslateResponse } from "../../../api/schemas";
import "./OperateTools.css";

export function Pacs008View({ result }: { result: TranslateResponse }) {
  return (
    <div className="pacs008-view">
      <h3>MT103 → pacs.008 field mapping</h3>
      <table className="stp-findings">
        <thead>
          <tr><th>MT field</th><th>pacs.008 element</th><th>Value</th></tr>
        </thead>
        <tbody>
          {result.mapping.map((m, i) => (
            <tr key={i}>
              <td className="mono">{m.mt_tag} · {m.mt_label}</td>
              <td className="mono">{m.iso_path}</td>
              <td>{m.value || "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <h3>Illustrative pacs.008 XML</h3>
      <pre className="pacs008-xml mono" aria-label="pacs.008 XML"><code>{result.xml}</code></pre>
      <p className="tool-sim-label"><strong>Illustrative — not schema-validated.</strong></p>
    </div>
  );
}
