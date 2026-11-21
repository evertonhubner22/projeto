/**
 * login-google.js
 * Botão "Entrar com Google" da tela de login.
 * 1) Autentica no Google  2) registra o perfil na nuvem  3) bloqueia conta desativada
 * 4) reconhece administrador  5) cria/reaproveita a conta local  6) sincroniza e abre a sessão.
 * Carregado como módulo: <script type="module" src="../js/login-google.js">
 */
import { loginComGoogle, sair, registrarPerfil, verificarAdmin } from "./firebase.js";
import { sincronizarLogin } from "./sync.js";

const botao = document.getElementById("botao-google");

const MENSAGENS = {
  "auth/popup-closed-by-user": "Você fechou a janela de login. Tente de novo.",
  "auth/cancelled-popup-request": "Login cancelado. Tente de novo.",
  "auth/popup-blocked": "O navegador bloqueou o pop-up. Libere e tente de novo.",
  "auth/unauthorized-domain": "Domínio não autorizado no Firebase (Authentication > Configurações > Domínios autorizados).",
  "auth/operation-not-allowed": "O login com Google não está ativado no Firebase.",
  "auth/network-request-failed": "Sem conexão com a internet.",
  "permission-denied": "Sem permissão no Firestore. Publique as regras de segurança no Firebase.",
};

botao.addEventListener("click", async () => {
  Utils.carregando(botao, true);
  let redirecionando = false;

  try {
    const fbUser = await loginComGoogle();
    if (!fbUser.email) throw new Error("Sua conta Google não informou um e-mail.");

    // Perfil na nuvem (é o que o painel admin lista); conta desativada não entra
    const perfil = await registrarPerfil(fbUser);
    if (perfil.ativo === false) {
      await sair();
      Utils.mostrarToast("Esta conta foi desativada pelo administrador.", "erro");
      return;
    }

    const ehAdmin = await verificarAdmin(fbUser.uid);
    console.info("[FinFlow] UID desta conta:", fbUser.uid, "| é admin?", ehAdmin);

    let local = Storage.findUserByEmail(fbUser.email);

    if (local && local.ativo === false) {
      await sair();
      Utils.mostrarToast("Esta conta está desativada.", "erro");
      return;
    }

    if (!local) {
      local = Storage.createUser({
        nome: fbUser.displayName || fbUser.email.split("@")[0],
        email: fbUser.email,
        senha: "", // conta Google: sem senha local
        tipo: ehAdmin ? "admin" : "usuario",
        foto: fbUser.photoURL || "",
      });
    } else if (ehAdmin && local.tipo !== "admin") {
      local = Storage.updateUser(local.id, { tipo: "admin" });
    } else if (!ehAdmin && local.tipo === "admin") {
      local = Storage.updateUser(local.id, { tipo: "usuario" }); // admin revogado no Console
    }

    await sincronizarLogin(fbUser.uid, local);

    Storage.setSession(local.id);
    redirecionando = true;
    window.location.href = local.tipo === "admin" ? "admin.html" : "dashboard.html";
  } catch (e) {
    console.error("Erro no login com Google:", e);
    Utils.mostrarToast(MENSAGENS[e.code] || e.message || "Não foi possível entrar com o Google.", "erro");
  } finally {
    if (!redirecionando) Utils.carregando(botao, false);
  }
});
