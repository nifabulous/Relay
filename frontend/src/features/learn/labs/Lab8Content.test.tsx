import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "../../../test/server";
import { Lab8Content } from "./Lab8Content";

function renderLab(onCheckpoint = vi.fn()) {
  const user = userEvent.setup();
  const utils = render(
    <Lab8Content moduleId="lab-8" isComplete={false} onCheckpoint={onCheckpoint} />,
  );
  return { user, onCheckpoint, ...utils };
}

describe("Lab8Content", () => {
  it("fires translate-message checkpoint after generating pacs.008", async () => {
    server.use(
      http.post("/api/message/translate", async () => {
        return HttpResponse.json({
          mapping: [
            { mt_tag: "59", mt_label: "Beneficiary Customer", iso_path: "Cdtr/Nm", iso_label: "Creditor Name", value: "Beta Ltd" },
            { mt_tag: "50K", mt_label: "Ordering Customer", iso_path: "Dbtr/Nm", iso_label: "Debtor Name", value: "Acme Corp" },
          ],
          xml: "<Document xmlns=\"urn:iso:std:iso:20022:tech:xsd:pacs.008.001.08\"><FIToFICstmrCdtTrf/></Document>",
          disclaimer: "primer",
        });
      }),
    );

    const { user, onCheckpoint } = renderLab();
    await user.click(screen.getByRole("button", { name: /generate pacs\.008/i }));

    await waitFor(() => {
      expect(onCheckpoint).toHaveBeenCalledWith("translate-message");
    });
  });

  it("fires flag-address checkpoint when a country-only address is held", async () => {
    server.use(
      http.post("/api/message/pacs008-check", async ({ request }) => {
        const body = (await request.json()) as {
          creditor_postal_address?: { street_name?: string; town_name?: string; country?: string };
        };
        const addr = body.creditor_postal_address ?? {};
        const unstructured = !!addr.country && !(addr.street_name && addr.town_name);
        return HttpResponse.json({
          verdict: unstructured ? "REPAIRABLE" : "CLEAN",
          passes: true,
          findings: unstructured
            ? [
                {
                  field: "Cdtr/PstlAdr",
                  field_name: "Creditor Postal Address",
                  severity: "warning",
                  code: "PACS-ADDR-UNSTRUCTURED",
                  message: "country-only",
                  repair: "add street and town",
                },
              ]
            : [],
          disclaimer: "primer",
        });
      }),
    );

    const { user, onCheckpoint } = renderLab();
    await user.click(screen.getByRole("button", { name: /check the address/i }));

    await waitFor(() => {
      expect(onCheckpoint).toHaveBeenCalledWith("flag-address");
    });
  });
});
