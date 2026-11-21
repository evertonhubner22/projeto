/**
 * metas.js
 * CRUD de metas financeiras, aportes (adicionar valor) e cálculo de progresso.
 */

let usuarioAtual = null;
let todasMetas = [];
let idParaExcluir = null;

document.addEventListener('DOMContentLoaded', () => {
  usuarioAtual = App.initPaginaInterna();
  if (!usuarioAtual) return;

  carregarMetas();
  initModalMeta();
  initModalAporte();
  initModalExclusao();
  document.getElementById('cta-vazio-meta').addEventListener('click', abrirModalNovo);
});

function carregarMetas() {
  todasMetas = Storage.Metas.listar(usuarioAtual.id)
    .sort((a, b) => (a.prazo || '9999-99').localeCompare(b.prazo || '9999-99'));
  renderMetas();
}

function diasRestantes(prazo) {
  if (!prazo) return null;
  const diff = new Date(prazo + 'T00:00:00') - new Date(Utils.hojeISO() + 'T00:00:00');
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

function renderResumoTopo() {
  const el = document.getElementById('resumo-metas-topo');
  if (todasMetas.length === 0) { el.classList.add('oculto'); return; }
  el.classList.remove('oculto');
  const guardado = todasMetas.reduce((t, m) => t + (Number(m.valorAtual) || 0), 0);
  const alvo = todasMetas.reduce((t, m) => t + (Number(m.valorAlvo) || 0), 0);
  const concluidas = todasMetas.filter(m => Number(m.valorAlvo) > 0 && Number(m.valorAtual) >= Number(m.valorAlvo)).length;
  el.innerHTML = `
    <article class="kpi kpi--receita">
      <div class="kpi__topo"><span class="kpi__icone">${Utils.icone('piggy-bank')}</span><span class="kpi__rotulo">Total guardado</span></div>
      <div class="kpi__valor valor-monetario" data-valor="${guardado}"></div>
      <div class="kpi__rodape">de ${Utils.formatarMoeda(alvo)} em metas</div>
    </article>
    <article class="kpi">
      <div class="kpi__topo"><span class="kpi__icone">${Utils.icone('target')}</span><span class="kpi__rotulo">Metas ativas</span></div>
      <div class="kpi__valor" data-valor="${todasMetas.length - concluidas}" data-tipo="inteiro"></div>
      <div class="kpi__rodape">${todasMetas.length} no total</div>
    </article>
    <article class="kpi kpi--alerta">
      <div class="kpi__topo"><span class="kpi__icone">${Utils.icone('award')}</span><span class="kpi__rotulo">Concluídas</span></div>
      <div class="kpi__valor" data-valor="${concluidas}" data-tipo="inteiro"></div>
      <div class="kpi__rodape">${concluidas > 0 ? 'Parabéns pelo avanço!' : 'Continue guardando'}</div>
    </article>`;
  Utils.preencherKpis(el, true);
}

function renderMetas() {
  const grade = document.getElementById('grade-metas');
  const vazio = document.getElementById('estado-vazio-metas');
  renderResumoTopo();

  if (todasMetas.length === 0) {
    grade.innerHTML = '';
    vazio.classList.remove('oculto');
    return;
  }
  vazio.classList.add('oculto');

  grade.innerHTML = todasMetas.map(meta => {
    const alvo = Number(meta.valorAlvo);
    const atual = Number(meta.valorAtual) || 0;
    const progresso = alvo > 0 ? Math.min(Math.round((atual / alvo) * 100), 100) : 0;
    const concluida = progresso >= 100;
    const dias = diasRestantes(meta.prazo);
    const falta = Math.max(alvo - atual, 0);

    let prazoHtml = '';
    if (meta.prazo) {
      let classe = '', texto;
      if (concluida) texto = `Prazo: ${Utils.formatarData(meta.prazo)}`;
      else if (dias < 0) { classe = ' card-meta__prazo--vencido'; texto = `Prazo vencido (${Utils.formatarData(meta.prazo)})`; }
      else { if (dias <= 30) classe = ' card-meta__prazo--urgente'; texto = `${dias} dia(s) até ${Utils.formatarData(meta.prazo)}`; }
      prazoHtml = `<div class="card-meta__prazo${classe}">${Utils.icone('calendar')}${texto}</div>`;
    }

    return `
      <article class="card card--interativo card-meta${concluida ? ' card-meta--concluida' : ''}">
        <div class="card-meta__topo">
          <span class="card-meta__icone">${Utils.icone(concluida ? 'award' : Utils.iconeMeta(meta.descricao))}</span>
          <div class="card-meta__titulo">
            <div class="card-meta__nome" title="${Utils.esc(meta.descricao)}">${Utils.esc(meta.descricao)}</div>
            ${prazoHtml}
          </div>
          <div class="card-meta__menu">
            <button class="acao-icone" title="Editar" aria-label="Editar ${Utils.esc(meta.descricao)}" data-editar="${meta.id}">${Utils.icone('pencil')}</button>
            <button class="acao-icone acao-icone--perigo" title="Excluir" aria-label="Excluir ${Utils.esc(meta.descricao)}" data-excluir="${meta.id}">${Utils.icone('trash-2')}</button>
          </div>
        </div>

        <div class="card-meta__numeros">
          <div>
            <div class="card-meta__atual valor-monetario">${Utils.formatarMoeda(atual)}</div>
            <div class="card-meta__alvo">de ${Utils.formatarMoeda(alvo)}</div>
          </div>
          ${concluida ? `<span class="selo-concluido">${Utils.icone('check')}Concluída</span>` : `<span class="card-meta__pct mono">${progresso}%</span>`}
        </div>

        <div class="barra-progresso barra-progresso--grossa">
          <div class="barra-progresso__preenchimento" data-largura="${progresso}"></div>
        </div>
        ${concluida ? '' : `<div class="card-meta__falta">Faltam ${Utils.formatarMoeda(falta)}</div>`}

        <div class="card-meta__rodape">
          <button class="botao botao--suave botao--pequeno" data-aporte="${meta.id}" ${concluida ? 'disabled' : ''}>${Utils.icone('plus')}Adicionar valor</button>
        </div>
      </article>
    `;
  }).join('');

  grade.querySelectorAll('[data-editar]').forEach(btn => btn.addEventListener('click', () => abrirModalEdicao(btn.dataset.editar)));
  grade.querySelectorAll('[data-excluir]').forEach(btn => btn.addEventListener('click', () => abrirModalExclusao(btn.dataset.excluir)));
  grade.querySelectorAll('[data-aporte]').forEach(btn => btn.addEventListener('click', () => abrirModalAporte(btn.dataset.aporte)));
  Utils.animarBarras(grade);
}

/* ---------- Modal de cadastro/edição ---------- */
function initModalMeta() {
  const modal = document.getElementById('modal-meta');
  document.getElementById('botao-nova-meta').addEventListener('click', abrirModalNovo);
  modal.querySelectorAll('[data-fechar-modal]').forEach(btn => btn.addEventListener('click', () => modal.classList.remove('modal-fundo--aberto')));
  document.getElementById('form-meta').addEventListener('submit', salvarMeta);
}

function abrirModalNovo() {
  document.getElementById('titulo-modal-meta').textContent = 'Nova meta';
  document.getElementById('form-meta').reset();
  document.getElementById('meta-id').value = '';
  limparErrosMeta();
  document.getElementById('modal-meta').classList.add('modal-fundo--aberto');
}

function abrirModalEdicao(id) {
  const meta = todasMetas.find(m => m.id === id);
  if (!meta) return;

  document.getElementById('titulo-modal-meta').textContent = 'Editar meta';
  document.getElementById('meta-id').value = meta.id;
  document.getElementById('meta-descricao').value = meta.descricao;
  document.getElementById('meta-valor-alvo').value = meta.valorAlvo;
  document.getElementById('meta-valor-atual').value = meta.valorAtual || 0;
  document.getElementById('meta-prazo').value = meta.prazo || '';
  limparErrosMeta();
  document.getElementById('modal-meta').classList.add('modal-fundo--aberto');
}

function limparErrosMeta() {
  ['campo-meta-descricao', 'campo-meta-valor-alvo', 'campo-meta-valor-atual', 'campo-meta-prazo']
    .forEach(id => document.getElementById(id).classList.remove('campo--invalido'));
}

function salvarMeta(e) {
  e.preventDefault();

  const id = document.getElementById('meta-id').value;
  const descricao = document.getElementById('meta-descricao').value.trim();
  const valorAlvo = parseFloat(document.getElementById('meta-valor-alvo').value);
  const valorAtual = parseFloat(document.getElementById('meta-valor-atual').value) || 0;
  const prazo = document.getElementById('meta-prazo').value;

  let valido = true;
  limparErrosMeta();

  if (!descricao) { document.getElementById('campo-meta-descricao').classList.add('campo--invalido'); valido = false; }
  if (!Utils.validarValorPositivo(valorAlvo)) { document.getElementById('campo-meta-valor-alvo').classList.add('campo--invalido'); valido = false; }
  if (valorAtual < 0) { document.getElementById('campo-meta-valor-atual').classList.add('campo--invalido'); valido = false; }

  if (!valido) return;

  const dados = { descricao, valorAlvo, valorAtual, prazo: prazo || null };

  if (id) {
    Storage.Metas.atualizar(id, dados);
    Utils.mostrarToast('Meta atualizada com sucesso.', 'sucesso');
  } else {
    Storage.Metas.adicionar(usuarioAtual.id, dados);
    Utils.mostrarToast('Meta criada com sucesso.', 'sucesso');
  }

  document.getElementById('modal-meta').classList.remove('modal-fundo--aberto');
  carregarMetas();
}

/* ---------- Modal de aporte (adicionar valor) ---------- */
function initModalAporte() {
  const modal = document.getElementById('modal-aporte');
  modal.querySelectorAll('[data-fechar-modal]').forEach(btn => btn.addEventListener('click', () => modal.classList.remove('modal-fundo--aberto')));
  document.getElementById('form-aporte').addEventListener('submit', salvarAporte);
}

function abrirModalAporte(id) {
  const meta = todasMetas.find(m => m.id === id);
  document.getElementById('aporte-nome-meta').textContent = meta ? meta.descricao : '';
  document.getElementById('aporte-meta-id').value = id;
  document.getElementById('aporte-valor').value = '';
  document.getElementById('campo-aporte-valor').classList.remove('campo--invalido');
  document.getElementById('modal-aporte').classList.add('modal-fundo--aberto');
}

function salvarAporte(e) {
  e.preventDefault();
  const id = document.getElementById('aporte-meta-id').value;
  const valor = parseFloat(document.getElementById('aporte-valor').value);

  if (!Utils.validarValorPositivo(valor)) {
    document.getElementById('campo-aporte-valor').classList.add('campo--invalido');
    return;
  }

  const meta = todasMetas.find(m => m.id === id);
  const novoValorAtual = (Number(meta.valorAtual) || 0) + valor;
  Storage.Metas.atualizar(id, { valorAtual: novoValorAtual });

  document.getElementById('modal-aporte').classList.remove('modal-fundo--aberto');
  const alvoMeta = Number(meta.valorAlvo) || 0;
  Utils.mostrarToast(novoValorAtual >= alvoMeta ? 'Meta concluída! Parabéns!' : 'Valor adicionado à meta.', 'sucesso');
  carregarMetas();
}

/* ---------- Modal de exclusão ---------- */
function initModalExclusao() {
  const modal = document.getElementById('modal-excluir-meta');
  modal.querySelectorAll('[data-fechar-modal]').forEach(btn => btn.addEventListener('click', () => modal.classList.remove('modal-fundo--aberto')));
  document.getElementById('botao-confirmar-exclusao-meta').addEventListener('click', () => {
    if (!idParaExcluir) return;
    Storage.Metas.excluir(idParaExcluir);
    modal.classList.remove('modal-fundo--aberto');
    Utils.mostrarToast('Meta excluída.', 'sucesso');
    idParaExcluir = null;
    carregarMetas();
  });
}

function abrirModalExclusao(id) {
  idParaExcluir = id;
  const meta = todasMetas.find(m => m.id === id);
  document.getElementById('texto-excluir-meta').textContent = meta
    ? `Tem certeza que deseja excluir “${meta.descricao}”? Esta ação não pode ser desfeita.`
    : 'Tem certeza que deseja excluir esta meta? Esta ação não pode ser desfeita.';
  document.getElementById('modal-excluir-meta').classList.add('modal-fundo--aberto');
}
