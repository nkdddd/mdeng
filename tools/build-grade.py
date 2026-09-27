#!/usr/bin/env python3
"""1·2학년 받아쓰기 문구(data/grade12_dictation.xlsx) → js/grade.js

시트 '받아쓰기 문구'의 열: 번호 · 학년 · 유형 · 문구 · 소리 나는 대로 · 학습 포인트
학년·유형마다 받아쓰기 단계 하나가 돼요 (문제는 단계마다 5개씩 골라요).

틀린 까닭 힌트([글자, 소리, 종류])는 이렇게 만들어요.
  - 낱말·어구: '문구'와 '소리 나는 대로'를 띄어쓰기로 나눠, 달라진 낱말끼리 짝지어요.
  - 문장: '학습 포인트'의 '낱말[소리]'를 그대로 써요.
  - 종류(받침 이사·힘센 소리 …)는 자모를 비교해서 정하고, 모르면 시트의 유형을 따라요.
새 문구는 엑셀 마지막 행 아래에 같은 형식으로 넣고 다시 돌리면 돼요.
    pip install openpyxl
    python3 tools/build-grade.py
"""
import json
import pathlib
import re

import openpyxl

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / 'data' / 'grade12_dictation.xlsx'
OUT = ROOT / 'js' / 'grade.js'

CHO = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ'
JUNG = 'ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ'
JONG = ['', 'ㄱ', 'ㄲ', 'ㄳ', 'ㄴ', 'ㄵ', 'ㄶ', 'ㄷ', 'ㄹ', 'ㄺ', 'ㄻ', 'ㄼ', 'ㄽ', 'ㄾ', 'ㄿ', 'ㅀ',
        'ㅁ', 'ㅂ', 'ㅄ', 'ㅅ', 'ㅆ', 'ㅇ', 'ㅈ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ']
DOUBLE = set('ㄳㄵㄺㄻㄼㄽㄾㄿㅄ')
TENSE = {'ㄱ': 'ㄲ', 'ㄷ': 'ㄸ', 'ㅂ': 'ㅃ', 'ㅅ': 'ㅆ', 'ㅈ': 'ㅉ'}

# 시트 유형 → 단계 이름·아이콘·난이도·힌트 종류(모를 때)
KIND = {
    '기초(쉬운 받침)': ('쉬운 낱말', '🌱', 1, None),
    '연음': ('받침 이사', '🚚', 2, 'yeon'),
    '흉내 내는 말': ('흉내 내는 말', '🐰', 2, 'tense'),
    '된소리': ('힘센 소리', '💪', 2, 'tense'),
    'ㅎ 소리 변화': ('ㅎ 숨바꼭질', '🙈', 3, 'h'),
    '구개음화': ('ㅈ·ㅊ 변신', '🦋', 3, 'palatal'),
    '비음화': ('코맹맹이 소리', '🤧', 3, 'nasal'),
    '유음화': ('ㄹㄹ 쌍둥이', '👯', 3, 'liquid'),
    '겹받침': ('겹받침', '👬', 4, 'gyeop'),
    '헷갈리는 모음': ('헷갈리는 모음', '🦀', 3, 'ae'),
    '문장 받아쓰기': ('문장', '📜', 3, 'yeon'),
}


