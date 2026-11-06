// TITLE: 7. blank.html 패치 적용 시 409 대응 및 confirmed 재호출 (blank.html)
const fs = require('fs');
let content = fs.readFileSync('blank.html', 'utf8');

const search = `        const r = await fetch(__patchSaveUrl(typeof patch !== "undefined" ? patch : null), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: working })
        });
        const resData = await r.json();`;

const replace = `        let savePayload = { content: working, roomId: _roomKey() };
        let r = await fetch(__patchSaveUrl(typeof patch !== "undefined" ? patch : null), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(savePayload)
        });
        let resData = await r.json();

        // C2: 409 충돌 발생 시 사용자 확인 후 confirmed: true 재전송
        if (r.status === 409 && resData.dirty) {
          const proceed = confirm("⚠️ 요청 이후 대상 파일이 직접 수정되었습니다. 현재 패치 내용으로 덮어쓰시겠습니까?");
          if (proceed) {
            savePayload.confirmed = true;
            r = await fetch(__patchSaveUrl(typeof patch !== "undefined" ? patch : null), {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(savePayload)
            });
            resData = await r.json();
          } else {
            disarmConfirm();
            statusSpan.style.color = "#dc2626";
            statusSpan.innerText = "❌ 적용 취소됨 (파일 변경 감지)";
            return;
          }
        }`;

if (content.split(search).length !== 2) {
  console.error('❌ 앵커 불일치');
  process.exit(1);
}
fs.writeFileSync('blank.html', content.replace(search, replace), 'utf8');
console.log('✅ 블록 7 적용 완료');