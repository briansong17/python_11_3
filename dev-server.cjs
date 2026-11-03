"use strict";

// 로컬 전용 개발 서버이며 Vercel의 자동 서버 진입점과 구분합니다.
const http = require("node:http");
const fs = require("node:fs/promises");
const path = require("node:path");
const dustHandler = require("./api/dust.js");
const port = Number(process.env.PORT || 3000);

// 공개 파일만 허용해 환경변수와 서버 소스가 다운로드되지 않게 합니다.
const publicFiles = {
  "/": ["index.html", "text/html; charset=utf-8"],
  "/index.html": ["index.html", "text/html; charset=utf-8"],
  "/style.css": ["style.css", "text/css; charset=utf-8"],
  "/script.js": ["script.js", "text/javascript; charset=utf-8"]
};

const server = http.createServer(async (req, res) => {
  // Vercel의 상태 코드와 JSON 응답 도우미를 로컬에서 제공합니다.
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (body) => {
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify(body));
    return res;
  };
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  try {
    const url = new URL(req.url, "http://localhost");
    if (url.pathname === "/api/dust") return await dustHandler(req, res);
    if (!["GET", "HEAD"].includes(req.method)) {
      res.setHeader("Allow", "GET, HEAD");
      return res.status(405).json({ message: "조회 요청만 사용할 수 있습니다." });
    }
    const file = publicFiles[url.pathname];
    if (!file) return res.status(404).json({ message: "요청한 주소를 찾을 수 없습니다." });
    const content = await fs.readFile(path.join(__dirname, file[0]));
    res.setHeader("Content-Type", file[1]);
    res.end(req.method === "HEAD" ? undefined : content);
  } catch {
    // 오류 원문에 인증키나 내부 경로가 포함될 수 있으므로 출력하지 않습니다.
    if (!res.headersSent) res.status(500).json({ message: "로컬 서버에서 요청을 처리하지 못했습니다." });
    else res.end();
  }
});

// 개발 서버는 현재 컴퓨터에서만 접속할 수 있도록 엽니다.
server.on("error", (error) => {
  console.error(error.code === "EADDRINUSE" ? `${port}번 포트가 사용 중입니다. 기존 서버를 종료하거나 PORT를 변경해 주세요.` : "로컬 서버를 시작하지 못했습니다.");
  process.exitCode = 1;
});
server.listen(port, "127.0.0.1", () => {
  console.log(`공기신호등 실행 주소: http://127.0.0.1:${port}`);
  console.log("종료하려면 Ctrl+C를 누르세요.");
});
