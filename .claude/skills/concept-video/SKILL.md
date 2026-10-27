---
name: concept-video
description: 수지쌤 개념·증명·공식 쓰기 강의 영상을 만든다 — 대본(JSON) → 원장님 목소리 영상 렌더링 → 썸네일 → 유튜브 제목·설명·일부 공개 → 앱 강의 목록(lesson_videos) 연결. "개념 영상", "강의 영상 만들어줘", "대본 써줘", "증명 영상", "공식 쓰기 영상", "썸네일", "유튜브 올려줘", "수지쌤 목소리", "render_all", "강의 목록에 연결" 같은 말에 쓴다. Use for StudyCheck concept/proof lecture videos: script writing, ElevenLabs rendering, thumbnails, YouTube metadata/visibility, and syncing to the app's lecture list.
---

# 개념·증명 강의 영상 만들기 (수지쌤)

## 목적
개념+유형 **개념편** 교재의 개념 쪽을 화면에 띄우고, 원장님 목소리(ElevenLabs 복제)로 캐릭터 수지쌤이 설명하는 영상을 만들어
유튜브에 「일부 공개」로 올리고, 앱 강의 목록(`lesson_videos` 표)에 이어 학생이 앱 안에서 보게 한다.
지금까지 공통수학2 개념 37편·증명 22편, 공통수학1 개념 35편·증명 18편이 이 도구로 만들어졌다.

도구는 전부 `scripts/lesson-video/` (설명서: `scripts/lesson-video/README.md` — 먼저 읽을 것).

## 언제 쓰나
- 새 과정(예: 중3, 수학Ⅰ)의 개념 영상·증명 영상을 만들 때
- 대본만 쓰거나 고칠 때, 썸네일만 다시 만들 때, 유튜브 제목·설명·공개 범위만 맞출 때
- 유튜브엔 있는데 앱에 안 뜨는 영상을 연결할 때
- 풀이(필수예제) 영상도 같은 도구로 만든다(공통수학1 130편, 2026-10-27):
  재료 `solution_materials.mjs --grade 공통수학1 --mat <영상폴더>/_재료 --out <영상폴더>/_재료/풀이`(문제은행 그림 + `_목록.json`) →
  대본 `docs/대본/<과정>/풀이/풀이_<local_no>_….json`(지침 `docs/대본/공통수학2/풀이/_대본쓰기_지침.md`, **`quiz` 객관식 보기를 쓸 때 같이**) →
  `proof_validate.py` → `render_all.py --solutions` (→ `<영상폴더>/풀이영상/NN_풀이MM_….mp4`) →
  `solution_youtube.py "<영상폴더>/풀이영상" --grade 공통수학1` → `thumbnails.py "<영상폴더>/풀이영상" --solutions --grade 공통수학1` →
  업로드 → `sync_quiz.mjs --grade 공통수학1`(보기 → DB). 썸네일 색: 공통수학1 풀이는 증명보다 한 단계 더 진한 파랑.

## 영상 종류와 다른 점

| | 개념 | 증명 | 공식 쓰기 |
|---|---|---|---|
| 대본 위치 | `docs/대본/<과정>/개념/*.json` | `docs/대본/<과정>/증명/증명_NN_….json` | 증명 폴더 안, JSON에 `"label": "공식 쓰기"` |
| 렌더 | `lesson_video.py` (교재 토막 + 필기 marks) | `proof_video.py` (모눈 노트에 한 줄씩 손글씨, matplotlib 수식) | 증명과 같음 |
| 영상 파일 | `NN_개념_<file>.mp4` | `<개념NN>_증명K_<…>.mp4`, order `07-증명1` | 증명과 같음 |
| 썸네일 바탕 | 공통수학2 연두 파스텔 / 공통수학1 하늘색 파스텔 | 개념보다 한 단계 진한 색 (공통수학2 초록 / 공통수학1 진한 파랑) | 증명과 같은 색, 머리 문구 「… 공식 쓰기」 |
| 유튜브 제목 가운데 | `개념 강의` | `손으로 쓰는 증명` | `공식 쓰기` |
| 앱 제출 칸 | 없음 | 「백지 증명 제출」 | 「공식 쓰기 제출」 |

