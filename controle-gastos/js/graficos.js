/**
 * graficos.js
 * Estilo único para todos os gráficos Chart.js do FinFlow:
 * cores lidas do tema ativo, tooltips personalizados e animações discretas.
 */

const Graficos = (() => {
  function lerCores() {
    const estilo = getComputedStyle(document.documentElement);
    const v = nome => estilo.getPropertyValue(nome).trim();
    const escuro = document.documentElement.getAttribute('data-tema') === 'dark';
    return {
      texto: v('--cor-texto-suave'),
      fraco: v('--cor-texto-fraco'),
      borda: v('--cor-borda'),
      superficie: v('--cor-superficie'),
      receita: v('--cor-receita'),
      despesa: v('--cor-despesa'),
      ouro: v('--cor-ouro'),
      primaria: v('--cor-interativa'),
      tooltipFundo: escuro ? '#213A2D' : '#10231B',
      tooltipBorda: escuro ? '#335646' : 'transparent',
    };
  }

  function configurarPadroes() {
    if (!window.Chart) return;
    const c = lerCores();
    Chart.defaults.font.family = "'Manrope', system-ui, sans-serif";
    Chart.defaults.font.size = 12;
    Chart.defaults.font.weight = 600;
    Chart.defaults.color = c.texto;
    if (Utils.reduzMovimento()) {
      Chart.defaults.animation = false;
    } else {
      Chart.defaults.animation = { duration: 800, easing: 'easeOutQuart' };
    }
  }

  function hexParaRgba(hex, alfa) {
    const h = hex.replace('#', '');
    const n = h.length === 3 ? h.split('').map(x => x + x).join('') : h;
    const r = parseInt(n.slice(0, 2), 16);
    const g = parseInt(n.slice(2, 4), 16);
    const b = parseInt(n.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alfa})`;
  }

  // preenchimento em degradê para gráficos de linha
  function degrade(cor) {
    return (contexto) => {
      const { chart } = contexto;
      const area = chart.chartArea;
      if (!area) return 'transparent';
      const g = chart.ctx.createLinearGradient(0, area.top, 0, area.bottom);
      g.addColorStop(0, hexParaRgba(cor, 0.22));
      g.addColorStop(1, hexParaRgba(cor, 0));
      return g;
    };
  }

  function moedaCurta(valor) {
    const n = Number(valor) || 0;
    if (Math.abs(n) >= 1000000) return `R$ ${(n / 1000000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mi`;
    if (Math.abs(n) >= 1000) return `R$ ${(n / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mil`;
    return `R$ ${n.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}`;
  }

  function tooltip(cores, callbacks = {}) {
    return {
      backgroundColor: cores.tooltipFundo,
      borderColor: cores.tooltipBorda,
      borderWidth: 1,
      titleColor: '#FFFFFF',
      bodyColor: '#E4EFE9',
      titleFont: { weight: 800, size: 12 },
      bodyFont: { weight: 600, size: 12 },
      padding: 12,
      cornerRadius: 12,
      boxPadding: 6,
      usePointStyle: true,
      caretSize: 6,
      callbacks,
    };
  }

  function legenda(cores, mostrar = true, posicao = 'bottom') {
    return {
      display: mostrar,
      position: posicao,
      align: 'start',
      labels: { color: cores.texto, usePointStyle: true, pointStyle: 'rectRounded', boxWidth: 9, boxHeight: 9, padding: 16, font: { size: 12, weight: 600 } },
    };
  }

  function eixos(cores, { moeda = true, porcentagem = false, horizontal = false } = {}) {
    const formatador = porcentagem ? (v => `${v}%`) : moeda ? (v => moedaCurta(v)) : undefined;
    const categoria = { ticks: { color: cores.texto }, grid: { display: false }, border: { display: false } };
    const valor = {
      ticks: { color: cores.fraco, padding: 8, callback: formatador },
      grid: { color: cores.borda, drawTicks: false },
      border: { display: false },
      beginAtZero: true,
    };
    return horizontal ? { x: valor, y: categoria } : { x: categoria, y: valor };
  }

  function base(cores, { legendaVisivel = true, callbacksTooltip = {}, escalas, extras = {} } = {}) {
    return {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: { legend: legenda(cores, legendaVisivel), tooltip: tooltip(cores, callbacksTooltip) },
      scales: escalas,
      ...extras,
    };
  }

  function aoMudarTema(fn) {
    document.addEventListener('finflow:tema', () => { configurarPadroes(); fn(); });
  }

  return { lerCores, configurarPadroes, degrade, moedaCurta, tooltip, legenda, eixos, base, aoMudarTema, hexParaRgba };
})();
