// src/index.js
import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import { rateLimit } from "express-rate-limit";

// IMPORTACIONES DE BASE DE DATOS Y RUTAS
import pool from "./config/db.js";
import authRoutes from "./routes/auth.routes.js";
import categoriaRoutes from "./routes/categoria.routes.js";

// Cargar variables de entorno
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// ==========================================
// CAPA DE SEGURIDAD Y PARSEADORES (MIDDLEWARES)
// ==========================================

app.use(helmet());

app.use(
  cors({
    origin: process.env.CORS_ORIGIN || "http://localhost:4321",
    credentials: true,
  }),
);

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  limit: 100, // Límite de 100 peticiones por IP cada 15 min
  message:
    "Demasiadas peticiones desde esta IP, por favor intenta de nuevo más tarde.",
});
app.use(limiter);

// Parseadores del Body y Cookies
app.use(express.json());
app.use(cookieParser());

// ==========================================
// RUTAS BÁSICAS Y MÓDULOS
// ==========================================

// Ruta de estado de salud (Health Check)
app.get("/api/health", (req, res) => {
  res
    .status(200)
    .json({ status: "OK", message: "Servidor Tita Cosi funcionando 🚀" });
});

// Autenticación (Login)
app.use("/api/auth", authRoutes);

// Módulo de Categorías
app.use("/api/categorias", categoriaRoutes);

// ==========================================
// ARRANQUE DEL SERVIDOR
// ==========================================
app.listen(PORT, () => {
  console.log(`✅ Servidor corriendo en http://localhost:${PORT}`);
});
