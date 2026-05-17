// src/config/db.js
import mysql from "mysql2/promise";
import dotenv from "dotenv";

dotenv.config();

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT, // Añadimos esta línea
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

// Comprobamos la conexión automáticamente al arrancar
try {
  const connection = await pool.getConnection();
  console.log("📦 Conectado con éxito a la base de datos MySQL (tita_cosi_db)");
  connection.release();
} catch (error) {
  console.error("❌ Error conectando a la base de datos:", error.message);
}

export default pool;
