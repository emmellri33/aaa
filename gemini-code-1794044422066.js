// TITLE: 2. server.js OFF 라우터 파이프 정규화 및 쓰기동사 lite 경유 (step2_server_pipe.js)
const fs = require('fs');

const file = 'server.js';
let content = fs.readFileSync(file, 'utf8');

const search = `      const routeCheck = judgeThreeSlots(instruction, targetFile);

      if (!routeCheck.isExplicit) {
        console.log("ROUTER pipe: [묻기] 애매 건 감지 (빈칸 존재 또는 다중 매칭) -> 0토큰 question 반환");
        let questionText = "";
        let options = null;

        if (routeCheck.fileStatus === "ambiguous" && Array.isArray(routeCheck.matches) && routeCheck.matches.length > 0) {
          questionText = "[의도 확인] 여러 파일이 일치합니다. 어느 파일에서 작업할까요?";
          options = routeCheck.matches.slice(0, 4).map(f => ({
            label: f + " (후보 파일 매칭)",
            instruction: "target=" + f + " " + instruction
          }));
        } else {
          const missing = [];
          if (!routeCheck.slots.file) missing.push("파일");
          if (!routeCheck.slots.location) missing.push("위치");
          if (!routeCheck.slots.content) missing.push("내용");
          questionText = "[의도 확인] 파일·위치·내용 중 " + missing.join("·") + " 정보를 구체적으로 알려주세요.";
        }

        const askCard = {
          type: "question",
          question: questionText,
          options: options || undefined
        };
        return res.json({ ok: true, result: JSON.stringify(askCard), patch: askCard, toolRounds: 0 });
      }

      const writeVerbRegex = /(?:바꿔|고쳐|추가|삭제|만들|수정|적용|변경|교체|넣어|빼줘|지워|작성)/i;
      const readVerbRegex = /(?:뭐야|알려줘|설명|왜|어디|인가요|어떻게|조회|보여줘|확인해줘|찾아줘|이유)/i;

      const hasWrite = writeVerbRegex.test(instruction);
      const hasRead = readVerbRegex.test(instruction);

      if (!hasWrite && hasRead) {
        console.log("ROUTER pipe: [읽기] 조회 단서 감지 -> route: read 즉시 반환 (0토큰)");
        // TODO(소유분할): b-가벼움 부착 시 /api/chat 호출 인자 처리
        return res.json({ ok: true, route: "read", reason: "조회·질문 단서 감지" });
      } else if (!hasWrite && !hasRead) {
        // 미결정: 3칸 참 + 변경동사 없음 + 조회단서 없음 (!hasWrite && !hasRead)
        // (테스트 예문 선정 근거 주석: 3칸은 찼으나 동작 의도가 불분명한 경우를 미결정으로 분류)
        isUndecided = true;
        console.log("ROUTER pipe: [미결정] 규칙 미결정 입력 감지 (분류기 호출 예정)");
      } else {
        console.log("ROUTER pipe: [쓰기] 쓰기 의도 판정 -> EYES 파이프라인 진행");
        appliedBPack = BPACK_PATCH;
        routerDecisionLog = "모드: 패치 (라우터: 패치, 신뢰도 높음)";
      }`;

const replace = `      const routeCheck = judgeThreeSlots(instruction, targetFile);
      const writeVerbRegex = /(?:바꿔|고쳐|추가|삭제|만들|수정|적용|변경|교체|넣어|빼줘|지워|작성)/i;
      const readVerbRegex = /(?:뭐야|알려줘|설명|왜|어디|인가요|어떻게|조회|보여줘|확인해줘|찾아줘|이유)/i;

      const hasWrite = writeVerbRegex.test(instruction);
      const hasRead = readVerbRegex.test(instruction);

      if (!routeCheck.isExplicit) {
        // 일상 인사·단순 대화(위치·내용 빈칸이면서 수정/지시성 단서가 전혀 없는 경우)는 읽기 파이프(chat)로 직행
        const vagueWorkCue = /(?:거기|여기|저기|이거|그거|색|크기|글자|폰트|배경|화면|안\\s*돼|이상해|다시|제목|버튼|줄|행|태그|코드|파일|페이지|스타일|레이아웃)/i;
        if (routeCheck.fileStatus !== "ambiguous" && !routeCheck.slots.location && !routeCheck.slots.content && !hasWrite && !vagueWorkCue.test(signalText)) {
          console.log("ROUTER pipe: [읽기] 일상 대화 감지 -> route: read 즉시 반환 (0토큰)");
          return res.json({ ok: true, route: "read", reason: "일상 대화 감지" });
        }

        console.log("ROUTER pipe: [묻기] 애매 건 감지 (빈칸 존재 또는 다중 매칭) -> 0토큰 question 반환");
        let questionText = "";
        let options = null;

        if (routeCheck.fileStatus === "ambiguous" && Array.isArray(routeCheck.matches) && routeCheck.matches.length > 0) {
          questionText = "[의도 확인] 여러 파일이 일치합니다. 어느 파일에서 작업할까요?";
          options = routeCheck.matches.slice(0, 4).map(f => ({
            label: f + " (후보 파일 매칭)",
            instruction: "target=" + f + " " + instruction
          }));
        } else {
          const missing = [];
          if (!routeCheck.slots.file) missing.push("파일");
          if (!routeCheck.slots.location) missing.push("위치");
          if (!routeCheck.slots.content) missing.push("내용");
          questionText = "[의도 확인] 파일·위치·내용 중 " + missing.join("·") + " 정보를 구체적으로 알려주세요.";
        }

        const askCard = {
          type: "question",
          question: questionText,
          options: options || undefined
        };
        return res.json({ ok: true, result: JSON.stringify(askCard), patch: askCard, toolRounds: 0 });
      }

      if (!hasWrite && hasRead) {
        console.log("ROUTER pipe: [읽기] 조회 단서 감지 -> route: read 즉시 반환 (0토큰)");
        // TODO(소유분할): b-가벼움 부착 시 /api/chat 호출 인자 처리
        return res.json({ ok: true, route: "read", reason: "조회·질문 단서 감지" });
      } else {
        // G2: OFF 상태에서 미결정(!hasWrite && !hasRead)이거나 쓰기동사(hasWrite)가 있으면 모두 lite 의미 분류 경유 (OFF 패치 직행 금지)
        isUndecided = true;
        console.log("ROUTER pipe: [OFF->lite] 쓰기 신호 또는 미결정 감지 -> lite 의미 분류 호출 예정");
      }`;

if (content.split(search).length !== 2) {
  console.error('❌ step2_server_pipe.js: 앵커 불일치 (fail-closed)');
  process.exit(1);
}

fs.writeFileSync(file, content.replace(search, replace), 'utf8');
console.log('✅ step2_server_pipe.js 완료');