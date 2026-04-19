import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export interface EmotionResult {
  emotion: 'angry' | 'calm' | 'happy' | 'sad' | 'surprised' | 'neutral';
  confidence: number;
  reasoning: string;
  transcription?: string;
  features: {
    pitch: string;
    tempo: string;
    energy: string;
  };
}

export async function classifyEmotion(audioBase64: string, mimeType: string): Promise<EmotionResult> {
  const model = "gemini-3-flash-preview";
  
  const prompt = `Analyze this audio clip and classify the speaker's emotion into one of the following: angry, calm, happy, sad, surprised, neutral. 
Focus on paralinguistic features: pitch variation, speaking rate (tempo), and energy intensity. 

Return the result as a JSON object with:
- "emotion": the classified emotion (string)
- "confidence": confidence score between 0 and 1 (number)
- "transcription": a verbatim transcription of what was said in the audio (string)
- "reasoning": a brief 1-2 sentence explanation of why this emotion was chosen based on the audio characteristics.
- "features": an object with "pitch", "tempo", and "energy" as descriptive strings (e.g., "High and variable", "Fast", "High intensity").`;

  const audioPart = {
    inlineData: {
      data: audioBase64,
      mimeType: mimeType,
    },
  };

  const response = await ai.models.generateContent({
    model: model,
    contents: [{ parts: [audioPart, { text: prompt }] }],
    config: {
      responseMimeType: "application/json",
    },
  });

  if (!response.text) {
    throw new Error("No response from Gemini");
  }

  return JSON.parse(response.text) as EmotionResult;
}