- 공식 쓰기 영상 = 증명 대신 「곱셈 공식 한 번씩 써 보기」처럼 공식을 노트에 전부 써 보는 영상(원장님 2026-10-26).
  앱(`app/student/watch/[sessionId]/[idx]/page.tsx`)은 **강의 제목이 `/공식.*써 보기/`에 맞으면** 제출 칸 문구를 바꾼다
  (`components/student/ProofSubmitBox.tsx`의 `formula`). 그러니 공식 쓰기 영상 제목은 반드시 「○○ 공식 한 번씩 써 보기」 꼴로.

## 단계별 순서

준비: `.env.local`의 키(아래), 파이썬 `pymupdf Pillow numpy matplotlib` + `ffmpeg`, 학생용 개념편 PDF.
도구가 `C:/Windows/Fonts/`(맑은고딕·BlackHanSans)를 읽으므로 **원장님 윈도 PC에서 돌린다.**

```bash
# 0. (선택) 만들 개념 목록·유형↔개념 매칭 — DB(concepts, standard_types)에서 뽑는다
node scripts/concept-video-list.mjs          # → docs/강의영상_대표개념목록.md
node scripts/concept-video-csv.mjs           # → docs/강의영상_대표개념목록.csv (BOM, 엑셀용)
node scripts/match-type-concept.mjs 공통수학1 1   # → docs/유형개념매칭_<과정>.csv/.md (제안만, 반영 안 함)

# 1. 개념 쪽을 토막 그림으로 (개념 하나 = 영상 한 편)
python scripts/lesson-video/concept_cuts.py --pdf "<개념편.pdf>" --out <영상폴더>/_토막
# 2. 대본 쓰는 재료 (토막 목록·글자 위치·이어지는 필수예제)
python scripts/lesson-video/materials.py --pdf "<개념편.pdf>" --cuts <토막폴더> --out <재료폴더> --course 공통수학1
# 3. 대본 JSON 쓰기(편집기 Write로) → 검사
python scripts/lesson-video/validate.py docs/대본/공통수학1/개념 --pdf "<개념편.pdf>" --mat <재료폴더>
python scripts/lesson-video/proof_validate.py docs/대본/공통수학1/증명 --sheet <미리보기폴더>
# 4. 필기 미리보기(음성 없음, 돈 안 듦) + 예상 크레딧
python scripts/lesson-video/preview_marks.py <대본.json> --pdf "<개념편.pdf>" --cuts <토막폴더> --out <미리보기폴더>
python scripts/lesson-video/credit_check.py docs/대본/공통수학1/개념 --cache <영상폴더>/_음성캐시 --table 확인표.md
# 5. 영상 렌더 — 여러 편을 3편씩 동시에, 이미 만든 편은 건너뜀, 크레딧(quota) 떨어지면 멈춤
python scripts/lesson-video/render_all.py docs/대본/공통수학1/개념 --pdf "<개념편.pdf>" --video <영상폴더> [--only 2,3]
python scripts/lesson-video/render_all.py docs/대본/공통수학1/증명 --proofs --video <영상폴더>
#    (한 편만: lesson_video.py / proof_video.py — README 참고. render_all 은 --bar(진행 막대)를 붙인다)
# 6. 유튜브 제목·설명 (.유튜브.txt + 모아 보기 파일)
python scripts/lesson-video/concept_youtube.py "<영상폴더>" --grade 공통수학1
python scripts/lesson-video/concept_youtube.py "<영상폴더>" --grade 공통수학1 --proofs
# 7. 썸네일 (1672×941 jpg, 영상과 같은 이름)
python scripts/lesson-video/thumbnails.py "<영상폴더>" --grade 공통수학1
python scripts/lesson-video/thumbnails.py "<영상폴더>" --grade 공통수학1 --proofs
# 8. mp4 를 유튜브 채널에 올린다 (파일 이름 그대로 → 제목이 「01 개념 …」「02 증명1 …」)
# 9. 제목·설명·썸네일 맞추고 일부 공개로 → <영상폴더>/_유튜브_주소.json
node scripts/lesson-video/yt_update_concepts.mjs "<영상폴더>" --dry   # 먼저 확인
node scripts/lesson-video/yt_update_concepts.mjs "<영상폴더>"
# 10. 앱 강의 목록에 연결 (lesson_videos upsert, 기준 grade+order_label)
node scripts/lesson-video/sync_lesson_videos.mjs "<영상폴더>" --grade 공통수학1 --ids "<영상폴더>/_유튜브_주소.json" --dry
node scripts/lesson-video/sync_lesson_videos.mjs "<영상폴더>" --grade 공통수학1 --ids "<영상폴더>/_유튜브_주소.json"
```

