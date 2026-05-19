// src/middlewares/upload.middleware.js
import multer from "multer";
import path from "path";

// Configuración de almacenamiento
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    // Las imágenes irán a la carpeta 'uploads' en la raíz de tu proyecto
    cb(null, "uploads/");
  },
  filename: (req, file, cb) => {
    // Generamos un nombre único: timestamp_nombreOriginal
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  },
});

// Filtro para aceptar solo imágenes
const fileFilter = (req, file, cb) => {
  if (file.mimetype.startsWith("image/")) {
    cb(null, true);
  } else {
    cb(new Error("El archivo no es una imagen válida"), false);
  }
};

export const upload = multer({ storage, fileFilter });
