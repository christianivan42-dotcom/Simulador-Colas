/* Herramientas → "Personal por intervalo": personal requerido por intervalo, turnos óptimos y validación por simulación. */
(function (root) {
  'use strict';
  const QS = root.QS; const U = QS.U, h = U.h, UI = QS.UI, ST = QS.Staff;
  const SU = QS.StaffUI = {};
  let E = {};
  const DEF = () => ({
    step: 30, open: 480, hours: 12,
    vols: [30, 45, 60, 80, 95, 105, 110, 100, 95, 90, 85, 92, 100, 108, 104, 96, 90, 85, 80, 70, 58, 45, 35, 25],
    aht: 270, ahtUnit: 's', svcType: 'exp',
    target: { type: 'sl', pct: 80, tVal: 20, tUnit: 's', asa: 30, asaUnit: 's', pwait: 30, pab: 5 },
    maxOcc: 85, patience: 0, patUnit: 's', shrink: 30,
    ftLen: 8, ptLen: 4, allowPT: true, ftCost: 120, ptCost: 130, maxPT: 40, daysFT: 6, weekHours: 48, startEvery: 30, cur: '$', label: 'Día típico'
  });
  let S = Object.assign(DEF(), U.store.get('st:state', {}));
  const save = () => U.store.set('st:state', S);
  const nPer = () => Math.max(1, Math.round(S.hours * 60 / S.step));
  const perLabel = (i) => U.fmtClock(S.open + i * S.step);
  const toMin = (v, unit) => (unit === 's' ? v / 60 : unit === 'h' ? v * 60 : v);

  SU.init = function (view) {
    E.view = view; E.side = h('aside', { class: 'side', 'aria-label': 'Parámetros de dimensionamiento' }); E.out = h('div', { class: 'results' });
    U.clear(view);
    view.appendChild(h('div', { class: 'view-head' }, h('div', null, h('div', { class: 'eyebrow' }, 'Planeación de personal'), h('h2', null, 'Dimensionamiento por intervalo'),
      h('p', null, 'Calcula cuántos servidores hacen falta en cada intervalo para cumplir la meta de servicio (Erlang C, o Erlang A si hay abandono), aplica la merma y arma turnos de jornada completa y medio tiempo con programación entera.'))));
    view.appendChild(h('div', { class: 'workspace' }, E.side, E.out));
    renderSide(); compute();
  };
  SU.activate = () => QS.Charts.rerenderAll();
  // Recibe un perfil desde "Datos y pronóstico"
  SU.load = function (o) {
    Object.assign(S, o); if (o.vols) S.vols = o.vols.slice(); save(); renderSide(); compute();
    U.toast('Perfil cargado en Dimensionamiento: ' + (o.label || ''), 'ok');
  };

  function renderSide() {
    U.clear(E.side);
    const ch = () => { save(); compute(); };
    const head = h('div', { class: 'side-head' }, UI.text({ label: 'Nombre del perfil', value: S.label, onInput: (v) => { S.label = v; save(); } }).el);
    E.side.appendChild(head);
    const d = UI.section('Demanda por intervalo', { open: true });
    const openId = U.uid('op');
    const openIn = h('input', { id: openId, type: 'time', value: `${U.pad2(Math.floor(S.open / 60))}:${U.pad2(S.open % 60)}` });
    openIn.addEventListener('change', () => { const [a, b] = openIn.value.split(':').map(Number); S.open = (a || 0) * 60 + (b || 0); save(); renderSide(); compute(); });
    d.body.appendChild(UI.grid(2,
      h('label', { class: 'field', for: openId }, h('span', { class: 'lbl' }, 'Apertura'), h('span', { class: 'ctl' }, openIn)),
      UI.num({ label: 'Horas de operación', unit: 'h', value: S.hours, min: 1, max: 24, step: 0.5, onChange: (v) => { S.hours = U.clamp(v || 1, 1, 24); save(); renderSide(); compute(); } }).el,
      UI.select({ label: 'Intervalo', value: S.step, options: [[15, '15 minutos'], [30, '30 minutos'], [60, '60 minutos']], onChange: (v) => {
        const old = S.step; S.step = +v; S.vols = resample(S.vols, old, S.step); save(); renderSide(); compute();
      } }).el));
    d.body.appendChild(h('p', { class: 'hint' }, `Clientes o llamadas que llegan en cada intervalo de ${S.step} min (no por hora). Pega una columna desde Excel o envía un perfil desde Herramientas → "Análisis de series".`));
    d.body.appendChild(UI.hourly({ values: S.vols, count: nPer, labelFn: perLabel, onChange: (v) => { S.vols = v; ch(); } }).el);
    d.body.appendChild(UI.grid(2,
      UI.num({ label: 'Tiempo medio de atención (TMO/AHT)', value: S.aht, min: 0, onInput: (v) => { S.aht = v; ch(); }, help: 'Duración media de la atención, incluyendo el trabajo posterior (wrap-up) si ocupa al servidor.' }).el,
      UI.select({ label: 'Unidad', value: S.ahtUnit, options: [['s', 'segundos'], ['min', 'minutos']], onChange: (v) => { S.ahtUnit = v; ch(); } }).el));
    E.side.appendChild(d.el);

    const g = UI.section('Meta de servicio', { open: true });
    const tg = S.target;
    g.body.appendChild(UI.select({ label: 'Tipo de meta', value: tg.type, options: [['sl', 'Nivel de servicio: X % atendido antes de T'], ['asa', 'Espera media máxima (ASA)'], ['pwait', 'Probabilidad máxima de esperar'], ['pab', 'Abandono máximo (requiere paciencia)']],
      onChange: (v) => { tg.type = v; save(); renderSide(); compute(); } }).el);
    if (tg.type === 'sl') g.body.appendChild(UI.grid(3,
      UI.num({ label: 'X', unit: '%', value: tg.pct, min: 1, max: 99.9, onInput: (v) => { tg.pct = v; ch(); } }).el,
      UI.num({ label: 'T', value: tg.tVal, min: 0, onInput: (v) => { tg.tVal = v; ch(); } }).el,
      UI.select({ label: 'Unidad', value: tg.tUnit, options: [['s', 's'], ['min', 'min']], onChange: (v) => { tg.tUnit = v; ch(); } }).el));
    if (tg.type === 'asa') g.body.appendChild(UI.grid(2, UI.num({ label: 'Espera media máxima', value: tg.asa, min: 0, onInput: (v) => { tg.asa = v; ch(); } }).el,
      UI.select({ label: 'Unidad', value: tg.asaUnit, options: [['s', 's'], ['min', 'min']], onChange: (v) => { tg.asaUnit = v; ch(); } }).el));
    if (tg.type === 'pwait') g.body.appendChild(UI.num({ label: 'P(esperar) máxima', unit: '%', value: tg.pwait, min: 0, max: 100, onInput: (v) => { tg.pwait = v; ch(); } }).el);
    if (tg.type === 'pab') g.body.appendChild(UI.num({ label: 'Abandono máximo', unit: '%', value: tg.pab, min: 0, max: 100, onInput: (v) => { tg.pab = v; ch(); } }).el);
    g.body.appendChild(UI.grid(2,
      UI.num({ label: 'Ocupación máxima', unit: '%', value: S.maxOcc, min: 1, max: 100, help: 'Límite de utilización por agente para evitar desgaste (típico 80–90 %).', onInput: (v) => { S.maxOcc = v; ch(); } }).el,
      UI.num({ label: 'Paciencia media', value: S.patience, min: 0, help: '0 = los clientes no abandonan (Erlang C). Con un valor > 0 se usa Erlang A, que requiere menos personal porque parte de la demanda abandona.', onInput: (v) => { S.patience = v; ch(); } }).el,
      UI.select({ label: 'Unidad de paciencia', value: S.patUnit, options: [['s', 'segundos'], ['min', 'minutos']], onChange: (v) => { S.patUnit = v; ch(); } }).el));
    E.side.appendChild(g.el);

    const t = UI.section('Merma, turnos y contratos', { open: false });
    t.body.appendChild(UI.num({ label: 'Merma (shrinkage)', unit: '%', value: S.shrink, min: 0, max: 90, help: 'Tiempo pagado en que el personal no atiende: descansos, comidas, ausentismo, capacitación, juntas. Programados = requeridos / (1 − merma).', onInput: (v) => { S.shrink = v; ch(); } }).el);
    t.body.appendChild(UI.grid(2,
      UI.num({ label: 'Jornada completa', unit: 'h', value: S.ftLen, min: 1, max: 12, step: 0.5, onInput: (v) => { S.ftLen = v; ch(); } }).el,
      UI.num({ label: 'Medio tiempo', unit: 'h', value: S.ptLen, min: 1, max: 8, step: 0.5, onInput: (v) => { S.ptLen = v; ch(); } }).el,
      UI.num({ label: 'Costo jornada completa', unit: '/h', value: S.ftCost, min: 0, onInput: (v) => { S.ftCost = v; ch(); } }).el,
      UI.num({ label: 'Costo medio tiempo', unit: '/h', value: S.ptCost, min: 0, onInput: (v) => { S.ptCost = v; ch(); } }).el,
      UI.num({ label: 'Máximo de horas a medio tiempo', unit: '%', value: S.maxPT, min: 0, max: 100, onInput: (v) => { S.maxPT = v; ch(); } }).el,
      UI.select({ label: 'Inicio de turnos cada', value: S.startEvery, options: [[15, '15 min'], [30, '30 min'], [60, '60 min'], [120, '2 h']], onChange: (v) => { S.startEvery = +v; ch(); } }).el,
      UI.num({ label: 'Días laborables por persona', unit: 'por semana', value: S.daysFT, min: 1, max: 7, step: 1, onInput: (v) => { S.daysFT = v; ch(); } }).el,
      UI.num({ label: 'Horas de contrato', unit: 'por semana', value: S.weekHours, min: 1, onInput: (v) => { S.weekHours = v; ch(); } }).el));
    t.body.appendChild(UI.check({ label: 'Permitir turnos de medio tiempo', checked: S.allowPT, onChange: (v) => { S.allowPT = v; ch(); } }).el);
    t.body.appendChild(UI.text({ label: 'Moneda', value: S.cur, onInput: (v) => { S.cur = v || '$'; ch(); } }).el);
    E.side.appendChild(t.el);
    E.side.appendChild(h('div', { class: 'side-head' },
      UI.btn('Validar el plan con simulación', validate, 'btn-primary', { title: 'Simula la jornada con el perfil de demanda y los turnos obtenidos' }),
      h('div', { class: 'row' }, UI.btn('Exportar plan (CSV)', exportCSV, 'btn-sm'), UI.btn('Exportar a pyworkforce', exportPyW, 'btn-sm', { title: 'Script de Python para optimizar turnos con OR-Tools' }))));
  }
  function resample(v, from, to) {
    if (from === to) return v.slice();
    const perMin = []; v.forEach((x) => { for (let i = 0; i < from; i++) perMin.push(x / from); });
    const out = []; for (let i = 0; i < perMin.length; i += to) out.push(+perMin.slice(i, i + to).reduce((a, b) => a + b, 0).toFixed(3));
    return out;
  }
  function cfg() {
    const tg = S.target;
    let target;
    if (tg.type === 'asa') target = { type: 'asa', max: toMin(tg.asa, tg.asaUnit) };
    else if (tg.type === 'pwait') target = { type: 'pwait', max: tg.pwait / 100 };
    else if (tg.type === 'pab') target = { type: 'pab', max: tg.pab / 100, tMin: toMin(tg.tVal, tg.tUnit) };
    else target = { type: 'sl', pct: tg.pct / 100, tMin: toMin(tg.tVal, tg.tUnit) };
    if (!target.tMin) target.tMin = toMin(tg.tVal, tg.tUnit);
    return { target, maxOcc: S.maxOcc / 100, patienceMin: S.patience > 0 ? toMin(S.patience, S.patUnit) : 0 };
  }

  let last = null;
  function compute() {
    QS.Charts.prune(); U.clear(E.out);
    const n = nPer(); const vols = S.vols.slice(0, n); while (vols.length < n) vols.push(0);
    const aht = toMin(S.aht, S.ahtUnit); const c = cfg();
    if (!(aht > 0)) { E.out.appendChild(UI.note('Ingresa un tiempo medio de atención mayor que cero.', 'warn')); return; }
    if (c.target.type === 'pab' && !(c.patienceMin > 0)) E.out.appendChild(UI.note('La meta de abandono requiere una paciencia media mayor que cero (modelo Erlang A).', 'warn'));
    const rows = vols.map((v, i) => { const lamH = v * 60 / S.step; const r = ST.required(lamH, aht, c); return Object.assign({ i, vol: v, lamH, sched: Math.ceil(r.c / (1 - S.shrink / 100) - 1e-9) }, r); });
    const day = ST.dayShifts(rows.map((r) => r.sched), { step: S.step, ftLen: S.ftLen, ptLen: S.ptLen, allowPT: S.allowPT, ftCost: S.ftCost, ptCost: S.ptCost, maxPT: S.maxPT / 100, startEvery: S.startEvery });
    const hc = ST.headcount([day], { daysFT: S.daysFT, weekHours: S.weekHours });
    last = { rows, day, aht, c };
    const peak = rows.reduce((b, r) => (r.c > b.c ? r : b), rows[0]);
    const reqH = rows.reduce((s, r) => s + r.c, 0) * S.step / 60;
    const vol = rows.reduce((s, r) => s + r.vol, 0);
    const wl = vol * aht / 60;
    const ft = day.shifts.filter((s) => s.type === 'C').reduce((a, s) => a + s.n, 0), pt = day.shifts.filter((s) => s.type === 'M').reduce((a, s) => a + s.n, 0);
    const daysOpen = 7;
    const weeklyHours = day.hours * daysOpen;
    const people = Math.max(Math.ceil(ft * daysOpen / S.daysFT), ft) + Math.max(Math.ceil(pt * daysOpen / S.daysFT), pt);
    E.out.appendChild(h('div', { class: 'kpis' },
      UI.tile('Demanda del día', U.fmtInt(vol), `carga ${U.fmt(wl, 1)} horas de trabajo`),
      UI.tile('Agentes en el pico', U.fmtInt(peak.c), `${perLabel(peak.i)} · con merma ${peak.sched}`),
      UI.tile('Horas requeridas en piso', U.fmt(reqH, 1), `ocupación media ${U.fmtPct(wl / reqH)}`),
      UI.tile('Horas programadas', U.fmt(day.hours, 1), `cobertura eficiente al ${U.fmtPct(day.efficiency)}`, { help: 'Horas requeridas con merma divididas entre las horas de los turnos. El resto es exceso inevitable por la forma de los turnos.' }),
      UI.tile('Turnos del día', `${ft} + ${pt}`, 'jornada completa + medio tiempo'),
      UI.tile('Personas para operar 7 días', U.fmtInt(people), `${U.fmt(weeklyHours / S.weekHours, 1)} FTE de ${S.weekHours} h`, { help: 'Si este perfil se repite los 7 días: turnos diarios × 7 / días laborables por persona.' }),
      UI.tile('Costo de personal del día', U.fmtMoney(day.cost, S.cur), `método: ${day.method}`)));

    const labels = rows.map((r) => perLabel(r.i));
    const volC = UI.chartCard('Demanda por intervalo', { sub: `Clientes por intervalo de ${S.step} min.`, height: 240 });
    QS.Charts.bars(volC.chartEl, { categories: labels, yName: 'Clientes', series: [{ name: 'Demanda', data: rows.map((r) => r.vol) }] });
    volC.setTable(() => ({ headers: ['Intervalo', { t: 'Demanda', num: true }, { t: 'λ (/h)', num: true }], rows: rows.map((r, i) => [labels[i], U.fmt(r.vol, 1), U.fmt(r.lamH, 1)]) }));
    const covC = UI.chartCard('Requeridos vs programados', { sub: 'Agentes necesarios en piso, con merma y cobertura real de los turnos.', height: 280 });
    QS.Charts.lines(covC.chartEl, { categories: labels, yName: 'Agentes', series: [
      { name: 'Requeridos (Erlang)', data: rows.map((r) => r.c), step: 'end' },
      { name: 'Requeridos con merma', data: rows.map((r) => r.sched), step: 'end' },
      { name: 'Cubiertos por turnos', data: day.cover, step: 'end', area: true }] });
    covC.setTable(() => ({ headers: ['Intervalo', { t: 'Requeridos', num: true }, { t: 'Con merma', num: true }, { t: 'Cubiertos', num: true }, { t: 'Exceso', num: true }], rows: rows.map((r, i) => [labels[i], r.c, r.sched, day.cover[i], day.cover[i] - r.sched]) }));
    E.out.appendChild(h('div', { class: 'cols-2' }, volC.el, covC.el));

    const tbl = UI.card('Detalle por intervalo', { sub: c.patienceMin > 0 ? 'Modelo Erlang A (con abandono).' : 'Modelo Erlang C (sin abandono).' });
    const tShow = c.target.tMin;
    tbl.body.appendChild(UI.table(['Intervalo', { t: 'Demanda', num: true }, { t: 'Carga (Erl)', num: true }, { t: 'Agentes', num: true }, { t: `NS ≤ ${U.fmtTime(tShow)}`, num: true }, { t: 'Espera media', num: true }, { t: 'Ocupación', num: true }, { t: 'Abandono', num: true }, { t: 'Programados', num: true }],
      rows.map((r, i) => [labels[i], U.fmt(r.vol, 1), U.fmt(r.a, 2), r.c, U.fmtPct(r.sl), U.fmtTime(r.asa), U.fmtPct(r.occ), c.patienceMin > 0 ? U.fmtPct(r.pab) : '—', r.sched]),
      { compact: true, rowClass: (x, i) => (rows[i] === peak ? 'hl' : '') }));
    E.out.appendChild(tbl.el);

    const sh = UI.card('Turnos óptimos del día', { sub: `Resuelto con ${day.method === 'programación entera' ? 'programación entera (javascript-lp-solver): minimiza el costo cubriendo cada intervalo' : 'un algoritmo voraz'}.` });
    sh.body.appendChild(UI.table(['Entrada', 'Salida', 'Tipo', { t: 'Personas', num: true }],
      day.shifts.map((s) => [perLabel(s.start), U.fmtClock(S.open + (s.start + s.len) * S.step), s.name, s.n]), { compact: true }));
    E.out.appendChild(sh.el);

    // Tabla de Erlang
    const eCard = UI.card('Tabla de Erlang de un intervalo', { sub: 'Cómo cambian los indicadores con cada agente adicional.' });
    const sel = UI.select({ label: 'Intervalo', value: peak.i, options: rows.map((r, i) => [i, `${labels[i]} · ${U.fmt(r.vol, 1)} clientes`]), onChange: (v) => renderErlang(+v) });
    const box = h('div');
    eCard.body.appendChild(sel.el); eCard.body.appendChild(box);
    const renderErlang = (i) => {
      U.clear(box); const r = rows[i]; const tb = ST.erlangTable(r.lamH, aht, c, Math.max(1, r.c - 4), 10);
      box.appendChild(UI.table([{ t: 'Agentes', num: true }, { t: `NS ≤ ${U.fmtTime(tShow)}`, num: true }, { t: 'Espera media', num: true }, { t: 'P(esperar)', num: true }, { t: 'Ocupación', num: true }, { t: 'Abandono', num: true }],
        tb.map((x) => [x.c, x.ok ? U.fmtPct(x.sl) : 'inestable', x.ok ? U.fmtTime(x.asa) : '∞', x.ok ? U.fmtPct(x.pw) : '—', x.ok ? U.fmtPct(x.occ) : '—', c.patienceMin > 0 && x.ok ? U.fmtPct(x.pab) : '—']),
        { compact: true, rowClass: (x, j) => (tb[j].c === r.c ? 'hl' : '') }));
      const sq = QS.Analytic.sqrtStaffing(r.a, Math.max(0.01, 1 - (c.target.pct || 0.8)));
      box.appendChild(h('p', { class: 'note-sm' }, `Regla de la raíz cuadrada (Halfin-Whitt) como referencia rápida: c ≈ a + β√a = ${U.fmt(r.a, 2)} + ${U.fmt(sq.beta, 2)}·√${U.fmt(r.a, 2)} ≈ ${U.fmt(sq.c, 1)} agentes.`));
    };
    renderErlang(peak.i);
    E.out.appendChild(eCard.el);
  }

  function validate() {
    if (!last) return;
    const { rows, day, aht, c } = last;
    const H = Math.ceil(S.hours); const per = 60 / S.step;
    const prof = U.range(H, (hh) => rows.filter((r) => Math.floor(r.i / per) === hh).reduce((s, r) => s + r.vol, 0));
    const sched = U.range(H, (hh) => { const xs = day.cover.filter((x, i) => Math.floor(i / per) === hh); return xs.length ? Math.max(0, Math.round(xs.reduce((a, b) => a + b, 0) / xs.length * (1 - S.shrink / 100))) : 0; });
    const spec = QS.Sim.normalize({
      name: 'Validación — ' + S.label, open: S.open,
      arrivals: { mode: 'profile', profile: prof },
      renege: { on: c.patienceMin > 0, dist: { type: 'exp', mean: c.patienceMin || 1 } },
      stages: [{ name: 'Agentes', servers: Math.max(1, ...sched), svc: { type: 'exp', mean: aht }, useSchedule: true, schedule: sched }],
      run: { hours: H, warmupH: 0, reps: 20, seed: 99, drain: true, slT: c.target.tMin || 1 }, cost: { server: S.ftCost, wait: 0, lost: 0, cur: S.cur }
    });
    QS.App.go('sim'); QS.SimUI.load(spec, { run: true });
    U.toast('Se simulan los agentes en piso (turnos menos la merma) con llegadas variables por hora.', 'info', 6000);
  }
  function exportCSV() {
    if (!last) return;
    const { rows, day } = last;
    const csv = U.toCSV(['intervalo', 'demanda', 'lambda_por_hora', 'carga_erlangs', 'agentes_requeridos', 'nivel_servicio', 'espera_media_min', 'ocupacion', 'abandono', 'programados_con_merma', 'cubiertos_por_turnos'],
      rows.map((r, i) => [perLabel(r.i), r.vol, r.lamH, r.a, r.c, r.sl, r.asa, r.occ, r.pab, r.sched, day.cover[i]]));
    U.saveFile('plan_personal_' + S.label.replace(/\W+/g, '_') + '.csv', csv, 'text/csv;charset=utf-8');
  }
  function exportPyW() {
    if (!last) return;
    const { rows } = last; const P = rows.length; const per = 60 / S.step;
    const shifts = {};
    const add = (name, lenH) => { const len = Math.round(lenH * per); for (let s = 0; s + len <= P; s += Math.max(1, Math.round(S.startEvery / S.step))) shifts[`${name} ${perLabel(s)}`] = U.range(P, (i) => (i >= s && i < s + len ? 1 : 0)); };
    add('Completa', S.ftLen); if (S.allowPT) add('Medio', S.ptLen);
    const costs = {}; Object.keys(shifts).forEach((k) => { costs[k] = (k.startsWith('Medio') ? S.ptCost * S.ptLen : S.ftCost * S.ftLen); });
    const code = QS.Export.pyworkforce({ required: [rows.map((r) => r.sched)], shifts, costs, title: `${S.label}, intervalos de ${S.step} min desde ${perLabel(0)}` });
    UI.codeModal('Optimizar turnos con pyworkforce (Python)', code, 'turnos_pyworkforce.py', 'pyworkforce resuelve el mismo problema de cobertura con el optimizador CP-SAT de Google OR-Tools; útil para problemas grandes (varias semanas, muchas reglas de turno).');
  }
})(typeof window !== 'undefined' ? window : globalThis);
