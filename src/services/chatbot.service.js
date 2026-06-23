// src/services/chatbot.service.js
import Groq from "groq-sdk";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

export const extraerEntidad = async (mensajeUsuario, tipoEntidad) => {
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
      const diaAyerHoyManana = i === 0 ? "(hoy)" : i === 1 ? "(mañana)" : "";
      return `- ${dias[d.getDay()]} ${d.getDate()}: ${iso} ${diaAyerHoyManana}`;
    })
    .join("\n");

  const prompts = {
    CONSENTIMIENTO: `¿El usuario acepta la política? JSON: {"valido": true, "valor": true/false}. Mensaje: "${mensajeUsuario}"`,
    NOMBRE: `Extrae el nombre identificativo de la persona. JSON: {"valido": true, "valor": "Nombre"}. Mensaje: "${mensajeUsuario}"`,
    COMENSALES: `Extrae el número de personas. JSON: {"valido": true, "valor": (entero)}. Mensaje: "${mensajeUsuario}"`,
    FECHA: `Mapea el día solicitado a YYYY-MM-DD usando este calendario:\n${calendarioMapeo}\nREGLA: Si la fecha cae en Lunes o pide un Lunes explícitamente, DEVUELVE {"valido": false, "es_faq": true, "respuesta_faq": "Los lunes cerramos por descanso del personal. ¿Qué otro día te viene bien?"}. JSON éxito: {"valido": true, "valor": "YYYY-MM-DD"}. Mensaje: "${mensajeUsuario}"`,
    HORA: `Extrae la hora a formato 24h. REGLA CRÍTICA: Solo aceptamos horas entre 13:00-16:00 y 20:00-23:30. Si pide hora fuera de rango, DEVUELVE {"valido": false, "es_faq": true, "respuesta_faq": "Esa hora está fuera de nuestro horario. Abrimos de 13:00 a 16:00 y de 20:00 a 23:30. ¿A qué hora te apunto?"}. JSON éxito: {"valido": true, "valor": "HH:MM"}. Mensaje: "${mensajeUsuario}"`,
    ZONA: `Prefiere 'Terraza' o 'Sala'. JSON: {"valido": true, "valor": "Terraza" o "Sala"}. Mensaje: "${mensajeUsuario}"`,
  };

  try {
    const response = await groq.chat.completions.create({
      messages: [
        {
          role: "system",
          content: `Eres un parser ultra-estricto. Tu única salida es un objeto JSON válido.
          REGLA 1: Si extraes el dato y cumple las reglas, devuelve {"valido": true, "valor": "..."}.
          REGLA 2: Si el usuario hace una pregunta sobre horarios, días de cierre o ubicación en lugar de dar el dato, devuelve {"valido": false, "es_faq": true, "respuesta_faq": "Respuesta breve a su duda."}. 
          INFO FAQs: Horarios (13:00-16:00 y 20:00-23:30). Cerramos los Lunes. Ubicación (Av. Caffarena 13, Málaga).
          REGLA 3: Si falta el dato, es inválido o incomprensible, devuelve {"valido": false}.`,
        },
        { role: "user", content: prompts[tipoEntidad] },
      ],
      model: "llama-3.3-70b-versatile",
      temperature: 0.0,
      response_format: { type: "json_object" },
    });

    const rawJson =
      response.choices[0]?.message?.content || '{"valido": false}';
    console.log(`[🤖 Groq -> ${tipoEntidad}]:`, rawJson);
    return JSON.parse(rawJson);
  } catch (error) {
    console.error("[Groq Extractor Error]:", error);
    return { valido: false };
  }
};
