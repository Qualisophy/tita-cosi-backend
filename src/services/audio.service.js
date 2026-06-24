import fs from "fs";
import Groq from "groq-sdk";
import { pipeline } from "stream/promises";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const HF_TOKEN = process.env.HUGGINGFACE_API_KEY;

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
    const MODEL_URL =
      "https://api-inference.huggingface.co/models/facebook/mms-tts-spa";

    const response = await fetch(MODEL_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${HF_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ inputs: texto }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Error de HF: ${response.status} - ${errorText}`);
    }

    const fileStream = fs.createWriteStream(outputPath);
    await pipeline(response.body, fileStream);
    return outputPath;
  } catch (error) {
    console.error("[TTS Error] Fallo al generar voz con Hugging Face:", error);
    return null;
  }
};
