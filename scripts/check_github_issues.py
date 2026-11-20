# -*- coding: utf-8 -*-
"""抓取 GitHub 仓库 open issues 并以 JSON 输出到 stdout。

原理：GitHub API 匿名调用限流（60 次/小时/IP，共享代理 IP 易爆），
改为抓取 issues 列表 HTML 页并解析其中内嵌的 JSON 数据，无需认证、不受 API 限流影响。
输出：open issue 数组（number/title/author/createdAt/updatedAt/url），按编号倒序。
用法：python scripts/check_github_issues.py
"""
import json
import re
import sys
import urllib.request

REPO = "sustcsugar/obsidian-gantt-calendar"
URL = f"https://github.com/{REPO}/issues?q=is%3Aissue%20is%3Aopen%20sort%3Acreated-desc"

PATTERN = re.compile(
    r'"issue":\{"number":(\d+),"title":"((?:[^"\\]|\\.)*)"'
    r'.*?"createdAt":"([^"]+)","updatedAt":"([^"]+)"'
    r'.*?"author":\{"login":"([^"]+)"'
)


def main() -> int:
    req = urllib.request.Request(
        URL, headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"}
    )
    html = urllib.request.urlopen(req, timeout=30).read().decode("utf-8", "ignore")

    issues = {}
    for m in PATTERN.finditer(html):
        num = int(m.group(1))
        if num in issues:
            continue
        issues[num] = {
            "number": num,
            "title": json.loads('"%s"' % m.group(2)),  # 处理 JSON 转义
            "author": m.group(5),
            "createdAt": m.group(3),
            "updatedAt": m.group(4),
            "url": f"https://github.com/{REPO}/issues/{num}",
        }

    result = sorted(issues.values(), key=lambda x: x["number"], reverse=True)
    json.dump(result, sys.stdout, ensure_ascii=False, indent=2)
    print()
    return 0


if __name__ == "__main__":
    sys.exit(main())
