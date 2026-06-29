// src/models/chat.model.js
import db from "../config/db.js";

const Chat = {
  // Obtiene el ID de sesión activo o crea uno nuevo si no existe (Mantenido por compatibilidad)
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

  // (NUEVO FSM) Obtiene la sesión completa con estado y datos temporales
  getSessionData: async (telefono) => {
    const [rows] = await db.query(
      "SELECT id, step, temp_data FROM chat_sessions WHERE telefono = ?",
      [telefono],
    );

    if (rows.length > 0) return rows[0];

    // Si no existe, inicializamos el estado base para la máquina de estados
    await db.query(
      "INSERT INTO chat_sessions (telefono, step, temp_data) VALUES (?, 'AWAITING_CONSENT', ?)",
      [telefono, JSON.stringify({})],
    );

    const [newRows] = await db.query(
      "SELECT id, step, temp_data FROM chat_sessions WHERE telefono = ?",
      [telefono],
    );
    return newRows[0];
  },

  // (NUEVO FSM) Actualiza el paso actual y el payload acumulado
  updateSessionData: async (id, step, tempData) => {
    await db.query(
      "UPDATE chat_sessions SET step = ?, temp_data = ? WHERE id = ?",
      [step, JSON.stringify(tempData), id],
    );
  },

  // Recupera el historial ordenado cronológicamente
  getHistory: async (sessionId) => {
    const [rows] = await db.query(
      "SELECT role, content FROM chat_messages WHERE session_id = ? ORDER BY created_at ASC",
      [sessionId],
    );
    return rows;
  },

  // Añade un nuevo mensaje al historial (Para auditoría CRM)
  addMessage: async (sessionId, role, content) => {
    await db.query(
      "INSERT INTO chat_messages (session_id, role, content) VALUES (?, ?, ?)",
      [sessionId, role, content],
    );
  },

  // Elimina la sesión y sus mensajes en cascada (ON DELETE CASCADE)
  deleteSession: async (telefono) => {
    await db.query("DELETE FROM chat_sessions WHERE telefono = ?", [telefono]);
  },
};

export default Chat;
