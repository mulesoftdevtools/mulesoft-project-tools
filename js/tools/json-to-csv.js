/* =====================================================================
   JSON ⇄ CSV converter
   ===================================================================== */
(function () {
  "use strict";

  var SAMPLE = JSON.stringify([
    { id: 1, name: "Ada Lovelace", email: "ada@example.com", address: { city: "London", country: "UK" }, active: true },
    { id: 2, name: "Grace Hopper", email: "grace@example.com", address: { city: "New York", country: "USA" }, active: true },
    { id: 3, name: "Alan Turing", email: "alan@example.com", address: { city: "Wilmslow", country: "UK" }, active: false }
  ], null, 2);

  function delimiterOf(opts) {
    var d = (opts && opts.delimiter) || ",";
    return d === "tab" ? "\t" : d;
  }

  function flattenRow(obj, prefix, out) {
    Object.keys(obj).forEach(function (key) {
      var value = obj[key];
      var path = prefix ? prefix + "." + key : key;
      if (value !== null && typeof value === "object" && !Array.isArray(value)) {
        flattenRow(value, path, out);
      } else if (Array.isArray(value)) {
        out[path] = value.map(function (v) {
          return (v !== null && typeof v === "object") ? JSON.stringify(v) : String(v);
        }).join("; ");
      } else {
        out[path] = value === null || value === undefined ? "" : String(value);
      }
    });
    return out;
  }

  function jsonToCsv(text, delim) {
    var parsed;
    try {
      parsed = JSON.parse(text);
    } catch (e) {
      throw new Error("the input is not valid JSON — " + e.message);
    }

    var rows;
    if (Array.isArray(parsed)) rows = parsed;
    else if (parsed && typeof parsed === "object") {
      var arrayKey = Object.keys(parsed).find(function (k) { return Array.isArray(parsed[k]); });
      if (arrayKey) rows = parsed[arrayKey];
      else rows = [parsed];
    } else {
      throw new Error("CSV output needs an array of objects (or an object containing one).");
    }

    if (!rows.length) throw new Error("the array is empty, so there is nothing to convert.");

    var flat = rows.map(function (row, i) {
      if (row === null || typeof row !== "object" || Array.isArray(row)) {
        throw new Error("item " + (i + 1) + " in the array is not an object — CSV needs objects with named fields.");
      }
      return flattenRow(row, "", {});
    });

    var columns = [];
    flat.forEach(function (row) {
      Object.keys(row).forEach(function (k) { if (columns.indexOf(k) === -1) columns.push(k); });
    });

    function cell(value) {
      var s = value === undefined ? "" : String(value);
      if (s.indexOf(delim) !== -1 || s.indexOf('"') !== -1 || /[\r\n]/.test(s)) {
        return '"' + s.replace(/"/g, '""') + '"';
      }
      return s;
    }

    var lines = [columns.map(cell).join(delim)];
    flat.forEach(function (row) {
      lines.push(columns.map(function (c) { return cell(row[c]); }).join(delim));
    });

    return {
      output: lines.join("\r\n"),
      message: "Converted " + rows.length + " row(s) into " + columns.length + " column(s).",
      type: "ok"
    };
  }

  function parseCsv(text, delim) {
    var rows = [];
    var row = [];
    var field = "";
    var inQuotes = false;
    var i = 0;

    while (i < text.length) {
      var ch = text.charAt(i);
      if (inQuotes) {
        if (ch === '"') {
          if (text.charAt(i + 1) === '"') { field += '"'; i += 2; continue; }
          inQuotes = false; i++; continue;
        }
        field += ch; i++; continue;
      }
      if (ch === '"') { inQuotes = true; i++; continue; }
      if (ch === delim) { row.push(field); field = ""; i++; continue; }
      if (ch === "\r") { i++; continue; }
      if (ch === "\n") { row.push(field); rows.push(row); row = []; field = ""; i++; continue; }
      field += ch; i++;
    }
    if (inQuotes) throw new Error("the CSV has an unterminated quoted field.");
    row.push(field);
    if (row.length > 1 || row[0] !== "") rows.push(row);
    return rows;
  }

  function coerce(value) {
    var v = value.trim();
    if (v === "") return "";
    if (/^(true|false)$/i.test(v)) return /^true$/i.test(v);
    if (v.toLowerCase() === "null") return null;
    if (/^-?\d+$/.test(v)) {
      var n = parseInt(v, 10);
      if (String(n) === v.replace(/^\+/, "")) return n;
    }
    if (/^-?\d*\.\d+$/.test(v)) return parseFloat(v);
    return value;
  }

  function csvToJson(text, delim) {
    var rows = parseCsv(text.replace(/^﻿/, ""), delim).filter(function (r) {
      return r.length > 1 || (r[0] && r[0].trim() !== "");
    });
    if (!rows.length) throw new Error("no rows were found in the CSV.");
    if (rows.length < 2) throw new Error("the CSV needs a header row plus at least one data row.");

    var headers = rows[0].map(function (h, i) {
      var name = String(h).trim();
      return name || "column" + (i + 1);
    });

    var mismatched = 0;
    var out = rows.slice(1).map(function (r) {
      if (r.length !== headers.length) mismatched++;
      var obj = {};
      headers.forEach(function (h, i) { obj[h] = coerce(r[i] === undefined ? "" : r[i]); });
      return obj;
    });

    var message = "Converted " + out.length + " row(s) into JSON with " + headers.length + " field(s).";
    if (mismatched) {
      return {
        output: JSON.stringify(out, null, 2),
        message: message + "\n\nNote: " + mismatched + " row(s) had a different number of columns than the " +
                 "header. Missing values became empty strings.",
        type: "warn"
      };
    }
    return { output: JSON.stringify(out, null, 2), message: message, type: "ok" };
  }

  function detect(text) {
    var t = text.trim();
    if (t.charAt(0) === "[" || t.charAt(0) === "{") return "json";
    return "csv";
  }

  MPT.simpleTool({
    transform: function (text, opts) {
      var delim = delimiterOf(opts);
      var direction = (opts && opts.direction) || "auto";
      if (direction === "auto") direction = detect(text) === "json" ? "json2csv" : "csv2json";
      return direction === "json2csv" ? jsonToCsv(text, delim) : csvToJson(text, delim);
    },
    sample: SAMPLE,
    errorPrefix: "Conversion failed",
    downloadName: function (opts) {
      var node = document.getElementById("t-input");
      var dir = opts.direction === "auto"
        ? (detect(node ? node.value : "") === "json" ? "json2csv" : "csv2json")
        : opts.direction;
      return dir === "json2csv" ? "data.csv" : "data.json";
    },
    emptyMessage: "Paste a JSON array or a CSV document, or press “Load example”."
  });
})();
