/* Gráficas interactivas sobre Apache ECharts (github.com/apache/echarts).
   Todas las gráficas toman sus colores de los tokens CSS y se redibujan al cambiar el tema. */
(function (root) {
  'use strict';
  const QS = root.QS = root.QS || {};
  const U = QS.U;
  const C = QS.Charts = {};

  const PAL = {
    light: ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#4a3aa7', '#e34948'],
    dark: ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300', '#9085e9', '#e66767']
  };
  const SEQ = ['#cde2fb', '#b7d3f6', '#9ec5f4', '#86b6ef', '#6da7ec', '#5598e7', '#3987e5', '#2a78d6', '#256abf', '#1c5cab', '#184f95', '#104281', '#0d366b'];
  C.SEQ = SEQ;

  C.theme = function () {
    const dark = U.isDark();
    const v = (n) => U.cssVar(n);
    return {
      dark, pal: dark ? PAL.dark : PAL.light, seq: dark ? SEQ.slice().reverse() : SEQ,
      ink: v('--ink'), ink2: v('--ink-2'), muted: v('--muted'), line: v('--line'), line2: v('--line-2'), surface: v('--surface'),
      surface2: v('--surface-2'), accent: v('--accent'), good: v('--good'), warn: v('--warn'), bad: v('--bad'), amber: v('--amber'),
      font: v('--font-ui') || 'system-ui, sans-serif', mono: v('--font-mono') || 'monospace',
      season: { Alta: dark ? '#e66767' : '#d1453b', Normal: dark ? '#6f7c8f' : '#9aa6b6', Baja: dark ? '#3987e5' : '#2a78d6', Evento: dark ? '#9085e9' : '#4a3aa7' }
    };
  };

  const charts = new Set();
  C.ready = () => typeof root.echarts !== 'undefined';

  // Monta una gráfica: build(theme) debe devolver la opción de ECharts
  C.mount = function (el, build) {
    if (!C.ready()) {
      U.clear(el); el.appendChild(U.h('div', { class: 'chart-missing' }, 'No se pudo cargar la librería de gráficas (ECharts). Revisa la conexión o la carpeta vendor/.'));
      return { update() {}, dispose() {}, chart: null };
    }
    let chart = root.echarts.getInstanceByDom(el) || root.echarts.init(el, null, { renderer: 'canvas' });
    const handle = { el, chart, build };
    const render = () => { try { chart.setOption(build(C.theme()), true); } catch (e) { console.error(e); } };
    handle.update = (b) => { if (b) handle.build = build = b; render(); };
    handle.dispose = () => { charts.delete(handle); if (handle.ro) handle.ro.disconnect(); chart.dispose(); };
    handle.render = render;
    if (typeof ResizeObserver !== 'undefined') { handle.ro = new ResizeObserver(() => chart.resize()); handle.ro.observe(el); }
    charts.add(handle);
    render();
    return handle;
  };
  C.rerenderAll = () => { for (const h of charts) { if (!document.body.contains(h.el)) { h.dispose(); continue; } h.render(); } };
  C.prune = () => { for (const h of charts) if (!document.body.contains(h.el)) h.dispose(); };

  /* ---------- piezas comunes ---------- */
  C.base = function (t, o = {}) {
    return {
      backgroundColor: 'transparent', animationDuration: 250,
      textStyle: { fontFamily: t.font, color: t.ink2, fontSize: 12 },
      grid: Object.assign({ left: 8, right: 28, top: o.legend === false ? 36 : 66, bottom: o.zoom ? 56 : 10, containLabel: true }, o.grid || {}),
      legend: o.legend === false ? { show: false } : { top: 0, left: 0, type: 'scroll', textStyle: { color: t.ink2, fontSize: 12 }, itemWidth: 16, itemHeight: 8, pageTextStyle: { color: t.muted } },
      tooltip: {
        trigger: o.trigger || 'axis', confine: true, backgroundColor: t.surface, borderColor: t.line2, borderWidth: 1, padding: [8, 10],
        textStyle: { color: t.ink, fontSize: 12, fontFamily: t.font }, extraCssText: 'box-shadow: 0 6px 20px rgba(0,0,0,.12); border-radius: 8px;',
        axisPointer: { type: o.pointer || 'line', lineStyle: { color: t.muted, width: 1 }, shadowStyle: { color: t.dark ? 'rgba(255,255,255,0.05)' : 'rgba(15,26,42,0.05)' } },
        valueFormatter: o.vf || ((v) => (typeof v === 'number' ? U.fmtSmart(v) : v))
      },
      dataZoom: o.zoom ? [{ type: 'inside', xAxisIndex: 0 }, { type: 'slider', xAxisIndex: 0, height: 22, bottom: 8, borderColor: t.line, fillerColor: t.dark ? 'rgba(91,155,255,0.15)' : 'rgba(31,95,207,0.12)', handleStyle: { color: t.surface, borderColor: t.line2 }, textStyle: { color: t.muted }, dataBackground: { lineStyle: { color: t.line2 }, areaStyle: { color: t.surface2 } }, selectedDataBackground: { lineStyle: { color: t.accent }, areaStyle: { color: t.accent, opacity: 0.1 } } }] : undefined
    };
  };
  C.xCat = (t, data, o = {}) => ({ type: 'category', data, name: o.name, nameLocation: 'middle', nameGap: 28, nameTextStyle: { color: t.muted }, boundaryGap: o.gap !== false,
    axisLine: { lineStyle: { color: t.line2 } }, axisTick: { show: false }, axisLabel: Object.assign({ color: t.muted, hideOverlap: true }, o.label || {}), splitLine: { show: false } });
  C.xVal = (t, o = {}) => ({ type: 'value', name: o.name, nameLocation: 'middle', nameGap: 28, nameTextStyle: { color: t.muted }, min: o.min, max: o.max, scale: !!o.scale,
    axisLine: { lineStyle: { color: t.line2 } }, axisTick: { show: false }, axisLabel: { color: t.muted, formatter: o.fmt || ((v) => U.fmtSmart(v)), hideOverlap: true }, splitLine: { show: !!o.grid, lineStyle: { color: t.line } } });
  C.xTime = (t, o = {}) => ({ type: 'time', axisLine: { lineStyle: { color: t.line2 } }, axisTick: { show: false }, axisLabel: { color: t.muted, hideOverlap: true }, splitLine: { show: false }, min: o.min, max: o.max });
  C.yVal = (t, o = {}) => ({ type: 'value', name: o.name, nameGap: 14, nameTextStyle: { color: t.muted, align: 'left', fontSize: 11.5 }, min: o.min, max: o.max, scale: !!o.scale,
    axisLine: { show: false }, axisTick: { show: false }, axisLabel: { color: t.muted, formatter: o.fmt || ((v) => U.fmtSmart(v)) }, splitLine: { lineStyle: { color: t.line } } });
  C.line = (t, name, data, i = 0, o = {}) => ({
    type: 'line', name, data, showSymbol: !!o.symbols, symbol: 'circle', symbolSize: 8, smooth: false, step: o.step || false, connectNulls: !!o.connect,
    lineStyle: { width: o.width || 2, color: o.color || t.pal[i % 8], type: o.dashed ? 'dashed' : 'solid', cap: 'round', join: 'round', opacity: o.opacity || 1 },
    itemStyle: { color: o.color || t.pal[i % 8], borderColor: t.surface, borderWidth: 2 },
    areaStyle: o.area ? { color: o.color || t.pal[i % 8], opacity: 0.1 } : undefined, z: o.z || 2,
    emphasis: { focus: 'series', lineStyle: { width: (o.width || 2) + 0.5 } }, markLine: o.markLine, markArea: o.markArea, markPoint: o.markPoint, yAxisIndex: o.yAxisIndex || 0
  });
  C.bar = (t, name, data, i = 0, o = {}) => ({
    type: 'bar', name, data, stack: o.stack, barMaxWidth: 24, barGap: '12%', barCategoryGap: o.catGap || '28%',
    itemStyle: { color: o.color || t.pal[i % 8], borderRadius: o.stack ? 0 : [4, 4, 0, 0], borderColor: o.stack ? t.surface : undefined, borderWidth: o.stack ? 1 : 0 },
    emphasis: { focus: 'series', itemStyle: { opacity: 0.85 } }, markLine: o.markLine, markArea: o.markArea, label: o.label, z: 2
  });
  C.refLine = (t, value, label, color) => ({ silent: true, symbol: 'none', lineStyle: { color: color || t.ink2, width: 1, type: 'solid' },
    label: { formatter: label, color: t.ink2, position: 'insideEndTop', fontSize: 11 }, data: [{ yAxis: value }] });

  /* ---------- gráficas de uso frecuente ---------- */
  // Barras simples con categorías
  C.bars = (el, opts) => C.mount(el, (t) => {
    const o = C.base(t, { legend: opts.series.length > 1 ? undefined : false, pointer: 'shadow' });
    o.xAxis = C.xCat(t, opts.categories, { name: opts.xName, label: opts.xLabel });
    o.yAxis = C.yVal(t, { name: opts.yName, fmt: opts.yFmt, max: opts.yMax, min: opts.yMin });
    o.series = opts.series.map((s, i) => {
      const b = C.bar(t, s.name, s.data, s.color != null ? s.color : i, { stack: opts.stack ? 'a' : undefined, markLine: s.markLine && s.markLine(t) });
      if (typeof s.color === 'function') b.itemStyle.color = (p) => s.color(t, p.dataIndex, p.value);
      else if (typeof s.color === 'string') b.itemStyle.color = s.color;
      return b;
    });
    if (opts.tooltip) o.tooltip.formatter = opts.tooltip;
    if (opts.xName) o.grid.bottom += 22;
    if (opts.extra) opts.extra(o, t);
    return o;
  });
  // Líneas sobre eje de categorías o numérico
  C.lines = (el, opts) => C.mount(el, (t) => {
    const o = C.base(t, { legend: opts.series.length > 1 ? undefined : false, zoom: opts.zoom });
    o.xAxis = opts.xType === 'value' ? C.xVal(t, { name: opts.xName, fmt: opts.xFmt, min: opts.xMin, max: opts.xMax }) : opts.xType === 'time' ? C.xTime(t) : C.xCat(t, opts.categories, { name: opts.xName, gap: false });
    o.yAxis = C.yVal(t, { name: opts.yName, fmt: opts.yFmt, min: opts.yMin, max: opts.yMax, scale: opts.yScale });
    o.series = opts.series.map((s, i) => C.line(t, s.name, s.data, s.ci != null ? s.ci : i, { area: s.area, dashed: s.dashed, step: s.step, color: s.color && s.color(t), symbols: s.symbols, width: s.width, markLine: s.markLine && s.markLine(t), markArea: s.markArea && s.markArea(t), connect: s.connect }));
    if (opts.vf) o.tooltip.valueFormatter = opts.vf;
    if (opts.xName) o.grid.bottom += 22;
    if (opts.extra) opts.extra(o, t);
    return o;
  });
  // Mapa de calor (filas × columnas)
  C.heat = (el, opts) => C.mount(el, (t) => {
    const o = C.base(t, { legend: false, trigger: 'item' });
    o.grid = { left: 8, right: 16, top: 10, bottom: opts.xName ? 74 : 52, containLabel: true };
    o.xAxis = Object.assign(C.xCat(t, opts.cols, { name: opts.xName }), { splitArea: { show: false } });
    o.yAxis = { type: 'category', data: opts.rows, inverse: true, axisLine: { show: false }, axisTick: { show: false }, axisLabel: { color: t.muted } };
    const vals = opts.data.map((d) => d[2]).filter((v) => isFinite(v));
    o.visualMap = { min: opts.min != null ? opts.min : Math.min(...vals, 0), max: opts.max != null ? opts.max : Math.max(...vals, 1), calculable: true, orient: 'horizontal', left: 'center', bottom: 0, itemHeight: 140, itemWidth: 10,
      inRange: { color: typeof opts.colors === 'function' ? opts.colors(t) : (opts.colors || t.seq) }, textStyle: { color: t.muted, fontSize: 11 }, formatter: (v) => U.fmtSmart(v) };
    o.tooltip.formatter = (p) => {
      const v = p.value; return `<b>${U.fmtSmart(v[2])}</b> ${opts.unit || ''}<br><span style="color:${t.muted}">${opts.rows[v[1]]} · ${opts.cols[v[0]]}</span>`;
    };
    o.series = [{ type: 'heatmap', data: opts.data, itemStyle: { borderColor: t.surface, borderWidth: 2, borderRadius: 3 },
      label: { show: !!opts.labels, color: t.ink, fontSize: 10, textBorderColor: t.surface, textBorderWidth: 2.5, formatter: (p) => (isFinite(p.value[2]) && p.value[2] ? U.fmt(p.value[2], opts.labelDigits || 0) : '') },
      emphasis: { itemStyle: { borderColor: t.ink, borderWidth: 1 } } }];
    return o;
  });
  // Histograma con densidades ajustadas superpuestas
  C.hist = (el, opts) => C.mount(el, (t) => {
    const o = C.base(t, { legend: opts.overlays && opts.overlays.length ? undefined : false });
    o.xAxis = C.xVal(t, { name: opts.xName, min: opts.edges[0], max: opts.edges[opts.edges.length - 1], fmt: opts.xFmt });
    o.yAxis = C.yVal(t, { name: opts.yName || 'Densidad' });
    if (opts.xName) o.grid.bottom += 22;
    const bw = opts.edges[1] - opts.edges[0];
    o.series = [{
      type: 'bar', name: opts.name || 'Observado', barWidth: '96%', z: 1,
      data: opts.dens.map((d, i) => [opts.edges[i] + bw / 2, d]), itemStyle: { color: t.pal[0], opacity: 0.55, borderRadius: [3, 3, 0, 0] }
    }];
    (opts.overlays || []).forEach((ov, i) => o.series.push(C.line(t, ov.name, ov.data, i + 1, { width: 2 })));
    o.tooltip.formatter = (ps) => {
      const x = ps[0].value[0];
      return `<span style="color:${t.muted}">${opts.xLabel ? opts.xLabel(x) : U.fmtSmart(x)}</span><br>` + ps.map((p) => `${p.marker}${p.seriesName}: <b>${U.fmt(p.value[1], 4)}</b>`).join('<br>');
    };
    return o;
  });

  // Genera bins de histograma
  C.histogram = (values, nb, maxQ = 0.995) => {
    const s = U.sortedCopy(values); if (!s.length) return { edges: [0, 1], dens: [0], counts: [0] };
    const lo = Math.max(0, s[0]); let hi = U.quantileSorted(s, maxQ); if (!(hi > lo)) hi = lo + 1;
    nb = nb || Math.max(8, Math.min(60, Math.round(Math.sqrt(s.length))));
    const w = (hi - lo) / nb; const counts = new Array(nb).fill(0);
    for (const v of s) { if (v > hi) continue; let b = Math.floor((v - lo) / w); if (b >= nb) b = nb - 1; if (b < 0) b = 0; counts[b]++; }
    const edges = U.range(nb + 1, (i) => lo + i * w);
    const dens = counts.map((c) => c / (s.length * w));
    return { edges, dens, counts, w, n: s.length };
  };
})(typeof window !== 'undefined' ? window : globalThis);
