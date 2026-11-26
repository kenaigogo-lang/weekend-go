"""抓文化部藝文活動開放資料，再補上幾個大場館官網的當期展覽，
留下樹林開車可到、正在展出（或兩週內開展）的展覽，輸出 docs/data/events.json。"""
import html
import json
import math
import re
import sys
import urllib.parse
import urllib.request
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

SOURCE = "https://cloud.culture.tw/frontsite/trans/SearchShowAction.do?method=doFindTypeJ&category=all"
ORIGIN = (24.9906, 121.4246)  # 樹林火車站
AREA = re.compile(r"臺北|台北|新北|桃園|基隆")
OUT = Path(__file__).resolve().parent.parent / "docs" / "data" / "events.json"
TW = timezone(timedelta(hours=8))
UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"

TODAY = datetime.now(TW).date()
SOON = TODAY + timedelta(days=14)

# 文化部資料常漏掉的大場館。故宮官網在 Cloudflare 驗證後面，抓不到所以沒列。
VENUES = {
    "huashan": ("華山1914文化創意產業園區", "臺北市中正區八德路一段1號", (25.0441, 121.5293)),
    "songshan": ("松山文創園區", "臺北市信義區光復南路133號", (25.0440, 121.5606)),
    "tfam": ("臺北市立美術館", "臺北市中山區中山北路三段181號", (25.0725, 121.5247)),
    "cksmh": ("中正紀念堂", "臺北市中正區中山南路21號", (25.0347, 121.5218)),
    "ntcam": ("新北市美術館", "新北市鶯歌區館前路300號", (24.9583, 121.3546)),
}

# 文化部常漏填座標的常見北北桃基展演場館（除了 venues.json 以外再補這一張表）
KNOWN_COORDS = [
    (["郵政博物館"], (25.0319, 121.5150)),
    (["國立歷史博物館"], (25.0315, 121.5113)),
    (["藝術教育館", "南海路47號", "南海路四十七號"], (25.0323, 121.5121)),
    (["當代工藝設計分館", "南海路41號"], (25.0322, 121.5125)),
    (["金車文藝中心 臺北南京館", "金車文藝中心臺北南京館", "南京東路二段1號"], (25.0522, 121.5276)),
    (["金車文藝中心 臺北承德館", "金車文藝中心臺北承德館"], (25.0617, 121.5180)),
    (["得忌利士洋行", "齊柏林空間"], (25.1743, 121.4362)),
    (["淡水分館"], (25.1726, 121.4384)),
    (["臺灣客家茶文化館", "台灣客家茶文化館"], (24.8323, 121.1893)),
    (["大溪慈湖", "後慈湖"], (24.8424, 121.2940)),
    (["文山劇場"], (24.9921, 121.5416)),
    (["桃園市土地公文化館"], (24.9982, 121.3089)),
    (["桃園展演中心"], (25.0169, 121.3005)),
    (["橫山書法藝術館"], (25.0120, 121.2085)),
    (["桃園市兒童美術館"], (25.0022, 121.2039)),
    (["CLAPPER STUDIO", "三創生活"], (25.0454, 121.5313)),
    (["臺北市政大樓親子劇場", "台北市政大樓親子劇場", "市府路1號"], (25.0375, 121.5644)),
    (["WESTAR", "西門紅樓"], (25.0434, 121.5067)),
    (["國家音樂廳", "國家戲劇院", "兩廳院"], (25.0365, 121.5190)),
    (["臺北表演藝術中心", "台北表演藝術中心"], (25.0846, 121.5250)),
    (["臺北流行音樂中心", "台北流行音樂中心"], (25.0525, 121.5988)),
    (["台北小巨蛋", "臺北小巨蛋"], (25.0513, 121.5500)),
    (["台北國際會議中心", "臺北國際會議中心", "TICC"], (25.0332, 121.5608)),
    (["城市舞台"], (25.0480, 121.5518)),
    (["水源劇場"], (25.0138, 121.5349)),
    (["Legacy Taipei"], (25.0441, 121.5293)),
    (["Zepp New Taipei"], (25.0598, 121.4494)),
    (["新北市藝文中心"], (25.0252, 121.4714)),
    (["基隆文化中心", "基隆表演藝術中心"], (25.1310, 121.7446)),
    (["台北當代藝術館", "臺北當代藝術館"], (25.0507, 121.5190)),
    (["國立臺灣博物館", "國立台灣博物館"], (25.0427, 121.5150)),
    (["國立臺灣科學教育館", "科教館"], (25.0960, 121.5166)),
    (["天文科學教育館"], (25.0958, 121.5186)),
    (["忠泰美術館"], (25.0445, 121.5382)),
    (["富邦美術館"], (25.0394, 121.5715)),
    (["國父紀念館"], (25.0400, 121.5600)),
]

