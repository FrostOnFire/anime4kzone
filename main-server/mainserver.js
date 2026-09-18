// mainserver.js
const { getAccessToken } = require('./shikimoriTokenManager');
const express = require('express');
const fileUpload = require('express-fileupload');
const path = require('path');
const cors = require('cors');
const fs = require('fs');
const http = require('http');
const { v4: uuidv4 } = require('uuid');
const redis = require('redis');
const { Pool } = require('pg');
const fetch = require('node-fetch'); // node-fetch v2, the last version that works with require()

require('dotenv').config(); // loads environment variables from .env

const app = express();
app.set('trust proxy', true);

// CORS only matters when the client is served from a different host. Behind the
// bundled nginx config it is same-origin, so nothing is sent. Reflecting back
// whatever Origin arrives while also allowing credentials would be unsafe.
if (process.env.CLIENT_ORIGIN) {
    app.use(cors({
        origin: process.env.CLIENT_ORIGIN,
        credentials: true
    }));
    app.options('*', cors());
}

// Request size limits and timeouts
app.use(express.json({ limit: '3gb', timeout: 3600000 }));
app.use(express.urlencoded({ extended: true, limit: '3gb', timeout: 3600000 }));

// Upload directory
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

// Redis, the job queue the GPU worker reads from
const redisClient = redis.createClient({
    url: process.env.REDIS_URL || 'redis://localhost:6379',
});

redisClient.on('error', (err) => {
    console.error('Redis error:', err);
});

redisClient.on('connect', () => {
    console.log('Connected to Redis');
});

// Connect to Redis
(async () => {
    try {
        await redisClient.connect();
        console.log('Redis client connected');
    } catch (err) {
        console.error('Redis connection error:', err);
    }
})();

// PostgreSQL connection
const pool = new Pool({
    user: process.env.DB_USER || 'anime4kzone',
    host: process.env.DB_HOST || 'localhost',
    database: process.env.DB_NAME || 'anime4kzone',
    password: process.env.DB_PASSWORD, // never hardcode the password
    port: Number(process.env.DB_PORT) || 5432,
});

pool.on('error', (err) => {
    console.error('Unexpected error on idle client', err);
});

pool.on('connect', () => {
    console.log('Connected to PostgreSQL');
});

// File upload handling
app.use(fileUpload({
    limits: { fileSize: 3 * 1024 * 1024 * 1024 }, // max file size: 3 GB
    useTempFiles: true,
    tempFileDir: '/tmp/',
    uploadTimeout: 3600000 // upload timeout: 1 hour
}));


