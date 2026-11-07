// TITLE: 3. server.js OFF+패치 타당성 판단 경로 구현 (step3_server_feasibility.js)
const fs = require('fs');

const file = 'server.js';
let content = fs.readFileSync(file, 'utf8');

const search = `        } else {
           appliedBPack = BPACK_PATCH;
           routerDecisionLog = \`모드: 패치 (라우터: 패치, 신뢰도 \${liteConf})\`;
        }`;

const replace = `        } else {
           // G2: OFF + lite r=패치 -> EYES 패치 파이프 진입 금지, 타당성 판단 경로(읽기 전용) 실행
           console.log("ROUTER pipe: [타당성] OFF + lite r=패치 -> 타당성 판단 1회 실행 (패치 카드 생성 안 함)");
           const skelMap = extractSkeletonMap(htmlSource);
           const linesArr = htmlSource ? htmlSource.split("\\n") : [];
           let tLineIdx = 0;
           const lnMatch = String(instruction || "").match(/(\\d+)\\s*(?:행|줄|line)/i);
           if (lnMatch) tLineIdx = Math.max(0, parseInt(lnMatch[1], 10) - 1);

           let feasCodeBlock = "";
           if (linesArr.length > 60) {
             const sL = Math.max(0, tLineIdx - 25);
             const eL = Math.min(linesArr.length, tLineIdx + 26);
             const exc = linesArr.slice(sL, eL).map((l, idx) => (sL + idx + 1) + ": " + l).join("\\n");
             feasCodeBlock = "[현재 " + targetFile + " 관련 위치 발췌 (" + (sL + 1) + "~" + eL + "줄, 총 " + linesArr.length + "줄 중)]\\n" + exc + "\\n\\n[대상 파일 스켈레톤 맵]\\n" + skelMap;
           } else {
             feasCodeBlock = "[현재 " + targetFile + " 전체 코드 (" + linesArr.length + "줄)]\\n" + htmlSource + "\\n\\n[대상 파일 스켈레톤 맵]\\n" + skelMap;
           }

           const feasTargetHeader = "[확정 작업 대상 파일: " + targetFile + "]\\n";
           const feasDecision = \`모드: 타당성 판단 (라우터: 패치, 신뢰도 \${liteConf}, 코딩 OFF)\`;
           const feasPrompt = feasTargetHeader + PATCH_SYSTEM_PROMPT + "\\n[현재 라우터 판정]\\n" + feasDecision + "\\n\\n[적용 설명서(b팩)]\\n" + BPACK_FEASIBILITY + memoryBlock + recentBlock + "\\n\\n" + feasCodeBlock + "\\n\\n[사용자 지시]\\n" + signalText;

           let feasText = "";
           let feasUsage = null;
           try {
             const feasRes = await ai.models.generateContent({
               model: useModel,
               contents: buildMultimodalContents(feasPrompt, images),
             });
             feasText = (feasRes && feasRes.text) ? String(feasRes.text).trim() : "";
             const fMeta = feasRes && feasRes.usageMetadata ? feasRes.usageMetadata : null;
             feasUsage = logUsageCall({
               route: "feasibility",
               model: useModel,
               inChars: feasPrompt.length,
               outChars: feasText.length,
               inTok: fMeta?.promptTokenCount ?? null,
               outTok: fMeta?.candidatesTokenCount ?? null
             });
           } catch (fErr) {
             const fallbackCard = {
               type: "question",
               question: "[타당성 판단 폴백] 판단 생성 중 오류가 발생했습니다 (" + fErr.message + "). 코딩 토글을 켜고 진행할까요?",
               options: [
                 { label: "💻 코딩 토글 켜고 진행하기", instruction: signalText, enableCoding: true },
                 { label: "⏹️ 그만두기", instruction: "" }
               ]
             };
             return res.json({ ok: true, result: JSON.stringify(fallbackCard), patch: fallbackCard, toolRounds: 0 });
           }

           if (!feasText) {
             feasText = "(타당성 판단 결과가 비어 있습니다.)";
           }

           // G2 존재 대조 (read-only): 인용된 행 번호나 백틱 코드 조각이 원본에 존재하는지 확인 (실패 시 컷 없이 '위치 미확인' 명기)
           let locUnverified = false;
           const citedLineMatch = feasText.match(/(\\d+)\\s*(?:행|줄)/);
           if (citedLineMatch) {
             const citedNum = parseInt(citedLineMatch[1], 10);
             if (citedNum < 1 || citedNum > linesArr.length) locUnverified = true;
           }
           const codeQuotes = [...feasText.matchAll(/\`([^\`\\n]{3,80})\`/g)].map(m => m[1]);
           if (codeQuotes.length > 0 && htmlSource) {
             const anyExists = codeQuotes.some(q => htmlSource.includes(q));
             if (!anyExists) locUnverified = true;
           }
           if (locUnverified) {
             feasText += "\\n(⚠️ 일부 인용 위치 미확인 — 원본 대조 필요)";
           }

           const feasCard = {
             type: "question",
             question: "[타당성 판단 (코딩 OFF — 읽기 전용)]\\n" + feasText,
             options: [
               { label: "💻 코딩 토글 켜고 진행하기 (" + targetFile + ")", instruction: signalText, enableCoding: true },
               { label: "⏹️ 그만두기", instruction: "" }
             ]
           };
           return res.json({ ok: true, result: JSON.stringify(feasCard), patch: feasCard, toolRounds: 0, usage: feasUsage });
        }`;

if (content.split(search).length !== 2) {
  console.error('❌ step3_server_feasibility.js: 앵커 불일치 (fail-closed)');
  process.exit(1);
}

fs.writeFileSync(file, content.replace(search, replace), 'utf8');
console.log('✅ step3_server_feasibility.js 완료');