/* 人情往来 · 应用主逻辑 */
(function () {
  'use strict';
  var U = window.U;

  var state = null;
  var ui = {
    tab: 'me',
    relMode: 'graph',
    level: 1,
    ledger: { dir: 'all', range: 'year', pid: 'all' },
    cal: { ym: '', sel: '', filter: 'all' },
    story: { pid: 'all' },
    q: ''
  };

  var ETYPE = {
    birthday: { label: '生日', icon: '🎂', cls: 'birthday' },
    memorial: { label: '忌日', icon: '🕯️', cls: 'memorial' },
    banquet: { label: '宴请', icon: '🧧', cls: 'banquet' },
    custom: { label: '事项', icon: '📌', cls: 'custom' }
  };
  var RANGE_LABEL = { year: '今年', y3: '近三年', all: '全部' };

  /* ---------------- 数据 ---------------- */
  function loadState() {
    try {
      var raw = localStorage.getItem(window.STORE_KEY);
      if (raw) {
        var s = JSON.parse(raw);
        if (s && s.people && s.gifts) return normalize(s);
      }
      // 兼容旧版本：在本地存储里找一个「有 people + gifts」的备份
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (!k || k === window.STORE_KEY) continue;
        try {
          var v = JSON.parse(localStorage.getItem(k));
          if (v && v.people && v.people.length && v.gifts && v.me) return normalize(v);
        } catch (e2) { }
      }
    } catch (e) { }
    return U.clone(window.SEED);
  }
  function normalize(s) {
    s.me = Object.assign({}, window.SEED.me, s.me || {});
    s.people = Array.isArray(s.people) ? s.people : [];
    s.gifts = Array.isArray(s.gifts) ? s.gifts : [];
    s.events = Array.isArray(s.events) ? s.events : [];
    s.stories = Array.isArray(s.stories) ? s.stories : [];
    s.people.forEach(function (p) { if (!p.ring) p.ring = 3; });
    return s;
  }
  /* NAS 版：数据存到 NAS（var/data/state.json），多设备共享；本地打开则用 localStorage */
  var apiOK = false, userDirty = false, syncTimer = null;

  // 统一网关下页面带 /app/xxx 前缀，API 也要带；直连/本地则为 ''。
  function apiBase() {
    var b = document.querySelector('base');
    var href = b ? b.getAttribute('href') : '';
    if (!href || href === '/') return '';
    return href.replace(/\/$/, '');
  }
  function apiUrl(p) { return apiBase() + p; }
  // 统一带上登录令牌；无服务端或未登录时不额外处理（后端会返回 401）
  function authOpts(opts) {
    opts = opts || {};
    var h = opts.headers || {};
    if (window.Auth && Auth.headers) h = Auth.headers(h);
    opts.headers = h;
    return opts;
  }
  function apiFetch(p, opts) { return fetch(apiUrl(p), authOpts(opts)); }

  function pushRemote() {
    if (!apiOK) return;
    try {
      apiFetch('/api/state', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(state)
      }).then(function (r) { if (r.ok) userDirty = false; }).catch(function () { });
    } catch (e) { }
  }
  function save() {
    userDirty = true;
    try { localStorage.setItem(window.STORE_KEY, JSON.stringify(state)); } catch (e) { }
    if (apiOK) {
      clearTimeout(syncTimer);
      syncTimer = setTimeout(pushRemote, 250);
    }
  }
  function pullRemote(showTip) {
    if (location.protocol !== 'http:' && location.protocol !== 'https:') return;
    apiFetch('/api/state', { cache: 'no-store' })
      .then(function (r) { if (!r.ok) throw new Error('no api'); return r.json(); })
      .then(function (remote) {
        apiOK = true;
        refreshPathHint();
        if (userDirty) return; // 本地有尚未推送的修改，不被覆盖
        if (remote && Array.isArray(remote.people) && Array.isArray(remote.gifts)) {
          var changed = JSON.stringify(remote) !== JSON.stringify(state);
          state = normalize(remote);
          try { localStorage.setItem(window.STORE_KEY, JSON.stringify(state)); } catch (e) { }
          if (changed) { render(); if (showTip) toast('已同步 NAS 上的最新记录'); }
        } else if (remote && Object.keys(remote).length === 0) {
          pushRemote(); // 服务端尚无数据，把本地内容首次上传
        }
      })
      .catch(function () { /* 非 NAS 环境，继续使用本地存储 */ });
  }
  function pmap() {
    var m = {}; state.people.forEach(function (p) { m[p.id] = p; }); return m;
  }
  function person(id) {
    if (id === 'me') return state.me;
    return state.people.filter(function (p) { return p.id === id; })[0] || null;
  }
  function pname(id) { return id === 'me' ? '我' : (person(id) ? person(id).name : '未知'); }
  function totalsFor(pid) {
    var o = { in: 0, out: 0, count: 0, last: null };
    state.gifts.forEach(function (g) {
      if (g.pid !== pid) return;
      if (g.dir === 'in') o.in += g.amount; else o.out += g.amount;
      o.count++;
      if (!o.last || g.date > o.last.date) o.last = g;
    });
    return o;
  }
  function allTotals() {
    var o = { in: 0, out: 0, count: state.gifts.length };
    state.gifts.forEach(function (g) { if (g.dir === 'in') o.in += g.amount; else o.out += g.amount; });
    return o;
  }
  function ringCounts() {
    var c = { 1: 0, 2: 0, 3: 0, total: 0 };
    state.people.forEach(function (p) { c[p.ring || 3] = (c[p.ring || 3] || 0) + 1; c.total++; });
    return c;
  }

  /* ---------------- 通用 UI ---------------- */
  function toast(msg) {
    var el = document.getElementById('toast');
    el.textContent = msg;
    el.classList.add('on');
    clearTimeout(el._t);
    el._t = setTimeout(function () { el.classList.remove('on'); }, 2000);
  }
  function pageHead(title, sub, actions) {
    return '<div class="page-head"><div class="ph-txt"><h1>' + title + '</h1><p>' + sub + '</p></div>' +
      '<div class="ph-act">' + (actions || '') + '</div></div>';
  }
  function ringTag(ring) {
    var r = window.RINGS[ring] || window.RINGS[3];
    return '<i class="ring-tag r' + ring + '">' + r.name + '</i>';
  }
  function avatar(p, size) {
    var inner = p.photo
      ? '<img class="ava-img" src="' + U.esc(p.photo) + '" alt="">'
      : U.esc(p.emoji || '🙂');
    return '<span class="ava' + (size ? ' ' + size : '') + '">' + inner + '</span>';
  }
  // 上传照片/头像到 NAS，返回可访问 URL。onErr 可选，用于失败时回收占位
  function uploadAvatar(pid, file, cb, onErr) {
    function fail(msg) { toast(msg); if (typeof onErr === 'function') onErr(); }
    if (!apiOK) { fail('请通过应用中心打开后再上传照片'); return; }
    if (!/^image\/(jpeg|png|gif|webp)$/.test(file.type)) { fail('只支持 JPG/PNG/GIF/WebP 图片'); return; }
    if (file.size > 6 * 1024 * 1024) { fail('图片请小于 6MB'); return; }
    var reader = new FileReader();
    reader.onload = function () {
      apiFetch('/api/avatar/' + encodeURIComponent(pid), {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: reader.result })
      }).then(function (r) { return r.json(); }).then(function (res) {
        if (!res.ok) { fail(res.msg || '上传失败'); return; }
        cb(res.url);
      }).catch(function () { fail('上传失败，请重试'); });
    };
    reader.onerror = function () { fail('读取图片失败'); };
    reader.readAsDataURL(file);
  }

  function openSheet(opts) {
    var root = document.getElementById('modalRoot');
    root.innerHTML = '<div class="scrim" data-act="close"></div>' +
      '<div class="sheet ' + (opts.cls || '') + '">' +
      (!opts.title ? '<button class="icon-btn sheet-x" data-act="close" aria-label="关闭">✕</button>' : '') +
      (opts.title ? '<div class="sheet-head"><div><h3>' + opts.title + '</h3>' +
        (opts.sub ? '<p>' + opts.sub + '</p>' : '') + '</div>' +
        '<button class="icon-btn" data-act="close" aria-label="关闭">✕</button></div>' : '') +
      '<div class="sheet-body">' + opts.body + '</div>' +
      (opts.footer ? '<div class="sheet-foot">' + opts.footer + '</div>' : '') +
      '</div>';
    root.classList.add('open');
    document.body.classList.add('locked');
    if (opts.onMount) opts.onMount(root);
    return root;
  }
  // 软键盘弹出会遮住弹层：按可视视口高度把弹层顶起来，并让当前输入项居中可见
  function syncKeyboard() {
    var root = document.getElementById('modalRoot');
    if (!root || !root.querySelector) return;
    var sheet = root.querySelector('.sheet');
    if (!sheet) return;
    var vv = window.visualViewport;
    var kb = vv ? Math.max(0, window.innerHeight - vv.height - vv.offsetTop) : 0;
    if (kb > 90) {
      var lift = Math.min(kb, Math.round(window.innerHeight * 0.55));
      sheet.style.bottom = lift + 'px';
      sheet.style.maxHeight = 'calc(100vh - ' + (lift + 10) + 'px)';
    } else {
      sheet.style.bottom = '';
      sheet.style.maxHeight = '';
    }
  }
  function keepFieldVisible(el) {
    if (!el || !el.scrollIntoView) return;
    var body = el.closest ? el.closest('.sheet-body') : null;
    if (!body) return;
    setTimeout(function () {
      syncKeyboard();
      el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }, 260);
  }
  function closeSheet() {
    var root = document.getElementById('modalRoot');
    root.classList.remove('open');
    root.innerHTML = '';
    document.body.classList.remove('locked');
  }

  /* ---------------- 表单小部件：日期 / 省市 ---------------- */
  function dayCount(y, m) {
    if (!y || !m) return 31;
    return new Date(Number(y), Number(m), 0).getDate();
  }
  function dayOptions(y, m, sel) {
    var n = dayCount(y, m), out = '<option value="">日</option>';
    for (var i = 1; i <= n; i++) {
      out += '<option value="' + i + '"' + (String(i) === String(Number(sel)) ? ' selected' : '') + '>' + i + ' 日</option>';
    }
    return out;
  }
  // 年 / 月 / 日三个下拉，替代原生日期框（原生弹层无法跟主题统一）
  function dateRowHTML(name, iso, opts) {
    var seg = String(iso || '').split('-');
    var y = seg[0] || '', m = seg[1] || '', d = seg[2] || '';
    var nowY = new Date().getFullYear();
    var maxY = (opts && opts.max) || nowY;
    var minY = (opts && opts.min) || (maxY - 100);
    var yOpts = '<option value="">年</option>';
    for (var i = maxY; i >= minY; i--) {
      yOpts += '<option value="' + i + '"' + (String(i) === String(Number(y)) ? ' selected' : '') + '>' + i + ' 年</option>';
    }
    var mOpts = '<option value="">月</option>';
    for (var j = 1; j <= 12; j++) {
      mOpts += '<option value="' + j + '"' + (String(j) === String(Number(m)) ? ' selected' : '') + '>' + j + ' 月</option>';
    }
    return '<div class="date-row" data-date="' + name + '">' +
      '<select class="select d-y" data-act="date-part" aria-label="年">' + yOpts + '</select>' +
      '<select class="select d-m" data-act="date-part" aria-label="月">' + mOpts + '</select>' +
      '<select class="select d-d" data-act="date-part" aria-label="日">' + dayOptions(y, m, d) + '</select>' +
      '</div>';
  }
  function dateVal(root, name) {
    var box = root.querySelector('[data-date="' + name + '"]');
    if (!box) return '';
    var y = box.querySelector('.d-y').value, m = box.querySelector('.d-m').value, d = box.querySelector('.d-d').value;
    if (!y || !m || !d) return '';
    return y + '-' + ('0' + m).slice(-2) + '-' + ('0' + d).slice(-2);
  }
  function syncDateRow(el) {
    var box = el.parentNode;
    if (!box || !box.classList || !box.classList.contains('date-row')) return;
    var d = box.querySelector('.d-d');
    d.innerHTML = dayOptions(box.querySelector('.d-y').value, box.querySelector('.d-m').value, d.value);
  }

  var REGION = window.REGION || {};
  function splitRegion(v) {
    var s = String(v || '');
    var i = s.indexOf(' · ');
    return i > -1 ? [s.slice(0, i), s.slice(i + 3)] : (s ? [s, ''] : ['', '']);
  }
  // 省 + 市 两个下拉，值存成「湖南 · 邵阳」
  function regionHTML(name, value) {
    var pair = splitRegion(value), prov = pair[0], city = pair[1];
    var provs = Object.keys(REGION);
    if (prov && provs.indexOf(prov) < 0) provs = [prov].concat(provs);
    var cities = (REGION[prov] || []).slice();
    if (city && cities.indexOf(city) < 0) cities = cities.concat([city]);
    var pHtml = '<option value="">省份</option>' + provs.map(function (k) {
      return '<option value="' + U.esc(k) + '"' + (k === prov ? ' selected' : '') + '>' + U.esc(k) + '</option>';
    }).join('');
    var cHtml = '<option value="">城市</option>' + cities.map(function (k) {
      return '<option value="' + U.esc(k) + '"' + (k === city ? ' selected' : '') + '>' + U.esc(k) + '</option>';
    }).join('');
    return '<div class="region-row" data-region="' + name + '">' +
      '<select class="select r-p" data-act="region-prov" aria-label="省份">' + pHtml + '</select>' +
      '<select class="select r-c" data-act="region-city" aria-label="城市">' + cHtml + '</select>' +
      '</div>';
  }
  function regionVal(root, name) {
    var box = root.querySelector('[data-region="' + name + '"]');
    if (!box) return '';
    var prov = box.querySelector('.r-p').value, city = box.querySelector('.r-c').value;
    if (!prov) return '';
    return city ? prov + ' · ' + city : prov;
  }
  function syncRegion(el) {
    var box = el.parentNode;
    if (!box || !box.classList || !box.classList.contains('region-row')) return;
    var prov = box.querySelector('.r-p').value;
    var cSel = box.querySelector('.r-c');
    var cities = (window.REGION && window.REGION[prov]) || [];
    cSel.innerHTML = '<option value="">城市</option>' + cities.map(function (k) {
      return '<option value="' + U.esc(k) + '">' + U.esc(k) + '</option>';
    }).join('');
    cSel.disabled = !cities.length;
  }

  /* ---------------- 导航 ---------------- */
  var TABS = [
    { id: 'me', name: '我的', icon: '<svg viewBox="0 0 24 24"><circle cx="12" cy="8.5" r="3.4" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M5.5 19.5c1.2-3.4 3.7-5 6.5-5s5.3 1.6 6.5 5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>' },
    { id: 'rel', name: '关系', icon: '<svg viewBox="0 0 24 24"><circle cx="12" cy="5" r="2.6"/><circle cx="5" cy="18" r="2.6"/><circle cx="19" cy="18" r="2.6"/><path d="M12 7.6v3.2M10.2 12.6 6.6 16M13.8 12.6 17.4 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>' },
    { id: 'ledger', name: '礼金', icon: '<svg viewBox="0 0 24 24"><path d="M5 4.5h11.5A2.5 2.5 0 0 1 19 7v12.5H7A2 2 0 0 1 5 17.5z" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M8.5 9h7M8.5 12.5h4.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>' },
    { id: 'cal', name: '日历', icon: '<svg viewBox="0 0 24 24"><rect x="4" y="5.5" width="16" height="14" rx="2.5" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M4 10h16M8.5 4v3.2M15.5 4v3.2" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>' },
    { id: 'story', name: '往事', icon: '<svg viewBox="0 0 24 24"><path d="M12 6.5c-1.8-1.4-4-1.8-6.5-1.2v12c2.5-.6 4.7-.2 6.5 1.2 1.8-1.4 4-1.8 6.5-1.2v-12c-2.5-.6-4.7-.2-6.5 1.2z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M12 6.5v12" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>' },
    { id: 'set', name: '设置', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>' }
  ];

  /* 五套预设主题 */
  var THEMES = [
    { id: 'warm', name: '暖白', desc: '米白暖红 · 默认',
      paper: '#F6F7FA', card: '#FFFFFF', ink: '#1F2633', red: '#E34C46', gold: '#DFA63C' },
    { id: 'night', name: '墨夜', desc: '深色护眼 · 沉静',
      paper: '#161B23', card: '#232A35', ink: '#E8EDF4', red: '#F0736B', gold: '#E0AE55' },
    { id: 'bamboo', name: '青竹', desc: '清新竹绿 · 自然',
      paper: '#F3F7F2', card: '#FFFFFF', ink: '#20362B', red: '#3F9E72', gold: '#C99B3E' },
    { id: 'ocean', name: '藏蓝', desc: '海蓝清爽 · 理性',
      paper: '#F2F6FB', card: '#FFFFFF', ink: '#1D3149', red: '#E0645E', gold: '#D2A344' },
    { id: 'plum', name: '雅紫', desc: '淡紫雅致 · 温柔',
      paper: '#F8F5FB', card: '#FFFFFF', ink: '#332A45', red: '#C4588B', gold: '#C79A4C' }
  ];

  function buildNav() {
    // 侧边栏保留全部入口（桌面端）
    var side = TABS.map(function (t) {
      return '<button class="nav-item" data-act="tab" data-tab="' + t.id + '">' + t.icon + '<span>' + t.name + '</span></button>';
    }).join('');
    document.getElementById('sideNav').innerHTML = side;
    // 底部导航：移除「我的」「设置」，改由右上角图标承载
    var bottomTabs = TABS.filter(function (t) { return t.id !== 'me' && t.id !== 'set'; });
    document.getElementById('tabbar').innerHTML = bottomTabs.map(function (t) {
      return '<button class="tab-item" data-act="tab" data-tab="' + t.id + '">' + t.icon + '<span>' + t.name + '</span></button>';
    }).join('');
    // 右上角图标：我的 / 设置
    var topTabs = TABS.filter(function (t) { return t.id === 'me' || t.id === 'set'; });
    var top = document.getElementById('topTools');
    if (top) top.innerHTML = topTabs.map(function (t) {
      return '<button class="top-tool" data-act="tab" data-tab="' + t.id + '" title="' + t.name + '" aria-label="' + t.name + '">' + t.icon + '</button>';
    }).join('');
  }
  function syncNav() {
    document.querySelectorAll('[data-act="tab"]').forEach(function (b) {
      b.classList.toggle('on', b.getAttribute('data-tab') === ui.tab);
    });
    document.querySelectorAll('.view').forEach(function (v) {
      v.classList.toggle('on', v.id === 'view-' + ui.tab);
    });
  }

  function render() {
    syncNav();
    if (ui.tab === 'rel') renderRel();
    else if (ui.tab === 'ledger') renderLedger();
    else if (ui.tab === 'cal') renderCal();
    else if (ui.tab === 'story') renderStory();
    else if (ui.tab === 'set') renderSet();
    else renderMe();
  }

  /* ---------------- 关系页 ---------------- */
  function renderRel() {
    var v = document.getElementById('view-rel');
    var c = ringCounts();
    var t = allTotals();
    var head = pageHead('关系网络',
      '共 ' + c.total + ' 人 · 至亲 ' + c[1] + ' · 亲友 ' + c[2] + ' · 朋友 ' + c[3],
      '<button class="btn" data-act="add-person">添加成员</button>');

    var bar = '<div class="rel-bar">' +
      '<div class="seg">' +
      '<button data-act="rel-mode" data-mode="graph" class="' + (ui.relMode === 'graph' ? 'on' : '') + '">图谱</button>' +
      '<button data-act="rel-mode" data-mode="list" class="' + (ui.relMode === 'list' ? 'on' : '') + '">名单</button>' +
      '</div>' +
      (ui.relMode === 'graph' ? '<div class="zoom-ctl">' +
        '<button data-act="zoom" data-dir="-1" aria-label="缩小">−</button>' +
        '<span id="zoomLabel">' + Graph.levels[ui.level].label + ' · ' + Graph.levels[ui.level].zoom + '</span>' +
        '<button data-act="zoom" data-dir="1" aria-label="放大">+</button>' +
        '<button data-act="fit" class="fit" aria-label="适应屏幕">⤢</button>' +
        '</div>' : '<div class="rel-hint-mini">点名字看档案与往来</div>') +
      '</div>' +
      (ui.relMode === 'graph' ? '<div class="ring-filter">' +
        '<span>显示</span>' +
        [[0, '全部'], [1, '只看至亲'], [2, '只看亲友'], [3, '只看朋友']].map(function (x) {
          return '<button data-act="ring-filter" data-ring="' + x[0] + '" class="' +
            (Graph.ringFilter() === x[0] ? 'on' : '') + '">' + x[1] + '</button>';
        }).join('') +
        '</div>' : '');

    var body;
    if (ui.relMode === 'graph') {
      body = '<div class="graph-wrap">' +
        '<div class="graph-canvas" id="graphCanvas"></div>' +
        '<div class="graph-legend">' +
        '<span><i class="ln solid"></i>直接关系 · 你直接认识</span>' +
        '<span><i class="ln dashed"></i>间接关系 · 通过家人朋友认识</span>' +
        '<span><i class="ln heart"></i>夫妻</span>' +
        '</div>' +
        '<div class="graph-tip">拖动平移 · 滚轮/双指缩放 · 双击复位</div>' +
        '<div class="graph-focus" id="graphFocus" hidden></div>' +
        (state.people.length ? '' : '<div class="graph-empty">还没有亲友<br><b data-act="add-person">先添加第一位</b></div>') +
        '</div>' +
        '<div class="rel-strip">' +
        '<div><b>' + c.total + '</b><span>亲友</span></div>' +
        '<div><b>' + t.count + '</b><span>往来笔数</span></div>' +
        '<div><b class="c-in">' + U.money(t.in) + '</b><span>累计收礼</span></div>' +
        '<div><b class="c-out">' + U.money(t.out) + '</b><span>累计送礼</span></div>' +
        '</div>';
    } else {
      body = listView();
    }

    v.innerHTML = '<div class="page">' + head + bar + body + '</div>';

    if (ui.relMode === 'graph') {
      var host = document.getElementById('graphCanvas');
      Graph.init(host);
      Graph.setState(state);
      Graph.setLevel(ui.level);
      updateFocusChip();
    }
  }

  function updateRingUI() {
    var bar = document.querySelector('.ring-filter');
    if (!bar) return;
    Array.prototype.forEach.call(bar.querySelectorAll('[data-act="ring-filter"]'), function (b) {
      b.classList.toggle('on', Number(b.getAttribute('data-ring')) === Graph.ringFilter());
    });
    updateFocusChip();
  }

  function updateFocusChip() {
    var el = document.getElementById('graphFocus');
    if (!el) return;
    // 圈层筛选与旧的「聚焦至亲」是同一类功能，二选一展示
    if (Graph.level() !== 2 || Graph.ringFilter() > 0) { el.hidden = true; el.innerHTML = ''; return; }
    el.hidden = false;
    el.innerHTML = Graph.isFocusOnly()
      ? '已聚焦至亲与亲友 · <b data-act="focus-outer">展开朋友</b>'
      : '详细模式 · <b data-act="focus-outer">只看至亲</b>';
  }

  function listView() {
    return '<div class="list-tools"><input id="relSearch" class="input" placeholder="搜名字、关系或标签" value="' + U.esc(ui.q) + '"></div>' +
      '<div id="listBody">' + listBody() + '</div>';
  }

  function listBody() {
    var groups = { 1: [], 2: [], 3: [] };
    state.people.forEach(function (p) { (groups[p.ring || 3] = groups[p.ring || 3] || []).push(p); });
    var q = ui.q.trim();
    var html = '';
    var found = 0;
    [1, 2, 3].forEach(function (r) {
      var arr = groups[r].filter(function (p) {
        if (!q) return true;
        return (p.name + p.relation + (p.tags || []).join('') + (p.job || '')).indexOf(q) >= 0;
      });
      if (!arr.length) return;
      found += arr.length;
      html += '<div class="sec-title"><span>' + window.RINGS[r].name + '</span><em>' + window.RINGS[r].desc + ' · ' + arr.length + ' 人</em></div>';
      html += '<div class="people-grid">' + arr.map(function (p) {
        var t = totalsFor(p.id);
        return '<button class="pcard" data-act="open-person" data-pid="' + p.id + '">' +
          '<span class="ava lg">' + (p.emoji || '🙂') + '</span>' +
          '<span class="pc-main"><b>' + U.esc(p.name) + '</b>' +
          '<em>' + U.esc(p.relation) + (p.birthday ? ' · ' + U.md(p.birthday) : '') + '</em></span>' +
          '<span class="pc-amt"><b class="c-in">' + U.money(t.in) + '</b><em class="c-out">' + U.money(t.out) + '</em></span>' +
          '</button>';
      }).join('') + '</div>';
    });
    if (!found) html += '<div class="empty"><span class="em-ico">🔍</span>没找到「' + U.esc(q) + '」</div>';
    return html;
  }

  /* ---------------- 礼金页 ---------------- */
  function filteredGifts() {
    var f = ui.ledger, now = new Date();
    return state.gifts.filter(function (g) {
      if (f.dir !== 'all' && g.dir !== f.dir) return false;
      if (f.pid !== 'all' && g.pid !== f.pid) return false;
      var d = U.parse(g.date); if (!d) return false;
      if (f.range === 'year' && d.getFullYear() !== now.getFullYear()) return false;
      if (f.range === 'y3' && d.getFullYear() < now.getFullYear() - 2) return false;
      return true;
    }).sort(function (a, b) { return a.date < b.date ? 1 : a.date > b.date ? -1 : 0; });
  }

  function renderLedger() {
    var v = document.getElementById('view-ledger');
    var list = filteredGifts();
    var tin = 0, tout = 0;
    list.forEach(function (g) { if (g.dir === 'in') tin += g.amount; else tout += g.amount; });

    var head = pageHead('礼金台账',
      RANGE_LABEL[ui.ledger.range] + ' ' + list.length + ' 笔 · 净往来 ' + (tin - tout >= 0 ? '+' : '−') + U.money(Math.abs(tin - tout)),
      '<button class="btn" data-act="add-gift">记一笔</button>');

    var stats = '<div class="stat-row">' +
      '<div class="stat in"><span>累计收</span><b>' + U.money(tin) + '</b><em>' + list.filter(function (g) { return g.dir === 'in'; }).length + ' 笔</em></div>' +
      '<div class="stat out"><span>累计送</span><b>' + U.money(tout) + '</b><em>' + list.filter(function (g) { return g.dir === 'out'; }).length + ' 笔</em></div>' +
      '<div class="stat net"><span>净往来</span><b class="' + (tin - tout >= 0 ? 'c-in' : 'c-out') + '">' + (tin - tout >= 0 ? '+' : '−') + U.money(Math.abs(tin - tout)) + '</b><em>' + (tin - tout >= 0 ? '收多于送' : '送多于收') + '</em></div>' +
      '</div>';

    var filters = '<div class="filter-bar">' +
      '<div class="seg small">' +
      ['all', 'in', 'out'].map(function (d) {
        return '<button data-act="lf-dir" data-dir="' + d + '" class="' + (ui.ledger.dir === d ? 'on' : '') + '">' +
          (d === 'all' ? '全部' : d === 'in' ? '收礼' : '送礼') + '</button>';
      }).join('') + '</div>' +
      '<select class="select" data-act="lf-range">' +
      ['year', 'y3', 'all'].map(function (r) { return '<option value="' + r + '"' + (ui.ledger.range === r ? ' selected' : '') + '>' + RANGE_LABEL[r] + '</option>'; }).join('') +
      '</select>' +
      '<select class="select" data-act="lf-pid">' +
      '<option value="all">全部人员</option>' +
      state.people.map(function (p) { return '<option value="' + p.id + '"' + (ui.ledger.pid === p.id ? ' selected' : '') + '>' + U.esc(p.name) + '</option>'; }).join('') +
      '</select></div>';

    var rows = '', cur = '';
    list.forEach(function (g) {
      var ym = g.date.slice(0, 7);
      if (ym !== cur) {
        if (cur) rows += '</div>';
        var mlist = list.filter(function (x) { return x.date.slice(0, 7) === ym; });
        var msum = mlist.reduce(function (s, x) { return s + (x.dir === 'in' ? x.amount : -x.amount); }, 0);
        rows += '<div class="month-block"><div class="month-head"><b>' + ym.slice(0, 4) + '年' + Number(ym.slice(5)) + '月</b>' +
          '<span>' + mlist.length + ' 笔 · <i class="' + (msum >= 0 ? 'c-in' : 'c-out') + '">' + (msum >= 0 ? '+' : '−') + U.money(Math.abs(msum)) + '</i></span></div>';
        cur = ym;
      }
      rows += '<button class="grow" data-act="edit-gift" data-gid="' + g.id + '">' +
        '<span class="gdate"><b>' + g.date.slice(8) + '</b><em>' + U.weekday(g.date).replace('周', '') + '</em></span>' +
        '<span class="gmain"><b>' + U.esc(pname(g.pid)) + '</b><em>' + U.esc(g.occ) + (g.note ? ' · ' + U.esc(g.note) : '') + '</em></span>' +
        '<span class="gamt ' + (g.dir === 'in' ? 'c-in' : 'c-out') + '">' + (g.dir === 'in' ? '+' : '−') + U.money(g.amount) + '</span>' +
        '</button>';
    });
    if (cur) rows += '</div>';
    if (!list.length) rows = '<div class="empty"><span class="em-ico">🧾</span>这段时间还没有记录<br><button class="btn small" data-act="add-gift">记第一笔</button></div>';

    v.innerHTML = '<div class="page">' + head + stats + filters + rows + '</div>';
  }

  /* ---------------- 日历页 ---------------- */
  function ymLabel(ym) { return ym.slice(0, 4) + '年' + Number(ym.slice(5)) + '月'; }

  function monthEvents(y, m) {
    var map = {};
    function add(date, item) { (map[date] = map[date] || []).push(item); }
    var me = state.me;
    var all = [me].concat(state.people);
    all.forEach(function (p) {
      if (p.birthday && !p.deathday) {
        var d = y + '-' + p.birthday.slice(5);
        if (U.parse(d)) add(d, {
          type: 'birthday', title: p.name + '生日', pid: p.id, auto: true,
          meta: (p.id === 'me' ? '我' : p.relation) + ' · ' + (y - Number(p.birthday.slice(0, 4))) + ' 岁'
        });
      }
      if (p.deathday) {
        var d2 = y + '-' + p.deathday.slice(5);
        if (U.parse(d2)) add(d2, {
          type: 'memorial', title: p.name + '忌日', pid: p.id, auto: true,
          meta: (p.relation || '') + ' · ' + (y - Number(p.deathday.slice(0, 4))) + ' 周年'
        });
      }
    });
    state.events.forEach(function (e) {
      var ok = e.repeat === 'yearly' ? (e.date.slice(5, 7) === U.pad(m)) : (e.date.slice(0, 7) === y + '-' + U.pad(m));
      if (!ok) return;
      var d = y + '-' + e.date.slice(5);
      if (!U.parse(d)) return;
      add(d, { type: e.type === 'custom' ? 'custom' : e.type, title: e.title, pid: e.personId || '', auto: false, id: e.id, note: e.note, meta: e.personId ? pname(e.personId) : (e.repeat === 'yearly' ? '每年' : '单次') });
    });
    Object.keys(map).forEach(function (k) {
      map[k].sort(function (a, b) {
        var order = { memorial: 0, birthday: 1, banquet: 2, custom: 3 };
        return (order[a.type] || 9) - (order[b.type] || 9);
      });
    });
    return map;
  }

  function upcoming(days) {
    var out = [], now = new Date();
    var base = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    for (var i = 0; i < days; i++) {
      var d = new Date(base.getTime() + i * 86400000);
      var iso = U.iso(d);
      var map = monthEvents(d.getFullYear(), d.getMonth() + 1)[iso];
      if (!map) continue;
      map.forEach(function (it) { out.push(Object.assign({ date: iso, offset: i }, it)); });
    }
    return out;
  }

  function renderCal() {
    var v = document.getElementById('view-cal');
    var y = Number(ui.cal.ym.slice(0, 4)), m = Number(ui.cal.ym.slice(5));
    var map = monthEvents(y, m);
    var up = upcoming(60).filter(function (it) { return ui.cal.filter === 'all' || it.type === ui.cal.filter; });
    var autoCount = state.people.filter(function (p) { return p.birthday || p.deathday; }).length + 1;

    var head = pageHead('人情日历',
      '自动同步 ' + autoCount + ' 位亲友的生日与忌日 · 也可自己加事项',
      '<button class="btn" data-act="add-event">加事项</button>');

    var chips = '<div class="filter-bar"><div class="seg small">' +
      [['all', '全部'], ['birthday', '生日'], ['memorial', '忌日'], ['banquet', '宴请'], ['custom', '事项']].map(function (x) {
        return '<button data-act="cal-filter" data-ft="' + x[0] + '" class="' + (ui.cal.filter === x[0] ? 'on' : '') + '">' + x[1] + '</button>';
      }).join('') + '</div></div>';

    var first = new Date(y, m - 1, 1);
    var startIdx = (first.getDay() + 6) % 7;
    var daysInMonth = new Date(y, m, 0).getDate();
    var prevDays = new Date(y, m - 1, 0).getDate();
    var cells = [];
    for (var i = startIdx - 1; i >= 0; i--) {
      var pd = new Date(y, m - 1, prevDays - i);
      cells.push({ d: pd, out: true });
    }
    for (var d = 1; d <= daysInMonth; d++) cells.push({ d: new Date(y, m - 1, d), out: false });
    while (cells.length % 7 !== 0 || cells.length < 42) {
      var nd = new Date(y, m - 1, daysInMonth + (cells.length - startIdx - daysInMonth) + 1);
      cells.push({ d: nd, out: true });
      if (cells.length >= 42) break;
    }

    var today = U.todayISO();
    var grid = cells.map(function (c) {
      var iso = U.iso(c.d);
      var its = (map[iso] || []).filter(function (it) { return ui.cal.filter === 'all' || it.type === ui.cal.filter; });
      var types = [];
      its.forEach(function (it) { if (types.indexOf(it.type) < 0) types.push(it.type); });
      var cls = ['cell'];
      if (c.out) cls.push('out');
      if (iso === today) cls.push('today');
      if (iso === ui.cal.sel) cls.push('sel');
      if (its.length) cls.push('has');
      return '<button class="' + cls.join(' ') + '" data-act="cal-select" data-date="' + iso + '">' +
        '<b>' + c.d.getDate() + '</b><span class="dots">' +
        types.slice(0, 3).map(function (t) { return '<i class="dot ' + t + '"></i>'; }).join('') +
        '</span>' + (its.length > 3 ? '<em class="more">+' + (its.length - 3) + '</em>' : '') + '</button>';
    }).join('');

    var cal = '<div class="cal-card">' +
      '<div class="cal-head"><button class="icon-btn" data-act="cal-move" data-delta="-1">‹</button>' +
      '<div><b>' + ymLabel(ui.cal.ym) + '</b><em>' + (Object.keys(map).length ? Object.keys(map).length + ' 天有事' : '本月无事项') + '</em></div>' +
      '<button class="icon-btn" data-act="cal-move" data-delta="1">›</button>' +
      '<button class="btn tiny ghost" data-act="cal-today">今天</button></div>' +
      '<div class="cal-week">' + ['一', '二', '三', '四', '五', '六', '日'].map(function (w) { return '<span>' + w + '</span>'; }).join('') + '</div>' +
      '<div class="cal-grid">' + grid + '</div>' +
      '<div class="cal-legend">' +
      '<span><i class="dot birthday"></i>生日</span><span><i class="dot memorial"></i>忌日</span>' +
      '<span><i class="dot banquet"></i>宴请</span><span><i class="dot custom"></i>事项</span></div>' +
      '</div>';

    var selItems = (map[ui.cal.sel] || []).filter(function (it) { return ui.cal.filter === 'all' || it.type === ui.cal.filter; });
    var dayPanel = '<div class="day-panel">' +
      '<div class="dp-head"><b>' + U.cnDate(ui.cal.sel) + '</b><em>' + U.weekday(ui.cal.sel) + ' · ' + (selItems.length ? selItems.length + ' 件事' : '没有安排') + '</em>' +
      '<button class="btn tiny ghost" data-act="add-event" data-date="' + ui.cal.sel + '">＋</button></div>' +
      (selItems.length ? selItems.map(function (it) { return eventRow(it, ui.cal.sel); }).join('') :
        '<div class="dp-empty">这天还空着，可以加一件要记的事</div>') +
      '</div>';

    var upHtml = up.slice(0, 10).map(function (it) {
      return eventRow(it, it.date, true);
    }).join('') || '<div class="empty"><span class="em-ico">🗓️</span>未来 60 天没有事项</div>';

    v.innerHTML = '<div class="page">' + head + chips +
      '<div class="cal-layout">' + cal + dayPanel + '</div>' +
      '<div class="sec-title"><span>接下来</span><em>未来 60 天</em></div>' +
      '<div class="upcoming">' + upHtml + '</div></div>';
  }

  function eventRow(it, date, showDate) {
    var meta = ETYPE[it.type] || ETYPE.custom;
    var left = '';
    if (showDate) {
      var off = U.daysToMD(date.slice(5), new Date());
      var txt = date === U.todayISO() ? '今天' : off === 1 ? '明天' : off + '天后';
      left = '<span class="ev-day"><b>' + U.md(date) + '</b><em>' + txt + '</em></span>';
    }
    return '<button class="ev-row" data-act="' + (it.auto ? 'open-person' : 'edit-event') + '" data-pid="' + (it.pid || '') + '" data-eid="' + (it.id || '') + '">' +
      '<span class="ev-ic ' + meta.cls + '">' + meta.icon + '</span>' +
      left +
      '<span class="ev-main"><b>' + U.esc(it.title) + '</b><em>' + U.esc(it.meta || meta.label) + (it.note ? ' · ' + U.esc(it.note) : '') + '</em></span>' +
      '<span class="ev-tag ' + meta.cls + '">' + meta.label + '</span>' +
      '</button>';
  }

  /* ---------------- 我的 ---------------- */
  // 数据保存路径：查看当前位置、切换共享目录（自动迁移已有数据）
  function openPathSheet() {
    var body = '<div class="path-box"><div class="path-loading">正在读取路径…</div></div>' +
      '<p class="path-tip">切换目录后，已有的账本和头像会自动搬过去；路径只在 NAS 上保存，卸载应用不会删除数据。</p>';
    var root = openSheet({ title: '数据保存路径', sub: '账本与照片实际存放的位置', body: body });
    if (!apiOK) {
      root.querySelector('.path-box').innerHTML = '<div class="path-bad">当前是本地打开模式，没有 NAS 路径。<br>请在 NAS 上通过应用图标打开后再设置。</div>';
      return;
    }
    apiFetch('/api/path').then(function (r) { return r.json(); }).then(function (info) {
      var box = root.querySelector('.path-box');
      if (!info || !info.dataDir) { box.innerHTML = '<div class="path-bad">读取失败</div>'; return; }
      var opts = (info.available || []).filter(function (d) { return d !== info.dataDir; });
      box.innerHTML =
        '<div class="path-cur"><span>当前路径</span><code>' + U.esc(info.dataDir) + '</code>' +
        '<em class="' + (info.writable ? 'ok' : 'bad') + '">' + (info.writable ? '可写' : '不可写') + '</em></div>' +
        '<div class="path-fld"><label class="field"><span>切换到其他路径（绝对路径）</span>' +
        '<input class="input" id="pathInput" placeholder="' + U.esc(info.dataDir) + '" value="' + U.esc(info.dataDir) + '"></label>' +
        (opts.length ? '<div class="path-quick"><span>快速选择</span>' + opts.map(function (d) {
          return '<button class="chip" data-path="' + U.esc(d) + '">' + U.esc(d) + '</button>';
        }).join('') + '</div>' : '') +
        '<div class="path-actions">' +
        '<button class="btn ghost" id="pathReset">恢复默认</button>' +
        '<button class="btn" id="pathSave">保存并迁移</button></div></div>';
      box.querySelectorAll('.chip').forEach(function (c) {
        c.addEventListener('click', function () { box.querySelector('#pathInput').value = c.getAttribute('data-path'); });
      });
      box.querySelector('#pathReset').addEventListener('click', function () {
        box.querySelector('#pathInput').value = info.default || '';
      });
      box.querySelector('#pathSave').addEventListener('click', function () {
        var dir = box.querySelector('#pathInput').value.trim();
        var btn = this; btn.disabled = true; btn.textContent = '迁移中…';
        apiFetch('/api/path', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ dataDir: dir })
        }).then(function (r) { return r.json(); }).then(function (res) {
          btn.disabled = false; btn.textContent = '保存并迁移';
          if (!res.ok) { toast(res.msg || '保存失败'); return; }
          toast('已切换，数据已迁移'); closeSheet(); render();
        }).catch(function () { btn.disabled = false; btn.textContent = '保存并迁移'; toast('保存失败'); });
      });
    }).catch(function () {
      root.querySelector('.path-box').innerHTML = '<div class="path-bad">读取失败，请确认通过应用中心打开</div>';
    });
  }

  function refreshPathHint() {
    var el = document.getElementById('pathHint');
    if (!el || !apiOK) return;
    apiFetch('/api/path').then(function (r) { return r.json(); }).then(function (info) {
      if (info && info.dataDir) el.textContent = info.dataDir;
    }).catch(function () { });
  }

  /* ---------------- 设置页 ---------------- */
  function themeCard(t, cur) {
    return '<button class="theme-card' + (cur === t.id ? ' on' : '') + '" data-act="set-theme" data-theme="' + t.id + '">' +
      '<div class="theme-preview" style="background:' + t.paper + '">' +
      '<div class="tp-head"><span class="tp-mark" style="background:linear-gradient(145deg,' + t.red + ',' + t.gold + ')"></span>' +
      '<span class="tp-line" style="background:' + t.ink + ';opacity:.7"></span></div>' +
      '<span class="tp-line short" style="background:' + t.ink + ';opacity:.35"></span>' +
      '<div class="tp-cards"><i class="tp-card" style="background:' + t.card + ';border:1px solid ' + t.ink + '22"></i>' +
      '<i class="tp-card" style="background:' + t.card + ';border:1px solid ' + t.ink + '22"></i>' +
      '<i class="tp-card" style="background:' + t.red + ';opacity:.85"></i></div></div>' +
      '<div class="theme-name">' + t.name + '<span class="tick">' + (cur === t.id ? '✓' : '') + '</span></div>' +
      '<div class="theme-desc">' + t.desc + '</div></button>';
  }

  function renderSet() {
    var v = document.getElementById('view-set');
    var cur = (window.Auth && Auth.savedTheme) ? Auth.savedTheme() : 'warm';
    var u = (window.Auth && Auth.user) ? Auth.user() : null;
    var admin = !!(window.Auth && Auth.isAdmin && Auth.isAdmin());
    var head = pageHead('设置', '账户、外观与数据都在这里', '');

    // 账户面板
    var userHtml = '<div class="set-panel"><h3><span class="pi">👤</span>账户</h3>' +
      '<p class="hint">' + (admin ? '你是管理员，可以新增和管理账户。' : '你使用共享账本，可修改自己的密码与主题。') + '</p>' +
      '<div class="acct-card"><span class="ava">' + U.esc((u && (u.name || u.username) || '我').slice(0, 1)) + '</span>' +
      '<div class="acct-info"><b>' + U.esc((u && u.name) || '我') +
      '<i class="role-badge' + (admin ? '' : ' member') + '">' + (admin ? '管理员' : '成员') + '</i></b>' +
      '<em>' + (u ? '@' + U.esc(u.username) : '本地用户') + '</em></div></div>' +
      '<div class="acct-actions">' +
      '<button class="btn ghost" data-act="change-pwd">修改密码</button>' +
      '<button class="btn ghost danger" data-act="logout">退出登录</button></div>';
    if (admin) {
      userHtml += '<div class="user-manage" id="userManage">' +
        '<div class="user-manage-head"><b>账户管理</b><button class="btn tiny" data-act="add-user">＋ 新增账户</button></div>' +
        '<div id="userList"><div class="dp-empty">加载中…</div></div>' +
        '<div class="switch-row"><span>允许自行注册</span><div class="switch" id="regSwitch" data-act="toggle-register"></div></div>' +
        '</div>';
    }
    userHtml += '</div>';

    // 主题面板
    var themeHtml = '<div class="set-panel"><h3><span class="pi">🎨</span>主题外观</h3>' +
      '<p class="hint">选择喜欢的风格，设置会自动保存并在你的设备上生效。</p>' +
      '<div class="theme-grid">' + THEMES.map(function (t) { return themeCard(t, cur); }).join('') + '</div></div>';

    // 数据面板
    var dataHtml = '<div class="set-panel"><h3><span class="pi">💾</span>数据</h3>' +
      '<p class="hint">账本保存在 NAS，多设备实时同步。换设备或卸载前请先导出备份。</p>' +
      '<div class="set-list">' +
      '<button class="set-row" data-act="share-center"><b>分享中心</b><em>导出账本、分享关系与往来给家人朋友</em><span>›</span></button>' +
      '<button class="set-row" data-act="data-path"><b>数据保存路径</b><em id="pathHint">点击查看详情与切换</em><span>›</span></button>' +
      '<button class="set-row" data-act="export"><b>导出备份</b><em>生成 JSON 文件</em><span>›</span></button>' +
      '<button class="set-row" data-act="import"><b>导入备份</b><em>从 JSON 恢复</em><span>›</span></button>' +
      '<button class="set-row" data-act="demo"><b>载入示例数据</b><em>看看完整演示</em><span>›</span></button>' +
      '<button class="set-row danger" data-act="reset"><b>清空并重新开始</b><em>先填自己的信息，再删除全部数据</em><span>›</span></button>' +
      '</div></div>';

    var aboutHtml = '<div class="set-panel"><h3><span class="pi">ℹ️</span>关于</h3>' +
      '<p class="hint">人情往来 · 记礼金、看关系、过好每一个该到的日子。<br>' +
      '当前模式：' + ((window.Auth && Auth.isServer && Auth.isServer()) ? 'NAS 多设备同步' : '本地演示') + '<br>' +
      '版本 v1.2.15</p></div>';

    v.innerHTML = '<div class="page">' + head +
      '<div class="set-grid">' + themeHtml + userHtml + dataHtml + aboutHtml + '</div></div>';

    refreshPathHint();
    if (admin) loadUserList();
  }

  function loadUserList() {
    var box = document.getElementById('userList');
    if (!box || !window.Auth) return;
    Auth.listUsers(function (res) {
      if (!box.isConnected) return;
      if (!res || !res.ok) { box.innerHTML = '<div class="dp-empty">加载失败</div>'; return; }
      var sw = document.getElementById('regSwitch');
      if (sw) sw.classList.toggle('on', !!res.allowRegister);
      var me = Auth.user();
      box.innerHTML = (res.users || []).map(function (x) {
        var isAdmin = x.role === 'admin';
        return '<div class="user-line"><div class="ul-name"><b>' + U.esc(x.name || x.username) + '</b>' +
          '<em>@' + U.esc(x.username) + ' · ' + (isAdmin ? '管理员' : '成员') + '</em></div>' +
          (x.id === (me && me.id) ? '<span class="role-badge' + (isAdmin ? '' : ' member') + '">我</span>' :
            '<button class="ul-btn gray" data-act="reset-user" data-uid="' + x.id + '">重置密码</button>' +
            '<button class="ul-btn" data-act="del-user" data-uid="' + x.id + '">删除</button>') +
          '</div>';
      }).join('');
    });
  }

  function openAddUser() {
    var body = '<div class="form">' +
      '<label class="field"><span>账号（3-20 位字母数字下划线）</span><input class="input" name="username" placeholder="如：zhangsan"></label>' +
      '<label class="field"><span>显示名称</span><input class="input" name="name" placeholder="怎么称呼"></label>' +
      '<label class="field"><span>初始密码（至少 6 位）</span><input class="input" type="text" name="password" placeholder="设置初始密码"></label>' +
      '<label class="field"><span>角色</span><select class="select" name="role"><option value="member">成员</option><option value="admin">管理员</option></select></label>' +
      '</div>';
    var root = openSheet({ title: '新增账户', sub: '创建后对方即可用此账号登录', body: body,
      footer: '<button class="btn" data-save="1">创建账户</button>' });
    root.querySelector('[data-save]').addEventListener('click', function () {
      var data = {
        username: root.querySelector('[name=username]').value.trim(),
        name: root.querySelector('[name=name]').value.trim(),
        password: root.querySelector('[name=password]').value,
        role: root.querySelector('[name=role]').value
      };
      if (!data.username || !data.password) return toast('账号和密码都要填');
      var btn = this; btn.disabled = true;
      Auth.addUser(data, function (res) {
        btn.disabled = false;
        if (!res.ok) return toast(res.msg || '创建失败');
        closeSheet(); toast('账户已创建'); loadUserList();
      });
    });
  }

  function openChangePwd() {
    var body = '<div class="form">' +
      '<label class="field"><span>原密码</span><input class="input" type="password" name="old" placeholder="当前密码"></label>' +
      '<label class="field"><span>新密码（至少 6 位）</span><input class="input" type="password" name="fresh" placeholder="新密码"></label>' +
      '<label class="field"><span>确认新密码</span><input class="input" type="password" name="fresh2" placeholder="再输一次"></label>' +
      '</div>';
    var root = openSheet({ title: '修改密码', body: body, footer: '<button class="btn" data-save="1">保存</button>' });
    root.querySelector('[data-save]').addEventListener('click', function () {
      var old = root.querySelector('[name=old]').value;
      var fresh = root.querySelector('[name=fresh]').value;
      var fresh2 = root.querySelector('[name=fresh2]').value;
      if (fresh !== fresh2) return toast('两次新密码不一致');
      if (fresh.length < 6) return toast('新密码至少 6 位');
      Auth.changePassword(old, fresh, function (res) {
        if (!res.ok) return toast(res.msg || '修改失败');
        closeSheet(); toast('密码已更新');
      });
    });
  }

  function openResetUser(uid, name) {
    var body = '<div class="form">' +
      '<p class="opt-note">为「' + U.esc(name) + '」设置新密码，设置后原密码立即失效。</p>' +
      '<label class="field"><span>新密码（至少 6 位）</span><input class="input" type="text" name="pw" placeholder="新密码"></label>' +
      '</div>';
    var root = openSheet({ title: '重置密码', body: body, footer: '<button class="btn" data-save="1">重置</button>' });
    root.querySelector('[data-save]').addEventListener('click', function () {
      var pw = root.querySelector('[name=pw]').value;
      if (pw.length < 6) return toast('密码至少 6 位');
      Auth.resetPassword(uid, pw, function (res) {
        if (!res.ok) return toast(res.msg || '重置失败');
        closeSheet(); toast('密码已重置'); loadUserList();
      });
    });
  }

  /* ---------------- 陈年往事板块 ---------------- */
  var MOODS = ['热闹', '开心', '温暖', '怀念', '感动', '有趣', '平淡', '难忘'];

  function storySorted() {
    return (state.stories || []).slice().sort(function (a, b) { return a.date < b.date ? 1 : -1; });
  }
  function filteredStories() {
    var list = storySorted();
    if (ui.story.pid !== 'all') {
      list = list.filter(function (s) { return (s.pids || []).indexOf(ui.story.pid) > -1; });
    }
    return list;
  }
  function storyPeople(s) {
    return (s.pids || []).map(function (id) { return id === 'me' ? '我' : pname(id); }).filter(function (x) { return x !== '未知'; });
  }

  function renderStory() {
    var v = document.getElementById('view-story');
    var all = storySorted();
    var list = filteredStories();
    var head = pageHead('陈年往事', '记下和某些人、某群人经历的事，以及那些有趣的日子',
      '<button class="btn" data-act="add-story">记一段往事</button>');

    var moodCount = {};
    all.forEach(function (s) { if (s.mood) moodCount[s.mood] = (moodCount[s.mood] || 0) + 1; });
    var stats = '<div class="story-stats">' +
      '<div><b>' + all.length + '</b><span>篇回忆</span></div>' +
      '<div><b>' + Object.keys(moodCount).length + '</b><span>种心情</span></div>' +
      '<div><b>' + (all.length ? all[0].date.slice(0, 4) : '—') + '</b><span>最近记录</span></div>' +
      '</div>';

    var chips = '<div class="story-filter">' +
      '<button class="chip' + (ui.story.pid === 'all' ? ' on' : '') + '" data-act="story-pid" data-pid="all">全部</button>' +
      state.people.map(function (p) {
        var n = all.filter(function (s) { return (s.pids || []).indexOf(p.id) > -1; }).length;
        return '<button class="chip' + (ui.story.pid === p.id ? ' on' : '') + '" data-act="story-pid" data-pid="' + p.id + '">' +
          U.esc(p.name) + (n ? ' ' + n : '') + '</button>';
      }).join('') + '</div>';

    var rows = '';
    var curYear = '';
    list.forEach(function (s) {
      var y = s.date.slice(0, 4);
      if (y !== curYear) { rows += '<div class="story-year"><span>' + y + '</span></div>'; curYear = y; }
      var names = storyPeople(s);
      var emails = (s.pids || []).slice(0, 5).map(function (id) {
        var p = person(id);
        var em = id === 'me' ? (state.me.emoji || '🎁') : (p && p.photo ? '<img class="ava-img" src="' + U.esc(p.photo) + '" alt="">' : (p && p.emoji) || '🙂');
        return '<span class="story-ava">' + em + '</span>';
      }).join('');
      var sp = (s.photos || []).filter(Boolean);
      var photoStrip = sp.length ? '<div class="story-photo-strip">' + sp.slice(0, 9).map(function (u) {
        return '<img src="' + U.esc(u) + '" alt="往事照片" loading="lazy">';
      }).join('') + '</div>' : '';
      rows += '<button class="story-card" data-act="edit-story" data-sid="' + s.id + '">' +
        '<div class="story-top"><span class="story-emoji">' + U.esc(s.emoji || '📖') + '</span>' +
        '<div class="story-hd"><b>' + U.esc(s.title) + '</b>' +
        '<span>' + U.cnDateFull(s.date) + ' · ' + U.weekday(s.date) + (s.mood ? ' · ' + U.esc(s.mood) : '') + '</span></div></div>' +
        '<p class="story-text">' + U.esc(s.content || '') + '</p>' +
        photoStrip +
        '<div class="story-foot">' +
        (emails ? '<span class="story-avas">' + emails + '</span><span class="story-names">' + U.esc(names.join('、')) + '</span>' : '<span class="story-names">一个人的日子</span>') +
        '<span class="story-tags">' + (s.tags || []).map(function (t) { return '<i>' + U.esc(t) + '</i>'; }).join('') + '</span>' +
        '</div></button>';
    });
    if (!list.length) {
      rows = '<div class="empty">' + (!all.length ? '<span class="em-ico">📖</span>' : '') + (all.length ? '还没有和这位成员相关的往事' : '还没有往事，点下面写下第一段') +
        (!all.length ? '<br><button class="btn small" data-act="add-story">记第一段往事</button>' : '') + '</div>';
    }

    v.innerHTML = '<div class="page">' + head + stats +
      '<div class="story-filter-wrap">' + chips + '</div>' +
      '<div class="story-timeline">' + rows + '</div>' +
      '<div class="foot-note">人情往来 · v1.2.15<br>往事只保存在自己的账本里，可到设置导出备份</div>' +
      '</div>';
  }

  function openStoryForm(sid) {
    var s = sid ? (state.stories || []).filter(function (x) { return x.id === sid; })[0] : null;
    var isNew = !s;
    var picked = s ? (s.pids || []).slice() : [];
    var photos = s ? (s.photos || []).slice() : [];   // 往事照片 URL 列表
    var storyKey = s ? s.id : U.uid('s_');
    function photoHtml() {
      return photos.map(function (url, i) {
        return '<span class="story-photo"><img src="' + U.esc(url) + '" alt="">' +
          '<button type="button" class="story-photo-x" data-photo-del="' + i + '" aria-label="移除照片">✕</button></span>';
      }).join('');
    }
    var body = '<div class="form">' +
      '<label class="field"><span>标题</span><input class="input" name="title" value="' + U.esc(s ? s.title : '') + '" placeholder="如：那年我们一起过的年"></label>' +
      '<div class="field-2">' +
      '<div class="field"><span>日期</span>' + dateRowHTML('date', s ? s.date : U.todayISO()) + '</div>' +
      '<label class="field"><span>图标</span><input class="input" name="emoji" maxlength="4" value="' + U.esc(s ? (s.emoji || '📖') : '📖') + '" placeholder="一个表情"></label></div>' +
      '<label class="field"><span>心情</span><select class="select" name="mood">' +
      '<option value="">不填</option>' +
      MOODS.map(function (m) { return '<option' + ((s ? s.mood : '') === m ? ' selected' : '') + '>' + m + '</option>'; }).join('') +
      '</select></label>' +
      '<div class="field"><span>和谁有关（可多选，一群人也可以）</span>' +
      '<div class="spick-people">' +
      '<button type="button" class="spick' + (picked.indexOf('me') > -1 ? ' on' : '') + '" data-pick="me">🎁 我</button>' +
      state.people.map(function (p) {
        return '<button type="button" class="spick' + (picked.indexOf(p.id) > -1 ? ' on' : '') + '" data-pick="' + p.id + '">' + U.esc(p.name) + '</button>';
      }).join('') +
      '</div></div>' +
      '<label class="field"><span>回忆正文</span><textarea class="input story-area" name="content" rows="6" placeholder="那天发生了什么？记下来，免得忘了……">' + U.esc(s ? s.content : '') + '</textarea></label>' +
      '<div class="field"><span>往事照片（选填，可多张）</span>' +
      '<div class="story-photos" id="storyPhotos">' + photoHtml() + '</div>' +
      '<div class="story-photo-ctl"><label class="btn ghost sm" for="storyPhotoInput">＋ 添加照片</label>' +
      '<input type="file" id="storyPhotoInput" accept="image/*" multiple hidden></div>' +
      '<em class="field-note">照片会存到 NAS 数据目录，最多 9 张，每张不超过 6MB</em></div>' +
      '<label class="field"><span>标签</span><input class="input" name="tags" value="' + U.esc(s ? (s.tags || []).join('、') : '') + '" placeholder="选填，用顿号分隔，如：春节、家人"></label>' +
      '</div>';
    var footer = (!isNew ? '<button class="btn ghost danger" data-del="1">删除</button>' : '') +
      '<button class="btn" data-save="1">保存</button>';
    var root = openSheet({ title: isNew ? '写一段往事' : '编辑往事', body: body, footer: footer });
    root.querySelectorAll('.spick').forEach(function (b) {
      b.addEventListener('click', function () { b.classList.toggle('on'); });
    });
    // 照片：选择 → 逐张上传 → 插入缩略图；失败回收占位
    var photoBox = root.querySelector('#storyPhotos');
    var photoInput = root.querySelector('#storyPhotoInput');
    function refreshPhotos() { if (photoBox) photoBox.innerHTML = photoHtml(); }
    if (photoInput) photoInput.addEventListener('change', function () {
      var files = Array.prototype.slice.call(photoInput.files || []);
      photoInput.value = '';
      files.forEach(function (f) {
        if (photos.length >= 9) { toast('一篇往事最多放 9 张照片'); return; }
        photos.push(null); refreshPhotos();
        var idx = photos.length - 1;
        uploadAvatar(storyKey + '_img' + U.uid(''), f, function (url) {
          photos[idx] = url; refreshPhotos();
        }, function () {
          photos.splice(idx, 1); refreshPhotos();
        });
      });
    });
    if (photoBox) photoBox.addEventListener('click', function (e) {
      var b = e.target.closest('[data-photo-del]');
      if (!b) return;
      photos.splice(Number(b.getAttribute('data-photo-del')), 1); refreshPhotos();
    });
    root.querySelector('[data-save]').addEventListener('click', function () {
      var title = root.querySelector('[name=title]').value.trim();
      if (!title) return toast('写个标题吧');
      if (photos.some(function (x) { return !x; })) return toast('照片还在上传，稍等一下');
      var pids = [];
      root.querySelectorAll('.spick.on').forEach(function (b) { pids.push(b.getAttribute('data-pick')); });
      var data = {
        title: title,
        date: dateVal(root, 'date') || U.todayISO(),
        emoji: root.querySelector('[name=emoji]').value.trim() || '📖',
        mood: root.querySelector('[name=mood]').value,
        pids: pids,
        content: root.querySelector('[name=content]').value.trim(),
        tags: root.querySelector('[name=tags]').value.split(/[、,，]/).map(function (x) { return x.trim(); }).filter(Boolean),
        photos: photos
      };
      if (!state.stories) state.stories = [];
      if (s) Object.assign(s, data);
      else state.stories.push(Object.assign({ id: storyKey }, data));
      save(); closeSheet(); render(); toast('记下来了');
    });
    var del = root.querySelector('[data-del]');
    if (del) del.addEventListener('click', function () {
      if (!confirm('删除这篇往事？')) return;
      state.stories = (state.stories || []).filter(function (x) { return x.id !== sid; });
      save(); closeSheet(); render(); toast('已删除');
    });
  }

  function renderMe() {
    var v = document.getElementById('view-me');
    var me = state.me;
    var t = allTotals();
    var c = ringCounts();
    var net = t.in - t.out;
    var daysToBd = me.birthday ? U.daysToMD(me.birthday.slice(5)) : null;
    var age = me.birthday ? U.age(me.birthday) : null;
    var stories = storySorted();

    // 每块默认显示 3 条，标题右侧给「查看全部」，点击跳到对应页面
    function moreLink(total, tab, label) {
      if (!total) return '';
      return '<button class="sec-more" data-act="tab" data-tab="' + tab + '" title="前往' + label + '查看全部">' +
        '查看全部</button>';
    }

    // 回忆（陈年往事）
    var storiesHtml = stories.length
      ? stories.slice(0, 3).map(function (s) {
          return '<button class="me-event me-memo" data-act="edit-story" data-sid="' + s.id + '">' +
            '<span class="me-event-ico">' + U.esc(s.emoji || '📖') + '</span>' +
            '<span class="me-event-txt"><b>' + U.esc(s.title) + '</b><em>' + U.cnDate(s.date) + (s.mood ? ' · ' + U.esc(s.mood) : '') + '</em></span>' +
            '<span class="me-event-day">›</span></button>';
        }).join('')
      : '<div class="empty sm"><span class="em-ico">📖</span>还没有往事，去「陈年往事」写下第一段</div>';

    // 近期事项：未来 60 天内的生日 / 忌日 / 自定义事项
    var upsAll = upcoming(60);
    var eventIcon = { birthday: '🎂', memorial: '🕯️', banquet: '🍽️', custom: '📌' };
    var eventsHtml = upsAll.length
      ? upsAll.slice(0, 3).map(function (it) {
          return '<button class="me-event" data-act="tab" data-tab="cal">' +
            '<span class="me-event-ico">' + (eventIcon[it.type] || '📌') + '</span>' +
            '<span class="me-event-txt"><b>' + U.esc(it.title) + '</b><em>' + U.esc(it.meta || '') + '</em></span>' +
            '<span class="me-event-day">' + (it.offset === 0 ? '今天' : it.offset + ' 天后') + '</span>' +
            '</button>';
        }).join('')
      : '<div class="empty sm"><span class="em-ico">🗓️</span>近两个月没有待办事项</div>';

    // 最近往来
    var giftsAll = state.gifts.slice().sort(function (a, b) { return a.date < b.date ? 1 : -1; });
    var recentHtml = giftsAll.length
      ? giftsAll.slice(0, 3).map(function (g) {
          var who = g.pid === 'me' ? '我' : pname(g.pid);
          return '<div class="me-recent">' +
            '<span class="me-recent-ico ' + (g.dir === 'in' ? 'in' : 'out') + '">' + (g.dir === 'in' ? '收' : '送') + '</span>' +
            '<span class="me-recent-txt"><b>' + U.esc(who) + '</b><em>' + U.esc(g.title || (g.type || '往来')) + ' · ' + g.date.slice(5) + '</em></span>' +
            '<b class="' + (g.dir === 'in' ? 'c-in' : 'c-out') + '">' + (g.dir === 'in' ? '+' : '−') + U.money(g.amount) + '</b>' +
            '</div>';
        }).join('')
      : '<div class="empty sm"><span class="em-ico">🧾</span>还没有往来记录，点右上「记一笔」开始</div>';

    var html = '<div class="page">' +
      pageHead('我的', apiOK ? '数据保存在 NAS，多设备实时同步' : '数据只保存在这台设备上',
        '<button class="btn ghost" data-act="add-person">添加成员</button>' +
        '<button class="btn" data-act="add-gift">记一笔</button>') +
      '<div class="me-card">' +
      '<div class="me-top">' +
      '<span class="ava me-ava">' + me.emoji + '<i class="me-ring"></i></span>' +
      '<div class="me-info"><h2>' + U.esc(me.nick || me.name) + '</h2>' +
      '<p>' + U.esc(me.name) + (age !== null ? ' · ' + age + ' 岁' : '') + (me.hometown ? ' · ' + U.esc(me.hometown) : '') + '</p></div>' +
      '<button class="icon-btn me-edit" data-act="edit-me">编辑</button>' +
      '<button class="me-motto" data-act="edit-me" title="点击修改个性签名">' + U.esc(me.motto || '有来有往，记在心里。') + '</button>' +
      '</div>' +
      '<div class="me-stats">' +
      '<div class="ms-col">' +
      '<div class="ms-item"><span class="ms-k">亲朋好友</span><b>' + c.total + '</b></div>' +
      '<div class="ms-item"><span class="ms-k dot" style="--dot:var(--red)">至亲</span><b>' + c[1] + '</b></div>' +
      '<div class="ms-item"><span class="ms-k dot" style="--dot:var(--gold)">亲友</span><b>' + c[2] + '</b></div>' +
      '<div class="ms-item"><span class="ms-k dot" style="--dot:var(--ink-3)">朋友</span><b>' + c[3] + '</b></div>' +
      '</div>' +
      '<div class="ms-col">' +
      '<div class="ms-item"><span class="ms-k">往来笔数</span><b>' + t.count + '</b></div>' +
      '<div class="ms-item"><span class="ms-k">累计收</span><b class="c-in">' + U.money(t.in) + '</b></div>' +
      '<div class="ms-item"><span class="ms-k">累计送</span><b class="c-out">' + U.money(t.out) + '</b></div>' +
      '<div class="ms-item"><span class="ms-k">净往来</span><b class="' + (net >= 0 ? 'c-in' : 'c-out') + '">' + (net >= 0 ? '+' : '−') + U.money(net) + '</b></div>' +
      '</div>' +
      '</div>' +
      ((me.birthday || me.since) ? '<div class="me-meta">' +
      (me.birthday ? '<span>🎂 ' + U.cnDate(me.birthday) + (daysToBd === 0 ? ' · 今天生日' : ' · ' + daysToBd + ' 天后') + '</span>' : '') +
      (me.since ? '<span>💍 结婚纪念 ' + U.cnDate(me.since) + '</span>' : '') +
      '</div>' : '') + '</div>' +

      '<div class="sec-title"><span>近期事项</span>' + moreLink(upsAll.length, 'cal', '日历') + '</div>' +
      '<div class="me-list">' + eventsHtml + '</div>' +

      '<div class="sec-title"><span>最近往来</span>' + moreLink(giftsAll.length, 'ledger', '礼金台账') + '</div>' +
      '<div class="me-list">' + recentHtml + '</div>' +

      '<div class="sec-title"><span>陈年往事</span>' + moreLink(stories.length, 'story', '陈年往事') + '</div>' +
      '<div class="me-list">' + storiesHtml + '</div>' +

      '<div class="foot-note">人情往来 · v1.2.15<br>数据保存在 NAS；换设备或卸载前请先到设置导出备份</div>' +
      '</div>';
    v.innerHTML = html;
  }

  /* ---------------- 人物详情 ---------------- */
  function openPerson(pid) {
    if (pid === 'me') return openMeSheet();
    var p = person(pid);
    if (!p) return;
    var t = totalsFor(pid);
    var gifts = state.gifts.filter(function (g) { return g.pid === pid; }).sort(function (a, b) { return a.date < b.date ? 1 : -1; });
    var map = pmap();
    var spouse = p.spouseId ? (p.spouseId === 'me' ? state.me : map[p.spouseId]) : null;
    var kids = state.people.filter(function (x) { return x.via === pid && x.ring === 1; });
    var via = p.via && p.via !== 'me' ? map[p.via] : null;
    var bdLeft = p.birthday && !p.deathday ? U.daysToMD(p.birthday.slice(5)) : null;
    var memLeft = p.deathday ? U.daysToMD(p.deathday.slice(5)) : null;

    var chips = '';
    if (spouse) chips += '<button class="rel-chip" data-act="open-person" data-pid="' + (spouse.id || 'me') + '">' + (spouse.id === 'me' ? '我' : spouse.name) + ' · 配偶</button>';
    kids.forEach(function (k) { chips += '<button class="rel-chip" data-act="open-person" data-pid="' + k.id + '">' + k.name + ' · ' + k.relation + '</button>'; });
    if (via) chips += '<button class="rel-chip" data-act="open-person" data-pid="' + via.id + '">' + via.name + ' · 中间人</button>';

    var body = '<div class="prof-head">' +
      '<span class="ava xl">' + (p.photo ? '<img class="ava-img" src="' + U.esc(p.photo) + '" alt="">' : (p.emoji || '🙂')) + '</span>' +
      '<div><h3>' + U.esc(p.name) + ' ' + ringTag(p.ring) + '</h3>' +
      '<p>' + U.esc(p.relation) + (p.job ? ' · ' + U.esc(p.job) : '') + '</p>' +
      '<div class="prof-tags">' + (p.tags || []).map(function (x) { return '<i>' + U.esc(x) + '</i>'; }).join('') + '</div></div>' +
      '</div>' +
      '<div class="prof-stats">' +
      '<div><b class="c-in">' + U.money(t.in) + '</b><span>收到的礼</span></div>' +
      '<div><b class="c-out">' + U.money(t.out) + '</b><span>送出的礼</span></div>' +
      '<div><b>' + t.count + '</b><span>往来笔数</span></div>' +
      '</div>' +
      '<div class="prof-info">' +
      (p.birthday ? '<div><span>生日</span><b>' + U.cnDateFull(p.birthday) + ' · ' + (bdLeft === 0 ? '今天' : bdLeft + '天后') + '</b></div>' : '') +
      (p.deathday ? '<div><span>忌日</span><b>' + U.cnDateFull(p.deathday) + ' · ' + (memLeft === 0 ? '今天' : memLeft + '天后') + '</b></div>' : '') +
      (p.phone ? '<div><span>手机</span><b>' + U.esc(p.phone) + '</b></div>' : '') +
      (p.address ? '<div><span>地址</span><b>' + U.esc(p.address) + '</b></div>' : '') +
      (via ? '<div><span>认识途径</span><b>经 ' + U.esc(via.name) + '</b></div>' : '') +
      (p.note ? '<div><span>备注</span><b>' + U.esc(p.note) + '</b></div>' : '') +
      '</div>' +
      (chips ? '<div class="prof-rel">' + chips + '</div>' : '') +
      '<div class="sec-title sub"><span>往来记录</span><em>' + gifts.length + ' 笔</em></div>' +
      (gifts.length ? gifts.slice(0, 6).map(function (g) {
        return '<div class="mini-row"><span class="gdate"><b>' + U.md(g.date) + '</b><em>' + g.date.slice(0, 4) + '</em></span>' +
          '<span class="gmain"><b>' + U.esc(g.occ) + '</b><em>' + U.esc(g.note || '') + '</em></span>' +
          '<span class="gamt ' + (g.dir === 'in' ? 'c-in' : 'c-out') + '">' + (g.dir === 'in' ? '+' : '−') + U.money(g.amount) + '</span></div>';
      }).join('') : '<div class="dp-empty">还没有往来记录</div>');

    openSheet({
      title: '',
      cls: 'person-sheet',
      body: body,
      footer: '<button class="btn ghost" data-act="edit-person" data-pid="' + p.id + '">编辑</button>' +
        '<button class="btn" data-act="add-gift" data-pid="' + p.id + '">记一笔</button>'
    });
  }

  function openMeSheet() {
    var me = state.me, t = allTotals();
    var body = '<div class="prof-head"><span class="ava xl">' + me.emoji + '</span><div><h3>' + U.esc(me.nick || me.name) + ' <i class="ring-tag me">我</i></h3>' +
      '<p>' + U.esc(me.name) + (me.hometown ? ' · ' + U.esc(me.hometown) : '') + '</p>' +
      '<div class="prof-tags"><i>关系中心的「我」</i></div></div></div>' +
      '<div class="prof-stats"><div><b class="c-in">' + U.money(t.in) + '</b><span>累计收礼</span></div>' +
      '<div><b class="c-out">' + U.money(t.out) + '</b><span>累计送礼</span></div>' +
      '<div><b>' + state.people.length + '</b><span>亲友</span></div></div>' +
      '<div class="prof-info">' +
      (me.birthday ? '<div><span>生日</span><b>' + U.cnDateFull(me.birthday) + '</b></div>' : '') +
      (me.since ? '<div><span>结婚纪念</span><b>' + U.cnDateFull(me.since) + '</b></div>' : '') +
      (me.phone ? '<div><span>手机</span><b>' + U.esc(me.phone) + '</b></div>' : '') +
      (me.hometown ? '<div><span>家乡</span><b>' + U.esc(me.hometown) + '</b></div>' : '') +
      (me.city ? '<div><span>所在城市</span><b>' + U.esc(me.city) + '</b></div>' : '') +
      (me.address ? '<div><span>地址</span><b>' + U.esc(me.address) + '</b></div>' : '') +
      '</div>';
    openSheet({
      title: '', cls: 'person-sheet', body: body,
      footer: '<button class="btn" data-act="edit-me">编辑资料</button>'
    });
  }

  /* ---------------- 表单 ---------------- */
  function personOptions(selected, includeMe) {
    var opts = includeMe ? '<option value="me"' + (selected === 'me' ? ' selected' : '') + '>我</option>' : '';
    opts += '<option value="">无</option>';
    state.people.forEach(function (p) {
      opts += '<option value="' + p.id + '"' + (selected === p.id ? ' selected' : '') + '>' + U.esc(p.name) + '（' + U.esc(p.relation) + '）</option>';
    });
    return opts;
  }

  function openPersonForm(pid) {
    var p = pid ? person(pid) : null;
    var isNew = !p;
    var photo = (p && p.photo) || '';
    var body = '<div class="form">' +
      '<div class="photo-row">' +
      '<span class="photo-prev" id="photoPrev">' +
      (photo ? '<img src="' + U.esc(photo) + '" alt="">' : '<span>' + U.esc(p ? p.emoji : '🙂') + '</span>') +
      '</span>' +
      '<div class="photo-ctl"><b>头像照片</b><em>上传后优先显示照片，没上传就用 emoji</em>' +
      '<div class="photo-btns"><label class="btn ghost sm" for="photoInput">选择照片</label>' +
      '<input type="file" id="photoInput" accept="image/*" hidden>' +
      (photo ? '<button class="btn ghost sm danger" id="photoClear">移除照片</button>' : '') +
      '</div></div></div>' +
      '<label class="field"><span>姓名</span><input class="input" name="name" value="' + U.esc(p ? p.name : '') + '" placeholder="怎么称呼"></label>' +
      '<div class="field-2">' +
      '<label class="field"><span>关系</span><input class="input" name="relation" value="' + U.esc(p ? p.relation : '') + '" placeholder="如：表哥 / 同事"></label>' +
      '<label class="field"><span>圈层</span><select class="select" name="ring">' +
      [1, 2, 3].map(function (r) { return '<option value="' + r + '"' + ((p ? p.ring : 2) === r ? ' selected' : '') + '>' + window.RINGS[r].name + ' · ' + window.RINGS[r].desc + '</option>'; }).join('') +
      '</select></label></div>' +
      '<div class="field-2">' +
      '<label class="field"><span>头像</span><input class="input" name="emoji" value="' + U.esc(p ? p.emoji : '🙂') + '" maxlength="4"></label>' +
      '<div class="field"><span>生日</span>' + dateRowHTML('birthday', p && p.birthday ? p.birthday : '') + '</div></div>' +
      '<div class="field-2">' +
      '<label class="field"><span>配偶</span><select class="select" name="spouseId">' + personOptions(p ? p.spouseId : '', true) + '</select></label>' +
      '<label class="field"><span>通过谁认识</span><select class="select" name="via">' + personOptions(p ? p.via : 'me', true) + '</select></label></div>' +
      '<div class="field-2">' +
      '<label class="field"><span>手机号码</span><input class="input" type="tel" name="phone" value="' + U.esc(p ? p.phone : '') + '" placeholder="选填"></label>' +
      '<div class="field"><span>忌日</span>' + dateRowHTML('deathday', p && p.deathday ? p.deathday : '') + '</div></div>' +
      '<label class="field"><span>地址</span><input class="input" name="address" value="' + U.esc(p ? p.address : '') + '" placeholder="家庭住址或所在城市，选填"></label>' +
      '<label class="field"><span>标签</span><input class="input" name="tags" value="' + U.esc(p && p.tags ? p.tags.join('、') : '') + '" placeholder="用、分隔，如：爱下棋、在深圳"></label>' +
      '<label class="field"><span>备注</span><textarea class="input" name="note" rows="2" placeholder="想记住的细节">' + U.esc(p ? p.note : '') + '</textarea></label>' +
      '</div>';
    var footer = (isNew ? '' : '<button class="btn ghost danger" data-del="' + pid + '">删除</button>') +
      '<button class="btn" data-save="1">保存</button>';
    var root = openSheet({ title: isNew ? '添加成员' : '编辑资料', sub: isNew ? '存下来，礼金和日历都会自动关联' : '', body: body, footer: footer });
    root.querySelector('[data-save]').addEventListener('click', function () {
      var f = root;
      var data = {
        name: f.querySelector('[name=name]').value.trim(),
        relation: f.querySelector('[name=relation]').value.trim() || '亲友',
        ring: Number(f.querySelector('[name=ring]').value),
        emoji: f.querySelector('[name=emoji]').value.trim() || '🙂',
        birthday: dateVal(f, 'birthday'),
        deathday: dateVal(f, 'deathday'),
        phone: f.querySelector('[name=phone]').value.trim(),
        address: f.querySelector('[name=address]').value.trim(),
        spouseId: f.querySelector('[name=spouseId]').value,
        via: f.querySelector('[name=via]').value || 'me',
        tags: f.querySelector('[name=tags]').value.split(/[、,，]/).map(function (s) { return s.trim(); }).filter(Boolean),
        note: f.querySelector('[name=note]').value.trim()
      };
      if (!data.name) return toast('先填个名字吧');
      data.photo = root.dataset.photo || photo;
      if (p) Object.assign(p, data);
      else state.people.push(Object.assign({ id: U.uid('p_') }, data));
      save(); closeSheet(); render(); toast('已保存');
    });
    // 图片选择与上传
    var photoInput = root.querySelector('#photoInput');
    var photoPrev = root.querySelector('#photoPrev');
    root.dataset.photo = photo;
    if (photoInput) photoInput.addEventListener('change', function () {
      var f = photoInput.files && photoInput.files[0];
      if (!f) return;
      var tmpId = p ? p.id : U.uid('p_');
      toast('正在上传照片…');
      uploadAvatar(tmpId, f, function (url) {
        root.dataset.photo = url;
        photoPrev.innerHTML = '<img src="' + url + '" alt="">';
        toast('照片已上传，记得点保存');
      });
    });
    var photoClear = root.querySelector('#photoClear');
    if (photoClear) photoClear.addEventListener('click', function () {
      root.dataset.photo = '';
      photoPrev.innerHTML = '<span>' + U.esc(p ? p.emoji : '🙂') + '</span>';
      toast('已移除照片，记得点保存');
    });
    var del = root.querySelector('[data-del]');
    if (del) del.addEventListener('click', function () {
      if (!confirm('删除「' + p.name + '」？与他/她的礼金记录也会一起删除。')) return;
      state.people = state.people.filter(function (x) { return x.id !== pid; });
      state.gifts = state.gifts.filter(function (g) { return g.pid !== pid; });
      state.events = state.events.filter(function (e) { return e.personId !== pid; });
      save(); closeSheet(); render(); toast('已删除');
    });
  }

  function openGiftForm(gid, pid) {
    if (!state.people.length) { toast('先添加一位亲友，再记账'); openPersonForm(); return; }
    var g = gid ? state.gifts.filter(function (x) { return x.id === gid; })[0] : null;
    var isNew = !g;
    var dir = g ? g.dir : 'out';
    var body = '<div class="form">' +
      '<div class="seg dir-seg">' +
      '<button data-dir="in" class="' + (dir === 'in' ? 'on' : '') + '">收到的礼</button>' +
      '<button data-dir="out" class="' + (dir === 'out' ? 'on' : '') + '">送出的礼</button></div>' +
      '<label class="field"><span>人员</span><select class="select" name="pid">' +
      state.people.map(function (p) { return '<option value="' + p.id + '"' + ((g ? g.pid : pid) === p.id ? ' selected' : '') + '>' + U.esc(p.name) + '（' + U.esc(p.relation) + '）</option>'; }).join('') +
      '</select></label>' +
      '<div class="field-2">' +
      '<label class="field"><span>金额</span><input class="input big" type="number" name="amount" inputmode="decimal" value="' + (g ? g.amount : '') + '" placeholder="0"></label>' +
      '<div class="field"><span>日期</span>' + dateRowHTML('date', g ? g.date : U.todayISO()) + '</div></div>' +
      '<label class="field"><span>事由</span><select class="select" name="occ">' +
      window.OCCASIONS.map(function (o) { return '<option' + (g && g.occ === o ? ' selected' : (!g && o === '婚礼' ? ' selected' : '')) + '>' + o + '</option>'; }).join('') +
      '</select></label>' +
      '<label class="field"><span>备注</span><input class="input" name="note" value="' + U.esc(g ? g.note : '') + '" placeholder="选填，比如：二叔家嫁女"></label>' +
      '</div>';
    var footer = (!isNew ? '<button class="btn ghost danger" data-del="1">删除</button>' : '') +
      '<button class="btn" data-save="1">保存</button>';
    var root = openSheet({ title: isNew ? '记一笔' : '编辑这笔礼金', body: body, footer: footer });
    root.querySelectorAll('.dir-seg button').forEach(function (b) {
      b.addEventListener('click', function () {
        root.querySelectorAll('.dir-seg button').forEach(function (x) { x.classList.remove('on'); });
        b.classList.add('on');
        root.dataset.dir = b.getAttribute('data-dir');
      });
    });
    root.dataset.dir = dir;
    root.querySelector('[data-save]').addEventListener('click', function () {
      var amount = Number(root.querySelector('[name=amount]').value);
      if (!amount) return toast('填一下金额');
      var data = {
        pid: root.querySelector('[name=pid]').value,
        dir: root.dataset.dir,
        amount: amount,
        date: dateVal(root, 'date') || U.todayISO(),
        occ: root.querySelector('[name=occ]').value,
        note: root.querySelector('[name=note]').value.trim()
      };
      if (g) Object.assign(g, data);
      else state.gifts.push(Object.assign({ id: U.uid('g_') }, data));
      save(); closeSheet(); render(); toast('记好了');
    });
    var del = root.querySelector('[data-del]');
    if (del) del.addEventListener('click', function () {
      if (!confirm('删除这笔记录？')) return;
      state.gifts = state.gifts.filter(function (x) { return x.id !== gid; });
      save(); closeSheet(); render(); toast('已删除');
    });
  }

  function openEventForm(eid, date) {
    var e = eid ? state.events.filter(function (x) { return x.id === eid; })[0] : null;
    var isNew = !e;
    var body = '<div class="form">' +
      '<label class="field"><span>事项</span><input class="input" name="title" value="' + U.esc(e ? e.title : '') + '" placeholder="如：二叔六十大寿"></label>' +
      '<div class="field-2">' +
      '<label class="field"><span>类型</span><select class="select" name="type">' +
      [['banquet', '宴请 / 红白事'], ['birthday', '生日'], ['memorial', '忌日'], ['custom', '其他事项']].map(function (x) {
        return '<option value="' + x[0] + '"' + ((e ? e.type : 'banquet') === x[0] ? ' selected' : '') + '>' + x[1] + '</option>';
      }).join('') + '</select></label>' +
      '<div class="field"><span>日期</span>' + dateRowHTML('date', e ? e.date : (date || U.todayISO())) + '</div></div>' +
      '<label class="field"><span>关联亲友</span><select class="select" name="personId">' + personOptions(e ? e.personId : '', false) + '</select></label>' +
      '<label class="check"><input type="checkbox" name="repeat"' + (!e || e.repeat === 'yearly' ? ' checked' : '') + '><span>每年重复（生日、纪念日、忌日）</span></label>' +
      '<label class="field"><span>备注</span><input class="input" name="note" value="' + U.esc(e ? e.note : '') + '" placeholder="选填，比如：下午三点、带红包"></label>' +
      '</div>';
    var footer = (!isNew ? '<button class="btn ghost danger" data-del="1">删除</button>' : '') +
      '<button class="btn" data-save="1">保存</button>';
    var root = openSheet({ title: isNew ? '加一件事项' : '编辑事项', body: body, footer: footer });
    root.querySelector('[data-save]').addEventListener('click', function () {
      var title = root.querySelector('[name=title]').value.trim();
      if (!title) return toast('写个标题吧');
      var data = {
        title: title,
        type: root.querySelector('[name=type]').value,
        date: dateVal(root, 'date') || U.todayISO(),
        personId: root.querySelector('[name=personId]').value,
        repeat: root.querySelector('[name=repeat]').checked ? 'yearly' : 'none',
        note: root.querySelector('[name=note]').value.trim()
      };
      if (e) Object.assign(e, data);
      else state.events.push(Object.assign({ id: U.uid('e_') }, data));
      save(); closeSheet();
      ui.cal.sel = data.date;
      ui.cal.ym = data.date.slice(0, 7);
      render(); toast('已加入日历');
    });
    var del = root.querySelector('[data-del]');
    if (del) del.addEventListener('click', function () {
      if (!confirm('删除这个事项？')) return;
      state.events = state.events.filter(function (x) { return x.id !== eid; });
      save(); closeSheet(); render(); toast('已删除');
    });
  }

  // 清空并重新开始：先填自己的信息，再清空
  function openResetSheet() {
    var me = state.me || {};
    var body = '<div class="form">' +
      '<p class="form-tip">清空会删除本机保存的全部亲友、往来、日历事项与陈年往事。<br>请先确认自己的信息，清空后从这里重新开始。</p>' +
      '<div class="field-2">' +
      '<label class="field"><span>昵称</span><input class="input" name="nick" value="' + U.esc(me.nick || '') + '" placeholder="家里人怎么叫你"></label>' +
      '<label class="field"><span>姓名</span><input class="input" name="name" value="' + U.esc(me.name || '') + '" placeholder="你的名字"></label></div>' +
      '<label class="field"><span>头像</span><input class="input" name="emoji" maxlength="4" value="' + U.esc(me.emoji || '🎁') + '" placeholder="一个表情"></label>' +
      '<div class="field"><span>生日</span>' + dateRowHTML('birthday', me.birthday || '') + '</div>' +
      '<div class="field"><span>家乡</span>' + regionHTML('hometown', me.hometown || '') + '</div>' +
      '<div class="field"><span>所在城市</span>' + regionHTML('city', me.city || me.address || '') + '</div>' +
      '<label class="field"><span>个性签名</span><input class="input" name="motto" value="' + U.esc(me.motto || '') + '" placeholder="选填，写一句自己的话"></label>' +
      '</div>';
    var root = openSheet({
      title: '清空并重新开始',
      sub: '先填好自己的信息，再确认清空',
      body: body,
      footer: '<button class="btn ghost" data-act="close">取消</button>' +
        '<button class="btn ghost danger" data-reset="1">确认清空</button>'
    });
    root.querySelector('[data-reset]').addEventListener('click', function () {
      var nick = root.querySelector('[name=nick]').value.trim();
      var name = root.querySelector('[name=name]').value.trim();
      if (!nick && !name) { toast('请先填上自己的昵称或姓名'); return; }
      var newMe = {
        nick: nick || name,
        name: name || nick,
        emoji: root.querySelector('[name=emoji]').value.trim() || '🎁',
        birthday: dateVal(root, 'birthday'),
        hometown: regionVal(root, 'hometown'),
        city: regionVal(root, 'city'),
        address: '',
        motto: root.querySelector('[name=motto]').value.trim(),
        phone: me.phone || '',
        since: '',
        spouseId: ''
      };
      state = { me: newMe, people: [], gifts: [], events: [], stories: [] };
      ui.ledger.pid = 'all'; ui.story.pid = 'all'; ui.q = ''; ui.tab = 'me';
      save(); closeSheet(); render();
      toast('已清空，从你开始重新记录');
    });
  }

  function openMeForm() {
    var me = state.me;
    var body = '<div class="form">' +
      '<div class="field-2">' +
      '<label class="field"><span>昵称</span><input class="input" name="nick" value="' + U.esc(me.nick || '') + '"></label>' +
      '<label class="field"><span>姓名</span><input class="input" name="name" value="' + U.esc(me.name || '') + '"></label></div>' +
      '<div class="field-2">' +
      '<label class="field"><span>头像</span><input class="input" name="emoji" maxlength="4" value="' + U.esc(me.emoji || '🎁') + '"></label>' +
      '<label class="field"><span>手机号码</span><input class="input" type="tel" name="phone" value="' + U.esc(me.phone || '') + '"></label></div>' +
      '<div class="field"><span>生日</span>' + dateRowHTML('birthday', me.birthday || '') + '</div>' +
      '<div class="field"><span>结婚纪念日</span>' + dateRowHTML('since', me.since || '') + '</div>' +
      '<div class="field"><span>家乡</span>' + regionHTML('hometown', me.hometown || '') + '</div>' +
      '<div class="field"><span>所在城市</span>' + regionHTML('city', me.city || me.address || '') + '</div>' +
      '<label class="field"><span>详细地址</span><input class="input" name="address" value="' + U.esc(me.address || '') + '" placeholder="街道、小区，选填"></label>' +
      '<label class="field"><span>个性签名</span><input class="input" name="motto" value="' + U.esc(me.motto || '') + '" placeholder="写一句自己的话，显示在「我的」页顶部"></label>' +
      '</div>';
    var root = openSheet({ title: '编辑我的资料', body: body, footer: '<button class="btn" data-save="1">保存</button>' });
    root.querySelector('[data-save]').addEventListener('click', function () {
      ['nick', 'name', 'emoji', 'phone', 'address', 'motto'].forEach(function (k) {
        me[k] = root.querySelector('[name=' + k + ']').value.trim();
      });
      me.birthday = dateVal(root, 'birthday');
      me.since = dateVal(root, 'since');
      me.hometown = regionVal(root, 'hometown');
      me.city = regionVal(root, 'city');
      save(); closeSheet(); render(); toast('已更新');
    });
  }

  /* ---------------- 数据导入导出 ---------------- */
  function exportData() {
    var blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = '人情往来-' + U.todayISO() + '.json';
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 3000);
    toast('备份已导出');
  }
  function importData() {
    var inp = document.createElement('input');
    inp.type = 'file'; inp.accept = '.json,application/json';
    inp.onchange = function () {
      var f = inp.files[0]; if (!f) return;
      var r = new FileReader();
      r.onload = function () {
        try {
          var s = JSON.parse(r.result);
          if (!s.people || !s.gifts) throw new Error('bad');
          if (!confirm('导入会覆盖当前全部数据，确定吗？')) return;
          state = normalize(s); save(); render(); toast('已恢复');
        } catch (e) { toast('文件格式不对'); }
      };
      r.readAsText(f);
    };
    inp.click();
  }

  /* ---------------- 事件分发 ---------------- */
  function onClick(e) {
    var t = e.target.closest('[data-act]');
    if (!t) return;
    var act = t.getAttribute('data-act');
    if (act === 'tab') { ui.tab = t.getAttribute('data-tab'); render(); window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
    if (act === 'close') { closeSheet(); return; }
    if (act === 'rel-mode') { ui.relMode = t.getAttribute('data-mode'); render(); return; }
    if (act === 'zoom') { Graph.zoom(Number(t.getAttribute('data-dir'))); return; }
    if (act === 'fit') { Graph.fit(); return; }
    if (act === 'focus-outer') { Graph.focusOnly(!Graph.isFocusOnly()); return; }
    if (act === 'ring-filter') {
      Graph.setRingFilter(Number(t.getAttribute('data-ring')));
      updateRingUI(); return;
    }
    if (act === 'open-person') { openPerson(t.getAttribute('data-pid')); return; }
    if (act === 'add-person') { openPersonForm(); return; }
    if (act === 'edit-person') { openPersonForm(t.getAttribute('data-pid')); return; }
    if (act === 'add-gift') { closeSheet(); openGiftForm(null, t.getAttribute('data-pid') || (state.people[0] && state.people[0].id)); return; }
    if (act === 'edit-gift') { openGiftForm(t.getAttribute('data-gid')); return; }
    if (act === 'add-event') { closeSheet(); openEventForm(null, t.getAttribute('data-date')); return; }
    if (act === 'edit-event') { openEventForm(t.getAttribute('data-eid')); return; }
    if (act === 'add-story') { closeSheet(); openStoryForm(null); return; }
    if (act === 'edit-story') { openStoryForm(t.getAttribute('data-sid')); return; }
    if (act === 'story-pid') { ui.story.pid = t.getAttribute('data-pid'); renderStory(); return; }
    if (act === 'edit-me') { closeSheet(); openMeForm(); return; }
    if (act === 'share-center') { if (window.Share) Share.open('ledger'); return; }
    if (act === 'lf-dir') { ui.ledger.dir = t.getAttribute('data-dir'); renderLedger(); return; }
    if (act === 'cal-filter') { ui.cal.filter = t.getAttribute('data-ft'); renderCal(); return; }
    if (act === 'cal-move') {
      var delta = Number(t.getAttribute('data-delta'));
      var y = Number(ui.cal.ym.slice(0, 4)), m = Number(ui.cal.ym.slice(5)) - 1 + delta;
      var d = new Date(y, m, 1);
      ui.cal.ym = d.getFullYear() + '-' + U.pad(d.getMonth() + 1);
      var nowM = U.todayISO().slice(0, 7);
      ui.cal.sel = ui.cal.ym === nowM ? U.todayISO() : ui.cal.ym + '-01';
      renderCal(); return;
    }
    if (act === 'cal-today') { var now = new Date(); ui.cal.ym = now.getFullYear() + '-' + U.pad(now.getMonth() + 1); ui.cal.sel = U.todayISO(); renderCal(); return; }
    if (act === 'cal-select') {
      var ds = t.getAttribute('data-date');
      ui.cal.sel = ds;
      if (ds.slice(0, 7) !== ui.cal.ym) ui.cal.ym = ds.slice(0, 7);
      renderCal(); return;
    }
    if (act === 'set-theme') {
      var tid = t.getAttribute('data-theme');
      if (window.Auth) Auth.applyTheme(tid, true);
      renderSet(); toast('主题已切换'); return;
    }
    if (act === 'change-pwd') { openChangePwd(); return; }
    if (act === 'add-user') { if (Auth.isAdmin()) openAddUser(); return; }
    if (act === 'reset-user') {
      var uid = t.getAttribute('data-uid');
      var box = document.querySelector('[data-uid="' + uid + '"]');
      var nm = box ? (box.closest('.user-line').querySelector('.ul-name b').textContent) : '该用户';
      openResetUser(uid, nm); return;
    }
    if (act === 'del-user') {
      var did = t.getAttribute('data-uid');
      if (!confirm('确定删除这个账户？该账户将无法再登录。')) return;
      Auth.deleteUser(did, function (res) {
        if (!res.ok) return toast(res.msg || '删除失败');
        toast('账户已删除'); loadUserList();
      });
      return;
    }
    if (act === 'toggle-register') {
      var on = !t.classList.contains('on');
      Auth.setAllowRegister(on, function (res) {
        if (!res.ok) return toast(res.msg || '设置失败');
        t.classList.toggle('on', on); toast(on ? '已允许自助注册' : '已关闭自助注册');
      });
      return;
    }
    if (act === 'logout') { Auth.logout(); return; }
    if (act === 'data-path') { openPathSheet(); return; }
    if (act === 'export') { exportData(); return; }
    if (act === 'import') { importData(); return; }
    if (act === 'reset') { openResetSheet(); return; }
    if (act === 'demo') {
      if (!confirm('载入示例数据会覆盖当前内容，确定？')) return;
      state = U.clone(window.SEED);
      save(); render(); toast('示例数据已载入');
      return;
    }
  }

  function onChange(e) {
    var el = e.target;
    var act = el.getAttribute && el.getAttribute('data-act');
    if (act === 'lf-range') { ui.ledger.range = el.value; renderLedger(); }
    if (act === 'lf-pid') { ui.ledger.pid = el.value; renderLedger(); }
    if (act === 'date-part') { syncDateRow(el); return; }
    if (act === 'region-prov') { syncRegion(el); return; }
  }
  function onInput(e) {
    if (e.target.id === 'relSearch') {
      ui.q = e.target.value;
      var body = document.getElementById('listBody');
      if (body) body.innerHTML = listBody();
    }
  }

  /* ---------------- 启动 ---------------- */
  function boot() {
    // 先经过登录门禁，再初始化应用
    if (window.Auth && Auth.init) {
      Auth.init(startApp);
    } else {
      startApp();
    }
  }
  function startApp() {
    var app = document.getElementById('app');
    if (app) app.classList.remove('app-hidden');
    state = loadState();
    var now = new Date();
    ui.cal.ym = now.getFullYear() + '-' + U.pad(now.getMonth() + 1);
    ui.cal.sel = U.todayISO();
    buildNav();
    document.addEventListener('click', onClick);
    document.addEventListener('change', onChange);
    document.addEventListener('input', onInput);
    document.addEventListener('focusin', function (e) {
      var el = e.target;
      if (!el || !el.tagName) return;
      if (/^(INPUT|SELECT|TEXTAREA)$/.test(el.tagName)) keepFieldVisible(el);
    });
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', function () { syncKeyboard(); });
    }
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeSheet(); });
    render();
    pullRemote(true);
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden) pullRemote(false);
    });
    try { localStorage.setItem('__fn_t', '1'); localStorage.removeItem('__fn_t'); }
    catch (e) { setTimeout(function () { toast('当前打开方式无法保存数据，建议用应用中心打开'); }, 1200); }
    if (window.Share) Share.init({ toast: toast, getState: function () { return state; } });
    if (window.Share && location.hash.indexOf('s=') > -1) Share.openFromHash();
  }

  window.App = {
    openPerson: openPerson,
    openSheet: openSheet,
    closeSheet: closeSheet,
    toast: toast,
    upcoming: upcoming,
    updateFocusChip: updateFocusChip,
    onGraphLevelChange: function (lv) {
      ui.level = lv;
      var el = document.getElementById('zoomLabel');
      if (el) el.textContent = Graph.levels[lv].label + ' · ' + Graph.levels[lv].zoom;
      updateFocusChip();
    },
    render: render
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
