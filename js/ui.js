/* Componentes de interfaz reutilizables (campos, secciones, tarjetas, tablas, editor de distribuciones). */
(function (root) {
  'use strict';
  const QS = root.QS = root.QS || {};
  const U = QS.U, h = U.h;
  const UI = QS.UI = {};

  UI.help = (text) => {
    const b = h('button', { type: 'button', class: 'help', 'aria-label': 'Ayuda', title: text }, '?');
    b.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); UI.popover(b, text); });
    return b;
  };
  UI.popover = (anchor, text) => {
    document.querySelectorAll('.popover').forEach((p) => p.remove());
    const p = h('div', { class: 'popover', role: 'tooltip' }, text);
    document.body.appendChild(p);
    const r = anchor.getBoundingClientRect(); const w = Math.min(320, root.innerWidth - 24);
    p.style.maxWidth = w + 'px';
    const left = U.clamp(r.left + r.width / 2 - w / 2, 12, root.innerWidth - w - 12);
    p.style.left = left + root.scrollX + 'px'; p.style.top = r.bottom + root.scrollY + 8 + 'px';
    const close = (e) => { if (!p.contains(e.target)) { p.remove(); document.removeEventListener('click', close, true); } };
    setTimeout(() => document.addEventListener('click', close, true), 0);
  };

  // Campo numérico
  UI.num = (o) => {
    const id = o.id || U.uid('n');
    const inp = h('input', { id, type: 'number', inputmode: 'decimal', step: o.step != null ? String(o.step) : 'any', min: o.min != null ? String(o.min) : null, max: o.max != null ? String(o.max) : null, value: o.value != null ? String(o.value) : '' });
    if (o.placeholder) inp.placeholder = o.placeholder;
    const el = h('label', { class: 'field' + (o.wide ? ' wide' : '') + (o.cls ? ' ' + o.cls : ''), for: id },
      h('span', { class: 'lbl' }, o.label, o.help ? UI.help(o.help) : null),
      h('span', { class: 'ctl' }, inp, o.unit ? h('span', { class: 'unit' }, o.unit) : null));
    const get = () => { const v = parseFloat(inp.value); return isFinite(v) ? v : (o.fallback != null ? o.fallback : NaN); };
    if (o.onInput) inp.addEventListener('input', () => o.onInput(get()));
    if (o.onChange) inp.addEventListener('change', () => o.onChange(get()));
    return { el, input: inp, get, set: (v) => { inp.value = v == null || !isFinite(v) ? '' : String(+(+v).toFixed(6)); } };
  };
  UI.text = (o) => {
    const id = o.id || U.uid('t');
    const inp = h('input', { id, type: 'text', value: o.value || '' });
    if (o.placeholder) inp.placeholder = o.placeholder;
    const el = h('label', { class: 'field' + (o.wide ? ' wide' : ''), for: id }, h('span', { class: 'lbl' }, o.label, o.help ? UI.help(o.help) : null), h('span', { class: 'ctl' }, inp));
    if (o.onInput) inp.addEventListener('input', () => o.onInput(inp.value));
    return { el, input: inp, get: () => inp.value, set: (v) => { inp.value = v; } };
  };
  UI.select = (o) => {
    const id = o.id || U.uid('s');
    const sel = h('select', { id });
    const fill = (opts) => {
      U.clear(sel);
      for (const op of opts) {
        if (op.group) { const g = h('optgroup', { label: op.group }); op.items.forEach((it) => g.appendChild(h('option', { value: it[0] }, it[1]))); sel.appendChild(g); }
        else sel.appendChild(h('option', { value: op[0] }, op[1]));
      }
    };
    fill(o.options); if (o.value != null) sel.value = String(o.value);
    const el = h('label', { class: 'field' + (o.wide ? ' wide' : ''), for: id }, h('span', { class: 'lbl' }, o.label, o.help ? UI.help(o.help) : null), h('span', { class: 'ctl' }, sel));
    if (o.onChange) sel.addEventListener('change', () => o.onChange(sel.value));
    return { el, input: sel, get: () => sel.value, set: (v) => { sel.value = String(v); }, fill };
  };
  UI.check = (o) => {
    const id = o.id || U.uid('c');
    const inp = h('input', { id, type: 'checkbox', checked: !!o.checked });
    const el = h('label', { class: 'check' + (o.wide ? ' wide' : ''), for: id }, inp, h('span', null, o.label), o.help ? UI.help(o.help) : null);
    if (o.onChange) inp.addEventListener('change', () => o.onChange(inp.checked));
    return { el, input: inp, get: () => inp.checked, set: (v) => { inp.checked = !!v; } };
  };
  UI.seg = (o) => {
    const wrap = h('div', { class: 'seg', role: 'radiogroup', 'aria-label': o.label || '' });
    let val = o.value;
    const btns = o.options.map(([v, t]) => {
      const b = h('button', { type: 'button', role: 'radio', 'aria-checked': String(v === val), class: v === val ? 'on' : '' }, t);
      b.addEventListener('click', () => { set(v); if (o.onChange) o.onChange(v); });
      wrap.appendChild(b); return [v, b];
    });
    const set = (v) => { val = v; btns.forEach(([x, b]) => { b.classList.toggle('on', x === v); b.setAttribute('aria-checked', String(x === v)); }); };
    return { el: wrap, get: () => val, set };
  };
  UI.btn = (text, onClick, cls = '', attrs = {}) => {
    const b = h('button', Object.assign({ type: 'button', class: 'btn ' + cls }, attrs), text);
    if (onClick) b.addEventListener('click', onClick);
    return b;
  };
  UI.row = (...kids) => h('div', { class: 'row' }, ...kids);
  UI.grid = (cols, ...kids) => h('div', { class: 'fgrid c' + cols }, ...kids);

  // Sección plegable
  UI.section = (title, o = {}) => {
    const body = h('div', { class: 'sec-body' });
    const badge = h('span', { class: 'sec-badge' }, o.badge || '');
    const d = h('details', { class: 'sec', open: o.open !== false }, h('summary', null, h('span', { class: 'sec-title' }, title), badge), body);
    return { el: d, body, setBadge: (t) => { badge.textContent = t || ''; } };
  };
  UI.card = (title, o = {}) => {
    const body = h('div', { class: 'card-body' });
    const head = title || o.actions ? h('div', { class: 'card-head' }, h('div', null, title ? h('h3', null, title) : null, o.sub ? h('p', { class: 'sub' }, o.sub) : null), o.actions ? h('div', { class: 'card-actions' }, o.actions) : null) : null;
    const el = h('section', { class: 'card' + (o.cls ? ' ' + o.cls : '') }, head, body);
    return { el, body, head };
  };
  // Tarjeta con gráfica y vista de tabla alternativa (accesibilidad)
  UI.chartCard = (title, o = {}) => {
    const chartEl = h('div', { class: 'chart', style: { height: (o.height || 300) + 'px' } });
    const tableEl = h('div', { class: 'tbl-wrap', hidden: true });
    let tableFn = null;
    const toggle = UI.btn('Ver tabla', () => {
      const show = tableEl.hidden;
      if (show && tableFn) { U.clear(tableEl); const t = tableFn(); tableEl.appendChild(UI.table(t.headers, t.rows, t.opts || {})); }
      tableEl.hidden = !show; chartEl.hidden = show; toggle.textContent = show ? 'Ver gráfica' : 'Ver tabla';
    }, 'btn-ghost btn-sm');
    const card = UI.card(title, { sub: o.sub, actions: [toggle].concat(o.actions || []), cls: o.cls || (title ? '' : 'bare') });
    card.body.appendChild(chartEl); card.body.appendChild(tableEl);
    if (o.note) card.body.appendChild(h('p', { class: 'note-sm' }, o.note));
    return { el: card.el, chartEl, body: card.body, setTable: (fn) => { tableFn = fn; toggle.hidden = !fn; }, toggle };
  };
  // Mosaico de indicador
  UI.tile = (label, value, sub, o = {}) => {
    const el = h('div', { class: 'tile' + (o.state ? ' st-' + o.state : '') + (o.cls ? ' ' + o.cls : '') },
      h('div', { class: 'tile-lbl' }, label, o.help ? UI.help(o.help) : null),
      h('div', { class: 'tile-val' }, value),
      sub ? h('div', { class: 'tile-sub' }, sub) : null);
    return el;
  };
  UI.pill = (text, state) => h('span', { class: 'pill' + (state ? ' st-' + state : '') }, text);
  UI.note = (content, kind = 'info') => h('div', { class: 'note note-' + kind }, content);

  /* ---------- piezas del recorrido guiado ---------- */
  const NS = 'http://www.w3.org/2000/svg';
  const ICONS = {
    check: ['M5 12.5l4.5 4.5L19 7.5'],
    alert: ['M12 4.2l8.6 15.3H3.4z', 'M12 10v4.2', 'M12 17v.2'],
    info: ['M12 3.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17z', 'M12 11v5.2', 'M12 7.8v.2'],
    x: ['M6.5 6.5l11 11M17.5 6.5l-11 11'],
    upload: ['M12 15.5V5', 'M7.5 9.5L12 5l4.5 4.5', 'M5 19h14'],
    download: ['M12 5v10.5', 'M7.5 11L12 15.5l4.5-4.5', 'M5 19h14'],
    clock: ['M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16z', 'M12 8v4.5l3 2'],
    stopwatch: ['M12 6.5a7 7 0 1 0 0 14 7 7 0 0 0 0-14z', 'M12 13.5V10', 'M10 3h4', 'M17.6 6.6l1.3-1.3'],
    users: ['M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6z', 'M3.5 19c.6-3 2.8-4.8 5.5-4.8s4.9 1.8 5.5 4.8', 'M16 5.4a3 3 0 0 1 0 5.6', 'M17.5 14.4c1.6.6 2.7 2.2 3 4.6'],
    chart: ['M5 19.5V11', 'M10 19.5V5', 'M15 19.5v-6.5', 'M20 19.5V9', 'M3 19.5h18'],
    trend: ['M4 17l5-5 4 3 7-8', 'M15 7h5v5'],
    grid: ['M4 5h16v14H4z', 'M4 10h16M4 15h16M9.3 5v14M14.6 5v14'],
    play: ['M8 5.5v13l10-6.5z'],
    pause: ['M7.5 5h3.2v14H7.5zM13.3 5h3.2v14h-3.2z'],
    chevL: ['M14.5 6l-6 6 6 6'],
    chevR: ['M9.5 6l6 6-6 6'],
    tools: ['M14.6 6.4a4 4 0 0 0-5.2 5.2L4 17l3 3 5.4-5.4a4 4 0 0 0 5.2-5.2l-2.5 2.5-2.6-.4-.4-2.6z'],
    book: ['M5 5.5A1.5 1.5 0 0 1 6.5 4H19v14H6.5A1.5 1.5 0 0 0 5 19.5z', 'M5 19.5A1.5 1.5 0 0 0 6.5 21H19'],
    file: ['M7 3h7l4 4v14H7z', 'M14 3v4h4'],
    route: ['M6 7a2 2 0 1 0 0-4 2 2 0 0 0 0 4z', 'M18 21a2 2 0 1 0 0-4 2 2 0 0 0 0 4z', 'M6 7v4a3 3 0 0 0 3 3h6a3 3 0 0 1 3 3'],
    calc: ['M6 3h12v18H6z', 'M9 6.5h6', 'M9 11h.01M12 11h.01M15 11h.01M9 14.5h.01M12 14.5h.01M15 14.5h.01M9 18h.01M12 18h.01M15 18h.01'],
    queue: ['M5 9a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM11 9a2 2 0 1 0 0-4 2 2 0 0 0 0 4z', 'M3 15c.4-2 1.6-3.2 3-3.2M9 15c.4-2 1.6-3.2 3-3.2', 'M18 4v16', 'M3 19h18'],
    shield: ['M12 3l7 3v5c0 4.5-3 8.3-7 10-4-1.7-7-5.5-7-10V6z', 'M8.8 12l2.2 2.2 4.2-4.4'],
    calendar: ['M4 6h16v14H4z', 'M4 10h16', 'M8.5 3.5v4M15.5 3.5v4'],
    edit: ['M4 20h4L19 9l-4-4L4 16z', 'M13.5 6.5l4 4'],
    trash: ['M5 7h14', 'M10 7V5h4v2', 'M7 7l1 13h8l1-13'],
    phone: ['M8 3h8v18H8z', 'M11 18h2'],
    help: ['M12 3.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17z', 'M9.6 9.4a2.5 2.5 0 0 1 4.8.8c0 1.7-2.4 2.1-2.4 3.6', 'M12 16.8v.2']
  };
  const FILLED = new Set(['play', 'pause']);
  UI.icon = (name, cls) => {
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('class', 'icon' + (cls ? ' ' + cls : '')); svg.setAttribute('aria-hidden', 'true');
    const filled = FILLED.has(name);
    svg.setAttribute('fill', filled ? 'currentColor' : 'none'); svg.setAttribute('stroke', filled ? 'none' : 'currentColor');
    svg.setAttribute('stroke-width', '1.8'); svg.setAttribute('stroke-linecap', 'round'); svg.setAttribute('stroke-linejoin', 'round');
    (ICONS[name] || ICONS.info).forEach((d) => { const p = document.createElementNS(NS, 'path'); p.setAttribute('d', d); svg.appendChild(p); });
    return svg;
  };
  UI.tag = (text, kind) => h('span', { class: 'tag' + (kind ? ' ' + kind : '') }, text);
  UI.callout = (kind, ...content) => h('div', { class: 'callout ' + kind, role: kind === 'bad' || kind === 'warn' ? 'note' : null },
    UI.icon(kind === 'ok' ? 'check' : kind === 'info' ? 'info' : 'alert'), h('div', null, ...content));
  // Indicadores en una fila: [{l, v, unit, s}]
  UI.stats = (items) => h('div', { class: 'stats' }, items.filter(Boolean).map((x) => h('div', { class: 'stat' },
    h('span', { class: 'stat-l' }, x.l), h('span', { class: 'stat-v' }, x.v, x.unit ? h('small', null, x.unit) : null), x.s ? h('span', { class: 'stat-s' }, x.s) : null)));
  UI.panel = (title, o = {}) => {
    const body = h('div', { class: 'stack' });
    const head = title ? h('div', { class: 'panel-h' }, h('div', null, h('h2', null, title), o.sub ? h('p', { class: 'panel-sub' }, o.sub) : null), o.actions ? h('div', { class: 'cluster' }, o.actions) : null) : null;
    const el = h('section', { class: 'panel' + (o.cls ? ' ' + o.cls : '') }, head, body);
    return { el, body, head };
  };

  // Tabla: headers = [texto | {t, num, help}], rows = arrays de celdas (texto, número o nodo)
  UI.table = (headers, rows, o = {}) => {
    const thead = h('thead', null, h('tr', null, headers.map((hd) => {
      const H = typeof hd === 'string' ? { t: hd } : hd;
      return h('th', { class: H.num ? 'num' : '', scope: 'col' }, H.t, H.help ? UI.help(H.help) : null);
    })));
    const tbody = h('tbody');
    const numCols = headers.map((hd) => typeof hd === 'object' && hd.num);
    rows.forEach((r, ri) => {
      const tr = h('tr', { class: o.rowClass ? o.rowClass(r, ri) || '' : '' });
      r.forEach((cell, ci) => {
        const td = h('td', { class: numCols[ci] ? 'num' : '' });
        if (cell instanceof Node) td.appendChild(cell); else td.textContent = cell == null ? '' : String(cell);
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
    const t = h('table', { class: 'tbl' + (o.compact ? ' compact' : '') + (o.cls ? ' ' + o.cls : '') }, o.caption ? h('caption', null, o.caption) : null, thead, tbody);
    return o.noWrap ? t : h('div', { class: 'tbl-scroll' }, t);
  };

  // Editor de distribución de probabilidad (tiempos en minutos)
  UI.dist = (o) => {
    let spec = Object.assign({}, o.spec || { type: 'exp', mean: 1 });
    const wrap = h('div', { class: 'dist' + (o.cls ? ' ' + o.cls : '') });
    const types = QS.Dist.TYPES.filter((t) => o.allowEmp || t.id !== 'emp' || spec.type === 'emp');
    const sel = UI.select({ label: o.label || 'Distribución', options: types.map((t) => [t.id, t.name]), value: spec.type, help: o.help,
      onChange: (v) => { spec = convert(spec, v); render(); emit(); } });
    const params = h('div', { class: 'fgrid c3 dist-params' });
    const info = h('div', { class: 'dist-info' });
    wrap.appendChild(sel.el); wrap.appendChild(params); wrap.appendChild(info);
    const unit = o.unit || 'min';
    function convert(s, type) {
      const d = QS.Dist.make(s); const m = d.mean > 0 ? d.mean : 1, sd = d.sd > 0 ? d.sd : m * 0.5;
      switch (type) {
        case 'exp': case 'det': return { type, mean: +m.toFixed(4) };
        case 'erlang': return { type, mean: +m.toFixed(4), k: Math.max(1, Math.round(1 / Math.max(d.scv, 0.05))) || 2 };
        case 'gamma': case 'lnorm': case 'weibull': case 'norm': return { type, mean: +m.toFixed(4), sd: +sd.toFixed(4) };
        case 'unif': return { type, a: +Math.max(0, m - sd * 1.732).toFixed(4), b: +(m + sd * 1.732).toFixed(4) };
        case 'tri': return { type, a: +Math.max(0, m - 2 * sd).toFixed(4), mode: +m.toFixed(4), b: +(m + 2.5 * sd).toFixed(4) };
        case 'hyper': return { type, mean: +m.toFixed(4), cv: Math.max(1.2, +d.cv.toFixed(2)) };
        case 'emp': return { type, data: (o.empData && o.empData()) || s.data || [] };
        default: return { type: 'exp', mean: m };
      }
    }
    function emit() { if (o.onChange) o.onChange(Object.assign({}, spec)); }
    function render() {
      U.clear(params);
      const def = QS.Dist.byId[spec.type];
      sel.el.title = def ? def.help : '';
      for (const p of def.params) {
        if (p === 'data') {
          const n = (spec.data || []).length;
          params.appendChild(h('div', { class: 'field wide' }, h('span', { class: 'lbl' }, 'Datos empíricos'),
            h('span', { class: 'emp-info' }, n ? `${U.fmtInt(n)} observaciones cargadas` : 'Sin datos: carga un archivo en Herramientas → "Análisis de series".')));
          continue;
        }
        const f = UI.num({ label: QS.Dist.PARAM_LABEL[p], value: spec[p], min: 0, step: p === 'k' ? 1 : 'any', unit: p === 'k' || p === 'cv' ? '' : unit,
          onInput: (v) => { spec[p] = v; updateInfo(); emit(); } });
        params.appendChild(f.el);
      }
      updateInfo();
    }
    function updateInfo() {
      const d = QS.Dist.make(spec);
      info.textContent = d.ok ? `Media ${U.fmtSmart(d.mean)} ${unit} · CV ${U.fmt(d.cv, 2)} · Kendall: ${d.kendall}` : d.err;
      info.classList.toggle('err', !d.ok);
    }
    render();
    return { el: wrap, get: () => Object.assign({}, spec), set: (s) => { spec = Object.assign({}, s); sel.set(spec.type); render(); } };
  };

  // Editor de lista de valores por hora (perfil horario o personal por hora)
  UI.hourly = (o) => {
    let vals = (o.values || []).slice();
    const wrap = h('div', { class: 'hourly' });
    const grid = h('div', { class: 'hourly-grid' });
    const ta = h('textarea', { rows: 2, class: 'paste', placeholder: 'Pega aquí una columna o fila de Excel con los valores por hora…', 'aria-label': 'Pegar valores' });
    ta.addEventListener('change', () => {
      const nums = ta.value.split(/[\s;\t\n]+/).map((x) => parseFloat(x.replace(',', '.'))).filter((x) => isFinite(x));
      if (nums.length) { vals = nums.slice(0, o.max || 48); render(); emit(); ta.value = ''; U.toast(`Se cargaron ${vals.length} valores`, 'ok'); }
    });
    function emit() { if (o.onChange) o.onChange(vals.slice()); }
    function render() {
      U.clear(grid);
      const n = o.count ? o.count() : vals.length;
      while (vals.length < n) vals.push(vals.length ? vals[vals.length - 1] : 0);
      vals.length = n;
      for (let i = 0; i < n; i++) {
        const inp = h('input', { type: 'number', min: '0', step: o.step || 'any', value: String(vals[i]), 'aria-label': (o.labelFn ? o.labelFn(i) : 'Hora ' + i) });
        inp.addEventListener('input', () => { const v = parseFloat(inp.value); vals[i] = isFinite(v) ? v : 0; emit(); });
        grid.appendChild(h('label', { class: 'hcell' }, h('span', null, o.labelFn ? o.labelFn(i) : String(i)), inp));
      }
    }
    render();
    wrap.appendChild(grid); wrap.appendChild(ta);
    return { el: wrap, get: () => vals.slice(), set: (v) => { vals = v.slice(); render(); }, refresh: render };
  };

  // Barra de progreso
  UI.progress = () => {
    const bar = h('div', { class: 'prog-bar' }); const txt = h('span', { class: 'prog-txt' });
    const el = h('div', { class: 'prog', hidden: true, role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100' }, h('div', { class: 'prog-track' }, bar), txt);
    return { el, set: (f, t) => { el.hidden = false; bar.style.width = U.clamp(f * 100, 0, 100) + '%'; el.setAttribute('aria-valuenow', String(Math.round(f * 100))); txt.textContent = t || ''; }, hide: () => { el.hidden = true; } };
  };

  // Modal simple para mostrar texto (scripts exportados)
  UI.modal = (title, content, actions) => {
    const close = () => { back.remove(); document.removeEventListener('keydown', onKey); };
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    const box = h('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
      h('div', { class: 'modal-head' }, h('h3', null, title), UI.btn('Cerrar', close, 'btn-ghost btn-sm')),
      h('div', { class: 'modal-body' }, content),
      actions ? h('div', { class: 'modal-foot' }, actions) : null);
    const back = h('div', { class: 'modal-back' }, box);
    back.addEventListener('click', (e) => { if (e.target === back) close(); });
    document.addEventListener('keydown', onKey);
    document.body.appendChild(back);
    const f = box.querySelector('button, textarea, input'); if (f) f.focus();
    return { close };
  };
  UI.codeModal = (title, code, filename, intro) => {
    const pre = h('textarea', { class: 'code', readonly: true, rows: 22, spellcheck: 'false' }, code);
    return UI.modal(title, [intro ? h('p', { class: 'note-sm' }, intro) : null, pre], [
      UI.btn('Copiar', () => U.copyText(code), 'btn-ghost'),
      UI.btn('Descargar ' + filename, () => U.saveFile(filename, code, 'text/plain;charset=utf-8'), 'btn-primary')
    ]);
  };

  // Carga diferida de librerías
  UI.loadScript = (src) => new Promise((res, rej) => {
    if (document.querySelector(`script[data-src="${src}"]`)) { res(); return; }
    const s = document.createElement('script'); s.src = src; s.dataset.src = src; s.onload = () => res(); s.onerror = () => rej(new Error('No se pudo cargar ' + src));
    document.head.appendChild(s);
  });
})(typeof window !== 'undefined' ? window : globalThis);
