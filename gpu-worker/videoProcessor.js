// videoProcessor.js

const { workerData, parentPort } = require('worker_threads');
const { spawn } = require('child_process');
const path = require('path');

// Real-ESRGAN is installed by setup.sh rather than vendored in this repo.
const REALESRGAN_DIR = process.env.REALESRGAN_DIR || path.join(__dirname, '..', 'Real-ESRGAN');

const { inputPath, outputPath } = workerData;

const env = Object.assign({}, process.env, { CUDA_VISIBLE_DEVICES: '0' });

const esrganProcess = spawn('python3', [
    path.join(REALESRGAN_DIR, 'inference_realesrgan_video.py'),
    '-i', inputPath,  // source
    '-o', outputPath, // result
    '-n', 'realesr-animevideov3',  // anime-tuned model
    '-s', '3',  // upscale factor
    '--num_process_per_gpu', '8',  // parallel processes on the GPU
    '--fps', '30'  // output frame rate
], { env });

esrganProcess.stdout.on('data', (data) => {
    console.log(`stdout: ${data}`);
});

esrganProcess.stderr.on('data', (data) => {
    console.error(`stderr: ${data}`);
});

esrganProcess.on('close', (code) => {
    if (code === 0) {
        console.log(`Video processed successfully: ${outputPath}`);
        parentPort.postMessage({ success: true });
    } else {
        console.error(`Real-ESRGAN exited with code ${code}.`);
        parentPort.postMessage({ success: false });
    }
});