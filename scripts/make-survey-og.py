# 설문 링크 미리보기 그림 만들기 (카톡·문자로 주소를 보낼 때 뜨는 대표 그림)
#
# 원장님 2026-11-07 「링크 나갈때 대표 화면이 스터디체크가 뜨는데 부모학교 만족도·후기 조사로
#   다른 그림이 나가게 해줘」
#
# 쓰는 법 (윈도우에서 한 번 돌려 public/og/ 에 그림을 만들고 커밋한다):
#   python scripts/make-survey-og.py 1121 "부모학교" "만족도 · 후기 조사" "2026. 11. 21.(토) · 초5 · 초6 학부모님"
#
# ★ 행사를 새로 열면 이 그림도 같이 만들고 lib/surveyEvents.ts 의 og 에 경로를 적는다.
#   안 적으면 /og/survey.png (행사 이름 없는 기본 그림)가 나간다.
# ★ 글꼴은 윈도우 맑은고딕을 쓴다. 다른 컴퓨터에서 돌릴 때는 FONT 를 고친다.
# ★ 1200x630 — 카카오톡·네이버·페이스북이 모두 이 비율을 쓴다.

import sys, os
from PIL import Image, ImageDraw, ImageFont

GREEN = (8, 80, 65)
PEACH = (245, 196, 179)
GOLD  = (242, 163, 60)
WHITE = (255, 255, 255)

FONT_B = r'C:\Windows\Fonts\malgunbd.ttf'
FONT_R = r'C:\Windows\Fonts\malgun.ttf'

W, H = 1200, 630


def main():
    slug = sys.argv[1] if len(sys.argv) > 1 else 'survey'
    line1 = sys.argv[2] if len(sys.argv) > 2 else '부모학교'
    line2 = sys.argv[3] if len(sys.argv) > 3 else '만족도 · 후기 조사'
    foot = sys.argv[4] if len(sys.argv) > 4 else ''

    im = Image.new('RGB', (W, H), GREEN)
    d = ImageDraw.Draw(im)

    # 왼쪽 세로 띠 — 복숭아색 한 줄 (학원 색)
    d.rectangle([(0, 0), (18, H)], fill=PEACH)

    f_label = ImageFont.truetype(FONT_B, 30)
    f_big = ImageFont.truetype(FONT_B, 92)
    f_star = ImageFont.truetype(FONT_B, 64)
    f_foot = ImageFont.truetype(FONT_R, 34)

    x = 92
    d.text((x, 92), '수학의지혜 수학학원', font=f_label, fill=PEACH)
    d.text((x, 168), line1, font=f_big, fill=WHITE)
    d.text((x, 282), line2, font=f_big, fill=WHITE)
    d.text((x, 416), '★ ★ ★ ★ ★', font=f_star, fill=GOLD)
    if foot:
        d.text((x, 520), foot, font=f_foot, fill=(214, 229, 224))

    out = os.path.join('public', 'og', f'survey-{slug}.png')
    os.makedirs(os.path.dirname(out), exist_ok=True)
    im.save(out)
    print('만듦:', out, im.size)


if __name__ == '__main__':
    main()
