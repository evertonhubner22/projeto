/**
 * receitas.js
 * CRUD completo de receitas com busca, filtro por categoria e paginação.
 */

let usuarioAtual = null;
let todasReceitas = [];
let receitasFiltradas = [];
let paginaAtual = 1;
const ITENS_POR_PAGINA = 6;
let idParaExcluir = null;
let idDestaque = null;

document.addEventListener('DOMContentLoaded', () => {
  usuarioAtual = App.initPaginaInterna();
  if (!usuarioAtual) return;

  initFiltros();
  initModalReceita();
  initModalExclusao();
  carregarReceitas(true);

  // atalho vindo do dashboard: receitas.html?novo=1
  if (new URLSearchParams(window.location.search).get('novo') === '1') {
    abrirModalNovo();
    history.replaceState(null, '', window.location.pathname);
  }
});

function carregarReceitas(animar = false) {
  todasReceitas = Storage.Receitas.listar(usuarioAtual.id)
    .sort((a, b) => new Date(b.data) - new Date(a.data));
  aplicarFiltros();
  renderResumo(animar);
}

/* ---------- Resumo ---------- */
function renderResumo(animar) {
  const mesAtual = Utils.mesISO();
  const hoje = new Date();
  const mesPassado = Utils.mesISO(new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1));

  const somar = lista => lista.reduce((t, r) => t + Number(r.valor || 0), 0);
  const totalMes = somar(todasReceitas.filter(r => (r.data || '').slice(0, 7) === mesAtual));
  const totalPassado = somar(todasReceitas.filter(r => (r.data || '').slice(0, 7) === mesPassado));
  const totalGeral = somar(todasReceitas);

  const porCategoria = {};
  todasReceitas.forEach(r => { porCategoria[r.categoria] = (porCategoria[r.categoria] || 0) + Number(r.valor || 0); });
  const maior = Object.entries(porCategoria).sort((a, b) => b[1] - a[1])[0];

  let chip = '<span class="chip-variacao chip-variacao--neutra">sem comparação</span>';
  if (totalPassado > 0) {
    const pct = Math.round(((totalMes - totalPassado) / totalPassado) * 100);
    chip = pct === 0
      ? '<span class="chip-variacao chip-variacao--neutra">estável</span>'
      : `<span class="chip-variacao ${pct < 0 ? 'chip-variacao--negativa' : ''}">${Utils.icone(pct < 0 ? 'arrow-down-right' : 'arrow-up-right')}${Math.abs(pct)}%</span>`;
  }

  const container = document.getElementById('resumo-receitas');
  container.innerHTML = `
    <article class="kpi kpi--receita">
      <div class="kpi__topo"><span class="kpi__icone">${Utils.icone('calendar-check')}</span><span class="kpi__rotulo">Receitas do mês</span></div>
      <div class="kpi__valor valor-monetario" data-valor="${totalMes}"></div>
      <div class="kpi__rodape">${chip}<span>vs. mês anterior</span></div>
    </article>
    <article class="kpi kpi--receita">
      <div class="kpi__topo"><span class="kpi__icone">${Utils.icone('piggy-bank')}</span><span class="kpi__rotulo">Total acumulado</span></div>
      <div class="kpi__valor valor-monetario" data-valor="${totalGeral}"></div>
      <div class="kpi__rodape">${todasReceitas.length} ${todasReceitas.length === 1 ? 'lançamento' : 'lançamentos'}</div>
    </article>
    <article class="kpi kpi--alerta">
      <div class="kpi__topo"><span class="kpi__icone">${Utils.icone('award')}</span><span class="kpi__rotulo">Principal fonte</span></div>
      <div class="kpi__valor valor-monetario" data-valor="${maior ? maior[1] : 0}"></div>
      <div class="kpi__rodape">${maior ? Utils.esc(maior[0]) : 'Nenhuma receita ainda'}</div>
    </article>
  `;
  Utils.preencherKpis(container, animar);
}

/* ---------- Filtros ---------- */
function initFiltros() {
  const filtroCategoria = document.getElementById('filtro-categoria-receita');

  Utils.iniciarBusca({
    campo: document.getElementById('campo-busca-receitas'),
    input: document.getElementById('busca-receitas'),
    limpar: document.getElementById('limpar-busca-receitas'),
    aoMudar: () => { paginaAtual = 1; aplicarFiltros(); },
  });

  filtroCategoria.addEventListener('change', () => { paginaAtual = 1; aplicarFiltros(); });
}

function limparFiltros() {
  const busca = document.getElementById('busca-receitas');
  busca.value = '';
  document.getElementById('campo-busca-receitas').classList.remove('input-busca--preenchido');
  document.getElementById('filtro-categoria-receita').value = '';
  paginaAtual = 1;
  aplicarFiltros();
}

