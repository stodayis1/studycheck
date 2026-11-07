# 진로 설문 링크 미리보기 그림 (카톡·문자로 /c/<token> 주소를 보낼 때 뜨는 대표 그림)
#
# 원장님 2026-11-07 「항상 이런 설문 조사 나갈 때 대표 썸네일 좀 신경 좀 써줘.
#   지금 또 스터디체크 대표 썸네일이 나갔잖아」
#   「짙은 초록색 말고 파스텔 핑크나 파스텔 오렌지 계열로 해서 세련되게. 이런 느낌으로」
#   (보내 주신 예: 단색 파스텔 바탕 + 아주 큰 가는 명조 글씨가 화면을 꽉 채우고, 옆에 작은 글씨 세로 한 줄)
#
# 쓰는 법 (윈도우에서 돌려 public/og/ 에 그림을 만들고 커밋한다):
#   python scripts/make-career-og.py
#   → public/og/career-pre1.png (예비고1·오렌지) · career-pre2.png (예비고2·핑크) · career.png (기본·핑크)
#
# ★ app/c/[token]/layout.tsx 가 이 그림을 쓴다. 설문 차수·문구를 바꾸면 다시 만든다.
# ★ 글씨가 서로·가장자리와 겹치는지 **숫자로** 검사하고 겹치면 멈춘다(눈으로만 보지 않는다).
# ★ 1200x630 — 카카오톡·네이버·페이스북이 모두 이 비율을 쓴다.
# ★ 글꼴: KoPubWorld 바탕 Light(큰 글씨) · 돋움 Medium(작은 글씨) — 원장님 PC 사용자 글꼴 폴더.
#   없으면 Noto Serif KR 로 바꾼다.

import os
from PIL import Image, ImageDraw, ImageFont

W, H = 1200, 630
BIG = ('학생부', '로드맵')
UF = os.path.join(os.environ.get('LOCALAPPDATA', ''), 'Microsoft', 'Windows', 'Fonts')
SERIF = os.path.join(UF, 'KoPubWorld Batang Light.ttf')
SERIF_M = os.path.join(UF, 'KoPubWorld Batang Medium.ttf')
SANS = os.path.join(UF, 'KoPubWorld Dotum Medium.ttf')
if not os.path.exists(SERIF):
    SERIF = SERIF_M = r'C:\Windows\Fonts\NotoSerifKR-VF.ttf'
    SANS = r'C:\Windows\Fonts\malgun.ttf'
LATIN = r'C:\Windows\Fonts\georgiai.ttf'

THEMES = {
    # 바탕, 큰 글씨, 작은 글씨
    'pink':   ((247, 198, 210), (38, 22, 28), (92, 52, 64)),
    'orange': ((250, 205, 168), (58, 30, 18), (120, 66, 38)),
}


def boxes_overlap(a, b, gap=0):
    return not (a[2] + gap <= b[0] or b[2] + gap <= a[0] or a[3] + gap <= b[1] or b[3] + gap <= a[1])


def make(name, grade_label, lines, theme):
    bg, ink, sub = THEMES[theme]
    im = Image.new('RGB', (W, H), bg)
    d = ImageDraw.Draw(im)
    placed = []   # (이름, 상자) — 겹침 검사용

    def put(label, xy, text, font, fill, anchor='la'):
        box = d.textbbox(xy, text, font=font, anchor=anchor)
        if box[0] < 0 or box[1] < 0 or box[2] > W or box[3] > H:
            raise SystemExit(f'「{label}」이(가) 그림 밖으로 나간다: {box}')
        for other, ob in placed:
            if boxes_overlap(box, ob, gap=6):
                raise SystemExit(f'「{label}」와(과) 「{other}」이(가) 겹친다: {box} / {ob}')
        d.text(xy, text, font=font, fill=fill, anchor=anchor)
        placed.append((label, box))
        return box

    # 큰 글씨 두 줄 — 「진로」「설문」. 화면 왼쪽을 꽉 채운다
    #   글씨 상자의 위·아래 여백을 재서, 첫 줄 위 = 36px · 둘째 줄 아래 = H-36px 에 딱 맞춘다
    #   이름 「학생부 로드맵」 (원장님 2026-11-07 — 「진로 설문」보다 나은 말로)
    big = ImageFont.truetype(SERIF, 228)
    t1 = d.textbbox((0, 0), BIG[0], font=big)
    t2 = d.textbbox((0, 0), BIG[1], font=big)
    put(BIG[0], (30, 44 - t1[1]), BIG[0], big, ink)
    put(BIG[1], (30, H - 44 - t2[3]), BIG[1], big, ink)

    # 오른쪽 세로 단 — 포장 옆의 작은 글씨처럼. 가는 세로선 하나로 큰 글씨와 가른다
    col_x = 752
    d.line([(col_x, 70), (col_x, H - 70)], fill=sub, width=2)
    placed.append(('세로선', (col_x - 1, 70, col_x + 1, H - 70)))
    x = col_x + 40
    f_brand = ImageFont.truetype(SANS, 26)
    f_grade = ImageFont.truetype(SERIF_M, 92)
    f_line = ImageFont.truetype(SANS, 28)
    f_latin = ImageFont.truetype(LATIN, 26)
    put('학원', (x, 74), '수학의지혜 수학학원', f_brand, sub)
    put('학년', (x, 122), grade_label, f_grade, ink)
    y = 268
    for i, t in enumerate(lines):
        if i == len(lines) - 1:
            y += 18   # 마지막 줄(약 3분 · 로그인 없이)은 설명과 한 칸 띄운다
        put(f'설명{i}', (x, y), t, f_line, sub)
        y += 46
    put('영문', (x, H - 108), 'Student Roadmap · 2026', f_latin, sub)

    out = os.path.join('public', 'og', name)
    os.makedirs(os.path.dirname(out), exist_ok=True)
    im.save(out)
    print('만듦:', out, im.size)


if __name__ == '__main__':
    make('career-pre1.png', '예비고1', ['고1 첫 학기부터', '쌓이는 학생부,', '진로부터 함께', '질문지 3분 · 로그인 없이'], 'orange')
    make('career-pre2.png', '예비고2', ['선택과목 · 탐구 ·', '비교과를 진로에', '맞춰 함께', '질문지 3분 · 로그인 없이'], 'pink')
    make('career.png', '고등 준비', ['내신 + 비교과,', '진로에 맞춰', '함께 챙깁니다', '수학의지혜가 함께'], 'pink')
