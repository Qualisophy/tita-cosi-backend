// src/controllers/reserva.controller.js
import Reserva from "../models/reserva.model.js";

// [CRM] Obtener todas las reservas
export const getReservas = async (req, res) => {
  try {
    const reservas = await Reserva.getAll();
    res.json(reservas);
  } catch (error) {
    console.error("Error obteniendo reservas:", error);
    res
      .status(500)
      .json({ message: "Error interno del servidor al obtener las reservas" });
  }
};

// [CRM] Obtener una reserva por ID
export const getReservaById = async (req, res) => {
  try {
    const { id } = req.params;
    const reserva = await Reserva.getById(id);

    if (!reserva) {
      return res.status(404).json({ message: "Reserva no encontrada" });
    }

    res.json(reserva);
  } catch (error) {
    console.error("Error obteniendo reserva:", error);
    res.status(500).json({ message: "Error interno al obtener la reserva" });
  }
};

// [WEB/CRM] Crear una nueva reserva
export const createReserva = async (req, res) => {
  try {
    const { fecha, hora, mesa_id } = req.body;

    // 1. Verificación vital: ¿Está la mesa libre ese día y a esa hora?
    const isAvailable = await Reserva.checkAvailability(fecha, hora, mesa_id);

    if (!isAvailable) {
      return res.status(400).json({
        message:
          "Lo sentimos, esa mesa ya está reservada para esa fecha y hora.",
      });
    }

    // 2. Si está libre, la creamos
    const id = await Reserva.create(req.body);
    res.status(201).json({
      message: "Reserva confirmada con éxito",
      reservaId: id,
    });
  } catch (error) {
    console.error("Error creando reserva:", error);
    res.status(500).json({ message: "Error interno al procesar tu reserva" });
  }
};

// [CRM] Actualizar una reserva (ej. cambiar el estado a "Confirmada" o "Completada")
export const updateReserva = async (req, res) => {
  try {
    const { id } = req.params;

    const actualizado = await Reserva.update(id, req.body);

    if (!actualizado) {
      return res
        .status(404)
        .json({ message: "Reserva no encontrada o no se pudo actualizar" });
    }

    res.json({ message: "Reserva actualizada con éxito" });
  } catch (error) {
    console.error("Error actualizando reserva:", error);
    res.status(500).json({ message: "Error interno al actualizar la reserva" });
  }
};

// [CRM] Eliminar una reserva (Borrado físico)
export const deleteReserva = async (req, res) => {
  try {
    const { id } = req.params;

    const eliminado = await Reserva.delete(id);

    if (!eliminado) {
      return res
        .status(404)
        .json({ message: "Reserva no encontrada o ya ha sido eliminada" });
    }

    res.json({ message: "Reserva eliminada con éxito de la base de datos" });
  } catch (error) {
    console.error("Error eliminando reserva:", error);
    res
      .status(500)
      .json({ message: "Error interno al intentar eliminar la reserva" });
  }
};
