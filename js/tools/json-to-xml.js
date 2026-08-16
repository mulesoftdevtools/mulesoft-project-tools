/* =====================================================================
   JSON ⇄ XML converter
   ===================================================================== */
(function () {
  "use strict";

  var SAMPLE = JSON.stringify({
    order: {
      "@id": "A-1001",
      "@currency": "EUR",
      customer: { name: "Ada Lovelace", email: "ada@example.com" },
      items: { item: [{ "@sku": "WID-1", qty: 2 }, { "@sku": "GAD-7", qty: 1 }] },
      total: 288.98,
      paid: true
    }
  }, null, 2);

  function escapeXml(value) {
    return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&apos;");
  }

  function safeName(name) {
    var clean = String(name).replace(/[^A-Za-z0-9_.:-]/g, "_");
    if (!/^[A-Za-z_]/.test(clean)) clean = "_" + clean;
    return clean;
  }

  /* ---------------- JSON → XML ---------------- */
  function jsonToXml(value, rootName) {
    var lines = ['<?xml version="1.0" encoding="UTF-8"?>'];

    function build(name, node, depth) {
      var pad = "  ".repeat(depth);
      var tag = safeName(name);

      if (node === null || node === undefined) {
        lines.push(pad + "<" + tag + ' xsi:nil="true"/>');
        return;
      }

      if (Array.isArray(node)) {
        node.forEach(function (item) { build(name, item, depth); });
        return;
      }

      if (typeof node !== "object") {
        lines.push(pad + "<" + tag + ">" + escapeXml(node) + "</" + tag + ">");
        return;
      }

      var attrs = "";
      var children = [];
      var textValue = null;

      Object.keys(node).forEach(function (key) {
        var child = node[key];
        if (key.charAt(0) === "@") {
          attrs += " " + safeName(key.slice(1)) + '="' + escapeXml(child == null ? "" : child) + '"';
        } else if (key === "#text") {
          textValue = child;
        } else {
          children.push([key, child]);
        }
      });

      if (!children.length && textValue !== null) {
        lines.push(pad + "<" + tag + attrs + ">" + escapeXml(textValue) + "</" + tag + ">");
        return;
      }
      if (!children.length && textValue === null) {
        lines.push(pad + "<" + tag + attrs + "/>");
        return;
      }

      lines.push(pad + "<" + tag + attrs + ">");
      if (textValue !== null) lines.push("  ".repeat(depth + 1) + escapeXml(textValue));
      children.forEach(function (pair) { build(pair[0], pair[1], depth + 1); });
      lines.push(pad + "</" + tag + ">");
    }

    if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      var keys = Object.keys(value);
      var hasAttrs = keys.some(function (k) { return k.charAt(0) === "@"; });
      if (keys.length === 1 && !hasAttrs) {
        build(keys[0], value[keys[0]], 0);
        return lines.join("\n");
      }
    }
    build(rootName || "root", value, 0);
    return lines.join("\n");
  }

  /* ---------------- XML → JSON ---------------- */
  function xmlToJson(text) {
    var parser = new DOMParser();
    var doc = parser.parseFromString(text, "application/xml");
    var failure = doc.querySelector("parsererror");
    if (failure) {
      var detail = (failure.textContent || "").replace(/\s+/g, " ").trim();
      throw new Error("the XML is not well-formed. " + (detail.slice(0, 220) || ""));
    }
    if (!doc.documentElement) throw new Error("no root element was found in the XML.");

    function convert(node) {
      var obj = {};
      var hasContent = false;

      if (node.attributes) {
        for (var i = 0; i < node.attributes.length; i++) {
          var a = node.attributes[i];
          obj["@" + a.name] = a.value;
          hasContent = true;
        }
      }

      var childElements = [];
      var textParts = [];
      for (var j = 0; j < node.childNodes.length; j++) {
        var child = node.childNodes[j];
        if (child.nodeType === 1) childElements.push(child);
        else if (child.nodeType === 3 || child.nodeType === 4) textParts.push(child.nodeValue);
      }

      var text = textParts.join("").trim();

      if (!childElements.length) {
        if (!hasContent) return text;
        if (text) obj["#text"] = text;
        return obj;
      }

      childElements.forEach(function (child) {
        var name = child.nodeName;
        var value = convert(child);
        if (Object.prototype.hasOwnProperty.call(obj, name)) {
          if (!Array.isArray(obj[name])) obj[name] = [obj[name]];
          obj[name].push(value);
        } else {
          obj[name] = value;
        }
      });
      if (text) obj["#text"] = text;
      return obj;
    }

    var root = doc.documentElement;
    var result = {};
    result[root.nodeName] = convert(root);
    return JSON.stringify(result, null, 2);
  }

  function detect(text) {
    var t = text.trim();
    if (t.charAt(0) === "<") return "xml";
    if (t.charAt(0) === "{" || t.charAt(0) === "[") return "json";
    return "json";
  }

  MPT.simpleTool({
    transform: function (text, opts) {
      var direction = (opts && opts.direction) || "auto";
      if (direction === "auto") direction = detect(text) === "xml" ? "xml2json" : "json2xml";

      if (direction === "json2xml") {
        var parsed;
        try {
          parsed = JSON.parse(text);
        } catch (e) {
          throw new Error("the input is not valid JSON — " + e.message);
        }
        var root = (opts.root || "").trim() || "root";
        return {
          output: jsonToXml(parsed, root),
          message: "Converted JSON → XML. Keys beginning with @ became attributes; #text became element text.",
          type: "ok"
        };
      }

      return {
        output: xmlToJson(text),
        message: "Converted XML → JSON. Attributes are prefixed with @ and repeated elements became arrays.",
        type: "ok"
      };
    },
    sample: SAMPLE,
    errorPrefix: "Conversion failed",
    downloadName: function (opts) {
      var node = document.getElementById("t-input");
      var dir = opts.direction === "auto"
        ? (detect(node ? node.value : "") === "xml" ? "xml2json" : "json2xml")
        : opts.direction;
      return dir === "json2xml" ? "converted.xml" : "converted.json";
    },
    emptyMessage: "Paste JSON or XML, or press “Load example”."
  });
})();
