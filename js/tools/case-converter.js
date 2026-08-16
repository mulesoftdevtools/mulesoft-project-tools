/* =====================================================================
   Text case converter
   ===================================================================== */
(function () {
  "use strict";

  var SMALL_WORDS = ["a", "an", "and", "as", "at", "but", "by", "for", "in", "nor",
                     "of", "on", "or", "per", "the", "to", "up", "via", "vs"];

  /* Split an identifier or phrase into its constituent words. */
  function words(text) {
    return String(text)
      .replace(/([a-z0-9])([A-Z])/g, "$1 $2")          // camelCase humps
      .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")       // HTTPStatus → HTTP Status
      .replace(/[_\-.\/\\]+/g, " ")                    // separators
      .replace(/\s+/g, " ")
      .trim()
      .split(" ")
      .filter(Boolean);
  }

  function cap(word) {
    return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
  }

  var CONVERTERS = {
    camel: function (line) {
      var w = words(line);
      if (!w.length) return "";
      return w[0].toLowerCase() + w.slice(1).map(cap).join("");
    },
    pascal: function (line) {
      return words(line).map(cap).join("");
    },
    snake: function (line) {
      return words(line).map(function (x) { return x.toLowerCase(); }).join("_");
    },
    screaming: function (line) {
      return words(line).map(function (x) { return x.toUpperCase(); }).join("_");
    },
    kebab: function (line) {
      return words(line).map(function (x) { return x.toLowerCase(); }).join("-");
    },
    dot: function (line) {
      return words(line).map(function (x) { return x.toLowerCase(); }).join(".");
    },
    title: function (line) {
      var w = words(line);
      return w.map(function (word, i) {
        var lower = word.toLowerCase();
        if (i !== 0 && i !== w.length - 1 && SMALL_WORDS.indexOf(lower) !== -1) return lower;
        return cap(word);
      }).join(" ");
    },
    sentence: function (line) {
      var w = words(line);
      if (!w.length) return "";
      return w.map(function (x, i) { return i === 0 ? cap(x) : x.toLowerCase(); }).join(" ");
    },
    upper: function (line) { return line.toUpperCase(); },
    lower: function (line) { return line.toLowerCase(); },
    trim: function (line) { return line.replace(/\s+/g, " ").trim(); },
    reverse: function (line) { return Array.from(line).reverse().join(""); }
  };

  var LABELS = {
    camel: "camelCase", pascal: "PascalCase", snake: "snake_case",
    screaming: "SCREAMING_SNAKE_CASE", kebab: "kebab-case", dot: "dot.case",
    title: "Title Case", sentence: "Sentence case", upper: "UPPERCASE",
    lower: "lowercase", trim: "trimmed and collapsed", reverse: "reversed"
  };

  MPT.simpleTool({
    transform: function (text, opts) {
      var style = opts.style || "camel";
      var convert = CONVERTERS[style];
      if (!convert) throw new Error("unknown conversion style “" + style + "”.");

      var lines = String(text).split("\n");
      var converted = lines.map(function (line) {
        if (!line.trim()) return "";
        return convert(line);
      });

      var wordCount = lines.reduce(function (total, line) { return total + words(line).length; }, 0);
      var nonEmpty = lines.filter(function (l) { return l.trim(); }).length;

      return {
        output: converted.join("\n"),
        message: "Converted " + nonEmpty + " line(s) / " + wordCount + " word(s) to " + LABELS[style] + ".",
        type: "ok"
      };
    },
    sample: "order_line_items\ncustomerFirstName\nHTTP-Status-Code\n  the quick brown fox  \nAPIResponseHandler",
    errorPrefix: "Could not convert",
    emptyMessage: "Paste some text or identifiers, or press “Load example”."
  });
})();
