/**
 * dashboard.js
 * Calcula métricas, renderiza gráficos (Chart.js) e gera
 * as sugestões automáticas de inteligência financeira.
 */

let usuarioAtual = null;
let graficoEvolucao = null;
let graficoCategorias = null;
let graficoDistribuicao = null;

document.addEventListener('DOMContentLoaded', () => {
  usuarioAtual = App.initPaginaInterna();
  if (!usuarioAtual) return;

  Graficos.configurarPadroes();
  renderCabecalho();

  // O modal é iniciado primeiro para funcionar mesmo se os gráficos falharem
  initModalRenda();
  initInsightsClique();

  try {
    renderizarTudo(true);
  } catch (e) {
    console.error('Erro ao renderizar dashboard:', e);
  }

  Graficos.aoMudarTema(() => renderizarTudo(false));
});

/* ---------- Utilidades de período ---------- */
function mesAtualISO(data = new Date()) {
  return Utils.mesISO(data);
}

function filtrarPorMes(lista, anoMes) {
  return lista.filter(item => item.data && item.data.slice(0, 7) === anoMes);
}

function somar(lista) {
  return lista.reduce((total, item) => total + Number(item.valor || 0), 0);
}

function rotuloMesCurto(data) {
  const txt = data.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '');
  return txt.charAt(0).toUpperCase() + txt.slice(1);
}

/* ---------- Cabeçalho ---------- */
function renderCabecalho() {
  const primeiroNome = usuarioAtual.nome.trim().split(/\s+/)[0];
  document.getElementById('saudacao').textContent = `${Utils.saudacao()}, ${primeiroNome}`;
  document.getElementById('periodo-atual').textContent = Utils.nomeMesAno();
}

function renderMensagemContexto({ totalReceitas, totalDespesas, percentualGasto, base }) {
  const el = document.getElementById('mensagem-contexto');
  const disponivel = Math.max(base - totalDespesas, 0);

  if (totalReceitas === 0 && totalDespesas === 0 && base === 0) {
    el.textContent = 'Comece registrando suas receitas e despesas para ver o panorama do mês.';
  } else if (percentualGasto > 100) {
    el.textContent = `Suas despesas passaram da renda deste mês em ${Utils.formatarMoeda(totalDespesas - base)}. Vale rever os próximos gastos.`;
  } else if (percentualGasto >= 80) {
    el.textContent = `Você já usou ${percentualGasto}% da renda do mês. Restam ${Utils.formatarMoeda(disponivel)} para gastar com cuidado.`;
  } else if (base > 0) {
    el.textContent = `Você usou ${percentualGasto}% da renda e ainda tem ${Utils.formatarMoeda(disponivel)} disponíveis este mês.`;
  } else {
    el.textContent = 'Defina sua renda mensal para acompanhar o quanto já foi comprometido.';
  }
}

