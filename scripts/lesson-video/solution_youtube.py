"""풀이 영상(필수예제) 유튜브 제목·설명 — 영상 폴더의 NN_풀이MM_….구간.json 마다 같은 이름의 .유튜브.txt 를 만든다

  python scripts/lesson-video/solution_youtube.py "<영상 폴더>/풀이영상" [--force]

제목 꼴: [공통수학2] 01-풀이01. 필수예제 01 두 점 사이의 거리 | 문제풀이 | 수지쌤
(sync_lesson_videos.mjs 가 제목의 「01-풀이01」로 강의 목록에 잇는다)
"""
import glob, json, os, re, sys

CONCEPT_TITLE = {}


def concept_titles(repo):
    for f in glob.glob(os.path.join(repo, 'docs', '대본', '공통수학2', '*.json')):
        if os.path.basename(f).startswith('_'): continue
        L = json.load(open(f, encoding='utf-8')); CONCEPT_TITLE[L['no']] = L['title']


def ts(sec):
    s = int(sec); return f'{s // 60}:{s % 60:02d}'


def main():
    folder = sys.argv[1]; force = '--force' in sys.argv
    concept_titles(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..'))
    made = 0
    for g in sorted(glob.glob(os.path.join(folder, '*_풀이*.구간.json'))):
        base = g[:-len('.구간.json')]; out = base + '.유튜브.txt'
        if os.path.exists(out) and not force: continue
        m = re.match(r'(\d\d)_풀이(\d\d)_', os.path.basename(base))
        G = json.load(open(g, encoding='utf-8'))
        order = f'{m.group(1)}-풀이{m.group(2)}'
        title = f"[공통수학2] {order}. {G['label']} {G['title']} | 문제풀이 | 수지쌤"
        cn = G.get('concept_no')
        chap = [f"{ts(s['start'])} {s['bubble']}" for s in G['steps']]
        chap[0] = f"0:00 {G['steps'][0]['bubble']}"
        desc = '\n'.join([
            f"공통수학2 {G['chapter']} › {G['sub_chapter']} — 개념+유형 {G['label']} 「{G['title']}」 풀이.",
            '영상을 멈추고 먼저 풀어 본 다음, 풀이와 맞춰 보세요.',
            '',
            f"▶ 먼저 볼 개념 강의: {cn:02d}. {CONCEPT_TITLE.get(cn, '')}" if cn else '',
            f"▶ 교재: 개념+유형 개념편 공통수학2 {G['book_page']}쪽",
            '',
            '[목차]', *chap,
            '',
            '모르는 건 스터디체크 질문하기로 물어보세요.',
            '수학의지혜 · AI선생님 수지쌤',
            '',
            '#공통수학2 #문제풀이 #고1수학 #수학의지혜',
        ])
        open(out, 'w', encoding='utf-8').write(f'제목:\n{title}\n\n설명:\n{desc}\n'); made += 1
    print(made, '편')


if __name__ == '__main__':
    main()
