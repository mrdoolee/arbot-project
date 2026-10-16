# 인계 메모: 이 PC에 보관해 둔 로컬 수정(stash) 비교하기

> **임시 문서예요.** 아래 일(1번)이 끝나면 이 파일을 지워도 돼요. (2026-10-16 기준 스냅샷이라, 상황이 바뀌었을 수 있어요. 먼저 `git stash list`로 확인하세요.)
>
> 로컬 Claude Code에는 이 문서의 경로만 알려 줘도 돼요:
>
>     docs/handoff-local-stash-review.md 를 읽고 "이번에 할 일"만 해 줘. 읽기 전용으로 비교하고, 내가 허락하기 전에는 아무것도 바꾸지 마.

## 1. 이번에 할 일 (읽기 전용 비교)

선생님 PC에는 클라우드 작업과 **따로 해 둔 캐릭터 관련 로컬 수정**이 있었고, `git pull` 전에 stash로 보관해 두었어요. 그 안에 `main`에 없는 기능이 있는지 확인하는 게 목표예요.

### 현재 상황 (스냅샷)

- `main`은 `4bd1e70` "시트 구조 정리 (#3)"이에요. 클라우드에서 한 작업이 모두 들어 있어요.
  - #1 캐릭터·페르소나 1:1 짝짓기 (`argu-shared.js`의 `CHARACTERS[].template`, `resolveCharacter`, `STUDENT_COPY`)
  - #2 탐구 자료 예시 채우기 (`public/js/material-samples.js`)
  - #3 시트 구조 정리 (환경설정 B1~B3, 기본설정 B1~B4, 루브릭 B열 삭제, 주소 상수 `ENV_*`/`CFG_*`)
