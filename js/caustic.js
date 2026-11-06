/**
 * caustic.js - анализ фокусировки и каустики
 */

const Caustic = (() => {
  'use strict';

  function envelopePoints(sim) {
    const { rays, dt } = sim;
    const pts = [];
    for (let i = 0; i < rays.length - 1; i++) {
      const A = rays[i];
      const B = rays[i + 1];
      if (A.b * B.b < 0) continue;
      const db = B.b - A.b;
      const len = Math.min(A.len, B.len) - 1;
      let prevJ = null;
      let prevX = 0;
      let prevY = 0;
      for (let k = 1; k < len; k++) {
        const xm = (A.xs[k] + B.xs[k]) / 2;
        const ym = (A.ys[k] + B.ys[k]) / 2;
        const xt = (A.xs[k + 1] - A.xs[k - 1] + B.xs[k + 1] - B.xs[k - 1]) / (4 * dt);
        const yt = (A.ys[k + 1] - A.ys[k - 1] + B.ys[k + 1] - B.ys[k - 1]) / (4 * dt);
        const xb = (B.xs[k] - A.xs[k]) / db;
        const yb = (B.ys[k] - A.ys[k]) / db;
        const J = xt * yb - yt * xb;
        if (prevJ !== null && prevJ * J < 0) {
          const f = prevJ / (prevJ - J);
          pts.push({
            x: prevX + f * (xm - prevX),
            y: prevY + f * (ym - prevY),
            b: (A.b + B.b) / 2,
            t: (k - 1 + f) * dt,
          });
        }
        prevJ = J;
        prevX = xm;
        prevY = ym;
      }
    }
    return pts;
  }

  function focalPoints(sim) {
    const pts = [];
    for (const ray of sim.rays) {
      let order = 0;
      for (let k = 1; k < ray.len; k++) {
        const y0 = ray.ys[k - 1];
        const y1 = ray.ys[k];
        if (y0 * y1 < 0) {
          const f = y0 / (y0 - y1);
          pts.push({
            x: ray.xs[k - 1] + f * (ray.xs[k] - ray.xs[k - 1]),
            y: 0,
            b: ray.b,
            t: (k - 1 + f) * sim.dt,
            order: order++,
          });
        }
      }
    }
    return pts;
  }

  function densityGrid(sim, nx = 240, ny = 160) {
    const { x0, x1, y0, y1 } = sim.bounds;
    const cw = (x1 - x0) / nx;
    const ch = (y1 - y0) / ny;
    const grid = new Float32Array(nx * ny);
    const stamp = new Int32Array(nx * ny).fill(-1);
    sim.rays.forEach((ray, ri) => {
      for (let k = 0; k < ray.len - 1; k++) {
        const ax = ray.xs[k], ay = ray.ys[k];
        const dx = ray.xs[k + 1] - ax, dy = ray.ys[k + 1] - ay;
        const m = Math.ceil(Math.max(Math.abs(dx) / cw, Math.abs(dy) / ch)) + 1;
        for (let j = 0; j <= m; j++) {
          const x = ax + (dx * j) / m;
          const y = ay + (dy * j) / m;
          const ix = Math.floor((x - x0) / cw);
          const iy = Math.floor((y - y0) / ch);
          if (ix < 0 || iy < 0 || ix >= nx || iy >= ny) continue;
          const c = iy * nx + ix;
          if (stamp[c] !== ri) { stamp[c] = ri; grid[c]++; }
        }
      }
    });
    let max = 0;
    let maxIdx = 0;
    for (let i = 0; i < grid.length; i++) if (grid[i] > max) { max = grid[i]; maxIdx = i; }
    return {
      grid, nx, ny, max,
      bounds: sim.bounds,
      maxAt: { x: x0 + ((maxIdx % nx) + 0.5) * cw, y: y0 + (Math.floor(maxIdx / nx) + 0.5) * ch },
    };
  }

  function profileAlongX(sim, xFrom, xTo, M = 240) {
    const p = sim.params;
    const dx = (xTo - xFrom) / (M - 1);
    const X = Array.from({ length: M }, (_, j) => xFrom + j * dx);
    const Y = sim.rays.map(() => new Float64Array(M).fill(NaN));

    sim.rays.forEach((ray, i) => {
      for (let k = 0; k < ray.len - 1; k++) {
        const xa = ray.xs[k], xb = ray.xs[k + 1];
        if (xb <= xa) continue;
        const j0 = Math.max(0, Math.ceil((xa - xFrom) / dx));
        const j1 = Math.min(M - 1, Math.floor((xb - xFrom) / dx));
        for (let j = j0; j <= j1; j++) {
          if (!Number.isNaN(Y[i][j])) continue;
          const f = (X[j] - xa) / (xb - xa);
          Y[i][j] = ray.ys[k] + f * (ray.ys[k + 1] - ray.ys[k]);
        }
      }
    });

    const width0 = p.symmetric ? 2 * p.bMax : Math.max(p.bMax - p.bMin, 1e-9);
    const w = Math.max(0.05 * Math.max(p.bMax, 1e-9), 1.5 * sim.db);
    const expected = (sim.rays.length * 2 * w) / width0;

    const width = [], axisDensityRaw = [], minGapRatio = [], count = [];
    for (let j = 0; j < M; j++) {
      let nAxis = 0, n = 0, minGap = Infinity;
      const col = [];
      for (let i = 0; i < sim.rays.length; i++) {
        const y = Y[i][j];
        if (Number.isNaN(y)) continue;
        n++;
        col.push(y);
        if (Math.abs(y) < w) nAxis++;
        if (i + 1 < sim.rays.length && sim.rays[i].b * sim.rays[i + 1].b > 0) {
          const y2 = Y[i + 1][j];
          if (!Number.isNaN(y2)) minGap = Math.min(minGap, Math.abs(y2 - y));
        }
      }
      count.push(n);
      // ширина пучка по квантилям от 10 до 90%
      if (n > 4) {
        col.sort((a, b) => a - b);
        const q = (t) => col[Math.min(n - 1, Math.max(0, Math.round(t * (n - 1))))];
        width.push((q(0.9) - q(0.1)) / (0.8 * width0));
      } else width.push(NaN);
      axisDensityRaw.push(n > 0 ? nAxis / expected : NaN);
      minGapRatio.push(Number.isFinite(minGap) ? minGap / sim.db : NaN);
    }
    // сглаживание скользящим средним
    const R = Math.max(2, Math.round(M / 40));
    const axisDensity = axisDensityRaw.map((_, j) => {
      let s = 0, c = 0;
      for (let k = j - R; k <= j + R; k++) {
        if (k >= 0 && k < M && Number.isFinite(axisDensityRaw[k])) { s += axisDensityRaw[k]; c++; }
      }
      return c ? s / c : NaN;
    });
    return { X, width, axisDensity, minGapRatio, count, axisHalfWidth: w };
  }

  function argExtreme(xs, ys, cmp) {
    let best = NaN, at = NaN;
    for (let i = 0; i < ys.length; i++) {
      if (!Number.isFinite(ys[i])) continue;
      if (Number.isNaN(best) || cmp(ys[i], best)) { best = ys[i]; at = xs[i]; }
    }
    return { value: best, x: at };
  }

  /** Полный анализ пучка */
  function analyze(sim) {
    const p = sim.params;
    const envelope = envelopePoints(sim);
    const focal = focalPoints(sim);
    const density = densityGrid(sim);
    const profile = profileAlongX(sim, 0.05 * p.xMax, p.xMax);

    const firstFocal = focal.filter((f) => f.order === 0);
    const fx = firstFocal.map((f) => f.x);
    const captured = sim.rays.filter((r) => r.captured).length;

    return {
      envelope,
      focal,
      density,
      profile,
      stats: {
        captured,
        escaped: sim.rays.filter((r) => r.escaped).length,
        focalCount: firstFocal.length,
        focalXmin: fx.length ? Math.min(...fx) : NaN,
        focalXmax: fx.length ? Math.max(...fx) : NaN,
        envelopeCount: envelope.length,
        axisPeak: argExtreme(profile.X, profile.axisDensity, (a, b) => a > b),
        minGap: argExtreme(profile.X, profile.minGapRatio, (a, b) => a < b),
        minWidth: argExtreme(profile.X, profile.width, (a, b) => a < b),
      },
    };
  }

  return { envelopePoints, focalPoints, densityGrid, profileAlongX, analyze };
})();

if (typeof module !== 'undefined') module.exports = Caustic;
