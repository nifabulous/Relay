/*
 * SWIFT Routing Admin UI — client-side logic.
 * Single-page app that calls the existing /api/* endpoints.
 * No framework; plain JS fetch + render. Matches the "restraint" brief.
 */

const API = "";  // same origin

// ── HTML escaping (prevents XSS from API/user data) ──────
var esc = LearnUtils.esc;

// ── Routing ──────────────────────────────────────────────
const routes = {
  dashboard: renderDashboard,
  banks: renderBanks,
  corridors: renderCorridors,
  ssi: renderSSI,
  vop: renderVoP,
  prepare: renderPrepare,
  tracking: renderTracking,
};

function navigate(page) {
  // Active nav state
  document.querySelectorAll(".nav a").forEach((a) => a.classList.remove("active"));
  const link = document.querySelector(`.nav a[data-page="${page}"]`);
  if (link) link.classList.add("active");

  // Render — guard against unknown pages
  const main = document.getElementById("main");
  main.innerHTML = "";
  if (!routes[page]) {
    main.innerHTML = '<div class="page-header"><h1>Page not found</h1><p class="muted">Unknown page. <a href="#dashboard">← Back to dashboard</a></p></div>';
    return;
  }
  routes[page](main);
  history.replaceState(null, "", "#" + page);
}

// ── Helpers ──────────────────────────────────────────────
async function api(path, opts) {
  const res = await fetch(API + path, opts);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(typeof err.detail === "string" ? err.detail : JSON.stringify(err.detail));
  }
  return res.json();
}

function el(tag, className, text) {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text != null) e.textContent = text;
  return e;
}

function h1(text, sub) {
  const h = el("div", "page-header");
  h.appendChild(el("h1", null, text));
  if (sub) h.appendChild(el("p", null, sub));
  return h;
}

function confidenceBadge(conf) {
  return `<span class="badge badge-${esc(conf)}">${esc(conf)}</span>`;
}

// ── Dashboard ────────────────────────────────────────────
async function renderDashboard(main) {
  main.appendChild(h1("Dashboard", "Overview of the routing database"));
  const stats = el("div", "stats-grid");
  main.appendChild(stats);
  stats.innerHTML = `<div class="stat"><div class="stat-label">Loading…</div></div>`;

  try {
    const h = await api("/api/health");
    const items = [
      ["SWIFT Banks", h.banks],
      ["Corridor Rules", h.corridor_rules],
      ["Fedwire Banks", h.fedwire_banks.toLocaleString()],
      ["FedACH Banks", h.fedach_banks.toLocaleString()],
      ["SSI Records", h.ssi_records],
      ["Status", h.status.toUpperCase()],
    ];
    stats.innerHTML = items.map(
      ([label, val]) =>
        `<div class="stat"><div class="stat-label">${esc(label)}</div><div class="stat-value">${esc(val)}</div></div>`
    ).join("");
  } catch (e) {
    stats.innerHTML = `<div class="stat"><div class="stat-label">Error</div><div class="stat-value">—</div></div>`;
    main.appendChild(el("div", "disclaimer", "Could not reach API: " + e.message));
  }
}

// ── Bank Directory ───────────────────────────────────────
async function renderBanks(main) {
  main.appendChild(h1("Bank Directory", "Curated SWIFT BIC directory"));

  const search = el("input");
  search.type = "text";
  search.placeholder = "Enter a BIC (e.g. GTBINGLAXXX) or IBAN…";
  search.style.marginBottom = "1rem";

  const card = el("div", "card");
  const result = el("div", "card-pad");
  card.appendChild(result);
  result.innerHTML = `<p class="muted">Search for a bank to see details.</p>`;

  async function doLookup() {
    const val = search.value.trim();
    if (!val) return;
    result.innerHTML = `<p class="muted">Looking up…</p>`;
    try {
      const r = await api("/api/lookup?bic=" + encodeURIComponent(val));
      if (!r.found) {
        result.innerHTML = `<p class="muted">No bank found for <span class="mono">${esc(val)}</span>.</p>`;
        return;
      }
      const b = r.bank;
      result.innerHTML = `
        <dl class="detail-grid">
          <dt>BIC</dt><dd>${esc(b.bic)}</dd>
          <dt>Bank</dt><dd>${esc(b.bank_name)}</dd>
          <dt>Country</dt><dd>${esc(b.country_code)}</dd>
          <dt>City</dt><dd>${esc(b.city || "—")}</dd>
          <dt>Currency</dt><dd>${esc(b.country_currency || "—")}</dd>
        </dl>`;
    } catch (e) {
      result.innerHTML = `<p class="muted">Error: ${esc(e.message)}</p>`;
    }
  }

  search.addEventListener("keydown", (e) => { if (e.key === "Enter") doLookup(); });
  main.appendChild(search);
  main.appendChild(card);
}

