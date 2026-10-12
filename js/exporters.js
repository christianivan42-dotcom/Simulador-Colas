/* Exportadores a herramientas abiertas de Python:
   - Ciw (github.com/CiwPython/Ciw): segunda opinión independiente de la simulación.
   - Prophet (github.com/facebook/prophet): pronóstico de demanda diaria con estacionalidades y feriados.
   - pyworkforce (github.com/rodrigo-arenas/pyworkforce): programación óptima de turnos con OR-Tools. */
(function (root) {
  'use strict';
  const QS = root.QS = root.QS || {};
  const U = QS.U, Dist = QS.Dist;
  const X = QS.Export = {};

  const num = (x, d = 6) => String(+(+x).toFixed(d));
  const pyStr = (s) => JSON.stringify(String(s));

  function scaleSpec(spec, f) {
    if (!f || f === 1) return spec;
    const s = Object.assign({}, spec);
    for (const k of ['mean', 'sd', 'a', 'b', 'mode']) if (s[k] != null) s[k] = s[k] * f;
    if (s.data) s.data = s.data.map((x) => x * f);
    return s;
  }
  // Distribución del simulador (minutos) -> expresión de Ciw
  function ciwDist(spec) {
    const s = Object.assign({}, spec); const d = Dist.make(s);
    switch (s.type) {
      case 'exp': return `ciw.dists.Exponential(rate=${num(1 / s.mean)})`;
      case 'det': return `ciw.dists.Deterministic(value=${num(s.mean)})`;
      case 'erlang': { const k = Math.max(1, Math.round(s.k || 1)); return `ciw.dists.Erlang(rate=${num(k / s.mean)}, num_phases=${k})`; }
      case 'gamma': return `ciw.dists.Gamma(shape=${num((s.mean / s.sd) ** 2)}, scale=${num(s.sd * s.sd / s.mean)})`;
      case 'lnorm': { const s2 = Math.log(1 + (s.sd * s.sd) / (s.mean * s.mean)); return `ciw.dists.Lognormal(mean=${num(Math.log(s.mean) - s2 / 2)}, sd=${num(Math.sqrt(s2))})`; }
      case 'weibull': return `ciw.dists.Weibull(scale=${num(s._scale)}, shape=${num(s._shape)})`;
      case 'norm': return `ciw.dists.Normal(mean=${num(s.mean)}, sd=${num(s.sd)})`;
      case 'unif': return `ciw.dists.Uniform(lower=${num(s.a)}, upper=${num(s.b)})`;
      case 'tri': return `ciw.dists.Triangular(lower=${num(s.a)}, mode=${num(s.mode)}, upper=${num(s.b)})`;
      case 'hyper': {
        const c2 = s.cv * s.cv, p1 = 0.5 * (1 + Math.sqrt((c2 - 1) / (c2 + 1))), p2 = 1 - p1;
        return `ciw.dists.HyperExponential(rates=[${num(2 * p1 / s.mean)}, ${num(2 * p2 / s.mean)}], probs=[${num(p1)}, ${num(p2)}])`;
      }
      case 'emp': return `ciw.dists.Empirical(observations=[${(s.data || []).slice(0, 3000).map((x) => num(x, 4)).join(', ')}])`;
      default: return `ciw.dists.Exponential(rate=${num(1 / (d.mean || 1))})`;
    }
  }

  X.ciw = function (specIn) {
    const sp = QS.Sim.normalize(specIn); const a = sp.arrivals, st = sp.stages, n = st.length;
    const notes = []; const L = [];
    const tot = sp.classes.reduce((s, c) => s + (+c.share || 0), 0) || 1;
    const cname = (c, i) => `Clase ${i}: ${c.name}`.replace(/"/g, "'");
    L.push('"""');
    L.push(`Escenario: ${sp.name}`);
    L.push(`Notación de Kendall: ${QS.Sim.kendall(sp)}`);
    L.push('Generado por el Simulador Experto de Colas para validar con Ciw (https://github.com/CiwPython/Ciw).');
    L.push('Requisitos:  pip install ciw     Unidad de tiempo: minutos.');
    L.push('"""');
    L.push('import math');
    L.push('import statistics');
    L.push('import sys');
    L.push('import ciw', '');
    L.push('try:', '    sys.stdout.reconfigure(encoding="utf-8")', 'except Exception:', '    pass', '');
    L.push(`HORAS = ${num(sp.run.hours)}`);
    L.push(`CALENTAMIENTO = ${num(sp.run.warmupH * 60)}  # minutos descartados al inicio`);
    L.push(`META_T = ${num(sp.run.slT)}  # minutos para el nivel de servicio`);
    L.push(`REPLICAS = ${Math.max(2, sp.run.reps)}`);
    const drain = sp.run.drain !== false;
    if (drain) {
      L.push('CIERRE = HORAS * 60  # no llegan clientes después del cierre; se atiende a quienes quedan dentro', '');
      L.push('class HastaCierre(ciw.dists.Distribution):', '    """Evita llegadas después del cierre."""',
        '    def __init__(self, base, cierre):', '        self.base, self.cierre = base, cierre',
        '    def sample(self, t=None, ind=None):', '        x = self.base._sample(t=t, ind=ind)', '        return x if (t or 0) + x <= self.cierre else float("inf")');
    }
    L.push('');
    // Llegadas por clase
    const arrFor = (c) => {
      const p = (+c.share || 0) / tot;
      switch (a.mode) {
        case 'poisson': return `ciw.dists.Exponential(rate=${num((+a.rate * p) / 60)})`;
        case 'renewal': { if (sp.classes.length > 1) notes.push('Con varias clases y llegadas no Poisson, cada clase usa el mismo tipo de distribución con media escalada por su participación (aproximación).'); return ciwDist(Dist.withMean(a.ia, Dist.make(a.ia).mean / Math.max(p, 1e-9))); }
        case 'profile': {
          const H = Math.ceil(sp.run.hours); const ki = sp.classes.indexOf(c);
          const byK = Array.isArray(a.byClass) && a.byClass.length === sp.classes.length ? a.byClass[ki] : null;
          const rates = U.range(H, (i) => num((byK ? (+byK[i] || 0) : (+a.profile[i] || 0) * p) / 60));
          return `ciw.dists.PoissonIntervals(rates=[${rates.join(', ')}], endpoints=[${U.range(H, (i) => (i + 1) * 60).join(', ')}], max_sample_date=${num(H * 60)})`;
        }
        case 'appointments': {
          notes.push('Citas: se exporta una realización fija de la agenda (con inasistencias e impuntualidad) como secuencia de tiempos entre llegadas; no incluye a los clientes sin cita.');
          const rng = new QS.RNG(sp.run.seed + ':ciw'); const ap = a.appt; const ts = [];
          for (let t = 0; t < sp.run.hours * 60; t += +ap.interval) { if (rng.random() < +ap.noShow) continue; ts.push(Math.max(0, t + (+ap.meanLate || 0) + (+ap.sdLate || 0) * rng.normal())); }
          ts.sort((x, y) => x - y); const ia = ts.map((t, i) => Math.max(0.0001, t - (i ? ts[i - 1] : 0)));
          ia.push(1e9);
          return `ciw.dists.Sequential([${ia.map((x) => num(x, 3)).join(', ')}])`;
        }
        case 'finite': notes.push('Ciw modela redes abiertas: la población finita se aproxima con llegadas Poisson a la tasa máxima N/tiempo fuera (cota superior de la demanda).');
          return `ciw.dists.Exponential(rate=${num((a.finite.N * p) / Dist.make(a.finite.think).mean)})`;
        default: return 'None';
      }
    };
    // Ruta propia de cada clase: etapas que visita (entra por la primera) y factor de atención por etapa
    const visOf = (c) => (Array.isArray(c.visits) && c.visits.slice(0, n).some(Boolean) ? U.range(n, (i) => !!c.visits[i]) : new Array(n).fill(true));
    const firstOf = (c) => Math.max(0, visOf(c).indexOf(true));
    const facOf = (c, i) => (Array.isArray(c.svcMults) && +c.svcMults[i] > 0 ? +c.svcMults[i] : (+c.svcMult || 1));
    const routed = sp.classes.some((c) => !visOf(c).every(Boolean));
    if (routed) notes.push('Cada tipo de cliente sigue su propia ruta: entra por la primera etapa que visita y salta las que no visita (matriz de transición por clase).');
    const netStart = L.length;
    L.push('arrival_distributions = {');
    sp.classes.forEach((c, i) => { const f0 = firstOf(c); L.push(`    ${pyStr(cname(c, i))}: [${U.range(n, (j) => (j === f0 ? (drain ? `HastaCierre(${arrFor(c)}, CIERRE)` : arrFor(c)) : 'None')).join(', ')}],`); });
    L.push('}');
    L.push('service_distributions = {');
    sp.classes.forEach((c, i) => L.push(`    ${pyStr(cname(c, i))}: [${st.map((s, j) => ciwDist(scaleSpec(s.svc, facOf(c, j)))).join(', ')}],`));
    L.push('}');
    // Servidores (con horario si aplica)
    const servers = st.map((s) => {
      if (!s.useSchedule || !s.schedule.length) return String(s.servers);
      const H = Math.min(s.schedule.length, Math.ceil(sp.run.hours)); const raw = s.schedule.slice(0, H).map((x) => Math.max(0, Math.round(x)));
      // Ciw reemplaza a todos los servidores en cada cambio de turno (los que atienden terminan mientras los nuevos ya atienden):
      // se juntan las horas consecutivas con el mismo personal para no crear cambios de turno innecesarios.
      const nums = [], ends = [];
      raw.forEach((x, i) => { if (nums.length && nums[nums.length - 1] === x) ends[ends.length - 1] = (i + 1) * 60; else { nums.push(x); ends.push((i + 1) * 60); } });
      if (nums[nums.length - 1] > 0) ends[ends.length - 1] = H * 60 + 100000; else { nums.push(1); ends.push(H * 60 + 100000); }
      notes.push('Horario de personal: en cada cambio de turno Ciw reemplaza a todos los servidores (quien atiende termina mientras los nuevos ya atienden). Con horarios que cambian cada hora, Ciw puede dar esperas algo menores que el simulador, donde la misma persona sigue en su puesto.');
      return `ciw.Schedule(numbers_of_servers=[${nums.join(', ')}], shift_end_dates=[${ends.join(', ')}])`;
    });
    L.push(`number_of_servers = [${servers.join(', ')}]`);
    const extra = [];
    if (n > 1) {
      const matrix = (c) => { const v = visOf(c); const pv = U.range(n, (l) => (v[l] ? st[l].prob : 0)); return U.range(n, (i) => U.range(n, (j) => {
        if (j <= i) return 0; let pr = 1; for (let l = i + 1; l < j; l++) pr *= 1 - pv[l]; return pr * pv[j];
      })); };
      const fmtM = (P) => '[' + P.map((r) => '[' + r.map((x) => (+x).toFixed(6)).join(', ') + ']').join(', ') + ']';
      if (!routed) {
        L.push(`matriz = ${fmtM(matrix(sp.classes[0]))}  # matriz de transición entre etapas`);
        L.push(`routing = {${sp.classes.map((c, i) => `${pyStr(cname(c, i))}: matriz`).join(', ')}}`);
      } else {
        L.push('routing = {  # matriz de transición de cada clase');
        sp.classes.forEach((c, i) => L.push(`    ${pyStr(cname(c, i))}: ${fmtM(matrix(c))},`));
        L.push('}');
      }
      extra.push('routing=routing');
    }
    const disc = st.map((s) => ({ FIFO: 'ciw.disciplines.FIFO', LIFO: 'ciw.disciplines.LIFO', SIRO: 'ciw.disciplines.SIRO' }[s.disc] || 'ciw.disciplines.FIFO'));
    if (disc.some((d) => d !== 'ciw.disciplines.FIFO')) { L.push(`service_disciplines = [${disc.join(', ')}]`); extra.push('service_disciplines=service_disciplines'); }
    if (st.some((s) => s.disc === 'SPT')) notes.push('Ciw no trae la disciplina SPT; se usó FIFO.');
    const prioUsed = st[0].disc === 'PRIO' || st[0].disc === 'PRIOP';
    if (prioUsed) {
      const pr = '{' + sp.classes.map((c, i) => `${pyStr(cname(c, i))}: ${Math.max(0, c.prio - 1)}`).join(', ') + '}';
      if (st[0].disc === 'PRIOP') {
        L.push(`priority_classes = (${pr}, [${st.map((s, i) => (i === 0 ? '"resume"' : 'False')).join(', ')}])  # expropiativa con reanudación`);
        notes.push('Con prioridad expropiativa, el waiting_time de Ciw incluye la parte del servicio previa a la interrupción: compara el tiempo en el sistema W.');
      }
      else L.push(`priority_classes = ${pr}`);
      extra.push('priority_classes=priority_classes');
    }
    if (+sp.capacity > 0) { L.push(`system_capacity = ${Math.round(sp.capacity)}`); extra.push('system_capacity=system_capacity'); }
    if (sp.balk && sp.balk.type !== 'none') {
      const c0 = st[0].servers, Lb = +sp.balk.L;
      L.push('', `def desiste(n, **kwargs):`, `    """Probabilidad de no entrar dado n clientes en la etapa 1 (incluye a los que están en servicio)."""`, `    q = max(n - ${c0}, 0)`, `    if n < ${c0}:`, '        return 0.0');
      if (sp.balk.type === 'threshold') L.push(`    return 1.0 if q >= ${num(Lb)} else 0.0`);
      else if (sp.balk.type === 'linear') L.push(`    return min(1.0, q / ${num(Lb)})`);
      else L.push(`    return 1.0 - math.exp(-q / ${num(Lb)})`);
      L.push('', 'baulking_functions = {' + sp.classes.map((c, i) => `${pyStr(cname(c, i))}: [desiste${', None'.repeat(n - 1)}]`).join(', ') + '}');
      extra.push('baulking_functions=baulking_functions');
    }
    if (sp.renege && sp.renege.on) {
      L.push('reneging_time_distributions = {' + sp.classes.map((c, i) => `${pyStr(cname(c, i))}: [${ciwDist(scaleSpec(sp.renege.dist, +c.patMult || 1))}${', None'.repeat(n - 1)}]`).join(', ') + '}');
      extra.push('reneging_time_distributions=reneging_time_distributions');
    }
    if (a.batch && a.batch.type !== 'none') {
      const B = a.batch; let bd;
      if (B.type === 'fixed') bd = `ciw.dists.Deterministic(value=${Math.max(1, Math.round(B.mean))})`;
      else if (B.type === 'geom') bd = `ciw.dists.Geometric(prob=${num(1 / Math.max(1, B.mean))})`;
      else if (B.type === 'unif') { const lo = Math.max(1, Math.round(B.min)), hi = Math.max(lo, Math.round(B.max)); bd = `ciw.dists.Pmf(values=[${U.range(hi - lo + 1, (i) => lo + i).join(', ')}], probs=[${U.range(hi - lo + 1, () => num(1 / (hi - lo + 1), 8)).join(', ')}])`; }
      else { const lam = Math.max(0, B.mean - 1); const vals = U.range(40, (i) => i + 1); let pr = vals.map((v) => U.poissonPmf(v - 1, lam)); const s = U.sum(pr); pr = pr.map((x) => x / s); bd = `ciw.dists.Pmf(values=[${vals.join(', ')}], probs=[${pr.map((x) => num(x, 10)).join(', ')}])`; }
      L.push('batching_distributions = {' + sp.classes.map((c, i) => `${pyStr(cname(c, i))}: [${bd}${', None'.repeat(n - 1)}]`).join(', ') + '}');
      extra.push('batching_distributions=batching_distributions');
    }
    if (st.some((s) => s.queue === 'multi')) notes.push('Ciw usa una fila por nodo: las filas por servidor (y el cambio de fila) se exportan como fila única.');
    if (sp.fail && sp.fail.on) notes.push('Las fallas de servidores no se exportan (Ciw no las modela directamente).');
    if (sp.retry && sp.retry.p > 0) notes.push('Los reintentos no se exportan.');
    if (st.some((s) => (s.speeds || '').trim())) notes.push('Las velocidades distintas por servidor no se exportan.');
    if (+a.initialQueue > 0) notes.push('La fila inicial al abrir no se exporta.');
    L.push('', 'red = ciw.create_network(', '    arrival_distributions=arrival_distributions,', '    service_distributions=service_distributions,', '    number_of_servers=number_of_servers,');
    extra.forEach((e) => L.push(`    ${e},`));
    L.push(')');
    // La red se crea en cada réplica después de fijar la semilla: Ciw genera las llegadas por intervalos (PoissonIntervals) al crearla
    const block = L.splice(netStart);
    L.push('def crear_red():', '    # Se crea en cada réplica, después de fijar la semilla: Ciw genera algunas llegadas al crear la red.');
    block.forEach((ln) => L.push(ln ? '    ' + ln : ''));
    L.push('    return red', '');
    L.push('def replica(semilla):');
    L.push('    ciw.seed(semilla)');
    L.push('    sim = ciw.Simulation(crear_red())');
    L.push(drain ? '    sim.simulate_until_max_time(CIERRE + max(24 * 60, CIERRE))' : '    sim.simulate_until_max_time(HORAS * 60)');
    L.push('    recs = [r for r in sim.get_all_records() if r.arrival_date >= CALENTAMIENTO]');
    L.push('    servicio = [r for r in recs if r.record_type == "service"]');
    L.push('    espera, entrada, salida = {}, {}, {}');
    L.push('    for r in servicio:');
    L.push('        espera[r.id_number] = espera.get(r.id_number, 0.0) + r.waiting_time');
    L.push('        entrada[r.id_number] = min(entrada.get(r.id_number, r.arrival_date), r.arrival_date)');
    L.push('        salida[r.id_number] = max(salida.get(r.id_number, r.exit_date), r.exit_date)');
    L.push('    w_sis = [salida[i] - entrada[i] for i in salida]');
    L.push('    terminados = [r for r in servicio if r.destination == -1]');
    L.push('    abandonos = [r for r in recs if r.record_type == "renege"]');
    L.push('    desisten = [r for r in recs if r.record_type in ("baulk", "rejection")]');
    L.push('    primera = {}  # primera etapa de cada cliente (con rutas por clase no siempre es la 1)');
    L.push('    for r in servicio:');
    L.push('        if r.id_number not in primera or r.arrival_date < primera[r.id_number].arrival_date:');
    L.push('            primera[r.id_number] = r');
    L.push('    w1 = [r.waiting_time for r in primera.values()]');
    L.push('    wq = statistics.mean(espera.values()) if espera else float("nan")');
    L.push('    ns = (sum(1 for w in w1 if w <= META_T + 1e-9)) / max(1, len(w1) + len(abandonos))');
    L.push('    llegadas = len(w1) + len(abandonos) + len(desisten)');
    L.push('    try:');
    L.push('        util = statistics.mean(nd.server_utilisation for nd in sim.transitive_nodes)');
    L.push('    except Exception:');
    L.push('        util = float("nan")');
    if (n > 1) {
      L.push('    etapas = {}');
      L.push('    for k in range(1, len(sim.transitive_nodes) + 1):');
      L.push('        w = [r.waiting_time for r in servicio if r.node == k]');
      L.push('        etapas[f"Wq etapa {k} (min)"] = statistics.mean(w) if w else float("nan")');
    }
    L.push('    return {"Wq (min)": wq, "W en sistema (min)": statistics.mean(w_sis) if w_sis else float("nan"), "Nivel de servicio": ns, "P(abandono)": len(abandonos) / max(1, llegadas - len(desisten)),');
    L.push(`            "P(desistir/bloqueo)": len(desisten) / max(1, llegadas), "Atendidos": len(terminados), "Utilización": util${n > 1 ? ', **etapas' : ''}}`);
    L.push('');
    L.push('if __name__ == "__main__":');
    L.push(`    res = [replica(${Math.round(+sp.run.seed || 0)} + i) for i in range(REPLICAS)]`);
    L.push('    print(f"Ciw {ciw.__version__} — {REPLICAS} réplicas")');
    L.push('    for k in res[0]:');
    L.push('        v = [r[k] for r in res if r[k] == r[k]]');
    L.push('        if len(v) < 2:');
    L.push('            continue');
    L.push('        m, s = statistics.mean(v), statistics.stdev(v)');
    L.push('        print(f"{k:<22} {m:12.4f}  ± {1.96 * s / len(v) ** 0.5:.4f}")');
    if (notes.length) { L.splice(5, 0, 'Notas de la exportación:', ...[...new Set(notes)].map((x) => ' - ' + x)); }
    return L.join('\n') + '\n';
  };

  // Script de Prophet para el archivo de demanda diaria exportado
  X.prophet = function (o) {
    const ev = (o.events || []).map((e) => `    {"holiday": ${pyStr(e.name)}, "ds": ${pyStr(e.ds)}, "lower_window": ${e.lw || 0}, "upper_window": ${e.uw || 0}},`);
    const sep = o.sep || ',', dec = o.dec || '.';
    return [
      '"""',
      'Pronóstico de demanda diaria con Prophet (https://github.com/facebook/prophet).',
      'Requisitos:  pip install prophet pandas',
      `Entrada: ${o.file || 'demanda_diaria.csv'} (columnas ds = fecha, y = clientes por día), exportado desde el Simulador Experto de Colas.`,
      'Salida: pronostico_prophet.csv con ds, yhat, yhat_lower, yhat_upper, que puedes importar de vuelta en Herramientas → "Análisis de series".',
      '"""',
      'import pandas as pd',
      'from prophet import Prophet',
      '',
      `df = pd.read_csv(${pyStr(o.file || 'demanda_diaria.csv')}, sep=${pyStr(sep)}, decimal=${pyStr(dec)})`,
      'df["ds"] = pd.to_datetime(df["ds"])',
      'df = df[df["y"] > 0]  # los días cerrados se excluyen del ajuste',
      '',
      'eventos = pd.DataFrame([',
      ...ev,
      '])',
      '',
      'modelo = Prophet(',
      '    seasonality_mode="multiplicative",',
      '    yearly_seasonality=True,',
      '    weekly_seasonality=True,',
      '    daily_seasonality=False,',
      '    holidays=eventos if len(eventos) else None,',
      '    interval_width=0.90,',
      ')',
      `modelo.add_country_holidays(country_name=${pyStr(o.country || 'MX')})  # cambia el país: CO, PE, CL, AR, ES, US, ...`,
      'modelo.add_seasonality(name="quincena", period=30.4375, fourier_order=6)  # efecto día de pago',
      'modelo.fit(df)',
      '',
      `futuro = modelo.make_future_dataframe(periods=${o.horizon || 365})`,
      'pron = modelo.predict(futuro)',
      'pron[["ds", "yhat", "yhat_lower", "yhat_upper"]].to_csv("pronostico_prophet.csv", index=False)',
      'modelo.plot_components(pron).savefig("componentes_prophet.png", dpi=120)',
      'print("Listo: pronostico_prophet.csv y componentes_prophet.png")',
      ''
    ].join('\n');
  };

  // Script de pyworkforce para programar turnos a partir de los requerimientos por hora
  X.pyworkforce = function (o) {
    const req = o.required.map((r) => '    [' + r.map((x) => Math.max(0, Math.round(x))).join(', ') + '],');
    const shifts = Object.entries(o.shifts).map(([k, v]) => `    ${pyStr(k)}: [${v.join(', ')}],`);
    const costs = Object.entries(o.shifts).map(([k]) => `${pyStr(k)}: ${num(o.costs[k] || 1)}`).join(', ');
    return [
      '"""',
      'Programación de turnos con pyworkforce (https://github.com/rodrigo-arenas/pyworkforce) y OR-Tools.',
      'Requisitos:  pip install pyworkforce pandas',
      `Origen: ${o.title || 'requerimientos calculados con Erlang en el Simulador Experto de Colas'}.`,
      'Cada fila de required_resources es un día y cada columna una hora (personas necesarias en piso, ya con merma).',
      '"""',
      'import pandas as pd',
      'from pyworkforce.scheduling import MinRequiredResources',
      '',
      'required_resources = [',
      ...req,
      ']',
      'shifts_coverage = {',
      ...shifts,
      '}',
      `cost_dict = {${costs}}`,
      '',
      'planificador = MinRequiredResources(',
      `    num_days=${o.required.length},`,
      `    periods=${o.required[0].length},`,
      '    shifts_coverage=shifts_coverage,',
      '    required_resources=required_resources,',
      '    cost_dict=cost_dict,',
      `    max_period_concurrency=${Math.max(1, Math.ceil(Math.max(...o.required.flat()) * 2))},`,
      `    max_shift_concurrency=${Math.max(1, Math.ceil(Math.max(...o.required.flat()) * 2))},`,
      ')',
      'solucion = planificador.solve()',
      'print("Estado:", solucion["status"], "| Costo:", solucion["cost"])',
      'pd.DataFrame(solucion["resources_shifts"]).to_csv("turnos_pyworkforce.csv", index=False)',
      'print("Turnos guardados en turnos_pyworkforce.csv")',
      ''
    ].join('\n');
  };
})(typeof window !== 'undefined' ? window : globalThis);
