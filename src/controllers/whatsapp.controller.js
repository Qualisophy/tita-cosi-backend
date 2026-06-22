// src/controllers/whatsapp.controller.js
import Reserva from "../models/reserva.model.js";
import Chat from "../models/chat.model.js";
import { procesarMensaje } from "../services/chatbot.service.js";
import { validarReglasNegocio, MESAS_CAPACIDAD } from "./reserva.controller.js";

const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN;
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_ID = process.env.WHATSAPP_PHONE_ID;

const enviarMensajeWhatsApp = async (numeroDestino, texto) => {
  if (!texto) {
    console.warn(
      `[WA API] Intento bloqueado: Se intentó enviar un mensaje vacío o undefined al número ${numeroDestino}.`,
    );
    return;
  }

  try {
    const response = await fetch(
      `https://graph.facebook.com/v25.0/${PHONE_ID}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${WHATSAPP_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: numeroDestino,
          type: "text",
          text: { body: texto },
        }),
      },
    );

    const data = await response.json();
    if (data.error) {
      console.error("[WA API] Error de Meta:", data.error);
    }
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

export const receiveMessage = async (req, res) => {
  res.sendStatus(200);

  try {
    const body = req.body;
    if (body.object) {
      const entry = body.entry?.[0];
      const changes = entry?.changes?.[0];
      const value = changes?.value;
      const message = value?.messages?.[0];

      if (message && message.type === "text") {
        const numeroCliente = message.from;
        const textoCliente = message.text.body;

        const respuestaBot = await procesarMensaje(numeroCliente, textoCliente);

        if (!respuestaBot.esJson) {
          await enviarMensajeWhatsApp(numeroCliente, respuestaBot.mensaje);
        } else {
          const {
            nombre_cliente,
            email_cliente,
            fecha,
            hora,
            comensales,
            zona_preferida,
            notas,
          } = respuestaBot.datos;

          const sessionId = respuestaBot.sessionId;
          const quiereTerraza = zona_preferida
            ?.toLowerCase()
            .includes("terraza");
          const prefijoMesa = quiereTerraza ? "T" : "S";

          let mesaAsignada = null;
          for (const [id_mesa, capacidad] of Object.entries(MESAS_CAPACIDAD)) {
            if (
              id_mesa.startsWith(prefijoMesa) &&
              capacidad >= Number(comensales)
            ) {
              const libre = await Reserva.checkAvailability(
                fecha,
                hora,
                id_mesa,
              );
              if (libre) {
                mesaAsignada = id_mesa;
                break;
              }
            }
          }

          if (!mesaAsignada) {
            const nombreZona = quiereTerraza
              ? "la terraza"
              : "el salón interior";

            const maxCapacidadZona = Math.max(
              ...Object.entries(MESAS_CAPACIDAD)
                .filter(([id]) => id.startsWith(prefijoMesa))
                .map(([, cap]) => cap),
            );

            let instruccionIA = "";
            if (Number(comensales) > maxCapacidadZona) {
              instruccionIA = `[SISTEMA]: Por aforo físico, la mesa más grande en ${nombreZona} es para ${maxCapacidadZona}. Pídele al cliente que LLAME POR TELÉFONO. IGNORA LA REGLA DEL JSON, RESPONDE SOLO CON TEXTO NATURAL.`;
            } else {
              instruccionIA = `[SISTEMA]: Las mesas para ${comensales} personas en ${nombreZona} ya están ocupadas a esa hora. Ofrécele alternativas de hora o zona. IGNORA LA REGLA DEL JSON, RESPONDE SOLO CON TEXTO NATURAL.`;
            }

            if (sessionId)
              await Chat.addMessage(sessionId, "system", instruccionIA);

            const respuestaRechazo = await procesarMensaje(
              numeroCliente,
              "[SISTEMA]: Genera ahora mismo la respuesta en texto plano. CERO JSON.",
            );
            // Fallback en caso de que siga devolviendo JSON
            const textoRechazo =
              respuestaRechazo.mensaje ||
              `Lo siento, no disponemos de mesas para ${comensales} personas en ${nombreZona} a esa hora. Por favor, llámanos para gestionar tu reserva de forma manual.`;

            await enviarMensajeWhatsApp(numeroCliente, textoRechazo);
            return;
          }

          const payloadReserva = {
            nombre_cliente,
            email_cliente,
            telefono_cliente: numeroCliente,
            fecha,
            hora,
            comensales: Number(comensales),
            mesa_id: mesaAsignada,
            zona: quiereTerraza ? "Terraza" : "Comedor",
            notas: notas || "Reserva gestionada vía WhatsApp Bot",
          };

          const errorValidacion = await validarReglasNegocio(payloadReserva);
          if (errorValidacion) {
            const instruccionErrorIA = `[SISTEMA]: Fallo: ${errorValidacion}. Pídele al usuario que corrija esto. IGNORA LA REGLA DEL JSON, RESPONDE SOLO CON TEXTO NATURAL.`;
            if (sessionId)
              await Chat.addMessage(sessionId, "system", instruccionErrorIA);

            const respuestaError = await procesarMensaje(
              numeroCliente,
              "[SISTEMA]: Redacta el error de validación en texto plano.",
            );
            const textoError =
              respuestaError.mensaje ||
              `Tenemos un pequeño problema: ${errorValidacion} ¿Podrías indicarme el dato correcto?`;

            await enviarMensajeWhatsApp(numeroCliente, textoError);
            return;
          }

          const insertId = await Reserva.create(payloadReserva);

          const makeWebhookUrl = process.env.MAKE_WEBHOOK_RESERVA_URL;
          if (makeWebhookUrl) {
            fetch(makeWebhookUrl, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                reservaId: insertId,
                ...payloadReserva,
                tipo_formulario: "reserva",
              }),
            }).catch((err) => console.error("Error webhook Make WA:", err));
          }

          const instruccionExito = `[SISTEMA]: Reserva guardada con éxito (ID: ${insertId}). Confírmale la mesa en ${payloadReserva.zona}. IGNORA LA REGLA DEL JSON, DESPÍDETE EN TEXTO PLANO.`;
          if (sessionId)
            await Chat.addMessage(sessionId, "system", instruccionExito);

          const respuestaExito = await procesarMensaje(
            numeroCliente,
            "[SISTEMA]: Genera el mensaje final de confirmación en texto plano.",
          );
          const textoExito =
            respuestaExito.mensaje ||
            `¡Perfecto ${nombre_cliente}! 🎉 Tu reserva para ${comensales} personas el día ${fecha} a las ${hora} ha sido confirmada en ${payloadReserva.zona}. Te hemos enviado un correo. ¡Te esperamos en Taberna Tita Cosi!`;

          await enviarMensajeWhatsApp(numeroCliente, textoExito);
          await Chat.deleteSession(numeroCliente);
        }
      }
    }
  } catch (error) {
    console.error("Error procesando mensaje de WhatsApp:", error);
  }
};
