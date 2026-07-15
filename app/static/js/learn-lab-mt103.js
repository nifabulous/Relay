/*
 * MT103 Message Decoder — "Read a SWIFT message field by field"
 *
 * Teaches that a cross-border payment is literally a structured text message
 * (the MT103): blocks of :TAG:VALUE fields on fixed SWIFT rules. The flagship
 * interaction is a live STP (Straight-Through Processing) check against
 * POST /api/message/stp-check — edit charge code / currency / amount and watch
 * the verdict flip between CLEAN / REPAIRABLE / REJECTED in real time. Also
 * includes an MT103 ↔ pacs.008 mapping table and a "who pays the fees?"
 * exercise keyed to field 71A.
 *
 * Loaded after glossary.js + visualizers.js, before learn.js.
 */
window.LearnLabs = window.LearnLabs || {};

(function () {
  "use strict";

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  // The canonical demo message — mirrors app/data/mt103_samples.SAMPLE_MT103,
  // a known-clean MT103 that yields verdict CLEAN. The learner can mutate the
  // editable fields (charge code, currency, amount) and watch the verdict move.
  var BASE_MSG = {
    transaction_reference: "MSG-2026-001",
    bank_op_code: "CRED",
    value_date: "2026-07-15",
    currency: "USD",
    interbank_amount: 5000.0,
    charge_code: "SHA",
    ordering: {
      account: "GB29NWBK60161331926819",
      name: "Alice Johnson",
      bic: "NWBKGB2LXXX",
    },
    beneficiary: {
      account: "DE89370400440532013000",
      name: "Bob Williams GmbH",
      bic: "COBADEFFXXX",
    },
    uetr: "8e6c1b2a-3d4e-5f6a-7b8c-9d0e1f2a3b4c",
  };

  // The 8 MT103 fields this lab (and the whole SWIFT Routing Lab) revolves
  // around. tag → { name, carries, link } where link names the next lab that
  // builds on that field.
  var KEY_FIELDS = [
    { tag: ":20:", name: "Sender's Reference", carries: "The sender's own ID for this payment.", link: null },
    { tag: ":32A:", name: "Value Date / Currency / Amount", carries: "THE MONEY — when, in what, and how much.", link: "Settlement Cycles" },
    { tag: ":50K:", name: "Ordering Customer", carries: "Who is paying. Account + name + BIC.", link: "Lab 3 (VoP)" },
    { tag: ":57A:", name: "Account-With Institution", carries: "The bank that holds the beneficiary's account.", link: "Labs 4 + 5" },
    { tag: ":59:", name: "Beneficiary Customer", carries: "Who gets paid. Account + name + BIC.", link: "Labs 1 + 3" },
    { tag: ":71A:", name: "Details of Charges", carries: "OUR / SHA / BEN — who pays the fees.", link: "Fee Calculator" },
    { tag: ":70:", name: "Remittance Information", carries: "Free-text note for the beneficiary (invoice no., etc.).", link: null },
    { tag: ":121:", name: "UETR", carries: "End-to-end tracking ID (a UUID).", link: "Lab 6" },
  ];

  // MT103 tag → pacs.008 (ISO 20022) XML element path. The "adds" column flags
  // what pacs.008 brings that MT103 cannot express (structured data).
  var PACS_MAP = [
    { mt: ":20:", pacs: "GrpHdr/MsgId", note: "1:1 — the group header reference." },
    { mt: ":32A:", pacs: "CdtTrfTxInf/IntrBkSttlmDt + Amt", note: "Date and amount split into separate elements." },
    { mt: ":50K:", pacs: "Dbtr + DbtrAcct", note: "pacs.008 adds structured PstlAdr (street, town, country)." },
    { mt: ":57A:", pacs: "CdtrAgt", note: "Agent is a structured BICFI element, not free text." },
    { mt: ":59:", pacs: "Cdtr + CdtrAcct", note: "Same structured-address upgrade as the debtor." },
    { mt: ":71A:", pacs: "ChrgBr", note: "Coded value (DEBT/CRED/SHAR) — same idea, ISO names." },
    { mt: ":70:", pacs: "RmtInf/Strd", note: "Structured remittance (invoice ref + amt), not just free text." },
    { mt: "—", pacs: "Purp/Cd", note: "pacs.008 ADDS a purpose code — MT103 has no clean equivalent." },
    { mt: "—", pacs: "LEI", note: "pacs.008 ADDS a Legal Entity Identifier on each party." },
  ];

  LearnLabs["mt103"] = function (main, helpers) {
    var el = helpers.el;
    var glossify = helpers.glossify;
    var markComplete = helpers.markComplete;
    var getProgress = helpers.getProgress;

    // Mutable copy of the demo message — editable fields write back here and
    // the STP check is re-run from this object.
    var msg = JSON.parse(JSON.stringify(BASE_MSG));
    // A small debounce so rapid typing on amount/currency doesn't spam the API.
    var runTimer = null;

    // ── HEADER ────────────────────────────────────────────────────────────
    var header = el("div", "lab-header");
    header.innerHTML =
      '<div class="lab-badge">Message Lab</div>' +
      "<h1>MT103 Message Decoder</h1>" +
      "<p>" +
      "A SWIFT payment isn't a database row or an API call \u2014 it's a " +
      "<strong>structured text message</strong>. This lab teaches you to read one " +
      "field by field, then runs it through the same Straight-Through Processing " +
      "checks a correspondent bank uses to decide whether it flows straight " +
      "through or gets kicked out for manual Repair." +
      "</p>";
    main.appendChild(header);

    // ── CONCEPT: The message IS the payment ──────────────────────────────
    var c1 = el("div", "concept");
    c1.innerHTML =
      "<h2>The message IS the payment</h2>" +
      "<p>" + glossify(
        "When you 'send money abroad,' what actually travels across the SWIFT " +
        "network is a short text message \u2014 an MT103. It's not a transfer of " +
        "funds; it's a set of instructions that tells each bank in the chain " +
        "who's paying, who's being paid, how much, and in what currency. The " +
        "money moves later, when the banks settle against their Nostro accounts."
      ) + "</p>" +
      '<p style="font-size:0.9375rem">' + glossify(
        "An MT103 is organized into three blocks:"
      ) + "</p>" +
      '<ul style="font-size:0.9375rem;padding-left:1.5rem;margin-top:0.5rem">' +
        "<li><strong>Block 1 (Basic Header)</strong> \u2014 who's sending the message " +
        "(the sender's BIC).</li>" +
        "<li><strong>Block 4 (Text Block)</strong> \u2014 the payload. Every line is a " +
        "tagged field. This is where the payment details live.</li>" +
        "<li><strong>Block 5 (Trailer)</strong> \u2014 housekeeping: checksums, " +
        "duplicate-detection flags.</li>" +
      "</ul>" +
      '<p style="font-size:0.9375rem;margin-top:0.5rem">' + glossify(
        "Inside Block 4, each field is written as a colon-delimited tag, then " +
        "the value, then a closing colon (or end of line). The tag tells the " +
        "receiving bank exactly what the value means and which validation rules " +
        "apply. There's no schema to download and no nested objects \u2014 just " +
        "flat, positional, fixed-format text."
      ) + "</p>" +
      '<p style="font-size:0.9375rem;margin-top:0.5rem">' +
        "The format is " +
        '<code class="mono">:TAG:VALUE</code> \u2014 for example ' +
        '<code class="mono">:50K:</code> (ordering customer) or ' +
        '<code class="mono">:32A:</code> (value date / currency / amount).' +
      "</p>" +
      '<div class="callout" style="margin-top:0.75rem">' +
      "<strong>Why text, not JSON?</strong> MT103 dates from the 1970s, when SWIFT " +
      "ran over telex-style store-and-forward links. Fixed-width tagged fields " +
      "were compact, parseable on tiny mainframes, and self-describing enough " +
      "for a human to read off a printout. Its successor, " +
      "<strong>pacs.008</strong> (ISO 20022), is XML \u2014 richer, but the same idea: " +
      "a structured message describing one payment. We compare the two later " +
      "in this lab." +
      "</div>";
    main.appendChild(c1);

    // ── The 8 fields that matter ─────────────────────────────────────────
    var c2 = el("div", "concept");
    var fieldsRows = KEY_FIELDS.map(function (f) {
      var linkCell = f.link
        ? '<span class="muted" style="font-size:0.8125rem">\u2192 ' + esc(f.link) + "</span>"
        : '<span class="muted" style="font-size:0.8125rem">\u2014</span>';
      return (
        "<tr>" +
          '<td class="mono" style="font-weight:600;white-space:nowrap">' + esc(f.tag) + "</td>" +
          "<td>" + esc(f.name) + "</td>" +
          "<td>" + esc(f.carries) + "</td>" +
          "<td>" + linkCell + "</td>" +
        "</tr>"
      );
    }).join("");

    c2.innerHTML =
      "<h2>The 8 fields that matter</h2>" +
      "<p>" +
      glossify(
        "An MT103 can carry dozens of optional fields, but almost every " +
        "cross-border customer payment boils down to these eight. Learn them " +
        "and you can read any MT103 \u2014 and you'll see exactly where each later " +
        "lab plugs in."
      ) +
      "</p>" +
      '<div style="overflow-x:auto;margin-top:0.75rem">' +
        '<table style="width:100%;border-collapse:collapse;font-size:0.875rem">' +
          "<thead>" +
            "<tr style=\"text-align:left;border-bottom:1px solid var(--border)\">" +
              '<th style="padding:0.5rem 0.75rem">Tag</th>' +
              '<th style="padding:0.5rem 0.75rem">Field</th>' +
              '<th style="padding:0.5rem 0.75rem">What it carries</th>' +
              '<th style="padding:0.5rem 0.75rem">Connects to</th>' +
            "</tr>" +
          "</thead>" +
          "<tbody>" + fieldsRows + "</tbody>" +
        "</table>" +
      "</div>";
    main.appendChild(c2);

    // ── INTERACTIVE DEMO: Decode and check ──────────────────────────────
    var demo = el("div", "demo");
    demo.innerHTML =
      '<div class="demo-label">Decode and check</div>' +
      '<p class="muted" style="font-size:0.875rem;margin-bottom:0.75rem">' +
      "Below is a canonical MT103, rendered the way a bank's message " +
      "console would show it. Run the STP check to see the verdict, then edit " +
      "the charge code, currency, or amount \u2014 the check re-runs automatically." +
      "</p>" +

      // The MT103 message rendered as a monospace block. The dynamic lines
      // (currency/amount/charge code) carry IDs so they can be re-rendered
      // after each edit without rebuilding the whole block.
      '<div class="mono" id="mt103-msg-block" style="' +
        "background:var(--surface);border:1px solid var(--border);border-radius:8px;" +
        'padding:0.875rem 1rem;font-size:0.8125rem;line-height:1.7;white-space:pre-wrap;word-break:break-word;margin-bottom:0.75rem">' +
        esc(renderMT103(msg)) +
      "</div>" +

      // Editable controls. Charge code is a segmented control (OUR/SHA/BEN),
      // currency + amount are plain inputs that re-check on input.
      '<div style="display:grid;grid-template-columns:1fr 1fr 1.2fr;gap:0.75rem;margin-bottom:0.75rem">' +
        '<div>' +
          '<label class="muted" style="font-size:0.75rem;display:block;margin-bottom:0.25rem">Charge code (:71A:)</label>' +
          '<div class="fee-seg-control" id="mt103-charge-seg">' +
            ["OUR", "SHA", "BEN"].map(function (cc) {
              return '<button type="button" class="fee-seg-btn' +
                (cc === msg.charge_code ? " active" : "") +
                '" data-cc="' + cc + '">' + cc + "</button>";
            }).join("") +
          "</div>" +
        "</div>" +
        '<div>' +
          '<label class="muted" style="font-size:0.75rem;display:block;margin-bottom:0.25rem">Currency</label>' +
          '<input class="lab-input mono" id="mt103-currency" type="text" value="' + esc(msg.currency) +
          '" maxlength="3" autocomplete="off" style="text-transform:uppercase" />' +
        "</div>" +
        '<div>' +
          '<label class="muted" style="font-size:0.75rem;display:block;margin-bottom:0.25rem">Amount (:32A:)</label>' +
          '<input class="lab-input mono" id="mt103-amount" type="number" step="0.01" min="0" value="' +
          esc(msg.interbank_amount) + '" autocomplete="off" />' +
        "</div>" +
      "</div>" +

      '<button class="lab-btn" id="mt103-run-btn">Run STP check</button>' +
      '<span class="muted" style="font-size:0.75rem;margin-left:0.5rem">edits re-check automatically</span>' +
      '<div class="lab-result" id="mt103-result"></div>';
    main.appendChild(demo);

    var msgBlock = demo.querySelector("#mt103-msg-block");
    var segControl = demo.querySelector("#mt103-charge-seg");
    var currencyInput = demo.querySelector("#mt103-currency");
    var amountInput = demo.querySelector("#mt103-amount");
    var runBtn = demo.querySelector("#mt103-run-btn");
    var resultBox = demo.querySelector("#mt103-result");

    // Render an MT103 as flat :TAG:VALUE text. Reads the live `msg` object so
    // the block always reflects the current editable state.
    function renderMT103(m) {
      var ord = m.ordering || {};
      var ben = m.beneficiary || {};
      var amt = Number(m.interbank_amount || 0);
      // Field 32A date is YYMMDD on the wire; we render from the ISO date.
      var vd = String(m.value_date || "");
      var yy = vd.slice(2, 4), mm = vd.slice(5, 7), dd = vd.slice(8, 10);
      return [
        "{1:F01" + esc(ord.bic || "") + "XXXX0000000000}{4:",
        ":20:" + esc(m.transaction_reference || ""),
        ":23B:" + esc(m.bank_op_code || ""),
        ":32A:" + yy + mm + dd + esc(m.currency || "") + formatAmount(amt),
        ":50K:/" + esc(ord.account || ""),
        esc(ord.name || ""),
        ":57A:" + esc(ben.bic || ""),
        ":59:/" + esc(ben.account || ""),
        esc(ben.name || ""),
        ":71A:" + esc(m.charge_code || ""),
        ":70:INVOICE 2026-0042",
        ":121:" + esc(m.uetr || ""),
        "-}",
      ].join("\n");
    }

    function formatAmount(n) {
      // MT103 amounts have no decimal point; cents are implied. 5000.00 USD
      // becomes "5000,00" on the wire (comma). We render that shape so the
      // learner sees the real format.
      var s = n.toFixed(2).replace(".", ",");
      return s;
    }

    function refreshMsgBlock() {
      msgBlock.textContent = renderMT103(msg);
    }

    // ── call the STP check API ───────────────────────────────────────────
    function callStpCheck(payload) {
      return fetch("/api/message/stp-check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }).then(function (r) {
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.json();
      });
    }

    // ── verdict → badge + tone helpers ───────────────────────────────────
    function verdictBadge(verdict) {
      var v = String(verdict || "").toUpperCase();
      if (v === "REJECTED") return '<span class="badge badge-red">REJECTED</span>';
      if (v === "REPAIRABLE") return '<span class="badge badge-amber">REPAIRABLE</span>';
      return '<span class="badge badge-green">CLEAN</span>';
    }

    function severityBadge(sev) {
      var s = String(sev || "").toLowerCase();
      if (s === "error") return '<span class="badge badge-red">error</span>';
      if (s === "warning") return '<span class="badge badge-amber">warning</span>';
      return '<span class="badge badge-green">info</span>';
    }

    // Render one field-summary row. The API returns present/valid/findings;
    // we derive a human status from those.
    function fieldStatus(fs) {
      if (!fs.present) return '<span class="badge badge-red">missing</span>';
      if (!fs.valid) return '<span class="badge badge-amber">invalid</span>';
      if (fs.findings > 0) return '<span class="badge badge-amber">' + esc(fs.findings) + " issue" + (fs.findings > 1 ? "s" : "") + "</span>";
      return '<span class="badge badge-green">ok</span>';
    }

    // ── render the full STP result ───────────────────────────────────────
    function renderResult(res) {
      var verdict = String(res.verdict || "").toUpperCase();

      var bannerClass =
        verdict === "REJECTED" ? "lab-result-error" :
        verdict === "REPAIRABLE" ? "lab-result-warn" :
        "lab-result-success";

      // Verdict headline + stp_passes signal.
      var stpLine =
        '<div style="font-size:0.875rem;margin-top:0.25rem">' +
          "<strong>STP pass:</strong> " +
          (res.stp_passes
            ? '<span class="badge badge-green">yes \u2014 flows straight through</span>'
            : '<span class="badge badge-red">no \u2014 needs manual Repair</span>') +
        "</div>";

      // Findings list (if any). Each finding is escaped in full.
      var findingsHTML = "";
      var findings = res.findings || [];
      if (findings.length) {
        findingsHTML =
          '<div style="margin-top:0.75rem">' +
            '<div class="muted" style="font-size:0.75rem;margin-bottom:0.375rem">Findings (' + esc(findings.length) + ")</div>" +
            findings.map(function (f) {
              return (
                '<div class="callout" style="padding:0.5rem 0.625rem;margin-bottom:0.375rem;font-size:0.8125rem">' +
                  '<div style="display:flex;justify-content:space-between;align-items:center;gap:0.5rem;flex-wrap:wrap">' +
                    "<span><span class=\"mono\" style=\"font-weight:600\">:" + esc(f.field) + ":</span> " +
                      esc(f.field_name) + "</span>" +
                    severityBadge(f.severity) +
                  "</div>" +
                  '<div style="margin-top:0.25rem">' + esc(f.message) + "</div>" +
                  (f.repair
                    ? '<div class="muted" style="margin-top:0.25rem;font-size:0.75rem">Repair: ' + esc(f.repair) + "</div>"
                    : "") +
                "</div>"
              );
            }).join("") +
          "</div>";
      } else {
        findingsHTML =
          '<div class="callout" style="margin-top:0.75rem;padding:0.5rem 0.625rem;font-size:0.8125rem">' +
            "No findings \u2014 every mandatory field is present and well-formed. " +
            "This message will flow through the chain without a human touching it." +
          "</div>";
      }

      // Field-by-field summary table. Built from res.field_summary.
      var summary = res.field_summary || [];
      var summaryHTML = "";
      if (summary.length) {
        var rows = summary.map(function (fs) {
          return (
            "<tr>" +
              '<td class="mono" style="font-weight:600">:' + esc(fs.field) + ":</td>" +
              "<td>" + esc(fs.field_name) + "</td>" +
              "<td>" + fieldStatus(fs) + "</td>" +
            "</tr>"
          );
        }).join("");
        summaryHTML =
          '<div style="margin-top:0.75rem;overflow-x:auto">' +
            '<table style="width:100%;border-collapse:collapse;font-size:0.8125rem">' +
              "<thead><tr style=\"text-align:left;border-bottom:1px solid var(--border)\">" +
                '<th style="padding:0.375rem 0.625rem">Tag</th>' +
                '<th style="padding:0.375rem 0.625rem">Field</th>' +
                '<th style="padding:0.375rem 0.625rem">Status</th>' +
              "</tr></thead>" +
              "<tbody>" + rows + "</tbody>" +
            "</table>" +
          "</div>";
      }

      resultBox.className = "lab-result show " + bannerClass;
      resultBox.innerHTML =
        '<div style="display:flex;align-items:center;gap:0.5rem;flex-wrap:wrap">' +
          verdictBadge(verdict) +
          '<strong style="font-size:0.9375rem">' +
            (verdict === "CLEAN" ? "Clean \u2014 no issues found" :
             verdict === "REPAIRABLE" ? "Repairable \u2014 sendable, but fix advised" :
             "Rejected \u2014 errors block straight-through processing") +
          "</strong>" +
        "</div>" +
        stpLine +
        findingsHTML +
        summaryHTML +
        '<p class="muted" style="font-size:0.75rem;margin-top:0.75rem">' +
          esc(res.disclaimer) +
        "</p>";
    }

    function showError(msg) {
      resultBox.className = "lab-result show lab-result-error";
      resultBox.innerHTML =
        '<div class="badge badge-red">Check failed</div> ' + esc(msg);
    }

    // Build the request payload from the current `msg`, then run the check.
    // `automatic` distinguishes a user-initiated click (loading state on the
    // button) from an auto-rerun on input (silent loading dot only).
    function runCheck(automatic) {
      // Normalise editable inputs back into the message object.
      var ccy = (currencyInput.value || "").trim().toUpperCase();
      var amt = parseFloat(amountInput.value);
      if (!ccy || isNaN(amt)) {
        // Don't fire half-typed values at the API; show a soft hint instead.
        resultBox.className = "lab-result show lab-result-error";
        resultBox.innerHTML =
          '<div class="badge badge-amber">Waiting</div> Enter a 3-letter currency and a numeric amount.';
        return;
      }
      msg.currency = ccy;
      msg.interbank_amount = amt;
      refreshMsgBlock();

      if (!automatic) {
        runBtn.disabled = true;
        runBtn.textContent = "Checking\u2026";
      }

      callStpCheck(msg)
        .then(function (res) { renderResult(res); })
        .catch(function (err) {
          showError(
            (err && err.message) ||
            "Couldn't reach the STP service. Is the server running?"
          );
        })
        .then(function () {
          runBtn.disabled = false;
          runBtn.textContent = "Run STP check";
        });
    }

    function scheduleAutoRun() {
      // Debounce so fast typing coalesces into one request.
      if (runTimer) clearTimeout(runTimer);
      runTimer = setTimeout(function () { runCheck(true); }, 400);
    }

    // Charge-code segmented control — mirror the fees-lab pattern exactly.
    segControl.querySelectorAll(".fee-seg-btn").forEach(function (btn) {
      btn.addEventListener("click", function () {
        segControl.querySelectorAll(".fee-seg-btn").forEach(function (b) {
          b.classList.remove("active");
        });
        btn.classList.add("active");
        msg.charge_code = btn.getAttribute("data-cc");
        refreshMsgBlock();
        runCheck(true);
      });
    });

    // Currency + amount inputs auto-rerun (debounced).
    currencyInput.addEventListener("input", scheduleAutoRun);
    amountInput.addEventListener("input", scheduleAutoRun);

    // The explicit button gives a clear first-run affordance.
    runBtn.addEventListener("click", function () { runCheck(false); });

    // Kick off an initial check so the learner sees a verdict immediately,
    // not an empty box. Treated as automatic (no button loading state).
    runCheck(true);

    // ── CALLOUT: STP disclaimer ──────────────────────────────────────────
    var callout = el("div", "callout");
    callout.innerHTML =
      '<div class="callout-title">What "STP" really means</div>' +
      glossify(
        "STP (Straight-Through Processing) is the property that a payment can " +
        "be handled end-to-end with no human in the loop. A high STP rate means " +
        "cheap, fast payments; a low one means queues of messages waiting for " +
        "someone to Repair a missing name or a malformed BIC. The check above " +
        "runs the same dozen structural rules a correspondent bank applies on " +
        "receipt \u2014 miss any of them and the message is kicked to a repair desk, " +
        "costing hours (and a fee)."
      );
    main.appendChild(callout);

    // ── MT103 ↔ pacs.008 comparison ──────────────────────────────────────
    var c3 = el("div", "concept");
    var pacsRows = PACS_MAP.map(function (row) {
      var isAdds = String(row.mt).indexOf("\u2014") !== -1 || row.mt === "\u2014";
      var mtCell = isAdds
        ? '<span class="muted">\u2014</span>'
        : '<span class="mono">' + esc(row.mt) + "</span>";
      return (
        "<tr" + (isAdds ? ' style="background:var(--accent-surface)"' : "") + ">" +
          '<td style="padding:0.5rem 0.75rem">' + mtCell + "</td>" +
          '<td class="mono" style="padding:0.5rem 0.75rem;font-size:0.8125rem;word-break:break-word">' + esc(row.pacs) + "</td>" +
          "<td>" + esc(row.note) + "</td>" +
        "</tr>"
      );
    }).join("");

    c3.innerHTML =
      "<h2>MT103 \u2194 pacs.008</h2>" +
      "<p>" + glossify(
        "MT103 is being retired in favour of pacs.008, its ISO 20022 (XML) " +
        "successor. The mapping below shows how each tag becomes an XML " +
        "element \u2014 and the highlighted rows are the things pacs.008 can " +
        "express that MT103 fundamentally cannot."
      ) + "</p>" +
      '<div style="overflow-x:auto;margin-top:0.75rem">' +
        '<table style="width:100%;border-collapse:collapse;font-size:0.875rem">' +
          "<thead>" +
            "<tr style=\"text-align:left;border-bottom:1px solid var(--border)\">" +
              '<th style="padding:0.5rem 0.75rem">MT103 tag</th>' +
              '<th style="padding:0.5rem 0.75rem">pacs.008 element</th>' +
              '<th style="padding:0.5rem 0.75rem">What changes</th>' +
            "</tr>" +
          "</thead>" +
          "<tbody>" + pacsRows + "</tbody>" +
        "</table>" +
      "</div>" +
      '<p class="muted" style="font-size:0.8125rem;margin-top:0.5rem">' +
      "Highlighted rows are <strong>pacs.008-only</strong> \u2014 structured postal " +
      "addresses, purpose codes, and LEI let a payment carry far richer data, " +
      "which is the whole reason for the migration." +
      "</p>";
    main.appendChild(c3);

    // ── EXERCISE: Find the field that decides who pays ──────────────────
    var ex1 = el("div", "exercise");
    ex1.innerHTML =
      '<div class="exercise-header">' +
        '<span class="exercise-badge">1</span>' +
        '<span class="exercise-title">Find the field that decides who pays</span>' +
      "</div>" +
      '<p class="exercise-prompt">' +
      "Which MT103 field controls whether the <strong>beneficiary pays all " +
      "fees</strong>? Type the field tag (in <code class=\"mono\">:TAG:</code> form) " +
      "and the value that makes the beneficiary pay, separated by a space \u2014 for " +
      "example, <code class=\"mono\">:XX:VAL</code>. We'll confirm the answer." +
      "</p>" +
      '<input class="lab-input mono" id="mt103-ex1-input" type="text" placeholder="e.g. :71A:BEN" autocomplete="off" />' +
      '<div style="margin-top:0.75rem" id="mt103-ex1-btnrow">' +
        '<button class="lab-btn" id="mt103-ex1-check">Check answer</button>' +
      "</div>" +
      '<div class="exercise-hint" id="mt103-ex1-hint">' +
      "The field is the one labelled <strong>Details of Charges</strong> in the " +
      "8-field table above. Its three allowed values are OUR, SHA, and BEN \u2014 " +
      "and BEN stands for \u201Cbeneficiary,\u201D which is exactly who pays when it's " +
      "set. Type <code class=\"mono\">:71A:BEN</code>." +
      "</div>" +
      '<div class="lab-result" id="mt103-ex1-result"></div>';
    main.appendChild(ex1);

    var ex1Input = ex1.querySelector("#mt103-ex1-input");
    var ex1Btn = ex1.querySelector("#mt103-ex1-check");
    var ex1Result = ex1.querySelector("#mt103-ex1-result");
    var ex1Hint = ex1.querySelector("#mt103-ex1-hint");

    ex1Btn.addEventListener("click", function () {
      var raw = (ex1Input.value || "").trim().toUpperCase().replace(/\s+/g, "");
      // Accept :71A:BEN, 71A BEN, 71A BEN, etc. Be lenient on spacing/colons
      // but strict on the answer.
      var compact = raw.replace(/[:\s]/g, "");
      var ok = compact === "71ABEN";
      ex1Result.className = "lab-result show " + (ok ? "lab-result-success" : "lab-result-error");
      if (ok) {
        ex1Result.innerHTML =
          '<div class="badge badge-green">Correct</div> ' +
          "<strong>:71A: BEN</strong> \u2014 \u201CDetails of Charges\u201D set to BEN means the " +
          "<strong>beneficiary pays all fees</strong>. Every lift fee and " +
          "correspondent charge is deducted from the amount that lands in their " +
          "account. (OUR = sender pays all; SHA = shared \u2014 the default and most " +
          "common.) The Fee Calculator lab shows exactly how much each option " +
          "costs.";
        ex1Input.disabled = true;
        ex1Btn.textContent = "Solved \u2713";
      } else {
        // Diagnose the common near-misses.
        var tag = compact.match(/^71A/) || compact.match(/71A/);
        var hasBEN = compact.indexOf("BEN") !== -1;
        var hint;
        if (tag && !hasBEN) {
          hint = "Right field (:71A:), wrong value. BEN is the value that makes " +
                 "the beneficiary pay. Try :71A:BEN.";
        } else if (hasBEN && !tag) {
          hint = "Right value (BEN), but you're missing the field tag. The field " +
                 "is :71A:. Try :71A:BEN.";
        } else {
          hint = "Not quite. Look at the 8-field table above \u2014 which tag carries " +
                 "the charge code, and which of its values is short for " +
                 "\u201Cbeneficiary\u201D? Peek at the hint if you're stuck.";
        }
        ex1Result.innerHTML =
          '<div class="badge badge-red">Try again</div> ' + esc(hint);
      }
    });

    ex1Input.addEventListener("keydown", function (e) {
      if (e.key === "Enter") ex1Btn.click();
    });

    // "Show hint" affordance for exercise 1.
    (function () {
      var btnRow = ex1.querySelector("#mt103-ex1-btnrow");
      if (!btnRow) return;
      var hintBtn = el("button", "lab-btn secondary");
      hintBtn.type = "button";
      hintBtn.textContent = "Show hint";
      hintBtn.style.marginLeft = "0.5rem";
      btnRow.appendChild(hintBtn);
      hintBtn.addEventListener("click", function () {
        ex1Hint.classList.add("show");
        hintBtn.disabled = true;
        hintBtn.textContent = "Hint shown";
      });
    })();

    // ── COMPLETE BUTTON ──────────────────────────────────────────────────
    var alreadyDone = getProgress().indexOf("mt103") !== -1;

    var completeWrap = el("div");
    completeWrap.style.marginTop = "2rem";
    var completeBtn = el("button", "lab-btn", alreadyDone ? "Mark as complete \u2713" : "Mark lab complete");
    completeBtn.type = "button";
    if (alreadyDone) completeBtn.disabled = true;
    completeWrap.appendChild(completeBtn);

    var completeMsg = el("div", "lab-result");
    completeWrap.appendChild(completeMsg);
    main.appendChild(completeWrap);

    if (alreadyDone) {
      completeMsg.className = "lab-result show lab-result-success";
      completeMsg.innerHTML =
        '<div class="badge badge-green">Completed</div> You\u2019ve finished this lab. ' +
        "You can now read an MT103 field by field and tell from its STP verdict " +
        "whether it will sail through or land on a repair desk.";
    }

    completeBtn.addEventListener("click", function () {
      markComplete("mt103");
      completeBtn.disabled = true;
      completeBtn.textContent = "Mark as complete \u2713";
      completeMsg.className = "lab-result show lab-result-success";
      completeMsg.innerHTML =
        '<div class="badge badge-green">Lab complete!</div> You can now decode an ' +
        "MT103, explain what each of the 8 key fields carries, and read an STP " +
        "verdict to know whether a payment will flow straight through.";
    });

    // ── LAB NAVIGATION ───────────────────────────────────────────────────
    var nav = el("div", "lab-nav");
    var back = el("a", "", "\u2190 Back to labs");
    back.href = "#";
    var next = el("a", "", "Glossary \u2192");
    next.href = "#glossary";
    nav.appendChild(back);
    nav.appendChild(next);
    main.appendChild(nav);
  };
})();
