/* Pestaña "Simulador": configuración del escenario, animación, indicadores en vivo y análisis por réplicas. */
(function (root) {
  'use strict';
  const QS = root.QS; const U = QS.U, h = U.h, UI = QS.UI, Sim = QS.Sim, Dist = QS.Dist, A = QS.Analytic;
  const SU = QS.SimUI = {};
  const S = { spec: null, sim: null, anim: null, playing: false, speed: 2, lastTs: 0, lastKpi: 0, lastChart: 0, ticker: [], tickerDirty: false,
    active: false, open: { arr: true, stg: true }, running: false, cancel: false, agg: null, resetTimer: 0, mode: U.store.get('sim:mode', 'simple') };
  const terms = () => Object.assign({ server: 'servidor', servers: 'Servidores', customer: 'cliente' }, (S.spec && S.spec.terms) || {});
  let E = {};

  const MODES = [['poisson', 'Poisson (tasa constante)'], ['renewal', 'Renovación: tiempo entre llegadas general'], ['profile', 'Perfil por hora (Poisson no homogéneo)'],
    ['appointments', 'Citas programadas (+ pacientes sin cita)'], ['finite', 'Población finita (fuente finita)']];
  const DISC = [['FIFO', 'FIFO: primero en llegar, primero en ser atendido'], ['LIFO', 'LIFO: último en llegar, primero en ser atendido'], ['SIRO', 'SIRO: orden aleatorio'],
    ['PRIO', 'Prioridad sin expropiación'], ['PRIOP', 'Prioridad con expropiación (interrumpe)'], ['SPT', 'SPT: trabajo más corto primero']];
  const BALK = [['none', 'Nadie desiste'], ['threshold', 'Desiste si la fila tiene L o más personas'], ['linear', 'Probabilidad lineal: fila/L'], ['exp', 'Probabilidad 1 − e^(−fila/L)']];
  const BATCH = [['none', 'No: llegan de uno en uno'], ['fixed', 'Grupo de tamaño fijo'], ['geom', 'Tamaño geométrico (media dada)'], ['poisson', 'Tamaño 1 + Poisson'], ['unif', 'Uniforme entre mínimo y máximo']];

  const clock = (t) => U.fmtClock((S.spec ? +S.spec.open || 0 : 0) + t);

  /* ===================== construcción de la vista ===================== */
  SU.init = function (view) {
    E.view = view;
    const saved = U.store.get('sim:spec', null);
    S.spec = Sim.normalize(saved || QS.Presets.get('banco'));
    E.side = h('aside', { class: 'side', 'aria-label': 'Configuración del escenario' });
    E.kendall = h('span', { class: 'led', title: 'Notación de Kendall A/B/c/K/N/D' });
    E.title = h('h3');
    E.clock = h('span', { class: 'clock', 'aria-label': 'Reloj de la simulación' }, '00:00');
    E.status = UI.pill('Listo', 'info');
    S.view = U.store.get('sim:view', '3d');
    E.viewSeg = UI.seg({ label: 'Vista', value: S.view, options: [['2d', 'Plano'], ['3d', '3D']], onChange: (v) => { S.view = v; U.store.set('sim:view', v); makeAnim(); } });
    E.canvas = h('canvas', { role: 'img', 'aria-label': 'Animación del sistema de colas: personas llegando, esperando y siendo atendidas' });
    E.legend = h('div', { class: 'legend-row' });
    E.play = UI.btn('▶ Reproducir', togglePlay, 'btn-primary');
    E.speed = h('input', { type: 'range', min: '0', max: '100', step: '1', value: String(speedToSlider(S.speed)), 'aria-label': 'Velocidad de la simulación' });
    E.speedOut = h('output');
    E.speed.addEventListener('input', () => { S.speed = sliderToSpeed(+E.speed.value); showSpeed(); });
    E.live = h('div', { class: 'live-kpis' });
    E.liveChart = h('div', { class: 'chart', style: { height: '230px' } });
    E.tick = h('div', { class: 'ticker', 'aria-live': 'off' });
    E.analysis = h('div', { class: 'card-body' });
    const stageCard = h('section', { class: 'card stage-card' },
      h('div', { class: 'stage-top' }, h('div', { class: 'stage-title' }, E.kendall, E.title), h('div', { class: 'row' }, E.status, E.clock)),
      h('div', { class: 'canvas-box' }, E.canvas), E.legend,
      h('div', { class: 'controls' }, E.play, UI.btn('Paso a paso', stepOnce, 'btn-ghost', { title: 'Procesa un solo evento' }),
        UI.btn('Reiniciar', () => { resetSim(); }, 'btn-ghost'), UI.btn('Terminar jornada', finishNow, 'btn-ghost', { title: 'Calcula el resto de la jornada sin animar' }),
        h('label', { class: 'speed' }, 'Velocidad', E.speed, E.speedOut), h('div', { class: 'view-seg' }, E.viewSeg.el)),
      E.live);
    const liveCard = UI.card('Evolución de la jornada', { sub: 'Clientes en el sistema y en fila a lo largo del tiempo simulado.' });
    liveCard.body.appendChild(E.liveChart);
    const tickCard = UI.card('Bitácora de eventos', { sub: 'Lo último que ocurrió en la simulación.' });
    tickCard.body.appendChild(E.tick);
    E.runBtn = UI.btn('Ejecutar réplicas', runAnalysis, 'btn-primary');
    E.cancelBtn = UI.btn('Cancelar', () => { S.cancel = true; }, 'btn-ghost', { hidden: true });
    E.prog = UI.progress();
    const anaCard = h('section', { class: 'card' },
      h('div', { class: 'card-head' }, h('div', null, h('h3', null, 'Análisis estadístico por réplicas'),
        h('p', { class: 'sub' }, 'Repite la jornada con números aleatorios independientes y reporta promedios con intervalos de confianza del 95 %, comparación con la teoría y desempeño por hora.')),
      h('div', { class: 'card-actions' }, E.runBtn, E.cancelBtn)),
      h('div', { class: 'card-body' }, E.prog.el), E.analysis);
    U.clear(view);
    view.appendChild(h('div', { class: 'view-head' }, h('div', null, h('div', { class: 'eyebrow' }, 'Simulador visual'), h('h2', null, 'Simulación de eventos discretos'),
      h('p', null, 'Configura cómo llegan los clientes, cuántos servidores hay y cómo se comporta la fila. Mira la jornada en movimiento y luego ejecuta réplicas para obtener resultados con validez estadística.'))));
    view.appendChild(h('div', { class: 'workspace' }, E.side, h('div', { class: 'results' }, stageCard, h('div', { class: 'cols-2' }, liveCard.el, tickCard.el), anaCard)));
    makeAnim();
    renderConfig(); showSpeed(); resetSim();
    E.analysis.appendChild(UI.note('Ejecuta las réplicas para ver promedios, intervalos de confianza, la comparación con el modelo analítico equivalente y el análisis de cuántos servidores conviene tener.', 'info'));
    requestAnimationFrame(loop);
  };
  // Vista plana (desde arriba) o 3D (cámara en perspectiva, al estilo de los simuladores de planta); ambas leen el mismo motor
  function makeAnim() {
    if (S.anim && S.anim.destroy) S.anim.destroy();
    const A = S.view === '3d' && QS.Anim3D ? QS.Anim3D : QS.Anim;
    S.anim = new A(E.canvas, { onEvent: onSimEvent });
    if (S.sim) { S.anim.attach(S.sim); S.anim.draw(); }
  }
  SU.activate = (on) => { S.active = on; if (on) { S.anim.resize(); S.anim.readTheme(); S.anim.draw(); } else if (S.playing) togglePlay(); };
  SU.theme = () => { if (S.anim) { S.anim.readTheme(); S.anim.draw(); } renderLegend(); };
  SU.getSpec = () => JSON.parse(JSON.stringify(S.spec));
  SU.load = function (spec, o = {}) {
    S.spec = Sim.normalize(spec);
    if (o.simple) S.mode = 'simple'; else if (o.expert) S.mode = 'expert';
    U.store.set('sim:mode', S.mode);
    renderConfig(); resetSim(); save();
    if (o.toast !== false) U.toast('Escenario cargado en el simulador: ' + S.spec.name, 'ok');
    if (o.play && !S.playing) togglePlay();
    if (o.run) runAnalysis();
  };

  /* ===================== velocidad ===================== */
  const LMIN = Math.log10(1 / 60), LMAX = Math.log10(240);
  function sliderToSpeed(v) { return Math.pow(10, LMIN + (LMAX - LMIN) * v / 100); }
  function speedToSlider(s) { return Math.round((Math.log10(s) - LMIN) / (LMAX - LMIN) * 100); }
  function showSpeed() {
    const s = S.speed; let txt;
    if (s < 0.0175) txt = 'tiempo real'; else if (s < 1) txt = `1 s = ${U.fmt(s * 60, 0)} s`; else if (s < 60) txt = `1 s = ${U.fmt(s, s < 10 ? 1 : 0)} min`; else txt = `1 s = ${U.fmt(s / 60, 1)} h`;
    E.speedOut.textContent = txt;
  }

  /* ===================== simulación animada ===================== */
  function resetSim() {
    clearTimeout(S.resetTimer);
    const wasPlaying = S.playing; S.playing = false;
    S.sim = new Sim(S.spec, S.spec.run.seed, { trace: true, keepWaits: true, maxSys: 8000, onEvent: (t, c, v, sim) => S.anim.event(t, c, v, sim) });
    S.anim.attach(S.sim); S.ticker = []; S.tickerDirty = true; E.liveTiles = null; U.clear(E.live);
    E.kendall.textContent = Sim.kendall(S.spec); E.title.textContent = S.spec.name;
    renderLegend(); updateKpis(); renderLiveChart(); renderTicker(); setStatus();
    E.play.textContent = '▶ Reproducir';
    S.anim.draw();
    if (wasPlaying) togglePlay();
  }
  function togglePlay() {
    if (S.sim.done) resetSim();
    S.playing = !S.playing; E.play.textContent = S.playing ? '❚❚ Pausar' : '▶ Reproducir'; setStatus();
  }
  function stepOnce() { if (S.playing) togglePlay(); if (S.sim.done) return; S.sim.step(1); updateKpis(); setStatus(); renderTicker(); }
  function finishNow() {
    if (S.sim.done) return;
    S.sim.runUntil(Infinity); S.playing = false; E.play.textContent = '▶ Reproducir';
    updateKpis(); renderLiveChart(); setStatus(); renderTicker(); onDone();
  }
  function setStatus() {
    const s = S.sim; let t, st;
    if (s.done) { t = s.unstable ? 'Inestable' : 'Terminada'; st = s.unstable ? 'bad' : 'good'; }
    else if (S.playing && s.t < s.warm) { t = `Calentamiento: las estadísticas empiezan a las ${clock(s.warm)}`; st = 'warn'; }
    else if (S.playing) { t = s.t >= s.tEnd ? 'Cerrado: atendiendo a los que quedan' : 'En marcha'; st = 'info'; }
    else { t = s.t > 0 ? 'En pausa' : 'Listo'; st = s.t > 0 ? 'warn' : 'info'; }
    E.status.textContent = t; E.status.className = 'pill st-' + st;
  }
  function loop(ts) {
    requestAnimationFrame(loop);
    const dt = Math.min(0.1, Math.max(0, (ts - S.lastTs) / 1000)); S.lastTs = ts;
    if (!S.active || !S.sim) return;
    if (S.playing && !S.sim.done) {
      S.sim.runUntil(S.sim.t + dt * S.speed);
      if (S.sim.done) { S.playing = false; E.play.textContent = '▶ Reproducir'; setStatus(); onDone(); }
    }
    S.anim.update(dt, S.speed); S.anim.draw();
    E.clock.textContent = clock(S.sim.t);
    if (ts - S.lastKpi > 250) { S.lastKpi = ts; updateKpis(); if (S.tickerDirty) renderTicker(); setStatus(); }
    if (ts - S.lastChart > 1200 && S.playing) { S.lastChart = ts; renderLiveChart(); }
  }
  function onDone() {
    renderLiveChart();
    const r = S.sim.results();
    pushTick(S.sim.t, r.unstable ? `La fila superó ${U.fmtInt(S.sim.maxSys)} clientes: el sistema es inestable con esta configuración.` : `Fin de la jornada: ${U.fmtInt(r.served)} atendidos, espera media ${U.fmtTime(r.Wq)}, nivel de servicio ${U.fmtPct(r.SL)}.`);
    renderTicker();
  }

  function onSimEvent(type, c, v) {
    const sim = S.sim; if (!sim) return;
    const name = (c) => `#${c.id}${sim.cls.length > 1 ? ' (' + sim.cls[c.k].name + ')' : ''}`;
    const srvName = (v) => `${sim.st[v.s].name} ${v.i + 1}`;
    let txt = null;
    switch (type) {
      case 'start': if (c.st === 0 && c.pre === 0) txt = `${name(c)} pasa a ${srvName(v)} tras esperar ${U.fmtTime(c.wq0)}`; break;
      case 'abandon': txt = `${name(c)} abandona la fila tras ${U.fmtTime(c.wq0)}`; break;
      case 'balk': txt = `${name(c)} desiste al ver la fila`; break;
      case 'block': txt = `${name(c)} no puede entrar: sistema lleno`; break;
      case 'preempt': txt = `${name(c)} es interrumpido por un cliente de mayor prioridad`; break;
      case 'jockey': if (S.speed < 20) txt = `${name(c)} se cambia a la fila de ${srvName(sim.st[c.st].srv[c.q])}`; break;
      case 'fail': txt = `${srvName(v)} se detiene por una falla`; break;
      case 'repair': txt = `${srvName(v)} vuelve a operar`; break;
      case 'on': txt = `Abre ${srvName(v)} (cambio de turno)`; break;
      case 'off': txt = `Cierra ${srvName(v)} (cambio de turno)`; break;
      case 'orbit': txt = `${name(c)} volverá a intentarlo más tarde`; break;
      default: break;
    }
    if (txt) pushTick(sim.t, txt);
  }
  function pushTick(t, txt) { S.ticker.push([t, txt]); if (S.ticker.length > 80) S.ticker.splice(0, S.ticker.length - 80); S.tickerDirty = true; }
  function renderTicker() {
    S.tickerDirty = false; U.clear(E.tick);
    if (!S.ticker.length) { E.tick.appendChild(h('div', { class: 'hint' }, 'Reproduce la simulación para ver los eventos.')); return; }
    for (let i = S.ticker.length - 1; i >= Math.max(0, S.ticker.length - 40); i--) { const [t, x] = S.ticker[i]; E.tick.appendChild(h('div', null, h('span', { class: 't' }, clock(t)), x)); }
  }
  function renderLegend() {
    if (!S.sim) return; U.clear(E.legend);
    const dark = U.isDark(); const pal = dark ? ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300', '#9085e9', '#e66767'] : ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#4a3aa7', '#e34948'];
    S.sim.cls.forEach((k, i) => E.legend.appendChild(h('span', null, h('i', { class: 'dot', style: { background: pal[i % 8] } }), k.name + (S.sim.cls.length > 1 ? ` (prioridad ${k.prio})` : ''))));
    E.legend.appendChild(h('span', null, h('i', { class: 'dot', style: { background: 'var(--good)' } }), 'Servidor libre'));
    E.legend.appendChild(h('span', null, h('i', { class: 'dot', style: { background: 'var(--accent)' } }), 'Ocupado (el aro muestra el avance)'));
    E.legend.appendChild(h('span', null, h('i', { class: 'dot', style: { background: 'var(--bad)' } }), 'Falla / abandono'));
    E.legend.appendChild(h('span', null, h('i', { class: 'dot', style: { background: 'var(--warn)' } }), `Punto sobre la cabeza: espera vs meta de ${U.fmtTime(S.spec.run.slT)}`));
  }
  function updateKpis() {
    const sim = S.sim; if (!sim) return;
    const s = sim.S; let busy = 0, on = 0, aBusy = 0, aOn = 0;
    for (const st of sim.st) { busy += st.busy; on += st.on - st.down; aBusy += st.aBusy; aOn += st.aOn - st.aDown; }
    const Wq = s.served ? s.sumWq / s.served : NaN;
    const SL = s.slN + s.ab ? s.slOk / (s.slN + s.ab) : NaN;
    const items = [
      ['En el sistema', U.fmtInt(sim.inSys), `máx. ${U.fmtInt(s.maxSys)}`],
      ['En fila', U.fmtInt(sim.nqTot), `máx. ${U.fmtInt(s.maxQ)}`],
      [`${terms().servers} ocupados`, `${busy}/${on}`, `utilización ${U.fmtPct(aOn ? aBusy / aOn : NaN, 0)}`],
      ['Atendidos', U.fmtInt(s.served), `llegaron ${U.fmtInt(s.arr)}`],
      ['Espera media en fila', U.fmtTime(Wq), s.served ? `en sistema ${U.fmtTime(s.sumW / s.served)}` : ''],
      ['Nivel de servicio', U.fmtPct(SL, 0), `espera ≤ ${U.fmtTime(sim.slT)}`],
      ['Abandonos', U.fmtInt(s.ab), s.ent ? U.fmtPct(s.ab / s.ent) : ''],
      ['Desisten / sin cupo', `${U.fmtInt(s.balk)} / ${U.fmtInt(s.block)}`, s.arr ? U.fmtPct((s.balk + s.block) / s.arr) : '']
    ];
    if (!E.liveTiles) {
      E.liveTiles = items.map(([l]) => { const t = UI.tile(l, '—', ' '); E.live.appendChild(t); return t; });
    }
    items.forEach(([, v, sub], i) => { const t = E.liveTiles[i]; t.querySelector('.tile-val').textContent = v; t.querySelector('.tile-sub').textContent = sub || ' '; });
    const slState = !isFinite(SL) ? '' : SL >= 0.8 ? 'good' : SL >= 0.6 ? 'warn' : 'bad';
    E.liveTiles[5].className = 'tile' + (slState ? ' st-' + slState : '');
  }
  function renderLiveChart() {
    const tr = S.sim && S.sim.tr; if (!tr) return;
    const cats = tr.t.map((t) => clock(t));
    if (!E.lc) {
      E.lc = QS.Charts.lines(E.liveChart, { categories: cats, yName: 'Clientes', series: [
        { name: 'En el sistema (L)', data: tr.L.slice() }, { name: 'En fila (Lq)', data: tr.Lq.slice() }, { name: 'Servidores ocupados', data: tr.busy.slice(), dashed: false }] });
    } else {
      E.lc.update((t) => {
        const o = QS.Charts.base(t, {}); o.xAxis = QS.Charts.xCat(t, cats, { gap: false }); o.yAxis = QS.Charts.yVal(t, { name: 'Clientes' });
        o.series = [QS.Charts.line(t, 'En el sistema (L)', tr.L.slice(), 0), QS.Charts.line(t, 'En fila (Lq)', tr.Lq.slice(), 1), QS.Charts.line(t, 'Servidores ocupados', tr.busy.slice(), 2)];
        o.animation = false; return o;
      });
    }
  }

  /* ===================== panel de configuración ===================== */
  function save() { U.store.set('sim:spec', S.spec); }
  function changed(structural) {
    save();
    E.kendall.textContent = Sim.kendall(S.spec);
    if (structural) renderConfig();
    clearTimeout(S.resetTimer); S.resetTimer = setTimeout(resetSim, 350);
  }
  function sec(key, title, open, badge) {
    const s = UI.section(title, { open: S.open[key] !== undefined ? S.open[key] : !!open, badge });
    s.el.addEventListener('toggle', () => { S.open[key] = s.el.open; });
    return s;
  }
  function renderConfig() {
    const scroll = E.side.scrollTop; U.clear(E.side);
    const spec = S.spec;
    const groups = []; QS.Presets.list.forEach((p) => { let g = groups.find((x) => x.group === p.sector); if (!g) groups.push(g = { group: p.sector, items: [] }); g.items.push([p.id, p.name]); });
    const preset = UI.select({ label: 'Ejemplos para aprender (datos ficticios)', options: [{ group: 'Elige un ejemplo', items: [['', 'Abrir un ejemplo…']] }].concat(groups), value: '',
      help: 'Son escenarios ficticios para conocer cada modalidad. Para analizar tu negocio usa el recorrido de cinco pasos o escribe tus propios valores aquí.',
      onChange: (v) => { if (v) SU.load(QS.Presets.get(v)); } });
    const modeSeg = UI.seg({ label: 'Modo', value: S.mode, options: [['simple', 'Modo simple'], ['expert', 'Modo experto']], onChange: (v) => { S.mode = v; U.store.set('sim:mode', v); renderConfig(); } });
    const name = UI.text({ label: 'Nombre del escenario', value: spec.name, onInput: (v) => { spec.name = v; E.title.textContent = v; save(); } });
    const file = h('input', { type: 'file', accept: '.json,application/json', hidden: true });
    file.addEventListener('change', async () => {
      const f = file.files[0]; if (!f) return;
      try { SU.load(JSON.parse(await f.text())); } catch (e) { U.toast('El archivo no es un escenario válido (JSON).', 'bad'); }
      file.value = '';
    });
    E.side.appendChild(h('div', { class: 'side-head' }, modeSeg.el, preset.el, name.el,
      h('div', { class: 'row' }, UI.btn('Guardar escenario', () => U.saveFile(fileName(spec.name) + '.json', JSON.stringify(spec, null, 2), 'application/json'), 'btn-sm'),
        UI.btn('Abrir escenario', () => file.click(), 'btn-sm'), UI.btn('Exportar a Ciw (Python)', exportCiw, 'btn-sm', { title: 'Genera un script para validar el mismo modelo con la librería Ciw' }), file)));
    if (S.mode === 'simple') { renderSimple(); E.side.scrollTop = scroll; return; }
    E.side.appendChild(secArrivals());
    E.side.appendChild(secClasses());
    E.side.appendChild(secStages());
    E.side.appendChild(secBehavior());
    E.side.appendChild(secFailures());
    E.side.appendChild(secRun());
    E.side.appendChild(secCosts());
    E.side.scrollTop = scroll;
  }
  const fileName = (s) => (s || 'escenario').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w-]+/g, '_').replace(/_+/g, '_').slice(0, 60);
  const hoursCount = () => Math.max(1, Math.ceil(+S.spec.run.hours || 1));
  const hourLabel = (i) => U.fmtClock((+S.spec.open || 0) + i * 60);

  function secArrivals() {
    const a = S.spec.arrivals; const s = sec('arr', 'Llegadas de clientes', true, { poisson: 'M', renewal: 'GI', profile: 'M(t)', appointments: 'citas', finite: 'N' }[a.mode]);
    s.body.appendChild(UI.select({ label: 'Proceso de llegada', options: MODES, value: a.mode, help: 'Cómo llegan los clientes. Poisson es el supuesto clásico; el perfil por hora reproduce picos (almuerzo, quincena); las citas modelan agendas; la población finita aplica cuando hay pocos clientes posibles (máquinas, pacientes internados).',
      onChange: (v) => { a.mode = v; changed(true); } }).el);
    switch (a.mode) {
      case 'poisson':
        s.body.appendChild(UI.num({ label: 'Tasa de llegada λ', unit: 'clientes/h', value: a.rate, min: 0, help: 'Promedio de clientes que llegan por hora. El tiempo entre llegadas es exponencial con media 60/λ minutos.', onInput: (v) => { a.rate = v; changed(); } }).el);
        break;
      case 'renewal': {
        const info = h('div', { class: 'hint' });
        const upd = () => { const d = Dist.make(a.ia); info.textContent = d.ok ? `Equivale a λ = ${U.fmt(60 / d.mean, 2)} clientes/h · Ca² = ${U.fmt(d.scv, 2)}` : ''; };
        s.body.appendChild(UI.dist({ label: 'Tiempo entre llegadas', spec: a.ia, allowEmp: true, empData: () => QS.Data && QS.Data.sample('ia'), help: 'Distribución del tiempo entre dos llegadas consecutivas, en minutos.', onChange: (d) => { a.ia = d; upd(); changed(); } }).el);
        s.body.appendChild(info); upd(); break;
      }
      case 'profile': {
        const byK = Array.isArray(a.byClass) && a.byClass.length === S.spec.classes.length;
        if (byK) s.body.appendChild(UI.note(['Cada tipo de cliente llega con su propio patrón por hora (medido en tus datos). La tabla muestra el total; si la editas, todos los tipos usarán el mismo patrón con su participación. ',
          h('button', { type: 'button', class: 'link', onclick: () => { delete a.byClass; changed(true); } }, 'Usar un solo patrón')], 'info'));
        else s.body.appendChild(h('p', { class: 'hint' }, 'Clientes por hora para cada hora de la jornada (λ por hora). Puedes pegar una columna desde Excel o enviar un perfil desde Herramientas → "Análisis de series".'));
        s.body.appendChild(UI.hourly({ values: a.profile, count: hoursCount, labelFn: hourLabel, onChange: (v) => { a.profile = v; delete a.byClass; changed(); } }).el);
        break;
      }
      case 'appointments': {
        const ap = a.appt;
        s.body.appendChild(UI.grid(2,
          UI.num({ label: 'Intervalo entre citas', unit: 'min', value: ap.interval, min: 0.5, onInput: (v) => { ap.interval = v; changed(); } }).el,
          UI.num({ label: 'Inasistencia', unit: '%', value: +(ap.noShow * 100).toFixed(2), min: 0, max: 100, help: 'Porcentaje de citas a las que el cliente no se presenta (no-show).', onInput: (v) => { ap.noShow = (v || 0) / 100; changed(); } }).el,
          UI.num({ label: 'Retraso medio', unit: 'min', value: ap.meanLate, help: 'Positivo si los clientes suelen llegar tarde; negativo si llegan antes de su hora.', onInput: (v) => { ap.meanLate = v || 0; changed(); } }).el,
          UI.num({ label: 'Desviación de puntualidad', unit: 'min', value: ap.sdLate, min: 0, onInput: (v) => { ap.sdLate = v || 0; changed(); } }).el,
          UI.num({ label: 'Clientes sin cita', unit: 'por hora', value: ap.walkin, min: 0, wide: true, help: 'Llegadas espontáneas (Poisson) además de las citas.', onInput: (v) => { ap.walkin = v || 0; changed(); } }).el));
        break;
      }
      case 'finite': {
        const f = a.finite;
        s.body.appendChild(UI.num({ label: 'Tamaño de la población N', unit: 'clientes', value: f.N, min: 1, step: 1, help: 'Número total de clientes posibles (máquinas, unidades, pacientes). Cuantos más están en el sistema, menos llegadas nuevas.', onInput: (v) => { f.N = Math.max(1, Math.round(v || 1)); changed(true); } }).el);
        s.body.appendChild(UI.dist({ label: 'Tiempo fuera del sistema (entre solicitudes)', spec: f.think, help: 'Tiempo que cada cliente pasa fuera antes de volver a requerir servicio (p. ej. tiempo entre fallas de una máquina).', onChange: (d) => { f.think = d; changed(); } }).el);
        break;
      }
      default: break;
    }
    const b = a.batch;
    s.body.appendChild(UI.select({ label: 'Llegadas en grupo', options: BATCH, value: b.type, help: 'Familias, grupos de turistas o lotes de pedidos que llegan juntos; cada integrante se atiende por separado.', onChange: (v) => { b.type = v; changed(true); } }).el);
    if (['fixed', 'geom', 'poisson'].includes(b.type)) s.body.appendChild(UI.num({ label: 'Tamaño medio del grupo', value: b.mean, min: 1, onInput: (v) => { b.mean = Math.max(1, v || 1); changed(); } }).el);
    if (b.type === 'unif') s.body.appendChild(UI.grid(2, UI.num({ label: 'Mínimo', value: b.min, min: 1, step: 1, onInput: (v) => { b.min = v; changed(); } }).el, UI.num({ label: 'Máximo', value: b.max, min: 1, step: 1, onInput: (v) => { b.max = v; changed(); } }).el));
    if (a.mode !== 'finite') s.body.appendChild(UI.num({ label: 'Personas esperando al abrir', value: a.initialQueue, min: 0, step: 1, help: 'Clientes que ya están formados cuando abre el establecimiento.', onInput: (v) => { a.initialQueue = Math.max(0, Math.round(v || 0)); changed(); } }).el);
    return s.el;
  }

  function secClasses() {
    const cls = S.spec.classes; const s = sec('cls', 'Tipos de clientes y prioridades', false, cls.length + (cls.length === 1 ? ' clase' : ' clases'));
    const pal = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#4a3aa7', '#e34948'];
    s.body.appendChild(h('p', { class: 'hint' }, 'La prioridad 1 es la más alta. Solo se aplica si la disciplina de la etapa es "Prioridad". El factor de servicio multiplica el tiempo de atención (1,3 = 30 % más lento); el factor de paciencia multiplica el tiempo que tolera esperar.'));
    cls.forEach((c, i) => {
      const row = h('div', { class: 'dist' },
        h('div', { class: 'row' }, h('i', { class: 'dot', style: { background: pal[i % 8] } }), h('b', null, `Clase ${i + 1}`),
          cls.length > 1 ? UI.btn('Quitar', () => { cls.splice(i, 1); changed(true); }, 'btn-ghost btn-sm') : null),
        UI.grid(2,
          UI.text({ label: 'Nombre', value: c.name, onInput: (v) => { c.name = v; save(); renderLegend(); } }).el,
          UI.num({ label: 'Participación', unit: '%', value: c.share, min: 0, onInput: (v) => { c.share = v || 0; changed(); } }).el,
          UI.num({ label: 'Prioridad', value: c.prio, min: 1, step: 1, onInput: (v) => { c.prio = Math.max(1, Math.round(v || 1)); changed(); } }).el,
          UI.num({ label: 'Factor de servicio', value: c.svcMult, min: 0.05, step: 0.05, onInput: (v) => { c.svcMult = v > 0 ? v : 1; changed(); } }).el,
          UI.num({ label: 'Factor de paciencia', value: c.patMult, min: 0.05, step: 0.05, wide: true, onInput: (v) => { c.patMult = v > 0 ? v : 1; changed(); } }).el));
      if (S.spec.stages.length > 1) row.appendChild(routeEditor(c));
      s.body.appendChild(row);
    });
    if (cls.length < 8) s.body.appendChild(UI.btn('Agregar tipo de cliente', () => { cls.push({ name: 'Clase ' + (cls.length + 1), share: 10, prio: cls.length + 1, svcMult: 1, patMult: 1 }); changed(true); }, 'btn-sm'));
    return s.el;
  }

  // Ruta propia de un tipo de cliente en un proceso de varias etapas: qué etapas visita y su factor de atención en cada una
  function routeEditor(c) {
    const st = S.spec.stages, n = st.length;
    const on = Array.isArray(c.visits) && c.visits.slice(0, n).some(Boolean);
    const vis = on ? U.range(n, (i) => !!c.visits[i]) : new Array(n).fill(true);
    const sm = U.range(n, (i) => (Array.isArray(c.svcMults) && +c.svcMults[i] > 0 ? +c.svcMults[i] : (+c.svcMult || 1)));
    const box = h('div', { class: 'route' });
    const write = () => { if (vis.every(Boolean) && sm.every((x) => x === sm[0])) { delete c.visits; delete c.svcMults; c.svcMult = sm[0]; } else { c.visits = vis.slice(); c.svcMults = sm.slice(); } changed(); };
    box.appendChild(h('span', { class: 'lbl' }, 'Etapas que visita y factor de atención en cada una', UI.help('Por ejemplo, en una tienda con crédito el "pago de cuota" va directo a facturación sin pasar por cajas. El factor multiplica el tiempo de atención de esa etapa para este tipo de cliente.')));
    st.forEach((x, i) => {
      const chk = UI.check({ label: x.name || `Etapa ${i + 1}`, checked: vis[i], onChange: (v) => { vis[i] = v; if (!vis.some(Boolean)) { vis[i] = true; chk.set(true); U.toast('Cada tipo de cliente debe visitar al menos una etapa.', 'warn'); return; } f.input.disabled = !v; write(); } });
      const f = UI.num({ label: 'Factor', value: sm[i], min: 0.05, step: 0.05, onInput: (v) => { sm[i] = v > 0 ? v : 1; write(); } });
      f.input.disabled = !vis[i];
      box.appendChild(h('div', { class: 'route-row' }, chk.el, f.el));
    });
    return box;
  }

  function secStages() {
    const sp = S.spec; const s = sec('stg', 'Etapas, servidores y disciplina', true, sp.stages.map((x) => x.useSchedule ? 'c(t)' : x.servers).join(' → '));
    s.body.appendChild(UI.select({ label: 'Número de etapas en serie', value: sp.stages.length, options: [[1, '1 etapa (una fase)'], [2, '2 etapas (multifase)'], [3, '3 etapas (multifase)']],
      help: 'Las cuatro configuraciones clásicas: un canal/una fase, varios canales/una fase, un canal/varias fases y varios canales/varias fases.',
      onChange: (v) => {
        const n = +v; while (sp.stages.length < n) sp.stages.push(Sim.normalize({ stages: [{ name: 'Etapa ' + (sp.stages.length + 1), servers: 2, svc: { type: 'exp', mean: 2 } }] }).stages[0]);
        sp.stages.length = n; changed(true);
      } }).el);
    sp.stages.forEach((stg, i) => {
      const box = h('div', { class: 'dist' }, h('b', null, sp.stages.length > 1 ? `Etapa ${i + 1}` : 'Servidores'));
      box.appendChild(UI.grid(2,
        UI.text({ label: 'Nombre', value: stg.name, onInput: (v) => { stg.name = v; changed(); } }).el,
        UI.num({ label: stg.useSchedule ? 'Servidores (máximo)' : 'Servidores c', value: stg.servers, min: 1, step: 1, help: 'Número de cajeros, agentes, ventanillas o máquinas que atienden en paralelo.', onInput: (v) => { stg.servers = Math.max(1, Math.round(v || 1)); changed(); } }).el));
      box.appendChild(UI.dist({ label: 'Tiempo de servicio', spec: stg.svc, allowEmp: true, empData: () => QS.Data && QS.Data.sample('svc'), help: 'Duración de la atención de un cliente, en minutos.', onChange: (d) => { stg.svc = d; changed(); } }).el);
      const qmode = UI.seg({ label: 'Tipo de fila', options: [['single', 'Fila única'], ['multi', 'Una fila por servidor']], value: stg.queue, onChange: (v) => { stg.queue = v; changed(true); } });
      box.appendChild(h('div', { class: 'field' }, h('span', { class: 'lbl' }, 'Tipo de fila', UI.help('Fila única (serpentina, como en bancos) o una fila por servidor (como en supermercados).')), qmode.el));
      if (stg.queue === 'multi') {
        box.appendChild(UI.select({ label: 'Cómo elige fila el cliente', value: stg.select, options: [['shortest', 'La más corta'], ['random', 'Al azar'], ['rr', 'Por turnos (asignación cíclica)']], onChange: (v) => { stg.select = v; changed(); } }).el);
        box.appendChild(UI.check({ label: 'Permitir cambio de fila (jockeying)', checked: stg.jockey, help: 'El último de una fila se cambia a otra si esta queda al menos 2 personas más corta.', onChange: (v) => { stg.jockey = v; changed(); } }).el);
      } else {
        box.appendChild(UI.select({ label: 'Asignación de servidor libre', value: stg.assign, options: [['idle', 'El que lleva más tiempo libre'], ['fast', 'El más rápido'], ['order', 'Por número de servidor'], ['random', 'Al azar']], onChange: (v) => { stg.assign = v; changed(); } }).el);
      }
      box.appendChild(UI.select({ label: 'Disciplina de la fila', value: stg.disc, options: DISC, help: 'Orden en que se atiende a quienes esperan. Las prioridades usan la clase de cliente.', onChange: (v) => { stg.disc = v; changed(); } }).el);
      box.appendChild(UI.text({ label: 'Velocidad relativa de cada servidor (opcional)', value: stg.speeds, placeholder: 'ej. 1, 1, 0.8, 1.2', help: 'Servidores heterogéneos: 0,8 significa 20 % más lento (personal nuevo); 1,2 es 20 % más rápido.', onInput: (v) => { stg.speeds = v; changed(); } }).el);
      if (i > 0) box.appendChild(UI.num({ label: 'Clientes que requieren esta etapa', unit: '%', value: +(stg.prob * 100).toFixed(1), min: 0, max: 100, onInput: (v) => { stg.prob = U.clamp((v || 0) / 100, 0, 1); changed(); } }).el);
      box.appendChild(UI.check({ label: 'Servidores según horario (turnos)', checked: stg.useSchedule, help: 'Define cuántos servidores trabajan en cada hora; al reducir personal, quien está atendiendo termina antes de retirarse.', onChange: (v) => {
        stg.useSchedule = v; if (v && (!stg.schedule || !stg.schedule.length)) stg.schedule = new Array(hoursCount()).fill(stg.servers); changed(true);
      } }).el);
      if (stg.useSchedule) box.appendChild(UI.hourly({ values: stg.schedule, count: hoursCount, labelFn: hourLabel, step: 1, onChange: (v) => { stg.schedule = v.map((x) => Math.max(0, Math.round(x))); stg.servers = Math.max(1, ...stg.schedule); changed(); } }).el);
      s.body.appendChild(box);
    });
    return s.el;
  }

  function secBehavior() {
    const sp = S.spec; const s = sec('beh', 'Comportamiento: capacidad, desistir, abandonar, reintentar', false);
    s.body.appendChild(UI.num({ label: 'Capacidad máxima del sistema K', unit: '0 = ilimitada', value: sp.capacity, min: 0, step: 1, help: 'Máximo de clientes dentro (en fila + en servicio). Si está lleno, el que llega se pierde (sala, estacionamiento, líneas telefónicas).', onInput: (v) => { sp.capacity = Math.max(0, Math.round(v || 0)); changed(); } }).el);
    s.body.appendChild(UI.select({ label: 'Desistir al llegar (balking)', value: sp.balk.type, options: BALK, help: 'El cliente ve la fila y decide no entrar.', onChange: (v) => { sp.balk.type = v; changed(true); } }).el);
    if (sp.balk.type !== 'none') s.body.appendChild(UI.num({ label: 'Parámetro L', unit: 'personas', value: sp.balk.L, min: 0.1, onInput: (v) => { sp.balk.L = v > 0 ? v : 1; changed(); } }).el);
    s.body.appendChild(UI.check({ label: 'Abandono durante la espera (reneging)', checked: sp.renege.on, help: 'Cada cliente tiene una paciencia aleatoria; si espera más que eso en la fila de la primera etapa, se va.', onChange: (v) => { sp.renege.on = v; changed(true); } }).el);
    if (sp.renege.on) s.body.appendChild(UI.dist({ label: 'Paciencia (tiempo máximo que tolera esperar)', spec: sp.renege.dist, onChange: (d) => { sp.renege.dist = d; changed(); } }).el);
    s.body.appendChild(UI.grid(2,
      UI.num({ label: 'Reintentan', unit: '%', value: +(sp.retry.p * 100).toFixed(1), min: 0, max: 100, help: 'Porcentaje de clientes perdidos (por desistir, abandonar o encontrar el sistema lleno) que vuelven a intentarlo más tarde.', onInput: (v) => { sp.retry.p = U.clamp((v || 0) / 100, 0, 1); changed(); } }).el,
      UI.num({ label: 'Tiempo medio para reintentar', unit: 'min', value: sp.retry.mean, min: 0.1, onInput: (v) => { sp.retry.mean = v > 0 ? v : 1; changed(); } }).el));
    return s.el;
  }
  function secFailures() {
    const f = S.spec.fail; const s = sec('fail', 'Interrupciones del servicio', false, f.on ? 'activas' : '');
    s.body.appendChild(UI.check({ label: 'Los servidores pueden fallar', checked: f.on, help: 'Caídas del sistema, averías o pausas no programadas. Durante la falla el cliente en atención espera y su servicio se reanuda después.', onChange: (v) => { f.on = v; changed(true); } }).el);
    if (f.on) s.body.appendChild(UI.grid(2,
      UI.num({ label: 'Tiempo medio entre fallas', unit: 'min', value: f.mtbf, min: 1, onInput: (v) => { f.mtbf = v; changed(); } }).el,
      UI.num({ label: 'Tiempo medio de reparación', unit: 'min', value: f.mttr, min: 0.1, onInput: (v) => { f.mttr = v; changed(); } }).el));
    return s.el;
  }
  function secRun() {
    const r = S.spec.run, sp = S.spec; const s = sec('run', 'Jornada, meta y réplicas', false);
    const openId = U.uid('open');
    const openIn = h('input', { id: openId, type: 'time', value: `${U.pad2(Math.floor((+sp.open || 0) / 60) % 24)}:${U.pad2((+sp.open || 0) % 60)}` });
    openIn.addEventListener('change', () => { const [hh, mm] = openIn.value.split(':').map(Number); sp.open = (hh || 0) * 60 + (mm || 0); changed(true); });
    s.body.appendChild(UI.grid(2,
      h('label', { class: 'field', for: openId }, h('span', { class: 'lbl' }, 'Hora de apertura'), h('span', { class: 'ctl' }, openIn)),
      UI.num({ label: 'Horas de atención', unit: 'h', value: r.hours, min: 0.25, help: 'Duración del periodo en que llegan clientes. Para comparar con la teoría usa horizontes largos (cientos de horas).', onChange: (v) => { r.hours = Math.max(0.25, v || 1); changed(true); } }).el,
      UI.num({ label: 'Calentamiento', unit: 'h', value: r.warmupH, min: 0, help: 'Horas iniciales que se descartan de las estadísticas para eliminar el sesgo de arrancar con el sistema vacío.', onInput: (v) => { r.warmupH = Math.max(0, v || 0); changed(); } }).el,
      UI.num({ label: 'Meta de espera T', unit: 'min', value: r.slT, min: 0, help: 'El nivel de servicio es el % de clientes atendidos con espera ≤ T (los abandonos cuentan como incumplimiento). En call centers se usa 20 s = 0,333 min.', onInput: (v) => { r.slT = Math.max(0, v || 0); changed(); renderLegend(); } }).el,
      UI.num({ label: 'Réplicas', value: r.reps, min: 1, max: 500, step: 1, help: 'Número de jornadas independientes para calcular intervalos de confianza. 20–30 suele bastar.', onInput: (v) => { r.reps = Math.max(1, Math.round(v || 1)); save(); } }).el,
      UI.num({ label: 'Semilla aleatoria', value: r.seed, step: 1, help: 'Con la misma semilla se obtienen exactamente los mismos resultados (reproducibilidad).', onInput: (v) => { r.seed = Math.round(v || 0); changed(); } }).el));
    s.body.appendChild(UI.check({ label: 'Al cerrar, atender a quienes siguen dentro', checked: r.drain, help: 'Si se desactiva, la simulación se corta exactamente al cierre (útil para estado estable).', onChange: (v) => { r.drain = v; changed(); } }).el);
    return s.el;
  }
  function secCosts() {
    const c = S.spec.cost; const s = sec('cost', 'Costos', false);
    s.body.appendChild(UI.grid(2,
      UI.num({ label: 'Costo por servidor', unit: '/hora', value: c.server, min: 0, help: 'Salario más cargas y costos del puesto, por hora trabajada.', onInput: (v) => { c.server = v || 0; save(); } }).el,
      UI.num({ label: 'Costo de espera', unit: '/cliente-hora', value: c.wait, min: 0, help: 'Valor del tiempo del cliente o costo de su insatisfacción por cada hora en fila.', onInput: (v) => { c.wait = v || 0; save(); } }).el,
      UI.num({ label: 'Costo de cliente perdido', unit: '/cliente', value: c.lost, min: 0, help: 'Margen perdido por cada cliente que abandona, desiste o no puede entrar.', onInput: (v) => { c.lost = v || 0; save(); } }).el,
      UI.text({ label: 'Moneda', value: c.cur, onInput: (v) => { c.cur = v || '$'; save(); } }).el));
    return s.el;
  }

  /* ===================== resumen en lenguaje claro ===================== */
  function plainSummary(agg, spec) {
    const m = agg.m, T = spec.run.slT, t = Object.assign({ server: 'servidor', servers: 'Servidores', customer: 'cliente' }, spec.terms || {});
    const sv = t.servers.toLowerCase(); const wq = spec.renege.on ? m.WqAll : m.Wq;
    const parts = [`En ${agg.reps} jornadas simuladas, ${U.fmtPct(m.SL.mean, 0)} de los ${t.customer}s esperó menos de ${U.fmtTime(T)}. La espera promedio fue de ${U.fmtTime(wq.mean)} y el 10 % que más esperó pasó más de ${U.fmtTime(m.wqP90.mean)} en la fila.`];
    const u = m.util.mean;
    if (u > 0.9) parts.push(`Los ${sv} estuvieron ocupados ${U.fmtPct(u, 0)} del tiempo: la operación está al límite y cualquier aumento de demanda dispara la fila.`);
    else if (u < 0.55) parts.push(`Los ${sv} estuvieron ocupados solo ${U.fmtPct(u, 0)} del tiempo: hay capacidad de sobra en varias horas.`);
    else parts.push(`Los ${sv} estuvieron ocupados ${U.fmtPct(u, 0)} del tiempo.`);
    if (m.Pab.mean > 0.01) parts.push(`${U.fmtPct(m.Pab.mean, 1)} de los ${t.customer}s se fue sin ser atendido.`);
    if (m.Pbalk.mean + m.Pblock.mean > 0.01) parts.push(`${U.fmtPct(m.Pbalk.mean + m.Pblock.mean, 1)} ni siquiera entró a la fila.`);
    if (m.overtime.mean > 5) parts.push(`Al cierre quedaron ${t.customer}s dentro: se atendió ${U.fmtTime(m.overtime.mean)} después de la hora de cierre.`);
    if (agg.perClass.length === 2 && spec.stages[0].dedicated && spec.stages[0].dedicated.n > 0) {
      const a = agg.perClass[0], b = agg.perClass[1]; parts.push(`${b.name}: espera promedio ${U.fmtTime(b.Wq.mean)}; ${a.name.toLowerCase()}: ${U.fmtTime(a.Wq.mean)}.`);
    }
    const st = m.SL.mean >= 0.8 ? 'good' : m.SL.mean >= 0.6 ? 'warn' : 'bad';
    return h('div', { class: 'note note-' + st + ' summary' }, h('b', null, 'En resumen: '), parts.join(' '));
  }

  /* ===================== modo simple ===================== */
  function simpleIssues(sp) {
    const a = sp.arrivals, st = sp.stages, r = [];
    if (st.length > 1) r.push('tiene varias etapas');
    if (!['poisson', 'profile'].includes(a.mode)) r.push({ renewal: 'usa llegadas con distribución general', appointments: 'usa citas', finite: 'usa población finita' }[a.mode] || 'usa otro tipo de llegadas');
    if (a.batch && a.batch.type !== 'none') r.push('tiene llegadas en grupo');
    if (sp.fail.on) r.push('tiene fallas de servidores');
    if (sp.retry.p > 0) r.push('tiene reintentos');
    if (sp.balk.type !== 'none') r.push('tiene clientes que desisten al llegar');
    if (+sp.capacity > 0) r.push('tiene capacidad limitada');
    const ded = st[0].dedicated && +st[0].dedicated.n > 0;
    if (sp.classes.length > (ded ? 2 : 1)) r.push('tiene varios tipos de cliente');
    if (st[0].disc !== 'FIFO' && !ded) r.push('usa prioridades u otra disciplina');
    return r;
  }
  function renderSimple() {
    const sp = S.spec, st = sp.stages[0], t = terms(), sv = t.servers.toLowerCase();
    const issues = simpleIssues(sp);
    if (issues.length) {
      E.side.appendChild(h('div', { class: 'side-head' }, UI.note(`Este escenario ${issues.join(', ')}. Esas opciones solo se editan en modo experto.`, 'info'),
        UI.btn('Editar en modo experto', () => { S.mode = 'expert'; U.store.set('sim:mode', 'expert'); renderConfig(); }, 'btn-primary btn-sm')));
      return;
    }
    const s1 = sec('s_op', 'Tu operación', true);
    s1.body.appendChild(UI.text({ label: 'Cómo se llaman los puntos de atención', value: t.servers, placeholder: 'Cajas, ventanillas, agentes…', onInput: (v) => { sp.terms = Object.assign({}, t, { servers: v || 'Servidores', server: (v || 'servidor').replace(/s$/i, '').toLowerCase() }); st.name = v || 'Servidores'; changed(); } }).el);
    const arrSeg = UI.seg({ label: 'Llegadas', value: sp.arrivals.mode === 'profile' ? 'hora' : 'fija', options: [['fija', 'Igual todo el día'], ['hora', 'Cambia por hora']],
      onChange: (v) => { if (v === 'hora') { sp.arrivals.mode = 'profile'; if (!sp.arrivals.profile || !sp.arrivals.profile.length) sp.arrivals.profile = new Array(hoursCount()).fill(+sp.arrivals.rate || 30); } else { sp.arrivals.mode = 'poisson'; sp.arrivals.rate = +U.mean(sp.arrivals.profile && sp.arrivals.profile.length ? sp.arrivals.profile : [sp.arrivals.rate || 30]).toFixed(2); } changed(true); } });
    s1.body.appendChild(h('div', { class: 'field' }, h('span', { class: 'lbl' }, `¿Cuántos ${t.customer}s llegan por hora?`, UI.help('Promedio de llegadas por hora. Si cambia mucho durante el día (comida, salida del trabajo), elige "Cambia por hora".')), arrSeg.el));
    if (sp.arrivals.mode === 'profile') s1.body.appendChild(UI.hourly({ values: sp.arrivals.profile, count: hoursCount, labelFn: hourLabel, onChange: (v) => { sp.arrivals.profile = v; changed(); } }).el);
    else s1.body.appendChild(UI.num({ label: `${t.customer[0].toUpperCase() + t.customer.slice(1)}s por hora`, value: sp.arrivals.rate, min: 0, unit: 'por hora', onInput: (v) => { sp.arrivals.rate = v; changed(); } }).el);
    const srvSeg = UI.seg({ label: t.servers, value: st.useSchedule ? 'hora' : 'fijo', options: [['fijo', 'Igual todo el día'], ['hora', 'Cambia por hora']],
      onChange: (v) => { st.useSchedule = v === 'hora'; if (st.useSchedule && (!st.schedule || !st.schedule.length)) st.schedule = new Array(hoursCount()).fill(st.servers); changed(true); } });
    s1.body.appendChild(h('div', { class: 'field' }, h('span', { class: 'lbl' }, `¿Cuántos ${sv} atienden?`), srvSeg.el));
    if (st.useSchedule) s1.body.appendChild(UI.hourly({ values: st.schedule, count: hoursCount, labelFn: hourLabel, step: 1, onChange: (v) => { st.schedule = v.map((x) => Math.max(0, Math.round(x))); st.servers = Math.max(1, ...st.schedule); changed(); } }).el);
    else s1.body.appendChild(UI.num({ label: `Número de ${sv}`, value: st.servers, min: 1, step: 1, onInput: (v) => { st.servers = Math.max(1, Math.round(v || 1)); changed(); } }).el);
    const d = Dist.make(st.svc); const lvl = d.cv <= 0.45 ? 'baja' : d.cv <= 0.85 ? 'media' : 'alta';
    let level = lvl;
    const setSvc = (mean, lv) => { st.svc = lv === 'alta' ? { type: 'exp', mean } : { type: 'gamma', mean, sd: +(mean * (lv === 'baja' ? 0.35 : 0.7)).toFixed(4) }; };
    s1.body.appendChild(UI.num({ label: 'Tiempo promedio de atención', value: +d.mean.toFixed(3), min: 0.05, unit: 'min', onInput: (v) => { if (v > 0) { setSvc(v, level); changed(); } } }).el);
    const varSeg = UI.seg({ label: 'Variabilidad', value: lvl, options: [['baja', 'Casi siempre igual'], ['media', 'Normal'], ['alta', 'Muy variable']], onChange: (v) => { level = v; setSvc(Dist.make(st.svc).mean, v); changed(); } });
    s1.body.appendChild(h('div', { class: 'field' }, h('span', { class: 'lbl' }, '¿Qué tan parecidos son los tiempos de atención?', UI.help('"Muy variable" es lo típico cuando hay atenciones rápidas y otras muy largas (devoluciones, aclaraciones).')), varSeg.el));
    const qSeg = UI.seg({ label: 'Tipo de fila', value: st.queue, options: [['multi', `Una fila por ${t.server}`], ['single', 'Fila única']], onChange: (v) => { st.queue = v; st.jockey = v === 'multi'; changed(true); } });
    s1.body.appendChild(h('div', { class: 'field' }, h('span', { class: 'lbl' }, 'Tipo de fila', UI.help('Fila única (serpentina con turnero) es más justa y eficiente; una fila por punto es típica de supermercados.')), qSeg.el));
    E.side.appendChild(s1.el);
    const s2 = sec('s_opt', 'Opciones frecuentes', true);
    const ded = st.dedicated || (st.dedicated = { n: 0, cls: 1, strict: false });
    const exOn = +ded.n > 0;
    s2.body.appendChild(UI.check({ label: `${t.servers} exclusivas (rápidas, autocobro o preferentes)`, checked: exOn, help: 'Reserva algunos puntos de atención para un tipo de cliente: compras chicas, autocobro, empresas o adultos mayores.',
      onChange: (v) => {
        if (v) { ded.n = Math.max(1, Math.round(st.servers / 4)); ded.cls = 1; sp.classes = [{ name: 'Clientes regulares', share: 70, prio: 2, svcMult: 1, patMult: 1 }, { name: 'Compra chica', share: 30, prio: 1, svcMult: 0.4, patMult: 1 }]; st.useSchedule = false; }
        else { ded.n = 0; sp.classes = [{ name: 'General', share: 100, prio: 1, svcMult: 1, patMult: 1 }]; }
        changed(true);
      } }).el);
    if (exOn) {
      const k = sp.classes[1];
      s2.body.appendChild(UI.grid(2,
        UI.num({ label: `${t.servers} exclusivas`, value: ded.n, min: 1, step: 1, onInput: (v) => { ded.n = Math.max(1, Math.round(v || 1)); changed(); } }).el,
        UI.text({ label: 'Para clientes de tipo', value: k.name, onInput: (v) => { k.name = v || 'Exclusivo'; changed(); } }).el,
        UI.num({ label: 'Son el', unit: '% de los clientes', value: k.share, min: 1, max: 99, onInput: (v) => { k.share = U.clamp(v || 1, 1, 99); sp.classes[0].share = 100 - k.share; changed(); } }).el,
        UI.num({ label: 'Su atención dura', unit: '% de lo normal', value: Math.round(k.svcMult * 100), min: 5, onInput: (v) => { k.svcMult = Math.max(0.05, (v || 100) / 100); changed(); } }).el));
      s2.body.appendChild(UI.check({ label: `Solo pueden usar las ${sv} exclusivas (como el autocobro)`, checked: !!ded.strict, onChange: (v) => { ded.strict = v; changed(); } }).el);
    }
    s2.body.appendChild(UI.check({ label: 'Los clientes se van si esperan demasiado', checked: sp.renege.on, onChange: (v) => { sp.renege.on = v; changed(true); } }).el);
    if (sp.renege.on) s2.body.appendChild(UI.num({ label: 'Tiempo promedio que aguantan esperando', value: QS.Dist.make(sp.renege.dist).mean, min: 0.1, unit: 'min', onInput: (v) => { if (v > 0) { sp.renege.dist = { type: 'exp', mean: v }; changed(); } } }).el);
    s2.body.appendChild(UI.num({ label: 'Meta: esperar menos de', value: sp.run.slT, min: 0, unit: 'min', onInput: (v) => { sp.run.slT = Math.max(0, v || 0); changed(); renderLegend(); } }).el);
    const openId = U.uid('open');
    const openIn = h('input', { id: openId, type: 'time', value: `${U.pad2(Math.floor((+sp.open || 0) / 60) % 24)}:${U.pad2((+sp.open || 0) % 60)}` });
    openIn.addEventListener('change', () => { const ab = openIn.value.split(':').map(Number); sp.open = (ab[0] || 0) * 60 + (ab[1] || 0); changed(true); });
    s2.body.appendChild(UI.grid(2, h('label', { class: 'field', for: openId }, h('span', { class: 'lbl' }, 'Abre a las'), h('span', { class: 'ctl' }, openIn)),
      UI.num({ label: 'Horas de atención', value: sp.run.hours, min: 0.5, max: 24, unit: 'h', onChange: (v) => { sp.run.hours = U.clamp(v || 1, 0.5, 24); changed(true); } }).el));
    E.side.appendChild(s2.el);
  }

  /* ===================== teoría equivalente ===================== */
  function mixMoments(sp, stg) {
    const d = Dist.make(stg.svc); const tot = sp.classes.reduce((a, c) => a + (+c.share || 0), 0) || 1;
    let f1 = 0, f2 = 0, f3 = 0;
    sp.classes.forEach((c) => { const p = (+c.share || 0) / tot, f = +c.svcMult > 0 ? +c.svcMult : 1; f1 += p * f; f2 += p * f * f; f3 += p * f * f * f; });
    const m1 = d.m1 * f1 / 60, m2 = d.m2 * f2 / 3600, m3 = d.m3 * f3 / 216000;
    return { m1, m2, m3, scv: m2 / (m1 * m1) - 1, exp: d.type === 'exp' && Math.abs(f1 - 1) < 1e-9 && Math.abs(f2 - 1) < 1e-9, kendall: d.kendall };
  }
  SU.theoryFor = function (spIn) {
    const sp = Sim.normalize(spIn), a = sp.arrivals, st = sp.stages;
    const no = (why) => ({ none: why });
    if (a.mode === 'profile') return no('Con llegadas que cambian hora a hora el sistema no alcanza un estado estable; no hay una fórmula única. Usa el dimensionamiento por intervalo o las réplicas.');
    if (a.mode === 'appointments') return no('Las agendas de citas no tienen fórmula cerrada general; la simulación es la herramienta adecuada.');
    if (st.some((x) => x.useSchedule)) return no('Con personal variable por hora no existe un modelo estacionario único.');
    if (sp.fail.on) return no('Las fallas de servidores no están incluidas en los modelos analíticos clásicos de esta herramienta.');
    if (sp.retry.p > 0) return no('Los reintentos (colas con órbita) no tienen fórmula cerrada simple.');
    if (+a.initialQueue > 0) return no('Arrancar con fila inicial es un efecto transitorio; la teoría describe el estado estable.');
    if (st.some((x) => (x.speeds || '').trim())) return no('Los servidores con distinta velocidad no se representan en los modelos clásicos.');
    if (st.length > 1 && sp.classes.some((c) => Array.isArray(c.visits) && c.visits.slice(0, st.length).some(Boolean) && !c.visits.slice(0, st.length).every(Boolean))) return no('Cada tipo de cliente sigue su propia ruta por las etapas: es una red de colas con varias clases y rutas. No tiene fórmula cerrada simple; la simulación es la herramienta adecuada.');
    if (st.some((x) => x.dedicated && +x.dedicated.n > 0)) return no('Los servidores exclusivos (cajas rápidas, autocobro, ventanilla preferente) no tienen fórmula cerrada: la simulación es la herramienta adecuada.');
    const batch = a.batch && a.batch.type !== 'none';
    const s0 = st[0], S0 = mixMoments(sp, s0), lamP = +a.rate;
    if (st.length > 1) {
      if (a.mode !== 'poisson' || batch || sp.capacity > 0 || sp.balk.type !== 'none' || sp.renege.on || st.some((x) => x.queue === 'multi' || x.prob < 1 || !['FIFO', 'LIFO', 'SIRO'].includes(x.disc))) return no('La red en serie solo tiene fórmula con llegadas Poisson, fila única, sin capacidad, sin abandono y con todas las etapas obligatorias.');
      return { id: 'tandem', P: { lam: lamP, ca2: 1, stations: st.map((x) => ({ name: x.name, c: x.servers, S: mixMoments(sp, x) })) }, keys: ['W', 'Lq'] };
    }
    if (s0.queue === 'multi') {
      if (s0.select === 'random' && !s0.jockey && a.mode === 'poisson' && !batch && !sp.capacity && sp.balk.type === 'none' && !sp.renege.on)
        return { id: 'mg1', P: { lam: lamP / s0.servers, S: S0, kendallS: S0.kendall }, keys: ['Wq', 'W', 'util'], note: 'Con elección al azar, cada fila es un M/G/1 independiente con λ/c.' };
      return no('Con una fila por servidor y elección de la más corta no hay fórmula cerrada. Compara con "Fila única" para medir el beneficio de unificar la fila.');
    }
    const multiClass = new Set(sp.classes.map((c) => c.prio)).size > 1 && (s0.disc === 'PRIO' || s0.disc === 'PRIOP');
    if (s0.disc === 'SPT') return no('La disciplina SPT cambia la espera media y no tiene fórmula cerrada para c servidores.');
    if (a.mode === 'finite') {
      const th = Dist.make(a.finite.think);
      if (th.type !== 'exp' || !S0.exp || sp.balk.type !== 'none' || sp.renege.on || batch) return no('La fuente finita exacta requiere tiempos exponenciales sin rechazo ni abandono.');
      return { id: 'mmckn', P: { lam: 60 / th.mean, mu: 1 / S0.m1, c: s0.servers, N: a.finite.N, K: sp.capacity > 0 ? sp.capacity : '' }, keys: ['L', 'Lq', 'Wq', 'W', 'util', 'Pwait'] };
    }
    if (multiClass) {
      if (a.mode !== 'poisson' || batch || sp.capacity > 0 || sp.balk.type !== 'none' || sp.renege.on) return no('Las fórmulas de prioridad requieren llegadas Poisson sin capacidad, rechazo ni abandono.');
      const tot = sp.classes.reduce((x, c) => x + (+c.share || 0), 0) || 1; const d = Dist.make(s0.svc);
      const classes = sp.classes.map((c) => { const f = +c.svcMult > 0 ? +c.svcMult : 1; return { name: c.name, prio: c.prio, lam: lamP * (+c.share || 0) / tot, S: { m1: d.m1 * f / 60, m2: d.m2 * f * f / 3600, m3: d.m3 * f ** 3 / 216000, scv: d.scv } }; });
      return { id: 'prio', P: { c: s0.servers, preemptive: s0.disc === 'PRIOP', classes }, keys: ['Wq', 'W', 'Lq'], perClass: true, approx: s0.servers > 1 && (d.type !== 'exp' || sp.classes.some((c) => +c.svcMult !== 1)) };
    }
    if (a.mode === 'renewal') {
      if (batch || sp.capacity > 0 || sp.balk.type !== 'none' || sp.renege.on) return no('Con llegadas generales solo hay aproximaciones sin capacidad, rechazo ni abandono.');
      const Ad = Dist.make(a.ia); const Am = Dist.moments(Ad, 1 / 60);
      return s0.servers === 1 ? { id: 'gg1', P: { A: Am, S: S0, kendallA: Ad.kendall, kendallS: S0.kendall }, keys: ['Wq', 'W', 'Lq', 'util'] }
        : { id: 'ggc', P: { A: Am, S: S0, c: s0.servers, kendallA: Ad.kendall, kendallS: S0.kendall }, keys: ['Wq', 'W', 'Lq', 'util'] };
    }
    // Poisson
    if (batch) {
      if (s0.servers !== 1 || sp.capacity > 0 || sp.balk.type !== 'none' || sp.renege.on) return no('Las llegadas en grupo tienen fórmula para un solo servidor sin capacidad ni abandono.');
      const X = Dist.batch(a.batch);
      return { id: 'mxg1', P: { lamB: lamP, X: { m1: X.m1, m2: X.m2 }, S: S0, kendallS: S0.kendall }, keys: ['Wq', 'W', 'L', 'Lq'] };
    }
    if (sp.renege.on || sp.balk.type !== 'none') {
      const pd = sp.renege.on ? Dist.make(sp.renege.dist) : null;
      if (!S0.exp || (pd && pd.type !== 'exp') || new Set(sp.classes.map((c) => c.patMult)).size > 1) return no('El modelo de nacimiento y muerte con rechazo/abandono requiere servicio y paciencia exponenciales.');
      return { id: 'bd', P: { lam: lamP, mu: 1 / S0.m1, c: s0.servers, K: sp.capacity > 0 ? sp.capacity : '', theta: pd ? 60 / (pd.mean * sp.classes[0].patMult) : 0, balk: sp.balk }, keys: ['L', 'Lq', 'WqAll', 'util', 'Pwait', 'SL', 'Pab', 'Pbalk', 'Pblock'] };
    }
    if (sp.capacity > 0) {
      if (!S0.exp) return no('La capacidad limitada con servicio no exponencial no tiene fórmula cerrada sencilla.');
      if (sp.capacity < s0.servers) return no('La capacidad debe ser al menos el número de servidores.');
      return { id: sp.capacity === s0.servers ? 'mmcc' : 'mmck', P: { lam: lamP, mu: 1 / S0.m1, c: s0.servers, K: sp.capacity }, keys: ['L', 'Lq', 'Wq', 'W', 'util', 'Pwait', 'SL', 'Pblock'] };
    }
    if (S0.exp) return { id: s0.servers === 1 ? 'mm1' : 'mmc', P: { lam: lamP, mu: 1 / S0.m1, c: s0.servers }, keys: ['L', 'Lq', 'Wq', 'W', 'util', 'Pwait', 'SL', 'wqP90'] };
    return s0.servers === 1 ? { id: 'mg1', P: { lam: lamP, S: S0, kendallS: S0.kendall }, keys: ['L', 'Lq', 'Wq', 'W', 'util', 'Pwait', 'SL'] }
      : { id: 'mgc', P: { lam: lamP, c: s0.servers, S: S0, kendallS: S0.kendall }, keys: ['L', 'Lq', 'Wq', 'W', 'util', 'Pwait'] };
  };
  // Métrica teórica en las mismas unidades que la simulación (minutos)
  function theoryValue(r, key, slT) {
    switch (key) {
      case 'L': return r.L; case 'Lq': return r.Lq; case 'Wq': return r.Wq * 60; case 'WqAll': return r.Wq * 60; case 'W': return r.W * 60;
      case 'util': return r.util; case 'Pwait': return r.Pw; case 'SL': return r.sl ? r.sl(slT / 60) : NaN; case 'Pab': return r.Pab;
      case 'Pbalk': return r.Pbalk; case 'Pblock': return r.Pblock; case 'wqP90': return r.wqPct ? r.wqPct(0.9) * 60 : NaN; default: return NaN;
    }
  }

  /* ===================== análisis por réplicas ===================== */
  async function runAnalysis() {
    if (S.running) return;
    S.running = true; S.cancel = false; E.runBtn.disabled = true; E.cancelBtn.hidden = false;
    const spec = JSON.parse(JSON.stringify(S.spec));
    const t0 = performance.now();
    E.prog.set(0, 'Preparando…');
    try {
      const agg = await Sim.runReps(spec, { reps: spec.run.reps, cancel: () => S.cancel, onProgress: (f) => E.prog.set(f, `Réplica ${Math.round(f * spec.run.reps)} de ${spec.run.reps}`) });
      if (!agg) { E.prog.hide(); return; }
      S.agg = agg; S.aggSpec = spec;
      E.prog.set(1, `${agg.reps} réplicas en ${U.fmt((performance.now() - t0) / 1000, 1)} s`);
      renderAnalysis(agg, spec);
    } catch (e) { console.error(e); U.toast('Error en la simulación: ' + e.message, 'bad'); E.prog.hide(); }
    finally { S.running = false; E.runBtn.disabled = false; E.cancelBtn.hidden = true; }
  }
  SU.run = runAnalysis;

  const fmtCI = (s, f) => (isFinite(s.hw) ? `± ${f(s.hw)}` : '');
  function renderAnalysis(agg, spec) {
    QS.Charts.prune(); U.clear(E.analysis);
    const m = agg.m, T = spec.run.slT, cur = spec.cost.cur || '$';
    if (agg.unstable) E.analysis.appendChild(UI.note(`En al menos una réplica la fila superó el límite de seguridad: el sistema es inestable (la demanda supera la capacidad). Aumenta servidores o reduce el tiempo de servicio.`, 'bad'));
    if (agg.truncated) E.analysis.appendChild(UI.note('Algunas réplicas se cortaron porque los clientes seguían dentro mucho después del cierre.', 'warn'));
    const tile = (label, s, f, state, help) => UI.tile(label, f(s.mean), fmtCI(s, f), { state, help });
    E.analysis.appendChild(plainSummary(agg, spec));
    const slState = m.SL.mean >= 0.8 ? 'good' : m.SL.mean >= 0.6 ? 'warn' : 'bad';
    const utilState = m.util.mean > 0.9 ? 'warn' : m.util.mean < 0.5 ? 'warn' : 'good';
    E.analysis.appendChild(h('div', { class: 'kpis' },
      tile('Espera media en fila (Wq)', spec.renege.on ? m.WqAll : m.Wq, U.fmtTime, null, 'Promedio del tiempo en fila de los clientes que entraron (incluye abandonos si están activos).'),
      tile('Tiempo en el sistema (W)', m.W, U.fmtTime),
      tile(`Nivel de servicio (≤ ${U.fmtTime(T)})`, m.SL, (x) => U.fmtPct(x), slState),
      tile('P90 de la espera', m.wqP90, U.fmtTime, null, 'El 90 % de los clientes esperó menos que esto.'),
      tile('Utilización de servidores', m.util, (x) => U.fmtPct(x), utilState),
      tile('Clientes en fila (Lq)', m.Lq, (x) => U.fmt(x, 2)),
      tile('Abandonos', m.Pab, (x) => U.fmtPct(x), m.Pab.mean > 0.05 ? 'bad' : null),
      tile('Perdidos al llegar', { mean: m.Pbalk.mean + m.Pblock.mean, hw: NaN }, (x) => U.fmtPct(x), m.Pbalk.mean + m.Pblock.mean > 0.03 ? 'warn' : null),
      tile('Tiempo extra al cierre', m.overtime, U.fmtTime),
      tile('Costo total por hora', m.costHour, (x) => U.fmtMoney(x, cur))));

    // Tabla completa con IC
    const rows = [
      ['Llegadas (intentos)', m.arrivals, U.fmtInt], ['Atendidos', m.served, U.fmtInt], ['Tasa de llegada observada λ (por hora)', m.lamHat, (x) => U.fmt(x, 2)],
      ['Throughput (atendidos por hora)', m.thr, (x) => U.fmt(x, 2)], ['L: clientes en el sistema', m.L, (x) => U.fmt(x, 3)], ['Lq: clientes en fila', m.Lq, (x) => U.fmt(x, 3)],
      ['W: tiempo en el sistema', m.W, U.fmtTime], ['Wq: espera en fila (atendidos)', m.Wq, U.fmtTime], ['Wq: espera incluyendo abandonos', m.WqAll, U.fmtTime],
      ['Tiempo de servicio medio', m.svc, U.fmtTime], ['Mediana de la espera', m.wqP50, U.fmtTime], ['P90 de la espera', m.wqP90, U.fmtTime], ['P95 de la espera', m.wqP95, U.fmtTime],
      ['Espera máxima', m.wqMax, U.fmtTime], ['P(esperar)', m.Pwait, (x) => U.fmtPct(x)], [`Nivel de servicio (≤ ${U.fmtTime(T)})`, m.SL, (x) => U.fmtPct(x)],
      ['Utilización', m.util, (x) => U.fmtPct(x)], ['Servidores activos promedio', m.avgServers, (x) => U.fmt(x, 2)], ['Fila máxima', m.maxQ, (x) => U.fmt(x, 1)],
      ['Abandonos', m.aband, (x) => U.fmt(x, 1)], ['Desistimientos', m.balk, (x) => U.fmt(x, 1)], ['Bloqueos por capacidad', m.block, (x) => U.fmt(x, 1)],
      ['Reintentos', m.retries, (x) => U.fmt(x, 1)], ['Interrupciones por prioridad', m.preempt, (x) => U.fmt(x, 1)], ['Cambios de fila', m.jockeys, (x) => U.fmt(x, 1)],
      ['Tiempo extra después del cierre', m.overtime, U.fmtTime], ['Costo de servidores', m.costServers, (x) => U.fmtMoney(x, cur)], ['Costo de espera', m.costWait, (x) => U.fmtMoney(x, cur)],
      ['Costo de clientes perdidos', m.costLost, (x) => U.fmtMoney(x, cur)], ['Costo total', m.costTotal, (x) => U.fmtMoney(x, cur)]
    ].filter((r) => r[1] && isFinite(r[1].mean));
    const tbl = UI.card('Resultados con intervalo de confianza del 95 %', { sub: `${agg.reps} réplicas independientes. IC = media ± t₀.₉₇₅,ₙ₋₁·s/√n.`,
      actions: [UI.btn('Exportar CSV', () => exportCSV(agg, spec), 'btn-ghost btn-sm')] });
    tbl.body.appendChild(UI.table(['Indicador', { t: 'Media', num: true }, { t: 'IC 95 %', num: true }, { t: 'Mín.', num: true }, { t: 'Máx.', num: true }],
      rows.map(([n, s, f]) => [n, f(s.mean), isFinite(s.hw) ? '± ' + f(s.hw) : '—', f(s.min), f(s.max)]), { compact: true }));

    // Comparación con teoría
    const th = SU.theoryFor(spec);
    const thCard = UI.card('Comparación con el modelo analítico', { sub: 'La teoría describe el estado estable. Con jornadas cortas que inician vacías y cierre con tiempo extra, las diferencias son esperables.' });
    if (th.none) thCard.body.appendChild(UI.note(th.none, 'info'));
    else {
      const r = A.compute(th.id, th.P);
      if (!r.ok && !r.perClass) thCard.body.appendChild(UI.note(r.error, 'warn'));
      else {
        thCard.body.appendChild(h('p', { class: 'hint' }, `Modelo: ${A.byId[th.id].name}${r.kendall ? ' · ' + r.kendall : ''}${r.approx || th.approx ? ' (aproximación)' : ''}. ${th.note || ''}`));
        const NAMES = { L: 'L: clientes en el sistema', Lq: 'Lq: clientes en fila', Wq: 'Wq: espera en fila', WqAll: 'Wq: espera (con abandonos)', W: 'W: tiempo en el sistema', util: 'Utilización', Pwait: 'P(esperar)', SL: `Nivel de servicio (≤ ${U.fmtTime(T)})`, Pab: 'P(abandono)', Pbalk: 'P(desistir)', Pblock: 'P(bloqueo)', wqP90: 'P90 de la espera' };
        const FM = { L: (x) => U.fmt(x, 3), Lq: (x) => U.fmt(x, 3), Wq: U.fmtTime, WqAll: U.fmtTime, W: U.fmtTime, wqP90: U.fmtTime };
        const steady = !spec.run.drain && spec.run.warmupH > 0;
        let rowsT;
        if (th.perClass && r.perClass) {
          rowsT = r.perClass.map((k) => {
            const i = spec.classes.findIndex((c) => c.name === k.name); const sm = agg.perClass[i] || agg.perClass[0];
            const tv = k.Wq * 60; const sv = sm.Wq;
            const inside = Math.abs(sv.mean - tv) <= Math.max(sv.hw || 0, Math.abs(tv) * 0.05);
            return [`Wq de ${k.name} (prioridad ${k.prio})`, U.fmtTime(tv), `${U.fmtTime(sv.mean)} ${fmtCI(sv, U.fmtTime)}`, h('span', { class: inside ? 'compare-ok' : 'compare-no' }, inside ? 'Coincide' : 'Difiere')];
          });
        } else {
          rowsT = th.keys.map((k) => {
            const tv = theoryValue(r, k, T); const sv = m[k]; if (!sv || !isFinite(tv)) return null;
            const f = FM[k] || ((x) => U.fmtPct(x));
            const inside = Math.abs(sv.mean - tv) <= Math.max(sv.hw || 0, Math.abs(tv) * 0.05, 1e-4);
            return [NAMES[k] || k, f(tv), `${f(sv.mean)} ${fmtCI(sv, f)}`, h('span', { class: inside ? 'compare-ok' : 'compare-no' }, inside ? 'Coincide' : 'Difiere')];
          }).filter(Boolean);
        }
        thCard.body.appendChild(UI.table(['Indicador', { t: 'Teoría', num: true }, { t: 'Simulación (IC 95 %)', num: true }, 'Resultado'], rowsT, { compact: true }));
        if (!steady) thCard.body.appendChild(h('p', { class: 'note-sm' }, 'Para una validación estricta usa un horizonte largo, calentamiento y desactiva "atender a quienes siguen dentro" (como en el ejemplo "Estado estable M/M/3").'));
        thCard.body.appendChild(UI.btn('Abrir en Modelos analíticos', () => QS.App.go('modelos', { model: th.id, spec }), 'btn-ghost btn-sm'));
      }
    }

    // Histograma de esperas
    const waits = agg.waits || [];
    const histC = UI.chartCard('Distribución del tiempo de espera', { sub: 'Clientes atendidos (todas las réplicas con detalle). La línea marca la meta T.', height: 280 });
    // Desempeño por hora
    const hourC = UI.chartCard('Llegadas y atendidos por hora', { sub: 'Promedio entre réplicas, por hora de llegada.', height: 280 });
    const waitHC = UI.chartCard('Espera y nivel de servicio por hora', { sub: 'Espera media de quienes llegaron en cada hora.', height: 280 });
    const srvC = UI.chartCard('Utilización por servidor', { sub: 'Fracción del tiempo en turno que cada servidor estuvo atendiendo.', height: 260 });
    const tech = h('details', { class: 'tech' }, h('summary', null, 'Detalle técnico: intervalos de confianza y comparación con la teoría'), h('div', { class: 'results' }, tbl.el, thCard.el));
    E.analysis.appendChild(tech);
    E.analysis.appendChild(h('div', { class: 'cols-2' }, histC.el, hourC.el));
    E.analysis.appendChild(h('div', { class: 'cols-2' }, waitHC.el, srvC.el));

    if (waits.length > 5) {
      const H = QS.Charts.histogram(waits, 40, 0.99);
      const ch = histC.chartEl; const hc = QS.Charts;
      hc.mount(ch, (t) => {
        const o = hc.base(t, { legend: false });
        o.xAxis = hc.xVal(t, { name: 'Espera (min)', min: H.edges[0], max: H.edges[H.edges.length - 1] });
        o.yAxis = hc.yVal(t, { name: '% de clientes' });
        o.series = [{ type: 'bar', name: 'Clientes', barWidth: '94%', data: H.counts.map((c, i) => [(H.edges[i] + H.edges[i + 1]) / 2, c / H.n * 100]),
          itemStyle: { color: t.pal[0], borderRadius: [3, 3, 0, 0] }, markLine: { silent: true, symbol: 'none', lineStyle: { color: t.ink2, width: 1 }, label: { formatter: 'meta T', color: t.ink2 }, data: [{ xAxis: T }] } }];
        o.tooltip.formatter = (ps) => `${U.fmtTime(H.edges[ps[0].dataIndex])} – ${U.fmtTime(H.edges[ps[0].dataIndex + 1])}<br><b>${U.fmt(ps[0].value[1], 1)} %</b> de los clientes`;
        return o;
      });
      histC.setTable(() => ({ headers: ['Desde', 'Hasta', { t: '% clientes', num: true }], rows: H.counts.map((c, i) => [U.fmtTime(H.edges[i]), U.fmtTime(H.edges[i + 1]), U.fmt(c / H.n * 100, 2)]) }));
    } else histC.chartEl.appendChild(h('p', { class: 'hint' }, 'Sin datos suficientes.'));

    const hrs = agg.hourly.filter((x) => x.arr > 0 || x.served > 0);
    const hl = hrs.map((x) => U.fmtClock((+spec.open || 0) + x.h * 60));
    QS.Charts.bars(hourC.chartEl, { categories: hl, yName: 'Clientes', series: [{ name: 'Llegadas', data: hrs.map((x) => +x.arr.toFixed(2)) }, { name: 'Atendidos', data: hrs.map((x) => +x.served.toFixed(2)) }] });
    hourC.setTable(() => ({ headers: ['Hora', { t: 'Llegadas', num: true }, { t: 'Atendidos', num: true }, { t: 'Abandonos', num: true }, { t: 'Desisten', num: true }, { t: 'Servidores', num: true }],
      rows: hrs.map((x, i) => [hl[i], U.fmt(x.arr, 1), U.fmt(x.served, 1), U.fmt(x.ab, 1), U.fmt(x.balk + x.block, 1), U.fmt(x.servers, 1)]) }));
    QS.Charts.lines(waitHC.chartEl, { categories: hl, yName: 'Espera media (min)', series: [{ name: 'Espera media', data: hrs.map((x) => (isFinite(x.wq) ? +x.wq.toFixed(3) : null)), symbols: true, area: true,
      markLine: (t) => QS.Charts.refLine(t, T, 'meta T') }], vf: (v) => U.fmtTime(v) });
    waitHC.setTable(() => ({ headers: ['Hora', { t: 'Espera media', num: true }, { t: 'Nivel de servicio', num: true }, { t: 'Utilización', num: true }, { t: 'Fila media', num: true }],
      rows: hrs.map((x, i) => [hl[i], U.fmtTime(x.wq), U.fmtPct(x.sl), U.fmtPct(x.util), U.fmt(x.lq, 2)]) }));
    const srvList = []; agg.stages.forEach((st) => st.servers.forEach((v) => srvList.push({ name: (agg.stages.length > 1 ? st.name + ' ' : 'S') + (v.i + 1), util: v.util, served: v.served })));
    QS.Charts.bars(srvC.chartEl, { categories: srvList.map((x) => x.name), yName: 'Utilización', yMax: 1, yFmt: (v) => U.fmtPct(v, 0), series: [{ name: 'Utilización', data: srvList.map((x) => +(x.util || 0).toFixed(4)) }],
      tooltip: (ps) => `${ps[0].name}<br><b>${U.fmtPct(ps[0].value)}</b> ocupado · ${U.fmt(srvList[ps[0].dataIndex].served, 1)} atendidos` });
    srvC.setTable(() => ({ headers: ['Servidor', { t: 'Utilización', num: true }, { t: 'Atendidos', num: true }], rows: srvList.map((x) => [x.name, U.fmtPct(x.util), U.fmt(x.served, 1)]) }));

    // Tablas por clase y por etapa
    const grids = [];
    const multiSt = agg.stages.length > 1;
    if (multiSt) {
      const c = UI.card('Resultados por etapa', { sub: `La etapa con mayor utilización es el cuello de botella. Nivel de servicio: clientes que esperaron ${U.fmtTime(T)} o menos en esa etapa.` });
      const maxU = Math.max(...agg.stages.map((s) => s.util.mean));
      c.body.appendChild(UI.table(['Etapa', { t: 'Servidores', num: true }, { t: 'Clientes', num: true }, { t: 'Utilización', num: true }, { t: 'Fila media', num: true }, { t: 'Espera media', num: true }, { t: 'Nivel de servicio', num: true }],
        agg.stages.map((s) => [s.name, s.c, isFinite(s.visits) ? U.fmt(s.visits, 0) : '—', U.fmtPct(s.util.mean), U.fmt(s.Lq.mean, 2), U.fmtTime(s.Wq.mean), s.SL ? U.fmtPct(s.SL.mean) : '—']), { compact: true, rowClass: (r, i) => (agg.stages[i].util.mean === maxU ? 'hl' : '') }));
      grids.push(c.el);
    }
    if (agg.perClass.length > 1) {
      const c = UI.card('Resultados por tipo de cliente', { sub: multiSt ? 'Espera en cada etapa que visita cada tipo de cliente.' : '' });
      const stH = multiSt ? agg.stages.map((s) => ({ t: 'Espera en ' + String(s.name).split(':')[0], num: true })) : [];
      c.body.appendChild(UI.table(['Clase', { t: 'Prioridad', num: true }, { t: 'Atendidos', num: true }, { t: multiSt ? 'Espera total' : 'Espera media', num: true }].concat(stH, [{ t: 'Tiempo en sistema', num: true }, { t: 'Nivel de servicio', num: true }, { t: 'Abandonos', num: true }]),
        agg.perClass.map((k) => [h('span', { class: 'cell-name' }, k.name), k.prio, U.fmt(k.served, 1), `${U.fmtTime(k.Wq.mean)} ${fmtCI(k.Wq, U.fmtTime)}`].concat(multiSt ? agg.stages.map((s, si) => (k.stageWq && isFinite(k.stageWq[si]) ? U.fmtTime(k.stageWq[si]) : 'no pasa')) : [], [U.fmtTime(k.W.mean), U.fmtPct(k.SL.mean), U.fmt(k.ab, 1)])), { compact: true }));
      grids.push(c.el);
    }
    if (grids.length) grids.forEach((g) => E.analysis.appendChild(g));

    // Escenarios de dotación
    const whatIf = UI.card('¿Cuántos servidores conviene tener?', { sub: 'Repite las réplicas cambiando los servidores de la primera etapa y compara servicio y costo.' });
    const out = h('div');
    whatIf.body.appendChild(UI.btn('Comparar dotaciones', () => runWhatIf(spec, out), 'btn-sm'));
    whatIf.body.appendChild(out);
    E.analysis.appendChild(whatIf.el);
  }

  async function runWhatIf(spec, out) {
    U.clear(out);
    const s0 = spec.stages[0];
    if (s0.useSchedule) { out.appendChild(UI.note('La primera etapa usa horario de personal: para comparar, multiplica el horario o usa Herramientas → "Personal por intervalo".', 'info')); return; }
    const c0 = s0.servers, from = Math.max(1, c0 - 2), to = c0 + 3;
    const prog = UI.progress(); out.appendChild(prog.el);
    const rows = []; const reps = Math.max(5, Math.min(spec.run.reps, 20));
    for (let c = from; c <= to; c++) {
      const sp = JSON.parse(JSON.stringify(spec)); sp.stages[0].servers = c;
      const agg = await Sim.runReps(sp, { reps, onProgress: (f) => prog.set(((c - from) + f) / (to - from + 1), `Probando ${c} servidores…`) });
      rows.push({ c, m: agg.m, unstable: agg.unstable });
    }
    prog.hide();
    const best = rows.filter((r) => !r.unstable).reduce((b, r) => (!b || r.m.costHour.mean < b.m.costHour.mean ? r : b), null);
    const cur = spec.cost.cur || '$';
    out.appendChild(UI.table([{ t: 'Servidores', num: true }, { t: 'Espera media', num: true }, { t: 'P90 espera', num: true }, { t: 'Nivel de servicio', num: true }, { t: 'Utilización', num: true }, { t: 'Perdidos', num: true }, { t: 'Costo por hora', num: true }],
      rows.map((r) => [r.c + (r.c === c0 ? ' (actual)' : ''), r.unstable ? 'inestable' : U.fmtTime(r.m.Wq.mean), U.fmtTime(r.m.wqP90.mean), U.fmtPct(r.m.SL.mean), U.fmtPct(r.m.util.mean), U.fmtPct(r.m.Plost.mean), U.fmtMoney(r.m.costHour.mean, cur)]),
      { compact: true, rowClass: (r, i) => (best && rows[i].c === best.c ? 'hl' : '') }));
    if (best) out.appendChild(h('p', { class: 'note-sm' }, `Con los costos configurados, la dotación de menor costo total es ${best.c} servidores (fila resaltada). Ajusta los costos de espera y de cliente perdido para reflejar tu negocio.`));
  }

  function exportCSV(agg, spec) {
    const m = agg.m; const rows = [];
    for (const k of Sim.KEYS) { const s = m[k]; if (s && isFinite(s.mean)) rows.push([k, s.mean, s.hw, s.sd, s.min, s.max, s.n]); }
    let csv = U.toCSV(['indicador', 'media', 'ic95_mas_menos', 'desv_est', 'min', 'max', 'replicas'], rows);
    const hr = agg.hourly.map((x) => [U.fmtClock((+spec.open || 0) + x.h * 60), x.arr, x.served, x.ab, x.balk, x.block, x.wq, x.sl, x.lq, x.util, x.servers]);
    csv += '\r\n\r\n' + U.toCSV(['hora', 'llegadas', 'atendidos', 'abandonos', 'desisten', 'bloqueados', 'espera_media_min', 'nivel_servicio', 'fila_media', 'utilizacion', 'servidores'], hr).replace('﻿', '');
    U.saveFile(fileName(spec.name) + '_resultados.csv', csv, 'text/csv;charset=utf-8');
  }
  function exportCiw() {
    if (!QS.Export) return;
    const code = QS.Export.ciw(S.spec);
    UI.codeModal('Validar este escenario con Ciw (Python)', code, fileName(S.spec.name) + '_ciw.py',
      'Ciw (github.com/CiwPython/Ciw) es una librería abierta de simulación de redes de colas. Instálala con "pip install ciw" y ejecuta este script para obtener una segunda opinión independiente sobre el mismo modelo.');
  }
})(typeof window !== 'undefined' ? window : globalThis);
