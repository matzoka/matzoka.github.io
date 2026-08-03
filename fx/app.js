const FEED_URL = "https://api.github.com/repos/matzoka/matzoka.github.io/issues/1";
const Y1 = "https://query1.finance.yahoo.com/v8/finance/chart/JPY%3DX?interval=1m&range=1d";
const Y15 = "https://query1.finance.yahoo.com/v8/finance/chart/JPY%3DX?interval=15m&range=5d";
const STORE = "fx-usdjpy-short-settings-v1";
const REFRESH = 5 * 60 * 1000;
const $ = (id) => document.getElementById(id);
const yen = new Intl.NumberFormat("ja-JP", { maximumFractionDigits: 0, signDisplay: "always" });
const num = new Intl.NumberFormat("ja-JP", { maximumFractionDigits: 3 });

let settings = { entry: null, position: null };
let quote = null;
let candles = [];
let studies = null;
let chartModel = null;
let hoverGlobalIndex = null;
let view = { start: 0, count: 96 };
let drag = { active: false, pointerId: null, startX: 0, startViewStart: 0 };

function bootstrap() {
  const p = new URLSearchParams(location.hash.slice(1));
  const entry = Number(p.get("entry"));
  const position = Number(p.get("position"));
  if (entry > 0 && position > 0) {
    localStorage.setItem(STORE, JSON.stringify({ entry, position }));
    history.replaceState(null, "", location.pathname + location.search);
  }
}

function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORE) || "null");
    if (saved?.entry > 0 && saved?.position > 0) settings = saved;
  } catch (_) {}
  $("entryInput").value = settings.entry ?? "";
  $("positionInput").value = settings.position ?? "";
  render();
}

function save() {
  const entry = Number($("entryInput").value);
  const position = Number($("positionInput").value);
  if (!(entry > 0 && position > 0)) {
    stat("平均売値と建玉を正しく入力してください。", true);
    return;
  }
  settings = { entry, position };
  localStorage.setItem(STORE, JSON.stringify(settings));
  stat("このブラウザに保存しました。");
  render();
  draw();
}

function stat(message, error = false) {
  $("status").textContent = message;
  $("status").className = error ? "status error" : "status";
}

function cstat(message, error = false) {
  $("chartStatus").textContent = message;
  $("chartStatus").className = error ? "status error" : "status";
}

function render() {
  $("entryView").textContent = settings.entry ? `${settings.entry.toFixed(3)}円` : "未設定";
  $("positionView").textContent = settings.position ? `${num.format(settings.position)} USD` : "未設定";
  if (!quote) return;

  const rate = Number(quote.rate);
  $("rate").textContent = `${rate.toFixed(3)}円`;
  $("quoteTime").textContent = quote.quote_time_jst || "---";

  if (!(settings.entry > 0 && settings.position > 0)) {
    $("difference").textContent = "---";
    $("target152").textContent = "---";
    $("target147").textContent = "---";
    $("pnl").textContent = "設定してください";
    $("pnl").className = "pnl";
    $("direction").textContent = "平均売値と建玉を入力してください。";
    return;
  }

  const difference = settings.entry - rate;
  const pnl = difference * settings.position;
  $("difference").textContent = `${difference >= 0 ? "+" : ""}${difference.toFixed(3)}円`;
  $("pnl").textContent = `${yen.format(Math.round(pnl))}円`;
  $("pnl").className = `pnl ${pnl > 0.5 ? "good" : pnl < -0.5 ? "bad" : ""}`;
  $("direction").textContent = pnl > 0.5
    ? "円高方向へ進み、現在は概算含み益です。"
    : pnl < -0.5
      ? "円安方向へ進み、現在は概算含み損です。"
      : "ほぼ建値です。";
  $("target152").textContent = `${yen.format(Math.round((settings.entry - 152) * settings.position))}円`;
  $("target147").textContent = `${yen.format(Math.round((settings.entry - 147) * settings.position))}円`;
}

