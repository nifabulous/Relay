/*
 * Settlement Cycles — "Why a Friday Payment Arrives Tuesday"
 *
 * Teaches the gap between the day you hit send (trade date) and the day the
 * money is actually good (value date). The flagship interaction is a
 * day-by-day calendar strip backed by POST /api/value-date, showing how
 * cut-off times, weekends, holidays and settlement lag (T+0/T+1/T+2) roll
 * a payment forward. Three scenario quizzes anchor the idea.
 *
 * Loaded after glossary.js + visualizers.js, before learn.js.
 */
window.LearnLabs = window.LearnLabs || {};

(function () {
  "use strict";

  var esc = LearnUtils.esc;

  // ── rail → (scheme, currency, instant?) map ────────────────────────────
  // The rail is the primary control: clicking one sets the scheme param and
  // syncs the currency select to the rail's home currency.
  var RAILS = [
    { key: "fps",   label: "FPS (instant)",      scheme: "faster payments",      currency: "GBP", instant: true  },
    { key: "chaps", label: "CHAPS (same-day)",   scheme: "chaps",                currency: "GBP", instant: false },
    { key: "sepa",  label: "SEPA SCT (T+1)",     scheme: "sepa credit transfer", currency: "EUR", instant: false },
    { key: "spot",  label: "Spot (T+2)",         scheme: "spot",                 currency: "USD", instant: false },
  ];

  // ── send-day pills (real 2026 dates; 2026-07-13 is a Monday) ────────────
  var DAYS = [
    { key: "M",  label: "M",  iso: "2026-07-13" },
    { key: "Tu", label: "T",  iso: "2026-07-14" },
    { key: "W",  label: "W",  iso: "2026-07-15" },
    { key: "Th", label: "Th", iso: "2026-07-16" },
    { key: "F",  label: "F",  iso: "2026-07-17" },
    { key: "Sa", label: "S",  iso: "2026-07-18" },
    { key: "Su", label: "S",  iso: "2026-07-19" },
  ];

  var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
                "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  var DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  // ── date helpers (local-time construction avoids UTC off-by-one) ────────
  function parseISO(iso) {
    var p = String(iso).split("-");
    return new Date(parseInt(p[0], 10), parseInt(p[1], 10) - 1, parseInt(p[2], 10));
  }
  function toISO(d) {
    var y = d.getFullYear();
    var m = String(d.getMonth() + 1).padStart(2, "0");
    var day = String(d.getDate()).padStart(2, "0");
    return y + "-" + m + "-" + day;
  }
  function isWeekend(d) { var g = d.getDay(); return g === 0 || g === 6; }
  function addDays(d, n) { var x = new Date(d.getTime()); x.setDate(x.getDate() + n); return x; }

  // slider minutes-of-day → "HH:MM"
  function minToHHMM(min) {
    var h = Math.floor(min / 60);
    var m = min % 60;
    return String(h).padStart(2, "0") + ":" + String(m).padStart(2, "0");
  }
  // "17:00" → minutes-of-day (tolerant)
  function hhmmToMin(s) {
    var p = String(s || "").split(":");
    if (p.length < 2 || !isFinite(+p[0]) || !isFinite(+p[1])) return null;
    return parseInt(p[0], 10) * 60 + parseInt(p[1], 10);
  }

  LearnLabs["settlement"] = function (main, helpers) {
    var el = helpers.el;
    var glossify = helpers.glossify;
    var markComplete = helpers.markComplete;
    var getProgress = helpers.getProgress;

    // ── mutable demo state ────────────────────────────────────────────────
    var state = {
      railKey: "spot",        // default → reproduces the "Friday→Tuesday" headline
      dayIso: "2026-07-17",   // Friday
      minutes: 930,           // 15:30 — before the 17:00 USD cut-off
      currency: "USD",        // synced to the rail, but user-overridable
      hasResult: false,
    };

    function currentRail() {
      for (var i = 0; i < RAILS.length; i++) if (RAILS[i].key === state.railKey) return RAILS[i];
      return RAILS[RAILS.length - 1];
    }

    // ── HEADER ────────────────────────────────────────────────────────────
    var header = el("div", "lab-header");
    header.innerHTML =
      '<div class="lab-badge">Settlement Lab</div>' +
      "<h1>Settlement Cycles: Why a Friday Payment Arrives Tuesday</h1>" +
      "<p>You hit send on Friday. The money lands on Tuesday. Where was it for " +
      "four days? The answer is the gap between " +
      "<strong>trade date</strong> (when you sent it) and " +
      "<strong>value date</strong> (when it\u2019s actually good) \u2014 and the " +
      "cut-offs, weekends and holidays that sit between them.</p>";
    main.appendChild(header);

    // ── CONCEPT 1: Value date vs trade date ────────────────────────────────
    var c1 = el("div", "concept");
    c1.innerHTML =
      "<h2>Value date vs trade date</h2>" +
      "<p>" + glossify(
        "Two dates matter for every payment. The trade date is the day you " +
        "instruct the payment \u2014 the day it leaves your hands. The value date " +
        "is the day the money is actually good and usable at the other end. " +
        "The gap between them is the settlement lag, written as T+N \u2014 " +
        "\u201Ctrade date plus N business days.\u201D"
      ) + "</p>" +
      '<ul style="font-size:0.9375rem;padding-left:1.5rem;margin-top:0.5rem">' +
        "<li><strong>T+0</strong> \u2014 same day. The beneficiary can use the money on the " +
        "trade date itself. Instant rails (Faster Payments, UPI) and same-day gross " +
        "settlement systems (CHAPS, Fedwire, TARGET2) all settle at T+0.</li>" +
        "<li><strong>T+1</strong> \u2014 one business day later. SEPA Credit Transfers and " +
        "many ACH-style batch rails work on T+1.</li>" +
        "<li><strong>T+2</strong> \u2014 two business days later. This is the cross-border " +
        "default: classic SWIFT MT103 and spot FX settlement. The legacy Bacs " +
        "direct-credit cycle in the UK is also T+2.</li>" +
      "</ul>" +
      '<p class="muted" style="font-size:0.8125rem;margin-top:0.5rem">' +
        "<strong>Value date = when the money is really there.</strong> Until the value " +
        "date, the payment is in flight \u2014 instructed, maybe even debited from the " +
        "sender, but not yet spendable by the recipient." +
      "</p>";
    main.appendChild(c1);

    // ── CONCEPT 2: What skips a day ────────────────────────────────────────
    var c2 = el("div", "concept");
    c2.innerHTML =
      "<h2>What skips a day</h2>" +
      "<p>" + glossify(
        "Three things push a value date forward, and only the first one is obvious:"
      ) + "</p>" +
      '<ul style="font-size:0.9375rem;padding-left:1.5rem;margin-top:0.5rem">' +
        "<li><strong>Weekends.</strong> Settlement systems don\u2019t open on Saturday " +
        "and Sunday (most of them). A Friday T+2 payment can\u2019t settle on Sunday \u2014 " +
        "it rolls past the weekend to Tuesday.</li>" +
        "<li><strong>Holidays.</strong> Each currency has its own holiday calendar. " +
        "USD honours US bank holidays, EUR follows the TARGET2 calendar, GBP follows " +
        "the UK. A holiday in the currency\u2019s calendar skips just like a weekend.</li>" +
        "<li><strong>Cut-off times.</strong> Every settlement system has a daily cut-off. " +
        "Send after the cut-off and the trade date itself rolls forward to the next " +
        "business day \u2014 before the settlement lag is even applied.</li>" +
      "</ul>" +
      '<p style="font-size:0.9375rem">' +
        "<strong>\u201CBusiness days\u201D are currency-specific.</strong> A USD business day " +
        "is not the same as a GBP business day \u2014 they have different holidays and " +
        "different cut-off times. That\u2019s why the same SWIFT message can settle on " +
        "different days depending on the currency." +
      "</p>" +
      '<div class="callout" style="margin-top:0.75rem;padding:0.625rem 0.875rem">' +
        '<div class="callout-title">The Friday \u2192 Tuesday example</div>' +
        "Send a USD spot (T+2) payment on <strong>Friday afternoon, before the 17:00 " +
        "cut-off</strong>. Trade date = Friday. Add two business days: Saturday and " +
        "Sunday don\u2019t count, so you land on <strong>Tuesday</strong>. Four calendar " +
        "days elapsed \u2014 but only two <em>business</em> days. The money was never lost; " +
        "it was waiting out the weekend." +
      "</div>";
    main.appendChild(c2);

    // ── INTERACTIVE DEMO: When does it arrive? ────────────────────────────
    var demo = el("div", "demo");
    demo.innerHTML =
      '<div class="demo-label">When does it arrive?</div>' +
      '<p class="muted" style="font-size:0.875rem;margin-bottom:0.75rem">' +
        "Pick a rail, a send day and a send time, then predict the value date. " +
        "The strip below shows every day the payment passes through \u2014 " +
        "<strong>TRADE</strong> in blue, <strong>SKIP</strong> in grey, <strong>VALUE</strong> in green." +
      "</p>" +

      // Rail selector
      '<div style="margin-bottom:0.75rem">' +
        '<label class="muted" style="font-size:0.75rem;display:block;margin-bottom:0.25rem">Rail</label>' +
        '<div class="fee-seg-control" id="stl-rail-seg">' +
          RAILS.map(function (r) {
            return '<button type="button" class="fee-seg-btn' + (r.key === state.railKey ? " active" : "") +
              '" data-rail="' + r.key + '">' + esc(r.label) + "</button>";
          }).join("") +
        "</div>" +
      "</div>" +

      // Send day + send time + currency
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:0.75rem;margin-bottom:0.75rem">' +
        "<div>" +
          '<label class="muted" style="font-size:0.75rem;display:block;margin-bottom:0.25rem">Send day</label>' +
          '<div class="stl-day-row" id="stl-day-row" style="display:flex;gap:0.25rem;flex-wrap:wrap">' +
            DAYS.map(function (d) {
              return '<button type="button" class="fee-seg-btn stl-day-btn' +
                (d.iso === state.dayIso ? " active" : "") +
                '" data-iso="' + d.iso + '" data-key="' + d.key + '" title="' + esc(d.iso) + '">' +
                esc(d.label) + "</button>";
            }).join("") +
          "</div>" +
          '<div class="muted" style="font-size:0.6875rem;margin-top:0.25rem" id="stl-day-note"></div>' +
        "</div>" +
        "<div>" +
          '<label class="muted" style="font-size:0.75rem;display:block;margin-bottom:0.25rem">Currency</label>' +
          '<select class="lab-input" id="stl-currency">' +
            ["USD", "EUR", "GBP"].map(function (c) {
              return '<option value="' + c + '"' + (c === state.currency ? " selected" : "") + ">" + c + "</option>";
            }).join("") +
          "</select>" +
        "</div>" +
      "</div>" +

      // Send time slider
      '<div style="margin-bottom:0.75rem">' +
        '<label class="muted" style="font-size:0.75rem;display:flex;justify-content:space-between;margin-bottom:0.25rem">' +
          "<span>Send time</span>" +
          '<span class="mono" id="stl-time-value" style="color:var(--accent);font-weight:700">15:30</span>' +
        "</label>" +
        '<input class="fx-slider" id="stl-time" type="range" min="540" max="1080" step="15" value="' + state.minutes + '" ' +
        'style="width:100%;accent-color:var(--accent)" />' +
        '<div class="muted" style="font-size:0.6875rem;display:flex;justify-content:space-between;margin-top:0.125rem">' +
          "<span>09:00</span><span>18:00</span>" +
        "</div>" +
      "</div>" +

      '<button class="lab-btn" id="stl-predict">Predict arrival</button>' +
      '<div class="lab-result" id="stl-result"></div>';
    main.appendChild(demo);

    // Cache demo DOM.
    var railSeg = demo.querySelector("#stl-rail-seg");
    var dayRow = demo.querySelector("#stl-day-row");
    var dayNote = demo.querySelector("#stl-day-note");
    var currencySelect = demo.querySelector("#stl-currency");
    var timeSlider = demo.querySelector("#stl-time");
    var timeValue = demo.querySelector("#stl-time-value");
    var predictBtn = demo.querySelector("#stl-predict");
    var resultBox = demo.querySelector("#stl-result");

    // ── sync weekend-pill availability to the chosen rail ─────────────────
    function refreshDayPills() {
      var rail = currentRail();
      var weekendDisabled = !rail.instant;
      dayRow.querySelectorAll(".stl-day-btn").forEach(function (b) {
        var key = b.getAttribute("data-key");
        var isWeekendPill = key === "Sa" || key === "Su";
        var disabled = weekendDisabled && isWeekendPill;
        b.disabled = disabled;
        b.classList.toggle("stl-day-disabled", disabled);
        // If the currently-selected day just got disabled, fall back to Monday.
        if (disabled && b.classList.contains("active")) {
          b.classList.remove("active");
          state.dayIso = "2026-07-13";
          var mon = dayRow.querySelector('.stl-day-btn[data-iso="2026-07-13"]');
          if (mon) mon.classList.add("active");
        }
      });
      dayNote.textContent = rail.instant
        ? "Instant rail \u2014 sends 24/7, including weekends."
        : "Weekend pills are disabled \u2014 non-instant rails don\u2019t settle on Sat/Sun.";
    }

    function setRail(key) {
      state.railKey = key;
      railSeg.querySelectorAll(".fee-seg-btn").forEach(function (b) {
        b.classList.toggle("active", b.getAttribute("data-rail") === key);
      });
      // Sync currency to the rail's home currency.
      var rail = currentRail();
      state.currency = rail.currency;
      currencySelect.value = rail.currency;
      refreshDayPills();
    }

    railSeg.querySelectorAll(".fee-seg-btn").forEach(function (btn) {
      btn.addEventListener("click", function () {
        setRail(btn.getAttribute("data-rail"));
      });
    });

    dayRow.querySelectorAll(".stl-day-btn").forEach(function (btn) {
      btn.addEventListener("click", function () {
        if (btn.disabled) return;
        state.dayIso = btn.getAttribute("data-iso");
        dayRow.querySelectorAll(".stl-day-btn").forEach(function (b) {
          b.classList.toggle("active", b === btn);
        });
      });
    });

    currencySelect.addEventListener("change", function () {
      state.currency = currencySelect.value || "USD";
    });

    timeSlider.addEventListener("input", function () {
      state.minutes = parseInt(timeSlider.value, 10);
      timeValue.textContent = minToHHMM(state.minutes);
    });

    refreshDayPills();

    // ── build the day-by-day strip ────────────────────────────────────────
    // Renders cells from the send date through max(value_date, send + 6 days).
    function stripHTML(res, sendDate) {
      var tradeISO = String(res.trade_date);
      var valueISO = String(res.value_date);
      var tradeDate = parseISO(tradeISO);
      var valueDate = parseISO(valueISO);

      var skipped = {};
      (res.skipped_holidays || []).forEach(function (h) { skipped[String(h)] = true; });

      // Window: send date → max(value, send+6). Always covers value + a buffer.
      var end = valueDate.getTime() > addDays(sendDate, 6).getTime()
        ? valueDate : addDays(sendDate, 6);

      var cells = [];
      var cur = new Date(sendDate.getTime());
      var idx = 0;
      while (cur.getTime() <= end.getTime() && idx < 21) {
        var iso = toISO(cur);
        var cls, tag, tagCls;
        if (iso === valueISO) {
          cls = "stl-cell-value"; tag = "VALUE"; tagCls = "stl-tag-value";
        } else if (iso === tradeISO) {
          cls = "stl-cell-trade"; tag = "TRADE"; tagCls = "stl-tag-trade";
        } else if (isWeekend(cur) || skipped[iso]) {
          cls = "stl-cell-skip"; tag = "SKIP"; tagCls = "stl-tag-skip";
        } else {
          cls = "stl-cell-open"; tag = "\u2014"; tagCls = "stl-tag-open";
        }

        cells.push(
          '<div class="stl-cell ' + cls + '">' +
            '<div class="stl-cell-dow">' + esc(DOW[cur.getDay()]) + "</div>" +
            '<div class="stl-cell-date">' + esc(MONTHS[cur.getMonth()] + " " + cur.getDate()) + "</div>" +
            '<div class="stl-cell-tag ' + tagCls + '">' + tag + "</div>" +
          "</div>"
        );
        cur = addDays(cur, 1);
        idx++;
      }

      return '<div class="stl-strip">' + cells.join("") + "</div>";
    }

    // ── render the result ─────────────────────────────────────────────────
    function renderResult(res, sendDate) {
      state.hasResult = true;
      var rail = currentRail();

      // Cut-off indicator (only meaningful for non-instant rails).
      var cutoffHTML = "";
      if (!rail.instant) {
        var cutMin = hhmmToMin(res.cut_off_local);
        if (res.missed_cut_off && cutMin != null) {
          var diffMin = state.minutes - cutMin;
          if (diffMin < 0) diffMin = 0;
          var diffHrs = diffMin / 60;
          var diffLabel = (diffHrs >= 1)
            ? (Math.round(diffHrs * 10) / 10) + " hr"
            : diffMin + " min";
          cutoffHTML =
            '<div class="stl-cutoff stl-cutoff-missed">' +
              "\u26a0 Missed the " + esc(res.cut_off_local) + " " + esc(res.currency || "") +
              " cut-off by " + esc(diffLabel) + " \u2014 trade date rolls forward." +
            "</div>";
        } else if (cutMin != null) {
          cutoffHTML =
            '<div class="stl-cutoff stl-cutoff-made">' +
              "\u2713 Before the " + esc(res.cut_off_local) + " cut-off \u2014 trade date stays put." +
            "</div>";
        }
      } else {
        cutoffHTML =
          '<div class="stl-cutoff stl-cutoff-made">' +
            "Instant rail \u2014 no cut-off, settles on the send day." +
          "</div>";
      }

      // Skipped holidays line (if any).
      var skippedHTML = "";
      if (res.skipped_holidays && res.skipped_holidays.length) {
        skippedHTML =
          '<p class="muted" style="font-size:0.8125rem;margin:0.5rem 0 0">' +
          "Skipped holiday(s): " +
          res.skipped_holidays.map(function (h) { return esc(h); }).join(", ") + "." +
          "</p>";
      }

      // Summary line.
      var summary =
        '<div class="fee-summary" style="margin-top:0.75rem">' +
          '<div class="fee-summary-item"><span class="fee-summary-label">Trade date</span>' +
            '<span class="fee-summary-value" style="color:var(--accent)">' + esc(res.trade_date) + "</span></div>" +
          '<div class="fee-summary-item"><span class="fee-summary-label">Value date</span>' +
            '<span class="fee-summary-value" style="color:var(--green)">' + esc(res.value_date) + "</span></div>" +
          '<div class="fee-summary-item"><span class="fee-summary-label">Settlement</span>' +
            '<span class="fee-summary-value">' + esc(res.settlement_type) + "</span></div>" +
          '<div class="fee-summary-item"><span class="fee-summary-label">Business days</span>' +
            '<span class="fee-summary-value">' + esc(String(res.business_days)) + "</span></div>" +
        "</div>";

      resultBox.className = "lab-result show lab-result-success";
      resultBox.innerHTML =
        stripHTML(res, sendDate) +
        summary +
        cutoffHTML +
        skippedHTML +
        '<p style="margin:0.75rem 0 0;font-size:0.9375rem">' + esc(res.explanation) + "</p>" +
        '<p class="muted" style="font-size:0.75rem;margin:0.5rem 0 0">' + esc(res.disclaimer) + "</p>";
    }

    function showError(msg) {
      resultBox.className = "lab-result show lab-result-error";
      resultBox.innerHTML =
        '<div class="badge badge-red">Couldn\u2019t predict</div> ' + esc(msg);
    }

    // ── predict → POST /api/value-date ────────────────────────────────────
    function runPredict() {
      var rail = currentRail();
      var hhmm = minToHHMM(state.minutes);
      var send_datetime = state.dayIso + "T" + hhmm + ":00";
      var sendDate = parseISO(state.dayIso);

      predictBtn.disabled = true;
      predictBtn.textContent = "Predicting\u2026";

      fetch("/api/value-date", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          send_datetime: send_datetime,
          currency: state.currency,
          scheme: rail.scheme,
        }),
      })
        .then(function (r) {
          if (!r.ok) {
            return r.json().then(function (j) {
              throw new Error((j && j.detail) || ("HTTP " + r.status));
            });
          }
          return r.json();
        })
        .then(function (res) { renderResult(res, sendDate); })
        .catch(function (err) {
          showError(
            (err && err.message) ||
            "Couldn\u2019t reach the value-date service. Is the server running?"
          );
        })
        .then(function () {
          predictBtn.disabled = false;
          predictBtn.textContent = "Predict arrival";
        });
    }

    predictBtn.addEventListener("click", runPredict);

    // ── CALLOUT: tie back to Lab 7 ─────────────────────────────────────────
    var callout = el("div", "callout");
    callout.innerHTML =
      '<div class="callout-title">\uD83D\uDCA1 Connection to Lab 7</div>' +
      glossify(
        "The speed badge on each scheme in Lab 7 is what this lab turns into a " +
        "calendar. \u201CInstant\u201D means T+0 with no cut-off and no weekend \u2014 the " +
        "value date is the send date, full stop. \u201CSame-day\u201D means T+0 but only if " +
        "you beat the cut-off. \u201C1\u20132 days\u201D means T+1 or T+2, where weekends and " +
        "holidays start to bite. Same badge, now stretched across real dates."
      ) +
      ' <a href="#lab-7" style="color:var(--accent);font-weight:600">Open Lab 7 \u2192</a>';
    main.appendChild(callout);

    // ── quiz builder (scheme-quiz-option pattern) ─────────────────────────
    function buildQuiz(index, title, prompt, options) {
      var ex = el("div", "exercise");
      ex.innerHTML =
        '<div class="exercise-header">' +
          '<span class="exercise-badge">' + index + "</span>" +
          '<span class="exercise-title">' + esc(title) + "</span>" +
        "</div>" +
        '<p class="exercise-prompt">' + prompt + "</p>" +
        '<div id="stl-quiz-' + index + '-options" style="display:flex;flex-wrap:wrap;gap:0.5rem;margin-top:0.5rem"></div>' +
        '<div class="lab-result" id="stl-quiz-' + index + '-result"></div>';
      main.appendChild(ex);

      var optHost = ex.querySelector("#stl-quiz-" + index + "-options");
      var result = ex.querySelector("#stl-quiz-" + index + "-result");

      options.forEach(function (opt) {
        var btn = el("button", "scheme-quiz-option");
        btn.textContent = opt.label;
        btn.addEventListener("click", function () {
          optHost.querySelectorAll("button").forEach(function (b) { b.disabled = true; });
          if (opt.correct) {
            btn.classList.add("correct");
            result.className = "lab-result show lab-result-success";
          } else {
            btn.classList.add("wrong");
            // highlight the correct option
            optHost.querySelectorAll("button").forEach(function (b) {
              if (b.textContent === opt.correctLabel) b.classList.add("correct");
            });
            result.className = "lab-result show lab-result-error";
          }
          result.innerHTML =
            (opt.correct
              ? '<div class="badge badge-green">Correct</div> '
              : '<div class="badge badge-red">Not quite.</div> ') +
            "<p style=\"margin:0.5rem 0 0\">" + esc(opt.explain) + "</p>" +
            '<button class="lab-btn secondary" style="margin-top:0.5rem">Reset</button>';
          result.querySelector("button").addEventListener("click", function () {
            optHost.querySelectorAll("button").forEach(function (b) {
              b.disabled = false;
              b.classList.remove("correct", "wrong");
            });
            result.className = "lab-result";
            result.innerHTML = "";
          });
        });
        optHost.appendChild(btn);
      });
    }

    // ── EXERCISE 1 ────────────────────────────────────────────────────────
    buildQuiz(
      1,
      "Faster Payments on a Saturday",
      "You send \u00A3250 to a friend via Faster Payments on Saturday at 21:00. " +
      "When do they get it?",
      [
        {
          label: "Immediately",
          correct: true,
          correctLabel: "Immediately",
          explain:
            "Faster Payments is an instant 24/7 rail. It doesn\u2019t observe weekends, " +
            "holidays or cut-offs \u2014 the value date is the send date, even on a " +
            "Saturday night. Your friend has the money within seconds.",
        },
        {
          label: "Monday",
          correct: false,
          correctLabel: "Immediately",
          explain:
            "That would be true of a batch rail like Bacs, which only settles on " +
            "business days. Faster Payments is instant \u2014 weekends don\u2019t apply.",
        },
        {
          label: "Tuesday",
          correct: false,
          correctLabel: "Immediately",
          explain:
            "Tuesday is where a Friday T+2 spot payment would land \u2014 not an instant " +
            "rail. Faster Payments settles the moment you send it.",
        },
      ]
    );

    // ── EXERCISE 2 ────────────────────────────────────────────────────────
    buildQuiz(
      2,
      "CHAPS house deposit on Friday",
      "You send a \u00A3500k house deposit via CHAPS on Friday at 15:30. " +
      "The CHAPS cut-off is 16:20. When does it settle?",
      [
        {
          label: "Friday",
          correct: true,
          correctLabel: "Friday",
          explain:
            "CHAPS is same-day (T+0) and you beat the 16:20 cut-off, so the trade " +
            "date is Friday and the value date is Friday too. The solicitor can draw " +
            "down the deposit the same afternoon \u2014 which is exactly why CHAPS is " +
            "the rail for house purchases.",
        },
        {
          label: "Monday",
          correct: false,
          correctLabel: "Friday",
          explain:
            "You\u2019d only roll to Monday if you\u2019d missed the cut-off. 15:30 is before " +
            "16:20, so CHAPS settles the same Friday.",
        },
        {
          label: "Tuesday",
          correct: false,
          correctLabel: "Friday",
          explain:
            "Tuesday would be a T+2 spot settlement. CHAPS is same-day \u2014 and you " +
            "made the cut-off, so it\u2019s Friday.",
        },
      ]
    );

    // ── EXERCISE 3 ────────────────────────────────────────────────────────
    buildQuiz(
      3,
      "Bacs payroll submitted Thursday",
      "Payroll goes out via Bacs, submitted on Thursday. " +
      "When do employees see the money in their accounts?",
      [
        {
          label: "Tuesday",
          correct: true,
          correctLabel: "Tuesday",
          explain:
            "Bacs is a T+2 batch cycle. Thursday + two business days skips Saturday " +
            "and Sunday, landing on Tuesday. This is why UK payroll is always " +
            "submitted a few days ahead of pay day.",
        },
        {
          label: "Monday",
          correct: false,
          correctLabel: "Tuesday",
          explain:
            "Monday would be T+1 (e.g. SEPA Credit Transfer). Bacs needs two business " +
            "days, so Thursday\u2019s submission arrives Tuesday after the weekend.",
        },
        {
          label: "Saturday",
          correct: false,
          correctLabel: "Tuesday",
          explain:
            "Bacs doesn\u2019t settle on weekends \u2014 the cycle pauses for Saturday and " +
            "Sunday. Count two business days from Thursday: Tuesday.",
        },
      ]
    );

    // ── COMPLETE BUTTON ───────────────────────────────────────────────────
    var alreadyDone = getProgress().indexOf("settlement") !== -1;

    var completeWrap = el("div");
    completeWrap.style.marginTop = "2rem";
    var completeBtn = el("button", "lab-btn",
      alreadyDone ? "Mark as complete \u2713" : "Mark lab complete");
    if (alreadyDone) completeBtn.disabled = true;
    completeWrap.appendChild(completeBtn);

    var completeMsg = el("div", "lab-result");
    completeWrap.appendChild(completeMsg);
    main.appendChild(completeWrap);

    if (alreadyDone) {
      completeMsg.className = "lab-result show lab-result-success";
      completeMsg.innerHTML =
        '<div class="badge badge-green">Completed</div> You\u2019ve finished this lab. ' +
        "You can now read a value date and explain why a Friday payment lands on Tuesday.";
    }

    completeBtn.addEventListener("click", function () {
      markComplete("settlement");
      completeBtn.disabled = true;
      completeBtn.textContent = "Mark as complete \u2713";
      completeMsg.className = "lab-result show lab-result-success";
      completeMsg.innerHTML =
        '<div class="badge badge-green">Lab complete!</div> You now know the ' +
        "difference between trade date and value date, and how cut-offs, weekends " +
        "and holidays roll a payment forward.";
    });

    // ── LAB NAVIGATION ────────────────────────────────────────────────────
    var nav = el("div", "lab-nav");
    var backToLabs = el("a", "", "Back to labs");
    backToLabs.href = "#";
    var toSchemes = el("a", "", "Lab 7: Payment Schemes \u2192");
    toSchemes.href = "#lab-7";
    nav.appendChild(backToLabs);
    nav.appendChild(toSchemes);
    main.appendChild(nav);

    // Inline styles for the strip + cut-off indicator (kept here so the lab is
    // self-contained even if learn.css hasn't added these specific classes).
    var style = document.createElement("style");
    style.textContent = [
      ".stl-strip{display:flex;flex-wrap:wrap;gap:0.375rem;margin-top:0.25rem}",
      ".stl-cell{flex:1 1 64px;min-width:64px;border:1px solid var(--border);border-radius:var(--radius);padding:0.5rem 0.375rem;text-align:center;background:var(--surface-2);transition:border-color .15s,background .15s}",
      ".stl-cell-dow{font-size:0.6875rem;color:var(--ink-3);text-transform:uppercase;letter-spacing:.04em}",
      ".stl-cell-date{font-size:0.8125rem;font-weight:600;margin:0.125rem 0 0.375rem}",
      ".stl-cell-tag{font-size:0.625rem;font-weight:700;letter-spacing:.05em;padding:0.125rem 0.25rem;border-radius:999px;display:inline-block}",
      ".stl-cell-trade{border-color:var(--accent);background:var(--accent-surface)}",
      ".stl-tag-trade{background:var(--accent);color:#fff}",
      ".stl-cell-value{border-color:var(--green);background:var(--green-bg)}",
      ".stl-tag-value{background:var(--green);color:#fff}",
      ".stl-cell-skip{opacity:.55;background:var(--surface-2)}",
      ".stl-tag-skip{background:var(--ink-3);color:#fff}",
      ".stl-cell-open{opacity:.8}",
      ".stl-tag-open{color:var(--ink-3)}",
      ".stl-day-disabled{opacity:.4;cursor:not-allowed}",
      ".stl-cutoff{margin-top:0.625rem;padding:0.5rem 0.75rem;border-radius:var(--radius);font-size:0.875rem}",
      ".stl-cutoff-missed{background:var(--red-bg);color:var(--red);border:1px solid var(--red)}",
      ".stl-cutoff-made{background:var(--green-bg);color:var(--green);border:1px solid var(--green)}",
    ].join("\n");
    main.insertBefore(style, header);
  };
})();
