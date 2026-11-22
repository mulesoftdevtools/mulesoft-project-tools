/* =====================================================================
   Mule Log Analyzer
   Parses Mule 4 runtime / CloudHub log output into structured entries:
   level, timestamp, flow, event (correlation) id, logger and message.
   Multi-line entries (stack traces, logged payloads) stay attached to the
   line that started them. Summaries by level, flow and Mule error type.
   ===================================================================== */
(function () {
  "use strict";

  var LEVELS = ["TRACE", "DEBUG", "INFO", "WARN", "ERROR", "FATAL"];
  var RANK = { TRACE: 0, DEBUG: 1, INFO: 2, WARN: 3, ERROR: 4, FATAL: 5 };
  var RE_TS = /(\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(?:[.,]\d{1,9})?(?:Z|[+-]\d{2}:?\d{2})?)/;
  var RE_LEVEL = /(?:^|[\s\[])(TRACE|DEBUG|INFO|WARN(?:ING)?|ERROR|FATAL|SEVERE)(?=[\s\]:])/;

  function isEntryStart(line) {
    if (!line.trim()) return false;
    if (/^\s/.test(line)) return false;
    var head = line.slice(0, 80);
    return RE_LEVEL.test(head) && RE_TS.test(line.slice(0, 120));
  }

  function normaliseLevel(l) {
    if (l === "WARNING") return "WARN";
    if (l === "SEVERE") return "ERROR";
    return l;
  }

  function parseEntry(first, rest, lineNo) {
    var e = { line: lineNo, raw: [first].concat(rest).join("\n") };
    var lv = first.slice(0, 80).match(RE_LEVEL);
    e.level = lv ? normaliseLevel(lv[1]) : "INFO";
    var ts = first.match(RE_TS);
    e.time = ts ? ts[1] : "";

    var ev = first.match(/event:\s*([^\]\s;]+)/) || first.match(/correlationId[=:]\s*"?([\w-]+)/i);
    e.event = ev ? ev[1] : "";

    var flow = first.match(/processor:\s*([^\/\];\s]+)/) ||
               first.match(/\]\.([\w.-]+?)\.(?:CPU_LITE|CPU_INTENSIVE|BLOCKING|IO)\b/) ||
               first.match(/\[[\w.-]+\]\.([\w-]+)\./);
    e.flow = flow ? flow[1] : "";

    // message: text after the logger name ("some.logger.Class: message")
    var m = first.match(/\]\s+([\w.$]+(?:\.[\w$]+)+):\s?(.*)$/) || first.match(/\s([\w.$]+\.[\w$]+):\s(.*)$/);
    if (m) { e.logger = m[1]; e.message = m[2]; }
    else {
      e.logger = "";
      e.message = first.replace(RE_TS, "").replace(RE_LEVEL, " ").replace(/\[[^\]]*\]/g, "").trim();
    }
    if (rest.length) e.message += (e.message ? "\n" : "") + rest.join("\n");

    var et = e.raw.match(/Error type\s*:\s*([A-Z_]+:[A-Z_]+)/) || e.raw.match(/errorType[=:]\s*"?([A-Z_]+:[A-Z_]+)/);
    e.errorType = et ? et[1] : "";
    return e;
  }

  function parse(text) {
    var lines = text.replace(/\r\n?/g, "\n").split("\n");
    var entries = [], current = null, rest = [], startLine = 0, orphan = 0;
    lines.forEach(function (line, i) {
      if (isEntryStart(line)) {
        if (current !== null) entries.push(parseEntry(current, rest, startLine));
        current = line; rest = []; startLine = i + 1;
      } else if (current !== null) {
        rest.push(line);
      } else if (line.trim()) {
        orphan++;
      }
    });
    if (current !== null) entries.push(parseEntry(current, trimTrailing(rest), startLine));
    return { entries: entries, orphan: orphan };
  }

  function trimTrailing(arr) {
    while (arr.length && !arr[arr.length - 1].trim()) arr.pop();
    return arr;
  }

  function countBy(list, key) {
    var map = {};
    list.forEach(function (e) { var k = e[key]; if (k) map[k] = (map[k] || 0) + 1; });
    return Object.keys(map).map(function (k) { return [k, map[k]]; }).sort(function (a, b) { return b[1] - a[1]; });
  }

  function pillFor(level) {
    var cls = level === "ERROR" || level === "FATAL" ? "pill-error" : level === "WARN" ? "pill-warning" :
              level === "INFO" ? "pill-info" : "pill-head";
    return '<span class="pill ' + cls + '">' + level + "</span>";
  }

  function csvCell(v) {
    v = String(v == null ? "" : v);
    return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
  }

  function esc(s) { return MPT.escapeHtml(s); }

  function render(text, opts) {
    var parsed = parse(text);
    var all = parsed.entries;
    if (!all.length) {
      throw new Error("no log entries were recognised. Each entry should start with a level (INFO, WARN, ERROR…) and a timestamp, as Mule 4 and CloudHub logs do.");
    }
    var min = opts.level && opts.level !== "all" ? RANK[opts.level] : -1;
    var q = (opts.q || "").trim().toLowerCase();
    var shown = all.filter(function (e) {
      if (min >= 0 && RANK[e.level] < min) return false;
      if (q && e.raw.toLowerCase().indexOf(q) === -1) return false;
      return true;
    });

    var byLevel = {};
    LEVELS.forEach(function (l) { byLevel[l] = 0; });
    all.forEach(function (e) { byLevel[e.level] = (byLevel[e.level] || 0) + 1; });

    var html = '<div class="stats">' +
      stat("Entries", all.length) +
      stat("Errors", byLevel.ERROR + byLevel.FATAL) +
      stat("Warnings", byLevel.WARN) +
      stat("Info", byLevel.INFO) +
      stat("Debug / trace", byLevel.DEBUG + byLevel.TRACE) +
      stat("Distinct events", countBy(all, "event").length) +
      "</div>";

    var errTypes = countBy(all, "errorType");
    var flows = countBy(all, "flow");
    if (errTypes.length || flows.length) {
      html += '<div class="io-grid" style="margin-top:6px">';
      html += '<div class="io-col">' + miniTable("Mule error types", "Error type", errTypes, "No Mule error types found in this log.") + "</div>";
      html += '<div class="io-col">' + miniTable("Busiest flows", "Flow", flows.slice(0, 8), "No flow names found.") + "</div>";
      html += "</div>";
    }

    var limit = 500;
    html += '<div class="table-wrap"><table class="data"><thead><tr><th>Line</th><th>Time</th><th>Level</th><th>Flow</th><th>Event</th><th>Message</th></tr></thead><tbody>';
    shown.slice(0, limit).forEach(function (e) {
      var msg = e.message.length > 600 ? e.message.slice(0, 600) + "…" : e.message;
      html += "<tr><td>" + e.line + '</td><td style="white-space:nowrap">' + esc(e.time) + "</td><td>" + pillFor(e.level) +
        "</td><td>" + esc(e.flow) + '</td><td style="font-family:var(--mono);font-size:.78rem">' + esc(e.event) +
        '</td><td style="white-space:pre-wrap;word-break:break-word;font-family:var(--mono);font-size:.8rem">' + esc(msg) +
        (e.errorType ? ' <span class="pill pill-error">' + esc(e.errorType) + "</span>" : "") + "</td></tr>";
    });
    if (!shown.length) html += '<tr><td colspan="6" style="color:var(--text-muted)">No entries match the current filter.</td></tr>';
    html += "</tbody></table></div>";
    if (shown.length > limit) html += '<p class="io-meta">Showing the first ' + limit + " of " + shown.length + " matching entries. Narrow the filter or download the CSV for everything.</p>";

    var csv = ["line,time,level,flow,event,logger,errorType,message"].concat(shown.map(function (e) {
      return [e.line, e.time, e.level, e.flow, e.event, e.logger, e.errorType, e.message].map(csvCell).join(",");
    })).join("\n");

    var errors = byLevel.ERROR + byLevel.FATAL;
    return {
      html: html,
      copyText: csv,
      message: "Parsed " + all.length + " entries; showing " + shown.length + "." +
        (errors ? " Found " + errors + " error(s)." : " No errors found.") +
        (parsed.orphan ? " " + parsed.orphan + " line(s) before the first entry were skipped." : ""),
      type: errors ? "warn" : "ok"
    };
  }

  function stat(label, value) {
    return '<div class="stat"><div class="stat-label">' + label + '</div><div class="stat-value">' + value + "</div></div>";
  }

  function miniTable(title, head, rows, empty) {
    var h = '<div class="io-head"><span class="io-label">' + title + "</span></div>";
    if (!rows.length) return h + '<p class="io-meta">' + empty + "</p>";
    h += '<div class="table-wrap" style="margin-top:4px"><table class="data"><thead><tr><th>' + head + "</th><th>Count</th></tr></thead><tbody>";
    rows.forEach(function (r) { h += '<tr><td style="font-family:var(--mono);font-size:.8rem">' + esc(r[0]) + "</td><td>" + r[1] + "</td></tr>"; });
    return h + "</tbody></table></div>";
  }

  var SAMPLE = [
    "INFO  2026-03-14 09:26:53,101 [[MuleRuntime].uber.04: [orders-api].orders-api-main.CPU_LITE @3c1f2a1b] [processor: orders-api-main/processors/0; event: 7e1c9a40-e1f2-11f0-9d3a-0242ac120002] org.mule.runtime.core.internal.processor.LoggerMessageProcessor: Request received: GET /api/orders?status=OPEN",
    "INFO  2026-03-14 09:26:53,240 [[MuleRuntime].uber.04: [orders-api].get-orders-flow.CPU_LITE @3c1f2a1b] [processor: get-orders-flow/processors/1; event: 7e1c9a40-e1f2-11f0-9d3a-0242ac120002] org.mule.runtime.core.internal.processor.LoggerMessageProcessor: Querying orders database",
    "DEBUG 2026-03-14 09:26:53,388 [[MuleRuntime].uber.05: [orders-api].get-orders-flow.BLOCKING @5d2e4b6c] [processor: get-orders-flow/processors/2; event: 7e1c9a40-e1f2-11f0-9d3a-0242ac120002] org.mule.extension.db.internal.DbConnector: SELECT * FROM orders WHERE status = :status",
    "WARN  2026-03-14 09:26:54,012 [[MuleRuntime].uber.05: [orders-api].get-orders-flow.CPU_LITE @5d2e4b6c] [processor: get-orders-flow/processors/3; event: 7e1c9a40-e1f2-11f0-9d3a-0242ac120002] org.mule.runtime.core.internal.processor.LoggerMessageProcessor: Query took 624 ms (threshold 500 ms)",
    "INFO  2026-03-14 09:27:10,553 [[MuleRuntime].uber.06: [orders-api].orders-api-main.CPU_LITE @3c1f2a1b] [processor: orders-api-main/processors/0; event: 9a3b7c10-e1f2-11f0-9d3a-0242ac120002] org.mule.runtime.core.internal.processor.LoggerMessageProcessor: Request received: POST /api/orders",
    "ERROR 2026-03-14 09:27:11,904 [[MuleRuntime].uber.06: [orders-api].create-order-flow.CPU_LITE @7a8b9c0d] [processor: create-order-flow/processors/2; event: 9a3b7c10-e1f2-11f0-9d3a-0242ac120002] org.mule.runtime.core.internal.exception.OnErrorPropagateHandler: ",
    "********************************************************************************",
    "Message               : HTTP POST on resource 'https://inventory.example.com/api/reserve' failed: service unavailable (503).",
    "Element               : create-order-flow/processors/2 @ orders-api:create-order.xml:21 (Reserve stock)",
    "Element DSL           : <http:request method=\"POST\" config-ref=\"Inventory_Config\" path=\"/reserve\"></http:request>",
    "Error type            : HTTP:SERVICE_UNAVAILABLE",
    "FlowStack             : at create-order-flow(create-order-flow/processors/2 @ orders-api:create-order.xml:21 (Reserve stock))",
    "",
    "  (set debug level logging or '-Dmule.verbose.exceptions=true' for everything)",
    "********************************************************************************",
    "INFO  2026-03-14 09:27:30,118 [[MuleRuntime].uber.02: [orders-api].orders-api-main.CPU_LITE @3c1f2a1b] [processor: orders-api-main/processors/0; event: b41d2e70-e1f2-11f0-9d3a-0242ac120002] org.mule.runtime.core.internal.processor.LoggerMessageProcessor: Request received: GET /api/orders/ORD-404",
    "ERROR 2026-03-14 09:27:30,377 [[MuleRuntime].uber.02: [orders-api].get-order-by-id-flow.CPU_LITE @1f2e3d4c] [processor: get-order-by-id-flow/processors/1; event: b41d2e70-e1f2-11f0-9d3a-0242ac120002] org.mule.runtime.core.internal.exception.OnErrorContinueHandler: ",
    "Message               : Order ORD-404 not found",
    "Error type            : APIKIT:NOT_FOUND",
    "INFO  2026-03-14 09:27:45,002 [[MuleRuntime].uber.01: [orders-api].sync-scheduler-flow.CPU_LITE @9e8d7c6b] [processor: sync-scheduler-flow/processors/0; event: c0ffee00-e1f2-11f0-9d3a-0242ac120002] org.mule.runtime.core.internal.processor.LoggerMessageProcessor: Scheduler fired: syncing 42 orders to ERP"
  ].join("\n");

  var tool = MPT.simpleTool({
    transform: render,
    sample: SAMPLE,
    errorPrefix: "Could not analyse the log",
    downloadName: "mule-log.csv",
    downloadMime: "text/csv;charset=utf-8",
    emptyMessage: "Paste some Mule log output, or press “Load example”."
  });

  var q = document.getElementById("opt-q");
  if (q && tool) q.addEventListener("input", MPT.debounce(function () {
    if (tool.getInput().trim()) tool.run(true);
  }, 250));
})();
