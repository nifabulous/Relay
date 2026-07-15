/*
 * LearnUtils — shared utilities for the learning labs and admin UI.
 *
 * Extracted from 15+ copy-pasted copies of esc(), fmt(), etc. (Frontend panel #1).
 * Loaded before all lab scripts. Exposed as window.LearnUtils.
 *
 * EVERY lab file previously had its own esc() — 15 chances for someone to "fix"
 * only one. Now there's one canonical version here.
 */
(function () {
  "use strict";

  window.LearnUtils = {
    /**
     * HTML-escape a string for safe injection into innerHTML.
     * This is the MOST security-sensitive function in the frontend.
     * A missed esc() = an XSS vector when rendering API data (bank names,
     * BICs, account holder names, error messages).
     */
    esc: function (s) {
      return String(s == null ? "" : s)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
    },

    /**
     * Format a money amount with currency symbol.
     */
    fmtMoney: function (amount, currency) {
      var symbols = { USD: "$", EUR: "€", GBP: "£", JPY: "¥", NGN: "₦", CHF: "CHF" };
      var sym = symbols[currency] || "";
      var n = parseFloat(amount || 0).toLocaleString("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
      return sym + n;
    },

    /**
     * Get the localStorage progress array (completed lab IDs).
     */
    getProgress: function () {
      try {
        return JSON.parse(localStorage.getItem("swift-lab-progress") || "[]");
      } catch (e) {
        return [];
      }
    },

    /**
     * Mark a lab complete in localStorage.
     */
    markComplete: function (labId) {
      var progress = this.getProgress();
      if (progress.indexOf(labId) === -1) {
        progress.push(labId);
        localStorage.setItem("swift-lab-progress", JSON.stringify(progress));
      }
    },

    /**
     * Check if a lab is completed.
     */
    isComplete: function (labId) {
      return this.getProgress().indexOf(labId) !== -1;
    },

    /**
     * Centralized API fetch wrapper with error handling.
     * Replaces the scattered raw fetch() calls across lab files.
     */
    api: function (url, options) {
      return fetch(url, options).then(function (res) {
        if (!res.ok) {
          return res.json().then(
            function (body) {
              throw new Error(
                (body && (body.detail || body.message)) ||
                  "Request failed: " + res.status
              );
            },
            function () {
              throw new Error("Request failed: " + res.status);
            }
          );
        }
        return res.json();
      });
    },

    /**
     * Build a complete-button footer for a lab.
     * Replaces the ~8 duplicated "mark complete" button blocks.
     */
    completeButton: function (labId, helpers) {
      var self = this;
      var done = self.isComplete(labId);
      return (
        '<div class="lab-complete">' +
        '<button class="lab-btn ' + (done ? "secondary" : "") + '" ' +
        (done ? "disabled" : "") + ' onclick="LearnUtils._toggleComplete(\'' +
        labId + "', this)\">" +
        (done ? "✓ Completed" : "Mark complete") +
        "</button></div>"
      );
    },

    _toggleComplete: function (labId, btn) {
      this.markComplete(labId);
      btn.textContent = "✓ Completed";
      btn.disabled = true;
      btn.classList.add("secondary");
    },
  };
})();
