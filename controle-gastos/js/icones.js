/**
 * icones.js
 * Integração com Lucide Icons (biblioteca leve, carregada via CDN).
 * Basta escrever <i data-lucide="nome"></i> no HTML ou usar Utils.icone('nome');
 * um observador converte automaticamente qualquer ícone inserido dinamicamente.
 */
const Icones = (() => {
  let agendado = false;

  function renderizar() {
    agendado = false;
    if (window.lucide && typeof window.lucide.createIcons === 'function') {
      window.lucide.createIcons();
    }
  }

  function agendar() {
    if (agendado) return;
    agendado = true;
    requestAnimationFrame(renderizar);
  }

  function iniciar() {
    renderizar();
    const observador = new MutationObserver(mutacoes => {
      for (const m of mutacoes) {
        for (const no of m.addedNodes) {
          if (no.nodeType !== 1) continue;
          if (no.matches('i[data-lucide]') || no.querySelector('i[data-lucide]')) { agendar(); return; }
        }
      }
    });
    observador.observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar);
  else iniciar();

  return { renderizar };
})();
