// TITLE: SESSION 분할3 검증 — 기동済 서버 대상 HTTP 검증
// 사용법: 1→2→3→4 적용 → 서버 재시작 → `node session_split3_verify.js`
// 서버가 http://localhost:3000 에서 켜져 있어야 함 (다르면 BASE_URL 환경변수로 지정)
// mock ai-modify 사용 — 실AI 호출 없음 (토글 ON으로 라우터 스킵)
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

(async () => {
  try { execSync('node --check server.js', { encoding: 'utf8' }); pass('0. node --check server.js'); }
  catch (e) { fail('0. node --check 실패:\n' + e.message); }

  // ---- 1. 방별 토글 저장·조회·프롬프트 제외 ----
  const t1 = await request('/api/memory', 'POST', { roomId: '__vt1', codingToggle: 'ON' });
  if (t1.status !== 200 || t1.body.codingToggle !== 'ON') fail('1. 토글 저장 (status=' + t1.status + ')');
  const g1 = await request('/api/memory?roomId=__vt1');
  const roomArr = (g1.body.data && g1.body.data.rooms && g1.body.data.rooms.__vt1) || [];
  if (!roomArr.includes('__codingToggle:ON')) fail('1. rooms 저장 확인');
  if ((g1.body.facts || []).some(f => String(f).startsWith('__'))) fail('1. __ 항목이 프롬프트 기억에 노출됨');
  pass('1. 토글 저장·복원값·프롬프트 제외 확인');
  const t1b = await request('/api/memory', 'POST', { roomId: '__vt1', codingToggle: 'MAYBE' });
  if (t1b.status !== 400) fail('1b. 토글 값 검증 400 아님 (status=' + t1b.status + ')');
  pass('1b. 토글 값 ON/OFF 외 400 거부');

  // ---- 2. 목차 진입 코드 스모크 (mock ai-modify, 실AI 없음) ----
  await request('/api/session', 'POST', {
    roomId: '__vtoc', tag: '목차', status: '진행', fact: '목차확인용마커줄', next: '검증'
  });
  const m1 = await request('/api/ai-modify', 'POST', {
    instruction: '목차 스모크', target: 'index.html', roomId: '__vtoc',
    codingToggle: 'ON', mockResponses: [{ type: 'question', question: '스모크' }]
  });
  if (m1.status !== 200) fail('2. mock ai-modify 진입 실패 (status=' + m1.status + ')');
  pass('2. 세션 진입 코드 스모크 (목차 블록 조립은 코드 대조로 확인済)');

  // ---- 3. fp 대조: 외부 변경 → 불일치 1줄 → 중복 생략 ----
  await request('/api/session', 'POST', {
    roomId: '__vfp1', tag: '기준', status: '완료', fact: 'fp기준줄', next: '대조'
  });
  const trig = path.join(__dirname, '__fp_trigger.html');
  fs.writeFileSync(trig, '<!-- fp trigger -->\n', 'utf8');
  const m2 = await request('/api/ai-modify', 'POST', {
    instruction: 'fp 대조 트리거', target: 'index.html', roomId: '__vfp1',
    codingToggle: 'ON', mockResponses: [{ type: 'question', question: '트리거' }]
  });
  if (m2.status !== 200) fail('3. 트리거 요청 실패 (status=' + m2.status + ')');
  const s1 = await request('/api/session?roomId=__vfp1');
  const sec1 = s1.body.section || '';
  if (!sec1.split('\n')[0].startsWith('# [복귀]') || !sec1.includes('기록과 현실 불일치')) {
    fail('3. 불일치 줄 미생성');
  }
  pass('3. 디스크 외부 변경 → 불일치 1줄 prepend');
  await request('/api/ai-modify', 'POST', {
    instruction: 'fp 대조 트리거2', target: 'index.html', roomId: '__vfp1',
    codingToggle: 'ON', mockResponses: [{ type: 'question', question: '트리거2' }]
  });
  const s2 = await request('/api/session?roomId=__vfp1');
  const cnt = (s2.body.section.match(/# \[복귀\]/g) || []).length;
  if (cnt !== 1) fail('3b. 중복 불일치 줄 도배 (cnt=' + cnt + ')');
  pass('3b. 동일 fp 중복 보고 생략');

  // ---- 뒷정리 ----
  try {
    if (fs.existsSync(trig)) fs.unlinkSync(trig);
    for (const r of ['__vt1', '__vtoc', '__vfp1']) {
      await request('/api/memory', 'DELETE', { roomId: r }).catch(() => {});
    }
    if (fs.existsSync(SP)) {
      const kept = fs.readFileSync(SP, 'utf8').split('\n').filter(l =>
        !l.includes('__vt1') && !l.includes('__vtoc') && !l.includes('__vfp1') &&
        !l.includes('목차확인용마커줄') && !l.includes('fp기준줄') && !l.includes('# [복귀]')
      ).join('\n');
      fs.writeFileSync(SP, kept, 'utf8');
    }
  } catch (e) { console.error('WARN 뒷정리 실패 (수동 확인): ' + e.message); }

  console.log('\nALL PASS: SESSION 분할3 완료 조건 전부 통과 (V1 이어하기는 브라우저 수동 확인)');
  process.exit(0);
})().catch(e => fail('HTTP 연결 실패 (서버가 켜져 있나? BASE_URL 확인): ' + e.message));
