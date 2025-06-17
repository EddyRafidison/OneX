require("dotenv").config();
const express = require("express");
const path = require("path");

const { initDatabase } = require("./config/database");
const scheduledTasks = require("./scripts/scheduledTasks");
const appRoutes   = require("./routes/appRoutes");
const adminRoutes = require("./routes/adminRoutes");

const app = express();
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

// Redirection HTTP → HTTPS
app.use((req, res, next) => {
  if (req.protocol !== "https") {
    return res.redirect("https://" + req.headers.host + req.url);
  }
  next();
});

// Routes statiques & téléchargement APK
app.get("/", (_req, res) => res.redirect("/app/download-latest-apk"));
app.get("/privacy-terms/:type/:lang", (req, res) => {
  const file = `${req.params.type}_${req.params.lang}.html`;
  res.sendFile(path.join(__dirname, file), err => err && res.status(404).send("Not found"));
});

// Montée des routers
app.use("/app", appRoutes);
app.use("/admin", adminRoutes);

// Init DB & tâches planifiées
initDatabase();
scheduledTasks.startCleanupTask();

// Lancement du serveur
const PORT = process.env.SERVER_PORT;
app.listen(PORT, () => console.log(`Server listening on ${PORT}`));
