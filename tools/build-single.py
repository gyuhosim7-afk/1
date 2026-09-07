#!/usr/bin/env python3
"""각 버전의 index.html 과 css/js 를 하나의 HTML 파일로 합칩니다.

결과물은 dist/ 에 들어가며, 외부 CDN 스크립트(three.js)만 태그로 남고
프로젝트의 CSS/JS 는 모두 파일 안에 인라인됩니다.
"""
import re
import pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
TARGETS = [
    ('2d/index.html', 'last-survivor.html'),     # 2D 탑다운
    ('3d/index.html', 'last-survivor-3d.html'),  # 3D 3인칭
]

# GitHub Pages 의 첫 화면(/)은 3D 판이 열려야 합니다.
# 3d/index.html 을 그대로 쓰되 자산 경로만 3d/ 로 바꿔 루트에 씁니다.
# 손으로 복사해 두면 언젠가 어긋나므로 빌드할 때마다 다시 만듭니다.
ROOT_FROM = '3d/index.html'


def build_root():
    """저장소 첫 화면(index.html)을 3d/index.html 에서 만들어 냅니다."""
    src = ROOT / ROOT_FROM
    html = src.read_text(encoding='utf-8')
    html = re.sub(r'(src|href)="(?!https?:|//|/|#)([^"]+)"', r'\1="3d/\2"', html)
    note = ('<!-- 이 파일은 tools/build-single.py 가 3d/index.html 에서 만들어 냅니다.\n'
            '     직접 고치지 마세요. 고칠 곳은 3d/index.html 입니다. -->\n')
    (ROOT / 'index.html').write_text(note + html, encoding='utf-8')
    print('index.html  <-  %s (경로를 3d/ 로 바꿔서)' % ROOT_FROM)


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

    # 저장소에 넣어 둔 three.js 는 단일 파일 판에서만 CDN 으로 바꿔 씁니다.
    # (아티팩트는 옆 파일을 못 읽고, GitHub Pages 는 CDN 없이도 돌아가야 하기 때문입니다)
    VENDOR_CDN = {
        'vendor/three.min.js': 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js',
    }
    parts, external = [], []
    for src_attr in re.findall(r'<script src="([^"]+)"></script>', html):
        if src_attr in VENDOR_CDN:
            external.append(VENDOR_CDN[src_attr])
        elif src_attr.startswith('http'):
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
build_root()
