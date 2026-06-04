// src/controllers/auth.controller.js
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import pool from "../config/db.js";

export const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        data: null,
        message: "Email y contraseña son obligatorios",
      });
    }

    // 1. Buscamos al usuario en la BD
    const [users] = await pool.query(
      "SELECT * FROM administradores WHERE email = ?",
      [email],
    );

    if (users.length === 0) {
      return res.status(401).json({
        success: false,
        data: null,
        message: "Credenciales inválidas",
      });
    }

    const admin = users[0];

    // 2. Comparamos la contraseña en texto plano con el hash guardado
    const isMatch = await bcrypt.compare(password, admin.password_hash);

    if (!isMatch) {
      return res.status(401).json({
        success: false,
        data: null,
        message: "Credenciales inválidas",
      });
    }

    // 3. Creamos el Token JWT (La caducidad se lee del .env o usa 8h por defecto)
    const token = jwt.sign(
      { id: admin.id, email: admin.email },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || "8h" },
    );

    const isProduction = process.env.NODE_ENV === "production";

    // 4. Inyectamos el token en una Cookie HTTP-Only usando 'lax' gracias al proxy
    res.cookie("token", token, {
      httpOnly: true,
      secure: isProduction,
      sameSite: "lax",
      maxAge: 8 * 60 * 60 * 1000,
    });

    // 5. Devolvemos la confirmación al frontend SIN el token en el cuerpo, respetando estructura JSON
    return res.status(200).json({
      success: true,
      data: { id: admin.id, email: admin.email },
      message: "Login exitoso",
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      success: false,
      data: null,
      message: "Error interno en el servidor al hacer login",
    });
  }
};

export const logout = (req, res) => {
  const isProduction = process.env.NODE_ENV === "production";

  // Limpiamos la cookie que contiene el token con los atributos exactos de creación
  res.clearCookie("token", {
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax",
  });

  return res.status(200).json({
    success: true,
    data: null,
    message: "Sesión cerrada correctamente",
  });
};
