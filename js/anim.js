/* Animación del sistema de colas en Canvas 2D.
   Lee el estado del motor (filas, servidores, clientes) y anima a cada persona.
   Anim dibuja el plano visto desde arriba; Anim3D usa el mismo movimiento sobre el piso y lo dibuja con una cámara
   en perspectiva (mostradores en 3D, personas de pie con sombra, postes y cintas de la fila, puertas y letreros). */
(function (root) {
  'use strict';
  const QS = root.QS = root.QS || {};
  const U = QS.U;

  const PAL = {
    light: ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#4a3aa7', '#e34948'],
    dark: ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300', '#9085e9', '#e66767']
  };

  class Anim {
    constructor(canvas, opts = {}) {
      this.cv = canvas; this.ctx = canvas.getContext('2d');
      this.W = 1000; this.H = 540; this.o = opts;
      this.sp = new Map(); this.gone = []; this.flash = [];
      this.readTheme();
      this.resize();
      if (typeof ResizeObserver !== 'undefined') { this.ro = new ResizeObserver(() => { this.resize(); this.draw(); }); this.ro.observe(canvas.parentElement); }
    }
    readTheme() {
      const v = (n) => U.cssVar(n);
      const dark = U.isDark();
      this.col = { floor: v('--floor'), floorLine: v('--floor-line'), ink: v('--ink'), ink2: v('--ink-2'), muted: v('--muted'), surface: v('--surface'),
        surface2: v('--surface-2'), surface3: v('--surface-3'), line: v('--line'), line2: v('--line-2'), accent: v('--accent'), good: v('--good'), warn: v('--warn'), bad: v('--bad'),
        amber: v('--amber'), onStatus: v('--on-status') || '#fff', pal: dark ? PAL.dark : PAL.light, dark, font: v('--font-ui') || 'system-ui', mono: v('--font-mono') || 'monospace' };
    }
    resize() {
      const box = this.cv.parentElement; const w = Math.max(280, box.clientWidth);
      const h = Math.round(w * this.H / this.W); const dpr = Math.min(2.5, root.devicePixelRatio || 1);
      this.cv.style.width = w + 'px'; this.cv.style.height = h + 'px';
      this.cv.width = Math.round(w * dpr); this.cv.height = Math.round(h * dpr);
      this.k = (w / this.W) * dpr; this.cssScale = w / this.W;
    }
    attach(sim) {
      this.sim = sim; this.sp.clear(); this.gone = []; this.flash = []; this.layout();
      // estrella solo si hay clases con distinta prioridad (marca a la de mayor prioridad)
      const pr = sim ? sim.cls.map((c) => c.prio) : []; this.star = new Set(pr).size > 1; this.minPrio = pr.length ? Math.min(...pr) : 1;
    }
    destroy() { if (this.ro) this.ro.disconnect(); this.ro = null; this.sim = null; }

    /* ---------------- geometría ---------------- */
    layout() {
      const sim = this.sim; if (!sim) return;
      const S = sim.st.length, W = this.W, H = this.H;
      const finite = sim.mode === 'finite';
      const top = 58, bot = H - 38;
      const xL = finite ? 196 : 84, xR = W - 58;
      const sw = (xR - xL) / S;
      this.top = top; this.bot = bot; this.xL = xL; this.xR = xR;
      this.entr = { x: xL - 40, y: (top + bot) / 2 + (finite ? 60 : 0) };
      this.G = sim.st.map((st, s) => {
        const x0 = xL + s * sw, x1 = x0 + sw, c = st.srv.length;
        const maxRows = Math.max(1, Math.floor((bot - top) / (st.multi ? 18 : 40)));
        const cols = st.multi ? 1 : Math.ceil(c / maxRows);
        const rows = Math.ceil(c / cols);
        const rowH = (bot - top) / rows; const colW = 64;
        const scale = U.clamp(rowH / 52, 0.45, 1);
        const srv = st.srv.map((v, j) => ({ x: x1 - 34 - Math.floor(j / rows) * colW, y: top + ((j % rows) + 0.5) * rowH }));
        const qRight = x1 - 34 - (cols - 1) * colW - 66 * Math.max(scale, 0.7);
        const qLeft = x0 + 16;
        const g = { s, x0, x1, srv, scale, rows, cols, rowH, qLeft, qRight };
        if (st.multi) {
          g.sp = U.clamp(rowH * 0.7, 13, 26);
          g.laneCap = Math.max(1, Math.floor((qRight - qLeft) / g.sp) + 1);
          g.slot = (qi, k) => { const p = srv[qi]; return { x: qRight - k * g.sp, y: p.y }; };
          g.cap = g.laneCap;
        } else {
          g.sp = 24; g.rowGap = 36;
          g.nRows = Math.max(1, Math.floor((bot - top - 8) / g.rowGap));
          g.perRow = Math.max(2, Math.floor((qRight - qLeft) / g.sp) + 1);
          g.cap = g.nRows * g.perRow;
          g.slot = (qi, k) => {
            const r = Math.floor(k / g.perRow), i = k % g.perRow;
            return { x: r % 2 === 0 ? qRight - i * g.sp : qLeft + i * g.sp, y: top + 16 + r * g.rowGap };
          };
        }
        return g;
      });
      if (finite) {
        const N = sim.N, aw = 160, ah = bot - top - 30;
        const cell = U.clamp(Math.floor(Math.sqrt((aw * ah) / Math.max(1, N))), 9, 28);
        const cols = Math.max(1, Math.floor(aw / cell));
        this.pool = { cell, cols, x0: 22, y0: top + 24, slot: (i) => ({ x: 22 + (i % cols + 0.5) * cell, y: top + 24 + (Math.floor(i / cols) + 0.5) * cell }) };
      } else this.pool = null;
    }
    spot(v) { const g = this.G[v.s], p = g.srv[v.i]; return { x: p.x - 30 * Math.max(g.scale, 0.75), y: p.y }; }
    spawnPoint(c) {
      if (this.pool && c.pop >= 0) return this.pool.slot(c.pop);
      return { x: -14, y: this.entr.y + (Math.random() - 0.5) * 40 };
    }
    color(c) { return this.col.pal[c.k % 8]; }

    /* ---------------- eventos del motor ---------------- */
    event(type, c, v) {
      // la fila inicial se crea al construir el motor, antes de conectar la animación: esos clientes se dibujan desde el estado de la fila
      if (!this.sim || !this.entr) { if (this.o.onEvent) this.o.onEvent(type, c, v); return; }
      switch (type) {
        case 'arrive': {
          let s = this.sp.get(c.id);
          const p = this.spawnPoint(c);
          if (!s) { s = { id: c.id, c, x: p.x, y: p.y, a: 1 }; this.sp.set(c.id, s); }
          else { s.x = p.x; s.y = p.y; s.a = 1; }
          s.leave = null; s.c = c; break;
        }
        case 'block': this.leave(c, 'block', -40, this.entr.y - 90); this.addFlash(this.entr.x, this.entr.y - 26, 'Lleno', this.col.bad); break;
        case 'balk': this.leave(c, 'balk', -40, this.entr.y + 90); break;
        case 'abandon': { const s = this.sp.get(c.id); this.leave(c, 'ab', s ? s.x : this.entr.x, this.H + 30); break; }
        case 'orbit': { const s = this.sp.get(c.id); this.leave(c, 'orbit', s ? s.x : this.entr.x, -30); break; }
        case 'depart': {
          if (this.pool && c.pop >= 0) { const p = this.pool.slot(c.pop); this.leave(c, 'home', p.x, p.y); }
          else { const s = this.sp.get(c.id); this.leave(c, 'out', this.W + 30, s ? s.y : this.H / 2); }
          break;
        }
        case 'fail': if (v) { const p = this.G[v.s].srv[v.i]; this.addFlash(p.x, p.y - 20, 'Falla', this.col.bad); } break;
        default: break;
      }
      if (this.o.onEvent) this.o.onEvent(type, c, v);
    }
    leave(c, kind, tx, ty) {
      const s = this.sp.get(c.id); if (!s) return;
      this.sp.delete(c.id); s.leave = kind; s.tx = tx; s.ty = ty; s.t0 = 0; this.gone.push(s);
      if (this.gone.length > 400) this.gone.splice(0, this.gone.length - 400);
    }
    addFlash(x, y, text, color) { this.flash.push({ x, y, text, color, life: 1.4 }); if (this.flash.length > 12) this.flash.shift(); }

    /* ---------------- movimiento ---------------- */
    update(dt, speed) {
      const sim = this.sim; if (!sim) return;
      const k = 6 + Math.min(30, Math.sqrt(speed || 1) * 2);
      const f = 1 - Math.exp(-dt * k), vmin = 140 * dt;
      const move = (s, tx, ty) => {
        const dx = tx - s.x, dy = ty - s.y, d = Math.hypot(dx, dy);
        if (d < 0.5) { s.x = tx; s.y = ty; return true; }
        const step = Math.min(d, Math.max(d * f, vmin));
        s.x += dx / d * step; s.y += dy / d * step; return false;
      };
      const seen = new Set();
      sim.st.forEach((st, si) => {
        const g = this.G[si];
        st.Q.forEach((Q, qi) => {
          const list = this.ordered(st, Q);
          for (let n = 0; n < list.length; n++) {
            const c = list[n]; let s = this.sp.get(c.id);
            const hidden = n >= g.cap; const p = g.slot(qi, Math.min(n, g.cap - 1));
            if (!s) { s = { id: c.id, c, x: p.x, y: p.y, a: 1 }; this.sp.set(c.id, s); }
            s.hidden = hidden; s.c = c; seen.add(c.id);
            if (hidden) { s.x = p.x; s.y = p.y; } else move(s, p.x, p.y);
          }
        });
        st.srv.forEach((v) => {
          if (!v.c) return; const c = v.c; let s = this.sp.get(c.id); const p = this.spot(v);
          if (!s) { s = { id: c.id, c, x: p.x, y: p.y, a: 1 }; this.sp.set(c.id, s); }
          s.hidden = false; s.c = c; seen.add(c.id); move(s, p.x, p.y);
        });
      });
      for (const [id, s] of this.sp) if (!seen.has(id)) this.sp.delete(id);
      for (let i = this.gone.length - 1; i >= 0; i--) {
        const s = this.gone[i]; s.t0 += dt;
        const done = move(s, s.tx, s.ty);
        if (s.leave !== 'home') s.a = Math.max(0, 1 - s.t0 / 2.2);
        if (done || s.a <= 0.02 || s.t0 > 4) this.gone.splice(i, 1);
      }
      for (let i = this.flash.length - 1; i >= 0; i--) { this.flash[i].life -= dt; if (this.flash[i].life <= 0) this.flash.splice(i, 1); }
    }
    ordered(st, Q) {
      if (st.disc === 'PRIO' || st.disc === 'PRIOP') return Q.slice().sort((a, b) => a.prio - b.prio || a.ord - b.ord);
      if (st.disc === 'SPT') return Q.slice().sort((a, b) => (a.rem >= 0 ? a.rem : a.svc) - (b.rem >= 0 ? b.rem : b.svc));
      return Q;
    }

    /* ---------------- dibujo ---------------- */
    draw() {
      const ctx = this.ctx, C = this.col, sim = this.sim;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = C.floor; ctx.fillRect(0, 0, this.cv.width, this.cv.height);
      ctx.setTransform(this.k, 0, 0, this.k, 0, 0);
      if (!sim) return;
      this.drawFloor();
      const now = sim.t;
      // servidores
      sim.st.forEach((st, si) => st.srv.forEach((v) => this.drawServer(st, v, this.G[si], now)));
      // clientes en fila y en servicio
      for (const s of this.sp.values()) {
        if (s.hidden) continue;
        const c = s.c; const g = this.G[c.st] || this.G[0];
        this.person(s.x, s.y, this.color(c), 1, g.scale, c.state === 'q' ? this.mood(c, now) : null, this.star && c.prio === this.minPrio);
        if (c.state === 's' && c.sEnd > c.sStart) this.ring(s.x, s.y, (now - c.sStart) / (c.sEnd - c.sStart), g.scale);
      }
      // los que se van
      for (const s of this.gone) {
        const tint = s.leave === 'ab' || s.leave === 'balk' || s.leave === 'block' ? C.bad : s.leave === 'orbit' ? C.warn : null;
        this.person(s.x, s.y, tint || this.color(s.c), s.a, 0.85, null, false, !!tint);
      }
      // población (fuente finita)
      if (this.pool) this.drawPool();
      // contadores de desborde y avisos
      this.drawOverlays();
      for (const f of this.flash) {
        ctx.globalAlpha = Math.min(1, f.life); ctx.fillStyle = f.color; ctx.font = `600 12px ${C.font}`; ctx.textAlign = 'center';
        ctx.fillText(f.text, f.x, f.y - (1.4 - f.life) * 14); ctx.globalAlpha = 1;
      }
    }
    mood(c, now) {
      const T = this.sim.slT || 5; const w = now - c.qT;
      return w < T * 0.5 ? this.col.good : w < T ? this.col.warn : this.col.bad;
    }
    drawFloor() {
      const ctx = this.ctx, C = this.col, sim = this.sim;
      ctx.strokeStyle = C.floorLine; ctx.lineWidth = 1;
      for (let x = 0; x < this.W; x += 40) { ctx.beginPath(); ctx.moveTo(x + 0.5, 0); ctx.lineTo(x + 0.5, this.H); ctx.stroke(); }
      for (let y = 0; y < this.H; y += 40) { ctx.beginPath(); ctx.moveTo(0, y + 0.5); ctx.lineTo(this.W, y + 0.5); ctx.stroke(); }
      // muros y puertas
      ctx.strokeStyle = C.line2; ctx.lineWidth = 3;
      const e = this.entr;
      ctx.beginPath(); ctx.moveTo(e.x + 10, this.top - 20); ctx.lineTo(e.x + 10, e.y - 34); ctx.moveTo(e.x + 10, e.y + 34); ctx.lineTo(e.x + 10, this.bot + 20); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(this.W - 22, this.top - 20); ctx.lineTo(this.W - 22, this.bot + 20); ctx.stroke();
      ctx.fillStyle = C.muted; ctx.font = `600 12px ${C.font}`; ctx.textAlign = 'center';
      ctx.fillText('ENTRADA', e.x - 12, e.y - 42);
      this.arrow(e.x - 34, e.y, e.x + 2, e.y, C.muted);
      ctx.save(); ctx.translate(this.W - 9, (this.top + this.bot) / 2); ctx.rotate(Math.PI / 2); ctx.fillText('SALIDA', 0, 0); ctx.restore();
      ctx.textAlign = 'left'; ctx.fillStyle = C.muted; ctx.font = `500 11.5px ${C.font}`;
      ctx.fillText('← desisten / sin cupo', 8, this.H - 10);
      ctx.fillText('↓ abandonos', Math.max(this.xL + 40, 190), this.H - 10);
      // etapas
      this.G.forEach((g, si) => {
        const st = sim.st[si];
        if (si > 0) { ctx.strokeStyle = C.line; ctx.lineWidth = 1; ctx.setLineDash([]); ctx.beginPath(); ctx.moveTo(g.x0 + 0.5, this.top - 16); ctx.lineTo(g.x0 + 0.5, this.bot + 10); ctx.stroke(); }
        ctx.fillStyle = C.ink; ctx.font = `600 15px ${C.font}`; ctx.textAlign = 'left';
        const title = (sim.st.length > 1 ? `${si + 1}. ` : '') + st.name;
        ctx.fillText(title, g.x0 + 12, 24);
        ctx.fillStyle = C.muted; ctx.font = `500 12.5px ${C.font}`;
        const on = st.on - st.down;
        ctx.fillText(`En fila ${st.nq} · servidores activos ${on}/${st.srv.length}`, g.x0 + 12, 42);
        // barreras de la fila serpenteante
        if (!st.multi) {
          ctx.strokeStyle = C.line2; ctx.lineWidth = 1.5;
          const used = Math.min(g.nRows, Math.max(2, Math.ceil((st.nq + 1) / g.perRow) + 1));
          for (let r = 0; r < used - 1; r++) {
            const y = this.top + 16 + (r + 0.5) * g.rowGap;
            const a = r % 2 === 0 ? g.qLeft + g.sp * 0.9 : g.qLeft - g.sp * 0.4, b = r % 2 === 0 ? g.qRight + g.sp * 0.4 : g.qRight - g.sp * 0.9;
            ctx.beginPath(); ctx.moveTo(a, y); ctx.lineTo(b, y); ctx.stroke();
            ctx.fillStyle = C.line2; ctx.beginPath(); ctx.arc(a, y, 2, 0, 6.283); ctx.arc(b, y, 2, 0, 6.283); ctx.fill();
          }
        } else {
          ctx.strokeStyle = C.floorLine; ctx.lineWidth = 1;
          st.srv.forEach((v, j) => { const p = g.srv[j]; ctx.beginPath(); ctx.moveTo(g.qLeft, p.y + g.rowH / 2); ctx.lineTo(g.qRight + 6, p.y + g.rowH / 2); ctx.stroke(); });
        }
      });
    }
    drawServer(st, v, g, now) {
      const ctx = this.ctx, C = this.col, p = g.srv[v.i], s = g.scale;
      const w = 28 * Math.max(s, 0.6), h = 34 * s;
      ctx.globalAlpha = v.on ? 1 : 0.35;
      // agente detrás del mostrador
      const stateCol = v.down ? C.bad : !v.on ? C.muted : v.c ? C.accent : C.good;
      this.person(p.x + 16 * Math.max(s, 0.6), p.y, C.ink2, v.on ? 0.85 : 0.5, s * 1.05, null, false, false, true);
      // mostrador
      const excl = st.ded && v.i < st.ded.n;
      ctx.fillStyle = C.surface; ctx.strokeStyle = v.down ? C.bad : excl ? C.amber : C.line2; ctx.lineWidth = v.down || excl ? 2 : 1.2;
      this.rrect(p.x - w / 2 + 2, p.y - h / 2, w * 0.62, h, 3); ctx.fill(); ctx.stroke();
      // luz de estado
      ctx.fillStyle = stateCol; ctx.beginPath(); ctx.arc(p.x - w / 2 + 2 + w * 0.31, p.y - h / 2 - 4 * Math.max(s, 0.7), 3.2 * Math.max(s, 0.75), 0, 6.283); ctx.fill();
      if (v.down) { ctx.fillStyle = C.bad; ctx.font = `700 ${Math.round(11 * Math.max(s, 0.8))}px ${C.font}`; ctx.textAlign = 'center'; ctx.fillText('!', p.x - w / 2 + 2 + w * 0.31, p.y + 4); }
      if (v.leave) { ctx.fillStyle = C.warn; ctx.font = `600 9px ${C.font}`; ctx.textAlign = 'center'; ctx.fillText('cierra', p.x, p.y + h / 2 + 10); }
      if (excl) { ctx.fillStyle = C.amber; ctx.font = `700 ${Math.round(11 * Math.max(s, 0.8))}px ${C.font}`; ctx.textAlign = 'center'; ctx.fillText('★', p.x - w / 2 - 6, p.y - h / 2 + 2); }
      ctx.globalAlpha = 1;
      if (g.rows <= 14) {
        ctx.fillStyle = C.muted; ctx.font = `500 ${Math.round(11 * Math.max(s, 0.85))}px ${C.mono}`; ctx.textAlign = 'center';
        ctx.fillText(String(v.i + 1), p.x + 16 * Math.max(s, 0.6), p.y + h / 2 + 11 * Math.max(s, 0.8));
      }
    }
    drawPool() {
      const ctx = this.ctx, C = this.col, sim = this.sim, P = this.pool;
      ctx.fillStyle = C.ink; ctx.font = `600 15px ${C.font}`; ctx.textAlign = 'left';
      ctx.fillText(`Población (${sim.N})`, 14, 24);
      ctx.fillStyle = C.muted; ctx.font = `500 12.5px ${C.font}`;
      const inPool = sim.popAt.filter((x) => x === 'pool').length;
      ctx.fillText(`${inPool} fuera del sistema`, 14, 42);
      const walking = new Set(); for (const s of this.gone) if (s.leave === 'home') walking.add(s.c.pop);
      const sc = U.clamp(P.cell / 34, 0.35, 0.75);
      for (let i = 0; i < sim.N; i++) {
        const p = P.slot(i);
        if (sim.popAt[i] === 'pool' && !walking.has(i)) this.person(p.x, p.y, C.muted, 0.75, sc);
        else { ctx.strokeStyle = C.line2; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(p.x, p.y, 3.5 * sc + 1, 0, 6.283); ctx.stroke(); }
      }
    }
    drawOverlays() {
      const ctx = this.ctx, C = this.col, sim = this.sim;
      sim.st.forEach((st, si) => {
        const g = this.G[si];
        st.Q.forEach((Q, qi) => {
          if (Q.length > g.cap) {
            const p = g.slot(qi, g.cap - 1); const txt = '+' + (Q.length - g.cap + 1);
            ctx.font = `700 11px ${C.font}`; const w = ctx.measureText(txt).width + 10;
            ctx.fillStyle = C.bad; this.rrect(p.x - w / 2, p.y - 9, w, 18, 9); ctx.fill();
            ctx.fillStyle = C.onStatus; ctx.textAlign = 'center'; ctx.fillText(txt, p.x, p.y + 4);
          }
        });
      });
      if (sim.done) {
        ctx.fillStyle = C.ink; ctx.globalAlpha = 0.8; ctx.font = `600 14px ${C.font}`; ctx.textAlign = 'center';
        ctx.fillText(sim.unstable ? 'Simulación detenida: la fila creció sin control (sistema inestable)' : 'Jornada terminada', (this.xL + this.xR) / 2, this.H - 12);
        ctx.globalAlpha = 1;
      }
    }
    person(x, y, color, alpha, scale = 1, mood = null, star = false, hollow = false, agent = false) {
      const ctx = this.ctx, s = Math.max(0.45, scale) * 1.32;
      ctx.globalAlpha = alpha;
      ctx.fillStyle = color;
      // cuerpo
      ctx.beginPath();
      ctx.moveTo(x - 6 * s, y + 9 * s);
      ctx.quadraticCurveTo(x - 6.5 * s, y - 1 * s, x, y - 1.5 * s);
      ctx.quadraticCurveTo(x + 6.5 * s, y - 1 * s, x + 6 * s, y + 9 * s);
      ctx.closePath();
      if (hollow) { ctx.strokeStyle = color; ctx.lineWidth = 1.4; ctx.stroke(); } else ctx.fill();
      // cabeza con anillo del color de superficie para separarla de vecinos
      ctx.beginPath(); ctx.arc(x, y - 6.5 * s, 4.1 * s, 0, 6.283);
      if (!agent) { ctx.lineWidth = 1.5; ctx.strokeStyle = this.col.floor; ctx.stroke(); }
      if (hollow) { ctx.strokeStyle = color; ctx.lineWidth = 1.4; ctx.stroke(); } else ctx.fill();
      if (mood) { ctx.fillStyle = mood; ctx.beginPath(); ctx.arc(x + 5 * s, y - 11 * s, 2.3 * Math.max(s, 0.8), 0, 6.283); ctx.fill(); }
      if (star) { ctx.fillStyle = this.col.amber; ctx.font = `700 ${Math.round(9 * Math.max(s, 0.8))}px ${this.col.font}`; ctx.textAlign = 'center'; ctx.fillText('★', x - 6 * s, y - 9 * s); }
      ctx.globalAlpha = 1;
    }
    ring(x, y, frac, scale) {
      const ctx = this.ctx, s = Math.max(0.6, scale);
      ctx.strokeStyle = this.col.accent; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(x, y + 1 * s, 17 * s, -Math.PI / 2, -Math.PI / 2 + 6.283 * U.clamp(frac, 0, 1)); ctx.stroke();
    }
    arrow(x1, y1, x2, y2, color) {
      const ctx = this.ctx; ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
      const a = Math.atan2(y2 - y1, x2 - x1);
      ctx.beginPath(); ctx.moveTo(x2, y2); ctx.lineTo(x2 - 7 * Math.cos(a - 0.45), y2 - 7 * Math.sin(a - 0.45)); ctx.lineTo(x2 - 7 * Math.cos(a + 0.45), y2 - 7 * Math.sin(a + 0.45)); ctx.closePath(); ctx.fill();
    }
    rrect(x, y, w, h, r) {
      const ctx = this.ctx; ctx.beginPath();
      ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
    }
  }

  /* ======================= vista 3D (cámara en perspectiva) ======================= */
  class Anim3D extends Anim {
    frameH() { return 470; }
    resize() {
      const box = this.cv.parentElement; const w = Math.max(280, box.clientWidth);
      const FH = this.frameH(); const h = Math.round(w * FH / this.W); const dpr = Math.min(2.5, root.devicePixelRatio || 1);
      this.cv.style.width = w + 'px'; this.cv.style.height = h + 'px';
      this.cv.width = Math.round(w * dpr); this.cv.height = Math.round(h * dpr);
      this.k = (w / this.W) * dpr; this.cssScale = w / this.W;
    }
    layout() { super.layout(); this.setupCam(); }
    // Cámara detrás de la entrada inferior del plano, mirando hacia el fondo y hacia abajo
    setupCam() {
      const W = this.W, H = this.H, phi = 52 * Math.PI / 180;
      this.cam = { X: W / 2, Y: H + 520, Z: 620, cf: Math.cos(phi), sf: Math.sin(phi), focal: 900 };
      this.wallH = 78;
      // sala = área útil del plano (de la entrada a la salida, de la primera a la última fila)
      this.room = { x0: Math.max(0, this.entr.x - 30), x1: W, y0: Math.max(0, this.top - 34), y1: Math.min(H, this.bot + 26) };
      const R = this.room;
      const pts = [[R.x0, R.y0, 0], [R.x1, R.y0, 0], [R.x0, R.y1, 0], [R.x1, R.y1, 0], [R.x0, R.y0, this.wallH], [R.x1, R.y0, this.wallH]].map(([x, y, z]) => this.raw(x, y, z));
      const xs = pts.map((q) => q.x), ys = pts.map((q) => q.y);
      const minx = Math.min(...xs), maxx = Math.max(...xs), miny = Math.min(...ys), maxy = Math.max(...ys);
      const FH = this.frameH(), pad = 8;
      const sc = Math.min((W - 2 * pad) / (maxx - minx), (FH - 2 * pad) / (maxy - miny));
      this.fit = { sc, ox: (W - (maxx - minx) * sc) / 2 - minx * sc, oy: (FH - (maxy - miny) * sc) / 2 - miny * sc };
    }
    raw(x, y, z) {
      const c = this.cam; const vx = x - c.X, vy = y - c.Y, vz = z - c.Z;
      const depth = -vy * c.cf - vz * c.sf;              // f = (0, −cos φ, −sen φ)
      const uy = -vy * c.sf + vz * c.cf;                  // u = (0, −sen φ, cos φ)
      return { x: c.focal * vx / depth, y: -c.focal * uy / depth, d: depth, s: c.focal / depth };
    }
    P(x, y, z = 0) { const r = this.raw(x, y, z), f = this.fit; return { x: r.x * f.sc + f.ox, y: r.y * f.sc + f.oy, d: r.d, s: r.s * f.sc }; }
    poly(pts, fill, stroke, lw) {
      const ctx = this.ctx; ctx.beginPath(); pts.forEach((q, i) => (i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y))); ctx.closePath();
      if (fill) { ctx.fillStyle = fill; ctx.fill(); }
      if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw || 1; ctx.stroke(); }
    }
    line3(a, b, color, lw) { const ctx = this.ctx; ctx.strokeStyle = color; ctx.lineWidth = lw || 1; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); }

    draw() {
      const ctx = this.ctx, C = this.col, sim = this.sim;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = C.dark ? '#0a0f16' : '#e9eef4'; ctx.fillRect(0, 0, this.cv.width, this.cv.height);
      ctx.setTransform(this.k, 0, 0, this.k, 0, 0);
      if (!sim || !this.cam) return;
      this.drawRoom();
      const now = sim.t, items = [];
      const push = (d, fn) => items.push({ d, fn });
      // fila: postes y cintas
      this.G.forEach((g, si) => {
        const st = sim.st[si];
        if (!st.multi) {
          const used = Math.min(g.nRows, Math.max(2, Math.ceil((st.nq + 1) / g.perRow) + 1));
          for (let r = 0; r < used - 1; r++) {
            const y = this.top + 16 + (r + 0.5) * g.rowGap;
            const a = r % 2 === 0 ? g.qLeft + g.sp * 0.9 : g.qLeft - g.sp * 0.4, b = r % 2 === 0 ? g.qRight + g.sp * 0.4 : g.qRight - g.sp * 0.9;
            push(this.P((a + b) / 2, y).d, () => this.belt(a, b, y));
          }
        }
      });
      // mostradores y personal
      sim.st.forEach((st, si) => st.srv.forEach((v) => { const p = this.G[si].srv[v.i]; push(this.P(p.x, p.y).d + 0.01, () => this.counter(st, v, this.G[si], now)); }));
      // clientes
      for (const s of this.sp.values()) {
        if (s.hidden) continue;
        const c = s.c, g = this.G[c.st] || this.G[0];
        push(this.P(s.x, s.y).d, () => {
          this.person3(s.x, s.y, this.color(c), 1, g.scale, c.state === 'q' ? this.mood(c, now) : null, this.star && c.prio === this.minPrio);
          if (c.state === 's' && c.sEnd > c.sStart) this.ring3(s.x, s.y, (now - c.sStart) / (c.sEnd - c.sStart), g.scale);
        });
      }
      for (const s of this.gone) {
        const tint = s.leave === 'ab' || s.leave === 'balk' || s.leave === 'block' ? C.bad : s.leave === 'orbit' ? C.warn : null;
        push(this.P(s.x, Math.min(this.H, s.y)).d, () => this.person3(s.x, Math.min(this.H + 20, s.y), tint || this.color(s.c), s.a, 0.85, null, false));
      }
      if (this.pool) this.drawPool3(push);
      items.sort((a, b) => b.d - a.d).forEach((it) => it.fn());
      this.overlays3();
      for (const f of this.flash) {
        const q = this.P(f.x, f.y, 40); ctx.globalAlpha = Math.min(1, f.life); ctx.fillStyle = f.color; ctx.font = `600 12px ${C.font}`; ctx.textAlign = 'center';
        ctx.fillText(f.text, q.x, q.y - (1.4 - f.life) * 14); ctx.globalAlpha = 1;
      }
    }
    drawRoom() {
      const ctx = this.ctx, C = this.col, sim = this.sim, R = this.room, P = (x, y, z) => this.P(x, y, z);
      // pared del fondo
      const wall = [P(R.x0, R.y0, 0), P(R.x1, R.y0, 0), P(R.x1, R.y0, this.wallH), P(R.x0, R.y0, this.wallH)];
      this.poly(wall, C.dark ? '#141c27' : '#f6f8fb', C.line, 1);
      this.line3(P(R.x0, R.y0, 6), P(R.x1, R.y0, 6), C.line2, 1.2);
      // piso con zonas por etapa
      this.poly([P(R.x0, R.y0), P(R.x1, R.y0), P(R.x1, R.y1), P(R.x0, R.y1)], C.floor, null);
      this.G.forEach((g, si) => {
        const tint = si % 2 ? (C.dark ? 'rgba(255,255,255,0.025)' : 'rgba(15,26,42,0.025)') : (C.dark ? 'rgba(91,155,255,0.05)' : 'rgba(31,95,207,0.045)');
        this.poly([P(g.x0 + 6, this.top - 26), P(g.x1 - 6, this.top - 26), P(g.x1 - 6, this.bot + 18), P(g.x0 + 6, this.bot + 18)], tint, C.line, 1);
      });
      ctx.globalAlpha = 0.9;
      for (let x = Math.ceil(R.x0 / 40) * 40; x <= R.x1; x += 40) this.line3(P(x, R.y0), P(x, R.y1), C.floorLine, 1);
      for (let y = Math.ceil(R.y0 / 40) * 40; y <= R.y1; y += 40) this.line3(P(R.x0, y), P(R.x1, y), C.floorLine, 1);
      ctx.globalAlpha = 1;
      // letreros de cada etapa en la pared
      this.G.forEach((g, si) => {
        const st = sim.st[si], cx = (g.x0 + g.x1) / 2, wy = R.y0;
        const a = P(g.x0 + 18, wy, this.wallH - 10), b = P(g.x1 - 18, wy, this.wallH - 10), c2 = P(g.x1 - 18, wy, 16), d = P(g.x0 + 18, wy, 16);
        this.poly([a, b, c2, d], C.surface, C.line2, 1);
        const t = P(cx, wy, this.wallH * 0.56), sc = U.clamp(t.s * 1.25, 0.7, 1.35);
        ctx.fillStyle = C.ink; ctx.textAlign = 'center'; ctx.font = `700 ${Math.round(14 * sc)}px ${C.font}`;
        const title = (sim.st.length > 1 ? `${si + 1}. ` : '') + st.name;
        ctx.fillText(title.length > 34 ? title.slice(0, 33) + '…' : title, t.x, t.y);
        ctx.fillStyle = C.muted; ctx.font = `500 ${Math.round(11.5 * sc)}px ${C.font}`;
        ctx.fillText(`En fila ${st.nq} · activos ${st.on - st.down}/${st.srv.length}`, t.x, t.y + 16 * sc);
      });
      // puertas
      const e = this.entr;
      this.door(e.x + 10, e.y, 34, 'ENTRADA');
      this.door(this.W - 22, (this.top + this.bot) / 2, 60, 'SALIDA');
      // carriles de filas separadas
      this.G.forEach((g, si) => {
        const st = sim.st[si]; if (!st.multi) return;
        st.srv.forEach((v, j) => { const q = g.srv[j]; this.line3(P(g.qLeft, q.y + g.rowH / 2), P(g.qRight + 6, q.y + g.rowH / 2), C.line, 1); });
      });
    }
    door(x, y, half, label) {
      const C = this.col, P = (a, b, z) => this.P(a, b, z), hgt = 64;
      const l0 = P(x, y - half, 0), l1 = P(x, y - half, hgt), r0 = P(x, y + half, 0), r1 = P(x, y + half, hgt);
      this.poly([P(x - 4, y - half, 0), P(x + 4, y - half, 0), P(x + 4, y + half, 0), P(x - 4, y + half, 0)], C.dark ? 'rgba(52,196,116,0.18)' : 'rgba(13,122,60,0.12)', null);
      this.line3(l0, l1, C.line2, 3); this.line3(r0, r1, C.line2, 3); this.line3(l1, r1, C.line2, 3);
      const t = P(x, y, hgt + 10); const ctx = this.ctx; ctx.fillStyle = C.muted; ctx.textAlign = 'center'; ctx.font = `700 ${Math.round(11 * U.clamp(t.s, 0.7, 1.2))}px ${C.font}`; ctx.fillText(label, t.x, t.y);
    }
    belt(a, b, y) {
      const C = this.col, P = (x, yy, z) => this.P(x, yy, z), h = 15;
      const pa0 = P(a, y, 0), pa1 = P(a, y, h), pb0 = P(b, y, 0), pb1 = P(b, y, h);
      this.line3(pa0, pa1, C.line2, 2); this.line3(pb0, pb1, C.line2, 2);
      this.line3(P(a, y, h - 2), P(b, y, h - 2), C.dark ? '#c0504a' : '#c9473f', 2.2);
      const ctx = this.ctx; ctx.fillStyle = C.ink2; [pa1, pb1].forEach((q) => { ctx.beginPath(); ctx.arc(q.x, q.y, 2.2 * U.clamp(q.s, 0.6, 1.4), 0, 6.283); ctx.fill(); });
    }
    // Caja 3D (x0..x1, y0..y1, 0..h): se dibujan la cara lateral visible, la frontal y la superior
    box(x0, x1, y0, y1, h, cTop, cFront, cSide, stroke) {
      const P = (x, y, z) => this.P(x, y, z);
      const side = this.cam.X < x0 ? x0 : this.cam.X > x1 ? x1 : null;
      if (side != null) this.poly([P(side, y0, 0), P(side, y1, 0), P(side, y1, h), P(side, y0, h)], cSide, stroke, 1);
      this.poly([P(x0, y1, 0), P(x1, y1, 0), P(x1, y1, h), P(x0, y1, h)], cFront, stroke, 1);
      this.poly([P(x0, y0, h), P(x1, y0, h), P(x1, y1, h), P(x0, y1, h)], cTop, stroke, 1);
    }
    counter(st, v, g, now) {
      const C = this.col, p = g.srv[v.i], s = Math.max(g.scale, 0.6);
      const w = 30 * s, hd = 36 * g.scale;
      const x0 = p.x - w / 2 + 2, x1 = x0 + w * 0.66, y0 = p.y - hd / 2, y1 = p.y + hd / 2;
      const ctx = this.ctx; ctx.globalAlpha = (v.on ? 1 : 0.4) * 0.14;
      this.poly([this.P(x0 + 3, y0 + 4), this.P(x1 + 5, y0 + 4), this.P(x1 + 5, y1 + 5), this.P(x0 + 3, y1 + 5)], '#000', null);
      ctx.globalAlpha = v.on ? 1 : 0.4;
      // agente detrás del mostrador (más lejos de la cámara en x, misma profundidad aproximada)
      this.person3(p.x + 16 * s, p.y - 2, C.ink2, v.on ? 0.9 : 0.5, g.scale * 1.02, null, false, true);
      const excl = st.ded && v.i < st.ded.n;
      const edge = v.down ? C.bad : excl ? C.amber : C.line2;
      this.box(x0, x1, y0, y1, 26, C.surface, C.dark ? '#25364b' : '#d5dde8', C.dark ? '#1b2838' : '#c3cedb', edge);
      // pantalla de la caja y luz de estado
      const scr = this.P((x0 + x1) / 2, y0 + 4, 36); const lamp = this.P((x0 + x1) / 2, (y0 + y1) / 2, 42);
      this.line3(this.P((x0 + x1) / 2, y0 + 4, 26), scr, C.line2, 2);
      const stateCol = v.down ? C.bad : !v.on ? C.muted : v.c ? C.accent : C.good;
      ctx.fillStyle = stateCol; ctx.beginPath(); ctx.arc(lamp.x, lamp.y, 3.6 * U.clamp(lamp.s, 0.6, 1.5), 0, 6.283); ctx.fill();
      if (excl) { ctx.fillStyle = C.amber; ctx.font = `700 ${Math.round(12 * U.clamp(lamp.s, 0.7, 1.4))}px ${C.font}`; ctx.textAlign = 'center'; ctx.fillText('★', lamp.x - 10 * lamp.s, lamp.y); }
      if (v.leave) { const q = this.P(p.x, y1 + 8, 0); ctx.fillStyle = C.warn; ctx.font = `600 ${Math.round(9 * U.clamp(q.s, 0.7, 1.4))}px ${C.font}`; ctx.textAlign = 'center'; ctx.fillText('cierra', q.x, q.y + 8); }
      ctx.globalAlpha = 1;
      if (g.rows <= 14) { const q = this.P(p.x + 16 * s, y1 + 6, 0); ctx.fillStyle = C.muted; ctx.font = `500 ${Math.round(10.5 * U.clamp(q.s, 0.7, 1.3))}px ${C.mono}`; ctx.textAlign = 'center'; ctx.fillText(String(v.i + 1), q.x, q.y + 10 * q.s); }
    }
    // Persona de pie: sombra en el piso, cuerpo y cabeza con sombreado, escala según la distancia a la cámara
    person3(x, y, color, alpha, scale = 1, mood = null, star = false, agent = false) {
      const ctx = this.ctx, C = this.col, k = Math.max(0.5, scale) * 1.4;
      const foot = this.P(x, y, 0), top = this.P(x, y, 30 * k);
      const s = foot.s * k, hgt = foot.y - top.y;
      ctx.globalAlpha = alpha * 0.22; ctx.fillStyle = '#000'; ctx.beginPath(); ctx.ellipse(foot.x + 2 * s, foot.y, 7.5 * s, 3 * s, 0, 0, 6.283); ctx.fill();
      ctx.globalAlpha = alpha;
      const bw = 6.4 * s, bodyTop = foot.y - hgt * 0.72, headR = Math.max(2, 4.6 * s), headY = foot.y - hgt + headR;
      // cuerpo (cápsula)
      ctx.fillStyle = color; ctx.beginPath();
      ctx.moveTo(foot.x - bw, foot.y - 1.5 * s); ctx.lineTo(foot.x - bw, bodyTop + bw * 0.8);
      ctx.quadraticCurveTo(foot.x - bw, bodyTop, foot.x, bodyTop); ctx.quadraticCurveTo(foot.x + bw, bodyTop, foot.x + bw, bodyTop + bw * 0.8);
      ctx.lineTo(foot.x + bw, foot.y - 1.5 * s); ctx.quadraticCurveTo(foot.x, foot.y + 1.5 * s, foot.x - bw, foot.y - 1.5 * s); ctx.fill();
      // luz lateral
      ctx.globalAlpha = alpha * (C.dark ? 0.18 : 0.28); ctx.fillStyle = '#fff'; ctx.beginPath();
      ctx.moveTo(foot.x - bw * 0.75, foot.y - 2 * s); ctx.lineTo(foot.x - bw * 0.75, bodyTop + bw); ctx.quadraticCurveTo(foot.x - bw * 0.6, bodyTop + bw * 0.25, foot.x - bw * 0.1, bodyTop + bw * 0.2); ctx.lineTo(foot.x - bw * 0.25, foot.y - 2 * s); ctx.fill();
      ctx.globalAlpha = alpha;
      // cabeza
      ctx.fillStyle = agent ? color : (C.dark ? '#e8c9a8' : '#e2b48c'); ctx.beginPath(); ctx.arc(foot.x, headY, headR, 0, 6.283); ctx.fill();
      if (!agent) { ctx.fillStyle = color; ctx.beginPath(); ctx.arc(foot.x, headY - headR * 0.25, headR * 1.02, Math.PI, 2 * Math.PI); ctx.fill(); }
      if (mood) { ctx.fillStyle = mood; ctx.beginPath(); ctx.arc(foot.x + headR * 1.6, headY - headR * 1.4, Math.max(2, 2.4 * s), 0, 6.283); ctx.fill(); }
      if (star) { ctx.fillStyle = C.amber; ctx.font = `700 ${Math.round(10 * Math.max(s, 0.8))}px ${C.font}`; ctx.textAlign = 'center'; ctx.fillText('★', foot.x - headR * 1.8, headY - headR); }
      ctx.globalAlpha = 1;
    }
    ring3(x, y, frac, scale) {
      const ctx = this.ctx, k = Math.max(0.5, scale) * 1.4; const top = this.P(x, y, 30 * k), foot = this.P(x, y, 0);
      const r = Math.max(5, 7.5 * foot.s * k);
      ctx.strokeStyle = this.col.accent; ctx.lineWidth = 2.2;
      ctx.beginPath(); ctx.arc(top.x, top.y - r - 2, r, -Math.PI / 2, -Math.PI / 2 + 6.283 * U.clamp(frac, 0, 1)); ctx.stroke();
    }
    drawPool3(push) {
      const sim = this.sim, P = this.pool, C = this.col;
      const walking = new Set(); for (const s of this.gone) if (s.leave === 'home') walking.add(s.c.pop);
      const sc = U.clamp(P.cell / 34, 0.35, 0.75);
      for (let i = 0; i < sim.N; i++) {
        const q = P.slot(i);
        if (sim.popAt[i] === 'pool' && !walking.has(i)) push(this.P(q.x, q.y).d, () => this.person3(q.x, q.y, C.muted, 0.8, sc));
      }
    }
    overlays3() {
      const ctx = this.ctx, C = this.col, sim = this.sim;
      sim.st.forEach((st, si) => {
        const g = this.G[si];
        st.Q.forEach((Q, qi) => {
          if (Q.length > g.cap) {
            const p = g.slot(qi, g.cap - 1), q = this.P(p.x, p.y, 44); const txt = '+' + (Q.length - g.cap + 1);
            ctx.font = `700 11px ${C.font}`; const w = ctx.measureText(txt).width + 10;
            ctx.fillStyle = C.bad; this.rrect(q.x - w / 2, q.y - 9, w, 18, 9); ctx.fill();
            ctx.fillStyle = C.onStatus; ctx.textAlign = 'center'; ctx.fillText(txt, q.x, q.y + 4);
          }
        });
      });
      if (sim.done) {
        ctx.fillStyle = C.ink; ctx.globalAlpha = 0.85; ctx.font = `600 14px ${C.font}`; ctx.textAlign = 'center';
        ctx.fillText(sim.unstable ? 'Simulación detenida: la fila creció sin control (sistema inestable)' : 'Jornada terminada', this.W / 2, this.frameH() - 12);
        ctx.globalAlpha = 1;
      }
    }
  }
  QS.Anim = Anim; QS.Anim3D = Anim3D;
})(typeof window !== 'undefined' ? window : globalThis);
