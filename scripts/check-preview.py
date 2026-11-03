#!/usr/bin/env python3
"""Capture the public URL/content baseline, then check an isolated static preview.

Capture: python3 scripts/check-preview.py --capture
Verify:  python3 scripts/check-preview.py --preview http://127.0.0.1:4410
Local snapshot/report files stay under ignored .preview/.
"""
import argparse
import concurrent.futures
import json
import hashlib
import re
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BASELINE = ROOT / '.preview' / 'route-baseline.json'
ORIGIN = 'https://norvyn.com'
VOID = {'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr'}


def fetch(url):
    parts = urllib.parse.urlsplit(url)
    safe = urllib.parse.urlunsplit((parts.scheme, parts.netloc, urllib.parse.quote(urllib.parse.unquote(parts.path), safe='/'), parts.query, ''))
    try:
        response = urllib.request.urlopen(safe, timeout=45)
    except urllib.error.HTTPError as error:
        response = error
    with response:
        return response.status, response.url, response.read().decode('utf-8')


class Prose(HTMLParser):
    def __init__(self, html):
        super().__init__()
        self.depth = 0
        self.parts = []
        self.links = []
        self.feed(html)

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if self.depth or 'prose' in attrs.get('class', '').split():
            if tag not in VOID:
                self.depth += 1
            if tag == 'a' and attrs.get('href'):
                self.links.append(attrs['href'])

    def handle_endtag(self, tag):
        if self.depth and tag not in VOID:
            self.depth -= 1

    def handle_data(self, text):
        if self.depth:
            self.parts.append(text)

    def signature(self):
        return {'text': re.sub(r'\s+', ' ', ' '.join(self.parts)).strip(), 'links': self.links}


def sitemap(html):
    root = ET.fromstring(html)
    return [loc.text for loc in root.findall('{*}url/{*}loc')]


def feed_signature(html):
    root = ET.fromstring(html)
    return [{'guid': item.findtext('guid'), 'link': item.findtext('link'),
             'enclosure': item.find('enclosure').attrib if item.find('enclosure') is not None else None,
             'transcript': [x.attrib for x in item.findall('{*}transcript')]}
            for item in root.findall('./channel/item')]


def capture():
    code, _, xml = fetch(ORIGIN + '/sitemap.xml')
    assert code == 200
    urls = sitemap(xml)
    protected = [u for u in urls if re.search(r'(privacy|support|terms)', urllib.parse.urlsplit(u).path)]
    # The API includes companion pages beyond the published app catalog.
    _, _, pages_json = fetch(ORIGIN + '/api/pages')
    for page in json.loads(pages_json):
        if page['status'] == 'published' and re.search(r'(privacy|support|terms)', page['slug']):
            for prefix in ['/', '/en/']:
                protected.append(ORIGIN + prefix + page['slug'])
    protected = sorted(set(protected))
    def read_protected(url):
        code, final, html = fetch(url)
        assert code == 200 and final == url, (url, code, final)
        signature = Prose(html).signature()
        assert signature['text'], url
        return urllib.parse.urlsplit(url).path, signature
    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
        content = dict(pool.map(read_protected, protected))
    _, _, shows_json = fetch(ORIGIN + '/api/podcasts?status=published&limit=10000')
    feeds = ['/rss.xml'] + ['/api/podcasts/' + urllib.parse.quote(show['slug']) + '/feed.xml' for show in json.loads(shows_json)['data']]
    signatures = {}
    for path in feeds:
        code, _, xml = fetch(ORIGIN + path)
        assert code == 200, path
        signatures[path] = feed_signature(xml)
        if path.startswith('/api/'):
            cache = BASELINE.parent / 'public-get-cache'
            cache.mkdir(parents=True, exist_ok=True)
            key = hashlib.sha256(path.encode()).hexdigest()
            (cache / (key + '.body')).write_text(xml)
            (cache / (key + '.json')).write_text(json.dumps({'path': path, 'status': code, 'contentType': 'application/rss+xml; charset=utf-8'}))
    baseline = {'origin': ORIGIN, 'urls': urls, 'protected': content, 'feeds': signatures}
    BASELINE.parent.mkdir(parents=True, exist_ok=True)
    BASELINE.write_text(json.dumps(baseline, ensure_ascii=False, indent=2))
    print(json.dumps({'sitemapURLs': len(urls), 'protectedPages': len(content), 'feeds': len(feeds), 'baseline': str(BASELINE)}))


