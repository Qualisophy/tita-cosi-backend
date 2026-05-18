// src/scripts/createAdmin.js
import bcrypt from "bcrypt";
import pool from "../config/db.js"; // Esto ya carga dotenv automáticamente

const crearAdmin = async () => {
  try {
    const email = process.env.ADMIN_EMAIL;
    const passwordPlain = process.env.ADMIN_PASSWORD;

    if (!email || !passwordPlain) {
      console.error("❌ Faltan ADMIN_EMAIL o ADMIN_PASSWORD en el .env");
      process.exit(1);
    }

    // 1. Verificamos si el admin ya existe para no duplicarlo
    const [existingAdmins] = await pool.query(
      "SELECT id FROM administradores WHERE email = ?",
      [email],
    );

    if (existingAdmins.length > 0) {
      console.log(
        `⚠️ El administrador con email ${email} ya existe en la base de datos.`,
      );
      process.exit(0);
    }

    // 2. Encriptamos la contraseña (10 rondas de salt es el estándar seguro)
    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(passwordPlain, saltRounds);

    // 3. Insertamos en la base de datos
    await pool.query(
      "INSERT INTO administradores (email, password_hash) VALUES (?, ?)",
      [email, passwordHash],
    );

    console.log(`✅ Administrador supremo creado con éxito: ${email}`);
  } catch (error) {
    console.error("❌ Error creando al administrador:", error);
  } finally {
    // Cerramos la conexión para que la terminal no se quede pillada
    await pool.end();
    process.exit(0);
  }
};

crearAdmin();
