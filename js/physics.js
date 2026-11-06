/**
 * physics.js — физическая модель и численный метод
 */

const Physics = (() => {
  'use strict';

  /** Ускорение в точке (x, y): a = (-K*r) / (r^(n+1)) */
  function acceleration(x, y, K, n) {
    const r = Math.hypot(x, y);
    const f = -K / Math.pow(r, n + 1);
    return [f * x, f * y];
  }

  /** Правая часть системы дифференциального ур-я */
  function derivatives(s, K, n) {
    const a = acceleration(s[0], s[1], K, n);
    return [s[2], s[3], a[0], a[1]];
  }

  function addScaled(s, k, h) {
    return [s[0] + h * k[0], s[1] + h * k[1], s[2] + h * k[2], s[3] + h * k[3]];
  }

  /** Один шаг длиной h -- решаем методом Рунге — Кутты 4-го порядка */
  function rk4Step(s, h, K, n) {
    const k1 = derivatives(s, K, n);
    const k2 = derivatives(addScaled(s, k1, h / 2), K, n);
    const k3 = derivatives(addScaled(s, k2, h / 2), K, n);
    const k4 = derivatives(addScaled(s, k3, h), K, n);
    const out = new Array(4);
    for (let i = 0; i < 4; i++) {
      out[i] = s[i] + (h / 6) * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]);
    }
    return out;
  }

  /**
   * Рекомендуемый шаг: доля eta от характерных времён r/v и (r/a)**0.5
   * eta — параметр точности
   */
  function suggestedStep(s, K, n, eta) {
    const r = Math.hypot(s[0], s[1]);
    const v = Math.hypot(s[2], s[3]) || 1e-12;
    const a = Math.abs(K) / Math.pow(r, n) || 1e-12;
    return eta * Math.min(r / v, Math.sqrt(r / a));
  }

  /**
   * Сдвинуть частицу вперёд на время T
   * p = { K, n, eta, rCapture }
   */
  function advance(s, T, p) {
    let t = 0;
    let state = s;
    let steps = 0;
    while (t < T) {
      const h = Math.min(suggestedStep(state, p.K, p.n, p.eta), T - t);
      state = rk4Step(state, h, p.K, p.n);
      t += h;
      steps++;
      if (Math.hypot(state[0], state[1]) < p.rCapture) {
        return { state, captured: true, steps };
      }
      if (steps > 2e5) break;
    }
    return { state, captured: false, steps };
  }

  /** Потенциальная энергия U(r), U(∞) = 0 при n > 1 */
  function potential(r, K, n) {
    if (Math.abs(n - 1) < 1e-12) return K * Math.log(r);
    return -K / ((n - 1) * Math.pow(r, n - 1));
  }

  /** Полная энергия E = (v^2)/2 + U(r) (сохраняется) */
  function energy(s, K, n) {
    return 0.5 * (s[2] * s[2] + s[3] * s[3]) + potential(Math.hypot(s[0], s[1]), K, n);
  }

  /** Момент импульса L = x*vy − y*vx (сохраняется) */
  function angularMomentum(s) {
    return s[0] * s[3] - s[1] * s[2];
  }

  /**
   * Численный угол отклонения частицы с прицельным расстоянием b
   */
  function deflection(b, v0, K, n, opts = {}) {
    const eta = opts.eta ?? 0.004;
    const rCapture = opts.rCapture ?? 1e-3;
    let R = opts.R;
    if (!R) {
      if (n > 1) {
        R = Math.pow(Math.max(K, 1e-12) / (v0 * v0 * 1e-7), 1 / (n - 1));
        R = Math.min(Math.max(R, 50 * b, 1e3), 1e8);
      } else {
        R = Math.max(1e4, 50 * b);
      }
    }

    let vStart = v0;
    let y0 = b;
    if (n > 1) {
      const U = potential(R, K, n);
      vStart = Math.sqrt(v0 * v0 - 2 * U);
      y0 = (b * v0) / vStart;
    }
    let s = [-Math.sqrt(R * R - y0 * y0), y0, vStart, 0];
    const E0 = energy(s, K, n);

    let rotation = 0;
    let prevAng = Math.atan2(s[3], s[2]);
    let rmin = Infinity;
    let steps = 0;
    const maxSteps = opts.maxSteps ?? 2e6;

    while (true) {
      const h = suggestedStep(s, K, n, eta);
      s = rk4Step(s, h, K, n);
      steps++;
      const r = Math.hypot(s[0], s[1]);
      if (r < rmin) rmin = r;

      const ang = Math.atan2(s[3], s[2]);
      let d = ang - prevAng;
      if (d > Math.PI) d -= 2 * Math.PI;
      if (d < -Math.PI) d += 2 * Math.PI;
      rotation += d;
      prevAng = ang;

      if (r < rCapture) {
        return { captured: true, theta: NaN, thetaVisible: NaN, rmin, steps };
      }
      if (r > R && s[0] * s[2] + s[1] * s[3] > 0) break;
      if (steps > maxSteps) {
        return { captured: false, timeout: true, theta: NaN, thetaVisible: NaN, rmin, steps };
      }
    }

    const E1 = energy(s, K, n);
    return {
      captured: false,
      theta: Math.abs(rotation),
      thetaVisible: Math.abs(Math.atan2(s[3], s[2])),
      vxOut: s[2],
      vyOut: s[3],
      rmin,
      steps,
      R,
      energyError: Math.abs((E1 - E0) / (Math.abs(E0) || 1)),
    };
  }

  return {
    acceleration,
    derivatives,
    rk4Step,
    suggestedStep,
    advance,
    potential,
    energy,
    angularMomentum,
    deflection,
  };
})();

if (typeof module !== 'undefined') module.exports = Physics;