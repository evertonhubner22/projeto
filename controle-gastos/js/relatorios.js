/**
 * relatorios.js
 * Agrega receitas/despesas por período e renderiza os gráficos analíticos.
 * Períodos: 7 dias, mês único, 3 meses, 6 meses e 12 meses.
 * Seções: "Análise do período" (com filtro) e "Visão geral" (sem período).
 */

let usuarioAtual = null;
let graficosPeriodo = [];
let graficosVisaoGeral = [];
let animarGraficos = true;

document.addEventListener('DOMContentLoaded', () => {
  usuarioAtual = App.initPaginaInterna();
  if (!usuarioAtual) return;

  Graficos.configurarPadroes();

  document.getElementById('mes-unico-input').value = Utils.mesISO();

  document.querySelectorAll('#segmento-periodo [data-periodo]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#segmento-periodo [data-periodo]').forEach(b => b.classList.remove('segmentado__item--ativo'));
      btn.classList.add('segmentado__item--ativo');
      document.getElementById('filtro-periodo').value = btn.dataset.periodo;
      animarGraficos = true;
      renderizarRelatorios();
    });
  });
  document.getElementById('mes-unico-input').addEventListener('change', () => { animarGraficos = true; renderizarRelatorios(); });

  renderizarVisaoGeral();
  renderizarRelatorios();

  Graficos.aoMudarTema(() => {
    animarGraficos = false;
    renderizarVisaoGeral();
    renderizarRelatorios();
  });
});

function filtrarPorMes(lista, anoMes) {
  return lista.filter(item => item.data && item.data.slice(0, 7) === anoMes);
}

function somar(lista) {
  return lista.reduce((total, item) => total + Number(item.valor || 0), 0);
}

function destruirGraficos(lista) {
  (lista || []).forEach(g => g.destroy());
  if (lista) lista.length = 0;
}

function extras() {
  return animarGraficos ? {} : { animation: false };
}

function estadoVazio(icone, titulo, texto) {
  return `<div class="estado-vazio estado-vazio--compacto"><div class="estado-vazio__icone">${Utils.icone(icone)}</div><h3>${titulo}</h3><p>${texto}</p></div>`;
}

const NOMES_MES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

/* ---------- Períodos ---------- */

function obterIntervalo(filtro, mesInput) {
  const hoje = new Date();
  const Y = hoje.getFullYear();
  const M = hoje.getMonth() + 1;

  if (filtro === 'semanal') {
    const d = new Date(hoje);
    d.setDate(d.getDate() - 6);
    return { inicio: Utils.hojeISO(d), fim: Utils.hojeISO(hoje) };
  }

  if (filtro === 'mes') {
    const alvo = mesInput || `${Y}-${String(M).padStart(2, '0')}`;
    const [ay, mm] = alvo.split('-').map(Number);
    const inicio = `${ay}-${String(mm).padStart(2, '0')}-01`;
    const fim = `${ay}-${String(mm).padStart(2, '0')}-${String(new Date(ay, mm, 0).getDate()).padStart(2, '0')}`;
    return { inicio, fim };
  }

  let n;
  if (filtro === 'trimestral') n = 3;
  else if (filtro === 'semestral') n = 6;
  else if (filtro === 'anual') n = 12;
  else n = 6;

  const dIni = new Date(Y, M - (n - 1), 1);
  const inicio = `${dIni.getFullYear()}-${String(dIni.getMonth() + 1).padStart(2, '0')}-01`;
  const fim = `${Y}-${String(M).padStart(2, '0')}-${String(new Date(Y, M, 0).getDate()).padStart(2, '0')}`;
  return { inicio, fim };
}

function filtrarPorIntervalo(lista, inicio, fim) {
  return lista.filter(item => item.data && item.data >= inicio && item.data <= fim);
}

function rotuloSubPeriodo(chave, modoSub) {
  if (modoSub === 'mes') {
    const [y, m] = chave.split('-');
    return `${NOMES_MES[Number(m) - 1]}/${y.slice(2)}`;
  }
  const [, m, d] = chave.split('-').map(Number);
  return `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}`;
}

/* ---------- Seção: Análise do período ---------- */