/* ---------- Renderização geral ---------- */
function renderizarTudo(animar = true) {
  const receitas = Storage.Receitas.listar(usuarioAtual.id);
  const despesas = Storage.Despesas.listar(usuarioAtual.id);
  const metas = Storage.Metas.listar(usuarioAtual.id);
  const renda = Storage.getRenda(usuarioAtual.id);

  const hoje = new Date();
  const mesAtual = mesAtualISO();
  const mesPassado = mesAtualISO(new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1));

  const receitasMes = filtrarPorMes(receitas, mesAtual);
  const despesasMes = filtrarPorMes(despesas, mesAtual);
  const despesasMesPassado = filtrarPorMes(despesas, mesPassado);
  const receitasMesPassado = filtrarPorMes(receitas, mesPassado);

  const totalReceitas = somar(receitasMes);
  const totalDespesas = somar(despesasMes);
  const totalReceitasPassado = somar(receitasMesPassado);
  const totalDespesasPassado = somar(despesasMesPassado);
  const saldo = totalReceitas - totalDespesas;
  const economiaMes = saldo;
  const economiaMesPassado = totalReceitasPassado - totalDespesasPassado;

  const baseParaPercentual = renda > 0 ? renda : totalReceitas;
  const percentualGasto = baseParaPercentual > 0 ? Math.round((totalDespesas / baseParaPercentual) * 100) : 0;

  renderMensagemContexto({ totalReceitas, totalDespesas, percentualGasto, base: baseParaPercentual });
  renderCards({ saldo, totalReceitas, totalDespesas, totalReceitasPassado, totalDespesasPassado, economiaMesPassado, percentualGasto }, animar);
  renderPlanejamento({ renda, totalReceitas, totalDespesas, percentualGasto });
  renderEvolucao(receitas, despesas, saldo, animar);
  renderDistribuicao({ base: baseParaPercentual, totalDespesas, percentualGasto }, animar);
  renderGraficoCategorias({ despesasMes, base: baseParaPercentual, percentualGasto }, animar);
  renderMovimentacoes(receitas, despesas);
  renderMetasResumo(metas);
  renderInsights({ despesasMes, totalDespesas, totalReceitas, economiaMes, economiaMesPassado, percentualGasto, renda });
  Utils.animarBarras(document);
}

/* ---------- Cards de indicadores ---------- */
function chipVariacao(atual, anterior, { inverso = false } = {}) {
  if (!anterior) return '<span class="chip-variacao chip-variacao--neutra">sem comparação</span>';
  const pct = Math.round(((atual - anterior) / anterior) * 100);
  if (pct === 0) return '<span class="chip-variacao chip-variacao--neutra">estável</span>';
  const subiu = pct > 0;
  const ruim = inverso ? subiu : !subiu;
  return `<span class="chip-variacao ${ruim ? 'chip-variacao--negativa' : ''}">${Utils.icone(subiu ? 'arrow-up-right' : 'arrow-down-right')}${Math.abs(pct)}%</span>`;
}

function renderCards({ saldo, totalReceitas, totalDespesas, totalReceitasPassado, totalDespesasPassado, economiaMesPassado, percentualGasto }, animar) {
  const container = document.getElementById('cards-metricas');
  const difSaldo = saldo - economiaMesPassado;
  const chipSaldo = `<span class="chip-variacao ${difSaldo < 0 ? 'chip-variacao--negativa' : ''}">${Utils.icone(difSaldo < 0 ? 'arrow-down-right' : 'arrow-up-right')}${Utils.formatarMoeda(Math.abs(difSaldo))}</span>`;
  const classeBarra = percentualGasto > 100 ? ' barra-progresso__preenchimento--excedido' : percentualGasto > 80 ? ' barra-progresso__preenchimento--alerta' : '';

  container.innerHTML = `
    <article class="kpi kpi--hero">
      <div class="kpi__topo"><span class="kpi__icone">${Utils.icone('wallet')}</span><span class="kpi__rotulo">Saldo disponível</span></div>
      <div class="kpi__valor valor-monetario" data-valor="${saldo}" data-tipo="moeda"></div>
      <div class="kpi__rodape">${chipSaldo}<span>vs. mês anterior</span></div>
    </article>

    <article class="kpi kpi--receita">
      <div class="kpi__topo"><span class="kpi__icone">${Utils.icone('trending-up')}</span><span class="kpi__rotulo">Total de receitas</span></div>
      <div class="kpi__valor valor-monetario" data-valor="${totalReceitas}" data-tipo="moeda"></div>
      <div class="kpi__rodape">${chipVariacao(totalReceitas, totalReceitasPassado)}<span>vs. mês anterior</span></div>
    </article>

    <article class="kpi kpi--despesa">
      <div class="kpi__topo"><span class="kpi__icone">${Utils.icone('trending-down')}</span><span class="kpi__rotulo">Total de despesas</span></div>
      <div class="kpi__valor valor-monetario" data-valor="${totalDespesas}" data-tipo="moeda"></div>
      <div class="kpi__rodape">${chipVariacao(totalDespesas, totalDespesasPassado, { inverso: true })}<span>vs. mês anterior</span></div>
    </article>

    <article class="kpi kpi--alerta">
      <div class="kpi__topo"><span class="kpi__icone">${Utils.icone('percent')}</span><span class="kpi__rotulo">Renda comprometida</span></div>
      <div class="kpi__valor valor-monetario" data-valor="${percentualGasto}" data-tipo="pct"></div>
      <div class="barra-progresso"><div class="barra-progresso__preenchimento${classeBarra}" data-largura="${Math.min(percentualGasto, 100)}"></div></div>
      <div class="kpi__rodape">${percentualGasto > 90 ? 'Atenção ao limite' : 'Dentro do esperado'}</div>
    </article>
  `;

  container.querySelectorAll('.kpi__valor').forEach(el => {
    const valor = Number(el.dataset.valor);
    const formatador = el.dataset.tipo === 'pct' ? (v => `${Math.round(v)}%`) : Utils.moedaHtml;
    Utils.contar(el, valor, formatador, animar ? 850 : 0);
  });
}