BAD_VENUE_RE = re.compile(r"線上|候機室|出境大廳|管制區|戶政事務所|地政事務所|地政局|區公所|稅捐")
_VENUE_COORDS = None


def load_venue_coords():
    global _VENUE_COORDS
    if _VENUE_COORDS is None:
        vfile = OUT.parent / "venues.json"
        if vfile.exists():
            data = json.loads(vfile.read_text(encoding="utf-8"))
            _VENUE_COORDS = [(v["match"], (v["lat"], v["lng"])) for v in data.get("venues") or [] if v.get("lat")]
        else:
            _VENUE_COORDS = []
    return _VENUE_COORDS


def fallback_coords(place, address):
    """文化部漏填座標時，依場館名稱與地址從已知場館表補齊。"""
    text = f"{place} {address}"
    compact = re.sub(r"\s+", "", text)
    for table in (KNOWN_COORDS, load_venue_coords()):
        for keywords, pt in table:
            if any(k in text or k in compact for k in keywords):
                return pt
    return None


def clean_place(place, address):
    p = re.sub(r"\s+", " ", place or "").strip().rstrip("=").strip()
    addr = re.sub(r"\s+", "", address or "")
    # 南海路 47 號只填展廳名（美學空間、第3展覽廳）時補上館名
    if re.search(r"南海路(47|四十七)號", addr) and "藝術教育館" not in p:
        p = f"國立臺灣藝術教育館 {p}".strip()
    return p


def is_bad_venue(place, address, unit=""):
    compact = re.sub(r"\s+", "", f"{place}{address}{unit}")
    if BAD_VENUE_RE.search(compact):
        return True
    # 地點以「=」結尾（文化部缺場地名時的行政區佔位字）且沒有門牌地址
    if (place or "").strip().endswith("=") and not re.search(r"[路街巷段號樓]", address or ""):
        return True
    return False


def km_between(a, b):
    r = math.radians
    dlat, dlng = r(b[0] - a[0]), r(b[1] - a[1])
    h = math.sin(dlat / 2) ** 2 + math.cos(r(a[0])) * math.cos(r(b[0])) * math.sin(dlng / 2) ** 2
    return 2 * 6371 * math.asin(math.sqrt(h))


def coords(info):
    try:
        lat, lng = float(info.get("latitude") or 0), float(info.get("longitude") or 0)
    except ValueError:
        return None
    # 資料裡有不少座標填錯，只接受北北桃基範圍內的
    if 24.6 < lat < 25.35 and 120.9 < lng < 122.0:
        return lat, lng
    return None


def fetch(url, data=None, headers=None, timeout=60):
    req = urllib.request.Request(url, data=data, headers={"User-Agent": UA, **(headers or {})})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return resp.read().decode("utf-8")


def text_of(fragment):
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", str(fragment or "")))).strip()


def make_event(id, title, start, end, place, address, c, price, url, unit, desc):
    km = km_between(ORIGIN, c) if c else None
    return {
        "id": id,
        "title": title.strip(),
        "start": start.isoformat(),
        "end": end.isoformat(),
        "place": place.strip(),
        "address": address.strip(),
        "lat": c[0] if c else None,
        "lng": c[1] if c else None,
        "km": round(km, 1) if km is not None else None,
        # 粗估週末車程：市區繞路＋塞車，經驗值
        "min": round(5 + km * 1.6) if km is not None else None,
        "price": price.strip(),
        "url": url,
        "unit": unit.strip(),
        "desc": re.sub(r"\s+", " ", desc or "").strip()[:160],
        "permanent": (end - start).days > 300,
    }


def venue_event(key, id, title, start, end, url, desc="", price="", room=""):
    place, address, c = VENUES[key]
    return make_event(f"{key}-{id}", title, start, end, f"{place} {room}".strip(), address, c,
                      price, url, place, desc)


def in_window(start, end):
    return end >= TODAY and start <= SOON


def is_exhibition(e):
    if e.get("category") == "6":
        return True
    return e.get("category") in {"15", "16", "200"} and "展" in e.get("title", "")


