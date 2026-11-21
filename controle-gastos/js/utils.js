/**
 * utils.js
 * Funções reutilizáveis: validação, formatação, ícones, toasts,
 * modais, animações e mapeamento visual de categorias.
 */

const Utils = (() => {
  /* ---------- Formatação ---------- */
  function formatarMoeda(valor) {
    const numero = Number(valor) || 0;
    return numero.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  // R$ pequeno + inteiros em destaque + centavos suaves
  function moedaHtml(valor) {
    const numero = Number(valor) || 0;
    const negativo = numero < 0;
    const [inteiro, centavos] = Math.abs(numero)
      .toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      .split(',');
    return `${negativo ? '−' : ''}<span class="moeda">R$</span>${inteiro}<span class="centavos">,${centavos}</span>`;
  }

  function formatarData(dataISO) {
    if (!dataISO) return '';
    const [ano, mes, dia] = dataISO.split('-');
    return `${dia}/${mes}/${ano}`;
  }

  // Data local (evita o deslocamento de fuso causado por toISOString)
  function hojeISO(data = new Date()) {
    const mes = String(data.getMonth() + 1).padStart(2, '0');
    const dia = String(data.getDate()).padStart(2, '0');
    return `${data.getFullYear()}-${mes}-${dia}`;
  }

  function mesISO(data = new Date()) {
    return hojeISO(data).slice(0, 7);
  }

  function nomeMesAno(data = new Date()) {
    const texto = data.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
    return texto.charAt(0).toUpperCase() + texto.slice(1);
  }

  function saudacao(data = new Date()) {
    const h = data.getHours();
    if (h < 5) return 'Boa madrugada';
    if (h < 12) return 'Bom dia';
    if (h < 18) return 'Boa tarde';
    return 'Boa noite';
  }

  function esc(texto) {
    return String(texto ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  /* ---------- Validação ---------- */
  function validarEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  function validarSenha(senha) {
    return typeof senha === 'string' && senha.length >= 8;
  }

  function validarValorPositivo(valor) {
    return !isNaN(valor) && Number(valor) > 0;
  }

  function validarDataNaoFutura(dataISO) {
    if (!dataISO) return false;
    return dataISO <= hojeISO();
  }

  function gerarIniciais(nome) {
    if (!nome) return '?';
    const partes = nome.trim().split(/\s+/);
    if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
    return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase();
  }

  /* ---------- Ícones (Lucide) ---------- */
  function icone(nome, classe = '') {
    return `<i data-lucide="${nome}"${classe ? ` class="${classe}"` : ''} aria-hidden="true"></i>`;
  }

  const CATEGORIAS_DESPESA = {
    'Alimentação': { icone: 'utensils', cor: '#D08A4E' },
    'Transporte': { icone: 'car', cor: '#5B8DB8' },
    'Saúde': { icone: 'heart-pulse', cor: '#C0524B' },
    'Educação': { icone: 'graduation-cap', cor: '#7B6BA8' },
    'Lazer': { icone: 'gamepad-2', cor: '#3F9C8C' },
    'Moradia': { icone: 'house', cor: '#2F7A5B' },
    'Contas': { icone: 'receipt', cor: '#C9A24A' },
    'Investimentos': { icone: 'trending-up', cor: '#4F9A78' },
    'Outros': { icone: 'tag', cor: '#8A9C93' },
  };

  const CATEGORIAS_RECEITA = {
    'Salário': { icone: 'briefcase', cor: '#2F7A5B' },
    'Freelance': { icone: 'laptop', cor: '#5B8DB8' },
    'Investimentos': { icone: 'trending-up', cor: '#4F9A78' },
    'Presente': { icone: 'gift', cor: '#A5728F' },
    'Reembolso': { icone: 'undo-2', cor: '#D08A4E' },
    'Outros': { icone: 'tag', cor: '#8A9C93' },
  };

  const PALETA_CATEGORIAS = ['#2F7A5B', '#C9A24A', '#5B8DB8', '#C0524B', '#7B6BA8', '#3F9C8C', '#D08A4E', '#8DA35A', '#A5728F'];

  function infoCategoria(nome, tipo = 'despesa') {
    const mapa = tipo === 'receita' ? CATEGORIAS_RECEITA : CATEGORIAS_DESPESA;
    return mapa[nome] || { icone: 'tag', cor: '#8A9C93' };
  }

  function chipCategoria(nome, tipo = 'despesa') {
    const info = infoCategoria(nome, tipo);
    return `<span class="cat-chip" style="--cat:${info.cor}"><span class="cat-chip__icone">${icone(info.icone)}</span><span>${esc(nome)}</span></span>`;
  }

  // escolhe o ícone de uma meta a partir do nome digitado
  function iconeMeta(nome) {
    const n = (nome || '').toLowerCase();
    const regras = [
      [/viage|férias|ferias|passagem|intercâmbio|intercambio/, 'plane'],
      [/casa|apart|imóvel|imovel|moradia|reforma|entrada/, 'house'],
      [/carro|moto|veículo|veiculo|automóvel/, 'car'],
      [/emerg|reserva|segur/, 'shield-check'],
      [/estud|curso|faculd|escola|forma|mba|pós|pos-/, 'graduation-cap'],
      [/celular|notebook|computador|pc|tablet|tv|eletr/, 'laptop'],
      [/casamento|festa|aniversário|aniversario|presente/, 'gift'],
      [/invest|aposent|bolsa|ações|acoes/, 'trending-up'],
      [/saúde|saude|médic|medic|cirurg|dent/, 'heart-pulse'],
      [/dívida|divida|quitar|financi/, 'landmark'],
      [/bebê|bebe|filho|fam/, 'baby'],
    ];
    for (const [regex, nomeIcone] of regras) if (regex.test(n)) return nomeIcone;
    return 'target';
  }

  /* ---------- Movimento ---------- */
  function reduzMovimento() {
    return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  // anima as barras de progresso marcadas com data-largura
  function animarBarras(raiz = document) {
    const barras = raiz.querySelectorAll('[data-largura]');
    requestAnimationFrame(() => requestAnimationFrame(() => {
      barras.forEach(b => { b.style.width = `${b.dataset.largura}%`; });
    }));
  }

  // contagem animada de valores
  function contar(elemento, valorFinal, formatador, duracao = 800) {
    if (!elemento) return;
    const formatar = formatador || (v => String(Math.round(v)));
    if (reduzMovimento() || duracao <= 0) { elemento.innerHTML = formatar(valorFinal); return; }
    const inicio = performance.now();
    const passo = (agora) => {
      const t = Math.min((agora - inicio) / duracao, 1);
      const suave = 1 - Math.pow(1 - t, 4);
      elemento.innerHTML = formatar(valorFinal * suave);
      if (t < 1) requestAnimationFrame(passo);
      else elemento.innerHTML = formatar(valorFinal);
    };
    requestAnimationFrame(passo);
  }

  /* ---------- Feedback ---------- */
  function mostrarToast(mensagem, tipo = 'info') {
    const container = document.getElementById('toast-container') || (() => {
      const div = document.createElement('div');
      div.id = 'toast-container';
      div.setAttribute('aria-live', 'polite');
      document.body.appendChild(div);
      return div;
    })();

    const nomeIcone = tipo === 'sucesso' ? 'circle-check' : tipo === 'erro' ? 'circle-alert' : 'info';
    const toast = document.createElement('div');
    toast.className = `toast toast--${tipo}`;
    toast.setAttribute('role', tipo === 'erro' ? 'alert' : 'status');
    toast.innerHTML = `
      <span class="toast__icone">${icone(nomeIcone)}</span>
      <span class="toast__texto">${esc(mensagem)}</span>
      <button type="button" class="toast__fechar" aria-label="Fechar aviso">${icone('x')}</button>
    `;
    container.appendChild(toast);

    const remover = () => {
      toast.classList.remove('toast--visivel');
      setTimeout(() => toast.remove(), 300);
    };
    toast.querySelector('.toast__fechar').addEventListener('click', remover);
    requestAnimationFrame(() => toast.classList.add('toast--visivel'));
    setTimeout(remover, 3600);
  }

  function carregando(botao, ativo) {
    if (!botao) return;
    botao.classList.toggle('botao--carregando', ativo);
    botao.disabled = ativo;
  }

  function debounce(fn, delay = 300) {
    let timer;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn(...args), delay);
    };
  }

  /* ---------- Modais: ESC, clique fora, foco e rolagem ---------- */
  function fecharModaisAbertos() {
    document.querySelectorAll('.modal-fundo--aberto').forEach(m => m.classList.remove('modal-fundo--aberto'));
  }

  function iniciarModais() {
    const modais = document.querySelectorAll('.modal-fundo');
    if (!modais.length) return;

    const atualizarRolagem = () => {
      document.body.style.overflow = document.querySelector('.modal-fundo--aberto') ? 'hidden' : '';
    };

    modais.forEach(modal => {
      const caixa = modal.querySelector('.modal');
      if (caixa) { caixa.setAttribute('role', 'dialog'); caixa.setAttribute('aria-modal', 'true'); }

      modal.addEventListener('mousedown', (e) => {
        if (e.target === modal) modal.classList.remove('modal-fundo--aberto');
      });

      new MutationObserver(() => {
        atualizarRolagem();
        if (modal.classList.contains('modal-fundo--aberto')) {
          setTimeout(() => {
            // não rouba o foco se a pessoa já começou a digitar no modal
            if (modal.contains(document.activeElement) && document.activeElement !== modal) return;
            const alvo = modal.querySelector('input:not([type="hidden"]), select, textarea') || modal.querySelector('button');
            if (alvo) alvo.focus({ preventScroll: true });
          }, 60);
        }
      }).observe(modal, { attributes: true, attributeFilter: ['class'] });
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') fecharModaisAbertos();
    });
  }

  /* ---------- Tabelas: busca, KPIs e paginação ---------- */
  function iniciarBusca({ campo, input, limpar, aoMudar }) {
    const atualizar = () => campo.classList.toggle('input-busca--preenchido', input.value.trim().length > 0);
    input.addEventListener('input', debounce(() => { atualizar(); aoMudar(); }, 220));
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && input.value) { input.value = ''; atualizar(); aoMudar(); }
    });
    if (limpar) {
      limpar.addEventListener('click', () => { input.value = ''; atualizar(); aoMudar(); input.focus(); });
    }
  }

  function preencherKpis(raiz, animar = true) {
    raiz.querySelectorAll('.kpi__valor[data-valor]').forEach(el => {
      const valor = Number(el.dataset.valor);
      const formatador = el.dataset.tipo === 'inteiro' ? (v => String(Math.round(v))) : moedaHtml;
      contar(el, valor, formatador, animar ? 800 : 0);
    });
  }

  function renderPaginacao({ botoes, info, total, pagina, porPagina, rotulo = 'itens', aoMudar }) {
    const wrap = botoes.closest('.paginacao-wrap');
    const totalPaginas = Math.ceil(total / porPagina);

    if (total === 0) { wrap.classList.add('oculto'); return; }
    wrap.classList.remove('oculto');

    const inicio = (pagina - 1) * porPagina + 1;
    const fim = Math.min(pagina * porPagina, total);
    info.textContent = `Mostrando ${inicio}–${fim} de ${total} ${rotulo}`;

    if (totalPaginas <= 1) { botoes.innerHTML = ''; return; }

    let paginas = [];
    if (totalPaginas <= 7) {
      paginas = Array.from({ length: totalPaginas }, (_, i) => i + 1);
    } else {
      const janela = new Set([1, totalPaginas, pagina - 1, pagina, pagina + 1]);
      const ordenadas = [...janela].filter(n => n >= 1 && n <= totalPaginas).sort((a, b) => a - b);
      ordenadas.forEach((n, i) => {
        if (i > 0 && n - ordenadas[i - 1] > 1) paginas.push('…');
        paginas.push(n);
      });
    }

    botoes.innerHTML =
      `<button type="button" data-pagina="${pagina - 1}" ${pagina === 1 ? 'disabled' : ''} aria-label="Página anterior">${icone('chevron-left')}</button>` +
      paginas.map(n => n === '…'
        ? '<button type="button" disabled>…</button>'
        : `<button type="button" data-pagina="${n}" class="${n === pagina ? 'ativo' : ''}" ${n === pagina ? 'aria-current="page"' : ''}>${n}</button>`).join('') +
      `<button type="button" data-pagina="${pagina + 1}" ${pagina === totalPaginas ? 'disabled' : ''} aria-label="Próxima página">${icone('chevron-right')}</button>`;

    botoes.onclick = (e) => {
      const botao = e.target.closest('button[data-pagina]');
      if (!botao || botao.disabled) return;
      aoMudar(Number(botao.dataset.pagina));
    };
  }

  // destaca por instantes a linha recém-salva
  function destacarLinha(corpo, id) {
    if (!id) return;
    const linha = corpo.querySelector(`tr[data-id="${id}"]`);
    if (linha) linha.classList.add('linha-destaque');
  }

  document.addEventListener('DOMContentLoaded', iniciarModais);

  return {
    formatarMoeda, moedaHtml, formatarData, hojeISO, mesISO, nomeMesAno, saudacao, esc,
    validarEmail, validarSenha, validarValorPositivo, validarDataNaoFutura, gerarIniciais,
    icone, infoCategoria, chipCategoria, iconeMeta, PALETA_CATEGORIAS,
    reduzMovimento, animarBarras, contar,
    iniciarBusca, preencherKpis, renderPaginacao, destacarLinha,
    mostrarToast, carregando, debounce,
  };
})();
