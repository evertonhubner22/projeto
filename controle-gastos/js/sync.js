/**
 * sync.js
 * Espelha os dados do LocalStorage (receitas, despesas, metas, renda) no Firestore.
 * Só age para contas vinculadas ao Google; contas locais continuam 100% offline.
 *
 * Carregado como módulo (import dinâmico no app.js e import estático no login-google.js).
 * Depende de storage.js (global Storage) já carregado.
 */
import { observarUsuario, carregarEstado, salvarEstado, lerPerfil, sair } from "./firebase.js";

let fbUser = null;
let atual = null;        // envio em andamento
let reenviar = false;    // houve nova alteração durante o envio
let timer = null;

async function enviarUmaVez() {
  const local = Storage.getCurrentUser();
  if (!fbUser || !local || local.firebaseUid !== fbUser.uid) return false;

  const marca = Storage.getSyncPendente();
  await salvarEstado(fbUser.uid, Storage.exportarEstado(local.id));
  Storage.limparSyncPendente(marca);
  return true;
}

// Envia o estado atual para a nuvem (junta chamadas simultâneas)
export function empurrar() {
  if (atual) { reenviar = true; return atual; }
  atual = (async () => {
    try {
      do {
        reenviar = false;
        await enviarUmaVez();
      } while (reenviar);
      return true;
    } catch (e) {
      console.warn("[FinFlow] Falha ao sincronizar com o Firebase:", e);
      return false;
    } finally {
      atual = null;
    }
  })();
  return atual;
}

/**
 * Chamado logo após o login com Google.
 * - Se já existe cópia na nuvem: ela vira a fonte da verdade (baixa para o navegador).
 * - Se é o primeiro acesso, ou há alterações locais pendentes: envia os dados locais.
 */
export async function sincronizarLogin(fbUid, usuarioLocal) {
  const vinculado = usuarioLocal.firebaseUid === fbUid;
  const pendente = vinculado && Storage.getSyncPendente();
  if (!vinculado) Storage.updateUser(usuarioLocal.id, { firebaseUid: fbUid });

  const remoto = await carregarEstado(fbUid);
  if (remoto && !pendente) {
    Storage.importarEstado(usuarioLocal.id, remoto);
  } else {
    const marca = Storage.getSyncPendente();
    await salvarEstado(fbUid, Storage.exportarEstado(usuarioLocal.id));
    Storage.limparSyncPendente(marca);
  }
}

// Sempre que o app gravar algo, agenda o envio (pequena espera para juntar várias gravações)
window.addEventListener("cg:dados-alterados", () => {
  clearTimeout(timer);
  timer = setTimeout(empurrar, 300);
});

// Quando o Firebase confirmar o login, envia o que ficou pendente (ex.: usuário trocou de página rápido)
observarUsuario(async (user) => {
  fbUser = user;
  if (!user) return;

  // Conta desativada pelo administrador: encerra a sessão ao abrir qualquer página
  const local = Storage.getCurrentUser();
  if (local && local.firebaseUid === user.uid) {
    try {
      const perfil = await lerPerfil(user.uid);
      if (perfil && perfil.ativo === false) {
        Storage.clearSession();
        await sair();
        window.location.href = "login.html";
        return;
      }
    } catch (e) { /* sem rede ou sem permissão: segue normalmente */ }
  }

  if (Storage.getSyncPendente()) empurrar();
});
