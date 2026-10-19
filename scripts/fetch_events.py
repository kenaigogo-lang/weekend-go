"""抓文化部藝文活動開放資料，留下樹林開車可到、正在展出（或兩週內開展）的展覽，輸出 docs/data/events.json。"""
import json
import math
import re
import sys
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path

SOURCE = "https://cloud.culture.tw/frontsite/trans/SearchShowAction.do?method=doFindTypeJ&category=all"
ORIGIN = (24.9906, 121.4246)  # 樹林火車站
AREA = re.compile(r"臺北|台北|新北|桃園|基隆")
OUT = Path(__file__).resolve().parent.parent / "docs" / "data" / "events.json"
TW = timezone(timedelta(hours=8))


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


def is_exhibition(e):
    if e.get("category") == "6":
        return True
    return e.get("category") in {"15", "16", "200"} and "展" in e.get("title", "")


def main():
    req = urllib.request.Request(SOURCE, headers={"User-Agent": "weekend-go/1.0"})
    with urllib.request.urlopen(req, timeout=120) as resp:
        data = json.loads(resp.read().decode("utf-8"))

    today = datetime.now(TW).date()
    soon = today + timedelta(days=14)
    out = []
    for e in data:
        if not is_exhibition(e):
            continue
        try:
            start = datetime.strptime(e["startDate"], "%Y/%m/%d").date()
            end = datetime.strptime(e["endDate"], "%Y/%m/%d").date()
        except (KeyError, ValueError):
            continue
        if end < today or start > soon:
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
        url = e.get("sourceWebPromote") or e.get("webSales") or ""
        desc = re.sub(r"\s+", " ", e.get("descriptionFilterHtml") or "").strip()
        out.append({
            "id": e["UID"],
            "title": e["title"].strip(),
            "start": start.isoformat(),
            "end": end.isoformat(),
            "place": (info.get("locationName") or "").strip(),
            "address": (info.get("location") or "").strip(),
            "lat": c[0] if c else None,
            "lng": c[1] if c else None,
            "km": round(km, 1) if km is not None else None,
            # 粗估週末車程：市區繞路＋塞車，經驗值
            "min": round(5 + km * 1.6) if km is not None else None,
            "price": (info.get("price") or "").strip(),
            "url": url,
            "unit": (e.get("showUnit") or "").strip(),
            "desc": desc[:160],
            "permanent": (end - start).days > 300,
        })

    out.sort(key=lambda x: (x["permanent"], x["end"]))
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps({
        "updated": datetime.now(TW).strftime("%Y-%m-%d %H:%M"),
        "events": out,
    }, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"kept {len(out)} of {len(data)} events")


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:  # 抓不到就沿用舊資料，不讓整個部署失敗
        print(f"fetch failed: {exc}", file=sys.stderr)
        sys.exit(1)
