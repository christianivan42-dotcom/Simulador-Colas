/* Generador aleatorio reproducible (sfc32) y distribuciones de probabilidad.
   Todas las duraciones se expresan en MINUTOS. */
(function (root) {
  'use strict';
  const QS = root.QS = root.QS || {};
  const U = QS.U;

  // Hash cyrb128 para sembrar sfc32 a partir de cualquier texto
  function cyrb128(str) {
    let h1 = 1779033703, h2 = 3144134277, h3 = 1013904242, h4 = 2773480762;
    for (let i = 0, k; i < str.length; i++) {
      k = str.charCodeAt(i);
      h1 = h2 ^ Math.imul(h1 ^ k, 597399067); h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
      h3 = h4 ^ Math.imul(h3 ^ k, 951274213); h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
    }
    h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067); h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
    h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213); h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
    return [(h1 ^ h2 ^ h3 ^ h4) >>> 0, (h2 ^ h1) >>> 0, (h3 ^ h1) >>> 0, (h4 ^ h1) >>> 0];
  }

  class RNG {
    constructor(seed) {
      const s = cyrb128(String(seed));
      this.a = s[0]; this.b = s[1]; this.c = s[2]; this.d = s[3];
      this._g = null;
      for (let i = 0; i < 20; i++) this.u32();
    }
    u32() {
      this.a >>>= 0; this.b >>>= 0; this.c >>>= 0; this.d >>>= 0;
      let t = (this.a + this.b) | 0;
      this.a = this.b ^ (this.b >>> 9);
      this.b = (this.c + (this.c << 3)) | 0;
      this.c = (this.c << 21) | (this.c >>> 11);
      this.d = (this.d + 1) | 0;
      t = (t + this.d) | 0;
      this.c = (this.c + t) | 0;
      return t >>> 0;
    }
    // Uniforme en (0,1), nunca 0 ni 1
    random() { return (this.u32() + 0.5) / 4294967296; }
    int(n) { return Math.floor(this.random() * n); }
    exp(mean) { return -mean * Math.log(this.random()); }
    normal() {
      if (this._g !== null) { const g = this._g; this._g = null; return g; }
      let u, v, s;
      do { u = 2 * this.random() - 1; v = 2 * this.random() - 1; s = u * u + v * v; } while (s >= 1 || s === 0);
      const f = Math.sqrt(-2 * Math.log(s) / s);
      this._g = v * f; return u * f;
    }
    // Gamma(forma k, escala 1) — Marsaglia y Tsang
    gamma(k) {
      if (k < 1) { const u = this.random(); return this.gamma(1 + k) * Math.pow(u, 1 / k); }
      const d = k - 1 / 3, c = 1 / Math.sqrt(9 * d);
      for (;;) {
        let x, v;
        do { x = this.normal(); v = 1 + c * x; } while (v <= 0);
        v = v * v * v; const u = this.random();
        if (u < 1 - 0.0331 * x * x * x * x) return d * v;
        if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
      }
    }
    // Poisson exacto: método de Knuth para medias < 30; para medias mayores, suma de Poisson independientes con media < 30
    // (la suma de Poisson independientes es Poisson), sin aproximación normal.
    poisson(m) {
      if (!(m > 0)) return 0;
      const knuth = (x) => { const L = Math.exp(-x); let k = 0, p = 1; do { k++; p *= this.random(); } while (p > L); return k - 1; };
      if (m < 30) return knuth(m);
      const parts = Math.ceil(m / 25), x = m / parts; let s = 0;
      for (let i = 0; i < parts; i++) s += knuth(x);
      return s;
    }
  }
  QS.RNG = RNG;

  /* ------------------------------------------------------------------ */
  /* Distribuciones: cada una sabe muestrearse y conoce sus momentos      */
  /* ------------------------------------------------------------------ */
  const Dist = QS.Dist = {};

  Dist.TYPES = [
    { id: 'exp', name: 'Exponencial', kendall: 'M', params: ['mean'], help: 'Sin memoria. Modelo clásico de llegadas de Poisson y de servicios muy variables (CV = 1).' },
    { id: 'det', name: 'Constante (determinística)', kendall: 'D', params: ['mean'], help: 'Siempre dura lo mismo (CV = 0). Procesos automatizados o citas exactas.' },
    { id: 'erlang', name: 'Erlang-k', kendall: 'E', params: ['mean', 'k'], help: 'Suma de k fases exponenciales. CV = 1/√k. Servicios con varias etapas internas.' },
    { id: 'gamma', name: 'Gamma', kendall: 'G', params: ['mean', 'sd'], help: 'Flexible y asimétrica a la derecha; muy usada para tiempos de atención.' },
    { id: 'lnorm', name: 'Lognormal', kendall: 'G', params: ['mean', 'sd'], help: 'Cola larga a la derecha; suele ajustar muy bien tiempos de servicio humanos.' },
    { id: 'weibull', name: 'Weibull', kendall: 'G', params: ['mean', 'sd'], help: 'Flexible; también se usa para tiempos entre fallas.' },
    { id: 'norm', name: 'Normal truncada en 0', kendall: 'G', params: ['mean', 'sd'], help: 'Simétrica; solo valores positivos. Útil con poca variabilidad.' },
    { id: 'unif', name: 'Uniforme', kendall: 'G', params: ['a', 'b'], help: 'Cualquier valor entre un mínimo y un máximo con igual probabilidad.' },
    { id: 'tri', name: 'Triangular', kendall: 'G', params: ['a', 'mode', 'b'], help: 'Mínimo, más probable y máximo. Útil cuando solo hay estimaciones de expertos.' },
    { id: 'hyper', name: 'Hiperexponencial H₂', kendall: 'H₂', params: ['mean', 'cv'], help: 'Mezcla de dos exponenciales (CV > 1). Servicios con casos rápidos y casos muy largos.' },
    { id: 'emp', name: 'Empírica (datos)', kendall: 'G', params: ['data'], help: 'Remuestreo directo de tiempos reales observados en tus datos.' }
  ];
  Dist.byId = {}; Dist.TYPES.forEach((t) => { Dist.byId[t.id] = t; });
  Dist.PARAM_LABEL = { mean: 'Media', sd: 'Desv. estándar', k: 'Fases k', a: 'Mínimo', b: 'Máximo', mode: 'Más probable', cv: 'Coef. de variación', data: 'Datos' };

  // Integración numérica simple (Simpson) para momentos de densidades acotadas
  function simpson(f, a, b, n = 2000) {
    const h = (b - a) / n; let s = f(a) + f(b);
    for (let i = 1; i < n; i++) s += f(a + i * h) * (i % 2 ? 4 : 2);
    return s * h / 3;
  }
  // Forma de Weibull a partir del CV (bisección; el CV decrece con la forma)
  function weibullShape(cv) {
    const f = (k) => Math.sqrt(Math.exp(U.lgamma(1 + 2 / k) - 2 * U.lgamma(1 + 1 / k)) - 1) - cv;
    let lo = 0.05, hi = 200;
    for (let i = 0; i < 200; i++) { const m = Math.sqrt(lo * hi); if (f(m) > 0) lo = m; else hi = m; }
    return Math.sqrt(lo * hi);
  }

  // Crea un objeto distribución a partir de su especificación JSON
  Dist.make = function (spec) {
    spec = spec || { type: 'exp', mean: 1 };
    const t = spec.type || 'exp';
    const mean = +spec.mean, sd = +spec.sd;
    let sample, m1, m2, m3, ok = true, err = '';
    switch (t) {
      case 'exp': {
        if (!(mean > 0)) { ok = false; err = 'La media debe ser positiva.'; }
        sample = (r) => r.exp(mean); m1 = mean; m2 = 2 * mean * mean; m3 = 6 * mean ** 3; break;
      }
      case 'det': {
        if (!(mean >= 0)) { ok = false; err = 'El valor debe ser ≥ 0.'; }
        sample = () => mean; m1 = mean; m2 = mean * mean; m3 = mean ** 3; break;
      }
      case 'erlang': {
        const k = Math.max(1, Math.round(+spec.k || 1)); const th = mean / k;
        if (!(mean > 0)) { ok = false; err = 'La media debe ser positiva.'; }
        sample = (r) => { let s = 0; for (let i = 0; i < k; i++) s -= Math.log(r.random()); return s * th; };
        m1 = mean; m2 = k * (k + 1) * th * th; m3 = k * (k + 1) * (k + 2) * th ** 3; break;
      }
      case 'gamma': {
        if (!(mean > 0 && sd > 0)) { ok = false; err = 'Media y desviación deben ser positivas.'; }
        const a = (mean / sd) ** 2, th = sd * sd / mean;
        sample = (r) => r.gamma(a) * th; m1 = mean; m2 = a * (a + 1) * th * th; m3 = a * (a + 1) * (a + 2) * th ** 3; break;
      }
      case 'lnorm': {
        if (!(mean > 0 && sd > 0)) { ok = false; err = 'Media y desviación deben ser positivas.'; }
        const s2 = Math.log(1 + (sd * sd) / (mean * mean)), mu = Math.log(mean) - s2 / 2, s = Math.sqrt(s2);
        sample = (r) => Math.exp(mu + s * r.normal());
        const mom = (n) => Math.exp(n * mu + n * n * s2 / 2); m1 = mom(1); m2 = mom(2); m3 = mom(3); break;
      }
      case 'weibull': {
        if (!(mean > 0 && sd > 0)) { ok = false; err = 'Media y desviación deben ser positivas.'; }
        const k = weibullShape(sd / mean), lam = mean / Math.exp(U.lgamma(1 + 1 / k));
        sample = (r) => lam * Math.pow(-Math.log(r.random()), 1 / k);
        const mom = (n) => Math.pow(lam, n) * Math.exp(U.lgamma(1 + n / k)); m1 = mom(1); m2 = mom(2); m3 = mom(3);
        spec._shape = k; spec._scale = lam; break;
      }
      case 'norm': {
        if (!(mean > 0 && sd >= 0)) { ok = false; err = 'La media debe ser positiva.'; }
        if (sd === 0) { sample = () => mean; m1 = mean; m2 = mean * mean; m3 = mean ** 3; break; }
        sample = (r) => { for (let i = 0; i < 200; i++) { const x = mean + sd * r.normal(); if (x > 0) return x; } return mean > 0 ? mean : 1e-6; };
        const Z = 1 - U.normCdf(-mean / sd);
        const pdf = (x) => U.normPdf((x - mean) / sd) / sd / Z;
        const hi = mean + 12 * sd;
        m1 = simpson((x) => x * pdf(x), 0, hi); m2 = simpson((x) => x * x * pdf(x), 0, hi); m3 = simpson((x) => x * x * x * pdf(x), 0, hi); break;
      }
      case 'unif': {
        const a = +spec.a, b = +spec.b;
        if (!(b > a && a >= 0)) { ok = false; err = 'Se requiere 0 ≤ mínimo < máximo.'; }
        sample = (r) => a + (b - a) * r.random();
        const mom = (n) => (Math.pow(b, n + 1) - Math.pow(a, n + 1)) / ((n + 1) * (b - a)); m1 = mom(1); m2 = mom(2); m3 = mom(3); break;
      }
      case 'tri': {
        const a = +spec.a, c = +spec.mode, b = +spec.b;
        if (!(a >= 0 && a <= c && c <= b && b > a)) { ok = false; err = 'Se requiere 0 ≤ mínimo ≤ más probable ≤ máximo.'; }
        const Fc = (c - a) / (b - a);
        sample = (r) => { const u = r.random(); return u < Fc ? a + Math.sqrt(u * (b - a) * (c - a)) : b - Math.sqrt((1 - u) * (b - a) * (b - c)); };
        const pdf = (x) => (x < c ? 2 * (x - a) / ((b - a) * (c - a) || 1) : 2 * (b - x) / ((b - a) * (b - c) || 1));
        m1 = (a + b + c) / 3; m2 = simpson((x) => x * x * pdf(x), a, b); m3 = simpson((x) => x * x * x * pdf(x), a, b); break;
      }
      case 'hyper': {
        const cv = Math.max(1, +spec.cv || 1);
        if (!(mean > 0)) { ok = false; err = 'La media debe ser positiva.'; }
        const c2 = cv * cv, p1 = 0.5 * (1 + Math.sqrt((c2 - 1) / (c2 + 1))), p2 = 1 - p1;
        const mu1 = 2 * p1 / mean, mu2 = 2 * p2 / mean;
        sample = (r) => (r.random() < p1 ? r.exp(1 / mu1) : r.exp(1 / mu2));
        m1 = p1 / mu1 + p2 / mu2; m2 = 2 * (p1 / mu1 ** 2 + p2 / mu2 ** 2); m3 = 6 * (p1 / mu1 ** 3 + p2 / mu2 ** 3); break;
      }
      case 'emp': {
        const data = (spec.data || []).filter((x) => x >= 0 && isFinite(x));
        if (data.length < 2) { ok = false; err = 'La distribución empírica necesita al menos 2 datos.'; }
        const n = data.length || 1;
        sample = (r) => data[Math.floor(r.random() * n)] || 0;
        let s1 = 0, s2 = 0, s3 = 0; for (const x of data) { s1 += x; s2 += x * x; s3 += x * x * x; }
        m1 = s1 / n; m2 = s2 / n; m3 = s3 / n; break;
      }
      default: return Dist.make({ type: 'exp', mean: mean || 1 });
    }
    const variance = Math.max(0, m2 - m1 * m1);
    const scv = m1 > 0 ? variance / (m1 * m1) : 0;
    const def = Dist.byId[t] || Dist.byId.exp;
    let kendall = def.kendall;
    if (t === 'erlang') kendall = 'E' + Math.max(1, Math.round(+spec.k || 1));
    return { spec, type: t, ok, err, sample, mean: m1, m1, m2, m3, variance, sd: Math.sqrt(variance), scv, cv: Math.sqrt(scv), kendall, name: def.name };
  };

  // Escala una distribución por un factor (p. ej. minutos -> horas): devuelve momentos escalados
  Dist.moments = (d, f = 1) => ({ m1: d.m1 * f, m2: d.m2 * f * f, m3: d.m3 * f * f * f, scv: d.scv });

  // Cambia la media de una especificación conservando su forma (CV)
  Dist.withMean = (spec, newMean) => {
    const d = Dist.make(spec); const s = Object.assign({}, spec);
    if (!(d.mean > 0)) { s.mean = newMean; return s; }
    const f = newMean / d.mean;
    switch (spec.type) {
      case 'unif': s.a = spec.a * f; s.b = spec.b * f; break;
      case 'tri': s.a = spec.a * f; s.mode = spec.mode * f; s.b = spec.b * f; break;
      case 'emp': s.data = (spec.data || []).map((x) => x * f); break;
      case 'gamma': case 'lnorm': case 'weibull': case 'norm': s.mean = newMean; s.sd = (spec.sd || 0) * f; break;
      default: s.mean = newMean;
    }
    return s;
  };

  Dist.describe = (spec, unit = 'min') => {
    const d = Dist.make(spec); const s = spec;
    const T = (x) => U.fmtSmart(x) + ' ' + unit;
    switch (s.type) {
      case 'exp': return `Exponencial (media ${T(s.mean)})`;
      case 'det': return `Constante (${T(s.mean)})`;
      case 'erlang': return `Erlang-${s.k} (media ${T(s.mean)})`;
      case 'gamma': return `Gamma (media ${T(s.mean)}, d.e. ${T(s.sd)})`;
      case 'lnorm': return `Lognormal (media ${T(s.mean)}, d.e. ${T(s.sd)})`;
      case 'weibull': return `Weibull (media ${T(s.mean)}, d.e. ${T(s.sd)})`;
      case 'norm': return `Normal truncada (media ${T(s.mean)}, d.e. ${T(s.sd)})`;
      case 'unif': return `Uniforme (${T(s.a)} – ${T(s.b)})`;
      case 'tri': return `Triangular (${U.fmtSmart(s.a)}, ${U.fmtSmart(s.mode)}, ${T(s.b)})`;
      case 'hyper': return `Hiperexponencial (media ${T(s.mean)}, CV ${U.fmt(s.cv, 2)})`;
      case 'emp': return `Empírica (${(s.data || []).length} datos, media ${T(d.mean)})`;
      default: return d.name;
    }
  };

  // Tamaño de lote (llegadas en grupo)
  Dist.batch = function (spec) {
    spec = spec || { type: 'none' };
    const t = spec.type || 'none';
    const mean = Math.max(1, +spec.mean || 1);
    switch (t) {
      case 'fixed': { const n = Math.max(1, Math.round(mean)); return { sample: () => n, m1: n, m2: n * n }; }
      case 'geom': { // geométrica en {1,2,...} con media dada
        const p = 1 / mean;
        return { sample: (r) => Math.max(1, Math.ceil(Math.log(r.random()) / Math.log(1 - p || 1e-12))), m1: mean, m2: (2 - p) / (p * p) };
      }
      case 'poisson': { // 1 + Poisson(media-1)
        const lam = mean - 1; return { sample: (r) => 1 + r.poisson(lam), m1: mean, m2: lam + (1 + lam) * (1 + lam) };
      }
      case 'unif': {
        const a = Math.max(1, Math.round(+spec.min || 1)), b = Math.max(a, Math.round(+spec.max || a));
        const n = b - a + 1; let s2 = 0; for (let x = a; x <= b; x++) s2 += x * x;
        return { sample: (r) => a + Math.floor(r.random() * n), m1: (a + b) / 2, m2: s2 / n };
      }
      default: return { sample: () => 1, m1: 1, m2: 1 };
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
