// src/models/chat.model.js
import db from "../config/db.js";

const Chat = {
  // Obtiene el ID de sesión activo o crea uno nuevo si no existe
  getSessionId: async (telefono) => {
    const [rows] = await db.query(
      "SELECT id FROM chat_sessions WHERE telefono = ?",
      [telefono],
    );

    if (rows.length > 0) return rows[0].id;

    await db.query("INSERT INTO chat_sessions (telefono) VALUES (?)", [
      telefono,
    ]);

    const [newRows] = await db.query(
      "SELECT id FROM chat_sessions WHERE telefono = ?",
      [telefono],
    );
    return newRows[0].id;
  },

  // Recupera el historial ordenado cronológicamente
  getHistory: async (sessionId) => {
    const [rows] = await db.query(
      "SELECT role, content FROM chat_messages WHERE session_id = ? ORDER BY created_at ASC",
      [sessionId],
    );
    return rows;
  },

  // Añade un nuevo mensaje al historial
  addMessage: async (sessionId, role, content) => {
    await db.query(
      "INSERT INTO chat_messages (session_id, role, content) VALUES (?, ?, ?)",
      [sessionId, role, content],
    );
  },

  // Elimina la sesión y sus mensajes en cascada (al completar la reserva)
  deleteSession: async (telefono) => {
    await db.query("DELETE FROM chat_sessions WHERE telefono = ?", [telefono]);
  },
};

export default Chat;
