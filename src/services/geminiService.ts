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
  const response = await fetch("/api/classify", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ audioBase64, mimeType }),
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error || "Failed to analyze audio");
  }

  return response.json();
}
