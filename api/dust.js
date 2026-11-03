"use strict";

// 인증키는 서버 환경변수에서만 읽으며 응답이나 로그에 넣지 않습니다.
module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ message: "조회 요청만 사용할 수 있습니다." });
  }
  const key = process.env.AIRKOREA_KEY?.trim();
  if (!key) return res.status(500).json({ message: "서버에 AIRKOREA_KEY 환경변수를 설정해 주세요." });

  // 시도가 생략되면 서울, 페이지가 생략되면 첫 페이지를 조회합니다.
  const query = new URL(req.url, "http://localhost").searchParams;
  const sido = query.get("sido")?.trim() || "서울";
  const pageNo = query.get("pageNo") || "1";
  const regions = ["전국", "서울", "부산", "대구", "인천", "광주", "대전", "울산", "세종", "경기", "강원", "충북", "충남", "전북", "전남", "경북", "경남", "제주"];
  if (!regions.includes(sido) || !/^[1-9]\d*$/.test(pageNo) || Number(pageNo) > 1000) {
    return res.status(400).json({ message: "인증키또는요청값을확인해주세요" });
  }

  // Decoding 키를 정확히 한 번 인코딩하여 요청 주소에 붙입니다.
  const endpoint = "https://apis.data.go.kr/B552584/ArpltnInforInqireSvc/getCtprvnRltmMesureDnsty";
  const url = `${endpoint}?serviceKey=${encodeURIComponent(key)}&returnType=json&sidoName=${encodeURIComponent(sido)}&numOfRows=100&pageNo=${pageNo}&ver=1.3`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const upstream = await fetch(url, { signal: controller.signal });
    const text = await upstream.text();
    let data;
    // XML 오류와 잘못된 JSON은 원문을 노출하지 않고 한국어로 안내합니다.
    try { data = JSON.parse(text); }
    catch { return res.status(502).json({ message: "인증키또는요청값을확인해주세요" }); }
    const code = data?.response?.header?.resultCode;
    if (code == null || !["00", "0"].includes(String(code))) {
      return res.status(502).json({ message: "대기정보 요청에 실패했습니다. 인증키또는요청값을확인해주세요" });
    }
    if (!upstream.ok || !Array.isArray(data.response?.body?.items)) {
      return res.status(502).json({ message: "대기정보 응답을 읽을 수 없습니다. 잠시 후 다시 조회해 주세요." });
    }
    // 필요한 응답 필드만 반환해 외부 오류 원문이 전달되지 않도록 합니다.
    const body = data.response.body;
    return res.status(200).json({ response: { header: { resultCode: "00" }, body: {
      totalCount: body.totalCount, items: body.items.map((item) => ({
        stationName: item.stationName, sidoName: item.sidoName,
        pm10Value: item.pm10Value, pm25Value: item.pm25Value,
        pm10Grade: item.pm10Grade, dataTime: item.dataTime
      }))
    } } });
  } catch {
    return res.status(controller.signal.aborted ? 504 : 502).json({
      message: controller.signal.aborted ? "대기정보 서버의 응답이 지연되고 있습니다. 다시 조회해 주세요." : "대기정보 서버에 연결하지 못했습니다. 잠시 후 다시 조회해 주세요."
    });
  } finally {
    clearTimeout(timeout);
  }
};
