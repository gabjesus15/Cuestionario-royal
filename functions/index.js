const {onRequest} = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");

// Ping simple: usa onRequest y logger para que ESLint no se queje
exports.ping = onRequest((req, res) => {
  logger.info("Ping recibido", {path: req.path});
  res.status(200).send("pong");
});
