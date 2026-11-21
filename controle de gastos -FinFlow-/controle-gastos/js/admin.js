/**
 * admin.js
 * Painel administrativo: estatísticas gerais reais, gerenciamento de usuários
 * (ativar/desativar) e gerenciamento de categorias (interface de demonstração,
 * conforme especificado — não precisa persistir).
 */

let categoriasDespesa = ['Alimentação', 'Transporte', 'Saúde', 'Educação', 'Lazer', 'Moradia', 'Contas', 'Investimentos', 'Outros'];
let categoriasReceita = ['Salário', 'Freelance', 'Investimentos', 'Presente', 'Reembolso', 'Outros'];

// Fonte dos dados: "nuvem" (Firestore, para admin logado com Google) ou "local" (este navegador)
const _srcAdminJs = document.currentScript ? document.currentScript.src : null;
const fonte = { nuvem: false, usuarios: [], totais: { receitas: 0, despesas: 0, metas: 0 } };
let _nuvemMod = null;

function getUsuarios() { return fonte.nuvem ? fonte.usuarios : Storage.getUsers(); }
function getTotais() { return fonte.nuvem ? fonte.totais : Storage.contarRegistros(); }

function atualizarAvisoFonte() {
  const el = document.getElementById('fonte-dados');
  if (!el) return;
  el.innerHTML = fonte.nuvem
    ? 'Dados carregados do Firebase: todos os usuários que já entraram com Google. <span class="badge badge--destaque">Nuvem</span>'
    : 'Mostrando apenas os dados deste navegador. Entre com a conta Google de administrador para ver todos os usuários. <span class="badge badge--neutro">Local</span>';
}

async function tentarCarregarNuvem() {
  if (!_srcAdminJs) return;
  try {
    _nuvemMod = await import(new URL('admin-nuvem.js', _srcAdminJs).href);
    const dados = await _nuvemMod.carregarDadosNuvem();
    if (!dados) return;
    fonte.nuvem = true;
    fonte.usuarios = dados.usuarios;
    fonte.totais = dados.totais;
  } catch (e) {
    console.warn('[FinFlow] Painel em modo local (nuvem indisponível):', e);
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  const usuarioAtual = App.initPaginaInterna({ exigirAdmin: true });
  if (!usuarioAtual) return;

  renderEstatisticas();
  renderUsuarios();
  renderCategorias();
  initAbas();
  initBuscaUsuarios();
  initModalCategoria();

  // Depois do primeiro desenho (dados locais), tenta trocar pelos dados da nuvem
  atualizarAvisoFonte();
  await tentarCarregarNuvem();
  atualizarAvisoFonte();
  if (fonte.nuvem) {
    renderEstatisticas();
    renderUsuarios();
  }
});

function renderEstatisticas() {
  const usuarios = getUsuarios();
  const ativos = usuarios.filter(u => u.ativo !== false).length;
  const totais = getTotais();

  const container = document.getElementById('cards-admin');
  container.innerHTML = `
    <article class="kpi kpi--hero">
      <div class="kpi__topo"><span class="kpi__icone">${Utils.icone('users')}</span><span class="kpi__rotulo">Usuários cadastrados</span></div>
      <div class="kpi__valor" data-valor="${usuarios.length}" data-tipo="inteiro"></div>
      <div class="kpi__rodape">${ativos} ${ativos === 1 ? 'ativo' : 'ativos'}</div>
    </article>
    <article class="kpi kpi--receita">
      <div class="kpi__topo"><span class="kpi__icone">${Utils.icone('trending-up')}</span><span class="kpi__rotulo">Receitas lançadas</span></div>
      <div class="kpi__valor" data-valor="${totais.receitas}" data-tipo="inteiro"></div>
      <div class="kpi__rodape">em todo o sistema</div>
    </article>
    <article class="kpi kpi--despesa">
      <div class="kpi__topo"><span class="kpi__icone">${Utils.icone('trending-down')}</span><span class="kpi__rotulo">Despesas lançadas</span></div>
      <div class="kpi__valor" data-valor="${totais.despesas}" data-tipo="inteiro"></div>
      <div class="kpi__rodape">em todo o sistema</div>
    </article>
    <article class="kpi kpi--alerta">
      <div class="kpi__topo"><span class="kpi__icone">${Utils.icone('target')}</span><span class="kpi__rotulo">Metas criadas</span></div>
      <div class="kpi__valor" data-valor="${totais.metas}" data-tipo="inteiro"></div>
      <div class="kpi__rodape">em todo o sistema</div>
    </article>
  `;
  Utils.preencherKpis(container, true);
}

