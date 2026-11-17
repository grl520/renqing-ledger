/* 人情往来 · 应用主逻辑 */
(function () {
  'use strict';
  var U = window.U;

  var state = null;
  var ui = {
    tab: 'rel',
    relMode: 'graph',
    level: 1,
    ledger: { dir: 'all', range: 'year', pid: 'all' },
    cal: { ym: '', sel: '', filter: 'all' },
    q: ''
  };

  var ETYPE = {
    birthday: { label: '生日', icon: '🎂', cls: 'birthday' },
    memorial: { label: '祭日', icon: '🕯️', cls: 'memorial' },
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

  function pushRemote() {
    if (!apiOK) return;
    try {
      fetch(apiUrl('/api/state'), {
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
    fetch(apiUrl('/api/state'), { cache: 'no-store' })
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
  // 上传头像：压缩后存到 NAS，返回可访问 URL
  function uploadAvatar(pid, file, cb) {
    if (!apiOK) { toast('请通过应用中心打开后再上传照片'); return; }
    if (!/^image\/(jpeg|png|gif|webp)$/.test(file.type)) { toast('只支持 JPG/PNG/GIF/WebP 图片'); return; }
    if (file.size > 6 * 1024 * 1024) { toast('图片请小于 6MB'); return; }
    var reader = new FileReader();
    reader.onload = function () {
      fetch(apiUrl('/api/avatar/' + encodeURIComponent(pid)), {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: reader.result })
      }).then(function (r) { return r.json(); }).then(function (res) {
        if (!res.ok) { toast(res.msg || '上传失败'); return; }
        cb(res.url);
      }).catch(function () { toast('上传失败，请重试'); });
    };
    reader.onerror = function () { toast('读取图片失败'); };
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
  function closeSheet() {
    var root = document.getElementById('modalRoot');
    root.classList.remove('open');
    root.innerHTML = '';
    document.body.classList.remove('locked');
  }

  /* ---------------- 导航 ---------------- */
  var TABS = [
    { id: 'rel', name: '关系', icon: '<svg viewBox="0 0 24 24"><circle cx="12" cy="5" r="2.6"/><circle cx="5" cy="18" r="2.6"/><circle cx="19" cy="18" r="2.6"/><path d="M12 7.6v3.2M10.2 12.6 6.6 16M13.8 12.6 17.4 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>' },
    { id: 'ledger', name: '礼金', icon: '<svg viewBox="0 0 24 24"><path d="M5 4.5h11.5A2.5 2.5 0 0 1 19 7v12.5H7A2 2 0 0 1 5 17.5z" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M8.5 9h7M8.5 12.5h4.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>' },
    { id: 'cal', name: '日历', icon: '<svg viewBox="0 0 24 24"><rect x="4" y="5.5" width="16" height="14" rx="2.5" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M4 10h16M8.5 4v3.2M15.5 4v3.2" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>' },
    { id: 'me', name: '我的', icon: '<svg viewBox="0 0 24 24"><circle cx="12" cy="8.5" r="3.4" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M5.5 19.5c1.2-3.4 3.7-5 6.5-5s5.3 1.6 6.5 5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>' }
  ];

  function buildNav() {
    var side = TABS.map(function (t) {
      return '<button class="nav-item" data-act="tab" data-tab="' + t.id + '">' + t.icon + '<span>' + t.name + '</span></button>';
    }).join('');
    document.getElementById('sideNav').innerHTML = side;
    document.getElementById('tabbar').innerHTML = TABS.map(function (t) {
      return '<button class="tab-item" data-act="tab" data-tab="' + t.id + '">' + t.icon + '<span>' + t.name + '</span></button>';
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
    else renderMe();
  }

  /* ---------------- 关系页 ---------------- */
  function renderRel() {
    var v = document.getElementById('view-rel');
    var c = ringCounts();
    var t = allTotals();
    var head = pageHead('关系网络',
      c.total + ' 位亲友 · 至亲 ' + c[1] + ' · 亲友 ' + c[2] + ' · 朋友 ' + c[3],
      '<button class="btn ghost" data-act="help">怎么看图</button>' +
      '<button class="btn ghost" data-act="share" data-type="net">分享</button>' +
      '<button class="btn" data-act="add-person">添加亲友</button>');

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
    if (!found) html += '<div class="empty">没找到「' + U.esc(q) + '」</div>';
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
      '<button class="btn ghost" data-act="share" data-type="ledger">分享</button>' +
      '<button class="btn" data-act="add-gift">记一笔</button>');

    var stats = '<div class="stat-row">' +
      '<div class="stat in"><span>收礼</span><b>' + U.money(tin) + '</b><em>' + list.filter(function (g) { return g.dir === 'in'; }).length + ' 笔</em></div>' +
      '<div class="stat out"><span>送礼</span><b>' + U.money(tout) + '</b><em>' + list.filter(function (g) { return g.dir === 'out'; }).length + ' 笔</em></div>' +
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
    if (!list.length) rows = '<div class="empty">这段时间还没有记录<br><button class="btn small" data-act="add-gift">记第一笔</button></div>';

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
      '<button class="btn ghost" data-act="share" data-type="cal">分享</button>' +
      '<button class="btn" data-act="add-event">加事项</button>');

    var chips = '<div class="filter-bar"><div class="seg small">' +
      [['all', '全部'], ['birthday', '生日'], ['memorial', '祭日'], ['banquet', '宴请'], ['custom', '事项']].map(function (x) {
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
      '<span><i class="dot birthday"></i>生日</span><span><i class="dot memorial"></i>祭日</span>' +
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
    }).join('') || '<div class="empty">未来 60 天没有事项</div>';

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
    fetch(apiUrl('/api/path')).then(function (r) { return r.json(); }).then(function (info) {
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
        fetch(apiUrl('/api/path'), {
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
    fetch(apiUrl('/api/path')).then(function (r) { return r.json(); }).then(function (info) {
      if (info && info.dataDir) el.textContent = info.dataDir;
    }).catch(function () { });
  }

  function renderMe() {
    var v = document.getElementById('view-me');
    var me = state.me;
    var t = allTotals();
    var c = ringCounts();
    var wife = me.spouseId ? person(me.spouseId) : null;
    var daysToBd = me.birthday ? U.daysToMD(me.birthday.slice(5)) : null;

    var html = '<div class="page">' +
      pageHead('我的', '数据保存在 NAS，多设备实时同步', '<button class="btn ghost" data-act="share-center">分享中心</button>') +
      '<div class="me-card">' +
      '<div class="me-top">' +
      '<span class="ava me-ava">' + me.emoji + '<i class="me-ring"></i></span>' +
      '<div class="me-info"><h2>' + U.esc(me.nick || me.name) + '</h2>' +
      '<p>' + U.esc(me.name) + (me.hometown ? ' · ' + U.esc(me.hometown) : '') + (wife ? ' · 与' + U.esc(wife.name) + '共同记账' : '') + '</p>' +
      '<span class="me-motto">' + U.esc(me.motto || '') + '</span></div>' +
      '<button class="icon-btn" data-act="edit-me">编辑</button>' +
      '</div>' +
      '<div class="me-grid">' +
      '<div><b>' + c.total + '</b><span>亲友</span></div>' +
      '<div><b>' + t.count + '</b><span>往来笔数</span></div>' +
      '<div><b class="c-in">' + U.money(t.in) + '</b><span>累计收</span></div>' +
      '<div><b class="c-out">' + U.money(t.out) + '</b><span>累计送</span></div>' +
      '</div>' +
      '<div class="me-meta">' +
      (me.birthday ? '<span>🎂 ' + U.cnDate(me.birthday) + ' · ' + (daysToBd === 0 ? '今天生日' : daysToBd + ' 天后') + '</span>' : '') +
      (me.since ? '<span>💍 结婚纪念 ' + U.cnDate(me.since) + '</span>' : '') +
      (me.phone ? '<span>📱 ' + me.phone + '</span>' : '') +
      '</div></div>' +

      '<div class="sec-title"><span>分享</span><em>选择性把台账或关系分享给家人</em></div>' +
      '<div class="tile-row">' +
      '<button class="tile" data-act="share" data-type="ledger"><b>礼金台账</b><em>按类型、时间、人员筛选</em></button>' +
      '<button class="tile" data-act="share" data-type="net"><b>人际关系</b><em>圈层与往来概览</em></button>' +
      '<button class="tile" data-act="share" data-type="people"><b>人员信息</b><em>勾选亲友档案</em></button>' +
      '</div>' +

      '<div class="sec-title"><span>数据</span><em>建议每月导出一次备份</em></div>' +
      '<div class="set-list">' +
      '<button class="set-row" data-act="data-path"><b>数据保存路径</b><em id="pathHint">点击查看详情与切换</em><span>›</span></button>' +
      '<button class="set-row" data-act="export"><b>导出备份</b><em>生成 JSON 文件</em><span>›</span></button>' +
      '<button class="set-row" data-act="import"><b>导入备份</b><em>从 JSON 恢复</em><span>›</span></button>' +
      '<button class="set-row" data-act="demo"><b>载入示例数据</b><em>看看完整演示</em><span>›</span></button>' +
      '<button class="set-row danger" data-act="reset"><b>清空并重新开始</b><em>删除本机全部亲友与礼金</em><span>›</span></button>' +
      '</div>' +
      '<div class="foot-note">人情往来 · v3<br>数据保存在 NAS；换设备或卸载前请先导出备份</div>' +
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
      footer: '<button class="btn ghost" data-act="share-person" data-pid="' + p.id + '">分享档案</button>' +
        '<button class="btn ghost" data-act="edit-person" data-pid="' + p.id + '">编辑</button>' +
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
      (me.address ? '<div><span>地址</span><b>' + U.esc(me.address) + '</b></div>' : '') +
      '</div>';
    openSheet({
      title: '', cls: 'person-sheet', body: body,
      footer: '<button class="btn ghost" data-act="share" data-type="people">分享我的信息</button>' +
        '<button class="btn" data-act="edit-me">编辑资料</button>'
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
      '<label class="field"><span>生日</span><input class="input" type="date" name="birthday" value="' + (p && p.birthday ? p.birthday : '') + '"></label></div>' +
      '<div class="field-2">' +
      '<label class="field"><span>配偶</span><select class="select" name="spouseId">' + personOptions(p ? p.spouseId : '', true) + '</select></label>' +
      '<label class="field"><span>通过谁认识</span><select class="select" name="via">' + personOptions(p ? p.via : 'me', true) + '</select></label></div>' +
      '<div class="field-2">' +
      '<label class="field"><span>手机号码</span><input class="input" type="tel" name="phone" value="' + U.esc(p ? p.phone : '') + '" placeholder="选填"></label>' +
      '<label class="field"><span>忌日</span><input class="input" type="date" name="deathday" value="' + (p && p.deathday ? p.deathday : '') + '"></label></div>' +
      '<label class="field"><span>地址</span><input class="input" name="address" value="' + U.esc(p ? p.address : '') + '" placeholder="家庭住址或所在城市，选填"></label>' +
      '<label class="field"><span>标签</span><input class="input" name="tags" value="' + U.esc(p && p.tags ? p.tags.join('、') : '') + '" placeholder="用、分隔，如：爱下棋、在深圳"></label>' +
      '<label class="field"><span>备注</span><textarea class="input" name="note" rows="2" placeholder="想记住的细节">' + U.esc(p ? p.note : '') + '</textarea></label>' +
      '</div>';
    var footer = (isNew ? '' : '<button class="btn ghost danger" data-del="' + pid + '">删除</button>') +
      '<button class="btn" data-save="1">保存</button>';
    var root = openSheet({ title: isNew ? '添加亲友' : '编辑资料', sub: isNew ? '存下来，礼金和日历都会自动关联' : '', body: body, footer: footer });
    root.querySelector('[data-save]').addEventListener('click', function () {
      var f = root;
      var data = {
        name: f.querySelector('[name=name]').value.trim(),
        relation: f.querySelector('[name=relation]').value.trim() || '亲友',
        ring: Number(f.querySelector('[name=ring]').value),
        emoji: f.querySelector('[name=emoji]').value.trim() || '🙂',
        birthday: f.querySelector('[name=birthday]').value,
        deathday: f.querySelector('[name=deathday]').value,
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
      '<label class="field"><span>日期</span><input class="input" type="date" name="date" value="' + (g ? g.date : U.todayISO()) + '"></label></div>' +
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
        date: root.querySelector('[name=date]').value || U.todayISO(),
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
      [['banquet', '宴请 / 红白事'], ['birthday', '生日'], ['memorial', '祭日'], ['custom', '其他事项']].map(function (x) {
        return '<option value="' + x[0] + '"' + ((e ? e.type : 'banquet') === x[0] ? ' selected' : '') + '>' + x[1] + '</option>';
      }).join('') + '</select></label>' +
      '<label class="field"><span>日期</span><input class="input" type="date" name="date" value="' + (e ? e.date : (date || U.todayISO())) + '"></label></div>' +
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
        date: root.querySelector('[name=date]').value || U.todayISO(),
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

  function openMeForm() {
    var me = state.me;
    var body = '<div class="form">' +
      '<div class="field-2"><label class="field"><span>昵称</span><input class="input" name="nick" value="' + U.esc(me.nick || '') + '"></label>' +
      '<label class="field"><span>姓名</span><input class="input" name="name" value="' + U.esc(me.name || '') + '"></label></div>' +
      '<div class="field-2"><label class="field"><span>头像</span><input class="input" name="emoji" maxlength="4" value="' + U.esc(me.emoji || '🎁') + '"></label>' +
      '<label class="field"><span>生日</span><input class="input" type="date" name="birthday" value="' + (me.birthday || '') + '"></label></div>' +
      '<div class="field-2"><label class="field"><span>结婚纪念日</span><input class="input" type="date" name="since" value="' + (me.since || '') + '"></label>' +
      '<label class="field"><span>手机号码</span><input class="input" type="tel" name="phone" value="' + U.esc(me.phone || '') + '"></label></div>' +
      '<label class="field"><span>地址</span><input class="input" name="address" value="' + U.esc(me.address || '') + '" placeholder="家庭住址或所在城市"></label>' +
      '<label class="field"><span>家乡</span><input class="input" name="hometown" value="' + U.esc(me.hometown || '') + '"></label>' +
      '<label class="field"><span>一句话</span><input class="input" name="motto" value="' + U.esc(me.motto || '') + '"></label>' +
      '</div>';
    var root = openSheet({ title: '编辑我的资料', body: body, footer: '<button class="btn" data-save="1">保存</button>' });
    root.querySelector('[data-save]').addEventListener('click', function () {
      ['nick', 'name', 'emoji', 'birthday', 'since', 'phone', 'address', 'hometown', 'motto'].forEach(function (k) {
        me[k] = root.querySelector('[name=' + k + ']').value.trim();
      });
      save(); closeSheet(); render(); toast('已更新');
    });
  }

  /* ---------------- 帮助 ---------------- */
  function openHelp() {
    var body = '<div class="help">' +
      '<p class="help-lead">这张图不是通讯录，而是「谁和你有往来」的关系地图。</p>' +
      '<div class="help-item"><b>直接关系</b><p>你本人直接认识、直接有礼金往来的人。实线连到你身上。</p></div>' +
      '<div class="help-item"><b>间接关系</b><p>你不熟，是通过家人或朋友才认识的人。虚线中间会标明「经谁」。比如「邻居刘洋」是「经李伟」认识的。</p></div>' +
      '<div class="help-item"><b>三个圈层</b><p>至亲＝家人和直系亲属；亲友＝亲戚、家族长辈；朋友＝朋友、同事、邻里。圈子越靠里，往来越密。</p></div>' +
      '<div class="help-item"><b>放大 / 缩小</b><p>缩到 70% 只看名字和头像，一眼看清全貌；放大到 135% 会显示收送金额、最近一次往来和标签，同时聚焦到至亲与亲友。</p></div>' +
      '<div class="help-item"><b>夫妻爱心</b><p>夫妻两人会靠在一起，中间的大爱心表示两口子是一户，随礼通常只算一份。</p></div>' +
      '</div>';
    openSheet({ title: '怎么看这张关系图', body: body, footer: '<button class="btn" data-act="close">明白了</button>' });
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
    if (act === 'edit-me') { closeSheet(); openMeForm(); return; }
    if (act === 'help') { openHelp(); return; }
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
    if (act === 'share') {
      var stype = t.getAttribute('data-type') || 'ledger';
      var sopts = stype === 'ledger' ? { dir: ui.ledger.dir, range: ui.ledger.range, pid: ui.ledger.pid } : null;
      Share.open(stype, sopts); return;
    }
    if (act === 'share-center') { Share.open('ledger'); return; }
    if (act === 'share-person') { Share.open('people', { pids: [t.getAttribute('data-pid')] }); return; }
    if (act === 'data-path') { openPathSheet(); return; }
    if (act === 'export') { exportData(); return; }
    if (act === 'import') { importData(); return; }
    if (act === 'reset') {
      if (!confirm('清空后，本机保存的亲友、礼金与日历事项都会删除，确定？')) return;
      state = { me: state.me, people: [], gifts: [], events: [] };
      ui.ledger.pid = 'all'; ui.q = '';
      save(); render(); toast('已清空，开始记自己的吧');
      return;
    }
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
    state = loadState();
    var now = new Date();
    ui.cal.ym = now.getFullYear() + '-' + U.pad(now.getMonth() + 1);
    ui.cal.sel = U.todayISO();
    buildNav();
    document.addEventListener('click', onClick);
    document.addEventListener('change', onChange);
    document.addEventListener('input', onInput);
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