/* ---------- Planejamento financeiro ---------- */
function renderPlanejamento({ renda, totalReceitas, totalDespesas, percentualGasto }) {
  const base = renda > 0 ? renda : totalReceitas;
  const disponivel = base - totalDespesas;
  const sugestaoEconomia = base * 0.2;
  const container = document.getElementById('conteudo-planejamento');

  if (base === 0) {
    container.innerHTML = `
      <div class="estado-vazio estado-vazio--compacto">
        <div class="estado-vazio__icone">${Utils.icone('wallet')}</div>
        <h3>Nenhuma renda ou receita registrada</h3>
        <p>Defina sua renda mensal ou cadastre receitas para ver o planejamento do mês.</p>
      </div>`;
    return;
  }

  const classeBarra = percentualGasto > 100 ? ' barra-progresso__preenchimento--excedido' : percentualGasto > 80 ? ' barra-progresso__preenchimento--alerta' : '';

  container.innerHTML = `
    <div class="plano-numeros">
      <div class="plano-numero"><small>${renda > 0 ? 'Renda informada' : 'Baseado em receitas'}</small><strong class="valor-monetario">${Utils.formatarMoeda(base)}</strong></div>
      <div class="plano-numero"><small>Gasto no mês</small><strong class="valor-monetario">${Utils.formatarMoeda(totalDespesas)}</strong></div>
      <div class="plano-numero ${disponivel >= 0 ? 'plano-numero--positivo' : 'plano-numero--negativo'}"><small>Saldo disponível</small><strong class="valor-monetario">${Utils.formatarMoeda(disponivel)}</strong></div>
    </div>
    <div class="plano-barra-topo"><span>Percentual gasto</span><span class="mono">${percentualGasto}%</span></div>
    <div class="barra-progresso barra-progresso--grossa">
      <div class="barra-progresso__preenchimento${classeBarra}" data-largura="${Math.min(percentualGasto, 100)}"></div>
    </div>
    <div class="plano-nota">
      ${Utils.icone('lightbulb')}
      <span>Você ainda pode gastar <strong class="mono">${Utils.formatarMoeda(Math.max(disponivel, 0))}</strong> este mês.
      Para manter uma reserva saudável, considere economizar ao menos <strong class="mono">${Utils.formatarMoeda(sugestaoEconomia)}</strong> (20% da base).</span>
    </div>
  `;
}

/* ---------- Gráficos ---------- */
function estadoVazioCompacto(icone, titulo, texto) {
  return `<div class="estado-vazio estado-vazio--compacto"><div class="estado-vazio__icone">${Utils.icone(icone)}</div><h3>${titulo}</h3><p>${texto}</p></div>`;
}

