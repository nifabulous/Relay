/*
 * Telemetry — anonymous learning-event tracker.
 *
 * Collects 5 event types in localStorage, batches them to POST /api/telemetry
 * for metric computation (completion rate, drop-off, time-on-task).
 *
 * Privacy: fully anonymous. No user IDs, no accounts, no PII.
 * Opt-out: set localStorage["telemetry-opt-out"] = "true".
 *
 * Loaded before all lab scripts. Exposed as window.Telemetry.
 */
(function () {
  "use strict";

  var STORAGE_KEY = "corridor-telemetry-events";
  var OPT_OUT_KEY = "telemetry-opt-out";
  var MAX_EVENTS = 500; // cap to prevent unbounded growth
  var BATCH_SIZE = 20; // flush to server after this many events

  function isOptedOut() {
    try {
      return localStorage.getItem(OPT_OUT_KEY) === "true";
    } catch (e) {
      return false;
    }
  }

  function getEvents() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    } catch (e) {
      return [];
    }
  }

  function saveEvents(events) {
    try {
      // Trim to max if needed
      if (events.length > MAX_EVENTS) {
        events = events.slice(-MAX_EVENTS);
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(events));
    } catch (e) {
      // localStorage full or unavailable — silently drop
    }
  }

  function nowISO() {
    return new Date().toISOString();
  }

  function record(type, labId) {
    if (isOptedOut()) return;
    if (!labId) return;

    var events = getEvents();
    events.push({ type: type, lab_id: labId, ts: nowISO() });
    saveEvents(events);

    // Batch-flush if we've accumulated enough
    if (events.length >= BATCH_SIZE) {
      flush();
    }
  }

  function flush() {
    if (isOptedOut()) return;
    var events = getEvents();
    if (events.length === 0) return;

    // POST to server for metric computation (fire-and-forget)
    fetch("/api/telemetry", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(events),
    }).catch(function () {
      // Network failure — events stay in localStorage, will retry next flush
    });
  }

  function optOut() {
    try {
      localStorage.setItem(OPT_OUT_KEY, "true");
      localStorage.removeItem(STORAGE_KEY);
    } catch (e) {}
  }

  function optIn() {
    try {
      localStorage.removeItem(OPT_OUT_KEY);
    } catch (e) {}
  }

  // Flush on page unload (best-effort)
  window.addEventListener("beforeunload", function () {
    flush();
  });

  window.Telemetry = {
    // Event recording — the 5 event types
    labViewed: function (labId) { record("lab_viewed", labId); },
    labStarted: function (labId) { record("lab_started", labId); },
    labCompleted: function (labId) { record("lab_completed", labId); },
    exerciseAttempted: function (labId) { record("exercise_attempted", labId); },
    exerciseSolved: function (labId) { record("exercise_solved", labId); },

    // Flush pending events to the server
    flush: flush,

    // Opt-out / opt-in
    optOut: optOut,
    optIn: optIn,
    isOptedOut: isOptedOut,

    // For debugging / progress page
    getEvents: getEvents,
  };
})();
