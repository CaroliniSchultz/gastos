import { firebaseConfig } from './firebase-config.js';
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import {
  getAuth, onAuthStateChanged, createUserWithEmailAndPassword,
  signInWithEmailAndPassword, signOut
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import {
  getFirestore, collection, doc, addDoc, updateDoc, deleteDoc,
  onSnapshot, query, getDocs, writeBatch
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

// ------------------------------------------------------------
// FIREBASE INIT
// ------------------------------------------------------------
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// ------------------------------------------------------------
// ESTADO LOCAL
// ------------------------------------------------------------
let currentUser = null;
let transactions = [];
let accounts = [];
let categories = [];
let budgets = [];
let unsubs = [];
let chartEvolucao = null;
let chartCategorias = null;

const DEFAULT_CATEGORIES = [
  { name: 'Mercado', kind: 'despesa', color: '#B5482A' },
  { name: 'Restaurante', kind: 'despesa', color: '#D17A4A' },
  { name: 'Transporte', kind: 'despesa', color: '#A9791E' },
  { name: 'Moradia', kind: 'despesa', color: '#7A5C3E' },
  { name: 'Saúde', kind: 'despesa', color: '#8E4E6B' },
  { name: 'Lazer', kind: 'despesa', color: '#4A6B8A' },
  { name: 'Educação', kind: 'despesa', color: '#5B6B60' },
  { name: 'Outros', kind: 'despesa', color: '#93998E' },
  { name: 'Salário', kind: 'receita', color: '#2F6F4E' },
  { name: 'Renda extra', kind: 'receita', color: '#4F9B72' },
];

const fmtBRL = (n) => (n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const todayISO = () => new Date().toISOString().slice(0, 10);
const monthKey = (isoDate) => isoDate.slice(0, 7); // YYYY-MM
const monthLabel = (key) => {
  const [y, m] = key.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
};

let currentDashMonth = monthKey(todayISO());
let currentTxFilterMonth = monthKey(todayISO());
let currentBudgetMonth = monthKey(todayISO());

// ------------------------------------------------------------
// AUTENTICAÇÃO
// ------------------------------------------------------------
let isRegisterMode = false;

const authForm = document.getElementById('auth-form');
const authError = document.getElementById('auth-error');
const authSubmit = document.getElementById('auth-submit');
const authToggleBtn = document.getElementById('auth-toggle-btn');
const authToggleText = document.getElementById('auth-toggle-text');

authToggleBtn.addEventListener('click', () => {
  isRegisterMode = !isRegisterMode;
  authSubmit.textContent = isRegisterMode ? 'Criar conta' : 'Entrar';
  authToggleText.textContent = isRegisterMode ? 'Já tem conta?' : 'Ainda não tem conta?';
  authToggleBtn.textContent = isRegisterMode ? 'Entrar' : 'Criar conta';
  authError.style.display = 'none';
});

authForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = document.getElementById('auth-email').value.trim();
  const password = document.getElementById('auth-password').value;
  authError.style.display = 'none';
  authSubmit.disabled = true;
  const originalText = authSubmit.textContent;
  authSubmit.innerHTML = '<span class="loading-spinner"></span>';
  try {
    if (isRegisterMode) {
      await createUserWithEmailAndPassword(auth, email, password);
    } else {
      await signInWithEmailAndPassword(auth, email, password);
    }
  } catch (err) {
    authError.textContent = traduzErroFirebase(err.code);
    authError.style.display = 'block';
  } finally {
    authSubmit.disabled = false;
    authSubmit.textContent = originalText;
  }
});

document.getElementById('logout-btn').addEventListener('click', () => signOut(auth));

function traduzErroFirebase(code) {
  const map = {
    'auth/email-already-in-use': 'Esse e-mail já tem uma conta. Tente entrar.',
    'auth/invalid-email': 'E-mail inválido.',
    'auth/weak-password': 'A senha precisa ter pelo menos 6 caracteres.',
    'auth/user-not-found': 'E-mail ou senha incorretos.',
    'auth/wrong-password': 'E-mail ou senha incorretos.',
    'auth/invalid-credential': 'E-mail ou senha incorretos.',
    'auth/network-request-failed': 'Falha de conexão. Verifique sua internet.',
    'auth/configuration-not-found': 'O login por e-mail/senha não está ativado no Firebase. Veja o README.'
  };
  return map[code] || 'Não foi possível concluir. Tente novamente.';
}

onAuthStateChanged(auth, async (user) => {
  currentUser = user;
  if (user) {
    document.getElementById('auth-screen').style.display = 'none';
    document.getElementById('app-shell').classList.add('active');
    document.getElementById('user-email-label').textContent = user.email;
    await ensureDefaultCategories();
    attachListeners();
  } else {
    document.getElementById('auth-screen').style.display = 'flex';
    document.getElementById('app-shell').classList.remove('active');
    unsubs.forEach((u) => u());
    unsubs = [];
    transactions = []; accounts = []; categories = []; budgets = [];
  }
});

async function ensureDefaultCategories() {
  const snap = await getDocs(collection(db, 'users', currentUser.uid, 'categories'));
  if (snap.empty) {
    const batch = writeBatch(db);
    DEFAULT_CATEGORIES.forEach((cat) => {
      const ref = doc(collection(db, 'users', currentUser.uid, 'categories'));
      batch.set(ref, cat);
    });
    await batch.commit();
  }
}

// ------------------------------------------------------------
// LISTENERS EM TEMPO REAL
// ------------------------------------------------------------
function attachListeners() {
  const uid = currentUser.uid;

  unsubs.push(onSnapshot(collection(db, 'users', uid, 'transactions'), (snap) => {
    transactions = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    renderAll();
  }));

  unsubs.push(onSnapshot(collection(db, 'users', uid, 'accounts'), (snap) => {
    accounts = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    renderAll();
  }));

  unsubs.push(onSnapshot(collection(db, 'users', uid, 'categories'), (snap) => {
    categories = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    renderAll();
  }));

  unsubs.push(onSnapshot(collection(db, 'users', uid, 'budgets'), (snap) => {
    budgets = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    renderAll();
  }));
}

function renderAll() {
  populateMonthSelectors();
  renderDashboard();
  renderTransactions();
  renderAccounts();
  renderCategories();
  renderBudgets();
}

// ------------------------------------------------------------
// NAVEGAÇÃO
// ------------------------------------------------------------
document.getElementById('main-nav').addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-view]');
  if (!btn) return;
  document.querySelectorAll('#main-nav button').forEach((b) => b.classList.remove('active'));
  btn.classList.add('active');
  document.querySelectorAll('.view').forEach((v) => v.classList.remove('active'));
  document.getElementById('view-' + btn.dataset.view).classList.add('active');
});

