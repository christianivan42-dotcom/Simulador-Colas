/* Validación del núcleo: fórmulas analíticas vs valores de referencia y vs simulación.
   Ejecutar con:  node tests/validacion.js  */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
for (const f of ['util.js', 'rng.js', 'analytic.js', 'engine.js']) {
  vm.runInThisContext(fs.readFileSync(path.join(__dirname, '..', 'js', f), 'utf8'), { filename: f });
}
const { Analytic: A, Sim, Dist, U } = globalThis.QS;

let fails = 0, passes = 0;
function check(name, got, exp, tolRel, tolAbs = 0) {
  const ok = Math.abs(got - exp) <= Math.max(tolAbs, Math.abs(exp) * tolRel);
  if (ok) passes++; else fails++;
  console.log(`${ok ? 'OK  ' : 'FALLA'} ${name}: obtenido ${fmt(got)} | esperado ${fmt(exp)}`);
}
const fmt = (x) => (typeof x === 'number' ? (Math.abs(x) < 1e-3 && x !== 0 ? x.toExponential(4) : x.toFixed(5)) : String(x));

console.log('\n=== 1. Valores de referencia (libros) ===');
let r = A.compute('mm1', { lam: 2, mu: 3 });
check('M/M/1 L', r.L, 2, 1e-9); check('M/M/1 Lq', r.Lq, 4 / 3, 1e-9); check('M/M/1 W (h)', r.W, 1, 1e-9); check('M/M/1 Wq (h)', r.Wq, 2 / 3, 1e-9);
check('M/M/1 P0', r.P0, 1 / 3, 1e-9); check('M/M/1 P(Wq>0.5h)', 1 - r.sl(0.5), (2 / 3) * Math.exp(-0.5), 1e-9);
// Erlang C por suma directa
function erlangCdirect(c, a) { let s = 0, f = 1; for (let n = 0; n < c; n++) { if (n > 0) f *= a / n; s += f; } const ac = f * a / c; const top = ac / (1 - a / c); return top / (s + top); }
function erlangBdirect(c, a) { let s = 0, f = 1; for (let n = 0; n <= c; n++) { if (n > 0) f *= a / n; s += f; } return f / s; }
check('Erlang C(12, 10)', A.erlangC(12, 10), erlangCdirect(12, 10), 1e-10);
check('Erlang C(12, 10) ≈ 0.4494', A.erlangC(12, 10), 0.4494, 2e-3);
check('Erlang B(12, 10)', A.erlangB(12, 10), erlangBdirect(12, 10), 1e-10);
check('Erlang B(100, 90) recursivo', A.erlangB(100, 90), erlangBdirect(100, 90), 1e-8);
r = A.compute('mmc', { lam: 10, mu: 1, c: 12 });
check('M/M/12 ΣPn ≈ 1', U.sum(r.pn), 1, 1e-3);
check('M/M/12 Pw = ΣPn(n≥c)', 1 - U.sum(r.pn.slice(0, 12)), r.Pw, 2e-3);
// Hillier-Lieberman: M/M/2 λ=2, μ=3 → P0 = 0.5, Lq = 1/12
r = A.compute('mmc', { lam: 2, mu: 3, c: 2 });
check('M/M/2 P0 (Hillier)', r.P0, 0.5, 1e-9); check('M/M/2 Lq', r.Lq, 1 / 12, 1e-9);
// M/D/1: λ=0.5, μ=1 → Lq = ρ²/(2(1-ρ)) = 0.25
r = A.compute('mg1', { lam: 0.5, S: { m1: 1, m2: 1, m3: 1, scv: 0 } });
check('M/D/1 Lq', r.Lq, 0.25, 1e-9);
// M/M/1/K vs fórmula cerrada: P_K = (1-ρ)ρ^K/(1-ρ^(K+1))
r = A.compute('mmck', { lam: 4, mu: 5, c: 1, K: 6 });
const rho = 0.8; check('M/M/1/6 P_K', r.Pblock, (1 - rho) * rho ** 6 / (1 - rho ** 7), 1e-9);
check('M/M/1/6 L', r.L, rho / (1 - rho) - 7 * rho ** 7 / (1 - rho ** 7), 1e-9);
// M/M/∞
r = A.compute('mminf', { lam: 30, mu: 2 }); check('M/M/∞ L', r.L, 15, 1e-12);
// Erlang A con θ = μ equivale a M/M/∞ (todos salen a tasa μ)
r = A.compute('erlangA', { lam: 10, mu: 2, c: 3, theta: 2 }); check('Erlang A θ=μ ⇒ L = a', r.L, 5, 1e-6);
// Regla de raíz cuadrada (valor conocido: Pw = 0.2 → β ≈ 1.06)
check('Halfin-Whitt β(Pw=0.2)', A.sqrtStaffing(100, 0.2).beta, 1.06, 0.02);
// Dimensionamiento: 80/20 con λ=360/h, AHT=3 min → a = 18 Erlangs
let req = A.requiredServers(360, 20, { type: 'sl', value: 0.8, t: 20 / 3600 }, 0);
const rBelow = A.compute('mmc', { lam: 360, mu: 20, c: req.c - 1 });
console.log(`     80/20 con 18 Erlangs → ${req.c} agentes (NS ${(req.r.sl(20 / 3600) * 100).toFixed(1)} %; con ${req.c - 1}: ${(rBelow.sl(20 / 3600) * 100).toFixed(1)} %)`);
check('80/20 cumple con c y no con c-1', (req.r.sl(20 / 3600) >= 0.8 && rBelow.sl(20 / 3600) < 0.8) ? 1 : 0, 1, 0);
// Cobham para 2 clases M/M/1
const S1 = Dist.moments(Dist.make({ type: 'exp', mean: 1 }), 1 / 60);
r = A.compute('prio', { c: 1, preemptive: false, classes: [{ name: 'A', prio: 1, lam: 20, S: S1 }, { name: 'B', prio: 2, lam: 25, S: S1 }] });
const W0 = (45 * 2 / 3600) / 2; const s1 = 20 / 60, s2 = 45 / 60;
check('Cobham Wq clase 1 (h)', r.perClass[0].Wq, W0 / (1 - s1), 1e-9); check('Cobham Wq clase 2 (h)', r.perClass[1].Wq, W0 / ((1 - s1) * (1 - s2)), 1e-9);
// Ley de conservación: λ-promedio de Wq (no expropiativa) = Wq de M/M/1 FIFO
const mm1 = A.compute('mm1', { lam: 45, mu: 60 });
check('Conservación de Kleinrock', r.Wq, mm1.Wq, 1e-9);

