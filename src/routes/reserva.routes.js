// src/routes/reserva.routes.js
import { Router } from "express";
import {
  getReservas,
  getReservaById,
  createReserva,
  updateReserva,
  deleteReserva,
} from "../controllers/reserva.controller.js";
// IMPORTANTE: Asegúrate de que esta ruta apunte a tu middleware de autenticación real
import { verificarToken } from "../middlewares/auth.middleware.js";

const router = Router();

// ==========================================
// RUTAS PÚBLICAS
// ==========================================
// Crear reserva
router.post("/", createReserva);

// ==========================================
// RUTAS PRIVADAS (Para el CRM)
// ==========================================
// Listar todas las reservas
router.get("/", verificarToken, getReservas);

// Ver detalle de una reserva específica
router.get("/:id", verificarToken, getReservaById);

// Editar una reserva (Cambiar estado, mesa, etc.)
router.put("/:id", verificarToken, updateReserva);

// Eliminar una reserva
router.delete("/:id", verificarToken, deleteReserva);

export default router;
