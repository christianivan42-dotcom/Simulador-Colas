/* Pestaña "Datos y pronóstico": carga de históricos, calidad, estacionalidad, distribuciones,
   pronóstico y plan de personal por temporada. */
(function (root) {
  'use strict';
  const QS = root.QS; const U = QS.U, h = U.h, UI = QS.UI, D = QS.Data, AN = QS.Analysis, FC = QS.Forecast, C = QS.Charts;
  const DU = QS.DataUI = {};
  const STEPS = [['load', 'Cargar datos'], ['quality', 'Calidad'], ['patterns', 'Patrones y temporadas'], ['dist', 'Distribuciones'], ['forecast', 'Pronóstico'], ['plan', 'Plan de personal']];
  const S = {
    step: 'load', src: null, pv: null, kind: 'interval', map: {}, dec: '.', dateOrder: 'DMY', durUnit: 'min', ticket: 0,
    ds: null, R: null, fc: null, plan: null, events: AN.defaultEvents(), seasonHi: 8, seasonLo: 8, seasonOverride: new Array(12).fill(''),
    heatFilter: 'all', planMonth: 11, planDow: 5, external: null, isSample: false, busy: false,
    P: Object.assign({ target: 'sl', pct: 80, tVal: 5, tUnit: 'min', asa: 3, maxOcc: 90, patience: 0, shrink: 20, ahtMode: 'data', ahtManual: 6, coverage: 'p75',
      ftLen: 8, ptLen: 4, allowPT: true, ftCost: 95, ptCost: 105, maxPT: 30, startEvery: 60, daysFT: 6, weekHours: 48, basePolicy: 'min', cur: '$', planYear: 0 }, U.store.get('data:plan', {}))
  };
  let E = {};
  const saveP = () => U.store.set('data:plan', S.P);

  DU.init = function (view) {
    E.view = view; U.clear(view);
    E.stepper = h('nav', { class: 'stepper', 'aria-label': 'Pasos del análisis' });
    E.badge = h('span');
    E.body = h('div', { class: 'results' });
    view.appendChild(h('div', { class: 'view-head' }, h('div', null, h('div', { class: 'eyebrow' }, 'Análisis histórico'), h('h2', null, 'Datos, temporadas y plan de personal'),
      h('p', null, 'Carga años de historia (tickets, conteos por hora o ventas diarias). El sistema detecta temporadas altas, bajas y periódicas, pronostica la demanda y calcula cuántas personas contratar cada mes.')), E.badge));
    view.appendChild(E.stepper); view.appendChild(E.body);
    renderStepper(); render();
  };
  DU.activate = function () {
    if (!S.ds && !S.busy && !S.autoTried) {
      S.autoTried = true; U.clear(E.body);
      E.body.appendChild(UI.note('Preparando datos de ejemplo: casi 5 años de llegadas por hora de una sucursal ficticia. En "Cargar datos" puedes reemplazarlos por los tuyos.', 'info'));
      setTimeout(() => { if (!S.ds) loadSample('hourly', true); }, 30);
    }
    else C.rerenderAll();
  };
  DU.state = S;
  // Recibe un conjunto de datos ya procesado (por ejemplo, desde el asistente "Mi negocio")
  DU.useDataset = function (ds, o = {}) {
    S.ds = ds; S.autoTried = true; S.isSample = !!o.isSample; S.share = o.share || null;
    if (o.events) S.events = o.events.map((e) => Object.assign({}, e));
    if (o.name && !ds.source) ds.source = o.name;
    analyze(); S.step = 'patterns';
    if (E.stepper) { renderStepper(); render(); }
  };

  function renderStepper() {
    U.clear(E.stepper);
    STEPS.forEach(([id, name], i) => {
      const enabled = id === 'load' || !!S.R;
      const b = h('button', { type: 'button', class: S.step === id ? 'on' : '', disabled: !enabled, 'aria-current': S.step === id ? 'step' : null }, h('span', { class: 'k' }, String(i + 1)), name);
      b.addEventListener('click', () => { S.step = id; renderStepper(); render(); });
      E.stepper.appendChild(b);
    });
    U.clear(E.badge);
    if (S.ds) E.badge.appendChild(h('div', { class: 'row' }, S.isSample ? UI.pill('Datos de ejemplo (ficticios)', 'warn') : UI.pill('Tus datos', 'good'), h('span', { class: 'hint' }, `${S.ds.source} · ${U.fmtDay(S.ds.k0)} – ${U.fmtDay(S.ds.k1)}`)));
  }
  function go(step) { S.step = step; renderStepper(); render(); window.scrollTo({ top: E.view.offsetTop - 70, behavior: 'smooth' }); }
  function render() {
    C.prune(); U.clear(E.body);
    ({ load: rLoad, quality: rQuality, patterns: rPatterns, dist: rDist, forecast: rForecast, plan: rPlan })[S.step]();
  }

  /* ======================= 1. Cargar ======================= */
  function rLoad() {
    const src = UI.card('Fuente de datos', { sub: 'CSV o TXT (cualquier separador), Excel .xlsx o texto pegado. Los archivos se procesan en tu navegador: no se envían a ningún servidor.' });
    const file = h('input', { type: 'file', accept: '.csv,.txt,.tsv,.xlsx,.xlsm,.xls,.ods', hidden: true });
    file.addEventListener('change', () => { if (file.files[0]) pickFile(file.files[0]); file.value = ''; });
    const drop = h('div', { class: 'drop', tabindex: '0', role: 'button', 'aria-label': 'Elegir archivo de datos' },
      h('b', null, 'Arrastra aquí tu archivo o haz clic para elegirlo'), h('span', { class: 'hint' }, 'Soporta archivos grandes (millones de filas) leyéndolos por bloques.'));
    drop.addEventListener('click', () => file.click());
    drop.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); file.click(); } });
    drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('over'); });
    drop.addEventListener('dragleave', () => drop.classList.remove('over'));
    drop.addEventListener('drop', (e) => { e.preventDefault(); drop.classList.remove('over'); const f = e.dataTransfer.files[0]; if (f) pickFile(f); });
    const ta = h('textarea', { rows: 4, placeholder: 'O pega aquí celdas copiadas de Excel (con encabezados)…', 'aria-label': 'Pegar datos' });
    src.body.appendChild(drop); src.body.appendChild(file); src.body.appendChild(ta);
    src.body.appendChild(h('div', { class: 'row' }, UI.btn('Usar texto pegado', () => { if (ta.value.trim()) pickSource({ type: 'text', text: ta.value, name: 'Datos pegados' }); }, 'btn-sm'),
      UI.btn('Ejemplo: 4 años por hora', () => loadSample('hourly'), 'btn-sm'), UI.btn('Ejemplo: tickets individuales', () => loadSample('trans'), 'btn-sm')));
    const tpl = UI.card('Plantillas de carga', { sub: 'Descarga el formato que mejor se parezca a lo que exporta tu sistema (turnero, punto de venta, ACD del call center, CRM).' });
    tpl.body.appendChild(h('div', { class: 'row' },
      UI.btn('Transaccional (por cliente)', () => U.saveFile('plantilla_transaccional.csv', D.templates.transaccional(), 'text/csv'), 'btn-sm'),
      UI.btn('Por intervalo (por hora)', () => U.saveFile('plantilla_intervalos.csv', D.templates.intervalos(), 'text/csv'), 'btn-sm'),
      UI.btn('Diaria (clientes o ventas)', () => U.saveFile('plantilla_diaria.csv', D.templates.diaria(), 'text/csv'), 'btn-sm'),
      UI.btn('Guía para preparar datos', () => QS.App.go('guia', { anchor: 'alimentar' }), 'btn-ghost btn-sm')));
    tpl.body.appendChild(h('p', { class: 'hint' }, 'Mínimo recomendado: 2 años para estimar estacionalidad anual; ideal 3 a 5 años. Lo mejor es el detalle por cliente (permite ajustar distribuciones); el conteo por hora es suficiente para pronosticar y dimensionar.'));
    E.body.appendChild(h('div', { class: 'cols-2' }, src.el, tpl.el));
    E.mapBox = h('div', { class: 'results' });
    E.body.appendChild(E.mapBox);
    if (S.pv) renderMapping();
  }
  async function pickFile(f) { await pickSource({ type: 'file', file: f, name: f.name }); }
  async function pickSource(src) {
    try {
      S.src = src; S.pv = await D.preview(src);
      S.kind = D.guessKind(S.pv.headers, S.pv.rows); S.map = D.guessMapping(S.pv.headers, S.kind); S.dec = S.pv.decimal || '.';
      const dcol = S.map.fechahora != null ? S.map.fechahora : S.map.fecha; S.dateOrder = dcol != null ? D.detectDateOrder(S.pv.rows.map((r) => r[dcol])) : 'DMY';
      const durCol = [S.map.tmo, S.map.duracion, S.map.espera].find((x) => x != null);
      if (durCol != null) { const hn = D.normHeader(S.pv.headers[durCol]); S.durUnit = /(seg|sec|_s$)/.test(hn) ? 's' : /(hora|_h$|hrs)/.test(hn) ? 'h' : 'min'; }
      S.isSample = !!src.sample;
      renderMapping();
    } catch (e) { console.error(e); U.toast('No se pudo leer el archivo: ' + e.message, 'bad', 6000); }
  }
  function renderMapping() {
    if (!E.mapBox) return; U.clear(E.mapBox);
    const pv = S.pv; const card = UI.card('Vista previa y mapeo de columnas', { sub: `Separador: ${pv.delimiter === '\t' ? 'tabulador' : pv.delimiter} · Codificación: ${pv.encoding} · Decimal detectado: "${S.dec}"${pv.note ? ' · ' + pv.note : ''}` });
    card.body.appendChild(UI.table(pv.headers.map((x) => String(x)), pv.rows.slice(0, 8).map((r) => pv.headers.map((_, i) => (r[i] == null ? '' : String(r[i])))), { compact: true }));
    card.body.appendChild(UI.select({ label: 'Tipo de datos', value: S.kind, options: Object.entries(D.KINDS).map(([k, v]) => [k, v.name]), help: 'Transaccional: una fila por cliente. Por intervalo: conteos por hora o media hora. Diario: totales por día.',
      onChange: (v) => { S.kind = v; S.map = D.guessMapping(pv.headers, v); renderMapping(); } }).el);
    const grid = h('div', { class: 'map-grid' });
    const opts = [['', '— No usar —']].concat(pv.headers.map((x, i) => [String(i), `${x || 'Columna ' + (i + 1)}`]));
    for (const [role, name, hint] of D.KINDS[S.kind].roles) {
      grid.appendChild(UI.select({ label: name, value: S.map[role] != null ? String(S.map[role]) : '', options: opts, help: hint || undefined, onChange: (v) => { if (v === '') delete S.map[role]; else S.map[role] = +v; } }).el);
    }
    card.body.appendChild(grid);
    card.body.appendChild(UI.grid(4,
      UI.select({ label: 'Orden de la fecha', value: S.dateOrder, options: [['DMY', 'día/mes/año'], ['MDY', 'mes/día/año']], onChange: (v) => { S.dateOrder = v; } }).el,
      UI.select({ label: 'Separador decimal', value: S.dec, options: [['.', 'punto (1234.5)'], [',', 'coma (1234,5)']], onChange: (v) => { S.dec = v; } }).el,
      UI.select({ label: 'Unidad de duraciones', value: S.durUnit, options: [['min', 'minutos'], ['s', 'segundos'], ['h', 'horas'], ['day', 'formato de hora de Excel']], help: 'Si las duraciones vienen como hh:mm:ss se detectan solas.', onChange: (v) => { S.durUnit = v; } }).el,
      UI.num({ label: 'Ticket promedio', value: S.ticket || '', min: 0, help: 'Solo si no tienes conteo de clientes: se estima clientes = ventas / ticket promedio.', onInput: (v) => { S.ticket = v || 0; } }).el));
    const prog = UI.progress();
    const btn = UI.btn('Procesar datos', () => processNow(prog, btn), 'btn-primary');
    card.body.appendChild(h('div', { class: 'row' }, btn, prog.el));
    E.mapBox.appendChild(card.el);
  }
  async function processNow(prog, btn) {
    const roles = S.map;
    if (S.kind === 'trans' && roles.fechahora == null && roles.fecha == null) { U.toast('Indica la columna con la fecha y hora de llegada.', 'warn'); return; }
    if (S.kind !== 'trans' && roles.fecha == null) { U.toast('Indica la columna de fecha.', 'warn'); return; }
    if (S.kind !== 'trans' && roles.llegadas == null && !(roles.ventas != null && S.ticket > 0)) { U.toast('Indica la columna de clientes (o ventas y ticket promedio).', 'warn'); return; }
    S.busy = true; if (btn) btn.disabled = true;
    try {
      const t0 = performance.now();
      const ds = await D.process(S.src, { kind: S.kind, map: roles, dec: S.dec, dateOrder: S.dateOrder, durUnit: S.durUnit, ticket: S.ticket }, (f) => prog && prog.set(f * 0.8, 'Leyendo filas…'));
      if (!ds.days.length) throw new Error('No se obtuvo ningún día válido. Revisa el mapeo de columnas y el formato de fecha.');
      prog && prog.set(0.85, 'Analizando estacionalidad…'); await U.tick();
      S.ds = ds; S.share = null; analyze();
      prog && prog.set(1, `Listo en ${U.fmt((performance.now() - t0) / 1000, 1)} s`);
      U.toast(`Datos procesados: ${U.fmtInt(ds.stats.ok)} filas válidas, ${U.fmtInt(ds.days.length)} días.`, 'ok');
      go('quality');
    } catch (e) { console.error(e); U.toast(e.message, 'bad', 7000); }
    finally { S.busy = false; if (btn) btn.disabled = false; }
  }
  function analyze() {
    S.R = AN.build(S.ds, { events: S.events, share: S.share || null });
    S.fc = FC.run(S.R, { external: S.external });
    S.plan = null;
    const yEnd = U.dayInfo(S.ds.k1).y; if (!S.P.planYear || S.P.planYear <= yEnd - 1 || S.P.planYear > yEnd + 1) S.P.planYear = U.dayInfo(S.ds.k1).m >= 10 || U.dayInfo(S.ds.k1).m === 12 ? yEnd + 1 : yEnd + 1;
  }
  async function loadSample(kind, auto) {
    S.busy = true;
    if (!auto) U.toast('Generando datos de ejemplo…', 'info', 1500);
    await U.tick();
    const g = kind === 'trans' ? D.generateTrans() : D.generate();
    const src = { type: 'rows', headers: g.headers, rows: g.rows, name: g.name, sample: true };
    S.src = src; S.pv = await D.preview(src); S.kind = D.guessKind(g.headers, g.rows); S.map = D.guessMapping(g.headers, S.kind); S.dec = '.'; S.dateOrder = 'DMY'; S.durUnit = 'min'; S.isSample = true;
    if (kind === 'trans') S.map = { fechahora: 1, inicio: 2, fin: 3, servidor: 4, clase: 5, abandono: 6 };
    S.busy = false;
    if (auto) { await processNow(null, null); S.step = 'patterns'; renderStepper(); render(); }
    else { S.step = 'load'; renderStepper(); render(); U.toast('Ejemplo cargado: revisa el mapeo y presiona "Procesar datos".', 'ok'); }
  }

  /* ======================= 2. Calidad ======================= */
  function rQuality() {
    const ds = S.ds, R = S.R, st = ds.stats;
    const yrs = (ds.k1 - ds.k0 + 1) / 365.25;
    E.body.appendChild(h('div', { class: 'kpis' },
      UI.tile('Filas leídas', U.fmtInt(st.rows), `${U.fmtInt(st.ok)} válidas · ${U.fmtInt(st.bad)} descartadas`, { state: st.bad / Math.max(1, st.rows) > 0.05 ? 'warn' : 'good' }),
      UI.tile('Periodo', `${U.fmt(yrs, 1)} años`, `${U.fmtDay(ds.k0)} a ${U.fmtDay(ds.k1)}`, { state: yrs >= 2 ? 'good' : 'warn' }),
      UI.tile('Días con atención', U.fmtInt(R.openDays), `${U.fmtInt(R.missing)} días sin registros`),
      UI.tile('Clientes totales', U.compact(R.total), `${U.fmt(R.avgDay, 0)} por día abierto`),
      UI.tile('Día de mayor demanda', U.fmtInt(R.peakDay.v), U.fmtDay(R.peakDay.k)),
      UI.tile('Crecimiento anual (tendencia)', U.fmtPct(R.trend.annual), `R² = ${U.fmt(R.trend.r2, 2)}`, { state: R.trend.annual >= 0 ? null : 'warn' })));
    const avail = [['Tiempos de atención', ds.has.svc], ['Esperas', ds.has.wq], ['Abandonos', ds.has.ab], ['Personal por hora', ds.has.srv], ['Ventas', ds.has.sales], ['Detalle por hora', ds.has.hourly]];
    const c1 = UI.card('Información disponible', { sub: 'Lo que falte se puede ingresar manualmente en el plan de personal.' });
    c1.body.appendChild(h('div', { class: 'row' }, avail.map(([n, ok]) => UI.pill(n, ok ? 'good' : 'warn'))));
    if (yrs < 2) c1.body.appendChild(UI.note('Hay menos de 2 años de datos: los índices mensuales son preliminares. Con 3 o más años la estacionalidad y la tendencia se separan con mucha más confianza.', 'warn'));
    if (ds.stats.unsorted > ds.stats.ok * 0.01) c1.body.appendChild(UI.note('Las filas no están ordenadas por hora de llegada: los tiempos entre llegadas no se pudieron medir de forma confiable (el resto del análisis no se afecta).', 'info'));
    if (!ds.has.hourly) c1.body.appendChild(UI.note('Los datos son diarios: para repartir la demanda por hora se usa un perfil horario típico de comercio. Si tienes conteos por hora, cárgalos para mayor precisión.', 'info'));
    if (Object.keys(ds.classes).length) c1.body.appendChild(h('p', { class: 'hint' }, 'Tipos de cliente: ' + Object.entries(ds.classes).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, v]) => `${k} (${U.fmtPct(v / st.ok)})`).join(', ')));
    if (ds.nServers) c1.body.appendChild(h('p', { class: 'hint' }, `Servidores distintos en los datos: ${ds.nServers}.`));
    const c2 = UI.card('Filas descartadas', { sub: 'Motivos por los que algunas filas no se usaron.' });
    const reasons = Object.entries(st.reasons);
    c2.body.appendChild(reasons.length ? UI.table(['Motivo', { t: 'Filas', num: true }], reasons.map(([k, v]) => [k, U.fmtInt(v)]), { compact: true }) : UI.note('Todas las filas se leyeron correctamente.', 'good'));
    E.body.appendChild(h('div', { class: 'cols-2' }, c1.el, c2.el));
    const c3 = UI.card('Cierres recurrentes detectados', { sub: 'Fechas sin atención en la mayoría de los años, en días que normalmente abren. Se tratan como feriados en el pronóstico.' });
    c3.body.appendChild(R.closures.length ? UI.table(['Fecha (mm-dd)', { t: 'Años cerrado', num: true }], R.closures.map((x) => [x.md, x.years]), { compact: true }) : h('p', { class: 'hint' }, 'No se detectaron cierres recurrentes.'));
    const c4 = UI.card('Días atípicos', { sub: 'Días cuya demanda se aleja mucho de lo esperado por tendencia, temporada y día de la semana (posibles errores de captura o eventos no registrados).' });
    c4.body.appendChild(R.outliers.length ? UI.table(['Fecha', { t: 'Real', num: true }, { t: 'Esperado', num: true }, { t: 'Desviación', num: true }],
      R.outliers.slice(0, 12).map((o) => [U.fmtDay(o.k), U.fmtInt(o.y), U.fmtInt(o.exp), U.fmtPct(o.y / o.exp - 1)]), { compact: true }) : h('p', { class: 'hint' }, 'No hay días atípicos relevantes.'));
    E.body.appendChild(h('div', { class: 'cols-2' }, c3.el, c4.el));
    E.body.appendChild(h('div', { class: 'row' }, UI.btn('Ver patrones y temporadas', () => go('patterns'), 'btn-primary')));
  }

  /* ======================= 3. Patrones ======================= */
  function seasonsNow() { const auto = AN.seasons(S.R.monthIdx, S.seasonHi / 100, S.seasonLo / 100); return auto.map((x, i) => S.seasonOverride[i] || x); }
  function rPatterns() {
    const R = S.R, ds = S.ds;
    // serie diaria con media móvil
    const dc = UI.chartCard('Demanda diaria', { sub: 'Clientes por día y promedio móvil de 28 días. Usa la barra inferior o la rueda del ratón para acercar.', height: 330 });
    const pts = [], ma = [];
    let acc = 0; const win = [];
    for (let i = 0; i < R.N; i++) {
      const t = (R.k0 + i) * U.DAY; pts.push([t, R.present[i] ? R.y[i] : null]);
      win.push(R.y[i]); acc += R.y[i]; if (win.length > 28) acc -= win.shift();
      ma.push([t, win.length === 28 ? +(acc / 28).toFixed(1) : null]);
    }
    C.mount(dc.chartEl, (t) => {
      const o = C.base(t, { zoom: true }); o.xAxis = C.xTime(t); o.yAxis = C.yVal(t, { name: 'Clientes por día' });
      o.series = [Object.assign(C.line(t, 'Clientes por día', pts, 0, { width: 1, opacity: 0.55 }), { sampling: 'lttb' }), C.line(t, 'Promedio móvil 28 días', ma, 1)];
      o.tooltip.formatter = (ps) => `${U.fmtDay(Math.round(ps[0].value[0] / U.DAY))}<br>` + ps.map((p) => `${p.marker}${p.seriesName}: <b>${p.value[1] == null ? '—' : U.fmtInt(p.value[1])}</b>`).join('<br>');
      return o;
    });
    dc.setTable(() => ({ headers: ['Mes', { t: 'Total', num: true }, { t: 'Días abiertos', num: true }, { t: 'Promedio diario', num: true }], rows: R.months.map((m) => [`${U.MESES[m.m - 1]} ${m.y}`, U.fmtInt(m.total), m.open, U.fmt(m.avg, 1)]) }));
    E.body.appendChild(dc.el);

    // comparativo anual y temporadas
    const yc = UI.chartCard('Comparativo por año', { sub: 'Promedio de clientes por día abierto en cada mes. Las líneas paralelas indican estacionalidad estable; la separación entre años es la tendencia.', height: 300 });
    const years = [...new Set(R.months.map((m) => m.y))];
    C.lines(yc.chartEl, { categories: U.MESES, yName: 'Clientes por día', series: years.map((yy, i) => ({ name: String(yy), data: U.range(12, (m) => { const mo = R.months.find((x) => x.y === yy && x.m === m + 1); return mo && !mo.partial && isFinite(mo.avg) ? +mo.avg.toFixed(1) : null; }), symbols: true, ci: i })), vf: (v) => U.fmt(v, 0) });
    yc.setTable(() => ({ headers: ['Mes'].concat(years.map((y) => ({ t: String(y), num: true }))), rows: U.range(12, (m) => [U.MESES_L[m]].concat(years.map((yy) => { const mo = R.months.find((x) => x.y === yy && x.m === m + 1); return mo && !mo.partial ? U.fmt(mo.avg, 1) : '—'; }))) }));
    const sc = UI.chartCard('Índice estacional mensual y temporadas', { sub: R.seasonMethod + '. 1,00 = mes promedio.', height: 300 });
    const drawSeason = () => {
      const seas = seasonsNow();
      C.bars(sc.chartEl, { categories: U.MESES, yName: 'Índice', yMin: 0, series: [{ name: 'Índice estacional', data: R.monthIdx.map((x) => +x.toFixed(3)), color: (t, i) => t.season[seas[i]] }],
        tooltip: (ps) => `${U.MESES_L[ps[0].dataIndex]}<br><b>${U.fmt(ps[0].value, 3)}</b> · temporada ${seas[ps[0].dataIndex]}`, extra: (o, t) => { o.series[0].markLine = C.refLine(t, 1, 'promedio'); } });
    };
    drawSeason();
    sc.setTable(() => { const seas = seasonsNow(); return { headers: ['Mes', { t: 'Índice', num: true }, 'Temporada'], rows: U.range(12, (m) => [U.MESES_L[m], U.fmt(R.monthIdx[m], 3), seas[m]]) }; });
    E.body.appendChild(h('div', { class: 'cols-2' }, yc.el, sc.el));

    // editor de temporadas
    const se = UI.card('Clasificación de temporadas', { sub: 'Alta si el índice supera 1 + umbral; baja si es menor que 1 − umbral. Puedes forzar la temporada de cualquier mes.' });
    const grid = h('div', { class: 'season-grid' });
    const rebuild = () => {
      U.clear(grid); const seas = seasonsNow();
      U.range(12, (m) => {
        const sel = h('select', { 'aria-label': 'Temporada de ' + U.MESES_L[m] }, [['', 'Auto'], ['Alta', 'Alta'], ['Normal', 'Normal'], ['Baja', 'Baja']].map(([v, t]) => h('option', { value: v }, t)));
        sel.value = S.seasonOverride[m]; sel.addEventListener('change', () => { S.seasonOverride[m] = sel.value; S.plan = null; rebuild(); drawSeason(); });
        grid.appendChild(h('div', { class: 'season-cell ' + seas[m] }, h('b', null, U.MESES[m]), h('span', { class: 'ix' }, U.fmt(R.monthIdx[m], 2)), h('span', { class: 'hint' }, seas[m]), sel));
      });
    };
    rebuild();
    se.body.appendChild(UI.grid(2,
      UI.num({ label: 'Umbral de temporada alta', unit: '%', value: S.seasonHi, min: 0, onInput: (v) => { S.seasonHi = v || 0; S.plan = null; rebuild(); drawSeason(); } }).el,
      UI.num({ label: 'Umbral de temporada baja', unit: '%', value: S.seasonLo, min: 0, onInput: (v) => { S.seasonLo = v || 0; S.plan = null; rebuild(); drawSeason(); } }).el));
    se.body.appendChild(grid);
    E.body.appendChild(se.el);

    // día de la semana y día del mes
    const wc = UI.chartCard('Índice por día de la semana', { sub: 'Mediana de la razón contra el promedio móvil de 7 días.', height: 260 });
    C.bars(wc.chartEl, { categories: U.DIAS, yName: 'Índice', yMin: 0, series: [{ name: 'Índice', data: R.dowIdx.map((x) => +x.toFixed(3)) }], extra: (o, t) => { o.series[0].markLine = C.refLine(t, 1, 'promedio'); } });
    wc.setTable(() => ({ headers: ['Día', { t: 'Índice', num: true }, { t: 'Días abiertos', num: true }], rows: U.range(7, (w) => [U.DIAS_L[w], U.fmt(R.dowIdx[w], 3), U.fmtPct(R.dowOpen[w], 0)]) }));
    const mc = UI.chartCard('Efecto del día del mes (quincenas y días de pago)', { sub: `En los días 1, 2, 15, 16, 30 y 31 la demanda es ${U.fmtPct(R.paydayLift - 1)} distinta al resto del mes.`, height: 260 });
    const pay = [0, 1, 14, 15, 29, 30];
    C.bars(mc.chartEl, { categories: U.range(31, (i) => String(i + 1)), yName: 'Índice', yMin: 0, series: [{ name: 'Índice del día', data: R.domIdx.map((x) => +x.toFixed(3)), color: (t, i) => (pay.includes(i) ? t.pal[1] : t.pal[0]) }], extra: (o, t) => { o.series[0].markLine = C.refLine(t, 1, ''); } });
    mc.setTable(() => ({ headers: [{ t: 'Día', num: true }, { t: 'Índice', num: true }], rows: R.domIdx.map((x, i) => [i + 1, U.fmt(x, 3)]) }));
    E.body.appendChild(h('div', { class: 'cols-2' }, wc.el, mc.el));

    // mapa de calor
    if (R.hourly) {
      const hc = UI.chartCard('Llegadas promedio por día y hora', { sub: 'Promedio de clientes por hora. Filtra por temporada para ver cómo cambia el perfil.', height: 320 });
      const filt = UI.select({ label: 'Temporada', value: S.heatFilter, options: [['all', 'Todo el año'], ['Alta', 'Temporada alta'], ['Normal', 'Temporada normal'], ['Baja', 'Temporada baja']].concat(U.MESES_L.map((m, i) => ['m' + i, m])),
        onChange: (v) => { S.heatFilter = v; drawHeat(); } });
      hc.body.insertBefore(filt.el, hc.chartEl);
      let hours = [];
      const drawHeat = () => {
        const seas = seasonsNow(); const sum = U.range(7, () => new Float64Array(24)), cnt = new Float64Array(7);
        for (const d of ds.days) {
          if (!d.arr || !(d.tot > 0)) continue;
          const ok = S.heatFilter === 'all' || (S.heatFilter[0] === 'm' ? d.m - 1 === +S.heatFilter.slice(1) : seas[d.m - 1] === S.heatFilter);
          if (!ok) continue; cnt[d.dow]++; for (let hh = 0; hh < 24; hh++) sum[d.dow][hh] += d.arr[hh];
        }
        const used = U.range(24, (hh) => hh).filter((hh) => sum.some((s) => s[hh] > 0));
        hours = used.length ? U.range(used[used.length - 1] - used[0] + 1, (i) => used[0] + i) : [];
        const data = []; for (let w = 0; w < 7; w++) hours.forEach((hh, j) => data.push([j, w, cnt[w] ? +(sum[w][hh] / cnt[w]).toFixed(1) : 0]));
        C.heat(hc.chartEl, { rows: U.DIAS, cols: hours.map((x) => U.fmtHour(x)), data, unit: 'clientes/h', labels: hours.length <= 14, labelDigits: 0 });
        hc.setTable(() => ({ headers: ['Día'].concat(hours.map((x) => ({ t: U.fmtHour(x), num: true }))), rows: U.range(7, (w) => [U.DIAS_L[w]].concat(hours.map((hh) => U.fmt(cnt[w] ? sum[w][hh] / cnt[w] : 0, 1)))) }));
      };
      drawHeat();
      E.body.appendChild(hc.el);
    }
    // tiempos de atención
    if (ds.has.svc) {
      const ac = UI.chartCard('Tiempo medio de atención por mes', { sub: `Promedio general ${U.fmtTime(R.aht)}. En temporada alta suele cambiar (compras más complejas, personal temporal).`, height: 240 });
      C.bars(ac.chartEl, { categories: U.MESES, yName: 'Minutos', series: [{ name: 'TMO', data: R.ahtMonth.map((x) => +x.toFixed(2)) }], tooltip: (ps) => `${U.MESES_L[ps[0].dataIndex]}<br><b>${U.fmtTime(ps[0].value)}</b>` });
      ac.setTable(() => ({ headers: ['Mes', { t: 'TMO', num: true }], rows: R.ahtMonth.map((x, i) => [U.MESES_L[i], U.fmtTime(x)]) }));
      const ah = UI.chartCard('Tiempo medio de atención por hora', { sub: 'Variaciones durante el día.', height: 240 });
      const hrs = U.range(24, (x) => x).filter((x) => R.shareAll[x] > 0.002);
      C.bars(ah.chartEl, { categories: hrs.map((x) => U.fmtHour(x)), yName: 'Minutos', series: [{ name: 'TMO', data: hrs.map((x) => +R.ahtHour[x].toFixed(2)) }], tooltip: (ps) => `${ps[0].name}<br><b>${U.fmtTime(ps[0].value)}</b>` });
      ah.setTable(() => ({ headers: ['Hora', { t: 'TMO', num: true }], rows: hrs.map((x) => [U.fmtHour(x), U.fmtTime(R.ahtHour[x])]) }));
      E.body.appendChild(h('div', { class: 'cols-2' }, ac.el, ah.el));
    }
    // eventos
    const ev = UI.card('Eventos, feriados y temporadas periódicas', { sub: 'Efecto medido sobre lo esperado por tendencia, mes y día de la semana. Activa los que aplican a tu negocio o agrega los tuyos; se usan en el pronóstico.' });
    ev.body.appendChild(UI.table(['Usar', 'Evento', { t: 'Días observados', num: true }, { t: 'Efecto', num: true }, { t: 'Días cerrado', num: true }],
      R.eventStats.map((x, i) => {
        const cb = h('input', { type: 'checkbox', checked: S.events[i].on, 'aria-label': 'Usar ' + x.name });
        cb.addEventListener('change', () => { S.events[i].on = cb.checked; reanalyze(); });
        return [cb, x.name, x.obs, isFinite(x.lift) ? (x.lift >= 1 ? '+' : '') + U.fmtPct(x.lift - 1) : '—', x.closed];
      }), { compact: true }));
    const nm = UI.text({ label: 'Nuevo evento', placeholder: 'Ej.: Feria anual' }), f1 = UI.text({ label: 'Desde (mm-dd)', placeholder: '09-10' }), f2 = UI.text({ label: 'Hasta (mm-dd)', placeholder: '09-16' });
    ev.body.appendChild(UI.grid(4, nm.el, f1.el, f2.el, h('div', { class: 'field' }, h('span', { class: 'lbl' }, ' '), UI.btn('Agregar evento', () => {
      const ok = /^\d{2}-\d{2}$/.test(f1.get()) && /^\d{2}-\d{2}$/.test(f2.get() || f1.get());
      if (!nm.get() || !ok) { U.toast('Escribe un nombre y fechas en formato mm-dd.', 'warn'); return; }
      S.events.push({ id: 'u' + Date.now(), name: nm.get(), kind: 'fixed', from: f1.get(), to: f2.get() || f1.get(), on: true }); reanalyze();
    }, 'btn-sm'))));
    E.body.appendChild(ev.el);
    E.body.appendChild(h('div', { class: 'row' }, UI.btn('Ver distribuciones', () => go('dist'), 'btn-ghost'), UI.btn('Ir al pronóstico', () => go('forecast'), 'btn-primary')));
  }
  function reanalyze() { analyze(); render(); U.toast('Análisis actualizado con los eventos seleccionados.', 'ok'); }

  /* ======================= 4. Distribuciones ======================= */
  function rDist() {
    const ds = S.ds; const R = S.R;
    const fit = AN.fit(ds.samples.svc);
    if (fit) {
      const best = fit.fits[0];
      E.body.appendChild(h('div', { class: 'kpis' },
        UI.tile('Observaciones', U.fmtInt(fit.n), 'muestra aleatoria de tiempos de atención'),
        UI.tile('Media', U.fmtTime(fit.mean), `mediana ${U.fmtTime(fit.median)}`),
        UI.tile('Coeficiente de variación', U.fmt(fit.cv, 2), fit.cv < 0.8 ? 'menos variable que exponencial' : fit.cv > 1.2 ? 'más variable que exponencial' : 'cercano a exponencial (CV = 1)'),
        UI.tile('P90', U.fmtTime(fit.p90), 'el 90 % termina antes'),
        UI.tile('Mejor ajuste (AIC)', best.name, `KS D = ${U.fmt(best.D, 3)}`, { state: 'good' })));
      const H = C.histogram(fit.sorted, 45, 0.99);
      const hc = UI.chartCard('Tiempos de atención y distribuciones ajustadas', { sub: 'Histograma de los datos y densidades de las tres mejores distribuciones (máxima verosimilitud).', height: 320 });
      const mids = H.edges.slice(0, -1).map((e, i) => (e + H.edges[i + 1]) / 2);
      C.hist(hc.chartEl, { edges: H.edges, dens: H.dens, xName: 'Minutos', name: 'Datos', xLabel: (x) => U.fmtTime(x), overlays: fit.fits.slice(0, 3).map((f) => ({ name: f.name, data: mids.map((x) => [x, +f.pdf(x).toFixed(5)]) })) });
      hc.setTable(() => ({ headers: ['Desde', 'Hasta', { t: 'Densidad observada', num: true }].concat(fit.fits.slice(0, 3).map((f) => ({ t: f.name, num: true }))), rows: mids.map((x, i) => [U.fmtTime(H.edges[i]), U.fmtTime(H.edges[i + 1]), U.fmt(H.dens[i], 4)].concat(fit.fits.slice(0, 3).map((f) => U.fmt(f.pdf(x), 4)))) }));
      E.body.appendChild(hc.el);
      const tc = UI.card('Comparación de ajustes', { sub: 'Menor AIC = mejor equilibrio entre ajuste y complejidad. ΔAIC < 2: prácticamente equivalentes. El valor p de KS es optimista porque los parámetros se estiman con los mismos datos.' });
      tc.body.appendChild(UI.table(['Distribución', { t: 'AIC', num: true }, { t: 'ΔAIC', num: true }, { t: 'KS D', num: true }, { t: 'p (KS)', num: true }, 'Parámetros', ''],
        fit.fits.map((f) => [f.name, U.fmt(f.aic, 1), U.fmt(f.dAIC, 1), U.fmt(f.D, 4), f.p < 0.001 ? '< 0,001' : U.fmt(f.p, 3), QS.Dist.describe(f.spec), UI.btn('Usar en simulador', () => useInSim(f.spec, f.name), 'btn-ghost btn-sm')]),
        { compact: true, rowClass: (x, i) => (i === 0 ? 'hl' : '') }));
      tc.body.appendChild(h('div', { class: 'row' }, UI.btn('Usar distribución empírica en el simulador', () => useInSim({ type: 'emp', data: ds.samples.svc.slice(0, 20000) }, 'Empírica'), 'btn-sm'),
        UI.btn('Usar TMO en Dimensionamiento', () => { QS.StaffUI.load({ aht: +fit.mean.toFixed(3), ahtUnit: 'min' }); QS.App.go('personal'); }, 'btn-sm')));
      E.body.appendChild(tc.el);
    } else {
      E.body.appendChild(UI.note(ds.has.svc ? 'Los datos traen tiempos promedio por intervalo, no tiempos individuales: no es posible ajustar la distribución. Se usará el promedio (TMO) y, por defecto, servicio exponencial (Erlang C). Para ajustar distribuciones carga datos transaccionales.' : 'No hay tiempos de atención en los datos. Puedes indicar el TMO manualmente en el plan de personal.', 'info'));
    }
    // llegadas
    const at = AN.arrivalTests(ds);
    const ac = UI.card('¿Las llegadas son de Poisson?', { sub: 'Supuesto central de Erlang C/A y de los modelos M/·/·. Se verifica con la dispersión de los conteos por hora y, si hay datos individuales, con el teorema de reescalamiento del tiempo.' });
    if (at.dispersion) {
      const d = at.dispersion; const st = d.median < 1.3 ? 'good' : d.median < 2 ? 'warn' : 'bad';
      ac.body.appendChild(h('div', { class: 'kpis' }, UI.tile('Índice de dispersión (mediana)', U.fmt(d.median, 2), 'varianza / media de los conteos por hora en días comparables', { state: st }), UI.tile('Celdas analizadas', U.fmtInt(d.cells), `${U.fmtPct(d.inRange, 0)} entre 0,6 y 1,6`)));
      ac.body.appendChild(UI.note(d.median < 1.3 ? 'Dentro de cada hora las llegadas se comportan como Poisson: los modelos de Erlang son apropiados.' : 'La demanda varía entre días más de lo que explicaría un proceso de Poisson (sobredispersión). Es normal en comercio: usa un nivel de cobertura P75 o P90 en el plan de personal para protegerte de los días más cargados.', st === 'good' ? 'good' : 'warn'));
      const Hd = C.histogram(d.values.filter((x) => x < 6), 30, 0.99);
      const dc = UI.chartCard('Distribución del índice de dispersión', { sub: '1 = Poisson exacto.', height: 220 });
      C.hist(dc.chartEl, { edges: Hd.edges, dens: Hd.dens, xName: 'Varianza / media', name: 'Celdas' });
      dc.setTable(() => ({ headers: ['Desde', 'Hasta', { t: 'Densidad', num: true }], rows: Hd.dens.map((x, i) => [U.fmt(Hd.edges[i], 2), U.fmt(Hd.edges[i + 1], 2), U.fmt(x, 3)]) }));
      ac.body.appendChild(dc.el);
    }
    if (at.rescaled) {
      const r = at.rescaled; const ok = r.D < r.crit * 3 && Math.abs(r.cv - 1) < 0.2;
      ac.body.appendChild(h('p', { class: 'hint' }, `Tiempos entre llegadas reescalados por la tasa local (${U.fmtInt(r.n)}): media ${U.fmt(r.mean, 3)} (ideal 1), CV ${U.fmt(r.cv, 3)} (ideal 1), KS D = ${U.fmt(r.D, 4)}. ${ok ? 'Compatible con un proceso de Poisson no homogéneo.' : 'Se aparta del proceso de Poisson: revisa llegadas en grupo o registros duplicados.'}`));
    }
    if (!at.dispersion && !at.rescaled) ac.body.appendChild(h('p', { class: 'hint' }, 'Se necesita detalle por hora para esta prueba.'));
    E.body.appendChild(ac.el);
    if (ds.samples.wq.length > 30 || ds.samples.ab.length > 10) {
      const wc = UI.card('Esperas y abandonos observados');
      const w = ds.samples.wq; const ab = ds.samples.ab;
      wc.body.appendChild(h('div', { class: 'kpis' },
        w.length ? UI.tile('Espera media', U.fmtTime(U.mean(w)), `P90 ${U.fmtTime(U.quantile(w, 0.9))}`) : null,
        isFinite(R.abRate) ? UI.tile('Tasa de abandono', U.fmtPct(R.abRate), 'abandonos / llegadas') : null,
        ab.length ? UI.tile('Tiempo hasta abandonar', U.fmtTime(U.mean(ab)), 'media de quienes abandonaron (cota inferior de la paciencia)') : null));
      E.body.appendChild(wc.el);
    }
  }
  function useInSim(spec, name) {
    const sp = QS.SimUI.getSpec(); sp.stages[0].svc = spec; QS.SimUI.load(sp, { toast: false }); QS.App.go('sim');
    U.toast(`Servicio de la primera etapa: ${name}.`, 'ok');
  }

  /* ======================= 5. Pronóstico ======================= */
  function rForecast() {
    const R = S.R, fc = S.fc;
    if (!fc) { E.body.appendChild(UI.note('No hay suficientes datos para pronosticar.', 'warn')); return; }
    const ev = fc.ev;
    const tiles = [UI.tile('Método elegido', fc.recon ? 'Holt-Winters + armónico' : 'Regresión armónica', fc.method), UI.tile('Error dentro de muestra', U.fmtPct(fc.inMape), 'MAPE diario')];
    if (ev.ok) {
      tiles.push(UI.tile('Error en el año de validación', U.fmtPct(Math.min(ev.harm.mape, ev.hw ? ev.hw.mape : Infinity)), 'MAPE mensual fuera de muestra', { state: 'good' }));
      tiles.push(UI.tile('Mejora vs método ingenuo', U.fmtPct(1 - Math.min(ev.harm.mape, ev.hw ? ev.hw.mape : Infinity) / ev.naive.mape), `ingenuo: ${U.fmtPct(ev.naive.mape)}`));
    }
    E.body.appendChild(h('div', { class: 'kpis' }, tiles));
    if (ev.ok) {
      const vc = UI.chartCard('Validación: últimos 12 meses fuera de muestra', { sub: 'Cada método se ajustó sin ver este año y se comparó con lo real (promedio diario por mes).', height: 280 });
      const ser = [{ name: 'Real', data: ev.act.map((x) => +x.toFixed(1)), width: 3 }, { name: `Armónico (MAPE ${U.fmtPct(ev.harm.mape)})`, data: ev.harm.pred.map((x) => +x.toFixed(1)) }];
      if (ev.hw) ser.push({ name: `Holt-Winters (MAPE ${U.fmtPct(ev.hw.mape)})`, data: ev.hw.pred.map((x) => +x.toFixed(1)) });
      ser.push({ name: `Ingenuo estacional (MAPE ${U.fmtPct(ev.naive.mape)})`, data: ev.naive.pred.map((x) => (isFinite(x) ? +x.toFixed(1) : null)), dashed: true });
      C.lines(vc.chartEl, { categories: ev.months, yName: 'Clientes por día', series: ser.map((s, i) => Object.assign({ symbols: true, ci: i }, s)), vf: (v) => U.fmt(v, 0) });
      vc.setTable(() => ({ headers: ['Mes', { t: 'Real', num: true }, { t: 'Armónico', num: true }, { t: 'Holt-Winters', num: true }, { t: 'Ingenuo', num: true }], rows: ev.months.map((m, i) => [m, U.fmt(ev.act[i], 1), U.fmt(ev.harm.pred[i], 1), ev.hw ? U.fmt(ev.hw.pred[i], 1) : '—', U.fmt(ev.naive.pred[i], 1)]) }));
      E.body.appendChild(vc.el);
    } else E.body.appendChild(UI.note(ev.reason || 'Validación no disponible.', 'info'));
    // historia + pronóstico mensual
    const keys = []; const hist = [], fut = [], lo = [], hi = [];
    R.months.forEach((mo) => { keys.push(`${U.MESES[mo.m - 1]} ${mo.y}`); hist.push(mo.partial ? null : +mo.avg.toFixed(1)); fut.push(null); lo.push(null); hi.push(null); });
    const fm = new Map();
    for (const d of fc.daily.values()) { if (d.closed) continue; const inf = U.dayInfo(d.k); const key = inf.y * 12 + inf.m - 1; const a = fm.get(key) || [0, 0, 0, 0]; a[0] += d.yhat; a[1] += d.lo; a[2] += d.hi; a[3]++; fm.set(key, a); }
    for (const [key, a] of [...fm.entries()].sort((x, y) => x[0] - y[0])) {
      const yy = Math.floor(key / 12), m = key % 12; const lbl = `${U.MESES[m]} ${yy}`; let i = keys.indexOf(lbl);
      if (i < 0) { keys.push(lbl); hist.push(null); fut.push(null); lo.push(null); hi.push(null); i = keys.length - 1; }
      if (hist[i] == null) { fut[i] = +(a[0] / a[3]).toFixed(1); lo[i] = +(a[1] / a[3]).toFixed(1); hi[i] = +(a[2] / a[3]).toFixed(1); }
    }
    const lastH = hist.map((x, i) => (x != null ? i : -1)).filter((i) => i >= 0).pop(); if (lastH != null && lastH + 1 < fut.length) fut[lastH] = hist[lastH];
    const pc = UI.chartCard('Historia y pronóstico mensual', { sub: 'Promedio de clientes por día abierto. La banda es el intervalo de predicción del 90 %.', height: 320 });
    C.mount(pc.chartEl, (t) => {
      const o = C.base(t, { zoom: true }); o.xAxis = C.xCat(t, keys, { gap: false }); o.yAxis = C.yVal(t, { name: 'Clientes por día' });
      o.series = [
        { type: 'line', name: 'Límite inferior', data: lo, stack: 'banda', lineStyle: { opacity: 0 }, symbol: 'none', silent: true, tooltip: { show: false } },
        { type: 'line', name: 'Intervalo 90 %', data: hi.map((x, i) => (x != null && lo[i] != null ? +(x - lo[i]).toFixed(1) : null)), stack: 'banda', lineStyle: { opacity: 0 }, symbol: 'none', areaStyle: { color: t.pal[1], opacity: 0.14 }, silent: true },
        C.line(t, 'Histórico', hist, 0), C.line(t, 'Pronóstico', fut, 1, { symbols: true })];
      o.legend.data = ['Histórico', 'Pronóstico', 'Intervalo 90 %'];
      o.tooltip.formatter = (ps) => `${ps[0].name}<br>` + ps.filter((p) => p.seriesName === 'Histórico' || p.seriesName === 'Pronóstico').filter((p) => p.value != null).map((p) => `${p.marker}${p.seriesName}: <b>${U.fmt(p.value, 0)}</b>`).join('<br>');
      return o;
    });
    pc.setTable(() => ({ headers: ['Mes', { t: 'Histórico', num: true }, { t: 'Pronóstico', num: true }, { t: 'Mín. 90 %', num: true }, { t: 'Máx. 90 %', num: true }], rows: keys.map((k, i) => [k, U.fmt(hist[i], 1), U.fmt(fut[i], 1), U.fmt(lo[i], 1), U.fmt(hi[i], 1)]) }));
    E.body.appendChild(pc.el);
    // diario del año a planificar
    const yP = S.P.planYear;
    const dpts = []; for (let k = U.dayKey(yP, 1, 1); k <= U.dayKey(yP, 12, 31); k++) { const d = fc.daily.get(k); if (d) dpts.push([k * U.DAY, d.closed ? 0 : +d.yhat.toFixed(1), R.evMap.has(k) || AN.eventMap(S.events, yP, yP).has(k)]); }
    if (dpts.length) {
      const evm = AN.eventMap(S.events, yP, yP); const evName = (k) => { const id = evm.get(k); const e = S.events.find((x) => x.id === id); return e ? e.name : ''; };
      const dd = UI.chartCard(`Pronóstico diario ${yP}`, { sub: 'Los puntos marcan eventos y feriados activos; los días en cero son cierres.', height: 300 });
      C.mount(dd.chartEl, (t) => {
        const o = C.base(t, { zoom: true, legend: false }); o.xAxis = C.xTime(t); o.yAxis = C.yVal(t, { name: 'Clientes por día' });
        o.series = [C.line(t, 'Pronóstico', dpts.map((p) => [p[0], p[1]]), 1, { width: 1.5 }),
          { type: 'scatter', name: 'Eventos', data: dpts.filter((p) => evm.has(Math.round(p[0] / U.DAY))).map((p) => [p[0], p[1]]), symbolSize: 8, itemStyle: { color: t.season.Evento, borderColor: t.surface, borderWidth: 2 } }];
        o.tooltip.formatter = (ps) => { const k = Math.round(ps[0].value[0] / U.DAY); return `${U.DIAS_L[U.dayInfo(k).dow]} ${U.fmtDay(k)}<br><b>${U.fmtInt(ps[0].value[1])}</b> clientes${evm.has(k) ? '<br>' + evName(k) : ''}`; };
        return o;
      });
      dd.setTable(() => ({ headers: ['Fecha', { t: 'Pronóstico', num: true }, 'Evento'], rows: dpts.map((p) => { const k = Math.round(p[0] / U.DAY); return [U.fmtDay(k), U.fmtInt(p[1]), evm.has(k) ? evName(k) : '']; }) }));
      E.body.appendChild(dd.el);
    }
    // integración con Prophet
    const pr = UI.card('Pronóstico avanzado con Prophet (opcional)', { sub: 'Para análisis más profundos puedes usar Prophet (código abierto de Meta) con feriados oficiales de tu país y volver a importar su resultado.' });
    const file = h('input', { type: 'file', accept: '.csv,.txt', hidden: true });
    file.addEventListener('change', async () => {
      const f = file.files[0]; if (!f) return; file.value = '';
      const res = root.Papa.parse(await f.text(), { header: true, skipEmptyLines: true });
      const m = new Map(); for (const r of res.data) { const p = D.parseDate(r.ds || r.fecha, 'DMY'); const v = parseFloat(String(r.yhat != null ? r.yhat : r.pronostico).replace(',', '.')); if (p && isFinite(v)) m.set(p.k, Math.max(0, v)); }
      if (!m.size) { U.toast('El archivo debe tener columnas ds (fecha) y yhat (pronóstico).', 'warn'); return; }
      S.external = m; analyze(); render(); U.toast(`Se usan ${m.size} días del pronóstico externo.`, 'ok');
    });
    pr.body.appendChild(h('div', { class: 'row' },
      UI.btn('1. Exportar demanda diaria (CSV)', () => {
        const rows = []; for (let i = 0; i < R.N; i++) rows.push([U.isoDay(R.k0 + i), R.y[i]]);
        U.saveFile('demanda_diaria.csv', U.toCSV(['ds', 'y'], rows, { sep: ',' }), 'text/csv');
      }, 'btn-sm'),
      UI.btn('2. Script de Prophet (Python)', () => {
        const evs = []; for (const e of S.events.filter((x) => x.on)) for (let y = U.dayInfo(R.k0).y; y <= S.P.planYear; y++) for (const k of AN.eventDays(e, y)) evs.push({ name: e.name, ds: U.isoDay(k) });
        UI.codeModal('Pronóstico con Prophet', QS.Export.prophet({ file: 'demanda_diaria.csv', events: evs, horizon: Math.max(30, U.dayKey(S.P.planYear, 12, 31) - R.k1), country: 'MX' }), 'pronostico_prophet.py',
          'Instala con "pip install prophet pandas", coloca demanda_diaria.csv junto al script y ejecútalo. Cambia el país de los feriados si no estás en México.');
      }, 'btn-sm'),
      UI.btn('3. Importar pronostico_prophet.csv', () => file.click(), 'btn-sm'), file,
      S.external ? UI.btn('Quitar pronóstico externo', () => { S.external = null; analyze(); render(); }, 'btn-ghost btn-sm') : null));
    if (S.external) pr.body.appendChild(UI.note(`Pronóstico externo activo para ${S.external.size} días.`, 'good'));
    E.body.appendChild(pr.el);
    E.body.appendChild(h('div', { class: 'row' }, UI.btn('Calcular el plan de personal', () => go('plan'), 'btn-primary')));
  }

  /* ======================= 6. Plan de personal ======================= */
  function rPlan() {
    const R = S.R, P = S.P;
    const yEnd = U.dayInfo(R.k1).y;
    const set = UI.card('Parámetros del plan', { sub: 'Se calcula una semana típica por mes con la demanda pronosticada, Erlang por hora, merma y turnos óptimos.' });
    const ch = (k) => (v) => { P[k] = v; saveP(); S.plan = null; };
    set.body.appendChild(UI.grid(4,
      UI.select({ label: 'Año a planificar', value: P.planYear, options: [yEnd, yEnd + 1].map((y) => [y, String(y)]), onChange: (v) => { P.planYear = +v; saveP(); S.plan = null; } }).el,
      UI.select({ label: 'Cobertura de la demanda', value: P.coverage, options: [['mean', 'Promedio'], ['p75', 'Percentil 75'], ['p90', 'Percentil 90'], ['p95', 'Percentil 95']], help: 'Protege contra días más cargados que el pronóstico: P90 significa que el personal alcanza en 9 de cada 10 días.', onChange: ch('coverage') }).el,
      UI.num({ label: 'Meta: % atendido antes de T', unit: '%', value: P.pct, min: 1, max: 99.9, onInput: ch('pct') }).el,
      UI.num({ label: 'T (espera máxima)', unit: 'min', value: P.tVal, min: 0, onInput: ch('tVal') }).el,
      UI.num({ label: 'Ocupación máxima', unit: '%', value: P.maxOcc, min: 1, max: 100, onInput: ch('maxOcc') }).el,
      UI.num({ label: 'Paciencia media (0 = Erlang C)', unit: 'min', value: P.patience, min: 0, onInput: ch('patience') }).el,
      UI.num({ label: 'Merma (shrinkage)', unit: '%', value: P.shrink, min: 0, max: 80, onInput: ch('shrink') }).el,
      UI.select({ label: 'Tiempo de atención', value: P.ahtMode, options: [['data', isFinite(R.aht) ? `De los datos (${U.fmtTime(R.aht)})` : 'De los datos (no disponible)'], ['manual', 'Manual']], onChange: (v) => { P.ahtMode = v; saveP(); S.plan = null; render(); } }).el,
      P.ahtMode === 'manual' || !isFinite(R.aht) ? UI.num({ label: 'TMO manual', unit: 'min', value: P.ahtManual, min: 0.1, onInput: ch('ahtManual') }).el : null,
      UI.num({ label: 'Jornada completa', unit: 'h', value: P.ftLen, min: 1, max: 12, onInput: ch('ftLen') }).el,
      UI.num({ label: 'Medio tiempo', unit: 'h', value: P.ptLen, min: 1, max: 8, onInput: ch('ptLen') }).el,
      UI.num({ label: 'Máx. horas a medio tiempo', unit: '%', value: P.maxPT, min: 0, max: 100, onInput: ch('maxPT') }).el,
      UI.num({ label: 'Costo hora jornada completa', value: P.ftCost, min: 0, onInput: ch('ftCost') }).el,
      UI.num({ label: 'Costo hora medio tiempo', value: P.ptCost, min: 0, onInput: ch('ptCost') }).el,
      UI.num({ label: 'Días laborables por persona', unit: '/semana', value: P.daysFT, min: 1, max: 7, step: 1, onInput: ch('daysFT') }).el,
      UI.num({ label: 'Horas de contrato', unit: '/semana', value: P.weekHours, min: 1, onInput: ch('weekHours') }).el,
      UI.select({ label: 'Plantilla base (permanente)', value: P.basePolicy, options: [['min', 'La del mes más bajo'], ['p25', 'Percentil 25 de los meses'], ['mean', 'Promedio de los meses']], help: 'El personal base se contrata todo el año; el resto se cubre con temporales, horas extra o vacaciones en meses bajos.', onChange: ch('basePolicy') }).el));
    const prog = UI.progress();
    set.body.appendChild(h('div', { class: 'row' }, UI.btn('Calcular plan', () => buildPlan(prog), 'btn-primary'), prog.el));
    E.body.appendChild(set.el);
    E.planOut = h('div', { class: 'results' });
    E.body.appendChild(E.planOut);
    if (S.plan) renderPlan(); else buildPlan(prog);
  }
  async function buildPlan(prog) {
    const R = S.R, P = S.P;
    const evDays = new Map();
    for (const ev of S.events.filter((e) => e.on)) { const st = R.eventStats.find((x) => x.id === ev.id); for (const k of AN.eventDays(ev, P.planYear)) evDays.set(k, { name: ev.name, lift: st && isFinite(st.lift) ? st.lift : 1 }); }
    const cfg = {
      kFrom: U.dayKey(P.planYear, 1, 1), kTo: U.dayKey(P.planYear, 12, 31), coverage: P.coverage, ahtMode: isFinite(R.aht) ? P.ahtMode : 'manual', ahtManual: P.ahtManual,
      staff: { target: { type: 'sl', pct: P.pct / 100, tMin: P.tVal }, maxOcc: P.maxOcc / 100, patienceMin: P.patience },
      shrink: P.shrink / 100, shift: { ftLen: P.ftLen, ptLen: P.ptLen, allowPT: P.allowPT, ftCost: P.ftCost, ptCost: P.ptCost, maxPT: P.maxPT / 100, startEvery: 60 },
      weekHours: P.weekHours, daysFT: P.daysFT, seasons: seasonsNow(), basePolicy: P.basePolicy, evDays
    };
    if (U.dayKey(P.planYear, 12, 31) > S.fc.kEnd) S.fc = FC.run(R, { external: S.external, kEnd: U.dayKey(P.planYear, 12, 31) });
    prog.set(0, 'Calculando…');
    S.plan = await FC.plan(R, S.fc, cfg, (f) => prog.set(f, `Mes ${Math.round(f * 12)} de 12`));
    prog.set(1, 'Plan listo');
    renderPlan();
  }
  function renderPlan() {
    const pl = S.plan, R = S.R, P = S.P; U.clear(E.planOut); C.prune();
    const ms = pl.months; const cur = P.cur;
    const peak = ms.reduce((b, m) => (m.total > b.total ? m : b), ms[0]);
    const annual = ms.reduce((s, m) => s + m.costMonth, 0);
    const peakAg = ms.reduce((b, m) => (m.peakAg > b.peakAg ? m : b), ms[0]);
    E.planOut.appendChild(h('div', { class: 'kpis' },
      UI.tile('Plantilla base todo el año', `${pl.base} personas`, 'contratación permanente', { state: 'good' }),
      UI.tile('Plantilla máxima', `${peak.total} personas`, `${U.MESES_L[peak.m - 1]} (${peak.season})`),
      UI.tile('Temporales en el pico', `${peak.temp} personas`, `${U.MESES_L[peak.m - 1]}`, { state: peak.temp > 0 ? 'warn' : null }),
      UI.tile('FTE promedio', U.fmt(U.mean(ms.map((m) => m.fte)), 1), `de ${P.weekHours} h/semana`),
      UI.tile('Agentes simultáneos en la hora pico', U.fmtInt(peakAg.peakAg), `${U.MESES_L[peakAg.m - 1]} · ${U.fmt(peakAg.peakLam, 0)} clientes/h`),
      UI.tile('Costo anual de personal', U.fmtMoney(annual, cur), `cobertura ×${U.fmt(pl.cov, 3)} sobre el pronóstico`)));
    const hc = UI.chartCard(`Plantilla requerida por mes · ${P.planYear}`, { sub: 'Personas necesarias (jornada completa + medio tiempo): base permanente y temporales.', height: 300 });
    C.mount(hc.chartEl, (t) => {
      const o = C.base(t, { pointer: 'shadow' }); o.xAxis = C.xCat(t, ms.map((m) => U.MESES[m.m - 1])); o.yAxis = C.yVal(t, { name: 'Personas' });
      o.series = [C.bar(t, 'Base permanente', ms.map((m) => Math.min(m.total, pl.base)), 0, { stack: 'p' }), C.bar(t, 'Temporales', ms.map((m) => m.temp), 1, { stack: 'p' }),
        C.line(t, 'FTE', ms.map((m) => +m.fte.toFixed(1)), 2, { symbols: true })];
      o.tooltip.formatter = (ps) => { const m = ms[ps[0].dataIndex]; return `${U.MESES_L[m.m - 1]} · temporada ${m.season}<br>` + ps.map((p) => `${p.marker}${p.seriesName}: <b>${U.fmt(p.value, 1)}</b>`).join('<br>') + `<br>FT ${m.nFT} · PT ${m.nPT}`; };
      return o;
    });
    hc.setTable(() => ({ headers: ['Mes', 'Temporada', { t: 'Personas', num: true }, { t: 'Base', num: true }, { t: 'Temporales', num: true }, { t: 'FTE', num: true }], rows: ms.map((m) => [U.MESES_L[m.m - 1], m.season, m.total, Math.min(m.total, pl.base), m.temp, U.fmt(m.fte, 1)]) }));
    E.planOut.appendChild(hc.el);
    // resumen por temporada
    const seasons = ['Alta', 'Normal', 'Baja'].map((s) => { const xs = ms.filter((m) => m.season === s); return xs.length ? [s, xs.map((m) => U.MESES[m.m - 1]).join(', '), U.fmt(U.mean(xs.map((m) => m.avgDay)), 0), Math.max(...xs.map((m) => m.peakAg)), U.fmt(U.mean(xs.map((m) => m.total)), 1), Math.max(...xs.map((m) => m.total)), Math.max(...xs.map((m) => m.temp))] : null; }).filter(Boolean);
    const sc = UI.card('Resumen por temporada');
    sc.body.appendChild(UI.table(['Temporada', 'Meses', { t: 'Clientes/día', num: true }, { t: 'Agentes pico', num: true }, { t: 'Personas (prom.)', num: true }, { t: 'Personas (máx.)', num: true }, { t: 'Temporales (máx.)', num: true }], seasons, { compact: true }));
    const mt = UI.card('Detalle mensual', { actions: [UI.btn('Exportar CSV', exportPlan, 'btn-ghost btn-sm')] });
    mt.body.appendChild(UI.table(['Mes', 'Temporada', { t: 'Clientes/día', num: true }, { t: 'Pico λ/h', num: true }, { t: 'Agentes pico', num: true }, { t: 'Horas/semana', num: true }, { t: 'FTE', num: true }, { t: 'FT + PT', num: true }, { t: 'Temporales', num: true }, { t: 'Costo mensual', num: true }],
      ms.map((m) => [U.MESES_L[m.m - 1], m.season, U.fmt(m.avgDay, 0), U.fmt(m.peakLam, 0), m.peakAg, U.fmt(m.weekHours, 0), U.fmt(m.fte, 1), `${m.nFT} + ${m.nPT}`, m.temp, U.fmtMoney(m.costMonth, cur)]),
      { compact: true, rowClass: (x, i) => (ms[i].season === 'Alta' ? 'warn' : '') }));
    E.planOut.appendChild(sc.el); E.planOut.appendChild(mt.el);
    // eventos
    if (pl.events.length) {
      const ec = UI.card('Refuerzos para eventos y fechas especiales', { sub: 'Agentes en la hora pico del evento frente a un día normal del mismo mes y día de la semana.' });
      ec.body.appendChild(UI.table(['Fecha', 'Evento', { t: 'Demanda', num: true }, { t: 'Agentes pico', num: true }, { t: 'Día normal', num: true }, { t: 'Refuerzo', num: true }, { t: 'Horas', num: true }],
        pl.events.map((e) => [`${U.DIAS[U.dayInfo(e.k).dow]} ${U.fmtDay(e.k)}`, e.name, U.fmtInt(e.vol), e.peakAg, e.regPeak, e.extraPeak > 0 ? '+' + e.extraPeak : String(e.extraPeak), U.fmt(e.hours, 0)]),
        { compact: true, rowClass: (x, i) => (pl.events[i].extraPeak > 0 ? 'warn' : '') }));
      E.planOut.appendChild(ec.el);
    }
    // semana típica de un mes
    const wk = UI.card('Semana típica del mes', { sub: 'Agentes requeridos en piso por día y hora (antes de merma).' });
    const msel = UI.select({ label: 'Mes', value: S.planMonth, options: ms.map((m, i) => [i, `${U.MESES_L[m.m - 1]} (${m.season})`]), onChange: (v) => { S.planMonth = +v; drawWeek(); } });
    const dsel = UI.select({ label: 'Día para enviar o comparar', value: S.planDow, options: U.DIAS_L.map((d, i) => [i, d]), onChange: (v) => { S.planDow = +v; drawCmp(); } });
    const heatEl = h('div', { class: 'chart', style: { height: '300px' } });
    const cmpEl = h('div', { class: 'chart', style: { height: '280px' } });
    wk.body.appendChild(UI.grid(2, msel.el, dsel.el)); wk.body.appendChild(heatEl);
    wk.body.appendChild(h('div', { class: 'row' },
      UI.btn('Enviar este día a Dimensionamiento', sendToStaff, 'btn-sm'), UI.btn('Simular este día', simulateDay, 'btn-primary btn-sm'),
      UI.btn('Exportar semana a pyworkforce', exportWeekPyW, 'btn-ghost btn-sm')));
    wk.body.appendChild(cmpEl);
    E.planOut.appendChild(wk.el);
    const hoursRange = () => { const lo = Math.min(...R.openHours.filter(Boolean).map((x) => x[0])), hi = Math.max(...R.openHours.filter(Boolean).map((x) => x[1])); return U.range(hi - lo, (i) => lo + i); };
    const drawWeek = () => {
      const m = ms[S.planMonth] || ms[0]; const hrs = hoursRange(); const data = [];
      for (let w = 0; w < 7; w++) hrs.forEach((hh, j) => data.push([j, w, m.grid[w][hh] || 0]));
      C.heat(heatEl, { rows: U.DIAS, cols: hrs.map((x) => U.fmtHour(x)), data, unit: 'agentes', labels: true });
      drawCmp();
    };
    const drawCmp = () => {
      const m = ms[S.planMonth] || ms[0]; const w = S.planDow; const hrs = hoursRange(); const day = m.days[w];
      const req = hrs.map((hh) => m.grid[w][hh] || 0);
      const sched = hrs.map((hh) => (day && day.sched && hh >= day.open && hh < day.open + day.sched.length ? day.sched[hh - day.open] : 0));
      const cover = hrs.map((hh) => (day && day.cover && hh >= day.open && hh < day.open + day.cover.length ? day.cover[hh - day.open] : 0));
      const ser = [{ name: 'Requeridos (Erlang)', data: req, step: 'middle' }, { name: 'Con merma', data: sched, step: 'middle' }, { name: 'Cubiertos por turnos', data: cover, step: 'middle', area: true }];
      // personal histórico del mismo mes y día
      if (S.ds.has.srv) {
        const sum = new Float64Array(24), n = new Float64Array(24);
        for (const d of S.ds.days) if (d.m === m.m && d.dow === w && d.arr) for (let hh = 0; hh < 24; hh++) if (d.srvN[hh] > 0) { sum[hh] += d.srvSum[hh] / d.srvN[hh]; n[hh]++; }
        ser.push({ name: 'Personal histórico (promedio)', data: hrs.map((hh) => (n[hh] ? +(sum[hh] / n[hh]).toFixed(2) : null)), dashed: true });
      }
      C.lines(cmpEl, { categories: hrs.map((x) => U.fmtHour(x)), yName: `Agentes · ${U.DIAS_L[w]} de ${U.MESES_L[m.m - 1].toLowerCase()}`, series: ser });
    };
    drawWeek();
    // nivel de servicio histórico estimado
    if (S.ds.has.srv && R.heat) {
      const hs = UI.chartCard('Nivel de servicio histórico estimado', { sub: `% de clientes atendidos en ≤ ${U.fmtTime(P.tVal)} con el personal que realmente hubo (Erlang C con la demanda y el TMO de cada hora). Rojo: horas con personal insuficiente.`, height: 300 });
      const hrs = hoursRange(); const data = [];
      for (let w = 0; w < 7; w++) hrs.forEach((hh, j) => {
        const lam = R.heat[w][hh], c = R.srvHist[w][hh], aht = isFinite(R.ahtHour[hh]) ? R.ahtHour[hh] : P.ahtManual;
        let sl = NaN; if (lam > 0 && c > 0) { const r = QS.Analytic.compute('mmc', { lam, mu: 60 / aht, c: Math.max(1, Math.round(c)) }); sl = r.ok ? r.sl(P.tVal / 60) : 0; }
        data.push([j, w, isFinite(sl) ? +(sl * 100).toFixed(0) : null]);
      });
      C.heat(hs.chartEl, { rows: U.DIAS, cols: hrs.map((x) => U.fmtHour(x)), data: data.filter((d) => d[2] != null), unit: '% en meta', min: 0, max: 100, labels: true, colors: (t) => [t.bad, t.dark ? '#383835' : '#f0efec', t.good] });
      hs.setTable(() => ({ headers: ['Día'].concat(hrs.map((x) => ({ t: U.fmtHour(x), num: true }))), rows: U.range(7, (w) => [U.DIAS_L[w]].concat(hrs.map((hh, j) => { const d = data.find((x) => x[0] === j && x[1] === w); return d && d[2] != null ? d[2] + ' %' : '—'; }))) }));
      E.planOut.appendChild(hs.el);
    }
  }
  function dayProfile() {
    const pl = S.plan, R = S.R; const m = pl.months[S.planMonth] || pl.months[0]; const w = S.planDow; const day = m.days[w];
    if (!day || !day.sched || !day.sched.length) { U.toast('Ese día no tiene atención en el plan.', 'warn'); return null; }
    const open = day.open, n = day.sched.length;
    const lam = U.range(n, (i) => m.lamGrid[w][open + i] || 0);
    const aht = U.mean(U.range(n, (i) => (S.P.ahtMode === 'manual' || !isFinite(R.aht) ? S.P.ahtManual : (R.ahtMonth[m.m - 1] || R.aht) * ((R.ahtHour[open + i] || R.aht) / R.aht))));
    return { m, w, day, open, n, lam, aht };
  }
  function sendToStaff() {
    const d = dayProfile(); if (!d) return;
    QS.StaffUI.load({ step: 60, open: d.open * 60, hours: d.n, vols: d.lam.map((x) => +x.toFixed(2)), aht: +d.aht.toFixed(3), ahtUnit: 'min', shrink: S.P.shrink, maxOcc: S.P.maxOcc,
      target: { type: 'sl', pct: S.P.pct, tVal: S.P.tVal, tUnit: 'min', asa: 30, asaUnit: 's', pwait: 30, pab: 5 }, patience: S.P.patience, patUnit: 'min', label: `${U.DIAS_L[d.w]} típico de ${U.MESES_L[d.m.m - 1].toLowerCase()} ${d.m.y}` });
    QS.App.go('personal');
  }
  function simulateDay() {
    const d = dayProfile(); if (!d) return;
    const floor = U.range(d.n, (i) => Math.max(0, Math.round(d.day.cover[i] * (1 - S.P.shrink / 100))));
    const fit = AN.fit(S.ds.samples.svc);
    const svc = fit ? QS.Dist.withMean(fit.fits[0].spec, d.aht) : { type: 'exp', mean: d.aht };
    const spec = QS.Sim.normalize({ name: `${U.DIAS_L[d.w]} típico de ${U.MESES_L[d.m.m - 1].toLowerCase()} ${d.m.y}`, open: d.open * 60,
      arrivals: { mode: 'profile', profile: d.lam.map((x) => +x.toFixed(2)) },
      renege: { on: S.P.patience > 0, dist: { type: 'exp', mean: S.P.patience || 10 } },
      stages: [{ name: 'Servidores', servers: Math.max(1, ...floor), svc, useSchedule: true, schedule: floor }],
      run: { hours: d.n, warmupH: 0, reps: 20, seed: 7, drain: true, slT: S.P.tVal }, cost: { server: S.P.ftCost, wait: 0, lost: 0, cur: S.P.cur } });
    QS.App.go('sim'); QS.SimUI.load(spec, { run: true, play: true });
  }
  function exportPlan() {
    const pl = S.plan;
    const csv = U.toCSV(['mes', 'temporada', 'clientes_por_dia', 'pico_clientes_hora', 'agentes_pico', 'horas_semana', 'fte', 'jornada_completa', 'medio_tiempo', 'personas', 'base', 'temporales', 'costo_mensual'],
      pl.months.map((m) => [`${m.y}-${U.pad2(m.m)}`, m.season, m.avgDay, m.peakLam, m.peakAg, m.weekHours, m.fte, m.nFT, m.nPT, m.total, Math.min(m.total, pl.base), m.temp, m.costMonth]));
    U.saveFile(`plan_personal_${S.P.planYear}.csv`, csv, 'text/csv');
  }
  function exportWeekPyW() {
    const pl = S.plan, R = S.R; const m = pl.months[S.planMonth];
    const lo = Math.min(...R.openHours.filter(Boolean).map((x) => x[0])), hi = Math.max(...R.openHours.filter(Boolean).map((x) => x[1])); const P = hi - lo;
    const required = U.range(7, (w) => U.range(P, (i) => { const d = m.days[w]; const hh = lo + i; return d && d.sched && hh >= d.open && hh < d.open + d.sched.length ? d.sched[hh - d.open] : 0; }));
    const shifts = {}; const costs = {};
    const add = (name, len, cost) => { for (let s = 0; s + len <= P; s++) { const k = `${name} ${U.fmtHour(lo + s)}`; shifts[k] = U.range(P, (i) => (i >= s && i < s + len ? 1 : 0)); costs[k] = cost * len; } };
    add('Completa', Math.round(S.P.ftLen), S.P.ftCost); add('Medio', Math.round(S.P.ptLen), S.P.ptCost);
    UI.codeModal('Semana típica en pyworkforce (Python)', QS.Export.pyworkforce({ required, shifts, costs, title: `semana típica de ${U.MESES_L[m.m - 1].toLowerCase()} ${m.y}, de ${U.fmtHour(lo)} a ${U.fmtHour(hi)}, lunes a domingo` }), `turnos_${U.MESES[m.m - 1].toLowerCase()}_${m.y}.py`,
      'Cada fila es un día (lunes a domingo) y cada columna una hora. pyworkforce asigna turnos con OR-Tools respetando la cobertura mínima.');
  }
})(typeof window !== 'undefined' ? window : globalThis);
