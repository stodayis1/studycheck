"""중학교 개념+유형 개념편 PDF → 강의 토막 그림 + 대본 재료 (공통수학용 concept_cuts.py + materials.py 를 한 번에)

  python scripts/lesson-video/concept_cuts_mid.py --pdf "<개념편 PDF>" --grade 중1 --semester 1 --out "<영상 폴더>"

중학교 교재 짜임 (2022개정 개념플러스유형 개념편):
  · 단원 첫 쪽: 큰 제목(RixRakSans 22pt, 예 「소인수분해」 + 번호 01)
  · 쪽마다 개념 상자 1~3개: 번호 Lato-Bold 18pt + 상자 제목 YDVYGO14 10.8pt
  · 상자 아래 「개념 확인」(RixDefyKid 「개념/확인」) → 「필수 문제」(OTOmniGothicH)
  · 라이트판(중3-2): 단원 제목 OTOmniGulimB 19.8pt, 상자 번호 BMDoHyeon 18pt, 「개념 확인」·「필수 문제」 머리는 그림이라
    개념 확인은 상자 토막 안에 같이 들어간다(대본에서 clip 으로 따로 크게 보여 준다)
강의 한 편 = 한 쪽에 이어 붙은 개념 상자들(각각 토막 하나) + 그 뒤 개념 확인(토막 하나).
필수 문제는 강의에 넣지 않고 「이어서 풀 문제」(examples)로만 적는다 — 다음 쪽에 이어지는 필수 문제도 앞 강의 몫.

결과
  <out>/_토막/NN/cut_KK.png, <out>/_토막/cuts.json
  <out>/_재료/NN.json   (materials.py 와 같은 꼴 + 토막마다 x0, 단원 section, 표준 유형 후보 type_choices)
소단원(sub_chapter)은 DB standard_types(grade, semester)의 소단원. --map '{"단원 이름": 소단원번호, …}' 로 교재 단원 → 소단원을 적어 준다
(교재 단원이 문제은행 소단원보다 잘게 나뉘어 이름만으로는 틀리게 맞는다 — 예 「정수와 유리수의 덧셈과 뺄셈」 → 「유리수의 계산」).
"""
import argparse, json, os, re
import pymupdf

X0, X1, FOOT, DPI = 60, 562, 772, 220
PANEL = False   # --panel: 중2-1 판 (아래 panel_of). 옛 판(중1·중2-2·중3-2) 결과가 바뀌지 않게 따로 켠다


def lines_of(p):
    out = []
    for b in p.get_text('dict')['blocks']:
        if b['type']: continue
        for l in b['lines']:
            sp = [s for s in l['spans'] if s['text'].strip()]
            if sp: out.append(dict(x=l['bbox'][0], y=l['bbox'][1], y1=l['bbox'][3], font=sp[0]['font'], size=sp[0]['size'],
                                   text=''.join(s['text'] for s in sp).strip()))
    return sorted(out, key=lambda r: (r['y'], r['x']))


def clean(t):
    """제어 문자·좁은 빈칸 정리, 수식 글꼴의 \\·_ 는 ×·÷ (중2-1 「(단항식)\\(다항식)」)"""
    if not PANEL: return t
    t = re.sub(r'[\x00-\x1f\u200b-\u200d]', '', t).replace('\\', '×').replace('_', '÷')
    return re.sub(r' +', ' ', re.sub(r'[\u2000-\u200a]', ' ', t)).strip()   # 얇은 빈칸(U+2005·2006)은 파일 이름·화면에서 □ 로 깨진다


