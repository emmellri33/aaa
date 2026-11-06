// TITLE: EYES 분할2 (3/5) — server G7 변형 스윕 프롬프트
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

// 3) PATCH_SYSTEM_PROMPT 내 G7 규칙(스켈레톤, 위치 발췌, 2회+ 변형 스윕 의무) 추가
const search3 = `  "3. [전수 탐색 & 다조각 edits 필수] 패치 전 대상 선택자·속성·값의 모든 변형(예: 기본 선택자와 다크모드 body.dark 변형, 미디어쿼리 등)을 전수 탐색하세요. 변형이 여러 곳에 존재하면 절대 1곳만 고치지 말고, 반드시 edits 배열에 모든 조각을 빠짐없이 담아 한 번에 반환하세요.",`;
const replace3 = `  "3. [전수 탐색 & 2회+ 변형 스윕 의무] 패치 전 대상 선택자·속성·값의 모든 변형(기본·다크모드 body.dark·미디어쿼리 등)을 전수 탐색하세요. 특히 동일 선택자나 속성이 원본에 2회 이상 출현하면 반드시 넓혀 보기(G7)로 전 위치를 확인하고, 변형이 여러 곳에 존재하면 edits 배열에 빠짐없이 담아 한 번에 반환하세요.",`;

content = patchOnce(content, search3, replace3, "G7 2회+ 변형 스윕 프롬프트 규칙");
fs.writeFileSync(file, content, 'utf8');
console.log('PASS (3/5) server G7 프롬프트');
