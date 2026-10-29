/* =========================================================
   ULKA LOGISTICS
   COURSE 22
   USER MANAGEMENT & REGISTRATION
========================================================= */


/* =========================================================
   USER STORAGE
========================================================= */

const userStorageKey =
    "ulkaUsers";


const defaultUsers = [];


let users;


const savedUsers =
    localStorage.getItem(
        userStorageKey
    );


if (savedUsers) {

    try {

        users =
            JSON.parse(
                savedUsers
            );

    } catch (error) {

        users =
            defaultUsers;

        saveUsers();

    }

} else {

    users =
        defaultUsers;

    saveUsers();

}


/* =========================================================
   SAVE USERS
========================================================= */

function saveUsers() {

    localStorage.setItem(
        userStorageKey,
        JSON.stringify(
            users
        )
    );

}


/* =========================================================
   LOGIN ELEMENTS
========================================================= */

const loginSection =
    document.getElementById(
        "loginSection"
    );


const mainApplication =
    document.getElementById(
        "mainApplication"
    );


const loginForm =
    document.getElementById(
        "loginForm"
    );


const loginMessage =
    document.getElementById(
        "message"
    );


const passwordInput =
    document.getElementById(
        "password"
    );



/* =========================================================
   LOGIN - BACKEND CUSTOMERS + EXISTING DEMO STAFF
========================================================= */

loginForm.addEventListener(
    "submit",
    async function (event) {

        event.preventDefault();

        const email = document
            .getElementById("email")
            .value
            .trim()
            .toLowerCase();

        const password = passwordInput.value;

        if (email === "" || password === "") {
            loginMessage.textContent =
                "Please enter email and password.";
            loginMessage.style.color = "red";
            return;
        }

        const loginButton =
            document.getElementById("loginButton");

        loginButton.disabled = true;
        loginButton.textContent = "PLEASE WAIT...";

        try {

            /*
             * FIRST: Authenticate staff through the server.
             */

            const staffResponse = await fetch(
                "/api/staff/login",
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json"
                    },
                    credentials: "same-origin",
                    body: JSON.stringify({
                        email: email,
                        password: password
                    })
                }
            );

            const staffResult = await staffResponse.json();

            if (staffResponse.ok && staffResult.success) {
                const staffUser = staffResult.user;

                localStorage.setItem(
                    "ulkaLoggedUser",
                    JSON.stringify(staffUser)
                );

                loginMessage.textContent = "Login successful.";
                loginMessage.style.color = "green";

                window.location.replace("/admin-dashboard-model.html");
                return;
            }

            /*
             * Inactive staff, rate limits, or server errors should
             * not fall through to customer authentication.
             */

            if (
                staffResponse.status === 403 ||
                staffResponse.status === 429 ||
                staffResponse.status >= 500
            ) {
                loginMessage.textContent =
                    staffResult.error ||
                    staffResult.message ||
                    "Staff login failed. Please try again.";
                loginMessage.style.color = "red";
                return;
            }

            /*
             * SECOND: If this is not a demo staff account,
             * try the backend customer login.
             */

            const response = await fetch(
                "/api/customers/login",
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json"
                    },
                    credentials: "same-origin",
                    body: JSON.stringify({
                        email: email,
                        password: password
                    })
                }
            );

            const result = await response.json();

            if (!response.ok || !result.success) {
                loginMessage.textContent =
                    result.error ||
                    result.message ||
                    "Invalid email or password.";
                loginMessage.style.color = "red";
                return;
            }

            /*
             * Convert the backend customer to the user format
             * expected by the existing dashboard.
             */

            const customerUser = {
                id: "customer-" + result.customer.id,
                name: result.customer.fullName,
                email: result.customer.email,
                role: "Customer",
                status: "Active",
                authType: "backend"
            };

            localStorage.setItem(
                "ulkaLoggedUser",
                JSON.stringify(customerUser)
            );

            loginMessage.textContent = "Login successful.";
            loginMessage.style.color = "green";

            window.location.replace("/admin-dashboard-model.html");

        } catch (error) {

            console.error("Login error:", error);

            loginMessage.textContent =
                "Cannot connect to the server. Check that ULKA LOGISTICS is running.";
            loginMessage.style.color = "red";

        } finally {

            loginButton.disabled = false;
            loginButton.textContent = "LOGIN";

        }

    }
);



/* =========================================================
   SHOW PASSWORD
========================================================= */

document
    .getElementById(
        "showPassword"
    )
    .addEventListener(
        "click",
        function () {

            if (
                passwordInput.type ===
                "password"
            ) {

                passwordInput.type =
                    "text";

                this.textContent =
                    "HIDE";

            } else {

                passwordInput.type =
                    "password";

                this.textContent =
                    "SHOW";

            }

        }
    );


/* =========================================================
   CLEAR LOGIN
========================================================= */

document
    .getElementById(
        "clearButton"
    )
    .addEventListener(
        "click",
        function () {

            document.getElementById(
                "email"
            ).value = "";


            passwordInput.value =
                "";


            loginMessage.textContent =
                "";

        }
    );


/* =========================================================
   OPEN APPLICATION
========================================================= */

async function loadShipmentsFromServer() {
    const response = await fetch("/api/shipments", {
        method: "GET",
        credentials: "same-origin"
    });

    const result = await response.json();

    if (!response.ok || !result.success || !Array.isArray(result.shipments)) {
        throw new Error(result.error || "Unable to load shipments.");
    }

    shipments = result.shipments.map(item => ({
        id: item.id,
        trackingNumber: item.trackingNumber,
        customer: item.customer,
        destination: item.destination,
        weight: Number(item.weight),
        status: item.status,
        creationDate: item.creationDate || "",
        estimatedDeliveryDate: item.estimatedDeliveryDate || "",
        customerId: item.customerId ?? null
    }));
}


/* =========================================================
   OPEN APPLICATION
========================================================= */

async function openApplication(user) {
    loginSection.style.display = "none";
    mainApplication.style.display = "flex";

    document.getElementById("loggedUserName").textContent = user.name;
    document.getElementById("loggedUserRole").textContent = user.role;
    document.getElementById("roleBanner").textContent = getRoleMessage(user.role);

    applyPermissions(user.role);
    setupSidebarNavigation(user.role);

    try {
        await loadShipmentsFromServer();
        displayUsers();
        if (user.role === "Admin") {
            await loadRegisteredCustomers();
        }
        displayShipments();
        updateDashboard();
    } catch (error) {
        console.error("Unable to load database shipments:", error);
        shipments = [];
        displayShipments();
        updateDashboard();
        alert("Unable to load shipments from the server. Please refresh and try again.");
    }
}


/* =========================================================
   ROLE MESSAGE
========================================================= */


/* =========================================================
   SIDEBAR NAVIGATION
========================================================= */

let sidebarActiveRole = "";
let sidebarActiveView = "dashboard";
let sidebarTrackingResultVisible = false;

