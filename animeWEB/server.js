// server.js

const express = require('express');
const fileUpload = require('express-fileupload');
const { Worker } = require('worker_threads');
const path = require('path');
const cors = require('cors');
const fs = require('fs');
const https = require('https');
const { v4: uuidv4 } = require('uuid');

const app = express();
app.set('trust proxy', true);

app.use(cors({
    origin: [
        'https://203.0.113.20:54966' // Только HTTPS
    ],
    credentials: true
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(express.static('public'));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/processed', express.static(path.join(__dirname, 'processed')));
app.use(fileUpload({ limits: { fileSize: 1024 * 1024 * 1024 } }));

const uploadDir = path.join(__dirname, 'uploads');
const processedDir = path.join(__dirname, 'processed');

if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
if (!fs.existsSync(processedDir)) fs.mkdirSync(processedDir, { recursive: true });

// Очередь задач в памяти
const jobQueue = [];
let isProcessing = false;

// Маршрут для обработки загрузки файлов и метаданных
app.post('/upload', async (req, res) => {
    try {
        if (!req.files || Object.keys(req.files).length === 0) {
            return res.status(400).send('No files were uploaded.');
        }

        // Извлекаем метаданные из req.body
        const metadata = req.body;

        // Генерируем уникальный идентификатор для этой задачи
        const uniqueId = uuidv4();
        const videoFile = req.files.file;

        const safeFileName = path.basename(videoFile.name);
        const inputPath = path.join(uploadDir, `${uniqueId}_${safeFileName}`);
        const outputPath = path.join(processedDir, `${uniqueId}_${safeFileName}`);

        // Перемещаем загруженный файл в директорию uploads
        videoFile.mv(inputPath, function (err) {
            if (err) {
                console.error(`Error saving uploaded file: ${err}`);
                return res.status(500).send(err);
            }

            // Создаём объект задачи и добавляем его в очередь
            const job = {
                id: uniqueId,
                inputPath,
                outputPath,
                metadata,
                status: 'queued',
            };

            jobQueue.push(job);
            console.log(`Job ${uniqueId} added to the queue`);

            // Запускаем обработку, если она не запущена
            if (!isProcessing) {
                processNextJob();
            }

            res.json({ uniqueId, message: 'Your video is added to the processing queue.' });
        });
    } catch (error) {
        console.error(`Error in /upload route: ${error}`);
        res.status(500).send('Server error');
    }
});

// Функция для обработки следующей задачи в очереди
function processNextJob() {
    if (jobQueue.length === 0) {
        isProcessing = false;
        return;
    }

    isProcessing = true;
    const job = jobQueue.shift();

    console.log(`Starting processing job ${job.id}`);

    // Запускаем новый поток worker для обработки видео
    const worker = new Worker(path.join(__dirname, 'videoProcessor.js'), {
        workerData: { inputPath: job.inputPath, outputPath: job.outputPath }
    });

    worker.on('message', (result) => {
        if (result.success) {
            console.log(`Job ${job.id} processed successfully`);

            // TODO: Загрузка обработанного видео в Google Storage
            // TODO: Отправка метаданных в базу данных
            console.log(`Job ${job.id}: Uploading to Google Storage and sending metadata to database`);
            // Здесь будет код для загрузки и работы с базой данных

            // После завершения, обрабатываем следующую задачу
            processNextJob();
        } else {
            console.error(`Error processing job ${job.id}`);
            // Опционально, обработка повторных попыток или логирование ошибок

            // Переходим к следующей задаче
            processNextJob();
        }
    });

    worker.on('error', (error) => {
        console.error(`Worker error for job ${job.id}:`, error);

        // Переходим к следующей задаче
        processNextJob();
    });

    worker.on('exit', (code) => {
        if (code !== 0) {
            console.error(`Worker stopped with exit code ${code} for job ${job.id}`);
            // Переходим к следующей задаче
            processNextJob();
        }
    });
}

// Эндпоинт для получения статуса очереди
app.get('/queue-status', (req, res) => {
    res.json({ queue_length: jobQueue.length + (isProcessing ? 1 : 0) });
});

// Обслуживание статических файлов (для фронтенда)
app.use(express.static('public'));


const options = {
    key: fs.readFileSync('/etc/ssl/private/video-enhancer.key'),
    cert: fs.readFileSync('/etc/ssl/certs/video-enhancer.crt'),
  };


// Запуск сервера на указанном порту
const PORT = 9090; // Порт сервера
https.createServer(options, app).listen(PORT, '0.0.0.0', () => {
    console.log(`Server started on https://0.0.0.0:${PORT}`);
  });