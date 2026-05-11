import { GoogleGenAI } from '@google/genai';
import fs from 'fs';

const ai = new GoogleGenAI({ apiKey: "AIzaSyCiAUr5q5PAraSEhmpwGkFXBR5u38qiFgo" });

async function test() {
    try {
        console.log("Testing gemini-3.1-flash-image-preview...");
        // Create a dummy 1x1 black pixel base64 for testing
        const base64Data = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
        const response = await ai.models.generateContent({
            model: 'gemini-3.1-flash-image-preview',
            contents: [
                { inlineData: { data: base64Data, mimeType: 'image/png' } },
                { text: `Edit this image: make it red` }
            ]
        });
        console.log("Success with gemini-3.1-flash-image-preview!");
        console.log(response);
    } catch (e) {
        console.error("Error with gemini-3.1-flash-image-preview:", e.message);
    }
}
test();