const sidebarAllowedViews = {
    "Admin": [
        "dashboard", "shipmentDashboard", "shipmentManagement",
        "customers", "staffCreate", "staffExisting",
        "tracking", "reports", "settings", "profile"
    ],
    "Dispatcher": [
        "dashboard", "shipmentDashboard", "shipmentManagement",
        "tracking", "reports", "profile"
    ],
    "Warehouse Staff": [
        "dashboard", "shipmentDashboard", "shipmentManagement",
        "tracking", "profile"
    ],
    "Customer": [
        "dashboard", "myShipments", "tracking", "profile"
    ]
};

function setupSidebarNavigation(role) {
    sidebarActiveRole = role;

    const allowedViews = sidebarAllowedViews[role] || [];

    document.querySelectorAll(".sidebar-link[data-view], .sidebar-sub-link[data-view]")
        .forEach(function (button) {
            const view = button.dataset.view;
            const allowed = allowedViews.includes(view);

            button.style.display = allowed ? "flex" : "none";
            button.disabled = !allowed;
            button.setAttribute("aria-hidden", String(!allowed));

            button.onclick = function () {
                showSidebarView(view);
            };
        });

    document.querySelectorAll("[data-menu-toggle]").forEach(function (button) {
        const menu = button.dataset.menuToggle;
        const allowed = menu === "shipments"
            ? allowedViews.includes("shipmentDashboard")
            : menu === "staff" && sidebarActiveRole === "Admin";

        button.style.display = allowed ? "flex" : "none";
        button.disabled = !allowed;
        button.setAttribute("aria-hidden", String(!allowed));

        button.onclick = function () {
            const submenu = document.getElementById(
                menu === "shipments" ? "shipmentsSubmenu" : "staffSubmenu"
            );
            if (!submenu) return;

            const relatedViews = menu === "shipments"
                ? ["shipmentDashboard", "shipmentManagement"]
                : ["staffCreate", "staffExisting"];

            // A parent click must not display a page by itself.
            if (relatedViews.includes(sidebarActiveView)) {
                [
                    document.querySelector(".dashboard"),
                    document.getElementById("shipmentFormSection"),
                    document.getElementById("userManagement")
                ].forEach(function (panel) {
                    if (panel) panel.style.display = "none";
                });

                document.querySelectorAll(
                    ".sidebar-link[data-view], .sidebar-sub-link[data-view]"
                ).forEach(function (item) {
                    item.classList.remove("active");
                    item.removeAttribute("aria-current");
                });

                document.querySelectorAll(".sidebar-menu-toggle").forEach(
                    function (item) {
                        item.classList.remove("active");
                    }
                );

                sidebarActiveView = "";
            }

            submenu.hidden = !submenu.hidden;
            button.setAttribute("aria-expanded", String(!submenu.hidden));
        };
    });

    const newUserButton = document.getElementById("newUserButton");
    if (newUserButton) {
        newUserButton.onclick = function () {
            if (sidebarActiveRole === "Admin") {
                showSidebarView("staffCreate");
            }
        };
    }

    const user = getCurrentUser();
    document.getElementById("sidebarProfileName").textContent =
        user && user.name ? user.name : "User";
    document.getElementById("sidebarProfileRole").textContent = role;

    showSidebarView("dashboard");
}

function showSidebarView(view) {
    const allowedViews = sidebarAllowedViews[sidebarActiveRole] || [];
    if (!allowedViews.includes(view)) return;

    const trackingResult = document.getElementById("trackingResult");

    if (sidebarActiveView === "tracking" && trackingResult) {
        sidebarTrackingResultVisible =
            trackingResult.style.display === "block";
    }

    const dashboard = document.querySelector(".dashboard");
    const shipmentForm = document.getElementById("shipmentFormSection");
    const userManagement = document.getElementById("userManagement");
    const customerSection = document.getElementById("registeredCustomersSection");
    const trackingSection = document.getElementById("trackingSection");
    const reportsPanel = document.getElementById("reportsPanel");
    const settingsPanel = document.getElementById("settingsPanel");
    const profilePanel = document.getElementById("profilePanel");

    [
        dashboard, shipmentForm, userManagement, customerSection,
        trackingSection, trackingResult, reportsPanel, settingsPanel,
        profilePanel
    ].forEach(function (panel) {
        if (panel) panel.style.display = "none";
    });

    if (view === "dashboard" || view === "shipmentDashboard") {
        if (dashboard) dashboard.style.display = "block";
    }

    if (
        view === "dashboard" ||
        view === "shipmentDashboard" ||
        (view === "myShipments" && sidebarActiveRole === "Customer")
    ) {
        if (dashboard) dashboard.style.display = "block";

        const heading = dashboard ? dashboard.querySelector("h2") : null;

        if (heading) {
            heading.textContent =
                view === "myShipments" && sidebarActiveRole === "Customer"
                    ? "My Shipments"
                    : "Shipment Dashboard";
        }
    }

    if (view === "shipmentManagement") {
        if (dashboard) dashboard.style.display = "block";
        if (shipmentForm) shipmentForm.style.display = "block";
    }

    if (view === "customers" && sidebarActiveRole === "Admin" && customerSection) {
        customerSection.style.display = "block";
    }

    if (
        (view === "staffCreate" || view === "staffExisting") &&
        sidebarActiveRole === "Admin" && userManagement
    ) {
        userManagement.style.display = "block";

        const formContainer = document.getElementById("userFormContainer");
        const userControls = userManagement.querySelector(".user-controls");
        const userTable = userManagement.querySelector(".table-container");

        if (view === "staffCreate") {
            if (formContainer) formContainer.style.display = "block";
            if (userControls) userControls.style.display = "none";
            if (userTable) userTable.style.display = "none";
        } else {
            if (formContainer) formContainer.style.display = "none";
            if (userControls) userControls.style.display = "flex";
            if (userTable) userTable.style.display = "block";
        }
    }

    if (view === "tracking" && trackingSection) {
        trackingSection.style.display = "block";
        if (sidebarTrackingResultVisible && trackingResult) {
            trackingResult.style.display = "block";
        }
    }

    if (view === "reports" && reportsPanel) {
        reportsPanel.style.display = "block";
    }

    if (view === "settings" && settingsPanel) {
        settingsPanel.style.display = "block";
    }

    if (view === "profile" && profilePanel) {
        profilePanel.style.display = "block";
        const user = getCurrentUser();

        document.getElementById("sidebarProfileName").textContent =
            user && user.name ? user.name : "User";
        document.getElementById("sidebarProfileRole").textContent =
            sidebarActiveRole;
    }

    document.querySelectorAll(".sidebar-link[data-view], .sidebar-sub-link[data-view]")
        .forEach(function (button) {
            const active = button.dataset.view === view;
            button.classList.toggle("active", active);

            if (active) {
                button.setAttribute("aria-current", "page");
            } else {
                button.removeAttribute("aria-current");
            }
        });

    const shipmentView = view === "shipmentDashboard" ||
        view === "shipmentManagement";
    const staffView = view === "staffCreate" || view === "staffExisting";

    document.querySelectorAll("[data-menu-toggle]").forEach(function (button) {
        const menuActive = button.dataset.menuToggle === "shipments"
            ? shipmentView
            : staffView;

        button.classList.toggle("active", menuActive);
    });

    if (view.startsWith("shipment")) {
        const submenu = document.getElementById("shipmentsSubmenu");
        if (submenu) submenu.hidden = false;
        const toggle = document.querySelector('[data-menu-toggle="shipments"]');
        if (toggle) toggle.setAttribute("aria-expanded", "true");
    }

    if (view.startsWith("staff")) {
        const submenu = document.getElementById("staffSubmenu");
        if (submenu) submenu.hidden = false;
        const toggle = document.querySelector('[data-menu-toggle="staff"]');
        if (toggle) toggle.setAttribute("aria-expanded", "true");
    }

    sidebarActiveView = view;
}

