/**
 * despesas.js
 * CRUD completo de despesas com busca, filtros (categoria e forma de pagamento),
 * paginação e acompanhamento de compras parceladas.
 */

let usuarioAtual = null;
let todasDespesas = [];
let despesasFiltradas = [];
let paginaAtual = 1;
const ITENS_POR_PAGINA = 6;
let idParaExcluir = null;
let idParaExcluirGrupo = null;
let idDestaque = null;

const NOMES_MES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

document.addEventListener('DOMContentLoaded', () => {
  usuarioAtual = App.initPaginaInterna();
  if (!usuarioAtual) return;

  initFiltros();
  initModalDespesa();
  initModalExclusao();
  carregarDespesas(true);

  // atalho vindo do dashboard: despesas.html?novo=1
  if (new URLSearchParams(window.location.search).get('novo') === '1') {
    abrirModalNovo();
    history.replaceState(null, '', window.location.pathname);
  }
});

function carregarDespesas(animar = false) {
  todasDespesas = Storage.Despesas.listar(usuarioAtual.id)
    .sort((a, b) => new Date(b.data) - new Date(a.data));
  aplicarFiltros();
  renderResumo(animar);
  renderParcelas();
}

/* ---------- Resumo ---------- */
function renderResumo(animar) {
  const mesAtual = Utils.mesISO();
  const hoje = new Date();
  const mesPassado = Utils.mesISO(new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1));

  const somar = lista => lista.reduce((t, d) => t + Number(d.valor || 0), 0);
  const doMes = todasDespesas.filter(d => (d.data || '').slice(0, 7) === mesAtual);
  const totalMes = somar(doMes);
  const totalPassado = somar(todasDespesas.filter(d => (d.data || '').slice(0, 7) === mesPassado));
  const totalGeral = somar(todasDespesas);

  const porCategoria = {};
  doMes.forEach(d => { porCategoria[d.categoria] = (porCategoria[d.categoria] || 0) + Number(d.valor || 0); });
  const maior = Object.entries(porCategoria).sort((a, b) => b[1] - a[1])[0];

  // despesa maior que a do mês anterior é variação negativa
  let chip = '<span class="chip-variacao chip-variacao--neutra">sem comparação</span>';
  if (totalPassado > 0) {
    const pct = Math.round(((totalMes - totalPassado) / totalPassado) * 100);
    chip = pct === 0
      ? '<span class="chip-variacao chip-variacao--neutra">estável</span>'
      : `<span class="chip-variacao ${pct > 0 ? 'chip-variacao--negativa' : ''}">${Utils.icone(pct > 0 ? 'arrow-up-right' : 'arrow-down-right')}${Math.abs(pct)}%</span>`;
  }

  const container = document.getElementById('resumo-despesas');
  container.innerHTML = `
    <article class="kpi kpi--despesa">
      <div class="kpi__topo"><span class="kpi__icone">${Utils.icone('calendar-minus')}</span><span class="kpi__rotulo">Despesas do mês</span></div>
      <div class="kpi__valor valor-monetario" data-valor="${totalMes}"></div>
      <div class="kpi__rodape">${chip}<span>vs. mês anterior</span></div>
    </article>
    <article class="kpi kpi--despesa">
      <div class="kpi__topo"><span class="kpi__icone">${Utils.icone('receipt')}</span><span class="kpi__rotulo">Total acumulado</span></div>
      <div class="kpi__valor valor-monetario" data-valor="${totalGeral}"></div>
      <div class="kpi__rodape">${todasDespesas.length} ${todasDespesas.length === 1 ? 'lançamento' : 'lançamentos'}</div>
    </article>
    <article class="kpi kpi--alerta">
      <div class="kpi__topo"><span class="kpi__icone">${Utils.icone('pie-chart')}</span><span class="kpi__rotulo">Maior categoria do mês</span></div>
      <div class="kpi__valor valor-monetario" data-valor="${maior ? maior[1] : 0}"></div>
      <div class="kpi__rodape">${maior ? Utils.esc(maior[0]) : 'Nenhuma despesa neste mês'}</div>
    </article>
  `;
  Utils.preencherKpis(container, animar);
}