function renderizarRelatorios() {
  destruirGraficos(graficosPeriodo);

  const filtro = document.getElementById('filtro-periodo').value;
  const mesVal = document.getElementById('mes-unico-input').value;
  document.getElementById('campo-mes-unico').classList.toggle('oculto', filtro !== 'mes');

  const { inicio, fim } = obterIntervalo(filtro, mesVal);
  document.getElementById('periodo-ativo').textContent = `${Utils.formatarData(inicio)} a ${Utils.formatarData(fim)}`;

  const receitas = filtrarPorIntervalo(Storage.Receitas.listar(usuarioAtual.id), inicio, fim);
  const despesas = filtrarPorIntervalo(Storage.Despesas.listar(usuarioAtual.id), inicio, fim);
  const totalReceitas = somar(receitas);
  const totalDespesas = somar(despesas);
  const economia = totalReceitas - totalDespesas;
  const cores = Graficos.lerCores();

  const modoSub = (filtro === 'semanal' || filtro === 'mes') ? 'dia' : 'mes';
  const agrupar = (lista) => {
    const grupos = {};
    lista.forEach(i => {
      const chave = modoSub === 'mes' ? i.data.slice(0, 7) : i.data;
      grupos[chave] = (grupos[chave] || 0) + Number(i.valor || 0);
    });
    return grupos;
  };
  const recMap = agrupar(receitas);
  const despMap = agrupar(despesas);

  renderKpis({ totalReceitas, totalDespesas, economia });

  /* Receitas x Despesas (comparativo por sub-período) */
  {
    const resEl = document.getElementById('resumo-receitas-despesas');
    let frase = 'Receitas e despesas iguais no período';
    if (totalReceitas > totalDespesas) frase = `Receitas maiores que as despesas em ${Utils.formatarMoeda(totalReceitas - totalDespesas)}`;
    else if (totalDespesas > totalReceitas) frase = `Despesas maiores que as receitas em ${Utils.formatarMoeda(totalDespesas - totalReceitas)}`;
    resEl.textContent = frase;

    const chaves = [...new Set([...Object.keys(recMap), ...Object.keys(despMap)])].sort();
    graficosPeriodo.push(new Chart(document.getElementById('grafico-receitas-despesas'), {
      type: 'bar',
      data: {
        labels: chaves.map(c => rotuloSubPeriodo(c, modoSub)),
        datasets: [
          { label: 'Receitas', data: chaves.map(c => recMap[c] || 0), backgroundColor: cores.receita, borderRadius: 7, borderSkipped: false, barPercentage: 0.8, categoryPercentage: 0.7 },
          { label: 'Despesas', data: chaves.map(c => despMap[c] || 0), backgroundColor: cores.despesa, borderRadius: 7, borderSkipped: false, barPercentage: 0.8, categoryPercentage: 0.7 },
        ],
      },
      options: Graficos.base(cores, {
        callbacksTooltip: { label: (ctx) => `${ctx.dataset.label}: ${Utils.formatarMoeda(ctx.parsed.y || 0)}` },
        escalas: Graficos.eixos(cores),
        extras: extras(),
      }),
    }));
  }

  /* Gastos por categoria */
  {
    const porCategoria = {};
    despesas.forEach(d => { porCategoria[d.categoria] = (porCategoria[d.categoria] || 0) + Number(d.valor); });
    const categorias = Object.keys(porCategoria).sort((a, b) => porCategoria[b] - porCategoria[a]);
    const total = totalDespesas;
    const area = document.getElementById('area-categorias');
    const vazio = document.getElementById('vazio-categorias');

    if (total <= 0 || categorias.length === 0) {
      area.classList.add('oculto');
      vazio.classList.remove('oculto');
      vazio.innerHTML = estadoVazio('pie-chart', 'Sem despesas no período', 'Nenhum gasto foi registrado neste intervalo.');
    } else {
      area.classList.remove('oculto');
      vazio.classList.add('oculto');
      const corCat = categorias.map(c => Utils.infoCategoria(c).cor);

      graficosPeriodo.push(new Chart(document.getElementById('grafico-categoria-pizza'), {
        type: 'doughnut',
        data: { labels: categorias, datasets: [{ data: categorias.map(c => porCategoria[c]), backgroundColor: corCat, borderColor: cores.superficie, borderWidth: 3, borderRadius: 5, hoverOffset: 4 }] },
        options: {
          responsive: true, maintainAspectRatio: false, cutout: '68%',
          plugins: {
            legend: { display: false },
            tooltip: Graficos.tooltip(cores, {
              label: (ctx) => {
                const val = Number(ctx.parsed) || 0;
                const pct = total > 0 ? Math.round((val / total) * 100) : 0;
                return `${ctx.label}: ${Utils.formatarMoeda(val)} (${pct}%)`;
              },
            }),
          },
          ...extras(),
        },
      }));

      document.getElementById('legenda-categorias').innerHTML = categorias.slice(0, 6).map((c, i) => `
        <div class="legenda__item"><span class="legenda__ponto" style="--ponto:${corCat[i]}"></span>${Utils.esc(c)}<span class="legenda__valor mono">${Math.round((porCategoria[c] / total) * 100)}%</span></div>
      `).join('');
    }
  }

  /* Economia */
  {
    const area = document.getElementById('area-economia');
    const vazio = document.getElementById('vazio-economia');
    const resEl = document.getElementById('resumo-economia');

    if (totalReceitas <= 0) {
      area.classList.add('oculto');
      vazio.classList.remove('oculto');
      vazio.innerHTML = estadoVazio('piggy-bank', 'Sem receitas no período', 'Não há receitas para calcular a economia.');
    } else {
      area.classList.remove('oculto');
      vazio.classList.add('oculto');
      const economiaPizza = economia > 0 ? economia : 0;
      graficosPeriodo.push(new Chart(document.getElementById('grafico-economia-area'), {
        type: 'doughnut',
        data: { labels: ['Despesas', 'Economia'], datasets: [{ data: [totalDespesas, economiaPizza], backgroundColor: [cores.despesa, cores.receita], borderColor: cores.superficie, borderWidth: 3, borderRadius: 5, hoverOffset: 4 }] },
        options: {
          responsive: true, maintainAspectRatio: false, cutout: '68%',
          plugins: {
            legend: Graficos.legenda(cores, true, 'bottom'),
            tooltip: Graficos.tooltip(cores, { label: (ctx) => `${ctx.label}: ${Utils.formatarMoeda(Number(ctx.parsed) || 0)}` }),
          },
          ...extras(),
        },
      }));

      resEl.innerHTML = economia < 0
        ? `<div class="insight insight--negativo insight--estatico"><span class="insight__icone">${Utils.icone('triangle-alert')}</span><span>Sem economia: as despesas superaram as receitas em ${Utils.formatarMoeda(-economia)}.</span></div>`
        : `<strong class="valor-monetario">${Utils.formatarMoeda(economia)}</strong><small>economizados no período</small>`;
    }
  }

  /* Receitas / Despesas no período */
  document.getElementById('total-receitas-periodo').textContent = Utils.formatarMoeda(totalReceitas);
  document.getElementById('total-despesas-periodo').textContent = Utils.formatarMoeda(totalDespesas);

  const graficoSimples = (canvasId, mapa, rotulo, cor) => {
    const chaves = Object.keys(mapa).sort();
    graficosPeriodo.push(new Chart(document.getElementById(canvasId), {
      type: 'bar',
      data: {
        labels: chaves.map(c => rotuloSubPeriodo(c, modoSub)),
        datasets: [{ label: rotulo, data: chaves.map(c => mapa[c]), backgroundColor: cor, borderRadius: 6, borderSkipped: false, maxBarThickness: 28 }],
      },
      options: Graficos.base(cores, {
        legendaVisivel: false,
        callbacksTooltip: { label: (ctx) => `${ctx.dataset.label}: ${Utils.formatarMoeda(ctx.parsed.y || 0)}` },
        escalas: Graficos.eixos(cores),
        extras: extras(),
      }),
    }));
  };
  graficoSimples('grafico-receitas-mes', recMap, 'Receitas', cores.receita);
  graficoSimples('grafico-despesas-mes', despMap, 'Despesas', cores.despesa);
}

