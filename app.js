// ==============================================
// alc_log - frontend
// GAS URL is public; authentication is performed by GAS.
// ==============================================
const GAS_URL = 'https://script.google.com/macros/s/AKfycbwv9OHxm51hDhNH9wyUZA2GACj3xpNBLiwtT-PKkGIBS3rVwQWBNW1AE0VcY5TF7AyyuA/exec';

const AUTH_STORAGE_KEY = 'alcLogAuth';

const state = {
  userName: '',
  token: '',
  records: [],
  currentDataId: null,
  busy: false
};

const views = {
  login: document.getElementById('view-login'),
  list: document.getElementById('view-list'),
  form: document.getElementById('view-form'),
  detail: document.getElementById('view-detail')
};

const header = document.getElementById('app-header');
const loading = document.getElementById('loading');
const loginButton = document.getElementById('btn-login');
const registerButton = document.getElementById('btn-register');
const registrationPanel = document.getElementById('registration-panel');
const registrationCodeInput = document.getElementById('input-registration-code');
const passwordInput = document.getElementById('input-password');

window.addEventListener('DOMContentLoaded', initialize);

async function initialize() {
  setupEventListeners();

  const stored = loadAuth();
  if (!stored) {
    showView('login');
    return;
  }

  state.userName = stored.userName;
  state.token = stored.token;
  showView('list');
  await fetchData(false, true);
}

function showView(viewName) {
  Object.values(views).forEach(view => view.classList.add('hidden'));
  views[viewName].classList.remove('hidden');
  header.classList.toggle('hidden', viewName === 'login');
}

// ==============================================
// API通信
// GETを使わず、認証トークンもURLに載せない。
// Content-Typeを明示せずtext/plain相当で送信し、GAS Webアプリの
// CORSプリフライトを発生させない。
// ==============================================
async function apiRequest(payload) {
  const response = await fetch(GAS_URL, {
    method: 'POST',
    cache: 'no-store',
    body: JSON.stringify(payload)
  });

  if (!response.ok) throw new Error(`HTTP ${response.status}`);

  const data = await response.json();
  if (!data || typeof data !== 'object') throw new Error('Invalid API response');
  return data;
}

async function fetchData(isBackground = false, onStartup = false) {
  if (!state.token) return false;
  if (!isBackground) showLoading(true);

  try {
    const data = await apiRequest({ action: 'list', token: state.token });

    if (data.error) {
      handleAuthError(data.error, onStartup);
      return false;
    }

    if (!Array.isArray(data)) throw new Error('Invalid record response');

    state.records = data;
    renderList();

    if (state.currentDataId !== null && !views.detail.classList.contains('hidden')) {
      openDetail(state.currentDataId, true);
    }
    return true;
  } catch (err) {
    console.error('fetchData:', err);
    if (!isBackground) alert('データの取得に失敗しました。通信環境を確認してください。');
    return false;
  } finally {
    if (!isBackground) showLoading(false);
  }
}

async function saveData(savePayload) {
  if (state.busy || !state.token) return;
  setBusy(true);
  showLoading(true);

  try {
    const result = await apiRequest({
      action: 'save',
      token: state.token,
      data: savePayload
    });

    if (result.error) {
      handleAuthError(result.error, false);
      return;
    }

    if (!result.success) throw new Error('保存に失敗しました');

    const updated = await fetchData(true);
    if (!updated) throw new Error('保存後のデータ取得に失敗しました');

    state.currentDataId = null;
    showView('list');
  } catch (err) {
    console.error('saveData:', err);
    alert('保存に失敗しました。入力内容を確認してください。');
  } finally {
    showLoading(false);
    setBusy(false);
  }
}

async function login() {
  if (state.busy) return;

  const userName = document.getElementById('input-username').value.trim();
  const password = passwordInput.value;
  if (!userName) return alert('ユーザー名を入力してください');
  if (password.length < 10) return alert('パスワードは10文字以上にしてください');

  setAuthBusy(true);
  showLoading(true);

  try {
    const result = await apiRequest({ action: 'login', userName, password });
    if (!result.success || !result.token) {
      throw new Error(result.error || 'ログインに失敗しました');
    }

    state.userName = result.userName;
    state.token = result.token;
    state.records = [];
    state.currentDataId = null;
    saveAuth();
    passwordInput.value = '';
    showView('list');

    const loaded = await fetchData(true);
    if (!loaded) throw new Error('データ取得に失敗しました');
  } catch (err) {
    console.error('login:', err);
    state.userName = '';
    state.token = '';
    clearAuth();
    showView('login');
    alert(err.message || 'ログインに失敗しました');
  } finally {
    showLoading(false);
    setAuthBusy(false);
  }
}

