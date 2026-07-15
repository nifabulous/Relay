/*
 * Capstone Lab — "Send a Payment End-to-End"
 * Ties together all 6 labs into one guided wizard.
 * Loaded after learn-labs.js and learn-labs-4-6.js.
 */
window.LearnLabs = window.LearnLabs || {};

LearnLabs["capstone"] = function (main, helpers) {
  const { el, glossify, markComplete } = helpers;
  let step = 0;
  let paymentData = {};

  // HTML escape helper (prevents XSS from API/user data)
  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  function render() {
    main.innerHTML = "";
    const header = el("div", "lab-header");
    header.innerHTML = `
      <div class="lab-badge">★ Capstone</div>
      <h1>Send a Payment End-to-End</h1>
      <p>Put everything together: validate, verify, route, settle, and track a complete payment.</p>`;
    main.appendChild(header);

    // Progress indicator
    const steps = ["Validate", "Verify", "Route", "Settle", "Decide", "Track"];
    const indicator = el("div", "cap-steps");
    indicator.innerHTML = steps.map((s, i) => `
      <div class="cap-step ${i === step ? "active" : ""} ${i < step ? "done" : ""}">
        <span class="cap-step-num">${i < step ? "✓" : i + 1}</span>
        <span class="cap-step-label">${s}</span>
      </div>`).join('<span class="cap-step-arrow">→</span>');
    main.appendChild(indicator);

    // Render current step
    const content = el("div", "cap-content");
    main.appendChild(content);

    switch (step) {
      case 0: renderValidate(content); break;
      case 1: renderVerify(content); break;
      case 2: renderRoute(content); break;
      case 3: renderSettle(content); break;
      case 4: renderDecide(content); break;
      case 5: renderTrack(content); break;
    }
  }

  // ── Step 0: Validate ──────────────────────────────────
  function renderValidate(c) {
    c.innerHTML = `
      <div class="concept">
        <h2>Step 1: Enter the beneficiary details</h2>
        <p>${glossify("Let's start with the basics. We need the beneficiary's IBAN, their name, and the bank's BIC. We'll validate the format first.")}</p>
      </div>
      <div class="demo">
        <div class="demo-label">Beneficiary details</div>
        <div style="margin-bottom:0.75rem">
          <label style="font-size:0.8125rem;color:var(--ink-2);display:block;margin-bottom:4px">IBAN</label>
          <input class="lab-input" id="cs-iban" value="GB29NWBK60161331926819" placeholder="Beneficiary IBAN">
        </div>
        <div style="margin-bottom:0.75rem">
          <label style="font-size:0.8125rem;color:var(--ink-2);display:block;margin-bottom:4px">Account holder name</label>
          <input class="lab-input" id="cs-name" value="John Smith" placeholder="Name as entered by payer">
        </div>
        <div class="row" style="gap:0.75rem">
          <div style="flex:1">
            <label style="font-size:0.8125rem;color:var(--ink-2);display:block;margin-bottom:4px">Currency</label>
            <input class="lab-input" id="cs-ccy" value="USD" style="font-family:inherit">
          </div>
          <div style="flex:1">
            <label style="font-size:0.8125rem;color:var(--ink-2);display:block;margin-bottom:4px">Amount</label>
            <input class="lab-input" id="cs-amt" value="5000" type="number" style="font-family:inherit">
          </div>
        </div>
        <button class="lab-btn" id="cs-validate-btn">Validate →</button>
      </div>
      <div class="lab-result" id="cs-validate-result"></div>`;

    document.getElementById("cs-validate-btn").onclick = async () => {
      paymentData.iban = document.getElementById("cs-iban").value;
      paymentData.name = document.getElementById("cs-name").value;
      paymentData.currency = document.getElementById("cs-ccy").value;
      paymentData.amount = parseFloat(document.getElementById("cs-amt").value);

      const r = document.getElementById("cs-validate-result");
      r.classList.add("show");
      r.innerHTML = '<span class="muted">Validating...</span>';

      try {
        const res = await fetch(`/api/validate?value=${encodeURIComponent(paymentData.iban)}`).then(r => r.json());
        paymentData.bic = res.bic;
        if (res.valid) {
          r.className = "lab-result show lab-result-success";
          r.innerHTML = `
            <p><strong>✓ Valid!</strong> The IBAN format checks out.</p>
            <p class="muted">BIC derived: <span class="mono">${esc(res.bic || "—")}</span></p>
            <button class="lab-btn" id="cs-next">Continue to verification →</button>`;
          document.getElementById("cs-next").onclick = () => { step = 1; render(); };
        } else {
          r.className = "lab-result show lab-result-error";
          r.innerHTML = `<p><strong>✗ Invalid IBAN</strong></p><p class="muted">${esc(res.errors.join("; "))}</p>`;
        }
      } catch (e) {
        r.innerHTML = `<p class="muted">Error: ${esc(e.message)}</p>`;
      }
    };
  }

  // ── Step 1: Verify (VoP) ──────────────────────────────
  function renderVerify(c) {
    c.innerHTML = `
      <div class="concept">
        <h2>Step 2: Verify the payee</h2>
        <p>${glossify("Now let's check if the name matches the account holder. This is Verification of Payee (VoP).")}</p>
      </div>
      <div class="demo">
        <div class="demo-label">Checking: <span class="mono">${esc(paymentData.iban)}</span> / ${esc(paymentData.name)}</div>
        <button class="lab-btn" id="cs-vop-btn">Verify payee →</button>
      </div>
      <div class="lab-result" id="cs-vop-result"></div>`;

    document.getElementById("cs-vop-btn").onclick = async () => {
      const r = document.getElementById("cs-vop-result");
      r.classList.add("show");
      r.innerHTML = '<span class="muted">Verifying...</span>';
      try {
        const res = await fetch("/api/verify-payee", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ iban: paymentData.iban, name: paymentData.name }),
        }).then(r => r.json());
        paymentData.vop = res;

        const badgeClass = res.outcome === "MATCH" ? "badge-green" : res.outcome === "CLOSE_MATCH" ? "badge-amber" : res.outcome === "NO_MATCH" ? "badge-red" : "badge-amber";
        let html = `<p><span class="badge ${esc(badgeClass)}">${esc(res.outcome)}</span>`;
        if (res.score != null) html += ` <span class="muted">score: ${esc(res.score)}</span>`;
        html += "</p>";
        if (res.account_holder_name) {
          html += `<p class="mt-1">Real account holder: <strong>${esc(res.account_holder_name)}</strong></p>`;
        }
        html += `<p class="muted mt-1">${esc(res.advice)}</p>`;

        if (res.outcome === "MATCH") {
          html += `<button class="lab-btn" id="cs-next">Continue to routing →</button>`;
        } else if (res.outcome === "CLOSE_MATCH") {
          html += `<div class="callout"><div class="callout-title">⚠ Review needed</div>The name is close but not exact. In real life, you'd confirm with the payer. For this exercise, let's continue.</div>`;
          html += `<button class="lab-btn" id="cs-next">Continue anyway →</button>`;
        } else if (res.outcome === "NO_MATCH") {
          html += `<div class="callout" style="background:var(--red-bg);border-color:#fca5a5"><div class="callout-title" style="color:var(--red)">✗ Stop!</div>This name doesn't match at all. In real life, you would NOT proceed. For learning, let's see what would happen next.</div>`;
          html += `<button class="lab-btn secondary" id="cs-next">Continue for learning →</button>`;
        } else {
          html += `<p class="muted">Couldn't verify — let's continue.</p>`;
          html += `<button class="lab-btn" id="cs-next">Continue →</button>`;
        }
        r.innerHTML = html;
        if (document.getElementById("cs-next")) {
          document.getElementById("cs-next").onclick = () => { step = 2; render(); };
        }
      } catch (e) {
        r.innerHTML = `<p class="muted">Error: ${esc(e.message)}</p>`;
      }
    };
  }

  // ── Step 2: Route ─────────────────────────────────────
  function renderRoute(c) {
    c.innerHTML = `
      <div class="concept">
        <h2>Step 3: Find the route</h2>
        <p>${glossify("Which intermediary banks will carry this payment? Let's find the correspondent chain.")}</p>
      </div>
      <div class="demo">
        <div class="demo-label">Routing to <span class="mono">${esc(paymentData.bic || "?")}</span> in ${esc(paymentData.currency)}</div>
        <button class="lab-btn" id="cs-route-btn">Find intermediaries →</button>
      </div>
      <div class="lab-result" id="cs-route-result"></div>`;

    document.getElementById("cs-route-btn").onclick = async () => {
      const r = document.getElementById("cs-route-result");
      r.classList.add("show");
      r.innerHTML = '<span class="muted">Finding route...</span>';
      try {
        const res = await fetch(`/api/route?bic=${encodeURIComponent(paymentData.bic)}&currency=${encodeURIComponent(paymentData.currency)}`).then(r => r.json());
        paymentData.routing = res;

        let html = "";
        if (res.suggested_intermediaries.length > 0) {
          // Visual chain
          html += '<div style="display:flex;flex-wrap:wrap;gap:4px;align-items:center;margin-bottom:1rem;font-size:0.8125rem">';
          html += '<div style="padding:6px 10px;background:var(--surface-2);border-radius:6px">Your Bank</div>';
          res.suggested_intermediaries.forEach((s) => {
            html += '<span class="muted">→</span>';
            html += `<div style="padding:6px 10px;background:var(--accent-surface);border:1px solid #bfdbfe;border-radius:6px">${esc(s.bank)}</div>`;
          });
          html += '<span class="muted">→</span>';
          html += `<div style="padding:6px 10px;background:var(--green-bg);border:1px solid #bbf7d0;border-radius:6px">${esc(res.bank ? res.bank.bank_name : "Beneficiary")}</div>`;
          html += '</div>';

          html += '<table style="width:100%;font-size:0.8125rem"><thead><tr><th style="text-align:left;padding:4px">#</th><th style="text-align:left;padding:4px">BIC</th><th style="text-align:left;padding:4px">Bank</th><th style="text-align:left;padding:4px">Confidence</th></tr></thead><tbody>';
          res.suggested_intermediaries.forEach((s, i) => {
            const bc = s.confidence === "high" ? "badge-green" : s.confidence === "medium" ? "badge-amber" : "badge-red";
            html += `<tr><td style="padding:4px">${i + 1}</td><td class="mono" style="padding:4px">${esc(s.bic)}</td><td style="padding:4px">${esc(s.bank)}</td><td style="padding:4px"><span class="badge ${esc(bc)}">${esc(s.confidence)}</span></td></tr>`;
          });
          html += '</tbody></table>';
        } else {
          html += `<p class="muted">${esc(res.notes)}</p>`;
        }
        html += `<button class="lab-btn mt-1" id="cs-next" style="margin-top:1rem">Continue to settlement →</button>`;
        r.innerHTML = html;
        document.getElementById("cs-next").onclick = () => { step = 3; render(); };
      } catch (e) {
        r.innerHTML = `<p class="muted">Error: ${esc(e.message)}</p>`;
      }
    };
  }

  // ── Step 3: Settle (SSI) ──────────────────────────────
  function renderSettle(c) {
    c.innerHTML = `
      <div class="concept">
        <h2>Step 4: Settlement instructions</h2>
        <p>${glossify("Now let's find the actual account numbers (SSI) that the money needs to land in.")}</p>
      </div>
      <div class="demo">
        <div class="demo-label">SSI for <span class="mono">${esc(paymentData.bic || "?")}</span></div>
        <button class="lab-btn" id="cs-ssi-btn">Show instructions →</button>
      </div>
      <div class="lab-result" id="cs-ssi-result"></div>`;

    document.getElementById("cs-ssi-btn").onclick = async () => {
      const r = document.getElementById("cs-ssi-result");
      r.classList.add("show");
      r.innerHTML = '<span class="muted">Loading...</span>';
      try {
        const res = await fetch(`/api/ssi?bic=${encodeURIComponent(paymentData.bic)}`).then(r => r.json());
        paymentData.ssi = res;

        let html = "";
        if (res.instructions.length > 0) {
          html += '<table style="width:100%;font-size:0.8125rem"><thead><tr><th style="text-align:left;padding:4px">CCY</th><th style="text-align:left;padding:4px">Intermediary</th><th style="text-align:left;padding:4px">Account</th><th style="text-align:left;padding:4px">Charge</th></tr></thead><tbody>';
          res.instructions.forEach((s) => {
            html += `<tr><td class="mono" style="padding:4px">${esc(s.currency)}</td><td style="padding:4px">${esc(s.intermediary_bank_name || s.intermediary_bic)}</td><td class="mono" style="padding:4px">${esc(s.intermediary_account || "—")}</td><td style="padding:4px">${esc(s.charge_code)}</td></tr>`;
          });
          html += '</tbody></table>';
          html += `<p class="muted" style="margin-top:0.5rem;font-size:0.75rem">${esc(res.disclaimer)}</p>`;
        } else {
          html += `<p class="muted">No SSI records found for this bank.</p>`;
        }
        html += `<button class="lab-btn" id="cs-next" style="margin-top:1rem">Continue to decision →</button>`;
        r.innerHTML = html;
        document.getElementById("cs-next").onclick = () => { step = 4; render(); };
      } catch (e) {
        r.innerHTML = `<p class="muted">Error: ${esc(e.message)}</p>`;
      }
    };
  }

  // ── Step 4: Decide ────────────────────────────────────
  function renderDecide(c) {
    // Run the full prepare-payment to get the recommendation
    c.innerHTML = `
      <div class="concept">
        <h2>Step 5: The decision</h2>
        <p>${glossify("All four checks are done. Let's combine them into one recommendation using the prepare-payment engine.")}</p>
      </div>
      <div class="demo">
        <button class="lab-btn" id="cs-prepare-btn">Get recommendation →</button>
      </div>
      <div class="lab-result" id="cs-prepare-result"></div>`;

    document.getElementById("cs-prepare-btn").onclick = async () => {
      const r = document.getElementById("cs-prepare-result");
      r.classList.add("show");
      r.innerHTML = '<span class="muted">Analyzing all four layers...</span>';
      try {
        const res = await fetch("/api/prepare-payment", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            beneficiary_iban: paymentData.iban,
            beneficiary_name: paymentData.name,
            currency: paymentData.currency,
            amount: paymentData.amount,
          }),
        }).then(r => r.json());
        paymentData.prepare = res;
        paymentData.uetr = res.uetr;

        const recClass = res.recommendation.startsWith("PROCEED") ? "badge-green" :
                         res.recommendation === "REVIEW" || res.recommendation === "CAUTION" ? "badge-amber" : "badge-red";
        let html = `
          <p style="font-size:1.125rem"><span class="badge ${esc(recClass)}" style="font-size:0.9375rem;padding:4px 12px">${esc(res.recommendation)}</span></p>
          <p style="margin-top:0.5rem">${esc(res.reason)}</p>
          <div style="margin-top:1rem;font-size:0.8125rem">
            <p><strong>Validation:</strong> ${res.validation.valid ? "✓ Valid" : "✗ Invalid"}</p>
            <p><strong>VoP:</strong> ${esc(res.vop.outcome)} ${res.vop.score != null ? "(score: " + esc(res.vop.score) + ")" : ""}</p>
            <p><strong>Routing:</strong> ${esc(res.routing.suggested_intermediaries.length)} intermediaries found</p>
            <p><strong>SSI:</strong> ${esc(res.ssi.instructions.length)} records, ${res.ssi.has_real_accounts ? "real accounts" : "placeholders"}</p>
          </div>`;

        if (res.warnings.length) {
          html += `<div class="callout" style="margin-top:1rem"><strong>⚠ Warnings:</strong><br>${res.warnings.map(w => esc(w)).join("<br>")}</div>`;
        }

        html += `<p class="muted" style="margin-top:0.5rem">UETR: <span class="mono">${esc(res.uetr)}</span></p>`;

        if (res.is_blocking) {
          html += `<div class="callout" style="background:var(--red-bg);border-color:#fca5a5"><strong>This payment is BLOCKED.</strong> In real life, the Send button would be disabled. For learning, you can still see the tracking timeline →</div>`;
        }

        html += `<button class="lab-btn" id="cs-next" style="margin-top:1rem">See the tracking timeline →</button>`;
        r.innerHTML = html;
        document.getElementById("cs-next").onclick = () => { step = 5; render(); };
      } catch (e) {
        r.innerHTML = `<p class="muted">Error: ${esc(e.message)}</p>`;
      }
    };
  }

  // ── Step 5: Track ─────────────────────────────────────
  function renderTrack(c) {
    c.innerHTML = `
      <div class="concept">
        <h2>Step 6: Track the payment</h2>
        <p>${glossify("If this payment were sent, here's how it would be tracked using the UETR. Let's create a simulated timeline.")}</p>
      </div>
      <div class="demo">
        <button class="lab-btn" id="cs-track-btn">Create & track payment →</button>
      </div>
      <div class="lab-result" id="cs-track-result"></div>`;

    document.getElementById("cs-track-btn").onclick = async () => {
      const r = document.getElementById("cs-track-result");
      r.classList.add("show");
      r.innerHTML = '<span class="muted">Creating payment...</span>';
      try {
        // Use the intermediaries from the routing step if available
        const intermediaries = (paymentData.routing && paymentData.routing.suggested_intermediaries) || [];
        const res = await fetch("/api/track/create", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            originator_bic: "BOFAUS3NXXX",
            originator_name: "Bank of America",
            beneficiary_bic: paymentData.bic || "GTBINGLAXXX",
            beneficiary_name: paymentData.name,
            currency: paymentData.currency,
            amount: paymentData.amount,
            intermediary_bics: intermediaries.slice(0, 1).map(i => i.bic),
            intermediary_names: intermediaries.slice(0, 1).map(i => i.bank),
          }),
        }).then(r => r.json());

        let html = `
          <p><strong>UETR:</strong> <span class="mono">${esc(res.uetr)}</span></p>
          <p><strong>Status:</strong> <span class="badge ${esc(res.current_status === "CREDITED" ? "badge-green" : res.current_status === "REJECTED" ? "badge-red" : "badge-amber")}">${esc(res.current_status)}</span></p>`;

        if (res.total_fees != null) {
          html += `<p><strong>Sent:</strong> ${esc(res.sent_amount)} → <strong>Received:</strong> ${esc(res.final_amount)} (fees: ${esc(res.total_fees)})</p>`;
        }

        html += '<div style="margin-top:1rem">';
        res.timeline.forEach((e) => {
          const color = e.status === "CREDITED" ? "var(--green)" : e.status === "REJECTED" ? "var(--red)" : "var(--accent)";
          html += `
            <div style="display:flex;gap:0.75rem;padding:0.5rem 0;border-left:3px solid ${esc(color)};padding-left:0.75rem;margin-bottom:4px">
              <span class="mono muted" style="font-size:0.75rem;min-width:60px">${esc(e.timestamp.slice(11, 19))}</span>
              <div>
                <div style="font-weight:500;font-size:0.8125rem">${esc(e.status)}</div>
                <div class="muted" style="font-size:0.75rem">${esc(e.bank_name || e.bank_bic)} — ${esc(e.message || "")}</div>
              </div>
            </div>`;
        });
        html += '</div>';

        html += `<div class="callout" style="margin-top:1rem"><strong>⚠ Simulated.</strong> Real SWIFT gpi tracking requires SWIFT membership. This timeline is generated for learning.</div>`;

        html += `<div class="callout" style="background:var(--green-bg);border-color:#bbf7d0;margin-top:1rem"><strong>🎉 You completed the capstone!</strong><br>You just simulated a complete cross-border payment: validated the details, verified the payee, found the routing, checked the settlement instructions, got a recommendation, and tracked the timeline.</div>`;

        html += `<button class="lab-btn" id="cs-complete">Mark capstone complete ✓</button>`;
        html += ` <a href="/learn" class="lab-btn secondary">Back to labs</a>`;

        r.innerHTML = html;
        document.getElementById("cs-complete").onclick = () => {
          markComplete("capstone");
          document.getElementById("cs-complete").textContent = "✓ Completed!";
          document.getElementById("cs-complete").disabled = true;
        };
      } catch (e) {
        r.innerHTML = `<p class="muted">Error: ${esc(e.message)}</p>`;
      }
    };
  }

  render();
};
