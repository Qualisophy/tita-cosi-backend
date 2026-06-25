import Groq from "groq-sdk";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

export const extraerDatosReserva = async (mensajeUsuario, estadoActual) => {
  const hoy = new Date();
  const opcionesISO = { timeZone: "Europe/Madrid" };
  const dias = [
    "Domingo",
    "Lunes",
    "Martes",
    "Miércoles",
    "Jueves",
    "Viernes",
    "Sábado",
  ];

  const calendarioMapeo = Array.from({ length: 14 })
    .map((_, i) => {
      const d = new Date(hoy);
      d.setDate(d.getDate() + i);
      const iso = d.toLocaleString("sv-SE", opcionesISO).split(" ")[0];
      const diaExtra = i === 0 ? "(hoy)" : i === 1 ? "(mañana)" : "";
      return `- ${dias[d.getDay()]} ${d.getDate()}: ${iso} ${diaExtra}`;
    })
    .join("\n");

  if (estadoActual === "AWAITING_CONSENT") {
    return extraerConsentimientoUnico(mensajeUsuario);
  }

  // Quitamos validaciones de negocio. Groq SOLO extrae.
  const systemPrompt = `Eres el parser de reservas de Taberna Tita Cosi. Analiza el mensaje y extrae los datos.
  REGLA 0: NUNCA INVENTES DATOS. Si un dato no se menciona explícitamente, su valor en el JSON DEBE SER null.
  REGLA 1: Formateo estricto: fecha en YYYY-MM-DD usando este calendario:\n${calendarioMapeo}\nhora en HH:MM (pasa de formato 12h a 24h, ej. "2 de la tarde" = "14:00"). zona debe ser "Sala" o "Terraza".
  REGLA 2: Si dicta un email, sustituye "arroba" por "@", "punto" por "." y elimina espacios.
  REGLA 3: Si el usuario hace una pregunta, pon es_faq en true y responde amablemente en respuesta_faq.
  
  Salida JSON estricta:
  {
    "es_faq": false,
    "respuesta_faq": null,
    "datos": {
      "nombre": null,
      "comensales": null,
      "fecha": null,
      "hora": null,
      "zona": null,
      "email": null,
      "notas": null
    }
  }`;

  try {
    const response = await groq.chat.completions.create({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `Mensaje: "${mensajeUsuario}"` },
      ],
      model: "llama-3.3-70b-versatile",
      temperature: 0.0,
      response_format: { type: "json_object" },
    });

    const rawJson = response.choices[0]?.message?.content || "{}";
    console.log(`[🤖 Groq -> Slot Filling]:`, rawJson);
    return JSON.parse(rawJson);
  } catch (error) {
    console.error("[Groq Extractor Error]:", error);
    return { datos: {} };
  }
};

const extraerConsentimientoUnico = async (mensajeUsuario) => {
  try {
    const response = await groq.chat.completions.create({
      messages: [
        {
          role: "system",
          content: `Analiza si el usuario acepta la política de privacidad. Responde ÚNICAMENTE con este formato JSON:
        {
          "valido": true, 
          "valor": true, 
          "es_faq": false, 
          "respuesta_faq": null
        }
        REGLAS:
        - Si acepta, "valor": true y "valido": true.
        - Si rechaza, "valor": false y "valido": true.
        - Si el usuario dice otra cosa o ignora la pregunta para dar sus datos (ej: "mesa para dos"), "valido": false, "es_faq": true y en "respuesta_faq" pídele que, para poder ayudarle y asegurarnos de que sus datos estén protegidos, necesitas que le confirme que acepta nuestra política de privacidad (https://tita-cosi.vercel.app/es/privacidad). ¿Podría por favor confirmarme que la acepta?`,
        },
        { role: "user", content: `Mensaje: "${mensajeUsuario}"` },
      ],
      model: "llama-3.3-70b-versatile",
      temperature: 0.0,
      response_format: { type: "json_object" },
    });

    const rawJson =
      response.choices[0]?.message?.content || '{"valido": false}';
    console.log(`[🤖 Groq -> CONSENTIMIENTO]:`, rawJson);
    return JSON.parse(rawJson);
  } catch (error) {
    console.error("Error en extraerConsentimientoUnico:", error);
    return { valido: false };
  }
};