/* LOAD REGISTERED CUSTOMERS — ADMIN ONLY */
async function loadRegisteredCustomers() {
    const tableBody = document.getElementById("registeredCustomerTableBody");
    const message = document.getElementById("registeredCustomersMessage");
    if (!tableBody || !message) return;

    message.textContent = "Loading registered customers...";

    try {
        const response = await fetch("/api/admin/customers", {
            method: "GET",
            credentials: "same-origin",
            headers: { "Accept": "application/json" }
        });
        const result = await response.json();

        if (!response.ok || !result.success) {
            throw new Error(result.error || "Unable to load customers.");
        }

        tableBody.replaceChildren();

        if (!Array.isArray(result.customers) || result.customers.length === 0) {
            const row = document.createElement("tr");
            const cell = document.createElement("td");
            cell.colSpan = 5;
            cell.textContent = "No registered customers found.";
            row.appendChild(cell);
            tableBody.appendChild(row);
            message.textContent = "0 registered customers.";
            return;
        }

        for (const customer of result.customers) {
            const row = document.createElement("tr");

            for (const value of [
                customer.id,
                customer.fullName,
                customer.email,
                customer.createdAt
            ]) {
                const cell = document.createElement("td");
                cell.textContent = value == null ? "" : String(value);
                row.appendChild(cell);
            }

            const actions = document.createElement("td");
            const deleteButton = document.createElement("button");

            deleteButton.type = "button";
            deleteButton.textContent = "DELETE";
            deleteButton.className = "user-delete-button";
            deleteButton.addEventListener("click", () => {
                deleteRegisteredCustomer(customer.id, customer.fullName);
            });

            actions.appendChild(deleteButton);
            row.appendChild(actions);
            tableBody.appendChild(row);
        }

        message.textContent = `${result.customers.length} registered customer(s).`;
    } catch (error) {
        console.error("Unable to load registered customers:", error);
        tableBody.replaceChildren();

        const row = document.createElement("tr");
        const cell = document.createElement("td");
        cell.colSpan = 5;
        cell.textContent = "Customer list could not be loaded.";
        row.appendChild(cell);
        tableBody.appendChild(row);

        message.textContent = error.message || "Unable to load customers.";
    }
}


/* ADMIN: DELETE A REGISTERED CUSTOMER */
async function deleteRegisteredCustomer(id, customerName) {
    const currentUser = getCurrentUser();

    if (!currentUser || currentUser.role !== "Admin") {
        alert("Administrator access is required.");
        return;
    }

    const confirmed = window.confirm(
        `Delete customer "${customerName}" (ID ${id})?\n\n`
        + "This cannot be undone. Customers with linked shipments "
        + "will not be deleted."
    );

    if (!confirmed) return;

    const message = document.getElementById("registeredCustomersMessage");
    message.textContent = "Deleting customer account...";

    try {
        const response = await fetch(
            `/api/admin/customers/${encodeURIComponent(id)}`,
            {
                method: "DELETE",
                credentials: "same-origin",
                headers: { "Accept": "application/json" }
            }
        );

        const result = await response.json();

        if (!response.ok || !result.success) {
            throw new Error(result.error || "Customer deletion failed.");
        }

        message.textContent = result.message || "Customer account deleted.";
        await loadRegisteredCustomers();
    } catch (error) {
        message.textContent = error.message || "Unable to delete customer.";
    }
}


function getRoleMessage(role) {

    if (
        role === "Admin"
    ) {

        return "👑 Administrator — Full system and user management access.";

    }


    if (
        role === "Dispatcher"
    ) {

        return "🚚 Dispatcher — Shipment operation access.";

    }


    if (
        role === "Warehouse Staff"
    ) {

        return "📦 Warehouse Staff — Warehouse shipment access.";

    }


    if (
        role === "Customer"
    ) {

        return "👤 Customer — Shipment tracking access.";

    }


    return "Welcome to ULKA LOGISTICS.";

}


/* =========================================================
   ROLE PERMISSIONS
========================================================= */

function applyPermissions(role) {

    const userManagement =
        document.getElementById(
            "userManagement"
        );


    const shipmentForm =
        document.getElementById(
            "shipmentFormSection"
        );


    const dashboard =
        document.querySelector(
            ".dashboard"
        );


    const tracking =
        document.getElementById(
            "trackingSection"
        );


    userManagement.style.display =
        "none";


    shipmentForm.style.display =
        "none";


    dashboard.style.display =
        "block";


    tracking.style.display =
        "block";


    /* ADMIN */

    if (
        role === "Admin"
    ) {

        userManagement.style.display =
            "block";

        shipmentForm.style.display =
            "block";

        return;

    }


    /* DISPATCHER */

    if (
        role === "Dispatcher"
    ) {

        shipmentForm.style.display =
            "block";

        return;

    }


    /* WAREHOUSE */

    if (
        role === "Warehouse Staff"
    ) {

        shipmentForm.style.display =
            "block";

        return;

    }


    /* CUSTOMER */

    if (
        role === "Customer"
    ) {

        dashboard.style.display =
            "block";

        shipmentForm.style.display =
            "none";

        return;

    }

}


/* =========================================================
   CURRENT USER
========================================================= */

function getCurrentUser() {

    const saved =
        localStorage.getItem(
            "ulkaLoggedUser"
        );


    if (!saved) {

        return null;

    }


    try {

        return JSON.parse(
            saved
        );

    } catch {

        return null;

    }

}



/* =========================================================
   LOGOUT
========================================================= */

const logoutButton = document.getElementById("logoutButton");

