#!/bin/zsh
# 정기 글 초안 자동 작성 (launchd: kr.co.invisiblecity.posts, 매일 22:00 한 번)
# 월·수·금 글을 draft: true 초안으로 만들어 커밋·푸시한다. 그날 못 돌았으면(맥이 꺼져 있었으면) 다음 날 22:00에 보충한다.
# 이틀 넘게 밀린 슬롯은 만들지 않고 알림만 보낸다.
#   월: 매달 첫 월요일 = 지난달 재개발 단계 변화(retrack) / 그 밖 = 자치구 정비사업 현황(gu next)
#   수: 홀수 주 = 서울 대장아파트(apt next) / 짝수 주 = 산업용지 공급 공고(factory)
#   금: 홀수 주 = 국내 건축가 / 짝수 주 = 해외 건축가 (claude -p 로 조사해서 작성)
# 시험: DRY=1 (커밋·푸시 안 함), FORCE_SLOT=mon|wed|fri (오늘 날짜로 그 슬롯을 강제 실행)
# launchd 는 ~/Documents 에 접근 못 하므로(macOS TCC) 전용 복제본에서 돈다. README 'invisiblecity 정기 글' 참고.
set -u
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
BLOG="${0:A:h}/.."
cd "$BLOG"
BLOG="$PWD"
export FACTORY_DIR="${FACTORY_DIR:-$HOME/.factory-map-sync}"
export RETRACK_DIR="${RETRACK_DIR:-$HOME/.retrack-sync}"
export ARCHI_DIR="${ARCHI_DIR:-$HOME/.archi2-sync}"
export DRAFT=1
STATE="$BLOG/.state"; mkdir -p "$STATE"
DRY="${DRY:-0}"

notify() { osascript -e "display notification \"$1\" with title \"invisiblecity 정기 글\"" 2>/dev/null; }
echo "== $(date)"

for d in "$FACTORY_DIR" "$RETRACK_DIR" "$ARCHI_DIR"; do
  [ -d "$d/.git" ] && git -C "$d" pull --ff-only -q 2>&1 | tail -1
done
[ "$DRY" = 1 ] || git pull --ff-only -q || { notify "블로그 저장소 pull 실패"; exit 1; }

dstr() { date -v"$1" +%F; }                 # 오늘 기준 날짜 (-0d, -1d)
dow()  { date -j -f %F "$1" +%u; }          # 1=월 … 7=일
iso()  { date -j -f %F "$1" +%V | sed 's/^0//'; }

# 슬롯 하나 실행. 성공 0, 실패 1. 새 글 경로를 NEWPOST 에 남긴다.
run_slot() {
  local d=$1 kind=$2 wk=$(iso $1) before after
  NEWPOST=""
  before=$(ls src/content/posts)
  case $kind in
    mon)
      if [ "$(date -j -f %F "$d" +%d | sed 's/^0//')" -le 7 ]; then
        node scripts/digest.mjs retrack "$(date -j -v-1m -f %F "$d" +%Y-%m)" || return 1
      else
        node scripts/digest.mjs gu next || return 1
      fi ;;
    wed)
      if (( wk % 2 == 1 )); then
        node scripts/digest.mjs apt next || node scripts/digest.mjs factory "$d" || return 1
      else
        node scripts/digest.mjs factory "$d" || return 1
      fi ;;
    fri)
      local o=domestic; (( wk % 2 == 0 )) && o=international
      local pick; pick=$(node scripts/pick-architect.mjs $o) || { o=$([ $o = domestic ] && echo international || echo domestic); pick=$(node scripts/pick-architect.mjs $o) || return 1; }
      write_architect "$o" "$pick" || return 1 ;;
  esac
  # 이미 있던 글을 덮어썼으면 되돌린다(같은 이름의 글이 이미 있다는 뜻).
  git checkout -- src/content/posts 2>/dev/null
  after=$(ls src/content/posts)
  NEWPOST=$(comm -13 <(echo "$before") <(echo "$after") | head -1)
  [ -n "$NEWPOST" ] || return 2   # 2 = 같은 이름의 글이 이미 있어 새로 만들 게 없음
}

