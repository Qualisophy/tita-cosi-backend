// src/routes/categoria.routes.js
import { Router } from "express";
import {
  getCategorias,
  createCategoria,
} from "../controllers/categoria.controller.js";

const router = Router();

// GET /api/categorias
router.get("/", getCategorias);

// POST /api/categorias
router.post("/", createCategoria);

export default router;
