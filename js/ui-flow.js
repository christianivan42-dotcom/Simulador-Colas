/* Recorrido guiado en cinco pasos: la herramienta principal.
   1. Tu operación: modelo de atención (áreas, tipos de cliente) y meta.
   2. Tus datos: un solo archivo con todas las áreas (o uno por área), con reconocimiento de columnas, de tipos y de quién registra;
      periodo común de las áreas y revisión del enlace entre documentos.
   3. Personal y mediciones: personal por hora y lo que los reportes no guardan (atención, traslado entre áreas), con cronómetro.
   4. Diagnóstico: cada día de la semana simulado con el personal que hubo, validado contra los datos.
   5. Plan de personal: personas por hora para cumplir la meta (Erlang C + simulación), turnos y la fila en movimiento. */
(function (root) {
  'use strict';
  const QS = root.QS; const U = QS.U, h = U.h, UI = QS.UI, D = QS.Data, MS = QS.Measure, C = QS.Charts;
  const F = QS.Flow = {};
  QS.MeasureUI = F;
  const STEPS = [['proceso', 'Tu operación'], ['archivos', 'Tus datos'], ['mediciones', 'Personal y mediciones'], ['diagnostico', 'Diagnóstico'], ['plan', 'Plan de personal']];
  const idx = (id) => STEPS.findIndex((s) => s[0] === id);
  const emptyMeas = () => ({ svc: {}, typed: {}, walk: [], walkTyped: null });
  const normMeas = (m) => Object.assign(emptyMeas(), m && typeof m === 'object' ? m : {});
  const S = {
    step: U.store.get('flow:step', 'proceso'),
    proc: U.store.get('flow:proc', null),
    company: U.store.get('flow:company', ''),
    goal: Object.assign({ pct: 80, tMin: 5 }, U.store.get('flow:goal', {})),
    meas: normMeas(U.store.get('flow:meas', null)), exMeas: null,
    slots: [], areas: null, comb: null, example: false, exampleFiles: null,
    diag: null, plan: null, running: [], view: { area: 0, metric: 'sl', dow: null, planDow: null, valDow: null },
    planCfg: Object.assign({ dayType: 'normal', month: -1, extra: 0 }, U.store.get('flow:plan', {})), cmpCfg: null, cmp: null, busy: false,
    baseWeeks: U.store.get('flow:baseWeeks', 13),
    staffNow: U.store.get('flow:staff', {}) || {}, exStaff: null, players: [],
    mode: U.store.get('flow:mode', 'uno'), single: null, check: null
  };
  if (!S.proc || !Array.isArray(S.proc.areas) || !S.proc.areas.length) S.proc = MS.fromTemplate('retail_credito');
  if (idx(S.step) < 0) S.step = 'proceso';
  const E = {};
  const saveProc = () => U.store.set('flow:proc', S.proc);
  const saveMeas = () => { if (!S.example) U.store.set('flow:meas', S.meas); };
  const measNow = () => (S.example ? S.exMeas || emptyMeas() : S.meas);
  const reduced = () => !!(root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const lower = (s) => String(s || '').toLowerCase();
  const short = (name) => String(name || '').split(':')[0].trim();
  const pct0 = (x) => U.fmtPct(x, 0);
  const notify = () => { if (QS.App && QS.App.refreshNav) QS.App.refreshNav(); };
  const add = (el) => { if (el) E.view.appendChild(el); return el; };
  function resetResults() { S.diag = null; S.plan = null; S.cmp = null; }
  function structureChanged() { S.check = null; S.comb = null; S.areas = null; S.slots.forEach((s) => { if (s) s.res = null; }); resetResults(); saveProc(); notify(); }

  /* ======================= piezas comunes ======================= */
  function head(i, title, lead) {
    return h('div', { class: 'step-head' },
      h('div', { class: 'topsteps', role: 'navigation', 'aria-label': 'Pasos' }, F.steps().map((s, k) => {
        const b = h('button', { type: 'button', class: 'topstep' + (s.id === S.step ? ' is-current' : ''), disabled: !s.enabled }, h('span', { class: 'rail-n' }, s.done && s.id !== S.step ? UI.icon('check') : String(k + 1)), s.name);
        b.addEventListener('click', () => F.go(s.id)); return b;
      })),
      h('span', { class: 'step-k' }, `Paso ${i + 1} de ${STEPS.length} · ${STEPS[i][1]}`), h('h1', null, title), lead ? h('p', { class: 'lead' }, lead) : null);
  }
  function foot(back, next, nextLabel, o = {}) {
    const bar = h('div', { class: 'step-foot' });
    if (back) bar.appendChild(UI.btn([UI.icon('chevL'), 'Atrás'], () => F.go(back), 'btn-ghost'));
    const grow = h('div', { class: 'grow' }); bar.appendChild(grow);
    if (o.prog) grow.appendChild(o.prog.el);
    if (o.note) grow.appendChild(h('span', null, o.note));
    if (o.extra) o.extra.forEach((b) => bar.appendChild(b));
    if (next) { const b = UI.btn([nextLabel, UI.icon('chevR')], next, 'btn-primary btn-lg', { disabled: o.disabled ? true : null }); bar.appendChild(b); bar.next = b; }
    return bar;
  }
  function exampleBanner() {
    if (!S.example) return null;
    return h('div', { class: 'banner' }, UI.tag('Ejemplo', 'info'), h('span', { class: 'grow' }, 'Estás viendo una tienda ficticia con 4 meses de facturas y recibos, y mediciones en tienda de muestra. Ningún número es de tu empresa.'),
      UI.btn([UI.icon('upload'), 'Usar mis reportes'], () => { clearExample(); F.go('archivos'); }, 'btn-sm'));
  }
  function needsNow() { return S.areas ? MS.measurementNeeds(S.proc, S.areas, measNow()) : []; }
  const pending = () => needsNow().filter((n) => n.state === 'falta' || n.state === 'parcial');
  function prelimNote() {
    const p = pending(); if (!p.length) return null;
    return UI.callout('warn', h('span', null, h('b', null, 'Resultados preliminares. '), `${p.length === 1 ? 'Falta una medición' : `Faltan ${p.length} mediciones`} en tienda: ${p.map((n) => (n.kind === 'walk' ? 'el traslado entre áreas' : 'la atención en ' + short(S.proc.areas[n.ai].name))).join(' y ')}. `,
      h('button', { type: 'button', class: 'link', onclick: () => F.go('mediciones') }, 'Ir a mediciones')));
  }
  function needData() {
    add(UI.callout('info', 'Primero sube los reportes de tu sistema en el paso 2.'));
    add(foot('archivos', null));
  }

  /* ======================= mapa animado del proceso ======================= */
  const NS = 'http://www.w3.org/2000/svg';
  const sv = (tag, attrs, ...kids) => {
    const el = document.createElementNS(NS, tag);
    for (const k in attrs || {}) if (attrs[k] != null) el.setAttribute(k, attrs[k]);
    kids.forEach((x) => { if (x == null) return; el.appendChild(typeof x === 'string' ? document.createTextNode(x) : x); });
    return el;
  };
  const wrapTxt = (s, n) => { const w = String(s).split(/\s+/); const lines = []; let cur = ''; for (const x of w) { if ((cur + ' ' + x).trim().length > n && cur) { lines.push(cur); cur = x; } else cur = (cur + ' ' + x).trim(); } if (cur) lines.push(cur); return lines.slice(0, 3); };
  function processMap(proc, o = {}) {
    const pal = C.theme().pal;
    const nA = proc.areas.length, nF = proc.flows.length;
    const W = Math.max(640, 300 + nA * 250), laneH = 60, top = 122, H = top + nF * laneH + 40;
    const left = 214, entryX = 236, exitX = W - 44;
    const span = (exitX - entryX - 40) / nA, colW = Math.min(214, span - 22);
    const cx = (i) => entryX + 20 + (i + 0.5) * span;
    const svg = sv('svg', { viewBox: `0 0 ${W} ${H}`, class: 'pmap', role: 'img', 'aria-label': 'Mapa del proceso: ' + proc.flows.map((f) => `${f.name} pasa por ${f.steps.map((s, i) => (s ? proc.areas[i].name : null)).filter(Boolean).join(' y ')}`).join('; ') });
    svg.appendChild(sv('defs', null, sv('marker', { id: 'pm-arrow', viewBox: '0 0 10 10', refX: '8', refY: '5', markerWidth: '7', markerHeight: '7', orient: 'auto-start-reverse' }, sv('path', { d: 'M0,0 L10,5 L0,10 z', style: 'fill: var(--muted)' }))));
    proc.areas.forEach((a, i) => {
      const x = cx(i) - colW / 2, res = o.areas && o.areas[i];
      svg.appendChild(sv('rect', { x, y: 8, width: colW, height: H - 16, rx: 10, class: 'pm-col' }));
      const tl = wrapTxt(a.name, 24); const ty = 30;
      tl.forEach((l, k) => svg.appendChild(sv('text', { x: cx(i), y: ty + k * 17, class: 'pm-area', 'text-anchor': 'middle' }, l)));
      const subs = res ? [`${U.fmtInt(res.openDays ? res.nVis / res.openDays : 0)} clientes por día`, `hasta ${Math.round(Math.max(...res.sHeat.map((r) => Math.max(...r))))} ${lower(a.staff || 'puntos')} a la vez`] : [a.staff || ''];
      subs.forEach((t, k) => svg.appendChild(sv('text', { x: cx(i), y: ty + tl.length * 17 + 4 + k * 15, class: 'pm-sub', 'text-anchor': 'middle' }, t)));
      svg.appendChild(sv('text', { x: x + 12, y: 22, class: 'pm-k' }, String(i + 1)));
    });
    svg.appendChild(sv('text', { x: entryX - 4, y: top - 18, class: 'pm-sub', 'text-anchor': 'middle' }, 'Llegan'));
    svg.appendChild(sv('text', { x: exitX, y: top - 18, class: 'pm-sub', 'text-anchor': 'middle' }, 'Salen'));
    const anim = !reduced() && o.animate !== false;
    proc.flows.forEach((f, j) => {
      const y = top + j * laneH + laneH / 2, col = pal[j % pal.length];
      const share = o.shares ? o.shares[j] : null;
      const nl = wrapTxt(f.name, 26);
      nl.forEach((l, k) => svg.appendChild(sv('text', { x: left - 14, y: y - (nl.length - 1) * 8 + k * 16 + (share != null ? -6 : 4), class: 'pm-flow', 'text-anchor': 'end' }, l)));
      if (share != null) svg.appendChild(sv('text', { x: left - 14, y: y + (nl.length - 1) * 8 + 16, class: 'pm-share', 'text-anchor': 'end', style: `fill:${col}` }, pct0(share)));
      svg.appendChild(sv('circle', { cx: left - 2, cy: y, r: 5, style: `fill:${col}` }));
      svg.appendChild(sv('line', { x1: entryX, y1: y, x2: exitX, y2: y, class: 'pm-lane', style: `stroke:${col}`, 'marker-end': 'url(#pm-arrow)' }));
      const pills = [], stops = [];
      proc.areas.forEach((a, i) => {
        const ty = f.steps[i];
        if (!ty) { pills.push(sv('text', { x: cx(i), y: y + 4, class: 'pm-skip', 'text-anchor': 'middle' }, 'no pasa')); return; }
        const res = o.areas && o.areas[i]; const ti = a.types.indexOf(ty); const s = res && res.svc[ti];
        const label = ty.length > 24 ? ty.slice(0, 23) + '…' : ty;
        const svcTxt = s ? `${U.fmtTime(s.mean)} por atención` : '';
        const pw = Math.min(colW - 10, Math.max(104, label.length * 7.9 + 24, svcTxt.length * 7.0 + 26));
        stops.push(cx(i) - pw / 2 - 10);
        pills.push(sv('rect', { x: cx(i) - pw / 2, y: y - 18, width: pw, height: 36, rx: 18, class: 'pm-pill', style: `stroke:${col}` }));
        pills.push(sv('text', { x: cx(i), y: y + (s ? -2 : 5), class: 'pm-type', 'text-anchor': 'middle' }, label));
        if (s) pills.push(sv('text', { x: cx(i), y: y + 13, class: 'pm-svc', 'text-anchor': 'middle' }, svcTxt));
      });
      const n = U.clamp(Math.round((share != null ? share : 1 / nF) * 14), 1, 7);
      const L = exitX - entryX, dwell = 0.16;
      const pts = [0]; const kt = [0]; let tt = 0, last = 0;
      for (const x of stops) { const q = (x - entryX) / L; tt += q - last; pts.push(q, q); kt.push(tt, tt + dwell); tt += dwell; last = q; }
      tt += 1 - last; pts.push(1); kt.push(tt);
      const keyTimes = kt.map((x) => (x / tt).toFixed(4)).join(';'), keyPoints = pts.map((x) => x.toFixed(4)).join(';');
      const dur = 7 + stops.length * 1.4;
      for (let k = 0; k < n; k++) {
        const c = sv('circle', { r: 6.5, cx: 0, cy: 0, class: 'pm-dot', style: `fill:${col}` });
        if (anim) c.appendChild(sv('animateMotion', { dur: dur + 's', repeatCount: 'indefinite', begin: (-k * dur / n).toFixed(2) + 's', path: `M${entryX},${y} L${exitX},${y}`, keyPoints, keyTimes, calcMode: 'linear' }));
        else { if (k >= stops.length) break; c.setAttribute('cx', String(stops[k])); c.setAttribute('cy', String(y)); }
        svg.appendChild(c);
      }
      pills.forEach((el) => svg.appendChild(el));
    });
    return svg;
  }
  function mapBox(o) {
    const box = h('div', { class: 'pmap-wrap' });
    const draw = () => { U.clear(box); box.appendChild(processMap(S.proc, o)); };
    draw(); E.maps.push(draw);
    return box;
  }
  const refreshMaps = () => (E.maps || []).forEach((f) => { try { f(); } catch (e) { console.error(e); } });

  /* ======================= 1. Tu operación ======================= */
  function rProceso() {
    const p = S.proc;
    add(head(0, '¿Cómo atienden a tus clientes?', 'Elige el modelo más parecido a tu operación y escribe tu meta de atención. Todo se puede ajustar después.'));
    const c1 = UI.panel('Modelo de atención');
    c1.body.appendChild(h('div', { class: 'fgrid c2' }, UI.text({ label: 'Empresa o sucursal (opcional)', id: 'f-company', value: S.company, placeholder: 'Ej.: Tienda Centro',
      onInput: (v) => { S.company = v; U.store.set('flow:company', v); notify(); } }).el));
    c1.body.appendChild(h('div', { class: 'models', role: 'group', 'aria-label': 'Modelo de atención' }, MS.TEMPLATES.map((t) => {
      const on = p.template === t.id;
      const b = h('button', { type: 'button', class: 'model', 'aria-pressed': String(on) }, h('b', null, t.name), h('span', null, t.desc));
      b.addEventListener('click', () => {
        if (p.template === t.id) return;
        const had = S.slots.some(Boolean) || S.example;
        S.proc = MS.fromTemplate(t.id); S.slots = []; S.example = false; S.exMeas = null; structureChanged(); render();
        if (had) U.toast('Se quitaron los archivos cargados porque cambió el modelo de atención.', 'info', 4500);
      });
      return b;
    })));
    E.mapHolder = h('div'); E.mapHolder.appendChild(mapBox({ shares: S.comb ? S.comb.flows.map((f) => f.share) : null, areas: S.comb ? S.areas : null }));
    c1.body.appendChild(E.mapHolder);
    c1.body.appendChild(h('p', { class: 'hint' }, S.comb ? 'Porcentajes y tiempos medidos con tus datos.' : 'Cada línea es un tipo de cliente; los puntos se detienen en las áreas que lo atienden. Los porcentajes aparecen al subir tus datos.'));
    const redrawMap = U.debounce(refreshMaps, 250);
    const adv = h('div', { class: 'stack' });
    const grid = h('div', { class: 'area-grid' }); p.areas.forEach((a, i) => grid.appendChild(areaEditor(a, i, redrawMap)));
    adv.appendChild(h('h3', null, 'Áreas'));
    adv.appendChild(grid);
    if (p.areas.length < 4) adv.appendChild(UI.btn('Agregar un área', () => { p.areas.push({ name: 'Área ' + (p.areas.length + 1), staff: 'Personal', server: 'puesto', types: ['Atención'], queue: 'single' }); p.flows.forEach((f) => f.steps.push(null)); S.slots.push(null); structureChanged(); render(); }, 'btn-sm'));
    adv.appendChild(h('h3', null, 'Tipos de cliente'));
    adv.appendChild(h('p', { class: 'hint' }, 'Por qué áreas pasa cada tipo de cliente y qué transacción hace en cada una.'));
    const headR = ['Tipo de cliente'].concat(p.areas.map((a, i) => `${i + 1}. ${short(a.name)}`), ['']);
    adv.appendChild(UI.table(headR, p.flows.map((f, j) => {
      const name = h('input', { type: 'text', value: f.name, class: 'cell-in', 'aria-label': 'Nombre del tipo de cliente' });
      name.addEventListener('input', () => { f.name = name.value; saveProc(); redrawMap(); });
      const cells = p.areas.map((a, i) => {
        const sel = h('select', { class: 'cell-in', 'aria-label': `${f.name} en ${a.name}` }, [h('option', { value: '' }, 'No pasa')].concat(a.types.map((ty) => h('option', { value: ty }, ty))));
        sel.value = f.steps[i] || '';
        sel.addEventListener('change', () => { f.steps[i] = sel.value || null; structureChanged(); refreshMaps(); renderErrors(); });
        return sel;
      });
      const del = p.flows.length > 1 ? UI.btn('Quitar', () => { p.flows.splice(j, 1); structureChanged(); render(); }, 'btn-ghost btn-sm') : '';
      return [name].concat(cells, [del]);
    }), { compact: true }));
    if (p.flows.length < 8) adv.appendChild(UI.btn('Agregar un tipo de cliente', () => { p.flows.push({ name: 'Nuevo tipo de cliente', steps: p.areas.map((a, i) => (i === 0 ? a.types[0] : null)) }); structureChanged(); render(); }, 'btn-sm'));
    E.errs = h('div'); adv.appendChild(E.errs); renderErrors();
    c1.body.appendChild(h('details', { class: 'more', open: MS.validate(p).length > 0 }, h('summary', null, 'Ajustar áreas y tipos de cliente'), adv));
    add(c1.el);
    const c2 = UI.panel('Meta de atención', { sub: 'Con esta meta se mide tu operación y se calcula el personal.' });
    const inPct = numIn(S.goal.pct, (v) => { S.goal.pct = U.clamp(Math.round(v), 50, 99); U.store.set('flow:goal', S.goal); S.plan = null; notify(); }, 1, 'f-goal-pct');
    const inT = numIn(S.goal.tMin, (v) => { S.goal.tMin = U.clamp(v, 0.5, 120); U.store.set('flow:goal', S.goal); resetResults(); notify(); }, 0.5, 'f-goal-t');
    c2.body.appendChild(h('p', { class: 'goal-line' }, 'Que el ', inPct, ' % de los clientes espere menos de ', inT, ' minutos en cada área.'));
    add(c2.el);
    add(foot(null, () => { const errs = MS.validate(S.proc); if (errs.length) { U.toast('Revisa el modelo: ' + errs[0], 'warn'); return; } F.go('archivos'); }, 'Continuar'));
  }
  function renderErrors() { if (!E.errs) return; U.clear(E.errs); const errs = MS.validate(S.proc); if (errs.length) E.errs.appendChild(UI.callout('warn', errs.join(' '))); }
  function numIn(v, on, step, id) {
    const i = h('input', { type: 'number', value: String(v), step: String(step || 'any'), min: '0', class: 'inline-num', id: id || null, 'aria-label': 'valor', style: { width: '76px' } });
    i.addEventListener('change', () => { const x = parseFloat(i.value); if (isFinite(x)) on(x); });
    return i;
  }
  function areaEditor(a, i, redrawMap) {
    const p = S.proc;
    const box = h('div', { class: 'area-ed' });
    const move = (d) => {
      const j = i + d; if (j < 0 || j >= p.areas.length) return;
      [p.areas[i], p.areas[j]] = [p.areas[j], p.areas[i]]; p.flows.forEach((f) => { [f.steps[i], f.steps[j]] = [f.steps[j], f.steps[i]]; });
      [S.slots[i], S.slots[j]] = [S.slots[j], S.slots[i]]; structureChanged(); render();
    };
    box.appendChild(h('div', { class: 'row area-top' }, h('span', { class: 'area-k' }, String(i + 1)), h('b', null, 'Área ' + (i + 1)), h('span', { style: { flex: '1' } }),
      i > 0 ? UI.btn(UI.icon('chevL'), () => move(-1), 'btn-ghost btn-sm', { 'aria-label': 'Mover antes', title: 'Mover antes' }) : null,
      i < p.areas.length - 1 ? UI.btn(UI.icon('chevR'), () => move(1), 'btn-ghost btn-sm', { 'aria-label': 'Mover después', title: 'Mover después' }) : null,
      p.areas.length > 1 ? UI.btn('Quitar', () => { p.areas.splice(i, 1); p.flows.forEach((f) => f.steps.splice(i, 1)); p.flows = p.flows.filter((f) => f.steps.some(Boolean)); if (!p.flows.length) p.flows.push({ name: 'Clientes', steps: p.areas.map((x, k) => (k === 0 ? x.types[0] : null)) }); S.slots.splice(i, 1); structureChanged(); render(); }, 'btn-ghost btn-sm') : null));
    box.appendChild(UI.grid(2,
      UI.text({ label: 'Nombre del área', value: a.name, onInput: (v) => { a.name = v || 'Área ' + (i + 1); saveProc(); redrawMap(); } }).el,
      UI.text({ label: 'Quién atiende', value: a.staff, placeholder: 'Cajeras, facturadoras…', onInput: (v) => { a.staff = v; saveProc(); redrawMap(); } }).el,
      UI.text({ label: 'Punto de atención', value: a.server, placeholder: 'caja, puesto, ventanilla', onInput: (v) => { a.server = v; saveProc(); } }).el,
      UI.select({ label: 'Fila', value: a.queue || 'single', options: [['single', 'Fila única'], ['multi', 'Una fila por punto']], onChange: (v) => { a.queue = v; S.comb = null; resetResults(); saveProc(); notify(); } }).el));
    box.appendChild(h('span', { class: 'lbl' }, 'Tipos de transacción'));
    const list = h('div', { class: 'type-list' });
    a.types.forEach((ty, k) => {
      const inp = h('input', { type: 'text', value: ty, class: 'cell-in', 'aria-label': 'Tipo de transacción' });
      inp.addEventListener('change', () => {
        const nv = inp.value.trim(); if (!nv || nv === ty) { inp.value = ty; return; }
        if (a.types.includes(nv)) { U.toast('Ya existe ese tipo en esta área.', 'warn'); inp.value = ty; return; }
        a.types[k] = nv; p.flows.forEach((f) => { if (f.steps[i] === ty) f.steps[i] = nv; }); structureChanged(); render();
      });
      list.appendChild(h('div', { class: 'type-row' }, inp, a.types.length > 1 ? UI.btn(UI.icon('x'), () => { a.types.splice(k, 1); p.flows.forEach((f) => { if (f.steps[i] === ty) f.steps[i] = null; }); structureChanged(); render(); }, 'btn-ghost btn-sm', { 'aria-label': 'Quitar ' + ty, title: 'Quitar' }) : null));
    });
    box.appendChild(list);
    if (a.types.length < 8) box.appendChild(UI.btn('Agregar tipo', () => { let n = 1; while (a.types.includes('Tipo ' + n)) n++; a.types.push('Tipo ' + n); structureChanged(); render(); }, 'btn-ghost btn-sm'));
    return box;
  }

  /* ======================= 2. Tus datos ======================= */
  const FIELD_LABEL = { fecha_hora: 'Fecha y hora (o solo la fecha)', hora: 'Hora (si viene aparte)', punto: 'Quién atiende (usuario creador, cajero o caja)', tipo: 'Tipo de transacción', documento: 'Número de documento',
    cliente: 'Cliente', relacionado: 'Documento relacionado', inicio: 'Hora de inicio de la atención', llegada: 'Hora de llegada (turno)', estado: 'Estado', area: 'Área', monto: 'Monto' };
  const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  function rArchivos() {
    const p = S.proc; const single = S.mode !== 'areas';
    add(head(1, single ? 'Sube tu archivo' : 'Sube los reportes de cada área', single ? 'Un solo archivo con todas las transacciones (facturas, recibos, tickets…) tal como lo exporta tu sistema, con todo el periodo que tengas: mínimo 3 meses. Se procesa en tu navegador.' : 'Los reportes de cada área tal como los exporta tu sistema (CSV o Excel), con todo el periodo que tengas: mínimo 3 meses. Se procesan en tu navegador.'));
    const errs = MS.validate(p);
    if (errs.length) { add(UI.callout('warn', 'Primero completa el paso 1: ' + errs.join(' '))); add(foot('proceso', null)); return; }
    add(exampleBanner());
    if (single) add(singlePanel());
    else {
      const c = UI.panel('Reportes por área');
      p.areas.forEach((a, i) => c.body.appendChild(fileRow(i)));
      add(c.el);
    }
    const ready = p.areas.every((a, i) => S.slots[i] && S.slots[i].res);
    if (ready) {
      if (!S.check) syncAreas();
      add(periodPanel());
      const lk = linkCheckPanel(); if (lk) add(lk);
    }
    add(stdPanel(!S.slots.some(Boolean) && !S.single, single));
    add(h('div', { class: 'cluster' },
      S.example ? null : UI.btn('Probar con datos de ejemplo', () => loadExample(), 'btn-ghost btn-sm'),
      UI.btn(single ? 'Mi sistema da un archivo por área' : 'Volver a un solo archivo', () => { S.mode = single ? 'areas' : 'uno'; U.store.set('flow:mode', S.mode); S.slots = []; S.single = null; S.check = null; S.comb = null; S.areas = null; resetResults(); notify(); render(); }, 'btn-ghost btn-sm'),
      UI.btn([UI.icon('phone'), 'No tengo sistema: registrar en tienda'], () => QS.App.go('herramientas', { tool: 'registro' }), 'btn-ghost btn-sm')));
    const noCommon = ready && p.areas.length > 1 && S.check && !S.check.cover.common.ok;
    const prog = UI.progress();
    const bar = foot('proceso', async () => {
      if (S.comb) { F.go('mediciones'); return; }
      bar.next.disabled = true;
      try { await measureAll(prog); F.go('mediciones'); } catch (e) { console.error(e); U.toast('No se pudo medir: ' + e.message, 'bad', 7000); bar.next.disabled = false; prog.hide(); }
    }, 'Continuar', { disabled: !ready || noCommon, prog, note: noCommon ? 'Las áreas no tienen fechas en común.' : ready ? null : single ? 'Sube tu archivo para continuar.' : 'Sube y revisa el archivo de cada área para continuar.' });
    add(bar);
  }

  /* ---------- archivo único con todas las áreas ---------- */
  // Se lee una vez para saber qué áreas y tipos trae (columna Área y tipo de transacción); cada área del proceso toma sus filas.
  async function loadSingle(src, prog) {
    const pv = await D.preview(src);
    const map = MS.guessFields(pv.headers, pv.rows); if (map.fecha_hora == null && map.fecha != null) { map.fecha_hora = map.fecha; delete map.fecha; }
    const dcol = map.fecha_hora;
    S.single = { src, name: src.name || 'archivo', pv, map, dateOrder: dcol != null ? D.detectDateOrder(pv.rows.map((r) => r[dcol])) : 'DMY', groupSec: 20, dv: null, split: null, open: false, exclude: [] };
    S.slots = []; S.check = null; S.comb = null; S.areas = null; resetResults(); notify();
    if (map.fecha_hora == null || (map.tipo == null && S.proc.areas.some((a) => a.types.length > 1))) { S.single.open = true; return; }
    await analyzeSingle(prog);
  }
  async function analyzeSingle(prog) {
    const sg = S.single; const m = sg.map;
    sg.dv = await MS.distinctPairs(sg.src, m.area != null ? m.area : null, m.tipo != null ? m.tipo : null, (f) => prog && prog.set(0.3 * f, 'Buscando áreas y tipos…'));
    sg.split = MS.splitSingleFile(S.proc, sg.dv, m.area != null);
    sg.cols = Object.assign({}, m);
    await buildSlotsFromSingle(prog);
  }
  // Rehace el reparto por áreas con lo que indicó el usuario (área de cada valor de la columna Área)
  function resplit() {
    const sg = S.single, sp = sg.split; const nA = S.proc.areas.length;
    sp.areaSel = S.proc.areas.map(() => []); Object.keys(sp.areaOf).forEach((av) => { const ai = sp.areaOf[av]; if (ai != null && ai >= 0 && ai < nA) sp.areaSel[ai].push(av); });
    const types = S.proc.areas.map(() => new Map());
    for (const [k, n] of sg.dv.pairs) { const [av, tv] = k.split('\u0001'); const ai = sp.areaOf[av]; if (ai == null || ai < 0 || !tv) continue; types[ai].set(tv, (types[ai].get(tv) || 0) + n); }
    sp.types = types.map((mp) => Array.from(mp.entries()).sort((x, y) => y[1] - x[1]));
    S.proc.areas.forEach((ar, i) => { const auto = MS.autoTypeMap(sp.types[i].map((x) => x[0]), ar.types); sp.types[i].forEach(([tv]) => { if (!(tv in sp.typeMaps[i])) sp.typeMaps[i][tv] = auto[tv]; }); });
  }
  async function buildSlotsFromSingle(prog) {
    const sg = S.single, sp = sg.split, hasArea = sg.map.area != null;
    S.slots = S.proc.areas.map((ar, i) => ({ name: sg.name, src: sg.src, pv: sg.pv, map: Object.assign({}, sg.map), dateOrder: sg.dateOrder, groupSec: sg.groupSec,
      values: sp.types[i], typeMap: sp.typeMaps[i], areaVals: hasArea ? sg.dv.areas : null, areaSel: hasArea ? sp.areaSel[i] : [], res: null, open: false, single: true, exclude: (sg.exclude && sg.exclude[i]) || [] }));
    S.check = null; S.comb = null; resetResults();
    for (let i = 0; i < S.slots.length; i++) {
      const sl = S.slots[i], ar = S.proc.areas[i];
      if ((hasArea && !sl.areaSel.length) || (!Object.values(sl.typeMap).some(Boolean) && ar.types.length > 1)) { sg.open = true; continue; }
      sl.prog = prog ? { set: (f) => prog.set(0.3 + 0.7 * (i + f) / S.slots.length, `Leyendo ${short(ar.name)}…`) } : null;
      await processSlot(i, true);
    }
    syncAreas();
    if (prog) prog.hide();
    notify();
  }
  // Con todas las áreas leídas: el periodo base común (las mismas semanas en todas las áreas) y la revisión del enlace entre documentos
  function syncAreas() {
    const res = S.slots.map((s) => s && s.res);
    if (!S.proc.areas.length || !S.proc.areas.every((a, i) => res[i])) { S.check = null; return; }
    const al = MS.alignAreas(res, S.baseWeeks);
    al.areas.forEach((a, i) => { S.slots[i].res = a; });
    S.check = { cover: al.cover, comb: res.length > 1 && al.cover.common.ok ? MS.combine(S.proc, al.areas) : null };
  }
  // Columna que identifica quién atiende en el área i: {name, person (usuario o persona) o lugar (caja, puesto)}
  function puntoCol(i) {
    const sl = S.slots[i]; if (!sl || sl.map.punto == null || !sl.pv) return null;
    const name = String(sl.pv.headers[sl.map.punto] || ''); return { name, person: MS.isPersonHeader(name) };
  }
  const whoN = (i, n) => { const pc = puntoCol(i); return `${U.fmtInt(n)} ${pc && pc.person ? (n === 1 ? 'usuario' : 'usuarios') : (n === 1 ? 'punto de atención' : 'puntos de atención')}`; };
  // Excluye (o vuelve a contar) usuarios o puntos que no son atención en mostrador; se vuelve a leer el área
  async function setExclude(i, names) {
    const sl = S.slots[i]; if (!sl) return;
    sl.exclude = names.slice();
    if (S.single) { S.single.exclude = S.single.exclude || []; S.single.exclude[i] = sl.exclude; }
    const ok = await processSlot(i, true); if (ok) syncAreas();
    render();
  }
  // Usuarios (o puntos) de cada área con sus transacciones, para confirmar que son las personas que atienden
  function usersDetails() {
    const pcs = S.proc.areas.map((ar, i) => puntoCol(i));
    const cols = Array.from(new Set(pcs.filter(Boolean).map((x) => `«${x.name}»`))).join(' y ');
    const anyPerson = pcs.some((x) => x && x.person);
    const box = h('div', { class: 'stack', style: { paddingTop: '8px' } });
    box.appendChild(h('p', { class: 'hint' }, anyPerson
      ? `Cada usuario que registra transacciones (columna ${cols}) cuenta como una persona atendiendo en las horas en que registra, aunque cambie de caja o de puesto. Revisa que sean las personas de cada área. Un usuario que registra en bloque (pagos en línea, procesos automáticos) se marca para que decidas si se cuenta.`
      : `Cada punto de atención (columna ${cols}) con transacciones cuenta como una persona atendiendo. Si tu sistema guarda el usuario que creó cada documento, es mejor esa columna: cuenta a las personas aunque cambien de caja. Cámbiala en «Revisar columnas y áreas».`));
    S.proc.areas.forEach((ar, i) => {
      const r = S.slots[i] && S.slots[i].res; if (!r || !r.users) return;
      const top = r.users.slice(0, 30);
      box.appendChild(h('p', null, h('b', null, short(ar.name) + ': '), top.map((u) => `${u.name} (${U.fmtInt(u.n)}${u.auto ? ', en bloque' : ''})`).join(' · ') + (r.users.length > top.length ? ` · y ${r.users.length - top.length} más` : '')));
    });
    return h('details', { class: 'more' }, h('summary', null, anyPerson ? 'Usuarios que registran en cada área' : 'Puntos de atención de cada área'), box);
  }
  // Avisos de lectura de un área: filas repetidas, columna de inicio que no es inicio, usuarios que registran en bloque o excluidos
  function readNotes(i, o = {}) {
    const sl = S.slots[i], r = sl && sl.res; if (!r) return [];
    const ar = S.proc.areas[i], out = [], st = r.stats;
    if (st.dup && o.dup !== false) out.push(UI.callout('info', `${short(ar.name)}: ${U.fmtInt(st.dup)} filas repetidas (el mismo documento a la misma hora; pasa cuando dos archivos se superponen en fechas o el reporte trae una fila por línea del documento). Se contaron una sola vez.`));
    if (st.iniBad) {
      const nm = sl.map.inicio != null && sl.pv ? `«${sl.pv.headers[sl.map.inicio]}»` : 'de hora de inicio';
      out.push(UI.callout('warn', `${short(ar.name)}: la columna ${nm} no parece la hora de inicio de la atención: ${isFinite(st.iniBad.median) && st.iniBad.share >= 0.5 ? `está a solo ${U.fmt(st.iniBad.median * 60, 0)} segundos del registro (mediana)` : `en el ${pct0(1 - st.iniBad.share)} de las filas no es anterior al registro`}. No se usó; la atención se mide con el tiempo entre documentos o con el cronómetro.`));
    }
    const pc = puntoCol(i); const nounP = pc && pc.person ? 'usuario' : 'punto';
    const auto = (r.users || []).filter((u) => u.auto);
    auto.forEach((u) => out.push(UI.callout('warn', h('span', null, h('b', null, `${short(ar.name)}: ${u.name} no parece atención en mostrador. `),
      `Registró ${U.fmtInt(u.n)} transacciones y el ${pct0(u.bulk)} fueron en bloque (3 o más seguidas en menos de 3 segundos). Una persona atendiendo no registra así; suele ser un proceso automático o de oficina (pagos en línea, depósitos, conciliaciones). Si lo cuentas, sus transacciones se toman como clientes en la fila y ese ${nounP} como una persona más. `,
      h('button', { type: 'button', class: 'link', onclick: () => setExclude(i, (sl.exclude || []).concat([u.name])) }, 'No contarlo')))));
    if (sl.exclude && sl.exclude.length) out.push(UI.callout('info', h('span', null, `${short(ar.name)}: no se cuentan ${sl.exclude.join(', ')} (${U.fmtInt(st.excluded || 0)} transacciones). `,
      h('button', { type: 'button', class: 'link', onclick: () => setExclude(i, []) }, sl.exclude.length === 1 ? 'Volver a contarlo' : 'Volver a contarlos'))));
    return out;
  }
  function singlePanel() {
    const sg = S.single; const prog = UI.progress();
    const file = h('input', { type: 'file', accept: '.csv,.txt,.tsv,.xlsx,.xlsm,.xls', multiple: true, hidden: true, id: 'file-unico' });
    let adding = false;
    const pick = async (list) => {
      const files = Array.from(list || []).filter(Boolean); if (!files.length) return;
      if (files.some((fl) => D.isExcel(fl) && fl.size > 15 * 1048576)) U.toast('Archivo de Excel grande: puede tardar varios minutos. Si puedes, expórtalo como CSV (es mucho más rápido y no tiene el límite de 1 048 576 filas de Excel).', 'warn', 9000);
      try {
        if (S.example) clearExample(true);
        let parts = files.map((fl) => ({ type: 'file', file: fl, name: fl.name }));
        if (adding && S.single) parts = (S.single.src.type === 'multi' ? S.single.src.parts.slice() : [S.single.src]).concat(parts);
        await loadSingle(srcOf(parts), prog);
      } catch (e) { console.error(e); U.toast('No se pudo leer el archivo: ' + e.message, 'bad', 7000); }
      adding = false; render();
    };
    file.addEventListener('change', () => { const fl = Array.from(file.files); file.value = ''; pick(fl); });
    if (!sg) {
      const drop = h('div', { class: 'drop big', tabindex: '0', role: 'button', 'aria-label': 'Elegir tu archivo' }, UI.icon('upload', 'lg'), h('b', null, 'Arrastra aquí tu archivo o haz clic para elegirlo'),
        h('span', { class: 'hint' }, 'CSV o Excel con las transacciones de todas las áreas. Si tu sistema lo entrega en varios archivos (por ejemplo, uno por mes), elígelos todos juntos.'));
      drop.addEventListener('click', () => file.click());
      drop.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); file.click(); } });
      drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('over'); });
      drop.addEventListener('dragleave', () => drop.classList.remove('over'));
      drop.addEventListener('drop', (e) => { e.preventDefault(); drop.classList.remove('over'); pick(e.dataTransfer.files); });
      const p = UI.panel(null); p.body.appendChild(drop); p.body.appendChild(file); p.body.appendChild(prog.el); prog.hide();
      return p.el;
    }
    const p = UI.panel('Tu archivo', { actions: [UI.btn(sg.open ? 'Ocultar la revisión' : 'Revisar columnas y áreas', () => { sg.open = !sg.open; render(); }, 'btn-ghost btn-sm'),
      UI.btn([UI.icon('upload'), 'Agregar archivos'], () => { adding = true; file.click(); }, 'btn-ghost btn-sm', { title: 'Suma más archivos con el mismo formato (por ejemplo, otros meses)' }),
      UI.btn('Cambiar', () => { adding = false; file.click(); }, 'btn-ghost btn-sm')] });
    p.body.appendChild(file);
    const res = S.slots.map((s) => s && s.res); const k0 = Math.min(...res.filter(Boolean).map((r) => r.k0)), k1 = Math.max(...res.filter(Boolean).map((r) => r.k1));
    p.body.appendChild(h('p', { class: 'file-meta' }, h('b', null, sg.name), res.some(Boolean) ? ` · del ${U.fmtDay(k0)} al ${U.fmtDay(k1)} (${spanTxt(k1 - k0 + 1)})` : ''));
    const hasArea = sg.map.area != null;
    const nParts = sg.src && sg.src.type === 'multi' ? sg.src.parts.length : 1;
    if (S.proc.areas.length > 1) p.body.appendChild(h('p', { class: 'hint' }, `${nParts > 1 ? `Tus ${nParts} archivos traen todas las áreas juntas` : 'Es un solo archivo con todas las áreas'}: la app separa las filas de cada área ${hasArea ? `con la columna «${sg.pv.headers[sg.map.area]}»` : 'por el tipo de transacción'}. No hace falta un archivo por área.`));
    const pc0 = S.slots.map((s, i) => puntoCol(i)).find(Boolean);
    p.body.appendChild(UI.table(['Área de tu proceso', hasArea ? 'Valores de la columna Área' : 'Tomada por tipo de transacción', { t: 'Transacciones', num: true }, 'Tipos', pc0 && pc0.person ? 'Quién atiende' : 'Puntos de atención', ''], S.proc.areas.map((ar, i) => {
      const sl = S.slots[i], r = sl && sl.res, sp = sg.split;
      const ok = !!r;
      return [h('b', null, short(ar.name)), hasArea ? (sp && sp.areaSel[i].length ? sp.areaSel[i].join(', ') : '—') : 'Tipos asignados abajo', r ? U.fmtInt(r.stats.ok) : '—',
        r ? r.labels.map((l, k) => `${l}: ${U.fmtInt(r.typeCountAll[k])}`).join(' · ') : '—', r ? whoN(i, (r.users || []).length || r.stations) : '—', UI.tag(ok ? 'Listo' : 'Revisar', ok ? 'ok' : 'warn')];
    }), { compact: true }));
    if (pc0 && res.every(Boolean)) p.body.appendChild(usersDetails());
    const dups = S.proc.areas.map((ar, i) => [short(ar.name), res[i] ? res[i].stats.dup : 0]).filter((x) => x[1]);
    if (dups.length) p.body.appendChild(UI.callout('info', `Filas repetidas: ${dups.map(([n, d]) => `${n} ${U.fmtInt(d)}`).join(' · ')}. Son el mismo documento a la misma hora: pasa cuando dos archivos se superponen en fechas o el reporte trae una fila por línea del documento. Se contaron una sola vez.`));
    S.proc.areas.forEach((ar, i) => readNotes(i, { dup: false }).forEach((el) => p.body.appendChild(el)));
    const sp = sg.split;
    if (sp && (sp.unassignedAreas.length || sp.unassignedTypes.length)) {
      const msg = [];
      if (sp.unassignedAreas.length) msg.push(`Valores de Área sin asignar: ${sp.unassignedAreas.map(([v, n]) => `${v} (${U.fmtInt(n)} filas)`).join(', ')}.`);
      const ut = sp.unassignedTypes.filter((x) => x[2] == null || hasArea);
      if (ut.length) msg.push(`Tipos sin asignar: ${ut.slice(0, 8).map(([v, n]) => `${v} (${U.fmtInt(n)})`).join(', ')}${ut.length > 8 ? '…' : ''}.`);
      p.body.appendChild(UI.callout('warn', h('span', null, msg.join(' ') + ' Esas filas no se usan. Si son de alguna área, asígnalas en la revisión.', ' ', h('button', { type: 'button', class: 'link', onclick: () => { sg.open = true; render(); } }, 'Revisar'))));
    }
    if (!hasArea && S.proc.areas.length > 1) p.body.appendChild(UI.callout('info', 'Tu archivo no tiene columna Área: cada tipo de transacción se asignó al área con el tipo más parecido. Si tu sistema puede agregar el área (o el usuario o caja de cada área), el reparto es exacto.'));
    if (sg.open) p.body.appendChild(singleReview(prog));
    p.body.appendChild(prog.el); prog.hide();
    return p.el;
  }
  function singleReview(prog) {
    const sg = S.single, pv = sg.pv, sp = sg.split; const box = h('div', { class: 'colmap' });
    box.appendChild(UI.table(pv.headers.map(String), pv.rows.slice(0, 3).map((r) => pv.headers.map((_, k) => (r[k] == null ? '' : String(r[k])))), { compact: true }));
    const opts = [['', '— No está —']].concat(pv.headers.map((x, k) => [String(k), String(x || 'Columna ' + (k + 1))]));
    const sel = (k) => UI.select({ label: FIELD_LABEL[k], value: sg.map[k] != null ? String(sg.map[k]) : '', options: opts, onChange: (v) => { if (v === '') delete sg.map[k]; else sg.map[k] = +v; } }).el;
    box.appendChild(h('h3', null, 'Columnas'));
    box.appendChild(h('div', { class: 'map-grid' }, ['fecha_hora', 'hora', 'area', 'punto', 'tipo'].map(sel)));
    box.appendChild(h('details', { class: 'more' }, h('summary', null, 'Columnas que mejoran la medición'), h('div', { class: 'map-grid', style: { paddingTop: '10px' } }, ['documento', 'cliente', 'relacionado', 'inicio', 'llegada', 'estado', 'monto'].map(sel))));
    if (sp) {
      const nA = S.proc.areas.length;
      if (sg.map.area != null && sg.dv) {
        box.appendChild(h('h3', null, 'Áreas'));
        const aOpts = [['-1', 'No usar']].concat(S.proc.areas.map((ar, i) => [String(i), ar.name]));
        box.appendChild(UI.table(['Valor en tu archivo', { t: 'Filas', num: true }, 'Área de tu proceso'], sg.dv.areas.slice(0, 40).map(([av, n]) => {
          const s = h('select', { class: 'cell-in', 'aria-label': 'Área para ' + av }, aOpts.map(([v, t]) => h('option', { value: v }, t)));
          s.value = String(sp.areaOf[av] != null ? sp.areaOf[av] : -1);
          s.addEventListener('change', () => { const v = +s.value; if (v >= 0 && v < nA) sp.areaOf[av] = v; else delete sp.areaOf[av]; resplit(); sg.dirtyAreas = true; });
          return [av, U.fmtInt(n), s];
        }), { compact: true }));
      }
      box.appendChild(h('h3', null, 'Tipos de transacción'));
      if (sg.map.area != null) S.proc.areas.forEach((ar, i) => {
        if (!sp.types[i].length) return;
        const tOpts = [['', 'No usar']].concat(ar.types.map((t) => [t, t]));
        box.appendChild(h('p', { class: 'hint' }, short(ar.name)));
        box.appendChild(UI.table(['Valor en tu archivo', { t: 'Filas', num: true }, 'Corresponde a'], sp.types[i].slice(0, 40).map(([tv, n]) => {
          const s = h('select', { class: 'cell-in', 'aria-label': 'Tipo para ' + tv }, tOpts.map(([v, t]) => h('option', { value: v }, t)));
          s.value = sp.typeMaps[i][tv] || ''; s.addEventListener('change', () => { sp.typeMaps[i][tv] = s.value; });
          return [tv, U.fmtInt(n), s];
        }), { compact: true }));
      });
      else {
        const all = []; S.proc.areas.forEach((ar, i) => ar.types.forEach((t) => all.push([i + '|' + t, `${short(ar.name)} · ${t}`])));
        const cur = (tv) => { for (let i = 0; i < nA; i++) if (sp.typeMaps[i][tv]) return i + '|' + sp.typeMaps[i][tv]; return ''; };
        box.appendChild(UI.table(['Valor en tu archivo', { t: 'Filas', num: true }, 'Área y tipo'], (sg.dv ? sg.dv.types : []).slice(0, 60).map(([tv, n]) => {
          const s = h('select', { class: 'cell-in', 'aria-label': 'Área y tipo para ' + tv }, [['', 'No usar']].concat(all).map(([v, t]) => h('option', { value: v }, t)));
          s.value = cur(tv);
          s.addEventListener('change', () => { for (let i = 0; i < nA; i++) delete sp.typeMaps[i][tv]; if (s.value) { const [i, t] = s.value.split('|'); sp.typeMaps[+i][tv] = t; } sp.unassignedTypes = sp.unassignedTypes.filter((x) => x[0] !== tv); });
          return [tv, U.fmtInt(n), s];
        }), { compact: true }));
      }
    }
    box.appendChild(h('details', { class: 'more' }, h('summary', null, 'Formato de fechas y documentos de una misma visita'), h('div', { class: 'fgrid c2', style: { paddingTop: '10px' } },
      UI.select({ label: 'Fechas', value: sg.dateOrder, options: [['DMY', 'día/mes/año'], ['MDY', 'mes/día/año']], onChange: (v) => { sg.dateOrder = v; } }).el,
      UI.num({ label: 'Juntar documentos del mismo punto y cliente con menos de', unit: 'segundos', value: sg.groupSec, min: 0, step: 5, onInput: (v) => { sg.groupSec = Math.max(0, v || 0); } }).el)));
    const btn = UI.btn('Aplicar', async () => {
      btn.disabled = true;
      try {
        const colsChanged = !sp || JSON.stringify(sg.cols || {}) !== JSON.stringify(sg.map);
        if (colsChanged) await analyzeSingle(prog); else await buildSlotsFromSingle(prog);
        sg.open = !S.slots.every((s) => s && s.res);
      } catch (e) { console.error(e); U.toast('No se pudo leer: ' + e.message, 'bad', 7000); }
      render();
    }, 'btn-primary btn-sm');
    box.appendChild(h('div', { class: 'row' }, btn));
    return box;
  }
  function fileRow(i) {
    const ar = S.proc.areas[i], sl = S.slots[i];
    const row = h('div', { class: 'file-row' });
    const file = h('input', { type: 'file', accept: '.csv,.txt,.tsv,.xlsx,.xlsm,.xls', multiple: true, hidden: true, id: 'file-' + i });
    let adding = false;
    // uno o varios archivos para esta área (por ejemplo, uno por mes); "agregar" los suma a los que ya tiene
    const pick = async (list) => {
      const files = Array.from(list || []).filter(Boolean); if (!files.length) return;
      if (files.some((fl) => D.isExcel(fl) && fl.size > 15 * 1048576)) U.toast('Archivo de Excel grande: puede tardar varios minutos. Si puedes, expórtalo como CSV (es mucho más rápido y no tiene el límite de 1 048 576 filas de Excel).', 'warn', 9000);
      try {
        if (S.example) clearExample(true);
        const cur = S.slots[i];
        if (adding && cur) {
          const parts = (cur.src.type === 'multi' ? cur.src.parts.slice() : [cur.src]).concat(files.map((fl) => ({ type: 'file', file: fl, name: fl.name })));
          cur.src = srcOf(parts); cur.src.headers = cur.pv.headers; cur.name = cur.src.name;
          if (cur.map.tipo != null) { const keep = cur.typeMap; await readValues(i); Object.keys(keep).forEach((v) => { cur.typeMap[v] = keep[v]; }); }
          await processSlot(i, true);
        } else {
          await prepSlot(i, srcOf(files.map((fl) => ({ type: 'file', file: fl, name: fl.name }))));
          if (autoReady(i)) await processSlot(i, true);
        }
        render();
      } catch (e) { U.toast('No se pudo leer el archivo: ' + e.message, 'bad'); }
      adding = false;
    };
    file.addEventListener('change', () => { const fl = Array.from(file.files); file.value = ''; pick(fl); });
    row.addEventListener('dragover', (e) => { e.preventDefault(); row.classList.add('over'); });
    row.addEventListener('dragleave', () => row.classList.remove('over'));
    row.addEventListener('drop', (e) => { e.preventDefault(); row.classList.remove('over'); pick(e.dataTransfer.files); });
    const what = `${ar.types.join(', ')} (${lower(ar.staff || 'personal')})`;
    const main = h('div', { class: 'file-main' }, h('b', null, `${i + 1}. ${ar.name}`));
    const acts = h('div', { class: 'file-actions' });
    row.appendChild(main); row.appendChild(acts); row.appendChild(file);
    if (!sl) {
      main.appendChild(h('span', { class: 'file-meta' }, 'Reporte con: ' + what + '.'));
      acts.appendChild(UI.btn([UI.icon('upload'), 'Elegir archivos'], () => { adding = false; file.click(); }, 'btn-sm', { title: 'Uno o varios archivos de esta área (por ejemplo, uno por mes)' }));
      const other = S.slots.findIndex((x, k) => x && k !== i);
      if (other >= 0) acts.appendChild(UI.btn('Usar el mismo archivo', async () => { await prepSlot(i, S.slots[other].src); if (autoReady(i)) await processSlot(i, true); render(); }, 'btn-ghost btn-sm', { title: 'Si tu sistema da un solo archivo con todas las áreas' }));
      return row;
    }
    if (sl.res && !sl.open) {
      const r = sl.res;
      main.appendChild(h('span', { class: 'file-meta' }, UI.tag('Listo', 'ok'), ` ${sl.name} · ${U.fmtInt(r.stats.ok)} transacciones del ${U.fmtDay(r.k0)} al ${U.fmtDay(r.k1)} (${spanTxt(r.k1 - r.k0 + 1)}, ${U.fmtInt(r.allDays || r.openDays)} días con movimiento) · ${whoN(i, (r.users || []).length || r.stations)}`));
      main.appendChild(h('span', { class: 'file-meta' }, r.labels.map((l, k) => `${l}: ${U.fmtInt((r.typeCountAll || r.typeCount)[k])}`).join(' · ') + (r.stats.bad ? ` · ${U.fmtInt(r.stats.bad)} filas sin fecha válida` : '') + (r.stats.ignored ? ` · ${U.fmtInt(r.stats.ignored)} de otros tipos o anuladas` : '')));
      acts.appendChild(UI.btn('Revisar columnas', () => { sl.open = true; render(); }, 'btn-ghost btn-sm'));
      acts.appendChild(UI.btn([UI.icon('upload'), 'Agregar archivos'], () => { adding = true; file.click(); }, 'btn-ghost btn-sm', { title: 'Suma más archivos a esta área (por ejemplo, otros meses)' }));
      acts.appendChild(UI.btn('Cambiar', () => { adding = false; file.click(); }, 'btn-ghost btn-sm'));
      const notes = readNotes(i); if (notes.length) row.appendChild(h('div', { class: 'stack', style: { gridColumn: '1 / -1' } }, notes));
      return row;
    }
    // revisión de columnas
    main.appendChild(h('span', { class: 'file-meta' }, `${sl.name}. Revisa que cada dato apunte a la columna correcta.`));
    acts.appendChild(UI.btn('Cambiar archivo', () => file.click(), 'btn-ghost btn-sm'));
    acts.appendChild(UI.btn('Quitar', () => { S.slots[i] = null; S.check = null; S.comb = null; resetResults(); notify(); render(); }, 'btn-ghost btn-sm'));
    const box = h('div', { class: 'colmap' });
    row.appendChild(h('div', { style: { gridColumn: '1 / -1' } }, box));
    const pv = sl.pv;
    box.appendChild(UI.table(pv.headers.map(String), pv.rows.slice(0, 3).map((r) => pv.headers.map((_, k) => (r[k] == null ? '' : String(r[k])))), { compact: true }));
    const opts = [['', '— No está —']].concat(pv.headers.map((x, k) => [String(k), String(x || 'Columna ' + (k + 1))]));
    const levelBox = h('div');
    const drawLevel = () => { U.clear(levelBox); levelBox.appendChild(QS.StandardUI.levelBadge(MS.levelFor(sl.map, { after: i > 0, oneType: ar.types.length === 1 }), i)); };
    const sel = (k, onChange) => UI.select({ label: FIELD_LABEL[k], value: sl.map[k] != null ? String(sl.map[k]) : '', options: opts,
      onChange: async (v) => { if (v === '') delete sl.map[k]; else sl.map[k] = +v; drawLevel(); if (onChange) await onChange(); } }).el;
    box.appendChild(h('h3', null, 'Columnas'));
    box.appendChild(h('div', { class: 'map-grid' }, ['fecha_hora', 'hora', 'punto', 'tipo'].map((k) => sel(k, k === 'tipo' ? async () => { await readValues(i); render(); } : null))));
    const optKeys = ['documento', 'cliente', 'relacionado', 'inicio', 'llegada', 'estado', 'area', 'monto'];
    box.appendChild(h('details', { class: 'more', open: optKeys.some((k) => sl.map[k] != null) }, h('summary', null, 'Columnas que mejoran la medición'),
      h('div', { class: 'map-grid', style: { paddingTop: '10px' } }, optKeys.map((k) => sel(k, k === 'area' ? async () => { await readValues(i); render(); } : null)))));
    box.appendChild(levelBox); drawLevel();
    if (sl.values && sl.values.length) {
      box.appendChild(h('h3', null, 'Tipos de transacción'));
      box.appendChild(h('p', { class: 'hint' }, `A qué tipo de ${lower(short(ar.name))} corresponde cada valor de tu sistema. Lo que no sea de esta área, márcalo como "No es de esta área".`));
      const tOpts = [h('option', { value: '' }, 'No es de esta área')].concat(ar.types.map((ty) => h('option', { value: ty }, ty)));
      box.appendChild(UI.table(['Valor en tu sistema', { t: 'Filas', num: true }, 'Corresponde a'], sl.values.slice(0, 40).map(([v, n]) => {
        const s = h('select', { class: 'cell-in', 'aria-label': 'Tipo para ' + v }, tOpts.map((o) => o.cloneNode(true)));
        s.value = sl.typeMap[v] || ''; s.addEventListener('change', () => { sl.typeMap[v] = s.value; });
        return [v, U.fmtInt(n), s];
      }), { compact: true }));
    }
    if (sl.areaVals && sl.areaVals.length) {
      box.appendChild(h('h3', null, 'Valores de la columna Área que son de esta área'));
      box.appendChild(h('div', { class: 'chips' }, sl.areaVals.map(([v, n]) => {
        const on = sl.areaSel.includes(v);
        const b = h('button', { type: 'button', class: 'chip' + (on ? ' on' : ''), 'aria-pressed': String(on) }, `${v} (${U.fmtInt(n)})`);
        b.addEventListener('click', () => { const k = sl.areaSel.indexOf(v); if (k >= 0) sl.areaSel.splice(k, 1); else sl.areaSel.push(v); b.classList.toggle('on'); b.setAttribute('aria-pressed', String(k < 0)); });
        return b;
      })));
    }
    box.appendChild(h('details', { class: 'more' }, h('summary', null, 'Formato de fechas y documentos de una misma visita'), h('div', { class: 'fgrid c2', style: { paddingTop: '10px' } },
      UI.select({ label: 'Fechas', value: sl.dateOrder, options: [['DMY', 'día/mes/año'], ['MDY', 'mes/día/año']], onChange: (v) => { sl.dateOrder = v; } }).el,
      UI.num({ label: 'Juntar documentos del mismo punto y cliente con menos de', unit: 'segundos', value: sl.groupSec, min: 0, step: 5, help: 'Ejemplo: dos recibos de cuota impresos seguidos para el mismo cliente son una sola visita. Usa 0 para no juntar.', onInput: (v) => { sl.groupSec = Math.max(0, v || 0); } }).el)));
    sl.prog = UI.progress();
    const btn = UI.btn('Aplicar', async () => { btn.disabled = true; const ok = await processSlot(i); if (ok) { sl.open = false; render(); } else btn.disabled = false; }, 'btn-primary btn-sm');
    box.appendChild(h('div', { class: 'row' }, btn, sl.prog.el));
    return row;
  }
  const spanTxt = (days) => (days >= 365 ? `${U.fmt(days / 365.25, 1)} años` : days >= 60 ? `${U.fmt(days / 30.44, 1)} meses` : `${days} días`);
  // Periodo de los datos: fechas de cada área, el periodo en que coinciden y el periodo base del modelo (la operación reciente).
  // La historia completa de cada área se usa para las temporadas por mes y los días especiales.
  function periodPanel() {
    const cv = S.check && S.check.cover; const multi = S.proc.areas.length > 1;
    const res = S.slots.map((s) => s && s.res); const a0 = res[0];
    const k0 = Math.min(...res.map((r) => r.k0)), k1 = Math.max(...res.map((r) => r.k1)), span = k1 - k0 + 1;
    const p = UI.panel('Periodo de tus datos', { sub: 'El modelo de tu operación (clientes por hora, personal, tiempos de atención) usa las semanas más recientes, para reflejar cómo es hoy. La historia completa se usa para medir las temporadas por mes y los días especiales.' });
    if (multi && cv) {
      p.body.appendChild(UI.table(['Área', 'Desde', 'Hasta', { t: 'Días con movimiento', num: true }], S.proc.areas.map((ar, i) => [short(ar.name), U.fmtDay(res[i].k0), U.fmtDay(res[i].k1), U.fmtInt(res[i].allDays)]), { compact: true }));
      if (!cv.common.ok) p.body.appendChild(UI.callout('bad', MS.noCommonMsg(S.proc, cv)));
      else if (!cv.same) p.body.appendChild(UI.callout('info', h('span', null, h('b', null, 'Las áreas no cubren las mismas fechas. '), `Todo lo que combina las áreas (cuántos clientes pasan de una a otra, el enlace entre documentos y el modelo) usa el periodo en que coinciden: del ${U.fmtDay(cv.common.k0)} al ${U.fmtDay(cv.common.k1)}. Lo que queda fuera se usa solo para las temporadas de cada área.`)));
    }
    if (multi && cv && !cv.common.ok) return p.el;
    const w = (cv && cv.base) || (a0.win || { k0: a0.k0, k1: a0.k1 });
    const prog = UI.progress();
    const sel = UI.select({ label: 'El modelo usa', id: 'base-weeks', value: String(S.baseWeeks), options: [['8', 'Las últimas 8 semanas'], ['13', 'Las últimas 13 semanas (recomendado)'], ['26', 'Las últimas 26 semanas'], ['52', 'El último año'], ['0', 'Todo el periodo']],
      onChange: async (v) => { S.baseWeeks = +v; U.store.set('flow:baseWeeks', S.baseWeeks); sel.input.disabled = true; try { await rebaseAll(prog); } catch (e) { console.error(e); U.toast('No se pudo recalcular: ' + e.message, 'bad'); } render(); } });
    const wDays = w.k1 - w.k0 + 1;
    p.body.appendChild(h('div', { class: 'ctrl-row' }, sel.el, h('p', { class: 'hint' }, `Periodo base: del ${U.fmtDay(w.k0)} al ${U.fmtDay(w.k1)} (${spanTxt(wDays)}${multi ? ', el mismo en todas las áreas' : ''}). Historia: ${spanTxt(span)} (del ${U.fmtDay(k0)} al ${U.fmtDay(k1)}).`)));
    p.body.appendChild(prog.el); prog.hide();
    if (multi && cv && S.baseWeeks > 0 && wDays < S.baseWeeks * 7) p.body.appendChild(UI.callout('warn', `Las áreas coinciden solo ${spanTxt(wDays)}: el modelo usa ese periodo. Con menos de 4 semanas, cada día de la semana tiene muy pocos días para promediar; si puedes, sube los datos de todas las áreas del mismo periodo.`));
    if (S.baseWeeks === 0 && span > 400) p.body.appendChild(UI.callout('warn', 'Con más de un año de datos, usar todo el periodo promedia niveles de demanda distintos (crecimiento, cambios de personal) y el plan no refleja la operación de hoy. Usa un periodo reciente; las temporadas ya se miden con toda la historia.'));
    return p.el;
  }
  // Enlace entre áreas: cuántos documentos encontraron su documento anterior (por ejemplo, el REC su factura) y en cuánto tiempo
  function linkCheckPanel() {
    const comb = S.check && S.check.comb; if (!comb || S.proc.areas.length < 2) return null;
    const p = UI.panel('Enlace entre áreas', { sub: 'Cada documento se enlaza con el documento del área anterior que cita (por ejemplo, el recibo con la factura que paga): su columna Documento relacionado se busca en la columna Documento del área anterior. Así se sabe qué clientes pasaron de un área a la otra y cuánto tardaron. Los guiones, espacios, mayúsculas y ceros a la izquierda no importan, y el enlace funciona aunque los datos vengan en varios archivos.' });
    S.proc.areas.forEach((ar, ai) => {
      if (ai === 0) return;
      const ls = comb.linkStats.find((x) => x.ai === ai);
      if (!ls) { p.body.appendChild(UI.callout('warn', `${short(ar.name)}: falta la columna Documento relacionado (en el recibo, la factura que paga). Sin ella no se sabe qué clientes vienen de ${short(S.proc.areas[ai - 1].name)}: la atención de esta área se marca como máximo probable y hará falta cronometrarla.`)); return; }
      const exp = ls.byType.filter((x) => x.expected), oth = ls.byType.filter((x) => !x.expected && x.n);
      const nE = exp.reduce((s, x) => s + x.n, 0), mE = exp.reduce((s, x) => s + x.matched, 0);
      const all = [].concat(...exp.map((x) => x.sample)); const med = all.length ? U.quantile(all, 0.5) : NaN;
      const rate = nE ? mE / nE : 0;
      const tag = rate >= 0.8 ? ['ok', 'Enlace correcto'] : rate >= 0.5 ? ['warn', 'Enlace parcial'] : ['bad', 'Enlace con problemas'];
      p.body.appendChild(h('p', null, UI.tag(tag[1], tag[0]), ' ', nE ? `${U.fmtInt(mE)} de ${U.fmtInt(nE)} documentos de ${exp.map((x) => lower(x.type)).join(' y ')} (${pct0(rate)}) encontraron en ${short(S.proc.areas[ai - 1].name)} el documento que citan${isFinite(med) ? `, con una mediana de ${U.fmtTime(med)} entre uno y otro` : ''}.` : 'Ningún tipo de esta área viene del área anterior según tus flujos.'));
      if (nE && rate < 0.8) {
        const nf = exp.reduce((s, x) => s + x.notFound, 0), nr = exp.reduce((s, x) => s + x.outRange, 0), sinRel = exp.reduce((s, x) => s + x.n - x.withRel, 0);
        const why = [];
        if (sinRel > 0.1 * nE) why.push(`${U.fmtInt(sinRel)} no traen documento relacionado`);
        if (nf > 0.1 * nE) why.push(`${U.fmtInt(nf)} citan un documento que no está en ${short(S.proc.areas[ai - 1].name)} (revisa que sea el mismo número que en la columna Documento de las facturas, y que el área anterior esté en el archivo)`);
        if (nr > 0.1 * nE) why.push(`${U.fmtInt(nr)} lo encontraron, pero más de 4 horas después o con hora anterior a la factura (revisa la fecha y la hora de ambos)`);
        p.body.appendChild(UI.callout('warn', `Revisa el enlace: ${why.join('; ') || 'muchos recibos no encontraron su factura'}. Mientras no se enlacen, la atención de ${short(ar.name)} se mide con menos datos.`));
      }
      if (oth.length) p.body.appendChild(h('p', { class: 'hint' }, `${oth.map((x) => x.type).join(', ')}: no se esperan enlaces según tus flujos (por ejemplo, la cuota paga un crédito de meses anteriores). ${oth.some((x) => x.matched > 0.3 * x.n) ? 'Aun así, varios encontraron una factura del mismo día: revisa los flujos del paso 1.' : ''}`));
      p.body.appendChild(h('details', { class: 'more' }, h('summary', null, 'Ver por tipo'), UI.table(['Tipo', { t: 'Documentos', num: true }, { t: 'Con relacionado', num: true }, { t: 'Encontraron el suyo', num: true }, { t: 'Tiempo mediano', num: true }, 'Se espera enlace'],
        ls.byType.map((x) => [x.type, U.fmtInt(x.n), U.fmtInt(x.withRel), x.n ? `${U.fmtInt(x.matched)} (${pct0(x.matched / x.n)})` : '—', isFinite(x.median) ? U.fmtTime(x.median) : '—', x.expected ? 'Sí' : 'No']), { compact: true })));
    });
    return p.el;
  }
  async function rebaseAll(prog) {
    const had = !!S.comb;
    syncAreas();
    S.comb = null; S.areas = null; resetResults(); notify();
    if (had) await measureAll(prog);
  }
  // Fuente de datos de un área: un archivo o varios (se leen uno tras otro con las columnas emparejadas por nombre)
  function srcOf(parts) {
    if (parts.length === 1) return parts[0];
    const names = parts.map((x) => x.name);
    return { type: 'multi', parts, name: `${parts.length} archivos (${names.slice(0, 2).join(', ')}${parts.length > 2 ? ', …' : ''})` };
  }
  // Estándar de datos, resumido en el paso 2
  function stdPanel(open, single) {
    const p = UI.panel(null);
    if (single) {
      p.body.appendChild(h('p', null, h('b', null, 'Qué debe tener tu archivo. '), 'Una fila por transacción (factura, recibo, ticket o turno). Los nombres de las columnas pueden ser los de tu sistema: se reconocen solos.'));
      p.body.appendChild(UI.table(['Columna', 'Qué es', 'Ejemplo', ''], [
        ['Fecha y hora', 'Cuándo se registró la transacción (una columna, o fecha y hora por separado)', '14/09/2026 10:32', UI.tag('Obligatoria', 'bad')],
        ['Área', 'En qué área se atendió', 'Cajas · Facturación', UI.tag('Obligatoria', 'bad')],
        ['Quién atiende', 'Usuario que creó el documento (la persona que atendió); si tu sistema no lo guarda, la caja o el puesto', 'MPEREZ', UI.tag('Obligatoria', 'bad')],
        ['Tipo de transacción', 'Qué se hizo', 'CONTADO · PAGO CUOTA', UI.tag('Obligatoria', 'bad')],
        ['Número de documento', 'Factura, recibo o ticket', 'F-001245', UI.tag('Recomendada', 'warn')],
        ['Documento relacionado', 'En el recibo, la factura que paga', 'F-001245', UI.tag('Recomendada', 'warn')],
        ['Cliente', 'Código del cliente', 'CL-88410', UI.tag('Recomendada', 'warn')],
        ['Hora de inicio', 'Cuándo empezó la atención. Con ella no hace falta cronometrar', '10:24:40', UI.tag('Muy útil', 'info')]
      ], { compact: true }));
    } else p.body.appendChild(h('p', null, h('b', null, 'Qué datos sirven. '), 'Una fila por transacción (factura, recibo, ticket o turno) con, como mínimo, la ', h('b', null, 'fecha y hora'), ', ', h('b', null, 'quién atiende'), ' (el usuario que creó el documento; si no hay, la caja o el puesto) y el ', h('b', null, 'tipo de transacción'), '. Los nombres de las columnas pueden ser los de tu sistema: se reconocen solos.'));
    p.body.appendChild(h('details', { class: 'more', open: open && !single }, h('summary', null, 'Otras formas de entregar los datos que se aceptan'),
      h('div', { class: 'stack', style: { paddingTop: '8px' } },
        h('ul', { class: 'plain' },
          h('li', null, h('b', null, 'Un solo archivo con todo: '), 'la forma más simple. La columna Área reparte las transacciones; sin ella, se reparten por tipo de transacción.'),
          h('li', null, h('b', null, 'Un archivo por área: '), 'por ejemplo, las facturas de cajas y los recibos de facturación. Usa «Mi sistema da un archivo por área».'),
          h('li', null, h('b', null, 'Varios archivos: '), 'por ejemplo, uno por mes o por año. Elígelos juntos o usa «Agregar archivos»: se suman y sus columnas se emparejan por nombre, aunque cambien de orden.'),
          h('li', null, h('b', null, 'Excel con varias hojas iguales: '), 'por ejemplo, una hoja por mes. Se leen todas las hojas con los mismos encabezados que la primera.'),
          h('li', null, h('b', null, 'Formatos: '), 'CSV (coma, punto y coma o tabulador) o Excel; fecha y hora juntas o en dos columnas; día/mes/año, año-mes-día o número de fecha de Excel. Para archivos grandes conviene CSV.'),
          h('li', null, h('b', null, 'Columnas que mejoran la medición: '), 'número de documento, cliente, documento relacionado (en el recibo, la factura que paga), hora de inicio de la atención (con ella no hace falta cronometrar), hora de llegada y estado (turnero).'),
          h('li', null, h('b', null, 'Si tu sistema solo da totales o conteos por hora: '), 'no es transacción por transacción; usa Herramientas → Planeación por temporada.')),
        h('div', { class: 'cluster' },
          UI.btn([UI.icon('download'), 'Plantilla del estándar (CSV)'], () => { const t = MS.standardTemplate(); U.saveFile(t.name, U.toCSV(t.headers, t.rows, { sep: ',' }), 'text/csv'); }, 'btn-sm'),
          UI.btn([UI.icon('download'), 'Diccionario de datos (CSV)'], () => { const t = MS.dictionary(); U.saveFile(t.name, U.toCSV(t.headers, t.rows, { sep: ',' }), 'text/csv'); }, 'btn-ghost btn-sm'),
          UI.btn([UI.icon('file'), 'Estándar completo y verificador de archivos'], () => QS.App.go('herramientas', { tool: 'estandar' }), 'btn-ghost btn-sm')))));
    return p.el;
  }
  // ¿El reconocimiento automático alcanza para procesar sin revisar?
  function autoReady(i) {
    const sl = S.slots[i], ar = S.proc.areas[i];
    if (!sl || sl.map.fecha_hora == null) return false;
    if (ar.types.length > 1 && sl.map.tipo == null) return false;
    if (sl.map.tipo != null) { const vals = Object.values(sl.typeMap); const used = new Set(vals.filter(Boolean)); if (!used.size || used.size < Math.min(ar.types.length, (sl.values || []).length)) return false; }
    return true;
  }
  async function prepSlot(i, src) {
    const pv = await D.preview(src);
    const map = MS.guessFields(pv.headers, pv.rows);
    if (map.fecha_hora == null && map.fecha != null) { map.fecha_hora = map.fecha; delete map.fecha; }
    const dcol = map.fecha_hora;
    const sl = { name: src.name || (src.file && src.file.name) || 'archivo', src, pv, map, dateOrder: dcol != null ? D.detectDateOrder(pv.rows.map((r) => r[dcol])) : 'DMY', groupSec: 20, values: null, typeMap: {}, areaVals: null, areaSel: [], res: null, open: true, exclude: [] };
    S.slots[i] = sl; S.check = null; S.comb = null; resetResults(); notify();
    await readValues(i);
    return sl;
  }
  async function readValues(i) {
    const sl = S.slots[i], ar = S.proc.areas[i];
    if (sl.map.tipo != null) { sl.values = await MS.distinctValues(sl.src, sl.map.tipo); sl.typeMap = MS.autoTypeMap(sl.values.map((v) => v[0]), ar.types); }
    else { sl.values = null; sl.typeMap = {}; }
    if (sl.map.area != null) { sl.areaVals = await MS.distinctValues(sl.src, sl.map.area, 30); sl.areaSel = sl.areaVals.filter((v) => norm(v[0]).includes(norm(ar.name).split(' ')[0])).map((v) => v[0]); }
    else { sl.areaVals = null; sl.areaSel = []; }
  }
  async function processSlot(i, quiet) {
    const sl = S.slots[i], ar = S.proc.areas[i];
    const m = Object.assign({}, sl.map); Object.keys(m).forEach((k) => { if (m[k] === '' || m[k] == null) delete m[k]; });
    if (m.fecha_hora == null) { U.toast('Indica la columna de fecha (y hora).', 'warn'); return false; }
    if (m.tipo == null && ar.types.length > 1) { U.toast(`Esta área tiene ${ar.types.length} tipos de transacción: indica la columna de tipo.`, 'warn'); return false; }
    if (m.tipo != null && !Object.values(sl.typeMap).some(Boolean)) { U.toast('Indica a qué tipo corresponde al menos un valor de tu sistema.', 'warn'); return false; }
    try {
      if (sl.prog) sl.prog.set(0.02, 'Leyendo…');
      sl.res = await MS.readArea(sl.src, { map: m, typeMap: m.tipo != null ? sl.typeMap : null, labels: ar.types, dateOrder: sl.dateOrder, groupSec: sl.groupSec, areaValues: sl.areaSel, name: ar.name, baseWeeks: S.baseWeeks, exclude: sl.exclude },
        (f) => { if (sl.prog) sl.prog.set(f, 'Leyendo…'); });
      sl.error = null; sl.open = false; S.check = null; S.comb = null; resetResults(); notify();
      if (!sl.single) syncAreas();
      if (!quiet) U.toast(`${short(ar.name)}: ${U.fmtInt(sl.res.stats.ok)} transacciones leídas.`, 'ok');
      return true;
    } catch (e) { sl.res = null; sl.error = e.message; U.toast(e.message, 'bad', 7000); return false; }
  }
  async function measureAll(prog) {
    syncAreas();
    const areas = S.slots.map((s) => s && s.res);
    if (areas.some((x) => !x)) return;
    if (prog) prog.set(0.05, 'Midiendo los flujos de clientes…'); await U.tick();
    S.comb = await MS.measureProcess(S.proc, areas, { walk: S.proc.walk, baseWeeks: S.baseWeeks, onProgress: (f) => prog && prog.set(0.1 + 0.6 * f, 'Calculando la atención con el tiempo entre documentos…') });
    areas.forEach((a, i) => { S.slots[i].res = a; });
    S.areas = areas;
    if (prog) prog.set(0.75, 'Aplicando las mediciones en tienda…');
    await applyMeas();
    S.view.area = 0; S.view.dow = MS.busiestDow(areas); S.view.planDow = S.view.dow; S.view.valDow = S.view.dow; S.view.simDow = S.view.dow;
    if (prog) prog.hide();
    notify();
  }
  // Aplica las mediciones en tienda; si cambió el traslado, vuelve a calcular la atención del área siguiente
  async function applyMeas() {
    if (!S.areas) return;
    const changed = MS.applyMeasurements(S.proc, S.areas, measNow());
    if (changed && S.comb && S.comb.links.length) { S.comb = await MS.measureProcess(S.proc, S.areas, { walk: S.proc.walk }); MS.applyMeasurements(S.proc, S.areas, measNow()); }
    saveProc(); resetResults(); notify();
  }
  async function loadExample(o = {}) {
    if (!o.quiet) U.toast('Cargando la tienda de ejemplo…', 'info', 2000);
    await U.tick();
    const f = MS.sampleFiles();
    if (S.proc.template !== 'retail_credito' || S.proc.areas.length !== 2) S.proc = MS.fromTemplate('retail_credito');
    S.slots = []; S.single = null; S.check = null; S.comb = null; S.areas = null; resetResults();
    if (S.mode !== 'areas') { const one = MS.sampleSingle(f); await loadSingle({ type: 'rows', headers: one.headers, rows: one.rows, name: one.name }, null); }
    else for (const [i, file] of [[0, f.facturas], [1, f.recibos]]) { await prepSlot(i, { type: 'rows', headers: file.headers, rows: file.rows, name: file.name }); await processSlot(i, true); }
    S.example = true; S.exampleFiles = f; S.exMeas = MS.sampleMeasurements(f.truth);
    await measureAll(null);
    render();
  }
  function clearExample(keepStep) {
    S.example = false; S.exMeas = null; S.exampleFiles = null; S.slots = []; S.single = null; S.check = null; S.comb = null; S.areas = null; resetResults();
    S.proc.walk = 0.5; S.proc.walkMeasured = false; saveProc(); notify();
    if (!keepStep) render();
  }
  /* ======================= 3. Mediciones en tienda ======================= */
  const ORIGIN = { medido: 'Reporte (hora de inicio)', cronometrado: 'Cronometrado', inferido: 'Calculado con documentos', 'por diferencia': 'Calculado con documentos', ajustado: 'Ajustado con tu medición', indicado: 'Indicado por ti', maximo: 'Máximo (falta medir)' };
  const mmss = (min) => { const s = Math.max(0, Math.round(min * 60)); return `${Math.floor(s / 60)}:${U.pad2(s % 60)}`; };
  let ticker = 0;
  const applySoon = U.debounce(async () => { try { await applyMeas(); if (S.step === 'mediciones') render(); } catch (e) { console.error(e); } }, 450);
  function rMediciones() {
    add(head(2, 'Confirma tu personal y mide lo que falta', 'Revisa cuántas personas atienden en cada hora y mide en tienda lo que tus reportes no guardan. Con eso los cálculos usan solo datos reales.'));
    if (!S.areas) { needData(); return; }
    add(exampleBanner());
    add(h('h2', { class: 'sec-h' }, '1. Personal actual'));
    S.proc.areas.forEach((ar, i) => add(staffPanel(i)));
    add(h('h2', { class: 'sec-h' }, '2. Tiempos de atención y traslado'));
    const needs = needsNow();
    const todo = needs.filter((n) => n.state === 'falta' || n.state === 'parcial');
    if (needs.every((n) => n.state === 'datos')) add(UI.callout('ok', h('span', null, h('b', null, 'No hace falta cronometrar. '), 'Tus reportes traen la hora de inicio de cada atención: los tiempos se miden directo con tus datos.')));
    else add(todo.length ? UI.callout('warn', h('span', null, h('b', null, todo.length === 1 ? 'Falta una medición. ' : `Faltan ${todo.length} mediciones. `), 'Tus reportes no traen ese dato. Mientras falte, el diagnóstico y el plan se marcan como preliminares.'))
      : UI.callout('ok', h('span', null, h('b', null, 'Mediciones completas. '), 'El modelo usa solo datos medidos.')));
    needs.forEach((n) => add(n.kind === 'walk' ? walkItem(n) : svcItem(n)));
    if (!needs.every((n) => n.state === 'datos')) add(ioPanel());
    add(foot('archivos', () => F.go('diagnostico'), 'Ver el diagnóstico', { note: todo.length ? 'Puedes seguir sin medir; los resultados quedarán como preliminares.' : null }));
    startTicker();
  }

  /* ---------- personal actual ---------- */
  // Por área: el horario (personas por hora y día) detectado en los registros, que el usuario puede corregir, y la planilla
  // (personas contratadas y sus horas) para expresar el plan en personas. Se guarda en este navegador por nombre de área.
  const staffStore = () => (S.example ? (S.exStaff = S.exStaff || {}) : S.staffNow);
  const saveStaff = () => { if (!S.example) U.store.set('flow:staff', S.staffNow); };
  function staffCfg(i) { const k = S.proc.areas[i].name; const st = staffStore(); return (st[k] = st[k] || { grid: {}, ft: null, pt: null, ftH: 48, ptH: 24, abs: 0 }); }
  const detectedDay = (i, w) => U.range(24, (hh) => Math.round(S.areas[i].sHeat[w][hh] || 0));
  function staffDay(i, w) { const g = staffCfg(i).grid; return g && g[w] ? g[w].slice() : detectedDay(i, w); }
  const schedDayFor = (w) => S.proc.areas.map((ar, i) => staffDay(i, w));
  const isEdited = (i) => Object.keys(staffCfg(i).grid || {}).length > 0;
  function staffPanel(i) {
    const ar = S.proc.areas[i], a = S.areas[i], cfg = staffCfg(i), edited = isEdited(i);
    const who = lower(ar.staff || 'personas'), pt = lower(ar.server || 'punto');
    const p = UI.panel(`${short(ar.name)}: ${who} por hora`, { actions: [UI.tag(edited ? 'Corregido por ti' : 'Detectado en tus registros', edited ? 'info' : 'ok')] });
    const pc = puntoCol(i), nUs = (a.users || []).length || a.stations;
    p.body.appendChild(h('p', { class: 'meas-why' }, pc && pc.person
      ? `Promedio de las ${baseTxt()}. Se detecta con el usuario que registró cada transacción (columna «${pc.name}», ${whoN(i, nUs)}): cada usuario cuenta como una persona atendiendo desde poco antes de su primera transacción hasta la última, sin contar sus pausas largas. Si alguien atiende sin registrar (por ejemplo, apoyo en la fila), corrige el número de esa hora.`
      : `Promedio de las ${baseTxt()}. Se detecta así: cada ${pt} con transacciones en la hora cuenta como una persona atendiendo${pc ? ` (columna «${pc.name}»)` : ''}. Si alguien atiende sin registrar (por ejemplo, apoyo en la fila) o una persona usa dos ${pt}s, corrige el número de esa hora. Si tu sistema guarda el usuario que creó cada documento, úsalo como «Quién atiende»: cuenta a las personas aunque cambien de ${pt}.`));
    const dows = U.range(7, (w) => w).filter((w) => a.dowDays[w] > 0);
    let h0 = 24, h1 = 0; dows.forEach((w) => { const d = staffDay(i, w), det = a.sHeat[w]; for (let hh = 0; hh < 24; hh++) if (d[hh] > 0 || det[hh] > 0.3 || a.heat[w][hh] > 0.3) { h0 = Math.min(h0, hh); h1 = Math.max(h1, hh + 1); } });
    if (h1 <= h0) return p.el;
    const hours = U.range(h1 - h0, (k) => h0 + k);
    const change = () => { saveStaff(); resetResults(); notify(); };
    const tbl = h('table', { class: 'staff-grid' }, h('thead', null, h('tr', null, h('th', null, ''), hours.map((hh) => h('th', { scope: 'col' }, U.pad2(hh))), h('th', null, 'Horas'))),
      h('tbody', null, dows.map((w) => {
        const day = staffDay(i, w), det = detectedDay(i, w);
        const tot = h('td', { class: 'tot' }, `${day.reduce((x, y) => x + y, 0)} h`);
        return h('tr', null, h('th', { scope: 'row' }, U.DIAS[w]), hours.map((hh) => {
          const inp = h('input', { type: 'number', min: '0', max: '99', step: '1', value: String(day[hh]), class: day[hh] !== det[hh] ? 'chg' : '', 'aria-label': `${who} el ${U.DIAS_L[w].toLowerCase()} a las ${U.fmtHour(hh)}`, title: `Detectado: ${U.fmt(a.sHeat[w][hh], 1)}` });
          inp.addEventListener('change', () => {
            const v = Math.max(0, Math.round(parseFloat(inp.value) || 0)); inp.value = String(v);
            const g = cfg.grid; const cur = staffDay(i, w); cur[hh] = v;
            if (cur.every((x, k) => x === det[k])) delete g[w]; else g[w] = cur;
            inp.classList.toggle('chg', v !== det[hh]); tot.textContent = `${cur.reduce((x, y) => x + y, 0)} h`; change();
          });
          return h('td', null, inp);
        }), tot);
      })));
    p.body.appendChild(h('div', { class: 'plan-wrap' }, tbl));
    const acts = h('div', { class: 'cluster' });
    if (dows.includes(0) && dows.some((w) => w > 0 && w < 5)) acts.appendChild(UI.btn('Copiar el lunes a martes–viernes', () => { const mon = staffDay(i, 0); dows.filter((w) => w > 0 && w < 5).forEach((w) => { cfg.grid[w] = mon.slice(); }); change(); render(); }, 'btn-ghost btn-sm'));
    if (edited) acts.appendChild(UI.btn('Volver a lo detectado', () => { cfg.grid = {}; change(); render(); }, 'btn-ghost btn-sm'));
    if (acts.childNodes.length) p.body.appendChild(acts);
    // planilla
    const num = (label, key, unit, step, id) => UI.num({ label, id, unit, value: cfg[key] != null ? cfg[key] : '', min: 0, step, onChange: (v) => { cfg[key] = isFinite(v) && v >= 0 ? v : null; saveStaff(); notify(); } }).el;
    const weekH = dows.reduce((s, w) => s + staffDay(i, w).reduce((x, y) => x + y, 0), 0);
    p.body.appendChild(h('details', { class: 'more', open: cfg.ft != null || cfg.pt != null }, h('summary', null, 'Planilla: personas contratadas (para ver el plan en personas)'),
      h('div', { class: 'stack', style: { paddingTop: '10px' } },
        h('div', { class: 'fgrid c3' }, num('De jornada completa', 'ft', 'personas', 1, `ft-${i}`), num('De medio tiempo', 'pt', 'personas', 1, `pt-${i}`), num('Ausencias (vacaciones, permisos)', 'abs', '%', 1, `abs-${i}`),
          num('Horas por semana, jornada completa', 'ftH', 'h', 1, `fth-${i}`), num('Horas por semana, medio tiempo', 'ptH', 'h', 1, `pth-${i}`)),
        h('p', { class: 'hint' }, `Con el horario de arriba se trabajan ${U.fmtInt(weekH)} horas-persona de atención por semana. La planilla sirve para que el plan diga cuántas personas te sobran o te faltan.`))));
    return p.el;
  }
  function runRow(r, label) {
    return h('div', { class: 'run' }, h('b', null, label), h('span', { class: 'lcd', 'data-run': r.id }, mmss((Date.now() - r.t0) / 60000)),
      UI.btn('Terminar', () => stopTimer(r.id), 'btn-primary'), UI.btn('Cancelar', () => { S.running = S.running.filter((x) => x.id !== r.id); render(); }, 'btn-ghost btn-sm'));
  }
  function startTimer(o) { S.running.push(Object.assign({ id: U.uid('run'), t0: Date.now() }, o)); render(); }
  function stopTimer(id) {
    const r = S.running.find((x) => x.id === id); if (!r) return;
    S.running = S.running.filter((x) => x.id !== id);
    const min = (Date.now() - r.t0) / 60000;
    if (min < 3 / 60) { U.toast('Menos de 3 segundos: no se guardó.', 'warn'); render(); return; }
    const m = measNow(); const v = Math.round(min * 60) / 60;
    if (r.kind === 'walk') m.walk.push(v); else (m.svc[r.key] = m.svc[r.key] || []).push(v);
    S.lastKey = r.kind === 'walk' ? 'walk' : r.key;
    saveMeas(); applySoon(); render();
  }
  function undoLast(key) {
    const m = measNow(); const list = key === 'walk' ? m.walk : m.svc[key];
    if (list && list.length) { list.pop(); saveMeas(); applySoon(); render(); }
  }
  function startTicker() {
    clearInterval(ticker);
    if (!S.running.length) return;
    ticker = setInterval(() => {
      if (S.step !== 'mediciones' || !S.running.length) { clearInterval(ticker); return; }
      E.view.querySelectorAll('[data-run]').forEach((el) => { const r = S.running.find((x) => x.id === el.dataset.run); if (r) el.textContent = mmss((Date.now() - r.t0) / 60000); });
    }, 250);
  }
  function svcItem(n) {
    const i = n.ai, ar = S.proc.areas[i], a = S.areas[i], m = measNow();
    const ST = { datos: ['Medido con tus reportes', 'ok'], inferido: ['Calculado con tus reportes', 'ok'], listo: [`Medido · ${n.have} atenciones`, 'ok'], parcial: [`En curso · ${n.have} de ${n.need}`, 'warn'], falta: ['Falta medir', 'warn'] }[n.state];
    const p = UI.panel(`Tiempo de atención en ${short(ar.name)}`, { actions: [UI.tag(ST[0], ST[1])] });
    const prev = i > 0 ? short(S.proc.areas[i - 1].name) : '';
    const maxM = a.svc0.filter(Boolean).map((s) => s.mean);
    const why = n.state === 'datos' ? 'Tus reportes traen la hora de inicio de cada atención: se mide exacta. No hace falta cronometrar.'
      : n.state === 'inferido' ? `Se calcula con el tiempo entre el documento de ${prev} y el de ${short(ar.name)}, descontando el traslado. Puedes cronometrar algunas atenciones para confirmarlo.`
      : n.state === 'listo' ? `Tu reporte solo guarda la hora de cada documento, por eso se cronometró. Sin medir, el modelo usaría un máximo${maxM.length ? ' (' + maxM.map((x) => U.fmtTime(x)).join(' y ') + ')' : ''}. Más mediciones mejoran la precisión.`
      : `Tu reporte solo guarda la hora de cada documento. El tiempo entre dos documentos de la misma ${lower(ar.server || 'caja')} incluye el tiempo libre de ${lower(ar.staff || 'quien atiende')}, así que mientras no midas se usa un máximo${maxM.length ? ' (' + maxM.map((x) => U.fmtTime(x)).join(' y ') + ')' : ''}. Cronometra al menos ${MS.MIN_SVC} atenciones; si mides un solo tipo, los demás se ajustan con tus datos.`;
    p.body.appendChild(h('p', { class: 'meas-why' }, why));
    const originTag = (sv) => (sv ? UI.tag(ORIGIN[sv.method] || sv.method, sv.method === 'maximo' ? 'warn' : sv.method === 'indicado' || sv.method === 'ajustado' ? 'info' : 'ok') : '—');
    if (n.state === 'datos') {
      p.body.appendChild(UI.table(['Tipo', { t: 'Atención promedio', num: true }, 'Origen'], a.labels.map((l, t) => [l, a.svc[t] ? U.fmtTime(a.svc[t].mean) : '—', originTag(a.svc[t])]), { compact: true, cls: 'meas-tbl' }));
      return p.el;
    }
    p.body.appendChild(UI.table(['Tipo', { t: 'Cronometradas', num: true }, { t: 'Promedio medido', num: true }, { t: 'Usa el modelo', num: true }, 'Origen'], a.labels.map((l, t) => {
      const xs = m.svc[MS.measureKey(ar, l)] || []; const ts = MS.timeStudy(xs); const sv = a.svc[t];
      return [l, xs.length ? U.fmtInt(xs.length) : '—', xs.length >= 2 && isFinite(ts.hw) ? `${U.fmtTime(ts.mean)} ± ${U.fmtTime(ts.hw)}` : xs.length ? U.fmtTime(ts.mean) : '—',
        sv ? U.fmtTime(sv.mean) : '—', sv ? UI.tag(ORIGIN[sv.method] || sv.method, sv.method === 'maximo' ? 'warn' : sv.method === 'indicado' || sv.method === 'ajustado' ? 'info' : 'ok') : '—'];
    }), { compact: true, cls: 'meas-tbl' }));
    if (n.state !== 'datos') {
      const padKey = 'svc' + i; const open = S.view.pad === padKey || S.running.some((r) => r.ai === i && r.kind === 'svc');
      const typedOpen = S.view.typed === padKey;
      p.body.appendChild(h('div', { class: 'cluster' },
        UI.btn([UI.icon('stopwatch'), open ? 'Ocultar cronómetro' : n.state === 'inferido' ? 'Cronometrar para confirmar' : 'Cronometrar'], () => { S.view.pad = open ? null : padKey; render(); }, open || n.state === 'inferido' || n.state === 'listo' ? 'btn-sm' : 'btn-primary btn-sm'),
        UI.btn('Ya lo medí: escribir el promedio', () => { S.view.typed = typedOpen ? null : padKey; render(); }, 'btn-ghost btn-sm')));
      if (open) {
        const pad = h('div', { class: 'pad' });
        pad.appendChild(h('p', { class: 'hint' }, `Toca el tipo de atención cuando ${lower(ar.staff || 'quien atiende')} empieza con un cliente y "Terminar" cuando lo despide. Puedes cronometrar varias ${lower(ar.server || 'cajas')} a la vez.`));
        pad.appendChild(h('div', { class: 'tbtns' }, a.labels.map((l) => { const key = MS.measureKey(ar, l); const cnt = (m.svc[key] || []).length;
          const b = h('button', { type: 'button', class: 'tbtn' }, h('span', null, l), h('small', null, `${cnt} ${cnt === 1 ? 'medición' : 'mediciones'}`));
          b.addEventListener('click', () => startTimer({ kind: 'svc', ai: i, key, label: l })); return b; })));
        const runs = S.running.filter((r) => r.kind === 'svc' && r.ai === i);
        if (runs.length) pad.appendChild(h('div', { class: 'runs' }, runs.map((r) => runRow(r, r.label))));
        const lastKey = a.labels.map((l) => MS.measureKey(ar, l)).find((k) => k === S.lastKey);
        if (lastKey) { const list = m.svc[lastKey]; pad.appendChild(h('div', { class: 'cluster' }, h('span', { class: 'hint' }, `Última: ${lastKey.split('|')[1]} · ${mmss(list[list.length - 1])}`), UI.btn('Deshacer', () => undoLast(lastKey), 'btn-ghost btn-sm'))); }
        p.body.appendChild(pad);
      }
      if (typedOpen) p.body.appendChild(typedForm(ar, a));
    }
    return p.el;
  }
  function typedForm(ar, a) {
    const m = measNow(); const box = h('div', { class: 'pad' });
    box.appendChild(h('p', { class: 'hint' }, 'Si ya cronometraste con otro método, escribe el promedio y cuántas atenciones mediste. Es mejor cargar los tiempos individuales (abajo): así también se mide la variabilidad.'));
    box.appendChild(UI.table(['Tipo', { t: 'Promedio (min)', num: true }, { t: 'Atenciones medidas', num: true }], a.labels.map((l) => {
      const key = MS.measureKey(ar, l); const cur = m.typed[key] || {};
      const im = h('input', { type: 'number', min: '0', step: '0.05', class: 'cell-in num-in', value: cur.mean > 0 ? String(cur.mean) : '', 'aria-label': 'Promedio de ' + l });
      const inn = h('input', { type: 'number', min: '0', step: '1', class: 'cell-in num-in', value: cur.n > 0 ? String(cur.n) : '', 'aria-label': 'Atenciones medidas de ' + l });
      const save = () => { const mean = parseFloat(im.value), nn = parseInt(inn.value, 10); if (mean > 0) m.typed[key] = { mean, n: nn > 0 ? nn : 0 }; else delete m.typed[key]; saveMeas(); applySoon(); };
      im.addEventListener('change', save); inn.addEventListener('change', save);
      return [l, im, inn];
    }), { compact: true }));
    return box;
  }
  function walkItem(n) {
    const li = S.areas.findIndex((a) => a && a.linkFit); const A = S.proc.areas[li - 1], B = S.proc.areas[li]; const m = measNow();
    const ST = { listo: [`Medido · ${n.have} traslados`, 'ok'], parcial: [`En curso · ${n.have} de ${n.need}`, 'warn'], falta: ['Falta medir', 'warn'] }[n.state];
    const p = UI.panel(`Traslado de ${short(A.name)} a ${short(B.name)}`, { actions: [UI.tag(ST[0], ST[1])] });
    p.body.appendChild(h('p', { class: 'meas-why' }, `Se descuenta del tiempo entre el documento de ${short(A.name)} y el de ${short(B.name)} para calcular la atención en ${short(B.name)}: cada minuto de error en el traslado cambia casi un minuto ese cálculo. Hoy se usa ${U.fmt(S.proc.walk, 2)} min ${S.proc.walkMeasured ? '(medido)' : '(valor provisional, sin medir)'}.`));
    const ts = MS.timeStudy(m.walk, { min: MS.MIN_WALK });
    if (m.walk.length) p.body.appendChild(UI.stats([{ l: 'Traslados medidos', v: U.fmtInt(m.walk.length), s: `mínimo ${MS.MIN_WALK}` }, { l: 'Promedio', v: U.fmtTime(ts.mean), s: isFinite(ts.hw) ? `± ${U.fmtTime(ts.hw)} (IC 95 %)` : '' }]));
    const open = S.view.pad === 'walk' || S.running.some((r) => r.kind === 'walk'); const typedOpen = S.view.typed === 'walk';
    p.body.appendChild(h('div', { class: 'cluster' },
      UI.btn([UI.icon('stopwatch'), open ? 'Ocultar cronómetro' : 'Cronometrar'], () => { S.view.pad = open ? null : 'walk'; render(); }, open || n.state === 'listo' ? 'btn-sm' : 'btn-primary btn-sm'),
      UI.btn('Ya lo medí: escribir el promedio', () => { S.view.typed = typedOpen ? null : 'walk'; render(); }, 'btn-ghost btn-sm')));
    if (open) {
      const pad = h('div', { class: 'pad' });
      pad.appendChild(h('p', { class: 'hint' }, `Toca "Salió de ${lower(short(A.name))}" cuando el cliente deja la ${lower(A.server || 'caja')} con su documento, y "Terminar" cuando entra a la fila de ${lower(short(B.name))}.`));
      const b = h('button', { type: 'button', class: 'tbtn' }, h('span', null, `Salió de ${lower(short(A.name))}`), h('small', null, `${m.walk.length} ${m.walk.length === 1 ? 'traslado' : 'traslados'}`));
      b.addEventListener('click', () => startTimer({ kind: 'walk', label: 'Traslado' }));
      pad.appendChild(h('div', { class: 'tbtns' }, b));
      const runs = S.running.filter((r) => r.kind === 'walk');
      if (runs.length) pad.appendChild(h('div', { class: 'runs' }, runs.map((r) => runRow(r, 'Traslado'))));
      if (S.lastKey === 'walk' && m.walk.length) pad.appendChild(h('div', { class: 'cluster' }, h('span', { class: 'hint' }, `Último: ${mmss(m.walk[m.walk.length - 1])}`), UI.btn('Deshacer', () => undoLast('walk'), 'btn-ghost btn-sm')));
      p.body.appendChild(pad);
    }
    if (typedOpen) {
      const cur = m.walkTyped || {};
      const im = h('input', { type: 'number', min: '0', step: '0.05', class: 'cell-in num-in', value: cur.mean >= 0 && cur.mean != null ? String(cur.mean) : '', 'aria-label': 'Promedio del traslado' });
      const inn = h('input', { type: 'number', min: '0', step: '1', class: 'cell-in num-in', value: cur.n > 0 ? String(cur.n) : '', 'aria-label': 'Traslados medidos' });
      const save = () => { const mean = parseFloat(im.value), nn = parseInt(inn.value, 10); m.walkTyped = mean >= 0 && isFinite(mean) ? { mean, n: nn > 0 ? nn : 0 } : null; saveMeas(); applySoon(); };
      im.addEventListener('change', save); inn.addEventListener('change', save);
      p.body.appendChild(h('div', { class: 'pad' }, h('div', { class: 'cluster' }, h('label', { class: 'cluster' }, 'Promedio', im, 'min'), h('label', { class: 'cluster' }, 'Traslados medidos', inn))));
    }
    return p.el;
  }
  function ioPanel() {
    const p = UI.panel('Mediciones de otro dispositivo', { sub: 'Las mediciones se guardan en este navegador. Si mediste en otro celular, descárgalas ahí y cárgalas aquí.' });
    const file = h('input', { type: 'file', accept: '.csv,.txt', hidden: true, id: 'meas-file' });
    file.addEventListener('change', async () => { const fl = file.files[0]; file.value = ''; if (fl) await importMeas(fl); });
    const confirmBox = h('div', { class: 'callout warn', hidden: true }, UI.icon('alert'), h('div', null, h('span', null, 'Se borrarán todas las mediciones de este navegador.'),
      h('div', { class: 'cluster' }, UI.btn('Sí, borrar', () => { const m = measNow(); m.svc = {}; m.typed = {}; m.walk = []; m.walkTyped = null; saveMeas(); applySoon(); render(); }, 'btn-sm'), UI.btn('No', () => { confirmBox.hidden = true; }, 'btn-ghost btn-sm'))));
    const total = Object.values(measNow().svc).reduce((s, l) => s + l.length, 0) + measNow().walk.length;
    p.body.appendChild(h('div', { class: 'cluster' },
      UI.btn([UI.icon('download'), 'Descargar mediciones (CSV)'], exportMeas, 'btn-sm', { disabled: !total }),
      UI.btn([UI.icon('upload'), 'Cargar mediciones (CSV)'], () => file.click(), 'btn-sm'),
      UI.btn([UI.icon('trash'), 'Borrar todas'], () => { confirmBox.hidden = false; }, 'btn-ghost btn-sm', { disabled: !total }), file));
    p.body.appendChild(confirmBox);
    return p.el;
  }
  function exportMeas() {
    const m = measNow(); const rows = [];
    Object.keys(m.svc).forEach((k) => { const [area, tipo] = k.split('|'); m.svc[k].forEach((x) => rows.push(['atencion', area, tipo, Math.round(x * 60), ''])); });
    Object.keys(m.typed).forEach((k) => { const [area, tipo] = k.split('|'); rows.push(['promedio_indicado', area, tipo, Math.round(m.typed[k].mean * 60), m.typed[k].n || '']); });
    m.walk.forEach((x) => rows.push(['traslado', '', '', Math.round(x * 60), '']));
    if (m.walkTyped) rows.push(['traslado_promedio_indicado', '', '', Math.round(m.walkTyped.mean * 60), m.walkTyped.n || '']);
    U.saveFile('mediciones_en_tienda.csv', U.toCSV(['medicion', 'area', 'tipo', 'segundos', 'n'], rows, { sep: ',' }), 'text/csv;charset=utf-8');
  }
  async function importMeas(fl) {
    try {
      const text = await fl.text();
      const parsed = root.Papa ? root.Papa.parse(text.replace(/^﻿/, ''), { skipEmptyLines: true }).data : text.split(/\r?\n/).filter(Boolean).map((l) => l.split(','));
      const m = S.meas; let n = 0;
      parsed.slice(1).forEach((r) => {
        const kind = String(r[0] || '').trim(); const sec = parseFloat(String(r[3] || '').replace(',', '.')); if (!(sec >= 0)) return;
        const key = String(r[1] || '').trim() + '|' + String(r[2] || '').trim();
        if (kind === 'atencion' && sec >= 3) { (m.svc[key] = m.svc[key] || []).push(sec / 60); n++; }
        else if (kind === 'traslado') { m.walk.push(sec / 60); n++; }
        else if (kind === 'promedio_indicado') { m.typed[key] = { mean: sec / 60, n: parseInt(r[4], 10) || 0 }; n++; }
        else if (kind === 'traslado_promedio_indicado') { m.walkTyped = { mean: sec / 60, n: parseInt(r[4], 10) || 0 }; n++; }
      });
      U.store.set('flow:meas', S.meas);
      U.toast(n ? `Se cargaron ${n} mediciones${S.example ? ' (se usarán con tus reportes, no con el ejemplo)' : ''}.` : 'El archivo no tiene mediciones reconocibles.', n ? 'ok' : 'warn', 5000);
      if (!S.example) applySoon(); render();
    } catch (e) { U.toast('No se pudo leer el archivo: ' + e.message, 'bad'); }
  }
  /* ======================= cálculos en segundo plano ======================= */
  const jobs = {};
  function runJob(name, step, fn) {
    if (jobs[name]) return; jobs[name] = true; S[name + 'Err'] = null;
    Promise.resolve().then(fn).catch((e) => { console.error(e); S[name + 'Err'] = e.message || String(e); })
      .finally(() => { jobs[name] = false; if (S.step === step) render(); });
  }
  function busyPanel(text, prog, errName, retry) {
    const p = UI.panel(null);
    if (S[errName]) { p.body.appendChild(UI.callout('bad', 'No se pudo calcular: ' + S[errName])); p.body.appendChild(h('div', null, UI.btn('Reintentar', () => { S[errName] = null; retry(); }, 'btn-sm'))); }
    else { p.body.appendChild(h('p', null, text)); p.body.appendChild(prog.el); prog.set(0.01, 'Preparando…'); }
    return p.el;
  }
  const dowsWithData = () => U.range(7, (w) => w).filter((w) => S.areas.some((a) => a.dowDays[w] > 0));
  const hourlyOf = (r, i, hh) => { if (!r) return null; const k = hh - r.spec.open / 60; const x = r.agg.stages[i].hourly[k]; return x && x.n >= 1 ? x : null; };
  const target = () => S.goal.pct / 100;
  const MIN_N = 3; // horas con menos clientes no se evalúan contra la meta (un solo cliente decide el porcentaje)
  const QUALITY = { medido: 'Medida', inferido: 'Calculada con documentos', ajustado: 'Medida y ajustada', maximo: 'Máximo: falta medir', 'sin dato': 'Sin dato' };

  /* ======================= 4. Diagnóstico ======================= */
  async function computeDiag(prog) {
    const dows = dowsWithData(); const byDow = {};
    for (let k = 0; k < dows.length; k++) {
      const w = dows[k];
      byDow[w] = await MS.validateModel(S.proc, S.areas, S.comb, w, { reps: 20, slT: S.goal.tMin, schedDay: schedDayFor(w), onProgress: (f) => prog.set((k + f) / dows.length, `Simulando el ${U.DIAS_L[w].toLowerCase()} (${k + 1} de ${dows.length})…`) });
      await U.tick();
    }
    const val = S.proc.areas.map((ar, i) => {
      let num = 0, den = 0; dows.forEach((w) => byDow[w].areas[i].hours.forEach((r) => { num += Math.abs(r.sim - r.obs); den += r.obs; }));
      const wape = den > 0 ? num / den : NaN; return { name: ar.name, wape, state: wape <= 0.1 ? 'ok' : wape <= 0.2 ? 'warn' : 'bad' };
    });
    S.diag = { byDow, dows, val, tMin: S.goal.tMin, reps: 20 };
    notify();
  }
  function rDiagnostico() {
    add(head(3, 'Cómo está tu operación hoy', 'Cada día de la semana simulado con el personal que registró tu sistema y comparado con lo que pasó.'));
    if (!S.areas) { needData(); return; }
    add(exampleBanner()); add(prelimNote());
    if (!S.diag || S.diag.tMin !== S.goal.tMin) {
      const prog = UI.progress();
      add(busyPanel('Simulando cada día de la semana con el personal que tuviste (20 réplicas por día)…', prog, 'diagErr', () => render()));
      add(foot('mediciones', null));
      if (!S.diagErr) runJob('diag', 'diagnostico', () => computeDiag(prog));
      return;
    }
    const worst = S.diag.val.reduce((a, b) => (b.wape > a.wape ? b : a), S.diag.val[0]);
    const valTxt = S.diag.val.map((v) => `${short(v.name)} ${U.fmtPct(v.wape, 1)}`).join(' · ');
    add(worst.state === 'ok' ? UI.callout('ok', h('span', null, h('b', null, 'El modelo reproduce tu operación. '), `Error por hora frente a tus datos: ${valTxt}. Con menos de 10 % el modelo es confiable para decidir.`))
      : UI.callout(worst.state, h('span', null, h('b', null, worst.state === 'warn' ? 'El modelo se parece a tu operación, con diferencias. ' : 'El modelo no reproduce bien tu operación. '), `Error por hora: ${valTxt}. Revisa la correspondencia de tipos (paso 2) y los tipos de cliente (paso 1).`)));
    add(queueTodayPanel());
    const F2 = findings();
    const pf = UI.panel('Lo más importante');
    pf.body.appendChild(h('ul', { class: 'findings' }, F2.map(([k, t]) => h('li', { class: k }, UI.icon(k === 'ok' ? 'check' : k === 'info' ? 'info' : 'alert'), h('span', null, t)))));
    add(pf.el);
    // área seleccionada
    const ai = Math.min(S.view.area, S.areas.length - 1);
    const pa = UI.panel(`Semana típica · ${baseTxt()}`, { actions: S.areas.length > 1 ? [UI.seg({ label: 'Área', value: ai, options: S.proc.areas.map((ar, i) => [i, short(ar.name)]), onChange: (v) => { S.view.area = v; render(); } }).el] : null });
    pa.body.appendChild(areaStats(ai));
    const metric = S.view.metric;
    pa.body.appendChild(h('div', { class: 'cluster' }, UI.seg({ label: 'Qué ver', value: metric, options: [['sl', 'Dentro de la meta'], ['clientes', 'Clientes por hora'], ['personal', 'Personal presente'], ['ocupacion', 'Ocupación']], onChange: (v) => { S.view.metric = v; render(); } }).el));
    pa.body.appendChild(heatTable(ai, metric));
    pa.body.appendChild(heatLegend(metric));
    add(pa.el);
    const season = MS.areaSeason(S.areas[ai]);
    if (season.months >= 3) add(seasonPanel(season, ai));
    // detalle técnico
    const det = h('div', { class: 'stack' });
    det.appendChild(validationPanel(ai));
    S.areas.forEach((a, i) => { if (a.linkFit) det.appendChild(linkPanel(a, i)); });
    det.appendChild(fichaPanel());
    add(h('details', { class: 'more' }, h('summary', null, 'Detalle técnico: validación hora por hora, tiempo entre áreas y ficha del modelo'), det));
    add(foot('mediciones', () => F.go('plan'), 'Ver el plan de personal'));
  }
  // La fila en movimiento de un día con el personal de hoy (el usuario elige el día)
  function queueTodayPanel() {
    const w = S.view.simDow != null && S.diag.byDow[S.view.simDow] ? S.view.simDow : MS.busiestDow(S.areas);
    const p = UI.panel(`Tu fila en movimiento: ${U.DIAS_L[w].toLowerCase()} con el personal de hoy`, { sub: 'Simulación con tus datos: llegan los clientes de ese día de la semana y se atienden con los tiempos medidos. Empieza poco antes de la hora más difícil. Puntos sobre la cabeza: verde, espera corta; amarillo, cerca de la meta; rojo, la pasó.' });
    p.el.id = 'diag-fila';
    p.body.appendChild(h('div', { class: 'chips' }, S.diag.dows.map((d) => { const b = h('button', { type: 'button', class: 'chip' + (d === w ? ' on' : ''), 'aria-pressed': String(d === w) }, U.DIAS[d]); b.addEventListener('click', () => { S.view.simDow = d; render(); const el = document.getElementById('diag-fila'); if (el) el.scrollIntoView({ block: 'start' }); }); return b; })));
    const box = h('div'); p.body.appendChild(box);
    const spec0 = MS.buildSpec(S.proc, S.areas, S.comb, w, { reps: 1 });
    S.players.push(player(box, { w, X: {}, t0: worstStart(w, spec0), sides: [{ label: 'Con el personal de hoy', schedDay: schedDayFor(w) }] }));
    return p.el;
  }
  function areaStats(i) {
    const a = S.areas[i], sm = MS.areaService(a), T = target();
    let num = 0, den = 0; for (let w = 0; w < 7; w++) for (let hh = 0; hh < 24; hh++) if (a.sHeat[w][hh] > 0) { num += a.heat[w][hh] * sm.m / 60 * a.dowDays[w]; den += a.sHeat[w][hh] * a.dowDays[w]; }
    let ok = 0, tot = 0, ws = 0, wn = 0;
    S.diag.dows.forEach((w) => { const r = S.diag.byDow[w]; r.agg.stages[i].hourly.forEach((x) => { if (!x || !(x.n >= 1)) return; if (isFinite(x.wq)) { ws += x.wq * x.n; wn += x.n; } if (x.n < MIN_N) return; tot++; if (x.sl >= T - 0.005) ok++; }); });
    return UI.stats([
      { l: 'Clientes por día', v: U.fmtInt(a.nVis / Math.max(1, a.openDays)), s: `promedio de las ${baseTxt()}` },
      { l: 'Atención promedio', v: U.fmtTime(sm.m), s: QUALITY[a.quality] || '' },
      { l: 'Ocupación del personal', v: U.fmtPct(den ? num / den : NaN, 0), s: 'tiempo atendiendo' },
      { l: 'Horas en la meta', v: `${ok} de ${tot}`, s: `${S.goal.pct} % en ${U.fmtTime(S.goal.tMin)}` },
      { l: 'Espera promedio', v: U.fmtTime(wn ? ws / wn : NaN), s: 'calculada con el modelo' }]);
  }
  const mix = (token, p) => `color-mix(in srgb, var(${token}) ${Math.round(U.clamp(p, 0, 100))}%, var(--surface))`;
  function heatTable(i, metric) {
    const a = S.areas[i], sm = MS.areaService(a).m, T = target(), dows = S.diag.dows;
    let h0 = 24, h1 = 0;
    if (metric === 'sl') dows.forEach((w) => { const r = S.diag.byDow[w], o = r.spec.open / 60; r.agg.stages[i].hourly.forEach((x, k) => { if (x && x.n >= 1) { h0 = Math.min(h0, o + k); h1 = Math.max(h1, o + k + 1); } }); });
    else dows.forEach((w) => { for (let hh = 0; hh < 24; hh++) if (a.heat[w][hh] > 0.3 || a.sHeat[w][hh] > 0.3) { h0 = Math.min(h0, hh); h1 = Math.max(h1, hh + 1); } });
    if (h1 <= h0) return h('p', { class: 'hint' }, 'Sin datos por hora.');
    const hours = U.range(h1 - h0, (k) => h0 + k);
    let maxV = 0; dows.forEach((w) => hours.forEach((hh) => { maxV = Math.max(maxV, metric === 'clientes' ? a.heat[w][hh] : metric === 'personal' ? a.sHeat[w][hh] : 0); }));
    const cell = (w, hh) => {
      if (metric === 'sl') { const x = hourlyOf(S.diag.byDow[w], i, hh); if (!x) return h('td', { class: 'na' }, '·');
        if (x.n < MIN_N) return h('td', { class: 'few', title: `${U.DIAS_L[w]} ${U.fmtHour(hh)}: menos de ${MIN_N} clientes en la hora; no se evalúa la meta` }, String(Math.round(x.sl * 100)));
        const miss = x.sl < T - 0.005; const sev = miss ? 18 + 60 * Math.min(1, (T - x.sl) / Math.max(0.05, T) * 2) : 0;
        return h('td', { style: miss ? { background: mix('--bad', sev) } : null, title: `${U.DIAS_L[w]} ${U.fmtHour(hh)}: ${pct0(x.sl)} dentro de la meta · espera promedio ${U.fmtTime(x.wq)} · ${U.fmt(x.n, 0)} clientes` }, String(Math.round(x.sl * 100))); }
      if (metric === 'clientes') { const v = a.heat[w][hh]; if (!(v > 0.3)) return h('td', { class: 'na' }, '·'); return h('td', { style: { background: mix('--accent', 6 + 52 * v / Math.max(1, maxV)) }, title: `${U.DIAS_L[w]} ${U.fmtHour(hh)}: ${U.fmt(v, 1)} clientes en promedio` }, U.fmtInt(v)); }
      if (metric === 'personal') { const v = a.sHeat[w][hh]; if (!(v > 0.05)) return h('td', { class: 'na' }, '·'); return h('td', { style: { background: mix('--accent', 6 + 52 * v / Math.max(1, maxV)) }, title: `${U.DIAS_L[w]} ${U.fmtHour(hh)}: ${U.fmt(v, 1)} ${lower(S.proc.areas[i].staff || 'personas')} en promedio` }, U.fmt(v, 1)); }
      const c = a.sHeat[w][hh], lam = a.heat[w][hh]; if (!(c > 0.05) || !(lam > 0.3)) return h('td', { class: 'na' }, '·');
      const occ = lam * sm / 60 / c; return h('td', { style: { background: occ > 0.85 ? mix('--bad', 18 + 60 * Math.min(1, (occ - 0.85) / 0.25)) : mix('--accent', 6 + 40 * occ) }, title: `${U.DIAS_L[w]} ${U.fmtHour(hh)}: ocupación ${pct0(occ)}` }, String(Math.round(occ * 100)));
    };
    return h('div', { class: 'heat-wrap' }, h('table', { class: 'heat', 'aria-label': 'Semana por día y hora' },
      h('thead', null, h('tr', null, h('th', null, ''), hours.map((hh) => h('th', { scope: 'col' }, U.pad2(hh))))),
      h('tbody', null, dows.map((w) => h('tr', null, h('th', { scope: 'row' }, U.DIAS[w]), hours.map((hh) => cell(w, hh)))))));
  }
  function heatLegend(metric) {
    const sw = (bg) => h('i', { style: { background: bg } });
    if (metric === 'sl') return h('div', { class: 'legend' }, h('span', null, `Porcentaje de clientes que espera menos de ${U.fmtTime(S.goal.tMin)}, con el personal que tuviste.`), h('span', null, sw('var(--surface-2)'), `cumple la meta (${S.goal.pct} % o más)`), h('span', null, sw(mix('--bad', 30)), 'no la cumple'), h('span', null, sw(mix('--bad', 78)), 'muy lejos de la meta'));
    if (metric === 'ocupacion') return h('div', { class: 'legend' }, h('span', null, 'Porcentaje del tiempo que el personal presente estuvo atendiendo.'), h('span', null, sw(mix('--bad', 40)), 'más de 85 %: se forman filas largas'));
    return h('div', { class: 'legend' }, h('span', null, metric === 'clientes' ? 'Clientes que llegan en cada hora, promedio de los días con datos.' : 'Personas atendiendo en cada hora según los registros, promedio de los días con datos.'));
  }
  function findings() {
    const out = []; const T = target(), tm = S.goal.tMin;
    const blocks = [];
    S.proc.areas.forEach((ar, i) => S.diag.dows.forEach((w) => {
      const r = S.diag.byDow[w]; const h0 = r.spec.open / 60; let cur = null;
      r.agg.stages[i].hourly.forEach((x, k) => {
        const bad = x && x.n >= MIN_N && x.sl < T - 0.005;
        if (bad) { if (!cur) cur = { i, w, h1: h0 + k, h2: h0 + k + 1, def: 0, sl: 0, n: 0 }; cur.h2 = h0 + k + 1; cur.def += (T - x.sl) * x.n; cur.sl += x.sl * x.n; cur.n += x.n; }
        else if (cur) { blocks.push(cur); cur = null; }
      });
      if (cur) blocks.push(cur);
    }));
    blocks.sort((a, b) => b.def - a.def);
    if (!blocks.length) out.push(['ok', `Con el personal que tuviste se cumple la meta (${S.goal.pct} % en ${U.fmtTime(tm)}) en todas las horas.`]);
    blocks.slice(0, 3).forEach((b) => out.push(['bad', `${U.DIAS_L[b.w]} de ${U.fmtHour(b.h1)} a ${U.fmtHour(b.h2)} en ${short(S.proc.areas[b.i].name)}: solo el ${pct0(b.sl / b.n)} de los clientes espera menos de ${U.fmtTime(tm)} (meta: ${S.goal.pct} %).`]));
    if (blocks.length > 3) out.push(['warn', `Hay ${blocks.length - 3} ${blocks.length - 3 === 1 ? 'tramo más' : 'tramos más'} fuera de la meta: míralos en el mapa de la semana.`]);
    const low = [];
    S.proc.areas.forEach((ar, i) => { const a = S.areas[i]; const sm = MS.areaService(a).m; S.diag.dows.forEach((w) => {
      let cur = null; const r = S.diag.byDow[w];
      for (let hh = 0; hh < 24; hh++) {
        const c = a.sHeat[w][hh], lam = a.heat[w][hh]; const occ = c > 0 ? lam * sm / 60 / c : NaN; const x = hourlyOf(r, i, hh);
        const isLow = c >= 1.5 && occ < 0.45 && x && x.sl >= T;
        if (isLow) { if (!cur) cur = { i, w, h1: hh, h2: hh + 1, occ: 0, k: 0, score: 0 }; cur.h2 = hh + 1; cur.occ += occ; cur.k++; cur.score += c * (0.45 - occ); }
        else if (cur) { low.push(cur); cur = null; }
      }
      if (cur) low.push(cur);
    }); });
    low.sort((a, b) => b.score - a.score);
    low.slice(0, 2).forEach((b) => out.push(['info', `${U.DIAS_L[b.w]} de ${U.fmtHour(b.h1)} a ${U.fmtHour(b.h2)} en ${short(S.proc.areas[b.i].name)}: el personal estuvo atendiendo solo el ${pct0(b.occ / b.k)} del tiempo.`]));
    const df = MS.dayFactors(S.proc, S.areas);
    const pay = df.map((f, j) => ({ f: f.payday, j, n: f.payN })).filter((x) => x.n >= 3 && x.f >= 1.12).sort((a, b) => b.f - a.f);
    if (pay.length) out.push(['info', `En días de pago (1, 2, 15, 16 y fin de mes) llegan ${pct0(pay[0].f - 1)} más clientes de "${lower(S.proc.flows[pay[0].j].name)}". El plan tiene un tipo de día para eso.`]);
    return out.slice(0, 6);
  }
  function seasonPanel(season, ai) {
    const p = UI.panel('Temporadas', { sub: `Clientes de ${short(S.proc.areas[ai].name)} en cada mes frente al promedio${season.trend ? ', sin la tendencia de crecimiento' : ''} (${season.months} meses de datos).` });
    const vals = season.f.filter((x) => x != null); const mx = Math.max(1.05, ...vals), mn = Math.min(0.95, ...vals);
    p.body.appendChild(h('div', { class: 'season-bars', role: 'img', 'aria-label': 'Índice de temporada por mes' }, season.f.map((x, m) => h('div', null,
      h('em', null, x == null ? '—' : String(Math.round(x * 100))), h('span', { class: x == null ? 'na' : '', style: { height: x == null ? '4px' : Math.max(6, 70 * (x - mn * 0.9) / (mx - mn * 0.9)) + 'px' } }), U.MESES[m]))));
    p.body.appendChild(h('p', { class: 'hint' }, '100 = mes promedio. En el plan puedes elegir el mes para usar su demanda.'));
    return p.el;
  }
  function validationPanel(ai) {
    const w = S.view.valDow != null && S.diag.byDow[S.view.valDow] ? S.view.valDow : S.diag.dows[0];
    const r = S.diag.byDow[w]; const x = r.areas[ai];
    const p = UI.panel(`Validación: atenciones por hora en ${short(S.proc.areas[ai].name)}`, { sub: 'Promedio de tus datos frente al modelo (20 réplicas) en el mismo día de la semana.' });
    p.body.appendChild(h('div', { class: 'chips' }, S.diag.dows.map((d) => { const b = h('button', { type: 'button', class: 'chip' + (d === w ? ' on' : ''), 'aria-pressed': String(d === w) }, U.DIAS[d]); b.addEventListener('click', () => { S.view.valDow = d; render(); }); return b; })));
    const cc = UI.chartCard(null, { height: 240 });
    C.lines(cc.chartEl, { categories: x.hours.map((q) => U.fmtHour(q.hh)), yName: 'atenciones por hora', series: [{ name: 'Tus datos', data: x.hours.map((q) => +q.obs.toFixed(1)), symbols: true, ci: 0 }, { name: 'Modelo', data: x.hours.map((q) => +q.sim.toFixed(1)), symbols: true, dashed: true, ci: 1 }], vf: (q) => U.fmt(q, 1) });
    cc.setTable(() => ({ headers: ['Hora', { t: 'Real', num: true }, { t: 'Modelo', num: true }, { t: 'Diferencia', num: true }], rows: x.hours.map((q) => [U.fmtHour(q.hh), U.fmt(q.obs, 1), U.fmt(q.sim, 1), U.fmtPct(q.obs > 0 ? (q.sim - q.obs) / q.obs : NaN, 0)]) }));
    p.body.appendChild(cc.el);
    p.body.appendChild(h('p', { class: 'hint' }, `Error absoluto ponderado del ${U.DIAS_L[w].toLowerCase()}: ${U.fmtPct(x.wape, 1)}.` + (r.repsNeeded > r.reps ? ` Para estimar la espera con ±5 % harían falta ${r.repsNeeded} réplicas (Law, 2015).` : '')));
    return p.el;
  }
  function linkPanel(a, i) {
    const lf = a.linkFit;
    const p = UI.panel(`Tiempo entre ${short(S.proc.areas[i - 1].name)} y ${short(S.proc.areas[i].name)}`, { sub: `Desde el documento del área ${i} hasta el del área ${i + 1}: traslado, espera y atención. La línea punteada es el modelo; si coincide con tus datos, la atención calculada es confiable.` });
    const cc = UI.chartCard(null, { height: 260 });
    const ser = [];
    lf.types.forEach((t, k) => {
      const mx = U.quantile(t.real, 0.97); const grid = U.range(41, (q) => (mx * q) / 40);
      const cdf = (arr) => { const s = U.sortedCopy(arr); return grid.map((x) => { let lo = 0, hi = s.length; while (lo < hi) { const mid = (lo + hi) >> 1; if (s[mid] <= x) lo = mid + 1; else hi = mid; } return [+x.toFixed(2), +(lo / s.length * 100).toFixed(1)]; }); };
      ser.push({ name: `${t.type} · tus datos`, data: cdf(t.real), ci: k }, { name: `${t.type} · modelo`, data: cdf(t.sim), ci: k, dashed: true });
    });
    C.lines(cc.chartEl, { xType: 'value', xName: 'minutos entre documentos', yName: '% de clientes', yMax: 100, series: ser, vf: (v) => U.fmt(v, 1) + ' %' });
    cc.setTable(() => ({ headers: ['Tipo', { t: 'Clientes', num: true }, { t: 'Mediana real', num: true }, { t: 'Mediana modelo', num: true }, { t: 'Atención calculada', num: true }, { t: 'Espera estimada', num: true }],
      rows: lf.types.map((t) => [t.type, U.fmtInt(t.n), U.fmtTime(t.realQ[1]), t.simQ ? U.fmtTime(t.simQ[1]) : '—', U.fmtTime(a.svc[t.ti].mean), U.fmtTime(t.waitMean)]) }));
    p.body.appendChild(cc.el);
    p.body.appendChild(h('p', { class: 'hint' }, `Traslado usado: ${U.fmt(lf.walk, 2)} min (${S.proc.walkMeasured ? 'medido' : 'sin medir'}). Calibración: ${lf.iters} iteraciones, error final ${U.fmtPct(lf.err, 1)}${lf.converged ? '' : ' (no convergió: revisa los tipos y el traslado)'}.`));
    return p.el;
  }
  function modelCardNow() {
    const vd = S.diag ? (S.diag.byDow[MS.busiestDow(S.areas)] || S.diag.byDow[S.diag.dows[0]]) : null;
    return MS.modelCard(S.proc, S.areas, S.comb, { reps: 20, validation: vd, repsNeeded: vd ? vd.repsNeeded : null, factors: MS.dayFactors(S.proc, S.areas), season: MS.monthFactors(S.proc, S.areas) });
  }
  function fichaPanel() {
    const card = modelCardNow();
    const p = UI.panel('Ficha técnica del modelo', { cls: 'ficha', sub: 'Cada parámetro con su valor, de dónde sale, la evidencia y la referencia del método. Sirve para revisar el modelo con especialistas o repetirlo en otra sucursal.' });
    const MARK = { good: ['✓', 'good', 'Listo'], warn: ['!', 'warn', 'Revisar'], bad: ['×', 'bad', 'Problema'], info: ['i', 'info', 'Dato'] };
    p.body.appendChild(UI.table(['', 'Parámetro', 'Valor', 'Cómo se obtuvo', 'Evidencia', 'Referencia'], card.rows.map((r) => [h('span', { class: 'st-mark st-' + MARK[r.state][1], title: MARK[r.state][2], 'aria-label': MARK[r.state][2] }, MARK[r.state][0]), h('b', null, r.param), r.value, r.method, r.evidence, card.cite(...r.refs)]), { compact: true }));
    p.body.appendChild(h('details', { class: 'more' }, h('summary', null, `Referencias (${card.refs.length})`), h('ul', { class: 'plain refs' }, card.refs.map((r) => h('li', null, r)))));
    const spec = MS.buildSpec(S.proc, S.areas, S.comb, MS.busiestDow(S.areas), { reps: 20, slT: S.goal.tMin });
    p.body.appendChild(h('div', { class: 'cluster' },
      UI.btn([UI.icon('download'), 'Ficha técnica (CSV)'], () => U.saveFile('ficha_tecnica_modelo.csv', MS.modelCardCSV(card), 'text/csv;charset=utf-8'), 'btn-sm'),
      UI.btn([UI.icon('download'), 'Resumen de la medición (CSV)'], exportSummary, 'btn-sm'),
      UI.btn([UI.icon('download'), 'Escenario (JSON)'], () => U.saveFile('escenario_proceso.json', JSON.stringify(spec, null, 2), 'application/json'), 'btn-ghost btn-sm'),
      QS.Export ? UI.btn('Validar con Ciw (Python)', () => UI.codeModal('Validar el modelo con Ciw (Python)', QS.Export.ciw(spec), 'modelo_proceso_ciw.py', 'Segunda opinión independiente: Ciw (Palmer et al., 2019) simula la misma red con las mismas rutas y tiempos. Instala con "pip install ciw" y ejecuta el script.'), 'btn-ghost btn-sm') : null,
      UI.btn('Abrir en el simulador libre', () => { QS.App.go('herramientas', { tool: 'simulador' }); QS.SimUI.load(spec, { expert: true, play: true }); }, 'btn-ghost btn-sm')));
    return p.el;
  }
  function exportSummary() {
    const p = S.proc, areas = S.areas, comb = S.comb; const rows = [];
    comb.flows.forEach((f) => rows.push(['flujo', f.name, '', '', 'clientes_por_dia', +f.perDay.toFixed(2)], ['flujo', f.name, '', '', 'participacion', +f.share.toFixed(4)]));
    areas.forEach((a, i) => {
      const ar = p.areas[i];
      a.labels.forEach((l, t) => { const s = a.svc[t]; rows.push(['atencion', ar.name, l, s ? s.method : '', 'minutos', s ? +s.mean.toFixed(3) : '']); rows.push(['visitas', ar.name, l, '', 'total_periodo', a.typeCount[t]]); });
      const sm = MS.areaService(a).m;
      for (let w = 0; w < 7; w++) for (let hh = 0; hh < 24; hh++) {
        if (!(a.heat[w][hh] > 0)) continue;
        rows.push(['hora', ar.name, U.DIAS_L[w], U.fmtHour(hh), 'clientes', +a.heat[w][hh].toFixed(2)]);
        rows.push(['hora', ar.name, U.DIAS_L[w], U.fmtHour(hh), 'personal_presente', +a.sHeat[w][hh].toFixed(2)]);
        if (a.sHeat[w][hh] > 0) rows.push(['hora', ar.name, U.DIAS_L[w], U.fmtHour(hh), 'ocupacion', +(a.heat[w][hh] * sm / 60 / a.sHeat[w][hh]).toFixed(4)]);
      }
    });
    U.saveFile('medicion_proceso.csv', U.toCSV(['seccion', 'area_o_flujo', 'tipo_o_dia', 'hora', 'indicador', 'valor'], rows), 'text/csv;charset=utf-8');
  }
  /* ======================= 5. Plan de personal ======================= */
  const DAYTYPES = [['normal', 'Día normal'], ['pago', 'Día de pago'], ['p90', 'Día muy cargado']];
  const planKey = () => { const c = S.planCfg; return [c.dayType, c.month, c.extra, S.goal.pct, S.goal.tMin].join('|'); };
  function scenario() {
    const c = S.planCfg; const fd = MS.flowFactors(MS.dayFactors(S.proc, S.areas), c.dayType);
    const mf = c.month >= 0 ? MS.monthAdjust(S.proc, S.areas, c.month) : null;
    return { dayType: c.dayType, flowDemand: fd.map((x, j) => x * (mf ? mf[j] : 1)), demand: 1 + (+c.extra || 0) / 100, pct: S.goal.pct, tMin: S.goal.tMin };
  }
  const baseTxt = () => { const a = S.areas && S.areas[0]; if (!a || !a.win) return ''; return a.win.all ? 'todo el periodo' : `últimas ${a.win.weeks} semanas`; };
  async function computePlan(prog) {
    const dows = dowsWithData(); const X = scenario(); const key = planKey(); const byDow = {};
    for (let k = 0; k < dows.length; k++) {
      const w = dows[k];
      byDow[w] = await MS.staffBySim(S.proc, S.areas, S.comb, w, Object.assign({}, X, { reps: 12, todayDay: schedDayFor(w), onProgress: (f) => prog.set((k + f) / dows.length, `Calculando el ${U.DIAS_L[w].toLowerCase()} (${k + 1} de ${dows.length})…`) }));
      await U.tick();
    }
    S.plan = { key, byDow, dows, X };
    if (S.view.planDow == null || !byDow[S.view.planDow]) S.view.planDow = MS.busiestDow(S.areas);
    notify();
  }
  const savePlanCfg = () => U.store.set('flow:plan', S.planCfg);
  function rPlan() {
    add(head(4, 'Cuántas personas necesitas', `Personas por hora en cada área para que el ${S.goal.pct} % de los clientes espere menos de ${U.fmtTime(S.goal.tMin)}.`));
    if (!S.areas) { needData(); return; }
    add(exampleBanner()); add(prelimNote());
    add(planControls());
    if (!S.plan || S.plan.key !== planKey()) {
      const prog = UI.progress();
      add(busyPanel('Calculando el personal de cada día: Erlang C por hora y ajuste con la simulación de todo el proceso…', prog, 'planErr', () => render()));
      add(foot('diagnostico', null));
      if (!S.planErr) runJob('plan', 'plan', () => computePlan(prog));
      return;
    }
    const P = S.plan;
    // resumen de la semana (horas con clientes en cada área)
    let rec = 0, now = 0; const per = S.proc.areas.map((ar, i) => { let r = 0, t = 0; P.dows.forEach((w) => { const s = daySums(P.byDow[w], i); r += s.rec; t += s.now; }); rec += r; now += t; return { r, t }; });
    const slMin = Math.min(...P.dows.map((w) => Math.min(...P.byDow[w].agg.stages.map((s) => s.SL.mean))));
    add(UI.stats([
      { l: 'Horas-persona por semana', v: U.fmtInt(rec), s: `hoy: ${U.fmtInt(now)} (${rec >= now ? '+' : '−'}${U.fmtInt(Math.abs(rec - now))})` },
      ...S.proc.areas.map((ar, i) => ({ l: short(ar.name), v: U.fmtInt(per[i].r), unit: 'h', s: `hoy: ${U.fmtInt(per[i].t)} h` })),
      { l: 'Clientes dentro de la meta', v: U.fmtPct(slMin, 0), s: 'el día y área más ajustados' }]));
    add(queuePanel());
    add(peoplePanel());
    S.proc.areas.forEach((ar, i) => {
      const p = UI.panel(ar.name, { sub: `${ar.staff || 'Personas'} por hora. El número pequeño compara con el personal de hoy: +1 falta una persona, −1 sobra una. Toca un día para ver sus turnos y su fila.` });
      p.body.appendChild(planTable(i));
      add(p.el);
    });
    add(dayPanel());
    add(whatIfBlock());
    add(foot('diagnostico', null, null, { extra: [UI.btn([UI.icon('download'), 'Descargar el plan (CSV)'], exportPlan, 'btn-primary btn-lg')] }));
  }
  function planControls() {
    const c = S.planCfg; const p = UI.panel(null);
    if (!DAYTYPES.some((d) => d[0] === c.dayType)) c.dayType = 'normal';
    const mf = MS.monthFactors(S.proc, S.areas); const months = MS.monthsWithData(mf);
    if (c.month >= 0 && !months.includes(c.month)) c.month = -1;
    const changed = () => { savePlanCfg(); S.cmp = null; render(); };
    p.body.appendChild(h('div', { class: 'ctrl-row' },
      h('div', { class: 'field' }, h('span', { class: 'lbl' }, 'Tipo de día'), UI.seg({ label: 'Tipo de día', value: c.dayType, options: DAYTYPES, onChange: (v) => { c.dayType = v; changed(); } }).el),
      months.length >= 2 ? UI.select({ label: 'Mes', id: 'plan-month', value: String(c.month), options: [['-1', `Nivel actual (${baseTxt()})`]].concat(months.map((m) => { const adj = MS.monthAdjust(S.proc, S.areas, m, mf); return [String(m), `${U.MESES_L[m]} (×${U.fmt(U.mean(adj), 2)})`]; })), onChange: (v) => { c.month = +v; changed(); } }).el : null,
      UI.num({ label: 'Cambio de demanda', id: 'plan-extra', unit: '%', value: c.extra, step: 5, help: 'Por ejemplo +10 % si esperas crecer o por una campaña; −10 % para una temporada baja.', onChange: (v) => { c.extra = isFinite(v) ? U.clamp(v, -80, 300) : 0; changed(); } }).el,
      h('div', { class: 'field' }, h('span', { class: 'lbl' }, 'Meta'), h('span', { class: 'cluster' }, numIn(S.goal.pct, (v) => { S.goal.pct = U.clamp(Math.round(v), 50, 99); U.store.set('flow:goal', S.goal); changed(); }, 1, 'plan-pct'), '% en menos de', numIn(S.goal.tMin, (v) => { S.goal.tMin = U.clamp(v, 0.5, 120); U.store.set('flow:goal', S.goal); S.diag = null; changed(); }, 0.5, 'plan-t'), 'min'))));
    const X = scenario();
    if (c.dayType !== 'promedio' || c.month >= 0 || X.demand !== 1) p.body.appendChild(h('p', { class: 'hint' }, 'Demanda de cada tipo de cliente frente al día típico: ' + S.proc.flows.map((f, j) => `${lower(f.name)} ×${U.fmt(X.flowDemand[j] * X.demand, 2)}`).join(' · ') + '.'));
    return p.el;
  }
  // Una hora cuenta para el plan de un área si llegan clientes a esa área (después del cierre solo se termina de atender la fila)
  const activeHour = (r, i, k) => r.lam[i][k] > 0.05;
  function daySums(r, i) { let rec = 0, now = 0; r.sched[i].forEach((c, k) => { if (activeHour(r, i, k)) { rec += c; now += Math.round(r.today[i][k]); } }); return { rec, now }; }
  function planTable(i) {
    const P = S.plan; let hMin = 24, hMax = 0, maxV = 1;
    P.dows.forEach((w) => { const r = P.byDow[w]; r.sched[i].forEach((c, k) => { if (!activeHour(r, i, k)) return; hMin = Math.min(hMin, r.h0 + k); hMax = Math.max(hMax, r.h0 + k + 1); maxV = Math.max(maxV, c); }); });
    if (hMax <= hMin) return h('p', { class: 'hint' }, 'Sin clientes en esta área.');
    const hours = U.range(hMax - hMin, (k) => hMin + k);
    let wr = 0, wt = 0;
    const body = P.dows.map((w) => {
      const r = P.byDow[w]; const sums = daySums(r, i); const tr = sums.rec, tt = sums.now;
      const tds = hours.map((hh) => {
        const k = hh - r.h0; if (k < 0 || k >= r.H || !activeHour(r, i, k)) return h('td', { class: 'na' }, '·');
        const v = r.sched[i][k], t = Math.round(r.today[i][k]), d = v - t;
        const x = r.agg.stages[i].hourly[k] || {};
        return h('td', { class: d > 0 ? 'up' : d < 0 ? 'down' : '', style: { background: mix('--accent', 5 + 38 * v / maxV) }, title: `${U.DIAS_L[w]} ${U.fmtHour(hh)}: ${v} recomendado, ${U.fmt(r.today[i][k], 1)} hoy · ${U.fmt(r.lam[i][k], 1)} clientes · ${pct0(x.sl)} dentro de la meta` },
          h('b', null, String(v)), d ? h('sup', null, (d > 0 ? '+' : '−') + Math.abs(d)) : null);
      });
      wr += tr; wt += tt;
      const tr0 = h('tr', { class: w === S.view.planDow ? 'sel' : '', tabindex: '0', 'aria-label': `Ver turnos y fila del ${U.DIAS_L[w]}` }, h('th', { scope: 'row' }, U.DIAS[w]), tds, h('td', { class: 'tot', title: `Hoy: ${tt} horas-persona` }, `${tr} h`));
      const pick = () => { S.view.planDow = w; render(); const el = document.getElementById('plan-fila'); if (el) el.scrollIntoView({ behavior: reduced() ? 'auto' : 'smooth', block: 'start' }); };
      tr0.addEventListener('click', pick); tr0.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); } });
      return tr0;
    });
    return h('div', { class: 'plan-wrap' }, h('table', { class: 'plan' },
      h('thead', null, h('tr', null, h('th', null, ''), hours.map((hh) => h('th', { scope: 'col' }, U.pad2(hh))), h('th', null, 'Total'))),
      h('tbody', null, body),
      h('tfoot', null, h('tr', null, h('th', { scope: 'row' }, 'Semana'), h('td', { colspan: String(hours.length), style: { textAlign: 'left', color: 'var(--muted)', fontWeight: '500' } }, `Hoy: ${wt} horas-persona`), h('td', { class: 'tot' }, `${wr} h`)))));
  }
  // Turnos de un día y área (programación entera sobre las horas con clientes; se guardan para no recalcular)
  function shiftsOf(w, i, today) {
    const r = S.plan.byDow[w]; const key = (today ? 'hoy:' : '') + w + ':' + i; S.plan.shifts = S.plan.shifts || {};
    const row = (today ? r.today[i].map((x) => Math.round(x)) : r.sched[i]).map((c, k) => (activeHour(r, i, k) ? c : 0));
    return S.plan.shifts[key] || (S.plan.shifts[key] = QS.Staff.dayShifts(row, { ftLen: 8, ptLen: 4, allowPT: true, ftCost: 1, ptCost: 1.1, maxPT: 0.4, step: 60 }));
  }
  const fmt1 = (x) => U.fmt(x, 1);
  // "1 persona de jornada completa y 1 de medio tiempo" a partir de equivalentes de jornada completa
  // Diferencia en personas: jornadas completas y, si queda al menos un cuarto, una de medio tiempo. n: cuántas personas son (para el verbo)
  function peopleOf(d) {
    let ft = Math.floor(d); const rem = d - ft; let pt = 0;
    if (rem >= 0.75) ft++; else if (rem >= 0.25) pt = 1;
    const parts = []; if (ft) parts.push(`${ft} ${ft === 1 ? 'persona' : 'personas'} de jornada completa`); if (pt) parts.push(`${ft ? '1' : '1 persona'} de medio tiempo`);
    return { txt: parts.join(' y '), n: ft + pt };
  }
  const peopleTxt = (d) => peopleOf(d).txt;
  // Personas: hoy y con el plan, por área
  function peoplePanel() {
    const P = S.plan;
    const p = UI.panel('Personas: hoy y con el plan', { sub: 'Horas de atención por semana y su equivalente en personas de jornada completa. "Hoy" es el personal del paso 3 (detectado en tus registros o corregido por ti).' });
    let anyPl = false; const notes = [];
    const rows = S.proc.areas.map((ar, i) => {
      const cfg = staffCfg(i); const ftH = cfg.ftH > 0 ? cfg.ftH : 48, ptH = cfg.ptH > 0 ? cfg.ptH : 24, abs = U.clamp((cfg.abs || 0) / 100, 0, 0.9);
      let nowH = 0, needH = 0, paidH = 0, paidNow = 0;
      P.dows.forEach((w) => { const s = daySums(P.byDow[w], i); nowH += s.now; needH += s.rec; paidH += shiftsOf(w, i).hours; paidNow += shiftsOf(w, i, true).hours; });
      const hasPl = cfg.ft != null || cfg.pt != null; if (hasPl) anyPl = true;
      // hoy y el plan con la misma regla: turnos completos de 8 h y medios de 4 h que cubren cada hora (o la planilla, si se indicó)
      const needF = paidH / ftH / (1 - abs);
      const haveF = hasPl ? (cfg.ft || 0) + (cfg.pt || 0) * ptH / ftH : paidNow / ftH / (1 - abs);
      const d = needF - haveF;
      const po = peopleOf(Math.abs(d));
      const what = Math.abs(d) < 0.25 ? UI.tag('Tu personal alcanza', 'ok') : d > 0 ? UI.tag((po.n === 1 ? 'Falta ' : 'Faltan ') + po.txt, 'bad') : UI.tag((po.n === 1 ? 'Sobra ' : 'Sobran ') + po.txt, 'warn');
      if (Math.abs(d) >= 0.25) notes.push(`${short(ar.name)}: ${d > 0 ? 'faltan' : 'sobran'} ${fmt1(Math.abs(d))} equivalentes de jornada completa de ${U.fmtInt(ftH)} h.`);
      return [h('b', null, short(ar.name)), `${U.fmtInt(nowH)} h`, `${U.fmtInt(needH)} h`, `${needH - nowH >= 0 ? '+' : '−'}${U.fmtInt(Math.abs(needH - nowH))} h`, `${fmt1(haveF)}${hasPl ? '' : '*'}`, fmt1(needF), what];
    });
    p.body.appendChild(UI.table(['Área', { t: 'Horas hoy', num: true }, { t: 'Horas necesarias', num: true }, { t: 'Diferencia', num: true }, { t: 'Personas hoy', num: true }, { t: 'Personas necesarias', num: true }, 'Qué hacer'], rows, { compact: true }));
    p.body.appendChild(h('p', { class: 'hint' }, 'Personas en equivalentes de jornada completa. Las necesarias salen de los turnos del plan (completos de 8 h y medios de 4 h) e incluyen las ausencias indicadas en el paso 3.' + (anyPl ? '' : ' * Sin planilla, "personas hoy" sale de los turnos que cubren tu horario de hoy, con la misma regla. Escribe tu planilla en el paso 3 para comparar con las personas que tienes contratadas.')));
    return p.el;
  }
  function dayPanel() {
    const w = S.view.planDow; const r = S.plan.byDow[w];
    const p = UI.panel(`${U.DIAS_L[w]}: turnos sugeridos`, { sub: 'Turnos que cubren lo necesario en cada hora con el menor número de horas pagadas.' });
    p.el.id = 'plan-day';
    p.body.appendChild(h('div', { class: 'split' }, S.proc.areas.map((ar, i) => {
      const sh = shiftsOf(w, i);
      const sl = r.agg.stages[i].SL.mean;
      return h('div', { class: 'stack' }, h('h3', null, short(ar.name)),
        sh && sh.shifts.length ? h('ul', { class: 'shifts' }, sh.shifts.map((x) => h('li', null, h('b', null, String(x.n)), h('span', null, `${x.n === 1 ? 'persona' : 'personas'} de ${x.type === 'C' ? 'jornada completa (8 h)' : 'medio tiempo (4 h)'} desde las ${U.fmtHour(r.h0 + x.start)}`)))) : h('p', { class: 'hint' }, 'Sin turnos calculados.'),
        h('p', { class: 'hint' }, `${sh ? sh.hours + ' horas pagadas · ' : ''}${pct0(sl)} de los clientes dentro de la meta con este plan.`));
    })));
    return p.el;
  }
  // La fila en movimiento del día elegido: con el personal de hoy y con el plan, lado a lado y con los mismos clientes
  function queuePanel() {
    const w = S.view.planDow; const r = S.plan.byDow[w];
    const p = UI.panel(`La fila en movimiento: ${U.DIAS_L[w].toLowerCase()}, hoy y con el plan`, { sub: 'Los mismos clientes simulados con dos horarios de personal. Puntos de colores sobre la cabeza: verde, espera corta; amarillo, se acerca a la meta; rojo, ya la pasó.' });
    p.el.id = 'plan-fila';
    p.body.appendChild(h('div', { class: 'chips' }, S.plan.dows.map((d) => { const b = h('button', { type: 'button', class: 'chip' + (d === w ? ' on' : ''), 'aria-pressed': String(d === w) }, U.DIAS[d]); b.addEventListener('click', () => { S.view.planDow = d; render(); const el = document.getElementById('plan-fila'); if (el) el.scrollIntoView({ block: 'start' }); }); return b; })));
    const planDay = S.proc.areas.map((ar, i) => { const day = new Array(24).fill(0); r.sched[i].forEach((c, k) => { if (activeHour(r, i, k)) day[r.h0 + k] = c; }); return day; });
    const box = h('div'); p.body.appendChild(box);
    const spec0 = MS.buildSpec(S.proc, S.areas, S.comb, w, Object.assign({}, S.plan.X, { reps: 1 }));
    S.players.push(player(box, { w, X: S.plan.X, t0: worstStart(w, spec0), sides: [{ label: 'Con el personal de hoy', schedDay: schedDayFor(w) }, { label: 'Con el plan', schedDay: planDay }] }));
    return p.el;
  }
  function exportPlan() {
    const P = S.plan; const rows = [];
    P.dows.forEach((w) => { const r = P.byDow[w]; S.proc.areas.forEach((ar, i) => r.sched[i].forEach((c, k) => { const x = r.agg.stages[i].hourly[k] || {};
      rows.push([ar.name, U.DIAS_L[w], U.fmtHour(r.h0 + k), +r.lam[i][k].toFixed(2), +r.today[i][k].toFixed(2), c, isFinite(x.sl) ? +x.sl.toFixed(4) : '', isFinite(x.wq) ? +x.wq.toFixed(3) : '', isFinite(x.util) ? +x.util.toFixed(4) : '']); })); });
    const tag = (S.company || 'plan').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\W+/g, '_').toLowerCase();
    U.saveFile(`plan_personal_${tag}_${S.planCfg.dayType}.csv`, U.toCSV(['area', 'dia', 'hora', 'clientes', 'personal_hoy', 'recomendado', 'dentro_de_meta', 'espera_media_min', 'ocupacion'], rows), 'text/csv;charset=utf-8');
  }
  // ¿Y si...? Compara el personal de hoy con un cambio, para el día elegido
  function whatIfBlock() {
    const p = S.proc; const w = S.view.planDow;
    S.cmpCfg = S.cmpCfg || { extra: p.areas.map(() => 0), svc: p.areas.map(() => 0), queue: p.areas.map((a) => a.queue || 'single') };
    const cfg = S.cmpCfg; const box = h('div', { class: 'stack' });
    box.appendChild(h('p', { class: 'hint' }, `Compara el ${U.DIAS_L[w].toLowerCase()} con el personal de hoy contra el mismo día con un cambio. Ambos con los mismos clientes simulados (números aleatorios comunes).`));
    box.appendChild(h('div', { class: 'cmp-grid' }, p.areas.map((ar, i) => h('div', { class: 'cmp-area' }, h('b', null, short(ar.name)),
      UI.select({ label: 'Personal en todas las horas', value: String(cfg.extra[i]), options: [['-2', 'Dos personas menos'], ['-1', 'Una persona menos'], ['0', 'Igual'], ['1', 'Una persona más'], ['2', 'Dos personas más']], onChange: (v) => { cfg.extra[i] = +v; } }).el,
      UI.select({ label: 'Tiempo de atención', value: String(cfg.svc[i]), options: [['-20', '20 % más rápido'], ['-10', '10 % más rápido'], ['0', 'Igual'], ['10', '10 % más lento'], ['20', '20 % más lento']], onChange: (v) => { cfg.svc[i] = +v; } }).el,
      UI.select({ label: 'Fila', value: cfg.queue[i], options: [['single', 'Fila única'], ['multi', 'Una fila por punto']], onChange: (v) => { cfg.queue[i] = v; } }).el))));
    const out = h('div'); const prog = UI.progress();
    const run = UI.btn('Comparar', async () => {
      run.disabled = true; U.clear(out);
      try {
        const X = Object.assign({}, scenario(), { reps: 20, slT: S.goal.tMin, schedDay: schedDayFor(w) });
        const a0 = await QS.Sim.runReps(MS.buildSpec(p, S.areas, S.comb, w, X), { reps: 20, onProgress: (f) => prog.set(f / 2, 'Personal de hoy…') });
        const a1 = await QS.Sim.runReps(MS.buildSpec(p, S.areas, S.comb, w, Object.assign({}, X, { extra: cfg.extra, svc: cfg.svc.map((x) => 1 + x / 100), queue: cfg.queue })), { reps: 20, onProgress: (f) => prog.set(0.5 + f / 2, 'Con el cambio…') });
        prog.hide(); S.cmp = { a0, a1, w }; drawCmp(out);
      } catch (e) { console.error(e); U.toast('No se pudo comparar: ' + e.message, 'bad'); }
      run.disabled = false;
    }, 'btn-sm');
    box.appendChild(h('div', { class: 'cluster' }, run, prog.el)); box.appendChild(out);
    if (S.cmp && S.cmp.w === w) drawCmp(out);
    return h('details', { class: 'more' }, h('summary', null, '¿Y si…? Comparar un cambio con el personal de hoy'), box);
  }
  function drawCmp(out) {
    const { a0, a1 } = S.cmp; U.clear(out);
    const ci = (s, f) => `${f(s.mean)} ± ${f(s.hw)}`;
    out.appendChild(UI.table(['Área', { t: 'Espera hoy', num: true }, { t: 'Con el cambio', num: true }, { t: 'En la meta hoy', num: true }, { t: 'Con el cambio', num: true }, { t: 'Ocupación hoy', num: true }, { t: 'Con el cambio', num: true }],
      a0.stages.map((s, k) => [short(s.name), ci(s.Wq, U.fmtTime), ci(a1.stages[k].Wq, U.fmtTime), U.fmtPct(s.SL.mean, 0), U.fmtPct(a1.stages[k].SL.mean, 0), U.fmtPct(s.util.mean, 0), U.fmtPct(a1.stages[k].util.mean, 0)]), { compact: true }));
    out.appendChild(h('p', { class: 'hint' }, `Tiempo total en el proceso: ${U.fmtTime(a0.m.W.mean)} hoy y ${U.fmtTime(a1.m.W.mean)} con el cambio. Medias ± semiancho del intervalo de confianza del 95 % con 20 réplicas.`));
  }

  /* ======================= la fila en movimiento ======================= */
  // Una o dos simulaciones del mismo día con los mismos clientes (misma semilla) y controles comunes: así se ve cómo se forma la fila
  // con el personal de hoy y cómo cambia con el plan. o: {w, sides: [{label, schedDay}], X, t0 (minutos desde la apertura)}
  function player(box, o) {
    const w = o.w, X = o.X || {}, T = S.goal.tMin, dual = o.sides.length > 1;
    const st = { view: U.store.get('sim:view', '3d'), speed: 8, playing: !reduced(), raf: 0, last: 0, hud: 0, alive: true, visible: true, span: 0, t0: Math.max(0, o.t0 || 0) };
    const sides = o.sides.map((sd) => ({ label: sd.label, schedDay: sd.schedDay, canvas: h('canvas', { role: 'img', 'aria-label': `${sd.label}: clientes del ${U.DIAS_L[w].toLowerCase()} llegando, esperando y siendo atendidos` }), kp: h('div', { class: 'player-kpis' }), sim: null, anim: null, spec: null, served: 0 }));
    const lcd = h('span', { class: 'lcd' }, '--:--');
    const setPlay = (v) => { st.playing = v; U.clear(playBtn); playBtn.appendChild(UI.icon(v ? 'pause' : 'play')); playBtn.setAttribute('aria-label', v ? 'Pausar' : 'Reproducir'); };
    const playBtn = UI.btn(UI.icon(st.playing ? 'pause' : 'play'), () => setPlay(!st.playing), 'btn-sm btn-icon', { 'aria-label': st.playing ? 'Pausar' : 'Reproducir' });
    const range = h('input', { type: 'range', min: '0', max: '60', step: '5', value: '0', 'aria-label': 'Hora del día' });
    range.addEventListener('input', () => rebuild(+range.value));
    const speed = h('select', { class: 'inline-sel', 'aria-label': 'Velocidad', title: 'Minutos de la tienda por cada segundo' }, [['2', '1 s = 2 min'], ['5', '1 s = 5 min'], ['8', '1 s = 8 min'], ['15', '1 s = 15 min'], ['30', '1 s = 30 min']].map(([v, t]) => h('option', { value: v }, t)));
    speed.value = '8'; speed.addEventListener('change', () => { st.speed = +speed.value; });
    const el = h('div', { class: 'player' + (dual ? ' dual' : '') },
      h('div', { class: 'player-stage' }, sides.map((sd) => h('div', { class: 'player-side' }, h('div', { class: 'player-title' }, sd.label), h('div', { class: 'canvas-box' }, sd.canvas), sd.kp))),
      h('div', { class: 'player-bar' }, playBtn, lcd, range,
        UI.seg({ label: 'Vista', value: st.view, options: [['3d', '3D'], ['2d', 'Plano']], onChange: (v) => { st.view = v; U.store.set('sim:view', v); sides.forEach(makeAnim); } }).el, speed));
    box.appendChild(el);
    function makeAnim(sd) { if (sd.anim) sd.anim.destroy(); sd.anim = new (st.view === '3d' && QS.Anim3D ? QS.Anim3D : QS.Anim)(sd.canvas, {}); if (sd.sim) sd.anim.attach(sd.sim); sd.anim.draw(); }
    function rebuild(t0) {
      sides.forEach((sd) => {
        sd.spec = MS.buildSpec(S.proc, S.areas, S.comb, w, Object.assign({}, X, { schedDay: sd.schedDay, reps: 1, slT: T, seed: 7 }));
        sd.served = 0; if (sd.anim) sd.anim.sim = null;
        sd.sim = new QS.Sim(sd.spec, 'fila-' + w, { keepWaits: false, onEvent: (type, c, v, s) => { if (type === 'depart') sd.served++; if (sd.anim && sd.anim.sim) sd.anim.event(type, c, v, s); } });
        if (t0 > 0) sd.sim.runUntil(t0);
        if (sd.anim) { sd.anim.attach(sd.sim); sd.anim.draw(); }
      });
      st.span = sides[0].spec.run.hours * 60; range.max = String(st.span);
      hud(true);
    }
    function hud(force) {
      const now = performance.now(); if (!force && now - st.hud < 200) return; st.hud = now;
      const s0 = sides[0]; lcd.textContent = U.fmtClock(s0.spec.open + s0.sim.t);
      if (document.activeElement !== range) range.value = String(Math.min(st.span, s0.sim.t));
      sides.forEach((sd) => {
        const sim = sd.sim; U.clear(sd.kp);
        sim.st.forEach((s, i) => { let q = 0, late = 0; s.Q.forEach((Q) => { q += Q.length; Q.forEach((c) => { if (sim.t - c.qT > T) late++; }); });
          sd.kp.appendChild(h('span', null, `${short(S.proc.areas[i].name)}: `, h('b', null, String(s.srv.filter((v) => v.on !== false).length)), ' atendiendo · ', h('b', null, String(q)), ' en fila', late ? [' · ', h('b', { class: 'late' }, String(late)), ` esperan más de ${U.fmtTime(T)}`] : '')); });
        sd.kp.appendChild(h('span', null, h('b', null, U.fmtInt(sd.served)), ' atendidos'));
      });
      if (sides.every((sd) => sd.sim.done) && st.playing) rebuild(st.t0); // al terminar el día vuelve a la hora crítica
    }
    sides.forEach(makeAnim); rebuild(st.t0);
    if (typeof IntersectionObserver !== 'undefined') { const io = new IntersectionObserver((es) => { st.visible = es.some((e) => e.isIntersecting); }); io.observe(el); st.io = io; }
    const frame = (ts) => {
      if (!st.alive || !document.body.contains(box)) { stop(); return; }
      st.raf = requestAnimationFrame(frame);
      const dt = Math.min(0.1, Math.max(0, (ts - st.last) / 1000)); st.last = ts;
      if (document.hidden || !st.visible) return;
      sides.forEach((sd) => { if (st.playing && !sd.sim.done) sd.sim.runUntil(sd.sim.t + dt * st.speed); sd.anim.update(dt, st.speed); sd.anim.draw(); });
      hud();
    };
    st.raf = requestAnimationFrame((ts) => { st.last = ts; frame(ts); });
    function stop() { st.alive = false; cancelAnimationFrame(st.raf); if (st.io) st.io.disconnect(); sides.forEach((sd) => { if (sd.anim) sd.anim.destroy(); }); }
    return { stop, theme: () => sides.forEach((sd) => { if (sd.anim) { sd.anim.readTheme(); sd.anim.draw(); } }) };
  }
  // Minutos desde la apertura para empezar a ver la fila: un poco antes de la hora más difícil del día (menor % dentro de la meta)
  function worstStart(w, spec) {
    if (!S.diag || !S.diag.byDow[w]) return 0;
    const r = S.diag.byDow[w], o = r.spec.open / 60; let best = null;
    S.proc.areas.forEach((ar, i) => r.agg.stages[i].hourly.forEach((x, k) => { if (x && x.n >= MIN_N && (!best || x.sl < best.sl)) best = { sl: x.sl, hh: o + k }; }));
    if (!best) return 0;
    const open = spec ? spec.open / 60 : o;
    return Math.max(0, (best.hh - open) * 60 - 20);
  }
  function stopPlayers() { (S.players || []).forEach((p) => p.stop()); S.players = []; }

  /* ======================= navegación y API ======================= */
  function render() {
    if (!E.view) return;
    C.prune(); E.maps = [];
    stopPlayers();
    clearInterval(ticker);
    U.clear(E.view);
    const fn = { proceso: rProceso, archivos: rArchivos, mediciones: rMediciones, diagnostico: rDiagnostico, plan: rPlan }[S.step];
    try { fn(); } catch (e) { console.error(e); add(UI.callout('bad', 'No se pudo mostrar este paso: ' + e.message)); }
    const cur = E.view.querySelector('.topstep.is-current');
    if (cur && cur.parentElement && cur.parentElement.offsetParent) cur.parentElement.scrollLeft = cur.offsetLeft - 16;
    notify();
  }
  F.render = render;
  F.init = function (view) {
    E.view = view; render();
    const p = S.proc;
    if (!S.areas && p.template === 'retail_credito' && p.areas.length === 2 && !S.slots.some(Boolean)) loadExample({ quiet: true }).catch((e) => console.error(e));
  };
  F.current = () => S.step;
  F.go = (step) => {
    if (idx(step) < 0) step = 'proceso';
    const s = F.steps().find((x) => x.id === step);
    if (s && !s.enabled) { U.toast(step === 'archivos' ? 'Primero completa el paso 1.' : 'Primero sube tus datos en el paso 2.', 'info'); step = step === 'archivos' ? 'proceso' : 'archivos'; }
    S.step = step; U.store.set('flow:step', step); render();
    root.scrollTo({ top: 0 });
    if (QS.App && QS.App.stepChanged) QS.App.stepChanged(step);
  };
  F.steps = () => {
    const valid = !MS.validate(S.proc).length, has = !!S.comb;
    const pend = has ? pending().length : 0;
    const days = has ? Math.max(...S.areas.map((a) => a.k1 - a.k0 + 1)) : 0;
    let hrs = 0; if (S.plan) S.plan.dows.forEach((w) => S.plan.byDow[w].sched.forEach((row) => { hrs += row.reduce((a, b) => a + b, 0); }));
    const worst = S.diag ? Math.max(...S.diag.val.map((v) => v.wape)) : NaN;
    return [
      { id: 'proceso', name: 'Tu operación', enabled: true, done: valid, summary: `${S.proc.areas.length} ${S.proc.areas.length === 1 ? 'área' : 'áreas'} · meta ${S.goal.pct} % en ${U.fmt(S.goal.tMin, 1)} min` },
      { id: 'archivos', name: 'Tus datos', enabled: valid, done: has, summary: has ? (S.example ? 'Datos de ejemplo' : `${spanTxt(days)} de datos`) : S.proc.areas.every((a, i) => S.slots[i] && S.slots[i].res) ? 'Datos listos: presiona Continuar' : S.mode !== 'areas' ? 'Falta subir tu archivo' : 'Falta subir los reportes' },
      { id: 'mediciones', name: 'Personal y mediciones', enabled: has, done: has && !pend, warn: has && pend > 0, summary: !has ? 'Después de tus datos' : pend ? `${pend === 1 ? 'Falta 1 medición' : 'Faltan ' + pend + ' mediciones'}` : 'Completo' },
      { id: 'diagnostico', name: 'Diagnóstico', enabled: has, done: !!S.diag, summary: !has ? '' : S.diag ? `Error del modelo ${U.fmtPct(worst, 1)}` : 'Se calcula al abrirlo' },
      { id: 'plan', name: 'Plan de personal', enabled: has, done: !!S.plan, summary: !has ? '' : S.plan ? `${U.fmtInt(hrs)} horas-persona por semana` : 'Se calcula al abrirlo' }
    ];
  };
  F.company = () => S.company;
  F.theme = () => { refreshMaps(); (S.players || []).forEach((p) => p.theme()); };
  F.leave = () => { stopPlayers(); clearInterval(ticker); };
  F.useFile = async (i, src) => {
    if (QS.App) QS.App.go('flujo', { step: 'archivos' });
    if (S.example) clearExample(true);
    if (S.mode !== 'areas') await loadSingle(src, null); else { await prepSlot(i, src); if (autoReady(i)) await processSlot(i, true); }
    render();
  };
  F.loadExample = loadExample;
  F.state = S;
})(typeof window !== 'undefined' ? window : globalThis);
