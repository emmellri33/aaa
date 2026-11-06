// TITLE: 3. /api/ai-modify 내 G2, G8, G6 게이트 추가 (server.js)
const fs = require('fs');
let content = fs.readFileSync('server.js', 'utf8');

const search = `      if (failedChunkBody && typeof failedChunkBody.search === "string") {
        const _fcT = String(failedChunkBody.target || "") === "index" ? "index.html" : String(failedChunkBody.target || "");
        const _curT = String(finalParsed.target || targetFile);
        if (_fcT && _curT === _fcT) {
          for (let _fi = 0; _fi < rawEdits.length; _fi++) {
            if (rawEdits[_fi].search === failedChunkBody.search) {
              return res.status(422).json({ ok: false, error: "거부됨(422): [동일 조각 재제출 금지] " + (_fi + 1) + "번째 조각이 실패 조각과 동일합니다. 다른 가설로 다시 작성하세요.", patch: finalParsed });
            }
          }
        }
      }

      const exp = String(finalParsed.explanation || "").trim();`;

const replace = `      if (failedChunkBody && typeof failedChunkBody.search === "string") {
        const _fcT = String(failedChunkBody.target || "") === "index" ? "index.html" : String(failedChunkBody.target || "");
        const _curT = String(finalParsed.target || targetFile);
        if (_fcT && _curT === _fcT) {
          for (let _fi = 0; _fi < rawEdits.length; _fi++) {
            if (rawEdits[_fi].search === failedChunkBody.search) {
              return res.status(422).json({ ok: false, error: "거부됨(422): [동일 조각 재제출 금지] " + (_fi + 1) + "번째 조각이 실패 조각과 동일합니다. 다른 가설로 다시 작성하세요.", patch: finalParsed });
            }
          }
        }
      }

      // --- EYES 분할3: G2(존재 게이트 엄격판) & G8(합본 문법 게이트) & G6(먹이 첨부 재요청 유도) ---
      const bypassG2G8 = instruction.includes("알고 있어, 그래도 해");
      if (!bypassG2G8) {
        let workingContent = htmlSource;
        const isExcerptMode = htmlSource && htmlSource.split("\\n").length > 60;

        for (let i = 0; i < rawEdits.length; i++) {
          const ed = rawEdits[i];
          const count = workingContent.split(ed.search).length - 1;
          
          if (count === 0) {
            let errorMsg = \`[기계컷: 원본 불일치 \${i + 1}번째 조각 0회 매치] 해당 조각이 메모리상 복사본(순차 적용 중 상태)에 존재하지 않습니다. search를 100% 동일하게 맞춰주세요.\`;
            if (isExcerptMode) errorMsg += "\\n(발췌 모드 참고: 파일 전체를 보지 못해 생긴 오차일 수 있습니다. 도구로 정확한 위치를 다시 확인하세요.)";
            return res.status(422).json({ ok: false, error: errorMsg, patch: finalParsed, failedChunk: { target: targetFile, search: ed.search, replace: ed.replace } });
          }
          if (count >= 2) {
            let errorMsg = \`[기계컷: \${i + 1}번째 조각 \${count}회 매치 — 위아래 3줄 추가 포함해 유일하게] 해당 조각이 여러 곳에 존재합니다. 고치려는 위치가 특정되도록 search 영역을 넓혀주세요.\`;
            if (isExcerptMode) {
               const firstIdx = workingContent.indexOf(ed.search);
               if (firstIdx !== -1) {
                 const before = workingContent.slice(Math.max(0, firstIdx - 200), firstIdx);
                 const after = workingContent.slice(firstIdx + ed.search.length, firstIdx + ed.search.length + 200);
                 errorMsg += "\\n[참고 주변 코드 (첫 발견 위치)]\\n..." + before.split('\\n').slice(-3).join('\\n') + "\\n" + ed.search + "\\n" + after.split('\\n').slice(0, 3).join('\\n') + "...";
               }
            }
            return res.status(422).json({ ok: false, error: errorMsg, patch: finalParsed, failedChunk: { target: targetFile, search: ed.search, replace: ed.replace } });
          }
          workingContent = workingContent.replace(ed.search, ed.replace);
        }
        
        if (targetFile.endsWith(".html")) {
          const checkRes = verifyHtmlScriptsSyntax(workingContent);
          if (!checkRes.ok) {
            const errorMsg = \`[기계컷: 합본 문법 오류 — 원인] 패치 적용 후 코드 구문 에러 발생:\\n\${checkRes.error}\`;
            return res.status(422).json({ ok: false, error: errorMsg, patch: finalParsed, failedChunk: { target: targetFile, search: rawEdits[0].search, replace: rawEdits[0].replace } });
          }
        }
      }
      // ----------------------------------------------------------------------------------------------------

      const exp = String(finalParsed.explanation || "").trim();`;

if (content.split(search).length !== 2) {
  console.error('❌ 앵커 불일치');
  process.exit(1);
}
fs.writeFileSync('server.js', content.replace(search, replace), 'utf8');
console.log('✅ 블록 3 적용 완료');