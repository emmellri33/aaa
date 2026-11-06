// TITLE: 3. 서빙부 단어매칭 교체 및 3칸 판정 연동 (step3_serving.js)
const fs = require('fs');

const file = 'server.js';
const content = fs.readFileSync(file, 'utf8');

const search = `      let codeSection = "";
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
      } else {`;

const replace = `      let codeSection = "";
      if (round === 1) {
        // --- ROUTER 분할1: 3칸 판정 (TODO-1, TODO-16: 단어 매칭 삭제 후 정적 규칙 대체) ---
        // C0 준수: 타겟 최종 결정은 EYES C0(targetFile) 고정. 라우터 판정은 서빙 모드 결정용.
        const routeResult = judgeThreeSlots(instruction, targetFile);
        const lines = htmlSource ? htmlSource.split("\\n") : [];

        // 위치 특정: 줄 번호 명시가 있으면 해당 줄, 없으면 0행(첫 줄) 기준 발췌
        let targetLineIdx = 0;
        const lineNumMatch = String(instruction || "").match(/(\\d+)\\s*(?:행|줄|line)/i);
        if (lineNumMatch) {
          targetLineIdx = Math.max(0, parseInt(lineNumMatch[1], 10) - 1);
        }

        if (routeResult.isExplicit && lines.length > 60) {
          // 명확 건: 위치 발췌 앞뒤 25줄 자동 제공 + 스켈레톤
          const startL = Math.max(0, targetLineIdx - 25);
          const endL = Math.min(lines.length, targetLineIdx + 26);
          const excerpt = lines.slice(startL, endL).map((l, i) => (startL + i + 1) + ": " + l).join("\\n");
          codeSection = "\\n\\n[현재 " + targetFile + " 관련 위치 발췌 (" + (startL + 1) + "~" + endL + "줄, 총 " + lines.length + "줄 중)]\\n" + excerpt +
                        "\\n(주의: 필요 시 read 도구로 추가 범위를 당겨오세요.)" + skeletonBlock;
        } else if (lines.length <= 60 && lines.length > 0) {
          // 60줄 이하 소형 파일 전체 제공 예외 유지
          codeSection = "\\n\\n[현재 " + targetFile + " 전체 코드 (" + lines.length + "줄)]\\n" + htmlSource + skeletonBlock;
        } else {
          // 애매 건: 목록만 서빙 (파일 목록·기억 제목·실패 제목) + 직전 가설 쪽지 200자
          let workspaceFileList = [];
          try {
            workspaceFileList = fs.readdirSync(__dirname, { withFileTypes: true })
              .filter(e => e.isFile() && !isForbiddenFileName(e.name))
              .map(e => e.name);
          } catch {}

          const ambiguousNote = (routeResult.fileStatus === "ambiguous")
            ? "\\n[⚠️ 파일 후보 다수 발견: " + routeResult.matches.join(", ") + " 중 어느 파일인지 먼저 확인하세요]\\n"
            : "";

          // 직전 가설 쪽지 200자: 최근 대화 및 관찰 재료에서 발췌
          const prevContextSnippet = String(recentTurns || observedSummaries.slice(-2).join("; ") || "직전 가설 없음").slice(0, 200);

          codeSection = "\\n\\n[애매 경로 안내 — 코드 통째 반환 생략 (pull 방식)]" + ambiguousNote + "\\n" +
                        "- 사용 가능 파일 목록: " + workspaceFileList.join(", ") + "\\n" +
                        "- 공유 기억 목록:\\n" + getMemoryHeadersSummary(req.body ? req.body.roomId : null) + "\\n" +
                        "- 최근 실패 일지:\\n" + getFailuresHeadersSummary() + "\\n" +
                        "- 직전 가설 쪽지 (200자): " + prevContextSnippet + "\\n" +
                        "(코드가 필요하면 read 도구로 범위를 지정해 필요한 조각을 직접 당겨오세요.)" + skeletonBlock;
        }
      } else {`;

if (content.split(search).length !== 2) {
  console.error('❌ step3_serving.js: 앵커 매칭 실패 (fail-closed)');
  process.exit(1);
}

fs.writeFileSync(file, content.replace(search, replace), 'utf8');
console.log('✅ step3_serving.js: 서빙부 3칸 판정 교체 완료');