/**
 * app.js
 * Inicialização comum a todas as páginas internas:
 * tema, proteção de rota, sidebar (com Lucide), topo, logout.
 *
 * Cada página interna deve ter no <body>:
 *   data-pagina="dashboard" data-titulo="Dashboard" data-subtitulo="..."
 * e os containers <aside id="sidebar"></aside> e <header id="topo"></header>
 * dentro de .app-shell.
 */

const MENU_ITENS = [
  { href: 'dashboard.html', icone: 'layout-dashboard', label: 'Dashboard' },
  { href: 'receitas.html', icone: 'trending-up', label: 'Receitas' },
  { href: 'despesas.html', icone: 'trending-down', label: 'Despesas' },
  { href: 'metas.html', icone: 'target', label: 'Metas' },
  { href: 'relatorios.html', icone: 'bar-chart-3', label: 'Relatórios' },
];

const MENU_CONTA = [
  { href: 'perfil.html', icone: 'user-round', label: 'Perfil' },
];

const MENU_ADMIN = { href: 'admin.html', icone: 'shield-check', label: 'Painel admin' };

// Sincronização com o Firebase (só funciona via http://, ex.: Live Server; falha em silêncio via file://)
const _baseJs = document.currentScript ? document.currentScript.src : null;
if (_baseJs) {
  import(new URL('sync.js', _baseJs).href).catch(e => console.info('[FinFlow] Sincronização com Firebase indisponível:', e.message));
}

