// src/routes/contacto.routes.js
import { Router } from "express";
import { createContacto } from "../controllers/contacto.controller.js";

const router = Router();

// Cualquiera puede enviar un mensaje desde la web (Público)
router.post("/", createContacto);

export default router;
