/**
 * login.js
 * Validação e autenticação da tela de login.
 */

(function seedAdmin() {
  // Garante que exista uma conta administrativa de demonstração
  const jaExiste = Storage.getUsers().some(u => u.tipo === 'admin');
  if (!jaExiste) {
    Storage.createUser({
      nome: 'Administrador',
      email: 'admin@finflow.com',
      senha: 'admin1234',
      tipo: 'admin',
    });
  }
})();

const formLogin = document.getElementById('form-login');
const campoEmail = document.getElementById('campo-email');
const campoSenha = document.getElementById('campo-senha');

formLogin.addEventListener('submit', (e) => {
  e.preventDefault();

  const email = document.getElementById('email').value.trim();
  const senha = document.getElementById('senha').value;

  let valido = true;

  if (!Utils.validarEmail(email)) {
    campoEmail.classList.add('campo--invalido');
    campoEmail.querySelector('.campo-erro span').textContent = 'Informe um e-mail válido.';
    valido = false;
  } else {
    campoEmail.classList.remove('campo--invalido');
  }

  if (!Utils.validarSenha(senha)) {
    campoSenha.classList.add('campo--invalido');
    campoSenha.querySelector('.campo-erro span').textContent = 'A senha deve ter pelo menos 8 caracteres.';
    valido = false;
  } else {
    campoSenha.classList.remove('campo--invalido');
  }

  if (!valido) return;

  const usuario = Storage.findUserByEmail(email);

  if (!usuario || usuario.senha !== senha) {
    campoSenha.classList.add('campo--invalido');
    campoSenha.querySelector('.campo-erro span').textContent = 'E-mail ou senha incorretos.';
    return;
  }

  if (usuario.ativo === false) {
    campoEmail.classList.add('campo--invalido');
    campoEmail.querySelector('.campo-erro span').textContent = 'Esta conta está desativada.';
    return;
  }

  Utils.carregando(document.getElementById('botao-entrar'), true);
  Storage.setSession(usuario.id);
  setTimeout(() => {
    window.location.href = usuario.tipo === 'admin' ? 'admin.html' : 'dashboard.html';
  }, 450);
});
