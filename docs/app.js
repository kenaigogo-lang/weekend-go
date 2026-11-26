const REPO = "kenaigogo-lang/weekend-go";
// 出發地：每支手機記住自己選的，網址加 ?from=林口 也可以指定
const ORIGINS = {
  shulin: { id: "shulin", label: "樹林", name: "樹林車站", lat: 24.9906, lng: 121.4246 },
  linkou: { id: "linkou", label: "林口", name: "林口郵局 新北市林口區文化二路一段", lat: 25.0745, lng: 121.3885 },
};
const ORIGIN_KEY = "weekend-go-origin";
function initialOrigin() {
  const p = new URLSearchParams(location.search).get("from");
  const hit = p && Object.values(ORIGINS).find((o) => o.id === p || o.label === p);
  if (hit) return hit;
  try { return ORIGINS[localStorage.getItem(ORIGIN_KEY)] || ORIGINS.shulin; } catch { return ORIGINS.shulin; }
}
let HOME = initialOrigin();
const RAIN_OK = ["雨天OK", "室內"];

const state = {
  routes: [], events: [], visited: [], skipped: [], venues: [], foods: {}, weather: null,
  pickOrder: [], pickIdx: 0, pickMode: "day", pickFilter: "全部",
  routeFilter: { day: "全部", night: "全部" }, evFilter: "全部", evSort: "end", evHidePerm: false,
};

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const enc = encodeURIComponent;
const pad = (n) => String(n).padStart(2, "0");
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const today = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
const daysUntil = (iso) => Math.round((new Date(iso + "T00:00:00") - today()) / 86400000);
const WEEK = "日一二三四五六";

// Lucide 風格細線 SVG 圖示（零外部依賴、離線可用）
const ICONS = {
  nav: '<polygon points="3 11 22 2 13 21 11 13 3 11"/>',
  walk: '<circle cx="13" cy="4" r="2"/><path d="M13 7l-3 5 3 3-1 5M10 12l-3 2M15 9l3 2"/>',
  parking: '<rect x="3" y="3" width="18" height="18" rx="4"/><path d="M9 17V7h4a3 3 0 0 1 0 6H9"/>',
  map: '<polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21"/><line x1="9" y1="3" x2="9" y2="18"/><line x1="15" y1="6" x2="15" y2="21"/>',
  pin: '<path d="M12 22s7-5.5 7-12a7 7 0 1 0-14 0c0 6.5 7 12 7 12z"/><circle cx="12" cy="10" r="2.5"/>',
  car: '<path d="M5 17h14v-5l-2-5H7l-2 5z"/><circle cx="7.5" cy="17.5" r="1.5"/><circle cx="16.5" cy="17.5" r="1.5"/>',
  clock: '<circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15.5 14"/>',
  calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>',
  ticket: '<path d="M3 9a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v1a2 2 0 0 0 0 4v1a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-1a2 2 0 0 0 0-4z"/><line x1="13" y1="7" x2="13" y2="17" stroke-dasharray="2 2"/>',
  ext: '<path d="M15 3h6v6"/><path d="M10 14L21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
  check: '<polyline points="20 6 9 17 4 12"/>',
  eyeOff: '<path d="M17.9 17.9A10.1 10.1 0 0 1 12 20c-7 0-11-8-11-8a18.5 18.5 0 0 1 5.1-5.9"/><path d="M9.9 4.2A9.1 9.1 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.2 3.2"/><line x1="2" y1="2" x2="22" y2="22"/>',
  undo: '<path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-15-6.7L3 13"/>',
  share: '<path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/>',
  swap: '<polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/>',
  back: '<line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>',
  chev: '<polyline points="9 18 15 12 9 6"/>',
  dice: '<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8.5" cy="8.5" r="1.2" fill="currentColor"/><circle cx="15.5" cy="8.5" r="1.2" fill="currentColor"/><circle cx="12" cy="12" r="1.2" fill="currentColor"/><circle cx="8.5" cy="15.5" r="1.2" fill="currentColor"/><circle cx="15.5" cy="15.5" r="1.2" fill="currentColor"/>',
  moon: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>',
  sort: '<path d="M3 6h13M3 12h9M3 18h5M17 4v16m0 0l-3-3m3 3l3-3"/>',
  route: '<circle cx="6" cy="19" r="3"/><path d="M9 19h8.5a3.5 3.5 0 0 0 0-7h-11a3.5 3.5 0 0 1 0-7H15"/><circle cx="18" cy="5" r="3"/>',
};
const ico = (name) => `<svg class="ic" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name] || ""}</svg>`;

