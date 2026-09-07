#!/usr/bin/env python3
"""화면에 실제로 쓰는 글자만 남긴 서체를 만들어 CSS 에 심습니다.

한글 서체는 통째로 넣으면 800KB 가 넘습니다. 화면에 나오는 글자는
몇백 자뿐이므로, 그것만 추려 woff2 로 줄이면 수십 KB 로 끝납니다.
외부에서 서체를 받아 오지 않으니 요청도 한 번 줄고, 서체가 늦게
도착해 글자가 튀는 일도 없어집니다.
"""
import io, os, re, sys, base64, subprocess, glob

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC_TTF = sys.argv[1]                 # 원본 ttf
OUT_CSS = sys.argv[2]                 # 결과 css 조각
FAMILY = sys.argv[3]                  # @font-face 이름

def ui_text():
    """index.html 의 화면 문구 + js 안의 따옴표 문자열에서 글자를 모읍니다."""
    chunks = []
    for p in [os.path.join(ROOT, '3d/index.html')] + glob.glob(os.path.join(ROOT, '3d/js/*.js')):
        s = io.open(p, encoding='utf-8').read()
        if p.endswith('.html'):
            s = re.sub(r'<(script|style)[\s\S]*?</\1>', ' ', s)
            s = re.sub(r'<[^>]+>', ' ', s)
            chunks.append(s)
        else:
            chunks += re.findall(r"'([^'\\\n]*)'", s) + re.findall(r'"([^"\\\n]*)"', s)
    return ''.join(chunks)

chars = set(ui_text())
# 숫자·영문·기호는 통째로 넣습니다 (점수와 시간이 계속 바뀌므로)
chars |= set('0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'
             ' .,:;!?%/()[]{}<>+-–—·…\'"’“”#@&*=°×')
chars = {c for c in chars if c.isprintable() and not c.isspace()} | {' '}

uni = ','.join('U+%04X' % ord(c) for c in sorted(chars))
tmp = OUT_CSS + '.woff2'
subprocess.run([sys.executable, '-m', 'fontTools.subset', SRC_TTF,
                '--unicodes=' + uni, '--flavor=woff2',
                '--layout-features=*', '--output-file=' + tmp], check=True)

WEIGHT = sys.argv[4] if len(sys.argv) > 4 else '400'
APPEND = len(sys.argv) > 5 and sys.argv[5] == 'append'

b64 = base64.b64encode(open(tmp, 'rb').read()).decode('ascii')
head = ("/* %s — 화면에 쓰는 글자만 남겨 파일에 심었습니다 "
        "(tools/make-font.py 가 만듭니다) */\n" % FAMILY) if not APPEND else ''
face = ("@font-face{font-family:'%s';font-style:normal;font-weight:%s;font-display:block;"
        "src:url(data:font/woff2;base64,%s) format('woff2');}\n" % (FAMILY, WEIGHT, b64))
with io.open(OUT_CSS, 'a' if APPEND else 'w', encoding='utf-8') as f:
    f.write(head + face)
print('%s [%s] — 글자 %d자, %.0f KB' % (OUT_CSS, WEIGHT, len(chars), len(b64) * 3 / 4 / 1024))
os.remove(tmp)
