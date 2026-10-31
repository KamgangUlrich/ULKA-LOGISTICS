require("dotenv").config();
const { rateLimit } = require("express-rate-limit");
const bcrypt = require("bcryptjs");
const session = require("express-session");
const pgSession = require("connect-pg-simple")(session);
const express = require("express");
const pool = require("./db"); // Connexion PostgreSQL (depuis db.js)
const path = require("path");
const fs = require("fs");
const multer = require("multer");

const app = express();
const PORT = Number(process.env.PORT) || 3000;

if (process.env.NODE_ENV === "production") {
    app.set("trust proxy", 1);
}

if (!process.env.SESSION_SECRET) {
    throw new Error("SESSION_SECRET is required. Check your .env file.");
}

function requireCustomer(req, res, next) {
    if (!req.session || !req.session.customerId) {
        return res.status(401).json({
            success: false,
            error: "Please log in to access this feature."
        });
    }
    next();
}

// Vérification des rôles du personnel (Staff)
function requireStaffRole(...allowedRoles) {
    return async (req, res, next) => {
        if (!req.session || !req.session.staffId) {
            return res.status(401).json({
                success: false,
                error: "Staff login is required."
            });
        }

        try {
            const result = await pool.query(`
                SELECT id, name, email, role, status
                FROM staff
                WHERE id = $1
            `, [req.session.staffId]);

            const staff = result.rows[0];

            if (!staff || staff.status !== "Active") {
                return res.status(403).json({
                    success: false,
                    error: "Active staff access is required."
                });
            }

            if (
                allowedRoles.length > 0 &&
                !allowedRoles.includes(staff.role)
            ) {
                return res.status(403).json({
                    success: false,
                    error: "You do not have permission to perform this action."
                });
            }

            req.staff = staff;
            next();
        } catch (error) {
            console.error("Staff authorization error:", error.message);
            return res.status(500).json({
                success: false,
                error: "Unable to verify staff permissions."
            });
        }
    };
}

app.use(express.json());

// Configuration des sessions persistantes avec connect-pg-simple
app.use(
    session({
        name: "ulka.sid",
        store: new pgSession({
            pool: pool,
            tableName: "session",
            createTable: false
        }),
        secret: process.env.SESSION_SECRET,
        resave: false,
        saveUninitialized: false,
        cookie: {
            httpOnly: true,
            sameSite: "lax",
            secure: process.env.NODE_ENV === "production",
            maxAge: 2 * 60 * 60 * 1000
        }
    })
);

// Bloquer l'accès public aux fichiers sensibles
app.use((req, res, next) => {
    const blockedFiles = new Set([
        "/ulka.db", "/ulka.db-wal", "/ulka.db-shm", "/shipments.html.backup",
        "/server.js", "/package.json", "/package-lock.json", "/ulka-session.txt",
        "/cookies.txt", "/second-cookies.txt"
    ]);

    const requestedPath = req.path.toLowerCase();

    if (
        blockedFiles.has(requestedPath) ||
        requestedPath === "/.env" ||
        requestedPath.startsWith("/.env.") ||
        requestedPath === "/setup-staff.js" ||
        requestedPath === "/backups" ||
        requestedPath.startsWith("/backups/") ||
        requestedPath.endsWith(".db") ||
        requestedPath.endsWith(".backup") ||
        requestedPath.endsWith(".txt") ||
        requestedPath.includes("backup")
    ) {
        return res.status(404).send("Not found.");
    }

    next();
});

app.use(express.static(__dirname));

app.get("/", (req, res) => {
    res.redirect("/admin-dashboard-model.html");
});