write_architect() {
  local origin=$1 pick=$2 cat="국내건축가"; [ "$origin" = international ] && cat="해외건축가"
  local prompt
  prompt=$(cat <<P
invisiblecity 블로그의 정기 글 한 편을 쓴다. 건축가 정보(JSON): $pick  (분류: $cat)
1. $ARCHI_DIR/src/data/architects.ts 에서 이 건축가의 항목(id 기준)을 읽고, $ARCHI_DIR/src/data/architectures.ts 에서 이 건축가의 건물 가운데 '건축, 걷다' 지도에 올라 있는 것을 찾는다. 지도에 있는 건물 3~5곳을 고른다.
2. 문체와 구성은 $BLOG/src/content/posts/국내-건축가-조병수.md 를 따른다(~다 체, 소제목 ## 건물별, '같이 보면', '참고'). 이 파일은 읽기만 하고 고치지 않는다.
3. 사실은 웹 검색으로 확인한다(건축가 약력, 건물 준공 연도·위치·수상). 확인 못 한 것은 쓰지 않거나 '확인되지 않았다'고 적는다. 지도 데이터와 웹이 다르면 웹을 확인해 맞는 쪽을 쓰고, 틀린 지도 데이터는 글 맨 끝 HTML 주석으로 남긴다.
4. 파일: $BLOG/src/content/posts/<slug>.md. slug 는 '국내-건축가-이름' 또는 '해외-건축가-이름'(한글, 하이픈). 프런트매터는 title, slug, date(지금 KST, ISO 8601), draft: true, categories: ["$cat"], tags, description(150자 안팎)을 갖는다.
5. 제목에 콜론(:)을 쓰지 않는다. 제목에서 나눌 때는 앞뒤로 공백 한 칸씩 둔 ' - ' 를 쓴다(예: '국내 건축가 조병수 - 땅을 파고 들어간 집'). 금지: em dash(—), 훈계조 마무리, 과장. 다른 파일은 만들거나 고치지 않는다. 끝나면 파일 경로만 출력한다.
P
)
  claude -p "$prompt" --model claude-opus-5-5 --permission-mode acceptEdits \
    --allowedTools "Read Write Edit Glob Grep WebSearch WebFetch" --max-turns 60 || return 1
}

validate() {   # 프런트매터 필수 값 점검. 실패하면 사이트 빌드가 깨질 수 있어 올리지 않는다.
  node -e '
    const fs=require("fs");const f=process.argv[1];const t=fs.readFileSync(f,"utf8");
    const m=t.match(/^---\n([\s\S]*?)\n---\n/); if(!m) throw new Error("프런트매터 없음");
    for(const k of ["title","slug","date","categories","tags","description"]) if(!new RegExp("^"+k+":","m").test(m[1])) throw new Error(k+" 없음");
    if(!/^draft: true$/m.test(m[1])) throw new Error("draft: true 아님");
    if(t.includes("—")) throw new Error("em dash 포함");
    if(/^title:.*[:：]/m.test(t.split("\n---")[0].replace(/^title: /m,"title: ").replace(/^---\n/,""))) throw new Error("제목에 콜론 포함");
    if(t.split("\n").length<30) throw new Error("본문이 너무 짧음");
  ' "$1"
}

# ── 오늘과 어제 슬롯
typeset -a slots
if [ -n "${FORCE_SLOT:-}" ]; then slots=("$(dstr -0d) $FORCE_SLOT")
else
  for off in -1d -0d; do
    d=$(dstr $off); case $(dow $d) in 1) slots+=("$d mon");; 3) slots+=("$d wed");; 5) slots+=("$d fri");; esac
  done
fi

# 이틀 이상 밀린 슬롯 경고: 지난 3일 안의 월·수·금 가운데 어제보다 앞선 것이 안 끝났으면 알린다.
if [ -z "${FORCE_SLOT:-}" ]; then
  d=$(dstr -2d); case $(dow $d) in 1) k=mon;; 3) k=wed;; 5) k=fri;; *) k="";; esac
  [ -n "$k" ] && [ ! -f "$STATE/$d-$k" ] && notify "$d $k 글이 이틀 넘게 밀려 건너뜀"
fi

fail=0
for s in $slots; do
  d=${s% *}; k=${s#* }
  [ -f "$STATE/$d-$k" ] && { echo "이미 함: $d $k"; continue; }
  echo "-- 슬롯 $d $k"
  run_slot $d $k; rc=$?
  if [ $rc = 2 ]; then echo "이미 글 있음: $d $k"; touch "$STATE/$d-$k"; continue; fi
  if [ $rc = 0 ]; then
    f="src/content/posts/$NEWPOST"
    if validate "$f"; then
      if [ "$DRY" = 1 ]; then echo "DRY: $f"
      else
        git add "$f" && git commit -qm "정기 글 초안: $(grep -m1 '^title:' "$f" | cut -c8- | tr -d '"' | cut -c1-40)

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>" && git push -q && echo "pushed $NEWPOST" && notify "초안 올라옴: $NEWPOST 읽어 보고 게시하세요"
      fi
      touch "$STATE/$d-$k"
    else
      echo "검증 실패: $f"; [ "$DRY" = 1 ] || rm -f "$f"; notify "$d $k 초안 검증 실패(올리지 않음)"; fail=1
    fi
  else
    echo "슬롯 실패: $d $k"; git checkout -- src/content/posts 2>/dev/null; notify "$d $k 정기 글 만들기 실패 — 내일 다시 시도"; fail=1
  fi
done
exit $fail
