// src/controllers/producto.controller.js
import pool from "../config/db.js";

// OBTENER TODOS LOS PRODUCTOS
export const getProductos = async (req, res) => {
  try {
    // Hacemos un JOIN para que además del producto, nos devuelva el nombre de la categoría
    const query = `
      SELECT p.*, c.nombre as categoria_nombre 
      FROM productos p
      LEFT JOIN categorias c ON p.categoria_id = c.id
    `;
    const [rows] = await pool.query(query);
    res.json(rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error al obtener los productos" });
  }
};

// CREAR UN PRODUCTO
export const createProducto = async (req, res) => {
  try {
    const { nombre, descripcion, precio, disponible, tags, categoria_id } =
      req.body;

    // Validaciones básicas
    if (!nombre || !precio || !categoria_id) {
      return res
        .status(400)
        .json({ message: "Nombre, precio y categoría son obligatorios" });
    }

    // 1. Verificamos si la categoría existe realmente
    const [categoriaExiste] = await pool.query(
      "SELECT id FROM categorias WHERE id = ?",
      [categoria_id],
    );
    if (categoriaExiste.length === 0) {
      return res
        .status(404)
        .json({ message: "La categoría indicada no existe" });
    }

    // 2. Gestionamos la imagen (Si viene, guardamos la ruta)
    let imagen_url = null;
    if (req.file) {
      // Guardamos la ruta relativa para poder servirla desde el frontend
      imagen_url = `/uploads/${req.file.filename}`;
    }

    // 3. Insertamos en la BD (El UUID se genera solo gracias a tu script SQL)
    const query = `
      INSERT INTO productos 
      (nombre, descripcion, precio, imagen_url, disponible, tags, categoria_id) 
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `;

    const isDisponible = disponible !== undefined ? disponible : true;

    await pool.query(query, [
      nombre,
      descripcion || null,
      precio,
      imagen_url,
      isDisponible,
      tags || null,
      categoria_id,
    ]);

    res.status(201).json({ message: "Producto creado con éxito" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error al crear el producto" });
  }
};
