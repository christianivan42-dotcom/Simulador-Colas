/* Motor de simulación de eventos discretos para sistemas de colas.
   Reloj en MINUTOS desde la apertura. Soporta: llegadas Poisson, renovación general,
   perfil horario (Poisson no homogéneo), citas con ausentismo, población finita, lotes,
   clases con prioridad (con y sin expropiación), fila única o filas por servidor con
   cambio de fila, rechazo (balking), abandono (reneging), reintentos, capacidad K,
   horarios de personal, fallas de servidores y varias etapas en serie. */
(function (root) {
  'use strict';
  const QS = root.QS = root.QS || {};
  const U = QS.U, Dist = QS.Dist, RNG = QS.RNG;

  const ARR = 1, END = 2, ABN = 3, SCH = 4, FAIL = 5, REP = 6, RETRY = 7, POP = 8, APPT = 9;

  /* ------------------ Montículo binario de eventos ------------------ */
  class Heap {
    constructor() { this.a = []; }
    get size() { return this.a.length; }
    peek() { return this.a[0]; }
    push(e) {
      const a = this.a; a.push(e); let i = a.length - 1;
      while (i > 0) {
        const p = (i - 1) >> 1; const x = a[i], y = a[p];
        if (x.t < y.t || (x.t === y.t && x.s < y.s)) { a[i] = y; a[p] = x; i = p; } else break;
      }
    }
    pop() {
      const a = this.a; const top = a[0]; const last = a.pop();
      if (a.length) {
        a[0] = last; let i = 0; const n = a.length;
        for (;;) {
          const l = 2 * i + 1, r = l + 1; let m = i;
          if (l < n && (a[l].t < a[m].t || (a[l].t === a[m].t && a[l].s < a[m].s))) m = l;
          if (r < n && (a[r].t < a[m].t || (a[r].t === a[m].t && a[r].s < a[m].s))) m = r;
          if (m === i) break; const tmp = a[i]; a[i] = a[m]; a[m] = tmp; i = m;
        }
      }
      return top;
    }
  }

  /* ------------------ Escenario por defecto ------------------ */
  function defaults() {
    return {
      name: 'Sucursal bancaria — fila única',
      open: 540,
      arrivals: {
        mode: 'poisson', rate: 60,
        ia: { type: 'erlang', mean: 1, k: 2 },
        profile: [40, 55, 70, 85, 80, 65, 60, 75],
        batch: { type: 'none', mean: 2, min: 1, max: 3 },
        appt: { interval: 10, noShow: 0.1, meanLate: 0, sdLate: 4, walkin: 0 },
        finite: { N: 20, think: { type: 'exp', mean: 120 } },
        initialQueue: 0
      },
      classes: [{ name: 'General', share: 100, prio: 2, svcMult: 1, patMult: 1 }],
      stages: [{ name: 'Cajas', servers: 4, svc: { type: 'exp', mean: 3.5 }, queue: 'single', select: 'shortest', jockey: false,
        disc: 'FIFO', assign: 'idle', speeds: '', prob: 1, useSchedule: false, schedule: [], dedicated: { n: 0, cls: 1, strict: false } }],
      capacity: 0,
      balk: { type: 'none', L: 10 },
      renege: { on: false, dist: { type: 'exp', mean: 15 } },
      retry: { p: 0, mean: 20 },
      fail: { on: false, mtbf: 240, mttr: 15 },
      run: { hours: 8, warmupH: 0, reps: 20, seed: 2026, drain: true, slT: 5 },
      cost: { server: 150, wait: 90, lost: 120, cur: '$' }
    };
  }
  // Completa una especificación parcial con los valores por defecto
  function normalize(spec) {
    const d = defaults(); const s = JSON.parse(JSON.stringify(spec || {}));
    const merge = (dst, src) => {
      for (const k in dst) {
        if (src[k] === undefined || src[k] === null) src[k] = dst[k];
        else if (dst[k] && typeof dst[k] === 'object' && !Array.isArray(dst[k]) && typeof src[k] === 'object') merge(dst[k], src[k]);
      }
      return src;
    };
    merge(d, s);
    s.stages = (s.stages && s.stages.length ? s.stages : d.stages).map((st) => merge(JSON.parse(JSON.stringify(d.stages[0])), st));
    s.classes = (s.classes && s.classes.length ? s.classes : d.classes).map((c) => merge(JSON.parse(JSON.stringify(d.classes[0])), c));
    return s;
  }

  /* ------------------ Simulación ------------------ */
  class Sim {
    constructor(specIn, seed, opts) {
      const spec = this.spec = normalize(specIn);
      this.o = opts || {};
      this.emitFn = this.o.onEvent || null;
      const sd = String(seed === undefined ? spec.run.seed : seed);
      this.rA = new RNG(sd + ':A'); this.rS = new RNG(sd + ':S'); this.rP = new RNG(sd + ':P');
      this.rM = new RNG(sd + ':M'); this.rF = new RNG(sd + ':F');
      this.H = new Heap(); this.seq = 0; this.t = 0; this.nid = 0; this.ord = 0;
      const run = spec.run;
      this.tEnd = Math.max(1, +run.hours * 60); this.warm = Math.max(0, (+run.warmupH || 0) * 60);
      this.drain = run.drain !== false; this.slT = +run.slT || 0;
      this.tHard = this.tEnd + Math.max(1440, this.tEnd);
      this.maxSys = this.o.maxSys || 25000;
      this.K = +spec.capacity > 0 ? Math.round(+spec.capacity) : Infinity;
      this.mode = spec.arrivals.mode;
      // Clases de clientes
      const tot = spec.classes.reduce((s, c) => s + Math.max(0, +c.share || 0), 0) || 1;
      let cum = 0;
      const nSt = spec.stages.length;
      this.cls = spec.classes.map((c, i) => {
        cum += Math.max(0, +c.share || 0) / tot;
        // Ruta propia: etapas que visita este tipo de cliente (p. ej. "pago de cuota" va directo a la caja)
        const vis = Array.isArray(c.visits) && c.visits.slice(0, nSt).some(Boolean) ? U.range(nSt, (s) => !!c.visits[s]) : null;
        const sm = Array.isArray(c.svcMults) ? U.range(nSt, (s) => (+c.svcMults[s] > 0 ? +c.svcMults[s] : 0)) : null;
        return { i, name: c.name || ('Clase ' + (i + 1)), prio: +c.prio || 1, svcMult: +c.svcMult > 0 ? +c.svcMult : 1, patMult: +c.patMult > 0 ? +c.patMult : 1, cum, visits: vis, svcMults: sm };
      });
      this.cls[this.cls.length - 1].cum = 1;
      // Comportamiento
      this.balk = spec.balk && spec.balk.type !== 'none' ? spec.balk : null;
      this.patD = spec.renege && spec.renege.on ? Dist.make(spec.renege.dist) : null;
      this.retryP = spec.retry ? Math.max(0, Math.min(1, +spec.retry.p || 0)) : 0;
      this.retryMean = spec.retry ? Math.max(0.01, +spec.retry.mean || 1) : 1;
      this.batchD = Dist.batch(spec.arrivals.batch);
      // Etapas
      this.st = spec.stages.map((s, i) => this._mkStage(s, i));
      this.inSys = 0; this.pending = 0; this.done = false; this.unstable = false; this.truncated = false;
      this._initStats();
      this._initArrivals();
      this._initSchedules();
      this._initFailures();
      const n0 = Math.max(0, Math.round(+spec.arrivals.initialQueue || 0));
      for (let i = 0; i < n0 && this.mode !== 'finite'; i++) this._arrive(this._newCust(-1));
    }

    _mkStage(s, i) {
      const sched = s.useSchedule && Array.isArray(s.schedule) && s.schedule.length ? s.schedule.map((x) => Math.max(0, Math.round(+x || 0))) : null;
      const c = Math.max(1, Math.round(sched ? Math.max(...sched, +s.servers || 0) : +s.servers || 1));
      const speeds = String(s.speeds || '').split(/[;,\s]+/).map(Number).filter((x) => x > 0);
      const st = {
        i, name: s.name || ('Etapa ' + (i + 1)), svcD: Dist.make(s.svc), multi: s.queue === 'multi', select: s.select || 'shortest',
        jockey: !!s.jockey && s.queue === 'multi', disc: s.disc || 'FIFO', preempt: s.disc === 'PRIOP', assign: s.assign || 'idle',
        prob: i === 0 ? 1 : Math.max(0, Math.min(1, s.prob === undefined ? 1 : +s.prob)), sched, rr: -1,
        srv: [], Q: [], nq: 0, busy: 0, on: 0, down: 0,
        aQ: 0, aBusy: 0, aOn: 0, aDown: 0, sumWq: 0, nWq: 0, served: 0, maxQ: 0, slN: 0, slOk: 0, hs: []
      };
      // Servidores exclusivos (cajas rápidas, autocobro, ventanilla preferencial): los primeros n atienden solo a una clase
      const dd = s.dedicated || {};
      if (+dd.n > 0 && c >= 2 && this.cls && +dd.cls >= 0 && +dd.cls < this.cls.length) st.ded = { n: Math.min(Math.round(+dd.n), c - 1), cls: Math.round(+dd.cls), strict: !!dd.strict };
      for (let j = 0; j < c; j++) {
        st.srv.push({ s: i, i: j, speed: speeds[j] || 1, on: true, leave: false, down: false, c: null, end: null,
          idle: 0, bSince: 0, onSince: 0, busyT: 0, onT: 0, n: 0 });
      }
      st.Q = st.multi ? st.srv.map(() => []) : [[]];
      const n0 = sched ? sched[0] : c;
      st.srv.forEach((v, j) => { v.on = j < n0; });
      st.on = Math.min(n0, c);
      return st;
    }

    _initStats() {
      this.S = { arr: 0, ent: 0, served: 0, ab: 0, balk: 0, block: 0, retries: 0, lostFinal: 0, preempt: 0, jock: 0, noShow: 0,
        sumW: 0, sumWq: 0, sumWq0: 0, sumSvc: 0, sumWab: 0, slN: 0, slOk: 0, waited: 0, aSys: 0, T: 0, maxSys: 0, maxQ: 0 };
      this.C = this.cls.map(() => ({ arr: 0, served: 0, ab: 0, lost: 0, sumWq: 0, sumW: 0, slN: 0, slOk: 0 }));
      this.CS = this.cls.map(() => this.st.map(() => ({ n: 0, sum: 0 })));
      this.waits = this.o.keepWaits === false ? null : [];
      this.sysTimes = this.o.keepWaits === false ? null : [];
      this.hours = [];
      if (this.o.trace) { this.tr = { t: [], L: [], Lq: [], busy: [], on: [] }; this.dtS = Math.max(0.25, this.tEnd / 480); this.nextS = 0; }
    }

    /* ---------------- utilidades internas ---------------- */
    _push(type, t, data) { const e = { t, s: ++this.seq, type, x: false }; if (data) Object.assign(e, data); this.H.push(e); return e; }
    _emit(type, c, v) { if (this.emitFn) this.emitFn(type, c, v, this); }
    _hour(t) { const h = Math.max(0, Math.floor(t / 60)); while (this.hours.length <= h) this.hours.push({ arr: 0, ent: 0, srv: 0, ab: 0, balk: 0, block: 0, sumWq: 0, nWq: 0, slN: 0, slOk: 0, aQ: 0, aBusy: 0, aOn: 0, aSys: 0, dur: 0 }); return this.hours[h]; }
    // Indicadores de una etapa por hora: atendidos (por hora de término), espera y nivel de servicio (por hora de llegada a la etapa), ocupación
    _stH(st, t) { const h = Math.max(0, Math.floor(t / 60)); while (st.hs.length <= h) st.hs.push({ done: 0, n: 0, ok: 0, w: 0, ab: 0, aBusy: 0, aOn: 0, aQ: 0, dur: 0 }); return st.hs[h]; }
    _ov(a, b) { const x = Math.max(a, this.warm); return b > x ? b - x : 0; }
    get nqTot() { let s = 0; for (const st of this.st) s += st.nq; return s; }

    _advance(t) {
      const t0 = this.t; if (!(t > t0)) return;
      if (this.tr) {
        while (this.nextS <= t) {
          const tr = this.tr; tr.t.push(this.nextS); tr.L.push(this.inSys); tr.Lq.push(this.nqTot);
          let b = 0, o = 0; for (const st of this.st) { b += st.busy; o += st.on - st.down; } tr.busy.push(b); tr.on.push(o);
          this.nextS += this.dtS;
        }
      }
      const nq = this.nqTot; let busy = 0, on = 0; for (const st of this.st) { busy += st.busy; on += st.on - st.down; }
      let a = t0;
      while (a < t) {
        const h = Math.floor(a / 60); const b = Math.min(t, (h + 1) * 60); const d = b - a; const H = this._hour(a);
        H.aQ += nq * d; H.aBusy += busy * d; H.aOn += on * d; H.aSys += this.inSys * d; H.dur += d;
        for (const st of this.st) { const G = this._stH(st, a); G.aBusy += st.busy * d; G.aOn += (st.on - st.down) * d; G.aQ += st.nq * d; G.dur += d; }
        a = b;
      }
      const w0 = Math.max(t0, this.warm); const d = t - w0;
      if (d > 0) {
        this.S.aSys += this.inSys * d; this.S.T += d;
        for (const st of this.st) { st.aQ += st.nq * d; st.aBusy += st.busy * d; st.aOn += st.on * d; st.aDown += st.down * d; }
      }
    }

    /* ---------------- llegadas ---------------- */
    _initArrivals() {
      const a = this.spec.arrivals;
      switch (this.mode) {
        case 'poisson': this.iaMean = +a.rate > 0 ? 60 / +a.rate : Infinity; this._schedArr(this.rA.exp(this.iaMean)); break;
        case 'renewal': this.iaD = Dist.make(a.ia); this._schedArr(this.iaD.sample(this.rA)); break;
        case 'profile': {
          this.prof = (a.profile || []).map((x) => Math.max(0, +x || 0));
          this.lmax = Math.max(0, ...this.prof);
          // llegadas por tipo de cliente: arrivals.byClass[k] = clientes por hora del tipo k (superposición de procesos independientes)
          if (Array.isArray(a.byClass) && a.byClass.length === this.cls.length && a.byClass.some((p) => Array.isArray(p) && p.some((x) => +x > 0))) {
            this.profK = a.byClass.map((p) => (Array.isArray(p) ? p : []).map((x) => Math.max(0, +x || 0)));
            this.lmaxK = this.profK.map((p) => Math.max(0, ...p));
            this.profK.forEach((p, k) => this._schedArr(this._nextNHPP(0, k), 'm', k));
          } else this._schedArr(this._nextNHPP(0));
          break;
        }
        case 'appointments': {
          const ap = a.appt; const iv = Math.max(0.1, +ap.interval || 10);
          for (let ts = 0; ts < this.tEnd - 1e-9; ts += iv) {
            if (this.rA.random() < (+ap.noShow || 0)) { this.S.noShow++; continue; }
            const ta = Math.max(0, ts + (+ap.meanLate || 0) + (+ap.sdLate || 0) * this.rA.normal());
            this._push(APPT, ta, { slot: ts }); this.pending++;
          }
          if (+ap.walkin > 0) this._schedArr(this.rA.exp(60 / +ap.walkin), 'w');
          break;
        }
        case 'trace': { // llegadas reales: [[minuto desde la apertura, tipo de cliente, etiqueta], ...]
          for (const e of Array.isArray(a.trace) ? a.trace : []) {
            const ta = +e[0]; if (!(ta >= 0) || ta > this.tEnd) continue;
            this._push(APPT, ta, { k: Math.round(+e[1] || 0), tag: e[2] }); this.pending++;
          }
          break;
        }
        case 'finite': {
          const f = a.finite; this.thinkD = Dist.make(f.think); this.N = Math.max(1, Math.round(+f.N || 1));
          this.popAt = new Array(this.N).fill('pool');
          for (let i = 0; i < this.N; i++) { const t1 = this.thinkD.sample(this.rA); if (t1 <= this.tEnd) { this._push(POP, t1, { i }); this.pending++; } }
          break;
        }
        default: this.iaMean = 1; this._schedArr(this.rA.exp(1));
      }
    }
    _schedArr(t, src, k) { if (isFinite(t) && t <= this.tEnd) { this._push(ARR, t, { src: src || 'm', k }); this.pending++; } }
    // Adelgazamiento (Lewis y Shedler, 1979) sobre el perfil total o el del tipo k
    _nextNHPP(t, k) {
      const prof = k != null ? this.profK[k] : this.prof;
      const lmax = (k != null ? this.lmaxK[k] : this.lmax) / 60; if (!(lmax > 0)) return Infinity;
      for (let guard = 0; guard < 1e7; guard++) {
        t += this.rA.exp(1 / lmax);
        if (t > this.tEnd) return Infinity;
        const lam = (prof[Math.floor(t / 60)] || 0) / 60;
        if (this.rA.random() * lmax <= lam) return t;
      }
      return Infinity;
    }
    _newCust(pop, kk) {
      let k = 0;
      if (kk != null && kk >= 0 && kk < this.cls.length) k = kk;
      else { const r = this.rA.random(); while (k < this.cls.length - 1 && r > this.cls[k].cum) k++; }
      return { id: ++this.nid, k, prio: this.cls[k].prio, t0: this.t, first: this.t, att: 1, st: -1, q: 0, qT: 0, wq0: 0, wqAll: 0,
        svcT: 0, svc: 0, work: 0, rem: -1, sStart: 0, sEnd: 0, srv: null, state: 'new', abn: null, pop, w0: -1, ord: 0, visit: -1, pre: 0, s0: this._firstStage(k) };
    }
    _firstStage(k) { const v = this.cls[k].visits; if (!v) return 0; for (let s = 0; s < v.length; s++) if (v[s]) return s; return 0; }

    _arrive(c) {
      const t = this.t, rec = t >= this.warm; c.t0 = t; c.state = 'arr';
      this._hour(t).arr++; if (rec) { this.S.arr++; this.C[c.k].arr++; if (c.att > 1) this.S.retries++; }
      this._emit('arrive', c);
      if (this.inSys >= this.K) { this._lose(c, 'block'); return; }
      const st = this.st[c.s0];
      let qi = 0;
      if (st.multi) qi = this._chooseQueue(st, c);
      if (this.balk) {
        const free = st.multi ? this._freeAt(st, qi, c) : !!this._idleServer(st, c);
        if (!free) {
          const q = st.multi ? st.Q[qi].length : st.Q[0].length;
          const keep = QS.Analytic ? QS.Analytic.balkKeep(this.balk, q) : 1;
          if (this.rP.random() >= keep) { this._lose(c, 'balk'); return; }
        }
      }
      this.inSys++; if (rec) this.S.ent++; this._hour(t).ent++;
      this._join(c, c.s0, st.multi ? qi : 0);
    }

    _lose(c, kind) {
      const rec = c.t0 >= this.warm, H = this._hour(c.t0);
      if (kind === 'block') { if (rec) this.S.block++; H.block++; } else if (kind === 'balk') { if (rec) this.S.balk++; H.balk++; }
      this._emit(kind, c);
      this._afterLoss(c);
    }
    _afterLoss(c) {
      if (this.retryP > 0 && this.rP.random() < this.retryP) {
        const tr = this.t + this.rP.exp(this.retryMean);
        if (tr <= this.tEnd) { c.att++; c.state = 'orbit'; this._push(RETRY, tr, { c }); this.pending++; this._emit('orbit', c); return; }
      }
      c.state = 'lost';
      if (c.t0 >= this.warm) { this.S.lostFinal++; this.C[c.k].lost++; }
      this._toPop(c);
    }
    _toPop(c) {
      if (this.mode !== 'finite' || c.pop < 0) return;
      this.popAt[c.pop] = 'pool';
      const tn = this.t + this.thinkD.sample(this.rA);
      if (tn <= this.tEnd) { this._push(POP, tn, { i: c.pop }); this.pending++; }
    }

    /* ---------------- filas y servidores ---------------- */
    // ¿Puede el servidor v atender al cliente c? (servidores exclusivos)
    _allowed(st, v, c) {
      const d = st.ded; if (!d || !c) return true;
      if (v.i < d.n) return c.k === d.cls;
      return !(d.strict && c.k === d.cls);
    }
    _freeAt(st, qi, c) { const v = st.srv[qi]; return v.on && !v.down && !v.c && !v.leave && st.Q[qi].length === 0 && this._allowed(st, v, c); }
    _lineLen(st, v) { return st.Q[v.i].length + (v.c ? 1 : 0) + (v.down ? 2 : 0); }
    _chooseQueue(st, c) {
      const ok = st.srv.filter((v) => this._allowed(st, v, c));
      let cand = ok.filter((v) => v.on && !v.leave); if (!cand.length) cand = ok.length ? ok : st.srv;
      if (st.select === 'random') return cand[this.rM.int(cand.length)].i;
      if (st.select === 'rr') { for (let k = 1; k <= st.srv.length; k++) { const j = (st.rr + k) % st.srv.length; const v = st.srv[j]; if (cand.includes(v)) { st.rr = j; return j; } } return cand[0].i; }
      let best = Infinity, ties = [];
      for (const v of cand) { const n = this._lineLen(st, v); if (n < best) { best = n; ties = [v.i]; } else if (n === best) ties.push(v.i); }
      return ties.length === 1 ? ties[0] : ties[this.rM.int(ties.length)];
    }
    _idleServer(st, c) {
      let best = null, n = 0;
      for (const v of st.srv) {
        if (!v.on || v.down || v.c || v.leave || !this._allowed(st, v, c)) continue;
        n++;
        if (!best) { best = v; continue; }
        switch (st.assign) {
          case 'fast': if (v.speed > best.speed || (v.speed === best.speed && v.idle < best.idle)) best = v; break;
          case 'order': break;
          case 'random': if (this.rM.random() * n < 1) best = v; break; // muestreo uniforme de reservorio
          default: if (v.idle < best.idle) best = v;
        }
      }
      return best;
    }
    _svcSample(c, st) { const k = this.cls[c.k]; const f = k.svcMults && k.svcMults[st.i] > 0 ? k.svcMults[st.i] : k.svcMult; return st.svcD.sample(this.rS) * f; }

    _join(c, s, qi) {
      const st = this.st[s]; c.st = s; c.state = 'q';
      const vis = this.cls[c.k].visits;
      if (vis && !vis[s]) { // este tipo de cliente no pasa por esta etapa
        if (s + 1 < this.st.length) { this._join(c, s + 1); return; }
        this._depart(c); return;
      }
      if (s !== c.s0 && st.prob < 1 && this.rM.random() >= st.prob) {
        if (s + 1 < this.st.length) { this._join(c, s + 1); return; }
        this._depart(c); return;
      }
      c.svc = this._svcSample(c, st); c.rem = -1; c.visit = -1;
      if (st.multi && (qi === undefined || qi === null || s !== c.s0)) qi = this._chooseQueue(st, c);
      if (!st.multi) qi = 0;
      c.qT = this.t; c.ord = ++this.ord; c.q = qi;
      let srv = null;
      if (st.multi) { if (this._freeAt(st, qi, c)) srv = st.srv[qi]; }
      else srv = this._idleServer(st, c); // sin restricciones solo hay servidor libre si la fila está vacía
      if (!srv && st.preempt) srv = this._preemptFor(st, c, st.multi ? qi : -1);
      if (srv) { this._start(c, srv); return; }
      st.Q[qi].push(c); st.nq++;
      if (st.nq > st.maxQ) st.maxQ = st.nq;
      if (s === c.s0 && this.patD && !c.pre) c.abn = this._push(ABN, this.t + this.patD.sample(this.rP) * this.cls[c.k].patMult, { c });
      this._emit('queue', c);
    }

    _start(c, v) {
      const st = this.st[v.s], t = this.t;
      if (c.abn) { c.abn.x = true; c.abn = null; }
      const w = t - c.qT; c.wqAll += w; if (v.s === c.s0) c.wq0 += w;
      if (c.visit !== v.s) {
        c.visit = v.s;
        if (c.t0 >= this.warm) { st.nWq++; st.slN++; if (w <= this.slT + 1e-9) st.slOk++; const cs = this.CS[c.k][v.s]; cs.n++; cs.sum += w; }
        const G = this._stH(st, c.qT); G.n++; G.w += w; if (w <= this.slT + 1e-9) G.ok++;
      }
      if (c.t0 >= this.warm) st.sumWq += w;
      if (v.s === c.s0 && c.w0 < 0) {
        c.w0 = c.wq0;
        const H = this._hour(c.t0); H.slN++; if (c.w0 <= this.slT + 1e-9) H.slOk++;
        if (c.t0 >= this.warm) { this.S.slN++; this.C[c.k].slN++; if (c.w0 <= this.slT + 1e-9) { this.S.slOk++; this.C[c.k].slOk++; } if (c.w0 > 1e-9) this.S.waited++; }
      }
      v.c = c; c.srv = v; c.state = 's';
      const work = c.rem >= 0 ? c.rem : c.svc; c.rem = -1; c.work = work;
      const dur = work / v.speed; c.sStart = t; c.sEnd = t + dur;
      v.end = this._push(END, t + dur, { v });
      st.busy++; v.bSince = t;
      this._emit('start', c, v);
    }

    _preemptFor(st, c, qi) {
      let victim = null;
      const cand = qi >= 0 ? [st.srv[qi]] : st.srv;
      for (const v of cand) {
        if (!v.on || v.down || !v.c || !this._allowed(st, v, c)) continue;
        const x = v.c;
        if (x.prio > c.prio && (!victim || x.prio > victim.c.prio || (x.prio === victim.c.prio && x.sStart > victim.c.sStart))) victim = v;
      }
      if (!victim) return null;
      const v = victim, x = v.c, t = this.t;
      v.end.x = true; v.end = null;
      x.svcT += t - x.sStart; x.rem = Math.max(0, x.work - (t - x.sStart) * v.speed);
      v.busyT += this._ov(v.bSince, t); v.c = null; st.busy--; v.idle = t;
      x.state = 'q'; x.qT = t; x.pre++; x.srv = null;
      const qq = st.multi ? v.i : 0; st.Q[qq].push(x); x.q = qq; st.nq++;
      if (st.nq > st.maxQ) st.maxQ = st.nq;
      if (x.t0 >= this.warm) this.S.preempt++;
      this._emit('preempt', x, v);
      return v;
    }

    _pick(st, Q, v) {
      if (st.ded && v && !st.multi) { // fila única con servidores exclusivos: solo clientes que este servidor puede atender
        let b = -1;
        for (let i = 0; i < Q.length; i++) {
          const x = Q[i]; if (!this._allowed(st, v, x)) continue;
          if (b < 0) { b = i; if (st.disc === 'FIFO') break; continue; }
          const y = Q[b];
          switch (st.disc) {
            case 'LIFO': b = i; break;
            case 'SIRO': if (this.rM.random() < 0.5) b = i; break;
            case 'SPT': if ((x.rem >= 0 ? x.rem : x.svc) < (y.rem >= 0 ? y.rem : y.svc)) b = i; break;
            case 'PRIO': case 'PRIOP': if (x.prio < y.prio || (x.prio === y.prio && x.ord < y.ord)) b = i; break;
            default: break;
          }
        }
        return b;
      }
      switch (st.disc) {
        case 'LIFO': return Q.length - 1;
        case 'SIRO': return this.rM.int(Q.length);
        case 'SPT': { let b = 0; const w = (c) => (c.rem >= 0 ? c.rem : c.svc); for (let i = 1; i < Q.length; i++) if (w(Q[i]) < w(Q[b])) b = i; return b; }
        case 'PRIO': case 'PRIOP': { let b = 0; for (let i = 1; i < Q.length; i++) { const x = Q[i], y = Q[b]; if (x.prio < y.prio || (x.prio === y.prio && x.ord < y.ord)) b = i; } return b; }
        default: return 0; // FIFO: la fila se mantiene en orden de llegada (quien cambia de fila va al final)
      }
    }
    _pull(st, v) {
      if (!v.on || v.down || v.c || v.leave) return;
      const Q = st.multi ? st.Q[v.i] : st.Q[0];
      if (!Q.length) return;
      const idx = this._pick(st, Q, v); if (idx < 0) return;
      const c = Q[idx];
      if (idx === 0) Q.shift(); else Q.splice(idx, 1);
      st.nq--;
      this._start(c, v);
    }
    _jockey(st) {
      for (let guard = 0; guard < 200; guard++) {
        let vMax = null, nMax = -1;
        for (const v of st.srv) {
          if (!v.on || v.leave) continue;
          const n = this._lineLen(st, v);
          if (n > nMax && st.Q[v.i].length > 0) { nMax = n; vMax = v; }
        }
        if (!vMax) break;
        const last = st.Q[vMax.i][st.Q[vMax.i].length - 1];
        let vMin = null, nMin = Infinity;
        for (const v of st.srv) {
          if (!v.on || v.leave || !this._allowed(st, v, last)) continue;
          const n = this._lineLen(st, v); if (n < nMin) { nMin = n; vMin = v; }
        }
        if (!vMin || nMax - nMin < 2) break;
        const c = st.Q[vMax.i].pop(); c.q = vMin.i; st.Q[vMin.i].push(c);
        if (c.t0 >= this.warm) this.S.jock++;
        this._emit('jockey', c);
        if (!vMin.c && !vMin.down && st.Q[vMin.i].length === 1 && vMin.on && !vMin.leave) {
          st.Q[vMin.i].pop(); st.nq--; this._start(c, vMin);
        }
      }
    }
    _depart(c) {
      const t = this.t; this.inSys--; c.state = 'out';
      const W = t - c.t0;
      if (c.t0 >= this.warm) {
        const S = this.S; S.served++; S.sumW += W; S.sumWq += c.wqAll; S.sumWq0 += c.wq0; S.sumSvc += c.svcT;
        const K = this.C[c.k]; K.served++; K.sumWq += c.wqAll; K.sumW += W;
        if (this.waits) { this.waits.push(c.wqAll); this.sysTimes.push(W); }
      }
      const H = this._hour(c.t0); H.srv++; H.sumWq += c.wqAll; H.nWq++;
      this._emit('depart', c);
      this._toPop(c);
    }
    _offShift(st, v) {
      if (!v.on) return;
      v.on = false; v.leave = false; st.on--; v.onT += this._ov(v.onSince, this.t);
      this._emit('off', null, v);
      if (st.multi && st.Q[v.i].length) {
        const moving = st.Q[v.i].splice(0); st.nq -= moving.length;
        const avail = st.srv.some((x) => x.on && !x.leave);
        for (const c of moving) {
          if (!avail) { st.Q[v.i].push(c); st.nq++; continue; }
          const qi = this._chooseQueue(st, c); c.q = qi;
          if (this._freeAt(st, qi, c)) { this._start(c, st.srv[qi]); } else { st.Q[qi].push(c); st.nq++; }
          this._emit('jockey', c);
        }
      }
    }
    _setServers(st, n) {
      let active = 0; for (const v of st.srv) if (v.on && !v.leave) active++;
      if (n > active) {
        for (const v of st.srv) { if (active >= n) break; if (v.on && v.leave) { v.leave = false; active++; } }
        for (const v of st.srv) {
          if (active >= n) break;
          if (!v.on) { v.on = true; v.onSince = this.t; v.idle = this.t; st.on++; active++; this._emit('on', null, v); this._pull(st, v); }
        }
        if (st.multi) this._jockey(st);
      } else if (n < active) {
        for (let j = st.srv.length - 1; j >= 0 && active > n; j--) {
          const v = st.srv[j]; if (!v.on || v.leave) continue;
          if (v.c || v.down) v.leave = true; else this._offShift(st, v);
          active--;
        }
      }
    }
    _initSchedules() {
      this.st.forEach((st) => {
        if (!st.sched) return;
        const hEnd = Math.min(st.sched.length, Math.ceil(this.tEnd / 60));
        for (let h = 1; h < hEnd; h++) if (st.sched[h] !== st.sched[h - 1]) this._push(SCH, h * 60, { si: st.i, n: st.sched[h] });
        // Después del cierre se mantiene el último valor; si era 0, queda al menos un servidor para atender a los que siguen en fila.
        if (this.drain && !(st.sched[hEnd - 1] > 0)) this._push(SCH, this.tEnd, { si: st.i, n: 1 });
      });
    }
    _initFailures() {
      const f = this.spec.fail; if (!f || !f.on) return;
      this.mtbf = Math.max(1, +f.mtbf || 240); this.mttr = Math.max(0.1, +f.mttr || 10);
      for (const st of this.st) for (const v of st.srv) v.failEv = this._push(FAIL, this.rF.exp(this.mtbf), { v });
    }

    /* ---------------- ciclo principal ---------------- */
    _handle(ev) {
      const t = this.t;
      switch (ev.type) {
        case ARR: {
          this.pending--;
          if (ev.src === 'w') this._schedArr(t + this.rA.exp(60 / +this.spec.arrivals.appt.walkin), 'w');
          else if (this.mode === 'poisson') this._schedArr(t + this.rA.exp(this.iaMean));
          else if (this.mode === 'renewal') this._schedArr(t + this.iaD.sample(this.rA));
          else if (this.mode === 'profile') this._schedArr(this._nextNHPP(t, ev.k), 'm', ev.k);
          const n = this.batchD.sample(this.rA);
          for (let i = 0; i < n; i++) this._arrive(this._newCust(-1, ev.k));
          break;
        }
        case APPT: { this.pending--; const c = this._newCust(-1, ev.k); if (ev.tag !== undefined) c.tag = ev.tag; this._arrive(c); break; }
        case POP: { this.pending--; this.popAt[ev.i] = 'sys'; this._arrive(this._newCust(ev.i)); break; }
        case RETRY: { this.pending--; this._arrive(ev.c); break; }
        case END: {
          const v = ev.v, st = this.st[v.s], c = v.c;
          v.end = null; v.c = null; st.busy--; v.n++; v.busyT += this._ov(v.bSince, t); v.idle = t;
          c.svcT += t - c.sStart; if (c.t0 >= this.warm) st.served++;
          this._stH(st, t).done++;
          this._emit('end', c, v);
          if (v.s + 1 < this.st.length) this._join(c, v.s + 1); else this._depart(c);
          if (v.leave) this._offShift(st, v); else this._pull(st, v);
          if (st.jockey) this._jockey(st);
          break;
        }
        case ABN: {
          const c = ev.c; if (c.state !== 'q') break;
          const st = this.st[c.st], Q = st.Q[c.q]; const i = Q.indexOf(c); if (i < 0) break;
          Q.splice(i, 1); st.nq--; this.inSys--; c.abn = null;
          const w = t - c.qT; c.wqAll += w; c.wq0 += w;
          const rec = c.t0 >= this.warm;
          if (rec) { this.S.ab++; this.S.sumWab += c.wqAll; this.C[c.k].ab++; }
          this._hour(c.t0).ab++;
          { const G = this._stH(st, c.qT); G.n++; G.ab++; }
          this._emit('abandon', c);
          this._afterLoss(c);
          if (st.jockey) this._jockey(st);
          break;
        }
        case SCH: { this._setServers(this.st[ev.si], ev.n); break; }
        case FAIL: {
          const v = ev.v, st = this.st[v.s];
          if (!v.on || v.down) { v.failEv = this._push(FAIL, t + this.rF.exp(this.mtbf), { v }); break; }
          v.down = true; st.down++;
          if (v.c) { const c = v.c; v.end.x = true; v.end = null; c.svcT += t - c.sStart; c.rem = Math.max(0, c.work - (t - c.sStart) * v.speed); st.busy--; v.busyT += this._ov(v.bSince, t); c.state = 'p'; }
          this._push(REP, t + this.rF.exp(this.mttr), { v });
          this._emit('fail', v.c, v);
          if (st.jockey) this._jockey(st);
          break;
        }
        case REP: {
          const v = ev.v, st = this.st[v.s];
          v.down = false; st.down--;
          if (v.c) { const c = v.c; c.state = 's'; c.work = c.rem; c.rem = -1; c.sStart = t; c.sEnd = t + c.work / v.speed; v.end = this._push(END, c.sEnd, { v }); st.busy++; v.bSince = t; }
          else if (v.leave) this._offShift(st, v);
          else { v.idle = t; this._pull(st, v); }
          v.failEv = this._push(FAIL, t + this.rF.exp(this.mtbf), { v });
          this._emit('repair', v.c, v);
          if (st.jockey) this._jockey(st);
          break;
        }
        default: break;
      }
      if (t >= this.warm) {
        if (this.inSys > this.S.maxSys) this.S.maxSys = this.inSys;
        const nq = this.nqTot; if (nq > this.S.maxQ) this.S.maxQ = nq;
      }
    }

    // Procesa hasta maxEv eventos. Devuelve false cuando la simulación terminó.
    step(maxEv) {
      if (this.done) return false;
      let n = 0;
      while (n < maxEv) {
        const ev = this.H.peek();
        if (!ev) { this._finish(); return false; }
        if (ev.x) { this.H.pop(); continue; }
        if (!this.drain && ev.t > this.tEnd) { this._finish(); return false; }
        if (ev.t > this.tHard) { this.truncated = true; this._finish(); return false; }
        this.H.pop();
        this._advance(ev.t); this.t = ev.t;
        this._handle(ev); n++;
        if (this.pending === 0 && this.inSys === 0) { this._finish(); return false; }
        if (this.inSys > this.maxSys) { this.unstable = true; this._finish(); return false; }
      }
      return true;
    }
    // Avanza el reloj hasta T (para la animación)
    runUntil(T) {
      while (!this.done) {
        let ev = this.H.peek();
        while (ev && ev.x) { this.H.pop(); ev = this.H.peek(); }
        if (!ev) { this._finish(); break; }
        if (ev.t > T) {
          const tt = this.drain ? T : Math.min(T, this.tEnd);
          if (tt > this.t) { this._advance(tt); this.t = tt; }
          if (!this.drain && this.t >= this.tEnd) this._finish();
          break;
        }
        this.step(1);
      }
    }
    runAll() { while (this.step(1e6)); return this.results(); }

    _finish() {
      if (this.done) return;
      let tf = this.t;
      if (!this.drain || (this.pending === 0 && this.inSys === 0)) tf = Math.max(tf, this.tEnd);
      if (!this.drain) tf = Math.min(tf, this.tEnd);
      if (this.truncated) tf = Math.min(Math.max(this.t, this.tEnd), this.tHard);
      this._advance(tf); this.t = tf;
      for (const st of this.st) for (const v of st.srv) {
        if (v.c && !v.down) v.busyT += this._ov(v.bSince, tf);
        if (v.on) v.onT += this._ov(v.onSince, tf);
      }
      this.done = true;
      this._emit('done', null, null);
    }

    /* ---------------- resultados ---------------- */
    results() {
      const S = this.S, T = Math.max(S.T, 1e-9), hrs = T / 60, cost = this.spec.cost || {};
      let aBusy = 0, aAvail = 0, aOn = 0, aQ = 0;
      const stages = this.st.map((st) => {
        aBusy += st.aBusy; aAvail += st.aOn - st.aDown; aOn += st.aOn; aQ += st.aQ;
        return {
          name: st.name, c: st.srv.length, Lq: st.aQ / T, util: st.aOn - st.aDown > 0 ? st.aBusy / (st.aOn - st.aDown) : NaN,
          Wq: st.nWq ? st.sumWq / st.nWq : NaN, SL: st.slN ? st.slOk / st.slN : NaN, visits: st.nWq, served: st.served, maxQ: st.maxQ, avgServers: st.aOn / T,
          servers: st.srv.map((v) => ({ i: v.i, util: v.onT > 0 ? v.busyT / v.onT : NaN, served: v.n, speed: v.speed })),
          hourly: st.hs.map((x, h) => ({ h, done: x.done, n: x.n, ok: x.ok, w: x.w, ab: x.ab, aBusy: x.aBusy, aOn: x.aOn, aQ: x.aQ, dur: x.dur }))
        };
      });
      const ws = this.waits ? Float64Array.from(this.waits).sort() : new Float64Array(0);
      const wsys = this.sysTimes ? Float64Array.from(this.sysTimes).sort() : new Float64Array(0);
      const q = (p) => (ws.length ? U.quantileSorted(ws, p) : NaN);
      const costServers = (aOn / 60) * (+cost.server || 0), costWait = (aQ / 60) * (+cost.wait || 0), costLost = S.lostFinal * (+cost.lost || 0);
      const totalCost = costServers + costWait + costLost;
      const hourly = this.hours.map((H, h) => ({
        h, arr: H.arr, ent: H.ent, served: H.srv, ab: H.ab, balk: H.balk, block: H.block,
        wq: H.nWq ? H.sumWq / H.nWq : NaN, sl: H.slN + H.ab ? H.slOk / (H.slN + H.ab) : NaN,
        lq: H.dur > 0 ? H.aQ / H.dur : NaN, L: H.dur > 0 ? H.aSys / H.dur : NaN, util: H.aOn > 0 ? H.aBusy / H.aOn : NaN, servers: H.dur > 0 ? H.aOn / H.dur : NaN
      }));
      const perClass = this.cls.map((k, i) => {
        const C = this.C[i];
        return { name: k.name, prio: k.prio, arr: C.arr, served: C.served, ab: C.ab, lost: C.lost,
          Wq: C.served ? C.sumWq / C.served : NaN, W: C.served ? C.sumW / C.served : NaN, SL: C.slN + C.ab ? C.slOk / (C.slN + C.ab) : NaN,
          stageWq: this.CS[i].map((x) => (x.n ? x.sum / x.n : NaN)) };
      });
      return {
        T, hours: hrs, tEnd: this.tEnd, tFinal: this.t, overtime: Math.max(0, this.t - this.tEnd), truncated: this.truncated, unstable: this.unstable,
        arrivals: S.arr, entered: S.ent, served: S.served, aband: S.ab, balk: S.balk, block: S.block, retries: S.retries, lost: S.lostFinal,
        preempt: S.preempt, jockeys: S.jock, noShow: S.noShow, inSystemEnd: this.inSys,
        lamHat: S.arr / (Math.max(this.tEnd - this.warm, 1e-9) / 60), thr: S.served / hrs,
        L: S.aSys / T, Lq: aQ / T,
        W: S.served ? S.sumW / S.served : NaN, Wq: S.served ? S.sumWq / S.served : NaN,
        WqAll: S.served + S.ab ? (S.sumWq + S.sumWab) / (S.served + S.ab) : NaN,
        svc: S.served ? S.sumSvc / S.served : NaN,
        SL: S.slN + S.ab ? S.slOk / (S.slN + S.ab) : NaN,
        Pwait: S.slN + S.ab ? (S.waited + S.ab) / (S.slN + S.ab) : NaN,
        Pab: S.ent ? S.ab / S.ent : 0, Pbalk: S.arr ? S.balk / S.arr : 0, Pblock: S.arr ? S.block / S.arr : 0,
        Plost: S.arr ? (S.balk + S.block + S.ab) / S.arr : 0,
        util: aAvail > 0 ? aBusy / aAvail : NaN, util0: stages[0].util, avgServers: aOn / T,
        wqP50: q(0.5), wqP90: q(0.9), wqP95: q(0.95), wqP99: q(0.99), wqMax: ws.length ? ws[ws.length - 1] : NaN,
        wP90: wsys.length ? U.quantileSorted(wsys, 0.9) : NaN,
        maxQ: S.maxQ, maxSys: S.maxSys,
        costServers, costWait, costLost, costTotal: totalCost, costHour: totalCost / hrs,
        stages, perClass, hourly, trace: this.tr || null, waits: this.waits ? this.waits : null
      };
    }
  }

  /* ------------------ Réplicas e intervalos de confianza ------------------ */
  const KEYS = ['L', 'Lq', 'W', 'Wq', 'WqAll', 'svc', 'SL', 'Pwait', 'Pab', 'Pbalk', 'Pblock', 'Plost', 'thr', 'lamHat', 'util', 'util0',
    'avgServers', 'wqP50', 'wqP90', 'wqP95', 'wqP99', 'wqMax', 'wP90', 'maxQ', 'maxSys', 'overtime', 'costServers', 'costWait', 'costLost',
    'costTotal', 'costHour', 'arrivals', 'entered', 'served', 'aband', 'balk', 'block', 'retries', 'lost', 'preempt', 'jockeys'];
  function summarize(vals) {
    const v = vals.filter((x) => typeof x === 'number' && isFinite(x)); const n = v.length;
    if (!n) return { mean: NaN, sd: NaN, hw: NaN, n: 0, min: NaN, max: NaN };
    const mean = U.mean(v); const sd = n > 1 ? U.sd(v) : 0;
    const hw = n > 1 ? U.tInv(0.975, n - 1) * sd / Math.sqrt(n) : NaN;
    return { mean, sd, hw, n, min: Math.min(...v), max: Math.max(...v) };
  }
  function aggregate(list) {
    const agg = { reps: list.length, m: {}, first: list[0] };
    for (const k of KEYS) agg.m[k] = summarize(list.map((r) => r[k]));
    const H = Math.max(...list.map((r) => r.hourly.length));
    agg.hourly = U.range(H, (h) => {
      const row = { h };
      for (const k of ['arr', 'ent', 'served', 'ab', 'balk', 'block', 'wq', 'sl', 'lq', 'L', 'util', 'servers']) {
        const v = list.map((r) => (r.hourly[h] ? r.hourly[h][k] : (['wq', 'sl', 'util'].includes(k) ? NaN : 0))).filter((x) => isFinite(x));
        row[k] = v.length ? U.mean(v) : NaN;
      }
      return row;
    });
    agg.stages = list[0].stages.map((s, i) => ({
      name: s.name, c: s.c,
      Lq: summarize(list.map((r) => r.stages[i].Lq)), util: summarize(list.map((r) => r.stages[i].util)), Wq: summarize(list.map((r) => r.stages[i].Wq)),
      SL: summarize(list.map((r) => r.stages[i].SL)), visits: U.mean(list.map((r) => r.stages[i].visits)),
      servers: s.servers.map((v, j) => ({ i: j, util: U.mean(list.map((r) => r.stages[i].servers[j].util).filter(isFinite)), served: U.mean(list.map((r) => r.stages[i].servers[j].served)), speed: v.speed })),
      hourly: U.range(Math.max(0, ...list.map((r) => (r.stages[i].hourly || []).length)), (h) => {
        const t = { done: 0, n: 0, ok: 0, w: 0, ab: 0, aBusy: 0, aOn: 0, aQ: 0, dur: 0 }; const sl = [];
        for (const r of list) { const x = (r.stages[i].hourly || [])[h]; if (!x) continue; for (const k in t) t[k] += x[k]; if (x.n) sl.push(x.ok / x.n); }
        const R = list.length;
        // nivel de servicio agrupado (Σ a tiempo / Σ clientes) y su dispersión entre réplicas
        return { h, done: t.done / R, n: t.n / R, sl: t.n ? t.ok / t.n : NaN, slSd: sl.length > 1 ? U.sd(sl) : NaN, wq: t.n - t.ab > 0 ? t.w / (t.n - t.ab) : NaN,
          ab: t.ab / R, util: t.aOn > 0 ? t.aBusy / t.aOn : NaN, servers: t.dur > 0 ? t.aOn / t.dur : NaN, lq: t.dur > 0 ? t.aQ / t.dur : NaN };
      })
    }));
    agg.perClass = list[0].perClass.map((c, i) => ({
      name: c.name, prio: c.prio,
      Wq: summarize(list.map((r) => r.perClass[i].Wq)), W: summarize(list.map((r) => r.perClass[i].W)), SL: summarize(list.map((r) => r.perClass[i].SL)),
      served: U.mean(list.map((r) => r.perClass[i].served)), ab: U.mean(list.map((r) => r.perClass[i].ab)), lost: U.mean(list.map((r) => r.perClass[i].lost)),
      stageWq: c.stageWq.map((x, s) => { const v = list.map((r) => r.perClass[i].stageWq[s]).filter(isFinite); return v.length ? U.mean(v) : NaN; })
    }));
    const pooled = []; for (const r of list) { if (r.waits) for (const w of r.waits) { pooled.push(w); if (pooled.length > 250000) break; } if (pooled.length > 250000) break; }
    agg.waits = pooled;
    agg.unstable = list.some((r) => r.unstable); agg.truncated = list.some((r) => r.truncated);
    return agg;
  }

  // Ejecuta réplicas en bloques sin congelar la interfaz
  async function runReps(spec, opts = {}) {
    const ns = normalize(spec);
    const reps = Math.max(1, Math.round(opts.reps || ns.run.reps || 10));
    const list = [];
    for (let r = 0; r < reps; r++) {
      if (opts.cancel && opts.cancel()) break;
      const sim = new Sim(ns, `${ns.run.seed}-${r}`, { trace: r === 0, keepWaits: r < 6, maxSys: opts.maxSys });
      while (sim.step(30000)) { await U.tick(); if (opts.cancel && opts.cancel()) break; }
      list.push(sim.results());
      if (opts.onProgress) opts.onProgress((r + 1) / reps, list[list.length - 1]);
      await U.tick();
    }
    return list.length ? aggregate(list) : null;
  }
  function runRepsSync(spec, reps, opts = {}) {
    const ns = normalize(spec); const list = [];
    for (let r = 0; r < reps; r++) { const sim = new Sim(ns, `${ns.run.seed}-${r}`, Object.assign({ keepWaits: r < 3 }, opts)); list.push(sim.runAll()); }
    return aggregate(list);
  }

  // Notación de Kendall A/B/c/K/N/D del escenario
  function kendall(specIn) {
    const s = normalize(specIn); const a = s.arrivals, st = s.stages;
    let A = 'M';
    if (a.mode === 'renewal') A = Dist.make(a.ia).kendall; else if (a.mode === 'profile') A = 'M(t)'; else if (a.mode === 'appointments') A = 'D+';
    if (a.batch && a.batch.type !== 'none') A += 'ˣ';
    const fmtStage = (x) => {
      const B = Dist.make(x.svc).kendall; const c = x.useSchedule && x.schedule && x.schedule.length ? 'c(t)' : x.servers;
      return `${B}/${c}`;
    };
    let core = st.length === 1 ? `${A}/${fmtStage(st[0])}` : `${A}/[${st.map(fmtStage).join(' → ')}]`;
    const K = +s.capacity > 0 ? s.capacity : '∞';
    const N = a.mode === 'finite' ? a.finite.N : '∞';
    const D = { FIFO: 'FIFO', LIFO: 'LIFO', SIRO: 'SIRO', PRIO: 'PRI', PRIOP: 'PRI-E', SPT: 'SPT' }[st[0].disc] || 'FIFO';
    let k = `${core}/${K}/${N}/${D}`;
    if (s.renege && s.renege.on) k += ' +' + Dist.make(s.renege.dist).kendall;
    return k;
  }

  QS.Sim = Sim;
  Sim.defaults = defaults; Sim.normalize = normalize; Sim.aggregate = aggregate; Sim.runReps = runReps; Sim.runRepsSync = runRepsSync;
  Sim.kendall = kendall; Sim.KEYS = KEYS; Sim.summarize = summarize;
})(typeof window !== 'undefined' ? window : globalThis);