def verify(preview, allowed_additions=()):
    data = json.loads(BASELINE.read_text())
    failures = []
    additions = [data['origin'].rstrip('/') + path for path in allowed_additions]
    expected_urls = data['urls'] + additions
    if len(set(expected_urls)) != len(expected_urls):
        raise SystemExit('Approved route additions must be unique and absent from the old baseline')
    def check(url):
        path = urllib.parse.urlsplit(url).path
        code, final, html = fetch(preview + path)
        problems = []
        if code != 200:
            problems.append(f'HTTP {code}')
        root_tag = re.search(r'<html\b[^>]*>', html)
        if not root_tag or 'data-public=' not in root_tag.group():
            problems.append('public design styles not enabled')
        canonical = re.search(r'<link\s+rel="canonical"\s+href="([^"]+)"', html)
        if not canonical or urllib.parse.unquote(urllib.parse.urlsplit(canonical.group(1)).path) != urllib.parse.unquote(path):
            problems.append('canonical does not match established public URL')
        if urllib.parse.urlsplit(final).path != urllib.parse.quote(urllib.parse.unquote(path), safe='/'):
            problems.append('redirected')
        if path in data['protected'] and Prose(html).signature() != data['protected'][path]:
            problems.append('protected content or links changed')
        return {'path': path, 'problems': problems} if problems else None
    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
        failures += [r for r in pool.map(check, expected_urls) if r]
    code, _, xml = fetch(preview + '/sitemap.xml')
    if code != 200 or sorted(sitemap(xml)) != sorted(expected_urls):
        failures.append({'path': '/sitemap.xml', 'problems': ['URL inventory changed']})
    for path, expected in data['feeds'].items():
        code, _, xml = fetch(preview + path)
        if code != 200 or feed_signature(xml) != expected:
            failures.append({'path': path, 'problems': ['feed GUID/link/enclosure/transcript changed']})
    code, _, _ = fetch(preview + '/a-deliberately-missing-route-4f593')
    if code != 404:
        failures.append({'path': 'missing route', 'problems': [f'expected 404, got {code}']})
    req = urllib.request.Request(preview + '/api/apps/sync', data=b'{}', headers={'Content-Type': 'application/json'})
    try:
        with urllib.request.urlopen(req) as response:
            code = response.status
    except urllib.error.HTTPError as error:
        code = error.code
    if code != 405:
        failures.append({'path': '/api/apps/sync', 'problems': ['preview did not reject write']})
    report = {'sitemapURLsChecked': len(expected_urls), 'baselineURLsPreserved': len(data['urls']), 'approvedAdditions': list(allowed_additions), 'protectedPagesCompared': len(data['protected']),
              'feedsCompared': len(data['feeds']), 'failures': failures}
    (BASELINE.parent / 'route-verification.json').write_text(json.dumps(report, ensure_ascii=False, indent=2))
    print(json.dumps(report, ensure_ascii=False, indent=2))
    raise SystemExit(bool(failures))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--capture', action='store_true')
    parser.add_argument('--preview', default='http://127.0.0.1:4410')
    parser.add_argument('--allow-added-route', action='append', default=[], help='Exact approved additive route; all old URLs remain mandatory')
    args = parser.parse_args()
    capture() if args.capture else verify(args.preview.rstrip('/'), args.allow_added_route)
