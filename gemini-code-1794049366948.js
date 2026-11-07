// TITLE: 4. server.js 방 삭제 시 해당 세션 기록 아카이브 보존 훅 (step4_delete_room_preserve.js)
const fs = require('fs');

const file = 'server.js';
let content = fs.readFileSync(file, 'utf8');

const search = `    } else if (roomId && roomId !== "global") {
      delete data.rooms[roomId];
    } else {
      data.global = [];
    }`;

const replace = `    } else if (roomId && roomId !== "global") {
      delete data.rooms[roomId];

      // --- SESSION 분할2: 방 삭제 시 해당 방 세션 기록 아카이브 보존 훅 ---
      try {
        const cleanRoomId = sanitizeSessionRoomId(roomId);
        if (cleanRoomId) {
          let fullContent = readSessionFile();
          const targetHeader = \`## 방 \${cleanRoomId}\`;
          if (fullContent.includes(targetHeader)) {
            const secBody = getRoomSection(fullContent, cleanRoomId);
            
            // 본문에서 방 섹션 전체 삭제
            let headerIdx = fullContent.indexOf(targetHeader);
            let nextSecIdx = fullContent.indexOf('\\n## 방 ', headerIdx + targetHeader.length);
            let before = fullContent.slice(0, headerIdx);
            let after = nextSecIdx === -1 ? '' : fullContent.slice(nextSecIdx);
            
            let modContent = (before.trimEnd() + '\\n\\n' + after.trimStart()).trim();

            // 아카이브 구역에 보존 (삭제 방 섹션 통째로 편입)
            const archiveHeader = '## 아카이브';
            if (!modContent.includes(archiveHeader)) {
              modContent += '\\n\\n' + archiveHeader + '\\n';
            }
            
            let archIdx = modContent.indexOf(archiveHeader);
            let hotSec = modContent.slice(0, archIdx);
            let archSec = modContent.slice(archIdx);
            
            const preservedSection = \`\\n\${targetHeader} (삭제됨)\\n\${secBody}\\n\`;
            archSec = archiveHeader + '\\n' + preservedSection + archSec.slice(archiveHeader.length).trimStart();
            
            fs.writeFileSync(SESSION_PATH, hotSec.trimEnd() + '\\n\\n' + archSec, 'utf8');
            console.log(\`SESSION pipe: 삭제된 방(\${cleanRoomId}) 세션 아카이브로 보존 완료\`);
          }
        }
      } catch (preserveErr) {
        console.error("SESSION pipe: 방 보존 훅 실패", preserveErr.message);
      }
      
    } else {
      data.global = [];
    }`;

if (content.split(search).length !== 2) {
  console.error('❌ step4_delete_room_preserve.js: 앵커 불일치 (fail-closed)');
  process.exit(1);
}

fs.writeFileSync(file, content.replace(search, replace), 'utf8');
console.log('✅ step4_delete_room_preserve.js 완료');