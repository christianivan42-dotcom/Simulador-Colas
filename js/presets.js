/* Escenarios de ejemplo: cada uno muestra una modalidad distinta de sistema de colas. */
(function (root) {
  'use strict';
  const QS = root.QS = root.QS || {};
  const P = QS.Presets = {};

  const stage = (o) => Object.assign({ name: 'Atención', servers: 1, svc: { type: 'exp', mean: 3 }, queue: 'single', select: 'shortest', jockey: false, disc: 'FIFO', assign: 'idle', speeds: '', prob: 1, useSchedule: false, schedule: [] }, o);

  P.list = [
    {
      id: 'retail_buenfin', sector: 'Retail y supermercados', name: 'Tienda departamental: cajas y caja rápida en Buen Fin',
      desc: 'Sábado de Buen Fin con 10 cajas (2 rápidas para compras de hasta 10 artículos). Cada caja tiene su fila y el cliente se cambia si otra se libera.',
      spec: {
        name: 'Tienda departamental — Buen Fin', open: 600, terms: { server: 'caja', servers: 'Cajas', customer: 'cliente' },
        arrivals: { mode: 'profile', profile: [84, 126, 168, 198, 204, 192, 180, 180, 174, 156, 114] },
        classes: [{ name: 'Clientes regulares', share: 65, prio: 2, svcMult: 1 }, { name: 'Compra chica (hasta 10 artículos)', share: 35, prio: 1, svcMult: 0.4 }],
        stages: [stage({ name: 'Cajas', servers: 10, svc: { type: 'gamma', mean: 3.6, sd: 2.4 }, queue: 'multi', select: 'shortest', jockey: true, dedicated: { n: 2, cls: 1, strict: false } })],
        run: { hours: 11, warmupH: 0, reps: 20, seed: 41, drain: true, slT: 3 }, cost: { server: 65, wait: 120, lost: 350, cur: '$' }
      }
    },
    {
      id: 'retail_autocobro', sector: 'Retail y supermercados', name: 'Supermercado con autocobro',
      desc: '6 cajas tradicionales y 4 kioscos de autocobro. 30 % de los clientes elige autocobro y solo puede usar los kioscos.',
      spec: {
        name: 'Supermercado — cajas y autocobro', open: 480, terms: { server: 'caja', servers: 'Cajas', customer: 'cliente' },
        arrivals: { mode: 'profile', profile: [46, 69, 98, 115, 138, 155, 138, 109, 104, 121, 150, 161, 127, 81] },
        classes: [{ name: 'Caja tradicional', share: 70, prio: 1, svcMult: 1 }, { name: 'Autocobro', share: 30, prio: 1, svcMult: 1.2 }],
        stages: [stage({ name: 'Cajas y autocobro', servers: 10, svc: { type: 'gamma', mean: 3.4, sd: 2.2 }, queue: 'multi', select: 'shortest', jockey: true, dedicated: { n: 4, cls: 1, strict: true } })],
        run: { hours: 14, warmupH: 0, reps: 20, seed: 43, drain: true, slT: 4 }
      }
    },
    {
      id: 'retail_servicio', sector: 'Retail y supermercados', name: 'Tienda: módulo de devoluciones y crédito',
      desc: 'Fila única con turno para 3 módulos. Atenciones largas y muy variables; algunos clientes se cansan y se van.',
      spec: {
        name: 'Servicio a clientes — devoluciones', open: 600, terms: { server: 'módulo', servers: 'Módulos', customer: 'cliente' },
        arrivals: { mode: 'profile', profile: [12, 18, 24, 26, 25, 22, 22, 24, 26, 22, 14] },
        renege: { on: true, dist: { type: 'exp', mean: 20 } },
        stages: [stage({ name: 'Módulos', servers: 3, svc: { type: 'lnorm', mean: 7, sd: 5.5 } })],
        run: { hours: 11, warmupH: 0, reps: 20, seed: 47, drain: true, slT: 10 }
      }
    },
    {
      id: 'banco', sector: 'Banca y finanzas', name: 'Banco: fila única con turno preferencial',
      desc: 'Fila única (serpentina) con 4 cajeros. Los adultos mayores y embarazadas tienen prioridad sin interrumpir a quien ya está en caja.',
      spec: {
        name: 'Banco — fila única con preferencial', open: 540,
        arrivals: { mode: 'poisson', rate: 62 },
        classes: [{ name: 'General', share: 85, prio: 2 }, { name: 'Preferencial', share: 15, prio: 1, svcMult: 1.3 }],
        stages: [stage({ name: 'Cajas', servers: 4, svc: { type: 'gamma', mean: 3.4, sd: 2.4 }, disc: 'PRIO' })],
        run: { hours: 8, warmupH: 0, reps: 20, seed: 2026, drain: true, slT: 5 }
      }
    },
    {
      id: 'super', sector: 'Retail y supermercados', name: 'Supermercado: filas por caja y cambio de fila',
      desc: 'Cada caja tiene su fila; el cliente elige la más corta, cambia de fila si otra se libera y desiste si su fila tiene 5 o más personas. Llegadas con perfil horario y cajas abiertas según turnos.',
      spec: {
        name: 'Supermercado — filas por caja', open: 540,
        arrivals: { mode: 'profile', profile: [45, 60, 80, 110, 125, 100, 85, 90, 120, 135, 110, 65] },
        balk: { type: 'threshold', L: 5 },
        stages: [stage({ name: 'Cajas', servers: 8, svc: { type: 'lnorm', mean: 3.2, sd: 2 }, queue: 'multi', select: 'shortest', jockey: true, useSchedule: true, schedule: [3, 4, 5, 6, 7, 6, 5, 5, 7, 8, 7, 4] })],
        run: { hours: 12, warmupH: 0, reps: 15, seed: 31, drain: true, slT: 4 }
      }
    },
    {
      id: 'callcenter', sector: 'Centros de llamadas', name: 'Centro de llamadas: abandono y rellamadas (Erlang A)',
      desc: 'Llamadas con perfil horario, agentes por turno, clientes impacientes que cuelgan (paciencia media 3 min) y 40 % vuelve a llamar. Meta típica 80/20.',
      spec: {
        name: 'Centro de llamadas — Erlang A', open: 480,
        arrivals: { mode: 'profile', profile: [60, 110, 150, 170, 160, 140, 130, 150, 160, 130, 90, 60] },
        renege: { on: true, dist: { type: 'exp', mean: 3 } }, retry: { p: 0.4, mean: 10 },
        stages: [stage({ name: 'Agentes', servers: 14, svc: { type: 'lnorm', mean: 4, sd: 3 }, useSchedule: true, schedule: [6, 10, 13, 14, 14, 12, 11, 13, 14, 11, 8, 6] })],
        run: { hours: 12, warmupH: 0, reps: 15, seed: 7, drain: true, slT: 1 / 3 }
      }
    },
    {
      id: 'clinica', sector: 'Salud', name: 'Consultorio: citas con ausentismo y pacientes sin cita',
      desc: 'Citas cada 15 min, 12 % de inasistencia, impuntualidad de ±6 min y pacientes sin cita. Muestra el efecto del agendamiento sobre la espera y el tiempo extra del médico.',
      spec: {
        name: 'Consultorio — citas programadas', open: 480,
        arrivals: { mode: 'appointments', appt: { interval: 15, noShow: 0.12, meanLate: 0, sdLate: 6, walkin: 0.5 } },
        stages: [stage({ name: 'Médico', servers: 1, svc: { type: 'gamma', mean: 12, sd: 5 } })],
        run: { hours: 8, warmupH: 0, reps: 30, seed: 5, drain: true, slT: 15 }
      }
    },
    {
      id: 'comida', sector: 'Restaurantes', name: 'Comida rápida: dos etapas en serie',
      desc: 'Primero se ordena y paga (3 cajas) y luego se espera el pedido en la barra de entrega (4 preparadores). La hora del almuerzo concentra la demanda.',
      spec: {
        name: 'Comida rápida — ordenar → recoger', open: 660,
        arrivals: { mode: 'profile', profile: [45, 95, 120, 80, 40] },
        stages: [stage({ name: 'Ordenar y pagar', servers: 3, svc: { type: 'exp', mean: 1.4 } }), stage({ name: 'Entrega', servers: 7, svc: { type: 'gamma', mean: 3.6, sd: 1.5 } })],
        run: { hours: 5, warmupH: 0, reps: 20, seed: 13, drain: true, slT: 3 }
      }
    },
    {
      id: 'taller', sector: 'Industria y mantenimiento', name: 'Taller de mantenimiento: población finita',
      desc: '20 máquinas que fallan en promedio cada 8 h y 2 técnicos. Cuantas más máquinas esperan reparación, menos fallas nuevas llegan (fuente finita).',
      spec: {
        name: 'Taller — 20 máquinas, 2 técnicos', open: 480,
        arrivals: { mode: 'finite', finite: { N: 20, think: { type: 'exp', mean: 480 } } },
        stages: [stage({ name: 'Técnicos', servers: 2, svc: { type: 'exp', mean: 45 } })],
        run: { hours: 160, warmupH: 8, reps: 10, seed: 3, drain: false, slT: 30 },
        cost: { server: 220, wait: 600, lost: 0, cur: '$' }
      }
    },
    {
      id: 'urgencias', sector: 'Salud', name: 'Urgencias con triage: prioridad expropiativa',
      desc: 'Tres niveles de triage. Un paciente crítico interrumpe la atención de uno menos grave, que retoma después (prioridad expropiativa con reanudación).',
      spec: {
        name: 'Urgencias — triage', open: 0,
        arrivals: { mode: 'poisson', rate: 10 },
        classes: [{ name: 'Crítico', share: 10, prio: 1 }, { name: 'Urgente', share: 30, prio: 2 }, { name: 'No urgente', share: 60, prio: 3 }],
        stages: [stage({ name: 'Médicos', servers: 3, svc: { type: 'lnorm', mean: 15, sd: 10 }, disc: 'PRIOP' })],
        run: { hours: 24, warmupH: 0, reps: 20, seed: 17, drain: true, slT: 30 }
      }
    },
    {
      id: 'autolavado', sector: 'Otros servicios', name: 'Autolavado: capacidad limitada (M/D/2/6)',
      desc: 'Dos túneles de lavado de 8 min exactos y espacio para 4 autos en espera. Si el patio está lleno, el auto se va (cliente perdido).',
      spec: {
        name: 'Autolavado — capacidad 6', open: 480,
        arrivals: { mode: 'poisson', rate: 12 }, capacity: 6,
        stages: [stage({ name: 'Túneles', servers: 2, svc: { type: 'det', mean: 8 } })],
        run: { hours: 10, warmupH: 0, reps: 30, seed: 21, drain: true, slT: 10 },
        cost: { server: 180, wait: 60, lost: 150, cur: '$' }
      }
    },
    {
      id: 'tramites', sector: 'Gobierno', name: 'Oficina de trámites: turnero, ventanillas y caídas del sistema',
      desc: 'Recepción entrega turno y luego 5 ventanillas atienden. El sistema informático falla en promedio cada 3 h por 12 min, deteniendo la ventanilla afectada.',
      spec: {
        name: 'Trámites — recepción → ventanillas', open: 480,
        arrivals: { mode: 'poisson', rate: 40 },
        fail: { on: true, mtbf: 180, mttr: 12 },
        stages: [stage({ name: 'Recepción', servers: 1, svc: { type: 'det', mean: 0.8 } }), stage({ name: 'Ventanillas', servers: 5, svc: { type: 'lnorm', mean: 6, sd: 4 } })],
        run: { hours: 8, warmupH: 0, reps: 20, seed: 9, drain: true, slT: 10 }
      }
    },
    {
      id: 'teoria', sector: 'Teoría y validación', name: 'Estado estable M/M/3 (para comparar con la teoría)',
      desc: 'Horizonte largo con periodo de calentamiento: los promedios simulados convergen a las fórmulas de Erlang C. Útil para validar y enseñar.',
      spec: {
        name: 'M/M/3 en estado estable', open: 0,
        arrivals: { mode: 'poisson', rate: 60 },
        stages: [stage({ name: 'Servidores', servers: 3, svc: { type: 'exp', mean: 2.5 } })],
        run: { hours: 400, warmupH: 20, reps: 10, seed: 1, drain: false, slT: 2 }
      }
    }
  ];
  P.get = (id) => { const p = P.list.find((x) => x.id === id) || P.list[0]; return QS.Sim.normalize(JSON.parse(JSON.stringify(p.spec))); };
})(typeof window !== 'undefined' ? window : globalThis);
