#!/usr/bin/env python3
"""Loopback-only Wordbase preview with cached public GETs; never forwards writes.

Run before building with API_URL=http://127.0.0.1:4410 and
PUBLIC_SITE_URL=http://127.0.0.1:4410. No credentials or production DB needed.
Cached responses are local review artifacts, not a production data backup.
"""
import argparse
import hashlib
import json
import mimetypes
import re
import threading
import urllib.error
import urllib.parse
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT / '.preview' / 'public-get-cache'
DIST = ROOT / 'packages/web/dist'
LOCK = threading.Lock()
PUBLIC = ('/api/posts', '/api/pages', '/api/categories', '/api/tags',
          '/api/apps', '/api/podcasts', '/api/settings/site',
          '/api/i18n/render', '/api/search', '/uploads/')


def reviewed_links(app):
    patches = json.loads((ROOT / 'content/reviewed-app-link-additions.json').read_text())
    additions = patches.get(app.get('slug'), {})
    if not additions:
        return app
    existing = json.loads(app.get('links') or '{}')
    # Existing editorial destinations always win; this fills missing keys only.
    return {**app, 'links': json.dumps({**additions, **existing})}


def public_path(path):
    return any(path == p or path.startswith(p + '/') for p in PUBLIC[:-1]) or path.startswith('/uploads/')


