/**
 * render.js — отрисовка сцены: центр притяжения, траектории, частицы,
 * карта плотности, точки каустики и фокальные точки
 *
 * Масштаб меняется колесом мыши, перемещение - перетаскивание
 */
class SceneRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.view = {
    cx: 0,
    cy: 0,
    scale: 30};
    this.heat = document.createElement('canvas');
    this.heatBounds = null;
    this.onChange = null;
    this.onFitRequest = null;
    this.mouseWorld = null;
    this._bind();
    this.resize();
  }

  resize() {
    const dpr = window.devicePixelRatio || 1;
    const rect = this.canvas.getBoundingClientRect();
    this.w = Math.max(rect.width, 100);
    this.h = Math.max(rect.height, 100);
    this.canvas.width = Math.round(this.w * dpr);
    this.canvas.height = Math.round(this.h * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  fit(b) {
    const sx = this.w / (b.x1 - b.x0);
    const sy = this.h / (b.y1 - b.y0);
    this.view.scale = 0.94 * Math.min(sx, sy);
    this.view.cx = (b.x0 + b.x1) / 2;
    this.view.cy = (b.y0 + b.y1) / 2;
  }

  zoom(factor, sx = this.w / 2, sy = this.h / 2) {
    const [wx, wy] = this.toWorld(sx, sy);
    this.view.scale = Math.min(Math.max(this.view.scale * factor, 0.5), 1e5);
    const [nx, ny] = this.toWorld(sx, sy);
    this.view.cx += wx - nx;
    this.view.cy += wy - ny;
  }

  toScreen(x, y) {
    return [this.w / 2 + (x - this.view.cx) * this.view.scale, this.h / 2 - (y - this.view.cy) * this.view.scale];
  }

  toWorld(sx, sy) {
    return [this.view.cx + (sx - this.w / 2) / this.view.scale, this.view.cy - (sy - this.h / 2) / this.view.scale];
  }

  _bind() {
    const c = this.canvas;
    let drag = null;
    c.addEventListener('wheel', (e) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const r = c.getBoundingClientRect();
      this.zoom(Math.exp(-e.deltaY * 0.0015), e.clientX - r.left, e.clientY - r.top);
      this.onChange && this.onChange();
    }, { passive: false });
    c.addEventListener('pointerdown', (e) => {
      drag = { x: e.clientX, y: e.clientY, cx: this.view.cx, cy: this.view.cy };
      c.setPointerCapture(e.pointerId);
      c.classList.add('dragging');
    });
    c.addEventListener('pointermove', (e) => {
      const r = c.getBoundingClientRect();
      this.mouseWorld = this.toWorld(e.clientX - r.left, e.clientY - r.top);
      if (drag) {
        this.view.cx = drag.cx - (e.clientX - drag.x) / this.view.scale;
        this.view.cy = drag.cy + (e.clientY - drag.y) / this.view.scale;
      }
      this.onChange && this.onChange();
    });
    const end = () => { drag = null; c.classList.remove('dragging'); };
    c.addEventListener('pointerup', end);
    c.addEventListener('pointercancel', end);
    c.addEventListener('pointerleave', () => { this.mouseWorld = null; this.onChange && this.onChange(); });
    c.addEventListener('dblclick', () => this.onFitRequest && this.onFitRequest());
  }

  setDensity(d) {
    this.heat.width = d.nx;
    this.heat.height = d.ny;
    const hctx = this.heat.getContext('2d');
    const img = hctx.createImageData(d.nx, d.ny);
    const stops = [
      [0.0, 0, 0, 0, 0],
      [0.25, 60, 30, 140, 90],
      [0.5, 190, 50, 110, 150],
      [0.75, 250, 140, 50, 200],
      [1.0, 255, 245, 190, 240],
    ];
    const lmax = Math.log1p(d.max || 1);
    for (let iy = 0; iy < d.ny; iy++) {
      for (let ix = 0; ix < d.nx; ix++) {
        const v = d.grid[iy * d.nx + ix];
        const t = v > 0 ? Math.log1p(v) / lmax : 0;
        let k = 1;
        while (k < stops.length - 1 && stops[k][0] < t) k++;
        const a = stops[k - 1], b = stops[k];
        const f = (t - a[0]) / (b[0] - a[0] || 1);
        const o = ((d.ny - 1 - iy) * d.nx + ix) * 4; // ось y вверх
        img.data[o] = a[1] + f * (b[1] - a[1]);
        img.data[o + 1] = a[2] + f * (b[2] - a[2]);
        img.data[o + 2] = a[3] + f * (b[3] - a[3]);
        img.data[o + 3] = a[4] + f * (b[4] - a[4]);
      }
    }
    hctx.putImageData(img, 0, 0);
    this.heatBounds = d.bounds;
  }

  _gridStep() {
    const target = 80 / this.view.scale; // 80 px между линиями
    const p = Math.pow(10, Math.floor(Math.log10(target)));
    const f = target / p;
    return (f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10) * p;
  }

  _drawGrid(colors) {
    const ctx = this.ctx;
    const step = this._gridStep();
    const [x0, y1] = this.toWorld(0, 0);
    const [x1, y0] = this.toWorld(this.w, this.h);
    ctx.lineWidth = 1;
    ctx.strokeStyle = colors.grid;
    ctx.beginPath();
    for (let x = Math.ceil(x0 / step) * step; x <= x1; x += step) {
      const [sx] = this.toScreen(x, 0);
      ctx.moveTo(sx, 0); ctx.lineTo(sx, this.h);
    }
    for (let y = Math.ceil(y0 / step) * step; y <= y1; y += step) {
      const [, sy] = this.toScreen(0, y);
      ctx.moveTo(0, sy); ctx.lineTo(this.w, sy);
    }
    ctx.stroke();

    ctx.strokeStyle = colors.axis;
    ctx.beginPath();
    const [ax, ay] = this.toScreen(0, 0);
    ctx.moveTo(0, ay); ctx.lineTo(this.w, ay);
    ctx.moveTo(ax, 0); ctx.lineTo(ax, this.h);
    ctx.stroke();

    ctx.fillStyle = colors.text;
    ctx.font = '11px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    const d = Math.max(0, -Math.floor(Math.log10(step)));
    const labelY = Math.min(Math.max(ay + 4, 4), this.h - 16);
    for (let x = Math.ceil(x0 / step) * step; x <= x1; x += step) {
      if (Math.abs(x) < step / 2) continue;
      ctx.fillText(x.toFixed(d).replace('.', ','), this.toScreen(x, 0)[0], labelY);
    }
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    const labelX = Math.min(Math.max(ax + 4, 4), this.w - 30);
    for (let y = Math.ceil(y0 / step) * step; y <= y1; y += step) {
      if (Math.abs(y) < step / 2) continue;
      ctx.fillText(y.toFixed(d).replace('.', ','), labelX, this.toScreen(0, y)[1]);
    }
  }

  draw(scene) {
    const ctx = this.ctx;
    const cs = getComputedStyle(document.documentElement);
    const colors = {
      bg: cs.getPropertyValue('--canvas-bg').trim() || '#0d1220',
      grid: cs.getPropertyValue('--canvas-grid').trim() || 'rgba(255,255,255,.06)',
      axis: cs.getPropertyValue('--canvas-axis').trim() || 'rgba(255,255,255,.25)',
      text: cs.getPropertyValue('--canvas-text').trim() || 'rgba(255,255,255,.6)',
    };
    ctx.fillStyle = colors.bg;
    ctx.fillRect(0, 0, this.w, this.h);
    this._drawGrid(colors);
    if (!scene || !scene.sim) return;

    const { sim, analysis, frame, layers } = scene;
    const p = sim.params;
    const tNow = frame * sim.dt;

    if (layers.heat && this.heatBounds) {
      const b = this.heatBounds;
      const [sx0, sy0] = this.toScreen(b.x0, b.y1);
      const [sx1, sy1] = this.toScreen(b.x1, b.y0);
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(this.heat, sx0, sy0, sx1 - sx0, sy1 - sy0);
    }

    // линия старта x = −L
    ctx.setLineDash([4, 6]);
    ctx.strokeStyle = colors.axis;
    const [lx] = this.toScreen(-p.L, 0);
    ctx.beginPath(); ctx.moveTo(lx, 0); ctx.lineTo(lx, this.h); ctx.stroke();
    ctx.setLineDash([]);

    // теоретическая фокальная линия (n = 2)
    if (layers.theory) {
      const bs = sim.bs.map(Math.abs).filter((b) => b > 0);
      const f = bs.map((b) => Theory.focalDistance(b, p.v0, p.K, p.n)).filter(Number.isFinite);
      if (f.length) {
        const [a] = this.toScreen(Math.min(...f), 0);
        const [b, y] = this.toScreen(Math.min(Math.max(...f), p.xMax), 0);
        ctx.strokeStyle = 'rgba(80, 220, 140, 0.85)';
        ctx.lineWidth = 5;
        ctx.setLineDash([10, 6]);
        ctx.beginPath(); ctx.moveTo(a, y); ctx.lineTo(b, y); ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    // траектории
    const bMax = Math.max(...sim.bs.map(Math.abs)) || 1;
    if (layers.traj) {
      ctx.lineWidth = sim.rays.length > 150 ? 0.8 : 1.3;
      ctx.globalAlpha = sim.rays.length > 150 ? 0.55 : 0.8;
      for (const ray of sim.rays) {
        const last = Math.min(frame, ray.len - 1);
        if (last < 1) continue;
        const hue = 200 - 160 * (Math.abs(ray.b) / bMax);
        ctx.strokeStyle = `hsl(${hue}, 85%, ${ray.b > 0 ? 62 : 52}%)`;
        ctx.beginPath();
        let [px, py] = this.toScreen(ray.xs[0], ray.ys[0]);
        ctx.moveTo(px, py);
        for (let k = 1; k <= last; k++) {
          const [sx, sy] = this.toScreen(ray.xs[k], ray.ys[k]);
          if (Math.abs(sx - px) + Math.abs(sy - py) < 0.8 && k !== last) continue;
          ctx.lineTo(sx, sy);
          px = sx; py = sy;
        }
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }

    // пересечение оси
    if (layers.focal && analysis) {
      ctx.strokeStyle = '#ff5a5a';
      ctx.lineWidth = 1.5;
      for (const f of analysis.focal) {
        if (f.t > tNow) continue;
        const [sx, sy] = this.toScreen(f.x, f.y);
        ctx.beginPath();
        ctx.moveTo(sx - 4, sy - 4); ctx.lineTo(sx + 4, sy + 4);
        ctx.moveTo(sx - 4, sy + 4); ctx.lineTo(sx + 4, sy - 4);
        ctx.stroke();
      }
    }

    // точки огибающей (det J = 0)
    if (layers.caustic && analysis) {
      ctx.fillStyle = '#ffb02e';
      for (const e of analysis.envelope) {
        if (e.t > tNow) continue;
        const [sx, sy] = this.toScreen(e.x, e.y);
        ctx.beginPath(); ctx.arc(sx, sy, 2.6, 0, Math.PI * 2); ctx.fill();
      }
    }

    if (layers.particles && frame < sim.nT) {
      ctx.fillStyle = '#ffffff';
      for (const ray of sim.rays) {
        if (frame >= ray.len) continue;
        const [sx, sy] = this.toScreen(ray.xs[frame], ray.ys[frame]);
        ctx.beginPath(); ctx.arc(sx, sy, 2.2, 0, Math.PI * 2); ctx.fill();
      }
    }

    // центр притяжения,  радиус захвата
    const [cx, cy] = this.toScreen(0, 0);
    const rc = Math.max(p.rCapture * this.view.scale, 1);
    const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, 26);
    glow.addColorStop(0, p.K >= 0 ? 'rgba(255, 210, 120, 0.9)' : 'rgba(120, 180, 255, 0.9)');
    glow.addColorStop(1, 'rgba(255, 210, 120, 0)');
    ctx.fillStyle = glow;
    ctx.beginPath(); ctx.arc(cx, cy, 26, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff3d6';
    ctx.beginPath(); ctx.arc(cx, cy, 5, 0, Math.PI * 2); ctx.fill();
    if (rc > 6) {
      ctx.strokeStyle = 'rgba(255,255,255,0.5)';
      ctx.setLineDash([3, 3]);
      ctx.beginPath(); ctx.arc(cx, cy, rc, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);
    }

    // курсор
    if (this.mouseWorld) {
      const [mx, my] = this.mouseWorld;
      ctx.fillStyle = colors.text;
      ctx.font = '12px system-ui, sans-serif';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'bottom';
      ctx.fillText(`x = ${mx.toFixed(3)}   y = ${my.toFixed(3)}`.replace(/\./g, ','), this.w - 10, this.h - 8);
    }
  }
}