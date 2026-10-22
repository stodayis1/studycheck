"""수지 자세 그림 고르기 — 자세마다 「입 다문 / 입 벌린」 두 장이 있으면 말소리에 맞춰 입이 움직인다

suji/poses/<자세>_closed.png, <자세>_open.png (+ 선택: _half, _blink)
대본의 pose 는 글자(A~I) 또는 이름(point·remember·…) 둘 다 된다.
  A point 가리키기(기본) · B remember 이것만 기억 · C wonder 갸웃 · D pointer 지시봉 · E cheer 화이팅
  F write 노트에 쓰기 · G idea 아하! · H book 교재 들고 · I thumb 엄지 척
그림이 아직 한 장뿐인 자세는 입 대신 몸이 살짝 들썩인다(예전 방식).
"""
import os

HERE = os.path.dirname(os.path.abspath(__file__))
DIR = os.path.join(HERE, 'suji', 'poses')
NAMES = {'A': 'point', 'B': 'remember', 'C': 'wonder', 'D': 'pointer', 'E': 'cheer',
         'F': 'write', 'G': 'idea', 'H': 'book', 'I': 'thumb'}
ALL = list(NAMES.values())


def name_of(pose):
    return NAMES.get(pose, pose or 'point')


def talks(pose):
    """입 모양 두 장이 다 있으면 True — 말할 때 입을 움직인다"""
    n = name_of(pose)
    return all(os.path.exists(os.path.join(DIR, f'{n}_{m}.png')) for m in ('closed', 'open'))


def image(pose, mouth='closed'):
    """mouth: closed · half · open · blink — 없는 칸은 가까운 것으로(half→open, blink→closed)"""
    n = name_of(pose)
    for m in (mouth, {'half': 'open', 'blink': 'closed'}.get(mouth, mouth), 'closed', 'open'):
        f = os.path.join(DIR, f'{n}_{m}.png')
        if os.path.exists(f): return f
    raise FileNotFoundError(f'수지 자세 그림이 없어요: {n} (scripts/lesson-video/suji/poses/{n}_closed.png)')


def missing():
    """아직 없는 그림 — GPT 로 그려 넣을 목록"""
    return [f'{n}_{m}.png' for n in ALL for m in ('closed', 'open') if not os.path.exists(os.path.join(DIR, f'{n}_{m}.png'))]


if __name__ == '__main__':
    print('있는 자세(입 움직임):', [n for n in ALL if talks(n)])
    print('그려야 할 그림:', missing())
