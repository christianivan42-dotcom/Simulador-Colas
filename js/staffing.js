/* Dimensionamiento de personal: requerimientos por intervalo (Erlang C / Erlang A), merma (shrinkage),
   programación de turnos por día con programación entera (javascript-lp-solver, github.com/JWally/jsLPSolver)
   y conversión a plantilla semanal (FTE y personas a contratar). */
(function (root) {
  'use strict';
  const QS = root.QS = root.QS || {};
  const U = QS.U, A = QS.Analytic;
  const ST = QS.Staff = {};

  // target: {type:'sl'|'asa'|'pwait'|'pab', pct, tMin, max}; maxOcc (0-1); patienceMin (0 = Erlang C)
  ST.required = function (lamH, ahtMin, cfg) {
    if (!(lamH > 0) || !(ahtMin > 0)) return { c: 0, a: 0, sl: 1, asa: 0, occ: 0, pab: 0, pw: 0 };
    const mu = 60 / ahtMin, theta = cfg.patienceMin > 0 ? 60 / cfg.patienceMin : 0;
    const tg = cfg.target || { type: 'sl', pct: 0.8, tMin: 1 / 3 };
    const t = { maxOcc: cfg.maxOcc > 0 && cfg.maxOcc < 1 ? cfg.maxOcc : null };
    switch (tg.type) {
      case 'asa': Object.assign(t, { type: 'asa', value: tg.max / 60 }); break;
      case 'pwait': Object.assign(t, { type: 'pwait', value: tg.max }); break;
      case 'pab': Object.assign(t, { type: 'pab', value: tg.max }); break;
      default: Object.assign(t, { type: 'sl', value: tg.pct, t: tg.tMin / 60 });
    }
    const res = A.requiredServers(lamH, mu, t, theta);
    const r = res.r; const T = (tg.tMin || 0) / 60;
    return { c: res.c, a: lamH / mu, sl: r && r.sl ? r.sl(T) : NaN, asa: r ? r.Wq * 60 : NaN, occ: r ? r.util : NaN, pab: r ? r.Pab || 0 : 0, pw: r ? r.Pw : NaN };
  };
  ST.erlangTable = function (lamH, ahtMin, cfg, from, n = 12) {
    const mu = 60 / ahtMin, theta = cfg.patienceMin > 0 ? 60 / cfg.patienceMin : 0; const T = (cfg.target && cfg.target.tMin || 0) / 60;
    const a = lamH / mu; const c0 = from || Math.max(1, Math.floor(a * (theta > 0 ? 0.8 : 1)) + (theta > 0 ? 0 : 1));
    return U.range(n, (i) => {
      const c = c0 + i; const r = theta > 0 ? A.compute('erlangA', { lam: lamH, mu, c, theta }) : A.compute('mmc', { lam: lamH, mu, c });
      return { c, ok: r.ok, sl: r.ok && r.sl ? r.sl(T) : NaN, asa: r.ok ? r.Wq * 60 : NaN, occ: r.ok ? r.util : NaN, pw: r.ok ? r.Pw : NaN, pab: r.ok ? r.Pab || 0 : NaN };
    });
  };

  /* ---------------- turnos de un día ---------------- */
  // req: requerimiento por periodo (personas en piso), periodos de 'step' minutos desde la apertura.
  // cfg: {ftLen (h), ptLen (h), allowPT, ftCost (/h), ptCost (/h), maxPT (fracción de horas), step (min)}
  ST.dayShifts = function (req, cfg) {
    const step = cfg.step || 60, per = 60 / step, P = req.length;
    if (!P || Math.max(...req) <= 0) return { shifts: [], cover: new Array(P).fill(0), hours: 0, cost: 0, method: 'vacío' };
    const types = [];
    const ftP = Math.min(P, Math.round((cfg.ftLen || 8) * per));
    types.push({ id: 'C', name: 'Jornada completa', len: ftP, cost: (cfg.ftCost || 1) });
    if (cfg.allowPT !== false && cfg.ptLen > 0) { const ptP = Math.min(P, Math.round(cfg.ptLen * per)); if (ptP < ftP) types.push({ id: 'M', name: 'Medio tiempo', len: ptP, cost: (cfg.ptCost || cfg.ftCost || 1) }); }
    const startStep = Math.max(1, Math.round((cfg.startEvery || 60) / step));
    const cand = [];
    for (const ty of types) {
      const starts = new Set();
      for (let s = 0; s + ty.len <= P; s += startStep) starts.add(s);
      starts.add(P - ty.len);
      for (const s of starts) cand.push({ ty, s, name: `${ty.id}_${s}` });
    }
    let sol = null, method = 'greedy';
    if (root.solver && typeof root.solver.Solve === 'function' && cand.length <= 400) {
      try {
        const model = { optimize: 'costo', opType: 'min', constraints: {}, variables: {}, ints: {}, options: { timeout: 4000, tolerance: 0.01 } };
        for (let p = 0; p < P; p++) if (req[p] > 0) model.constraints['p' + p] = { min: req[p] };
        if (types.length > 1 && cfg.maxPT != null && cfg.maxPT < 1) model.constraints.mezcla = { max: 0 };
        for (const c of cand) {
          const v = { costo: c.ty.cost * c.ty.len / per };
          for (let p = c.s; p < c.s + c.ty.len; p++) if (req[p] > 0) v['p' + p] = 1;
          if (model.constraints.mezcla) v.mezcla = c.ty.id === 'M' ? (1 - cfg.maxPT) * c.ty.len : -cfg.maxPT * c.ty.len;
          model.variables[c.name] = v; model.ints[c.name] = 1;
        }
        const res = root.solver.Solve(model);
        if (res && res.feasible) { sol = cand.map((c) => ({ c, n: Math.round(res[c.name] || 0) })).filter((x) => x.n > 0); method = 'programación entera'; }
      } catch (e) { sol = null; }
    }
    if (!sol) { // voraz de izquierda a derecha con jornada completa (óptimo para una sola duración)
      const cover = new Array(P).fill(0); sol = [];
      const ty = types[0];
      for (let p = 0; p < P; p++) {
        const def = req[p] - cover[p];
        if (def > 0) {
          const s = Math.min(p, P - ty.len);
          const c = cand.find((x) => x.ty === ty && x.s === s) || { ty, s, name: `${ty.id}_${s}` };
          sol.push({ c, n: def });
          for (let q = s; q < s + ty.len; q++) cover[q] += def;
        }
      }
    }
    const cover = new Array(P).fill(0); let hours = 0, cost = 0;
    const shifts = sol.map(({ c, n }) => {
      for (let p = c.s; p < c.s + c.ty.len; p++) cover[p] += n;
      hours += n * c.ty.len / per; cost += n * c.ty.cost * c.ty.len / per;
      return { type: c.ty.id, name: c.ty.name, start: c.s, len: c.ty.len, n };
    }).sort((x, y) => x.start - y.start || x.type.localeCompare(y.type));
    const reqHours = req.reduce((s, x) => s + x, 0) / per;
    return { shifts, cover, hours, cost, reqHours, efficiency: hours > 0 ? reqHours / hours : NaN, method };
  };

  // Plantilla semanal a partir de los turnos de cada día
  ST.headcount = function (days, cfg) {
    const ft = days.map((d) => d.shifts.filter((s) => s.type === 'C').reduce((a, s) => a + s.n, 0));
    const pt = days.map((d) => d.shifts.filter((s) => s.type === 'M').reduce((a, s) => a + s.n, 0));
    const dFT = cfg.daysFT || 6, dPT = cfg.daysPT || dFT;
    const nFT = ft.length ? Math.max(Math.max(...ft), Math.ceil(U.sum(ft) / dFT)) : 0;
    const nPT = pt.length ? Math.max(Math.max(...pt), Math.ceil(U.sum(pt) / dPT)) : 0;
    const hours = days.reduce((a, d) => a + d.hours, 0);
    const fte = cfg.weekHours > 0 ? hours / cfg.weekHours : NaN;
    return { nFT, nPT, total: nFT + nPT, hours, fte, ftShifts: ft, ptShifts: pt, cost: days.reduce((a, d) => a + d.cost, 0) };
  };
})(typeof window !== 'undefined' ? window : globalThis);