## 대본 규칙
- 말투 기준: `docs/대본/공통수학2/_말투.md` (원장님 녹음 받아쓰기에서 뽑음). 기본 **반말**(「~하면 돼」「~되는 거다」),
  확인은 「~죠?」, 문단 시작은 「자,」. 「~합니다」는 마무리 인사 정도만. 학생 이름·교실에서만 맞는 말은 넣지 않는다.
- **길이: 말(`say`) 전체 1650자 이하** — `validate.py`의 `MAX_CHARS = 1650`(1초에 약 7.2자, 4분 ≈ 1730자). 넘으면 검사 통과 안 됨.
  공통수학1 개념 34편 모두 1650자 안에 맞췄다.
- 말풍선 `bubble` 28자 이하, 필기 note/arrow 글자 22자 이하(넘으면 경고).
- `say`는 음성이 그대로 읽는다 → **영문자·숫자 금지**, 한글 소리로(엑스 원, 이분의 일, 에프 엑스, 플마).
- 표시: `/` 잠깐 쉼, `//` 길게 쉼, `{빠르게 …}` `{강조 …}` `{천천히 …}`. **쉼표마다 쉬게 하지 않는다**(뚝뚝 끊긴다 — 원장님).
- 잘못 읽는 말은 `docs/대본/발음사전.json`에 「표기」: 「읽는 말」로 더한다(화면 글자는 그대로, 긴 표기부터 바뀜).
- 개념 대본 필드: `no, title, file, chapter, sub_chapter, book, pages, scenes[{show, pose, step, bubble, say, marks}], examples, example_codes[{no,title,page,type_code}], thumb_pose`.
  필기 `cue`는 말 안의 글자, `find`는 교재 글자층 그대로, `nth`는 토막 안 순번.
- `example_codes[].type_code`(예 `공수1-02-06`)는 **문제은행 필수예제의 유형 코드에 맞춘다** — `.구간.json` → `lesson_videos.type_codes`로 가서
  학생 시청 기록을 유형에 잇는 열쇠다.
- 증명 대본 필드: `id, order("02-증명1"), title, concept_no, chapter, sub_chapter, book_page, steps[{pose, bubble, say, write[{cue, tex, color, highlight}]}]`, 공식 쓰기는 `label`.
- 목소리: ElevenLabs `수지쌤 (원장님 목소리)` voice_id `mbwQpKqHamJOPuXJoCPc`. 원 녹음 대본은 `docs/녹음대본_수지쌤목소리.md`.
- 학생 이름 부르기 문장은 대본이 아니라 `lib/nameCalls.ts`(+ `name_calls_v2.mjs`) — **담백하게, 칭찬·감탄 빼고 할 일만**.
- `docs/대본/<과정>/NN_….md` + `_대본.json`은 `scripts/make-lesson-scripts.mjs`(Claude API)로 뽑은 슬라이드식 초안이다. 실제 렌더 입력은 `개념/`·`증명/` 안의 JSON.

## 썸네일 규칙 (`scripts/lesson-video/thumbnails.py`)
- 크기 1672×941, 번호 배지 · 굵은 제목(BlackHanSans) · 말풍선 · 수지. 과정마다 바탕색을 다르게, 증명은 그 과정 개념보다 한 단계 진하게.
  - 공통수학2: 개념 연두 파스텔 `(221,245,230)` / 증명 진한 초록 `(156,214,172)` / 풀이 더 진한 초록
  - 공통수학1: 개념 하늘색 파스텔 `(222,236,252)` / 증명 진한 파랑 `(160,196,238)`
  - **새 과정은 `THEME`에 새 색을 더하고** `make(...)` 고르는 자리도 고친다(지금은 `grade == '공통수학2'`가 아니면 공통수학1 색).
