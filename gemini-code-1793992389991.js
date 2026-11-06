// TITLE: 2. blank.html 코딩 ON/OFF 토글 버튼 전환 (step2_blank_toggle.js)
const fs = require('fs');

const file = 'blank.html';
const content = fs.readFileSync(file, 'utf8');

const search = `    const complexBtn = document.createElement("button");
    complexBtn.className = "action-btn";
    complexBtn.id = "complexBtn";
    complexBtn.title = "파이프라인 실행 (도구＋패치)";
    complexBtn.innerText = "Complex";
    sendBtn.parentNode.insertBefore(complexBtn, sendBtn.nextSibling);
    complexBtn.onclick = () => handleSend(true);`;

const replace = `    let codingToggleState = "OFF";
    const complexBtn = document.createElement("button");
    complexBtn.className = "action-btn";
    complexBtn.id = "complexBtn";
    complexBtn.style.fontSize = "12px";
    complexBtn.style.padding = "0 8px";
    complexBtn.style.borderRadius = "8px";
    complexBtn.style.border = "1px solid #cbd5e1";
    complexBtn.title = "코딩 모드 토글 (기본 OFF, 켜면 라우팅 스킵 후 무조건 패치)";
    complexBtn.innerText = "💻 코딩 OFF";
    sendBtn.parentNode.insertBefore(complexBtn, sendBtn.nextSibling);
    complexBtn.onclick = () => {
      codingToggleState = (codingToggleState === "OFF") ? "ON" : "OFF";
      complexBtn.innerText = (codingToggleState === "ON") ? "💻 코딩 ON" : "💻 코딩 OFF";
      complexBtn.style.background = (codingToggleState === "ON") ? "#dbeafe" : "";
      complexBtn.style.borderColor = (codingToggleState === "ON") ? "#2563eb" : "#cbd5e1";
      complexBtn.style.color = (codingToggleState === "ON") ? "#1d4ed8" : "#64748b";
    };`;

if (content.split(search).length !== 2) {
  console.error('❌ step2_blank_toggle.js: 앵커 불일치 (fail-closed)');
  process.exit(1);
}

fs.writeFileSync(file, content.replace(search, replace), 'utf8');
console.log('✅ step2_blank_toggle.js 적용 완료');