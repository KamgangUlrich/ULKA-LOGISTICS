require("dotenv").config();
const { rateLimit } = require("express-rate-limit");
const bcrypt = require("bcryptjs");
const session = require("express-session");
const express = require("express");
const Database = require("better-sqlite3");
const path = require("path");
const fs = require("fs");
const multer = require("multer");

const app = express();
const PORT = 3000;
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


// Verify staff identity and current permissions from the database.
function requireStaffRole(...allowedRoles) {
    return (req, res, next) => {
        if (!req.session || !req.session.staffId) {
            return res.status(401).json({
                success: false,
                error: "Staff login is required."
            });
        }

        try {
            const staff = db.prepare(`
                SELECT id, name, email, role, status
                FROM staff
                WHERE id = ?
            `).get(req.session.staffId);

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

// Customer login session configuration
app.use(
    session({
        name: "ulka.sid",
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


 // Block private project files from public access
app.use((req, res, next) => {
    const blockedFiles = new Set([
        "/ulka.db",
        "/ulka.db-wal",
        "/ulka.db-shm",
        "/shipments.html.backup",
        "/server.js",
        "/package.json",
        "/package-lock.json",
        "/ulka-session.txt",
        "/cookies.txt",
        "/second-cookies.txt"
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
        requestedPath.endsWith(".db-wal") ||
        requestedPath.endsWith(".db-shm") ||
        requestedPath.endsWith(".backup") ||
        requestedPath.endsWith(".txt") ||
        requestedPath.endsWith(".save") ||
        requestedPath.includes("backup") ||
        requestedPath.startsWith("/server-") ||
        requestedPath.startsWith("/server.js.") ||
        requestedPath.startsWith("/script.js.")
    ) {
        return res.status(404).send("Not found.");
    }

    next();
});

// Explicitly block the staff setup script before serving static files
app.use("/setup-staff.js", (req, res) => {
    return res.status(404).send("Not found.");
});

// Keep profile pictures accessible through authenticated API routes only.
app.use("/uploads/profiles", (req, res) => {
    return res.status(404).send("Not found.");
});

// Serve project files
app.use(express.static(__dirname));

// Redirect the homepage to the login page
app.get("/", (req, res) => {
    res.redirect("/admin-dashboard-model.html");
});


/* Connect to the project database */
const db = new Database(path.join(__dirname, "ulka.db"));

console.log("ULKA LOGISTICS DATABASE CONNECTED!");

// Create the customers table if it does not exist
db.exec(`
  CREATE TABLE IF NOT EXISTS customers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    fullName TEXT NOT NULL,
    email TEXT NOT NULL COLLATE NOCASE UNIQUE,
    passwordHash TEXT NOT NULL,
    createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )
`);

// Add an optional phone number to existing customer accounts.
const customerColumnsForPhone = db.prepare(
    "PRAGMA table_info(customers)"
).all();

if (!customerColumnsForPhone.some(column => column.name === "phone")) {
    db.exec("ALTER TABLE customers ADD COLUMN phone TEXT");
}

console.log("CUSTOMERS TABLE READY!");

// Create shipments table
db.exec(`
    CREATE TABLE IF NOT EXISTS shipments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        trackingNumber TEXT NOT NULL,
        customer TEXT NOT NULL,
        destination TEXT NOT NULL,
        weight REAL NOT NULL,
        status TEXT NOT NULL,
        customerId INTEGER REFERENCES customers(id)
    )
`);

// Add the optional customer phone field to existing databases.
const shipmentColumnsForPhone = db.prepare(
    "PRAGMA table_info(shipments)"
).all();

if (!shipmentColumnsForPhone.some(column => column.name === "phone")) {
    db.exec("ALTER TABLE shipments ADD COLUMN phone TEXT");
}

db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_shipments_trackingNumber
    ON shipments(trackingNumber)
`);

console.log("SHIPMENTS TABLE READY!");

// Test API
app.get("/api/test", (req, res) => {
    res.json({
        message: "API IS WORKING!"
    });
});


// Create shipment API — Admin and Dispatcher only.
app.post("/api/shipments", requireStaffRole("Admin", "Dispatcher"), (req, res) => {
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

        const result = db.prepare(`
            INSERT INTO shipments
            (trackingNumber, customer, phone, destination, weight, status,
             customerId, creationDate, estimatedDeliveryDate)
            VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?)
        `).run(
            trackingNumber, customer, phone, destination, weight, status,
            creationDate, estimatedDeliveryDate
        );

        return res.status(201).json({
            success: true,
            message: "Shipment created successfully.",
            shipment: {
                id: Number(result.lastInsertRowid),
                trackingNumber, customer, phone, destination, weight, status,
                creationDate, estimatedDeliveryDate
            }
        });
    } catch (error) {
        if (error.code === "SQLITE_CONSTRAINT_UNIQUE") {
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


// List shipments: staff see all; customers see only their own.
app.get("/api/shipments", (req, res) => {
    try {
        let shipments;

        if (req.session && req.session.staffId) {
            const staff = db.prepare(`
                SELECT id, status FROM staff WHERE id = ?
            `).get(req.session.staffId);

            if (!staff || staff.status !== "Active") {
                return res.status(403).json({
                    success: false, error: "Active staff access is required."
                });
            }

            shipments = db.prepare(`
                SELECT id, trackingNumber, customer, destination, weight,
                       status, creationDate, estimatedDeliveryDate, customerId, phone
                FROM shipments ORDER BY id DESC
            `).all();
        } else if (req.session && req.session.customerId) {
            shipments = db.prepare(`
                SELECT id, trackingNumber, customer, destination, weight,
                       status, creationDate, estimatedDeliveryDate, customerId, phone
                FROM shipments WHERE customerId = ? ORDER BY id DESC
            `).all(req.session.customerId);
        } else {
            return res.status(401).json({
                success: false, error: "Please log in to view shipments."
            });
        }

        return res.json({
            success: true,
            total: shipments.length,
            shipments
        });
    } catch (error) {
        console.error("Shipment retrieval error:", error.message);
        return res.status(500).json({
            success: false, error: "Unable to retrieve shipments."
        });
    }
});


// Public tracking exposes only basic tracking information.
app.get("/api/shipments/:trackingNumber", (req, res) => {
    try {
        const shipment = db.prepare(`
            SELECT trackingNumber, status, destination
            FROM shipments WHERE trackingNumber = ?
        `).get(req.params.trackingNumber);

        if (!shipment) {
            return res.status(404).json({
                success: false, message: "Shipment not found."
            });
        }

        return res.json({ success: true, shipment });
    } catch (error) {
        console.error("Public tracking error:", error.message);
        return res.status(500).json({
            success: false, message: "Unable to retrieve shipment."
        });
    }
});


// Update shipment details — Admin and Dispatcher only.
app.put("/api/shipments/:trackingNumber", requireStaffRole("Admin", "Dispatcher"), (req, res) => {
    try {
        const trackingNumber = req.params.trackingNumber;
        const customer = String(req.body.customer || "").trim();
        const phone = String(req.body.phone || "").trim();
        const newTrackingNumber = String(req.body.trackingNumber || "").trim();
        const destination = String(req.body.destination || "").trim();
        const weight = Number(req.body.weight);
        const status = String(req.body.status || "").trim();
        const creationDate = String(req.body.creationDate || "").trim();
        const estimatedDeliveryDate = String(req.body.estimatedDeliveryDate || "").trim();
        const statuses = ["Pending", "In Transit", "Delivered"];
        const validDate = value => /^\d{4}-\d{2}-\d{2}$/.test(value) &&
            !Number.isNaN(Date.parse(value)) &&
            new Date(value).toISOString().slice(0, 10) === value;

        if (!newTrackingNumber || !customer || !destination ||
            !Number.isFinite(weight) || weight <= 0 ||
            !statuses.includes(status) ||
            !validDate(creationDate) || !validDate(estimatedDeliveryDate)) {
            return res.status(400).json({
                success: false, error: "Provide valid shipment details and dates."
            });
        }

        if (estimatedDeliveryDate < creationDate) {
            return res.status(400).json({
                success: false, error: "Delivery date cannot be before creation date."
            });
        }

        const result = db.prepare(`
            UPDATE shipments
            SET trackingNumber = ?, customer = ?, phone = ?, destination = ?, weight = ?,
                status = ?, creationDate = ?, estimatedDeliveryDate = ?
            WHERE trackingNumber = ?
        `).run(
            newTrackingNumber, customer, phone, destination, weight, status,
            creationDate, estimatedDeliveryDate, trackingNumber
        );

        if (result.changes === 0) {
            return res.status(404).json({
                success: false, error: "Shipment not found."
            });
        }

        return res.json({
            success: true, message: "Shipment updated successfully."
        });
    } catch (error) {
        if (error.code === "SQLITE_CONSTRAINT_UNIQUE") {
            return res.status(409).json({
                success: false, error: "That tracking number already exists."
            });
        }
        console.error("Shipment update error:", error.message);
        return res.status(500).json({
            success: false, error: "Unable to update shipment."
        });
    }
});


// Update status — Admin, Dispatcher, or Warehouse Staff.
app.patch("/api/shipments/:trackingNumber/status",
    requireStaffRole("Admin", "Dispatcher", "Warehouse Staff"),
    (req, res) => {
        try {
            const status = String(req.body.status || "").trim();
            if (!["Pending", "In Transit", "Delivered"].includes(status)) {
                return res.status(400).json({
                    success: false, error: "Invalid shipment status."
                });
            }

            const result = db.prepare(`
                UPDATE shipments SET status = ? WHERE trackingNumber = ?
            `).run(status, req.params.trackingNumber);

            if (result.changes === 0) {
                return res.status(404).json({
                    success: false, error: "Shipment not found."
                });
            }

            return res.json({
                success: true,
                message: "Shipment status updated.",
                trackingNumber: req.params.trackingNumber,
                status
            });
        } catch (error) {
            console.error("Status update error:", error.message);
            return res.status(500).json({
                success: false, error: "Unable to update shipment status."
            });
        }
    }
);


// Search: staff search all shipments; customers search only their own.
app.get("/api/search", (req, res) => {
    try {
        const term = String(req.query.term || "").trim();
        if (!term) {
            return res.status(400).json({
                success: false, error: "Please provide a search term."
            });
        }

        const searchTerm = `%${term}%`;
        let shipments;

        if (req.session && req.session.staffId) {
            const staff = db.prepare(
                "SELECT status FROM staff WHERE id = ?"
            ).get(req.session.staffId);

            if (!staff || staff.status !== "Active") {
                return res.status(403).json({
                    success: false, error: "Active staff access is required."
                });
            }

            shipments = db.prepare(`
                SELECT * FROM shipments
                WHERE customer LIKE ? OR destination LIKE ?
                   OR trackingNumber LIKE ?
                ORDER BY id DESC
            `).all(searchTerm, searchTerm, searchTerm);
        } else if (req.session && req.session.customerId) {
            shipments = db.prepare(`
                SELECT trackingNumber, customer, destination, weight, status,
                       creationDate, estimatedDeliveryDate
                FROM shipments
                WHERE customerId = ?
                  AND (customer LIKE ? OR destination LIKE ?
                       OR trackingNumber LIKE ?)
                ORDER BY id DESC
            `).all(req.session.customerId, searchTerm, searchTerm, searchTerm);
        } else {
            return res.status(401).json({
                success: false, error: "Please log in to search shipments."
            });
        }

        return res.json({ success: true, total: shipments.length, shipments });
    } catch (error) {
        console.error("Shipment search error:", error.message);
        return res.status(500).json({
            success: false, error: "Unable to search shipments."
        });
    }
});


// Filter shipments by status with the same staff/customer access rules.
app.get("/api/shipments/status/:status", (req, res) => {
    try {
        const status = req.params.status;
        if (!["Pending", "In Transit", "Delivered"].includes(status)) {
            return res.status(400).json({
                success: false, error: "Invalid shipment status."
            });
        }

        let shipments;

        if (req.session && req.session.staffId) {
            const staff = db.prepare(
                "SELECT status FROM staff WHERE id = ?"
            ).get(req.session.staffId);

            if (!staff || staff.status !== "Active") {
                return res.status(403).json({
                    success: false, error: "Active staff access is required."
                });
            }

            shipments = db.prepare(`
                SELECT * FROM shipments WHERE status = ? ORDER BY id DESC
            `).all(status);
        } else if (req.session && req.session.customerId) {
            shipments = db.prepare(`
                SELECT trackingNumber, customer, destination, weight, status,
                       creationDate, estimatedDeliveryDate
                FROM shipments WHERE status = ? AND customerId = ?
                ORDER BY id DESC
            `).all(status, req.session.customerId);
        } else {
            return res.status(401).json({
                success: false, error: "Please log in to filter shipments."
            });
        }

        return res.json({ success: true, total: shipments.length, shipments });
    } catch (error) {
        console.error("Shipment filter error:", error.message);
        return res.status(500).json({
            success: false, error: "Unable to filter shipments."
        });
    }
});


// Delete — Admin only.
app.delete("/api/shipments/:trackingNumber",
    requireStaffRole("Admin"),
    (req, res) => {
        try {
            const result = db.prepare(`
                DELETE FROM shipments WHERE trackingNumber = ?
            `).run(req.params.trackingNumber);

            if (result.changes === 0) {
                return res.status(404).json({
                    success: false, error: "Shipment not found."
                });
            }

            return res.json({
                success: true,
                message: "Shipment deleted successfully.",
                trackingNumber: req.params.trackingNumber
            });
        } catch (error) {
            console.error("Shipment deletion error:", error.message);
            return res.status(500).json({
                success: false, error: "Unable to delete shipment."
            });
        }
    }
);

// Start the server

/* ===== CUSTOMER REGISTRATION RATE LIMITER ===== */
const registrationLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 5,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: {
        success: false,
        error: "Too many registration attempts. Please try again in 15 minutes."
    }
});

/* ===== CUSTOMER REGISTRATION API ===== */

app.post("/api/customers/register", registrationLimiter, async (req, res) => {
  try {
    const fullName = String(req.body.fullName || "").trim();
    const phone = String(req.body.phone || "").trim();

    if (!phone) {
      return res.status(400).json({
        error: "Phone number is required."
      });
    }

    if (phone.length > 30) {
      return res.status(400).json({
        error: "Phone number must be 30 characters or fewer."
      });
    }
    const email = String(req.body.email || "").trim().toLowerCase();
    const password = String(req.body.password || "");

    if (fullName.length < 2 || fullName.length > 100) {
      return res.status(400).json({
        error: "Name must contain 2–100 characters."
      });
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
      return res.status(400).json({
        error: "Enter a valid email address."
      });
    }

    if (password.length < 12 || password.length > 72) {
      return res.status(400).json({
        error: "Password must contain 12–72 characters."
      });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const insertCustomer = db.prepare(`
      INSERT INTO customers (fullName, email, passwordHash, phone)
      VALUES (?, ?, ?, ?)
    `);

    const result = insertCustomer.run(fullName, email, passwordHash, phone);

    return res.status(201).json({
      message: "Customer account created successfully.",
      customerId: result.lastInsertRowid
    });

  } catch (error) {
    if (error.code === "SQLITE_CONSTRAINT_UNIQUE") {
      return res.status(409).json({
        error: "This email is already registered."
      });
    }

    console.error("Registration error:", error.message);

    
    return res.status(500).json({
      error: "Unable to register customer."
    });
  }
});



// Separate login limits by account and login type.
const accountLoginKey = (req) => {
    const email = String(req.body?.email || "")
        .trim()
        .toLowerCase();

    return email || "missing-email";
};

const staffLoginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 5,
    keyGenerator: accountLoginKey,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: {
        success: false,
        error: "Too many staff login attempts for this account. Please try again in 15 minutes."
    }
});

const customerLoginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 5,
    keyGenerator: accountLoginKey,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: {
        success: false,
        error: "Too many customer login attempts for this account. Please try again in 15 minutes."
    }
});

/* ===== STAFF LOGIN API ===== */

app.post("/api/staff/login", staffLoginLimiter, async (req, res) => {
    try {
        const email = String(req.body.email || "").trim().toLowerCase();
        const password = String(req.body.password || "");

        if (!email || !password) {
            return res.status(400).json({
                success: false,
                error: "Please enter your email and password."
            });
        }

        const staff = db.prepare(`
            SELECT id, name, email, passwordHash, role, status
            FROM staff
            WHERE email = ?
        `).get(email);

        if (!staff) {
            return res.status(401).json({
                success: false,
                error: "Invalid email or password."
            });
        }

        const matches = await bcrypt.compare(password, staff.passwordHash);

        if (!matches) {
            return res.status(401).json({
                success: false,
                error: "Invalid email or password."
            });
        }

        if (staff.status !== "Active") {
            return res.status(403).json({
                success: false,
                error: "This account is inactive. Contact an administrator."
            });
        }

        req.session.regenerate((error) => {
            if (error) {
                console.error("Staff session error:", error.message);
                return res.status(500).json({
                    success: false,
                    error: "Unable to create a secure login session."
                });
            }

            req.session.staffId = staff.id;

            req.session.save((saveError) => {
                if (saveError) {
                    console.error("Staff session save error:", saveError.message);
                    return res.status(500).json({
                        success: false,
                        error: "Unable to save your login session."
                    });
                }

                return res.json({
                    success: true,
                    message: "Login successful.",
                    user: {
                        id: staff.id,
                        name: staff.name,
                        email: staff.email,
                        role: staff.role,
                        status: staff.status,
                        authType: "staff"
                    }
                });
            });
        });
    } catch (error) {
        console.error("Staff login error:", error.message);
        return res.status(500).json({
            success: false,
            error: "Unable to log in."
        });
    }
});


/* ===== ADMIN: VIEW REGISTERED CUSTOMERS ===== */

app.get(
    "/api/admin/customers",
    requireStaffRole("Admin"),
    (req, res) => {
        try {
            const customers = db.prepare(`
                SELECT id, fullName, email, createdAt
                FROM customers
                ORDER BY id DESC
            `).all();

            return res.json({
                success: true,
                customers
            });
        } catch (error) {
            console.error("Admin customer list error:", error.message);
            return res.status(500).json({
                success: false,
                error: "Unable to load registered customers."
            });
        }
    }
);



/* ===== ADMIN: LIST STAFF ACCOUNTS (SAFE FIELDS ONLY) ===== */

app.get("/api/admin/staff", requireStaffRole("Admin"), (req, res) => {
    try {
        const staff = db.prepare(`
            SELECT id, name, email, role, status, createdAt
            FROM staff
            ORDER BY id DESC
        `).all();

        return res.json({ success: true, staff });
    } catch (error) {
        console.error("Admin staff list error:", error.message);
        return res.status(500).json({
            success: false,
            error: "Unable to load staff accounts."
        });
    }
});



/* ===== ADMIN: CREATE STAFF OR CUSTOMER ACCOUNT ===== */

app.post("/api/admin/accounts", requireStaffRole("Admin"), async (req, res) => {
    try {
        const accountType = String(req.body.accountType || "").trim();
        const name = String(req.body.name || "").trim();
        const email = String(req.body.email || "").trim().toLowerCase();
        const password = String(req.body.password || "");
        const staffRole = String(req.body.staffRole || "").trim();

        const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

        if (!["Admin", "Company Staff", "Customer"].includes(accountType)) {
            return res.status(400).json({
                success: false,
                error: "Choose Administrator, Company Staff, or Customer."
            });
        }

        if (name.length < 2 || name.length > 100) {
            return res.status(400).json({
                success: false,
                error: "Name must contain 2 to 100 characters."
            });
        }

        if (email.length > 254 || !validEmail) {
            return res.status(400).json({
                success: false,
                error: "Enter a valid email address."
            });
        }

        if (password.length < 12 || password.length > 72) {
            return res.status(400).json({
                success: false,
                error: "Password must contain 12 to 72 characters."
            });
        }

        let role = "Admin";

        if (accountType === "Company Staff") {
            if (!["Dispatcher", "Warehouse Staff"].includes(staffRole)) {
                return res.status(400).json({
                    success: false,
                    error: "Choose Dispatcher or Warehouse Staff."
                });
            }
            role = staffRole;
        }

        const passwordHash = await bcrypt.hash(password, 12);

        const createAccountTransaction = db.transaction(() => {
            const existingStaff = db.prepare(
                "SELECT id FROM staff WHERE email = ?"
            ).get(email);

            const existingCustomer = db.prepare(
                "SELECT id FROM customers WHERE email = ?"
            ).get(email);

            if (existingStaff || existingCustomer) {
                return {
                    success: false,
                    status: 409,
                    error: "An account with this email address already exists."
                };
            }

            if (accountType === "Customer") {
                const result = db.prepare(`
                    INSERT INTO customers (fullName, email, passwordHash)
                    VALUES (?, ?, ?)
                `).run(name, email, passwordHash);

                return {
                    success: true,
                    account: {
                        id: Number(result.lastInsertRowid),
                        name,
                        email,
                        accountType: "Customer"
                    }
                };
            }

            const result = db.prepare(`
                INSERT INTO staff (name, email, passwordHash, role, status)
                VALUES (?, ?, ?, ?, 'Active')
            `).run(name, email, passwordHash, role);

            return {
                success: true,
                account: {
                    id: Number(result.lastInsertRowid),
                    name,
                    email,
                    accountType: accountType === "Admin"
                        ? "Administrator"
                        : "Company Staff",
                    role,
                    status: "Active"
                }
            };
        });

        const outcome = createAccountTransaction.immediate();

        if (!outcome.success) {
            return res.status(outcome.status).json({
                success: false,
                error: outcome.error
            });
        }

        return res.status(201).json({
            success: true,
            message: "Account created successfully.",
            account: outcome.account
        });
    } catch (error) {
        if (error.code === "SQLITE_CONSTRAINT_UNIQUE") {
            return res.status(409).json({
                success: false,
                error: "An account with this email address already exists."
            });
        }

        console.error("Admin account creation error:", error.message);
        return res.status(500).json({
            success: false,
            error: "Unable to create the account."
        });
    }
});


/* ===== ADMIN: EDIT CUSTOMER ACCOUNT ===== */

app.put("/api/admin/customers/:id", requireStaffRole("Admin"), (req, res) => {
    const id = Number(req.params.id);
    const fullName = String(req.body.fullName || "").trim();
    const email = String(req.body.email || "").trim().toLowerCase();

    if (!Number.isSafeInteger(id) || id <= 0) {
        return res.status(400).json({
            success: false,
            error: "Invalid customer ID."
        });
    }

    if (fullName.length < 2 || fullName.length > 100) {
        return res.status(400).json({
            success: false,
            error: "Name must contain 2–100 characters."
        });
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
        return res.status(400).json({
            success: false,
            error: "Enter a valid email address."
        });
    }

    try {
        const existing = db.prepare(
            "SELECT id FROM customers WHERE id = ?"
        ).get(id);

        if (!existing) {
            return res.status(404).json({
                success: false,
                error: "Customer account not found."
            });
        }

        db.prepare(`
            UPDATE customers
            SET fullName = ?, email = ?
            WHERE id = ?
        `).run(fullName, email, id);

        const customer = db.prepare(`
            SELECT id, fullName, email, createdAt
            FROM customers
            WHERE id = ?
        `).get(id);

        return res.json({
            success: true,
            message: "Customer account updated.",
            customer
        });
    } catch (error) {
        if (error.code === "SQLITE_CONSTRAINT_UNIQUE") {
            return res.status(409).json({
                success: false,
                error: "That email address is already registered."
            });
        }

        console.error("Admin customer update error:", error.message);
        return res.status(500).json({
            success: false,
            error: "Unable to update customer account."
        });
    }
});


/* ===== ADMIN: DELETE CUSTOMER ACCOUNT ===== */

app.delete("/api/admin/customers/:id", requireStaffRole("Admin"), (req, res) => {
    const id = Number(req.params.id);

    if (!Number.isSafeInteger(id) || id <= 0) {
        return res.status(400).json({
            success: false,
            error: "Invalid customer ID."
        });
    }

    try {
        const deleteCustomerTransaction = db.transaction((customerId) => {
            const customer = db.prepare(`
                SELECT id FROM customers WHERE id = ?
            `).get(customerId);

            if (!customer) {
                return {
                    success: false,
                    status: 404,
                    error: "Customer account not found."
                };
            }

            const linked = db.prepare(`
                SELECT COUNT(*) AS count
                FROM shipments
                WHERE customerId = ?
            `).get(customerId);

            if (linked.count > 0) {
                return {
                    success: false,
                    status: 409,
                    error: "This customer has linked shipments. Reassign or resolve those records before deleting the account."
                };
            }

            const result = db.prepare(`
                DELETE FROM customers WHERE id = ?
            `).run(customerId);

            if (result.changes !== 1) {
                return {
                    success: false,
                    status: 409,
                    error: "Customer account was not deleted."
                };
            }

            return { success: true };
        });

        const outcome = deleteCustomerTransaction.immediate(id);

        if (!outcome.success) {
            return res.status(outcome.status).json({
                success: false,
                error: outcome.error
            });
        }

        return res.json({
            success: true,
            message: "Customer account deleted."
        });
    } catch (error) {
        console.error("Admin customer deletion error:", error.message);
        return res.status(500).json({
            success: false,
            error: "Unable to delete customer account."
        });
    }
});


/* ===== ADMIN: EDIT STAFF ACCOUNT ===== */

app.put("/api/admin/staff/:id", requireStaffRole("Admin"), (req, res) => {
    const id = Number(req.params.id);
    const name = String(req.body.name || "").trim();
    const email = String(req.body.email || "").trim().toLowerCase();
    const role = String(req.body.role || "").trim();
    const status = String(req.body.status || "").trim();

    if (!Number.isSafeInteger(id) || id <= 0) {
        return res.status(400).json({
            success: false,
            error: "Invalid staff ID."
        });
    }

    if (name.length < 2 || name.length > 100) {
        return res.status(400).json({
            success: false,
            error: "Name must contain 2 to 100 characters."
        });
    }

    if (email.length > 254 ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return res.status(400).json({
            success: false,
            error: "Enter a valid email address."
        });
    }

    if (!["Admin", "Dispatcher", "Warehouse Staff"].includes(role)) {
        return res.status(400).json({
            success: false,
            error: "Choose a valid staff role."
        });
    }

    if (!["Active", "Inactive"].includes(status)) {
        return res.status(400).json({
            success: false,
            error: "Choose Active or Inactive status."
        });
    }

    try {
        const editStaffTransaction = db.transaction(() => {
            const target = db.prepare(`
                SELECT id, role, status
                FROM staff
                WHERE id = ?
            `).get(id);

            if (!target) {
                return {
                    success: false,
                    status: 404,
                    error: "Staff account not found."
                };
            }

            if (id === req.staff.id &&
                (role !== target.role || status !== target.status)) {
                return {
                    success: false,
                    status: 403,
                    error: "You cannot change your own role or account status."
                };
            }

            const duplicateStaff = db.prepare(`
                SELECT id FROM staff
                WHERE email = ? AND id <> ?
            `).get(email, id);

            const duplicateCustomer = db.prepare(`
                SELECT id FROM customers
                WHERE email = ?
            `).get(email);

            if (duplicateStaff || duplicateCustomer) {
                return {
                    success: false,
                    status: 409,
                    error: "That email address is already used by another account."
                };
            }

            if (target.role === "Admin" &&
                target.status === "Active" &&
                (role !== "Admin" || status !== "Active")) {
                const activeAdmins = db.prepare(`
                    SELECT COUNT(*) AS count
                    FROM staff
                    WHERE role = 'Admin' AND status = 'Active'
                `).get();

                if (activeAdmins.count <= 1) {
                    return {
                        success: false,
                        status: 409,
                        error: "The last active administrator cannot be demoted or deactivated."
                    };
                }
            }

            db.prepare(`
                UPDATE staff
                SET name = ?, email = ?, role = ?, status = ?
                WHERE id = ?
            `).run(name, email, role, status, id);

            const updatedStaff = db.prepare(`
                SELECT id, name, email, role, status, createdAt
                FROM staff
                WHERE id = ?
            `).get(id);

            return {
                success: true,
                staff: updatedStaff
            };
        });

        const outcome = editStaffTransaction.immediate();

        if (!outcome.success) {
            return res.status(outcome.status).json({
                success: false,
                error: outcome.error
            });
        }

        return res.json({
            success: true,
            message: "Staff account updated successfully.",
            staff: outcome.staff
        });
    } catch (error) {
        if (error.code === "SQLITE_CONSTRAINT_UNIQUE") {
            return res.status(409).json({
                success: false,
                error: "That email address is already used by another account."
            });
        }

        console.error("Admin staff update error:", error.message);
        return res.status(500).json({
            success: false,
            error: "Unable to update staff account."
        });
    }
});


/* ===== ADMIN: DELETE STAFF ACCOUNT ===== */

app.delete("/api/admin/staff/:id", requireStaffRole("Admin"), (req, res) => {
    const id = Number(req.params.id);

    if (!Number.isSafeInteger(id) || id <= 0) {
        return res.status(400).json({
            success: false,
            error: "Invalid staff ID."
        });
    }

    if (id === req.staff.id) {
        return res.status(403).json({
            success: false,
            error: "You cannot delete your own account."
        });
    }

    try {
        const deleteStaffTransaction = db.transaction((staffId) => {
            const target = db.prepare(`
                SELECT id, role, status
                FROM staff
                WHERE id = ?
            `).get(staffId);

            if (!target) {
                return {
                    success: false,
                    status: 404,
                    error: "Staff account not found."
                };
            }

            if (target.role === "Admin" && target.status === "Active") {
                const activeAdmins = db.prepare(`
                    SELECT COUNT(*) AS count
                    FROM staff
                    WHERE role = 'Admin' AND status = 'Active'
                `).get();

                if (activeAdmins.count <= 1) {
                    return {
                        success: false,
                        status: 409,
                        error: "The last active administrator cannot be deleted."
                    };
                }
            }

            const result = db.prepare(`
                DELETE FROM staff WHERE id = ?
            `).run(staffId);

            if (result.changes !== 1) {
                return {
                    success: false,
                    status: 409,
                    error: "Staff account was not deleted."
                };
            }

            return { success: true };
        });

        const outcome = deleteStaffTransaction.immediate(id);

        if (!outcome.success) {
            return res.status(outcome.status).json({
                success: false,
                error: outcome.error
            });
        }

        return res.json({
            success: true,
            message: "Staff account deleted."
        });
    } catch (error) {
        console.error("Admin staff deletion error:", error.message);
        return res.status(500).json({
            success: false,
            error: "Unable to delete staff account."
        });
    }
});

/* ===== VERIFY STAFF SESSION ===== */

app.get("/api/staff/me", (req, res) => {
    if (!req.session || !req.session.staffId) {
        return res.status(401).json({
            success: false,
            error: "Please log in to access this feature."
        });
    }

    const staff = db.prepare(`
        SELECT id, name, email, role, status
        FROM staff
        WHERE id = ?
    `).get(req.session.staffId);

    if (!staff || staff.status !== "Active") {
        return req.session.destroy(() => {
            res.clearCookie("ulka.sid", { path: "/" });
            return res.status(401).json({
                success: false,
                error: "Staff session is no longer active. Please log in again."
            });
        });
    }

    return res.json({
        success: true,
        user: {
            id: staff.id,
            name: staff.name,
            email: staff.email,
            role: staff.role,
            status: staff.status,
            authType: "staff"
        }
    });
});


/* ===== STAFF LOGOUT ===== */

app.post("/api/staff/logout", (req, res) => {
    req.session.destroy((error) => {
        if (error) {
            console.error("Staff logout error:", error.message);
            return res.status(500).json({
                success: false,
                error: "Unable to log out."
            });
        }

        res.clearCookie("ulka.sid", { path: "/" });
        return res.json({
            success: true,
            message: "Logout successful."
        });
    });
});

/* ===== CUSTOMER LOGIN API ===== */




app.post("/api/customers/login", customerLoginLimiter, async (req, res) => {
    try {
        const email = String(req.body.email || "")
            .trim()
            .toLowerCase();

        const password = String(req.body.password || "");

        if (!email || !password) {
            return res.status(400).json({
                success: false,
                error: "Please enter your email and password."
            });
        }

        const customer = db.prepare(`
            SELECT id, fullName, email, passwordHash
            FROM customers
            WHERE email = ?
        `).get(email);

        if (!customer) {
            return res.status(401).json({
                success: false,
                error: "Invalid email or password."
            });
        }

        const passwordMatches = await bcrypt.compare(
            password,
            customer.passwordHash
        );

        if (!passwordMatches) {
            return res.status(401).json({
                success: false,
                error: "Invalid email or password."
            });
        }

        
req.session.regenerate((error) => {
    if (error) {
        console.error("Session regeneration error:", error.message);

        return res.status(500).json({
            success: false,
            error: "Unable to create a secure login session."
        });
    }

    req.session.customerId = customer.id;
    req.session.customerName = customer.fullName;
    req.session.customerEmail = customer.email;

    req.session.save((saveError) => {
        if (saveError) {
            console.error("Session save error:", saveError.message);

            return res.status(500).json({
                success: false,
                error: "Unable to save your login session."
            });
        }

        return res.json({
            success: true,
            message: "Login successful.",
            customer: {
                id: customer.id,
                fullName: customer.fullName,
                email: customer.email
            }
        });
    });
});

    } catch (error) {
        console.error("Customer login error:", error.message);

        return res.status(500).json({
            success: false,
            error: "Unable to log in."
        });
    }
});

/* ===== CUSTOMER LOGOUT ===== */

app.post("/api/customers/logout", (req, res) => {
    req.session.destroy((error) => {
        if (error) {
            console.error("Customer logout error:", error.message);

            return res.status(500).json({
                success: false,
                message: "Unable to log out."
            });
        }

        res.clearCookie("ulka.sid", {
            path: "/"
        });

        return res.json({
            success: true,
            message: "Logout successful."
        });
    });
});

/* ===== CHECK CUSTOMER LOGIN STATUS ===== */

app.get("/api/customers/me", (req, res) => {
    if (!req.session || !req.session.customerId) {
        return res.status(401).json({
            success: false,
            error: "Please log in to access this feature."
        });
    }

    return res.json({
        success: true,
        customer: {
            id: req.session.customerId,
            fullName: req.session.customerName,
            email: req.session.customerEmail
        }
    });
});


/* ===== PROFILE PICTURE ROUTES - ULKA ===== */

const PROFILE_UPLOAD_DIR = path.join(__dirname, "uploads", "profiles");
fs.mkdirSync(PROFILE_UPLOAD_DIR, { recursive: true });

const profileImageUpload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 5 * 1024 * 1024,
        files: 1
    },
    fileFilter: (req, file, callback) => {
        const allowedTypes = ["image/jpeg", "image/png", "image/webp"];

        if (!allowedTypes.includes(file.mimetype)) {
            return callback(new Error("Upload a JPEG, PNG, or WebP image."));
        }

        callback(null, true);
    }
});

// Return an account-specific file key after verifying the logged-in account.
function getProfileAccount(req) {
    if (!req.session) return null;

    if (req.session.staffId) {
        const staff = db.prepare(`
            SELECT id, status FROM staff WHERE id = ?
        `).get(req.session.staffId);

        if (!staff || staff.status !== "Active") return null;

        return { prefix: "staff", id: staff.id };
    }

    if (req.session.customerId) {
        const customer = db.prepare(`
            SELECT id FROM customers WHERE id = ?
        `).get(req.session.customerId);

        if (!customer) return null;

        return { prefix: "customer", id: customer.id };
    }

    return null;
}

function validProfileImage(buffer, mimeType) {
    if (!buffer || buffer.length < 12) return false;

    if (mimeType === "image/jpeg") {
        return buffer[0] === 0xFF &&
            buffer[1] === 0xD8 &&
            buffer[2] === 0xFF;
    }

    if (mimeType === "image/png") {
        return buffer.subarray(0, 8).equals(
            Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A])
        );
    }

    if (mimeType === "image/webp") {
        return buffer.toString("ascii", 0, 4) === "RIFF" &&
            buffer.toString("ascii", 8, 12) === "WEBP";
    }

    return false;
}

const profileImageExtensions = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp"
};


// ULKA: Update only the name of the account in the current session.
app.put("/api/profile", (req, res) => {
    const account = getProfileAccount(req);

    if (!account) {
        return res.status(401).json({
            success: false,
            error: "Please log in with an active account."
        });
    }

    const name = typeof req.body?.name === "string"
        ? req.body.name.trim()
        : "";

    if (name.length < 2 || name.length > 100) {
        return res.status(400).json({
            success: false,
            error: "Name must contain 2–100 characters."
        });
    }

    try {
        if (account.prefix === "staff") {
            db.prepare("UPDATE staff SET name = ? WHERE id = ?")
                .run(name, account.id);

            const staff = db.prepare(`
                SELECT id, name, email, role, status
                FROM staff WHERE id = ?
            `).get(account.id);

            return res.json({
                success: true,
                message: "Profile name updated successfully.",
                user: { ...staff, authType: "staff" }
            });
        }

        db.prepare("UPDATE customers SET fullName = ? WHERE id = ?")
            .run(name, account.id);

        const customer = db.prepare(`
            SELECT id, fullName, email
            FROM customers WHERE id = ?
        `).get(account.id);

        req.session.customerName = customer.fullName;

        return res.json({
            success: true,
            message: "Profile name updated successfully.",
            user: {
                id: customer.id,
                name: customer.fullName,
                email: customer.email,
                role: "Customer",
                authType: "backend"
            },
            customer
        });
    } catch (error) {
        console.error("Profile name update error:", error.message);
        return res.status(500).json({
            success: false,
            error: "Unable to update your profile name."
        });
    }
});

// Return only the current user's own picture.
app.get("/api/profile-picture", (req, res) => {
    const account = getProfileAccount(req);

    if (!account) {
        return res.status(401).json({
            success: false,
            error: "Please log in with an active account."
        });
    }

    const extensions = ["jpg", "png", "webp"];
    const existingFile = extensions
        .map(ext => path.join(
            PROFILE_UPLOAD_DIR,
            `${account.prefix}-${account.id}.${ext}`
        ))
        .find(filePath => fs.existsSync(filePath));

    if (!existingFile) {
        return res.status(404).json({
            success: false,
            error: "No profile picture has been uploaded yet."
        });
    }

    res.setHeader("Cache-Control", "no-store");
    return res.sendFile(existingFile);
});

// Upload or replace the picture for the logged-in account only.
app.post(
    "/api/profile-picture",
    (req, res, next) => {
        if (!getProfileAccount(req)) {
            return res.status(401).json({
                success: false,
                error: "Please log in with an active account."
            });
        }

        profileImageUpload.single("profilePicture")(req, res, error => {
            if (error) {
                const statusCode = error.code === "LIMIT_FILE_SIZE" ? 413 : 400;
                return res.status(statusCode).json({
                    success: false,
                    error: error.code === "LIMIT_FILE_SIZE"
                        ? "Image must be 5 MB or smaller."
                        : error.message || "Unable to process the uploaded image."
                });
            }

            next();
        });
    },
    async (req, res) => {
        try {
            const account = getProfileAccount(req);

            if (!account) {
                return res.status(401).json({
                    success: false,
                    error: "Your session is no longer active. Please log in again."
                });
            }

            if (!req.file) {
                return res.status(400).json({
                    success: false,
                    error: "Choose an image before uploading."
                });
            }

            if (!validProfileImage(req.file.buffer, req.file.mimetype)) {
                return res.status(400).json({
                    success: false,
                    error: "The file content is not a valid supported image."
                });
            }

            const extension = profileImageExtensions[req.file.mimetype];
            const fileName = `${account.prefix}-${account.id}.${extension}`;

            // Remove only previous pictures belonging to this same account.
            for (const oldExtension of ["jpg", "png", "webp"]) {
                const oldPath = path.join(
                    PROFILE_UPLOAD_DIR,
                    `${account.prefix}-${account.id}.${oldExtension}`
                );

                if (fs.existsSync(oldPath)) {
                    await fs.promises.unlink(oldPath);
                }
            }

            await fs.promises.writeFile(
                path.join(PROFILE_UPLOAD_DIR, fileName),
                req.file.buffer,
                { flag: "wx" }
            );

            return res.json({
                success: true,
                message: "Profile picture saved successfully.",
                pictureUrl: "/api/profile-picture"
            });
        } catch (error) {
            console.error("Profile picture upload error:", error.message);
            return res.status(500).json({
                success: false,
                error: "Unable to save the profile picture."
            });
        }
    }
);

/* ===== END PROFILE PICTURE ROUTES - ULKA ===== */

/* ===== START ULKA LOGISTICS SERVER ===== */

app.listen(PORT, () => {
    console.log(`ULKA LOGISTICS SERVER RUNNING ON PORT ${PORT}`);
});
