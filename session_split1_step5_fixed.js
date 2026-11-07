// TITLE: SESSION 분할1 검증 (step5_fixed) — 기동済 서버 대상 HTTP 검증
// 사용법: 1~4장 적용 → 서버 재시작 → `node session_split1_step5_fixed.js`
// 서버가 http://localhost:3000 에서 켜져 있어야 함 (다르면 BASE_URL 환경변수로 지정)
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const http = require('http');

const BASE = process.env.BASE_URL || 'http://localhost:3000';
const TEST_ROOM = '__vtest1';

function request(apiPath, method = 'GET', body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(apiPath, BASE);
    const payload = body ? JSON.stringify(body) : null;
    const req = http.request({
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method,
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

function fail(msg) { console.error('\nFAIL: ' + msg); process.exit(1); }
function pass(msg) { console.log('PASS: ' + msg); }

(async () => {
  // 0. node --check
  try {
    execSync('node --check server.js', { encoding: 'utf8' });
    pass('0. node --check server.js');
  } catch (e) { fail('0. node --check 실패:\n' + e.message); }

  // 사전 상태 기록 (테스트가 만든 것만 지우기 위해)
  const sessionExisted = fs.existsSync(path.join(__dirname, 'session.md'));
  const detailExisted = fs.existsSync(path.join(__dirname, 'session-detail'));
  const createdDetailFiles = [];

  // 1. GET 빈 섹션 자동 생성
  const r1 = await request('/api/session?roomId=' + TEST_ROOM);
  if (r1.status !== 200 || !r1.body || r1.body.ok !== true) fail('1. GET 빈 섹션 (status=' + r1.status + ')');
  pass('1. GET /api/session?roomId 빈 섹션 자동 생성');

  // 2. POST 정상 1건
  const r2 = await request('/api/session', 'POST', {
    roomId: TEST_ROOM, tag: '라우터', status: '완료',
    fact: 'index.html 타이틀 수정', next: '검증 진행'
  });
  if (r2.status !== 200 || !r2.body || r2.body.ok !== true || !r2.body.line) fail('2. POST 정상 1건');
  if (!/^# \[라우터\] \(\d{4}-\d{2}-\d{2}\) \[완료\]: .+ → .+/.test(r2.body.line)) fail('2. 줄 문법 불일치: ' + r2.body.line);
  pass('2. POST 정상 1줄 prepend: ' + r2.body.line);

  // 3. 줄 문법 위반 → 400
  const r3 = await request('/api/session', 'POST', {
    roomId: TEST_ROOM, tag: '라우터', status: '실패', fact: '잘못된 상태', next: '중단'
  });
  if (r3.status !== 400) fail('3. 줄 문법 위반 400 아님 (status=' + r3.status + ')');
  pass('3. 줄 문법 위반 400 거부');

  // 4. roomId 세탁 → 400
  const r4 = await request('/api/session', 'POST', {
    roomId: '../hack#room', tag: '보안', status: '진행', fact: '공격 시도', next: '방어'
  });
  if (r4.status !== 400) fail('4. 세탁 위반 400 아님 (status=' + r4.status + ')');
  pass('4. roomId 세탁 위반 400 거부');

  // 5. 동일 줄 2회 → 경고
  const r5 = await request('/api/session', 'POST', {
    roomId: TEST_ROOM, tag: '라우터', status: '완료',
    fact: 'index.html 타이틀 수정', next: '검증 진행'
  });
  if (r5.status !== 200 || !r5.body || !r5.body.warning) fail('5. 완전중복 경고 없음');
  pass('5. 동일 줄 완전중복 경고: ' + r5.body.warning);

  // 6. 200자 초과 → session-detail 분리
  const r6 = await request('/api/session', 'POST', {
    roomId: TEST_ROOM, tag: '상세테스트', status: '진행',
    fact: 'A'.repeat(250), next: '다음 단계'
  });
  if (r6.status !== 200 || !r6.body || !r6.body.detailFile) fail('6. detailFile 없음');
  if (!r6.body.line.includes(r6.body.detailFile)) fail('6. 줄에 포인터 없음');
  if (!fs.existsSync(path.join(__dirname, r6.body.detailFile))) fail('6. 분리 파일 디스크 없음');
  createdDetailFiles.push(r6.body.detailFile);
  pass('6. 200자 초과 분리: ' + r6.body.detailFile);

  // 7. 파일 목록 제외
  const r7 = await request('/api/files');
  const names = ((r7.body && r7.body.files) || []).map(f => f.name);
  if (names.includes('session.md') || names.includes('session-detail')) fail('7. 목록에 노출됨');
  pass('7. session.md·session-detail 목록 제외');

  // 뒷정리: 테스트가 만든 것만 제거
  try {
    for (const f of createdDetailFiles) fs.unlinkSync(path.join(__dirname, f));
    const sp = path.join(__dirname, 'session.md');
    if (fs.existsSync(sp)) {
      const lines = fs.readFileSync(sp, 'utf8').split('\n');
      const kept = [];
      let inTest = false;
      for (const l of lines) {
        if (l === '## 방 ' + TEST_ROOM) { inTest = true; continue; }
        if (inTest && l.startsWith('## 방 ')) { inTest = false; }
        if (!inTest) kept.push(l);
      }
      if (!sessionExisted) fs.unlinkSync(sp);
      else fs.writeFileSync(sp, kept.join('\n'), 'utf8');
    }
    const dd = path.join(__dirname, 'session-detail');
    if (!detailExisted && fs.existsSync(dd) && fs.readdirSync(dd).length === 0) fs.rmdirSync(dd);
  } catch (e) { console.error('WARN 뒷정리 실패 (수동 확인): ' + e.message); }

  console.log('\nALL PASS: SESSION 분할1 완료 조건 전부 통과');
  process.exit(0);
})().catch(e => fail('HTTP 연결 실패 (서버가 켜져 있나? BASE_URL 확인): ' + e.message));