const App = (() => {
  const BREAKPOINT_GAVETA = 900;

  /* ---------- Tema ---------- */
  function aplicarTema(tema) {
    const anterior = document.documentElement.getAttribute('data-tema');
    document.documentElement.setAttribute('data-tema', tema);
    Storage.setTheme(tema);

    const botao = document.getElementById('botao-tema');
    if (botao) {
      botao.innerHTML = Utils.icone(tema === 'dark' ? 'sun' : 'moon');
      botao.title = tema === 'dark' ? 'Ativar tema claro' : 'Ativar tema escuro';
      botao.setAttribute('aria-label', botao.title);
    }

    if (anterior !== tema) {
      document.dispatchEvent(new CustomEvent('finflow:tema', { detail: { tema } }));
    }
  }

  function alternarTema() {
    const atual = document.documentElement.getAttribute('data-tema');
    aplicarTema(atual === 'dark' ? 'light' : 'dark');
  }

  /* ---------- Sessão e rotas ---------- */
  function protegerRota() {
    const user = Storage.getCurrentUser();
    if (!user || user.ativo === false) {
      if (user) Storage.clearSession();
      window.location.href = 'login.html';
      return null;
    }
    return user;
  }

  function protegerRotaAdmin() {
    const user = protegerRota();
    if (user && user.tipo !== 'admin') {
      window.location.href = 'dashboard.html';
      return null;
    }
    return user;
  }

  // Envia o que estiver pendente e encerra a sessão do Firebase (com limite de 3 s)
  async function sairDaNuvem() {
    if (!_baseJs) return;
    try {
      const tarefa = (async () => {
        const sync = await import(new URL('sync.js', _baseJs).href);
        await sync.empurrar();
        const fb = await import(new URL('firebase.js', _baseJs).href);
        await fb.sair();
      })();
      await Promise.race([tarefa, new Promise(resolve => setTimeout(resolve, 3000))]);
    } catch (e) { /* segue com o logout local */ }
  }

  async function logout() {
    await sairDaNuvem();
    Storage.clearSession();
    window.location.href = 'login.html';
  }

  /* ---------- Marcação ---------- */
  function avatarHtml(user) {
    return user.foto
      ? `<img src="${user.foto}" alt="Foto de ${Utils.esc(user.nome)}">`
      : `<span>${Utils.gerarIniciais(user.nome)}</span>`;
  }

  function itemMenu(item, paginaAtiva) {
    const ativo = item.href === paginaAtiva;
    return `
      <a href="${item.href}" class="menu-item${ativo ? ' menu-item--ativo' : ''}" title="${item.label}"${ativo ? ' aria-current="page"' : ''}>
        ${Utils.icone(item.icone)}
        <span>${item.label}</span>
      </a>`;
  }

  function renderSidebar(paginaAtiva, user) {
    const principal = MENU_ITENS.map(i => itemMenu(i, paginaAtiva)).join('');
    const conta = (user.tipo === 'admin' ? [...MENU_CONTA, MENU_ADMIN] : MENU_CONTA)
      .map(i => itemMenu(i, paginaAtiva)).join('');

    return `
      <div class="marca">
        <div class="logo-selo" aria-hidden="true">F</div>
        <div class="marca-texto">
          <div class="marca-nome">FinFlow</div>
          <div class="marca-subtitulo">Controle financeiro</div>
        </div>
      </div>

      <nav class="menu" aria-label="Navegação principal">
        <div class="menu-grupo-titulo">Navegação</div>
        ${principal}
        <div class="menu-grupo-titulo">Conta</div>
        ${conta}
      </nav>

      <div class="sidebar-rodape">
        <a href="perfil.html" class="usuario-mini" title="${Utils.esc(user.nome)}">
          <div class="avatar-circulo">${avatarHtml(user)}</div>
          <div class="usuario-mini__info">
            <div class="usuario-mini__nome">${Utils.esc(user.nome)}</div>
            <div class="usuario-mini__email">${Utils.esc(user.email)}</div>
          </div>
        </a>
        <button class="botao-icone" id="botao-logout" title="Sair" aria-label="Sair da conta">${Utils.icone('log-out')}</button>
      </div>
    `;
  }

  function renderTopo(titulo, user) {
    const primeiroNome = Utils.esc(user.nome.trim().split(/\s+/)[0]);
    return `
      <button class="botao-icone" id="sidebar-toggle" title="Alternar menu" aria-label="Alternar menu" aria-controls="sidebar">${Utils.icone('panel-left')}</button>
      <nav class="topo-trilha" aria-label="Você está em">
        <span>FinFlow</span>${Utils.icone('chevron-right')}<strong>${Utils.esc(titulo)}</strong>
      </nav>
      <div class="topo-acoes">
        <button class="botao-icone" id="botao-tema" type="button"></button>
        <a href="perfil.html" class="chip-usuario" title="Meu perfil">
          <div class="avatar-circulo">${avatarHtml(user)}</div>
          <span>${primeiroNome}</span>
        </a>
      </div>
    `;
  }

  /* ---------- Sidebar: recolher (desktop) e gaveta (mobile) ---------- */
  function initSidebar() {
    const shell = document.querySelector('.app-shell');
    const sidebar = document.getElementById('sidebar');
    const botao = document.getElementById('sidebar-toggle');
    if (!shell || !sidebar || !botao) return;

    const backdrop = document.createElement('div');
    backdrop.className = 'sidebar-backdrop';
    document.body.appendChild(backdrop);

    const ehGaveta = () => window.innerWidth <= BREAKPOINT_GAVETA;

    function fecharGaveta() {
      sidebar.classList.remove('sidebar--movel-aberta');
      backdrop.classList.remove('sidebar-backdrop--visivel');
      document.body.style.overflow = '';
      botao.setAttribute('aria-expanded', 'false');
    }

    function alternar() {
      if (ehGaveta()) {
        const aberta = sidebar.classList.toggle('sidebar--movel-aberta');
        backdrop.classList.toggle('sidebar-backdrop--visivel', aberta);
        document.body.style.overflow = aberta ? 'hidden' : '';
        botao.setAttribute('aria-expanded', String(aberta));
      } else {
        const recolhida = shell.classList.toggle('app-shell--recolhida');
        Storage.setSidebarRecolhida(recolhida);
        botao.setAttribute('aria-expanded', String(!recolhida));
      }
    }

    if (!ehGaveta() && Storage.getSidebarRecolhida()) shell.classList.add('app-shell--recolhida');

    botao.addEventListener('click', alternar);
    backdrop.addEventListener('click', fecharGaveta);
    sidebar.querySelectorAll('a.menu-item').forEach(a => a.addEventListener('click', fecharGaveta));
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') fecharGaveta(); });
    window.addEventListener('resize', () => { if (!ehGaveta()) fecharGaveta(); });
  }

  function initPaginaInterna({ exigirAdmin = false } = {}) {
    aplicarTema(Storage.getTheme());
    const user = exigirAdmin ? protegerRotaAdmin() : protegerRota();
    if (!user) return null;

    const body = document.body;
    const paginaAtiva = body.dataset.pagina + '.html';
    const titulo = body.dataset.titulo || '';

    const sidebarEl = document.getElementById('sidebar');
    const topoEl = document.getElementById('topo');
    if (sidebarEl) sidebarEl.innerHTML = renderSidebar(paginaAtiva, user);
    if (topoEl) topoEl.innerHTML = renderTopo(titulo, user);

    initSidebar();
    aplicarTema(Storage.getTheme());

    const btnLogout = document.getElementById('botao-logout');
    if (btnLogout) btnLogout.addEventListener('click', logout);

    const btnTema = document.getElementById('botao-tema');
    if (btnTema) btnTema.addEventListener('click', alternarTema);

    return user;
  }

  return { aplicarTema, alternarTema, protegerRota, protegerRotaAdmin, logout, initPaginaInterna };
})();