function renderEvolucao(receitas, despesas, saldo, animar) {
  const cores = Graficos.lerCores();
  const hoje = new Date();
  const meses = [];
  for (let i = 5; i >= 0; i--) meses.push(new Date(hoje.getFullYear(), hoje.getMonth() - i, 1));

  const chaves = meses.map(d => Utils.mesISO(d));
  const dadosReceitas = chaves.map(k => somar(filtrarPorMes(receitas, k)));
  const dadosDespesas = chaves.map(k => somar(filtrarPorMes(despesas, k)));
  const temDados = dadosReceitas.some(v => v > 0) || dadosDespesas.some(v => v > 0);

  const resultado = document.getElementById('valor-resultado');
  resultado.className = `resultado-mes ${saldo >= 0 ? 'resultado-mes--positivo' : 'resultado-mes--negativo'}`;
  resultado.innerHTML = `<small>Resultado do mês</small><strong class="valor-monetario">${Utils.formatarMoeda(saldo)}</strong>`;

  const wrap = document.getElementById('wrap-evolucao');
  const vazio = document.getElementById('vazio-evolucao');
  if (graficoEvolucao) { graficoEvolucao.destroy(); graficoEvolucao = null; }

  if (!temDados) {
    wrap.classList.add('oculto');
    vazio.classList.remove('oculto');
    vazio.innerHTML = estadoVazioCompacto('bar-chart-3', 'Sem movimentações recentes', 'Cadastre receitas e despesas para comparar os últimos meses.');
    return;
  }
  wrap.classList.remove('oculto');
  vazio.classList.add('oculto');

  graficoEvolucao = new Chart(document.getElementById('grafico-receitas-despesas'), {
    type: 'bar',
    data: {
      labels: meses.map(rotuloMesCurto),
      datasets: [
        { label: 'Receitas', data: dadosReceitas, backgroundColor: cores.receita, borderRadius: 8, borderSkipped: false, barPercentage: 0.78, categoryPercentage: 0.72 },
        { label: 'Despesas', data: dadosDespesas, backgroundColor: cores.despesa, borderRadius: 8, borderSkipped: false, barPercentage: 0.78, categoryPercentage: 0.72 },
      ],
    },
    options: Graficos.base(cores, {
      callbacksTooltip: { label: (ctx) => `${ctx.dataset.label}: ${Utils.formatarMoeda(ctx.parsed.y || 0)}` },
      escalas: Graficos.eixos(cores),
      extras: animar ? {} : { animation: false },
    }),
  });
}

