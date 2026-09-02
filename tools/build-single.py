#!/usr/bin/env python3
"""index.html 과 css/js 를 하나의 HTML 파일로 합칩니다.

결과물(dist/last-survivor.html)은 외부 파일 없이 혼자 동작하므로
공유하거나 정적 호스팅에 그대로 올릴 수 있습니다.
"""
import re
import pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
html = (ROOT / 'index.html').read_text(encoding='utf-8')

title = re.search(r'<title>(.*?)</title>', html, re.S).group(1).strip()
body = re.search(r'<body>(.*?)</body>', html, re.S).group(1)

css_files = re.findall(r'<link[^>]+href="([^"]+\.css)"', html)
js_files = re.findall(r'<script src="([^"]+)"></script>', html)

styles = '\n'.join((ROOT / p).read_text(encoding='utf-8') for p in css_files)
scripts = '\n'.join((ROOT / p).read_text(encoding='utf-8') for p in js_files)

# 마크업에서 외부 스크립트 태그 제거
markup = re.sub(r'\s*<script src="[^"]+"></script>', '', body).strip()

out = (
    f'<title>{title}</title>\n'
    f'<style>\n{styles}\n</style>\n\n'
    f'{markup}\n\n'
    f'<script>\n{scripts}\n</script>\n'
)

dest = ROOT / 'dist' / 'last-survivor.html'
dest.parent.mkdir(exist_ok=True)
dest.write_text(out, encoding='utf-8')
print(f'{dest.relative_to(ROOT)} ({len(out) / 1024:.1f} KB) — css {len(css_files)}개, js {len(js_files)}개 병합')
