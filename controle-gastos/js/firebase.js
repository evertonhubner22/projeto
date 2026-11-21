/**
 * firebase.js
 * Conexão com o Firebase (versão HTML puro, imports via CDN).
 * Carregue SEMPRE como módulo: <script type="module">.
 *
 * Estrutura no Firestore:
 *   users/{uid}/dados/estado → { receitas: [], despesas: [], metas: [], renda: 0, atualizadoEm }
 *   perfis/{uid}             → { nome, email, foto, ativo, criadoEm, ultimoAcesso }
 *   admins/{uid}             → { email }   (criado manualmente no Console do Firebase)
 */
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { getAnalytics, isSupported } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-analytics.js";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {
  getFirestore,
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyDJEsOPgwcYYudtSzQMZsfSBInEzVR1BiQ",
  authDomain: "finflow-cba1c.firebaseapp.com",
  projectId: "finflow-cba1c",
  storageBucket: "finflow-cba1c.firebasestorage.app",
  messagingSenderId: "13112079368",
  appId: "1:13112079368:web:be042f05e1a84d4e4ecdbd",
  measurementId: "G-0J4TMGE08E",
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

// Analytics só liga se o navegador suportar (evita erro em alguns ambientes)
isSupported().then((ok) => { if (ok) getAnalytics(app); }).catch(() => {});

/* ---------- Autenticação ---------- */
const provider = new GoogleAuthProvider();
provider.setCustomParameters({ prompt: "select_account" });

export async function loginComGoogle() {
  const resultado = await signInWithPopup(auth, provider);
  return resultado.user; // { uid, displayName, email, photoURL }
}

export function sair() {
  return signOut(auth);
}

// callback(user) roda ao entrar/sair; user = null se deslogado
export function observarUsuario(callback) {
  return onAuthStateChanged(auth, callback);
}

// Espera o Firebase restaurar a sessão e devolve o usuário (ou null)
export function aguardarAuth() {
  return new Promise((resolve) => {
    const parar = onAuthStateChanged(auth, (user) => { parar(); resolve(user); });
  });
}

/* ---------- Dados do usuário (receitas, despesas, metas, renda) ---------- */
function refEstado(uid) {
  return doc(db, "users", uid, "dados", "estado");
}

// Retorna o objeto salvo ou null se ainda não existir
export async function carregarEstado(uid) {
  const snap = await getDoc(refEstado(uid));
  return snap.exists() ? snap.data() : null;
}

export function salvarEstado(uid, estado) {
  return setDoc(refEstado(uid), { ...estado, atualizadoEm: serverTimestamp() });
}

/* ---------- Perfis (usados pelo painel administrativo) ---------- */
function paraISO(ts) {
  return ts && typeof ts.toDate === "function" ? ts.toDate().toISOString() : null;
}

export async function lerPerfil(uid) {
  const snap = await getDoc(doc(db, "perfis", uid));
  return snap.exists() ? { uid, ...snap.data() } : null;
}

// Cria o perfil no primeiro acesso ou atualiza nome/foto/último acesso. Retorna o perfil.
export async function registrarPerfil(user) {
  const ref = doc(db, "perfis", user.uid);
  const dados = {
    nome: user.displayName || (user.email || "").split("@")[0],
    email: user.email || "",
    foto: user.photoURL || "",
  };
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    await setDoc(ref, { ...dados, ativo: true, criadoEm: serverTimestamp(), ultimoAcesso: serverTimestamp() });
    return { uid: user.uid, ...dados, ativo: true };
  }
  await updateDoc(ref, { ...dados, ultimoAcesso: serverTimestamp() });
  return { uid: user.uid, ...snap.data(), ...dados };
}

// true se existir o documento admins/{uid}
export async function verificarAdmin(uid) {
  try {
    return (await getDoc(doc(db, "admins", uid))).exists();
  } catch (e) {
    console.warn("[FinFlow] Não foi possível verificar admin:", e.code, e.message);
    return false;
  }
}

// --- somente administradores (as regras do Firestore recusam para os demais) ---
export async function listarPerfis() {
  const snap = await getDocs(collection(db, "perfis"));
  return snap.docs.map((d) => {
    const p = d.data();
    return { uid: d.id, ...p, criadoEm: paraISO(p.criadoEm), ultimoAcesso: paraISO(p.ultimoAcesso) };
  });
}

export async function listarAdmins() {
  const snap = await getDocs(collection(db, "admins"));
  return snap.docs.map((d) => d.id);
}

export function definirAtivo(uid, ativo) {
  return updateDoc(doc(db, "perfis", uid), { ativo: Boolean(ativo) });
}
