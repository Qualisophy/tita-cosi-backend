import Reserva from "../models/reserva.model.js";
import Chat from "../models/chat.model.js";
import { extraerEntidad } from "../services/chatbot.service.js";
import { validarReglasNegocio, MESAS_CAPACIDAD } from "./reserva.controller.js";
import db from "../config/db.js";

const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN;
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_ID = process.env.WHATSAPP_PHONE_ID;

const enviarMensajeWhatsApp = async (numeroDestino, texto) => {
  if (!texto) return;
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

const procesarReservaFinal = async (sessionId, numeroCliente, temp_data) => {
  const payloadReserva = {
    nombre_cliente: temp_data.nombre,
    email_cliente: temp_data.email,
    telefono_cliente: numeroCliente,
    fecha: temp_data.fecha,
    hora: temp_data.hora,
    comensales: Number(temp_data.comensales),
    zona: temp_data.zona === "Terraza" ? "Terraza" : "Comedor",
    notas: temp_data.notas,
    mesa_id: null,
  };

  const prefijoMesa = payloadReserva.zona === "Terraza" ? "T" : "S";
  let mesaAsignada = null;
  let existeCapacidadAforo = false;

  // 1. Verificar si existe físicamente una mesa que soporte este aforo
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

  // Si el grupo es demasiado grande para las mesas online
  if (!existeCapacidadAforo) {
    await Chat.deleteSession(numeroCliente);
    return enviarMensajeWhatsApp(
      numeroCliente,
      `Lo siento ${temp_data.nombre}, nuestra capacidad máxima online para una sola mesa en la ${temp_data.zona} es inferior a ${temp_data.comensales} personas. Por favor, llámanos directamente al local para gestionar reservas de grupos grandes.`,
    );
  }

  // Si el grupo cabe, pero todas las mesas grandes están ocupadas a esa hora
  if (!mesaAsignada) {
    delete temp_data.hora;
    await Chat.updateSessionData(sessionId, "AWAITING_HORA", temp_data);
    return enviarMensajeWhatsApp(
      numeroCliente,
      `Lo siento ${temp_data.nombre}, no disponemos de mesas libres para ${temp_data.comensales} personas en la ${temp_data.zona} a esa hora. Por favor, indícame una HORA diferente.`,
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
      await Chat.updateSessionData(sessionId, "AWAITING_EMAIL", temp_data);
      return enviarMensajeWhatsApp(
        numeroCliente,
        `Tenemos un problema: ${errorValidacion} Por favor, facilítame un correo electrónico diferente.`,
      );
    }
    if (errorValidacion.includes("lunes")) {
      delete temp_data.fecha;
      await Chat.updateSessionData(sessionId, "AWAITING_FECHA", temp_data);
      return enviarMensajeWhatsApp(
        numeroCliente,
        `¡Vaya! 😅 Los lunes cerramos por descanso del personal. ¿Qué otro día te vendría bien?`,
      );
    }
    if (errorValidacion.includes("horario")) {
      delete temp_data.hora;
      await Chat.updateSessionData(sessionId, "AWAITING_HORA", temp_data);
      return enviarMensajeWhatsApp(
        numeroCliente,
        `Esa hora está fuera de nuestro horario de cocina (13:00 a 16:00 y 20:00 a 23:30). ¿A qué otra HORA te gustaría venir?`,
      );
    }

    delete temp_data.fecha;
    delete temp_data.hora;
    await Chat.updateSessionData(sessionId, "AWAITING_FECHA", temp_data);
    return enviarMensajeWhatsApp(
      numeroCliente,
      `Tenemos un conflicto: ${errorValidacion} Por favor, indícame una FECHA diferente.`,
    );
  }

  const insertId = await Reserva.create(payloadReserva);
  if (process.env.MAKE_WEBHOOK_RESERVA_URL) {
    fetch(process.env.MAKE_WEBHOOK_RESERVA_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        reservaId: insertId,
        ...payloadReserva,
        tipo_formulario: "reserva",
      }),
    }).catch((err) => console.error("Error webhook Make:", err));
  }

  await Chat.deleteSession(numeroCliente);
  const fechaLimpia = formatearFechaEsp(temp_data.fecha);
  console.log(
    `[✅ FSM FINALIZADA] Reserva de ${temp_data.nombre} guardada exitosamente.`,
  );
  return enviarMensajeWhatsApp(
    numeroCliente,
    `¡Reserva confirmada, ${temp_data.nombre}! 🎉 Te esperamos el ${fechaLimpia} a las ${temp_data.hora} en ${temp_data.zona}. Te hemos enviado un correo. (Escribe 'CANCELAR' si necesitas anularla).`,
  );
};

