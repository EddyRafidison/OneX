const express = require('express')
const fs = require('fs')
const geoip = require('geoip-country')
const axios = require('axios')
const nodemailer = require('nodemailer')
const BigNumber = require('bignumber.js')

const {
  db,
  OneX,
  maxStockDefault,
  P2Pallowed,
  first_welcome_clients,
  welcome_bonus,
  tfees,
  admin_pswd,
  admin_pin,
  MAIL_PORT,
  SERVER_MAIL,
  SERVER_MAIL_PSWD,
  stock_limit
} = require('./db')

const {
  encrypt,
  decrypt,
  getDate,
  getDateBefore,
  createTxId,
  getUserPrefixName,
  createUserSuffixName,
  httpsRedirect
} = require('./utils')

const router = express.Router()

// ----- MAILER -----
const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: MAIL_PORT,
  auth: { user: SERVER_MAIL, pass: SERVER_MAIL_PSWD }
})

// ------------- ROUTES PUBLIQUES --------------
router.get('/', (_r, s) => s.redirect('/app/download-latest-apk'))
router.get('/app/privacy-terms-info', async (req, res) => {
  const file = `./${req.query.r === 'terms' ? 'terms' : 'privacy'}_${
    req.query.l
  }.html`
  try {
    res.send(await fs.promises.readFile(file, 'utf8'))
  } catch {
    res.send('error')
  }
})
router.get('/app/download-latest-apk', (_r, res, n) =>
  res.download('./OneX.apk', 'OneX.apk', n)
)

// ------------- ROUTES APPS (POST) --------------
// check version
router.post('/app/check-app-version', (_r, res) => {
  const size = fs.statSync('./OneX.apk').size / (1024 * 1024)
  res.send({ version: process.env.APP_VERSION, size })
})

// contact
router.post('/app/contact-onex', async (req, res) => {
  // … même code que dans l’original
})

// signup
router.post('/app/signup', async (req, res) => {
  // … même code que dans l’original
})

// signin
router.post('/app/signin', async (req, res) => {
  // … idem
})

// feed, user-last-stock, transactions-history, near-transfer,
// modify-pin-or-password, delete-user, recover-account, modify-seed
// recopiez intégralement chaque handler de app.js

// ------------- ADMIN POSTS --------------
router.post('/admin/set-user-status', async (req, res) => {
  /* … */
})
router.post('/admin/add-to-feed', async (req, res) => {
  /* … */
})
router.post('/admin/update-user-or-common-stock', async (req, res) => {
  /* … */
})

module.exports = router
