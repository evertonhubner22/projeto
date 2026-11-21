/**
 * mini-chart.js
 * Motor de gráficos próprio do FinFlow (canvas puro, sem dependências nem CDN).
 *
 * Substitui o Chart.js mantendo a mesma interface usada no projeto:
 *   new Chart(canvas, { type, data, options })  +  chart.destroy() / chart.update()
 *
 * Tipos: 'bar' (vertical ou horizontal com indexAxis: 'y'), 'line' e 'doughnut'.
 * Recursos: grade e eixos, legenda clicável, tooltips (callbacks title/label),
 * animação de entrada, hover, responsivo e nítido em telas de alta densidade.
 */
(function () {
  'use strict';

  const registro = new Set();
  const PI2 = Math.PI * 2;

  const PADROES = {
    font: { family: "system-ui, -apple-system, 'Segoe UI', sans-serif", size: 12, weight: 600 },
    color: '#5C6B63',
    animation: { duration: 800 },
  };

  /* ---------- Utilitários ---------- */
  const resolver = (v, ctx) => (typeof v === 'function' ? v(ctx) : v);
  const easeOutQuart = t => 1 - Math.pow(1 - t, 4);
  const limitar = (v, a, b) => Math.min(Math.max(v, a), b);
  const fonteCss = (f = {}) =>
    `${f.weight || PADROES.font.weight} ${f.size || PADROES.font.size}px ${f.family || PADROES.font.family}`;
  const emArray = v => (v == null || v === '' ? [] : Array.isArray(v) ? v : [v]);

  function passoBonito(bruto) {
    if (!isFinite(bruto) || bruto <= 0) return 1;
    const exp = Math.floor(Math.log10(bruto));
    const f = bruto / Math.pow(10, exp);
    const n = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10;
    return n * Math.pow(10, exp);
  }

  function gerarTicks(min, max, maxFixo, minFixo, alvo = 5) {
    if (max === min) max = min + 1;
    const passo = passoBonito((max - min) / alvo);
    const inicio = minFixo != null ? minFixo : Math.floor(min / passo) * passo;
    const fim = maxFixo != null ? maxFixo : Math.ceil(max / passo) * passo;
    const ticks = [];
    for (let v = inicio; v <= fim + passo * 1e-6; v += passo) ticks.push(Math.round(v * 1e9) / 1e9);
    if (maxFixo != null && ticks[ticks.length - 1] < fim - passo * 0.4) ticks.push(fim);
    return { ticks, min: inicio, max: Math.max(fim, ticks[ticks.length - 1]) };
  }

  function retanguloRedondo(ctx, x, y, w, h, raios) {
    const [tl, tr, br, bl] = raios;
    ctx.beginPath();
    ctx.moveTo(x + tl, y);
    ctx.lineTo(x + w - tr, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + tr);
    ctx.lineTo(x + w, y + h - br);
    ctx.quadraticCurveTo(x + w, y + h, x + w - br, y + h);
    ctx.lineTo(x + bl, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - bl);
    ctx.lineTo(x, y + tl);
    ctx.quadraticCurveTo(x, y, x + tl, y);
    ctx.closePath();
  }

  function caminhoFatia(ctx, cx, cy, Ro, Ri, a0, a1, r) {
    ctx.beginPath();
    if (a1 - a0 >= PI2 - 1e-6) {
      ctx.arc(cx, cy, Ro, 0, PI2);
      ctx.moveTo(cx + Ri, cy);
      ctx.arc(cx, cy, Ri, 0, PI2, true);
      return;
    }
    const P = (R, a) => [cx + R * Math.cos(a), cy + R * Math.sin(a)];
    if (r < 0.5) {
      ctx.arc(cx, cy, Ro, a0, a1);
      ctx.arc(cx, cy, Ri, a1, a0, true);
      ctx.closePath();
      return;
    }
    const dO = r / Ro, dI = r / Ri;
    ctx.moveTo(...P(Ro, a0 + dO));
    ctx.arc(cx, cy, Ro, a0 + dO, a1 - dO);
    ctx.quadraticCurveTo(...P(Ro, a1), ...P(Ro - r, a1));
    ctx.lineTo(...P(Ri + r, a1));
    ctx.quadraticCurveTo(...P(Ri, a1), ...P(Ri, a1 - dI));
    ctx.arc(cx, cy, Ri, a1 - dI, a0 + dI, true);
    ctx.quadraticCurveTo(...P(Ri, a0), ...P(Ri + r, a0));
    ctx.lineTo(...P(Ro - r, a0));
    ctx.quadraticCurveTo(...P(Ro, a0), ...P(Ro, a0 + dO));
    ctx.closePath();
  }

  function controlesSpline(p0, p1, p2, t) {
    const d01 = Math.hypot(p1.x - p0.x, p1.y - p0.y);
    const d12 = Math.hypot(p2.x - p1.x, p2.y - p1.y);
    const soma = d01 + d12 || 1;
    const fa = (t * d01) / soma, fb = (t * d12) / soma;
    return {
      ant: { x: p1.x - fa * (p2.x - p0.x), y: limitar(p1.y - fa * (p2.y - p0.y), Math.min(p0.y, p1.y), Math.max(p0.y, p1.y)) },
      prox: { x: p1.x + fb * (p2.x - p0.x), y: limitar(p1.y + fb * (p2.y - p0.y), Math.min(p1.y, p2.y), Math.max(p1.y, p2.y)) },
    };
  }

  /* ---------- Classe principal ---------- */
  class Chart {
    constructor(canvas, config) {
      this.canvas = canvas;
      this.config = config || {};
      this.type = this.config.type;
      this.data = this.config.data || { labels: [], datasets: [] };
      this.options = this.config.options || {};
      this.ctx = canvas.getContext('2d');
      this.pai = canvas.parentElement;
      this.largura = 0;
      this.altura = 0;
      this.progresso = 1;
      this.ocultos = new Set();
      this.hover = null;
      this.chartArea = { left: 0, top: 0, right: 0, bottom: 0 };
      this.ptr = null;
      this._hitsLegenda = [];
      this._animou = false;
      this._raf = 0;
      this._rafHover = 0;
      this._destruido = false;

      canvas.style.display = 'block';
      canvas.style.touchAction = 'pan-y';

      this._criarTooltip();
      this._ligarEventos();

      if (typeof ResizeObserver !== 'undefined' && this.pai) {
        this._ro = new ResizeObserver(() => this._aoRedimensionar());
        this._ro.observe(this.pai);
      }
      registro.add(this);
      this._aoRedimensionar();
    }

    /* ----- Ciclo de vida ----- */
    destroy() {
      this._destruido = true;
      cancelAnimationFrame(this._raf);
      cancelAnimationFrame(this._rafHover);
      if (this._ro) this._ro.disconnect();
      this._desligarEventos();
      if (this.tip && this.tip.parentNode) this.tip.parentNode.removeChild(this.tip);
      registro.delete(this);
      if (this.ctx) this.ctx.clearRect(0, 0, this.largura, this.altura);
    }

    update() {
      this.data = this.config.data || this.data;
      this.options = this.config.options || this.options;
      this.progresso = 1;
      this._desenhar();
    }

    resize() { this._aoRedimensionar(true); }

    _aoRedimensionar(forcar) {
      if (this._destruido || !this.pai) return;
      const est = getComputedStyle(this.pai);
      const w = Math.floor(this.pai.clientWidth - parseFloat(est.paddingLeft) - parseFloat(est.paddingRight));
      const h = Math.floor(this.pai.clientHeight - parseFloat(est.paddingTop) - parseFloat(est.paddingBottom));
      if (w <= 0 || h <= 0) return;
      if (!forcar && w === this.largura && h === this.altura) return;

      const dpr = window.devicePixelRatio || 1;
      this.largura = w;
      this.altura = h;
      this.canvas.width = Math.round(w * dpr);
      this.canvas.height = Math.round(h * dpr);
      this.canvas.style.width = w + 'px';
      this.canvas.style.height = h + 'px';
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      if (!this._animou) { this._animou = true; this._animar(); }
      else { this.progresso = 1; this._desenhar(); }
    }

    _animacao() {
      const o = this.options.animation;
      if (o === false || PADROES.animation === false) return null;
      if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return null;
      const base = typeof PADROES.animation === 'object' ? PADROES.animation : {};
      return { duration: 800, ...base, ...(typeof o === 'object' ? o : {}) };
    }

    _animar() {
      const anim = this._animacao();
      cancelAnimationFrame(this._raf);
      if (!anim) { this.progresso = 1; this._desenhar(); return; }
      const ini = performance.now();
      const passo = (agora) => {
        if (this._destruido) return;
        const t = Math.min((agora - ini) / anim.duration, 1);
        this.progresso = easeOutQuart(t);
        this._desenhar();
        if (t < 1) this._raf = requestAnimationFrame(passo);
      };
      this.progresso = 0;
      this._raf = requestAnimationFrame(passo);
    }

    /* ----- Dados ----- */
    _datasets() { return this.data.datasets || []; }
    _visiveis() {
      return this._datasets().map((ds, i) => ({ ds, i })).filter(d => !this.ocultos.has(d.i));
    }
    _cor(ds, i, chave = 'backgroundColor') {
      const v = ds[chave];
      const r = Array.isArray(v) ? v[i % v.length] : resolver(v, { chart: this, dataIndex: i });
      return r || '#888';
    }

    /* ----- Desenho principal ----- */
    _desenhar() {
      if (this._destruido || !this.largura) return;
      const ctx = this.ctx;
      ctx.clearRect(0, 0, this.largura, this.altura);
      const leg = this._prepararLegenda();
      if (this.type === 'doughnut') this._desenharRosca(leg);
      else this._desenharCartesiano(leg);
      this._desenharLegenda(leg);
    }

    /* ----- Legenda ----- */
    _prepararLegenda() {
      const cfg = (this.options.plugins && this.options.plugins.legend) || {};
      const vazia = { display: false, linhas: [], altura: 0 };
      if (cfg.display === false) return vazia;
      const lab = cfg.labels || {};
      const ctx = this.ctx;
      const fonte = fonteCss(lab.font);
      const tam = (lab.font && lab.font.size) || PADROES.font.size;
      const caixaW = lab.boxWidth || 9, caixaH = lab.boxHeight || 9, pad = lab.padding != null ? lab.padding : 16;
      const cor = lab.color || PADROES.color;

      let itens;
      if (this.type === 'doughnut') {
        const ds = this._datasets()[0] || { data: [] };
        itens = (this.data.labels || []).map((texto, i) => ({ texto, cor: this._cor(ds, i), idx: i }));
      } else {
        itens = this._datasets().map((ds, i) => ({
          texto: ds.label || '',
          cor: this.type === 'line' ? (ds.borderColor || this._cor(ds, 0)) : this._cor(ds, 0),
          idx: i,
        }));
      }
      itens = itens.filter(i => i.texto !== '');
      if (!itens.length) return vazia;

      ctx.font = fonte;
      const largMax = this.largura - 4;
      const linhas = [[]];
      let x = 0;
      itens.forEach(it => {
        it.w = caixaW + 8 + ctx.measureText(it.texto).width;
        if (x + it.w > largMax && linhas[linhas.length - 1].length) { linhas.push([]); x = 0; }
        linhas[linhas.length - 1].push(it);
        x += it.w + pad;
      });
      const linhaH = Math.max(caixaH, tam) + 6;
      return { display: true, linhas, linhaH, caixaW, caixaH, pad, fonte, cor, altura: linhas.length * linhaH + 12 };
    }

    _desenharLegenda(leg) {
      this._hitsLegenda = [];
      if (!leg.display) return;
      const ctx = this.ctx;
      ctx.font = leg.fonte;
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'left';
      let y = this.altura - leg.altura + 12 + leg.linhaH / 2 - 3;
      leg.linhas.forEach(linha => {
        let x = 2;
        linha.forEach(it => {
          const oculto = this.ocultos.has(it.idx);
          ctx.globalAlpha = oculto ? 0.4 : 1;
          ctx.fillStyle = it.cor;
          retanguloRedondo(ctx, x, y - leg.caixaH / 2, leg.caixaW, leg.caixaH, [3, 3, 3, 3]);
          ctx.fill();
          ctx.fillStyle = leg.cor;
          ctx.fillText(it.texto, x + leg.caixaW + 8, y + 0.5);
          if (oculto) {
            const tw = ctx.measureText(it.texto).width;
            ctx.strokeStyle = leg.cor; ctx.lineWidth = 1;
            ctx.beginPath(); ctx.moveTo(x + leg.caixaW + 8, y); ctx.lineTo(x + leg.caixaW + 8 + tw, y); ctx.stroke();
          }
          ctx.globalAlpha = 1;
          this._hitsLegenda.push({ x, y: y - leg.linhaH / 2, w: it.w, h: leg.linhaH, idx: it.idx });
          x += it.w + leg.pad;
        });
        y += leg.linhaH;
      });
    }

    /* ----- Gráficos cartesianos (barras e linha) ----- */
    _layoutCartesiano(leg) {
      const o = this.options;
      const esc = o.scales || {};
      const horizontal = o.indexAxis === 'y';
      const escCat = (horizontal ? esc.y : esc.x) || {};
      const escVal = (horizontal ? esc.x : esc.y) || {};
      const labels = this.data.labels || [];
      const n = labels.length;
      const ctx = this.ctx;
      const tam = PADROES.font.size;
      const fonteTick = fonteCss(escVal.ticks && escVal.ticks.font);

      let min = Infinity, max = -Infinity;
      this._visiveis().forEach(({ ds }) => ds.data.forEach(v => {
        if (v == null || isNaN(v)) return;
        if (v < min) min = v;
        if (v > max) max = v;
      }));
      if (!isFinite(min)) { min = 0; max = 0; }
      if (escVal.beginAtZero || this.type === 'bar') { min = Math.min(min, 0); max = Math.max(max, 0); }
      const maxFixo = typeof escVal.max === 'number' ? escVal.max : null;
      const minFixo = typeof escVal.min === 'number' ? escVal.min : null;
      const fmt = (escVal.ticks && escVal.ticks.callback) || (v => Number(v).toLocaleString('pt-BR'));
      ctx.font = fonteCss(escCat.ticks && escCat.ticks.font);
      const largCatMax = Math.min(Math.max(0, ...labels.map(t => ctx.measureText(String(t)).width)), this.largura * 0.4);

      const montarEixo = (alvo) => {
        const e = gerarTicks(minFixo != null ? minFixo : min, maxFixo != null ? maxFixo : max, maxFixo, minFixo, alvo);
        return { eixo: e, rotulos: e.ticks.map(v => String(fmt(v))) };
      };
      ctx.font = fonteTick;
      let { eixo, rotulos: rotulosVal } = montarEixo(5);
      let largValMax = Math.max(0, ...rotulosVal.map(t => ctx.measureText(t).width));

      // reduz a quantidade de marcas quando os rótulos não cabem lado a lado (eixo horizontal)
      if (o.indexAxis === 'y') {
        const largUtil = this.largura - (largCatMax + 14) - 10;
        const alvo = limitar(Math.floor(largUtil / (largValMax + 14)) - 1, 1, 5);
        if (alvo < 5) ({ eixo, rotulos: rotulosVal } = montarEixo(alvo));
      } else {
        // eixo vertical: no máximo uma marca a cada ~34px de altura
        const altUtil = this.altura - leg.altura - (tam + 16) - (tam / 2 + 6);
        const alvo = limitar(Math.floor(altUtil / 34), 2, 5);
        if (alvo < 5) ({ eixo, rotulos: rotulosVal } = montarEixo(alvo));
      }
      largValMax = Math.max(0, ...rotulosVal.map(t => ctx.measureText(t).width));

      const topo = tam / 2 + 6;
      let esq, dir = 10, base;
      if (horizontal) {
        esq = largCatMax + 14;
        base = tam + 14 + leg.altura;
      } else {
        esq = largValMax + 14;
        base = tam + 16 + leg.altura;
      }
      if (this.type === 'line' && n > 1) {
        ctx.font = fonteCss(escCat.ticks && escCat.ticks.font);
        esq = Math.max(esq, ctx.measureText(String(labels[0])).width / 2 + 2);
        dir = Math.max(dir, ctx.measureText(String(labels[n - 1])).width / 2 + 4);
      }
      const area = { left: esq, top: topo, right: this.largura - dir, bottom: this.altura - base };
      this.chartArea = area;
      return { horizontal, escCat, escVal, labels, n, eixo, rotulosVal, area, largCatMax };
    }

    _valorParaPx(L, v) {
      const { area, eixo, horizontal } = L;
      const f = (v - eixo.min) / ((eixo.max - eixo.min) || 1);
      return horizontal ? area.left + f * (area.right - area.left) : area.bottom - f * (area.bottom - area.top);
    }

    _posCategoria(L, i) {
      const { area, n, horizontal } = L;
      const ini = horizontal ? area.top : area.left;
      const tam = horizontal ? area.bottom - area.top : area.right - area.left;
      if (this.type === 'line') return n > 1 ? ini + (i * tam) / (n - 1) : ini + tam / 2;
      return ini + ((i + 0.5) * tam) / (n || 1);
    }

    _desenharCartesiano(leg) {
      const ctx = this.ctx;
      const L = this._layoutCartesiano(leg);
      this._L = L;
      const { horizontal, escCat, escVal, labels, n, eixo, rotulosVal, area } = L;
      const p = this.progresso;
      const grade = escVal.grid || {};
      const corGrade = grade.color || 'rgba(128,128,128,0.2)';
      const fonteVal = fonteCss(escVal.ticks && escVal.ticks.font);
      const fonteCat = fonteCss(escCat.ticks && escCat.ticks.font);
      const corVal = (escVal.ticks && escVal.ticks.color) || PADROES.color;
      const corCat = (escCat.ticks && escCat.ticks.color) || PADROES.color;
      const padTick = (escVal.ticks && escVal.ticks.padding) != null ? escVal.ticks.padding : 8;

      /* Grade e rótulos do eixo de valores */
      ctx.lineWidth = 1;
      eixo.ticks.forEach((v, k) => {
        const px = this._valorParaPx(L, v);
        if (grade.display !== false) {
          ctx.strokeStyle = corGrade;
          ctx.beginPath();
          if (horizontal) { ctx.moveTo(Math.round(px) + 0.5, area.top); ctx.lineTo(Math.round(px) + 0.5, area.bottom); }
          else { ctx.moveTo(area.left, Math.round(px) + 0.5); ctx.lineTo(area.right, Math.round(px) + 0.5); }
          ctx.stroke();
        }
        ctx.font = fonteVal;
        ctx.fillStyle = corVal;
        if (horizontal) {
          ctx.textAlign = k === eixo.ticks.length - 1 && px > this.largura - 14 ? 'right' : 'center';
          ctx.textBaseline = 'top';
          ctx.fillText(rotulosVal[k], px, area.bottom + padTick);
        } else {
          ctx.textAlign = 'right';
          ctx.textBaseline = 'middle';
          ctx.fillText(rotulosVal[k], area.left - padTick, px);
        }
      });

      /* Rótulos do eixo de categorias (com pulo automático quando não cabem) */
      ctx.font = fonteCat;
      ctx.fillStyle = corCat;
      const espaco = n > 1
        ? ((horizontal ? area.bottom - area.top : area.right - area.left) / (this.type === 'line' ? n - 1 : n))
        : 9999;
      const maxW = Math.max(0, ...labels.map(t => ctx.measureText(String(t)).width));
      const salto = horizontal ? 1 : Math.max(1, Math.ceil((maxW + 10) / espaco));
      labels.forEach((t, i) => {
        if (i % salto !== 0) return;
        const c = this._posCategoria(L, i);
        if (horizontal) {
          ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
          ctx.fillText(String(t), area.left - 10, c);
        } else {
          ctx.textAlign = 'center'; ctx.textBaseline = 'top';
          ctx.fillText(String(t), c, area.bottom + 10);
        }
      });

      /* Destaque do item sob o ponteiro */
      if (this.hover != null && n) {
        ctx.save();
        if (this.type === 'bar') {
          const tam = horizontal ? (area.bottom - area.top) / n : (area.right - area.left) / n;
          const c = this._posCategoria(L, this.hover);
          ctx.fillStyle = 'rgba(128,128,128,0.09)';
          if (horizontal) ctx.fillRect(area.left, c - tam / 2, area.right - area.left, tam);
          else ctx.fillRect(c - tam / 2, area.top, tam, area.bottom - area.top);
        } else {
          const c = this._posCategoria(L, this.hover);
          ctx.strokeStyle = corGrade; ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(c + 0.5, area.top); ctx.lineTo(c + 0.5, area.bottom); ctx.stroke();
        }
        ctx.restore();
      }

      if (this.type === 'bar') this._desenharBarras(L, p);
      else if (this.type === 'line') this._desenharLinhas(L, p);
    }

    _desenharBarras(L, p) {
      const ctx = this.ctx;
      const { horizontal, n, area, eixo } = L;
      const vis = this._visiveis();
      if (!vis.length || !n) return;
      const ds0 = vis[0].ds;
      const slot = (horizontal ? area.bottom - area.top : area.right - area.left) / n;
      const cp = ds0.categoryPercentage != null ? ds0.categoryPercentage : 0.8;
      const bp = ds0.barPercentage != null ? ds0.barPercentage : 0.9;
      const k = vis.length;
      let larg, passo;
      if (ds0.barThickness) { larg = ds0.barThickness; passo = larg; }
      else { passo = (slot * cp) / k; larg = passo * bp; }
      if (ds0.maxBarThickness) larg = Math.min(larg, ds0.maxBarThickness);
      larg = Math.max(1, larg);

      const zero = this._valorParaPx(L, limitar(0, eixo.min, eixo.max));

      vis.forEach(({ ds }, idxVis) => {
        ds.data.forEach((v, i) => {
          if (v == null || isNaN(v)) return;
          const centro = this._posCategoria(L, i) + (idxVis - (k - 1) / 2) * passo;
          const alvo = this._valorParaPx(L, v);
          const fim = zero + (alvo - zero) * p;
          let x, y, w, h;
          if (horizontal) { x = Math.min(zero, fim); w = Math.abs(fim - zero); y = centro - larg / 2; h = larg; }
          else { x = centro - larg / 2; w = larg; y = Math.min(zero, fim); h = Math.abs(fim - zero); }
          if (w < 0.5 || h < 0.5) return;

          const rMax = Math.min(w, h) / 2;
          const r = Math.min(Array.isArray(ds.borderRadius) ? ds.borderRadius[0] : (ds.borderRadius || 0), rMax);
          let raios = [r, r, r, r];
          if (ds.borderSkipped !== false && r) {
            if (horizontal) raios = v >= 0 ? [0, r, r, 0] : [r, 0, 0, r];
            else raios = v >= 0 ? [r, r, 0, 0] : [0, 0, r, r];
          }
          ctx.fillStyle = this._cor(ds, i);
          retanguloRedondo(ctx, x, y, w, h, raios);
          ctx.fill();
        });
      });
    }

    _desenharLinhas(L, p) {
      const ctx = this.ctx;
      const { area, n, eixo } = L;
      if (!n) return;
      const base = this._valorParaPx(L, limitar(0, eixo.min, eixo.max));
      ctx.save();
      ctx.beginPath();
      ctx.rect(area.left - 12, area.top - 12, (area.right - area.left + 24) * p, area.bottom - area.top + 24);
      ctx.clip();

      const vis = this._visiveis();
      for (let v = vis.length - 1; v >= 0; v--) {
        const { ds, i: dsIdx } = vis[v];
        const pts = [];
        ds.data.forEach((val, i) => {
          if (val == null || isNaN(val)) return;
          pts.push({ x: this._posCategoria(L, i), y: this._valorParaPx(L, val), i });
        });
        if (!pts.length) continue;
        const tensao = ds.tension || 0;

        const tracar = () => {
          ctx.moveTo(pts[0].x, pts[0].y);
          for (let j = 0; j < pts.length - 1; j++) {
            const a = pts[j], b = pts[j + 1];
            if (!tensao) { ctx.lineTo(b.x, b.y); continue; }
            const ca = controlesSpline(pts[j - 1] || a, a, b, tensao).prox;
            const cb = controlesSpline(a, b, pts[j + 2] || b, tensao).ant;
            ctx.bezierCurveTo(ca.x, ca.y, cb.x, cb.y, b.x, b.y);
          }
        };

        if (ds.fill) {
          ctx.beginPath();
          tracar();
          ctx.lineTo(pts[pts.length - 1].x, base);
          ctx.lineTo(pts[0].x, base);
          ctx.closePath();
          ctx.fillStyle = resolver(ds.backgroundColor, { chart: this, datasetIndex: dsIdx }) || 'transparent';
          ctx.fill();
        }

        ctx.beginPath();
        tracar();
        ctx.strokeStyle = ds.borderColor || '#888';
        ctx.lineWidth = ds.borderWidth || 2;
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        ctx.stroke();

        const raio = ds.pointRadius != null ? ds.pointRadius : 3;
        pts.forEach(pt => {
          const r = this.hover === pt.i ? (ds.pointHoverRadius != null ? ds.pointHoverRadius : raio + 2) : raio;
          if (r <= 0) return;
          ctx.beginPath();
          ctx.arc(pt.x, pt.y, r, 0, PI2);
          ctx.fillStyle = ds.pointBackgroundColor || ds.borderColor;
          ctx.fill();
          const bw = ds.pointBorderWidth != null ? ds.pointBorderWidth : 1;
          if (bw > 0) { ctx.strokeStyle = ds.pointBorderColor || ds.borderColor; ctx.lineWidth = bw; ctx.stroke(); }
        });
      }
      ctx.restore();
    }

    /* ----- Rosca ----- */
    _layoutRosca(leg) {
      const ds = this._datasets()[0] || { data: [] };
      const hoverOff = ds.hoverOffset || 0;
      const areaH = this.altura - leg.altura;
      const raio = Math.max(10, Math.min(this.largura, areaH) / 2 - hoverOff - 2);
      let corte = this.options.cutout != null ? this.options.cutout : '50%';
      corte = typeof corte === 'string' && corte.endsWith('%') ? parseFloat(corte) / 100 : Number(corte) / raio;
      const L = { ds, cx: this.largura / 2, cy: areaH / 2, Ro: raio, Ri: raio * limitar(corte, 0, 0.95), hoverOff };
      const total = ds.data.reduce((s, v, i) => s + (this.ocultos.has(i) ? 0 : Math.max(Number(v) || 0, 0)), 0);
      L.total = total;
      let ang = -Math.PI / 2;
      L.fatias = ds.data.map((v, i) => {
        const val = this.ocultos.has(i) ? 0 : Math.max(Number(v) || 0, 0);
        const span = total > 0 ? (val / total) * PI2 : 0;
        const f = { i, val, a0: ang, a1: ang + span };
        ang += span;
        return f;
      });
      return L;
    }

    _desenharRosca(leg) {
      const ctx = this.ctx;
      const L = this._layoutRosca(leg);
      this._L = L;
      const { ds, cx, cy, Ro, Ri, hoverOff, fatias } = L;
      const p = this.progresso;
      if (L.total <= 0) return;
      const raioBorda = Array.isArray(ds.borderRadius) ? ds.borderRadius[0] : (ds.borderRadius || 0);
      const bw = ds.borderWidth != null ? ds.borderWidth : 2;
      const inicio = -Math.PI / 2;

      fatias.forEach(f => {
        if (f.val <= 0) return;
        const a0 = inicio + (f.a0 - inicio) * p;
        const a1 = inicio + (f.a1 - inicio) * p;
        if (a1 - a0 < 0.0005) return;
        const ro = this.hover === f.i ? Ro + hoverOff : Ro;
        const r = Math.min(raioBorda, (ro - Ri) / 2 - 0.5, ((a1 - a0) * Ri) / 2);
        caminhoFatia(ctx, cx, cy, ro, Ri, a0, a1, Math.max(r, 0));
        ctx.fillStyle = this._cor(ds, f.i);
        ctx.fill();
        if (bw > 0) {
          ctx.lineWidth = bw;
          ctx.lineJoin = 'round';
          ctx.strokeStyle = Array.isArray(ds.borderColor) ? ds.borderColor[f.i % ds.borderColor.length] : (ds.borderColor || '#fff');
          ctx.stroke();
        }
      });
    }

    /* ----- Tooltip ----- */
    _criarTooltip() {
      if (!this.pai) return;
      const t = document.createElement('div');
      t.setAttribute('aria-hidden', 'true');
      Object.assign(t.style, {
        position: 'absolute', left: '0', top: '0', pointerEvents: 'none', zIndex: '20',
        opacity: '0', transition: 'opacity .12s ease', whiteSpace: 'nowrap', boxSizing: 'border-box',
        boxShadow: '0 10px 28px rgba(0,0,0,.22)',
      });
      this.pai.appendChild(t);
      this.tip = t;
    }

    _itensTooltip(idx) {
      if (this.type === 'doughnut') {
        const ds = this._datasets()[0];
        const val = Number(ds.data[idx]) || 0;
        return [{
          chart: this, dataset: ds, datasetIndex: 0, dataIndex: idx, label: (this.data.labels || [])[idx],
          parsed: val, raw: val, formattedValue: String(val), cor: this._cor(ds, idx),
        }];
      }
      const horizontal = this.options.indexAxis === 'y';
      return this._visiveis().map(({ ds, i }) => {
        const val = ds.data[idx];
        return {
          chart: this, dataset: ds, datasetIndex: i, dataIndex: idx, label: (this.data.labels || [])[idx],
          parsed: horizontal ? { x: val, y: idx } : { x: idx, y: val }, raw: val, formattedValue: String(val),
          cor: this.type === 'line' ? (ds.borderColor || '#888') : this._cor(ds, idx),
        };
      });
    }

    _mostrarTooltip() {
      const tip = this.tip;
      if (!tip) return;
      if (this.hover == null || !this.ptr) { tip.style.opacity = '0'; return; }
      const cfg = (this.options.plugins && this.options.plugins.tooltip) || {};
      const cb = cfg.callbacks || {};
      const itens = this._itensTooltip(this.hover);
      if (!itens.length) { tip.style.opacity = '0'; return; }

      const titulos = cb.title ? emArray(cb.title(itens)) : (this.type === 'doughnut' ? [] : emArray(itens[0].label));
      const linhas = itens.map(it => ({
        cor: it.cor,
        texto: cb.label
          ? emArray(cb.label(it)).join(' ')
          : this.type === 'doughnut'
            ? `${it.label}: ${Number(it.parsed).toLocaleString('pt-BR')}`
            : `${it.dataset.label ? it.dataset.label + ': ' : ''}${Number(it.raw).toLocaleString('pt-BR')}`,
      }));

      const tf = cfg.titleFont || {}, bf = cfg.bodyFont || {};
      const pad = cfg.padding != null ? cfg.padding : 10;
      Object.assign(tip.style, {
        background: cfg.backgroundColor || 'rgba(0,0,0,.85)',
        border: `${cfg.borderWidth || 0}px solid ${cfg.borderColor || 'transparent'}`,
        borderRadius: (cfg.cornerRadius != null ? cfg.cornerRadius : 8) + 'px',
        padding: pad + 'px',
        fontFamily: PADROES.font.family,
      });
      const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
      tip.innerHTML =
        titulos.map(t => `<div style="color:${cfg.titleColor || '#fff'};font:${tf.weight || 700} ${tf.size || 12}px ${PADROES.font.family};margin-bottom:6px">${esc(t)}</div>`).join('') +
        linhas.map(l => `<div style="display:flex;align-items:center;gap:8px;color:${cfg.bodyColor || '#fff'};font:${bf.weight || 600} ${bf.size || 12}px ${PADROES.font.family};line-height:1.5">` +
          `<span style="width:8px;height:8px;border-radius:50%;background:${l.cor};flex:none"></span><span>${esc(l.texto)}</span></div>`).join('');

      const tw = tip.offsetWidth, th = tip.offsetHeight;
      let x = this.ptr.x + 14, y = this.ptr.y - th - 12;
      if (x + tw > this.largura) x = this.ptr.x - tw - 14;
      x = limitar(x, 0, Math.max(0, this.largura - tw));
      if (y < 0) y = this.ptr.y + 18;
      y = limitar(y, 0, Math.max(0, this.altura - th));
      tip.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
      tip.style.opacity = '1';
    }

    /* ----- Interação ----- */
    _ligarEventos() {
      this._mover = e => {
        const r = this.canvas.getBoundingClientRect();
        this.ptr = { x: e.clientX - r.left, y: e.clientY - r.top };
        cancelAnimationFrame(this._rafHover);
        this._rafHover = requestAnimationFrame(() => this._atualizarHover());
      };
      this._sair = () => {
        this.ptr = null;
        this.canvas.style.cursor = '';
        if (this.hover != null) { this.hover = null; this._desenhar(); }
        this._mostrarTooltip();
      };
      this._clicar = e => {
        const r = this.canvas.getBoundingClientRect();
        const x = e.clientX - r.left, y = e.clientY - r.top;
        const alvo = this._hitsLegenda.find(h => x >= h.x && x <= h.x + h.w && y >= h.y && y <= h.y + h.h);
        if (!alvo) return;
        if (this.ocultos.has(alvo.idx)) this.ocultos.delete(alvo.idx); else this.ocultos.add(alvo.idx);
        this.hover = null;
        this.progresso = 1;
        this._desenhar();
        this._mostrarTooltip();
      };
      this.canvas.addEventListener('pointermove', this._mover);
      this.canvas.addEventListener('pointerdown', this._mover);
      this.canvas.addEventListener('pointerleave', this._sair);
      this.canvas.addEventListener('click', this._clicar);
    }

    _desligarEventos() {
      this.canvas.removeEventListener('pointermove', this._mover);
      this.canvas.removeEventListener('pointerdown', this._mover);
      this.canvas.removeEventListener('pointerleave', this._sair);
      this.canvas.removeEventListener('click', this._clicar);
    }

    _indiceSobPonteiro() {
      const { x, y } = this.ptr;
      const L = this._L;
      if (!L) return null;
      if (this.type === 'doughnut') {
        const dx = x - L.cx, dy = y - L.cy, d = Math.hypot(dx, dy);
        if (d < L.Ri || d > L.Ro + L.hoverOff || L.total <= 0) return null;
        const ang = (Math.atan2(dy, dx) + Math.PI / 2 + PI2) % PI2;
        let acum = 0;
        for (const f of L.fatias) {
          const span = f.a1 - f.a0;
          if (f.val > 0 && ang >= acum && ang < acum + span) return f.i;
          acum += span;
        }
        return null;
      }
      const a = L.area;
      if (x < a.left || x > a.right || y < a.top || y > a.bottom || !L.n) return null;
      const horizontal = L.horizontal;
      const pos = horizontal ? y - a.top : x - a.left;
      const tam = horizontal ? a.bottom - a.top : a.right - a.left;
      if (this.type === 'line') return L.n > 1 ? limitar(Math.round((pos / tam) * (L.n - 1)), 0, L.n - 1) : 0;
      return limitar(Math.floor((pos / tam) * L.n), 0, L.n - 1);
    }

    _atualizarHover() {
      if (this._destruido || !this.ptr) return;
      const { x, y } = this.ptr;
      const sobreLegenda = this._hitsLegenda.some(h => x >= h.x && x <= h.x + h.w && y >= h.y && y <= h.y + h.h);
      this.canvas.style.cursor = sobreLegenda ? 'pointer' : '';
      const novo = sobreLegenda ? null : this._indiceSobPonteiro();
      if (novo !== this.hover) { this.hover = novo; this.progresso = 1; cancelAnimationFrame(this._raf); this._desenhar(); }
      this._mostrarTooltip();
    }
  }

  Chart.defaults = PADROES;
  Chart.version = 'mini-1.0';

  // Redesenha quando as fontes da página terminam de carregar (medidas de texto corretas)
  if (document.fonts && document.fonts.addEventListener) {
    document.fonts.addEventListener('loadingdone', () => registro.forEach(c => { if (c.progresso >= 1) c._desenhar(); }));
  }

  window.Chart = Chart;
})();
