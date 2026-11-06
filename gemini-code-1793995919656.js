// TITLE: 4. 메인 프롬프트에 조립 결과(b팩, 판정1줄) 부착 (step4_prompt_attach.js)
const fs = require('fs');

const file = 'server.js';
let content = fs.readFileSync(file, 'utf8');

const search = `      const targetHeader = "[확정 작업 대상 파일: " + targetFile + "]\\n(주의: 지시문이나 이전 대화의 다른 target 표기와 무관하게, 이번 작업 대상 파일은 오직 \\"" + targetFile + "\\" 1개로 고정됩니다. JSON 응답의 target 필드에도 반드시 \\"" + targetFile + "\\"을 출력하세요.)\\n\\n";
      const prompt = targetHeader + PATCH_SYSTEM_PROMPT + memoryBlock + failureNote + retryNote + recentBlock + codeSection + historySection + roundHint + "\\n\\n[사용자 지시]\\n" + instruction;`;

const replace = `      const targetHeader = "[확정 작업 대상 파일: " + targetFile + "]\\n(주의: 지시문이나 이전 대화의 다른 target 표기와 무관하게, 이번 작업 대상 파일은 오직 \\"" + targetFile + "\\" 1개로 고정됩니다. JSON 응답의 target 필드에도 반드시 \\"" + targetFile + "\\"을 출력하세요.)\\n\\n";
      
      const assembledPrompt = PATCH_SYSTEM_PROMPT + "\\n[현재 라우터 판정]\\n" + routerDecisionLog + "\\n\\n[적용 설명서(b팩)]\\n" + appliedBPack;
      const prompt = targetHeader + assembledPrompt + memoryBlock + failureNote + retryNote + recentBlock + codeSection + historySection + roundHint + "\\n\\n[사용자 지시]\\n" + instruction;`;

if (content.split(search).length !== 2) {
  console.error('❌ 블록 4 앵커 불일치 (fail-closed)');
  process.exit(1);
}

fs.writeFileSync(file, content.replace(search, replace), 'utf8');
console.log('✅ 블록 4: 프롬프트 조립 부착 완료');