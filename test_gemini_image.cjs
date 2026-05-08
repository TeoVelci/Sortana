const { GoogleGenAI, Type } = require("@google/genai");

const ai = new GoogleGenAI({ apiKey: "AIzaSyCiAUr5q5PAraSEhmpwGkFXBR5u38qiFgo" });

async function run() {
    try {
        const parts = [
            { text: "Analyze this image:" },
            { inlineData: { mimeType: "image/png", data: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=" } } // 1x1 transparent png
        ];

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
        console.log("SUCCESS:");
        console.log(response.text);
    } catch (e) {
        console.error("ERROR:");
        console.error(e);
    }
}
run();
