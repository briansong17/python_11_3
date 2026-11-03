"use strict";

// 브라우저는 인증키 없이 같은 사이트의 서버리스 함수를 호출합니다.
const API_URL = "/api/dust";
const $ = (id) => document.getElementById(id);
const grades = {
  "1": { className: "good", label: "좋음" },
  "2": { className: "normal", label: "보통" },
  "3": { className: "bad", label: "나쁨" },
  "4": { className: "very-bad", label: "매우나쁨" }
};
let activeController;
// 지역을 바꿀 때 기존 차트를 해제해 캔버스 중복 사용을 방지합니다.
let dustChart;

// 기존 측정값 검사로 누락값을 제외하고 숫자 내림차순으로 열 곳을 고릅니다.
function topStations(items) {
  return items.map((item) => ({ ...item, value: measurement(item.pm10Value) }))
    .filter((item) => item.value !== null)
    .sort((a, b) => b.value - a.value)
    .slice(0, 10);
}

// 카드의 실제 CSS 등급색을 읽어 그래프와 같은 색상을 사용합니다.
function gradeColor(item) {
  const grade = grades[String(item.pm10Grade ?? "").trim()];
  const swatch = document.querySelector(`.legend .${grade?.className || "unknown"}`);
  return getComputedStyle(swatch).getPropertyValue("--accent").trim();
}

// 불러오기, 빈 결과, 오류 시 이전 지역의 그래프를 지웁니다.
function clearChart(message) {
  dustChart?.destroy();
  dustChart = null;
  $("chart-container").hidden = true;
  $("chart-status").hidden = false;
  $("chart-status").textContent = message;
  $("chart-description").textContent = "";
}

// 가장 높은 값이 위에 오도록 가로 막대그래프를 구성합니다.
function renderChart(items, region) {
  clearChart("그래프에 표시할 유효한 미세먼지 측정값이 없습니다.");
  const top = topStations(items);
  if (!top.length) return;
  if (typeof Chart === "undefined") {
    $("chart-status").textContent = "그래프 라이브러리를 불러오지 못했습니다. 인터넷 연결을 확인하고 새로고침해 주세요.";
    return;
  }
  const labels = top.map((item) => `${region === "전국" && item.sidoName ? `${item.sidoName} · ` : ""}${item.stationName || "이름 없는 측정소"}`);
  $("chart-container").style.height = `${Math.max(200, top.length * 36 + 80)}px`;
  $("chart-container").hidden = false;
  $("chart-status").hidden = true;
  $("dust-chart").setAttribute("aria-describedby", "chart-description");
  $("chart-description").textContent = top.map((item, i) => `${labels[i]}: ${item.value} 마이크로그램/세제곱미터, ${grades[String(item.pm10Grade ?? "").trim()]?.label || "등급 없음"}`).join(". ");
  dustChart = new Chart($("dust-chart"), {
    type: "bar",
    data: { labels, datasets: [{
      label: "미세먼지", data: top.map((item) => item.value),
      backgroundColor: top.map(gradeColor), borderRadius: 3, maxBarThickness: 24
    }] },
    options: {
      indexAxis: "y", responsive: true, maintainAspectRatio: false, animation: false,
      font: { family: getComputedStyle(document.body).fontFamily },
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: (context) => `미세먼지: ${context.parsed.x} 마이크로그램/세제곱미터 · ${grades[String(top[context.dataIndex].pm10Grade ?? "").trim()]?.label || "등급 없음"}` } }
      },
      scales: {
        x: { beginAtZero: true, ticks: { color: "#526058" }, grid: { color: "#e4e9e0" } },
        y: { ticks: { autoSkip: false, color: "#202d29", font: { size: 12 } }, grid: { display: false } }
      }
    }
  });
}

