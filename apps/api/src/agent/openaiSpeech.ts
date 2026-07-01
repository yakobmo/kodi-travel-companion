import OpenAI from "openai";

export interface OpenAiSpeechResult {
  status: "ready" | "not_configured" | "error";
  audio?: Buffer;
  contentType?: string;
  model?: string;
  voice?: string;
  error?: string;
}

function getOpenAiClient() {
  const apiKey = process.env.OPENAI_API_KEY?.trim();

  if (!apiKey) {
    return null;
  }

  return new OpenAI({ apiKey });
}

function buildKodiVoiceInstructions() {
  return [
    "Speak Hebrew naturally, like a warm male travel companion named Kodi.",
    "Sound friendly, calm, confident, and service-oriented.",
    "Avoid robotic narration. Do not sound like a call center or navigation system.",
    "Use a conversational pace that is easy for a family in a car to follow.",
    "Keep the tone present and human, like a helpful friend who knows the route."
  ].join(" ");
}

export async function createKodiSpeechAudio(text: string): Promise<OpenAiSpeechResult> {
  const client = getOpenAiClient();

  if (!client) {
    return { status: "not_configured" };
  }

  const speechText = text.trim().slice(0, 4000);
  if (!speechText) {
    return { status: "error", error: "speech_text_empty" };
  }

  const model = process.env.OPENAI_TTS_MODEL?.trim() || "gpt-4o-mini-tts";
  const voice = process.env.OPENAI_TTS_VOICE?.trim() || "echo";

  try {
    const response = await client.audio.speech.create({
      model,
      voice,
      input: speechText,
      instructions: buildKodiVoiceInstructions(),
      response_format: "mp3",
      speed: 0.95
    });
    const audio = Buffer.from(await response.arrayBuffer());

    return {
      status: "ready",
      audio,
      contentType: "audio/mpeg",
      model,
      voice
    };
  } catch (error) {
    return {
      status: "error",
      model,
      voice,
      error: error instanceof Error ? error.message : "openai_speech_failed"
    };
  }
}
