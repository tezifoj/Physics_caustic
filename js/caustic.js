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