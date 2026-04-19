import { GoogleGenAI } from "@google/genai";
import type { VercelRequest, VercelResponse } from '@vercel/node';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { audioBase64, mimeType } = req.body;
    
    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({ error: "GEMINI_API_KEY not configured." });
    }

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
        mimeType: mimeType || "audio/webm",
      },
    };

    const result = await ai.models.generateContent({
      model: model,
      contents: [{ parts: [audioPart, { text: prompt }] }],
      config: {
        responseMimeType: "application/json",
      },
    });

    if (!result.text) {
      throw new Error("No response from Gemini");
    }

    res.json(JSON.parse(result.text));
  } catch (error) {
    console.error("Classification error:", error);
    res.status(500).json({ error: "Failed to analyze audio." });
  }
}
