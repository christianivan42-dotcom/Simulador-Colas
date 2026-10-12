/* Precisión de las fórmulas aproximadas frente a simulación larga en estado estable.
   El motor de simulación está validado contra fórmulas exactas (tests/validacion.js) y contra Ciw.
   Ejecutar con:  node tests/precision_aproximaciones.js   (tarda varios minutos)
   Escribe tests/PRECISION_APROXIMACIONES.md */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
for (const f of ['util.js', 'rng.js', 'analytic.js', 'engine.js']) vm.runInThisContext(fs.readFileSync(path.join(__dirname, '..', 'js', f), 'utf8'), { filename: f });
const { Analytic: A, Sim, Dist, U } = globalThis.QS;
const H = 1 / 60; // minutos → horas
const mom = (spec) => Dist.moments(Dist.make(spec), H);
const SVC = {
  'D (Cs²=0)': { type: 'det', mean: 1 },
  'E₂ (Cs²=0,5)': { type: 'erlang', mean: 1, k: 2 },
  'M (Cs²=1)': { type: 'exp', mean: 1 },
  'LN (Cs²=2)': { type: 'lnorm', mean: 1, sd: Math.SQRT2 },
  'H₂ (Cs²=2)': { type: 'hyper', mean: 1, cv: Math.SQRT2 }
};
const ARR = { 'E₂ (Ca²=0,5)': { type: 'erlang', k: 2 }, 'H₂ (Ca²=2)': { type: 'hyper', cv: Math.SQRT2 } };
// Simulación larga: ~250 000 clientes por réplica, 6 réplicas, calentamiento del 5 %
function simulate(spec, lamH) {
  const hours = U.clamp(250000 / lamH, 400, 20000);
  const s = Object.assign({ run: { hours, warmupH: hours * 0.05, reps: 6, seed: 'precision', drain: false, slT: 1 } }, spec);
  return Sim.runRepsSync(s, 6, { keepWaits: true });
}
const rows = []; const t0 = Date.now();
const rec = (grupo, caso, teo, simS, extra) => {
  const err = (teo - simS.mean) / simS.mean;
  rows.push({ grupo, caso, teo, sim: simS.mean, hw: simS.hw, err, extra: extra || '' });
  console.log(`${grupo} | ${caso} | teoría ${teo.toFixed(4)} | sim ${simS.mean.toFixed(4)} ± ${simS.hw.toFixed(4)} | error ${(err * 100).toFixed(1)} %`);
};

