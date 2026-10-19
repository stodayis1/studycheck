"""필기가 다 그려진 장면 화면을 뽑는다 (음성·영상 없이, 돈 안 듦) — 필기 겹침·자리 확인용

  python scripts/lesson-video/preview_marks.py <대본.json 또는 폴더> --pdf <PDF> --cuts <토막 폴더(cuts.json 있는 곳)> --out <폴더>
결과: <out>/<file>/sNN.png (장면별 1920x1080) + <out>/<file>.png (모아보기)
"""
import argparse, glob, json, os, sys
import pymupdf
from PIL import Image
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lesson_video import Book, base_frame, mark_geom, draw_mark


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('target'); ap.add_argument('--pdf', required=True); ap.add_argument('--cuts', required=True)
    ap.add_argument('--out', required=True)
    a = ap.parse_args()
    doc = pymupdf.open(a.pdf)
    allc = json.load(open(os.path.join(a.cuts, 'cuts.json'), encoding='utf-8'))
    files = sorted(glob.glob(os.path.join(a.target, '*.json'))) if os.path.isdir(a.target) else [a.target]
    for f in files:
        if os.path.basename(f).startswith('_'): continue
        L = json.load(open(f, encoding='utf-8'))
        cuts = {c['file'].split('/')[-1][:-4]: c for c in allc[L['no'] - 1]['cuts']}
        od = os.path.join(a.out, L['file']); os.makedirs(od, exist_ok=True)
        thumbs = []
        for k, sc in enumerate(L['scenes'], 1):
            book = None
            if sc['show'].startswith('cut_'):
                part = cuts[sc['show']]['parts'][0]
                book = Book(os.path.join(a.cuts, f"{L['no']:02d}", sc['show'] + '.png'), part, sc.get('clip'))
                page = doc[part['page'] - 1]
            im = base_frame(L, sc, book, 'closed').convert('RGBA')
            layer = Image.new('RGBA', im.size, (0, 0, 0, 0))
            for i, m in enumerate(sc.get('marks', [])):
                draw_mark(layer, m, mark_geom(m, page, book), 1.0, 1000 * k + i, book.s)
            im.alpha_composite(layer); im = im.convert('RGB')
            im.save(os.path.join(od, f's{k:02d}.png')); thumbs.append(im.resize((640, 360)))
        cols = 3; rows = (len(thumbs) + cols - 1) // cols
        sheet = Image.new('RGB', (640 * cols, 360 * rows), 'white')
        for i, t in enumerate(thumbs): sheet.paste(t, ((i % cols) * 640, (i // cols) * 360))
        sheet.save(os.path.join(a.out, L['file'] + '.png'))
        print(L['no'], L['file'], len(thumbs), '장면')


if __name__ == '__main__':
    main()
