# aaa

## 설치

```bash
npm install
```

## 환경 변수 설정

`.env` 파일을 생성하고 Gemini API 키를 입력하세요:

```bash
cp .env.example .env
# .env 파일을 열어 GEMINI_API_KEY 값을 채워주세요
```

`.env` 예시:

```
GEMINI_API_KEY=your_gemini_api_key_here
GEMINI_MODEL=gemini-2.5-flash
PORT=3000
```

## 실행

```bash
node server.js
```

브라우저에서 `http://localhost:3000` 접속.

- `/` : index.html (hello, 카운터, 할 일 목록, 다크 모드)
- `/blank.html?n=1` : 첫 번째 빈 페이지 (채팅 UI + Gemini AI)
- `/api/chat` : 채팅용 API 엔드포인트 (POST `{ message, pageContext }`)

API 키가 없으면 데모 응답으로 동작합니다. API 키는 서버(.env)에만 보관되며 클라이언트에 노출되지 않습니다.
