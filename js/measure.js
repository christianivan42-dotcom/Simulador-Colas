/* Medición del proceso de atención a partir de los registros del ERP.
   - Estándar de datos para cualquier empresa o giro: una fila por transacción, con campos obligatorios, recomendados y opcionales.
   - Modelo del proceso: áreas (etapas), tipos de transacción de cada área y flujos de clientes (qué áreas visita cada tipo de cliente).
   - Medición: demanda por hora y tipo, puntos con movimiento, volumen de cada flujo (mínimos cuadrados no negativos),
     tiempo entre áreas (documento relacionado) y tiempo de atención:
       medido     → el registro trae la hora de inicio de la atención;
       inferido   → área posterior con documento relacionado: se simulan las llegadas reales (traza) y se ajusta la atención
                    hasta reproducir el tiempo entre documentos (inferencia indirecta; Gouriéroux, Monfort y Renault, 1993);
       máximo     → solo hay hora de emisión: el intervalo entre transacciones seguidas de un punto en sus horas más cargadas
                    incluye tiempo libre, así que es una cota superior. Con un dato conocido (promedio o muestra cronometrada)
                    se ajustan los demás tipos con el modelo aditivo intervalo = atención + tiempo libre común. */
(function (root) {
  'use strict';
  const QS = root.QS = root.QS || {};
  const U = QS.U, D = QS.Data;
  const MS = QS.Measure = {};

  /* ======================= estándar de datos ======================= */
  MS.FIELDS = [
    { id: 'fecha_hora', name: 'Fecha y hora de la transacción', level: 'obligatorio', desc: 'Cuándo se registró. En casi todos los sistemas es el momento en que termina la atención (al emitir la factura, el ticket o el recibo). Puede venir en una columna o en dos (fecha y hora).', ex: '2026-09-14 10:32:05' },
    { id: 'punto', name: 'Quién atiende', level: 'obligatorio', desc: 'Usuario que creó el documento (la persona que atendió). Si el sistema no lo guarda: la caja, ventanilla, módulo o terminal.', ex: 'MPEREZ' },
    { id: 'tipo', name: 'Tipo de transacción', level: 'obligatorio', desc: 'Qué se hizo: venta de contado, venta a crédito, pago de cuota, entrada, depósito, consulta…', ex: 'CREDITO' },
    { id: 'documento', name: 'Número de documento', level: 'recomendado', desc: 'Factura, recibo (REC), ticket, orden o turno. Evita contar dos veces y permite enlazar áreas.', ex: 'F-001245' },
    { id: 'cliente', name: 'Cliente', level: 'recomendado', desc: 'Código del cliente: junta los documentos de una misma visita (por ejemplo, dos cuotas pagadas juntas).', ex: 'CL-88410' },
    { id: 'area', name: 'Área', level: 'recomendado', desc: 'Solo si un mismo archivo trae varias áreas y los tipos se repiten entre ellas.', ex: 'Facturación' },
    { id: 'relacionado', name: 'Documento relacionado', level: 'opcional', desc: 'En un recibo, la factura que paga; en una entrega, la orden. Mide el tiempo entre un área y la siguiente.', ex: 'F-001245' },
    { id: 'inicio', name: 'Hora de inicio de la atención', level: 'opcional', desc: 'Hora en que se abrió el documento o se llamó al cliente. Con ella el tiempo de atención se mide exacto.', ex: '2026-09-14 10:24:40' },
    { id: 'llegada', name: 'Hora de llegada (turno)', level: 'opcional', desc: 'Del turnero o del registro de llegada. Con ella la espera se mide exacta.', ex: '2026-09-14 10:15:02' },
    { id: 'estado', name: 'Estado', level: 'opcional', desc: 'Atendido, abandonado (se fue sin ser atendido) o anulado.', ex: 'atendido' },
    { id: 'monto', name: 'Monto', level: 'opcional', desc: 'Para relacionar el personal con la venta o la cobranza.', ex: '1250.00' }
  ];
  MS.CAN = [['demanda', 'Clientes por hora'], ['mezcla', 'Tipos de transacción'], ['servicio', 'Tiempo de atención'], ['espera', 'Tiempo de espera'], ['abandono', 'Clientes que se van']];
  MS.LEVELS = [
    { n: 0, name: 'Sin sistema', need: 'Registro de cada atención con el celular: inicio, fin y punto (Herramientas → Registro en tienda).', can: { demanda: 'Sí, por hora', mezcla: 'Parcial', servicio: 'Cronometrado', espera: 'No', abandono: 'No' } },
    { n: 1, name: 'Registro de transacciones', need: 'Fecha y hora, quién atiende (usuario creador, o caja) y tipo: lo que guarda casi cualquier ERP o punto de venta.', can: { demanda: 'Sí', mezcla: 'Sí', servicio: 'Cronometrar en tienda', espera: 'No', abandono: 'No' } },
    { n: 2, name: 'Con documento relacionado u hora de inicio', need: 'Además, la factura que paga cada recibo (o la orden que origina la entrega), o la hora en que empezó la atención.', can: { demanda: 'Sí', mezcla: 'Sí', servicio: 'Medido o inferido', espera: 'Aproximada', abandono: 'No' } },
    { n: 3, name: 'Con turnero', need: 'Además, la hora de llegada (emisión del turno) y el estado: atendido o abandonado.', can: { demanda: 'Sí, incluye a quien se fue', mezcla: 'Sí', servicio: 'Medido', espera: 'Medida', abandono: 'Medido' } }
  ];
  // Cómo se llama cada campo del estándar en los sistemas típicos de cada giro
  MS.STD_SECTORS = [
    { id: 'retail', name: 'Retail y tiendas con crédito', system: 'ERP o punto de venta: facturas, tickets y recibos de caja (REC)', level: 2,
      map: { fecha_hora: 'Fecha y hora de emisión de la factura o del REC', punto: 'Usuario que emite la factura o el REC (o la caja o el puesto)', tipo: 'Contado, crédito, entrada, pago de cuota, devolución', documento: 'Número de factura o de REC', cliente: 'Código del cliente', relacionado: 'Factura o crédito que paga el REC', inicio: 'Hora de creación del documento, si el ERP la guarda' },
      tip: 'Muchos ERP guardan dos horas por documento: la de creación (cuando se abre la factura) y la de emisión o impresión. La diferencia es el tiempo de atención exacto: pídela a sistemas.' },
    { id: 'super', name: 'Supermercados', system: 'Punto de venta (POS)', level: 2,
      map: { fecha_hora: 'Hora de cierre del ticket', punto: 'Caja (incluye autocobro y cajas rápidas)', tipo: 'Normal, caja rápida, autocobro', documento: 'Número de ticket', cliente: 'Tarjeta de lealtad (opcional)', inicio: 'Hora del primer artículo escaneado' },
      tip: 'Casi todos los POS registran la hora del primer artículo: con ella el tiempo de atención se mide exacto.' },
    { id: 'banco', name: 'Bancos y financieras', system: 'Turnero y sistema de caja', level: 3,
      map: { fecha_hora: 'Fin de la atención', punto: 'Ventanilla o ejecutivo', tipo: 'Trámite: depósito, retiro, pago, crédito', documento: 'Número de turno u operación', inicio: 'Llamado del turno', llegada: 'Emisión del turno', estado: 'Atendido o abandonado' },
      tip: 'El reporte del turnero suele traer todo: es el nivel 3, con espera y abandonos medidos.' },
    { id: 'callcenter', name: 'Centros de llamadas', system: 'Conmutador (ACD) o plataforma omnicanal', level: 3,
      map: { fecha_hora: 'Fin de la llamada o del chat', punto: 'Agente o extensión', tipo: 'Cola, campaña o habilidad', documento: 'Identificador de la llamada', inicio: 'Hora en que se contestó', llegada: 'Entrada a la cola', estado: 'Atendida o abandonada' },
      tip: 'Exporta el detalle de llamadas (no el resumen): cada fila es una llamada.' },
    { id: 'salud', name: 'Clínicas y hospitales', system: 'Agenda, admisión o expediente clínico', level: 2,
      map: { fecha_hora: 'Fin del registro o de la consulta', punto: 'Módulo o consultorio', tipo: 'Servicio o especialidad', documento: 'Folio de atención', relacionado: 'Folio de la admisión', inicio: 'Inicio de la consulta', llegada: 'Registro en admisión', estado: 'Atendido o no se presentó' },
      tip: 'La hora de la cita permite medir puntualidad y ausentismo además de la espera.' },
    { id: 'gobierno', name: 'Gobierno y trámites', system: 'Turnero', level: 3,
      map: { fecha_hora: 'Fin del trámite', punto: 'Ventanilla', tipo: 'Trámite', documento: 'Número de turno', inicio: 'Llamado del turno', llegada: 'Emisión del turno', estado: 'Atendido o abandonado' }, tip: '' },
    { id: 'restaurante', name: 'Restaurantes y comida rápida', system: 'Punto de venta y pantalla de cocina', level: 2,
      map: { fecha_hora: 'Entrega de la orden', punto: 'Caja, ventanilla o estación', tipo: 'Mostrador, para llevar, autoservicio', documento: 'Número de orden', relacionado: 'Orden de caja (en el archivo de entregas)', inicio: 'Hora de la toma de la orden' }, tip: '' },
    { id: 'otro', name: 'Otros servicios', system: 'Cualquier sistema que registre cada atención', level: 1,
      map: { fecha_hora: 'Fin de la atención', punto: 'Puesto de atención', tipo: 'Servicio', documento: 'Folio' }, tip: '' }
  ];
  const GUESS = [
    ['fecha_hora', /(fecha.?hora|datetime|timestamp|marca.?temporal|fh_|fecha.?emision.?hora)/],
    ['llegada', /(llegada|hora.?turno|emision.?turno|ticket.?turno|en.?cola|entrada.?cola)/],
    ['inicio', /(inicio|hora.?ini|apertura|creacion|start|contest|llamado)/],
    ['relacionado', /(ref$|_ref|^ref|relacion|doc.?origen|aplica|afecta|factura.?ref|fact.?pag|credito.?ref|origen)/],
    ['fecha', /^(fecha|date|fec|dia)|fecha/],
    ['hora', /(^hora|_hora|^hh|time)/],
    ['documento', /(num|nro|folio|documento|factura|^rec|recibo|ticket|comprobante|^doc|orden|turno)/],
    ['cliente', /(cliente|cod.?cli|rut|nit|cedula|dni|id.?cli|cuenta|paciente)/],
    ['punto', null], // se elige por puntaje (puntoScore)
    ['tipo', /(tipo|concepto|condicion|forma.?pago|clase|transac|operacion|movimiento|motivo|tramite|servicio|accion|cola|skill)/],
    ['area', /(area|departamento|seccion)/],
    ['estado', /(estado|status|resultado)/],
    ['monto', /(monto|importe|total|valor|amount|venta)/]
  ];
  // Quién registró la transacción. La persona (usuario creador, cajero, facturador) cuenta al personal mejor que la caja o el puesto:
  // si una cajera pasa a otra caja o dos personas comparten un puesto, se sigue contando a cada persona una vez.
  const WHO = /(usuario|user|usr|cajer|facturador|operador|agente|creado.?por|digitador|emisor|atendid|responsable)/;
  const WHO_NOT = /(modif|anul|aprob|autoriz|actualiz|edit|elimin|borr|ultim|revis|cliente)/; // quien modificó o anuló no es quien atendió
  const PLACE = /(caja|punto|terminal|estacion|ventanilla|modulo|pos$|puesto|box|consultorio|extension)/;
  const puntoScore = (x) => (WHO.test(x) ? (WHO_NOT.test(x) ? 0 : /(crea|emi|regist)/.test(x) ? 3 : 2) : PLACE.test(x) ? 1 : 0);
  MS.isPersonHeader = (hd) => puntoScore(D.normHeader(hd)) >= 2;
  // "Fecha de creación" del documento: si no hay otra fecha con hora, es la hora de registro; si la hay, puede ser el inicio de la atención
  const CREA = /(creac|creado|created|registro|grabac)/;
  // headers: encabezados; rows (opcional): primeras filas, para revisar que las columnas de hora traigan horas
  MS.guessFields = (headers, rows) => {
    const nh = headers.map(D.normHeader); const map = {}; const used = new Set();
    const person = nh.map((x) => puntoScore(x) >= 2); // una columna de usuario nunca es una fecha, una hora ni un documento
    for (const [id, re] of GUESS) {
      if (id === 'punto') {
        let best = -1, bs = 0; for (let i = 0; i < nh.length; i++) { if (used.has(i)) continue; const s = puntoScore(nh[i]); if (s > bs) { bs = s; best = i; } }
        if (best >= 0) { map.punto = best; used.add(best); }
        continue;
      }
      for (let i = 0; i < nh.length; i++) { if (used.has(i) || person[i]) continue; if (re.test(nh[i])) { map[id] = i; used.add(i); break; } }
    }
    if (map.inicio != null && CREA.test(nh[map.inicio]) && map.fecha_hora == null && map.fecha == null) { map.fecha_hora = map.inicio; delete map.inicio; }
    if (rows && rows.length) {
      const vals = (c) => rows.map((r) => r[c]).filter((v) => v != null && String(v).trim() !== '').slice(0, 40);
      const rate = (c, f) => { const v = vals(c); return v.length ? v.filter(f).length / v.length : 0; };
      const dt = (v) => { const p = D.parseDate(v, 'DMY'); return !!(p && isFinite(p.min)); }; // fecha con hora
      const tm = (v) => dt(v) || isFinite(D.parseTime(v));
      ['inicio', 'llegada'].forEach((k) => { if (map[k] != null && rate(map[k], tm) < 0.5) delete map[k]; });
      // fecha sin hora y sin columna de hora: la hora de registro está en la fecha (u hora) de creación
      const main = map.fecha_hora != null ? map.fecha_hora : map.fecha;
      if (main != null && map.hora == null && rate(main, dt) < 0.5 && map.inicio != null && CREA.test(nh[map.inicio])) {
        if (rate(map.inicio, dt) >= 0.5) { if (map.fecha_hora != null) map.fecha = map.fecha_hora; map.fecha_hora = map.inicio; delete map.inicio; }
        else if (rate(map.inicio, (v) => isFinite(D.parseTime(v))) >= 0.5) { map.hora = map.inicio; delete map.inicio; }
      }
    }
    return map;
  };
  // Qué permite medir un archivo según las columnas que trae
  MS.levelFor = (map, o = {}) => {
    const has = (k) => map[k] != null && map[k] !== '';
    const time = has('fecha_hora') || has('fecha');
    if (!time) return { n: -1, missing: ['fecha y hora'], servicio: 'no', espera: 'no', abandono: 'no' };
    const missing = []; if (!has('punto')) missing.push('quién atiende (usuario o caja)'); if (!has('tipo') && !o.oneType) missing.push('tipo de transacción');
    let n = missing.length ? 0.5 : 1;
    if (n === 1 && (has('relacionado') || has('inicio'))) n = 2;
    if (n >= 1 && has('llegada')) n = 3;
    return { n, missing,
      servicio: has('inicio') ? 'medido' : has('relacionado') && o.after ? 'inferido' : has('punto') ? 'máximo probable' : 'no',
      espera: has('llegada') ? (has('inicio') ? 'medida' : 'aproximada') : has('relacionado') && o.after ? 'aproximada' : 'no',
      abandono: has('estado') && has('llegada') ? 'medido' : 'no' };
  };
  MS.standardTemplate = () => ({ name: 'estandar_datos_atencion.csv', headers: MS.FIELDS.map((f) => f.id),
    rows: [['2026-09-14 10:32:05', 'MPEREZ', 'FACTURA CREDITO', 'F-001245', 'CL-88410', 'Cajas', '', '2026-09-14 10:24:40', '', 'atendido', 4580],
      ['2026-09-14 10:41:12', 'FTORRES', 'ENTRADA CREDITO', 'REC-000871', 'CL-88410', 'Facturación', 'F-001245', '', '', 'atendido', 900],
      ['2026-09-14 10:41:50', 'GRUIZ', 'PAGO CUOTA', 'REC-000872', 'CL-10233', 'Facturación', 'CR-5521', '', '', 'atendido', 350],
      ['2026-09-14 10:43:03', 'JLOPEZ', 'FACTURA CONTADO', 'F-001246', 'CL-30512', 'Cajas', '', '2026-09-14 10:40:15', '', 'atendido', 850]] });
  MS.dictionary = () => ({ name: 'diccionario_de_datos.csv', headers: ['campo', 'nombre', 'necesidad', 'descripcion', 'ejemplo'], rows: MS.FIELDS.map((f) => [f.id, f.name, f.level, f.desc, f.ex]) });

  /* ======================= modelo del proceso ======================= */
  MS.TEMPLATES = [
    { id: 'retail_credito', name: 'Retail con crédito: cajas y facturación', sector: 'retail', desc: 'Cajeras emiten facturas de contado y crédito; facturadoras cobran y emiten recibos (REC) de pago, entradas y cuotas.',
      areas: [{ name: 'Cajas: emisión de facturas', staff: 'Cajeras', server: 'caja', types: ['Factura de contado', 'Factura de crédito'] },
        { name: 'Facturación: pagos y recibos (REC)', staff: 'Facturadoras', server: 'puesto', types: ['Pago de contado', 'Entrada de crédito', 'Pago de cuota'] }],
      flows: [{ name: 'Compra de contado', steps: ['Factura de contado', 'Pago de contado'] }, { name: 'Compra a crédito con entrada', steps: ['Factura de crédito', 'Entrada de crédito'] },
        { name: 'Compra a crédito sin entrada', steps: ['Factura de crédito', null] }, { name: 'Solo pago de cuota', steps: [null, 'Pago de cuota'] }] },
    { id: 'retail_simple', name: 'Tienda o supermercado: solo cajas', sector: 'retail', desc: 'Una sola área de cobro, con uno o varios tipos de venta.',
      areas: [{ name: 'Cajas', staff: 'Cajeros', server: 'caja', types: ['Venta'] }], flows: [{ name: 'Compra', steps: ['Venta'] }] },
    { id: 'banco', name: 'Banco: ventanillas y ejecutivos', sector: 'banco', desc: 'Cada cliente va a ventanilla o con un ejecutivo según su trámite.',
      areas: [{ name: 'Ventanillas', staff: 'Cajeros', server: 'ventanilla', types: ['Depósito o retiro', 'Pago de servicios'] }, { name: 'Ejecutivos', staff: 'Ejecutivos', server: 'ejecutivo', types: ['Apertura o crédito', 'Aclaración'] }],
      flows: [{ name: 'Operación en ventanilla', steps: ['Depósito o retiro', null] }, { name: 'Pago de servicios', steps: ['Pago de servicios', null] }, { name: 'Trámite con ejecutivo', steps: [null, 'Apertura o crédito'] }, { name: 'Aclaración', steps: [null, 'Aclaración'] }] },
    { id: 'clinica', name: 'Clínica: admisión, consulta y farmacia', sector: 'salud', desc: 'Tres áreas en serie; no todos los pacientes pasan por farmacia.',
      areas: [{ name: 'Admisión', staff: 'Recepcionistas', server: 'módulo', types: ['Registro'] }, { name: 'Consulta', staff: 'Médicos', server: 'consultorio', types: ['Consulta'] }, { name: 'Farmacia', staff: 'Despachadores', server: 'mostrador', types: ['Receta'] }],
      flows: [{ name: 'Consulta con receta', steps: ['Registro', 'Consulta', 'Receta'] }, { name: 'Consulta sin receta', steps: ['Registro', 'Consulta', null] }, { name: 'Solo farmacia', steps: [null, null, 'Receta'] }] },
    { id: 'comida', name: 'Comida rápida: caja y entrega', sector: 'restaurante', desc: 'Se ordena y paga en caja; después se espera la entrega.',
      areas: [{ name: 'Caja', staff: 'Cajeros', server: 'caja', types: ['Orden'] }, { name: 'Entrega', staff: 'Preparadores', server: 'preparador', types: ['Entrega'] }],
      flows: [{ name: 'Orden en mostrador', steps: ['Orden', 'Entrega'] }] },
    { id: 'gobierno', name: 'Oficina de trámites: recepción y ventanillas', sector: 'gobierno', desc: 'Recepción entrega el turno; las ventanillas atienden trámites cortos y largos.',
      areas: [{ name: 'Recepción y turno', staff: 'Recepcionistas', server: 'módulo', types: ['Turno'] }, { name: 'Ventanillas', staff: 'Ventanilleros', server: 'ventanilla', types: ['Trámite corto', 'Trámite largo'] }],
      flows: [{ name: 'Trámite corto', steps: ['Turno', 'Trámite corto'] }, { name: 'Trámite largo', steps: ['Turno', 'Trámite largo'] }] }
  ];
  MS.fromTemplate = (id) => {
    const t = MS.TEMPLATES.find((x) => x.id === id) || MS.TEMPLATES[0];
    const p = JSON.parse(JSON.stringify({ template: t.id, name: t.name, sector: t.sector, walk: 0.5, areas: t.areas, flows: t.flows }));
    p.areas.forEach((a) => { a.queue = a.queue || 'single'; });
    return p;
  };
  MS.validate = (proc) => {
    const errs = [];
    if (!proc.areas.length) errs.push('Define al menos un área.');
    proc.areas.forEach((a) => { if (!a.types.length) errs.push(`El área "${a.name}" no tiene tipos de transacción.`); });
    if (!proc.flows.length) errs.push('Define al menos un flujo de clientes.');
    proc.flows.forEach((f) => { if (!f.steps.some(Boolean)) errs.push(`El flujo "${f.name}" no pasa por ningún área.`); });
    proc.areas.forEach((a, i) => { if (!proc.flows.some((f) => f.steps[i])) errs.push(`Ningún flujo pasa por "${a.name}".`); });
    return errs;
  };
  // Reparto por defecto de los flujos (antes de medir): partes iguales
  MS.defaultShares = (proc) => proc.flows.map(() => 1 / Math.max(1, proc.flows.length));

  /* ======================= lectura de un área ======================= */
  const norm = (s) => String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  // Propone a qué tipo del proceso corresponde cada valor del ERP
  MS.autoTypeMap = (rawValues, labels) => {
    const out = {};
    const keyTok = (s) => norm(s).split(' ').filter((w) => w.length > 2 && !['del', 'por', 'los', 'las', 'con', 'sin', 'para'].includes(w));
    for (const raw of rawValues) {
      const rt = keyTok(raw); let best = '', bs = 0;
      for (const l of labels) {
        const lt = keyTok(l); let s = 0;
        for (const a of rt) for (const b of lt) { if (a === b) s += 2; else if (a.length >= 4 && b.length >= 4 && (a.startsWith(b.slice(0, 4)) || b.startsWith(a.slice(0, 4)))) s += 1; }
        if (s > bs) { bs = s; best = l; }
      }
      out[raw] = bs > 0 ? best : (labels.length === 1 ? labels[0] : '');
    }
    return out;
  };
  // Valores distintos de una columna (para el tipo y el área)
  MS.distinctValues = async (src, col, max = 80) => {
    const cnt = new Map();
    await D.eachRow(src, (r) => { const v = String(r[col] == null ? '' : r[col]).trim(); if (!v) return; cnt.set(v, (cnt.get(v) || 0) + 1); });
    return Array.from(cnt.entries()).sort((a, b) => b[1] - a[1]).slice(0, max);
  };
  MS.distinctTypes = MS.distinctValues;
  // Archivo único con todas las áreas: pares (área, tipo) con su número de filas, en una sola pasada
  MS.distinctPairs = async (src, colA, colB, onProgress) => {
    const cnt = new Map(), a = new Map(), b = new Map();
    const val = (r, c) => (c == null ? '' : String(r[c] == null ? '' : r[c]).trim());
    await D.eachRow(src, (r) => { const va = val(r, colA), vb = val(r, colB); const k = va + '\u0001' + vb; cnt.set(k, (cnt.get(k) || 0) + 1); if (va) a.set(va, (a.get(va) || 0) + 1); if (vb) b.set(vb, (b.get(vb) || 0) + 1); }, onProgress);
    const sort = (m) => Array.from(m.entries()).sort((x, y) => y[1] - x[1]);
    return { pairs: cnt, areas: sort(a), types: sort(b) };
  };
  const STOP = new Set(['del', 'por', 'los', 'las', 'con', 'sin', 'para', 'emision', 'pagos']);
  const toks = (s) => norm(s).split(' ').filter((w) => w.length > 2 && !STOP.has(w));
  const simScore = (a, b) => { let s = 0; for (const x of toks(a)) for (const y of toks(b)) { if (x === y) s += 2; else if (x.length >= 4 && y.length >= 4 && (x.startsWith(y.slice(0, 4)) || y.startsWith(x.slice(0, 4)))) s += 1; } return s; };
  // Reparte un archivo único entre las áreas del proceso. Con columna Área: cada valor va al área del proceso con el nombre más
  // parecido y los tipos de cada área se emparejan con sus tipos de transacción. Sin columna Área: cada tipo va al área cuyo tipo se le
  // parece más; si empata entre áreas, queda sin asignar para que el usuario lo indique.
  MS.splitSingleFile = (proc, dv, hasArea) => {
    const nA = proc.areas.length;
    const out = { areaOf: {}, areaSel: proc.areas.map(() => []), typeMaps: proc.areas.map(() => ({})), types: proc.areas.map(() => new Map()), unassignedAreas: [], unassignedTypes: [] };
    if (hasArea) {
      dv.areas.forEach(([av, n]) => {
        let best = -1, bs = 0, tie = false;
        proc.areas.forEach((ar, i) => { const s = Math.max(simScore(av, ar.name), simScore(av, `${ar.staff || ''} ${ar.server || ''}`)); if (s > bs) { bs = s; best = i; tie = false; } else if (s === bs && s > 0) tie = true; });
        if (nA === 1) { best = 0; tie = false; }
        if (best >= 0 && !tie) { out.areaOf[av] = best; out.areaSel[best].push(av); } else out.unassignedAreas.push([av, n]);
      });
      for (const [k, n] of dv.pairs) { const [av, tv] = k.split('\u0001'); const ai = out.areaOf[av]; if (ai == null || !tv) continue; out.types[ai].set(tv, (out.types[ai].get(tv) || 0) + n); }
      proc.areas.forEach((ar, i) => { out.typeMaps[i] = MS.autoTypeMap(Array.from(out.types[i].keys()), ar.types); });
    } else {
      dv.types.forEach(([tv, n]) => {
        let best = null, bs = 0, tie = false;
        proc.areas.forEach((ar, i) => ar.types.forEach((l) => { const s = simScore(tv, l); if (s > bs) { bs = s; best = [i, l]; tie = false; } else if (s === bs && s > 0 && best && best[0] !== i) tie = true; }));
        if (nA === 1) { best = [0, MS.autoTypeMap([tv], proc.areas[0].types)[tv]]; tie = false; }
        if (best && best[1] && !tie) { out.typeMaps[best[0]][tv] = best[1]; out.types[best[0]].set(tv, n); } else out.unassignedTypes.push([tv, n]);
      });
    }
    out.types = out.types.map((mp) => Array.from(mp.entries()).sort((x, y) => y[1] - x[1]));
    proc.areas.forEach((ar, i) => out.types[i].forEach(([tv, n]) => { if (!out.typeMaps[i][tv]) out.unassignedTypes.push([tv, n, i]); }));
    return out;
  };
  // Clave de un documento para enlazar áreas: mayúsculas, sin espacios ni separadores y sin ceros a la izquierda.
  // F-001245, f001245 y F1245 son el mismo documento; Excel suele quitar los ceros iniciales de los números.
  const normDoc = (v) => { let s = String(v).trim(); if (/^\d{1,3}(,\d{3})+$/.test(s)) s = s.replace(/,/g, ''); return s.toUpperCase().replace(/[\s\-_./\\#:]+/g, '').replace(/(^|[A-Z])0+(?=\d)/g, '$1'); };
  MS.normDoc = normDoc;
  // Documentos de una celda: un recibo puede pagar varias facturas ("F-1245; F-1246")
  const docList = (v) => { if (v == null) return []; const s = String(v).trim(); if (!s) return []; if (/^\d{1,3}(,\d{3})+$/.test(s)) return [normDoc(s)]; return s.split(/[;|,]+/).map(normDoc).filter(Boolean); };
  // Lee el archivo de un área. cfg: {map, typeMap, labels, dateOrder, groupSec, areaValues, name, exclude (usuarios o puntos que no se cuentan)}
  MS.readArea = async (src, cfg, onProgress) => {
    const m = cfg.map, order = cfg.dateOrder || 'DMY', labels = cfg.labels;
    const T = [], ST = [], TY = [], DOC = [], REL = [], CLI = [], INI = [], LLE = [], AB = []; const RELX = new Map(); // filas con varios documentos relacionados
    const has = (k) => m[k] != null && m[k] !== '';
    const hasDoc = has('documento'), hasRel = has('relacionado'), hasCli = has('cliente'), hasIni = has('inicio'), hasLle = has('llegada');
    const keyOf = (v) => { if (v == null) return 0; const s = normDoc(v); return s ? hash52(s) : 0; };
    const stIds = new Map(); const st = { rows: 0, ok: 0, bad: 0, ignored: 0, dup: 0, excluded: 0, reasons: {} };
    const excl = cfg.exclude && cfg.exclude.length ? new Set(cfg.exclude) : null;
    const bad = (why) => { st.bad++; st.reasons[why] = (st.reasons[why] || 0) + 1; };
    const col = (r, k) => (m[k] != null && m[k] !== '' ? r[m[k]] : undefined);
    const areaSet = m.area != null && cfg.areaValues && cfg.areaValues.length ? new Set(cfg.areaValues) : null;
    const timeOf = (r) => {
      let p = null, tOnly = NaN;
      if (col(r, 'fecha_hora') !== undefined) { p = D.parseDate(col(r, 'fecha_hora'), order); if (!p) tOnly = D.parseTime(col(r, 'fecha_hora')); }
      if ((!p || !isFinite(p.min)) && col(r, 'fecha') !== undefined) { const q = D.parseDate(col(r, 'fecha'), order); if (q) p = { k: q.k, min: isFinite(q.min) ? q.min : (p ? p.min : NaN) }; }
      if (p && !isFinite(p.min) && isFinite(tOnly)) p.min = tOnly;
      if (p && col(r, 'hora') !== undefined) { const tm = D.parseTime(col(r, 'hora')); if (isFinite(tm)) p.min = tm; }
      return p && isFinite(p.min) ? p.k * 1440 + p.min : NaN;
    };
    // hora de inicio o de llegada: fecha y hora completas, o solo la hora (del mismo día de la transacción)
    const timeRel = (v, t) => {
      if (v == null || v === '') return NaN;
      const p = D.parseDate(v, order); if (p && isFinite(p.min)) return p.k * 1440 + p.min;
      const tm = D.parseTime(v); if (!isFinite(tm)) return NaN;
      const k = Math.floor(t / 1440); let x = k * 1440 + tm; if (x > t + 1) x -= 1440; return x;
    };
    await D.eachRow(src, (r) => {
      st.rows++;
      if (areaSet && !areaSet.has(String(col(r, 'area') == null ? '' : col(r, 'area')).trim())) { st.ignored++; return; }
      const t = timeOf(r); if (!isFinite(t)) { bad('fecha u hora no reconocida'); return; }
      let ty = 0;
      if (m.tipo != null && m.tipo !== '') {
        const raw = String(col(r, 'tipo') == null ? '' : col(r, 'tipo')).trim(); const lab = cfg.typeMap ? cfg.typeMap[raw] : labels[0];
        if (!lab) { st.ignored++; return; }
        ty = labels.indexOf(lab); if (ty < 0) { st.ignored++; return; }
      }
      const est = m.estado != null && m.estado !== '' ? String(col(r, 'estado') || '') : '';
      if (est && /anul|cancel|void|revers/i.test(est)) { st.ignored++; return; }
      if (est && /abandon|no.?atend|ausent|perdid|no.?show|desist|no.?se.?present/i.test(est)) { // se fue sin ser atendido: llegada no atendida
        const tl = m.llegada != null ? timeRel(col(r, 'llegada'), t) : NaN; AB.push({ t: isFinite(tl) ? tl : t, ty }); st.ok++; return;
      }
      const sId = m.punto != null && m.punto !== '' ? String(col(r, 'punto') == null ? '' : col(r, 'punto')).trim() || '?' : '(sin punto)';
      if (excl && excl.has(sId)) { st.excluded++; return; }
      if (!stIds.has(sId)) stIds.set(sId, stIds.size);
      const ri = T.length;
      T.push(t); ST.push(stIds.get(sId)); TY.push(ty);
      if (hasDoc) DOC.push(keyOf(col(r, 'documento')));
      if (hasRel) { const ls = docList(col(r, 'relacionado')); REL.push(ls.length ? hash52(ls[0]) : 0); if (ls.length > 1) RELX.set(ri, ls.slice(1).map(hash52)); }
      if (hasCli) CLI.push(keyOf(col(r, 'cliente')));
      if (hasIni) INI.push(timeRel(col(r, 'inicio'), t));
      if (hasLle) LLE.push(timeRel(col(r, 'llegada'), t));
      st.ok++;
    }, onProgress);
    if (!T.length) throw new Error('No se leyó ninguna transacción válida: revisa las columnas de fecha, hora y tipo, y la correspondencia de tipos.');
    // La hora de inicio debe ser anterior al registro y estar a minutos de él. Si casi siempre coincide con el registro o es posterior
    // (por ejemplo, una fecha de creación que el sistema graba al emitir el documento), no mide la atención y no se usa.
    let useIni = hasIni;
    if (hasIni) {
      const step = Math.max(1, Math.floor(T.length / 20000)); let nI = 0; const pos = [];
      for (let i = 0; i < T.length; i += step) { const x = INI[i]; if (!isFinite(x)) continue; nI++; const d = T[i] - x; if (d > 0 && d < 240) pos.push(d); }
      const med = pos.length ? U.median(pos) : NaN;
      if (nI >= 20 && (pos.length < 0.5 * nI || !(med >= 0.2))) { useIni = false; st.iniBad = { n: nI, share: pos.length / nI, median: med }; }
    }
    // Documentos del mismo punto y del mismo cliente con pocos segundos de diferencia = una sola visita.
    // Las visitas se guardan en columnas numéricas (con años de historia son cientos de miles o millones): hora, punto, tipo,
    // documentos, hora de inicio y de llegada, y la huella del documento y del documento relacionado.
    const n0 = T.length; const idx = new Int32Array(n0); for (let i = 0; i < n0; i++) idx[i] = i;
    idx.sort((a, b) => ST[a] - ST[b] || T[a] - T[b]);
    const gsec = (cfg.groupSec == null ? 20 : +cfg.groupSec) / 60;
    const vt = [], vst = [], vty = [], vdocs = [], vini = useIni ? [] : null, vlle = hasLle ? [] : null, vdoc = hasDoc ? [] : null, vrel = hasRel ? [] : null;
    const xdoc = new Map(), xrel = new Map(); const pushX = (mp, i, hsh) => { const a = mp.get(i); if (a) a.push(hsh); else mp.set(i, [hsh]); };
    const addRelX = (i, v) => { const rx = RELX.get(i); if (rx) for (const hsh of rx) pushX(xrel, v, hsh); };
    // Filas repetidas: el mismo documento en dos archivos que se superponen en fechas, o un reporte con una fila por línea del documento
    // (mismo punto, hora, tipo, documento, relacionado y cliente). Se cuentan una sola vez.
    const keyRow = (i) => TY[i] + ':' + DOC[i] + ':' + (hasRel ? REL[i] : 0) + ':' + (hasCli ? CLI[i] : 0);
    let cur = -1, curCli = 0, prev = -1, blk = null;
    for (let q = 0; q < n0; q++) {
      const i = idx[q];
      if (hasDoc && DOC[i] && prev >= 0 && ST[i] === ST[prev] && T[i] === T[prev]) {
        if (!blk) blk = new Set([keyRow(prev)]);
        const kk = keyRow(i); if (blk.has(kk)) { st.dup++; continue; } blk.add(kk);
      } else blk = null;
      prev = i;
      const cli = hasCli ? CLI[i] : 0;
      if (gsec > 0 && cur >= 0 && vst[cur] === ST[i] && T[i] - vt[cur] <= gsec && (!cli || !curCli || cli === curCli)) {
        vdocs[cur]++; if (T[i] > vt[cur]) vt[cur] = T[i];
        if (hasRel && REL[i]) { if (!vrel[cur]) vrel[cur] = REL[i]; else pushX(xrel, cur, REL[i]); }
        addRelX(i, cur);
        if (hasDoc && DOC[i]) { if (!vdoc[cur]) vdoc[cur] = DOC[i]; else pushX(xdoc, cur, DOC[i]); }
        continue;
      }
      cur = vt.length; curCli = cli;
      vt.push(T[i]); vst.push(ST[i]); vty.push(TY[i]); vdocs.push(1);
      if (vini) vini.push(INI[i]); if (vlle) vlle.push(LLE[i]); if (vdoc) vdoc.push(DOC[i]); if (vrel) vrel.push(REL[i]);
      addRelX(i, cur);
    }
    st.ok -= st.dup;
    const V = { n: vt.length, t: Float64Array.from(vt), st: Int32Array.from(vst), ty: Uint8Array.from(vty), docs: Uint16Array.from(vdocs, (x) => Math.min(65535, x)),
      ini: vini ? Float64Array.from(vini) : null, lle: vlle ? Float64Array.from(vlle) : null, doc: vdoc ? Float64Array.from(vdoc) : null, rel: vrel ? Float64Array.from(vrel) : null, xdoc, xrel };
    st.users = MS.userStats(V, Array.from(stIds.keys()));
    st.excludedNames = cfg.exclude ? cfg.exclude.slice() : [];
    return MS.summarizeArea(V, labels, stIds, st, Object.assign({ abandons: AB }, cfg));
  };
  // Por usuario o punto: transacciones, días con movimiento y registros en bloque (3 o más seguidos en menos de 3 s, o en el mismo
  // minuto si el archivo no trae segundos). Una persona en mostrador no registra así; un proceso automático o de oficina sí
  // (pagos en línea, depósitos, conciliaciones): esas transacciones no son clientes en la fila. V: visitas ordenadas por punto y hora.
  MS.userStats = (V, names) => {
    let fr = 0, nf = 0; const stp = Math.max(1, Math.floor(V.n / 5000));
    for (let i = 0; i < V.n; i += stp) { nf++; if (Math.abs(V.t[i] - Math.round(V.t[i])) > 1e-6) fr++; }
    const thr = fr / Math.max(1, nf) > 0.01 ? 0.05 : 1e-6;
    const nS = names.length, sN = new Int32Array(nS), sB = new Int32Array(nS), sD = new Int32Array(nS), lastK = new Int32Array(nS).fill(-1);
    for (let i = 0; i < V.n;) {
      const s = V.st[i]; let j = i;
      while (j + 1 < V.n && V.st[j + 1] === s && V.t[j + 1] - V.t[i] <= thr) j++;
      const len = j - i + 1; sN[s] += len; if (len >= 3) sB[s] += len;
      for (let q = i; q <= j; q++) { const k = Math.floor(V.t[q] / 1440); if (k !== lastK[s]) { lastK[s] = k; sD[s]++; } }
      i = j + 1;
    }
    return names.map((name, s) => ({ name, n: sN[s], days: sD[s], bulk: sN[s] ? sB[s] / sN[s] : 0, auto: sN[s] >= 20 && sB[s] / sN[s] >= 0.2 }))
      .filter((u) => u.n > 0).sort((a, b) => b.n - a.n);
  };
  // Huella numérica de 52 bits de un texto (FNV-1a doble): enlaza documentos entre áreas sin guardar el texto.
  // Con un millón de documentos, la probabilidad de que dos distintos tengan la misma huella es menor a 1 en 9 000.
  const hash52 = (s) => {
    let h1 = 0x811c9dc5 | 0, h2 = 0x9747b28c | 0;
    for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); h1 = Math.imul(h1 ^ c, 16777619); h2 = Math.imul(h2 ^ c, 0x5bd1e995); h2 ^= h2 >>> 13; }
    return (h1 >>> 0) * 1048576 + ((h2 >>> 0) >>> 12) + 1; // 0 = sin documento
  };
  MS.hash52 = hash52;
  // Huellas de los documentos (o relacionados) de la visita i
  const docsOf = (arr, extra, i) => { const out = []; if (arr && arr[i]) out.push(arr[i]); const x = extra && extra.get(i); if (x) out.push(...x); return out; };

  /* ---------- estadísticos ---------- */
  const thin = (x, n) => (x.length > n ? x.filter((_, i) => i % Math.ceil(x.length / n) === 0) : x);
  const statsOf = (a) => {
    if (a.length < 8) return null;
    const s = U.sortedCopy(a); const cut = U.quantileSorted(s, 0.95); const x = Array.from(s).filter((q) => q <= cut);
    return { n: a.length, mean: U.mean(x), median: U.quantileSorted(s, 0.5), p25: U.quantileSorted(s, 0.25), p75: U.quantileSorted(s, 0.75), cv: U.sd(x) / U.mean(x), sample: thin(x, 3000) };
  };
  // Atención medida con la hora de inicio: solo se quitan los valores anómalos (más allá de Q3 + 3·RIC, regla de Tukey para valores
  // "muy alejados"; por ejemplo, un documento que quedó abierto). Recortar un porcentaje fijo sesgaría la media hacia abajo.
  const statsFence = (a) => {
    if (a.length < 8) return null;
    const s = U.sortedCopy(a); const q1 = U.quantileSorted(s, 0.25), q3 = U.quantileSorted(s, 0.75); const fence = q3 + 3 * (q3 - q1);
    const x = Array.from(s).filter((v) => v <= fence);
    return { n: a.length, mean: U.mean(x), median: U.quantileSorted(s, 0.5), p25: q1, p75: q3, cv: U.sd(x) / U.mean(x), sample: thin(x, 3000), outliers: a.length - x.length };
  };
  // Muestra cronometrada: sin recortar (cada tiempo es una atención real; recortar sesgaría la media de una distribución asimétrica)
  const statsRaw = (a) => {
    const s = U.sortedCopy(a);
    return { n: a.length, mean: U.mean(a), median: U.quantileSorted(s, 0.5), p25: U.quantileSorted(s, 0.25), p75: U.quantileSorted(s, 0.75), cv: a.length > 1 ? U.sd(a) / U.mean(a) : NaN, sample: thin(Array.from(s), 3000) };
  };
  const scaleStats = (s, mean, method, extra) => {
    const f = mean / s.mean;
    return Object.assign({}, s, { mean, median: s.median * f, p25: s.p25 * f, p75: s.p75 * f, sample: s.sample.map((x) => x * f), method }, extra || {});
  };
  // Intervalos entre transacciones seguidas de un mismo punto (visitas ordenadas por punto y hora), en las horas más cargadas del ÁREA
  // (transacciones por punto con movimiento). Se elige la hora por la carga del área y no la de cada punto para no favorecer
  // a las atenciones cortas. Si el punto trabajó sin pausa, el intervalo es la atención del segundo cliente; si no, incluye tiempo libre.
  // V: visitas en columnas; idx: índices de las visitas a usar (en orden de punto y hora)
  MS.gaps = (V, idx, nT, q = 0.9) => {
    const VT = V.t, VS = V.st, VY = V.ty;
    const ah = new Map(), sts = new Map();
    for (let j = 0; j < idx.length; j++) { const i = idx[j]; const key = Math.floor(VT[i] / 60); ah.set(key, (ah.get(key) || 0) + 1); let x = sts.get(key); if (!x) sts.set(key, (x = new Set())); x.add(VS[i]); }
    const load = new Map(); for (const [k, n] of ah) load.set(k, n / sts.get(k).size);
    const ls = Array.from(load.values()).sort((a, b) => a - b);
    const present = U.range(nT, () => false); for (let j = 0; j < idx.length; j++) present[VY[idx[j]]] = true;
    const collect = (qq) => {
      const thr = U.quantileSorted(ls, qq); const out = U.range(nT, () => []);
      for (let j = 1; j < idx.length; j++) {
        const i = idx[j], p = idx[j - 1]; if (VS[p] !== VS[i]) continue;
        const g = VT[i] - VT[p]; if (!(g > 0.15 && g < 60) || Math.floor(VT[p] / 1440) !== Math.floor(VT[i] / 1440)) continue;
        if ((load.get(Math.floor(VT[i] / 60)) || 0) >= thr) out[VY[i]].push(g);
      }
      return out;
    };
    let best = null;
    for (const qq of [q, 0.75, 0.5, 0]) { best = collect(qq); if (best.every((a, t) => a.length >= 60 || !present[t])) break; }
    return best;
  };

  // Resumen y mediciones de un área a partir de sus visitas (ordenadas por punto y hora).
  // Periodo base (cfg.baseWeeks; 13 semanas por omisión, 0 = todo el periodo): el modelo (llegadas por hora, personal presente,
  // atención, mezcla de tipos, horario) usa las últimas semanas, para reflejar la operación de hoy y no el promedio de años con
  // otra demanda. La historia completa se conserva día por día (dayRec) para medir temporadas por mes y tipos de día.
  MS.BASE_WEEKS = 13;
  MS.summarizeArea = (V, labels, stIds, st, cfg) => {
    const nT = labels.length, AB = cfg.abandons || [];
    const n = V.n, VT = V.t, VS = V.st, VY = V.ty, VI = V.ini, VL = V.lle;
    let kMin = Infinity, kMax = -Infinity;
    for (let i = 0; i < n; i++) { const k = Math.floor(VT[i] / 1440); if (k < kMin) kMin = k; if (k > kMax) kMax = k; }
    const nDays = kMax - kMin + 1;
    const weeks = cfg.baseWeeks != null ? Math.max(0, +cfg.baseWeeks || 0) : MS.BASE_WEEKS;
    // cfg.baseRange: periodo base común con las demás áreas (MS.alignAreas), para que todas describan las mismas semanas
    const br = cfg.baseRange;
    const kb1 = br ? Math.min(kMax, Math.max(kMin, br.k1)) : kMax;
    const kb0 = br ? Math.max(kMin, Math.min(kb1, br.k0)) : weeks > 0 ? Math.max(kMin, kMax - weeks * 7 + 1) : kMin;
    // índices de las visitas del periodo base (conservan el orden por punto y hora)
    const inW = (i) => { const k = Math.floor(VT[i] / 1440); return k >= kb0 && k <= kb1; };
    let nw = 0; for (let i = 0; i < n; i++) if (inW(i)) nw++;
    const W = new Int32Array(nw); for (let i = 0, j = 0; i < n; i++) if (inW(i)) W[j++] = i;
    const pos = (t) => { const k = Math.floor(t / 1440); return { d: k - kMin, hh: Math.min(23, Math.max(0, Math.floor((t - k * 1440) / 60))) }; };
    const z24 = () => new Float64Array(24);
    // done: atenciones por hora de REGISTRO (para validar contra la simulación); las llegadas por hora (para el modelo) las calcula binArrivals
    const arr = U.range(nDays, z24), done = U.range(nDays, z24), abn = U.range(nDays, z24);
    const sSum = U.range(nDays, z24), sN = U.range(nDays, z24), wSum = U.range(nDays, z24), wN = U.range(nDays, z24);
    const typeCount = new Array(nT).fill(0), typeCountAll = new Array(nT).fill(0);
    for (let i = 0; i < n; i++) { const p = pos(VT[i]); done[p.d][p.hh]++; typeCountAll[VY[i]]++; }
    for (let j = 0; j < nw; j++) typeCount[VY[W[j]]]++;
    for (const a of AB) { const p = pos(a.t); if (p.d >= 0 && p.d < nDays) abn[p.d][p.hh]++; }
    // atención medida (hora de inicio) y espera medida (llegada → inicio) o aproximada (llegada → fin, menos la atención), en el periodo base
    const meas = U.range(nT, () => []), soj = U.range(nT, () => []), wq = U.range(nT, () => []);
    if (VI || VL) for (let j = 0; j < nw; j++) {
      const i = W[j], t = VT[i], ty = VY[i], ini = VI ? VI[i] : NaN, lle = VL ? VL[i] : NaN;
      const sv = isFinite(ini) ? t - ini : NaN;
      if (sv > 0 && sv < 240) { meas[ty].push(sv); const p = pos(t); sSum[p.d][p.hh] += sv; sN[p.d][p.hh]++; }
      if (isFinite(lle)) {
        if (isFinite(ini) && ini >= lle && ini - lle < 600) { wq[ty].push(ini - lle); const p = pos(lle); wSum[p.d][p.hh] += ini - lle; wN[p.d][p.hh]++; }
        else if (t > lle && t - lle < 600) soj[ty].push({ t: lle, w: t - lle });
      }
    }
    // Presencia de cada punto de atención por hora: sesiones de trabajo desde un intervalo típico antes de su primera transacción
    // hasta la última, cortadas en pausas largas (más de 30 min y más de 8 veces su intervalo típico). Así no se cuenta un puesto
    // completo en la hora en que la persona solo terminó a su último cliente antes de salir de turno.
    const pres = U.range(nDays, z24);
    const dayOpen = new Array(nDays).fill(Infinity), dayLast = new Array(nDays).fill(-Infinity); // inicio de la primera sesión y último registro del día
    const addSpan = (t0, t1) => { let a = t0; while (a < t1 - 1e-9) { const k = Math.floor(a / 1440), hh = Math.floor((a - k * 1440) / 60); const b = Math.min(t1, k * 1440 + (hh + 1) * 60); const d = k - kMin; if (d >= 0 && d < nDays) pres[d][hh] += (b - a) / 60; a = b; } };
    for (let i = 0; i < n;) {
      let j = i; const k = Math.floor(VT[i] / 1440);
      while (j + 1 < n && VS[j + 1] === VS[i] && Math.floor(VT[j + 1] / 1440) === k) j++;
      const g = []; for (let q = i + 1; q <= j; q++) g.push(VT[q] - VT[q - 1]);
      const med = g.length ? U.median(g) : 5; const lead = U.clamp(med, 0.5, 15), brk = Math.max(30, 8 * med);
      let s0 = VT[i] - lead;
      const d0 = k - kMin; if (d0 >= 0 && d0 < nDays) { dayOpen[d0] = Math.min(dayOpen[d0], s0); dayLast[d0] = Math.max(dayLast[d0], VT[j]); }
      for (let q = i + 1; q <= j; q++) if (VT[q] - VT[q - 1] > brk) { addSpan(s0, VT[q - 1]); s0 = VT[q] - lead; }
      addSpan(s0, VT[j]);
      i = j + 1;
    }
    const gaps = MS.gaps(V, W, nT);
    const svc0 = labels.map((l, i) => {
      const mm = statsFence(meas[i]); if (mm) return Object.assign(mm, { method: 'medido' });
      const g = statsOf(gaps[i]); if (!g) return null;
      const gm = U.mean(gaps[i]); return scaleStats(g, gm, 'maximo', { gapMean: gm }); // media sin recortar: el modelo aditivo vale para medias
    });
    // promedios por día de la semana y hora (días con movimiento del periodo base); las llegadas se reparten en binArrivals
    const dayTot = U.range(nDays, (d) => { let tot = 0; for (let hh = 0; hh < 24; hh++) tot += done[d][hh]; return tot; });
    const dowDays = new Array(7).fill(0); const heatDone = U.range(7, () => new Array(24).fill(0)); const sHeat = U.range(7, () => new Array(24).fill(0));
    for (let d = kb0 - kMin; d <= kb1 - kMin; d++) {
      if (!dayTot[d]) continue;
      const w = U.dayInfo(kMin + d).dow; dowDays[w]++;
      for (let hh = 0; hh < 24; hh++) { heatDone[w][hh] += done[d][hh]; sHeat[w][hh] += pres[d][hh]; }
    }
    for (let w = 0; w < 7; w++) if (dowDays[w]) for (let hh = 0; hh < 24; hh++) { heatDone[w][hh] /= dowDays[w]; sHeat[w][hh] /= dowDays[w]; }
    const dayRec = [];
    for (let d = 0; d < nDays; d++) if (dayTot[d]) dayRec.push({ d, k: kMin + d, tot: dayTot[d], act: Array.from(pres[d]), types: new Array(nT).fill(0) });
    const area = { name: cfg.name || 'Área', labels, V, wIdx: W, nVis: nw, nAll: n, stations: stIds.size, stationNames: Array.from(stIds.keys()), users: st.users || [], k0: kMin, k1: kMax, nDays,
      win: { k0: kb0, k1: kb1, weeks, days: kb1 - kb0 + 1, all: kb0 === kMin && kb1 === kMax, common: !!br }, openDays: dowDays.reduce((a, b) => a + b, 0), allDays: dayRec.length, dowDays,
      stats: st, typeCount, typeCountAll, abandons: AB.length, svc0, svc: svc0, over: {}, inferred: null, heat: null, heatDone, heatT: null, sHeat, dayRec, docsPerVisit: (st.ok - AB.length) / Math.max(1, n),
      _cfg: Object.assign({}, cfg, { abandons: null }), _ab: AB,
      _w: { soj, wq, meas, wSum, wN, sSum, sN, arr, abn, pres, pos, done, dayTot, dayOpen, dayLast } };
    MS.effective(area);
    return area;
  };
  // Huella del documento → hora de registro, para enlazar con el área siguiente (se arma solo si hace falta; periodo base y un día antes)
  MS.docMapOf = (area) => {
    if (area._docMap) return area._docMap;
    const V = area.V, m = new Map(); const k0 = area.win ? area.win.k0 - 1 : -Infinity, k1 = area.win ? area.win.k1 : Infinity;
    if (V.doc || V.xdoc.size) for (let i = 0; i < V.n; i++) { const k = Math.floor(V.t[i] / 1440); if (k < k0 || k > k1) continue; for (const hsh of docsOf(V.doc, V.xdoc, i)) m.set(hsh, V.t[i]); }
    return (area._docMap = m);
  };
  // Cambia el periodo base de un área ya leída (semanas; 0 = todo el periodo; range: {k0, k1} explícito, el común de las áreas).
  // Devuelve un área nueva: hay que volver a medir el proceso
  MS.rebase = (area, weeks, range) => MS.summarizeArea(area.V, area.labels, new Map(area.stationNames.map((n, i) => [n, i])), area.stats, Object.assign({}, area._cfg, { baseWeeks: weeks, baseRange: range || null, abandons: area._ab }));
  // Fechas de cada área y periodo en que coinciden. El modelo usa las mismas semanas en todas las áreas: las últimas `weeks` semanas
  // que terminan en el último día que todas tienen datos. Lo que un archivo trae fuera de ese periodo se usa solo para las temporadas.
  MS.coverage = (areas, weeks) => {
    const list = areas.map((a) => ({ k0: a.k0, k1: a.k1, days: a.allDays }));
    const k0 = Math.max(...list.map((x) => x.k0)), k1 = Math.min(...list.map((x) => x.k1));
    const ok = k1 >= k0, wk = weeks != null ? Math.max(0, +weeks || 0) : MS.BASE_WEEKS;
    const base = ok ? { k0: wk > 0 ? Math.max(k0, k1 - wk * 7 + 1) : k0, k1 } : null;
    return { list, common: { k0, k1, ok, days: ok ? k1 - k0 + 1 : 0 }, base, weeks: wk, same: list.every((x) => x.k0 === list[0].k0 && x.k1 === list[0].k1) };
  };
  // Lleva todas las áreas al periodo base común (solo vuelve a resumir las que tienen otro periodo)
  MS.alignAreas = (areas, weeks) => {
    const cover = MS.coverage(areas, weeks);
    if (!cover.base) return { areas, cover };
    const b = cover.base;
    return { areas: areas.map((a) => (a.win && a.win.k0 === b.k0 && a.win.k1 === b.k1 && a.win.weeks === cover.weeks ? a : MS.rebase(a, cover.weeks, areas.length > 1 ? b : null))), cover };
  };
  // Hora de llegada de cada cliente: la del turno si existe; si no, el inicio de la atención; si no, el registro menos la atención media
  // vigente de su tipo (el registro marca la salida: la salida es la llegada desplazada por el tiempo en el sistema, Burke, 1956).
  // Se recalcula cuando cambia la atención (inferida o medida con cronómetro), para que las llegadas por hora usen el mejor dato.
  function binArrivals(area) {
    const W = area._w, nT = area.labels.length, nDays = area.nDays, z24 = () => new Float64Array(24);
    const arr = U.range(nDays, z24), arrT = U.range(nT, () => U.range(nDays, z24));
    const means = area.svc.map((s) => (s ? s.mean : NaN)); const fin = means.filter((x) => isFinite(x));
    const meanAll = fin.length ? U.mean(fin) : 3;
    const shiftOf = U.range(nT, (t) => Math.min(15, isFinite(means[t]) ? means[t] : meanAll));
    // Horario de atención de cada día de la semana (mediana de los días, redondeada a 15 min): desde el inicio de la primera sesión
    // hasta el último registro menos una atención. La llegada estimada se acota a ese horario: nadie llega antes de abrir ni después
    // de cerrar (sin esto, quien llegó al abrir o esperó al cierre aparece en una hora en la que no se atiende).
    const r15 = (x) => Math.round(x / 15) * 15;
    const d0 = area.win ? area.win.k0 - area.k0 : 0, d1 = area.win ? area.win.k1 - area.k0 : nDays - 1; // días del periodo base
    const openW = U.range(7, () => []), closeW = U.range(7, () => []);
    for (let d = d0; d <= d1; d++) if (W.dayTot[d] && W.dayOpen && isFinite(W.dayOpen[d]) && isFinite(W.dayLast[d])) { const k = area.k0 + d, w = U.dayInfo(k).dow; openW[w].push(W.dayOpen[d] - k * 1440); closeW[w].push(W.dayLast[d] - meanAll - k * 1440); }
    const win = U.range(7, (w) => (openW[w].length ? [r15(U.median(openW[w])), r15(U.median(closeW[w]))] : null));
    area.hours = win.map((x) => (x && x[1] > x[0] ? { open: x[0], close: x[1] } : null));
    const V = area.V, VT = V.t, VY = V.ty, VI = V.ini, VL = V.lle;
    const dowOf = U.range(nDays, (d) => U.dayInfo(area.k0 + d).dow);
    for (let i = 0; i < V.n; i++) {
      const t = VT[i], ty = VY[i], lle = VL ? VL[i] : NaN, ini = VI ? VI[i] : NaN;
      let ta;
      if (isFinite(lle)) ta = lle; else if (isFinite(ini)) ta = ini;
      else {
        ta = t - shiftOf[ty];
        const k = Math.floor(t / 1440), x = area.hours[dowOf[k - area.k0]];
        if (x) ta = Math.min(t, U.clamp(ta, k * 1440 + x.open, k * 1440 + x.close - 0.01));
      }
      const p = W.pos(ta); if (p.d < 0 || p.d >= nDays) continue;
      arr[p.d][p.hh]++; arrT[ty][p.d][p.hh]++;
    }
    const heat = U.range(7, () => new Array(24).fill(0)), heatT = U.range(nT, () => U.range(7, () => new Array(24).fill(0)));
    for (let d = d0; d <= d1; d++) {
      if (!W.dayTot[d]) continue; const w = U.dayInfo(area.k0 + d).dow;
      for (let hh = 0; hh < 24; hh++) { heat[w][hh] += arr[d][hh]; for (let t = 0; t < nT; t++) heatT[t][w][hh] += arrT[t][d][hh]; }
    }
    for (let w = 0; w < 7; w++) if (area.dowDays[w]) for (let hh = 0; hh < 24; hh++) { heat[w][hh] /= area.dowDays[w]; for (let t = 0; t < nT; t++) heatT[t][w][hh] /= area.dowDays[w]; }
    area.heat = heat; area.heatT = heatT; W.arr = arr;
    area.dayRec.forEach((r) => { r.types = U.range(nT, (t) => { let s = 0; for (let hh = 0; hh < 24; hh++) s += arrT[t][r.d][hh]; return s; }); });
  }

  // Tiempo de atención vigente por tipo: datos → inferencia → lo que indicó el usuario; recalcula espera y conjunto de datos
  MS.effective = (area) => {
    const nT = area.labels.length;
    const base = area.svc0.map((s, t) => (area.inferred && area.inferred[t] ? area.inferred[t] : s));
    let ref = null;
    const out = base.map((s, t) => {
      const o = area.over && area.over[t];
      if (!(o && o.mean > 0)) return s;
      const b = s || { n: 0, mean: o.mean, median: o.mean, p25: o.mean * 0.7, p75: o.mean * 1.3, cv: o.cv || 0.6, sample: [o.mean] };
      const r = scaleStats(b, o.mean, o.src || 'indicado', { cv: o.cv > 0 ? o.cv : b.cv, n: o.n || b.n });
      if (o.sample && o.sample.length >= 8) { const sr = statsRaw(o.sample); Object.assign(r, sr, { method: o.src || 'cronometrado', cv: isFinite(sr.cv) && sr.cv > 0 ? sr.cv : r.cv }); }
      if (s && s.gapMean != null && (!ref || (o.n || 0) > ref.n)) ref = { gap: s.gapMean, mean: r.mean, n: o.n || 0 };
      return r;
    });
    // con un dato conocido se ajustan los máximos de los demás tipos: intervalo = atención + tiempo libre común
    if (ref) {
      const idle = Math.max(0, ref.gap - ref.mean);
      out.forEach((s, t) => { if (s && s.method === 'maximo' && s.gapMean != null) out[t] = scaleStats(s, Math.max(0.3 * s.gapMean, s.gapMean - idle), 'ajustado'); });
    }
    area.svc = out;
    const tot = area.typeCount.reduce((a, b) => a + b, 0) || 1;
    area.svcSample = []; out.forEach((s, i) => { if (s) { const take = Math.round(area.typeCount[i] / tot * 4000); for (let j = 0; j < take; j++) area.svcSample.push(s.sample[j % s.sample.length]); } });
    area.quality = MS.qualityOf(area);
    binArrivals(area);
    buildDataset(area);
    return out;
  };
  MS.setOverride = (area, ti, o) => { area.over = area.over || {}; if (o && o.mean > 0) area.over[ti] = o; else delete area.over[ti]; MS.effective(area); };
  // Calidad del tiempo de atención del área: 'medido' | 'inferido' | 'ajustado' | 'maximo'
  MS.qualityOf = (area) => {
    const ms = area.svc.filter(Boolean).map((s) => s.method);
    if (!ms.length) return 'sin dato';
    if (ms.every((m) => m === 'medido' || m === 'cronometrado')) return 'medido';
    if (ms.some((m) => m === 'maximo')) return 'maximo';
    if (ms.some((m) => m === 'ajustado' || m === 'indicado')) return 'ajustado';
    return 'inferido';
  };
  MS.METHOD = {
    medido: ['Medido', 'good', 'Con la hora de inicio de cada atención.'],
    cronometrado: ['Cronometrado', 'good', 'Con la muestra cronometrada que cargaste.'],
    inferido: ['Inferido de los documentos', 'good', 'Se simularon las llegadas reales a esta área (hora del documento anterior) hasta reproducir el tiempo entre documentos.'],
    'por diferencia': ['Inferido por diferencia', 'info', 'Este tipo no tiene documento relacionado: se obtuvo por su diferencia de intervalos con un tipo inferido.'],
    indicado: ['Indicado por ti', 'info', 'El promedio que escribiste.'],
    ajustado: ['Ajustado con tu dato', 'info', 'Máximo probable corregido con el promedio conocido de otro tipo: intervalo = atención + tiempo libre común.'],
    maximo: ['Máximo probable', 'warn', 'Solo hay hora de emisión: el intervalo entre transacciones seguidas incluye tiempo libre del punto, así que el valor real es menor. Escribe un promedio conocido o carga una muestra cronometrada.']
  };
  // Conjunto de datos del área en el formato del asistente (llegadas por hora = visitas + abandonos)
  function buildDataset(area) {
    const W = area._w, nT = area.labels.length, nDays = area.nDays, z24 = () => new Float64Array(24);
    const wq = W.wq.map((a) => a.slice()); const wSum = W.wSum.map((a) => Float64Array.from(a)), wN = W.wN.map((a) => Float64Array.from(a));
    W.soj.forEach((list, ti) => { const m = area.svc[ti] ? area.svc[ti].mean : NaN; if (!isFinite(m)) return; for (const o of list) { const w = Math.max(0, o.w - m); wq[ti].push(w); const p = W.pos(o.t); if (p.d >= 0 && p.d < nDays) { wSum[p.d][p.hh] += w; wN[p.d][p.hh]++; } } });
    area.waitHeat = U.range(7, () => new Array(24).fill(NaN));
    { const sw = U.range(7, () => new Array(24).fill(0)), nw = U.range(7, () => new Array(24).fill(0));
      for (let d = 0; d < nDays; d++) { const dw = U.dayInfo(area.k0 + d).dow; for (let hh = 0; hh < 24; hh++) { sw[dw][hh] += wSum[d][hh]; nw[dw][hh] += wN[d][hh]; } }
      for (let w = 0; w < 7; w++) for (let hh = 0; hh < 24; hh++) if (nw[w][hh] >= 5) area.waitHeat[w][hh] = sw[w][hh] / nw[w][hh]; }
    area.wait = area.labels.map((l, i) => { if (wq[i].length < 8) return null; const s = U.sortedCopy(wq[i]); return { n: s.length, mean: U.mean(s), p50: U.quantileSorted(s, 0.5), p90: U.quantileSorted(s, 0.9), method: W.soj[i].length > wq[i].length / 2 ? 'aproximada' : 'medida' }; });
    const days = []; let hasSvc = false, hasWq = false, hasAb = false;
    for (let d = 0; d < nDays; d++) {
      const a24 = Float64Array.from(W.arr[d], (x, hh) => x + W.abn[d][hh]);
      let tot = 0; for (let hh = 0; hh < 24; hh++) tot += a24[hh]; if (!tot) continue;
      const k = area.k0 + d; const inf = U.dayInfo(k);
      const srvSum = z24(), srvN = z24(); for (let hh = 0; hh < 24; hh++) if (W.pres[d][hh] > 0.05) { srvSum[hh] = W.pres[d][hh]; srvN[hh] = 1; }
      for (let hh = 0; hh < 24; hh++) { if (W.sN[d][hh]) hasSvc = true; if (wN[d][hh]) hasWq = true; if (W.abn[d][hh]) hasAb = true; }
      days.push({ k, arr: a24, tot, svcSum: W.sSum[d], svcN: W.sN[d], wqSum: wSum[d], wqN: wN[d], ab: W.abn[d], srvSum, srvN, sales: z24(), hourly: true, y: inf.y, m: inf.m, d: inf.d, dow: inf.dow, doy: inf.doy, dim: inf.dim });
    }
    const allMeas = [].concat(...W.meas);
    area.ds = { kind: 'trans', days, byK: new Map(days.map((x) => [x.k, x])), k0: area.k0, k1: area.k1, has: { svc: hasSvc, wq: hasWq, ab: hasAb, srv: true, sales: false, hourly: true },
      stats: { rows: area.stats.rows, ok: area.stats.ok, bad: area.stats.bad, reasons: area.stats.reasons }, samples: { svc: hasSvc ? thin(allMeas, 25000) : [], ia: [], wq: thin([].concat(...wq), 25000), ab: [] },
      iaCtx: [], classes: {}, nServers: area.stations, source: area.name };
  }

  /* ======================= proceso completo ======================= */
  // Mínimos cuadrados no negativos por descenso de coordenadas (sistemas pequeños)
  MS.nnls = (A, b, iters = 5000) => {
    const m = A.length, n = A[0].length; const x = new Array(n).fill(0);
    const AtA = U.range(n, (i) => U.range(n, (j) => { let s = 0; for (let r = 0; r < m; r++) s += A[r][i] * A[r][j]; return s; }));
    const Atb = U.range(n, (i) => { let s = 0; for (let r = 0; r < m; r++) s += A[r][i] * b[r]; return s; });
    for (let it = 0; it < iters; it++) {
      let delta = 0;
      for (let j = 0; j < n; j++) {
        if (!(AtA[j][j] > 0)) continue;
        let g = Atb[j]; for (let k = 0; k < n; k++) if (k !== j) g -= AtA[j][k] * x[k];
        const nx = Math.max(0, g / AtA[j][j]); delta = Math.max(delta, Math.abs(nx - x[j])); x[j] = nx;
      }
      if (delta < 1e-9) break;
    }
    return x;
  };
  // Volumen de cada flujo y enlace entre áreas consecutivas. Se cuentan solo los días del periodo base en que TODAS las áreas tienen
  // movimiento: si a un archivo le faltan días (o termina antes), esos días no se cuentan en ninguna área y los flujos no se sesgan.
  MS.combine = (proc, areas) => {
    const A = [], b = [], rowsInfo = [];
    const k0 = Math.max(...areas.map((a) => (a.win ? a.win.k0 : a.k0))), k1 = Math.min(...areas.map((a) => (a.win ? a.win.k1 : a.k1)));
    let both = null;
    if (k1 >= k0) {
      const sets = areas.map((a) => { const s = new Set(); a.dayRec.forEach((r) => { if (r.k >= k0 && r.k <= k1) s.add(r.k); }); return s; });
      both = new Set(); sets[0].forEach((k) => { if (sets.every((s) => s.has(k))) both.add(k); });
      if (!both.size) both = null;
    }
    const common = !!both;
    const inDays = (t) => !common || both.has(Math.floor(t / 1440));
    proc.areas.forEach((ar, ai) => {
      const res = areas[ai];
      ar.types.forEach((ty, ti) => {
        let n = 0;
        const V = res.V, W = res.wIdx; for (let j = 0; j < W.length; j++) { const i = W[j]; if (V.ty[i] === ti && inDays(V.t[i])) n++; }
        const row = proc.flows.map((f) => (f.steps[ai] === ty ? 1 : 0));
        if (row.some(Boolean)) { A.push(row); b.push(n); rowsInfo.push({ area: ar.name, ai, type: ty, ti, n }); }
      });
    });
    const days = common ? both.size : 1;
    const v = A.length ? MS.nnls(A, b) : proc.flows.map(() => 0);
    const fit = rowsInfo.map((r, i) => Object.assign(r, { model: A[i].reduce((s, a, j) => s + a * v[j], 0) }));
    const totalV = v.reduce((a, c) => a + c, 0) || 1;
    const flows = proc.flows.map((f, j) => ({ name: f.name, steps: f.steps, volume: v[j], perDay: v[j] / days, share: v[j] / totalV }));
    const fitErr = fit.length ? Math.max(...fit.map((r) => (r.n > 0 ? Math.abs(r.model - r.n) / r.n : 0))) : 0;
    // Enlace: el documento relacionado de cada visita (por ejemplo, la factura que paga el REC) se busca entre los documentos del área
    // anterior; con él se mide el tiempo de un documento al otro. Por tipo: cuántos traen relacionado, cuántos encontraron su documento
    // (0 a 240 min antes), cuántos no lo encontraron (otro periodo, otro formato o un crédito antiguo) y cuántos lo encontraron fuera de ese rango.
    const links = [], linkStats = [];
    for (let ai = 1; ai < areas.length; ai++) {
      const VB = areas[ai].V, WB = areas[ai].wIdx; if (!VB.rel && !VB.xrel.size) continue;
      const prev = MS.docMapOf(areas[ai - 1]);
      const per = U.range(proc.areas[ai].types.length, () => ({ n: 0, withRel: 0, matched: 0, notFound: 0, outRange: 0, d: [] }));
      for (let j = 0; j < WB.length; j++) {
        const i = WB[j]; if (!inDays(VB.t[i])) continue; const p = per[VB.ty[i]]; p.n++;
        const rels = docsOf(VB.rel, VB.xrel, i); if (!rels.length) continue; p.withRel++;
        let tPrev = null; for (const r of rels) if (prev.has(r)) { tPrev = prev.get(r); break; }
        if (tPrev == null) { p.notFound++; continue; }
        const d = VB.t[i] - tPrev; if (d >= 0 && d <= 240) { p.matched++; p.d.push(d); } else p.outRange++;
      }
      const byType = proc.areas[ai].types.map((ty, ti) => { const p = per[ti], s = U.sortedCopy(p.d);
        return { type: ty, ti, n: p.n, withRel: p.withRel, matched: p.matched, notFound: p.notFound, outRange: p.outRange, expected: proc.flows.some((f) => f.steps[ai] === ty && f.steps[ai - 1]),
          mean: s.length ? U.mean(s) : NaN, median: s.length ? U.quantileSorted(s, 0.5) : NaN, p90: s.length ? U.quantileSorted(s, 0.9) : NaN, sample: thin(Array.from(s), 4000) }; });
      const ls = { ai, from: proc.areas[ai - 1].name, to: proc.areas[ai].name, matched: byType.reduce((s, x) => s + x.matched, 0), withRel: byType.reduce((s, x) => s + x.withRel, 0),
        total: byType.reduce((s, x) => s + x.n, 0), prevDocs: prev.size, byType };
      linkStats.push(ls);
      if (ls.matched >= 30) links.push(ls);
    }
    return { flows, fit, fitErr, links, linkStats, days, period: common ? [k0, k1] : null };
  };

  /* Atención en un área posterior a partir del tiempo entre documentos (inferencia indirecta con llegadas reales):
     los clientes enlazados llegan a la hora de su documento anterior más el traslado; los demás (sin documento relacionado) llegan
     una atención y su espera antes de su registro: esa espera se ajusta en cada iteración para que, en la simulación, terminen a la
     hora real en que se registraron (llegadas autoconsistentes). Se ajusta la atención de cada tipo enlazado hasta que los cuartiles
     del tiempo simulado entre documentos coinciden con los reales. */
  MS.inferLinks = async (proc, areas, ai, o = {}) => {
    const B = areas[ai], A = areas[ai - 1]; const docA = A ? MS.docMapOf(A) : null; if (!docA || !docA.size) return null;
    const nT = B.labels.length, walk = Math.max(0, o.walk != null ? +o.walk : (proc.walk != null ? +proc.walk : 0.5));
    const linkOf = new Map();
    const VB = B.V, VT = VB.t, VY = VB.ty, WB = B.wIdx;
    for (let j = 0; j < WB.length; j++) { const i = WB[j]; for (const r of docsOf(VB.rel, VB.xrel, i)) { const tA = docA.get(r); if (tA != null && VT[i] - tA >= 0 && VT[i] - tA <= 240) { linkOf.set(i, tA); break; } } }
    const realL = U.range(nT, () => []); for (const [i, tA] of linkOf) realL[VY[i]].push(VT[i] - tA);
    const Q = [0.25, 0.5, 0.75];
    const qs = (a) => { const s = U.sortedCopy(a); return Q.map((p) => U.quantileSorted(s, p)); };
    const realQ = realL.map((a) => (a.length >= 30 ? qs(a) : null));
    const linkTypes = U.range(nT, (t) => t).filter((t) => realQ[t]);
    if (!linkTypes.length) return null;
    const gapM = B.svc0.map((s) => (s ? (s.gapMean != null ? s.gapMean : s.mean) : NaN));
    const measured = B.svc0.map((s) => !!(s && s.method === 'medido'));
    const m = U.range(nT, (t) => (measured[t] ? B.svc0[t].mean : realQ[t] ? Math.max(0.2, realQ[t][1] - walk) : NaN));
    let cv = U.clamp(U.mean(B.svc0.filter(Boolean).map((s) => s.cv)) || 0.6, 0.25, 1.2);
    const ref = linkTypes.reduce((best, t) => (realL[t].length > realL[best].length ? t : best), linkTypes[0]);
    const fillUnlinked = () => { const idle = Math.max(0, gapM[ref] - m[ref]); for (let t = 0; t < nT; t++) if (!realQ[t] && !measured[t]) m[t] = isFinite(gapM[t]) ? Math.max(0.3 * gapM[t], gapM[t] - idle) : m[ref]; };
    fillUnlinked();
    // días de muestra repartidos entre los más tranquilos y los más cargados (solo días con datos en el área anterior: ahí hay enlaces)
    const byDay = new Map(); for (let j = 0; j < WB.length; j++) { const i = WB[j]; const k = Math.floor(VT[i] / 1440); if (!byDay.has(k)) byDay.set(k, []); byDay.get(k).push(i); }
    const aDays = new Set(A.dayRec.map((r) => r.k)); let keys = Array.from(byDay.keys()).filter((k) => aDays.has(k)); if (!keys.length) keys = Array.from(byDay.keys());
    keys.sort((a, b) => byDay.get(a).length - byDay.get(b).length);
    const N = Math.min(o.days || 30, keys.length);
    const pick = Array.from(new Set(U.range(N, (i) => keys[Math.round(i * (keys.length - 1) / Math.max(1, N - 1))])));
    const actByK = new Map(B.dayRec.map((r) => [r.k, r.act]));
    let simL = null, hist = [];
    const shiftU = new Map(); const keyOf = (ty, t) => ty + ':' + Math.floor((t % 1440) / 60); // espera estimada de los no enlazados por tipo y hora
    const iters = o.iters || 12;
    let best = { err: Infinity };
    for (let it = 0; it < iters; it++) {
      simL = U.range(nT, () => []); const late = new Map(); const mUsed = m.slice(), cvUsed = cv;
      for (let di = 0; di < pick.length; di++) {
        const k = pick[di], idx = byDay.get(k), act = actByK.get(k) || new Array(24).fill(1);
        const recs = idx.map((i) => { const ty = VY[i], t = VT[i]; const tA = linkOf.get(i);
          return tA != null ? { ty, a: tA + walk, tA, tB: t, linked: true } : { ty, a: t - m[ty] - (shiftU.get(keyOf(ty, t)) || 0), tB: t, linked: false }; });
        let tmin = Infinity, tmax = -Infinity; for (const r of recs) { if (r.a < tmin) tmin = r.a; if (r.a > tmax) tmax = r.a; }
        const h0 = Math.max(0, Math.floor((tmin - k * 1440) / 60)); const base = k * 1440 + h0 * 60;
        const hours = Math.max(1, Math.ceil((tmax - base) / 60));
        const trace = recs.map((r, j) => [Math.max(0, r.a - base), r.ty, j]).sort((a, b) => a[0] - b[0]);
        const spec = QS.Sim.normalize({ open: h0 * 60, arrivals: { mode: 'trace', trace },
          classes: U.range(nT, (t) => ({ name: 't' + t, share: 1, prio: 1, svcMult: Math.max(0.05, m[t] || 1) })),
          stages: [{ name: 'B', servers: 1, useSchedule: true, schedule: U.range(hours, (i) => Math.max(1, Math.round(act[Math.min(23, h0 + i)] || 0))), queue: proc.areas[ai].queue || 'single', svc: { type: 'gamma', mean: 1, sd: cv } }],
          run: { hours, warmupH: 0, drain: true, slT: 5 } });
        const sim = new QS.Sim(spec, 'lnk-' + di, { keepWaits: false, onEvent: (type, c, v, S) => {
          if (type !== 'end' || c.tag == null) return; const r = recs[c.tag]; const done = base + S.t;
          if (r.linked) simL[c.k].push(done - r.tA);
          else { const key = keyOf(r.ty, r.tB); const x = late.get(key) || [0, 0]; x[0] += done - r.tB; x[1]++; late.set(key, x); }
        } });
        sim.runAll();
      }
      for (const [key, x] of late) shiftU.set(key, Math.max(0, (shiftU.get(key) || 0) + x[0] / x[1]));
      let err = 0, cvNum = 0, cvDen = 0;
      for (const t of linkTypes) {
        if (simL[t].length < 10) continue;
        const sq = qs(simL[t]);
        if (!measured[t]) {
          const r = (realQ[t].reduce((a, x) => a + Math.max(0.05, x - walk), 0)) / (sq.reduce((a, x) => a + Math.max(0.05, x - walk), 0));
          err = Math.max(err, Math.abs(r - 1)); m[t] = U.clamp(m[t] * Math.pow(U.clamp(r, 0.5, 2), 0.6), 0.1, 120); // paso amortiguado
        }
        const ri = (realQ[t][2] - realQ[t][0]) / Math.max(0.01, sq[2] - sq[0]); cvNum += ri * realL[t].length; cvDen += realL[t].length;
      }
      if (cvDen > 0) { const rc = cvNum / cvDen; err = Math.max(err, Math.abs(rc - 1) * 0.5); cv = U.clamp(cv * Math.pow(U.clamp(rc, 0.7, 1.4), 0.6), 0.2, 1.4); }
      if (err < best.err) best = { err, m: mUsed, cv: cvUsed, simL };
      fillUnlinked();
      hist.push(err);
      if (o.onProgress) o.onProgress((it + 1) / iters);
      await U.tick();
      if (err < 0.01) break;
    }
    // se conserva la iteración con menor error (la última puede no ser la mejor si la ocupación es muy alta)
    for (let t = 0; t < nT; t++) m[t] = best.m[t]; cv = best.cv; simL = best.simL; fillUnlinked();
    B.inferred = U.range(nT, (t) => {
      if (measured[t]) return null;
      const base = B.svc0[t] || { n: 0, mean: m[t], median: m[t], p25: m[t] * 0.7, p75: m[t] * 1.3, cv, sample: [m[t]] };
      if (!isFinite(m[t])) return null;
      return scaleStats(base, m[t], realQ[t] ? 'inferido' : 'por diferencia', { cv, n: realQ[t] ? realL[t].length : base.n });
    });
    B.linkFit = { walk, iters: hist.length, err: best.err, converged: best.err <= 0.03, cv, types: linkTypes.map((t) => ({ ti: t, type: B.labels[t], n: realL[t].length, realQ: realQ[t], simQ: simL[t].length ? qs(simL[t]) : null,
      real: thin(realL[t].slice(), 3000), sim: thin(simL[t].slice(), 3000), waitMean: Math.max(0, U.mean(realL[t]) - walk - m[t]) })) };
    MS.effective(B);
    return B.linkFit;
  };
  // Las áreas no tienen ni un día en común: no se pueden medir los flujos ni el enlace entre documentos
  MS.noCommonMsg = (proc, cover) => `Los datos de las áreas no tienen fechas en común (${proc.areas.map((ar, i) => `${ar.name.split(':')[0]}: del ${U.fmtDay(cover.list[i].k0)} al ${U.fmtDay(cover.list[i].k1)}`).join('; ')}). Sube los datos de todas las áreas del mismo periodo.`;
  // Medición completa del proceso. Antes, todas las áreas pasan al periodo base común (las mismas semanas en todas); el arreglo `areas`
  // se actualiza con las áreas alineadas.
  MS.measureProcess = async (proc, areas, o = {}) => {
    if (areas.length > 1) {
      const al = MS.alignAreas(areas, o.baseWeeks != null ? o.baseWeeks : areas[0].win ? areas[0].win.weeks : MS.BASE_WEEKS);
      if (!al.cover.common.ok) throw new Error(MS.noCommonMsg(proc, al.cover));
      al.areas.forEach((a, i) => { areas[i] = a; });
    }
    const comb = MS.combine(proc, areas);
    for (const l of comb.links) { try { await MS.inferLinks(proc, areas, l.ai, o); } catch (e) { console.error(e); } }
    return comb;
  };

  // Llegadas por hora de cada flujo para un día de la semana: cada flujo entra por su primera área, con el patrón horario de su transacción de entrada
  MS.flowProfiles = (proc, areas, comb, dow) => proc.flows.map((f, j) => {
    const prof = new Array(24).fill(0);
    const ai = f.steps.findIndex(Boolean); if (ai < 0) return prof; const ty = f.steps[ai]; const ti = proc.areas[ai].types.indexOf(ty);
    const same = proc.flows.map((g, jj) => (g.steps.findIndex(Boolean) === ai && g.steps[ai] === ty ? comb.flows[jj].volume : 0)).reduce((a, c) => a + c, 0);
    const frac = same > 0 ? comb.flows[j].volume / same : 0;
    for (let hh = 0; hh < 24; hh++) prof[hh] = areas[ai].heatT[ti][dow][hh] * frac;
    return prof;
  });
  MS.arrivalProfile = (proc, areas, comb, dow) => { const fp = MS.flowProfiles(proc, areas, comb, dow); return U.range(24, (hh) => fp.reduce((s, p) => s + p[hh], 0)); };
  // Tipos de día medidos en los datos, por flujo: días de pago (quincena), día cargado (P75) y muy cargado (P90).
  // Razón de cada día contra el promedio de su día de la semana (Whitt, 2006: planear con incertidumbre en la tasa de llegada).
  MS.dayFactors = (proc, areas, o = {}) => {
    const pay = new Set((o.payDays || [1, 2, 15, 16, -1, -2]).map(Number));
    const isPay = (k) => { const i = U.dayInfo(k); return pay.has(i.d) || pay.has(i.d - i.dim - 1); };
    // Cada día se compara con el promedio del mismo día de la semana en las 4 semanas anteriores y posteriores (sin contarse a sí mismo):
    // así se quitan la tendencia y la temporada y queda la variación entre días y el efecto de los días de pago. Últimos 2 años.
    return proc.flows.map((f) => {
      const ai = f.steps.findIndex(Boolean); const a = areas[ai]; const ti = proc.areas[ai].types.indexOf(f.steps[ai]);
      const kFrom = a.k1 - (o.years || 2) * 364;
      const byDow = U.range(7, () => []); a.dayRec.forEach((r) => { if (r.k >= kFrom - 28) byDow[U.dayInfo(r.k).dow].push(r); });
      const ratios = [], payR = [], other = [];
      byDow.forEach((list) => {
        for (let i = 0; i < list.length; i++) {
          const r = list[i]; if (r.k < kFrom) continue;
          let s = 0, n = 0;
          for (let j = i - 4; j <= i + 4; j++) { if (j === i || j < 0 || j >= list.length || Math.abs(list[j].k - r.k) > 28) continue; s += list[j].types[ti]; n++; }
          if (n < 3 || !(s > 0)) continue;
          const x = r.types[ti] / (s / n); ratios.push(x); (isPay(r.k) ? payR : other).push(x);
        }
      });
      const q = (pp) => (ratios.length >= 10 ? U.quantile(ratios, pp) : 1);
      return { name: f.name, n: ratios.length, p75: q(0.75), p90: q(0.9), payday: payR.length >= 3 ? U.mean(payR) : 1, normal: other.length >= 3 ? U.mean(other) : 1, payN: payR.length };
    });
  };
  MS.DAY_TYPES = [['promedio', 'Día típico (promedio)'], ['normal', 'Día normal (sin pago)'], ['pago', 'Día de pago o quincena'], ['p75', 'Día cargado (P75)'], ['p90', 'Día muy cargado (P90)']];
  // Factor de demanda de cada flujo para un tipo de día
  MS.flowFactors = (factors, type) => factors.map((f) => (type === 'pago' ? f.payday : type === 'normal' ? f.normal : type === 'p75' ? f.p75 : type === 'p90' ? f.p90 : 1));
  // Atención promedio por área (mezcla real de tipos)
  MS.areaService = (area) => {
    const st = area.svc.map((s, ti) => (s ? { m: s.mean, cv: s.cv, w: area.typeCount[ti] } : null)).filter(Boolean);
    const W = st.reduce((x, s) => x + s.w, 0) || 1;
    return { m: st.reduce((x, s) => x + s.m * s.w, 0) / W || 3, cv: U.clamp(st.reduce((x, s) => x + s.cv * s.w, 0) / W || 0.8, 0.2, 1.6) };
  };
  // Escenario de simulación del proceso completo para un día de la semana.
  // o: {demand (factor), svc [factor por área], extra [personas por área], sched [horario por área], queue [por área], reps, slT, seed, abandon}
  MS.buildSpec = (proc, areas, comb, dow, o = {}) => {
    const dem = o.demand > 0 ? o.demand : 1;
    const ff = (j) => (o.flowDemand && o.flowDemand[j] > 0 ? o.flowDemand[j] : 1);
    const fprof = MS.flowProfiles(proc, areas, comb, dow).map((p, j) => p.map((x) => x * dem * ff(j)));
    const prof = U.range(24, (hh) => fprof.reduce((a, p) => a + p[hh], 0));
    let h0 = 24, h1 = 0; for (let hh = 0; hh < 24; hh++) if (prof[hh] > 0.2) { h0 = Math.min(h0, hh); h1 = Math.max(h1, hh + 1); }
    if (h1 <= h0) { h0 = 9; h1 = 18; }
    const hours = h1 - h0;
    const base = areas.map((a) => MS.areaService(a));
    const stages = proc.areas.map((ar, ai) => {
      const extra = o.extra && o.extra[ai] ? Math.round(o.extra[ai]) : 0;
      const given = o.sched && o.sched[ai];
      const day = o.schedDay && o.schedDay[ai]; // personal por hora del día (0 a 23), por ejemplo el que indicó el usuario
      const sch = U.range(hours, (i) => {
        const v = given ? (given[i] != null ? given[i] : given[given.length - 1]) : day ? (day[h0 + i] || 0) : Math.round(areas[ai].sHeat[dow][h0 + i] || 0);
        return Math.max(1, Math.round(v) + extra);
      });
      const f = o.svc && o.svc[ai] > 0 ? o.svc[ai] : 1;
      const bm = base[ai]; const m = bm.m * f;
      const svc = Math.abs(bm.cv - 1) < 0.08 ? { type: 'exp', mean: +m.toFixed(3) } : { type: 'gamma', mean: +m.toFixed(3), sd: +(m * bm.cv).toFixed(3) };
      return { name: ar.name, servers: Math.max(...sch), svc, queue: (o.queue && o.queue[ai]) || ar.queue || 'single', useSchedule: true, schedule: sch, disc: 'FIFO' };
    });
    const keep = [];
    const classes = proc.flows.map((f, j) => ({
      name: f.name, share: +(comb.flows[j].share * ff(j) * 100).toFixed(2), prio: 1, patMult: 1, svcMult: 1,
      visits: f.steps.map(Boolean),
      svcMults: f.steps.map((ty, ai) => { if (!ty) return 1; const ti = proc.areas[ai].types.indexOf(ty); const s = areas[ai].svc[ti]; return s ? +(s.mean / base[ai].m).toFixed(3) : 1; })
    })).filter((c, j) => { const ok = c.share > 0.01; if (ok) keep.push(j); return ok; });
    const dayName = o.dayType && o.dayType !== 'promedio' ? (MS.DAY_TYPES.find((d) => d[0] === o.dayType) || [0, ''])[1].toLowerCase() : 'típico';
    const spec = { name: `${o.name || proc.name}: ${U.DIAS_L[dow].toLowerCase()} ${dayName}${dem !== 1 ? ` (demanda ${dem > 1 ? '+' : '−'}${Math.round(Math.abs(dem - 1) * 100)} %)` : ''}`, open: h0 * 60,
      terms: { server: 'punto', servers: 'Puntos de atención', customer: 'cliente' },
      arrivals: { mode: 'profile', profile: U.range(hours, (i) => +prof[h0 + i].toFixed(2)), byClass: keep.map((j) => U.range(hours, (i) => +fprof[j][h0 + i].toFixed(3))) },
      classes, stages, run: { hours, warmupH: 0, reps: o.reps || 20, seed: o.seed || 101, drain: true, slT: o.slT || 5 } };
    // abandono medido (turnero): paciencia exponencial con media E[espera]/P(abandono) (Mandelbaum y Zeltyn, 2007)
    const pat = o.abandon === false ? null : MS.patience(areas);
    if (pat) spec.renege = { on: true, dist: { type: 'exp', mean: +pat.mean.toFixed(2) } };
    return QS.Sim.normalize(spec);
  };
  // Paciencia media estimada con los abandonos y la espera medidos en la primera área (θ = P(abandono) / E[espera])
  MS.patience = (areas) => {
    const a = areas[0]; if (!a || !a.abandons || !a.wait) return null;
    const w = a.wait.filter(Boolean); if (!w.length) return null;
    const n = w.reduce((x, y) => x + y.n, 0); const ew = w.reduce((x, y) => x + y.mean * y.n, 0) / Math.max(1, n);
    const pab = a.abandons / (a.abandons + a.nVis);
    if (!(pab > 0.002) || !(ew > 0)) return null;
    return { mean: U.clamp(ew / pab, 0.5, 240), pab, ew };
  };
  // Día de la semana con más clientes
  MS.busiestDow = (areas) => { const tot = U.range(7, (w) => areas.reduce((s, a) => s + a.heat[w].reduce((x, y) => x + y, 0), 0)); return tot.indexOf(Math.max(...tot)); };

  /* ======================= mediciones en tienda ======================= */
  // Estudio de tiempos con cronómetro (Kanawaty, 1992; Niebel y Freivalds, 2009): media, desviación, intervalo de confianza del 95 %
  // con t de Student y tamaño de muestra para una precisión relativa e: n = (z·CV / e)².
  MS.timeStudy = (xs, o = {}) => {
    const a = (xs || []).filter((x) => x > 0 && isFinite(x)); const n = a.length; const min = o.min || 30;
    if (!n) return { n: 0, min, ok: false, need: min };
    const mean = U.mean(a); const sd = n > 1 ? U.sd(a) : NaN; const cv = sd / mean;
    const hw = n > 1 ? U.tInv(0.975, n - 1) * sd / Math.sqrt(n) : NaN;
    const e = o.rel || 0.1; const need = Math.max(min, Math.ceil(Math.pow(1.96 * (isFinite(cv) ? cv : 0.6) / e, 2)));
    return { n, mean, sd, cv, hw, rel: hw / mean, need, min, ok: n >= min };
  };
  MS.MIN_SVC = 30; MS.MIN_WALK = 10; MS.USE_SVC = 10;
  const mKey = (ar, label) => ar.name + '|' + label;
  MS.measureKey = mKey;
  // Aplica las mediciones en tienda al modelo. meas: {svc: {'Área|Tipo': [min]}, typed: {'Área|Tipo': {mean, n}}, walk: [min], walkTyped: {mean, n}}
  // Atención: con 10 o más tiempos cronometrados se usa la muestra (media, variabilidad y distribución); si no, el promedio que indicó el usuario.
  // Traslado: promedio cronometrado (desde 3 tiempos; se considera medido con 10). Devuelve true si cambió el traslado
  // (hay que volver a inferir la atención del área siguiente).
  MS.applyMeasurements = (proc, areas, meas) => {
    meas = meas || {};
    areas.forEach((a, i) => {
      const ar = proc.areas[i]; if (!a) return;
      a.over = {};
      a.labels.forEach((l, t) => {
        const xs = ((meas.svc && meas.svc[mKey(ar, l)]) || []).filter((x) => x > 0);
        const typed = meas.typed && meas.typed[mKey(ar, l)];
        if (xs.length >= MS.USE_SVC) { const s = MS.timeStudy(xs); a.over[t] = { mean: s.mean, cv: s.cv, n: s.n, sample: xs.slice(), src: 'cronometrado' }; }
        else if (typed && typed.mean > 0) a.over[t] = { mean: +typed.mean, n: +typed.n || 0, src: 'indicado' };
      });
      MS.effective(a);
    });
    const w = ((meas.walk) || []).filter((x) => x >= 0 && isFinite(x));
    let walk = 0.5, measured = false; // sin medición: valor provisional de 0,5 min (se marca como sin medir)
    if (w.length >= 3) { walk = U.mean(w); measured = w.length >= MS.MIN_WALK; }
    else if (meas.walkTyped && meas.walkTyped.mean >= 0) { walk = +meas.walkTyped.mean; measured = (+meas.walkTyped.n || 0) >= MS.MIN_WALK; }
    const changed = Math.abs(walk - (proc.walk != null ? proc.walk : 0.5)) > 1e-9;
    proc.walk = walk; proc.walkMeasured = measured; proc.walkN = w.length || (meas.walkTyped ? +meas.walkTyped.n || 0 : 0);
    return changed;
  };
  // Qué hay que medir en tienda para que el modelo use solo datos reales
  // Devuelve una lista de pendientes: {kind: 'svc'|'walk', ai, need, have, state: 'falta'|'parcial'|'listo'|'datos'}
  MS.measurementNeeds = (proc, areas, meas) => {
    const out = [];
    areas.forEach((a, i) => {
      const ar = proc.areas[i];
      const fromData = a.svc0.every((s) => !s || s.method === 'medido');
      const linked = !!a.linkFit;
      const counts = a.labels.map((l) => ((meas && meas.svc && meas.svc[mKey(ar, l)]) || []).length);
      const typed = a.labels.map((l) => !!(meas && meas.typed && meas.typed[mKey(ar, l)] && meas.typed[mKey(ar, l)].mean > 0));
      const have = Math.max(0, ...counts);
      let state;
      if (fromData) state = 'datos';
      else if (linked) state = 'inferido';
      else if (have >= MS.MIN_SVC) state = 'listo';
      else if (have >= MS.USE_SVC || typed.some(Boolean)) state = 'parcial';
      else state = 'falta';
      out.push({ kind: 'svc', ai: i, have, need: MS.MIN_SVC, counts, typed, state });
    });
    // el traslado solo hace falta si la atención de algún área se calcula con el tiempo entre documentos (no si se midió con la hora de inicio)
    if (areas.some((a) => a && a.linkFit && a.svc0.some((s) => s && s.method !== 'medido'))) {
      const n = (meas && meas.walk ? meas.walk.length : 0);
      const typedN = meas && meas.walkTyped ? +meas.walkTyped.n || 0 : 0;
      out.push({ kind: 'walk', have: n || typedN, need: MS.MIN_WALK, state: Math.max(n, typedN) >= MS.MIN_WALK ? 'listo' : (n >= 3 || typedN > 0) ? 'parcial' : 'falta' });
    }
    return out;
  };

  /* ======================= temporadas ======================= */
  // Índice de temporada por mes del año para cada flujo (descomposición clásica multiplicativa; Makridakis, Wheelwright y Hyndman, 1998):
  // 1) cada día se divide entre el promedio de su día de la semana (quita el efecto del día); 2) se promedia por mes;
  // 3) con 24 meses o más se divide entre la media móvil centrada de 12 meses (quita la tendencia); 4) se promedian los meses del mismo nombre
  // y se normaliza para que el promedio de los meses con datos sea 1. Se usa solo con 8 o más días con movimiento en el mes.
  const monthSeries = (dayRec, val) => {
    const byDow = U.range(7, () => []); dayRec.forEach((r) => byDow[U.dayInfo(r.k).dow].push(val(r)));
    const mDow = byDow.map((l) => (l.length ? U.mean(l) : 0));
    const map = new Map();
    dayRec.forEach((r) => { const i = U.dayInfo(r.k); const md = mDow[i.dow]; if (!(md > 0)) return; const key = i.y * 12 + i.m - 1; const x = map.get(key) || [0, 0]; x[0] += val(r) / md; x[1]++; map.set(key, x); });
    const keys = Array.from(map.keys()).sort((a, b) => a - b);
    return keys.filter((k) => map.get(k)[1] >= 8).map((k) => ({ key: k, m: k % 12, y: Math.floor(k / 12), v: map.get(k)[0] / map.get(k)[1], n: map.get(k)[1] }));
  };
  const seasonalIndex = (series) => {
    if (!series.length) return { f: new Array(12).fill(null), months: 0, trend: false };
    const span = series[series.length - 1].key - series[0].key + 1;
    let ratios = series.map((s) => ({ m: s.m, r: s.v }));
    let trend = false;
    if (span >= 24 && series.length >= 24) {
      const byKey = new Map(series.map((s) => [s.key, s.v]));
      const cma = (k) => { let sum = 0; for (let j = -6; j <= 6; j++) { const v = byKey.get(k + j); if (v == null) return null; sum += (j === -6 || j === 6 ? 0.5 : 1) * v; } return sum / 12; };
      const rr = series.map((s) => { const c = cma(s.key); return c ? { m: s.m, r: s.v / c } : null; }).filter(Boolean);
      if (rr.length >= 12) { ratios = rr; trend = true; }
    }
    const sum = new Array(12).fill(0), n = new Array(12).fill(0);
    ratios.forEach((x) => { sum[x.m] += x.r; n[x.m]++; });
    const raw = sum.map((s, m) => (n[m] ? s / n[m] : null)); const have = raw.filter((x) => x != null);
    const avg = have.length ? U.mean(have) : 1;
    return { f: raw.map((x) => (x == null ? null : x / avg)), months: series.length, trend, years: n };
  };
  MS.monthFactors = (proc, areas) => proc.flows.map((f) => {
    const ai = f.steps.findIndex(Boolean); const a = areas[ai]; const ti = proc.areas[ai].types.indexOf(f.steps[ai]);
    const si = seasonalIndex(monthSeries(a.dayRec, (r) => (r.types ? r.types[ti] : 0)));
    return Object.assign({ name: f.name }, si);
  });
  // Índice de temporada de un área (todos sus clientes), para mostrar
  MS.areaSeason = (area) => seasonalIndex(monthSeries(area.dayRec, (r) => r.tot));
  // Meses con índice medido (en todos los flujos que tienen datos)
  MS.monthsWithData = (mf) => U.range(12, (m) => m).filter((m) => mf.every((x) => x.f[m] != null || x.months === 0) && mf.some((x) => x.f[m] != null));
  // Factor de cada flujo para planear un mes: índice del mes ÷ índice promedio de los días del periodo base
  // (el modelo ya está en el nivel del periodo base; el crecimiento esperado se agrega aparte como cambio de demanda)
  MS.monthAdjust = (proc, areas, month, mf) => {
    mf = mf || MS.monthFactors(proc, areas);
    return proc.flows.map((f, j) => {
      const x = mf[j]; if (!(month >= 0) || !x || x.f[month] == null) return 1;
      const ai = f.steps.findIndex(Boolean); const a = areas[ai]; const k0 = a.win ? a.win.k0 : a.k0, k1 = a.win ? a.win.k1 : a.k1;
      let s = 0, n = 0; a.dayRec.forEach((r) => { if (r.k < k0 || r.k > k1) return; const v = x.f[U.dayInfo(r.k).m - 1]; if (v != null) { s += v; n++; } });
      return n ? x.f[month] / (s / n) : x.f[month];
    });
  };

  /* ======================= estándar de modelación ======================= */
  // Referencias de cada paso del método (se citan en la ficha técnica del modelo)
  MS.REFS = {
    kendall: ['Kendall (1953)', 'Kendall, D. G. (1953). Stochastic processes occurring in the theory of queues and their analysis by the method of the imbedded Markov chain. Annals of Mathematical Statistics, 24(3), 338–354.'],
    gross: ['Shortle et al. (2018)', 'Shortle, J. F., Thompson, J. M., Gross, D. y Harris, C. M. (2018). Fundamentals of Queueing Theory, 5.ª ed. Wiley.'],
    law: ['Law (2015)', 'Law, A. M. (2015). Simulation Modeling and Analysis, 5.ª ed. McGraw-Hill.'],
    banks: ['Banks et al. (2010)', 'Banks, J., Carson, J. S., Nelson, B. L. y Nicol, D. M. (2010). Discrete-Event System Simulation, 5.ª ed. Pearson.'],
    kimwhitt: ['Kim y Whitt (2014)', 'Kim, S.-H. y Whitt, W. (2014). Are call center and hospital arrivals well modeled by nonhomogeneous Poisson processes? Manufacturing & Service Operations Management, 16(3), 464–480.'],
    brown: ['Brown et al. (2005)', 'Brown, L., Gans, N., Mandelbaum, A., Sakov, A., Shen, H., Zeltyn, S. y Zhao, L. (2005). Statistical analysis of a telephone call center: a queueing-science perspective. Journal of the American Statistical Association, 100(469), 36–50.'],
    burke: ['Burke (1956)', 'Burke, P. J. (1956). The output of a queuing system. Operations Research, 4(6), 699–704.'],
    lewis: ['Lewis y Shedler (1979)', 'Lewis, P. A. W. y Shedler, G. S. (1979). Simulation of nonhomogeneous Poisson processes by thinning. Naval Research Logistics Quarterly, 26(3), 403–413.'],
    little: ['Little (1961)', 'Little, J. D. C. (1961). A proof for the queuing formula L = λW. Operations Research, 9(3), 383–387.'],
    erlang: ['Erlang (1917)', 'Erlang, A. K. (1917). Solution of some problems in the theory of probabilities of significance in automatic telephone exchanges. Elektroteknikeren, 13, 5–13.'],
    green: ['Green, Kolesar y Soares (2001)', 'Green, L. V., Kolesar, P. J. y Soares, J. (2001). Improving the SIPP approach for staffing service systems that have cyclic demands. Operations Research, 49(4), 549–564.'],
    feldman: ['Feldman et al. (2008)', 'Feldman, Z., Mandelbaum, A., Massey, W. A. y Whitt, W. (2008). Staffing of time-varying queues to achieve time-stable performance. Management Science, 54(2), 324–338.'],
    zeltyn: ['Mandelbaum y Zeltyn (2007)', 'Mandelbaum, A. y Zeltyn, S. (2007). Service engineering in action: the Palm/Erlang-A queue, with applications to call centers. En Advances in Services Innovations, 17–45. Springer.'],
    lawson: ['Lawson y Hanson (1974)', 'Lawson, C. L. y Hanson, R. J. (1974). Solving Least Squares Problems. Prentice-Hall.'],
    indirect: ['Gouriéroux, Monfort y Renault (1993)', 'Gouriéroux, C., Monfort, A. y Renault, E. (1993). Indirect inference. Journal of Applied Econometrics, 8(S1), S85–S118.'],
    larson: ['Larson (1990)', 'Larson, R. C. (1990). The queue inference engine: deducing queue statistics from transactional data. Management Science, 36(5), 586–601.'],
    sargent: ['Sargent (2013)', 'Sargent, R. G. (2013). Verification and validation of simulation models. Journal of Simulation, 7(1), 12–24.'],
    rothkopf: ['Rothkopf y Rech (1987)', 'Rothkopf, M. H. y Rech, P. (1987). Perspectives on queues: combining queues is not always beneficial. Operations Research, 35(6), 906–909.'],
    bcmp: ['Baskett et al. (1975)', 'Baskett, F., Chandy, K. M., Muntz, R. R. y Palacios, F. G. (1975). Open, closed, and mixed networks of queues with different classes of customers. Journal of the ACM, 22(2), 248–260.'],
    akaike: ['Akaike (1974)', 'Akaike, H. (1974). A new look at the statistical model identification. IEEE Transactions on Automatic Control, 19(6), 716–723.'],
    whitt06: ['Whitt (2006)', 'Whitt, W. (2006). Staffing a call center with uncertain arrival rate and absenteeism. Production and Operations Management, 15(1), 88–102.'],
    palmer: ['Palmer et al. (2019)', 'Palmer, G. I., Knight, V. A., Harper, P. R. y Hawa, A. L. (2019). Ciw: an open-source discrete event simulation library. Journal of Simulation, 13(1), 68–82.'],
    kanawaty: ['Kanawaty (1992)', 'Kanawaty, G. (Ed.) (1992). Introduction to Work Study, 4.ª ed. Oficina Internacional del Trabajo, Ginebra.'],
    niebel: ['Niebel y Freivalds (2009)', 'Freivalds, A. y Niebel, B. W. (2009). Niebel\'s Methods, Standards, and Work Design, 12.ª ed. McGraw-Hill.'],
    makridakis: ['Makridakis et al. (1998)', 'Makridakis, S., Wheelwright, S. C. y Hyndman, R. J. (1998). Forecasting: Methods and Applications, 3.ª ed. Wiley.']
  };
  const cite = (...ks) => ks.map((k) => (MS.REFS[k] ? MS.REFS[k][0] : k)).join('; ');

  // Pruebas de los datos de un área: llegadas (índice de dispersión), estabilidad (ρ por hora) y suficiencia
  MS.areaChecks = (area) => {
    const at = QS.Analysis && QS.Analysis.arrivalTests ? QS.Analysis.arrivalTests(area.ds) : {};
    const disp = at.dispersion || null;
    let verdict = 'faltan días para la prueba (se necesitan 4 o más días por celda mes × día × hora)', state = 'info';
    if (disp) {
      const I = disp.median;
      if (I <= 1.3) { verdict = 'compatible con un proceso de Poisson no homogéneo'; state = 'good'; }
      else if (I <= 2.2) { verdict = 'más variable que Poisson entre días parecidos: planear con un día cargado (P75 a P90)'; state = 'warn'; }
      else { verdict = 'muy variable entre días parecidos: separar tipos de día (quincena, eventos) antes de planear'; state = 'bad'; }
    }
    const sm = MS.areaService(area).m;
    let rhoMax = 0, rhoAt = null, hot = 0;
    for (let w = 0; w < 7; w++) for (let hh = 0; hh < 24; hh++) {
      const c = area.sHeat[w][hh]; if (!(c > 0.5) || !(area.heat[w][hh] > 1)) continue;
      const r = area.heat[w][hh] * sm / (60 * c); if (r > 0.85) hot++;
      if (r > rhoMax) { rhoMax = r; rhoAt = { w, hh }; }
    }
    return { disp, verdict, state, rhoMax, rhoAt, hot, days: area.openDays, perDay: area.nVis / Math.max(1, area.openDays) };
  };
  // Ajuste de distribuciones de la atención (cuando hay tiempos individuales: medidos o cronometrados)
  MS.serviceFits = (area) => area.labels.map((l, t) => {
    const s = area.svc[t]; if (!s) return null;
    let raw = null;
    if (s.method === 'medido') raw = area._w.meas[t];
    else if (s.method === 'cronometrado' && area.over && area.over[t] && area.over[t].sample) raw = area.over[t].sample;
    if (raw && raw.length >= 30 && QS.Analysis && QS.Analysis.fit) {
      const f = QS.Analysis.fit(raw.length > 20000 ? thin(raw, 20000) : raw);
      if (f) return { n: f.n, best: f.fits[0], fits: f.fits, cv: f.cv, mean: f.mean };
    }
    return { n: s.n || 0, best: null, cv: s.cv, mean: s.mean };
  });
  // Réplicas necesarias para una precisión relativa γ (Law, 2015, §9.4.1): n* ≈ n · (h / (γ′ · |media|))², γ′ = γ / (1 + γ)
  // Con esperas cortas la precisión relativa es demasiado exigente: se usa el mayor entre γ′·|media| y una tolerancia absoluta (0,25 min).
  MS.repsNeeded = (st, gamma = 0.05, absTol = 0.25) => {
    if (!st || !(st.n > 1) || !isFinite(st.hw)) return NaN;
    const g = gamma / (1 + gamma); const tol = Math.max(g * Math.abs(st.mean), absTol);
    return Math.max(st.n, Math.ceil(st.n * Math.pow(st.hw / tol, 2)));
  };

  // Ficha técnica del modelo: cada parámetro con su valor, cómo se obtuvo, la evidencia y la referencia
  MS.modelCard = (proc, areas, comb, o = {}) => {
    const rows = [];
    const add = (sec, param, value, method, evidence, state, refs) => rows.push({ sec, param, value, method, evidence: evidence || '', state: state || 'info', refs: refs || [] });
    const pctS = (x) => U.fmtPct(x, 1);
    const nA = proc.areas.length;
    add('1. Sistema', 'Tipo de modelo', `Red de ${nA} ${nA === 1 ? 'estación' : 'estaciones'} con ${proc.flows.length} clases de cliente y ruta propia`, 'Mapa del proceso: áreas, tipos de transacción y flujos', proc.areas.map((ar) => `${ar.name}: Mₜ/G/c(t)/∞/FIFO`).join(' · '), 'info', ['kendall', 'bcmp']);
    proc.areas.forEach((ar) => add('1. Sistema', `Fila de ${ar.name}`, ar.queue === 'multi' ? 'Una fila por punto (elige la más corta)' : 'Fila única', 'Indicado en el proceso', ar.queue === 'multi' ? 'Se puede comparar con fila única en los escenarios' : 'Primero en llegar, primero en ser atendido', 'info', ['rothkopf']));
    // llegadas
    areas.forEach((a, i) => {
      const ck = MS.areaChecks(a); let pk = { v: -1 }; for (let w = 0; w < 7; w++) for (let hh = 0; hh < 24; hh++) if (a.heat[w][hh] > pk.v) pk = { v: a.heat[w][hh], w, hh };
      add('2. Llegadas', `λ(t) de ${proc.areas[i].name}`, `${U.fmtInt(ck.perDay)} clientes por día; pico de ${U.fmtInt(pk.v)} por hora (${U.DIAS[pk.w]} ${U.fmtHour(pk.hh)})`,
        `Proceso de Poisson no homogéneo con tasa constante en cada hora y día de la semana: promedio de los días con movimiento del periodo base (${a.win && !a.win.all ? `últimas ${a.win.weeks} semanas, del ${U.fmtDay(a.win.k0)} al ${U.fmtDay(a.win.k1)}` : 'todo el periodo'})`, ck.disp ? `Índice de dispersión mediano ${U.fmt(ck.disp.median, 2)} en ${ck.disp.cells} celdas: ${ck.verdict}.` : ck.verdict, ck.state, ['law', 'kimwhitt', 'brown']);
    });
    if (o.factors && o.factors.length) {
      const fx = (k) => o.factors.map((f) => `${f.name} ×${U.fmt(f[k], 2)}`).join(' · ');
      add('2. Llegadas', 'Tipos de día', `Día de pago: ${fx('payday')}`, 'Razón de la demanda de cada día contra el promedio de su día de la semana; días de pago: 1, 2, 15, 16 y los dos últimos del mes', `Día cargado P75: ${fx('p75')} · muy cargado P90: ${fx('p90')}`, 'info', ['whitt06']);
    }
    add('2. Llegadas', 'Momento de llegada', 'Hora del documento menos la atención de su tipo', 'El registro marca el fin de la atención: la llegada se estima restando la atención vigente (medida, cronometrada o inferida); con hora de llegada o de inicio en el archivo se usan esas horas', '', 'info', ['burke']);
    add('2. Llegadas', 'Generación en la simulación', 'Adelgazamiento (thinning)', 'Generación exacta de un proceso de Poisson no homogéneo a partir de la tasa por hora', '', 'info', ['lewis']);
    // rutas
    comb.flows.forEach((f) => add('3. Mezcla y rutas', f.name, `${pctS(f.share)} de los clientes · ${U.fmt(f.perDay, 1)} por día`, 'Mínimos cuadrados no negativos sobre los conteos de cada tipo de transacción en cada área', 'Ruta: ' + f.steps.map((ty, k) => (ty ? `${proc.areas[k].name.split(':')[0]} (${ty})` : null)).filter(Boolean).join(' → '), comb.fitErr <= 0.05 ? 'good' : 'warn', ['lawson']));
    add('3. Mezcla y rutas', 'Ajuste de los volúmenes', `Error máximo ${pctS(comb.fitErr)} entre conteos reales y del modelo`, 'Si es mayor a 5 %, revisa la correspondencia de tipos o los flujos', '', comb.fitErr <= 0.05 ? 'good' : 'warn', ['lawson']);
    // atención
    const METH = {
      medido: ['Hora de inicio a hora de fin de cada atención', ['law', 'akaike']],
      cronometrado: ['Estudio de tiempos con cronómetro en tienda', ['kanawaty', 'niebel', 'akaike']],
      inferido: ['Inferencia indirecta: se simulan las llegadas reales (hora del documento anterior más el traslado) hasta reproducir los cuartiles del tiempo entre documentos', ['indirect', 'larson']],
      'por diferencia': ['Modelo aditivo de intervalos (atención + tiempo libre común) anclado en un tipo inferido', ['larson']],
      indicado: ['Promedio indicado por el usuario', []],
      ajustado: ['Modelo aditivo de intervalos anclado en el promedio que indicó el usuario', ['larson']],
      maximo: ['Cota superior (falta cronometrar): intervalo entre transacciones seguidas de un punto en las horas más cargadas del área', ['larson']]
    };
    areas.forEach((a, i) => {
      const fits = MS.serviceFits(a);
      a.labels.forEach((l, t) => {
        const sv = a.svc[t]; if (!sv) return; const m = METH[sv.method] || [sv.method, []]; const ft = fits[t];
        let ev = `n = ${U.fmtInt(sv.n || 0)}`;
        const ov = a.over && a.over[t];
        const ts = sv.method === 'cronometrado' && ov && ov.sample ? MS.timeStudy(ov.sample) : null;
        if (ft && ft.best) ev = `Mejor ajuste por AIC: ${ft.best.name} (Kolmogorov–Smirnov p = ${U.fmt(ft.best.p, 3)}) · n = ${U.fmtInt(ft.n)}`;
        if (ts && isFinite(ts.hw)) ev = `${U.fmtInt(ts.n)} atenciones cronometradas; media ± ${U.fmtTime(ts.hw)} (IC 95 %)` + (ft && ft.best ? `; mejor ajuste por AIC: ${ft.best.name}` : '');
        else if (sv.method === 'inferido' && a.linkFit) ev = `${U.fmtInt(sv.n)} clientes enlazados; error final ${U.fmtPct(a.linkFit.err, 1)}; en el modelo: gamma con la media y el CV estimados (ajuste por momentos)`;
        else ev += '; en el modelo: gamma con esa media y CV (ajuste por momentos)';
        add('4. Atención', `${proc.areas[i].name.split(':')[0]} · ${l}`, `${U.fmtTime(sv.mean)} · CV ${U.fmt(sv.cv, 2)}`, m[0], ev, sv.method === 'maximo' ? 'warn' : (sv.method === 'indicado' || sv.method === 'ajustado' || sv.method === 'por diferencia') ? 'info' : 'good', m[1].concat(['law']));
      });
    });
    // personal
    areas.forEach((a, i) => {
      const ck = MS.areaChecks(a);
      const mx = Math.round(Math.max(...a.sHeat.map((r) => Math.max(...r))));
      add('5. Personal', `c(t) de ${proc.areas[i].name}`, `Hasta ${mx} ${String(proc.areas[i].staff || 'puntos').toLowerCase()} a la vez`, 'Presencia de cada punto por sesiones de trabajo: desde un intervalo típico antes de su primera transacción hasta la última, cortadas en pausas de más de 30 min (promedio por día de la semana)', `Ocupación máxima por hora ρ = ${U.fmtPct(ck.rhoMax, 0)}${ck.rhoAt ? ` (${U.DIAS[ck.rhoAt.w]} ${U.fmtHour(ck.rhoAt.hh)})` : ''}; ${ck.hot} horas de la semana arriba de 85 %`, ck.rhoMax >= 1 ? 'bad' : ck.rhoMax > 0.9 ? 'warn' : 'good', ['erlang', 'little']);
    });
    // traslado entre áreas (supuesto que afecta la atención inferida)
    if (proc.areas.length > 1 && areas.some((a) => a.linkFit)) add('4. Atención', 'Tiempo de traslado entre áreas', `${U.fmt(proc.walk != null ? proc.walk : 0.5, 2)} min`, proc.walkMeasured ? `Cronometrado en tienda (${U.fmtInt(proc.walkN || 0)} traslados)` : 'Sin medir: valor provisional', 'Se descuenta del tiempo entre documentos: cada minuto de error cambia casi un minuto la atención inferida del área siguiente (validado en tests/VALIDACION_MEDICION.md)', proc.walkMeasured ? 'good' : 'warn', proc.walkMeasured ? ['kanawaty'] : []);
    // abandono
    const pat = MS.patience(areas);
    if (pat) add('6. Abandono', 'Paciencia', `Exponencial con media ${U.fmtTime(pat.mean)}`, 'θ = P(abandono) / E[espera], con los turnos abandonados y la espera medida', `P(abandono) = ${pctS(pat.pab)}; espera media ${U.fmtTime(pat.ew)}`, 'good', ['zeltyn', 'brown']);
    else add('6. Abandono', 'Paciencia', 'Sin abandono', 'El sistema no registra a quien se va sin ser atendido. Todos los clientes esperan su turno en el modelo: la espera calculada es igual o mayor que la real (criterio conservador para el personal)', 'Con turnero (nivel 3) se mide el abandono y se agrega al modelo', 'info', ['zeltyn']);
    if (o.season && o.season.some((s) => s.months)) {
      const s0 = o.season.find((s) => s.months) || o.season[0];
      const hi = s0.f.map((x, m) => [x, m]).filter((x) => x[0] != null).sort((a, b) => b[0] - a[0]);
      add('2. Llegadas', 'Temporada por mes', hi.length ? `Mes más alto: ${U.MESES_L[hi[0][1]]} ×${U.fmt(hi[0][0], 2)} · más bajo: ${U.MESES_L[hi[hi.length - 1][1]]} ×${U.fmt(hi[hi.length - 1][0], 2)}` : 'Sin meses suficientes',
        'Descomposición multiplicativa: razón de cada día al promedio de su día de la semana, promedio por mes' + (s0.trend ? ' y razón a la media móvil centrada de 12 meses (sin tendencia)' : ''), `${s0.months} meses con datos`, s0.months >= 12 ? 'good' : 'info', ['makridakis']);
    }
    // diseño
    add('7. Diseño de la simulación', 'Horizonte', 'Simulación terminante: un día típico por día de la semana', 'Inicia vacío a la apertura y atiende a quienes siguen dentro al cierre', '', 'info', ['law']);
    add('7. Diseño de la simulación', 'Réplicas', `${o.reps || 20} réplicas independientes`, 'Intervalo de confianza del 95 % con t de Student; se indica si hacen falta más réplicas para ±5 % de precisión relativa', o.repsNeeded ? `Para estimar la espera media con ±5 % (o ±0,25 min si es corta) bastan ${o.repsNeeded} réplicas` : '', o.repsNeeded && o.repsNeeded > (o.reps || 20) ? 'warn' : 'info', ['law']);
    add('7. Diseño de la simulación', 'Comparación de escenarios', 'Números aleatorios comunes', 'Cada escenario usa las mismas semillas por réplica: las diferencias se miden con más precisión', '', 'info', ['law', 'banks']);
    // validación
    add('8. Verificación y validación', 'Verificación del motor', '194 pruebas contra fórmulas exactas, una solución independiente y validación cruzada con Ciw', 'node tests/validacion.js · python tests/validar_con_ciw.py', '', 'good', ['sargent', 'palmer']);
    areas.forEach((a, i) => { if (a.linkFit) add('8. Verificación y validación', `Tiempo entre documentos en ${proc.areas[i].name.split(':')[0]}`, 'Cuartiles reales vs. modelo', 'Simulación con las llegadas reales', a.linkFit.types.map((t) => `${t.type}: mediana ${U.fmtTime(t.realQ[1])} real vs. ${t.simQ ? U.fmtTime(t.simQ[1]) : '—'} modelo`).join(' · ') + (a.linkFit.converged ? '' : `. La calibración no convergió (error ${U.fmtPct(a.linkFit.err, 1)}): revisa los tipos y el traslado`), a.linkFit.converged ? 'good' : 'warn', ['sargent', 'indirect']); });
    if (o.validation) o.validation.areas.forEach((v) => add('8. Verificación y validación', `Atenciones por hora en ${v.name.split(':')[0]} (${U.DIAS_L[o.validation.dow].toLowerCase()})`, `Error absoluto ponderado ${U.fmtPct(v.wape, 1)}`, 'Simulación del día típico comparada con el promedio observado de cada hora', `${U.fmtInt(v.totSim)} atenciones simuladas vs. ${U.fmtInt(v.totObs)} observadas${isFinite(v.waitErr) ? `; espera media simulada ${U.fmtTime(v.waitSim)} vs. ${U.fmtTime(v.waitObs)} medida` : ''}`, v.state, ['sargent', 'law']));
    const used = new Set(); rows.forEach((r) => r.refs.forEach((k) => used.add(k)));
    return { rows, refs: Array.from(used).filter((k) => MS.REFS[k]).map((k) => MS.REFS[k][1]).sort(), cite };
  };
  MS.modelCardCSV = (card) => U.toCSV(['seccion', 'parametro', 'valor', 'como_se_obtuvo', 'evidencia', 'estado', 'referencias'], card.rows.map((r) => [r.sec, r.param, r.value, r.method, r.evidence, r.state, cite(...r.refs)]));

  // Validación: simula el día típico y compara las atenciones por hora de cada área con lo observado (y la espera, si se midió)
  MS.validateModel = async (proc, areas, comb, dow, o = {}) => {
    const reps = o.reps || 20;
    const spec = MS.buildSpec(proc, areas, comb, dow, { reps, slT: o.slT || 5, schedDay: o.schedDay });
    const agg = await QS.Sim.runReps(spec, { reps, onProgress: o.onProgress });
    const h0 = spec.open / 60;
    const res = proc.areas.map((ar, i) => {
      const st = agg.stages[i], a = areas[i]; const hrs = []; let num = 0, den = 0, tO = 0, tS = 0, ws = 0, wo = 0, wn = 0;
      for (let hh = 0; hh < 24; hh++) {
        const obs = (a.heatDone || a.heat)[dow][hh] || 0, k = hh - h0, x = k >= 0 ? st.hourly[k] : null, sim = x ? x.done : 0;
        if (!(obs > 0.3) && !(sim > 0.3)) continue;
        hrs.push({ hh, obs, sim, wqSim: x ? x.wq : NaN, wqObs: a.waitHeat ? a.waitHeat[dow][hh] : NaN });
        num += Math.abs(sim - obs); den += obs; tO += obs; tS += sim;
        if (x && isFinite(x.wq) && a.waitHeat && isFinite(a.waitHeat[dow][hh]) && x.n > 0) { ws += x.wq * x.n; wo += a.waitHeat[dow][hh] * x.n; wn += x.n; }
      }
      const wape = den > 0 ? num / den : NaN;
      const waitSim = wn ? ws / wn : NaN, waitObs = wn ? wo / wn : NaN;
      return { name: ar.name, hours: hrs, wape, totObs: tO, totSim: tS, waitSim, waitObs, waitErr: wn ? Math.abs(waitSim - waitObs) / Math.max(0.5, waitObs) : NaN, state: wape <= 0.1 ? 'good' : wape <= 0.2 ? 'warn' : 'bad' };
    });
    return { spec, agg, dow, reps, areas: res, repsNeeded: MS.repsNeeded(agg.m.Wq) };
  };

  // Dimensionamiento por simulación del proceso completo: punto de partida con Erlang C por hora (SIPP; Green, Kolesar y Soares, 2001)
  // y refinamiento iterativo con simulación hasta que cada área cumple la meta en cada hora (en el espíritu de Feldman et al., 2008).
  MS.staffBySim = async (proc, areas, comb, dow, o = {}) => {
    const target = (o.pct || 80) / 100, T = o.tMin || 5, reps = o.reps || 12, maxIt = o.iters || 8;
    const dem = o.demand > 0 ? o.demand : 1;
    const X = { demand: dem, flowDemand: o.flowDemand, dayType: o.dayType, slT: T, svc: o.svc, queue: o.queue, name: o.name };
    const base = MS.buildSpec(proc, areas, comb, dow, X);
    const h0 = base.open / 60, H = base.run.hours;
    const goal = { target: { type: 'sl', pct: target, tMin: T }, maxOcc: o.maxOcc || 0.95 };
    // λ de cada área por hora en el escenario: atenciones observadas escaladas por el cambio de demanda de los flujos que pasan por ella
    const lamOf = (i, k) => {
      const hh = h0 + k; let tot = 0, scaled = 0;
      proc.flows.forEach((f, j) => { if (!f.steps[i]) return; const ti = proc.areas[i].types.indexOf(f.steps[i]); const sameType = proc.flows.filter((g) => g.steps[i] === f.steps[i]).reduce((x, g) => x + comb.flows[proc.flows.indexOf(g)].volume, 0);
        const part = (areas[i].heatT[ti][dow][hh] || 0) * (sameType > 0 ? comb.flows[j].volume / sameType : 0); tot += part; scaled += part * dem * (o.flowDemand && o.flowDemand[j] > 0 ? o.flowDemand[j] : 1); });
      return tot > 0 ? scaled : (areas[i].heat[dow][hh] || 0) * dem;
    };
    const svcF = (i) => (o.svc && o.svc[i] > 0 ? o.svc[i] : 1);
    const sipp = proc.areas.map((ar, i) => { const m = MS.areaService(areas[i]).m * svcF(i); return U.range(H, (k) => { const lam = lamOf(i, k); return lam > 0.05 ? Math.max(1, QS.Staff.required(lam, m, goal).c) : 1; }); });
    const sched = sipp.map((r) => r.slice());
    const run = async (sc, frac0, frac1) => QS.Sim.runReps(MS.buildSpec(proc, areas, comb, dow, Object.assign({}, X, { sched: sc, reps })), { reps, onProgress: (f) => o.onProgress && o.onProgress(frac0 + (frac1 - frac0) * f) });
    const hist = []; let agg = null; const steps = maxIt + 2;
    const raise = (ag) => { let ch = 0; sched.forEach((row, i) => row.forEach((c, k) => { const x = ag.stages[i].hourly[k]; if (x && x.n >= 1 && x.sl < target - 0.005 && c < 60) { row[k] = c + 1; ch++; } })); return ch; };
    for (let it = 0; it < maxIt; it++) {
      agg = await run(sched, it / steps, (it + 1) / steps);
      const ch = raise(agg); hist.push({ it: it + 1, changed: ch });
      if (!ch) break;
    }
    // recorte: quitar una persona donde sobra con holgura y confirmarlo con simulación
    const trial = sched.map((row, i) => row.map((c, k) => { const x = agg.stages[i].hourly[k]; return x && c > 1 && x.sl >= Math.min(0.995, target + 0.08) ? c - 1 : c; }));
    if (trial.some((row, i) => row.some((c, k) => c !== sched[i][k]))) {
      const a2 = await run(trial, maxIt / steps, (maxIt + 1) / steps);
      trial.forEach((row, i) => row.forEach((c, k) => { if (c !== sched[i][k]) { const x = a2.stages[i].hourly[k]; if (x && x.sl >= target - 0.005) sched[i][k] = c; } }));
    }
    // confirmación final con más réplicas
    const finalReps = Math.max(20, reps);
    let spec = MS.buildSpec(proc, areas, comb, dow, Object.assign({}, X, { sched, reps: finalReps }));
    agg = await QS.Sim.runReps(spec, { reps: finalReps, onProgress: (f) => o.onProgress && o.onProgress((maxIt + 1 + f) / steps) });
    for (let extra = 0; extra < 2 && raise(agg); extra++) { spec = MS.buildSpec(proc, areas, comb, dow, Object.assign({}, X, { sched, reps: finalReps })); agg = await QS.Sim.runReps(spec, { reps: finalReps }); }
    // personal de hoy: el que indicó el usuario (o.todayDay, por hora del día) o el detectado en los registros
    const today = proc.areas.map((ar, i) => U.range(H, (k) => (o.todayDay && o.todayDay[i] ? o.todayDay[i][h0 + k] || 0 : areas[i].sHeat[dow][h0 + k] || 0)));
    const shifts = sched.map((row) => QS.Staff.dayShifts(row, { ftLen: o.ftLen || 8, ptLen: o.ptLen || 4, allowPT: o.allowPT !== false, ftCost: 1, ptCost: 1.1, maxPT: 0.4, step: 60 }));
    return { sched, sipp, today, spec, agg, hist, h0, H, shifts, target, T, dem, dow, dayType: o.dayType || 'promedio', lam: proc.areas.map((ar, i) => U.range(H, (k) => lamOf(i, k))) };
  };

  /* ======================= datos de ejemplo del proceso ======================= */
  // Cuatro meses del proceso "retail con crédito" exportados como los daría un ERP: facturas de cajas y recibos (REC) de facturación.
  // Cajas se simula con llegadas aleatorias; facturación recibe a cada cliente a la hora de su factura más el traslado (llegadas reales).
  // o (para validar el método con valores conocidos): {demand, a:{contado,credito}, b:{contado,entrada,cuota}, cvA, cvB, walk:[mín,máx], queueB, k0, k1, seed}
  MS.sampleFiles = (o = {}) => {
    const facturas = [], recibos = []; let nf = 1200, nr = 800, ncr = 4100;
    const truth = { a: Object.assign({ contado: 3.4, credito: 8.8 }, o.a), b: Object.assign({ contado: 2.2, entrada: 3.0, cuota: 1.75 }, o.b), cvA: o.cvA || 0.55, cvB: o.cvB || 0.5,
      shares: { contado: 40, entrada: 25, sin: 5, cuota: 30 }, walk: o.walk || [0.3, 0.9], demand: o.demand || 1, queueB: o.queueB || 'single' };
    const sd = o.seed || '';
    const counts = { contado: 0, entrada: 0, sin: 0, cuota: 0 }; truth.counts = counts;
    const k0 = o.k0 || U.dayKey(2026, 6, 1), k1 = o.k1 || U.dayKey(2026, 9, 30);
    const fmt = (k, min) => { const hh = Math.floor(min / 60), mm = Math.floor(min % 60), ss = Math.floor((min * 60) % 60); const inf = U.dayInfo(k); return [`${U.pad2(inf.d)}/${U.pad2(inf.m)}/${inf.y}`, `${U.pad2(hh)}:${U.pad2(mm)}:${U.pad2(ss)}`]; };
    const cli = (n) => 'CL-' + (10000 + (n * 7919) % 89000);
    // nivel de la demanda (crecimiento anual y temporada por mes, opcionales): el personal se ajusta al nivel, como haría la tienda
    truth.growth = o.growth || 0; truth.season = o.season || null;
    truth.level = (k) => Math.pow(1 + truth.growth, (k - k0) / 365.25) * (truth.season ? truth.season[U.dayInfo(k).m - 1] : 1);
    for (let k = k0; k <= k1; k++) {
      const di = U.dayInfo(k); if (di.dow === 6) continue;
      const isPay = di.d <= 2 || di.d === 15 || di.d === 16 || di.d >= di.dim - 1;
      const f = di.dow === 5 ? 1.2 : 1, lvl = truth.level(k);
      const payBuy = isPay ? 1.15 : 1, payCuota = isPay ? 1.8 : 1;
      const prof = [26, 38, 46, 52, 50, 44, 42, 46, 34].map((x) => x * f * truth.demand * lvl);
      const sc = (a) => (lvl === 1 ? a : a.map((x) => Math.max(1, Math.round(x * lvl))));
      const schA = sc(di.dow === 5 ? [4, 5, 6, 7, 7, 6, 6, 6, 4] : [3, 4, 5, 6, 6, 5, 5, 5, 4]);
      const schB = sc(di.dow === 5 ? [2, 3, 3, 4, 4, 3, 3, 3, 2] : [2, 3, 3, 3, 3, 3, 3, 3, 2]);
      const S = truth.shares, totA = S.contado + S.entrada + S.sin;
      // 1) cajas
      const specA = QS.Sim.normalize({ open: 540, arrivals: { mode: 'profile', profile: prof.map((x) => x * payBuy * totA / 100) },
        classes: [{ name: 'contado', share: S.contado, prio: 1, svcMult: truth.a.contado }, { name: 'entrada', share: S.entrada, prio: 1, svcMult: truth.a.credito }, { name: 'sin', share: S.sin, prio: 1, svcMult: truth.a.credito }],
        stages: [{ name: 'Cajas', servers: Math.max(...schA), useSchedule: true, schedule: schA, svc: { type: 'gamma', mean: 1, sd: truth.cvA } }],
        run: { hours: 9, warmupH: 0, drain: true, slT: 5 } });
      const toB = []; const rng = new QS.RNG('erp-walk-' + sd + k);
      const simA = new QS.Sim(specA, 'erpA' + sd + k, { keepWaits: false, onEvent: (type, c, v, Sm) => {
        if (type !== 'end') return;
        const t = 540 + Sm.t; const [fe, ho] = fmt(k, t); const doc = 'F-' + String(++nf).padStart(6, '0'); const kind = specA.classes[c.k].name; counts[kind]++;
        const rowA = [fe, ho, 'C' + U.pad2(v.i + 1), kind === 'contado' ? 'CONTADO' : 'CREDITO', doc, cli(nf), kind === 'contado' ? 850 : 4200];
        if (o.withStart) rowA.push(fmt(k, 540 + c.sStart)[1]);
        facturas.push(rowA);
        if (kind !== 'sin') toB.push([Sm.t + truth.walk[0] + rng.random() * (truth.walk[1] - truth.walk[0]), kind === 'contado' ? 0 : 1, { doc, cli: cli(nf) }]);
      } });
      simA.runAll();
      // 2) clientes que solo pagan cuota: llegadas de Poisson con el mismo perfil
      const lam = prof.map((x, i) => x * payCuota * S.cuota / 100 * (i < 3 ? 1.1 : 0.95)); const lmax = Math.max(...lam) / 60; let t = 0;
      for (;;) { t += rng.exp(1 / lmax); if (t >= 540) break; if (rng.random() * lmax <= lam[Math.floor(t / 60)] / 60) toB.push([t, 2, null]); }
      toB.sort((a, b) => a[0] - b[0]);
      // 3) facturación con las llegadas reales
      const specB = QS.Sim.normalize({ open: 540, arrivals: { mode: 'trace', trace: toB.map((e, i) => [e[0], e[1], i]) },
        classes: [{ name: 'contado', share: 1, prio: 1, svcMult: truth.b.contado }, { name: 'entrada', share: 1, prio: 1, svcMult: truth.b.entrada }, { name: 'cuota', share: 1, prio: 1, svcMult: truth.b.cuota }],
        stages: [{ name: 'Facturación', servers: Math.max(...schB), useSchedule: true, schedule: schB, queue: truth.queueB, svc: { type: 'gamma', mean: 1, sd: truth.cvB } }],
        run: { hours: 10, warmupH: 0, drain: true, slT: 5 } });
      const simB = new QS.Sim(specB, 'erpB' + sd + k, { keepWaits: false, onEvent: (type, c, v, Sm) => {
        if (type !== 'end') return;
        const e = toB[c.tag]; const tt = 540 + Sm.t; const [fe, ho] = fmt(k, tt); const pnt = 'P' + U.pad2(v.i + 1);
        const ini = o.withStart ? [fmt(k, 540 + c.sStart)[1]] : [];
        if (c.k === 2) {
          const cl = cli(50000 + c.id); counts.cuota++;
          recibos.push([fe, ho, pnt, 'PAGO CUOTA', 'REC-' + String(++nr).padStart(6, '0'), 'CR-' + (++ncr), cl, 380, ...ini]);
          if (c.id % 5 === 0) recibos.push([fe, ho, pnt, 'PAGO CUOTA', 'REC-' + String(++nr).padStart(6, '0'), 'CR-' + (++ncr), cl, 380, ...ini]); // dos cuotas en la misma visita
        } else recibos.push([fe, ho, pnt, c.k === 0 ? 'PAGO CONTADO' : 'ENTRADA CREDITO', 'REC-' + String(++nr).padStart(6, '0'), e[2].doc, e[2].cli, c.k === 0 ? 850 : 900, ...ini]);
      } });
      simB.runAll();
    }
    return {
      truth,
      facturas: { name: 'erp_facturas_cajas_ejemplo.csv', headers: ['FECHA_FACT', 'HORA', 'CAJA', 'TIPO_VENTA', 'NUM_FACTURA', 'COD_CLIENTE', 'TOTAL'].concat(o.withStart ? ['HORA_INICIO'] : []), rows: facturas },
      recibos: { name: 'erp_recibos_REC_ejemplo.csv', headers: ['FECHA', 'HORA', 'PUNTO', 'CONCEPTO', 'NUM_REC', 'FACTURA_REF', 'COD_CLIENTE', 'IMPORTE'].concat(o.withStart ? ['HORA_INICIO'] : []), rows: recibos }
    };
  };
  // El mismo ejemplo como un solo archivo con todas las áreas (el estándar de archivo único): columna Área y columnas comunes
  MS.sampleSingle = (f) => {
    const rows = [];
    const ini = f.facturas.headers.includes('HORA_INICIO');
    f.facturas.rows.forEach((r) => rows.push([r[0], r[1], 'Cajas', r[2], r[3], r[4], '', r[5], r[6]].concat(ini ? [r[7]] : [])));
    f.recibos.rows.forEach((r) => rows.push([r[0], r[1], 'Facturación', r[2], r[3], r[4], r[5], r[6], r[7]].concat(ini ? [r[8]] : [])));
    return { name: 'transacciones_ejemplo.csv', headers: ['FECHA', 'HORA', 'AREA', 'PUNTO', 'TIPO', 'DOCUMENTO', 'DOC_RELACIONADO', 'CLIENTE', 'MONTO'].concat(ini ? ['HORA_INICIO'] : []), rows };
  };
  // Mediciones en tienda del ejemplo: tiempos cronometrados (en segundos enteros, como los da un cronómetro) de la misma tienda ficticia
  MS.sampleMeasurements = (truth, o = {}) => {
    const rng = new QS.RNG('cronometro-' + (o.seed || ''));
    const sec = (x) => Math.max(1, Math.round(x * 60)) / 60;
    const g = (m, cv) => { const k = 1 / (cv * cv); return rng.gamma(k) * m / k; };
    const p = MS.fromTemplate('retail_credito'); const A = p.areas[0];
    const svc = {};
    svc[mKey(A, A.types[0])] = U.range(o.nContado || 42, () => sec(g(truth.a.contado, truth.cvA)));
    svc[mKey(A, A.types[1])] = U.range(o.nCredito || 31, () => sec(g(truth.a.credito, truth.cvA)));
    const walk = U.range(o.nWalk || 12, () => sec(truth.walk[0] + rng.random() * (truth.walk[1] - truth.walk[0])));
    return { svc, typed: {}, walk };
  };
})(typeof window !== 'undefined' ? window : globalThis);
