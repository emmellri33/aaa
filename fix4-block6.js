// TITLE: 6. G2+G8 422 서명 기록 (G4 V3 배선)
const fs = require('fs');
let content = fs.readFileSync('server.js', 'utf8');

const search1 = `          if (count === 0) {`;
const replace1 = `          if (count === 0) {
            try { recordSecurityOrToolFailure("G2 원본 불일치 차단(422)", targetFile + " " + (i + 1) + "번째 조각 0회 매치", "search 재확인 후 재요청", generatePatchSignature(targetFile, ed.search)); } catch (e) {}`;
if (content.split(search1).length !== 2) {
  console.error('FAIL 6. G2+G8 422 서명 기록 (G4 V3 배선) anchor 1');
  process.exit(1);
}
content = content.replace(search1, replace1);

const search2 = `          if (count >= 2) {`;
const replace2 = `          if (count >= 2) {
            try { recordSecurityOrToolFailure("G2 다매치 차단(422)", targetFile + " " + (i + 1) + "번째 조각 " + count + "회 매치", "search 재확인 후 재요청", generatePatchSignature(targetFile, ed.search)); } catch (e) {}`;
if (content.split(search2).length !== 2) {
  console.error('FAIL 6. G2+G8 422 서명 기록 (G4 V3 배선) anchor 2');
  process.exit(1);
}
content = content.replace(search2, replace2);

const search3 = `          if (!checkRes.ok) {`;
const replace3 = `          if (!checkRes.ok) {
            try { recordSecurityOrToolFailure("G8 합본 문법 차단(422)", targetFile + " 합본 문법 오류", "search 재확인 후 재요청", generatePatchSignature(targetFile, rawEdits[0].search)); } catch (e) {}`;
if (content.split(search3).length !== 2) {
  console.error('FAIL 6. G2+G8 422 서명 기록 (G4 V3 배선) anchor 3');
  process.exit(1);
}
content = content.replace(search3, replace3);

fs.writeFileSync('server.js', content, 'utf8');
console.log('OK 6. G2+G8 422 서명 기록 (G4 V3 배선)');
