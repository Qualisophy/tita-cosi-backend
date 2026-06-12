// src/services/chatbot.service.js
import Groq from "groq-sdk";

// Inicializamos Groq
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// Memoria temporal en RAM
const converations = new Map();

const SYSTEM_PROMPT = `
Eres el asistente virtual de reservas de la Taberna Tita Cosi, un encantador rincón gastronómico en Teatinos, Málaga. 
Tu tono debe ser muy amable, cálido, cercano y profesional. Eres un experto en hospitalidad.

Tu objetivo es recopilar paso a paso estos 5 datos para formalizar una reserva:
1. Nombre y apellidos.
2. Fecha de la reserva (formato final para ti: YYYY-MM-DD).
3. Hora (solo abrimos de 13:00-16:00 y de 20:00-23:30).
4. Número de comensales (máximo 20).
5. Alergias o peticiones especiales (pregúntalo como algo opcional).

REGLAS DE CONVERSACIÓN:
- En tu primer mensaje, DEBES saludar dando la bienvenida a Taberna Tita Cosi de forma cálida y preguntar el nombre. Por ejemplo: "¡Hola! Qué alegría saludarte. Bienvenido a Taberna Tita Cosi. Estaré encantado de gestionarte la reserva, ¿a nombre de quién la anoto?"
- Ve paso a paso. NO pidas todos los datos de golpe. Hazlo conversacional (ej: "¡Perfecto, Juan! ¿Qué día os gustaría venir y a qué hora?").
- Si piden una hora fuera de turno, recuérdales amablemente el horario.
- Si te hablan de otra cosa que no sea reservar, reconduce la conversación con educación.

REGLA DE ORO FINAL:
CUANDO TENGAS LOS 5 DATOS, tu última respuesta no debe tener NADA de texto conversacional. 
Debes devolver ÚNICA Y EXCLUSIVAMENTE un objeto JSON válido, sin formato markdown, sin saludos ni despedidas.
Ejemplo exacto de lo que debes devolver al final:
{"nombre_cliente": "Juan Pérez", "fecha": "2026-10-25", "hora": "21:30", "comensales": 4, "notas": "Sin peticiones"}
`;

export const procesarMensaje = async (numeroTelefono, mensajeUsuario) => {
  // Inicializamos el historial
  if (!converations.has(numeroTelefono)) {
    converations.set(numeroTelefono, [
      { role: "system", content: SYSTEM_PROMPT },
    ]);
  }

  const history = converations.get(numeroTelefono);
  history.push({ role: "user", content: mensajeUsuario });

  try {
    const chatCompletion = await groq.chat.completions.create({
      messages: history,
      model: "llama-3.3-70b-versatile", // Modelo ultra rápido y preciso
      temperature: 0.1, // Para que sea muy determinista y no alucine
    });

    let respuestaIA = chatCompletion.choices[0]?.message?.content || "";
    history.push({ role: "assistant", content: respuestaIA });

    // Limpiar posible formato markdown
    respuestaIA = respuestaIA
      .replace(/`{3}json/gi, "")
      .replace(/`{3}/g, "")
      .trim();

    try {
      const datosReserva = JSON.parse(respuestaIA);
      converations.delete(numeroTelefono);
      return { esJson: true, datos: datosReserva };
    } catch (e) {
      return { esJson: false, mensaje: respuestaIA };
    }
  } catch (error) {
    console.error("Error en Groq:", error);
    return {
      esJson: false,
      mensaje:
        "Lo siento, el sistema está saturado. ¿Puedes intentarlo en unos minutos?",
    };
  }
};
