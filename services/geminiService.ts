import { GoogleGenAI } from "@google/genai";

/**
 * Expert planning advice service powered by Gemini.
 * Uses gemini-3-pro-preview for advanced reasoning and specialized domain knowledge.
 */
export const getPlanningAdvice = async (userPrompt: string): Promise<string> => {
  try {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    
    // We use gemini-3-pro-preview because planning a Jewish event requires complex cultural understanding and reasoning.
    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-preview',
      contents: userPrompt,
      config: {
        systemInstruction: 'You are an elite Jewish event coordinator (Simcha Specialist). Provide expert, warm, and practical advice for life-cycle events including weddings, bar/bat mitzvahs, and bris ceremonies. Focus on traditions, logistical efficiency, and vendor management.',
        temperature: 0.7,
      },
    });

    return response.text || "I apologize, I'm having trouble thinking of advice right now. Mazel Tov anyway!";
  } catch (error) {
    console.error("Gemini Advice Error:", error);
    return "The Simcha AI is currently unavailable. Please check your connection or try again later.";
  }
};

export const summarizeFile = async (fileName: string, fileType: string, notes: string = ''): Promise<string> => {
  try {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const prompt = `Summarize this file for a simcha planning dashboard. 
    File Name: ${fileName}
    File Type: ${fileType}
    User Notes: ${notes}
    
    Provide a concise, professional summary of what this file likely contains and its importance to the event planning process.`;

    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
      config: {
        systemInstruction: 'You are a helpful assistant for a Jewish event planning platform. Your goal is to provide brief, useful summaries of uploaded documents to help users stay organized.',
        temperature: 0.5,
      },
    });

    return response.text || "No summary available.";
  } catch (error) {
    console.error("Gemini Summary Error:", error);
    return "AI summary could not be generated.";
  }
};