function renderDistribuicao({ base, totalDespesas, percentualGasto }, animar) {
  const cores = Graficos.lerCores();
  const wrap = document.getElementById('wrap-distribuicao');
  const vazio = document.getElementById('vazio-distribuicao');
  if (graficoDistribuicao) { graficoDistribuicao.destroy(); graficoDistribuicao = null; }

  if (base <= 0 && totalDespesas <= 0) {
    wrap.classList.add('oculto');
    vazio.classList.remove('oculto');
    vazio.innerHTML = estadoVazioCompacto('pie-chart', 'Sem dados no mês', 'Defina sua renda ou cadastre lançamentos para ver como ela foi dividida.');
    return;
  }
  wrap.classList.remove('oculto');
  vazio.classList.add('oculto');

  const disponivel = Math.max(base - totalDespesas, 0);
  document.getElementById('distribuicao-pct').textContent = `${percentualGasto}%`;

  graficoDistribuicao = new Chart(document.getElementById('grafico-distribuicao'), {
    type: 'doughnut',
    data: {
      labels: ['Despesas', 'Disponível'],
      datasets: [{ data: [totalDespesas, disponivel], backgroundColor: [cores.despesa, cores.receita], borderColor: cores.superficie, borderWidth: 3, borderRadius: 6, hoverOffset: 4 }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '74%',
      plugins: {
        legend: { display: false },
        tooltip: Graficos.tooltip(cores, { label: (ctx) => `${ctx.label}: ${Utils.formatarMoeda(ctx.parsed)}` }),
      },
      ...(animar ? {} : { animation: false }),
    },
  });

  document.getElementById('legenda-distribuicao').innerHTML = `
    <div class="legenda__item"><span class="legenda__ponto" style="--ponto:${cores.despesa}"></span>Despesas<span class="legenda__valor mono">${Utils.formatarMoeda(totalDespesas)}</span></div>
    <div class="legenda__item"><span class="legenda__ponto" style="--ponto:${cores.receita}"></span>Disponível<span class="legenda__valor mono">${Utils.formatarMoeda(disponivel)}</span></div>
  `;
}

function renderGraficoCategorias({ despesasMes, base, percentualGasto }, animar) {
  const porCategoria = {};
  despesasMes.forEach(d => {
    porCategoria[d.categoria] = (porCategoria[d.categoria] || 0) + Number(d.valor);
  });

  const ordenadas = Object.entries(porCategoria).sort((a, b) => b[1] - a[1]);
  const categorias = ordenadas.map(([nome]) => nome);
  const valores = ordenadas.map(([, valor]) => valor);
  const cores = Graficos.lerCores();
  const wrap = document.getElementById('wrap-categorias');
  const resumoEl = document.getElementById('resumo-categorias');

  if (graficoCategorias) { graficoCategorias.destroy(); graficoCategorias = null; }

  if (categorias.length === 0) {
    wrap.classList.add('oculto');
    resumoEl.innerHTML = estadoVazioCompacto('receipt', 'Sem gastos no mês', 'Cadastre despesas para visualizar o gráfico.');
    return;
  }

  if (base <= 0) {
    wrap.classList.add('oculto');
    resumoEl.innerHTML = estadoVazioCompacto('wallet', 'Defina sua renda mensal', 'Informe sua renda mensal para comparar os gastos do mês em relação a ela.');
    return;
  }

  wrap.classList.remove('oculto');

  graficoCategorias = new Chart(document.getElementById('grafico-categorias'), {
    type: 'bar',
    data: {
      labels: categorias,
      datasets: [{
        label: 'Gasto',
        data: valores.map(v => Math.round((v / base) * 100)),
        backgroundColor: categorias.map(c => Utils.infoCategoria(c).cor),
        borderRadius: 8,
        borderSkipped: false,
        barThickness: 16,
      }],
    },
    options: Graficos.base(cores, {
      legendaVisivel: false,
      callbacksTooltip: {
        title: (itens) => itens[0].label,
        label: (ctx) => {
          const val = valores[ctx.dataIndex];
          const pct = Math.round((val / base) * 100);
          return `${Utils.formatarMoeda(val)} (${pct}% da renda)`;
        },
      },
      escalas: {
        x: { beginAtZero: true, max: Math.max(100, percentualGasto), ticks: { color: cores.fraco, callback: v => `${v}%` }, grid: { color: cores.borda, drawTicks: false }, border: { display: false } },
        y: { ticks: { color: cores.texto }, grid: { display: false }, border: { display: false } },
      },
      extras: { indexAxis: 'y', ...(animar ? {} : { animation: false }) },
    }),
  });

  resumoEl.textContent = `Você gastou ${percentualGasto}% da sua renda neste mês.`;
}

/* ---------- Últimas movimentações ---------- */
function renderMovimentacoes(receitas, despesas) {
  const container = document.getElementById('lista-movimentacoes');
  const todas = [
    ...receitas.map(r => ({ ...r, tipo: 'receita' })),
    ...despesas.map(d => ({ ...d, tipo: 'despesa' })),
  ]
    .filter(m => m.data && m.data <= Utils.hojeISO())
    .sort((a, b) => (b.data || '').localeCompare(a.data || '') || (b.criadoEm || '').localeCompare(a.criadoEm || ''))
    .slice(0, 6);

  if (todas.length === 0) {
    container.innerHTML = `
      <div class="estado-vazio estado-vazio--compacto">
        <div class="estado-vazio__icone">${Utils.icone('receipt')}</div>
        <h3>Nenhuma movimentação ainda</h3>
        <p>Registre sua primeira receita ou despesa e ela aparecerá aqui.</p>
        <div class="cabecalho-pagina__acoes">
          <a class="botao botao--secundario botao--pequeno" href="receitas.html?novo=1">${Utils.icone('plus')}Receita</a>
          <a class="botao botao--primario botao--pequeno" href="despesas.html?novo=1">${Utils.icone('plus')}Despesa</a>
        </div>
      </div>`;
    return;
  }

  container.innerHTML = todas.map(m => {
    const info = Utils.infoCategoria(m.categoria, m.tipo);
    const sinal = m.tipo === 'receita' ? '+' : '−';
    return `
      <div class="mov-item">
        <span class="cat-chip" style="--cat:${info.cor}"><span class="cat-chip__icone">${Utils.icone(info.icone)}</span></span>
        <div class="mov-item__info">
          <div class="mov-item__titulo">${Utils.esc(m.descricao)}</div>
          <div class="mov-item__meta">${Utils.esc(m.categoria)} · ${Utils.formatarData(m.data)}</div>
        </div>
        <div class="mov-item__valor mov-item__valor--${m.tipo} mono">${sinal} ${Utils.formatarMoeda(m.valor)}</div>
      </div>`;
  }).join('');
}

/* ---------- Metas ---------- */
function renderMetasResumo(metas) {
  const container = document.getElementById('lista-metas-resumo');

  if (metas.length === 0) {
    container.innerHTML = `
      <div class="estado-vazio estado-vazio--compacto">
        <div class="estado-vazio__icone">${Utils.icone('target')}</div>
        <h3>Nenhuma meta criada</h3>
        <p>Defina um objetivo e acompanhe o progresso por aqui.</p>
        <a class="botao botao--primario botao--pequeno" href="metas.html">${Utils.icone('plus')}Criar meta</a>
      </div>`;
    return;
  }

  container.innerHTML = metas.slice(0, 3).map(meta => {
    const alvo = Number(meta.valorAlvo) || 0;
    const progresso = alvo > 0 ? Math.min(Math.round((Number(meta.valorAtual) / alvo) * 100), 100) : 0;
    const concluida = progresso >= 100;
    return `
      <div class="mini-meta${concluida ? ' mini-meta--concluida' : ''}">
        <span class="mini-meta__icone">${Utils.icone(concluida ? 'award' : Utils.iconeMeta(meta.descricao))}</span>
        <div class="mini-meta__info">
          <div class="mini-meta__topo">
            <span class="mini-meta__nome">${Utils.esc(meta.descricao)}</span>
            <span class="mini-meta__pct mono">${progresso}%</span>
          </div>
          <div class="barra-progresso">
            <div class="barra-progresso__preenchimento${concluida || progresso > 80 ? ' barra-progresso__preenchimento--alerta' : ''}" data-largura="${progresso}"></div>
          </div>
        </div>
      </div>`;
  }).join('');
}

/* ---------- Insights ---------- */
function renderInsights({ despesasMes, totalDespesas, totalReceitas, economiaMes, economiaMesPassado, percentualGasto, renda }) {
  const container = document.getElementById('lista-insights');
  const insights = [];
  const hoje = Utils.hojeISO();

  const parcelasFuturas = Storage.Despesas.listar(usuarioAtual.id).filter(d => d.grupoParcelaId && d.data >= hoje);
  const totalParcelas = parcelasFuturas.reduce((s, d) => s + Number(d.valor || 0), 0);
  if (parcelasFuturas.length > 0) {
    insights.push({ icone: 'calendar-clock', tom: 'alerta', texto: `Você tem ${Utils.formatarMoeda(totalParcelas)} em parcelas a pagar nos próximos meses.` });
  }

  if (percentualGasto > 0) {
    insights.push({ icone: 'gauge', tom: 'info', texto: `Você utilizou ${percentualGasto}% da sua ${renda > 0 ? 'renda' : 'receita'} este mês.` });
  }

  if (percentualGasto >= 90) {
    insights.push({ icone: 'triangle-alert', tom: 'negativo', texto: 'Você está próximo do limite. Evite novos gastos até o fim do mês.' });
  }

  if (economiaMes > economiaMesPassado) {
    insights.push({ icone: 'trending-up', tom: 'positivo', texto: 'Você economizou mais que no mês anterior. Continue assim.' });
  } else if (economiaMesPassado > 0 && economiaMes < economiaMesPassado) {
    insights.push({ icone: 'trending-down', tom: 'negativo', texto: 'Sua economia caiu em relação ao mês anterior.' });
  }

  if (despesasMes.length > 0) {
    const porCategoria = {};
    despesasMes.forEach(d => { porCategoria[d.categoria] = (porCategoria[d.categoria] || 0) + Number(d.valor); });
    const [maiorCategoria, maiorValor] = Object.entries(porCategoria).sort((a, b) => b[1] - a[1])[0];
    insights.push({ icone: 'receipt', tom: 'info', texto: `Seu maior gasto foi com ${maiorCategoria} (${Utils.formatarMoeda(maiorValor)}).` });

    if (porCategoria['Lazer'] && porCategoria['Lazer'] / totalDespesas > 0.15) {
      insights.push({ icone: 'lightbulb', tom: 'alerta', texto: 'Você pode economizar reduzindo gastos com Lazer este mês.' });
    }
  }

  if (insights.length === 0) {
    container.innerHTML = estadoVazioCompacto('sparkles', 'Sem sugestões por enquanto', 'Cadastre receitas e despesas para receber dicas personalizadas.');
    return;
  }

  container.innerHTML = insights.map(i => `
    <div class="insight insight--${i.tom}" data-ver-relatorios role="link" tabindex="0">
      <span class="insight__icone">${Utils.icone(i.icone)}</span>
      <span>${Utils.esc(i.texto)}</span>
    </div>
  `).join('');
}

function initInsightsClique() {
  const container = document.getElementById('lista-insights');
  if (!container) return;
  const ir = (e) => {
    if (e.type === 'keydown' && e.key !== 'Enter') return;
    if (e.target.closest('[data-ver-relatorios]')) window.location.href = 'relatorios.html';
  };
  container.addEventListener('click', ir);
  container.addEventListener('keydown', ir);
}

/* ---------- Modal de renda ---------- */
function initModalRenda() {
  const modal = document.getElementById('modal-renda');
  const botaoAbrir = document.getElementById('botao-definir-renda');
  const inputRenda = document.getElementById('input-renda');
  const campoRenda = document.getElementById('campo-renda');
  const form = document.getElementById('form-renda');

  botaoAbrir.addEventListener('click', () => {
    inputRenda.value = Storage.getRenda(usuarioAtual.id) || '';
    campoRenda.classList.remove('campo--invalido');
    modal.classList.add('modal-fundo--aberto');
  });

  modal.querySelectorAll('[data-fechar-modal]').forEach(btn => {
    btn.addEventListener('click', () => modal.classList.remove('modal-fundo--aberto'));
  });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const valor = parseFloat(inputRenda.value);
    if (!Utils.validarValorPositivo(valor)) {
      campoRenda.classList.add('campo--invalido');
      return;
    }
    campoRenda.classList.remove('campo--invalido');
    Storage.setRenda(usuarioAtual.id, valor);
    modal.classList.remove('modal-fundo--aberto');
    Utils.mostrarToast('Renda mensal atualizada.', 'sucesso');
    renderizarTudo(true);
  });
}
