// src/controllers/reserva.controller.js
import Reserva from "../models/reserva.model.js";
import dns from "dns";
import { promisify } from "util";

// Convertimos resolveMx a promisa para poder usar async/await
const resolveMx = promisify(dns.resolveMx);

// Función para validar si el dominio del correo puede recibir mensajes (Registros MX)
const verificarDominioCorreo = async (email) => {
  const dominio = email.split("@")[1];
  try {
    const records = await resolveMx(dominio);
    return records && records.length > 0;
  } catch (error) {
    return false; // El dominio no existe o no tiene servidores de correo configurados
  }
};

// Función helper centralizada para validar las reglas de negocio (Ahora es ASYNC por el DNS)
const validarReglasNegocio = async (datos) => {
  const { fecha, hora, comensales, notas, telefono_cliente, email_cliente } =
    datos;

  // 1. Validación de Teléfono (De 9 a 15 dígitos reales)
  if (!telefono_cliente) {
    return "El teléfono es obligatorio.";
  }
  // Extraemos solo los números para contar su longitud real
  const digitosTelefono = telefono_cliente.replace(/\D/g, "");
  if (digitosTelefono.length < 9 || digitosTelefono.length > 15) {
    return "El número de teléfono debe contener entre 9 y 15 dígitos reales.";
  }

  // 2. Validación de Email (Regex estricto + Resolución DNS)
  if (email_cliente) {
    // Fase 1: Regex exigiendo mínimo 3 caracteres en el proveedor
    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]{3,}\.[a-zA-Z]{2,}$/;
    if (!emailRegex.test(email_cliente)) {
      return "El formato del correo electrónico no es válido. Usa un proveedor real (ej. @gmail.com).";
    }

    // Fase 2: Comprobación de registros MX en el DNS
    const dominioValido = await verificarDominioCorreo(email_cliente);
    if (!dominioValido) {
      return "El dominio del correo proporcionado no existe o no está habilitado para recibir correos.";
    }
  }

  // 3. Límite de comensales (Máximo 20)
  if (!comensales || comensales < 1 || comensales > 20) {
    return "El número de comensales debe estar entre 1 y 20 personas.";
  }

  // 4. Límite de caracteres en notas/peticiones especiales (Máximo 500)
  if (notas && notas.length > 500) {
    return "Las notas opcionales no pueden superar los 500 caracteres.";
  }

  // Configuración de fechas para validaciones temporales
  const ahora = new Date();
  const horaFormateada = hora.length === 5 ? `${hora}:00` : hora;
  const fechaReservaCombinada = new Date(`${fecha}T${horaFormateada}`);

  // 5. Control de fechas pasadas
  if (fechaReservaCombinada < ahora) {
    return "No es posible programar o modificar una reserva para una fecha u hora que ya ha pasado.";
  }

  // 6. Ventana de reserva a largo plazo (Máximo 1 mes de antelación)
  const fechaMaxima = new Date();
  fechaMaxima.setMonth(fechaMaxima.getMonth() + 1);
  if (fechaReservaCombinada > fechaMaxima) {
    return "El sistema solo permite gestionar reservas con un máximo de 1 mes de antelación.";
  }

  // 7. Validación de horarios de apertura del local (Turnos de Comida y Cena)
  const [hh, mm] = hora.split(":").map(Number);
  const minutosTotales = hh * 60 + mm;

  const inicioComida = 13 * 60; // 13:00
  const finComida = 16 * 60; // 16:00
  const inicioCena = 20 * 60; // 20:00
  const finCena = 23 * 60 + 30; // 23:30

  const dentroDeComida =
    minutosTotales >= inicioComida && minutosTotales <= finComida;
  const dentroDeCena =
    minutosTotales >= inicioCena && minutosTotales <= finCena;

  if (!dentroDeComida && !dentroDeCena) {
    return "La hora seleccionada se encuentra fuera de nuestro horario de apertura al público (Comidas: 13:00-16:00 | Cenas: 20:00-23:30).";
  }

  return null; // Todo correcto
};

// [CRM] Obtener todas las reservas
export const getReservas = async (req, res) => {
  try {
    const reservas = await Reserva.getAll();
    res.json({
      success: true,
      data: reservas,
      message: "Reservas obtenidas correctamente",
    });
  } catch (error) {
    console.error("Error obteniendo reservas:", error);
    res.status(500).json({
      success: false,
      data: null,
      message: "Error interno del servidor al obtener las reservas",
    });
  }
};

