const mysql2 = require('mysql2/promise')
require('dotenv').config() 

const pool = mysql2.createPool({
  "host":process.env.DB_LOCAL,
  "password":process.env.DB_PASSWORD,
  "user":process.env.DB_USER,
  "port":process.env.DB_PORTA,
  "database":process.env.DB_DATABASE
})

module .exports = pool
