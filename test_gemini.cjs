const { GoogleGenAI } = require("@google/genai");

const ai = new GoogleGenAI({ apiKey: "AIzaSyCiAUr5q5PAraSEhmpwGkFXBR5u38qiFgo" });

async function run() {
    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: "Hello, world!"
        });
        console.log("SUCCESS:");
        console.log(response.text);
    } catch (e) {
        console.error("ERROR:");
        console.error(e);
    }
}
run();
