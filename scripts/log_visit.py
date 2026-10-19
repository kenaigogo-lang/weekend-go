"""把「我們去過了」issue 表單的內容寫進 docs/data/visited.json，並重新產生 行程紀錄.md。"""
import json
import os
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
VISITED = ROOT / "docs" / "data" / "visited.json"
ROUTES = ROOT / "docs" / "data" / "routes.json"
DOC = ROOT / "行程紀錄.md"


def parse_form(body):
    """issue form 的內文長這樣：### 標題\n\n值\n\n### 標題 ..."""
    fields = {}
    for block in re.split(r"^### ", body or "", flags=re.M)[1:]:
        label, _, value = block.partition("\n")
        value = value.strip()
        fields[label.strip()] = "" if value == "_No response_" else value
    return fields


def render_doc(visits, names):
    lines = ["# 行程紀錄", "", "真的有出門的紀錄，由網頁上的「✅ 我們去了」自動寫入。", "",
             "| 日期 | 行程 | 評分 | 心得 |", "|---|---|---|---|"]
    for v in sorted(visits, key=lambda v: v["date"], reverse=True):
        note = v.get("note", "").replace("\n", " ").replace("|", "／")
        lines.append(f"| {v['date']} | {v['title']} | {v.get('rating', '')} | {note} |")
    count = {}
    for v in visits:
        if v.get("route"):
            count[v["route"]] = count.get(v["route"], 0) + 1
    never = [n for rid, n in names.items() if rid not in count]
    lines += ["", f"## 還沒去過的路線（{len(never)}）", ""] + [f"- {n}" for n in never]
    return "\n".join(lines) + "\n"


def main():
    fields = parse_form(os.environ.get("ISSUE_BODY", ""))
    names = {r["id"]: r["name"] for r in json.loads(ROUTES.read_text(encoding="utf-8"))["routes"]}

    raw = fields.get("行程", "").strip()
    rid = raw.split()[0] if raw else ""
    if rid in names:
        title = names[rid]
    else:
        rid, title = "", raw or os.environ.get("ISSUE_TITLE", "").replace("[去過]", "").strip()

    date = fields.get("日期", "").strip().replace("/", "-")
    m = re.match(r"(\d{4})-(\d{1,2})-(\d{1,2})", date)
    date = f"{m[1]}-{int(m[2]):02d}-{int(m[3]):02d}" if m else date

    data = json.loads(VISITED.read_text(encoding="utf-8")) if VISITED.exists() else {"visits": []}
    data["visits"].append({
        "date": date,
        "route": rid,
        "title": title,
        "rating": fields.get("好不好玩", ""),
        "note": fields.get("心得／吃了什麼", ""),
        "issue": int(os.environ.get("ISSUE_NUMBER", "0") or 0),
    })
    VISITED.write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8")
    DOC.write_text(render_doc(data["visits"], names), encoding="utf-8")
    print(f"logged {date} {title}")


if __name__ == "__main__":
    main()
