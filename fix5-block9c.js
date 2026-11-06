// TITLE: 9c. C2 룸폴백+콕핏target 검사 (server.js)
const fs = require('fs');
let content = fs.readFileSync('server.js', 'utf8');

const search1 = `      const stashKey = rKey + ":" + filename;
      const initialHash = c2stash.get(stashKey);`;
const replace1 = `      const stashKey = rKey + ":" + filename;
      let initialHash = c2stash.get(stashKey);
      if (initialHash === undefined) { for (const _kv of c2stash) { if (typeof _kv[0] === "string" && _kv[0].endsWith(":" + filename)) { initialHash = _kv[1]; break; } } }`;
if (content.split(search1).length !== 2) {
  console.error('FAIL 9c');
  process.exit(1);
}
content = content.replace(search1, replace1);

const search2 = `    const stashKey = rKey + ":" + target;
    const initialHash = c2stash.get(stashKey);`;
const replace2 = `    const stashKey = rKey + ":" + target;
    let initialHash = c2stash.get(stashKey);
    if (initialHash === undefined) { for (const _kv of c2stash) { if (typeof _kv[0] === "string" && _kv[0].endsWith(":" + target)) { initialHash = _kv[1]; break; } } }`;
if (content.split(search2).length !== 2) {
  console.error('FAIL 9c');
  process.exit(1);
}
content = content.replace(search2, replace2);

const search3 = `app.post('/api/cockpit/target', (req, res) => {
  try {
    const { file, content } = req.body || {};
    if (file !== "blank.html" && file !== "cockpit.html") {
      return res.status(403).json({ ok: false, error: "격리 라우트에서는 blank.html과 cockpit.html만 수정 가능합니다." });
    }`;
const replace3 = `app.post('/api/cockpit/target', (req, res) => {
  try {
    const { file, content, confirmed, roomId } = req.body || {};
    if (file !== "blank.html" && file !== "cockpit.html") {
      return res.status(403).json({ ok: false, error: "격리 라우트에서는 blank.html과 cockpit.html만 수정 가능합니다." });
    if (!confirmed) {
      const _rk = (roomId && String(roomId).trim()) || "global";
      let _ih = c2stash.get(_rk + ":" + file);
      if (_ih === undefined) { for (const _q of c2stash) { if (typeof _q[0] === "string" && _q[0].endsWith(":" + file)) { _ih = _q[1]; break; } } }
      if (_ih !== undefined && _ih !== getDiskFileHash(file)) {
        return res.status(409).json({ ok: false, error: "conflict(409): 요청 이후 파일이 변경되었습니다. 변경 내용을 확인 후 덮어쓰려면 확인을 눌러주세요.", dirty: true });
      }
    }
    }`;
if (content.split(search3).length !== 2) {
  console.error('FAIL 9c');
  process.exit(1);
}
content = content.replace(search3, replace3);

fs.writeFileSync('server.js', content, 'utf8');
console.log('OK 9c');
