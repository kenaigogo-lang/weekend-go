const REPO = "kenaigogo-lang/weekend-go";
const HOME = { name: "樹林車站", lat: 24.9906, lng: 121.4246 };
const RAIN_OK = ["雨天OK", "室內"];

const state = { routes: [], events: [], visited: [], weather: null, pickOrder: [], pickIdx: 0, routeFilter: "全部", evFilter: "全部" };

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const enc = encodeURIComponent;
const pad = (n) => String(n).padStart(2, "0");
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const today = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
const daysUntil = (iso) => Math.round((new Date(iso + "T00:00:00") - today()) / 86400000);
const WEEK = "日一二三四五六";

function kmBetween(a, b) {
  const r = Math.PI / 180, dLat = (b.lat - a.lat) * r, dLng = (b.lng - a.lng) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

// ---------- 連結 ----------
const navUrl = (dest) => `https://www.google.com/maps/dir/?api=1&destination=${enc(dest)}&travelmode=driving`;
const searchUrl = (q) => `https://www.google.com/maps/search/?api=1&query=${enc(q)}`;
function fullRouteUrl(route) {
  const stops = [];
  for (const s of route.steps) if (stops[stops.length - 1] !== s.q) stops.push(s.q);
  const dest = stops.pop();
  let u = `https://www.google.com/maps/dir/?api=1&origin=${enc(HOME.name)}&destination=${enc(dest)}&travelmode=driving`;
  if (stops.length) u += `&waypoints=${enc(stops.join("|"))}`;
  return u;
}
function logUrl(id, name) {
  const q = new URLSearchParams({ template: "visited.yml", title: `[去過] ${name}`, route: id ? `${id} ${name}` : name, date: ymd(new Date()) });
  return `https://github.com/${REPO}/issues/new?${q}`;
}

// ---------- 資料 ----------
async function getJson(path) {
  try {
    const r = await fetch(path, { cache: "no-cache" });
    return r.ok ? await r.json() : null;
  } catch { return null; }
}

async function loadWeather() {
  const u = `https://api.open-meteo.com/v1/forecast?latitude=${HOME.lat}&longitude=${HOME.lng}&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=Asia%2FTaipei&forecast_days=7`;
  const d = await getJson(u);
  if (!d?.daily) { $("#weather").textContent = "天氣暫時抓不到"; return; }
  const days = d.daily.time.map((t, i) => ({
    date: t,
    code: d.daily.weather_code[i],
    max: Math.round(d.daily.temperature_2m_max[i]),
    min: Math.round(d.daily.temperature_2m_min[i]),
    pop: d.daily.precipitation_probability_max[i] ?? 0,
  }));
  days.forEach((x) => { x.rain = x.pop >= 50 || x.code >= 61; });
  // 目標日：今天是週末就看今天，否則看下一個週六
  const dow = new Date().getDay();
  const target = dow === 0 || dow === 6 ? days[0] : days.find((x) => new Date(x.date + "T00:00:00").getDay() === 6) || days[0];
  state.weather = { days, target };
  const icon = (x) => (x.code >= 95 ? "⛈️" : x.rain ? "🌧️" : x.code >= 45 ? "🌫️" : x.code >= 3 ? "☁️" : x.code >= 1 ? "⛅" : "☀️");
  $("#weather").innerHTML = days.map((x, i) => {
    const dt = new Date(x.date + "T00:00:00");
    const label = i === 0 ? "今天" : i === 1 ? "明天" : "週" + WEEK[dt.getDay()];
    return `<span class="wday ${x.rain ? "rain" : ""}"><b>${label}</b> ${icon(x)} ${x.min}–${x.max}° · 雨 ${x.pop}%</span>`;
  }).join("");
}

// ---------- 推薦 ----------
function lastVisit(id) {
  return state.visited.filter((v) => v.route === id).sort((a, b) => b.date.localeCompare(a.date))[0];
}
function nearbyEvents(route, maxKm = 3) {
  const spots = route.steps.filter((s) => s.lat);
  return state.events.filter((e) => e.lat && daysUntil(e.start) <= 0 && spots.some((s) => kmBetween(s, e) <= maxKm))
    .sort((a, b) => a.permanent - b.permanent || a.end.localeCompare(b.end));
}
const rainOk = (r) => r.tags.some((t) => RAIN_OK.includes(t));

function scoreRoute(r) {
  const rain = state.weather?.target.rain;
  const why = [];
  let s = Math.random() * 10;
  const lv = lastVisit(r.id);
  if (lv) {
    const ago = -daysUntil(lv.date);
    if (/不推/.test(lv.rating || "")) s -= 200;
    if (ago < 120) s -= 100; else { s -= 20; why.push(`上次去是 ${lv.date}`); }
  } else why.push("還沒去過");
  if (rain && !rainOk(r)) s -= 40;
  if (rain && rainOk(r)) why.unshift("可能下雨，選了室內的路線");
  if (!rain && r.tags.includes("戶外")) { s += 4; why.unshift("天氣不錯，適合出門"); }
  const ev = nearbyEvents(r).find((e) => !e.permanent && daysUntil(e.end) <= 21);
  if (ev) { s += 8; why.push(`順路展覽「${ev.title}」再 ${daysUntil(ev.end)} 天就結束`); }
  if (r.tags.includes("稍遠")) s -= 5;
  return { r, s, why };
}

function doPick() {
  if (!state.pickOrder.length || state.pickIdx >= state.pickOrder.length) {
    state.pickOrder = state.routes.map(scoreRoute).sort((a, b) => b.s - a.s);
    state.pickIdx = 0;
  }
  const { r, why } = state.pickOrder[state.pickIdx++];
  $("#pickOut").innerHTML = `
    <div class="card pick">
      <div class="why">${esc(why.join("・"))}</div>
      <h3>${r.emoji} ${esc(r.name)}</h3>
      <div class="meta"><span>🚗 約 ${r.drive} 分</span><span>建議 ${r.depart} 出發</span></div>
      <p style="margin:8px 0 0">${esc(r.summary)}</p>
      <div class="row">
        <button class="btn primary" data-open="${r.id}">看行程 →</button>
        <button class="btn" id="again">換一個</button>
      </div>
    </div>`;
  $("#again").onclick = doPick;
  $("#pickBtn").textContent = "🎲 再抽一次";
}

// ---------- 卡片 ----------
function routeCard(r) {
  const lv = lastVisit(r.id);
  return `<div class="card click" data-open="${r.id}">
    <h3>${r.emoji} ${esc(r.name)}</h3>
    <div class="meta"><span>🚗 約 ${r.drive} 分</span><span>${esc(r.area)}</span>${lv ? `<span class="visited">✓ 去過 ${lv.date}</span>` : ""}</div>
    <div>${r.tags.map((t) => `<span class="tag">${esc(t)}</span>`).join("")}</div>
  </div>`;
}

function eventCard(e) {
  const left = daysUntil(e.end), notYet = daysUntil(e.start);
  const badge = notYet > 0 ? `<span class="badge">${notYet} 天後開展</span>`
    : !e.permanent && left <= 14 ? `<span class="badge">剩 ${left} 天</span>` : "";
  const dest = e.address || e.place;
  return `<div class="card">
    <h3>${esc(e.title)}</h3>
    <div class="meta">
      <span>📍 ${esc(e.place)}</span>
      ${e.min ? `<span>🚗 約 ${e.min} 分</span>` : ""}
      <span>${e.permanent ? "常設展" : `${e.start.slice(5).replace("-", "/")}–${e.end.slice(5).replace("-", "/")}`}</span>
      ${badge}
    </div>
    ${e.price ? `<div class="meta" style="margin-top:2px">🎟️ ${esc(e.price.slice(0, 60))}</div>` : ""}
    <div class="row">
      <a class="btn primary" href="${navUrl(dest)}" target="_blank" rel="noopener">導航</a>
      <a class="btn" href="${esc(e.url || "https://www.google.com/search?q=" + enc(e.title))}" target="_blank" rel="noopener">展覽資訊</a>
      <a class="btn" href="${logUrl("", "展覽：" + e.title)}" target="_blank" rel="noopener">✅ 去了</a>
    </div>
  </div>`;
}

// ---------- 行程詳情 ----------
function toMin(hhmm) { const [h, m] = hhmm.split(":").map(Number); return h * 60 + m; }
function fmt(min) { min = ((min % 1440) + 1440) % 1440; return `${pad(Math.floor(min / 60))}:${pad(min % 60)}`; }
const KIND = { see: "🖼️", eat: "🍜", walk: "🚶", view: "🌄", fun: "✨", shop: "🛍️" };

function renderTimeline(r, start) {
  let t = toMin(start);
  const items = r.steps.map((s, i) => {
    t += s.drive;
    const arrive = t;
    t += s.stay;
    const driveTxt = s.drive ? `${i === 0 ? "從樹林" : ""}開車約 ${s.drive} 分` : i ? "走路過去" : "";
    return `<li>
      <span class="t">${fmt(arrive)}</span><span class="dot"></span>
      ${driveTxt ? `<div class="drive">${driveTxt}</div>` : ""}
      <h4>${KIND[s.kind] || "📍"} ${esc(s.title)}</h4>
      <div class="drive">待約 ${s.stay} 分</div>
      <p>${esc(s.detail)}</p>
      <div class="links">
        ${s.drive ? `<a href="${navUrl(s.q)}" target="_blank" rel="noopener">🧭 導航</a><a href="${searchUrl(s.q + " 附近停車場")}" target="_blank" rel="noopener">🅿️ 找停車</a>` : ""}
        <a href="${searchUrl(s.q)}" target="_blank" rel="noopener">🗺️ 地圖・營業時間</a>
      </div>
    </li>`;
  });
  items.push(`<li><span class="t">${fmt(t + r.drive)}</span><span class="dot"></span><h4>🏠 回到樹林</h4><div class="drive">回程約 ${r.drive} 分（塞車的話會更久）</div></li>`);
  return items.join("");
}

function openRoute(id, push = true) {
  const r = state.routes.find((x) => x.id === id);
  if (!r) return;
  if (push) history.pushState({ id }, "", `#r/${id}`);
  const now = new Date();
  const soon = Math.ceil((now.getHours() * 60 + now.getMinutes() + 10) / 15) * 15;
  const evs = nearbyEvents(r).slice(0, 5);
  const visits = state.visited.filter((v) => v.route === id);
  const el = $("#detail");
  el.innerHTML = `<div class="sheet-in">
    <div class="close"><button id="closeBtn">← 返回</button><span class="muted small">${esc(r.area)}</span></div>
    <h2 style="margin:4px 0">${r.emoji} ${esc(r.name)}</h2>
    <div>${r.tags.map((t) => `<span class="tag">${esc(t)}</span>`).join("")}</div>
    <p>${esc(r.summary)}</p>
    <a class="btn primary" style="display:block" href="${fullRouteUrl(r)}" target="_blank" rel="noopener">🚗 整條路線一鍵導航</a>
    <div class="depart">幾點出發
      <input type="time" id="departAt" value="${r.depart}" step="900">
      <button class="btn" id="nowBtn" style="flex:none">現在出發</button>
    </div>
    <ol class="timeline" id="tl">${renderTimeline(r, r.depart)}</ol>
    ${evs.length ? `<h3 class="sec">🖼️ 順路展覽</h3>${evs.map(eventCard).join("")}` : ""}
    ${r.tips?.length ? `<h3 class="sec">💡 小提醒</h3><ul class="tips">${r.tips.map((t) => `<li>${esc(t)}</li>`).join("")}<li>店家營業時間可能會變，點「地圖・營業時間」確認</li></ul>` : ""}
    <h3 class="sec">📒 紀錄</h3>
    ${visits.length ? visits.map((v) => `<div class="card"><b>${v.date}</b> ${esc(v.rating || "")}<div class="small">${esc(v.note || "")}</div></div>`).join("") : `<p class="muted small">還沒去過</p>`}
    <a class="btn" style="display:block" href="${logUrl(r.id, r.name)}" target="_blank" rel="noopener">✅ 我們去了，記錄一下</a>
  </div>`;
  el.hidden = false;
  el.scrollTop = 0;
  document.body.style.overflow = "hidden";
  const input = $("#departAt");
  input.oninput = () => { if (input.value) $("#tl").innerHTML = renderTimeline(r, input.value); };
  $("#nowBtn").onclick = () => { input.value = fmt(soon); input.oninput(); };
  $("#closeBtn").onclick = () => history.back();
}
function closeRoute() {
  $("#detail").hidden = true;
  document.body.style.overflow = "";
}
window.addEventListener("popstate", () => {
  const m = location.hash.match(/^#r\/(\w+)/);
  m ? openRoute(m[1], false) : closeRoute();
});

// ---------- 列表 ----------
function renderRoutes() {
  const filters = ["全部", "看展", "美食", "雨天OK", "近", "夕陽", "沒去過"];
  $("#routeChips").innerHTML = filters.map((f) => `<button class="${f === state.routeFilter ? "on" : ""}" data-rf="${f}">${f}</button>`).join("");
  const list = state.routes.filter((r) => {
    const f = state.routeFilter;
    if (f === "全部") return true;
    if (f === "沒去過") return !lastVisit(r.id);
    if (f === "雨天OK") return rainOk(r);
    return r.tags.includes(f);
  }).sort((a, b) => a.drive - b.drive);
  $("#routeList").innerHTML = list.map(routeCard).join("") || `<div class="empty">沒有符合的路線</div>`;
}

function renderEvents() {
  const filters = ["全部", "30 分內", "快結束", "免費", "新開展"];
  $("#evChips").innerHTML = filters.map((f) => `<button class="${f === state.evFilter ? "on" : ""}" data-ef="${f}">${f}</button>`).join("");
  const q = $("#evSearch").value.trim();
  const list = state.events.filter((e) => {
    if (q && !(e.title + e.place + e.address).includes(q)) return false;
    switch (state.evFilter) {
      case "30 分內": return e.min && e.min <= 30;
      case "快結束": return !e.permanent && daysUntil(e.end) <= 14 && daysUntil(e.start) <= 0;
      case "免費": return /免費|免門票|不收費/.test(e.price);
      case "新開展": return daysUntil(e.start) > -14;
      default: return true;
    }
  });
  $("#evList").innerHTML = list.map(eventCard).join("") || `<div class="empty">沒有符合的展覽</div>`;
}

function renderEndingSoon() {
  const list = state.events.filter((e) => !e.permanent && daysUntil(e.start) <= 0 && daysUntil(e.end) <= 21)
    .sort((a, b) => a.end.localeCompare(b.end)).slice(0, 3);
  $("#endingSoon").innerHTML = list.map(eventCard).join("") || `<p class="muted small">最近沒有快結束的展覽</p>`;
}

function renderLog() {
  const list = [...state.visited].sort((a, b) => b.date.localeCompare(a.date));
  $("#logList").innerHTML = list.length ? list.map((v) => `
    <div class="card${v.route && state.routes.some((r) => r.id === v.route) ? " click" : ""}" ${v.route ? `data-open="${esc(v.route)}"` : ""}>
      <div class="meta"><span>${v.date}</span><span>${esc(v.rating || "")}</span></div>
      <h3>${esc(v.title)}</h3>
      ${v.note ? `<div class="small">${esc(v.note)}</div>` : ""}
    </div>`).join("") : `<div class="empty">還沒有紀錄，出去玩完記得記一下 🙂</div>`;
  $("#freeLog").href = logUrl("", "");
}

// ---------- 事件 ----------
document.addEventListener("click", (ev) => {
  const t = ev.target.closest("[data-tab],[data-open],[data-rf],[data-ef]");
  if (!t) return;
  if (t.dataset.tab) {
    document.querySelectorAll(".tabs button").forEach((b) => b.classList.toggle("on", b === t));
    document.querySelectorAll(".tab").forEach((s) => s.classList.toggle("on", s.id === "tab-" + t.dataset.tab));
    window.scrollTo(0, 0);
  } else if (t.dataset.open) {
    if (ev.target.closest("a")) return;
    openRoute(t.dataset.open);
  } else if (t.dataset.rf) { state.routeFilter = t.dataset.rf; renderRoutes(); }
  else if (t.dataset.ef) { state.evFilter = t.dataset.ef; renderEvents(); }
});
$("#pickBtn").onclick = doPick;
$("#evSearch").oninput = renderEvents;

(async function init() {
  const [routes, events, visited] = await Promise.all([
    getJson("data/routes.json"), getJson("data/events.json"), getJson("data/visited.json"),
  ]);
  state.routes = routes?.routes || [];
  state.events = events?.events || [];
  state.visited = visited?.visits || [];
  $("#evUpdated").textContent = events?.updated ? `展覽資料更新於 ${events.updated}（文化部藝文活動開放資料）` : "展覽資料暫時抓不到";
  renderRoutes(); renderEvents(); renderEndingSoon(); renderLog();
  await loadWeather();
  const m = location.hash.match(/^#r\/(\w+)/);
  if (m) openRoute(m[1], false);
})();
