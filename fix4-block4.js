// TITLE: 4p. G3+G5+G4 게이트 (evidenceLog판)
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

      // --- EYES 분할3: G2(존재 게이트 엄격판) & G8(합본 문법 게이트) & G6(먹이 첨부 재요청 유도) ---
      const bypassG2G8 = instruction.includes("알고 있어, 그래도 해");
      if (!bypassG2G8) {`;
const replace = `      if (failedChunkBody && typeof failedChunkBody.search === "string") {
        const bypassBlock = instruction.includes("알고 있어, 그래도 해");
        if (!bypassBlock) {
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
      }

      // --- EYES 분할4: G3(증거), G5(가설 대조), G4(서명 차단) ---
      const bypassG2G8 = instruction.includes("알고 있어, 그래도 해");
      const isExcerptModeForGates = htmlSource && htmlSource.split("\\n").length > 60;
      
      if (!bypassG2G8) {
        // G3: 증거 게이트 (발췌 모드인데 도구 로그 0건이면 차단. 질 검증 포함)
        if (isExcerptModeForGates) {
          const validEvidence = evidenceLog.some(e => e.ok && (e.resultLength > 0 || (e.args && String(e.args.pattern || "").includes("없음"))));
          if (!validEvidence) {
            return res.status(422).json({ ok: false, error: "[기계컷: 증거 미첨부] 발췌 모드에서는 파일의 일부만 보입니다. 대상 코드를 read/grep 도구로 직접 확인(증거 확보)한 뒤에 패치를 제안하세요.", patch: finalParsed });
          }
        }

        // G5: 가설 검증 (최대 3개 모양 검사, 코드로 대조)
        // TODO(EYES-ROUTER-DIET): 프롬프트 조립부에 가설 JSON 형식을 넣지 않았으므로 현재 AI는 가설을 제출하지 않음. 제출 시 활성화됨.
        if (Array.isArray(finalParsed.hypotheses) && finalParsed.hypotheses.length > 0) {
          const validHypo = finalParsed.hypotheses.find(h => {
             if (!h.target || !h.location || !h.action || !h.reason) return false;
             return htmlSource.includes(h.location) || htmlSource.includes(h.reason); // 매우 기초적인 grep 대조 (향후 정교화 가능)
          });
          if (!validHypo) {
             return res.status(422).json({ ok: false, error: "[기계컷: 가설 대조 실패] 제출하신 가설들이 현재 원본 코드와 일치하지 않습니다. 도구로 다시 확인하고 새 가설을 수립하세요.", patch: finalParsed });
          }
        }

        // G4: 서명 차단 (당일 동일 시그니처 재시도 차단)
        if (finalParsed.type === "patch" && rawEdits.length > 0) {
          const sig = generatePatchSignature(finalParsed.target || targetFile, rawEdits[0].search);
          if (fs.existsSync(FAILURES_PATH)) {
            const rawFailures = fs.readFileSync(FAILURES_PATH, "utf8").split("\\n");
            const today = new Date().toISOString().slice(0, 10);
            const isBlocked = rawFailures.some(l => l.includes(today) && l.includes(sig));
            if (isBlocked) {
               return res.status(422).json({ ok: false, error: "[기계컷: 동일 시그니처 재시도] 오늘 이미 실패로 기록된 동일한 수정 사항(서명: " + sig + ")입니다. 전혀 다른 접근법을 사용하세요.", patch: finalParsed });
            }
          }
        }
      }
      // -------------------------------------------------------------------------

      // --- EYES 분할3: G2(존재 게이트 엄격판) & G8(합본 문법 게이트) & G6(먹이 첨부 재요청 유도) ---
      if (!bypassG2G8) {`;
if (content.split(search).length !== 2) {
  console.error('FAIL 4p anchor');
  process.exit(1);
}
content = content.replace(search, replace);
fs.writeFileSync('server.js', content, 'utf8');
console.log('OK 4p');
