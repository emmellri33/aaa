// TITLE: 9b. 콕핏 저장 409 대응 (cockpit.html)
const fs = require('fs');
let content = fs.readFileSync('cockpit.html', 'utf8');

const search = `        const r = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body)
        });
        const d = await r.json();
        if (d.ok) {
          editorOriginal = content;
          editorDirty = false;
          refreshDirtyState();
          alert(\`✅ \${currentSelectedFile} 저장 완료 (스냅샷 생성됨)\`);
        } else {
          alert(\`❌ 저장 실패: \` + (d.error || "알 수 없는 오류"));
        }`;
const replace = `        let r = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body)
        });
        let d = await r.json();
        if (r.status === 409 && d && d.dirty) {
          if (confirm("요청 이후 파일이 변경되었습니다. 현재 편집 내용으로 덮어쓰시겠습니까?")) {
            body.confirmed = true;
            const r2 = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
            const d2 = await r2.json();
            r = r2; d = d2;
          }
        }
        if (d.ok) {
          editorOriginal = content;
          editorDirty = false;
          refreshDirtyState();
          alert(\`✅ \${currentSelectedFile} 저장 완료 (스냅샷 생성됨)\`);
        } else {
          alert(\`❌ 저장 실패: \` + (d.error || "알 수 없는 오류"));
        }`;
if (content.split(search).length !== 2) {
  console.error('FAIL 9b. 콕핏 저장 409 대응 (cockpit.html)');
  process.exit(1);
}
content = content.replace(search, replace);

fs.writeFileSync('cockpit.html', content, 'utf8');
console.log('OK 9b. 콕핏 저장 409 대응 (cockpit.html)');
