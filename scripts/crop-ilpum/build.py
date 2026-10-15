"""잘라 둔 일품 중1(하)를 업로드용 데이터 파일과 폴더로 만든다.

  python scripts/crop-ilpum/build.py <자른폴더(단원폴더들이 있는 곳)> <쌓을폴더>

나오는 것
  scripts/problems_ilpum_m1_2.json
  <쌓을폴더>/중1-2/일품/01/16.png · 16).png   (문제·정답)
  <쌓을폴더>/_해설/0016.png + index.json      (해설, crop-solutions/upload.mjs 용)

번호 규칙
  · 본문 문항은 책에 인쇄된 번호 그대로 (1~140 등)
  · 대단원마무리는 번호가 1부터 다시 시작하므로 앞에 M 을 붙인다 (M1~M47)
"""
import io
import json
import os
import re
import shutil
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
TITLE = {1: '기본 도형', 2: '위치 관계', 3: '평행선', 4: '작도와 합동', 5: '다각형',
         6: '원과 부채꼴', 7: '다면체', 8: '회전체', 9: '입체도형의 겉넓이와 부피',
         10: '도수분포표', 11: '상대도수', 12: '대푯값'}
# 구간 → 난이도. 일품은 통째로 고난도 문제집이고, 핵심기출만 몸풀기다.
LEVEL = {'핵심기출': '중', '고난도': '상', 'Level1': '중', 'Level2': '상', '창의유형': '상'}


def main():
    src, stage = sys.argv[1], sys.argv[2]
    cmap = json.load(io.open(os.path.join(HERE, 'conceptmap.json'), encoding='utf8'))
    mmap = json.load(io.open(os.path.join(HERE, 'mmmap.json'), encoding='utf8'))

    rows, sol_index, miss = [], {}, []
    soldir = os.path.join(stage, '_해설')
    os.makedirs(soldir, exist_ok=True)

    for name in sorted(os.listdir(src)):
        folder = os.path.join(src, name)
        f = os.path.join(folder, 'items.json')
        if not os.path.isdir(folder) or not os.path.exists(f):
            continue
        items = json.load(io.open(f, encoding='utf8'))
        mm = '마무리' in name
        key = re.sub(r'^\d-\d', '', name).replace('대단원마무리', '') if mm else None
        for p in items:
            no = p['no']
            if mm:
                code = mmap[key].get(str(no))
                local = f'M{no}'
            else:
                code = cmap.get(f"{p['sub']}-{p['concept']}")
                local = str(no)
            if not code:
                miss.append(f'{name}/{no}')
                continue
            n = int(code.split('-')[2])
            rows.append(dict(b='일품', g='중1', s=2, n=n, t=TITLE[n], l=local, c=code,
                             d=LEVEL.get(p['sec']), p=None, e=False, v=p['sec'] == '창의유형',
                             i=False, x='png', dir=f'중1-2/일품/{n:02d}'))
            out = os.path.join(stage, '중1-2', '일품', f'{n:02d}')
            os.makedirs(out, exist_ok=True)
            shutil.copyfile(os.path.join(folder, 'q', f'{no:04d}.png'),
                            os.path.join(out, f'{local}.png'))
            shutil.copyfile(os.path.join(folder, 'a', f'{no:04d}.png'),
                            os.path.join(out, f'{local}).png'))
            s = os.path.join(folder, 's', f'{no:04d}.png')
            if os.path.exists(s):
                tag = f'{n:02d}_{local}'
                shutil.copyfile(s, os.path.join(soldir, f'{tag}.png'))
                sol_index[f'{n:02d}|{local}'] = dict(file=f'{tag}.png')

    json.dump(sol_index, io.open(os.path.join(soldir, 'index.json'), 'w', encoding='utf8'),
              ensure_ascii=False)
    json.dump(rows, io.open(os.path.join(os.path.dirname(HERE), 'problems_ilpum_m1_2.json'),
                            'w', encoding='utf8'), ensure_ascii=False)

    key2 = [(r['n'], r['l']) for r in rows]
    cnt = {}
    for r in rows:
        cnt[r['n']] = cnt.get(r['n'], 0) + 1
    report = [f'문항 {len(rows)}개 · 해설 {len(sol_index)}개',
              f'번호 겹침 {len(key2) - len(set(key2))}개',
              f'유형코드 못 붙인 문항 {len(miss)}개 {miss[:8]}',
              '소단원별: ' + str(dict(sorted(cnt.items())))]
    io.open(os.path.join(stage, '_점검.txt'), 'w', encoding='utf8').write('\n'.join(report))


if __name__ == '__main__':
    main()
