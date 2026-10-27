"""학교알리미 공시 4-가 「교과별(학년별) 교수·학습 및 평가계획」 첨부를 내려받고, PDF 안에서 수학 쪽을 찾는다.

캡차 없이 받아진다(2026-10-27 화수중으로 확인). 받기는 표준 라이브러리만, 쪽 찾기는 pymupdf 가 있을 때만.

  python fetch_eval_plan.py <SHL_IDF_CD> <저장폴더> [--year 2026] [--find 수학]

SHL_IDF_CD 는 find_schools.py 가 주는 학교알리미 학교 열쇠(자료집 sources[].url 의 끝).
학기마다 차수가 있다(4월 = 1학기, 9월 = 2학기). 맨 위(가장 최근) 차수를 받는다 — 화면이 처음 여는 것과 같다.
"""
import argparse
import os
import re
import sys
import urllib.parse
import urllib.request

BASE = 'https://www.schoolinfo.go.kr'
ITEM = {  # 공시 4-가 — 학교 화면의 loadGongSi(...) 인자와 같다
    'GS_HANGMOK_CD': '43', 'GS_HANGMOK_NO': '4-가', 'GS_BURYU_CD': 'JG110',
    'JG_BURYU_CD': 'JG040', 'JG_HANGMOK_CD': '14', 'JG_GUBUN': '1',
}


def post(path, fields):
    data = urllib.parse.urlencode(fields, encoding='cp949').encode('ascii')
    req = urllib.request.Request(BASE + path, data=data, headers={'User-Agent': 'Mozilla/5.0'})
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.read(), r.headers


def main():
    sys.stdout.reconfigure(encoding='utf-8')  # 윈도 콘솔(cp949)에서도 한글·기호가 깨져 멈추지 않게
    ap = argparse.ArgumentParser()
    ap.add_argument('shl')
    ap.add_argument('out')
    ap.add_argument('--year', default='2026')
    ap.add_argument('--find', default='수학', help='PDF 에서 이 과목의 평가 쪽을 찾는다(빈 값이면 안 찾음)')
    a = ap.parse_args()
    os.makedirs(a.out, exist_ok=True)

    f = dict(ITEM, SHL_IDF_CD=a.shl, JG_YEAR=a.year, JG_YEAR2=a.year, PRE_JG_YEAR=a.year,
             CHOSEN_JG_YEAR=a.year, GS_TYPE='Y', SORT='BR', LOAD_TYPE='single')
    html, _ = post('/ei/pp/Pneipp_b43_s0p.do', f)
    s = html.decode('cp949', 'replace')
    chasu = re.search(r'name="JG_CHASU" value="(\d+)"', s)
    seqs = sorted(set(re.findall(r"getEiFile43\('(\d+)'\)", s)), key=int)
    names = re.findall(r'([^<>\n]+?\.(?:pdf|hwp|hwpx|xlsx|xls|docx|zip))\s*\(', s, flags=re.I)
    rounds = re.findall(r'\((\d)차\)\s*(\d{4})년\s*(\d{2})월', s)
    if not chasu or not seqs:
        print('첨부를 찾지 못했습니다 — 이 해에 공시가 없거나 화면 모양이 바뀌었습니다.', file=sys.stderr)
        sys.exit(1)
    print(f'공시 차수: {chasu.group(1)}차 (올라온 차수: {", ".join(f"{c}차 {y}.{m}" for c, y, m in rounds[:4])})')

    got = []
    for q in seqs:
        body, h = post('/servlets/EiFileDownLoad.do', {
            'SHL_IDF_CD': a.shl, 'JG_BURYU_CD': ITEM['JG_BURYU_CD'], 'JG_HANGMOK_CD': ITEM['JG_HANGMOK_CD'],
            'JG_GUBUN': '1', 'JG_YEAR': a.year, 'JG_CHASU': chasu.group(1), 'USE_YN': 'Y', 'FILE_SEQ': q})
        cd = h.get('Content-Disposition', '')
        m = re.search(r'filename=(.+)$', cd)
        name = urllib.parse.unquote(m.group(1).strip().rstrip(';').strip('"')) if m else (names[int(q)].strip() if int(q) < len(names) else f'file{q}')
        name = re.sub(r'[\\/:*?"<>|]', '_', name)
        path = os.path.join(a.out, name)
        with open(path, 'wb') as fp:
            fp.write(body)
        got.append(path)
        print(f'받음 {q}: {name} ({len(body) // 1024} KB)')

    if not a.find:
        return
    try:
        import pymupdf
    except ImportError:
        print('pymupdf 가 없어 쪽 찾기는 건너뜁니다. PDF 를 열어 「' + a.find + '과 평가」를 찾으세요.')
        return
    want = re.compile(r'평가의\s*종류와\s*반영\s*비율|반영\s*비율')
    subj = re.compile(re.escape(a.find) + r'\s*과|교과\s*[:：]?\s*' + re.escape(a.find))
    for path in got:
        if not path.lower().endswith('.pdf'):
            print(f'  {os.path.basename(path)}: PDF 가 아님 — 한글 파일은 직접 열어 읽습니다')
            continue
        doc = pymupdf.open(path)
        cur, hits = None, []
        for i, page in enumerate(doc):
            t = page.get_text()
            if subj.search(t):
                cur = i
            # 과목 머리말을 본 뒤 10쪽 안에 나오는 「반영 비율」 표 쪽을 후보로 둔다
            if cur is not None and i - cur <= 10 and want.search(t):
                hits.append(i + 1)
        print(f'  {os.path.basename(path)}: {len(doc)}쪽 · {a.find} 반영 비율 후보 쪽 {sorted(set(hits)) or "없음"}')


if __name__ == '__main__':
    main()
