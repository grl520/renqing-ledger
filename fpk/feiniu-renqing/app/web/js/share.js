/* 人情往来 · 分享模块 */
window.Share = (function () {
  'use strict';
  var U = window.U;
  var ctx = {};
  var S = { type: 'ledger', dir: 'all', range: 'year', pid: 'all', hideAmount: false, pids: [], withPhone: false };
  var spec = null;

  var RANGE_LABEL = { year: '今年', y3: '近三年', all: '全部' };
  var DIR_LABEL = { all: '全部往来', in: '只看收礼', out: '只看送礼' };

  function init(c) { ctx = c; }

  /* ---------- 生成分享内容 ---------- */
  function ledgerList() {
    var st = ctx.getState(), now = new Date();
    return st.gifts.filter(function (g) {
      if (S.dir !== 'all' && g.dir !== S.dir) return false;
      if (S.pid !== 'all' && g.pid !== S.pid) return false;
      var d = U.parse(g.date);
      if (S.range === 'year' && d.getFullYear() !== now.getFullYear()) return false;
      if (S.range === 'y3' && d.getFullYear() < now.getFullYear() - 2) return false;
      return true;
    }).sort(function (a, b) { return a.date < b.date ? 1 : -1; });
  }

  function build() {
    var st = ctx.getState();
    var me = st.me;
    var by = me.nick || me.name;
    var now = new Date();
    var dateStr = U.cnDateFull(U.todayISO());

    if (S.type === 'ledger') {
      var list = ledgerList();
      var tin = 0, tout = 0;
      list.forEach(function (g) { if (g.dir === 'in') tin += g.amount; else tout += g.amount; });
      var person = S.pid !== 'all' ? st.people.filter(function (p) { return p.id === S.pid; })[0] : null;
      var sub = [RANGE_LABEL[S.range], DIR_LABEL[S.dir], person ? person.name : null, list.length + ' 笔'].filter(Boolean).join(' · ');
      var rows = list.slice(0, 9).map(function (g) {
        var p = st.people.filter(function (x) { return x.id === g.pid; })[0];
        return {
          a: U.md(g.date),
          b: (p ? p.name : '—') + ' · ' + g.occ,
          c: S.hideAmount ? (g.dir === 'in' ? '收' : '送') : (g.dir === 'in' ? '+' : '−') + U.money(g.amount)
        };
      });
      if (list.length > 9) rows.push({ a: '…', b: '还有 ' + (list.length - 9) + ' 笔未展示', c: '' });
      return {
        kind: 'ledger', by: by, title: person ? (person.name + ' 的礼金') : '礼金台账', sub: sub,
        stats: [
          { k: '收礼', v: S.hideAmount ? '***' : U.money(tin) },
          { k: '送礼', v: S.hideAmount ? '***' : U.money(tout) },
          { k: '净往来', v: S.hideAmount ? '***' : (tin - tout >= 0 ? '+' : '−') + U.money(Math.abs(tin - tout)) }
        ],
        rows: rows,
        note: S.hideAmount ? '按对方要求，具体金额已隐藏' : '台账由本人手工记录，仅供家人核对',
        foot: dateStr
      };
    }

    if (S.type === 'cal') {
      var ups = (window.App && window.App.upcoming) ? window.App.upcoming(45) : [];
      var types = { birthday: '生日', memorial: '祭日', banquet: '宴请', custom: '事项' };
      var cnt = { birthday: 0, memorial: 0, banquet: 0, custom: 0 };
      ups.forEach(function (it) { cnt[it.type] = (cnt[it.type] || 0) + 1; });
      var rowsC = ups.slice(0, 9).map(function (it) {
        return { a: U.md(it.date), b: it.title + (it.meta ? ' · ' + it.meta : ''), c: types[it.type] || '事项' };
      });
      if (ups.length > 9) rowsC.push({ a: '…', b: '还有 ' + (ups.length - 9) + ' 件事', c: '' });
      return {
        kind: 'cal', by: by, title: '人情日历',
        sub: '未来 45 天 · ' + ups.length + ' 件要记得的日子',
        stats: [
          { k: '生日', v: cnt.birthday + ' 个' },
          { k: '祭日', v: cnt.memorial + ' 个' },
          { k: '宴请', v: (cnt.banquet + cnt.custom) + ' 件' }
        ],
        rows: rowsC.length ? rowsC : [{ a: '—', b: '未来 45 天没有安排', c: '' }],
        note: '生日与忌日由亲友档案自动生成，事项为手工添加',
        foot: dateStr
      };
    }

    if (S.type === 'net') {
      var c = { 1: 0, 2: 0, 3: 0 };
      st.people.forEach(function (p) { c[p.ring || 3]++; });
      var t = { in: 0, out: 0, count: st.gifts.length };
      st.gifts.forEach(function (g) { if (g.dir === 'in') t.in += g.amount; else t.out += g.amount; });
      var ranked = st.people.map(function (p) {
        var s = 0; st.gifts.forEach(function (g) { if (g.pid === p.id) s += g.amount; });
        return { p: p, sum: s };
      }).sort(function (a, b) { return b.sum - a.sum; }).slice(0, 5);
      var rows = [
        { a: '至亲', b: '家人与直系亲属', c: c[1] + ' 人' },
        { a: '亲友', b: '亲戚与家族长辈', c: c[2] + ' 人' },
        { a: '朋友', b: '朋友、同事、邻里', c: c[3] + ' 人' }
      ].concat(ranked.filter(function (x) { return x.sum > 0; }).map(function (x) {
        return { a: x.p.name, b: x.p.relation + ' · 往来最密', c: U.money(x.sum) };
      }));
      return {
        kind: 'net', by: by, title: '我的关系网络', sub: st.people.length + ' 位亲友 · ' + t.count + ' 笔往来',
        stats: [
          { k: '亲友总数', v: st.people.length + ' 位' },
          { k: '累计收礼', v: U.money(t.in) },
          { k: '累计送礼', v: U.money(t.out) }
        ],
        rows: rows,
        note: '关系图与圈层划分由本人维护',
        foot: dateStr
      };
    }

    // people
    var picked = st.people.filter(function (p) { return S.pids.indexOf(p.id) >= 0; });
    var rowsP = picked.map(function (p) {
      return {
        a: p.name,
        b: p.relation + (p.birthday ? ' · 生日 ' + U.md(p.birthday) : '') +
           (S.withPhone ? (p.phone ? ' · ' + p.phone : '') + (p.address ? ' · ' + p.address : '') : ''),
        c: window.RINGS[p.ring || 3].name
      };
    });
    return {
      kind: 'people', by: by, title: '亲友档案', sub: picked.length + ' 位亲友' + (S.withPhone ? ' · 含联系方式' : ''),
      stats: [
        { k: '人数', v: picked.length + ' 位' },
        { k: '至亲', v: picked.filter(function (p) { return (p.ring || 3) === 1; }).length + ' 位' },
        { k: '朋友', v: picked.filter(function (p) { return (p.ring || 3) === 3; }).length + ' 位' }
      ],
      rows: rowsP.length ? rowsP : [{ a: '—', b: '还没有勾选亲友', c: '' }],
      note: '档案由本人整理，收到后请勿外传',
      foot: dateStr
    };
  }

  /* ---------- 海报 HTML ---------- */
  function posterHTML(sp) {
    return '<div class="poster">' +
      '<div class="p-top"><span class="p-brand">飞 牛 人 情 往 来</span><span class="p-kind">' +
      (sp.kind === 'ledger' ? '台账' : sp.kind === 'net' ? '关系' : sp.kind === 'cal' ? '日历' : '档案') + '</span></div>' +
      '<h2>' + U.esc(sp.title) + '</h2>' +
      '<p class="p-sub">' + U.esc(sp.sub) + '</p>' +
      '<div class="p-stats">' + sp.stats.map(function (s) {
        return '<div><em>' + U.esc(s.k) + '</em><b>' + U.esc(s.v) + '</b></div>';
      }).join('') + '</div>' +
      '<div class="p-rows">' + sp.rows.map(function (r) {
        return '<div class="p-row"><span class="pa">' + U.esc(r.a) + '</span><span class="pb">' + U.esc(r.b) + '</span><span class="pc">' + U.esc(r.c || '') + '</span></div>';
      }).join('') + '</div>' +
      '<div class="p-note">' + U.esc(sp.note || '') + '</div>' +
      '<div class="p-foot"><span>' + U.esc(sp.foot) + ' · ' + U.esc(sp.by) + ' 分享</span><i class="p-seal">往来</i></div>' +
      '</div>';
  }

  function fitPoster(holder) {
    var poster = holder.querySelector('.poster');
    if (!poster) return;
    var w = holder.clientWidth || 320;
    var s = Math.min(1, w / 640);
    poster.style.transform = 'scale(' + s + ')';
    holder.style.height = Math.ceil(poster.offsetHeight * s) + 'px';
  }

  /* ---------- 画布导出 ---------- */
  function rr(g, x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  }
  function clip(g, text, maxW) {
    var s = String(text);
    if (g.measureText(s).width <= maxW) return s;
    while (s.length && g.measureText(s + '…').width > maxW) s = s.slice(0, -1);
    return s + '…';
  }

  function canvasFor(sp) {
    var W = 720, H = 318 + sp.rows.length * 64 + 78;
    var cv = document.createElement('canvas');
    cv.width = W * 2; cv.height = H * 2;
    var g = cv.getContext('2d');
    g.scale(2, 2);
    g.fillStyle = '#FBF7F0'; g.fillRect(0, 0, W, H);
    rr(g, 14, 14, W - 28, H - 28, 24); g.fillStyle = '#FFFDF8'; g.fill();
    g.strokeStyle = '#EADFC9'; g.lineWidth = 1.5; g.stroke();

    var x = 56;
    g.fillStyle = '#B23A2E';
    g.font = '600 13px "PingFang SC","Microsoft YaHei",sans-serif';
    g.fillText('飞 牛 人 情 往 来', x, 66);

    g.fillStyle = '#2A2521';
    g.font = '700 34px "Songti SC","Noto Serif SC",serif';
    g.fillText(sp.title, x, 118);

    g.fillStyle = '#8B7F71';
    g.font = '400 15px "PingFang SC","Microsoft YaHei",sans-serif';
    g.fillText(clip(g, sp.sub, W - 132), x, 148);

    g.strokeStyle = '#EFE4D3'; g.lineWidth = 1;
    g.beginPath(); g.moveTo(x, 172); g.lineTo(W - 56, 172); g.stroke();

    var colW = (W - 112) / 3;
    sp.stats.forEach(function (s, i) {
      var cx = x + colW * i;
      g.fillStyle = '#9A8F82';
      g.font = '400 13px "PingFang SC","Microsoft YaHei",sans-serif';
      g.fillText(s.k, cx, 202);
      g.fillStyle = i === 0 ? '#B23A2E' : i === 1 ? '#3F6B57' : '#2A2521';
      g.font = '700 26px "Songti SC","Noto Serif SC",serif';
      g.fillText(s.v, cx, 236);
    });

    var y = 280;
    sp.rows.forEach(function (r) {
      g.strokeStyle = '#F4EDE1'; g.lineWidth = 1;
      g.beginPath(); g.moveTo(x, y - 26); g.lineTo(W - 56, y - 26); g.stroke();
      g.fillStyle = '#8B7F71';
      g.font = '500 14px "PingFang SC","Microsoft YaHei",sans-serif';
      g.fillText(clip(g, r.a, 74), x, y);
      g.fillStyle = '#3A332C';
      g.font = '400 14px "PingFang SC","Microsoft YaHei",sans-serif';
      g.fillText(clip(g, r.b, 340), x + 88, y);
      g.fillStyle = '#2A2521';
      g.textAlign = 'right';
      g.font = '600 15px "PingFang SC","Microsoft YaHei",sans-serif';
      g.fillText(r.c || '', W - 56, y);
      g.textAlign = 'left';
      y += 64;
    });

    g.fillStyle = '#A79B8C';
    g.font = '400 12px "PingFang SC","Microsoft YaHei",sans-serif';
    g.fillText(clip(g, sp.note || '', W - 200), x, H - 58);

    // 印章
    g.beginPath(); g.arc(W - 88, H - 62, 28, 0, Math.PI * 2);
    g.fillStyle = '#B23A2E'; g.fill();
    g.strokeStyle = 'rgba(255,255,255,.55)'; g.lineWidth = 2;
    g.beginPath(); g.arc(W - 88, H - 62, 23, 0, Math.PI * 2); g.stroke();
    g.fillStyle = '#fff'; g.textAlign = 'center';
    g.font = '700 15px "Songti SC","Noto Serif SC",serif';
    g.fillText('往来', W - 88, H - 56);
    g.textAlign = 'left';

    g.fillStyle = '#B0A395';
    g.font = '400 11px "PingFang SC","Microsoft YaHei",sans-serif';
    g.fillText(sp.foot + ' · ' + sp.by + ' 分享', x, H - 52);
    return cv;
  }

  function download() {
    if (!spec) return;
    canvasFor(spec).toBlob(function (blob) {
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = '人情往来-' + spec.title + '-' + U.todayISO() + '.png';
      a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 3000);
      ctx.toast('图片已保存');
    }, 'image/png');
  }

  /* ---------- 链接编解码 ---------- */
  function enc(o) {
    var s = JSON.stringify(o);
    var bytes = new TextEncoder().encode(s);
    var bin = '';
    for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function dec(str) {
    var b = str.replace(/-/g, '+').replace(/_/g, '/');
    var bin = atob(b);
    var bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return JSON.parse(new TextDecoder().decode(bytes));
  }
  function makeLink() {
    if (!spec) return '';
    var base = location.href.split('#')[0];
    return base + '#s=' + enc(spec);
  }

  function copy(text, okMsg) {
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(function () { ctx.toast(okMsg); }, fallback);
    } else fallback();
    function fallback() {
      var ta = document.createElement('textarea');
      ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); ctx.toast(okMsg); } catch (e) { ctx.toast('复制失败，请手动选择'); }
      document.body.removeChild(ta);
    }
  }

  function textOf(sp) {
    var lines = [sp.title, sp.sub, ''];
    lines.push(sp.stats.map(function (s) { return s.k + ' ' + s.v; }).join(' ｜ '));
    lines.push('');
    sp.rows.forEach(function (r) { lines.push([r.a, r.b, r.c].filter(Boolean).join('  ')); });
    lines.push('');
    lines.push(sp.note || '');
    lines.push('—— 人情往来 · ' + sp.by + ' 分享于 ' + sp.foot);
    return lines.join('\n');
  }

  /* ---------- 分享面板 ---------- */
  function open(type, opts) {
    S = { type: type || 'ledger', dir: 'all', range: 'year', pid: 'all', hideAmount: false, pids: [], withPhone: false };
    if (opts) {
      ['dir', 'range', 'pid', 'hideAmount', 'withPhone'].forEach(function (k) {
        if (opts[k] != null) S[k] = opts[k];
      });
      if (opts.pids) S.pids = opts.pids.slice();
    }
    if (S.type === 'people' && !S.pids.length) {
      S.pids = ctx.getState().people.slice(0, 6).map(function (p) { return p.id; });
    }
    window.App.openSheet({
      title: '分享', sub: '只分享你勾选的部分，数据不会上传',
      cls: 'share-sheet', body: '<div id="shareBody"></div>', footer: '',
      onMount: function () { refresh(); }
    });
  }

  function refresh() {
    var body = document.getElementById('shareBody');
    if (!body) return;
    spec = build();
    var st = ctx.getState();

    var typeSeg = '<div class="seg big">' +
      [['ledger', '礼金台账'], ['net', '人际关系'], ['people', '人员信息'], ['cal', '人情日历']].map(function (x) {
        return '<button data-sh-type="' + x[0] + '" class="' + (S.type === x[0] ? 'on' : '') + '">' + x[1] + '</button>';
      }).join('') + '</div>';

    var options = '';
    if (S.type === 'ledger') {
      options = '<div class="share-opts">' +
        '<div class="seg small">' + [['all', '全部'], ['in', '只看收礼'], ['out', '只看送礼']].map(function (x) {
          return '<button data-sh-dir="' + x[0] + '" class="' + (S.dir === x[0] ? 'on' : '') + '">' + x[1] + '</button>';
        }).join('') + '</div>' +
        '<div class="opt-row">' +
        '<select class="select" data-sh-opt="range">' + ['year', 'y3', 'all'].map(function (r) {
          return '<option value="' + r + '"' + (S.range === r ? ' selected' : '') + '>' + RANGE_LABEL[r] + '</option>';
        }).join('') + '</select>' +
        '<select class="select" data-sh-opt="pid"><option value="all">全部人员</option>' +
        st.people.map(function (p) { return '<option value="' + p.id + '"' + (S.pid === p.id ? ' selected' : '') + '>' + U.esc(p.name) + '</option>'; }).join('') +
        '</select></div>' +
        '<label class="check"><input type="checkbox" data-sh-flag="hideAmount"' + (S.hideAmount ? ' checked' : '') + '><span>隐藏具体金额（只显示收 / 送）</span></label>' +
        '</div>';
    } else if (S.type === 'people') {
      options = '<div class="share-opts">' +
        '<div class="pick-head"><span>勾选要分享的亲友（' + S.pids.length + '）</span>' +
        '<span class="pick-act"><b data-pick="all">全选</b><b data-pick="none">清空</b></span></div>' +
        '<div class="pick-list">' + st.people.map(function (p) {
          return '<label class="pick"><input type="checkbox" data-pick-pid="' + p.id + '"' + (S.pids.indexOf(p.id) >= 0 ? ' checked' : '') + '>' +
            '<span class="ava sm">' + (p.emoji || '🙂') + '</span><span>' + U.esc(p.name) + '<em>' + U.esc(p.relation) + '</em></span></label>';
        }).join('') + '</div>' +
        '<label class="check"><input type="checkbox" data-sh-flag="withPhone"' + (S.withPhone ? ' checked' : '') + '><span>带上联系方式（手机 · 地址）</span></label>' +
        '</div>';
    } else if (S.type === 'cal') {
      options = '<div class="share-opts"><p class="opt-note">把未来 45 天的生日、忌日、宴请发给家人，省得每次都问「今年谁过寿」。</p></div>';
    } else {
      options = '<div class="share-opts"><p class="opt-note">分享后会展示圈层分布，以及往来最密切的几位亲友（不含具体日期与备注）。</p></div>';
    }

    body.innerHTML = typeSeg + options +
      '<div class="share-preview"><div class="sp-head"><span>预览</span><em>长按或下载可保存</em></div>' +
      '<div class="poster-holder" id="posterHolder">' + posterHTML(spec) + '</div></div>' +
      '<div class="share-actions">' +
      '<button class="btn ghost" data-sh="copy">复制文案</button>' +
      '<button class="btn ghost" data-sh="img">存为图片</button>' +
      '<button class="btn ghost" data-sh="link">复制链接</button>' +
      '<button class="btn" data-sh="native">系统分享</button>' +
      '</div>' +
      '<p class="share-tip">发到微信最稳妥的是「存为图片」；链接需要应用已发布到线上才打得开。</p>';

    fitPoster(document.getElementById('posterHolder'));
    bind();
  }

  function bind() {
    var body = document.getElementById('shareBody');
    if (!body) return;
    body.querySelectorAll('[data-sh-type]').forEach(function (b) {
      b.addEventListener('click', function () {
        S.type = b.getAttribute('data-sh-type');
        if (S.type === 'people' && !S.pids.length) {
          S.pids = ctx.getState().people.slice(0, 6).map(function (p) { return p.id; });
        }
        refresh();
      });
    });
    body.querySelectorAll('[data-sh-dir]').forEach(function (b) {
      b.addEventListener('click', function () { S.dir = b.getAttribute('data-sh-dir'); refresh(); });
    });
    body.querySelectorAll('[data-sh-opt]').forEach(function (s) {
      s.addEventListener('change', function () { S[s.getAttribute('data-sh-opt')] = s.value; refresh(); });
    });
    body.querySelectorAll('[data-sh-flag]').forEach(function (c) {
      c.addEventListener('change', function () { S[c.getAttribute('data-sh-flag')] = c.checked; refresh(); });
    });
    body.querySelectorAll('[data-pick-pid]').forEach(function (c) {
      c.addEventListener('change', function () {
        var pid = c.getAttribute('data-pick-pid');
        var i = S.pids.indexOf(pid);
        if (c.checked && i < 0) S.pids.push(pid);
        if (!c.checked && i >= 0) S.pids.splice(i, 1);
        refresh();
      });
    });
    body.querySelectorAll('[data-pick]').forEach(function (b) {
      b.addEventListener('click', function () {
        var all = ctx.getState().people;
        S.pids = b.getAttribute('data-pick') === 'all' ? all.map(function (p) { return p.id; }) : [];
        refresh();
      });
    });
    body.querySelectorAll('[data-sh]').forEach(function (b) {
      b.addEventListener('click', function () {
        var k = b.getAttribute('data-sh');
        if (k === 'copy') copy(textOf(spec), '文案已复制');
        if (k === 'img') download();
        if (k === 'link') copy(makeLink(), '链接已复制，发给家人即可查看');
        if (k === 'native') {
          if (navigator.share) {
            navigator.share({ title: spec.title, text: textOf(spec), url: makeLink() }).catch(function () { });
          } else copy(textOf(spec), '当前浏览器不支持系统分享，已复制文案');
        }
      });
    });
  }

  /* ---------- 独立分享页 ---------- */
  function openFromHash() {
    var m = location.hash.match(/s=([^&]+)/);
    if (!m) return false;
    var sp;
    try { sp = dec(m[1]); } catch (e) { return false; }
    if (!sp || !sp.rows) return false;
    var el = document.getElementById('shareView');
    el.hidden = false;
    el.innerHTML = '<div class="sv-inner">' +
      '<div class="sv-head"><span>有人给你分享了一份记录</span><button class="icon-btn" id="svClose">✕</button></div>' +
      '<div class="poster-holder" id="svHolder">' + posterHTML(sp) + '</div>' +
      '<div class="share-actions">' +
      '<button class="btn ghost" id="svImg">保存图片</button>' +
      '<button class="btn ghost" id="svCopy">复制文字</button>' +
      '<button class="btn" id="svOpen">打开人情往来</button>' +
      '</div>' +
      '<p class="sv-note">由 ' + U.esc(sp.by || '家人') + ' 通过「人情往来」分享 · ' + U.esc(sp.foot || '') + '</p>' +
      '</div>';
    fitPoster(document.getElementById('svHolder'));
    document.getElementById('svClose').onclick = function () {
      location.hash = ''; el.hidden = true; el.innerHTML = '';
    };
    document.getElementById('svImg').onclick = function () {
      canvasFor(sp).toBlob(function (blob) {
        var a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = '人情往来-' + sp.title + '.png';
        a.click();
      }, 'image/png');
    };
    document.getElementById('svCopy').onclick = function () { copy(textOf(sp), '已复制'); };
    document.getElementById('svOpen').onclick = function () {
      location.hash = ''; el.hidden = true; el.innerHTML = ''; ctx.toast && ctx.toast('欢迎回来');
    };
    return true;
  }

  return { init: init, open: open, openFromHash: openFromHash };
})();
