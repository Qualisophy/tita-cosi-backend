// src/routes/producto.routes.js
import { Router } from "express";
import {
  getProductos,
  createProducto,
} from "../controllers/producto.controller.js";
import { verificarToken } from "../middlewares/auth.middleware.js";
import { upload } from "../middlewares/upload.middleware.js";

const router = Router();

// Público: Ver la carta
router.get("/", getProductos);

// Privado: Crear un plato (upload.single('imagen') le dice a Multer qué campo mirar)
router.post("/", verificarToken, upload.single("imagen"), createProducto);

export default router;
