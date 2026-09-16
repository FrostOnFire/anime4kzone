-- Schema the server expects. Reconstructed from the queries in mainserver.js:
-- the tables were originally created by hand on the server, so nothing in the
-- repository described them.
--
--   psql -U anime4kzone -d anime4kzone -f main-server/db/schema.sql

CREATE TABLE IF NOT EXISTS franchises (
    id   SERIAL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE
);

-- id is the Shikimori anime id, not a local sequence, so the same anime keeps
-- the same id across uploads and can be looked up against the API.
CREATE TABLE IF NOT EXISTS animes (
    id           INTEGER PRIMARY KEY,
    franchise_id INTEGER REFERENCES franchises(id),
    title        TEXT NOT NULL,
    cover        TEXT,
    chronology   INTEGER
);

CREATE TABLE IF NOT EXISTS genres (
    id   SERIAL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE
);

-- Many-to-many. The composite primary key is what makes the
-- ON CONFLICT DO NOTHING in /update-job a no-op on repeated uploads.
CREATE TABLE IF NOT EXISTS anime_genres (
    anime_id INTEGER NOT NULL REFERENCES animes(id),
    genre_id INTEGER NOT NULL REFERENCES genres(id),
    PRIMARY KEY (anime_id, genre_id)
);

-- One row per uploaded episode. id is the job id the main server generates on
-- upload and the GPU worker reports back with.
CREATE TABLE IF NOT EXISTS videos (
    id            UUID PRIMARY KEY,
    anime_id      INTEGER REFERENCES animes(id),
    episode       INTEGER,
    description   TEXT,
    voiceover     TEXT,
    opening_start INTEGER,  -- seconds from the start of the episode
    opening_end   INTEGER,  -- opening_start + 90, so a player can offer a skip
    input_path    TEXT,
    output_path   TEXT,
    status        TEXT
);
