/**
 * recuperar.js
 * Simulação da recuperação de senha (nenhum e-mail é enviado).
 */

const formRecuperar = document.getElementById('form-recuperar');

formRecuperar.addEventListener('submit', (e) => {
  e.preventDefault();

  const campoEmail = document.getElementById('campo-email');
  const email = document.getElementById('email').value.trim();

  if (!Utils.validarEmail(email)) {
    campoEmail.classList.add('campo--invalido');
    return;
  }
  campoEmail.classList.remove('campo--invalido');

  const botao = document.getElementById('botao-recuperar');
  Utils.carregando(botao, true);
  setTimeout(() => {
    document.getElementById('bloco-formulario').classList.add('oculto');
    document.getElementById('bloco-confirmacao').classList.remove('oculto');
  }, 600);
});
