/* Pestaña "Toma de datos": registro en campo para negocios sin sistema (contar llegadas y cronometrar atenciones).
   Pensada para usarse en celular o tablet. Los registros se guardan en este dispositivo. */
(function (root) {
  'use strict';
  const QS = root.QS; const U = QS.U, h = U.h, UI = QS.UI;
  const CU = QS.CaptureUI = {};
  const KEY = 'cap:data';
  let S = Object.assign({ cfg: { n: 4, name: '', server: 'Caja' }, arrivals: [], times: [], running: {}, mode: 'llegadas' }, U.store.get(KEY, {}));
  let E = {}, timer = 0;
  const save = () => U.store.set(KEY, S);
  const fmtTs = (ms) => { const d = new Date(ms); return `${d.getFullYear()}-${U.pad2(d.getMonth() + 1)}-${U.pad2(d.getDate())} ${U.pad2(d.getHours())}:${U.pad2(d.getMinutes())}:${U.pad2(d.getSeconds())}`; };
  const dayOf = (ms) => fmtTs(ms).slice(0, 10);
  const mmss = (s) => `${Math.floor(s / 60)}:${U.pad2(Math.floor(s % 60))}`;

  CU.init = function (view) {
    E.view = view; U.clear(view);
    view.appendChild(h('div', { class: 'view-head' }, h('div', null, h('div', { class: 'eyebrow' }, 'Sin sistema'), h('h2', null, 'Toma de datos en tienda'),
      h('p', null, 'Úsala en el celular o una tablet durante 2 a 4 semanas: cuenta a cada cliente que llega a la fila y cronometra algunas atenciones. Los registros se guardan en este dispositivo hasta que los descargues o los envíes al asistente.'))));
    E.body = h('div', { class: 'results capture' });
    view.appendChild(E.body);
    render();
  };
  CU.activate = () => { render(); };

  function render() {
    U.clear(E.body);
    const cfg = UI.card('Preparación');
    cfg.body.appendChild(UI.grid(3,
      UI.text({ label: 'Sucursal o punto', value: S.cfg.name, placeholder: 'Ej.: Tienda Centro', onInput: (v) => { S.cfg.name = v; save(); } }).el,
      UI.text({ label: 'Cómo se llaman los puntos de atención', value: S.cfg.server, placeholder: 'Caja, ventanilla, módulo…', onInput: (v) => { S.cfg.server = v || 'Caja'; save(); } }).el,
      UI.num({ label: 'Cuántos hay', value: S.cfg.n, min: 1, max: 40, step: 1, onChange: (v) => { S.cfg.n = Math.round(U.clamp(v || 1, 1, 40)); save(); render(); } }).el));
    E.body.appendChild(cfg.el);
    const seg = UI.seg({ label: 'Qué registrar', value: S.mode, options: [['llegadas', 'Contar llegadas'], ['tiempos', 'Cronometrar atenciones']], onChange: (v) => { S.mode = v; save(); render(); } });
    E.body.appendChild(h('div', { class: 'row' }, seg.el));
    if (S.mode === 'llegadas') renderCount(); else renderTimes();
    renderFooter();
  }

  function renderCount() {
    const today = dayOf(Date.now());
    const todays = S.arrivals.filter((t) => dayOf(t) === today);
    const thisHour = todays.filter((t) => new Date(t).getHours() === new Date().getHours()).length;
    const card = UI.card('Contar llegadas', { sub: 'Toca el botón cada vez que una persona llega a formarse (o al área de atención). Si te equivocas, usa "Deshacer".' });
    const big = h('button', { type: 'button', class: 'big-tap' }, h('span', null, '+1'), h('small', null, 'Llegó un cliente'));
    big.addEventListener('click', () => {
      S.arrivals.push(Date.now()); save();
      if (navigator.vibrate && navigator.userActivation && navigator.userActivation.isActive) { try { navigator.vibrate(20); } catch (e) { /* sin vibración */ } }
      render();
    });
    card.body.appendChild(big);
    card.body.appendChild(h('div', { class: 'row' }, h('span', { class: 'count-now' }, `Hoy: ${todays.length} · Esta hora: ${thisHour}`),
      UI.btn('Deshacer la última', () => { S.arrivals.pop(); save(); render(); }, 'btn-ghost btn-sm', { disabled: !S.arrivals.length })));
    // resumen por hora de hoy
    const byH = new Array(24).fill(0); todays.forEach((t) => { byH[new Date(t).getHours()]++; });
    const rows = byH.map((v, hh) => [U.fmtHour(hh), v]).filter((r) => r[1] > 0);
    if (rows.length) card.body.appendChild(UI.table(['Hora', { t: 'Llegadas', num: true }], rows, { compact: true }));
    E.body.appendChild(card.el);
  }

  function renderTimes() {
    const card = UI.card('Cronometrar atenciones', { sub: `Toca "Iniciar" cuando en ese punto (${S.cfg.server.toLowerCase()}) se llama al siguiente cliente y "Terminar" cuando queda libre. Mide en distintas horas y puntos de atención: entre 50 y 200 mediciones bastan.` });
    const grid = h('div', { class: 'timer-grid' });
    for (let i = 1; i <= S.cfg.n; i++) {
      const run = S.running[i];
      const el = h('div', { class: 'timer' + (run ? ' on' : '') }, h('b', null, `${S.cfg.server} ${i}`), h('span', { class: 'clock-sm', 'data-i': String(i) }, run ? mmss((Date.now() - run) / 1000) : '0:00'));
      const btn = UI.btn(run ? 'Terminar' : 'Iniciar', () => {
        if (S.running[i]) { const start = S.running[i]; const dur = (Date.now() - start) / 1000; delete S.running[i]; if (dur >= 3) S.times.push({ start, srv: i, dur: Math.round(dur) }); }
        else S.running[i] = Date.now();
        save(); render();
      }, run ? 'btn-primary' : '');
      const cancel = run ? UI.btn('Cancelar', () => { delete S.running[i]; save(); render(); }, 'btn-ghost btn-sm') : null;
      el.appendChild(h('div', { class: 'row' }, btn, cancel));
      grid.appendChild(el);
    }
    card.body.appendChild(grid);
    const last = S.times.slice(-8).reverse();
    if (S.times.length) {
      const d = S.times.map((t) => t.dur / 60); const m = U.mean(d);
      card.body.appendChild(h('p', { class: 'count-now' }, `${S.times.length} ${S.times.length === 1 ? 'medición' : 'mediciones'} · promedio ${U.fmtTime(m)}${d.length > 2 ? ` · variabilidad (CV) ${U.fmt(U.sd(d) / m, 2)}` : ''}`));
      card.body.appendChild(UI.table(['Inicio', 'Punto', { t: 'Duración', num: true }], last.map((t) => [fmtTs(t.start).slice(11, 16), `${S.cfg.server} ${t.srv}`, mmss(t.dur)]), { compact: true }));
    }
    E.body.appendChild(card.el);
    clearInterval(timer);
    if (Object.keys(S.running).length) timer = setInterval(() => {
      if (!document.body.contains(grid)) { clearInterval(timer); return; }
      grid.querySelectorAll('.clock-sm').forEach((c) => { const run = S.running[c.dataset.i]; if (run) c.textContent = mmss((Date.now() - run) / 1000); });
    }, 500);
  }

  function exportData() {
    return {
      arrivals: { headers: ['fecha_hora_llegada'], rows: S.arrivals.slice().sort((a, b) => a - b).map((t) => [fmtTs(t)]) },
      times: { headers: ['fecha', 'hora_inicio', 'punto', 'duracion_seg'], rows: S.times.map((t) => [fmtTs(t.start).slice(0, 10), fmtTs(t.start).slice(11, 19), String(t.srv), t.dur]) }
    };
  }
  function renderFooter() {
    const days = new Set(S.arrivals.map(dayOf)).size;
    const card = UI.card('Tus registros', { sub: `${U.fmtInt(S.arrivals.length)} ${S.arrivals.length === 1 ? 'llegada' : 'llegadas'} en ${days} ${days === 1 ? 'día' : 'días'} · ${U.fmtInt(S.times.length)} ${S.times.length === 1 ? 'tiempo' : 'tiempos'} de atención.` });
    const x = exportData();
    const tag = (S.cfg.name || 'toma').replace(/\W+/g, '_');
    const confirmBox = h('div', { class: 'note note-warn', hidden: true }, 'Se borrarán todos los registros de este dispositivo. ',
      UI.btn('Sí, borrar todo', () => { S.arrivals = []; S.times = []; S.running = {}; save(); render(); U.toast('Registros borrados.', 'ok'); }, 'btn-sm'), ' ', UI.btn('No', () => { confirmBox.hidden = true; }, 'btn-ghost btn-sm'));
    card.body.appendChild(h('div', { class: 'row' },
      UI.btn('Usar en el asistente', () => {
        if (!S.arrivals.length && !S.times.length) { U.toast('Aún no hay registros.', 'warn'); return; }
        QS.Wizard.useCapture(x);
      }, 'btn-primary', { disabled: !S.arrivals.length && !S.times.length }),
      UI.btn('Descargar llegadas (CSV)', () => U.saveFile(`llegadas_${tag}.csv`, U.toCSV(x.arrivals.headers, x.arrivals.rows, { sep: ',' }), 'text/csv'), 'btn-sm', { disabled: !S.arrivals.length }),
      UI.btn('Descargar tiempos (CSV)', () => U.saveFile(`tiempos_${tag}.csv`, U.toCSV(x.times.headers, x.times.rows, { sep: ',' }), 'text/csv'), 'btn-sm', { disabled: !S.times.length }),
      UI.btn('Borrar todo', () => { confirmBox.hidden = false; }, 'btn-ghost btn-sm', { disabled: !S.arrivals.length && !S.times.length })));
    card.body.appendChild(confirmBox);
    card.body.appendChild(h('p', { class: 'hint' }, 'Consejo: descarga los archivos al final de cada día como respaldo. Si varias personas registran en distintos celulares, junta los archivos de llegadas en uno solo antes de subirlo.'));
    E.body.appendChild(card.el);
  }
})(typeof window !== 'undefined' ? window : globalThis);
