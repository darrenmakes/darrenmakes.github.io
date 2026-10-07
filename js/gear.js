/* Cogspan gear math. Runs in the browser and under Node. */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.Cogspan = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  var CLOSE = 0.03;

  function rollingDiameterMm(input) {
    var measured = input.measuredRolloutMm;
    if (measured != null && String(measured).trim() !== "") {
      var rollout = Number(measured);
      if (!Number.isFinite(rollout) || rollout < 400 || rollout > 3500) {
        return { error: "Measured rollout should be one wheel revolution, between 400 and 3500 mm." };
      }
      return { diameterMm: rollout / Math.PI, source: "measured", measuredRolloutMm: rollout };
    }

    var bsd = Number(input.bsdMm);
    var width = Number(input.widthMm);
    var factor = input.heightFactor == null || String(input.heightFactor).trim() === ""
      ? 1
      : Number(input.heightFactor);

    if (!Number.isFinite(bsd) || bsd < 200 || bsd > 800) {
      return { error: "Bead-seat diameter should be the rim’s ISO size in millimeters, such as 622 for a 700c wheel." };
    }
    if (!Number.isFinite(width) || width < 10 || width > 100) {
      return { error: "Tire width should be the labeled width in millimeters, from 10 to 100." };
    }
    if (!Number.isFinite(factor) || factor < 0.7 || factor > 1.2) {
      return { error: "Tire height factor should be between 0.7 and 1.2. Use 1 when the tire is about as tall as it is wide." };
    }

    return {
      diameterMm: bsd + 2 * width * factor,
      source: "estimated",
      bsdMm: bsd,
      widthMm: width,
      heightFactor: factor
    };
  }

  function parseTeethList(text, bounds) {
    var raw = String(text == null ? "" : text).trim();
    if (!raw) return { error: "Enter at least one " + bounds.label + " tooth count.", teeth: [] };

    var parts = raw.split(/[^0-9]+/).filter(Boolean);
    if (!parts.length) {
      return { error: bounds.label + " tooth counts need to be whole numbers.", teeth: [] };
    }

    var teeth = [];
    var seen = {};
    var droppedDup = false;
    for (var i = 0; i < parts.length; i++) {
      var n = Number(parts[i]);
      if (!Number.isInteger(n) || n < bounds.min || n > bounds.max) {
        return {
          error: bounds.label + " tooth counts need to be whole numbers from " + bounds.min + " to " + bounds.max + ".",
          teeth: []
        };
      }
      if (seen[n]) {
        droppedDup = true;
        continue;
      }
      seen[n] = true;
      teeth.push(n);
    }

    if (teeth.length > bounds.limit) {
      return { error: "Enter at most " + bounds.limit + " " + bounds.label + " tooth counts.", teeth: [] };
    }

    teeth.sort(function (a, b) { return a - b; });
    return { teeth: teeth, droppedDup: droppedDup };
  }

  function parseRings(values) {
    var rings = [];
    var seen = {};
    for (var i = 0; i < values.length; i++) {
      var raw = String(values[i] == null ? "" : values[i]).trim();
      if (!raw) continue;
      var n = Number(raw);
      if (!Number.isInteger(n) || n < 20 || n > 80) {
        return { error: "Chainrings need to be whole tooth counts from 20 to 80." };
      }
      if (!seen[n]) {
        seen[n] = true;
        rings.push(n);
      }
    }
    if (!rings.length) return { error: "Enter at least one chainring." };
    if (rings.length > 3) return { error: "Enter at most three chainrings." };
    rings.sort(function (a, b) { return b - a; });
    return { rings: rings };
  }

  function parseCadence(value) {
    var n = Number(value);
    if (!Number.isFinite(n) || n < 40 || n > 160) {
      return { error: "Cadence should be between 40 and 160 rpm." };
    }
    return { cadenceRpm: n };
  }

  function parseCrank(value) {
    var raw = String(value == null ? "" : value).trim();
    if (!raw) return { crankMm: null };
    var n = Number(raw);
    if (!Number.isFinite(n) || n < 100 || n > 250) {
      return { error: "Crank length should be in millimeters, from 100 to 250, or left blank." };
    }
    return { crankMm: n };
  }

  function gearPoint(ring, cog, diameterMm, cadenceRpm, crankMm) {
    var ratio = ring / cog;
    var gearInches = ratio * (diameterMm / 25.4);
    var rolloutM = ratio * (diameterMm / 1000) * Math.PI;
    var speedKmh = rolloutM * cadenceRpm * 60 / 1000;
    var gain = crankMm ? (diameterMm / 2 / crankMm) * ratio : null;
    return {
      ring: ring,
      cog: cog,
      ratio: ratio,
      gearInches: gearInches,
      rolloutM: rolloutM,
      speedKmh: speedKmh,
      speedMph: speedKmh / 1.609344,
      gain: gain,
      key: ring + "x" + cog
    };
  }

  function expand(rings, cogs, diameterMm, cadenceRpm, crankMm) {
    var gears = [];
    for (var r = 0; r < rings.length; r++) {
      for (var c = 0; c < cogs.length; c++) {
        gears.push(gearPoint(rings[r], cogs[c], diameterMm, cadenceRpm, crankMm));
      }
    }
    return gears;
  }

  function markClose(gears) {
    var sorted = gears.slice().sort(function (a, b) { return a.ratio - b.ratio; });
    var close = {};
    for (var i = 0; i < sorted.length; i++) {
      for (var j = i + 1; j < sorted.length; j++) {
        var gap = (sorted[j].ratio - sorted[i].ratio) / sorted[i].ratio;
        if (gap >= CLOSE) break;
        close[sorted[i].key] = true;
        close[sorted[j].key] = true;
      }
    }
    return gears.map(function (gear) {
      var copy = Object.assign({}, gear);
      copy.close = !!close[gear.key];
      return copy;
    });
  }

  function extremes(gears) {
    var easiest = gears[0];
    var hardest = gears[0];
    for (var i = 1; i < gears.length; i++) {
      if (gears[i].gearInches < easiest.gearInches) easiest = gears[i];
      if (gears[i].gearInches > hardest.gearInches) hardest = gears[i];
    }
    return {
      easiest: easiest,
      hardest: hardest,
      range: hardest.ratio / easiest.ratio
    };
  }

  function toothSpan(rings, cogs) {
    var front = Math.max.apply(null, rings) - Math.min.apply(null, rings);
    var rear = Math.max.apply(null, cogs) - Math.min.apply(null, cogs);
    return { front: front, rear: rear, total: front + rear };
  }

  function nearest(gear, others) {
    var best = others[0];
    var gap = Infinity;
    for (var i = 0; i < others.length; i++) {
      var d = Math.abs(others[i].ratio - gear.ratio) / Math.min(others[i].ratio, gear.ratio);
      if (d < gap) {
        gap = d;
        best = others[i];
      }
    }
    return { gear: best, gap: gap };
  }

  function compareSets(current, proposed) {
    var cur = extremes(current);
    var next = extremes(proposed);
    var covered = 0;
    var distinct = [];
    for (var i = 0; i < proposed.length; i++) {
      var hit = nearest(proposed[i], current);
      if (hit.gap < CLOSE) {
        covered += 1;
      } else {
        distinct.push({
          gear: proposed[i],
          nearest: hit.gear,
          gap: hit.gap,
          delta: (proposed[i].gearInches - hit.gear.gearInches) / hit.gear.gearInches
        });
      }
    }
    distinct.sort(function (a, b) { return a.gear.gearInches - b.gear.gearInches; });
    return {
      current: cur,
      proposed: next,
      easierFraction: (cur.easiest.gearInches - next.easiest.gearInches) / cur.easiest.gearInches,
      harderFraction: (next.hardest.gearInches - cur.hardest.gearInches) / cur.hardest.gearInches,
      covered: covered,
      proposedCount: proposed.length,
      distinct: distinct
    };
  }

  return {
    CLOSE: CLOSE,
    rollingDiameterMm: rollingDiameterMm,
    parseTeethList: parseTeethList,
    parseRings: parseRings,
    parseCadence: parseCadence,
    parseCrank: parseCrank,
    gearPoint: gearPoint,
    expand: expand,
    markClose: markClose,
    extremes: extremes,
    toothSpan: toothSpan,
    compareSets: compareSets
  };
});
