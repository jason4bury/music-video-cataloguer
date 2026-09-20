# Music Video Cataloguer

A self-hosted web app for browsing, tagging, and playing a local music video
collection. Node.js/Express backend, vanilla JS frontend, SQLite for
metadata, ffmpeg for thumbnails/durations — all in one Docker container.

## Expected library layout

```
/videos/
  Daft Punk/
    Daft Punk - Around the World.mp4
    Daft Punk - One More Time.mp4
  Sia/
    Sia - Chandelier.mp4
```

One folder per artist. Filenames can either be `Artist - Title.mp4` or just
`Title.mp4` — the folder name is always used as the artist; a matching
`Artist - ` prefix in the filename is stripped automatically. Supported
extensions: `.mp4 .mkv .avi .webm .mov .m4v`.

## Running it

1. Copy `.env.example` to `.env` and fill in your library path, configs
   path, and login credentials.
2. Pull and start:
   ```bash
   docker compose up -d
   ```
   This pulls the published image (`jason4bury/music-video-cataloguer` on
   Docker Hub) — no local build needed. If you'd rather build from source
   instead, swap the `image:` line in `docker-compose.yml` for `build: .`.
3. Open `http://<your-server>:<APP_PORT>` and sign in.

On first start the app scans the whole library, generating a thumbnail and
reading the duration for every video with ffmpeg/ffprobe (bundled in the
image). A progress bar appears in the sidebar while this runs — progress is
also visible in `docker compose logs -f`. After that, it rescans every hour
by default (`SCAN_INTERVAL_MINUTES`).

## Login

The app is gated behind a single login screen. On the very first start it
creates one account from the `AUTH_USERNAME`/`AUTH_PASSWORD` in your `.env`
(defaults to `admin` / whatever you set there). Leave `AUTH_PASSWORD` blank
and a random one is generated and printed once to `docker compose logs` —
check there if you forget it. There's currently no in-app way to change the
password; edit `.env` and delete the `users` row from your data folder's
`catalogue.db` (or delete the whole data folder to start fresh) to reset it.

Sessions are kept in memory, so restarting the container signs everyone
out. Set `SESSION_SECRET` to a fixed random string if you'd rather sessions
survive restarts (they'll still expire after 30 days either way).

## Data persistence

The SQLite database and generated thumbnails live in `/data` inside the
container, mapped to a host folder by the compose file. Back that folder up
if you've spent time tagging/playlisting — it's the only state that isn't
derived from your video files.

## Features

- Auto-scanning library import with metadata parsed from folder/filename,
  with a live progress bar during scans
- Thumbnail + duration extraction via ffmpeg
- Search by artist/title, filter by artist or tag, favorites-only toggle
- Sort by artist, title, date added, or duration
- Tagging, favoriting, and watched-status tracking
- Playlists: create, delete, add/remove videos (including a quick "+"
  button right on each thumbnail), filter grid by playlist
- Range-request video streaming (scrubbing works properly in the browser)
- Login screen gating the whole app

## Configuration

Set these in `.env` (see `.env.example`) — they configure the host side of
`docker-compose.yml`. There are no built-in fallbacks for the path/port
variables, so they need a real value in `.env`:

| Variable | Example | Purpose |
|---|---|---|
| `LIBRARY_PATH` | *(required)* | Host folder containing your artist subfolders |
| `CONFIGS` | *(required)* | Host folder for app configs — this app's data/thumbnails land in `<CONFIGS>/music-video-cataloguer` |
| `APP_PORT` | `3001` | Port the app is reachable on |
| `SCAN_INTERVAL_MINUTES` | `60` | Periodic rescan interval; `0` disables it (blank also disables it) |
| `AUTH_USERNAME` | `admin` | Login username, set on first start only (blank falls back to `admin`) |
| `AUTH_PASSWORD` | `changeme` | Login password, set on first start only — leave blank to have one generated and printed to logs |
| `SESSION_SECRET` | *(blank)* | Optional — set this to keep sessions alive across restarts |

These are separate from the container's own internal env vars
(`LIBRARY_PATH=/videos`, `DATA_DIR=/data`, etc., set in the `Dockerfile`),
which you shouldn't need to touch.

## Notes

- The library volume is mounted read-only (`:ro`) — the app never modifies
  or deletes your video files, only its own database.
- Deleting or moving a file from the library and rescanning removes it (and
  its thumbnail) from the catalogue automatically.

## License

MIT — see [LICENSE](LICENSE). See [CHANGELOG.md](CHANGELOG.md) for release history.
