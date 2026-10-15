"""개념원리 RPM(한글→PDF) 한 단원에서 문항 구조를 뽑는다.

이 교재는 글자층이 살아 있어서 그림을 추측할 필요가 없다. 지면에서 바로 읽는다.
  · 문제 번호  : 크기 15, 벽돌색(13062738), 「49.」 꼴
  · 유형 머리말: 「유형 03」 + 오른쪽에 제목
  · 교과서 구간: 「01-2」 배지 + 제목, 그 아래 「[0013~0018] …」 묶음 지시문
  · 난이도     : 「상중하」 세 동그라미 중 칠해진 것 (5단계: 하·중하·중·상중·상)
  · 대표 문제 / 서술형 : 노랑 배지 글자
  · 미주 번호  : 문제 번호와 같다 → 뒤쪽 「49) 답. …」 과 1:1

쓰는 법
  python scripts/crop-rpm/extract.py "<단원.pdf>" <나갈폴더>
  결과: <나갈폴더>/items.json
"""
import json
import os
import re
import sys

import numpy as np
import pymupdf

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from eqfont import decode_text   # noqa: E402

NUM_SIZE = 15.0          # 문제 번호 글자 크기
NUM_COLOR = 13062738     # 벽돌색
Z = 4                    # 난이도 동그라미를 볼 때 쓰는 배율


def lines_of(page):
    out = []
    for b in page.get_text('dict')['blocks']:
        if b['type'] != 0:
            continue
        for l in b['lines']:
            t = ''.join(s['text'] for s in l['spans'])
            if not t.strip():
                continue
            s0 = l['spans'][0]
            out.append(dict(bbox=l['bbox'], text=t.strip(), size=s0['size'],
                            color=s0['color'], font=s0['font']))
    return out


def difficulty(im, bbox):
    """「상중하」 세 동그라미 중 칠해진 것을 읽어 5단계 라벨로 돌려준다."""
    x0, y0, x1, y1 = [v * Z for v in bbox]
    sub = im[int(y0):int(y1), int(x0):int(x1)]
    if sub.size == 0:
        return None
    w = sub.shape[1] // 3
    on = []
    for k in range(3):
        c = sub[:, k * w:(k + 1) * w]
        mx = c.max(2)
        mn = c.min(2)
        on.append(float((((mx - mn) > 25) & (c.mean(2) < 245)).mean()))
    lab = ''.join('상중하'[k] for k in range(3) if on[k] > 0.25)
    return lab or None


# 5단계를 앱의 세 단계(하/중/상)로 모은다
LEVEL3 = {'하': '하', '중하': '하', '중': '중', '상중': '상', '상': '상'}


