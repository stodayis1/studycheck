"""풍산자 라이트유형 공통수학2 — 잘라 둔 것을 업로드용 데이터·폴더로 만든다.

  python rows_g2.py <쌓을폴더>      (작업 폴더에서 실행: q_meta.json · a_meta.json · out/ 필요)

유형
  · 기본 문항은 책 유형 배지가 있다 → map_g2.json 의 B2S 표로 옮긴다
  · 연습 문항은 배지가 없다 → 문제 글에 낱말 규칙을 걸어 정하고, 안 걸리면 단원 기본값
레벨 (원장님 기준: 3 = 쎈 B단계)
  · 기본 2 · 연습 3 · UP 표시 4
"""
import io, json, os, re, shutil, sys

HERE = os.path.dirname(os.path.abspath(__file__))
M = json.load(io.open('q_meta.json', encoding='utf8'))
A = json.load(io.open('a_meta.json', encoding='utf8'))
G = json.load(io.open(os.path.join(HERE, 'map_g2.json'), encoding='utf8'))
stage = sys.argv[1]

def norm(t):
    return re.sub(r'[\x00-\x1f`\s]', '', t or '')

rows, used_ex, hit_ex = [], 0, 0
for m in M:
    ch = m['ch']
    if m['sec'] == '기본':
        code = G['B2S'][f"{ch}-{m['btype']}"]
    else:
        used_ex += 1
        txt = m.get('txt', '')
        code = next((c for k, c in G['연습낱말'][str(ch)] if k in txt), None)
        if code:
            hit_ex += 1
        else:
            code = G['연습기본'][str(ch)]
    n = int(code.split('-')[1])
    up = 'UP' in m['tags']
    a = norm(A[m['l']]['t'])
    if re.fullmatch(r'[①②③④⑤]+', a):
        kind, text = 'choice', a
    elif re.fullmatch(r'-?\d+', a):
        kind, text = 'number', a
    else:
        kind, text = 'image', None
    lno = f"{ch:02d}{m['no']:03d}" if m['sec'] == '기본' else f"{ch:02d}S{m['no']:02d}"
    rows.append(dict(b='풍산자 라이트유형', g='공통수학2', s=1, n=n, t=G['소단원이름'][str(n)],
                     l=lno, c=code, d=None, p=m['sec'], e='서술형' in m['tags'], v=False, i=up,
                     x='png', lv=4 if up else (2 if m['sec'] == '기본' else 3),
                     k=kind, a=text, dir=f'공통수학2-1/풍산자 라이트유형/{n:02d}'))
    out = os.path.join(stage, '공통수학2-1', '풍산자 라이트유형', f'{n:02d}')
    os.makedirs(out, exist_ok=True)
    shutil.copyfile(f"out/q/{m['l']}.png", os.path.join(out, lno + '.png'))
    shutil.copyfile(f"out/a/{m['l']}_a.png", os.path.join(out, lno + ').png'))

json.dump(rows, io.open(os.path.join(HERE, '..', 'problems_psl_hc2.json'), 'w', encoding='utf8'),
          ensure_ascii=False)
from collections import Counter
print(f'문항 {len(rows)} · 유형 {len({r["c"] for r in rows})}가지 · 소단원 {len({r["n"] for r in rows})}개')
print(f'  연습 {used_ex}개 중 낱말로 정한 것 {hit_ex}개')
print('  정답방식', dict(Counter(r['k'] for r in rows)), '· 레벨', dict(Counter(r['lv'] for r in rows)))
keys = [(r['n'], r['l']) for r in rows]
print('  번호 겹침', len(keys) - len(set(keys)))
