// src/index.js
import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import { rateLimit } from "express-rate-limit";
import path from "path";
import { fileURLToPath } from "url";

// IMPORTACIONES DE BASE DE DATOS Y RUTAS
import pool from "./config/db.js";
import authRoutes from "./routes/auth.routes.js";
import categoriaRoutes from "./routes/categoria.routes.js";
import productoRoutes from "./routes/producto.routes.js";
import reservaRoutes from "./routes/reserva.routes.js";
import contactoRoutes from "./routes/contacto.routes.js";

// Cargar variables de entorno
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Configuración de rutas absolutas para ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ==========================================
// CAPA DE SEGURIDAD Y PARSEADORES (MIDDLEWARES)
// ==========================================

// IMPORTANTE: Permitir cargar imágenes locales cross-origin
app.use(helmet({ crossOriginResourcePolicy: false }));

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

// Carpeta pública para servir las imágenes subidas
// Cuando el frontend pida /uploads/foto.jpg, Express buscará en la carpeta local uploads
app.use("/uploads", express.static(path.join(__dirname, "../uploads")));

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

// Módulo de Productos
app.use("/api/productos", productoRoutes);

// Módulo de Reservas
app.use("/api/reservas", reservaRoutes);

// Módulo de Contacto
app.use("/api/contacto", contactoRoutes);

// ==========================================
// ARRANQUE DEL SERVIDOR
// ==========================================
app.listen(PORT, () => {
  console.log(`✅ Servidor corriendo en http://localhost:${PORT}`);
});
