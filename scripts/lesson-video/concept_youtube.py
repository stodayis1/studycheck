"""개념 영상 유튜브 제목·설명 — 영상 폴더의 NN_개념_….구간.json 마다 같은 이름의 .유튜브.txt + 모아 보기 파일

  python scripts/lesson-video/concept_youtube.py "<영상 폴더>" --grade 공통수학1 [--force]
  python scripts/lesson-video/concept_youtube.py "<영상 폴더>" --grade 공통수학1 --proofs   ← 증명·공식 쓰기 영상

제목 꼴: [공통수학1] 01. 다항식의 덧셈과 뺄셈 | 개념 강의 | 수학의지혜 수지쌤
(sync_lesson_videos.mjs 가 제목의 「01.」로 강의 목록에 잇는다 — 공통수학2 와 같은 꼴)
"""
import argparse, glob, json, os

REPO = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..')


def ts(sec):
    s = int(sec); return f'{s // 60}:{s % 60:02d}'


def main():
    ap = argparse.ArgumentParser(); ap.add_argument('folder'); ap.add_argument('--grade', default='공통수학2'); ap.add_argument('--force', action='store_true'); ap.add_argument('--proofs', action='store_true')
    a = ap.parse_args()
    scripts = {}
    for f in glob.glob(os.path.join(REPO, 'docs', '대본', a.grade, '**', '*.json'), recursive=True):
        if os.path.basename(f).startswith('_'): continue
        L = json.load(open(f, encoding='utf-8'))
        if 'scenes' in L and 'no' in L and 'examples' in L: scripts[L['no']] = L
    allout = []
    if a.proofs:
        for g in sorted(glob.glob(os.path.join(a.folder, '*_증명*.구간.json'))):
            base = g[:-len('.구간.json')]; out = base + '.유튜브.txt'
            G = json.load(open(g, encoding='utf-8'))
            formula = (G.get('label') or '') == '공식 쓰기'
            title = f"[{a.grade}] {G['order']}. {G['title']} | {'공식 쓰기' if formula else '손으로 쓰는 증명'} | 수지쌤"
            toc = [f"{ts(s['start'])} {'시작 — ' if k == 0 else ''}{s['bubble']}" for k, s in enumerate(G['steps'])]
            C = scripts.get(G['concept_no'], {})
            what = (f"「{G['title']}」 — 교재의 공식을 노트에 하나씩 손으로 써 가며 정리합니다.\n영상을 보면서 같이 써 보고, 다 보고 나면 책을 덮고 공식을 전부 한 번씩 써서 스터디체크에 사진으로 내 주세요."
                    if formula else
                    f"「{G['title']}」 증명. 노트에 한 줄씩 손으로 써 가며 보여 줍니다.\n영상을 보면서 노트에 같이 써 보고, 다 보고 나면 책을 덮고 혼자 다시 써 보세요.")
            body = [f"{a.grade} {G['chapter']} › {G['sub_chapter']} — {what}", '',
                    f"▶ 먼저 볼 개념 강의: {G['concept_no']:02d}. {C.get('title', '')}",
                    f"▶ 교재: 개념+유형 개념편 {a.grade} {G['book_page']}쪽", '',
                    '[목차]', *toc, '',
                    '모르는 건 스터디체크 질문하기로 물어보세요.', '수학의지혜 · AI선생님 수지쌤', '',
                    f"#{a.grade} #{'공식' if formula else '증명'} #고1수학 #수학의지혜"]
            text = '제목:\n' + title + '\n\n설명:\n' + '\n'.join(body) + '\n'
            if not os.path.exists(out) or a.force: open(out, 'w', encoding='utf-8').write(text)
            allout.append(f"===== {G['order']} =====\n" + text)
        p = os.path.join(a.folder, f'_유튜브_제목_설명_증명{len(allout)}편.txt')
        open(p, 'w', encoding='utf-8').write('\n'.join(allout)); print(len(allout), '편 →', p)
        return
    for g in sorted(glob.glob(os.path.join(a.folder, '*_개념_*.구간.json'))):
        base = g[:-len('.구간.json')]; out = base + '.유튜브.txt'
        G = json.load(open(g, encoding='utf-8')); L = scripts.get(G['no'], {})
        title = f"[{a.grade}] {G['no']:02d}. {G['title']} | 개념 강의 | 수학의지혜 수지쌤"
        # 목차: 장면 칩 이름. 첫 장면은 「시작」, 「개념 Check」(멈추고 풀기)는 바로 뒤 정답과 합친다, 같은 이름이 이어지면 하나로
        toc, last = [], None
        for k, s in enumerate(G['scenes']):
            step = '시작 — 오늘 배울 개념' if k == 0 else s['step']
            if step.startswith('개념 Check') and last and last.startswith('개념 Check'): continue
            if step == '개념 Check': step = '개념 Check (먼저 풀어 보고 정답)'
            if step == last: continue
            toc.append(f"{ts(s['start'])} {step}"); last = step
        pages = G.get('pages') or []
        ex = L.get('example_codes') or [{'no': f'{i + 1:02d}', 'title': t} for i, t in enumerate(L.get('examples', []))]
        tag = G['title'].replace(' ', '').replace(',', '')
        body = [
            f"{a.grade} {G['chapter']} › {G['sub_chapter']} — 「{G['title']}」 개념 강의입니다.", '',
            f"▶ 교재: {G['book']} {pages[0] if pages else ''}쪽 (교재를 펴 놓고 같이 보세요)", '',
            '[목차]', *toc, '',
            '[이 개념으로 이어서 풀 문제]', *[f"· 필수예제 {e['no']} {L.get('examples', [e['title']])[i] if i < len(L.get('examples', [])) else e['title']}" for i, e in enumerate(ex)], '',
            '모르는 건 스터디체크 질문하기로 물어보세요.', '수학의지혜 · AI선생님 수지쌤', '',
            f"#{a.grade} #{tag} #고1수학 #수학의지혜",
        ]
        text = '제목:\n' + title + '\n\n설명:\n' + '\n'.join(body) + '\n'
        if not os.path.exists(out) or a.force:
            open(out, 'w', encoding='utf-8').write(text)
        allout.append(f"===== {G['no']:02d} =====\n" + text)
    if allout:
        p = os.path.join(a.folder, f'_유튜브_제목_설명_개념{len(allout)}편.txt')
        open(p, 'w', encoding='utf-8').write('\n'.join(allout))
        print(len(allout), '편 →', p)


if __name__ == '__main__':
    main()
