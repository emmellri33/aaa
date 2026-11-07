// TITLE: SESSION 분할4 검증 — 기동済 서버 대상 HTTP + 정적 검증
// 사용법: 1→2→3→4 적용 → 서버 재시작 → `node session_split4_verify.js`
// 서버가 http://localhost:3000 에서 켜져 있어야 함 (다르면 BASE_URL 환경변수로 지정)
// mock 사용 없음 — 기록 API 직격 + 정적 대조 (실AI 호출 없음)
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const http = require('http');

const BASE = process.env.BASE_URL || 'http://localhost:3000';
const DIR = __dirname;
const SP = path.join(DIR, 'session.md');

function request(apiPath, method = 'GET', body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(apiPath, BASE);
    const payload = body ? JSON.stringify(body) : null;
    const req = http.request({
      hostname: url.hostname, port: url.port, path: url.pathname + url.search, method,
      headers: payload ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {}
    }, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, raw: data }); }
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function fail(m) { console.error('\nFAIL: ' + m); process.exit(1); }
function pass(m) { console.log('PASS: ' + m); }

(function staticChecks() {
  const srv = fs.readFileSync(path.join(DIR, 'server.js'), 'utf8');
  const blk = fs.readFileSync(path.join(DIR, 'blank.html'), 'utf8');

  // 2. blank 잔재 제거
  for (const s of ['handoffBtn', 'HANDOFF.md', '📋 요약 저장']) {
    if (blk.includes(s)) fail('2. blank.html 잔재 남아있음: ' + s);
  }
  if (!blk.includes('roomId: _roomKey()')) fail('2. verify/rollback roomId 전달 없음');
  pass('2. blank 최적화·HANDOFF·배너 잔재 제거 + roomId 전달');

  // 3. server 기록함수 + 훅 존재
  if (srv.split('function recordSessionEntry(').length !== 2) fail('3. recordSessionEntry 정의가 1개 아님');
  if (!srv.includes('recordSessionEntry(req.body)')) fail('3. POST /api/session thin 래퍼 없음');
  const hooks = ['마일스톤 [적용]', '마일스톤 [패치 수신]', '마일스톤 [검증 통과·실패]',
    '마일스톤 [검증 실패 후 롤백 복원]', '마일스톤 [사용자 결정]'];
  for (const h of hooks) {
    if (!srv.includes(h)) fail('3. 훅 누락: ' + h);
  }
  pass('3. recordSessionEntry 1정의 + 마일스톤 훅 5종 존재');

  // 4. 훅 변수 스코프 안전 (선언 근거 없으면 FAIL — ReferenceError 방지)
  const hookIdx = [];
  let p = 0;
  while ((p = srv.indexOf('// --- SESSION 분할4', p)) !== -1) { hookIdx.push(p); p++; }
  const problems = [];
  for (const hi of hookIdx) {
    const callStart = srv.indexOf('recordSessionEntry({', hi);
    if (callStart === -1 || callStart - hi > 600) continue; // 정의부 주석은 스킵
    const callEnd = srv.indexOf('});', callStart);
    const call = srv.slice(callStart, callEnd);
    const before = srv.slice(Math.max(0, hi - 4000), hi);
    const ids = new Set();
    for (const mm of call.matchAll(/\b(roomId|target|sessionRoomId|vRoomId|rbRoomId|_t|finalParsed|parsed|targetFile|model)\b/g)) {
      ids.add(mm[1]);
    }
    for (const id of ids) {
      const declared = new RegExp(
        '(const|let|var|function)\\s+[^;\\n]*\\b' + id + '\\b|\\b' + id + '\\s*[,}\\]=]',
        ''
      ).test(before.slice(-4000)) || new RegExp('\\b' + id + '\\s*=').test(call);
      if (!declared) problems.push(id + ' (위치 ' + hi + ')');
    }
  }
  if (problems.length) fail('4. 훅 변수 선언 근거 없음 (수동 확인): ' + problems.join(', '));
  pass('4. 훅 변수 스코프 선언 근거 확인');
})();

(async () => {
  try { execSync('node --check server.js', { encoding: 'utf8', cwd: DIR }); pass('0. node --check server.js'); }
  catch (e) { fail('0. node --check 실패:\n' + e.message); }

  // 1. 기록 API 동등성 (내부함수 리팩터 후에도 동일 동작)
  const r1 = await request('/api/session', 'POST', {
    roomId: '__v4a', tag: '검증4', status: '진행', fact: '내부함수동등성마커', next: '확인'
  });
  if (r1.status !== 200 || !r1.body.ok) fail('1. 기본 기록 실패 (status=' + r1.status + ')');
  if (!/\[fp:[a-f0-9]{8}\]$/.test(r1.body.line)) fail('1. 마일스톤 기본 fp 첨부 없음: ' + r1.body.line);
  const r2 = await request('/api/session', 'POST', {
    roomId: '__v4a', tag: '검증4', status: '대기', fact: '비마일스톤마커', next: '확인', milestone: false
  });
  if (r2.status !== 200 || /\[fp:/.test(r2.body.line)) fail('1. milestone:false인데 fp 첨부됨');
  const r3 = await request('/api/session', 'POST', { roomId: '../탈출', tag: 'x', status: '진행', fact: 'f', next: 'n' });
  if (r3.status !== 400) fail('1. 세탁 실패 (status=' + r3.status + ')');
  const r4 = await request('/api/session', 'POST', { roomId: '__v4a', status: '진행', fact: 'f', next: 'n' });
  if (r4.status !== 400) fail('1. tag 누락 검증 실패 (status=' + r4.status + ')');
  pass('1. 기록 API 동등성 (기본·fp·비마일스톤·세탁·문법게이트)');

  // ---- 뒷정리 ----
  try {
    if (fs.existsSync(SP)) {
      const kept = fs.readFileSync(SP, 'utf8').split('\n').filter(l =>
        !l.includes('__v4a') && !l.includes('내부함수동등성마커') && !l.includes('비마일스톤마커')
      ).join('\n');
      fs.writeFileSync(SP, kept, 'utf8');
    }
  } catch (e) { console.error('WARN 뒷정리 실패 (수동 확인): ' + e.message); }

  console.log('\nALL PASS: SESSION 분할4 완료 조건 전부 통과 (V0 회귀는 브라우저 수동 확인)');
  process.exit(0);
})().catch(e => fail('HTTP 연결 실패 (서버가 켜져 있나? BASE_URL 확인): ' + e.message));
