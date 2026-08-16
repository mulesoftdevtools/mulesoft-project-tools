/* =====================================================================
   URL and query string parser
   ===================================================================== */
(function () {
  "use strict";

  var SAMPLE = "https://api.example.com:8443/v1/orders/A-1001/items" +
    "?status=open&tag=eu&tag=priority&q=order%20status&limit=50&callback=https%3A%2F%2Fapp.example.com%2Fdone" +
    "#results-table";

  function safeDecode(value) {
    try {
      return decodeURIComponent(String(value).replace(/\+/g, " "));
    } catch (e) {
      return value;
    }
  }

  function parseQuery(queryString) {
    var pairs = [];
    String(queryString).replace(/^\?/, "").split("&").forEach(function (chunk) {
      if (!chunk) return;
      var eq = chunk.indexOf("=");
      var rawKey = eq === -1 ? chunk : chunk.slice(0, eq);
      var rawValue = eq === -1 ? "" : chunk.slice(eq + 1);
      pairs.push({
        key: safeDecode(rawKey),
        value: safeDecode(rawValue),
        rawKey: rawKey,
        rawValue: rawValue,
        hasValue: eq !== -1
      });
    });
    return pairs;
  }

  function row(label, value, mono) {
    var esc = MPT.escapeHtml;
    if (value === "" || value === null || value === undefined) {
      return '<tr><th class="row-key">' + esc(label) + '</th><td><span style="color:var(--text-faint)">—</span></td></tr>';
    }
    var cell = mono === false ? esc(value) : '<code class="inline" style="word-break:break-all">' + esc(value) + "</code>";
    return '<tr><th class="row-key">' + esc(label) + "</th><td>" + cell + "</td></tr>";
  }

  MPT.simpleTool({
    transform: function (text) {
      var esc = MPT.escapeHtml;
      var trimmed = text.trim();
      var url = null;
      var queryString = "";
      var isQueryOnly = false;

      if (/^[?&]/.test(trimmed) || (trimmed.indexOf("=") !== -1 && !/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed) && trimmed.indexOf("/") === -1)) {
        isQueryOnly = true;
        queryString = trimmed.replace(/^[?&]/, "");
      } else {
        var invalid = new Error("this is neither a valid URL nor a query string. A URL needs at least a host, " +
                                "for example https://example.com/path?a=1");
        if (/\s/.test(trimmed)) throw invalid;

        try {
          url = new URL(trimmed);
        } catch (e) {
          try {
            url = new URL("https://" + trimmed);
          } catch (e2) {
            throw invalid;
          }
        }

        // A bare word like "hello" parses as https://hello — reject anything that is not
        // a plausible host (must contain a dot, or be localhost / an IP / have an explicit port).
        var host = url.hostname;
        var plausibleHost = host === "localhost" ||
          /^\[[0-9a-fA-F:]+\]$/.test(url.host) ||
          /^\d{1,3}(\.\d{1,3}){3}$/.test(host) ||
          (host.indexOf(".") !== -1 && !/^\.|\.$|\.\./.test(host)) ||
          !!url.port;
        if (!plausibleHost) throw invalid;

        queryString = url.search.replace(/^\?/, "");
      }

      var params = parseQuery(queryString);
      var html = "";

      if (url) {
        var port = url.port || (url.protocol === "https:" ? "443 (default)" : url.protocol === "http:" ? "80 (default)" : "");
        html += '<div class="table-wrap"><table class="data"><tbody>' +
          row("Protocol", url.protocol.replace(":", "")) +
          row("Host", url.hostname) +
          row("Port", port) +
          row("Origin", url.origin) +
          row("Path", url.pathname) +
          row("Query string", url.search.replace(/^\?/, "")) +
          row("Fragment / hash", url.hash.replace(/^#/, "")) +
          (url.username ? row("Username", url.username) : "") +
          (url.password ? row("Password", "•".repeat(url.password.length)) : "") +
          "</tbody></table></div>";

        var segments = url.pathname.split("/").filter(Boolean);
        if (segments.length) {
          html += '<p class="io-label" style="margin:18px 0 0;">Path segments</p>' +
            '<div class="table-wrap"><table class="data"><thead><tr><th style="width:52px">#</th><th>Segment</th><th>Decoded</th></tr></thead><tbody>' +
            segments.map(function (s, i) {
              return "<tr><td>" + (i + 1) + '</td><td><code class="inline">' + esc(s) + "</code></td><td>" +
                esc(safeDecode(s)) + "</td></tr>";
            }).join("") + "</tbody></table></div>";
        }
      }

      if (params.length) {
        var counts = {};
        params.forEach(function (p) { counts[p.key] = (counts[p.key] || 0) + 1; });

        html += '<p class="io-label" style="margin:18px 0 0;">Query parameters (' + params.length + ")</p>" +
          '<div class="table-wrap"><table class="data"><thead><tr>' +
          '<th style="width:52px">#</th><th style="width:190px">Name</th><th>Decoded value</th><th style="width:110px">Notes</th>' +
          "</tr></thead><tbody>" +
          params.map(function (p, i) {
            var notes = [];
            if (counts[p.key] > 1) notes.push('<span class="pill pill-warning">repeated</span>');
            if (!p.hasValue) notes.push('<span class="pill pill-info">no value</span>');
            else if (p.value === "") notes.push('<span class="pill pill-info">empty</span>');
            if (p.rawValue !== p.value) notes.push('<span class="pill pill-get">encoded</span>');
            return "<tr><td>" + (i + 1) + "</td>" +
              "<td><strong>" + esc(p.key) + "</strong></td>" +
              '<td style="word-break:break-all">' + (p.value === "" ? '<span style="color:var(--text-faint)">—</span>' : esc(p.value)) + "</td>" +
              "<td>" + (notes.join(" ") || "") + "</td></tr>";
          }).join("") + "</tbody></table></div>";

        var asJson = {};
        params.forEach(function (p) {
          if (Object.prototype.hasOwnProperty.call(asJson, p.key)) {
            if (!Array.isArray(asJson[p.key])) asJson[p.key] = [asJson[p.key]];
            asJson[p.key].push(p.value);
          } else {
            asJson[p.key] = p.value;
          }
        });
        html += '<p class="io-label" style="margin:18px 0 6px;">Parameters as JSON</p>' +
          '<pre class="code-out code-xs" style="margin:0;">' + esc(JSON.stringify(asJson, null, 2)) + "</pre>";
      } else if (url) {
        html += '<div class="note" style="margin-top:14px;">' + MPT.icon("info") +
          "<div>This URL has no query parameters.</div></div>";
      }

      var message = isQueryOnly
        ? "Parsed " + params.length + " query parameter(s) from the query string."
        : "Parsed the URL" + (params.length ? " and its " + params.length + " query parameter(s)." : ".");

      return { html: html, message: message, type: "ok" };
    },
    sample: SAMPLE,
    errorPrefix: "Could not parse",
    emptyMessage: "Paste a URL or query string, or press “Load example”."
  });
})();
