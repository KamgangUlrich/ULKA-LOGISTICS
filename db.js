const { Pool } = require("pg");

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false
    },
    // Force l'utilisation d'IPv4 pour contourner l'erreur ENETUNREACH sur Render
    family: 4
});

pool.on("connect", () => {
    console.log("ULKA LOGISTICS DATABASE CONNECTED SUCCESSFULLY VIA IPv4!");
});

pool.on("error", (err) => {
    console.error("Erreur de connexion à la base de données cloud :", err.message);
});

module.exports = pool;