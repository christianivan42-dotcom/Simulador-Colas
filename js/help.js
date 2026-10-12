/* Guía de uso: ayuda de cada paso del recorrido (qué hacer, qué necesitas, cómo se calcula y preguntas frecuentes)
   y el manual completo. Se muestra en el panel lateral "Guía". */
(function (root) {
  'use strict';
  const QS = root.QS; const U = QS.U, h = U.h, UI = QS.UI;
  const HP = QS.Help = {};

  HP.STEPS = {
    proceso: {
      title: 'Tu operación',
      todo: [
        'Escribe el nombre de tu empresa o sucursal. Aparece en los archivos que descargues.',
        'Elige el modelo de atención más parecido al tuyo. Si tus cajas emiten facturas y otra área cobra y emite recibos (REC), elige "Retail con crédito: cajas y facturación".',
        'Revisa el mapa: cada línea es un tipo de cliente y muestra por qué áreas pasa. Si algo no coincide, abre "Ajustar áreas y tipos de cliente".',
        'Escribe tu meta de atención: qué parte de los clientes debe esperar menos de cuántos minutos.'
      ],
      need: ['Saber qué áreas atienden a tus clientes y qué documento registra cada una (factura, recibo, ticket, turno).'],
      how: [
        ['Cada área es una fila de espera con su propio personal. Los tipos de cliente recorren las áreas en orden; por ejemplo, quien solo paga una cuota va directo a facturación. Es una red de colas con varias clases de cliente.', ['bcmp', 'gross']],
        ['La meta se mide como nivel de servicio: el porcentaje de clientes que espera menos del tiempo que tú defines. Es la medida estándar para dimensionar personal de atención.', ['erlang', 'green']]
      ],
      faq: [
        ['¿Qué meta escribo?', 'Es una decisión de tu empresa. En comercio, 80 % de los clientes con menos de 5 minutos de espera es un punto de partida razonable. Con una meta más exigente necesitarás más personal; el plan te muestra cuánto.'],
        ['¿Fila única o una fila por caja?', 'Fila única: los clientes esperan en una sola fila y pasan a la primera caja libre. Una fila por caja: cada cliente elige una. Elige la que usa tu tienda hoy; en el plan puedes comparar las dos.'],
        ['Mi proceso tiene tres áreas', 'Abre "Ajustar áreas y tipos de cliente" y agrega el área. Se admiten hasta cuatro áreas en orden.']
      ]
    },
    archivos: {
      title: 'Tus datos',
      todo: [
        'Exporta de tu sistema un solo archivo con todas las transacciones de todas las áreas (facturas, recibos…) y todo el periodo que tengas. Si lo entrega en partes (uno por mes o uno por área), sube todas las partes juntas.',
        'Súbelo. Las columnas, las áreas y los tipos de transacción se reconocen solos. Revisa el resumen: transacciones, tipos y quién atiende en cada área. Si algo no cuadra, abre «Revisar columnas y áreas».',
        'Revisa el periodo de tus datos y el enlace entre áreas: cuántos recibos encontraron su factura.',
        'Presiona "Continuar": se miden los flujos de clientes, el personal presente por hora y el tiempo entre áreas.'
      ],
      need: [
        'Obligatorio: fecha y hora de cada documento, área, quién atiende (el usuario que creó el documento; si no hay, la caja o el puesto) y tipo de transacción.',
        'Recomendado: número de documento, código de cliente y, en el recibo, la factura que paga (documento relacionado). Con ese enlace se calcula la atención de facturación sin cronometrarla.',
        'Muy útil: la hora de inicio de cada atención. Con ella no hace falta cronometrar.',
        'Periodo: mínimo 3 meses; con 1 a 2 años también se miden las temporadas.'
      ],
      how: [
        ['Cada documento es una atención. La hora del documento marca el final de la atención; la llegada se estima restando la atención de su tipo.', ['burke']],
        ['El personal presente por hora sale de las sesiones de trabajo de cada usuario (o caja): desde poco antes de su primera transacción hasta la última, cortadas en pausas largas.', []],
        ['El enlace entre áreas es por número de documento: el documento relacionado del recibo se busca entre las facturas, sin importar guiones, espacios, mayúsculas ni ceros a la izquierda, en el periodo en que todas las áreas tienen datos.', []],
        ['Cuántos clientes de cada tipo hay se calcula con mínimos cuadrados no negativos sobre los conteos de cada área, en los días en que todas las áreas tienen movimiento.', ['lawson']]
      ],
      faq: [
        ['¿Tengo que subir un archivo por área?', 'No. Lo más simple es un solo archivo con todas las áreas y una columna Área: la app separa las filas de cada área. Si tu sistema da un archivo por área, súbelos juntos, o usa «Mi sistema da un archivo por área».'],
        ['Mi sistema da un archivo por mes (o por año)', 'Elige todos los archivos a la vez, o súbelos de a poco con «Agregar archivos». Se suman; las columnas se emparejan por su nombre aunque cambien de orden. Si dos archivos repiten días, las filas repetidas se cuentan una sola vez. En Excel, también se leen todas las hojas que tengan los mismos encabezados.'],
        ['¿Cómo se enlaza la factura con el recibo?', 'Por el número. En cada recibo, la columna Documento relacionado (la factura que paga) se busca en la columna Documento de las facturas; el tiempo entre los dos es el traslado, la espera y la atención en facturación. No importa que la factura esté en otro archivo ni que el número esté escrito distinto (F-001245, f1245 o 1245). El paso 2 muestra cuántos recibos encontraron su factura.'],
        ['¿Y si las áreas o los archivos tienen fechas distintas?', 'Todo lo que combina las áreas (el enlace, cuántos clientes pasan de una a otra y el modelo) usa solo el periodo en que todas tienen datos: las mismas semanas en todas. Lo que queda fuera se usa para las temporadas de cada área. Si no tienen ni un día en común, se avisa y no se mide.'],
        ['¿Se usa el usuario que creó cada documento?', 'Sí, y es lo mejor para contar al personal: cada usuario que registra transacciones cuenta como una persona atendiendo en esas horas, aunque cambie de caja. Si el archivo trae la caja y el usuario, se toma el usuario. Un usuario que registra en bloque (pagos en línea, procesos automáticos) se marca para que decidas si se cuenta.'],
        ['¿Cuántos datos puedo cargar?', 'Todos los años que tengas. Se probó con 4,5 años de una tienda: 1,2 millones de filas (73 MB en CSV) se leen en unos 6 segundos y ocupan unos 60 MB de memoria. Para archivos grandes usa CSV: Excel es más lento y admite como máximo 1 048 576 filas por hoja.'],
        ['¿Por qué el modelo usa solo las últimas semanas?', 'Para que refleje cómo es tu operación hoy. Si la demanda creció en los últimos años, el promedio de todo el periodo daría menos clientes de los que tienes ahora. La historia completa sí se usa: para medir las temporadas por mes (sin la tendencia de crecimiento) y los días de pago. Puedes cambiar el periodo base debajo de tu archivo.'],
        ['¿Mis datos salen de mi computadora?', 'No. Los archivos se procesan en tu navegador y no se envían a ningún servidor.'],
        ['No tengo sistema', 'Usa "Registro en tienda" en Herramientas: con el celular se registra cada atención (inicio y fin) y el archivo resultante sigue el mismo estándar.']
      ]
    },
    mediciones: {
      title: 'Personal y mediciones',
      todo: [
        'Revisa el personal actual de cada área: cuántas personas atienden en cada hora. Viene de tus registros; corrige las horas que no coincidan con tu tienda.',
        'Si quieres ver el plan en personas (cuántas te sobran o te faltan), escribe tu planilla: personas de jornada completa y de medio tiempo, sus horas por semana y el porcentaje de ausencias.',
        'Tiempos: si tus reportes traen la hora de inicio de cada atención, no hay nada que medir. Si no, abre este paso en el celular, en la tienda.',
        'Tiempo de atención: toca el tipo de atención cuando la cajera empieza con un cliente y "Terminar" cuando lo despide. Mide en distintas horas y cajas.',
        'Traslado: toca "Salió de cajas" cuando el cliente deja la caja y "Terminar" cuando entra a la fila de facturación.',
        'Si mides en otro dispositivo, descarga las mediciones y cárgalas aquí.'
      ],
      need: ['Personal: nada, solo revisar. Tiempos (solo si tus reportes no los traen): mínimo 30 atenciones por área (con 100 la precisión ronda ±10 %) y 10 traslados. Si mides un solo tipo, los demás se ajustan con tus datos.'],
      how: [
        ['Personal detectado: cada caja o puesto con transacciones en una hora cuenta como una persona atendiendo (sesiones de trabajo desde poco antes de la primera transacción hasta la última). Lo que corrijas reemplaza lo detectado en el diagnóstico, el plan y la fila en movimiento.', []],
        ['Es un estudio de tiempos: el promedio, la variabilidad y la forma de la distribución salen de tus mediciones, con su intervalo de confianza del 95 %.', ['kanawaty', 'niebel']],
        ['Si mides un tipo de atención, los demás se calculan con el modelo aditivo de intervalos: el intervalo entre documentos es la atención más un tiempo libre común. Se validó con datos de valores conocidos (error de −7 % a +2 %).', ['larson']],
        ['El traslado se descuenta del tiempo entre la factura y su recibo para calcular la atención de facturación (inferencia indirecta: se simulan las llegadas reales hasta reproducir tus tiempos).', ['indirect']]
      ],
      faq: [
        ['¿Por qué no se calcula solo con las facturas?', 'El intervalo entre dos facturas de la misma caja incluye el tiempo libre de la cajera, y el reporte no dice cuánto. Se probó estimarlo solo con los reportes y, con carga media o alta, el error llegó a 40–60 %. Por eso se cronometra: es el dato real.'],
        ['¿Y si mi sistema guarda la hora en que se abre la factura?', 'Entonces la atención se mide exacta con tus reportes: indica esa columna como "Hora de inicio" en el paso 2 y este paso te dirá que no hace falta cronometrar. Con hora de inicio en todas las áreas tampoco hace falta medir el traslado. Si esa columna casi siempre coincide con la hora de registro (por ejemplo, una fecha de creación que el sistema graba al emitir), la app lo detecta, no la usa y te lo avisa.'],
        ['¿Por qué corregir el personal si ya está en mis registros?', 'Porque el registro cuenta cajas con transacciones, no personas: una persona de apoyo que no factura no aparece, y una persona que usa dos cajas cuenta doble. Corrige solo las horas que no coincidan.'],
        ['¿Puedo seguir sin medir?', 'Sí. El diagnóstico y el plan se calculan igual, marcados como preliminares: en cajas se usa un máximo y el personal puede salir sobrestimado.']
      ]
    },
    diagnostico: {
      title: 'Diagnóstico',
      todo: [
        'Revisa primero la línea de validación: dice si el modelo reproduce tu operación.',
        'Mira el mapa de la semana: cada celda es una hora; en color, las horas que no cumplen tu meta con el personal que tuviste.',
        'Lee los hallazgos: dónde falta y dónde sobra personal.',
        'Mira tu fila en movimiento: la simulación de un día con tu personal actual, desde poco antes de la hora más difícil. Cambia el día con los botones.'
      ],
      need: ['Nada adicional. Se calcula con tus datos y tus mediciones.'],
      how: [
        ['Cada día de la semana se simula con el personal que registró tu sistema (20 réplicas): llegadas de Poisson con la tasa medida en cada hora y la atención medida.', ['law', 'lewis', 'kimwhitt']],
        ['Validación: las atenciones por hora del modelo se comparan con las de tus reportes (error absoluto ponderado). Con menos de 10 % el modelo representa bien tu operación.', ['sargent', 'law']],
        ['El porcentaje de clientes dentro de la meta y la espera vienen de la simulación validada, porque tu sistema no registra la hora de llegada.', []]
      ],
      faq: [
        ['¿Por qué la espera no sale directo de mis datos?', 'El reporte de facturas no guarda cuándo llegó cada cliente. Con turnero (hora de llegada) la espera se mide; sin él se calcula con el modelo, después de comprobar que reproduce tus datos.'],
        ['El error del modelo es alto', 'Revisa en el paso 2 la correspondencia de tipos y en el paso 1 los tipos de cliente. Un error alto suele venir de un tipo mal asignado o de un área que recibe clientes que no están en el mapa.']
      ]
    },
    plan: {
      title: 'Plan de personal',
      todo: [
        'Elige el tipo de día (normal, día de pago o muy cargado) y, si tienes historia, el mes.',
        'La tabla muestra cuántas personas necesitas en cada hora. El número pequeño es la diferencia contra lo que tuviste: +1 falta una persona, −1 sobra una.',
        'Revisa "Personas: hoy y con el plan": cuántas horas y cuántas personas necesitas en cada área, y si te sobran o te faltan.',
        'Mira la fila en movimiento con el personal de hoy y con el plan, lado a lado y con los mismos clientes. Toca un día para cambiarlo.',
        'Descarga el plan para armar los horarios.'
      ],
      need: ['Nada adicional.'],
      how: [
        ['Punto de partida: Erlang C hora por hora con la llegada y la atención medidas.', ['erlang', 'green']],
        ['Ajuste: se simula todo el proceso (todas las áreas juntas) y se suma una persona en cada hora que no cumple la meta, hasta que todas la cumplen; después se confirma con 20 réplicas.', ['feldman', 'law']],
        ['Los tipos de día y los meses salen de tu historia: cuánto sube la demanda de cada tipo de cliente en días de pago, en días muy cargados y en cada mes.', ['whitt06', 'makridakis']],
        ['Los turnos se arman con programación entera: el menor número de horas pagadas que cubre lo necesario en cada hora.', []]
      ],
      faq: [
        ['¿Por qué no basta con Erlang C?', 'Erlang C supone una sola fila estable en cada hora. En tu tienda los clientes pasan por dos áreas y la demanda cambia de una hora a otra; la simulación del proceso completo corrige eso.'],
        ['¿Puedo planear diciembre?', 'Sí, si tus reportes incluyen diciembre: elige el mes y el plan usa cuánto sube la demanda ese mes. Para crecimiento esperado, usa "Cambio de demanda".'],
        ['¿Qué tan confiable es?', 'Las fórmulas y el simulador pasaron 194 pruebas contra resultados exactos y contra otra biblioteca de simulación (Ciw). La parte que depende de tu operación es la que mediste; por eso el plan se marca preliminar mientras falten mediciones.']
      ]
    }
  };
  HP.ORDER = ['proceso', 'archivos', 'mediciones', 'diagnostico', 'plan'];

  const cite = (keys) => (keys && keys.length && QS.Measure ? keys.map((k) => (QS.Measure.REFS[k] ? QS.Measure.REFS[k][0] : k)).join('; ') : '');
  function stepBlock(id, o = {}) {
    const s = HP.STEPS[id]; const frag = [];
    if (o.title) frag.push(h('h2', null, `${HP.ORDER.indexOf(id) + 1}. ${s.title}`));
    frag.push(h('div', { class: 'guide-sec' }, h('h3', null, 'Qué hacer'), h('ol', null, s.todo.map((x) => h('li', null, x)))));
    frag.push(h('div', { class: 'guide-sec' }, h('h3', null, 'Qué necesitas'), h('ul', null, s.need.map((x) => h('li', null, x)))));
    frag.push(h('div', { class: 'guide-sec' }, h('h3', null, 'Cómo se calcula'), s.how.map(([t, refs]) => h('p', null, t, refs.length ? h('span', { class: 'ref' }, ` (${cite(refs)})`) : null))));
    if (!o.noFaq) frag.push(h('div', { class: 'guide-sec' }, h('h3', null, 'Preguntas frecuentes'), h('div', null, s.faq.map(([q, a]) => h('details', { class: 'faq' }, h('summary', null, q), h('div', null, h('p', null, a)))))));
    return frag;
  }
  // Panel de la guía: el paso actual o el manual completo
  HP.render = (box, stepId, o = {}) => {
    U.clear(box);
    const manual = !!o.manual || !HP.STEPS[stepId];
    const head = h('div', { class: 'guide-h' }, h('h2', null, manual ? 'Manual de uso' : `Guía · ${HP.STEPS[stepId].title}`),
      UI.btn(UI.icon('x'), o.onClose, 'btn-ghost btn-sm btn-icon', { 'aria-label': 'Cerrar la guía', title: 'Cerrar' }));
    const body = h('div', { class: 'guide-b' + (manual ? ' guide-manual' : '') });
    if (manual) {
      body.appendChild(h('div', { class: 'guide-sec' }, h('p', null, 'La herramienta responde una pregunta: cuántas personas necesitas en cada área y en cada hora para que tus clientes esperen menos de lo que tú defines. Se trabaja en cinco pasos, en orden; cada paso tiene su ayuda en este panel.'),
        h('p', null, 'Todos los cálculos usan métodos publicados de teoría de colas y simulación, verificados con 194 pruebas. Lo que tus reportes no registran se mide en tienda; mientras falte, los resultados se marcan como preliminares.')));
      HP.ORDER.forEach((id) => stepBlock(id, { title: true, noFaq: true }).forEach((x) => body.appendChild(x)));
      body.appendChild(h('div', { class: 'guide-sec' }, h('h3', null, 'Más'), h('p', null, 'Las herramientas para especialistas (simulador libre, fórmulas, personal por intervalo, análisis de series, estándar de datos, validación y metodología) están en "Herramientas", al final de la lista de pasos.')));
    } else {
      stepBlock(stepId).forEach((x) => body.appendChild(x));
      body.appendChild(h('div', { class: 'row' }, UI.btn([UI.icon('book'), 'Ver el manual completo'], o.onManual, 'btn-ghost btn-sm')));
    }
    box.appendChild(head); box.appendChild(body);
  };
})(typeof window !== 'undefined' ? window : globalThis);
