/* 人情往来 · 数据层 */
(function () {
  'use strict';

  var STORE_KEY = 'fn.rq.v3';
  window.STORE_KEY = STORE_KEY;

  window.OCCASIONS = ['婚礼', '满月', '周岁', '生日', '寿宴', '乔迁', '升学', '春节', '中秋', '白事', '探病', '谢师', '其他'];

  window.RINGS = {
    1: { name: '至亲', desc: '家人与直系亲属' },
    2: { name: '亲友', desc: '亲戚与家族长辈' },
    3: { name: '朋友', desc: '朋友、同事、邻里' }
  };

  // ---------- 示例数据（首次打开时载入，可在「我的」里清空重来）----------
  window.SEED = {
    me: {
      id: 'me',
      name: '陈飞',
      nick: '我',
      emoji: '🎁',
      birthday: '1988-06-18',
      hometown: '湖南 · 邵阳',
      phone: '138****6621', address: '长沙市岳麓区',
      motto: '人情不是账，但记下来才不辜负。',
      spouseId: 'p_wife',
      since: '2014-10-01'
    },
    people: [
      { id: 'p_wife', name: '林小满', relation: '妻子', ring: 1, emoji: '🌿', birthday: '1990-03-12', job: '小学老师', phone: '139****2210', address: '长沙市岳麓区', spouseId: 'me', via: 'me', tags: ['怕辣', '爱养花'], note: '同窗七年，结婚十二年。' },
      { id: 'p_father', name: '陈建国', relation: '父亲', ring: 1, emoji: '🌰', birthday: '1962-09-08', job: '退休工人', phone: '137****0088', address: '长沙市岳麓区', via: 'me', tags: ['爱下象棋', '高血压'] },
      { id: 'p_mother', name: '王秀兰', relation: '母亲', ring: 1, emoji: '🌸', birthday: '1965-01-22', job: '退休', phone: '137****0099', address: '长沙市岳麓区', via: 'me', tags: ['做得一手好剁椒'] },
      { id: 'p_fil', name: '林志远', relation: '岳父', ring: 1, emoji: '🍵', birthday: '1963-11-05', job: '退休教师', phone: '135****1122', via: 'me', tags: ['爱喝茶'] },
      { id: 'p_mil', name: '周慧芳', relation: '岳母', ring: 1, emoji: '🧶', birthday: '1965-07-19', job: '退休', phone: '135****1133', via: 'me', tags: ['会织毛衣'] },
      { id: 'p_daughter', name: '陈一诺', relation: '女儿', ring: 1, emoji: '🎈', birthday: '2016-04-03', job: '三年级', via: 'me', tags: ['学钢琴', '怕黑'] },
      { id: 'p_sister', name: '陈娟', relation: '姐姐', ring: 2, emoji: '🌻', birthday: '1985-12-11', job: '会计', phone: '136****3344', address: '长沙市开福区', spouseId: 'p_bil', via: 'me', tags: ['嘴上凶心里软'] },
      { id: 'p_bil', name: '赵国强', relation: '姐夫', ring: 2, emoji: '🚚', birthday: '1983-02-27', job: '跑运输', phone: '136****3355', spouseId: 'p_sister', via: 'p_sister', tags: ['爱喝两口'] },
      { id: 'p_uncle', name: '陈建军', relation: '二叔', ring: 2, emoji: '🐟', birthday: '1968-05-16', job: '养殖户', via: 'p_father', tags: ['过年必钓鱼'] },
      { id: 'p_cousin', name: '陈晨', relation: '堂弟', ring: 2, emoji: '🎮', birthday: '1995-08-24', job: '程序员', via: 'p_uncle', tags: ['在深圳'] },
      { id: 'p_grandpa', name: '陈明远', relation: '爷爷', ring: 2, emoji: '🕯️', birthday: '1934-02-19', deathday: '2019-04-05', job: '已故', via: 'p_father', tags: ['每年清明上坟'], note: '走的时候八十五岁，最爱听花鼓戏。' },
      { id: 'p_friend', name: '李伟', relation: '发小', ring: 3, emoji: '🍻', birthday: '1988-02-14', job: '开装修公司', phone: '133****7788', address: '长沙市雨花区', via: 'me', tags: ['一个村长大的', '爱攒局'] },
      { id: 'p_roommate', name: '张磊', relation: '大学室友', ring: 3, emoji: '🎧', birthday: '1987-09-30', job: '设计', phone: '133****7799', via: 'me', tags: ['睡我上铺'] },
      { id: 'p_colleague', name: '王倩', relation: '同事', ring: 3, emoji: '☕', birthday: '1992-05-08', job: '同部门', via: 'me', tags: ['咖啡搭子'] },
      { id: 'p_neighbor', name: '刘洋', relation: '邻居', ring: 3, emoji: '🏀', birthday: '1986-03-21', job: '体育老师', via: 'p_friend', tags: ['楼下三单元', '周末打球'] },
      { id: 'p_master', name: '赵德海', relation: '师傅', ring: 3, emoji: '📚', birthday: '1958-10-10', job: '退休技师', via: 'me', tags: ['带我入行'] }
    ],
    gifts: [
      { id: 'g1', pid: 'p_friend', dir: 'out', amount: 1200, date: '2026-09-12', occ: '婚礼', note: '李伟再婚喜酒' },
      { id: 'g2', pid: 'p_sister', dir: 'in', amount: 2000, date: '2026-08-16', occ: '乔迁', note: '姐姐给新房的礼' },
      { id: 'g3', pid: 'p_roommate', dir: 'out', amount: 800, date: '2026-06-06', occ: '乔迁', note: '张磊新居温锅' },
      { id: 'g4', pid: 'p_colleague', dir: 'out', amount: 600, date: '2026-05-02', occ: '婚礼', note: '王倩婚礼' },
      { id: 'g5', pid: 'p_mil', dir: 'in', amount: 1000, date: '2026-04-03', occ: '生日', note: '岳母给一诺的生日红包' },
      { id: 'g6', pid: 'p_uncle', dir: 'in', amount: 500, date: '2026-02-17', occ: '春节', note: '二叔给的年礼' },
      { id: 'g7', pid: 'p_neighbor', dir: 'out', amount: 400, date: '2026-01-09', occ: '满月', note: '刘洋二胎满月' },
      { id: 'g8', pid: 'p_master', dir: 'out', amount: 1000, date: '2025-12-28', occ: '寿宴', note: '师傅七十寿宴' },
      { id: 'g9', pid: 'p_cousin', dir: 'out', amount: 800, date: '2025-10-06', occ: '婚礼', note: '陈晨婚礼' },
      { id: 'g10', pid: 'p_father', dir: 'in', amount: 3000, date: '2025-09-01', occ: '升学', note: '一诺上小学，父亲给的红包' },
      { id: 'g11', pid: 'p_bil', dir: 'in', amount: 1200, date: '2025-06-15', occ: '生日', note: '姐夫给的红包' },
      { id: 'g12', pid: 'p_friend', dir: 'out', amount: 500, date: '2025-05-20', occ: '生日', note: '李伟生日局随礼' },
      { id: 'g13', pid: 'p_sister', dir: 'out', amount: 1500, date: '2025-02-02', occ: '乔迁', note: '姐姐换房回礼' },
      { id: 'g14', pid: 'p_father', dir: 'out', amount: 2000, date: '2024-04-05', occ: '白事', note: '爷爷五周年祭' },
      { id: 'g15', pid: 'p_mother', dir: 'in', amount: 800, date: '2024-10-01', occ: '生日', note: '妈给的红包' },
      { id: 'g16', pid: 'p_wife', dir: 'in', amount: 520, date: '2024-05-20', occ: '其他', note: '小满转的过节钱' },
      { id: 'g17', pid: 'p_uncle', dir: 'out', amount: 600, date: '2024-02-12', occ: '春节', note: '回二叔的年礼' },
      { id: 'g18', pid: 'p_fil', dir: 'out', amount: 1000, date: '2024-11-05', occ: '寿宴', note: '岳父六十大寿' },
      { id: 'g19', pid: 'p_colleague', dir: 'in', amount: 300, date: '2024-08-08', occ: '其他', note: '王倩随的份子' },
      { id: 'g20', pid: 'p_daughter', dir: 'out', amount: 600, date: '2026-04-03', occ: '生日', note: '一诺生日请同学吃饭' },
      { id: 'g21', pid: 'p_grandpa', dir: 'out', amount: 300, date: '2026-04-05', occ: '白事', note: '清明添置祭品' },
      { id: 'g22', pid: 'p_mother', dir: 'out', amount: 260, date: '2026-01-22', occ: '生日', note: '给妈买的羊毛衫' }
    ],
    events: [
      { id: 'e1', title: '结婚纪念日', date: '2026-10-01', type: 'custom', repeat: 'yearly', personId: 'me', note: '订那家湘菜馆' },
      { id: 'e2', title: '一诺家长会', date: '2026-11-20', type: 'custom', repeat: 'none', personId: 'p_daughter', note: '下午三点，带成绩单' },
      { id: 'e3', title: '二叔六十大寿', date: '2026-12-08', type: 'banquet', repeat: 'none', personId: 'p_uncle', note: '老家祠堂，随礼 600' },
      { id: 'e4', title: '家族年夜饭', date: '2027-02-17', type: 'banquet', repeat: 'yearly', personId: 'me', note: '轮到我家做东' }
    ],
    stories: [
      { id: 's1', title: '那年我们一起过的年', date: '2024-02-10', emoji: '🏮', mood: '热闹', pids: ['p_wife', 'p_daughter', 'p_father', 'p_mother'], tags: ['春节', '家人'], content: '一诺第一次学会包饺子，捏得歪歪扭扭，煮出来一半成了片儿汤。小满笑着说没事，全家笑成一团。父亲喝了两杯，讲起他小时候过年的事。这样的夜晚，值得记一辈子。' },
      { id: 's2', title: '和李伟的毕业旅行', date: '2011-07-08', emoji: '🚄', mood: '开心', pids: ['p_friend'], tags: ['旅行', '老友'], content: '绿皮火车站了十二个小时，硬座，脚都麻了。可到了海边那一刻，觉得什么都值。李伟说以后有钱了要带全家再来——如今他真做到了。' },
      { id: 's3', title: '姐姐乔迁那天', date: '2026-08-16', emoji: '🔑', mood: '温暖', pids: ['p_sister', 'p_bil'], tags: ['乔迁', '亲友'], content: '新房子很大，姐姐却说最开心的是终于有了自己的书房。姐夫张罗了一桌菜，大家挤在阳台上吃，风里都是饭菜香。' },
      { id: 's4', title: '爷爷爱听的花鼓戏', date: '2019-04-05', emoji: '🕯️', mood: '怀念', pids: ['p_grandpa', 'p_father'], tags: ['怀念', '家人'], content: '爷爷走的那年八十五。他最爱听花鼓戏，收音机天天开着。后来每次清明经过老屋，我好像还能听见那段调子。有些声音，记着就不会散。' }
    ]
  };

  // ---------- 工具函数 ----------
  window.U = {
    pad: function (n) { return n < 10 ? '0' + n : '' + n; },
    todayISO: function () {
      var d = new Date();
      return d.getFullYear() + '-' + U.pad(d.getMonth() + 1) + '-' + U.pad(d.getDate());
    },
    iso: function (d) { return d.getFullYear() + '-' + U.pad(d.getMonth() + 1) + '-' + U.pad(d.getDate()); },
    parse: function (s) {
      if (!s) return null;
      var p = String(s).split('-').map(Number);
      if (p.length < 3 || !p[0]) return null;
      return new Date(p[0], p[1] - 1, p[2]);
    },
    money: function (n) {
      var v = Math.abs(Number(n) || 0);
      var s = v.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
      return '¥' + s;
    },
    moneyShort: function (n) {
      var v = Math.abs(Number(n) || 0);
      if (v >= 10000) return '¥' + (v / 10000).toFixed(v % 10000 === 0 ? 0 : 1) + '万';
      return '¥' + v.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    },
    signed: function (n) { return (n < 0 ? '−' : '+') + U.money(Math.abs(n)).replace('¥', ''); },
    age: function (birth) {
      var b = U.parse(birth); if (!b) return null;
      var t = new Date(); var a = t.getFullYear() - b.getFullYear();
      var m = t.getMonth() - b.getMonth();
      if (m < 0 || (m === 0 && t.getDate() < b.getDate())) a--;
      return a;
    },
    // 距下一个「月-日」还有几天（0 = 今天）；同时支持 'MM-DD' 与 'YYYY-MM-DD'
    daysToMD: function (md, fromDate) {
      var p = String(md).split('-').map(Number);
      var mo, dd;
      if (p.length === 2) { mo = p[0]; dd = p[1]; }
      else if (p.length >= 3) { mo = p[1]; dd = p[2]; }
      else return null;
      if (!mo || !dd) return null;
      var now = fromDate || new Date();
      var base = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      var t = new Date(now.getFullYear(), mo - 1, dd);
      if (t < base) t = new Date(now.getFullYear() + 1, mo - 1, dd);
      return Math.round((t - base) / 86400000);
    },
    md: function (iso) { return iso ? iso.slice(5) : ''; },
    cnDate: function (iso) {
      var d = U.parse(iso); if (!d) return iso || '';
      return (d.getMonth() + 1) + '月' + d.getDate() + '日';
    },
    cnDateFull: function (iso) {
      var d = U.parse(iso); if (!d) return iso || '';
      return d.getFullYear() + '年' + (d.getMonth() + 1) + '月' + d.getDate() + '日';
    },
    weekday: function (iso) { var d = U.parse(iso); return d ? '周' + '日一二三四五六'[d.getDay()] : ''; },
    esc: function (s) {
      return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
      });
    },
    uid: function (p) { return (p || 'x') + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); },
    clone: function (o) { return JSON.parse(JSON.stringify(o)); }
  };
})();
