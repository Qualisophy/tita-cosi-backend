// src/controllers/reserva.controller.js
import Reserva from "../models/reserva.model.js";
import dns from "dns";
import { promisify } from "util";

const resolveMx = promisify(dns.resolveMx);

// Diccionario estático de mesas para validación cruzada backend
export const MESAS_CAPACIDAD = {
  S1: 2,
  S2: 2,
  S3: 2,
  S4: 4,
  S5: 4,
  S6: 4,
  S7: 8,
  T1: 2,
  T2: 2,
  T3: 4,
  T4: 4,
  T5: 4,
  T6: 6,
};

const verificarDominioCorreo = async (email) => {
  const dominio = email.split("@")[1];
  try {
    const records = await resolveMx(dominio);
    return records && records.length > 0;
  } catch (error) {
    return false;
  }
};

// Validador central del negocio
export const validarReglasNegocio = async (datos) => {
  const {
    fecha,
    hora,
    comensales,
    notas,
    telefono_cliente,
    email_cliente,
    mesa_id,
  } = datos;

  if (!telefono_cliente) {
    return "El teléfono es obligatorio.";
  }
  const digitosTelefono = telefono_cliente.replace(/\D/g, "");
  if (digitosTelefono.length < 9 || digitosTelefono.length > 15) {
    return "El número de teléfono debe contener entre 9 y 15 dígitos reales.";
  }

  if (email_cliente) {
    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]{3,}\.[a-zA-Z]{2,}$/;
    if (!emailRegex.test(email_cliente)) {
      return "El formato del correo electrónico no es válido. Usa un proveedor real (ej. @gmail.com).";
    }

    const dominioValido = await verificarDominioCorreo(email_cliente);
    if (!dominioValido) {
      return "El dominio del correo proporcionado no existe o no está habilitado para recibir correos.";
    }
  }

  if (!comensales || comensales < 1 || comensales > 20) {
    return "El número de comensales debe estar entre 1 y 20 personas.";
  }
  if (mesa_id && MESAS_CAPACIDAD[mesa_id]) {
    if (Number(comensales) > MESAS_CAPACIDAD[mesa_id]) {
      return `La mesa seleccionada (${mesa_id}) tiene una capacidad máxima de ${MESAS_CAPACIDAD[mesa_id]} personas. Has intentado reservar para ${comensales}.`;
    }
  }

  if (notas && notas.length > 500) {
    return "Las notas opcionales no pueden superar los 500 caracteres.";
  }

  const ahora = new Date();
  const horaFormateada = hora.length === 5 ? `${hora}:00` : hora;
  const fechaReservaCombinada = new Date(`${fecha}T${horaFormateada}`);

  // FIX: Bloqueo estricto para los Lunes
  if (fechaReservaCombinada.getDay() === 1) {
    return "La taberna permanece cerrada por descanso del personal todos los lunes. Por favor, selecciona otro día de la semana.";
  }

  if (fechaReservaCombinada < ahora) {
    return "No es posible programar o modificar una reserva para una fecha u hora que ya ha pasado.";
  }

  const fechaMaxima = new Date();
  fechaMaxima.setMonth(fechaMaxima.getMonth() + 1);
  if (fechaReservaCombinada > fechaMaxima) {
    return "El sistema solo permite gestionar reservas con un máximo de 1 mes de antelación.";
  }

  const [hh, mm] = hora.split(":").map(Number);
  const minutosTotales = hh * 60 + mm;

  const inicioComida = 13 * 60;
  const finComida = 16 * 60;
  const inicioCena = 20 * 60;
  const finCena = 23 * 60 + 30;

  const dentroDeComida =
    minutosTotales >= inicioComida && minutosTotales <= finComida;
  const dentroDeCena =
    minutosTotales >= inicioCena && minutosTotales <= finCena;

  if (!dentroDeComida && !dentroDeCena) {
    return "La hora seleccionada se encuentra fuera de nuestro horario de apertura al público (Comidas: 13:00-16:00 | Cenas: 20:00-23:30).";
  }

  return null;
};

export const getReservas = async (req, res) => {
  try {
    const reservas = await Reserva.getAll();
    res.json({
      success: true,
      data: reservas,
      message: "Reservas obtenidas correctamente",
    });
  } catch (error) {
    console.error("Error obteniendo reservas:", error);
    res.status(500).json({
      success: false,
      data: null,
      message: "Error interno del servidor al obtener las reservas",
    });
  }
};