const avanzarFSM = async (sessionId, numeroCliente, temp_data) => {
  if (!temp_data.nombre) {
    await Chat.updateSessionData(sessionId, "AWAITING_NOMBRE", temp_data);
    return enviarMensajeWhatsApp(
      numeroCliente,
      "¡Perfecto! Para empezar, ¿a nombre de quién hacemos la reserva?",
    );
  }
  if (!temp_data.comensales) {
    await Chat.updateSessionData(sessionId, "AWAITING_COMENSALES", temp_data);
    return enviarMensajeWhatsApp(
      numeroCliente,
      `Encantado, ${temp_data.nombre}. ¿Para cuántas personas será la reserva?`,
    );
  }
  if (!temp_data.fecha) {
    await Chat.updateSessionData(sessionId, "AWAITING_FECHA", temp_data);
    return enviarMensajeWhatsApp(
      numeroCliente,
      "¿Qué día te gustaría venir? (Ej: Hoy, mañana, o el próximo viernes)",
    );
  }
  if (!temp_data.hora) {
    await Chat.updateSessionData(sessionId, "AWAITING_HORA", temp_data);
    const fechaLimpia = formatearFechaEsp(temp_data.fecha);
    return enviarMensajeWhatsApp(
      numeroCliente,
      `Apuntado el ${fechaLimpia}. ¿A qué hora prefieres? (Horario: 13:00 a 16:00 y 20:00 a 23:30)`,
    );
  }
  if (!temp_data.zona) {
    await Chat.updateSessionData(sessionId, "AWAITING_ZONA", temp_data);
    return enviarMensajeWhatsApp(
      numeroCliente,
      "¿Prefieres la mesa en la *Sala* o en la *Terraza*?",
    );
  }
  if (!temp_data.email) {
    await Chat.updateSessionData(sessionId, "AWAITING_EMAIL", temp_data);
    return enviarMensajeWhatsApp(
      numeroCliente,
      "Para enviarte el resguardo, facilítame un correo electrónico válido.",
    );
  }
  if (temp_data.notas === undefined) {
    await Chat.updateSessionData(sessionId, "AWAITING_NOTAS", temp_data);
    return enviarMensajeWhatsApp(
      numeroCliente,
      "¿Tenéis alguna alergia, intolerancia o petición especial? (Si no es el caso, escribe 'No')",
    );
  }

  return procesarReservaFinal(sessionId, numeroCliente, temp_data);
};

