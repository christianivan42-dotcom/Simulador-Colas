/* Arranque de la aplicación: un recorrido guiado de cinco pasos (QS.Flow), una sección de herramientas para especialistas
   y la guía lateral de cada paso. Los nombres de las pestañas anteriores siguen funcionando como enlaces. */
(function (root) {
  'use strict';
  const QS = root.QS; const U = QS.U, h = U.h, UI = QS.UI;
  const App = QS.App = {};
  const TOOLS = [
    ['simulador', 'Simulador libre', 'Cualquier tipo de fila con animación plana o 3D: bancos, hospitales, comida rápida, prioridades, abandono, capacidad limitada.', 'queue'],
    ['formulas', 'Fórmulas de colas', 'Quince modelos de la teoría de colas con su resultado exacto o aproximado y el error medido de cada aproximación.', 'calc'],
    ['intervalo', 'Personal por intervalo', 'Erlang C y Erlang A por hora para centros de llamadas o cualquier fila única, con turnos óptimos.', 'users'],
    ['series', 'Análisis de series', 'Estacionalidad, distribuciones de llegadas y atención, y pronóstico con historia de varios años.', 'trend'],
    ['temporadas', 'Planeación por temporada', 'Asistente para un área con conteos, totales por día o estimaciones: plantilla base y temporales por mes.', 'calendar'],
    ['registro', 'Registro en tienda', 'Contar llegadas y cronometrar atenciones con el celular cuando no hay sistema.', 'phone'],
    ['estandar', 'Estándar de datos', 'Qué pedir a cualquier sistema, por giro, con verificador de archivos.', 'file'],
    ['validacion', 'Validación de los cálculos', 'Qué tipo de cálculo es cada resultado, en qué se basa y cómo se comprobó.', 'shield'],
    ['metodologia', 'Metodología y bibliografía', 'La guía técnica completa: notación, modelos, simulación, pronóstico y referencias.', 'book']
  ];
  const TOOL_MOD = () => ({ simulador: QS.SimUI, formulas: QS.AnalyticUI, intervalo: QS.StaffUI, series: QS.DataUI, temporadas: QS.Wizard, registro: QS.CaptureUI, metodologia: QS.GuideUI });
  const STEP_IDS = ['proceso', 'archivos', 'mediciones', 'diagnostico', 'plan'];
  // Nombres anteriores → nueva ubicación (los enlaces internos de los módulos siguen funcionando)
  const ALIAS = {
    inicio: ['flujo', {}], operacion: ['flujo', {}], medicion: ['flujo', {}], empezar: ['flujo', { guide: true }],
    asistente: ['herramientas', { tool: 'temporadas' }], captura: ['herramientas', { tool: 'registro' }],
    sim: ['herramientas', { tool: 'simulador' }], simulacion: ['herramientas', { tool: 'simulador' }], expertos: ['herramientas', { tool: 'formulas' }],
    modelos: ['herramientas', { tool: 'formulas' }], personal: ['herramientas', { tool: 'intervalo' }], datos: ['herramientas', { tool: 'series' }],
    guia: ['herramientas', { tool: 'metodologia' }], estandar: ['herramientas', { tool: 'estandar' }], validacion: ['herramientas', { tool: 'validacion' }],
    ayuda: ['herramientas', {}]
  };
  TOOLS.forEach(([id]) => { if (!ALIAS[id]) ALIAS[id] = ['herramientas', { tool: id }]; });
  STEP_IDS.forEach((id) => { ALIAS[id] = ['flujo', { step: id }]; });
  const E = {}; const inited = {};
  let route = 'flujo', tool = null, guideOpen = false, guideManual = false;
  const inViewer = () => !!(root.claude && typeof root.claude.use === 'function');

  App.go = function (r, opts = {}) {
    if (r === 'expertos' && opts.sub === 'datos') r = 'series';
    if (r === 'ayuda' && opts.sub) r = { estandar: 'estandar', validacion: 'validacion', guia: 'metodologia' }[opts.sub] || 'empezar';
    if (r !== 'flujo' && r !== 'herramientas' && ALIAS[r]) { const [t, o] = ALIAS[r]; opts = Object.assign({}, opts, o); r = t; }
    if (r !== 'herramientas') r = 'flujo';
    if (route === 'herramientas' && tool === 'simulador' && (r !== 'herramientas' || opts.tool !== 'simulador') && inited.simulador) QS.SimUI.activate(false);
    route = r;
    E.flow.hidden = r !== 'flujo'; E.tools.hidden = r !== 'herramientas';
    if (r === 'flujo') {
      tool = null;
      if (opts.step && opts.step !== QS.Flow.current()) QS.Flow.go(opts.step);
      if (opts.guide) setGuide(true);
      setHash(QS.Flow.current());
    } else {
      QS.Flow.leave();
      openTool(opts.tool || null, opts);
    }
    renderRail(); renderGuide();
    if (!opts.keepScroll && !opts.anchor) root.scrollTo({ top: 0 });
  };
  const setHash = (id) => { try { history.replaceState(null, '', '#' + id); } catch (e) { /* sin historial */ } };
  App.refreshNav = () => { renderRail(); const n = QS.Flow.company(); E.ws.hidden = !n; E.ws.textContent = n || ''; };
  App.stepChanged = (step) => { if (route === 'flujo') { setHash(step); renderGuide(); renderRail(); } };

  /* ---------------- lista de pasos ---------------- */
  function renderRail() {
    if (!E.rail) return;
    U.clear(E.rail);
    E.rail.appendChild(h('div', { class: 'rail-title' }, 'Pasos'));
    const cur = route === 'flujo' ? QS.Flow.current() : null;
    QS.Flow.steps().forEach((s, i) => {
      const b = h('button', { type: 'button', class: 'rail-step' + (s.id === cur ? ' is-current' : '') + (s.done && s.id !== cur ? ' is-done' : '') + (s.warn && s.id !== cur ? ' is-warn' : ''), disabled: !s.enabled, 'aria-current': s.id === cur ? 'step' : null },
        h('span', { class: 'rail-n' }, s.done && s.id !== cur && !s.warn ? UI.icon('check') : String(i + 1)),
        h('span', null, h('span', { class: 'rail-t' }, s.name), s.summary ? h('span', { class: 'rail-s' }, s.summary) : null));
      b.addEventListener('click', () => App.go('flujo', { step: s.id }));
      E.rail.appendChild(b);
    });
    E.rail.appendChild(h('hr', { class: 'rail-sep' }));
    const link = (icon, text, fn, on) => { const b = h('button', { type: 'button', class: 'rail-link' + (on ? ' is-current' : '') }, UI.icon(icon), text); b.addEventListener('click', fn); return b; };
    E.rail.appendChild(link('book', 'Manual de uso', () => { guideManual = true; setGuide(true); }, guideVisible() && guideManual));
    E.rail.appendChild(link('tools', 'Herramientas', () => App.go('herramientas', {}), route === 'herramientas'));
    E.rail.appendChild(h('div', { class: 'rail-foot' }, 'Los archivos se procesan en tu navegador y no se envían a ningún servidor.'));
  }

  /* ---------------- guía ---------------- */
  function setGuide(open) {
    guideOpen = open; U.store.set('guide:open', open);
    if (!open) guideManual = false;
    renderGuide(); renderRail();
  }
  // La guía del paso se ve en el recorrido; en las herramientas solo si se abrió el manual
  const guideVisible = () => guideOpen && (route === 'flujo' || guideManual);
  function renderGuide() {
    const vis = guideVisible();
    E.guide.hidden = !vis; E.shell.classList.toggle('guide-open', vis); E.gbtn.setAttribute('aria-pressed', String(vis));
    if (!vis) return;
    const step = route === 'flujo' && !guideManual ? QS.Flow.current() : null;
    QS.Help.render(E.guide, step, { manual: guideManual || !step, onClose: () => setGuide(false), onManual: () => { guideManual = true; renderGuide(); renderRail(); } });
  }

  /* ---------------- herramientas ---------------- */
  function openTool(id, opts) {
    tool = TOOLS.some((t) => t[0] === id) ? id : null;
    E.toolList.hidden = !!tool; E.toolHead.hidden = !tool;
    TOOLS.forEach(([tid]) => { const v = E.toolViews[tid]; if (v) v.hidden = tid !== tool; });
    setHash(tool || 'herramientas');
    if (!tool) return;
    const t = TOOLS.find((x) => x[0] === tool);
    U.clear(E.toolTitle); E.toolTitle.appendChild(document.createTextNode(t[1]));
    let v = E.toolViews[tool];
    if (!v) { v = E.toolViews[tool] = h('section', { class: 'tool-view' }); E.tools.appendChild(v); }
    if (!inited[tool]) {
      inited[tool] = true;
      try {
        if (tool === 'estandar') QS.StandardUI.render(v);
        else if (tool === 'validacion') renderValidacion(v);
        else TOOL_MOD()[tool].init(v);
      } catch (e) { console.error(e); v.appendChild(UI.callout('bad', 'No se pudo abrir esta herramienta: ' + e.message)); }
    }
    const mod = TOOL_MOD()[tool];
    if (tool === 'simulador') QS.SimUI.activate(true);
    else if (mod && mod.activate) mod.activate();
    if (tool === 'formulas' && opts.model) { if (!inited.simulador) { inited.simulador = true; const sv = E.toolViews.simulador = h('section', { class: 'tool-view', hidden: true }); E.tools.appendChild(sv); QS.SimUI.init(sv); } QS.AnalyticUI.fromSpec(opts.model, opts.spec || QS.SimUI.getSpec()); }
    if (tool === 'metodologia' && opts.anchor) setTimeout(() => QS.GuideUI.scrollTo(opts.anchor), 60);
  }
  function renderTools() {
    E.toolHead = h('div', { class: 'tool-head', hidden: true }, UI.btn([UI.icon('chevL'), 'Herramientas'], () => App.go('herramientas', {}), 'btn-ghost btn-sm'), E.toolTitle = h('h1', null, ''));
    E.toolList = h('div', { class: 'stack' },
      h('div', { class: 'step-head' }, h('span', { class: 'step-k' }, 'Para especialistas'), h('h1', null, 'Herramientas'),
        h('p', { class: 'lead' }, 'Para casos que no cubre el recorrido de cinco pasos, o para revisar los métodos. Para planear tu personal no las necesitas.')),
      h('div', { class: 'tools-list' }, TOOLS.map(([id, name, desc, icon]) => h('div', { class: 'tool-row' }, UI.icon(icon, 'lg'), h('div', null, h('b', null, name), h('p', null, desc)), UI.btn('Abrir', () => App.go('herramientas', { tool: id }), 'btn-sm')))),
      h('div', null, UI.btn([UI.icon('chevL'), 'Volver al recorrido'], () => App.go('flujo', {}), 'btn-ghost')));
    E.toolViews = {};
    E.tools.appendChild(E.toolHead); E.tools.appendChild(E.toolList);
  }
  // Matriz de validación: qué tipo de cálculo es cada resultado, en qué se basa y cómo se comprobó
  function renderValidacion(v) {
    v.appendChild(h('p', { class: 'lead' }, 'Cada resultado es de uno de cuatro tipos: exacto (fórmula de la teoría de colas o solución numérica exacta), aproximado (fórmula de la literatura con su error medido), estimado (simulación, medición o estadística con su intervalo de confianza) o decisión de la empresa. Las pruebas se ejecutan con node tests/validacion.js, node tests/precision_aproximaciones.js y node tests/validar_medicion.js.'));
    const K = { exacto: ['Exacto', 'ok'], aprox: ['Aproximado', 'warn'], estimado: ['Estimado', 'info'], decision: ['Decisión', ''], descartado: ['Descartado', 'bad'] };
    const tag = (k) => UI.tag(K[k][0], K[k][1]);
    const c1 = UI.panel('Matriz de validación');
    c1.body.appendChild(UI.table(['Cálculo', 'Tipo', 'Fundamento', 'Cómo se comprobó', 'Resultado'], [
      ['M/M/1, M/M/c (Erlang C), Erlang B, M/M/c/K, M/M/∞', tag('exacto'), 'Erlang (1917); Shortle et al. (2018)', 'Valores de libro (Hillier y Lieberman), cadena de Markov resuelta por separado y simulación', 'Coincide a 9 decimales; simulación dentro del intervalo de confianza'],
      ['Fuente finita, Erlang A (abandono), rechazo con abandono y capacidad', tag('exacto'), 'Proceso de nacimiento y muerte; Garnett et al. (2002); Mandelbaum y Zeltyn (2007)', 'Cadena de Markov independiente y simulación', 'Coincide a 9 decimales; simulación dentro de 6 %'],
      ['Nivel de servicio y percentiles de la espera', tag('exacto'), 'Distribución de la espera por estado al llegar', 'Fórmula cerrada frente a la suma por estados; Erlang A con paciencia infinita = Erlang C; simulación', 'Coincide a 6 decimales; simulación dentro de 2 %'],
      ['M/G/1 y Mˣ/G/1', tag('exacto'), 'Pollaczek-Khinchine; Takács', 'Simulación con servicio constante, Erlang, lognormal e hiperexponencial', 'Dentro de 6 %'],
      ['Prioridades y redes de Jackson', tag('exacto'), 'Cobham (1954); Hillier y Lieberman; Burke (1956)', 'Simulación', 'Dentro de 6 %'],
      ['Ley de Little y dimensionamiento', tag('exacto'), 'Little (1961); búsqueda binaria sobre métricas monótonas', '12 modelos; búsqueda exhaustiva en 48 casos', 'Error de máquina; 0 diferencias'],
      ['M/G/c, G/G/1, G/G/c, redes no exponenciales, percentiles de M/G/1', tag('aprox'), 'Lee y Longton; Kingman y Krämer-Langenbach-Belz; Allen-Cunneen; QNA de Whitt (1983)', '101 casos contra simulación larga', 'Ver la tabla de precisión; cada resultado muestra su error medido'],
      ['Simulador de eventos discretos', tag('estimado'), 'Law (2015); réplicas independientes, IC 95 % con t de Student', '194 pruebas contra la teoría y validación cruzada con Ciw (Palmer et al., 2019)', 'Coincide con la teoría y con Ciw dentro del IC'],
      ['Medición con tus reportes: flujos, personal presente, atención calculada con el enlace entre documentos', tag('estimado'), 'Mínimos cuadrados no negativos; inferencia indirecta (Gouriéroux et al., 1993)', '7 escenarios con valores reales conocidos', 'Flujos casi exactos; atención calculada entre −1 % y +5 % con el traslado medido; modelo con error por hora de 5 a 8 %'],
      ['Enlace entre áreas (factura → recibo) y periodo común de las áreas', tag('exacto'), 'Coincidencia por número de documento, sin importar guiones, espacios, mayúsculas ni ceros a la izquierda; solo en el periodo en que todas las áreas tienen datos', 'Áreas con fechas distintas y sin fechas en común; 4 formatos de número; archivos que se superponen en fechas', 'El 100 % de los recibos que pagan una factura la encuentra; las mismas semanas en todas las áreas; filas repetidas contadas una vez; sin fechas en común se avisa y no se mide'],
      ['Quién atiende: usuario creador y usuarios que registran en bloque', tag('decision'), 'Se cuenta a cada usuario que registra (sesiones de trabajo); se marca al que registra 3 o más documentos en menos de 3 s, algo que una persona en mostrador no hace', 'Usuario de pagos en línea simulado (40 recibos seguidos por día)', 'Se marca solo ese usuario; tú decides si se cuenta. Sin contarlo, los clientes y el personal quedan iguales que sin sus registros'],
      ['Atención en la primera área (solo hay hora de emisión)', tag('estimado'), 'Estudio de tiempos con cronómetro (Kanawaty, 1992; Niebel y Freivalds, 2009)', 'Intervalo de confianza del 95 % de cada medición; mínimo 30 atenciones', 'Se muestra la precisión. Con un tipo medido, los demás se ajustan con error de −7 % a +2 %. Sin medir, el valor es una cota superior y el resultado se marca preliminar'],
      ['Atención en la primera área solo con los reportes (sin cronómetro)', tag('descartado'), 'Inferencia indirecta con los intervalos entre documentos (Heggland y Frigessi, 2004)', '6 escenarios con valores reales conocidos', 'Error de 20 a 60 % con carga media o alta: no se usa. Por eso se cronometra'],
      ['Personal por hora con simulación', tag('estimado'), 'Erlang C por hora (Green, Kolesar y Soares, 2001) ajustado con simulación (Feldman et al., 2008)', 'Confirmación final con 20 réplicas', 'Cada área cumple la meta en la simulación final'],
      ['Tipos de día y temporadas por mes', tag('estimado'), 'Razón al promedio del día de la semana (Whitt, 2006); descomposición clásica (Makridakis et al., 1998)', 'Se calculan con tu historia; los meses con menos de 8 días no se usan', 'Se muestran los factores medidos'],
      ['Meta de servicio, turnos, cambio de demanda; sin turnero, el modelo no tiene abandono', tag('decision'), 'Decisiones de tu empresa; sin abandono la espera calculada es igual o mayor que la real', 'Se indican en la ficha técnica del modelo', 'Tú los defines']
    ], { compact: true }));
    v.appendChild(c1.el);
    const c2 = UI.panel('Precisión medida de las aproximaciones', { sub: 'Error relativo frente a simulación larga en estado estable (unos 250 000 clientes por réplica, 6 réplicas). Los errores grandes aparecen cuando la espera es de pocos segundos.' });
    c2.body.appendChild(UI.table(['Fórmula', { t: 'Casos', num: true }, { t: 'Error mediano', num: true }, { t: 'Percentil 90', num: true }, { t: 'Máximo', num: true }], [
      ['G/G/1: Kingman con corrección de Krämer y Langenbach-Belz', '30', '3,1 %', '4,9 %', '5,8 %'],
      ['Red en serie con servicios no exponenciales (QNA)', '6', '2,2 %', '4,2 %', '5,7 %'],
      ['M/G/1: percentil 90 de la espera (gamma de dos momentos)', '8', '0,6 %', '4,6 %', '7,8 %'],
      ['M/G/c: dos momentos (Lee y Longton)', '36', '6,1 %', '24,8 %', '37,8 %'],
      ['G/G/c: Allen-Cunneen', '24', '6,3 %', '25,3 %', '48,7 %']], { compact: true }));
    c2.body.appendChild(UI.callout('info', 'El plan de personal no usa estas aproximaciones: se calcula con la simulación del proceso completo.'));
    v.appendChild(c2.el);
  }

  /* ---------------- tema ---------------- */
  function applyTheme(mode) {
    const r = document.documentElement;
    if (mode === 'light' || mode === 'dark') r.setAttribute('data-theme', mode); else r.removeAttribute('data-theme');
    const b = document.getElementById('theme-btn'); if (b) b.textContent = { system: 'Tema: sistema', light: 'Tema: claro', dark: 'Tema: oscuro' }[mode] || 'Tema: sistema';
    themeChanged();
  }
  const themeChanged = U.debounce(() => { if (QS.Charts) QS.Charts.rerenderAll(); if (QS.SimUI && QS.SimUI.theme && inited.simulador) QS.SimUI.theme(); if (QS.Flow && QS.Flow.theme) QS.Flow.theme(); }, 30);

  /* ---------------- arranque ---------------- */
  function start() {
    E.shell = document.getElementById('shell'); E.rail = document.getElementById('rail'); E.guide = document.getElementById('guide');
    E.flow = document.getElementById('view-flow'); E.tools = document.getElementById('view-tools'); E.ws = document.getElementById('ws-name');
    E.gbtn = document.getElementById('guide-btn');
    E.gbtn.addEventListener('click', () => { const vis = guideVisible(); guideManual = route !== 'flujo'; setGuide(!vis); });
    document.getElementById('brand').addEventListener('click', () => App.go('flujo', {}));
    const tb = document.getElementById('theme-btn');
    if (inViewer()) { tb.hidden = true; new MutationObserver(themeChanged).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] }); }
    else {
      let mode = U.store.get('theme', 'system'); applyTheme(mode);
      tb.addEventListener('click', () => { mode = mode === 'system' ? 'light' : mode === 'light' ? 'dark' : 'system'; U.store.set('theme', mode); applyTheme(mode); });
    }
    if (root.matchMedia) root.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', themeChanged);
    root.addEventListener('error', (e) => { if (e && e.message && !/ResizeObserver/.test(e.message)) U.toast('Ocurrió un error: ' + e.message, 'bad', 6000); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && guideVisible() && root.innerWidth <= 1240) setGuide(false); });
    renderTools();
    QS.Flow.init(E.flow);
    // La guía se abre sola solo en pantallas anchas (en pantallas chicas taparía el paso) y si no se cerró antes
    guideOpen = U.store.get('guide:open', null) !== false && root.innerWidth >= 1240;
    const hash = (location.hash || '').replace('#', '');
    if (hash === 'herramientas') App.go('herramientas', {});
    else if (ALIAS[hash]) App.go(hash, {});
    else App.go('flujo', {});
    App.refreshNav();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})(typeof window !== 'undefined' ? window : globalThis);
