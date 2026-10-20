"""대본 쓰는 재료: 개념마다 토막 목록 + 토막 안 글자 줄(밑줄 찾기용) + 이어지는 필수예제 제목

  python scripts/lesson-video/materials.py --pdf <개념편 PDF> --cuts <cuts.json 폴더> --out <폴더>
결과: <out>/NN.json
"""
import argparse, json, os, re
import pymupdf


def lines_in(page, y0, y1):
    out = []
    for b in page.get_text('dict')['blocks']:
        if b['type'] != 0: continue
        for l in b['lines']:
            sp = [s for s in l['spans'] if s['text'].strip()]
            if not sp: continue
            yy = l['bbox'][1]
            if y0 - 2 <= yy <= y1:
                out.append(dict(y=round(yy), x=round(l['bbox'][0]), text=''.join(s['text'] for s in sp)))
    out.sort(key=lambda r: (r['y'], r['x']))
    return out


# 앱 단원표(standard_types, 공통수학2)의 대단원·소단원 이름
CHAPTER = {1: '도형의 방정식', 2: '집합과 명제', 3: '함수'}
SUB = {1: (1, '두 점 사이의 거리'), 2: (1, '선분의 내분점'), 3: (1, '직선의 방정식'), 4: (1, '점과 직선 사이의 거리'),
       5: (1, '원의 방정식'), 6: (1, '원과 직선의 위치 관계'), 7: (1, '평행이동'), 8: (1, '대칭이동'),
       9: (2, '집합의 뜻과 표현'), 10: (2, '집합의 연산'), 11: (2, '명제와 조건'), 12: (2, '명제의 역과 대우'),
       13: (2, '명제의 증명'), 14: (3, '함수의 뜻'), 15: (3, '합성함수'), 16: (3, '역함수'), 17: (3, '유리식'), 18: (3, '무리식')}
# PDF 글자층에서 숫자·기호가 빠지는 개념 이름은 손으로
TITLE_FIX = {7: '원의 방정식 (1)', 9: '원의 방정식 (2)', 22: '명제 p→q의 참, 거짓', 23: '‘모든’이나 ‘어떤’을 포함한 명제'}


def file_name(no, title, sub_no, page):
    ch = CHAPTER[SUB[sub_no][0]]
    safe = re.sub(r'[\/:*?"<>|]', '', title)
    return f"{ch}_{SUB[sub_no][1]}_{safe}_개념+유형 p{page:02d}"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--pdf', required=True); ap.add_argument('--cuts', required=True); ap.add_argument('--out', required=True)
    a = ap.parse_args()
    doc = pymupdf.open(a.pdf)
    allc = json.load(open(os.path.join(a.cuts, 'cuts.json'), encoding='utf-8'))
    os.makedirs(a.out, exist_ok=True)
    prev_sub = 1
    for i, c in enumerate(allc):
        # 이 개념 다음 쪽부터 다음 개념 첫 쪽 전까지의 필수예제 제목
        nxt = allc[i + 1]['pages'][0] if i + 1 < len(allc) else len(doc) + 1
        ex = []
        for pg in range(c['pages'][-1] + 1, nxt):
            t = [l.strip() for l in doc[pg - 1].get_text().split('\n') if l.strip()]
            for k in range(len(t) - 1):   # 예제 머리가 쪽 중간에 오는 경우도 있다(p38)
                if re.fullmatch(r'예제\d{2}', t[k]):
                    ex.append(dict(no=t[k][2:], title=t[k + 1], page=pg)); break
        cuts = []
        for ct in c['cuts']:
            pt = ct['parts'][0]
            cuts.append(dict(show=ct['file'].split('/')[-1][:-4], kind=ct['kind'], head=ct['head'],
                             image=os.path.join(a.cuts, ct['file']).replace(os.sep, '/'),
                             page=pt['page'], y0=round(pt['y0']), y1=round(pt['y1']),
                             more_pages=len(ct['parts']) > 1,
                             lines=lines_in(doc[pt['page'] - 1], pt['y0'], pt['y1'])))
        # 소단원: 이 개념 뒤 첫 필수예제가 문제은행에서 어느 소단원 유형인지로 정한다
        probs = json.load(open(os.path.join(os.path.dirname(__file__), '..', 'problems_ky_gn_cm2.json'), encoding='utf-8'))
        pg2sub = {q['pg']: int(q['c'].split('-')[1]) for q in probs}
        sub_no = next((pg2sub[e['page']] for e in ex if e['page'] in pg2sub), None) or prev_sub
        prev_sub = sub_no
        title = TITLE_FIX.get(c['no'], c['title'])
        meta = dict(no=c['no'], title=title, chapter=CHAPTER[SUB[sub_no][0]], sub_chapter=SUB[sub_no][1],
                    sub_no=sub_no, file=file_name(c['no'], title, sub_no, c['pages'][0]), pages=c['pages'],
                    cuts=cuts, examples=ex)
        json.dump(meta, open(os.path.join(a.out, f"{c['no']:02d}.json"), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
        print(c['no'], meta['file'], len(cuts), '토막', len(ex), '예제')


if __name__ == '__main__':
    main()