- GAS도 `clasp`로 배포했고 선생님이 동작을 확인했어요.
- 클라우드 브랜치 `claude/fervent-ride-s32kj1`은 이미 머지됐어요. 다시 쓰지 말고, 새 작업은 항상 `main`에서 새 브랜치로 시작하세요.
- 로컬 stash는 두 개예요(둘 다 기반 커밋은 `9f9a683`, 즉 `main`이 #1~#3을 받기 전).

| stash | 이름 | 내용 |
|---|---|---|
| `stash@{0}` | 배포 전 로컬 변경 백업2 | 추적 중인 파일만. `AGENTS.md`, `CLAUDE.md`, `README.md`, `gas-source/Code.js`(62줄), `gas-source/Guide.html`, `gas-source/Templates.js`, `package.json`, `public/css/admin.css`, `public/index.html`, `public/js/argu-shared.js`(128줄), `public/student.html` |
| `stash@{1}` | 배포 전 로컬 변경 백업 | 위와 같은 수정 + 새 파일(`stash@{1}^3`): `tests/characters.test.js`(101줄), `tests/gas_characters.test.js`(154줄) |

- 추측: 예전에 이 PC에서 "페르소나 5종에 캐릭터 5종을 1:1로 짝짓기"를 따로 구현해 둔 것 같아요. `main`의 구현과 겹칠 가능성이 높지만, `main`에 없는 기능이 있을 수도 있어요.
- 특히 궁금한 것: `gas-source/Code.js` 변경(`main`의 캐릭터 작업은 `Code.js`를 건드리지 않았어요), `package.json` 변경, 그리고 두 시험 파일이 무엇을 확인하는지.

### 요청

1. 위 stash의 변경 내용이 `main`(`4bd1e70`)에 이미 들어 있는지, 아니면 `main`에 없는 기능·시험이 있는지 파일별로 비교해 주세요.
2. 결과를 표로 정리해 주세요: 항목 / stash에만 있는지 / `main`에 같은 기능이 있는지 / 가져오면 좋은지 의견.
3. 선생님이 "가져오자"고 하기 전에는 **아무것도 바꾸지 마세요**(파일 수정·커밋·push·stash 삭제 모두 금지).
4. 가져오기로 하면 `main`에서 새 브랜치를 만들어 필요한 것만 옮기고, `npm test`를 모두 통과시키고, `CLAUDE.md`와 `AGENTS.md`를 같이 고치고, PR 전에 선생님께 먼저 보여 주세요.

## 2. Windows PowerShell 주의점 (같은 실수 반복 방지)

- 폴더 이름에 공백이 있으니 경로는 항상 큰따옴표로 감싸요.
- stash 참조는 **작은따옴표**로 감싸요: `'stash@{0}'`, `'stash@{1}^3'`. 안 감싸면 PowerShell이 `@{`를 특수 기호로 읽어서 깨져요.
- `git diff … -- <경로>`의 경로는 **현재 위치 기준**이에요. 저장소 맨 위 폴더에서 실행하세요(`gas-source`에서 실행하면 결과가 빈 화면으로 나와요).
- stash를 만들 때 `-u`(`--include-untracked`)는 쓰지 마세요. `stitch_design/extracted/stitch_ai/2./`, `4./`처럼 이름이 점으로 끝나는 폴더를 Windows에서 Git이 지우지 못해 중간에 멈추고, 수정이 그대로 남아요.
- 변경 내용 보기(읽기 전용):
  - `git diff 'stash@{0}^' 'stash@{0}' -- <경로>` : stash가 만든 기반 커밋과의 차이라서 `main`의 변경이 섞이지 않아요.
  - `git show 'stash@{1}^3:tests/characters.test.js'` : 새 파일 내용 보기
  - `git show --stat --format= 'stash@{1}^3'` : stash에 보관된 새 파일 목록
- `clasp`는 `clasp.cmd`로 실행하세요(`clasp.ps1`은 실행 정책에 막혀요). `LF will be replaced by CRLF` 경고는 무시해도 돼요.
- 출력에 API 키처럼 보이는 문자열이 있으면 그대로 옮겨 적지 마세요.

## 3. 지켜 줄 것

- `git reset --hard`, `git checkout .`, `git stash drop`, `git stash clear` 같은 되돌릴 수 없는 명령은 선생님이 명시적으로 허락하기 전에는 실행하지 마세요.
- GAS 배포(`clasp push` / `clasp deploy`)는 선생님이 요청할 때만 하세요. 배포할 때는 **기존 배포 ID로 `-i`를 꼭 붙이세요**(없으면 새 주소가 생겨 학생 링크와 QR이 옛 코드를 써요). 배포 ID는 `clasp.cmd deployments`에서 `@숫자`로 표시된 것 중, 교사 콘솔 메뉴 1(GAS 연동)에 저장된 주소 `…/macros/s/○○○○/exec`의 ○○○○와 같은 것이에요(`@HEAD`는 쓰지 않아요).
- 결과는 쉬운 한국어로, 단계별로 알려 주세요.

## 4. 나중에 이어서 할 일 (한 번에 하나씩, 1번이 끝난 뒤)

- 캐릭터 그림과 이름이 어긋나는 경우(예: 토론 파트너 그림에 "비판적 사고 코치" 이름)를 `resolveCharacter`가 자동으로 맞추게 하기. 캐릭터 이름이 **다른 캐릭터의 기본 이름**이면 옛 값으로 보고 그 캐릭터의 기본 이름으로 바꿔 보여 주는 규칙이에요. `tests/frontend_static.test.js`에 시험을 추가해야 해요.
- 시트 `정보` 창(`showAbout_`)의 "v1.0 (2026.07)" 버전·날짜 갱신과, 학생 대화가 Gemini로 전달된다는 데이터 안내 추가.
- 안 쓰는 옛 파일 `gas-source/index.html` 삭제(`doGet`이 더는 화면을 만들지 않아요).
- (선생님이 직접 할 일) Gemini API 키를 새로 발급해 교사 콘솔 메뉴 1에서 교체하고, `API키` 탭 2행의 중복 키를 비우기(보안상 권장).

## 5. 시트와 Drive 연결에 대한 메모 (읽기 도구를 쓸 때)

- Google Drive 연결로 시트를 읽으면 **`환경설정` B1의 Gemini 키가 출력에 그대로 나와요.** 키를 교체한 뒤에 읽거나, 키 칸을 비운 사본을 읽게 하세요.
- 읽기 결과의 "Table Sample Data"는 글자 수 한도에 걸려 **뒤쪽 행이 잘려요.** 행이 비어 있다고 단정하지 말고, "Table Range"(예: `A1:K7`)를 기준으로 판단하세요.

## 6. 프로젝트 규칙 요약 (자세한 건 `CLAUDE.md`)

- `npm test`가 전부 통과해야 해요. 시트 구조나 칸 주소를 바꾸면 `gas-source/Code.js` 맨 위의 `ENV_*`/`CFG_*` 상수, `Guide.html`의 시트 구조 표, `tests/gas_harness.js`를 함께 고쳐요.
- `CLAUDE.md`와 `AGENTS.md`는 같은 내용을 유지해요(고칠 때는 둘 다).
- 저장소는 공개예요. 키, `.env`, `.clasprc.json`은 커밋하지 마세요.