// ------------------------------------------------------------
// SELETORES DE MÊS
// ------------------------------------------------------------
function getAvailableMonths() {
  const set = new Set(transactions.map((t) => monthKey(t.date)));
  set.add(monthKey(todayISO()));
  return Array.from(set).sort().reverse();
}

function populateMonthSelectors() {
  const months = getAvailableMonths();
  fillMonthSelect('dash-month-select', months, currentDashMonth, (val) => {
    currentDashMonth = val; renderDashboard();
  });
  fillMonthSelect('filter-month', months, currentTxFilterMonth, (val) => {
    currentTxFilterMonth = val; renderTransactions();
  });
  fillMonthSelect('budget-month-select', months, currentBudgetMonth, (val) => {
    currentBudgetMonth = val; renderBudgets();
  });
}

function fillMonthSelect(id, months, selected, onChange) {
  const el = document.getElementById(id);
  if (el.dataset.bound !== 'true') {
    el.addEventListener('change', () => onChange(el.value));
    el.dataset.bound = 'true';
  }
  const current = el.value || selected;
  el.innerHTML = months.map((m) => `<option value="${m}">${capitalize(monthLabel(m))}</option>`).join('');
  el.value = months.includes(current) ? current : months[0];
}

function capitalize(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

// ------------------------------------------------------------
// DASHBOARD
// ------------------------------------------------------------
function renderDashboard() {
  const monthTx = transactions.filter((t) => monthKey(t.date) === currentDashMonth);
  const receitas = monthTx.filter((t) => t.type === 'receita').reduce((s, t) => s + t.amount, 0);
  const despesas = monthTx.filter((t) => t.type === 'despesa').reduce((s, t) => s + t.amount, 0);

  const saldoTotal = accounts
    .filter((a) => a.kind === 'conta')
    .reduce((sum, acc) => {
      const accTx = transactions.filter((t) => t.accountId === acc.id);
      const inc = accTx.filter((t) => t.type === 'receita').reduce((s, t) => s + t.amount, 0);
      const exp = accTx.filter((t) => t.type === 'despesa').reduce((s, t) => s + t.amount, 0);
      return sum + (acc.initialBalance || 0) + inc - exp;
    }, 0);

  document.getElementById('stat-saldo').textContent = fmtBRL(saldoTotal);
  document.getElementById('stat-receitas').textContent = fmtBRL(receitas);
  document.getElementById('stat-despesas').textContent = fmtBRL(despesas);
  document.getElementById('dash-month-label').textContent = capitalize(monthLabel(currentDashMonth));

  renderChartEvolucao();
  renderChartCategorias(monthTx);
  renderDashboardBudgetProgress();
}

function renderChartEvolucao() {
  const months = [];
  const base = currentDashMonth.split('-').map(Number);
  for (let i = 5; i >= 0; i--) {
    const d = new Date(base[0], base[1] - 1 - i, 1);
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  const receitasArr = months.map((m) => transactions.filter((t) => monthKey(t.date) === m && t.type === 'receita').reduce((s, t) => s + t.amount, 0));
  const despesasArr = months.map((m) => transactions.filter((t) => monthKey(t.date) === m && t.type === 'despesa').reduce((s, t) => s + t.amount, 0));
  const labels = months.map((m) => capitalize(new Date(m + '-01').toLocaleDateString('pt-BR', { month: 'short' })));

  const ctx = document.getElementById('chart-evolucao');
  if (chartEvolucao) chartEvolucao.destroy();
  chartEvolucao = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        { label: 'Receitas', data: receitasArr, backgroundColor: '#2F6F4E', borderRadius: 4 },
        { label: 'Despesas', data: despesasArr, backgroundColor: '#B5482A', borderRadius: 4 },
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        y: { ticks: { callback: (v) => 'R$ ' + v }, grid: { color: '#e1e0d9' } },
        x: { grid: { display: false } }
      }
    }
  });
}

