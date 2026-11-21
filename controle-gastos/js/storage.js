/**
 * storage.js
 * Camada única de acesso ao LocalStorage.
 * Nenhum outro módulo deve chamar localStorage diretamente.
 */

const DB_KEYS = {
  USERS: 'cg_users',
  SESSION: 'cg_session',
  RECEITAS: 'cg_receitas',
  DESPESAS: 'cg_despesas',
  METAS: 'cg_metas',
  RENDA: 'cg_renda',
  THEME: 'cg_theme',
  SIDEBAR: 'cg_sidebar_recolhida',
  SYNC: 'cg_sync_pendente',
};

const Storage = (() => {
  // Chaves espelhadas no Firestore (ver js/sync.js)
  const SYNC_KEYS = [DB_KEYS.RECEITAS, DB_KEYS.DESPESAS, DB_KEYS.METAS, DB_KEYS.RENDA];
  let _importando = false;

  function _marcarSync() {
    try { localStorage.setItem(DB_KEYS.SYNC, String(Date.now())); } catch (e) { /* ignora */ }
    window.dispatchEvent(new CustomEvent('cg:dados-alterados'));
  }

  function _read(key) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      console.error(`Erro ao ler ${key}:`, e);
      return null;
    }
  }

  function _write(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      if (!_importando && SYNC_KEYS.includes(key)) _marcarSync();
      return true;
    } catch (e) {
      console.error(`Erro ao gravar ${key}:`, e);
      return false;
    }
  }

  function _list(key) {
    return _read(key) || [];
  }

  function _uid() {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }

  // ---------- Usuários ----------
  function getUsers() {
    return _list(DB_KEYS.USERS);
  }

  function findUserByEmail(email) {
    return getUsers().find(u => u.email.toLowerCase() === email.toLowerCase()) || null;
  }

  function createUser(user) {
    const users = getUsers();
    const novo = { id: _uid(), criadoEm: new Date().toISOString(), tipo: 'usuario', ...user };
    users.push(novo);
    _write(DB_KEYS.USERS, users);
    return novo;
  }

  function updateUser(id, dados) {
    const users = getUsers();
    const idx = users.findIndex(u => u.id === id);
    if (idx === -1) return null;
    users[idx] = { ...users[idx], ...dados };
    _write(DB_KEYS.USERS, users);
    return users[idx];
  }

  // ---------- Sessão ----------
  function setSession(userId) {
    _write(DB_KEYS.SESSION, { userId, logadoEm: new Date().toISOString() });
  }

  function getSession() {
    return _read(DB_KEYS.SESSION);
  }

  function getCurrentUser() {
    const session = getSession();
    if (!session) return null;
    return getUsers().find(u => u.id === session.userId) || null;
  }

  function clearSession() {
    localStorage.removeItem(DB_KEYS.SESSION);
  }

  // ---------- Genérico por usuário (receitas, despesas, metas) ----------
  function _userScopedList(key, userId) {
    return _list(key).filter(item => item.userId === userId);
  }

  function _addItem(key, userId, dados) {
    const all = _list(key);
    const novo = { id: _uid(), userId, criadoEm: new Date().toISOString(), ...dados };
    all.push(novo);
    _write(key, all);
    return novo;
  }

  function _updateItem(key, id, dados) {
    const all = _list(key);
    const idx = all.findIndex(i => i.id === id);
    if (idx === -1) return null;
    all[idx] = { ...all[idx], ...dados };
    _write(key, all);
    return all[idx];
  }

  function _deleteItem(key, id) {
    const all = _list(key);
    const filtrado = all.filter(i => i.id !== id);
    _write(key, filtrado);
    return filtrado.length !== all.length;
  }

  function _deleteByGroup(key, grupoId) {
    const all = _list(key);
    const filtrado = all.filter(i => i.grupoParcelaId !== grupoId);
    _write(key, filtrado);
    return filtrado.length !== all.length;
  }

  function _addParcelas(key, userId, grupoId, parcelas) {
    const all = _list(key);
    const novos = parcelas.map(p => ({ id: _uid(), userId, criadoEm: new Date().toISOString(), grupoParcelaId: grupoId, ...p }));
    all.push(...novos);
    _write(key, all);
    return novos;
  }

  // Receitas
  const Receitas = {
    listar: userId => _userScopedList(DB_KEYS.RECEITAS, userId),
    adicionar: (userId, dados) => _addItem(DB_KEYS.RECEITAS, userId, dados),
    atualizar: (id, dados) => _updateItem(DB_KEYS.RECEITAS, id, dados),
    excluir: id => _deleteItem(DB_KEYS.RECEITAS, id),
  };

  // Despesas
  const Despesas = {
    listar: userId => _userScopedList(DB_KEYS.DESPESAS, userId),
    adicionar: (userId, dados) => _addItem(DB_KEYS.DESPESAS, userId, dados),
    adicionarParcelas: (userId, grupoId, parcelas) => _addParcelas(DB_KEYS.DESPESAS, userId, grupoId, parcelas),
    atualizar: (id, dados) => _updateItem(DB_KEYS.DESPESAS, id, dados),
    excluir: id => _deleteItem(DB_KEYS.DESPESAS, id),
    excluirPorGrupo: grupoId => _deleteByGroup(DB_KEYS.DESPESAS, grupoId),
  };

  // Metas
  const Metas = {
    listar: userId => _userScopedList(DB_KEYS.METAS, userId),
    adicionar: (userId, dados) => _addItem(DB_KEYS.METAS, userId, dados),
    atualizar: (id, dados) => _updateItem(DB_KEYS.METAS, id, dados),
    excluir: id => _deleteItem(DB_KEYS.METAS, id),
  };

  // Renda mensal (planejamento financeiro)
  function setRenda(userId, valor) {
    const all = _read(DB_KEYS.RENDA) || {};
    all[userId] = valor;
    _write(DB_KEYS.RENDA, all);
  }

  function getRenda(userId) {
    const all = _read(DB_KEYS.RENDA) || {};
    return all[userId] || 0;
  }

  // Tema
  function setTheme(theme) {
    localStorage.setItem(DB_KEYS.THEME, theme);
  }

  function getTheme() {
    return localStorage.getItem(DB_KEYS.THEME) || 'light';
  }

  // Preferência de interface: sidebar recolhida
  function setSidebarRecolhida(valor) {
    try { localStorage.setItem(DB_KEYS.SIDEBAR, valor ? '1' : '0'); } catch (e) { /* ignora */ }
  }

  function getSidebarRecolhida() {
    try { return localStorage.getItem(DB_KEYS.SIDEBAR) === '1'; } catch (e) { return false; }
  }

  // ---------- Sincronização com a nuvem (Firebase) ----------
  function exportarEstado(userId) {
    return {
      receitas: _userScopedList(DB_KEYS.RECEITAS, userId),
      despesas: _userScopedList(DB_KEYS.DESPESAS, userId),
      metas: _userScopedList(DB_KEYS.METAS, userId),
      renda: getRenda(userId),
    };
  }

  // Substitui os dados do usuário pelos vindos da nuvem (sem marcar como pendente)
  function importarEstado(userId, estado) {
    _importando = true;
    try {
      [['receitas', DB_KEYS.RECEITAS], ['despesas', DB_KEYS.DESPESAS], ['metas', DB_KEYS.METAS]].forEach(([campo, key]) => {
        const outros = _list(key).filter(i => i.userId !== userId);
        const novos = (estado[campo] || []).map(i => ({ ...i, userId }));
        _write(key, [...outros, ...novos]);
      });
      setRenda(userId, Number(estado.renda) || 0);
    } finally {
      _importando = false;
    }
  }

  function getSyncPendente() {
    try { return localStorage.getItem(DB_KEYS.SYNC); } catch (e) { return null; }
  }

  // Só limpa se não houve nova alteração desde que a marca foi lida
  function limparSyncPendente(marca) {
    try { if (localStorage.getItem(DB_KEYS.SYNC) === marca) localStorage.removeItem(DB_KEYS.SYNC); } catch (e) { /* ignora */ }
  }

  // Totais gerais (usado pelo painel administrativo)
  function contarRegistros() {
    return {
      receitas: _list(DB_KEYS.RECEITAS).length,
      despesas: _list(DB_KEYS.DESPESAS).length,
      metas: _list(DB_KEYS.METAS).length,
    };
  }

  return {
    getUsers, findUserByEmail, createUser, updateUser,
    setSession, getSession, getCurrentUser, clearSession,
    Receitas, Despesas, Metas,
    setRenda, getRenda,
    setTheme, getTheme,
    setSidebarRecolhida, getSidebarRecolhida, contarRegistros,
    exportarEstado, importarEstado, getSyncPendente, limparSyncPendente,
  };
})();
