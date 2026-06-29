// src/routes/whatsapp.routes.js
import { Router } from "express";
import {
  verifyWebhook,
  receiveMessage,
} from "../controllers/whatsapp.controller.js";

const router = Router();

// GET para que Meta verifique el webhook al configurarlo
router.get("/webhook", verifyWebhook);

// POST para recibir los mensajes en tiempo real
router.post("/webhook", receiveMessage);

export default router;