async function register() {
  if (state.busy) return;

  const userName = document.getElementById('input-username').value.trim();
  const password = passwordInput.value;
  const registrationCode = registrationCodeInput.value.trim();

  if (!userName) return alert('ユーザー名を入力してください');
  if (password.length < 10) return alert('パスワードは10文字以上にしてください');
  if (!registrationCode) return alert('登録コードを入力してください');

  setAuthBusy(true);
  showLoading(true);

  try {
    const result = await apiRequest({
      action: 'register',
      userName,
      password,
      registrationCode
    });

    if (!result.success || !result.token) {
      throw new Error(result.error || '登録に失敗しました');
    }

    state.userName = result.userName;
    state.token = result.token;
    state.records = [];
    state.currentDataId = null;
    saveAuth();
    passwordInput.value = '';
    registrationCodeInput.value = '';
    registrationPanel.classList.add('hidden');
    showView('list');
    await fetchData(true);
  } catch (err) {
    console.error('register:', err);
    alert(err.message || '登録に失敗しました');
  } finally {
    showLoading(false);
    setAuthBusy(false);
  }
}

async function logout() {
  const token = state.token;
  clearAuth();
  state.userName = '';
  state.token = '';
  state.records = [];
  state.currentDataId = null;
  passwordInput.value = '';
  registrationCodeInput.value = '';
  document.getElementById('input-username').value = '';
  showView('login');

  if (token) {
    try {
      await apiRequest({ action: 'logout', token });
    } catch (err) {
      // ローカル側のログアウトは完了しているため、ここでは何もしない。
      console.warn('logout:', err);
    }
  }
}

function handleAuthError(message, onStartup) {
  clearAuth();
  state.userName = '';
  state.token = '';
  state.records = [];
  state.currentDataId = null;
  showView('login');
  if (!onStartup) alert(message || '認証が無効です。もう一度ログインしてください。');
}

// ==============================================
// イベントリスナー
// ==============================================
function setupEventListeners() {
  loginButton.addEventListener('click', login);
  registerButton.addEventListener('click', register);

  document.getElementById('btn-show-register').addEventListener('click', () => {
    registrationPanel.classList.toggle('hidden');
    if (!registrationPanel.classList.contains('hidden')) registrationCodeInput.focus();
  });

  document.getElementById('input-username').addEventListener('keydown', e => {
    if (e.key === 'Enter') passwordInput.focus();
  });
  passwordInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') login();
  });

  document.getElementById('btn-logout').addEventListener('click', () => {
    if (confirm('ログアウトしますか？')) logout();
  });

  document.getElementById('btn-add').addEventListener('click', () => openForm());

  ['filter-category', 'filter-rating', 'filter-location'].forEach(id => {
    document.getElementById(id).addEventListener('change', renderList);
  });

  document.querySelectorAll('.btn-back').forEach(btn => {
    btn.addEventListener('click', () => {
      state.currentDataId = null;
      showView('list');
    });
  });

  document.getElementById('btn-edit').addEventListener('click', () => {
    if (state.currentDataId !== null) openForm(state.currentDataId);
  });

  document.getElementById('btn-save').addEventListener('click', handleSave);

  document.getElementById('form-rating-stars').addEventListener('click', e => {
    const star = e.target.closest('span[data-val]');
    if (!star) return;
    const val = Number(star.dataset.val);
    document.getElementById('form-rating').value = val;
    updateStarUI(val);
  });
}

// ==============================================
// 一覧描画
// user dataはinnerHTMLに入れずtextContentで描画する。
// ==============================================
function renderList() {
  const container = document.getElementById('list-container');
  container.replaceChildren();

  const catFilter = document.getElementById('filter-category').value;
  const rateFilter = document.getElementById('filter-rating').value;
  const locFilter = document.getElementById('filter-location').value;

  const filtered = state.records.filter(record => {
    if (catFilter !== 'all' && normalizeString(record.category) !== catFilter) return false;
    if (locFilter !== 'all' && normalizeString(record.location) !== locFilter) return false;
    if (rateFilter !== 'all' && getRating(record.rating) !== Number(rateFilter)) return false;
    return true;
  });

  if (filtered.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'empty-msg';
    empty.textContent = '記録がありません';
    container.appendChild(empty);
    return;
  }

  filtered.forEach(record => {
    const card = document.createElement('div');
    card.className = 'card';
    card.tabIndex = 0;
    card.setAttribute('role', 'button');
    card.addEventListener('click', () => openDetail(record.id));
    card.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openDetail(record.id);
      }
    });

    const headerEl = document.createElement('div');
    headerEl.className = 'card-header';

    const tag = document.createElement('span');
    tag.className = 'tag';
    tag.textContent = record.category || 'カテゴリなし';

    const date = document.createElement('span');
    date.className = 'date-text';
    date.textContent = formatDate(record.date) || '日付未定';

    headerEl.append(tag, date);

    const title = document.createElement('h3');
    title.className = 'card-title';
    title.textContent = record.name || '';

    const stars = document.createElement('div');
    stars.className = 'stars';
    stars.textContent = ratingString(record.rating);

    card.append(headerEl, title, stars);
    container.appendChild(card);
  });
}

