/* =====================================================================
   XPath 1.0 tester (uses the browser's own XPath engine)
   ===================================================================== */
(function () {
  "use strict";

  var exprInput = document.getElementById("xp-expression");
  var xmlInput = document.getElementById("xp-input");
  var msg = document.getElementById("xp-msg");
  var results = document.getElementById("xp-results");
  var meta = document.getElementById("xp-input-meta");
  if (!exprInput || !xmlInput) return;

  var SAMPLE_XML = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    "<orders>",
    '  <order id="A-1001" status="PAID">',
    "    <customer>",
    "      <name>Ada Lovelace</name>",
    "      <email>ada@example.com</email>",
    "    </customer>",
    "    <items>",
    '      <item sku="WID-1"><name>Widget</name><qty>2</qty><price>19.99</price></item>',
    '      <item sku="GAD-7"><name>Gadget</name><qty>1</qty><price>249.00</price></item>',
    "    </items>",
    "    <total>288.98</total>",
    "  </order>",
    '  <order id="A-1002" status="NEW">',
    "    <customer>",
    "      <name>Grace Hopper</name>",
    "      <email>grace@example.com</email>",
    "    </customer>",
    "    <items>",
    '      <item sku="WID-1"><name>Widget</name><qty>5</qty><price>19.99</price></item>',
    "    </items>",
    "    <total>99.95</total>",
    "  </order>",
    "</orders>"
  ].join("\n");

  function parseXml(text) {
    var doc = new DOMParser().parseFromString(text, "application/xml");
    var err = doc.querySelector("parsererror");
    if (err) {
      var detail = (err.textContent || "").replace(/\s+/g, " ").trim();
      throw new Error("the XML is not well-formed. " + detail.slice(0, 220));
    }
    if (!doc.documentElement) throw new Error("no root element was found.");
    return doc;
  }

  function serialise(node) {
    if (node.nodeType === 2) return node.value;                        // attribute
    if (node.nodeType === 3 || node.nodeType === 4) return node.nodeValue;
    try {
      return new XMLSerializer().serializeToString(node);
    } catch (e) {
      return node.textContent;
    }
  }

  function nodeTypeName(node) {
    switch (node.nodeType) {
      case 1: return "element";
      case 2: return "attribute";
      case 3: return "text";
      case 4: return "cdata";
      case 7: return "processing-instruction";
      case 8: return "comment";
      case 9: return "document";
      default: return "node " + node.nodeType;
    }
  }

  function nodePath(node) {
    var parts = [];
    var current = node;
    if (current.nodeType === 2) {
      parts.unshift("@" + current.name);
      current = current.ownerElement;
    }
    while (current && current.nodeType === 1) {
      var index = 1;
      var sibling = current.previousSibling;
      while (sibling) {
        if (sibling.nodeType === 1 && sibling.nodeName === current.nodeName) index++;
        sibling = sibling.previousSibling;
      }
      parts.unshift(current.nodeName + "[" + index + "]");
      current = current.parentNode;
    }
    return "/" + parts.join("/");
  }

  function run() {
    MPT.clearMsg(msg);
    results.innerHTML = "";

    var expression = exprInput.value.trim();
    var xml = xmlInput.value;

    if (!xml.trim()) {
      MPT.showMsg(msg, "Paste an XML document first, or press “Load example”.", "warn");
      return;
    }
    if (!expression) {
      MPT.showMsg(msg, "Enter an XPath expression to evaluate.", "warn");
      return;
    }

    var doc;
    try {
      doc = parseXml(xml);
    } catch (e) {
      MPT.showMsg(msg, "Could not parse the XML — " + e.message, "error");
      return;
    }

    if (/[a-zA-Z0-9_-]+:[a-zA-Z]/.test(expression) && !/::/.test(expression)) {
      // heuristic namespace-prefix warning, ignoring axis syntax like child::
    }

    var evaluated;
    try {
      evaluated = doc.evaluate(expression, doc, null, XPathResult.ANY_TYPE, null);
    } catch (e) {
      var hint = "";
      if (/namespace/i.test(e.message || "")) {
        hint = " If the document uses namespaces, try a namespace-agnostic form such as " +
               "//*[local-name()='Envelope'].";
      }
      MPT.showMsg(msg, "Invalid XPath expression — " + (e.message || String(e)) + hint, "error");
      return;
    }

    var esc = MPT.escapeHtml;

    if (evaluated.resultType === XPathResult.NUMBER_TYPE) {
      results.innerHTML = simpleResult("Number", String(evaluated.numberValue));
      MPT.showMsg(msg, "The expression returned a number.", "ok");
      return;
    }
    if (evaluated.resultType === XPathResult.STRING_TYPE) {
      results.innerHTML = simpleResult("String", evaluated.stringValue);
      MPT.showMsg(msg, "The expression returned a string.", "ok");
      return;
    }
    if (evaluated.resultType === XPathResult.BOOLEAN_TYPE) {
      results.innerHTML = simpleResult("Boolean", String(evaluated.booleanValue));
      MPT.showMsg(msg, "The expression returned a boolean.", "ok");
      return;
    }

    var nodes = [];
    var node;
    while ((node = evaluated.iterateNext()) !== null) {
      nodes.push(node);
      if (nodes.length >= 500) break;
    }

    if (!nodes.length) {
      results.innerHTML = '<div class="note" style="margin-top:14px;">' + MPT.icon("info") +
        "<div>The expression is valid but matched no nodes. If the document declares a default " +
        "namespace (an <code class=\"inline\">xmlns</code> attribute on the root), plain element names will not " +
        "match — use <code class=\"inline\">//*[local-name()='name']</code> instead.</div></div>";
      MPT.showMsg(msg, "No nodes matched.", "warn");
      return;
    }

    var rows = nodes.map(function (n, i) {
      var value = serialise(n);
      var truncated = value.length > 800 ? value.slice(0, 800) + "\n… (truncated)" : value;
      return "<tr><td>" + (i + 1) + "</td>" +
        '<td><span class="pill pill-info">' + esc(nodeTypeName(n)) + "</span></td>" +
        '<td><code class="inline">' + esc(n.nodeName) + "</code>" +
        '<div style="color:var(--text-faint); font-size:.74rem; margin-top:3px">' + esc(nodePath(n)) + "</div></td>" +
        '<td><pre style="margin:0; white-space:pre-wrap; word-break:break-word; font-family:var(--mono); font-size:.8rem">' +
        esc(truncated) + "</pre></td></tr>";
    }).join("");

    results.innerHTML = '<div class="stats">' +
      '<div class="stat"><div class="stat-label">Nodes matched</div><div class="stat-value">' + nodes.length + "</div></div>" +
      "</div>" +
      '<div class="table-wrap"><table class="data"><thead><tr>' +
      '<th style="width:52px">#</th><th style="width:110px">Type</th><th style="width:220px">Name / path</th><th>Value</th>' +
      "</tr></thead><tbody>" + rows + "</tbody></table></div>";

    MPT.showMsg(msg, "Matched " + nodes.length + " node" + (nodes.length === 1 ? "" : "s") +
      (nodes.length >= 500 ? " (showing the first 500)." : "."), "ok");
  }

  function simpleResult(kind, value) {
    return '<div class="table-wrap"><table class="data"><tbody>' +
      '<tr><th class="row-key">Result type</th><td>' + kind + "</td></tr>" +
      '<tr><th class="row-key">Value</th><td><code class="inline">' + MPT.escapeHtml(value) + "</code></td></tr>" +
      "</tbody></table></div>";
  }

  function updateMeta() { if (meta) meta.textContent = MPT.textStats(xmlInput.value); }

  document.getElementById("xp-run").addEventListener("click", run);
  document.getElementById("xp-clear").addEventListener("click", function () {
    exprInput.value = "";
    xmlInput.value = "";
    results.innerHTML = "";
    MPT.clearMsg(msg);
    updateMeta();
    exprInput.focus();
  });
  document.getElementById("xp-sample").addEventListener("click", function () {
    xmlInput.value = SAMPLE_XML;
    exprInput.value = "//order[@status='PAID']/items/item/name";
    updateMeta();
    run();
  });

  exprInput.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); run(); } });
  exprInput.addEventListener("input", MPT.debounce(function () {
    if (exprInput.value.trim() && xmlInput.value.trim()) run();
  }, 400));
  xmlInput.addEventListener("input", function () {
    updateMeta();
  });

  updateMeta();
})();
