/* 人情往来 · 关系图谱（布局 + 渲染）
   设计要点：
   1) 卡片按「圈层」环形排布，再强制做矩形碰撞消解，保证永不重叠
   2) 三档缩放：简略 / 标准 / 详细，卡片信息随档位增减
   3) 夫妻作为一个整体单元，中间放放大的爱心
   4) 「我」的卡片居中，不显示姓名，显示「我」
*/
window.Graph = (function () {
  'use strict';

  var LEVELS = [
    { i: 0, label: '简略', zoom: '70%', w: 78, h: 66, ava: 26, heart: 22, gap: 34, rings: [128, 228, 320] },
    { i: 1, label: '标准', zoom: '100%', w: 106, h: 88, ava: 34, heart: 34, gap: 48, rings: [152, 272, 386] },
    { i: 2, label: '详细', zoom: '135%', w: 146, h: 134, ava: 42, heart: 42, gap: 58, rings: [180, 322, 452] }
  ];

  var host = null, state = null, level = 1, scale = 1, pan = { x: 0, y: 0 };
  var world = { w: 900, h: 900 }, units = [], focusOnly = false, focusTouched = false;
  var ringFilter = 0; // 0=全部，1=至亲，2=亲友，3=朋友

  // ---------- 数据整理 ----------
  function makeUnits(st) {
    var map = {};
    st.people.forEach(function (p) { map[p.id] = p; });
    var used = {}, list = [];
    var spouse = st.me.spouseId ? map[st.me.spouseId] : null;
    if (spouse) used[spouse.id] = 1;
    list.push({ id: 'u_me', members: [st.me].concat(spouse ? [spouse] : []), ring: 0, center: true, pid: 'me' });

    st.people.forEach(function (p) {
      if (used[p.id]) return;
      var sp = p.spouseId && p.spouseId !== 'me' ? map[p.spouseId] : null;
      if (sp && !used[sp.id]) {
        used[p.id] = 1; used[sp.id] = 1;
        list.push({ id: 'u_' + p.id, members: [p, sp], ring: Math.min(p.ring || 3, sp.ring || 3), pid: p.id });
      } else {
        used[p.id] = 1;
        list.push({ id: 'u_' + p.id, members: [p], ring: p.ring || 3, pid: p.id });
      }
    });
    return list;
  }

  function totals(st) {
    var t = {};
    st.gifts.forEach(function (g) {
      if (!t[g.pid]) t[g.pid] = { in: 0, out: 0, count: 0, last: null };
      var o = t[g.pid];
      if (g.dir === 'in') o.in += g.amount; else o.out += g.amount;
      o.count++;
      if (!o.last || g.date > o.last.date) o.last = g;
    });
    return t;
  }

  // ---------- 布局 ----------
  function layout(lv) {
    var L = LEVELS[lv];
    var cw = (host && host.clientWidth) || 900;
    var ch = (host && host.clientHeight) || 620;
    var Rmax = L.rings[ringFilter ? (ringFilter - 1) : (focusOnly ? 1 : 2)];
    // 椭圆自适应：横屏铺宽、竖屏收窄，避免整张图被等比缩小到看不清
    var kx = Math.max(0.7, Math.min(1.9, (cw / 2 - L.w * 0.7) / Rmax));
    var ky = Math.max(0.45, Math.min(1.25, (ch / 2 - L.h * 0.7) / Rmax));

    var groups = { 1: [], 2: [], 3: [] };
    units.forEach(function (u) {
      u.w = u.members.length > 1 ? L.w * 2 + L.gap : L.w;
      u.h = L.h;
      if (!u.center) {
        if (ringFilter && u.ring !== ringFilter) { u.hidden = true; return; }
        if (focusOnly && u.ring === 3) { u.hidden = true; return; }
        u.hidden = false;
        (groups[u.ring] || groups[3]).push(u);
      } else { u.hidden = false; u.x = 0; u.y = 0; }
    });

    [1, 2, 3].forEach(function (ring) {
      var arr = groups[ring], n = arr.length;
      if (!n) return;
      var R = L.rings[ring - 1];
      var offset = ring === 1 ? -Math.PI / 2 : ring === 2 ? -Math.PI / 2 + 0.42 : -Math.PI / 2 - 0.24;
      arr.forEach(function (u, i) {
        var a = offset + (i / n) * Math.PI * 2;
        u.R = R; u.ta = a;
        u.x = Math.cos(a) * R * kx;
        u.y = Math.sin(a) * R * ky;
      });
    });

    var pad = Math.max(12, L.ava * 0.35);
    var centerU = units.filter(function (u) { return u.center; })[0];

    // 碰撞消解 + 环向回拉
    for (var iter = 0; iter < 480; iter++) {
      var active = units.filter(function (u) { return !u.hidden; });
      for (var i = 0; i < active.length; i++) {
        for (var j = i + 1; j < active.length; j++) {
          var a = active[i], b = active[j];
          var dx = b.x - a.x, dy = b.y - a.y;
          var ox = (a.w + b.w) / 2 + pad - Math.abs(dx);
          var oy = (a.h + b.h) / 2 + pad - Math.abs(dy);
          if (ox <= 0 || oy <= 0) continue;
          if (ox < oy) {
            var sx = (dx < 0 ? -1 : 1) * ox, total = 0;
            if (!a.center) total += 1; if (!b.center) total += 1;
            if (!total) continue;
            if (!a.center) a.x -= sx * (1 / total);
            if (!b.center) b.x += sx * (1 / total);
          } else {
            var sy = (dy < 0 ? -1 : 1) * oy, total2 = 0;
            if (!a.center) total2 += 1; if (!b.center) total2 += 1;
            if (!total2) continue;
            if (!a.center) a.y -= sy * (1 / total2);
            if (!b.center) b.y += sy * (1 / total2);
          }
        }
      }
      // 回拉到目标椭圆
      if (iter < 340) units.forEach(function (u) {
        if (u.center || u.hidden) return;
        var ex = u.x / (u.R * kx), ey = u.y / (u.R * ky);
        var e = Math.sqrt(ex * ex + ey * ey) || 1;
        if (e < 1 && e > 0.01) {
          var f = 1 + (1 / e - 1) * 0.06;
          u.x *= f; u.y *= f;
        } else if (e > 1.3) {
          var f2 = 1 + (e - 1) * 0.02;
          u.x /= f2; u.y /= f2;
        }
      });
    }

    // 保证与中心卡片的最小距离（沿径向外推），再做收尾碰撞
    var minD = Math.max(centerU.w, centerU.h) * 0.5 + pad;
    units.forEach(function (u) {
      if (u.center || u.hidden) return;
      var d = Math.sqrt(u.x * u.x + u.y * u.y) || 1;
      var need = minD + Math.min(u.w, u.h) * 0.5;
      if (d < need) { u.x *= need / d; u.y *= need / d; }
    });

    // 收尾：只做碰撞，确保绝无重叠（中心卡片也参与碰撞，靠它把内圈撑开）
    for (var it2 = 0; it2 < 260; it2++) {
      var act2 = units.filter(function (u) { return !u.hidden; });
      for (var m1 = 0; m1 < act2.length; m1++) {
        for (var m2 = m1 + 1; m2 < act2.length; m2++) {
          var A = act2[m1], B = act2[m2];
          var ddx = B.x - A.x, ddy = B.y - A.y;
          var oox = (A.w + B.w) / 2 + pad - Math.abs(ddx);
          var ooy = (A.h + B.h) / 2 + pad - Math.abs(ddy);
          if (oox <= 0 || ooy <= 0) continue;
          if (oox < ooy) {
            var sx2 = (ddx < 0 ? -1 : 1) * oox, c1 = (!A.center ? 1 : 0) + (!B.center ? 1 : 0);
            if (!c1) continue;
            if (!A.center) A.x -= sx2 / c1;
            if (!B.center) B.x += sx2 / c1;
          } else {
            var sy2 = (ddy < 0 ? -1 : 1) * ooy, c2 = (!A.center ? 1 : 0) + (!B.center ? 1 : 0);
            if (!c2) continue;
            if (!A.center) A.y -= sy2 / c2;
            if (!B.center) B.y += sy2 / c2;
          }
        }
      }
    }

    var mx = 0, my = 0;
    units.forEach(function (u) {
      if (u.hidden) return;
      mx = Math.max(mx, Math.abs(u.x) + u.w / 2);
      my = Math.max(my, Math.abs(u.y) + u.h / 2);
    });
    world = { w: mx * 2 + 90, h: my * 2 + 90 };

    // 连线
    var unitOf = {};
    units.forEach(function (u) { u.members.forEach(function (m) { unitOf[m.id] = u; }); });
    var map = {}; state.people.forEach(function (p) { map[p.id] = p; });
    // 连线从「我」这张卡片出发，而不是夫妻单元的中心
    var myAnchor = { x: centerU.x - (L.w + L.gap) / 2, y: centerU.y };
    var edges = [];
    units.forEach(function (u) {
      if (u.center || u.hidden) return;
      var anchor = u.members[0];
      var viaId = anchor.via && anchor.via !== 'me' ? anchor.via : null;
      var src = viaId ? unitOf[viaId] : centerU;
      if (!src || src === u) src = centerU;
      if (src.hidden) src = centerU;
      var viaName = viaId && map[viaId] ? map[viaId].name : (viaId === 'me' ? '我' : '');
      var from = src === centerU ? myAnchor : src;
      edges.push({
        x1: from.x, y1: from.y, x2: u.x, y2: u.y,
        kind: src === centerU ? 'direct' : 'via',
        label: src === centerU ? '' : '经' + viaName
      });
    });
    return { edges: edges, center: centerU, kx: kx, ky: ky };
  }

  // ---------- 渲染 ----------
  function cardHTML(u, L, lv, t) {
    var isMe = u.center;
    var person = u.members[0];
    var cls = ['gnode', 'lv' + lv, 'r' + (u.ring || 0)];
    if (isMe) cls.push('is-me');
    if (person.deathday) cls.push('is-memorial');
    var name = isMe ? '我' : person.name;
    var rel = isMe ? '' : person.relation;
    var badge = '';
    if (!isMe && person.birthday && !person.deathday) {
      var dLeft = U.daysToMD(person.birthday.slice(5));
      if (dLeft === 0) badge = '<i class="gn-badge bd">今日生日</i>';
      else if (dLeft <= 7) badge = '<i class="gn-badge bd">' + dLeft + '天后生日</i>';
    }
    if (person.deathday) {
      var dMem = U.daysToMD(person.deathday.slice(5));
      if (dMem === 0) badge = '<i class="gn-badge mm">今日祭日</i>';
      else if (dMem <= 7) badge = '<i class="gn-badge mm">' + dMem + '天后祭日</i>';
    }

    var html = '<div class="' + cls.join(' ') + '" data-pid="' + U.esc(isMe ? 'me' : person.id) + '" ' +
      'style="left:' + (u.x - u.w / 2) + 'px;top:' + (u.y - u.h / 2) + 'px;width:' + u.w + 'px;height:' + u.h + 'px">';

    if (isMe) html += '<span class="gn-halo"></span><span class="gn-seal">主</span>';
    var avaInner = person.photo
      ? '<img class="ava-img" src="' + U.esc(person.photo) + '" alt="">'
      : U.esc(person.emoji || (isMe ? '🎁' : '🙂'));
    html += '<div class="gn-ava">' + avaInner +
      (person.deathday ? '<b class="gn-candle">🕯️</b>' : '') + '</div>';
    html += '<div class="gn-body"><div class="gn-name">' + U.esc(name) +
      (isMe ? '<em class="gn-me-tag">本人</em>' : '') + '</div>';

    if (lv >= 1) {
      html += '<div class="gn-rel">' + U.esc(isMe ? '关系中心' : rel) + '</div>';
    }
    if (lv >= 2) {
      var rec = isMe ? null : (t[person.id] || { in: 0, out: 0, count: 0 });
      if (isMe) {
        var allIn = 0, allOut = 0, cnt = 0;
        state.gifts.forEach(function (g) { if (g.dir === 'in') allIn += g.amount; else allOut += g.amount; cnt++; });
        html += '<div class="gn-kv"><span class="k-in">收 ' + U.moneyShort(allIn) + '</span><span class="k-out">送 ' + U.moneyShort(allOut) + '</span></div>';
        html += '<div class="gn-foot">' + state.people.length + ' 位亲友 · ' + cnt + ' 笔往来</div>';
      } else {
        html += '<div class="gn-kv"><span class="k-in">收 ' + U.moneyShort(rec.in) + '</span><span class="k-out">送 ' + U.moneyShort(rec.out) + '</span></div>';
        html += '<div class="gn-foot">' + (rec.last ? '最近 ' + U.md(rec.last.date) + ' · ' + U.esc(rec.last.occ) : '暂无往来记录') + '</div>';
      }
    }
    if (badge && lv >= 1) html += badge;
    if (person.tags && person.tags.length && lv >= 2) {
      html += '<div class="gn-tags">' + person.tags.slice(0, 2).map(function (x) { return '<i>' + U.esc(x) + '</i>'; }).join('') + '</div>';
    }
    html += '</div></div>';
    return html;
  }

  function heartHTML(u, L) {
    var s = L.heart;
    return '<div class="heart-wrap" style="left:' + (u.x - s / 2) + 'px;top:' + (u.y - s / 2) + 'px;width:' + s + 'px;height:' + s + 'px">' +
      '<svg class="heart" viewBox="0 0 32 32" width="' + s + '" height="' + s + '">' +
      '<path d="M16 28.4S3.2 19.9 3.2 12.1C3.2 7.3 6.8 3.8 10.8 3.8c2.5 0 4.4 1.3 5.2 2.9.8-1.6 2.7-2.9 5.2-2.9 4 0 7.6 3.5 7.6 8.3 0 7.8-12.8 16.3-12.8 16.3z" ' +
      'fill="url(#heartGrad)" stroke="rgba(178,58,46,.35)" stroke-width="1"></path></svg></div>';
  }

  function render() {
    if (!host || !state) return;
    units = makeUnits(state);
    var L = LEVELS[level];
    var res = layout(level);
    var t = totals(state);

    var nodesHTML = '', edgeHTML = '', plateHTML = '';

    // 圈层参考线
    [1, 2, 3].forEach(function (ring) {
      if (ringFilter && ring !== ringFilter) return;
      if (focusOnly && ring === 3) return;
      var r = L.rings[ring - 1];
      edgeHTML += '<ellipse class="ring-guide" cx="0" cy="0" rx="' + (r * res.kx) + '" ry="' + (r * res.ky) + '" />';
    });

    res.edges.forEach(function (e) {
      var mxp = (e.x1 + e.x2) / 2, myp = (e.y1 + e.y2) / 2;
      var dx = e.x2 - e.x1, dy = e.y2 - e.y1;
      var len = Math.sqrt(dx * dx + dy * dy) || 1;
      var nx = -dy / len, ny = dx / len;
      var bow = e.kind === 'via' ? 26 : 12;
      var cx = mxp + nx * bow, cy = myp + ny * bow;
      edgeHTML += '<path class="edge ' + e.kind + '" d="M' + e.x1 + ' ' + e.y1 + ' Q' + cx + ' ' + cy + ' ' + e.x2 + ' ' + e.y2 + '"></path>';
      if (e.label && level >= 1) {
        var lx = 0.25 * e.x1 + 0.5 * cx + 0.25 * e.x2;
        var ly = 0.25 * e.y1 + 0.5 * cy + 0.25 * e.y2;
        edgeHTML += '<text class="edge-label" x="' + lx + '" y="' + (ly - 4) + '">' + U.esc(e.label) + '</text>';
      }
    });

    units.forEach(function (u) {
      if (u.hidden) return;
      if (u.members.length > 1) {
        var w = u.w - 14, h = u.h + 12;
        plateHTML += '<div class="pair-plate" style="left:' + (u.x - w / 2) + 'px;top:' + (u.y - h / 2) + 'px;width:' + w + 'px;height:' + h + 'px"></div>';
      }
      u.members.forEach(function (m, idx) {
        var offset = 0;
        if (u.members.length > 1) offset = (idx === 0 ? -1 : 1) * (L.w + L.gap) / 2;
        var sub = { x: u.x + offset, y: u.y, w: L.w, h: L.h, members: [m], ring: u.ring, center: u.center && idx === 0, pid: m.id };
        nodesHTML += cardHTML(sub, L, level, t);
      });
      if (u.members.length > 1) nodesHTML += heartHTML(u, L);
    });

    var W = world.w + 240, H = world.h + 240;
    host.innerHTML =
      '<div class="scene" style="transform:translate(' + pan.x + 'px,' + pan.y + 'px) scale(' + scale + ')">' +
      '<svg class="gedges" style="left:' + (-W / 2) + 'px;top:' + (-H / 2) + 'px;width:' + W + 'px;height:' + H + 'px" viewBox="' + (-W / 2) + ' ' + (-H / 2) + ' ' + W + ' ' + H + '">' +
      edgeHTML + '</svg>' + plateHTML + nodesHTML + '</div>';

    var sc = host.querySelector('.scene');
    if (sc) {
      sc.querySelectorAll('.gnode').forEach(function (n) {
        n.addEventListener('click', function (ev) {
          ev.stopPropagation();
          if (window.App && window.App.openPerson) window.App.openPerson(n.getAttribute('data-pid'));
        });
      });
    }
  }

  function fit() {
    if (!host) return;
    var cw = host.clientWidth || 600, ch = host.clientHeight || 600;
    var s = Math.min(1, (cw - 36) / world.w, (ch - 36) / world.h);
    scale = Math.max(0.4, Math.min(1.35, s));
    pan = { x: 0, y: 0 };
    applyTransform();
  }

  function applyTransform() {
    var sc = host && host.querySelector('.scene');
    if (sc) sc.style.transform = 'translate(' + pan.x + 'px,' + pan.y + 'px) scale(' + scale + ')';
  }

  function setLevel(lv, keepPan) {
    var prev = level;
    level = Math.max(0, Math.min(2, lv));
    if (level !== 2) { focusOnly = false; focusTouched = false; }
    else if (prev !== 2 && !focusTouched && window.innerWidth < 900) {
      focusOnly = true; // 小屏放大时先聚焦至亲，避免卡片缩得太小
    }
    render();
    fit();
    if (keepPan) { pan = { x: 0, y: 0 }; applyTransform(); }
    if (window.App && window.App.onGraphLevelChange) window.App.onGraphLevelChange(level);
  }

  function bindPan() {
    if (!host) return;
    var drag = null, pinch = null, pointers = new Map();
    function dist(a, b) { return Math.sqrt(Math.pow(a.x - b.x, 2) + Math.pow(a.y - b.y, 2)) || 1; }
    host.addEventListener('pointerdown', function (e) {
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 2) {
        var p = Array.from(pointers.values());
        pinch = { d: dist(p[0], p[1]), s: scale };
        drag = null;
        host.classList.add('dragging');
        return;
      }
      if (e.target.closest('.gnode')) return;
      if (pointers.size > 1) return;
      drag = { x: e.clientX, y: e.clientY, px: pan.x, py: pan.y };
      host.classList.add('dragging');
      if (host.setPointerCapture) { try { host.setPointerCapture(e.pointerId); } catch (err) { } }
    });
    host.addEventListener('pointermove', function (e) {
      if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pinch && pointers.size >= 2) {
        var p = Array.from(pointers.values());
        var k = dist(p[0], p[1]) / pinch.d;
        scale = Math.max(0.28, Math.min(2.4, pinch.s * k));
        applyTransform();
        return;
      }
      if (!drag) return;
      pan.x = drag.px + (e.clientX - drag.x);
      pan.y = drag.py + (e.clientY - drag.y);
      applyTransform();
    });
    function up(e) {
      pointers.delete(e.pointerId);
      if (pointers.size < 2) pinch = null;
      drag = null;
      host.classList.remove('dragging');
    }
    host.addEventListener('pointerup', up);
    host.addEventListener('pointercancel', up);
    host.addEventListener('wheel', function (e) {
      if (Math.abs(e.deltaY) < 6) return;
      e.preventDefault();
      setLevel(level + (e.deltaY > 0 ? -1 : 1));
    }, { passive: false });
    host.addEventListener('dblclick', function () { fit(); });
  }

  return {
    levels: LEVELS,
    init: function (el) {
      host = el;
      bindPan();
      if (!window.__graphResize) {
        window.__graphResize = true;
        var rt = null;
        window.addEventListener('resize', function () {
          clearTimeout(rt);
          rt = setTimeout(function () {
            if (!host || !state || !host.clientWidth) return;
            render(); fit();
          }, 200);
        });
      }
      // 全局 SVG 渐变
      if (!document.getElementById('heartDefs')) {
        var d = document.createElement('div');
        d.innerHTML = '<svg id="heartDefs" width="0" height="0" style="position:absolute"><defs>' +
          '<linearGradient id="heartGrad" x1="0" y1="0" x2="1" y2="1">' +
          '<stop offset="0%" style="stop-color:var(--red-2, #E4726A)"/><stop offset="55%" style="stop-color:var(--red, #C9403A)"/><stop offset="100%" style="stop-color:var(--red, #A82E2A)"/>' +
          '</linearGradient></defs></svg>';
        document.body.appendChild(d.firstChild);
      }
    },
    setState: function (st) { state = st; render(); fit(); },
    refresh: function () { render(); },
    setLevel: setLevel,
    level: function () { return level; },
    zoom: function (dir) { setLevel(level + dir); },
    fit: fit,
    focusOnly: function (v) {
      focusTouched = true;
      focusOnly = !!v;
      render(); fit();
      if (window.App && window.App.updateFocusChip) window.App.updateFocusChip();
    },
    isFocusOnly: function () { return focusOnly; },
    setRingFilter: function (v) {
      ringFilter = Number(v) || 0;
      focusTouched = true;
      render(); fit();
    },
    ringFilter: function () { return ringFilter; },
    scale: function () { return scale; }
  };
})();
