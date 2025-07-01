const mysql = require('mysql2')
const { parseDateTime } = require('../utils/dateUtils')

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PSWD,
  database: process.env.DB_NAME,
  port: +process.env.DB_PORT,
  connectionLimit: 200,
  multipleStatements: true,
  waitForConnections: true
})

pool.promiseQuery = (sql, params) =>
  new Promise((res, rej) =>
    pool.query(sql, params, (e, r) => (e ? rej(e) : res(r)))
  )

function initDatabase () {
  pool.getConnection((err, conn) => {
    if (err) throw err
    console.log('DB Connected')
    // Création des tables
    const ddl = [
      `CREATE TABLE IF NOT EXISTS auths (
         id INT AUTO_INCREMENT PRIMARY KEY,
         username VARCHAR(30) UNIQUE NOT NULL,
         password VARCHAR(255) NOT NULL, seed TEXT NOT NULL,
         name VARCHAR(50), email VARCHAR(50), birthdate VARCHAR(20),
         cni VARCHAR(255), address VARCHAR(50),
         status INT, record_date INT, record_time VARCHAR(10)
       );`,
      `CREATE TABLE IF NOT EXISTS users_stock (
         id INT AUTO_INCREMENT PRIMARY KEY,
         username VARCHAR(30) UNIQUE NOT NULL,
         balance DECIMAL(30,8) DEFAULT 0,
         record_date INT, record_time VARCHAR(10)
       );`,
      `CREATE TABLE IF NOT EXISTS activities (
         id INT AUTO_INCREMENT PRIMARY KEY,
         sender VARCHAR(30), receiver VARCHAR(30),
         type INT, amount DECIMAL(30,8),
         unit_price DECIMAL(30,8), fees DECIMAL(30,8),
         reference VARCHAR(20), record_date INT, record_time VARCHAR(10)
       );`,
      `CREATE TABLE IF NOT EXISTS common (
         id INT AUTO_INCREMENT PRIMARY KEY,
         total_units_price DECIMAL(30,8), unit_price DECIMAL(30,8),
         backed_units DECIMAL(30,8), record_date INT, record_time VARCHAR(10)
       );`,
      `CREATE TABLE IF NOT EXISTS notifs (
         id INT AUTO_INCREMENT PRIMARY KEY,
         content TEXT, record_date INT, record_time VARCHAR(10)
       );`
    ].join('\n')

    conn.query(ddl, err => {
      if (err) console.error('Init DB:', err)
      else console.log('Tables are ready')
      conn.release()
    })
  })
}

module.exports = { pool, initDatabase }
