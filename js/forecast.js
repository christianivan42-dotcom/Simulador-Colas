/* Pronóstico de demanda y plan de personal por temporada.
   - Regresión armónica diaria (enfoque de Prophet, Taylor & Letham 2018): tendencia por tramos, Fourier anual,
     día de la semana, quincenas y eventos, ajustada en escala logarítmica con regularización ridge.
   - Holt-Winters multiplicativo mensual y un método ingenuo estacional como referencia.
   - Plan de personal: demanda por mes, día y hora → Erlang → merma → turnos → plantilla. */
(function (root) {
  'use strict';
  const QS = root.QS = root.QS || {};
  const U = QS.U, AN = QS.Analysis, ST = QS.Staff;
  const FC = QS.Forecast = {};

  /* ---------------- regresión armónica diaria ---------------- */
  function featFn(R, cps, evIds, K) {
    return (k) => {
      const inf = U.dayInfo(k); const t = (k - R.k0) / 365.25;
      const f = [1, t];
      for (const c of cps) f.push(Math.max(0, t - c));
      for (let j = 1; j <= K; j++) { const a = 2 * Math.PI * j * (inf.doy + 0.5) / 365.25; f.push(Math.sin(a), Math.cos(a)); }
      for (let w = 1; w < 7; w++) f.push(inf.dow === w ? 1 : 0);
      const d = inf.d, last = inf.dim;
      f.push(d <= 2 ? 1 : 0, d === 15 || d === 16 ? 1 : 0, d === last ? 1 : 0, d === 14 || d === 17 || d === last - 1 ? 1 : 0);
      const ev = R.evMap.get(k); for (const id of evIds) f.push(ev === id ? 1 : 0);
      return f;
    };
  }
  FC.harmonic = function (R, opts = {}) {
    const trainEnd = opts.trainEnd != null ? opts.trainEnd : R.k1;
    const K = opts.fourier || 6;
    const evIds = R.events.filter((e) => e.on).map((e) => e.id);
    const T = (trainEnd - R.k0) / 365.25;
    const nCp = T > 1.5 ? Math.min(8, Math.floor(T * 2)) : 0;
    const cps = U.range(nCp, (i) => ((i + 1) * T * 0.8) / (nCp + 1));
    const F = featFn(R, cps, evIds, K);
    const rows = [], yv = [];
    for (let k = R.k0; k <= trainEnd; k++) { const v = R.y[k - R.k0]; if (!(v > 0)) continue; rows.push(F(k)); yv.push(Math.log(v)); }
    if (rows.length < 30) return null;
    const p = rows[0].length, n = rows.length;
    const XtX = U.range(p, () => new Array(p).fill(0)), Xty = new Array(p).fill(0);
    for (let r = 0; r < n; r++) { const x = rows[r], yy = yv[r]; for (let i = 0; i < p; i++) { const xi = x[i]; if (!xi) continue; Xty[i] += xi * yy; for (let j = i; j < p; j++) XtX[i][j] += xi * x[j]; } }
    for (let i = 0; i < p; i++) for (let j = 0; j < i; j++) XtX[i][j] = XtX[j][i];
    for (let i = 0; i < p; i++) { const pen = i < 2 ? 1e-6 : i < 2 + nCp ? 0.3 * n : 0.5; XtX[i][i] += pen; }
    const beta = U.solveSPD(XtX, Xty);
    const pred = (k) => { const f = F(k); let s = 0; for (let i = 0; i < p; i++) s += f[i] * beta[i]; return s; };
    let ss = 0; for (let r = 0; r < n; r++) { let s = 0; for (let i = 0; i < p; i++) s += rows[r][i] * beta[i]; ss += (yv[r] - s) ** 2; }
    const sigma = Math.sqrt(ss / Math.max(1, n - p));
    const evEffects = evIds.map((id, j) => ({ id, effect: Math.exp(beta[2 + nCp + 2 * K + 6 + 4 + j]) }));
    return { beta, sigma, cps, nCp, K, trainEnd, evEffects, n, p,
      log: pred, mean: (k) => Math.exp(pred(k) + sigma * sigma / 2),
      interval: (k, z = 1.645) => { const hz = Math.max(0, (k - trainEnd) / 365.25); const s = sigma * Math.sqrt(1 + 0.6 * hz); const m = pred(k); return [Math.exp(m - z * s), Math.exp(m + z * s)]; } };
  };

  /* ---------------- Holt-Winters multiplicativo (mensual) ---------------- */
  FC.holtWinters = function (vals, m = 12, H = 12) {
    const n = vals.length; if (n < 2 * m || vals.some((x) => !(x > 0))) return null;
    const run = (a, b, g, keep) => {
      let L = U.mean(vals.slice(0, m)); let B = (U.mean(vals.slice(m, 2 * m)) - L) / m; const S = vals.slice(0, m).map((x) => x / L);
      let sse = 0; const fit = [];
      for (let t = m; t < n; t++) {
        const s = S[t - m], f = (L + B) * s; const e = vals[t] - f; sse += e * e; if (keep) fit.push(f);
        const L2 = a * vals[t] / s + (1 - a) * (L + B); B = b * (L2 - L) + (1 - b) * B; L = L2; S.push(g * vals[t] / L + (1 - g) * s);
      }
      return { sse, L, B, S, fit };
    };
    let best = null;
    for (const a of [0.05, 0.15, 0.25, 0.35, 0.5, 0.65, 0.8, 0.95]) for (const b of [0.01, 0.05, 0.1, 0.2, 0.35]) for (const g of [0.05, 0.15, 0.3, 0.5, 0.7, 0.9]) {
      const r = run(a, b, g, false); if (!best || r.sse < best.sse) best = Object.assign(r, { a, b, g });
    }
    const fin = run(best.a, best.b, best.g, true);
    const fc = U.range(H, (hh) => (fin.L + (hh + 1) * fin.B) * fin.S[n - m + (hh % m)]);
    const rel = fin.fit.map((f, i) => (vals[i + m] - f) / f);
    return { alpha: best.a, beta: best.b, gamma: best.g, forecast: fc, relSd: U.sd(rel), sse: best.sse };
  };

  /* ---------------- evaluación con datos de validación ---------------- */
  const mape = (act, pr) => { const e = act.map((a, i) => Math.abs(a - pr[i]) / a).filter(isFinite); return e.length ? U.mean(e) : NaN; };
  FC.evaluate = function (R) {
    const full = R.months.filter((mo) => !mo.partial && mo.open > 0);
    if (full.length < 36) return { ok: false, reason: 'Se necesitan al menos 36 meses completos para validar con un año fuera de muestra.' };
    const hold = full.slice(-12), train = full.slice(0, -12);
    const holdStart = U.dayKey(hold[0].y, hold[0].m, 1);
    const hm = FC.harmonic(R, { trainEnd: holdStart - 1 });
    const harmPred = hold.map((mo) => {
      const vals = []; for (let d = 1; d <= mo.dim; d++) { const k = U.dayKey(mo.y, mo.m, d), i = k - R.k0; if (i >= 0 && i < R.N && R.y[i] > 0) vals.push(hm.mean(k)); }
      return vals.length ? U.mean(vals) : NaN;
    });
    const act = hold.map((mo) => mo.avg);
    const hw = FC.holtWinters(train.map((mo) => mo.avg), 12, 12);
    const hwPred = hw ? hw.forecast : null;
    const g = Math.exp(12 * R.trend.b);
    const naive = hold.map((mo) => { const prev = R.months.find((x) => x.y === mo.y - 1 && x.m === mo.m); return prev && prev.avg ? prev.avg * g : NaN; });
    const res = { ok: true, months: hold.map((mo) => `${U.MESES[mo.m - 1]} ${mo.y}`), act, harm: { pred: harmPred, mape: mape(act, harmPred) }, naive: { pred: naive, mape: mape(act, naive) } };
    if (hwPred) res.hw = { pred: hwPred, mape: mape(act, hwPred), params: hw };
    res.best = res.hw && res.hw.mape < res.harm.mape ? 'hw' : 'harm';
    return res;
  };

  /* ---------------- pronóstico final ---------------- */
  FC.closedRule = function (R) {
    const easterOff = new Map(), yrs = new Set();
    for (let i = 0; i < R.N; i++) yrs.add(R.info[i].y);
    for (const y of yrs) { const e = U.easter(y); for (let off = -7; off <= 1; off++) { const i = e + off - R.k0; if (i < 0 || i >= R.N || isNaN(R.y[i])) continue; const c = easterOff.get(off) || [0, 0]; c[1]++; if (!(R.y[i] > 0) && R.dowOpen[R.info[i].dow] > 0.8) c[0]++; easterOff.set(off, c); } }
    const easterClosed = Array.from(easterOff.entries()).filter(([, c]) => c[1] >= 2 && c[0] / c[1] >= 0.5).map(([o]) => o);
    const md = new Set(R.closures.map((c) => c.md));
    return (k) => { const inf = U.dayInfo(k); if (R.dowOpen[inf.dow] < 0.2) return true; if (md.has(U.pad2(inf.m) + '-' + U.pad2(inf.d))) return true; const e = U.easter(inf.y); return easterClosed.includes(k - e); };
  };
  FC.run = function (R, opts = {}) {
    const hm = FC.harmonic(R); if (!hm) return null;
    const ev = opts.skipEval ? { ok: false } : FC.evaluate(R);
    const closed = FC.closedRule(R);
    const kEnd = opts.kEnd || U.dayKey(U.dayInfo(R.k1).y + 1, 12, 31);
    // reconciliación con Holt-Winters si ganó la validación
    let recon = null;
    if (ev.ok && ev.best === 'hw') {
      const full = R.months.filter((mo) => !mo.partial && mo.open > 0);
      const nAhead = (U.dayInfo(kEnd).y * 12 + U.dayInfo(kEnd).m) - (full[full.length - 1].y * 12 + full[full.length - 1].m);
      const hw = FC.holtWinters(full.map((mo) => mo.avg), 12, Math.max(1, nAhead));
      if (hw) { recon = new Map(); const last = full[full.length - 1]; hw.forecast.forEach((v, i) => { const key = last.y * 12 + last.m - 1 + i + 1; recon.set(key, v); }); }
    }
    const daily = new Map();
    const monthAvgHarm = new Map();
    for (let k = R.k1 + 1; k <= kEnd; k++) {
      const inf = U.dayInfo(k); const key = inf.y * 12 + inf.m - 1;
      if (closed(k)) { daily.set(k, { k, yhat: 0, lo: 0, hi: 0, closed: true }); continue; }
      const yhat = hm.mean(k); const [lo, hi] = hm.interval(k);
      daily.set(k, { k, yhat, lo, hi, closed: false });
      const a = monthAvgHarm.get(key) || [0, 0]; a[0] += yhat; a[1]++; monthAvgHarm.set(key, a);
    }
    if (recon) for (const d of daily.values()) {
      if (d.closed) continue; const inf = U.dayInfo(d.k); const key = inf.y * 12 + inf.m - 1;
      const target = recon.get(key), base = monthAvgHarm.get(key); if (!target || !base) continue;
      const f = target / (base[0] / base[1]); d.yhat *= f; d.lo *= f; d.hi *= f;
    }
    if (opts.external) for (const [k, v] of opts.external) if (daily.has(k) && !daily.get(k).closed) { const d = daily.get(k); const f = v / d.yhat; d.yhat = v; d.lo *= f; d.hi *= f; d.ext = true; }
    const fitted = new Float64Array(R.N).fill(NaN); for (let i = 0; i < R.N; i++) if (R.y[i] > 0) fitted[i] = hm.mean(R.k0 + i);
    const res = []; for (let i = 0; i < R.N; i++) if (R.y[i] > 0) res.push(R.y[i] / fitted[i]);
    const inMape = U.mean(res.map((r) => Math.abs(1 - 1 / r)));
    return { hm, ev, daily, kEnd, closed, recon: !!recon, fitted, resid: res, inMape, method: recon ? 'Holt-Winters (nivel mensual) con perfil diario armónico' : 'Regresión armónica diaria' };
  };
  FC.coverage = (fc, level) => {
    if (level === 'mean' || !fc) return 1;
    const p = { p75: 0.75, p90: 0.9, p95: 0.95 }[level] || 0.5;
    const med = U.median(fc.resid); return U.quantile(fc.resid, p) / med;
  };

  /* ---------------- plan de personal por mes ---------------- */
  // cfg: {kFrom, kTo, coverage, ahtMode, ahtManual, staff:{target,maxOcc,patienceMin}, shrink, shift:{...}, weekHours, daysFT, seasons[12], basePolicy}
  // Plan de una semana típica: lamGrid[dow][hora] = clientes por hora; ahtAt(m, hora) = TMO en minutos.
  FC.weekPlan = function (lamGrid, openHours, ahtAt, m, cfg) {
    const days = []; const grid = U.range(7, () => new Array(24).fill(0));
    let peakAg = 0, peakLam = 0, peakAt = null;
    for (let w = 0; w < 7; w++) {
      const oh = openHours[w];
      if (!oh || !(lamGrid[w].some((x) => x > 0))) { days.push({ shifts: [], cover: [], hours: 0, cost: 0, vol: 0 }); continue; }
      const lam = [], req = [], sched = [];
      for (let hh = oh[0]; hh < oh[1]; hh++) {
        const l = lamGrid[w][hh] || 0; const r = ST.required(l, ahtAt(m, hh), cfg.staff);
        lam.push(l); req.push(r.c); sched.push(Math.ceil(r.c / (1 - cfg.shrink) - 1e-9));
        grid[w][hh] = r.c;
        if (r.c > peakAg || (r.c === peakAg && l > peakLam)) { peakAg = r.c; peakAt = { dow: w, hour: hh }; }
        peakLam = Math.max(peakLam, l);
      }
      const sh = ST.dayShifts(sched, Object.assign({ step: 60 }, cfg.shift));
      sh.vol = lam.reduce((a, b) => a + b, 0); sh.open = oh[0]; sh.sched = sched; sh.req = req; sh.lam = lam; days.push(sh);
    }
    const hc = ST.headcount(days, { daysFT: cfg.daysFT, daysPT: cfg.daysFT, weekHours: cfg.weekHours });
    return { days, grid, lamGrid, peakAg, peakLam, peakAt, weekHours: hc.hours, fte: hc.fte, nFT: hc.nFT, nPT: hc.nPT, total: hc.total, costWeek: hc.cost };
  };
  FC.plan = async function (R, fc, cfg, onProgress) {
    const cov = FC.coverage(fc, cfg.coverage);
    const months = []; let k = cfg.kFrom;
    while (k <= cfg.kTo) { const inf = U.dayInfo(k); months.push({ y: inf.y, m: inf.m }); k = U.dayKey(inf.y, inf.m, inf.dim) + 1; }
    const ahtAt = (m, hh) => {
      if (cfg.ahtMode === 'manual' || !isFinite(R.aht)) return cfg.ahtManual;
      const base = R.ahtMonth[m - 1] || R.aht; const hf = isFinite(R.ahtHour[hh]) && R.aht > 0 ? R.ahtHour[hh] / R.aht : 1; return base * hf;
    };
    const dayReq = (vol, dow, m) => {
      const oh = R.openHours[dow] || [9, 18]; const lam = [], req = [], sched = [], aht = [];
      for (let hh = oh[0]; hh < oh[1]; hh++) {
        const l = vol * (R.share[dow][hh] || 0); const a = ahtAt(m, hh); const r = ST.required(l, a, cfg.staff);
        lam.push(l); aht.push(a); req.push(r.c); sched.push(Math.ceil(r.c / (1 - cfg.shrink) - 1e-9));
      }
      return { open: oh[0], lam, req, sched, aht };
    };
    const out = [];
    for (let mi = 0; mi < months.length; mi++) {
      const { y, m } = months[mi]; const dim = U.daysInMonth(y, m);
      const byDow = U.range(7, () => []); let monthVol = 0, openDays = 0;
      for (let d = 1; d <= dim; d++) {
        const kk = U.dayKey(y, m, d); const f = fc.daily.get(kk); if (!f || f.closed) continue;
        monthVol += f.yhat; openDays++; if (!R.evMap.has(kk) && !cfg.evDays.has(kk)) byDow[U.dayInfo(kk).dow].push(f.yhat);
        else if (cfg.evDays.has(kk)) byDow[U.dayInfo(kk).dow].push(f.yhat / (cfg.evDays.get(kk).lift || 1));
      }
      const lamGrid = U.range(7, (w) => { const vol = byDow[w].length ? U.mean(byDow[w]) * cov : 0; return U.range(24, (hh) => vol * (R.share[w][hh] || 0)); });
      const wp = FC.weekPlan(lamGrid, R.openHours, ahtAt, m, cfg);
      out.push(Object.assign(wp, { y, m, season: cfg.seasons[m - 1], openDays, vol: monthVol, avgDay: openDays ? monthVol / openDays : 0, costMonth: wp.costWeek * dim / 7 }));
      if (onProgress) onProgress((mi + 1) / months.length); await U.tick();
    }
    // eventos dentro del periodo
    const events = [];
    for (const [kk, ev] of cfg.evDays) {
      if (kk < cfg.kFrom || kk > cfg.kTo) continue; const f = fc.daily.get(kk); if (!f || f.closed) continue;
      const inf = U.dayInfo(kk); const mo = out.find((x) => x.y === inf.y && x.m === inf.m); if (!mo) continue;
      const vol = f.yhat * cov; const dr = dayReq(vol, inf.dow, inf.m);
      const regular = mo.days[inf.dow]; const regPeak = regular && regular.req ? Math.max(...regular.req) : 0;
      const sh = ST.dayShifts(dr.sched, Object.assign({ step: 60 }, cfg.shift));
      events.push({ k: kk, name: ev.name, lift: ev.lift, vol, peakAg: Math.max(...dr.req), regPeak, extraPeak: Math.max(...dr.req) - regPeak, hours: sh.hours, regHours: regular ? regular.hours : 0 });
    }
    events.sort((a, b) => a.k - b.k);
    const totals = out.map((x) => x.total);
    const base = cfg.basePolicy === 'p25' ? Math.round(U.quantile(totals, 0.25)) : cfg.basePolicy === 'mean' ? Math.round(U.mean(totals)) : Math.min(...totals);
    out.forEach((x) => { x.temp = Math.max(0, x.total - base); x.over = Math.max(0, base - x.total); });
    return { months: out, events, base, cov, cfg };
  };
})(typeof window !== 'undefined' ? window : globalThis);
