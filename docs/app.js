const REPO = "kenaigogo-lang/weekend-go";
const HOME = { name: "樹林車站", lat: 24.9906, lng: 121.4246 };
const RAIN_OK = ["雨天OK", "室內"];

const state = { routes: [], events: [], visited: [], skipped: [], venues: [], foods: {}, weather: null, pickOrder: [], pickIdx: 0, pickMode: "day", routeFilter: { day: "全部", night: "全部" }, evFilter: "全部" };

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
function logUrl(id, name, note = "") {
  const q = new URLSearchParams({ template: "visited.yml", title: `[去過] ${name}`, route: id ? `${id} ${name}` : name, date: ymd(new Date()) });
  if (note) q.set("note", note);
  return `https://github.com/${REPO}/issues/new?${q}`;
}
function skipUrl(id, name) {
  const q = new URLSearchParams({ template: "skip.yml", title: `[不想去] ${name}`, route: id ? `${id} ${name}` : name });
  return `https://github.com/${REPO}/issues/new?${q}`;
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
  if (r && !$("#detail").hidden) history.back();
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

function nearbyEvents(route, maxKm = 3) {
  const spots = route.steps.filter((s) => s.lat);
  return state.events.filter((e) => e.lat && !eventSeen(e) && !eventHidden(e) && daysUntil(e.start) <= 0 && spots.some((s) => kmBetween(s, e) <= maxKm))
    .sort((a, b) => a.permanent - b.permanent || a.end.localeCompare(b.end));
}
const rainOk = (r) => r.tags.some((t) => RAIN_OK.includes(t));

function scoreRoute(r) {
  const rain = state.weather?.target.rain;
  const why = [];
  let s = Math.random() * 10;
  const seen = seenPlaces(r);
  if (seen.length) { s -= 30; why.push(`有 ${seen.length} 個點去過了`); }
  else why.push("全部沒去過");
  if (rain && !rainOk(r)) s -= 40;
  if (rain && rainOk(r)) why.unshift("可能下雨，選了室內的路線");
  if (!rain && (r.tags.includes("戶外") || r.tags.includes("夜景"))) { s += 4; why.unshift("天氣不錯，適合出門"); }
  const ev = nearbyEvents(r).find((e) => !e.permanent && daysUntil(e.end) <= 21);
  if (ev) { s += 8; why.push(`順路展覽「${ev.title}」再 ${daysUntil(ev.end)} 天就結束`); }
  if (r.tags.includes("稍遠")) s -= 5;
  return { r, s, why };
}

// 白天半日遊 / 晚上夜遊（type: "night"）；有 season 的路線只在那幾個月出現
const isNight = (r) => r.type === "night";
const inSeason = (r) => !r.season || r.season.includes(new Date().getMonth() + 1);

function setPickMode(mode) {
  state.pickMode = mode;
  state.pickOrder = [];
  document.querySelectorAll("[data-mode]").forEach((b) => b.classList.toggle("on", b.dataset.mode === mode));
  $("#pickOut").innerHTML = "";
  $("#pickBtn").textContent = mode === "night" ? "🌙 今晚去哪？" : "🎲 這次去哪？";
}

function doPick() {
  if (!state.pickOrder.length || state.pickIdx >= state.pickOrder.length) {
    const done = visitedSets().routes;
    const night = state.pickMode === "night";
    state.pickOrder = state.routes.filter((r) => isNight(r) === night && inSeason(r) && !done.has(r.id) && !routeHidden(r))
      .map(scoreRoute).sort((a, b) => b.s - a.s);
    state.pickIdx = 0;
  }
  if (!state.pickOrder.length) {
    $("#pickOut").innerHTML = `<div class="card">清單上的路線都去過或藏起來了 🎉 跟 Claude 說一聲，請它再整理一批新路線。</div>`;
    return;
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
        <button class="btn" data-hide="r:${r.id}">🙈 不想去</button>
      </div>
    </div>`;
  $("#again").onclick = doPick;
  $("#pickBtn").textContent = "🎲 再抽一次";
  if (state.pickMode === "night") {
    const iso = nightDays()[new Date().getHours() >= 20 ? 1 : 0];
    const n = state.shows.filter((s) => s.date === iso && !showHidden(s)).length;
    if (n) {
      $("#pickOut").insertAdjacentHTML("beforeend",
        `<div class="card"><b>🎭 ${dayLabel(iso, iso === ymd(new Date()) ? 0 : 1)}還有 ${n} 場表演、音樂會</b>
        <div class="small muted">想看表演的話，夜遊頁可以直接排「晚餐＋表演」</div>
        <div class="row"><button class="btn" data-tab="night">去看看 →</button></div></div>`);
    }
  }
}

// ---------- 卡片 ----------
function routeCard(r) {
  const lv = lastVisit(r.id);
  const seen = lv ? [] : seenPlaces(r);
  return `<div class="card click" data-open="${r.id}">
    <h3>${r.emoji} ${esc(r.name)}</h3>
    <div class="meta"><span>🚗 約 ${r.drive} 分</span><span>${esc(r.area)}</span>${isNight(r) ? `<span>${r.depart} 出發</span>` : ""}${r.season && !inSeason(r) ? `<span class="badge">只在 ${r.season.join("、")} 月推薦</span>` : ""}${lv ? `<span class="visited">✓ 去過 ${lv.date}</span>` : ""}${seen.length ? `<span class="badge">含去過的點：${esc(seen.map((s) => s.title).join("、"))}</span>` : ""}</div>
    <div>${r.tags.map((t) => `<span class="tag">${esc(t)}</span>`).join("")}</div>
  </div>`;
}

function eventCard(e) {
  const left = daysUntil(e.end), notYet = daysUntil(e.start);
  const badge = eventSeen(e) ? `<span class="visited">✓ 看過了</span>`
    : notYet > 0 ? `<span class="badge">${notYet} 天後開展</span>`
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
    <button class="btn primary" style="display:block;width:100%;margin-top:10px" data-plan="${esc(e.id)}">🗺️ 排成半日遊</button>
    <div class="row">
      <a class="btn" href="${navUrl(dest)}" target="_blank" rel="noopener">導航</a>
      <a class="btn" href="${esc(e.url || "https://www.google.com/search?q=" + enc(e.title))}" target="_blank" rel="noopener">展覽資訊</a>
      <a class="btn" href="${logUrl("", "展覽：" + e.title)}" target="_blank" rel="noopener">✅ 去了</a>
      ${eventHidden(e) ? `<button class="btn" data-unhide="e:${esc(e.title)}">恢復</button>` : `<button class="btn" data-hide="e:${esc(e.title)}">🙈 不想去</button>`}
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
        ${s.swap ? `<a href="#" data-swap="${s.swap}">🔄 換一${s.swap === "eat" ? "家" : "個"}</a>` : ""}
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
    ${isNight(r) ? (() => {
      const pt = r.steps.find((x) => x.lat);
      const near = pt ? state.spots.filter((sp) => r.steps.some((x) => x.lat && kmBetween(x, sp) <= 2)) : [];
      return near.length ? `<h3 class="sec">🍷 附近晚上還開的店</h3>${near.map(spotCard).join("")}` : "";
    })() : ""}
    ${r.tips?.length ? `<h3 class="sec">💡 小提醒</h3><ul class="tips">${r.tips.map((t) => `<li>${esc(t)}</li>`).join("")}<li>店家營業時間可能會變，點「地圖・營業時間」確認</li></ul>` : ""}
    <h3 class="sec">📒 紀錄</h3>
    ${visits.length ? visits.map((v) => `<div class="card"><b>${v.date}</b> ${esc(v.rating || "")}<div class="small">${esc(v.note || "")}</div></div>`).join("") : `<p class="muted small">還沒去過</p>`}
    <a class="btn" style="display:block" href="${logUrl(r.id, r.name)}" target="_blank" rel="noopener">✅ 我們去了，記錄一下</a>
    ${routeHidden(r)
      ? `<button class="btn" style="display:block;width:100%;margin-top:8px" data-unhide="r:${r.id}">恢復這條路線</button>`
      : `<button class="btn" style="display:block;width:100%;margin-top:8px" data-hide="r:${r.id}">🙈 不想去，不要再推薦</button>`}
  </div>`;
  el.hidden = false;
  el.scrollTop = 0;
  document.body.style.overflow = "hidden";
  const input = $("#departAt");
  input.oninput = () => { if (input.value) $("#tl").innerHTML = renderTimeline(r, input.value); };
  $("#nowBtn").onclick = () => { input.value = fmt(soon); input.oninput(); };
  $("#closeBtn").onclick = () => history.back();
}
// ---------- 展覽排成半日遊 ----------
// 依展覽所在場館，從 venues.json 挑散步點和吃的，照時間排順序：11:00–12:30 到就先吃午餐
function findVenue(e) {
  const vs = state.venues;
  return vs.find((v) => v.match.some((m) => e.place.includes(m)))
    || vs.find((v) => v.match.some((m) => e.address.includes(m)))
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
function eatStep(venue, e, meal, idx, drive) {
  // 先排有供應這一餐的店；點心時段再接著排其他店（只賣早餐的不排）
  const foods = venue ? state.foods[venue.food] || [] : [];
  const fit = foods.filter((x) => x.meals.includes(meal));
  const extra = meal === "點心" ? foods.filter((x) => !fit.includes(x) && x.meals.some((m) => m !== "早餐")) : [];
  const f = choose(fit.concat(extra), idx, () => true);
  if (!f) {
    return { kind: "eat", title: `${meal}：附近找吃的`, q: `${e.place} 附近 小吃`, drive, stay: 50,
      detail: "這個場館附近還沒整理過在地老店，先用地圖找評價高、不是連鎖的店。想固定推薦的話，跟 Claude 說一聲。" };
  }
  return { kind: "eat", title: `${meal}：${f.name}`, name: f.name, q: f.q, drive: drive + (f.drive || 0), stay: f.stay,
    detail: f.detail + (ate(f.name) ? "（之前吃過）" : ""), swap: "eat" };
}
function buildPlan(e, venue, start, sel) {
  const drive0 = e.min ?? (venue ? Math.round(5 + kmBetween(HOME, venue) * 1.6) : 40);
  const exhibit = { kind: "see", title: e.title, q: e.address || e.place, drive: drive0, stay: 90,
    detail: `📍 ${e.place}${e.price ? `｜🎟️ ${e.price.slice(0, 50)}` : ""}${venue ? `｜🅿️ 可以停 ${venue.parking}` : ""}` };
  const w = venue && choose(venue.walks, sel.walk, () => true);
  const walk = w && { kind: "walk", title: w.name, name: w.name, q: w.q, drive: w.drive, stay: w.stay, detail: w.detail, swap: "walk" };
  const arrive = toMin(start) + drive0;
  if (arrive >= 660 && arrive <= 750) {
    const eat = eatStep(venue, e, "午餐", sel.eat, 0);
    const back = eat.drive;
    eat.drive = drive0 + eat.drive;
    return { drive: drive0, steps: [eat, { ...exhibit, drive: back }, walk].filter(Boolean) };
  }
  const afterWalk = arrive + exhibit.stay + (walk ? walk.drive + walk.stay : 0);
  return { drive: drive0, steps: [exhibit, walk, eatStep(venue, e, mealAt(afterWalk), sel.eat, 0)].filter(Boolean) };
}

function openPlan(id, push = true) {
  const e = state.events.find((x) => x.id === id);
  if (!e) return;
  if (push) history.pushState({ id }, "", `#e/${enc(id)}`);
  const venue = findVenue(e);
  const sel = { eat: 0, walk: 0 };
  const now = new Date();
  const soon = Math.ceil((now.getHours() * 60 + now.getMinutes() + 10) / 15) * 15;
  const others = state.events.filter((x) => x.id !== id && !eventHidden(x) && !eventSeen(x) && daysUntil(x.start) <= 0
    && (venue ? findVenue(x) === venue : x.place === e.place));
  const el = $("#detail");
  el.innerHTML = `<div class="sheet-in">
    <div class="close"><button id="closeBtn">← 返回</button><span class="muted small">${esc(venue ? venue.name : e.place)}</span></div>
    <h2 style="margin:4px 0">🖼️ ${esc(e.title)}</h2>
    <div class="meta"><span>${e.permanent ? "常設展" : `展到 ${e.end.slice(5).replace("-", "/")}`}</span>${e.url ? `<a href="${esc(e.url)}" target="_blank" rel="noopener">展覽資訊</a>` : ""}</div>
    ${venue ? "" : `<p class="small badge">這個場館附近還沒整理過，吃的部分先用地圖搜尋。</p>`}
    <a class="btn primary" style="display:block;margin-top:10px" id="planNav" target="_blank" rel="noopener">🚗 整條路線一鍵導航</a>
    <div class="depart">幾點出發
      <input type="time" id="departAt" value="13:00" step="900">
      <button class="btn" id="nowBtn" style="flex:none">現在出發</button>
    </div>
    <ol class="timeline" id="tl"></ol>
    ${others.length ? `<h3 class="sec">🖼️ 同一區還有 ${others.length} 檔，可以一起看</h3>${others.slice(0, 6).map(eventCard).join("")}` : ""}
    <h3 class="sec">💡 小提醒</h3>
    <ul class="tips"><li>按「🔄 換一家」可以換吃的和散步點，吃過的店會排在後面</li><li>店家營業時間可能會變，點「地圖・營業時間」確認</li></ul>
    <a class="btn" style="display:block" id="planLog" target="_blank" rel="noopener">✅ 我們去了，記錄一下</a>
  </div>`;
  el.hidden = false;
  el.scrollTop = 0;
  document.body.style.overflow = "hidden";
  const input = $("#departAt");
  const draw = () => {
    if (!input.value) return;
    const plan = buildPlan(e, venue, input.value, sel);
    $("#tl").innerHTML = renderTimeline(plan, input.value);
    $("#planNav").href = fullRouteUrl(plan);
    const note = "排的行程：" + plan.steps.map((s) => s.name || s.title).join(" → ");
    $("#planLog").href = logUrl("", "展覽：" + e.title, note);
  };
  input.oninput = draw;
  $("#nowBtn").onclick = () => { input.value = fmt(soon); draw(); };
  $("#closeBtn").onclick = () => history.back();
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
  $("#detail").hidden = true;
  document.body.style.overflow = "";
}
function openFromHash() {
  const r = location.hash.match(/^#r\/(\w+)/);
  const e = location.hash.match(/^#e\/(.+)/);
  const s = location.hash.match(/^#s\/(.+)/);
  if (r) openRoute(r[1], false);
  else if (e) openPlan(decodeURIComponent(e[1]), false);
  else if (s) openShowPlan(decodeURIComponent(s[1]), false);
  else closeRoute();
}
window.addEventListener("popstate", () => {
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
  const q = $("#evSearch").value.trim();
  const list = state.events.filter((e) => {
    if (q && !(e.title + e.place + e.address).includes(q)) return false;
    if (state.evFilter === "🙈 不想去的") return eventHidden(e);
    if (eventHidden(e)) return false;
    switch (state.evFilter) {
      case "30 分內": return e.min && e.min <= 30;
      case "快結束": return !e.permanent && daysUntil(e.end) <= 14 && daysUntil(e.start) <= 0;
      case "免費": return /免費|免門票|不收費/.test(e.price);
      case "新開展": return daysUntil(e.start) > -14;
      default: return true;
    }
  });
  $("#evList").innerHTML = list.map(eventCard).join("") || `<div class="empty">沒有符合的展覽</div>`;
  // 還沒有周邊資料的場館，列出來方便請 Claude 補
  const missing = [...new Set(state.events.filter((e) => !findVenue(e)).map((e) => e.place.split(/\s/)[0]))];
  $("#evMissing").textContent = missing.length ? `這些場館附近還沒整理吃的（排行程時會先用地圖搜尋代替）：${missing.join("、")}` : "";
}

function renderEndingSoon() {
  const list = state.events.filter((e) => !e.permanent && !eventSeen(e) && !eventHidden(e) && daysUntil(e.start) <= 0 && daysUntil(e.end) <= 21)
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

// ---------- 夜遊：表演、晚上還開的展覽、吃喝逛 ----------
const DINNER_KINDS = ["餐酒館", "餐廳", "居酒屋"];
const AFTER_KINDS = ["酒吧", "書店", "小店"];
const dowOf = (iso) => new Date(iso + "T00:00:00").getDay();
const showHidden = (s) => isHidden(`s:${s.title}`);
const hhmmToMin = (s) => toMin(s);

// 日期選項：今晚，加上 7 天內的週五、六、日
function nightDays() {
  const out = [];
  for (let i = 0; i < 8; i++) {
    const d = today(); d.setDate(d.getDate() + i);
    if (i === 0 || [5, 6, 0].includes(d.getDay())) out.push(ymd(d));
  }
  return out;
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
  return `<div class="card">
    <div class="meta"><span class="badge">${s.times.join("、")} 開演</span><span class="tag" style="margin:0">${esc(s.cat)}</span></div>
    <h3 style="margin-top:4px">${esc(s.title)}</h3>
    <div class="meta"><span>📍 ${esc(s.place)}</span>${s.min ? `<span>🚗 約 ${s.min} 分</span>` : ""}</div>
    ${s.price ? `<div class="meta" style="margin-top:2px">🎟️ ${esc(s.price)}</div>` : ""}
    <button class="btn primary" style="display:block;width:100%;margin-top:10px" data-show="${esc(s.id)}">🌙 排成夜遊（晚餐＋表演）</button>
    <div class="row">
      <a class="btn" href="${esc(s.url || "https://www.google.com/search?q=" + enc(s.title))}" target="_blank" rel="noopener">售票・資訊</a>
      <a class="btn" href="${navUrl(s.address || s.place)}" target="_blank" rel="noopener">導航</a>
      ${showHidden(s) ? `<button class="btn" data-unhide="s:${esc(s.title)}">恢復</button>` : `<button class="btn" data-hide="s:${esc(s.title)}">🙈 不想去</button>`}
    </div>
  </div>`;
}

function spotCard(sp) {
  return `<div class="card">
    <div class="meta"><span class="tag" style="margin:0">${esc(sp.kind)}</span><span>${esc(sp.area)}</span><span>約 ${sp.open}–${sp.close > "24:00" ? "凌晨 " + fmt(toMin(sp.close)) : sp.close}</span></div>
    <h3 style="margin-top:4px">${esc(sp.name)}</h3>
    <div class="small">${esc(sp.detail)}</div>
    <div class="row">
      <a class="btn" href="${navUrl(sp.q)}" target="_blank" rel="noopener">導航</a>
      <a class="btn" href="${searchUrl(sp.q)}" target="_blank" rel="noopener">地圖・營業時間</a>
    </div>
  </div>`;
}

function renderNight() {
  const days = nightDays();
  if (!state.nightDate || !days.includes(state.nightDate)) {
    state.nightDate = new Date().getHours() >= 20 ? days[1] || days[0] : days[0];
  }
  const iso = state.nightDate;
  $("#nightDays").innerHTML = days.map((d, i) => `<button class="${d === iso ? "on" : ""}" data-nd="${d}">${dayLabel(d, i)}</button>`).join("");

  const shows = state.shows.filter((s) => s.date === iso && !showHidden(s));
  const list = state.showAll ? shows : shows.slice(0, 8);
  $("#showList").innerHTML = (list.map(showCard).join("") || `<p class="muted small">這晚沒有查到 5 點以後的表演</p>`)
    + (shows.length > list.length ? `<button class="btn" style="width:100%" data-more="1">再看 ${shows.length - list.length} 場</button>` : "");

  // 晚上 7 點以後還開的展覽（資料裡有寫關門時間的才算得出來）
  const late = state.events.filter((e) => e.close && e.close >= "19:00" && e.start <= iso && e.end >= iso && !eventHidden(e));
  $("#nightExhibits").innerHTML = late.length ? `<h2 class="sec">🖼️ 晚上還開的展覽</h2>${late.map(eventCard).join("")}` : "";

  const filters = ["全部", "吃晚餐", "酒吧", "書店・小店"];
  const f = state.spotFilter || "全部";
  $("#spotChips").innerHTML = filters.map((x) => `<button class="${x === f ? "on" : ""}" data-sf="${x}">${x}</button>`).join("");
  const spots = state.spots.filter((sp) => spotOpen(sp, iso) && (f === "全部"
    || (f === "吃晚餐" && DINNER_KINDS.includes(sp.kind)) || (f === "酒吧" && sp.kind === "酒吧")
    || (f === "書店・小店" && ["書店", "小店"].includes(sp.kind))));
  $("#spotList").innerHTML = spots.map(spotCard).join("") || `<p class="muted small">這晚沒有符合的店（可能剛好公休）</p>`;
}

// 晚餐候選：附近晚上有開的餐酒館／餐廳，再加上附近場館周邊有賣晚餐的在地店
function dinnerOptions(pt, iso, eatBy) {
  const opts = spotsNear(pt, DINNER_KINDS, iso)
    .filter((sp) => toMin(sp.open) <= eatBy - 105)
    .map((sp) => ({ name: sp.name, q: sp.q, stay: 75, detail: sp.detail, lat: sp.lat, lng: sp.lng }));
  const v = pt && state.venues.find((x) => kmBetween(x, pt) <= 2);
  for (const f of (v && state.foods[v.food]) || []) {
    if (f.meals.includes("晚餐")) opts.push({ name: f.name, q: f.q, stay: Math.max(f.stay, 45), detail: f.detail, far: f.drive });
  }
  return opts;
}

function buildShowPlan(s, time, sel) {
  const pt = showPoint(s);
  const start = toMin(time);
  const drive0 = s.min ?? (pt ? Math.round(5 + kmBetween(HOME, pt) * 1.6) : 40);
  const opts = dinnerOptions(pt, s.date, start);
  const pick = opts.length ? [...opts.filter((o) => !ate(o.name)), ...opts.filter((o) => ate(o.name))][sel.eat % opts.length] : null;
  const toShow = pick ? (pick.far || (pick.lat && pt && kmBetween(pick, pt) > 0.8 ? 10 : 0)) : 0;
  const dinner = pick
    ? { kind: "eat", title: `晚餐：${pick.name}`, name: pick.name, q: pick.q, drive: drive0, stay: pick.stay,
        detail: pick.detail + (ate(pick.name) ? "（之前吃過）" : ""), swap: "eat" }
    : { kind: "eat", title: "晚餐：附近找吃的", q: `${s.place} 附近 餐廳`, drive: drive0, stay: 60,
        detail: "這個場地附近還沒整理過晚上的店，先用地圖找評價高、不是連鎖的店。" };
  const show = { kind: "see", title: `${time} 開演：${s.title}`, name: s.title, q: s.address || s.place, drive: toShow, stay: 15 + 120,
    detail: `📍 ${s.place}｜提早 15 分鐘進場，演出長度先抓 2 小時（以售票頁為準）。${s.price ? "🎟️ " + s.price : ""}` };
  const steps = [dinner, show];
  const end = start + 120;
  // 散場後還開著的酒吧或小店（回到家不超過 23:30 才排）
  const after = spotsNear(pt, AFTER_KINDS, s.date, 2).filter((sp) => toMin(sp.close) >= end + 45 || sp.close > "24:00");
  if (after.length && end + 45 + drive0 <= 23 * 60 + 30) {
    const a = after[sel.after % after.length];
    steps.push({ kind: a.kind === "酒吧" ? "fun" : "shop", title: `散場後（選擇）：${a.name}`, name: a.name, q: a.q, drive: 0, stay: 45,
      detail: a.detail, swap: "after" });
  }
  const departMin = start - 15 - toShow - dinner.stay - drive0;
  return { drive: drive0, steps, depart: fmt(Math.floor(departMin / 5) * 5) };
}

function openShowPlan(id, push = true) {
  const s = state.shows.find((x) => x.id === id);
  if (!s) return;
  if (push) history.pushState({ id }, "", `#s/${enc(id)}`);
  const sel = { eat: 0, after: 0, time: s.times[0] };
  const el = $("#detail");
  el.innerHTML = `<div class="sheet-in">
    <div class="close"><button id="closeBtn">← 返回</button><span class="muted small">${esc(s.place)}</span></div>
    <h2 style="margin:4px 0">🎭 ${esc(s.title)}</h2>
    <div class="meta"><span>${esc(s.cat)}</span><span>${s.date.slice(5).replace("-", "/")}（週${WEEK[dowOf(s.date)]}）</span>
      <a href="${esc(s.url || "https://www.google.com/search?q=" + enc(s.title))}" target="_blank" rel="noopener">售票・資訊</a></div>
    ${s.times.length > 1 ? `<div class="depart">場次 <select id="showTime">${s.times.map((t) => `<option>${t}</option>`).join("")}</select></div>` : ""}
    <p class="small muted" style="margin:8px 0 0">記得先買票。時間表是從開演時間往回推算出發時間。</p>
    <div class="depart" id="departTip"></div>
    <a class="btn primary" style="display:block" id="planNav" target="_blank" rel="noopener">🚗 整條路線一鍵導航</a>
    <ol class="timeline" id="tl" style="margin-top:14px"></ol>
    <h3 class="sec">💡 小提醒</h3>
    <ul class="tips"><li>按「🔄 換一家」可以換晚餐或散場後的去處</li><li>店家營業時間是從文章查的，點「地圖・營業時間」確認</li></ul>
    <a class="btn" style="display:block" id="planLog" target="_blank" rel="noopener">✅ 我們去了，記錄一下</a>
  </div>`;
  el.hidden = false;
  el.scrollTop = 0;
  document.body.style.overflow = "hidden";
  const draw = () => {
    const plan = buildShowPlan(s, sel.time, sel);
    $("#departTip").innerHTML = `建議 <b style="font-size:20px">${plan.depart}</b> 從樹林出發`;
    $("#tl").innerHTML = renderTimeline(plan, plan.depart);
    $("#planNav").href = fullRouteUrl(plan);
    $("#planLog").href = logUrl("", "表演：" + s.title, "排的行程：" + plan.steps.map((x) => x.name || x.title).join(" → "));
  };
  $("#closeBtn").onclick = () => history.back();
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
  const t = ev.target.closest("[data-tab],[data-open],[data-rf],[data-ef],[data-hide],[data-unhide],[data-plan],[data-show],[data-nd],[data-sf],[data-more]");
  if (!t) return;
  if (t.dataset.hide) { ev.stopPropagation(); hide(t.dataset.hide); if (t.closest("#pickOut")) doPick(); return; }
  if (t.dataset.unhide) { unhide(t.dataset.unhide); return; }
  if (t.dataset.plan) { openPlan(t.dataset.plan); return; }
  if (t.dataset.show) { openShowPlan(t.dataset.show); return; }
  if (t.dataset.nd) { state.nightDate = t.dataset.nd; state.showAll = false; renderNight(); return; }
  if (t.dataset.sf) { state.spotFilter = t.dataset.sf; renderNight(); return; }
  if (t.dataset.more) { state.showAll = true; renderNight(); return; }
  if (t.dataset.tab) {
    document.querySelectorAll(".tabs button").forEach((b) => b.classList.toggle("on", b.dataset.tab === t.dataset.tab));
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
  const [routes, events, visited, skipped, venues, shows, night] = await Promise.all([
    getJson("data/routes.json"), getJson("data/events.json"), getJson("data/visited.json"), getJson("data/skipped.json"), getJson("data/venues.json"), getJson("data/shows.json"), getJson("data/night.json"),
  ]);
  state.routes = routes?.routes || [];
  state.events = events?.events || [];
  state.visited = visited?.visits || [];
  state.skipped = skipped?.skips || [];
  state.venues = venues?.venues || [];
  state.foods = venues?.foods || {};
  state.shows = shows?.shows || [];
  state.spots = night?.spots || [];
  $("#evUpdated").textContent = events?.updated ? `展覽資料更新於 ${events.updated}（文化部藝文活動開放資料）` : "展覽資料暫時抓不到";
  renderRoutes(); renderEvents(); renderEndingSoon(); renderLog(); renderNight();
  await loadWeather();
  if (location.hash) openFromHash();
})();
