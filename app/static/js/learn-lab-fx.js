/*
 * FX Calculator — "The Other Hidden Cost"
 *
 * The Fee Calculator showed lift fees. This lab shows the other, usually
 * LARGER, hidden cost of a cross-border payment: the FX margin baked into
 * the exchange rate your bank gives you. "Zero fees" is a marketing claim,
 * not a price — the price is in the rate.
 *
 * This module is pure frontend: no API calls. All math is client-side against
 * an embedded USD-anchored illustrative rate table, so the slider stays
 * instant and the exercises are reproducible.
 *
 * Loaded after glossary.js + visualizers.js, before learn.js.
 */
window.LearnLabs = window.LearnLabs || {};

(function () {
  "use strict";

  var esc = LearnUtils.esc;

  // USD-anchored, mid-2026 illustrative. Cross rate From->To = RATES[To]/RATES[From].
  var RATES = {
    USD: 1.0000, EUR: 0.8760, GBP: 0.7490, JPY: 148.00,
    AUD: 1.4440, CAD: 1.3900, AED: 3.6725, NGN: 1547.00,
    KES: 129.00, INR: 95.39
  };
  var CURRENCY_NAMES = {
    USD: "US Dollar", EUR: "Euro", GBP: "British Pound", JPY: "Japanese Yen",
    AUD: "Australian Dollar", CAD: "Canadian Dollar", AED: "UAE Dirham",
    NGN: "Nigerian Naira", KES: "Kenyan Shilling", INR: "Indian Rupee"
  };

  // ── formatting helpers ─────────────────────────────────────────────────
  function decimals(ccy) { return ccy === "JPY" ? 0 : 2; }

  function fmt(n, dp) {
    var v = Number(n);
    if (!isFinite(v)) v = 0;
    return v.toLocaleString("en-US", {
      minimumFractionDigits: dp,
      maximumFractionDigits: dp
    });
  }

  function symbol(ccy) {
    var m = {
      USD: "$", EUR: "\u20AC", GBP: "\u00A3", NGN: "\u20A6", KES: "KSh ",
      JPY: "\u00A5", AUD: "A$", CAD: "C$", AED: "AED ", INR: "\u20B9"
    };
    return m[ccy] || "";
  }

  function money(n, ccy) {
    return symbol(ccy) + fmt(n, decimals(ccy));
  }

  LearnLabs["fx"] = function (main, helpers) {
    var el = helpers.el;
    var glossify = helpers.glossify;
    var markComplete = helpers.markComplete;
    var getProgress = helpers.getProgress;

    // ── mutable demo state ────────────────────────────────────────────────
    var state = {
      amount: 10000,
      from: "USD",
      to: "EUR",
      spread: 2.5 // percent
    };

    // ── HEADER ────────────────────────────────────────────────────────────
    var header = el("div", "lab-header");
    header.innerHTML =
      '<div class="lab-badge">Go Deeper</div>' +
      "<h1>FX Calculator: The Other Hidden Cost</h1>" +
      "<p>\u201CZero fees\u201D doesn\u2019t mean free. The exchange rate your bank gives you " +
      "\u2014 not the fee \u2014 is usually the bigger cost.</p>";
    main.appendChild(header);

    // ── "TWO COSTS" BRIDGE CALLOUT ─────────────────────────────────────────
    var bridge = el("div", "callout");
    bridge.innerHTML =
      '<div class="callout-title">Two costs, one transfer</div>' +
      '<div class="two-cost-row" style="display:flex;flex-wrap:wrap;align-items:center;gap:0.5rem;margin:0.5rem 0">' +
        '<span class="two-cost-pill" style="border:1px solid var(--amber);background:var(--amber-bg);color:var(--amber);padding:0.25rem 0.625rem;border-radius:999px;font-size:0.8125rem;font-weight:600">' +
          "Cost #1: Lift fees</span>" +
        '<span style="color:var(--ink-3);font-weight:700">+</span>' +
        '<span class="two-cost-pill" style="border:1px solid var(--red);background:var(--red-bg);color:var(--red);padding:0.25rem 0.625rem;border-radius:999px;font-size:0.8125rem;font-weight:600">' +
          "Cost #2: FX margin</span>" +
        '<span style="color:var(--ink-3);font-weight:700">=</span>' +
        '<span class="two-cost-pill" style="border:1px solid var(--accent);background:var(--accent-surface);color:var(--accent);padding:0.25rem 0.625rem;border-radius:999px;font-size:0.8125rem;font-weight:600">' +
          "What you really lose</span>" +
      "</div>" +
      '<p style="margin:0.5rem 0 0;font-size:0.9375rem">' +
        "The " +
        '<a href="#fees" style="color:var(--accent);font-weight:600">Fee Calculator</a> ' +
        "showed you lift fees. This module shows you the FX margin \u2014 usually the <strong>BIGGER</strong> cost. " +
        "Together, they\u2019re your total cost." +
      "</p>" +
      '<p style="margin-top:0.5rem"><a href="#fees" style="font-size:0.875rem;color:var(--ink-2)">' +
      "\u2190 Fee Calculator</a></p>";
    main.appendChild(bridge);

    // ── CONCEPT 1: Two rates, one gap ──────────────────────────────────────
    var c1 = el("div", "concept");
    c1.innerHTML =
      "<h2>Two rates, one gap</h2>" +
      "<p>" + glossify(
        "Every currency has a mid-market rate \u2014 the fair, wholesale price banks trade at with each other. " +
        "It\u2019s the number you see on Google or a Bloomberg terminal. Your bank doesn\u2019t give you that rate. " +
        "It gives you a slightly worse one, and keeps the difference as an FX margin."
      ) + "</p>" +
      '<ul style="font-size:0.9375rem;padding-left:1.5rem;margin-top:0.5rem">' +
        "<li><strong>Mid-market rate</strong> \u2014 the fair rate. What the currency is actually worth between banks.</li>" +
        "<li><strong>Spread / markup</strong> \u2014 the bank\u2019s profit, hidden <em>inside</em> the rate it quotes you. " +
        "Typically 0.3\u20131% on major pairs (USD/EUR/GBP), 1\u20133% on second-tier currencies, and 3\u20135%+ on exotics " +
        "like the Naira or Shilling.</li>" +
        "<li><strong>No fee \u2260 no cost.</strong> A bank can quote \u201Czero fees\u201D and still cost you more than a " +
        "competitor that charges a fee \u2014 because the competitor\u2019s rate is closer to mid-market.</li>" +
      "</ul>" +
      '<p class="muted" style="font-size:0.8125rem;margin-top:0.5rem">' +
        "The markup is rarely disclosed. Banks advertise \u201C0% fee\u201D because the rate is where they actually get paid. " +
        "To know your true cost, you must compare the rate you\u2019re quoted against the mid-market rate \u2014 which is " +
        "exactly what the calculator below does." +
      "</p>";
    main.appendChild(c1);

    // ── CONCEPT 2: Who converts? ───────────────────────────────────────────
    var c2 = el("div", "concept");
    c2.innerHTML =
      "<h2>Who converts?</h2>" +
      "<p>" + glossify(
        "If sender and beneficiary use different currencies, someone has to do the FX conversion. " +
        "There are three common places that happens \u2014 and the <em>where</em> drives how visible the margin is:"
      ) + "</p>" +
      '<ul style="font-size:0.9375rem;padding-left:1.5rem;margin-top:0.5rem">' +
        "<li><strong>Sender\u2019s bank converts</strong> \u2014 the payment arrives in the beneficiary\u2019s currency. " +
        "Most transparent: the sender sees the rate before sending. How Wise, Revolut, and most modern apps work.</li>" +
        "<li><strong>Intermediary converts</strong> \u2014 a " +
        '<span class="gloss-term-span">correspondent bank</span> ' +
        "in the chain does the FX. Most opaque: this is traditional SWIFT, where the rate is set silently mid-hop " +
        "and neither sender nor beneficiary was shown it. Usually the most expensive.</li>" +
        "<li><strong>Beneficiary bank converts</strong> \u2014 the payment travels in USD (or EUR) and the receiving " +
        "bank converts to local currency on arrival. Common for USD\u2192local corridors (USD\u2192NGN, USD\u2192KES). " +
        "The beneficiary bears the margin.</li>" +
      "</ul>" +
      '<p class="muted" style="font-size:0.8125rem;margin-top:0.5rem">' +
        "Whoever does the conversion sets the rate \u2014 and earns the margin. The further the conversion point sits " +
        "from the person who cares about the cost, the worse the rate tends to be." +
      "</p>";
    main.appendChild(c2);

    // ── INTERACTIVE DEMO: Follow the exchange ──────────────────────────────
    var demo = el("div", "demo");
    demo.innerHTML =
      '<div class="demo-label">Follow the exchange</div>' +
      '<p class="muted" style="font-size:0.875rem;margin-bottom:0.75rem">' +
        "Drag the spread slider and watch the gap open between the fair rate and the rate your bank actually gives. " +
        "<em>Rates are illustrative (mid-2026) \u2014 the point is the size of the gap, not the exact cents.</em>" +
      "</p>" +

      '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:0.75rem;margin-bottom:0.75rem">' +
        "<div>" +
          '<label class="muted" style="font-size:0.75rem;display:block;margin-bottom:0.25rem">Amount</label>' +
          '<input class="lab-input mono" id="fx-amount" type="number" min="1" step="1" value="10000" />' +
        "</div>" +
        "<div>" +
          '<label class="muted" style="font-size:0.75rem;display:block;margin-bottom:0.25rem">From</label>' +
          '<select class="lab-input" id="fx-from">' +
            ["USD", "EUR", "GBP", "NGN", "KES", "JPY"]
              .map(function (c) {
                return '<option value="' + c + '"' + (c === "USD" ? " selected" : "") + ">" +
                  c + " \u2014 " + esc(CURRENCY_NAMES[c]) + "</option>";
              }).join("") +
          "</select>" +
        "</div>" +
        "<div>" +
          '<label class="muted" style="font-size:0.75rem;display:block;margin-bottom:0.25rem">To</label>' +
          '<select class="lab-input" id="fx-to">' +
            ["USD", "EUR", "GBP", "NGN", "KES", "JPY"]
              .map(function (c) {
                return '<option value="' + c + '"' + (c === "EUR" ? " selected" : "") + ">" +
                  c + " \u2014 " + esc(CURRENCY_NAMES[c]) + "</option>";
              }).join("") +
          "</select>" +
        "</div>" +
      "</div>" +

      '<div style="margin-bottom:0.5rem">' +
        '<label class="muted" style="font-size:0.75rem;display:flex;justify-content:space-between;margin-bottom:0.25rem">' +
          "<span>Bank\u2019s spread (FX margin)</span>" +
          '<span class="mono" id="fx-spread-value" style="color:var(--red);font-weight:700">2.5%</span>' +
        "</label>" +
        '<input class="fx-slider" id="fx-spread" type="range" min="0" max="5" step="0.1" value="2.5" ' +
        'style="width:100%;accent-color:var(--accent)" />' +
      "</div>" +

      '<div class="fee-seg-control" id="fx-presets" style="margin-bottom:0.75rem">' +
        '<button type="button" class="fee-seg-btn" data-spread="0.5">Major pairs (0.5%)</button>' +
        '<button type="button" class="fee-seg-btn active" data-spread="2.5">Exotic (2.5%)</button>' +
        '<button type="button" class="fee-seg-btn" data-spread="4.0">Naira (4.0%)</button>' +
      "</div>" +

      '<div id="fx-same-note" class="muted" style="display:none;font-size:0.875rem;padding:0.75rem;background:var(--surface-2);border-radius:var(--radius)">' +
        "Pick two different currencies to see the exchange." +
      "</div>" +

      '<div id="fx-display" style="margin-top:0.5rem">' +
        '<div class="fee-waterfall">' +
          '<div class="fee-bar-row">' +
            '<div class="fee-bar-label">Mid-market</div>' +
            '<div class="fee-bar-track"><div class="fee-bar-fill fee-bar-sent fx-bar-mid" style="width:100%"></div></div>' +
            '<div class="fee-fee-tag" style="color:var(--ink-3)">fair</div>' +
          "</div>" +
          '<div class="fee-bar-row">' +
            '<div class="fee-bar-label">Bank rate</div>' +
            '<div class="fee-bar-track"><div class="fee-bar-fill fee-bar-hop fx-bar-bank" style="width:0%"></div></div>' +
            '<div class="fee-fee-tag fx-bar-gap"></div>' +
          "</div>" +
        "</div>" +

        '<div class="fee-summary" style="margin-top:0.75rem">' +
          '<div class="fee-summary-item"><span class="fee-summary-label">You send</span>' +
            '<span class="fee-summary-value" id="fx-sum-send"></span></div>' +
          '<div class="fee-summary-item"><span class="fee-summary-label">Mid-market</span>' +
            '<span class="fee-summary-value" id="fx-sum-mid" style="color:var(--accent)"></span></div>' +
          '<div class="fee-summary-item"><span class="fee-summary-label">You receive</span>' +
            '<span class="fee-summary-value" id="fx-sum-recv" style="color:var(--green)"></span></div>' +
          '<div class="fee-summary-item"><span class="fee-summary-label">FX margin</span>' +
            '<span class="fee-summary-value" id="fx-sum-margin" style="color:var(--red)"></span></div>' +
        "</div>" +

        '<p class="muted" style="font-size:0.8125rem;margin:0.5rem 0 0" id="fx-explain"></p>' +
      "</div>";
    main.appendChild(demo);

    // Cache demo DOM.
    var amountInput = demo.querySelector("#fx-amount");
    var fromSelect = demo.querySelector("#fx-from");
    var toSelect = demo.querySelector("#fx-to");
    var slider = demo.querySelector("#fx-spread");
    var sliderValue = demo.querySelector("#fx-spread-value");
    var presetControl = demo.querySelector("#fx-presets");
    var sameNote = demo.querySelector("#fx-same-note");
    var display = demo.querySelector("#fx-display");
    var midFill = demo.querySelector(".fx-bar-mid");
    var bankFill = demo.querySelector(".fx-bar-bank");
    var gapTag = demo.querySelector(".fx-bar-gap");
    var sumSend = demo.querySelector("#fx-sum-send");
    var sumMid = demo.querySelector("#fx-sum-mid");
    var sumRecv = demo.querySelector("#fx-sum-recv");
    var sumMargin = demo.querySelector("#fx-sum-margin");
    var explain = demo.querySelector("#fx-explain");

    // ── live recompute ────────────────────────────────────────────────────
    function recompute() {
      var amt = parseFloat(amountInput.value);
      if (!isFinite(amt) || amt <= 0) amt = 0;
      state.amount = amt;
      state.from = fromSelect.value || "USD";
      state.to = toSelect.value || "EUR";
      state.spread = parseFloat(slider.value);
      if (!isFinite(state.spread)) state.spread = 0;

      sliderValue.textContent = state.spread.toFixed(1) + "%";

      // Same-currency guard.
      if (state.from === state.to) {
        sameNote.style.display = "";
        display.style.display = "none";
        return;
      }
      sameNote.style.display = "none";
      display.style.display = "";

      var midRate = RATES[state.to] / RATES[state.from];
      var customerRate = midRate * (1 - state.spread / 100);
      var midAmount = amt * midRate;
      var customerAmount = amt * customerRate;
      var fxCost = midAmount - customerAmount;
      var fxCostPct = midAmount > 0 ? (fxCost / midAmount) * 100 : 0;

      // Bank bar width = customer_rate / mid_rate (cap to 100).
      var bankPct = midRate > 0 ? (customerRate / midRate) * 100 : 0;
      if (!isFinite(bankPct)) bankPct = 0;
      bankPct = Math.max(0, Math.min(100, bankPct));

      midFill.style.width = "100%";
      midFill.textContent = money(midAmount, state.to);
      bankFill.style.width = bankPct + "%";
      bankFill.textContent = money(customerAmount, state.to);
      gapTag.textContent = "\u2212" + money(fxCost, state.to);

      sumSend.textContent = money(amt, state.from);
      sumMid.textContent = money(midAmount, state.to);
      sumRecv.textContent = money(customerAmount, state.to);
      sumMargin.textContent = "\u2212" + money(fxCost, state.to);

      explain.innerHTML =
        "The bank quotes you " +
        '<span class="mono">' + esc(customerRate.toFixed(4)) + "</span> " +
        esc(state.from) + "\u2192" + esc(state.to) +
        " against a mid-market rate of " +
        '<span class="mono">' + esc(midRate.toFixed(4)) + "</span>. " +
        "That " + esc(state.spread.toFixed(1)) + "% margin costs you " +
        "<strong style=\"color:var(--red)\">" + esc(money(fxCost, state.to)) + "</strong>" +
        (fxCostPct > 0 ? " (" + esc(fxCostPct.toFixed(2)) + "% of what you should have received)." : ".");
    }

    // ── wire controls: everything updates live ────────────────────────────
    amountInput.addEventListener("input", recompute);
    fromSelect.addEventListener("change", recompute);
    toSelect.addEventListener("change", recompute);
    slider.addEventListener("input", function () {
      // Moving the slider clears the active preset highlight.
      presetControl.querySelectorAll(".fee-seg-btn").forEach(function (b) {
        b.classList.remove("active");
      });
      recompute();
    });

    function setActivePreset(spreadVal) {
      presetControl.querySelectorAll(".fee-seg-btn").forEach(function (b) {
        b.classList.toggle("active", parseFloat(b.getAttribute("data-spread")) === spreadVal);
      });
    }

    presetControl.querySelectorAll(".fee-seg-btn").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var v = parseFloat(btn.getAttribute("data-spread"));
        slider.value = String(v);
        setActivePreset(v);
        recompute();
      });
    });

    // Initial paint (deferred so CSS transitions don't animate from 0 on load).
    recompute();

    // ── CALLOUT: the thesis ────────────────────────────────────────────────
    var thesis = el("div", "callout");
    thesis.innerHTML =
      '<div class="callout-title">\uD83D\uDCA1 The thesis</div>' +
      "<strong>\u201CZero fees\u201D is a marketing claim, not a price.</strong> " +
      "The price is in the rate. Always compare the rate you\u2019re quoted to the mid-market rate \u2014 " +
      "the difference is the real cost, and it\u2019s almost always bigger than any headline fee.";
    main.appendChild(thesis);

    // ── EXERCISE 1: Find the "free" transfer's real cost ───────────────────
    var ex1 = el("div", "exercise");
    ex1.innerHTML =
      '<div class="exercise-header">' +
        '<span class="exercise-badge">1</span>' +
        '<span class="exercise-title">Find the \u201Cfree\u201D transfer\u2019s real cost</span>' +
      "</div>" +
      '<p class="exercise-prompt">' +
        "Bank A advertises: <strong>\u201CSend $10,000 to EUR. Zero fees.\u201D</strong> " +
        "Their rate: <span class=\"mono\">0.8541</span>. Mid-market: <span class=\"mono\">0.8760</span>. " +
        "How many EUR does this \u201Cfree\u201D transfer cost the recipient versus mid-market? " +
        "(Enter the EUR lost.)" +
      "</p>" +
      '<input class="lab-input mono" id="fx-ex1-input" type="number" min="0" step="0.01" placeholder="e.g. 219" />' +
      '<div style="margin-top:0.75rem" id="fx-ex1-btnrow">' +
        '<button class="lab-btn" id="fx-ex1-check">Check answer</button>' +
      "</div>" +
      '<div class="exercise-hint" id="fx-ex1-hint">' +
        "Mid-market would deliver 0.8760 \u00D7 10,000 = \u20AC8,760. Bank A delivers 0.8541 \u00D7 10,000 = \u20AC8,541. " +
        "The difference is your answer." +
      "</div>" +
      '<div class="lab-result" id="fx-ex1-result"></div>';
    main.appendChild(ex1);

    var ex1Input = ex1.querySelector("#fx-ex1-input");
    var ex1Btn = ex1.querySelector("#fx-ex1-check");
    var ex1Result = ex1.querySelector("#fx-ex1-result");
    var ex1Hint = ex1.querySelector("#fx-ex1-hint");

    // Canonical answer: (0.8760 - 0.8541) * 10000 = 219 EUR.
    var ex1Answer = (0.8760 - 0.8541) * 10000;

    ex1Btn.addEventListener("click", function () {
      var guess = parseFloat(ex1Input.value);
      if (!isFinite(guess)) {
        ex1Result.className = "lab-result show lab-result-error";
        ex1Result.innerHTML = "Enter a euro amount first.";
        return;
      }
      var ok = Math.abs(guess - ex1Answer) <= 2;
      ex1Result.className = "lab-result show " + (ok ? "lab-result-success" : "lab-result-error");
      if (ok) {
        ex1Result.innerHTML =
          '<div class="badge badge-green">Correct!</div> ' +
          "Mid-market would have delivered <strong>" + esc(money(8760, "EUR")) + "</strong>, " +
          "but Bank A\u2019s \u201Czero fee\u201D rate delivered only <strong>" + esc(money(8541, "EUR")) + "</strong>. " +
          "That\u2019s <strong>" + esc(money(ex1Answer, "EUR")) + "</strong> gone \u2014 a 2.5% margin \u2014 with no fee ever disclosed. " +
          "<em>Free</em> wasn\u2019t free.";
        ex1Input.disabled = true;
        ex1Btn.disabled = true;
        ex1Btn.textContent = "Solved \u2713";
      } else {
        ex1Result.innerHTML =
          '<div class="badge badge-red">Not quite.</div> ' +
          "Your answer was <strong>" + esc(fmt(guess, 2)) + "</strong>. " +
          "Hint: it\u2019s the difference between what mid-market delivers and what Bank A delivers.";
        ex1Hint.classList.add("show");
      }
    });

    ex1Input.addEventListener("keydown", function (e) {
      if (e.key === "Enter") ex1Btn.click();
    });

    // "Show hint" affordance for exercise 1.
    (function () {
      var btnRow = ex1.querySelector("#fx-ex1-btnrow");
      if (!btnRow) return;
      var hintBtn = el("button", "lab-btn secondary");
      hintBtn.textContent = "Show hint";
      hintBtn.style.marginLeft = "0.5rem";
      btnRow.appendChild(hintBtn);
      hintBtn.addEventListener("click", function () {
        ex1Hint.classList.add("show");
        hintBtn.disabled = true;
        hintBtn.textContent = "Hint shown";
      });
    })();

    // ── EXERCISE 2: Spot the better deal ───────────────────────────────────
    var ex2 = el("div", "exercise");
    ex2.innerHTML =
      '<div class="exercise-header">' +
        '<span class="exercise-badge">2</span>' +
        '<span class="exercise-title">Spot the better deal</span>' +
      "</div>" +
      '<p class="exercise-prompt">' +
        "You\u2019re sending <strong>$10,000 to EUR</strong>. Two providers:" +
      "</p>" +
      '<ul style="font-size:0.9375rem;padding-left:1.5rem;margin:0.25rem 0 0.75rem">' +
        "<li><strong>Provider A:</strong> 0% fee, rate <span class=\"mono\">0.8541</span></li>" +
        "<li><strong>Provider B:</strong> $30 fee, rate <span class=\"mono\">0.8750</span></li>" +
      "</ul>" +
      '<p class="exercise-prompt" style="margin-bottom:0.5rem">Which delivers more EUR to the recipient?</p>' +
      '<div class="fee-seg-control" id="fx-ex2-control">' +
        '<button type="button" class="fee-seg-btn" data-pick="A">A</button>' +
        '<button type="button" class="fee-seg-btn" data-pick="B">B</button>' +
        '<button type="button" class="fee-seg-btn" data-pick="Same">Same</button>' +
      "</div>" +
      '<div class="lab-result" id="fx-ex2-result"></div>';
    main.appendChild(ex2);

    var ex2Control = ex2.querySelector("#fx-ex2-control");
    var ex2Result = ex2.querySelector("#fx-ex2-result");

    // A: 10000 * 0.8541 = 8541 EUR.  B: 10000 * 0.8750 - 30/0.876 ~= 8716 EUR.  Correct: B.
    var providerA = 10000 * 0.8541;            // 8541
    var providerB = 10000 * 0.8750 - 30 / 0.876; // ~8715.75

    ex2Control.querySelectorAll(".fee-seg-btn").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var pick = btn.getAttribute("data-pick");
        var correct = pick === "B";
        ex2Control.querySelectorAll(".fee-seg-btn").forEach(function (b) {
          b.disabled = true;
          if (b.getAttribute("data-pick") === "B") b.classList.add("active");
        });
        if (correct) {
          btn.style.borderColor = "var(--green)";
          btn.style.background = "var(--green-bg)";
          ex2Result.className = "lab-result show lab-result-success";
          ex2Result.innerHTML =
            '<div class="badge badge-green">Correct \u2014 B wins.</div> ' +
            "<p style=\"margin:0.5rem 0 0\">" +
            "Provider B delivers <strong>" + esc(money(providerB, "EUR")) + "</strong> " +
            "(10,000 \u00D7 0.8750, minus the $30 fee in EUR terms), versus Provider A\u2019s " +
            "<strong>" + esc(money(providerA, "EUR")) + "</strong>. " +
            "B beats A by about <strong>" + esc(money(providerB - providerA, "EUR")) + "</strong> " +
            "\u2014 despite charging a fee \u2014 because A\u2019s 0% fee hides a 2.5% margin costing \u20AC219." +
            "</p>";
        } else {
          btn.style.borderColor = "var(--red)";
          btn.style.background = "var(--red-bg)";
          ex2Result.className = "lab-result show lab-result-error";
          ex2Result.innerHTML =
            '<div class="badge badge-red">Not quite.</div> ' +
            "<p style=\"margin:0.5rem 0 0\">" +
            "A\u2019s 0% fee hides a 2.5% margin costing \u20AC219 (only " +
            "<strong>" + esc(money(providerA, "EUR")) + "</strong> lands). " +
            "B\u2019s $30 fee is dwarfed by its near-mid rate \u2014 it delivers " +
            "<strong>" + esc(money(providerB, "EUR")) + "</strong>. " +
            "The right answer is <strong>B</strong>." +
            "</p>" +
            '<button class="lab-btn secondary" style="margin-top:0.5rem">Reset</button>';
          ex2Result.querySelector("button").addEventListener("click", function () {
            ex2Control.querySelectorAll(".fee-seg-btn").forEach(function (b) {
              b.disabled = false;
              b.classList.remove("active");
              b.style.borderColor = "";
              b.style.background = "";
            });
            ex2Result.className = "lab-result";
            ex2Result.innerHTML = "";
          });
        }
      });
    });

    // ── FINAL BRIDGE: total cost callout ───────────────────────────────────
    var total = el("div", "callout");
    total.innerHTML =
      '<div class="callout-title">Total cost: fees + FX</div>' +
      '<p style="margin:0">' +
        "Add the two costs together and the \u201Cfree\u201D transfer isn\u2019t cheap at all. " +
        "On a representative $10,000 cross-border transfer:" +
      "</p>" +
      '<div class="two-cost-row" style="display:flex;flex-wrap:wrap;align-items:center;gap:0.5rem;margin:0.75rem 0">' +
        '<span class="two-cost-pill" style="border:1px solid var(--amber);background:var(--amber-bg);color:var(--amber);padding:0.25rem 0.625rem;border-radius:999px;font-size:0.8125rem;font-weight:600">' +
          "Lift fees ~$33</span>" +
        '<span style="color:var(--ink-3);font-weight:700">+</span>' +
        '<span class="two-cost-pill" style="border:1px solid var(--red);background:var(--red-bg);color:var(--red);padding:0.25rem 0.625rem;border-radius:999px;font-size:0.8125rem;font-weight:600">' +
          "FX margin ~$219</span>" +
        '<span style="color:var(--ink-3);font-weight:700">=</span>' +
        '<span class="two-cost-pill" style="border:1px solid var(--accent);background:var(--accent-surface);color:var(--accent);padding:0.25rem 0.625rem;border-radius:999px;font-size:0.875rem;font-weight:700">' +
          "$252 total cost</span>" +
      "</div>" +
      '<p style="margin:0;font-size:0.9375rem">' +
        "Of a $10,000 transfer, roughly <strong>$252</strong> \u2014 about 2.5% \u2014 never reaches the beneficiary. " +
        "And on most corridors, the FX margin is the bigger half. That\u2019s why reading the rate matters more than " +
        "reading the fee." +
      "</p>" +
      '<p style="margin-top:0.5rem"><a href="#fees" style="font-size:0.875rem;color:var(--ink-2)">' +
      "\u2190 Revisit the Fee Calculator</a></p>";
    main.appendChild(total);

    // ── COMPLETE BUTTON ───────────────────────────────────────────────────
    var alreadyDone = getProgress().indexOf("fx") !== -1;

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
        "You now know that the exchange rate \u2014 not the fee \u2014 is usually the bigger cost.";
    }

    completeBtn.addEventListener("click", function () {
      markComplete("fx");
      completeBtn.disabled = true;
      completeBtn.textContent = "Mark as complete \u2713";
      completeMsg.className = "lab-result show lab-result-success";
      completeMsg.innerHTML =
        '<div class="badge badge-green">Lab complete!</div> You can now read an exchange rate, ' +
        "spot a hidden FX margin, and call \u201Czero fees\u201D what it really is.";
    });

    // ── LAB NAVIGATION ────────────────────────────────────────────────────
    var nav = el("div", "lab-nav");
    var backToLabs = el("a", "", "Back to labs");
    backToLabs.href = "#";
    var toFees = el("a", "", "\u2190 Fee Calculator");
    toFees.href = "#fees";
    nav.appendChild(toFees);
    nav.appendChild(backToLabs);
    main.appendChild(nav);
  };
})();
