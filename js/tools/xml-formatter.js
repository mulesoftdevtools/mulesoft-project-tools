/* =====================================================================
   XML formatter, minifier and well-formedness checker
   ===================================================================== */
(function () {
  "use strict";

  var SAMPLE = '<?xml version="1.0" encoding="UTF-8"?><orders xmlns="http://example.com/orders">' +
    '<order id="A-1001" currency="EUR"><customer><name>Ada Lovelace</name>' +
    '<email>ada@example.com</email></customer><items><item sku="WID-1"><qty>2</qty><price>19.99</price></item>' +
    '<item sku="GAD-7"><qty>1</qty><price>249.00</price></item></items>' +
    '<!-- totals are gross --><total>288.98</total></order></orders>';

  function parse(text) {
    var doc = new DOMParser().parseFromString(text, "application/xml");
    var err = doc.querySelector("parsererror");
    if (err) {
      var detail = (err.textContent || "").replace(/\s+/g, " ").trim();
      var located = /line[: ]+(\d+)/i.exec(detail);
      throw new Error("the document is not well-formed" +
        (located ? " (around line " + located[1] + ")" : "") + ". " + detail.slice(0, 240));
    }
    if (!doc.documentElement) throw new Error("no root element was found.");
    return doc;
  }

  function escapeText(value) {
    return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  function escapeAttr(value) {
    return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function serialise(doc, indentUnit, minify) {
    var out = [];
    var declaration = /^\s*<\?xml[^?]*\?>/.exec(doc.__originalText || "");
    if (declaration) out.push(declaration[0].trim());

    function attrs(node) {
      var s = "";
      for (var i = 0; i < node.attributes.length; i++) {
        var a = node.attributes[i];
        s += " " + a.name + '="' + escapeAttr(a.value) + '"';
      }
      return s;
    }

    function walk(node, depth) {
      var pad = minify ? "" : indentUnit.repeat(depth);
      var nl = minify ? "" : "\n";

      if (node.nodeType === 8) { // comment
        out.push(pad + "<!--" + node.nodeValue + "-->" + nl);
        return;
      }
      if (node.nodeType === 7) { // processing instruction
        out.push(pad + "<?" + node.target + " " + node.data + "?>" + nl);
        return;
      }
      if (node.nodeType === 4) { // CDATA
        out.push(pad + "<![CDATA[" + node.nodeValue + "]]>" + nl);
        return;
      }
      if (node.nodeType === 3) { // text
        var t = node.nodeValue.trim();
        if (t) out.push(pad + escapeText(t) + nl);
        return;
      }
      if (node.nodeType !== 1) return;

      var children = [];
      for (var i = 0; i < node.childNodes.length; i++) {
        var c = node.childNodes[i];
        if (c.nodeType === 3 && !c.nodeValue.trim()) continue;
        children.push(c);
      }

      var open = "<" + node.nodeName + attrs(node);

      if (!children.length) {
        out.push(pad + open + "/>" + nl);
        return;
      }

      // single text child stays on one line
      if (children.length === 1 && (children[0].nodeType === 3 || children[0].nodeType === 4)) {
        var value = children[0].nodeType === 4
          ? "<![CDATA[" + children[0].nodeValue + "]]>"
          : escapeText(children[0].nodeValue.trim());
        out.push(pad + open + ">" + value + "</" + node.nodeName + ">" + nl);
        return;
      }

      out.push(pad + open + ">" + nl);
      children.forEach(function (child) { walk(child, depth + 1); });
      out.push(pad + "</" + node.nodeName + ">" + nl);
    }

    // include comments/PIs that sit outside the root element
    for (var i = 0; i < doc.childNodes.length; i++) {
      var node = doc.childNodes[i];
      if (node.nodeType === 1) walk(node, 0);
      else if (node.nodeType === 8 || node.nodeType === 7) walk(node, 0);
    }

    var joined = out.join(minify ? "" : "");
    if (declaration && !minify) {
      joined = joined.replace(/^(<\?xml[^?]*\?>)/, "$1\n");
    }
    return joined.replace(/\n+$/, "");
  }

  function stats(doc) {
    var elements = 0, attributes = 0, maxDepth = 0, comments = 0, textNodes = 0;
    (function walk(node, depth) {
      if (depth > maxDepth) maxDepth = depth;
      for (var i = 0; i < node.childNodes.length; i++) {
        var c = node.childNodes[i];
        if (c.nodeType === 1) {
          elements++;
          attributes += c.attributes.length;
          walk(c, depth + 1);
        } else if (c.nodeType === 8) comments++;
        else if (c.nodeType === 3 && c.nodeValue.trim()) textNodes++;
      }
    })(doc, 0);
    return { elements: elements, attributes: attributes, depth: maxDepth, comments: comments, textNodes: textNodes };
  }

  MPT.simpleTool({
    transform: function (text, opts) {
      var doc = parse(text);
      doc.__originalText = text;

      var indentOpt = (opts && opts.indent) || "2";
      var minify = indentOpt === "minify";
      var unit = indentOpt === "tab" ? "\t" : " ".repeat(parseInt(indentOpt, 10) || 2);

      var output = serialise(doc, unit, minify);
      var s = stats(doc);

      var extra = "";
      if (minify && text.length > output.length) {
        extra = " Minifying saved " + (text.length - output.length).toLocaleString() + " characters.";
      }

      return {
        output: output,
        message: "Well-formed XML — " + s.elements + " element(s), " + s.attributes +
                 " attribute(s), max depth " + s.depth + "." + extra,
        type: "ok"
      };
    },
    sample: SAMPLE,
    errorPrefix: "Invalid XML",
    downloadName: "formatted.xml",
    downloadMime: "application/xml;charset=utf-8",
    emptyMessage: "Paste some XML to format, or press “Load example”."
  });
})();
