import { Router } from "express";
import {
  getCategorias,
  createCategoria,
} from "../controllers/categoria.controller.js";
import { verificarToken } from "../middlewares/auth.middleware.js";

const router = Router();

// Cualquiera puede ver las categorías (Público)
router.get("/", getCategorias);

// SOLO los admins con token pueden crear categorías (Protegido)
router.post("/", verificarToken, createCategoria);

export default router;
