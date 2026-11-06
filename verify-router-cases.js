// TITLE: verify-router-cases.js (골든셋 검증기)
const fs = require('fs');
const path = require('path');
const os = require('os');

const serverSrc = fs.readFileSync('server.js', 'utf8');

function extractFunc(src, fnName) {
  const start = src.indexOf('function ' + fnName);
  if (start === -1) throw new Error(fnName + ' 함수를 찾을 수 없습니다.');
  let open = 0, end = -1;
  for (let i = start; i < src.length; i++) {
    if (src[i] === '{') open++;
    else if (src[i] === '}') {
      open--;
      if (open === 0) { end = i + 1; break; }
    }
  }
  return src.slice(start, end);
}

// server.js의 실제 함수 로드
const isForbiddenFileName = new Function('return ' + extractFunc(serverSrc, 'isForbiddenFileName'))();
const rawResolve = extractFunc(serverSrc, 'resolveTargetFileName');
const rawJudge = extractFunc(serverSrc, 'judgeThreeSlots');

// os.tmpdir()에 격리된 테스트 환경 구성
const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'router-test-'));

// 명확 테스트용 파일
fs.writeFileSync(path.join(testDir, '1111.html'), '<html>1111</html>', 'utf8');
fs.writeFileSync(path.join(testDir, 'my-page.html'), '<html>mypage</html>', 'utf8');

// 묻기(다중 후보) 테스트용 파일 3개
fs.writeFileSync(path.join(testDir, 'fix-alpha.html'), '<html>alpha</html>', 'utf8');
fs.writeFileSync(path.join(testDir, 'fix-beta.html'), '<html>beta</html>', 'utf8');
fs.writeFileSync(path.join(testDir, 'fix-gamma.html'), '<html>gamma</html>', 'utf8');

const resolveTargetFileName = new Function('isForbiddenFileName', 'fs', 'path', '__dirname', 'return ' + rawResolve)(
  isForbiddenFileName,
  fs,
  path,
  testDir
);

const judgeThreeSlots = new Function('resolveTargetFileName', 'return ' + rawJudge)(resolveTargetFileName);

const testCases = [
  // 명확 (위치 발췌 경로)
  { input: "target=1111.html 4행 title을 빈페이지로", targetOverride: null, expected: "명확" },
  { input: "Complex target=my-page 버튼 빨강으로", targetOverride: null, expected: "명확" },
  { input: "target=1111 4행 title을 빈페이지로", targetOverride: null, expected: "명확" },
  // 애매 (목록 경로)
  { input: "제목 바꿔줘", targetOverride: null, expected: "애매" },
  { input: "다시 해줘", targetOverride: null, expected: "애매" },
  { input: "거기 색만 바꿔", targetOverride: null, expected: "애매" },
  { input: "안 돼", targetOverride: null, expected: "애매" },
  { input: "이거 왜 안 돼?", targetOverride: null, expected: "애매" },
  // 묻기 (파일 3곳 후보 다중 일치 케이스 실제 실행)
  { input: "target=fix 이거 고쳐줘", targetOverride: null, expected: "묻기" }
];

let passed = 0;
testCases.forEach((tc, idx) => {
  const res = judgeThreeSlots(tc.input, tc.targetOverride);
  let actual = "애매";
  if (res.isExplicit) {
    actual = "명확";
  } else if (res.fileStatus === "ambiguous") {
    actual = "묻기";
  }

  const ok = (actual === tc.expected);
  if (ok) passed++;
  console.log(`[${ok ? "PASS" : "FAIL"}] 예문 ${idx + 1}: "${tc.input}" -> 기대: ${tc.expected}, 실제: ${actual}`);
});

// os.tmpdir() 임시 디렉터리 정리
fs.rmSync(testDir, { recursive: true, force: true });

console.log(`\n골든셋 검증 결과: ${passed}/${testCases.length} 통과`);
if (passed !== testCases.length) {
  process.exit(1);
}