app.get('/get-high-quality-cover', async (req, res) => {
    const animeId = req.query.id;
    if (!animeId) {
      return res.status(400).json({ error: 'No anime ID provided' });
    }
  
    try {
      // Fetch a current access token
      const accessToken = await getAccessToken();
  
      const query = `
        query ($id: ID!) {
          anime(id: $id) {
            images {
              maximum
              original
            }
          }
        }
      `;
  
      const variables = { id: animeId };
  
      const response = await fetch('https://shikimori.one/api/graphql', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'YourAppName/1.0 (your-email@example.com)',
          'Authorization': `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ query, variables }),
      });
  
      const data = await response.json();
  
      if (data && data.data && data.data.anime && data.data.anime.images) {
        const coverUrl = data.data.anime.images.maximum || data.data.anime.images.original;
        res.json({ coverUrl });
      } else {
        res.status(404).json({ error: 'Cover image not found' });
      }
    } catch (error) {
      console.error('Error fetching high-quality cover:', error);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  });


// Proxies cover images so the browser never calls Shikimori directly
app.get('/proxy-cover', async (req, res) => {
    const imageUrl = req.query.url;
    if (!imageUrl) {
        return res.status(400).json({ error: 'No URL provided' });
    }

    try {
        // Host validation
        const urlObject = new URL(imageUrl);
        if (urlObject.hostname !== 'shikimori.one') {
            return res.status(400).json({ error: 'Invalid host' });
        }

        const response = await fetch(imageUrl);
        if (!response.ok) {
            return res.status(response.status).json({ error: 'Error fetching image' });
        }

        const contentType = response.headers.get('content-type');
        res.set('Content-Type', contentType);

        // Stream the image through
        response.body.pipe(res);
    } catch (error) {
        console.error('Error in /proxy-cover:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// Accepts an upload and queues an upscale job
app.post('/upload', async (req, res) => {
    console.log('Received /upload request');
    try {
        if (!req.files || !req.body) {
            console.log('No files or metadata were uploaded.');
            return res.status(400).send('No files or metadata were uploaded.');
        }

        // Metadata from the upload form
        const metadata = req.body;
        console.log('Metadata received:', metadata);

        // Unique job id
        const uniqueId = uuidv4();
        const videoFile = req.files.file;
        const coverFile = req.files.cover_file; // cover image, if one was uploaded

        const safeVideoFileName = path.basename(videoFile.name);
        const inputPath = path.join(uploadDir, `${uniqueId}_${safeVideoFileName}`);

        let coverPath = null;
        if (coverFile) {
            const safeCoverFileName = path.basename(coverFile.name);
            coverPath = path.join(uploadDir, `${uniqueId}_cover_${safeCoverFileName}`);

            // Store the cover
            await coverFile.mv(coverPath);
            console.log(`Cover image saved to ${coverPath}`);
            console.log(`Cover file size: ${coverFile.size} bytes`);
        }

        // Store the uploaded video
        await videoFile.mv(inputPath);
        console.log(`Video file saved to ${inputPath}`);

        // Record the source path in the metadata
        metadata.inputPath = inputPath;

        if (coverPath) {
            metadata.coverPath = coverPath; // record the cover path too
        }

        // Build the job
        const job = {
            id: uniqueId,
            inputPath,
            metadata,
        };

        // Push the job onto the queue the GPU worker reads
        await redisClient.RPUSH('video_jobs', JSON.stringify(job));
        console.log(`Job ${uniqueId} added to the Redis queue`);
        res.json({ uniqueId, message: 'Your video is added to the processing queue.' });
    } catch (error) {
        console.error(`Error in /upload route: ${error}`);
        res.status(500).send('Server error');
    }
});

// Queue length, polled by the client
app.get('/queue-status', async (req, res) => {
    console.log('Received /queue-status request');
    try {
        const length = await redisClient.LLEN('video_jobs');
        res.json({ queue_length: length });
    } catch (err) {
        console.error('Error getting queue length:', err);
        res.status(500).json({ error: 'Error getting queue length' });
    }
});

// Called by the GPU worker when a job finishes
app.post('/update-job', async (req, res) => {
    console.log('Received /update-job request');
    const { jobId, status, metadata, videoUrl } = req.body;
    console.log(`Updating job ${jobId} with status ${status}`);

    try {
        // Franchise
        let franchiseId;
        const { rows: existingFranchise } = await pool.query('SELECT id FROM franchises WHERE name = $1', [metadata.franchise]);
        if (existingFranchise.length === 0) {
            const result = await pool.query('INSERT INTO franchises (name) VALUES ($1) RETURNING id', [metadata.franchise]);
            franchiseId = result.rows[0].id;
            console.log(`Created new franchise with ID ${franchiseId}`);
        } else {
            franchiseId = existingFranchise[0].id;
            console.log(`Found existing franchise with ID ${franchiseId}`);
        }

        // Anime
        const { rows: existingAnime } = await pool.query('SELECT id FROM animes WHERE id = $1', [metadata.anime_id]);
        if (existingAnime.length === 0) {
            await pool.query(
                'INSERT INTO animes (id, franchise_id, title, cover, chronology) VALUES ($1, $2, $3, $4, $5)',
                [metadata.anime_id, franchiseId, metadata.anime_title, metadata.anime_cover, metadata.chronology]
            );
            console.log(`Created new anime with ID ${metadata.anime_id}`);
        } else {
            console.log(`Anime with ID ${metadata.anime_id} already exists`);
        }

        // Genres
        const genres = metadata.anime_genre.split(',').map(genre => genre.trim());
        for (let genreName of genres) {
            let { rows: existingGenre } = await pool.query('SELECT id FROM genres WHERE name = $1', [genreName]);
            let genreId;
            if (existingGenre.length === 0) {
                let result = await pool.query('INSERT INTO genres (name) VALUES ($1) RETURNING id', [genreName]);
                genreId = result.rows[0].id;
                console.log(`Created new genre '${genreName}' with ID ${genreId}`);
            } else {
                genreId = existingGenre[0].id;
                console.log(`Genre '${genreName}' already exists with ID ${genreId}`);
            }
            // Many-to-many link between anime and genre
            await pool.query(
                'INSERT INTO anime_genres (anime_id, genre_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
                [metadata.anime_id, genreId]
            );
            console.log(`Linked anime ID ${metadata.anime_id} with genre ID ${genreId}`);
        }

        // Video
        await pool.query(
            `INSERT INTO videos (
                id, anime_id, episode, description, voiceover, opening_start, opening_end, input_path, output_path, status
            ) VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8, $9, $10
            )`,
            [
                jobId,
                metadata.anime_id,
                metadata.episode,
                metadata.description,
                metadata.voiceover,
                metadata.opening_start,
                metadata.opening_end,
                metadata.inputPath,
                videoUrl, // URL returned by the worker
                status
            ]
        );
        console.log(`Saved video information for job ID ${jobId}`);

        // Optional: move the cover elsewhere or upload it to storage
        if (metadata.coverPath) {
            console.log(`Cover image available at: ${metadata.coverPath}`);
            // (not implemented)
        }

        // Drop the source file once the job succeeded
        const inputFilePath = metadata.inputPath;
        fs.unlink(inputFilePath, (err) => {
            if (err) {
                console.error(`Error deleting file ${inputFilePath}:`, err);
            } else {
                console.log(`File ${inputFilePath} deleted successfully`);
            }
        });

        res.json({ message: 'Job updated successfully' });
    } catch (error) {
        console.error(`Error updating job ${jobId}:`, error);
        res.status(500).send('Server error');
    }
});

// Health check
app.get('/health', (req, res) => {
    res.status(200).send('OK');
});

// Lets the GPU worker download the source file
app.get('/uploads/:filename', (req, res) => {
    console.log(`Received request for uploaded file: ${req.params.filename}`);
    const filePath = path.join(uploadDir, req.params.filename);
    res.sendFile(filePath);
});

// Start the server
const PORT = 9090;
const server = http.createServer(app);

// Server timeouts
server.timeout = 3600000; // 1 hour
server.headersTimeout = 4000000;
server.keepAliveTimeout = 4000000;

server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server started on http://0.0.0.0:${PORT}`);
});

// Last-resort handlers
process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception:', err);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});