if (logoutButton) {
    logoutButton.addEventListener("click", async function () {
        const currentUser = getCurrentUser();

        const isStaff = currentUser && (
            currentUser.authType === "staff" ||
            ["Admin", "Dispatcher", "Warehouse Staff"].includes(
                currentUser.role
            )
        );

        const endpoint = isStaff
            ? "/api/staff/logout"
            : "/api/customers/logout";

        try {
            const response = await fetch(endpoint, {
                method: "POST",
                credentials: "same-origin"
            });

            const result = await response.json();

            if (!response.ok || !result.success) {
                alert(
                    result.error ||
                    result.message ||
                    "Logout failed. Please try again."
                );
                return;
            }

            localStorage.removeItem("ulkaLoggedUser");
            window.location.href = "/login-redesign.html";

        } catch (error) {
            console.error("Logout error:", error);
            alert("Unable to contact the server. Please try again.");
        }
    });
}



/* =========================================================
   CHECK LOGIN
========================================================= */

async function checkExistingLogin() {
    const saved = localStorage.getItem("ulkaLoggedUser");

    if (!saved) {
        return;
    }

    try {
        const sessionUser = JSON.parse(saved);

        const isStaff = sessionUser.authType === "staff" ||
            ["Admin", "Dispatcher", "Warehouse Staff"].includes(
                sessionUser.role
            );

        const endpoint = isStaff
            ? "/api/staff/me"
            : "/api/customers/me";

        const response = await fetch(endpoint, {
            method: "GET",
            credentials: "same-origin"
        });

        const result = await response.json();

        if (!response.ok || !result.success) {
            localStorage.removeItem("ulkaLoggedUser");
            return;
        }

        let actualUser;

        if (isStaff) {
            actualUser = result.user;
        } else {
            const customer = result.customer;

            actualUser = {
                id: "customer-" + customer.id,
                name: customer.fullName,
                email: customer.email,
                role: "Customer",
                status: "Active",
                authType: "backend"
            };
        }

        localStorage.setItem(
            "ulkaLoggedUser",
            JSON.stringify(actualUser)
        );

        openApplication(actualUser);

    } catch (error) {
        console.error("Session verification failed:", error);
        localStorage.removeItem("ulkaLoggedUser");
    }
}



/* =========================================================
   USER MANAGEMENT
========================================================= */

let editUserId = null;


/* =========================================================
   NEW USER BUTTON
========================================================= */

document
    .getElementById(
        "newUserButton"
    )
    .addEventListener(
        "click",
        function () {

            editUserId = null;


            document.getElementById(
                "userForm"
            ).reset();


            document.getElementById(
                "userFormTitle"
            ).textContent =
                "Create New User";


            document.getElementById(
                "saveUserButton"
            ).textContent =
                "CREATE USER";


            document.getElementById(
                "userFormContainer"
            ).style.display =
                "block";


            document.getElementById(
                "userName"
            ).focus();

        }
    );


/* =========================================================
   CANCEL USER FORM
========================================================= */

document
    .getElementById(
        "cancelUserButton"
    )
    .addEventListener(
        "click",
        function () {

            closeUserForm();

        }
    );


function closeUserForm() {

    editUserId = null;


    document.getElementById(
        "userFormContainer"
    ).style.display =
        "none";


    document.getElementById(
        "userForm"
    ).reset();


    document.getElementById(
        "userMessage"
    ).textContent =
        "";

}


/* =========================================================
   CREATE / UPDATE USER
========================================================= */

document
    .getElementById(
        "userForm"
    )
    .addEventListener(
        "submit",
        function (event) {

            event.preventDefault();


            const currentUser =
                getCurrentUser();


            /* SECURITY */

            if (
                !currentUser ||
                currentUser.role !==
                "Admin"
            ) {

                return;

            }


            const name =
                document.getElementById(
                    "userName"
                ).value.trim();


            const email =
                document.getElementById(
                    "userEmail"
                ).value
                .trim()
                .toLowerCase();


            const password =
                document.getElementById(
                    "userPassword"
                ).value.trim();


            const role =
                document.getElementById(
                    "userRole"
                ).value;


            const status =
                document.getElementById(
                    "userStatus"
                ).value;


            const message =
                document.getElementById(
                    "userMessage"
                );


            if (
                name === "" ||
                email === "" ||
                password === ""
            ) {

                message.textContent =
                    "Please complete all fields.";

                message.style.color =
                    "red";

                return;

            }


            /* EMAIL DUPLICATE */

            const duplicate =
                users.some(
                    function (
                        user
                    ) {

                        return (

                            user.email
                                .toLowerCase()
                                ===
                            email

                            &&

                            user.id !==
                            editUserId

                        );

                    }
                );


            if (duplicate) {

                message.textContent =
                    "This email is already registered.";

                message.style.color =
                    "red";

                return;

            }


            /* UPDATE */

            if (
                editUserId !== null
            ) {

                const user =
                    users.find(
                        function (
                            item
                        ) {

                            return (
                                item.id ===
                                editUserId
                            );

                        }
                    );


                if (!user) {

                    return;

                }


                user.name =
                    name;

                user.email =
                    email;

                user.password =
                    password;

                user.role =
                    role;

                user.status =
                    status;


                message.textContent =
                    "User updated successfully.";

            }


            /* CREATE */

            else {

                const newUser = {

                    id:
                        generateUserId(),

                    name:
                        name,

                    email:
                        email,

                    password:
                        password,

                    role:
                        role,

                    status:
                        status

                };


                users.push(
                    newUser
                );


                message.textContent =
                    "User created successfully.";

            }


            message.style.color =
                "green";


            saveUsers();

            displayUsers();


            setTimeout(
                closeUserForm,
                800
            );

        }
    );


/* =========================================================
   GENERATE USER ID
========================================================= */

function generateUserId() {

    if (
        users.length === 0
    ) {

        return 1;

    }


    const ids =
        users.map(
            user =>
                Number(user.id)
        );


    return (
        Math.max(...ids)
        + 1
    );

}


/* =========================================================
   DISPLAY USERS
========================================================= */

let databaseStaffUsers = [];
let staffAccountsLoaded = false;
let staffAccountsLoading = false;

