# 모델 출처

## Soldier.glb
three.js 예제 자산 (`mrdoob/three.js` → `examples/models/gltf/Soldier.glb`).
믹사모 뼈대와 Idle / Walk / Run 동작이 들어 있습니다.
라이선스: three.js 저장소의 예제 자산 라이선스를 따릅니다.

## spacebits.glb
**KayKit — Space Base Bits 1.0** (Kay Lousberg).
출처: https://github.com/KayKit-Game-Assets/KayKit-Space-Base-Bits-1.0
라이선스: **CC0 1.0 Universal** (퍼블릭 도메인, 출처 표시 의무 없음).

원본은 모델마다 `.gltf` + `.bin` 이 따로 있는 57 개 파일입니다.
`tools/merge-kit.py` 로 glb 한 개로 합쳐 두었습니다 — 텍스처 아틀라스가
한 장뿐이라 재질을 공유할 수 있고, 같은 모델끼리 InstancedMesh 로 묶으면
종류마다 드로우콜 하나로 그려집니다. 노드 이름은 원본 파일 이름 그대로라
`SpaceKit.geo['cargodepot_A']` 처럼 꺼내 씁니다.

다시 합치려면:

    python3 tools/merge-kit.py <원본>/Assets/gltf \
        <원본>/Assets/textures/spacebits_texture.png 3d/models/spacebits.glb