async function getJson(url) {
  let response;
  try {
    response = await fetch(`${url}${url.includes("?") ? "&" : "?"}t=${Date.now()}`, { cache: "no-store" });
  } catch (_) {
    response = null;
  }
  if (!response || !response.ok) {
    const proxy = `https://corsproxy.io/?url=${encodeURIComponent(url)}`;
    response = await fetch(`${proxy}&t=${Date.now()}`, { cache: "no-store" });
  }
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

async function scheduled() {
  const response = await fetch(`${FEED_URL}?t=${Date.now()}`, {
    headers: { Accept: "application/vnd.github+json" },
    cache: "no-store"
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const feed = JSON.parse((await response.json()).body);
  if (!(Number(feed.rate) > 0)) throw new Error("レートが不正です");
  return feed;
}

async function live() {
  const result = (await getJson(Y1))?.chart?.result?.[0];
  const meta = result?.meta;
  if (!meta?.regularMarketPrice) throw new Error("最新値を取得できません");
  const timestamp = meta.regularMarketTime || Date.now() / 1000;
  return {
    rate: Number(meta.regularMarketPrice),
    quote_time_jst: `${new Date(timestamp * 1000).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" })} JST`
  };
}

function validPrice(value) {
  if (value === null || value === undefined || value === "") return false;
  const price = Number(value);
  return Number.isFinite(price) && price > 50 && price < 300;
}

async function bars() {
  const result = (await getJson(Y15))?.chart?.result?.[0];
  const timestamps = result?.timestamp || [];
  const q = result?.indicators?.quote?.[0] || {};
  const output = [];

  for (let i = 0; i < timestamps.length; i += 1) {
    const raw = [q.open?.[i], q.high?.[i], q.low?.[i], q.close?.[i]];
    if (!raw.every(validPrice)) continue;
    const [o, h, l, c] = raw.map(Number);
    const t = Number(timestamps[i]);
    if (!Number.isFinite(t) || !(t > 0)) continue;
    if (!(h >= Math.max(o, c) && l <= Math.min(o, c))) continue;
    output.push({ t, o, h, l, c });
  }

  if (output.length < 80) throw new Error("15分足データが不足しています");
  return output.slice(-420);
}

function sma(values, period) {
  const output = Array(values.length).fill(null);
  let sum = 0;
  for (let i = 0; i < values.length; i += 1) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    if (i >= period - 1) output[i] = sum / period;
  }
  return output;
}

function bollinger(values, period = 20, multiplier = 2) {
  const middle = sma(values, period);
  const upper = Array(values.length).fill(null);
  const lower = Array(values.length).fill(null);
  for (let i = period - 1; i < values.length; i += 1) {
    let variance = 0;
    for (let j = i - period + 1; j <= i; j += 1) variance += (values[j] - middle[i]) ** 2;
    const deviation = Math.sqrt(variance / period);
    upper[i] = middle[i] + multiplier * deviation;
    lower[i] = middle[i] - multiplier * deviation;
  }
  return { middle, upper, lower };
}

function calculateStudies() {
  const closes = candles.map((item) => item.c);
  const bb = bollinger(closes, 20, 2);
  studies = {
    ma5: sma(closes, 5),
    ma25: sma(closes, 25),
    ma75: sma(closes, 75),
    bbMiddle: bb.middle,
    bbUpper: bb.upper,
    bbLower: bb.lower
  };
}

function clampView() {
  if (!candles.length) return;
  view.count = Math.max(20, Math.min(candles.length, Math.round(view.count)));
  view.start = Math.max(0, Math.min(candles.length - view.count, Math.round(view.start)));
}

function resetView() {
  if (!candles.length) return;
  view.count = Math.min(96, candles.length);
  view.start = Math.max(0, candles.length - view.count);
  hoverGlobalIndex = null;
  hideTip();
  draw();
}

function zoomAt(anchorRatio, factor) {
  if (!candles.length) return;
  clampView();
  const oldCount = view.count;
  const oldAnchor = view.start + anchorRatio * oldCount;
  const newCount = Math.max(20, Math.min(candles.length, Math.round(oldCount * factor)));
  view.count = newCount;
  view.start = Math.round(oldAnchor - anchorRatio * newCount);
  clampView();
  hoverGlobalIndex = null;
  hideTip();
  draw();
}

function drawLine(ctx, values, start, count, sx, sy, color, width = 1.4, dash = []) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.setLineDash(dash);
  ctx.beginPath();
  let drawing = false;
  for (let local = 0; local < count; local += 1) {
    const value = values[start + local];
    if (value == null || !Number.isFinite(value)) {
      drawing = false;
      continue;
    }
    const x = sx(local);
    const y = sy(value);
    if (!drawing) {
      ctx.moveTo(x, y);
      drawing = true;
    } else {
      ctx.lineTo(x, y);
    }
  }
  ctx.stroke();
  ctx.restore();
}

function draw() {
  if (!candles.length || !studies) return;
  clampView();

  const canvas = $("chart");
  const ctx = canvas.getContext("2d");
  const dpr = Math.min(globalThis.devicePixelRatio || 1, 2.5);
  const width = canvas.clientWidth || 850;
  const height = canvas.clientHeight || 420;
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#0d1524";
  ctx.fillRect(0, 0, width, height);

  const margin = { left: 12, right: 66, top: 22, bottom: 30 };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const visible = candles.slice(view.start, view.start + view.count);
  const values = visible.flatMap((item) => [item.h, item.l]);

  const addVisibleSeries = (series) => {
    for (let i = view.start; i < view.start + view.count; i += 1) {
      const value = series[i];
      if (value != null && Number.isFinite(value)) values.push(value);
    }
  };
  if ($("ma5").checked) addVisibleSeries(studies.ma5);
  if ($("ma25").checked) addVisibleSeries(studies.ma25);
  if ($("ma75").checked) addVisibleSeries(studies.ma75);
  if ($("bb").checked) {
    addVisibleSeries(studies.bbUpper);
    addVisibleSeries(studies.bbLower);
  }
  if ($("entryLine").checked && settings.entry > 0) values.push(settings.entry);

  let min = Math.min(...values);
  let max = Math.max(...values);
  const padding = Math.max((max - min) * 0.07, 0.025);
  min -= padding;
  max += padding;

  const sx = (localIndex) => margin.left + (localIndex + 0.5) * plotWidth / visible.length;
  const sy = (price) => margin.top + (max - price) / (max - min) * plotHeight;
  const step = plotWidth / visible.length;
  const candleWidth = Math.max(2, Math.min(10, step * 0.6));

  ctx.strokeStyle = "rgba(156,175,199,.16)";
  ctx.fillStyle = "#9cafc7";
  ctx.font = "11px system-ui";
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  for (let i = 0; i <= 5; i += 1) {
    const y = margin.top + plotHeight * i / 5;
    const price = max - (max - min) * i / 5;
    ctx.beginPath();
    ctx.moveTo(margin.left, y);
    ctx.lineTo(width - margin.right + 4, y);
    ctx.stroke();
    ctx.fillText(price.toFixed(3), width - 4, y);
  }

  if ($("bb").checked) {
    ctx.save();
    ctx.fillStyle = "rgba(167,139,250,.08)";
    ctx.beginPath();
    let started = false;
    for (let local = 0; local < visible.length; local += 1) {
      const value = studies.bbUpper[view.start + local];
      if (value == null) continue;
      const x = sx(local);
      const y = sy(value);
      if (!started) {
        ctx.moveTo(x, y);
        started = true;
      } else ctx.lineTo(x, y);
    }
    for (let local = visible.length - 1; local >= 0; local -= 1) {
      const value = studies.bbLower[view.start + local];
      if (value != null) ctx.lineTo(sx(local), sy(value));
    }
    if (started) {
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
    drawLine(ctx, studies.bbUpper, view.start, visible.length, sx, sy, "rgba(167,139,250,.78)", 1);
    drawLine(ctx, studies.bbLower, view.start, visible.length, sx, sy, "rgba(167,139,250,.78)", 1);
    drawLine(ctx, studies.bbMiddle, view.start, visible.length, sx, sy, "rgba(167,139,250,.48)", 1, [4, 3]);
  }

  visible.forEach((candle, local) => {
    const x = sx(local);
    const up = candle.c >= candle.o;
    const color = up ? "#42d392" : "#ff6b7a";
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, sy(candle.h));
    ctx.lineTo(x, sy(candle.l));
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.fillRect(
      x - candleWidth / 2,
      Math.min(sy(candle.o), sy(candle.c)),
      candleWidth,
      Math.max(1.5, Math.abs(sy(candle.o) - sy(candle.c)))
    );
  });

  if ($("ma5").checked) drawLine(ctx, studies.ma5, view.start, visible.length, sx, sy, "#e3d400", 1.6);
  if ($("ma25").checked) drawLine(ctx, studies.ma25, view.start, visible.length, sx, sy, "#ff7fb8", 1.6);
  if ($("ma75").checked) drawLine(ctx, studies.ma75, view.start, visible.length, sx, sy, "#3b82f6", 1.6);

  if ($("entryLine").checked && settings.entry > 0) {
    ctx.save();
    ctx.strokeStyle = "rgba(255,255,255,.8)";
    ctx.setLineDash([7, 5]);
    ctx.beginPath();
    ctx.moveTo(margin.left, sy(settings.entry));
    ctx.lineTo(width - margin.right, sy(settings.entry));
    ctx.stroke();
    ctx.restore();
    ctx.fillStyle = "#fff";
    ctx.textAlign = "left";
    ctx.fillText(`平均売値 ${settings.entry.toFixed(3)}`, margin.left + 4, sy(settings.entry) - 9);
  }

  ctx.fillStyle = "#9cafc7";
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  const labels = 5;
  for (let j = 0; j < labels; j += 1) {
    const local = Math.round((visible.length - 1) * j / (labels - 1));
    const candle = visible[local];
    if (!candle) continue;
    const date = new Date(candle.t * 1000);
    const text = date.toLocaleString("ja-JP", {
      timeZone: "Asia/Tokyo",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit"
    });
    ctx.fillText(text, sx(local), height - margin.bottom + 7);
  }

  if (hoverGlobalIndex != null && hoverGlobalIndex >= view.start && hoverGlobalIndex < view.start + visible.length) {
    const local = hoverGlobalIndex - view.start;
    const candle = candles[hoverGlobalIndex];
    const x = sx(local);
    const y = sy(candle.c);
    ctx.save();
    ctx.strokeStyle = "rgba(244,247,251,.55)";
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(x, margin.top);
    ctx.lineTo(x, height - margin.bottom);
    ctx.moveTo(margin.left, y);
    ctx.lineTo(width - margin.right, y);
    ctx.stroke();
    ctx.restore();
  }

  chartModel = { width, height, margin, plotWidth, plotHeight, visible, sx, sy };
  $("pngButton").disabled = false;
}

async function periodic() {
  stat("定期フィードを確認しています…");
  try {
    quote = await scheduled();
    render();
    stat(`定期フィード取得完了：${new Date().toLocaleString("ja-JP")}`);
  } catch (error) {
    stat(`定期フィードを取得できませんでした：${error.message}`, true);
  }
}

async function now() {
  const button = $("refreshButton");
  button.disabled = true;
  stat("最新値を照会しています…");
  cstat("15分足とテクニカルを計算しています…");
  try {
    const [newQuote, newCandles] = await Promise.all([live(), bars()]);
    quote = newQuote;
    candles = newCandles;
    calculateStudies();
    resetView();
    render();
    stat(`最新値を直接取得しました：${new Date().toLocaleString("ja-JP")}`);
    cstat("ドラッグで左右移動、マウスホイールで拡大・縮小、ダブルクリックで表示をリセットできます。");
  } catch (error) {
    stat(`直接取得に失敗したため定期フィードへ切り替えます：${error.message}`, true);
    cstat(`チャート取得に失敗しました：${error.message}`, true);
    await periodic();
  } finally {
    button.disabled = false;
  }
}

function png() {
  if (!candles.length) return;
  const savedHover = hoverGlobalIndex;
  hoverGlobalIndex = null;
  draw();
  const link = document.createElement("a");
  link.download = `USDJPY_15m_${new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-")}.png`;
  link.href = $("chart").toDataURL("image/png");
  link.click();
  hoverGlobalIndex = savedHover;
  draw();
}

function hideTip() {
  $("tip").style.display = "none";
}

function showTip(event, globalIndex) {
  const candle = candles[globalIndex];
  if (!candle) return;
  const tip = $("tip");
  const rows = [
    new Date(candle.t * 1000).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" }),
    `O ${candle.o.toFixed(3)}　H ${candle.h.toFixed(3)}`,
    `L ${candle.l.toFixed(3)}　C ${candle.c.toFixed(3)}`
  ];
  const ma5 = studies.ma5[globalIndex];
  const ma25 = studies.ma25[globalIndex];
  const ma75 = studies.ma75[globalIndex];
  if (ma5 != null) rows.push(`MA5 ${ma5.toFixed(3)}`);
  if (ma25 != null) rows.push(`MA25 ${ma25.toFixed(3)}`);
  if (ma75 != null) rows.push(`MA75 ${ma75.toFixed(3)}`);
  tip.innerHTML = rows.join("<br>");
  tip.style.display = "block";
  tip.style.left = `${Math.min(innerWidth - 205, event.clientX + 14)}px`;
  tip.style.top = `${Math.max(8, event.clientY - 96)}px`;
}

function localPoint(event) {
  const rect = $("chart").getBoundingClientRect();
  return { x: event.clientX - rect.left, y: event.clientY - rect.top };
}

function nearestGlobalIndex(x) {
  if (!chartModel) return null;
  const { margin, plotWidth, visible } = chartModel;
  const ratio = (x - margin.left) / plotWidth;
  const local = Math.round(ratio * visible.length - 0.5);
  return view.start + Math.max(0, Math.min(visible.length - 1, local));
}

function onPointerMove(event) {
  if (!chartModel) return;
  const point = localPoint(event);
  if (drag.active && event.pointerId === drag.pointerId) {
    const barsPerPixel = view.count / chartModel.plotWidth;
    view.start = drag.startViewStart - (point.x - drag.startX) * barsPerPixel;
    clampView();
    hoverGlobalIndex = null;
    hideTip();
    draw();
    return;
  }
  hoverGlobalIndex = nearestGlobalIndex(point.x);
  draw();
  showTip(event, hoverGlobalIndex);
}

function onPointerDown(event) {
  if (!candles.length || event.button !== 0) return;
  const point = localPoint(event);
  drag = {
    active: true,
    pointerId: event.pointerId,
    startX: point.x,
    startViewStart: view.start
  };
  $("chart").setPointerCapture(event.pointerId);
  $("chart").classList.add("dragging");
  hideTip();
}

function endDrag(event) {
  if (!drag.active || (event.pointerId != null && event.pointerId !== drag.pointerId)) return;
  drag.active = false;
  drag.pointerId = null;
  $("chart").classList.remove("dragging");
}

function onWheel(event) {
  if (!candles.length || !chartModel) return;
  event.preventDefault();
  const point = localPoint(event);
  const ratio = Math.max(0, Math.min(1, (point.x - chartModel.margin.left) / chartModel.plotWidth));
  zoomAt(ratio, event.deltaY < 0 ? 0.82 : 1.22);
}

$("saveButton").onclick = save;
$("refreshButton").onclick = now;
$("pngButton").onclick = png;
$("resetViewButton").onclick = resetView;
$("zoomInButton").onclick = () => zoomAt(0.5, 0.8);
$("zoomOutButton").onclick = () => zoomAt(0.5, 1.25);
for (const id of ["ma5", "ma25", "ma75", "bb", "entryLine"]) $(id).onchange = draw;

const canvas = $("chart");
canvas.addEventListener("pointermove", onPointerMove);
canvas.addEventListener("pointerdown", onPointerDown);
canvas.addEventListener("pointerup", endDrag);
canvas.addEventListener("pointercancel", endDrag);
canvas.addEventListener("lostpointercapture", endDrag);
canvas.addEventListener("pointerleave", (event) => {
  if (!drag.active) {
    hoverGlobalIndex = null;
    hideTip();
    draw();
  }
});
canvas.addEventListener("wheel", onWheel, { passive: false });
canvas.addEventListener("dblclick", resetView);
addEventListener("resize", draw);

bootstrap();
load();
periodic();
setInterval(periodic, REFRESH);