function renderChartCategorias(monthTx) {
  const despesas = monthTx.filter((t) => t.type === 'despesa');
  const byCategory = {};
  despesas.forEach((t) => {
    byCategory[t.categoryId] = (byCategory[t.categoryId] || 0) + t.amount;
  });
  const entries = Object.entries(byCategory).sort((a, b) => b[1] - a[1]);
  const labels = entries.map(([catId]) => categories.find((c) => c.id === catId)?.name || 'Sem categoria');
  const data = entries.map(([, v]) => v);
  const colors = entries.map(([catId]) => categories.find((c) => c.id === catId)?.color || '#93998E');
  const total = data.reduce((s, v) => s + v, 0);

  const ctx = document.getElementById('chart-categorias');
  if (chartCategorias) chartCategorias.destroy();

  const legendEl = document.getElementById('chart-categorias-legend');
  if (!data.length) {
    legendEl.innerHTML = '<p class="empty-state" style="padding:8px;">Sem despesas neste mês</p>';
    chartCategorias = new Chart(ctx, { type: 'doughnut', data: { labels: [], datasets: [{ data: [] }] } });
    return;
  }

  chartCategorias = new Chart(ctx, {
    type: 'doughnut',
    data: { labels, datasets: [{ data, backgroundColor: colors, borderWidth: 2, borderColor: '#FFFFFF' }] },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
  });

  legendEl.innerHTML = entries.map(([catId, v], i) => {
    const pct = total ? ((v / total) * 100).toFixed(0) : 0;
    return `<span style="display:flex;align-items:center;gap:5px;"><span class="color-dot" style="background:${colors[i]}"></span>${labels[i]} · ${pct}%</span>`;
  }).join('');
}

