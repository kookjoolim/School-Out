import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export const generateGoodbyeMessage = async (name: string, grade: number): Promise<string> => {
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: `Write a short, warm, and encouraging goodbye message (1-2 sentences) in Korean for a Korean elementary school student named ${name} (Grade ${grade}) who is leaving school right now. Mention resting well or having a good evening.`,
    });
    return response.text || "오늘 하루도 수고했어요! 조심히 들어가세요.";
  } catch (error) {
    console.error("Gemini API Error:", error);
    return "하교가 완료되었습니다. 조심히 들어가세요!";
  }
};