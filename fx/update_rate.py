#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""USD/JPYを取得し、公開GitHub IssueのJSONフィードを更新する。"""

from __future__ import annotations

import datetime as dt
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from typing import Any

JST = dt.timezone(dt.timedelta(hours=9), name="JST")
TOKEN = os.environ.get("GITHUB_TOKEN", "").strip()
REPOSITORY = os.environ.get("GITHUB_REPOSITORY", "matzoka/matzoka.github.io")
ISSUE_NUMBER = int(os.environ.get("ISSUE_NUMBER", "1"))
SYMBOLS = ("JPY=X", "USDJPY=X")
TIMEOUT = 20


class FeedError(RuntimeError):
    pass


def request_json(
    url: str,
    *,
    method: str = "GET",
    payload: dict[str, Any] | None = None,
    github: bool = False,
) -> dict[str, Any]:
    headers = {
        "Accept": "application/vnd.github+json" if github else "application/json",
        "User-Agent": "matzoka-usdjpy-feed/1.0",
    }
    if github:
        if not TOKEN:
            raise FeedError("GITHUB_TOKEN がありません")
        headers["Authorization"] = f"Bearer {TOKEN}"
        headers["X-GitHub-Api-Version"] = "2022-11-28"

    body = None
    if payload is not None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        headers["Content-Type"] = "application/json; charset=utf-8"

    last_error: Exception | None = None
    for attempt in range(1, 4):
        req = urllib.request.Request(url, data=body, headers=headers, method=method)
        try:
            with urllib.request.urlopen(req, timeout=TIMEOUT) as response:
                raw = response.read().decode("utf-8")
                return json.loads(raw) if raw else {}
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode("utf-8", errors="replace")
            raise FeedError(f"HTTP {exc.code}: {detail}") from exc
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as exc:
            last_error = exc
            if attempt < 3:
                time.sleep(attempt * 2)
                continue
    raise FeedError(f"通信に失敗しました: {last_error}")


def get_quote() -> tuple[float, dt.datetime, str]:
    errors: list[str] = []
    for symbol in SYMBOLS:
        encoded = urllib.parse.quote(symbol, safe="")
        url = (
            f"https://query1.finance.yahoo.com/v8/finance/chart/{encoded}"
            "?interval=1m&range=1d"
        )
        try:
            data = request_json(url)
            chart = data.get("chart") or {}
            if chart.get("error"):
                raise FeedError(str(chart["error"]))
            results = chart.get("result") or []
            if not results:
                raise FeedError("相場データが空です")
            result = results[0]
            meta = result.get("meta") or {}
            price = meta.get("regularMarketPrice")
            timestamp = meta.get("regularMarketTime")

            if price is None:
                timestamps = result.get("timestamp") or []
                quotes = ((result.get("indicators") or {}).get("quote") or [])
                closes = (quotes[0].get("close") if quotes else None) or []
                for ts_value, close_value in reversed(list(zip(timestamps, closes))):
                    if close_value is not None:
                        price = close_value
                        timestamp = ts_value
                        break

            if price is None or timestamp is None:
                raise FeedError("現在値または更新時刻がありません")

            quote_time = dt.datetime.fromtimestamp(
                int(timestamp), tz=dt.timezone.utc
            ).astimezone(JST)
            return float(price), quote_time, f"Yahoo Finance ({symbol})"
        except Exception as exc:
            errors.append(f"{symbol}: {exc}")

    raise FeedError(" / ".join(errors))


def update_issue(rate: float, quote_time: dt.datetime, source: str) -> None:
    now = dt.datetime.now(JST)
    feed = {
        "pair": "USDJPY",
        "rate": round(rate, 3),
        "quote_time_jst": quote_time.strftime("%Y-%m-%d %H:%M:%S JST"),
        "feed_updated_jst": now.strftime("%Y-%m-%d %H:%M:%S JST"),
        "source": source,
        "note": "Indicative quote; not an executable SBI FX price."
    }
    url = f"https://api.github.com/repos/{REPOSITORY}/issues/{ISSUE_NUMBER}"
    request_json(
        url,
        method="PATCH",
        payload={"body": json.dumps(feed, ensure_ascii=False, separators=(",", ":"))},
        github=True,
    )
    print(json.dumps(feed, ensure_ascii=False))


def main() -> int:
    try:
        rate, quote_time, source = get_quote()
        update_issue(rate, quote_time, source)
        return 0
    except Exception as exc:
        print(f"更新失敗: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
