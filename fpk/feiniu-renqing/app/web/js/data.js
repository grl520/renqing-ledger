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
      { id: 'p_master', name: '赵德海', relation: '师傅', ring: 3, emoji: '📚', birthday: '1958-10-10', job: '退休技师', via: 'me', tags: ['带我入行'] },
      { id: 'p_aunt', name: '陈晓梅', relation: '姑姑', ring: 2, emoji: '🧕', birthday: '1966-04-18', job: '社区工作者', phone: '138****4456', address: '邵阳市大祥区', via: 'p_father', tags: ['爱唱花鼓戏', '热心肠'] },
      { id: 'p_cousin2', name: '陈曦', relation: '表姐', ring: 2, emoji: '📚', birthday: '1989-11-02', job: '中学老师', phone: '139****5521', address: '广州市天河区', via: 'p_aunt', tags: ['在广州', '爱读书'] },
      { id: 'p_nephew', name: '赵一凡', relation: '外甥', ring: 2, emoji: '🏀', birthday: '2012-07-25', job: '初一学生', via: 'p_sister', tags: ['篮球迷'] },
      { id: 'p_aunt2', name: '林小红', relation: '姨姐', ring: 2, emoji: '💄', birthday: '1979-08-14', job: '开服装店', phone: '135****7781', via: 'p_mil', tags: ['会做生意', '爽快'] },
      { id: 'p_bro_inlaw', name: '林小军', relation: '舅子', ring: 2, emoji: '🎣', birthday: '1985-03-09', job: '公务员', phone: '135****7782', via: 'p_wife', tags: ['爱钓鱼'] },
      { id: 'p_matchmaker', name: '吴阿姨', relation: '介绍人', ring: 2, emoji: '🌹', birthday: '1960-10-28', job: '退休', via: 'p_wife', tags: ['我和小满的媒人'] },
      { id: 'p_classmate', name: '刘思远', relation: '高中同学', ring: 3, emoji: '🎓', birthday: '1987-12-03', job: '医生', phone: '137****2214', address: '长沙市天心区', via: 'me', tags: ['班长', '在湘雅'] },
      { id: 'p_colleague2', name: '周敏', relation: '同事', ring: 3, emoji: '🌷', birthday: '1994-09-16', job: '同部门', via: 'me', tags: ['下午茶搭子'] },
      { id: 'p_boss', name: '孙建国', relation: '老领导', ring: 3, emoji: '🖋️', birthday: '1972-06-05', job: '退休主任', via: 'me', tags: ['带过我五年'] },
      { id: 'p_neighbor2', name: '何婶', relation: '邻居', ring: 3, emoji: '🥬', birthday: '1957-02-11', job: '退休', via: 'p_wife', tags: ['爱送自家菜'] }
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
      { id: 'g22', pid: 'p_mother', dir: 'out', amount: 260, date: '2026-01-22', occ: '生日', note: '给妈买的羊毛衫' },
      { id: 'g23', pid: 'p_aunt', dir: 'in', amount: 800, date: '2026-09-20', occ: '中秋', note: '姑姑寄来的月饼和红包' },
      { id: 'g24', pid: 'p_nephew', dir: 'out', amount: 600, date: '2026-08-28', occ: '升学', note: '一凡考上初中' },
      { id: 'g25', pid: 'p_classmate', dir: 'out', amount: 1000, date: '2026-07-18', occ: '探病', note: '思远住院，和几个同学去看他' },
      { id: 'g26', pid: 'p_colleague2', dir: 'out', amount: 600, date: '2026-06-18', occ: '生日', note: '周敏生日局' },
      { id: 'g27', pid: 'p_boss', dir: 'out', amount: 1200, date: '2026-05-16', occ: '寿宴', note: '孙主任六十大寿' },
      { id: 'g28', pid: 'p_matchmaker', dir: 'out', amount: 1000, date: '2026-02-14', occ: '春节', note: '给吴阿姨拜年' },
      { id: 'g29', pid: 'p_fil', dir: 'out', amount: 2000, date: '2026-01-01', occ: '春节', note: '元旦去岳父家' },
      { id: 'g30', pid: 'p_cousin2', dir: 'in', amount: 888, date: '2025-11-11', occ: '生日', note: '表姐发的生日红包' },
      { id: 'g31', pid: 'p_neighbor2', dir: 'in', amount: 200, date: '2025-10-05', occ: '中秋', note: '何婶送的自家菜和月饼' },
      { id: 'g32', pid: 'p_aunt2', dir: 'out', amount: 800, date: '2025-09-28', occ: '乔迁', note: '姨姐新店开业' },
      { id: 'g33', pid: 'p_bro_inlaw', dir: 'out', amount: 1200, date: '2025-08-19', occ: '满月', note: '小军家孩子满月' },
      { id: 'g34', pid: 'p_classmate', dir: 'in', amount: 500, date: '2025-07-07', occ: '其他', note: '思远还的份子钱' },
      { id: 'g35', pid: 'p_roommate', dir: 'in', amount: 600, date: '2025-04-20', occ: '生日', note: '张磊给的生日红包' },
      { id: 'g36', pid: 'p_master', dir: 'out', amount: 600, date: '2025-01-28', occ: '春节', note: '给师傅拜年' },
      { id: 'g37', pid: 'p_aunt', dir: 'out', amount: 1000, date: '2024-09-17', occ: '中秋', note: '中秋回邵阳看姑姑' },
      { id: 'g38', pid: 'p_sister', dir: 'in', amount: 2000, date: '2024-08-24', occ: '生日', note: '姐姐给的生日红包' },
      { id: 'g39', pid: 'p_friend', dir: 'out', amount: 800, date: '2024-06-10', occ: '乔迁', note: '李伟搬家' },
      { id: 'g40', pid: 'p_grandpa', dir: 'out', amount: 500, date: '2024-04-05', occ: '白事', note: '清明祭祖' },
      { id: 'g41', pid: 'p_mother', dir: 'out', amount: 1200, date: '2025-01-22', occ: '寿宴', note: '妈妈六十大寿' },
      { id: 'g42', pid: 'p_father', dir: 'out', amount: 800, date: '2023-02-22', occ: '生日', note: '父亲生日礼物' },
      { id: 'g43', pid: 'p_colleague2', dir: 'in', amount: 300, date: '2023-05-04', occ: '其他', note: '周敏带的下午茶' },
      { id: 'g44', pid: 'p_neighbor', dir: 'out', amount: 500, date: '2022-12-30', occ: '春节', note: '楼下邻居年货' },
      { id: 'g45', pid: 'p_wife', dir: 'out', amount: 1314, date: '2022-05-20', occ: '其他', note: '结婚纪念日红包' }
    ],
    events: [
      { id: 'e1', title: '结婚纪念日', date: '2026-10-01', type: 'custom', repeat: 'yearly', personId: 'me', note: '订那家湘菜馆' },
      { id: 'e2', title: '一诺家长会', date: '2026-11-20', type: 'custom', repeat: 'none', personId: 'p_daughter', note: '下午三点，带成绩单' },
      { id: 'e3', title: '二叔六十大寿', date: '2026-12-08', type: 'banquet', repeat: 'none', personId: 'p_uncle', note: '老家祠堂，随礼 600' },
      { id: 'e4', title: '家族年夜饭', date: '2027-02-17', type: 'banquet', repeat: 'yearly', personId: 'me', note: '轮到我家做东' },
      { id: 'e5', title: '父亲生日', date: '2026-12-18', type: 'birthday', repeat: 'yearly', personId: 'p_father', note: '订个双层蛋糕' },
      { id: 'e6', title: '一诺钢琴考级', date: '2026-12-12', type: 'custom', repeat: 'none', personId: 'p_daughter', note: '上午九点，文化馆' },
      { id: 'e7', title: '妈妈生日', date: '2027-01-22', type: 'birthday', repeat: 'yearly', personId: 'p_mother', note: '看看还缺什么' },
      { id: 'e8', title: '李伟生日', date: '2027-02-14', type: 'birthday', repeat: 'yearly', personId: 'p_friend', note: '老规矩，攒局' },
      { id: 'e9', title: '小满生日', date: '2027-03-12', type: 'birthday', repeat: 'yearly', personId: 'p_wife', note: '提前一周订花' },
      { id: 'e10', title: '爷爷忌日', date: '2027-04-05', type: 'memorial', repeat: 'yearly', personId: 'p_grandpa', note: '清明回老家上坟' },
      { id: 'e11', title: '中秋团圆饭', date: '2027-09-15', type: 'banquet', repeat: 'yearly', personId: 'me', note: '轮到我家做东' },
      { id: 'e12', title: '岳父生日', date: '2027-11-05', type: 'birthday', repeat: 'yearly', personId: 'p_fil', note: '爱喝茶，送好茶叶' }
    ],
    stories: [
      { id: 's1', title: '那年我们一起过的年', date: '2024-02-10', emoji: '🏮', mood: '热闹', pids: ['p_wife', 'p_daughter', 'p_father', 'p_mother'], tags: ['春节', '家人'], content: '一诺第一次学会包饺子，捏得歪歪扭扭，煮出来一半成了片儿汤。小满笑着说没事，全家笑成一团。父亲喝了两杯，讲起他小时候过年的事。这样的夜晚，值得记一辈子。' },
      { id: 's2', title: '和李伟的毕业旅行', date: '2011-07-08', emoji: '🚄', mood: '开心', pids: ['p_friend'], tags: ['旅行', '老友'], content: '绿皮火车站了十二个小时，硬座，脚都麻了。可到了海边那一刻，觉得什么都值。李伟说以后有钱了要带全家再来——如今他真做到了。' },
      { id: 's3', title: '姐姐乔迁那天', date: '2026-08-16', emoji: '🔑', mood: '温暖', pids: ['p_sister', 'p_bil'], tags: ['乔迁', '亲友'], content: '新房子很大，姐姐却说最开心的是终于有了自己的书房。姐夫张罗了一桌菜，大家挤在阳台上吃，风里都是饭菜香。' },
      { id: 's4', title: '爷爷爱听的花鼓戏', date: '2019-04-05', emoji: '🕯️', mood: '怀念', pids: ['p_grandpa', 'p_father'], tags: ['怀念', '家人'], content: '爷爷走的那年八十五。他最爱听花鼓戏，收音机天天开着。后来每次清明经过老屋，我好像还能听见那段调子。有些声音，记着就不会散。' },
      { id: 's5', title: '师傅教我的第一件事', date: '2010-08-15', emoji: '🛠️', mood: '难忘', pids: ['p_master'], tags: ['师徒', '入行'], content: '第一天上班，师傅没教技术，先教我怎么把工具摆整齐。他说：做事先做人，工具摆不顺手，活儿也干不漂亮。这句话我记了十几年。' },
      { id: 's6', title: '一诺第一次登台', date: '2025-06-01', emoji: '🎹', mood: '感动', pids: ['p_daughter', 'p_wife'], tags: ['孩子', '成长'], content: '钢琴汇报演出，一诺弹到一半忘了谱子，愣了两秒，小满在台下比口型提醒。她重新接上，弹完鞠躬时眼睛亮亮的。回家的路上，她说以后还要上台。' },
      { id: 's7', title: '和张磊的大学夜谈', date: '2009-11-23', emoji: '🌙', mood: '平淡', pids: ['p_roommate'], tags: ['老友', '大学'], content: '宿舍熄灯后，两个人躺在上下铺聊到凌晨两点。聊未来想做什么工作，想住在什么样的房子里。如今都实现了大半，只是再难有那样毫无顾忌的夜晚。' },
      { id: 's8', title: '母亲的那碗剁椒鱼', date: '2025-01-22', emoji: '🌶️', mood: '温暖', pids: ['p_mother', 'p_father'], tags: ['家人', '味道'], content: '妈生日那天我做了一桌菜，还是比不上她那碗剁椒鱼。父亲边吃边说像小时候，妈在旁边笑：这么多年了，口味倒是一点没变。' },
      { id: 's9', title: '一凡的篮球赛', date: '2026-05-18', emoji: '🏀', mood: '热闹', pids: ['p_sister', 'p_nephew', 'p_bil'], tags: ['孩子', '亲友'], content: '外甥打进了校队决赛，姐姐比孩子还紧张，在场边喊得嗓子都哑了。最后只输了两分，姐夫说没关系，回家请吃烧烤。一凡肿着眼眶点头，第二天又去训练了。' },
      { id: 's10', title: '清明那场雨', date: '2026-04-05', emoji: '🌧️', mood: '怀念', pids: ['p_grandpa', 'p_father', 'p_aunt'], tags: ['怀念', '家人'], content: '回老家上坟那天下了小雨，姑姑撑着伞念叨爷爷生前的事。父亲很少说话，只是把墓碑擦得很干净。雨停的时候，山里起了雾，像爷爷家烟囱冒的炊烟。' },
      { id: 's11', title: '吴阿姨的那杯喜酒', date: '2014-10-01', emoji: '🥂', mood: '感动', pids: ['p_matchmaker', 'p_wife'], tags: ['婚礼', '老友'], content: '婚礼上敬酒，吴阿姨眼圈红了，说当年介绍我们时也没把握，没想到真成了。小满在旁边笑，说媒人比新娘还激动。那一杯酒，我们喝得很慢。' }
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