def main():
    pdf, out = sys.argv[1], sys.argv[2]
    os.makedirs(out, exist_ok=True)
    d = pymupdf.open(pdf)
    items, cur_type, cur_badge, cur_instr = [], None, None, None
    allmarks = []
    cur_sec = '교과서'   # 교과서 → 유형 익히기 → 시험에 꼭 나오는 문제 → 서술형 주관식 → 실력 UP

    for pi in range(len(d)):
        page = d[pi]
        ls = lines_of(page)
        mid = page.rect.width / 2
        pm = page.get_pixmap(matrix=pymupdf.Matrix(Z, Z))
        im = np.frombuffer(pm.samples, np.uint8).reshape(pm.height, pm.width, pm.n)[..., :3].astype(int)

        # 이 쪽에 있는 표시들을 자리와 함께 모아 둔다
        marks = []
        for l in ls:
            t, bb = l['text'], l['bbox']
            # 「유형 03」 과 「유형UP 09」 두 가지가 있고,
            # 제목이 같은 줄에 붙어 오기도 하고 옆에 따로 서기도 한다 — 둘 다 받는다.
            mt = re.match(r'^유형\s*(UP)?\s*(\d{1,2})\b(.*)$', t)
            if mt:
                title = mt.group(3).strip()
                if not title:
                    title = next((m['text'] for m in ls
                                  if abs(m['bbox'][1] - bb[1]) < 14 and m['bbox'][0] > bb[0] + 45
                                  and m['text'] not in ('중요',)), '')
                marks.append(('type', bb, (int(mt.group(2)), decode_text(title).strip(),
                                           bool(mt.group(1)))))
            elif re.fullmatch(r'\d{2}-\d{1,2}', t):
                title = next((m['text'] for m in ls
                              if abs(m['bbox'][1] - bb[1]) < 6 and m['bbox'][0] > bb[0] + 40), '')
                marks.append(('badge', bb, (t, title, list(bb))))
            elif re.match(r'^\[\d{4}~\d{4}\]', t):
                marks.append(('instr', bb, [t, list(bb), pi]))
            elif t.replace(' ', '') in ('유형익히기', '시험에:꼭나오는문제', '서술형주관식', '실력UP'):
                marks.append(('sec', bb, t.replace(' ', '')))
            elif t == '상중하':
                marks.append(('diff', bb, difficulty(im, bb)))
            elif t == '중요':
                # 다음 유형 머리말에 붙는 딱지. 머리말보다 살짝 위에 찍혀 있어서
                # 멈춤 자리로 세어 두지 않으면 앞 문제 그림 밑에 딸려 들어간다.
                marks.append(('note', bb, True))
            elif t == '대표 문제':
                marks.append(('rep', bb, True))
            elif t == '서술형':
                marks.append(('essay', bb, True))
            # 번호는 책 전체를 통틀어 이어진다 — 뒷단원은 네 자리(1000번대)까지 간다
            elif abs(l['size'] - NUM_SIZE) < 0.6 and l['color'] == NUM_COLOR:
                mn = re.match(r'^(\d{1,4})\.', t)
                if mn:
                    marks.append(('no', bb, int(mn.group(1))))

        # 단(컬럼) → 위에서 아래로
        marks.sort(key=lambda m: (0 if m[1][0] < mid else 1, m[1][1]))

        for kind, bb, val in marks:
            allmarks.append(dict(page=pi, kind=kind, x=bb[0], y=bb[1], y1=bb[3], x1=bb[2]))
        for kind, bb, val in marks:
            col = 0 if bb[0] < mid else 1
            if kind == 'sec':
                cur_sec = val
                cur_type = cur_badge = cur_instr = None
            elif kind == 'type':
                # 04단원처럼 「유형 익히기」 큰 제목이 아예 없는 단원이 있다.
                # 유형 머리말이 처음 나오는 곳이 곧 유형 익히기 구간의 시작이다.
                if cur_sec == '교과서':
                    cur_sec = '유형익히기'
                cur_type, cur_badge, cur_instr = val, None, None
            elif kind == 'badge':
                cur_badge, cur_type, cur_instr = val, None, None
            elif kind == 'instr':
                cur_instr = val
            elif kind == 'no':
                items.append(dict(no=val, page=pi, col=col, y=bb[1], x=bb[0], sec=cur_sec,
                                  type=cur_type, badge=cur_badge, instr=cur_instr,
                                  diff=None, rep=False, essay=False))
            elif items and kind in ('diff', 'rep', 'essay'):
                # 번호 바로 옆(같은 줄)에 붙는 표시다
                last = items[-1]
                if last['page'] == pi and abs(last['y'] - bb[1]) < 26:
                    if kind == 'diff':
                        last['diff'] = val
                    else:
                        last[kind] = True

    # 뒤쪽 정답 구간에서 번호가 다시 1부터 시작하므로, 문제 구간만 남긴다
    probs, seen = [], set()
    for it in items:
        if it['no'] in seen:
            break
        seen.add(it['no'])
        probs.append(it)

    for p in probs:
        p['level3'] = LEVEL3.get(p['diff'] or '', None)
    json.dump(probs, open(os.path.join(out, 'items.json'), 'w', encoding='utf8'), ensure_ascii=False)
    json.dump(allmarks, open(os.path.join(out, 'marks.json'), 'w', encoding='utf8'), ensure_ascii=False)

    nums = [p['no'] for p in probs]
    gap = [n for n in range(min(nums), max(nums) + 1) if n not in set(nums)] if nums else []
    print(f'문항 {len(probs)}개 · 번호 {min(nums)}~{max(nums)}' + (f' · 빠진 번호 {gap}' if gap else ' · 빠진 번호 없음'))
    scnt = {}
    for p in probs:
        scnt[p['sec']] = scnt.get(p['sec'], 0) + 1
    print('   구간별:', scnt)
    noType = sum(1 for p in probs if not p['type'] and not p['badge'])
    print(f'   유형·배지가 안 붙은 문항 {noType}개 (따로 분류해야 함)')


if __name__ == '__main__':
    main()
