/* Modelos analíticos de teoría de colas.
   Unidades internas: tasas por HORA (λ, μ, θ) y tiempos en HORAS.
   Referencias: Gross, Shortle, Thompson & Harris (Fundamentals of Queueing Theory),
   Hillier & Lieberman (Investigación de Operaciones), Kleinrock (Queueing Systems),
   Garnett, Mandelbaum & Reiman (2002, Erlang A), Whitt (1983, QNA), Krämer & Langenbach-Belz (1976). */
(function (root) {
  'use strict';
  const QS = root.QS = root.QS || {};
  const U = QS.U;
  const A = QS.Analytic = {};

  A.MODELS = [
    { id: 'mm1', group: 'Modelos básicos', name: 'M/M/1', short: 'Un servidor, llegadas Poisson y servicio exponencial.' },
    { id: 'mmc', group: 'Modelos básicos', name: 'M/M/c (Erlang C)', short: 'c servidores en paralelo con una sola fila y espacio ilimitado.' },
    { id: 'mmck', group: 'Modelos básicos', name: 'M/M/c/K (capacidad limitada)', short: 'Como máximo K clientes en el sistema; los que llegan con el sistema lleno se pierden.' },
    { id: 'mmcc', group: 'Modelos básicos', name: 'M/M/c/c (Erlang B, pérdida)', short: 'Sin sala de espera: si todos los servidores están ocupados el cliente se pierde.' },
    { id: 'mminf', group: 'Modelos básicos', name: 'M/M/∞ (autoservicio)', short: 'Siempre hay un servidor disponible (autoservicio, estacionamientos grandes).' },
    { id: 'mmckn', group: 'Población finita', name: 'M/M/c/K/N (fuente finita)', short: 'Población de N clientes (máquinas, pacientes registrados); cada uno vuelve a solicitar servicio.' },
    { id: 'erlangA', group: 'Impaciencia', name: 'M/M/c+M (Erlang A, abandono)', short: 'Clientes impacientes que abandonan la fila tras un tiempo de paciencia exponencial.' },
    { id: 'bd', group: 'Impaciencia', name: 'Nacimiento-muerte general (rechazo + abandono)', short: 'Rechazo al ver la fila larga (balking), abandono (reneging) y capacidad K a la vez.' },
    { id: 'mg1', group: 'Servicio general', name: 'M/G/1 (Pollaczek-Khinchine)', short: 'Servicio con cualquier distribución; incluye M/D/1 y M/Eₖ/1.' },
    { id: 'mgc', group: 'Servicio general', name: 'M/G/c (aproximación)', short: 'Varios servidores con servicio general (corrección de dos momentos).' },
    { id: 'gg1', group: 'Servicio general', name: 'G/G/1 (Kingman + KLB)', short: 'Llegadas y servicio generales con un servidor (aproximación).' },
    { id: 'ggc', group: 'Servicio general', name: 'G/G/c (Allen-Cunneen)', short: 'Llegadas y servicio generales con c servidores (aproximación estándar en la industria).' },
    { id: 'mxg1', group: 'Servicio general', name: 'Mˣ/G/1 (llegadas en grupo)', short: 'Llegan grupos (familias, lotes) de tamaño aleatorio.' },
    { id: 'prio', group: 'Prioridades', name: 'Prioridades (con y sin expropiación)', short: 'Clases de clientes con distinta prioridad: preferenciales, VIP, urgencias.' },
    { id: 'tandem', group: 'Redes de colas', name: 'Estaciones en serie (Jackson / QNA)', short: 'Etapas sucesivas: p. ej. ordenar → pagar → recoger.' }
  ];
  A.byId = {}; A.MODELS.forEach((m) => { A.byId[m.id] = m; });

  /* ---------------- Funciones de Erlang ---------------- */
  A.erlangB = (c, a) => { let B = 1; for (let n = 1; n <= c; n++) B = a * B / (n + a * B); return B; };
  A.erlangC = (c, a) => { if (a >= c) return 1; const B = A.erlangB(c, a); return c * B / (c - a * (1 - B)); };

  /* ---------------- Proceso de nacimiento y muerte (en escala log) ---------------- */
  // lamF(n): tasa de entrada en estado n; muF(n): tasa de salida en estado n (n≥1).
  function bdSolve(lamF, muF, Nmax, minN) {
    const logw = [0]; let maxlog = 0, n = 0; const cap = Nmax != null ? Nmax : 400000;
    while (n < cap) {
      const l = lamF(n); if (!(l > 0)) break;
      const m = muF(n + 1); if (!(m > 0)) break;
      const lw = logw[n] + Math.log(l) - Math.log(m);
      logw.push(lw); n++;
      if (lw > maxlog) maxlog = lw;
      if (Nmax == null && n > (minN || 0) && l < m && lw < maxlog - 46) break;
    }
    let Z = 0; for (let i = 0; i < logw.length; i++) Z += Math.exp(logw[i] - maxlog);
    const p = new Float64Array(logw.length);
    for (let i = 0; i < logw.length; i++) p[i] = Math.exp(logw[i] - maxlog) / Z;
    return p;
  }
  A._bdSolve = bdSolve;

  // P(atendido con espera ≤ t) para FCFS exponencial SIN abandono, dado q_n (estado visto al llegar)
  function slNoAb(q, c, mu, t) {
    let sl = 0; const N = q.length;
    for (let n = 0; n < Math.min(c, N); n++) sl += q[n];
    if (N <= c) return sl;
    const cdf = U.poissonCdfVec(c * mu * t, N - 1 - c);
    for (let n = c; n < N; n++) sl += q[n] * (1 - cdf[n - c]);
    return Math.min(1, sl);
  }
  // Con abandono exponencial (θ): ecuaciones de Kolmogorov hacia atrás resueltas con RK4.
  // u_k(t) = P(entrar a servicio antes de t sin abandonar | k clientes delante en la fila)
  function slAb(q, c, mu, theta, t) {
    let sl = 0; const N = q.length;
    for (let n = 0; n < Math.min(c, N); n++) sl += q[n];
    if (N <= c || t <= 0) return sl;
    const K = N - 1 - c, cmu = c * mu;
    const rate = (k) => cmu + k * theta; // salida del cliente de adelante (servicio o abandono)
    const maxR = cmu + K * theta + theta;
    let steps = Math.ceil(t * maxR / 0.1); steps = Math.max(40, Math.min(steps, 400000));
    const h = t / steps;
    let u = new Float64Array(K + 1);
    const k1 = new Float64Array(K + 1), k2 = new Float64Array(K + 1), k3 = new Float64Array(K + 1), k4 = new Float64Array(K + 1), tmp = new Float64Array(K + 1);
    const deriv = (v, out) => {
      out[0] = cmu * (1 - v[0]) - theta * v[0];
      for (let k = 1; k <= K; k++) out[k] = rate(k) * (v[k - 1] - v[k]) - theta * v[k];
    };
    for (let s = 0; s < steps; s++) {
      deriv(u, k1); for (let i = 0; i <= K; i++) tmp[i] = u[i] + 0.5 * h * k1[i];
      deriv(tmp, k2); for (let i = 0; i <= K; i++) tmp[i] = u[i] + 0.5 * h * k2[i];
      deriv(tmp, k3); for (let i = 0; i <= K; i++) tmp[i] = u[i] + h * k3[i];
      deriv(tmp, k4); for (let i = 0; i <= K; i++) u[i] += h / 6 * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]);
    }
    for (let n = c; n < N; n++) sl += q[n] * u[n - c];
    return Math.min(1, sl);
  }
  // Percentil del tiempo de espera invirtiendo una función de NS monótona
  function invertSL(slFn, p, hint) {
    if (slFn(0) >= p) return 0;
    let hi = Math.max(hint || 0.01, 1e-4), guard = 0;
    while (slFn(hi) < p && guard++ < 60) hi *= 2;
    if (guard >= 60) return Infinity;
    let lo = 0;
    for (let i = 0; i < 60; i++) { const m = (lo + hi) / 2; if (slFn(m) < p) lo = m; else hi = m; }
    return (lo + hi) / 2;
  }

  function base(model, extra) {
    return Object.assign({ ok: true, approx: false, model, notes: [], formulas: [], pn: null, sl: null, wqPct: null,
      Pblock: 0, Pbalk: 0, Pab: 0, Plost: 0, perClass: null, stations: null }, extra);
  }
  function fail(model, msg, extra) { return Object.assign(base(model), { ok: false, error: msg }, extra || {}); }

  // Métricas comunes a partir de la distribución estacionaria p_n de un proceso N-M
  function bdMetrics(r, p, lamF, c, mu, theta, lamOffered) {
    let L = 0, Lq = 0, busy = 0, lamAcc = 0;
    for (let n = 0; n < p.length; n++) {
      const pn = p[n]; L += n * pn; Lq += Math.max(n - c, 0) * pn; busy += Math.min(n, c) * pn; lamAcc += lamF(n) * pn;
    }
    const q = new Float64Array(p.length);
    for (let n = 0; n < p.length; n++) q[n] = lamAcc > 0 ? lamF(n) * p[n] / lamAcc : 0;
    let Pw = 0; for (let n = c; n < q.length; n++) Pw += q[n];
    Object.assign(r, { pn: p, P0: p[0], L, Lq, Ls: busy, lamEff: lamAcc, util: busy / c, thr: busy * mu, Pw,
      W: lamAcc > 0 ? L / lamAcc : NaN, Wq: lamAcc > 0 ? Lq / lamAcc : NaN });
    r.Pab = theta > 0 && lamAcc > 0 ? theta * Lq / lamAcc : 0;
    r.sl = theta > 0 ? (t) => slAb(q, c, mu, theta, t) : (t) => slNoAb(q, c, mu, t);
    if (!(theta > 0)) r.wqPct = (pp) => invertSL(r.sl, pp, r.Wq || 1 / mu);
    r._q = q;
    if (lamOffered > 0) {
      r.lam = lamOffered;
    }
    return r;
  }

  /* ======================= MODELOS ======================= */
  function mmc(P) {
    const lam = +P.lam, mu = +P.mu, c = Math.round(+P.c);
    const r = base(c === 1 ? 'mm1' : 'mmc', { lam, mu, c, kendall: `M/M/${c}` });
    if (!(lam > 0 && mu > 0 && c >= 1)) return fail(r.model, 'Ingresa λ > 0, μ > 0 y c ≥ 1.');
    const a = lam / mu, rho = a / c; r.a = a; r.rho = rho;
    if (rho >= 1) return fail(r.model, `Sistema inestable: ρ = λ/(cμ) = ${U.fmt(rho, 3)} ≥ 1. La fila crece sin límite; agrega servidores o reduce el tiempo de servicio.`, { a, rho, lam, mu, c });
    const B = A.erlangB(c, a), C = c * B / (c - a * (1 - B));
    const Lq = C * rho / (1 - rho), Wq = C / (c * mu - lam), W = Wq + 1 / mu, L = lam * W;
    // p_n en escala logarítmica
    const logt = []; for (let n = 0; n <= c; n++) logt.push(n * Math.log(a) - U.lgamma(n + 1));
    const tailLog = logt[c] + Math.log(rho) - Math.log(1 - rho);
    let mx = Math.max(...logt, tailLog), Z = 0; for (const v of logt) Z += Math.exp(v - mx); Z += Math.exp(tailLog - mx);
    const logZ = mx + Math.log(Z);
    const pn = []; let cum = 0;
    for (let n = 0; n < c + 2000; n++) {
      const lt = n <= c ? logt[n] : logt[c] + (n - c) * Math.log(rho);
      const v = Math.exp(lt - logZ); pn.push(v); cum += v;
      if (n > c + 5 && (cum > 0.9995 || pn.length > 400)) break;
    }
    const d = c * mu - lam;
    Object.assign(r, { a, rho, P0: pn[0], pn: Float64Array.from(pn), L, Lq, W, Wq, Ls: a, lamEff: lam, util: rho, thr: lam, Pw: C, erlangC: C, erlangB: B,
      wqSd: Math.sqrt(Math.max(0, C * (2 - C))) / d,
      sl: (t) => 1 - C * Math.exp(-d * t),
      wqPct: (p) => (C <= 1 - p ? 0 : Math.log(C / (1 - p)) / d) });
    if (c === 1) {
      r.formulas = ['ρ = λ/μ', 'P₀ = 1 − ρ ;  Pₙ = (1 − ρ)ρⁿ', 'L = ρ/(1 − ρ) ;  Lq = ρ²/(1 − ρ)', 'W = 1/(μ − λ) ;  Wq = ρ/(μ − λ)', 'P(Wq > t) = ρ·e^{−(μ−λ)t}'];
    } else {
      r.formulas = ['a = λ/μ (Erlangs) ;  ρ = a/c', 'P₀ = [ Σₙ₌₀^{c−1} aⁿ/n! + a^c/(c!(1−ρ)) ]⁻¹', 'C(c,a) = a^c/(c!(1−ρ))·P₀   (prob. de esperar, Erlang C)', 'Lq = C·ρ/(1−ρ) ;  Wq = C/(cμ − λ)', 'W = Wq + 1/μ ;  L = λW', 'P(Wq > t) = C·e^{−(cμ−λ)t}'];
    }
    return r;
  }

  function mmck(P) {
    const lam = +P.lam, mu = +P.mu, c = Math.round(+P.c), K = Math.round(+P.K);
    if (!(lam > 0 && mu > 0 && c >= 1)) return fail('mmck', 'Ingresa λ > 0, μ > 0 y c ≥ 1.');
    if (!(K >= c)) return fail('mmck', 'La capacidad K debe ser ≥ c (incluye a los que están en servicio).');
    const r = base('mmck', { lam, mu, c, K, a: lam / mu, rho: lam / (c * mu), kendall: `M/M/${c}/${K}` });
    const lamF = (n) => (n < K ? lam : 0), muF = (n) => Math.min(n, c) * mu;
    const p = bdSolve(lamF, muF, K);
    bdMetrics(r, p, lamF, c, mu, 0, lam);
    r.Pblock = p[K]; r.Plost = r.Pblock;
    r.formulas = ['Pₙ = P₀·aⁿ/n!  (n ≤ c) ;  Pₙ = P₀·a^c·ρ^{n−c}/c!  (c < n ≤ K)', 'P(bloqueo) = P_K ;  λ_ef = λ(1 − P_K)', 'L = Σ n·Pₙ ;  Lq = Σ (n−c)·Pₙ', 'W = L/λ_ef ;  Wq = Lq/λ_ef  (Ley de Little)'];
    if (r.rho >= 1) r.notes.push('ρ ≥ 1: el sistema es estable solo porque la capacidad limita la fila; se pierde una fracción importante de clientes.');
    return r;
  }

  function mmcc(P) {
    const lam = +P.lam, mu = +P.mu, c = Math.round(+P.c);
    if (!(lam > 0 && mu > 0 && c >= 1)) return fail('mmcc', 'Ingresa λ > 0, μ > 0 y c ≥ 1.');
    const a = lam / mu; const B = A.erlangB(c, a);
    const r = base('mmcc', { lam, mu, c, K: c, a, rho: a / c, kendall: `M/M/${c}/${c}` });
    const lamF = (n) => (n < c ? lam : 0), muF = (n) => n * mu;
    bdMetrics(r, bdSolve(lamF, muF, c), lamF, c, mu, 0, lam);
    Object.assign(r, { Pblock: B, Plost: B, erlangB: B, Lq: 0, Wq: 0, W: 1 / mu, L: a * (1 - B), Pw: 0, sl: () => 1, wqPct: () => 0 });
    r.formulas = ['B(c,a) = (a^c/c!) / Σₙ₌₀^c aⁿ/n!   (fórmula de pérdida de Erlang)', 'Recursión estable: B(0)=1 ; B(n) = a·B(n−1)/(n + a·B(n−1))', 'L = a(1 − B) ;  W = 1/μ ;  Lq = Wq = 0'];
    return r;
  }

  function mminf(P) {
    const lam = +P.lam, mu = +P.mu;
    if (!(lam > 0 && mu > 0)) return fail('mminf', 'Ingresa λ > 0 y μ > 0.');
    const a = lam / mu; const pn = []; let cum = 0;
    for (let n = 0; n < 2000; n++) { const v = U.poissonPmf(n, a); pn.push(v); cum += v; if (n > a && cum > 0.9995) break; }
    const r = base('mminf', { lam, mu, c: Infinity, a, rho: 0, kendall: 'M/M/∞', P0: Math.exp(-a), pn: Float64Array.from(pn), L: a, Lq: 0, W: 1 / mu, Wq: 0, Ls: a, lamEff: lam, util: NaN, thr: lam, Pw: 0, sl: () => 1, wqPct: () => 0 });
    r.formulas = ['Pₙ = e^{−a}·aⁿ/n!  (Poisson con media a = λ/μ)', 'L = a ;  W = 1/μ ;  Lq = Wq = 0'];
    return r;
  }

  function mmckn(P) {
    const lam = +P.lam, mu = +P.mu, c = Math.round(+P.c), N = Math.round(+P.N);
    let K = P.K === '' || P.K == null || !(+P.K > 0) ? N : Math.round(+P.K);
    if (!(lam > 0 && mu > 0 && c >= 1 && N >= 1)) return fail('mmckn', 'Ingresa λ > 0 (por cliente), μ > 0, c ≥ 1 y N ≥ 1.');
    K = Math.min(K, N); if (K < c) K = Math.min(c, N);
    const r = base('mmckn', { lam, mu, c, K, N, a: lam / mu, rho: N * lam / (c * mu), kendall: `M/M/${c}/${K}/${N}` });
    const lamF = (n) => (n < K ? (N - n) * lam : 0), muF = (n) => Math.min(n, c) * mu;
    const p = bdSolve(lamF, muF, K);
    bdMetrics(r, p, lamF, c, mu, 0, 0);
    let offered = 0; for (let n = 0; n < p.length; n++) offered += (N - n) * lam * p[n];
    r.lam = offered; r.Pblock = offered > 0 ? 1 - r.lamEff / offered : 0; r.Plost = r.Pblock;
    r.operational = (N - r.L) / N;
    r.formulas = ['λₙ = (N − n)·λ  (λ = tasa por cliente individual) ;  μₙ = min(n,c)·μ', 'Pₙ = P₀ · Πᵢ λᵢ₋₁/μᵢ', 'λ_ef = Σ λₙPₙ = λ(N − L)  (si K = N)', 'W = L/λ_ef ;  Wq = Lq/λ_ef', 'Fracción operando = (N − L)/N'];
    r.notes.push('En fuente finita la tasa λ es por cliente: si cada máquina falla en promedio cada 8 h, λ = 1/8 por hora.');
    return r;
  }

  function erlangA(P) {
    const lam = +P.lam, mu = +P.mu, c = Math.round(+P.c), theta = +P.theta || 0;
    const K = +P.K > 0 ? Math.round(+P.K) : null;
    if (!(lam > 0 && mu > 0 && c >= 1)) return fail('erlangA', 'Ingresa λ > 0, μ > 0 y c ≥ 1.');
    if (!(theta > 0) && K == null) { const r = mmc({ lam, mu, c }); r.model = 'erlangA'; r.notes.push('Sin abandono (θ = 0) el modelo Erlang A se reduce a Erlang C.'); return r; }
    if (K != null && K < c) return fail('erlangA', 'K debe ser ≥ c.');
    const r = base('erlangA', { lam, mu, c, K, theta, a: lam / mu, rho: lam / (c * mu), kendall: `M/M/${c}${K ? '/' + K : ''}+M` });
    const lamF = (n) => (K == null || n < K ? lam : 0), muF = (n) => Math.min(n, c) * mu + Math.max(n - c, 0) * theta;
    const p = bdSolve(lamF, muF, K, c + 20);
    bdMetrics(r, p, lamF, c, mu, theta, lam);
    if (K != null) r.Pblock = p[p.length - 1] * (p.length - 1 === K ? 1 : 0);
    r.Plost = r.Pblock + (1 - r.Pblock) * r.Pab;
    r.thr = r.Ls * mu;
    r.formulas = ['λₙ = λ ;  μₙ = min(n,c)·μ + max(n−c,0)·θ   (θ = 1/paciencia media)', 'Pₙ = P₀ · Πᵢ λ/μᵢ  (siempre estable si θ > 0)', 'P(abandono) = θ·Lq/λ', 'NS(t) = Σ qₙ·uₙ₋c(t),  u resuelto por ecuaciones de Kolmogorov', 'Throughput = μ·E[ocupados]'];
    if (r.rho >= 1) r.notes.push('ρ ≥ 1: la sobrecarga se equilibra por abandonos; revisa la tasa de abandono.');
    return r;
  }

  // Probabilidad de NO rechazar (balking) dado q clientes esperando
  A.balkKeep = (b, q) => {
    if (!b || b.type === 'none') return 1;
    const L = Math.max(1e-9, +b.L || 1);
    switch (b.type) {
      case 'threshold': return q < L ? 1 : 0;
      case 'linear': return Math.max(0, 1 - q / L);
      case 'exp': return Math.exp(-q / L);
      default: return 1;
    }
  };

  function bdGeneral(P) {
    const lam = +P.lam, mu = +P.mu, c = Math.round(+P.c), theta = +P.theta || 0;
    const K = +P.K > 0 ? Math.round(+P.K) : null; const balk = P.balk || { type: 'none' };
    if (!(lam > 0 && mu > 0 && c >= 1)) return fail('bd', 'Ingresa λ > 0, μ > 0 y c ≥ 1.');
    if (K != null && K < c) return fail('bd', 'K debe ser ≥ c.');
    const finiteByBalk = balk.type === 'threshold' || balk.type === 'linear';
    if (!(theta > 0) && K == null && (balk.type === 'none' || !balk.type) && lam >= c * mu)
      return fail('bd', `Sistema inestable: sin abandono, rechazo ni capacidad, ρ = ${U.fmt(lam / (c * mu), 3)} ≥ 1.`);
    const r = base('bd', { lam, mu, c, K, theta, a: lam / mu, rho: lam / (c * mu), kendall: `M/M/${c}${K ? '/' + K : ''}${theta > 0 ? '+M' : ''}` });
    const lamF = (n) => ((K == null || n < K) ? lam * (n < c ? 1 : A.balkKeep(balk, n - c)) : 0);
    const muF = (n) => Math.min(n, c) * mu + Math.max(n - c, 0) * theta;
    const p = bdSolve(lamF, muF, K, c + 20);
    bdMetrics(r, p, lamF, c, mu, theta, lam);
    const pK = K != null && p.length - 1 === K ? p[K] : 0;
    r.Pblock = pK; r.Pbalk = Math.max(0, 1 - r.lamEff / lam - pK);
    r.Plost = r.Pblock + r.Pbalk + (r.lamEff / lam) * r.Pab;
    r.formulas = ['λₙ = λ·bₙ  con bₙ = P(no rechazar | n−c en fila)', 'μₙ = min(n,c)·μ + max(n−c,0)·θ', 'Pₙ = P₀ · Πᵢ λᵢ₋₁/μᵢ', 'P(rechazo) = 1 − λ_ef/λ − P_K ;  P(abandono) = θ·Lq/λ_ef'];
    if (finiteByBalk) r.notes.push('El rechazo por umbral o lineal limita la fila, así que el sistema siempre es estable.');
    return r;
  }

  function mg1(P) {
    const lam = +P.lam, S = P.S; // S: momentos en horas {m1, m2, m3, scv}
    if (!(lam > 0 && S && S.m1 > 0)) return fail('mg1', 'Ingresa λ > 0 y una distribución de servicio válida.');
    const rho = lam * S.m1;
    const r = base('mg1', { lam, mu: 1 / S.m1, c: 1, a: rho, rho, kendall: `M/${P.kendallS || 'G'}/1` });
    if (rho >= 1) return fail('mg1', `Sistema inestable: ρ = λ·E[S] = ${U.fmt(rho, 3)} ≥ 1.`, { rho, a: rho });
    const Wq = lam * S.m2 / (2 * (1 - rho)), Lq = lam * Wq, W = Wq + S.m1, L = lam * W;
    const EW2 = 2 * Wq * Wq + lam * S.m3 / (3 * (1 - rho));
    const wqSd = Math.sqrt(Math.max(0, EW2 - Wq * Wq));
    Object.assign(r, { P0: 1 - rho, L, Lq, W, Wq, Ls: rho, lamEff: lam, util: rho, thr: lam, Pw: rho, wqSd });
    // Aproximación gamma de dos momentos para la espera condicional (exacta para M/M/1)
    const mC = Wq / rho, vC = Math.max(1e-30, EW2 / rho - mC * mC);
    const shape = mC * mC / vC, scale = vC / mC;
    r.sl = (t) => 1 - rho + rho * U.gammaP(shape, t / scale);
    r.wqPct = (p) => invertSL(r.sl, p, Wq);
    r.approx = Math.abs(S.scv - 1) > 1e-9; if (r.approx) r.notes.push('La media y la varianza de la espera son exactas (Pollaczek-Khinchine y Takács). Los percentiles y el nivel de servicio usan una aproximación gamma de dos momentos: error medido en el percentil 90 de hasta 8 % (tests/PRECISION_APROXIMACIONES.md).');
    r.formulas = ['ρ = λ·E[S]', 'Lq = λ²·E[S²] / (2(1 − ρ)) = ρ²(1 + Cs²)/(2(1 − ρ))   (Pollaczek-Khinchine)', 'Wq = Lq/λ ;  W = Wq + E[S] ;  L = λW', 'E[Wq²] = 2Wq² + λE[S³]/(3(1 − ρ))   (Takács)'];
    return r;
  }

  function mgc(P) {
    const lam = +P.lam, c = Math.round(+P.c), S = P.S;
    if (!(lam > 0 && S && S.m1 > 0 && c >= 1)) return fail('mgc', 'Ingresa λ > 0, c ≥ 1 y un servicio válido.');
    const base0 = mmc({ lam, mu: 1 / S.m1, c });
    if (!base0.ok) { base0.model = 'mgc'; return base0; }
    const f = (1 + S.scv) / 2;
    const Wq = base0.Wq * f, W = Wq + S.m1;
    const r = base('mgc', { lam, mu: 1 / S.m1, c, a: base0.a, rho: base0.rho, kendall: `M/${P.kendallS || 'G'}/${c}`, approx: true,
      P0: base0.P0, L: lam * W, Lq: lam * Wq, W, Wq, Ls: base0.a, lamEff: lam, util: base0.rho, thr: lam, Pw: base0.Pw });
    const C = base0.Pw, mC = Wq / C;
    r.sl = (t) => 1 - C * Math.exp(-t / mC); r.wqPct = (p) => (C <= 1 - p ? 0 : mC * Math.log(C / (1 - p)));
    r.notes.push('Aproximación de dos momentos (Lee y Longton, 1959): Wq(M/G/c) ≈ Wq(M/M/c)·(1 + Cs²)/2. Error medido contra simulación en 36 casos (c = 2 a 10, ρ = 0,5 a 0,85, Cs² = 0 a 2): mediana 6 %, hasta 38 % cuando la espera es de pocos segundos o el servicio es lognormal muy variable. Para decidir con servicios muy variables, confirma con el simulador.');
    r.formulas = ['Wq(M/G/c) ≈ Wq(M/M/c) · (1 + Cs²)/2', 'Cs² = Var[S]/E[S]²', 'W = Wq + E[S] ;  L = λW'];
    return r;
  }

  function gg1(P) {
    const Am = P.A, S = P.S; // momentos en horas
    if (!(Am && Am.m1 > 0 && S && S.m1 > 0)) return fail('gg1', 'Ingresa distribuciones válidas de llegada y de servicio.');
    const lam = 1 / Am.m1, rho = lam * S.m1, ca2 = Am.scv, cs2 = S.scv;
    if (rho >= 1) return fail('gg1', `Sistema inestable: ρ = ${U.fmt(rho, 3)} ≥ 1.`, { rho });
    const kingman = S.m1 * (rho / (1 - rho)) * (ca2 + cs2) / 2;
    let g = 1;
    if (P.klb !== false) g = ca2 <= 1 ? Math.exp(-2 * (1 - rho) * (1 - ca2) ** 2 / (3 * rho * (ca2 + cs2) || 1)) : Math.exp(-(1 - rho) * (ca2 - 1) / (ca2 + 4 * cs2));
    const Wq = kingman * g, W = Wq + S.m1;
    const r = base('gg1', { lam, mu: 1 / S.m1, c: 1, a: rho, rho, kendall: `${P.kendallA || 'G'}/${P.kendallS || 'G'}/1`, approx: true,
      P0: 1 - rho, L: lam * W, Lq: lam * Wq, W, Wq, Ls: rho, lamEff: lam, util: rho, thr: lam, Pw: Math.abs(ca2 - 1) < 1e-9 ? rho : NaN, ca2, cs2 });
    if (Math.abs(ca2 - 1) >= 1e-9) r.notes.push('P(esperar) no se reporta: es igual a ρ solo con llegadas de Poisson (propiedad PASTA).');
    r.notes.push(`Aproximación de Kingman${P.klb !== false ? ' con la corrección de Krämer-Langenbach-Belz (g = ' + U.fmt(g, 3) + ')' : ''}. Error medido contra simulación en 30 casos (ρ = 0,6 a 0,9, Ca² = 0,5 y 2, Cs² = 0 a 2): mediana 3 %, máximo 6 %.`);
    r.formulas = ['Wq ≈ E[S] · ρ/(1 − ρ) · (Ca² + Cs²)/2   (Kingman)', 'Corrección KLB: g = exp[−2(1−ρ)(1−Ca²)²/(3ρ(Ca²+Cs²))] si Ca² ≤ 1 ; g = exp[−(1−ρ)(Ca²−1)/(Ca²+4Cs²)] si Ca² > 1', 'W = Wq + E[S] ;  L = λW'];
    return r;
  }

  function ggc(P) {
    const Am = P.A, S = P.S, c = Math.round(+P.c);
    if (!(Am && Am.m1 > 0 && S && S.m1 > 0 && c >= 1)) return fail('ggc', 'Ingresa distribuciones válidas y c ≥ 1.');
    const lam = 1 / Am.m1; const b = mmc({ lam, mu: 1 / S.m1, c });
    if (!b.ok) { b.model = 'ggc'; return b; }
    const f = (Am.scv + S.scv) / 2; const Wq = b.Wq * f, W = Wq + S.m1;
    const r = base('ggc', { lam, mu: 1 / S.m1, c, a: b.a, rho: b.rho, kendall: `${P.kendallA || 'G'}/${P.kendallS || 'G'}/${c}`, approx: true,
      P0: b.P0, L: lam * W, Lq: lam * Wq, W, Wq, Ls: b.a, lamEff: lam, util: b.rho, thr: lam, Pw: b.Pw, ca2: Am.scv, cs2: S.scv });
    const C = b.Pw, mC = Wq / C;
    r.sl = (t) => 1 - C * Math.exp(-t / mC); r.wqPct = (p) => (C <= 1 - p ? 0 : mC * Math.log(C / (1 - p)));
    r.notes.push('Aproximación de Allen-Cunneen (también usada en el método QNA de Whitt). Error medido contra simulación en 24 casos (c = 2 y 5, ρ = 0,7 y 0,9): mediana 6 %, hasta 49 % cuando la espera es de pocos segundos; tiende a sobrestimar con llegadas regulares (Ca² < 1) y a subestimar con llegadas muy variables (Ca² > 1). Para decidir, confirma con el simulador.');
    r.formulas = ['Wq(G/G/c) ≈ Wq(M/M/c) · (Ca² + Cs²)/2', 'Ca² = Var[A]/E[A]² (entre llegadas) ;  Cs² = Var[S]/E[S]²', 'W = Wq + E[S] ;  L = λW'];
    return r;
  }

  function mxg1(P) {
    const lamB = +P.lamB, X = P.X, S = P.S;
    if (!(lamB > 0 && X && X.m1 >= 1 && S && S.m1 > 0)) return fail('mxg1', 'Ingresa la tasa de grupos, el tamaño de grupo y el servicio.');
    const lam = lamB * X.m1, rho = lam * S.m1;
    if (rho >= 1) return fail('mxg1', `Sistema inestable: ρ = λ_g·E[X]·E[S] = ${U.fmt(rho, 3)} ≥ 1.`, { rho });
    const Wq = (lamB * X.m1 * S.m2 / 2 + S.m1 * (X.m2 - X.m1) / (2 * X.m1)) / (1 - rho);
    const W = Wq + S.m1;
    const r = base('mxg1', { lam, lamB, mu: 1 / S.m1, c: 1, a: rho, rho, kendall: `Mˣ/${P.kendallS || 'G'}/1`,
      P0: 1 - rho, L: lam * W, Lq: lam * Wq, W, Wq, Ls: rho, lamEff: lam, util: rho, thr: lam, Pw: NaN });
    r.formulas = ['λ = λ_g·E[X] ;  ρ = λ·E[S]', 'Wq = [ λ_g·E[X]·E[S²]/2 + E[S]·(E[X²] − E[X])/(2E[X]) ] / (1 − ρ)', 'W = Wq + E[S] ;  L = λW'];
    r.notes.push('Incluye la espera dentro del propio grupo (los integrantes se atienden uno tras otro).');
    return r;
  }

  function prio(P) {
    const c = Math.round(+P.c) || 1, pre = !!P.preemptive;
    const cls = (P.classes || []).filter((k) => k.lam > 0 && k.S && k.S.m1 > 0).slice().sort((a, b) => a.prio - b.prio);
    if (!cls.length) return fail('prio', 'Define al menos una clase con λ > 0 y servicio válido.');
    const lam = cls.reduce((s, k) => s + k.lam, 0);
    const per = [];
    let notes = [];
    if (c === 1) {
      let sigPrev = 0, Rk = 0; const R = cls.reduce((s, k) => s + k.lam * k.S.m2 / 2, 0);
      for (const k of cls) {
        const sig = sigPrev + k.lam * k.S.m1; Rk += k.lam * k.S.m2 / 2;
        let Wq, W;
        if (sig >= 1) { Wq = Infinity; W = Infinity; }
        else if (!pre) { Wq = R / ((1 - sigPrev) * (1 - sig)); W = Wq + k.S.m1; }
        else { W = k.S.m1 / (1 - sigPrev) + Rk / ((1 - sigPrev) * (1 - sig)); Wq = W - k.S.m1; }
        per.push({ name: k.name, prio: k.prio, lam: k.lam, Wq, W, Lq: k.lam * Wq, L: k.lam * W, rho: k.lam * k.S.m1 });
        sigPrev = sig;
      }
    } else {
      const m1 = cls.reduce((s, k) => s + k.lam * k.S.m1, 0) / lam;
      if (cls.some((k) => Math.abs(k.S.m1 - m1) / m1 > 0.02)) notes.push('Con c > 1 la fórmula exacta supone el mismo tiempo medio de servicio para todas las clases; se usó el promedio ponderado ' + U.fmtTime(m1 * 60) + '.');
      if (cls.some((k) => Math.abs(k.S.scv - 1) > 0.05)) notes.push('Con c > 1 se supone servicio exponencial; para otros servicios valida con el simulador.');
      const mu = 1 / m1;
      if (!pre) {
        const C = A.erlangC(c, lam / mu); let sigPrev = 0;
        for (const k of cls) {
          const sig = sigPrev + k.lam / (c * mu);
          const Wq = sig >= 1 || lam >= c * mu ? Infinity : (C / (c * mu)) / ((1 - sigPrev) * (1 - sig));
          per.push({ name: k.name, prio: k.prio, lam: k.lam, Wq, W: Wq + m1, Lq: k.lam * Wq, L: k.lam * (Wq + m1), rho: k.lam / (c * mu) });
          sigPrev = sig;
        }
      } else {
        let cum = 0, prevTot = 0;
        const Wbar = (L) => { if (L <= 0) return 0; const r = mmc({ lam: L, mu, c }); return r.ok ? r.W : Infinity; };
        for (const k of cls) {
          const cumNew = cum + k.lam; const wNew = Wbar(cumNew);
          const W = isFinite(wNew) ? (cumNew * wNew - prevTot) / k.lam : Infinity;
          per.push({ name: k.name, prio: k.prio, lam: k.lam, Wq: W - m1, W, Lq: k.lam * (W - m1), L: k.lam * W, rho: k.lam / (c * mu) });
          prevTot = cumNew * wNew; cum = cumNew;
        }
      }
    }
    const tot = per.reduce((s, k) => s + k.lam, 0);
    const Wq = per.reduce((s, k) => s + k.lam * k.Wq, 0) / tot, W = per.reduce((s, k) => s + k.lam * k.W, 0) / tot;
    const m1all = cls.reduce((s, k) => s + k.lam * k.S.m1, 0) / lam;
    const rho = lam * m1all / c;
    const r = base('prio', { lam, c, mu: 1 / m1all, a: lam * m1all, rho, kendall: `M/${c === 1 ? 'G' : 'M'}/${c}/${pre ? 'PR' : 'NPR'}`, perClass: per,
      L: lam * W, Lq: lam * Wq, W, Wq, Ls: lam * m1all, lamEff: lam, util: rho, thr: lam, P0: c === 1 ? 1 - rho : NaN, Pw: NaN });
    if (!isFinite(Wq)) { r.ok = per.some((k) => isFinite(k.Wq)); r.error = 'Al menos una clase es inestable (σₖ ≥ 1): sus clientes esperan indefinidamente.'; }
    r.notes = notes;
    r.formulas = c === 1 ? (pre
      ? ['σₖ = Σᵢ≤ₖ λᵢE[Sᵢ]', 'Wₖ = E[Sₖ]/(1 − σₖ₋₁) + (Σᵢ≤ₖ λᵢE[Sᵢ²]/2) / ((1 − σₖ₋₁)(1 − σₖ))   (expropiativa con reanudación)']
      : ['σₖ = Σᵢ≤ₖ λᵢE[Sᵢ] ;  W₀ = Σᵢ λᵢE[Sᵢ²]/2', 'Wq,ₖ = W₀ / ((1 − σₖ₋₁)(1 − σₖ))   (fórmula de Cobham)'])
      : (pre ? ['Las clases 1..k se comportan como un M/M/c con λ = Σᵢ≤ₖ λᵢ', 'λₖWₖ = Λₖ·W̄(Λₖ) − Λₖ₋₁·W̄(Λₖ₋₁)']
        : ['Wq,ₖ = [C(c,a)/(cμ)] / ((1 − σₖ₋₁)(1 − σₖ)),  σₖ = Σᵢ≤ₖ λᵢ/(cμ)   (Hillier-Lieberman)']);
    return r;
  }

  function tandem(P) {
    const lam = +P.lam; let ca2 = P.ca2 != null ? +P.ca2 : 1; const st = P.stations || [];
    if (!(lam > 0 && st.length)) return fail('tandem', 'Ingresa λ > 0 y al menos una estación.');
    const out = []; let W = 0, Lq = 0, unstable = null, exact = Math.abs(ca2 - 1) < 1e-9;
    st.forEach((s, i) => {
      const c = Math.round(+s.c) || 1, S = s.S; const rho = lam * S.m1 / c;
      if (rho >= 1) { unstable = unstable || `La estación ${i + 1} (${s.name || ''}) es inestable: ρ = ${U.fmt(rho, 3)}.`; out.push({ name: s.name, c, rho, Wq: Infinity, W: Infinity, ca2 }); return; }
      const b = mmc({ lam, mu: 1 / S.m1, c });
      const Wq = b.Wq * (ca2 + S.scv) / 2;
      if (Math.abs(S.scv - 1) > 1e-9) exact = false;
      out.push({ name: s.name, c, rho, Wq, W: Wq + S.m1, Lq: lam * Wq, L: lam * (Wq + S.m1), ca2, cs2: S.scv });
      W += Wq + S.m1; Lq += lam * Wq;
      ca2 = 1 + (1 - rho * rho) * (ca2 - 1) + rho * rho * (S.scv - 1) / Math.sqrt(c);
    });
    if (unstable) return fail('tandem', unstable, { stations: out });
    const bott = out.reduce((b, s, i) => (s.rho > out[b].rho ? i : b), 0);
    const r = base('tandem', { lam, c: NaN, kendall: `Red en serie (${st.length} estaciones)`, stations: out, approx: !exact,
      L: lam * W, Lq, W, Wq: W - st.reduce((s, x) => s + x.S.m1, 0), lamEff: lam, thr: lam, rho: out[bott].rho, util: out[bott].rho, bottleneck: bott });
    r.notes.push(exact ? 'Red de Jackson: con llegadas Poisson y servicios exponenciales cada estación se comporta como un M/M/c independiente (teorema de Burke); resultado exacto.' : 'Aproximación QNA de Whitt (1983): la variabilidad de salida de cada estación alimenta a la siguiente. Error medido contra simulación en 6 redes de dos estaciones: máximo 6 %.');
    r.notes.push(`Cuello de botella: estación ${bott + 1} (${out[bott].name || ''}) con ρ = ${U.fmt(out[bott].rho, 3)}.`);
    r.formulas = ['Wq,ᵢ ≈ Wq(M/M/cᵢ) · (Ca,ᵢ² + Cs,ᵢ²)/2', 'Cd² = 1 + (1 − ρ²)(Ca² − 1) + ρ²(Cs² − 1)/√c   → Ca² de la siguiente estación', 'W = Σ (Wq,ᵢ + E[Sᵢ]) ;  L = λW'];
    return r;
  }

  A.compute = function (id, P) {
    try {
      switch (id) {
        case 'mm1': return mmc(Object.assign({}, P, { c: 1 }));
        case 'mmc': return mmc(P);
        case 'mmck': return mmck(P);
        case 'mmcc': return mmcc(P);
        case 'mminf': return mminf(P);
        case 'mmckn': return mmckn(P);
        case 'erlangA': return erlangA(P);
        case 'bd': return bdGeneral(P);
        case 'mg1': return mg1(P);
        case 'mgc': return mgc(P);
        case 'gg1': return gg1(P);
        case 'ggc': return ggc(P);
        case 'mxg1': return mxg1(P);
        case 'prio': return prio(P);
        case 'tandem': return tandem(P);
        default: return fail(id, 'Modelo no reconocido.');
      }
    } catch (e) { return fail(id, 'Error de cálculo: ' + e.message); }
  };

  // Costos por hora: servidores + espera + clientes perdidos
  A.costs = (r, k) => {
    const servers = (isFinite(r.c) ? r.c : 0) * (k.server || 0);
    const waiting = (r.Lq || 0) * (k.wait || 0);
    const lost = (r.lam || 0) * (r.Plost || 0) * (k.lost || 0);
    return { servers, waiting, lost, total: servers + waiting + lost };
  };

  /* ------------- Dimensionamiento: servidores mínimos para una meta ------------- */
  // target: {type:'sl'|'asa'|'pwait'|'pab', value, t (horas para NS), maxOcc}
  // Todas las métricas son monótonas en c, así que se usa búsqueda binaria.
  A.requiredServers = function (lam, mu, target, theta, cMax = 5000) {
    if (!(lam > 0)) return { c: 0, r: null };
    const a = lam / mu;
    const evalC = (c) => {
      const r = theta > 0 ? erlangA({ lam, mu, c, theta }) : mmc({ lam, mu, c });
      if (!r.ok) return { pass: false, r };
      if (target.maxOcc && r.util > target.maxOcc + 1e-12) return { pass: false, r };
      let pass = true;
      switch (target.type) {
        case 'sl': pass = r.sl(target.t) >= target.value - 1e-12; break;
        case 'asa': pass = r.Wq <= target.value + 1e-12; break;
        case 'pwait': pass = r.Pw <= target.value + 1e-12; break;
        case 'pab': pass = (r.Pab || 0) <= target.value + 1e-12; break;
        default: pass = true;
      }
      return { pass, r };
    };
    let lo = theta > 0 ? 1 : Math.floor(a) + 1;
    if (target.maxOcc) lo = Math.max(lo, Math.ceil(a / target.maxOcc - 1e-9));
    let hi = Math.max(lo, Math.ceil(a + 3 * Math.sqrt(a) + 2));
    let e = evalC(hi);
    while (!e.pass && hi < cMax) { lo = hi + 1; hi = Math.min(cMax, hi * 2); e = evalC(hi); }
    if (!e.pass) return { c: Infinity, r: null };
    let best = hi, bestR = e.r;
    while (lo < hi) {
      const mid = (lo + hi) >> 1; const em = evalC(mid);
      if (em.pass) { hi = mid; best = mid; bestR = em.r; } else lo = mid + 1;
    }
    if (best !== lo) { const el = evalC(lo); if (el.pass) { best = lo; bestR = el.r; } }
    return { c: best, r: bestR };
  };
  // Regla de la raíz cuadrada (Halfin-Whitt): c ≈ a + β√a
  A.sqrtStaffing = (a, pwait) => {
    // P(espera) ≈ [1 + β·Φ(β)/φ(β)]⁻¹ → resolver β por bisección
    let lo = -3, hi = 6;
    for (let i = 0; i < 80; i++) { const b = (lo + hi) / 2; const pw = 1 / (1 + b * U.normCdf(b) / U.normPdf(b)); if (pw > pwait) lo = b; else hi = b; }
    const beta = (lo + hi) / 2; return { beta, c: a + beta * Math.sqrt(a) };
  };
})(typeof window !== 'undefined' ? window : globalThis);