/* ---------- Parcelas a pagar ---------- */
function renderParcelas() {
  const lista = document.getElementById('lista-parcelas');
  const resumo = document.getElementById('resumo-parcelas');
  const resumoMensal = document.getElementById('resumo-mensal');
  const tituloMensal = document.getElementById('titulo-resumo-mensal');
  const layout = document.querySelector('.parcelas-layout');

  const hoje = Utils.hojeISO();
  const todas = Storage.Despesas.listar(usuarioAtual.id)
    .filter(d => d.grupoParcelaId)
    .sort((a, b) => (a.data || '').localeCompare(b.data || ''));
  const futuras = todas.filter(d => (d.data || '') >= hoje);

  resumo.innerHTML = '';
  resumoMensal.innerHTML = '';
  tituloMensal.textContent = '';

  if (futuras.length === 0) {
    layout.style.gridTemplateColumns = '1fr';
    lista.innerHTML = `
      <div class="estado-vazio estado-vazio--compacto">
        <div class="estado-vazio__icone">${Utils.icone('credit-card')}</div>
        <h3>Nenhuma parcela pendente</h3>
        <p>Compras parceladas no cartão de crédito aparecerão aqui quando houver parcelas futuras.</p>
      </div>`;
    return;
  }
  layout.style.gridTemplateColumns = '';

  const gruposMap = {};
  futuras.forEach(d => {
    const gId = d.grupoParcelaId;
    if (!gruposMap[gId]) gruposMap[gId] = { grupoParcelaId: gId, descricao: d.descricao, parcelas: [] };
    gruposMap[gId].parcelas.push(d);
  });

  let dividaTotal = 0;
  const itens = Object.values(gruposMap).map(g => {
    const pags = g.parcelas.slice().sort((a, b) => Number(a.parcelaNumero) - Number(b.parcelaNumero));
    const atual = pags[0];
    const valorRestante = pags.reduce((s, p) => s + (Number(p.valor) || 0), 0);
    dividaTotal += valorRestante;
    return { ...g, atual, valorParcela: Number(atual.valor) || 0, valorRestante };
  });

  resumo.innerHTML = `<div class="parcelas-total"><small>Dívida parcelada restante</small><strong class="valor-monetario">${Utils.formatarMoeda(dividaTotal)}</strong></div>`;

  lista.innerHTML = itens.map(it => {
    const numero = Number(it.atual.parcelaNumero) || 1;
    const total = Number(it.atual.parcelaTotal) || numero;
    const pagas = Math.max(numero - 1, 0);
    const pct = total > 0 ? Math.round((pagas / total) * 100) : 0;
    return `
      <div class="parcela-item">
        <div class="parcela-item__topo">
          <div>
            <div class="parcela-item__nome">${Utils.esc(it.descricao)}</div>
            <div class="parcela-item__meta">Parcela ${numero}/${total} · ${Utils.formatarMoeda(it.valorParcela)} · vence ${Utils.formatarData(it.atual.data)}</div>
          </div>
          <div class="parcela-item__restante valor-monetario">${Utils.formatarMoeda(it.valorRestante)}<small>restante da compra</small></div>
        </div>
        <div class="barra-progresso"><div class="barra-progresso__preenchimento" data-largura="${pct}"></div></div>
      </div>`;
  }).join('');

  const porMes = {};
  futuras.forEach(d => {
    const mes = (d.data || '').slice(0, 7);
    porMes[mes] = (porMes[mes] || 0) + (Number(d.valor) || 0);
  });
  const meses = Object.keys(porMes).sort();
  const maiorMes = Math.max(...Object.values(porMes));

  tituloMensal.textContent = 'Parcelas por mês';
  resumoMensal.innerHTML = meses.map(m => {
    const [ano, mesNum] = m.split('-');
    const nomeMes = NOMES_MES[Number(mesNum) - 1] || '';
    const largura = maiorMes > 0 ? Math.round((porMes[m] / maiorMes) * 100) : 0;
    return `
      <div class="mes-parcelas">
        <span>${nomeMes}/${String(ano).slice(2)}</span>
        <div class="barra-progresso"><div class="barra-progresso__preenchimento barra-progresso__preenchimento--excedido" data-largura="${largura}"></div></div>
        <span class="mono">${Utils.formatarMoeda(porMes[m])}</span>
      </div>`;
  }).join('');

  Utils.animarBarras(document.getElementById('card-parcelas'));
}

