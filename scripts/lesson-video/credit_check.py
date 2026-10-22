"""만들기 전에: 목소리에 실제로 보내는 글자(발음 사전 적용 뒤)와 새로 드는 크레딧을 본다 — 돈 안 듦

  python scripts/lesson-video/credit_check.py <대본.json 또는 폴더> [--cache <음성 캐시 폴더>] [--table <확인표.md>]

· 개념 대본(scenes[].say), 증명·풀이 대본(steps[].say, [[쓰기]] 로 나뉜 조각)을 모두 읽는다.
· 같은 글·같은 앞뒤 문맥이면 캐시에 있는 소리를 다시 쓰므로 0 크레딧 — 캐시에 없는 조각만 「새 글자」로 센다.
  (lesson_video.tts_chunk 의 캐시 열쇠와 같은 방식으로 계산한다)
· --table: 장면별로 실제 읽는 글 전문을 적은 확인표(Markdown) — 이상하게 읽힐 말을 찾아 docs/대본/발음사전.json 에 더한다.
"""
import argparse, glob, hashlib, json, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lesson_video import parse_say, plain, sound, MODES

QUIET = '[[쓰기]]'
VOICE, MODEL = 'mbwQpKqHamJOPuXJoCPc', 'eleven_multilingual_v2'


def chunks_of_scene(say, prev_scene, next_scene):
    """synth_scene 과 같은 순서·문맥으로 (글, 방식, 앞 문맥, 뒤 문맥) 을 낸다"""
    items = parse_say(say)
    texts = [x[1] for x in items if x[0] == 'speak']
    out, k = [], 0
    for it in items:
        if it[0] != 'speak': continue
        prev = ' '.join([prev_scene] + texts[:k]).strip(); nxt = ' '.join(texts[k + 1:] + [next_scene]).strip()
        out.append((it[1], it[2], prev, nxt)); k += 1
    return out


def key_of(text, mode, prev, nxt):
    return hashlib.sha1(json.dumps([sound(text), MODES[mode], VOICE, MODEL, prev[-200:], nxt[:200], 3]).encode()).hexdigest()[:16]


def units(P):
    """대본 하나를 synth_scene 호출 단위(조각)로: [(이름, 글, 앞 장면 글, 뒤 장면 글)]"""
    if 'scenes' in P:
        says = [s['say'] for s in P['scenes']]
        return [(f"장면{k + 1}", says[k], plain(says[k - 1]) if k else '', plain(says[k + 1]) if k + 1 < len(says) else '')
                for k in range(len(says))]
    says = [s['say'].replace(QUIET, ' ') for s in P['steps']]
    out = []
    for k, st in enumerate(P['steps']):
        parts = st['say'].split(QUIET)
        for j, part in enumerate(parts):
            prev = parts[j - 1] if j else (says[k - 1] if k else '')
            nxt = parts[j + 1] if j + 1 < len(parts) else (says[k + 1] if k + 1 < len(says) else '')
            out.append((f"단계{k + 1}" + (f"-{j + 1}" if len(parts) > 1 else ''), part, plain(prev), plain(nxt)))
    return out


def main():
    ap = argparse.ArgumentParser(); ap.add_argument('target'); ap.add_argument('--cache', default=None); ap.add_argument('--table', default=None)
    a = ap.parse_args()
    files = sorted(glob.glob(os.path.join(a.target, '*.json'))) if os.path.isdir(a.target) else [a.target]
    files = [f for f in files if not os.path.basename(f).startswith('_')]
    tot_all = tot_new = 0; md = []
    for f in files:
        P = json.load(open(f, encoding='utf-8'))
        if 'scenes' not in P and 'steps' not in P: continue
        all_c = new_c = 0; rows = []
        for name, say, ps, ns in units(P):
            for text, mode, prev, nxt in chunks_of_scene(say, ps, ns):
                n = len(sound(text)); all_c += n
                cached = bool(a.cache) and os.path.exists(os.path.join(a.cache, key_of(text, mode, prev, nxt) + '.mp3'))
                if not cached: new_c += n
                rows.append((name, mode, sound(text), cached))
        tot_all += all_c; tot_new += new_c
        print(f"{'새 글자':>6} {new_c:>5} / 전체 {all_c:>5}  {os.path.basename(f)}")
        if a.table:
            md.append(f"## {os.path.basename(f)}\n\n전체 {all_c}자 · 새로 드는 {new_c}자\n\n| 자리 | 방식 | 목소리에 보내는 글 | 저장본 |\n|---|---|---|---|")
            md += [f"| {n} | {m} | {t} | {'있음' if c else ''} |" for n, m, t, c in rows]
            md.append('')
    print(f"\n합계: 새로 드는 크레딧 약 {tot_new}자 (전체 {tot_all}자){'' if a.cache else ' — --cache 를 주면 저장본을 빼고 셉니다'}")
    if a.table:
        open(a.table, 'w', encoding='utf-8').write('# 읽는 글자 확인표\n\n' + '\n'.join(md)); print('확인표:', a.table)


if __name__ == '__main__':
    main()