// [CRM] Obtener una reserva por ID
export const getReservaById = async (req, res) => {
  try {
    const { id } = req.params;
    const reserva = await Reserva.getById(id);

    if (!reserva) {
      return res
        .status(404)
        .json({ success: false, data: null, message: "Reserva no encontrada" });
    }

    res.json({ success: true, data: reserva, message: "Reserva obtenida" });
  } catch (error) {
    console.error("Error obteniendo reserva:", error);
    res.status(500).json({
      success: false,
      data: null,
      message: "Error interno al obtener la reserva",
    });
  }
};

// Crear una nueva reserva
export const createReserva = async (req, res) => {
  try {
    // Validar reglas de negocio antes de tocar la base de datos (con AWAIT por la comprobación DNS)
    const errorValidacion = await validarReglasNegocio(req.body);
    if (errorValidacion) {
      return res.status(400).json({
        success: false,
        data: null,
        message: errorValidacion,
      });
    }

    const { fecha, hora, mesa_id } = req.body;

    // Verificar disponibilidad considerando la regla de protección de 90 minutos
    const isAvailable = await Reserva.checkAvailability(fecha, hora, mesa_id);
    if (!isAvailable) {
      return res.status(400).json({
        success: false,
        data: null,
        message:
          "Lo sentimos, esa mesa ya está comprometida dentro del rango de 90 minutos requerido para este servicio.",
      });
    }

    const id = await Reserva.create(req.body);

    // Integración automatizada con Make.com
    const makeWebhookUrl = process.env.MAKE_WEBHOOK_RESERVA_URL;
    if (makeWebhookUrl) {
      const payloadMake = {
        reservaId: id,
        nombre_cliente: req.body.nombre_cliente,
        email_cliente: req.body.email_cliente,
        telefono_cliente: req.body.telefono_cliente,
        fecha: req.body.fecha,
        hora: req.body.hora,
        comensales: req.body.comensales,
        mesa_id: req.body.mesa_id,
        zona: req.body.zona,
        notas: req.body.notas || "Sin peticiones especiales",
      };

      fetch(makeWebhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...payloadMake,
          tipo_formulario: "reserva",
        }),
      }).catch((err) => {
        console.error(
          "Error al enviar webhook de reserva a Make:",
          err.message,
        );
      });
    }

    res.status(201).json({
      success: true,
      data: { reservaId: id },
      message: "Reserva confirmada con éxito",
    });
  } catch (error) {
    console.error("Error creando reserva:", error);
    res.status(500).json({
      success: false,
      data: null,
      message: "Error interno al procesar tu reserva",
    });
  }
};

// [CRM] Actualizar una reserva
export const updateReserva = async (req, res) => {
  try {
    const { id } = req.params;
    const { fecha, hora, mesa_id, estado } = req.body;

    // Si la reserva se pasa a "Cancelada", se saltan las validaciones de disponibilidad de mesa/horarios
    if (estado !== "Cancelada") {
      // Usar AWAIT por la comprobación DNS
      const errorValidacion = await validarReglasNegocio(req.body);
      if (errorValidacion) {
        return res.status(400).json({
          success: false,
          data: null,
          message: errorValidacion,
        });
      }

      // Validar solapamiento excluyendo el ID actual de la propia reserva que se está editando
      const isAvailable = await Reserva.checkAvailability(
        fecha,
        hora,
        mesa_id,
        id,
      );
      if (!isAvailable) {
        return res.status(400).json({
          success: false,
          data: null,
          message:
            "No se puede guardar: La mesa seleccionada entra en conflicto de 90 minutos con otra reserva activa.",
        });
      }
    }

    const actualizado = await Reserva.update(id, req.body);
    if (!actualizado) {
      return res.status(404).json({
        success: false,
        data: null,
        message: "Reserva no encontrada o no se pudo aplicar la actualización",
      });
    }

    res.json({
      success: true,
      data: null,
      message: "Reserva actualizada con éxito",
    });
  } catch (error) {
    console.error("Error actualizando reserva:", error);
    res.status(500).json({
      success: false,
      data: null,
      message: "Error interno al actualizar la reserva",
    });
  }
};

// [CRM] Eliminar una reserva
export const deleteReserva = async (req, res) => {
  try {
    const { id } = req.params;
    const eliminado = await Reserva.delete(id);

    if (!eliminado) {
      return res.status(404).json({
        success: false,
        data: null,
        message: "Reserva no encontrada o ya ha sido eliminada",
      });
    }

    res.json({
      success: true,
      data: null,
      message: "Reserva eliminada con éxito de la base de datos",
    });
  } catch (error) {
    console.error("Error eliminando reserva:", error);
    res.status(500).json({
      success: false,
      data: null,
      message: "Error interno al intentar eliminar la reserva",
    });
  }
};
