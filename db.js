const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    family: 4
});

// Force explicit IPv4 translation if hostname is used
pool.on('connect', () => {
    // Connection established successfully
});

pool.query('SELECT NOW()', (err, res) => {
    if (err) {
        console.error('Erreur de connexion à la base de données cloud :', err.message);
    } else {
        console.log('ULKA LOGISTICS DATABASE CONNECTED SUCCESSFULLY VIA IPv4!');
    }
});

module.exports = pool;