// ==============================================
// 1. 設定事項（GASのデプロイURLをここに貼る）
// ==============================================
const GAS_URL = 'https://script.google.com/macros/s/AKfycbwSl6lJr3mao3nM6OBBo-9LMcXMU2SDkpMU4a6LVlyTSgvDKQRO47JNMQpgaQRXN7qPfw/exec';

// ==============================================
// 状態管理
// ==============================================
let state = {
  userName: localStorage.getItem('sakeLogUser') || '',
  records: [],
  currentDataId: null // 詳細・編集表示中のID
};

// ==============================================
// DOM要素のキャッシュ
// ==============================================
const views = {
  login: document.getElementById('view-login'),
  list: document.getElementById('view-list'),
  form: document.getElementById('view-form'),
  detail: document.getElementById('view-detail')
};
const header = document.getElementById('app-header');
const loading = document.getElementById('loading');

// ==============================================
// 初期化・ルーティング処理
// ==============================================
window.addEventListener('DOMContentLoaded', () => {
  if (state.userName) {
    showView('list');
    fetchData();
  } else {
    showView('login');
  }
  setupEventListeners();
});

function showView(viewName) {
  Object.values(views).forEach(v => v.classList.add('hidden'));
  views[viewName].classList.remove('hidden');
  
  // ログイン画面以外はヘッダーを表示
  if (viewName === 'login') {
    header.classList.add('hidden');
  } else {
    header.classList.remove('hidden');
  }
}

// ==============================================
// API通信処理
// ==============================================
async function fetchData() {
  if (!state.userName) return;
  showLoading(true);
  try {
    const url = `${GAS_URL}?userName=${encodeURIComponent(state.userName)}`;
    const res = await fetch(url);
    const data = await res.json();
    state.records = data;
    renderList();
  } catch (err) {
    alert('データの取得に失敗しました。通信環境を確認してください。');
    console.error(err);
  } finally {
    showLoading(false);
  }
}

async function saveData(savePayload) {
  showLoading(true);
  try {
    // CORSエラーを避けるため、オプション無し(text/plain)でPOST送信
    const res = await fetch(GAS_URL, {
      method: 'POST',
      body: JSON.stringify({
        userName: state.userName,
        action: 'save',
        data: savePayload
      })
    });
    const result = await res.json();
    if (result.success) {
      await fetchData(); // リロードして一覧へ戻る
      showView('list');
    } else {
      throw new Error(result.error);
    }
  } catch (err) {
    alert('保存に失敗しました。');
    console.error(err);
  } finally {
    showLoading(false);
  }
}

// ==============================================
// イベントリスナーの登録
// ==============================================
function setupEventListeners() {
  // ログイン・ログアウト
  document.getElementById('btn-login').addEventListener('click', () => {
    const nameInput = document.getElementById('input-username').value.trim();
    if (!nameInput) return alert('名前を入力してください');
    state.userName = nameInput;
    localStorage.setItem('sakeLogUser', nameInput);
    showView('list');
    fetchData();
  });
  
  document.getElementById('btn-logout').addEventListener('click', () => {
    if(confirm('ログアウト（ユーザー切り替え）しますか？')) {
      localStorage.removeItem('sakeLogUser');
      state.userName = '';
      state.records = [];
      document.getElementById('input-username').value = '';
      showView('login');
    }
  });

  // 一覧画面の操作
  document.getElementById('btn-add').addEventListener('click', () => openForm());
  
  // フィルター変更
  ['filter-category', 'filter-rating', 'filter-location'].forEach(id => {
    document.getElementById(id).addEventListener('change', renderList);
  });

  // 戻るボタン
  document.querySelectorAll('.btn-back').forEach(btn => {
    btn.addEventListener('click', () => showView('list'));
  });

  // 詳細から編集へ
  document.getElementById('btn-edit').addEventListener('click', () => openForm(state.currentDataId));

  // フォーム保存
  document.getElementById('btn-save').addEventListener('click', handleSave);

  // フォームの星評価UI
  const stars = document.querySelectorAll('#form-rating-stars span');
  const ratingInput = document.getElementById('form-rating');
  stars.forEach(star => {
    star.addEventListener('click', (e) => {
      const val = parseInt(e.target.getAttribute('data-val'));
      ratingInput.value = val;
      updateStarUI(val);
    });
  });
}

