const CryptoJS = require('crypto-js')

function encrypt (text, key) {
  return CryptoJS.AES.encrypt(text, key).toString()
}

function decrypt (cipher, key) {
  return CryptoJS.AES.decrypt(cipher, key).toString(CryptoJS.enc.Utf8)
}

module.exports = { encrypt, decrypt }
