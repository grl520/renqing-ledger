/* 人情往来 · 账户与登录（NAS 服务端账户 + 本地兜底） */
(function () {
  'use strict';

  var TOKEN_KEY = 'fn.rq.token';
  var THEME_KEY = 'fn.rq.theme';
  var LS_USERS = 'fn.rq.localusers';
  var LS_SESSION = 'fn.rq.localsession';

  var mode = 'local';           // 'server' | 'local'
  var serverOK = false;
  var session = null;           // {id, username, name, role, token}
  var doneCb = null;
  var loginTab = 'login';

  function apiBase() {
    var b = document.querySelector('base');
    var href = b ? b.getAttribute('href') : '';
    if (!href || href === '/') return '';
    return href.replace(/\/$/, '');
  }
  function apiUrl(p) { return apiBase() + p; }

  function headers(extra) {
    var h = {};
    if (extra) Object.keys(extra).forEach(function (k) { h[k] = extra[k]; });
    if (mode === 'server') {
      var tok = (session && session.token) || '';
      if (!tok) { try { tok = localStorage.getItem(TOKEN_KEY) || ''; } catch (e) { } }
      if (tok) h['X-Auth-Token'] = tok;
    }
    return h;
  }

  function req(path, method, body, cb) {
    if (mode !== 'server') { cb({ ok: false, msg: '当前为本地模式' }); return; }
    var opt = { method: method || 'GET', headers: headers({ 'Content-Type': 'application/json' }) };
    if (body !== undefined && body !== null) opt.body = JSON.stringify(body);
    fetch(apiUrl(path), opt)
      .then(function (r) { return r.json(); })
      .then(function (j) { cb(j || { ok: false }); })
      .catch(function () { cb({ ok: false, msg: '网络连接失败' }); });
  }

  /* ---------------- 主题（本地缓存，立即可用） ---------------- */
  function applyTheme(id, persist) {
    var name = id || 'warm';
    document.documentElement.setAttribute('data-theme', name);
    if (persist) {
      try { localStorage.setItem(THEME_KEY, name); } catch (e) { }
      if (mode === 'server' && session) req('/api/auth/theme', 'POST', { theme: name }, function () { });
    }
  }
  function savedTheme() {
    try { return localStorage.getItem(THEME_KEY) || 'warm'; } catch (e) { return 'warm'; }
  }

  /* ---------------- 本地账户（无 NAS 时兜底） ---------------- */
  function localStore() {
    try {
      var s = JSON.parse(localStorage.getItem(LS_USERS));
      if (s && Array.isArray(s.users) && s.users.length) return s;
    } catch (e) { }
    var def = {
      users: [{ id: 'local_admin', username: 'admin', name: '管理员', role: 'admin', pass: hashPw('admin123') }],
      allowRegister: true
    };
    try { localStorage.setItem(LS_USERS, JSON.stringify(def)); } catch (e) { }
    return def;
  }
  function saveLocal(s) { try { localStorage.setItem(LS_USERS, JSON.stringify(s)); } catch (e) { } }
  function hashPw(p) { // 仅用于本地演示的轻量散列，非加密用途
    var h = 5381, i;
    p = 'rq$' + p;
    for (i = 0; i < p.length; i++) h = ((h << 5) + h + p.charCodeAt(i)) | 0;
    return 'h' + (h >>> 0).toString(36);
  }
  function pub(u) { return { id: u.id, username: u.username, name: u.name, role: u.role }; }

  function localLogin(username, password, cb) {
    var s = localStore();
    var u = s.users.filter(function (x) { return x.username.toLowerCase() === String(username).toLowerCase(); })[0];
    if (!u || u.pass !== hashPw(password)) return cb({ ok: false, msg: '用户名或密码错误' });
    try { localStorage.setItem(LS_SESSION, u.id); } catch (e) { }
    session = Object.assign(pub(u), { token: '', local: true });
    cb({ ok: true, user: session });
  }
  function localRegister(data, cb) {
    var s = localStore();
    if (!s.allowRegister) return cb({ ok: false, msg: '管理员已关闭自助注册' });
    if (!/^[a-zA-Z0-9_]{3,20}$/.test(data.username)) return cb({ ok: false, msg: '账号需 3-20 位字母、数字或下划线' });
    if (String(data.password || '').length < 6) return cb({ ok: false, msg: '密码至少 6 位' });
    if (s.users.some(function (x) { return x.username.toLowerCase() === data.username.toLowerCase(); }))
      return cb({ ok: false, msg: '账号已存在' });
    var u = { id: 'u_' + Date.now().toString(36), username: data.username, name: data.name || data.username, role: 'member', pass: hashPw(data.password) };
    s.users.push(u); saveLocal(s);
    try { localStorage.setItem(LS_SESSION, u.id); } catch (e) { }
    session = Object.assign(pub(u), { token: '', local: true });
    cb({ ok: true, user: session });
  }
  function localRestore() {
    var uid;
    try { uid = localStorage.getItem(LS_SESSION); } catch (e) { }
    if (!uid) return false;
    var u = localStore().users.filter(function (x) { return x.id === uid; })[0];
    if (!u) return false;
    session = Object.assign(pub(u), { token: '', local: true });
    return true;
  }

  /* ---------------- 登录界面 ---------------- */
  function showLogin(done) {
    doneCb = done;
    var root = document.getElementById('loginRoot');
    if (!root) {
      root = document.createElement('div');
      root.id = 'loginRoot';
      document.body.insertBefore(root, document.body.firstChild);
    }
    var app = document.getElementById('app');
    if (app) app.classList.add('app-hidden');
    renderLogin();
  }
  function renderLogin() {
    var root = document.getElementById('loginRoot');
    var isReg = loginTab === 'register';
    root.innerHTML =
      '<div class="login-wrap"><div class="login-card">' +
      '<div class="login-brand"><span class="brand-mark">礼</span><div><h1>人情往来</h1><p>有来有往，记在心里</p></div></div>' +
      '<span class="login-badge">' + (mode === 'server' ? '🔒 NAS 账户登录' : '💻 本地演示模式') + '</span>' +
      '<div class="login-tabs"><button data-ltab="login" class="' + (isReg ? '' : 'on') + '">登录</button>' +
      '<button data-ltab="register" class="' + (isReg ? 'on' : '') + '">注册</button></div>' +
      '<div class="login-err" id="loginErr"></div>' +
      '<div class="form">' +
      '<label class="field"><span>账号</span><input class="input" id="loginUser" autocomplete="username" placeholder="用户名"></label>' +
      (isReg ? '<label class="field"><span>显示名称</span><input class="input" id="loginName" placeholder="怎么称呼你（选填）"></label>' : '') +
      '<label class="field"><span>密码</span><input class="input" id="loginPass" type="password" autocomplete="current-password" placeholder="密码"></label>' +
      '<button class="btn login-btn" id="loginSubmit">' + (isReg ? '注册并进入' : '登录') + '</button>' +
      '</div>' +
      '<p class="login-foot">' +
      (mode === 'server' ? '首次使用默认管理员账号 <b>admin / admin123</b>，登录后请尽快修改密码。<br>也可自行注册，或由管理员在设置里新增账号。' :
        '本地演示默认账号 <b>admin / admin123</b>。数据保存在此浏览器，不会上传到 NAS。') +
      '</p></div></div>';

    root.querySelectorAll('[data-ltab]').forEach(function (b) {
      b.addEventListener('click', function () { loginTab = b.getAttribute('data-ltab'); clearErr(); renderLogin(); });
    });
    root.querySelector('#loginSubmit').addEventListener('click', submitLogin);
    root.addEventListener('keydown', function (e) { if (e.key === 'Enter') submitLogin(); });
  }
  function clearErr() {
    var e = document.getElementById('loginErr');
    if (e) { e.textContent = ''; e.classList.remove('on'); }
  }
  function showErr(msg) {
    var e = document.getElementById('loginErr');
    if (e) { e.textContent = msg || '操作失败'; e.classList.add('on'); }
  }
  function submitLogin() {
    var u = (document.getElementById('loginUser') || {}).value || '';
    var p = (document.getElementById('loginPass') || {}).value || '';
    var n = (document.getElementById('loginName') || {}).value || '';
    if (!u.trim()) return showErr('请输入账号');
    if (!p) return showErr('请输入密码');
    var btn = document.getElementById('loginSubmit');
    btn.disabled = true; btn.textContent = '请稍候…';
    clearErr();
    var cb = function (res) {
      btn.disabled = false; btn.textContent = loginTab === 'register' ? '注册并进入' : '登录';
      if (!res || !res.ok) { showErr(res && res.msg ? res.msg : '登录失败'); return; }
      session = res.user;
      if (res.token) saveToken(res.token);
      if (res.theme) applyTheme(res.theme, false);
      finishLogin();
    };
    if (loginTab === 'register') {
      if (mode === 'server') req('/api/auth/register', 'POST', { username: u.trim(), password: p, name: n.trim() }, cb);
      else localRegister({ username: u.trim(), password: p, name: n.trim() }, cb);
    } else {
      if (mode === 'server') req('/api/auth/login', 'POST', { username: u.trim(), password: p }, cb);
      else localLogin(u.trim(), p, cb);
    }
  }
  function finishLogin() {
    var root = document.getElementById('loginRoot');
    if (root) root.innerHTML = '';
    var app = document.getElementById('app');
    if (app) app.classList.remove('app-hidden');
    if (typeof doneCb === 'function') { var f = doneCb; doneCb = null; f(); }
  }

  /* ---------------- 初始化 ---------------- */
  function init(done) {
    applyTheme(savedTheme(), false);
    var probe;
    try {
      probe = fetch(apiUrl('/api/ping'), { cache: 'no-store' });
    } catch (e) {
      probe = Promise.reject(new Error('no api'));
    }
    probe.then(function (r) { return r.ok ? r.json() : Promise.reject(new Error('bad')); })
      .then(function () {
        mode = 'server'; serverOK = true;
        var token;
        try { token = localStorage.getItem(TOKEN_KEY); } catch (e) { }
        if (!token) return showLogin(done);
        req('/api/auth/session', 'GET', null, function (res) {
          if (res && res.ok && res.user) {
            session = Object.assign(res.user, { token: token });
            if (res.theme) applyTheme(res.theme, false);
            finishLogin();
          } else {
            try { localStorage.removeItem(TOKEN_KEY); } catch (e) { }
            showLogin(done);
          }
        });
      })
      .catch(function () {
        mode = 'local'; serverOK = false;
        if (localRestore()) finishLogin();
        else showLogin(done);
      });
  }

  /* ---------------- 账户管理 API ---------------- */
  function listUsers(cb) {
    if (mode === 'server') req('/api/auth/users', 'GET', null, cb);
    else cb({ ok: true, users: localStore().users.map(pub), allowRegister: !!localStore().allowRegister });
  }
  function addUser(data, cb) {
    if (mode === 'server') return req('/api/auth/users', 'POST', data, cb);
    var s = localStore();
    if (s.users.some(function (x) { return x.username.toLowerCase() === data.username.toLowerCase(); }))
      return cb({ ok: false, msg: '账号已存在' });
    s.users.push({ id: 'u_' + Date.now().toString(36), username: data.username, name: data.name, role: data.role, pass: hashPw(data.password) });
    saveLocal(s); cb({ ok: true });
  }
  function deleteUser(id, cb) {
    if (mode === 'server') return req('/api/auth/users/' + encodeURIComponent(id) + '/delete', 'POST', {}, cb);
    var s = localStore(); s.users = s.users.filter(function (x) { return x.id !== id; }); saveLocal(s); cb({ ok: true });
  }
  function resetPassword(id, password, cb) {
    if (mode === 'server') return req('/api/auth/users/' + encodeURIComponent(id) + '/reset', 'POST', { password: password }, cb);
    var s = localStore(); var u = s.users.filter(function (x) { return x.id === id; })[0];
    if (!u) return cb({ ok: false, msg: '用户不存在' });
    u.pass = hashPw(password); saveLocal(s); cb({ ok: true });
  }
  function changePassword(oldPass, newPass, cb) {
    if (mode === 'server') return req('/api/auth/password', 'POST', { old: oldPass, fresh: newPass }, cb);
    var s = localStore(); var u = s.users.filter(function (x) { return x.id === session.id; })[0];
    if (!u) return cb({ ok: false, msg: '用户不存在' });
    if (u.pass !== hashPw(oldPass)) return cb({ ok: false, msg: '原密码错误' });
    u.pass = hashPw(newPass); saveLocal(s); cb({ ok: true });
  }
  function setAllowRegister(v, cb) {
    if (mode === 'server') return req('/api/auth/settings', 'POST', { allowRegister: !!v }, cb);
    var s = localStore(); s.allowRegister = !!v; saveLocal(s); cb({ ok: true });
  }
  function logout(cb) {
    if (mode === 'server') req('/api/auth/logout', 'POST', {}, function () { });
    try { localStorage.removeItem(TOKEN_KEY); localStorage.removeItem(LS_SESSION); } catch (e) { }
    session = null;
    if (typeof cb === 'function') cb();
    else location.reload();
  }
  function saveToken(t) { try { localStorage.setItem(TOKEN_KEY, t); } catch (e) { } }

  window.Auth = {
    init: init,
    headers: headers,
    apiUrl: apiUrl,
    isServer: function () { return mode === 'server'; },
    isAdmin: function () { return !!session && session.role === 'admin'; },
    user: function () { return session; },
    savedTheme: savedTheme,
    applyTheme: applyTheme,
    listUsers: listUsers,
    addUser: addUser,
    deleteUser: deleteUser,
    resetPassword: resetPassword,
    changePassword: changePassword,
    setAllowRegister: setAllowRegister,
    logout: logout,
    saveToken: saveToken,
    req: req
  };
})();
