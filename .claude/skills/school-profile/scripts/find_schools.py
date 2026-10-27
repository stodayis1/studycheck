#!/usr/bin/env python3
"""학교알리미에서 지역의 학교 목록과 바로가기 주소를 찾는다 (전국 어디든).

쓰는 법
  python find_schools.py 경기 "성남시 분당구" 고            # 그 구의 고등학교 전부
  python find_schools.py 서울 강남구 중 --name 대치         # 이름에 「대치」가 들어간 중학교만
  python find_schools.py 경기 - 고 --name 낙생              # 구를 모를 때: 도 전체를 훑어 이름으로 찾기
  python find_schools.py 경기 "고양시 덕양구" 고 --check --json out.json

  학교급: 초 · 중 · 고 · 특수
  --check  주소마다 열어 <title> 이 그 학교인지 확인한다 (넣기 전에 꼭)
  --json   결과를 파일로 저장 [{official_name, shl_idf_cd, url, sido, sigungu, checked}]

인증키·캡차 없이 학교알리미 화면이 쓰는 json 을 그대로 부른다. 표준 라이브러리만 쓴다.
"""
import argparse, json, re, sys, urllib.parse, urllib.request

BASE = 'https://www.schoolinfo.go.kr'
LEVEL = {'초': '02', '중': '03', '고': '04', '특수': '05'}
UA = {'User-Agent': 'Mozilla/5.0 (school-profile skill)'}


def get(path, data=None):
    body = urllib.parse.urlencode(data).encode() if data is not None else None
    req = urllib.request.Request(BASE + path, data=body, headers=UA)
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read()


def sidos():
    # 시도 코드는 바뀐다(예: 전남광주통합특별시) — 고정해 두지 않고 화면에서 읽는다. 화면은 cp949.
    html = get('/ei/ss/pneiss_a03_s0.do').decode('cp949', 'replace')
    return dict((nm.strip(), cd) for cd, nm in re.findall(r'for="sidoCode(\d+)">([^<]+)', html))


def pick(table, word, what):
    hits = [k for k in table if word.replace(' ', '') in k.replace(' ', '')]
    if len(hits) == 1:
        return hits[0]
    exact = [k for k in hits if k.replace(' ', '') == word.replace(' ', '')]
    if len(exact) == 1:
        return exact[0]
    sys.exit(f'{what} 「{word}」를 하나로 못 골랐어요. 후보: {", ".join(hits) or "없음"}\n전체: {", ".join(table)}')


def sigungus(sido_cd):
    rows = json.loads(get('/ei/ss/pneiss_a03_s0_sigungu_json.do', {'SIDO_CODE': sido_cd}))
    return dict((r['ADRCD_ID_LAST_NM'], r['ADDR_CD_ID']) for r in rows)


def schools(level, sido_cd, gugun_cd):
    return json.loads(get('/ei/ss/pneiss_a03_s0_school_json.do',
                          {'HG_JONGRYU_GB': level, 'SIDO_CODE': sido_cd, 'GUGUN_CODE': gugun_cd}))


def check(url, name):
    html = urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=30).read().decode('cp949', 'replace')
    m = re.search(r'<title>(.*?)</title>', html, re.S)
    return bool(m and m.group(1).strip().startswith(name))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('sido'); ap.add_argument('sigungu', help='모르면 -'); ap.add_argument('level', choices=LEVEL)
    ap.add_argument('--name', default=''); ap.add_argument('--check', action='store_true'); ap.add_argument('--json')
    a = ap.parse_args()

    sd = sidos(); sido = pick(sd, a.sido, '시도')
    sg = sigungus(sd[sido])
    # 「고양시」처럼 구가 있는 시는 시 자체도 목록에 있다 — 구를 모르면 도 전체를 훑는다
    targets = list(sg.items()) if a.sigungu == '-' else [(pick(sg, a.sigungu, '시군구'), None)]
    targets = [(k, sg[k]) for k, _ in targets]

    out, seen = [], set()
    for sgg_nm, sgg_cd in targets:
        for s in schools(LEVEL[a.level], sd[sido], sgg_cd):
            if a.name and a.name not in s['SHL_NM']: continue
            if s['SHL_IDF_CD'] in seen: continue
            seen.add(s['SHL_IDF_CD'])
            url = f"{BASE}/ei/ss/Pneiss_b01_s0.do?SHL_IDF_CD={s['SHL_IDF_CD']}"
            row = {'official_name': s['SHL_NM'], 'shl_idf_cd': s['SHL_IDF_CD'], 'url': url, 'sido': sido, 'sigungu': sgg_nm}
            if a.check: row['checked'] = check(url, s['SHL_NM'])
            out.append(row)
            print('\t'.join([row['sigungu'], row['official_name'], url] + (['확인됨' if row.get('checked') else '✗ 확인 실패'] if a.check else [])))

    print(f'\n{sido} {a.sigungu if a.sigungu != "-" else "(전체)"} {a.level} — {len(out)}곳', file=sys.stderr)
    if a.check and not all(r['checked'] for r in out):
        print('✗ 확인 실패한 주소가 있어요. 넣지 말고 학교알리미에서 직접 열어 보세요.', file=sys.stderr)
    if a.json:
        json.dump(out, open(a.json, 'w', encoding='utf-8'), ensure_ascii=False, indent=2)


if __name__ == '__main__':
    main()
