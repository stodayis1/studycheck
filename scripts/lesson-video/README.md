# 수지쌤 강의영상 만들기

개념+유형 개념편 교재의 개념 쪽을 화면에 띄우고, 원장님 목소리(ElevenLabs 복제)로 수지쌤이 설명하는 영상.
공통수학2 개념 37편·증명 22편이 이 도구로 만들어졌다(2026-10). 대본은 `docs/대본/공통수학2/`.

## 준비물
- `.env.local` 에 `ELEVENLABS_API_KEY` (권한: Text to Speech, Voices Write, Speech to Text). 목소리 `수지쌤 (원장님 목소리)` = voice_id `mbwQpKqHamJOPuXJoCPc`
- 파이썬: `pymupdf`, `Pillow`, `numpy`, `matplotlib`(증명 영상), `ffmpeg`
- 교재 PDF (학생용 개념편). **PDF·잘라 낸 교재 그림은 저작권 때문에 저장소에 넣지 않는다.**

## 개념 영상 순서
```bash
# 1. 개념 쪽을 토막 그림으로 자른다 (개념 하나 = 영상 한 편)
python scripts/lesson-video/concept_cuts.py --pdf "<개념편.pdf>" --out <토막폴더>
# 2. 대본 쓰는 재료 (토막 목록·글자 위치·이어지는 필수예제)
python scripts/lesson-video/materials.py --pdf "<개념편.pdf>" --cuts <토막폴더> --out <재료폴더>
# 3. 대본 JSON 을 쓴다 → 검사 (말에 영문자·숫자, 필기 자리, 깨지는 기호)
python scripts/lesson-video/validate.py docs/대본/공통수학2 --pdf "<개념편.pdf>" --mat <재료폴더>
# 4. 필기가 다 그려진 화면 미리보기 (음성 없음, 돈 안 듦)
python scripts/lesson-video/preview_marks.py <대본.json> --pdf "<개념편.pdf>" --cuts <토막폴더> --out <미리보기폴더>
# 5. 영상 (음성 받기 → 입모양·필기 → mp4 + .구간.json)
python scripts/lesson-video/lesson_video.py <대본.json> --pdf "<개념편.pdf>" --cuts <토막폴더>/NN --out "NN_<file>.mp4" --cache <음성캐시>
```

## 증명 영상
```bash
python scripts/lesson-video/proof_validate.py docs/대본/공통수학2/증명 --sheet <미리보기폴더>
python scripts/lesson-video/proof_video.py <증명 대본.json> --cuts <토막폴더> --out "<file>.mp4" --cache <음성캐시>
```
모눈 노트에 증명을 한 줄씩 손글씨로 쓰고(matplotlib 수식 + 나눔손글씨 펜), 차면 위로 밀어 올린다.
수식 안 대문자는 Comic Sans 로 써서 P·p, X·x 를 구분한다.

## 대본 규칙 (자세한 건 `docs/대본/공통수학2/_말투.md`)
- `say` 는 음성이 그대로 읽는다 → **영문자·숫자 금지**, 한글 소리로(엑스 원, 이분의 일 …). 원점·교점은 맞춤법대로 써도 [원쩜]으로 읽는다.
- 표시: `/` 잠깐 쉼, `//` 길게 쉼, `{빠르게 …}`, `{강조 …}`, `{천천히 …}`. **쉼표마다 쉬게 하지 않는다**(뚝뚝 끊긴다 — 원장님).
- 필기(marks) `cue` 는 말 안의 글자, `find` 는 교재 글자층 그대로, `nth` 는 그 토막 안 순번.
- 수지 자세: A 가리키기(입 움직임) · B 이것만 기억 · C 갸웃 · D 지시봉 · E 화이팅 — `suji/pose_*.png`.

## 데이터 (학생별 학습 분석용)
영상마다 `.구간.json`: 장면/단계별 시작·끝 초, 교재 쪽, 필기 시각, 이어지는 필수예제의 **문제은행 유형 코드**(`공수2-NN-NN`).
학생 시청 기록(다시 본 구간·멈춘 곳)을 개념·유형에 잇는 열쇠다.

## 주의
- ElevenLabs 는 동시에 많이 보내면 429 → 영상은 3편씩만 동시에 만든다(재시도 들어 있음).
- 셸 heredoc 으로 JSON·파이썬을 쓰면 역슬래시가 깨진다 → 파일은 편집기(Write)로.
- 썸네일·캐릭터 그림은 GPT 프롬프트로 만든다(직접 그리지 않음). 과정별 파스텔 바탕색.
