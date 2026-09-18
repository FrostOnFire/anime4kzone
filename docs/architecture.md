# Architecture

## Why three machines

The GPU was rented by the hour, so it could not hold anything that needed to
outlive a session. Everything durable lives on the always-on server: the
database, the uploaded files, the queue. That leaves the GPU node stateless. It
can be destroyed and rebuilt between jobs and nothing is lost.

| Machine | Role |
|---|---|
| PC-1 | Any browser. Runs no code of its own. |
| PC-2 | nginx, Express, PostgreSQL, Redis, the uploaded files. |
| PC-3 | Rented GPU box. Real-ESRGAN and the queue consumer. |

## Endpoints

All of these are on the Express server and reached through nginx.

| Endpoint | Purpose |
|---|---|
| `POST /upload` | Takes the video and metadata, saves the file, queues the job |
| `GET /queue-status` | How many jobs are waiting; the page polls it every 5 seconds |
| `POST /update-job` | The worker calls this when a job finishes; writes the episode to PostgreSQL |
| `GET /uploads/:filename` | Lets the worker download the source file |
| `GET /get-high-quality-cover` | Fetches a full-size cover from Shikimori |
| `GET /proxy-cover` | Proxies cover images, with host validation |
| `GET /health` | Liveness check |

`/proxy-cover` is there because Shikimori serves images without CORS headers,
so the browser cannot fetch a cover and attach it to the upload by itself. The
proxy checks the host before fetching, so it cannot be pointed at anything else.

## Data model

Five tables rather than one row per upload:

- `franchises`, one row per franchise, referenced by `animes.franchise_id`
- `animes`, keyed by the Shikimori id rather than a local sequence, so the same
  anime keeps a stable id across uploads and stays linkable back to the API
- `genres`, one row per genre name
- `anime_genres`, the many-to-many link, with a composite primary key. That key
  is what lets `/update-job` insert genre links with `ON CONFLICT DO NOTHING`
  and stay idempotent when the same anime is uploaded again
- `videos`, one row per uploaded episode, keyed by the job id

Opening timestamps are stored in seconds from the start of the episode. The form
only asks where the opening starts. The end is start plus 90 seconds, because
that is how long a standard opening runs.

## The queue

Redis holds one list, `video_jobs`. The main server `RPUSH`es a JSON job when a
file is uploaded, the worker `LPOP`s it, and on failure pushes it back for
another try. Queue depth comes from `LLEN`.

Uploads are capped at 3 GB, with hour-long timeouts on Express, on nginx and on
the HTTP server itself, because upscaling an episode takes hours and the files
are large to begin with.

## What I would fix next

A job that always fails gets pushed back onto the queue forever. There is no
attempt counter and no dead letter list, so one bad file can cycle indefinitely.

Retries also go to the back of the queue, since the failure path uses `RPUSH`.
A job that fails waits behind everything queued since it first ran.

`LPOP` removes the job before the work is done, so a worker that dies mid-job
takes the job with it. `BLMOVE` into a processing list would make that
recoverable.

Job status is write-once. A row only lands in `videos` once the job finishes, so
a job in flight is invisible to the database. The page can show queue depth but
not per-job progress.

The worker also trusts whatever is in the job payload, using paths from it
directly when it builds the download URL.