async function displayUsers(forceReload = false) {
    const tableBody = document.getElementById("userTableBody");
    const currentUser = getCurrentUser();

    if (!tableBody) return;

    if (!currentUser || currentUser.role !== "Admin") {
        tableBody.innerHTML = "";
        return;
    }

    if (staffAccountsLoading) return;

    if (!staffAccountsLoaded || forceReload) {
        staffAccountsLoading = true;
        tableBody.innerHTML =
            '<tr><td colspan="6">Loading staff accounts...</td></tr>';

        try {
            const response = await fetch("/api/admin/staff", {
                method: "GET",
                credentials: "same-origin",
                headers: { "Accept": "application/json" }
            });

            const result = await response.json();

            if (!response.ok || !result.success) {
                throw new Error(result.error || "Unable to load staff accounts.");
            }

            databaseStaffUsers = result.staff;
            staffAccountsLoaded = true;
        } catch (error) {
            tableBody.innerHTML = "";
            const row = document.createElement("tr");
            const cell = document.createElement("td");
            cell.colSpan = 6;
            cell.textContent = error.message || "Unable to load staff accounts.";
            row.appendChild(cell);
            tableBody.appendChild(row);
            return;
        } finally {
            staffAccountsLoading = false;
        }
    }

    const search = document.getElementById("userSearch").value.trim().toLowerCase();
    const roleFilter = document.getElementById("userRoleFilter").value;
    const statusFilter = document.getElementById("userStatusFilter").value;

    const filteredUsers = databaseStaffUsers.filter(user => {
        const matchesSearch =
            String(user.name || "").toLowerCase().includes(search) ||
            String(user.email || "").toLowerCase().includes(search);

        const matchesRole = roleFilter === "All" || user.role === roleFilter;
        const matchesStatus = statusFilter === "All" || user.status === statusFilter;

        return matchesSearch && matchesRole && matchesStatus;
    });

    tableBody.innerHTML = "";

    if (filteredUsers.length === 0) {
        const row = document.createElement("tr");
        const cell = document.createElement("td");
        cell.colSpan = 6;
        cell.textContent = "No staff accounts match these filters.";
        row.appendChild(cell);
        tableBody.appendChild(row);
        return;
    }

    filteredUsers.forEach(user => {
        const row = document.createElement("tr");

        [user.id, user.name, user.email].forEach(value => {
            const cell = document.createElement("td");
            cell.textContent = value == null ? "" : String(value);
            row.appendChild(cell);
        });

        const roleCell = document.createElement("td");
        const roleBadge = document.createElement("span");
        roleBadge.textContent = user.role || "";
        roleBadge.className = "role-badge";

        if (user.role === "Admin") {
            roleBadge.classList.add("role-admin");
        } else if (user.role === "Dispatcher") {
            roleBadge.classList.add("role-dispatcher");
        } else if (user.role === "Warehouse Staff") {
            roleBadge.classList.add("role-warehouse");
        } else {
            roleBadge.classList.add("role-customer");
        }

        roleCell.appendChild(roleBadge);
        row.appendChild(roleCell);

        const statusCell = document.createElement("td");
        const statusBadge = document.createElement("span");
        statusBadge.textContent = user.status || "";
        statusBadge.className = "user-status";
        statusBadge.classList.add(
            user.status === "Active"
                ? "user-status-active"
                : "user-status-inactive"
        );
        statusCell.appendChild(statusBadge);
        row.appendChild(statusCell);

        const actionsCell = document.createElement("td");
        const deleteButton = document.createElement("button");
        deleteButton.type = "button";
        deleteButton.textContent = "DELETE";
        deleteButton.className = "user-delete-button";

        const isSelf = Number(user.id) === Number(currentUser.id);
        deleteButton.disabled = isSelf;
        deleteButton.title = isSelf
            ? "You cannot delete your own account."
            : "Delete this staff account";

        deleteButton.addEventListener("click", () => deleteUser(user.id));

        actionsCell.appendChild(deleteButton);
        row.appendChild(actionsCell);
        tableBody.appendChild(row);
    });
}

function editUser(id) {

    const user =
        users.find(
            function (item) {

                return (
                    item.id === id
                );

            }
        );


    if (!user) {

        return;

    }


    editUserId =
        id;


    document.getElementById(
        "userName"
    ).value =
        user.name;


    document.getElementById(
        "userEmail"
    ).value =
        user.email;


    document.getElementById(
        "userPassword"
    ).value =
        user.password;


    document.getElementById(
        "userRole"
    ).value =
        user.role;


    document.getElementById(
        "userStatus"
    ).value =
        user.status;


    document.getElementById(
        "userFormTitle"
    ).textContent =
        "Edit User";


    document.getElementById(
        "saveUserButton"
    ).textContent =
        "UPDATE USER";


    document.getElementById(
        "userFormContainer"
    ).style.display =
        "block";


    window.scrollTo({
        top: 0,
        behavior: "smooth"
    });

}


/* =========================================================
   DELETE USER
========================================================= */

async function deleteUser(id) {
    const currentUser = getCurrentUser();

    if (!currentUser || currentUser.role !== "Admin") {
        alert("Administrator access is required.");
        return;
    }

    const staff = databaseStaffUsers.find(
        item => Number(item.id) === Number(id)
    );

    if (!staff) {
        alert("Staff account not found. Refresh the staff list and try again.");
        return;
    }

    if (Number(staff.id) === Number(currentUser.id)) {
        alert("You cannot delete your own account.");
        return;
    }

    const confirmed = window.confirm(
        `Delete staff account "${staff.name}" (ID ${staff.id})?\n\n` +
        "This action cannot be undone. The server also protects the last active administrator."
    );

    if (!confirmed) return;

    try {
        const response = await fetch(
            `/api/admin/staff/${encodeURIComponent(id)}`,
            {
                method: "DELETE",
                credentials: "same-origin",
                headers: { "Accept": "application/json" }
            }
        );

        const result = await response.json();

        if (!response.ok || !result.success) {
            throw new Error(result.error || "Staff account deletion failed.");
        }

        alert(result.message || "Staff account deleted.");
        await displayUsers(true);
    } catch (error) {
        alert(error.message || "Unable to delete staff account.");
    }
}

function toggleUserStatus(id) {

    const currentUser =
        getCurrentUser();


    if (
        !currentUser ||
        currentUser.role !==
        "Admin"
    ) {

        return;

    }


    const user =
        users.find(
            function (item) {

                return (
                    item.id === id
                );

            }
        );


    if (!user) {

        return;

    }


    if (
        user.id ===
        currentUser.id
    ) {

        alert(
            "You cannot deactivate your own account."
        );

        return;

    }


    if (
        user.status ===
        "Active"
    ) {

        user.status =
            "Inactive";

    } else {

        user.status =
            "Active";

    }


    saveUsers();

    displayUsers();

}


/* =========================================================
   USER SEARCH / FILTER
========================================================= */

document
    .getElementById(
        "userSearch"
    )
    .addEventListener(
        "input",
        displayUsers
    );


document
    .getElementById(
        "userRoleFilter"
    )
    .addEventListener(
        "change",
        displayUsers
    );


document
    .getElementById(
        "userStatusFilter"
    )
    .addEventListener(
        "change",
        displayUsers
    );


/* =========================================================
   SHIPMENT DATA
========================================================= */

const shipmentStorageKey =
    "ulkaShipments";


const defaultShipments = [

    {
        trackingNumber: "ULK001",
        customer: "John",
        destination: "Cameroon",
        weight: 20,
        status: "In Transit",
        creationDate: "2026-10-06",
        estimatedDeliveryDate: "2026-10-12"
    },

    {
        trackingNumber: "ULK002",
        customer: "David",
        destination: "Nigeria",
        weight: 15,
        status: "Delivered",
        creationDate: "2026-09-25",
        estimatedDeliveryDate: "2026-10-02"
    },

    {
        trackingNumber: "ULK003",
        customer: "Sarah",
        destination: "France",
        weight: 40,
        status: "Pending",
        creationDate: "2026-10-05",
        estimatedDeliveryDate: "2026-10-15"
    }

];