// 하이픈, 공백, 음수 등 정상 측정값이 아닌 값은 계산에서 제외합니다.
function measurement(value) {
  if (value == null || !/^\d+(\.\d+)?$/.test(String(value).trim())) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

// 평균 미세먼지를 30, 80, 150 기준으로 나눠 대표 신호를 정합니다.
function representative(value) {
  if (value === null) return { className: "unknown", label: "측정안됨", emoji: "⚪" };
  const code = value <= 30 ? "1" : value <= 80 ? "2" : value <= 150 ? "3" : "4";
  return { ...grades[code], emoji: { "1": "🔵", "2": "🟢", "3": "🟠", "4": "🔴" }[code] };
}

// 서버의 한국 시각 문자열을 직접 읽어 브라우저 시간대 변환을 피합니다.
function koreanTime(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/.exec(String(value || ""));
  if (!match) return "측정시각 확인 불가";
  const [, year, month, day, hour, minute] = match;
  return `${year}년 ${Number(month)}월 ${Number(day)}일 ${Number(hour)}시${minute === "00" ? "" : ` ${Number(minute)}분`} 기준`;
}

// 불러오기와 오류 시 이전 지역의 신호가 남지 않도록 함께 갱신합니다.
function setSignal(state, message) {
  document.querySelector(".summary").className = `summary ${state.className}`;
  $("signal-emoji").textContent = state.emoji;
  $("signal-label").textContent = state.label;
  $("guidance").textContent = message;
}

// 페이지 번호를 함께 보내 100개가 넘는 측정소도 조회합니다.
async function fetchPage(region, pageNo, signal) {
  // 로컬 파일로 열면 서버 함수가 실행되지 않으므로 실행 방법을 안내합니다.
  if (location.protocol === "file:") {
    throw new Error("파일을 직접 열면 API를 사용할 수 없습니다. 프로젝트 터미널에서 npm run dev를 실행하고 http://127.0.0.1:3000으로 접속해 주세요.");
  }
  const url = `${API_URL}?sido=${encodeURIComponent(region)}&pageNo=${pageNo}`;
  let response;
  try { response = await fetch(url, { signal }); }
  catch (error) {
    if (signal.aborted) throw error;
    throw new Error("서버에 연결하지 못했습니다. 인터넷 연결을 확인해 주세요.");
  }
  let data;
  // Live Server는 서버리스 함수를 실행하지 않아 이 주소에 404를 반환합니다.
  if (response.status === 404) throw new Error("API 서버를 찾지 못했습니다. 로컬에서는 Live Server 대신 npm run dev로 실행한 http://127.0.0.1:3000에 접속해 주세요. 배포 중이라면 Vercel의 프로젝트 루트와 api/dust.js 포함 여부를 확인해 주세요.");
  try { data = await response.json(); }
  catch { throw new Error("서버 응답을 읽을 수 없습니다. Vercel 개발 서버 또는 배포 주소에서 실행해 주세요."); }
  if (!response.ok) throw new Error(data.message || "측정 정보를 가져오지 못했습니다.");
  const body = data.response?.body;
  if (!body || !Array.isArray(body.items)) throw new Error("측정소 목록을 읽을 수 없습니다.");
  return body;
}

// 외부 데이터는 텍스트로 넣어 HTML로 실행되지 않게 합니다.
function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

// 미세먼지 등급이 없거나 알 수 없는 값이면 회색 카드를 만듭니다.
function stationCard(item, region) {
  const grade = grades[String(item.pm10Grade ?? "").trim()] || { className: "unknown", label: "등급 없음" };
  const card = element("article", `station ${grade.className}`);
  const heading = element("div", "station-heading");
  heading.append(element("h3", "", item.stationName || "이름 없는 측정소"), element("span", "grade", grade.label));
  card.append(heading, element("p", "station-region", item.sidoName || region));
  const readings = element("dl", "readings");
  // 두 오염물질의 누락 여부를 각각 확인합니다.
  for (const [label, raw] of [["미세먼지", item.pm10Value], ["초미세먼지", item.pm25Value]]) {
    const value = measurement(raw);
    const group = element("div");
    group.append(element("dt", "", label), element("dd", value === null ? "missing" : "", value === null ? "측정안됨" : String(value)));
    readings.append(group);
  }
  card.append(readings, element("p", "station-time", koreanTime(item.dataTime)));
  return card;
}

// 유효한 미세먼지 값으로만 평균을 구하고 측정소 카드를 표시합니다.
function render(items, region) {
  const values = items.map((item) => measurement(item.pm10Value)).filter((value) => value !== null);
  const average = values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
  const state = representative(average);
  setSignal(state, average === null ? "유효한 측정값이 없어 대표 상태를 표시할 수 없습니다." : average > 80 ? "외출시마스크를챙기세요" : "가까운 측정소의 대기정보도 함께 확인하세요.");
  $("average").textContent = average === null ? "—" : average.toFixed(1);
  $("average-note").textContent = `전체 ${items.length}곳 중 ${values.length}곳의 유효한 미세먼지 값으로 계산 · 카드 수치의 단위는 마이크로그램/세제곱미터`;
  $("count").textContent = `${items.length}곳`;
  const fragment = document.createDocumentFragment();
  items.forEach((item) => fragment.append(stationCard(item, region)));
  $("cards").replaceChildren(fragment);
  $("status").hidden = items.length > 0;
  $("status").textContent = "이 지역에 표시할 측정소 정보가 없습니다.";
  renderChart(items, region);
}

// 지역 변경 시 이전 요청을 취소해 늦게 도착한 결과가 섞이지 않게 합니다.
async function loadRegion() {
  activeController?.abort();
  const controller = new AbortController();
  activeController = controller;
  const region = $("region").value;
  clearChart("불러오는중...");
  $("summary-title").textContent = `${region} 평균 미세먼지`;
  setSignal({ className: "unknown", label: "불러오는중...", emoji: "⚪" }, "불러오는중...");
  $("average").textContent = "—";
  $("average-note").textContent = "측정 정보를 기다리고 있습니다.";
  $("count").textContent = "0곳";
  $("cards").replaceChildren();
  $("status").hidden = false;
  $("refresh").disabled = true;
  document.querySelector(".stations").setAttribute("aria-busy", "true");
  $("status").textContent = "불러오는중...";
  // 응답이 지연되면 요청을 취소하고 재시도 안내를 표시합니다.
  const timeout = setTimeout(() => controller.abort(), 60000);
  try {
    const first = await fetchPage(region, 1, controller.signal);
    const items = [...first.items];
    const total = Number(first.totalCount);
    if (!Number.isInteger(total) || total < 0) throw new Error("측정소 수를 확인할 수 없습니다. 다시 조회해 주세요.");
    // 100개를 넘는 지역과 전국 조회는 나머지 페이지까지 가져옵니다.
    for (let page = 2; page <= Math.ceil(total / 100); page++) {
      $("status").textContent = `불러오는중... ${items.length} / ${total}곳`;
      const next = await fetchPage(region, page, controller.signal);
      items.push(...next.items);
    }
    if (controller === activeController && !controller.signal.aborted) render(items, region);
  } catch (error) {
    if (controller !== activeController) return;
    clearChart("측정 정보를 가져오지 못해 그래프를 표시할 수 없습니다.");
    $("status").textContent = controller.signal.aborted ? "응답 대기 시간이 초과되었습니다. 새로고침으로 다시 조회해 주세요." : error.message;
    setSignal({ className: "unknown", label: "확인 불가", emoji: "⚪" }, "잠시 후 다시 조회해 주세요.");
    $("average-note").textContent = "측정 정보를 가져오지 못했습니다.";
  } finally {
    clearTimeout(timeout);
    if (controller === activeController) {
      $("refresh").disabled = false;
      document.querySelector(".stations").setAttribute("aria-busy", "false");
    }
  }
}

// 드롭다운 변경과 새로고침 버튼을 조회 함수에 연결합니다.
$("region").addEventListener("change", loadRegion);
$("refresh").addEventListener("click", loadRegion);
loadRegion();
