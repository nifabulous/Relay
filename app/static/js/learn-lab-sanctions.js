/*
 * Sanctions Screening — "Why Payments Get Stopped"
 *
 * Teaches that EVERY bank in the correspondent chain screens payment parties
 * against watchlists, and that a hit doesn't always mean a blocked payment —
 * most are false positives held for review. The flagship interaction is a
 * checkpoint chain visualization backed by POST /api/screen, plus a
 * "find a name that gets BLOCKED" exercise and a REVIEW-handling quiz.
 *
 * NOT REAL SCREENING. The backend uses a synthetic, fictional watchlist.
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

  // A small fixed correspondent chain so the demo always shows "every hop
  // re-screens". These mirror the SEED_BANKS used in the fees lab.
  var DEMO_INTERMEDIARIES = [
    { bic: "CITIUS33XXX", name: "Citibank N.A." },
    { bic: "SCBLUS33XXX", name: "Standard Chartered NY" },
  ];

  // Quick scenarios for the demo. The three archetypes the lab teaches:
  // CLEAR, REVIEW, and BLOCKED. Each beneficiary name is tuned against the
  // backend's fuzzy matcher so it lands in the intended band.
  //   - Bob Williams  : no watchlist overlap            -> CLEAR
  //   - Korolov       : partial overlap w/ "Sergei Korolev" alias -> REVIEW
  //   - Tariq Kassem  : near-exact match to a listed name -> BLOCKED
  var SCENARIOS = [
    { label: "Clear name", sender: "Alice Johnson", beneficiary: "Bob Williams" },
    { label: "Close match", sender: "Alice Johnson", beneficiary: "Korolov" },
    { label: "Exact hit", sender: "Alice Johnson", beneficiary: "Tariq Kassem" },
  ];

  LearnLabs["sanctions"] = function (main, helpers) {
    var el = helpers.el;
    var glossify = helpers.glossify;
    var markComplete = helpers.markComplete;
    var getProgress = helpers.getProgress;

    // ── HEADER ────────────────────────────────────────────────────────────
    var header = el("div", "lab-header");
    header.innerHTML =
      '<div class="lab-badge">Compliance Lab</div>' +
      "<h1>Sanctions Screening: Why Payments Get Stopped</h1>" +
      "<p>" +
      "You sent a perfectly valid payment and it just\u2026 stops. No error, no " +
      "refund \u2014 it\u2019s \u201Cunder review.\u201D This lab shows why: every bank in the chain " +
      "screens every payment against sanctions watchlists, and a single flag " +
      "anywhere along the route can pause or kill it. Find out what the " +
      "compliance team sees when your name lights up." +
      "</p>";
    main.appendChild(header);

    // ── CONCEPT 1: Every payment is screened ──────────────────────────────
    var c1 = el("div", "concept");
    c1.innerHTML =
      "<h2>Every payment is screened</h2>" +
      "<p>" + glossify(
        "There is no \u201Cexpress lane\u201D for cross-border payments. Every bank in the " +
        "chain \u2014 your sender bank, each Intermediary bank, and the beneficiary " +
        "bank \u2014 runs Sanctions screening on the parties before it forwards the " +
        "money. The sender and beneficiary names are matched against consolidated " +
        "watchlists (OFAC SDN, EU, UN, UK) and the bank\u2019s own internal lists."
      ) + "</p>" +
      '<p style="font-size:0.9375rem">' +
      glossify(
        "Screening happens at <strong>every hop</strong>, not just the first. Even if your " +
        "own bank clears the payment, a Correspondent bank halfway across the world " +
        "can still stop it. That\u2019s why a payment that looks fine at the counter can " +
        "still vanish for days \u2014 each bank in the chain gets its own veto."
      ) +
      "</p>";
    main.appendChild(c1);

    // ── CONCEPT 2: CLEAR / REVIEW / BLOCKED ───────────────────────────────
    var c2 = el("div", "concept");
    c2.innerHTML =
      "<h2>CLEAR / REVIEW / BLOCKED</h2>" +
      "<p>" +
      "Every screen produces one of three outcomes. The score is a fuzzy-match " +
      "similarity between the payment party and the closest watchlist entry:" +
      "</p>" +
      '<ul style="font-size:0.9375rem;padding-left:1.5rem;margin-top:0.5rem">' +
      "<li><strong>CLEAR</strong> \u2014 no meaningful match. The payment sails through " +
      "(usually in seconds).</li>" +
      "<li><strong>REVIEW</strong> \u2014 a possible match. The payment is held in a " +
      "compliance queue while a human investigator decides. Downstream hops pause " +
      "until it\u2019s cleared.</li>" +
      "<li><strong>BLOCKED</strong> \u2014 a hard, near-exact match. The payment is rejected " +
      "and may be reported to the authorities. The bank cannot legally let it through.</li>" +
      "</ul>" +
      '<p style="font-size:0.9375rem;margin-top:0.5rem">' +
      "<strong>The false positive problem.</strong> Over <strong>90%</strong> of " +
      "screening hits are false alarms \u2014 a legitimate \u201CMohammed Ali\u201D getting " +
      "flagged because a sanctioned \u201CMohammed Ali\u201D exists. Banks err on the side " +
      "of caution: when in doubt, hold for review. The cost of a wrong \u201Cclear\u201D " +
      "(a multi-million-dollar fine) dwarfs the cost of a wrong \u201Chold\u201D (a delayed " +
      "payment and an annoyed customer)." +
      "</p>" +
      '<div class="callout" style="margin-top:0.75rem">' +
      "<strong>The airport analogy.</strong> Think of the " +
      "watchlist as the metal detector at airport security. Most people walk through " +
      "with no beep \u2014 but the detector isn\u2019t looking for guilty people, it\u2019s " +
      "looking for <em>metal</em>. A belt buckle, a laptop, a hip replacement \u2014 all " +
      "set it off. Security then pats you down (the REVIEW) and almost always waves " +
      "you through. Sanctions screening works the same way: it flags anything that " +
      "<em>looks</em> like a match, and a human decides whether it\u2019s real." +
      "</div>";
    main.appendChild(c2);

    // ── INTERACTIVE DEMO: Screen a name ───────────────────────────────────
    var demo = el("div", "demo");
    demo.innerHTML =
      '<div class="demo-label">Screen a name</div>' +
      '<p class="muted" style="font-size:0.875rem;margin-bottom:0.75rem">' +
      "Type a sender and beneficiary, or pick a scenario. Then watch each bank in " +
      "the chain issue its verdict." +
      "</p>" +

      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:0.75rem;margin-bottom:0.75rem">' +
        '<div>' +
          '<label class="muted" style="font-size:0.75rem;display:block;margin-bottom:0.25rem">Sender name</label>' +
          '<input class="lab-input mono" id="sanctions-sender" type="text" value="Alice Johnson" autocomplete="off" />' +
        "</div>" +
        '<div>' +
          '<label class="muted" style="font-size:0.75rem;display:block;margin-bottom:0.25rem">Beneficiary name</label>' +
          '<input class="lab-input mono" id="sanctions-beneficiary" type="text" value="Bob Williams" autocomplete="off" />' +
        "</div>" +
      "</div>" +

      '<div style="margin-bottom:0.75rem">' +
        '<span class="muted" style="font-size:0.75rem;display:block;margin-bottom:0.25rem">Quick scenarios</span>' +
        '<div id="sanctions-pills" style="display:flex;gap:0.5rem;flex-wrap:wrap"></div>' +
      "</div>" +

      '<button class="lab-btn" id="sanctions-screen-btn">Screen</button>' +
      '<div class="lab-result" id="sanctions-result"></div>';
    main.appendChild(demo);

    var senderInput = demo.querySelector("#sanctions-sender");
    var benInput = demo.querySelector("#sanctions-beneficiary");
    var pillsWrap = demo.querySelector("#sanctions-pills");
    var screenBtn = demo.querySelector("#sanctions-screen-btn");
    var resultBox = demo.querySelector("#sanctions-result");

    // Build the quick-scenario pills.
    SCENARIOS.forEach(function (sc) {
      var pill = document.createElement("button");
      pill.type = "button";
      pill.className = "scheme-quiz-option";
      pill.style.cssText = "width:auto;margin:0;padding:4px 12px;font-size:0.8125rem";
      pill.textContent = sc.label;
      pill.addEventListener("click", function () {
        senderInput.value = sc.sender;
        benInput.value = sc.beneficiary;
        // Highlight the active pill.
        pillsWrap.querySelectorAll("button").forEach(function (b) {
          b.style.borderColor = "var(--border)";
          b.style.background = "var(--surface)";
        });
        pill.style.borderColor = "var(--accent)";
        pill.style.background = "var(--accent-surface)";
        runScreen();
      });
      pillsWrap.appendChild(pill);
    });

    // ── call the API ──────────────────────────────────────────────────────
    function callScreen(sender, beneficiary) {
      return fetch("/api/screen", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sender_name: sender,
          beneficiary_name: beneficiary,
          intermediary_bics: DEMO_INTERMEDIARIES.map(function (b) { return b.bic; }),
          intermediary_names: DEMO_INTERMEDIARIES.map(function (b) { return b.name; }),
        }),
      }).then(function (r) {
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.json();
      });
    }

    // ── verdict → badge + tone helpers ────────────────────────────────────
    function verdictBadge(decision) {
      var d = String(decision || "").toUpperCase();
      if (d === "HARD_HIT" || d === "REJECT" || d === "BLOCKED") {
        return '<span class="badge badge-red">BLOCKED</span>';
      }
      if (d === "POSSIBLE_HIT" || d === "HOLD" || d === "REVIEW") {
        return '<span class="badge badge-amber">REVIEW</span>';
      }
      return '<span class="badge badge-green">CLEAR</span>';
    }

    function verdictTone(decision, position) {
      var d = String(decision || "").toUpperCase();
      if (d === "HARD_HIT" || d === "REJECT") return "reject";
      if (position === "sender") return "you";
      if (position === "beneficiary") return "ben";
      return "inter";
    }

    function verdictIcon(decision, position) {
      var d = String(decision || "").toUpperCase();
      if (d === "HARD_HIT" || d === "REJECT") return "\u2717";
      if (position === "sender") return "\uD83D\uDCCD";
      if (position === "beneficiary") return "\u2713";
      return "\uD83C\uDFE6";
    }

    // ── render the checkpoint chain ───────────────────────────────────────
    // Each hop becomes a viz-chain-node with a verdict badge. The position
    // (sender / inter / beneficiary) drives the tone; a HARD_HIT overrides to
    // the reject tone.
    function chainHTML(res) {
      var nodes = [];
      (res.hops || []).forEach(function (h, i) {
        var position;
        if (i === 0) position = "sender";
        else if (i === (res.hops || []).length - 1) position = "beneficiary";
        else position = "inter";

        var tone = verdictTone(h.decision, position);
        var icon = verdictIcon(h.decision, position);

        // The first hop shows the sender name; the last shows the beneficiary.
        // Intermediaries show the bank name.
        var label, sub;
        if (position === "sender") {
          label = "Sender Bank";
          sub = esc(res.sender && res.sender.name ? res.sender.name : h.bank_name);
        } else if (position === "beneficiary") {
          label = "Beneficiary Bank";
          sub = esc(res.beneficiary && res.beneficiary.name ? res.beneficiary.name : h.bank_name);
        } else {
          label = h.bank_name ? esc(h.bank_name) : esc(h.bic);
          sub = h.bic ? esc(h.bic) : "";
        }

        nodes.push(
          '<div class="viz-chain-node viz-tone-' + tone + '">' +
            '<div class="viz-chain-icon">' + icon + "</div>" +
            '<div class="viz-chain-label">' + label + "</div>" +
            (sub ? '<div class="viz-chain-sub">' + sub + "</div>" : "") +
            '<div style="margin-top:0.375rem">' + verdictBadge(h.decision) + "</div>" +
            '<div class="viz-chain-sub" style="margin-top:0.25rem">' + esc(h.action) + "</div>" +
          "</div>"
        );
      });

      // Join nodes with arrows.
      var joined = [];
      for (var j = 0; j < nodes.length; j++) {
        if (j > 0) {
          joined.push(
            '<div class="viz-chain-arrow">' +
              '<svg width="32" height="24" viewBox="0 0 32 24">' +
              '<path d="M2 12 H26" stroke="#a8a29e" stroke-width="2" fill="none" stroke-dasharray="4 3"/>' +
              '<path d="M22 7 L28 12 L22 17" stroke="#a8a29e" stroke-width="2" fill="none"/>' +
              "</svg>" +
            "</div>"
          );
        }
        joined.push(nodes[j]);
      }

      return '<div class="viz-chain">' + joined.join("") + "</div>";
    }

    // ── render a single party (sender or beneficiary) score block ─────────
    function partyHTML(party) {
      if (!party) return "";
      var score = Math.round((Number(party.score) || 0) * 100);
      var barColor;
      if (party.hit) {
        barColor = score >= 90 ? "var(--red)" : "var(--amber, #f59e0b)";
      } else {
        barColor = "var(--green)";
      }
      var rec = String(party.recommendation || "").toUpperCase();
      var recBadge =
        rec === "REJECT" ? '<span class="badge badge-red">REJECT</span>' :
        rec === "REVIEW" ? '<span class="badge badge-amber">REVIEW</span>' :
        '<span class="badge badge-green">CLEAR</span>';

      var matched = "";
      if (party.hit && party.matched_entry) {
        var m = party.matched_entry;
        matched =
          '<div class="callout" style="margin-top:0.5rem;padding:0.625rem 0.75rem;font-size:0.8125rem">' +
            '<div style="font-weight:600;margin-bottom:0.25rem">\u26a0 Matched watchlist entry</div>' +
            '<div style="display:grid;grid-template-columns:auto 1fr;gap:0.125rem 0.75rem">' +
              "<span class=\"muted\">Name:</span><span class=\"mono\">" + esc(m.name) + "</span>" +
              "<span class=\"muted\">Program:</span><span class=\"mono\">" + esc(m.program) + "</span>" +
              "<span class=\"muted\">Authority:</span><span class=\"mono\">" + esc(m.authority) + "</span>" +
              "<span class=\"muted\">Type:</span><span class=\"mono\">" + esc(m.type) + "</span>" +
              (m.id ? "<span class=\"muted\">Ref:</span><span class=\"mono\">" + esc(m.id) + "</span>" : "") +
            "</div>" +
            (m.aliases && m.aliases.length
              ? '<div class="muted" style="margin-top:0.25rem">AKA: ' +
                m.aliases.map(function (a) { return esc(a); }).join(", ") + "</div>"
              : "") +
          "</div>";
      }

      return (
        '<div style="flex:1;min-width:0">' +
          '<div style="display:flex;justify-content:space-between;align-items:center;gap:0.5rem">' +
            "<strong>" + esc(party.party === "sender" ? "Sender" : "Beneficiary") + "</strong>" +
            recBadge +
          "</div>" +
          '<div class="mono" style="font-size:0.8125rem;margin:0.125rem 0 0.25rem;word-break:break-word">' +
            esc(party.name) + "</div>" +
          '<div class="score-bar-container">' +
            '<div class="score-bar-fill" style="width:' + score + "%;background:" + barColor + '">' +
              score + "%" +
            "</div>" +
          "</div>" +
          '<div class="muted" style="font-size:0.6875rem">similarity to closest watchlist entry</div>' +
          matched +
        "</div>"
      );
    }

    // ── render the full result ────────────────────────────────────────────
    function renderResult(res) {
      var overall = String(res.overall_recommendation || "").toUpperCase();
      var overallBadge =
        overall === "BLOCKED"
          ? '<span class="badge badge-red" style="font-size:0.875rem">BLOCKED</span>'
          : overall === "REVIEW"
            ? '<span class="badge badge-amber" style="font-size:0.875rem">REVIEW</span>'
            : '<span class="badge badge-green" style="font-size:0.875rem">CLEAR</span>';

      // Blocked banner.
      var blockedBanner = "";
      if (res.blocked) {
        blockedBanner =
          '<div class="callout" style="margin-bottom:0.75rem;border-color:var(--red);background:var(--red-bg)">' +
            '<div style="font-weight:700;color:var(--red)">' +
              "\uD83D\uDED1 PAYMENT BLOCKED" +
            "</div>" +
            '<div style="font-size:0.8125rem;margin-top:0.25rem">' +
              "A hard match was found at hop " + esc(res.blocked_at_hop) +
              ". The payment cannot proceed and has been rejected. " +
              "Downstream banks never see it." +
            "</div>" +
          "</div>";
      }

      // Checkpoint chain.
      var chain = chainHTML(res);

      // Party detail panel (sender + beneficiary side by side).
      var parties =
        '<div style="display:flex;gap:1rem;flex-wrap:wrap;margin-top:0.75rem">' +
          partyHTML(res.sender) +
          partyHTML(res.beneficiary) +
        "</div>";

      // Summary line.
      var delay = Number(res.total_delay_hours) || 0;
      var summary =
        '<div style="margin-top:0.75rem;font-size:0.875rem">' +
          "<strong>Overall: </strong>" + overallBadge +
          (res.blocked
            ? " \u00B7 rejected at hop " + esc(res.blocked_at_hop)
            : delay > 0
              ? " \u00B7 held ~" + esc(delay) + "h for review"
              : " \u00B7 no delay") +
        "</div>";

      resultBox.className =
        "lab-result show " +
        (res.blocked
          ? "lab-result-error"
          : overall === "REVIEW"
            ? "lab-result-warn"
            : "lab-result-success");
      resultBox.innerHTML =
        blockedBanner +
        chain +
        summary +
        parties +
        '<p class="muted" style="font-size:0.75rem;margin-top:0.75rem">' +
        esc(res.disclaimer) +
        "</p>";
    }

    function showError(msg) {
      resultBox.className = "lab-result show lab-result-error";
      resultBox.innerHTML =
        '<div class="badge badge-red">Couldn\u2019t screen</div> ' + esc(msg);
    }

    function runScreen() {
      var sender = (senderInput.value || "").trim();
      var beneficiary = (benInput.value || "").trim();
      if (!sender || !beneficiary) {
        resultBox.className = "lab-result show lab-result-error";
        resultBox.innerHTML = "Enter both a sender and a beneficiary name.";
        return;
      }
      screenBtn.disabled = true;
      screenBtn.textContent = "Screening\u2026";
      callScreen(sender, beneficiary)
        .then(function (res) { renderResult(res); })
        .catch(function (err) {
          showError(
            (err && err.message) ||
            "Couldn\u2019t reach the screening service. Is the server running?"
          );
        })
        .then(function () {
          screenBtn.disabled = false;
          screenBtn.textContent = "Screen";
        });
    }

    screenBtn.addEventListener("click", runScreen);
    [senderInput, benInput].forEach(function (input) {
      input.addEventListener("keydown", function (e) {
        if (e.key === "Enter") runScreen();
      });
    });

    // ── CALLOUT: mock watchlist disclaimer ────────────────────────────────
    var callout = el("div", "callout");
    callout.innerHTML =
      '<div class="callout-title">\u26a0 Training data \u2014 fictional</div>' +
      "This is a <strong>mock watchlist with fictional names</strong>, built only " +
      "to teach the shape of screening. Real screening uses the " +
      "<strong>OFAC SDN list</strong> plus the EU, UN, and UK consolidated lists, " +
      "furnished by licensed vendors (Accuity, Refinitiv World-Check, Dow Jones) " +
      "and matched with far more sophisticated fuzzy-matching and " +
      "name-romanization engines than this demo. Never use this tool for real " +
      "screening.";
    main.appendChild(callout);

    // ── EXERCISE 1: Find a name that gets BLOCKED ─────────────────────────
    var ex1 = el("div", "exercise");
    ex1.innerHTML =
      '<div class="exercise-header">' +
        '<span class="exercise-badge">1</span>' +
        '<span class="exercise-title">Find a name that gets BLOCKED</span>' +
      "</div>" +
      '<p class="exercise-prompt">' +
        "Type any name that triggers a <strong>BLOCKED</strong> verdict from the " +
        "screening service. (Hint: the watchlist contains sanctioned individuals " +
        "and entities \u2014 try a name close to one of them.) We\u2019ll screen it as " +
        "both sender and beneficiary to check." +
      "</p>" +
      '<input class="lab-input mono" id="sanctions-ex1-input" type="text" placeholder="e.g. a sanctioned individual\u2019s name" autocomplete="off" />' +
      '<div style="margin-top:0.75rem" id="sanctions-ex1-btnrow">' +
        '<button class="lab-btn" id="sanctions-ex1-check">Screen it</button>' +
      "</div>" +
      '<div class="exercise-hint" id="sanctions-ex1-hint">' +
        "The watchlist includes individuals like \u201CTariq Kassem\u201D and " +
        "\u201CSergei Korolev,\u201D entities like \u201CWagner Group,\u201D and vessels. " +
        "Type one of those names (or something very close) to land a hard match " +
        "(\u226590% similarity). Anything below 75% scores as CLEAR." +
      "</div>" +
      '<div class="lab-result" id="sanctions-ex1-result"></div>';
    main.appendChild(ex1);

    var ex1Input = ex1.querySelector("#sanctions-ex1-input");
    var ex1Btn = ex1.querySelector("#sanctions-ex1-check");
    var ex1Result = ex1.querySelector("#sanctions-ex1-result");
    var ex1Hint = ex1.querySelector("#sanctions-ex1-hint");

    ex1Btn.addEventListener("click", function () {
      var name = (ex1Input.value || "").trim();
      if (!name) {
        ex1Result.className = "lab-result show lab-result-error";
        ex1Result.innerHTML = "Type a name first.";
        return;
      }
      ex1Btn.disabled = true;
      ex1Btn.textContent = "Screening\u2026";
      // Screen the learner's name as both sender and beneficiary so the
      // verdict reflects the name alone, regardless of which party it lands on.
      callScreen(name, name)
        .then(function (res) {
          if (res.blocked) {
            var party = (res.sender && res.sender.hit) ? res.sender : res.beneficiary;
            var matched = (party && party.matched_entry) || null;
            ex1Result.className = "lab-result show lab-result-success";
            ex1Result.innerHTML =
              '<div class="badge badge-red">BLOCKED</div> ' +
              "<strong>Correct!</strong> \u201C" + esc(name) + "\u201D scored a hard match " +
              "and the payment was rejected at hop " + esc(res.blocked_at_hop) + "." +
              (matched
                ? ' It matched <span class="mono">' + esc(matched.name) + "</span> " +
                  "(program " + esc(matched.program) + ", " + esc(matched.authority) + ")."
                : "") +
              '<p class="muted" style="font-size:0.8125rem;margin-top:0.5rem">' +
              "In a real bank this would also trigger a regulatory report \u2014 the bank " +
              "is legally obligated to file one when it blocks a payment." +
              "</p>";
            ex1Input.disabled = true;
            ex1Btn.textContent = "Solved \u2713";
          } else {
            var overall = String(res.overall_recommendation || "").toUpperCase();
            var score = Math.round(Math.max(
              Number((res.sender && res.sender.score) || 0),
              Number((res.beneficiary && res.beneficiary.score) || 0)
            ) * 100);
            if (overall === "REVIEW") {
              ex1Result.className = "lab-result show lab-result-error";
              ex1Result.innerHTML =
                '<div class="badge badge-amber">REVIEW</div> ' +
                "Close! \u201C" + esc(name) + "\u201D scored " + score + "% \u2014 a possible " +
                "match, so the payment was held for review, but not blocked. You need a " +
                "<strong>hard match</strong> (\u226590% similarity). Try a name that\u2019s " +
                "closer to (or exactly) a watchlist entry.";
            } else {
              ex1Result.className = "lab-result show lab-result-error";
              ex1Result.innerHTML =
                '<div class="badge badge-green">CLEAR</div> ' +
                "\u201C" + esc(name) + "\u201D scored only " + score + "% \u2014 no match. " +
                "That name isn\u2019t on the watchlist. Peek at the hint for the kind of " +
                "names that are.";
            }
            ex1Btn.disabled = false;
            ex1Btn.textContent = "Screen it";
          }
        })
        .catch(function () {
          ex1Result.className = "lab-result show lab-result-error";
          ex1Result.innerHTML =
            "Couldn\u2019t reach the screening service to verify \u2014 check the server and try again.";
          ex1Btn.disabled = false;
          ex1Btn.textContent = "Screen it";
        });
    });

    // "Show hint" affordance for exercise 1.
    (function () {
      var btnRow = ex1.querySelector("#sanctions-ex1-btnrow");
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

    // ── EXERCISE 2: Quiz — REVIEW at hop 2 ────────────────────────────────
    var ex2 = el("div", "exercise");
    ex2.innerHTML =
      '<div class="exercise-header">' +
        '<span class="exercise-badge">2</span>' +
        '<span class="exercise-title">A payment hits REVIEW at hop 2. What happens?</span>' +
      "</div>" +
      '<p class="exercise-prompt">' +
        "A cross-border payment clears hop 1 (the sender bank), but at hop 2 " +
        "(the first correspondent bank) it scores a possible match and is marked " +
        "REVIEW. What happens to the payment?" +
      "</p>" +
      '<div id="sanctions-ex2-options"></div>' +
      '<div class="lab-result" id="sanctions-ex2-result"></div>';
    main.appendChild(ex2);

    var ex2OptionsWrap = ex2.querySelector("#sanctions-ex2-options");
    var ex2Result = ex2.querySelector("#sanctions-ex2-result");

    var ex2Options = [
      {
        label: "(a) The payment continues normally",
        correct: false,
        explain:
          "No. A REVIEW isn\u2019t a clear \u2014 the payment can\u2019t just carry on. " +
          "Letting a flagged payment flow downstream while it\u2019s still under " +
          "investigation would defeat the point of screening.",
      },
      {
        label: "(b) The payment is held for compliance review, and downstream hops pause",
        correct: true,
        explain:
          "Correct. The correspondent bank parks the payment in its compliance " +
          "queue (typically a ~24h hold) while an investigator decides whether the " +
          "match is real. The next hops don\u2019t receive it until it\u2019s cleared \u2014 " +
          "which is exactly why a \u201CREVIEW\u201D payment seems to vanish for a day " +
          "before either resuming or being returned.",
      },
      {
        label: "(c) The payment is returned to the sender",
        correct: false,
        explain:
          "No \u2014 that\u2019s what happens on a BLOCKED verdict (or a wrong-account " +
          "return). REVIEW is the \u201Cwe\u2019re not sure yet\u201D state: the money is held, " +
          "not sent back. Most REVIEWs are false positives and eventually clear.",
      },
    ];

    ex2Options.forEach(function (opt) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "scheme-quiz-option";
      btn.textContent = opt.label;
      btn.addEventListener("click", function () {
        ex2OptionsWrap.querySelectorAll("button").forEach(function (b) {
          b.disabled = true;
        });
        if (opt.correct) {
          btn.classList.add("correct");
          ex2Result.className = "lab-result show lab-result-success";
        } else {
          btn.classList.add("wrong");
          // Highlight the correct option.
          ex2OptionsWrap.querySelectorAll("button").forEach(function (b, i) {
            if (ex2Options[i].correct) b.classList.add("correct");
          });
          ex2Result.className = "lab-result show lab-result-error";
        }
        ex2Result.innerHTML =
          "<p>" + esc(opt.explain) + "</p>" +
          '<button class="lab-btn secondary" type="button" id="sanctions-ex2-retry" style="margin-top:0.5rem">' +
          (opt.correct ? "Reset" : "Try again") +
          "</button>";
        var retry = document.getElementById("sanctions-ex2-retry");
        if (retry) {
          retry.addEventListener("click", function () {
            ex2OptionsWrap.querySelectorAll("button").forEach(function (b) {
              b.disabled = false;
              b.classList.remove("correct", "wrong");
            });
            ex2Result.className = "lab-result";
            ex2Result.innerHTML = "";
          });
        }
      });
      ex2OptionsWrap.appendChild(btn);
    });

    // ── COMPLETE BUTTON ───────────────────────────────────────────────────
    var alreadyDone = getProgress().indexOf("sanctions") !== -1;

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
        "You now know why payments get stopped, what CLEAR/REVIEW/BLOCKED mean, " +
        "and why most screening hits are false alarms.";
    }

    completeBtn.addEventListener("click", function () {
      markComplete("sanctions");
      completeBtn.disabled = true;
      completeBtn.textContent = "Mark as complete \u2713";
      completeMsg.className = "lab-result show lab-result-success";
      completeMsg.innerHTML =
        '<div class="badge badge-green">Lab complete!</div> You can now read a ' +
        "screening verdict, explain the false-positive problem, and tell a customer " +
        "exactly which bank in the chain held their payment.";
    });

    // ── LAB NAVIGATION ────────────────────────────────────────────────────
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
