// routes/adminRoutes.js
const express = require("express");
const router = express.Router();
const adminCtrl = require("../controllers/adminController");

// Changer le status d’un utilisateur
router.post(
  "/set-user-status",
  adminCtrl.setUserStatus
);

// Ajouter une notification au feed
router.post(
  "/add-to-feed",
  adminCtrl.addToFeed
);

// Mettre à jour le stock (client ou commun)
router.post(
  "/update-user-or-common-stock",
  adminCtrl.updateUserOrCommonStock
);

module.exports = router;
