/* =====================================================================
   HTTP status codes with their Mule 4 error types
   Searchable reference: what each status means, which HTTP connector and
   APIkit error type it raises, and whether a retry is likely to help.
   ===================================================================== */
(function () {
  "use strict";

  // [code, name, description, HTTP connector error type, APIkit error type, retryable]
  var CODES = [
    [100, "Continue", "The server received the request headers; the client should send the body.", "", "", ""],
    [101, "Switching Protocols", "The server is switching protocols, for example to WebSocket.", "", "", ""],
    [200, "OK", "The request succeeded. The standard response for a successful GET.", "", "", ""],
    [201, "Created", "A new resource was created. Usually returned by POST with a Location header.", "", "", ""],
    [202, "Accepted", "The request was accepted for asynchronous processing but is not complete yet.", "", "", ""],
    [204, "No Content", "Success with no response body — common for DELETE and some PUTs.", "", "", ""],
    [206, "Partial Content", "Only part of the resource is returned, in response to a Range header.", "", "", ""],
    [301, "Moved Permanently", "The resource has a new permanent URL. Clients should update their links.", "", "", ""],
    [302, "Found", "Temporary redirect. The HTTP requester follows redirects only if followRedirects is enabled.", "", "", ""],
    [304, "Not Modified", "The cached version is still valid (conditional GET with ETag / If-Modified-Since).", "", "", ""],
    [307, "Temporary Redirect", "Temporary redirect that must keep the same method and body.", "", "", ""],
    [308, "Permanent Redirect", "Permanent redirect that must keep the same method and body.", "", "", ""],
    [400, "Bad Request", "The request is malformed — invalid syntax, failed validation or bad parameters.", "HTTP:BAD_REQUEST", "APIKIT:BAD_REQUEST", "no"],
    [401, "Unauthorized", "Authentication is missing or invalid. Check credentials, tokens and client ID enforcement.", "HTTP:UNAUTHORIZED", "", "no"],
    [403, "Forbidden", "The caller is authenticated but not allowed to do this.", "HTTP:FORBIDDEN", "", "no"],
    [404, "Not Found", "The resource or path does not exist.", "HTTP:NOT_FOUND", "APIKIT:NOT_FOUND", "no"],
    [405, "Method Not Allowed", "The path exists but does not support this HTTP method.", "HTTP:METHOD_NOT_ALLOWED", "APIKIT:METHOD_NOT_ALLOWED", "no"],
    [406, "Not Acceptable", "The server cannot produce a response matching the Accept header.", "HTTP:NOT_ACCEPTABLE", "APIKIT:NOT_ACCEPTABLE", "no"],
    [408, "Request Timeout", "The server timed out waiting for the client to send the request.", "", "", "yes"],
    [409, "Conflict", "The request conflicts with the current state — for example a duplicate key or version clash.", "", "", "no"],
    [410, "Gone", "The resource existed but has been permanently removed.", "", "", "no"],
    [412, "Precondition Failed", "A conditional header such as If-Match did not match.", "", "", "no"],
    [413, "Content Too Large", "The request body is larger than the server accepts.", "", "", "no"],
    [414, "URI Too Long", "The request URL is longer than the server accepts.", "", "", "no"],
    [415, "Unsupported Media Type", "The Content-Type of the request body is not supported.", "HTTP:UNSUPPORTED_MEDIA_TYPE", "APIKIT:UNSUPPORTED_MEDIA_TYPE", "no"],
    [422, "Unprocessable Content", "The body is well-formed but semantically invalid (business validation).", "", "", "no"],
    [425, "Too Early", "The server is unwilling to process a request that might be replayed.", "", "", "yes"],
    [428, "Precondition Required", "The server requires the request to be conditional.", "", "", "no"],
    [429, "Too Many Requests", "Rate limit exceeded — for example an API Manager rate-limiting or SLA policy. Respect Retry-After.", "HTTP:TOO_MANY_REQUESTS", "", "yes"],
    [431, "Request Header Fields Too Large", "Headers are too large. Mule listeners also reject over-sized headers.", "", "", "no"],
    [500, "Internal Server Error", "A generic, unhandled error on the server.", "HTTP:INTERNAL_SERVER_ERROR", "", "maybe"],
    [501, "Not Implemented", "The server does not support this functionality. APIkit raises it for flows not yet implemented.", "", "APIKIT:NOT_IMPLEMENTED", "no"],
    [502, "Bad Gateway", "A gateway or proxy received an invalid response from the upstream server.", "HTTP:BAD_GATEWAY", "", "yes"],
    [503, "Service Unavailable", "The server is overloaded or down for maintenance.", "HTTP:SERVICE_UNAVAILABLE", "", "yes"],
    [504, "Gateway Timeout", "A gateway or proxy did not get a response from upstream in time.", "HTTP:GATEWAY_TIMEOUT", "", "yes"]
  ];

  var EXTRA = [
    ["HTTP:TIMEOUT", "The HTTP request operation did not get a response within responseTimeout. No status code — the call never completed.", "yes"],
    ["HTTP:CONNECTIVITY", "The connection could not be opened or was dropped (DNS, refused connection, TLS handshake, idle connection closed).", "yes"],
    ["HTTP:PARSING", "The response could not be parsed, for example malformed multipart content.", "no"],
    ["HTTP:SECURITY", "Parent type for security errors, including HTTP:BASIC_AUTHENTICATION and HTTP:CLIENT_SECURITY.", "no"],
    ["HTTP:BASIC_AUTHENTICATION", "Basic authentication is missing or the credentials were rejected.", "no"],
    ["HTTP:CLIENT_SECURITY", "Client-side security (such as OAuth on the requester) failed.", "no"],
    ["HTTP:RETRY_EXHAUSTED", "A reconnection strategy ran out of attempts.", "no"]
  ];

  var list = document.getElementById("hs-list");
  var extra = document.getElementById("hs-extra");
  var search = document.getElementById("hs-search");
  var klass = document.getElementById("hs-class");
  var note = document.getElementById("hs-note");
  if (!list) return;

  function esc(s) { return MPT.escapeHtml(s); }

  function codeClass(code) {
    return code < 200 ? "pill-head" : code < 300 ? "pill-post" : code < 400 ? "pill-info" : code < 500 ? "pill-warning" : "pill-error";
  }

  function retryPill(r) {
    if (r === "yes") return '<span class="pill pill-post">Retry</span>';
    if (r === "maybe") return '<span class="pill pill-warning">Maybe</span>';
    if (r === "no") return '<span class="pill pill-head">No</span>';
    return "";
  }

  function typeCell(t) {
    if (!t) return '<span style="color:var(--text-faint)">—</span>';
    return '<button type="button" class="btn btn-ghost btn-sm hs-copy" data-copy="' + esc(t) + '" title="Copy ' + esc(t) + '" style="font-family:var(--mono);padding:2px 6px">' + esc(t) + "</button>";
  }

  function render() {
    var q = (search.value || "").trim().toLowerCase();
    var k = klass.value;
    var rows = CODES.filter(function (c) {
      if (k !== "all" && String(c[0]).charAt(0) !== k) return false;
      if (!q) return true;
      return (c.join(" ")).toLowerCase().indexOf(q) !== -1;
    });
    var h = '<table class="data"><thead><tr><th>Code</th><th>Name</th><th>Meaning</th><th>HTTP connector</th><th>APIkit</th><th>Retry?</th></tr></thead><tbody>';
    rows.forEach(function (c) {
      h += '<tr><td><span class="pill ' + codeClass(c[0]) + '">' + c[0] + "</span></td><td><strong>" + esc(c[1]) + "</strong></td><td>" + esc(c[2]) +
        "</td><td>" + typeCell(c[3]) + "</td><td>" + typeCell(c[4]) + "</td><td>" + retryPill(c[5]) + "</td></tr>";
    });
    if (!rows.length) h += '<tr><td colspan="6" style="color:var(--text-muted)">No status codes match that search.</td></tr>';
    list.innerHTML = h + "</tbody></table>";

    var ex = EXTRA.filter(function (e) { return !q || e.join(" ").toLowerCase().indexOf(q) !== -1; });
    var h2 = '<table class="data"><thead><tr><th>Error type</th><th>When it happens</th><th>Retry?</th></tr></thead><tbody>';
    ex.forEach(function (e) { h2 += "<tr><td>" + typeCell(e[0]) + "</td><td>" + esc(e[1]) + "</td><td>" + retryPill(e[2]) + "</td></tr>"; });
    if (!ex.length) h2 += '<tr><td colspan="3" style="color:var(--text-muted)">No error types match that search.</td></tr>';
    extra.innerHTML = h2 + "</tbody></table>";

    note.textContent = "Showing " + rows.length + " of " + CODES.length + " status codes. Click an error type to copy it.";
  }

  document.addEventListener("click", function (e) {
    var b = e.target.closest(".hs-copy");
    if (b) MPT.copy(b.getAttribute("data-copy"));
  });

  search.addEventListener("input", render);
  klass.addEventListener("change", render);

  var snippet = document.getElementById("hs-snippet");
  var snippetCopy = document.getElementById("hs-snippet-copy");
  if (snippetCopy && snippet) snippetCopy.addEventListener("click", function () { MPT.copy(snippet.textContent); });

  var hash = decodeURIComponent((location.hash || "").replace(/^#/, ""));
  if (hash) search.value = hash;
  render();
})();
