/* =====================================================================
   Hash generator — MD5, SHA-1, SHA-256 in pure JavaScript,
   SHA-384 / SHA-512 via Web Crypto when it is available.
   ===================================================================== */
(function () {
  "use strict";

  /* ---------------- byte helpers ---------------- */
  function utf8Bytes(str) {
    if (window.TextEncoder) return new TextEncoder().encode(str);
    var esc = unescape(encodeURIComponent(str));
    var bytes = new Uint8Array(esc.length);
    for (var i = 0; i < esc.length; i++) bytes[i] = esc.charCodeAt(i);
    return bytes;
  }

  function toHex(bytes) {
    var hex = "";
    for (var i = 0; i < bytes.length; i++) {
      hex += (bytes[i] < 16 ? "0" : "") + bytes[i].toString(16);
    }
    return hex;
  }

  function rotl(x, n) { return ((x << n) | (x >>> (32 - n))) >>> 0; }
  function rotr(x, n) { return ((x >>> n) | (x << (32 - n))) >>> 0; }

  /* ---------------- MD5 ---------------- */
  var MD5_S = [
    7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
    5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
    4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
    6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21
  ];
  var MD5_K = (function () {
    var k = new Uint32Array(64);
    for (var i = 0; i < 64; i++) k[i] = Math.floor(Math.abs(Math.sin(i + 1)) * 4294967296);
    return k;
  })();

  function md5(bytes) {
    var len = bytes.length;
    var bitLenLo = (len << 3) >>> 0;
    var bitLenHi = Math.floor(len / 536870912) >>> 0;

    var padded = new Uint8Array((((len + 8) >> 6) + 1) * 64);
    padded.set(bytes);
    padded[len] = 0x80;
    var dv = new DataView(padded.buffer);
    dv.setUint32(padded.length - 8, bitLenLo, true);
    dv.setUint32(padded.length - 4, bitLenHi, true);

    var a0 = 0x67452301, b0 = 0xefcdab89, c0 = 0x98badcfe, d0 = 0x10325476;
    var m = new Uint32Array(16);

    for (var offset = 0; offset < padded.length; offset += 64) {
      for (var i = 0; i < 16; i++) m[i] = dv.getUint32(offset + i * 4, true);

      var a = a0, b = b0, c = c0, d = d0;
      for (var j = 0; j < 64; j++) {
        var f, g;
        if (j < 16) { f = (b & c) | (~b & d); g = j; }
        else if (j < 32) { f = (d & b) | (~d & c); g = (5 * j + 1) & 15; }
        else if (j < 48) { f = b ^ c ^ d; g = (3 * j + 5) & 15; }
        else { f = c ^ (b | ~d); g = (7 * j) & 15; }

        f = (f + a + MD5_K[j] + m[g]) >>> 0;
        a = d; d = c; c = b;
        b = (b + rotl(f, MD5_S[j])) >>> 0;
      }
      a0 = (a0 + a) >>> 0; b0 = (b0 + b) >>> 0;
      c0 = (c0 + c) >>> 0; d0 = (d0 + d) >>> 0;
    }

    var out = new Uint8Array(16);
    var odv = new DataView(out.buffer);
    odv.setUint32(0, a0, true); odv.setUint32(4, b0, true);
    odv.setUint32(8, c0, true); odv.setUint32(12, d0, true);
    return toHex(out);
  }

  /* ---------------- SHA-1 ---------------- */
  function sha1(bytes) {
    var len = bytes.length;
    var padded = new Uint8Array((((len + 8) >> 6) + 1) * 64);
    padded.set(bytes);
    padded[len] = 0x80;
    var dv = new DataView(padded.buffer);
    dv.setUint32(padded.length - 8, Math.floor(len / 536870912), false);
    dv.setUint32(padded.length - 4, (len << 3) >>> 0, false);

    var h0 = 0x67452301, h1 = 0xEFCDAB89, h2 = 0x98BADCFE, h3 = 0x10325476, h4 = 0xC3D2E1F0;
    var w = new Uint32Array(80);

    for (var offset = 0; offset < padded.length; offset += 64) {
      for (var i = 0; i < 16; i++) w[i] = dv.getUint32(offset + i * 4, false);
      for (var t = 16; t < 80; t++) w[t] = rotl(w[t - 3] ^ w[t - 8] ^ w[t - 14] ^ w[t - 16], 1);

      var a = h0, b = h1, c = h2, d = h3, e = h4;
      for (var j = 0; j < 80; j++) {
        var f, k;
        if (j < 20) { f = (b & c) | (~b & d); k = 0x5A827999; }
        else if (j < 40) { f = b ^ c ^ d; k = 0x6ED9EBA1; }
        else if (j < 60) { f = (b & c) | (b & d) | (c & d); k = 0x8F1BBCDC; }
        else { f = b ^ c ^ d; k = 0xCA62C1D6; }
        var temp = (rotl(a, 5) + f + e + k + w[j]) >>> 0;
        e = d; d = c; c = rotl(b, 30); b = a; a = temp;
      }
      h0 = (h0 + a) >>> 0; h1 = (h1 + b) >>> 0; h2 = (h2 + c) >>> 0;
      h3 = (h3 + d) >>> 0; h4 = (h4 + e) >>> 0;
    }

    var out = new Uint8Array(20);
    var odv = new DataView(out.buffer);
    [h0, h1, h2, h3, h4].forEach(function (h, i) { odv.setUint32(i * 4, h, false); });
    return toHex(out);
  }

  /* ---------------- SHA-256 ---------------- */
  var SHA256_K = new Uint32Array([
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
  ]);

  function sha256(bytes) {
    var len = bytes.length;
    var padded = new Uint8Array((((len + 8) >> 6) + 1) * 64);
    padded.set(bytes);
    padded[len] = 0x80;
    var dv = new DataView(padded.buffer);
    dv.setUint32(padded.length - 8, Math.floor(len / 536870912), false);
    dv.setUint32(padded.length - 4, (len << 3) >>> 0, false);

    var h = new Uint32Array([
      0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
      0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19
    ]);
    var w = new Uint32Array(64);

    for (var offset = 0; offset < padded.length; offset += 64) {
      for (var i = 0; i < 16; i++) w[i] = dv.getUint32(offset + i * 4, false);
      for (var t = 16; t < 64; t++) {
        var s0 = rotr(w[t - 15], 7) ^ rotr(w[t - 15], 18) ^ (w[t - 15] >>> 3);
        var s1 = rotr(w[t - 2], 17) ^ rotr(w[t - 2], 19) ^ (w[t - 2] >>> 10);
        w[t] = (w[t - 16] + s0 + w[t - 7] + s1) >>> 0;
      }

      var a = h[0], b = h[1], c = h[2], d = h[3], e = h[4], f = h[5], g = h[6], hh = h[7];

      for (var j = 0; j < 64; j++) {
        var S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
        var ch = (e & f) ^ (~e & g);
        var temp1 = (hh + S1 + ch + SHA256_K[j] + w[j]) >>> 0;
        var S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
        var maj = (a & b) ^ (a & c) ^ (b & c);
        var temp2 = (S0 + maj) >>> 0;

        hh = g; g = f; f = e;
        e = (d + temp1) >>> 0;
        d = c; c = b; b = a;
        a = (temp1 + temp2) >>> 0;
      }

      h[0] = (h[0] + a) >>> 0; h[1] = (h[1] + b) >>> 0; h[2] = (h[2] + c) >>> 0; h[3] = (h[3] + d) >>> 0;
      h[4] = (h[4] + e) >>> 0; h[5] = (h[5] + f) >>> 0; h[6] = (h[6] + g) >>> 0; h[7] = (h[7] + hh) >>> 0;
    }

    var out = new Uint8Array(32);
    var odv = new DataView(out.buffer);
    for (var k = 0; k < 8; k++) odv.setUint32(k * 4, h[k], false);
    return toHex(out);
  }

  /* ---------------- Web Crypto (SHA-384 / SHA-512) ---------------- */
  function webCryptoHash(algorithm, bytes) {
    if (!window.crypto || !window.crypto.subtle || !window.crypto.subtle.digest) {
      return Promise.resolve(null);
    }
    try {
      return window.crypto.subtle.digest(algorithm, bytes)
        .then(function (buffer) { return toHex(new Uint8Array(buffer)); })
        .catch(function () { return null; });
    } catch (e) {
      return Promise.resolve(null);
    }
  }

  /* expose for automated testing */
  window.MPT_HASH = { md5: md5, sha1: sha1, sha256: sha256, utf8Bytes: utf8Bytes };

  /* ---------------- UI ---------------- */
  var input = document.getElementById("hash-input");
  var results = document.getElementById("hash-results");
  var msg = document.getElementById("hash-msg");
  var meta = document.getElementById("hash-input-meta");
  var upper = document.getElementById("hash-upper");
  if (!input) return;

  var ALGORITHMS = [
    { key: "md5", label: "MD5", bits: 128, weak: true },
    { key: "sha1", label: "SHA-1", bits: 160, weak: true },
    { key: "sha256", label: "SHA-256", bits: 256 },
    { key: "sha384", label: "SHA-384", bits: 384, webcrypto: "SHA-384" },
    { key: "sha512", label: "SHA-512", bits: 512, webcrypto: "SHA-512" }
  ];

  function rowHtml(algo, value) {
    var esc = MPT.escapeHtml;
    var display = value === null
      ? '<span style="color:var(--text-faint)">Unavailable — this browser context does not expose Web Crypto ' +
        "(it requires HTTPS or localhost).</span>"
      : '<code class="inline" style="word-break:break-all">' + esc(value) + "</code>";

    return "<tr><td style=\"white-space:nowrap\"><strong>" + algo.label + "</strong>" +
      (algo.weak ? ' <span class="pill pill-warning">legacy</span>' : "") +
      '<div style="color:var(--text-faint); font-size:.75rem">' + algo.bits + " bit</div></td>" +
      "<td>" + display + "</td>" +
      '<td style="white-space:nowrap">' +
      (value === null ? "" :
        '<button type="button" class="btn btn-ghost btn-sm" data-copy-hash="' + esc(value) + '">Copy</button>') +
      "</td></tr>";
  }

  function render(values) {
    var html = '<div class="table-wrap"><table class="data"><thead><tr>' +
      '<th style="width:120px">Algorithm</th><th>Hex digest</th><th style="width:80px"></th>' +
      "</tr></thead><tbody>" +
      ALGORITHMS.map(function (a) { return rowHtml(a, values[a.key]); }).join("") +
      "</tbody></table></div>";
    results.innerHTML = html;

    Array.prototype.slice.call(results.querySelectorAll("[data-copy-hash]")).forEach(function (btn) {
      btn.addEventListener("click", function () { MPT.copy(btn.getAttribute("data-copy-hash")); });
    });
  }

  function compute() {
    var text = input.value;
    if (meta) meta.textContent = MPT.textStats(text);

    if (!text) {
      results.innerHTML = "";
      MPT.clearMsg(msg);
      return;
    }

    var bytes = utf8Bytes(text);
    var toCase = function (hex) {
      if (hex === null) return null;
      return upper && upper.checked ? hex.toUpperCase() : hex;
    };

    var values = {
      md5: toCase(md5(bytes)),
      sha1: toCase(sha1(bytes)),
      sha256: toCase(sha256(bytes)),
      sha384: null,
      sha512: null
    };
    render(values);
    MPT.showMsg(msg, "Hashed " + bytes.length + " byte(s) of UTF-8 input.", "ok");

    Promise.all([webCryptoHash("SHA-384", bytes), webCryptoHash("SHA-512", bytes)])
      .then(function (res) {
        values.sha384 = toCase(res[0]);
        values.sha512 = toCase(res[1]);
        render(values);
      });
  }

  var debounced = MPT.debounce(compute, 250);
  input.addEventListener("input", debounced);
  if (upper) upper.addEventListener("change", compute);

  document.getElementById("hash-sample").addEventListener("click", function () {
    input.value = "The quick brown fox jumps over the lazy dog";
    compute();
  });
  document.getElementById("hash-clear").addEventListener("click", function () {
    input.value = "";
    results.innerHTML = "";
    MPT.clearMsg(msg);
    if (meta) meta.textContent = MPT.textStats("");
    input.focus();
  });

  if (meta) meta.textContent = MPT.textStats("");
})();