export const receiveMessage = async (req, res) => {
  res.sendStatus(200);

  try {
    const body = req.body;
    const message = body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];

    if (message && message.type === "text") {
      const numeroCliente = message.from;
      const textoCliente = message.text.body.trim().toLowerCase();

      console.log(`\n💬 [WA] Nuevo Mensaje: "${textoCliente}"`);

      if (
        textoCliente === "cancelar" ||
        textoCliente.includes("borrar mis datos")
      ) {
        const queryBusqueda = `
          SELECT id FROM reservas 
          WHERE telefono_cliente = ? AND CONCAT(fecha, ' ', hora) > NOW() AND estado != 'Cancelada' 
          ORDER BY created_at DESC LIMIT 1
        `;
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
        );
      }

      const session = await Chat.getSessionData(numeroCliente);
      let { step, temp_data } = session;
      temp_data =
        typeof temp_data === "string" ? JSON.parse(temp_data) : temp_data || {};

      console.log(`🔄 [FSM Estado]: ${step}`);

      switch (step) {
        case "AWAITING_CONSENT":
          const extraccionConsentimiento = await extraerEntidad(
            textoCliente,
            "CONSENTIMIENTO",
          );
          if (extraccionConsentimiento.es_faq)
            return enviarMensajeWhatsApp(
              numeroCliente,
              extraccionConsentimiento.respuesta_faq,
            );
          if (extraccionConsentimiento.valido) {
            if (extraccionConsentimiento.valor === true) {
              return avanzarFSM(session.id, numeroCliente, temp_data);
            } else {
              await Chat.deleteSession(numeroCliente);
              return enviarMensajeWhatsApp(
                numeroCliente,
                "Entendido. Si cambias de opinión, aquí estaré. ¡Buen día!",
              );
            }
          }
          return enviarMensajeWhatsApp(
            numeroCliente,
            "¡Hola! Soy el asistente virtual automatizado de Taberna Tita Cosi (IA). Para gestionar tu reserva necesitamos tratar tus datos según nuestra Política de Privacidad (https://tita-cosi.vercel.app/es/privacidad). ¿Aceptas los términos para continuar? (Sí / No)",
          );

        case "AWAITING_NOMBRE":
          const extraccionNombre = await extraerEntidad(textoCliente, "NOMBRE");
          if (extraccionNombre.es_faq)
            return enviarMensajeWhatsApp(
              numeroCliente,
              extraccionNombre.respuesta_faq,
            );
          if (extraccionNombre.valido) {
            temp_data.nombre = extraccionNombre.valor;
            return avanzarFSM(session.id, numeroCliente, temp_data);
          }
          return enviarMensajeWhatsApp(
            numeroCliente,
            "¿Podrías darme tu nombre para la reserva?",
          );

        case "AWAITING_COMENSALES":
          const extraccionComensales = await extraerEntidad(
            textoCliente,
            "COMENSALES",
          );
          if (extraccionComensales.es_faq)
            return enviarMensajeWhatsApp(
              numeroCliente,
              extraccionComensales.respuesta_faq,
            );
          if (extraccionComensales.valido) {
            temp_data.comensales = extraccionComensales.valor;
            return avanzarFSM(session.id, numeroCliente, temp_data);
          }
          return enviarMensajeWhatsApp(
            numeroCliente,
            "No he logrado entender el número. Por favor, indícame solo con un número cuántas personas seréis.",
          );

        case "AWAITING_FECHA":
          const extraccionFecha = await extraerEntidad(textoCliente, "FECHA");
          if (extraccionFecha.es_faq)
            return enviarMensajeWhatsApp(
              numeroCliente,
              extraccionFecha.respuesta_faq,
            );
          if (extraccionFecha.valido) {
            temp_data.fecha = extraccionFecha.valor;
            return avanzarFSM(session.id, numeroCliente, temp_data);
          }
          return enviarMensajeWhatsApp(
            numeroCliente,
            "Por favor, indícame una fecha válida futura (ej: mañana, el viernes, o 25/06).",
          );

        case "AWAITING_HORA":
          const extraccionHora = await extraerEntidad(textoCliente, "HORA");
          if (extraccionHora.es_faq)
            return enviarMensajeWhatsApp(
              numeroCliente,
              extraccionHora.respuesta_faq,
            );

          // Vía de escape: Cambio de contexto de zona
          if (extraccionHora.cambio_zona) {
            temp_data.zona = extraccionHora.nueva_zona;
            return enviarMensajeWhatsApp(
              numeroCliente,
              `Entendido, modificado a la ${extraccionHora.nueva_zona}. ¿A qué HORA te gustaría la mesa?`,
            );
          }

          if (extraccionHora.valido) {
            temp_data.hora = extraccionHora.valor;
            return avanzarFSM(session.id, numeroCliente, temp_data);
          }
          return enviarMensajeWhatsApp(
            numeroCliente,
            "No he entendido la hora. Por favor, indícalo en formato 24h (ej: 14:30 o 21:00).",
          );

        case "AWAITING_ZONA":
          const extraccionZona = await extraerEntidad(textoCliente, "ZONA");
          if (extraccionZona.es_faq)
            return enviarMensajeWhatsApp(
              numeroCliente,
              extraccionZona.respuesta_faq,
            );
          if (extraccionZona.valido) {
            temp_data.zona = extraccionZona.valor;
            return avanzarFSM(session.id, numeroCliente, temp_data);
          }
          return enviarMensajeWhatsApp(
            numeroCliente,
            "Por favor, indícame si prefieres 'Sala' o 'Terraza'.",
          );

        case "AWAITING_EMAIL":
          const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
          if (emailRegex.test(textoCliente)) {
            temp_data.email = textoCliente;
            return avanzarFSM(session.id, numeroCliente, temp_data);
          }
          return enviarMensajeWhatsApp(
            numeroCliente,
            "El formato del correo no parece válido. Por favor, revísalo (ej. correo@gmail.com).",
          );

        case "AWAITING_NOTAS":
          temp_data.notas = textoCliente === "no" ? "Ninguna" : textoCliente;
          return avanzarFSM(session.id, numeroCliente, temp_data);
      }
    }
  } catch (error) {
    console.error("Error FSM WhatsApp:", error);
  }
};