// A) M/G/c: Wq ≈ Wq(M/M/c)·(1 + Cs²)/2
for (const c of [2, 5, 10]) for (const rho of [0.5, 0.7, 0.85]) for (const [sn, sv] of Object.entries(SVC)) {
  if (sn.startsWith('M ')) continue;
  const lam = rho * c * 60; const S = mom(sv);
  const r = A.compute('mgc', { lam, c, S });
  const ag = simulate({ arrivals: { mode: 'poisson', rate: lam }, stages: [{ servers: c, svc: sv }] }, lam);
  rec('M/G/c (dos momentos)', `c=${c}, ρ=${rho}, servicio ${sn}`, r.Wq * 60, ag.m.Wq);
  // nivel de servicio en 1 min con espera condicional exponencial
  const slT = r.sl(1 / 60); rows[rows.length - 1].extra = `NS(1 min): fórmula ${(slT * 100).toFixed(1)} % vs sim ${(ag.m.SL.mean * 100).toFixed(1)} %`;
  rows[rows.length - 1].slErr = slT - ag.m.SL.mean;
}
// B) G/G/1: Kingman con corrección de Krämer y Langenbach-Belz
for (const [an, av] of Object.entries(ARR)) for (const [sn, sv] of Object.entries(SVC)) for (const rho of [0.6, 0.8, 0.9]) {
  const lam = rho * 60; const ia = Object.assign({ mean: 1 / rho }, av);
  const r = A.compute('gg1', { A: mom(ia), S: mom(sv) });
  const ag = simulate({ arrivals: { mode: 'renewal', ia }, stages: [{ servers: 1, svc: sv }] }, lam);
  rec('G/G/1 (Kingman + KLB)', `llegadas ${an}, servicio ${sn}, ρ=${rho}`, r.Wq * 60, ag.m.Wq);
}
// C) G/G/c: Allen-Cunneen
for (const c of [2, 5]) for (const [an, av] of Object.entries(ARR)) for (const sn of ['D (Cs²=0)', 'M (Cs²=1)', 'LN (Cs²=2)']) for (const rho of [0.7, 0.9]) {
  const sv = SVC[sn]; const lam = rho * c * 60; const ia = Object.assign({ mean: 1 / (rho * c) }, av);
  const r = A.compute('ggc', { c, A: mom(ia), S: mom(sv) });
  const ag = simulate({ arrivals: { mode: 'renewal', ia }, stages: [{ servers: c, svc: sv }] }, lam);
  rec('G/G/c (Allen-Cunneen)', `c=${c}, llegadas ${an}, servicio ${sn}, ρ=${rho}`, r.Wq * 60, ag.m.Wq);
}
// D) M/G/1: percentil 90 de la espera con aproximación gamma de dos momentos (la media es exacta)
for (const sn of ['D (Cs²=0)', 'E₂ (Cs²=0,5)', 'LN (Cs²=2)', 'H₂ (Cs²=2)']) for (const rho of [0.6, 0.85]) {
  const sv = SVC[sn]; const lam = rho * 60; const r = A.compute('mg1', { lam, S: mom(sv) });
  const ag = simulate({ arrivals: { mode: 'poisson', rate: lam }, stages: [{ servers: 1, svc: sv }] }, lam);
  rec('M/G/1 percentil 90 (gamma)', `servicio ${sn}, ρ=${rho}`, r.wqPct(0.9) * 60, ag.m.wqP90);
}
// E) Red en serie con servicios no exponenciales: QNA de Whitt
for (const [s1, s2] of [['D (Cs²=0)', 'LN (Cs²=2)'], ['LN (Cs²=2)', 'D (Cs²=0)'], ['E₂ (Cs²=0,5)', 'E₂ (Cs²=0,5)']]) for (const rho of [0.7, 0.85]) {
  const lam = rho * 60; // estación 1: c=1, media 1; estación 2: c=2, media 2 (misma ρ)
  const st2 = Dist.withMean(SVC[s2], 2);
  const r = A.compute('tandem', { lam, ca2: 1, stations: [{ c: 1, S: mom(SVC[s1]) }, { c: 2, S: mom(st2) }] });
  const ag = simulate({ arrivals: { mode: 'poisson', rate: lam }, stages: [{ servers: 1, svc: SVC[s1] }, { servers: 2, svc: st2 }] }, lam);
  rec('Red en serie (QNA)', `${s1} → ${s2} (2 servidores), ρ=${rho}`, (r.W - (1 + 2) / 60) * 60, ag.m.Wq);
}

// Resumen
const groups = [...new Set(rows.map((r) => r.grupo))];
const summ = groups.map((g) => { const e = rows.filter((r) => r.grupo === g).map((r) => Math.abs(r.err)); const s = U.sortedCopy(e); return { g, n: e.length, med: U.quantileSorted(s, 0.5), p90: U.quantileSorted(s, 0.9), max: s[s.length - 1] }; });
const pc = (x) => (x * 100).toFixed(1).replace('.', ',') + ' %';
let md = `# Precisión de las fórmulas aproximadas\n\nGenerado con \`node tests/precision_aproximaciones.js\` (${new Date().toISOString().slice(0, 10)}, ${((Date.now() - t0) / 60000).toFixed(1)} min).\n\n`;
md += 'Cada fórmula aproximada se compara con una simulación larga en estado estable (≈ 250 000 clientes por réplica, 6 réplicas, 5 % de calentamiento). El simulador está validado contra fórmulas exactas en `tests/validacion.js` y contra la biblioteca independiente Ciw. Error = (fórmula − simulación) / simulación. Servicio medio de 1 minuto.\n\n';
md += '## Resumen\n\n| Fórmula | Casos | Error absoluto mediano | Percentil 90 | Máximo |\n|---|---:|---:|---:|---:|\n';
summ.forEach((x) => { md += `| ${x.g} | ${x.n} | ${pc(x.med)} | ${pc(x.p90)} | ${pc(x.max)} |\n`; });
md += '\n## Detalle\n\n| Fórmula | Caso | Fórmula (min) | Simulación (min) | IC 95 % | Error | Nota |\n|---|---|---:|---:|---:|---:|---|\n';
rows.forEach((r) => { md += `| ${r.grupo} | ${r.caso} | ${r.teo.toFixed(4)} | ${r.sim.toFixed(4)} | ± ${r.hw.toFixed(4)} | ${(r.err >= 0 ? '+' : '') + pc(r.err)} | ${r.extra} |\n`; });
fs.writeFileSync(path.join(__dirname, 'PRECISION_APROXIMACIONES.md'), md);
console.log('\nResumen'); summ.forEach((x) => console.log(`${x.g}: ${x.n} casos, mediana ${pc(x.med)}, p90 ${pc(x.p90)}, máx ${pc(x.max)}`));
console.log('Escrito tests/PRECISION_APROXIMACIONES.md');