console.log('\n=== 1b. Verificación independiente: cadena de Markov resuelta por eliminación gaussiana ===');
// Resuelve πQ = 0, Σπ = 1 para un proceso de nacimiento y muerte truncado, sin usar la fórmula de producto del programa
function ctmcBD(lamF, muF, N) {
  const n = N + 1; const M = Array.from({ length: n }, () => new Float64Array(n + 1));
  for (let i = 0; i < n; i++) { const up = i < N ? lamF(i) : 0, dn = i > 0 ? muF(i) : 0; if (i < N) M[i + 1][i] += up; if (i > 0) M[i - 1][i] += dn; M[i][i] -= up + dn; }
  for (let j = 0; j < n; j++) M[n - 1][j] = 1; M[n - 1][n] = 1;
  for (let col = 0; col < n; col++) {
    let piv = col; for (let r2 = col + 1; r2 < n; r2++) if (Math.abs(M[r2][col]) > Math.abs(M[piv][col])) piv = r2;
    [M[col], M[piv]] = [M[piv], M[col]];
    for (let r2 = 0; r2 < n; r2++) { if (r2 === col) continue; const f = M[r2][col] / M[col][col]; if (!f) continue; for (let k = col; k <= n; k++) M[r2][k] -= f * M[col][k]; }
  }
  return Array.from({ length: n }, (_, i) => M[i][n] / M[i][i]);
}
const bdStats = (pi, lamF, c) => { let L = 0, Lq = 0, lamEff = 0; pi.forEach((x, k) => { L += k * x; Lq += Math.max(0, k - c) * x; lamEff += lamF(k) * x; }); return { L, Lq, lamEff }; };
{
  // M/M/2/6
  const lamF = (k) => (k < 6 ? 100 : 0), muF = (k) => Math.min(k, 2) * 40; const pi = ctmcBD(lamF, muF, 6); const x = bdStats(pi, lamF, 2);
  const r1 = A.compute('mmck', { lam: 100, mu: 40, c: 2, K: 6 });
  check('Markov M/M/2/6 L', r1.L, x.L, 1e-9); check('Markov M/M/2/6 Lq', r1.Lq, x.Lq, 1e-9); check('Markov M/M/2/6 P(bloqueo)', r1.Pblock, pi[6], 1e-9); check('Markov M/M/2/6 W', r1.W, x.L / x.lamEff, 1e-9);
}
{
  // Fuente finita con capacidad menor que la población: M/M/3/5/12
  const lamF = (k) => (k < 5 ? (12 - k) * 2 : 0), muF = (k) => Math.min(k, 3) * 6; const pi = ctmcBD(lamF, muF, 5); const x = bdStats(pi, lamF, 3);
  let offered = 0; pi.forEach((v, k) => { offered += (12 - k) * 2 * v; });
  const r1 = A.compute('mmckn', { lam: 2, mu: 6, c: 3, N: 12, K: 5 });
  check('Markov fuente finita M/M/3/5/12 L', r1.L, x.L, 1e-9); check('Markov fuente finita W', r1.W, x.L / x.lamEff, 1e-9); check('Markov fuente finita P(bloqueo)', r1.Pblock, 1 - x.lamEff / offered, 1e-9);
}
{
  // Erlang A: λ=100/h, μ=20/h, c=5, θ=12/h (truncado en 300)
  const lamF = () => 100, muF = (k) => Math.min(k, 5) * 20 + Math.max(k - 5, 0) * 12; const pi = ctmcBD(lamF, muF, 300); const x = bdStats(pi, lamF, 5);
  const r1 = A.compute('erlangA', { lam: 100, mu: 20, c: 5, theta: 12 });
  check('Markov Erlang A L', r1.L, x.L, 1e-7); check('Markov Erlang A Lq', r1.Lq, x.Lq, 1e-7); check('Markov Erlang A P(abandono) = θ·Lq/λ', r1.Pab, 12 * x.Lq / 100, 1e-7);
}
{
  // Rechazo exponencial + abandono + capacidad
  const keep = (q) => Math.exp(-q / 5);
  const lamF = (k) => (k < 12 ? 80 * (k < 2 ? 1 : keep(k - 2)) : 0), muF = (k) => Math.min(k, 2) * 37.5 + Math.max(k - 2, 0) * 6; const pi = ctmcBD(lamF, muF, 12); const x = bdStats(pi, lamF, 2);
  const r1 = A.compute('bd', { lam: 80, mu: 37.5, c: 2, theta: 6, K: 12, balk: { type: 'exp', L: 5 } });
  check('Markov rechazo+abandono+K: L', r1.L, x.L, 1e-9); check('Markov rechazo+abandono+K: P(bloqueo)', r1.Pblock, pi[12], 1e-9);
  check('Markov rechazo+abandono+K: P(rechazo)', r1.Pbalk, 1 - x.lamEff / 80 - pi[12], 1e-9); check('Markov rechazo+abandono+K: P(abandono)', r1.Pab, 6 * x.Lq / x.lamEff, 1e-9);
}
{
  // Fórmula cerrada del nivel de servicio de Erlang C frente a la fórmula general (suma de Erlang por estado al llegar)
  const rc = A.compute('mmc', { lam: 60, mu: 24, c: 3 }), rg = A.compute('bd', { lam: 60, mu: 24, c: 3 });
  for (const tm of [0.5, 2, 5]) check(`NS(${tm} min): Erlang C cerrada = suma por estados`, rc.sl(tm / 60), rg.sl(tm / 60), 1e-6);
  // Erlang A con paciencia casi infinita converge a Erlang C
  const ra = A.compute('erlangA', { lam: 60, mu: 24, c: 3, theta: 1e-7 });
  check('Erlang A con θ→0 = Erlang C (Wq)', ra.Wq, rc.Wq, 1e-4); check('Erlang A con θ→0 = Erlang C (NS 2 min)', ra.sl(2 / 60), rc.sl(2 / 60), 1e-4);
}
{
  // Ley de Little (L = λ_ef·W y Lq = λ_ef·Wq) en todos los modelos
  const Sx = (sp) => Dist.moments(Dist.make(sp), 1 / 60);
  const cases = [['mm1', { lam: 40, mu: 60 }], ['mmc', { lam: 100, mu: 30, c: 4 }], ['mmck', { lam: 100, mu: 30, c: 3, K: 8 }], ['mmcc', { lam: 100, mu: 30, c: 4 }],
    ['mmckn', { lam: 2, mu: 6, c: 3, N: 12, K: 5 }], ['erlangA', { lam: 100, mu: 20, c: 5, theta: 12 }], ['bd', { lam: 80, mu: 37.5, c: 2, theta: 6, K: 12, balk: { type: 'linear', L: 6 } }],
    ['mg1', { lam: 40, S: Sx({ type: 'lnorm', mean: 1, sd: 1.5 }) }], ['mgc', { lam: 100, c: 3, S: Sx({ type: 'gamma', mean: 1.5, sd: 1 }) }],
    ['gg1', { A: Sx({ type: 'erlang', mean: 1.6, k: 2 }), S: Sx({ type: 'gamma', mean: 1.2, sd: 0.8 }) }], ['ggc', { c: 3, A: Sx({ type: 'hyper', mean: 0.6, cv: 1.4 }), S: Sx({ type: 'gamma', mean: 1.5, sd: 1 }) }],
    ['mxg1', { lamB: 15, X: { m1: 2, m2: 6 }, S: Sx({ type: 'exp', mean: 1.5 }) }]];
  let worst = 0;
  for (const [id, P] of cases) { const x = A.compute(id, P); const le = x.lamEff; worst = Math.max(worst, Math.abs(x.L - le * x.W) / x.L, x.Lq > 1e-12 ? Math.abs(x.Lq - le * x.Wq) / x.Lq : 0); }
  check('Ley de Little en 12 modelos (error relativo máximo)', worst, 0, 0, 1e-9);
}
{
  // Dimensionamiento: c es el mínimo que cumple la meta (búsqueda exhaustiva)
  let bad = 0, n = 0;
  for (const lamH of [30, 120, 600]) for (const aht of [2, 5]) {
    const mu = 60 / aht;
    const targets = [{ type: 'sl', value: 0.8, t: 20 / 3600 }, { type: 'sl', value: 0.9, t: 1 / 60 }, { type: 'asa', value: 0.5 / 60 }, { type: 'pwait', value: 0.3 }];
    for (const tg of targets) for (const theta of [0, 12]) {
      const res = A.requiredServers(lamH, mu, tg, theta); n++;
      const ok = (c) => { const x = theta > 0 ? A.compute('erlangA', { lam: lamH, mu, c, theta }) : A.compute('mmc', { lam: lamH, mu, c }); if (!x.ok) return false;
        return tg.type === 'sl' ? x.sl(tg.t) >= tg.value - 1e-12 : tg.type === 'asa' ? x.Wq <= tg.value + 1e-12 : x.Pw <= tg.value + 1e-12; };
      let cMin = 1; while (!ok(cMin)) cMin++;
      if (res.c !== cMin) { bad++; console.log(`     diferencia: λ=${lamH} AHT=${aht} ${tg.type} θ=${theta}: programa ${res.c}, exhaustivo ${cMin}`); }
    }
  }
  check(`Dimensionamiento mínimo correcto en ${n} casos (búsqueda exhaustiva)`, bad, 0, 0);
}

console.log('\n=== 2. Simulación vs teoría (réplicas largas en estado estable) ===');
function sim(spec, reps = 6) { return Sim.runRepsSync(spec, reps, { keepWaits: true }); }
const steady = (o) => Object.assign({ run: { hours: 1500, warmupH: 50, reps: 6, seed: 7, drain: false, slT: 2 } }, o);
const tol = 0.05;

