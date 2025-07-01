const nodemailer = require('nodemailer')

const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: process.env.MAIL_PORT,
  auth: {
    user: process.env.SERV_MAIL,
    pass: process.env.SERV_MAIL_PSWD
  }
})

module.exports = transporter