function openDetail(id, isSilentUpdate = false) {
  const record = state.records.find(item => String(item.id) === String(id));
  if (!record) return;

  state.currentDataId = record.id;
  setText('detail-category', record.category || '未回答');
  setText('detail-date', formatDate(record.date) || '未回答');
  setText('detail-name', record.name || '');
  setRatingElement(document.getElementById('detail-rating'), getRating(record.rating));
  setText('detail-location', record.location || '未回答');
  setText('detail-comment', record.comment || '未回答');

  if (!isSilentUpdate) showView('detail');
}

function openForm(id = null) {
  const isEdit = id !== null;
  document.getElementById('form-title').textContent = isEdit ? '記録の修正' : '記録の追加';

  const ids = ['form-id', 'form-name', 'form-date', 'form-category', 'form-location', 'form-comment'];

  if (isEdit) {
    const record = state.records.find(item => String(item.id) === String(id));
    if (!record) return;
    ids.forEach(key => {
      const fieldId = key.replace('form-', '');
      const value = fieldId === 'date' ? (record[fieldId] || '') : (record[fieldId] || '');
      document.getElementById(key).value = value;
    });
    const rating = getRating(record.rating);
    document.getElementById('form-rating').value = rating;
    updateStarUI(rating);
  } else {
    ids.forEach(key => document.getElementById(key).value = '');
    document.getElementById('form-date').value = todayLocalISO();
    document.getElementById('form-rating').value = 0;
    updateStarUI(0);
  }

  showView('form');
}

function handleSave() {
  if (state.busy) return;
  const name = document.getElementById('form-name').value.trim();
  if (!name) return alert('お酒の名前は必須です。');

  const payload = {
    id: document.getElementById('form-id').value,
    name,
    date: document.getElementById('form-date').value,
    rating: document.getElementById('form-rating').value,
    category: document.getElementById('form-category').value,
    location: document.getElementById('form-location').value,
    comment: document.getElementById('form-comment').value
  };

  saveData(payload);
}

// ==============================================
// ユーティリティ
// ==============================================
function updateStarUI(value) {
  const rating = Math.max(0, Math.min(5, Number(value) || 0));
  document.querySelectorAll('#form-rating-stars span').forEach(star => {
    const starVal = Number(star.dataset.val);
    const active = starVal <= rating;
    star.classList.toggle('active', active);
    star.textContent = active ? '★' : '☆';
  });
}

function setRatingElement(element, rating) {
  if (rating > 0) {
    element.textContent = ratingString(rating);
    element.classList.remove('unanswered');
  } else {
    element.textContent = '評価未回答';
    element.classList.add('unanswered');
  }
}

function setText(id, value) {
  const element = document.getElementById(id);
  element.textContent = value;
  if (value === '未回答') element.classList.add('unanswered');
  else element.classList.remove('unanswered');
}

function ratingString(value) {
  const rating = getRating(value);
  return '★'.repeat(rating) + '☆'.repeat(5 - rating);
}

function getRating(value) {
  const rating = Number.parseInt(value, 10);
  return Number.isInteger(rating) && rating >= 0 && rating <= 5 ? rating : 0;
}

function normalizeString(value) {
  return value === null || value === undefined ? '' : String(value);
}

function formatDate(value) {
  const text = String(value || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return '';
  const [year, month, day] = text.split('-');
  return `${year}/${month}/${day}`;
}

function todayLocalISO() {
  const date = new Date();
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

function showLoading(show) {
  loading.classList.toggle('hidden', !show);
}

function setAuthBusy(busy) {
  state.busy = busy;
  loginButton.disabled = busy;
  registerButton.disabled = busy;
}

function setBusy(busy) {
  state.busy = busy;
  document.getElementById('btn-save').disabled = busy;
}

function saveAuth() {
  sessionStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify({
    userName: state.userName,
    token: state.token
  }));
}

function loadAuth() {
  try {
    const raw = sessionStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || typeof data.userName !== 'string' || typeof data.token !== 'string') return null;
    if (!data.userName || !data.token) return null;
    return data;
  } catch (err) {
    clearAuth();
    return null;
  }
}

function clearAuth() {
  sessionStorage.removeItem(AUTH_STORAGE_KEY);
}