function renderKpis({ totalReceitas, totalDespesas, economia }) {
  const taxa = totalReceitas > 0 ? Math.round((economia / totalReceitas) * 100) : 0;
  const container = document.getElementById('resumo-kpis');
  container.innerHTML = `
    <article class="kpi kpi--receita">
      <div class="kpi__topo"><span class="kpi__icone">${Utils.icone('trending-up')}</span><span class="kpi__rotulo">Receitas</span></div>
      <div class="kpi__valor valor-monetario" data-valor="${totalReceitas}"></div>
      <div class="kpi__rodape">no período selecionado</div>
    </article>
    <article class="kpi kpi--despesa">
      <div class="kpi__topo"><span class="kpi__icone">${Utils.icone('trending-down')}</span><span class="kpi__rotulo">Despesas</span></div>
      <div class="kpi__valor valor-monetario" data-valor="${totalDespesas}"></div>
      <div class="kpi__rodape">no período selecionado</div>
    </article>
    <article class="kpi kpi--hero">
      <div class="kpi__topo"><span class="kpi__icone">${Utils.icone('piggy-bank')}</span><span class="kpi__rotulo">Economia</span></div>
      <div class="kpi__valor valor-monetario" data-valor="${economia}"></div>
      <div class="kpi__rodape">${economia >= 0 ? 'Receitas menos despesas' : 'Despesas acima das receitas'}</div>
    </article>
    <article class="kpi kpi--alerta">
      <div class="kpi__topo"><span class="kpi__icone">${Utils.icone('percent')}</span><span class="kpi__rotulo">Taxa de poupança</span></div>
      <div class="kpi__valor valor-monetario" data-valor="${taxa}" data-tipo="pct"></div>
      <div class="kpi__rodape">${totalReceitas > 0 ? 'da receita foi preservada' : 'sem receitas no período'}</div>
    </article>`;
  container.querySelectorAll('.kpi__valor').forEach(el => {
    const fmt = el.dataset.tipo === 'pct' ? (v => `${Math.round(v)}%`) : Utils.moedaHtml;
    Utils.contar(el, Number(el.dataset.valor), fmt, animarGraficos ? 700 : 0);
  });
}

