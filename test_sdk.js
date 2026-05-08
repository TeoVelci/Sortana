import { GoogleGenAI } from '@google/genai';
try {
  const ai = new GoogleGenAI({ apiKey: '' });
  await ai.models.generateContent({ model: 'gemini-2.5-flash', contents: [{text: 'hello'}] });
  console.log("Success");
} catch (e) {
  console.log("Failed:", e.message);
}
