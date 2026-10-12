/* Estándar de datos para cualquier empresa o giro, con verificador de archivos (en Herramientas). */
(function (root) {
  'use strict';
  const QS = root.QS; const U = QS.U, h = U.h, UI = QS.UI, D = QS.Data, MS = QS.Measure;
  const SD = QS.StandardUI = {};
  const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
  const CAPS = { 'sí': 'good', medido: 'good', medida: 'good', inferido: 'good', 'máximo probable': 'warn', aproximada: 'info', no: 'bad' };
  let sector = 'retail';

  // Qué permite medir un archivo según sus columnas
  SD.levelBadge = function (lv, i) {
    if (lv.n < 0) return UI.callout('bad', 'Falta la columna de fecha y hora: sin ella no se puede medir.');
    const name = lv.n >= 3 ? 'Nivel 3 · con turnero' : lv.n >= 2 ? 'Nivel 2 · con ' + (lv.servicio === 'medido' ? 'hora de inicio' : 'documento relacionado') : lv.n >= 1 ? 'Nivel 1 · registro de transacciones' : 'Incompleto';
    const box = h('div', { class: 'level-box' }, h('span', { class: 'lv-badge lv' + Math.floor(Math.max(0, lv.n)) }, name),
      h('div', { class: 'row' }, UI.pill('Clientes por hora: sí', 'good'), UI.pill('Tiempo de atención: ' + lv.servicio, CAPS[lv.servicio] || 'info'), UI.pill('Espera: ' + lv.espera, CAPS[lv.espera] || 'info'), UI.pill('Abandonos: ' + lv.abandono, CAPS[lv.abandono] || 'info')));
    if (lv.missing.length) box.appendChild(h('p', { class: 'hint' }, 'Falta: ' + lv.missing.join(', ') + '.'));
    else if (lv.servicio === 'máximo probable') box.appendChild(h('p', { class: 'hint' }, i > 0 ? 'Si el archivo trae el documento que paga cada transacción, indícalo en "Documento relacionado": así se mide el tiempo entre áreas.' : 'Con solo la hora de emisión, la atención se cronometra en tienda (paso 3). Si tu sistema guarda la hora en que se abre el documento, indícala como "Hora de inicio" y se mide exacta.'));
    return box;
  };
  const rule = (n, t, d) => h('div', { class: 'rule' }, h('span', { class: 'rule-n' }, n), h('div', null, h('b', null, t), h('p', { class: 'hint' }, d)));

  SD.render = function (box) {
    U.clear(box);
    const c1 = UI.panel('Qué pedir a tu sistema', { sub: 'El mismo estándar sirve para cualquier ERP, punto de venta, turnero o conmutador, y para cualquier giro.' });
    c1.body.appendChild(h('div', { class: 'rules' },
      rule('1', 'Una fila por transacción', 'Cada factura, recibo, ticket, turno o llamada es una fila. Sin totales por día: el detalle permite medir hora por hora.'),
      rule('2', 'Tres columnas mínimas', 'Fecha y hora, quién atiende (el usuario que creó el documento; si no hay, la caja o el puesto) y tipo de transacción. Con eso se miden demanda, mezcla y personal presente (nivel 1).'),
      rule('3', 'Todo el periodo', 'Mínimo 3 meses para días y horas; de 1 a 5 años para temporadas.'),
      rule('4', 'Un archivo por área', 'O uno solo con todo y la columna Área. CSV o Excel, con los nombres de columna de tu sistema.')));
    c1.body.appendChild(h('div', { class: 'row' },
      UI.btn([UI.icon('download'), 'Plantilla del estándar (CSV)'], () => { const t = MS.standardTemplate(); U.saveFile(t.name, U.toCSV(t.headers, t.rows, { sep: ',' }), 'text/csv'); }, 'btn-sm'),
      UI.btn([UI.icon('download'), 'Diccionario de datos (CSV)'], () => { const t = MS.dictionary(); U.saveFile(t.name, U.toCSV(t.headers, t.rows, { sep: ',' }), 'text/csv'); }, 'btn-sm'),
      UI.btn([UI.icon('download'), 'Archivos de ejemplo (facturas y REC)'], async () => { const f = MS.sampleFiles(); await U.saveFile(f.facturas.name, U.toCSV(f.facturas.headers, f.facturas.rows, { sep: ',' }), 'text/csv'); await U.saveFile(f.recibos.name, U.toCSV(f.recibos.headers, f.recibos.rows, { sep: ',' }), 'text/csv'); }, 'btn-sm')));
    box.appendChild(c1.el);
    box.appendChild(checker());
    const c2 = UI.panel('Niveles de datos', { sub: 'Cada nivel agrega columnas y permite medir más. La mayoría de los ERP ya están en el nivel 1 o 2.' });
    c2.body.appendChild(h('div', { class: 'lv-grid' }, MS.LEVELS.map((lv) => h('div', { class: 'lv-card lv' + lv.n },
      h('div', { class: 'lv-top' }, h('span', { class: 'lv-n' }, String(lv.n)), h('b', null, lv.name)),
      h('p', { class: 'hint' }, lv.need),
      h('ul', { class: 'lv-caps' }, MS.CAN.map(([k, name]) => { const v = lv.can[k]; const st = /^no$/i.test(v) ? 'no' : /parcial|máximo|aproximada|cronometr/i.test(v) ? 'mid' : 'ok'; return h('li', { class: 'cap-' + st }, h('span', { class: 'cap-i', 'aria-hidden': 'true' }, st === 'ok' ? '✓' : st === 'mid' ? '≈' : '–'), h('span', null, name + ': '), h('b', null, v)); }))))));
    box.appendChild(c2.el);
    const c3 = UI.panel('Campos del estándar', { sub: 'Los nombres de columna pueden ser los de tu sistema: al subir el archivo se reconocen y puedes corregirlos.' });
    const LV = { obligatorio: 'bad', recomendado: 'warn', opcional: 'info' };
    c3.body.appendChild(UI.table(['Campo', 'Qué es', 'Necesidad', 'Ejemplo'], MS.FIELDS.map((f) => [h('div', null, h('b', null, f.name), h('div', { class: 'hint mono' }, f.id)), f.desc, UI.pill(cap(f.level), LV[f.level]), h('span', { class: 'mono' }, f.ex)]), { compact: true }));
    box.appendChild(c3.el);
    const c4 = UI.panel('Cómo se llama cada campo en tu giro');
    const body = h('div', { class: 'stack' });
    const chips = h('div', { class: 'chips' }, MS.STD_SECTORS.map((g) => { const b = h('button', { type: 'button', class: 'chip' + (g.id === sector ? ' on' : ''), 'aria-pressed': String(g.id === sector) }, g.name); b.addEventListener('click', () => { sector = g.id; chips.querySelectorAll('.chip').forEach((x) => { x.classList.toggle('on', x === b); x.setAttribute('aria-pressed', String(x === b)); }); drawSec(); }); return b; }));
    const drawSec = () => {
      U.clear(body); const g = MS.STD_SECTORS.find((x) => x.id === sector);
      body.appendChild(h('p', { class: 'hint' }, `Sistema habitual: ${g.system}. Nivel típico: ${g.level}.`));
      body.appendChild(UI.table(['Campo del estándar', 'En tu sistema suele ser'], MS.FIELDS.filter((f) => g.map[f.id]).map((f) => [h('b', null, f.name), g.map[f.id]]), { compact: true }));
      if (g.tip) body.appendChild(UI.callout('info', g.tip));
    };
    c4.body.appendChild(chips); c4.body.appendChild(body); drawSec();
    box.appendChild(c4.el);
    const c5 = UI.panel('Reglas del archivo');
    c5.body.appendChild(UI.table(['Tema', 'Regla'], [
      ['Formato', 'CSV (separado por comas, punto y coma o tabulador) o Excel (.xlsx). La primera fila con los nombres de las columnas.'],
      ['Fechas y horas', 'AAAA-MM-DD HH:MM:SS o DD/MM/AAAA HH:MM; también fecha y hora en columnas separadas, o el número de fecha de Excel.'],
      ['Detalle', 'Una fila por documento o atención, sin totales ni subtotales. Las anulaciones pueden venir marcadas en Estado: se descartan.'],
      ['Visitas con varios documentos', 'Si un cliente paga dos cuotas juntas salen dos recibos seguidos: se juntan en una visita con el código de cliente.'],
      ['Áreas', 'Un archivo por área (cajas, facturación, servicio…), o uno con todo y la columna Área, o tipos de transacción distintos en cada área.'],
      ['Periodo', 'Todo lo disponible, sin huecos. Mínimo 3 meses; ideal 1 a 5 años para temporadas.'],
      ['Privacidad', 'No se necesitan nombres ni montos: basta un código de cliente. Los archivos se procesan en tu navegador.']
    ], { compact: true }));
    box.appendChild(c5.el);
  };

  function checker() {
    const card = UI.panel('Verifica un archivo', { sub: 'Sube cualquier reporte de tu sistema: se reconocen sus columnas y se indica qué nivel alcanza y qué le falta.' });
    const out = h('div', { class: 'stack' });
    const file = h('input', { type: 'file', accept: '.csv,.txt,.tsv,.xlsx,.xlsm,.xls', hidden: true, id: 'std-file' });
    const check = async (fl) => {
      if (!fl) return; U.clear(out);
      try {
        const src = { type: 'file', file: fl, name: fl.name }; const pv = await D.preview(src); const map = MS.guessFields(pv.headers);
        const lv = MS.levelFor(map, { after: !!map.relacionado });
        out.appendChild(h('p', null, h('b', null, fl.name), ` · ${pv.headers.length} columnas`));
        out.appendChild(SD.levelBadge(lv, map.relacionado != null ? 1 : 0));
        out.appendChild(UI.table(['Campo del estándar', 'Necesidad', 'Columna encontrada', 'Ejemplo en tu archivo'], MS.FIELDS.map((f) => {
          let k = map[f.id]; if (f.id === 'fecha_hora' && k == null) k = map.fecha;
          const ex = k != null && pv.rows[0] ? String(pv.rows[0][k] == null ? '' : pv.rows[0][k]) : '';
          return [f.name, UI.pill(cap(f.level), f.level === 'obligatorio' ? 'bad' : f.level === 'recomendado' ? 'warn' : 'info'), k != null ? UI.pill(String(pv.headers[k]), 'good') : (f.level === 'obligatorio' ? UI.pill('No encontrada', 'bad') : '—'), ex];
        }), { compact: true }));
        if (QS.Flow && QS.Flow.useFile) out.appendChild(h('div', { class: 'row' }, UI.btn('Usar este archivo en el paso 2', () => QS.Flow.useFile(0, src), 'btn-sm')));
      } catch (e) { out.appendChild(UI.callout('bad', 'No se pudo leer: ' + e.message)); }
    };
    file.addEventListener('change', () => { const fl = file.files[0]; file.value = ''; check(fl); });
    const drop = h('div', { class: 'drop', tabindex: '0', role: 'button', 'aria-label': 'Elegir archivo para verificar' }, UI.icon('upload', 'lg'), h('b', null, 'Arrastra aquí un reporte o haz clic para elegirlo'), h('span', { class: 'hint' }, 'Solo se leen las primeras filas para reconocer las columnas.'));
    drop.addEventListener('click', () => file.click());
    drop.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); file.click(); } });
    drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('over'); });
    drop.addEventListener('dragleave', () => drop.classList.remove('over'));
    drop.addEventListener('drop', (e) => { e.preventDefault(); drop.classList.remove('over'); check(e.dataTransfer.files[0]); });
    card.body.appendChild(drop); card.body.appendChild(file); card.body.appendChild(out);
    return card.el;
  }
})(typeof window !== 'undefined' ? window : globalThis);