def marks(p):
    ms = []
    for r in lines_of(p):
        f, s, t = r['font'], r['size'], clean(r['text'])
        if (f.startswith('RixRakSans') and s > 20) or (f.startswith('OTOmniGulimB') and 19 < s < 21 and r['y'] < 70): ms.append(dict(k='sec', y=r['y'], t=re.sub(r'\d+$', '', t).strip()))
        elif f.startswith(('Lato-Bold', 'BMDoHyeon')) and abs(s - 18) < .5 and r['x'] < 130 and t.isdigit(): ms.append(dict(k='num', y=r['y'], t=t))
        elif (f.startswith('YDVYGO14') and abs(s - 10.8) < .4 or f.startswith('NPBE') and 10.5 < s < 11.5) and r['x'] < 135: ms.append(dict(k='head', y=r['y'], t=t))
        elif f.startswith('RixDefyKid') and t == '개념': ms.append(dict(k='chk', y=r['y']))
        elif f.startswith('OTOmniGothicH') and '필수' in t: ms.append(dict(k='ex', y=r['y']))
        elif PANEL and f.startswith('DIN-Black') and abs(s - 14) < .5 and 130 < r['x'] < 175 and t.isdigit(): ms.append(dict(k='ex', y=r['y']))   # 중2-1: 「필수 문제」 머리가 그림, 번호만 글자
        elif f.startswith('THEJung'): ms.append(dict(k='ext', y=r['y'], t=t.replace('\x08', '').strip()))
    ms.sort(key=lambda m: m['y'])
    # 상자 번호 + 바로 옆 제목 합치기, 필수 문제 + 그 아래 제목 줄(1~4줄) 합치기
    out, last_ext = [], -99
    for m in ms:
        if PANEL and m['k'] == 'ext' and out and out[-1]['k'] == 'ex' and m['y'] - last_ext < 14:
            out[-1]['title'] += ' ' + m['t']; last_ext = m['y']; continue    # 세 줄 넘는 제목(중2-1)
        if m['k'] == 'ext': last_ext = m['y']
        if m['k'] == 'head' and out and out[-1]['k'] == 'num' and m['y'] - out[-1]['y'] < 12 and 'title' not in out[-1]:
            out[-1]['title'] = m['t']; continue
        if m['k'] == 'head' and out and out[-1]['k'] == 'num' and out[-1].get('title') and m['y'] - out[-1]['y'] < 30:
            out[-1]['title'] += ' ' + m['t']; continue          # 두 줄 제목
        if m['k'] == 'ext' and out and out[-1]['k'] == 'ex' and m['y'] - out[-1]['y'] < 45:
            out[-1]['title'] = (out[-1].get('title', '') + ' ' + m['t']).strip(); continue
        if m['k'] == 'ext':   # 「필수 문제」 머리가 그림이라 글자로 안 잡히는 판(중3-2): 옆 제목 줄로 자리를 잡는다
            out.append(dict(k='ex', y=m['y'] - 17, title=m['t'])); continue
        if m['k'] in ('head', 'ext'): continue
        out.append(m)
    return out


def panel_of(p):
    """중2-1 판(쪽 너비 609): 개념 상자들을 두른 큰 바탕 사각형. 짝수·홀수 쪽이 좌우로 11pt 어긋나 x 도 여기서 읽는다"""
    if not PANEL: return None
    rs = [d['rect'] for d in p.get_drawings() if d['rect'].width > 400 and 60 < d['rect'].y0 < 100 and d['rect'].height < 700]
    return max(rs, key=lambda r: r.height) if rs else None


def bottom_of(p):
    ys = [r['y1'] for r in lines_of(p) if r['y1'] < FOOT - 20]
    return min(FOOT - 20, max(ys) + 8) if ys else FOOT - 20