/* ---------- Filtros ---------- */
function initFiltros() {
  Utils.iniciarBusca({
    campo: document.getElementById('campo-busca-despesas'),
    input: document.getElementById('busca-despesas'),
    limpar: document.getElementById('limpar-busca-despesas'),
    aoMudar: () => { paginaAtual = 1; aplicarFiltros(); },
  });

  document.getElementById('filtro-categoria-despesa').addEventListener('change', () => { paginaAtual = 1; aplicarFiltros(); });
  document.getElementById('filtro-pagamento-despesa').addEventListener('change', () => { paginaAtual = 1; aplicarFiltros(); });
}

function limparFiltros() {
  document.getElementById('busca-despesas').value = '';
  document.getElementById('campo-busca-despesas').classList.remove('input-busca--preenchido');
  document.getElementById('filtro-categoria-despesa').value = '';
  document.getElementById('filtro-pagamento-despesa').value = '';
  paginaAtual = 1;
  aplicarFiltros();
}

function aplicarFiltros() {
  const termo = document.getElementById('busca-despesas').value.trim().toLowerCase();
  const categoria = document.getElementById('filtro-categoria-despesa').value;
  const pagamento = document.getElementById('filtro-pagamento-despesa').value;

  despesasFiltradas = todasDespesas.filter(d => {
    const combinaTermo = !termo || d.descricao.toLowerCase().includes(termo);
    const combinaCategoria = !categoria || d.categoria === categoria;
    const combinaPagamento = !pagamento || d.formaPagamento === pagamento;
    return combinaTermo && combinaCategoria && combinaPagamento;
  });

  if (idDestaque) {
    const idx = despesasFiltradas.findIndex(d => d.id === idDestaque);
    if (idx >= 0) paginaAtual = Math.floor(idx / ITENS_POR_PAGINA) + 1;
  }
  const totalPaginas = Math.max(1, Math.ceil(despesasFiltradas.length / ITENS_POR_PAGINA));
  if (paginaAtual > totalPaginas) paginaAtual = totalPaginas;

  document.getElementById('contagem-despesas').textContent = despesasFiltradas.length === todasDespesas.length
    ? '' : `${despesasFiltradas.length} de ${todasDespesas.length} despesas`;

  renderTabela();
  renderPaginacao();
}

/* ---------- Tabela ---------- */
function renderEstadoVazio() {
  const vazio = document.getElementById('estado-vazio-despesas');
  const semRegistros = todasDespesas.length === 0;

  vazio.innerHTML = semRegistros
    ? `<div class="estado-vazio__icone">${Utils.icone('receipt')}</div>
       <h3>Nenhuma despesa cadastrada</h3>
       <p>Registre seus gastos para entender para onde o dinheiro está indo a cada mês.</p>
       <button class="botao botao--primario" type="button" id="cta-vazio-despesa">${Utils.icone('plus')}Cadastrar primeira despesa</button>`
    : `<div class="estado-vazio__icone">${Utils.icone('search-x')}</div>
       <h3>Nenhuma despesa encontrada</h3>
       <p>Nada corresponde aos filtros atuais. Tente outro termo ou limpe a busca.</p>
       <button class="botao botao--secundario" type="button" id="cta-vazio-despesa">${Utils.icone('rotate-ccw')}Limpar filtros</button>`;

  document.getElementById('cta-vazio-despesa').addEventListener('click', semRegistros ? abrirModalNovo : limparFiltros);
}

