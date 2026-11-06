/**
 * beam.js — моделирование пучка частиц
 *
 * Начальные условия: x(0) = −L, y(0) = b, vx(0) = v0, vy(0) = 0.
 */
const Beam = (() => {
  'use strict';

  /** Прицельные расстояния частиц пучка */
  function impactParameters(p) {
    const bs = [];
    if (p.symmetric) {
      // симметричный пучок −bMax … +bMax без частицы с b = 0
      const step = (2 * p.bMax) / p.N;
      for (let i = 0; i < p.N; i++) bs.push(-p.bMax + (i + 0.5) * step);
    } else {
      // односторонний пучок bMin … bMax
      for (let i = 0; i < p.N; i++) {
        bs.push(p.N === 1 ? (p.bMin + p.bMax) / 2 : p.bMin + ((p.bMax - p.bMin) * i) / (p.N - 1));
      }
    }
    return bs;
  }

  /** Область, за пределами которой частица считается улетевшей */
  function limits(p) {
    const yLim = Math.max(p.L, p.xMax, 2 * p.bMax) * 1.2;
    return { xMin: -1.5 * p.L, xMax: 1.05 * p.xMax, yLim };
  }

  /**
   * Расчёт всего пучка.
   * p = { N, v0, n, K, bMax, bMin, symmetric, L, xMax, rCapture, eta }
   */
  function simulate(p) {
    const bs = impactParameters(p);
    const db = bs.length > 1 ? Math.abs(bs[1] - bs[0]) : 1;
    const crossTime = (p.L + p.xMax) / p.v0;
    const dt = crossTime / 600;           // шаг сохранения координат
    const tMax = 3 * crossTime;
    const nT = Math.ceil(tMax / dt);
    const lim = limits(p);
    const physParams = { K: p.K, n: p.n, eta: p.eta, rCapture: p.rCapture };

    let totalSteps = 0;
    const rays = bs.map((b) => {
      const xs = new Float64Array(nT + 1);
      const ys = new Float64Array(nT + 1);
      let s = [-p.L, b, p.v0, 0];
      xs[0] = s[0];
      ys[0] = s[1];
      let len = 1;
      let captured = false;
      let escaped = false;

      for (let k = 1; k <= nT; k++) {
        const res = Physics.advance(s, dt, physParams);
        totalSteps += res.steps;
        s = res.state;
        xs[k] = s[0];
        ys[k] = s[1];
        len++;
        if (res.captured) { captured = true; break; }
        if (s[0] > lim.xMax || s[0] < lim.xMin || Math.abs(s[1]) > lim.yLim) { escaped = true; break; }
      }
      return {
        b, xs, ys, len, captured, escaped,
        vxEnd: s[2], vyEnd: s[3],
        angleEnd: Math.abs(Math.atan2(s[3], s[2])), // направление скорости в конце расчёта
      };
    });

    const bAbsMax = Math.max(Math.abs(p.bMax), Math.abs(p.bMin || 0));
    const Y = Math.max(bAbsMax * 1.5, 1);
    return {
      params: p,
      rays,
      bs,
      db,
      dt,
      nT,
      totalSteps,
      bounds: { x0: -p.L - 0.5, x1: p.xMax, y0: -Y, y1: Y },
    };
  }

  return { impactParameters, simulate };
})();

if (typeof module !== 'undefined') module.exports = Beam;