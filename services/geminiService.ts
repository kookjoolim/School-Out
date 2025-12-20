import { GoogleGenAI } from "@google/genai";
import { LunchData, Source } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export const generateGoodbyeMessage = async (name: string, grade: number): Promise<string> => {
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `Write a short, warm, and encouraging goodbye message (1-2 sentences) in Korean for a Korean elementary school student named ${name} (Grade ${grade}) who is leaving school right now. Mention resting well or having a good evening.`,
    });
    return response.text || "오늘 하루도 수고했어요! 조심히 들어가세요.";
  } catch (error) {
    console.error("Gemini API Error:", error);
    return "하교가 완료되었습니다. 조심히 들어가세요!";
  }
};

export const fetchLunchMenu = async (date: Date): Promise<LunchData> => {
  const formattedDate = date.toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'long',
  });

  const prompt = `
    전라남도 여수시에 위치한 '화양초등학교'의 ${formattedDate} 급식 메뉴를 알려줘.
    
    다음 규칙을 지켜줘:
    1. 메뉴는 보기 좋게 글머리 기호 등을 사용하여 목록 형태로 정리해줘.
    2. 만약 주말이나 공휴일이라 급식이 없다면 "오늘은 급식이 없는 날입니다"라고 명확히 말해줘.
    3. 열량(Kcal) 정보가 있다면 같이 표시해줘.
    4. 너무 긴 서론이나 불필요한 인사는 생략하고 핵심 정보 위주로 답변해줘.
  `;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }],
      },
    });

    const text = response.text || "메뉴 정보를 가져올 수 없습니다.";
    
    // Extract sources from grounding metadata
    const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
    
    const sources: Source[] = chunks
      .map((chunk) => chunk.web)
      .filter((web): web is { title: string; uri: string } => 
        !!web && typeof web.title === 'string' && typeof web.uri === 'string'
      )
      .map((web) => ({
        title: web.title,
        uri: web.uri
      }));

    // Remove duplicates based on URI
    const uniqueSources = Array.from(
      new Map(sources.map((s) => [s.uri, s] as [string, Source])).values()
    );

    return {
      menuText: text,
      sources: uniqueSources,
    };

  } catch (error) {
    console.error("Error fetching menu:", error);
    throw new Error("급식 정보를 불러오는 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.");
  }
};