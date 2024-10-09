// mainserver.js

const express = require('express');
const fileUpload = require('express-fileupload');
const path = require('path');
const cors = require('cors');
const fs = require('fs');
const http = require('http');
const { v4: uuidv4 } = require('uuid');
const redis = require('redis');
const { Pool } = require('pg');

require('dotenv').config(); // Используется для загрузки переменных окружения из файла .env

const app = express();
app.set('trust proxy', true);

// Настройка CORS
app.use(cors({
    origin: '{{CLIENT_URL}}', // Замените на URL вашего клиента
    credentials: true
}));

app.options('*', cors());

// Настройка размеров и таймаутов для запросов
app.use(express.json({ limit: '3gb', timeout: 3600000 }));
app.use(express.urlencoded({ extended: true, limit: '3gb', timeout: 3600000 }));

// Настройка директорий для хранения файлов
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

// Подключение к Redis
const redisClient = redis.createClient({
    host: 'localhost', // Если Redis на другом сервере, укажите его IP-адрес
    port: 6379,
    // password: process.env.REDIS_PASSWORD, // Если установлен пароль, раскомментируйте и укажите его
});

redisClient.on('error', (err) => {
    console.error('Redis error:', err);
});

// Подключение к базе данных PostgreSQL
const pool = new Pool({
    user: process.env.DB_USER || 'frost',
    host: 'localhost',
    database: process.env.DB_NAME || 'anime4kzone',
    password: process.env.DB_PASSWORD || 'REDACTED',
    port: 5432,
});

pool.on('error', (err) => {
    console.error('Unexpected error on idle client', err);
});

// Настройка express-fileupload
app.use(fileUpload({
    limits: { fileSize: 3 * 1024 * 1024 * 1024 }, // Максимальный размер файла (3 ГБ)
    useTempFiles: true,
    tempFileDir: '/tmp/',
    uploadTimeout: 3600000 // Таймаут загрузки (1 час)
}));

// Маршрут для загрузки файлов и добавления задач в Redis
app.post('/upload', async (req, res) => {
    try {
        if (!req.files || !req.body) {
            return res.status(400).send('No files or metadata were uploaded.');
        }

        // Извлекаем метаданные из req.body
        const metadata = req.body;

        // Генерируем уникальный идентификатор для задачи
        const uniqueId = uuidv4();
        const videoFile = req.files.file;

        const safeFileName = path.basename(videoFile.name);
        const inputPath = path.join(uploadDir, `${uniqueId}_${safeFileName}`);

        // Сохраняем загруженный файл
        videoFile.mv(inputPath, async function (err) {
            if (err) {
                console.error(`Error saving uploaded file: ${err}`);
                return res.status(500).send(err);
            }

            // Создаём объект задачи
            const job = {
                id: uniqueId,
                inputPath,
                metadata,
            };

            // Добавляем задачу в Redis
            redisClient.rpush('video_jobs', JSON.stringify(job), (err, reply) => {
                if (err) {
                    console.error('Error adding job to Redis:', err);
                    return res.status(500).send('Server error');
                }

                console.log(`Job ${uniqueId} added to the Redis queue`);
                res.json({ uniqueId, message: 'Your video is added to the processing queue.' });
            });
        });
    } catch (error) {
        console.error(`Error in /upload route: ${error}`);
        res.status(500).send('Server error');
    }
});

// Маршрут для обновления информации о задаче после обработки
app.post('/update-job', async (req, res) => {
    const { jobId, status, metadata, videoUrl } = req.body;

    try {
        // Сохранение или обновление информации о франшизе
        let franchiseId;
        const { rows: existingFranchise } = await pool.query('SELECT id FROM franchises WHERE name = $1', [metadata.franchise]);
        if (existingFranchise.length === 0) {
            const result = await pool.query('INSERT INTO franchises (name) VALUES ($1) RETURNING id', [metadata.franchise]);
            franchiseId = result.rows[0].id;
        } else {
            franchiseId = existingFranchise[0].id;
        }

        // Сохранение или обновление информации об аниме
        const { rows: existingAnime } = await pool.query('SELECT id FROM animes WHERE id = $1', [metadata.anime_id]);
        if (existingAnime.length === 0) {
            await pool.query(
                'INSERT INTO animes (id, franchise_id, title, cover, chronology) VALUES ($1, $2, $3, $4, $5)',
                [metadata.anime_id, franchiseId, metadata.anime_title, metadata.anime_cover, metadata.chronology]
            );
        }

        // Обработка жанров
        const genres = metadata.anime_genre.split(',').map(genre => genre.trim());
        for (let genreName of genres) {
            let { rows: existingGenre } = await pool.query('SELECT id FROM genres WHERE name = $1', [genreName]);
            let genreId;
            if (existingGenre.length === 0) {
                let result = await pool.query('INSERT INTO genres (name) VALUES ($1) RETURNING id', [genreName]);
                genreId = result.rows[0].id;
            } else {
                genreId = existingGenre[0].id;
            }
            // Связь аниме с жанром
            await pool.query(
                'INSERT INTO anime_genres (anime_id, genre_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
                [metadata.anime_id, genreId]
            );
        }

        // Сохранение информации о видео
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
                videoUrl, // Сохраняем URL видео из Google Cloud Storage
                status
            ]
        );

        // Удаляем исходный файл после успешной обработки
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

// Предоставление доступа к загруженным файлам для серверов-работников
app.get('/uploads/:filename', (req, res) => {
    const filePath = path.join(uploadDir, req.params.filename);
    res.sendFile(filePath);
});

// Запуск сервера
const PORT = 9090;
const server = http.createServer(app);

// Устанавливаем таймауты для сервера
server.timeout = 3600000; // 1 час
server.headersTimeout = 4000000;
server.keepAliveTimeout = 4000000;

server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server started on http://0.0.0.0:${PORT}`);
});