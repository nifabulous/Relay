/*
 * Visualizers — reusable SVG-based payment visualizations.
 *
 * Components:
 *   1. PaymentViz.animatedChain(container, nodes) — animated correspondent chain
 *   2. PaymentViz.nostroVostro(container, fromBank, toBank, intermediary, amount, currency)
 *   3. PaymentViz.timeline(container, events) — vertical SVG timeline
 *
 * Used by the learn labs (Lab 4, Lab 6, Capstone) and the admin UI.
 * No dependencies beyond a DOM.
 */
window.PaymentViz = (function () {
  "use strict";

  // ── Helpers ──────────────────────────────────────────
  function svg(tag, attrs) {
    var el = document.createElementNS("http://www.w3.org/2000/svg", tag);
    if (attrs) for (var k in attrs) el.setAttribute(k, attrs[k]);
    return el;
  }

  var esc = LearnUtils.esc;

  // ── 1. Animated Correspondent Chain ─────────────────
  //
  // Renders a horizontal flow of bank nodes with arrows.
  // An animated dot travels from the originator through each hop to the beneficiary.
  // Returns an object with: { replay() }
  //
  function animatedChain(container, nodes) {
    container.innerHTML = "";
    var viz = document.createElement("div");
    viz.className = "viz-chain";
    container.appendChild(viz);

    // Build node boxes + arrows as flex items
    nodes.forEach(function (node, i) {
      if (i > 0) {
        var arrow = document.createElement("div");
        arrow.className = "viz-chain-arrow";
        arrow.innerHTML =
          '<svg width="32" height="24" viewBox="0 0 32 24">' +
          '<path d="M2 12 H26" stroke="#a8a29e" stroke-width="2" fill="none" ' +
          'stroke-dasharray="4 3"/>' +
          '<path d="M22 7 L28 12 L22 17" stroke="#a8a29e" stroke-width="2" fill="none"/>' +
          "</svg>";
        viz.appendChild(arrow);
      }

      var box = document.createElement("div");
      var tone = node.tone || "inter";
      box.className = "viz-chain-node viz-tone-" + tone;

      // Icon
      var icon = "🏦";
      if (tone === "you") icon = "📍";
      else if (tone === "ben") icon = "✓";
      else if (tone === "reject") icon = "✗";

      box.innerHTML =
        '<div class="viz-chain-icon">' + icon + "</div>" +
        '<div class="viz-chain-label">' + esc(node.label) + "</div>" +
        (node.sub ? '<div class="viz-chain-sub">' + esc(node.sub) + "</div>" : "");

      if (node.amount) {
        box.innerHTML += '<div class="viz-chain-amount">' + esc(node.amount) + "</div>";
      }

      viz.appendChild(box);
    });

    // Animated dot overlay
    var dotTrack = document.createElement("div");
    dotTrack.className = "viz-dot-track";
    dotTrack.innerHTML = '<div class="viz-dot"></div>';
    viz.appendChild(dotTrack);

    // Replay function: restart the CSS animation
    function replay() {
      var dot = dotTrack.querySelector(".viz-dot");
      dot.style.animation = "none";
      void dot.offsetWidth; // trigger reflow
      dot.style.animation = "";
    }

    // Auto-play after a short delay
    setTimeout(replay, 300);

    return { replay: replay, element: viz };
  }

  // ── 2. Nostro / Vostro Accounting Diagram ────────────
  //
  // Shows the accounting flow between two banks via an intermediary:
  //
  //   Bank A (originator)          Intermediary            Bank B (beneficiary)
  //   ┌─────────────┐             ┌─────────────┐          ┌─────────────┐
  //   │ Nostro:     │──── debit ──│             │── credit ─│ Vostro:    │
  //   │ $5,000 ↓    │             │ holds both  │           │ $5,000 ↑   │
  //   └─────────────┘             └─────────────┘          └─────────────┘
  //
  function nostroVostro(container, opts) {
    var fromBank = opts.fromBank || "Originator Bank";
    var toBank = opts.toBank || "Beneficiary Bank";
    var intermediary = opts.intermediary || "Intermediary Bank";
    var amount = opts.amount || "$5,000";
    var currency = opts.currency || "USD";

    container.innerHTML = "";

    var wrap = document.createElement("div");
    wrap.className = "viz-nostro";

    wrap.innerHTML =
      '<div class="viz-nostro-col">' +
        '<div class="viz-nostro-bank">' + esc(fromBank) + "</div>" +
        '<div class="viz-nostro-box viz-nostro-debit">' +
          '<div class="viz-nostro-title">Nostro account</div>' +
          '<div class="viz-nostro-label">"Our money at the intermediary"</div>' +
          '<div class="viz-nostro-amount">' + esc(amount) + " " + esc(currency) + " ↓</div>" +
          '<div class="viz-nostro-action">DEBITED</div>' +
        "</div>" +
      "</div>" +
      '<div class="viz-nostro-flow">' +
        '<div class="viz-nostro-arrow">━━━━━━▶</div>' +
        '<div class="viz-nostro-intermediary">' + esc(intermediary) + "</div>" +
        '<div class="viz-nostro-arrow">━━━━━━▶</div>' +
      "</div>" +
      '<div class="viz-nostro-col">' +
        '<div class="viz-nostro-bank">' + esc(toBank) + "</div>" +
        '<div class="viz-nostro-box viz-nostro-credit">' +
          '<div class="viz-nostro-title">Vostro account</div>' +
          '<div class="viz-nostro-label">"Their money with us"</div>' +
          '<div class="viz-nostro-amount">' + esc(amount) + " " + esc(currency) + " ↑</div>" +
          '<div class="viz-nostro-action">CREDITED</div>' +
        "</div>" +
      "</div>";

    container.appendChild(wrap);
    return { element: wrap };
  }

  // ── 3. Visual Timeline (for tracking) ───────────────
  //
  // Renders a vertical timeline with connecting lines, status badges,
  // timestamps, and fee annotations.
  //
  // events: [{ status, bank_name, timestamp, amount, message, hop }]
  //
  function timeline(container, events) {
    container.innerHTML = "";

    var wrap = document.createElement("div");
    wrap.className = "viz-timeline";

    events.forEach(function (e, i) {
      var isLast = i === events.length - 1;
      var statusLower = (e.status || "").toLowerCase();

      // Determine tone
      var tone = "processing";
      if (statusLower === "credited") tone = "success";
      else if (statusLower === "rejected" || statusLower === "returned") tone = "error";
      else if (statusLower === "initiated") tone = "start";

      var item = document.createElement("div");
      item.className = "viz-timeline-item viz-timeline-" + tone;

      var time = (e.timestamp || "").slice(11, 19) || "—";
      var icon = "●";
      if (tone === "success") icon = "✓";
      else if (tone === "error") icon = "✗";
      else if (tone === "start") icon = "►";

      item.innerHTML =
        '<div class="viz-timeline-rail">' +
          '<div class="viz-timeline-dot viz-timeline-dot-' + tone + '">' + icon + "</div>" +
          (isLast ? "" : '<div class="viz-timeline-line"></div>') +
        "</div>" +
        '<div class="viz-timeline-content">' +
          '<div class="viz-timeline-row">' +
            '<span class="viz-timeline-status badge-' +
              (tone === "success" ? "green" : tone === "error" ? "red" : "amber") +
              '">' + esc(e.status) + "</span>" +
            '<span class="viz-timeline-time mono">' + esc(time) + "</span>" +
          "</div>" +
          '<div class="viz-timeline-bank">' + esc(e.bank_name || e.bank_bic || "—") + "</div>" +
          (e.message ? '<div class="viz-timeline-message muted">' + esc(e.message) + "</div>" : "") +
          (e.amount
            ? '<div class="viz-timeline-amount mono">' + esc(e.amount) +
              (e.currency ? " " + esc(e.currency) : "") + "</div>"
            : "") +
        "</div>";

      wrap.appendChild(item);
    });

    container.appendChild(wrap);
    return { element: wrap };
  }

  return {
    animatedChain: animatedChain,
    nostroVostro: nostroVostro,
    timeline: timeline,
    esc: esc,
  };
})();
