/* =====================================================================
   URL / percent encoder and decoder
   ===================================================================== */
(function () {
  "use strict";

  var tool = MPT.simpleTool({
    transform: function (text, opts) {
      var mode = opts.mode || "encode-component";

      if (mode === "decode") {
        var decoded;
        try {
          decoded = decodeURIComponent(text.replace(/\+/g, " "));
        } catch (e) {
          throw new Error("the input contains an invalid percent-escape sequence. " +
                          "A lone “%” must be written as “%25”.");
        }
        return {
          output: decoded,
          message: "Decoded successfully. “+” characters were treated as spaces, as in query strings.",
          type: "ok"
        };
      }

      var encoded = mode === "encode-uri" ? encodeURI(text) : encodeURIComponent(text);
      var changed = encoded.length - text.length;
      return {
        output: encoded,
        message: mode === "encode-uri"
          ? "Encoded as a full URI — reserved characters such as / : ? & # were left intact." +
            (changed ? " " + changed + " extra character(s) added." : "")
          : "Encoded as a URI component — every reserved character was escaped." +
            (changed ? " " + changed + " extra character(s) added." : ""),
        type: "ok"
      };
    },
    sample: "https://api.example.com/search?q=order status&tags=eu,priority&note=50% off",
    errorPrefix: "Could not convert",
    emptyMessage: "Type or paste a URL or value to convert, or press “Load example”."
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
      mode.value = mode.value === "decode" ? "encode-component" : "decode";
      tool.run(false);
    });
  }
})();
