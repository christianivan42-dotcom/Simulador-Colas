/* Validación del método de medición con valores reales conocidos.
   Se generan reportes de ERP (facturas de cajas y recibos REC de facturación) simulando una operación cuyos parámetros
   verdaderos se conocen; luego se miden con el mismo procedimiento que usa la aplicación y se comparan con la verdad.
   Ejecutar con:  node tests/validar_medicion.js   (unos 2 minutos). Escribe tests/VALIDACION_MEDICION.md */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
for (const f of ['util', 'rng', 'analytic', 'engine', 'staffing', 'data', 'analysis', 'measure']) vm.runInThisContext(fs.readFileSync(path.join(__dirname, '..', 'js', f + '.js'), 'utf8'), { filename: f });
const { Measure: MS, U } = globalThis.QS;

const SCEN = [
  { id: 'base', name: 'Base (ocupación media, CV 0,5, traslado 0,3–0,9 min)', o: {}, walk: 0.6 },
  { id: 'carga', name: 'Alta ocupación (+20 % de demanda, mismo personal)', o: { demand: 1.2 }, walk: 0.6 },
  { id: 'cv', name: 'Alta variabilidad de la atención (CV 0,9)', o: { cvA: 0.9, cvB: 0.9 }, walk: 0.6 },
  { id: 'tiempos', name: 'Otros tiempos de atención', o: { a: { contado: 2.5, credito: 11 }, b: { contado: 1.6, entrada: 4.0, cuota: 2.4 } }, walk: 0.6 },
  { id: 'fila', name: 'Una fila por punto en facturación', o: { queueB: 'multi' }, walk: 0.6, queueB: 'multi' },
  { id: 'traslado', name: 'Traslado largo (1–2 min) indicado correctamente', o: { walk: [1, 2] }, walk: 1.5 },
  { id: 'traslado_mal', name: 'Traslado largo (1–2 min) pero se deja el valor por defecto (0,5 min)', o: { walk: [1, 2] }, walk: 0.5 }
];
const pc = (x) => (x >= 0 ? '+' : '') + (x * 100).toFixed(1).replace('.', ',') + ' %';
const rows = [];
(async () => {
  const t0 = Date.now();
  for (const sc of SCEN) {
    const f = MS.sampleFiles(Object.assign({ seed: sc.id }, sc.o)); const T = f.truth;
    const proc = MS.fromTemplate('retail_credito'); proc.walk = sc.walk; if (sc.queueB) proc.areas[1].queue = sc.queueB;
    const areas = [];
    for (const [ai, file] of [[0, f.facturas], [1, f.recibos]]) {
      const map = MS.guessFields(file.headers); const src = { type: 'rows', headers: file.headers, rows: file.rows };
      const vals = await MS.distinctValues(src, map.tipo); const tm = MS.autoTypeMap(vals.map((v) => v[0]), proc.areas[ai].types);
      areas.push(await MS.readArea(src, { map, typeMap: tm, labels: proc.areas[ai].types, dateOrder: 'DMY', groupSec: 20, name: proc.areas[ai].name, queue: proc.areas[ai].queue }));
    }
    const comb = await MS.measureProcess(proc, areas, { walk: sc.walk });
    const C = T.counts, tot = C.contado + C.entrada + C.sin + C.cuota;
    const trueShare = [C.contado / tot, C.entrada / tot, C.sin / tot, C.cuota / tot];
    const flowErr = Math.max(...comb.flows.map((fl, j) => Math.abs(fl.share - trueShare[j])));
    const B = areas[1], A0 = areas[0];
    const bErr = [B.svc[0].mean / T.b.contado - 1, B.svc[1].mean / T.b.entrada - 1, B.svc[2].mean / T.b.cuota - 1];
    const maxOk = A0.svc[0].mean >= T.a.contado * 0.98 && A0.svc[1].mean >= T.a.credito * 0.95;
    const aMax = [A0.svc[0].mean / T.a.contado - 1, A0.svc[1].mean / T.a.credito - 1];
    MS.setOverride(A0, 0, { mean: T.a.contado, src: 'indicado' });
    const aAdj = A0.svc[1].mean / T.a.credito - 1;
    const val5 = await MS.validateModel(proc, areas, comb, 5, { reps: 10 });
    const val0 = await MS.validateModel(proc, areas, comb, 0, { reps: 10 });
    const wape = Math.max(...val5.areas.map((v) => v.wape), ...val0.areas.map((v) => v.wape));
    // Camino completo con mediciones en tienda: 42 y 31 atenciones cronometradas en cajas y 12 traslados (con su error de muestreo)
    const meas = MS.sampleMeasurements(T, { seed: sc.id });
    let comb2 = comb;
    if (MS.applyMeasurements(proc, areas, meas)) { comb2 = await MS.measureProcess(proc, areas, { walk: proc.walk }); MS.applyMeasurements(proc, areas, meas); }
    const mA = [A0.svc[0].mean / T.a.contado - 1, A0.svc[1].mean / T.a.credito - 1];
    const mB = [B.svc[0].mean / T.b.contado - 1, B.svc[1].mean / T.b.entrada - 1, B.svc[2].mean / T.b.cuota - 1];
    const valM = await MS.validateModel(proc, areas, comb2, 5, { reps: 10 });
    const wapeM = Math.max(...valM.areas.map((v) => v.wape));
    const r = { sc, flowErr, bErr, aMax, aAdj, maxOk, wape, cvB: B.linkFit ? B.linkFit.cv : NaN, mA, mB, wapeM, walkM: proc.walk };
    rows.push(r);
    console.log(`${sc.name}: flujos máx ${pc(flowErr)} pp | Facturación ${bErr.map(pc).join(' / ')} | Cajas máximo ${aMax.map(pc).join(' / ')} (cota ${maxOk ? 'sí' : 'NO'}) | crédito con dato ${pc(aAdj)} | validación ${pc(wape)} | con cronómetro: cajas ${mA.map(pc).join(' / ')}, facturación ${mB.map(pc).join(' / ')}, validación ${pc(wapeM)}`);
  }
  let md = `# Validación del método de medición con valores conocidos\n\nGenerado con \`node tests/validar_medicion.js\` (${new Date().toISOString().slice(0, 10)}, ${((Date.now() - t0) / 60000).toFixed(1)} min).\n\n`;
  md += 'Para cada escenario se simulan 4 meses de una tienda con crédito cuyos parámetros verdaderos se conocen (cajas que emiten facturas y facturación que emite recibos REC), se exportan los reportes como los daría un ERP (solo fecha, hora, punto, tipo, número de documento, documento relacionado y cliente) y se miden con el mismo procedimiento de la aplicación. Error = (medido − verdadero) / verdadero.\n\n';
  md += '| Escenario | Participación de flujos (error máx., puntos) | Facturación: pago contado / entrada / cuota | Cajas sin dato: máximo probable contado / crédito | Cajas con el promedio de contado: crédito | Error por hora del modelo (máx.) |\n|---|---:|---|---|---:|---:|\n';
  rows.forEach((r) => { md += `| ${r.sc.name} | ${(r.flowErr * 100).toFixed(2).replace('.', ',')} | ${r.bErr.map(pc).join(' / ')} | ${r.aMax.map(pc).join(' / ')}${r.maxOk ? '' : ' (no es cota)'} | ${pc(r.aAdj)} | ${pc(r.wape)} |\n`; });
  md += '\n## Camino completo con mediciones en tienda\n\nEn cada escenario se simulan las mediciones que haría la tienda con el cronómetro de la aplicación: 42 atenciones de contado y 31 de crédito en cajas, y 12 traslados de cajas a facturación (con su error de muestreo real). Se aplican igual que en la aplicación y se vuelve a calcular la atención de facturación con el traslado medido.\n\n';
  md += '| Escenario | Traslado medido (min) | Cajas: contado / crédito | Facturación: pago contado / entrada / cuota | Error por hora del modelo (sábado) |\n|---|---:|---|---|---:|\n';
  rows.forEach((r) => { md += `| ${r.sc.name} | ${r.walkM.toFixed(2).replace('.', ',')} | ${r.mA.map(pc).join(' / ')} | ${r.mB.map(pc).join(' / ')} | ${pc(r.wapeM)} |\n`; });
  md += '\n**Lectura.** Los flujos se recuperan casi exactos en todos los escenarios. La atención de facturación se infiere con el tiempo entre la factura y su REC; su precisión depende de conocer el tiempo de traslado entre áreas: con el valor por defecto y un traslado real largo, el error llega a 16–29 % (último escenario de la primera tabla); con 12 traslados cronometrados vuelve a quedar en pocos puntos (segunda tabla). En cajas, con solo la hora de emisión, el valor es una cota superior ("máximo probable"); con las atenciones cronometradas, el error es el de muestreo de 30 a 40 mediciones (intervalo de confianza del 95 % de ±15 a ±20 % con CV 0,55; ±30 % con CV 0,9). Más mediciones lo reducen: con 100, ±10 %.\n';
  fs.writeFileSync(path.join(__dirname, 'VALIDACION_MEDICION.md'), md);
  console.log('Escrito tests/VALIDACION_MEDICION.md');
})().catch((e) => { console.error(e); process.exitCode = 1; });
