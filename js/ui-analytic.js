/* Pestaña "Modelos analíticos": calculadora de fórmulas exactas y aproximadas, sensibilidad y costos. */
(function (root) {
  'use strict';
  const QS = root.QS; const U = QS.U, h = U.h, UI = QS.UI, A = QS.Analytic, Dist = QS.Dist;
  const AU = QS.AnalyticUI = {};
  let E = {};
  const DEF = () => ({
    model: 'mmc', lam: 60, svcMean: 3.5, c: 4, K: 12, N: 20, think: 120, patience: 5, slT: 5,
    balk: { type: 'linear', L: 8 }, svc: { type: 'gamma', mean: 3.5, sd: 2.5 }, ia: { type: 'erlang', mean: 1, k: 2 },
    batch: { type: 'geom', mean: 2, min: 1, max: 4 }, lamB: 25, preemptive: false,
    classes: [{ name: 'Preferencial', lam: 12, mean: 3.5, cv: 1 }, { name: 'General', lam: 45, mean: 3.5, cv: 1 }],
    stations: [{ name: 'Registro', c: 2, mean: 1.5, cv: 1 }, { name: 'Atención', c: 4, mean: 3.5, cv: 1 }, { name: 'Caja', c: 2, mean: 1.8, cv: 0.5 }],
    ca2: 1, cost: { server: 150, wait: 90, lost: 120, cur: '$' }
  });
  let P = Object.assign(DEF(), U.store.get('an:state', {}));

  AU.init = function (view) {
    E.view = view;
    E.side = h('aside', { class: 'side', 'aria-label': 'Parámetros del modelo' });
    E.out = h('div', { class: 'results' });
    U.clear(view);
    view.appendChild(h('div', { class: 'view-head' }, h('div', null, h('div', { class: 'eyebrow' }, 'Teoría de colas'), h('h2', null, 'Modelos analíticos'),
      h('p', null, 'Fórmulas exactas de estado estable (y aproximaciones reconocidas cuando no existen) con sensibilidad a servidores y a la demanda, optimización de costos y fórmulas a la vista para auditoría.'))));
    view.appendChild(h('div', { class: 'workspace' }, E.side, E.out));
    renderSide(); compute();
  };
  AU.activate = () => { QS.Charts.rerenderAll(); };
  // Carga un modelo a partir de un escenario del simulador
  AU.fromSpec = function (model, spec) {
    const sp = QS.Sim.normalize(spec), a = sp.arrivals, s0 = sp.stages[0];
    P.model = model; P.lam = +a.rate || P.lam; P.c = s0.servers; P.svcMean = Dist.make(s0.svc).mean; P.svc = Object.assign({}, s0.svc); P.slT = sp.run.slT;
    if (sp.capacity > 0) P.K = sp.capacity;
    if (sp.renege.on) P.patience = Dist.make(sp.renege.dist).mean;
    if (sp.balk.type !== 'none') P.balk = Object.assign({}, sp.balk);
    if (a.mode === 'renewal') P.ia = Object.assign({}, a.ia);
    if (a.mode === 'finite') { P.N = a.finite.N; P.think = Dist.make(a.finite.think).mean; }
    if (a.batch && a.batch.type !== 'none') { P.batch = Object.assign({}, a.batch); P.lamB = +a.rate; }
    if (model === 'prio') {
      const tot = sp.classes.reduce((x, c) => x + (+c.share || 0), 0) || 1; const d = Dist.make(s0.svc);
      P.classes = sp.classes.slice().sort((x, y) => x.prio - y.prio).map((c) => ({ name: c.name, lam: +a.rate * (+c.share || 0) / tot, mean: d.mean * (+c.svcMult || 1), cv: d.cv }));
      P.preemptive = s0.disc === 'PRIOP';
    }
    if (model === 'tandem') P.stations = sp.stages.map((x) => { const d = Dist.make(x.svc); return { name: x.name, c: x.servers, mean: d.mean, cv: d.cv }; });
    P.cost = Object.assign({}, sp.cost);
    save(); renderSide(); compute();
  };
  const save = () => U.store.set('an:state', P);

  /* ---------------- panel de parámetros ---------------- */
  function renderSide() {
    U.clear(E.side);
    const groups = [];
    A.MODELS.forEach((m) => { let g = groups.find((x) => x.group === m.group); if (!g) groups.push(g = { group: m.group, items: [] }); g.items.push([m.id, m.name]); });
    const head = h('div', { class: 'side-head' });
    head.appendChild(UI.select({ label: 'Modelo', options: groups, value: P.model, onChange: (v) => { P.model = v; save(); renderSide(); compute(); } }).el);
    head.appendChild(h('p', { class: 'hint' }, A.byId[P.model].short));
    E.side.appendChild(head);
    const s = UI.section('Parámetros', { open: true });
    const ch = () => { save(); compute(); };
    const num = (label, key, unit, help, o = {}) => UI.num(Object.assign({ label, unit, value: P[key], help, onInput: (v) => { P[key] = v; ch(); } }, o)).el;
    const lamF = () => num('Tasa de llegada λ', 'lam', 'clientes/h', 'Clientes que llegan por hora (proceso de Poisson).', { min: 0 });
    const svcF = () => num('Tiempo medio de servicio 1/μ', 'svcMean', 'min', 'Duración media de la atención. μ = 60 / tiempo medio (clientes por hora por servidor).', { min: 0 });
    const cF = () => num('Servidores c', 'c', '', 'Número de servidores en paralelo.', { min: 1, step: 1 });
    const distF = (label, key, help) => UI.dist({ label, spec: P[key], help, allowEmp: true, empData: () => QS.Data && QS.Data.sample(key === 'ia' ? 'ia' : 'svc'), onChange: (d) => { P[key] = d; ch(); } }).el;
    const m = P.model;
    if (['mm1', 'mmc', 'mmck', 'mmcc', 'mminf', 'erlangA', 'bd'].includes(m)) { s.body.appendChild(lamF()); s.body.appendChild(svcF()); }
    if (['mmc', 'mmck', 'mmcc', 'erlangA', 'bd', 'mgc', 'ggc', 'mmckn'].includes(m)) s.body.appendChild(cF());
    if (m === 'mmck') s.body.appendChild(num('Capacidad del sistema K', 'K', 'clientes', 'Máximo de clientes en el sistema (en fila + en servicio).', { min: 1, step: 1 }));
    if (m === 'mmckn') {
      s.body.appendChild(num('Población N', 'N', 'clientes', 'Número total de clientes posibles.', { min: 1, step: 1 }));
      s.body.appendChild(num('Tiempo medio fuera del sistema', 'think', 'min', 'Tiempo promedio entre que un cliente sale y vuelve a requerir servicio (p. ej. tiempo entre fallas de una máquina). λ por cliente = 60/este tiempo.', { min: 0 }));
      s.body.appendChild(svcF());
      s.body.appendChild(num('Capacidad K (opcional)', 'K', 'vacío = N', '', { min: 1, step: 1 }));
    }
    if (m === 'erlangA' || m === 'bd') s.body.appendChild(num('Paciencia media', 'patience', m === 'bd' ? 'min (0 = sin abandono)' : 'min', 'Tiempo promedio que un cliente tolera esperar antes de abandonar (exponencial). θ = 60/paciencia.', { min: 0 }));
    if (m === 'erlangA' || m === 'bd') s.body.appendChild(num('Capacidad K (opcional)', 'K', '0 = ilimitada', '', { min: 0, step: 1 }));
    if (m === 'bd') {
      s.body.appendChild(UI.select({ label: 'Desistir al llegar', value: P.balk.type, options: [['none', 'Nadie desiste'], ['threshold', 'Si la fila tiene L o más'], ['linear', 'Probabilidad fila/L'], ['exp', 'Probabilidad 1 − e^(−fila/L)']], onChange: (v) => { P.balk.type = v; ch(); } }).el);
      s.body.appendChild(UI.num({ label: 'Parámetro L', unit: 'personas', value: P.balk.L, min: 0.1, onInput: (v) => { P.balk.L = v; ch(); } }).el);
    }
    if (['mg1', 'mgc'].includes(m)) { s.body.appendChild(lamF()); s.body.appendChild(distF('Distribución del servicio', 'svc', 'Elige la forma; M/D/1 es "Constante" y M/Eₖ/1 es "Erlang-k".')); }
    if (['gg1', 'ggc'].includes(m)) { s.body.appendChild(distF('Tiempo entre llegadas', 'ia')); s.body.appendChild(distF('Distribución del servicio', 'svc')); }
    if (m === 'mxg1') {
      s.body.appendChild(num('Tasa de llegada de grupos λg', 'lamB', 'grupos/h', '', { min: 0 }));
      s.body.appendChild(UI.select({ label: 'Tamaño del grupo', value: P.batch.type, options: [['fixed', 'Fijo'], ['geom', 'Geométrico'], ['poisson', '1 + Poisson'], ['unif', 'Uniforme']], onChange: (v) => { P.batch.type = v; save(); renderSide(); compute(); } }).el);
      if (P.batch.type === 'unif') s.body.appendChild(UI.grid(2, UI.num({ label: 'Mínimo', value: P.batch.min, min: 1, step: 1, onInput: (v) => { P.batch.min = v; ch(); } }).el, UI.num({ label: 'Máximo', value: P.batch.max, min: 1, step: 1, onInput: (v) => { P.batch.max = v; ch(); } }).el));
      else s.body.appendChild(UI.num({ label: 'Tamaño medio', value: P.batch.mean, min: 1, onInput: (v) => { P.batch.mean = v; ch(); } }).el);
      s.body.appendChild(distF('Distribución del servicio (por persona)', 'svc'));
    }
    if (m === 'prio') {
      s.body.appendChild(cF());
      s.body.appendChild(UI.check({ label: 'Con expropiación (un cliente prioritario interrumpe la atención en curso)', checked: P.preemptive, onChange: (v) => { P.preemptive = v; ch(); } }).el);
      s.body.appendChild(h('p', { class: 'hint' }, 'Ordena las clases de mayor a menor prioridad. CV = 1 equivale a servicio exponencial.'));
      P.classes.forEach((k, i) => {
        s.body.appendChild(h('div', { class: 'dist' }, h('div', { class: 'row' }, h('b', null, `Prioridad ${i + 1}`), P.classes.length > 1 ? UI.btn('Quitar', () => { P.classes.splice(i, 1); save(); renderSide(); compute(); }, 'btn-ghost btn-sm') : null),
          UI.grid(2, UI.text({ label: 'Nombre', value: k.name, onInput: (v) => { k.name = v; ch(); } }).el,
            UI.num({ label: 'λ', unit: '/h', value: k.lam, min: 0, onInput: (v) => { k.lam = v; ch(); } }).el,
            UI.num({ label: 'Servicio medio', unit: 'min', value: k.mean, min: 0, onInput: (v) => { k.mean = v; ch(); } }).el,
            UI.num({ label: 'CV del servicio', value: k.cv, min: 0, step: 0.1, onInput: (v) => { k.cv = v; ch(); } }).el)));
      });
      if (P.classes.length < 6) s.body.appendChild(UI.btn('Agregar clase', () => { P.classes.push({ name: 'Clase ' + (P.classes.length + 1), lam: 10, mean: 3, cv: 1 }); save(); renderSide(); compute(); }, 'btn-sm'));
    }
    if (m === 'tandem') {
      s.body.appendChild(lamF());
      s.body.appendChild(num('Variabilidad de llegadas Ca²', 'ca2', '', '1 = Poisson; < 1 más regular; > 1 en ráfagas.', { min: 0, step: 0.1 }));
      P.stations.forEach((k, i) => {
        s.body.appendChild(h('div', { class: 'dist' }, h('div', { class: 'row' }, h('b', null, `Estación ${i + 1}`), P.stations.length > 1 ? UI.btn('Quitar', () => { P.stations.splice(i, 1); save(); renderSide(); compute(); }, 'btn-ghost btn-sm') : null),
          UI.grid(2, UI.text({ label: 'Nombre', value: k.name, onInput: (v) => { k.name = v; ch(); } }).el,
            UI.num({ label: 'Servidores', value: k.c, min: 1, step: 1, onInput: (v) => { k.c = v; ch(); } }).el,
            UI.num({ label: 'Servicio medio', unit: 'min', value: k.mean, min: 0, onInput: (v) => { k.mean = v; ch(); } }).el,
            UI.num({ label: 'CV del servicio', value: k.cv, min: 0, step: 0.1, onInput: (v) => { k.cv = v; ch(); } }).el)));
      });
      if (P.stations.length < 6) s.body.appendChild(UI.btn('Agregar estación', () => { P.stations.push({ name: 'Estación ' + (P.stations.length + 1), c: 1, mean: 2, cv: 1 }); save(); renderSide(); compute(); }, 'btn-sm'));
    }
    s.body.appendChild(num('Meta de espera T', 'slT', 'min', 'Para el nivel de servicio: % de clientes que esperan ≤ T.', { min: 0 }));
    E.side.appendChild(s.el);
    const c = UI.section('Costos', { open: false });
    c.body.appendChild(UI.grid(2,
      UI.num({ label: 'Costo por servidor', unit: '/hora', value: P.cost.server, min: 0, onInput: (v) => { P.cost.server = v || 0; ch(); } }).el,
      UI.num({ label: 'Costo de espera', unit: '/cliente-hora', value: P.cost.wait, min: 0, onInput: (v) => { P.cost.wait = v || 0; ch(); } }).el,
      UI.num({ label: 'Cliente perdido', unit: '/cliente', value: P.cost.lost, min: 0, onInput: (v) => { P.cost.lost = v || 0; ch(); } }).el,
      UI.text({ label: 'Moneda', value: P.cost.cur, onInput: (v) => { P.cost.cur = v || '$'; ch(); } }).el));
    E.side.appendChild(c.el);
    E.side.appendChild(h('div', { class: 'side-head' }, UI.btn('Simular este modelo', simulate, 'btn-primary', { title: 'Abre el simulador con un escenario equivalente en estado estable y ejecuta réplicas' }),
      h('p', { class: 'hint' }, 'Útil para validar supuestos o ver el comportamiento real cuando el modelo es aproximado.')));
  }

  /* ---------------- parámetros -> modelo ---------------- */
  const svcMom = (spec) => Dist.moments(Dist.make(spec), 1 / 60);
  const cvSpec = (mean, cv) => (Math.abs(cv - 1) < 1e-9 ? { type: 'exp', mean } : cv <= 0 ? { type: 'det', mean } : { type: 'gamma', mean, sd: mean * cv });
  function params(m, over = {}) {
    const p = Object.assign({}, P, over);
    const mu = 60 / p.svcMean;
    switch (m) {
      case 'mm1': return { lam: p.lam, mu };
      case 'mmc': return { lam: p.lam, mu, c: p.c };
      case 'mmck': return { lam: p.lam, mu, c: p.c, K: Math.max(p.K, p.c) };
      case 'mmcc': return { lam: p.lam, mu, c: p.c };
      case 'mminf': return { lam: p.lam, mu };
      case 'mmckn': return { lam: 60 / p.think, mu, c: p.c, N: p.N, K: p.K > 0 ? p.K : '' };
      case 'erlangA': return { lam: p.lam, mu, c: p.c, theta: p.patience > 0 ? 60 / p.patience : 0, K: p.K > 0 ? p.K : '' };
      case 'bd': return { lam: p.lam, mu, c: p.c, theta: p.patience > 0 ? 60 / p.patience : 0, K: p.K > 0 ? p.K : '', balk: p.balk };
      case 'mg1': return { lam: p.lam, S: svcMom(p.svc), kendallS: Dist.make(p.svc).kendall };
      case 'mgc': return { lam: p.lam, c: p.c, S: svcMom(p.svc), kendallS: Dist.make(p.svc).kendall };
      case 'gg1': return { A: svcMom(p.ia), S: svcMom(p.svc), kendallA: Dist.make(p.ia).kendall, kendallS: Dist.make(p.svc).kendall };
      case 'ggc': return { A: svcMom(p.ia), S: svcMom(p.svc), c: p.c, kendallA: Dist.make(p.ia).kendall, kendallS: Dist.make(p.svc).kendall };
      case 'mxg1': { const X = Dist.batch(p.batch); return { lamB: p.lamB, X: { m1: X.m1, m2: X.m2 }, S: svcMom(p.svc), kendallS: Dist.make(p.svc).kendall }; }
      case 'prio': return { c: p.c, preemptive: p.preemptive, classes: p.classes.map((k, i) => ({ name: k.name, prio: i + 1, lam: k.lam, S: svcMom(cvSpec(k.mean, k.cv)) })) };
      case 'tandem': return { lam: p.lam, ca2: p.ca2, stations: p.stations.map((k) => ({ name: k.name, c: k.c, S: svcMom(cvSpec(k.mean, k.cv)) })) };
      default: return {};
    }
  }
  const hasC = (m) => ['mm1', 'mmc', 'mmck', 'mmcc', 'erlangA', 'bd', 'mgc', 'ggc', 'mmckn', 'prio'].includes(m);

  /* ---------------- resultados ---------------- */
  function compute() {
    QS.Charts.prune(); U.clear(E.out);
    const m = P.model; const r = A.compute(m, params(m));
    const T = P.slT, cur = P.cost.cur || '$';
    E.out.appendChild(h('div', { class: 'row' }, h('span', { class: 'led' }, r.kendall || A.byId[m].name), r.approx ? UI.pill('Aproximación', 'warn') : UI.pill('Fórmula exacta', 'good'), r.ok ? null : UI.pill('Sin solución estable', 'bad')));
    if (!r.ok && r.error) E.out.appendChild(UI.note(r.error, 'bad'));
    if (!r.ok && !r.perClass && !r.stations) { sensitivity(m, r); return; }
    const tiles = [];
    const t = (l, v, sub, st, help) => tiles.push(UI.tile(l, v, sub, { state: st, help }));
    if (isFinite(r.rho)) t('Intensidad de tráfico ρ', U.fmt(r.rho, 3), isFinite(r.a) ? `a = λ/μ = ${U.fmt(r.a, 3)} Erlangs` : '', r.rho >= 1 ? 'bad' : r.rho > 0.9 ? 'warn' : null, 'ρ = λ/(cμ). Debe ser < 1 en sistemas sin pérdida para que la fila no crezca sin límite.');
    t('L: clientes en el sistema', U.fmt(r.L, 3), 'Promedio en fila + en servicio');
    t('Lq: clientes en fila', U.fmt(r.Lq, 3), 'Promedio esperando');
    t('W: tiempo en el sistema', U.fmtTime(r.W * 60), 'Espera + servicio');
    t('Wq: espera en fila', U.fmtTime(r.Wq * 60), isFinite(r.wqSd) ? `desv. est. ${U.fmtTime(r.wqSd * 60)}` : '', null, 'Ley de Little: Lq = λ·Wq.');
    if (isFinite(r.P0)) t('P₀: sistema vacío', U.fmtPct(r.P0), 'Probabilidad de que no haya nadie');
    if (isFinite(r.Pw)) t('P(esperar)', U.fmtPct(r.Pw), r.erlangC != null ? 'Fórmula C de Erlang' : 'Probabilidad de no ser atendido de inmediato');
    if (r.sl) { const sl = r.sl(T / 60); t(`Nivel de servicio (≤ ${U.fmtTime(T)})`, U.fmtPct(sl), r.Pab ? 'Atendidos a tiempo / clientes que entran' : 'P(Wq ≤ T)', sl >= 0.8 ? 'good' : sl >= 0.6 ? 'warn' : 'bad'); }
    if (r.wqPct) t('P90 de la espera', U.fmtTime(r.wqPct(0.9) * 60), `P95 ${U.fmtTime(r.wqPct(0.95) * 60)}`);
    if (isFinite(r.util)) t('Utilización de servidores', U.fmtPct(r.util), isFinite(r.lamEff) ? `λ efectiva ${U.fmt(r.lamEff, 2)}/h` : '', r.util > 0.9 ? 'warn' : null);
    if (r.Pblock > 0) t('P(bloqueo)', U.fmtPct(r.Pblock, 2), 'Llegan con el sistema lleno', r.Pblock > 0.05 ? 'bad' : null);
    if (r.Pbalk > 0) t('P(desistir)', U.fmtPct(r.Pbalk, 2), 'No entran al ver la fila', r.Pbalk > 0.05 ? 'bad' : null);
    if (r.Pab > 0) t('P(abandono)', U.fmtPct(r.Pab, 2), 'Se van antes de ser atendidos', r.Pab > 0.05 ? 'bad' : null);
    if (r.operational != null) t('Fracción operando', U.fmtPct(r.operational), 'Clientes de la población fuera del sistema');
    if (hasC(m) && isFinite(r.c)) { const k = A.costs(r, P.cost); t('Costo total por hora', U.fmtMoney(k.total, cur), `servidores ${U.fmtMoney(k.servers, cur)} · espera ${U.fmtMoney(k.waiting, cur)}`); }
    E.out.appendChild(h('div', { class: 'kpis' }, tiles));
    if (r.notes.length) E.out.appendChild(UI.note(h('div', null, r.notes.map((n) => h('div', null, n))), 'info'));
    if (r.perClass) {
      const c = UI.card('Resultados por clase de prioridad', { sub: 'Las clases de mayor prioridad esperan menos; la conservación del trabajo hace que el promedio ponderado coincida con FIFO (Kleinrock).' });
      c.body.appendChild(UI.table(['Clase', { t: 'λ (/h)', num: true }, { t: 'ρ de la clase', num: true }, { t: 'Wq', num: true }, { t: 'W', num: true }, { t: 'Lq', num: true }],
        r.perClass.map((k) => [`${k.prio}. ${k.name}`, U.fmt(k.lam, 2), U.fmt(k.rho, 3), U.fmtTime(k.Wq * 60), U.fmtTime(k.W * 60), U.fmt(k.Lq, 3)]), { compact: true }));
      E.out.appendChild(c.el);
    }
    if (r.stations) {
      const c = UI.card('Resultados por estación', { sub: 'La estación con mayor ρ es el cuello de botella del proceso.' });
      c.body.appendChild(UI.table(['Estación', { t: 'c', num: true }, { t: 'ρ', num: true }, { t: 'Ca² de entrada', num: true }, { t: 'Wq', num: true }, { t: 'W', num: true }],
        r.stations.map((k) => [k.name, k.c, U.fmt(k.rho, 3), U.fmt(k.ca2, 3), U.fmtTime(k.Wq * 60), U.fmtTime(k.W * 60)]), { compact: true, rowClass: (x, i) => (i === r.bottleneck ? 'hl' : '') }));
      E.out.appendChild(c.el);
    }
    const charts = [];
    if (r.pn && r.pn.length > 1) {
      const pc = UI.chartCard('Distribución del número de clientes Pₙ', { sub: 'Probabilidad de encontrar n clientes en el sistema.', height: 260 });
      const n = Math.min(r.pn.length, 80); const cats = U.range(n, String); const data = Array.from(r.pn.slice(0, n)).map((x) => +x.toFixed(6));
      QS.Charts.bars(pc.chartEl, { categories: cats, xName: 'n', yName: 'Pₙ', yFmt: (v) => U.fmtPct(v, 0), series: [{ name: 'Pₙ', data }],
        tooltip: (ps) => `n = ${ps[0].name}<br><b>${U.fmtPct(ps[0].value, 2)}</b>` });
      pc.setTable(() => ({ headers: [{ t: 'n', num: true }, { t: 'Pₙ', num: true }, { t: 'Acumulada', num: true }], rows: data.map((p, i) => [i, U.fmtPct(p, 3), U.fmtPct(data.slice(0, i + 1).reduce((a, b) => a + b, 0), 2)]) }));
      charts.push(pc.el);
    }
    if (r.sl && isFinite(r.Wq)) {
      const tmax = Math.max(T * 3, (r.wqPct ? r.wqPct(0.99) : r.Wq * 5) * 60, 1);
      const pts = U.range(61, (i) => i * tmax / 60);
      const wc = UI.chartCard('Probabilidad de esperar más de t', { sub: 'Curva de servicio: lee el % de clientes que espera más de cada tiempo.', height: 260 });
      QS.Charts.lines(wc.chartEl, { xType: 'value', xName: 'Espera t (min)', yName: 'P(Wq > t)', yFmt: (v) => U.fmtPct(v, 0), xMax: tmax,
        series: [{ name: 'P(Wq > t)', data: pts.map((x) => [x, 1 - r.sl(x / 60)]), area: true, markLine: (th) => ({ silent: true, symbol: 'none', lineStyle: { color: th.ink2, width: 1 }, label: { formatter: 'meta T', color: th.ink2 }, data: [{ xAxis: T }] }) }],
        vf: (v) => U.fmtPct(v, 1) });
      wc.setTable(() => ({ headers: [{ t: 't', num: true }, { t: 'P(Wq > t)', num: true }], rows: pts.filter((x, i) => i % 3 === 0).map((x) => [U.fmtTime(x), U.fmtPct(1 - r.sl(x / 60), 2)]) }));
      charts.push(wc.el);
    }
    if (charts.length) E.out.appendChild(charts.length === 2 ? h('div', { class: 'cols-2' }, charts) : charts[0]);
    sensitivity(m, r);
    const f = UI.card('Fórmulas utilizadas', { sub: 'Notación: λ tasa de llegada, μ tasa de servicio por servidor, c servidores, ρ intensidad de tráfico.' });
    f.body.appendChild(h('div', { class: 'formulas' }, r.formulas.join('\n')));
    E.out.appendChild(f.el);
  }

  function sensitivity(m, r0) {
    const cards = [];
    if (hasC(m) && m !== 'prio' && m !== 'mmckn') {
      const c0 = Math.max(1, Math.round(P.c));
      const a = (m === 'ggc' || m === 'gg1') ? (60 / Dist.make(P.ia).mean) * Dist.make(P.svc).mean / 60 : ['mg1', 'mgc'].includes(m) ? P.lam * Dist.make(P.svc).mean / 60 : P.lam * P.svcMean / 60;
      const cmin = Math.max(1, ['mmck', 'mmcc', 'erlangA', 'bd'].includes(m) ? Math.max(1, Math.floor(a * 0.6)) : Math.floor(a) + 1);
      const cs = U.range(12, (i) => cmin + i);
      const mm = m === 'mm1' ? 'mmc' : m === 'gg1' ? 'ggc' : m === 'mg1' ? 'mgc' : m;
      const rows = cs.map((c) => { const r = A.compute(mm, params(mm, { c, K: Math.max(P.K, c) })); return { c, r, k: r.ok ? A.costs(r, P.cost) : null }; });
      const ok = rows.filter((x) => x.r.ok);
      if (ok.length) {
        const best = ok.reduce((b, x) => (x.k.total < b.k.total ? x : b), ok[0]);
        const cc = UI.chartCard('¿Cuántos servidores? Costo total por hora', { sub: `Costo de servidores + costo de espera + clientes perdidos. Mínimo con c = ${best.c}.`, height: 280 });
        QS.Charts.mount(cc.chartEl, (t) => {
          const o = QS.Charts.base(t, { pointer: 'shadow' });
          o.xAxis = QS.Charts.xCat(t, ok.map((x) => String(x.c)), { name: 'Servidores c' });
          o.yAxis = QS.Charts.yVal(t, { name: 'Costo por hora', fmt: (v) => U.compact(v) });
          const s = (name, key, i) => QS.Charts.bar(t, name, ok.map((x) => +x.k[key].toFixed(2)), i, { stack: 'a' });
          o.series = [s('Servidores', 'servers', 0), s('Espera', 'waiting', 1), s('Perdidos', 'lost', 2),
            Object.assign(QS.Charts.line(t, 'Total', ok.map((x) => +x.k.total.toFixed(2)), 6, { symbols: true }), { z: 5 })];
          o.tooltip.valueFormatter = (v) => U.fmtMoney(v, P.cost.cur);
          return o;
        });
        cc.setTable(() => ({ headers: [{ t: 'c', num: true }, { t: 'ρ', num: true }, { t: 'Wq', num: true }, { t: `NS ≤ ${U.fmtTime(P.slT)}`, num: true }, { t: 'Perdidos', num: true }, { t: 'Costo total/h', num: true }],
          rows: ok.map((x) => [x.c, U.fmt(x.r.rho, 3), U.fmtTime(x.r.Wq * 60), x.r.sl ? U.fmtPct(x.r.sl(P.slT / 60)) : '—', U.fmtPct(x.r.Plost || 0, 2), U.fmtMoney(x.k.total, P.cost.cur)]) }));
        const wc = UI.chartCard('Espera y nivel de servicio según servidores', { sub: 'Rendimientos decrecientes: cada servidor adicional reduce menos la espera.', height: 280 });
        QS.Charts.lines(wc.chartEl, { categories: ok.map((x) => String(x.c)), xName: 'Servidores c', yName: 'Espera Wq (min)', series: [{ name: 'Wq (min)', data: ok.map((x) => +(x.r.Wq * 60).toFixed(4)), symbols: true }], vf: (v) => U.fmtTime(v) });
        wc.setTable(() => ({ headers: [{ t: 'c', num: true }, { t: 'Wq', num: true }, { t: 'Lq', num: true }, { t: 'Utilización', num: true }], rows: ok.map((x) => [x.c, U.fmtTime(x.r.Wq * 60), U.fmt(x.r.Lq, 3), U.fmtPct(x.r.util)]) }));
        cards.push(cc.el, wc.el);
      }
    }
    // Curva de congestión vs demanda
    if (['mm1', 'mmc', 'mg1', 'mgc', 'gg1', 'ggc', 'erlangA', 'bd', 'mmck'].includes(m)) {
      const c = ['mm1', 'mg1', 'gg1'].includes(m) ? 1 : Math.max(1, Math.round(P.c));
      const sMean = ['mg1', 'mgc', 'gg1', 'ggc'].includes(m) ? Dist.make(P.svc).mean : P.svcMean;
      const lamMax = c * 60 / sMean; const pts = U.range(40, (i) => (0.05 + 0.94 * i / 39) * lamMax);
      const mm = m === 'mm1' ? 'mmc' : m;
      const ser = pts.map((lam) => {
        let pr;
        if (mm === 'gg1' || mm === 'ggc') { const ia = Dist.withMean(P.ia, 60 / lam); pr = params(mm, { ia }); }
        else pr = params(mm, { lam });
        const r = A.compute(mm, pr); return [lam / lamMax, r.ok ? r.Wq * 60 : null];
      });
      const cur = isFinite(r0.rho) ? r0.rho : null;
      const lc = UI.chartCard('Curva de congestión', { sub: 'Espera media al aumentar la demanda con la capacidad actual: cerca de ρ = 1 la espera se dispara.', height: 280 });
      QS.Charts.lines(lc.chartEl, { xType: 'value', xName: 'Intensidad de tráfico ρ', xMin: 0, xMax: 1, xFmt: (v) => U.fmt(v, 1), yName: 'Wq (min)', yMax: Math.max(...ser.filter((x) => x[1] != null).map((x) => x[1]).slice(0, 36), 1),
        series: [{ name: 'Wq (min)', data: ser, markLine: (t) => (cur && cur < 1 ? { silent: true, symbol: 'none', lineStyle: { color: t.ink2, width: 1 }, label: { formatter: 'actual', color: t.ink2 }, data: [{ xAxis: cur }] } : undefined) }],
        vf: (v) => U.fmtTime(v) });
      lc.setTable(() => ({ headers: [{ t: 'ρ', num: true }, { t: 'λ (/h)', num: true }, { t: 'Wq', num: true }], rows: ser.map((x, i) => [U.fmt(x[0], 3), U.fmt(pts[i], 2), U.fmtTime(x[1])]) }));
      cards.push(lc.el);
    }
    if (cards.length === 3) { E.out.appendChild(h('div', { class: 'cols-2' }, cards[0], cards[1])); E.out.appendChild(cards[2]); }
    else if (cards.length) E.out.appendChild(cards.length === 2 ? h('div', { class: 'cols-2' }, cards) : cards[0]);
  }

  /* ---------------- llevar el modelo al simulador ---------------- */
  function simulate() {
    const m = P.model; const base = QS.Sim.defaults();
    const sp = Object.assign(base, { name: 'Validación de ' + A.byId[m].name, open: 0, classes: [{ name: 'General', share: 100, prio: 1 }],
      run: { hours: 400, warmupH: 20, reps: 10, seed: 11, drain: false, slT: P.slT }, cost: Object.assign({}, P.cost) });
    const st = (o) => Object.assign({}, base.stages[0], o);
    const exp = { type: 'exp', mean: P.svcMean };
    sp.arrivals = Object.assign(base.arrivals, { mode: 'poisson', rate: P.lam });
    switch (m) {
      case 'mm1': sp.stages = [st({ servers: 1, svc: exp })]; break;
      case 'mmc': sp.stages = [st({ servers: P.c, svc: exp })]; break;
      case 'mmck': sp.stages = [st({ servers: P.c, svc: exp })]; sp.capacity = Math.max(P.K, P.c); break;
      case 'mmcc': sp.stages = [st({ servers: P.c, svc: exp })]; sp.capacity = P.c; break;
      case 'mminf': { const a = P.lam * P.svcMean / 60; sp.stages = [st({ servers: Math.ceil(a + 6 * Math.sqrt(a) + 10), svc: exp })]; break; }
      case 'mmckn': sp.arrivals.mode = 'finite'; sp.arrivals.finite = { N: P.N, think: { type: 'exp', mean: P.think } }; sp.stages = [st({ servers: P.c, svc: exp })]; if (P.K > 0) sp.capacity = P.K; break;
      case 'erlangA': sp.stages = [st({ servers: P.c, svc: exp })]; sp.renege = { on: P.patience > 0, dist: { type: 'exp', mean: P.patience } }; if (P.K > 0) sp.capacity = P.K; break;
      case 'bd': sp.stages = [st({ servers: P.c, svc: exp })]; sp.renege = { on: P.patience > 0, dist: { type: 'exp', mean: P.patience } }; sp.balk = Object.assign({}, P.balk); if (P.K > 0) sp.capacity = P.K; break;
      case 'mg1': sp.stages = [st({ servers: 1, svc: P.svc })]; break;
      case 'mgc': sp.stages = [st({ servers: P.c, svc: P.svc })]; break;
      case 'gg1': sp.arrivals.mode = 'renewal'; sp.arrivals.ia = P.ia; sp.stages = [st({ servers: 1, svc: P.svc })]; break;
      case 'ggc': sp.arrivals.mode = 'renewal'; sp.arrivals.ia = P.ia; sp.stages = [st({ servers: P.c, svc: P.svc })]; break;
      case 'mxg1': sp.arrivals.rate = P.lamB; sp.arrivals.batch = Object.assign({}, P.batch); sp.stages = [st({ servers: 1, svc: P.svc })]; break;
      case 'prio': {
        const tot = P.classes.reduce((s, k) => s + k.lam, 0); const m0 = P.classes[0].mean;
        sp.arrivals.rate = tot;
        sp.classes = P.classes.map((k, i) => ({ name: k.name, share: k.lam, prio: i + 1, svcMult: k.mean / m0, patMult: 1 }));
        sp.stages = [st({ servers: P.c, svc: cvSpec(m0, P.classes[0].cv), disc: P.preemptive ? 'PRIOP' : 'PRIO' })];
        break;
      }
      case 'tandem': sp.stages = P.stations.map((k) => st({ name: k.name, servers: k.c, svc: cvSpec(k.mean, k.cv) })); break;
      default: break;
    }
    QS.App.go('sim');
    QS.SimUI.load(sp, { run: true });
  }
})(typeof window !== 'undefined' ? window : globalThis);
