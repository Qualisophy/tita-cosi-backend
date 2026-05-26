// src/controllers/reserva.controller.js
import Reserva from "../models/reserva.model.js";

// [CRM] Obtener todas las reservas
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

// [CRM] Obtener una reserva por ID
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

// [WEB/CRM] Crear una nueva reserva
export const createReserva = async (req, res) => {
  try {
    const { fecha, hora, mesa_id } = req.body;

    const isAvailable = await Reserva.checkAvailability(fecha, hora, mesa_id);

    if (!isAvailable) {
      return res.status(400).json({
        success: false,
        data: null,
        message:
          "Lo sentimos, esa mesa ya está reservada para esa fecha y hora.",
      });
    }

    const id = await Reserva.create(req.body);
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

// [CRM] Actualizar una reserva
export const updateReserva = async (req, res) => {
  try {
    const { id } = req.params;

    const actualizado = await Reserva.update(id, req.body);

    if (!actualizado) {
      return res.status(404).json({
        success: false,
        data: null,
        message: "Reserva no encontrada o no se pudo actualizar",
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

// [CRM] Eliminar una reserva
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
