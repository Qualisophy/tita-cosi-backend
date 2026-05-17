// src/index.js
import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import { rateLimit } from "express-rate-limit";

// Cargar variables de entorno
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// ==========================================
// 1. CAPA DE SEGURIDAD (MIDDLEWARES)
// ==========================================
app.use(helmet());
app.use(
  cors({
    origin: process.env.CORS_ORIGIN || "http://localhost:4321", // Conectará con tu frontend en Astro
    credentials: true,
  }),
);

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 100,
  message:
    "Demasiadas peticiones desde esta IP, por favor intenta de nuevo más tarde.",
});
app.use(limiter);

app.use(express.json());
app.use(cookieParser());

// ==========================================
// 2. RUTAS BÁSICAS
// ==========================================
app.get("/api/health", (req, res) => {
  res
    .status(200)
    .json({ status: "OK", message: "Servidor Tita Cosi funcionando 🚀" });
});

// ==========================================
// 3. ARRANQUE DEL SERVIDOR
// ==========================================
app.listen(PORT, () => {
  console.log(`✅ Servidor corriendo en http://localhost:${PORT}`);
});
