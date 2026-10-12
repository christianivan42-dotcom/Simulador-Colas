/* Catálogo de giros de negocio: terminología, valores típicos, qué datos pedir y cómo levantarlos.
   Los valores son puntos de partida razonables para Latinoamérica; el usuario siempre puede ajustarlos. */
(function (root) {
  'use strict';
  const QS = root.QS = root.QS || {};
  const SEC = QS.Sectors = {};

  // Perfiles horarios: [hora, peso]
  const P = (pairs) => pairs;

  SEC.list = [
    {
      id: 'retail', name: 'Retail / tienda', desc: 'Tiendas departamentales, de ropa, electrónica, farmacias, tiendas de conveniencia.',
      areas: [
        { id: 'cajas', name: 'Cajas de cobro', server: 'caja', servers: 'Cajas', customer: 'cliente', unit: 'tickets', aht: 2.8, cv: 0.7, queue: 'multi', target: { pct: 90, tMin: 3 }, patience: 0,
          exclusive: { label: 'Cajas rápidas', className: 'Compra chica (hasta 10 artículos)', share: 35, mult: 0.4, strict: false },
          note: 'Cada ticket del punto de venta es un cliente atendido en caja. Quien se va sin comprar no aparece en los tickets.' },
        { id: 'servicio', name: 'Servicio a clientes (devoluciones, crédito, apartados)', server: 'módulo', servers: 'Módulos', customer: 'cliente', unit: 'atenciones', aht: 7, cv: 0.8, queue: 'single', target: { pct: 80, tMin: 10 }, patience: 20,
          note: 'Si usas turnero, exporta los turnos; si no, cuenta y cronometra a mano.' },
        { id: 'probadores', name: 'Probadores', server: 'probador', servers: 'Probadores', customer: 'cliente', unit: 'usos', aht: 6, cv: 0.6, queue: 'single', target: { pct: 85, tMin: 5 }, patience: 10, note: 'Cada probador es un servidor; la fila es la de espera para entrar.' }
      ],
      hours: { open: 600, close: 1260, days: [1, 1, 1, 1, 1, 1, 1] },
      staff: { shrink: 15, costHour: 65, ptCost: 70 },
      events: ['buenfin', 'hotsale', 'navidad', 'nochebuena', 'finanio', 'reyes', 'madres', 'padre', 'clases', 'rebajas', 'sanvalentin'],
      monthIdx: [0.88, 0.86, 0.93, 0.95, 1.05, 0.97, 0.98, 1.02, 0.93, 0.97, 1.12, 1.34], dowIdx: [0.85, 0.83, 0.86, 0.9, 1.07, 1.33, 1.16],
      profile: { week: P([[10, 0.55], [11, 0.7], [12, 0.85], [13, 1.0], [14, 1.0], [15, 0.85], [16, 0.85], [17, 0.95], [18, 1.1], [19, 1.15], [20, 0.85]]),
        sat: P([[10, 0.7], [11, 0.95], [12, 1.15], [13, 1.25], [14, 1.2], [15, 1.1], [16, 1.05], [17, 1.05], [18, 1.0], [19, 0.9], [20, 0.7]]),
        sun: P([[10, 0.6], [11, 0.9], [12, 1.15], [13, 1.3], [14, 1.25], [15, 1.15], [16, 1.1], [17, 1.0], [18, 0.9], [19, 0.75], [20, 0.55]]) },
      sampleBase: 780,
      system: { source: 'Punto de venta (POS) o ERP', report: 'Reporte de tickets de venta: una fila por ticket.',
        columns: [['Fecha y hora del ticket', 'Obligatoria', 'Ej.: 14/03/2025 12:31:05'], ['Caja', 'Recomendada', 'Número o nombre de la caja'], ['Hora de inicio del ticket', 'Opcional', 'Primer artículo escaneado: permite medir el tiempo de cobro'], ['Monto', 'Opcional', 'Para relacionar ventas y personal']],
        alt: 'Si tu sistema solo da totales, exporta "tickets por hora" (fecha, hora, número de tickets).' },
      manual: { what: 'clientes que llegan a la zona de cajas', timing: 'cobros: desde que el cajero llama al siguiente cliente hasta que le entrega el ticket' }
    },
    {
      id: 'super', name: 'Supermercado / autoservicio', desc: 'Supermercados, hipermercados, clubes de precio, mayoristas.',
      areas: [
        { id: 'cajas', name: 'Cajas de cobro', server: 'caja', servers: 'Cajas', customer: 'cliente', unit: 'tickets', aht: 3.6, cv: 0.65, queue: 'multi', target: { pct: 90, tMin: 4 }, patience: 0,
          exclusive: { label: 'Cajas rápidas', className: 'Compra chica (hasta 10 artículos)', share: 30, mult: 0.35, strict: false },
          note: 'Cada ticket es un cliente en caja. Si tienes autocobro, identifica esas cajas en el archivo.' },
        { id: 'autocobro', name: 'Cajas tradicionales + autocobro', server: 'caja', servers: 'Cajas y autocobro', customer: 'cliente', unit: 'tickets', aht: 3.4, cv: 0.65, queue: 'multi', target: { pct: 90, tMin: 4 }, patience: 0,
          exclusive: { label: 'Kioscos de autocobro', className: 'Autocobro', share: 30, mult: 1.2, strict: true },
          note: 'Los kioscos de autocobro solo atienden a quien decide usarlos; el resto va a cajas tradicionales.' },
        { id: 'servicio', name: 'Mostrador de servicio (carnes, salchichonería)', server: 'despachador', servers: 'Despachadores', customer: 'cliente', unit: 'turnos', aht: 2.5, cv: 0.7, queue: 'single', target: { pct: 85, tMin: 5 }, patience: 10, note: 'Normalmente con turnero de papel o digital.' }
      ],
      hours: { open: 480, close: 1320, days: [1, 1, 1, 1, 1, 1, 1] },
      staff: { shrink: 15, costHour: 60, ptCost: 65 },
      events: ['buenfin', 'navidad', 'nochebuena', 'finanio', 'reyes', 'madres', 'ss1', 'ss2', 'clases'],
      monthIdx: [0.95, 0.92, 0.98, 0.98, 1.02, 0.97, 1.0, 1.0, 0.96, 0.98, 1.03, 1.21], dowIdx: [0.92, 0.88, 0.9, 0.93, 1.08, 1.25, 1.04],
      profile: { week: P([[8, 0.35], [9, 0.5], [10, 0.7], [11, 0.85], [12, 1.0], [13, 1.15], [14, 1.05], [15, 0.85], [16, 0.85], [17, 1.0], [18, 1.25], [19, 1.3], [20, 1.05], [21, 0.6]]),
        sat: P([[8, 0.4], [9, 0.65], [10, 0.95], [11, 1.15], [12, 1.25], [13, 1.25], [14, 1.15], [15, 1.0], [16, 0.95], [17, 1.0], [18, 1.05], [19, 0.95], [20, 0.75], [21, 0.45]]),
        sun: P([[8, 0.45], [9, 0.75], [10, 1.05], [11, 1.25], [12, 1.3], [13, 1.25], [14, 1.1], [15, 0.95], [16, 0.9], [17, 0.9], [18, 0.85], [19, 0.75], [20, 0.55], [21, 0.35]]) },
      sampleBase: 1900,
      system: { source: 'Punto de venta (POS) o ERP', report: 'Reporte de tickets: una fila por ticket.',
        columns: [['Fecha y hora del ticket', 'Obligatoria', 'Cierre del ticket'], ['Caja', 'Recomendada', 'Identifica cajas rápidas y de autocobro'], ['Hora de inicio del ticket', 'Opcional', 'Para medir el tiempo de cobro'], ['Artículos', 'Opcional', 'Para estimar quién usaría caja rápida']],
        alt: 'Alternativa: tickets por hora (fecha, hora, número de tickets).' },
      manual: { what: 'clientes que llegan a la zona de cajas', timing: 'cobros: desde el primer artículo hasta entregar el ticket' }
    },
    {
      id: 'banco', name: 'Banco / financiera', desc: 'Sucursales bancarias, financieras, casas de cambio, cajas de ahorro.',
      areas: [
        { id: 'cajas', name: 'Ventanillas / cajas', server: 'ventanilla', servers: 'Ventanillas', customer: 'cliente', unit: 'turnos', aht: 5.5, cv: 0.9, queue: 'single', target: { pct: 80, tMin: 10 }, patience: 25,
          exclusive: { label: 'Ventanilla exclusiva', className: 'Empresas o preferente', share: 15, mult: 1.5, strict: false },
          note: 'El turnero registra emisión, llamado y fin de cada turno: con eso se miden llegadas, esperas y servicio.' },
        { id: 'ejecutivos', name: 'Ejecutivos (plataforma)', server: 'ejecutivo', servers: 'Ejecutivos', customer: 'cliente', unit: 'turnos', aht: 16, cv: 0.7, queue: 'single', target: { pct: 80, tMin: 15 }, patience: 40, note: 'Aperturas, créditos y aclaraciones.' }
      ],
      hours: { open: 540, close: 960, days: [1, 1, 1, 1, 1, 1, 0] },
      staff: { shrink: 18, costHour: 90, ptCost: 95 },
      events: ['aguinaldo', 'navidad', 'ss2', 'finanio', 'reyes'],
      monthIdx: [1.06, 0.95, 1.0, 1.03, 1.0, 0.97, 1.0, 0.98, 0.97, 1.0, 1.0, 1.04], dowIdx: [1.25, 1.05, 1.0, 1.02, 1.25, 0.6, 0],
      profile: { week: P([[9, 1.25], [10, 1.0], [11, 0.95], [12, 1.05], [13, 1.1], [14, 0.95], [15, 0.8]]), sat: P([[9, 1.1], [10, 1.2], [11, 1.15], [12, 1.0], [13, 0.8]]), sun: P([]) },
      sampleBase: 430,
      system: { source: 'Turnero / gestor de filas', report: 'Reporte de turnos: una fila por turno.',
        columns: [['Hora de emisión del turno', 'Obligatoria', 'Llegada del cliente'], ['Hora de llamado', 'Recomendada', 'Inicio de la atención (mide la espera)'], ['Hora de fin', 'Recomendada', 'Fin de la atención (mide el servicio)'], ['Ventanilla y trámite', 'Opcional', 'Para tipos de cliente'], ['Atendido o abandonado', 'Opcional', 'Turnos no atendidos']],
        alt: 'Sin turnero: usa el registro manual o las operaciones del sistema central por hora.' },
      manual: { what: 'clientes que llegan a formarse', timing: 'atenciones en ventanilla: desde que el cajero llama hasta que el cliente se retira' }
    },
    {
      id: 'callcenter', name: 'Centro de llamadas / contacto', desc: 'Atención telefónica, chat, mesa de ayuda, cobranza, ventas por teléfono.',
      areas: [
        { id: 'agentes', name: 'Agentes de atención', server: 'agente', servers: 'Agentes', customer: 'llamada', unit: 'llamadas', aht: 4.5, cv: 0.9, queue: 'single', target: { pct: 80, tMin: 1 / 3 }, patience: 2, interval: 30,
          note: 'El conmutador (ACD) entrega reportes por intervalo con llamadas ofrecidas, atendidas, abandonadas y TMO.' }
      ],
      hours: { open: 480, close: 1200, days: [1, 1, 1, 1, 1, 1, 0] },
      staff: { shrink: 30, costHour: 75, ptCost: 80 },
      events: ['navidad', 'finanio', 'reyes'],
      monthIdx: [1.1, 1.0, 1.0, 0.98, 1.0, 0.97, 0.98, 1.0, 0.98, 1.0, 1.0, 0.99], dowIdx: [1.2, 1.08, 1.03, 1.0, 0.95, 0.6, 0],
      profile: { week: P([[8, 0.6], [9, 0.95], [10, 1.15], [11, 1.2], [12, 1.1], [13, 0.95], [14, 0.9], [15, 1.0], [16, 1.05], [17, 0.95], [18, 0.7], [19, 0.5]]), sat: P([[9, 0.9], [10, 1.1], [11, 1.15], [12, 1.0], [13, 0.85]]), sun: P([]) },
      sampleBase: 2300,
      system: { source: 'Conmutador / ACD / plataforma omnicanal', report: 'Reporte por intervalo de 15 o 30 minutos.',
        columns: [['Fecha', 'Obligatoria', ''], ['Hora del intervalo', 'Obligatoria', 'Ej.: 09:30'], ['Llamadas ofrecidas', 'Obligatoria', 'Recibidas, no solo atendidas'], ['Abandonadas', 'Recomendada', 'Para el modelo Erlang A'], ['TMO o AHT', 'Recomendada', 'Incluye conversación, espera y trabajo posterior'], ['Agentes conectados', 'Opcional', 'Para comparar con lo recomendado']],
        alt: 'También sirve el detalle por llamada (hora de entrada, de respuesta y de fin).' },
      manual: { what: 'llamadas recibidas', timing: 'llamadas: desde que el agente contesta hasta que queda libre' }
    },
    {
      id: 'salud', name: 'Salud: clínica, hospital, laboratorio', desc: 'Admisión, consulta externa, laboratorio, farmacia, urgencias.',
      areas: [
        { id: 'admision', name: 'Admisión / recepción', server: 'recepcionista', servers: 'Recepcionistas', customer: 'paciente', unit: 'registros', aht: 3.5, cv: 0.6, queue: 'single', target: { pct: 80, tMin: 10 }, patience: 0, note: 'Registro de llegada del paciente.' },
        { id: 'laboratorio', name: 'Toma de muestras (laboratorio)', server: 'cubículo', servers: 'Cubículos', customer: 'paciente', unit: 'tomas', aht: 6, cv: 0.5, queue: 'single', target: { pct: 80, tMin: 15 }, patience: 0, note: 'Pico fuerte temprano por ayunos.' },
        { id: 'farmacia', name: 'Farmacia', server: 'mostrador', servers: 'Mostradores', customer: 'paciente', unit: 'recetas', aht: 3, cv: 0.7, queue: 'single', target: { pct: 85, tMin: 8 }, patience: 0, note: '' },
        { id: 'consulta', name: 'Consulta con médico', server: 'consultorio', servers: 'Consultorios', customer: 'paciente', unit: 'consultas', aht: 15, cv: 0.5, queue: 'single', target: { pct: 80, tMin: 20 }, patience: 0, note: 'Si trabajas con citas, el simulador tiene una modalidad específica de agenda con inasistencias.' }
      ],
      hours: { open: 420, close: 1200, days: [1, 1, 1, 1, 1, 1, 0] },
      staff: { shrink: 15, costHour: 85, ptCost: 90 },
      events: ['ss1', 'ss2', 'navidad', 'finanio'],
      monthIdx: [1.08, 1.06, 1.03, 0.97, 0.96, 0.95, 0.96, 0.98, 0.99, 1.0, 1.0, 1.02], dowIdx: [1.2, 1.1, 1.05, 1.05, 1.0, 0.6, 0],
      profile: { week: P([[7, 1.3], [8, 1.4], [9, 1.3], [10, 1.1], [11, 1.0], [12, 0.9], [13, 0.8], [14, 0.75], [15, 0.85], [16, 0.9], [17, 0.85], [18, 0.7], [19, 0.5]]), sat: P([[8, 1.3], [9, 1.2], [10, 1.0], [11, 0.9], [12, 0.7], [13, 0.5]]), sun: P([]) },
      sampleBase: 380,
      system: { source: 'Sistema de citas o expediente (HIS)', report: 'Una fila por paciente atendido.',
        columns: [['Hora de llegada o registro', 'Obligatoria', ''], ['Hora de inicio de atención', 'Recomendada', 'Mide la espera'], ['Hora de fin', 'Recomendada', 'Mide el servicio'], ['Con cita (sí/no) y servicio', 'Opcional', 'Para distinguir agendados y espontáneos']],
        alt: 'Si solo hay registros diarios, súbelos y complementa con 2 semanas de conteo por hora.' },
      manual: { what: 'pacientes que llegan', timing: 'atenciones: desde que el paciente es llamado hasta que se retira' }
    },
    {
      id: 'gobierno', name: 'Gobierno / trámites', desc: 'Oficinas de trámites, registro civil, licencias, recaudación, servicios públicos.',
      areas: [
        { id: 'ventanillas', name: 'Ventanillas de trámites', server: 'ventanilla', servers: 'Ventanillas', customer: 'ciudadano', unit: 'turnos', aht: 9, cv: 0.8, queue: 'single', target: { pct: 80, tMin: 20 }, patience: 45,
          exclusive: { label: 'Ventanilla preferencial', className: 'Preferente (adultos mayores, embarazadas)', share: 12, mult: 1.2, strict: false },
          note: 'Con turnero se obtienen llegadas, esperas y tiempos de atención.' }
      ],
      hours: { open: 480, close: 900, days: [1, 1, 1, 1, 1, 0, 0] },
      staff: { shrink: 15, costHour: 70, ptCost: 75 },
      events: ['predial', 'impuestos', 'ss2', 'navidad', 'finanio'],
      monthIdx: [1.1, 1.05, 1.08, 1.12, 1.0, 0.95, 0.92, 0.95, 0.97, 0.98, 0.95, 0.93], dowIdx: [1.2, 1.05, 1.0, 1.0, 0.95, 0, 0],
      profile: { week: P([[8, 1.4], [9, 1.3], [10, 1.15], [11, 1.0], [12, 0.9], [13, 0.75], [14, 0.5]]), sat: P([]), sun: P([]) },
      sampleBase: 320,
      system: { source: 'Turnero o sistema de atención', report: 'Reporte de turnos: una fila por turno.',
        columns: [['Hora de emisión', 'Obligatoria', ''], ['Hora de llamado', 'Recomendada', ''], ['Hora de fin', 'Recomendada', ''], ['Trámite', 'Opcional', '']], alt: '' },
      manual: { what: 'ciudadanos que llegan', timing: 'atenciones en ventanilla' }
    },
    {
      id: 'restaurante', name: 'Restaurantes / comida rápida', desc: 'Comida rápida, cafeterías, comedores, autoservicio (drive-thru).',
      areas: [
        { id: 'caja', name: 'Caja: tomar orden y cobrar', server: 'caja', servers: 'Cajas', customer: 'cliente', unit: 'órdenes', aht: 1.6, cv: 0.5, queue: 'single', target: { pct: 90, tMin: 3 }, patience: 0, note: 'Cada orden del punto de venta es un cliente.' },
        { id: 'entrega', name: 'Preparación y entrega', server: 'preparador', servers: 'Preparadores', customer: 'orden', unit: 'órdenes', aht: 3.5, cv: 0.4, queue: 'single', target: { pct: 90, tMin: 5 }, patience: 0, note: 'Tiempo desde que se cobra hasta que se entrega.' }
      ],
      hours: { open: 720, close: 1380, days: [1, 1, 1, 1, 1, 1, 1] },
      staff: { shrink: 12, costHour: 55, ptCost: 58 },
      events: ['madres', 'padre', 'sanvalentin', 'navidad', 'nochebuena', 'finanio'],
      monthIdx: [0.9, 0.92, 0.98, 1.0, 1.05, 0.98, 1.02, 1.0, 0.97, 1.0, 1.03, 1.15], dowIdx: [0.8, 0.8, 0.85, 0.95, 1.2, 1.35, 1.25],
      profile: { week: P([[12, 0.3], [13, 0.8], [14, 1.3], [15, 1.2], [16, 0.6], [17, 0.35], [18, 0.45], [19, 0.8], [20, 1.15], [21, 1.0], [22, 0.5]]),
        sat: P([[12, 0.45], [13, 0.9], [14, 1.25], [15, 1.2], [16, 0.8], [17, 0.6], [18, 0.7], [19, 0.95], [20, 1.2], [21, 1.05], [22, 0.6]]),
        sun: P([[12, 0.55], [13, 1.0], [14, 1.35], [15, 1.3], [16, 0.9], [17, 0.65], [18, 0.65], [19, 0.8], [20, 0.9], [21, 0.7], [22, 0.4]]) },
      sampleBase: 520,
      system: { source: 'Punto de venta', report: 'Una fila por orden.', columns: [['Fecha y hora de la orden', 'Obligatoria', ''], ['Hora de entrega', 'Opcional', 'Mide la preparación'], ['Canal', 'Opcional', 'Mostrador, drive-thru, app']], alt: 'O bien órdenes por hora.' },
      manual: { what: 'clientes que llegan a ordenar', timing: 'órdenes: desde que el cajero atiende hasta que cobra' }
    },
    {
      id: 'otro', name: 'Otro servicio', desc: 'Cualquier operación con clientes que esperan a ser atendidos.',
      areas: [{ id: 'general', name: 'Atención a clientes', server: 'servidor', servers: 'Servidores', customer: 'cliente', unit: 'atenciones', aht: 5, cv: 0.8, queue: 'single', target: { pct: 80, tMin: 10 }, patience: 0, note: '' }],
      hours: { open: 540, close: 1080, days: [1, 1, 1, 1, 1, 1, 0] },
      staff: { shrink: 15, costHour: 70, ptCost: 75 },
      events: ['navidad', 'finanio', 'ss2'],
      monthIdx: [1, 0.97, 1, 1, 1.02, 0.98, 0.98, 1, 0.98, 1, 1.02, 1.05], dowIdx: [1.1, 1.05, 1.0, 1.0, 1.05, 0.55, 0],
      profile: { week: P([[9, 0.9], [10, 1.1], [11, 1.15], [12, 1.1], [13, 0.95], [14, 0.85], [15, 0.95], [16, 1.0], [17, 0.8]]), sat: P([[9, 0.9], [10, 1.1], [11, 1.1], [12, 1.0], [13, 0.8]]), sun: P([]) },
      sampleBase: 300,
      system: { source: 'Sistema de atención, CRM o ERP', report: 'Una fila por cliente atendido.', columns: [['Fecha y hora de llegada', 'Obligatoria', ''], ['Inicio y fin de atención', 'Recomendada', ''], ['Servidor y tipo de cliente', 'Opcional', '']], alt: 'O conteos por hora.' },
      manual: { what: 'clientes que llegan', timing: 'atenciones: desde que se llama al cliente hasta que se retira' }
    }
  ];
  SEC.get = (id) => SEC.list.find((s) => s.id === id) || SEC.list[0];
  SEC.area = (sec, areaId) => (sec.areas.find((a) => a.id === areaId) || sec.areas[0]);

  // Perfil horario de un día (0 = lunes ... 6 = domingo) normalizado a suma 1, dentro del horario
  SEC.dayShare = (sec, dow, hours) => {
    const prof = dow === 5 ? sec.profile.sat : dow === 6 ? sec.profile.sun : sec.profile.week;
    const out = new Array(24).fill(0);
    const open = hours ? Math.floor(hours.open / 60) : 0, close = hours ? Math.ceil(hours.close / 60) : 24;
    let use = prof.filter(([hh]) => hh >= open && hh < close);
    if (!use.length && hours && hours.days[dow]) { use = []; for (let hh = open; hh < close; hh++) use.push([hh, 1]); }
    const s = use.reduce((a, [, w]) => a + w, 0) || 1;
    use.forEach(([hh, w]) => { out[hh] = w / s; });
    return out;
  };
})(typeof window !== 'undefined' ? window : globalThis);