function renderDashboardBudgetProgress() {
  const monthBudgets = budgets.filter((b) => b.month === currentDashMonth);
  const el = document.getElementById('dash-budget-progress');
  if (!monthBudgets.length) {
    el.innerHTML = '<p class="empty-state" style="padding:10px 0;">Nenhuma meta definida para este mês. <br>Crie uma na aba "Metas".</p>';
    return;
  }
  el.innerHTML = monthBudgets.map((b) => budgetRowHTML(b)).join('');
}

function budgetRowHTML(b) {
  const cat = categories.find((c) => c.id === b.categoryId);
  const spent = transactions
    .filter((t) => t.categoryId === b.categoryId && monthKey(t.date) === b.month && t.type === 'despesa')
    .reduce((s, t) => s + t.amount, 0);
  const pct = b.limit ? Math.min(100, (spent / b.limit) * 100) : 0;
  const over = spent > b.limit;
  const warn = !over && pct > 80;
  return `
    <div class="budget-row">
      <div class="budget-row-head">
        <span>${cat ? cat.name : 'Categoria removida'}</span>
        <span class="mono">${fmtBRL(spent)} / ${fmtBRL(b.limit)}</span>
      </div>
      <div class="budget-track"><div class="budget-fill ${over ? 'over' : warn ? 'warn' : ''}" style="width:${pct}%"></div></div>
    </div>`;
}

// ------------------------------------------------------------
// LANÇAMENTOS
// ------------------------------------------------------------
document.getElementById('btn-new-transaction').addEventListener('click', () => openTransactionModal());

document.getElementById('filter-type').addEventListener('change', renderTransactions);
document.getElementById('filter-category').addEventListener('change', renderTransactions);

