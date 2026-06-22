// src/services/chatbot.service.js
import Groq from "groq-sdk";
import Chat from "../models/chat.model.js";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

export const procesarMensaje = async (numeroTelefono, mensajeUsuario) => {
  const hoy = new Date();
  const manana = new Date(hoy);
  manana.setDate(manana.getDate() + 1);

  const opcionesFecha = { timeZone: "Europe/Madrid" };
  const fechaHoyISO = hoy.toLocaleString("sv-SE", opcionesFecha).split(" ")[0];
  const fechaMananaISO = manana
    .toLocaleString("sv-SE", opcionesFecha)
    .split(" ")[0];

  const dias = [
    "Domingo",
    "Lunes",
    "Martes",
    "Miércoles",
    "Jueves",
    "Viernes",
    "Sábado",
  ];
  const diaHoy = dias[hoy.getDay()];
  const diaManana = dias[manana.getDay()];

  // PROMPT CON GUIÓN ESTRICTO Y FAQ CERRADO
  const SYSTEM_PROMPT = `
  Eres el asistente virtual de la "Taberna Tita Cosi" (Málaga). Tu tono es amable, conciso y resolutivo.

  TU ÚNICA MISIÓN:
  Recopilar los datos necesarios para una reserva. El número de teléfono ya lo tenemos. La asignación de mesa la hace el sistema internamente según disponibilidad.

  DATOS A RECOPILAR:
  1. Nombre
  2. Email
  3. Fecha (Usa contexto: HOY es ${diaHoy} ${fechaHoyISO}, MAÑANA es ${diaManana} ${fechaMananaISO}. LUNES CERRADO).
  4. Hora (Traduce formatos. Ej: "8 de la tarde" o "las 8" -> 20:00. Horario válido: 13:00-16:00 y 20:00-23:30).
  5. Número de comensales.
  6. Peticiones o alergias (Opcional. Si no tienen, anota "Ninguna").

  PREGUNTAS PERMITIDAS (FAQ):
  Solo estás autorizado a responder dudas sobre estos 4 temas. Usa esta información exacta:
  - Dirección: Av. del Editor Ángel Caffarena, 13, Málaga (Teatinos).
  - Horario: Comidas 13:00 a 16:00 | Cenas 20:00 a 23:30. Lunes cerrado.
  - Opciones de comida: Sí, contamos con opciones veganas y platos adaptados para celíacos.
  - Accesibilidad: Sí, la taberna es totalmente accesible para personas en silla de ruedas o con movilidad reducida.

  RESTRICCIÓN ABSOLUTA:
  Si el usuario pregunta cualquier otra cosa (precios, menú completo, receta, chistes, etc.), debes responder cortésmente: "Lo siento, mi función principal es gestionar las reservas y resolver dudas básicas sobre accesibilidad, horarios o alérgenos. ¿Para cuándo te gustaría la mesa?".

  FORMATO DE SALIDA (JSON ESTRICTO):
  Nunca escribas texto fuera del JSON.

  ESTADO 1: Si te hacen una pregunta de la FAQ o te faltan datos por recopilar:
  {
    "status": "PENDING",
    "respuesta_usuario": "Tu respuesta amable resolviendo la duda o pidiendo un único dato faltante."
  }

  ESTADO 2: SI Y SOLO SI tienes los 6 datos, devuelve el resumen para que el sistema procese la reserva:
  {
    "status": "COMPLETED",
    "datos": {
      "nombre_cliente": "Valor",
      "email_cliente": "Valor",
      "fecha": "YYYY-MM-DD",
      "hora": "HH:MM",
      "comensales": 0,
      "notas": "Valor"
    }
  }
  `;

  const sessionId = await Chat.getSessionId(numeroTelefono);
  let history = await Chat.getHistory(sessionId);

  if (history.length === 0) {
    await Chat.addMessage(sessionId, "system", SYSTEM_PROMPT);
    history = [{ role: "system", content: SYSTEM_PROMPT }];
  } else {
    if (history[0].role === "system") {
      history[0].content = SYSTEM_PROMPT;
    }
  }

  if (history.length > 11) {
    history = [history[0], ...history.slice(-10)];
  }

  await Chat.addMessage(sessionId, "user", mensajeUsuario);
  history.push({ role: "user", content: mensajeUsuario });

  try {
    const chatCompletion = await groq.chat.completions.create({
      messages: history,
      model: "llama-3.1-8b-instant",
      temperature: 0.0,
      top_p: 0.1,
      response_format: { type: "json_object" },
    });

    const respuestaIA = chatCompletion.choices[0]?.message?.content || "{}";
    const parsedResponse = JSON.parse(respuestaIA);

    if (parsedResponse.status === "COMPLETED" && parsedResponse.datos) {
      return {
        esJson: true,
        datos: parsedResponse.datos,
        sessionId,
      };
    } else {
      const textoRespuesta =
        parsedResponse.respuesta_usuario ||
        "Dime, ¿en qué puedo ayudarte con tu reserva?";
      await Chat.addMessage(sessionId, "assistant", textoRespuesta);

      return {
        esJson: false,
        mensaje: textoRespuesta,
        sessionId,
      };
    }
  } catch (error) {
    console.error("[Groq Error]:", error);
    return {
      esJson: false,
      mensaje:
        "Tengo un problema técnico de conexión en este instante. ¿Me lo puedes repetir?",
      sessionId,
    };
  }
};
