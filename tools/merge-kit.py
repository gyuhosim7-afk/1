#!/usr/bin/env python3
"""KayKit Space Base Bits 의 gltf 57 개를 glb 한 개로 합칩니다.

각 파일이 '노드 1 · 메시 1 · 프리미티브 1' 이고 텍스처 아틀라스 한 장을
공유하는 구조라서, 버퍼를 이어 붙이고 인덱스만 밀어 주면 그대로 합쳐집니다.
결과 glb 는 노드 이름으로 모델을 꺼내 쓸 수 있습니다.
"""
import json, struct, sys, os, glob

SRC = sys.argv[1]                       # .../Assets/gltf
TEX = sys.argv[2]                       # .../Assets/textures/spacebits_texture.png
OUT = sys.argv[3]                       # .../3d/models/spacebits.glb

buf = bytearray()
views, accs, meshes, nodes = [], [], [], []

def pad4(b):
    while len(b) % 4:
        b += b'\0'
    return b

def add_view(data, target=None):
    global buf
    while len(buf) % 4:
        buf.append(0)
    v = {'buffer': 0, 'byteOffset': len(buf), 'byteLength': len(data)}
    if target:
        v['target'] = target
    buf.extend(data)
    views.append(v)
    return len(views) - 1

for path in sorted(glob.glob(os.path.join(SRC, '*.gltf'))):
    name = os.path.splitext(os.path.basename(path))[0]
    g = json.load(open(path))
    bin_path = os.path.join(SRC, g['buffers'][0]['uri'])
    raw = open(bin_path, 'rb').read()

    vmap = {}
    for i, v in enumerate(g['bufferViews']):
        off, ln = v.get('byteOffset', 0), v['byteLength']
        nv = add_view(raw[off:off + ln], v.get('target'))
        if 'byteStride' in v:
            views[nv]['byteStride'] = v['byteStride']
        vmap[i] = nv

    amap = {}
    for i, a in enumerate(g['accessors']):
        na = dict(a)
        na['bufferView'] = vmap[a['bufferView']]
        accs.append(na)
        amap[i] = len(accs) - 1

    prim = g['meshes'][0]['primitives'][0]
    meshes.append({'name': name, 'primitives': [{
        'attributes': {k: amap[v] for k, v in prim['attributes'].items()},
        'indices': amap[prim['indices']],
        'material': 0
    }]})
    nodes.append({'name': name, 'mesh': len(meshes) - 1})

img_view = add_view(open(TEX, 'rb').read())

doc = {
    'asset': {'version': '2.0', 'generator': 'merge-kit.py (KayKit Space Base Bits, CC0)'},
    'scene': 0,
    'scenes': [{'nodes': list(range(len(nodes)))}],
    'nodes': nodes,
    'meshes': meshes,
    'accessors': accs,
    'bufferViews': views,
    'buffers': [{'byteLength': len(buf)}],
    'materials': [{'name': 'spacebits', 'pbrMetallicRoughness': {
        'baseColorTexture': {'index': 0}, 'metallicFactor': 0, 'roughnessFactor': 0.6}}],
    'textures': [{'sampler': 0, 'source': 0}],
    'images': [{'mimeType': 'image/png', 'bufferView': img_view}],
    'samplers': [{'magFilter': 9729, 'minFilter': 9987, 'wrapS': 10497, 'wrapT': 10497}]
}

js = pad4(json.dumps(doc, separators=(',', ':')).encode('utf-8'))
bn = pad4(bytes(buf))
glb = struct.pack('<III', 0x46546C67, 2, 12 + 8 + len(js) + 8 + len(bn))
glb += struct.pack('<II', len(js), 0x4E4F534A) + js
glb += struct.pack('<II', len(bn), 0x004E4942) + bn
os.makedirs(os.path.dirname(OUT), exist_ok=True)
open(OUT, 'wb').write(glb)
print('%s — 모델 %d개, %.0f KB' % (OUT, len(nodes), len(glb) / 1024))
