// TITLE: SESSION 분할2 검증 — 기동済 서버 대상 HTTP 검증
// 사용법: 1→2→3→4 적용 → 서버 재시작 → `node session_split2_verify.js`
// 서버가 http://localhost:3000 에서 켜져 있어야 함 (다르면 BASE_URL 환경변수로 지정)
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const http = require('http');

const BASE = process.env.BASE_URL || 'http://localhost:3000';
const SP = path.join(__dirname, 'session.md');

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
function readSess() { return fs.existsSync(SP) ? fs.readFileSync(SP, 'utf8') : ''; }

(async () => {
  try { execSync('node --check server.js', { encoding: 'utf8' }); pass('0. node --check server.js'); }
  catch (e) { fail('0. node --check 실패:\n' + e.message); }

  const sessionExisted = fs.existsSync(SP);

  // ---- 1. 상한 초과 시나리오 (직접 대량 기입 + POST 1건으로 발동) ----
  const bulkRoom = '__capbulk';
  const keepLines = [
    '# [유지] (2026-11-07) [진행]: 진행줄 보존 확인 → 다음',
    '# [유지] (2026-11-07) [대기]: 대기줄 보존 확인 → 다음'
  ];
  const bulk = ['## 방 ' + bulkRoom, ...keepLines];
  for (let i = 0; i < 400; i++) {
    bulk.push('# [작업' + i + '] (2026-11-07) [완료]: ' + 'C'.repeat(380) + ' → 끝' + i);
  }
  const prev = readSess();
  fs.writeFileSync(SP, prev + (prev && !prev.endsWith('\n') ? '\n' : '') + bulk.join('\n') + '\n', 'utf8');

  const r1 = await request('/api/session', 'POST', {
    roomId: bulkRoom, tag: '트리거', status: '완료', fact: '상한 발동용', next: '확인'
  });
  if (r1.status !== 200) fail('1. POST 실패 status=' + r1.status);
  if (!r1.body.archiveReview || !Array.isArray(r1.body.archiveReview.moved) || r1.body.archiveReview.moved.length === 0) {
    fail('1. archiveReview 동봉 없음 (상한 미발동 — calib 계수 확인 필요)');
  }
  pass('1. 상한 초과 → archiveReview 동봉 (' + r1.body.archiveReview.moved.length + '줄 이동)');
  const after = readSess();
  if (!after.includes('## 아카이브')) fail('1. ## 아카이브 구역 없음');
  if (!after.includes('# [유지] (2026-11-07) [진행]: 진행줄 보존 확인 → 다음')) fail('1. 진행 줄이 hot에서 사라짐');
  if (!after.includes('# [유지] (2026-11-07) [대기]: 대기줄 보존 확인 → 다음')) fail('1. 대기 줄이 hot에서 사라짐');
  const movedSample = r1.body.archiveReview.moved[0];
  if (!after.split('## 아카이브')[1].includes(movedSample)) fail('1. 옮긴 줄이 아카이브에 글자 그대로 없음');
  pass('1. 완료 이동 + 진행/대기 잔류 + 내용 보존 확인');

  // ---- 2. 평소 무동작 ----
  const r2 = await request('/api/session', 'POST', {
    roomId: '__quiet1', tag: '평상', status: '진행', fact: '조용한 기록', next: '계속'
  });
  if (r2.status !== 200 || r2.body.archiveReview) fail('2. 평상시 이동 발생 (오발동)');
  pass('2. 8000 이하 평소 무동작');

  // ---- 3. 방 삭제 시 섹션 보존 ----
  const delRoom = '__del1';
  await request('/api/session', 'POST', {
    roomId: delRoom, tag: '삭제예정', status: '완료', fact: '이 방은 지워짐', next: '없음'
  });
  const rdel = await request('/api/memory', 'DELETE', { roomId: delRoom });
  if (rdel.status !== 200) fail('3. 방 삭제 실패 status=' + rdel.status);
  const afterDel = readSess();
  if (!afterDel.includes('## 방 ' + delRoom)) fail('3. 삭제 방 섹션 소실 (보존 실패)');
  if (!afterDel.split('## 아카이브')[1].includes('## 방 ' + delRoom)) fail('3. 아카이브에 섹션 없음');
  pass('3. 방 삭제 → memory 정상 + 섹션 아카이브 통째 보존');

  // ---- 뒷정리: 테스트가 만든 것만 제거 ----
  try {
    let content = readSess();
    content = content.split('\n').filter(l =>
      !l.includes('__capbulk') && !l.includes('__quiet1') && !l.includes('__del1') &&
      !l.includes('# [작업') && !l.includes('# [유지] (2026-11-07)') &&
      !l.includes('# [트리거]') && !l.includes('# [평상시]') && !l.includes('# [평상]') &&
      !l.includes('# [삭제예정]') && !l.includes('이 방은 지워짐')
    ).join('\n');
    // 빈 아카이브 구역만 정리 (내용 있으면 헤더 유지)
    const archIdx = content.indexOf('## 아카이브');
    if (archIdx !== -1 && content.slice(archIdx + '## 아카이브'.length).trim() === '') {
      content = content.slice(0, archIdx).trimEnd() + '\n';
    }
    if (!sessionExisted) {
      if (content.trim() === '' || content.trim() === '# 세션 기록 (session.md)') fs.unlinkSync(SP);
      else fs.writeFileSync(SP, content, 'utf8');
    } else {
      fs.writeFileSync(SP, content, 'utf8');
    }
  } catch (e) { console.error('WARN 뒷정리 실패 (수동 확인): ' + e.message); }

  console.log('\nALL PASS: SESSION 분할2 완료 조건 전부 통과');
  process.exit(0);
})().catch(e => fail('HTTP 연결 실패 (서버가 켜져 있나? BASE_URL 확인): ' + e.message));
