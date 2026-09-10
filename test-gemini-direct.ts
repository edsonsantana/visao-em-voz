import { analyzeScene } from './src/services/geminiService';
import fs from 'fs';
import path from 'path';

async function run() {
    try {
        const imagePath = path.join(__dirname, '001.jpg');
        const imageBuffer = fs.readFileSync(imagePath);
        const base64 = imageBuffer.toString('base64');
        console.log("Image loaded, calling analyzeScene...");
        const result = await analyzeScene(base64, "descreva");
        console.log("Success:", result);
    } catch (err: any) {
        console.error("Test failed:", err.message);
    }
}

run();
