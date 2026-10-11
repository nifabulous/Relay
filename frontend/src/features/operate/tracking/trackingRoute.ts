import type { RouteStop, RouteStopStatus } from "../../../design-system/payment-route/routeStops";
import type { TrackPaymentResponse } from "../../../api/schemas";

const FAILED = new Set(["REJECTED", "RETURNED"]);
const CREDITED = "CREDITED";

interface Bank {
  bic: string;
  name: string;
  statuses: string[];
}

/**
 * Maps the revealed timeline to route stops, one per bank. The backend emits
 * several events per bank (an intermediary sends ACCEPTED, IN_PROGRESS and
 * FORWARDED), so events are grouped by BIC in order of first appearance.
 *
 * Only revealed banks are drawn: the payload has no total hop count. The last
 * bank is the beneficiary only when the payment is credited. When a terminal
 * payment is not credited, the last bank is where it stopped: the backend
 * emits the same events for a rejecting intermediary and a rejecting
 * beneficiary, so the adapter does not claim which one it was. A bank shows as passed only when a credit
 * confirms it; otherwise it is not checked. Fewer than two banks is no route.
 */
export function trackingRouteStops(payment: TrackPaymentResponse): RouteStop[] {
  const banks: Bank[] = [];
  const byKey = new Map<string, Bank>();
  for (const event of payment.timeline) {
    const key = event.bank_bic || event.bank_name || "";
    let bank = byKey.get(key);
    if (!bank) {
      bank = { bic: event.bank_bic, name: event.bank_name || event.bank_bic, statuses: [] };
      byKey.set(key, bank);
      banks.push(bank);
    }
    bank.statuses.push(event.status);
  }
  if (banks.length < 2) return [];

  const creditedEnd = payment.is_terminal && payment.current_status === CREDITED;
  return banks.map((bank, index) => {
    const last = index === banks.length - 1;
    const role =
      index === 0 ? "origin" : last && creditedEnd ? "beneficiary" : last && payment.is_terminal ? "stopped" : "correspondent";
    let status: RouteStopStatus = "not_checked";
    if (bank.statuses.some((s) => FAILED.has(s))) status = "failed";
    else if (creditedEnd || bank.statuses[bank.statuses.length - 1] === CREDITED) status = "passed";
    return { role, name: bank.name, detail: bank.bic, status };
  });
}
