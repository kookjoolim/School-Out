
import { GoogleGenAI } from "@google/genai";
import { LunchData, Source } from "../types";
import { db } from "./firebase";
import { doc, getDoc, setDoc } from "firebase/firestore";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

// 메모리 내 캐시
const memoryCache: Record<string, LunchData> = {};

// 선생님이 사진으로 확인해주신 12월 4주차 확정 식단 (이미지 기반 정답 데이터)
const IMAGE_VERIFIED_LUNCH: Record<string, string> = {
  "2025-12-22": "• 현미차조밥\n• 동지팥죽(13)\n• 쇠고기무국(5.6.9.16)\n• 포항닭보쌈/파채/청양마요소스(1.5.6.13.15)\n• 오징어시금치초무침(5.6.13.17)\n• 파래김/양념장(5.6.13)\n• 배추김치(9.13)\n• 황금향\n(713.6 Kcal)",
  "2025-12-23": "• 현미귀리쌀밥\n• 조갯살시금치된장국(5.6.9.18)\n• 세발나물무침\n• 모자반콩나물무침(5)\n• 옥수수김치전(1.2.5.6.9.13)\n• 오리훈제/무쌈\n• 배추김치(9.13)\n• 슈크림붕어빵(1.2.5.6)\n(982.6 Kcal)",
  "2025-12-24": "• 나시고랭(공통19)(1.5.6.9.10.13.17.18)\n• 콩가루배추국(5.6.9)\n• 리코타치즈샐러드/블루베리드레싱(1.2.5.12.13)\n• 오븐치즈스파게티(1.2.5.6.10.12.13.16)\n• 돈마호크/소스(1.2.5.6.10.12.13.16.18)\n• 배추김치(9.13)\n• 요구르트(2)\n• 크리스마스케익(1.2.5.6)\n(1109.0 Kcal)",
  "2025-12-26": "• 현미수수밥*\n• 사골황태국(5.16)\n• 계란장조림(1.5.6.13)\n• 미역줄기팽이버섯볶음\n• 배추전/양념장(5.6)\n• 돼지목살고추장구이(5.6.10)\n• 배추김치(9)\n• 친환경야채쌈(자율)(5.6)\n(627.2 Kcal)"
};

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

export const fetchLunchMenu = async (date: Date, forceRefresh: boolean = false): Promise<LunchData> => {
  const currentYear = date.getFullYear();
  const dateKey = `${currentYear}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

  // 1. 이미지로 확인된 날짜인 경우 즉시 반환 (가장 정확함)
  if (IMAGE_VERIFIED_LUNCH[dateKey]) {
    return {
      menuText: IMAGE_VERIFIED_LUNCH[dateKey],
      sources: [{ title: "사용자 제공 식단표 이미지 (확인됨)", uri: "https://ys-hwayang.es.jne.kr/ys-hwayang_es/ad/fm/foodmenu/selectFoodMenuView.do?mi=155714" }]
    };
  }

  // 2. 캐시 확인
  if (!forceRefresh) {
    // Fix: replaced undefined variable dateCacheKey with dateKey
    if (memoryCache[dateKey]) return memoryCache[dateKey];
    try {
      const cacheDoc = await getDoc(doc(db, "lunch_cache", dateKey));
      if (cacheDoc.exists()) {
        const data = cacheDoc.data() as LunchData;
        memoryCache[dateKey] = data;
        return data;
      }
    } catch (e) { console.error("Cache check failed:", e); }
  }

  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const dayName = ['일', '월', '화', '수', '목', '금', '토'][date.getDay()];
  const formattedDate = `${year}년 ${month}월 ${day}일 (${dayName}요일)`;

  // 3. 정밀 검색 수행
  const schoolUrl = "https://ys-hwayang.es.jne.kr/ys-hwayang_es/ad/fm/foodmenu/selectFoodMenuView.do?mi=155714";
  
  const prompt = `
    전남 여수 **화양초등학교**의 **${formattedDate}** 급식 메뉴를 찾아줘.
    
    **필수 참조 URL:** ${schoolUrl}
    
    **검색 가이드:**
    - 위 URL은 주간 식단표 페이지야. 만약 해당 날짜가 현재 주에 없다면, 검색 도구를 사용해 '화양초등학교 12월 식단표 공지사항'이나 '화양초 급식 게시판'의 다른 페이지를 추적해줘.
    - 특히 12월 26일 메뉴가 "현미수수밥, 사골황태국, 계란장조림"으로 구성된 식단표를 찾았다면 그 정보가 정확한 소스야.
    - 식품안전나라(FoodSafetyKorea) 사이트 내의 화양초 데이터도 함께 대조해줘.
    
    **응답 형식:**
    - 식단 메뉴(요리명)를 • 기호와 함께 나열.
    - 칼로리와 알레르기 정보를 포함.
    - 정보를 찾을 수 없는 경우에만 "등록된 정보가 없습니다"라고 답변.
  `;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }],
      },
    });

    const text = response.text || "정보를 가져올 수 없습니다.";
    
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

    // 기본 소스 추가
    if (sources.length === 0) {
      sources.push({ title: "화양초등학교 급식 메뉴 게시판", uri: schoolUrl });
    }

    const lunchResult = {
      menuText: text,
      sources: sources,
    };

    if (!text.includes("없습니다")) {
      await setDoc(doc(db, "lunch_cache", dateKey), lunchResult);
      memoryCache[dateKey] = lunchResult;
    }

    return lunchResult;

  } catch (error) {
    console.error("Fetch Error:", error);
    throw new Error("급식 조회 중 오류가 발생했습니다.");
  }
};
