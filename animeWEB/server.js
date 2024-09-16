const express = require('express');
const fileUpload = require('express-fileupload');
const { Worker } = require('worker_threads');
const path = require('path');
const cors = require('cors');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');  // Import UUID for unique directory names

const app = express();

app.use(cors());
app.use(express.static('public'));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/processed', express.static(path.join(__dirname, 'processed')));
app.use(fileUpload({ limits: { fileSize: 1024 * 1024 * 1024 } }));

const uploadDir = path.join(__dirname, 'uploads');
const processedDir = path.join(__dirname, 'processed');

// In-memory store for job statuses
const jobs = {};

if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
if (!fs.existsSync(processedDir)) fs.mkdirSync(processedDir, { recursive: true });

// Route to handle file uploads
app.post('/upload', async (req, res) => {
    if (!req.files || Object.keys(req.files).length === 0) {
        return res.status(400).send('No files were uploaded.');
    }

    const uniqueId = uuidv4();  // Generate a unique identifier for this upload
    const videoFile = req.files.file;

    const safeFileName = path.basename(videoFile.name);
    const inputPath = path.join(uploadDir, safeFileName);
    const outputPath = path.join(processedDir, `${uniqueId}_${safeFileName}`);

    // Store the job status as "processing"
    jobs[uniqueId] = { status: 'processing', downloadUrl: null };

    videoFile.mv(inputPath, function (err) {
        if (err) {
            jobs[uniqueId].status = 'error';
            return res.status(500).send(err);
        }

        console.log(`Starting video processing for: ${videoFile.name}`);

        // Start a new worker thread to process the video
        const worker = new Worker(path.join(__dirname, 'videoProcessor.js'), {
            workerData: { inputPath, outputPath }
        });

        worker.on('message', (result) => {
            if (result.success) {
                jobs[uniqueId].status = 'done';
                jobs[uniqueId].downloadUrl = `/processed/${uniqueId}_${safeFileName}`;
                console.log(`Video processed successfully: ${outputPath}`);
            } else {
                jobs[uniqueId].status = 'error';
                console.error(`Error processing video: ${uniqueId}`);
            }
        });

        worker.on('error', (error) => {
            jobs[uniqueId].status = 'error';
            console.error(`Worker error for job ${uniqueId}:`, error);
        });

        worker.on('exit', (code) => {
            if (code !== 0) {
                jobs[uniqueId].status = 'error';
                console.error(`Worker stopped with exit code ${code} for job ${uniqueId}`);
            }
        });

        res.json({ uniqueId });
    });
});

// Check the status of a job
app.get('/status/:id', (req, res) => {
    const job = jobs[req.params.id];
    if (job) {
        res.json(job);
    } else {
        res.status(404).send('Job not found');
    }
});

// Serve the static files (for frontend, assuming you have an index.html in the public folder)
app.use(express.static('public'));

app.listen(8080, '0.0.0.0', () => {
    console.log('Server started on http://0.0.0.0:8080');
});
