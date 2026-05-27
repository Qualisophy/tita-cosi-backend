// src/models/contacto.model.js
import pool from "../config/db.js";

export const ContactoModel = {
  // Crear un nuevo mensaje de contacto
  create: async ({
    nombre,
    email,
    telefono,
    mensaje,
    motivo,
    tipo_formulario,
  }) => {
    // Usamos "?" para evitar Inyección SQL
    const [result] = await pool.query(
      `INSERT INTO contactos (nombre, email, telefono, mensaje, motivo, tipo_formulario, fecha_envio) 
       VALUES (?, ?, ?, ?, ?, ?, NOW())`,
      [nombre, email, telefono, mensaje, motivo, tipo_formulario],
    );
    return result; // Devuelve info de la inserción (como el insertId)
  },
};
