"""개념 영상 여러 편을 한꺼번에 만든다 — 이미 만든 편은 건너뛰고, 3편씩 동시에(ElevenLabs 429 때문)

  python scripts/lesson-video/render_all.py <대본 폴더> --pdf <개념편.pdf> --video <영상 폴더> [--only 2,3] [--jobs 3]
  python scripts/lesson-video/render_all.py <증명 대본 폴더> --proofs --video <영상 폴더>      ← 증명 영상(proof_video.py)

· 영상: <영상 폴더>/NN_개념_<file>.mp4 (+ .구간.json), 토막: <영상 폴더>/_토막/NN, 음성 캐시: <영상 폴더>/_음성캐시
· 크레딧이 떨어지면(quota) 새 편을 더 시작하지 않고 멈춘다. 받은 음성은 캐시에 남아 다음에 이어진다.
"""
import argparse, glob, json, os, subprocess, sys, threading
from concurrent.futures import ThreadPoolExecutor

HERE = os.path.dirname(os.path.abspath(__file__))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('scripts'); ap.add_argument('--pdf'); ap.add_argument('--video', required=True); ap.add_argument('--proofs', action='store_true')
    ap.add_argument('--only', default=''); ap.add_argument('--jobs', type=int, default=3)
    a = ap.parse_args()
    only = {int(x) for x in a.only.split(',') if x}
    todo = []
    for f in sorted(glob.glob(os.path.join(a.scripts, '*.json'))):
        if os.path.basename(f).startswith('_'): continue
        L = json.load(open(f, encoding='utf-8'))
        if a.proofs:   # 증명_PP_<…>.json → <개념 NN>_증명K_<…>.mp4 (order = 「07-증명1」)
            cn, k = L['order'].split('-증명')
            no = int(L['id'].split('_')[1])
            if only and no not in only: continue
            rest = os.path.basename(f)[len('증명_00_'):-len('.json')]
            out = os.path.join(a.video, f"{cn}_증명{k}_{rest}.mp4")
            if not os.path.exists(out): todo.append((no, f, out))
            continue
        if only and L['no'] not in only: continue
        out = os.path.join(a.video, f"{L['no']:02d}_개념_{L['file']}.mp4")
        if os.path.exists(out): continue
        todo.append((L['no'], f, out))
    print(f'만들 편: {len(todo)}', flush=True)
    stop = threading.Event()

    def run(item):
        no, f, out = item
        if stop.is_set(): return no, 'skip'
        if a.proofs:
            cmd = [sys.executable, os.path.join(HERE, 'proof_video.py'), f, '--cuts', os.path.join(a.video, '_토막'),
                   '--out', out, '--cache', os.path.join(a.video, '_음성캐시'), '--bar']
        else:
            cmd = [sys.executable, os.path.join(HERE, 'lesson_video.py'), f, '--pdf', a.pdf, '--cuts', os.path.join(a.video, '_토막', f'{no:02d}'),
                   '--out', out, '--cache', os.path.join(a.video, '_음성캐시'), '--bar']
        r = subprocess.run(cmd, capture_output=True, text=True, encoding='utf-8', errors='replace', env={**os.environ, 'PYTHONIOENCODING': 'utf-8'})
        log = (r.stdout + r.stderr)
        if r.returncode != 0:
            if 'quota' in log.lower(): stop.set()
            return no, 'FAIL ' + log.strip().splitlines()[-1][:200]
        return no, log.strip().splitlines()[-1]

    with ThreadPoolExecutor(a.jobs) as ex:
        for no, msg in ex.map(run, todo):
            print(f'{no:02d} {msg}', flush=True)
    if stop.is_set(): print('크레딧 부족으로 멈춤 — 충전 후 같은 명령을 다시 돌리면 이어서 만든다')


if __name__ == '__main__':
    main()