- 수지 자세: 개념은 대본의 `thumb_pose`, 증명·공식 쓰기는 D(지시봉). 자세 A 가리키기 · B 이것만 기억 · C 갸웃 · D 지시봉 · E 화이팅,
  공통수학1부터 새 자세 F 쓰기 · G 아이디어 · H 책 · I 엄지(`suji/poses/`, `suji_pose.py`).
- 말풍선: 개념은 첫 `cut_` 장면의 bubble, 증명은 첫 step의 bubble. 긴 제목은 두 줄로 나뉜다.
- 원장님이 GPT로 만든 큰 썸네일(500KB 넘는 jpg/png)이 있으면 건너뛴다. 캐릭터 새 그림은 직접 그리지 말고 `docs/대본/수지_자세_GPT프롬프트.md` 프롬프트로.

## 유튜브 제목·설명·공개 범위 (`concept_youtube.py`, `yt_update_concepts.mjs`)
- 개념 제목: `[공통수학1] 01. 다항식의 덧셈과 뺄셈 | 개념 강의 | 수학의지혜 수지쌤`
- 증명 제목: `[공통수학1] 07-증명1. <제목> | 손으로 쓰는 증명 | 수지쌤`, 공식 쓰기는 가운데가 `공식 쓰기`
- 제목의 `[과정] NN.` / `NN-증명K.` 번호로 `sync_lesson_videos.mjs`가 강의 목록에 잇는다 → **이 꼴을 바꾸지 말 것.**
- 설명: 과정 › 단원 한 줄, 교재 쪽, [목차](장면 시작 시각), 개념은 [이어서 풀 문제] 필수예제 목록, 증명은 「먼저 볼 개념 강의」,
  「모르는 건 스터디체크 질문하기로…」, 해시태그. `< >`는 전각 `＜ ＞`로 바꿔 보낸다(유튜브가 거부).
- **공개 범위는 「일부 공개」(unlisted)**: 학생 앱은 유튜브를 화면 안에서 트는데 비공개 영상은 재생이 안 되고, 재생목록에서 제목도 안 읽혀 연결도 안 된다.
- 태그 `수학의지혜, 수지쌤, 고1수학`, `embeddable: true`, `defaultLanguage: ko`.
- 할당량: 영상마다 videos.update 50 + thumbnails.set 50, 하루 10,000. 429·하루치 초과면 멈추고 다음 날 이어서.

## 앱 연결
- `sync_lesson_videos.mjs`가 영상 폴더의 `.구간.json`으로 `lesson_videos` 행(kind 개념/증명/대표예제, scenes, type_codes, duration)을 만들고
  `(grade, order_label)` 기준으로 덮어쓴다. 다시 올려 주소가 바뀌어도 이것만 다시 돌리면 된다.
- 유튜브 id는 둘 중 하나: `--ids <_유튜브_주소.json>`(재생목록 없이 올린 영상 — 공통수학1 방식) 또는 `--playlist-env YOUTUBE_PLAYLIST_CM2`(재생목록 제목에서 읽음, 공통수학2 방식).
- 운영 DB를 쓰는 작업이다. 먼저 `--dry`로 편수·연결 수를 보고 돌린다.

