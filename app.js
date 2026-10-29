/* PhoneRay — Telegram-приложение. Без сборки и зависимостей: обычный JS.
 *
 * Как добавить новую вкладку: допишите объект в массив TABS (id, title, icon, build).
 * build(root) наполняет страницу <section id="page-<id>"> и возвращает {onShow() {...}} (необязательно).
 * Режим предпросмотра без Telegram: откройте адрес с ?demo (данные — заглушки, ничего не сохраняется). */
(function () {
  'use strict';

  const tg = window.Telegram && window.Telegram.WebApp;
  const DEMO = /(?:^|[?&])demo(?:=|&|$)/.test(location.search);
  const API = String(window.PHONERAY_API || '').replace(/\/+$/, '');

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const fmtNum = (n) => Number(n || 0).toLocaleString('ru-RU').replace(/\u00a0/g, ' ');
  const pad2 = (n) => String(n).padStart(2, '0');
  const fmtTime = (s) => { s = Math.max(0, Math.ceil(s)); return pad2(Math.floor(s / 3600)) + ':' + pad2(Math.floor(s % 3600 / 60)) + ':' + pad2(s % 60); };
  function el(tag, cls, html) { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* нет доступа к хранилищу — не страшно */ } },
  };
  function haptic(kind) {
    try {
      const h = tg && tg.HapticFeedback;
      if (!h) return;
      if (kind === 'success' || kind === 'error' || kind === 'warning') h.notificationOccurred(kind); else h.impactOccurred(kind || 'light');
    } catch (e) { /* ignore */ }
  }

  /* ---------------- редкости ---------------- */
  const RARITY = {
    'Мусор': '#7d8597', 'Необычный': '#4ade80', 'Редкий': '#3b82f6', 'Эпический': '#a855f7', 'Легендарный': '#f59e0b',
    'Мифический': '#ef4444', 'Хроматический': '#22d3ee', 'Коллекционный': '#eab308', 'Секретный': '#ec4899',
    'Космический': '#6366f1', 'Экзотический': '#14b8a6', 'Уникальный': '#fde047', 'Кошмарный': '#b91c1c',
  };
  const rc = (r) => RARITY[r] || '#8b95ad';

  /* ---------------- безопасная подпись карточки ---------------- */
  const ALLOWED = { B: 'b', STRONG: 'b', I: 'i', EM: 'i', U: 'u', S: 's', CODE: 'code' };
  function safeHtml(html) {
    const doc = new DOMParser().parseFromString('<div>' + String(html || '') + '</div>', 'text/html');
    const frag = document.createDocumentFragment();
    (function walk(src, dst) {
      src.childNodes.forEach((n) => {
        if (n.nodeType === 3) dst.appendChild(document.createTextNode(n.nodeValue));
        else if (n.nodeType === 1) {
          const tag = ALLOWED[n.tagName];
          if (tag) { const e = document.createElement(tag); walk(n, e); dst.appendChild(e); } else walk(n, dst);
        }
      });
    })(doc.body.firstChild, frag);
    return frag;
  }

  /* ---------------- Telegram ---------------- */
  function tgInit() {
    const setH = () => document.documentElement.style.setProperty('--app-h', ((tg && tg.viewportStableHeight) || window.innerHeight) + 'px');
    setH();
    window.addEventListener('resize', setH);
    if (!tg) return;
    try { tg.ready(); tg.expand(); } catch (e) { /* ignore */ }
    try { tg.setHeaderColor('#0b0e14'); tg.setBackgroundColor('#0b0e14'); } catch (e) { /* старые клиенты */ }
    try { tg.onEvent('viewportChanged', setH); } catch (e) { /* ignore */ }
  }

  /* ---------------- API ---------------- */
  const state = { me: null, tab: null, tabs: {} };
  function gate(icon, text) { $('#gateIco').textContent = icon; $('#gateText').textContent = text; $('#gate').hidden = false; }

  async function api(path, opts) {
    opts = opts || {};
    if (DEMO) return demoApi(path, opts);
    const headers = { 'Content-Type': 'application/json' };
    if (tg && tg.initData) headers.Authorization = 'tma ' + tg.initData;
    let res;
    try {
      res = await fetch(API + path, { method: opts.method || 'GET', headers, body: opts.body ? JSON.stringify(opts.body) : undefined });
    } catch (e) { return { ok: false, error: 'network' }; }
    let data = null;
    try { data = await res.json(); } catch (e) { /* не JSON */ }
    if (!data) data = { ok: false, error: 'http_' + res.status };
    if (data.error === 'auth') gate('📱', 'Не удалось подтвердить, что вы в Telegram.\nЗакройте приложение и откройте его снова через бота.');
    else if (data.error === 'banned' || data.error === 'terms') gate(data.error === 'banned' ? '🚫' : '📜', data.message || '');
    return data;
  }
  const photoUrl = (p) => (p ? API + p : null);

  function toast(msg, kind, ms) {
    const t = el('div', 'toast' + (kind ? ' ' + kind : ''));
    t.textContent = msg;
    $('#toasts').appendChild(t);
    setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 320); }, ms || 3200);
  }

  async function refreshMe() {
    const d = await api('/api/me');
    if (!d || !d.ok) return null;
    state.me = d;
    $('#balChip').textContent = '₽ ' + fmtNum(d.balance);
    $('#ptsChip').textContent = '🌐 ' + fmtNum(d.points);
    $('#sideUser').textContent = d.user.name;
    ['tel', 'pc'].forEach((k) => { const t = state.tabs[k]; if (t && t.setCooldown) t.setCooldown(d[k].remaining, d[k].free); });
    return d;
  }

  /* ---------------- рулетка («тел» / «пк») ---------------- */
  function buildRoulette(kind, cfg) {
    return function (root) {
      root.innerHTML =
        '<div class="roulette">' +
        '<div class="r-title">' + cfg.title + '</div><div class="r-sub">' + cfg.sub + '</div>' +
        '<div class="wheel"><div class="stage"></div><button class="spin-btn" type="button">Крутить!</button></div>' +
        '<div class="r-timer"></div><div class="r-result"></div></div>';
      const wheel = $('.wheel', root), stage = $('.stage', root), btn = $('.spin-btn', root);
      const timerEl = $('.r-timer', root), resultEl = $('.r-result', root), scroller = $('.roulette', root);
      const st = { busy: false, pool: [], cdEnd: 0, free: 0, tick: null, lastAngle: 0, recent: [] };

      async function loadPool() {
        const d = await api('/api/pool/' + kind);
        st.pool = (d && d.ok && d.items) || [];
        st.pool.forEach((p) => { if (p.photo) { const i = new Image(); i.src = photoUrl(p.photo); } });   // прогреваем картинки
      }
      function pickItem() {
        if (!st.pool.length) {   // каталог пуст — рисуем цветные заглушки
          const names = Object.keys(RARITY);
          return { name: '', rarity: names[Math.floor(Math.random() * 9)], photo: null };
        }
        let it, tries = 0;
        do { it = st.pool[Math.floor(Math.random() * st.pool.length)]; tries++; } while (st.recent.includes(it) && tries < 6);
        st.recent.push(it); if (st.recent.length > 4) st.recent.shift();
        return it;
      }
      function spawn() {
        const it = pickItem();
        let a; do { a = Math.random() * Math.PI * 2; } while (Math.abs(Math.sin((a - st.lastAngle) / 2)) < 0.35);
        st.lastAngle = a;
        const r = 33 + Math.random() * 8;
        const c = el('div', 'fcard');
        c.style.setProperty('--rc', rc(it.rarity));
        c.style.setProperty('--rot', ((Math.random() - .5) * 28).toFixed(1) + 'deg');
        c.style.left = (50 + Math.cos(a) * r).toFixed(2) + '%';
        c.style.top = (50 + Math.sin(a) * r).toFixed(2) + '%';
        const ph = '<div class="ph">' + cfg.emoji + '</div>';
        c.innerHTML = (it.photo ? '<img alt="" src="' + esc(photoUrl(it.photo)) + '">' : ph) + (it.name ? '<div class="nm">' + esc(it.name) + '</div>' : '');
        const img = $('img', c);
        if (img) img.onerror = () => { img.replaceWith(el('div', 'ph', cfg.emoji)); };
        stage.appendChild(c);
        setTimeout(() => c.remove(), 1000);
        haptic('light');
      }
      function animate(ms, shouldStop) {
        return new Promise((resolve) => {
          let over = false;
          const end = setTimeout(() => { over = true; resolve(); }, ms);
          const t0 = Date.now();
          (function loop() {
            if (over) return;
            if (shouldStop()) { clearTimeout(end); over = true; resolve(); return; }
            spawn();
            const t = Math.min(1, (Date.now() - t0) / ms);
            setTimeout(loop, 95 + 290 * t * t);   // к концу карточки меняются всё медленнее
          })();
        });
      }

      function renderIdle() {
        const left = (st.cdEnd - Date.now()) / 1000;
        if (st.busy) return;
        if (left <= 0) {
          btn.disabled = false; btn.innerHTML = 'Крутить!'; timerEl.innerHTML = '';
        } else if (st.free > 0) {
          btn.disabled = false; btn.innerHTML = 'Крутить!<small>бесплатно: ' + st.free + '</small>';
          timerEl.innerHTML = 'Или подождите: <b>' + fmtTime(left) + '</b>';
        } else {
          btn.disabled = true; btn.innerHTML = '⏳<small>' + fmtTime(left) + '</small>';
          timerEl.innerHTML = 'Следующий прокрут через <b>' + fmtTime(left) + '</b>';
        }
      }
      function setCooldown(seconds, free) {
        st.cdEnd = Date.now() + Math.max(0, seconds) * 1000; st.free = free || 0;
        clearInterval(st.tick);
        st.tick = setInterval(renderIdle, 1000);
        renderIdle();
      }

      function showResult(cards) {
        resultEl.innerHTML = '';
        cards.forEach((c, i) => {
          const card = el('div', 'res-card');
          card.style.setProperty('--rc', rc(c.rarity));
          card.style.animationDelay = (i * 0.12) + 's';
          const photo = el('div', 'res-photo');
          if (c.photo) {
            const img = el('img'); img.alt = c.name; img.src = photoUrl(c.photo);
            img.onerror = () => { img.replaceWith(el('div', 'ph', cfg.emoji)); };
            photo.appendChild(img);
          } else photo.appendChild(el('div', 'ph', cfg.emoji));
          photo.appendChild(el('span', 'res-rar', esc(c.rarity)));
          if (c.mutation) photo.appendChild(el('span', 'res-mut', '🧬 ' + esc(c.mutation)));
          const cap = el('div', 'res-caption');
          cap.appendChild(safeHtml(c.caption));
          card.appendChild(photo); card.appendChild(cap);
          resultEl.appendChild(card);
        });
        if (cards.length > 1) resultEl.insertBefore(el('div', 'res-note', 'Получено карточек: ' + cards.length), resultEl.firstChild);
        // прокручиваем только контейнер рулетки (scrollIntoView сдвигал бы всё приложение)
        setTimeout(() => { try { scroller.scrollTo({ top: Math.max(0, resultEl.offsetTop - 10), behavior: 'smooth' }); } catch (e) { /* ignore */ } }, 250);
      }

      async function spin() {
        if (st.busy) return;
        st.busy = true;
        haptic('medium');
        resultEl.innerHTML = '';
        btn.disabled = true; btn.innerHTML = '…';
        timerEl.innerHTML = '';
        wheel.classList.add('spinning');
        scroller.scrollTo && scroller.scrollTo({ top: 0, behavior: 'smooth' });
        let failed = false;
        const req = api('/api/spin/' + kind, { method: 'POST' }).then((r) => { if (!r || !r.ok) failed = true; return r; });
        await animate(4000, () => failed);   // 4 секунды «выбираем карточку» (раньше — если бот сразу отказал)
        const res = await Promise.race([req, sleep(15000).then(() => null)]);
        wheel.classList.remove('spinning');
        stage.innerHTML = '';
        st.busy = false;
        if (!res || !res.ok) {
          haptic('error');
          if (res && res.error === 'cooldown') { setCooldown(res.remaining, res[kind] && res[kind].free); toast('Перезарядка ещё не прошла', 'bad'); }
          else if (res && res.error === 'busy') toast('Прокрут уже идёт…');
          else toast((res && res.message) || 'Не получилось. Попробуйте ещё раз.', 'bad');
          if (res && res[kind]) setCooldown(res[kind].remaining, res[kind].free); else renderIdle();
          return;
        }
        haptic('success');
        showResult(res.cards);
        (res.notices || []).forEach((n, i) => setTimeout(() => toast(n), 600 + i * 700));
        setCooldown(res[kind].remaining, res[kind].free);
        refreshMe();
      }
      btn.addEventListener('click', spin);

      return {
        kind,
        setCooldown,
        onShow() { if (!st.pool.length) loadPool(); refreshMe(); },
        _debug: st,
      };
    };
  }

  /* ---------------- апгрейды: древо навыков ---------------- */
  const PERK_ICONS = {
    junk: '🗑️', meteor: '☄️', new: '✨', pricebonus: '💰', updcost: '🔧', gsell: '📦', farm_income: '🏭', pc_break: '🛠️',
    cd_tel: '📱', cd_pc: '🖥️', cd_cube: '🎲', farm_wear: '🪫', repair_time: '⏳', ransom: '🤝', event_cut: '🛡️', boost: '🚀',
  };
  const TREE_STYLE = {
    loot: { color: '#ffb347', bg: 'linear-gradient(180deg, rgba(255,179,71,.20), rgba(255,120,40,.05) 60%, rgba(10,12,18,.9))', hint: 'Шансы и деньги' },
    time: { color: '#5ac8fa', bg: 'linear-gradient(180deg, rgba(90,200,250,.20), rgba(60,110,255,.05) 60%, rgba(10,12,18,.9))', hint: 'Перезарядки и ожидание' },
    control: { color: '#5eead4', bg: 'linear-gradient(180deg, rgba(94,234,212,.18), rgba(60,200,140,.05) 60%, rgba(10,12,18,.9))', hint: 'Ферма и риски' },
  };
  const BAND_W = 540, WORLD_H = 1060;

  function seeded(seedStr) {
    let h = 1779033703 ^ seedStr.length;
    for (let i = 0; i < seedStr.length; i++) { h = Math.imul(h ^ seedStr.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); }
    let a = h >>> 0;
    return () => { a = (a + 0x6D2B79F5) >>> 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }

  function buildUpgrades(root) {
    root.innerHTML =
      '<div class="tree-page"><div class="tree-tabs"></div>' +
      '<div class="tree-viewport"><div class="tree-world"></div></div></div>';
    const viewport = $('.tree-viewport', root), world = $('.tree-world', root), tabsEl = $('.tree-tabs', root);
    const view = { x: 0, y: 0, s: 1 };
    const model = { data: null, selected: null, nodes: {}, edges: [] };
    let moved = false;

    const treeStyle = (key) => TREE_STYLE[key] || { color: '#a78bfa', bg: 'linear-gradient(180deg, rgba(167,139,250,.2), rgba(10,12,18,.9))', hint: '' };

    function clamp() {
      const vw = viewport.clientWidth, vh = viewport.clientHeight;
      const ww = world.offsetWidth * view.s, wh = WORLD_H * view.s, m = 70;
      view.x = ww <= vw ? (vw - ww) / 2 : Math.min(m, Math.max(vw - ww - m, view.x));
      view.y = wh <= vh ? (vh - wh) / 2 : Math.min(m, Math.max(vh - wh - m, view.y));
    }
    function apply() { world.style.transform = 'translate(' + view.x.toFixed(1) + 'px,' + view.y.toFixed(1) + 'px) scale(' + view.s.toFixed(3) + ')'; }
    function zoomAt(ns, cx, cy) {
      ns = Math.min(1.7, Math.max(0.55, ns));
      const k = ns / view.s;
      view.x = cx - (cx - view.x) * k; view.y = cy - (cy - view.y) * k; view.s = ns;
      clamp(); apply();
    }
    function focusBand(i, animated) {
      const vw = viewport.clientWidth;
      view.s = Math.min(1, Math.max(0.7, vw / BAND_W));
      view.x = vw / 2 - (i * BAND_W + BAND_W / 2) * view.s; view.y = 0;
      clamp();
      if (animated) { world.style.transition = 'transform .5s cubic-bezier(.22,.8,.24,1)'; setTimeout(() => { world.style.transition = ''; }, 520); }
      apply();
      $$('.tree-tab', tabsEl).forEach((t, k) => t.classList.toggle('active', k === i));
    }

    /* перетаскивание / масштаб */
    const pts = new Map();
    let drag = null, pinch = null, downNode = null;
    const dist = () => { const [a, b] = Array.from(pts.values()); return Math.hypot(a.x - b.x, a.y - b.y) || 1; };
    viewport.addEventListener('pointerdown', (e) => {
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      try { viewport.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
      if (pts.size === 1) { drag = { sx: e.clientX, sy: e.clientY, vx: view.x, vy: view.y }; moved = false; downNode = e.target.closest ? e.target.closest('.node') : null; }
      else if (pts.size === 2) { pinch = { d: dist(), s: view.s }; drag = null; moved = true; }
    });
    viewport.addEventListener('pointermove', (e) => {
      if (!pts.has(e.pointerId)) return;
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size === 2 && pinch) {
        const [a, b] = Array.from(pts.values());
        const r = viewport.getBoundingClientRect();
        zoomAt(pinch.s * dist() / pinch.d, (a.x + b.x) / 2 - r.left, (a.y + b.y) / 2 - r.top);
      } else if (drag) {
        const dx = e.clientX - drag.sx, dy = e.clientY - drag.sy;
        if (!moved && Math.hypot(dx, dy) > 6) moved = true;
        if (moved) { view.x = drag.vx + dx; view.y = drag.vy + dy; clamp(); apply(); }
      }
    });
    const release = (e) => {
      if (!pts.has(e.pointerId)) return;
      const wasTap = pts.size === 1 && !moved && e.type === 'pointerup';
      pts.delete(e.pointerId);
      if (pts.size < 2) pinch = null;
      if (pts.size === 1) { const [p] = Array.from(pts.values()); drag = { sx: p.x, sy: p.y, vx: view.x, vy: view.y }; }
      else if (pts.size === 0) drag = null;
      if (wasTap) { if (downNode && downNode.dataset.key) openSheet(downNode.dataset.key); else closeSheet(); }
      if (pts.size === 0) downNode = null;
      updateTabs();
    };
    viewport.addEventListener('pointerup', release);
    viewport.addEventListener('pointercancel', release);
    viewport.addEventListener('wheel', (e) => {
      e.preventDefault();
      const r = viewport.getBoundingClientRect();
      zoomAt(view.s * (e.deltaY < 0 ? 1.12 : 0.89), e.clientX - r.left, e.clientY - r.top);
    }, { passive: false });
    function updateTabs() {   // подсветка вкладки по тому, какая ветка сейчас в центре
      if (!model.data) return;
      const centerWorld = (viewport.clientWidth / 2 - view.x) / view.s;
      const i = Math.min(model.data.trees.length - 1, Math.max(0, Math.floor(centerWorld / BAND_W)));
      $$('.tree-tab', tabsEl).forEach((t, k) => t.classList.toggle('active', k === i));
    }

    /* построение дерева */
    function render() {
      const data = model.data;
      world.innerHTML = '';
      model.nodes = {}; model.edges = [];
      world.style.width = (data.trees.length * BAND_W) + 'px'; world.style.height = WORLD_H + 'px';
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('class', 'tree-lines'); svg.setAttribute('width', data.trees.length * BAND_W); svg.setAttribute('height', WORLD_H);
      tabsEl.innerHTML = '';

      data.trees.forEach((tree, ti) => {
        const ts = treeStyle(tree.key);
        const bx = ti * BAND_W;
        const band = el('div', 'band');
        band.style.left = bx + 'px'; band.style.width = BAND_W + 'px';
        band.style.setProperty('--bg-grad', ts.bg); band.style.setProperty('--tc', ts.color);
        band.appendChild(el('div', 'band-title', esc(tree.title)));
        band.appendChild(el('div', 'band-sub', esc(ts.hint)));
        world.appendChild(band);

        const tab = el('button', 'tree-tab', esc(tree.title));
        tab.type = 'button'; tab.style.setProperty('--tc', ts.color);
        tab.addEventListener('click', () => { haptic('light'); focusBand(ti, true); });
        tabsEl.appendChild(tab);

        // положение перков: «шахматная» сетка с небольшим случайным разбросом (одинаковая у всех игроков)
        const rnd = seeded('phoneray:' + tree.key);
        const root = { key: null, x: bx + BAND_W / 2, y: 235, icon: '💠', title: tree.title };
        const pos = [root];
        tree.perks.forEach((p, i) => {
          const row = Math.floor(i / 2), col = i % 2;
          pos.push({
            key: p.key, perk: p, tree: tree,
            x: bx + BAND_W * (col ? 0.71 : 0.29) + (rnd() - .5) * 64,
            y: 390 + row * 170 + (col ? 62 : 0) + (rnd() - .5) * 34,
          });
        });
        // ветки: каждый перк тянется к случайному из уже стоящих; плюс несколько случайных перемычек
        const edges = [];
        for (let i = 1; i < pos.length; i++) {
          const near = Math.max(0, i - 3);
          const parent = i === 1 ? 0 : (rnd() < 0.22 ? 0 : near + Math.floor(rnd() * (i - near)));
          edges.push([parent, i]);
        }
        for (let i = 3; i < pos.length; i++) {
          if (rnd() < 0.5) {
            const j = 1 + Math.floor(rnd() * (i - 1));
            if (!edges.some(([a, b]) => (a === j && b === i) || (a === i && b === j))) edges.push([j, i]);
          }
        }
        edges.forEach(([a, b]) => {
          const A = pos[a], B = pos[b];
          const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
          const mx = (A.x + B.x) / 2 + (rnd() - .5) * 46, my = (A.y + B.y) / 2 + (rnd() - .5) * 30;
          path.setAttribute('d', 'M' + A.x.toFixed(1) + ',' + A.y.toFixed(1) + ' Q' + mx.toFixed(1) + ',' + my.toFixed(1) + ' ' + B.x.toFixed(1) + ',' + B.y.toFixed(1));
          path.style.setProperty('--tc', ts.color);
          svg.appendChild(path);
          model.edges.push({ path, a: A, b: B });
        });

        pos.forEach((P, i) => {
          const n = el('div', 'node' + (i === 0 ? ' root' : ''));
          n.style.left = P.x.toFixed(1) + 'px'; n.style.top = P.y.toFixed(1) + 'px'; n.style.setProperty('--tc', ts.color);
          if (i === 0) n.innerHTML = '<div class="orb">' + P.icon + '</div>';
          else {
            n.dataset.key = P.key;
            n.innerHTML = '<div class="orb">' + (PERK_ICONS[P.key] || '✨') + '<span class="lv"></span></div><div class="nm">' + esc(P.perk.short) + '</div>';
            model.nodes[P.key] = { el: n, perk: P.perk, tree: tree, color: ts.color };
          }
          world.appendChild(n);
        });
      });
      world.insertBefore(svg, world.querySelector('.node'));
      paintLevels();
    }

    function paintLevels() {
      Object.values(model.nodes).forEach((n) => {
        const p = n.perk;
        n.el.classList.toggle('has', p.level > 0);
        n.el.classList.toggle('max', p.level >= p.max);
        $('.lv', n.el).textContent = p.level + '/' + p.max;
      });
      model.edges.forEach((e) => {
        const lit = (P) => !P.key || (model.nodes[P.key] && model.nodes[P.key].perk.level > 0);
        e.path.classList.toggle('lit', lit(e.a) && lit(e.b));
      });
    }

    /* шторка перка */
    const sheet = $('#sheet'), sheetScrim = $('#sheetScrim');
    let sheetOpenedAt = 0;
    function openSheet(key) {
      const n = model.nodes[key]; if (!n) return;
      model.selected = key; sheetOpenedAt = Date.now(); haptic('light');
      fillSheet();
      sheet.classList.add('show'); sheetScrim.classList.add('show'); sheet.setAttribute('aria-hidden', 'false');
    }
    function closeSheet() { model.selected = null; sheet.classList.remove('show'); sheetScrim.classList.remove('show'); sheet.setAttribute('aria-hidden', 'true'); }
    function fillSheet() {
      const n = model.nodes[model.selected]; if (!n) return;
      const p = n.perk, d = model.data;
      sheet.style.setProperty('--tc', n.color);
      $('#sheetIco').textContent = PERK_ICONS[p.key] || '✨';
      $('#sheetTitle').textContent = p.title;
      $('#sheetSub').textContent = n.tree.title + ' · уровень ' + p.level + '/' + p.max;
      $('#sheetNow').textContent = p.level > 0 ? 'Сейчас: ' + p.title + ' ' + p.levels[p.level - 1] : 'Пока не изучен';
      const ul = $('#sheetLevels'); ul.innerHTML = '';
      p.levels.forEach((lab, i) => {
        const li = el('li', i < p.level ? 'done' : i === p.level ? 'next' : '');
        li.innerHTML = '<span class="n">' + (i < p.level ? '✓' : (i + 1)) + '</span><span>' + esc(p.title) + ' <b>' + esc(lab) + '</b></span>';
        ul.appendChild(li);
      });
      $('#sheetNote').textContent = p.footnote ? '* Не действует на комплектующие ПК.' : '';
      $('#sheetPts').textContent = fmtNum(d.points);
      const b = $('#upgradeBtn');
      if (p.level >= p.max) { b.textContent = 'Максимум'; b.disabled = true; }
      else if (d.points < d.cost) { b.textContent = 'Не хватает поинтов'; b.disabled = true; }
      else { b.textContent = 'Улучшить · ' + d.cost + ' 🌐'; b.disabled = false; }
    }
    // после касания браузер присылает «призрачный» click в ту же точку — он не должен сразу закрывать шторку
    sheetScrim.addEventListener('click', () => { if (Date.now() - sheetOpenedAt > 500) closeSheet(); });
    $('#upgradeBtn').addEventListener('click', async () => {
      const key = model.selected; if (!key) return;
      const b = $('#upgradeBtn'); b.disabled = true;
      const res = await api('/api/perks/upgrade', { method: 'POST', body: { key } });
      if (res && res.trees) {
        model.data = res;
        Object.values(res.trees).forEach((t) => t.perks.forEach((p) => { if (model.nodes[p.key]) model.nodes[p.key].perk = p; }));
        paintLevels();
        $('#ptsChip').textContent = '🌐 ' + fmtNum(res.points);
        if (res.upgraded) {
          const n = model.nodes[key]; n.el.classList.remove('pulse'); void n.el.offsetWidth; n.el.classList.add('pulse');
          haptic('success'); toast('Улучшено: ' + n.perk.title + ' ' + n.perk.levels[n.perk.level - 1], 'good');
        } else toast(res.error === 'max' ? 'Уже максимальный уровень' : 'Не хватает поинтов', 'bad');
      } else toast((res && res.message) || 'Не получилось улучшить. Попробуйте ещё раз.', 'bad');
      fillSheet();
    });

    async function load(first) {
      const d = await api('/api/perks');
      if (!d || !d.ok) { if (first) toast('Не удалось загрузить апгрейды', 'bad'); return; }
      const rebuild = !model.data;
      model.data = d;
      if (rebuild) { render(); focusBand(0, false); }
      else {
        d.trees.forEach((t) => t.perks.forEach((p) => { if (model.nodes[p.key]) model.nodes[p.key].perk = p; }));
        paintLevels(); if (model.selected) fillSheet();
      }
      $('#ptsChip').textContent = '🌐 ' + fmtNum(d.points);
    }
    window.addEventListener('resize', () => { if (model.data) { clamp(); apply(); } });

    return {
      onShow() { load(!model.data).then(() => { if (model.data) { clamp(); apply(); } }); },
      onHide() { closeSheet(); },
      _debug: { view, model, focusBand, openSheet },
    };
  }

  /* ---------------- вкладки и меню ---------------- */
  const TABS = [
    { id: 'home', title: 'Главная', icon: '🏠', main: true },
    { id: 'tel', title: 'Тел', icon: '📱', build: buildRoulette('tel', { title: '📱 Тел', emoji: '📱', sub: 'Нажмите «Крутить!» — и получите случайный телефон. Он сразу появится в инвентаре бота.' }) },
    { id: 'pc', title: 'Пк', icon: '🖥', build: buildRoulette('pc', { title: '🖥 Пк', emoji: '🖥', sub: 'Нажмите «Крутить!» — и получите случайную деталь для ПК. Она сразу появится в инвентаре бота.' }) },
    { id: 'upgrades', title: 'Апгрейды', icon: '🌳', build: buildUpgrades },
  ];
  const titleOf = (id) => (TABS.find((t) => t.id === id) || {}).title || 'PhoneRay';

  function setMenu(open) { document.body.classList.toggle('menu-open', open); }

  function go(id) {
    if (!TABS.some((t) => t.id === id)) id = 'home';
    const prev = state.tab;
    if (prev === id) { setMenu(false); return; }
    if (prev && state.tabs[prev] && state.tabs[prev].onHide) state.tabs[prev].onHide();
    state.tab = id;
    $$('.page').forEach((p) => {
      const active = p.id === 'page-' + id;
      p.classList.toggle('active', active);
      p.classList.toggle('leaving-left', p.id === 'page-' + prev);
    });
    $$('[data-tab]').forEach((b) => b.classList.toggle('active', b.dataset.tab === id));
    $('#topTitle').textContent = id === 'home' ? 'PhoneRay' : titleOf(id);
    setMenu(false);
    store.set('pr_tab', id);
    try {
      if (tg) {
        if (id === 'home') tg.BackButton.hide(); else tg.BackButton.show();
        if (id === 'upgrades' && tg.disableVerticalSwipes) tg.disableVerticalSwipes();   // чтобы дерево не закрывало приложение
        else if (tg.enableVerticalSwipes) tg.enableVerticalSwipes();
      }
    } catch (e) { /* старые клиенты */ }
    if (state.tabs[id] && state.tabs[id].onShow) state.tabs[id].onShow();
  }

  function buildNav() {
    const group = $('#cmdGroup');
    TABS.filter((t) => !t.main).forEach((t) => {
      const b = el('button', 'nav-item', '<span class="nav-ico">' + t.icon + '</span><span>' + esc(t.title) + '</span>');
      b.type = 'button'; b.dataset.tab = t.id;
      group.appendChild(b);
    });
    document.addEventListener('click', (e) => {
      const nav = e.target.closest && e.target.closest('[data-tab]');
      if (nav) { haptic('light'); go(nav.dataset.tab); return; }
      const goBtn = e.target.closest && e.target.closest('[data-go]');
      if (goBtn) { haptic('light'); go(goBtn.dataset.go); }
    });
    $('#menuBtn').addEventListener('click', () => setMenu(!document.body.classList.contains('menu-open')));
    $('#scrim').addEventListener('click', () => setMenu(false));
    const head = $('#cmdGroupHead'), body = $('#cmdGroup');
    head.addEventListener('click', () => {
      const open = head.getAttribute('aria-expanded') !== 'true';
      head.setAttribute('aria-expanded', String(open)); body.classList.toggle('collapsed', !open);
    });
    // свайп вправо от левого края открывает меню, влево — закрывает
    let sx = null, sy = null;
    document.addEventListener('touchstart', (e) => { const t = e.touches[0]; sx = t.clientX; sy = t.clientY; }, { passive: true });
    document.addEventListener('touchend', (e) => {
      if (sx == null) return;
      const t = e.changedTouches[0], dx = t.clientX - sx, dy = Math.abs(t.clientY - sy);
      if (state.tab !== 'upgrades' && dy < 40) {
        if (sx < 24 && dx > 70) setMenu(true);
      }
      if (dx < -70 && dy < 40 && document.body.classList.contains('menu-open')) setMenu(false);
      sx = null;
    }, { passive: true });
    try { if (tg) tg.BackButton.onClick(() => go('home')); } catch (e) { /* ignore */ }
  }

  function buildLegend() {
    $('#legend').innerHTML = Object.keys(RARITY).filter((r) => r !== 'Кошмарный')
      .map((r) => '<span class="pill" style="--rc:' + RARITY[r] + '">' + r + '</span>').join('');
  }

  /* ---------------- демо-режим (?demo) ---------------- */
  const DEMO_PERKS = {"trees": [{"key": "loot", "title": "🎯 Лут", "perks": [{"key": "junk", "title": "Шанс на хлам ниже на", "short": "Хлам", "footnote": false, "level": 0, "max": 4, "levels": ["1%", "3%", "4%", "6%"]}, {"key": "meteor", "title": "Шанс на метеорит при получении карточки выше на", "short": "Метеорит", "footnote": true, "level": 0, "max": 4, "levels": ["5%", "10%", "15%", "20%"]}, {"key": "new", "title": "Шанс на статус «Новый» выше на", "short": "Статус «Новый»", "footnote": false, "level": 0, "max": 4, "levels": ["5%", "10%", "15%", "20%"]}, {"key": "pricebonus", "title": "Бонус к цене", "short": "Бонус к цене", "footnote": false, "level": 0, "max": 4, "levels": ["+3% с шансом 5%", "+5% с шансом 10%", "+10% с шансом 20%", "+15% с шансом 25%"]}, {"key": "updcost", "title": "Цена апдейта ниже на", "short": "Цена апдейта", "footnote": false, "level": 0, "max": 3, "levels": ["10%", "15%", "20%"]}, {"key": "gsell", "title": "Глобал продажа: сразу категорий", "short": "Глобал продажа", "footnote": false, "level": 0, "max": 2, "levels": ["2", "3"]}, {"key": "farm_income", "title": "Телефоны на ферме приносят больше дохода на", "short": "Доход фермы", "footnote": false, "level": 0, "max": 4, "levels": ["5%", "10%", "15%", "20%"]}, {"key": "pc_break", "title": "Шанс на поломки ПК ниже на", "short": "Поломки ПК", "footnote": false, "level": 0, "max": 4, "levels": ["5%", "10%", "15%", "20%"]}]}, {"key": "time", "title": "⏱ Время", "perks": [{"key": "cd_tel", "title": "КД на «тел» ниже на", "short": "КД «тел»", "footnote": false, "level": 0, "max": 3, "levels": ["30 мин.", "60 мин.", "90 мин."]}, {"key": "cd_pc", "title": "КД на «пк» ниже на", "short": "КД «пк»", "footnote": false, "level": 0, "max": 3, "levels": ["1 ч.", "2 ч.", "3 ч."]}, {"key": "cd_cube", "title": "КД на «бросок» ниже на", "short": "КД «бросок»", "footnote": false, "level": 0, "max": 3, "levels": ["6 ч.", "12 ч.", "24 ч."]}, {"key": "farm_wear", "title": "Время потери прочности телефона на ферме ниже на", "short": "Износ фермы", "footnote": false, "level": 0, "max": 3, "levels": ["10 мин.", "20 мин.", "30 мин."]}, {"key": "repair_time", "title": "Время ожидания починки телефона меньше на", "short": "Время ремонта", "footnote": false, "level": 0, "max": 4, "levels": ["15%", "25%", "40%", "50%"]}]}, {"key": "control", "title": "🎛 Контроль", "perks": [{"key": "ransom", "title": "Шанс на выкуп на ферме выше на", "short": "Выкуп", "footnote": false, "level": 0, "max": 4, "levels": ["10%", "20%", "30%", "50%"]}, {"key": "event_cut", "title": "Шанс ивента на ферме ниже на", "short": "Ивенты фермы", "footnote": false, "level": 0, "max": 4, "levels": ["10%", "15%", "20%", "25%"]}, {"key": "boost", "title": "Шанс буста телефона на ферме выше на", "short": "Буст фермы", "footnote": false, "level": 0, "max": 4, "levels": ["0%", "5%", "5%", "15%"]}]}], "cost": 1, "point_name": "🌐 Поинт"};
  const demo = { points: 4, balance: 128450, levels: {}, tel: 0, pc: 0 };
  async function demoApi(path, opts) {
    await sleep(120);
    const kind = (path.match(/\/(tel|pc)$/) || [])[1];
    if (path === '/api/about') return { ok: true, owner: { name: 'Владелец', username: 'owner' } };
    if (path === '/api/me') return { ok: true, user: { id: 1, name: 'Демо-игрок', username: 'demo' }, balance: demo.balance, points: demo.points,
      tel: { remaining: Math.max(0, Math.ceil((demo.tel - Date.now()) / 1000)), cooldown: 10800, free: 0 },
      pc: { remaining: Math.max(0, Math.ceil((demo.pc - Date.now()) / 1000)), cooldown: 10800, free: 0 } };
    if (path.startsWith('/api/pool/')) {
      const names = Object.keys(RARITY).slice(0, 12);
      return { ok: true, items: names.map((r, i) => ({ id: i, name: (path.endsWith('tel') ? 'Телефон ' : 'Деталь ') + (i + 1), rarity: r, photo: null })) };
    }
    if (path.startsWith('/api/spin/')) {
      if (demo[kind] > Date.now()) return { ok: false, error: 'cooldown', remaining: Math.ceil((demo[kind] - Date.now()) / 1000), tel: { remaining: 1, free: 0 }, pc: { remaining: 1, free: 0 } };
      demo[kind] = Date.now() + 10800 * 1000;
      const rar = ['Мусор', 'Необычный', 'Редкий', 'Эпический', 'Легендарный', 'Мифический'][Math.floor(Math.random() * 6)];
      const caption = kind === 'tel'
        ? '🎉 Демо-игрок, вы получили новый телефон!\n\n📱 Модель: <b>Xiaomi Redmi 6A</b>\n🏷 Редкость: ' + rar + '\n💰 Цена: 3 000₽\n\n(демо-режим: ничего не сохраняется)'
        : '🖥 Новая деталь!\n\n📦 Название: <b>Ryzen 5 5600</b>\n🔧 Категория: Процессор\n🏷 Редкость: ' + rar + '\n💰 Цена: 20 000₽';
      return { ok: true, cards: [{ kind, id: 1, name: 'Демо', rarity: rar, status: 'Новый', price: 3000, photo: null, caption, mutation: null, sanctioned: false }],
        notices: [], tel: { remaining: kind === 'tel' ? 10800 : 0, free: 0 }, pc: { remaining: kind === 'pc' ? 10800 : 0, free: 0 } };
    }
    if (path === '/api/perks' || path === '/api/perks/upgrade') {
      let upgraded = false, error = null;
      if (path.endsWith('upgrade')) {
        const key = opts.body.key;
        const perk = DEMO_PERKS.trees.flatMap((t) => t.perks).find((p) => p.key === key);
        const lv = demo.levels[key] || 0;
        if (lv >= perk.max) error = 'max'; else if (demo.points < DEMO_PERKS.cost) error = 'points';
        else { demo.levels[key] = lv + 1; demo.points -= DEMO_PERKS.cost; upgraded = true; }
      }
      const trees = DEMO_PERKS.trees.map((t) => ({ ...t, perks: t.perks.map((p) => ({ ...p, level: demo.levels[p.key] || 0 })) }));
      return { ok: true, points: demo.points, cost: DEMO_PERKS.cost, trees, upgraded, error };
    }
    return { ok: false, error: 'demo' };
  }

  /* ---------------- запуск ---------------- */
  async function boot() {
    tgInit();
    buildLegend();
    buildNav();
    TABS.forEach((t) => { if (t.build) state.tabs[t.id] = t.build($('#page-' + t.id)) || {}; });
    if (!DEMO && !(tg && tg.initData)) {
      gate('📱', 'Это приложение работает внутри Telegram.\nОткройте его через бота PhoneRay.');
      return;
    }
    api('/api/about').then((d) => {
      const o = d && d.owner; const line = $('#ownerLine');
      if (!o) { line.textContent = 'Владелец бота'; return; }
      line.innerHTML = o.username ? '<a href="https://t.me/' + esc(o.username) + '" style="color:inherit">@' + esc(o.username) + '</a>' : esc(o.name);
    });
    refreshMe();
    const first = !store.get('pr_seen');
    store.set('pr_seen', '1');
    // первый запуск — главная страница; дальше открываем ту вкладку, где игрок был в прошлый раз
    go(first ? 'home' : (store.get('pr_tab') || 'home'));
    if (!state.tab) go('home');
  }

  window.PhoneRay = { go, state, TABS, safeHtml };   // для отладки
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