let shipments;


const savedShipments =
    localStorage.getItem(
        shipmentStorageKey
    );


if (savedShipments) {

    try {

        shipments =
            JSON.parse(
                savedShipments
            );

    } catch {

        shipments =
            defaultShipments;

    }

} else {

    shipments =
        defaultShipments;

}


/* =========================================================
   SAVE SHIPMENTS
========================================================= */

function saveShipments() {

    localStorage.setItem(
        shipmentStorageKey,
        JSON.stringify(
            shipments
        )
    );

}


/* =========================================================
   DATE FUNCTIONS
========================================================= */

function getLocalDateOnly(
    dateString
) {

    if (!dateString) {

        return null;

    }


    const parts =
        dateString
            .split("-")
            .map(Number);


    if (
        parts.length !== 3
    ) {

        return null;

    }


    return new Date(
        parts[0],
        parts[1] - 1,
        parts[2]
    );

}


function getTodayString() {

    const today =
        new Date();


    return (

        today.getFullYear()
        +

        "-" +

        String(
            today.getMonth() + 1
        ).padStart(2, "0")

        +

        "-" +

        String(
            today.getDate()
        ).padStart(2, "0")

    );

}


function formatDate(
    dateString
) {

    const date =
        getLocalDateOnly(
            dateString
        );


    if (!date) {

        return "—";

    }


    return date.toLocaleDateString(
        "en-GB",
        {
            day: "2-digit",
            month: "short",
            year: "numeric"
        }
    );

}


function calculateDaysRemaining(
    deliveryDate
) {

    const today =
        getLocalDateOnly(
            getTodayString()
        );


    const delivery =
        getLocalDateOnly(
            deliveryDate
        );


    if (
        !today ||
        !delivery
    ) {

        return null;

    }


    return Math.round(
        (
            delivery - today
        )
        / 86400000
    );

}


/* =========================================================
   DELIVERY STATUS
========================================================= */

function getDeliveryStatus(
    shipment
) {

    if (
        shipment.status ===
        "Delivered"
    ) {

        return {

            text: "Delivered",

            className:
                "delivery-delivered"

        };

    }


    const days =
        calculateDaysRemaining(
            shipment
                .estimatedDeliveryDate
        );


    if (days === null) {

        return {

            text: "No date",

            className: ""

        };

    }


    if (days < 0) {

        return {

            text:
                Math.abs(days)
                + " days overdue",

            className:
                "delivery-overdue"

        };

    }


    if (days === 0) {

        return {

            text: "Due today",

            className:
                "delivery-today"

        };

    }


    return {

        text:
            days
            +
            (
                days === 1
                    ? " day remaining"
                    : " days remaining"
            ),

        className:
            "delivery-remaining"

    };

}


function isOverdue(
    shipment
) {

    if (
        shipment.status ===
        "Delivered"
    ) {

        return false;

    }


    const days =
        calculateDaysRemaining(
            shipment
                .estimatedDeliveryDate
        );


    return (
        days !== null &&
        days < 0
    );

}


/* =========================================================
   DASHBOARD
========================================================= */

function updateDashboard() {

    const total =
        shipments.length;


    const delivered =
        shipments.filter(
            shipment =>
                shipment.status ===
                "Delivered"
        ).length;


    const transit =
        shipments.filter(
            shipment =>
                shipment.status ===
                "In Transit"
        ).length;


    const pending =
        shipments.filter(
            shipment =>
                shipment.status ===
                "Pending"
        ).length;


    const overdue =
        shipments.filter(
            shipment =>
                isOverdue(
                    shipment
                )
        ).length;


    let totalWeight = 0;


    shipments.forEach(
        function (shipment) {

            totalWeight +=
                Number(
                    shipment.weight
                ) || 0;

        }
    );


    document.getElementById(
        "totalShipments"
    ).textContent =
        total;


    document.getElementById(
        "deliveredCount"
    ).textContent =
        delivered;


    document.getElementById(
        "inTransitCount"
    ).textContent =
        transit;


    document.getElementById(
        "pendingCount"
    ).textContent =
        pending;


    document.getElementById(
        "totalWeight"
    ).textContent =
        totalWeight.toFixed(2)
        + " kg";


    document.getElementById(
        "overdueCount"
    ).textContent =
        overdue;

}


/* =========================================================
   STATUS SELECT
========================================================= */

function getStatusClass(
    status
) {

    if (
        status === "Pending"
    ) {

        return "status-pending";

    }


    if (
        status === "In Transit"
    ) {

        return "status-transit";

    }


    return "status-delivered";

}


function createStatusSelect(shipment, index) {
    const select = document.createElement("select");
    select.className = "status-select " + getStatusClass(shipment.status);

    ["Pending", "In Transit", "Delivered"].forEach(status => {
        const option = document.createElement("option");
        option.value = status;
        option.textContent = status;
        option.selected = status === shipment.status;
        select.appendChild(option);
    });

    select.addEventListener("change", async function () {
        const previousStatus = shipment.status;
        const newStatus = select.value;
        select.disabled = true;

        try {
            const response = await fetch(
                "/api/shipments/" +
                encodeURIComponent(shipment.trackingNumber) +
                "/status",
                {
                    method: "PATCH",
                    credentials: "same-origin",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ status: newStatus })
                }
            );

            const result = await response.json();

            if (!response.ok || !result.success) {
                throw new Error(result.error || "Status update failed.");
            }

            await loadShipmentsFromServer();
            displayShipments();
            updateDashboard();
        } catch (error) {
            console.error("Shipment status update failed:", error);
            select.value = previousStatus;
            select.disabled = false;
            alert(error.message || "Unable to update shipment status.");
        }
    });

    return select;
}


/* =========================================================
   DISPLAY SHIPMENTS
========================================================= */