/* --- INITIALISATION DES TABLES POSTGRESQL --- */
async function initializeDatabase() {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS customers (
                id SERIAL PRIMARY KEY,
                fullName TEXT NOT NULL,
                email TEXT NOT NULL UNIQUE,
                passwordHash TEXT NOT NULL,
                createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                phone TEXT
            )
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS staff (
                id SERIAL PRIMARY KEY,
                name TEXT NOT NULL,
                email TEXT NOT NULL UNIQUE,
                passwordHash TEXT NOT NULL,
                role TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'Active'
            )
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS shipments (
                id SERIAL PRIMARY KEY,
                trackingNumber TEXT NOT NULL UNIQUE,
                customer TEXT NOT NULL,
                destination TEXT NOT NULL,
                weight REAL NOT NULL,
                status TEXT NOT NULL,
                customerId INTEGER REFERENCES customers(id),
                phone TEXT,
                creationDate TEXT,
                estimatedDeliveryDate TEXT
            )
        `);

        // Table des sessions pour connect-pg-simple
        await pool.query(`
            CREATE TABLE IF NOT EXISTS "session" (
                "sid" varchar NOT NULL COLLATE "default",
                "sess" json NOT NULL,
                "expire" timestamp(6) NOT NULL
            )
        `);

        await pool.query(`
            DO $$
            BEGIN
                IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'session_pkey') THEN
                    ALTER TABLE "session" ADD CONSTRAINT "session_pkey" PRIMARY KEY ("sid");
                END IF;
            END
            $$;
        `);

        await pool.query(`
            CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON "session" ("expire");
        `);

        console.log("ULKA LOGISTICS POSTGRESQL TABLES READY!");
    } catch (err) {
        console.error("Erreur lors de l'initialisation des tables :", err);
    }
}

initializeDatabase();

// --- TEST API ---
app.get("/api/test", (req, res) => {
    res.json({ message: "API IS WORKING WITH POSTGRESQL!" });
});

// --- ROUTES DE CONNEXION (LOGIN) ---

// 1. Connexion Staff / Admin
app.post("/api/staff/login", async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            return res.status(400).json({ success: false, error: "Email et mot de passe requis." });
        }

        const result = await pool.query(
            "SELECT * FROM staff WHERE LOWER(email) = LOWER($1)",
            [email.trim()]
        );

        const staff = result.rows[0];
        if (!staff || staff.status !== "Active") {
            return res.status(401).json({ success: false, error: "Identifiants invalides ou compte inactif." });
        }

        const match = await bcrypt.compare(password, staff.passwordHash);
        if (!match) {
            return res.status(401).json({ success: false, error: "Identifiants invalides." });
        }

        req.session.staffId = staff.id;
        return res.json({
            success: true,
            message: "Connexion réussie.",
            staff: { id: staff.id, name: staff.name, email: staff.email, role: staff.role }
        });
    } catch (error) {
        console.error("Erreur login staff:", error.message);
        return res.status(500).json({ success: false, error: "Erreur serveur lors de la connexion." });
    }
});

// 2. Connexion Client
app.post("/api/login", async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            return res.status(400).json({ success: false, error: "Email et mot de passe requis." });
        }

        const result = await pool.query(
            "SELECT * FROM customers WHERE LOWER(email) = LOWER($1)",
            [email.trim()]
        );

        const customer = result.rows[0];
        if (!customer) {
            return res.status(401).json({ success: false, error: "Identifiants invalides." });
        }

        const match = await bcrypt.compare(password, customer.passwordHash);
        if (!match) {
            return res.status(401).json({ success: false, error: "Identifiants invalides." });
        }

        req.session.customerId = customer.id;
        return res.json({
            success: true,
            message: "Connexion réussie.",
            customer: { id: customer.id, fullName: customer.fullName, email: customer.email }
        });
    } catch (error) {
        console.error("Erreur login client:", error.message);
        return res.status(500).json({ success: false, error: "Erreur serveur lors de la connexion." });
    }
});


// --- GESTION DES EXPÉDITIONS (SHIPMENTS) ---

// Créer une expédition
app.post("/api/shipments", requireStaffRole("Admin", "Dispatcher"), async (req, res) => {
    try {
        const trackingNumber = String(req.body.trackingNumber || "").trim();
        const customer = String(req.body.customer || "").trim();
        const phone = String(req.body.phone || "").trim();
        const destination = String(req.body.destination || "").trim();
        const weight = Number(req.body.weight);
        const status = String(req.body.status || "").trim();
        const creationDate = String(req.body.creationDate || "").trim();
        const estimatedDeliveryDate = String(req.body.estimatedDeliveryDate || "").trim();
        const statuses = ["Pending", "In Transit", "Delivered"];
        
        const validDate = value => /^\d{4}-\d{2}-\d{2}$/.test(value) &&
            !Number.isNaN(Date.parse(value)) &&
            new Date(value).toISOString().slice(0, 10) === value;

        if (!trackingNumber || !customer || !destination ||
            !Number.isFinite(weight) || weight <= 0 ||
            !statuses.includes(status) ||
            !validDate(creationDate) || !validDate(estimatedDeliveryDate)) {
            return res.status(400).json({
                success: false,
                error: "Provide valid shipment details and dates."
            });
        }

        if (estimatedDeliveryDate < creationDate) {
            return res.status(400).json({
                success: false,
                error: "Delivery date cannot be before creation date."
            });
        }

        const query = `
            INSERT INTO shipments
            (trackingNumber, customer, phone, destination, weight, status, customerId, creationDate, estimatedDeliveryDate)
            VALUES ($1, $2, $3, $4, $5, $6, NULL, $7, $8)
            RETURNING id
        `;

        const values = [trackingNumber, customer, phone, destination, weight, status, creationDate, estimatedDeliveryDate];
        const result = await pool.query(query, values);

        return res.status(201).json({
            success: true,
            message: "Shipment created successfully.",
            shipment: {
                id: result.rows[0].id,
                trackingNumber, customer, phone, destination, weight, status,
                creationDate, estimatedDeliveryDate
            }
        });
    } catch (error) {
        if (error.code === "23505") { // Violation d'unicité PostgreSQL
            return res.status(409).json({
                success: false,
                error: "That tracking number already exists."
            });
        }
        console.error("Shipment creation error:", error.message);
        return res.status(500).json({
            success: false,
            error: "Unable to create shipment."
        });
    }
});

// Lister les expéditions
app.get("/api/shipments", async (req, res) => {
    try {
        let result;

        if (req.session && req.session.staffId) {
            const staffResult = await pool.query("SELECT id, status FROM staff WHERE id = $1", [req.session.staffId]);
            const staff = staffResult.rows[0];

            if (!staff || staff.status !== "Active") {
                return res.status(403).json({ success: false, error: "Active staff access is required." });
            }

            result = await pool.query("SELECT * FROM shipments ORDER BY id DESC");
        } else if (req.session && req.session.customerId) {
            result = await pool.query("SELECT * FROM shipments WHERE customerId = $1 ORDER BY id DESC", [req.session.customerId]);
        } else {
            return res.status(401).json({ success: false, error: "Please log in to view shipments." });
        }

        return res.json({
            success: true,
            total: result.rows.length,
            shipments: result.rows
        });
    } catch (error) {
        console.error("Shipment retrieval error:", error.message);
        return res.status(500).json({ success: false, error: "Unable to retrieve shipments." });
    }
});

// Démarrage du serveur
app.listen(PORT, () => {
    console.log(`Serveur ULKA-LOGISTICS en cours d'exécution sur le port ${PORT}`);
});