// TITLE: 3a. 3관 분기 확장 및 isUndecided 플래그 설정 (step3a_lite_flag.js)
const fs = require('fs');

const file = 'server.js';
let content = fs.readFileSync(file, 'utf8');

const search = `    // --- ROUTER 분할2: 2단계 3관(읽기·쓰기·묻기) 분기 ---
    const codingToggle = (req.body && req.body.codingToggle === "ON") ? "ON" : "OFF";
    if (codingToggle === "ON") {
      console.log("ROUTER pipe: [쓰기] 코딩 토글 ON (라우팅 스킵, 패치 파이프 직행)");
    } else {
      const routeCheck = judgeThreeSlots(instruction, targetFile);

      if (!routeCheck.isExplicit) {
        // 묻기 관: 빈칸 있음(애매) -> ReAct 미진입, 즉시 question 반환 (0토큰)
        console.log("ROUTER pipe: [묻기] 애매 건 감지 (빈칸 존재 또는 다중 매칭) -> 0토큰 question 반환");
        let questionText = "";
        let options = null;

        if (routeCheck.fileStatus === "ambiguous" && Array.isArray(routeCheck.matches) && routeCheck.matches.length > 0) {
          questionText = "[의도 확인] 여러 파일이 일치합니다. 어느 파일에서 작업할까요?";
          // 최대 4개 객관식 옵션 (파일명 + 근거)
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

      // 3칸 참 -> 읽기 / 쓰기 판정
      // 변경 동사 단서
      const writeVerbRegex = /(?:바꿔|고쳐|추가|삭제|만들|수정|적용|변경|교체|넣어|빼줘|지워|작성)/i;
      // 조회·질문 단서
      const readVerbRegex = /(?:뭐야|알려줘|설명|왜|어디|인가요|어떻게|조회|보여줘|확인해줘|찾아줘|이유)/i;

      const hasWrite = writeVerbRegex.test(instruction);
      const hasRead = readVerbRegex.test(instruction);

      if (!hasWrite && hasRead) {
        // 읽기 관: 0토큰 즉시 반환 -> 클라이언트가 /api/chat 1회 호출로 연결
        console.log("ROUTER pipe: [읽기] 조회 단서 감지 -> route: read 즉시 반환 (0토큰)");
        return res.json({ ok: true, route: "read", reason: "조회·질문 단서 감지" });
      }

      // 쓰기 관: 변경 동사 있거나(또는 둘 다 해당/둘 다 없음 fail-safe) EYES 풀코스 진행
      console.log("ROUTER pipe: [쓰기] 3칸 참 및 쓰기 의도 판정 -> EYES 파이프라인 진행");
    }`;

const replace = `    // --- ROUTER 분할3: 4단계 lite 분류를 위한 3관 분기 확장 ---
    const codingToggle = (req.body && req.body.codingToggle === "ON") ? "ON" : "OFF";
    let appliedBPack = BPACK_PATCH;
    let routerDecisionLog = "모드: 패치 (라우터: 패치, 신뢰도 높음)";
    let isUndecided = false;

    if (codingToggle === "ON") {
      console.log("ROUTER pipe: [쓰기] 코딩 토글 ON (라우팅 스킵, 패치 파이프 직행)");
      appliedBPack = BPACK_PATCH;
      routerDecisionLog = "모드: 패치 (라우터: 패치, 신뢰도 높음)";
    } else {
      const routeCheck = judgeThreeSlots(instruction, targetFile);

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
      }
    }`;

if (content.split(search).length !== 2) {
  console.error('❌ 블록 3a 앵커 불일치 (fail-closed)');
  process.exit(1);
}

fs.writeFileSync(file, content.replace(search, replace), 'utf8');
console.log('✅ 3a. step3a_lite_flag.js 완료');