def from_culture(data):
    out = []
    for e in data:
        if not is_exhibition(e):
            continue
        try:
            start = datetime.strptime(e["startDate"], "%Y/%m/%d").date()
            end = datetime.strptime(e["endDate"], "%Y/%m/%d").date()
        except (KeyError, ValueError):
            continue
        if not in_window(start, end):
            continue

        unit = e.get("showUnit") or ""
        best = None
        for info in e.get("showInfo") or []:
            raw_place = info.get("locationName") or ""
            raw_addr = info.get("location") or ""
            text = raw_addr + raw_place
            if not AREA.search(text) or is_bad_venue(raw_place, raw_addr, unit):
                continue
            place = clean_place(raw_place, raw_addr)
            c = coords(info) or fallback_coords(place, raw_addr)
            km = km_between(ORIGIN, c) if c else None
            if best is None or (km is not None and (best[1] is None or km < best[1])):
                best = (info, km, c, place, raw_addr)
        if best is None:
            continue

        info, km, c, place, raw_addr = best
        ev = make_event(
            e["UID"], e["title"], start, end,
            place, raw_addr, c,
            info.get("price") or "", e.get("sourceWebPromote") or e.get("webSales") or "",
            unit, e.get("descriptionFilterHtml") or "",
        )
        # endTime 的時刻通常就是每天關門時間，夜遊頁用來找晚上還開的展覽（過濾 00:00 或明顯誤植的凌晨時刻）
        m = re.search(r" (\d\d:\d\d)", info.get("endTime") or "")
        if m and "09:00" <= m.group(1) <= "23:59":
            ev["close"] = m.group(1)
        out.append(ev)
    print(f"文化部: kept {len(out)} of {len(data)} events")
    return out


SHOW_CATS = {"1": "音樂", "2": "戲劇", "3": "舞蹈", "5": "獨立音樂", "11": "綜藝", "17": "演唱會"}
SHOWS_OUT = OUT.parent / "shows.json"


def from_shows(data):
    """晚上 5 點以後開演的表演場次（兩週內），夜遊頁用。同一檔同一天只留一筆，時間合併。"""
    sessions = {}
    for e in data:
        cat = SHOW_CATS.get(e.get("category"))
        if not cat:
            continue
        for info in e.get("showInfo") or []:
            raw_place = info.get("locationName") or ""
            raw_addr = info.get("location") or ""
            text = raw_addr + raw_place
            if not AREA.search(text) or is_bad_venue(raw_place, raw_addr):
                continue
            try:
                t = datetime.strptime(info["time"], "%Y/%m/%d %H:%M:%S")
            except (KeyError, ValueError):
                continue
            if not (TODAY <= t.date() <= SOON) or t.hour < 17:
                continue
            key = (e["UID"], t.date())
            if key in sessions:
                sessions[key]["times"] = sorted(set(sessions[key]["times"] + [t.strftime("%H:%M")]))
                continue
            place = clean_place(raw_place, raw_addr)
            c = coords(info) or fallback_coords(place, raw_addr)
            km = km_between(ORIGIN, c) if c else None
            sessions[key] = {
                "id": f"{e['UID']}-{t:%m%d}",
                "title": e["title"].strip(),
                "cat": cat,
                "date": t.date().isoformat(),
                "times": [t.strftime("%H:%M")],
                "place": place,
                "address": raw_addr.strip(),
                "lat": c[0] if c else None,
                "lng": c[1] if c else None,
                "min": round(5 + km * 1.6) if km is not None else None,
                "price": (info.get("price") or "").strip()[:80],
                "url": e.get("webSales") or e.get("sourceWebPromote") or "",
            }
    out = sorted(sessions.values(), key=lambda s: (s["date"], s["times"][0]))
    print(f"表演: {len(out)} 場（17:00 以後、兩週內）")
    return out


def utc_day(s):
    # 華山 CMS 存的是台灣午夜換成 UTC，例如 2026-10-23T16:00:00Z 其實是 10/24
    return datetime.fromisoformat(s.replace("Z", "+00:00")).astimezone(TW).date()


