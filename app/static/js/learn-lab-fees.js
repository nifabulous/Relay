/*
 * Fee Calculator — "Where Did My Money Go?"
 *
 * Teaches the OUR / SHA / BEN charge codes and how each intermediary
 * bank in a correspondent chain deducts a "lift fee" from the payment.
 * The flagship interaction is a money-waterfall visualization backed by
 * POST /api/fees/simulate, plus a side-by-side comparison of all three
 * charge codes and two scenario exercises.
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

  // Pre-seeded correspondent banks (the busiest USD intermediaries).
  var SEED_BANKS = [
    { bic: "CITIUS33XXX", name: "Citibank N.A." },
    { bic: "SCBLUS33XXX", name: "Standard Chartered NY" },
    { bic: "IRVTUS3NXXX", name: "BNY Mellon" },
  ];

  function fmt(n, ccy) {
    var v = Number(n);
    if (!isFinite(v)) v = 0;
    var s = v.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    return ccy ? s + " " + ccy : s;
  }

  function symbol(ccy) {
    var map = { USD: "$", EUR: "€", GBP: "£", NGN: "₦", KES: "KSh", JPY: "¥" };
    return map[ccy] || "";
  }

  LearnLabs["fees"] = function (main, helpers) {
    var el = helpers.el;
    var glossify = helpers.glossify;
    var markComplete = helpers.markComplete;
    var getProgress = helpers.getProgress;

    // ── mutable demo state ────────────────────────────────────────────────
    var state = {
      amount: 5000,
      currency: "USD",
      chargeCode: "SHA",
      hops: 2,
      lastResult: null,   // last full API response for the primary calc
      hasResult: false,   // whether a primary result is on screen
    };

    // ── HEADER ────────────────────────────────────────────────────────────
    var header = el("div", "lab-header");
    header.innerHTML =
      '<div class="lab-badge">Go Deeper</div>' +
      "<h1>Fee Calculator: Where Did My Money Go?</h1>" +
      "<p>\u201CI sent $5,000 but my mother only got $4,967. Where\u2019s the rest?\u201D " +
      "That is the number-one cross-border payment complaint. The missing money isn\u2019t " +
      "stolen \u2014 it\u2019s the fee chain. This lab shows you exactly where it goes.";
    main.appendChild(header);

    // ── CONCEPT 1: Three charge codes ─────────────────────────────────────
    var c1 = el("div", "concept");
    c1.innerHTML =
      "<h2>Three charge codes</h2>" +
      "<p>" + glossify(
        "Every cross-border payment carries a charge code that says who pays the fees. " +
        "There are three options, and the choice changes how much the beneficiary receives:"
      ) + "</p>" +
      '<ul style="font-size:0.9375rem;padding-left:1.5rem;margin-top:0.5rem">' +
      "<li><strong>OUR</strong> \u2014 the sender pays <em>all</em> fees. The beneficiary " +
      "receives exactly the amount sent. Used when the amount must land in full (invoices, deposits).</li>" +
      "<li><strong>SHA</strong> (shared) \u2014 the sender pays their own bank\u2019s fee, and each " +
      "intermediary bank deducts its fee from the amount as it passes through. " +
      "The default and most common code.</li>" +
      "<li><strong>BEN</strong> \u2014 the beneficiary pays <em>all</em> fees, including the sender\u2019s. " +
      "The full deduction comes out of the received amount.</li>" +
      "</ul>" +
      '<p class="muted" style="font-size:0.8125rem;margin-top:0.5rem">' +
      "<strong>Key difference:</strong> Under SHA, the sender pays their own bank's outgoing fee separately " +
      "(usually $25\u201350, disclosed upfront), and intermediaries deduct from the amount. " +
      "Under BEN, <em>all</em> fees \u2014 including the sender's bank fee \u2014 are deducted from the amount, " +
      "so the beneficiary receives even less. This simulator models only the intermediary deductions " +
      "to keep the comparison clear; the sender's bank fee is separate in real life." +
      "</p>";
    main.appendChild(c1);

    // ── CONCEPT 2: The fee chain ──────────────────────────────────────────
    var c2 = el("div", "concept");
    c2.innerHTML =
      "<h2>The fee chain</h2>" +
      "<p>" + glossify(
        "A cross-border payment rarely goes straight from sender to beneficiary. It hops through one " +
        "or more intermediary banks \u2014 correspondent banks that each forward the money toward its " +
        "destination. And each hop charges a small \u201Clift fee\u201D for the trouble of moving it."
      ) + "</p>" +
      '<p style="font-size:0.9375rem">' +
      "<strong>More hops = more fees.</strong> A direct payment through one correspondent might cost " +
      "$10\u201315. Route it through three correspondents and you can lose $40+ before it lands. " +
      "The number of hops depends on the currency corridor and which banks hold Nostro accounts with whom." +
      "</p>";
    main.appendChild(c2);

    // ── INTERACTIVE DEMO: Follow the money ────────────────────────────────
    var demo = el("div", "demo");
    demo.innerHTML =
      '<div class="demo-label">Follow the money</div>' +
      '<p class="muted" style="font-size:0.875rem;margin-bottom:0.75rem">' +
      "Set up a payment, then watch each intermediary peel off its fee. " +
      "<em>These are illustrative fees — real lift fees are unpublished and vary by bank relationship.</em>" +
      "</p>" +
      '<div class="callout" style="margin-bottom:0.75rem;padding:0.5rem 0.75rem;font-size:0.8125rem">' +
      "<strong>\u26a0 This lab covers lift fees only.</strong> " +
      "In real cross-border payments, the <strong>FX margin</strong> " +
      "(the difference between the mid-market exchange rate and the rate your bank gives you) " +
      "is usually the <em>larger</em> hidden cost \u2014 often 1\u20134% on exotic corridors. " +
      "The <a href=\"#fx\" style=\"color:var(--accent)\">FX Calculator</a> covers this." +
      "</p>" +

      '<div id="fees-input-grid" style="display:grid;grid-template-columns:1fr 1fr;gap:0.75rem;margin-bottom:0.75rem">' +
        '<div>' +
          '<label class="muted" style="font-size:0.75rem;display:block;margin-bottom:0.25rem">Amount</label>' +
          '<input class="lab-input mono" id="fees-amount" type="number" min="1" step="1" value="5000" />' +
        "</div>" +
        '<div>' +
          '<label class="muted" style="font-size:0.75rem;display:block;margin-bottom:0.25rem">Currency</label>' +
          '<select class="lab-input" id="fees-currency">' +
            ["USD", "EUR", "GBP", "NGN", "KES", "JPY"]
              .map(function (c) {
                return '<option value="' + c + '"' + (c === "USD" ? " selected" : "") + ">" + c + "</option>";
              }).join("") +
          "</select>" +
        "</div>" +
      "</div>" +

      '<div style="margin-bottom:0.75rem">' +
        '<label class="muted" style="font-size:0.75rem;display:block;margin-bottom:0.25rem">Charge code</label>' +
        '<div class="fee-seg-control" id="fees-charge-seg">' +
          ["OUR", "SHA", "BEN"].map(function (cc) {
            return '<button type="button" class="fee-seg-btn' + (cc === "SHA" ? " active" : "") +
              '" data-cc="' + cc + '">' + cc + "</button>";
          }).join("") +
        "</div>" +
      "</div>" +

      '<div style="margin-bottom:0.75rem">' +
        '<label class="muted" style="font-size:0.75rem;display:block;margin-bottom:0.25rem">Intermediaries</label>' +
        '<div class="fee-stepper" id="fees-hops-stepper">' +
          '<button type="button" data-step="-1" aria-label="fewer intermediaries">\u2212</button>' +
          '<span class="fee-stepper-value" id="fees-hops-value">2</span>' +
          '<button type="button" data-step="1" aria-label="more intermediaries">+</button>' +
          '<span class="muted" style="font-size:0.75rem;margin-left:0.5rem">banks in the chain</span>' +
        "</div>" +
      "</div>" +

      '<button class="lab-btn" id="fees-calc">Calculate fees</button>' +
      '<div class="lab-result" id="fees-result"></div>';
    main.appendChild(demo);

    // Cache DOM nodes for the demo.
    var amountInput = demo.querySelector("#fees-amount");
    var currencySelect = demo.querySelector("#fees-currency");
    var segControl = demo.querySelector("#fees-charge-seg");
    var stepper = demo.querySelector("#fees-hops-stepper");
    var hopsValue = demo.querySelector("#fees-hops-value");
    var calcBtn = demo.querySelector("#fees-calc");
    var resultBox = demo.querySelector("#fees-result");

    // ── Comparison panel (rendered after first calc) ──────────────────────
    var compareWrap = el("div");
    compareWrap.style.display = "none";
    compareWrap.innerHTML =
      '<h3 style="font-size:1rem;margin:1.5rem 0 0.5rem">Compare all three charge codes</h3>' +
      '<p class="muted" style="font-size:0.8125rem;margin-bottom:0.5rem">' +
      "Same amount, same intermediaries \u2014 only the charge code changes." +
      "</p>" +
      '<div class="fee-compare" id="fees-compare-grid"></div>';
    main.appendChild(compareWrap);

    // ── helpers: read inputs / fire the API ───────────────────────────────

    function seedFor(n) {
      var out = [];
      for (var i = 0; i < n && i < SEED_BANKS.length; i++) out.push(SEED_BANKS[i]);
      return out;
    }

    function readInputs() {
      var amt = parseFloat(amountInput.value);
      if (!isFinite(amt) || amt <= 0) amt = state.amount;
      state.amount = amt;
      state.currency = currencySelect.value || "USD";
      state.hops = Math.max(1, Math.min(3, state.hops));
      return state;
    }

    function simulate(chargeCodeOverride) {
      var st = readInputs();
      var cc = (chargeCodeOverride || st.chargeCode).toUpperCase();
      var banks = seedFor(st.hops);

      return fetch("/api/fees/simulate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: st.amount,
          currency: st.currency,
          charge_code: cc,
          intermediary_bics: banks.map(function (b) { return b.bic; }),
          intermediary_names: banks.map(function (b) { return b.name; }),
        }),
      }).then(function (r) {
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.json();
      });
    }

    // ── render the money-waterfall ────────────────────────────────────────
    // Returns HTML for the waterfall given an API result. For OUR the bars
    // stay at 100% width (amount_in == amount_out) but the per-hop fee is
    // still shown.
    function waterfallHTML(res) {
      var ccy = res.currency;
      var sent = Number(res.sent_amount);
      var rows = [];
      var isOUR = String(res.charge_code).toUpperCase() === "OUR";

      function pct(amountOut) {
        // width relative to the originally sent amount
        if (!sent || sent <= 0) return 100;
        var p = (Number(amountOut) / sent) * 100;
        if (!isFinite(p)) p = 100;
        return Math.max(0, Math.min(100, p));
      }

      // Top bar: the full sent amount.
      rows.push(
        '<div class="fee-bar-row">' +
          '<div class="fee-bar-label">Sent</div>' +
          '<div class="fee-bar-track"><div class="fee-bar-fill fee-bar-sent" style="width:100%">' +
          esc(fmt(sent, ccy)) + "</div></div>" +
          '<div class="fee-fee-tag">&nbsp;</div>' +
        "</div>"
      );

      // One bar per hop.
      (res.hops || []).forEach(function (h) {
        var w = isOUR ? 100 : pct(h.amount_out);
        var label = (h.bank_name ? esc(h.bank_name) : esc(h.bic));
        var feeTag = '<span style="color:var(--red)">\u2212' + esc(fmt(h.fee, ccy)) + "</span>";
        rows.push(
          '<div class="fee-bar-row">' +
            '<div class="fee-bar-label">' + label + "</div>" +
            '<div class="fee-bar-track"><div class="fee-bar-fill fee-bar-hop" style="width:0%">' +
            esc(fmt(h.amount_out, ccy)) + "</div></div>" +
            '<div class="fee-fee-tag">' + feeTag + "</div>" +
          "</div>"
        );
      });

      // Bottom bar: final received amount.
      var receivedW = isOUR ? 100 : pct(res.received_amount);
      rows.push(
        '<div class="fee-bar-row">' +
          '<div class="fee-bar-label">Received</div>' +
          '<div class="fee-bar-track"><div class="fee-bar-fill fee-bar-received" style="width:0%">' +
          esc(fmt(res.received_amount, ccy)) + "</div></div>" +
          '<div class="fee-fee-tag">&nbsp;</div>' +
        "</div>"
      );

      var html = '<div class="fee-waterfall">' + rows.join("") + "</div>";

      // Animate widths on the next frame so the CSS transition fires.
      requestAnimationFrame(function () {
        var node = document.getElementById("fees-waterfall-host");
        if (!node) return;
        var fills = node.querySelectorAll(".fee-bar-fill");
        // fills order matches rows order: [sent, hop1, hop2, ..., received]
        var widths = [100];
        (res.hops || []).forEach(function (h) {
          widths.push(isOUR ? 100 : pct(h.amount_out));
        });
        widths.push(isOUR ? 100 : pct(res.received_amount));
        for (var i = 0; i < fills.length && i < widths.length; i++) {
          fills[i].style.width = widths[i] + "%";
        }
      });

      return html;
    }

    // ── render the primary result (waterfall + summary) ───────────────────
    function renderResult(res) {
      state.lastResult = res;
      state.hasResult = true;

      var ccy = res.currency;
      var sym = symbol(ccy);
      var pctLost = 0;
      if (res.sent_amount && res.sent_amount > 0) {
        pctLost = (res.total_fees / res.sent_amount) * 100;
      }
      var isOUR = String(res.charge_code).toUpperCase() === "OUR";

      var summary =
        '<div class="fee-summary">' +
          '<div class="fee-summary-item"><span class="fee-summary-label">Sent</span>' +
            '<span class="fee-summary-value">' + esc(fmt(res.sent_amount, ccy)) + "</span></div>" +
          '<div class="fee-summary-item"><span class="fee-summary-label">Received</span>' +
            '<span class="fee-summary-value" style="color:var(--green)">' + esc(fmt(res.received_amount, ccy)) + "</span></div>" +
          '<div class="fee-summary-item"><span class="fee-summary-label">Total fees</span>' +
            '<span class="fee-summary-value" style="color:var(--red)">' + esc(fmt(res.total_fees, ccy)) + "</span></div>" +
          (isOUR
            ? '<div class="fee-summary-item"><span class="fee-summary-label">Sender pays extra</span>' +
              '<span class="fee-summary-value" style="color:var(--red)">' + esc(fmt(res.sender_pays_extra, ccy)) + "</span></div>"
            : "") +
        "</div>";

      var summaryLine =
        '<p style="margin:0.5rem 0 0;font-size:0.875rem">' +
        "<strong>Total fees: " + esc(fmt(res.total_fees, ccy)) + "</strong>" +
        (pctLost > 0 && !isOUR
          ? ' \u00B7 You lost <strong>' + pctLost.toFixed(2) + "%</strong>"
          : "") +
        "</p>";

      var ourCallout = "";
      if (isOUR) {
        ourCallout =
          '<div class="callout" style="margin-top:0.75rem">' +
            '<div class="callout-title">OUR \u2014 sender covers the fees</div>' +
            "With OUR the beneficiary receives the full amount. The bars stay full width because no fee " +
            "is deducted from the payment \u2014 but the sender pays an extra " +
            "<strong>" + esc(fmt(res.sender_pays_extra, ccy)) + "</strong> on top of the amount sent." +
          "</div>";
      }

      resultBox.className = "lab-result show lab-result-success";
      resultBox.innerHTML =
        '<div id="fees-waterfall-host">' + waterfallHTML(res) + "</div>" +
        summary +
        summaryLine +
        ourCallout;

      // Populate the comparison panel (fires three parallel sims).
      loadComparison();
    }

    function showError(msg) {
      resultBox.className = "lab-result show lab-result-error";
      resultBox.innerHTML =
        '<div class="badge badge-red">Couldn\u2019t calculate</div> ' + esc(msg);
    }

    // ── comparison panel (three charge codes side by side) ────────────────
    function loadComparison() {
      compareWrap.style.display = "";
      var grid = compareWrap.querySelector("#fees-compare-grid");
      grid.innerHTML = '<div class="muted" style="padding:0.75rem">Comparing\u2026</div>';

      var codes = ["OUR", "SHA", "BEN"];
      Promise.all(
        codes.map(function (cc) {
          return simulate(cc)
            .then(function (res) { return { ok: true, cc: cc, res: res }; })
            .catch(function () { return { ok: false, cc: cc }; });
        })
      ).then(function (results) {
        var cards = results.map(function (r) {
          if (!r.ok) {
            return '<div class="fee-compare-card"><h4>' + r.cc + "</h4>" +
              '<div class="muted" style="font-size:0.75rem">unavailable</div></div>';
          }
          var isOUR = r.cc === "OUR";
          var isSHA = r.cc === "SHA";
          var badge = isOUR
            ? '<span class="badge badge-green" style="display:inline-block;margin-bottom:0.25rem">Best for beneficiary</span>'
            : isSHA
              ? '<span class="badge badge-amber" style="display:inline-block;margin-bottom:0.25rem">Default — most common</span>'
              : '<span class="badge badge-red" style="display:inline-block;margin-bottom:0.25rem">Beneficiary pays all</span>';
          var feesLine = isOUR
            ? "Fees: " + esc(fmt(r.res.total_fees, r.res.currency)) +
              " (paid by sender)"
            : "Fees: " + esc(fmt(r.res.total_fees, r.res.currency)) +
              " (from amount)";
          return '<div class="fee-compare-card">' +
            "<h4>" + r.cc + "</h4>" +
            badge +
            '<div class="fee-compare-received">' +
              esc(fmt(r.res.received_amount, r.res.currency)) +
            "</div>" +
            '<div class="fee-compare-fees">' + feesLine + "</div>" +
          "</div>";
        }).join("");
        grid.innerHTML = cards;
      });
    }

    // ── wire up the demo controls ─────────────────────────────────────────

    function setActiveCharge(cc) {
      state.chargeCode = cc.toUpperCase();
      segControl.querySelectorAll(".fee-seg-btn").forEach(function (b) {
        b.classList.toggle("active", b.getAttribute("data-cc") === cc);
      });
    }

    segControl.querySelectorAll(".fee-seg-btn").forEach(function (btn) {
      btn.addEventListener("click", function () {
        setActiveCharge(btn.getAttribute("data-cc"));
        // Charge-code toggle auto-recalculates if a result is already shown.
        if (state.hasResult) {
          runCalc();
        }
      });
    });

    stepper.querySelectorAll("button").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var step = parseInt(btn.getAttribute("data-step"), 10) || 0;
        state.hops = Math.max(1, Math.min(3, state.hops + step));
        hopsValue.textContent = String(state.hops);
        // Don't auto-calc; require button click. (Matches spec.)
      });
    });

    function runCalc() {
      calcBtn.disabled = true;
      calcBtn.textContent = "Calculating\u2026";
      simulate()
        .then(function (res) {
          renderResult(res);
        })
        .catch(function (err) {
          showError(
            (err && err.message) ||
            "Couldn\u2019t reach the fee simulator. Is the server running?"
          );
        })
        .then(function () {
          calcBtn.disabled = false;
          calcBtn.textContent = "Calculate fees";
        });
    }

    calcBtn.addEventListener("click", runCalc);
    amountInput.addEventListener("keydown", function (e) {
      if (e.key === "Enter") runCalc();
    });

    // ── CALLOUT: real-world tip ───────────────────────────────────────────
    var callout = el("div", "callout");
    callout.innerHTML =
      '<div class="callout-title">\uD83D\uDCA1 Real-world tip</div>' +
      glossify("SHA is the default and most common charge code. Most consumer-facing apps " +
        "(Wise, Revolut) use SHA but disclose the fees upfront. Traditional banks often " +
        "don\u2019t disclose intermediary fees \u2014 which is exactly why beneficiaries are surprised.");
    main.appendChild(callout);

    // ── EXERCISE 1: Pick the right charge code ────────────────────────────
    function buildChargeQuiz(item, index) {
      var ex = el("div", "exercise");
      ex.innerHTML =
        '<div class="exercise-header">' +
          '<span class="exercise-badge">' + (index + 1) + "</span>" +
          '<span class="exercise-title">Pick the right charge code</span>' +
        "</div>" +
        '<p class="exercise-prompt">' + esc(item.scenario) + "</p>" +
        '<div class="fee-seg-control" data-quiz="' + index + '">' +
          ["OUR", "SHA", "BEN"].map(function (cc) {
            return '<button type="button" class="fee-seg-btn" data-cc="' + cc + '">' + cc + "</button>";
          }).join("") +
        "</div>" +
        '<div class="lab-result"></div>';
      main.appendChild(ex);

      var ctrl = ex.querySelector(".fee-seg-control");
      var result = ex.querySelector(".lab-result");

      ctrl.querySelectorAll(".fee-seg-btn").forEach(function (btn) {
        btn.addEventListener("click", function () {
          var picked = btn.getAttribute("data-cc");
          var correct = picked === item.correct;
          ctrl.querySelectorAll(".fee-seg-btn").forEach(function (b) {
            b.disabled = true;
            if (b.getAttribute("data-cc") === item.correct) b.classList.add("active");
          });
          btn.classList.remove("active");
          if (correct) {
            btn.style.borderColor = "var(--green)";
            btn.style.background = "var(--green-bg)";
            result.className = "lab-result show lab-result-success";
          } else {
            btn.style.borderColor = "var(--red)";
            btn.style.background = "var(--red-bg)";
            result.className = "lab-result show lab-result-error";
          }
          result.innerHTML =
            (correct
              ? '<div class="badge badge-green">Correct \u2014 ' + esc(picked) + "</div> "
              : '<div class="badge badge-red">Not quite.</div> ' +
                "The right answer is <strong>" + esc(item.correct) + "</strong>. ") +
            "<p style=\"margin:0.5rem 0 0\">" + esc(item.explain) + "</p>" +
            '<button class="lab-btn secondary" style="margin-top:0.5rem">Reset</button>';
          result.querySelector("button").addEventListener("click", function () {
            ctrl.querySelectorAll(".fee-seg-btn").forEach(function (b) {
              b.disabled = false;
              b.classList.remove("active");
              b.style.borderColor = "";
              b.style.background = "";
            });
            result.className = "lab-result";
            result.innerHTML = "";
          });
        });
      });
    }

    var chargeQuizItems = [
      {
        scenario:
          "You\u2019re paying a supplier\u2019s invoice of \u20AC10,000. Their contract says they must " +
          "receive exactly \u20AC10,000 \u2014 not a cent less. Which charge code?",
        correct: "OUR",
        explain:
          "OUR makes the sender pay all fees, so the full \u20AC10,000 lands with the supplier. " +
          "It costs you a little more, but it protects the relationship and avoids a short payment.",
      },
      {
        scenario:
          "You\u2019re sending $100 to a friend to split a dinner bill. Neither of you minds " +
          "if a couple of dollars go to fees. Which charge code?",
        correct: "SHA",
        explain:
          "SHA is the default for everyday transfers. Fees are shared along the chain and " +
          "deducted from the amount. For small casual payments it\u2019s the sensible, common choice.",
      },
      {
        scenario:
          "A family member asked you to send them money and said they\u2019ll happily cover any fees " +
          "on their end. Which charge code puts all fees on the beneficiary?",
        correct: "BEN",
        explain:
          "BEN means the beneficiary pays all fees, including the sender\u2019s. The full deduction " +
          "comes out of the received amount \u2014 so they get less, as they agreed.",
      },
    ];
    chargeQuizItems.forEach(buildChargeQuiz);

    // ── EXERCISE 2: Audit the fee complaint ───────────────────────────────
    var ex2 = el("div", "exercise");
    ex2.innerHTML =
      '<div class="exercise-header">' +
        '<span class="exercise-badge">4</span>' +
        '<span class="exercise-title">Audit the fee complaint</span>' +
      "</div>" +
      '<p class="exercise-prompt">' +
        "A customer says: \u201CI sent $5,000 but my mother only got $4,967. Where\u2019s the rest?\u201D " +
        "Using the calculator above with <strong>SHA</strong> and <strong>2 intermediaries</strong>, " +
        "what was the total fee deducted? (Enter the dollar amount.)" +
      "</p>" +
      '<input class="lab-input mono" id="fees-audit-input" type="number" min="0" step="0.01" placeholder="e.g. 33" />' +
      '<div style="margin-top:0.75rem" id="fees-audit-btnrow">' +
        '<button class="lab-btn" id="fees-audit-check">Check answer</button>' +
      "</div>" +
      '<div class="exercise-hint" id="fees-audit-hint">' +
        "Set the calculator to $5,000 USD, SHA, 2 intermediaries and click Calculate fees. " +
        "The \u201CTotal fees\u201D figure is your answer." +
      "</div>" +
      '<div class="lab-result" id="fees-audit-result"></div>';
    main.appendChild(ex2);

    var auditInput = ex2.querySelector("#fees-audit-input");
    var auditBtn = ex2.querySelector("#fees-audit-check");
    var auditResult = ex2.querySelector("#fees-audit-result");
    var auditHint = ex2.querySelector("#fees-audit-hint");

    auditBtn.addEventListener("click", function () {
      var guess = parseFloat(auditInput.value);
      if (!isFinite(guess)) {
        auditResult.className = "lab-result show lab-result-error";
        auditResult.innerHTML = "Enter a dollar amount first.";
        return;
      }
      // Resolve the canonical answer from the API (SHA, 2 hops, 5000 USD).
      auditBtn.disabled = true;
      auditBtn.textContent = "Checking\u2026";
      fetch("/api/fees/simulate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: 5000,
          currency: "USD",
          charge_code: "SHA",
          intermediary_bics: [SEED_BANKS[0].bic, SEED_BANKS[1].bic],
          intermediary_names: [SEED_BANKS[0].name, SEED_BANKS[1].name],
        }),
      })
        .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
        .then(function (res) {
          var answer = Number(res.total_fees) || 0;
          // Accept within $0.50 of the canonical total.
          var ok = Math.abs(guess - answer) <= 0.5;
          auditResult.className = "lab-result show " + (ok ? "lab-result-success" : "lab-result-error");
          if (ok) {
            auditResult.innerHTML =
              '<div class="badge badge-green">Correct!</div> ' +
              "The two intermediaries peeled off " +
              "<strong>" + esc(fmt(answer, "USD")) + "</strong> in lift fees " +
              "(" + esc(fmt(res.hops[0].fee, "USD")) + " at " + esc(res.hops[0].bank_name) + ", " +
              esc(fmt(res.hops[1].fee, "USD")) + " at " + esc(res.hops[1].bank_name) + "). " +
              "That\u2019s exactly the missing $33 \u2014 the money wasn\u2019t stolen, it was the fee chain.";
            auditInput.disabled = true;
            auditBtn.textContent = "Solved \u2713";
          } else {
            auditResult.innerHTML =
              '<div class="badge badge-red">Not quite.</div> ' +
              "Your answer was <strong>" + esc(fmt(guess, "USD")) + "</strong>. " +
              "Try running the calculator with SHA + 2 intermediaries and read the Total fees figure, " +
              "or peek at the hint.";
            auditBtn.disabled = false;
            auditBtn.textContent = "Check answer";
          }
        })
        .catch(function () {
          auditResult.className = "lab-result show lab-result-error";
          auditResult.innerHTML =
            "Couldn\u2019t reach the fee simulator to verify \u2014 check the server and try again.";
          auditBtn.disabled = false;
          auditBtn.textContent = "Check answer";
        });
    });

    // Small "show hint" affordance for exercise 2.
    (function () {
      var btnRow = ex2.querySelector("#fees-audit-btnrow");
      if (!btnRow) return;
      var hintBtn = el("button", "lab-btn secondary");
      hintBtn.textContent = "Show hint";
      hintBtn.style.marginLeft = "0.5rem";
      btnRow.appendChild(hintBtn);
      hintBtn.addEventListener("click", function () {
        auditHint.classList.add("show");
        hintBtn.disabled = true;
        hintBtn.textContent = "Hint shown";
      });
    })();

    // ── COMPLETE BUTTON ───────────────────────────────────────────────────
    var alreadyDone = getProgress().indexOf("fees") !== -1;

    var completeWrap = el("div");
    completeWrap.style.marginTop = "2rem";
    var completeBtn = el("button", "lab-btn", alreadyDone ? "Mark as complete \u2713" : "Mark lab complete");
    if (alreadyDone) completeBtn.disabled = true;
    completeWrap.appendChild(completeBtn);

    var completeMsg = el("div", "lab-result");
    completeWrap.appendChild(completeMsg);
    main.appendChild(completeWrap);

    if (alreadyDone) {
      completeMsg.className = "lab-result show lab-result-success";
      completeMsg.innerHTML =
        '<div class="badge badge-green">Completed</div> You\u2019ve finished this lab. ' +
        "You now know where cross-border fees go \u2014 and why the beneficiary so often gets less.";
    }

    completeBtn.addEventListener("click", function () {
      markComplete("fees");
      completeBtn.disabled = true;
      completeBtn.textContent = "Mark as complete \u2713";
      completeMsg.className = "lab-result show lab-result-success";
      completeMsg.innerHTML =
        '<div class="badge badge-green">Lab complete!</div> You can now read a fee chain, ' +
        "pick the right charge code, and explain the \u201Cmissing money\u201D to anyone.";
    });

    // ── LAB NAVIGATION ────────────────────────────────────────────────────
    var nav = el("div", "lab-nav");
    var back = el("a", "", "\u2190 Back to labs");
    back.href = "#";
    var next = el("a", "", "FX Calculator \u2192");
    next.href = "#fx";
    nav.appendChild(back);
    nav.appendChild(next);
    main.appendChild(nav);
  };
})();
