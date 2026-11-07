// TITLE: 3. server.js POST /api/session 상한 헬퍼 연동 및 archiveReview 동봉 (step3_session_api_cap.js)
const fs = require('fs');

const file = 'server.js';
let content = fs.readFileSync(file, 'utf8');

const search = `    } else {
      lines.unshift(newLine);
    }
    return '\\n' + lines.join('\\n') + '\\n';
  });

  res.json({
    ok: true,
    line: newLine,
    ...(warning ? { warning } : {}),
    ...(detailFile ? { detailFile } : {})
  });
});`;

const replace = `    } else {
      lines.unshift(newLine);
    }
    return '\\n' + lines.join('\\n') + '\\n';
  });

  // --- SESSION 분할2: 저장 직후 상한 검사 및 아카이브 자동 이동 ---
  let archiveReview = null;
  try {
    let postContent = readSessionFile();
    const capRes = processSessionCap(postContent);
    if (capRes.archiveReview) {
      fs.writeFileSync(SESSION_PATH, capRes.newContent, 'utf8');
      archiveReview = capRes.archiveReview;
      console.log(\`SESSION pipe: 상한 초과 방어 (\${archiveReview.moved.length}개 완료 줄 아카이브 이동)\`);
    }
  } catch (capErr) {
    console.error("SESSION pipe: 상한 헬퍼 실행 오류", capErr.message);
  }

  res.json({
    ok: true,
    line: newLine,
    ...(warning ? { warning } : {}),
    ...(detailFile ? { detailFile } : {}),
    ...(archiveReview ? { archiveReview } : {})
  });
});`;

if (content.split(search).length !== 2) {
  console.error('❌ step3_session_api_cap.js: 앵커 불일치 (fail-closed)');
  process.exit(1);
}

fs.writeFileSync(file, content.replace(search, replace), 'utf8');
console.log('✅ step3_session_api_cap.js 완료');