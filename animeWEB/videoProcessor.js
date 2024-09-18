// videoProcessor.js

const { workerData, parentPort } = require('worker_threads');
const { spawn } = require('child_process');

const { inputPath, outputPath } = workerData;

const env = Object.assign({}, process.env, { CUDA_VISIBLE_DEVICES: '0' });

const esrganProcess = spawn('python3', [
    '/video-enhancer/Real-ESRGAN/inference_realesrgan_video.py',  // Путь к скрипту
    '-i', inputPath,  // Путь к входному видео
    '-o', outputPath, // Путь к выходному видео
    '-n', 'realesr-animevideov3',  // Название модели
    '-s', '3',  // Множитель увеличения
    '--num_process_per_gpu', '8',  // Количество процессов на GPU
    '--fps', '30'  // Частота кадров
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