function renderTransactions() {
  const catSelect = document.getElementById('filter-category');
  const prevVal = catSelect.value;
  catSelect.innerHTML = '<option value="todas">Todas as categorias</option>' +
    categories.map((c) => `<option value="${c.id}">${c.name}</option>`).join('');
  catSelect.value = prevVal || 'todas';

  const type = document.getElementById('filter-type').value;
  const catFilter = catSelect.value;

  let list = transactions.filter((t) => monthKey(t.date) === currentTxFilterMonth);
  if (type !== 'todos') list = list.filter((t) => t.type === type);
  if (catFilter !== 'todas') list = list.filter((t) => t.categoryId === catFilter);
  list.sort((a, b) => b.date.localeCompare(a.date));

  const container = document.getElementById('transactions-list');
  if (!list.length) {
    container.innerHTML = `<div class="empty-state"><i class="ti ti-receipt-2" aria-hidden="true"></i>Nenhum lançamento neste período</div>`;
    return;
  }

  container.innerHTML = list.map((t) => {
    const cat = categories.find((c) => c.id === t.categoryId);
    const acc = accounts.find((a) => a.id === t.accountId);
    const dateFmt = new Date(t.date + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
    return `
      <div class="ledger-row">
        <div class="ledger-desc">
          <span class="title">${escapeHTML(t.description || cat?.name || 'Lançamento')}</span>
          <span class="meta">${dateFmt} · ${cat ? cat.name : 'Sem categoria'}${acc ? ' · ' + acc.name : ''}</span>
        </div>
        <span class="ledger-leader"></span>
        <span class="ledger-amount ${t.type === 'receita' ? 'income' : 'expense'} mono">${t.type === 'receita' ? '+' : '-'} ${fmtBRL(t.amount)}</span>
        <span class="ledger-actions">
          <button class="icon-btn" aria-label="Editar" data-edit="${t.id}"><i class="ti ti-edit" aria-hidden="true"></i></button>
          <button class="icon-btn" aria-label="Excluir" data-del="${t.id}"><i class="ti ti-trash" aria-hidden="true"></i></button>
        </span>
      </div>`;
  }).join('');

  container.querySelectorAll('[data-edit]').forEach((b) => b.addEventListener('click', () => openTransactionModal(b.dataset.edit)));
  container.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', () => confirmDelete('transactions', b.dataset.del, 'lançamento')));
}

function openTransactionModal(id) {
  const editing = id ? transactions.find((t) => t.id === id) : null;
  if (!categories.length) { showToast('Crie uma categoria primeiro'); return; }

  const html = `
    <div class="modal-head"><h3>${editing ? 'Editar lançamento' : 'Novo lançamento'}</h3>
      <button class="icon-btn" id="modal-close" aria-label="Fechar"><i class="ti ti-x" aria-hidden="true"></i></button></div>
    <form id="tx-form">
      <div class="form-grid" style="margin-bottom:14px;">
        <div class="field">
          <label>Tipo</label>
          <select id="tx-type">
            <option value="despesa" ${editing?.type === 'despesa' ? 'selected' : ''}>Despesa</option>
            <option value="receita" ${editing?.type === 'receita' ? 'selected' : ''}>Receita</option>
          </select>
        </div>
        <div class="field">
          <label>Valor (R$)</label>
          <input type="number" id="tx-amount" step="0.01" min="0" required value="${editing?.amount ?? ''}">
        </div>
      </div>
      <div class="field">
        <label>Descrição</label>
        <input type="text" id="tx-desc" placeholder="Ex: Mercado do mês" value="${editing ? escapeHTML(editing.description || '') : ''}">
      </div>
      <div class="form-grid" style="margin-bottom:14px;">
        <div class="field">
          <label>Data</label>
          <input type="date" id="tx-date" required value="${editing?.date || todayISO()}">
        </div>
        <div class="field">
          <label>Categoria</label>
          <select id="tx-category">${categories.map((c) => `<option value="${c.id}" ${editing?.categoryId === c.id ? 'selected' : ''}>${c.name}</option>`).join('')}</select>
        </div>
      </div>
      <div class="field">
        <label>Conta/cartão</label>
        <select id="tx-account"><option value="">Nenhuma</option>${accounts.map((a) => `<option value="${a.id}" ${editing?.accountId === a.id ? 'selected' : ''}>${a.name}</option>`).join('')}</select>
      </div>
      <div class="modal-actions">
        <button type="button" class="btn btn-secondary" id="modal-cancel">Cancelar</button>
        <button type="submit" class="btn">${editing ? 'Salvar' : 'Adicionar'}</button>
      </div>
    </form>`;
  openModal(html);

  document.getElementById('tx-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = {
      type: document.getElementById('tx-type').value,
      amount: parseFloat(document.getElementById('tx-amount').value),
      description: document.getElementById('tx-desc').value.trim(),
      date: document.getElementById('tx-date').value,
      categoryId: document.getElementById('tx-category').value,
      accountId: document.getElementById('tx-account').value || null,
    };
    try {
      if (editing) {
        await updateDoc(doc(db, 'users', currentUser.uid, 'transactions', editing.id), data);
        showToast('Lançamento atualizado');
      } else {
        await addDoc(collection(db, 'users', currentUser.uid, 'transactions'), data);
        showToast('Lançamento adicionado');
      }
      closeModal();
    } catch (err) {
      showToast('Erro ao salvar: ' + err.message);
    }
  });
}

// ------------------------------------------------------------
// CONTAS E CARTÕES
// ------------------------------------------------------------
document.getElementById('btn-new-account').addEventListener('click', () => openAccountModal());

function renderAccounts() {
  const container = document.getElementById('accounts-list');
  if (!accounts.length) {
    container.innerHTML = `<div class="empty-state" style="grid-column:1/-1;"><i class="ti ti-credit-card" aria-hidden="true"></i>Nenhuma conta ou cartão cadastrado</div>`;
    return;
  }
  container.innerHTML = accounts.map((a) => {
    const accTx = transactions.filter((t) => t.accountId === a.id);
    if (a.kind === 'conta') {
      const inc = accTx.filter((t) => t.type === 'receita').reduce((s, t) => s + t.amount, 0);
      const exp = accTx.filter((t) => t.type === 'despesa').reduce((s, t) => s + t.amount, 0);
      const balance = (a.initialBalance || 0) + inc - exp;
      return accountCardHTML(a, fmtBRL(balance), 'Saldo atual');
    } else {
      const thisMonth = accTx.filter((t) => monthKey(t.date) === monthKey(todayISO()) && t.type === 'despesa').reduce((s, t) => s + t.amount, 0);
      const label = a.limit ? `de ${fmtBRL(a.limit)} no limite` : 'Sem limite definido';
      return accountCardHTML(a, fmtBRL(thisMonth), `Gasto este mês · ${label}`);
    }
  }).join('');

  container.querySelectorAll('[data-edit-acc]').forEach((b) => b.addEventListener('click', () => openAccountModal(b.dataset.editAcc)));
  container.querySelectorAll('[data-del-acc]').forEach((b) => b.addEventListener('click', () => confirmDelete('accounts', b.dataset.delAcc, 'conta')));
}

