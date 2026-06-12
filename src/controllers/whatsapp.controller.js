// src/controllers/whatsapp.controller.js
import Reserva from "../models/reserva.model.js";
import { procesarMensaje } from "../services/chatbot.service.js";
import { validarReglasNegocio, MESAS_CAPACIDAD } from "./reserva.controller.js";

const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN;
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_ID = process.env.WHATSAPP_PHONE_ID;

const enviarMensajeWhatsApp = async (numeroDestino, texto) => {
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
    console.log("Respuesta de Meta al intentar enviar WhatsApp:", data);
  } catch (error) {
    console.error("Error enviando WhatsApp:", error);
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
  // Meta requiere un 200 OK inmediato para no reintentar el envío
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

        // 1. Pasar mensaje al Chatbot
        const respuestaBot = await procesarMensaje(numeroCliente, textoCliente);

        if (!respuestaBot.esJson) {
          // 2. Si no es JSON, enviamos la pregunta de la IA al cliente
          await enviarMensajeWhatsApp(numeroCliente, respuestaBot.mensaje);
        } else {
          // 3. ¡Es un JSON! Tenemos los datos. A preparar la DB.
          const {
            nombre_cliente,
            email_cliente,
            fecha,
            hora,
            comensales,
            zona_preferida,
            notas,
          } = respuestaBot.datos;

          // 4. AUTO-ASIGNADOR DE MESAS BASADO EN ZONA
          // Determinamos el prefijo de la mesa: "T" para terraza, "S" para sala
          const quiereTerraza = zona_preferida
            ?.toLowerCase()
            .includes("terraza");
          const prefijoMesa = quiereTerraza ? "T" : "S";

          let mesaAsignada = null;
          for (const [id_mesa, capacidad] of Object.entries(MESAS_CAPACIDAD)) {
            // Filtramos por zona (prefijo) y capacidad
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

          // Si no encontramos mesa libre en esa zona
          if (!mesaAsignada) {
            const nombreZona = quiereTerraza
              ? "la terraza"
              : "el salón interior";
            const mensajeAforo = `¡Vaya, ${nombre_cliente}! 😅 He revisado nuestra disponibilidad y no nos quedan mesas libres en ${nombreZona} para ${comensales} personas el día ${fecha} a las ${hora}. ¿Te gustaría probar en la otra zona, o cambiar la hora/día?`;
            await enviarMensajeWhatsApp(numeroCliente, mensajeAforo);
            return;
          }

          // 5. CONSTRUIR PAYLOAD DE RESERVA
          const payloadReserva = {
            nombre_cliente,
            email_cliente,
            telefono_cliente: numeroCliente,
            fecha,
            hora,
            comensales: Number(comensales),
            mesa_id: mesaAsignada,
            zona: quiereTerraza ? "Terraza" : "Comedor", // Guardamos la zona exacta en DB
            notas: notas || "Reserva gestionada vía WhatsApp Bot",
          };

          // 6. VALIDAR CON TUS REGLAS DE NEGOCIO GLOBALES
          const errorValidacion = await validarReglasNegocio(payloadReserva);
          if (errorValidacion) {
            await enviarMensajeWhatsApp(
              numeroCliente,
              `Tenemos un pequeño problema: ${errorValidacion} ¿Podrías indicarme otros datos o corregirlos?`,
            );
            return;
          }

          // 7. GUARDAR EN DB
          const insertId = await Reserva.create(payloadReserva);

          // 8. DISPARAR WEBHOOK A MAKE
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

          // 9. ENVIAR CONFIRMACIÓN FINAL AL CLIENTE
          const mensajeConfirmacion = `¡Perfecto ${nombre_cliente}! 🎉 Tu reserva para ${comensales} personas el día ${fecha} a las ${hora} ha sido confirmada en ${payloadReserva.zona}. Te hemos enviado un correo a ${email_cliente} con los detalles. ¡Te esperamos en Taberna Tita Cosi!`;
          await enviarMensajeWhatsApp(numeroCliente, mensajeConfirmacion);
        }
      }
    }
  } catch (error) {
    console.error("Error procesando mensaje de WhatsApp:", error);
  }
};