// M/M/1 ρ=0.8
let ag = sim(steady({ arrivals: { mode: 'poisson', rate: 48 }, stages: [{ servers: 1, svc: { type: 'exp', mean: 1 } }] }));
r = A.compute('mm1', { lam: 48, mu: 60 });
check('Sim M/M/1 Lq', ag.m.Lq.mean, r.Lq, tol); check('Sim M/M/1 Wq (min)', ag.m.Wq.mean, r.Wq * 60, tol); check('Sim M/M/1 util', ag.m.util.mean, r.util, 0.01);
check('Sim M/M/1 NS(2 min)', ag.m.SL.mean, r.sl(2 / 60), 0.02);
check('Sim M/M/1 P90 espera', ag.m.wqP90.mean, r.wqPct(0.9) * 60, 0.05);
check('Little L = λW', ag.m.L.mean, ag.m.thr.mean * ag.m.W.mean / 60, 0.01);

// M/M/3
ag = sim(steady({ arrivals: { mode: 'poisson', rate: 60 }, stages: [{ servers: 3, svc: { type: 'exp', mean: 2.5 } }] }));
r = A.compute('mmc', { lam: 60, mu: 24, c: 3 });
check('Sim M/M/3 Lq', ag.m.Lq.mean, r.Lq, tol); check('Sim M/M/3 Pw', ag.m.Pwait.mean, r.Pw, 0.03); check('Sim M/M/3 NS(2)', ag.m.SL.mean, r.sl(2 / 60), 0.02);

// M/D/1 y M/E2/1
ag = sim(steady({ arrivals: { mode: 'poisson', rate: 45 }, stages: [{ servers: 1, svc: { type: 'det', mean: 1 } }] }));
r = A.compute('mg1', { lam: 45, S: Dist.moments(Dist.make({ type: 'det', mean: 1 }), 1 / 60) });
check('Sim M/D/1 Wq (min)', ag.m.Wq.mean, r.Wq * 60, tol);
ag = sim(steady({ arrivals: { mode: 'poisson', rate: 45 }, stages: [{ servers: 1, svc: { type: 'erlang', mean: 1, k: 2 } }] }));
r = A.compute('mg1', { lam: 45, S: Dist.moments(Dist.make({ type: 'erlang', mean: 1, k: 2 }), 1 / 60) });
check('Sim M/E2/1 Wq (min)', ag.m.Wq.mean, r.Wq * 60, tol);
// M/G/1 lognormal (CV alto) también exacto en la media
ag = sim(steady({ arrivals: { mode: 'poisson', rate: 40 }, stages: [{ servers: 1, svc: { type: 'lnorm', mean: 1, sd: 1.5 } }] }), 8);
r = A.compute('mg1', { lam: 40, S: Dist.moments(Dist.make({ type: 'lnorm', mean: 1, sd: 1.5 }), 1 / 60) });
check('Sim M/LN/1 Wq (min)', ag.m.Wq.mean, r.Wq * 60, 0.08);

// M/M/2/5
ag = sim(steady({ arrivals: { mode: 'poisson', rate: 100 }, capacity: 5, stages: [{ servers: 2, svc: { type: 'exp', mean: 1.5 } }] }));
r = A.compute('mmck', { lam: 100, mu: 40, c: 2, K: 5 });
check('Sim M/M/2/5 P(bloqueo)', ag.m.Pblock.mean, r.Pblock, 0.03); check('Sim M/M/2/5 L', ag.m.L.mean, r.L, 0.02); check('Sim M/M/2/5 Wq (min)', ag.m.Wq.mean, r.Wq * 60, tol);

// Erlang B: M/M/4/4
ag = sim(steady({ arrivals: { mode: 'poisson', rate: 120 }, capacity: 4, stages: [{ servers: 4, svc: { type: 'exp', mean: 2 } }] }));
check('Sim Erlang B(4, 4)', ag.m.Pblock.mean, A.erlangB(4, 4), 0.03);

// Fuente finita N=10, pensar 60 min, servicio 10 min, c=2
ag = sim(steady({ arrivals: { mode: 'finite', finite: { N: 10, think: { type: 'exp', mean: 60 } } }, stages: [{ servers: 2, svc: { type: 'exp', mean: 10 } }] }));
r = A.compute('mmckn', { lam: 1, mu: 6, c: 2, N: 10 });
check('Sim fuente finita L', ag.m.L.mean, r.L, 0.03); check('Sim fuente finita Wq (min)', ag.m.Wq.mean, r.Wq * 60, tol);

// Erlang A: λ=100/h, S=3 min, c=5, paciencia 5 min
ag = sim(steady({ arrivals: { mode: 'poisson', rate: 100 }, renege: { on: true, dist: { type: 'exp', mean: 5 } }, stages: [{ servers: 5, svc: { type: 'exp', mean: 3 } }], run: { hours: 1500, warmupH: 50, drain: false, seed: 3, slT: 1 } }));
r = A.compute('erlangA', { lam: 100, mu: 20, c: 5, theta: 12 });
check('Sim Erlang A P(abandono)', ag.m.Pab.mean, r.Pab, 0.03); check('Sim Erlang A Lq', ag.m.Lq.mean, r.Lq, 0.03);
check('Sim Erlang A NS(1 min)', ag.m.SL.mean, r.sl(1 / 60), 0.03); check('Sim Erlang A Wq todos (min)', ag.m.WqAll.mean, r.Wq * 60, 0.03);

// Rechazo por umbral L=4 vs modelo N-M general
ag = sim(steady({ arrivals: { mode: 'poisson', rate: 80 }, balk: { type: 'linear', L: 6 }, stages: [{ servers: 2, svc: { type: 'exp', mean: 1.6 } }] }));
r = A.compute('bd', { lam: 80, mu: 37.5, c: 2, balk: { type: 'linear', L: 6 } });
check('Sim balking lineal P(rechazo)', ag.m.Pbalk.mean, r.Pbalk, 0.04); check('Sim balking lineal Lq', ag.m.Lq.mean, r.Lq, 0.04);

// Prioridad no expropiativa M/M/1 (2 clases)
ag = sim(steady({ arrivals: { mode: 'poisson', rate: 45 }, classes: [{ name: 'A', share: 20, prio: 1 }, { name: 'B', share: 25, prio: 2 }], stages: [{ servers: 1, svc: { type: 'exp', mean: 1 }, disc: 'PRIO' }] }));
r = A.compute('prio', { c: 1, preemptive: false, classes: [{ name: 'A', prio: 1, lam: 20, S: S1 }, { name: 'B', prio: 2, lam: 25, S: S1 }] });
check('Sim prioridad NP Wq clase A', ag.perClass[0].Wq.mean, r.perClass[0].Wq * 60, 0.06); check('Sim prioridad NP Wq clase B', ag.perClass[1].Wq.mean, r.perClass[1].Wq * 60, 0.06);

// Prioridad expropiativa M/M/2 (2 clases)
ag = sim(steady({ arrivals: { mode: 'poisson', rate: 100 }, classes: [{ name: 'A', share: 40, prio: 1 }, { name: 'B', share: 60, prio: 2 }], stages: [{ servers: 2, svc: { type: 'exp', mean: 1 }, disc: 'PRIOP' }] }));
r = A.compute('prio', { c: 2, preemptive: true, classes: [{ name: 'A', prio: 1, lam: 40, S: S1 }, { name: 'B', prio: 2, lam: 60, S: S1 }] });
check('Sim prioridad PR W clase A', ag.perClass[0].W.mean, r.perClass[0].W * 60, 0.05); check('Sim prioridad PR W clase B', ag.perClass[1].W.mean, r.perClass[1].W * 60, 0.06);

// Red en serie M/M/1 → M/M/2 (Jackson exacta)
ag = sim(steady({ arrivals: { mode: 'poisson', rate: 40 }, stages: [{ servers: 1, svc: { type: 'exp', mean: 1.2 } }, { servers: 2, svc: { type: 'exp', mean: 2.4 } }] }));
r = A.compute('tandem', { lam: 40, ca2: 1, stations: [{ c: 1, S: Dist.moments(Dist.make({ type: 'exp', mean: 1.2 }), 1 / 60) }, { c: 2, S: Dist.moments(Dist.make({ type: 'exp', mean: 2.4 }), 1 / 60) }] });
check('Sim tándem W total (min)', ag.m.W.mean, r.W * 60, 0.04);

// Llegadas en lote geométricas (media 2) M^X/M/1
ag = sim(steady({ arrivals: { mode: 'poisson', rate: 15, batch: { type: 'geom', mean: 2 } }, stages: [{ servers: 1, svc: { type: 'exp', mean: 1.5 } }] }), 8);
r = A.compute('mxg1', { lamB: 15, X: { m1: 2, m2: (2 - 0.5) / 0.25 }, S: Dist.moments(Dist.make({ type: 'exp', mean: 1.5 }), 1 / 60) });
check('Sim Mˣ/M/1 Wq (min)', ag.m.Wq.mean, r.Wq * 60, 0.06);

