/* Genera las plantillas y los archivos de datos de ejemplo de las carpetas plantillas/ y datos_ejemplo/.
   Ejecutar con:  node tests/generar_archivos_ejemplo.js  */
'use strict';
const fs = require('fs'), vm = require('vm'), path = require('path');
const ROOT = path.join(__dirname, '..');
const ctx = { console, Math, Date, Intl, setTimeout, Promise, TextDecoder };
ctx.window = ctx; ctx.globalThis = ctx; ctx.self = ctx; vm.createContext(ctx);
for (const f of ['util', 'rng', 'analytic', 'engine', 'staffing', 'data', 'analysis', 'measure']) vm.runInContext(fs.readFileSync(path.join(ROOT, 'js', f + '.js'), 'utf8'), ctx);
const { Data: D, Measure: MS, U } = ctx.QS;
const out = (rel, text) => { const p = path.join(ROOT, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, text, 'utf8'); console.log('escrito', rel, (text.length / 1024).toFixed(0) + ' KB'); };
out('plantillas/plantilla_transaccional.csv', D.templates.transaccional());
out('plantillas/plantilla_intervalos.csv', D.templates.intervalos());
out('plantillas/plantilla_diaria.csv', D.templates.diaria());
const g = D.generate();
out('datos_ejemplo/sucursal_centro_por_hora_2022_2026.csv', U.toCSV(g.headers, g.rows, { sep: ',' }));
const t = D.generateTrans();
out('datos_ejemplo/tickets_individuales_2_semanas.csv', U.toCSV(t.headers, t.rows, { sep: ',' }));
// Estándar de datos y proceso de dos áreas (tienda con crédito): facturas de cajas y recibos REC de facturación
const std = MS.standardTemplate(), dic = MS.dictionary();
out('plantillas/' + std.name, U.toCSV(std.headers, std.rows, { sep: ',' }));
out('plantillas/' + dic.name, U.toCSV(dic.headers, dic.rows, { sep: ',' }));
const sf = MS.sampleFiles();
out('datos_ejemplo/' + sf.facturas.name, U.toCSV(sf.facturas.headers, sf.facturas.rows, { sep: ',' }));
out('datos_ejemplo/' + sf.recibos.name, U.toCSV(sf.recibos.headers, sf.recibos.rows, { sep: ',' }));
