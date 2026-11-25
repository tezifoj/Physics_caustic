/**
 * charts.js — линейные графики на canvas
 */
const Charts = (() => {
  'use strict';

  function cssVar(name, fallback) {
    const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return v || fallback;
  }

  function setup(canvas) {
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const w = Math.max(rect.width, 200);
    const h = Math.max(rect.height, 160);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx, w, h };
  }

  function niceStep(range, count) {
    const raw = range / count;
    const p = Math.pow(10, Math.floor(Math.log10(raw)));
    const f = raw / p;
    return (f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10) * p;
  }

  function fmtTick(v, step, log) {
    if (log) return '1e' + Math.round(v);
    const d = Math.max(0, -Math.floor(Math.log10(step)));
    return v.toFixed(Math.min(d, 6)).replace('.', ',');
  }

  function line(canvas, cfg) {
    const { ctx, w, h } = setup(canvas);
    const text = cssVar('--text', '#222');
    const muted = cssVar('--muted', '#777');
    const grid = cssVar('--chart-grid', '#eee');
    ctx.clearRect(0, 0, w, h);
    ctx.font = '12px system-ui, sans-serif';

    const tx = (x) => (cfg.xLog ? Math.log10(x) : x);
    const ty = (y) => (cfg.yLog ? Math.log10(y) : y);
    const series = (cfg.series || []).map((s) => ({
      ...s,
      pts: s.points
        .map(([x, y]) => [tx(x), ty(y)])
        .map(([x, y]) => [Number.isFinite(x) ? x : NaN, Number.isFinite(y) ? y : NaN]),
    }));

    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const s of series) for (const [x, y] of s.pts) {
      if (Number.isNaN(x) || Number.isNaN(y)) continue;
      x0 = Math.min(x0, x); x1 = Math.max(x1, x);
      y0 = Math.min(y0, y); y1 = Math.max(y1, y);
    }
    if (!Number.isFinite(x0)) {
      ctx.fillStyle = muted;
      ctx.textAlign = 'center';
      ctx.fillText('Нет данных', w / 2, h / 2);
      return;
    }
    if (cfg.yZero && !cfg.yLog) { y0 = Math.min(y0, 0); y1 = Math.max(y1, 0); }
    if (x1 === x0) { x0 -= 1; x1 += 1; }
    if (y1 === y0) { y0 -= 1; y1 += 1; }
    const padY = (y1 - y0) * 0.08;
    y0 -= padY; y1 += padY;

    const m = { l: 58, r: 14, t: 28, b: 40 };
    const pw = w - m.l - m.r;
    const ph = h - m.t - m.b;
    const sx = (x) => m.l + ((x - x0) / (x1 - x0)) * pw;
    const sy = (y) => m.t + ph - ((y - y0) / (y1 - y0)) * ph;

    // сетка и подписи
    ctx.strokeStyle = grid;
    ctx.fillStyle = muted;
    ctx.lineWidth = 1;
    const xs = cfg.xLog ? 1 : niceStep(x1 - x0, 6);
    const ys = cfg.yLog ? 1 : niceStep(y1 - y0, 5);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    for (let v = Math.ceil(x0 / xs) * xs; v <= x1 + 1e-9; v += xs) {
      ctx.beginPath(); ctx.moveTo(sx(v), m.t); ctx.lineTo(sx(v), m.t + ph); ctx.stroke();
      ctx.fillText(fmtTick(v, xs, cfg.xLog), sx(v), m.t + ph + 6);
    }
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (let v = Math.ceil(y0 / ys) * ys; v <= y1 + 1e-9; v += ys) {
      ctx.beginPath(); ctx.moveTo(m.l, sy(v)); ctx.lineTo(m.l + pw, sy(v)); ctx.stroke();
      ctx.fillText(fmtTick(v, ys, cfg.yLog), m.l - 6, sy(v));
    }
    ctx.strokeStyle = muted;
    ctx.strokeRect(m.l, m.t, pw, ph);

    // подписи осей
    ctx.fillStyle = text;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    if (cfg.xLabel) ctx.fillText(cfg.xLabel, m.l + pw / 2, h - 4);
    if (cfg.yLabel) {
      ctx.save();
      ctx.translate(13, m.t + ph / 2);
      ctx.rotate(-Math.PI / 2);
      ctx.textBaseline = 'middle';
      ctx.fillText(cfg.yLabel, 0, 0);
      ctx.restore();
    }

    // серии
    ctx.save();
    ctx.beginPath();
    ctx.rect(m.l, m.t, pw, ph);
    ctx.clip();
    for (const s of series) {
      ctx.strokeStyle = s.color;
      ctx.fillStyle = s.color;
      ctx.lineWidth = s.width || 2;
      ctx.setLineDash(s.dash || []);
      if (s.line !== false) {
        ctx.beginPath();
        let pen = false;
        for (const [x, y] of s.pts) {
          if (Number.isNaN(x) || Number.isNaN(y)) { pen = false; continue; }
          if (!pen) { ctx.moveTo(sx(x), sy(y)); pen = true; } else ctx.lineTo(sx(x), sy(y));
        }
        ctx.stroke();
      }
      ctx.setLineDash([]);
      if (s.markers) {
        for (const [x, y] of s.pts) {
          if (Number.isNaN(x) || Number.isNaN(y)) continue;
          ctx.beginPath();
          ctx.arc(sx(x), sy(y), s.markerSize || 3, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
    ctx.restore();

    // легенда
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    let lx = m.l;
    for (const s of series) {
      if (!s.name) continue;
      ctx.strokeStyle = s.color;
      ctx.fillStyle = s.color;
      ctx.lineWidth = 2;
      ctx.setLineDash(s.dash || []);
      ctx.beginPath(); ctx.moveTo(lx, 12); ctx.lineTo(lx + 18, 12); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = text;
      ctx.fillText(s.name, lx + 23, 12);
      lx += 23 + ctx.measureText(s.name).width + 18;
    }
  }

  return { line };
})();