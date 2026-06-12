#!/usr/bin/env python3
"""公式ページ本文の変更候補を検知する。データ内容の自動更新は行わない。"""

from __future__ import annotations

import hashlib
import html
import json
import re
import sys
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA_FILE = ROOT / "data" / "subsidies.json"
HASH_FILE = ROOT / "scripts" / "hashes.json"
RESULT_FILE = ROOT / "scripts" / "changed_urls.json"
USER_AGENT = "ShimonosekiSubsidyUpdateChecker/1.0 (+GitHub Actions)"


def page_text(url: str) -> str:
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(request, timeout=30) as response:
        charset = response.headers.get_content_charset() or "utf-8"
        source = response.read().decode(charset, errors="replace")
    source = re.sub(r"(?is)<(script|style|noscript).*?>.*?</\1>", " ", source)
    source = re.sub(r"(?s)<!--.*?-->", " ", source)
    source = re.sub(r"(?s)<[^>]+>", " ", source)
    return re.sub(r"\s+", " ", html.unescape(source)).strip()


def digest(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def load_json(path: Path, default):
    if not path.exists():
        return default
    with path.open(encoding="utf-8") as file:
        return json.load(file)


def save_json(path: Path, value) -> None:
    with path.open("w", encoding="utf-8", newline="\n") as file:
        json.dump(value, file, ensure_ascii=False, indent=2)
        file.write("\n")


def main() -> int:
    data = load_json(DATA_FILE, {})
    previous = load_json(HASH_FILE, {})
    current = dict(previous)
    changed = []
    errors = []
    urls = sorted({
        subsidy.get("sourceUrl", "").strip()
        for subsidy in data.get("subsidies", [])
        if subsidy.get("sourceUrl", "").strip()
    })

    for url in urls:
        try:
            new_hash = digest(page_text(url))
            old_hash = previous.get(url)
            current[url] = new_hash
            if old_hash and old_hash != new_hash:
                changed.append(url)
            elif not old_hash:
                print(f"初回記録: {url}")
        except (urllib.error.URLError, TimeoutError, ValueError) as error:
            errors.append({"url": url, "error": str(error)})
            print(f"取得失敗: {url}: {error}", file=sys.stderr)

    save_json(HASH_FILE, current)
    save_json(RESULT_FILE, {"changed": changed, "errors": errors})
    print(f"確認URL: {len(urls)} / 変更候補: {len(changed)} / 取得失敗: {len(errors)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