function renderUsuarios() {
  const todos = getUsuarios();
  const termo = document.getElementById('busca-usuarios').value.trim().toLowerCase();
  const usuarios = todos.filter(u => !termo || u.nome.toLowerCase().includes(termo) || u.email.toLowerCase().includes(termo));
  const corpo = document.getElementById('corpo-tabela-usuarios');
  const vazio = document.getElementById('vazio-usuarios');

  document.getElementById('contagem-usuarios').textContent =
    `${usuarios.length} ${usuarios.length === 1 ? 'usuário' : 'usuários'}`;

  corpo.closest('.tabela-wrap').classList.toggle('oculto', usuarios.length === 0);
  vazio.classList.toggle('oculto', usuarios.length > 0);

  corpo.innerHTML = usuarios.map(u => {
    const ativo = u.ativo !== false;
    const admin = u.tipo === 'admin';
    const criadoEm = u.criadoEm ? new Date(u.criadoEm).toLocaleDateString('pt-BR') : '—';
    return `
      <tr>
        <td class="col-principal">
          <div class="usuario-celula">
            <div class="avatar-circulo">${u.foto ? `<img src="${u.foto}" alt="">` : Utils.gerarIniciais(u.nome)}</div>
            <div>
              <div class="usuario-celula__nome">${Utils.esc(u.nome)}</div>
              <div class="usuario-celula__email">${Utils.esc(u.email)}</div>
            </div>
          </div>
        </td>
        <td data-label="Tipo"><span class="badge ${admin ? 'badge--destaque' : 'badge--neutro'}">${admin ? Utils.icone('shield-check') + 'Administrador' : 'Usuário'}</span></td>
        <td data-label="Cadastro" class="texto-suave">${criadoEm}</td>
        <td data-label="Status"><span class="status-ponto ${ativo ? '' : 'status-ponto--inativo'}">${ativo ? 'Ativo' : 'Inativo'}</span></td>
        <td class="col-acoes">
          <div class="acoes-linha">
            <button class="botao botao--secundario botao--pequeno" data-toggle="${u.id}" ${admin ? 'disabled title="Administradores não podem ser desativados"' : ''}>
              ${Utils.icone(ativo ? 'user-x' : 'user-check')}${ativo ? 'Desativar' : 'Ativar'}
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');

  corpo.querySelectorAll('[data-toggle]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.toggle;
      const usuario = todos.find(u => u.id === id);
      const novoAtivo = usuario.ativo === false;

      if (fonte.nuvem) {
        btn.disabled = true;
        _nuvemMod.definirAtivo(id, novoAtivo)
          .then(() => {
            usuario.ativo = novoAtivo;
            renderEstatisticas();
            renderUsuarios();
            Utils.mostrarToast(novoAtivo ? 'Usuário ativado.' : 'Usuário desativado.', 'sucesso');
          })
          .catch((e) => {
            console.error(e);
            btn.disabled = false;
            Utils.mostrarToast('Não foi possível atualizar o usuário na nuvem.', 'erro');
          });
        return;
      }

      Storage.updateUser(id, { ativo: novoAtivo });
      renderEstatisticas();
      renderUsuarios();
      Utils.mostrarToast('Status do usuário atualizado.', 'sucesso');
    });
  });
}

function initBuscaUsuarios() {
  Utils.iniciarBusca({
    campo: document.getElementById('campo-busca-usuarios'),
    input: document.getElementById('busca-usuarios'),
    limpar: document.getElementById('limpar-busca-usuarios'),
    aoMudar: renderUsuarios,
  });
}

function chipCategoriaAdmin(nome, tipo, indice) {
  const info = Utils.infoCategoria(nome, tipo);
  return `
    <span class="chip-categoria">
      <span class="cat-chip__icone" style="--cat:${info.cor}">${Utils.icone(info.icone)}</span>
      ${Utils.esc(nome)}
      <button type="button" data-remover="${tipo}" data-indice="${indice}" title="Remover" aria-label="Remover ${Utils.esc(nome)}">${Utils.icone('x')}</button>
    </span>`;
}

function renderCategorias() {
  document.getElementById('lista-categorias-despesa').innerHTML = categoriasDespesa.map((c, i) => chipCategoriaAdmin(c, 'despesa', i)).join('');
  document.getElementById('lista-categorias-receita').innerHTML = categoriasReceita.map((c, i) => chipCategoriaAdmin(c, 'receita', i)).join('');
  document.getElementById('contagem-cat-despesa').textContent = categoriasDespesa.length;
  document.getElementById('contagem-cat-receita').textContent = categoriasReceita.length;

  document.querySelectorAll('[data-remover]').forEach(btn => {
    btn.addEventListener('click', () => {
      const tipo = btn.dataset.remover;
      const indice = Number(btn.dataset.indice);
      if (tipo === 'despesa') categoriasDespesa.splice(indice, 1);
      else categoriasReceita.splice(indice, 1);
      renderCategorias();
    });
  });
}

function initAbas() {
  const abas = document.querySelectorAll('.aba-admin');
  abas.forEach(aba => {
    aba.addEventListener('click', () => {
      abas.forEach(a => {
        a.classList.toggle('segmentado__item--ativo', a === aba);
        a.setAttribute('aria-selected', String(a === aba));
      });
      document.getElementById('aba-usuarios').classList.toggle('oculto', aba.dataset.aba !== 'usuarios');
      document.getElementById('aba-categorias').classList.toggle('oculto', aba.dataset.aba !== 'categorias');
    });
  });
}

function initModalCategoria() {
  const modal = document.getElementById('modal-categoria');
  document.getElementById('botao-nova-categoria').addEventListener('click', () => {
    document.getElementById('campo-categoria-nome').classList.remove('campo--invalido');
    modal.classList.add('modal-fundo--aberto');
  });
  modal.querySelectorAll('[data-fechar-modal]').forEach(btn => btn.addEventListener('click', () => modal.classList.remove('modal-fundo--aberto')));

  document.getElementById('form-categoria').addEventListener('submit', (e) => {
    e.preventDefault();
    const nome = document.getElementById('categoria-nome').value.trim();
    const tipo = document.getElementById('categoria-tipo').value;
    const campo = document.getElementById('campo-categoria-nome');

    if (!nome) { campo.classList.add('campo--invalido'); return; }
    campo.classList.remove('campo--invalido');

    if (tipo === 'despesa') categoriasDespesa.push(nome);
    else categoriasReceita.push(nome);

    renderCategorias();
    modal.classList.remove('modal-fundo--aberto');
    document.getElementById('form-categoria').reset();
    Utils.mostrarToast('Categoria adicionada (demonstração de interface).', 'sucesso');
  });
}
