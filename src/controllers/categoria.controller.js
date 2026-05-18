// src/controllers/categoria.controller.js
import { CategoriaModel } from "../models/categoria.model.js";

export const getCategorias = async (req, res) => {
  try {
    const categorias = await CategoriaModel.getAll();
    res.status(200).json(categorias);
  } catch (error) {
    console.error("Error obteniendo categorías:", error);
    res.status(500).json({ error: "Error interno del servidor" });
  }
};

export const createCategoria = async (req, res) => {
  try {
    const { nombre } = req.body;

    // Validación básica
    if (!nombre) {
      return res
        .status(400)
        .json({ error: "El nombre de la categoría es obligatorio" });
    }

    // Generamos el slug automáticamente (Ej: "Carnes Rojas" -> "carnes-rojas")
    const slug = nombre
      .toLowerCase()
      .trim()
      .replace(/[\s\W-]+/g, "-");

    const result = await CategoriaModel.create(nombre, slug);

    res.status(201).json({
      message: "Categoría creada con éxito",
      id: result.insertId,
      nombre,
      slug,
    });
  } catch (error) {
    console.error("Error creando categoría:", error);
    // Si el slug ya existe, MySQL lanzará un error de "Duplicate entry"
    if (error.code === "ER_DUP_ENTRY") {
      return res.status(409).json({ error: "Esta categoría ya existe" });
    }
    res.status(500).json({ error: "Error interno del servidor" });
  }
};
