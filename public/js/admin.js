/* Route 66 Coffee Diner — адмін-панель */
(function () {
  'use strict';
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const store = { get: k => { try { return sessionStorage.getItem(k); } catch (e) { return null; } }, set: (k, v) => { try { v == null ? sessionStorage.removeItem(k) : sessionStorage.setItem(k, v); } catch (e) {} } };

  let token = store.get('r66token');
  let menu = { currency: '₴', categories: [] }, reviews = [], settings = {}, dirty = false;

  async function api(path, method = 'GET', body) {
    const r = await fetch('api/' + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
    const d = await r.json().catch(() => ({}));
    if (r.status === 401 && path !== 'login') { logout(); throw new Error('Сесія завершилась, увійдіть знову'); }
    if (!r.ok) throw new Error(d.error || 'Помилка ' + r.status);
    return d;
  }
  let tt;
  function toast(msg, bad) { const t = $('#toast'); t.textContent = msg; t.className = 'toast show' + (bad ? ' bad' : ''); clearTimeout(tt); tt = setTimeout(() => (t.className = 'toast'), 2800); }
  function setDirty(v) { dirty = v; document.body.classList.toggle('dirty', v); }
  window.addEventListener('beforeunload', e => { if (dirty) { e.preventDefault(); e.returnValue = ''; } });

  /* ---------- вхід ---------- */
  $('#loginForm').addEventListener('submit', async e => {
    e.preventDefault(); $('#loginErr').textContent = '';
    try {
      const r = await api('login', 'POST', { password: $('#pw').value });
      token = r.token; store.set('r66token', token); store.set('r66default', r.isDefault ? '1' : '');
      $('#pw').value = ''; start();
    } catch (err) { $('#loginErr').textContent = err.message; }
  });
  function logout() { token = null; store.set('r66token', null); $('#appView').hidden = true; $('#loginView').hidden = false; }
  $('#logout').addEventListener('click', () => { if (!dirty || confirm('Є незбережені зміни. Все одно вийти?')) { setDirty(false); logout(); } });

  async function start() {
    $('#loginView').hidden = true; $('#appView').hidden = false;
    $('#defaultPwWarn').hidden = !store.get('r66default');
    try {
      [menu, settings, reviews] = await Promise.all([api('menu'), api('settings'), api('reviews?all=1')]);
      menu.categories = menu.categories || [];
      renderMenu(); fillSettings(); renderReviews();
    } catch (err) { toast(err.message, true); }
  }

  /* ---------- вкладки ---------- */
  $$('.tab').forEach(t => t.addEventListener('click', () => {
    $$('.tab').forEach(x => x.classList.toggle('active', x === t));
    $$('.pane').forEach(p => (p.hidden = p.id !== 'pane-' + t.dataset.tab));
  }));

  /* ---------- меню ---------- */
  const BADGES = ['', 'новинка', 'хіт', 'сезон'];
  function itemHTML(it, ci, ii) {
    const vars = it.variants && it.variants.length ? it.variants : [{ label: '', price: null }];
    return `<div class="item${it.hidden ? ' is-hidden' : ''}" data-ci="${ci}" data-ii="${ii}">
      <span class="handle" title="Порядок">⋮⋮</span>
      <div class="i-main">
        <input class="i-name" data-f="name" value="${esc(it.name)}" placeholder="Назва позиції">
        <input data-f="desc" value="${esc(it.desc || '')}" placeholder="Опис (необовʼязково)">
        <div class="i-row">
          <select data-f="badge" title="Позначка">${BADGES.map(b => `<option value="${b}"${(it.badge || '') === b ? ' selected' : ''}>${b || 'без позначки'}</option>`).join('')}</select>
          <input data-f="image" value="${esc(it.image || '')}" placeholder="Фото: посилання (необовʼязково)">
        </div>
      </div>
      <div class="variants">
        ${vars.map((v, vi) => `<div class="var" data-vi="${vi}">
          <input class="v-label" data-v="label" value="${esc(v.label || '')}" placeholder="обʼєм / варіант (можна порожньо)">
          <input class="v-price" data-v="price" type="number" min="0" step="1" value="${v.price == null ? '' : v.price}" placeholder="ціна">
          <span class="cur">₴</span>
          ${vars.length > 1 ? `<button class="icon-btn" data-act="delVar" title="Видалити варіант">✕</button>` : ''}
        </div>`).join('')}
        <button class="link add-var" data-act="addVar">+ ще обʼєм / варіант</button>
      </div>
      <div class="i-actions">
        <button class="icon-btn" data-act="itemUp" title="Вище">↑</button>
        <button class="icon-btn" data-act="itemDown" title="Нижче">↓</button>
        <button class="icon-btn" data-act="itemHide" title="${it.hidden ? 'Показати на сайті' : 'Сховати (немає в наявності)'}">${it.hidden ? '🚫' : '👁'}</button>
        <button class="icon-btn" data-act="itemDel" title="Видалити">🗑</button>
      </div>
    </div>`;
  }
  function renderMenu() {
    const open = new Set($$('.cat:not(.collapsed)').map(c => c.dataset.ci));
    const first = !$('.cat');
    $('#cats').innerHTML = menu.categories.map((c, ci) => `
      <section class="cat${c.hidden ? ' is-hidden' : ''}${first || open.has(String(ci)) ? '' : ' collapsed'}" data-ci="${ci}">
        <div class="cat-head">
          <button class="icon-btn" data-act="toggle" title="Згорнути / розгорнути">▾</button>
          <input class="c-icon" data-c="icon" value="${esc(c.icon || '')}" title="Іконка (емодзі)">
          <input class="c-name" data-c="name" value="${esc(c.name)}" placeholder="Назва категорії">
          <input class="c-desc" data-c="description" value="${esc(c.description || '')}" placeholder="Підзаголовок">
          <span>${(c.items || []).length} поз.</span>
          <button class="icon-btn" data-act="catUp" title="Вище">↑</button>
          <button class="icon-btn" data-act="catDown" title="Нижче">↓</button>
          <button class="icon-btn" data-act="catHide" title="${c.hidden ? 'Показати категорію' : 'Сховати категорію'}">${c.hidden ? '🚫' : '👁'}</button>
          <button class="icon-btn" data-act="catDel" title="Видалити категорію">🗑</button>
        </div>
        <div class="cat-body">
          ${(c.items || []).map((it, ii) => itemHTML(it, ci, ii)).join('')}
          <button class="btn btn-sec add-item" data-act="addItem">+ Додати позицію</button>
        </div>
      </section>`).join('') || '<div class="empty">Меню порожнє. Додайте першу категорію.</div>';
    if (first) $$('.cat').forEach((c, i) => c.classList.toggle('collapsed', i > 0));
    $('#bulkCat').innerHTML = '<option value="all">усе меню</option>' + menu.categories.map((c, i) => `<option value="${i}">${esc(c.name)}</option>`).join('');
    applySearch();
  }
  const ctx = el => {
    const cat = el.closest('.cat'), item = el.closest('.item'), v = el.closest('.var');
    return { ci: cat ? +cat.dataset.ci : -1, ii: item ? +item.dataset.ii : -1, vi: v ? +v.dataset.vi : -1 };
  };
  $('#cats').addEventListener('input', e => {
    const el = e.target, { ci, ii, vi } = ctx(el);
    const c = menu.categories[ci]; if (!c) return;
    if (el.dataset.c) c[el.dataset.c] = el.value;
    else if (el.dataset.f) { const it = c.items[ii]; if (el.value) it[el.dataset.f] = el.value; else delete it[el.dataset.f]; }
    else if (el.dataset.v) {
      const it = c.items[ii]; if (!it.variants || !it.variants.length) it.variants = [{ label: '', price: null }];
      const v = it.variants[vi];
      v[el.dataset.v] = el.dataset.v === 'price' ? (el.value === '' ? null : Math.max(0, Math.round(+el.value))) : el.value;
    }
    setDirty(true);
  });
  $('#cats').addEventListener('change', e => { if (e.target.matches('select')) e.target.dispatchEvent(new Event('input', { bubbles: true })); });
  const swap = (arr, i, j) => { if (j < 0 || j >= arr.length) return false; [arr[i], arr[j]] = [arr[j], arr[i]]; return true; };
  $('#cats').addEventListener('click', e => {
    const b = e.target.closest('[data-act]'); if (!b) return;
    const { ci, ii, vi } = ctx(b), c = menu.categories[ci], act = b.dataset.act;
    if (act === 'toggle') return b.closest('.cat').classList.toggle('collapsed');
    const it = c && c.items[ii];
    switch (act) {
      case 'catUp': swap(menu.categories, ci, ci - 1); break;
      case 'catDown': swap(menu.categories, ci, ci + 1); break;
      case 'catHide': c.hidden = !c.hidden; break;
      case 'catDel': if (!confirm(`Видалити категорію «${c.name}» разом з ${c.items.length} позиціями?`)) return; menu.categories.splice(ci, 1); break;
      case 'addItem': c.items.push({ name: '', variants: [{ label: '', price: null }] }); break;
      case 'itemUp': swap(c.items, ii, ii - 1); break;
      case 'itemDown': swap(c.items, ii, ii + 1); break;
      case 'itemHide': it.hidden = !it.hidden; break;
      case 'itemDel': if (!confirm(`Видалити «${it.name || 'позицію'}»?`)) return; c.items.splice(ii, 1); break;
      case 'addVar': it.variants = it.variants && it.variants.length ? it.variants : [{ label: '', price: null }]; it.variants.push({ label: '', price: null }); break;
      case 'delVar': it.variants.splice(vi, 1); break;
      default: return;
    }
    setDirty(true); renderMenu();
    if (act === 'addItem') { const items = $$(`.cat[data-ci="${ci}"] .item`); const last = items[items.length - 1]; last && last.querySelector('.i-name').focus(); }
  });
  $('#addCat').addEventListener('click', () => {
    menu.categories.push({ id: 'cat' + Date.now().toString(36), name: 'Нова категорія', icon: '☕', description: '', items: [] });
    setDirty(true); renderMenu();
    const cats = $$('.cat'); const c = cats[cats.length - 1]; c.classList.remove('collapsed'); c.scrollIntoView({ behavior: 'smooth' }); c.querySelector('.c-name').select();
  });
  $('#saveMenu').addEventListener('click', async () => {
    const bad = []; menu.categories.forEach(c => c.items.forEach(it => { if (!String(it.name || '').trim()) bad.push(c.name); }));
    if (bad.length) return toast(`Є позиції без назви в категорії «${bad[0]}»`, true);
    menu.categories.forEach(c => { if (!c.id) c.id = 'cat' + Math.random().toString(36).slice(2, 8); });
    try { await api('menu', 'PUT', menu); setDirty(false); toast('Меню збережено ✓ Зміни вже на сайті'); }
    catch (err) { toast(err.message, true); }
  });
  function applySearch() {
    const q = $('#adminSearch').value.trim().toLowerCase();
    $$('.item').forEach(el => {
      const it = menu.categories[+el.dataset.ci].items[+el.dataset.ii];
      el.classList.toggle('no-match', !!q && !(it.name + ' ' + (it.desc || '')).toLowerCase().includes(q));
    });
    if (q) $$('.cat').forEach(c => c.classList.toggle('collapsed', !c.querySelector('.item:not(.no-match)')));
  }
  $('#adminSearch').addEventListener('input', applySearch);
  $('#bulkApply').addEventListener('click', () => {
    const pct = parseFloat($('#bulkPct').value); if (!pct) return toast('Вкажіть відсоток', true);
    const sel = $('#bulkCat').value, cats = sel === 'all' ? menu.categories : [menu.categories[+sel]];
    if (!confirm(`Змінити ціни на ${pct > 0 ? '+' : ''}${pct}% (${sel === 'all' ? 'усе меню' : cats[0].name})?`)) return;
    cats.forEach(c => c.items.forEach(it => (it.variants || []).forEach(v => { if (v.price != null) v.price = Math.max(0, Math.round(v.price * (1 + pct / 100))); })));
    setDirty(true); renderMenu(); toast('Ціни перераховано. Натисніть «Зберегти меню».');
  });
  $('#exportMenu').addEventListener('click', () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(menu, null, 2)], { type: 'application/json' }));
    a.download = 'route66-menu-' + new Date().toISOString().slice(0, 10) + '.json'; a.click();
  });
  $('#importMenu').addEventListener('change', async e => {
    const f = e.target.files[0]; e.target.value = ''; if (!f) return;
    try {
      const data = JSON.parse(await f.text());
      if (!Array.isArray(data.categories)) throw new Error('У файлі немає меню');
      if (!confirm('Замінити поточне меню вмістом файлу? (після цього натисніть «Зберегти меню»)')) return;
      menu = data; setDirty(true); renderMenu(); toast('Меню завантажено з файлу');
    } catch (err) { toast('Не вдалося прочитати файл: ' + err.message, true); }
  });

  /* ---------- відгуки ---------- */
  function renderReviews() {
    const f = $('#revFilter').value;
    const list = reviews.filter(r => f === 'all' || (f === 'hidden' ? r.hidden : !r.hidden));
    const pending = reviews.filter(r => r.hidden).length;
    $('#pendingCount').textContent = pending; $('#pendingCount').hidden = !pending;
    $('#revList').innerHTML = list.map(r => `
      <article class="rev${r.hidden ? ' hidden-rev' : ''}" data-id="${esc(r.id)}">
        <div class="rev-top"><b>${esc(r.name)}</b><span class="st">${'★'.repeat(r.rating)}${'☆'.repeat(5 - r.rating)}</span>
          <span class="dt">${new Date(r.date).toLocaleString('uk-UA')}</span>${r.hidden ? '<span class="tag">прихований</span>' : ''}</div>
        <p>${esc(r.text)}</p>
        <div class="rev-actions">
          <button class="btn btn-sec" data-rev="toggle">${r.hidden ? 'Опублікувати' : 'Сховати'}</button>
          <button class="btn btn-sec" data-rev="del">Видалити</button>
        </div>
      </article>`).join('') || '<div class="empty">Відгуків поки немає.</div>';
  }
  $('#revFilter').addEventListener('change', renderReviews);
  $('#revList').addEventListener('click', async e => {
    const b = e.target.closest('[data-rev]'); if (!b) return;
    const id = b.closest('.rev').dataset.id, r = reviews.find(x => x.id === id);
    try {
      if (b.dataset.rev === 'del') {
        if (!confirm(`Видалити відгук від «${r.name}» назавжди?`)) return;
        await api('reviews/' + id, 'DELETE'); reviews = reviews.filter(x => x.id !== id); toast('Відгук видалено');
      } else {
        await api('reviews/' + id, 'PATCH', { hidden: !r.hidden }); r.hidden = !r.hidden; toast(r.hidden ? 'Відгук приховано' : 'Відгук опубліковано');
      }
      renderReviews();
    } catch (err) { toast(err.message, true); }
  });

  /* ---------- налаштування ---------- */
  function fillSettings() {
    const f = $('#settingsForm');
    [...f.elements].forEach(el => { if (!el.name) return; if (el.type === 'checkbox') el.checked = !!settings[el.name]; else el.value = settings[el.name] || ''; });
  }
  $('#saveSettings').addEventListener('click', async () => {
    const f = $('#settingsForm'), next = { ...settings };
    [...f.elements].forEach(el => { if (!el.name) return; next[el.name] = el.type === 'checkbox' ? el.checked : el.value.trim(); });
    next.siteUrl = next.siteUrl.replace(/\/+$/, '');
    try { await api('settings', 'PUT', next); settings = next; toast('Налаштування збережено ✓'); }
    catch (err) { toast(err.message, true); }
  });
  $('#settingsForm').addEventListener('submit', e => { e.preventDefault(); $('#saveSettings').click(); });

  /* ---------- пароль ---------- */
  $('#pwForm').addEventListener('submit', async e => {
    e.preventDefault(); const f = e.target;
    if (f.new.value !== f.new2.value) return toast('Нові паролі не збігаються', true);
    try {
      const r = await api('password', 'POST', { old: f.old.value, new: f.new.value });
      token = r.token; store.set('r66token', token); store.set('r66default', ''); $('#defaultPwWarn').hidden = true;
      f.reset(); toast('Пароль змінено ✓');
    } catch (err) { toast(err.message, true); }
  });

  if (token) start();
})();
