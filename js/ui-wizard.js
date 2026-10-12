/* Asistente "Mi negocio": guía paso a paso desde el giro y los datos disponibles hasta el plan de personal.
   Pensado para que un especialista obtenga resultados con sus propios datos sin perderse en opciones. */
(function (root) {
  'use strict';
  const QS = root.QS; const U = QS.U, h = U.h, UI = QS.UI, D = QS.Data, AN = QS.Analysis, FC = QS.Forecast, ST = QS.Staff, SEC = QS.Sectors, C = QS.Charts;
  const WZ = QS.Wizard = {};
  const STEPS = [['negocio', 'Tu negocio'], ['datos', 'Tus datos'], ['revision', 'Lo que dicen tus datos'], ['metas', 'Meta y costos'], ['plan', 'Tu plan']];
  const COVER = { mean: 'Un día promedio', p75: 'Un día cargado (recomendado)', p90: 'Un día muy cargado' };
  const W = Object.assign({ step: 'negocio', sector: null, area: null, name: '', hours: null, src: null, goals: null, est: null, seasonOv: new Array(12).fill('') }, U.store.get('wz:cfg', {}));
  W.step = W.sector ? (W.step === 'plan' || W.step === 'revision' || W.step === 'metas' ? 'datos' : W.step) : 'negocio';
  const F = { main: null, svc: null, prof: null, hist: null };
  let M = null, PLAN = null, E = {}, busy = false;
  const save = () => U.store.set('wz:cfg', { sector: W.sector, area: W.area, name: W.name, hours: W.hours, src: W.src, goals: W.goals, est: W.est, seasonOv: W.seasonOv, step: W.step, custom: W.custom || null });
  const sec = () => SEC.get(W.sector || 'retail');
  // Área del giro; si los datos vienen de la Medición, con los nombres del proceso del usuario (p. ej. "Facturadoras")
  const area = () => { const a = SEC.area(sec(), W.area); return W.custom ? Object.assign({}, a, W.custom) : a; };
  const T = () => { const a = area(); return { server: a.server, servers: a.servers, servL: a.servers.toLowerCase(), customer: a.customer, customers: a.customer + 's', unit: a.unit }; };

  /* ---------------- valores por defecto del giro ---------------- */
  function applySector(secId, areaId) {
    const s = SEC.get(secId); const a = SEC.area(s, areaId);
    const changedSector = W.sector !== secId;
    W.sector = secId; W.area = a.id; W.custom = null;
    if (changedSector || !W.hours) W.hours = JSON.parse(JSON.stringify(s.hours));
    W.goals = { pct: a.target.pct, tMin: a.target.tMin, patience: a.patience || 0, leave: (a.patience || 0) > 0, coverage: 'p75', shrink: s.staff.shrink, ftLen: 8, ptLen: 4, allowPT: true, maxPT: 30,
      daysFT: 6, weekHours: 48, costFT: s.staff.costHour, costPT: s.staff.ptCost, aht: a.aht, cv: a.cv, maxOcc: 90, year: 0, cur: '$' };
    const wk = U.mean(s.dowIdx.slice(0, 5).filter((x) => x > 0)) || 1;
    const mi = s.monthIdx, mm = U.mean(mi);
    W.est = { dayVol: s.sampleBase, satPct: Math.round((s.dowIdx[5] / wk - 1) * 100), sunPct: Math.round((s.dowIdx[6] / wk - 1) * 100),
      high: Math.round((Math.max(...mi) / mm - 1) * 100), low: Math.round((1 - Math.min(...mi) / mm) * 100),
      months: mi.map((x) => (x / mm >= 1.08 ? 'Alta' : x / mm <= 0.93 ? 'Baja' : 'Normal')) };
    W.seasonOv = new Array(12).fill('');
    M = null; PLAN = null; save();
  }

  /* ---------------- estructura de la vista ---------------- */
  WZ.init = function (view) {
    E.view = view; U.clear(view);
    E.stepper = h('nav', { class: 'stepper', 'aria-label': 'Pasos del asistente' });
    E.body = h('div', { class: 'results' });
    view.appendChild(h('div', { class: 'view-head' }, h('div', null, h('div', { class: 'eyebrow' }, 'Herramientas · planeación por temporada'), h('h2', null, '¿Cuántas personas necesito?'),
      h('p', null, 'Cinco pasos: tu giro, tus datos (con sistema, a mano o con estimaciones), lo que dicen tus datos, tu meta de servicio y tu plan. Puedes volver a cualquier paso.'))));
    view.appendChild(E.stepper); view.appendChild(E.body);
    render();
  };
  WZ.activate = () => C.rerenderAll();
  WZ.go = (step) => { W.step = step; save(); render(); const t = E.view.getBoundingClientRect().top + root.scrollY - 70; root.scrollTo({ top: Math.max(0, t), behavior: 'smooth' }); };
  // Recibe datos capturados con la herramienta "Toma de datos"
  WZ.useCapture = async function (cap) {
    if (!W.sector) applySector('retail');
    W.src = 'manual'; save();
    if (cap.arrivals && cap.arrivals.rows.length) {
      const src = { type: 'rows', headers: cap.arrivals.headers, rows: cap.arrivals.rows, name: 'Conteo con la app' };
      F.main = await prepSlot(src); F.main.kind = 'trans'; F.main.map = { fechahora: 0 }; await processSlot('main');
    }
    if (cap.times && cap.times.rows.length) { F.svc = { name: 'Tiempos con la app', values: cap.times.rows.map((r) => r[3] / 60).filter((x) => x > 0), status: 'listo' }; }
    QS.App.go('asistente'); WZ.go('datos');
    U.toast('Datos de la toma en tienda cargados en el asistente.', 'ok');
  };

  // Recibe la demanda y los tiempos medidos de un área (recorrido de cinco pasos)
  WZ.useMeasured = function (m) {
    if (!W.sector || W.sector !== (m.sector || 'retail')) applySector(m.sector || 'retail');
    W.custom = Object.assign({ name: m.name }, m.terms || {});
    W.src = 'sistema';
    F.main = { name: m.fileName || m.name, src: null, pv: null, kind: 'trans', map: {}, dec: '.', dateOrder: 'DMY', durUnit: 'min', ticket: 0, ds: m.ds, measured: true };
    F.svc = !m.ds.has.svc && m.svcSample && m.svcSample.length >= 10 ? { name: m.quality === 'maximo' ? 'Tiempos de la medición (máximo probable)' : 'Tiempos de la medición', values: m.svcSample.slice() } : null;
    F.prof = null; F.hist = null;
    D.state.ds = m.ds;
    M = null; PLAN = null; save();
    QS.App.go('asistente'); WZ.go('datos');
    U.toast(`Demanda y tiempos medidos de "${m.name}" cargados en el asistente.`, 'ok');
  };

  function renderStepper() {
    U.clear(E.stepper);
    const can = { negocio: true, datos: !!W.sector, revision: !!M, metas: !!M, plan: !!PLAN };
    STEPS.forEach(([id, name], i) => {
      const b = h('button', { type: 'button', class: W.step === id ? 'on' : '', disabled: !can[id], 'aria-current': W.step === id ? 'step' : null }, h('span', { class: 'k' }, String(i + 1)), name);
      b.addEventListener('click', () => WZ.go(id));
      E.stepper.appendChild(b);
    });
  }
  function render() {
    C.prune(); renderStepper(); U.clear(E.body);
    ({ negocio: rNegocio, datos: rDatos, revision: rRevision, metas: rMetas, plan: rPlan })[W.step]();
  }
  const navRow = (back, next, nextLabel, nextOk = true) => h('div', { class: 'wz-nav' },
    back ? UI.btn('← ' + STEPS.find((s) => s[0] === back)[1], () => WZ.go(back), 'btn-ghost') : h('span'),
    next ? UI.btn(nextLabel || 'Siguiente →', typeof next === 'function' ? next : () => WZ.go(next), 'btn-primary', { disabled: !nextOk }) : null);

  /* ======================= 1. Tu negocio ======================= */
  function rNegocio() {
    const c1 = UI.card('¿Qué tipo de negocio es?', { sub: 'Ajusta el vocabulario, las metas típicas, los horarios y las temporadas de tu giro. Todo se puede cambiar después.' });
    c1.body.appendChild(h('div', { class: 'choice-grid' }, SEC.list.map((s) => {
      const b = h('button', { type: 'button', class: 'choice' + (W.sector === s.id ? ' on' : ''), 'aria-pressed': String(W.sector === s.id) }, h('b', null, s.name), h('span', null, s.desc));
      b.addEventListener('click', () => { applySector(s.id); render(); });
      return b;
    })));
    E.body.appendChild(c1.el);
    if (!W.sector) { E.body.appendChild(UI.note('Elige tu giro para continuar. Si no aparece, usa "Otro servicio".', 'info')); return; }
    const s = sec();
    const c2 = UI.card('¿Qué área quieres planear?', { sub: 'Cada área tiene su propia fila y su propio personal; planéalas por separado.' });
    c2.body.appendChild(h('div', { class: 'choice-grid small' }, s.areas.map((a) => {
      const b = h('button', { type: 'button', class: 'choice' + (W.area === a.id ? ' on' : ''), 'aria-pressed': String(W.area === a.id) }, h('b', null, a.name), h('span', null, `Atención típica de ${U.fmtTime(a.aht)} · meta ${a.target.pct} % en menos de ${U.fmtTime(a.target.tMin)}`));
      b.addEventListener('click', () => { applySector(W.sector, a.id); render(); });
      return b;
    })));
    E.body.appendChild(c2.el);
    const c3 = UI.card('Datos generales');
    const time = (label, key) => {
      const id = U.uid('t'); const v = W.hours[key];
      const inp = h('input', { id, type: 'time', value: `${U.pad2(Math.floor(v / 60) % 24)}:${U.pad2(v % 60)}` });
      inp.addEventListener('change', () => { const [a, b] = inp.value.split(':').map(Number); W.hours[key] = (a || 0) * 60 + (b || 0); M = null; PLAN = null; save(); });
      return h('label', { class: 'field', for: id }, h('span', { class: 'lbl' }, label), h('span', { class: 'ctl' }, inp));
    };
    c3.body.appendChild(UI.grid(3, UI.text({ label: 'Nombre de la sucursal o tienda', value: W.name, placeholder: 'Ej.: Tienda Centro', onInput: (v) => { W.name = v; save(); } }).el, time('Abre a las', 'open'), time('Cierra a las', 'close')));
    const days = h('div', { class: 'chips', role: 'group', 'aria-label': 'Días que abre' }, U.DIAS.map((d, i) => {
      const b = h('button', { type: 'button', class: 'chip' + (W.hours.days[i] ? ' on' : ''), 'aria-pressed': String(!!W.hours.days[i]) }, d);
      b.addEventListener('click', () => { W.hours.days[i] = W.hours.days[i] ? 0 : 1; b.classList.toggle('on'); b.setAttribute('aria-pressed', String(!!W.hours.days[i])); M = null; PLAN = null; save(); });
      return b;
    }));
    c3.body.appendChild(h('div', { class: 'field' }, h('span', { class: 'lbl' }, 'Días que abre'), days));
    if (area().note) c3.body.appendChild(UI.note(area().note, 'info'));
    E.body.appendChild(c3.el);
    E.body.appendChild(navRow(null, 'datos', 'Siguiente: tus datos →'));
  }

  /* ======================= 2. Tus datos ======================= */
  function rDatos() {
    const s = sec(), a = area(), t = T();
    const choose = UI.card('¿Cómo obtienes tus datos?', { sub: 'Elige la opción que describe a tu empresa. Te diremos exactamente qué archivo preparar.' });
    const opts = [
      ['sistema', 'Tengo un sistema que los registra', `${s.system.source}. Exportas un reporte y lo subes.`],
      ['manual', 'No tengo sistema: los levantaré a mano', 'Te damos el método y las planillas, o usas la toma de datos en el celular.'],
      ['estimar', 'Aún no tengo datos: usaré estimaciones', 'Escribes lo que sabes de tu operación y el sistema calcula con eso.']
    ];
    choose.body.appendChild(h('div', { class: 'choice-grid three' }, opts.map(([id, title, desc]) => {
      const b = h('button', { type: 'button', class: 'choice' + (W.src === id ? ' on' : ''), 'aria-pressed': String(W.src === id) }, h('b', null, title), h('span', null, desc));
      b.addEventListener('click', () => { W.src = id; M = null; PLAN = null; save(); render(); });
      return b;
    })));
    choose.body.appendChild(h('p', { class: 'hint' }, '¿Solo quieres conocer la herramienta? ', h('button', { type: 'button', class: 'link', onclick: loadExample }, `Carga un ejemplo ficticio de ${s.name.toLowerCase()}`), '.'));
    E.body.appendChild(choose.el);
    if (W.src === 'sistema' || W.src === 'ejemplo') dSistema(s, a, t);
    else if (W.src === 'manual') dManual(s, a, t);
    else if (W.src === 'estimar') dEstimar(s, a, t);
    const ready = dataReady();
    E.body.appendChild(navRow('negocio', () => goReview(), 'Siguiente: ver lo que dicen tus datos →', ready));
    if (W.src && !ready) E.body.appendChild(h('p', { class: 'hint', style: { textAlign: 'right' } }, W.src === 'manual' ? 'Falta procesar el conteo por hora (archivo 1).' : W.src === 'estimar' ? '' : 'Falta procesar el archivo principal.'));
  }
  function dataReady() {
    if (W.src === 'estimar') return W.est && W.est.dayVol > 0;
    return !!(F.main && F.main.ds);
  }
  async function loadExample() {
    const s = sec(), a = area();
    W.src = 'ejemplo'; save();
    U.toast('Generando un ejemplo ficticio…', 'info', 1500); await U.tick();
    const g = D.generateFor(s, a);
    F.main = await prepSlot({ type: 'rows', headers: g.headers, rows: g.rows, name: g.name }); F.svc = null; F.prof = null; F.hist = null;
    await processSlot('main');
    render();
  }

  // ---------- con sistema ----------
  function dSistema(s, a, t) {
    const measured = F.main && F.main.measured;
    const rec = UI.card(W.src === 'ejemplo' ? 'Datos de ejemplo (ficticios)' : measured ? `Datos medidos: ${a.name}` : 'Qué reporte pedir a tu sistema', { sub: W.src === 'ejemplo' ? 'Se generaron casi 4 años de datos por hora con los patrones típicos de tu giro. Sirven para conocer la herramienta: no son tus datos.' : measured ? 'Vienen del recorrido de cinco pasos: clientes por hora del área, personal presente y tiempos de atención de cada tipo de transacción.' : `${s.system.source}: ${s.system.report}` });
    if (measured) rec.body.appendChild(h('div', { class: 'row' }, UI.btn('Volver a la medición', () => QS.App.go('medicion'), 'btn-ghost btn-sm')));
    if (W.src !== 'ejemplo' && !measured) {
      rec.body.appendChild(UI.table(['Columna', 'Necesidad', 'Para qué sirve'], s.system.columns.map((c) => [c[0], c[1], c[2]]), { compact: true }));
      if (s.system.alt) rec.body.appendChild(h('p', { class: 'hint' }, s.system.alt));
      rec.body.appendChild(h('p', { class: 'hint' }, 'Un solo archivo con todo el periodo disponible (ideal 2 a 5 años). CSV o Excel; los nombres de columna pueden ser los de tu sistema: el asistente los reconoce y te deja corregirlos.'));
      const tpl = D.systemTemplate(s, a);
      rec.body.appendChild(h('div', { class: 'row' }, UI.btn('Descargar formato de ejemplo', () => U.saveFile(tpl.name, U.toCSV(tpl.headers, tpl.rows, { sep: ',' }), 'text/csv'), 'btn-sm')));
    }
    E.body.appendChild(rec.el);
    E.body.appendChild(slotCard('main', W.src === 'ejemplo' ? 'Archivo de ejemplo' : `Archivo 1 (obligatorio): ${t.unit} de tu sistema`, 'Fechas, horas y, si existen, tiempos de atención.'));
    if (F.main && F.main.ds) {
      const ds = F.main.ds;
      if (!ds.has.svc) E.body.appendChild(svcCard(true));
      if (!ds.has.hourly) E.body.appendChild(profileCard());
    }
  }
  // ---------- registro manual ----------
  function dManual(s, a, t) {
    const tpl = D.manualTemplates(s, a);
    const how = UI.card('Cómo levantar tus datos sin sistema', { sub: 'Este es el método mínimo que un especialista usaría. Toma pocas semanas y da resultados confiables.' });
    how.body.appendChild(h('ol', { class: 'steps-list' },
      h('li', null, h('b', null, 'Conteo por hora (2 a 4 semanas). '), `Cada hora anota cuántos ${s.manual.what}. Incluye fines de semana y al menos una quincena. Anota también cuántas ${t.servL} estaban abiertas.`,
        h('div', { class: 'row' }, UI.btn('Planilla de conteo (CSV)', () => U.saveFile(tpl.conteo.name, U.toCSV(tpl.conteo.headers, tpl.conteo.rows, { sep: ',' }), 'text/csv'), 'btn-sm'), UI.btn('Contar con el celular', () => QS.App.go('captura'), 'btn-sm'))),
      h('li', null, h('b', null, 'Tiempos de atención (50 a 200 mediciones). '), `Cronometra ${s.manual.timing}, en distintas horas y ${t.servL}.`,
        h('div', { class: 'row' }, UI.btn('Planilla de tiempos (CSV)', () => U.saveFile(tpl.tiempos.name, U.toCSV(tpl.tiempos.headers, tpl.tiempos.rows, { sep: ',' }), 'text/csv'), 'btn-sm'), UI.btn('Cronometrar con el celular', () => QS.App.go('captura'), 'btn-sm'))),
      h('li', null, h('b', null, 'Historia (opcional). '), 'Si tienes ventas o tickets diarios de años anteriores (aunque sea de contabilidad), súbelos para medir tus temporadas.',
        h('div', { class: 'row' }, UI.btn('Planilla de historia diaria (CSV)', () => U.saveFile(tpl.historia.name, U.toCSV(tpl.historia.headers, tpl.historia.rows, { sep: ',' }), 'text/csv'), 'btn-sm')))));
    E.body.appendChild(how.el);
    E.body.appendChild(slotCard('main', 'Archivo 1 (obligatorio): conteo por hora', 'La planilla de conteo llena, o el archivo de la toma de datos con el celular.'));
    E.body.appendChild(svcCard(false));
    E.body.appendChild(slotCard('hist', 'Archivo 3 (opcional): historia diaria', 'Ventas o tickets por día de 1 a 5 años. Si solo tienes ventas, indica tu ticket promedio.', true));
  }
  // ---------- estimaciones ----------
  function dEstimar(s, a, t) {
    const est = W.est; const ch = () => { M = null; PLAN = null; save(); };
    const c = UI.card('Tus estimaciones', { sub: 'Usa lo que sabes de tu operación. Después podrás reemplazarlas por datos reales.' });
    c.body.appendChild(h('p', { class: 'sentence' }, 'En un día normal entre semana llegan ', numIn(est.dayVol, (v) => { est.dayVol = v; ch(); }, 70), ` ${t.customers}.`));
    c.body.appendChild(h('p', { class: 'sentence' }, 'El sábado llegan ', numIn(est.satPct, (v) => { est.satPct = v; ch(); }, 60), ' % más y el domingo ', numIn(est.sunPct, (v) => { est.sunPct = v; ch(); }, 60), ' % más (usa negativos si llegan menos).'));
    c.body.appendChild(h('p', { class: 'sentence' }, 'Cada atención dura en promedio ', numIn(W.goals.aht, (v) => { W.goals.aht = v; ch(); }, 60, 0.1), ' minutos.'));
    c.body.appendChild(h('p', { class: 'hint' }, `El reparto por hora usa el perfil típico de ${s.name.toLowerCase()} dentro de tu horario; las temporadas se ajustan en el siguiente paso.`));
    E.body.appendChild(c.el);
  }
  const numIn = (v, on, w = 70, step = 'any') => {
    const i = h('input', { type: 'number', value: String(v), step: String(step), class: 'inline-num', style: { width: w + 'px' }, 'aria-label': 'valor' });
    i.addEventListener('input', () => { const x = parseFloat(i.value); if (isFinite(x)) on(x); });
    return i;
  };

  // ---------- tarjetas de archivo ----------
  async function prepSlot(src) {
    const pv = await D.preview(src);
    const kind = D.guessKind(pv.headers, pv.rows); const map = D.guessMapping(pv.headers, kind);
    const dcol = map.fechahora != null ? map.fechahora : map.fecha;
    const durCol = [map.tmo, map.duracion, map.espera].find((x) => x != null);
    const durUnit = durCol != null && /(seg|sec|_s$)/.test(D.normHeader(pv.headers[durCol])) ? 's' : 'min';
    return { name: src.name || (src.file && src.file.name) || 'archivo', src, pv, kind, map, dec: pv.decimal || '.', dateOrder: dcol != null ? D.detectDateOrder(pv.rows.map((r) => r[dcol])) : 'DMY', durUnit, ticket: 0, ds: null };
  }
  async function processSlot(key) {
    const f = F[key]; if (!f) return;
    busy = true;
    try {
      f.ds = await D.process(f.src, { kind: f.kind, map: f.map, dec: f.dec, dateOrder: f.dateOrder, durUnit: f.durUnit, ticket: f.ticket }, (p) => { if (f.prog) f.prog.set(p, 'Leyendo…'); });
      if (!f.ds.days.length) throw new Error('No se obtuvo ningún día válido: revisa las columnas de fecha y hora.');
      f.error = null; M = null; PLAN = null;
      if (key === 'main') D.state.ds = f.ds;
    } catch (e) { f.ds = null; f.error = e.message; U.toast(e.message, 'bad', 7000); }
    busy = false;
  }
  function slotCard(key, title, desc, optional) {
    const f = F[key];
    const card = UI.card(title, { sub: desc });
    const file = h('input', { type: 'file', accept: '.csv,.txt,.tsv,.xlsx,.xlsm,.xls', hidden: true });
    file.addEventListener('change', async () => {
      const fl = file.files[0]; file.value = ''; if (!fl) return;
      try { F[key] = await prepSlot({ type: 'file', file: fl, name: fl.name }); if (key === 'hist') F[key].kind = F[key].kind === 'trans' ? 'daily' : F[key].kind; render(); }
      catch (e) { U.toast('No se pudo leer el archivo: ' + e.message, 'bad'); }
    });
    if (!f || (!f.pv && !f.ds)) {
      const drop = h('div', { class: 'drop', tabindex: '0', role: 'button', 'aria-label': 'Elegir archivo' }, h('b', null, 'Arrastra aquí el archivo o haz clic para elegirlo'), h('span', { class: 'hint' }, 'CSV, TXT o Excel. Se procesa en tu navegador.'));
      drop.addEventListener('click', () => file.click());
      drop.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); file.click(); } });
      drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('over'); });
      drop.addEventListener('dragleave', () => drop.classList.remove('over'));
      drop.addEventListener('drop', async (e) => { e.preventDefault(); drop.classList.remove('over'); const fl = e.dataTransfer.files[0]; if (fl) { F[key] = await prepSlot({ type: 'file', file: fl, name: fl.name }); render(); } });
      card.body.appendChild(drop); card.body.appendChild(file);
      if (optional) card.body.appendChild(h('p', { class: 'hint' }, 'Opcional: puedes continuar sin este archivo.'));
      return card.el;
    }
    if (f.ds) {
      const ds = f.ds, days = ds.k1 - ds.k0 + 1;
      const kindTxt = { trans: 'una fila por cliente', interval: 'conteos por hora', daily: 'totales por día' }[ds.kind];
      card.body.appendChild(h('div', { class: 'slot-ok' }, UI.pill('Listo', 'good'),
        h('span', null, `${f.name}: ${U.fmtInt(ds.stats.ok)} filas (${kindTxt}) del ${U.fmtDay(ds.k0)} al ${U.fmtDay(ds.k1)} · ${durTxt(days)}${ds.stats.bad ? ` · ${U.fmtInt(ds.stats.bad)} filas descartadas` : ''}.`)));
      const has = [['tiempos de atención', ds.has.svc], ['esperas', ds.has.wq], ['abandonos', ds.has.ab], [`${T().servL} abiertas`, ds.has.srv], ['detalle por hora', ds.has.hourly]];
      card.body.appendChild(h('div', { class: 'row' }, has.map(([n, ok]) => UI.pill(n, ok ? 'good' : 'warn'))));
      card.body.appendChild(h('div', { class: 'row' }, UI.btn('Cambiar archivo', () => file.click(), 'btn-ghost btn-sm'), UI.btn('Revisar columnas', () => { f.ds = null; render(); }, 'btn-ghost btn-sm'), file));
      return card.el;
    }
    // vista previa + confirmación de columnas
    const pv = f.pv;
    card.body.appendChild(h('p', { class: 'hint' }, `Archivo: ${f.name}. Revisa que cada dato apunte a la columna correcta y presiona "Procesar".`));
    card.body.appendChild(UI.table(pv.headers.map(String), pv.rows.slice(0, 4).map((r) => pv.headers.map((_, i) => (r[i] == null ? '' : String(r[i])))), { compact: true }));
    card.body.appendChild(UI.select({ label: 'El archivo trae', value: f.kind, options: [['trans', 'Una fila por cliente / ticket / turno'], ['interval', 'Conteos por hora o intervalo'], ['daily', 'Totales por día']],
      onChange: (v) => { f.kind = v; f.map = D.guessMapping(pv.headers, v); render(); } }).el);
    const opts = [['', '— No usar —']].concat(pv.headers.map((x, i) => [String(i), String(x || 'Columna ' + (i + 1))]));
    const t = T();
    const LABEL = { fechahora: 'Fecha y hora de llegada', fecha: 'Fecha', hora: 'Hora', inicio: 'Inicio de atención', fin: 'Fin de atención', duracion: 'Duración de la atención', espera: 'Tiempo de espera', abandono: 'Abandonó (sí/no)',
      servidor: t.server[0].toUpperCase() + t.server.slice(1), clase: 'Tipo de cliente', ventas: 'Ventas (monto)', llegadas: `Cantidad de ${t.customers}`, tmo: 'Tiempo medio de atención', abandonos: 'Abandonos', servidores: `${t.servers} abiertas` };
    const roles = D.KINDS[f.kind].roles.map((r) => r[0]);
    const shown = roles.filter((r) => f.map[r] != null || ['fechahora', 'fecha', 'hora', 'llegadas', 'tmo', 'inicio', 'fin'].includes(r));
    card.body.appendChild(h('div', { class: 'map-grid' }, shown.map((role) => UI.select({ label: LABEL[role] || role, value: f.map[role] != null ? String(f.map[role]) : '', options: opts,
      onChange: (v) => { if (v === '') delete f.map[role]; else f.map[role] = +v; } }).el)));
    const extra = h('details', { class: 'sec' }, h('summary', null, h('span', { class: 'sec-title' }, 'Formato de fechas y números')), h('div', { class: 'sec-body' }, UI.grid(4,
      UI.select({ label: 'Fecha', value: f.dateOrder, options: [['DMY', 'día/mes/año'], ['MDY', 'mes/día/año']], onChange: (v) => { f.dateOrder = v; } }).el,
      UI.select({ label: 'Decimales', value: f.dec, options: [['.', 'punto'], [',', 'coma']], onChange: (v) => { f.dec = v; } }).el,
      UI.select({ label: 'Duraciones en', value: f.durUnit, options: [['min', 'minutos'], ['s', 'segundos'], ['h', 'horas'], ['day', 'hora de Excel']], onChange: (v) => { f.durUnit = v; } }).el,
      UI.num({ label: 'Ticket promedio', value: f.ticket || '', min: 0, help: 'Solo si el archivo trae ventas y no cantidad de clientes.', onInput: (v) => { f.ticket = v || 0; } }).el)));
    card.body.appendChild(extra);
    f.prog = UI.progress();
    const btn = UI.btn('Procesar', async () => {
      btn.disabled = true;
      const m = f.map;
      if (f.kind === 'trans' && m.fechahora == null && m.fecha == null) { U.toast('Indica la columna de fecha y hora de llegada.', 'warn'); btn.disabled = false; return; }
      if (f.kind !== 'trans' && m.fecha == null) { U.toast('Indica la columna de fecha.', 'warn'); btn.disabled = false; return; }
      if (f.kind !== 'trans' && m.llegadas == null && !(m.ventas != null && f.ticket > 0)) { U.toast('Indica la columna con la cantidad de clientes (o ventas y ticket promedio).', 'warn'); btn.disabled = false; return; }
      await processSlot(key); render();
    }, 'btn-primary');
    card.body.appendChild(h('div', { class: 'row' }, btn, f.prog.el, UI.btn('Elegir otro archivo', () => file.click(), 'btn-ghost btn-sm'), file));
    return card.el;
  }
  const durTxt = (days) => (days >= 365 ? `${U.fmt(days / 365.25, 1)} años` : days >= 60 ? `${U.fmt(days / 30.4, 1)} meses` : `${days} días`);
  // Tiempo de atención: muestra cronometrada o promedio escrito
  function svcCard(fromSystem) {
    const t = T(); const g = W.goals;
    const card = UI.card(fromSystem ? 'Tu archivo no trae la duración de la atención' : 'Archivo 2 (recomendado): tiempos de atención',
      { sub: fromSystem ? 'Sube una muestra cronometrada (50 a 200 atenciones) o escribe el promedio que conoces.' : 'La planilla de tiempos o el cronómetro del celular. Si no la tienes, escribe un promedio.' });
    if (F.svc && F.svc.values) {
      const v = F.svc.values; const m = U.mean(v), cv = U.sd(v) / m;
      card.body.appendChild(h('div', { class: 'slot-ok' }, UI.pill('Listo', 'good'), h('span', null, `${F.svc.name}: ${v.length} mediciones · promedio ${U.fmtTime(m)} · variabilidad (CV) ${U.fmt(cv, 2)}.`)));
      card.body.appendChild(UI.btn('Quitar muestra', () => { F.svc = null; M = null; render(); }, 'btn-ghost btn-sm'));
      return card.el;
    }
    const file = h('input', { type: 'file', accept: '.csv,.txt,.xlsx,.xls', hidden: true });
    file.addEventListener('change', async () => {
      const fl = file.files[0]; file.value = ''; if (!fl) return;
      try {
        const src = { type: 'file', file: fl, name: fl.name }; if (D.isExcel(fl)) await D.preview(src);
        const r = await D.processDurations(src);
        if (r.n < 10) throw new Error('No se encontraron duraciones. La planilla debe tener una columna "duracion_seg" (o inicio y fin).');
        F.svc = { name: fl.name, values: r.values }; M = null; PLAN = null; render();
        U.toast(`Se leyeron ${r.n} tiempos de atención (${r.column}).`, 'ok');
      } catch (e) { U.toast(e.message, 'bad', 6000); }
    });
    card.body.appendChild(h('div', { class: 'row' }, UI.btn('Subir muestra de tiempos', () => file.click(), 'btn-sm'), file));
    card.body.appendChild(h('p', { class: 'sentence' }, 'O usa un promedio: cada atención dura ', numIn(g.aht, (v) => { g.aht = v; M = null; PLAN = null; save(); }, 64, 0.1), ' minutos, con variabilidad ',
      (() => { const sel = h('select', { class: 'inline-sel', 'aria-label': 'Variabilidad' }, [['0.35', 'baja'], ['0.7', 'media'], ['1', 'alta']].map(([v, l]) => h('option', { value: v }, l))); sel.value = g.cv <= 0.45 ? '0.35' : g.cv < 0.9 ? '0.7' : '1'; sel.addEventListener('change', () => { g.cv = +sel.value; M = null; save(); }); return sel; })(),
      '.'));
    return card.el;
  }
  // Reparto por hora cuando el archivo principal es diario
  function profileCard() {
    const s = sec();
    const card = UI.card('Tu archivo trae totales por día: ¿cómo se reparte cada día por hora?', { sub: `Para saber cuántas ${T().servL} abrir cada hora. Si no tienes este dato, se usa el perfil típico de ${s.name.toLowerCase()} dentro de tu horario.` });
    if (F.prof && F.prof.ds) { card.body.appendChild(h('div', { class: 'slot-ok' }, UI.pill('Listo', 'good'), h('span', null, `${F.prof.name}: perfil por hora medido en ${durTxt(F.prof.ds.k1 - F.prof.ds.k0 + 1)}.`))); return card.el; }
    card.body.appendChild(slotCard('prof', 'Conteo por hora de 1 a 4 semanas (opcional)', 'Si lo tienes, el reparto por hora será el de tu negocio.', true));
    return card.el;
  }

  /* ======================= modelo de demanda ======================= */
  const DOWF = () => { const e = W.est; return [1, 1, 1, 1, 1, 1 + e.satPct / 100, 1 + e.sunPct / 100]; };
  function openHoursFromSettings() { return U.range(7, (w) => (W.hours.days[w] ? [Math.floor(W.hours.open / 60), Math.ceil(W.hours.close / 60)] : null)); }
  function shareFromSector() { const s = sec(); return U.range(7, (w) => (W.hours.days[w] ? SEC.dayShare(s, w, W.hours) : new Array(24).fill(0))); }
  function svcStats() {
    if (F.main && F.main.ds && F.main.ds.has.svc && F.main.ds.samples.svc.length > 30) { const v = F.main.ds.samples.svc; return { aht: U.mean(v), cv: U.sd(v) / U.mean(v), src: 'tus datos (tiempos individuales)', samples: v }; }
    if (F.svc && F.svc.values && F.svc.values.length >= 10) { const v = F.svc.values; return { aht: U.mean(v), cv: U.sd(v) / U.mean(v), src: `la muestra cronometrada (${v.length} mediciones)`, samples: v }; }
    return { aht: W.goals.aht, cv: W.goals.cv, src: 'el promedio que indicaste' };
  }
  function buildModel() {
    const s = sec(); const events = AN.eventsFor(s.events);
    const sv = svcStats();
    const m = { insights: [], warnings: [], svc: sv, events };
    if (W.src === 'estimar') {
      const share = shareFromSector(); const dowF = DOWF();
      m.kind = 'week'; m.label = 'Estimaciones';
      m.lamWeek = U.range(7, (w) => share[w].map((x) => (W.hours.days[w] ? W.est.dayVol * dowF[w] * x : 0)));
      m.openHours = openHoursFromSettings();
      m.ahtAt = () => sv.aht;
      m.seasonsBase = W.est.months.slice();
    } else {
      let main = F.main.ds, share = null, profileSource = null;
      if (W.src === 'manual' && F.hist && F.hist.ds) {
        const Rp = AN.build(main, { events }); share = Rp.share; profileSource = 'tu conteo por hora';
        main = F.hist.ds; m.study = Rp;
      } else if (!main.has.hourly) {
        if (F.prof && F.prof.ds) { share = AN.build(F.prof.ds, { events }).share; profileSource = 'tu conteo por hora'; }
        else { share = shareFromSector(); profileSource = `el perfil típico de ${s.name.toLowerCase()}`; }
      }
      const R = AN.build(main, { events, share, profileSource });
      m.R = R; m.openHours = R.openHours;
      const days = main.k1 - main.k0 + 1;
      const ahtM = sv.src.startsWith('tus datos') || (main.has.svc && isFinite(R.aht));
      const ahtBase = main.has.svc && isFinite(R.aht) ? R.aht : sv.aht;
      if (!main.has.svc) sv.aht = ahtBase;
      m.ahtAt = (mo, hh) => (main.has.svc && isFinite(R.aht) ? (R.ahtMonth[mo - 1] || R.aht) * ((R.ahtHour[hh] || R.aht) / R.aht) : ahtBase);
      m.svc.aht = ahtBase; if (main.has.svc && R.svcCV) m.svc.cv = R.svcCV;
      if (main.has.svc && isFinite(R.aht) && !sv.samples) m.svc.src = 'el tiempo medio de atención de tus datos';
      if (days >= 300) {
        m.kind = 'history'; m.fc = FC.run(R, {});
        m.label = W.src === 'ejemplo' ? 'Ejemplo ficticio' : `${durTxt(days)} de historia`;
      } else {
        m.kind = 'week'; m.label = `${durTxt(days)} de datos`;
        // semana típica: promedio por día de la semana y hora
        m.lamWeek = U.range(7, (w) => U.range(24, (hh) => (R.heat ? R.heat[w][hh] : R.avgDay * R.dowIdx[w] * (R.share[w][hh] || 0))));
        m.seasonsBase = W.est.months.slice();
        m.warnings.push(`Tienes ${durTxt(days)} de datos: alcanzan para el patrón por día y hora, pero no para medir tus temporadas. Se usa el patrón típico de ${s.name.toLowerCase()}; ajústalo con tu experiencia.`);
      }
      if (profileSource && !main.has.hourly) m.warnings.push(`El reparto por hora proviene de ${profileSource}.`);
      if (R.missing > 10) m.warnings.push(`Hay ${R.missing} días sin registros en días que normalmente abres: se tratan como cerrados (feriados).`);
      if (R.outliers.length > 3) m.warnings.push(`${R.outliers.length} días tienen demanda muy distinta a lo esperado (posibles errores o eventos no registrados). Revísalos en el análisis completo.`);
      m.ahtFromData = ahtM;
    }
    insights(m);
    M = m;
    return m;
  }
  function seasonsNow() {
    if (M && M.kind === 'history') { const auto = AN.seasons(M.R.monthIdx); return auto.map((x, i) => W.seasonOv[i] || x); }
    return (M && M.seasonsBase ? M.seasonsBase : W.est.months).map((x, i) => W.seasonOv[i] || x);
  }
  function monthFactors() {
    const se = seasonsNow();
    return se.map((x) => (x === 'Alta' ? 1 + W.est.high / 100 : x === 'Baja' ? 1 - W.est.low / 100 : 1));
  }
  function insights(m) {
    const t = T(); const L = [];
    const peakOf = (grid) => { let best = { v: -1 }; for (let w = 0; w < 7; w++) for (let hh = 0; hh < 24; hh++) if (grid[w][hh] > best.v) best = { v: grid[w][hh], w, hh }; return best; };
    if (m.kind === 'history') {
      const R = m.R;
      L.push(`Analizamos ${durTxt(R.N)} (${U.fmtDay(R.k0)} a ${U.fmtDay(R.k1)}): en promedio llegan ${U.fmtInt(R.avgDay)} ${t.customers} por día abierto.`);
      const se = seasonsNow(); const alta = se.map((x, i) => (x === 'Alta' ? i : -1)).filter((i) => i >= 0), baja = se.map((x, i) => (x === 'Baja' ? i : -1)).filter((i) => i >= 0);
      if (alta.length) L.push(`Temporada alta: ${alta.map((i) => `${U.MESES_L[i].toLowerCase()} (${pct(R.monthIdx[i] - 1)})`).join(', ')}.`);
      if (baja.length) L.push(`Temporada baja: ${baja.map((i) => `${U.MESES_L[i].toLowerCase()} (${pct(R.monthIdx[i] - 1)})`).join(', ')}.`);
      const dmax = R.dowIdx.indexOf(Math.max(...R.dowIdx)); L.push(`El día más fuerte de la semana es el ${U.DIAS_L[dmax].toLowerCase()} (${pct(R.dowIdx[dmax] - 1)} sobre el promedio).`);
      if (R.paydayLift > 1.05) L.push(`En quincenas y días de pago la demanda sube ${pct(R.paydayLift - 1)}.`);
      const ev = R.eventStats.filter((e) => e.on && isFinite(e.lift) && Math.abs(e.lift - 1) >= 0.08).sort((a, b) => b.lift - a.lift).slice(0, 4);
      if (ev.length) L.push('Fechas especiales: ' + ev.map((e) => `${e.name.replace(/ \(.*\)$/, '')} ${pct(e.lift - 1)}`).join(' · ') + '.');
      if (Math.abs(R.trend.annual) > 0.01) L.push(`Tendencia: la demanda ${R.trend.annual > 0 ? 'crece' : 'baja'} ${U.fmtPct(Math.abs(R.trend.annual))} por año.`);
      if (R.heat) { const p = peakOf(R.heat); L.push(`La hora más cargada es el ${U.DIAS_L[p.w].toLowerCase()} de ${U.fmtHour(p.hh)} a ${U.fmtHour(p.hh + 1)}, con ${U.fmtInt(p.v)} ${t.customers} en promedio.`); }
      if (m.fc && m.fc.ev && m.fc.ev.ok) L.push(`El pronóstico se probó con el último año: error promedio de ${U.fmtPct(Math.min(m.fc.ev.harm.mape, m.fc.ev.hw ? m.fc.ev.hw.mape : Infinity))} por mes.`);
    } else {
      const g = m.lamWeek; const tot = g.reduce((s, r) => s + r.reduce((a, b) => a + b, 0), 0);
      L.push(`En una semana típica llegan unos ${U.fmtInt(tot)} ${t.customers}.`);
      const p = peakOf(g); if (p.v > 0) L.push(`La hora más cargada es el ${U.DIAS_L[p.w].toLowerCase()} de ${U.fmtHour(p.hh)} a ${U.fmtHour(p.hh + 1)}, con unos ${U.fmtInt(p.v)} ${t.customers}.`);
      const se = seasonsNow(); const alta = se.map((x, i) => (x === 'Alta' ? U.MESES_L[i].toLowerCase() : null)).filter(Boolean);
      if (alta.length) L.push(`Temporada alta considerada: ${alta.join(', ')} (+${W.est.high} %).`);
    }
    L.push(`Cada atención dura en promedio ${U.fmtTime(m.svc.aht)} (según ${m.svc.src}).`);
    m.insights = L;
  }
  const pct = (x) => (x >= 0 ? '+' : '−') + U.fmtPct(Math.abs(x), 0);
  async function goReview() {
    if (!dataReady()) return;
    try { buildModel(); } catch (e) { console.error(e); U.toast('No se pudo analizar: ' + e.message, 'bad', 7000); return; }
    PLAN = null; WZ.go('revision');
  }

  /* ======================= 3. Lo que dicen tus datos ======================= */
  function rRevision() {
    if (!M) { WZ.go('datos'); return; }
    const t = T();
    const head = UI.card('Lo que dicen tus datos', { sub: M.label });
    head.body.appendChild(h('ul', { class: 'insights' }, M.insights.map((x) => h('li', null, x))));
    M.warnings.forEach((w) => head.body.appendChild(UI.note(w, 'warn')));
    E.body.appendChild(head.el);
    // temporadas
    const se = seasonsNow();
    const sc = UI.chartCard(M.kind === 'history' ? 'Temporadas: demanda de cada mes frente al promedio' : 'Temporadas consideradas', { sub: 'Haz clic en un mes de la lista de abajo para cambiar su temporada.', height: 260 });
    const vals = M.kind === 'history' ? M.R.monthIdx : monthFactors();
    C.bars(sc.chartEl, { categories: U.MESES, yName: 'Índice (1 = mes promedio)', yMin: 0, series: [{ name: 'Índice', data: vals.map((x) => +x.toFixed(3)), color: (th, i) => th.season[se[i]] }],
      tooltip: (ps) => `${U.MESES_L[ps[0].dataIndex]}<br><b>${pct(ps[0].value - 1)}</b> · temporada ${se[ps[0].dataIndex]}`, extra: (o, th) => { o.series[0].markLine = C.refLine(th, 1, 'promedio'); } });
    sc.setTable(() => ({ headers: ['Mes', { t: 'Índice', num: true }, 'Temporada'], rows: U.range(12, (i) => [U.MESES_L[i], U.fmt(vals[i], 2), se[i]]) }));
    const chips = h('div', { class: 'chips months' }, U.MESES.map((mn, i) => {
      const b = h('button', { type: 'button', class: 'chip season ' + se[i], title: 'Cambiar temporada' }, h('b', null, mn), h('span', null, se[i]));
      b.addEventListener('click', () => { const order = ['Normal', 'Alta', 'Baja']; const next = order[(order.indexOf(se[i]) + 1) % 3]; W.seasonOv[i] = next; save(); PLAN = null; insights(M); render(); });
      return b;
    }));
    sc.body.appendChild(chips);
    if (M.kind === 'week') sc.body.appendChild(h('p', { class: 'sentence' }, 'En temporada alta la demanda sube ', numIn(W.est.high, (v) => { W.est.high = v; save(); PLAN = null; }, 60), ' % y en temporada baja baja ', numIn(W.est.low, (v) => { W.est.low = v; save(); PLAN = null; }, 60), ' %.'));
    E.body.appendChild(sc.el);
    // mapa de calor
    const grid = M.kind === 'history' && M.R.heat ? M.R.heat : M.kind === 'history' ? U.range(7, (w) => U.range(24, (hh) => M.R.avgDay * M.R.dowIdx[w] * (M.R.share[w][hh] || 0))) : M.lamWeek;
    const hrs = []; for (let hh = 0; hh < 24; hh++) if (grid.some((r) => r[hh] > 0.05)) hrs.push(hh);
    const hc = UI.chartCard(`${t.customers[0].toUpperCase() + t.customers.slice(1)} por hora en una semana típica`, { sub: 'Promedio por hora. Es la base para saber cuántas ' + t.servL + ' abrir.', height: 300 });
    if (hrs.length) {
      const h0 = hrs[0], h1 = hrs[hrs.length - 1]; const cols = U.range(h1 - h0 + 1, (i) => h0 + i);
      const data = []; for (let w = 0; w < 7; w++) cols.forEach((hh, j) => data.push([j, w, +(grid[w][hh] || 0).toFixed(1)]));
      C.heat(hc.chartEl, { rows: U.DIAS, cols: cols.map((x) => U.fmtHour(x)), data, unit: t.customers + '/h', labels: cols.length <= 15 });
      hc.setTable(() => ({ headers: ['Día'].concat(cols.map((x) => ({ t: U.fmtHour(x), num: true }))), rows: U.range(7, (w) => [U.DIAS_L[w]].concat(cols.map((hh) => U.fmt(grid[w][hh] || 0, 1)))) }));
    }
    E.body.appendChild(hc.el);
    if (M.kind === 'history') {
      const ev = UI.card('Fechas especiales que se consideran', { sub: 'Efecto medido en tus datos. Desactiva las que no apliquen a tu negocio.' });
      ev.body.appendChild(UI.table(['Usar', 'Fecha', { t: 'Efecto', num: true }], M.R.eventStats.filter((x, i) => sec().events.includes(x.id)).map((x) => {
        const evDef = M.events.find((e) => e.id === x.id);
        const cb = h('input', { type: 'checkbox', checked: !!(evDef && evDef.on), 'aria-label': 'Usar ' + x.name });
        cb.addEventListener('change', () => { evDef.on = cb.checked; M.R = AN.build(M.R.ds, { events: M.events, share: M.R.share }); M.fc = FC.run(M.R, {}); PLAN = null; insights(M); U.toast('Fechas especiales actualizadas.', 'ok'); });
        return [cb, x.name, isFinite(x.lift) ? pct(x.lift - 1) : (x.closed ? 'cerrado' : '—')];
      }), { compact: true }));
      E.body.appendChild(ev.el);
    }
    E.body.appendChild(h('div', { class: 'row' }, UI.btn('Ver el análisis completo (especialistas)', openExpert, 'btn-ghost btn-sm')));
    E.body.appendChild(navRow('datos', 'metas', 'Siguiente: tu meta y tus costos →'));
  }
  function openExpert() {
    const ds = M.R ? M.R.ds : null;
    if (!ds) { U.toast('Con estimaciones no hay datos que analizar en detalle.', 'info'); return; }
    QS.App.go('expertos', { sub: 'datos' });
    QS.DataUI.useDataset(ds, { events: M.events, share: M.R.share, isSample: W.src === 'ejemplo', name: W.name || sec().name });
  }

  /* ======================= 4. Meta y costos ======================= */
  function rMetas() {
    const g = W.goals, t = T(); const ch = () => { PLAN = null; save(); };
    const c1 = UI.card('Tu meta de servicio', { sub: 'Es lo que define cuántas ' + t.servL + ' necesitas cada hora.' });
    c1.body.appendChild(h('p', { class: 'sentence big' }, 'Quiero que el ', numIn(g.pct, (v) => { g.pct = U.clamp(v, 1, 99.9); ch(); }, 64), ` % de los ${t.customers} espere menos de `, numIn(+(+g.tMin).toFixed(2), (v) => { g.tMin = Math.max(0.05, v); ch(); }, 64, 0.5), ' minutos.'));
    const leave = h('select', { class: 'inline-sel', 'aria-label': 'Abandono' }, [['0', 'se quedan hasta ser atendidos'], ['1', 'se van si esperan demasiado']].map(([v, l]) => h('option', { value: v }, l)));
    leave.value = g.leave ? '1' : '0';
    const patWrap = h('span', { hidden: !g.leave }, ', en promedio después de ', numIn(g.patience || 10, (v) => { g.patience = Math.max(0.1, v); ch(); }, 60, 0.5), ' minutos');
    leave.addEventListener('change', () => { g.leave = leave.value === '1'; patWrap.hidden = !g.leave; if (g.leave && !(g.patience > 0)) g.patience = 10; ch(); });
    c1.body.appendChild(h('p', { class: 'sentence' }, `Cuando hay fila, los ${t.customers} `, leave, patWrap, '.'));
    const cov = UI.seg({ label: 'Planear para', value: g.coverage, options: Object.entries(COVER), onChange: (v) => { g.coverage = v; ch(); } });
    c1.body.appendChild(h('div', { class: 'field' }, h('span', { class: 'lbl' }, 'Planear para', UI.help('Los días varían. "Cargado" significa que el personal alcanza en 3 de cada 4 días; "muy cargado", en 9 de cada 10.')), cov.el));
    E.body.appendChild(c1.el);
    const c2 = UI.card('Tu personal y sus costos', { sub: 'Reglas de contratación para armar los turnos.' });
    c2.body.appendChild(h('p', { class: 'sentence' }, 'Jornada completa de ', numIn(g.ftLen, (v) => { g.ftLen = v; ch(); }, 54, 0.5), ' horas al día, ', numIn(g.daysFT, (v) => { g.daysFT = Math.round(U.clamp(v, 1, 7)); ch(); }, 54, 1), ' días por semana (', numIn(g.weekHours, (v) => { g.weekHours = v; ch(); }, 54, 1), ' horas de contrato).'));
    const pt = h('input', { type: 'checkbox', checked: g.allowPT, 'aria-label': 'Permitir medio tiempo' }); pt.addEventListener('change', () => { g.allowPT = pt.checked; ch(); });
    c2.body.appendChild(h('p', { class: 'sentence' }, pt, ' Permitir medio tiempo de ', numIn(g.ptLen, (v) => { g.ptLen = v; ch(); }, 54, 0.5), ' horas, hasta el ', numIn(g.maxPT, (v) => { g.maxPT = v; ch(); }, 54, 1), ' % de las horas.'));
    c2.body.appendChild(h('p', { class: 'sentence' }, 'Merma: ', numIn(g.shrink, (v) => { g.shrink = U.clamp(v, 0, 80); ch(); }, 54, 1), ' % del tiempo pagado no se atiende (descansos, comida, faltas, capacitación).'));
    c2.body.appendChild(h('p', { class: 'sentence' }, 'Costo por hora: jornada completa ', numIn(g.costFT, (v) => { g.costFT = v; ch(); }, 70, 1), ', medio tiempo ', numIn(g.costPT, (v) => { g.costPT = v; ch(); }, 70, 1), '.'));
    if (M.kind === 'history') {
      const yEnd = U.dayInfo(M.R.k1).y; if (!g.year || g.year < yEnd || g.year > yEnd + 1) g.year = yEnd + 1;
      c2.body.appendChild(UI.grid(3, UI.select({ label: 'Año a planear', value: g.year, options: [[yEnd, String(yEnd)], [yEnd + 1, String(yEnd + 1)]], onChange: (v) => { g.year = +v; ch(); } }).el));
    }
    E.body.appendChild(c2.el);
    const prog = UI.progress();
    E.body.appendChild(h('div', { class: 'wz-nav' }, UI.btn('← Lo que dicen tus datos', () => WZ.go('revision'), 'btn-ghost'), h('div', { class: 'row' }, prog.el, UI.btn('Calcular mi plan', () => calcPlan(prog), 'btn-primary'))));
  }
  function staffCfg() {
    const g = W.goals;
    return { staff: { target: { type: 'sl', pct: g.pct / 100, tMin: g.tMin }, maxOcc: g.maxOcc / 100, patienceMin: g.leave ? g.patience : 0 }, shrink: g.shrink / 100,
      shift: { ftLen: g.ftLen, ptLen: g.ptLen, allowPT: g.allowPT, ftCost: g.costFT, ptCost: g.costPT, maxPT: g.maxPT / 100, startEvery: 60 }, weekHours: g.weekHours, daysFT: g.daysFT };
  }
  async function calcPlan(prog) {
    if (busy) return; busy = true;
    try {
      const g = W.goals; const cfg = staffCfg(); const se = seasonsNow();
      prog.set(0.05, 'Calculando…'); await U.tick();
      if (M.kind === 'history') {
        const evDays = new Map();
        for (const ev of M.events.filter((e) => e.on)) { const st = M.R.eventStats.find((x) => x.id === ev.id); for (const k of AN.eventDays(ev, g.year)) evDays.set(k, { name: ev.name, lift: st && isFinite(st.lift) ? st.lift : 1 }); }
        if (U.dayKey(g.year, 12, 31) > M.fc.kEnd) M.fc = FC.run(M.R, { kEnd: U.dayKey(g.year, 12, 31) });
        const ahtManual = M.svc.aht;
        PLAN = await FC.plan(M.R, M.fc, Object.assign({ kFrom: U.dayKey(g.year, 1, 1), kTo: U.dayKey(g.year, 12, 31), coverage: g.coverage, ahtMode: M.R.ds.has.svc ? 'data' : 'manual', ahtManual, seasons: se, basePolicy: 'min', evDays }, cfg), (f) => prog.set(f, `Mes ${Math.round(f * 12)} de 12`));
      } else {
        const mf = monthFactors(); const covF = { mean: 1, p75: 1.08, p90: 1.16 }[g.coverage] || 1;
        const year = new Date().getFullYear() + 1; const cache = new Map(); const months = [];
        for (let m = 1; m <= 12; m++) {
          const key = mf[m - 1].toFixed(4);
          let wp = cache.get(key);
          if (!wp) { const lg = M.lamWeek.map((r) => r.map((x) => x * mf[m - 1] * covF)); wp = FC.weekPlan(lg, M.openHours, M.ahtAt, m, cfg); cache.set(key, wp); }
          const dim = U.daysInMonth(year, m); const daysOpen = W.hours.days.reduce((a, b) => a + b, 0) * dim / 7;
          const weekVol = wp.lamGrid.reduce((s, r) => s + r.reduce((a, b) => a + b, 0), 0);
          months.push(Object.assign({}, wp, { y: year, m, season: se[m - 1], openDays: daysOpen, avgDay: weekVol / Math.max(1, W.hours.days.reduce((a, b) => a + b, 0)), costMonth: wp.costWeek * dim / 7 }));
          prog.set(m / 12, `Mes ${m} de 12`); await U.tick();
        }
        const base = Math.min(...months.map((x) => x.total)); months.forEach((x) => { x.temp = Math.max(0, x.total - base); });
        PLAN = { months, events: [], base, cov: covF };
      }
      // Plantilla base: la de la temporada normal (mediana); temporales arriba de ella y sobrantes abajo
      const normal = PLAN.months.filter((x) => x.season === 'Normal').map((x) => x.total);
      PLAN.base = normal.length ? Math.round(U.median(normal)) : Math.min(...PLAN.months.map((x) => x.total));
      PLAN.months.forEach((x) => { x.temp = Math.max(0, x.total - PLAN.base); x.over = Math.max(0, PLAN.base - x.total); });
      prog.set(1, 'Plan listo');
      const pk = PLAN.months.reduce((b, x) => (x.peakAg > b.peakAg ? x : b), PLAN.months[0]);
      W.planMonth = PLAN.months.indexOf(pk); W.planDow = pk.peakAt ? pk.peakAt.dow : 5; W.whatIf = { demand: 0, aht: 0, delta: 0 };
      WZ.go('plan');
    } catch (e) { console.error(e); U.toast('No se pudo calcular el plan: ' + e.message, 'bad', 7000); }
    busy = false;
  }

  /* ======================= 5. Tu plan ======================= */
  function rPlan() {
    if (!PLAN) { WZ.go('metas'); return; }
    const t = T(), g = W.goals, ms = PLAN.months, cur = g.cur || '$';
    const peak = ms.reduce((b, x) => (x.total > b.total ? x : b), ms[0]);
    const pkAg = ms.reduce((b, x) => (x.peakAg > b.peakAg ? x : b), ms[0]);
    const nFTb = Math.min(...ms.map((x) => x.nFT)), nPTb = Math.min(...ms.map((x) => x.nPT));
    const altaM = ms.filter((x) => x.temp > 0).map((x) => `${U.MESES_L[x.m - 1].toLowerCase()} (+${x.temp})`);
    const bajaM = ms.filter((x) => x.over > 0).map((x) => `${U.MESES_L[x.m - 1].toLowerCase()} (${x.over})`);
    const annual = ms.reduce((s, x) => s + x.costMonth, 0);
    const sum = UI.card(`Tu plan${W.name ? ' para ' + W.name : ''}`, { sub: `Meta: ${g.pct} % de los ${t.customers} espera menos de ${U.fmtTime(g.tMin)} · ${COVER[g.coverage].toLowerCase()} · ${M.label}. La plantilla base es la que necesita la temporada normal.` });
    sum.body.appendChild(h('ul', { class: 'insights big' },
      h('li', null, h('b', null, `${PLAN.base} personas de base todo el año`), ` (alrededor de ${nFTb} de jornada completa y ${nPTb} de medio tiempo).`),
      altaM.length ? h('li', null, h('b', null, 'Personal temporal o tiempo extra: '), altaM.join(', ') + '.') : h('li', null, 'No se necesita personal temporal: la demanda es estable durante el año.'),
      bajaM.length ? h('li', null, h('b', null, 'Personal que sobra: '), bajaM.join(', ') + '. Buen momento para vacaciones y capacitación.') : null,
      h('li', null, h('b', null, `${pkAg.peakAg} ${t.servL} abiertas`), ` en la hora más cargada del año (${pkAg.peakAt ? U.DIAS_L[pkAg.peakAt.dow].toLowerCase() + ' a las ' + U.fmtHour(pkAg.peakAt.hour) : ''} de ${U.MESES_L[pkAg.m - 1].toLowerCase()}).`),
      h('li', null, h('b', null, `Costo de personal: ${U.fmtMoney(annual, cur)} al año`), ` (${U.fmtMoney(annual / 12, cur)} al mes en promedio).`)));
    E.body.appendChild(sum.el);
    E.body.appendChild(h('div', { class: 'kpis' },
      UI.tile('Plantilla base', `${PLAN.base} personas`, 'contratación permanente', { state: 'good' }),
      UI.tile('Máximo en el año', `${peak.total} personas`, `${U.MESES_L[peak.m - 1]} · ${peak.temp} temporales o tiempo extra`),
      UI.tile(`${t.servers} en la hora pico`, U.fmtInt(pkAg.peakAg), `${U.fmt(pkAg.peakLam, 0)} ${t.customers} por hora`),
      UI.tile('Horas de trabajo por semana', U.fmt(U.mean(ms.map((x) => x.weekHours)), 0), `${U.fmt(U.mean(ms.map((x) => x.fte)), 1)} jornadas completas equivalentes`)));
    const pc = UI.chartCard('Personas necesarias por mes', { sub: 'La línea marca la plantilla base. Arriba de ella: temporales o tiempo extra; abajo: personal disponible para vacaciones y capacitación.', height: 280 });
    C.mount(pc.chartEl, (th) => {
      const o = C.base(th, { pointer: 'shadow' }); o.xAxis = C.xCat(th, ms.map((x) => U.MESES[x.m - 1])); o.yAxis = C.yVal(th, { name: 'Personas' });
      o.series = [C.bar(th, 'Base permanente', ms.map((x) => Math.min(x.total, PLAN.base)), 0, { stack: 'p' }), C.bar(th, 'Temporales o tiempo extra', ms.map((x) => x.temp), 1, { stack: 'p' })];
      o.series[0].markLine = C.refLine(th, PLAN.base, `plantilla base: ${PLAN.base}`);
      o.tooltip.formatter = (ps) => { const x = ms[ps[0].dataIndex]; return `${U.MESES_L[x.m - 1]} · temporada ${x.season}<br><b>${x.total}</b> personas (${x.nFT} jornada completa, ${x.nPT} medio tiempo)<br>${x.temp} temporales`; };
      return o;
    });
    pc.setTable(() => ({ headers: ['Mes', 'Temporada', { t: 'Personas', num: true }, { t: 'Jornada completa', num: true }, { t: 'Medio tiempo', num: true }, { t: 'Temporales', num: true }, { t: 'Costo mensual', num: true }],
      rows: ms.map((x) => [U.MESES_L[x.m - 1], x.season, x.total, x.nFT, x.nPT, x.temp, U.fmtMoney(x.costMonth, cur)]) }));
    E.body.appendChild(pc.el);
    // horario operativo
    const op = UI.card(`¿Cuántas ${t.servL} abrir cada hora?`, { sub: `Personal en atención (sin contar descansos) para una semana típica del mes elegido.` });
    const msel = UI.select({ label: 'Mes', value: W.planMonth || 0, options: ms.map((x, i) => [i, `${U.MESES_L[x.m - 1]} (${x.season})`]), onChange: (v) => { W.planMonth = +v; drawOp(); drawWhat(); } });
    const tbl = h('div'); const shifts = h('div');
    const dsel = UI.select({ label: 'Turnos del día', value: W.planDow != null ? W.planDow : 5, options: U.DIAS_L.map((d, i) => [i, d]), onChange: (v) => { W.planDow = +v; drawShifts(); } });
    op.body.appendChild(UI.grid(2, msel.el, dsel.el)); op.body.appendChild(tbl); op.body.appendChild(h('h4', null, 'Turnos sugeridos')); op.body.appendChild(shifts);
    const drawOp = () => {
      const x = ms[W.planMonth || 0]; U.clear(tbl);
      const hrs = []; for (let hh = 0; hh < 24; hh++) if (x.grid.some((r) => r[hh] > 0)) hrs.push(hh);
      const mx = Math.max(1, ...x.grid.flat());
      const table = h('table', { class: 'tbl compact schedule' }, h('thead', null, h('tr', null, h('th', null, 'Hora'), U.DIAS.map((d) => h('th', { class: 'num' }, d)))),
        h('tbody', null, hrs.map((hh) => h('tr', null, h('td', null, `${U.fmtHour(hh)}–${U.fmtHour(hh + 1)}`), U.range(7, (w) => {
          const v = x.grid[w][hh]; return h('td', { class: 'num cell', style: { background: v ? `color-mix(in srgb, var(--accent) ${Math.round(8 + 50 * v / mx)}%, transparent)` : '' } }, v ? String(v) : '');
        })))));
      tbl.appendChild(h('div', { class: 'tbl-scroll' }, table));
      drawShifts();
    };
    const drawShifts = () => {
      const x = ms[W.planMonth || 0]; const d = x.days[W.planDow != null ? W.planDow : 5]; U.clear(shifts);
      if (!d || !d.shifts || !d.shifts.length) { shifts.appendChild(h('p', { class: 'hint' }, 'Ese día no hay atención.')); return; }
      shifts.appendChild(UI.table(['Entrada', 'Salida', 'Tipo', { t: 'Personas', num: true }], d.shifts.map((s) => [U.fmtHour(d.open + s.start), U.fmtHour(d.open + s.start + s.len), s.name, s.n]), { compact: true }));
      shifts.appendChild(h('p', { class: 'hint' }, `${U.fmt(d.hours, 0)} horas programadas ese día, incluida la merma del ${g.shrink} %.`));
    };
    E.body.appendChild(op.el); drawOp();
    // ¿qué pasa si...?
    const wf = W.whatIf || (W.whatIf = { demand: 0, aht: 0, delta: 0 });
    const wc = UI.card('¿Qué pasa si…?', { sub: 'Mueve los controles y mira el efecto en la hora pico del mes elegido.' });
    const out = h('div', { class: 'whatif-out' });
    const slider = (label, key, min, max, step, fmt) => {
      const o = h('output'); const r = h('input', { type: 'range', min: String(min), max: String(max), step: String(step), value: String(wf[key]), 'aria-label': label });
      const upd = () => { o.textContent = fmt(+r.value); };
      r.addEventListener('input', () => { wf[key] = +r.value; upd(); drawWhatSoon(); }); upd();
      return h('label', { class: 'whatif-row' }, h('span', null, label), r, o);
    };
    wc.body.appendChild(h('div', { class: 'whatif' },
      slider('La demanda cambia', 'demand', -40, 60, 5, (v) => (v > 0 ? '+' : '') + v + ' %'),
      slider('El tiempo de atención cambia', 'aht', -40, 40, 5, (v) => (v > 0 ? '+' : '') + v + ' %'),
      slider(`${t.servers} abiertas en la hora pico`, 'delta', -5, 5, 1, (v) => (v > 0 ? '+' : '') + v + ' vs. el plan')));
    wc.body.appendChild(out);
    let whatTimer = 0;
    const drawWhatSoon = () => { clearTimeout(whatTimer); whatTimer = setTimeout(drawWhat, 120); };
    const drawWhat = () => {
      const x = ms[W.planMonth || 0]; U.clear(out); if (!x.peakAt) return;
      const { dow, hour } = x.peakAt; const cfg = staffCfg();
      const lam = x.lamGrid[dow][hour] * (1 + wf.demand / 100); const aht = M.ahtAt(x.m, hour) * (1 + wf.aht / 100);
      const need = ST.required(lam, aht, cfg.staff).c; const c = Math.max(1, x.grid[dow][hour] + wf.delta);
      const mu = 60 / aht, theta = cfg.staff.patienceMin > 0 ? 60 / cfg.staff.patienceMin : 0;
      const r = theta > 0 ? QS.Analytic.compute('erlangA', { lam, mu, c, theta }) : QS.Analytic.compute('mmc', { lam, mu, c });
      const sl = r.ok ? r.sl(g.tMin / 60) : 0; const st = sl >= g.pct / 100 ? 'good' : sl >= g.pct / 100 - 0.15 ? 'warn' : 'bad';
      out.appendChild(h('p', null, `Hora pico de ${U.MESES_L[x.m - 1].toLowerCase()}: ${U.DIAS_L[dow].toLowerCase()} de ${U.fmtHour(hour)} a ${U.fmtHour(hour + 1)}, con ${U.fmt(lam, 0)} ${t.customers}.`));
      out.appendChild(h('div', { class: 'kpis' },
        UI.tile(`Con ${c} ${t.servL}`, r.ok ? U.fmtPct(sl, 0) : 'Fila sin control', `espera menos de ${U.fmtTime(g.tMin)} (meta ${g.pct} %)`, { state: st }),
        UI.tile('Espera promedio', r.ok ? U.fmtTime(r.Wq * 60) : '∞', r.ok ? `${U.fmt(r.Lq, 1)} personas en fila en promedio` : 'la demanda supera la capacidad'),
        UI.tile(`${t.servers} ocupadas`, r.ok ? U.fmtPct(r.util, 0) : '100 %', 'del tiempo'),
        UI.tile('Para cumplir la meta', `${isFinite(need) ? need : '—'} ${t.servL}`, need > c ? `faltan ${need - c}` : need < c ? `sobran ${c - need}` : 'justo lo necesario', { state: need > c ? 'bad' : 'good' })));
      if (theta > 0 && r.ok) out.appendChild(h('p', { class: 'hint' }, `Además, ${U.fmtPct(r.Pab, 1)} de los ${t.customers} se iría sin ser atendido.`));
    };
    E.body.appendChild(wc.el); drawWhat();
    // acciones
    E.body.appendChild(h('div', { class: 'row' },
      UI.btn('Ver este día en la simulación', simulateDay, 'btn-primary'),
      UI.btn('Descargar el plan (CSV)', exportPlan, 'btn-sm'),
      UI.btn('Probar cajas rápidas o exclusivas', () => { simulateDay(true); }, 'btn-sm'),
      UI.btn('Análisis completo (especialistas)', openExpert, 'btn-ghost btn-sm')));
    if (PLAN.events && PLAN.events.length) {
      const ev = PLAN.events.filter((e) => e.extraPeak > 0 && (e.lift || 1) >= 1.05);
      if (ev.length) {
        const ec = UI.card('Refuerzos para fechas especiales', { sub: `${t.servers} adicionales en la hora pico frente a un día normal del mismo mes.` });
        ec.body.appendChild(UI.table(['Fecha', 'Evento', { t: `${t.servers} en el pico`, num: true }, { t: 'Refuerzo', num: true }], ev.map((e) => [`${U.DIAS[U.dayInfo(e.k).dow]} ${U.fmtDay(e.k)}`, e.name, e.peakAg, '+' + e.extraPeak]), { compact: true }));
        E.body.appendChild(ec.el);
      }
    }
    E.body.appendChild(navRow('metas', null));
  }
  function simulateDay(withExclusive) {
    const x = PLAN.months[W.planMonth || 0]; const w = W.planDow != null ? W.planDow : (x.peakAt ? x.peakAt.dow : 5); const d = x.days[w];
    if (!d || !d.lam || !d.lam.length) { U.toast('Ese día no hay atención.', 'warn'); return; }
    const t = T(), a = area(), g = W.goals;
    const floor = d.req.map((c) => Math.max(1, c));
    const aht = U.mean(d.lam.map((_, i) => M.ahtAt(x.m, d.open + i)));
    const cv = M.svc.cv || a.cv; const svc = Math.abs(cv - 1) < 0.08 ? { type: 'exp', mean: +aht.toFixed(3) } : { type: 'gamma', mean: +aht.toFixed(3), sd: +(aht * cv).toFixed(3) };
    const spec = QS.Sim.normalize({
      name: `${W.name || sec().name}: ${U.DIAS_L[w].toLowerCase()} típico de ${U.MESES_L[x.m - 1].toLowerCase()}`, open: d.open * 60, terms: { server: t.server, servers: t.servers, customer: t.customer },
      arrivals: { mode: 'profile', profile: d.lam.map((v) => +v.toFixed(1)) },
      renege: { on: !!(g.leave && g.patience > 0), dist: { type: 'exp', mean: g.patience || 10 } },
      stages: [{ name: t.servers, servers: Math.max(...floor), svc, queue: a.queue, jockey: a.queue === 'multi', select: 'shortest', useSchedule: true, schedule: floor }],
      run: { hours: d.lam.length, warmupH: 0, reps: 20, seed: 7, drain: true, slT: g.tMin }, cost: { server: g.costFT, wait: 0, lost: 0, cur: g.cur || '$' }
    });
    if (withExclusive && a.exclusive) {
      const ex = a.exclusive;
      spec.classes = [{ name: 'Clientes regulares', share: 100 - ex.share, prio: 2, svcMult: 1, patMult: 1 }, { name: ex.className, share: ex.share, prio: 1, svcMult: ex.mult, patMult: 1 }];
      spec.stages[0].queue = 'multi'; spec.stages[0].jockey = true;
      spec.stages[0].dedicated = { n: Math.max(1, Math.round(Math.max(...floor) * 0.25)), cls: 1, strict: !!ex.strict };
      spec.stages[0].useSchedule = false; spec.stages[0].servers = Math.max(...floor);
      spec.name += ` · con ${ex.label.toLowerCase()}`;
    }
    QS.App.go('sim'); QS.SimUI.load(spec, { play: true, simple: true });
  }
  function exportPlan() {
    const ms = PLAN.months; const rows = [];
    ms.forEach((x) => rows.push([`${x.y}-${U.pad2(x.m)}`, x.season, Math.round(x.avgDay), x.peakAg, Math.round(x.weekHours), +x.fte.toFixed(1), x.nFT, x.nPT, x.total, Math.min(x.total, PLAN.base), x.temp, Math.round(x.costMonth)]));
    let csv = U.toCSV(['mes', 'temporada', 'clientes_por_dia', 'servidores_hora_pico', 'horas_por_semana', 'fte', 'jornada_completa', 'medio_tiempo', 'personas', 'base', 'temporales', 'costo_mensual'], rows);
    const sched = []; ms.forEach((x) => { for (let w = 0; w < 7; w++) for (let hh = 0; hh < 24; hh++) if (x.grid[w][hh] > 0) sched.push([`${x.y}-${U.pad2(x.m)}`, U.DIAS_L[w], U.fmtHour(hh), x.grid[w][hh]]); });
    csv += '\r\n\r\n' + U.toCSV(['mes', 'dia', 'hora', 'servidores_en_atencion'], sched).replace('﻿', '');
    U.saveFile(`plan_${(W.name || sec().name).replace(/\W+/g, '_')}.csv`, csv, 'text/csv');
  }
})(typeof window !== 'undefined' ? window : globalThis);
