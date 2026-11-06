/**
 * theory.js — теоретические формулы для сравнения с численным расчётом
 */
const Theory = (() => {
  'use strict';

  function rutherford(b, v0, K) {
    return 2 * Math.atan(K / (b * v0 * v0));
  }

  function inverseCube(b, v0, K) {
    const a = K / (v0 * v0 * b * b);
    return a < 1 ? Math.PI * (1 / Math.sqrt(1 - a) - 1) : NaN; // α ≥ 1 → падение на центр
  }

  /** ln Γ(z) — приближение Ланцоша */
  function lnGamma(z) {
    const c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028,
      771.32342877765313, -176.61502916214059, 12.507343278686905,
      -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
    if (z < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * z)) - lnGamma(1 - z);
    z -= 1;
    let x = c[0];
    for (let i = 1; i < 9; i++) x += c[i] / (z + i);
    const t = z + 7.5;
    return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x);
  }

  function smallAngle(b, v0, K, n) {
    return (K * Math.sqrt(Math.PI) * Math.exp(lnGamma(n / 2) - lnGamma((n + 1) / 2))) /
      (v0 * v0 * Math.pow(b, n));
  }

  /** Первый положительный корень при g(u) = 0 */
  function turningPoint(g) {
    let a = 0;
    let u = 1e-4;
    while (u < 1e7) {
      if (g(u) <= 0) {
        let lo = a, hi = u;
        for (let i = 0; i < 200; i++) {
          const m = (lo + hi) / 2;
          if (g(m) > 0) lo = m; else hi = m;
        }
        return lo;
      }
      a = u;
      u *= 1.01;
    }
    return NaN; // корня нет -- частица падает на центр
  }

  /** Точный угол для произвольного n > 1 (притяжение K >= 0) */
  function general(b, v0, K, n, N = 8000) {
    if (n <= 1) {
      return { theta: NaN, reason: 'при n ≤ 1 потенциал не стремится к нулю на бесконечности' };
    }
    const beta = (2 * K) / ((n - 1) * v0 * v0 * Math.pow(b, n - 1));
    const g = (u) => {
      u = Math.max(u, 0);
      return 1 - u * u + beta * Math.pow(u, n - 1);
    };
    const u0 = turningPoint(g);
    if (!Number.isFinite(u0)) return { theta: NaN, captured: true };
    const dg = -2 * u0 + beta * (n - 1) * Math.pow(u0, n - 2);
    if (dg >= 0) return { theta: Infinity, orbiting: true, rmin: b / u0 };

    const W = Math.sqrt(u0);
    const f = (w) => (w === 0 ? 2 / Math.sqrt(-dg) : (2 * w) / Math.sqrt(Math.max(g(u0 - w * w), 1e-300)));
    const h = W / N;
    let sum = f(0) + f(W);
    for (let i = 1; i < N; i++) sum += (i % 2 ? 4 : 2) * f(i * h);
    const I = (sum * h) / 3;
    return { theta: 2 * I - Math.PI, rmin: b / u0 };
  }

  /** Выбор подходящей формулы для текущего n */
  function angle(b, v0, K, n) {
    if (Math.abs(n - 2) < 1e-9) {
      return { theta: rutherford(b, v0, K), method: 'θ = 2 * arctg(K / (b·v₀²))' };
    }
    if (Math.abs(n - 3) < 1e-9) {
      const t = inverseCube(b, v0, K);
      return { theta: t, captured: Number.isNaN(t), method: 'θ = π * (1/√(1−α) − 1), α = K/(v₀²b²)' };
    }
    const r = general(b, v0, K, n);
    r.method = 'θ = 2∫₀^{u₀} du/√(1 − u² + βu^{n−1}) − π';
    return r;
  }

  /** Теоретическое фокусное расстояние (только для n = 2) */
  function focalDistance(b, v0, K, n) {
    if (Math.abs(n - 2) > 1e-9 || K <= 0) return NaN;
    return (b * b * v0 * v0) / (2 * K);
  }

  return { rutherford, inverseCube, smallAngle, general, angle, focalDistance, lnGamma };
})();

if (typeof module !== 'undefined') module.exports = Theory;