function accountCardHTML(a, value, subLabel) {
  return `
    <div class="card account-card">
      <span class="tag account-kind-badge"><i class="ti ${a.kind === 'conta' ? 'ti-building-bank' : 'ti-credit-card'}" aria-hidden="true"></i> ${a.kind === 'conta' ? 'Conta' : 'Cartão'}</span>
      <h3 style="text-transform:none;letter-spacing:0;font-size:15px;color:var(--ink);">${escapeHTML(a.name)}</h3>
      <p class="account-balance mono">${value}</p>
      <p style="font-size:12px;color:var(--ink-faint);margin:0;">${subLabel}</p>
      <div class="ledger-actions" style="margin-left:0;margin-top:4px;">
        <button class="icon-btn" aria-label="Editar" data-edit-acc="${a.id}"><i class="ti ti-edit" aria-hidden="true"></i></button>
        <button class="icon-btn" aria-label="Excluir" data-del-acc="${a.id}"><i class="ti ti-trash" aria-hidden="true"></i></button>
      </div>
    </div>`;
}

function openAccountModal(id) {
  const editing = id ? accounts.find((a) => a.id === id) : null;
  const html = `
    <div class="modal-head"><h3>${editing ? 'Editar conta/cartão' : 'Nova conta/cartão'}</h3>
      <button class="icon-btn" id="modal-close" aria-label="Fechar"><i class="ti ti-x" aria-hidden="true"></i></button></div>
    <form id="acc-form">
      <div class="field">
        <label>Nome</label>
        <input type="text" id="acc-name" required placeholder="Ex: Conta corrente, Cartão Nubank" value="${editing ? escapeHTML(editing.name) : ''}">
      </div>
      <div class="field">
        <label>Tipo</label>
        <select id="acc-kind">
          <option value="conta" ${editing?.kind === 'conta' ? 'selected' : ''}>Conta (corrente, poupança, carteira)</option>
          <option value="cartao" ${editing?.kind === 'cartao' ? 'selected' : ''}>Cartão de crédito</option>
        </select>
      </div>
      <div class="field" id="acc-balance-field">
        <label id="acc-balance-label">Saldo inicial (R$)</label>
        <input type="number" id="acc-balance" step="0.01" value="${editing?.initialBalance ?? editing?.limit ?? 0}">
      </div>
      <div class="modal-actions">
        <button type="button" class="btn btn-secondary" id="modal-cancel">Cancelar</button>
        <button type="submit" class="btn">${editing ? 'Salvar' : 'Adicionar'}</button>
      </div>
    </form>`;
  openModal(html);

  const kindSelect = document.getElementById('acc-kind');
  const balanceLabel = document.getElementById('acc-balance-label');
  const syncLabel = () => { balanceLabel.textContent = kindSelect.value === 'conta' ? 'Saldo inicial (R$)' : 'Limite do cartão (R$)'; };
  kindSelect.addEventListener('change', syncLabel);
  syncLabel();

  document.getElementById('acc-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const kind = kindSelect.value;
    const value = parseFloat(document.getElementById('acc-balance').value) || 0;
    const data = { name: document.getElementById('acc-name').value.trim(), kind };
    if (kind === 'conta') data.initialBalance = value; else data.limit = value;
    try {
      if (editing) {
        await updateDoc(doc(db, 'users', currentUser.uid, 'accounts', editing.id), data);
      } else {
        await addDoc(collection(db, 'users', currentUser.uid, 'accounts'), data);
      }
      showToast('Conta salva');
      closeModal();
    } catch (err) { showToast('Erro: ' + err.message); }
  });
}