def huashan():
    api = "https://cms.huashan1914.com/api/collection_list/search"
    exhibit = "69c4f3584dabdfd40972a815"  # 「展覽」分類
    out, page, pages = [], 1, 1
    while page <= pages and page <= 10:
        body = json.dumps({
            "collections": [{"id": "events"}], "lang": "zh-TW", "page": page, "limit": 50,
            "sorting": "article.event_time.end_date:1",
            "startDate": f"article.event_time.end_date:{TODAY.isoformat()}",
        }).encode()
        res = json.loads(fetch(api, body, {"Content-Type": "application/json"}))
        pages = res.get("totalPages") or 1
        for item in res.get("contentList") or []:
            art, aside = item.get("article") or {}, item.get("aside") or {}
            title = (art.get("default") or {}).get("title") or ""
            cats = aside.get("category_event_category") or []
            if not (exhibit in cats or (not cats and "展" in title)):
                continue
            t = art.get("event_time") or {}
            try:
                start, end = utc_day(t["start_date"]), utc_day(t["end_date"])
            except (KeyError, ValueError):
                continue
            if not in_window(start, end):
                continue
            slug = (art.get("default") or {}).get("slug") or ""
            url = "https://www.huashan1914.com/exhibition/" + urllib.parse.quote(slug) if slug else ""
            desc = text_of((art.get("event_content") or {}).get("description"))
            out.append(venue_event("huashan", item.get("_id"), title, start, end, url, desc))
        page += 1
    return out


def songshan():
    base = "https://www.songshanculturalpark.org"
    out, seen = [], set()
    for page in range(1, 8):
        page_html = fetch(f"{base}/exhibition?page={page}")
        rows = page_html.split('<div class="rows">')[1:]
        ids = set(re.findall(r'class="btn" href="/exhibition/activity/([\w-]+)"', "".join(rows)))
        # 超過最後一頁時網站會回傳最後一頁的內容
        if not rows or ids <= seen:
            break
        seen |= ids
        for row in rows:
            m_date = re.search(r'class="date[^"]*">\s*(\d{4}-\d\d-\d\d)\s*-\s*(\d{4}-\d\d-\d\d)', row)
            m_title = re.search(r'class="lv_h2">(.*?)</p>', row, re.S)
            m_link = re.search(r'href="(/exhibition/activity/([\w-]+))"', row)
            if not (m_date and m_title and m_link):
                continue
            title = text_of(m_title.group(1))
            m_desc = re.search(r'class="article">(.*?)</p>', row, re.S)
            desc = text_of(m_desc.group(1)) if m_desc else ""
            # 松菸「展演資訊」混著市集、論壇、表演，只留標題看起來是展覽的
            if not re.search(r"展|博覽", title) or "攻略" in title:
                continue
            start, end = (date.fromisoformat(m_date.group(i)) for i in (1, 2))
            if in_window(start, end):
                out.append(venue_event("songshan", m_link.group(2), title, start, end,
                                       base + m_link.group(1), desc))
    return out


def tfam():
    res = json.loads(fetch(
        "https://www.tfam.museum/ashx/Exhibition.ashx?ddlLang=zh-tw",
        json.dumps({"JJMethod": "GetEx", "Type": "1"}).encode(),
        {"Content-Type": "application/json; charset=utf-8"},
    ))
    out = []
    for ex in res.get("Data") or []:
        try:
            start = datetime.strptime(ex["BeginDate"], "%Y/%m/%d").date()
            end = datetime.strptime(ex["EndDate"], "%Y/%m/%d").date()
        except (KeyError, TypeError, ValueError):
            continue
        if not in_window(start, end):
            continue
        # 北美館辦的海外展、線上展，人到不了館裡看
        if re.search(r"威尼斯|義大利|海外|線上|Net\.Open", (ex.get("Area") or "") + (ex.get("ExName") or "")):
            continue
        url = f"https://www.tfam.museum/Exhibition/Exhibition_page.aspx?id={ex['ExID']}&ddlLang=zh-tw"
        out.append(venue_event("tfam", ex["ExID"], ex.get("ExName") or "", start, end, url,
                               text_of(ex.get("Content")), room=ex.get("Area") or ""))
    return out


def cksmh():
    page_html = fetch("https://www.cksmh.gov.tw/News_Actives_photo.aspx?n=6067&sms=14954")
    out = []
    for block in page_html.split('class="area-figure page-figure"')[1:]:
        m_link = re.search(r'<a href="([^"]+)"', block)
        m_title = re.search(r'class="caption">\s*<span>(.*?)</span>', block, re.S)
        m_date = re.search(r"日期：(\d{4}-\d\d-\d\d)\s*~\s*(\d{4}-\d\d-\d\d)", block)
        if not (m_link and m_title and m_date):
            continue
        start, end = (date.fromisoformat(m_date.group(i)) for i in (1, 2))
        if not in_window(start, end):
            continue
        title = text_of(m_title.group(1))
        m_desc = re.search(r'class="p">(.*?)</div>', block, re.S)
        m_room = re.search(r"activity-season[^>]*>\s*地點：([^<]*)", block)
        url = html.unescape(m_link.group(1))
        m_id = re.search(r"actId=(\d+)", url)
        out.append(venue_event(
            "cksmh", m_id.group(1) if m_id else title, title, start, end, url,
            text_of(m_desc.group(1)) if m_desc else "",
            price="免費" if "免費" in title else "",
            room=m_room.group(1).strip() if m_room else "",
        ))
    return out


