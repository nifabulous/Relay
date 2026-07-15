/*
 * Learn Labs 4–6 — Correspondent Routing, Settlement Instructions, Payment Tracking.
 *
 * Loaded after glossary.js and before learn.js. learn.js calls
 * LearnLabs[labId](main, helpers) where helpers = { el, glossify, markComplete, getProgress }.
 *
 * This file ONLY assigns LearnLabs["4"], ["5"], ["6"] — it does not touch any
 * other keys, so labs 1–3 (defined elsewhere) are preserved.
 */
(function () {
  "use strict";

  // Initialize the shared registry without overwriting other labs.
  window.LearnLabs = window.LearnLabs || {};

  // ── Small shared utilities (module-local) ──────────────
  var esc = LearnUtils.esc;

  function fmtMoney(num, ccy) {
    const n = Number(num);
    if (!isFinite(n)) return num;
    const s = n.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    return ccy ? ccy + " " + s : s;
  }

  // Map an intermediary confidence string to a badge class.
  function confidenceBadge(conf) {
    const c = String(conf || "").toLowerCase();
    if (c.indexOf("high") === 0) return "badge-green";
    if (c.indexOf("med") === 0) return "badge-amber";
    return "badge-red";
  }

  // Map a gpi status string to a badge class.
  function statusBadge(status) {
    const s = String(status || "").toUpperCase();
    if (s === "CREDITED" || s === "SETTLED" || s === "COMPLETED") return "badge-green";
    if (s === "REJECTED" || s === "RETURNED" || s === "CANCELLED") return "badge-red";
    return "badge-amber";
  }

  // Build a "footer nav" with a Mark-complete + Next-lab link.
  function labNav(main, helpers, nextLabId, nextLabel) {
    const nav = helpers.el("div", "lab-nav");
    const complete = helpers.el(
      "button",
      "lab-btn",
      "Mark complete &amp; continue →"
    );
    complete.type = "button";
    complete.addEventListener("click", function () {
      const id = main.dataset.labId;
      if (id) helpers.markComplete(id);
      if (nextLabId) location.hash = "#lab-" + nextLabId;
    });
    nav.appendChild(complete);
    if (nextLabel) {
      const hint = helpers.el("div", "muted", "Next: " + esc(nextLabel));
      hint.style.fontSize = "0.75rem";
      hint.style.marginTop = "0.5rem";
      nav.appendChild(hint);
    }
    main.appendChild(nav);
  }

  // Render an exercise block with an auto-checking input.
  // checker(userInput) → returns {ok: bool, message: string}.
  function buildExercise(main, helpers, opts) {
    const ex = helpers.el("div", "exercise");
    const header = helpers.el("div", "exercise-header");
    header.appendChild(helpers.el("div", "exercise-badge", "?"));
    header.appendChild(
      helpers.el("div", "exercise-title", esc(opts.title || "Exercise"))
    );
    ex.appendChild(header);
    ex.appendChild(helpers.el("div", "exercise-prompt", opts.prompt));

    const input = document.createElement("input");
    input.className = "lab-input";
    input.type = "text";
    input.placeholder = opts.placeholder || "Your answer";
    ex.appendChild(input);

    const checkBtn = helpers.el("button", "lab-btn", "Check answer");
    checkBtn.type = "button";
    ex.appendChild(checkBtn);

    const result = helpers.el("div", "lab-result");
    ex.appendChild(result);

    const hint = helpers.el("div", "exercise-hint", opts.hint || "");
    if (opts.hint) ex.appendChild(hint);

    async function run() {
      result.className = "lab-result";
      result.innerHTML =
        '<span class="muted">Checking…</span>';
      result.classList.add("show");
      try {
        const outcome = await opts.checker(input.value.trim());
        result.classList.remove(
          "lab-result-success",
          "lab-result-error",
          "lab-result-warn"
        );
        if (outcome.ok) {
          result.classList.add("lab-result-success");
          result.innerHTML =
            '<strong>✓ Correct.</strong> ' + esc(outcome.message || "");
        } else {
          result.classList.add("lab-result-error");
          result.innerHTML =
            '<strong>✗ Not quite.</strong> ' + esc(outcome.message || "");
        }
      } catch (e) {
        result.classList.add("lab-result-error");
        result.innerHTML =
          '<strong>Couldn\'t verify.</strong> ' + esc(String(e && e.message || e));
      }
    }

    checkBtn.addEventListener("click", run);
    input.addEventListener("keydown", function (e) {
      if (e.key === "Enter") run();
    });

    main.appendChild(ex);
    return { ex, input, result };
  }

  // ===========================================================================
  // LAB 4 — How Money Moves: Correspondent Routing
  // ===========================================================================
  LearnLabs["4"] = function (main, helpers) {
    main.dataset.labId = "4";
    const { el, glossify } = helpers;

    // Header
    const header = el("div", "lab-header");
    header.innerHTML =
      '<div class="lab-badge">Lab 4</div>' +
      "<h1>How Money Moves: Correspondent Routing</h1>" +
      "<p>Why a payment rarely goes straight from your bank to the destination bank — and who sits in the middle.</p>";
    main.appendChild(header);

    // Concept: the problem
    const c1 = el("div", "concept");
    c1.appendChild(el("h2", null, "The problem"));
    c1.innerHTML += glossify(
      "Your bank and the destination bank probably don't have accounts with each other. " +
        "Imagine you bank with a small credit union in Ohio and want to pay a supplier whose " +
        "account is at a bank in Lagos. Neither bank holds the other's currency, and they have " +
        "no direct link on the SWIFT network. So they use intermediary banks — also called a " +
        "Correspondent bank — that DO have a relationship with both ends. The payment hops through " +
        "them like stepping stones across a river."
    );
    main.appendChild(c1);

    // Concept: Nostro / Vostro
    const c2 = el("div", "concept");
    c2.appendChild(el("h2", null, "Nostro and Vostro"));
    c2.innerHTML += glossify(
      "For two banks to settle a payment, one of them must hold an account at the other (or both " +
        "at a third bank). These mirror accounts are called Nostro and Vostro:" +
        "<br><br><strong>Nostro</strong> = <em>our</em> money in <em>your</em> bank. " +
        "<br><strong>Vostro</strong> = <em>your</em> money in <em>our</em> bank." +
        "<br><br>It's the exact same account — just described from two perspectives. When Bank A " +
        "holds EUR at Bank B, Bank A calls it a Nostro (\"our euro account at B\"); Bank B calls it " +
        "a Vostro (\"A's euro account with us\"). The correspondent in the middle keeps these " +
        "accounts and moves the numbers on settlement day."
    );
    main.appendChild(c2);

    // Concept: the chain
    const c3 = el("div", "concept");
    c3.appendChild(el("h2", null, "The chain"));
    c3.innerHTML += glossify(
      "A cross-border payment typically hops through 1–3 intermediary banks before it lands. " +
        "Each Intermediary bank takes a small fee for forwarding the message and settling the " +
        "funds. The full chain looks like: your bank → intermediary 1 → (intermediary 2) → " +
        "beneficiary bank. More hops means a slower, more expensive payment — but sometimes there " +
        "is no shorter path."
    );
    main.appendChild(c3);

    // ── Interactive demo: route a payment ─────────────────
    const demo = el("div", "demo");
    demo.appendChild(el("div", "demo-label", "Interactive · Route a payment"));
    const bicInput = document.createElement("input");
    bicInput.className = "lab-input";
    bicInput.value = "GTBINGLAXXX";
    bicInput.placeholder = "Beneficiary BIC (e.g. GTBINGLAXXX)";
    const ccyInput = document.createElement("input");
    ccyInput.className = "lab-input";
    ccyInput.value = "USD";
    ccyInput.placeholder = "Currency (e.g. USD)";
    ccyInput.style.marginTop = "0.5rem";
    ccyInput.style.maxWidth = "120px";
    const findBtn = el("button", "lab-btn", "Find intermediaries");
    findBtn.type = "button";
    const demoResult = el("div", "lab-result");
    demo.appendChild(bicInput);
    demo.appendChild(ccyInput);
    demo.appendChild(findBtn);
    demo.appendChild(demoResult);
    main.appendChild(demo);

    let lastResult = null; // cache so the exercise can reuse it

    async function doRoute(bic, ccy, into) {
      into.className = "lab-result show";
      into.innerHTML = '<span class="muted">Looking up routing…</span>';
      try {
        const res = await fetch(
          "/api/route?bic=" +
            encodeURIComponent(bic) +
            "&currency=" +
            encodeURIComponent(ccy)
        );
        if (!res.ok) throw new Error("Route lookup failed (" + res.status + ")");
        const data = await res.json();
        lastResult = data;
        renderRoute(into, data);
      } catch (e) {
        into.className = "lab-result show lab-result-error";
        into.innerHTML = "<strong>Error.</strong> " + esc(String(e.message || e));
      }
    }

    function renderRoute(into, data) {
      const inter = data.suggested_intermediaries || [];
      const benName =
        (data.bank && (data.bank.bank_name || data.bank.bic)) || data.bic || "Beneficiary";

      into.className = "lab-result show";
      into.innerHTML = "";

      // Build animated chain using the visualizer
      var chainNodes = [{ label: "Your Bank", sub: "originator", tone: "you" }];
      inter.forEach(function (i, idx) {
        chainNodes.push({
          label: i.bank || i.bic,
          sub: "hop " + (idx + 1),
          tone: "inter",
        });
      });
      chainNodes.push({ label: benName, sub: "beneficiary", tone: "ben" });

      if (inter.length > 0 && window.PaymentViz) {
        // Animated chain
        var chainContainer = el("div");
        into.appendChild(chainContainer);
        PaymentViz.animatedChain(chainContainer, chainNodes);

        // Replay button
        var replayBtn = el("button", "lab-btn secondary", "↻ Replay animation");
        replayBtn.style.fontSize = "0.75rem";
        replayBtn.style.marginBottom = "0.75rem";
        replayBtn.onclick = function () {
          var dot = chainContainer.querySelector(".viz-dot");
          if (dot) {
            dot.style.animation = "none";
            void dot.offsetWidth;
            dot.style.animation = "";
          }
        };
        into.appendChild(replayBtn);

        // Nostro/Vostro diagram for the first intermediary
        if (inter.length > 0) {
          var nvSection = el("div", null);
          nvSection.style.marginTop = "1rem";
          nvSection.innerHTML = '<div class="demo-label">Accounting: how money actually moves</div>';
          var nvContainer = el("div");
          nvSection.appendChild(nvContainer);
          into.appendChild(nvSection);

          PaymentViz.nostroVostro(nvContainer, {
            fromBank: "Your Bank",
            intermediary: inter[0].bank || inter[0].bic,
            toBank: benName,
            amount: "$5,000",
            currency: data.currency || "USD",
          });

          var nvNote = el("p", "muted",
            "The intermediary holds both a Nostro account (for your bank) and a Vostro account (for the beneficiary bank). " +
            "It debits one and credits the other — that's how the payment 'moves.'"
          );
          nvNote.style.fontSize = "0.75rem";
          nvNote.style.marginTop = "0.5rem";
          into.appendChild(nvNote);
        }
      } else {
        into.innerHTML += '<div class="muted">No intermediary chain suggested. ' +
          esc(data.notes || "") + "</div>";
        return;
      }

      // Intermediary table with confidence badges
      var tblSection = el("div");
      tblSection.style.marginTop = "1rem";
      tblSection.innerHTML = '<div class="demo-label">Intermediary details</div>';
      into.appendChild(tblSection);

      let tbl =
        '<table style="width:100%;border-collapse:collapse;margin-top:0.25rem;font-size:0.8125rem;">' +
        "<thead><tr style=\"text-align:left;color:#a8a29e;border-bottom:1px solid #e7e5e4;\">" +
        "<th style=\"padding:4px 6px;\">#</th>" +
        "<th style=\"padding:4px 6px;\">Intermediary</th>" +
        "<th style=\"padding:4px 6px;\">Corridor</th>" +
        "<th style=\"padding:4px 6px;\">Confidence</th>" +
        "</tr></thead><tbody>";
      inter.forEach((i, idx) => {
        tbl +=
          "<tr style=\"border-bottom:1px solid #f5f5f4;\">" +
          '<td style="padding:4px 6px;color:#a8a29e;">' +
          (idx + 1) +
          "</td>" +
          '<td style="padding:4px 6px;"><div style="font-weight:500;">' +
          esc(i.bank || i.bic) +
          '</div><div class="mono muted" style="font-size:0.6875rem;">' +
          esc(i.bic || "") +
          "</div></td>" +
          '<td style="padding:4px 6px;">' +
          esc(i.corridor || "—") +
          "</td>" +
          '<td style="padding:4px 6px;"><span class="badge ' +
          confidenceBadge(i.confidence) +
          '">' +
          esc(i.confidence || "—") +
          "</span></td>" +
          "</tr>";
      });
      tbl += "</tbody></table>";
      const wrap = el("div");
      wrap.innerHTML = tbl;
      into.appendChild(wrap);

      if (data.notes) {
        const noteP = el("div", "muted");
        noteP.style.cssText = "margin-top:0.5rem;font-size:0.75rem;";
        noteP.textContent = data.notes;
        into.appendChild(noteP);
      }
    }

    findBtn.addEventListener("click", function () {
      doRoute(bicInput.value.trim(), ccyInput.value.trim(), demoResult);
    });

    // ── Callout: why multiple intermediaries ──────────────
    const callout = el("div", "callout");
    callout.innerHTML =
      '<div class="callout-title">Why multiple intermediaries?</div>' +
      "Every hop charges a fee and adds latency. A 3-hop payment is slower and more expensive than " +
      "a direct one. SWIFT gpi (Lab 6) was built to make this chain visible and trackable — so banks " +
      "can see where money is, and customers stop guessing where their funds went.";
    main.appendChild(callout);

    // ── Exercise: route to Japan ──────────────────────────
    buildExercise(main, helpers, {
      title: "Route to Japan",
      prompt:
        "Using the tool above (or your own call), route a payment to <span class=\"mono\">BOTKJPJTXXX</span> in <strong>USD</strong>. " +
        "How many intermediaries are suggested?",
      placeholder: "Number of intermediaries (e.g. 2)",
      hint:
        "Set BIC = BOTKJPJTXXX and currency = USD, then count the rows. BOTKJPJTXXX = Bank of Tokyo-Mitsubishi UFJ (Japan).",
      checker: async function (val) {
        if (!val) return { ok: false, message: "Type the number of intermediaries you saw." };
        const n = parseInt(val, 10);
        if (!isFinite(n)) return { ok: false, message: "Enter a whole number." };
        // Fetch authoritatively so the check is deterministic.
        const res = await fetch(
          "/api/route?bic=BOTKJPJTXXX&currency=USD"
        );
        if (!res.ok) return { ok: false, message: "Routing service unavailable right now." };
        const data = await res.json();
        const count = (data.suggested_intermediaries || []).length;
        if (n === count) {
          return {
            ok: true,
            message:
              count +
              " intermediary(ies) suggested for BOTKJPJTXXX / USD. Real chains vary by originator bank.",
          };
        }
        return {
          ok: false,
          message:
            "The routing engine suggested " +
            count +
            " intermediary(ies) for BOTKJPJTXXX in USD.",
        };
      },
    });

    // Footer nav → Lab 5
    labNav(main, helpers, "5", "Where to Send: Settlement Instructions");
  };

  // ===========================================================================
  // LAB 5 — Where to Send: Settlement Instructions (SSI)
  // ===========================================================================
  LearnLabs["5"] = function (main, helpers) {
    main.dataset.labId = "5";
    const { el, glossify } = helpers;

    const header = el("div", "lab-header");
    header.innerHTML =
      '<div class="lab-badge">Lab 5</div>' +
      "<h1>Where to Send: Settlement Instructions</h1>" +
      "<p>Routing tells you which bank to use. SSI tells you the actual account number at that bank.</p>";
    main.appendChild(header);

    // Concept: what is an SSI
    const c1 = el("div", "concept");
    c1.appendChild(el("h2", null, "What is an SSI?"));
    c1.innerHTML += glossify(
      "SSI stands for Standard Settlement Instructions. Routing (Lab 4) tells you WHICH " +
        "Correspondent bank to use. SSI goes one level deeper: it gives you the actual Nostro " +
        "account number at that bank, the charge code, and the value date. Without the account " +
        "number, the payment can't settle — the intermediary receives a SWIFT message but has " +
        "nowhere to credit the funds. Every bank publishes its SSI list (one set per currency) so " +
        "senders know exactly where to land the money."
    );
    main.appendChild(c1);

    // Concept: charge codes
    const c2 = el("div", "concept");
    c2.appendChild(el("h2", null, "Charge codes: who pays the fees?"));
    c2.innerHTML += glossify(
      "Every cross-border payment carries a charge code that decides who eats the fees:" +
        "<br><br><strong>OUR</strong> — the sender pays ALL fees. The beneficiary receives the full amount." +
        "<br><strong>SHA</strong> — fees are SHARED. The sender pays their own bank; intermediary fees " +
        "are deducted from the amount along the way. This is the most common choice." +
        "<br><strong>BEN</strong> — the beneficiary pays ALL fees. The full deduction comes out of the " +
        "received amount." +
        "<br><br>Same payment, same chain — the charge code only changes who bears the cost."
    );
    main.appendChild(c2);

    // ── Interactive demo: look up real SSI ────────────────
    const demo = el("div", "demo");
    demo.appendChild(el("div", "demo-label", "Interactive · Look up real SSI"));
    const bicInput = document.createElement("input");
    bicInput.className = "lab-input";
    bicInput.value = "EBILAEADXXX";
    bicInput.placeholder = "Beneficiary BIC (e.g. EBILAEADXXX = Emirates NBD)";
    const ccyInput = document.createElement("input");
    ccyInput.className = "lab-input";
    ccyInput.value = "USD";
    ccyInput.placeholder = "Currency";
    ccyInput.style.marginTop = "0.5rem";
    ccyInput.style.maxWidth = "120px";
    const showBtn = el("button", "lab-btn", "Show instructions");
    showBtn.type = "button";
    const demoResult = el("div", "lab-result");
    demo.appendChild(bicInput);
    demo.appendChild(ccyInput);
    demo.appendChild(showBtn);
    demo.appendChild(demoResult);
    main.appendChild(demo);

    async function doSSI(bic, ccy, into) {
      into.className = "lab-result show";
      into.innerHTML = '<span class="muted">Fetching SSI…</span>';
      try {
        const res = await fetch(
          "/api/ssi?bic=" +
            encodeURIComponent(bic) +
            (ccy ? "&currency=" + encodeURIComponent(ccy) : "")
        );
        if (!res.ok) throw new Error("SSI lookup failed (" + res.status + ")");
        const data = await res.json();
        renderSSI(into, data);
      } catch (e) {
        into.className = "lab-result show lab-result-error";
        into.innerHTML = "<strong>Error.</strong> " + esc(String(e.message || e));
      }
    }

    function isPlaceholder(acct) {
      return /^ACCT-/i.test(String(acct || ""));
    }

    function renderSSI(into, data) {
      const rows = data.instructions || [];
      into.className = "lab-result show";
      into.innerHTML = "";
      if (!rows.length) {
        into.innerHTML =
          '<div class="muted">No SSI records found for <span class="mono">' +
          esc(data.beneficiary_bic) +
          "</span> in " +
          esc(data.currency) +
          ".</div>";
        return;
      }
      let tbl =
        '<table style="width:100%;border-collapse:collapse;font-size:0.8125rem;">' +
        "<thead><tr style=\"text-align:left;color:#a8a29e;border-bottom:1px solid #e7e5e4;\">" +
        "<th style=\"padding:6px;\">Currency</th>" +
        "<th style=\"padding:6px;\">Intermediary</th>" +
        "<th style=\"padding:6px;\">Account</th>" +
        "<th style=\"padding:6px;\">Charge</th>" +
        "<th style=\"padding:6px;\">Value Date</th>" +
        "</tr></thead><tbody>";
      rows.forEach((r) => {
        const ph = isPlaceholder(r.intermediary_account);
        const acctCell = ph
          ? '<span class="mono" style="color:#a8a29e;">' +
            esc(r.intermediary_account) +
            "</span>"
          : '<span class="mono" style="font-weight:600;">' +
            esc(r.intermediary_account || "—") +
            "</span>";
        tbl +=
          "<tr style=\"border-bottom:1px solid #f5f5f4;vertical-align:top;\">" +
          '<td style="padding:6px;"><span class="badge badge-amber">' +
          esc(r.currency) +
          "</span></td>" +
          '<td style="padding:6px;"><div style="font-weight:500;">' +
          esc(r.intermediary_bank_name || r.intermediary_bic) +
          '</div><div class="mono muted" style="font-size:0.6875rem;">' +
          esc(r.intermediary_bic || "") +
          "</div></td>" +
          '<td style="padding:6px;">' +
          acctCell +
          (ph ? '<div class="badge badge-red" style="margin-left:4px;">placeholder</div>' : "") +
          "</td>" +
          '<td style="padding:6px;">' +
          esc(r.charge_code || "SHA") +
          "</td>" +
          '<td style="padding:6px;">' +
          esc(r.value_date || "—") +
          "</td>" +
          "</tr>";
      });
      tbl += "</tbody></table>";
      into.innerHTML = tbl;
    }

    showBtn.addEventListener("click", function () {
      doSSI(bicInput.value.trim(), ccyInput.value.trim(), demoResult);
    });

    // ── Callout: placeholders ─────────────────────────────
    const callout = el("div", "callout");
    callout.style.background = "var(--amber-bg)";
    callout.style.borderColor = "#fde68a";
    callout.innerHTML =
      '<div class="callout-title">Mind the placeholders</div>' +
      "Some account numbers in this sandbox start with <span class=\"mono\">ACCT-</span> — those are " +
      "illustrative placeholders. Real account numbers come from the beneficiary bank's published SSI " +
      "pages or a licensed reference-data feed (SWIFTRef, Accuity). <strong>Never wire money using " +
      "placeholder data.</strong>";
    main.appendChild(callout);

    // ── Exercise: find Emirates NBD's USD correspondent ───
    buildExercise(main, helpers, {
      title: "Find Emirates NBD's USD correspondent",
      prompt:
        "Look up <span class=\"mono\">EBILAEADXXX</span> in <strong>USD</strong>. Which intermediary bank holds account " +
        '<span class="mono">6550286074</span>? Type the bank name.',
      placeholder: "Intermediary bank name",
      hint: "Use the tool above with BIC = EBILAEADXXX and currency = USD.",
      checker: async function (val) {
        if (!val) return { ok: false, message: "Type the intermediary bank's name." };
        const res = await fetch("/api/ssi?bic=EBILAEADXXX&currency=USD");
        if (!res.ok) return { ok: false, message: "SSI service unavailable right now." };
        const data = await res.json();
        const match = (data.instructions || []).find(function (r) {
          return r.intermediary_account === "6550286074";
        });
        if (!match) {
          return {
            ok: false,
            message: "No instruction with account 6550286074 was found in EBILAEADXXX / USD.",
          };
        }
        const want = (match.intermediary_bank_name || "").toLowerCase();
        const got = val.toLowerCase();
        // Loose match: accept if the typed answer is a meaningful token of the bank name
        // (e.g. "Standard Chartered", "stan chart", "SCB") — compare on significant words.
        const ok =
          got.indexOf(want) !== -1 ||
          want.indexOf(got) !== -1 ||
          want
            .split(/[\s,.-]+/)
            .filter(function (w) {
              return w.length > 2;
            })
            .some(function (w) {
              return got.indexOf(w) !== -1 || w.indexOf(got) !== -1;
            });
        return ok
          ? { ok: true, message: match.intermediary_bank_name + " holds account 6550286074 for EBILAEADXXX USD." }
          : {
              ok: false,
              message: "That account belongs to " + match.intermediary_bank_name + ".",
            };
      },
    });

    // Footer nav → Lab 6
    labNav(main, helpers, "6", "Did It Arrive? Payment Tracking");
  };

  // ===========================================================================
  // LAB 6 — Did It Arrive? Payment Tracking (UETR / SWIFT gpi)
  // ===========================================================================
  LearnLabs["6"] = function (main, helpers) {
    main.dataset.labId = "6";
    const { el, glossify } = helpers;

    const header = el("div", "lab-header");
    header.innerHTML =
      '<div class="lab-badge">Lab 6</div>' +
      "<h1>Did It Arrive? Payment Tracking</h1>" +
      "<p>Follow a payment end-to-end with a UETR and SWIFT gpi.</p>";
    main.appendChild(header);

    // Concept: what is a UETR
    const c1 = el("div", "concept");
    c1.appendChild(el("h2", null, "What is a UETR?"));
    c1.innerHTML += glossify(
      "UETR stands for Unique End-to-End Transaction Reference. It's a 36-character UUID " +
        "(think 8-4-4-4-12 dashes) stamped onto every SWIFT gpi payment. The UETR travels with the " +
        "payment through every hop, so any bank in the chain can report status against the same " +
        "identifier. Before gpi, a payment would vanish into a black box for days; with a UETR, you " +
        "can ask 'where is this?' and get a real answer."
    );
    main.appendChild(c1);

    // Concept: the timeline
    const c2 = el("div", "concept");
    c2.appendChild(el("h2", null, "The timeline"));
    c2.innerHTML += glossify(
      "Each hop emits a status event. A normal happy-path payment moves through these states:" +
        "<br><br><strong>INITIATED</strong> → sender bank has created the payment." +
        "<br><strong>ACCEPTED</strong> → sender bank has accepted and queued it." +
        "<br><strong>IN_PROGRESS</strong> → it's moving through the correspondent chain." +
        "<br><strong>FORWARDED</strong> → an intermediary has passed it to the next bank." +
        "<br><strong>CREDITED</strong> → the beneficiary bank has credited the account (terminal)." +
        "<br><br>Things can also go wrong: a payment can be <strong>REJECTED</strong> (terminal) — " +
        "typically by sanctions screening or a failed compliance check at an intermediary."
    );
    main.appendChild(c2);

    // ── Interactive demo: create a tracked payment ────────
    const demo = el("div", "demo");
    demo.appendChild(el("div", "demo-label", "Interactive · Create a tracked payment"));

    function field(labelText, input, hint) {
      const row = el("div");
      row.style.cssText = "margin-bottom:0.625rem;";
      const lbl = el("div");
      lbl.style.cssText =
        "font-size:0.75rem;color:#57534e;margin-bottom:2px;";
      lbl.textContent = labelText;
      row.appendChild(lbl);
      row.appendChild(input);
      if (hint) {
        const h = el("div", "muted");
        h.style.fontSize = "0.6875rem";
        h.style.marginTop = "2px";
        h.textContent = hint;
        row.appendChild(h);
      }
      return row;
    }

    const oName = document.createElement("input");
    oName.className = "lab-input";
    oName.value = "Bank of America";
    const oBic = document.createElement("input");
    oBic.className = "lab-input";
    oBic.value = "BOFAUS3NXXX";
    const bName = document.createElement("input");
    bName.className = "lab-input";
    bName.value = "Guaranty Trust Bank";
    const bBic = document.createElement("input");
    bBic.className = "lab-input";
    bBic.value = "GTBINGLAXXX";
    const ccy = document.createElement("input");
    ccy.className = "lab-input";
    ccy.value = "USD";
    ccy.style.maxWidth = "120px";
    const amt = document.createElement("input");
    amt.className = "lab-input";
    amt.value = "5000";
    amt.style.maxWidth = "160px";
    const iName = document.createElement("input");
    iName.className = "lab-input";
    iName.value = "Citibank N.A.";
    const iBic = document.createElement("input");
    iBic.className = "lab-input";
    iBic.value = "CITIUS33XXX";

    demo.appendChild(field("Originator bank name", oName));
    demo.appendChild(field("Originator BIC", oBic));
    demo.appendChild(field("Beneficiary bank name", bName));
    demo.appendChild(field("Beneficiary BIC", bBic));
    demo.appendChild(field("Currency", ccy));
    demo.appendChild(field("Amount", amt));
    demo.appendChild(field("Intermediary bank name", iName));
    demo.appendChild(field("Intermediary BIC", iBic));

    const createBtn = el("button", "lab-btn", "Create & Track");
    createBtn.type = "button";
    const demoResult = el("div", "lab-result");
    demo.appendChild(createBtn);
    demo.appendChild(demoResult);
    main.appendChild(demo);

    let lastPayment = null; // captured for the exercise auto-check

    async function doCreate() {
      demoResult.className = "lab-result show";
      demoResult.innerHTML =
        '<span class="muted">Creating payment & generating timeline…</span>';
      try {
        const body = {
          originator_bic: oBic.value.trim(),
          originator_name: oName.value.trim(),
          beneficiary_bic: bBic.value.trim(),
          beneficiary_name: bName.value.trim(),
          currency: ccy.value.trim().toUpperCase(),
          amount: parseFloat(amt.value) || 0,
          charge_code: "SHA",
          intermediary_bics: iBic.value.trim() ? [iBic.value.trim()] : [],
          intermediary_names: iName.value.trim() ? [iName.value.trim()] : [],
        };
        const res = await fetch("/api/track/create", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!res.ok) throw new Error("Create failed (" + res.status + ")");
        const data = await res.json();
        lastPayment = data;
        renderTrack(demoResult, data);
      } catch (e) {
        demoResult.className = "lab-result show lab-result-error";
        demoResult.innerHTML = "<strong>Error.</strong> " + esc(String(e.message || e));
      }
    }

    function renderTrack(into, data) {
      into.className = "lab-result show";
      into.innerHTML = "";

      // UETR banner
      const uetrBox = el("div");
      uetrBox.style.cssText =
        "background:#0f172a;color:#e2e8f0;border-radius:8px;padding:0.75rem 1rem;margin-bottom:1rem;";
      uetrBox.innerHTML =
        '<div style="font-size:0.6875rem;text-transform:uppercase;letter-spacing:0.05em;color:#94a3b8;margin-bottom:4px;">UETR</div>' +
        '<div class="mono" style="font-size:0.875rem;word-break:break-all;">' +
        esc(data.uetr) +
        "</div>";
      into.appendChild(uetrBox);

      // Status + fees summary
      const summary = el("div");
      summary.style.cssText =
        "display:flex;flex-wrap:wrap;gap:0.75rem 1.5rem;margin-bottom:1rem;font-size:0.8125rem;";
      const terminal = data.is_terminal;
      summary.innerHTML =
        '<div><span class="muted">Current status:</span> <span class="badge ' +
        statusBadge(data.current_status) +
        '">' +
        esc(data.current_status) +
        "</span>" +
        (terminal
          ? ' <span class="badge badge-green">terminal</span>'
          : "") +
        "</div>" +
        '<div><span class="muted">Events:</span> ' +
        esc(data.event_count) +
        "</div>" +
        '<div><span class="muted">Sent:</span> <strong>' +
        esc(data.sent_amount || "—") +
        "</strong></div>" +
        '<div><span class="muted">Final:</span> <strong>' +
        esc(data.final_amount || "—") +
        "</strong></div>" +
        '<div><span class="muted">Total fees:</span> <strong style="color:#dc2626;">' +
        (data.total_fees != null
          ? esc(fmtMoney(data.total_fees, data.timeline && data.timeline[0] ? data.timeline[0].currency : ""))
          : "—") +
        "</strong></div>";
      into.appendChild(summary);

      // Timeline — use visualizer if available, otherwise fallback
      if (window.PaymentViz && data.timeline && data.timeline.length) {
        var tlContainer = el("div");
        tlContainer.style.marginTop = "0.5rem";
        into.appendChild(tlContainer);
        PaymentViz.timeline(tlContainer, data.timeline);
      } else {
        // Fallback: simple list
        const tl = el("div");
        tl.style.cssText = "margin-top:0.5rem;";
        (data.timeline || []).forEach(function (ev) {
          const item = el("div", null);
          item.style.cssText = "padding:0.5rem 0;border-bottom:1px solid var(--border);";
          item.innerHTML = '<span class="badge ' + statusBadge(ev.status) + '">' +
            esc(ev.status) + "</span> " +
            '<span style="font-weight:500;">' + esc(ev.bank_name || ev.bank_bic) + "</span>" +
            '<div class="muted" style="font-size:0.75rem;">' + esc(ev.message || "") + "</div>";
          tl.appendChild(item);
        });
        into.appendChild(tl);
      }
    }

    createBtn.addEventListener("click", doCreate);

    // ── Callout: simulation ───────────────────────────────
    const callout = el("div", "callout");
    callout.style.background = "var(--amber-bg)";
    callout.style.borderColor = "#fde68a";
    callout.innerHTML =
      '<div class="callout-title">⚠ This is a simulation</div>' +
      "This timeline is generated locally for learning. Real SWIFT gpi tracking requires SWIFT " +
      "membership, a connection to the gpi tracker gateway, and participating banks that publish " +
      "status updates against the UETR. The UETR format and status flow shown here are accurate to " +
      "the gpi spec.";
    main.appendChild(callout);

    // ── Exercise: what was deducted ───────────────────────
    buildExercise(main, helpers, {
      title: "What was deducted?",
      prompt:
        "In the payment you just created, how much was deducted in fees? (Hint: it's the difference " +
        "between the sent amount and the final amount.)",
      placeholder: "Fee amount (e.g. 12.50)",
      hint:
        "Create & Track a payment above, then read the 'Total fees' value from the summary. If you haven't created one yet, do that first.",
      checker: async function (val) {
        if (!lastPayment) {
          return {
            ok: false,
            message:
              "Create & Track a payment above first — then come back and enter the fee amount it reported.",
          };
        }
        if (!val) return { ok: false, message: "Type the fee amount you saw." };
        const n = parseFloat(val);
        if (!isFinite(n)) return { ok: false, message: "Enter a number." };
        const fees = Number(lastPayment.total_fees);
        if (!isFinite(fees)) {
          return { ok: false, message: "The last payment didn't report a fee total." };
        }
        const ok = Math.abs(n - fees) < 0.011; // tolerant to 2dp rounding
        return ok
          ? {
              ok: true,
              message:
                "Correct — total fees were " +
                fmtMoney(fees) +
                " (sent " +
                esc(lastPayment.sent_amount || "—") +
                ", final " +
                esc(lastPayment.final_amount || "—") +
                ").",
            }
          : {
              ok: false,
              message:
                "The last payment's total fees were " +
                fmtMoney(fees) +
                ". (Compare sent vs. final amount.)",
            };
      },
    });

    // Footer nav → Capstone
    labNav(main, helpers, "capstone", "Capstone: Full Payment");
  };
})();
