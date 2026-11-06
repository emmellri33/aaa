// TITLE: EYES 분할2 (1/5) 헬퍼 중복 제거 — 두 번째 복사본만 삭제
// 실행 위치: 레포 루트 (/workspaces/aaa). node dedup-eyes2-helper.js
const fs = require('fs');

const file = 'server.js';
const content = fs.readFileSync(file, 'utf8');

const HEADER = '// --- EYES 분할2: 스켈레톤 추출기 (정규식 기반 id, 함수명, 주요 class / 상한 20줄) ---';

function fail(msg) {
  console.error('FAIL: ' + msg + ' - 파일 미기록 원복');
  process.exit(1);
}

// 1) 헤더가 정확히 2회인가
const first = content.indexOf(HEADER);
if (first === -1) fail('헤더 0회 (대상 아님)');
const second = content.indexOf(HEADER, first + HEADER.length);
if (second === -1) fail('헤더 1회 (중복 없음 — 할 일 없음)');
if (content.indexOf(HEADER, second + HEADER.length) !== -1) fail('헤더 3회 이상 (수동 확인 필요)');

// 2) 두 번째 복사본 끝 = 두 번째 getFailuresHeadersSummary 함수의 닫는 brace
const fnKey = 'function getFailuresHeadersSummary';
const fnStart = content.indexOf(fnKey, second);
if (fnStart === -1) fail('두 번째 복사본에 getFailuresHeadersSummary 없음');
const brace = content.indexOf('{', fnStart);
let open = 0, fnEnd = -1;
for (let i = brace; i < content.length; i++) {
  if (content[i] === '{') open++;
  else if (content[i] === '}') { open--; if (open === 0) { fnEnd = i + 1; break; } }
}
if (fnEnd === -1) fail('brace 매칭 실패');

// 3) 두 복사본 자구 동일 확인 (뒤쪽 공백 무시)
const copy1 = content.slice(first, second).replace(/\s+$/, '');
const copy2 = content.slice(second, fnEnd).replace(/\s+$/, '');
if (!copy1.endsWith('}')) fail('첫 복사본 끝이 } 아님');
if (!copy2.endsWith('}')) fail('두 번째 복사본 끝이 } 아님');
if (copy1 !== copy2) fail('두 복사본 자구 불일치 (수동 확인 필요)');

// 4) 삭제 뒤에 원래 앵커가 오는지 확인
const after = content.slice(fnEnd);
if (!/^\s*\nfunction extractRelevantHtmlSnippet\(html, queryText\) \{/.test(after)) fail('복사본 뒤 앵커 아님 (수동 확인 필요)');

// 5) copy1 끝~copy2 끝 삭제 (앞쪽 코드 손대지 않음)
let boundary = second;
while (boundary > 0 && /\s/.test(content[boundary - 1])) boundary--;
const fixed = content.slice(0, boundary) + content.slice(fnEnd);
fs.writeFileSync(file, fixed, 'utf8');
console.log('PASS: 두 번째 복사본 삭제 (첫 번째 유지, 앞쪽 코드 무변경)');
