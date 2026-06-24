import fs from "fs";
import { pipeline } from "stream/promises";

const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_ID = process.env.WHATSAPP_PHONE_ID;

export const descargarMediaMeta = async (mediaId, outputPath) => {
  try {
    const urlRes = await fetch(`https://graph.facebook.com/v25.0/${mediaId}`, {
      headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}` },
    });
    const urlData = await urlRes.json();

    if (!urlData.url) throw new Error("No se pudo obtener la URL del medio");

    const mediaRes = await fetch(urlData.url, {
      headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}` },
    });

    const fileStream = fs.createWriteStream(outputPath);
    await pipeline(mediaRes.body, fileStream);
    return outputPath;
  } catch (error) {
    console.error("[Meta API] Error descargando medio:", error);
    return null;
  }
};

export const subirMediaMeta = async (filePath) => {
  try {
    const fileBuffer = fs.readFileSync(filePath);
    const blob = new Blob([fileBuffer], { type: "audio/wav" });

    const formData = new FormData();
    formData.append("file", blob, "audio.wav");
    formData.append("type", "audio");
    formData.append("messaging_product", "whatsapp");

    const res = await fetch(
      `https://graph.facebook.com/v25.0/${PHONE_ID}/media`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}` },
        body: formData,
      },
    );

    const data = await res.json();
    if (data.error) throw new Error(data.error.message);

    return data.id;
  } catch (error) {
    console.error("[Meta API] Error subiendo medio:", error);
    return null;
  }
};
