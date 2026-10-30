const { Pool } = require('pg');
const dns = require('dns');

// Force Node.js to prefer IPv4 addresses during DNS resolution
dns.setDefaultResultOrder('ipv4first');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
    family: 4
});

pool.query('SELECT NOW()', (err, res) => {
    if (err) {
        console.error('Erreur de connexion à la base de données cloud :', err.message);
    } else {
        console.log('Connecté avec succès à PostgreSQL en IPv4 !');
    }
});

module.exports = pool;