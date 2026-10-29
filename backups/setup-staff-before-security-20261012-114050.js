require("dotenv").config();

const Database = require("better-sqlite3");
const bcrypt = require("bcryptjs");
const path = require("path");

const db = new Database(
    path.join(__dirname, "ulka.db")
);

try {
    db.exec(`
        CREATE TABLE IF NOT EXISTS staff (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            email TEXT NOT NULL COLLATE NOCASE UNIQUE,
            passwordHash TEXT NOT NULL,
            role TEXT NOT NULL CHECK (
                role IN (
                    'Admin',
                    'Dispatcher',
                    'Warehouse Staff'
                )
            ),
            status TEXT NOT NULL DEFAULT 'Active'
                CHECK (status IN ('Active', 'Inactive')),
            createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
    `);

    const count = db.prepare(
        "SELECT COUNT(*) AS total FROM staff"
    ).get().total;

    if (count === 0) {
        const initialStaff = [
            {
                name: "ULKA Administrator",
                email: "admin@ulka.com",
                password: "admin123",
                role: "Admin"
            },
            {
                name: "ULKA Dispatcher",
                email: "dispatcher@ulka.com",
                password: "dispatch123",
                role: "Dispatcher"
            },
            {
                name: "Warehouse Staff",
                email: "warehouse@ulka.com",
                password: "warehouse123",
                role: "Warehouse Staff"
            }
        ];

        const insertStaff = db.prepare(`
            INSERT INTO staff (
                name,
                email,
                passwordHash,
                role,
                status
            )
            VALUES (?, ?, ?, ?, 'Active')
        `);

        const seedStaff = db.transaction(() => {
            for (const user of initialStaff) {
                const passwordHash = bcrypt.hashSync(
                    user.password,
                    12
                );

                insertStaff.run(
                    user.name,
                    user.email,
                    passwordHash,
                    user.role
                );
            }
        });

        seedStaff();

        console.log("Initial staff accounts created.");
    } else {
        console.log(
            "Staff table already contains accounts. No accounts added."
        );
    }

    console.log("Staff table is ready.");

} catch (error) {
    console.error("Staff setup failed:", error.message);
    process.exitCode = 1;
} finally {
    db.close();
}