// G/G/2 (Allen-Cunneen es aproximado: tolerancia 15 %)
ag = sim(steady({ arrivals: { mode: 'renewal', ia: { type: 'erlang', mean: 1, k: 2 } }, stages: [{ servers: 2, svc: { type: 'gamma', mean: 1.7, sd: 1.2 } }] }));
r = A.compute('ggc', { c: 2, A: Dist.moments(Dist.make({ type: 'erlang', mean: 1, k: 2 }), 1 / 60), S: Dist.moments(Dist.make({ type: 'gamma', mean: 1.7, sd: 1.2 }), 1 / 60) });
check('Sim E2/G/2 Wq vs Allen-Cunneen (aprox.)', ag.m.Wq.mean, r.Wq * 60, 0.15);

// Prioridad expropiativa M/M/1 (2 clases)
ag = sim(steady({ arrivals: { mode: 'poisson', rate: 45 }, classes: [{ name: 'A', share: 20, prio: 1 }, { name: 'B', share: 25, prio: 2 }], stages: [{ servers: 1, svc: { type: 'exp', mean: 1 }, disc: 'PRIOP' }] }));
r = A.compute('prio', { c: 1, preemptive: true, classes: [{ name: 'A', prio: 1, lam: 20, S: S1 }, { name: 'B', prio: 2, lam: 25, S: S1 }] });
check('Sim prioridad PR M/M/1 W clase A', ag.perClass[0].W.mean, r.perClass[0].W * 60, 0.05); check('Sim prioridad PR M/M/1 W clase B', ag.perClass[1].W.mean, r.perClass[1].W * 60, 0.06);
// Prioridad no expropiativa M/M/2 (Hillier-Lieberman)
ag = sim(steady({ arrivals: { mode: 'poisson', rate: 90 }, classes: [{ name: 'A', share: 40, prio: 1 }, { name: 'B', share: 50, prio: 2 }], stages: [{ servers: 2, svc: { type: 'exp', mean: 1 }, disc: 'PRIO' }] }));
r = A.compute('prio', { c: 2, preemptive: false, classes: [{ name: 'A', prio: 1, lam: 40, S: S1 }, { name: 'B', prio: 2, lam: 50, S: S1 }] });
check('Sim prioridad NP M/M/2 Wq clase A', ag.perClass[0].Wq.mean, r.perClass[0].Wq * 60, 0.06); check('Sim prioridad NP M/M/2 Wq clase B', ag.perClass[1].Wq.mean, r.perClass[1].Wq * 60, 0.06);
// Fuente finita con capacidad menor que la población: M/M/2/4/10
ag = sim(steady({ arrivals: { mode: 'finite', finite: { N: 10, think: { type: 'exp', mean: 60 } } }, capacity: 4, stages: [{ servers: 2, svc: { type: 'exp', mean: 10 } }] }));
r = A.compute('mmckn', { lam: 1, mu: 6, c: 2, N: 10, K: 4 });
check('Sim fuente finita M/M/2/4/10 L', ag.m.L.mean, r.L, 0.03); check('Sim fuente finita M/M/2/4/10 P(bloqueo)', ag.m.Pblock.mean, r.Pblock, 0.05);
// Rechazo exponencial + abandono + capacidad
ag = sim(steady({ arrivals: { mode: 'poisson', rate: 80 }, capacity: 12, balk: { type: 'exp', L: 5 }, renege: { on: true, dist: { type: 'exp', mean: 10 } }, stages: [{ servers: 2, svc: { type: 'exp', mean: 1.6 } }] }));
r = A.compute('bd', { lam: 80, mu: 37.5, c: 2, theta: 6, K: 12, balk: { type: 'exp', L: 5 } });
check('Sim rechazo+abandono+K: P(rechazo)', ag.m.Pbalk.mean, r.Pbalk, 0.06); check('Sim rechazo+abandono+K: P(abandono)', ag.m.Pab.mean, r.Pab, 0.06); check('Sim rechazo+abandono+K: L', ag.m.L.mean, r.L, 0.03);
// M/H2/1: Pollaczek-Khinchine es exacta en la media para cualquier servicio
ag = sim(steady({ arrivals: { mode: 'poisson', rate: 36 }, stages: [{ servers: 1, svc: { type: 'hyper', mean: 1, cv: 1.6 } }] }), 8);
r = A.compute('mg1', { lam: 36, S: Dist.moments(Dist.make({ type: 'hyper', mean: 1, cv: 1.6 }), 1 / 60) });
check('Sim M/H₂/1 Wq vs Pollaczek-Khinchine (min)', ag.m.Wq.mean, r.Wq * 60, 0.06);

// Rutas por tipo de cliente: A pasa por ambas áreas, B solo por la 1, C solo por la 2.
// Por el teorema de Burke cada área es un M/M/c con su propia tasa de llegada.
ag = sim(steady({ arrivals: { mode: 'poisson', rate: 60 },
  classes: [{ name: 'A', share: 40, prio: 1, visits: [true, true] }, { name: 'B', share: 25, prio: 1, visits: [true, false] }, { name: 'C', share: 35, prio: 1, visits: [false, true] }],
  stages: [{ servers: 2, svc: { type: 'exp', mean: 1.5 } }, { servers: 2, svc: { type: 'exp', mean: 2 } }] }));
r = A.compute('mmc', { lam: 39, mu: 40, c: 2 });
check('Rutas: Wq del área 1 (A+B)', ag.stages[0].Wq.mean, r.Wq * 60, 0.05);
r = A.compute('mmc', { lam: 45, mu: 30, c: 2 });
check('Rutas: Wq del área 2 (A+C)', ag.stages[1].Wq.mean, r.Wq * 60, 0.05);
check('Rutas: visitas al área 1 = 65 % de llegadas', ag.stages[0].visits / ag.m.arrivals.mean, 0.65, 0.01);
check('Rutas: el tipo C no visita el área 1', isNaN(ag.perClass[2].stageWq[0]) ? 1 : 0, 1, 0);
check('Rutas: espera de C en el área 2 = espera del área', ag.perClass[2].stageWq[1], r.Wq * 60, 0.06);

console.log('\n=== 3. Escenarios operativos (sin teoría exacta; deben correr sin errores) ===');
const day = { run: { hours: 10, warmupH: 0, drain: true, seed: 11, slT: 5 } };
const scen = {
  'Perfil horario + horario de personal': { arrivals: { mode: 'profile', profile: [30, 50, 80, 110, 90, 70, 60, 85, 95, 40] }, stages: [{ servers: 8, useSchedule: true, schedule: [3, 4, 6, 8, 7, 5, 5, 7, 7, 3], svc: { type: 'lnorm', mean: 4, sd: 3 } }] },
  'Filas por servidor + cambio de fila': { arrivals: { mode: 'poisson', rate: 70 }, stages: [{ servers: 5, queue: 'multi', jockey: true, svc: { type: 'gamma', mean: 4, sd: 2 } }] },
  'Citas con ausentismo + espontáneos': { arrivals: { mode: 'appointments', appt: { interval: 6, noShow: 0.12, sdLate: 5, walkin: 3 } }, stages: [{ servers: 1, svc: { type: 'gamma', mean: 5.5, sd: 2.5 } }] },
  'Fallas de servidores': { arrivals: { mode: 'poisson', rate: 50 }, fail: { on: true, mtbf: 90, mttr: 12 }, stages: [{ servers: 4, svc: { type: 'exp', mean: 4 } }] },
  'Reintentos tras abandono': { arrivals: { mode: 'poisson', rate: 90 }, renege: { on: true, dist: { type: 'unif', a: 2, b: 8 } }, retry: { p: 0.5, mean: 10 }, stages: [{ servers: 4, svc: { type: 'exp', mean: 3.2 } }] },
  'Tres etapas con probabilidad': { arrivals: { mode: 'poisson', rate: 40 }, stages: [{ servers: 2, svc: { type: 'exp', mean: 2.5 } }, { servers: 2, svc: { type: 'tri', a: 1, mode: 2, b: 5 }, prob: 0.6 }, { servers: 1, svc: { type: 'det', mean: 1 } }] },
  'SPT y LIFO': { arrivals: { mode: 'poisson', rate: 50 }, stages: [{ servers: 2, svc: { type: 'hyper', mean: 2.2, cv: 2 }, disc: 'SPT' }] },
  'Sobrecarga (inestable)': { arrivals: { mode: 'poisson', rate: 300 }, stages: [{ servers: 1, svc: { type: 'exp', mean: 2 } }], run: { hours: 200, drain: false } }
};
for (const [name, o] of Object.entries(scen)) {
  try {
    const spec = Object.assign({}, day, o, { run: Object.assign({}, day.run, o.run || {}) });
    const a = Sim.runRepsSync(spec, 4);
    console.log(`OK   ${name}: atendidos ${a.m.served.mean.toFixed(0)}, Wq ${a.m.Wq.mean.toFixed(2)} min, NS ${(a.m.SL.mean * 100).toFixed(1)} %, util ${(a.m.util.mean * 100).toFixed(1)} %, abandono ${(a.m.Pab.mean * 100).toFixed(1)} %, tiempo extra ${a.m.overtime.mean.toFixed(1)} min${a.unstable ? ' [INESTABLE detectado]' : ''}  (${Sim.kendall(spec)})`);
    passes++;
  } catch (e) { fails++; console.log(`FALLA ${name}: ${e.stack}`); }
}

