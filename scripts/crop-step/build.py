"""잘라 둔 「기출 단계별 교재」를 업로드용 데이터 파일과 폴더로 만든다.

  python scripts/crop-step/build.py <자른폴더(교재폴더들이 있는 곳)> <쌓을폴더>

쪽 번호
  이 교재는 종이책이 아니라 이 PDF 자체를 인쇄해 쓰므로, PDF 쪽 번호(= 지면 아래 「| 3 |」)를
  그대로 page_no 로 넣는다. 교재별로 1부터 다시 시작한다.

정답 넣는 법 (중요)
  · ①~⑤ 가 들어 있으면 answer_kind='choice' + answer_text → **학생이 고르면 자동 채점**된다
  · 숫자뿐이면 'number' + answer_text → 학생이 숫자를 적으면 자동 채점
  · 그 밖(여러 칸짜리 답 등)은 'image' 로 두고 **answer_text 를 비운다**.
    (api/grade 는 answer_text 가 있으면 정답 그림에 서명을 안 해 준다 → 둘 다 넣으면 아무것도 안 보인다)
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
LEVEL = {'기초': '하', '유형별': '중', '기본': '중', '발전': '상', '심화': '상', None: '중'}
CIRCLE = '①②③④⑤'


def main():
    src, stage = sys.argv[1], sys.argv[2]
    tmap = json.load(io.open(os.path.join(HERE, 'typemap.json'), encoding='utf8'))

    rows, sol_index, miss = [], {}, []
    soldir = os.path.join(stage, '_해설')
    os.makedirs(soldir, exist_ok=True)

    for name in sorted(os.listdir(src)):
        folder = os.path.join(src, name)
        if not os.path.isdir(folder) or not os.path.exists(os.path.join(folder, 'items.json')):
            continue
        items = json.load(io.open(os.path.join(folder, 'items.json'), encoding='utf8'))
        ans = json.load(io.open(os.path.join(folder, 'answers.json'), encoding='utf8'))['answers']
        for p in items:
            no = p['no']
            code = tmap.get(p['typeTitle'] or '')
            if not code:
                miss.append(f"{name}/{no}/{p['typeTitle']}")
                continue
            n = int(code.split('-')[2])
            a = (ans.get(str(no)) or '').strip()
            if any(c in a for c in CIRCLE):
                kind, text = 'choice', ''.join(c for c in a if c in CIRCLE)
            elif re.fullmatch(r'-?[\d.,/]+', a):
                kind, text = 'number', a
            else:
                kind, text = 'image', None
            rows.append(dict(b='기출단계별', g='중1', s=2, n=n, t=TITLE[n], l=str(no), c=code,
                             d=LEVEL.get(p['step']), p=None, e=False, v=False, i=False,
                             k=kind, a=text, x='png', pg=p['page'] + 1,
                             dir=f'중1-2/기출단계별/{n:02d}'))
            out = os.path.join(stage, '중1-2', '기출단계별', f'{n:02d}')
            os.makedirs(out, exist_ok=True)
            shutil.copyfile(os.path.join(folder, 'q', f'{no:04d}.png'), os.path.join(out, f'{no}.png'))
            shutil.copyfile(os.path.join(folder, 'a', f'{no:04d}.png'), os.path.join(out, f'{no}).png'))
            s = os.path.join(folder, 's', f'{no:04d}.png')
            if os.path.exists(s):
                tag = f'{n:02d}_{no}'
                shutil.copyfile(s, os.path.join(soldir, f'{tag}.png'))
                sol_index[f'{n:02d}|{no}'] = dict(file=f'{tag}.png')

    json.dump(sol_index, io.open(os.path.join(soldir, 'index.json'), 'w', encoding='utf8'),
              ensure_ascii=False)
    json.dump(rows, io.open(os.path.join(os.path.dirname(HERE), 'problems_step_m1_2.json'),
                            'w', encoding='utf8'), ensure_ascii=False)

    keys = [(r['n'], r['l']) for r in rows]
    cnt, kcnt, dcnt = {}, {}, {}
    for r in rows:
        cnt[r['n']] = cnt.get(r['n'], 0) + 1
        kcnt[r['k']] = kcnt.get(r['k'], 0) + 1
        dcnt[r['d']] = dcnt.get(r['d'], 0) + 1
    io.open(os.path.join(stage, '_점검.txt'), 'w', encoding='utf8').write('\n'.join([
        f'문항 {len(rows)}개 · 해설 {len(sol_index)}개',
        f'번호 겹침 {len(keys) - len(set(keys))}개',
        f'유형코드 못 붙인 문항 {len(miss)}개 {miss[:6]}',
        f'정답 방식 {kcnt}', f'난이도 {dcnt}',
        '소단원별: ' + str(dict(sorted(cnt.items())))]))


if __name__ == '__main__':
    main()
