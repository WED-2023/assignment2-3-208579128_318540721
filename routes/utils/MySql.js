var mysql = require('mysql2');
require("dotenv").config();

const config = {
  connectionLimit: 4,
  host: "127.0.0.1",
  user: "root",
  password: "ii1212tay",
  database: "my_db",
  port: 3306
};

const pool = mysql.createPool(config);

// Function to get a connection from the pool
const connection = () => {
  return new Promise((resolve, reject) => {
    pool.getConnection((err, connection) => {
      if (err) {
        console.error("Error getting MySQL connection: ", err); // Log error
        return reject(err); // Reject promise if connection fails
      }

      console.log("MySQL pool connected: threadId " + connection.threadId);

      const query = (sql, binding) => {
        return new Promise((resolve, reject) => {
          connection.query(sql, binding, (err, result) => {
            if (err) {
              console.error("Error in query: ", err); // Log query error
              reject(err); // Reject promise on error
            }
            resolve(result); // Return result on success
          });
        });
      };

      const release = () => {
        return new Promise((resolve, reject) => {
          connection.release(); // Properly release the connection
          console.log("MySQL pool released: threadId " + connection.threadId);
          resolve(); // Resolve promise once released
        });
      };

      resolve({ query, release });
    });
  });
};

// General query function without specific connection
const query = (sql, binding) => {
  return new Promise((resolve, reject) => {
    pool.query(sql, binding, (err, result) => {
      if (err) {
        console.error("Error executing query: ", err); // Log query error
        reject(err); // Reject promise on error
      }
      resolve(result); // Return result on success
    });
  });
};

module.exports = { pool, connection, query };