function renderTabela() {
  const corpo = document.getElementById('corpo-tabela-despesas');
  const vazio = document.getElementById('estado-vazio-despesas');
  const tabela = corpo.closest('.tabela-wrap');

  if (despesasFiltradas.length === 0) {
    corpo.innerHTML = '';
    tabela.classList.add('oculto');
    vazio.classList.remove('oculto');
    renderEstadoVazio();
    return;
  }
  tabela.classList.remove('oculto');
  vazio.classList.add('oculto');

  const hoje = Utils.hojeISO();
  const inicio = (paginaAtual - 1) * ITENS_POR_PAGINA;
  const pagina = despesasFiltradas.slice(inicio, inicio + ITENS_POR_PAGINA);

  corpo.innerHTML = pagina.map(d => {
    const badgeParcela = d.grupoParcelaId
      ? `<span class="badge badge--destaque selo-parcela">${Utils.icone('layers')}${d.parcelaNumero}/${d.parcelaTotal}</span>`
      : '';
    const badgeAvencer = d.grupoParcelaId && d.data >= hoje
      ? '<span class="badge badge--receita">A vencer</span>'
      : '';
    return `
    <tr data-id="${d.id}">
      <td class="col-principal"><div class="descricao-linha">${Utils.esc(d.descricao)}${badgeParcela}${badgeAvencer}</div></td>
      <td data-label="Categoria">${Utils.chipCategoria(d.categoria, 'despesa')}</td>
      <td data-label="Pagamento" class="texto-suave">${Utils.esc(d.formaPagamento)}</td>
      <td data-label="Data" class="texto-suave">${Utils.formatarData(d.data)}</td>
      <td class="num col-valor"><span class="valor-linha valor-linha--despesa valor-monetario">− ${Utils.formatarMoeda(d.valor)}</span></td>
      <td class="col-acoes">
        <div class="acoes-linha">
          <button class="acao-icone" title="Editar" aria-label="Editar ${Utils.esc(d.descricao)}" data-editar="${d.id}">${Utils.icone('pencil')}</button>
          <button class="acao-icone acao-icone--perigo" title="Excluir" aria-label="Excluir ${Utils.esc(d.descricao)}" data-excluir="${d.id}">${Utils.icone('trash-2')}</button>
        </div>
      </td>
    </tr>`;
  }).join('');

  corpo.querySelectorAll('[data-editar]').forEach(btn =>
    btn.addEventListener('click', () => abrirModalEdicao(btn.dataset.editar)));
  corpo.querySelectorAll('[data-excluir]').forEach(btn =>
    btn.addEventListener('click', () => abrirModalExclusao(btn.dataset.excluir)));

  Utils.destacarLinha(corpo, idDestaque);
  idDestaque = null;
}

function renderPaginacao() {
  Utils.renderPaginacao({
    botoes: document.getElementById('paginacao-despesas'),
    info: document.getElementById('paginacao-info-despesas'),
    total: despesasFiltradas.length,
    pagina: paginaAtual,
    porPagina: ITENS_POR_PAGINA,
    rotulo: 'despesas',
    aoMudar: (n) => { paginaAtual = n; renderTabela(); renderPaginacao(); },
  });
}

/* ---------- Modal de cadastro/edição ---------- */
function initModalDespesa() {
  const modal = document.getElementById('modal-despesa');
  const form = document.getElementById('form-despesa');

  document.getElementById('botao-nova-despesa').addEventListener('click', abrirModalNovo);

  modal.querySelectorAll('[data-fechar-modal]').forEach(btn =>
    btn.addEventListener('click', () => modal.classList.remove('modal-fundo--aberto')));

  document.getElementById('despesa-pagamento').addEventListener('change', atualizarCampoParcelas);
  document.getElementById('despesa-parcelas').addEventListener('change', atualizarPreviewParcelas);
  document.getElementById('despesa-valor').addEventListener('input', atualizarPreviewParcelas);
  document.getElementById('despesa-data').addEventListener('change', atualizarPreviewParcelas);

  form.addEventListener('submit', salvarDespesa);
}

function atualizarCampoParcelas() {
  const campo = document.getElementById('campo-despesa-parcelas');
  const pagamento = document.getElementById('despesa-pagamento').value;
  campo.classList.toggle('oculto', pagamento !== 'Cartão de Crédito');
  atualizarPreviewParcelas();
}

function atualizarPreviewParcelas() {
  const preview = document.getElementById('preview-parcelas');
  const pagamento = document.getElementById('despesa-pagamento').value;
  const n = parseInt(document.getElementById('despesa-parcelas').value, 10) || 1;
  const valor = parseFloat(document.getElementById('despesa-valor').value) || 0;
  const data = document.getElementById('despesa-data').value;

  if (pagamento !== 'Cartão de Crédito' || n <= 1 || !data) {
    preview.classList.remove('caixa-previa--visivel');
    return;
  }

  preview.classList.add('caixa-previa--visivel');
  const parcelaValor = valor / n;
  const primeiro = adicionarMeses(data, 1);
  const ultimo = adicionarMeses(data, n);
  const fmtMesAno = (iso) => {
    const partes = iso.split('-');
    return `${NOMES_MES[Number(partes[1]) - 1] || ''}/${String(partes[0]).slice(2)}`;
  };
  preview.textContent = `${n}x de ${Utils.formatarMoeda(parcelaValor)} — de ${fmtMesAno(primeiro)} a ${fmtMesAno(ultimo)}`;
}