// ==============================================
// レンダリング・画面描画ロジック
// ==============================================
function renderList() {
  const container = document.getElementById('list-container');
  container.innerHTML = '';

  const catFilter = document.getElementById('filter-category').value;
  const rateFilter = document.getElementById('filter-rating').value;
  const locFilter = document.getElementById('filter-location').value;

  const filtered = state.records.filter(r => {
    if (catFilter !== 'all' && r.category !== catFilter) return false;
    if (locFilter !== 'all' && r.location !== locFilter) return false;
    if (rateFilter !== 'all' && parseInt(r.rating || 0) < parseInt(rateFilter)) return false;
    return true;
  });

  if (filtered.length === 0) {
    container.innerHTML = '<p class="empty-msg">記録がありません</p>';
    return;
  }

  filtered.forEach(r => {
    const card = document.createElement('div');
    card.className = 'card';
    card.onclick = () => openDetail(r.id);
    
    // 表示用文字列の生成
    const rateStr = '★'.repeat(r.rating || 0) + '☆'.repeat(5 - (r.rating || 0));
    const dateStr = r.date ? new Date(r.date).toLocaleDateString('ja-JP') : '日付未定';
    
    card.innerHTML = `
      <div class="card-header">
        <span class="tag">${escapeHTML(r.category) || 'カテゴリなし'}</span>
        <span class="date-text">${dateStr}</span>
      </div>
      <h3 class="card-title">${escapeHTML(r.name)}</h3>
      <div class="stars">${rateStr}</div>
    `;
    container.appendChild(card);
  });
}

function openDetail(id) {
  const record = state.records.find(r => r.id.toString() === id.toString());
  if (!record) return;
  state.currentDataId = record.id;

  const formatText = (text) => text ? escapeHTML(text) : '<span class="unanswered">未回答</span>';
  
  document.getElementById('detail-category').innerHTML = formatText(record.category);
  document.getElementById('detail-date').innerHTML = record.date ? new Date(record.date).toLocaleDateString('ja-JP') : '<span class="unanswered">未回答</span>';
  document.getElementById('detail-name').innerHTML = escapeHTML(record.name);
  
  const rating = record.rating ? parseInt(record.rating) : 0;
  document.getElementById('detail-rating').innerHTML = rating > 0 ? ('★'.repeat(rating) + '☆'.repeat(5 - rating)) : '<span class="unanswered">評価未回答</span>';
  
  document.getElementById('detail-location').innerHTML = formatText(record.location);
  document.getElementById('detail-comment').innerHTML = formatText(record.comment);

  showView('detail');
}

function openForm(id = null) {
  const isEdit = id !== null;
  document.getElementById('form-title').textContent = isEdit ? '記録の修正' : '記録の追加';
  
  const ids = ['form-id', 'form-name', 'form-date', 'form-category', 'form-location', 'form-comment'];
  
  if (isEdit) {
    const record = state.records.find(r => r.id.toString() === id.toString());
    ids.forEach(key => {
      const fieldId = key.replace('form-', '');
      let val = record[fieldId] || '';
      if(fieldId === 'date' && val) val = new Date(val).toISOString().split('T')[0]; // YYYY-MM-DD
      document.getElementById(key).value = val;
    });
    const rating = record.rating || 0;
    document.getElementById('form-rating').value = rating;
    updateStarUI(rating);
  } else {
    // 新規登録の初期値クリアと今日の日付セット
    ids.forEach(key => document.getElementById(key).value = '');
    const today = new Date().toLocaleDateString('sv-SE'); // YYYY-MM-DD形式 (Swedenロケールハック)
    document.getElementById('form-date').value = today;
    document.getElementById('form-rating').value = 0;
    updateStarUI(0);
  }
  
  showView('form');
}

function handleSave() {
  const name = document.getElementById('form-name').value.trim();
  if (!name) return alert('お酒の名前は必須です。');

  const payload = {
    id: document.getElementById('form-id').value,
    name: name,
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
function updateStarUI(val) {
  const stars = document.querySelectorAll('#form-rating-stars span');
  stars.forEach(star => {
    const starVal = parseInt(star.getAttribute('data-val'));
    star.classList.toggle('active', starVal <= val);
    star.textContent = starVal <= val ? '★' : '☆';
  });
}

function showLoading(show) {
  loading.classList.toggle('hidden', !show);
}

function escapeHTML(str) {
  if(!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}