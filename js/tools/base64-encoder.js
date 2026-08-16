/* =====================================================================
   Base64 encoder / decoder (Unicode safe, optional URL-safe alphabet)
   ===================================================================== */
(function () {
  "use strict";

  function toBytes(str) {
    if (window.TextEncoder) return new TextEncoder().encode(str);
    var utf8 = unescape(encodeURIComponent(str));
    var bytes = new Uint8Array(utf8.length);
    for (var i = 0; i < utf8.length; i++) bytes[i] = utf8.charCodeAt(i);
    return bytes;
  }

  function fromBytes(bytes) {
    if (window.TextDecoder) return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
    var binary = "";
    for (var i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    return decodeURIComponent(escape(binary));
  }

  function encode(str, urlSafe) {
    var bytes = toBytes(str);
    var binary = "";
    for (var i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    var b64 = btoa(binary);
    if (urlSafe) b64 = b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    return b64;
  }

  function decode(str, urlSafe) {
    var cleaned = String(str).replace(/\s+/g, "");
    if (urlSafe || /[-_]/.test(cleaned)) {
      cleaned = cleaned.replace(/-/g, "+").replace(/_/g, "/");
    }
    while (cleaned.length % 4 !== 0) cleaned += "=";

    if (!/^[A-Za-z0-9+/]*={0,2}$/.test(cleaned)) {
      throw new Error("the input contains characters that are not valid Base64. " +
                      "If this is URL-safe Base64, tick the URL-safe option.");
    }

    var binary;
    try {
      binary = atob(cleaned);
    } catch (e) {
      throw new Error("this is not a valid Base64 string — its length or padding is wrong.");
    }
    var bytes = new Uint8Array(binary.length);
    for (var i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return fromBytes(bytes);
  }

  var tool = MPT.simpleTool({
    transform: function (text, opts) {
      var urlSafe = !!opts.urlsafe;
      if (opts.mode === "decode") {
        var decoded = decode(text, urlSafe);
        return {
          output: decoded,
          message: "Decoded " + text.replace(/\s+/g, "").length + " Base64 characters into " +
                   decoded.length + " character(s) of text.",
          type: "ok"
        };
      }
      var encoded = encode(text, urlSafe);
      return {
        output: encoded,
        message: "Encoded " + text.length + " character(s) into " + encoded.length +
                 " Base64 characters" + (urlSafe ? " using the URL-safe alphabet." : "."),
        type: "ok"
      };
    },
    sample: "Hello, MuleSoft! — encoding works with any Unicode: äöü, 日本語, 🚀",
    errorPrefix: "Could not convert",
    downloadName: "base64.txt",
    emptyMessage: "Type or paste something to convert, or press “Load example”."
  });

  var swap = document.getElementById("t-swap");
  if (swap && tool) {
    swap.addEventListener("click", function () {
      var input = document.getElementById("t-input");
      var output = document.getElementById("t-output");
      var mode = document.getElementById("opt-mode");
      if (!input || !output || !mode) return;
      var current = output.textContent;
      if (!current) { MPT.toast("Nothing to swap yet"); return; }
      input.value = current;
      mode.value = mode.value === "encode" ? "decode" : "encode";
      tool.run(false);
    });
  }
})();
