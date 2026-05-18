// src/models/categoria.model.js
import pool from "../config/db.js";

export const CategoriaModel = {
  // Obtener todas las categorías
  getAll: async () => {
    // Usamos destructuring [rows] porque mysql2 devuelve un array con [datos, metadatos]
    const [rows] = await pool.query("SELECT * FROM categorias");
    return rows;
  },

  // Crear una nueva categoría
  create: async (nombre, slug) => {
    // Usamos "?" (consultas parametrizadas) para evitar Inyección SQL
    const [result] = await pool.query(
      "INSERT INTO categorias (nombre, slug) VALUES (?, ?)",
      [nombre, slug],
    );
    return result; // Devuelve info de la inserción (como el ID autoincremental)
  },
};
