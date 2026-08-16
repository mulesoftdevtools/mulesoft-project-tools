/* =====================================================================
   cURL command builder and parser
   ===================================================================== */
(function () {
  "use strict";

  /* ------------------------------------------------------------------
     Build
     ------------------------------------------------------------------ */
  var methodSel = document.getElementById("cu-method");
  var urlInput = document.getElementById("cu-url");
  var headersInput = document.getElementById("cu-headers");
  var bodyInput = document.getElementById("cu-body");
  var authInput = document.getElementById("cu-auth");
  var insecureBox = document.getElementById("cu-insecure");
  var followBox = document.getElementById("cu-follow");
  var verboseBox = document.getElementById("cu-verbose");
  var buildOut = document.getElementById("cu-build-output");
  var buildMsg = document.getElementById("cu-build-msg");

  function shellQuote(value) {
    var str = String(value);
    if (str === "") return "''";
    if (/^[A-Za-z0-9_@%+=:,./-]+$/.test(str)) return str;
    return "'" + str.replace(/'/g, "'\\''") + "'";
  }

  function build() {
    MPT.clearMsg(buildMsg);

    var url = urlInput.value.trim();
    if (!url) {
      buildOut.textContent = "";
      MPT.showMsg(buildMsg, "Enter a request URL to build the command.", "warn");
      return;
    }

    var notes = [];
    if (!/^https?:\/\//i.test(url) && !/^\{\{/.test(url)) {
      notes.push("The URL has no http:// or https:// scheme — cURL will assume http://.");
    }

    var method = methodSel.value;
    var body = bodyInput.value;
    var parts = [];

    if (!(method === "GET" && !body.trim())) parts.push("-X " + method);
    if (verboseBox.checked) parts.push("-v");
    if (followBox.checked) parts.push("-L");
    if (insecureBox.checked) parts.push("-k");

    var headerLines = headersInput.value.split("\n")
      .map(function (l) { return l.trim(); })
      .filter(Boolean);

    var hasContentType = false;
    headerLines.forEach(function (line) {
      if (line.indexOf(":") === -1) {
        notes.push("Header line “" + line + "” has no colon and was skipped.");
        return;
      }
      if (/^content-type\s*:/i.test(line)) hasContentType = true;
      parts.push("-H " + shellQuote(line));
    });

    var auth = authInput.value.trim();
    if (auth) {
      parts.push("-u " + shellQuote(auth));
      notes.push("Credentials passed with -u appear in your shell history — prefer an environment variable in scripts.");
    }

    if (body.trim()) {
      parts.push("-d " + shellQuote(body));
      if (!hasContentType) {
        notes.push("A request body was supplied but no Content-Type header — cURL will default to " +
                   "application/x-www-form-urlencoded.");
      }
      if (method === "GET") {
        notes.push("A body with GET is unusual; cURL will switch the method to POST unless -X GET is forced " +
                   "(it is included above).");
      }
    }

    parts.push(shellQuote(url));

    buildOut.textContent = "curl " + parts.join(" \\\n     ");

    if (notes.length) MPT.showMsg(buildMsg, "Command generated.\n\nNotes:\n• " + notes.join("\n• "), "warn");
    else MPT.showMsg(buildMsg, "Command generated and shell-quoted.", "ok");
  }

  var debouncedBuild = MPT.debounce(function () {
    if (urlInput.value.trim()) build();
  }, 300);

  [urlInput, headersInput, bodyInput, authInput].forEach(function (n) {
    n.addEventListener("input", debouncedBuild);
  });
  [methodSel, insecureBox, followBox, verboseBox].forEach(function (n) {
    n.addEventListener("change", function () { if (urlInput.value.trim()) build(); });
  });

  document.getElementById("cu-build").addEventListener("click", build);
  document.getElementById("cu-build-copy").addEventListener("click", function () { MPT.copy(buildOut.textContent); });
  document.getElementById("cu-build-clear").addEventListener("click", function () {
    urlInput.value = ""; headersInput.value = ""; bodyInput.value = ""; authInput.value = "";
    insecureBox.checked = false; followBox.checked = false; verboseBox.checked = false;
    methodSel.value = "GET";
    buildOut.textContent = "";
    MPT.clearMsg(buildMsg);
    urlInput.focus();
  });
  document.getElementById("cu-build-sample").addEventListener("click", function () {
    methodSel.value = "POST";
    urlInput.value = "https://api.example.com/v1/orders";
    headersInput.value = "Content-Type: application/json\nAuthorization: Bearer eyJhbGciOi...\nX-Correlation-Id: 8f14e45f";
    bodyInput.value = '{\n  "customerId": "C-42",\n  "items": [{ "sku": "WID-1", "qty": 2 }]\n}';
    authInput.value = "";
    build();
  });

  /* ------------------------------------------------------------------
     Parse
     ------------------------------------------------------------------ */
  var parseInputEl = document.getElementById("cu-parse-input");
  var parseMsg = document.getElementById("cu-parse-msg");
  var parseResults = document.getElementById("cu-parse-results");

  function tokenize(text) {
    var tokens = [];
    var current = "";
    var started = false;
    var quote = null;

    for (var i = 0; i < text.length; i++) {
      var ch = text.charAt(i);

      if (quote === "'") {
        if (ch === "'") { quote = null; } else { current += ch; }
        continue;
      }
      if (quote === '"') {
        if (ch === "\\" && i + 1 < text.length && '"\\$`'.indexOf(text.charAt(i + 1)) !== -1) {
          current += text.charAt(i + 1); i++; continue;
        }
        if (ch === '"') { quote = null; } else { current += ch; }
        continue;
      }

      if (ch === "'" || ch === '"') { quote = ch; started = true; continue; }
      if (ch === "\\") {
        var next = text.charAt(i + 1);
        if (next === "\n") { i++; continue; }          // line continuation
        if (next === "\r" && text.charAt(i + 2) === "\n") { i += 2; continue; }
        if (next) { current += next; started = true; i++; continue; }
        continue;
      }
      if (/\s/.test(ch)) {
        if (started || current) { tokens.push(current); current = ""; started = false; }
        continue;
      }
      current += ch;
      started = true;
    }
    if (quote) throw new Error("the command has an unterminated " + (quote === "'" ? "single" : "double") + " quote.");
    if (started || current) tokens.push(current);
    return tokens;
  }

  var VALUE_FLAGS = {
    "-X": "method", "--request": "method",
    "-H": "header", "--header": "header",
    "-d": "data", "--data": "data", "--data-raw": "data",
    "--data-binary": "data", "--data-urlencode": "data", "--data-ascii": "data",
    "-u": "user", "--user": "user",
    "-A": "agent", "--user-agent": "agent",
    "-b": "cookie", "--cookie": "cookie",
    "-e": "referer", "--referer": "referer",
    "--url": "url",
    "-F": "form", "--form": "form",
    "-o": "output", "--output": "output",
    "-m": "maxtime", "--max-time": "maxtime",
    "--connect-timeout": "conntimeout",
    "-x": "proxy", "--proxy": "proxy"
  };

  var BOOL_FLAGS = {
    "-k": "insecure", "--insecure": "insecure",
    "-L": "follow", "--location": "follow",
    "-v": "verbose", "--verbose": "verbose",
    "-s": "silent", "--silent": "silent",
    "-i": "include", "--include": "include",
    "-I": "head", "--head": "head",
    "-g": "globoff", "--globoff": "globoff",
    "--compressed": "compressed"
  };

  function parseCurl(text) {
    var tokens = tokenize(text.trim());
    if (!tokens.length) throw new Error("nothing to parse.");
    if (tokens[0].toLowerCase() === "curl") tokens.shift();

    var result = {
      method: null, url: null, headers: [], data: [], forms: [],
      user: null, agent: null, cookie: null, referer: null, proxy: null,
      flags: {}, unknown: []
    };

    for (var i = 0; i < tokens.length; i++) {
      var token = tokens[i];

      if (Object.prototype.hasOwnProperty.call(VALUE_FLAGS, token)) {
        var kind = VALUE_FLAGS[token];
        var value = tokens[++i];
        if (value === undefined) throw new Error("flag " + token + " is missing its value.");
        if (kind === "method") result.method = value.toUpperCase();
        else if (kind === "header") result.headers.push(value);
        else if (kind === "data") result.data.push(value);
        else if (kind === "form") result.forms.push(value);
        else if (kind === "url") result.url = value;
        else result[kind] = value;
        continue;
      }

      // --flag=value form
      var eq = token.indexOf("=");
      if (token.indexOf("--") === 0 && eq > 2) {
        var name = token.slice(0, eq);
        if (Object.prototype.hasOwnProperty.call(VALUE_FLAGS, name)) {
          tokens.splice(i + 1, 0, token.slice(eq + 1));
          tokens[i] = name;
          i--;
          continue;
        }
      }

      if (Object.prototype.hasOwnProperty.call(BOOL_FLAGS, token)) {
        result.flags[BOOL_FLAGS[token]] = true;
        continue;
      }

      if (token.charAt(0) === "-" && token.length > 1) {
        result.unknown.push(token);
        continue;
      }

      if (!result.url) result.url = token;
      else result.unknown.push(token);
    }

    if (!result.method) {
      if (result.flags.head) result.method = "HEAD";
      else if (result.data.length || result.forms.length) result.method = "POST";
      else result.method = "GET";
    }
    return result;
  }

  function pillClass(method) {
    var known = ["get", "post", "put", "patch", "delete", "head", "options", "trace"];
    return known.indexOf(method.toLowerCase()) !== -1 ? "pill-" + method.toLowerCase() : "pill-info";
  }

  function renderParsed(p) {
    var esc = MPT.escapeHtml;
    var rows = [];

    rows.push(["Method", '<span class="pill ' + pillClass(p.method) + '">' + esc(p.method) + "</span>"]);
    rows.push(["URL", '<code class="inline" style="word-break:break-all">' + esc(p.url) + "</code>"]);

    var parsedUrl = null;
    try {
      parsedUrl = new URL(p.url);
    } catch (e) { /* relative or templated URL */ }

    if (parsedUrl) {
      rows.push(["Host", esc(parsedUrl.host)]);
      rows.push(["Path", '<code class="inline">' + esc(parsedUrl.pathname) + "</code>"]);
      if (parsedUrl.search) {
        var qs = [];
        parsedUrl.searchParams.forEach(function (v, k) {
          qs.push("<div><code class=\"inline\">" + esc(k) + "</code> = " + esc(v) + "</div>");
        });
        rows.push(["Query parameters", qs.join("")]);
      }
    }

    if (p.user) rows.push(["Basic auth", esc(p.user)]);
    if (p.agent) rows.push(["User agent", esc(p.agent)]);
    if (p.cookie) rows.push(["Cookie", esc(p.cookie)]);
    if (p.referer) rows.push(["Referer", esc(p.referer)]);
    if (p.proxy) rows.push(["Proxy", esc(p.proxy)]);

    var flagNames = Object.keys(p.flags);
    if (flagNames.length) rows.push(["Flags", flagNames.map(function (f) {
      return '<span class="pill pill-info">' + esc(f) + "</span>";
    }).join(" ")]);

    var html = '<div class="table-wrap"><table class="data"><tbody>' +
      rows.map(function (r) { return '<tr><th class="row-key">' + r[0] + "</th><td>" + r[1] + "</td></tr>"; }).join("") +
      "</tbody></table></div>";

    if (p.headers.length) {
      html += '<p class="io-label" style="margin:18px 0 0;">Headers (' + p.headers.length + ")</p>";
      html += '<div class="table-wrap"><table class="data"><thead><tr><th style="width:220px">Name</th><th>Value</th></tr></thead><tbody>' +
        p.headers.map(function (h) {
          var idx = h.indexOf(":");
          var name = idx === -1 ? h : h.slice(0, idx).trim();
          var value = idx === -1 ? "" : h.slice(idx + 1).trim();
          return "<tr><td><strong>" + esc(name) + "</strong></td><td style=\"word-break:break-all\">" + esc(value) + "</td></tr>";
        }).join("") + "</tbody></table></div>";
    }

    if (p.forms.length) {
      html += '<p class="io-label" style="margin:18px 0 0;">Form fields</p>';
      html += '<div class="table-wrap"><table class="data"><tbody>' +
        p.forms.map(function (f) { return "<tr><td><code class=\"inline\">" + esc(f) + "</code></td></tr>"; }).join("") +
        "</tbody></table></div>";
    }

    if (p.data.length) {
      var joined = p.data.join("&");
      var pretty = joined;
      try {
        pretty = JSON.stringify(JSON.parse(joined), null, 2);
      } catch (e) { /* not JSON */ }
      html += '<p class="io-label" style="margin:18px 0 6px;">Request body</p>' +
              '<pre class="code-out code-sm" style="margin:0;">' + esc(pretty) + "</pre>";
    }

    if (p.unknown.length) {
      html += '<div class="note" style="margin-top:14px;">' + MPT.icon("alert-triangle") +
        "<div>These tokens were not recognised and were ignored: " +
        p.unknown.map(function (u) { return "<code class=\"inline\">" + esc(u) + "</code>"; }).join(" ") +
        "</div></div>";
    }

    parseResults.innerHTML = html;
  }

  function runParse() {
    MPT.clearMsg(parseMsg);
    parseResults.innerHTML = "";

    var text = parseInputEl.value;
    if (!text.trim()) {
      MPT.showMsg(parseMsg, "Paste a cURL command to break down, or press “Load example”.", "warn");
      return;
    }

    var parsed;
    try {
      parsed = parseCurl(text);
    } catch (e) {
      MPT.showMsg(parseMsg, "Could not parse the command — " + e.message, "error");
      return;
    }

    if (!parsed.url) {
      MPT.showMsg(parseMsg, "No URL was found in that command.", "error");
      return;
    }

    renderParsed(parsed);
    var warn = text.trim().toLowerCase().indexOf("curl") !== 0
      ? " Note: the command does not start with “curl”, so double-check the result."
      : "";
    MPT.showMsg(parseMsg, "Parsed " + parsed.method + " request with " + parsed.headers.length +
                          " header(s)." + warn, warn ? "warn" : "ok");
  }

  document.getElementById("cu-parse").addEventListener("click", runParse);
  document.getElementById("cu-parse-clear").addEventListener("click", function () {
    parseInputEl.value = "";
    parseResults.innerHTML = "";
    MPT.clearMsg(parseMsg);
    parseInputEl.focus();
  });
  document.getElementById("cu-parse-sample").addEventListener("click", function () {
    parseInputEl.value = "curl -X POST 'https://api.example.com/v1/orders?dryRun=true' \\\n" +
      "  -H 'Content-Type: application/json' \\\n" +
      "  -H 'Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.abc.def' \\\n" +
      "  -H 'X-Correlation-Id: 8f14e45f' \\\n" +
      "  --compressed -L \\\n" +
      "  -d '{\"customerId\":\"C-42\",\"items\":[{\"sku\":\"WID-1\",\"qty\":2}]}'";
    runParse();
  });
  parseInputEl.addEventListener("input", MPT.debounce(function () {
    if (parseInputEl.value.trim()) runParse();
  }, 400));
})();