// ── Corridors ────────────────────────────────────────────
async function renderCorridors(main) {
  main.appendChild(h1("Payment Corridors", "Try routing a payment to see intermediary suggestions"));

  const bic = el("input"); bic.type = "text"; bic.placeholder = "Beneficiary BIC (e.g. GTBINGLAXXX)";
  const ccy = el("input"); ccy.type = "text"; ccy.placeholder = "Currency (e.g. USD)";
  const form = el("div", "row");
  form.appendChild(wrap(bic)); form.appendChild(wrap(ccy));

  const btn = el("button", "btn btn-primary", "Route");
  btn.style.marginTop = "1rem";
  btn.onclick = doRoute;

  const result = el("div", "result");

  async function doRoute() {
    if (!bic.value || !ccy.value) return;
    result.classList.add("show");
    result.innerHTML = `<p class="muted">Routing…</p>`;
    try {
      const r = await api(`/api/route?bic=${encodeURIComponent(bic.value)}&currency=${encodeURIComponent(ccy.value)}`);
      let html = `<dl class="detail-grid mb-2">
        <dt>Beneficiary</dt><dd>${r.bank ? esc(r.bank.bank_name) + " (" + esc(r.beneficiary_country) + ")" : esc(r.beneficiary_country)}</dd>
        <dt>Currency</dt><dd>${esc(r.currency)}</dd>
      </dl>`;
      if (r.suggested_intermediaries.length === 0) {
        html += `<p class="muted">${esc(r.notes)}</p>`;
      } else {
        // Animated chain (if visualizer available)
        html += `<div id="corridor-viz"></div>`;
        // Table
        html += `<table><thead><tr><th>#</th><th>BIC</th><th>Bank</th><th>Corridor</th><th>Confidence</th></tr></thead><tbody>`;
        r.suggested_intermediaries.forEach((s, i) => {
          html += `<tr><td>${i + 1}</td><td class="mono">${esc(s.bic)}</td><td>${esc(s.bank)}</td><td class="mono">${esc(s.corridor)}</td><td>${confidenceBadge(s.confidence)}</td></tr>`;
        });
        html += `</tbody></table>`;
        html += `<p class="muted mt-2">${esc(r.notes)}</p>`;
      }
      result.innerHTML = html;

      // Render animated chain after DOM is available
      if (r.suggested_intermediaries.length > 0 && window.PaymentViz) {
        var vizBox = document.getElementById("corridor-viz");
        if (vizBox) {
          var nodes = [{ label: "Sender", sub: "originator", tone: "you" }];
          r.suggested_intermediaries.forEach(function(s, i) {
            nodes.push({ label: s.bank, sub: "hop " + (i + 1), tone: "inter" });
          });
          nodes.push({
            label: r.bank ? r.bank.bank_name : "Beneficiary",
            sub: "beneficiary",
            tone: "ben",
          });
          PaymentViz.animatedChain(vizBox, nodes);
        }
      }
    } catch (e) {
      result.innerHTML = `<p class="muted">Error: ${esc(e.message)}</p>`;
    }
  }

  main.appendChild(form);
  main.appendChild(btn);
  main.appendChild(result);
}

