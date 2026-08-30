#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
每日龙虎榜抓取脚本（沪深主板）
================================
数据源：东方财富数据中心公开接口（原始出处为沪深交易所"交易公开信息"）
- 榜单列表：RPT_DAILYBILLBOARD_DETAILSNEW
- 买方前五席位：RPT_BILLBOARD_DAILYDETAILSBUY
- 卖方前五席位：RPT_BILLBOARD_DAILYDETAILSSELL

用法：
    python scripts/fetch_lhb.py                     # 抓北京时间今天
    python scripts/fetch_lhb.py 2026-08-28          # 抓指定日期
    python scripts/fetch_lhb.py 2026-08-28 --force  # 强制重抓

输出：
    data/YYYY-MM-DD.json   单日榜单（含买一~买五、卖一~卖五席位及金额）
    data/index.json        历史归档索引（历史页数据源）

说明：
    - 仅收录沪深主板：沪 600/601/603/605，深 000/001/002/003
      （排除创业板 300/301、科创板 688/689、北交所）
    - 对"深股通专用""沪股通专用""机构专用"席位打标签，深股通买入重点标注
    - 仅依赖 Python 标准库（3.8+），兼容 Linux（GitHub Actions）与 Windows
"""
import json
import os
import sys
import time
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone

# 北京时间（UTC+8，无夏令时）
CST = timezone(timedelta(hours=8))

API_URL = "https://datacenter-web.eastmoney.com/api/data/v1/get"
HEADERS = {
    "User-Agent": ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                   "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"),
    "Referer": "https://data.eastmoney.com/stock/tradedetail.html",
}

# 沪深主板代码前缀
MAINBOARD_PREFIXES = ("600", "601", "603", "605", "000", "001", "002", "003")

# 重点席位关键词 → 标签（用于前端特别标注）
SEAT_TAG_RULES = [
    ("深股通", "深股通"),
    ("沪股通", "沪股通"),
    ("机构专用", "机构"),
]

# 游资席位关键词（市场公认的活跃游资大本营，匹配到即标注"游资"标签）
# 说明：游资席位会随市场变化，此处为常见公认席位，可按需增删
YOUZI_KEYWORDS = (
    # 东方财富拉萨系（散户/游资聚集地）
    "拉萨团结路", "拉萨东环路", "拉萨金融城", "拉萨柳梧新区", "拉萨北京中路",
    # 知名游资席位
    "上海江苏路",       # 国泰君安上海江苏路（章盟主）
    "上海溧阳路",       # 中信上海溧阳路（孙哥）
    "绍兴证券营业部",   # 银河绍兴（赵老哥）
    "益田路荣超",       # 华泰深圳益田路荣超商务中心
    "宁波解放南路",     # 光大宁波解放南路（敢死队）
    "杭州延安路",       # 方正杭州延安路
    "华鑫证券上海分公司", "华鑫证券上海茅台路", "华鑫证券上海宛平南路",  # 炒股养家系
    "上海牡丹江路",     # 招商证券上海牡丹江路
    "深圳益田路",       # 华泰系
    "上海武定路",       # 知名游资
    "杭州体育馆",       # 知名游资
)

DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data")


def api(report, flt, sort_cols, sort_types, page_size=500):
    """调用东方财富 datacenter 接口，返回 data 数组（失败自动重试 3 次）。"""
    params = urllib.parse.urlencode({
        "reportName": report,
        "columns": "ALL",
        "filter": flt,
        "sortColumns": sort_cols,
        "sortTypes": sort_types,
        "pageSize": page_size,
        "pageNumber": 1,
        "source": "WEB",
        "client": "WEB",
    })
    req = urllib.request.Request(API_URL + "?" + params, headers=HEADERS)
    last_err = None
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                payload = json.load(resp)
            result = payload.get("result") or {}
            return result.get("data") or []
        except Exception as err:
            last_err = err
            time.sleep(2 * (attempt + 1))
    raise RuntimeError("接口请求失败 %s %s: %s" % (report, flt, last_err))


def fnum(v):
    """金额/价格字段转 float（保留 2 位），空值返回 None。单位：元。"""
    try:
        return round(float(v), 2)
    except (TypeError, ValueError):
        return None


def fetch_list(date_str):
    flt = "(TRADE_DATE<='%s')(TRADE_DATE>='%s')" % (date_str, date_str)
    return api("RPT_DAILYBILLBOARD_DETAILSNEW", flt, "SECURITY_CODE,TRADE_DATE", "1,-1")


def fetch_seats(date_str, code, side):
    """side: 'buy' 买方前五 / 'sell' 卖方前五，按金额降序取前 5。"""
    report = "RPT_BILLBOARD_DAILYDETAILSBUY" if side == "buy" else "RPT_BILLBOARD_DAILYDETAILSSELL"
    col = "BUY" if side == "buy" else "SELL"
    flt = "(TRADE_DATE='%s')(SECURITY_CODE=\"%s\")" % (date_str, code)
    rows = api(report, flt, col, "-1")
    return [
        {
            "name": (r.get("OPERATEDEPT_NAME") or "").strip(),
            "buy": fnum(r.get("BUY")),
            "sell": fnum(r.get("SELL")),
            "net": fnum(r.get("NET")),
        }
        for r in rows[:5]
    ]


def seat_tags(name):
    tags = [tag for keyword, tag in SEAT_TAG_RULES if keyword in name]
    if any(kw in name for kw in YOUZI_KEYWORDS):
        tags.append("游资")
    return tags


def build_stocks(date_str, rows):
    # 同一股票可能触发多条上榜规则而出现多行：按代码去重并合并原因
    merged = {}
    for r in rows:
        code = (r.get("SECURITY_CODE") or "").zfill(6)
        if not code.startswith(MAINBOARD_PREFIXES):
            continue
        item = merged.setdefault(code, {
            "code": code,
            "name": r.get("SECURITY_NAME_ABBR") or code,
            "close": fnum(r.get("CLOSE_PRICE")),
            "changePct": fnum(r.get("CHANGE_RATE")),
            "turnoverRate": fnum(r.get("TURNOVERRATE")),
            "amount": fnum(r.get("ACCUM_AMOUNT")),
            "lhbNet": fnum(r.get("BILLBOARD_NET_AMT")),
            "lhbBuy": fnum(r.get("BILLBOARD_BUY_AMT")),
            "lhbSell": fnum(r.get("BILLBOARD_SELL_AMT")),
            "reasons": [],
        })
        reason = (r.get("EXPLANATION") or "").strip()
        if reason and reason not in item["reasons"]:
            item["reasons"].append(reason)

    stocks = []
    for code in sorted(merged):
        item = merged[code]
        item["reason"] = "；".join(item.pop("reasons"))
        buy_seats = fetch_seats(date_str, code, "buy")
        sell_seats = fetch_seats(date_str, code, "sell")
        for seat in buy_seats + sell_seats:
            seat["tags"] = seat_tags(seat["name"])
        item["buySeats"] = buy_seats
        item["sellSeats"] = sell_seats

        # 沪深股通/机构专用：同一席位的净额在买榜与卖榜中一致，按席位名去重后求和
        def special_net(tag_names):
            seen = {}
            for side in ("buySeats", "sellSeats"):
                for s in item[side]:
                    if any(t in s["tags"] for t in tag_names) and s["net"] is not None:
                        seen[s["name"]] = s["net"]
            return round(sum(seen.values()), 2) if seen else None

        item["gutongNet"] = special_net(("深股通", "沪股通"))
        item["orgNet"] = special_net(("机构",))
        item["youziNet"] = special_net(("游资",))
        item["hasGutongBuy"] = any(("深股通" in s["tags"] or "沪股通" in s["tags"]) for s in buy_seats)
        item["hasDeepBuy"] = any("深股通" in s["tags"] for s in buy_seats)
        item["hasOrgBuy"] = any("机构" in s["tags"] for s in buy_seats)
        item["hasYouziBuy"] = any("游资" in s["tags"] for s in buy_seats)
        stocks.append(item)
        print("  %s %s：买方 %d 席 / 卖方 %d 席" % (code, item["name"], len(buy_seats), len(sell_seats)))
        time.sleep(0.4)  # 控制请求频率
    return stocks


def write_outputs(date_str, stocks):
    os.makedirs(DATA_DIR, exist_ok=True)
    now = datetime.now(CST).isoformat(timespec="seconds")
    doc = {
        "date": date_str,
        "fetchedAt": now,
        "market": "沪深主板",
        "source": "东方财富数据中心（原始出处：沪深交易所交易公开信息）",
        "summary": {
            "count": len(stocks),
            "netTotal": round(sum(s["lhbNet"] or 0 for s in stocks), 2),
            "gutongBuyCount": sum(1 for s in stocks if s["hasGutongBuy"]),
            "gutongNet": round(sum(s["gutongNet"] or 0 for s in stocks if s["gutongNet"]), 2),
            "orgBuyCount": sum(1 for s in stocks if s["hasOrgBuy"]),
            "orgNet": round(sum(s["orgNet"] or 0 for s in stocks if s["orgNet"]), 2),
            "youziBuyCount": sum(1 for s in stocks if s["hasYouziBuy"]),
            "youziNet": round(sum(s["youziNet"] or 0 for s in stocks if s["youziNet"]), 2),
        },
        "stocks": stocks,
    }
    path = os.path.join(DATA_DIR, date_str + ".json")
    with open(path, "w", encoding="utf-8") as f:
        json.dump(doc, f, ensure_ascii=False, indent=2)
    print("已写入 %s" % path)

    # 更新归档索引 index.json
    idx_path = os.path.join(DATA_DIR, "index.json")
    index = {"updatedAt": now, "dates": []}
    if os.path.exists(idx_path):
        try:
            with open(idx_path, encoding="utf-8") as f:
                index = json.load(f)
        except (json.JSONDecodeError, OSError):
            pass
    index["updatedAt"] = now
    index["dates"] = [e for e in index.get("dates", []) if e.get("date") != date_str]
    index["dates"].append({
        "date": date_str,
        "count": doc["summary"]["count"],
        "netTotal": doc["summary"]["netTotal"],
        "gutongBuyCount": doc["summary"]["gutongBuyCount"],
        "gutongNet": doc["summary"]["gutongNet"],
        "youziBuyCount": doc["summary"]["youziBuyCount"],
        "youziNet": doc["summary"]["youziNet"],
    })
    index["dates"].sort(key=lambda e: e["date"], reverse=True)
    with open(idx_path, "w", encoding="utf-8") as f:
        json.dump(index, f, ensure_ascii=False, indent=2)
    print("已更新 %s（共 %d 个交易日）" % (idx_path, len(index["dates"])))


def main():
    argv = sys.argv[1:]
    force = "--force" in argv
    positional = [a for a in argv if a and not a.startswith("--")]
    date_str = positional[0] if positional else datetime.now(CST).strftime("%Y-%m-%d")

    try:
        datetime.strptime(date_str, "%Y-%m-%d")
    except ValueError:
        print("日期格式应为 YYYY-MM-DD：%r" % date_str)
        return 2

    out_path = os.path.join(DATA_DIR, date_str + ".json")
    if os.path.exists(out_path) and not force:
        print("%s 数据已存在，跳过（如需重抓请加 --force）" % date_str)
        return 0

    print("抓取 %s 龙虎榜（沪深主板）…" % date_str)
    rows = fetch_list(date_str)
    if not rows:
        print("%s 无龙虎榜数据（可能为非交易日或尚未披露），不生成文件。" % date_str)
        return 0

    stocks = build_stocks(date_str, rows)
    if not stocks:
        print("%s 上榜个股均非沪深主板，不生成文件。" % date_str)
        return 0

    write_outputs(date_str, stocks)
    print("完成：%s 共 %d 只沪深主板个股上榜。" % (date_str, len(stocks)))
    return 0


if __name__ == "__main__":
    sys.exit(main())
