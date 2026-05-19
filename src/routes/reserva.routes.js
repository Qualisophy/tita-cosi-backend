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
// RUTAS PÚBLICAS (Para la web de Tita Cosi)
// ==========================================
// Crear reserva (No necesita token, ¡el cliente no hace login!)
router.post("/", createReserva);

// ==========================================
// RUTAS PRIVADAS (Para el CRM - Requieren Token JWT)
// ==========================================
// Listar todas las reservas
router.get("/", verificarToken, getReservas);

// Ver detalle de una reserva específica
router.get("/:id", verificarToken, getReservaById);

// Editar una reserva (Cambiar estado, mesa, etc.)
router.put("/:id", verificarToken, updateReserva);

// Eliminar una reserva (Borrado de pruebas o cancelaciones definitivas)
router.delete("/:id", verificarToken, deleteReserva);

export default router;