// ── SSI Browser ──────────────────────────────────────────
async function renderSSI(main) {
  main.appendChild(h1("Settlement Instructions (SSI)", "Browse SSI records and upload new ones"));

  // Lookup section
  const bic = el("input"); bic.type = "text"; bic.placeholder = "Beneficiary BIC (e.g. GTBINGLAXXX)";
  const btn = el("button", "btn btn-primary", "Look up");
  btn.onclick = doLookup;
  const result = el("div", "result");

  async function doLookup() {
    if (!bic.value) return;
    result.classList.add("show");
    result.innerHTML = `<p class="muted">Looking up…</p>`;
    try {
      const r = await api("/api/ssi?bic=" + encodeURIComponent(bic.value));
      if (r.instructions.length === 0) {
        result.innerHTML = `<p class="muted">No SSI records for <span class="mono">${esc(bic.value)}</span>.</p>`;
        return;
      }
      let html = `<table><thead><tr><th>Currency</th><th>Intermediary</th><th>Intermediary Account</th><th>Beneficiary Account</th><th>Charge</th><th>Value Date</th></tr></thead><tbody>`;
      r.instructions.forEach((s) => {
        html += `<tr><td class="mono">${esc(s.currency)}</td><td>${esc(s.intermediary_bank_name || s.intermediary_bic)}</td><td class="mono">${esc(s.intermediary_account || "—")}</td><td class="mono">${esc(s.beneficiary_account || "—")}</td><td>${esc(s.charge_code)}</td><td>${esc(s.value_date)}</td></tr>`;
      });
      html += `</tbody></table>`;
      html += `<div class="disclaimer">${esc(r.disclaimer)}</div>`;
      result.innerHTML = html;
    } catch (e) {
      result.innerHTML = `<p class="muted">Error: ${esc(e.message)}</p>`;
    }
  }

  main.appendChild(bic);
  main.appendChild(el("div", "mt-2", null));
  btn.style.marginTop = "0.75rem"; btn.style.marginBottom = "2rem";
  main.appendChild(btn);
  main.appendChild(result);

  // Upload section
  main.appendChild(el("div", "page-header", null)).innerHTML = "<h1 style='font-size:1.125rem'>Upload SSI File</h1><p>CSV or JSON. Upsert by (beneficiary, currency, intermediary).</p>";

  const fileInput = el("input");
  fileInput.type = "file";
  fileInput.accept = ".csv,.json";
  const uploadBtn = el("button", "btn", "Upload");
  const uploadResult = el("div", "result");

  uploadBtn.onclick = async () => {
    if (!fileInput.files[0]) return;
    const fd = new FormData();
    fd.append("file", fileInput.files[0]);
    uploadResult.classList.add("show");
    uploadResult.innerHTML = `<p class="muted">Uploading…</p>`;
    try {
      const r = await api("/api/import/ssi", { method: "POST", body: fd });
      let html = `<dl class="detail-grid">
        <dt>Inserted</dt><dd>${esc(r.inserted)}</dd>
        <dt>Updated</dt><dd>${esc(r.updated)}</dd>
        <dt>Rejected</dt><dd>${esc(r.rejected)}</dd>
        <dt>Total rows</dt><dd>${esc(r.total_rows)}</dd>
      </dl>`;
      if (r.errors && r.errors.length) {
        html += `<table class="mt-2"><thead><tr><th>Row</th><th>Errors</th></tr></thead><tbody>`;
        r.errors.forEach((e) => { html += `<tr><td class="mono">${esc(e.row)}</td><td>${esc(e.errors.join("; "))}</td></tr>`; });
        html += `</tbody></table>`;
      }
      html += `<p class="muted mt-2">${esc(r.message)}</p>`;
      uploadResult.innerHTML = html;
    } catch (e) {
      uploadResult.innerHTML = `<p class="muted">Error: ${esc(e.message)}</p>`;
    }
  };

  main.appendChild(fileInput);
  main.appendChild(el("div", "mt-2", null));
  uploadBtn.style.marginTop = "0.75rem";
  main.appendChild(uploadBtn);
  main.appendChild(uploadResult);
}

// ── VoP Tester ───────────────────────────────────────────
async function renderVoP(main) {
  main.appendChild(h1("Verification of Payee", "Verify a beneficiary name against the account holder"));

  const iban = el("input"); iban.type = "text"; iban.placeholder = "IBAN (e.g. GB29NWBK60161331926819)";
  const name = el("input"); name.type = "text"; name.placeholder = "Account holder name as entered by payer";
  const form = el("div", "row");
  form.appendChild(wrap(iban)); form.appendChild(wrap(name));

  const btn = el("button", "btn btn-primary", "Verify");
  btn.style.marginTop = "1rem";
  const result = el("div", "result");

  btn.onclick = async () => {
    if (!iban.value || !name.value) return;
    result.classList.add("show");
    result.innerHTML = `<p class="muted">Verifying…</p>`;
    try {
      const r = await api("/api/verify-payee", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ iban: iban.value, name: name.value }),
      });
      let html = `<div class="mb-2"><span class="rec rec-${esc(r.outcome)}">${esc(r.outcome)}</span>`;
      if (r.score != null) html += ` <span class="muted">score: ${esc(r.score)}</span>`;
      html += `</div>`;
      html += `<dl class="detail-grid">
        <dt>Submitted</dt><dd>${esc(r.submitted_name)}</dd>`;
      if (r.account_holder_name) html += `<dt>Account holder</dt><dd>${esc(r.account_holder_name)}</dd>`;
      html += `<dt>Type</dt><dd>${esc(r.account_type || "—")}</dd>
      </dl>`;
      html += `<p class="mt-2">${esc(r.advice)}</p>`;
      result.innerHTML = html;
    } catch (e) {
      result.innerHTML = `<p class="muted">Error: ${esc(e.message)}</p>`;
    }
  };

  main.appendChild(form);
  main.appendChild(btn);
  main.appendChild(result);

  // Hint with test data
  const hint = el("p", "muted mt-2");
  hint.innerHTML = "Try: <span class='mono'>GB29NWBK60161331926819</span> / <span class='mono'>John Smith</span> (MATCH), or <span class='mono'>Jon Smyth</span> (CLOSE_MATCH), or <span class='mono'>Fraudster</span> (NO_MATCH).";
  main.appendChild(hint);
}

