import fs from "fs";
import Groq from "groq-sdk";
import * as googleTTS from "google-tts-api";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

export const transcribirAudio = async (filePath) => {
  try {
    const transcription = await groq.audio.transcriptions.create({
      file: fs.createReadStream(filePath),
      model: "whisper-large-v3",
      response_format: "json",
      language: "es",
    });
    return transcription.text;
  } catch (error) {
    console.error("[STT Error] Fallo al transcribir Groq:", error);
    return null;
  }
};

export const generarVoz = async (texto, outputPath) => {
  try {
    // Google TTS public endpoint (Gratis, sin API Key, sin registros)
    const base64Audio = await googleTTS.getAudioBase64(texto, {
      lang: "es",
      slow: false,
      host: "https://translate.google.com",
    });

    const buffer = Buffer.from(base64Audio, "base64");
    fs.writeFileSync(outputPath, buffer);

    return outputPath;
  } catch (error) {
    console.error(
      "[TTS Error] Fallo al generar voz con Google TTS:",
      error.message,
    );
    return null;
  }
};