function displayShipments() {

    const body =
        document.getElementById(
            "shipmentTableBody"
        );


    body.innerHTML =
        "";


    const search =
        document.getElementById(
            "searchInput"
        ).value
        .trim()
        .toLowerCase();


    const filter =
        document.getElementById(
            "statusFilter"
        ).value;


    let list =
        shipments
        .map(
            function (
                shipment,
                index
            ) {

                return {

                    shipment:
                        shipment,

                    index:
                        index

                };

            }
        )
        .filter(
            function (item) {

                const shipment =
                    item.shipment;


                const matchesSearch =

                    shipment
                        .trackingNumber
                        .toLowerCase()
                        .includes(search)

                    ||

                    shipment
                        .customer
                        .toLowerCase()
                        .includes(search)

                    ||

                    shipment
                        .destination
                        .toLowerCase()
                        .includes(search);


                const matchesStatus =

                    filter ===
                    "All"

                    ||

                    shipment.status ===
                    filter;


                return (
                    matchesSearch &&
                    matchesStatus
                );

            }
        );


    const sort =
        document.getElementById(
            "sortOption"
        ).value;


    if (
        sort === "weightAsc"
    ) {

        list.sort(
            (a, b) =>
                Number(
                    a.shipment.weight
                )
                -
                Number(
                    b.shipment.weight
                )
        );

    }


    if (
        sort === "weightDesc"
    ) {

        list.sort(
            (a, b) =>
                Number(
                    b.shipment.weight
                )
                -
                Number(
                    a.shipment.weight
                )
        );

    }


    if (
        sort === "customerAsc"
    ) {

        list.sort(
            (a, b) =>
                a.shipment.customer
                    .localeCompare(
                        b.shipment.customer
                    )
        );

    }


    if (
        sort === "customerDesc"
    ) {

        list.sort(
            (a, b) =>
                b.shipment.customer
                    .localeCompare(
                        a.shipment.customer
                    )
        );

    }


    const currentUser =
        getCurrentUser();


    list.forEach(
        function (item) {

            const shipment =
                item.shipment;


            const index =
                item.index;


            const row =
                document.createElement(
                    "tr"
                );


            const values = [

                shipment.trackingNumber,

                shipment.customer,

                shipment.destination,

                shipment.weight + " kg"

            ];


            values.forEach(
                function (value) {

                    const cell =
                        document.createElement(
                            "td"
                        );


                    cell.textContent =
                        value;


                    row.appendChild(
                        cell
                    );

                }
            );


            /* STATUS */

            const statusCell =
                document.createElement(
                    "td"
                );


            if (
                currentUser &&
                currentUser.role !==
                "Customer"
            ) {

                statusCell.appendChild(
                    createStatusSelect(
                        shipment,
                        index
                    )
                );

            } else {

                statusCell.textContent =
                    shipment.status;

            }


            row.appendChild(
                statusCell
            );


            /* DELIVERY */

            const deliveryCell =
                document.createElement(
                    "td"
                );


            const delivery =
                getDeliveryStatus(
                    shipment
                );


            deliveryCell.textContent =
                delivery.text;


            deliveryCell.className =
                delivery.className;


            row.appendChild(
                deliveryCell
            );


            /* ACTIONS */

            const actions =
                document.createElement(
                    "td"
                );


            const trackButton =
                document.createElement(
                    "button"
                );


            trackButton.textContent =
                "TRACK";


            trackButton.className =
                "track-button";


            trackButton.addEventListener(
                "click",
                function () {

                    showTracking(
                        shipment
                            .trackingNumber
                    );

                }
            );


            actions.appendChild(
                trackButton
            );


            if (
                currentUser &&
                (
                    currentUser.role ===
                    "Admin"

                    ||

                    currentUser.role ===
                    "Dispatcher"
                )
            ) {

                const editButton =
                    document.createElement(
                        "button"
                    );


                editButton.textContent =
                    "EDIT";


                editButton.className =
                    "edit-button";


                editButton.addEventListener(
                    "click",
                    function () {

                        editShipment(
                            index
                        );

                    }
                );


                actions.appendChild(
                    editButton
                );


                if (currentUser.role === "Admin") {

                    const deleteButton =
                        document.createElement("button");

                    deleteButton.textContent = "DELETE";
                    deleteButton.className = "delete-button";

                    deleteButton.addEventListener("click", function () {
                        deleteShipment(index);
                    });

                    actions.appendChild(deleteButton);
                }

            }


            row.appendChild(
                actions
            );


            body.appendChild(
                row
            );

        }
    );


    document.getElementById(
        "resultCount"
    ).textContent =
        list.length
        +
        (
            list.length === 1
                ? " shipment"
                : " shipments"
        );

}


/* =========================================================
   SHIPMENT FORM
========================================================= */

let editShipmentIndex = -1;

document.getElementById("shipmentForm").addEventListener("submit", async function (event) {
    event.preventDefault();

    const currentUser = getCurrentUser();

    if (!currentUser || !["Admin", "Dispatcher"].includes(currentUser.role)) {
        alert("Only Admin and Dispatcher staff can create or edit shipments.");
        return;
    }

    const trackingNumber = document.getElementById("trackingNumber").value.trim();
    const customer = document.getElementById("customer").value.trim();
    const destination = document.getElementById("destination").value.trim();
    const weight = Number(document.getElementById("weight").value);
    const status = document.getElementById("status").value;
    const creationDate = document.getElementById("creationDate").value;
    const estimatedDeliveryDate = document.getElementById("estimatedDeliveryDate").value;
    const message = document.getElementById("shipmentMessage");

    if (!trackingNumber || !customer || !destination ||
        !Number.isFinite(weight) || weight <= 0 ||
        !creationDate || !estimatedDeliveryDate) {
        message.textContent = "Please complete all fields with valid values.";
        message.style.color = "red";
        return;
    }

    if (estimatedDeliveryDate < creationDate) {
        message.textContent = "Delivery date cannot be before creation date.";
        message.style.color = "red";
        return;
    }

    const duplicate = shipments.some((item, index) =>
        item.trackingNumber.toLowerCase() === trackingNumber.toLowerCase() &&
        index !== editShipmentIndex
    );

    if (duplicate) {
        message.textContent = "Tracking number already exists.";
        message.style.color = "red";
        return;
    }

    const wasEditing = editShipmentIndex !== -1;
    const existingShipment = wasEditing ? shipments[editShipmentIndex] : null;

    if (wasEditing && !existingShipment) {
        message.textContent = "The shipment selected for editing was not found.";
        message.style.color = "red";
        return;
    }

    const payload = {
        trackingNumber,
        customer,
        destination,
        weight,
        status,
        creationDate,
        estimatedDeliveryDate
    };

    const endpoint = wasEditing
        ? "/api/shipments/" + encodeURIComponent(existingShipment.trackingNumber)
        : "/api/shipments";

    const button = document.getElementById("addShipmentButton");
    button.disabled = true;

    try {
        const response = await fetch(endpoint, {
            method: wasEditing ? "PUT" : "POST",
            credentials: "same-origin",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });

        const result = await response.json();

        if (!response.ok || !result.success) {
            throw new Error(result.error || result.message || "Unable to save shipment.");
        }

        await loadShipmentsFromServer();
        displayShipments();
        updateDashboard();

        message.textContent = wasEditing
            ? "Shipment updated successfully."
            : "Shipment added successfully.";
        message.style.color = "green";

        document.getElementById("shipmentForm").reset();
        document.getElementById("creationDate").value = getTodayString();

        editShipmentIndex = -1;
        button.textContent = "ADD SHIPMENT";
    } catch (error) {
        console.error("Shipment save failed:", error);
        message.textContent = error.message || "Unable to save shipment to the database.";
        message.style.color = "red";
    } finally {
        button.disabled = false;
    }
});


/* =========================================================
   EDIT SHIPMENT
========================================================= */