// ── Prepare Payment (the headline) ───────────────────────
async function renderPrepare(main) {
  main.appendChild(h1("Prepare Payment", "One call: validate + verify + route + settle → recommendation"));

  const grid = el("div", null);
  grid.innerHTML = `
    <div class="form-group"><label>Beneficiary IBAN</label><input type="text" id="pp-iban" placeholder="NG3705000012345678901234"></div>
    <div class="form-group"><label>Beneficiary Name</label><input type="text" id="pp-name" placeholder="Olaniyi Oladokun"></div>
    <div class="row">
      <div class="form-group"><label>Beneficiary BIC (optional)</label><input type="text" id="pp-bic" placeholder="GTBINGLAXXX"></div>
      <div class="form-group"><label>Currency</label><input type="text" id="pp-ccy" placeholder="USD" value="USD"></div>
      <div class="form-group"><label>Amount</label><input type="number" id="pp-amt" placeholder="1000" value="1000"></div>
    </div>
    <div class="form-group"><label>Strictness</label>
      <select id="pp-strict">
        <option value="lenient">Lenient — warn but allow</option>
        <option value="standard" selected>Standard — human confirms close matches</option>
        <option value="strict">Strict — block close/unverified</option>
      </select>
    </div>`;
  main.appendChild(grid);

  const btn = el("button", "btn btn-primary", "Prepare Payment");
  btn.style.marginTop = "0.5rem";
  const result = el("div", "result");
  main.appendChild(btn);
  main.appendChild(result);

  btn.onclick = async () => {
    const body = {
      beneficiary_iban: document.getElementById("pp-iban").value,
      beneficiary_name: document.getElementById("pp-name").value,
      beneficiary_bic: document.getElementById("pp-bic").value || undefined,
      currency: document.getElementById("pp-ccy").value,
      amount: parseFloat(document.getElementById("pp-amt").value),
      strictness: document.getElementById("pp-strict").value,
    };
    if (!body.beneficiary_iban || !body.beneficiary_name) return;

    result.classList.add("show");
    result.innerHTML = `<p class="muted">Checking all four layers…</p>`;

    try {
      const r = await api("/api/prepare-payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      let html = `<div class="mb-2">
        <span class="rec rec-${r.recommendation}">${r.recommendation}</span>
        ${r.is_blocking ? '<span class="badge badge-low" style="margin-left:8px">BLOCKING</span>' : ""}
      </div>`;
      html += `<p class="mb-2">${esc(r.reason)}</p>`;

      if (r.warnings.length) {
        html += `<div class="disclaimer">${r.warnings.map((w) => "⚠ " + esc(w)).join("<br>")}</div>`;
      }

      html += `<div class="row mt-2">
        <div class="card"><div class="card-header">Validation</div><div class="card-pad">
          <p class="muted">valid: <strong>${esc(r.validation.valid)}</strong>${r.validation.bic ? ' · BIC: <span class="mono">' + esc(r.validation.bic) + '</span>' : ""}</p>
          ${r.validation.errors.length ? '<p class="muted mt-1">' + r.validation.errors.map(esc).join("; ") + '</p>' : ""}
        </div></div>
        <div class="card"><div class="card-header">Verification of Payee</div><div class="card-pad">
          <p><strong>${esc(r.vop.outcome)}</strong>${r.vop.score != null ? ' <span class="muted">(score: ' + esc(r.vop.score) + ")</span>" : ""}</p>
          ${r.vop.account_holder_name ? '<p class="muted mt-1">Account holder: <strong>' + esc(r.vop.account_holder_name) + '</strong></p>' : ""}
        </div></div>
      </div>`;

      if (r.routing.suggested_intermediaries.length) {
        html += `<div class="card mt-2"><div class="card-header">Routing (${r.routing.suggested_intermediaries.length} intermediaries)</div><table><thead><tr><th>#</th><th>BIC</th><th>Bank</th><th>Confidence</th></tr></thead><tbody>`;
        r.routing.suggested_intermediaries.forEach((s, i) => {
          html += `<tr><td>${i + 1}</td><td class="mono">${esc(s.bic)}</td><td>${esc(s.bank)}</td><td>${confidenceBadge(s.confidence)}</td></tr>`;
        });
        html += `</tbody></table></div>`;
      }

      if (r.ssi.instructions.length) {
        html += `<div class="card mt-2"><div class="card-header">Settlement Instructions (${r.ssi.instructions.length})</div><table><thead><tr><th>CCY</th><th>Intermediary</th><th>Int. Account</th><th>Ben. Account</th><th>Charge</th></tr></thead><tbody>`;
        r.ssi.instructions.forEach((s) => {
          html += `<tr><td class="mono">${esc(s.currency)}</td><td>${esc(s.intermediary_bank_name || s.intermediary_bic)}</td><td class="mono">${esc(s.intermediary_account || "—")}</td><td class="mono">${esc(s.beneficiary_account || "—")}</td><td>${esc(s.charge_code)}</td></tr>`;
        });
        html += `</tbody></table></div>`;
      }

      html += `<p class="muted mt-2">UETR: <span class="mono">${esc(r.uetr)}</span></p>`;
      result.innerHTML = html;
    } catch (e) {
      result.innerHTML = `<p class="muted">Error: ${esc(e.message)}</p>`;
    }
  };
}

