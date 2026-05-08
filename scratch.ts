import { GoogleGenAI, Type } from "@google/genai";
import * as dotenv from 'dotenv';
dotenv.config();

const getAI = () => new GoogleGenAI({ apiKey: process.env.API_KEY || '' });

async function run() {
    const ai = getAI();
    const parts: any[] = [];
    parts.push({ text: `Image 0 (ID: fake-id-123)` });
    // Add a fake blank pixel inline data
    parts.push({ inlineData: { mimeType: 'image/jpeg', data: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=' } });
    parts.push({ 
        text: `Analyze these 1 images. Return a JSON ARRAY of objects. Schema:
        { "id": "string", "tags": ["tag1", "tag2"], "description": "concise summary" }` 
    });

    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: parts,
            config: {
                responseMimeType: 'application/json',
                responseSchema: {
                    type: Type.ARRAY,
                    items: {
                        type: Type.OBJECT,
                        properties: {
                            id: { type: Type.STRING },
                            tags: { type: Type.ARRAY, items: { type: Type.STRING } },
                            description: { type: Type.STRING }
                        },
                        required: ["id", "tags", "description"]
                    }
                }
            }
        });
        console.log("Raw response:", response.text);
    } catch (e) {
        console.error("Error:", e);
    }
}
run();
