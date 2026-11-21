/**
 * auth.js
 * Comportamentos comuns das telas de login, cadastro e recuperação:
 * alternância de tema e de visibilidade da senha.
 */

(function () {
  function aplicar(tema) {
    document.documentElement.setAttribute('data-tema', tema);
    Storage.setTheme(tema);
    const botao = document.getElementById('botao-tema-auth');
    if (botao) {
      botao.innerHTML = Utils.icone(tema === 'dark' ? 'sun' : 'moon');
      botao.title = tema === 'dark' ? 'Ativar tema claro' : 'Ativar tema escuro';
      botao.setAttribute('aria-label', botao.title);
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    aplicar(Storage.getTheme());

    const botaoTema = document.getElementById('botao-tema-auth');
    if (botaoTema) {
      botaoTema.addEventListener('click', () => {
        aplicar(document.documentElement.getAttribute('data-tema') === 'dark' ? 'light' : 'dark');
      });
    }

    document.querySelectorAll('.alternar-senha').forEach(botao => {
      botao.addEventListener('click', () => {
        const input = document.getElementById(botao.dataset.alvo);
        const mostrar = input.type === 'password';
        input.type = mostrar ? 'text' : 'password';
        botao.innerHTML = Utils.icone(mostrar ? 'eye-off' : 'eye');
        botao.setAttribute('aria-label', mostrar ? 'Ocultar senha' : 'Mostrar senha');
      });
    });
  });
})();