function abrirModalNovo() {
  document.getElementById('titulo-modal-despesa').textContent = 'Nova despesa';
  document.getElementById('form-despesa').reset();
  document.getElementById('despesa-id').value = '';
  document.getElementById('despesa-data').value = Utils.hojeISO();
  document.getElementById('despesa-data').max = Utils.hojeISO();
  document.getElementById('despesa-parcelas').value = '1';
  limparErrosDespesa();
  atualizarCampoParcelas();
  document.getElementById('modal-despesa').classList.add('modal-fundo--aberto');
}

function abrirModalEdicao(id) {
  const despesa = todasDespesas.find(d => d.id === id);
  if (!despesa) return;

  document.getElementById('titulo-modal-despesa').textContent = 'Editar despesa';
  document.getElementById('despesa-id').value = despesa.id;
  document.getElementById('despesa-descricao').value = despesa.descricao;
  document.getElementById('despesa-valor').value = despesa.valor;
  document.getElementById('despesa-data').value = despesa.data;
  document.getElementById('despesa-data').max = Utils.hojeISO();
  document.getElementById('despesa-categoria').value = despesa.categoria;
  document.getElementById('despesa-pagamento').value = despesa.formaPagamento;
  document.getElementById('despesa-parcelas').value = despesa.parcelaTotal ? String(despesa.parcelaTotal) : '1';
  limparErrosDespesa();
  atualizarCampoParcelas();
  document.getElementById('modal-despesa').classList.add('modal-fundo--aberto');
}

function limparErrosDespesa() {
  ['campo-despesa-descricao', 'campo-despesa-valor', 'campo-despesa-data', 'campo-despesa-categoria', 'campo-despesa-pagamento']
    .forEach(id => document.getElementById(id).classList.remove('campo--invalido'));
}

