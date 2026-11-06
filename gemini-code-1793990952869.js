// TITLE: 2. judgeThreeSlots 3칸 판정 함수 추가 (step2_judge.js)
const fs = require('fs');

const file = 'server.js';
const content = fs.readFileSync(file, 'utf8');

const search = `    const matched = entries.filter(f => f.toLowerCase().includes(raw.toLowerCase()));
    if (matched.length === 1) return { status: "unique_partial", file: matched[0] };
    if (matched.length > 1) return { status: "ambiguous", matches: matched };
    return { status: "none" };
  } catch (e) {
    return { status: "error", error: e.message };
  }
}`;

const replace = `    const matched = entries.filter(f => f.toLowerCase().includes(raw.toLowerCase()));
    if (matched.length === 1) return { status: "unique_partial", file: matched[0] };
    if (matched.length > 1) return { status: "ambiguous", matches: matched };
    return { status: "none" };
  } catch (e) {
    return { status: "error", error: e.message };
  }
}

// --- ROUTER 분할1: 3칸 판정 함수 (파일·위치·내용) ---
function judgeThreeSlots(instructionText, targetOverride) {
  const text = String(instructionText || "").trim();

  // 1. 파일 칸: resolveTargetFileName 호출 연결 (TODO-1)
  let extractedTarget = "";
  const targetMatch = text.match(/(?:target\\s*=\\s*|file\\s*=\\s*)([a-zA-Z0-9_.-]+)/i);
  if (targetMatch) {
    extractedTarget = targetMatch[1];
  } else if (targetOverride) {
    extractedTarget = targetOverride;
  }

  const fileRes = resolveTargetFileName(extractedTarget);
  let fileSlot = false;
  let fileStatus = fileRes.status;
  let resolvedFile = null;
  if (fileRes.status === "exact" || fileRes.status === "unique_partial") {
    fileSlot = true;
    resolvedFile = fileRes.file;
  }

  // 2. 위치 칸: 줄 번호, 선택자, 태그명, 함수명 등 위치 단서 확인
  const locRegex = /(?:\\d+\\s*(?:행|줄|line)|#[a-zA-Z0-9_-]+|\\.[a-zA-Z0-9_-]+|\\b(?:title|button|btn|header|nav|footer|body|h[1-6]|input|form)\\b|함수|선택자)/i;
  const locationSlot = locRegex.test(text);

  // 3. 내용 칸: 바꿀 대상, 속성값, 색상 등 내용 단서 확인
  const vagueHeadRegex = /^(?:안\\s*돼|이거\\s*왜\\s*안\\s*돼\\??|다시\\s*해줘|제목\\s*바꿔줘|거기\\s*색만\\s*바꿔|고쳐줘|수정해줘)$/i;
  let contentSlot = false;
  if (!vagueHeadRegex.test(text)) {
    const valRegex = /(?:[가-힣a-zA-Z0-9_-]+(?:(으)?로|을|를)|['"][^'"]+['"]|빨강|파랑|초록|검정|흰색|color|background|font|크기|색상|빈페이지)/i;
    contentSlot = valRegex.test(text);
  }

  const isExplicit = (fileSlot && locationSlot && contentSlot && fileStatus !== "ambiguous");

  // G3 모드 플래그: mode: "full" | "excerpt"
  // TODO(소유분할): EYES G3 조건 분기 교체는 통합 패스 때 진행 예정 (TODO-3)
  return {
    isExplicit,
    slots: { file: fileSlot, location: locationSlot, content: contentSlot },
    fileStatus,
    matches: fileRes.matches || [],
    resolvedFile,
    mode: isExplicit ? "excerpt" : "full"
  };
}`;

if (content.split(search).length !== 2) {
  console.error('❌ step2_judge.js: 앵커 매칭 실패 (fail-closed)');
  process.exit(1);
}

fs.writeFileSync(file, content.replace(search, replace), 'utf8');
console.log('✅ step2_judge.js: judgeThreeSlots 함수 추가 완료');