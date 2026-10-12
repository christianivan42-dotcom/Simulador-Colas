/* Simulador Experto de Colas — utilidades comunes (matemática, fechas, formato, DOM). */
(function (root) {
  'use strict';
  const QS = root.QS = root.QS || {};
  const U = QS.U = {};

  /* ------------------------------------------------------------------ */
  /* Matemática básica                                                   */
  /* ------------------------------------------------------------------ */
  U.clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
  U.sum = (a) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i]; return s; };
  U.mean = (a) => (a.length ? U.sum(a) / a.length : NaN);
  U.variance = (a) => {
    const n = a.length; if (n < 2) return NaN;
    const m = U.mean(a); let s = 0;
    for (let i = 0; i < n; i++) { const d = a[i] - m; s += d * d; }
    return s / (n - 1);
  };
  U.sd = (a) => Math.sqrt(U.variance(a));
  U.quantileSorted = (s, p) => {
    const n = s.length; if (!n) return NaN; if (n === 1) return s[0];
    const h = (n - 1) * p, lo = Math.floor(h), hi = Math.ceil(h);
    return s[lo] + (h - lo) * (s[hi] - s[lo]);
  };
  U.sortedCopy = (a) => Float64Array.from(a).sort();
  U.quantile = (a, p) => U.quantileSorted(U.sortedCopy(a), p);
  U.median = (a) => U.quantile(a, 0.5);
  U.range = (n, f) => { const r = new Array(n); for (let i = 0; i < n; i++) r[i] = f ? f(i) : i; return r; };
  U.finite = (x) => typeof x === 'number' && isFinite(x);

  // log Γ(x) por Lanczos (g = 7, n = 9)
  const LG = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313,
    -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
  U.lgamma = function lgamma(x) {
    if (x < 0.5) return Math.log(Math.PI / Math.abs(Math.sin(Math.PI * x))) - lgamma(1 - x);
    x -= 1; let a = LG[0]; const t = x + 7.5;
    for (let i = 1; i < 9; i++) a += LG[i] / (x + i);
    return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
  };
  U.gammaFn = (x) => Math.exp(U.lgamma(x));

  // erfc con error relativo < 1.2e-7 (Numerical Recipes)
  U.erfc = (x) => {
    const z = Math.abs(x), t = 1 / (1 + 0.5 * z);
    const r = t * Math.exp(-z * z - 1.26551223 + t * (1.00002368 + t * (0.37409196 + t * (0.09678418 +
      t * (-0.18628806 + t * (0.27886807 + t * (-1.13520398 + t * (1.48851587 + t * (-0.82215223 + t * 0.17087277)))))))));
    return x >= 0 ? r : 2 - r;
  };
  U.normCdf = (x) => 0.5 * U.erfc(-x / Math.SQRT2);
  U.normPdf = (x) => Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
  // Inversa normal (Acklam) con un paso de refinamiento de Halley
  U.normInv = (p) => {
    if (p <= 0) return -Infinity; if (p >= 1) return Infinity;
    const a = [-3.969683028665376e+01, 2.209460984245205e+02, -2.759285104469687e+02, 1.383577518672690e+02, -3.066479806614716e+01, 2.506628277459239e+00];
    const b = [-5.447609879822406e+01, 1.615858368580409e+02, -1.556989798598866e+02, 6.680131188771972e+01, -1.328068155288572e+01];
    const c = [-7.784894002430293e-03, -3.223964580411365e-01, -2.400758277161838e+00, -2.549732539343734e+00, 4.374664141464968e+00, 2.938163982698783e+00];
    const d = [7.784695709041462e-03, 3.224671290700398e-01, 2.445134137142996e+00, 3.754408661907416e+00];
    const pl = 0.02425; let q, r, x;
    if (p < pl) { q = Math.sqrt(-2 * Math.log(p)); x = (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
    else if (p <= 1 - pl) { q = p - 0.5; r = q * q; x = (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1); }
    else { q = Math.sqrt(-2 * Math.log(1 - p)); x = -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
    const e = 0.5 * U.erfc(-x / Math.SQRT2) - p; const u = e * Math.sqrt(2 * Math.PI) * Math.exp(x * x / 2);
    return x - u / (1 + x * u / 2);
  };

  // Función gamma incompleta regularizada P(a, x)
  U.gammaP = (a, x) => {
    if (x <= 0) return 0; if (!isFinite(x)) return 1;
    const gln = U.lgamma(a);
    if (x < a + 1) {
      let ap = a, sum = 1 / a, del = sum;
      for (let n = 0; n < 1000; n++) { ap += 1; del *= x / ap; sum += del; if (Math.abs(del) < Math.abs(sum) * 1e-14) break; }
      return Math.min(1, sum * Math.exp(-x + a * Math.log(x) - gln));
    }
    let b = x + 1 - a, c = 1 / 1e-300, d = 1 / b, h = d;
    for (let i = 1; i < 1000; i++) {
      const an = -i * (i - a); b += 2;
      d = an * d + b; if (Math.abs(d) < 1e-300) d = 1e-300;
      c = b + an / c; if (Math.abs(c) < 1e-300) c = 1e-300;
      d = 1 / d; const del = d * c; h *= del; if (Math.abs(del - 1) < 1e-14) break;
    }
    return Math.max(0, 1 - Math.exp(-x + a * Math.log(x) - gln) * h);
  };
  // Beta incompleta regularizada I_x(a, b)
  function betacf(a, b, x) {
    const qab = a + b, qap = a + 1, qam = a - 1; let c = 1, d = 1 - qab * x / qap;
    if (Math.abs(d) < 1e-300) d = 1e-300; d = 1 / d; let h = d;
    for (let m = 1; m <= 300; m++) {
      const m2 = 2 * m; let aa = m * (b - m) * x / ((qam + m2) * (a + m2));
      d = 1 + aa * d; if (Math.abs(d) < 1e-300) d = 1e-300; c = 1 + aa / c; if (Math.abs(c) < 1e-300) c = 1e-300; d = 1 / d; h *= d * c;
      aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2));
      d = 1 + aa * d; if (Math.abs(d) < 1e-300) d = 1e-300; c = 1 + aa / c; if (Math.abs(c) < 1e-300) c = 1e-300; d = 1 / d;
      const del = d * c; h *= del; if (Math.abs(del - 1) < 1e-14) break;
    }
    return h;
  }
  U.betaI = (a, b, x) => {
    if (x <= 0) return 0; if (x >= 1) return 1;
    const bt = Math.exp(U.lgamma(a + b) - U.lgamma(a) - U.lgamma(b) + a * Math.log(x) + b * Math.log(1 - x));
    return x < (a + 1) / (a + b + 2) ? bt * betacf(a, b, x) / a : 1 - bt * betacf(b, a, 1 - x) / b;
  };
  U.tCdf = (t, df) => {
    const x = df / (df + t * t); const tail = 0.5 * U.betaI(df / 2, 0.5, x);
    return t >= 0 ? 1 - tail : tail;
  };
  U.tInv = (p, df) => {
    if (df > 1e6) return U.normInv(p);
    let lo = -1000, hi = 1000;
    for (let i = 0; i < 200; i++) { const m = (lo + hi) / 2; if (U.tCdf(m, df) < p) lo = m; else hi = m; if (hi - lo < 1e-10) break; }
    return (lo + hi) / 2;
  };
  U.chi2Cdf = (x, k) => U.gammaP(k / 2, x / 2);
  U.chi2Inv = (p, k) => {
    let lo = 0, hi = Math.max(10, k * 10);
    while (U.chi2Cdf(hi, k) < p) hi *= 2;
    for (let i = 0; i < 200; i++) { const m = (lo + hi) / 2; if (U.chi2Cdf(m, k) < p) lo = m; else hi = m; if (hi - lo < 1e-10 * hi) break; }
    return (lo + hi) / 2;
  };
  // Vector de la CDF de Poisson(m) para k = 0..kmax, estable para m grande
  U.poissonCdfVec = (m, kmax) => {
    const out = new Float64Array(kmax + 1);
    if (m <= 0) { out.fill(1); return out; }
    let logp = -m, acc = 0;
    for (let k = 0; k <= kmax; k++) {
      if (k > 0) logp += Math.log(m) - Math.log(k);
      acc += Math.exp(logp); out[k] = Math.min(1, acc);
    }
    return out;
  };
  U.poissonPmf = (k, m) => Math.exp(-m + k * Math.log(m) - U.lgamma(k + 1));

  // Regresión lineal simple
  U.linreg = (xs, ys) => {
    const n = xs.length; let sx = 0, sy = 0, sxx = 0, sxy = 0, syy = 0;
    for (let i = 0; i < n; i++) { const x = xs[i], y = ys[i]; sx += x; sy += y; sxx += x * x; sxy += x * y; syy += y * y; }
    const den = n * sxx - sx * sx; const b = den ? (n * sxy - sx * sy) / den : 0; const a = (sy - b * sx) / n;
    const ssTot = syy - sy * sy / n; let ssRes = 0;
    for (let i = 0; i < n; i++) { const e = ys[i] - a - b * xs[i]; ssRes += e * e; }
    return { a, b, r2: ssTot > 0 ? 1 - ssRes / ssTot : 0, se: n > 2 ? Math.sqrt(ssRes / (n - 2)) : NaN };
  };
  // Resuelve (A) x = b para A simétrica definida positiva (Cholesky). A es array de arrays.
  U.solveSPD = (A, b) => {
    const n = b.length; const L = A.map((r) => r.slice());
    for (let j = 0; j < n; j++) {
      let s = L[j][j]; for (let k = 0; k < j; k++) s -= L[j][k] * L[j][k];
      if (s <= 1e-12) s = 1e-12; L[j][j] = Math.sqrt(s);
      for (let i = j + 1; i < n; i++) { let t = L[i][j]; for (let k = 0; k < j; k++) t -= L[i][k] * L[j][k]; L[i][j] = t / L[j][j]; }
    }
    const y = new Array(n); for (let i = 0; i < n; i++) { let t = b[i]; for (let k = 0; k < i; k++) t -= L[i][k] * y[k]; y[i] = t / L[i][i]; }
    const x = new Array(n); for (let i = n - 1; i >= 0; i--) { let t = y[i]; for (let k = i + 1; k < n; k++) t -= L[k][i] * x[k]; x[i] = t / L[i][i]; }
    return x;
  };

  /* ------------------------------------------------------------------ */
  /* Fechas (días como enteros UTC para evitar problemas de horario)     */
  /* ------------------------------------------------------------------ */
  const DAY = 86400000;
  U.DAY = DAY;
  U.MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
  U.MESES_L = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
  U.DIAS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
  U.DIAS_L = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
  U.dayKey = (y, m, d) => Math.floor(Date.UTC(y, m - 1, d) / DAY);
  U.dayInfo = (k) => {
    const dt = new Date(k * DAY);
    const y = dt.getUTCFullYear(), m = dt.getUTCMonth() + 1, d = dt.getUTCDate();
    const dow = (dt.getUTCDay() + 6) % 7; // 0 = lunes
    const doy = k - U.dayKey(y, 1, 1);
    const dim = new Date(Date.UTC(y, m, 0)).getUTCDate();
    return { k, y, m, d, dow, doy, dim };
  };
  U.daysInMonth = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();
  U.fmtDay = (k) => { const i = U.dayInfo(k); return `${i.d} ${U.MESES[i.m - 1].toLowerCase()} ${i.y}`; };
  U.isoDay = (k) => { const i = U.dayInfo(k); return `${i.y}-${U.pad2(i.m)}-${U.pad2(i.d)}`; };
  U.pad2 = (n) => (n < 10 ? '0' : '') + n;
  // Domingo de Pascua (algoritmo anónimo gregoriano)
  U.easter = (y) => {
    const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4;
    const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
    const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
    const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
    return U.dayKey(y, month, day);
  };
  // n-ésimo día de la semana (dow 0=lun) de un mes; n = -1 para el último
  U.nthDow = (y, m, dow, n) => {
    if (n > 0) { const k1 = U.dayKey(y, m, 1); const off = (dow - U.dayInfo(k1).dow + 7) % 7; return k1 + off + 7 * (n - 1); }
    const kl = U.dayKey(y, m, U.daysInMonth(y, m)); const off = (U.dayInfo(kl).dow - dow + 7) % 7; return kl - off;
  };
  U.fmtClock = (minOfDay) => {
    if (!U.finite(minOfDay)) return '--:--';
    let m = Math.floor(minOfDay); const dd = Math.floor(m / 1440); m -= dd * 1440;
    return `${U.pad2(Math.floor(m / 60))}:${U.pad2(m % 60)}` + (dd > 0 ? ` (+${dd}d)` : '');
  };
  U.fmtHour = (h) => `${U.pad2(((h % 24) + 24) % 24)}:00`;

  /* ------------------------------------------------------------------ */
  /* Formato numérico (según el idioma del navegador)                    */
  /* ------------------------------------------------------------------ */
  const nav = typeof navigator !== 'undefined' ? navigator : null;
  U.locale = nav && /^es/i.test(nav.language || '') ? nav.language : 'es-MX';
  const nfCache = {};
  U.nf = (d, min) => {
    const key = d + '|' + (min || 0);
    return nfCache[key] || (nfCache[key] = new Intl.NumberFormat(U.locale, { maximumFractionDigits: d, minimumFractionDigits: min || 0 }));
  };
  U.decimalSep = U.nf(2, 2).format(1.5).replace(/\d/g, '').charAt(0) || '.';
  U.fmt = (x, d = 2, min) => {
    if (x === null || x === undefined || (typeof x === 'number' && isNaN(x))) return '—';
    if (x === Infinity) return '∞'; if (x === -Infinity) return '−∞';
    return U.nf(d, min).format(x);
  };
  U.fmtInt = (x) => U.fmt(x, 0);
  U.fmtPct = (x, d = 1) => (U.finite(x) ? U.nf(d, d).format(x * 100) + ' %' : '—');
  U.fmtSmart = (x) => {
    if (!U.finite(x)) return U.fmt(x);
    const a = Math.abs(x);
    return U.fmt(x, a >= 100 ? 0 : a >= 10 ? 1 : a >= 1 ? 2 : a >= 0.01 ? 3 : 4);
  };
  // Tiempo expresado en minutos -> texto legible
  U.fmtTime = (min) => {
    if (!U.finite(min)) return min === Infinity ? '∞' : '—';
    if (min < 0) return '−' + U.fmtTime(-min);
    if (min < 1) return U.fmt(min * 60, min * 60 < 10 ? 1 : 0) + ' s';
    if (min < 60) return U.fmt(min, min < 10 ? 2 : 1) + ' min';
    const h = Math.floor(min / 60), m = Math.round(min - h * 60);
    return m === 60 ? `${h + 1} h 00 min` : `${h} h ${U.pad2(m)} min`;
  };
  U.fmtMoney = (x, cur = '$') => (U.finite(x) ? cur + ' ' + U.fmt(x, Math.abs(x) >= 100 ? 0 : 2) : '—');
  U.compact = (x) => {
    if (!U.finite(x)) return U.fmt(x);
    const a = Math.abs(x);
    if (a >= 1e6) return U.fmt(x / 1e6, 1) + ' M';
    if (a >= 1e4) return U.fmt(x / 1e3, 1) + ' mil';
    return U.fmt(x, a >= 100 ? 0 : 1);
  };

  /* ------------------------------------------------------------------ */
  /* DOM                                                                 */
  /* ------------------------------------------------------------------ */
  U.$ = (sel, rootEl) => (rootEl || document).querySelector(sel);
  U.$$ = (sel, rootEl) => Array.from((rootEl || document).querySelectorAll(sel));
  // h('div', {class:'x', onclick: fn, style: {...}}, 'texto', otroNodo, [hijos])
  U.h = function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    if (attrs) {
      for (const k in attrs) {
        const v = attrs[k];
        if (v === undefined || v === null || v === false) continue;
        if (k === 'class') el.className = v;
        else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
        else if (k === 'html') el.innerHTML = v;
        else if (k === 'text') el.textContent = v;
        else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
        else if (k === 'dataset') Object.assign(el.dataset, v);
        else if (k in el && typeof v !== 'string' && k !== 'list') el[k] = v;
        else el.setAttribute(k, v === true ? '' : v);
      }
    }
    const add = (c) => {
      if (c === null || c === undefined || c === false) return;
      if (Array.isArray(c)) { c.forEach(add); return; }
      el.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
    };
    kids.forEach(add);
    return el;
  };
  U.clear = (el) => { while (el.firstChild) el.removeChild(el.firstChild); return el; };
  U.cssVar = (name, el) => getComputedStyle(el || document.documentElement).getPropertyValue(name).trim();
  U.isDark = () => {
    const t = document.documentElement.getAttribute('data-theme');
    if (t === 'dark') return true; if (t === 'light') return false;
    return !!(root.matchMedia && root.matchMedia('(prefers-color-scheme: dark)').matches);
  };
  U.debounce = (fn, ms) => { let id; return function (...a) { clearTimeout(id); id = setTimeout(() => fn.apply(this, a), ms); }; };
  // Cede el control al navegador (para cálculos largos por bloques)
  U.tick = () => new Promise((r) => setTimeout(r, 0));
  U.uid = (() => { let n = 0; return (p = 'id') => p + '-' + (++n); })();

  // Avisos breves en pantalla
  U.toast = (msg, kind = 'info', ms = 3600) => {
    if (typeof document === 'undefined') return;
    let box = document.getElementById('toasts');
    if (!box) { box = U.h('div', { id: 'toasts', class: 'toasts', role: 'status', 'aria-live': 'polite' }); document.body.appendChild(box); }
    const t = U.h('div', { class: 'toast toast-' + kind }, msg);
    box.appendChild(t);
    setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 400); }, ms);
  };

  // Almacenamiento local tolerante a fallos (solo comodidades del usuario)
  U.store = {
    get(k, def) { try { const v = root.localStorage.getItem('qs:' + k); return v === null ? def : JSON.parse(v); } catch (e) { return def; } },
    set(k, v) { try { root.localStorage.setItem('qs:' + k, JSON.stringify(v)); } catch (e) { /* sin almacenamiento */ } },
    del(k) { try { root.localStorage.removeItem('qs:' + k); } catch (e) { /* nada */ } }
  };

  // Guardar archivo: usa la capacidad de descargas del visor si existe; si no, descarga normal.
  U.saveFile = async (filename, data, mime) => {
    const hasViewer = root.claude && typeof root.claude.use === 'function';
    if (hasViewer) {
      try {
        const dl = await root.claude.use('downloads');
        if (dl) {
          let name = filename;
          if (!/\.(gif|png|jpe?g|webp|mp4|webm|txt|json|md|docx|pptx|epub|csv|ttf|html|svg|pdf|xlsx|zip)$/i.test(name)) name += '.txt';
          await dl.save({ filename: name, data });
          U.toast('Archivo listo: ' + name, 'ok');
          return true;
        }
      } catch (e) {
        if (e && e.code === 'declined') return false;
        if (e && e.code === 'rate_limited') { U.toast('Ya hay una descarga pendiente de confirmar.', 'warn'); return false; }
      }
    }
    try {
      const blob = data instanceof Blob ? data : new Blob([data], { type: mime || 'text/plain;charset=utf-8' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = filename; a.rel = 'noopener';
      document.body.appendChild(a); a.click();
      setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
      return true;
    } catch (e) {
      U.toast('No se pudo generar la descarga en este navegador.', 'bad');
      return false;
    }
  };
  U.copyText = async (text) => {
    try { await navigator.clipboard.writeText(text); U.toast('Copiado al portapapeles', 'ok'); return true; }
    catch (e) { U.toast('El navegador no permitió copiar; selecciona el texto y usa Ctrl+C.', 'warn'); return false; }
  };

  // CSV de salida compatible con Excel (separador según configuración regional)
  U.toCSV = (headers, rows, opts = {}) => {
    const sep = opts.sep || (U.decimalSep === ',' ? ';' : ',');
    const dec = sep === ';' ? ',' : '.';
    const cell = (v) => {
      if (v === null || v === undefined || (typeof v === 'number' && !isFinite(v))) return '';
      if (typeof v === 'number') { const s = String(Math.round(v * 1e6) / 1e6); return dec === ',' ? s.replace('.', ',') : s; }
      const s = String(v);
      return /[",;\n\r\t]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    const lines = [headers.map(cell).join(sep)];
    for (const r of rows) lines.push(r.map(cell).join(sep));
    return '﻿' + lines.join('\r\n');
  };
})(typeof window !== 'undefined' ? window : globalThis);