function aplicarFiltros() {
  const termo = document.getElementById('busca-receitas').value.trim().toLowerCase();
  const categoria = document.getElementById('filtro-categoria-receita').value;

  receitasFiltradas = todasReceitas.filter(r => {
    const combinaTermo = !termo || r.descricao.toLowerCase().includes(termo);
    const combinaCategoria = !categoria || r.categoria === categoria;
    return combinaTermo && combinaCategoria;
  });

  // se há uma linha a destacar, abre a página em que ela está
  if (idDestaque) {
    const idx = receitasFiltradas.findIndex(r => r.id === idDestaque);
    if (idx >= 0) paginaAtual = Math.floor(idx / ITENS_POR_PAGINA) + 1;
  }
  const totalPaginas = Math.max(1, Math.ceil(receitasFiltradas.length / ITENS_POR_PAGINA));
  if (paginaAtual > totalPaginas) paginaAtual = totalPaginas;

  const contagem = document.getElementById('contagem-receitas');
  contagem.textContent = receitasFiltradas.length === todasReceitas.length
    ? '' : `${receitasFiltradas.length} de ${todasReceitas.length} receitas`;

  renderTabela();
  renderPaginacao();
}

/* ---------- Tabela ---------- */
function renderEstadoVazio() {
  const vazio = document.getElementById('estado-vazio-receitas');
  const semRegistros = todasReceitas.length === 0;

  vazio.innerHTML = semRegistros
    ? `<div class="estado-vazio__icone">${Utils.icone('wallet')}</div>
       <h3>Nenhuma receita cadastrada</h3>
       <p>Registre seu salário, freelas e outras entradas para acompanhar o que entra todo mês.</p>
       <button class="botao botao--primario" type="button" id="cta-vazio-receita">${Utils.icone('plus')}Cadastrar primeira receita</button>`
    : `<div class="estado-vazio__icone">${Utils.icone('search-x')}</div>
       <h3>Nenhuma receita encontrada</h3>
       <p>Nada corresponde aos filtros atuais. Tente outro termo ou limpe a busca.</p>
       <button class="botao botao--secundario" type="button" id="cta-vazio-receita">${Utils.icone('rotate-ccw')}Limpar filtros</button>`;

  document.getElementById('cta-vazio-receita').addEventListener('click', semRegistros ? abrirModalNovo : limparFiltros);
}

function renderTabela() {
  const corpo = document.getElementById('corpo-tabela-receitas');
  const vazio = document.getElementById('estado-vazio-receitas');
  const tabela = corpo.closest('.tabela-wrap');

  if (receitasFiltradas.length === 0) {
    corpo.innerHTML = '';
    tabela.classList.add('oculto');
    vazio.classList.remove('oculto');
    renderEstadoVazio();
    return;
  }
  tabela.classList.remove('oculto');
  vazio.classList.add('oculto');

  const inicio = (paginaAtual - 1) * ITENS_POR_PAGINA;
  const pagina = receitasFiltradas.slice(inicio, inicio + ITENS_POR_PAGINA);

  corpo.innerHTML = pagina.map(r => `
    <tr data-id="${r.id}">
      <td class="col-principal"><div class="descricao-linha">${Utils.esc(r.descricao)}</div></td>
      <td data-label="Categoria">${Utils.chipCategoria(r.categoria, 'receita')}</td>
      <td data-label="Data" class="texto-suave">${Utils.formatarData(r.data)}</td>
      <td class="num col-valor"><span class="valor-linha valor-linha--receita valor-monetario">+ ${Utils.formatarMoeda(r.valor)}</span></td>
      <td class="col-acoes">
        <div class="acoes-linha">
          <button class="acao-icone" title="Editar" aria-label="Editar ${Utils.esc(r.descricao)}" data-editar="${r.id}">${Utils.icone('pencil')}</button>
          <button class="acao-icone acao-icone--perigo" title="Excluir" aria-label="Excluir ${Utils.esc(r.descricao)}" data-excluir="${r.id}">${Utils.icone('trash-2')}</button>
        </div>
      </td>
    </tr>
  `).join('');

  corpo.querySelectorAll('[data-editar]').forEach(btn =>
    btn.addEventListener('click', () => abrirModalEdicao(btn.dataset.editar)));
  corpo.querySelectorAll('[data-excluir]').forEach(btn =>
    btn.addEventListener('click', () => abrirModalExclusao(btn.dataset.excluir)));

  Utils.destacarLinha(corpo, idDestaque);
  idDestaque = null;
}

