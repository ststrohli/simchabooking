/**
 * Expert planning advice service powered by Gemini via server-side API route.
 * Keeps GEMINI_API_KEY strictly on the server.
 */
export const getPlanningAdvice = async (userPrompt: string): Promise<string> => {
  try {
    const response = await fetch('/api/ai/planning-advice', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: userPrompt }),
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const data = await response.json();
    return data.text || "I apologize, I'm having trouble thinking of advice right now. Mazel Tov anyway!";
  } catch (error) {
    console.error("Gemini Advice Error:", error);
    return "The Simcha AI is currently unavailable. Please check your connection or try again later.";
  }
};

export const summarizeFile = async (fileName: string, fileType: string, notes: string = ''): Promise<string> => {
  try {
    const response = await fetch('/api/ai/summarize-file', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileName, fileType, notes }),
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const data = await response.json();
    return data.text || "No summary available.";
  } catch (error) {
    console.error("Gemini Summary Error:", error);
    return "AI summary could not be generated.";
  }
};
