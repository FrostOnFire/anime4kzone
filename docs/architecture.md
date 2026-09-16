# Architecture

## Why three machines

The GPU was rented by the hour, so it could not hold anything that needed to
outlive a session. Everything durable — the database, the uploaded files, the
queue — lives on the always-on main server, and the GPU node is a stateless
consumer: it can be destroyed and recreated between jobs without losing work.

| Machine | Role |
|---|---|
| PC-1 | Any browser. Serves no code of its own. |
| PC-2 | nginx, Express, PostgreSQL, Redis, uploaded files. |
| PC-3 | Rented GPU box. Real-ESRGAN and the queue consumer. |

## Endpoints

All of these live on the Express server and are reached through nginx.

| Endpoint | Purpose |
|---|---|
| `POST /upload` | Accepts the video and metadata, stores the file, queues the job |
| `GET /queue-status` | Queue length, polled by the client every 5 seconds |
| `POST /update-job` | Called by the GPU worker when a job finishes; writes the episode to PostgreSQL |
| `GET /uploads/:filename` | Lets the worker download the source file |
| `GET /get-high-quality-cover` | Fetches a full-size cover from Shikimori |
| `GET /proxy-cover` | Proxies cover images, with host validation |
| `GET /health` | Liveness check |

`/proxy-cover` exists because Shikimori serves images without CORS headers, so
the browser cannot fetch a cover and turn it into an upload attachment on its
own. The proxy validates the host before fetching, so it cannot be used as an
open relay.

## Data model

Five tables, normalised rather than one row per upload:

- `franchises` — one row per franchise, referenced by `animes.franchise_id`
- `animes` — keyed by the **Shikimori id**, not a local sequence, so the same
  anime keeps a stable id across uploads and stays linkable to the API
- `genres` — one row per genre name
- `anime_genres` — the many-to-many join, with a composite primary key. That key
  is what lets `/update-job` insert genre links with `ON CONFLICT DO NOTHING`
  and stay idempotent when the same anime is uploaded again
- `videos` — one row per uploaded episode, keyed by the job id

Opening timestamps are stored as seconds from the start of the episode. The
client only asks for the start: the end is derived as start + 90 seconds, which
is the length of a standard opening.

## The queue

Redis holds a single list, `video_jobs`. The main server `RPUSH`es a JSON job on
upload; the worker `LPOP`s it, and on failure `RPUSH`es it back for a retry.
Queue depth is read with `LLEN`.

Uploads are capped at 3 GB, with hour-long timeouts on Express, nginx and the
HTTP server, because a single episode takes hours to upscale and the transfer
itself is large.

## Known limitations

Worth naming, because they are the parts a second pass would address:

- **A failing job retries forever.** A job that always fails is pushed back onto
  the queue indefinitely. There is no attempt counter and no dead-letter list.
- **Retries go to the back of the queue.** `RPUSH` on failure means a retried
  job waits behind everything queued since.
- **No `GETDEL`-style safety.** `LPOP` removes the job before it is done, so a
  worker that dies mid-job loses it. `BLMOVE` into a processing list would make
  this recoverable.
- **Job status is write-once.** A row lands in `videos` only when the job
  finishes, so a job in flight is invisible to the database; the client sees
  queue depth, not per-job progress.
- **The worker trusts the queue payload.** Paths from the job are used directly
  when building download URLs.
