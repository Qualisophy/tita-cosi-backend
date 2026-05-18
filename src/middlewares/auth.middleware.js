// src/middlewares/auth.middleware.js
import jwt from "jsonwebtoken";

export const verificarToken = (req, res, next) => {
  // 1. Buscamos el token directamente en la cookie (gracias a cookie-parser)
  const token = req.cookies.token;

  // 2. Si no hay cookie con el token, puerta
  if (!token) {
    return res
      .status(403)
      .json({ message: "No se proporcionó un token de seguridad" });
  }

  try {
    // 3. Verificamos que el token sea nuestro y no esté caducado
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // 4. Guardamos los datos del admin en la request por si los necesitamos luego
    req.admin = decoded;

    // 5. ¡Pasa pa' dentro!
    next();
  } catch (error) {
    return res.status(401).json({ message: "Token inválido o expirado" });
  }
};
