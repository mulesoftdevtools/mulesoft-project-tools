/* =====================================================================
   Epoch / timestamp converter
   ===================================================================== */
(function () {
  "use strict";

  var nowSeconds = document.getElementById("now-seconds");
  var nowMillis = document.getElementById("now-millis");
  var nowTz = document.getElementById("now-tz");
  if (!nowSeconds) return;

  /* ---------------- live clock ---------------- */
  function tick() {
    var now = Date.now();
    nowSeconds.textContent = Math.floor(now / 1000);
    nowMillis.textContent = now;
  }
  tick();
  setInterval(tick, 1000);

  try {
    var tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "unknown";
    var offset = -new Date().getTimezoneOffset();
    var sign = offset >= 0 ? "+" : "-";
    var abs = Math.abs(offset);
    nowTz.textContent = tz + " (UTC" + sign + pad(Math.floor(abs / 60)) + ":" + pad(abs % 60) + ")";
  } catch (e) {
    nowTz.textContent = "UTC" + (new Date().getTimezoneOffset() > 0 ? "-" : "+") +
      Math.abs(new Date().getTimezoneOffset() / 60);
  }

  document.getElementById("ts-copy-seconds").addEventListener("click", function () {
    MPT.copy(nowSeconds.textContent);
  });
  document.getElementById("ts-copy-millis").addEventListener("click", function () {
    MPT.copy(nowMillis.textContent);
  });

  /* ---------------- helpers ---------------- */
  function pad(n, width) {
    var s = String(Math.abs(n));
    while (s.length < (width || 2)) s = "0" + s;
    return (n < 0 ? "-" : "") + s;
  }

  function relative(ms) {
    var diff = ms - Date.now();
    var future = diff >= 0;
    var abs = Math.abs(diff);
    var value, unit;
    if (abs < 1000) return "right now";
    if (abs < 60000) { value = Math.round(abs / 1000); unit = "second"; }
    else if (abs < 3600000) { value = Math.round(abs / 60000); unit = "minute"; }
    else if (abs < 86400000) { value = Math.round(abs / 3600000); unit = "hour"; }
    else if (abs < 2629800000) { value = Math.round(abs / 86400000); unit = "day"; }
    else if (abs < 31557600000) { value = Math.round(abs / 2629800000); unit = "month"; }
    else { value = (abs / 31557600000).toFixed(1); unit = "year"; }
    var plural = String(value) === "1" ? "" : "s";
    return future ? "in " + value + " " + unit + plural : value + " " + unit + plural + " ago";
  }

  function localString(d) {
    return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()) + " " +
           pad(d.getHours()) + ":" + pad(d.getMinutes()) + ":" + pad(d.getSeconds());
  }

  function utcString(d) {
    return d.getUTCFullYear() + "-" + pad(d.getUTCMonth() + 1) + "-" + pad(d.getUTCDate()) + " " +
           pad(d.getUTCHours()) + ":" + pad(d.getUTCMinutes()) + ":" + pad(d.getUTCSeconds()) + " UTC";
  }

  function rowsTable(rows) {
    var esc = MPT.escapeHtml;
    return '<div class="table-wrap"><table class="data"><tbody>' +
      rows.map(function (r) {
        return '<tr><th class="row-key">' + esc(r[0]) + "</th>" +
          '<td><code class="inline" style="word-break:break-all">' + esc(r[1]) + "</code></td>" +
          '<td style="width:70px"><button type="button" class="btn btn-ghost btn-sm" data-copy="' +
          esc(r[1]) + '">Copy</button></td></tr>';
      }).join("") + "</tbody></table></div>";
  }

  function wireCopy(container) {
    Array.prototype.slice.call(container.querySelectorAll("[data-copy]")).forEach(function (btn) {
      btn.addEventListener("click", function () { MPT.copy(btn.getAttribute("data-copy")); });
    });
  }

  function describe(d) {
    var days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    var start = new Date(d.getFullYear(), 0, 1);
    var dayOfYear = Math.floor((d - start) / 86400000) + 1;
    return [
      ["Local time", localString(d)],
      ["UTC", utcString(d)],
      ["ISO 8601", d.toISOString()],
      ["RFC 2822", d.toUTCString()],
      ["Epoch seconds", String(Math.floor(d.getTime() / 1000))],
      ["Epoch milliseconds", String(d.getTime())],
      ["Relative", relative(d.getTime())],
      ["Day of week", days[d.getDay()]],
      ["Day of year", String(dayOfYear)]
    ];
  }

  /* ---------------- timestamp → date ---------------- */
  var epochInput = document.getElementById("ts-epoch-input");
  var unitSel = document.getElementById("ts-unit");
  var decodeMsg = document.getElementById("ts-decode-msg");
  var decodeResults = document.getElementById("ts-decode-results");

  function decode() {
    MPT.clearMsg(decodeMsg);
    decodeResults.innerHTML = "";

    var raw = epochInput.value.trim().replace(/[,_\s]/g, "");
    if (!raw) {
      MPT.showMsg(decodeMsg, "Enter an epoch timestamp, or press “Use now”.", "warn");
      return;
    }
    if (!/^-?\d+(\.\d+)?$/.test(raw)) {
      MPT.showMsg(decodeMsg, "“" + epochInput.value.trim() + "” is not a number. Epoch timestamps are plain " +
                             "integers — to convert a written date, use the “Date → timestamp” panel below.", "error");
      return;
    }

    var value = parseFloat(raw);
    var unit = unitSel.value;
    var detected = unit;

    if (unit === "auto") {
      var digits = raw.replace(/^-/, "").split(".")[0].length;
      if (digits >= 16) detected = "us";
      else if (digits >= 14) detected = "us";
      else if (digits >= 12) detected = "ms";
      else detected = "s";
    }

    var ms;
    if (detected === "ms") ms = value;
    else if (detected === "us") ms = value / 1000;
    else ms = value * 1000;

    var date = new Date(ms);
    if (isNaN(date.getTime())) {
      MPT.showMsg(decodeMsg, "That value does not map to a valid date. JavaScript dates span roughly " +
                             "±8.64e15 milliseconds around 1970.", "error");
      return;
    }

    decodeResults.innerHTML = rowsTable(describe(date));
    wireCopy(decodeResults);

    var unitLabel = detected === "ms" ? "milliseconds" : (detected === "us" ? "microseconds" : "seconds");
    MPT.showMsg(decodeMsg, "Interpreted " + raw + " as epoch " + unitLabel +
      (unit === "auto" ? " (auto-detected from the number of digits)." : "."), "ok");
  }

  document.getElementById("ts-decode").addEventListener("click", decode);
  document.getElementById("ts-now-epoch").addEventListener("click", function () {
    epochInput.value = String(Math.floor(Date.now() / 1000));
    unitSel.value = "s";
    decode();
  });
  epochInput.addEventListener("input", MPT.debounce(function () {
    if (epochInput.value.trim()) decode(); else { MPT.clearMsg(decodeMsg); decodeResults.innerHTML = ""; }
  }, 300));
  epochInput.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); decode(); } });
  unitSel.addEventListener("change", function () { if (epochInput.value.trim()) decode(); });

  /* ---------------- date → timestamp ---------------- */
  var dateInput = document.getElementById("ts-date-input");
  var zoneSel = document.getElementById("ts-date-zone");
  var encodeMsg = document.getElementById("ts-encode-msg");
  var encodeResults = document.getElementById("ts-encode-results");

  function parseDate(text, asUtc) {
    var trimmed = text.trim();

    // "YYYY-MM-DD HH:MM(:SS)" — normalise the space so every browser parses it the same way
    var m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?(?:\.(\d{1,3}))?$/.exec(trimmed);
    if (m) {
      var y = +m[1], mo = +m[2] - 1, d = +m[3], h = +m[4], mi = +m[5], s = +(m[6] || 0), ms = +(m[7] || 0);
      return asUtc ? new Date(Date.UTC(y, mo, d, h, mi, s, ms)) : new Date(y, mo, d, h, mi, s, ms);
    }

    // date only
    var dOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
    if (dOnly) {
      var yy = +dOnly[1], mm = +dOnly[2] - 1, dd = +dOnly[3];
      return asUtc ? new Date(Date.UTC(yy, mm, dd)) : new Date(yy, mm, dd);
    }

    // anything with an explicit zone or a format the engine understands
    var parsed = new Date(trimmed);
    if (!isNaN(parsed.getTime())) return parsed;
    return null;
  }

  function encode() {
    MPT.clearMsg(encodeMsg);
    encodeResults.innerHTML = "";

    var text = dateInput.value.trim();
    if (!text) {
      MPT.showMsg(encodeMsg, "Enter a date, or press “Use now”.", "warn");
      return;
    }

    var asUtc = zoneSel.value === "utc";
    var date = parseDate(text, asUtc);

    if (!date || isNaN(date.getTime())) {
      MPT.showMsg(encodeMsg, "That date could not be understood. Try a format such as " +
                             "2026-08-16, 2026-08-16 14:30:00, or 2026-08-16T14:30:00Z.", "error");
      return;
    }

    var hasExplicitZone = /[zZ]$|[+-]\d{2}:?\d{2}$/.test(text);
    encodeResults.innerHTML = rowsTable(describe(date));
    wireCopy(encodeResults);

    var note = hasExplicitZone
      ? "The input carried its own UTC offset, so the zone selector was ignored."
      : (asUtc ? "Interpreted as UTC." : "Interpreted in your local time zone.");
    MPT.showMsg(encodeMsg, "Converted. " + note, "ok");
  }

  document.getElementById("ts-encode").addEventListener("click", encode);
  document.getElementById("ts-now-date").addEventListener("click", function () {
    var d = new Date();
    zoneSel.value = "local";
    dateInput.value = localString(d);
    encode();
  });
  dateInput.addEventListener("input", MPT.debounce(function () {
    if (dateInput.value.trim()) encode(); else { MPT.clearMsg(encodeMsg); encodeResults.innerHTML = ""; }
  }, 400));
  dateInput.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); encode(); } });
  zoneSel.addEventListener("change", function () { if (dateInput.value.trim()) encode(); });
})();
