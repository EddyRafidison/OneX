// routes/appRoutes.js
const express = require('express')
const router = express.Router()
const appCtrl = require('../controllers/appController')

// Télécharger la dernière APK
router.get('/download-latest-apk', appCtrl.downloadApk)

// Vérifier version de l’app
router.post('/check-app-version', appCtrl.checkAppVersion)

// Inscription
router.post('/signup', appCtrl.signup)

// Connexion
router.post('/signin', appCtrl.signin)

// Contact OneX (formulaire)
router.post('/contact-onex', appCtrl.contact)

// Fil d’actualité
router.post('/feed', appCtrl.feed)

// Solde utilisateur (dernière valorisation)
router.post('/user-last-stock', appCtrl.userLastStock)

// Historique des transactions
router.post('/transactions-history', appCtrl.transactionsHistory)

// Transfert P2P
router.post('/near-transfer', appCtrl.nearTransfer)

// Modifier mot de passe / PIN
router.post('/modify-pin-or-password', appCtrl.modifyPwd)

// Supprimer compte utilisateur
router.post('/delete-user', appCtrl.deleteUser)

// Récupérer compte
router.post('/recover-account', appCtrl.recoverAccount)

// Modifier seed
router.post('/modify-seed', appCtrl.modifySeed)

module.exports = router
