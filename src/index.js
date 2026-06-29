// src/index.js
import dns from "node:dns";
dns.setDefaultResultOrder("ipv4first");
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
import whatsappRoutes from "./routes/whatsapp.routes.js";

// Cargar variables de entorno
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// ==========================================
// FIX: CONFIANZA EN PROXY INVERSO
// ==========================================
// Obligatorio para que Render mantenga el 'secure: true' en las cookies
app.set("trust proxy", 1);

// Configuración de rutas absolutas para ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ==========================================
// CAPA DE SEGURIDAD Y PARSEADORES (MIDDLEWARES)
// ==========================================

// IMPORTANTE: Permitir cargar imágenes locales cross-origin
app.use(helmet({ crossOriginResourcePolicy: false }));

// [SOLUCIÓN CORS]: Lista blanca para aceptar local (IPv4/IPv6) y producción dinámicamente
const allowedOrigins = [
  "http://localhost:4321",
  "http://127.0.0.1:4321",
  "https://tita-cosi.vercel.app",
  process.env.CORS_ORIGIN,
];

app.use(
  cors({
    origin: function (origin, callback) {
      // 1. Permite sin origen (Postman)
      // 2. Permite orígenes explícitos en la lista blanca
      // 3. Permite cualquier entorno de Preview generado por Vercel
      if (
        !origin ||
        allowedOrigins.includes(origin) ||
        origin.endsWith(".vercel.app")
      ) {
        callback(null, true);
      } else {
        callback(new Error("Bloqueado por CORS"));
      }
    },
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

// Módulo de Categoría
app.use("/api/categorias", categoriaRoutes);

// Módulo de Productos
app.use("/api/productos", productoRoutes);

// Módulo de Reservas
app.use("/api/reservas", reservaRoutes);

// Módulo de Contacto
app.use("/api/contacto", contactoRoutes);

// Módulo de WhatsApp (Chatbot)
app.use("/api/whatsapp", whatsappRoutes);

// ==========================================
// ARRANQUE DEL SERVIDOR
// ==========================================

app.listen(PORT, "0.0.0.0", () => {
  console.log(
    `✅ Servidor corriendo en el puerto ${PORT} (Accesible vía 127.0.0.1 y localhost)`,
  );
});
