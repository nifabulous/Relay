import { Link } from "react-router-dom";
import { Icon, type IconName } from "../../../design-system/coss/icon";
import "./OperateTools.css";

interface ToolEntry {
  href: string;
  name: string;
  description: string;
  icon: IconName;
}

const TOOLS: ToolEntry[] = [
  {
    href: "/operate/fees",
    name: "Fee Calculator",
    description: "Simulate OUR/SHA/BEN fee deduction across intermediary hops",
    icon: "sliders",
  },
  {
    href: "/operate/screening",
    name: "Sanctions Screening",
    description: "Screen sender and beneficiary against a fictional watchlist",
    icon: "user",
  },
  {
    href: "/operate/value-date",
    name: "Value Date Calculator",
    description: "Calculate settlement value date with cut-offs and holidays",
    icon: "clock",
  },
  {
    href: "/operate/stp",
    name: "MT103 STP Checker",
    description: "Validate an MT103 message for straight-through processing",
    icon: "checkCircle",
  },
  {
    href: "/operate/tracking",
    name: "Payment Tracking",
    description: "Look up a simulated payment by UETR",
    icon: "route",
  },
];

export function ToolIndexPage() {
  return (
    <div className="tool-index">
      <div className="tool-index__header">
        <h1>Tools</h1>
        <p className="measure">Practical utilities for payment operations.</p>
      </div>
      <nav className="tool-index__list" aria-label="Operate tools">
        {TOOLS.map((tool) => (
          <Link key={tool.href} to={tool.href} className="tool-index__item">
            <span className="tool-index__icon-tile" aria-hidden="true">
              <Icon name={tool.icon} size={34} />
            </span>
            <span className="tool-index__copy">
              <span className="tool-index__name">{tool.name}</span>
              <span className="tool-index__desc">{tool.description}</span>
            </span>
            <span className="tool-index__open">
              Open
              <Icon name="chevronRight" size={18} />
            </span>
          </Link>
        ))}
      </nav>
    </div>
  );
}
