(function () {
  var g = window.Cogspan;
  var form = document.getElementById("gear-form");
  if (!form || !g) return;

  var els = {
    wheel: document.getElementById("wheel"),
    bsd: document.getElementById("bsd"),
    width: document.getElementById("width"),
    factor: document.getElementById("factor"),
    roll: document.getElementById("roll"),
    r1: document.getElementById("r1"),
    r2: document.getElementById("r2"),
    r3: document.getElementById("r3"),
    cassette: document.getElementById("cassette"),
    cogs: document.getElementById("cogs"),
    altSelect: document.getElementById("alt-cassette"),
    alt: document.getElementById("alt"),
    rpm: document.getElementById("rpm"),
    crank: document.getElementById("crank"),
    advanced: document.getElementById("advanced"),
    wheelSpec: document.getElementById("wheel-spec"),
    cogsError: document.getElementById("cogs-error"),
    altError: document.getElementById("alt-error"),
    formError: document.getElementById("form-error"),
    results: document.getElementById("results"),
    status: document.getElementById("status"),
    copyNote: document.getElementById("copy-note")
  };

  var KEY = "cogspan.v1";
  var lastPlain = "";
  var COG_BOUNDS = { min: 9, max: 60, limit: 13, label: "Cog" };
  var dirty = false;

  function $(name) {
    var node = form.querySelector('input[name="' + name + '"]:checked');
    return node ? node.value : "mph";
  }

  function snapshot() {
    return {
      wheel: els.wheel.value,
      bsd: els.bsd.value,
      width: els.width.value,
      factor: els.factor.value,
      roll: els.roll.value,
      r1: els.r1.value,
      r2: els.r2.value,
      r3: els.r3.value,
      cogs: els.cogs.value,
      alt: els.alt.value,
      rpm: els.rpm.value,
      unit: $("unit"),
      crank: els.crank.value
    };
  }

  function apply(data) {
    if (!data) return;
    ["wheel", "bsd", "width", "factor", "roll", "r1", "r2", "r3", "cogs", "alt", "rpm", "crank"].forEach(function (key) {
      if (Object.prototype.hasOwnProperty.call(data, key) && els[key]) els[key].value = data[key];
    });
    if (data.unit) {
      var radio = form.querySelector('input[name="unit"][value="' + data.unit + '"]');
      if (radio) radio.checked = true;
    }
    matchPreset(els.cassette, els.cogs.value);
    matchPreset(els.altSelect, els.alt.value);
  }

  function matchPreset(select, text) {
    var key = String(text || "").split(/[^0-9]+/).filter(Boolean).join(",");
    if (!key && select.querySelector('option[value="__none__"]')) {
      select.value = "__none__";
      return;
    }
    var found = false;
    for (var i = 0; i < select.options.length; i++) {
      if (select.options[i].value === key) found = true;
    }
    select.value = found ? key : "";
  }

  function readQuery() {
    var q = new URLSearchParams(location.search);
    if (![...q.keys()].length) return null;
    var data = {};
    ["wheel", "bsd", "width", "factor", "roll", "r1", "r2", "r3", "cogs", "alt", "rpm", "unit", "crank"].forEach(function (key) {
      if (q.has(key)) data[key] = q.get(key);
    });
    return data;
  }

  function queryString() {
    var data = snapshot();
    var q = new URLSearchParams();
    ["wheel", "bsd", "width", "factor", "r1", "r2", "r3", "cogs", "rpm", "unit"].forEach(function (key) {
      if (data[key]) q.set(key, data[key]);
    });
    if (data.roll) q.set("roll", data.roll);
    if (data.crank) q.set("crank", data.crank);
    if (data.alt) q.set("alt", data.alt);
    return q.toString();
  }

  function writeUrl() {
    if (!dirty) return;
    var next = queryString();
    var current = location.search.startsWith("?") ? location.search.slice(1) : "";
    if (next !== current) history.replaceState(null, "", next ? "?" + next : location.pathname);
  }

  function persist() {
    try { localStorage.setItem(KEY, JSON.stringify(snapshot())); } catch (err) { /* private mode */ }
  }

  function loadStored() {
    try {
      var raw = localStorage.getItem(KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (err) {
      return null;
    }
  }

  function fmt(n, digits) {
    return Number(n).toFixed(digits);
  }

  function label(gear) {
    return gear.ring + "×" + gear.cog;
  }

  function speedOf(gear, unit) {
    return unit === "kmh" ? fmt(gear.speedKmh, 1) + " km/h" : fmt(gear.speedMph, 1) + " mph";
  }

  function ringClass(ring, rings) {
    var sorted = rings.slice().sort(function (a, b) { return b - a; });
    return ["a", "b", "c"][sorted.indexOf(ring)] || "a";
  }

  function build() {
    var diameter = g.rollingDiameterMm({
      bsdMm: els.bsd.value,
      widthMm: els.width.value,
      heightFactor: els.factor.value,
      measuredRolloutMm: els.roll.value
    });
    if (diameter.error) return { error: diameter.error };

    var rings = g.parseRings([els.r1.value, els.r2.value, els.r3.value]);
    if (rings.error) return { error: rings.error };

    var cogs = g.parseTeethList(els.cogs.value, COG_BOUNDS);
    if (cogs.error) return { error: cogs.error };

    var cadence = g.parseCadence(els.rpm.value);
    if (cadence.error) return { error: cadence.error };

    var crank = g.parseCrank(els.crank.value);
    if (crank.error) return { error: crank.error };

    var gears = g.markClose(g.expand(rings.rings, cogs.teeth, diameter.diameterMm, cadence.cadenceRpm, crank.crankMm));
    var summary = g.extremes(gears);
    var model = {
      diameter: diameter,
      rings: rings.rings,
      cogs: cogs.teeth,
      droppedDup: cogs.droppedDup,
      cadence: cadence.cadenceRpm,
      crank: crank.crankMm,
      unit: $("unit"),
      gears: gears,
      summary: summary,
      span: g.toothSpan(rings.rings, cogs.teeth),
      closeCount: gears.filter(function (gear) { return gear.close; }).length
    };

    var altText = els.alt.value.trim();
    if (altText) {
      var altCogs = g.parseTeethList(altText, COG_BOUNDS);
      if (altCogs.error) {
        model.altError = altCogs.error;
      } else {
        var proposed = g.expand(rings.rings, altCogs.teeth, diameter.diameterMm, cadence.cadenceRpm, crank.crankMm);
        model.altDropped = altCogs.droppedDup;
        model.altCogs = altCogs.teeth;
        model.altSpan = g.toothSpan(rings.rings, altCogs.teeth);
        model.report = g.compareSets(gears, proposed);
      }
    }
    return model;
  }

  function stat(k, n, s) {
    return el("article", { class: "stat" }, [
      el("p", { class: "k" }, [k]),
      el("p", { class: "n" }, [n]),
      el("p", { class: "s" }, [s])
    ]);
  }

  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (key) {
      if (key === "class") node.className = attrs[key];
      else node.setAttribute(key, attrs[key]);
    });
    (children || []).forEach(function (child) {
      node.append(child instanceof Node ? child : document.createTextNode(child));
    });
    return node;
  }

  function sentence(report) {
    var lowGear = report.proposed.easiest;
    var curLow = report.current.easiest;
    var low;
    if (Math.abs(report.easierFraction) < 0.005) {
      low = "The lowest gear is effectively unchanged (" + label(lowGear) + ").";
    } else if (report.easierFraction > 0) {
      low = "The lowest gear is " + fmt(report.easierFraction * 100, 1) + "% easier (" + label(lowGear) + " at " + fmt(lowGear.gearInches, 1) + " in, versus " + label(curLow) + " at " + fmt(curLow.gearInches, 1) + " in).";
    } else {
      low = "The lowest gear is " + fmt(Math.abs(report.easierFraction) * 100, 1) + "% harder (" + label(lowGear) + " at " + fmt(lowGear.gearInches, 1) + " in, versus " + label(curLow) + " at " + fmt(curLow.gearInches, 1) + " in).";
    }
    var high;
    if (Math.abs(report.harderFraction) < 0.005) high = "The hardest gear is unchanged.";
    else if (report.harderFraction > 0) high = "The hardest gear is " + fmt(report.harderFraction * 100, 1) + "% harder.";
    else high = "The hardest gear is " + fmt(Math.abs(report.harderFraction) * 100, 1) + "% easier.";
    var overlap = report.covered + " of " + report.proposedCount + " combinations are within 3% of a gear you already have.";
    return low + " " + high + " " + overlap;
  }

  function plain(model) {
    var lines = ["Cogspan"];
    var d = model.diameter;
    if (d.source === "measured") {
      lines.push("Measured rollout " + fmt(d.measuredRolloutMm, 0) + " mm, rolling diameter " + fmt(d.diameterMm, 1) + " mm.");
    } else {
      lines.push("Bead seat " + d.bsdMm + " mm, tire " + d.widthMm + " mm, height factor " + d.heightFactor + ", rolling diameter " + fmt(d.diameterMm, 1) + " mm.");
    }
    lines.push("Cadence " + model.cadence + " rpm. Chainrings " + model.rings.join("/") + ". Cassette " + model.cogs.join("-") + ".");
    if (model.altCogs) lines.push("Considering " + model.altCogs.join("-") + ".");
    lines.push("Easiest " + label(model.summary.easiest) + "  " + fmt(model.summary.easiest.gearInches, 1) + " in  " + fmt(model.summary.easiest.rolloutM, 2) + " m  " + speedOf(model.summary.easiest, model.unit));
    lines.push("Hardest " + label(model.summary.hardest) + "  " + fmt(model.summary.hardest.gearInches, 1) + " in  " + fmt(model.summary.hardest.rolloutM, 2) + " m  " + speedOf(model.summary.hardest, model.unit));
    lines.push("Range " + fmt(model.summary.range, 2) + "×");
    lines.push("");
    model.gears.slice().sort(function (a, b) { return b.gearInches - a.gearInches; }).forEach(function (gear) {
      var gain = gear.gain == null ? "" : "  gain " + fmt(gear.gain, 2);
      lines.push(label(gear) + "  " + fmt(gear.ratio, 2) + "  " + fmt(gear.gearInches, 1) + " in  " + fmt(gear.rolloutM, 2) + " m  " + speedOf(gear, model.unit) + gain + (gear.close ? "  close" : ""));
    });
    return lines.join("\n");
  }

  function render() {
    var model = build();
    els.results.replaceChildren();
    var spec = els.wheel.selectedOptions[0].textContent + " · bead seat " + (els.bsd.value || "—") + " mm · " + (els.width.value || "—") + " mm tire";
    els.wheelSpec.textContent = spec;

    if (model.error) {
      els.formError.hidden = false;
      els.formError.textContent = model.error;
      els.altError.hidden = true;
      els.status.textContent = model.error;
      els.results.append(el("p", { class: "pending" }, ["The chart needs a valid wheel, chainring, cassette, and cadence."]));
      return;
    }

    els.formError.hidden = true;
    els.altError.hidden = !model.altError;
    els.altError.textContent = model.altError || "";

    var notes = [];
    if (model.droppedDup || model.altDropped) notes.push("Repeated tooth counts were ignored.");
    if (notes.length) els.results.append(el("p", { class: "warn" }, [notes.join(" ")]));

    if (model.report) {
      var callout = el("div", { class: "callout" }, [
        el("p", {}, [sentence(model.report)])
      ]);
      if (model.report.distinct.length) {
        var list = el("ul", { class: "distinct" });
        model.report.distinct.forEach(function (row) {
          var way = row.delta < 0 ? " easier than " : " harder than ";
          list.append(el("li", {}, [
            el("code", {}, [label(row.gear)]),
            fmt(Math.abs(row.delta) * 100, 1) + "%" + way + label(row.nearest) + " (" + fmt(row.gear.gearInches, 1) + " in)"
          ]));
        });
        callout.append(el("p", { class: "note" }, ["Steps that are not within 3% of a gear you already have:"]));
        callout.append(list);
      }
      els.results.append(callout);
    }

    var easy = model.summary.easiest;
    var hard = model.summary.hardest;
    els.results.append(el("div", { class: "stats" }, [
      stat("Easiest", fmt(easy.gearInches, 1) + " in", label(easy) + " · " + speedOf(easy, model.unit)),
      stat("Hardest", fmt(hard.gearInches, 1) + " in", label(hard) + " · " + speedOf(hard, model.unit)),
      stat("Range", fmt(model.summary.range, 2) + "×", "Hardest ratio ÷ easiest ratio"),
      stat("Close steps", String(model.closeCount), "of " + model.gears.length + " within 3% of another")
    ]));

    els.results.append(el("div", { class: "legend" }, [
      el("span", {}, [el("i", { class: "swatch a" }), "Largest chainring"]),
      model.rings.length > 1 ? el("span", {}, [el("i", { class: "swatch b" }), model.rings.length > 2 ? "Middle chainring" : "Smaller chainring"]) : "",
      model.rings.length > 2 ? el("span", {}, [el("i", { class: "swatch c" }), "Smallest ring"]) : "",
      el("span", {}, [el("i", { class: "swatch dup" }), "Within 3% of another gear"])
    ].filter(Boolean)));

    var maxIn = hard.gearInches;
    var ladder = el("ol", { class: "ladder" });
    model.gears.slice().sort(function (a, b) { return b.gearInches - a.gearInches; }).forEach(function (gear) {
      var cls = ringClass(gear.ring, model.rings);
      var width = Math.max(2, Math.min(100, (gear.gearInches / maxIn) * 100));
      var bar = el("span", { class: "bar " + cls + (gear.close ? " dup" : "") });
      bar.style.width = width.toFixed(1) + "%";
      ladder.append(el("li", {}, [
        el("span", { class: "who" }, [label(gear) + (gear.close ? " · close" : "")]),
        el("span", { class: "track" }, [bar]),
        el("span", { class: "val" }, [fmt(gear.gearInches, 1) + " in · " + speedOf(gear, model.unit)])
      ]));
    });
    els.results.append(ladder);

    var table = el("table");
    var caption = "Gear inches for each chainring and cog. The smaller figure is speed at " + model.cadence + " rpm. Shaded cells are within 3% of another gear in this cassette.";
    table.append(el("caption", {}, [caption]));
    var head = el("tr", {}, [el("th", { scope: "col" }, ["Ring"])]);
    model.cogs.forEach(function (cog) {
      head.append(el("th", { scope: "col" }, [String(cog)]));
    });
    table.append(el("thead", {}, [head]));
    var body = el("tbody");
    model.rings.forEach(function (ring) {
      var row = el("tr", {}, [el("th", { scope: "row" }, [String(ring)])]);
      model.cogs.forEach(function (cog) {
        var gear = model.gears.filter(function (item) { return item.ring === ring && item.cog === cog; })[0];
        var cell = el("td", { class: gear.close ? "is-close" : "" }, [
          fmt(gear.gearInches, 1),
          el("span", { class: "sub" }, [speedOf(gear, model.unit)])
        ]);
        var title = fmt(gear.rolloutM, 2) + " m rollout";
        if (gear.gain != null) title += ", gain ratio " + fmt(gear.gain, 2);
        if (gear.close) title += ", within 3% of another gear";
        cell.setAttribute("title", title);
        row.append(cell);
      });
      body.append(row);
    });
    table.append(body);
    els.results.append(el("div", { class: "table-wrap" }, [table]));

    var assume;
    if (model.diameter.source === "measured") {
      assume = "Rolling diameter " + fmt(model.diameter.diameterMm, 1) + " mm comes from the measured rollout of " + fmt(model.diameter.measuredRolloutMm, 0) + " mm. Tire width was not used.";
    } else {
      assume = "Rolling diameter " + fmt(model.diameter.diameterMm, 1) + " mm is estimated as bead seat " + model.diameter.bsdMm + " mm plus twice the " + model.diameter.widthMm + " mm tire width, times height factor " + model.diameter.heightFactor + ". A labeled width is not always the mounted height. Measure one revolution of the tire when the difference matters.";
    }
    assume += " Speed is rollout times cadence, assuming the tire does not slip. It is not a prediction for wind, grade, or a ride.";
    els.results.append(el("p", { class: "note" }, [assume]));

    var cap = "Tooth span on this cassette is " + model.span.rear + " teeth (" + model.cogs[0] + " to " + model.cogs[model.cogs.length - 1] + ")";
    if (model.rings.length > 1) cap += " and " + model.span.front + " teeth across the chainrings. Together that is " + model.span.total + " teeth a derailleur has to take up";
    cap += ". That is arithmetic from the tooth counts, not a guarantee a particular derailleur will shift it. Check the maker’s capacity figure before buying.";
    if (model.altSpan) {
      cap += " The cassette you are considering spans " + model.altSpan.rear + " rear teeth" + (model.rings.length > 1 ? " and " + model.altSpan.total + " teeth total with these chainrings" : "") + ".";
    }
    els.results.append(el("p", { class: "note" }, [cap]));

    if (model.crank) {
      els.results.append(el("p", { class: "note" }, ["Gain ratio uses a " + model.crank + " mm crank: wheel radius divided by crank length, times the gear ratio. Hover a shaded or plain cell for that gear’s gain ratio."]));
    }

    var actions = el("div", { class: "result-actions" }, [
      el("button", { type: "button", class: "ghost", "data-action": "copy" }, ["Copy chart as text"]),
      el("button", { type: "button", class: "ghost", "data-action": "link" }, ["Copy link"])
    ]);
    els.results.append(actions);
    lastPlain = plain(model);

    var easySpeed = speedOf(easy, model.unit);
    els.status.textContent = "Chart updated. Easiest gear " + label(easy) + ", " + fmt(easy.gearInches, 1) + " gear inches, " + easySpeed + ".";
  }

  function onEdit() {
    dirty = true;
    render();
    persist();
    writeUrl();
  }

  els.cassette.addEventListener("change", function () {
    if (els.cassette.value) els.cogs.value = els.cassette.value;
    onEdit();
  });
  els.altSelect.addEventListener("change", function () {
    if (els.altSelect.value === "__none__") els.alt.value = "";
    else if (els.altSelect.value) els.alt.value = els.altSelect.value;
    onEdit();
  });
  els.wheel.addEventListener("change", function () {
    var opt = els.wheel.selectedOptions[0];
    if (opt.dataset.bsd) {
      els.bsd.value = opt.dataset.bsd;
      els.width.value = opt.dataset.width;
    }
    onEdit();
  });

  form.addEventListener("input", function (event) {
    if (event.target === els.wheel) {
      var picked = els.wheel.selectedOptions[0];
      if (picked && picked.dataset.bsd) {
        els.bsd.value = picked.dataset.bsd;
        els.width.value = picked.dataset.width;
      }
    }
    if (event.target === els.cassette && els.cassette.value) els.cogs.value = els.cassette.value;
    if (event.target === els.altSelect) {
      if (els.altSelect.value === "__none__") els.alt.value = "";
      else if (els.altSelect.value) els.alt.value = els.altSelect.value;
    }
    if (event.target === els.cogs) matchPreset(els.cassette, els.cogs.value);
    if (event.target === els.alt) matchPreset(els.altSelect, els.alt.value);
    if (event.target === els.bsd) {
      var opt = els.wheel.selectedOptions[0];
      if (!opt || opt.dataset.bsd !== els.bsd.value) els.wheel.value = "custom";
    }
    onEdit();
  });
  form.addEventListener("submit", function (event) {
    event.preventDefault();
    onEdit();
  });

  els.results.addEventListener("click", function (event) {
    var button = event.target.closest("button");
    if (!button) return;
    var text = button.dataset.action === "link"
      ? location.origin + location.pathname + "?" + queryString()
      : lastPlain;
    if (!text || !navigator.clipboard) {
      els.copyNote.hidden = false;
      els.copyNote.textContent = "Clipboard is unavailable in this browser. Select the address bar or copy from a print view.";
      return;
    }
    navigator.clipboard.writeText(text).then(function () {
      els.copyNote.hidden = false;
      els.copyNote.textContent = button.dataset.action === "link" ? "Link copied." : "Chart copied.";
    }).catch(function () {
      els.copyNote.hidden = false;
      els.copyNote.textContent = "Could not copy. Select the address bar instead.";
    });
  });

  document.getElementById("reset").addEventListener("click", function () {
    try { localStorage.removeItem(KEY); } catch (err) { /* ignore */ }
    location.href = location.pathname;
  });

  var fromQuery = readQuery();
  if (fromQuery) {
    apply(fromQuery);
  } else {
    apply(loadStored());
  }
  if (els.roll.value || els.crank.value || (els.factor.value && els.factor.value !== "1") || els.wheel.value === "custom") {
    els.advanced.open = true;
  }
  render();
})();