console.log('\n=== 4. Llegadas reales (traza), llegadas por tipo de cliente e indicadores por área y hora ===');
{
  // Traza: un servidor, atención determinística de 1 min; llegadas en 0, 0,5 y 3 min
  const tr = new Sim(Sim.normalize({ arrivals: { mode: 'trace', trace: [[0, 0, 'a'], [0.5, 1, 'b'], [3, 0, 'c']] }, classes: [{ name: 'X', share: 1, prio: 1 }, { name: 'Y', share: 1, prio: 1 }],
    stages: [{ servers: 1, svc: { type: 'det', mean: 1 } }], run: { hours: 1, warmupH: 0, drain: true, slT: 5 } }), 's').runAll();
  check('Traza: atendidos', tr.served, 3, 0);
  check('Traza: espera media = (0 + 0,5 + 0) / 3', tr.Wq, 0.5 / 3, 1e-9);
  check('Traza: el tipo indicado se respeta', tr.perClass[1].served, 1, 0);
  // Llegadas por tipo: A solo en la primera hora, B solo en la segunda
  let lateA = 0, earlyB = 0, nA = 0, nB = 0;
  for (let r2 = 0; r2 < 30; r2++) {
    const sm = new Sim(Sim.normalize({ arrivals: { mode: 'profile', profile: [60, 60], byClass: [[60, 0], [0, 60]] }, classes: [{ name: 'A', share: 50, prio: 1 }, { name: 'B', share: 50, prio: 1 }],
      stages: [{ servers: 6, svc: { type: 'exp', mean: 1 } }], run: { hours: 2, warmupH: 0, drain: true, slT: 5 } }), 'k' + r2, { onEvent: (type, c, v, S) => { if (type !== 'arrive') return; if (c.k === 0) { nA++; if (S.t > 60) lateA++; } else { nB++; if (S.t < 60) earlyB++; } } });
    sm.runAll();
  }
  check('Llegadas por tipo: media de A por día', nA / 30, 60, 0.06);
  check('Llegadas por tipo: media de B por día', nB / 30, 60, 0.06);
  check('Llegadas por tipo: A nunca llega en la hora 2 ni B en la hora 1', lateA + earlyB, 0, 0);
  // Indicadores por área y hora: la suma de atendidos por hora coincide con el total del área
  const one = new Sim(Sim.normalize({ arrivals: { mode: 'profile', profile: [40, 80, 60] }, stages: [{ servers: 3, svc: { type: 'exp', mean: 2.5 } }, { servers: 2, svc: { type: 'exp', mean: 1.5 } }], run: { hours: 3, warmupH: 0, drain: true, slT: 5 } }), 'h').runAll();
  one.stages.forEach((st, i) => check(`Por hora: Σ atendidos = total del área ${i + 1}`, st.hourly.reduce((a, x) => a + x.done, 0), st.served, 0));
}