def jamo(ch):
    c = ord(ch) - 0xAC00
    if not 0 <= c < 11172:
        return None
    return CHO[c // 588], JUNG[c % 588 // 28], JONG[c % 28]


def classify(w, s, fallback, prefer=True):
    """글자(w)와 소리(s)를 견줘서 힌트 종류를 정해요"""
    a, b = [jamo(x) for x in w], [jamo(x) for x in s]
    if len(a) != len(b) or None in a or None in b:
        return fallback
    found = []
    for i, (x, y) in enumerate(zip(a, b)):
        nx = a[i + 1] if i + 1 < len(a) else None
        ny = b[i + 1] if i + 1 < len(b) else None
        if TENSE.get(x[0]) == y[0]:
            found.append('tense')
        if x[0] in 'ㅈㅊㅉ' and x[1] == 'ㅕ' and y[1] == 'ㅓ':
            found.append('spell')  # 쳐·져: [처·저]로 소리 나도 ㅕ로 써요
        if x[2] in ('ㄶ', 'ㅀ', 'ㅎ') or (nx and nx[0] == 'ㅎ' and ny and ny[0] != 'ㅎ'):
            found.append('h')
        elif x[2] in DOUBLE:
            found.append('gyeop')
        elif x[2] in ('ㄷ', 'ㅌ') and nx and nx[0] in ('ㅇ', 'ㅎ') and ny and ny[0] in ('ㅈ', 'ㅊ'):
            found.append('palatal')
        elif x[2] == 'ㄴ' and y[2] == 'ㄹ' or (x[2] == 'ㄹ' and nx and nx[0] == 'ㄴ' and ny and ny[0] == 'ㄹ'):
            found.append('liquid')
        elif x[2] != y[2] and y[2] in ('ㅇ', 'ㄴ', 'ㅁ') and nx and nx[0] in ('ㄴ', 'ㅁ'):
            found.append('nasal')
        elif x[2] and nx and nx[0] == 'ㅇ' and ny and ny[0] != 'ㅇ':
            found.append('yeon')
        elif nx and ny and TENSE.get(nx[0]) == ny[0]:
            found.append('tense')
        elif x[2] != y[2] and y[2] in ('ㄱ', 'ㄷ', 'ㅂ'):
            found.append('rep')
        elif x[1] == 'ㅖ' and y[1] == 'ㅔ':
            found.append('ye')
        elif x[1] == 'ㅢ' and y[1] != 'ㅢ':
            found.append('ui')
    if prefer and fallback in found:  # 단계 주제와 맞는 까닭을 먼저
        return fallback
    order = ['gyeop', 'h', 'palatal', 'spell', 'liquid', 'nasal', 'yeon', 'tense', 'rep', 'ye', 'ui']
    return min(found, key=order.index) if found else fallback


def vowel_hint(text):
    """소리는 같아도 헷갈리는 모음 글자: ㅢ · ㅚ/ㅙ · ㅖ · ㅐ/ㅔ (며칠은 맞춤법)"""
    words = re.sub(r'[.,!?]', '', text).split()
    for w in words:
        if w.startswith('며칠'):
            return [w, '몇일' + w[2:], 'spell']
    for v, k in (('ㅙ', 'wae'), ('ㅚ', 'wae'), ('ㅢ', 'ui'), ('ㅖ', 'ye'), ('ㅐ', 'ae'), ('ㅒ', 'ae'), ('ㅔ', 'ae')):
        for w in words:
            if v in [j[1] for j in map(jamo, w) if j]:
                return [w, w, k]
    return None


def hints_for(text, sound, point, kind):
    fb = KIND[kind][3]
    out = []
    if kind == '문장 받아쓰기':
        for w, s in re.findall(r'([^\s,\[\]]+)\[([^\]]+)\]', point or ''):
            s = s.split('/')[0]
            if w.replace(' ', '') != s.replace(' ', ''):
                out.append([w, s, classify(w, s, fb, prefer=False)])
        return out
    if sound and not sound.startswith('('):
        ws, ss = re.sub(r'[.,!?]', '', text).split(), re.sub(r'[.,!?]', '', sound).split()
        if len(ws) == len(ss):
            out = [[w, s, classify(w, s, fb)] for w, s in zip(ws, ss) if w != s]
    if kind == '헷갈리는 모음':
        v = vowel_hint(text)
        if v and not any(h[0] == v[0] and h[2] == v[2] for h in out):
            out.append(v)
    return out


def main():
    ws = openpyxl.load_workbook(SRC, read_only=True)['받아쓰기 문구']
    rows = list(ws.iter_rows(values_only=True))
    head = rows[0]
    levels = {}
    for r in rows[1:]:
        c = dict(zip(head, r))
        if not c.get('문구'):
            continue
        grade, kind = str(c['학년']).strip(), str(c['유형']).strip()
        key = (grade, kind)
        if key not in levels:
            name, icon, diff, _ = KIND[kind]
            levels[key] = {'id': f'g{len(levels) + 1}', 'grade': int(grade[0]), 'icon': icon, 'name': name,
                           'desc': str(c['학습 포인트']).strip() if kind != '문장 받아쓰기' else '문장 받아쓰기',
                           'diff': diff, 'items': []}
        text = str(c['문구']).strip()
        levels[key]['items'].append({'t': text, 'e': levels[key]['icon'],
                                     'hints': hints_for(text, str(c['소리 나는 대로'] or '').strip(), c['학습 포인트'], kind)})
    data = sorted(levels.values(), key=lambda l: (l['grade'], int(l['id'][1:])))
    for i, l in enumerate(data):
        l['id'] = f'g{i + 1}'
    body = ('/* 1·2학년 받아쓰기 단계 — tools/build-grade.py가 data/grade12_dictation.xlsx로 만들어요. 직접 고치지 마세요. */\n'
            'const GRADE_DICT = [\n' + ',\n'.join(json.dumps(l, ensure_ascii=False) for l in data) + '\n];\n')
    OUT.write_text(body, encoding='utf-8')
    for l in data:
        print(f"{l['id']:4} {l['grade']}학년 {l['name']:8} {len(l['items']):3}개")


if __name__ == '__main__':
    main()
