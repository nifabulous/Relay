/*
 * Case Studies — "When Payments Go Wrong"
 *
 * Four real-world payment incidents, each broken into a consistent five-part
 * structure: what happened, why it was possible, how to prevent it, the lesson,
 * and the lab it ties back to. The thesis is that SWIFT almost never breaks —
 * what breaks is the data, which is exactly what the rest of the lab teaches
 * you to read.
 *
 * Pure frontend: no API calls. All case data is embedded in CASES below.
 *
 * Loaded after glossary.js + visualizers.js, before learn.js.
 */
window.LearnLabs = window.LearnLabs || {};

(function () {
  "use strict";

  var esc = LearnUtils.esc;

  // ── Embedded case data ────────────────────────────────────────────────
  // severity: "red" for fraud / sanctions, "amber" for fees / misdirection.
  // Each prevention item links to a lab via `lab` (hash) + `labLabel`.
  var CASES = [
    {
      id: "citi-revlon",
      title: "The $900M Mistake",
      org: "Citibank / Revlon",
      year: "2020",
      category: "Misdirected payment",
      severity: "amber",
      summary:
        "A bank meant to send $7.8M in interest and accidentally sent $900M of principal. Every message was perfectly valid.",
      whatHappened: [
        "In August 2020, Citibank \u2014 acting as administrative agent for a Revlon loan \u2014 meant to wire about $7.8 million in interest payments to the syndicate of lenders. Instead, it accidentally transferred roughly $900 million: the entire principal of the loan, repaid in full years early.",
        "Three employees, including a manager, executed the payment through their core banking system. They believed a single checkbox controlled whether internal sub-accounts or real SWIFT messages moved the money. It controlled the SWIFT messages. The system generated perfectly formatted payment instructions and sent them.",
        "Several lenders returned the windfall, but a few refused, arguing it looked like a genuine early repayment. Citi sued to recover the funds and, in February 2021, lost in federal court: the judge ruled the transfers were valid and the holdouts could keep the money. The OCC later fined Citi $400 million for broader risk-management failures."
      ],
      whyPossible:
        "There was no control between the intent (\u201Csend the interest\u201D) and the message the system actually generated. The payment instructions were format-valid \u2014 correct BICs, valid field structure, proper amounts in the proper fields \u2014 so every validation check passed. The system verified the syntax of the message; nobody verified its business meaning. A message can be 100% compliant with the SWIFT standard and still say the wrong thing.",
      prevention: [
        {
          text: "Require dual-control (maker/checker) on any payment above a value threshold \u2014 two separate humans must approve, and the checker must see the amount in plain language.",
          lab: "#mt103",
          labLabel: "MT103 Decoder"
        },
        {
          text: "Validate the message\u2019s business intent against the original instruction \u2014 not just whether the fields are well-formed.",
          lab: "#mt103",
          labLabel: "MT103 Decoder"
        },
        {
          text: "Gate large-value sends behind a confirmation step that re-states the amount and beneficiary, so a typo can\u2019t silently become nine figures.",
          lab: "#mt103",
          labLabel: "MT103 Decoder"
        }
      ],
      lesson:
        "A valid message can still be wrong. Format checks confirm the data is shaped correctly; they can never confirm it says what you meant.",
      related: { lab: "#mt103", label: "MT103 Message Decoder", quote: "a valid message can still be wrong" }
    },
    {
      id: "bnp-paribas",
      title: "Wire Stripping at Scale",
      org: "BNP Paribas",
      year: "2014",
      category: "Sanctions evasion",
      severity: "red",
      summary:
        "A bank processed ~$190B for sanctioned countries by stripping the party data out of SWIFT messages before they reached the screeners.",
      whatHappened: [
        "In June 2014, BNP Paribas pleaded guilty to violating U.S. sanctions against Sudan, Iran, and Cuba, and agreed to pay $8.9 billion \u2014 one of the largest sanctions penalties in history. Between 2004 and 2012 the bank processed roughly $190 billion in transactions tied to sanctioned entities, many of them Sudanese oil deals routed through U.S. correspondent banks.",
        "The method was \u201Cwire stripping.\u201D Employees removed, omitted, or falsified the identifying information in SWIFT messages \u2014 originator names, bank identifiers, routing codes \u2014 so that when the payment reached a U.S. correspondent bank (the bank legally required to screen for sanctions), there was nothing left to match against the watchlist.",
        "They also routed payments through non-U.S. branches and used \u201Csatellite\u201D accounts to keep the transactions off the screening path entirely. The U.S. banks in the chain screened what arrived. What arrived had been scrubbed clean."
      ],
      whyPossible:
        "Sanctions screening can only catch what the fields say. The screener sits downstream of the data. If the originator name is falsified or deleted before the message reaches the screener, the screener runs its match, finds nothing, and returns CLEAR \u2014 correctly, against the data it was given. The compliance gap was treating message data as ground truth instead of cross-checking it against KYC records and the underlying commercial contracts.",
      prevention: [
        {
          text: "Cross-check message party data against KYC records and underlying contracts \u2014 never trust a field just because it parsed.",
          lab: "#sanctions",
          labLabel: "Sanctions Screening"
        },
        {
          text: "Screen every party field at every hop, and treat a field that was altered or left blank after the first hop as a red flag.",
          lab: "#sanctions",
          labLabel: "Sanctions Screening"
        },
        {
          text: "Reconcile the payment narrative against the SWIFT message end-to-end, so a stripped name can\u2019t slip past the next bank undetected.",
          lab: "#sanctions",
          labLabel: "Sanctions Screening"
        }
      ],
      lesson:
        "Screening can only catch what the fields say. If the data is falsified before it reaches the screener, the cleanest compliance engine in the world will still say CLEAR.",
      related: { lab: "#sanctions", label: "Sanctions Screening", quote: "screening can only catch what the fields say" }
    },
    {
      id: "state-street",
      title: "The Hidden FX Markup",
      org: "State Street",
      year: "2017",
      category: "Fee transparency",
      severity: "amber",
      summary:
        "A custodian charged undisclosed FX markups by hiding the cost inside the exchange rate \u2014 not on any fee line.",
      whatHappened: [
        "In 2017, State Street Corporation agreed to pay a $32.6 million penalty to settle SEC charges that it overcharged custody clients \u2014 mostly pension funds \u2014 on foreign exchange transactions. The conduct ran for roughly fifteen years, from 1998 to 2013.",
        "Clients were told they would receive the best available rate. Instead, the bank applied undisclosed markups to the prevailing end-of-day exchange rate \u2014 the least favorable point in the trading day \u2014 and kept the difference between that rate and the interbank (mid-market) rate.",
        "The cost never appeared on an invoice. There was no \u201CFX fee\u201D line. The money was taken entirely inside the exchange rate itself, so a client comparing fee schedules would have seen State Street as cheap while paying more in total."
      ],
      whyPossible:
        "The cost lived in the exchange rate, not on any fee line. An exchange rate is just a number; nothing in a statement tells you whether it\u2019s fair. Without an independent benchmark to compare it against, the markup is invisible \u2014 the client sees a rate, the bank sees a margin, and there is no line item that ever spells out the difference.",
      prevention: [
        {
          text: "Always compare the offered rate to a transparent mid-market benchmark before accepting the conversion.",
          lab: "#fx",
          labLabel: "FX Calculator"
        },
        {
          text: "Require the FX margin to be disclosed as a line item, in basis points, rather than hidden inside the rate.",
          lab: "#fx",
          labLabel: "FX Calculator"
        },
        {
          text: "Use an independent rate feed \u2014 never let the bank that sets the rate also be the only party measuring whether it was fair.",
          lab: "#fx",
          labLabel: "FX Calculator"
        }
      ],
      lesson:
        "The spread is the hidden cost. \u201CZero fees\u201D is a marketing claim; the real price is the gap between the rate you\u2019re quoted and the rate the market actually trades at.",
      related: { lab: "#fx", label: "FX Calculator", quote: "the spread is the hidden cost" }
    },
    {
      id: "app-fraud",
      title: "The Intercepted Deposit",
      org: "APP fraud (representative)",
      year: "ongoing",
      category: "Payee verification",
      severity: "red",
      summary:
        "A fraudster spoofed a solicitor\u2019s email, sent fake bank details, and the buyer wired a house deposit to the wrong account.",
      whatHappened: [
        "This is a representative version of Authorised Push Payment (APP) fraud \u2014 the classic \u201CFriday afternoon\u201D conveyancing scam, played out thousands of times a year. A fraudster intercepts or spoofs a solicitor\u2019s email and tells a homebuyer the firm\u2019s bank details have changed. \u201CPlease wire your deposit to the new account.\u201D",
        "The buyer recognises the email, trusts the sender, and authorises the transfer. The account number and sort code are real \u2014 they belong to a money-mule the fraudster controls. The payment is fully authorised by the victim, the details are valid, and the money leaves the account in minutes.",
        "By the time anyone notices, the funds have been split and moved on. There is no \u201Chack\u201D of the bank. The payment system did exactly what it was told. What was missing was any check that the person named in the email was the same person named on the destination account."
      ],
      whyPossible:
        "There was no payee verification between \u201CI recognised the email\u201D and \u201Cthe money left.\u201D The customer authorised the payment based on the apparent identity of the requester, not the verified identity of the account holder. Nothing in the standard payment flow compared the name on the destination account to the name the customer thought they were paying \u2014 so a valid account number belonging to the wrong person was enough.",
      prevention: [
        {
          text: "Run Confirmation of Payee / Verification of Payee before sending \u2014 the solicitor\u2019s name would not have matched, and the check would have returned NO_MATCH.",
          lab: "#lab-3",
          labLabel: "Verification of Payee"
        },
        {
          text: "Verify any \u201Cnew\u201D or \u201Cupdated\u201D account details out-of-band \u2014 call the firm on a number you already had, not one in the email.",
          lab: "#lab-3",
          labLabel: "Verification of Payee"
        },
        {
          text: "Treat any email requesting an account change as a fraud signal until it is confirmed independently.",
          lab: "#lab-3",
          labLabel: "Verification of Payee"
        }
      ],
      lesson:
        "A name check would have stopped it. The payment was authorised, the details were valid \u2014 but the account didn\u2019t belong to who the customer thought it did.",
      related: { lab: "#lab-3", label: "Verification of Payee", quote: "a name check would have stopped it" }
    }
  ];

  // ── Exercise: symptom tickets ─────────────────────────────────────────
  // Each ticket is a symptom; the learner picks the root cause from four
  // options (one correct, three distractors). `correct` is the index into opts.
  var TICKETS = [
    {
      id: "t-fx",
      symptom:
        "A customer sent \u20AC50,000 to a supplier. The supplier received \u20AC48,200. The only fee line on the receipt shows \u20AC15.",
      opts: [
        "Hidden FX spread \u2014 the cost is in the exchange rate, not the fee line",
        "Lift fees at intermediary banks ate the difference",
        "A sanctions hold deducted the funds mid-chain",
        "The wrong beneficiary received part of the payment"
      ],
      correct: 0,
      explain:
        "Roughly \u20AC1,800 unaccounted for but only \u20AC15 in fees? The gap is the FX margin baked into the rate. Lift fees would each appear on their own fee line; a sanctions hold blocks a payment rather than trimming it; and a wrong beneficiary would change who got paid, not how much. Revisit the FX Calculator.",
      lab: "#fx"
    },
    {
      id: "t-misdirect",
      symptom:
        "A payment was sent to a known supplier. The BIC and IBAN are valid and pass every checksum. But the money landed at the wrong beneficiary.",
      opts: [
        "Hidden FX spread changed the destination",
        "Misdirected payment \u2014 the message was format-valid but business-wrong",
        "A sanctions hit redirected the funds",
        "The IBAN failed its checksum"
      ],
      correct: 1,
      explain:
        "A valid BIC/IBAN plus a wrong beneficiary is the signature of misdirection: a syntactically correct message carrying the wrong account intent. FX spreads change amounts, not destinations; sanctions blocks rather than reroutes; and the checksum passed, so the IBAN was structurally fine. Revisit the MT103 Decoder.",
      lab: "#mt103"
    },
    {
      id: "t-sanctions",
      symptom:
        "A USD payment stalled mid-chain. An intermediary bank flagged the originator\u2019s name and held it for review.",
      opts: [
        "Sanctions screening hit \u2014 the name matched a watchlist",
        "Hidden FX spread caused the hold",
        "Misdirection \u2014 wrong beneficiary",
        "APP fraud \u2014 an intercepted email"
      ],
      correct: 0,
      explain:
        "A mid-chain hold triggered by an originator name is a sanctions REVIEW. Every bank in the chain screens party names against consolidated watchlists. FX spreads and misdirection don\u2019t cause holds; APP fraud is about who authorised the payment, not the routing. Revisit the Sanctions Screening lab.",
      lab: "#sanctions"
    },
    {
      id: "t-app",
      symptom:
        "A customer wired a house deposit to the \u201Cnew\u201D account number that came from their solicitor\u2019s email. The name on the destination account didn\u2019t match the solicitor\u2019s.",
      opts: [
        "Misdirected payment \u2014 the message was valid but went to the wrong bank",
        "Sanctions hit on the solicitor",
        "APP fraud \u2014 no payee verification; CoP/VoP would have returned NO_MATCH",
        "Hidden FX spread on the deposit"
      ],
      correct: 2,
      explain:
        "A \u201Cnew\u201D account from an email, with a name that doesn\u2019t match, is textbook APP fraud. The victim authorised it because they trusted the email, not the verified account holder. A Confirmation/Verification of Payee check would have flagged NO_MATCH before the money moved. Revisit the Verification of Payee lab.",
      lab: "#lab-3"
    }
  ];

  // ── small helpers ─────────────────────────────────────────────────────
  function shuffle(arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = a[i]; a[i] = a[j]; a[j] = tmp;
    }
    return a;
  }

  function severityBadge(sev) {
    if (sev === "red") {
      return '<span class="badge badge-red">High severity</span>';
    }
    return '<span class="badge badge-amber">Medium severity</span>';
  }

  LearnLabs["cases"] = function (main, helpers) {
    var el = helpers.el;
    var glossify = helpers.glossify;
    var markComplete = helpers.markComplete;
    var getProgress = helpers.getProgress;

    var alreadyDone = getProgress().indexOf("cases") !== -1;

    // ── HEADER ────────────────────────────────────────────────────────────
    var header = el("div", "lab-header");
    header.innerHTML =
      '<div class="lab-badge">Case Studies</div>' +
      "<h1>When Payments Go Wrong</h1>" +
      "<p>Four real incidents. Each one was a payment that was <em>sent successfully</em> " +
      "and still went wrong.</p>";
    main.appendChild(header);

    // ── THESIS CALLOUT ────────────────────────────────────────────────────
    var thesis = el("div", "callout");
    thesis.innerHTML =
      '<div class="callout-title">\uD83D\uDCA1 The thesis</div>' +
      "The SWIFT network almost never breaks. What breaks is the data \u2014 and the " +
      "data is what you\u2019ve been learning to read. Every case below is a reminder that " +
      "a payment can clear every format check, pass every checksum, and arrive exactly " +
      "where the message said, and still be the wrong payment.";
    main.appendChild(thesis);

    // ── STAGE: index view ↔ detail view ───────────────────────────────────
    // The stage holds either the case index or a selected case detail. The
    // exercise and completion block live below the stage so they stay put.
    var stage = el("div", "cases-stage");
    main.appendChild(stage);

    function renderIndex() {
      stage.innerHTML = "";

      var intro = el("div", "concept");
      intro.innerHTML =
        "<h2>Pick a case</h2>" +
        "<p>Four incidents. Two are about money going to the wrong place (a misdirected " +
        "principal, an intercepted deposit); one is about money moving that should never " +
        "have moved (sanctions evasion); one is about money quietly shrinking in transit " +
        "(a hidden FX markup). Each links back to the lab that teaches the skill that " +
        "would have caught it.</p>";
      stage.appendChild(intro);

      var list = el("div", "lab-path");
      CASES.forEach(function (c, i) {
        var card = el("a", "lab-path-item");
        card.href = "#";
        card.setAttribute("data-case", esc(c.id));
        card.innerHTML =
          '<div class="lab-path-num">' + esc(String(i + 1)) + "</div>" +
          '<div class="lab-path-body">' +
            '<h3>' + esc(c.title) + " <span class=\"muted\" style=\"font-weight:400\">(" + esc(c.year) + ")</span></h3>" +
            "<p>" + esc(c.summary) + "</p>" +
            '<div class="lab-path-time" style="display:flex;align-items:center;gap:0.5rem;flex-wrap:wrap">' +
              '<span class="mono" style="font-size:0.6875rem">' + esc(c.category) + "</span>" +
              severityBadge(c.severity) +
              "<span style=\"color:var(--accent);font-weight:600\">Read case \u2192</span>" +
            "</div>" +
          "</div>";
        card.addEventListener("click", function (e) {
          e.preventDefault();
          renderDetail(c.id);
          window.scrollTo(0, 0);
        });
        list.appendChild(card);
      });
      stage.appendChild(list);
    }

    function findCase(id) {
      for (var i = 0; i < CASES.length; i++) {
        if (CASES[i].id === id) return CASES[i];
      }
      return null;
    }

    function renderDetail(id) {
      var c = findCase(id);
      if (!c) { renderIndex(); return; }
      stage.innerHTML = "";

      // Title block.
      var titleBlock = el("div", "lab-header");
      titleBlock.style.marginBottom = "1rem";
      titleBlock.innerHTML =
        '<div class="lab-badge">' + esc(c.category) + "</div>" +
        "<h1>" + esc(c.title) + "</h1>" +
        '<p class="muted">' + esc(c.org) + " \u00B7 " + esc(c.year) +
        " &nbsp;" + severityBadge(c.severity) + "</p>";
      stage.appendChild(titleBlock);

      // What happened.
      var happened = el("div", "concept");
      happened.innerHTML =
        "<h2>What happened</h2>" +
        c.whatHappened.map(function (p) {
          return "<p>" + esc(p) + "</p>";
        }).join("");
      stage.appendChild(happened);

      // Why it was possible.
      var why = el("div", "concept");
      why.innerHTML =
        "<h2>Why it was possible</h2>" +
        "<p>" + esc(c.whyPossible) + "</p>";
      stage.appendChild(why);

      // How to prevent (checklist linking to labs).
      var prev = el("div", "concept");
      var checks = c.prevention.map(function (item) {
        return (
          '<li style="margin-bottom:0.5rem">' +
            '<span style="color:var(--green);font-weight:700">\u2713</span> ' +
            esc(item.text) +
            ' <a class="mono" href="' + esc(item.lab) + '" style="color:var(--accent);font-size:0.8125rem">' +
            "\u2192 " + esc(item.labLabel) + "</a>" +
          "</li>"
        );
      }).join("");
      prev.innerHTML =
        "<h2>How to prevent it</h2>" +
        '<p class="muted" style="font-size:0.875rem;margin-top:0">Each control maps back to a lab you\u2019ve already done (or can do next).</p>' +
        '<ul style="font-size:0.9375rem;padding-left:0;list-style:none;margin-top:0.5rem">' +
          checks +
        "</ul>";
      stage.appendChild(prev);

      // The lesson callout.
      var lesson = el("div", "callout");
      lesson.innerHTML =
        '<div class="callout-title">The lesson</div>' +
        "<strong>" + esc(c.lesson) + "</strong>" +
        '<p style="margin:0.5rem 0 0;font-size:0.875rem">' +
          "See this in action in the " +
          '<a href="' + esc(c.related.lab) + '" style="color:var(--accent);font-weight:600">' +
          esc(c.related.label) + "</a> lab \u2014 \u201C" + esc(c.related.quote) + ".\u201D" +
        "</p>";
      stage.appendChild(lesson);

      // Back to all cases.
      var backWrap = el("div");
      backWrap.style.marginTop = "1rem";
      var backBtn = el("button", "lab-btn secondary", "\u2190 Back to all cases");
      backBtn.type = "button";
      backBtn.addEventListener("click", function () {
        renderIndex();
        window.scrollTo(0, 0);
      });
      backWrap.appendChild(backBtn);
      stage.appendChild(backWrap);
    }

    renderIndex();

    // ── EXERCISE: Incident Investigator ───────────────────────────────────
    var exercise = el("div", "exercise");
    exercise.innerHTML =
      '<div class="exercise-header">' +
        '<span class="exercise-badge">\uD83D\uDD0D</span>' +
        '<span class="exercise-title">Exercise: Incident Investigator</span>' +
      "</div>" +
      '<p class="exercise-prompt">' +
        "You\u2019re on the support desk. Four symptom tickets have come in. For each one, " +
        "pick the root cause from the options. Tickets are shuffled each time you load." +
      "</p>";
    var ticketsHost = el("div");
    ticketsHost.id = "cases-tickets";
    exercise.appendChild(ticketsHost);
    main.appendChild(exercise);

    // Track how many tickets have been answered correctly. The complete button
    // enables once at least one has been solved.
    var solvedCount = 0;
    var solvedSet = {};

    function renderTickets() {
      ticketsHost.innerHTML = "";
      var order = shuffle(TICKETS);

      order.forEach(function (ticket, idx) {
        var card = el("div", "callout");
        card.style.marginTop = "0.75rem";
        card.style.padding = "1rem 1.25rem";

        var ticketNum = el("div", "callout-title");
        ticketNum.textContent = "Ticket #" + (idx + 1);
        card.appendChild(ticketNum);

        var symptom = el("p");
        symptom.style.margin = "0.25rem 0 0.75rem";
        symptom.textContent = ticket.symptom;
        card.appendChild(symptom);

        var optsWrap = el("div");
        optsWrap.className = "cases-opts";
        card.appendChild(optsWrap);

        // Present the four options in their given order (distractor order is
        // part of the design); only the tickets themselves are shuffled.
        ticket.opts.forEach(function (opt, i) {
          var btn = el("button", "scheme-quiz-option");
          btn.type = "button";
          btn.style.textAlign = "left";
          btn.textContent = "(" + String.fromCharCode(97 + i) + ") " + opt;
          btn.addEventListener("click", function () {
            if (solvedSet[ticket.id]) return; // lock once solved
            optsWrap.querySelectorAll("button").forEach(function (b) { b.disabled = true; });
            var isCorrect = i === ticket.correct;
            if (isCorrect) {
              btn.classList.add("correct");
              if (!solvedSet[ticket.id]) {
                solvedSet[ticket.id] = true;
                solvedCount++;
                maybeEnableComplete();
              }
            } else {
              btn.classList.add("wrong");
              // Reveal the correct option.
              optsWrap.querySelectorAll("button").forEach(function (b, j) {
                if (j === ticket.correct) b.classList.add("correct");
              });
            }
            var result = el("div", "lab-result show " + (isCorrect ? "lab-result-success" : "lab-result-error"));
            result.style.marginTop = "0.5rem";
            result.innerHTML =
              (isCorrect
                ? '<div class="badge badge-green">Correct</div> '
                : '<div class="badge badge-red">Not quite</div> ') +
              "<p style=\"margin:0.5rem 0 0\">" + esc(ticket.explain) + "</p>" +
              '<p style="margin:0.25rem 0 0"><a href="' + esc(ticket.lab) +
              '" style="color:var(--accent);font-size:0.8125rem;font-weight:600">Open the related lab \u2192</a></p>';
            card.appendChild(result);

            // A retry control for wrong answers (lets the learner keep going).
            if (!isCorrect) {
              var retry = el("button", "lab-btn secondary", "Try this ticket again");
              retry.type = "button";
              retry.style.marginTop = "0.5rem";
              retry.addEventListener("click", function () {
                result.className = "lab-result";
                result.innerHTML = "";
                if (result.parentNode) result.parentNode.removeChild(result);
                if (retry.parentNode) retry.parentNode.removeChild(retry);
                optsWrap.querySelectorAll("button").forEach(function (b) {
                  b.disabled = false;
                  b.classList.remove("correct", "wrong");
                });
              });
              card.appendChild(retry);
            }
          });
          optsWrap.appendChild(btn);
        });

        ticketsHost.appendChild(card);
      });
    }

    renderTickets();

    // ── COMPLETE BUTTON ───────────────────────────────────────────────────
    var completeWrap = el("div");
    completeWrap.style.marginTop = "2rem";

    var completePrompt = el("div", "muted");
    completePrompt.style.fontSize = "0.8125rem";
    completePrompt.style.marginBottom = "0.5rem";
    completePrompt.textContent =
      "Solve at least one Incident Investigator ticket to mark this lab complete.";
    completeWrap.appendChild(completePrompt);

    var completeBtn = el("button", "lab-btn", alreadyDone ? "Mark as complete \u2713" : "Mark lab complete");
    completeBtn.type = "button";
    if (alreadyDone) completeBtn.disabled = true;
    // Disabled until at least one exercise is solved (unless already done).
    if (!alreadyDone) completeBtn.disabled = true;
    completeWrap.appendChild(completeBtn);

    var completeMsg = el("div", "lab-result");
    completeWrap.appendChild(completeMsg);
    main.appendChild(completeWrap);

    if (alreadyDone) {
      completeMsg.className = "lab-result show lab-result-success";
      completeMsg.innerHTML =
        '<div class="badge badge-green">Completed</div> You\u2019ve finished the case studies. ' +
        "You can now spot the difference between a payment that broke, a payment that was " +
        "valid but wrong, and a payment that was honest but expensive.";
      completePrompt.textContent = "";
    }

    function maybeEnableComplete() {
      if (alreadyDone) return;
      if (solvedCount >= 1) {
        completeBtn.disabled = false;
        completePrompt.textContent =
          "Nice \u2014 you\u2019ve diagnosed a ticket. Finish the rest if you like, then mark the lab complete.";
      }
    }

    completeBtn.addEventListener("click", function () {
      if (completeBtn.disabled) return;
      markComplete("cases");
      alreadyDone = true;
      completeBtn.disabled = true;
      completeBtn.textContent = "Mark as complete \u2713";
      completePrompt.textContent = "";
      completeMsg.className = "lab-result show lab-result-success";
      completeMsg.innerHTML =
        '<div class="badge badge-green">Lab complete!</div> Four incidents, one pattern: the ' +
        "payment system did exactly what it was told. The skill is reading the data well enough " +
        "to know whether what it was told was right.";
    });

    // ── LAB NAVIGATION ────────────────────────────────────────────────────
    var nav = el("div", "lab-nav");
    var backToLabs = el("a", "", "\u2190 Back to labs");
    backToLabs.href = "#";
    var toGlossary = el("a", "", "Glossary \u2192");
    toGlossary.href = "#glossary";
    nav.appendChild(backToLabs);
    nav.appendChild(toGlossary);
    main.appendChild(nav);
  };
})();
