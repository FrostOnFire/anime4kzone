const { workerData, parentPort } = require('worker_threads');
const { spawn } = require('child_process');

const { inputPath, outputPath } = workerData;

const env = Object.assign({}, process.env, { CUDA_VISIBLE_DEVICES: '0' });

const esrganProcess = spawn('python3', [
    '/work/Real-ESRGAN/inference_realesrgan_video.py',  // Path to the script
    '-i', inputPath,  // Input video path
    '-o', outputPath, // Output video path
    '-n', 'realesr-animevideov3',  // Model name
    '-s', '4',  // Scale factor
    '--num_process_per_gpu', '2',  // Number of processes per GPU
    '--fps', '30'  // Frames per second
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
