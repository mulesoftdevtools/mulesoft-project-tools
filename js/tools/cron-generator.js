/* =====================================================================
   Quartz cron expression generator, explainer and next-run calculator
   (the 6/7 field format used by the Mule Scheduler component)
   ===================================================================== */
(function () {
  "use strict";

  var MONTH_NAMES = { JAN: 1, FEB: 2, MAR: 3, APR: 4, MAY: 5, JUN: 6, JUL: 7, AUG: 8, SEP: 9, OCT: 10, NOV: 11, DEC: 12 };
  var DOW_NAMES = { SUN: 1, MON: 2, TUE: 3, WED: 4, THU: 5, FRI: 6, SAT: 7 };
  var DOW_LABEL = ["", "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  var MONTH_LABEL = ["", "January", "February", "March", "April", "May", "June",
                     "July", "August", "September", "October", "November", "December"];

  var input = document.getElementById("cron-input");
  var msg = document.getElementById("cron-msg");
  var summaryEl = document.getElementById("cron-summary");
  var resultsEl = document.getElementById("cron-results");
  if (!input) return;

  /* ---------------- field parsing ---------------- */

  function parseField(spec, min, max, names, fieldName) {
    spec = String(spec).trim();
    var result = { any: false, values: [], lastDay: false, lastOffset: 0, lastDow: null, nth: null, raw: spec };

    if (spec === "*" || spec === "?") { result.any = true; return result; }

    // day-of-month specials
    if (fieldName === "dom") {
      if (/^L$/i.test(spec)) { result.lastDay = true; return result; }
      var lastOffset = spec.match(/^L-(\d+)$/i);
      if (lastOffset) {
        result.lastDay = true;
        result.lastOffset = parseInt(lastOffset[1], 10);
        return result;
      }
      if (/W/i.test(spec)) {
        throw new Error("the “W” (nearest weekday) modifier is not supported by this tool.");
      }
    }

    // day-of-week specials
    if (fieldName === "dow") {
      var nth = spec.match(/^([A-Za-z0-9]+)#([1-5])$/);
      if (nth) {
        result.nth = { dow: resolveName(nth[1], names, min, max, fieldName), n: parseInt(nth[2], 10) };
        return result;
      }
      var lastDow = spec.match(/^([A-Za-z0-9]+)L$/i);
      if (lastDow && !/^L$/i.test(spec)) {
        result.lastDow = resolveName(lastDow[1], names, min, max, fieldName);
        return result;
      }
      if (/^L$/i.test(spec)) { result.lastDow = 7; return result; } // L alone = Saturday in Quartz
    }

    var set = {};
    spec.split(",").forEach(function (part) {
      part = part.trim();
      if (!part) throw new Error("empty value in the " + label(fieldName) + " field.");

      var step = 1;
      var base = part;
      if (part.indexOf("/") !== -1) {
        var bits = part.split("/");
        if (bits.length !== 2) throw new Error("“" + part + "” has too many “/” separators.");
        base = bits[0].trim();
        step = parseInt(bits[1], 10);
        if (!isFinite(step) || step < 1) {
          throw new Error("step value in “" + part + "” must be a positive whole number.");
        }
      }

      var start, end;
      if (base === "*" || base === "?" || base === "") {
        start = min; end = max;
      } else if (base.indexOf("-") !== -1) {
        var range = base.split("-");
        if (range.length !== 2) throw new Error("“" + base + "” is not a valid range.");
        start = resolveName(range[0], names, min, max, fieldName);
        end = resolveName(range[1], names, min, max, fieldName);
      } else {
        start = resolveName(base, names, min, max, fieldName);
        // "5/10" means "from 5, every 10, up to the maximum"
        end = (part.indexOf("/") !== -1) ? max : start;
      }

      if (start > end) {
        // wrapping range, e.g. FRI-MON
        for (var v = start; v <= max; v += step) set[v] = true;
        for (var w = min; w <= end; w += step) set[w] = true;
      } else {
        for (var x = start; x <= end; x += step) set[x] = true;
      }
    });

    result.values = Object.keys(set).map(Number).sort(function (a, b) { return a - b; });
    if (!result.values.length) throw new Error("the " + label(fieldName) + " field matched no values.");
    return result;
  }

  function resolveName(token, names, min, max, fieldName) {
    token = String(token).trim().toUpperCase();
    if (names && Object.prototype.hasOwnProperty.call(names, token)) return names[token];
    if (!/^\d+$/.test(token)) {
      throw new Error("“" + token + "” is not valid in the " + label(fieldName) + " field" +
        (names ? " (expected a number or one of " + Object.keys(names).join(", ") + ")" : "") + ".");
    }
    var n = parseInt(token, 10);
    if (fieldName === "dow" && n === 0) n = 1;         // tolerate Unix-style 0 = Sunday
    if (n < min || n > max) {
      throw new Error("value " + token + " is outside the valid range " + min + "–" + max +
                      " for the " + label(fieldName) + " field.");
    }
    return n;
  }

  function label(field) {
    return { sec: "seconds", min: "minutes", hour: "hours", dom: "day-of-month",
             month: "month", dow: "day-of-week", year: "year" }[field] || field;
  }

  function parseExpression(text) {
    var parts = String(text).trim().split(/\s+/);
    if (parts.length < 6 || parts.length > 7) {
      throw new Error("a Quartz expression needs 6 or 7 fields (seconds minutes hours day-of-month month " +
                      "day-of-week [year]) — this one has " + parts.length + ".");
    }
    var thisYear = new Date().getFullYear();
    return {
      parts: parts,
      sec: parseField(parts[0], 0, 59, null, "sec"),
      min: parseField(parts[1], 0, 59, null, "min"),
      hour: parseField(parts[2], 0, 23, null, "hour"),
      dom: parseField(parts[3], 1, 31, null, "dom"),
      month: parseField(parts[4], 1, 12, MONTH_NAMES, "month"),
      dow: parseField(parts[5], 1, 7, DOW_NAMES, "dow"),
      year: parts.length === 7 ? parseField(parts[6], thisYear - 10, thisYear + 40, null, "year") : { any: true, values: [] }
    };
  }

  /* ---------------- next run calculation ---------------- */

  function daysInMonth(year, month /* 1-12 */) {
    return new Date(year, month, 0).getDate();
  }

  function dayMatches(date, cron) {
    var month = date.getMonth() + 1;
    if (!cron.month.any && cron.month.values.indexOf(month) === -1) return false;
    if (!cron.year.any && cron.year.values.indexOf(date.getFullYear()) === -1) return false;

    var domSpecified = !cron.dom.any;
    var dowSpecified = !cron.dow.any;

    var domOk = true;
    if (domSpecified) {
      if (cron.dom.lastDay) {
        domOk = date.getDate() === (daysInMonth(date.getFullYear(), month) - cron.dom.lastOffset);
      } else {
        domOk = cron.dom.values.indexOf(date.getDate()) !== -1;
      }
    }

    var dowOk = true;
    if (dowSpecified) {
      var quartzDow = date.getDay() + 1;
      if (cron.dow.nth) {
        dowOk = quartzDow === cron.dow.nth.dow &&
                Math.ceil(date.getDate() / 7) === cron.dow.nth.n;
      } else if (cron.dow.lastDow !== null && cron.dow.lastDow !== undefined) {
        dowOk = quartzDow === cron.dow.lastDow &&
                (date.getDate() + 7) > daysInMonth(date.getFullYear(), month);
      } else {
        dowOk = cron.dow.values.indexOf(quartzDow) !== -1;
      }
    }

    if (domSpecified && dowSpecified) return domOk || dowOk;
    if (domSpecified) return domOk;
    if (dowSpecified) return dowOk;
    return true;
  }

  function expand(field, min, max) {
    if (!field.any) return field.values;
    var out = [];
    for (var i = min; i <= max; i++) out.push(i);
    return out;
  }

  function nextRuns(cron, count, from) {
    var hours = expand(cron.hour, 0, 23);
    var minutes = expand(cron.min, 0, 59);
    var seconds = expand(cron.sec, 0, 59);

    var runs = [];
    var cursor = new Date(from.getFullYear(), from.getMonth(), from.getDate());
    var MAX_DAYS = 366 * 8;

    for (var d = 0; d < MAX_DAYS && runs.length < count; d++) {
      var day = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() + d);
      if (!dayMatches(day, cron)) continue;

      for (var h = 0; h < hours.length && runs.length < count; h++) {
        for (var m = 0; m < minutes.length && runs.length < count; m++) {
          for (var s = 0; s < seconds.length && runs.length < count; s++) {
            var candidate = new Date(day.getFullYear(), day.getMonth(), day.getDate(),
                                     hours[h], minutes[m], seconds[s], 0);
            if (candidate.getTime() > from.getTime()) runs.push(candidate);
          }
        }
      }
    }
    return runs;
  }

  /* ---------------- description ---------------- */

  function unitPhrase(spec, unit, unitPlural) {
    spec = String(spec).trim();
    if (spec === "*" || spec === "?") return "every " + unit;
    if (spec.indexOf("/") !== -1) {
      var bits = spec.split("/");
      var base = bits[0];
      var step = bits[1];
      var every = "every " + step + " " + (step === "1" ? unit : unitPlural);
      if (base === "*" || base === "0" || base === "?") return every;
      return every + " starting at " + unit + " " + base;
    }
    if (/[,-]/.test(spec)) return "at " + unitPlural + " " + spec;
    return "at " + unit + " " + spec;
  }

  function pad(n) { return String(n).length < 2 ? "0" + n : String(n); }

  function describe(cron) {
    var p = cron.parts;
    var secRaw = p[0], minRaw = p[1], hourRaw = p[2], domRaw = p[3], monRaw = p[4], dowRaw = p[5], yearRaw = p[6];

    var simple = /^\d+$/.test(secRaw) && /^\d+$/.test(minRaw) && /^\d+$/.test(hourRaw);
    var timePart;
    if (simple) {
      timePart = "at " + pad(hourRaw) + ":" + pad(minRaw) + ":" + pad(secRaw);
    } else {
      var bits = [];
      bits.push(unitPhrase(hourRaw, "hour", "hours"));
      bits.push(unitPhrase(minRaw, "minute", "minutes"));
      if (secRaw !== "0") bits.push(unitPhrase(secRaw, "second", "seconds"));
      timePart = bits.join(", ");
    }

    var dayPart;
    var domAny = domRaw === "*" || domRaw === "?";
    var dowAny = dowRaw === "*" || dowRaw === "?";

    if (domAny && dowAny) {
      dayPart = "every day";
    } else if (!dowAny) {
      if (cron.dow.nth) {
        dayPart = "on the " + ordinal(cron.dow.nth.n) + " " + DOW_LABEL[cron.dow.nth.dow] + " of the month";
      } else if (cron.dow.lastDow) {
        dayPart = "on the last " + DOW_LABEL[cron.dow.lastDow] + " of the month";
      } else {
        dayPart = "on " + cron.dow.values.map(function (v) { return DOW_LABEL[v]; }).join(", ");
      }
      if (!domAny) {
        dayPart += " or on day-of-month " + domRaw;
      }
    } else {
      if (cron.dom.lastDay) {
        dayPart = cron.dom.lastOffset
          ? "on the day " + cron.dom.lastOffset + " before the last day of the month"
          : "on the last day of the month";
      } else if (cron.dom.values.length === 1) {
        dayPart = "on day " + cron.dom.values[0] + " of the month";
      } else {
        dayPart = "on days " + cron.dom.values.join(", ") + " of the month";
      }
    }

    var monthPart = "";
    if (monRaw !== "*" && monRaw !== "?") {
      monthPart = "in " + cron.month.values.map(function (v) { return MONTH_LABEL[v]; }).join(", ");
    }

    var yearPart = "";
    if (yearRaw && yearRaw !== "*") yearPart = "during " + yearRaw;

    return ["Runs", timePart, dayPart, monthPart, yearPart].filter(Boolean).join(", ").replace("Runs,", "Runs");
  }

  function ordinal(n) {
    return { 1: "first", 2: "second", 3: "third", 4: "fourth", 5: "fifth" }[n] || (n + "th");
  }

  /* ---------------- rendering ---------------- */

  function fmt(date) {
    var days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    return days[date.getDay()] + " " + date.getFullYear() + "-" + pad(date.getMonth() + 1) + "-" +
      pad(date.getDate()) + " " + pad(date.getHours()) + ":" + pad(date.getMinutes()) + ":" + pad(date.getSeconds());
  }

  function relative(from, to) {
    var diff = Math.round((to.getTime() - from.getTime()) / 1000);
    if (diff < 60) return "in " + diff + "s";
    if (diff < 3600) return "in " + Math.round(diff / 60) + "m";
    if (diff < 86400) return "in " + (diff / 3600).toFixed(1) + "h";
    return "in " + (diff / 86400).toFixed(1) + " days";
  }

  function run() {
    MPT.clearMsg(msg);
    summaryEl.innerHTML = "";
    resultsEl.innerHTML = "";

    var text = input.value.trim();
    if (!text) {
      MPT.showMsg(msg, "Enter a cron expression, choose a preset, or use the visual builder above.", "warn");
      return;
    }

    var cron;
    try {
      cron = parseExpression(text);
    } catch (e) {
      MPT.showMsg(msg, "Invalid expression — " + e.message, "error");
      return;
    }

    var warnings = [];
    var domIsQ = cron.parts[3] === "?";
    var dowIsQ = cron.parts[5] === "?";
    if (!domIsQ && !dowIsQ) {
      warnings.push("Quartz requires exactly one of day-of-month and day-of-week to be “?”. " +
                    "Both are specified here, so the days have been combined — Quartz itself would reject this.");
    }
    if (domIsQ && dowIsQ) {
      warnings.push("Both day-of-month and day-of-week are “?”. Use “*” for the one you are not restricting.");
    }

    var now = new Date();
    var runs;
    try {
      runs = nextRuns(cron, 10, now);
    } catch (e) {
      MPT.showMsg(msg, "Could not calculate run times — " + e.message, "error");
      return;
    }

    summaryEl.innerHTML =
      '<div class="note" style="margin-top:14px;">' + MPT.icon("info") +
      "<div><strong>" + MPT.escapeHtml(describe(cron)) + "</strong></div></div>";

    if (!runs.length) {
      MPT.showMsg(msg, "The expression is syntactically valid, but it never fires within the next 8 years. " +
                       "Check for an impossible combination such as 30 February.", "warn");
      return;
    }

    resultsEl.innerHTML =
      '<div class="table-wrap"><table class="data"><thead><tr>' +
      '<th style="width:52px">#</th><th>Next run (your local time)</th><th style="width:130px">From now</th>' +
      "</tr></thead><tbody>" +
      runs.map(function (d, i) {
        return "<tr><td>" + (i + 1) + '</td><td><code class="inline">' + fmt(d) + "</code></td><td>" +
          relative(now, d) + "</td></tr>";
      }).join("") +
      "</tbody></table></div>";

    if (warnings.length) {
      MPT.showMsg(msg, "Valid, with " + warnings.length + " note(s):\n• " + warnings.join("\n• "), "warn");
    } else {
      MPT.showMsg(msg, "Valid Quartz expression. Next 10 run times are shown below.", "ok");
    }
  }

  /* ---------------- visual builder ---------------- */

  var modeSelect = document.getElementById("cb-mode");
  var fieldsWrap = document.getElementById("cb-fields");

  function numField(id, labelText, value, min, max, width) {
    return '<label class="toolbar-label" for="' + id + '">' + labelText + "</label>" +
      '<input type="number" class="input" id="' + id + '" value="' + value + '" min="' + min +
      '" max="' + max + '" style="width:' + (width || "80px") + '">';
  }

  function renderBuilderFields() {
    var mode = modeSelect.value;
    var html = "";
    if (mode === "minutes") {
      html = numField("cb-n", "Every", 5, 1, 59) + '<span class="toolbar-label">minute(s)</span>';
    } else if (mode === "hours") {
      html = numField("cb-n", "Every", 4, 1, 23) + '<span class="toolbar-label">hour(s), at minute</span>' +
             numField("cb-min", "", 0, 0, 59);
    } else if (mode === "daily") {
      html = numField("cb-hour", "At hour", 9, 0, 23) + numField("cb-min", "minute", 0, 0, 59);
    } else if (mode === "weekly") {
      html = '<span class="toolbar-label">On</span>';
      ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"].forEach(function (d, i) {
        var checked = i < 5 ? " checked" : "";
        html += '<label class="checkbox"><input type="checkbox" class="cb-day" value="' + d + '"' + checked + "> " + d + "</label>";
      });
      html += numField("cb-hour", "at hour", 9, 0, 23) + numField("cb-min", "minute", 0, 0, 59);
    } else if (mode === "monthly") {
      html = numField("cb-dom", "On day", 1, 1, 31) + numField("cb-hour", "at hour", 0, 0, 23) +
             numField("cb-min", "minute", 0, 0, 59);
    }
    fieldsWrap.innerHTML = html;
  }

  function buildFromFields() {
    var mode = modeSelect.value;
    function val(id, fallback) {
      var node = document.getElementById(id);
      if (!node) return fallback;
      var n = parseInt(node.value, 10);
      return isFinite(n) ? n : fallback;
    }

    var expr;
    if (mode === "minutes") {
      var n = Math.min(59, Math.max(1, val("cb-n", 5)));
      expr = "0 0/" + n + " * * * ?";
    } else if (mode === "hours") {
      var h = Math.min(23, Math.max(1, val("cb-n", 4)));
      expr = "0 " + val("cb-min", 0) + " 0/" + h + " * * ?";
    } else if (mode === "daily") {
      expr = "0 " + val("cb-min", 0) + " " + val("cb-hour", 9) + " * * ?";
    } else if (mode === "weekly") {
      var days = Array.prototype.slice.call(document.querySelectorAll(".cb-day:checked"))
        .map(function (c) { return c.value; });
      if (!days.length) {
        MPT.showMsg(msg, "Select at least one weekday in the builder.", "warn");
        return;
      }
      expr = "0 " + val("cb-min", 0) + " " + val("cb-hour", 9) + " ? * " + days.join(",");
    } else {
      expr = "0 " + val("cb-min", 0) + " " + val("cb-hour", 0) + " " + val("cb-dom", 1) + " * ?";
    }

    input.value = expr;
    run();
  }

  if (modeSelect && fieldsWrap) {
    modeSelect.addEventListener("change", renderBuilderFields);
    renderBuilderFields();
    document.getElementById("cb-apply").addEventListener("click", buildFromFields);
  }

  /* ---------------- wiring ---------------- */

  document.getElementById("cron-run").addEventListener("click", run);
  document.getElementById("cron-copy").addEventListener("click", function () { MPT.copy(input.value.trim()); });
  document.getElementById("cron-clear").addEventListener("click", function () {
    input.value = "";
    summaryEl.innerHTML = "";
    resultsEl.innerHTML = "";
    MPT.clearMsg(msg);
    input.focus();
  });

  Array.prototype.slice.call(document.querySelectorAll("#cron-presets [data-cron]")).forEach(function (btn) {
    btn.addEventListener("click", function () {
      input.value = btn.getAttribute("data-cron");
      run();
    });
  });

  input.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); run(); } });
  input.addEventListener("input", MPT.debounce(function () { if (input.value.trim()) run(); }, 400));

  input.value = "0 0 9 ? * MON-FRI";
  run();
})();
