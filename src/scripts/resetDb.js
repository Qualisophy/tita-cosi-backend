// src/scripts/resetDb.js
import pool from "../config/db.js";

const resetearBaseDeDatos = async () => {
  try {
    console.log("⚠️ Iniciando el protocolo de reseteo de la base de datos...");

    // 1. Apagamos la seguridad de las relaciones (Claves Foráneas)
    await pool.query("SET FOREIGN_KEY_CHECKS = 0");

    // 2. Vaciamos todas las tablas (TRUNCATE es más rápido y limpio que DELETE)
    console.log("🧹 Vaciando tabla: administradores...");
    await pool.query("TRUNCATE TABLE administradores");

    console.log("🧹 Vaciando tabla: productos...");
    await pool.query("TRUNCATE TABLE productos");

    console.log("🧹 Vaciando tabla: categorias...");
    await pool.query("TRUNCATE TABLE categorias");

    console.log("🧹 Vaciando tabla: reservas...");
    await pool.query("TRUNCATE TABLE reservas");

    console.log("🧹 Vaciando tabla: contactos...");
    await pool.query("TRUNCATE TABLE contactos");

    // 3. Volvemos a encender la seguridad
    await pool.query("SET FOREIGN_KEY_CHECKS = 1");

    console.log(
      "✅ Base de datos reseteada con éxito. Todas las tablas están limpias.",
    );
  } catch (error) {
    console.error("❌ Error crítico al resetear la base de datos:", error);
  } finally {
    // Cerramos la conexión
    await pool.end();
    process.exit(0);
  }
};

resetearBaseDeDatos();
