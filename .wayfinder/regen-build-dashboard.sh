#!/bin/bash
# Regenerates the Wayfinder Build Board artifact — tracks implementation
# progress of the 42 tickets, separate from the sibling dashboard-out.html
# (regen.sh), which tracks design-resolution status on GitHub.
#
# Usage: .wayfinder/regen-build-dashboard.sh
# Then publish build-dashboard-out.html via the Artifact tool. Pass the
# existing Build Board URL as `url` to redeploy in place (see README.md) —
# omitting `url` creates a new, separate artifact.
#
# Update build-status.json (key -> {status: done|in-progress|not-started, note})
# whenever a ticket's implementation starts or lands, then re-run this script.
# A ticket with no entry in build-status.json defaults to not-started.
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "Merging tickets-meta.json with build-status.json..."
WAYFINDER_DIR="$DIR" python3 << 'PYEOF'
import json, os

d = os.environ["WAYFINDER_DIR"]
tickets = json.load(open(f"{d}/tickets-meta.json"))
build_status = json.load(open(f"{d}/build-status.json"))

by_key = {t["key"]: t for t in tickets}
memo = {}

def wave(key):
    if key in memo:
        return memo[key]
    blockers = by_key[key]["blockers"]
    memo[key] = 0 if not blockers else 1 + max(wave(b) for b in blockers)
    return memo[key]

STATUS_MAP = {"done": "done", "in-progress": "progress", "not-started": "pending"}

merged = []
for t in tickets:
    entry = build_status.get(t["key"], {})
    raw_status = entry.get("status", "not-started")
    merged.append({
        "key": t["key"],
        "title": t["title"],
        "blockers": t["blockers"],
        "gist": t.get("gist"),
        "wave": wave(t["key"]),
        "status": STATUS_MAP[raw_status],
        "note": entry.get("note"),
    })
merged.sort(key=lambda t: (t["wave"], t["key"]))
json.dump(merged, open(f"{d}/build-merged.json", "w"))
print(f"Merged {len(merged)} tickets.")
PYEOF

echo "Building mermaid graph..."
WAYFINDER_DIR="$DIR" python3 << 'PYEOF'
import json, os

d = os.environ["WAYFINDER_DIR"]
data = json.load(open(f"{d}/build-merged.json"))
by_key = {t["key"]: t for t in data}


def esc(s):
    return s.replace('"', "'")


def short(title, n=32):
    return title if len(title) <= n else title[: n - 1] + "…"


waves = {}
for t in data:
    waves.setdefault(t["wave"], []).append(t)

lines = ["flowchart TD"]
for w in sorted(waves):
    lines.append(f'  subgraph W{w}["Wave {w}"]')
    for t in sorted(waves[w], key=lambda x: x["key"]):
        label = esc(f'{t["key"]} {short(t["title"])}')
        lines.append(f'    N{t["key"]}["{label}"]:::{t["status"]}')
    lines.append("  end")
for t in data:
    for b in t["blockers"]:
        lines.append(f'  N{b} --> N{t["key"]}')
lines += [
    "  classDef done fill:#1c3a30,stroke:#6fbf8b,color:#c9ecd7,stroke-width:1.5px;",
    "  classDef progress fill:#3a2f14,stroke:#e2a63b,color:#f6dba8,stroke-width:1.5px;",
    "  classDef pending fill:#23283a,stroke:#5c6188,color:#aab0d4,stroke-width:1px;",
]
open(f"{d}/build-mermaid.txt", "w").write("\n".join(lines))
PYEOF

echo "Injecting into template..."
WAYFINDER_DIR="$DIR" python3 << 'PYEOF'
import json, os, datetime

d = os.environ["WAYFINDER_DIR"]
html = open(f"{d}/build-dashboard-template.html").read()
tickets_json = open(f"{d}/build-merged.json").read()
mermaid_src = open(f"{d}/build-mermaid.txt").read()
updated_at = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
html = html.replace("__TICKETS_JSON__", tickets_json)
html = html.replace("__MERMAID_SOURCE__", mermaid_src)
html = html.replace("__UPDATED_AT__", updated_at)
open(f"{d}/build-dashboard-out.html", "w").write(html)
print(f"Wrote {d}/build-dashboard-out.html ({len(html)} bytes), stamped {updated_at}")
PYEOF

echo "Done. Publish $DIR/build-dashboard-out.html with the Artifact tool."