def sub_chapters(grade, semester):
    """standard_types 의 소단원 목록 (.env.local 의 Supabase 키로 읽는다)"""
    import urllib.request
    env = {}
    for line in open('.env.local', encoding='utf-8'):
        m = re.match(r'\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$', line)
        if m: env[m[1]] = m[2].strip().strip('"\'')
    url = (f"{env['NEXT_PUBLIC_SUPABASE_URL']}/rest/v1/standard_types?select=code,chapter_no,chapter_title,sub_chapter_no,sub_chapter_title,type_title"
           f"&grade=eq.{urllib.parse.quote(grade)}&semester=eq.{semester}&order=code")
    req = urllib.request.Request(url, headers={'apikey': env['SUPABASE_SERVICE_ROLE_KEY'], 'Authorization': 'Bearer ' + env['SUPABASE_SERVICE_ROLE_KEY']})
    rows = json.load(urllib.request.urlopen(req))
    subs = {}
    for r in rows:
        s = subs.setdefault(r['sub_chapter_no'], dict(no=r['sub_chapter_no'], title=r['sub_chapter_title'], chapter=r['chapter_title'], types=[]))
        s['types'].append(dict(code=r['code'], title=r['type_title']))
    return [subs[k] for k in sorted(subs)]


def main():
    import urllib.parse  # noqa: F401  (sub_chapters 에서 씀)
    ap = argparse.ArgumentParser()
    ap.add_argument('--pdf', required=True); ap.add_argument('--out', required=True)
    ap.add_argument('--grade', required=True); ap.add_argument('--semester', type=int, required=True)
    ap.add_argument('--map', required=True, help='JSON: {"교재 단원 이름": 소단원 번호}')
    ap.add_argument('--panel', action='store_true', help='중2-1 판: 개념 확인·필수 문제 머리가 그림, 바탕 사각형으로 자리를 잡는다')
    a = ap.parse_args()
    global PANEL; PANEL = a.panel
    doc = pymupdf.open(a.pdf)
    subs = sub_chapters(a.grade, a.semester)

    # 1) 강의 단위로 묶기
    lectures, section, cur = [], None, None
    for pi, p in enumerate(doc):
        ms = marks(p)
        nums = [m for m in ms if m['k'] == 'num']
        for m in ms:
            if m['k'] == 'sec': section = m['t']
        if not nums:
            # 개념 상자가 없는 쪽: 앞 강의에 이어지는 필수 문제만 챙긴다 (개념 익히기·단원 다지기 쪽이 나오면 끊긴다)
            if cur and any(m['k'] == 'ex' for m in ms) and pi == cur['last'] + 1 and not any(r['text'].startswith(('개념 익히기', '단원 다지기')) for r in lines_of(p)):
                cur['examples'] += [dict(title=m.get('title', ''), page=pi + 1) for m in ms if m['k'] == 'ex']; cur['last'] = pi
            else:
                cur = None
            continue
        bottom = bottom_of(p)
        pan = panel_of(p)
        if pan and not any(m['k'] == 'chk' for m in ms):
            # 「개념 확인」 머리가 그림이라 글자로 안 잡힌다: 바탕 사각형 아래부터 필수 문제 전까지가 개념 확인
            first_ex = min([m['y'] for m in ms if m['k'] == 'ex' and m['y'] > pan.y1] + [bottom])
            # 오른쪽에만 붙은 「용어」 쪽지는 개념 확인이 아니다 → 왼쪽에서 시작하는 글이 있어야 (중2-1 p34)
            if any(pan.y1 + 4 < r['y'] < first_ex - 4 and r['x'] < pan.x0 + 150 for r in lines_of(p)): ms.append(dict(k='chk', y=pan.y1 + 6)); ms.sort(key=lambda m: m['y'])
        px0, px1 = (pan.x0 - 6, pan.x1 + 6) if pan else (X0, X1)
        first_sec = any(m['k'] == 'sec' for m in ms)
        cut_list, i = [], 0
        boxes = [m for m in ms if m['k'] in ('num', 'chk', 'ex')]
        for k, m in enumerate(boxes):
            nxt = boxes[k + 1]['y'] if k + 1 < len(boxes) else bottom
            if m['k'] == 'num':
                end = nxt - 6
                cut_list.append(dict(kind='개념', head=m.get('title', ''), page=pi + 1, y0=m['y'] - 8, y1=end, x0=px0, x1=px1))
            elif m['k'] == 'chk':
                cut_list.append(dict(kind='check', head='개념 확인', page=pi + 1, y0=m['y'] - 6, y1=nxt - 10, x0=px0, x1=px1))
        cur = dict(section=section, pages=[pi + 1], last=pi, cuts=cut_list, first_sec=first_sec,
                   heads=[m.get('title', '') for m in nums],
                   examples=[dict(title=m.get('title', ''), page=pi + 1) for m in ms if m['k'] == 'ex'])
        lectures.append(cur)

    # 2) 단원 → 소단원 (--map)
    smap, by_no = json.loads(a.map), {s['no']: s for s in subs}
    miss = sorted({L['section'] for L in lectures if L['section'] not in smap})
    if miss: raise SystemExit('--map 에 없는 단원: ' + ', '.join(miss))
    for L in lectures: L['sub'] = by_no[smap[L['section']]]

    # 3) 그림 + 재료
    tdir, mdir = os.path.join(a.out, '_토막'), os.path.join(a.out, '_재료')
    os.makedirs(tdir, exist_ok=True); os.makedirs(mdir, exist_ok=True)
    allc = []
    for n, L in enumerate(lectures, 1):
        d = os.path.join(tdir, f'{n:02d}'); os.makedirs(d, exist_ok=True)
        title = ', '.join(h for h in L['heads'] if h) or L['section']
        safe = re.sub(r'[\\/:*?"<>|{}]', '', title)
        S = L['sub']
        file = f"{S['chapter']}_{S['title']}_{safe}_개념+유형 p{L['pages'][0]:02d}"
        cuts = []
        for k, c in enumerate(L['cuts'], 1):
            page = doc[c['page'] - 1]
            if PANEL:   # 토막 안에서 시작해 아래로 삐져나간 「보충」 쪽지 상자는 끝까지 담는다 (중2-1 p32)
                tails = [d['rect'].y1 for d in page.get_drawings() if 60 < d['rect'].width < 300 and c['y0'] < d['rect'].y0 < c['y1'] < d['rect'].y1 < c['y1'] + 120]
                if tails: c['y1'] = max(tails) + 4
            pix = page.get_pixmap(dpi=DPI, clip=pymupdf.Rect(c['x0'], c['y0'], c['x1'], c['y1']))
            img = os.path.join(d, f'cut_{k:02d}.png'); pix.save(img)
            lines = [dict(y=round(r['y']), x=round(r['x']), text=r['text']) for r in lines_of(page) if c['y0'] - 2 <= r['y'] <= c['y1']]
            cuts.append(dict(show=f'cut_{k:02d}', kind=c['kind'], head=c['head'], image=img.replace(os.sep, '/'), page=c['page'],
                             y0=round(c['y0']), y1=round(c['y1']), x0=round(c['x0']), more_pages=False, lines=lines))
        ex = [dict(no=f'{k:02d}', title=e['title'], page=e['page']) for k, e in enumerate(L['examples'], 1)]
        meta = dict(no=n, title=title, section=L['section'], chapter=S['chapter'], sub_chapter=S['title'], sub_no=S['no'],
                    file=file, pages=L['pages'], cuts=cuts, examples=ex,
                    type_choices=S['types'])          # 대본 쓸 때 이 강의에 맞는 유형 코드를 여기서 고른다
        json.dump(meta, open(os.path.join(mdir, f'{n:02d}.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
        allc.append(dict(no=n, title=title, pages=L['pages'], cuts=[dict(file=f'{n:02d}/cut_{k:02d}.png', kind=c['kind'], head=c['head'],
                    parts=[dict(page=c['page'], y0=c['y0'], y1=c['y1'], x0=c['x0'])]) for k, c in enumerate(cuts, 1)]))
        print(n, L['section'], '›', S['title'], '|', title, '|', [c['kind'] for c in cuts], '| 필수', len(ex))
    json.dump(allc, open(os.path.join(tdir, 'cuts.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)


if __name__ == '__main__':
    main()