export const getReservaById = async (req, res) => {
  try {
    const { id } = req.params;
    const reserva = await Reserva.getById(id);

    if (!reserva) {
      return res
        .status(404)
        .json({ success: false, data: null, message: "Reserva no encontrada" });
    }

    res.json({ success: true, data: reserva, message: "Reserva obtenida" });
  } catch (error) {
    console.error("Error obteniendo reserva:", error);
    res.status(500).json({
      success: false,
      data: null,
      message: "Error interno al obtener la reserva",
    });
  }
};

export const createReserva = async (req, res) => {
  try {
    const errorValidacion = await validarReglasNegocio(req.body);
    if (errorValidacion) {
      return res.status(400).json({
        success: false,
        data: null,
        message: errorValidacion,
      });
    }

    const { fecha, hora, mesa_id } = req.body;

    const isAvailable = await Reserva.checkAvailability(fecha, hora, mesa_id);
    if (!isAvailable) {
      return res.status(400).json({
        success: false,
        data: null,
        message:
          "Lo sentimos, esa mesa ya está comprometida dentro del rango de 90 minutos requerido para este servicio.",
      });
    }

    const id = await Reserva.create(req.body);

    const makeWebhookUrl = process.env.MAKE_WEBHOOK_RESERVA_URL;
    if (makeWebhookUrl) {
      const payloadMake = {
        reservaId: id,
        nombre_cliente: req.body.nombre_cliente,
        email_cliente: req.body.email_cliente,
        telefono_cliente: req.body.telefono_cliente,
        fecha: req.body.fecha,
        hora: req.body.hora,
        comensales: req.body.comensales,
        mesa_id: req.body.mesa_id,
        zona: req.body.zona,
        notas: req.body.notas || "Sin peticiones especiales",
      };

      fetch(makeWebhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...payloadMake,
          tipo_formulario: "reserva",
        }),
      }).catch((err) => {
        console.error(
          "Error al enviar webhook de reserva a Make:",
          err.message,
        );
      });
    }

    res.status(201).json({
      success: true,
      data: { reservaId: id },
      message: "Reserva confirmada con éxito",
    });
  } catch (error) {
    console.error("Error creando reserva:", error);
    res.status(500).json({
      success: false,
      data: null,
      message: "Error interno al procesar tu reserva",
    });
  }
};

export const updateReserva = async (req, res) => {
  try {
    const { id } = req.params;
    const { fecha, hora, mesa_id, estado } = req.body;

    if (estado !== "Cancelada") {
      const errorValidacion = await validarReglasNegocio(req.body);
      if (errorValidacion) {
        return res.status(400).json({
          success: false,
          data: null,
          message: errorValidacion,
        });
      }

      const isAvailable = await Reserva.checkAvailability(
        fecha,
        hora,
        mesa_id,
        id,
      );
      if (!isAvailable) {
        return res.status(400).json({
          success: false,
          data: null,
          message:
            "No se puede guardar: La mesa seleccionada entra en conflicto de 90 minutos con otra reserva activa.",
        });
      }
    }

    const actualizado = await Reserva.update(id, req.body);
    if (!actualizado) {
      return res.status(404).json({
        success: false,
        data: null,
        message: "Reserva no encontrada o no se pudo aplicar la actualización",
      });
    }

    res.json({
      success: true,
      data: null,
      message: "Reserva actualizada con éxito",
    });
  } catch (error) {
    console.error("Error actualizando reserva:", error);
    res.status(500).json({
      success: false,
      data: null,
      message: "Error interno al actualizar la reserva",
    });
  }
};

export const deleteReserva = async (req, res) => {
  try {
    const { id } = req.params;
    const eliminado = await Reserva.delete(id);

    if (!eliminado) {
      return res.status(404).json({
        success: false,
        data: null,
        message: "Reserva no encontrada o ya ha sido eliminada",
      });
    }

    res.json({
      success: true,
      data: null,
      message: "Reserva eliminada con éxito de la base de datos",
    });
  } catch (error) {
    console.error("Error eliminando reserva:", error);
    res.status(500).json({
      success: false,
      data: null,
      message: "Error interno al intentar eliminar la reserva",
    });
  }
};
