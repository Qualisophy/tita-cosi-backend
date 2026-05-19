// src/models/reserva.model.js
import db from "../config/db.js"; // O la ruta exacta a tu configuración de conexión de base de datos

const Reserva = {
  // 1. Listar todas las reservas (Para la vista principal del CRM)
  getAll: async () => {
    const [rows] = await db.query(
      "SELECT * FROM reservas ORDER BY fecha DESC, hora DESC",
    );
    return rows;
  },

  // 2. Obtener una reserva por ID (Para ver el detalle o cargar el formulario de edición)
  getById: async (id) => {
    const [rows] = await db.query("SELECT * FROM reservas WHERE id = ?", [id]);
    return rows[0];
  },

  // 3. Crear una nueva reserva (Desde el front del cliente o manualmente desde el CRM)
  create: async (datosReserva) => {
    const {
      nombre_cliente,
      email_cliente,
      telefono_cliente,
      fecha,
      hora,
      comensales,
      mesa_id,
      zona,
      notas,
    } = datosReserva;

    const [result] = await db.query(
      `INSERT INTO reservas 
      (nombre_cliente, email_cliente, telefono_cliente, fecha, hora, comensales, mesa_id, zona, notas) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        nombre_cliente,
        email_cliente,
        telefono_cliente,
        fecha,
        hora,
        comensales,
        mesa_id,
        zona,
        notas,
      ],
    );

    return result.insertId || result.affectedRows;
  },

  // 4. Editar/Actualizar una reserva existente (Para cambiar el estado, la mesa, etc., desde el CRM)
  update: async (id, datosActualizados) => {
    const {
      nombre_cliente,
      email_cliente,
      telefono_cliente,
      fecha,
      hora,
      comensales,
      mesa_id,
      zona,
      estado,
      notas,
    } = datosActualizados;

    const [result] = await db.query(
      `UPDATE reservas SET 
        nombre_cliente = ?, 
        email_cliente = ?, 
        telefono_cliente = ?, 
        fecha = ?, 
        hora = ?, 
        comensales = ?, 
        mesa_id = ?, 
        zona = ?, 
        estado = ?, 
        notas = ? 
      WHERE id = ?`,
      [
        nombre_cliente,
        email_cliente,
        telefono_cliente,
        fecha,
        hora,
        comensales,
        mesa_id,
        zona,
        estado,
        notas,
        id,
      ],
    );

    return result.affectedRows > 0;
  },

  // 5. Verificar disponibilidad (Vital para evitar que dos personas reserven la misma mesa el mismo día y hora)
  checkAvailability: async (fecha, hora, mesa_id) => {
    const [rows] = await db.query(
      `SELECT * FROM reservas 
      WHERE fecha = ? AND hora = ? AND mesa_id = ? AND estado != 'Cancelada'`,
      [fecha, hora, mesa_id],
    );
    return rows.length === 0;
  },

  // 6. Eliminar una reserva físicamente de la base de datos
  delete: async (id) => {
    const [result] = await db.query("DELETE FROM reservas WHERE id = ?", [id]);
    return result.affectedRows > 0;
  },
};

export default Reserva;
