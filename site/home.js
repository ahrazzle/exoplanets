/* Overview page: headline numbers and the period-radius plot, computed from the CSV files at load time. */
(function () {
  'use strict';
  var X = window.Exo;
  var statsEl = document.getElementById('stats');
  var tierEl = document.getElementById('tier-table');
  var plotEl = document.getElementById('plot');
  var COUNTED = X.TIERS.filter(function (t) { return t.counted; }).map(function (t) { return t.id; });

  function stat(v, l) { return '<div class="stat"><div class="v">' + v + '</div><div class="l">' + l + '</div></div>'; }
  function n(x) { return x.toLocaleString('en-US'); }

  function renderStats(rows, counted) {
    var stars = new Set(counted.map(function (r) { return r.tic; })).size;
    var small = counted.filter(function (r) { return r.Rp < 4; }).length;
    var valid = counted.filter(function (r) { return r.fpp < 0.015 && r.nfpp < 0.001; }).length;
    var medR = X.median(counted.map(function (r) { return r.Rp; }));
    statsEl.innerHTML =
      stat(n(counted.length), 'counted candidates (tiers A, B, N, L1 in the full-sky search; A and B in the earlier searches)') +
      stat(n(stars), 'distinct host stars (TIC IDs)') +
      stat(X.fmt(medR, 1) + ' R\u2295', 'median fitted radius') +
      stat(n(small), 'with fitted radius below 4 R\u2295') +
      stat(n(valid), 'with FPP &lt; 0.015 and NFPP &lt; 0.001 (TRICERATOPS, TESS data only; high-resolution imaging is still needed to validate)');
  }

  function renderTiers(rows) {
    var html = '<table class="simple-table"><caption>Counted candidates by tier, from the two candidate tables</caption>' +
      '<thead><tr><th scope="col">Tier</th><th scope="col" class="num">Full-sky search</th><th scope="col" class="num">Earlier searches</th><th scope="col" class="num">Total</th></tr></thead><tbody>';
    var tot = [0, 0];
    X.TIERS.filter(function (t) { return t.counted; }).forEach(function (t) {
      var a = rows.filter(function (r) { return r.tier === t.id && r.search === 'full-sky'; }).length;
      var b = rows.filter(function (r) { return r.tier === t.id && r.search === 'earlier'; }).length;
      tot[0] += a; tot[1] += b;
      html += '<tr><th scope="row">' + X.tierDot(t.id) + X.esc(t.name) + '</th><td class="num">' + a + '</td><td class="num">' + b + '</td><td class="num">' + (a + b) + '</td></tr>';
    });
    html += '<tr><th scope="row">All counted</th><td class="num"><strong>' + tot[0] + '</strong></td><td class="num"><strong>' + tot[1] + '</strong></td><td class="num"><strong>' + (tot[0] + tot[1]) + '</strong></td></tr>';
    tierEl.innerHTML = html + '</tbody></table>';
  }

  /* ---------- Period-radius scatter (inline SVG) ---------- */
  var SVGNS = 'http://www.w3.org/2000/svg';
  function marker(tier, x, y) {
    var d;
    if (tier === 'A') return '<circle class="pt A" cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="4"';
    if (tier === 'B') return '<rect class="pt B" x="' + (x - 3.4).toFixed(1) + '" y="' + (y - 3.4).toFixed(1) + '" width="6.8" height="6.8"';
    if (tier === 'N') {
      d = 'M' + x.toFixed(1) + ' ' + (y - 4.6).toFixed(1) + 'L' + (x + 4.2).toFixed(1) + ' ' + (y + 3.2).toFixed(1) + 'L' + (x - 4.2).toFixed(1) + ' ' + (y + 3.2).toFixed(1) + 'Z';
      return '<path class="pt N" d="' + d + '"';
    }
    d = 'M' + x.toFixed(1) + ' ' + (y - 5).toFixed(1) + 'L' + (x + 4.6).toFixed(1) + ' ' + y.toFixed(1) + 'L' + x.toFixed(1) + ' ' + (y + 5).toFixed(1) + 'L' + (x - 4.6).toFixed(1) + ' ' + y.toFixed(1) + 'Z';
    return '<path class="pt L1" d="' + d + '"';
  }

  function drawPlot(counted) {
    var pts = counted.filter(function (r) { return r.P > 0 && r.Rp > 0; });
    var W = Math.max(320, Math.min(plotEl.clientWidth || 880, 960));
    var H = Math.round(Math.max(300, Math.min(W * 0.62, 560)));
    var m = { l: 46, r: 12, t: 10, b: 42 };
    var pmin = Math.min.apply(null, pts.map(function (r) { return r.P; }));
    var pmax = Math.max.apply(null, pts.map(function (r) { return r.P; }));
    var rmin = Math.min.apply(null, pts.map(function (r) { return r.Rp; }));
    var rmax = Math.max.apply(null, pts.map(function (r) { return r.Rp; }));
    var x0 = Math.log10(pmin / 1.2), x1 = Math.log10(pmax * 1.2);
    var y0 = Math.log10(rmin / 1.15), y1 = Math.log10(rmax * 1.15);
    function sx(p) { return m.l + (Math.log10(p) - x0) / (x1 - x0) * (W - m.l - m.r); }
    function sy(r) { return H - m.b - (Math.log10(r) - y0) / (y1 - y0) * (H - m.t - m.b); }
    var xt = [0.3, 0.5, 1, 2, 3, 5, 10, 20, 30, 50, 100, 200].filter(function (v) { return v >= Math.pow(10, x0) && v <= Math.pow(10, x1); });
    var yt = [0.5, 0.7, 1, 1.5, 2, 3, 4, 5, 7, 10, 15, 20, 30].filter(function (v) { return v >= Math.pow(10, y0) && v <= Math.pow(10, y1); });
    var s = '<svg class="plot" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-labelledby="plot-title plot-desc">';
    s += '<title id="plot-title">Orbital period against fitted radius of the counted candidates</title>';
    s += '<desc id="plot-desc">Scatter plot, both axes logarithmic. ' + pts.length + ' counted candidates, marked by tier. The same values are in the candidates table.</desc>';
    xt.forEach(function (v) {
      var x = sx(v).toFixed(1);
      s += '<line class="grid" x1="' + x + '" x2="' + x + '" y1="' + m.t + '" y2="' + (H - m.b) + '"/><text x="' + x + '" y="' + (H - m.b + 16) + '" text-anchor="middle">' + v + '</text>';
    });
    yt.forEach(function (v) {
      var y = sy(v).toFixed(1);
      s += '<line class="grid" x1="' + m.l + '" x2="' + (W - m.r) + '" y1="' + y + '" y2="' + y + '"/><text x="' + (m.l - 6) + '" y="' + (+y + 4) + '" text-anchor="end">' + v + '</text>';
    });
    s += '<line class="axis" x1="' + m.l + '" x2="' + (W - m.r) + '" y1="' + (H - m.b) + '" y2="' + (H - m.b) + '"/>';
    s += '<line class="axis" x1="' + m.l + '" x2="' + m.l + '" y1="' + m.t + '" y2="' + (H - m.b) + '"/>';
    s += '<text x="' + ((m.l + W - m.r) / 2) + '" y="' + (H - 6) + '" text-anchor="middle">Orbital period (days, log scale)</text>';
    s += '<text transform="translate(12 ' + ((m.t + H - m.b) / 2) + ') rotate(-90)" text-anchor="middle">Fitted radius (Earth radii, log scale)</text>';
    s += '<g id="pts">';
    ['B', 'N', 'L1', 'A'].forEach(function (tier) {
      pts.forEach(function (r, i) {
        if (r.tier !== tier) return;
        s += marker(tier, sx(r.P), sy(r.Rp)) + ' data-i="' + i + '"/>';
      });
    });
    s += '</g></svg>';
    plotEl.innerHTML = s;
    var tip = document.getElementById('tip');
    var info = document.getElementById('plot-selected');
    function text(r) { return 'TIC ' + r.tic + ' (tier ' + r.tier + '): P = ' + r.P + ' d, R = ' + X.fmt(r.Rp, 2) + ' R⊕'; }
    var g = plotEl.querySelector('#pts');
    g.addEventListener('mouseover', function (e) {
      var t = e.target.closest && e.target.closest('[data-i]'); if (!t) return;
      tip.textContent = text(pts[+t.getAttribute('data-i')]); tip.style.display = 'block';
    });
    g.addEventListener('mousemove', function (e) { tip.style.left = Math.min(e.clientX + 12, window.innerWidth - 260) + 'px'; tip.style.top = (e.clientY + 14) + 'px'; });
    g.addEventListener('mouseout', function () { tip.style.display = 'none'; });
    g.addEventListener('click', function (e) {
      var t = e.target.closest && e.target.closest('[data-i]'); if (!t) return;
      var r = pts[+t.getAttribute('data-i')];
      info.innerHTML = X.esc(text(r)) + '. <a href="candidates.html?q=' + encodeURIComponent(r.tic) + '">Show in the candidates table</a> · <a href="' + X.GH.exofop(r.tic) + '">ExoFOP</a>';
    });
  }

  function renderLegend() {
    var h = '';
    X.TIERS.filter(function (t) { return t.counted; }).forEach(function (t) { h += '<span>' + X.tierDot(t.id) + X.esc(t.name) + '</span>'; });
    document.getElementById('plot-legend').innerHTML = h;
  }

  X.fillBuildInfo();
  X.loadCandidates().then(function (rows) {
    var counted = rows.filter(function (r) { return COUNTED.indexOf(r.tier) >= 0; });
    renderStats(rows, counted);
    renderTiers(rows);
    renderLegend();
    drawPlot(counted);
    var t; window.addEventListener('resize', function () { clearTimeout(t); t = setTimeout(function () { drawPlot(counted); }, 150); });
  }).catch(function (err) { X.showError(statsEl, err); });
})();
