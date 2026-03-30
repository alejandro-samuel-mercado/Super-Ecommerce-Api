const path = require('path');

/**
 * Asegura que una URL sea absoluta añadiendo el protocolo y host si es necesario.
 * @param {string} url - La URL o ruta relativa.
 * @param {object} req - El objeto request de Express.
 * @returns {string} - La URL absoluta.
 */
const ensureAbsoluteUrl = (url, req) => {
  if (!url) return url;

  // Handle arrays recursively
  if (Array.isArray(url)) {
    return url.map((u) => ensureAbsoluteUrl(u, req));
  }

  // Ensure url is a string
  if (typeof url !== "string") return url;

  // Si ya es absoluta (http/https), devolverla
  if (url.startsWith("http://") || url.startsWith("https://")) {
    return url;
  }

  // Si es un base64 o data URL, devolverla
  if (url.startsWith("data:")) {
    return url;
  }

  const baseUrl =
    process.env.API_URL || (req ? `${req.protocol}://${req.get("host")}` : "");

  if (!baseUrl) return url;

  // Asegurar que no haya dobles slashes
  const cleanUrl = url.startsWith("/") ? url : `/${url}`;
  return `${baseUrl}${cleanUrl}`;
};

module.exports = {
  ensureAbsoluteUrl
};
