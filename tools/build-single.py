#!/usr/bin/env python3
"""각 버전의 index.html 과 css/js 를 하나의 HTML 파일로 합칩니다.

결과물은 dist/ 에 들어가며, 외부 CDN 스크립트(three.js)만 태그로 남고
프로젝트의 CSS/JS 는 모두 파일 안에 인라인됩니다.
"""
import re
import pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
TARGETS = [
    ('index.html', 'last-survivor.html'),        # 2D 탑다운
    ('3d/index.html', 'last-survivor-3d.html'),  # 3D 3인칭
]


def build(src_rel, out_name):
    src = ROOT / src_rel
    base = src.parent
    html = src.read_text(encoding='utf-8')

    title = re.search(r'<title>(.*?)</title>', html, re.S).group(1).strip()
    body = re.search(r'<body>(.*?)</body>', html, re.S).group(1)

    styles = []
    for href in re.findall(r'<link[^>]+href="([^"]+\.css)"', html):
        if href.startswith('http'):
            continue
        styles.append((base / href).read_text(encoding='utf-8'))

    parts, external = [], []
    for src_attr in re.findall(r'<script src="([^"]+)"></script>', html):
        if src_attr.startswith('http'):
            external.append(src_attr)          # CDN 스크립트는 태그로 유지
        else:
            parts.append((base / src_attr).read_text(encoding='utf-8'))

    markup = re.sub(r'\s*<script src="[^"]+"></script>', '', body).strip()

    out = ['<title>%s</title>' % title, '<style>', '\n'.join(styles), '</style>', '', markup, '']
    for url in external:
        out.append('<script src="%s"></script>' % url)
    out += ['<script>', '\n'.join(parts), '</script>', '']

    dest = ROOT / 'dist' / out_name
    dest.parent.mkdir(exist_ok=True)
    text = '\n'.join(out)
    dest.write_text(text, encoding='utf-8')
    print('%s (%.1f KB) — css %d개, 인라인 js %d개, 외부 js %d개'
          % (dest.relative_to(ROOT), len(text) / 1024, len(styles), len(parts), len(external)))


for src_rel, out_name in TARGETS:
    build(src_rel, out_name)
