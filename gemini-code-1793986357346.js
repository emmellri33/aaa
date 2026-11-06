// TITLE: 6. blank.html dirtyBadge UI 표시 및 적용 시 409 confirmed 재시도 (blank.html)
const fs = require('fs');
let content = fs.readFileSync('blank.html', 'utf8');

const search = `        <div style="font-weight:700; margin-bottom:6px; display:flex; align-items:center; gap:8px; flex-wrap:wrap;"><span>🛠️ 패치 제안 (\${escapeHtml(patch.target ||"index.html")} · 총 \${edits.length}조각)</span>\${patch.toolRounds ? \`<span style="background:#dbeafe; color:#1d4ed8; font-size:11px; padding:2px 8px; border-radius:999px; font-weight:700;">🔍 도구 \${patch.toolRounds}회</span>\` : ""}</div>`;

const replace = `        <div style="font-weight:700; margin-bottom:6px; display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
          <span>🛠️ 패치 제안 (\${escapeHtml(patch.target ||"index.html")} · 총 \${edits.length}조각)</span>
          \${patch.toolRounds ? \`<span style="background:#dbeafe; color:#1d4ed8; font-size:11px; padding:2px 8px; border-radius:999px; font-weight:700;">🔍 도구 \${patch.toolRounds}회</span>\` : ""}
          \${patch.dirtyBadge ? \`<span style="background:#fef2f2; color:#dc2626; border:1px solid #fecaca; font-size:11px; padding:2px 8px; border-radius:999px; font-weight:700;">⚠️ \${escapeHtml(patch.dirtyBadge)}</span>\` : ""}
        </div>`;

if (content.split(search).length !== 2) {
  console.error('❌ 앵커 불일치');
  process.exit(1);
}
fs.writeFileSync('blank.html', content.replace(search, replace), 'utf8');
console.log('✅ 블록 6 적용 완료');