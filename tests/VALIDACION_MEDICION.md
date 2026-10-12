# Validación del método de medición con valores conocidos

Generado con `node tests/validar_medicion.js` (2026-10-12, 0.2 min).

Para cada escenario se simulan 4 meses de una tienda con crédito cuyos parámetros verdaderos se conocen (cajas que emiten facturas y facturación que emite recibos REC), se exportan los reportes como los daría un ERP (solo fecha, hora, punto, tipo, número de documento, documento relacionado y cliente) y se miden con el mismo procedimiento de la aplicación. Error = (medido − verdadero) / verdadero.

| Escenario | Participación de flujos (error máx., puntos) | Facturación: pago contado / entrada / cuota | Cajas sin dato: máximo probable contado / crédito | Cajas con el promedio de contado: crédito | Error por hora del modelo (máx.) |
|---|---:|---|---|---:|---:|
| Base (ocupación media, CV 0,5, traslado 0,3–0,9 min) | 0,30 | +0,8 % / +1,2 % / -0,7 % | +48,7 % / +16,0 % | -2,8 % | +6,3 % |
| Alta ocupación (+20 % de demanda, mismo personal) | 0,43 | +1,5 % / +0,7 % / +2,9 % | +21,3 % / +6,7 % | -1,5 % | +6,2 % |
| Alta variabilidad de la atención (CV 0,9) | 0,29 | +2,5 % / -0,2 % / +5,0 % | +55,9 % / +15,1 % | -6,5 % | +6,5 % |
| Otros tiempos de atención | 0,15 | +1,7 % / +1,1 % / +1,2 % | +59,4 % / +14,0 % | +0,5 % | +6,7 % |
| Una fila por punto en facturación | 0,48 | +2,0 % / +1,3 % / +0,3 % | +48,5 % / +20,1 % | +1,4 % | +5,9 % |
| Traslado largo (1–2 min) indicado correctamente | 0,27 | +1,6 % / +1,4 % / +1,7 % | +48,3 % / +16,2 % | -2,5 % | +8,3 % |
| Traslado largo (1–2 min) pero se deja el valor por defecto (0,5 min) | 0,20 | +21,8 % / +16,0 % / +29,7 % | +52,9 % / +18,3 % | -2,2 % | +6,4 % |

## Camino completo con mediciones en tienda

En cada escenario se simulan las mediciones que haría la tienda con el cronómetro de la aplicación: 42 atenciones de contado y 31 de crédito en cajas, y 12 traslados de cajas a facturación (con su error de muestreo real). Se aplican igual que en la aplicación y se vuelve a calcular la atención de facturación con el traslado medido.

| Escenario | Traslado medido (min) | Cajas: contado / crédito | Facturación: pago contado / entrada / cuota | Error por hora del modelo (sábado) |
|---|---:|---|---|---:|
| Base (ocupación media, CV 0,5, traslado 0,3–0,9 min) | 0,61 | -1,5 % / +8,5 % | +0,5 % / +1,2 % / -1,0 % | +6,7 % |
| Alta ocupación (+20 % de demanda, mismo personal) | 0,68 | -0,8 % / -0,3 % | -0,2 % / -0,1 % / +0,7 % | +6,8 % |
| Alta variabilidad de la atención (CV 0,9) | 0,60 | -14,5 % / +25,7 % | +2,8 % / -0,9 % / +5,4 % | +4,5 % |
| Otros tiempos de atención | 0,61 | +14,8 % / +0,1 % | +1,9 % / +0,7 % / +1,3 % | +5,5 % |
| Una fila por punto en facturación | 0,62 | +10,5 % / -0,3 % | +1,3 % / +0,9 % / -0,6 % | +5,7 % |
| Traslado largo (1–2 min) indicado correctamente | 1,52 | -14,8 % / +13,8 % | +1,2 % / +1,1 % / +1,1 % | +5,6 % |
| Traslado largo (1–2 min) pero se deja el valor por defecto (0,5 min) | 1,45 | +15,1 % / -7,1 % | +2,0 % / +2,1 % / +4,9 % | +5,8 % |

**Lectura.** Los flujos se recuperan casi exactos en todos los escenarios. La atención de facturación se infiere con el tiempo entre la factura y su REC; su precisión depende de conocer el tiempo de traslado entre áreas: con el valor por defecto y un traslado real largo, el error llega a 16–29 % (último escenario de la primera tabla); con 12 traslados cronometrados vuelve a quedar en pocos puntos (segunda tabla). En cajas, con solo la hora de emisión, el valor es una cota superior ("máximo probable"); con las atenciones cronometradas, el error es el de muestreo de 30 a 40 mediciones (intervalo de confianza del 95 % de ±15 a ±20 % con CV 0,55; ±30 % con CV 0,9). Más mediciones lo reducen: con 100, ±10 %.
