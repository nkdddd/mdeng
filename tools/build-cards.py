#!/usr/bin/env python3
"""포켓몬 카드 목록(data/pokemon_cards.xlsx) → js/cards.js

카드팩에서 나올 카드 데이터를 만들어요. 포켓몬 카드만 쓰고(서포트·아이템·스타디움·도구·에너지 제외),
희귀도(rarity)를 앱의 5단계로 묶어요.
    pip install openpyxl
    python3 tools/build-cards.py
"""
import json
import pathlib

import openpyxl

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / 'data' / 'pokemon_cards.xlsx'
OUT = ROOT / 'js' / 'cards.js'
IMG_PREFIX = 'https://cards.image.pokemonkorea.co.kr/data/'
SKIP = ('서포트', '아이템', '스타디움', '포켓몬의 도구', '특수 에너지', '기본 에너지')

# 희귀도 → 앱 등급: n 일반 · r 레어 · a 아트 레어 · s 슈퍼 레어 · u 스페셜
CLASS = {
    'C': 'n', 'U': 'n',
    'R': 'r', 'RR': 'r', 'RRR': 'r', 'PR': 'r', 'K': 'r', 'A': 'r',
    'AR': 'a', 'CHR': 'a', 'S': 'a',
    'SR': 's', 'HR': 's', 'SSR': 's', 'CSR': 's', 'BWR': 's', 'MA': 's',
    'SAR': 'u', 'UR': 'u', 'MUR': 'u',
}
STRONG = ('ex', 'EX', 'GX', ' V', 'VMAX', 'VSTAR', 'LV.X', 'BREAK', '메가')


def main():
    rows = list(openpyxl.load_workbook(SRC, read_only=True).active.iter_rows(values_only=True))
    head = rows[0]
    sets, cards = [], []
    for r in rows[1:]:
        c = dict(zip(head, r))
        kind = (c['card_type'] or '').strip()
        if not kind or kind.startswith(SKIP):
            continue
        url = c['image_url'] or ''
        if not url.startswith(IMG_PREFIX):
            continue
        rarity = (c['rarity'] or '').strip()
        name = str(c['name']).strip()
        # 희귀도가 비어 있는 옛날 카드: ex·V·GX 같은 강한 카드는 레어, 나머지는 일반
        cls = CLASS.get(rarity) or ('r' if any(s in name or s in kind for s in STRONG) else 'n')
        set_name = (c['set_name'] or '').strip()
        if set_name not in sets:
            sets.append(set_name)
        kind = ' · '.join(p.strip() for p in kind.split('|') if p.strip())
        cards.append([c['card_id'], name, kind, sets.index(set_name), rarity, cls, url[len(IMG_PREFIX):]])
    body = (
        '/* 포켓몬 카드 목록 — tools/build-cards.py가 만들어요. 직접 고치지 마세요.\n'
        ' * [카드 id, 이름, 종류, 세트 번호, 희귀도, 앱 등급, 그림 경로] */\n'
        f'window.CARD_IMG = {json.dumps(IMG_PREFIX)};\n'
        f'window.CARD_SETS = {json.dumps(sets, ensure_ascii=False)};\n'
        'window.CARDS = [\n' + ',\n'.join(json.dumps(x, ensure_ascii=False) for x in cards) + '\n];\n'
    )
    OUT.write_text(body, encoding='utf-8')
    from collections import Counter
    print(f'{len(cards)}장, 세트 {len(sets)}개, {OUT.stat().st_size // 1024}KB', dict(Counter(x[5] for x in cards)))


if __name__ == '__main__':
    main()