function renderPaginacao() {
  Utils.renderPaginacao({
    botoes: document.getElementById('paginacao-receitas'),
    info: document.getElementById('paginacao-info-receitas'),
    total: receitasFiltradas.length,
    pagina: paginaAtual,
    porPagina: ITENS_POR_PAGINA,
    rotulo: 'receitas',
    aoMudar: (n) => { paginaAtual = n; renderTabela(); renderPaginacao(); },
  });
}

/* ---------- Modal de cadastro/edição ---------- */
function initModalReceita() {
  const modal = document.getElementById('modal-receita');
  const form = document.getElementById('form-receita');

  document.getElementById('botao-nova-receita').addEventListener('click', abrirModalNovo);

  modal.querySelectorAll('[data-fechar-modal]').forEach(btn =>
    btn.addEventListener('click', () => modal.classList.remove('modal-fundo--aberto')));

  form.addEventListener('submit', salvarReceita);
}

function abrirModalNovo() {
  document.getElementById('titulo-modal-receita').textContent = 'Nova receita';
  document.getElementById('form-receita').reset();
  document.getElementById('receita-id').value = '';
  document.getElementById('receita-data').value = Utils.hojeISO();
  document.getElementById('receita-data').max = Utils.hojeISO();
  limparErrosReceita();
  document.getElementById('modal-receita').classList.add('modal-fundo--aberto');
}

function abrirModalEdicao(id) {
  const receita = todasReceitas.find(r => r.id === id);
  if (!receita) return;

  document.getElementById('titulo-modal-receita').textContent = 'Editar receita';
  document.getElementById('receita-id').value = receita.id;
  document.getElementById('receita-descricao').value = receita.descricao;
  document.getElementById('receita-valor').value = receita.valor;
  document.getElementById('receita-data').value = receita.data;
  document.getElementById('receita-data').max = Utils.hojeISO();
  document.getElementById('receita-categoria').value = receita.categoria;
  limparErrosReceita();
  document.getElementById('modal-receita').classList.add('modal-fundo--aberto');
}

function limparErrosReceita() {
  ['campo-receita-descricao', 'campo-receita-valor', 'campo-receita-data', 'campo-receita-categoria']
    .forEach(id => document.getElementById(id).classList.remove('campo--invalido'));
}

function salvarReceita(e) {
  e.preventDefault();

  const id = document.getElementById('receita-id').value;
  const descricao = document.getElementById('receita-descricao').value.trim();
  const valor = parseFloat(document.getElementById('receita-valor').value);
  const data = document.getElementById('receita-data').value;
  const categoria = document.getElementById('receita-categoria').value;

  let valido = true;
  limparErrosReceita();

  if (!descricao) { document.getElementById('campo-receita-descricao').classList.add('campo--invalido'); valido = false; }
  if (!Utils.validarValorPositivo(valor)) { document.getElementById('campo-receita-valor').classList.add('campo--invalido'); valido = false; }
  if (!data || !Utils.validarDataNaoFutura(data)) { document.getElementById('campo-receita-data').classList.add('campo--invalido'); valido = false; }
  if (!categoria) { document.getElementById('campo-receita-categoria').classList.add('campo--invalido'); valido = false; }

  if (!valido) return;

  const dados = { descricao, valor, data, categoria };

  if (id) {
    Storage.Receitas.atualizar(id, dados);
    idDestaque = id;
    Utils.mostrarToast('Receita atualizada com sucesso.', 'sucesso');
  } else {
    const nova = Storage.Receitas.adicionar(usuarioAtual.id, dados);
    idDestaque = nova.id;
    Utils.mostrarToast('Receita cadastrada com sucesso.', 'sucesso');
  }

  document.getElementById('modal-receita').classList.remove('modal-fundo--aberto');
  carregarReceitas();
}

/* ---------- Modal de exclusão ---------- */
function initModalExclusao() {
  const modal = document.getElementById('modal-excluir-receita');
  modal.querySelectorAll('[data-fechar-modal]').forEach(btn =>
    btn.addEventListener('click', () => modal.classList.remove('modal-fundo--aberto')));

  document.getElementById('botao-confirmar-exclusao-receita').addEventListener('click', () => {
    if (!idParaExcluir) return;
    Storage.Receitas.excluir(idParaExcluir);
    modal.classList.remove('modal-fundo--aberto');
    Utils.mostrarToast('Receita excluída.', 'sucesso');
    idParaExcluir = null;
    carregarReceitas();
  });
}

function abrirModalExclusao(id) {
  idParaExcluir = id;
  const receita = todasReceitas.find(r => r.id === id);
  document.getElementById('texto-excluir-receita').textContent = receita
    ? `Tem certeza que deseja excluir “${receita.descricao}”? Esta ação não pode ser desfeita.`
    : 'Tem certeza que deseja excluir esta receita? Esta ação não pode ser desfeita.';
  document.getElementById('modal-excluir-receita').classList.add('modal-fundo--aberto');
}
