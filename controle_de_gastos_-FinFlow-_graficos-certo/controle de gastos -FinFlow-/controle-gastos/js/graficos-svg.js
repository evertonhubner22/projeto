/**
 * graficos-svg.js
 * Gráficos em SVG puro (JavaScript sem bibliotecas, sem CDN).
 * Substitui o Chart.js na página de Relatórios.
 *
 * Tipos:
 *   GraficosSVG.barras(container, opts)             → barras agrupadas (vertical)
 *   GraficosSVG.linha(container, opts)              → linhas com área em degradê
 *   GraficosSVG.rosca(container, opts)              → rosca (doughnut)
 *   GraficosSVG.barrasHorizontais(container, opts)  → barras horizontais (ex.: metas)
 *
 * Todos retornam { destroy() } e se redesenham sozinhos quando o contêiner muda de tamanho.
 * As cores vêm de Graficos.lerCores() (tema claro/escuro do FinFlow).
 *
 * Depende de: graficos.js (Graficos.lerCores, Graficos.moedaCurta).
 */

const GraficosSVG = (() => {
  const NS = 'http://www.w3.org/2000/svg';
  const FONTE = "600 12px Manrope, system-ui, sans-serif";
  let contador = 0;
  let ctxMedida = null;

  /* ---------- Utilidades ---------- */
  function el(tag, atributos, pai) {
    const no = document.createElementNS(NS, tag);
    if (atributos) {
      for (const k in atributos) {
        if (atributos[k] !== null && atributos[k] !== undefined) no.setAttribute(k, atributos[k]);
      }
    }
    if (pai) pai.appendChild(no);
    return no;
  }

  function esc(texto) {
    return String(texto == null ? '' : texto)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function medir(texto) {
    if (!ctxMedida) ctxMedida = document.createElement('canvas').getContext('2d');
    ctxMedida.font = FONTE;
    return ctxMedida.measureText(String(texto)).width;
  }

  function reduzMovimento() {
    return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }

  function coresAtuais(opts) {
    return opts.cores || (typeof Graficos !== 'undefined' ? Graficos.lerCores() : {
      texto: '#587066', fraco: '#8A9C93', borda: '#E1E8E3', superficie: '#FFFFFF',
      receita: '#1F7A55', despesa: '#BF4F48', ouro: '#C9A24A', primaria: '#1F7A55',
      tooltipFundo: '#10231B', tooltipBorda: 'transparent',
    });
  }

  function moedaCurta(v) {
    if (typeof Graficos !== 'undefined' && Graficos.moedaCurta) return Graficos.moedaCurta(v);
    return `R$ ${Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 0 })}`;
  }

  function hexParaRgba(hex, alfa) {
    const h = String(hex).replace('#', '');
    if (h.length !== 3 && h.length !== 6) return hex;
    const n = h.length === 3 ? h.split('').map(x => x + x).join('') : h;
    return `rgba(${parseInt(n.slice(0, 2), 16)}, ${parseInt(n.slice(2, 4), 16)}, ${parseInt(n.slice(4, 6), 16)}, ${alfa})`;
  }

  // Escala "bonita": 0, passo, 2*passo ... topo
  function escala(max, alvo = 4) {
    if (!(max > 0)) return { topo: 100, ticks: [0, 25, 50, 75, 100] };
    const bruto = max / alvo;
    const exp = Math.pow(10, Math.floor(Math.log10(bruto)));
    const f = bruto / exp;
    const m = f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10;
    const passo = m * exp;
    const topo = Math.ceil(max / passo - 1e-9) * passo;
    const ticks = [];
    for (let v = 0; v <= topo + passo / 1000; v += passo) ticks.push(Number(v.toFixed(6)));
    return { topo, ticks };
  }

  // Curva suave que não "ultrapassa" os pontos (monotone cubic)
  function caminhoSuave(pts) {
    const n = pts.length;
    if (n === 0) return '';
    if (n === 1) return `M${pts[0].x},${pts[0].y}`;
    const dx = [], m = [], t = new Array(n);
    for (let i = 0; i < n - 1; i++) {
      dx[i] = pts[i + 1].x - pts[i].x;
      m[i] = (pts[i + 1].y - pts[i].y) / dx[i];
    }
    t[0] = m[0];
    t[n - 1] = m[n - 2];
    for (let i = 1; i < n - 1; i++) t[i] = m[i - 1] * m[i] <= 0 ? 0 : (m[i - 1] + m[i]) / 2;
    for (let i = 0; i < n - 1; i++) {
      if (m[i] === 0) { t[i] = 0; t[i + 1] = 0; continue; }
      const a = t[i] / m[i], b = t[i + 1] / m[i], s = a * a + b * b;
      if (s > 9) { const k = 3 / Math.sqrt(s); t[i] = k * a * m[i]; t[i + 1] = k * b * m[i]; }
    }
    let d = `M${pts[0].x},${pts[0].y}`;
    for (let i = 0; i < n - 1; i++) {
      const h = dx[i] / 3;
      d += ` C${pts[i].x + h},${pts[i].y + t[i] * h} ${pts[i + 1].x - h},${pts[i + 1].y - t[i + 1] * h} ${pts[i + 1].x},${pts[i + 1].y}`;
    }
    return d;
  }

  function barraTopoArredondado(x, y, larg, alt, raio) {
    const r = Math.max(0, Math.min(raio, larg / 2, alt));
    if (r === 0) return `M${x},${y + alt} V${y} H${x + larg} V${y + alt} Z`;
    return `M${x},${y + alt} V${y + r} Q${x},${y} ${x + r},${y} H${x + larg - r} Q${x + larg},${y} ${x + larg},${y + r} V${y + alt} Z`;
  }

  function arco(cx, cy, R, r, a0, a1) {
    const grande = a1 - a0 > Math.PI ? 1 : 0;
    const p = (raio, a) => [cx + raio * Math.cos(a), cy + raio * Math.sin(a)];
    const [x0, y0] = p(R, a0), [x1, y1] = p(R, a1), [x2, y2] = p(r, a1), [x3, y3] = p(r, a0);
    return `M${x0},${y0} A${R},${R} 0 ${grande} 1 ${x1},${y1} L${x2},${y2} A${r},${r} 0 ${grande} 0 ${x3},${y3} Z`;
  }

  // Corta o texto com "…" até caber na largura
  function ajustarTexto(texto, largura) {
    let t = String(texto);
    if (medir(t) <= largura) return t;
    while (t.length > 1 && medir(t + '…') > largura) t = t.slice(0, -1);
    return t.trimEnd() + '…';
  }

  // Índices dos rótulos do eixo X a exibir (evita sobreposição)
  function passoRotulos(n, larguraUtil, larguraRotulo) {
    const cabem = Math.max(1, Math.floor(larguraUtil / (larguraRotulo + 14)));
    return Math.max(1, Math.ceil(n / cabem));
  }

  /* ---------- Tooltip ---------- */
  function mostrarTip(tip, area, html, clientX, clientY) {
    tip.innerHTML = html;
    tip.classList.add('gsvg__tip--visivel');
    const r = area.getBoundingClientRect();
    const w = tip.offsetWidth, h = tip.offsetHeight;
    let x = clientX - r.left + 14;
    let y = clientY - r.top - 12;
    if (x + w > r.width) x = clientX - r.left - w - 14;
    if (x < 0) x = 4;
    if (y + h > r.height) y = r.height - h - 4;
    if (y < 0) y = 4;
    tip.style.transform = `translate(${x}px, ${y}px)`;
  }

  function esconderTip(tip) {
    tip.classList.remove('gsvg__tip--visivel');
  }

  function linhaTip(cor, texto) {
    return `<div class="gsvg__tip-linha"><span class="gsvg__tip-ponto" style="background:${esc(cor)}"></span><span>${esc(texto)}</span></div>`;
  }

  /* ---------- Estrutura comum ---------- */
  function montar(container, opts, cores, desenhar) {
    if (!container) throw new Error('GraficosSVG: contêiner não encontrado');
    container.innerHTML = '';
    container.classList.add('gsvg');

    const area = document.createElement('div');
    area.className = 'gsvg__area';
    container.appendChild(area);

    const tip = document.createElement('div');
    tip.className = 'gsvg__tip';
    tip.style.background = cores.tooltipFundo;
    tip.style.boxShadow = cores.tooltipBorda && cores.tooltipBorda !== 'transparent' ? `inset 0 0 0 1px ${cores.tooltipBorda}` : 'none';
    area.appendChild(tip);

    if (opts.legenda && opts.legenda.length) {
      const lg = document.createElement('div');
      lg.className = 'gsvg__legenda';
      lg.innerHTML = opts.legenda
        .map(i => `<span class="gsvg__item"><span class="gsvg__ponto" style="background:${esc(i.cor)}"></span>${esc(i.label)}</span>`)
        .join('');
      container.appendChild(lg);
    }

    let primeiro = true, vivo = true, quadro = 0, ultW = 0, ultH = 0;

    const render = () => {
      if (!vivo) return;
      const w = area.clientWidth, h = area.clientHeight;
      if (w < 10 || h < 10) return;
      ultW = w; ultH = h;

      const antigo = area.querySelector('svg');
      if (antigo) antigo.remove();
      esconderTip(tip);

      const svg = el('svg', { width: w, height: h, viewBox: `0 0 ${w} ${h}`, role: 'img', 'aria-label': opts.titulo || 'Gráfico' });
      if (opts.animar && primeiro && !reduzMovimento()) svg.setAttribute('class', 'gsvg--anima');
      area.insertBefore(svg, tip);
      desenhar({ svg, w, h, area, tip });
      primeiro = false;
    };

    let ro = null;
    if (window.ResizeObserver) {
      ro = new ResizeObserver(() => {
        cancelAnimationFrame(quadro);
        quadro = requestAnimationFrame(() => {
          if (area.clientWidth !== ultW || area.clientHeight !== ultH) render();
        });
      });
      ro.observe(area);
    }
    render();

    return {
      destroy() {
        vivo = false;
        if (ro) ro.disconnect();
        cancelAnimationFrame(quadro);
        container.innerHTML = '';
      },
    };
  }

  function mensagemVazia(svg, w, h, cores, texto) {
    const t = el('text', { x: w / 2, y: h / 2, 'text-anchor': 'middle', 'dominant-baseline': 'middle', fill: cores.fraco }, svg);
    t.textContent = texto || 'Sem dados para exibir';
  }

  // Eixo Y + grade horizontal. Retorna a área de plotagem.
  function eixoVertical(svg, w, h, cores, esc_, formatoEixo, rotulosX, passoX) {
    const rotY = esc_.ticks.map(t => formatoEixo(t));
    const larguraY = Math.max(...rotY.map(medir));
    const esq = Math.ceil(larguraY) + 14;
    const dir = 8, topo = 10, base = 28;
    const plotW = Math.max(10, w - esq - dir);
    const plotH = Math.max(10, h - topo - base);
    const yDe = v => topo + plotH * (1 - v / esc_.topo);

    esc_.ticks.forEach((t, i) => {
      const y = yDe(t);
      el('line', { x1: esq, x2: esq + plotW, y1: y, y2: y, stroke: cores.borda, 'stroke-width': 1 }, svg);
      const tx = el('text', { x: esq - 8, y, 'text-anchor': 'end', 'dominant-baseline': 'middle', fill: cores.fraco }, svg);
      tx.textContent = rotY[i];
    });

    const n = rotulosX.length;
    const banda = plotW / n;
    rotulosX.forEach((rot, i) => {
      if (i % passoX !== 0) return;
      const tx = el('text', { x: esq + banda * (i + 0.5), y: h - 8, 'text-anchor': 'middle', fill: cores.texto }, svg);
      tx.textContent = rot;
    });

    return { esq, topo, plotW, plotH, banda, yDe };
  }

  /* ---------- Barras (vertical, agrupadas) ---------- */
  function barras(container, opts) {
    const cores = coresAtuais(opts);
    const fmt = opts.formato || (v => String(v));
    const fmtEixo = opts.formatoEixo || moedaCurta;
    const series = opts.series || [];
    const labels = opts.labels || [];
    const legenda = opts.legenda ? series.map(s => ({ label: s.label, cor: s.cor })) : null;

    return montar(container, { ...opts, legenda }, cores, ({ svg, w, h, area, tip }) => {
      const n = labels.length;
      if (!n) return mensagemVazia(svg, w, h, cores, opts.mensagemVazia);

      const max = Math.max(0, ...series.flatMap(s => s.data.map(Number)));
      const esc_ = escala(max);
      const larguraRot = Math.max(...labels.map(medir));
      const g = eixoVertical(svg, w, h, cores, esc_, fmtEixo, labels, 1);
      // reescreve rótulos X com passo adequado (remove os que foram todos desenhados)
      const passo = passoRotulos(n, g.plotW, larguraRot);
      if (passo > 1) {
        const textos = svg.querySelectorAll('text[text-anchor="middle"]');
        textos.forEach((t, i) => { if (i % passo !== 0) t.remove(); });
      }

      const destaque = el('rect', { y: g.topo, height: g.plotH, rx: 8, fill: cores.borda, opacity: 0.45, display: 'none' }, svg);
      const k = series.length;
      const maxBarra = opts.maxBarra || 40;
      const folga = 3;
      const grupo = Math.min(g.banda * 0.72, k * maxBarra + (k - 1) * folga);
      const larg = (grupo - (k - 1) * folga) / k;

      labels.forEach((_, i) => {
        const x0 = g.esq + i * g.banda + (g.banda - grupo) / 2;
        series.forEach((s, j) => {
          const v = Number(s.data[i]) || 0;
          const alt = g.plotH * (v / esc_.topo);
          if (alt <= 0) return;
          el('path', {
            d: barraTopoArredondado(x0 + j * (larg + folga), g.yDe(v), larg, alt, 7),
            fill: s.cor, class: 'gsvg__barra',
          }, svg);
        });
      });

      labels.forEach((rot, i) => {
        const hit = el('rect', { x: g.esq + i * g.banda, y: g.topo, width: g.banda, height: g.plotH, fill: 'transparent', class: 'gsvg__hit' }, svg);
        const abrir = (ev) => {
          destaque.setAttribute('x', g.esq + i * g.banda + 2);
          destaque.setAttribute('width', Math.max(0, g.banda - 4));
          destaque.setAttribute('display', 'block');
          const html = `<strong>${esc(rot)}</strong>` + series.map(s => linhaTip(s.cor, `${s.label}: ${fmt(Number(s.data[i]) || 0)}`)).join('');
          mostrarTip(tip, area, html, ev.clientX, ev.clientY);
        };
        hit.addEventListener('pointerenter', abrir);
        hit.addEventListener('pointermove', abrir);
        hit.addEventListener('pointerleave', () => { destaque.setAttribute('display', 'none'); esconderTip(tip); });
      });
    });
  }

  /* ---------- Linha ---------- */
  function linha(container, opts) {
    const cores = coresAtuais(opts);
    const fmt = opts.formato || (v => String(v));
    const fmtEixo = opts.formatoEixo || moedaCurta;
    const series = opts.series || [];
    const labels = opts.labels || [];
    const legenda = opts.legenda ? series.map(s => ({ label: s.label, cor: s.cor })) : null;

    return montar(container, { ...opts, legenda }, cores, ({ svg, w, h, area, tip }) => {
      const n = labels.length;
      if (!n) return mensagemVazia(svg, w, h, cores, opts.mensagemVazia);

      const max = Math.max(0, ...series.flatMap(s => s.data.map(Number)));
      const esc_ = escala(max);
      const larguraRot = Math.max(...labels.map(medir));
      const g = eixoVertical(svg, w, h, cores, esc_, fmtEixo, labels, 1);
      const passo = passoRotulos(n, g.plotW, larguraRot);
      if (passo > 1) {
        svg.querySelectorAll('text[text-anchor="middle"]').forEach((t, i) => { if (i % passo !== 0) t.remove(); });
      }

      const idBase = `gsvg-${++contador}`;
      const defs = el('defs', null, svg);
      series.forEach((s, j) => {
        const gr = el('linearGradient', { id: `${idBase}-${j}`, x1: 0, y1: 0, x2: 0, y2: 1 }, defs);
        el('stop', { offset: '0%', 'stop-color': s.cor, 'stop-opacity': 0.22 }, gr);
        el('stop', { offset: '100%', 'stop-color': s.cor, 'stop-opacity': 0 }, gr);
      });

      const guia = el('line', { y1: g.topo, y2: g.topo + g.plotH, stroke: cores.borda, 'stroke-width': 1, display: 'none' }, svg);
      const base = g.topo + g.plotH;
      const pontosPorSerie = series.map(s => s.data.map((v, i) => ({ x: g.esq + g.banda * (i + 0.5), y: g.yDe(Number(v) || 0) })));

      series.forEach((s, j) => {
        const pts = pontosPorSerie[j];
        const d = caminhoSuave(pts);
        if (pts.length > 1) {
          el('path', {
            d: `${d} L${pts[pts.length - 1].x},${base} L${pts[0].x},${base} Z`,
            fill: `url(#${idBase}-${j})`, stroke: 'none', class: 'gsvg__area-linha',
          }, svg);
        }
        el('path', {
          d, fill: 'none', stroke: s.cor, 'stroke-width': 2.5, 'stroke-linecap': 'round', 'stroke-linejoin': 'round',
          pathLength: 1, class: 'gsvg__linha',
        }, svg);
      });

      const circulos = series.map((s, j) => pontosPorSerie[j].map(p =>
        el('circle', { cx: p.x, cy: p.y, r: 3, fill: cores.superficie, stroke: s.cor, 'stroke-width': 2, class: 'gsvg__ponto-linha' }, svg)));

      labels.forEach((rot, i) => {
        const cx = g.esq + g.banda * (i + 0.5);
        const hit = el('rect', { x: g.esq + i * g.banda, y: g.topo, width: g.banda, height: g.plotH, fill: 'transparent', class: 'gsvg__hit' }, svg);
        const abrir = (ev) => {
          guia.setAttribute('x1', cx); guia.setAttribute('x2', cx); guia.setAttribute('display', 'block');
          circulos.forEach(lista => lista.forEach((c, idx) => c.setAttribute('r', idx === i ? 6 : 3)));
          const html = `<strong>${esc(rot)}</strong>` + series.map(s => linhaTip(s.cor, `${s.label}: ${fmt(Number(s.data[i]) || 0)}`)).join('');
          mostrarTip(tip, area, html, ev.clientX, ev.clientY);
        };
        const fechar = () => {
          guia.setAttribute('display', 'none');
          circulos.forEach(lista => lista.forEach(c => c.setAttribute('r', 3)));
          esconderTip(tip);
        };
        hit.addEventListener('pointerenter', abrir);
        hit.addEventListener('pointermove', abrir);
        hit.addEventListener('pointerleave', fechar);
      });
    });
  }

  /* ---------- Rosca ---------- */
  function rosca(container, opts) {
    const cores = coresAtuais(opts);
    const labels = opts.labels || [];
    const valores = (opts.valores || []).map(v => Math.max(0, Number(v) || 0));
    const corte = opts.corte || 0.68;
    const legenda = opts.legenda ? labels.map((l, i) => ({ label: l, cor: opts.cores_fatias[i] })) : null;
    const rotuloTip = opts.rotuloTip || ((label, valor) => `${label}: ${valor}`);

    return montar(container, { ...opts, legenda }, cores, ({ svg, w, h, area, tip }) => {
      const total = valores.reduce((a, b) => a + b, 0);
      if (total <= 0) return mensagemVazia(svg, w, h, cores, opts.mensagemVazia);

      const cx = w / 2, cy = h / 2;
      const R = Math.max(10, Math.min(w, h) / 2 - 6);
      const r = R * corte;
      const grupo = el('g', { class: 'gsvg__rosca' }, svg);

      const ativas = valores.map((v, i) => ({ v, i })).filter(x => x.v > 0);
      let ang = -Math.PI / 2;

      const ligarTip = (no, i, pct, meio) => {
        const abrir = (ev) => {
          no.style.transform = `translate(${Math.cos(meio) * 4}px, ${Math.sin(meio) * 4}px)`;
          mostrarTip(tip, area, `<div>${esc(rotuloTip(labels[i], valores[i], pct))}</div>`, ev.clientX, ev.clientY);
        };
        no.addEventListener('pointerenter', abrir);
        no.addEventListener('pointermove', abrir);
        no.addEventListener('pointerleave', () => { no.style.transform = ''; esconderTip(tip); });
      };

      if (ativas.length === 1) {
        const { i } = ativas[0];
        const anel = el('circle', {
          cx, cy, r: (R + r) / 2, fill: 'none', stroke: opts.cores_fatias[i], 'stroke-width': R - r, class: 'gsvg__fatia',
        }, grupo);
        ligarTip(anel, i, 100, -Math.PI / 2);
        return;
      }

      ativas.forEach(({ v, i }) => {
        const delta = (v / total) * Math.PI * 2;
        const a0 = ang, a1 = ang + delta;
        ang = a1;
        const fatia = el('path', {
          d: arco(cx, cy, R, r, a0, a1),
          fill: opts.cores_fatias[i], stroke: opts.corBorda || cores.superficie, 'stroke-width': 3, 'stroke-linejoin': 'round',
          class: 'gsvg__fatia',
        }, grupo);
        ligarTip(fatia, i, Math.round((v / total) * 100), (a0 + a1) / 2);
      });
    });
  }

  /* ---------- Barras horizontais ---------- */
  function barrasHorizontais(container, opts) {
    const cores = coresAtuais(opts);
    const labels = opts.labels || [];
    const valores = (opts.valores || []).map(v => Number(v) || 0);
    const max = opts.max || 100;
    const fmtTick = opts.formatoEixo || (v => `${v}%`);

    return montar(container, opts, cores, ({ svg, w, h, area, tip }) => {
      const n = labels.length;
      if (!n) return mensagemVazia(svg, w, h, cores, opts.mensagemVazia);

      const esq = Math.min(Math.ceil(Math.max(...labels.map(medir))) + 14, Math.round(w * 0.4));
      const dir = 16, topo = 6, base = 28;
      const plotW = Math.max(10, w - esq - dir);
      const plotH = Math.max(10, h - topo - base);
      const banda = plotH / n;
      const xDe = v => esq + plotW * (Math.min(v, max) / max);

      // passo "redondo" que cabe na largura (ex.: 0–100% de 25 em 25)
      const maxTicks = plotW >= 300 ? 5 : plotW >= 150 ? 4 : 2;
      const passos = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 5000];
      const passoTick = passos.find(p => max / p <= maxTicks) || max;
      for (let v = 0; v <= max + 1e-9; v += passoTick) {
        const x = xDe(v);
        el('line', { x1: x, x2: x, y1: topo, y2: topo + plotH, stroke: cores.borda, 'stroke-width': 1 }, svg);
        const t = el('text', { x, y: h - 8, 'text-anchor': 'middle', fill: cores.fraco }, svg);
        t.textContent = fmtTick(Math.round(v));
      }

      const destaque = el('rect', { x: 0, width: w, height: banda, rx: 8, fill: cores.borda, opacity: 0.45, display: 'none' }, svg);
      const espessura = Math.min(16, banda * 0.7);
      const labelsCompletosOuRot = (i, rot) => (opts.labelsCompletos && opts.labelsCompletos[i]) || rot;

      labels.forEach((rot, i) => {
        const yc = topo + banda * (i + 0.5);
        const t = el('text', { x: esq - 10, y: yc, 'text-anchor': 'end', 'dominant-baseline': 'middle', fill: cores.texto }, svg);
        t.textContent = ajustarTexto(labelsCompletosOuRot(i, rot), esq - 14);
        const larg = xDe(valores[i]) - esq;
        if (larg > 0) {
          el('rect', {
            x: esq, y: yc - espessura / 2, width: larg, height: espessura, rx: Math.min(7, espessura / 2, larg / 2),
            fill: (opts.cores_barras && opts.cores_barras[i]) || cores.receita, class: 'gsvg__barra-h',
          }, svg);
        }
      });

      labels.forEach((rot, i) => {
        const hit = el('rect', { x: 0, y: topo + banda * i, width: w, height: banda, fill: 'transparent', class: 'gsvg__hit' }, svg);
        const abrir = (ev) => {
          destaque.setAttribute('y', topo + banda * i);
          destaque.setAttribute('display', 'block');
          const titulo = (opts.labelsCompletos && opts.labelsCompletos[i]) || rot;
          const texto = opts.rotuloTip ? opts.rotuloTip(i) : `${valores[i]}%`;
          mostrarTip(tip, area, `<strong>${esc(titulo)}</strong><div>${esc(texto)}</div>`, ev.clientX, ev.clientY);
        };
        hit.addEventListener('pointerenter', abrir);
        hit.addEventListener('pointermove', abrir);
        hit.addEventListener('pointerleave', () => { destaque.setAttribute('display', 'none'); esconderTip(tip); });
      });
    });
  }

  return { barras, linha, rosca, barrasHorizontais, hexParaRgba };
})();
