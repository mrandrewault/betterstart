# Better Start (v3) — “Live channel” + weekly auto-discovery + manual approval

You get:
- Vertical, TikTok-style scroll feed
- Autoplay (muted) + Sound toggle
- Channel bumper + progress bar + “Next up”
- Daily playlist from approved sources (YouTube RSS)
- Global “no repeats” (seen.json in Netlify Blobs)
- Weekly auto-discovery of new candidate channels (YouTube Data API)
- Admin approval UI at `/admin.html`

## Deploy (recommended)
GitHub → Netlify Import (so Functions + Blobs + install step work):
- Build command: `npm install`
- Publish: `.`

## Netlify environment variables (Site settings → Environment variables)
You MUST set:
- `ADMIN_TOKEN` = a long random password you pick
- `YOUTUBE_API_KEY` = a YouTube Data API key (Google Cloud)

## Approving channels (simple)
1) Visit: `https://YOURDOMAIN/admin.html`
2) Paste `ADMIN_TOKEN`
3) You’ll see a “Candidates” list discovered weekly.
4) Choose category (human/music/art/animals) → click Approve.
   Approved sources are used automatically in future daily playlists.

## Discovery schedule
- `discover.mts` runs weekly (Mondays 03:00 UTC) and adds up to ~60 candidates per run.

## Notes
- Discovery uses YouTube Data API search queries. It’s intentionally conservative and still needs your human taste check.
- RSS pulling is used for the actual daily playlist because it’s cheap and reliable.


## v3.2 hotfix
- generator fetch no longer sets a custom user-agent (YouTube can block it). RSS failures now throw with status so /refresh shows a real message.


## v3.5 full package
- Fix XML parsing
- Filter embeddable videos via YouTube Data API
- Improve embeds (youtube-nocookie + permissions + origin)
- Auto-skip failover
