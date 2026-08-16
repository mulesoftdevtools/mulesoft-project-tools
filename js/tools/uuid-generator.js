/* =====================================================================
   UUID generator — v4 (random) and v7 (time-ordered)
   ===================================================================== */
(function () {
  "use strict";

  var output = document.getElementById("uuid-output");
  var msg = document.getElementById("uuid-msg");
  var meta = document.getElementById("uuid-meta");
  if (!output) return;

  var versionSel = document.getElementById("uuid-version");
  var countInput = document.getElementById("uuid-count");
  var upperBox = document.getElementById("uuid-upper");
  var bracesBox = document.getElementById("uuid-braces");
  var nodashBox = document.getElementById("uuid-nodash");

  var usedFallbackRandom = false;

  function randomBytes(n) {
    var bytes = new Uint8Array(n);
    if (window.crypto && window.crypto.getRandomValues) {
      window.crypto.getRandomValues(bytes);
    } else {
      usedFallbackRandom = true;
      for (var i = 0; i < n; i++) bytes[i] = Math.floor(Math.random() * 256);
    }
    return bytes;
  }

  function bytesToUuid(bytes) {
    var hex = "";
    for (var i = 0; i < 16; i++) hex += (bytes[i] < 16 ? "0" : "") + bytes[i].toString(16);
    return hex.slice(0, 8) + "-" + hex.slice(8, 12) + "-" + hex.slice(12, 16) + "-" +
           hex.slice(16, 20) + "-" + hex.slice(20, 32);
  }

  function uuidV4() {
    var bytes = randomBytes(16);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;  // version 4
    bytes[8] = (bytes[8] & 0x3f) | 0x80;  // RFC 4122 variant
    return bytesToUuid(bytes);
  }

  // Monotonic counter so several v7 values minted inside the same millisecond
  // still sort in generation order (the "monotonic random" method in RFC 9562).
  var lastV7Ms = -1;
  var v7Counter = 0;

  function uuidV7() {
    var bytes = randomBytes(16);
    var ms = Date.now();

    if (ms === lastV7Ms) {
      v7Counter++;
      if (v7Counter > 0xfff) {           // 12-bit counter exhausted — wait for the next millisecond
        while (Date.now() === lastV7Ms) { /* spin briefly */ }
        ms = Date.now();
        lastV7Ms = ms;
        v7Counter = 0;
      }
    } else {
      lastV7Ms = ms;
      v7Counter = 0;
    }

    // 48-bit big-endian millisecond timestamp
    bytes[0] = Math.floor(ms / 1099511627776) & 0xff;
    bytes[1] = Math.floor(ms / 4294967296) & 0xff;
    bytes[2] = Math.floor(ms / 16777216) & 0xff;
    bytes[3] = Math.floor(ms / 65536) & 0xff;
    bytes[4] = Math.floor(ms / 256) & 0xff;
    bytes[5] = ms & 0xff;

    // version 7 + 12-bit monotonic counter in rand_a
    bytes[6] = 0x70 | ((v7Counter >> 8) & 0x0f);
    bytes[7] = v7Counter & 0xff;

    bytes[8] = (bytes[8] & 0x3f) | 0x80;  // RFC 4122 variant
    return bytesToUuid(bytes);
  }

  function format(uuid) {
    var out = uuid;
    if (nodashBox && nodashBox.checked) out = out.replace(/-/g, "");
    if (upperBox && upperBox.checked) out = out.toUpperCase();
    if (bracesBox && bracesBox.checked) out = "{" + out + "}";
    return out;
  }

  function generate() {
    MPT.clearMsg(msg);
    usedFallbackRandom = false;

    var raw = parseInt(countInput.value, 10);
    if (!isFinite(raw) || raw < 1) raw = 1;
    var clampNote = "";
    if (raw > 1000) { raw = 1000; clampNote = " (capped at 1000)"; }
    countInput.value = raw;

    var version = versionSel.value;
    var list = [];
    for (var i = 0; i < raw; i++) {
      if (version === "4") list.push(format(uuidV4()));
      else if (version === "7") list.push(format(uuidV7()));
      else list.push(format("00000000-0000-0000-0000-000000000000"));
    }

    var text = list.join("\n");
    output.textContent = text;
    if (meta) meta.textContent = list.length + " generated · " + MPT.formatBytes(new Blob([text]).size);

    var label = version === "4" ? "version 4 (random)"
      : version === "7" ? "version 7 (time-ordered)" : "nil";
    var note = "Generated " + list.length + " " + label + " UUID" + (list.length === 1 ? "" : "s") + clampNote + ".";

    if (version === "7") {
      note += " Version 7 values sort chronologically, which keeps database indexes compact.";
    }
    if (usedFallbackRandom) {
      MPT.showMsg(msg, note + " Warning: this browser does not expose crypto.getRandomValues, so " +
                       "Math.random() was used. Do not use these values where unpredictability matters.", "warn");
    } else {
      MPT.showMsg(msg, note, "ok");
    }
  }

  document.getElementById("uuid-run").addEventListener("click", generate);
  document.getElementById("uuid-copy").addEventListener("click", function () {
    if (!output.textContent) { MPT.toast("Generate some UUIDs first"); return; }
    MPT.copy(output.textContent);
  });
  document.getElementById("uuid-download").addEventListener("click", function () {
    if (!output.textContent) { MPT.toast("Generate some UUIDs first"); return; }
    MPT.download("uuids.txt", output.textContent);
  });
  document.getElementById("uuid-clear").addEventListener("click", function () {
    output.textContent = "";
    if (meta) meta.textContent = "";
    MPT.clearMsg(msg);
  });

  [versionSel, upperBox, bracesBox, nodashBox].forEach(function (node) {
    if (node) node.addEventListener("change", generate);
  });
  countInput.addEventListener("change", generate);

  generate();
})();
