"use strict";

// 배포할 화면 파일만 복사해 로컬 설정과 인증키가 정적 배포에 포함되지 않게 합니다.
const fs = require("node:fs/promises");
const path = require("node:path");
const root = path.resolve(__dirname, "..");

async function build() {
  const output = path.join(root, "dist");
  await fs.mkdir(output, { recursive: true });
  for (const file of ["index.html", "style.css", "script.js"]) {
    await fs.copyFile(path.join(root, file), path.join(output, file));
  }
  console.log("화면 파일 3개를 dist 폴더에 준비했습니다. API는 별도 서버리스 함수로 배포합니다.");
}

build().catch(() => {
  console.error("화면 파일을 준비하지 못했습니다. 원본 파일의 존재 여부를 확인해 주세요.");
  process.exitCode = 1;
});
