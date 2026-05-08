const { GoogleGenAI, Type } = require("@google/genai");
const apiKey = process.env.API_KEY || "AIzaSyBAT3pP92hRBdFzi4F-Q5qLQSLbVsNSDK4"; // Ensure valid key for local testing or use environment
const ai = new GoogleGenAI({ apiKey });

const run = async () => {
    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: [
                { text: `Return a JSON object representing your analysis.
Schema requirement:
{
  "title": "A short, descriptive title",
  "summary": "A concise summary of the video content",
  "tags": ["tag1", "tag2"], 
  "moments": [{ "timestamp": "00:00", "description": "Key event" }]
}` }
            ],
            config: { responseMimeType: 'application/json' }
        });
        console.log("Success:", response.text);
    } catch (e) {
        console.error("Error:", e.message);
    }
}
run();