// ── Tracking ─────────────────────────────────────────────
async function renderTracking(main) {
  main.appendChild(h1("Payment Tracking", "UETR-based timeline (simulated gpi)"));

  const uetr = el("input"); uetr.type = "text"; uetr.placeholder = "UETR (UUID)";
  const btn = el("button", "btn", "Track");
  const result = el("div", "result");

  btn.onclick = async () => {
    if (!uetr.value) return;
    result.classList.add("show");
    result.innerHTML = `<p class="muted">Loading timeline…</p>`;
    try {
      const r = await api("/api/track/" + encodeURIComponent(uetr.value));
      let html = `<div class="mb-2"><span class="rec rec-${esc(r.current_status === 'CREDITED' ? 'PROCEED' : r.current_status === 'REJECTED' ? 'STOP' : 'REVIEW')}">${esc(r.current_status)}</span></div>`;
      html += `<dl class="detail-grid mb-2">
        <dt>Sent</dt><dd>${esc(r.sent_amount)} ${esc((r.timeline[0] && r.timeline[0].currency) || "")}</dd>
        ${r.final_amount ? `<dt>Final</dt><dd>${esc(r.final_amount)}</dd>` : ""}
        ${r.total_fees != null ? `<dt>Fees</dt><dd>${esc(r.total_fees)}</dd>` : ""}
        <dt>Events</dt><dd>${esc(r.event_count)}</dd>
      </dl>`;
      html += `<ul class="timeline">`;
      r.timeline.forEach((e) => {
        html += `<li class="timeline-item">
          <span class="timeline-time">${esc(e.timestamp.slice(11, 19))}</span>
          <span class="timeline-status">${esc(e.status)}</span>
          <span>${esc(e.bank_name || e.bank_bic)} — ${esc(e.message || "")}</span>
        </li>`;
      });
      html += `</ul>`;
      html += `<div class="disclaimer">${esc(r.disclaimer)}</div>`;
      result.innerHTML = html;
    } catch (e) {
      result.innerHTML = `<p class="muted">Not found or error: ${esc(e.message)}</p>`;
    }
  };

  main.appendChild(uetr);
  main.appendChild(el("div", "mt-2", null));
  btn.style.marginTop = "0.75rem"; btn.style.marginBottom = "1.5rem";
  main.appendChild(btn);
  main.appendChild(result);

  main.appendChild(el("p", "muted", "Tip: create a tracked payment via POST /api/track/create first, then paste the UETR here."));
}

// ── Utils ────────────────────────────────────────────────
function wrap(child) {
  const w = el("div"); w.appendChild(child); return w;
}

// ── Init ─────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  const page = location.hash.slice(1) || "dashboard";
  navigate(page);
});

// Handle browser back/forward and in-page hash navigation
window.addEventListener("hashchange", () => {
  const page = location.hash.slice(1) || "dashboard";
  navigate(page);
});
