const { GoogleGenAI } = require("@google/genai");
const apiKey = "AIzaSyCiAUr5q5PAraSEhmpwGkFXBR5u38qiFgo";
const ai = new GoogleGenAI({ apiKey });
ai.models.generateContent({ model: 'gemini-2.5-flash', contents: 'Hi' })
  .then(res => console.log("Success:", res.text))
  .catch(err => console.error("Error:", err.message));