function editShipment(index) {

    const shipment =
        shipments[index];


    if (!shipment) {

        return;

    }


    document.getElementById(
        "trackingNumber"
    ).value =
        shipment.trackingNumber;


    document.getElementById(
        "customer"
    ).value =
        shipment.customer;


    document.getElementById(
        "destination"
    ).value =
        shipment.destination;


    document.getElementById(
        "weight"
    ).value =
        shipment.weight;


    document.getElementById(
        "status"
    ).value =
        shipment.status;


    document.getElementById(
        "creationDate"
    ).value =
        shipment.creationDate;


    document.getElementById(
        "estimatedDeliveryDate"
    ).value =
        shipment.estimatedDeliveryDate;


    editShipmentIndex =
        index;


    document.getElementById(
        "addShipmentButton"
    ).textContent =
        "UPDATE SHIPMENT";


    window.scrollTo({
        top: 0,
        behavior: "smooth"
    });

}


/* =========================================================
   DELETE SHIPMENT
========================================================= */

async function deleteShipment(index) {
    const shipment = shipments[index];

    if (!shipment) {
        return;
    }

    const currentUser = getCurrentUser();
    if (!currentUser || currentUser.role !== "Admin") {
        alert("Only an Admin can delete shipments.");
        return;
    }

    if (!confirm("Delete " + shipment.trackingNumber + "?")) {
        return;
    }

    try {
        const response = await fetch(
            "/api/shipments/" + encodeURIComponent(shipment.trackingNumber),
            {
                method: "DELETE",
                credentials: "same-origin"
            }
        );

        const result = await response.json();

        if (!response.ok || !result.success) {
            throw new Error(result.error || "Unable to delete shipment.");
        }

        await loadShipmentsFromServer();
        displayShipments();
        updateDashboard();
    } catch (error) {
        console.error("Shipment deletion failed:", error);
        alert(error.message || "Unable to delete shipment.");
    }
}


/* =========================================================
   CANCEL SHIPMENT EDIT
========================================================= */

document
    .getElementById(
        "cancelEditButton"
    )
    .addEventListener(
        "click",
        function () {

            editShipmentIndex =
                -1;


            document
                .getElementById(
                    "shipmentForm"
                )
                .reset();


            document.getElementById(
                "creationDate"
            ).value =
                getTodayString();


            document.getElementById(
                "addShipmentButton"
            ).textContent =
                "ADD SHIPMENT";

        }
    );


/* =========================================================
   SEARCH / FILTER / SORT
========================================================= */

document
    .getElementById(
        "searchInput"
    )
    .addEventListener(
        "input",
        displayShipments
    );


document
    .getElementById(
        "statusFilter"
    )
    .addEventListener(
        "change",
        displayShipments
    );


document
    .getElementById(
        "sortOption"
    )
    .addEventListener(
        "change",
        displayShipments
    );


document
    .getElementById(
        "resetFiltersButton"
    )
    .addEventListener(
        "click",
        function () {

            document.getElementById(
                "searchInput"
            ).value =
                "";


            document.getElementById(
                "statusFilter"
            ).value =
                "All";


            document.getElementById(
                "sortOption"
            ).value =
                "default";


            displayShipments();

        }
    );


/* =========================================================
   TRACKING
========================================================= */

document
    .getElementById(
        "trackShipmentButton"
    )
    .addEventListener(
        "click",
        function () {

            const number =
                document.getElementById(
                    "trackingSearchInput"
                ).value.trim();


            showTracking(
                number
            );

        }
    );


function showTracking(
    trackingNumber
) {

    const shipment =
        shipments.find(
            function (item) {

                return (

                    item.trackingNumber
                        .toLowerCase()
                        ===
                    trackingNumber
                        .toLowerCase()

                );

            }
        );


    const message =
        document.getElementById(
            "trackingSearchMessage"
        );


    if (!shipment) {

        message.textContent =
            "Shipment not found.";

        message.style.color =
            "red";


        document.getElementById(
            "trackingResult"
        ).style.display =
            "none";


        return;

    }


    message.textContent =
        "Shipment found.";

    message.style.color =
        "green";


    document.getElementById(
        "trackingResult"
    ).style.display =
        "block";


    document.getElementById(
        "trackNumber"
    ).textContent =
        shipment.trackingNumber;


    document.getElementById(
        "trackCustomer"
    ).textContent =
        shipment.customer;


    document.getElementById(
        "trackDestination"
    ).textContent =
        shipment.destination;


    document.getElementById(
        "trackWeight"
    ).textContent =
        shipment.weight +
        " kg";


    document.getElementById(
        "trackStatus"
    ).textContent =
        shipment.status;


    document.getElementById(
        "trackDeliveryDate"
    ).textContent =
        formatDate(
            shipment
                .estimatedDeliveryDate
        );


    updateTimeline(
        shipment.status
    );


    document.getElementById(
        "trackingResult"
    ).scrollIntoView({
        behavior: "smooth"
    });

}


/* =========================================================
   TRACKING TIMELINE
========================================================= */

function updateTimeline(
    status
) {

    const created =
        document.getElementById(
            "timelineCreated"
        );


    const pending =
        document.getElementById(
            "timelinePending"
        );


    const transit =
        document.getElementById(
            "timelineTransit"
        );


    const delivered =
        document.getElementById(
            "timelineDelivered"
        );


    const lineCreated =
        document.getElementById(
            "lineCreated"
        );


    const linePending =
        document.getElementById(
            "linePending"
        );


    const lineTransit =
        document.getElementById(
            "lineTransit"
        );


    [
        created,
        pending,
        transit,
        delivered
    ]
    .forEach(
        function (element) {

            element.classList.remove(
                "completed"
            );

            element.classList.remove(
                "active"
            );

            element.classList.remove(
                "delivered"
            );

        }
    );


    [
        lineCreated,
        linePending,
        lineTransit
    ]
    .forEach(
        function (element) {

            element.classList.remove(
                "completed-line"
            );

        }
    );


    created.classList.add(
        "completed"
    );


    if (
        status ===
        "Pending"
    ) {

        pending.classList.add(
            "active"
        );

        return;

    }


    if (
        status ===
        "In Transit"
    ) {

        pending.classList.add(
            "completed"
        );


        transit.classList.add(
            "active"
        );


        lineCreated.classList.add(
            "completed-line"
        );


        linePending.classList.add(
            "completed-line"
        );


        return;

    }


    if (
        status ===
        "Delivered"
    ) {

        pending.classList.add(
            "completed"
        );


        transit.classList.add(
            "completed"
        );


        delivered.classList.add(
            "delivered"
        );


        lineCreated.classList.add(
            "completed-line"
        );


        linePending.classList.add(
            "completed-line"
        );


        lineTransit.classList.add(
            "completed-line"
        );

    }

}


/* =========================================================
   INITIALIZE
========================================================= */

document.getElementById(
    "creationDate"
).value =
    getTodayString();


displayUsers();

displayShipments();

updateDashboard();

checkExistingLogin();