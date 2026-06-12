// src/controllers/whatsapp.controller.js
import Reserva from "../models/reserva.model.js";
import { procesarMensaje } from "../services/chatbot.service.js";

// Tu token de validación que configurarás en el panel de Meta (puede ser cualquier palabra inventada por ti)
const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN;
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_ID = process.env.WHATSAPP_PHONE_ID;

// Función auxiliar para enviar mensajes por WhatsApp
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
        const numeroCliente = message.from; // Número de quien escribe
        const textoCliente = message.text.body;

        // 1. Pasar mensaje al Chatbot
        const respuestaBot = await procesarMensaje(numeroCliente, textoCliente);

        if (!respuestaBot.esJson) {
          // 2. Si no es JSON, enviamos la pregunta de la IA al cliente
          await enviarMensajeWhatsApp(numeroCliente, respuestaBot.mensaje);
        } else {
          // 3. ¡Es un JSON! Tenemos los datos. A guardar en DB.
          const { nombre_cliente, fecha, hora, comensales } =
            respuestaBot.datos;

          // Reutilizamos tu modelo (Asumimos mesa_id null hasta que un admin la asigne)
          const insertId = await Reserva.create({
            nombre_cliente,
            email_cliente: null, // No lo pedimos por WA por agilidad
            telefono_cliente: numeroCliente,
            fecha,
            hora,
            comensales: Number(comensales),
            mesa_id: null,
            zona: "Comedor", // Default
            notas: "Reserva gestionada vía WhatsApp Bot",
          });

          // 4. Disparar Webhook a Make (exactamente igual que en tu controlador web)
          const makeWebhookUrl = process.env.MAKE_WEBHOOK_RESERVA_URL;
          if (makeWebhookUrl) {
            fetch(makeWebhookUrl, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                reservaId: insertId,
                nombre_cliente,
                email_cliente: "whatsapp@titacosi.com",
                telefono_cliente: numeroCliente,
                fecha,
                hora,
                comensales,
                notas: "Reserva gestionada vía WhatsApp Bot",
                tipo_formulario: "reserva",
              }),
            }).catch((err) => console.error("Error webhook Make WA:", err));
          }

          // 5. Enviar confirmación final al cliente
          const mensajeConfirmacion = `¡Perfecto ${nombre_cliente}! 🎉 Tu reserva para ${comensales} personas el día ${fecha} a las ${hora} ha sido confirmada. ¡Te esperamos en Tita Cosi!`;
          await enviarMensajeWhatsApp(numeroCliente, mensajeConfirmacion);
        }
      }
    }
  } catch (error) {
    console.error("Error procesando mensaje de WhatsApp:", error);
  }
};