function gerarGrupoParcelaId() {
  return `grp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function adicionarMeses(dataISO, meses) {
  const [ano, mes, dia] = (dataISO || '').split('-').map(Number);
  const d = new Date(ano, (mes || 1) - 1 + meses, 1);
  const ultimoDia = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  const diaFinal = Math.min(dia || 1, ultimoDia);
  const mesFinal = String(d.getMonth() + 1).padStart(2, '0');
  const diaFinalStr = String(diaFinal).padStart(2, '0');
  return `${d.getFullYear()}-${mesFinal}-${diaFinalStr}`;
}

function gerarParcelas(dados, n, grupoId) {
  const total = dados.valor;
  const parcelas = [];
  let acumulado = 0;
  for (let i = 1; i <= n; i++) {
    const dataVencimento = adicionarMeses(dados.data, i);
    const valorParcela = i === n ? Math.round((total - acumulado) * 100) / 100 : Math.round((total / n) * 100) / 100;
    acumulado += valorParcela;
    parcelas.push({
      descricao: dados.descricao,
      categoria: dados.categoria,
      formaPagamento: 'Cartão de Crédito',
      valor: valorParcela,
      data: dataVencimento,
      grupoParcelaId: grupoId,
      parcelaNumero: i,
      parcelaTotal: n,
      valorTotal: total,
      dataCompra: dados.data,
    });
  }
  return parcelas;
}

function salvarDespesa(e) {
  e.preventDefault();

  const id = document.getElementById('despesa-id').value;
  const descricao = document.getElementById('despesa-descricao').value.trim();
  const valor = parseFloat(document.getElementById('despesa-valor').value);
  const data = document.getElementById('despesa-data').value;
  const categoria = document.getElementById('despesa-categoria').value;
  const formaPagamento = document.getElementById('despesa-pagamento').value;
  const parcelas = parseInt(document.getElementById('despesa-parcelas').value, 10) || 1;

  let valido = true;
  limparErrosDespesa();

  if (!descricao) { document.getElementById('campo-despesa-descricao').classList.add('campo--invalido'); valido = false; }
  if (!Utils.validarValorPositivo(valor)) { document.getElementById('campo-despesa-valor').classList.add('campo--invalido'); valido = false; }
  if (!data || !Utils.validarDataNaoFutura(data)) { document.getElementById('campo-despesa-data').classList.add('campo--invalido'); valido = false; }
  if (!categoria) { document.getElementById('campo-despesa-categoria').classList.add('campo--invalido'); valido = false; }
  if (!formaPagamento) { document.getElementById('campo-despesa-pagamento').classList.add('campo--invalido'); valido = false; }

  if (!valido) return;

  if (id) {
    const despesaOriginal = todasDespesas.find(d => d.id === id);
    const grupoId = despesaOriginal ? despesaOriginal.grupoParcelaId : null;

    if (grupoId) {
      if (parcelas > 1) {
        Storage.Despesas.excluirPorGrupo(grupoId);
        Storage.Despesas.adicionarParcelas(usuarioAtual.id, grupoId, gerarParcelas({ descricao, valor, data: despesaOriginal.dataCompra || despesaOriginal.data, categoria }, parcelas, grupoId));
        Utils.mostrarToast('Compra parcelada atualizada com sucesso.', 'sucesso');
      } else {
        Storage.Despesas.atualizar(id, { descricao, valor, data, categoria, formaPagamento });
        Storage.Despesas.atualizar(id, { grupoParcelaId: null });
        idDestaque = id;
        Utils.mostrarToast('Despesa atualizada com sucesso.', 'sucesso');
      }
    } else {
      if (formaPagamento === 'Cartão de Crédito' && parcelas > 1) {
        const novoGrupoId = gerarGrupoParcelaId();
        Storage.Despesas.adicionarParcelas(usuarioAtual.id, novoGrupoId, gerarParcelas({ descricao, valor, data, categoria }, parcelas, novoGrupoId));
        Storage.Despesas.excluir(id);
        Utils.mostrarToast('Compra parcelada atualizada com sucesso.', 'sucesso');
      } else {
        Storage.Despesas.atualizar(id, { descricao, valor, data, categoria, formaPagamento });
        idDestaque = id;
        Utils.mostrarToast('Despesa atualizada com sucesso.', 'sucesso');
      }
    }
  } else {
    if (formaPagamento === 'Cartão de Crédito' && parcelas > 1) {
      const grupoId = gerarGrupoParcelaId();
      Storage.Despesas.adicionarParcelas(usuarioAtual.id, grupoId, gerarParcelas({ descricao, valor, data, categoria }, parcelas, grupoId));
      Utils.mostrarToast('Compra parcelada cadastrada com sucesso.', 'sucesso');
    } else {
      const nova = Storage.Despesas.adicionar(usuarioAtual.id, { descricao, valor, data, categoria, formaPagamento });
      idDestaque = nova.id;
      Utils.mostrarToast('Despesa cadastrada com sucesso.', 'sucesso');
    }
  }

  document.getElementById('modal-despesa').classList.remove('modal-fundo--aberto');
  carregarDespesas();
}

/* ---------- Modal de exclusão ---------- */
function initModalExclusao() {
  const modal = document.getElementById('modal-excluir-despesa');
  modal.querySelectorAll('[data-fechar-modal]').forEach(btn =>
    btn.addEventListener('click', () => modal.classList.remove('modal-fundo--aberto')));

  document.getElementById('botao-confirmar-exclusao-despesa').addEventListener('click', () => {
    if (!idParaExcluir) return;
    Storage.Despesas.excluir(idParaExcluir);
    modal.classList.remove('modal-fundo--aberto');
    Utils.mostrarToast('Despesa excluída.', 'sucesso');
    idParaExcluir = null;
    idParaExcluirGrupo = null;
    carregarDespesas();
  });

  document.getElementById('botao-excluir-grupo-despesa').addEventListener('click', () => {
    if (!idParaExcluirGrupo) return;
    Storage.Despesas.excluirPorGrupo(idParaExcluirGrupo);
    modal.classList.remove('modal-fundo--aberto');
    Utils.mostrarToast('Compra excluída.', 'sucesso');
    idParaExcluir = null;
    idParaExcluirGrupo = null;
    carregarDespesas();
  });
}

function abrirModalExclusao(id) {
  idParaExcluir = id;
  const despesa = todasDespesas.find(d => d.id === id);
  idParaExcluirGrupo = despesa && despesa.grupoParcelaId ? despesa.grupoParcelaId : null;
  document.getElementById('texto-excluir-despesa').textContent = despesa
    ? `Tem certeza que deseja excluir “${despesa.descricao}”? Esta ação não pode ser desfeita.`
    : 'Tem certeza que deseja excluir esta despesa? Esta ação não pode ser desfeita.';
  document.getElementById('botao-excluir-grupo-despesa').classList.toggle('oculto', !idParaExcluirGrupo);
  document.getElementById('modal-excluir-despesa').classList.add('modal-fundo--aberto');
}
