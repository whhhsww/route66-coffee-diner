/* Route 66 Coffee Diner — головна сторінка + режим власника (редагування прямо на сайті) */
(function () {
  'use strict';
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const store = {
    get: k => { try { return sessionStorage.getItem(k); } catch (e) { return null; } },
    set: (k, v) => { try { v == null ? sessionStorage.removeItem(k) : sessionStorage.setItem(k, v); } catch (e) {} }
  };

  let token = store.get('r66token');
  let editing = false, dirty = false;
  let settings = {}, menu = { categories: [] }, reviews = [], shown = 6;

  // Статична версія (GitHub Pages): сервера немає — читаємо JSON-файли напряму,
  // відгуки й редагування вимикаються.
  let STATIC = false;
  const STATIC_FILES = { menu: 'data/menu.json', settings: 'data/settings.json', reviews: null };
  async function load(path) {
    if (!STATIC) {
      try { return await api(path); }
      catch (e) { if (!(path in STATIC_FILES) || !/404|405|501|Failed to fetch|NetworkError|Load failed/i.test(e.message)) throw e; STATIC = true; }
    }
    const file = STATIC_FILES[path];
    if (!file) return [];
    const r = await fetch(file, { cache: 'no-cache' });
    if (!r.ok) throw new Error('Помилка ' + r.status);
    return r.json();
  }
  async function api(path, method = 'GET', body) {
    if (STATIC && method !== 'GET') throw new Error('На цій версії сайту зберігати зміни неможливо — потрібен сервер (див. README).');
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = 'Bearer ' + token;
    const r = await fetch('api/' + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    const d = await r.json().catch(() => ({}));
    if (r.status === 401 && token && path !== 'login') { exitEdit(true); throw new Error('Сесія завершилась — увійдіть знову'); }
    if (!r.ok) throw new Error(d.error || 'Помилка ' + r.status);
    return d;
  }
  /* ---------- GitHub-режим: сайт на GitHub Pages, зміни зберігаються комітами ---------- */
  const lsGet = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const lsSet = (k, v) => { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) {} };
  const GH_BRANCH = 'gh-pages';
  let ghToken = lsGet('r66gh') || store.get('r66gh');
  function ghRepo() {
    const m = location.hostname.match(/^([\w-]+)\.github\.io$/i);
    const first = location.pathname.split('/').filter(Boolean)[0];
    if (m && first) return m[1] + '/' + first;
    return settings.githubRepo || 'whhhsww/route66-coffee-diner';
  }
  async function gh(path, opt = {}) {
    const headers = { Accept: 'application/vnd.github+json', Authorization: 'Bearer ' + ghToken };
    if (opt.body) headers['Content-Type'] = 'application/json';
    const r = await fetch('https://api.github.com/repos/' + ghRepo() + path, { ...opt, headers, cache: 'no-store' });
    const d = await r.json().catch(() => ({}));
    if (r.status === 401) throw new Error('Ключ GitHub недійсний або прострочений');
    if (r.status === 403 || r.status === 404) throw new Error('Ключ не має доступу до ' + ghRepo() + ' (потрібно Contents: Read and write)');
    if (r.status === 409) throw new Error('Файл щойно змінився — оновіть сторінку і спробуйте ще раз');
    if (!r.ok) throw new Error(d.message || 'Помилка GitHub ' + r.status);
    return d;
  }
  const b64enc = str => btoa(unescape(encodeURIComponent(str)));
  const b64dec = str => decodeURIComponent(escape(atob(str.replace(/\s/g, ''))));
  async function ghRead(f) { const d = await gh('/contents/' + f + '?ref=' + GH_BRANCH); return JSON.parse(b64dec(d.content)); }
  async function ghWrite(f, value, message) {
    const { sha } = await gh('/contents/' + f + '?ref=' + GH_BRANCH);
    await gh('/contents/' + f, { method: 'PUT', body: JSON.stringify({ message, content: b64enc(JSON.stringify(value, null, 2) + '\n'), sha, branch: GH_BRANCH }) });
  }
  const saveFile = (path, f, value, msg) => STATIC ? ghWrite(f, value, msg) : api(path, 'PUT', value);
  const savedText = () => STATIC ? 'Збережено ✓ Сайт оновиться приблизно за 1 хвилину' : 'Збережено ✓ Гості вже бачать зміни';

  let toastT;
  function toast(msg, bad) { const t = $('#toast'); t.textContent = msg; t.className = 'toast show' + (bad ? ' bad' : ''); clearTimeout(toastT); toastT = setTimeout(() => (t.className = 'toast'), 3000); }

  /* ---------- навігація ---------- */
  const burger = $('#burger'), nav = $('#nav');
  burger.addEventListener('click', () => { const o = nav.classList.toggle('open'); burger.setAttribute('aria-expanded', o); });
  $$('#nav a').forEach(a => a.addEventListener('click', () => { nav.classList.remove('open'); burger.setAttribute('aria-expanded', 'false'); }));
  const navObs = new IntersectionObserver(es => es.forEach(e => {
    if (e.isIntersecting) $$('#nav a').forEach(a => a.classList.toggle('active', a.getAttribute('href') === '#' + e.target.id));
  }), { rootMargin: '-45% 0px -50% 0px' });
  ['menu', 'about', 'reviews', 'qr', 'contacts'].forEach(id => navObs.observe(document.getElementById(id)));

  // закрити мобільне меню тапом поза ним
  document.addEventListener('click', e => {
    if (nav.classList.contains('open') && !e.target.closest('#nav, #burger')) { nav.classList.remove('open'); burger.setAttribute('aria-expanded', 'false'); }
  });

  // кнопка «Меню» на телефоні: зʼявляється, коли гість прокрутив повз початок меню
  const toMenu = $('#toMenu');
  const onScroll = () => {
    const m = document.getElementById('menu');
    const past = window.scrollY > m.offsetTop + 600;
    const nearEnd = window.scrollY + window.innerHeight > document.getElementById('contacts').offsetTop + 40;
    toMenu.classList.toggle('show', past && !nearEnd && window.innerWidth <= 820);
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  toMenu.addEventListener('click', e => { e.preventDefault(); document.getElementById('menu').scrollIntoView({ behavior: 'smooth' }); });


  /* ---------- налаштування ---------- */
  function link(v, base) { v = String(v).trim(); return /^https?:\/\//i.test(v) ? v : base + v.replace(/^@/, ''); }
  function applySettings() {
    const s = settings;
    $('#heroTag').textContent = s.tagline || '';
    $('#footTag').textContent = s.tagline || '';
    $('#aboutText').textContent = s.about || '';
    $('#heroHours').textContent = s.hours ? '🕗 ' + s.hours : '';
    const ann = $('#announce'); ann.textContent = s.announcement || ''; ann.hidden = !s.announcement;
    $('#cAddressRow').hidden = !s.address;
    const addr = $('#cAddress'); addr.textContent = s.address || '';
    if (s.mapUrl) addr.href = s.mapUrl; else if (s.address) addr.href = 'https://www.google.com/maps/search/' + encodeURIComponent(s.address); else addr.removeAttribute('href');
    const ph = $('#cPhone'); ph.textContent = s.phone || ''; ph.href = 'tel:' + String(s.phone || '').replace(/[^\d+]/g, ''); $('#cPhoneRow').hidden = !s.phone;
    $('#cHours').textContent = s.hours || '';
    const soc = [];
    if (s.instagram) soc.push(`<a href="${esc(link(s.instagram, 'https://instagram.com/'))}" target="_blank" rel="noopener">📸 Instagram</a>`);
    if (s.telegram) soc.push(`<a href="${esc(link(s.telegram, 'https://t.me/'))}" target="_blank" rel="noopener">✈️ Telegram</a>`);
    if (s.facebook) soc.push(`<a href="${esc(link(s.facebook, 'https://facebook.com/'))}" target="_blank" rel="noopener">👍 Facebook</a>`);
    $('#socials').innerHTML = soc.join('') || '<span class="soon">Скоро тут будуть наші соцмережі</span>';
    $('#year').textContent = new Date().getFullYear();
    renderQR();
  }

  /* ---------- меню (перегляд) ---------- */
  const BADGES = { 'новинка': 'b-new', 'хіт': 'b-hit', 'сезон': 'b-season' };
  const cur = () => esc(menu.currency || '₴');
  const hasPrice = p => p !== null && p !== undefined && p !== '';
  function hl(text, q) {
    text = String(text || ''); const t = esc(text); if (!q) return t;
    const i = text.toLowerCase().indexOf(q); if (i < 0) return t;
    return esc(text.slice(0, i)) + '<mark>' + esc(text.slice(i, i + q.length)) + '</mark>' + esc(text.slice(i + q.length));
  }
  function itemHTML(it, q) {
    const vars = (it.variants || []).filter(Boolean);
    const single = vars.length <= 1 && !(vars[0] && vars[0].label);
    const badge = it.badge ? `<span class="badge ${BADGES[it.badge.toLowerCase()] || ''}">${esc(it.badge)}</span>` : '';
    let right = '', below = '';
    if (single) {
      const p = vars[0] && vars[0].price;
      right = hasPrice(p) ? `<span class="item-price">${p} ${cur()}</span>` : '<span class="ask">ціну уточнюйте</span>';
    } else {
      below = `<div class="variants">${vars.map(v => `<span class="variant">${esc(v.label)} <b>${hasPrice(v.price) ? v.price + ' ' + cur() : '—'}</b></span>`).join('')}</div>`;
    }
    const img = it.image ? `<img class="item-img" src="${esc(it.image)}" alt="" loading="lazy">` : '';
    return `<div class="item">${img}<div class="item-body">
      <div class="item-top"><span class="item-name">${hl(it.name, q)}${badge}</span>${right ? '<span class="item-dots"></span>' + right : ''}</div>
      ${it.desc ? `<div class="item-desc">${hl(it.desc, q)}</div>` : ''}${below}</div></div>`;
  }

  /* ---------- меню (редагування) ---------- */
  const ed = (field, value, ph, cls = '', tag = 'span') => `<${tag} class="${cls}" contenteditable="plaintext-only" spellcheck="false" data-f="${field}" data-ph="${esc(ph)}">${esc(value)}</${tag}>`;
  function itemEditHTML(it, ci, ii) {
    const vars = it.variants && it.variants.length ? it.variants : [{ label: '', price: null }];
    const badges = ['', 'новинка', 'хіт', 'сезон'];
    return `<div class="item e-item${it.hidden ? ' is-off' : ''}" data-ci="${ci}" data-ii="${ii}">
      <div class="e-row">
        ${ed('name', it.name, 'Назва позиції', 'item-name')}
        <div class="ectl">
          ${it.hidden ? '<span class="e-off-tag">приховано</span>' : ''}
          <select class="e-badge" data-f="badge" title="Позначка">${badges.map(b => `<option value="${b}"${(it.badge || '') === b ? ' selected' : ''}>${b || '— позначка'}</option>`).join('')}</select>
          <button class="ebtn" data-act="itemUp" title="Вище">↑</button>
          <button class="ebtn" data-act="itemDown" title="Нижче">↓</button>
          <button class="ebtn" data-act="itemHide" title="${it.hidden ? 'Показати на сайті' : 'Сховати (немає в наявності)'}">${it.hidden ? '🚫' : '👁'}</button>
          <button class="ebtn" data-act="itemDel" title="Видалити позицію">🗑</button>
        </div>
      </div>
      ${ed('desc', it.desc || '', '+ опис (необовʼязково)', 'item-desc', 'div')}
      <div class="variants">
        ${vars.map((v, vi) => `<span class="e-var" data-vi="${vi}">
          <span class="v-l" contenteditable="plaintext-only" spellcheck="false" data-v="label" data-ph="обʼєм">${esc(v.label || '')}</span>
          <span class="v-p" contenteditable="plaintext-only" inputmode="numeric" data-v="price" data-ph="ціна">${hasPrice(v.price) ? v.price : ''}</span>₴
          ${vars.length > 1 ? '<button class="ebtn" data-act="delVar" title="Прибрати цей обʼєм">✕</button>' : ''}
        </span>`).join('')}
        <button class="add-var" data-act="addVar" type="button">+ обʼєм / ціна</button>
      </div>
    </div>`;
  }

  function renderMenu() {
    document.dispatchEvent(new CustomEvent('r66:menu', { detail: menu }));
    const q = editing ? '' : $('#menuSearch').value.trim().toLowerCase();
    let total = 0;
    const html = (menu.categories || []).map((c, ci) => {
      if (!editing && c.hidden) return '';
      const items = (c.items || []).map((it, ii) => ({ it, ii }))
        .filter(({ it }) => editing || (!it.hidden && (!q || (it.name + ' ' + (it.desc || '') + ' ' + c.name).toLowerCase().includes(q))));
      total += items.length;
      if (!items.length && !editing) return '';
      const head = editing
        ? `<div class="cat-head">
             <span class="cat-icon" contenteditable="plaintext-only" data-c="icon" title="Іконка (емодзі)">${esc(c.icon || '☕')}</span>
             <div><h3 contenteditable="plaintext-only" spellcheck="false" data-c="name" data-ph="Назва категорії">${esc(c.name)}</h3>
             <p contenteditable="plaintext-only" spellcheck="false" data-c="description" data-ph="+ підзаголовок">${esc(c.description || '')}</p></div>
             <div class="ectl">
               <button class="ebtn" data-act="catUp" title="Вище">↑</button>
               <button class="ebtn" data-act="catDown" title="Нижче">↓</button>
               <button class="ebtn" data-act="catHide" title="${c.hidden ? 'Показати категорію' : 'Сховати категорію'}">${c.hidden ? '🚫' : '👁'}</button>
               <button class="ebtn" data-act="catDel" title="Видалити категорію">🗑</button>
             </div></div>`
        : `<div class="cat-head"><span class="cat-icon">${esc(c.icon || '☕')}</span><div><h3>${esc(c.name)}</h3>${c.description ? `<p>${esc(c.description)}</p>` : ''}</div></div>`;
      const body = editing
        ? items.map(({ it, ii }) => itemEditHTML(it, ci, ii)).join('') + `<div class="add-item-row"><button class="btn btn-outline btn-sm" data-act="addItem" type="button">+ Додати позицію</button></div>`
        : items.map(({ it }) => itemHTML(it, q)).join('');
      return `<article class="cat${editing && c.hidden ? ' is-off' : ''}" id="cat-${esc(c.id)}" data-ci="${ci}">${head}<div class="items">${body}</div></article>`;
    }).join('');
    $('#menuList').innerHTML = html || (editing ? '<p class="loading">Меню порожнє — додайте категорію.</p>' : '');
    $('#menuEmpty').hidden = editing || total > 0;
    $('#chips').innerHTML = (menu.categories || []).filter(c => document.getElementById('cat-' + c.id))
      .map(c => `<button class="chip" data-cat="${esc(c.id)}">${esc(c.icon || '')} ${esc(c.name)}</button>`).join('');
    if (editing) $('#bulkCat').innerHTML = '<option value="all">усе меню</option>' + menu.categories.map((c, i) => `<option value="${i}">${esc(c.name)}</option>`).join('');
    observeCats();
  }
  $('#menuSearch').addEventListener('input', renderMenu);
  $('#chips').addEventListener('click', e => {
    const b = e.target.closest('.chip'); if (!b) return;
    document.getElementById('cat-' + b.dataset.cat).scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
  let catObs;
  function observeCats() {
    if (catObs) catObs.disconnect();
    catObs = new IntersectionObserver(es => es.forEach(e => {
      if (!e.isIntersecting) return;
      const id = e.target.id.slice(4);
      $$('.chip').forEach(c => { const on = c.dataset.cat === id; c.classList.toggle('active', on); if (on) c.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' }); });
    }), { rootMargin: '-30% 0px -60% 0px' });
    $$('.cat').forEach(c => catObs.observe(c));
  }

  /* ---------- редагування: введення тексту ---------- */
  function setDirty(v) {
    dirty = v; $('#ebSave').disabled = !v;
    const st = $('#ebStatus');
    st.textContent = v ? 'Є незбережені зміни — натисніть «Зберегти зміни»' : 'Натисніть на будь-яку назву чи ціну, щоб змінити її';
    st.classList.toggle('dirty', v);
  }
  const where = el => {
    const c = el.closest('.cat'), i = el.closest('.e-item'), v = el.closest('.e-var');
    return { ci: c ? +c.dataset.ci : -1, ii: i ? +i.dataset.ii : -1, vi: v ? +v.dataset.vi : -1 };
  };
  const list = $('#menuList');
  list.addEventListener('input', e => {
    if (!editing) return;
    const el = e.target, { ci, ii, vi } = where(el), c = menu.categories[ci];
    if (!c) return;
    const val = el.tagName === 'SELECT' ? el.value : el.textContent.replace(/\s+/g, ' ').trim();
    if (el.dataset.c) c[el.dataset.c] = val;
    else if (el.dataset.f) { const it = c.items[ii]; if (val) it[el.dataset.f] = val; else delete it[el.dataset.f]; }
    else if (el.dataset.v) {
      const it = c.items[ii];
      if (!it.variants || !it.variants.length) it.variants = [{ label: '', price: null }];
      const v = it.variants[vi];
      if (el.dataset.v === 'price') { const n = parseInt(val.replace(/[^\d]/g, ''), 10); v.price = isNaN(n) ? null : n; }
      else v.label = val;
    }
    setDirty(true);
  });
  list.addEventListener('change', e => { if (e.target.tagName === 'SELECT') e.target.dispatchEvent(new Event('input', { bubbles: true })); });
  list.addEventListener('keydown', e => {
    if (!e.target.isContentEditable) return;
    if (e.key === 'Enter') { e.preventDefault(); e.target.blur(); }
    if (e.target.dataset.v === 'price' && e.key.length === 1 && !/\d/.test(e.key) && !e.ctrlKey && !e.metaKey) e.preventDefault();
  });
  list.addEventListener('focusout', e => { // ціну показуємо «чисто» після редагування
    const el = e.target; if (el.dataset && el.dataset.v === 'price') { const n = parseInt(el.textContent.replace(/[^\d]/g, ''), 10); el.textContent = isNaN(n) ? '' : n; }
  });
  document.addEventListener('paste', e => { // вставляємо лише простий текст
    if (!e.target.isContentEditable) return;
    e.preventDefault(); document.execCommand('insertText', false, (e.clipboardData.getData('text/plain') || '').replace(/\s+/g, ' '));
  });

  /* ---------- редагування: кнопки ---------- */
  const swap = (arr, i, j) => { if (j < 0 || j >= arr.length) return; [arr[i], arr[j]] = [arr[j], arr[i]]; };
  list.addEventListener('click', e => {
    if (!editing) return;
    const b = e.target.closest('[data-act]'); if (!b) return;
    const { ci, ii, vi } = where(b), c = menu.categories[ci], it = c && c.items[ii], act = b.dataset.act;
    let focus = null;
    switch (act) {
      case 'catUp': swap(menu.categories, ci, ci - 1); break;
      case 'catDown': swap(menu.categories, ci, ci + 1); break;
      case 'catHide': c.hidden = !c.hidden; break;
      case 'catDel': if (!confirm(`Видалити категорію «${c.name}» разом з усіма позиціями (${c.items.length})?`)) return; menu.categories.splice(ci, 1); break;
      case 'addItem': c.items.push({ name: '', variants: [{ label: '', price: null }] }); focus = [ci, c.items.length - 1]; break;
      case 'itemUp': swap(c.items, ii, ii - 1); break;
      case 'itemDown': swap(c.items, ii, ii + 1); break;
      case 'itemHide': it.hidden = !it.hidden; break;
      case 'itemDel': if (!confirm(`Видалити «${it.name || 'позицію'}» з меню?`)) return; c.items.splice(ii, 1); break;
      case 'addVar': if (!it.variants || !it.variants.length) it.variants = [{ label: '', price: null }]; it.variants.push({ label: '', price: null }); break;
      case 'delVar': it.variants.splice(vi, 1); break;
      default: return;
    }
    const y = window.scrollY;
    setDirty(true); renderMenu(); window.scrollTo(0, y);
    if (focus) { const el = $(`.e-item[data-ci="${focus[0]}"][data-ii="${focus[1]}"] .item-name`); if (el) { el.scrollIntoView({ block: 'center' }); el.focus(); } }
  });
  $('#addCat').addEventListener('click', () => {
    menu.categories.push({ id: 'cat' + Date.now().toString(36), name: 'Нова категорія', icon: '⭐', description: '', items: [] });
    setDirty(true); renderMenu();
    const h = $$('.cat h3').pop(); h.scrollIntoView({ block: 'center' }); h.focus(); document.execCommand('selectAll');
  });
  $('#bulkApply').addEventListener('click', () => {
    const pct = parseFloat($('#bulkPct').value); if (!pct) return toast('Вкажіть відсоток: 10 = +10%, -5 = знижка 5%', true);
    const sel = $('#bulkCat').value, cats = sel === 'all' ? menu.categories : [menu.categories[+sel]];
    if (!confirm(`Змінити ціни на ${pct > 0 ? '+' : ''}${pct}% (${sel === 'all' ? 'усе меню' : cats[0].name})?`)) return;
    cats.forEach(c => c.items.forEach(it => (it.variants || []).forEach(v => { if (hasPrice(v.price)) v.price = Math.max(0, Math.round(v.price * (1 + pct / 100))); })));
    setDirty(true); renderMenu(); toast('Ціни перераховано — не забудьте «Зберегти зміни»');
  });
  $('#ebSave').addEventListener('click', async () => {
    const empty = []; menu.categories.forEach(c => c.items.forEach(it => { if (!String(it.name || '').trim()) empty.push(c.name); }));
    if (empty.length) return toast(`Є позиція без назви в категорії «${empty[0]}»`, true);
    menu.categories.forEach(c => { if (!c.name.trim()) c.name = 'Без назви'; if (!c.id) c.id = 'cat' + Math.random().toString(36).slice(2, 8); });
    $('#ebSave').disabled = true;
    try { await saveFile('menu', 'data/menu.json', menu, 'Меню: зміни через сайт'); setDirty(false); toast(savedText()); }
    catch (err) { $('#ebSave').disabled = false; toast(err.message, true); }
  });

  /* ---------- вхід / вихід ---------- */
  const openModal = id => { const m = $(id); m.hidden = false; const f = m.querySelector('input:not([type=checkbox])'); if (f) setTimeout(() => f.focus(), 50); };
  const closeModal = m => { m.hidden = true; };
  $$('.modal').forEach(m => {
    m.addEventListener('click', e => { if (e.target === m || e.target.closest('[data-close]')) closeModal(m); });
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') $$('.modal').forEach(closeModal); });
  $('#ownerLogin').addEventListener('click', () => (editing ? toast('Ви вже в режимі редагування') : openModal('#loginModal')));
  $('#loginForm').addEventListener('submit', async e => {
    e.preventDefault(); $('#loginErr').textContent = '';
    const btn = e.target.querySelector('button[type=submit]'); btn.disabled = true;
    try {
      if (STATIC) {
        const t = $('#ghToken').value.trim();
        if (!t) throw new Error('Вставте ключ GitHub');
        ghToken = t; await ghRead('data/menu.json'); // перевірка доступу
        if ($('#ghRemember').checked) lsSet('r66gh', t); else store.set('r66gh', t);
        $('#ghToken').value = ''; closeModal($('#loginModal'));
        await enterEdit(); btn.disabled = false; return;
      }
      if (!$('#ownerPw').value) throw new Error('Введіть пароль');
      const r = await api('login', 'POST', { password: $('#ownerPw').value });
      token = r.token; store.set('r66token', token); store.set('r66default', r.isDefault ? '1' : '');
      $('#ownerPw').value = ''; closeModal($('#loginModal'));
      await enterEdit();
      if (r.isDefault) toast('⚠ Стоїть стандартний пароль — змініть його кнопкою «🔑 Пароль»', true);
    } catch (err) { if (STATIC) ghToken = null; $('#loginErr').textContent = err.message; }
    btn.disabled = false;
  });
  async function enterEdit() {
    editing = true; document.body.classList.add('editing');
    $('#editBar').hidden = false; $('#editTools').hidden = false; $('#menuSearch').closest('.menu-tools').hidden = true;
    try {
      if (STATIC) { [menu, settings] = await Promise.all([ghRead('data/menu.json'), ghRead('data/settings.json')]); reviews = []; applySettings(); }
      else [menu, reviews] = await Promise.all([api('menu'), api('reviews?all=1')]);
    } catch (err) { toast(err.message, true); if (STATIC) { exitEdit(); return; } }
    setDirty(false); renderMenu(); renderReviews();
    document.getElementById('menu').scrollIntoView({ behavior: 'smooth' });
  }
  async function exitEdit(silent) {
    editing = false; token = null; store.set('r66token', null);
    if (STATIC) { ghToken = null; lsSet('r66gh', null); store.set('r66gh', null); }
    document.body.classList.remove('editing');
    $('#editBar').hidden = true; $('#editTools').hidden = true; $('#menuSearch').closest('.menu-tools').hidden = false;
    try { if (STATIC) menu = await load('menu'); else [menu, reviews] = await Promise.all([api('menu'), api('reviews')]); } catch (e) {}
    dirty = false; renderMenu(); renderReviews();
    if (silent === true) openModal('#loginModal');
  }
  $('#ebExit').addEventListener('click', () => {
    if (dirty && !confirm('Є незбережені зміни. Вийти без збереження?')) return;
    exitEdit(); toast('Ви вийшли з режиму редагування');
  });
  window.addEventListener('beforeunload', e => { if (dirty) { e.preventDefault(); e.returnValue = ''; } });

  /* ---------- контакти і тексти ---------- */
  $('#ebSettings').addEventListener('click', () => {
    const f = $('#settingsForm');
    [...f.elements].forEach(el => { if (!el.name) return; if (el.type === 'checkbox') el.checked = !!settings[el.name]; else el.value = settings[el.name] || ''; });
    openModal('#settingsModal');
  });
  $('#settingsForm').addEventListener('submit', async e => {
    e.preventDefault();
    const next = { ...settings };
    [...e.target.elements].forEach(el => { if (!el.name) return; next[el.name] = el.type === 'checkbox' ? el.checked : el.value.trim(); });
    next.siteUrl = (next.siteUrl || '').replace(/\/+$/, '');
    try { await saveFile('settings', 'data/settings.json', next, 'Налаштування: зміни через сайт'); settings = next; applySettings(); closeModal($('#settingsModal')); toast(savedText()); }
    catch (err) { toast(err.message, true); }
  });
  $('#ebPassword').addEventListener('click', () => openModal('#pwModal'));
  $('#pwForm').addEventListener('submit', async e => {
    e.preventDefault(); const f = e.target;
    if (f.new.value !== f.new2.value) return toast('Нові паролі не збігаються', true);
    try {
      const r = await api('password', 'POST', { old: f.old.value, new: f.new.value });
      token = r.token; store.set('r66token', token); store.set('r66default', '');
      f.reset(); closeModal($('#pwModal')); toast('Пароль змінено ✓');
    } catch (err) { toast(err.message, true); }
  });

  /* ---------- відгуки ---------- */
  const fmtDate = d => new Date(d).toLocaleDateString('uk-UA', { day: 'numeric', month: 'long', year: 'numeric' });
  const stars = n => '★'.repeat(n) + '☆'.repeat(5 - n);
  function plural(n) { const a = n % 10, b = n % 100; if (a === 1 && b !== 11) return 'відгук'; if (a >= 2 && a <= 4 && (b < 12 || b > 14)) return 'відгуки'; return 'відгуків'; }
  function renderReviews() {
    const pub = reviews.filter(r => !r.hidden), n = pub.length;
    const avg = n ? pub.reduce((s, r) => s + r.rating, 0) / n : 0;
    $('#avgScore').textContent = n ? avg.toFixed(1).replace('.', ',') : '—';
    $('#avgStars').style.setProperty('--pct', (avg / 5 * 100) + '%');
    $('#avgCount').textContent = n ? `${n} ${plural(n)} гостей` : 'Ще немає відгуків — будьте першим!';
    $('#heroRating').textContent = n ? `★ ${avg.toFixed(1).replace('.', ',')} · ${n} ${plural(n)}` : '★ Залиште перший відгук';
    const listR = editing ? reviews : pub;
    $('#reviewList').innerHTML = listR.length ? listR.slice(0, editing ? listR.length : shown).map(r => `
      <article class="review${r.hidden ? ' is-off' : ''}" data-id="${esc(r.id)}"><div class="review-top"><span class="avatar">${esc((r.name || '?').trim().charAt(0).toUpperCase())}</span>
      <div><div class="review-name">${esc(r.name)}${r.hidden ? ' <span class="e-off-tag">прихований</span>' : ''}</div><div class="review-date">${fmtDate(r.date)}</div></div>
      <span class="review-stars" aria-label="Оцінка ${r.rating} з 5">${stars(r.rating)}</span></div><p>${esc(r.text)}</p>
      ${editing ? `<div class="r-ctl"><button class="btn btn-outline btn-sm" data-rev="toggle">${r.hidden ? 'Опублікувати' : 'Сховати'}</button><button class="btn btn-outline btn-sm" data-rev="del">Видалити</button></div>` : ''}
      </article>`).join('')
      : '<div class="no-reviews"><b>Ваш відгук може бути першим</b>Розкажіть, як вам кава та атмосфера Route 66.</div>';
    $('#moreReviews').hidden = editing || n <= shown;
  }
  $('#moreReviews').addEventListener('click', () => { shown += 6; renderReviews(); });
  $('#reviewList').addEventListener('click', async e => {
    const b = e.target.closest('[data-rev]'); if (!b || !editing) return;
    const id = b.closest('.review').dataset.id, r = reviews.find(x => x.id === id);
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
  $('#reviewForm').addEventListener('submit', async e => {
    e.preventDefault();
    const f = e.target, msg = $('#reviewMsg'), btn = f.querySelector('button');
    const data = { name: f.name.value.trim(), rating: +(f.querySelector('input[name=rating]:checked') || {}).value || 0, text: f.text.value.trim(), website: f.website.value };
    msg.className = 'form-msg err';
    if (data.name.length < 2) return (msg.textContent = 'Вкажіть, будь ласка, імʼя.');
    if (!data.rating) return (msg.textContent = 'Поставте оцінку зірочками.');
    if (data.text.length < 5) return (msg.textContent = 'Напишіть кілька слів про ваш візит.');
    btn.disabled = true; msg.className = 'form-msg'; msg.textContent = 'Надсилаємо…';
    try {
      const r = await api('reviews', 'POST', data);
      f.reset(); msg.className = 'form-msg ok';
      msg.textContent = r.pending ? 'Дякуємо! Відгук зʼявиться після перевірки.' : 'Дякуємо за відгук! ❤';
      reviews = await api(editing ? 'reviews?all=1' : 'reviews'); renderReviews();
    } catch (err) { msg.className = 'form-msg err'; msg.textContent = err.message; }
    btn.disabled = false;
  });

  /* ---------- QR-код ---------- */
  let qrTarget = '#menu';
  function baseUrl() {
    const s = (settings.siteUrl || '').trim().replace(/\/+$/, '');
    if (s) return /^https?:\/\//i.test(s) ? s + '/' : 'https://' + s + '/';
    return location.origin + location.pathname.replace(/index\.html$/, '');
  }
  function renderQR() {
    const url = baseUrl() + qrTarget;
    const a = $('#qrLink'); a.textContent = url; a.href = url;
    const cv = $('#qrCanvas'), ctx = cv.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cv.width, cv.height);
    if (typeof qrcode !== 'function') { ctx.fillStyle = '#b84a0e'; ctx.font = '28px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('Немає інтернету для QR', 300, 300); return; }
    const qr = qrcode(0, 'H'); qr.addData(unescape(encodeURIComponent(url))); qr.make();
    const n = qr.getModuleCount(), cell = Math.floor(cv.width / (n + 4)), off = Math.floor((cv.width - cell * n) / 2);
    ctx.fillStyle = '#1c1410';
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) ctx.fillRect(off + c * cell, off + r * cell, cell, cell);
    ctx.fillStyle = '#b84a0e';
    [[0, 0], [0, n - 7], [n - 7, 0]].forEach(([r, c]) => ctx.fillRect(off + (c + 2) * cell, off + (r + 2) * cell, cell * 3, cell * 3));
    const logo = new Image();
    logo.onload = () => { const s = cell * Math.round(n * 0.22), x = (cv.width - s) / 2; ctx.fillStyle = '#fff'; ctx.fillRect(x - cell, x - cell, s + cell * 2, s + cell * 2); ctx.drawImage(logo, x + s * 0.06, x, s * 0.88, s * 0.97); };
    logo.src = 'assets/logo.svg';
  }
  $$('.qchip').forEach(b => b.addEventListener('click', () => { $$('.qchip').forEach(x => x.classList.toggle('active', x === b)); qrTarget = b.dataset.target; renderQR(); }));
  $('#qrDownload').addEventListener('click', () => {
    const cv = $('#qrCanvas'), out = document.createElement('canvas'), pad = 60;
    out.width = cv.width + pad * 2; out.height = cv.height + pad * 2 + 90;
    const c = out.getContext('2d'); c.fillStyle = '#fff'; c.fillRect(0, 0, out.width, out.height);
    c.drawImage(cv, pad, pad); c.fillStyle = '#b84a0e'; c.font = 'bold 40px Oswald, Arial'; c.textAlign = 'center';
    c.fillText('ROUTE 66 COFFEE DINER', out.width / 2, out.height - 60);
    const a = document.createElement('a'); a.download = 'route66-qr.png'; a.href = out.toDataURL('image/png'); a.click();
  });
  $('#qrPrint').addEventListener('click', () => window.print());
  $('#qrShare').addEventListener('click', async () => {
    const url = $('#qrLink').href;
    try {
      if (navigator.share) await navigator.share({ title: 'Route 66 Coffee Diner', url });
      else { await navigator.clipboard.writeText(url); $('#qrShare').textContent = 'Скопійовано ✓'; setTimeout(() => ($('#qrShare').textContent = 'Поділитися'), 2000); }
    } catch (e) { /* скасовано */ }
  });

  /* ---------- старт ---------- */
  (async () => {
    // спершу меню — воно ж визначає, чи є сервер (STATIC)
    const [m] = await Promise.allSettled([load('menu')]);
    const [s, r] = await Promise.allSettled([load('settings'), load('reviews')]);
    if (STATIC) {
      // без сервера відгуки не зберегти — ховаємо все, що з ними повʼязано
      ['#reviews', '#heroRating', '#ebPassword', '#ownerPw', '#loginHint'].forEach(s => ($(s).hidden = true));
      $$('a[href="#reviews"], .qchip[data-target="#reviews"]').forEach(a => (a.hidden = true));
      $('#ghLogin').hidden = false;
      token = null;
    }
    if (s.status === 'fulfilled') settings = s.value;
    if (m.status === 'fulfilled') menu = m.value;
    else $('#menuList').innerHTML = '<p class="loading">Не вдалося завантажити меню. Оновіть сторінку.</p>';
    if (r.status === 'fulfilled') reviews = r.value;
    applySettings(); renderMenu(); renderReviews();
    if (STATIC) {
      $('#ghRepoName').textContent = ghRepo().split('/')[1];
      if (/^#(admin|owner)$/.test(location.hash)) { history.replaceState(null, '', location.pathname); if (ghToken) await enterEdit().catch(() => {}); else openModal('#loginModal'); }
      else if (ghToken) await enterEdit().catch(() => {});
      else if (location.hash.length > 1) { const t = document.querySelector(location.hash); if (t) setTimeout(() => t.scrollIntoView(), 50); }
    }
    else if (location.hash === '#admin' || location.hash === '#owner') {
      history.replaceState(null, '', location.pathname);
      if (token) await enterEdit().catch(() => {}); else openModal('#loginModal');
    } else if (token) { await enterEdit().catch(() => {}); }
    else if (location.hash) { const t = document.querySelector(location.hash); if (t) setTimeout(() => t.scrollIntoView(), 50); }
  })();
})();
