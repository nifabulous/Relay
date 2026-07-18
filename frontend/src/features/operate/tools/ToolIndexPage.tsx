import { Link } from "react-router-dom";
import "./OperateTools.css";

interface ToolEntry {
  href: string;
  name: string;
  description: string;
}

const TOOLS: ToolEntry[] = [
  { href: "/app/operate/fees", name: "Fee Calculator", description: "Simulate OUR/SHA/BEN fee deduction across intermediary hops" },
  { href: "/app/operate/screening", name: "Sanctions Screening", description: "Screen sender and beneficiary against a fictional watchlist" },
  { href: "/app/operate/value-date", name: "Value Date Calculator", description: "Calculate settlement value date with cut-offs and holidays" },
  { href: "/app/operate/stp", name: "MT103 STP Checker", description: "Validate an MT103 message for straight-through processing" },
  { href: "/app/operate/tracking", name: "Payment Tracking", description: "Look up a simulated payment by UETR" },
];

export function ToolIndexPage() {
  return (
    <div className="tool-index">
      <div className="tool-index__header">
        <h1>Operate tools</h1>
        <p className="measure">Individual payment tools. Each has one task and a specific result.</p>
      </div>
      <nav className="tool-index__list" aria-label="Operate tools">
        {TOOLS.map((tool) => (
          <Link key={tool.href} to={tool.href} className="tool-index__item">
            <span className="tool-index__name">{tool.name}</span>
            <span className="tool-index__desc">{tool.description}</span>
          </Link>
        ))}
      </nav>
    </div>
  );
}
