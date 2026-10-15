"""잘라 둔 RPM 중1-1 을 업로드용 데이터 파일과 폴더로 만든다.

  python scripts/crop-rpm/build.py <자른폴더(ch01..ch09 이 있는 곳)> <쌓을폴더>

나오는 것
  scripts/problems_rpm_m1_1.json          — upload-problems.mjs 가 읽는 파일
  <쌓을폴더>/중1-1/RPM/01/81.png          — 문제 그림
  <쌓을폴더>/중1-1/RPM/01/81).png         — 정답 그림
  <쌓을폴더>/_해설/0081.png + index.json  — 해설 그림 (crop-solutions/upload.mjs 용)
"""
import io
import json
import os
import shutil
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from eqfont import decode_text   # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
TITLE = {1: '소인수분해', 2: '최대공약수와 최소공배수', 3: '정수와 유리수', 4: '유리수의 계산',
         5: '문자의 사용과 식', 6: '일차방정식의 풀이', 7: '일차방정식의 활용',
         8: '좌표평면과 그래프', 9: '정비례와 반비례'}


def main():
    src, stage = sys.argv[1], sys.argv[2]
    tmap = json.load(io.open(os.path.join(HERE, 'typemap.json'), encoding='utf8'))
    bmap = json.load(io.open(os.path.join(HERE, 'badgemap.json'), encoding='utf8'))
    tbook = json.load(io.open(os.path.join(HERE, 'textbookmap.json'), encoding='utf8'))['규칙']
    rmap = json.load(io.open(os.path.join(HERE, 'restmap.json'), encoding='utf8'))

    rows, sol_index, miss = [], {}, []
    soldir = os.path.join(stage, '_해설')
    os.makedirs(soldir, exist_ok=True)

    for ci in range(1, 10):
        ch = f'{ci:02d}'
        folder = os.path.join(src, f'ch{ch}')
        items = json.load(io.open(os.path.join(folder, 'items.json'), encoding='utf8'))
        out = os.path.join(stage, '중1-1', 'RPM', ch)
        os.makedirs(out, exist_ok=True)
        for p in items:
            no = p['no']
            # 유형 → 배지 → 종합문제 차례로 찾는다
            if p['type']:
                tno, _, up = p['type']
                code = tmap[ch].get(('U' if up else '') + str(tno))
            elif p['badge']:
                # 배지만 보면 「소인수분해」 안에 거듭제곱까지 섞인다.
                # 묶음 지시문을 먼저 보고, 거기서도 못 가리면 배지로 떨어진다.
                ins = decode_text((p['instr'] or [''])[0])
                code = next((c for b, k, c in tbook if b == p['badge'][0] and (not k or k in ins)),
                            bmap.get(p['badge'][0]))
            else:
                code = rmap.get(str(no))
            if not code:
                miss.append(no)
            rows.append(dict(b='RPM', g='중1', s=1, n=ci, t=TITLE[ci], l=str(no), c=code,
                             d=p.get('level3'), p=None, e=bool(p['essay']), v=False,
                             i=bool(p['rep']), x='png', dir=f'중1-1/RPM/{ch}'))
            for sub, name in (('q', f'{no}.png'), ('a', f'{no}).png')):
                shutil.copyfile(os.path.join(folder, sub, f'{no:04d}.png'), os.path.join(out, name))
            s = os.path.join(folder, 's', f'{no:04d}.png')
            if os.path.exists(s):
                shutil.copyfile(s, os.path.join(soldir, f'{no:04d}.png'))
                sol_index[str(no)] = dict(file=f'{no:04d}.png')

    json.dump(sol_index, io.open(os.path.join(soldir, 'index.json'), 'w', encoding='utf8'),
              ensure_ascii=False)
    data = os.path.join(os.path.dirname(HERE), 'problems_rpm_m1_1.json')
    json.dump(rows, io.open(data, 'w', encoding='utf8'), ensure_ascii=False)

    ls = [r['l'] for r in rows]
    report = [f'문항 {len(rows)}개 · 해설 {len(sol_index)}개',
              f'번호 겹침 {len(ls) - len(set(ls))}개',
              f'유형코드 없는 문항 {len(miss)}개 {miss[:10]}']
    cnt = {}
    for r in rows:
        cnt[r['n']] = cnt.get(r['n'], 0) + 1
    report.append('단원별: ' + str(cnt))
    io.open(os.path.join(stage, '_점검.txt'), 'w', encoding='utf8').write('\n'.join(report))


if __name__ == '__main__':
    main()
