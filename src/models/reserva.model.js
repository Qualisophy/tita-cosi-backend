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
        notas,
        id,
      ],
    );

    return result.affectedRows > 0;
  },

  // 5. Verificar disponibilidad (AHORA SOPORTA EXCLUSIÓN DE ID PARA EDICIONES)
  checkAvailability: async (fecha, hora, mesa_id, exclude_id = null) => {
    // Normalizar hora para que coincida de forma estricta con MySQL TIME
    const horaFormat = hora.length === 5 ? `${hora}:00` : hora;

    let query = `SELECT id FROM reservas 
                 WHERE DATE(fecha) = DATE(?) 
                 AND TIME(hora) = TIME(?) 
                 AND mesa_id = ? 
                 AND estado != 'Cancelada'`;

    const params = [fecha, horaFormat, mesa_id];

    // Si estamos editando, excluimos la reserva actual para que no choque consigo misma
    if (exclude_id) {
      query += ` AND id != ?`;
      params.push(exclude_id);
    }

    const [rows] = await db.query(query, params);

    // Devuelve true si no hay resultados (está libre)
    return rows.length === 0;
  },

  // 6. Eliminar una reserva
  delete: async (id) => {
    const [result] = await db.query("DELETE FROM reservas WHERE id = ?", [id]);
    return result.affectedRows > 0;
  },
};

export default Reserva;
