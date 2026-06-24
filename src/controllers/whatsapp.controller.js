import fs from "fs";
import path from "path";
import Reserva from "../models/reserva.model.js";
import Chat from "../models/chat.model.js";
import { extraerDatosReserva } from "../services/chatbot.service.js"; // FIX: Nueva importación
import { validarReglasNegocio, MESAS_CAPACIDAD } from "./reserva.controller.js";
import db from "../config/db.js";
import { transcribirAudio, generarVoz } from "../services/audio.service.js";
import {
  descargarMediaMeta,
  subirMediaMeta,
} from "../services/meta.service.js";

const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN;
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_ID = process.env.WHATSAPP_PHONE_ID;

// Caché para evitar Webhooks duplicados de Meta (Soluciona la condición de carrera)
const processedMessages = new Set();

const enviarMensajeWhatsApp = async (
  numeroDestino,
  texto,
  responderConAudio = false,
) => {
  if (!texto) return;
  try {
    let payloadMessage = {
      messaging_product: "whatsapp",
      to: numeroDestino,
    };

    let usarFallbackTexto = true;

    if (responderConAudio) {
      // Filtramos el texto SOLO para el audio: quitamos emojis y contenido entre paréntesis
      const textoParaAudio = texto
        .replace(/🎉/g, "")
        .replace(/😅/g, "")
        .replace(/\(.*?\)/g, "")
        .replace(/\*/g, "")
        .trim();

      const tempPath = path.resolve(`./uploads/tts_${Date.now()}.mp3`);
      const rutaAudioGenerado = await generarVoz(textoParaAudio, tempPath);

      if (rutaAudioGenerado && fs.existsSync(rutaAudioGenerado)) {
        const mediaId = await subirMediaMeta(rutaAudioGenerado);

        if (mediaId) {
          payloadMessage.type = "audio";
          payloadMessage.audio = { id: mediaId };
          usarFallbackTexto = false;
        } else {
          console.warn("⚠️ [WA API] Falló la subida a Meta. Fallback a texto.");
        }

        fs.unlink(rutaAudioGenerado, (err) => {
          if (err) console.error("🗑️ [FS] Error borrando TTS temporal:", err);
        });
      }
    }

    if (usarFallbackTexto) {
      payloadMessage.type = "text";
      payloadMessage.text = { body: texto };
    }

    const response = await fetch(
      `https://graph.facebook.com/v25.0/${PHONE_ID}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${WHATSAPP_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payloadMessage),
      },
    );
    const data = await response.json();
    if (data.error) console.error("[WA API] Error de Meta:", data.error);
  } catch (error) {
    console.error("[WA API] Error de red enviando WhatsApp:", error);
  }
};

export const verifyWebhook = (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode && token) {
    if (mode === "subscribe" && token === VERIFY_TOKEN) {
      res.status(200).send(challenge);
    } else {
      res.sendStatus(403);
    }
  }
};

const formatearFechaEsp = (fechaISO) => {
  const opciones = {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  };
  return new Date(fechaISO).toLocaleDateString("es-ES", opciones);
};

const procesarReservaFinal = async (
  sessionId,
  numeroCliente,
  temp_data,
  responderConAudio = false,
) => {
  const payloadReserva = {
    nombre_cliente: temp_data.nombre,
    email_cliente: temp_data.email,
    telefono_cliente: numeroCliente,
    fecha: temp_data.fecha,
    hora: temp_data.hora,
    comensales: Number(temp_data.comensales),
    zona: temp_data.zona === "Terraza" ? "Terraza" : "Sala",
    notas: temp_data.notas,
    mesa_id: null,
  };

  const prefijoMesa = payloadReserva.zona === "Terraza" ? "T" : "S";
  let mesaAsignada = null;
  let existeCapacidadAforo = false;

  for (const [id_mesa, capacidad] of Object.entries(MESAS_CAPACIDAD)) {
    if (
      id_mesa.startsWith(prefijoMesa) &&
      capacidad >= payloadReserva.comensales
    ) {
      existeCapacidadAforo = true;
      const libre = await Reserva.checkAvailability(
        payloadReserva.fecha,
        payloadReserva.hora,
        id_mesa,
      );
      if (libre) {
        mesaAsignada = id_mesa;
        break;
      }
    }
  }

  if (!existeCapacidadAforo) {
    await Chat.deleteSession(numeroCliente);
    return enviarMensajeWhatsApp(
      numeroCliente,
      `Lo siento ${temp_data.nombre}, nuestra capacidad máxima online para una sola mesa en la ${temp_data.zona} es inferior a ${temp_data.comensales} personas. Por favor, llámanos directamente al local para gestionar reservas de grupos grandes.`,
      responderConAudio,
    );
  }

  if (!mesaAsignada) {
    delete temp_data.hora;
    await Chat.updateSessionData(sessionId, "GATHERING_INFO", temp_data); // FIX: Ajustado al nuevo estado
    return enviarMensajeWhatsApp(
      numeroCliente,
      `Lo siento ${temp_data.nombre}, no disponemos de mesas libres para ${temp_data.comensales} personas en la ${temp_data.zona} a esa hora. Por favor, indícame una HORA diferente.`,
      responderConAudio,
    );
  }

  payloadReserva.mesa_id = mesaAsignada;

  const errorValidacion = await validarReglasNegocio(payloadReserva);
  if (errorValidacion) {
    if (
      errorValidacion.includes("correo") ||
      errorValidacion.includes("dominio")
    ) {
      delete temp_data.email;
      await Chat.updateSessionData(sessionId, "GATHERING_INFO", temp_data);
      return enviarMensajeWhatsApp(
        numeroCliente,
        `Tenemos un problema: ${errorValidacion} Por favor, facilítame un correo electrónico diferente.`,
        responderConAudio,
      );
    }
    if (errorValidacion.includes("lunes")) {
      delete temp_data.fecha;
      await Chat.updateSessionData(sessionId, "GATHERING_INFO", temp_data);
      return enviarMensajeWhatsApp(
        numeroCliente,
        `¡Vaya! 😅 Los lunes cerramos por descanso del personal. ¿Qué otro día te vendría bien?`,
        responderConAudio,
      );
    }
    if (errorValidacion.includes("horario")) {
      delete temp_data.hora;
      await Chat.updateSessionData(sessionId, "GATHERING_INFO", temp_data);
      return enviarMensajeWhatsApp(
        numeroCliente,
        `Esa hora está fuera de nuestro horario de cocina (13:00 a 16:00 y 20:00 a 23:30). ¿A qué otra HORA te gustaría venir?`,
        responderConAudio,
      );
    }

    delete temp_data.fecha;
    delete temp_data.hora;
    await Chat.updateSessionData(sessionId, "GATHERING_INFO", temp_data);
    return enviarMensajeWhatsApp(
      numeroCliente,
      `Tenemos un conflicto: ${errorValidacion} Por favor, indícame una FECHA diferente.`,
      responderConAudio,
    );
  }

  try {
    const insertId = await Reserva.create(payloadReserva);

    if (process.env.MAKE_WEBHOOK_RESERVA_URL) {
      console.log(
        `[Make.com] Disparando Webhook a ${process.env.MAKE_WEBHOOK_RESERVA_URL}...`,
      );
      fetch(process.env.MAKE_WEBHOOK_RESERVA_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reservaId: insertId,
          ...payloadReserva,
          tipo_formulario: "reserva",
        }),
      })
        .then((res) => res.text())
        .then((text) => console.log(`✅ [Make.com] Respuesta del CRM: ${text}`))
        .catch((err) =>
          console.error("❌ [Make.com] Error disparando webhook:", err),
        );
    }

    await Chat.deleteSession(numeroCliente);
    const fechaLimpia = formatearFechaEsp(temp_data.fecha);
    console.log(
      `[✅ FSM FINALIZADA] Reserva de ${temp_data.nombre} guardada exitosamente.`,
    );

    return enviarMensajeWhatsApp(
      numeroCliente,
      `¡Reserva confirmada, ${temp_data.nombre}! 🎉 Te esperamos el ${fechaLimpia} a las ${temp_data.hora} en ${temp_data.zona}. Te hemos enviado un correo. (Escribe 'CANCELAR' si necesitas anularla).`,
      responderConAudio,
    );
  } catch (error) {
    console.error("❌ Error DB guardando reserva:", error);
    return enviarMensajeWhatsApp(
      numeroCliente,
      "Ha ocurrido un error interno guardando la reserva. Por favor, inténtalo de nuevo.",
      responderConAudio,
    );
  }
};

const avanzarFSM = async (
  sessionId,
  numeroCliente,
  temp_data,
  responderConAudio = false,
) => {
  // CHECKLIST: Se detiene en el primer dato que falte
  if (!temp_data.nombre) {
    await Chat.updateSessionData(sessionId, "GATHERING_INFO", temp_data);
    return enviarMensajeWhatsApp(
      numeroCliente,
      "¡Perfecto! Para empezar, ¿a nombre de quién hacemos la reserva?",
      responderConAudio,
    );
  }
  if (!temp_data.comensales) {
    await Chat.updateSessionData(sessionId, "GATHERING_INFO", temp_data);
    return enviarMensajeWhatsApp(
      numeroCliente,
      `Encantado, ${temp_data.nombre}. ¿Para cuántas personas será la reserva?`,
      responderConAudio,
    );
  }
  if (!temp_data.fecha) {
    await Chat.updateSessionData(sessionId, "GATHERING_INFO", temp_data);
    return enviarMensajeWhatsApp(
      numeroCliente,
      "¿Qué día te gustaría venir? (Ej: Hoy, mañana, o el próximo viernes)",
      responderConAudio,
    );
  }
  if (!temp_data.hora) {
    await Chat.updateSessionData(sessionId, "GATHERING_INFO", temp_data);
    const fechaLimpia = formatearFechaEsp(temp_data.fecha);
    return enviarMensajeWhatsApp(
      numeroCliente,
      `Apuntado el ${fechaLimpia}. ¿A qué hora prefieres? (Horario: 13:00 a 16:00 y 20:00 a 23:30)`,
      responderConAudio,
    );
  }
  if (!temp_data.zona) {
    await Chat.updateSessionData(sessionId, "GATHERING_INFO", temp_data);
    return enviarMensajeWhatsApp(
      numeroCliente,
      "¿Prefieres la mesa en la Sala o en la Terraza?",
      responderConAudio,
    );
  }
  if (!temp_data.email) {
    await Chat.updateSessionData(sessionId, "GATHERING_INFO", temp_data);
    const mensajeEmail = responderConAudio
      ? "Para enviarte el resguardo, facilítame un correo electrónico. Por mayor precisión, te recomiendo que me lo escribas en un mensaje de texto."
      : "Para enviarte el resguardo, facilítame un correo electrónico válido.";
    return enviarMensajeWhatsApp(
      numeroCliente,
      mensajeEmail,
      responderConAudio,
    );
  }
  if (temp_data.notas === undefined) {
    await Chat.updateSessionData(sessionId, "GATHERING_INFO", temp_data);
    return enviarMensajeWhatsApp(
      numeroCliente,
      "¿Tenéis alguna alergia, intolerancia o petición especial? (Si no es el caso, escribe 'No')",
      responderConAudio,
    );
  }

  // Si pasa toda la checklist, la reserva está lista para cerrarse
  return procesarReservaFinal(
    sessionId,
    numeroCliente,
    temp_data,
    responderConAudio,
  );
};

export const receiveMessage = async (req, res) => {
  res.sendStatus(200);

  try {
    const body = req.body;
    const message = body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];

    if (message && (message.type === "text" || message.type === "audio")) {
      // Ignorar webhooks duplicados de Meta
      if (processedMessages.has(message.id)) {
        console.log(`[WA] Ignorando webhook duplicado de Meta: ${message.id}`);
        return;
      }
      processedMessages.add(message.id);
      setTimeout(() => processedMessages.delete(message.id), 5 * 60 * 1000);

      const numeroCliente = message.from;
      let textoCliente = "";
      let esAudio = false;

      if (message.type === "audio") {
        esAudio = true;
        const mediaId = message.audio.id;
        const tempAudioPath = path.resolve(`./uploads/${mediaId}.ogg`);

        console.log(`🎤 [WA] Descargando audio de cliente...`);
        const downloadSuccess = await descargarMediaMeta(
          mediaId,
          tempAudioPath,
        );

        if (downloadSuccess) {
          textoCliente = await transcribirAudio(tempAudioPath);
          if (fs.existsSync(tempAudioPath)) fs.unlinkSync(tempAudioPath);
        }

        if (!textoCliente) {
          return enviarMensajeWhatsApp(
            numeroCliente,
            "Disculpa, no he podido escuchar bien el audio. ¿Podrías repetirlo o escribirlo?",
            true,
          );
        }
      } else {
        textoCliente = message.text.body.trim().toLowerCase();
      }

      console.log(
        `\n💬 [WA] Nuevo Mensaje (Audio: ${esAudio}): "${textoCliente}"`,
      );

      if (
        textoCliente.includes("cancelar") ||
        textoCliente.includes("borrar mis datos")
      ) {
        const queryBusqueda = `SELECT id FROM reservas WHERE telefono_cliente = ? AND CONCAT(fecha, ' ', hora) > NOW() AND estado != 'Cancelada' ORDER BY created_at DESC LIMIT 1`;
        const [reservaFutura] = await db.query(queryBusqueda, [numeroCliente]);

        if (reservaFutura.length > 0) {
          await db.query(
            "UPDATE reservas SET estado = 'Cancelada' WHERE id = ?",
            [reservaFutura[0].id],
          );
        }

        await Chat.deleteSession(numeroCliente);
        console.log(
          `[RGPD/CRM] Usuario ${numeroCliente} ejecutó borrado/cancelación.`,
        );
        return enviarMensajeWhatsApp(
          numeroCliente,
          "Proceso cancelado. Tu reserva activa (si la había) ha sido anulada en nuestro sistema y tus datos de sesión borrados. ¡Hasta pronto!",
          esAudio,
        );
      }

      const session = await Chat.getSessionData(numeroCliente);
      let { step, temp_data } = session;
      temp_data =
        typeof temp_data === "string" ? JSON.parse(temp_data) : temp_data || {};

      console.log(`🔄 [FSM Estado]: ${step}`);

      switch (step) {
        case "AWAITING_CONSENT":
          const extraccionConsentimiento = await extraerDatosReserva(
            textoCliente,
            "AWAITING_CONSENT",
          );
          if (extraccionConsentimiento.es_faq)
            return enviarMensajeWhatsApp(
              numeroCliente,
              extraccionConsentimiento.respuesta_faq,
              esAudio,
            );
          if (extraccionConsentimiento.valido) {
            if (extraccionConsentimiento.valor === true) {
              return avanzarFSM(session.id, numeroCliente, temp_data, esAudio);
            } else {
              await Chat.deleteSession(numeroCliente);
              return enviarMensajeWhatsApp(
                numeroCliente,
                "Lo entiendo perfectamente. Si en algún momento cambias de opinión, aquí estaré encantado de ayudarte. ¡Que tengas un día estupendo!",
                esAudio,
              );
            }
          }
          return enviarMensajeWhatsApp(
            numeroCliente,
            "¡Hola! 👋 Qué alegría saludarte. Soy el asistente de Taberna Tita Cosi. Para poder tomar nota de tu reserva y prepararlo todo, necesitamos tratar tus datos según nuestra Política de Privacidad (https://tita-cosi.vercel.app/es/privacidad). ¿Aceptas los términos para que empecemos? 😊",
            esAudio,
          );

        // Nuevo estado unificado (Slot Filling)
        default:
        case "GATHERING_INFO":
        case "AWAITING_NOMBRE": // Fallbacks por si habían sesiones en BD antiguas
        case "AWAITING_COMENSALES":
        case "AWAITING_FECHA":
        case "AWAITING_HORA":
        case "AWAITING_ZONA":
        case "AWAITING_EMAIL":
        case "AWAITING_NOTAS":
          const extraccion = await extraerDatosReserva(
            textoCliente,
            "GATHERING_INFO",
          );

          if (extraccion.es_faq) {
            return enviarMensajeWhatsApp(
              numeroCliente,
              extraccion.respuesta_faq,
              esAudio,
            );
          }

          // Fusión Dinámica de Datos extraídos en este mensaje con los que ya teníamos
          if (extraccion.datos) {
            Object.keys(extraccion.datos).forEach((key) => {
              if (extraccion.datos[key] !== null) {
                if (key === "email") {
                  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
                  if (emailRegex.test(extraccion.datos[key])) {
                    temp_data[key] = extraccion.datos[key];
                  }
                } else {
                  temp_data[key] = extraccion.datos[key];
                }
              }
            });

            if (
              textoCliente.match(/\b(no|ninguna|ninguno)\b/i) &&
              !temp_data.notas
            ) {
              temp_data.notas = "Ninguna";
            }
          }

          // Volvemos a pasar por la checklist para ver si ya tenemos todo
          return avanzarFSM(session.id, numeroCliente, temp_data, esAudio);
      }
    }
  } catch (error) {
    console.error("Error FSM WhatsApp:", error);
  }
};