/* ---------- Seção: Visão geral (sem período) ---------- */

function renderizarVisaoGeral() {
  destruirGraficos(graficosVisaoGeral);

  const todasReceitas = Storage.Receitas.listar(usuarioAtual.id);
  const todasDespesas = Storage.Despesas.listar(usuarioAtual.id);
  const metas = Storage.Metas.listar(usuarioAtual.id);
  const cores = Graficos.lerCores();

  const recTotal = somar(todasReceitas);
  const despTotal = somar(todasDespesas);
  const saldo = recTotal - despTotal;

  /* Evolução financeira: mês a mês */
  const meses = [...new Set([...todasReceitas, ...todasDespesas].filter(i => i.data).map(i => i.data.slice(0, 7)))].sort();
  graficosVisaoGeral.push(new Chart(document.getElementById('grafico-evolucao'), {
    type: 'line',
    data: {
      labels: meses.map(m => rotuloSubPeriodo(m, 'mes')),
      datasets: [
        { label: 'Receitas', data: meses.map(m => somar(filtrarPorMes(todasReceitas, m))), borderColor: cores.receita, backgroundColor: Graficos.degrade(cores.receita), fill: true, tension: 0.35, borderWidth: 2.5, pointRadius: 3, pointHoverRadius: 6, pointBackgroundColor: cores.superficie, pointBorderColor: cores.receita, pointBorderWidth: 2 },
        { label: 'Despesas', data: meses.map(m => somar(filtrarPorMes(todasDespesas, m))), borderColor: cores.despesa, backgroundColor: Graficos.degrade(cores.despesa), fill: true, tension: 0.35, borderWidth: 2.5, pointRadius: 3, pointHoverRadius: 6, pointBackgroundColor: cores.superficie, pointBorderColor: cores.despesa, pointBorderWidth: 2 },
      ],
    },
    options: Graficos.base(cores, {
      callbacksTooltip: { label: (ctx) => `${ctx.dataset.label}: ${Utils.formatarMoeda(ctx.parsed.y || 0)}` },
      escalas: Graficos.eixos(cores),
      extras: extras(),
    }),
  }));

  const resSaldo = document.getElementById('resumo-evolucao');
  resSaldo.className = `resultado-mes ${saldo >= 0 ? 'resultado-mes--positivo' : 'resultado-mes--negativo'}`;
  resSaldo.innerHTML = `<small>Saldo geral</small><strong class="valor-monetario">${Utils.formatarMoeda(saldo)}</strong>`;

  /* Progresso das metas */
  const wrap = document.getElementById('wrap-metas');
  const resEl = document.getElementById('resumo-metas');
  if (metas.length === 0) {
    wrap.classList.add('oculto');
    resEl.innerHTML = `<div class="estado-vazio estado-vazio--compacto"><div class="estado-vazio__icone">${Utils.icone('target')}</div><h3>Nenhuma meta criada</h3><p>Crie metas para acompanhar o progresso aqui.</p><a href="metas.html" class="botao botao--primario botao--pequeno">${Utils.icone('plus')}Criar meta</a></div>`;
    return;
  }
  wrap.classList.remove('oculto');
  resEl.innerHTML = '';

  const progressos = metas.map(m => {
    const alvo = Number(m.valorAlvo) || 0;
    return alvo > 0 ? Math.min(Math.round((Number(m.valorAtual) / alvo) * 100), 100) : 0;
  });
  graficosVisaoGeral.push(new Chart(document.getElementById('grafico-metas-indicador'), {
    type: 'bar',
    data: {
      labels: metas.map(m => (m.descricao || '').length > 16 ? (m.descricao || '').slice(0, 16) + '…' : (m.descricao || '')),
      datasets: [{ label: '% concluído', data: progressos, backgroundColor: progressos.map(p => p >= 100 ? cores.ouro : cores.receita), borderRadius: 7, borderSkipped: false, barThickness: 16 }],
    },
    options: Graficos.base(cores, {
      legendaVisivel: false,
      callbacksTooltip: {
        label: (ctx) => {
          const m = metas[ctx.dataIndex];
          return `${Utils.formatarMoeda(Number(m.valorAtual || 0))} de ${Utils.formatarMoeda(Number(m.valorAlvo || 0))} (${ctx.parsed.x}%)`;
        },
      },
      escalas: {
        x: { max: 100, beginAtZero: true, ticks: { color: cores.fraco, callback: v => v + '%' }, grid: { color: cores.borda, drawTicks: false }, border: { display: false } },
        y: { ticks: { color: cores.texto }, grid: { display: false }, border: { display: false } },
      },
      extras: { indexAxis: 'y', ...extras() },
    }),
  }));
}
