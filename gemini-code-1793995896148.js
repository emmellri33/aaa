// TITLE: 1. lite 미니 프롬프트 상수 신설 (step1_prompt.js)
const fs = require('fs');

const file = 'server.js';
let content = fs.readFileSync(file, 'utf8');

const search = `const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite';
const INDEX_PATH = path.join(__dirname, 'index.html');`;

const replace = `const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite';

// --- ROUTER 분할3: 4단계 lite 분류 미니 프롬프트 ---
const ROUTER_LITE_PROMPT = \`요청 1개를 다음 3개 중 하나로 분류하세요. JSON 1줄만 출력.
(토글 OFF일 때만 호출. ON이면 라우터 통째로 OFF.)
- 가벼움: 코드 변경 없음 (인사·설명·"안녕", "이게 뭐야")
- 패치: 코드 필요 (바꿀 대상 확정 "바꿔줘"+대상, 또는 읽기 전용 "이 구조로 구현 가능해?")
- 질문: 뭘 바꿀지 불확정 (파일·위치·내용 중 2개 이상 빈칸, "거기", "다시 해줘")
애매하면 질문 (되물음이 오발 패치보다 쌈). 출력: {"r":"가벼움|패치|질문","why":"어느 칸이 비어서/차서","conf":"high|low"}\`;

const INDEX_PATH = path.join(__dirname, 'index.html');`;

if (content.split(search).length !== 2) {
  console.error('❌ 블록 1 앵커 불일치 (fail-closed)');
  process.exit(1);
}

fs.writeFileSync(file, content.replace(search, replace), 'utf8');
console.log('✅ 블록 1: lite 프롬프트 추가 완료');