/**
 * admin-nuvem.js
 * Busca no Firestore os dados do painel administrativo (usuários e totais).
 * Só funciona para quem entrou com Google e existe em admins/{uid};
 * para os demais devolve null e o painel usa os dados locais.
 * Importado dinamicamente pelo admin.js.
 */
import {
  aguardarAuth,
  verificarAdmin,
  listarPerfis,
  listarAdmins,
  carregarEstado,
  definirAtivo,
} from "./firebase.js";

export async function carregarDadosNuvem() {
  const user = await aguardarAuth();
  if (!user || !(await verificarAdmin(user.uid))) return null;

  const [perfis, admins] = await Promise.all([listarPerfis(), listarAdmins()]);
  const estados = await Promise.all(perfis.map((p) => carregarEstado(p.uid).catch(() => null)));

  const totais = { receitas: 0, despesas: 0, metas: 0 };
  estados.forEach((e) => {
    if (!e) return;
    totais.receitas += (e.receitas || []).length;
    totais.despesas += (e.despesas || []).length;
    totais.metas += (e.metas || []).length;
  });

  const usuarios = perfis
    .map((p) => ({
      id: p.uid,
      nome: p.nome || p.email || "Sem nome",
      email: p.email || "",
      foto: p.foto || "",
      tipo: admins.includes(p.uid) ? "admin" : "usuario",
      ativo: p.ativo !== false,
      criadoEm: p.criadoEm,
    }))
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));

  return { usuarios, totais };
}

export { definirAtivo };
