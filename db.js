const { Pool } = require("pg");

// Configuration explicite pour forcer IPv4 et éviter l'erreur ENETUNREACH sur Render
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false
    },
    family: 4 // Force l'utilisation d'IPv4 (Obligatoire pour Supabase sur Render)
});

pool.on("connect", () => {
    console.log("ULKA LOGISTICS DATABASE CONNECTED SUCCESSFULLY VIA IPv4!");
});

pool.on("error", (err) => {
    console.error("Erreur de connexion à la base de données cloud :", err.message);
});

module.exports = pool;