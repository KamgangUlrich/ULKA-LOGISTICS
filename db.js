const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
    family: 4 // FORCE IPv4 pour éviter l'erreur ENETUNREACH sur Render
});

pool.query('SELECT NOW()', (err, res) => {
    if (err) {
        console.error('Erreur de connexion à la base de données cloud :', err);
    } else {
        console.log('Connecté avec succès à PostgreSQL !');
    }
});

module.exports = pool;