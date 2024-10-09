// server.js (Промежуточный сервер)

const redis = require('redis');
const { Worker } = require('worker_threads');
const path = require('path');
const fs = require('fs');
const axios = require('axios');

// Настройки подключения к Redis на основном сервере
const redisClient = redis.createClient({
    host: '203.0.113.10', // Замените на IP-адрес основного сервера
    port: 6379,
    // password: 'your_redis_password', // Если установлен пароль, раскомментируйте и укажите его
});

redisClient.on('error', (err) => {
    console.error('Redis error:', err);
});

// Директории для временных файлов
const tempDir = path.join(__dirname, 'temp');
if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

// Функция для обработки следующей задачи в очереди
function processNextJob() {
    redisClient.lpop('video_jobs', async (err, jobData) => {
        if (err) {
            console.error('Error fetching job from Redis:', err);
            setTimeout(processNextJob, 5000);
            return;
        }

        if (!jobData) {
            console.log('No jobs in the queue, waiting...');
            setTimeout(processNextJob, 5000);
            return;
        }

        const job = JSON.parse(jobData);
        console.log(`Starting processing job ${job.id}`);

        try {
            // Скачиваем видео с основного сервера
            const inputFileUrl = `http://your_main_server_ip/uploads/${path.basename(job.inputPath)}`;
            const localInputPath = path.join(tempDir, path.basename(job.inputPath));

            await downloadFile(inputFileUrl, localInputPath);

            // Обработка видео (вызов videoProcessor.js)
            const localOutputPath = path.join(tempDir, `processed_${path.basename(job.inputPath)}`);

            await processVideo(localInputPath, localOutputPath);

            // Загрузка обработанного видео в Google Cloud Storage
            const videoUrl = await uploadToGoogleCloud(localOutputPath);

            // Отправка метаданных и обновление статуса на основном сервере
            await axios.post(`http://your_main_server_ip/update-job`, {
                jobId: job.id,
                status: 'processed',
                metadata: job.metadata,
                videoUrl: videoUrl,
            });

            // Удаление локальных файлов
            fs.unlinkSync(localInputPath);
            fs.unlinkSync(localOutputPath);

            console.log(`Job ${job.id} processed successfully`);

            // Обработка следующей задачи
            processNextJob();
        } catch (error) {
            console.error(`Error processing job ${job.id}:`, error);

            // Возвращаем задачу в очередь для повторной попытки
            redisClient.rpush('video_jobs', jobData, (err) => {
                if (err) console.error('Error returning job to Redis:', err);
            });

            setTimeout(processNextJob, 5000);
        }
    });
}

// Функция для скачивания файла
async function downloadFile(url, outputPath) {
    const response = await axios({
        url,
        method: 'GET',
        responseType: 'stream',
    });

    const writer = fs.createWriteStream(outputPath);

    return new Promise((resolve, reject) => {
        response.data.pipe(writer);
        let error = null;
        writer.on('error', err => {
            error = err;
            writer.close();
            reject(err);
        });
        writer.on('close', () => {
            if (!error) {
                resolve();
            }
        });
    });
}

// Функция для обработки видео
async function processVideo(inputPath, outputPath) {
    return new Promise((resolve, reject) => {
        // Запускаем новый worker для обработки видео
        const worker = new Worker(path.join(__dirname, 'videoProcessor.js'), {
            workerData: { inputPath, outputPath }
        });

        worker.on('message', (result) => {
            if (result.success) {
                resolve();
            } else {
                reject(new Error('Video processing failed'));
            }
        });

        worker.on('error', (error) => {
            reject(error);
        });

        worker.on('exit', (code) => {
            if (code !== 0) {
                reject(new Error(`Worker stopped with exit code ${code}`));
            }
        });
    });
}

// Функция для загрузки файла в Google Cloud Storage
async function uploadToGoogleCloud(filePath) {
    // Здесь реализуйте код для загрузки файла в Google Cloud Storage
    // Верните URL загруженного видео

    // Пример:
    // const videoUrl = await uploadFileToGCS(bucketName, filePath);
    // return videoUrl;

    // Временно возвращаем фиктивный URL
    return 'https://storage.googleapis.com/your_bucket/your_video.mp4';
}

// Запускаем обработку задач
processNextJob();