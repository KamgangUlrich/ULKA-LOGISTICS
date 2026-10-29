const express = require("express");
const Database = require("better-sqlite3");

const app = express();
const PORT = 3000;
const path = require("path");

// Allow the server to receive JSON data
app.use(express.json());

app.use(express.static(__dirname));

// Connect to SQLite database
const db = new Database("ulka.db");

console.log("ULKA LOGISTICS DATABASE CONNECTED!");

// Create shipments table
db.exec(`
    CREATE TABLE IF NOT EXISTS shipments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        trackingNumber TEXT NOT NULL,
        customer TEXT NOT NULL,
        destination TEXT NOT NULL,
        weight REAL NOT NULL,
        status TEXT NOT NULL
    )
`);

console.log("SHIPMENTS TABLE READY!");

// Test API
app.get("/api/test", (req, res) => {
    res.json({
        message: "API IS WORKING!"
    });
});

// Create shipment API
app.post("/api/shipments", (req, res) => {
    try {
        const {
            trackingNumber,
            customer,
            destination,
            weight,
            status
        } = req.body;

        // Validate required information
        if (
            !trackingNumber ||
            !customer ||
            !destination ||
            weight === undefined ||
            weight === null ||
            weight === "" ||
            !status
        ) {
            return res.status(400).json({
                message: "Please provide all shipment information."
            });
        }

        if (!Number.isFinite(Number(weight)) || Number(weight) <= 0) {
            return res.status(400).json({
                message: "Weight must be a number greater than zero."
            });
        }

        // Prevent duplicate tracking numbers
        const existingShipment = db.prepare(`
            SELECT id FROM shipments
            WHERE trackingNumber = ?
        `).get(trackingNumber);

        if (existingShipment) {
            return res.status(409).json({
                message: "This tracking number already exists."
            });
        }

        // Save shipment
        const insertShipment = db.prepare(`
            INSERT INTO shipments
            (trackingNumber, customer, destination, weight, status)
            VALUES (?, ?, ?, ?, ?)
        `);

        const result = insertShipment.run(
            trackingNumber,
            customer,
            destination,
            Number(weight),
            status
        );

        res.status(201).json({
            message: "Shipment created successfully!",
            shipmentId: result.lastInsertRowid,
            trackingNumber: trackingNumber
        });

        } catch (error) {
        console.error("Shipment creation error:", error.message);

        // Handle duplicate tracking numbers
        if (
            error.code === "SQLITE_CONSTRAINT_UNIQUE" ||
            error.code === "SQLITE_CONSTRAINT_PRIMARYKEY"
        ) {
            return res.status(409).json({
                message: "This tracking number already exists."
            });
        }

        // Handle other unexpected errors
        return res.status(500).json({
            message: "Unable to create shipment."
        });
    }
});

 // Get shipments with pagination and sorting
app.get("/api/shipments", (req, res) => {
    try {
        const page = Math.max(1, parseInt(req.query.page, 10) || 1);
        const limit = Math.min(
            100,
            Math.max(1, parseInt(req.query.limit, 10) || 10)
        );

        const sort = req.query.sort === "oldest" ? "ASC" : "DESC";
        const offset = (page - 1) * limit;

        const total = db.prepare(`
            SELECT COUNT(*) AS count FROM shipments
        `).get().count;

        const shipments = db.prepare(`
            SELECT * FROM shipments
            ORDER BY id ${sort}
            LIMIT ? OFFSET ?
        `).all(limit, offset);

        res.json({
            total: total,
            page: page,
            limit: limit,
            totalPages: Math.ceil(total / limit),
            shipments: shipments
        });

    } catch (error) {
        console.error("Error retrieving shipments:", error.message);

        res.status(500).json({
            message: "Unable to retrieve shipments."
        });
    }
});


 // Get one shipment by tracking number
app.get("/api/shipments/:trackingNumber", (req, res) => {
    try {
        const trackingNumber = req.params.trackingNumber;

        const shipment = db.prepare(`
            SELECT * FROM shipments
            WHERE trackingNumber = ?
        `).get(trackingNumber);

        if (!shipment) {
            return res.status(404).json({
                message: "Shipment not found."
            });
        }

        res.json({
            message: "Shipment found successfully!",
            shipment: shipment
        });

    } catch (error) {
        console.error("Error retrieving shipment:", error.message);

        return res.status(500).json({
            message: "Unable to retrieve shipment."
        });
    }
});


 // Update a shipment's status
app.patch("/api/shipments/:trackingNumber/status", (req, res) => {
    try {
        const trackingNumber = req.params.trackingNumber;
        const { status } = req.body;

        // Approved shipment statuses
        const allowedStatuses = [
            "Pending",
            "In Transit",
            "Delivered"
        ];

        // Validate the status
        if (
            typeof status !== "string" ||
            !allowedStatuses.includes(status.trim())
        ) {
            return res.status(400).json({
                message: "Invalid status. Use Pending, In Transit, or Delivered."
            });
        }


        // Find the shipment
        const shipment = db.prepare(`
            SELECT id FROM shipments
            WHERE trackingNumber = ?
        `).get(trackingNumber);

        if (!shipment) {
            return res.status(404).json({
                message: "Shipment not found."
            });
        }

        // Update the shipment status
        db.prepare(`
            UPDATE shipments
            SET status = ?
            WHERE trackingNumber = ?
        `).run(status.trim(), trackingNumber);

        return res.json({
            message: "Shipment status updated successfully!",
            trackingNumber: trackingNumber,
            status: status.trim()
        });

    } catch (error) {
        console.error("Status update error:", error.message);

        return res.status(500).json({
            message: "Unable to update shipment status."
        });
    }
});


 // Search shipments by customer or destination
app.get("/api/search", (req, res) => {
    const term = req.query.term;

    if (!term || !term.trim()) {
        return res.status(400).json({
            message: "Please provide a search term."
        });
    }

    const searchTerm = `%${term.trim()}%`;

    const shipments = db.prepare(`
        SELECT * FROM shipments
        WHERE customer LIKE ? OR destination LIKE ?
        ORDER BY id DESC
    `).all(searchTerm, searchTerm);

    res.json({ total: shipments.length, shipments });
});


// Filter shipments by status
app.get("/api/shipments/status/:status", (req, res) => {
    const shipments = db.prepare(`
        SELECT * FROM shipments
        WHERE status = ?
        ORDER BY id DESC
    `).all(req.params.status);

    res.json({ total: shipments.length, shipments });
});


// Delete a shipment by tracking number
app.delete("/api/shipments/:trackingNumber", (req, res) => {
    const result = db.prepare(`
        DELETE FROM shipments
        WHERE trackingNumber = ?
    `).run(req.params.trackingNumber);

    if (result.changes === 0) {
        return res.status(404).json({
            message: "Shipment not found."
        });
    }

    res.json({
        message: "Shipment deleted successfully.",
        trackingNumber: req.params.trackingNumber
    });
});

// START THE SERVER — THIS WAS MISSING!

app.listen(PORT, () => {
    console.log(
        `ULKA LOGISTICS SERVER RUNNING ON PORT ${PORT}`
    );
});