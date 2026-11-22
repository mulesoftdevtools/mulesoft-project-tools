/* =====================================================================
   Password & secret key generator
   Uses crypto.getRandomValues with rejection sampling (no modulo bias).
   Formats: password, hex, Base64, Base64URL, and Mule secure-properties
   keys (16 / 24 / 32 bytes for AES-128/192/256).
   ===================================================================== */
(function () {
  "use strict";

  var $ = function (id) { return document.getElementById(id); };
  var fmt = $("sg-format"), len = $("sg-length"), count = $("sg-count");
  var lower = $("sg-lower"), upper = $("sg-upper"), digits = $("sg-digits"), symbols = $("sg-symbols"), ambiguous = $("sg-ambiguous");
  var out = $("sg-output"), msg = $("sg-msg"), lenLabel = $("sg-length-label"), charsetRow = $("sg-charset");
  if (!fmt || !out) return;

  var SETS = {
    lower: "abcdefghijklmnopqrstuvwxyz",
    upper: "ABCDEFGHIJKLMNOPQRSTUVWXYZ",
    digits: "0123456789",
    symbols: "!@#%^&*()-_=+[]{};:,.?~"
  };
  var AMBIGUOUS = /[O0oIl1|`'"]/g;

  function randomInt(max) {
    // uniform integer in [0, max)
    var limit = Math.floor(0x100000000 / max) * max, buf = new Uint32Array(1);
    do { crypto.getRandomValues(buf); } while (buf[0] >= limit);
    return buf[0] % max;
  }

  function randomBytes(n) { var b = new Uint8Array(n); crypto.getRandomValues(b); return b; }

  function toHex(b) { return Array.prototype.map.call(b, function (x) { return ("0" + x.toString(16)).slice(-2); }).join(""); }
  function toB64(b) { var s = ""; for (var i = 0; i < b.length; i++) s += String.fromCharCode(b[i]); return btoa(s); }

  function password(n, pools) {
    var all = pools.join("");
    var chars = [];
    // guarantee at least one character from each selected set
    pools.forEach(function (p) { if (chars.length < n) chars.push(p.charAt(randomInt(p.length))); });
    while (chars.length < n) chars.push(all.charAt(randomInt(all.length)));
    for (var i = chars.length - 1; i > 0; i--) { var j = randomInt(i + 1); var t = chars[i]; chars[i] = chars[j]; chars[j] = t; }
    return chars.join("");
  }

  function updateUi() {
    var f = fmt.value;
    var isPw = f === "password";
    charsetRow.style.display = isPw ? "" : "none";
    len.disabled = /^aes/.test(f);
    lenLabel.textContent = isPw ? "Length (characters)" : "Length (bytes)";
    if (f === "aes128") len.value = 16;
    if (f === "aes192") len.value = 24;
    if (f === "aes256") len.value = 32;
  }

  var lastText = "";

  function generate() {
    var f = fmt.value;
    var n = Math.max(1, Math.min(parseInt(len.value, 10) || 0, 1024));
    var c = Math.max(1, Math.min(parseInt(count.value, 10) || 1, 500));
    var results = [], bits;
    if (f === "password") {
      var pools = [];
      [["lower", lower], ["upper", upper], ["digits", digits], ["symbols", symbols]].forEach(function (pair) {
        if (pair[1].checked) pools.push(ambiguous.checked ? SETS[pair[0]].replace(AMBIGUOUS, "") : SETS[pair[0]]);
      });
      if (!pools.length) { MPT.showMsg(msg, "Pick at least one character set.", "warn"); return; }
      if (n < pools.length) { MPT.showMsg(msg, "The length must be at least " + pools.length + " to include every selected character set.", "warn"); return; }
      var size = pools.join("").length;
      bits = n * Math.log2(size);
      for (var i = 0; i < c; i++) results.push(password(n, pools));
    } else {
      bits = n * 8;
      for (var k = 0; k < c; k++) {
        var b = randomBytes(n);
        if (f === "hex") results.push(toHex(b));
        else if (f === "base64url") results.push(toB64(b).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""));
        else if (/^aes/.test(f)) results.push(toB64(b).replace(/[^A-Za-z0-9]/g, "").slice(0, n));
        else results.push(toB64(b));
      }
      if (/^aes/.test(f)) {
        // regenerate any key that lost characters when stripping non-alphanumerics
        results = results.map(function (r) {
          while (r.length < n) r += toB64(randomBytes(n)).replace(/[^A-Za-z0-9]/g, "");
          return r.slice(0, n);
        });
        bits = n * Math.log2(62);
      }
    }
    lastText = results.join("\n");
    out.textContent = lastText;
    var strength = bits >= 128 ? "excellent" : bits >= 80 ? "strong" : bits >= 60 ? "reasonable" : "weak";
    var note = /^aes/.test(f)
      ? " Use it as the key for the Mule secure-properties tool and the secure-properties:config element (AES, " + (n * 8) + "-bit key length)."
      : "";
    MPT.showMsg(msg, "Generated " + c + " value(s) with about " + Math.round(bits) + " bits of entropy each (" + strength + ")." + note,
      bits >= 60 ? "ok" : "warn");
  }

  fmt.addEventListener("change", function () { updateUi(); generate(); });
  [len, count, lower, upper, digits, symbols, ambiguous].forEach(function (n) { n.addEventListener("change", generate); });
  $("sg-run").addEventListener("click", generate);
  $("sg-copy").addEventListener("click", function () { MPT.copy(lastText); });
  $("sg-download").addEventListener("click", function () { MPT.download("secrets.txt", lastText); });

  updateUi();
  generate();
})();
