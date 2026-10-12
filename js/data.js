/* Importación y agregación de datos históricos.
   Formatos: transaccional (una fila por cliente), por intervalo (una fila por hora/intervalo) y diario.
   Lectura de CSV con PapaParse (github.com/mholt/PapaParse) y de Excel con SheetJS (github.com/SheetJS/sheetjs). */
(function (root) {
  'use strict';
  const QS = root.QS = root.QS || {};
  const U = QS.U;
  const D = QS.Data = {};
  D.state = { ds: null };
  D.sample = (kind) => { const ds = D.state.ds; return ds && ds.samples && ds.samples[kind] ? ds.samples[kind].slice() : []; };

  /* ---------------- roles de columnas ---------------- */
  D.KINDS = {
    trans: { name: 'Transaccional (una fila por cliente o ticket)', roles: [
      ['fechahora', 'Fecha y hora de llegada', 'Ej.: 2025-03-14 10:32:05 o 14/03/2025 10:32'],
      ['fecha', 'Fecha (si la hora va en otra columna)', ''], ['hora', 'Hora de llegada', 'Ej.: 10:32 o 10:32:05'],
      ['inicio', 'Inicio de atención', 'Hora o fecha-hora en que fue llamado/atendido'], ['fin', 'Fin de atención', 'Hora o fecha-hora de salida'],
      ['duracion', 'Duración del servicio', 'Minutos, segundos o hh:mm:ss'], ['espera', 'Tiempo de espera', 'Minutos, segundos o hh:mm:ss'],
      ['abandono', 'Abandonó', 'sí/no, 1/0, verdadero/falso'], ['servidor', 'Servidor / caja / agente', 'Identificador de quien atendió'],
      ['clase', 'Tipo de cliente o trámite', 'Ej.: General, Preferencial, Empresarial'], ['ventas', 'Monto de venta', 'Opcional']] },
    interval: { name: 'Por intervalo (una fila por hora o fracción)', roles: [
      ['fecha', 'Fecha (o fecha-hora del intervalo)', 'Obligatorio'], ['hora', 'Hora de inicio del intervalo', 'Si la fecha no trae la hora: 9, 09:00, 09:30, 9-10'],
      ['llegadas', 'Clientes / llegadas / llamadas', 'Obligatorio'], ['tmo', 'Tiempo medio de atención', 'Minutos, segundos o hh:mm:ss'],
      ['espera', 'Espera media', 'Opcional'], ['abandonos', 'Abandonos', 'Cantidad'], ['servidores', 'Servidores activos', 'Personal atendiendo en el intervalo'], ['ventas', 'Ventas', 'Monto vendido en el intervalo']] },
    daily: { name: 'Diario (una fila por día)', roles: [
      ['fecha', 'Fecha', 'Obligatorio'], ['llegadas', 'Clientes del día', 'Si no existe, se estima con ventas / ticket promedio'],
      ['ventas', 'Ventas del día', 'Opcional'], ['tmo', 'Tiempo medio de atención', 'Opcional'], ['abandonos', 'Abandonos del día', 'Opcional']] }
  };
  const GUESS = {
    fechahora: /(fecha.?hora|datetime|timestamp|marca.?temporal|^llegada|^arribo|hora.?(de.?)?llegada|fecha.?(de.?)?llegada|fh.?llegada|llegada_fh|^ingreso$|fecha.?ingreso|creado|created|emision|emitido|^registro|check.?in|arrival)/,
    fecha: /^(fecha|date|dia|day|periodo|fecha.?intervalo|fecha_?dia)$|^fecha|date/,
    hora: /^(hora|hour|intervalo|interval|franja|hora.?inicio|hora_?llegada|time|hh|bloque)/,
    inicio: /(inicio|start|llamad|called|atencion.?ini|hora.?atencion|answer|contest)/,
    fin: /(^fin|_fin|end|salida|termin|cierre|finaliz|complet|hora.?fin)/,
    duracion: /(duracion|duration|tiempo.?(de.?)?(servicio|atencion)|service.?time|handle|aht|tmo|tma|talk)/,
    espera: /(espera|wait|asa|tme|cola|queue)/,
    abandono: /(abandon|colg|renege|desist|perdid)/,
    servidor: /(cajer|agente|agent|servidor|server|caja|ventanilla|modulo|operador|teller|ejecutivo|asesor|escritorio|mostrador|consultorio|cubiculo|kiosco|probador|recepcionista|despachador|preparador|terminal)/,
    clase: /(tipo|clase|segment|prioridad|categoria|servicio|tramite|class|type|skill|cola_?nombre)/,
    ventas: /(venta|sales|importe|monto|revenue|facturac|ingreso.?total|total.?venta)/,
    llegadas: /(llegadas|llegaron|clientes|arrivals|volumen|volume|tickets|transacciones|transactions|llamadas|calls|ofrecid|offered|visitas|afluencia|conteo|count|cantidad|aforo|entradas|personas|turnos|registros|pacientes|ordenes|pedidos|atenciones|tomas|recetas|consultas|usos|ciudadanos)/,
    tmo: /(tmo|aht|tiempo.?medio|duracion.?prom|prom.?atencion|t.?atencion|handle|tma|tiempo.?atencion|servicio.?prom)/,
    abandonos: /(abandon)/,
    servidores: /(servidores|agentes|cajeros|cajas|ventanillas|staff|personal|posiciones|operadores|asesores|ejecutivos|plantilla|abiert|modulos|mostradores|consultorios|cubiculos|recepcionistas|despachadores|preparadores|probadores|kioscos|conectados)/
  };
  D.normHeader = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
  D.guessMapping = (headers, kind) => {
    const map = {}; const used = new Set(); const norm = headers.map(D.normHeader);
    const order = kind === 'trans' ? ['fechahora', 'inicio', 'fin', 'duracion', 'espera', 'abandono', 'servidor', 'clase', 'ventas', 'fecha', 'hora']
      : kind === 'interval' ? ['llegadas', 'tmo', 'abandonos', 'servidores', 'ventas', 'espera', 'fecha', 'hora'] : ['llegadas', 'ventas', 'tmo', 'abandonos', 'fecha'];
    for (const role of order) {
      const re = GUESS[role]; if (!re) continue;
      for (let i = 0; i < norm.length; i++) { if (used.has(i)) continue; if (re.test(norm[i])) { map[role] = i; used.add(i); break; } }
    }
    if (kind === 'interval' && map.tmo == null && map.duracion != null) map.tmo = map.duracion;
    return map;
  };
  D.guessKind = (headers, rows) => {
    const norm = headers.map(D.normHeader);
    const hasCount = norm.some((x) => GUESS.llegadas.test(x));
    const hasHour = norm.some((x) => GUESS.hora.test(x));
    if (!hasCount) return 'trans';
    if (hasHour) return 'interval';
    // ¿la fecha trae hora?
    const sample = rows.slice(0, 20).map((r) => String(r[0] || ''));
    return sample.some((x) => /\d{1,2}:\d{2}/.test(x)) ? 'interval' : 'daily';
  };

  /* ---------------- lectura de valores ---------------- */
  const MONTHS = { ene: 1, jan: 1, feb: 2, mar: 3, abr: 4, apr: 4, may: 5, jun: 6, jul: 7, ago: 8, aug: 8, sep: 9, set: 9, oct: 10, nov: 11, dic: 12, dec: 12 };
  D.parseNumber = (v, dec) => {
    if (typeof v === 'number') return v;
    if (v == null) return NaN;
    let s = String(v).trim(); if (!s) return NaN;
    s = s.replace(/[\s$€£%]/g, '').replace(/^\((.*)\)$/, '-$1');
    if (dec === ',') s = s.replace(/\./g, '').replace(',', '.');
    else s = s.replace(/,/g, '');
    const x = Number(s); return isFinite(x) ? x : NaN;
  };
  // Hora del día -> minutos. Acepta 9, 9.5 (decimal de día de Excel), "09:30", "9:30:15", "9-10", "2:30 p. m."
  D.parseTime = (v) => {
    if (v == null || v === '') return NaN;
    if (typeof v === 'number') { if (v >= 0 && v < 1) return v * 1440; if (v >= 0 && v <= 24) return v * 60; return NaN; }
    const s = String(v).trim().toLowerCase();
    let m = s.match(/(\d{1,2})[:h.](\d{2})(?::(\d{2}))?(?:[.,]\d+)?\s*([ap])?\.?\s*m?\.?/);
    if (m) {
      let hh = +m[1]; const mm = +m[2], ss = +(m[3] || 0);
      if (m[4] === 'p' && hh < 12) hh += 12; if (m[4] === 'a' && hh === 12) hh = 0;
      return hh * 60 + mm + ss / 60;
    }
    m = s.match(/^(\d{1,2})(?:\s*-\s*\d{1,2})?\s*([ap])?\.?\s*m?\.?$/);
    if (m) { let hh = +m[1]; if (m[2] === 'p' && hh < 12) hh += 12; if (m[2] === 'a' && hh === 12) hh = 0; return hh <= 24 ? hh * 60 : NaN; }
    return NaN;
  };
  // Fecha (y hora opcional) -> {k: día, min: minutos o NaN}. order: 'DMY' | 'MDY' | 'YMD'
  D.parseDate = (v, order = 'DMY') => {
    if (v == null || v === '') return null;
    if (v instanceof Date && !isNaN(v)) return { k: U.dayKey(v.getFullYear(), v.getMonth() + 1, v.getDate()), min: v.getHours() * 60 + v.getMinutes() + v.getSeconds() / 60 };
    if (typeof v === 'number') {
      if (v > 20000 && v < 80000) { const d = Math.floor(v); const fr = v - d; return { k: d - 25569, min: fr > 1e-9 ? Math.round(fr * 86400) / 60 : NaN }; }
      return null;
    }
    const s = String(v).trim(); if (!s) return null;
    let y, mo, d, rest = '';
    let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(.*)$/);
    if (m) { y = +m[1]; mo = +m[2]; d = +m[3]; rest = m[4]; }
    else if ((m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})(.*)$/))) {
      let a = +m[1], b = +m[2]; y = +m[3]; rest = m[4]; if (y < 100) y += 2000;
      if (order === 'MDY') { mo = a; d = b; } else { d = a; mo = b; }
      if (mo > 12 && d <= 12) { const t = mo; mo = d; d = t; }
    } else if ((m = s.match(/^(\d{1,2})[\s\-/]+(?:de\s+)?([a-zA-Záéíóú]{3,})\.?[\s\-/]+(?:de\s+)?(\d{2,4})(.*)$/))) {
      d = +m[1]; mo = MONTHS[m[2].normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().slice(0, 3)]; y = +m[3]; if (y < 100) y += 2000; rest = m[4];
    } else if ((m = s.match(/^(\d{4})(\d{2})(\d{2})(.*)$/))) { y = +m[1]; mo = +m[2]; d = +m[3]; rest = m[4]; }
    else return null;
    if (!(y > 1900 && mo >= 1 && mo <= 12 && d >= 1 && d <= 31)) return null;
    const min = rest && /\d/.test(rest) ? D.parseTime(rest.replace(/^[T\s,]+/, '')) : NaN;
    return { k: U.dayKey(y, mo, d), min };
  };
  // Duración -> minutos. unit: 'min' | 's' | 'h' | 'day' (fracción de día, formato de hora de Excel)
  D.parseDuration = (v, unit = 'min', dec) => {
    if (v == null || v === '') return NaN;
    if (typeof v === 'number') return unit === 's' ? v / 60 : unit === 'h' ? v * 60 : unit === 'day' ? v * 1440 : v;
    const s = String(v).trim();
    const m = s.match(/^(\d+):(\d{1,2})(?::(\d{1,2}))?(?:[.,]\d+)?$/);
    if (m) return m[3] != null ? (+m[1]) * 60 + (+m[2]) + (+m[3]) / 60 : (+m[1]) + (+m[2]) / 60;
    const x = D.parseNumber(s, dec); if (!isFinite(x)) return NaN;
    return unit === 's' ? x / 60 : unit === 'h' ? x * 60 : unit === 'day' ? x * 1440 : x;
  };
  const TRUE = new Set(['1', 'si', 'sí', 's', 'true', 'verdadero', 'yes', 'y', 'x', 'abandono', 'abandonada', 'abandonado', 'colgo', 'colgó']);
  D.parseBool = (v) => TRUE.has(String(v == null ? '' : v).trim().toLowerCase());

  D.detectDateOrder = (vals) => {
    let dmy = 0, mdy = 0;
    for (const v of vals) { const m = String(v || '').match(/^(\d{1,2})[-/.](\d{1,2})[-/.]\d{2,4}/); if (!m) continue; if (+m[1] > 12) dmy++; if (+m[2] > 12) mdy++; }
    return mdy > dmy ? 'MDY' : 'DMY';
  };
  D.detectDecimal = (rows) => {
    let comma = 0, dot = 0;
    for (const r of rows) for (const v of r) { const s = String(v == null ? '' : v); if (/^-?\d{1,3}(\.\d{3})*,\d+$/.test(s) || /^-?\d+,\d+$/.test(s)) comma++; else if (/^-?\d{1,3}(,\d{3})*\.\d+$/.test(s) || /^-?\d+\.\d+$/.test(s)) dot++; }
    return comma > dot ? ',' : '.';
  };

  /* ---------------- lectura de archivos ---------------- */
  async function detectEncoding(file) {
    const buf = await file.slice(0, 65536).arrayBuffer();
    try { new TextDecoder('utf-8', { fatal: true }).decode(buf); return 'utf-8'; } catch (e) { return 'windows-1252'; }
  }
  D.isExcel = (file) => /\.(xlsx|xlsm|xls|ods)$/i.test(file.name);
  async function loadXLSX() {
    if (root.XLSX) return root.XLSX;
    await QS.UI.loadScript(root.QS_VENDOR && root.QS_VENDOR.xlsx ? root.QS_VENDOR.xlsx : 'vendor/xlsx.full.min.js');
    if (!root.XLSX) throw new Error('No se pudo cargar el lector de Excel. Guarda el archivo como CSV e inténtalo de nuevo.');
    return root.XLSX;
  }
  // Lee la primera hoja y, además, las hojas con los mismos encabezados (por ejemplo, una hoja por mes)
  D.readExcel = async (file) => {
    const X = await loadXLSX();
    const wb = X.read(await file.arrayBuffer(), { type: 'array' });
    const read = (nm) => X.utils.sheet_to_json(wb.Sheets[nm], { header: 1, raw: true, defval: '' });
    const first = read(wb.SheetNames[0]); const headers = (first[0] || []).map(String); const key = headers.map(D.normHeader).join('|');
    let rows = first.slice(1); const used = [wb.SheetNames[0]];
    for (const nm of wb.SheetNames.slice(1)) {
      const all = read(nm); if (!all.length) continue;
      if ((all[0] || []).map((x) => D.normHeader(String(x))).join('|') === key) { rows = rows.concat(all.slice(1)); used.push(nm); }
    }
    return { headers, rows: rows.filter((r) => r.some((x) => x !== '' && x != null)), sheet: used.join(', '), sheets: used.length };
  };
  // Vista previa: primeras filas, delimitador y codificación
  D.preview = async (src) => {
    if (src.type === 'multi') { // varios archivos de la misma área: manda la estructura del primero
      const pv = await D.preview(src.parts[0]); src.headers = pv.headers;
      return Object.assign({}, pv, { note: `${src.parts.length} archivos` });
    }
    if (src.type === 'file' && D.isExcel(src.file)) {
      const x = await D.readExcel(src.file); src.cache = x;
      return { headers: x.headers, rows: x.rows.slice(0, 40), total: x.rows.length, delimiter: 'Excel', encoding: 'xlsx', decimal: '.', note: x.sheets > 1 ? `${x.sheets} hojas: ${x.sheet}` : `Hoja: ${x.sheet}` };
    }
    if (src.type === 'rows') return { headers: src.headers, rows: src.rows.slice(0, 40), total: src.rows.length, delimiter: '—', encoding: '—', decimal: '.' };
    let text;
    if (src.type === 'file') { src.encoding = await detectEncoding(src.file); text = await src.file.slice(0, 262144).text(); if (src.encoding !== 'utf-8') text = new TextDecoder('windows-1252').decode(await src.file.slice(0, 262144).arrayBuffer()); }
    else text = src.text;
    if (!root.Papa) throw new Error('No se cargó PapaParse (lector de CSV).');
    const res = root.Papa.parse(text, { preview: 41, skipEmptyLines: true, delimitersToGuess: [';', ',', '\t', '|'] });
    const rows = res.data; const headers = (rows[0] || []).map((x) => String(x).trim());
    src.delimiter = res.meta.delimiter;
    const body = rows.slice(1);
    return { headers, rows: body, total: src.type === 'file' ? null : null, delimiter: res.meta.delimiter, encoding: src.encoding || 'texto', decimal: D.detectDecimal(body) };
  };
  // Varios archivos de la misma área, uno tras otro. Las columnas se emparejan por nombre con las del primero
  // (el orden puede cambiar entre archivos; una columna que falta en un archivo queda vacía).
  async function eachMulti(src, onRow, onProgress) {
    const canon = src.headers || (await D.preview(src.parts[0])).headers; src.headers = canon;
    for (let pi = 0; pi < src.parts.length; pi++) {
      const part = src.parts[pi];
      const pv = part.pv || (part.pv = await D.preview(part));
      const pos = new Map(pv.headers.map((x, k) => [D.normHeader(String(x)), k]));
      const remap = canon.map((x) => { const k = pos.get(D.normHeader(String(x))); return k == null ? -1 : k; });
      const same = pv.headers.length === canon.length && remap.every((k, j) => k === j);
      await D.eachRow(part, same ? onRow : (r) => onRow(remap.map((k) => (k >= 0 ? r[k] : ''))), onProgress ? (f) => onProgress((pi + f) / src.parts.length) : null);
    }
  }
  // Recorre todas las filas (en bloques para archivos grandes)
  D.eachRow = (src, onRow, onProgress) => (src.type === 'multi' ? eachMulti(src, onRow, onProgress) : new Promise((resolve, reject) => {
    if (src.type === 'rows' || (src.type === 'file' && src.cache)) {
      const rows = src.type === 'rows' ? src.rows : src.cache.rows; let i = 0;
      const step = () => {
        const end = Math.min(rows.length, i + 20000);
        for (; i < end; i++) onRow(rows[i]);
        if (onProgress) onProgress(i / rows.length);
        if (i < rows.length) setTimeout(step, 0); else resolve();
      };
      step(); return;
    }
    let first = true; const total = src.type === 'file' ? src.file.size : src.text.length;
    root.Papa.parse(src.type === 'file' ? src.file : src.text, {
      delimiter: src.delimiter || '', skipEmptyLines: true, encoding: src.encoding === 'windows-1252' ? 'windows-1252' : 'UTF-8', chunkSize: 1024 * 1024 * 2,
      chunk: (res, parser) => {
        for (const r of res.data) { if (first) { first = false; continue; } onRow(r); }
        if (onProgress && res.meta && res.meta.cursor) onProgress(Math.min(1, res.meta.cursor / total));
      },
      complete: () => resolve(), error: (e) => reject(e)
    });
  }));

  /* ---------------- agregación ---------------- */
  class Reservoir {
    constructor(n, seed) { this.n = n; this.a = []; this.seen = 0; this.rng = new QS.RNG(seed || 'res'); }
    add(x) { this.seen++; if (this.a.length < this.n) this.a.push(x); else { const j = Math.floor(this.rng.random() * this.seen); if (j < this.n) this.a[j] = x; } }
  }
  function newDay(k) {
    const z = () => new Float64Array(24);
    return { k, arr: z(), svcSum: z(), svcN: z(), wqSum: z(), wqN: z(), ab: z(), srvSum: z(), srvN: z(), sales: z(), srvSets: null, tot: 0, hourly: true };
  }
  // cfg: {kind, map, dec, dateOrder, durUnit, ticket (para estimar clientes con ventas)}
  D.process = async (src, cfg, onProgress) => {
    const map = cfg.map, kind = cfg.kind, dec = cfg.dec || '.', order = cfg.dateOrder || 'DMY', du = cfg.durUnit || 'min';
    const days = new Map(); const st = { rows: 0, ok: 0, bad: 0, reasons: {}, unsorted: 0, minK: Infinity, maxK: -Infinity };
    const res = { svc: new Reservoir(25000, 's'), ia: new Reservoir(25000, 'i'), wq: new Reservoir(25000, 'w'), ab: new Reservoir(8000, 'a') };
    const iaCtx = []; const classes = {}; const servers = new Set();
    let prevK = null, prevMin = null;
    const bad = (why) => { st.bad++; st.reasons[why] = (st.reasons[why] || 0) + 1; };
    const col = (r, role) => (map[role] != null && map[role] !== '' ? r[map[role]] : undefined);
    const getDay = (k) => { let d = days.get(k); if (!d) { d = newDay(k); days.set(k, d); } return d; };
    const dateTime = (r) => {
      let p = null, timeOnly = NaN;
      const fh = col(r, 'fechahora');
      if (fh !== undefined) { p = D.parseDate(fh, order); if (!p) timeOnly = D.parseTime(fh); }
      if ((!p || !isFinite(p.min)) && col(r, 'fecha') !== undefined) {
        const q = D.parseDate(col(r, 'fecha'), order); if (q) p = { k: q.k, min: isFinite(q.min) ? q.min : (p ? p.min : NaN) };
      }
      if (p && !isFinite(p.min) && isFinite(timeOnly)) p.min = timeOnly;
      if (p && col(r, 'hora') !== undefined) { const t = D.parseTime(col(r, 'hora')); if (isFinite(t)) p.min = t; }
      return p;
    };
    const timeOf = (v, k) => { // hora o fecha-hora -> minutos relativos al día k
      if (v == null || v === '') return NaN;
      if (typeof v === 'number' && v > 20000) { const p = D.parseDate(v); return p ? (p.k - k) * 1440 + (isFinite(p.min) ? p.min : 0) : NaN; }
      const s = String(v);
      if (/\d{1,4}[-/.]\d{1,2}[-/.]\d{1,4}/.test(s)) { const p = D.parseDate(s, order); return p && isFinite(p.min) ? (p.k - k) * 1440 + p.min : NaN; }
      return D.parseTime(v);
    };
    await D.eachRow(src, (r) => {
      st.rows++;
      if (!r || !r.length) { bad('fila vacía'); return; }
      if (kind === 'trans') {
        const p = dateTime(r); if (!p) { bad('fecha no reconocida'); return; }
        if (!isFinite(p.min)) { bad('sin hora de llegada'); return; }
        const k = p.k, hh = Math.min(23, Math.floor(p.min / 60)); const d = getDay(k);
        d.arr[hh] += 1;
        let svc = NaN, wq = NaN;
        const ini = timeOf(col(r, 'inicio'), k), fin = timeOf(col(r, 'fin'), k);
        if (col(r, 'duracion') !== undefined) svc = D.parseDuration(col(r, 'duracion'), du, dec);
        else if (isFinite(ini) && isFinite(fin)) { svc = fin - ini; if (svc < 0) svc += 1440; }
        if (col(r, 'espera') !== undefined) wq = D.parseDuration(col(r, 'espera'), du, dec);
        else if (isFinite(ini)) { wq = ini - p.min; if (wq < -720) wq += 1440; }
        const ab = col(r, 'abandono') !== undefined ? D.parseBool(col(r, 'abandono')) : false;
        if (ab) { d.ab[hh] += 1; if (isFinite(wq) && wq >= 0) res.ab.add(wq); }
        else {
          if (isFinite(svc) && svc > 0 && svc < 720) { d.svcSum[hh] += svc; d.svcN[hh] += 1; res.svc.add(svc); }
          if (isFinite(wq) && wq >= 0 && wq < 1440) { d.wqSum[hh] += wq; d.wqN[hh] += 1; res.wq.add(wq); }
        }
        const sv = col(r, 'servidor'); if (sv !== undefined && sv !== '') { servers.add(String(sv)); if (!d.srvSets) d.srvSets = U.range(24, () => new Set()); d.srvSets[hh].add(String(sv)); }
        const cl = col(r, 'clase'); if (cl !== undefined && cl !== '') classes[cl] = (classes[cl] || 0) + 1;
        const vt = D.parseNumber(col(r, 'ventas'), dec); if (isFinite(vt)) d.sales[hh] += vt;
        if (prevK === k && prevMin != null) {
          const ia = p.min - prevMin;
          if (ia >= 0) { if (ia < 240) { res.ia.add(ia); if (iaCtx.length < 30000) iaCtx.push([ia, k, hh]); } } else st.unsorted++;
        }
        prevK = k; prevMin = p.min;
        st.ok++; if (k < st.minK) st.minK = k; if (k > st.maxK) st.maxK = k;
      } else if (kind === 'interval') {
        const p = dateTime(r); if (!p) { bad('fecha no reconocida'); return; }
        if (!isFinite(p.min)) { bad('sin hora del intervalo'); return; }
        let n = D.parseNumber(col(r, 'llegadas'), dec);
        if (!isFinite(n) && col(r, 'ventas') !== undefined && cfg.ticket > 0) n = D.parseNumber(col(r, 'ventas'), dec) / cfg.ticket;
        if (!isFinite(n) || n < 0) { bad('cantidad de clientes inválida'); return; }
        const k = p.k + Math.floor(p.min / 1440), hh = Math.min(23, Math.floor((p.min % 1440) / 60)); const d = getDay(k);
        d.arr[hh] += n;
        const t = col(r, 'tmo') !== undefined ? D.parseDuration(col(r, 'tmo'), du, dec) : NaN;
        if (isFinite(t) && t > 0 && n > 0) { d.svcSum[hh] += t * n; d.svcN[hh] += n; }
        const w = col(r, 'espera') !== undefined ? D.parseDuration(col(r, 'espera'), du, dec) : NaN;
        if (isFinite(w) && w >= 0 && n > 0) { d.wqSum[hh] += w * n; d.wqN[hh] += n; }
        const a = D.parseNumber(col(r, 'abandonos'), dec); if (isFinite(a)) d.ab[hh] += a;
        const s = D.parseNumber(col(r, 'servidores'), dec); if (isFinite(s)) { d.srvSum[hh] += s; d.srvN[hh] += 1; }
        const vt = D.parseNumber(col(r, 'ventas'), dec); if (isFinite(vt)) d.sales[hh] += vt;
        st.ok++; if (k < st.minK) st.minK = k; if (k > st.maxK) st.maxK = k;
      } else {
        const p = D.parseDate(col(r, 'fecha'), order); if (!p) { bad('fecha no reconocida'); return; }
        let n = D.parseNumber(col(r, 'llegadas'), dec);
        const vt = D.parseNumber(col(r, 'ventas'), dec);
        if (!isFinite(n) && isFinite(vt) && cfg.ticket > 0) n = vt / cfg.ticket;
        if (!isFinite(n) || n < 0) { bad('cantidad de clientes inválida'); return; }
        const d = getDay(p.k); d.hourly = false; d.tot += n; d.arr = null;
        if (isFinite(vt)) d.salesTot = (d.salesTot || 0) + vt;
        const t = col(r, 'tmo') !== undefined ? D.parseDuration(col(r, 'tmo'), du, dec) : NaN;
        if (isFinite(t) && t > 0) { d.svcDay = t; }
        const a = D.parseNumber(col(r, 'abandonos'), dec); if (isFinite(a)) d.abTot = (d.abTot || 0) + a;
        st.ok++; if (p.k < st.minK) st.minK = p.k; if (p.k > st.maxK) st.maxK = p.k;
      }
    }, onProgress);
    // cierre de cada día
    const list = Array.from(days.values()).sort((a, b) => a.k - b.k);
    let has = { svc: false, wq: false, ab: false, srv: false, sales: false, hourly: kind !== 'daily' };
    for (const d of list) {
      const inf = U.dayInfo(d.k); Object.assign(d, { y: inf.y, m: inf.m, d: inf.d, dow: inf.dow, doy: inf.doy, dim: inf.dim });
      if (d.hourly && d.arr) {
        d.tot = U.sum(d.arr);
        if (d.srvSets) { for (let hh = 0; hh < 24; hh++) if (d.srvSets[hh].size) { d.srvSum[hh] = d.srvSets[hh].size; d.srvN[hh] = 1; } d.srvSets = null; }
        if (U.sum(d.svcN) > 0) has.svc = true; if (U.sum(d.wqN) > 0) has.wq = true; if (U.sum(d.ab) > 0) has.ab = true;
        if (U.sum(d.srvN) > 0) has.srv = true; if (U.sum(d.sales) > 0) has.sales = true;
      } else {
        if (d.svcDay) has.svc = true; if (d.abTot) has.ab = true; if (d.salesTot) has.sales = true;
      }
    }
    // Contexto de tiempos entre llegadas para el test de reescalamiento temporal
    const ds = { kind, days: list, byK: days, k0: st.minK, k1: st.maxK, has, stats: st, samples: { svc: res.svc.a, ia: res.ia.a, wq: res.wq.a, ab: res.ab.a }, iaCtx,
      classes, nServers: servers.size, durUnit: du, source: src.name || (src.file && src.file.name) || 'datos' };
    D.state.ds = ds;
    return ds;
  };

  /* ---------------- plantillas y datos de ejemplo ---------------- */
  D.templates = {
    transaccional: () => U.toCSV(['llegada', 'inicio_atencion', 'fin_atencion', 'caja', 'tipo_cliente', 'abandono'], [
      ['2025-03-14 09:02:11', '2025-03-14 09:02:40', '2025-03-14 09:07:55', 'C1', 'General', 'no'],
      ['2025-03-14 09:03:05', '2025-03-14 09:04:12', '2025-03-14 09:11:30', 'C2', 'Preferencial', 'no'],
      ['2025-03-14 09:03:40', '', '', '', 'General', 'si'],
      ['2025-03-14 09:05:58', '2025-03-14 09:07:55', '2025-03-14 09:12:02', 'C1', 'General', 'no']], { sep: ',' }),
    intervalos: () => U.toCSV(['fecha', 'hora', 'llegadas', 'tmo_min', 'espera_prom_min', 'abandonos', 'servidores', 'ventas'], [
      ['2025-03-14', '09:00', 38, 5.6, 2.1, 1, 4, 15840], ['2025-03-14', '10:00', 52, 5.9, 3.4, 2, 4, 22310], ['2025-03-14', '11:00', 61, 6.1, 4.8, 3, 5, 25120]], { sep: ',' }),
    diaria: () => U.toCSV(['fecha', 'clientes', 'ventas', 'tmo_min', 'abandonos'], [
      ['2025-03-12', 512, 214300, 5.8, 14], ['2025-03-13', 548, 230110, 5.9, 18], ['2025-03-14', 611, 262450, 6.0, 25]], { sep: ',' })
  };

  // Genera ~4 años y 9 meses de datos por hora de una sucursal ficticia con patrones realistas
  D.generate = function (o = {}) {
    const rng = new QS.RNG(o.seed || 'sucursal-centro');
    const y0 = 2022, kStart = U.dayKey(y0, 1, 1), kEnd = U.dayKey(2026, 9, 30);
    const monthIdx = [0.88, 0.9, 0.97, 0.98, 1.06, 0.96, 1.02, 1.05, 0.95, 0.98, 1.1, 1.32];
    const dowIdx = [1.05, 0.93, 0.92, 0.97, 1.12, 1.28, 0.55];
    const wk = [0.6, 0.85, 1.0, 1.25, 1.35, 1.15, 0.9, 0.95, 1.15, 1.05]; // 9..18
    const sat = [0.75, 1.05, 1.3, 1.35, 1.2, 1.0, 0.85, 0.8, 0.7, 0.55];
    const sun = [0.8, 1.1, 1.25, 1.1, 0.75]; // 10..14
    const norm = (a) => { const s = U.sum(a); return a.map((x) => x / s); };
    const pW = norm(wk), pS = norm(sat), pD = norm(sun);
    const growth = (k) => { const t = (k - kStart) / 365.25; return 520 * Math.exp(0.075 * Math.min(t, 2) + 0.05 * Math.max(0, Math.min(t, 3) - 2) + 0.06 * Math.max(0, t - 3)); };
    const closed = new Set(); const special = new Map();
    for (let y = y0; y <= 2026; y++) {
      const e = U.easter(y);
      closed.add(U.dayKey(y, 1, 1)); closed.add(U.dayKey(y, 5, 1)); closed.add(U.dayKey(y, 12, 25)); closed.add(e - 3); closed.add(e - 2);
      for (let k = e - 6; k <= e - 4; k++) special.set(k, 0.85);
      const bf = U.nthDow(y, 11, 0, 3) - 3; for (let k = bf; k <= bf + 3; k++) special.set(k, 1.45); // "Buen Fin": vie-lun antes del 3er lunes de nov.
      for (let d = 18; d <= 23; d++) special.set(U.dayKey(y, 12, d), 1.25);
      special.set(U.dayKey(y, 12, 24), 1.3); special.set(U.dayKey(y, 12, 31), 0.9);
      for (let d = 8; d <= 10; d++) special.set(U.dayKey(y, 5, d), 1.2);
      special.set(U.dayKey(y, 1, 6), 1.15);
    }
    const headers = ['fecha', 'hora', 'llegadas', 'tmo_min', 'espera_prom_min', 'abandonos', 'servidores', 'ventas'];
    const rows = [];
    for (let k = kStart; k <= kEnd; k++) {
      if (closed.has(k)) continue;
      const di = U.dayInfo(k);
      let level = growth(k) * monthIdx[di.m - 1] * dowIdx[di.dow];
      const dom = di.d; const last = di.dim;
      if (dom === 15 || dom === 16 || dom === last || dom === 1 || dom === 2) level *= 1.22; else if (dom === 14 || dom === 17 || dom === last - 1) level *= 1.08;
      if (special.has(k)) level *= special.get(k);
      level *= Math.exp(0.07 * rng.normal());
      let open = 9, prof = di.dow === 5 ? pS : pW;
      if (di.dow === 6) { open = 10; prof = pD; }
      const shortDay = (di.m === 12 && (di.d === 24 || di.d === 31));
      const hrs = shortDay ? Math.min(prof.length, 6) : prof.length;
      const profUse = shortDay ? norm(prof.slice(0, hrs)) : prof;
      for (let i = 0; i < hrs; i++) {
        const hr = open + i; const lam = level * profUse[i];
        const n = rng.poisson(lam);
        let aht = 5.8 + (di.m === 12 ? 0.6 : di.m === 11 ? 0.3 : 0) - (hr >= 12 && hr <= 14 ? 0.3 : 0) + 0.15 * rng.normal();
        aht = Math.max(3, aht);
        // personal histórico: se programaba con la demanda esperada, pero quedaba corto en las horas pico y en diciembre
        const short = (hr >= 12 && hr <= 14 ? 1 : 0) + (di.dow === 5 && hr >= 11 && hr <= 14 ? 1 : 0) + (di.m === 12 && di.y < 2025 ? 1 : 0);
        const srv = Math.max(1, Math.round(lam * aht / 60 / 0.82 + 0.5 + 0.45 * rng.normal()) - short);
        const r = QS.Analytic.compute('erlangA', { lam: n, mu: 60 / aht, c: srv, theta: 60 / 15 });
        const wq = r.ok ? Math.min(60, r.Wq * 60) : 30; const ab = Math.round(n * (r.ok ? r.Pab : 0.2));
        const ahtObs = n > 0 ? Math.max(1, aht + aht * 0.75 / Math.sqrt(n) * rng.normal()) : '';
        const ticket = 410 * (di.m === 12 ? 1.25 : di.m === 11 ? 1.12 : 1) * Math.exp(0.1 * rng.normal());
        rows.push([U.isoDay(k), U.pad2(hr) + ':00', n, n ? +ahtObs.toFixed(2) : '', n ? +wq.toFixed(2) : '', ab, srv, Math.round(n * ticket)]);
      }
    }
    return { headers, rows, name: 'Sucursal Centro (ejemplo 2022–2026)' };
  };
  // Datos transaccionales de ejemplo (2 semanas) generados con el propio motor de simulación
  D.generateTrans = function () {
    const rows = []; let idn = 0;
    const k0 = U.dayKey(2026, 9, 14);
    for (let day = 0; day < 13; day++) {
      const k = k0 + day; const di = U.dayInfo(k); if (di.dow === 6) continue;
      const prof = di.dow === 5 ? [55, 80, 100, 105, 95, 80, 65, 60, 55, 40] : [40, 55, 65, 80, 88, 75, 58, 62, 75, 68];
      const servers = di.dow === 5 ? [7, 9, 11, 11, 11, 9, 8, 7, 7, 5] : [5, 7, 8, 9, 10, 9, 7, 8, 8, 8];
      const recs = new Map();
      const spec = QS.Sim.normalize({ open: 540, arrivals: { mode: 'profile', profile: prof }, classes: [{ name: 'General', share: 86, prio: 2 }, { name: 'Preferencial', share: 14, prio: 1, svcMult: 1.25 }],
        renege: { on: true, dist: { type: 'exp', mean: 18 } }, stages: [{ name: 'Cajas', servers: 8, useSchedule: true, schedule: servers, svc: { type: 'gamma', mean: 5.8, sd: 4.3 }, disc: 'PRIO' }],
        run: { hours: 10, warmupH: 0, drain: true, seed: 'tr' + day, slT: 5 } });
      const sim = new QS.Sim(spec, 'tr' + day, { keepWaits: false, onEvent: (type, c, v) => {
        if (type === 'arrive' && !recs.has(c.id)) recs.set(c.id, { arr: c.t0, cls: c.k });
        if (type === 'start' && c.st === 0 && recs.get(c.id).start == null) { const r = recs.get(c.id); r.start = sim.t; r.srv = 'C' + (v.i + 1); }
        if (type === 'depart') recs.get(c.id).end = sim.t;
        if (type === 'abandon') recs.get(c.id).ab = true;
      } });
      sim.runAll();
      const ts = (m) => { const t = 540 + m; const hh = Math.floor(t / 60), mm = Math.floor(t % 60), ss = Math.floor((t * 60) % 60); return `${U.isoDay(k)} ${U.pad2(hh)}:${U.pad2(mm)}:${U.pad2(ss)}`; };
      for (const r of recs.values()) {
        idn++;
        rows.push([idn, ts(r.arr), r.start != null ? ts(r.start) : '', r.end != null ? ts(r.end) : '', r.srv || '', r.cls === 1 ? 'Preferencial' : 'General', r.ab ? 'si' : 'no']);
      }
    }
    return { headers: ['folio', 'llegada', 'inicio_atencion', 'fin_atencion', 'caja', 'tipo_cliente', 'abandono'], rows, name: 'Tickets de ejemplo (2 semanas)' };
  };

  /* ---------------- plantillas por giro ---------------- */
  const slug = (s) => D.normHeader(s).replace(/^_+|_+$/g, '');
  // Formato del reporte de sistema de cada giro (encabezados + filas de ejemplo)
  D.systemTemplate = (sec, area) => {
    const sv = slug(area.server);
    switch (sec.id) {
      case 'retail': case 'super':
        return { name: `formato_tickets_${sv}.csv`, headers: ['fecha_hora_ticket', sv, 'hora_inicio_ticket', 'monto', 'articulos'],
          rows: [['2025-03-14 12:31:05', 'C1', '2025-03-14 12:28:40', 845.5, 6], ['2025-03-14 12:31:40', 'C3', '2025-03-14 12:27:55', 2310, 23], ['2025-03-14 12:32:12', 'C2', '2025-03-14 12:30:58', 129, 2]] };
      case 'callcenter':
        return { name: 'formato_reporte_acd.csv', headers: ['fecha', 'intervalo', 'llamadas_ofrecidas', 'llamadas_atendidas', 'abandonadas', 'tmo_seg', 'agentes_conectados'],
          rows: [['2025-03-14', '09:00', 52, 49, 3, 268, 9], ['2025-03-14', '09:30', 61, 56, 5, 275, 9], ['2025-03-14', '10:00', 70, 66, 4, 262, 11]] };
      case 'restaurante':
        return { name: 'formato_ordenes.csv', headers: ['fecha_hora_orden', 'hora_entrega', 'canal', 'monto'],
          rows: [['2025-03-14 14:02:11', '2025-03-14 14:05:40', 'mostrador', 189], ['2025-03-14 14:02:50', '2025-03-14 14:07:02', 'drive-thru', 245]] };
      default:
        return { name: `formato_turnos_${sv}.csv`, headers: ['hora_emision', 'hora_llamado', 'hora_fin', sv, 'tramite', 'estado'],
          rows: [['2025-03-14 09:02:11', '2025-03-14 09:06:40', '2025-03-14 09:12:05', 'V1', 'Depósito', 'atendido'], ['2025-03-14 09:03:30', '2025-03-14 09:09:12', '2025-03-14 09:20:44', 'V2', 'Aclaración', 'atendido'], ['2025-03-14 09:04:02', '', '', '', 'Retiro', 'abandonado']] };
    }
  };
  D.manualTemplates = (sec, area) => {
    const sv = slug(area.servers);
    return {
      conteo: { name: 'planilla_conteo_por_hora.csv', headers: ['fecha', 'hora', 'clientes_que_llegaron', `${sv}_abiertas`, 'notas'],
        rows: [['2025-03-14', '10:00', 38, 3, ''], ['2025-03-14', '11:00', 52, 3, ''], ['2025-03-14', '12:00', 71, 4, 'quincena'], ['2025-03-14', '13:00', 80, 5, '']] },
      tiempos: { name: 'planilla_tiempos_de_atencion.csv', headers: ['fecha', 'hora_inicio', slug(area.server), 'duracion_seg', 'notas'],
        rows: [['2025-03-14', '12:05', '1', 165, ''], ['2025-03-14', '12:09', '2', 212, 'pago con tarjeta'], ['2025-03-14', '12:14', '1', 98, '']] },
      historia: { name: 'planilla_ventas_diarias.csv', headers: ['fecha', 'ventas', 'tickets'],
        rows: [['2024-01-02', 48210, 132], ['2024-01-03', 45980, 127], ['2024-01-04', 51200, 140]] }
    };
  };

  // Lee una muestra de tiempos de atención (columna de duración, o columnas de inicio y fin) -> minutos
  D.processDurations = async (src, opts = {}) => {
    const pv = src.cache ? null : await D.preview(src);
    const headers = (pv ? pv.headers : src.cache.headers).map(String); const norm = headers.map(D.normHeader);
    let dCol = norm.findIndex((x) => /(duracion|tiempo|dur_|seg|min|aht|tmo)/.test(x) && !/(fecha|hora_ini|inicio|fin)/.test(x));
    const iCol = norm.findIndex((x) => /(inicio|start|llamad)/.test(x)), fCol = norm.findIndex((x) => /(^fin|_fin|end|termin)/.test(x));
    if (opts.col != null) dCol = opts.col;
    let unit = opts.unit || (dCol >= 0 && /(seg|sec|_s$)/.test(norm[dCol]) ? 's' : 'min');
    const dec = opts.dec || (pv ? pv.decimal : '.');
    const vals = []; let bad = 0;
    await D.eachRow(src, (r) => {
      let v = NaN;
      if (dCol >= 0) v = D.parseDuration(r[dCol], unit, dec);
      else if (iCol >= 0 && fCol >= 0) { const a = D.parseTime(String(r[iCol]).split(/[ T]/).pop()), b = D.parseTime(String(r[fCol]).split(/[ T]/).pop()); v = b - a; if (v < 0) v += 1440; }
      if (isFinite(v) && v > 0 && v < 600) vals.push(v); else bad++;
    });
    // si "minutos" da valores enormes, probablemente eran segundos
    if (unit === 'min' && vals.length && U.median(vals) > 60) { for (let i = 0; i < vals.length; i++) vals[i] /= 60; unit = 's'; }
    return { values: vals, n: vals.length, bad, unit, column: dCol >= 0 ? headers[dCol] : (iCol >= 0 && fCol >= 0 ? `${headers[iCol]} → ${headers[fCol]}` : null) };
  };

  /* ---------------- datos ficticios por giro ---------------- */
  // Genera ~3,7 años de conteos por hora con los patrones típicos del giro (para probar el asistente)
  D.generateFor = function (sec, area, o = {}) {
    const rng = new QS.RNG('ej-' + sec.id + '-' + area.id);
    const kStart = U.dayKey(2023, 1, 1), kEnd = U.dayKey(2026, 9, 30);
    const evs = (QS.Analysis ? QS.Analysis.eventsFor(sec.events) : []).filter((e) => e.on);
    const lift = { buenfin: 1.45, hotsale: 1.18, navidad: 1.22, nochebuena: 1.25, finanio: 0.95, reyes: 1.12, madres: 1.2, padre: 1.12, clases: 1.06, rebajas: 0.92, sanvalentin: 1.1, ss1: 0.88, aguinaldo: 1.25, predial: 1.2, impuestos: 1.15, bf: 1.2 };
    const special = new Map(), closed = new Set();
    for (let y = 2023; y <= 2026; y++) {
      for (const ev of evs) { if (ev.id === 'ss2') { for (const k of QS.Analysis.eventDays(ev, y)) closed.add(k); continue; } const f = lift[ev.id] || 1.1; for (const k of QS.Analysis.eventDays(ev, y)) special.set(k, f); }
      closed.add(U.dayKey(y, 1, 1)); closed.add(U.dayKey(y, 12, 25)); if (sec.id !== 'retail' && sec.id !== 'super' && sec.id !== 'restaurante') closed.add(U.dayKey(y, 5, 1));
    }
    const mi = sec.monthIdx, mm = U.mean(mi);
    const base = (sec.sampleBase || 400) * (o.scale || 1);
    const ahtBase = area.aht, cv = area.cv;
    const headers = ['fecha', 'hora', area.unit.replace(/\s+/g, '_'), 'tmo_min', 'abandonos', slug(area.servers) + '_abiertas'];
    const rows = [];
    for (let k = kStart; k <= kEnd; k++) {
      if (closed.has(k)) continue;
      const di = U.dayInfo(k); if (!sec.hours.days[di.dow] || !(sec.dowIdx[di.dow] > 0)) continue;
      const share = QS.Sectors.dayShare(sec, di.dow, sec.hours); if (!share.some((x) => x > 0)) continue;
      const t = (k - kStart) / 365.25;
      let level = base * Math.exp(0.055 * t) * (mi[di.m - 1] / mm) * sec.dowIdx[di.dow];
      if (di.d === 15 || di.d === 16 || di.d === di.dim || di.d <= 2) level *= sec.id === 'retail' || sec.id === 'super' || sec.id === 'banco' ? 1.15 : 1.04;
      if (special.has(k)) level *= special.get(k);
      level *= Math.exp(0.06 * rng.normal());
      for (let hh = 0; hh < 24; hh++) {
        if (!(share[hh] > 0)) continue;
        const lam = level * share[hh]; const n = rng.poisson(lam);
        const aht = Math.max(0.3, ahtBase * (1 + (di.m === 12 ? 0.08 : 0)) * (1 + 0.04 * rng.normal()));
        const c = Math.max(1, Math.round(lam * aht / 60 / 0.8 + 0.6 * rng.normal()) - (share[hh] >= Math.max(...share) * 0.92 ? 1 : 0));
        let ab = 0;
        if (n > 0) { const r = QS.Analytic.compute('erlangA', { lam: n, mu: 60 / aht, c, theta: 60 / Math.max(2, area.patience || 15) }); ab = Math.round(n * (r.ok ? r.Pab : 0.1)); }
        const ahtObs = n > 0 ? Math.max(0.2, aht + aht * cv / Math.sqrt(n) * rng.normal()) : '';
        rows.push([U.isoDay(k), U.pad2(hh) + ':00', n, n ? +ahtObs.toFixed(2) : '', ab, c]);
      }
    }
    return { headers, rows, name: `Ejemplo ficticio: ${sec.name} · ${area.name}` };
  };
})(typeof window !== 'undefined' ? window : globalThis);
