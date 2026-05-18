// src/config/db.js
import mysql from "mysql2/promise";
import dotenv from "dotenv";

dotenv.config();

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  // Le decimos que si estamos en producción (leyendo la variable DB_SSL), active la conexión segura
  ssl:
    process.env.DB_SSL === "true" ? { rejectUnauthorized: false } : undefined,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

try {
  const connection = await pool.getConnection();
  console.log(`📦 Conectado a la base de datos: ${process.env.DB_NAME}`);
  connection.release();
} catch (error) {
  console.error("❌ Error conectando a la base de datos:", error.message);
}

export default pool;
