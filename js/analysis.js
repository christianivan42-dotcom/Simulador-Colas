/* Análisis de datos históricos: estacionalidad, tendencia, eventos, perfiles horarios,
   ajuste de distribuciones y pruebas sobre el proceso de llegadas. */
(function (root) {
  'use strict';
  const QS = root.QS = root.QS || {};
  const U = QS.U;
  const AN = QS.Analysis = {};

  /* ---------------- eventos y feriados ---------------- */
  // Eventos móviles y de calendario frecuentes en países hispanohablantes (editables por el usuario)
  AN.defaultEvents = () => [
    { id: 'ss1', name: 'Semana Santa (lunes a miércoles)', kind: 'easter', from: -6, to: -4, on: true },
    { id: 'ss2', name: 'Jueves y Viernes Santo', kind: 'easter', from: -3, to: -2, on: true },
    { id: 'reyes', name: 'Día de Reyes', kind: 'fixed', from: '01-06', to: '01-06', on: true },
    { id: 'madres', name: 'Día de las Madres (8 al 10 de mayo)', kind: 'fixed', from: '05-08', to: '05-10', on: true },
    { id: 'clases', name: 'Regreso a clases (15 al 31 de agosto)', kind: 'fixed', from: '08-15', to: '08-31', on: false },
    { id: 'buenfin', name: 'Buen Fin (vie a lun antes del 3er lunes de nov.)', kind: 'buenfin', on: true },
    { id: 'bf', name: 'Black Friday (día siguiente al 4º jueves de nov.)', kind: 'blackfriday', on: false },
    { id: 'navidad', name: 'Semana de Navidad (18 al 23 de dic.)', kind: 'fixed', from: '12-18', to: '12-23', on: true },
    { id: 'nochebuena', name: 'Nochebuena (24 de dic.)', kind: 'fixed', from: '12-24', to: '12-24', on: true },
    { id: 'finanio', name: 'Fin de año (26 al 31 de dic.)', kind: 'fixed', from: '12-26', to: '12-31', on: true },
    { id: 'hotsale', name: 'Hot Sale (27 de mayo al 4 de junio, aprox.)', kind: 'fixed', from: '05-27', to: '06-04', on: false },
    { id: 'rebajas', name: 'Rebajas y cuesta de enero (2 al 15 de ene.)', kind: 'fixed', from: '01-02', to: '01-15', on: false },
    { id: 'padre', name: 'Día del Padre (3er domingo de junio y 2 días antes)', kind: 'nthdow', month: 6, dow: 6, n: 3, from: -2, to: 0, on: false },
    { id: 'sanvalentin', name: 'San Valentín (12 al 14 de feb.)', kind: 'fixed', from: '02-12', to: '02-14', on: false },
    { id: 'aguinaldo', name: 'Pago de aguinaldo (15 al 20 de dic.)', kind: 'fixed', from: '12-15', to: '12-20', on: false },
    { id: 'predial', name: 'Pago de predial y refrendos (enero)', kind: 'fixed', from: '01-02', to: '01-31', on: false },
    { id: 'impuestos', name: 'Declaración anual (abril)', kind: 'fixed', from: '04-01', to: '04-30', on: false }
  ];
  // Activa solo los eventos que aplican a un giro de negocio
  AN.eventsFor = (ids) => AN.defaultEvents().map((e) => Object.assign(e, { on: ids ? ids.includes(e.id) : e.on }));
  AN.eventDays = (ev, y) => {
    const out = [];
    const md = (s) => { const [m, d] = String(s).split('-').map(Number); return U.dayKey(y, m, Math.min(d, U.daysInMonth(y, m))); };
    switch (ev.kind) {
      case 'easter': { const e = U.easter(y); for (let k = e + ev.from; k <= e + ev.to; k++) out.push(k); break; }
      case 'buenfin': { const k = U.nthDow(y, 11, 0, 3) - 3; for (let i = 0; i < 4; i++) out.push(k + i); break; }
      case 'blackfriday': out.push(U.nthDow(y, 11, 3, 4) + 1); break;
      case 'nthdow': { const k = U.nthDow(y, ev.month, ev.dow, ev.n); for (let i = k + ev.from; i <= k + ev.to; i++) out.push(i); break; }
      default: { const a = md(ev.from), b = md(ev.to || ev.from); for (let k = a; k <= b; k++) out.push(k); }
    }
    return out;
  };
  AN.eventMap = (events, y0, y1) => {
    const m = new Map();
    for (const ev of events.filter((e) => e.on)) for (let y = y0; y <= y1; y++) for (const k of AN.eventDays(ev, y)) if (!m.has(k)) m.set(k, ev.id);
    return m;
  };

  /* ---------------- análisis principal ---------------- */
  AN.build = function (ds, opts = {}) {
    const k0 = ds.k0, k1 = ds.k1, N = k1 - k0 + 1;
    // Los días sin registros dentro del rango se tratan como cerrados (feriados) y se reportan en la calidad de datos.
    const y = new Float64Array(N), sales = new Float64Array(N).fill(NaN), present = new Uint8Array(N);
    for (const d of ds.days) { const i = d.k - k0; y[i] = d.tot; present[i] = 1; const sv = d.hourly ? U.sum(d.sales) : d.salesTot; sales[i] = sv > 0 ? sv : NaN; }
    const info = U.range(N, (i) => U.dayInfo(k0 + i));
    const open = (i) => y[i] > 0;
    const R = { ds, k0, k1, N, y, sales, info, present, events: opts.events || AN.defaultEvents() };
    const yrs = info[N - 1].y - info[0].y + 1;

    // --- años ---
    const years = [];
    for (let yy = info[0].y; yy <= info[N - 1].y; yy++) {
      let tot = 0, od = 0, pres = 0, sal = 0;
      for (let i = 0; i < N; i++) if (info[i].y === yy) { pres++; tot += y[i]; if (open(i)) od++; if (isFinite(sales[i])) sal += sales[i]; }
      years.push({ y: yy, total: tot, openDays: od, avg: od ? tot / od : NaN, sales: sal, full: pres >= 330 });
    }
    years.forEach((x, i) => { x.growth = i > 0 && isFinite(years[i - 1].avg) ? x.avg / years[i - 1].avg - 1 : NaN; });
    R.years = years;

    // --- meses ---
    const months = []; const mIndex = new Map();
    for (let i = 0; i < N; i++) {
      const key = info[i].y * 12 + info[i].m - 1; let mo = mIndex.get(key);
      if (!mo) { mo = { key, y: info[i].y, m: info[i].m, total: 0, open: 0, present: 0, dim: info[i].dim, sales: 0, svcSum: 0, svcN: 0 }; mIndex.set(key, mo); months.push(mo); }
      mo.present++; mo.total += y[i]; if (open(i)) mo.open++;
      if (isFinite(sales[i])) mo.sales += sales[i];
    }
    months.forEach((mo) => { mo.avg = mo.open ? mo.total / mo.open : NaN; mo.partial = (mo.key === months[0].key || mo.key === months[months.length - 1].key) && mo.present < mo.dim * 0.8; });
    R.months = months;
    const M = months.length;
    // índice estacional mensual (razón a la media móvil centrada 2×12)
    const v = months.map((mo) => (mo.partial ? NaN : mo.avg));
    const ratios = U.range(12, () => []);
    let method;
    if (M >= 24) {
      method = 'Razón a la media móvil centrada 2×12 (descomposición clásica multiplicativa)';
      for (let t = 6; t < M - 6; t++) {
        let s = 0.5 * v[t - 6] + 0.5 * v[t + 6]; for (let j = -5; j <= 5; j++) s += v[t + j];
        const cma = s / 12; if (isFinite(cma) && cma > 0 && isFinite(v[t])) ratios[months[t].m - 1].push(v[t] / cma);
      }
    } else if (M >= 12) {
      method = 'Razón al promedio anual (menos de 24 meses: índice preliminar)';
      const mean = U.mean(v.filter(isFinite)); months.forEach((mo, t) => { if (isFinite(v[t])) ratios[mo.m - 1].push(v[t] / mean); });
    } else method = 'Menos de 12 meses: no es posible estimar estacionalidad anual';
    let mIdx = ratios.map((r) => (r.length ? (r.length >= 3 ? U.median(r) : U.mean(r)) : NaN));
    const fill = U.mean(mIdx.filter(isFinite)) || 1; mIdx = mIdx.map((x) => (isFinite(x) ? x : fill));
    const mm = U.mean(mIdx); mIdx = mIdx.map((x) => x / mm);
    R.monthIdx = mIdx; R.seasonMethod = method;
    // tendencia log-lineal sobre la serie desestacionalizada
    const tx = [], ty = [];
    months.forEach((mo, t) => { if (isFinite(v[t]) && v[t] > 0) { tx.push(t); ty.push(Math.log(v[t] / mIdx[mo.m - 1])); } });
    const lr = tx.length >= 3 ? U.linreg(tx, ty) : { a: Math.log(U.mean(v.filter(isFinite)) || 1), b: 0, r2: 0 };
    R.trend = { a: lr.a, b: lr.b, r2: lr.r2, annual: Math.exp(12 * lr.b) - 1, monthly: Math.exp(lr.b) - 1 };
    R.trendAt = (k) => { const inf = U.dayInfo(k); const t = (inf.y * 12 + inf.m - 1 - months[0].key) + (inf.d - 0.5) / inf.dim - 0.5; return Math.exp(lr.a + lr.b * t); };

    // --- día de la semana: mediana de la razón a la media móvil de 7 días ---
    const ma7 = new Float64Array(N).fill(NaN);
    for (let i = 3; i < N - 3; i++) { let s = 0, ok = true; for (let j = -3; j <= 3; j++) { const x = y[i + j]; if (isNaN(x)) { ok = false; break; } s += x; } if (ok) ma7[i] = s / 7; }
    R.ma7 = ma7;
    const dr = U.range(7, () => []);
    for (let i = 0; i < N; i++) if (isFinite(ma7[i]) && ma7[i] > 0 && !isNaN(y[i])) dr[info[i].dow].push(y[i] / ma7[i]);
    let dIdx = dr.map((r) => (r.length ? U.median(r) : NaN)); const dm = U.mean(dIdx.filter(isFinite)) || 1; dIdx = dIdx.map((x) => (isFinite(x) ? x / dm : 0));
    R.dowIdx = dIdx;
    const dowOpenShare = U.range(7, (w) => { let o = 0, n = 0; for (let i = 0; i < N; i++) if (info[i].dow === w && !isNaN(y[i])) { n++; if (open(i)) o++; } return n ? o / n : 0; });
    R.dowOpen = dowOpenShare;
    // --- día del mes (efecto quincena / día de pago) ---
    const domR = U.range(31, () => []);
    for (let i = 0; i < N; i++) if (open(i) && isFinite(ma7[i]) && ma7[i] > 0 && dIdx[info[i].dow] > 0.15) domR[info[i].d - 1].push(y[i] / (ma7[i] * dIdx[info[i].dow]));
    let domIdx = domR.map((r) => (r.length >= 3 ? U.median(r) : NaN));
    const wsum = domR.reduce((s, r, j) => s + (isFinite(domIdx[j]) ? r.length * domIdx[j] : 0), 0), wn = domR.reduce((s, r, j) => s + (isFinite(domIdx[j]) ? r.length : 0), 0);
    domIdx = domIdx.map((x) => (isFinite(x) ? x / (wsum / wn) : 1)); R.domIdx = domIdx;
    const payDays = [0, 1, 14, 15, 29, 30]; R.paydayLift = U.mean(payDays.map((j) => domIdx[j])) / U.mean(domIdx.filter((x, j) => !payDays.includes(j)));

    // --- perfil horario por día de la semana ---
    R.hourly = ds.has.hourly;
    if (ds.has.hourly) {
      const sum = U.range(7, () => new Float64Array(24)), cnt = new Float64Array(7), tot = new Float64Array(7);
      for (const d of ds.days) { if (!d.arr || !(d.tot > 0)) continue; cnt[d.dow]++; tot[d.dow] += d.tot; for (let hh = 0; hh < 24; hh++) sum[d.dow][hh] += d.arr[hh]; }
      R.share = U.range(7, (w) => Array.from(sum[w], (x) => (tot[w] > 0 ? x / tot[w] : 0)));
      R.heat = U.range(7, (w) => Array.from(sum[w], (x) => (cnt[w] ? x / cnt[w] : 0)));
      const all = new Float64Array(24); sum.forEach((s) => s.forEach((x, hh) => { all[hh] += x; })); const ta = U.sum(all);
      R.shareAll = Array.from(all, (x) => (ta ? x / ta : 0));
      R.openHours = U.range(7, (w) => { const hs = R.share[w].map((x, hh) => (x > 0.004 ? hh : -1)).filter((x) => x >= 0); return hs.length ? [hs[0], hs[hs.length - 1] + 1] : null; });
    } else {
      const prof = opts.profile || AN.defaultProfile();
      R.share = opts.share ? opts.share.map((x) => x.slice()) : U.range(7, () => prof.slice());
      R.shareAll = U.range(24, (hh) => U.mean(R.share.map((x) => x[hh]))); R.heat = null; R.profileSource = opts.profileSource || 'típico';
      R.openHours = U.range(7, (w) => { const hs = R.share[w].map((x, hh) => (x > 0 ? hh : -1)).filter((x) => x >= 0); return hs.length ? [hs[0], hs[hs.length - 1] + 1] : null; });
    }
    // --- tiempos de atención, espera, abandono y personal histórico ---
    const svcM = new Float64Array(12), svcMN = new Float64Array(12), svcH = new Float64Array(24), svcHN = new Float64Array(24);
    const wqH = new Float64Array(24), wqHN = new Float64Array(24), abH = new Float64Array(24), arrH = new Float64Array(24);
    const srvDH = U.range(7, () => new Float64Array(24)), srvDHN = U.range(7, () => new Float64Array(24));
    let abT = 0, arrT = 0;
    for (const d of ds.days) {
      if (d.hourly && d.arr) {
        for (let hh = 0; hh < 24; hh++) {
          svcM[d.m - 1] += d.svcSum[hh]; svcMN[d.m - 1] += d.svcN[hh]; svcH[hh] += d.svcSum[hh]; svcHN[hh] += d.svcN[hh];
          wqH[hh] += d.wqSum[hh]; wqHN[hh] += d.wqN[hh]; abH[hh] += d.ab[hh]; arrH[hh] += d.arr[hh];
          if (d.srvN[hh] > 0) { srvDH[d.dow][hh] += d.srvSum[hh] / d.srvN[hh]; srvDHN[d.dow][hh] += 1; }
        }
        abT += U.sum(d.ab); arrT += d.tot;
      } else { if (d.svcDay) { svcM[d.m - 1] += d.svcDay * d.tot; svcMN[d.m - 1] += d.tot; } abT += d.abTot || 0; arrT += d.tot; }
    }
    const nM = U.sum(svcMN);
    R.aht = nM > 0 ? U.sum(svcM) / nM : NaN;
    R.ahtMonth = U.range(12, (m) => (svcMN[m] > 0 ? svcM[m] / svcMN[m] : R.aht));
    R.ahtHour = U.range(24, (hh) => (svcHN[hh] > 20 ? svcH[hh] / svcHN[hh] : R.aht));
    R.wqHour = U.range(24, (hh) => (wqHN[hh] > 0 ? wqH[hh] / wqHN[hh] : NaN));
    R.abHour = U.range(24, (hh) => (arrH[hh] > 0 ? abH[hh] / arrH[hh] : NaN));
    R.abRate = arrT > 0 ? abT / arrT : NaN;
    R.srvHist = ds.has.srv ? U.range(7, (w) => Array.from(srvDH[w], (x, hh) => (srvDHN[w][hh] > 0 ? x / srvDHN[w][hh] : NaN))) : null;
    if (ds.samples.svc.length > 30) { const s = ds.samples.svc; R.svcCV = U.sd(s) / U.mean(s); }

    // --- modelo base multiplicativo y efectos de eventos ---
    const evMap = AN.eventMap(R.events, info[0].y, info[N - 1].y);
    R.evMap = evMap;
    R.expected = (i) => R.trendAt(k0 + i) * mIdx[info[i].m - 1] * dIdx[info[i].dow] * domIdx[info[i].d - 1] * (R.trend ? 1 : 1);
    // escala para que el esperado promedio coincida con lo observado en días normales
    let num = 0, den = 0;
    for (let i = 0; i < N; i++) if (open(i) && !evMap.has(k0 + i)) { num += y[i]; den += R.expected(i); }
    const scale = den > 0 ? num / den : 1; const exp0 = R.expected; R.expected = (i) => exp0(i) * scale;
    R.eventStats = R.events.map((ev) => {
      const lifts = []; let closed = 0, n = 0;
      for (let yy = info[0].y; yy <= info[N - 1].y; yy++) for (const k of AN.eventDays(ev, yy)) {
        const i = k - k0; if (i < 0 || i >= N || isNaN(y[i])) continue; n++;
        if (!open(i)) { if (dIdx[info[i].dow] > 0.15) closed++; continue; }
        const e = R.expected(i); if (e > 0) lifts.push(y[i] / e);
      }
      return { id: ev.id, name: ev.name, on: ev.on, n, closed, lift: lifts.length ? U.median(lifts) : NaN, obs: lifts.length };
    });
    // cierres recurrentes (feriados) detectados
    const closures = new Map();
    for (let i = 0; i < N; i++) if (!open(i) && dowOpenShare[info[i].dow] > 0.8) { const key = U.pad2(info[i].m) + '-' + U.pad2(info[i].d); closures.set(key, (closures.get(key) || 0) + 1); }
    R.closures = Array.from(closures.entries()).filter(([, c]) => c >= Math.max(2, Math.floor(yrs * 0.5))).map(([key, c]) => ({ md: key, years: c })).sort((a, b) => a.md.localeCompare(b.md));
    // residuos día a día (para niveles de cobertura de la demanda)
    const res = [];
    for (let i = 0; i < N; i++) if (open(i) && !evMap.has(k0 + i)) { const e = R.expected(i); if (e > 0) res.push(y[i] / e); }
    R.resid = res;
    // estadísticos generales
    const openIdx = []; for (let i = 0; i < N; i++) if (open(i)) openIdx.push(i);
    R.openDays = openIdx.length; R.total = openIdx.reduce((s, i) => s + y[i], 0); R.avgDay = R.total / Math.max(1, R.openDays);
    const pk = openIdx.reduce((b, i) => (y[i] > y[b] ? i : b), openIdx[0]); R.peakDay = { k: k0 + pk, v: y[pk] };
    R.missing = 0; R.missingDays = [];
    for (let i = 0; i < N; i++) if (!present[i] && dowOpenShare[info[i].dow] > 0.8) { R.missing++; if (R.missingDays.length < 400) R.missingDays.push(k0 + i); }
    // valores atípicos (|log residuo| > 3.5 desviaciones robustas)
    const lr2 = res.map(Math.log); const med = U.median(lr2); const mad = U.median(lr2.map((x) => Math.abs(x - med))) * 1.4826 || 0.1;
    R.outliers = [];
    for (let i = 0; i < N; i++) if (open(i)) { const e = R.expected(i); if (e > 0) { const z = (Math.log(y[i] / e) - med) / mad; if (Math.abs(z) > 3.5 && !evMap.has(k0 + i)) R.outliers.push({ k: k0 + i, y: y[i], exp: e, z }); } }
    R.outliers.sort((a, b) => Math.abs(b.z) - Math.abs(a.z));
    return R;
  };
  // Perfil horario típico de comercio cuando solo hay datos diarios (9:00 a 20:00)
  AN.defaultProfile = () => { const p = new Array(24).fill(0); [0.05, 0.08, 0.1, 0.12, 0.12, 0.1, 0.08, 0.08, 0.1, 0.1, 0.07].forEach((x, i) => { p[9 + i] = x; }); const s = U.sum(p); return p.map((x) => x / s); };

  // Clasificación de temporadas por índice mensual
  AN.seasons = (mIdx, hi = 0.08, lo = 0.08) => mIdx.map((x) => (x >= 1 + hi ? 'Alta' : x <= 1 - lo ? 'Baja' : 'Normal'));

  /* ---------------- ajuste de distribuciones ---------------- */
  AN.fit = function (data) {
    const x = data.filter((v) => v > 0 && isFinite(v)); const n = x.length;
    if (n < 30) return null;
    const s = U.sortedCopy(x); const mean = U.mean(x), sd = U.sd(x); const lx = x.map(Math.log); const ml = U.mean(lx), sl = U.sd(lx);
    const out = [];
    const ks = (cdf) => { let D = 0; for (let i = 0; i < n; i++) { const F = cdf(s[i]); D = Math.max(D, Math.abs(F - i / n), Math.abs((i + 1) / n - F)); } return D; };
    const ksP = (D) => { const lam = (Math.sqrt(n) + 0.12 + 0.11 / Math.sqrt(n)) * D; let p = 0; for (let j = 1; j < 100; j++) p += 2 * Math.pow(-1, j - 1) * Math.exp(-2 * j * j * lam * lam); return U.clamp(p, 0, 1); };
    const add = (name, spec, k, logpdf, cdf, pdf) => {
      let ll = 0; for (const v of x) ll += logpdf(v);
      const D = ks(cdf); out.push({ name, spec, k, ll, aic: 2 * k - 2 * ll, D, p: ksP(D), pdf });
    };
    { const lam = 1 / mean; add('Exponencial', { type: 'exp', mean }, 1, (v) => Math.log(lam) - lam * v, (v) => 1 - Math.exp(-lam * v), (v) => lam * Math.exp(-lam * v)); }
    { // gamma por máxima verosimilitud (aproximación de Minka + Newton)
      const sS = Math.log(mean) - ml; let k = (3 - sS + Math.sqrt((sS - 3) ** 2 + 24 * sS)) / (12 * sS);
      for (let it = 0; it < 30; it++) { const dg = (z) => { let r = 0; while (z < 6) { r -= 1 / z; z += 1; } return r + Math.log(z) - 1 / (2 * z) - 1 / (12 * z * z) + 1 / (120 * z ** 4); }; const tg = (z) => { let r = 0; while (z < 6) { r += 1 / (z * z); z += 1; } return r + 1 / z + 1 / (2 * z * z) + 1 / (6 * z ** 3) - 1 / (30 * z ** 5); }; const f = Math.log(k) - dg(k) - sS; const fp = 1 / k - tg(k); const k2 = k - f / fp; if (!(k2 > 0)) break; if (Math.abs(k2 - k) < 1e-10) { k = k2; break; } k = k2; }
      const th = mean / k; const lg = U.lgamma(k);
      add('Gamma', { type: 'gamma', mean, sd: Math.sqrt(k) * th }, 2, (v) => (k - 1) * Math.log(v) - v / th - lg - k * Math.log(th), (v) => U.gammaP(k, v / th), (v) => Math.exp((k - 1) * Math.log(v) - v / th - lg - k * Math.log(th)));
      const ke = Math.max(1, Math.round(k));
      if (ke <= 30) { const the = mean / ke; const lge = U.lgamma(ke); add(`Erlang-${ke}`, { type: 'erlang', mean, k: ke }, 1, (v) => (ke - 1) * Math.log(v) - v / the - lge - ke * Math.log(the), (v) => U.gammaP(ke, v / the), (v) => Math.exp((ke - 1) * Math.log(v) - v / the - lge - ke * Math.log(the))); }
    }
    { const mu = ml, sg = sl; const m1 = Math.exp(mu + sg * sg / 2), sd1 = m1 * Math.sqrt(Math.exp(sg * sg) - 1);
      add('Lognormal', { type: 'lnorm', mean: m1, sd: sd1 }, 2, (v) => -Math.log(v * sg * Math.sqrt(2 * Math.PI)) - ((Math.log(v) - mu) ** 2) / (2 * sg * sg), (v) => U.normCdf((Math.log(v) - mu) / sg), (v) => Math.exp(-((Math.log(v) - mu) ** 2) / (2 * sg * sg)) / (v * sg * Math.sqrt(2 * Math.PI))); }
    { // Weibull por máxima verosimilitud (Newton sobre la forma)
      let k = 1.2 / Math.max(0.05, sl);
      for (let it = 0; it < 60; it++) { let a = 0, b = 0, c = 0; for (const v of x) { const p = Math.pow(v, k), l = Math.log(v); a += p; b += p * l; c += p * l * l; } const f = b / a - 1 / k - ml; const fp = (c * a - b * b) / (a * a) + 1 / (k * k); const k2 = k - f / fp; if (!(k2 > 0)) break; if (Math.abs(k2 - k) < 1e-9) { k = k2; break; } k = k2; }
      let a = 0; for (const v of x) a += Math.pow(v, k); const lam = Math.pow(a / n, 1 / k);
      const m1 = lam * Math.exp(U.lgamma(1 + 1 / k)), sd1 = lam * Math.sqrt(Math.exp(U.lgamma(1 + 2 / k)) - Math.exp(2 * U.lgamma(1 + 1 / k)));
      add('Weibull', { type: 'weibull', mean: m1, sd: sd1 }, 2, (v) => Math.log(k / lam) + (k - 1) * Math.log(v / lam) - Math.pow(v / lam, k), (v) => 1 - Math.exp(-Math.pow(v / lam, k)), (v) => (k / lam) * Math.pow(v / lam, k - 1) * Math.exp(-Math.pow(v / lam, k))); }
    { add('Normal', { type: 'norm', mean, sd }, 2, (v) => -Math.log(sd * Math.sqrt(2 * Math.PI)) - ((v - mean) ** 2) / (2 * sd * sd), (v) => U.normCdf((v - mean) / sd), (v) => U.normPdf((v - mean) / sd) / sd); }
    out.sort((a, b) => a.aic - b.aic);
    const best = out[0].aic; out.forEach((f) => { f.dAIC = f.aic - best; });
    return { n, mean, sd, cv: sd / mean, median: U.quantileSorted(s, 0.5), p90: U.quantileSorted(s, 0.9), fits: out, sorted: s };
  };

  /* ---------------- pruebas sobre las llegadas ---------------- */
  AN.arrivalTests = function (ds) {
    const out = {};
    if (ds.has.hourly) {
      const cells = new Map();
      for (const d of ds.days) { if (!d.arr || !(d.tot > 0)) continue; for (let hh = 0; hh < 24; hh++) { const key = `${d.y}-${d.m}-${d.dow}-${hh}`; let c = cells.get(key); if (!c) cells.set(key, (c = [])); c.push(d.arr[hh]); } }
      const idx = [];
      for (const c of cells.values()) { if (c.length < 4) continue; const m = U.mean(c); if (m < 3) continue; idx.push(U.variance(c) / m); }
      if (idx.length) { out.dispersion = { median: U.median(idx), cells: idx.length, inRange: idx.filter((x) => x >= 0.6 && x <= 1.6).length / idx.length, values: idx }; }
    }
    if (ds.iaCtx && ds.iaCtx.length > 100) {
      const lam = new Map();
      for (const d of ds.days) if (d.arr) for (let hh = 0; hh < 24; hh++) { const key = `${d.y}-${d.m}-${d.dow}-${hh}`; const e = lam.get(key) || [0, 0]; e[0] += d.arr[hh]; e[1]++; lam.set(key, e); }
      const z = [];
      for (const [ia, k, hh] of ds.iaCtx) { const inf = U.dayInfo(k); const e = lam.get(`${inf.y}-${inf.m}-${inf.dow}-${hh}`); if (!e || !e[0]) continue; const rate = e[0] / e[1] / 60; z.push(ia * rate); }
      if (z.length > 100) {
        const s = U.sortedCopy(z); const n = s.length; let D = 0; for (let i = 0; i < n; i++) { const F = 1 - Math.exp(-s[i]); D = Math.max(D, Math.abs(F - i / n), Math.abs((i + 1) / n - F)); }
        out.rescaled = { n, mean: U.mean(z), cv: U.sd(z) / U.mean(z), D, crit: 1.36 / Math.sqrt(n) };
      }
    }
    return out;
  };
})(typeof window !== 'undefined' ? window : globalThis);
