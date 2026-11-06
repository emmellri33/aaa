// TITLE: EYES 분할2 (4/5) — server 발췌·스켈레톤 서빙 분기
const fs = require('fs');

const file = 'server.js';
let content = fs.readFileSync(file, 'utf8');

function patchOnce(target, search, replace, label) {
  const parts = target.split(search);
  if (parts.length !== 2) {
    console.error('FAIL [' + label + ']: ' + (parts.length - 1) + '회 발견 - 파일 미기록 원복');
    process.exit(1);
  }
  return parts[0] + replace + parts[1];
}

// 4) /api/ai-modify: 파일명 판정(풀네임 또는 유일 부분일치), 모호 시 목록 반환 및 질문 유도, 명확 시 발췌±25줄 + 스켈레톤(상한 20줄) 주입
const search4 = `      // 1회차에만 전체 코드 전달, 2회차부터는 토큰 절약을 위해 생략 문구로 대체
      const codeSection = (round === 1)
        ? (\`\\n\\n[현재 \${targetFile} 전체 코드]\\n\` + htmlSource)
        : \`\\n\\n[현재 \${targetFile} 전체 코드]\\n(1회차에 이미 전달된 전체 코드는 생략 — 위 1회차 코드 및 아래 도구 결과를 참고하고, 이미 받은 내용은 재조회하지 마세요)\`;`;

const replace4 = `      // --- EYES 분할2 서빙부: 명확(3칸 참) vs 애매(빈칸) 분기 + 스켈레톤 맵 항상 포함 ---
      const skeletonMap = extractSkeletonMap(htmlSource);
      const skeletonBlock = "\\n\\n[대상 파일 스켈레톤 맵 (최대 20줄 목차)]\\n" + skeletonMap;

      let codeSection = "";
      if (round === 1) {
        // 명확/애매 판정: instruction 분석
        const lines = htmlSource ? htmlSource.split("\\n") : [];
        const words = String(instruction || "").split(/\\s+/).filter(w => w.length >= 2);
        let matchIdx = -1;
        if (words.length > 0) {
          for (let li = 0; li < lines.length; li++) {
            const lowLine = lines[li].toLowerCase();
            if (words.some(w => lowLine.includes(w.toLowerCase()))) {
              matchIdx = li;
              break;
            }
          }
        }

        const isExplicitCase = (matchIdx !== -1 && lines.length > 0 && targetFile);
        if (isExplicitCase && lines.length > 60) {
          // 명확 건: 위치 발췌 앞뒤 25줄 자동 제공 + 스켈레톤
          const startL = Math.max(0, matchIdx - 25);
          const endL = Math.min(lines.length, matchIdx + 26);
          const excerpt = lines.slice(startL, endL).map((l, i) => (startL + i + 1) + ": " + l).join("\\n");
          codeSection = "\\n\\n[현재 " + targetFile + " 관련 위치 발췌 (" + (startL + 1) + "~" + endL + "줄, 총 " + lines.length + "줄 중)]\\n" + excerpt +
                        "\\n(주의: 필요 시 read 도구로 추가 범위를 당겨오세요.)" + skeletonBlock;
        } else if (lines.length <= 60 && lines.length > 0) {
          // 60줄 이하 소형 파일은 전체를 발췌로 제공
          codeSection = "\\n\\n[현재 " + targetFile + " 전체 코드 (" + lines.length + "줄)]\\n" + htmlSource + skeletonBlock;
        } else {
          // 애매 건: 목록만 서빙 (파일 목록·기억 제목·실패 제목), 통째 코드 push 금지, 모델이 read로 pull
          let workspaceFileList = [];
          try {
            workspaceFileList = fs.readdirSync(__dirname, { withFileTypes: true })
              .filter(e => e.isFile() && !isForbiddenFileName(e.name))
              .map(e => e.name);
          } catch {}
          codeSection = "\\n\\n[애매 경로 안내 — 코드 통째 반환 생략 (pull 방식)]\\n" +
                        "- 사용 가능 파일 목록: " + workspaceFileList.join(", ") + "\\n" +
                        "- 공유 기억 목록:\\n" + getMemoryHeadersSummary(req.body ? req.body.roomId : null) + "\\n" +
                        "- 최근 실패 일지:\\n" + getFailuresHeadersSummary() + "\\n" +
                        "(코드가 필요하면 read 도구로 범위를 지정해 필요한 조각을 직접 당겨오세요.)" + skeletonBlock;
        }
      } else {
        codeSection = "\\n\\n[현재 " + targetFile + " 코드]\\n(1회차 발췌/스켈레톤 및 이전 도구 결과를 참고하세요. 추가 코드는 read({file, start, end})로 당겨오세요.)";
      }`;

content = patchOnce(content, search4, replace4, "발췌 및 스켈레톤 서빙 분기");
fs.writeFileSync(file, content, 'utf8');
console.log('PASS (4/5) server 서빙 분기');