class Preview(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        if args and str(args[0]).startswith(('4', '5')):
            super().log_message(fmt, *args)

    def respond(self, status, body, content_type):
        self.send_response(status)
        self.send_header('Content-Type', content_type)
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()
        if self.command != 'HEAD':
            self.wfile.write(body)

    def do_POST(self):
        self.respond(405, b'{"error":{"code":"PREVIEW_READ_ONLY","message":"This preview cannot change data."}}', 'application/json')

    do_PUT = do_PATCH = do_DELETE = do_POST

    def do_HEAD(self):
        self.do_GET()

    def do_GET(self):
        url = urllib.parse.urlsplit(self.path)
        path = urllib.parse.unquote(url.path)
        if path.rstrip('/') == '/__review':
            # Local review navigation is never included in the production build.
            return self.respond(200, (ROOT / 'scripts/preview-review.html').read_bytes(), 'text/html; charset=utf-8')
        reviewed_apps = []
        if self.server.catalog_review:
            reviewed_apps = json.loads((ROOT / '.preview/catalog-review/apps.json').read_text())
            if path.startswith('/api/apps/'):
                app = next((app for app in reviewed_apps if path.removeprefix('/api/apps/') in (app['id'], app['slug'])), None)
                if app:
                    return self.respond(200, json.dumps(app).encode(), 'application/json')
        if self.server.media_fixture and path.startswith('/__qa__/assets/'):
            assets = ROOT / '.preview/media-fixture/assets'
            asset = (assets / path.removeprefix('/__qa__/assets/')).resolve()
            if asset.is_relative_to(assets.resolve()) and asset.is_file():
                return self.respond(200, asset.read_bytes(), mimetypes.guess_type(asset)[0] or 'application/octet-stream')
            return self.respond(404, b'Fixture asset not found', 'text/plain')
        if self.server.media_fixture and path.startswith('/api/apps/'):
            for fixture in json.loads((ROOT / '.preview/media-fixture/catalog.json').read_text()):
                if path.removeprefix('/api/apps/') in (fixture['id'], fixture['slug']):
                    return self.respond(200, json.dumps(fixture).encode(), 'application/json')
        download = re.fullmatch(r'/api/podcasts/episodes/([^/]+)/download', path)
        if download:
            # Production's GET download route COUNTS downloads. Resolve the
            # actual public media URL from already-captured episode metadata
            # instead; exercising a preview player must not hit that tracker.
            for metadata in CACHE.glob('*.json'):
                meta = json.loads(metadata.read_text())
                if '/episodes' not in meta.get('path', '') or '/download' in meta.get('path', ''):
                    continue
                try:
                    body = json.loads(metadata.with_suffix('.body').read_text())
                    episodes = body.get('data', []) if isinstance(body, dict) else []
                except (ValueError, OSError):
                    continue
                for episode in episodes:
                    if isinstance(episode, dict) and download[1] in (episode.get('slug'), episode.get('id')):
                        audio = episode.get('audioUrl', '')
                        parsed = urllib.parse.urlsplit(audio)
                        if ((parsed.scheme == 'https' and parsed.netloc and not parsed.username and not parsed.password)
                                or (audio.startswith('/uploads/') and not audio.startswith('//'))):
                            if parsed.netloc == 'norvyn.com' and parsed.path.startswith('/api/'):
                                break
                            self.send_response(302)
                            self.send_header('Location', urllib.parse.quote(audio, safe=':/?=&%'))
                            self.send_header('Cache-Control', 'no-store')
                            self.end_headers()
                            return
            return self.respond(503, b'Episode media missing from preview snapshot', 'text/plain')
        if path.startswith('/api/') or path.startswith('/uploads/'):
            if not public_path(path):
                return self.respond(403, b'Not a public preview endpoint', 'text/plain')
            # Freeze the first public response for each exact URL. Never read
            # env credentials or forward the incoming Authorization header.
            key = hashlib.sha256(self.path.encode()).hexdigest()
            meta_path, body_path = CACHE / (key + '.json'), CACHE / (key + '.body')
            with LOCK:
                cached = meta_path.exists() and body_path.exists()
            if cached:
                meta, body = json.loads(meta_path.read_text()), body_path.read_bytes()
            else:
                if path.endswith('/feed.xml'):
                    # Feed polls are also counted in production. Only serve a
                    # captured feed; baseline capture explicitly performs that
                    # read once rather than repeating it while browsing.
                    return self.respond(503, b'Capture the public feed baseline before previewing feeds', 'text/plain')
                if self.server.offline:
                    return self.respond(503, b'GET missing from frozen preview snapshot', 'text/plain')
                safe_url = urllib.parse.quote(path, safe='/') + ('?' + url.query if url.query else '')
                req = urllib.request.Request('https://norvyn.com' + safe_url, headers={'User-Agent': 'Wordbase-readonly-preview/1'})
                try:
                    response = urllib.request.urlopen(req, timeout=45)
                except urllib.error.HTTPError as error:
                    response = error
                except (urllib.error.URLError, TimeoutError):
                    return self.respond(502, b'Public snapshot fetch failed', 'text/plain')
                with response:
                    body = response.read()
                    meta = {'path': self.path, 'status': response.status, 'contentType': response.headers.get('Content-Type', 'application/octet-stream')}
                # Transient errors must remain retryable, never become a
                # permanent empty-content snapshot.
                if meta['status'] < 500:
                    with LOCK:
                        CACHE.mkdir(parents=True, exist_ok=True)
                        body_path.write_bytes(body)
                        meta_path.write_text(json.dumps(meta, ensure_ascii=False))
            if self.server.media_fixture and path == '/api/apps' and meta['status'] == 200:
                data = json.loads(body)
                query = urllib.parse.parse_qs(url.query)
                fixtures = json.loads((ROOT / '.preview/media-fixture/catalog.json').read_text())
                if query.get('status', ['published'])[0] == 'published' and query.get('page', ['1'])[0] == '1':
                    data['data'] = fixtures
                    data['total'] = len(fixtures)
                    body = json.dumps(data).encode()
            if self.server.catalog_review and path.startswith('/api/apps/') and meta['status'] == 200:
                app = json.loads(body)
                if isinstance(app, dict) and 'slug' in app:
                    body = json.dumps(reviewed_links(app)).encode()
            if reviewed_apps and path == '/api/apps' and meta['status'] == 200:
                data = json.loads(body)
                query = urllib.parse.parse_qs(url.query)
                status = query.get('status', ['published'])[0]
                if query.get('page', ['1'])[0] == '1':
                    existing = {app['slug'] for app in data['data']}
                    additions = [app for app in reviewed_apps if app['slug'] not in existing and (not status or app['status'] == status)]
                    order = json.loads((ROOT / 'content/reviewed-app-order.json').read_text())
                    rows = [{**reviewed_links(app), 'sortOrder': order.index(app['slug']) if app['slug'] in order else app.get('sortOrder', len(order))} for app in data['data'] + additions]
                    data['data'] = sorted(rows, key=lambda app: app['sortOrder'])
                    data['total'] += len(additions)
                    body = json.dumps(data).encode()
            return self.respond(meta['status'], body, meta['contentType'])

        dist = self.server.dist
        candidate = (dist / path.lstrip('/')).resolve()
        if not candidate.is_relative_to(dist.resolve()):
            return self.respond(403, b'Forbidden', 'text/plain')
        choices = [candidate, Path(str(candidate) + '.html'), candidate / 'index.html']
        for file in choices:
            if file.is_file():
                return self.respond(200, file.read_bytes(), mimetypes.guess_type(file)[0] or 'application/octet-stream')
        fallback = dist / '404.html'
        return self.respond(404, fallback.read_bytes() if fallback.exists() else b'Not found', 'text/html; charset=utf-8')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--port', type=int, default=4410)
    parser.add_argument('--offline', action='store_true', help='Serve frozen public responses only')
    parser.add_argument('--dist', type=Path, default=DIST, help='Alternate local static build directory')
    parser.add_argument('--media-fixture', action='store_true', help='Add explicit QA-only media apps and local assets')
    parser.add_argument('--catalog-review', action='store_true', help='Include reviewed editorial additions created through the local SQLite service')
    args = parser.parse_args()
    server = ThreadingHTTPServer(('127.0.0.1', args.port), Preview)
    server.offline = args.offline
    server.dist = args.dist.resolve()
    server.media_fixture = args.media_fixture
    server.catalog_review = args.catalog_review
    print(f'Read-only private preview: http://127.0.0.1:{args.port}', flush=True)
    server.serve_forever()