def ms_day(s):
    # .NET 的 /Date(1792166400000)/
    return datetime.fromtimestamp(int(re.search(r"\d+", s).group()) / 1000, TW).date()


def ntcam():
    body = urllib.parse.urlencode({"q": "get", "data": json.dumps({"p": 1, "ps": 50, "Kind": ""})}).encode()
    res = json.loads(fetch("https://ntcart.museum/exhibition.aspx", body,
                           {"Content-Type": "application/x-www-form-urlencoded"}))
    out = []
    for ex in (res.get("list") or {}).get("items") or []:
        try:
            start, end = ms_day(ex["ExDateSt"]), ms_day(ex["ExDateEn"])
        except (KeyError, TypeError, AttributeError):
            continue
        if not in_window(start, end):
            continue
        cost = ex.get("ExCost")
        cost = "免費" if cost == 0 else f"全票 {cost} 元" if isinstance(cost, int) else text_of(cost)
        out.append(venue_event(
            "ntcam", ex["ExNo"], ex.get("ExName") or "", start, end,
            f"https://ntcart.museum/exhibition_content.aspx?id={ex['ExNo']}",
            text_of(ex.get("ContentDesc") or ex.get("ExInfo")), price=cost,
            room=re.sub(r"^新北市美術館\s*[–-]?\s*", "", text_of(ex.get("ExLocationTextTW"))),
        ))
    return out


def title_key(title):
    # 比對用：拿掉括號註記、標點和空白
    t = re.sub(r"[（(【\[][^）)】\]]*[）)】\]]", "", title)
    return re.sub(r"[\W_]+", "", t).lower()


def find_dup(title, keys):
    k = title_key(title)
    if not k:
        return -1
    for i, o in enumerate(keys):
        if k == o or (min(len(k), len(o)) >= 6 and (k in o or o in k)):
            return i
    return None


def main():
    data = json.loads(fetch(SOURCE, timeout=120))
    SHOWS_OUT.write_text(json.dumps({
        "updated": datetime.now(TW).strftime("%Y-%m-%d %H:%M"),
        "shows": from_shows(data),
    }, ensure_ascii=False, indent=1), encoding="utf-8")

    # 場館官網資料通常較完整（含精準座標、展廳、票價），優先採納；再用文化部補上其餘展覽與關門時間
    out, keys = [], []
    for name, scrape in [("華山", huashan), ("松菸", songshan), ("北美館", tfam),
                         ("中正紀念堂", cksmh), ("新北市美術館", ntcam)]:
        try:
            found = scrape()
        except Exception as exc:  # 單一場館壞掉不影響其他來源
            print(f"::warning::{name} 抓取失敗：{exc}")
            continue
        added = 0
        for e in found:
            if find_dup(e["title"], keys) is not None:
                continue
            keys.append(title_key(e["title"]))
            out.append(e)
            added += 1
        print(f"{name}: found {len(found)}, added {added}")

    culture_added = 0
    for e in from_culture(data):
        idx = find_dup(e["title"], keys)
        if idx is not None:
            if idx >= 0:
                dst = out[idx]
                if e.get("close") and not dst.get("close"):
                    dst["close"] = e["close"]
                if e.get("price") and not dst.get("price"):
                    dst["price"] = e["price"]
                if e.get("desc") and not dst.get("desc"):
                    dst["desc"] = e["desc"]
            continue
        keys.append(title_key(e["title"]))
        out.append(e)
        culture_added += 1
    print(f"文化部: merged, added {culture_added} unique events")

    out.sort(key=lambda x: (x["permanent"], x["end"]))
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps({
        "updated": datetime.now(TW).strftime("%Y-%m-%d %H:%M"),
        "events": out,
    }, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"total {len(out)} events")


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:  # 抓不到就沿用舊資料，不讓整個部署失敗
        print(f"fetch failed: {exc}", file=sys.stderr)
        sys.exit(1)
