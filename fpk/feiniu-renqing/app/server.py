#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""人情往来 · 静态服务 + 数据/图片 API（仅 Python 标准库）

两种运行模式：
1) 统一网关：设置 FNNAS_GATEWAY_SOCKET 时监听 Unix Socket，
   请求路径带 FNNAS_GATEWAY_PREFIX 前缀，服务内部剥掉再路由。
2) 直连模式：监听 0.0.0.0:$FN_PORT，供本地调试或局域网浏览器访问。

数据文件默认在 $TRIM_PKGVAR/data/state.json，可通过 /api/path 改到共享目录。
头像存到数据目录下的 avatars/。
"""
import base64
import hashlib
import hmac
import json
import mimetypes
import os
import re
import secrets
import socket
import socketserver
import sys
import time
import urllib.parse
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

HERE = os.path.dirname(os.path.abspath(__file__))
WEBROOT = os.environ.get("FN_WEBROOT", os.path.join(HERE, "web"))
VAR = os.environ.get("TRIM_PKGVAR", os.path.join(HERE, "..", "var"))
PORT = int(os.environ.get("FN_PORT", "8896"))
# 兼容两种网关变量名（不同 fnOS 版本注入的名称不同）
GATE_SOCKET = (os.environ.get("FNNAS_GATEWAY_SOCKET", "")
               or os.environ.get("GATEWAY_SOCKET", ""))
GATE_PREFIX = ((os.environ.get("FNNAS_GATEWAY_PREFIX", "")
                or os.environ.get("GATEWAY_PREFIX", "")) or "").rstrip("/")
STATE_NAME = "state.json"
PATH_CONF = "path.json"
AUTH_NAME = "users.json"
TOKEN_NAME = "tokens.json"
SETTINGS_NAME = "settings.json"
MAX_UPLOAD = 6 * 1024 * 1024
TOKEN_TTL = 30 * 24 * 3600

ALLOWED_IMG = {"image/jpeg": ".jpg", "image/png": ".png", "image/gif": ".gif", "image/webp": ".webp"}


# ---------- 账户 ----------
def auth_file():
    return os.path.join(VAR, AUTH_NAME)


def token_file():
    return os.path.join(VAR, TOKEN_NAME)


def settings_file():
    return os.path.join(VAR, SETTINGS_NAME)


def hash_pw(pw):
    salt = secrets.token_hex(16)
    dk = hashlib.pbkdf2_hmac("sha256", pw.encode("utf-8"), salt.encode("utf-8"), 120000)
    return salt + "$" + dk.hex()


def verify_pw(pw, stored):
    try:
        salt, digest = stored.split("$", 1)
        dk = hashlib.pbkdf2_hmac("sha256", pw.encode("utf-8"), salt.encode("utf-8"), 120000)
        return hmac.compare_digest(dk.hex(), digest)
    except Exception:
        return False


def load_users():
    try:
        with open(auth_file(), "r", encoding="utf-8") as f:
            d = json.load(f)
        if isinstance(d, dict) and isinstance(d.get("users"), list):
            return d
    except Exception:
        pass
    d = {
        "users": [{
            "id": "admin", "username": "admin", "name": "管理员",
            "role": "admin", "pass": hash_pw("admin123")
        }],
        "allowRegister": True
    }
    save_users(d)
    return d


def save_users(d):
    atomic_write_json(auth_file(), d)


def load_tokens():
    try:
        with open(token_file(), "r", encoding="utf-8") as f:
            d = json.load(f)
        if isinstance(d, dict):
            return {k: v for k, v in d.items() if v.get("exp", 0) > time.time()}
    except Exception:
        pass
    return {}


def public_user(u):
    return {k: u.get(k) for k in ("id", "username", "name", "role", "theme") if k in u}


def data_dir():
    """读取数据目录配置，返回绝对路径。"""
    try:
        with open(os.path.join(VAR, PATH_CONF), "r", encoding="utf-8") as f:
            d = json.load(f).get("dataDir", "")
        if d and os.path.isabs(d) and os.path.isdir(d):
            return d
    except Exception:
        pass
    return os.path.join(VAR, "data")


def state_file():
    return os.path.join(data_dir(), STATE_NAME)


def avatar_dir():
    d = os.path.join(data_dir(), "avatars")
    try:
        os.makedirs(d, exist_ok=True)
    except Exception:
        pass
    return d


def atomic_write_json(path, obj):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False)
    os.replace(tmp, path)


class Handler(SimpleHTTPRequestHandler):
    server_version = "Renqing/2.0"

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=WEBROOT, **kwargs)

    # ---------- 路径处理 ----------
    def _route(self):
        """去掉网关前缀，返回 (path, query)。"""
        u = urllib.parse.urlsplit(self.path)
        p = urllib.parse.unquote(u.path)
        if GATE_PREFIX and (p == GATE_PREFIX or p.startswith(GATE_PREFIX + "/")):
            p = p[len(GATE_PREFIX):] or "/"
        if not p.startswith("/"):
            p = "/" + p
        return p, u.query

    def _base(self):
        """页面 <base>：网关模式指向 /prefix/，直连为 /。"""
        return (GATE_PREFIX + "/") if GATE_PREFIX else "/"

    # ---------- 响应工具 ----------
    def _json(self, obj, code=200):
        body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        try:
            self.wfile.write(body)
        except Exception:
            pass

    def _body(self, limit=20 * 1024 * 1024):
        n = int(self.headers.get("Content-Length", "0"))
        if n <= 0 or n > limit:
            raise ValueError("invalid size")
        return self.rfile.read(n)

    # ---------- 静态文件（注入 base） ----------
    def _static(self, path):
        if path in ("/", ""):
            path = "/index.html"
        # 防目录穿越
        rel = path.lstrip("/")
        full = os.path.abspath(os.path.join(WEBROOT, rel))
        if not full.startswith(os.path.abspath(WEBROOT) + os.sep) and full != os.path.abspath(WEBROOT):
            self.send_error(403)
            return
        try:
            with open(full, "rb") as f:
                data = f.read()
        except OSError:
            self.send_error(404)
            return
        ctype = mimetypes.guess_type(full)[0] or "application/octet-stream"
        if full.endswith(".html"):
            ctype = "text/html; charset=utf-8"
            base = self._base()
            if base != "/":
                data = data.decode("utf-8").replace(
                    "<head>", '<head>\n<base href="' + base + '">', 1
                ).encode("utf-8")
        elif ctype.startswith("text/") or ctype in ("application/javascript", "application/json"):
            ctype += "; charset=utf-8"
        self.send_response(200)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-cache")
        self.end_headers()
        try:
            self.wfile.write(data)
        except Exception:
            pass

    # ---------- 账户鉴权 ----------
    def _token_from_request(self):
        h = self.headers.get("X-Auth-Token", "")
        return h.strip()

    def _current_user(self):
        tok = self._token_from_request()
        if not tok:
            return None
        rec = load_tokens().get(tok)
        if not rec:
            return None
        for u in load_users()["users"]:
            if u.get("id") == rec.get("uid"):
                return u
        return None

    def _issue_token(self, uid):
        tok = secrets.token_urlsafe(32)
        tokens = load_tokens()
        tokens[tok] = {"uid": uid, "exp": int(time.time()) + TOKEN_TTL}
        atomic_write_json(token_file(), tokens)
        return tok

    def _auth_api(self, path, method):
        # 登录
        if path == "/api/auth/login" and method == "POST":
            try:
                b = json.loads(self._body().decode("utf-8"))
                username = str(b.get("username", "")).strip()
                password = str(b.get("password", ""))
            except Exception:
                return self._json({"ok": False, "msg": "请求无效"}, 400)
            for u in load_users()["users"]:
                if u.get("username", "").lower() == username.lower() and verify_pw(password, u.get("pass", "")):
                    tok = self._issue_token(u["id"])
                    return self._json({"ok": True, "token": tok, "user": public_user(u),
                                       "theme": u.get("theme", "warm")})
            return self._json({"ok": False, "msg": "用户名或密码错误"}, 401)

        # 注册（可关闭）
        if path == "/api/auth/register" and method == "POST":
            cfg = load_users()
            if not cfg.get("allowRegister", True):
                return self._json({"ok": False, "msg": "管理员已关闭自助注册"}, 403)
            try:
                b = json.loads(self._body().decode("utf-8"))
                username = str(b.get("username", "")).strip()
                password = str(b.get("password", ""))
                name = str(b.get("name", "")).strip() or username
            except Exception:
                return self._json({"ok": False, "msg": "请求无效"}, 400)
            if not re.match(r"^[a-zA-Z0-9_]{3,20}$", username):
                return self._json({"ok": False, "msg": "账号需 3-20 位字母数字下划线"}, 400)
            if len(password) < 6:
                return self._json({"ok": False, "msg": "密码至少 6 位"}, 400)
            if any(u.get("username", "").lower() == username.lower() for u in cfg["users"]):
                return self._json({"ok": False, "msg": "账号已存在"}, 400)
            u = {"id": "u_" + secrets.token_hex(6), "username": username, "name": name,
                 "role": "member", "pass": hash_pw(password)}
            cfg["users"].append(u)
            save_users(cfg)
            tok = self._issue_token(u["id"])
            return self._json({"ok": True, "token": tok, "user": public_user(u), "theme": "warm"})

        # 会话校验
        if path == "/api/auth/session" and method == "GET":
            u = self._current_user()
            if not u:
                return self._json({"ok": False}, 401)
            return self._json({"ok": True, "user": public_user(u), "theme": u.get("theme", "warm")})

        # 退出
        if path == "/api/auth/logout" and method == "POST":
            tok = self._token_from_request()
            if tok:
                tokens = load_tokens()
                tokens.pop(tok, None)
                atomic_write_json(token_file(), tokens)
            return self._json({"ok": True})

        u = self._current_user()
        if not u:
            return self._json({"ok": False, "msg": "请先登录"}, 401)
        is_admin = u.get("role") == "admin"

        # 修改主题
        if path == "/api/auth/theme" and method == "POST":
            try:
                theme = str(json.loads(self._body().decode("utf-8")).get("theme", "warm"))
            except Exception:
                return self._json({"ok": False, "msg": "请求无效"}, 400)
            if theme not in ("warm", "night", "bamboo", "ocean", "plum"):
                return self._json({"ok": False, "msg": "未知主题"}, 400)
            cfg = load_users()
            for x in cfg["users"]:
                if x.get("id") == u["id"]:
                    x["theme"] = theme
            save_users(cfg)
            return self._json({"ok": True})

        # 修改自己的密码
        if path == "/api/auth/password" and method == "POST":
            try:
                b = json.loads(self._body().decode("utf-8"))
                old = str(b.get("old", "")); fresh = str(b.get("fresh", ""))
            except Exception:
                return self._json({"ok": False, "msg": "请求无效"}, 400)
            if not verify_pw(old, u.get("pass", "")):
                return self._json({"ok": False, "msg": "原密码错误"}, 400)
            if len(fresh) < 6:
                return self._json({"ok": False, "msg": "新密码至少 6 位"}, 400)
            cfg = load_users()
            for x in cfg["users"]:
                if x.get("id") == u["id"]:
                    x["pass"] = hash_pw(fresh)
            save_users(cfg)
            return self._json({"ok": True})

        # 管理员：账户列表 / 注册开关
        if path == "/api/auth/users" and method == "GET":
            if not is_admin:
                return self._json({"ok": False, "msg": "仅管理员可查看"}, 403)
            cfg = load_users()
            return self._json({"ok": True, "users": [public_user(x) for x in cfg["users"]],
                               "allowRegister": bool(cfg.get("allowRegister", True))})

        if path == "/api/auth/settings" and method == "POST":
            if not is_admin:
                return self._json({"ok": False, "msg": "仅管理员可操作"}, 403)
            try:
                allow = bool(json.loads(self._body().decode("utf-8")).get("allowRegister"))
            except Exception:
                return self._json({"ok": False, "msg": "请求无效"}, 400)
            cfg = load_users()
            cfg["allowRegister"] = allow
            save_users(cfg)
            return self._json({"ok": True})

        # 管理员：新增账户
        if path == "/api/auth/users" and method == "POST":
            if not is_admin:
                return self._json({"ok": False, "msg": "仅管理员可操作"}, 403)
            try:
                b = json.loads(self._body().decode("utf-8"))
                username = str(b.get("username", "")).strip()
                password = str(b.get("password", ""))
                name = str(b.get("name", "")).strip() or username
                role = "admin" if b.get("role") == "admin" else "member"
            except Exception:
                return self._json({"ok": False, "msg": "请求无效"}, 400)
            if not re.match(r"^[a-zA-Z0-9_]{3,20}$", username):
                return self._json({"ok": False, "msg": "账号需 3-20 位字母数字下划线"}, 400)
            if len(password) < 6:
                return self._json({"ok": False, "msg": "密码至少 6 位"}, 400)
            cfg = load_users()
            if any(x.get("username", "").lower() == username.lower() for x in cfg["users"]):
                return self._json({"ok": False, "msg": "账号已存在"}, 400)
            cfg["users"].append({"id": "u_" + secrets.token_hex(6), "username": username,
                                 "name": name, "role": role, "pass": hash_pw(password)})
            save_users(cfg)
            return self._json({"ok": True})

        # 管理员：删除账户 / 重置密码
        m = re.match(r"^/api/auth/users/([A-Za-z0-9_\-]+)/(delete|reset)$", path)
        if m and method == "POST":
            if not is_admin:
                return self._json({"ok": False, "msg": "仅管理员可操作"}, 403)
            uid, action = m.group(1), m.group(2)
            cfg = load_users()
            if action == "delete":
                if uid == "admin":
                    return self._json({"ok": False, "msg": "不能删除默认管理员"}, 400)
                cfg["users"] = [x for x in cfg["users"] if x.get("id") != uid]
                save_users(cfg)
                tokens = load_tokens()
                for tok in [k for k, v in tokens.items() if v.get("uid") == uid]:
                    tokens.pop(tok, None)
                atomic_write_json(token_file(), tokens)
                return self._json({"ok": True})
            try:
                fresh = str(json.loads(self._body().decode("utf-8")).get("password", ""))
            except Exception:
                return self._json({"ok": False, "msg": "请求无效"}, 400)
            if len(fresh) < 6:
                return self._json({"ok": False, "msg": "密码至少 6 位"}, 400)
            for x in cfg["users"]:
                if x.get("id") == uid:
                    x["pass"] = hash_pw(fresh)
            save_users(cfg)
            return self._json({"ok": True})

        return self.send_error(404)

    # ---------- API ----------
    def _api(self, path, method):
        if path == "/api/ping" and method == "GET":
            return self._json({"ok": True, "ts": int(time.time())})

        if path.startswith("/api/auth/"):
            return self._auth_api(path, method)

        # 以下数据接口需要登录（/api/file/ 供 <img> 直接使用，无法带请求头，单独放行）
        if (path.startswith("/api/") and not path.startswith("/api/file/")
                and not self._current_user()):
            return self._json({"ok": False, "msg": "请先登录"}, 401)

        if path == "/api/state":
            if method == "GET":
                try:
                    with open(state_file(), "r", encoding="utf-8") as f:
                        data = json.load(f)
                    if not isinstance(data, dict):
                        data = {}
                except Exception:
                    data = {}
                return self._json(data)
            if method == "POST":
                try:
                    data = json.loads(self._body().decode("utf-8"))
                except Exception:
                    return self._json({"ok": False, "msg": "无效数据"}, 400)
                if (not isinstance(data, dict)
                        or not isinstance(data.get("people"), list)
                        or not isinstance(data.get("gifts"), list)):
                    return self._json({"ok": False, "msg": "数据结构不正确"}, 400)
                try:
                    atomic_write_json(state_file(), data)
                    return self._json({"ok": True, "ts": int(time.time())})
                except Exception as exc:
                    return self._json({"ok": False, "msg": str(exc)}, 500)

        if path == "/api/path":
            if method == "GET":
                return self._json({
                    "dataDir": data_dir(),
                    "default": os.path.join(VAR, "data"),
                    "available": [d for d in self._share_paths() if os.path.isdir(d)],
                    "writable": os.access(data_dir(), os.W_OK)
                })
            if method == "POST":
                try:
                    d = json.loads(self._body().decode("utf-8")).get("dataDir", "")
                except Exception:
                    return self._json({"ok": False, "msg": "无效请求"}, 400)
                if d and not os.path.isabs(d):
                    return self._json({"ok": False, "msg": "请填写绝对路径"}, 400)
                if d:
                    try:
                        os.makedirs(d, exist_ok=True)
                    except Exception as exc:
                        return self._json({"ok": False, "msg": "目录不可写：" + str(exc)}, 400)
                    if not os.access(d, os.W_OK):
                        return self._json({"ok": False, "msg": "目录不可写"}, 400)
                try:
                    os.makedirs(VAR, exist_ok=True)
                    atomic_write_json(os.path.join(VAR, PATH_CONF), {"dataDir": d})
                    src = os.path.join(VAR, "data")
                    if d and d != src and os.path.isdir(src):
                        # 迁移已有数据
                        for name in (STATE_NAME,):
                            s = os.path.join(src, name)
                            if os.path.exists(s) and not os.path.exists(os.path.join(d, name)):
                                atomic_write_json(os.path.join(d, name), json.load(open(s, encoding="utf-8")))
                        av_src = os.path.join(src, "avatars")
                        av_dst = os.path.join(d, "avatars")
                        if os.path.isdir(av_src):
                            os.makedirs(av_dst, exist_ok=True)
                            for fn in os.listdir(av_src):
                                dst = os.path.join(av_dst, fn)
                                if not os.path.exists(dst):
                                    try:
                                        with open(os.path.join(av_src, fn), "rb") as f1, open(dst, "wb") as f2:
                                            f2.write(f1.read())
                                    except Exception:
                                        pass
                    return self._json({"ok": True, "dataDir": data_dir()})
                except Exception as exc:
                    return self._json({"ok": False, "msg": str(exc)}, 500)

        if path.startswith("/api/avatar"):
            return self._avatar(path, method)

        self.send_error(404)

    def _share_paths(self):
        raw = os.environ.get("TRIM_DATA_SHARE_PATHS", "") or ""
        return [p for p in raw.split(":") if p]

    def _avatar(self, path, method):
        # /api/avatar/<id>   上传 base64 {data:"data:image/png;base64,..."}
        # /api/file/<name>   读取图片
        if path.startswith("/api/file/") and method == "GET":
            name = os.path.basename(path[len("/api/file/"):])
            if not re.match(r"^[A-Za-z0-9_\-.]+$", name):
                self.send_error(400)
                return
            full = os.path.join(avatar_dir(), name)
            try:
                with open(full, "rb") as f:
                    data = f.read()
            except OSError:
                self.send_error(404)
                return
            ctype = mimetypes.guess_type(full)[0] or "application/octet-stream"
            self.send_response(200)
            self.send_header("Content-Type", ctype)
            self.send_header("Content-Length", str(len(data)))
            self.send_header("Cache-Control", "no-cache")
            self.end_headers()
            try:
                self.wfile.write(data)
            except Exception:
                pass
            return

        m = re.match(r"^/api/avatar/([A-Za-z0-9_\-]+)$", path)
        if not m:
            self.send_error(404)
            return
        pid = m.group(1)
        if method == "GET":
            for ext in (".jpg", ".png", ".gif", ".webp"):
                f = os.path.join(avatar_dir(), pid + ext)
                if os.path.exists(f):
                    self.send_response(302)
                    self.send_header("Location", self._base().rstrip("/") + "/api/file/" + pid + ext)
                    self.end_headers()
                    return
            return self._json({"ok": False}, 404)
        if method == "POST":
            try:
                body = json.loads(self._body(MAX_UPLOAD + 1024).decode("utf-8"))
                raw = body.get("data", "")
                if "," in raw and raw.strip().startswith("data:"):
                    raw = raw.split(",", 1)[1]
                img = base64.b64decode(raw)
            except Exception:
                return self._json({"ok": False, "msg": "图片无效"}, 400)
            if len(img) > MAX_UPLOAD:
                return self._json({"ok": False, "msg": "图片太大（上限 6MB）"}, 400)
            ctype = None
            if img[:8] == b"\x89PNG\r\n\x1a\n":
                ctype = "image/png"
            elif img[:3] == b"\xff\xd8\xff":
                ctype = "image/jpeg"
            elif img[:6] in (b"GIF87a", b"GIF89a"):
                ctype = "image/gif"
            elif img[:4] == b"RIFF" and img[8:12] == b"WEBP":
                ctype = "image/webp"
            if not ctype:
                return self._json({"ok": False, "msg": "只支持 JPG/PNG/GIF/WebP"}, 400)
            d = avatar_dir()
            for old in (".jpg", ".png", ".gif", ".webp"):
                try:
                    os.remove(os.path.join(d, pid + old))
                except OSError:
                    pass
            name = pid + ALLOWED_IMG[ctype]
            try:
                with open(os.path.join(d, name), "wb") as f:
                    f.write(img)
            except Exception as exc:
                return self._json({"ok": False, "msg": str(exc)}, 500)
            return self._json({"ok": True, "url": self._base().rstrip("/") + "/api/file/" + name})
        self.send_error(405)

    # ---------- 分发 ----------
    def do_GET(self):
        path, _ = self._route()
        if path.startswith("/api/"):
            return self._api(path, "GET")
        self._static(path)

    def do_POST(self):
        path, _ = self._route()
        if path.startswith("/api/"):
            return self._api(path, "POST")
        self.send_error(404)

    def do_HEAD(self):
        path, _ = self._route()
        self._static(path)

    def log_message(self, fmt, *args):
        sys.stderr.write("[renqing] " + (fmt % args) + "\n")


class TCPServer(ThreadingHTTPServer):
    daemon_threads = True
    allow_reuse_address = True


class UnixServer(socketserver.ThreadingMixIn, socketserver.UnixStreamServer):
    daemon_threads = True
    allow_reuse_address = True


def serve():
    if GATE_SOCKET:
        try:
            os.makedirs(os.path.dirname(GATE_SOCKET), exist_ok=True)
            if os.path.exists(GATE_SOCKET):
                os.remove(GATE_SOCKET)
        except Exception as exc:
            sys.stderr.write("[renqing] socket cleanup: %s\n" % exc)
        srv = UnixServer(GATE_SOCKET, Handler)
        try:
            os.chmod(GATE_SOCKET, 0o770)
        except Exception:
            pass
        sys.stderr.write("[renqing] gateway socket %s prefix=%s\n" % (GATE_SOCKET, GATE_PREFIX))
    else:
        srv = TCPServer(("0.0.0.0", PORT), Handler)
        sys.stderr.write("[renqing] http port %d\n" % PORT)
    srv.serve_forever()


if __name__ == "__main__":
    serve()
