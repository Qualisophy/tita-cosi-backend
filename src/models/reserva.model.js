// src/models/reserva.model.js
import db from "../config/db.js";

const Reserva = {
  // 1. Listar todas las reservas
  getAll: async () => {
    const [rows] = await db.query(
      "SELECT * FROM reservas ORDER BY fecha DESC, hora DESC",
    );
    return rows;
  },

  // 2. Obtener una reserva por ID
  getById: async (id) => {
    const [rows] = await db.query("SELECT * FROM reservas WHERE id = ?", [id]);
    return rows[0];
  },

  // 3. Crear una nueva reserva
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
      (nombre_cliente, email_cliente, telefono_cliente, fecha, hora, comensales, mesa_id, zona, notas, estado) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'Confirmada')`,
      [
        nombre_cliente,
        email_cliente,
        telefono_cliente,
        fecha,
        hora,
        comensales,
        mesa_id,
        zona,
        notas || null,
      ],
    );

    return result.insertId || result.affectedRows;
  },

  // 4. Editar/Actualizar una reserva existente
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
        notas || null,
        id,
      ],
    );

    return result.affectedRows > 0;
  },

  // 5. Verificar disponibilidad con rango de seguridad de 90 minutos
  checkAvailability: async (fecha, hora, mesa_id, exclude_id = null) => {
    const horaFormat = hora.length === 5 ? `${hora}:00` : hora;

    // Se calcula la diferencia absoluta en minutos entre la reserva existente y la nueva propuesta.
    // Si la diferencia es menor a 90 minutos en la misma mesa y no está cancelada, hay conflicto.
    let query = `
      SELECT id FROM reservas 
      WHERE mesa_id = ? 
      AND estado != 'Cancelada'
      AND ABS(TIMESTAMPDIFF(MINUTE, TIMESTAMP(fecha, hora), TIMESTAMP(?, ?))) < 90
    `;

    const params = [mesa_id, fecha, horaFormat];

    if (exclude_id) {
      query += ` AND id != ?`;
      params.push(exclude_id);
    }

    const [rows] = await db.query(query, params);

    // Devuelve true si la mesa está libre en ese rango de 90 minutos
    return rows.length === 0;
  },

  // 6. Eliminar una reserva
  delete: async (id) => {
    const [result] = await db.query("DELETE FROM reservas WHERE id = ?", [id]);
    return result.affectedRows > 0;
  },
};

export default Reserva;
