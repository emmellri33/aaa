// TITLE: 2. server.js 세션 상한 및 아카이브 이동 헬퍼 신설 (step2_session_cap_helper.js)
const fs = require('fs');

const file = 'server.js';
let content = fs.readFileSync(file, 'utf8');

const search = `// --- EYES 분할5: C2 더티 핑거프린트 stash (roomId + target 키 map) ---`;

const replace = `// --- SESSION 분할2: 상한(8000) 검사 및 ## 아카이브 자동 이동 헬퍼 ---
function processSessionCap(fullContent) {
  let archiveReview = null;
  const archiveHeader = '## 아카이브';
  
  if (!fullContent.includes(archiveHeader)) {
    fullContent += '\\n\\n' + archiveHeader + '\\n';
  }
  
  const headerIdx = fullContent.indexOf(archiveHeader);
  let hotSection = fullContent.slice(0, headerIdx);
  let archiveSection = fullContent.slice(headerIdx);
  
  const calib = readCalibFactors();
  const calibIn = calib.in || 0.25;
  
  let estTokens = Math.max(1, Math.round(hotSection.length * calibIn));
  let movedLines = [];
  
  if (estTokens > SESSION_TOKEN_CAP) {
    let hotLines = hotSection.split('\\n');
    let i = hotLines.length - 1; 
    
    // 오래된(아래쪽) [완료] 줄부터 탐색하여 아카이브로 이동
    while (i >= 0 && estTokens > SESSION_TOKEN_CAP) {
      // 줄 문법 정규식: # [태그] (날짜) [완료]: ...
      if (hotLines[i].match(/^#\\s+\\[.*?\\]\\s+\\(\\d{4}-\\d{2}-\\d{2}\\)\\s+\\[완료\\]:/)) {
        movedLines.push(hotLines[i]);
        hotLines.splice(i, 1);
        hotSection = hotLines.join('\\n');
        estTokens = Math.max(1, Math.round(hotSection.length * calibIn));
      }
      i--;
    }
    
    if (movedLines.length > 0) {
      archiveSection = archiveHeader + '\\n' + movedLines.join('\\n') + '\\n' + archiveSection.slice(archiveHeader.length).trimStart();
      fullContent = hotSection.trimEnd() + '\\n\\n' + archiveSection;
      
      archiveReview = {
        moved: movedLines,
        instruction: "유지/이동 지정 (요약·압축 금지)"
      };
    }
  }
  
  return { newContent: fullContent, archiveReview };
}

// --- EYES 분할5: C2 더티 핑거프린트 stash (roomId + target 키 map) ---`;

if (content.split(search).length !== 2) {
  console.error('❌ step2_session_cap_helper.js: 앵커 불일치 (fail-closed)');
  process.exit(1);
}

fs.writeFileSync(file, content.replace(search, replace), 'utf8');
console.log('✅ step2_session_cap_helper.js 완료');