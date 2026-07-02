import OpenAI from "openai";

export interface OpenAiSpeechResult {
  status: "ready" | "not_configured" | "error";
  audio?: Buffer;
  contentType?: string;
  model?: string;
  voice?: string;
  speed?: number;
  error?: string;
}

function getOpenAiClient() {
  const apiKey = process.env.OPENAI_API_KEY?.trim();

  if (!apiKey) {
    return null;
  }

  return new OpenAI({ apiKey });
}

function getOpenAiSpeechInstructions() {
  return (
    process.env.OPENAI_TTS_INSTRUCTIONS?.trim() ||
    "Speak Hebrew clearly in a warm, friendly adult male Israeli guide voice. Keep the rhythm natural and conversational, pronounce Hebrew words carefully, and avoid a robotic or feminine tone."
  );
}

function getOpenAiSpeechSpeed() {
  const value = Number(process.env.OPENAI_TTS_SPEED);

  if (!Number.isFinite(value) || value <= 0) {
    return 1.16;
  }

  return Math.min(Math.max(value, 0.8), 1.35);
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
  const instructions = getOpenAiSpeechInstructions();
  const speed = getOpenAiSpeechSpeed();

  try {
    const response = await client.audio.speech.create({
      model,
      voice,
      input: speechText,
      ...(instructions ? { instructions } : {}),
      response_format: "mp3",
      speed
    });
    const audio = Buffer.from(await response.arrayBuffer());

    return {
      status: "ready",
      audio,
      contentType: "audio/mpeg",
      model,
      voice,
      speed
    };
  } catch (error) {
    return {
      status: "error",
      model,
      voice,
      speed,
      error: error instanceof Error ? error.message : "openai_speech_failed"
    };
  }
}