function kmBetween(a, b) {
  const r = Math.PI / 180, dLat = (b.lat - a.lat) * r, dLng = (b.lng - a.lng) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

// ---------- 出發地 ----------
// 粗估週末車程：市區繞路＋塞車，經驗值（跟 fetch_events.py 同一條公式）
const estMin = (pt) => Math.round(5 + kmBetween(HOME, pt) * 1.6);
const eventPoint = (x) => (x?.lat ? x : findVenue(x));
const minOf = (x) => {
  const pt = eventPoint(x);
  return pt ? estMin(pt) : HOME.id === "shulin" ? x.min ?? null : null;
};

// 路線的車程用 from[出發地]（手估）；沒寫的代表從這裡不推，打開時再用座標估
function routeHere(r) {
  const fixed = r.from?.[HOME.id] ?? (HOME.id === "shulin" ? r.drive : undefined);
  const first = r.steps.find((s) => s.lat);
  const d = fixed ?? (first ? estMin(first) : 40);
  const tags = r.tags.filter((t) => t !== "近" && t !== "稍遠");
  if (d <= 25) tags.push("近");
  if (d >= 60) tags.push("稍遠");
  // 路線原本寫的回程時間是以原出發地為準；換出發地時保留塞車提醒，只替換寫死回程時間的項目
  const nativeOrigin = r.drive != null ? "shulin" : Object.keys(r.from || {})[0] || "shulin";
  const isFixedReturnTip = (t) => /回程.*約\s*\d+|回(樹林|林口)/.test(t);
  const tips = HOME.id === nativeOrigin
    ? r.tips
    : [...(r.tips || []).filter((t) => !isFixedReturnTip(t)), `回程回${HOME.label}約 ${d} 分`];
  return {
    ...r, drive: d, here: fixed != null, tags,
    name: d >= 60 ? r.name : r.name.replace("【稍遠】", ""),
    steps: r.steps.map((s, i) => (i === 0 ? { ...s, drive: d } : s)),
    tips,
  };
}

function renderOrigin() {
  $("#originSwitch").innerHTML = Object.values(ORIGINS)
    .map((o) => `<button class="${o.id === HOME.id ? "on" : ""}" data-origin="${o.id}" aria-pressed="${o.id === HOME.id}">${o.label}出發</button>`).join("");
}
function setOrigin(id, persist = true) {
  if (!ORIGINS[id]) return;
  HOME = ORIGINS[id];
  if (persist) { try { localStorage.setItem(ORIGIN_KEY, id); } catch {} }
  state.routes = state.allRoutes.map(routeHere);
  renderOrigin();
  state.pickOrder = [];
  $("#pickOut").innerHTML = "";
  renderAll();
  loadWeather();
}

// ---------- 連結與分享 ----------
const navUrl = (dest) => `https://www.google.com/maps/dir/?api=1&destination=${enc(dest)}&travelmode=driving`;
const walkNavUrl = (dest) => `https://www.google.com/maps/dir/?api=1&destination=${enc(dest)}&travelmode=walking`;
const searchUrl = (q) => `https://www.google.com/maps/search/?api=1&query=${enc(q)}`;
function fullRouteUrl(route) {
  // 只把真的需要開車移動的站點放進汽車導航，避免把徒步區或純步行點塞進 waypoints
  const driving = route.steps.filter((s, i) => i === 0 || s.drive > 0);
  const stops = [];
  for (const s of driving) if (stops[stops.length - 1] !== s.q) stops.push(s.q);
  const dest = stops.pop();
  let u = `https://www.google.com/maps/dir/?api=1&origin=${enc(HOME.name)}&destination=${enc(dest)}&travelmode=driving`;
  if (stops.length) u += `&waypoints=${enc(stops.join("|"))}`;
  return u;
}
function logUrl(id, name, note = "") {
  const q = new URLSearchParams({ template: "visited.yml", title: `[去過] ${name}`, route: id ? `${id} ${name}` : name, date: ymd(new Date()) });
  if (note) q.set("note", note);
  return `https://github.com/${REPO}/issues/new?${q}`;
}
function skipUrl(id, name) {
  const q = new URLSearchParams({ template: "skip.yml", title: `[不想去] ${name}`, route: id ? `${id} ${name}` : name });
  return `https://github.com/${REPO}/issues/new?${q}`;
}

async function sharePlan({ title, text, hash }) {
  const base = location.href.split("#")[0];
  const url = `${base}${hash}`;
  history.replaceState(history.state, "", hash);
  if (navigator.share) {
    try {
      await navigator.share({ title, text, url });
      return;
    } catch (err) {
      if (err?.name === "AbortError") return;
    }
  }
  try {
    await navigator.clipboard.writeText(`${text}\n${url}`);
    toast("已複製行程與連結，可以直接貼到 LINE！");
  } catch {
    toast(`請複製網址分享：${esc(url)}`);
  }
}

// ---------- 不想去 ----------
// 按下去先在這支手機藏起來（localStorage），再用 GitHub 表單同步成兩支手機都藏（skipped.json）
const HIDE_KEY = "weekend-go-hidden";
function localHidden() {
  try { return new Set(JSON.parse(localStorage.getItem(HIDE_KEY) || "[]")); } catch { return new Set(); }
}
function saveLocalHidden(set) {
  try { localStorage.setItem(HIDE_KEY, JSON.stringify([...set])); } catch {}
}
const syncedHidden = () => new Set(state.skipped.map((s) => (s.route ? `r:${s.route}`
  : s.title.startsWith("表演：") ? `s:${s.title.slice(3).trim()}` : `e:${s.title.replace(/^展覽：/, "").trim()}`)));
const isHidden = (key) => localHidden().has(key) || syncedHidden().has(key);
const routeHidden = (r) => isHidden(`r:${r.id}`);
const eventHidden = (e) => isHidden(`e:${e.title}`);

function toast(html) {
  let el = $("#toast");
  if (!el) { el = document.createElement("div"); el.id = "toast"; el.className = "toast"; document.body.append(el); }
  el.innerHTML = html;
  el.hidden = false;
  clearTimeout(toast.t);
  toast.t = setTimeout(() => { el.hidden = true; }, 9000);
}

function hide(key) {
  const set = localHidden(); set.add(key); saveLocalHidden(set);
  const [kind, val] = [key.slice(0, 1), key.slice(2)];
  const r = kind === "r" && state.routes.find((x) => x.id === val);
  const url = r ? skipUrl(r.id, r.name) : skipUrl("", (kind === "s" ? "表演：" : "展覽：") + val);
  toast(`已在這支手機藏起來。<a href="${url}" target="_blank" rel="noopener">同步到兩支手機 →</a>`);
  state.pickOrder = [];
  if (r && !$("#detail").hidden && state.openSheet?.kind === "r" && state.openSheet.id === r.id) goBack();
  else if (!$("#detail").hidden) {
    document.querySelectorAll("#detail [data-hide]").forEach((b) => { if (b.dataset.hide === key) b.closest(".card")?.remove(); });
  }
  renderAll();
}
function unhide(key) {
  const set = localHidden(); set.delete(key); saveLocalHidden(set);
  if (syncedHidden().has(key)) toast("這個已經同步到兩支手機了。要恢復的話，請 Claude 從 skipped.json 拿掉。");
  renderAll();
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
  state.pickOrder = [];
  const icon = (x) => (x.code >= 95 ? "⛈️" : x.rain ? "🌧️" : x.code >= 45 ? "🌫️" : x.code >= 3 ? "☁️" : x.code >= 1 ? "⛅" : "☀️");
  $("#weather").innerHTML = days.map((x, i) => {
    const dt = new Date(x.date + "T00:00:00");
    const wd = dt.getDay();
    const isWknd = wd === 0 || wd === 6;
    const isTarget = x.date === target.date;
    const label = i === 0 ? "今天" : i === 1 ? "明天" : "週" + WEEK[wd];
    const cls = ["wday", isWknd ? "wknd" : "", isTarget ? "target" : "", x.rain ? "rain" : ""].filter(Boolean).join(" ");
    return `<span class="${cls}"><b>${label}</b> ${icon(x)} ${x.min}–${x.max}° <span class="wpop">${x.pop}%</span></span>`;
  }).join("");
}

// ---------- 推薦 ----------
function lastVisit(id) {
  return state.visited.filter((v) => v.route === id).sort((a, b) => b.date.localeCompare(a.date))[0];
}
// 去過的路線，以及那些路線裡的每個地點、記錄過的展覽，都不再推薦
function visitedSets() {
  const routes = new Set(state.visited.map((v) => v.route).filter(Boolean));
  const places = new Set();
  for (const r of state.routes) if (routes.has(r.id)) r.steps.forEach((s) => places.add(s.q));
  const events = new Set(state.visited.filter((v) => !v.route).map((v) => v.title.replace(/^展覽：/, "").trim()));
  return { routes, places, events };
}
const eventSeen = (e) => visitedSets().events.has(e.title);
const seenPlaces = (r) => { const { places } = visitedSets(); return r.steps.filter((s) => places.has(s.q)); };

const isActiveEvent = (e) => daysUntil(e.end) >= 0;

function nearbyEvents(route, maxKm = 1.2) {
  const spots = route.steps.filter((s) => s.lat);
  const seeSpots = spots.filter((s) => s.kind === "see");
  const stepText = route.steps.map((s) => `${s.title} ${s.q}`).join(" ");
  const night = isNight(route);
  return state.events.reduce((acc, e) => {
    if (!isActiveEvent(e) || eventSeen(e) || eventHidden(e) || daysUntil(e.start) > 0) return acc;
    if (night && (!e.close || e.close < "19:00")) return acc;
    const pt = eventPoint(e);
    if (!pt || !spots.length) return acc;
    const dist = Math.min(...spots.map((s) => kmBetween(s, pt)));
    const v = findVenue(e);
    const sameVenue = (v && v.match.some((m) => stepText.includes(m)))
      || (seeSpots.length > 0 && Math.min(...seeSpots.map((s) => kmBetween(s, pt))) <= 0.4);
    if (sameVenue || dist <= maxKm) acc.push({ e, dist, sameVenue });
    return acc;
  }, []).sort((a, b) =>
    (a.sameVenue ? 0 : 1) - (b.sameVenue ? 0 : 1)
    || (a.dist <= 0.5 ? 0 : 1) - (b.dist <= 0.5 ? 0 : 1)
    || a.e.permanent - b.e.permanent
    || a.e.end.localeCompare(b.e.end)
    || a.dist - b.dist
  ).map((x) => x.e);
}
const rainOk = (r) => r.tags.some((t) => RAIN_OK.includes(t));

function scoreRoute(r) {
  const hasWeather = !!state.weather;
  const rain = state.weather?.target.rain;
  const why = [];
  let s = Math.random() * 10;
  const seen = seenPlaces(r);
  if (seen.length) { s -= 30; why.push(`有 ${seen.length} 個點去過了`); }
  else why.push("全部沒去過");
  if (hasWeather && rain && !rainOk(r)) s -= 40;
  if (hasWeather && rain && rainOk(r)) why.unshift("可能下雨，選了室內的路線");
  if (hasWeather && !rain && (r.tags.includes("戶外") || r.tags.includes("夜景"))) { s += 4; why.unshift("天氣不錯，適合出門"); }
  const ev = nearbyEvents(r).find((e) => !e.permanent && daysUntil(e.end) <= 21);
  if (ev) {
    const left = daysUntil(ev.end);
    s += 8;
    why.push(`順路展覽「${ev.title}」${left === 0 ? "今天最後一天" : `再 ${left} 天就結束`}`);
  }
  if (r.tags.includes("稍遠")) s -= 5;
  return { r, s, why };
}

// 白天半日遊 / 晚上夜遊（type: "night"）；有 season 的路線只在那幾個月出現
const isNight = (r) => r.type === "night";
const inSeason = (r) => !r.season || r.season.includes(new Date().getMonth() + 1);

function renderPickFilters() {
  const filters = ["全部", "30 分內", "雨天OK"];
  $("#pickFilters").innerHTML = filters
    .map((f) => `<button class="${f === state.pickFilter ? "on" : ""}" data-pf="${f}">${f}</button>`).join("");
}

function setPickMode(mode) {
  state.pickMode = mode;
  state.pickOrder = [];
  document.querySelectorAll("[data-mode]").forEach((b) => b.classList.toggle("on", b.dataset.mode === mode));
  renderPickFilters();
  $("#pickOut").innerHTML = "";
  $("#pickBtn").innerHTML = mode === "night" ? `${ico("moon")} 今晚去哪？` : `${ico("dice")} 這次去哪？`;
}

function doPick() {
  if (!state.pickOrder.length || state.pickIdx >= state.pickOrder.length) {
    const done = visitedSets().routes;
    const night = state.pickMode === "night";
    state.pickOrder = state.routes.filter((r) => {
      if (!r.here || isNight(r) !== night || !inSeason(r) || done.has(r.id) || routeHidden(r)) return false;
      if (state.pickFilter === "30 分內" && r.drive > 30) return false;
      if (state.pickFilter === "雨天OK" && !rainOk(r)) return false;
      return true;
    }).map(scoreRoute).sort((a, b) => b.s - a.s);
    state.pickIdx = 0;
  }
  if (!state.pickOrder.length) {
    const msg = state.pickFilter !== "全部"
      ? `「${esc(state.pickFilter)}」目前沒有符合的路線，試試切回「全部」。`
      : "清單上的路線都去過或藏起來了 🎉 跟 Claude 說一聲，請它再整理一批新路線。";
    $("#pickOut").innerHTML = `<div class="card">${msg}</div>`;
    return;
  }
  const { r, why } = state.pickOrder[state.pickIdx++];
  $("#pickOut").innerHTML = `
    <div class="card pick">
      <div class="card-head">
        <div class="why">${esc(why.join("・"))}</div>
        <button class="icon-btn" data-hide="r:${r.id}" title="不想去" aria-label="不想去">${ico("eyeOff")}</button>
      </div>
      <h3>${r.emoji} ${esc(r.name)}</h3>
      <div class="meta">
        <span class="meta-item">${ico("car")} 約 ${r.drive} 分</span>
        <span class="meta-item">${ico("clock")} 建議 ${r.depart} 出發</span>
      </div>
      <p style="margin:8px 0 0;font-size:14px">${esc(r.summary)}</p>
      <div class="row">
        <button class="btn primary grow" data-open="${r.id}">看行程 →</button>
        <button class="btn sm" id="again">${ico("swap")} 換一個</button>
      </div>
    </div>`;
  $("#again").onclick = doPick;
  $("#pickBtn").innerHTML = `${ico("dice")} 再抽一次`;
  if (state.pickMode === "night") {
    const iso = nightDays()[new Date().getHours() >= 20 ? 1 : 0];
    const n = state.shows.filter((s) => s.date === iso && !showHidden(s)).length;
    if (n) {
      $("#pickOut").insertAdjacentHTML("beforeend",
        `<div class="card"><b>${dayLabel(iso, iso === ymd(new Date()) ? 0 : 1)}還有 ${n} 場表演、音樂會</b>
        <div class="small muted" style="margin-top:2px">想看表演的話，夜遊頁可以直接排「晚餐＋表演」</div>
        <div class="row"><button class="btn" data-tab="night">去看看 →</button></div></div>`);
    }
  }
}

// ---------- 卡片 ----------
function routeCard(r) {
  const lv = lastVisit(r.id);
  const seen = lv ? [] : seenPlaces(r);
  return `<div class="card click" data-open="${r.id}">
    <div class="route-head">
      <span class="route-em" aria-hidden="true">${r.emoji}</span>
      <div class="route-body">
        <h3>${esc(r.name)}</h3>
        <div class="meta">
          <span class="meta-item">${ico("car")} 約 ${r.drive} 分</span>
          <span>${esc(r.area)}</span>
          ${isNight(r) ? `<span class="meta-item">${ico("clock")} ${r.depart}</span>` : ""}
          ${r.season && !inSeason(r) ? `<span class="badge">只在 ${r.season.join("、")} 月</span>` : ""}
          ${lv ? `<span class="visited">${ico("check")} 去過 ${lv.date}</span>` : ""}
          ${seen.length ? `<span class="badge">含去過的點：${esc(seen.map((s) => s.title).join("、"))}</span>` : ""}
        </div>
        <div class="tags">${r.tags.map((t) => `<span class="tag">${esc(t)}</span>`).join("")}</div>
      </div>
      <span class="route-chev">${ico("chev")}</span>
    </div>
  </div>`;
}

function eventCard(e, extraNote = "") {
  const left = daysUntil(e.end), notYet = daysUntil(e.start);
  const badge = eventSeen(e) ? `<span class="visited">${ico("check")} 看過了</span>`
    : left < 0 ? `<span class="badge">已結束</span>`
    : notYet > 0 ? `<span class="badge">${notYet} 天後開展</span>`
    : !e.permanent && left === 0 ? `<span class="badge">今天最後一天</span>`
    : !e.permanent && left <= 14 ? `<span class="badge">剩 ${left} 天</span>` : "";
  const dest = e.address || e.place;
  const hidden = eventHidden(e);
  const free = /免費|免門票|不收費/.test(e.price);
  const priceLine = e.price && !free ? `<div class="meta" style="margin-top:3px"><span class="meta-item">${ico("ticket")} ${esc(e.price.slice(0, 52))}</span></div>` : "";
  return `<div class="card">
    <div class="card-head">
      <h3>${esc(e.title)}</h3>
      ${hidden
        ? `<button class="icon-btn" data-unhide="e:${esc(e.title)}" title="恢復顯示" aria-label="恢復顯示">${ico("undo")}</button>`
        : `<button class="icon-btn" data-hide="e:${esc(e.title)}" title="不想去" aria-label="不想去">${ico("eyeOff")}</button>`}
    </div>
    <div class="meta">
      <span class="meta-item">${ico("pin")} ${esc(e.place)}</span>
      ${minOf(e) ? `<span class="meta-item">${ico("car")} 約 ${minOf(e)} 分</span>` : ""}
      <span class="meta-item">${ico("calendar")} ${e.permanent ? "常設展" : `${e.start.slice(5).replace("-", "/")}–${e.end.slice(5).replace("-", "/")}`}</span>
      ${free ? `<span class="tag hot">免費</span>` : ""}
      ${badge}
    </div>
    ${priceLine}
    ${extraNote ? `<div class="more-hint">${esc(extraNote)}</div>` : ""}
    <div class="ev-actions">
      <button class="btn primary" data-plan="${esc(e.id)}">${ico("route")} 排半日遊</button>
      <a class="btn sm" href="${navUrl(dest)}" target="_blank" rel="noopener">${ico("nav")} 導航</a>
      <a class="btn sm" href="${esc(e.url || "https://www.google.com/search?q=" + enc(e.title))}" target="_blank" rel="noopener">${ico("ext")} 資訊</a>
      <a class="btn sm" href="${logUrl("", "展覽：" + e.title)}" target="_blank" rel="noopener">${ico("check")} 去了</a>
    </div>
  </div>`;
}

// ---------- 行程詳情 ----------
let historyDepth = 0;
function pushSheet(hash) {
  historyDepth++;
  history.pushState({ depth: historyDepth }, "", hash);
}
function goBack() {
  if (historyDepth > 0) history.back();
  else {
    history.replaceState(null, "", location.pathname + location.search);
    closeRoute();
  }
}

function toMin(hhmm) { const [h, m] = hhmm.split(":").map(Number); return h * 60 + m; }
function fmt(min) { min = ((min % 1440) + 1440) % 1440; return `${pad(Math.floor(min / 60))}:${pad(min % 60)}`; }
const KIND = { see: "🖼️", show: "🎭", eat: "🍜", walk: "🚶", view: "🌄", fun: "✨", shop: "🛍️" };

function renderTimeline(r, start) {
  let t = toMin(start);
  const items = r.steps.map((s, i) => {
    t += s.drive;
    const arrive = t;
    t += s.stay;
    const driveTxt = s.drive ? `${i === 0 ? `從${HOME.label}` : ""}開車約 ${s.drive} 分` : i ? "走路過去" : "";
    return `<li>
      <span class="t">${fmt(arrive)}</span><span class="dot"></span>
      ${driveTxt ? `<div class="drive">${driveTxt}</div>` : ""}
      <h4>${KIND[s.kind] || "📍"} ${esc(s.title)}</h4>
      <div class="drive">待約 ${s.stay} 分</div>
      <p>${esc(s.detail)}</p>
      <div class="links">
        ${s.drive ? `<a href="${navUrl(s.q)}" target="_blank" rel="noopener">${ico("nav")} 導航</a><a href="${searchUrl(s.q + " 附近停車場")}" target="_blank" rel="noopener">${ico("parking")} 找停車</a>` : i ? `<a href="${walkNavUrl(s.q)}" target="_blank" rel="noopener">${ico("walk")} 步行導航</a>` : ""}
        <a href="${searchUrl(s.q)}" target="_blank" rel="noopener">${ico("map")} 地圖・營業時間</a>
        ${s.swap ? `<a href="#" data-swap="${s.swap}">${ico("swap")} 換一${s.swap === "eat" ? "家" : "個"}</a>` : ""}
      </div>
    </li>`;
  });
  items.push(`<li><span class="t">${fmt(t + r.drive)}</span><span class="dot"></span><h4>🏠 回到${HOME.label}</h4><div class="drive">回程約 ${r.drive} 分（塞車的話會更久）</div></li>`);
  return items.join("");
}

function openRoute(id, push = true, opts = {}) {
  const r = state.routes.find((x) => x.id === id);
  if (!r) return;
  const initDepart = /^\d\d:\d\d$/.test(opts.t || "") ? opts.t : r.depart;
  if (push) pushSheet(`#r/${id}`);
  state.openSheet = { kind: "r", id };
  const now = new Date();
  const soon = Math.ceil((now.getHours() * 60 + now.getMinutes() + 10) / 15) * 15;
  const evs = nearbyEvents(r).slice(0, 6);
  const visits = state.visited.filter((v) => v.route === id);
  const el = $("#detail");
  el.innerHTML = `<div class="sheet-in">
    <div class="close">
      <button class="close-btn" id="closeBtn">${ico("back")} 返回</button>
      <span class="close-sub">${esc(r.area)}</span>
      <button class="share-btn" id="shareBtn">${ico("share")} 分享</button>
    </div>
    <h2 class="sheet-title">${r.emoji} ${esc(r.name)}</h2>
    <div class="tags">${r.tags.map((t) => `<span class="tag">${esc(t)}</span>`).join("")}</div>
    <p class="sheet-desc">${esc(r.summary)}</p>
    <a class="btn primary full" href="${fullRouteUrl(r)}" target="_blank" rel="noopener">${ico("nav")} 整條路線一鍵導航</a>
    <div class="depart">
      <span class="depart-lbl">${ico("clock")} 幾點出發</span>
      <input type="time" id="departAt" value="${initDepart}" step="900">
      <button class="btn" id="nowBtn">現在出發</button>
    </div>
    <ol class="timeline" id="tl">${renderTimeline(r, initDepart)}</ol>
    ${evs.length ? `<h3 class="sec">順路展覽</h3>${evs.map((e) => eventCard(e)).join("")}` : ""}
    ${isNight(r) ? (() => {
      const pt = r.steps.find((x) => x.lat);
      const near = pt ? state.spots.filter((sp) => r.steps.some((x) => x.lat && kmBetween(x, sp) <= 2)) : [];
      return near.length ? `<h3 class="sec">附近晚上還開的店</h3>${near.map(spotCard).join("")}` : "";
    })() : ""}
    ${r.tips?.length ? `<h3 class="sec">小提醒</h3><ul class="tips">${r.tips.map((t) => `<li>${esc(t)}</li>`).join("")}<li>店家營業時間可能會變，點「地圖・營業時間」確認</li></ul>` : ""}
    <h3 class="sec">紀錄</h3>
    ${visits.length ? visits.map((v) => `<div class="card"><b>${v.date}</b> ${esc(v.rating || "")}<div class="small">${esc(v.note || "")}</div></div>`).join("") : `<p class="muted small">還沒去過</p>`}
    <a class="btn full" href="${logUrl(r.id, r.name)}" target="_blank" rel="noopener">${ico("check")} 我們去了，記錄一下</a>
    ${routeHidden(r)
      ? `<button class="btn ghost full" style="margin-top:8px" data-unhide="r:${r.id}">${ico("undo")} 恢復這條路線</button>`
      : `<button class="btn ghost full" style="margin-top:8px" data-hide="r:${r.id}">${ico("eyeOff")} 不想去，不要再推薦</button>`}
  </div>`;
  el.hidden = false;
  el.scrollTop = 0;
  document.body.style.overflow = "hidden";
  const input = $("#departAt");
  input.oninput = () => { if (input.value) $("#tl").innerHTML = renderTimeline(r, input.value); };
  $("#nowBtn").onclick = () => { input.value = fmt(soon); input.oninput(); };
  $("#closeBtn").onclick = goBack;
  $("#shareBtn").onclick = () => {
    const t = input.value || r.depart;
    const q = new URLSearchParams({ from: HOME.id, t });
    sharePlan({
      title: `週末去哪｜${r.name}`,
      text: `${r.emoji} ${r.name}\n${t} 從${HOME.label}出發（車程約 ${r.drive} 分）`,
      hash: `#r/${id}?${q}`,
    });
  };
}
// ---------- 展覽排成半日遊 ----------
// 依展覽所在場館，從 venues.json 挑散步點和吃的，照時間排順序：11:00–12:30 到就先吃午餐
function findVenue(e) {
  if (!e) return null;
  const vs = state.venues;
  const place = e.place || "", address = e.address || "";
  return vs.find((v) => v.match.some((m) => place.includes(m)))
    || vs.find((v) => v.match.some((m) => address.includes(m)))
    || (e.lat ? vs.find((v) => kmBetween(v, e) <= 1) : null);
}
const ate = (name) => state.visited.some((v) => (v.note || "").includes(name) || v.title.includes(name));
function mealAt(min) {
  if (min < 630) return "早餐";
  if (min < 840) return "午餐";
  if (min < 1020) return "點心";
  if (min < 1230) return "晚餐";
  return "點心";
}
function choose(list, idx, fits) {
  let c = list.filter(fits);
  if (!c.length) c = list;
  c = [...c.filter((x) => !ate(x.name)), ...c.filter((x) => ate(x.name))];
  return c.length ? c[idx % c.length] : null;
}
function eatStep(venue, e, meal, idx, drive, walk = null) {
  // 先排有供應這一餐的店；點心時段再接著排其他店（只賣早餐的不排）
  const foods = venue ? state.foods[venue.food] || [] : [];
  const fit = foods.filter((x) => x.meals.includes(meal));
  const extra = meal === "點心" ? foods.filter((x) => !fit.includes(x) && x.meals.some((m) => m !== "早餐")) : [];
  const f = choose(fit.concat(extra), idx, () => true);
  if (!f) {
    return { kind: "eat", title: `${meal}：附近找吃的`, q: `${e.place} 附近 小吃`, drive, fromVenueDrive: 0, stay: 50,
      detail: "這個場館附近還沒整理過在地老店，先用地圖找評價高、不是連鎖的店。想固定推薦的話，跟 Claude 說一聲。" };
  }
  // 如果前一站散步點跟這家店在同一個區域（zone 相同），就不用再從場館重複算一次車程
  let hop = f.drive || 0;
  if (walk) {
    if (walk.zone && f.zone === walk.zone) hop = f.walkDrive ?? 0;
    else if (walk.drive > 0 && !hop) hop = walk.drive;
  }
  return { kind: "eat", title: `${meal}：${f.name}`, name: f.name, q: f.q, drive: drive + hop, fromVenueDrive: f.drive || 0, stay: f.stay,
    detail: f.detail + (ate(f.name) ? "（之前吃過）" : ""), swap: "eat" };
}
function buildPlan(e, venue, start, sel) {
  const drive0 = minOf(e) ?? (venue ? Math.round(5 + kmBetween(HOME, venue) * 1.6) : 40);
  const exhibit = { kind: "see", title: e.title, q: e.address || e.place, drive: drive0, stay: 90,
    detail: `📍 ${e.place}${e.price ? `｜🎟️ ${e.price.slice(0, 50)}` : ""}${venue ? `｜🅿️ 可以停 ${venue.parking}` : ""}` };
  const w = venue && choose(venue.walks, sel.walk, () => true);
  const walk = w && { kind: "walk", title: w.name, name: w.name, q: w.q, drive: w.drive, stay: w.stay, zone: w.zone, detail: w.detail, swap: "walk" };
  const arrive = toMin(start) + drive0;
  if (arrive >= 660 && arrive <= 750) {
    const eat = eatStep(venue, e, "午餐", sel.eat, 0);
    const back = eat.fromVenueDrive ?? eat.drive;
    eat.drive = drive0 + back;
    return { drive: drive0, steps: [eat, { ...exhibit, drive: back }, walk].filter(Boolean) };
  }
  const afterWalk = arrive + exhibit.stay + (walk ? walk.drive + walk.stay : 0);
  return { drive: drive0, steps: [exhibit, walk, eatStep(venue, e, mealAt(afterWalk), sel.eat, 0, walk)].filter(Boolean) };
}

function exhibitClosingWarning(e, plan, start) {
  let t = toMin(start), arrive = null;
  for (const s of plan.steps) {
    t += s.drive;
    if (s.kind === "see") { arrive = t; break; }
    t += s.stay;
  }
  if (arrive == null) return "";
  if (e.close) {
    const closeMin = toMin(e.close);
    if (arrive >= closeMin) return `⚠️ 這樣抵達時已過關門時間（${e.close}），建議提早出發！`;
    if (arrive + 90 > closeMin) return `⚠️ 展覽大約 ${e.close} 關門，這樣看展時間只剩約 ${closeMin - arrive} 分，建議提早一點出發。`;
  } else if (arrive >= 16 * 60 + 30) {
    return `⚠️ 大多數展館約 17:00–18:00 關門，建議提早一點出發，或先點「展覽資訊」確認開放時間。`;
  }
  return "";
}

function openPlan(id, push = true, opts = {}) {
  const e = state.events.find((x) => x.id === id);
  if (!e) return;
  if (push) pushSheet(`#e/${enc(id)}`);
  state.openSheet = { kind: "e", id };
  const venue = findVenue(e);
  const sel = { eat: Number(opts.eat) || 0, walk: Number(opts.walk) || 0 };
  const initDepart = /^\d\d:\d\d$/.test(opts.t || "") ? opts.t : "13:00";
  const now = new Date();
  const soon = Math.ceil((now.getHours() * 60 + now.getMinutes() + 10) / 15) * 15;
  const others = state.events.filter((x) => x.id !== id && isActiveEvent(x) && !eventHidden(x) && !eventSeen(x) && daysUntil(x.start) <= 0
    && (venue ? findVenue(x) === venue : x.place === e.place));
  const el = $("#detail");
  el.innerHTML = `<div class="sheet-in">
    <div class="close">
      <button class="close-btn" id="closeBtn">${ico("back")} 返回</button>
      <span class="close-sub">${esc(venue ? venue.name : e.place)}</span>
      <button class="share-btn" id="shareBtn">${ico("share")} 分享</button>
    </div>
    <h2 class="sheet-title">${esc(e.title)}</h2>
    <div class="meta">
      <span class="meta-item">${ico("calendar")} ${e.permanent ? "常設展" : `展到 ${e.end.slice(5).replace("-", "/")}`}</span>
      ${e.close ? `<span class="meta-item">${ico("clock")} 開放至 ${e.close}</span>` : ""}
      ${e.url ? `<a class="meta-item" href="${esc(e.url)}" target="_blank" rel="noopener">${ico("ext")} 展覽資訊</a>` : ""}
    </div>
    ${e.desc ? `<p class="small muted" style="margin:8px 0 0;line-height:1.6">${esc(e.desc)}</p>` : ""}
    ${venue ? "" : `<div class="warn-box" style="margin-top:10px">這個場館附近還沒整理過，吃的部分先用地圖搜尋。</div>`}
    <a class="btn primary full" style="margin-top:12px" id="planNav" target="_blank" rel="noopener">${ico("nav")} 整條路線一鍵導航</a>
    <div class="depart">
      <span class="depart-lbl">${ico("clock")} 幾點出發</span>
      <input type="time" id="departAt" value="${initDepart}" step="900">
      <button class="btn" id="nowBtn">現在出發</button>
    </div>
    <div id="planWarn"></div>
    <ol class="timeline" id="tl"></ol>
    ${others.length ? `<h3 class="sec">同一區還有 ${others.length} 檔，可以一起看</h3>${others.slice(0, 6).map((x) => eventCard(x)).join("")}` : ""}
    <h3 class="sec">小提醒</h3>
    <ul class="tips"><li>按「換一家」可以換吃的和散步點，吃過的店會排在後面</li><li>店家營業時間可能會變，點「地圖・營業時間」確認</li></ul>
    <a class="btn full" id="planLog" target="_blank" rel="noopener">${ico("check")} 我們去了，記錄一下</a>
  </div>`;
  el.hidden = false;
  el.scrollTop = 0;
  document.body.style.overflow = "hidden";
  const input = $("#departAt");
  let lastPlan = null;
  const draw = () => {
    if (!input.value) return;
    lastPlan = buildPlan(e, venue, input.value, sel);
    const warn = exhibitClosingWarning(e, lastPlan, input.value);
    $("#planWarn").innerHTML = warn ? `<div class="warn-box">${esc(warn)}</div>` : "";
    $("#tl").innerHTML = renderTimeline(lastPlan, input.value);
    $("#planNav").href = fullRouteUrl(lastPlan);
    const note = "排的行程：" + lastPlan.steps.map((s) => s.name || s.title).join(" → ");
    $("#planLog").href = logUrl("", "展覽：" + e.title, note);
  };
  input.oninput = draw;
  $("#nowBtn").onclick = () => { input.value = fmt(soon); draw(); };
  $("#closeBtn").onclick = goBack;
  $("#shareBtn").onclick = () => {
    const t = input.value || "13:00";
    const q = new URLSearchParams({ from: HOME.id, t, eat: sel.eat, walk: sel.walk });
    const summary = lastPlan ? lastPlan.steps.map((s) => s.name || s.title).join(" → ") : e.title;
    sharePlan({
      title: `週末看展｜${e.title}`,
      text: `🖼️ ${e.title}\n${t} 從${HOME.label}出發：${summary}`,
      hash: `#e/${enc(id)}?${q}`,
    });
  };
  $("#tl").onclick = (ev) => {
    const b = ev.target.closest("[data-swap]");
    if (!b) return;
    ev.preventDefault();
    sel[b.dataset.swap]++;
    draw();
  };
  draw();
}

function closeRoute() {
  state.openSheet = null;
  $("#detail").hidden = true;
  document.body.style.overflow = "";
}
function openFromHash() {
  const [path, qs] = location.hash.split("?");
  const params = new URLSearchParams(qs || "");
  const from = params.get("from");
  if (from && ORIGINS[from] && HOME.id !== from) setOrigin(from, false);
  const opts = Object.fromEntries(params.entries());
  const r = path.match(/^#r\/(\w+)/);
  const e = path.match(/^#e\/(.+)/);
  const s = path.match(/^#s\/(.+)/);
  if (r) openRoute(r[1], false, opts);
  else if (e) openPlan(decodeURIComponent(e[1]), false, opts);
  else if (s) openShowPlan(decodeURIComponent(s[1]), false, opts);
  else closeRoute();
}
window.addEventListener("popstate", () => {
  if (historyDepth > 0) historyDepth--;
  openFromHash();
});

// ---------- 列表 ----------
const ROUTE_TABS = {
  day: { chips: "#routeChips", list: "#routeList", filters: ["全部", "看展", "美食", "雨天OK", "近", "夕陽"] },
  night: { chips: "#nightChips", list: "#nightList", filters: ["全部", "夜市", "夜景", "近", "雨天OK", "季節限定"] },
};
function renderRoutes() {
  for (const [type, cfg] of Object.entries(ROUTE_TABS)) {
    // 去過的路線預設藏起來，要看就點「✓ 去過的」
    const filters = [...cfg.filters, "✓ 去過的", "🙈 不想去的"];
    const f = state.routeFilter[type];
    $(cfg.chips).innerHTML = filters.map((x) => `<button class="${x === f ? "on" : ""}" data-rf="${type}|${x}">${x}</button>`).join("");
    const done = visitedSets().routes;
    const list = state.routes.filter((r) => {
      if (isNight(r) !== (type === "night")) return false;
      if (!r.here && !["✓ 去過的", "🙈 不想去的"].includes(f)) return false;
      if (f === "✓ 去過的") return done.has(r.id);
      if (f === "🙈 不想去的") return routeHidden(r);
      if (done.has(r.id) || routeHidden(r)) return false;
      if (f === "季節限定") return !!r.season;
      if (!inSeason(r)) return false;
      if (f === "全部") return true;
      if (f === "雨天OK") return rainOk(r);
      return r.tags.includes(f);
    }).sort((a, b) => seenPlaces(a).length - seenPlaces(b).length || a.drive - b.drive);
    $(cfg.list).innerHTML = list.map(routeCard).join("")
      || `<div class="empty">${f === "✓ 去過的" ? "還沒有去過的路線" : f === "🙈 不想去的" ? "沒有藏起來的路線" : "沒有符合的路線"}</div>`;
  }
}

function renderEvents() {
  const filters = ["全部", "30 分內", "快結束", "免費", "新開展", "🙈 不想去的"];
  $("#evChips").innerHTML = filters.map((f) => `<button class="${f === state.evFilter ? "on" : ""}" data-ef="${f}">${f}</button>`).join("");
  const q = $("#evSearch").value.trim().toLowerCase();
  const list = state.events.filter((e) => {
    if (!isActiveEvent(e)) return false;
    if (q && !`${e.title} ${e.place} ${e.address} ${e.desc || ""}`.toLowerCase().includes(q)) return false;
    if (state.evFilter === "🙈 不想去的") return eventHidden(e);
    if (eventHidden(e)) return false;
    if (state.evHidePerm && e.permanent && state.evFilter !== "快結束") return false;
    switch (state.evFilter) {
      case "30 分內": return minOf(e) && minOf(e) <= 30;
      case "快結束": return !e.permanent && daysUntil(e.end) <= 14 && daysUntil(e.start) <= 0;
      case "免費": return /免費|免門票|不收費/.test(e.price);
      case "新開展": return daysUntil(e.start) > -14;
      default: return true;
    }
  });
  if (state.evSort === "near") {
    list.sort((a, b) => (minOf(a) ?? 999) - (minOf(b) ?? 999) || a.permanent - b.permanent || a.end.localeCompare(b.end));
  }
  $("#evBar").innerHTML = `
    <span>共 ${list.length} 檔</span>
    <div class="tool-btns">
      <button class="tool-btn ${state.evSort === "near" ? "on" : ""}" data-evsort="1">${ico("sort")} ${state.evSort === "near" ? "離我最近" : "快結束優先"}</button>
      <button class="tool-btn ${state.evHidePerm ? "on" : ""}" data-evperm="1">${state.evHidePerm ? "僅看特展" : "含常設展"}</button>
    </div>`;
  $("#evList").innerHTML = list.map((e) => eventCard(e)).join("") || `<div class="empty">沒有符合的展覽</div>`;
  // 還沒有周邊資料的場館，列出來方便請 Claude 補
  const missing = [...new Set(state.events.filter((e) => isActiveEvent(e) && !findVenue(e)).map((e) => e.place.split(/\s/)[0]))];
  $("#evMissing").textContent = missing.length ? `這些場館附近還沒整理吃的（排行程時會先用地圖搜尋代替）：${missing.join("、")}` : "";
}

function renderEndingSoon() {
  // 同場館最多露出 1 檔，避免首頁 3 格全被同一間展館洗版
  const all = state.events
    .filter((e) => isActiveEvent(e) && !e.permanent && !eventSeen(e) && !eventHidden(e) && daysUntil(e.start) <= 0 && daysUntil(e.end) <= 21)
    .sort((a, b) => a.end.localeCompare(b.end));
  const counts = {};
  for (const e of all) {
    const k = findVenue(e)?.id || e.place.split(/\s/)[0];
    counts[k] = (counts[k] || 0) + 1;
  }
  const picked = [], seenV = new Set();
  for (const e of all) {
    const k = findVenue(e)?.id || e.place.split(/\s/)[0];
    if (seenV.has(k)) continue;
    seenV.add(k);
    picked.push({ e, extra: counts[k] > 1 ? `同場館還有 ${counts[k] - 1} 檔也快結束` : "" });
    if (picked.length >= 3) break;
  }
  $("#endingSoon").innerHTML = picked.map(({ e, extra }) => eventCard(e, extra)).join("")
    || `<p class="muted small">最近沒有快結束的展覽</p>`;
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

// ---------- 夜遊：表演、晚上還開的展覽、吃喝逛 ----------
const DINNER_KINDS = ["餐酒館", "餐廳", "居酒屋"];
const AFTER_KINDS = ["酒吧", "書店", "小店"];
const dowOf = (iso) => new Date(iso + "T00:00:00").getDay();
const showHidden = (s) => isHidden(`s:${s.title}`);
const hhmmToMin = (s) => toMin(s);

// 日期選項：今晚、兩週內的週五／六／日，以及有表演的平日
function nightDays() {
  const out = new Set();
  const todayIso = ymd(today());
  for (let i = 0; i <= 14; i++) {
    const d = today(); d.setDate(d.getDate() + i);
    if (i === 0 || [5, 6, 0].includes(d.getDay())) out.add(ymd(d));
  }
  for (const s of state.shows || []) {
    if (s.date >= todayIso && !showHidden(s)) out.add(s.date);
  }
  return [...out].sort();
}
const dayLabel = (iso, i) => (i === 0 && iso === ymd(new Date()) ? "今晚" : `週${WEEK[dowOf(iso)]} ${iso.slice(5).replace("-", "/")}`);

const spotOpen = (sp, iso) => !(sp.closed || []).includes(dowOf(iso));
function spotsNear(pt, kinds, iso, maxKm = 3) {
  if (!pt?.lat) return [];
  return state.spots.filter((sp) => kinds.includes(sp.kind) && spotOpen(sp, iso) && kmBetween(pt, sp) <= maxKm)
    .sort((a, b) => kmBetween(pt, a) - kmBetween(pt, b));
}
// 表演場地的座標：資料有就用，沒有就看是不是已知場館
function showPoint(s) {
  if (s.lat) return s;
  const v = findVenue({ place: s.place, address: s.address, lat: null });
  return v || null;
}

function showCard(s) {
  const hidden = showHidden(s);
  return `<div class="card">
    <div class="card-head">
      <div>
        <div class="meta" style="margin-top:0"><span class="badge">${s.times.join("、")} 開演</span><span class="tag">${esc(s.cat)}</span></div>
        <h3 style="margin-top:5px">${esc(s.title)}</h3>
      </div>
      ${hidden
        ? `<button class="icon-btn" data-unhide="s:${esc(s.title)}" title="恢復顯示" aria-label="恢復顯示">${ico("undo")}</button>`
        : `<button class="icon-btn" data-hide="s:${esc(s.title)}" title="不想去" aria-label="不想去">${ico("eyeOff")}</button>`}
    </div>
    <div class="meta">
      <span class="meta-item">${ico("pin")} ${esc(s.place)}</span>
      ${minOf(s) ? `<span class="meta-item">${ico("car")} 約 ${minOf(s)} 分</span>` : ""}
    </div>
    ${s.price ? `<div class="meta" style="margin-top:3px"><span class="meta-item">${ico("ticket")} ${esc(s.price)}</span></div>` : ""}
    <div class="ev-actions">
      <button class="btn primary" data-show="${esc(s.id)}">${ico("moon")} 排成夜遊</button>
      <a class="btn sm" href="${navUrl(s.address || s.place)}" target="_blank" rel="noopener">${ico("nav")} 導航</a>
      <a class="btn sm" href="${esc(s.url || "https://www.google.com/search?q=" + enc(s.title))}" target="_blank" rel="noopener">${ico("ext")} 售票</a>
    </div>
  </div>`;
}

function spotCard(sp) {
  const drv = minOf(sp);
  return `<div class="card">
    <div class="meta" style="margin-top:0">
      <span class="tag">${esc(sp.kind)}</span>
      <span>${esc(sp.area)}</span>
      ${drv ? `<span class="meta-item">${ico("car")} 約 ${drv} 分</span>` : ""}
      <span class="meta-item">${ico("clock")} ${sp.open}–${sp.close > "24:00" ? "凌晨 " + fmt(toMin(sp.close)) : sp.close}</span>
    </div>
    <h3 style="margin-top:6px">${esc(sp.name)}</h3>
    <div class="small muted" style="margin-top:4px">${esc(sp.detail)}</div>
    <div class="row">
      <a class="btn sm grow" href="${navUrl(sp.q)}" target="_blank" rel="noopener">${ico("nav")} 導航</a>
      <a class="btn sm grow" href="${searchUrl(sp.q)}" target="_blank" rel="noopener">${ico("map")} 地圖・營業時間</a>
    </div>
  </div>`;
}

function renderNight() {
  const days = nightDays();
  if (!state.nightDate || !days.includes(state.nightDate)) {
    state.nightDate = new Date().getHours() >= 20 ? days[1] || days[0] : days[0];
  }
  const iso = state.nightDate;
  const showCounts = {};
  for (const s of state.shows) if (!showHidden(s)) showCounts[s.date] = (showCounts[s.date] || 0) + 1;
  $("#nightDays").innerHTML = days.map((d, i) => {
    const cnt = showCounts[d] || 0;
    return `<button class="${d === iso ? "on" : ""}" data-nd="${d}">${dayLabel(d, i)}${cnt ? `<span class="cnt">${cnt}</span>` : ""}</button>`;
  }).join("");

  const shows = state.shows.filter((s) => s.date === iso && !showHidden(s));
  const list = state.showAll ? shows : shows.slice(0, 8);
  $("#showList").innerHTML = (list.map(showCard).join("") || `<p class="muted small">這晚沒有查到 5 點以後的表演</p>`)
    + (shows.length > list.length ? `<button class="btn full" data-more="1">再看 ${shows.length - list.length} 場</button>` : "");

  // 晚上 7 點以後還開的展覽（資料裡有寫關門時間的才算得出來）
  const late = state.events.filter((e) => e.close && e.close >= "19:00" && e.start <= iso && e.end >= iso && !eventHidden(e));
  $("#nightExhibits").innerHTML = late.length ? `<h2 class="sec">晚上還開的展覽</h2>${late.map((e) => eventCard(e)).join("")}` : "";

  const filters = ["全部", "吃晚餐", "酒吧", "書店・小店"];
  const f = state.spotFilter || "全部";
  $("#spotChips").innerHTML = filters.map((x) => `<button class="${x === f ? "on" : ""}" data-sf="${x}">${x}</button>`).join("");
  const spots = state.spots.filter((sp) => spotOpen(sp, iso) && (f === "全部"
    || (f === "吃晚餐" && DINNER_KINDS.includes(sp.kind)) || (f === "酒吧" && sp.kind === "酒吧")
    || (f === "書店・小店" && ["書店", "小店"].includes(sp.kind))))
    .sort((a, b) => (minOf(a) ?? 999) - (minOf(b) ?? 999));
  $("#spotList").innerHTML = spots.map(spotCard).join("") || `<p class="muted small">這晚沒有符合的店（可能剛好公休）</p>`;
}

// 晚餐候選：附近晚上有開的餐酒館／餐廳，再加上附近場館周邊有賣晚餐的在地店
// 依離場地的距離排序，近的先；要在 from–to 這段時間都有開
function dinnerOptions(pt, iso, from, to) {
  if (!pt) return [];
  const opts = spotsNear(pt, DINNER_KINDS, iso)
    .filter((sp) => toMin(sp.open) <= from && toMin(sp.close) >= to)
    .map((sp) => ({ name: sp.name, q: sp.q, stay: 75, detail: sp.detail, km: kmBetween(pt, sp) }));
  const v = state.venues.filter((x) => kmBetween(x, pt) <= 2).sort((a, b) => kmBetween(a, pt) - kmBetween(b, pt))[0];
  for (const f of (v && state.foods[v.food]) || []) {
    if (f.meals.includes("晚餐")) {
      opts.push({ name: f.name, q: f.q, stay: Math.max(f.stay, 45), detail: f.detail, km: kmBetween(v, pt) + (f.drive || 0) / 4 });
    }
  }
  return opts.sort((a, b) => a.km - b.km);
}
function dinnerStep(opts, sel, s, drive) {
  const list = [...opts.filter((o) => !ate(o.name)), ...opts.filter((o) => ate(o.name))];
  const pick = list.length ? list[sel.eat % list.length] : null;
  if (!pick) {
    return { kind: "eat", title: "晚餐：附近找吃的", q: `${s.place} 附近 餐廳`, drive, stay: 60,
      detail: "這個場地附近還沒整理過晚上的店，先用地圖找評價高、不是連鎖的店。" };
  }
  return { kind: "eat", title: `晚餐：${pick.name}`, name: pick.name, q: pick.q, stay: pick.stay, swap: "eat",
    drive: drive + (pick.km > 0.8 ? 10 : 0), detail: pick.detail + (ate(pick.name) ? "（之前吃過）" : "") };
}

// 18:30 以後開演：先吃晚餐再看；比較早開演：先看，散場再吃
function buildShowPlan(s, time, sel) {
  const pt = showPoint(s);
  const start = toMin(time);
  const end = start + 120;
  const drive0 = minOf(s) ?? (pt ? Math.round(5 + kmBetween(HOME, pt) * 1.6) : 40);
  const show = { kind: "show", title: `${time} 開演：${s.title}`, name: s.title, q: s.address || s.place, drive: drive0, stay: 15 + 120,
    detail: `📍 ${s.place}｜提早 15 分鐘進場，演出長度先抓 2 小時（以售票頁為準）。${s.price ? "🎟️ " + s.price : ""}` };
  const early = start < 18 * 60 + 30;
  let steps, departMin;
  if (early) {
    const dinner = dinnerStep(dinnerOptions(pt, s.date, end + 10, end + 85), sel, s, 0);
    steps = [show, dinner];
    departMin = start - 15 - drive0;
  } else {
    const dinner = dinnerStep(dinnerOptions(pt, s.date, start - 105, start - 25), sel, s, drive0);
    const toShow = dinner.drive - drive0;
    dinner.drive = drive0;
    show.drive = toShow;
    steps = [dinner, show];
    departMin = start - 15 - toShow - dinner.stay - drive0;
  }
  // 散場後還開著的酒吧或小店（回到家不超過 23:30 才排）
  const free = early ? end + 10 + steps[1].drive + steps[1].stay : end;
  const after = spotsNear(pt, AFTER_KINDS, s.date, 2).filter((sp) => toMin(sp.close) >= free + 45);
  if (after.length && free + 45 + drive0 <= 23 * 60 + 30) {
    const a = after[sel.after % after.length];
    steps.push({ kind: a.kind === "酒吧" ? "fun" : "shop", title: `散場後（選擇）：${a.name}`, name: a.name, q: a.q, drive: 0, stay: 45,
      detail: a.detail, swap: "after" });
  }
  return { drive: drive0, steps, depart: fmt(Math.floor(departMin / 5) * 5) };
}

function openShowPlan(id, push = true, opts = {}) {
  const s = state.shows.find((x) => x.id === id);
  if (!s) return;
  if (push) pushSheet(`#s/${enc(id)}`);
  state.openSheet = { kind: "s", id };
  const initTime = s.times.includes(opts.time) ? opts.time : s.times[0];
  const sel = { eat: Number(opts.eat) || 0, after: Number(opts.after) || 0, time: initTime };
  const el = $("#detail");
  el.innerHTML = `<div class="sheet-in">
    <div class="close">
      <button class="close-btn" id="closeBtn">${ico("back")} 返回</button>
      <span class="close-sub">${esc(s.place)}</span>
      <button class="share-btn" id="shareBtn">${ico("share")} 分享</button>
    </div>
    <h2 class="sheet-title">${esc(s.title)}</h2>
    <div class="meta">
      <span class="tag">${esc(s.cat)}</span>
      <span class="meta-item">${ico("calendar")} ${s.date.slice(5).replace("-", "/")}（週${WEEK[dowOf(s.date)]}）</span>
      <a class="meta-item" href="${esc(s.url || "https://www.google.com/search?q=" + enc(s.title))}" target="_blank" rel="noopener">${ico("ext")} 售票・資訊</a>
    </div>
    ${s.times.length > 1 ? `<div class="depart"><span class="depart-lbl">場次</span><select id="showTime">${s.times.map((t) => `<option ${t === initTime ? "selected" : ""}>${t}</option>`).join("")}</select></div>` : ""}
    <p class="small muted" style="margin:8px 0 0">記得先買票。時間表是從開演時間往回推算出發時間。</p>
    <div class="depart" id="departTip"></div>
    <a class="btn primary full" id="planNav" target="_blank" rel="noopener">${ico("nav")} 整條路線一鍵導航</a>
    <ol class="timeline" id="tl" style="margin-top:14px"></ol>
    <h3 class="sec">小提醒</h3>
    <ul class="tips"><li>按「換一家」可以換晚餐或散場後的去處</li><li>店家營業時間是從文章查的，點「地圖・營業時間」確認</li></ul>
    <a class="btn full" id="planLog" target="_blank" rel="noopener">${ico("check")} 我們去了，記錄一下</a>
  </div>`;
  el.hidden = false;
  el.scrollTop = 0;
  document.body.style.overflow = "hidden";
  let lastPlan = null;
  const draw = () => {
    lastPlan = buildShowPlan(s, sel.time, sel);
    $("#departTip").innerHTML = `<span class="depart-lbl">${ico("clock")} 建議出發</span><b style="font-size:19px">${lastPlan.depart}</b><span class="small muted">從${HOME.label}出發</span>`;
    $("#tl").innerHTML = renderTimeline(lastPlan, lastPlan.depart);
    $("#planNav").href = fullRouteUrl(lastPlan);
    $("#planLog").href = logUrl("", "表演：" + s.title, "排的行程：" + lastPlan.steps.map((x) => x.name || x.title).join(" → "));
  };
  $("#closeBtn").onclick = goBack;
  $("#shareBtn").onclick = () => {
    const q = new URLSearchParams({ from: HOME.id, time: sel.time, eat: sel.eat, after: sel.after });
    const summary = lastPlan ? lastPlan.steps.map((x) => x.name || x.title).join(" → ") : s.title;
    sharePlan({
      title: `週末夜遊｜${s.title}`,
      text: `🎭 ${s.title}（${s.date.slice(5).replace("-", "/")} ${sel.time}）\n建議 ${lastPlan?.depart || ""} 從${HOME.label}出發：${summary}`,
      hash: `#s/${enc(id)}?${q}`,
    });
  };
  if ($("#showTime")) $("#showTime").onchange = (ev) => { sel.time = ev.target.value; draw(); };
  $("#tl").onclick = (ev) => {
    const b = ev.target.closest("[data-swap]");
    if (!b) return;
    ev.preventDefault();
    sel[b.dataset.swap]++;
    draw();
  };
  draw();
}

// ---------- 事件 ----------
function renderAll() {
  renderRoutes(); renderEvents(); renderEndingSoon(); renderLog(); renderNight();
}

document.addEventListener("click", (ev) => {
  const t = ev.target.closest("[data-tab],[data-open],[data-rf],[data-ef],[data-pf],[data-evsort],[data-evperm],[data-hide],[data-unhide],[data-plan],[data-show],[data-nd],[data-sf],[data-more],[data-origin]");
  if (!t) return;
  if (t.dataset.hide) { ev.stopPropagation(); hide(t.dataset.hide); if (t.closest("#pickOut")) doPick(); return; }
  if (t.dataset.unhide) { unhide(t.dataset.unhide); return; }
  if (t.dataset.plan) { openPlan(t.dataset.plan); return; }
  if (t.dataset.origin) { setOrigin(t.dataset.origin); return; }
  if (t.dataset.show) { openShowPlan(t.dataset.show); return; }
  if (t.dataset.nd) { state.nightDate = t.dataset.nd; state.showAll = false; renderNight(); return; }
  if (t.dataset.sf) { state.spotFilter = t.dataset.sf; renderNight(); return; }
  if (t.dataset.more) { state.showAll = true; renderNight(); return; }
  if (t.dataset.pf) { state.pickFilter = t.dataset.pf; state.pickOrder = []; renderPickFilters(); $("#pickOut").innerHTML = ""; return; }
  if (t.dataset.evsort) { state.evSort = state.evSort === "near" ? "end" : "near"; renderEvents(); return; }
  if (t.dataset.evperm) { state.evHidePerm = !state.evHidePerm; renderEvents(); return; }
  if (t.dataset.tab) {
    document.querySelectorAll(".tabs button").forEach((b) => {
      const on = b.dataset.tab === t.dataset.tab;
      b.classList.toggle("on", on);
      b.setAttribute("aria-selected", on);
    });
    document.querySelectorAll(".tab").forEach((s) => s.classList.toggle("on", s.id === "tab-" + t.dataset.tab));
    window.scrollTo(0, 0);
  } else if (t.dataset.open) {
    if (ev.target.closest("a")) return;
    openRoute(t.dataset.open);
  } else if (t.dataset.rf) { const [type, f] = t.dataset.rf.split("|"); state.routeFilter[type] = f; renderRoutes(); }
  else if (t.dataset.ef) { state.evFilter = t.dataset.ef; renderEvents(); }
});
$("#pickBtn").onclick = doPick;
document.querySelectorAll("[data-mode]").forEach((b) => { b.onclick = () => setPickMode(b.dataset.mode); });
setPickMode(new Date().getHours() >= 15 ? "night" : "day");
$("#evSearch").oninput = renderEvents;

(async function init() {
  const weatherP = loadWeather();
  const [routes, events, visited, skipped, venues, shows, night] = await Promise.all([
    getJson("data/routes.json"), getJson("data/events.json"), getJson("data/visited.json"), getJson("data/skipped.json"), getJson("data/venues.json"), getJson("data/shows.json"), getJson("data/night.json"),
  ]);
  state.allRoutes = routes?.routes || [];
  state.routes = state.allRoutes.map(routeHere);
  renderOrigin();
  state.events = events?.events || [];
  state.visited = visited?.visits || [];
  state.skipped = skipped?.skips || [];
  state.venues = venues?.venues || [];
  state.foods = venues?.foods || {};
  state.shows = shows?.shows || [];
  state.spots = night?.spots || [];
  $("#evUpdated").textContent = events?.updated ? `展覽資料更新於 ${events.updated}（文化部藝文活動開放資料）` : "展覽資料暫時抓不到";
  renderRoutes(); renderEvents(); renderEndingSoon(); renderLog(); renderNight();
  if (location.hash) openFromHash();
  await weatherP;
})();

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}
