/* Pestaña "Guía y metodología": cómo alimentar los datos, variables, modelos, metodología y referencias. */
(function (root) {
  'use strict';
  const QS = root.QS; const U = QS.U, h = U.h, UI = QS.UI;
  const GU = QS.GuideUI = {};

  const SECTIONS = [
    ['flujo', 'Cómo trabajar'], ['archivos', '¿Qué archivos necesito?'], ['giros', 'Qué pedir según tu giro'], ['alimentar', 'Cómo alimentar los datos'], ['formatos', 'Formatos de archivo'], ['calidad', 'Lista de verificación'],
    ['variables', 'Variables y notación'], ['kendall', 'Notación de Kendall'], ['modalidades', 'Modalidades de sistemas'], ['modelos', 'Modelos analíticos'],
    ['estandar', 'Estándar de modelación con datos'], ['metodo', 'Pronóstico y personal'], ['simulacion', 'Buenas prácticas de simulación'], ['validacion', 'Validación del simulador'],
    ['opensource', 'Proyectos abiertos integrados'], ['biblio', 'Bibliografía']
  ];

  const T = (rows) => `<div class="tbl-scroll"><table class="tbl compact"><thead><tr>${rows[0].map((x) => `<th>${x}</th>`).join('')}</tr></thead><tbody>${rows.slice(1).map((r) => `<tr>${r.map((x) => `<td>${x}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;

  const SEC_ROWS = () => QS.Sectors.list.map((sc) => [`<b>${sc.name}</b>`, sc.system.source, sc.system.report + (sc.system.alt ? ' ' + sc.system.alt : ''), sc.system.columns.filter((c) => c[1] === 'Obligatoria').map((c) => c[0]).join(', ')]);
  const CONTENT = {
    archivos: `<h2 id="g-archivos">¿Qué archivos necesito?</h2>
      <p>La regla es simple: <b>un archivo principal siempre</b> y, solo si ese archivo no trae algo, uno o dos complementos. En Herramientas → Planeación por temporada se piden en ese orden y se indica qué falta; con registros detallados por transacción usa el recorrido de cinco pasos.</p>
      ${T([['Tu situación', 'Qué preparar', 'Archivos'],
        ['Tengo sistema que registra cada cliente (ticket, turno, llamada)', 'El reporte de 2 a 5 años, una fila por cliente. Con eso se miden llegadas, esperas y tiempos de atención.', '<b>1</b>'],
        ['Mi sistema da conteos por hora (ACD, contador de personas)', 'El reporte por intervalo de 2 a 5 años. Si no trae el tiempo medio de atención, agrega una muestra cronometrada o escribe el promedio.', '<b>1</b> (+1 opcional)'],
        ['Mi sistema solo da totales por día (ventas o tickets)', 'Los totales diarios de 2 a 5 años y, para repartir el día por hora, 1 a 4 semanas de conteo por hora (si no, se usa el perfil típico del giro).', '<b>1</b> (+1 opcional)'],
        ['No tengo sistema', 'Conteo por hora de 2 a 4 semanas (obligatorio), 50 a 200 tiempos de atención (recomendado) y, si existen, ventas diarias de años anteriores para las temporadas.', '<b>1</b> (+2 opcionales)'],
        ['No tengo datos', 'Nada: el asistente te pide estimaciones (clientes en un día normal, fin de semana, tiempo de atención y temporadas).', '<b>0</b>']])}
      <h3>Reglas para cualquier archivo</h3>
      <ul>
        <li>Un solo archivo por área (cajas, módulo de servicio, call center). Si tienes varias sucursales, prepara un archivo por sucursal.</li>
        <li>CSV o Excel con encabezados en la primera fila. Los nombres pueden ser los de tu sistema: el asistente los reconoce y te deja corregirlos.</li>
        <li>Incluye todo el periodo disponible. Para temporadas se necesitan al menos 2 años; para el perfil por día y hora bastan 2 a 4 semanas.</li>
        <li>No se necesitan datos personales de clientes ni de empleados.</li>
      </ul>`,
    giros: `<h2 id="g-giros">Qué pedir según tu giro</h2>
      <p>Lo que normalmente exporta cada tipo de sistema. En el asistente puedes descargar un archivo de ejemplo con el formato de tu giro.</p>
      ${T([['Giro', 'Sistema de origen', 'Reporte', 'Columnas obligatorias']].concat(SEC_ROWS()))}
      <h3>Notas de experto para retail</h3>
      <ul>
        <li>El punto de venta registra el ticket <b>al cobrar</b>: cada ticket es un cliente atendido en caja. Quien se va sin comprar no aparece; si tienes contador de personas en la entrada, úsalo para medir la afluencia total del piso.</li>
        <li>Si el sistema guarda la hora del primer artículo escaneado, la diferencia con el cierre del ticket es el tiempo de cobro.</li>
        <li>Separa las cajas rápidas y el autocobro con la columna de caja: tienen otra fila y otro tiempo de atención.</li>
        <li>Buen Fin, Hot Sale, Navidad y quincenas se detectan solos si tienes al menos 2 años de historia.</li>
      </ul>`,
    flujo: `<h2 id="g-flujo">Cómo trabajar con el simulador</h2>
      <p>El trabajo principal es el <b>recorrido de cinco pasos</b>: tu operación, tus datos, las mediciones en tienda, el diagnóstico y el plan de personal. Las <b>Herramientas</b> reúnen lo que es para especialistas: simulador libre, fórmulas de colas, personal por intervalo, análisis de series y planeación por temporada. Con años de historia de un área, el análisis completo con esas herramientas sigue este flujo:</p>
      <ol>
        <li><b>Herramientas → Análisis de series → Cargar datos.</b> Sube el histórico (idealmente 3 a 5 años). El sistema reconoce las columnas, valida la calidad y detecta feriados.</li>
        <li><b>Patrones y temporadas.</b> Revisa el índice estacional mensual, el efecto del día de la semana, las quincenas, los eventos (Semana Santa, Buen Fin, Navidad) y el perfil por hora. Ajusta qué meses son temporada alta, normal o baja.</li>
        <li><b>Pronóstico.</b> Se comparan tres métodos en el último año fuera de muestra y se usa el de menor error. Opcionalmente puedes llevar los datos a Prophet y volver a importar su pronóstico.</li>
        <li><b>Plan de personal.</b> Con la meta de servicio (por ejemplo, 80 % atendido antes de 5 minutos), la merma y las reglas de turnos, obtienes cuántas personas contratar por mes, cuántas son base permanente y cuántas temporales, y los refuerzos para fechas especiales.</li>
        <li><b>Validación.</b> Envía cualquier día al <b>Simulador</b> para verlo en movimiento y confirmar con réplicas que el plan cumple la meta incluso con la variabilidad real (los modelos de Erlang suponen estado estable en cada hora; la simulación no).</li>
      </ol>
      <p>Si tu atención pasa por varias áreas (por ejemplo, <b>cajas</b> que emiten facturas y <b>facturación</b> que cobra y emite recibos), usa el <b>recorrido de cinco pasos</b>: eliges el modelo de atención, subes un solo archivo con todas las áreas (o uno por área), confirmas el personal y mides en tienda lo que los reportes no guardan y el sistema construye, valida y simula el modelo de toda la red con el estándar de modelación descrito en esta guía.</p>
      <p>Si no tienes datos, empieza por <b>Modelos analíticos</b> o por un escenario de ejemplo en el <b>Simulador</b>.</p>`,

    alimentar: `<h2 id="g-alimentar">Cómo alimentar la información</h2>
      <p>La calidad del resultado depende de los datos. Pide a tu área de sistemas una exportación con estas características:</p>
      <h3>¿De dónde salen los datos?</h3>
      ${T([['Sistema de origen', 'Qué exportar', 'Formato recomendado'],
        ['Turnero o gestor de filas (sucursales, oficinas de gobierno, clínicas)', 'Cada ticket: hora de emisión, hora de llamado, hora de fin, ventanilla, tipo de trámite, si se perdió', 'Transaccional'],
        ['Centralita o ACD de call center', 'Reporte por intervalo de 15 o 30 min: llamadas ofrecidas, atendidas, abandonadas, TMO, nivel de servicio, agentes conectados', 'Por intervalo'],
        ['Punto de venta (cajas)', 'Cada ticket de venta con fecha-hora, caja y monto; o conteo de tickets por hora', 'Transaccional o por intervalo'],
        ['Contador de personas o cámaras', 'Entradas por hora', 'Por intervalo'],
        ['ERP o contabilidad', 'Ventas diarias por sucursal', 'Diario (con ticket promedio)'],
        ['CRM o agenda de citas', 'Hora de la cita, hora de llegada, inicio y fin de atención, inasistencias', 'Transaccional']])}
      <h3>¿Cuánta historia?</h3>
      <ul>
        <li><b>Mínimo 2 años</b> para separar la estacionalidad anual de la tendencia. Con 1 año los índices son preliminares.</li>
        <li><b>Ideal 3 a 5 años</b>: permite validar el pronóstico con un año completo fuera de muestra y medir eventos que cambian de fecha (Semana Santa, Buen Fin).</li>
        <li>Para ajustar la distribución del tiempo de atención bastan <b>2 a 4 semanas</b> de detalle por cliente.</li>
      </ul>
      <h3>Granularidad</h3>
      <ul>
        <li>Para dimensionar personal se necesita la demanda <b>por hora</b> (o por 15/30 minutos en call centers). Si solo tienes totales diarios, el sistema reparte el día con un perfil horario típico, pero conviene conseguir al menos unos meses por hora.</li>
        <li>Si cargas datos de varias sucursales o canales, hazlo por separado: cada una tiene su propio patrón.</li>
      </ul>
      <h3>Privacidad</h3>
      <p>Los archivos se procesan en tu navegador; no se envían a ningún servidor. Aun así, exporta sin nombres ni datos personales: el simulador solo necesita fechas, horas, duraciones y conteos.</p>`,

    formatos: `<h2 id="g-formatos">Formatos de archivo</h2>
      <p>Se aceptan CSV o TXT con cualquier separador (coma, punto y coma, tabulador o barra), Excel .xlsx y texto pegado desde Excel. La codificación (UTF-8 o ANSI de Windows), el separador decimal y el orden de la fecha se detectan solos y puedes corregirlos en el mapeo. Las columnas se reconocen por su nombre en español o inglés (fecha, hora, llegadas, clientes, tmo, aht, abandonos, cajeros…) y siempre puedes reasignarlas.</p>
      <h3>1. Transaccional: una fila por cliente o ticket</h3>
      ${T([['Columna', 'Obligatoria', 'Ejemplo', 'Uso'],
        ['llegada (fecha-hora)', 'Sí', '2025-03-14 09:02:11', 'Demanda por hora, tiempos entre llegadas'],
        ['inicio_atencion', 'No', '2025-03-14 09:02:40 o 09:02:40', 'Espera = inicio − llegada'],
        ['fin_atencion', 'No', '2025-03-14 09:07:55', 'Servicio = fin − inicio'],
        ['duracion', 'No', '5,3 · 318 s · 00:05:18', 'Alternativa a inicio/fin'],
        ['caja / agente', 'No', 'C1', 'Personal activo por hora'],
        ['tipo_cliente', 'No', 'Preferencial', 'Clases y prioridades'],
        ['abandono', 'No', 'si / no · 1 / 0', 'Tasa de abandono, paciencia']])}
      <h3>2. Por intervalo: una fila por hora (o 15/30 min)</h3>
      ${T([['Columna', 'Obligatoria', 'Ejemplo'],
        ['fecha', 'Sí', '14/03/2025 · 2025-03-14 · 14-mar-2025'], ['hora', 'Si la fecha no trae hora', '09:00 · 9 · 9-10 · 2:30 p. m.'],
        ['llegadas', 'Sí', '52'], ['tmo (tiempo medio de atención)', 'Recomendada', '5,9 (min) · 354 (s) · 00:05:54'],
        ['espera media', 'No', '3,4'], ['abandonos', 'No', '2'], ['servidores activos', 'No', '4'], ['ventas', 'No', '22 310']])}
      <h3>3. Diario: una fila por día</h3>
      ${T([['Columna', 'Obligatoria', 'Ejemplo'], ['fecha', 'Sí', '2025-03-14'], ['clientes', 'Sí, o ventas + ticket promedio', '611'], ['ventas', 'No', '262 450'], ['tmo', 'No', '6,0'], ['abandonos', 'No', '25']])}
      <p>Si solo tienes ventas, indica el <b>ticket promedio</b> en el mapeo: clientes = ventas / ticket. Las plantillas descargables (Herramientas → Análisis de series, y al final de esta guía) tienen exactamente estos encabezados.</p>
      <h3>Fechas, horas y números</h3>
      <ul>
        <li>Fechas: <code>AAAA-MM-DD</code>, <code>DD/MM/AAAA</code>, <code>MM/DD/AAAA</code>, <code>14-mar-2025</code>, <code>14 de marzo de 2025</code> y números de serie de Excel.</li>
        <li>Horas: <code>09:30</code>, <code>9:30:15</code>, <code>2:30 p. m.</code>, <code>9</code> (hora entera) o rangos <code>9-10</code>.</li>
        <li>Números: <code>1.234,5</code> o <code>1,234.5</code>; se ignoran símbolos de moneda y espacios.</li>
        <li>Duraciones: minutos, segundos, horas, <code>hh:mm:ss</code> o formato de hora de Excel (fracción de día).</li>
      </ul>`,

    calidad: `<h2 id="g-calidad">Lista de verificación de calidad</h2>
      <ul>
        <li>Incluye <b>todos los días</b> del periodo; los días sin registros se tratan como cerrados (feriados) y se listan en "Calidad".</li>
        <li>Quita registros de prueba, duplicados y tickets anulados.</li>
        <li>Usa una sola zona horaria y revisa los cambios de horario de verano.</li>
        <li>Si el sistema estuvo caído o hubo una huelga, anótalo: aparecerá como día atípico y conviene excluirlo o marcarlo como evento.</li>
        <li>El TMO debe incluir el trabajo posterior a la atención (llenar formatos, cobrar) si el servidor no puede atender a otro mientras tanto.</li>
        <li>Registra los <b>eventos propios</b> del negocio (ferias, campañas, cierres por inventario) y agrégalos en "Patrones y temporadas".</li>
        <li>La demanda observada en filas muy saturadas subestima la real (gente que ni siquiera entró): si tienes datos de abandono o desistimiento, inclúyelos.</li>
      </ul>`,

    variables: `<h2 id="g-variables">Variables de la teoría de colas</h2>
      ${T([['Símbolo', 'Nombre', 'Definición'],
        ['λ', 'Tasa de llegada', 'Clientes que llegan por unidad de tiempo (aquí, por hora)'],
        ['μ', 'Tasa de servicio', 'Clientes que un servidor atiende por hora = 60 / TMO (min)'],
        ['1/μ, TMO, AHT', 'Tiempo medio de atención', 'Duración promedio del servicio'],
        ['c', 'Servidores', 'Cajeros, agentes, ventanillas o máquinas en paralelo'],
        ['a = λ/μ', 'Carga ofrecida', 'Trabajo que llega, en Erlangs (servidores ocupados en promedio si nadie se pierde)'],
        ['ρ = λ/(cμ)', 'Intensidad de tráfico', 'Utilización promedio de cada servidor; debe ser menor que 1 sin pérdidas'],
        ['K', 'Capacidad', 'Máximo de clientes dentro del sistema (fila + servicio)'],
        ['N', 'Población', 'Número total de clientes posibles (fuente finita)'],
        ['L, Lq', 'Clientes en sistema / en fila', 'Promedios en el tiempo'],
        ['W, Wq', 'Tiempo en sistema / en fila', 'Promedios por cliente; Ley de Little: L = λ·W, Lq = λ·Wq'],
        ['P₀, Pₙ', 'Probabilidades de estado', 'Probabilidad de que haya 0 o n clientes'],
        ['C(c, a)', 'Erlang C', 'Probabilidad de que un cliente tenga que esperar'],
        ['B(c, a)', 'Erlang B', 'Probabilidad de que un cliente se pierda en un sistema sin fila'],
        ['NS (X/T)', 'Nivel de servicio', '% de clientes atendidos con espera ≤ T (los abandonos cuentan como incumplimiento)'],
        ['ASA', 'Velocidad media de respuesta', 'Espera media en fila (término de call center)'],
        ['θ', 'Tasa de abandono', '1 / paciencia media (modelo Erlang A)'],
        ['Ca², Cs²', 'Variabilidad', 'Coeficiente de variación al cuadrado de llegadas y servicio (1 = exponencial)'],
        ['λ efectiva', 'Llegadas que entran', 'λ menos los bloqueados y los que desisten'],
        ['Merma (shrinkage)', 'Tiempo no productivo', 'Descansos, ausentismo, capacitación; programados = requeridos / (1 − merma)'],
        ['FTE', 'Equivalente a tiempo completo', 'Horas programadas / horas de un contrato completo']])}`,

    kendall: `<h2 id="g-kendall">Notación de Kendall: A/B/c/K/N/D</h2>
      ${T([['Posición', 'Significado', 'Valores usados'],
        ['A', 'Proceso de llegada', 'M (Poisson), D (constante), Eₖ (Erlang), G/GI (general), M(t) (tasa variable), Mˣ (en grupos)'],
        ['B', 'Tiempo de servicio', 'M (exponencial), D, Eₖ, H₂ (hiperexponencial), G'],
        ['c', 'Servidores', 'Número entero; c(t) si cambia por turnos'],
        ['K', 'Capacidad del sistema', '∞ si no hay límite'],
        ['N', 'Tamaño de la población', '∞ si es abierta'],
        ['D', 'Disciplina', 'FIFO, LIFO, SIRO, PRI (prioridad), PRI-E (expropiativa), SPT']])}
      <p>Ejemplos: <code>M/M/4/∞/∞/FIFO</code> es un banco con fila única y 4 cajeros; <code>M/M/c+M</code> es Erlang A con abandono exponencial; <code>M/M/2/∞/20</code> es un taller con 20 máquinas y 2 técnicos.</p>`,

    modalidades: `<h2 id="g-modalidades">Modalidades de sistemas de colas</h2>
      <h3>Las cuatro configuraciones básicas</h3>
      <ul>
        <li><b>Un canal, una fase:</b> un solo servidor (kiosco, consultorio con un médico).</li>
        <li><b>Varios canales, una fase:</b> cajeros en paralelo (bancos, supermercados).</li>
        <li><b>Un canal, varias fases:</b> etapas sucesivas con un servidor cada una (registro → consulta).</li>
        <li><b>Varios canales, varias fases:</b> comida rápida (ordenar → pagar → recoger), urgencias (triage → médico → caja).</li>
      </ul>
      <h3>Variantes que el simulador incorpora</h3>
      ${T([['Modalidad', 'Ejemplo real', 'Dónde se configura'],
        ['Fila única vs. fila por servidor', 'Banco (serpentina) vs. supermercado', 'Etapas → Tipo de fila'],
        ['Cambio de fila (jockeying)', 'Cliente que se pasa a la caja que se liberó', 'Etapas → Permitir cambio de fila'],
        ['Prioridades sin expropiación', 'Turno preferencial para adultos mayores', 'Tipos de clientes + disciplina "Prioridad"'],
        ['Prioridades con expropiación', 'Urgencias: un caso crítico interrumpe', 'Disciplina "Prioridad con expropiación"'],
        ['Capacidad limitada', 'Sala de espera, estacionamiento, troncales telefónicas', 'Comportamiento → Capacidad K'],
        ['Desistir al llegar (balking)', 'Cliente que ve la fila larga y se va', 'Comportamiento → Desistir'],
        ['Abandono (reneging)', 'Llamada que cuelga, cliente que se cansa', 'Comportamiento → Abandono'],
        ['Reintentos', 'Quien colgó vuelve a llamar', 'Comportamiento → Reintentan'],
        ['Población finita', 'Máquinas que fallan, pacientes internados', 'Llegadas → Población finita'],
        ['Llegadas en grupo', 'Familias, excursiones, lotes de pedidos', 'Llegadas → En grupo'],
        ['Citas programadas', 'Consultorios, trámites con agenda', 'Llegadas → Citas (con inasistencia e impuntualidad)'],
        ['Demanda variable por hora', 'Hora del almuerzo, quincena', 'Llegadas → Perfil por hora'],
        ['Turnos de personal', 'Más cajas abiertas en la tarde', 'Etapas → Servidores según horario'],
        ['Servidores heterogéneos', 'Personal nuevo más lento', 'Etapas → Velocidad relativa'],
        ['Interrupciones', 'Caída del sistema, avería', 'Interrupciones del servicio']])}`,

    modelos: `<h2 id="g-modelos">Modelos analíticos disponibles</h2>
      ${T([['Modelo', 'Cuándo usarlo', 'Tipo'],
        ['M/M/1, M/M/c (Erlang C)', 'Llegadas Poisson, servicio exponencial, fila ilimitada', 'Exacto'],
        ['M/M/c/K', 'Espacio limitado: los que llegan con el sistema lleno se pierden', 'Exacto'],
        ['M/M/c/c (Erlang B)', 'Sin fila: líneas telefónicas, camas, estacionamiento', 'Exacto'],
        ['M/M/∞', 'Autoservicio: siempre hay servidor', 'Exacto'],
        ['M/M/c/K/N', 'Población finita (mantenimiento, pacientes)', 'Exacto'],
        ['Erlang A (M/M/c+M)', 'Call centers y filas con abandono', 'Exacto'],
        ['Nacimiento y muerte general', 'Rechazo + abandono + capacidad combinados', 'Exacto (numérico)'],
        ['M/G/1 (Pollaczek-Khinchine)', 'Servicio con cualquier distribución, un servidor', 'Exacto en media y varianza'],
        ['M/G/c', 'Servicio general, varios servidores', 'Aproximación de dos momentos'],
        ['G/G/1 (Kingman + KLB)', 'Llegadas y servicio generales', 'Aproximación'],
        ['G/G/c (Allen-Cunneen)', 'Caso general multiservidor', 'Aproximación (QNA)'],
        ['Mˣ/G/1', 'Llegadas en grupo', 'Exacto'],
        ['Prioridades (Cobham, Kleinrock)', 'Clases con distinta prioridad', 'Exacto para M/G/1 y M/M/c'],
        ['Red en serie (Jackson / QNA)', 'Procesos de varias etapas', 'Exacto con Poisson y exponencial; si no, QNA']])}
      <p>Cada resultado muestra las fórmulas usadas. Cuando un modelo es aproximado, el botón "Simular este modelo" permite medir el error con réplicas.</p>`,

    metodo: `<h2 id="g-metodo">Metodología: del histórico a cuántas personas contratar</h2>
      <ol>
        <li><b>Agregación diaria y horaria</b> de los datos; los días sin registros se tratan como cierres y los feriados recurrentes se detectan automáticamente.</li>
        <li><b>Descomposición clásica multiplicativa</b> (razón a la media móvil centrada 2×12) para el índice mensual; tendencia log-lineal sobre la serie desestacionalizada.</li>
        <li><b>Índice de día de la semana</b>: mediana de la razón contra la media móvil de 7 días (robusta a feriados). <b>Índice de día del mes</b>: efecto de quincenas y días de pago.</li>
        <li><b>Eventos</b>: efecto medido de cada fecha especial frente a lo esperado. Semana Santa, Buen Fin y Black Friday se calculan para cada año (fechas móviles).</li>
        <li><b>Pronóstico</b>: regresión armónica diaria inspirada en Prophet (tendencia por tramos, términos de Fourier anuales, día de la semana, quincenas y eventos, en escala logarítmica con regularización ridge), Holt-Winters mensual y un método ingenuo estacional. Se validan en los últimos 12 meses fuera de muestra (MAPE) y se usa el mejor; si gana Holt-Winters, fija el nivel mensual y el modelo armónico reparte los días.</li>
        <li><b>Cobertura de la demanda</b>: el pronóstico es un valor medio. El percentil elegido (P75, P90, P95) de la razón real/esperado protege contra los días más cargados.</li>
        <li><b>Demanda por hora</b> = demanda del día × perfil horario del día de la semana.</li>
        <li><b>Agentes por hora</b>: el mínimo c que cumple la meta con Erlang C (o Erlang A si hay paciencia), respetando la ocupación máxima. Es el enfoque SIPP (periodos independientes estacionarios).</li>
        <li><b>Merma</b>: programados = requeridos / (1 − merma).</li>
        <li><b>Turnos</b>: programación entera (javascript-lp-solver) que minimiza el costo de turnos de jornada completa y medio tiempo cubriendo cada hora, con límite de horas a medio tiempo.</li>
        <li><b>Plantilla</b>: personas de jornada completa = máx(pico diario, turnos semanales / días laborables); igual para medio tiempo. FTE = horas / horas de contrato.</li>
        <li><b>Base y temporales</b>: la plantilla base (permanente) es la del mes más bajo (o el percentil 25 o el promedio); la diferencia en cada mes son temporales, horas extra o vacaciones a programar en temporada baja.</li>
      </ol>
      <h3>Limitaciones a tener en cuenta</h3>
      <ul>
        <li>Erlang por hora supone que cada hora está en estado estable. En horas de transición fuertes (aperturas, picos cortos) la fila arrastra clientes a la hora siguiente: valida con el simulador.</li>
        <li>La demanda histórica en filas saturadas subestima la real. Si hubo abandono o desistimiento alto, súmalo a la demanda.</li>
        <li>Los cambios estructurales (nueva sucursal, digitalización, pandemia) no se pronostican: excluye esos periodos o márcalos como eventos.</li>
      </ul>`,

    simulacion: `<h2 id="g-simulacion">Buenas prácticas de simulación</h2>
      <ul>
        <li><b>Réplicas:</b> una sola corrida es una muestra; usa 20 a 30 réplicas y mira el intervalo de confianza del 95 %.</li>
        <li><b>Estado estable vs. jornada:</b> para comparar con la teoría usa horizontes largos, calentamiento y corte al cierre. Para operar un día real usa la jornada con apertura vacía y atención de quienes quedan.</li>
        <li><b>Semilla:</b> la misma semilla reproduce exactamente los resultados; al comparar alternativas con la misma semilla se reduce la varianza (números aleatorios comunes).</li>
        <li><b>Ley de Little</b> como verificación: L ≈ λ·W.</li>
        <li><b>Validación cruzada:</b> exporta el escenario a Ciw (Python) para obtener una segunda opinión independiente.</li>
        <li>Si la utilización se acerca a 100 %, los resultados varían muchísimo entre réplicas: es una señal de que el sistema está al límite.</li>
      </ul>`,

    validacion: `<h2 id="g-validacion">Validación del simulador</h2>
      <p>Los cálculos se verificaron de cinco formas (los scripts están en la carpeta <code>tests/</code>; el resumen está en Herramientas → Validación de los cálculos):</p>
      <ul>
        <li><b>Valores de libro:</b> M/M/1, Erlang B y C, M/M/2 (Hillier-Lieberman), M/D/1, M/M/1/K, M/M/∞, prioridades de Cobham y la ley de conservación de Kleinrock coinciden con sus fórmulas cerradas.</li>
        <li><b>Solución independiente:</b> una cadena de Markov resuelta por eliminación gaussiana (código distinto al del programa) reproduce a 9 decimales los modelos de capacidad limitada, fuente finita, Erlang A y rechazo con abandono; la Ley de Little se cumple a precisión de máquina en 12 modelos y el dimensionamiento coincide con una búsqueda exhaustiva en 48 casos.</li>
        <li><b>Simulación contra teoría:</b> 20 modelos (M/M/1, M/M/3, M/D/1, M/E₂/1, M/LN/1, M/H₂/1, M/M/2/5, Erlang B, fuente finita con y sin capacidad, Erlang A, rechazo lineal y exponencial con abandono, prioridades con y sin expropiación con 1 y 2 servidores, red en serie, rutas por tipo de cliente, llegadas en grupo y G/G/2) coinciden dentro del margen estadístico. En total, <code>node tests/validacion.js</code>: 194 pruebas correctas.</li>
        <li><b>Contra Ciw</b> (biblioteca independiente de simulación de colas): M/M/3, M/D/1, E₂/Gamma/2, banco con preferenciales, urgencias con expropiación, autolavado con capacidad, comida rápida en dos etapas, un escenario mixto con lotes, rechazo, abandono Weibull y prioridades, y el proceso de dos áreas medido con datos dan resultados estadísticamente equivalentes.</li>
        <li><b>Precisión de las aproximaciones</b> (<code>tests/precision_aproximaciones.js</code>, 101 casos) y <b>medición con valores conocidos</b> (<code>tests/validar_medicion.js</code>, 7 escenarios): cada fórmula aproximada muestra su error medido y cada método de medición, su exactitud.</li>
      </ul>`,

    opensource: `<h2 id="g-opensource">Proyectos de código abierto integrados</h2>
      ${T([['Proyecto', 'Uso en el simulador', 'Licencia'],
        ['<a href="https://github.com/apache/echarts" target="_blank" rel="noopener">Apache ECharts</a>', 'Gráficas interactivas con acercamiento, mapas de calor e intervalos', 'Apache-2.0'],
        ['<a href="https://github.com/mholt/PapaParse" target="_blank" rel="noopener">PapaParse</a>', 'Lectura de CSV por bloques (archivos de millones de filas)', 'MIT'],
        ['<a href="https://github.com/SheetJS/sheetjs" target="_blank" rel="noopener">SheetJS</a>', 'Lectura de Excel (.xlsx)', 'Apache-2.0'],
        ['<a href="https://github.com/JWally/jsLPSolver" target="_blank" rel="noopener">javascript-lp-solver</a>', 'Programación entera para turnos óptimos', 'Unlicense'],
        ['<a href="https://github.com/CiwPython/Ciw" target="_blank" rel="noopener">Ciw</a>', 'Validación cruzada y exportación de escenarios a Python', 'MIT'],
        ['<a href="https://github.com/facebook/prophet" target="_blank" rel="noopener">Prophet</a>', 'Inspira el modelo armónico; exportación de scripts para pronóstico avanzado', 'MIT'],
        ['<a href="https://github.com/rodrigo-arenas/pyworkforce" target="_blank" rel="noopener">pyworkforce</a>', 'Exportación de requerimientos para programar turnos con OR-Tools', 'MIT'],
        ['<a href="https://github.com/A-Herzog/Warteschlangensimulator" target="_blank" rel="noopener">Warteschlangensimulator</a> (A. Herzog)', 'Referencia de funcionalidades de simulación G/G/c/K+G con reintentos', 'Apache-2.0']])}`,

    estandar: `<h2 id="g-estandar">Estándar de modelación con datos</h2>
      <p>Cada empresa registra su operación a su manera, pero el modelo de colas se construye siempre con el mismo método. Así, un retail con cajas y facturación, un banco con ventanillas y ejecutivos o una clínica con admisión, consulta y farmacia se modelan, validan y comparan igual. El método sigue los textos clásicos de simulación (Law, 2015; Banks et al., 2010) y de teoría de colas (Shortle et al., 2018), y la literatura de ciencia de servicios basada en datos (Brown et al., 2005).</p>
      ${T([['Paso', 'Qué se define', 'Cómo se obtiene de los datos', 'Referencia'],
        ['1. Sistema', 'Estaciones (áreas), servidores, clases de cliente y su ruta, disciplina y capacidad. Notación Mₜ/G/c(t)/∞/FIFO por área.', 'Mapa del proceso: áreas, tipos de transacción de cada área y flujos (qué áreas visita cada tipo de cliente).', 'Kendall (1953); Baskett et al. (1975)'],
        ['2. Llegadas', 'Proceso de Poisson no homogéneo: tasa por hora λ(t) para cada día de la semana y tipo de cliente; tipos de día (días de pago, P75, P90).', 'Conteo por hora de la transacción de entrada de cada flujo, promedio de los días con movimiento. Prueba del índice de dispersión (varianza/media) en celdas mes × día × hora.', 'Law (2015, §6.12); Kim y Whitt (2014); Whitt (2006)'],
        ['3. Mezcla y rutas', 'Participación de cada flujo y matriz de ruta por clase.', 'Mínimos cuadrados no negativos sobre los conteos de cada tipo en cada área; error de ajuste ≤ 5 %.', 'Lawson y Hanson (1974)'],
        ['4. Atención', 'Distribución del tiempo de atención por área y tipo de transacción (media y coeficiente de variación).', '<b>Medido</b> con la hora de inicio: máxima verosimilitud y elección por AIC con prueba de Kolmogorov–Smirnov. <b>Inferido</b> con el documento relacionado: simulación con las llegadas reales hasta reproducir los cuartiles del tiempo entre documentos. <b>Máximo probable</b> con solo la hora de emisión, corregido con un promedio conocido o una muestra cronometrada.', 'Law (2015, cap. 6); Akaike (1974); Gouriéroux et al. (1993); Larson (1990)'],
        ['5. Personal', 'Servidores por hora c(t).', 'Presencia de cada punto por sesiones de trabajo (de su primera a su última transacción, cortadas en pausas largas); para planear: Erlang C por hora y ajuste por simulación.', 'Erlang (1917); Green, Kolesar y Soares (2001); Feldman et al. (2008)'],
        ['6. Abandono', 'Paciencia de los clientes.', 'Con turnero: θ = P(abandono)/E[espera] (Erlang-A). Sin turnero: supuesto explícito de no abandono.', 'Mandelbaum y Zeltyn (2007); Brown et al. (2005)'],
        ['7. Diseño de la simulación', 'Horizonte, condiciones iniciales, réplicas y comparación de escenarios.', 'Simulación terminante de un día típico: inicia vacío, atiende a quienes siguen dentro al cierre; 20 réplicas con intervalo de confianza t de Student; números aleatorios comunes entre escenarios; llegadas por adelgazamiento.', 'Law (2015, §9.4 y §11.2); Lewis y Shedler (1979)'],
        ['8. Verificación y validación', 'Que el programa calcule bien y que el modelo represente la operación real.', 'Verificación: 194 pruebas contra fórmulas exactas y una solución independiente, y validación cruzada con Ciw. Validación: atenciones por hora simuladas vs. reales (error absoluto ponderado ≤ 10 %), tiempo entre documentos y espera medida si existe.', 'Sargent (2013); Palmer et al. (2019)']])}
      <h3>Qué se entrega</h3>
      <ul>
        <li><b>Ficha técnica del modelo</b>: cada parámetro con su valor, cómo se obtuvo, la evidencia (ajuste, prueba, error) y la referencia. Se descarga en CSV junto con el escenario en JSON y un script de Ciw para una segunda opinión independiente.</li>
        <li><b>Validación</b> contra los datos del periodo medido, por área y por hora.</li>
        <li><b>Personal necesario por hora</b> de cada área para la meta de servicio, el día de la semana y el tipo de día, con los turnos sugeridos.</li>
        <li><b>Comparación de escenarios</b> (personal, rapidez de la atención, tipo de fila, demanda) con intervalos de confianza del 95 %.</li>
      </ul>
      <h3>Cómo se aplica a cada giro</h3>
      ${T([['Giro', 'Áreas típicas (estaciones)', 'Clases de cliente (flujos)', 'Dato que más mejora el modelo'],
        ['Retail con crédito', 'Cajas (facturas) → facturación (recibos REC)', 'Contado, crédito con entrada, crédito sin entrada, solo pago de cuota', 'Factura relacionada en cada REC y hora de creación del documento'],
        ['Supermercado', 'Cajas, cajas rápidas, autocobro', 'Compra normal, compra chica', 'Hora del primer artículo escaneado'],
        ['Banco', 'Ventanillas, ejecutivos', 'Por trámite', 'Turnero: emisión, llamado, fin y abandono'],
        ['Call center', 'Colas o habilidades', 'Por cola o campaña', 'Detalle de llamadas del ACD con abandono'],
        ['Salud', 'Admisión → consulta → farmacia', 'Con receta, sin receta, solo farmacia', 'Folio de admisión en la consulta y la receta'],
        ['Gobierno', 'Recepción → ventanillas', 'Trámite corto, trámite largo', 'Turnero'],
        ['Restaurantes', 'Caja → entrega', 'Mostrador, para llevar', 'Número de orden en la entrega']])}`,

    biblio: `<h2 id="g-biblio">Bibliografía</h2>
      <ul>
        <li>Gross, D., Shortle, J. F., Thompson, J. M. y Harris, C. M. (2018). <i>Fundamentals of Queueing Theory</i>, 5.ª ed. Wiley.</li>
        <li>Hillier, F. S. y Lieberman, G. J. (2015). <i>Introducción a la investigación de operaciones</i>, 10.ª ed. McGraw-Hill. Cap. Teoría de colas.</li>
        <li>Taha, H. A. (2017). <i>Investigación de operaciones</i>, 10.ª ed. Pearson. Cap. Sistemas de colas.</li>
        <li>Kleinrock, L. (1975, 1976). <i>Queueing Systems</i>, vol. I y II. Wiley.</li>
        <li>Law, A. M. (2015). <i>Simulation Modeling and Analysis</i>, 5.ª ed. McGraw-Hill.</li>
        <li>Banks, J., Carson, J. S., Nelson, B. L. y Nicol, D. M. (2010). <i>Discrete-Event System Simulation</i>, 5.ª ed. Pearson.</li>
        <li>Gans, N., Koole, G. y Mandelbaum, A. (2003). Telephone call centers: tutorial, review and research prospects. <i>M&amp;SOM</i>, 5(2), 79–141.</li>
        <li>Garnett, O., Mandelbaum, A. y Reiman, M. (2002). Designing a call center with impatient customers. <i>M&amp;SOM</i>, 4(3), 208–227.</li>
        <li>Halfin, S. y Whitt, W. (1981). Heavy-traffic limits for queues with many exponential servers. <i>Operations Research</i>, 29(3), 567–588.</li>
        <li>Whitt, W. (1983). The Queueing Network Analyzer. <i>Bell System Technical Journal</i>, 62(9), 2779–2815.</li>
        <li>Kingman, J. F. C. (1961). The single server queue in heavy traffic. <i>Proc. Cambridge Phil. Soc.</i>, 57, 902–904.</li>
        <li>Krämer, W. y Langenbach-Belz, M. (1976). Approximate formulae for the delay in the queueing system GI/G/1. <i>8th International Teletraffic Congress</i>.</li>
        <li>Cobham, A. (1954). Priority assignment in waiting line problems. <i>Operations Research</i>, 2(1), 70–76.</li>
        <li>Little, J. D. C. (1961). A proof for the queuing formula L = λW. <i>Operations Research</i>, 9(3), 383–387.</li>
        <li>Green, L., Kolesar, P. y Whitt, W. (2007). Coping with time-varying demand when setting staffing requirements for a service system. <i>POMS</i>, 16(1), 13–39.</li>
        <li>Hyndman, R. J. y Athanasopoulos, G. (2021). <i>Forecasting: Principles and Practice</i>, 3.ª ed. OTexts.</li>
        <li>Taylor, S. J. y Letham, B. (2018). Forecasting at scale. <i>The American Statistician</i>, 72(1), 37–45.</li>
        <li>Palmer, G. I., Knight, V. A., Harper, P. R. y Hawa, A. L. (2019). Ciw: An open-source discrete event simulation library. <i>Journal of Simulation</i>, 13(1), 68–82.</li>
        <li>Kendall, D. G. (1953). Stochastic processes occurring in the theory of queues and their analysis by the method of the imbedded Markov chain. <i>Annals of Mathematical Statistics</i>, 24(3), 338–354.</li>
        <li>Erlang, A. K. (1917). Solution of some problems in the theory of probabilities of significance in automatic telephone exchanges. <i>Elektroteknikeren</i>, 13, 5–13.</li>
        <li>Burke, P. J. (1956). The output of a queuing system. <i>Operations Research</i>, 4(6), 699–704.</li>
        <li>Baskett, F., Chandy, K. M., Muntz, R. R. y Palacios, F. G. (1975). Open, closed, and mixed networks of queues with different classes of customers. <i>Journal of the ACM</i>, 22(2), 248–260.</li>
        <li>Lewis, P. A. W. y Shedler, G. S. (1979). Simulation of nonhomogeneous Poisson processes by thinning. <i>Naval Research Logistics Quarterly</i>, 26(3), 403–413.</li>
        <li>Brown, L., Gans, N., Mandelbaum, A., Sakov, A., Shen, H., Zeltyn, S. y Zhao, L. (2005). Statistical analysis of a telephone call center: a queueing-science perspective. <i>JASA</i>, 100(469), 36–50.</li>
        <li>Kim, S.-H. y Whitt, W. (2014). Are call center and hospital arrivals well modeled by nonhomogeneous Poisson processes? <i>M&amp;SOM</i>, 16(3), 464–480.</li>
        <li>Whitt, W. (2006). Staffing a call center with uncertain arrival rate and absenteeism. <i>Production and Operations Management</i>, 15(1), 88–102.</li>
        <li>Green, L. V., Kolesar, P. J. y Soares, J. (2001). Improving the SIPP approach for staffing service systems that have cyclic demands. <i>Operations Research</i>, 49(4), 549–564.</li>
        <li>Feldman, Z., Mandelbaum, A., Massey, W. A. y Whitt, W. (2008). Staffing of time-varying queues to achieve time-stable performance. <i>Management Science</i>, 54(2), 324–338.</li>
        <li>Mandelbaum, A. y Zeltyn, S. (2007). Service engineering in action: the Palm/Erlang-A queue, with applications to call centers. En <i>Advances in Services Innovations</i>, 17–45. Springer.</li>
        <li>Larson, R. C. (1990). The queue inference engine: deducing queue statistics from transactional data. <i>Management Science</i>, 36(5), 586–601.</li>
        <li>Gouriéroux, C., Monfort, A. y Renault, E. (1993). Indirect inference. <i>Journal of Applied Econometrics</i>, 8(S1), S85–S118.</li>
        <li>Lawson, C. L. y Hanson, R. J. (1974). <i>Solving Least Squares Problems</i>. Prentice-Hall.</li>
        <li>Akaike, H. (1974). A new look at the statistical model identification. <i>IEEE Transactions on Automatic Control</i>, 19(6), 716–723.</li>
        <li>Rothkopf, M. H. y Rech, P. (1987). Perspectives on queues: combining queues is not always beneficial. <i>Operations Research</i>, 35(6), 906–909.</li>
        <li>Sargent, R. G. (2013). Verification and validation of simulation models. <i>Journal of Simulation</i>, 7(1), 12–24.</li>
      </ul>`
  };

  GU.init = function (view) {
    U.clear(view);
    const nav = h('nav', { class: 'doc-nav', 'aria-label': 'Contenido de la guía' }, SECTIONS.map(([id, t]) => {
      const a = h('a', { href: '#g-' + id }, t);
      a.addEventListener('click', (e) => { e.preventDefault(); GU.scrollTo(id); });
      return a;
    }));
    const body = h('div', { class: 'doc-body' });
    SECTIONS.forEach(([id]) => body.appendChild(h('section', { html: CONTENT[id] })));
    body.appendChild(h('section', null, h('h2', null, 'Plantillas'), h('div', { class: 'row' },
      UI.btn('Plantilla transaccional', () => U.saveFile('plantilla_transaccional.csv', QS.Data.templates.transaccional(), 'text/csv'), 'btn-sm'),
      UI.btn('Plantilla por intervalo', () => U.saveFile('plantilla_intervalos.csv', QS.Data.templates.intervalos(), 'text/csv'), 'btn-sm'),
      UI.btn('Plantilla diaria', () => U.saveFile('plantilla_diaria.csv', QS.Data.templates.diaria(), 'text/csv'), 'btn-sm'))));
    view.appendChild(h('div', { class: 'view-head' }, h('div', null, h('div', { class: 'eyebrow' }, 'Documentación'), h('h2', null, 'Guía y metodología'),
      h('p', null, 'Cómo preparar los datos, qué significa cada variable, qué supone cada modelo y cómo se calcula el plan de personal.'))));
    view.appendChild(h('div', { class: 'doc' }, nav, body));
  };
  GU.scrollTo = (id) => { const el = document.getElementById('g-' + id); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' }); };
})(typeof window !== 'undefined' ? window : globalThis);