console.log('\n=== 5. Medición del proceso con los datos de ejemplo (tienda con crédito: facturas y REC) ===');
for (const f of ['staffing.js', 'data.js', 'analysis.js', 'measure.js']) vm.runInThisContext(fs.readFileSync(path.join(__dirname, '..', 'js', f), 'utf8'), { filename: f });
const MS = globalThis.QS.Measure;
(async () => {
  const f = MS.sampleFiles(); const proc = MS.fromTemplate('retail_credito'); const areas = [];
  for (const [ai, file] of [[0, f.facturas], [1, f.recibos]]) {
    const map = MS.guessFields(file.headers); const src = { type: 'rows', headers: file.headers, rows: file.rows };
    const vals = await MS.distinctValues(src, map.tipo); const tm = MS.autoTypeMap(vals.map((v) => v[0]), proc.areas[ai].types);
    areas.push(await MS.readArea(src, { map, typeMap: tm, labels: proc.areas[ai].types, dateOrder: 'DMY', groupSec: 20, name: proc.areas[ai].name }));
  }
  const comb = await MS.measureProcess(proc, areas);
  // participación esperada: compras 70 % (×1,15 en los días de pago) y cuotas 30 % (×1,8 en los días de pago); ~20 % de los días son de pago
  const w = [40 * 1.03, 25 * 1.03, 5 * 1.03, 30 * 1.16]; const W = w.reduce((a, b) => a + b, 0);
  comb.flows.forEach((fl, j) => check(`Medición: participación de "${fl.name}"`, fl.share, w[j] / W, 0, 0.02));
  const B = areas[1], T = f.truth;
  check('Medición: atención inferida, pago de contado', B.svc[0].mean, T.b.contado, 0.12);
  check('Medición: atención inferida, entrada de crédito', B.svc[1].mean, T.b.entrada, 0.12);
  check('Medición: atención por diferencia, pago de cuota', B.svc[2].mean, T.b.cuota, 0.15);
  check('Medición: el máximo probable de cajas no subestima', areas[0].svc[0].mean >= T.a.contado && areas[0].svc[1].mean >= T.a.credito * 0.95 ? 1 : 0, 1, 0);
  MS.setOverride(areas[0], 0, { mean: T.a.contado, src: 'indicado' });
  check('Medición: con el promedio de contado, la factura de crédito', areas[0].svc[1].mean, T.a.credito, 0.08);
  const val = await MS.validateModel(proc, areas, comb, 5, { reps: 10 });
  val.areas.forEach((v) => check(`Validación: error por hora en ${v.name.split(':')[0]} ≤ 10 %`, v.wape <= 0.1 ? 1 : 0, 1, 0));
  const st = await MS.staffBySim(proc, areas, comb, 0, { pct: 80, tMin: 5, reps: 8 });
  st.agg.stages.forEach((x, i) => check(`Personal por simulación: ${proc.areas[i].name.split(':')[0]} cumple 80 % en 5 min`, x.SL.mean >= 0.79 ? 1 : 0, 1, 0));
  const card = MS.modelCard(proc, areas, comb, { reps: 10, validation: val });
  check('Ficha técnica: cada parámetro con método y referencia', card.rows.every((r) => r.method && (r.refs.length || r.sec.startsWith('1.') || r.param.startsWith('Fila') || r.sec.startsWith('6.') || /^(Sin medir|Cronometrado)/.test(r.method))) ? 1 : 0, 1, 0);

  console.log('\n=== 6. Mediciones en tienda, horario de atención y temporadas ===');
  // Estudio de tiempos: media, intervalo de confianza del 95 % con t de Student y muestra para ±10 %: n = (1,96·CV/0,1)²
  const ts = MS.timeStudy([2, 4, 6, 8]);
  check('Estudio de tiempos: media', ts.mean, 5, 1e-12);
  check('Estudio de tiempos: semiancho del IC 95 % (t con 3 gl)', ts.hw, U.tInv(0.975, 3) * Math.sqrt(20 / 3) / 2, 1e-9);
  check('Estudio de tiempos: muestra necesaria para ±10 %', ts.need, Math.ceil(Math.pow(1.96 * Math.sqrt(20 / 3) / 5 / 0.1, 2)), 0);
  // Horario de atención detectado y llegadas dentro del horario (la tienda de ejemplo atiende de 9:00 a 18:00)
  const A0 = areas[0];
  check('Horario detectado: apertura del sábado (min del día)', A0.hours[5].open, 540, 0);
  check('Horario detectado: cierre del sábado (min del día)', A0.hours[5].close, 1080, 0);
  check('Sin llegadas fuera del horario (8:00 y 18:00 del sábado)', A0.heat[5][8] + A0.heat[5][18], 0, 0);
  // Mediciones en tienda de la tienda de ejemplo: 42 y 31 atenciones cronometradas en cajas y 12 traslados
  MS.setOverride(A0, 0, null);
  const needs0 = MS.measurementNeeds(proc, areas, {});
  check('Pendientes sin mediciones: atención de cajas y traslado', needs0.filter((n) => n.state === 'falta').length, 2, 0);
  const meas = MS.sampleMeasurements(T);
  let comb2 = comb;
  if (MS.applyMeasurements(proc, areas, meas)) { comb2 = await MS.measureProcess(proc, areas, { walk: proc.walk }); MS.applyMeasurements(proc, areas, meas); }
  check('Traslado medido (12 cronometrados) dentro del rango real 0,3–0,9 min', proc.walk >= 0.3 && proc.walk <= 0.9 && proc.walkMeasured ? 1 : 0, 1, 0);
  check('Cajas, contado cronometrado (42 atenciones)', A0.svc[0].mean, T.a.contado, 0.15);
  check('Cajas, crédito cronometrado (31 atenciones)', A0.svc[1].mean, T.a.credito, 0.15);
  check('Cajas: origen del dato = cronometrado', A0.svc.every((s) => s.method === 'cronometrado') ? 1 : 0, 1, 0);
  check('Facturación inferida con el traslado medido: pago de contado', B.svc[0].mean, T.b.contado, 0.1);
  check('Facturación inferida con el traslado medido: entrada de crédito', B.svc[1].mean, T.b.entrada, 0.1);
  check('Sin pendientes después de medir', MS.measurementNeeds(proc, areas, meas).filter((n) => n.state === 'falta' || n.state === 'parcial').length, 0, 0);
  check('Validación con las mediciones: error por hora ≤ 10 %', Math.max(...(await MS.validateModel(proc, areas, comb2, 5, { reps: 10 })).areas.map((v) => v.wape)) <= 0.1 ? 1 : 0, 1, 0);
  // Temporadas: serie diaria de 3 años con tendencia (+10 % por año), día de la semana y estacionalidad conocida; se recupera el índice de cada mes
  const Sm = [0.8, 0.85, 0.95, 1, 1, 0.95, 1.05, 1, 0.95, 1, 1.1, 1.5]; const SmN = Sm.map((x) => x / U.mean(Sm));
  const dowF = [1, 0.9, 0.9, 1, 1.2, 1.4, 0]; const dayRec = [];
  for (let k = U.dayKey(2023, 1, 1); k <= U.dayKey(2025, 12, 31); k++) { const i = U.dayInfo(k); if (!dowF[i.dow]) continue; const v = 100 * (1 + 0.1 * (k - U.dayKey(2023, 1, 1)) / 365.25) * Sm[i.m - 1] * dowF[i.dow]; dayRec.push({ k, tot: v, types: [v] }); }
  const mf = MS.monthFactors({ areas: [{ types: ['A'] }], flows: [{ name: 'F', steps: ['A'] }] }, [{ dayRec }])[0];
  check('Temporadas: tendencia detectada con 36 meses', mf.trend ? 1 : 0, 1, 0);
  check('Temporadas: índice de diciembre', mf.f[11], SmN[11], 0.03);
  check('Temporadas: índice de enero', mf.f[0], SmN[0], 0.03);
  check('Temporadas: error máximo de los 12 índices', Math.max(...mf.f.map((x, m) => Math.abs(x - SmN[m]) / SmN[m])), 0, 0, 0.03);

  console.log('\n=== 7. Historia larga: 2 años con crecimiento de 10 % anual y temporada ===');
  // El modelo debe reflejar el nivel de las últimas 13 semanas, no el promedio de los 2 años; los días muy cargados no deben inflarse con el crecimiento
  const SEA = [0.85, 0.85, 0.95, 1, 1, 0.95, 1, 1, 0.95, 1, 1.1, 1.4];
  const fL = MS.sampleFiles({ k0: U.dayKey(2024, 10, 1), k1: U.dayKey(2026, 9, 30), growth: 0.1, season: SEA, seed: 'largo' }); const TL = fL.truth;
  const procL = MS.fromTemplate('retail_credito'); const areasL = [];
  for (const [ai, file] of [[0, fL.facturas], [1, fL.recibos]]) {
    const map = MS.guessFields(file.headers); const src = { type: 'rows', headers: file.headers, rows: file.rows };
    const vals = await MS.distinctValues(src, map.tipo); const tm = MS.autoTypeMap(vals.map((v) => v[0]), procL.areas[ai].types);
    areasL.push(await MS.readArea(src, { map, typeMap: tm, labels: procL.areas[ai].types, dateOrder: 'DMY', groupSec: 20, name: procL.areas[ai].name }));
  }
  const AL = areasL[0]; let lv = 0, nl = 0; for (let k = AL.win.k0; k <= AL.k1; k++) { const di = U.dayInfo(k); if (di.dow < 5) { lv += TL.level(k); nl++; } }
  let modelDay = 0, dw = 0; for (let w = 0; w < 5; w++) { modelDay += AL.heat[w].reduce((a, b) => a + b, 0); dw++; }
  const trueDay = (26 + 38 + 46 + 52 + 50 + 44 + 42 + 46 + 34) * 0.7 * (lv / nl); // compras de lunes a viernes (sin efecto de días de pago)
  check('Historia larga: clientes por día en cajas = nivel de las últimas 13 semanas', modelDay / dw, trueDay, 0.06);
  check('Historia larga: periodo base de 13 semanas', AL.win.days, 91, 0);
  const dfL = MS.dayFactors(procL, areasL);
  check('Historia larga: día muy cargado (P90) sin inflarse por el crecimiento', dfL[0].p90 <= 1.22 ? 1 : 0, 1, 0);
  const combL = await MS.measureProcess(procL, areasL, { walk: 0.6 });
  // los recibos de contado y de entrada citan su factura (las cuotas citan el crédito): todos deben enlazarse
  const BL = areasL[1]; const shouldLink = BL.typeCount[0] + BL.typeCount[1];
  check('Historia larga: enlace factura → REC con huellas de documento (recibos que pagan una factura)', combL.links.length ? combL.links[0].matched / shouldLink : 0, 1, 0.02);
  const mfL = MS.monthFactors(procL, areasL)[0];
  check('Historia larga: índice de diciembre', mfL.f[11], SEA[11] / U.mean(SEA), 0.05);
  check('Historia larga: factor para planear diciembre desde el periodo base', U.mean(MS.monthAdjust(procL, areasL, 11)), 1.4 / U.mean([1, 1, 0.95]), 0.06);
  const a2 = MS.rebase(AL, 52);
  check('Historia larga: cambiar el periodo base a 52 semanas', a2.win.days, 364, 0);

  console.log('\n=== 8. Reportes completos, personal indicado y varios archivos por área ===');
  // Reportes con la hora de inicio de cada atención: la atención se mide directo (sin recortes que la sesguen) y no hay nada que cronometrar
  const fC = MS.sampleFiles({ withStart: true, seed: 'completo' }); const TC = fC.truth;
  const procC = MS.fromTemplate('retail_credito'); const areasC = [];
  const readFile = async (proc, ai, headers, rows) => {
    const map = MS.guessFields(headers); const src = { type: 'rows', headers, rows };
    const vals = await MS.distinctValues(src, map.tipo); const tm = MS.autoTypeMap(vals.map((v) => v[0]), proc.areas[ai].types);
    return MS.readArea(src, { map, typeMap: tm, labels: proc.areas[ai].types, dateOrder: 'DMY', groupSec: 20, name: proc.areas[ai].name });
  };
  areasC.push(await readFile(procC, 0, fC.facturas.headers, fC.facturas.rows), await readFile(procC, 1, fC.recibos.headers, fC.recibos.rows));
  const combC = await MS.measureProcess(procC, areasC, { walk: 0.6 });
  check('Reportes completos: atención de contado medida con la hora de inicio', areasC[0].svc[0].mean, TC.a.contado, 0.03);
  check('Reportes completos: atención de crédito medida', areasC[0].svc[1].mean, TC.a.credito, 0.03);
  check('Reportes completos: pago de cuota medido', areasC[1].svc[2].mean, TC.b.cuota, 0.03);
  check('Reportes completos: nada que cronometrar (ni el traslado)', MS.measurementNeeds(procC, areasC, {}).every((n) => n.state === 'datos') ? 1 : 0, 1, 0);
  // Personal indicado por el usuario: con una persona más en cada hora la espera baja; con el detectado da lo mismo que sin indicarlo
  const det = procC.areas.map((ar, i) => U.range(24, (hh) => Math.round(areasC[i].sHeat[5][hh] || 0)));
  const vDef = await MS.validateModel(procC, areasC, combC, 5, { reps: 10 });
  const vDet = await MS.validateModel(procC, areasC, combC, 5, { reps: 10, schedDay: det });
  const vMas = await MS.validateModel(procC, areasC, combC, 5, { reps: 10, schedDay: det.map((d) => d.map((x) => (x > 0 ? x + 1 : 0))) });
  check('Personal indicado igual al detectado: misma espera', vDet.agg.m.Wq.mean, vDef.agg.m.Wq.mean, 1e-9);
  check('Personal indicado con una persona más: menos espera', vMas.agg.m.Wq.mean < vDef.agg.m.Wq.mean * 0.8 ? 1 : 0, 1, 0);
  const stC = await MS.staffBySim(procC, areasC, combC, 5, { pct: 80, tMin: 5, reps: 6, todayDay: det.map((d) => d.map((x) => x + 2)) });
  check('Plan: "hoy" usa el personal indicado', stC.today[0][2], det[0][stC.h0 + 2] + 2, 1e-9);
  // Varios archivos por área (por ejemplo, uno por mes) con las columnas en otro orden: mismo resultado que un solo archivo
  const H = fC.facturas.headers, R = fC.facturas.rows; const half = Math.floor(R.length / 2);
  const order = [3, 0, 7, 1, 2, 5, 4, 6]; // columnas reordenadas en el segundo archivo
  const multi = { type: 'multi', parts: [{ type: 'rows', headers: H, rows: R.slice(0, half), name: 'junio_julio.csv' }, { type: 'rows', headers: order.map((k) => H[k]), rows: R.slice(half).map((r) => order.map((k) => r[k])), name: 'agosto_septiembre.csv' }] };
  const pvM = await QS.Data.preview(multi); const mapM = MS.guessFields(pvM.headers);
  const valsM = await MS.distinctValues(multi, mapM.tipo); const tmM = MS.autoTypeMap(valsM.map((v) => v[0]), procC.areas[0].types);
  const aM = await MS.readArea(multi, { map: mapM, typeMap: tmM, labels: procC.areas[0].types, dateOrder: 'DMY', groupSec: 20, name: procC.areas[0].name });
  check('Varios archivos por área: mismas visitas que un solo archivo', aM.nAll, areasC[0].nAll, 0);
  check('Varios archivos por área: misma atención medida', aM.svc[0].mean, areasC[0].svc[0].mean, 1e-9);

  console.log('\n=== 9. Archivo único con todas las áreas ===');
  // El estándar de archivo único: columna Área. Cada área toma sus filas y sus tipos; el resultado es el mismo que con un archivo por área
  const one = MS.sampleSingle(fC); const srcOne = { type: 'rows', headers: one.headers, rows: one.rows };
  const mapOne = MS.guessFields(one.headers);
  const dvOne = await MS.distinctPairs(srcOne, mapOne.area, mapOne.tipo);
  const spOne = MS.splitSingleFile(procC, dvOne, true);
  check('Archivo único: cada valor de Área va a su área', spOne.areaSel[0].join() === 'Cajas' && spOne.areaSel[1].join() === 'Facturación' ? 1 : 0, 1, 0);
  check('Archivo único: tipos emparejados (5 de 5)', [0, 1].reduce((s, i) => s + Object.values(spOne.typeMaps[i]).filter(Boolean).length, 0), 5, 0);
  const areasOne = [];
  for (let i = 0; i < 2; i++) areasOne.push(await MS.readArea(srcOne, { map: mapOne, typeMap: spOne.typeMaps[i], labels: procC.areas[i].types, dateOrder: 'DMY', groupSec: 20, areaValues: spOne.areaSel[i], name: procC.areas[i].name }));
  check('Archivo único: mismas visitas en cajas que el archivo de cajas', areasOne[0].nAll, areasC[0].nAll, 0);
  check('Archivo único: mismas visitas en facturación', areasOne[1].nAll, areasC[1].nAll, 0);
  check('Archivo único: misma atención medida en facturación', areasOne[1].svc[2].mean, areasC[1].svc[2].mean, 1e-9);
  const spNo = MS.splitSingleFile(procC, await MS.distinctPairs(srcOne, null, mapOne.tipo), false);
  check('Sin columna Área: los tipos que podrían ser de dos áreas quedan para que el usuario los asigne', spNo.unassignedTypes.map((x) => x[0]).sort().join() === 'CONTADO,CREDITO' ? 1 : 0, 1, 0);

  console.log('\n=== 10. Fechas distintas entre áreas, formato del documento, usuario creador y archivos superpuestos ===');
  const dayOf = (s) => { const [d, m, y] = s.split('/').map(Number); return U.dayKey(y, m, d); };
  const cut = (rows, a, b) => rows.filter((r) => { const k = dayOf(r[0]); return k >= a && k <= b; });
  const readSrc = async (proc, ai, src, headers, extra = {}) => {
    const map = MS.guessFields(headers); const vals = await MS.distinctValues(src, map.tipo); const tm = MS.autoTypeMap(vals.map((v) => v[0]), proc.areas[ai].types);
    return MS.readArea(src, Object.assign({ map, typeMap: tm, labels: proc.areas[ai].types, dateOrder: 'DMY', groupSec: 20, name: proc.areas[ai].name }, extra));
  };
  const rowsSrc = (headers, rows) => ({ type: 'rows', headers, rows });
  const K0 = U.dayKey(2026, 6, 1), K1 = U.dayKey(2026, 9, 30), kAug = U.dayKey(2026, 8, 1), kAug31 = U.dayKey(2026, 8, 31);
  const procD = MS.fromTemplate('retail_credito'); const HF = f.facturas.headers, HR = f.recibos.headers;
  const linkRate = (ls) => { const e = ls.byType.filter((x) => x.expected); return e.reduce((s, x) => s + x.matched, 0) / e.reduce((s, x) => s + x.n, 0); };
  // Las facturas terminan el 31 de agosto y los recibos el 30 de septiembre: el modelo usa las mismas semanas en las dos áreas
  const areasD = [await readSrc(procD, 0, rowsSrc(HF, cut(f.facturas.rows, K0, kAug31)), HF), await readSrc(procD, 1, rowsSrc(HR, f.recibos.rows), HR)];
  const combD = await MS.measureProcess(procD, areasD, { walk: 0.6 });
  check('Fechas distintas: el periodo base termina el último día que tienen las dos áreas', areasD[1].win.k1, kAug31, 0);
  check('Fechas distintas: el mismo periodo base en las dos áreas', areasD[0].win.k0 === areasD[1].win.k0 && areasD[0].win.k1 === areasD[1].win.k1 ? 1 : 0, 1, 0);
  check('Fechas distintas: los recibos que pagan una factura la encuentran todos', linkRate(combD.linkStats[0]), 1, 0, 0.005);
  check('Fechas distintas: las cuotas no se esperan enlazadas (pagan créditos anteriores)', combD.linkStats[0].byType[2].expected ? 1 : 0, 0, 0);
  combD.flows.forEach((fl, j) => check(`Fechas distintas: participación de "${fl.name}"`, fl.share, w[j] / W, 0, 0.02));
  check('Fechas distintas: atención inferida, pago de contado', areasD[1].svc[0].mean, T.b.contado, 0.12);
  // Sin un día en común: aviso claro en lugar de un resultado sin sentido
  const areasN = [await readSrc(procD, 0, rowsSrc(HF, cut(f.facturas.rows, K0, U.dayKey(2026, 7, 15))), HF), await readSrc(procD, 1, rowsSrc(HR, cut(f.recibos.rows, kAug, K1)), HR)];
  let errN = ''; try { await MS.measureProcess(procD, areasN, {}); } catch (e) { errN = e.message; }
  check('Sin fechas en común: se avisa en lugar de medir', /no tienen fechas en común/.test(errN) ? 1 : 0, 1, 0);
  // Formato del documento: guiones, espacios, mayúsculas, ceros a la izquierda (Excel) y varias facturas en una celda no impiden el enlace
  check('Clave de documento: F-001245 = f1245 = F 1245', MS.normDoc('F-001245') === MS.normDoc('f1245') && MS.normDoc('f1245') === MS.normDoc('F 1245') ? 1 : 0, 1, 0);
  check('Clave de documento: 001-001-000012345 = 1001000012345 (número de Excel)', MS.normDoc('001-001-000012345') === MS.normDoc(1001000012345) ? 1 : 0, 1, 0);
  check('Clave de documento: documentos distintos siguen distintos', MS.normDoc('F-1245') !== MS.normDoc('F-1246') && MS.normDoc('F-1245') !== MS.normDoc('R-1245') ? 1 : 0, 1, 0);
  const aF = await readSrc(procD, 0, rowsSrc(HF, f.facturas.rows), HF);
  for (const [tag, fx] of [['F1245, sin guion ni ceros', (s) => s.replace(/-0*/, '')], ['en minúsculas', (s) => s.toLowerCase()], ['dos facturas en la celda', (s) => s + '; F-999999']]) {
    const rows = f.recibos.rows.map((r) => { const x = r.slice(); if (/^F-/.test(x[5])) x[5] = fx(x[5]); return x; });
    check(`Documento relacionado ${tag}: enlace completo`, linkRate(MS.combine(procD, [aF, await readSrc(procD, 1, rowsSrc(HR, rows), HR)]).linkStats[0]), 1, 0, 0.005);
  }
  { // la factura como texto con ceros ("001245") y el recibo como número de Excel (1245)
    const fac = f.facturas.rows.map((r) => { const x = r.slice(); x[4] = x[4].replace(/^F-/, ''); return x; });
    const rec = f.recibos.rows.map((r) => { const x = r.slice(); if (/^F-/.test(x[5])) x[5] = +x[5].replace(/^F-0*/, ''); return x; });
    check('Documento relacionado sin ceros (número de Excel): enlace completo', linkRate(MS.combine(procD, [await readSrc(procD, 0, rowsSrc(HF, fac), HF), await readSrc(procD, 1, rowsSrc(HR, rec), HR)]).linkStats[0]), 1, 0, 0.005);
  }
  // Encabezados de un ERP: el usuario creador es quien atiende (se cuenta a la persona, no la caja); la fecha de creación no es el inicio si es la única hora
  const G = (hs, rows) => { const m = MS.guessFields(hs, rows); const o = {}; Object.keys(m).forEach((k) => { o[k] = hs[m[k]]; }); return o; };
  let g = G(['FECHA_EMISION', 'HORA', 'AREA', 'CAJA', 'USUARIO_CREACION', 'TIPO_DOC', 'NUM_DOCUMENTO', 'DOC_RELACIONADO', 'COD_CLIENTE']);
  check('Encabezados: el usuario creador es quien atiende (no la hora de inicio)', g.punto === 'USUARIO_CREACION' && !g.inicio ? 1 : 0, 1, 0);
  g = G(['FECHA', 'HORA', 'AREA', 'CAJA', 'CAJERO', 'TIPO', 'FACTURA']);
  check('Encabezados: con caja y cajero se cuenta a la persona', g.punto === 'CAJERO' ? 1 : 0, 1, 0);
  g = G(['fecha_hora', 'area', 'creado_por', 'tipo', 'numero', 'factura_ref']);
  check('Encabezados: "creado por" es quien atiende', g.punto === 'creado_por' ? 1 : 0, 1, 0);
  g = G(['FECHA', 'HORA', 'AREA', 'USR_CREA', 'TIPO', 'NRO_DOC']);
  check('Encabezados: "USR_CREA" es quien atiende', g.punto === 'USR_CREA' ? 1 : 0, 1, 0);
  g = G(['FECHA', 'HORA', 'USUARIO_MODIFICACION', 'CAJA', 'TIPO']);
  check('Encabezados: quien modificó el documento no es quien atiende', g.punto === 'CAJA' ? 1 : 0, 1, 0);
  g = G(['FECHA_CREACION', 'AREA', 'USUARIO', 'TIPO_TRANSACCION', 'DOCUMENTO']);
  check('Encabezados: la fecha de creación sola es la hora de registro', g.fecha_hora === 'FECHA_CREACION' && !g.inicio ? 1 : 0, 1, 0);
  g = G(['FECHA_EMISION', 'FECHA_CREACION', 'AREA', 'USUARIO', 'TIPO'], [['14/09/2026', '14/09/2026 10:32:05', 'Cajas', 'MPEREZ', 'CONTADO'], ['14/09/2026', '14/09/2026 10:35:40', 'Cajas', 'MPEREZ', 'CREDITO']]);
  check('Encabezados con filas: emisión sin hora y creación con hora → la creación es la hora de registro', g.fecha_hora === 'FECHA_CREACION' && !g.inicio ? 1 : 0, 1, 0);
  // Una "hora de inicio" igual a la hora de registro no mide la atención: no se usa (si se usara, daría atenciones de 0 minutos)
  const HB = HF.concat(['HORA_INICIO']);
  const aB = await readSrc(procD, 0, rowsSrc(HB, f.facturas.rows.map((r) => r.concat([r[1]]))), HB);
  check('Hora de inicio igual al registro: se descarta y no da atenciones de 0 min', aB.stats.iniBad && aB.svc0.every((s) => !s || s.method !== 'medido') ? 1 : 0, 1, 0);
  // Archivos que se superponen en fechas (agosto en los dos): las filas repetidas se cuentan una sola vez
  const ov = { type: 'multi', parts: [{ type: 'rows', headers: HF, rows: cut(f.facturas.rows, K0, kAug31), name: 'jun_ago.csv' }, { type: 'rows', headers: HF, rows: cut(f.facturas.rows, kAug, K1), name: 'ago_sep.csv' }] };
  const aOv = await readSrc(procD, 0, ov, HF);
  check('Archivos superpuestos: filas repetidas detectadas = filas de agosto', aOv.stats.dup, cut(f.facturas.rows, kAug, kAug31).length, 0);
  check('Archivos superpuestos: mismas transacciones que un solo archivo', aOv.stats.ok, aF.stats.ok, 0);
  check('Archivos superpuestos: mismas visitas que un solo archivo', aOv.nAll, aF.nAll, 0);
  // Un usuario que registra en bloque (pagos en línea: 40 recibos seguidos con 1 s de diferencia cada día) se detecta; sin contarlo,
  // la facturación queda igual que sin sus registros
  const rowsW = f.recibos.rows.slice();
  for (let k = K0; k <= K1; k++) { const di = U.dayInfo(k); if (di.dow === 6) continue; for (let j = 0; j < 40; j++) rowsW.push([`${U.pad2(di.d)}/${U.pad2(di.m)}/${di.y}`, `17:00:${U.pad2(j)}`, 'WEBPAGOS', 'PAGO CUOTA', `REC-W${k}-${j}`, `CR-W${j}`, `CL-W${j}`, 380]); }
  const aW = await readSrc(procD, 1, rowsSrc(HR, rowsW), HR);
  const uW = aW.users.find((u) => u.name === 'WEBPAGOS');
  check('Usuario que registra en bloque: se detecta', uW && uW.auto ? 1 : 0, 1, 0);
  check('Usuario que registra en bloque: ninguna persona de mostrador se marca', aW.users.filter((u) => u.auto).length, 1, 0);
  const aWx = await readSrc(procD, 1, rowsSrc(HR, rowsW), HR, { exclude: ['WEBPAGOS'] });
  const aR0 = await readSrc(procD, 1, rowsSrc(HR, f.recibos.rows), HR);
  check('Sin contar ese usuario: mismas visitas que sin sus registros', aWx.nAll, aR0.nAll, 0);
  check('Sin contar ese usuario: mismo personal detectado a las 17:00', aWx.sHeat[0][17], aR0.sHeat[0][17], 1e-9);
  console.log(`\nResultado: ${passes} pruebas correctas, ${fails} fallas.`);
  process.exitCode = fails ? 1 : 0;
})().catch((e) => { console.error(e); process.exitCode = 1; });
