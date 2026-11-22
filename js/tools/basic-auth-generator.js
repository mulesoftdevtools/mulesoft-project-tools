/* =====================================================================
   Basic Auth header generator & decoder
   Builds an Authorization: Basic header (UTF-8 safe) plus ready-to-paste
   cURL, DataWeave and Mule HTTP Request snippets; decodes existing headers.
   ===================================================================== */
(function () {
  "use strict";

  var $ = function (id) { return document.getElementById(id); };
  var user = $("ba-user"), pass = $("ba-pass"), show = $("ba-show");
  var out = $("ba-output"), msg = $("ba-msg");
  var decIn = $("ba-decode-in"), decOut = $("ba-decode-out"), decMsg = $("ba-decode-msg");
  if (!user || !out) return;

  function b64(str) {
    var bytes = new TextEncoder().encode(str), bin = "";
    for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin);
  }
  function unb64(str) {
    var bin = atob(str), bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder("utf-8").decode(bytes);
  }
  function shellQuote(s) { return "'" + s.replace(/'/g, "'\\''") + "'"; }

  var last = {};

  function block(id, title, text) {
    last[id] = text;
    return '<div class="field" style="margin-top:12px"><div class="io-head"><span class="io-label">' + title +
      '</span><button type="button" class="btn btn-secondary btn-sm ba-copy" data-k="' + id + '">' + MPT.icon("copy") + "<span>Copy</span></button></div>" +
      '<pre class="code-out code-sm" style="min-height:0">' + MPT.escapeHtml(text) + "</pre></div>";
  }

  function generate(manual) {
    var u = user.value, p = pass.value;
    if (!u && !p) {
      out.innerHTML = "";
      if (manual) MPT.showMsg(msg, "Enter a username and password first.", "warn"); else MPT.clearMsg(msg);
      return;
    }
    if (u.indexOf(":") !== -1) {
      MPT.showMsg(msg, "The username contains a colon — Basic auth uses “:” as the separator, so most servers will read this incorrectly.", "warn");
    } else MPT.clearMsg(msg);
    var token = b64(u + ":" + p);
    var html = block("value", "Header value", "Basic " + token) +
      block("header", "Full header", "Authorization: Basic " + token) +
      block("curl", "cURL", "curl -u " + shellQuote(u + ":" + p) + " https://api.example.com/resource\n# or\ncurl -H " + shellQuote("Authorization: Basic " + token) + " https://api.example.com/resource") +
      block("dw", "DataWeave (build it at runtime from secure properties)",
        '%dw 2.0\noutput application/java\n---\n{\n  Authorization: "Basic " ++ dw::core::Binaries::toBase64(\n    (p("secure::api.username") ++ ":" ++ p("secure::api.password")) as Binary\n  )\n}') +
      block("mule", "Mule HTTP Request configuration",
        '<http:request-config name="Api_Request_Config">\n  <http:request-connection host="api.example.com" protocol="HTTPS" port="443">\n' +
        '    <http:authentication>\n      <http:basic-authentication username="${secure::api.username}"\n' +
        '                                 password="${secure::api.password}" preemptive="true"/>\n    </http:authentication>\n' +
        '  </http:request-connection>\n</http:request-config>\n\n<!-- secure-config.yaml (encrypt the values with the secure properties tool)\napi:\n  username: "![encrypted-username]"\n  password: "![encrypted-password]"\n-->');
    out.innerHTML = html;
    if (!msg.classList.contains("msg-warn")) MPT.showMsg(msg, "Generated locally — the credentials never leave your browser. Keep real secrets in secure properties, not in code.", "ok");
  }

  function decode() {
    var raw = decIn.value.trim();
    if (!raw) { decOut.innerHTML = ""; MPT.clearMsg(decMsg); return; }
    var token = raw.replace(/^authorization\s*:\s*/i, "").replace(/^basic\s+/i, "").trim();
    try {
      if (!/^[A-Za-z0-9+/=_-]+$/.test(token)) throw new Error("bad");
      var text = unb64(token.replace(/-/g, "+").replace(/_/g, "/"));
      var idx = text.indexOf(":");
      if (idx === -1) {
        MPT.showMsg(decMsg, "Decoded, but there is no “:” separator, so this is not a username:password pair.", "warn");
        decOut.innerHTML = '<table class="data"><tbody><tr><th class="row-key">Decoded</th><td>' + MPT.escapeHtml(text) + "</td></tr></tbody></table>";
        return;
      }
      decOut.innerHTML = '<table class="data"><tbody><tr><th class="row-key">Username</th><td style="font-family:var(--mono)">' + MPT.escapeHtml(text.slice(0, idx)) +
        '</td></tr><tr><th class="row-key">Password</th><td style="font-family:var(--mono)">' + MPT.escapeHtml(text.slice(idx + 1)) + "</td></tr></tbody></table>";
      MPT.showMsg(decMsg, "Decoded. Remember: Base64 is an encoding, not encryption — anyone with the header can read the password.", "ok");
    } catch (e) {
      decOut.innerHTML = "";
      MPT.showMsg(decMsg, "That is not a valid Basic auth header or Base64 token.", "error");
    }
  }

  user.addEventListener("input", function () { generate(false); });
  pass.addEventListener("input", function () { generate(false); });
  show.addEventListener("change", function () { pass.type = show.checked ? "text" : "password"; });
  $("ba-run").addEventListener("click", function () { generate(true); });
  $("ba-sample").addEventListener("click", function () { user.value = "mule-client"; pass.value = "s3cr3t-Pa$$"; generate(true); });
  $("ba-clear").addEventListener("click", function () { user.value = ""; pass.value = ""; out.innerHTML = ""; MPT.clearMsg(msg); user.focus(); });
  decIn.addEventListener("input", MPT.debounce(decode, 200));
  $("ba-decode-run").addEventListener("click", decode);

  out.addEventListener("click", function (e) {
    var b = e.target.closest(".ba-copy");
    if (b) MPT.copy(last[b.getAttribute("data-k")]);
  });
})();
