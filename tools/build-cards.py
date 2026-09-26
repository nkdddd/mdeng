#!/usr/bin/env python3
"""포켓몬 카드 목록(data/pokemon_cards.xlsx) → js/cards.js

카드팩에서 나올 카드 데이터를 만들어요. 포켓몬 카드만 쓰고(서포트·아이템·스타디움·도구·에너지 제외),
희귀도(rarity)를 앱의 5단계로 묶어요.

앱 도감의 포켓몬마다 '관련 카드'도 정리해요 (CARD_REL):
  1. 그 포켓몬 카드 (피카츄 → 피카츄, 지우의 피카츄, 메가레쿠쟈 ex …)
  2. 진화 가족 카드 (꼬부기 → 어니부기·거북왕)
  3. 비슷한 포켓몬 카드 (1·2가 3장보다 적을 때): 전설·신화는 다른 전설·신화, 나머지는 같은 타입
포켓몬 정보는 data/pokeapi_ko.csv (PokeAPI 공식 한국어 이름·진화 가족·타입·전설 여부)
    pip install openpyxl
    python3 tools/build-cards.py
"""
import csv
import json
import pathlib
import random
import re
from collections import defaultdict

import openpyxl

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / 'data' / 'pokemon_cards.xlsx'
OUT = ROOT / 'js' / 'cards.js'
SPECIES = ROOT / 'data' / 'pokeapi_ko.csv'
DATA_JS = ROOT / 'js' / 'data.js'
SIMILAR_MAX = 120  # 비슷한 카드는 포켓몬마다 이만큼만
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


SUFFIX = {'ex', 'EX', 'V', 'VMAX', 'VSTAR', 'GX', 'BREAK', 'LV.X', 'V-UNION', '◇', 'δ', '프리즘스타', 'TAG', 'TEAM'}


def base_names(card_name):
    """카드 이름에서 포켓몬 이름만: 'M리자몽 EX' → 리자몽, '로켓단의 뮤츠 ex' → 뮤츠"""
    out = []
    for t in re.split(r'[\s&]+', card_name):
        if not t or t in SUFFIX:
            continue
        t = re.sub(r'^(M|메가|원시|다크|빛나는|찬란한)', '', t)
        if len(t) > 2:
            t = re.sub(r'(X|Y)$', '', t)
        t = re.sub(r'^.+의$', '', t)
        if t:
            out.append(t)
    return out


def related(cards):
    species = list(csv.DictReader(SPECIES.open(encoding='utf-8')))
    by_name = {r['name']: r for r in species}
    chain = defaultdict(list)
    for r in species:
        chain[r['chain']].append(r['name'])
    # 포켓몬 이름 → 카드 번호
    idx = defaultdict(list)
    for k, c in enumerate(cards):
        for n in set(base_names(c[1])):
            if n in by_name:
                idx[n].append(k)
    big = lambda r: r['legendary'] == '1' or r['mythical'] == '1'
    app_names = re.findall(r"\['([^']+)', '[^']*', '[^']*', \d+, '[^']*', '[a-z]'\]", DATA_JS.read_text(encoding='utf-8'))
    rng = random.Random(7)
    rel = {}
    for name in app_names:
        me = by_name[name]
        exact = sorted(set(idx.get(name, [])))
        family = sorted({k for n in chain[me['chain']] if n != name for k in idx.get(n, [])} - set(exact))
        similar = []
        if len(exact) + len(family) < 3:  # 관련 카드가 너무 적으면 비슷한 포켓몬 카드도 넣어요
            like = [r['name'] for r in species if r['name'] != name and r['chain'] != me['chain'] and big(r) == big(me) and (big(me) or r['type'] == me['type'])]
            similar = sorted({k for n in like for k in idx.get(n, [])})
            if len(similar) > SIMILAR_MAX:
                similar = sorted(rng.sample(similar, SIMILAR_MAX))
        rel[name] = [exact, family, similar]
        print(f'  {name:6} 그 포켓몬 {len(exact):3} · 진화 가족 {len(family):3} · 비슷한 {len(similar):3}')
    return rel


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
        '/* 도감 포켓몬마다 관련 카드 번호(CARDS 순서): [그 포켓몬, 진화 가족, 비슷한 포켓몬] */\n'
        f'window.CARD_REL = {json.dumps(related(cards), ensure_ascii=False, separators=(",", ":"))};\n'
    )
    OUT.write_text(body, encoding='utf-8')
    from collections import Counter
    print(f'{len(cards)}장, 세트 {len(sets)}개, {OUT.stat().st_size // 1024}KB', dict(Counter(x[5] for x in cards)))


if __name__ == '__main__':
    main()
