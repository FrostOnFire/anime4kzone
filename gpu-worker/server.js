// server.js, the GPU worker (PC-3)

const redis = require('redis');
const { Worker } = require('worker_threads');
const path = require('path');
const fs = require('fs');
const axios = require('axios');

require('dotenv').config();

// Main server (PC-2): serves the source files and receives job status updates.
const MAIN_SERVER_URL = process.env.MAIN_SERVER_URL || 'http://localhost:9090';

// The job queue lives on the main server, so both nodes share one Redis.
const redisClient = redis.createClient({
    url: process.env.REDIS_URL || 'redis://localhost:6379',
});

redisClient.on('error', (err) => {
    console.error('Redis error:', err);
});

// Scratch directory for downloads and results
const tempDir = path.join(__dirname, 'temp');
if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

// Take the next job off the queue and run it
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
            // Download the source from the main server
            const inputFileUrl = `${MAIN_SERVER_URL}/uploads/${path.basename(job.inputPath)}`;
            const localInputPath = path.join(tempDir, path.basename(job.inputPath));

            await downloadFile(inputFileUrl, localInputPath);

            // Upscale it in a worker thread
            const localOutputPath = path.join(tempDir, `processed_${path.basename(job.inputPath)}`);

            await processVideo(localInputPath, localOutputPath);

            // Upload the result. NOT IMPLEMENTED, see uploadToGoogleCloud below
            const videoUrl = await uploadToGoogleCloud(localOutputPath);

            // Report the result back to the main server
            await axios.post(`${MAIN_SERVER_URL}/update-job`, {
                jobId: job.id,
                status: 'processed',
                metadata: job.metadata,
                videoUrl: videoUrl,
            });

            // Clean up
            fs.unlinkSync(localInputPath);
            fs.unlinkSync(localOutputPath);

            console.log(`Job ${job.id} processed successfully`);

            // On to the next job
            processNextJob();
        } catch (error) {
            console.error(`Error processing job ${job.id}:`, error);

            // Put the job back so it is retried
            redisClient.rpush('video_jobs', jobData, (err) => {
                if (err) console.error('Error returning job to Redis:', err);
            });

            setTimeout(processNextJob, 5000);
        }
    });
}

// Stream a file to disk
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

// Run Real-ESRGAN in a worker thread so the queue loop stays responsive
async function processVideo(inputPath, outputPath) {
    return new Promise((resolve, reject) => {
        // One worker thread per job
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

// NOT IMPLEMENTED. The pipeline was never wired up to cloud storage: this
// returns a placeholder URL which the main server stores as the video's
// location, so results in fact stayed on the GPU node.
async function uploadToGoogleCloud(filePath) {
    return 'https://storage.googleapis.com/your_bucket/your_video.mp4';
}

// Start the queue loop
processNextJob();