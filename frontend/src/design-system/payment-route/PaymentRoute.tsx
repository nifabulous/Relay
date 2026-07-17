import { type ReactNode } from "react";
import type { PaymentRouteNode } from "../types";
import { routeSummary } from "./routeSummary";
import { StatusChip } from "../StatusChip";
import "./PaymentRoute.css";

interface PaymentRouteProps {
  nodes: PaymentRouteNode[];
  currency?: string;
  amount?: string;
  activeNodeId?: string;
}

const NODE_KIND_LABEL: Record<PaymentRouteNode["kind"], string> = {
  originator: "Sender",
  intermediary: "Intermediary",
  beneficiary: "Beneficiary",
};

function NodeIcon({ kind }: { kind: PaymentRouteNode["kind"] }) {
  // SVG icons — no emoji per DESIGN.md
  if (kind === "originator") {
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M22 2 11 13" />
        <path d="M22 2 15 22l-4-9-9-4Z" />
      </svg>
    );
  }
  if (kind === "beneficiary") {
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M5 12h14" />
        <path d="M12 5v14" />
      </svg>
    );
  }
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 7h16" />
      <path d="M4 12h16" />
      <path d="M4 17h16" />
    </svg>
  );
}

function ArrowIcon({ horizontal }: { horizontal: boolean }) {
  return (
    <svg
      className={`payment-route__arrow ${horizontal ? "payment-route__arrow--horizontal" : "payment-route__arrow--vertical"}`}
      width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      aria-hidden="true"
    >
      {horizontal ? <path d="M5 12h14M12 5l7 7-7 7" /> : <path d="M12 5v14M5 12l7 7 7-7" />}
    </svg>
  );
}

function NodeCard({ node, isActive, expanded }: { node: PaymentRouteNode; isActive: boolean; expanded?: boolean }) {
  return (
    <div
      className={[
        "payment-route__node",
        `payment-route__node--${node.kind}`,
        `payment-route__node--${node.status}`,
        isActive && "payment-route__node--active",
        expanded && "payment-route__node--expanded",
      ].filter(Boolean).join(" ")}
    >
      <div className="payment-route__node-header">
        <span className="payment-route__node-icon">
          <NodeIcon kind={node.kind} />
        </span>
        <span className="payment-route__node-kind">{NODE_KIND_LABEL[node.kind]}</span>
        <StatusChip status={node.status} className="payment-route__node-status" />
      </div>
      <div className="payment-route__node-name">{node.name}</div>
      <div className="payment-route__node-bic mono">{node.bic}</div>
      {(node.amount || node.fee || node.timing) && (
        <div className="payment-route__node-details">
          {node.amount && <div className="payment-route__node-amount mono">{node.amount}</div>}
          {node.fee && <div className="payment-route__node-fee mono">Fee: {node.fee}</div>}
          {node.timing && <div className="payment-route__node-timing">{node.timing}</div>}
        </div>
      )}
    </div>
  );
}

function StopIndicator({ node }: { node: PaymentRouteNode }) {
  return (
    <div className="payment-route__stop" role="alert">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
        <circle cx="12" cy="12" r="10" />
        <path d="M15 9l-6 6M9 9l6 6" />
      </svg>
      <span>Stopped at {node.name} — payment {node.status === "failed" ? "failed" : "unavailable"}</span>
    </div>
  );
}

function buildRouteContent(
  nodes: PaymentRouteNode[],
  activeNodeId: string | undefined,
  horizontal: boolean,
): ReactNode {
  if (horizontal) {
    return (
      <div className="payment-route__path">
        {nodes.map((node, i) => (
          <div key={node.id} className="payment-route__path-item">
            <NodeCard node={node} isActive={node.id === activeNodeId} />
            {i < nodes.length - 1 && (
              <div className="payment-route__connector">
                <ArrowIcon horizontal={true} />
              </div>
            )}
          </div>
        ))}
      </div>
    );
  }

  // Vertical stepper — document order, active hop expands
  return (
    <div className="payment-route__steps">
      {nodes.map((node, i) => (
        <div key={node.id} className="payment-route__step">
          <div className="payment-route__step-rail">
            <div className={`payment-route__step-dot payment-route__step-dot--${node.status}`}>
              <NodeIcon kind={node.kind} />
            </div>
            {i < nodes.length - 1 && <div className="payment-route__step-line" />}
          </div>
          <div className="payment-route__step-content">
            <NodeCard
              node={node}
              isActive={node.id === activeNodeId}
              expanded={node.id === activeNodeId}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

export function PaymentRoute({ nodes, currency, amount, activeNodeId }: PaymentRouteProps) {
  const summary = routeSummary(nodes, currency, amount);
  const failedNode = nodes.find((n) => n.status === "failed" || n.status === "unavailable");

  return (
    <div className="payment-route" role="img" aria-label={summary}>
      {/* Currency/amount header */}
      {(currency || amount) && (
        <div className="payment-route__header">
          {amount && <span className="payment-route__amount mono">{amount}</span>}
          {currency && <span className="payment-route__currency">{currency}</span>}
        </div>
      )}

      {/* Horizontal layout (desktop ≥768px) */}
      <div className="payment-route--horizontal payment-route__layout">
        {buildRouteContent(nodes, activeNodeId, true)}
      </div>

      {/* Vertical layout (mobile <768px) */}
      <div className="payment-route--vertical payment-route__layout">
        {buildRouteContent(nodes, activeNodeId, false)}
      </div>

      {/* Stop indicator for reject/incomplete paths */}
      {failedNode && <StopIndicator node={failedNode} />}

      {/* Currency/amount footer */}
      {(currency || amount) && (
        <div className="payment-route__footer">
          {amount && <span className="payment-route__amount mono">{amount}</span>}
          {currency && <span className="payment-route__currency">{currency}</span>}
        </div>
      )}
    </div>
  );
}