// ------------------------------------------------------------
// CATEGORIAS
// ------------------------------------------------------------
document.getElementById('btn-new-category').addEventListener('click', () => openCategoryModal());

const PALETTE = ['#B5482A', '#2F6F4E', '#A9791E', '#4A6B8A', '#8E4E6B', '#5B6B60', '#D17A4A', '#4F9B72'];

function renderCategories() {
  const container = document.getElementById('categories-list');
  if (!categories.length) {
    container.innerHTML = `<div class="empty-state"><i class="ti ti-tags" aria-hidden="true"></i>Nenhuma categoria cadastrada</div>`;
    return;
  }
  container.innerHTML = categories.map((c) => `
    <div class="ledger-row">
      <div class="ledger-desc">
        <span class="title"><span class="color-dot" style="background:${c.color}"></span> &nbsp;${escapeHTML(c.name)}</span>
      </div>
      <span class="ledger-leader"></span>
      <span class="tag">${c.kind === 'receita' ? 'Receita' : 'Despesa'}</span>
      <span class="ledger-actions">
        <button class="icon-btn" aria-label="Editar" data-edit-cat="${c.id}"><i class="ti ti-edit" aria-hidden="true"></i></button>
        <button class="icon-btn" aria-label="Excluir" data-del-cat="${c.id}"><i class="ti ti-trash" aria-hidden="true"></i></button>
      </span>
    </div>`).join('');

  container.querySelectorAll('[data-edit-cat]').forEach((b) => b.addEventListener('click', () => openCategoryModal(b.dataset.editCat)));
  container.querySelectorAll('[data-del-cat]').forEach((b) => b.addEventListener('click', () => confirmDelete('categories', b.dataset.delCat, 'categoria')));
}

function openCategoryModal(id) {
  const editing = id ? categories.find((c) => c.id === id) : null;
  const color = editing?.color || PALETTE[categories.length % PALETTE.length];
  const html = `
    <div class="modal-head"><h3>${editing ? 'Editar categoria' : 'Nova categoria'}</h3>
      <button class="icon-btn" id="modal-close" aria-label="Fechar"><i class="ti ti-x" aria-hidden="true"></i></button></div>
    <form id="cat-form">
      <div class="field">
        <label>Nome</label>
        <input type="text" id="cat-name" required value="${editing ? escapeHTML(editing.name) : ''}">
      </div>
      <div class="field">
        <label>Tipo</label>
        <select id="cat-kind">
          <option value="despesa" ${editing?.kind === 'despesa' ? 'selected' : ''}>Despesa</option>
          <option value="receita" ${editing?.kind === 'receita' ? 'selected' : ''}>Receita</option>
        </select>
      </div>
      <div class="field">
        <label>Cor</label>
        <input type="color" id="cat-color" value="${color}" style="width:100%;height:38px;padding:2px;">
      </div>
      <div class="modal-actions">
        <button type="button" class="btn btn-secondary" id="modal-cancel">Cancelar</button>
        <button type="submit" class="btn">${editing ? 'Salvar' : 'Adicionar'}</button>
      </div>
    </form>`;
  openModal(html);

  document.getElementById('cat-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = {
      name: document.getElementById('cat-name').value.trim(),
      kind: document.getElementById('cat-kind').value,
      color: document.getElementById('cat-color').value,
    };
    try {
      if (editing) {
        await updateDoc(doc(db, 'users', currentUser.uid, 'categories', editing.id), data);
      } else {
        await addDoc(collection(db, 'users', currentUser.uid, 'categories'), data);
      }
      showToast('Categoria salva');
      closeModal();
    } catch (err) { showToast('Erro: ' + err.message); }
  });
}

// ------------------------------------------------------------
// METAS / ORÇAMENTO
// ------------------------------------------------------------
document.getElementById('btn-new-budget').addEventListener('click', () => openBudgetModal());

