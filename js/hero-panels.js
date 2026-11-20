/* Route 66 Coffee Diner — 3D-панелі з фото страв на головному екрані.
   Як у 3D-відео: великі фото на нахилених у перспективі панелях
   вʼїжджають, повільно наближаються й відʼїжджають з поворотом;
   позаду проїжджає друга панель. Фото — з меню закладу (assets/dishes). */
(function () {
  'use strict';
  const stage = document.getElementById('heroStage');
  if (!stage) return;

  // img — файл у assets/dishes, name — точна назва в меню (для ціни)
  const SLIDES = [
    { img: 'cappuccino', name: 'Капучино' },
    { img: 'basque', name: 'Баскський чізкейк' },
    { img: 'bumblebee', name: 'Джміль' },
    { img: 'sandwich-salmon', name: 'Сендвіч з лососем' },
    { img: 'rose-latte', name: 'Рожевий лате' },
    { img: 'tart-pecan', name: 'Тарт пекан' },
    { img: 'mojito', name: 'Мохіто', title: 'Мохіто (б/а)' },
    { img: 'croissant', name: 'Круасан' },
    { img: 'apple', name: 'Яблуко (мусовий десерт)', title: 'Десерт «Яблуко»' },
    { img: 'bagel', name: 'Бейгл з лососем' },
    { img: 'eclair', name: 'Еклер класичний', title: 'Еклер' },
    { img: 'latte', name: 'Лате' },
    { img: 'donut', name: 'Пончик' },
    { img: 'canele', name: 'Канеле' },
    { img: 'ice-latte', name: 'Айс лате' },
    { img: 'macaron-big', name: 'Макарон' }
  ];
  const BACK = ['tarts', 'trifle', 'cupcake-choco', 'not-snickers', 'chia', 'tubes', 'pastel', 'milkshake', 'quiche', 'nuts', 'columbia', 'tart-caramel'];
  const src = n => 'assets/dishes/' + n + '.jpg';

  // попереднє завантаження
  [...SLIDES.map(s => s.img), ...BACK].forEach(n => { const i = new Image(); i.src = src(n); });

  const label = document.getElementById('nowShowing');
  const lblName = label && label.querySelector('.ns-name');
  const lblPrice = label && label.querySelector('.ns-price');
  let menu = null;
  let current = null;
  document.addEventListener('r66:menu', e => {
    menu = e.detail;
    if (current && lblPrice) { const p = priceOf(current.name); lblPrice.textContent = p; lblPrice.hidden = !p; label.dataset.cat = catOf(current.name) || ''; }
  });
  function priceOf(name) {
    if (!menu) return '';
    for (const c of menu.categories || []) for (const it of c.items || []) {
      if (it.hidden || String(it.name).toLowerCase() !== name.toLowerCase()) continue;
      const ps = (it.variants || []).map(v => v.price).filter(p => p !== null && p !== '' && p !== undefined);
      if (!ps.length) return '';
      return (ps.length > 1 ? 'від ' : '') + Math.min(...ps) + ' ' + (menu.currency || '₴');
    }
    return '';
  }
  function catOf(name) {
    if (!menu) return null;
    for (const c of menu.categories || []) for (const it of c.items || []) if (String(it.name).toLowerCase() === name.toLowerCase()) return c.id;
    return null;
  }
  if (label) label.addEventListener('click', e => {
    const id = label.dataset.cat; const el = id && document.getElementById('cat-' + id);
    if (el) { e.preventDefault(); el.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
  });

  function panel(cls, img) {
    const p = document.createElement('div');
    p.className = 'hp ' + cls;
    p.innerHTML = '<div class="hp-img"></div><div class="hp-glare"></div>';
    p.firstChild.style.backgroundImage = `url("${src(img)}")`;
    stage.appendChild(p);
    return p;
  }

  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const HOLD = 3600, IN = 1300, OUT = 1100;
  let i = 0, b = 0, timer = null, paused = false;

  // кожен слайд — свій «ракурс», щоб було як у відео: то нахил ліворуч, то праворуч
  const POSES = [
    { rx: 14, ry: -18, rz: -5, x: 4, y: 2 },
    { rx: 10, ry: 20, rz: 4, x: -4, y: 0 },
    { rx: 18, ry: -10, rz: 6, x: 2, y: 4 },
    { rx: 8, ry: 16, rz: -6, x: -2, y: -2 }
  ];
  const tf = (x, y, z, rx, ry, rz, s) => `translate3d(${x}vw, ${y}vh, ${z}px) rotateX(${rx}deg) rotateY(${ry}deg) rotateZ(${rz}deg) scale(${s})`;

  function show() {
    const sl = SLIDES[i % SLIDES.length], pose = POSES[i % POSES.length], dir = i % 2 ? -1 : 1;
    const main = panel('hp-main', sl.img);
    const back = panel('hp-back', BACK[b++ % BACK.length]);

    if (reduce) {
      main.style.transform = tf(pose.x, pose.y, 0, pose.rx, pose.ry, pose.rz, 1);
      back.style.transform = tf(-pose.x * 6, -14, -420, pose.rx, -pose.ry, -pose.rz, 1);
    } else {
      const total = IN + HOLD + OUT;
      main.animate([
        { transform: tf(70 * dir, 12, -300, pose.rx + 20, pose.ry + 55 * dir, pose.rz + 12 * dir, 0.9), opacity: 0, offset: 0 },
        { transform: tf(pose.x, pose.y, 0, pose.rx, pose.ry, pose.rz, 1), opacity: 1, offset: IN / total },
        { transform: tf(pose.x - 3 * dir, pose.y - 1, 60, pose.rx - 3, pose.ry - 6 * dir, pose.rz - 2 * dir, 1.07), opacity: 1, offset: (IN + HOLD) / total },
        { transform: tf(-80 * dir, -8, -500, pose.rx - 10, pose.ry - 60 * dir, pose.rz - 14 * dir, 0.85), opacity: 0, offset: 1 }
      ], { duration: total, easing: 'cubic-bezier(.45,.05,.25,1)', fill: 'forwards' });
      main.querySelector('.hp-glare').animate([{ transform: 'translateX(-120%)' }, { transform: 'translateX(120%)' }], { duration: 2200, delay: IN - 300, easing: 'ease-in-out', fill: 'both' });
      back.animate([
        { transform: tf(-40 * dir, -30, -900, pose.rx, -pose.ry - 30 * dir, -pose.rz, 1), opacity: 0 },
        { transform: tf(-26 * dir, -16, -620, pose.rx, -pose.ry, -pose.rz, 1), opacity: 0.85, offset: 0.3 },
        { transform: tf(-20 * dir, -14, -560, pose.rx, -pose.ry + 6 * dir, -pose.rz, 1), opacity: 0.85, offset: 0.75 },
        { transform: tf(10 * dir, -26, -1000, pose.rx, -pose.ry + 40 * dir, -pose.rz, 1), opacity: 0 }
      ], { duration: total + 300, easing: 'ease-in-out', fill: 'forwards' });
      setTimeout(() => { main.remove(); back.remove(); }, total + 400);
    }

    // підпис міняємо, коли панель уже приїхала
    if (label) setTimeout(() => {
      current = sl;
      const price = priceOf(sl.name);
      lblName.textContent = sl.title || sl.name;
      lblPrice.textContent = price; lblPrice.hidden = !price;
      label.dataset.cat = catOf(sl.name) || '';
      label.hidden = false;
      label.classList.remove('in'); void label.offsetWidth; label.classList.add('in');
    }, reduce ? 0 : IN * 0.7);
    i++;
  }

  function loop() {
    if (paused) return;
    show();
    if (!reduce) timer = setTimeout(loop, IN + HOLD);
  }
  // пауза, коли екран не видно (економимо батарею телефона)
  const io = new IntersectionObserver(es => {
    const vis = es[0].isIntersecting;
    if (!vis && !paused) { paused = true; clearTimeout(timer); }
    else if (vis && paused) { paused = false; loop(); }
  });
  io.observe(stage);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { paused = true; clearTimeout(timer); }
    else if (paused) { paused = false; loop(); }
  });
  loop();
})();
