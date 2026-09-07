# Wayfinder dashboard

Generates the live progress board for the wayfinder map at
[wayframe#74](https://github.com/athandapani/wayframe/issues/74):

**https://claude.ai/code/artifact/7be3c822-3dcb-4f81-a161-7a4b6d6c414e**

It is a static page, not live-synced to GitHub. **Redeploy it at the end of any
session that resolves, adds, or re-blocks a ticket**, so it stays trustworthy
as an at-a-glance view.

## Regenerating

```
.wayfinder/regen.sh
```

Fetches live state for the map's sub-issues from GitHub, merges it with the
tracked metadata below, computes each ticket's dependency-wave level, builds
the mermaid graph, and writes `.wayfinder/dashboard-out.html`. Then publish
that file with the Artifact tool, passing `url` as the URL above — omitting
`url` creates a *new*, separate artifact instead of updating this one.

## Files

- `dashboard-template.html` — the page shell (design, CSS, layout). Edit this
  for visual changes. Contains three placeholders the script fills in:
  `__TICKETS_JSON__`, `__MERMAID_SOURCE__`, `__UPDATED_AT__`.
- `tickets-meta.json` — source of truth for each ticket's title, type,
  blockers (by `key`, e.g. `"t11"`), and — once resolved — a one-line `gist`
  of the answer. **When a ticket resolves, add its `gist` here** so the board
  shows the decision, not just a closed state.
- `ticket-key-to-number.json` — maps each `key` to its GitHub issue number +
  database id. Extend this when new tickets are created (see below).
- `regen.sh` — the generator described above.
- `dashboard-out.html` — generated output, safe to ignore/regenerate anytime.
- `live_tickets.json`, `merged.json`, `mermaid.txt` — intermediate files from
  the last run, also regenerated each time.

## Adding new tickets to the map later

1. Create the issue(s) as sub-issues of #74, wire native `blocked_by` edges,
   same as the original charting session did.
2. Append an entry to `tickets-meta.json` (title/type/blockers by key).
3. Append its `{key: {number, id}}` to `ticket-key-to-number.json`.
4. Re-run `regen.sh` and redeploy.