## 필요한 키 (`.env.local`, 이름만)
- `ELEVENLABS_API_KEY` (권한: Text to Speech, Voices Write, Speech to Text)
- `YOUTUBE_OAUTH_CLIENT_ID`, `YOUTUBE_OAUTH_CLIENT_SECRET`, `YOUTUBE_OAUTH_REFRESH_TOKEN` (처음은 `yt_thumbnails.mjs` 기기 로그인으로 refresh token을 얻는다)
- `YOUTUBE_API_KEY`, `YOUTUBE_PLAYLIST_CM2` (재생목록으로 연결할 때)
- `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (DB 읽기·`lesson_videos` 쓰기)
- `ANTHROPIC_API_KEY` (`make-lesson-scripts.mjs`, `match-type-concept.mjs`)

## 자주 하는 실수
- `--grade`를 빼먹음 → `concept_youtube.py`·`thumbnails.py`·`sync_lesson_videos.mjs` 모두 기본값이 **공통수학2**라 제목·색·연결이 엉뚱하게 된다.
- 셸 heredoc으로 대본 JSON·파이썬을 쓰면 역슬래시(`\\frac` 등)가 깨진다 → 편집기(Write)로 쓴다.
- ElevenLabs에 동시에 많이 보내면 429 → 3편씩(`--jobs 3`)만. 크레딧이 떨어져 멈추면 충전 후 같은 명령을 다시 돌리면 캐시로 이어진다.
- 대본 문장을 고치면 그 조각 음성을 새로 받는다(크레딧). 고치기 전에 `credit_check.py`로 확인. 짧은 판(`--version short`)도 앞뒤 조각을 새로 받는다.
- 유튜브에 이미 올린 영상을 다시 만들어 올리면 주소가 바뀐다 → 진행 막대 등은 새 영상부터, 다시 올렸으면 sync를 다시.
- 비공개로 둔 채 sync → 연결 안 됨. 반드시 일부 공개로.
- 공식 쓰기 영상 제목에 「공식 … 써 보기」가 없으면 앱 제출 칸이 「백지 증명 제출」로 나온다.
- 교재 PDF·잘라 낸 교재 그림은 **저작권 때문에 저장소에 넣지 않는다**(영상 폴더는 저장소 밖).
- 유형 코드를 문제은행 필수예제와 안 맞추면 시청 기록이 유형에 안 이어진다(에러는 안 난다).

## 규칙 추가 기록
> 작업하다 새 규칙이 생기면 여기 날짜와 함께 한 줄씩 추가하고, 위 본문의 해당 자리에도 반영한다.
- 2026-10-27 스킬 처음 만듦 (지금까지의 커밋·문서 기준)
- 2026-10-27 풀이 영상도 이 도구로(solution_materials·render_all --solutions·--grade). 객관식 보기는 대본 쓸 때 같이. 행렬은 mathtext 에 pmatrix 가 없어 \genfrac 로 그린다. 단위행렬 E 는 「단위행렬 이」로 읽힌다(숫자 2와 헷갈림)
- 2026-10-27 공식 쓰기 영상은 공식 목록 쪽 + Plus 쪽 두 쪽에 걸친다 → 대본에 `book_pages: [10, 11]` (유튜브 설명 「10~11쪽」, 앱 book_pages). 이미 맞춘 영상만 다시 고칠 땐 `yt_update_concepts.mjs <폴더> --only 02-증명1,07-증명1` (영상마다 할당량 100). 썸네일은 하루 수십 장 넘게 바꾸면 429 「too many thumbnails」 — 다음 날 이어서
- 2026-10-28 중학교 개념편은 `concept_cuts_mid.py --grade 중1 --semester 2 --map '{교재 단원: 소단원번호}'` (토막 + 재료를 한 번에). 강의 한 편 = 한 쪽의 개념 상자 1~3개 + 개념 확인. 라이트판(중3-2)은 개념 확인이 상자 토막 안에 있어 대본에서 clip 으로 보여 준다. 중2-1·중3-1 개념편은 짜임이 또 달라 아직 안 됨
- 2026-10-28 썸네일 색: 중1 노랑 · 중2 분홍 · 중3 보라 파스텔. 중학교 영상 마지막 화면·유튜브 설명은 「필수 문제」(번호 없이 — 재료 번호가 교재 번호와 다름)
- 2026-10-28 영상 도구가 교재 토막의 여백을 자를 때 밝기 200 기준(예전 110은 분홍·하늘색 설명 글자를 잘라 냈다)
- 2026-10-28 원장님: 학기 중에는 지금 학기(2학기) 교재부터 만든다
