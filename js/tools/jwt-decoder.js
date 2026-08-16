/* =====================================================================
   JWT decoder — header, payload and claim summary (no signature check)
   ===================================================================== */
(function () {
  "use strict";

  var input = document.getElementById("jwt-input");
  var msg = document.getElementById("jwt-msg");
  var headerEl = document.getElementById("jwt-header");
  var payloadEl = document.getElementById("jwt-payload");
  var claimsEl = document.getElementById("jwt-claims");
  var meta = document.getElementById("jwt-input-meta");
  if (!input) return;

  var SAMPLE = [
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCIsImtpZCI6ImtleS0yMDI2LTA4In0",
    "eyJzdWIiOiJ1c2VyLTQyIiwibmFtZSI6IkFkYSBMb3ZlbGFjZSIsImlzcyI6Imh0dHBzOi8vYXV0aC5leGFtcGxlLmNvbS8iLCJhdWQiOlsib3JkZXJzLWFwaSIsInJlcG9ydGluZy1hcGkiXSwic2NvcGUiOiJvcmRlcnM6cmVhZCBvcmRlcnM6d3JpdGUiLCJpYXQiOjE3MDAwMDAwMDAsIm5iZiI6MTcwMDAwMDAwMCwiZXhwIjoxNzMxNjIyNDAwLCJqdGkiOiJhNGYzYzJlMS05OWJhIn0",
    "s0m3-s1gnatur3-that-is-not-verified"
  ].join(".");

  var CLAIM_LABELS = {
    iss: "Issuer (iss)", sub: "Subject (sub)", aud: "Audience (aud)",
    exp: "Expires at (exp)", nbf: "Not valid before (nbf)", iat: "Issued at (iat)",
    jti: "JWT ID (jti)", scope: "Scope", scp: "Scope (scp)", azp: "Authorized party (azp)",
    client_id: "Client ID", typ: "Type (typ)", name: "Name", email: "Email",
    preferred_username: "Username"
  };

  function base64UrlDecode(part) {
    var b64 = String(part).replace(/-/g, "+").replace(/_/g, "/");
    while (b64.length % 4 !== 0) b64 += "=";
    if (!/^[A-Za-z0-9+/]*={0,2}$/.test(b64)) {
      throw new Error("it contains characters that are not valid base64url");
    }
    var binary;
    try {
      binary = atob(b64);
    } catch (e) {
      throw new Error("it is not valid base64url");
    }
    var bytes = new Uint8Array(binary.length);
    for (var i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    if (window.TextDecoder) return new TextDecoder("utf-8").decode(bytes);
    return decodeURIComponent(escape(binary));
  }

  function fmtDate(seconds) {
    var d = new Date(seconds * 1000);
    if (isNaN(d.getTime())) return String(seconds);
    return d.toISOString().replace("T", " ").replace(/\.\d+Z$/, " UTC") +
           "  ·  local: " + d.toLocaleString();
  }

  function relative(seconds) {
    var diff = seconds * 1000 - Date.now();
    var abs = Math.abs(diff);
    var unit, value;
    if (abs < 60000) { value = Math.round(abs / 1000); unit = "second"; }
    else if (abs < 3600000) { value = Math.round(abs / 60000); unit = "minute"; }
    else if (abs < 86400000) { value = Math.round(abs / 3600000); unit = "hour"; }
    else { value = Math.round(abs / 86400000); unit = "day"; }
    var plural = value === 1 ? "" : "s";
    return diff >= 0 ? "in " + value + " " + unit + plural : value + " " + unit + plural + " ago";
  }

  function renderClaims(header, payload) {
    var esc = MPT.escapeHtml;
    var rows = [];
    var now = Math.floor(Date.now() / 1000);
    var status = null;

    if (header && header.alg) {
      rows.push(["Algorithm (alg)", esc(String(header.alg)) +
        (String(header.alg).toLowerCase() === "none"
          ? ' <span class="pill pill-error">unsigned</span>' : "")]);
    }
    if (header && header.kid) rows.push(["Key ID (kid)", esc(String(header.kid))]);

    ["iss", "sub", "aud", "azp", "client_id", "name", "email", "preferred_username", "scope", "scp", "jti"]
      .forEach(function (key) {
        if (payload[key] === undefined) return;
        var value = Array.isArray(payload[key]) ? payload[key].join(", ") : String(payload[key]);
        rows.push([CLAIM_LABELS[key] || key, esc(value)]);
      });

    ["iat", "nbf", "exp"].forEach(function (key) {
      if (payload[key] === undefined) return;
      var value = payload[key];
      if (typeof value !== "number") {
        rows.push([CLAIM_LABELS[key], esc(String(value)) +
          ' <span class="pill pill-warning">not a number</span>']);
        return;
      }
      var extra = " <span style=\"color:var(--text-faint)\">(" + relative(value) + ")</span>";
      var badge = "";
      if (key === "exp") {
        if (value * 1000 < Date.now()) { badge = ' <span class="pill pill-error">EXPIRED</span>'; status = "expired"; }
        else badge = ' <span class="pill pill-post">valid</span>';
      }
      if (key === "nbf" && value > now) {
        badge = ' <span class="pill pill-warning">not yet valid</span>';
        if (status !== "expired") status = "notyet";
      }
      rows.push([CLAIM_LABELS[key], esc(fmtDate(value)) + extra + badge]);
    });

    var known = ["iss", "sub", "aud", "azp", "client_id", "name", "email", "preferred_username",
                 "scope", "scp", "jti", "iat", "nbf", "exp"];
    var custom = Object.keys(payload).filter(function (k) { return known.indexOf(k) === -1; });
    custom.forEach(function (key) {
      var value = payload[key];
      var text = (value !== null && typeof value === "object") ? JSON.stringify(value) : String(value);
      if (text.length > 160) text = text.slice(0, 160) + "…";
      rows.push([esc(key), esc(text)]);
    });

    if (!rows.length) {
      claimsEl.innerHTML = "";
      return status;
    }

    claimsEl.innerHTML = '<div class="table-wrap"><table class="data"><tbody>' +
      rows.map(function (r) {
        return '<tr><th class="row-key">' + r[0] + "</th><td>" + r[1] + "</td></tr>";
      }).join("") + "</tbody></table></div>";
    return status;
  }

  function decode() {
    MPT.clearMsg(msg);
    headerEl.textContent = "";
    payloadEl.textContent = "";
    claimsEl.innerHTML = "";

    var token = input.value.trim().replace(/^Bearer\s+/i, "").replace(/\s+/g, "");
    if (!token) {
      MPT.showMsg(msg, "Paste a JSON Web Token to decode, or press “Load example”.", "warn");
      return;
    }

    var parts = token.split(".");
    if (parts.length !== 3) {
      MPT.showMsg(msg, "This does not look like a JWT. A JWT has exactly three dot-separated parts " +
                       "(header.payload.signature) — this input has " + parts.length + ".", "error");
      return;
    }

    var header, payload;
    try {
      header = JSON.parse(base64UrlDecode(parts[0]));
    } catch (e) {
      MPT.showMsg(msg, "The header could not be decoded — " + e.message + ".", "error");
      return;
    }
    try {
      payload = JSON.parse(base64UrlDecode(parts[1]));
    } catch (e) {
      MPT.showMsg(msg, "The payload could not be decoded — " + e.message + ".", "error");
      return;
    }

    headerEl.textContent = JSON.stringify(header, null, 2);
    payloadEl.textContent = JSON.stringify(payload, null, 2);

    var status = renderClaims(header, payload || {});
    var signatureNote = parts[2] ? "" : " This token has an empty signature segment.";

    if (status === "expired") {
      MPT.showMsg(msg, "Decoded. This token has EXPIRED — the exp claim is in the past. " +
                       "The signature was not verified." + signatureNote, "warn");
    } else if (status === "notyet") {
      MPT.showMsg(msg, "Decoded. This token is not valid yet — its nbf claim is in the future. " +
                       "The signature was not verified." + signatureNote, "warn");
    } else {
      MPT.showMsg(msg, "Decoded successfully. The signature was not verified — that requires the signing key." +
                       signatureNote, "ok");
    }
  }

  function updateMeta() { if (meta) meta.textContent = MPT.textStats(input.value); }

  document.getElementById("jwt-run").addEventListener("click", decode);
  document.getElementById("jwt-sample").addEventListener("click", function () {
    input.value = SAMPLE;
    updateMeta();
    decode();
  });
  document.getElementById("jwt-clear").addEventListener("click", function () {
    input.value = "";
    headerEl.textContent = "";
    payloadEl.textContent = "";
    claimsEl.innerHTML = "";
    MPT.clearMsg(msg);
    updateMeta();
    input.focus();
  });
  document.getElementById("jwt-copy-header").addEventListener("click", function () { MPT.copy(headerEl.textContent); });
  document.getElementById("jwt-copy-payload").addEventListener("click", function () { MPT.copy(payloadEl.textContent); });

  input.addEventListener("input", function () {
    updateMeta();
    debouncedDecode();
  });
  var debouncedDecode = MPT.debounce(function () {
    if (input.value.trim()) decode(); else MPT.clearMsg(msg);
  }, 350);

  updateMeta();
})();
