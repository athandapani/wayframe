#!/bin/bash
# Regenerates the Wayframe Wayfinder dashboard artifact from live GitHub state.
# Run from anywhere; writes ./dashboard-out.html next to this script.
#
# Usage: .wayfinder/regen.sh
# Then: publish dashboard-out.html via the Artifact tool with
#   url: https://claude.ai/code/artifact/7be3c822-3dcb-4f81-a161-7a4b6d6c414e
# to redeploy to the SAME dashboard URL (don't omit `url` — that creates a new artifact).
#
# tickets-meta.json is the source of truth for title/type/blockers (by ticket "key",
# e.g. "t11"). If you add tickets to the map later, add them to that file too, then
# re-run the full create+wire flow for the new ones and append their key->number
# mapping to ticket-key-to-number.json.
set -euo pipefail
REPO="athandapani/wayframe"
MAP_NUMBER=74
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "Fetching live ticket state from GitHub..."
gh api "repos/$REPO/issues/$MAP_NUMBER/sub_issues" --paginate --jq '
  [.[] | {number, title, state, labels: [.labels[].name],
          blocked_by: .issue_dependencies_summary.blocked_by,
          blocking: .issue_dependencies_summary.blocking}]
' > "$DIR/live_tickets.json"

echo "Merging with tracked metadata (types/blockers/gists)..."
jq -s '
  .[0] as $tickets | .[1] as $ids | .[2] as $live |
  [$tickets[] as $t |
    ($ids[$t.key]) as $idinfo |
    ($live[] | select(.number == $idinfo.number)) as $l |
    {
      number: $idinfo.number, key: $t.key, title: $t.title, type: $t.type,
      state: $l.state, blockedByCount: $l.blocked_by, blockingCount: $l.blocking,
      blockers: [$t.blockers[] as $bk | $ids[$bk].number],
      gist: ($t.gist // null)
    }
  ] | sort_by(.number)
' "$DIR/tickets-meta.json" "$DIR/ticket-key-to-number.json" "$DIR/live_tickets.json" > "$DIR/merged.json"

echo "Computing dependency-wave levels..."
WAYFINDER_DIR="$DIR" python3 << 'PYEOF'
import json, os
d = os.environ.get("WAYFINDER_DIR", ".")
data = json.load(open(f"{d}/merged.json"))
by_num = {t['number']: t for t in data}
memo = {}
def level(n):
    if n in memo: return memo[n]
    t = by_num[n]
    memo[n] = 0 if not t['blockers'] else 1 + max(level(b) for b in t['blockers'])
    return memo[n]
for t in data:
    t['wave'] = level(t['number'])
json.dump(data, open(f"{d}/merged.json", 'w'))
PYEOF

echo "Building mermaid graph..."
WAYFINDER_DIR="$DIR" python3 << 'PYEOF'
import json, os
d = os.environ.get("WAYFINDER_DIR", ".")
data = json.load(open(f"{d}/merged.json"))

def status(t):
    if t['state'] == 'closed': return 'resolved'
    return 'frontier' if t['blockedByCount'] == 0 else 'blocked'

def esc(s): return s.replace('"', "'")
def short(title, n=34): return title if len(title) <= n else title[:n-1] + "…"

waves = {}
for t in data: waves.setdefault(t['wave'], []).append(t)

lines = ["flowchart TD"]
for w in sorted(waves):
    lines.append(f'  subgraph W{w}["Wave {w}"]')
    for t in sorted(waves[w], key=lambda x: x['number']):
        num = t['number']
        label = esc(f"#{num} {short(t['title'])}")
        lines.append(f'    N{num}["{label}"]:::{status(t)}')
    lines.append('  end')
for t in data:
    for b in t['blockers']:
        lines.append(f'  N{b} --> N{t["number"]}')
lines += [
  '  classDef resolved fill:#1c3a30,stroke:#6fbf8b,color:#c9ecd7,stroke-width:1.5px;',
  '  classDef frontier fill:#3a2f14,stroke:#e2a63b,color:#f6dba8,stroke-width:1.5px;',
  '  classDef blocked fill:#23283a,stroke:#5c6188,color:#aab0d4,stroke-width:1px;',
]
open(f"{d}/mermaid.txt", 'w').write("\n".join(lines))
PYEOF

echo "Injecting into template..."
python3 - "$DIR" << 'PYEOF'
import sys, json, datetime
d = sys.argv[1]
html = open(f"{d}/dashboard-template.html").read()
tickets_json = open(f"{d}/merged.json").read()
mermaid_src = open(f"{d}/mermaid.txt").read()
updated_at = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
html = html.replace("__TICKETS_JSON__", tickets_json)
html = html.replace("__MERMAID_SOURCE__", mermaid_src)
html = html.replace("__UPDATED_AT__", updated_at)
open(f"{d}/dashboard-out.html", "w").write(html)
print(f"Wrote {d}/dashboard-out.html ({len(html)} bytes), stamped {updated_at}")
PYEOF

echo "Done. Publish $DIR/dashboard-out.html with the Artifact tool, passing the existing dashboard URL as \`url\` to redeploy in place."
