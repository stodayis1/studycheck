"""영상 맨 아래에 진행 막대 + 장면(단계) 눈금을 얹는다 — 학생이 「지금 어디쯤인지」 본다

  python scripts/lesson-video/progress_bar.py <영상.mp4> [--out <새 영상.mp4>]

· 같은 이름의 .구간.json 에서 장면 시작 시각을 읽어 눈금을 긋는다(개념 scenes · 증명/풀이 steps 둘 다).
· 막대는 수지쌤 벽돌색, 바탕 띠는 연한 베이지 — 영상 화면 색과 같은 계열.
· 소리는 그대로 두고(복사) 화면만 다시 굽는다. --out 을 안 주면 원래 파일을 바꾼다.
"""
import argparse, json, os, subprocess, tempfile
from PIL import Image, ImageDraw

W, H, BAR = 1920, 1080, 10
TRACK, FILL, TICK = (232, 222, 208, 230), (184, 84, 52, 255), (120, 70, 50, 255)


def main():
    ap = argparse.ArgumentParser(); ap.add_argument('video'); ap.add_argument('--out', default=None)
    a = ap.parse_args()
    seg = json.load(open(os.path.splitext(a.video)[0] + '.구간.json', encoding='utf-8'))
    D = float(seg['duration'])
    starts = [s['start'] for s in (seg.get('scenes') or seg.get('steps') or [])][1:]
    tmp = tempfile.mkdtemp()
    track = Image.new('RGBA', (W, BAR + 6), (0, 0, 0, 0)); d = ImageDraw.Draw(track)
    d.rectangle((0, 6, W, BAR + 6), fill=TRACK)
    fill = Image.new('RGBA', (W, BAR), FILL)
    ticks = Image.new('RGBA', (W, BAR + 6), (0, 0, 0, 0)); d = ImageDraw.Draw(ticks)
    for t in starts:
        x = int(W * t / D); d.rectangle((x - 1, 0, x + 1, BAR + 6), fill=TICK)
    tp, fp, kp = (os.path.join(tmp, n) for n in ('track.png', 'fill.png', 'ticks.png'))
    track.save(tp); fill.save(fp); ticks.save(kp)
    out = a.out or os.path.join(tmp, 'out.mp4')
    y = H - BAR - 6
    fc = (f"[0][1]overlay=0:{y}[a];[a][2]overlay=x='-w+w*t/{D:.3f}':y={y + 6}:shortest=0[b];"
          f"[b][3]overlay=0:{y}")
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', a.video, '-loop', '1', '-i', tp, '-loop', '1', '-i', fp, '-loop', '1', '-i', kp,
                    '-filter_complex', fc, '-map', '0:a?', '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-pix_fmt', 'yuv420p',
                    '-c:a', 'copy', '-t', f'{D:.3f}', '-movflags', '+faststart', out], check=True)
    if not a.out: os.replace(out, a.video)
    print('ok', a.out or a.video, f'눈금 {len(starts)}개')


if __name__ == '__main__':
    main()