function renderBudgets() {
  const container = document.getElementById('budgets-list');
  const list = budgets.filter((b) => b.month === currentBudgetMonth);
  if (!list.length) {
    container.innerHTML = `<div class="empty-state"><i class="ti ti-target-arrow" aria-hidden="true"></i>Nenhuma meta para este mês</div>`;
    return;
  }
  container.innerHTML = list.map((b) => {
    const cat = categories.find((c) => c.id === b.categoryId);
    return `<div style="display:flex;align-items:center;gap:10px;">
      <div style="flex:1;">${budgetRowHTML(b)}</div>
      <span class="ledger-actions">
        <button class="icon-btn" aria-label="Editar" data-edit-bud="${b.id}"><i class="ti ti-edit" aria-hidden="true"></i></button>
        <button class="icon-btn" aria-label="Excluir" data-del-bud="${b.id}"><i class="ti ti-trash" aria-hidden="true"></i></button>
      </span>
    </div>`;
  }).join('');

  container.querySelectorAll('[data-edit-bud]').forEach((b) => b.addEventListener('click', () => openBudgetModal(b.dataset.editBud)));
  container.querySelectorAll('[data-del-bud]').forEach((b) => b.addEventListener('click', () => confirmDelete('budgets', b.dataset.delBud, 'meta')));
}

function openBudgetModal(id) {
  const editing = id ? budgets.find((b) => b.id === id) : null;
  const expenseCats = categories.filter((c) => c.kind === 'despesa');
  if (!expenseCats.length) { showToast('Crie uma categoria de despesa primeiro'); return; }
  const html = `
    <div class="modal-head"><h3>${editing ? 'Editar meta' : 'Nova meta'}</h3>
      <button class="icon-btn" id="modal-close" aria-label="Fechar"><i class="ti ti-x" aria-hidden="true"></i></button></div>
    <form id="bud-form">
      <div class="field">
        <label>Categoria</label>
        <select id="bud-category">${expenseCats.map((c) => `<option value="${c.id}" ${editing?.categoryId === c.id ? 'selected' : ''}>${c.name}</option>`).join('')}</select>
      </div>
      <div class="field">
        <label>Mês</label>
        <input type="month" id="bud-month" required value="${editing?.month || currentBudgetMonth}">
      </div>
      <div class="field">
        <label>Limite (R$)</label>
        <input type="number" id="bud-limit" step="0.01" min="0" required value="${editing?.limit ?? ''}">
      </div>
      <div class="modal-actions">
        <button type="button" class="btn btn-secondary" id="modal-cancel">Cancelar</button>
        <button type="submit" class="btn">${editing ? 'Salvar' : 'Adicionar'}</button>
      </div>
    </form>`;
  openModal(html);

  document.getElementById('bud-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = {
      categoryId: document.getElementById('bud-category').value,
      month: document.getElementById('bud-month').value,
      limit: parseFloat(document.getElementById('bud-limit').value),
    };
    try {
      if (editing) {
        await updateDoc(doc(db, 'users', currentUser.uid, 'budgets', editing.id), data);
      } else {
        await addDoc(collection(db, 'users', currentUser.uid, 'budgets'), data);
      }
      showToast('Meta salva');
      closeModal();
    } catch (err) { showToast('Erro: ' + err.message); }
  });
}

// ------------------------------------------------------------
// MODAL / TOAST / HELPERS
// ------------------------------------------------------------
function openModal(html) {
  document.getElementById('modal-content').innerHTML = html;
  document.getElementById('modal-overlay').classList.add('active');
  document.getElementById('modal-close')?.addEventListener('click', closeModal);
  document.getElementById('modal-cancel')?.addEventListener('click', closeModal);
}

function closeModal() {
  document.getElementById('modal-overlay').classList.remove('active');
  document.getElementById('modal-content').innerHTML = '';
}

document.getElementById('modal-overlay').addEventListener('click', (e) => {
  if (e.target.id === 'modal-overlay') closeModal();
});

async function confirmDelete(coll, id, label) {
  if (!confirm(`Excluir este ${label}? Essa ação não pode ser desfeita.`)) return;
  try {
    await deleteDoc(doc(db, 'users', currentUser.uid, coll, id));
    showToast(capitalize(label) + ' excluído');
  } catch (err) { showToast('Erro: ' + err.message); }
}

let toastTimer;
function showToast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
}

function escapeHTML(str) {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}
