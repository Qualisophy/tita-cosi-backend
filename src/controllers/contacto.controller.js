// src/controllers/contacto.controller.js
import { ContactoModel } from "../models/contacto.model.js";

export const createContacto = async (req, res) => {
  try {
    const { nombre, email, telefono, mensaje, tipo_formulario } = req.body;

    // 1. Validación básica
    if (!nombre || !email || !mensaje) {
      return res.status(400).json({
        success: false,
        message: "Los campos nombre, email y mensaje son obligatorios",
      });
    }

    // 2. Guardamos en MySQL usando nuestro Modelo
    const result = await ContactoModel.create({
      nombre,
      email,
      telefono: telefono || null,
      mensaje,
      motivo: "Consulta Web (Formulario)",
      tipo_formulario: tipo_formulario || "contacto",
    });

    // 3. Disparamos el Webhook a Make.com en segundo plano (sin await)
    // Utilizamos el fetch nativo de Node.js v22 (no requiere importación)
    const webhookUrl = process.env.MAKE_WEBHOOK_RESERVA_URL;

    if (webhookUrl) {
      fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tipo_formulario: "contacto", // Variable clave para el Router de Make
          contacto_id: result.insertId,
          nombre_cliente: nombre,
          email_cliente: email,
          telefono_cliente: telefono || "No provisto",
          mensaje: mensaje,
          fecha_envio: new Date().toISOString(),
        }),
      }).catch((err) =>
        console.error("Error enviando contacto a Make.com:", err),
      );
    }

    // 4. Respondemos inmediatamente al frontend
    res.status(201).json({
      success: true,
      message: "Mensaje de contacto recibido correctamente",
      data: {
        id: result.insertId,
        nombre,
        email,
      },
    });
  } catch (error) {
    console.error("Error procesando contacto:", error);
    res.status(500).json({
      success: false,
      message: "Error interno del servidor al procesar el contacto",
    });
  }
};
