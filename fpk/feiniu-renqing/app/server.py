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
import json
import mimetypes
import os
import re
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
MAX_UPLOAD = 6 * 1024 * 1024

ALLOWED_IMG = {"image/jpeg": ".jpg", "image/png": ".png", "image/gif": ".gif", "image/webp": ".webp"}


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

    # ---------- API ----------
    def _api(self, path, method):
        if path == "/api/ping" and method == "GET":
            return self._json({"ok": True, "ts": int(time.time())})

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
