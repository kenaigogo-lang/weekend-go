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
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", fragment or ""))).strip()


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


def from_culture():
    data = json.loads(fetch(SOURCE, timeout=120))
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

        best = None
        for info in e.get("showInfo") or []:
            text = (info.get("location") or "") + (info.get("locationName") or "")
            if not AREA.search(text) or "線上" in text:
                continue
            c = coords(info)
            km = km_between(ORIGIN, c) if c else None
            if best is None or (km is not None and (best[1] is None or km < best[1])):
                best = (info, km, c)
        if best is None:
            continue

        info, km, c = best
        out.append(make_event(
            e["UID"], e["title"], start, end,
            info.get("locationName") or "", info.get("location") or "", c,
            info.get("price") or "", e.get("sourceWebPromote") or e.get("webSales") or "",
            e.get("showUnit") or "", e.get("descriptionFilterHtml") or "",
        ))
    print(f"文化部: kept {len(out)} of {len(data)} events")
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
    out = []
    for page in range(1, 8):
        page_html = fetch(f"{base}/exhibition?page={page}")
        rows = page_html.split('<div class="rows">')[1:]
        if not rows:
            break
        for row in rows:
            m_date = re.search(r'class="date[^"]*">\s*(\d{4}-\d\d-\d\d)\s*-\s*(\d{4}-\d\d-\d\d)', row)
            m_title = re.search(r'class="lv_h2">(.*?)</p>', row, re.S)
            m_link = re.search(r'href="(/exhibition/activity/([\w-]+))"', row)
            if not (m_date and m_title and m_link):
                continue
            title = text_of(m_title.group(1))
            m_desc = re.search(r'class="article">(.*?)</p>', row, re.S)
            desc = text_of(m_desc.group(1)) if m_desc else ""
            # 松菸「展演資訊」混著市集、論壇、表演，只留看起來是展覽的
            if not re.search(r"展|博覽", title + desc) or "攻略" in title:
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
        m_room = re.search(r"地點：([^<]*)", block)
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
        out.append(venue_event(
            "ntcam", ex["ExNo"], ex.get("ExName") or "", start, end,
            f"https://ntcart.museum/exhibition_content.aspx?id={ex['ExNo']}",
            text_of(ex.get("ExInfo")), price=text_of(ex.get("ExCost")),
            room=text_of(ex.get("ExLocationTextTW")),
        ))
    return out


def title_key(title):
    # 比對用：拿掉括號註記、標點和空白
    t = re.sub(r"[（(【\[][^）)】\]]*[）)】\]]", "", title)
    return re.sub(r"[\W_]+", "", t).lower()


def is_dup(title, keys):
    k = title_key(title)
    if not k:
        return True
    return any(k == o or (min(len(k), len(o)) >= 6 and (k in o or o in k)) for o in keys)


def main():
    out = from_culture()
    keys = [title_key(e["title"]) for e in out]
    for name, scrape in [("華山", huashan), ("松菸", songshan), ("北美館", tfam),
                         ("中正紀念堂", cksmh), ("新北市美術館", ntcam)]:
        try:
            found = scrape()
        except Exception as exc:  # 單一場館壞掉不影響其他來源
            print(f"::warning::{name} 抓取失敗：{exc}")
            continue
        added = 0
        for e in found:
            if is_dup(e["title"], keys):
                continue
            keys.append(title_key(e["title"]))
            out.append(e)
            added += 1
        print(f"{name}: found {len(found)}, added {added}")

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
