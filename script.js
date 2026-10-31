/* =========================================================
   ULKA LOGISTICS
   COURSE 22
   USER MANAGEMENT & REGISTRATION
========================================================= */


/* =========================================================
   USER STORAGE
========================================================= */

const userStorageKey = "ulkaUsers";
const defaultUsers = [];
let users;

const savedUsers = localStorage.getItem(userStorageKey);

if (savedUsers) {
    try {
        users = JSON.parse(savedUsers);
    } catch (error) {
        users = defaultUsers;
        saveUsers();
    }
} else {
    users = defaultUsers;
    saveUsers();
}


/* =========================================================
   SAVE USERS
========================================================= */

function saveUsers() {
    localStorage.setItem(
        userStorageKey,
        JSON.stringify(users)
    );
}


/* =========================================================
   LOGIN ELEMENTS
========================================================= */

const loginSection = document.getElementById("loginSection");
const mainApplication = document.getElementById("mainApplication");
const loginForm = document.getElementById("loginForm");
const loginMessage = document.getElementById("message");
const passwordInput = document.getElementById("password");



/* =========================================================
   LOGIN - BACKEND CUSTOMERS + EXISTING DEMO STAFF
========================================================= */

if (loginForm) {
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
                loginMessage.textContent = "Please enter email and password.";
                loginMessage.style.color = "red";
                return;
            }

            const loginButton = document.getElementById("loginButton");
            if (loginButton) {
                loginButton.disabled = true;
                loginButton.textContent = "PLEASE WAIT...";
            }

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
                    const staffUser = staffResult.staff || staffResult.user;

                    localStorage.setItem(
                        "ulkaLoggedUser",
                        JSON.stringify({
                            ...staffUser,
                            authType: "staff"
                        })
                    );

                    loginMessage.textContent = "Login successful.";
                    loginMessage.style.color = "green";

                    window.location.replace("/admin-dashboard-model.html");
                    return;
                }

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
                 * SECOND: If not staff, try the backend customer login (/api/login).
                 */
                const response = await fetch(
                    "/api/login",
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

                const customerUser = {
                    id: "customer-" + result.customer.id,
                    name: result.customer.fullName,
                    email: result.customer.email,
                    role: "Customer",
                    status: "Active",
                    authType: "customer"
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
                if (loginButton) {
                    loginButton.disabled = false;
                    loginButton.textContent = "LOGIN";
                }
            }
        }
    );
}



/* =========================================================
   SHOW PASSWORD
========================================================= */

const showPasswordBtn = document.getElementById("showPassword");
if (showPasswordBtn && passwordInput) {
    showPasswordBtn.addEventListener(
        "click",
        function () {
            if (passwordInput.type === "password") {
                passwordInput.type = "text";
                this.textContent = "HIDE";
            } else {
                passwordInput.type = "password";
                this.textContent = "SHOW";
            }
        }
    );
}


/* =========================================================
   CLEAR LOGIN
========================================================= */

const clearButton = document.getElementById("clearButton");
if (clearButton && passwordInput) {
    clearButton.addEventListener(
        "click",
        function () {
            const emailInput = document.getElementById("email");
            if (emailInput) emailInput.value = "";
            passwordInput.value = "";
            if (loginMessage) loginMessage.textContent = "";
        }
    );
}


/* =========================================================
   LOAD SHIPMENTS FROM SERVER
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

    return result.shipments.map(item => ({
        id: item.id,
        trackingNumber: item.trackingnumber || item.trackingNumber,
        customer: item.customer,
        destination: item.destination,
        weight: Number(item.weight),
        status: item.status,
        creationDate: item.creationdate || item.creationDate || "",
        estimatedDeliveryDate: item.estimateddeliverydate || item.estimatedDeliveryDate || "",
        customerId: item.customerid ?? item.customerId ?? null
    }));
}


/* =========================================================
   OPEN APPLICATION
========================================================= */

async function openApplication(user) {
    refreshSidebarProfilePicture(user.name);
    if (loginSection) loginSection.style.display = "none";
    if (mainApplication) mainApplication.style.display = "flex";

    const userNameEl = document.getElementById("loggedUserName");
    const userRoleEl = document.getElementById("loggedUserRole");
    const roleBannerEl = document.getElementById("roleBanner");

    if (userNameEl) userNameEl.textContent = user.name;
    if (userRoleEl) userRoleEl.textContent = user.role;
    if (roleBannerEl) roleBannerEl.textContent = getRoleMessage(user.role);

    applyPermissions(user.role);
    setupSidebarNavigation(user.role);

    try {
        window.shipments = await loadShipmentsFromServer();
        if (typeof displayUsers === "function") displayUsers();
        if (user.role === "Admin" && typeof loadRegisteredCustomers === "function") {
            await loadRegisteredCustomers();
        }
        if (typeof displayShipments === "function") displayShipments();
        if (typeof updateDashboard === "function") updateDashboard();
    } catch (error) {
        console.error("Unable to load database shipments:", error);
        window.shipments = [];
        if (typeof displayShipments === "function") displayShipments();
        if (typeof updateDashboard === "function") updateDashboard();
    }
}


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
            submenu.hidden = !submenu.hidden;
            button.setAttribute("aria-expanded", String(!submenu.hidden));
        };
    });

    const user = getCurrentUser();
    const profileNameEl = document.getElementById("sidebarProfileName");
    const profileRoleEl = document.getElementById("sidebarProfileRole");

    if (profileNameEl) profileNameEl.textContent = user && user.name ? user.name : "User";
    if (profileRoleEl) profileRoleEl.textContent = role;

    showSidebarView("dashboard");
}

function showSidebarView(view) {
    const allowedViews = sidebarAllowedViews[sidebarActiveRole] || [];
    if (!allowedViews.includes(view)) return;

    const trackingResult = document.getElementById("trackingResult");
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

    if (view === "dashboard" || view === "shipmentDashboard" || view === "myShipments") {
        if (dashboard) dashboard.style.display = "block";
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
    }

    if (view === "tracking" && trackingSection) {
        trackingSection.style.display = "block";
    }

    if (view === "reports" && reportsPanel) reportsPanel.style.display = "block";
    if (view === "settings" && settingsPanel) settingsPanel.style.display = "block";
    
    if (view === "profile" && profilePanel) {
        profilePanel.style.display = "block";
        const user = getCurrentUser();
        refreshSidebarProfilePicture(user && user.name);
    }

    sidebarActiveView = view;
}

function getRoleMessage(role) {
    if (role === "Admin") return "👑 Administrator — Full system and user management access.";
    if (role === "Dispatcher") return "🚚 Dispatcher — Shipment operation access.";
    if (role === "Warehouse Staff") return "📦 Warehouse Staff — Warehouse shipment access.";
    if (role === "Customer") return "👤 Customer — Shipment tracking access.";
    return "Welcome to ULKA LOGISTICS.";
}

function applyPermissions(role) {
    const userManagement = document.getElementById("userManagement");
    const shipmentForm = document.getElementById("shipmentFormSection");
    
    if (userManagement) userManagement.style.display = role === "Admin" ? "block" : "none";
    if (shipmentForm) shipmentForm.style.display = ["Admin", "Dispatcher", "Warehouse Staff"].includes(role) ? "block" : "none";
}

function refreshSidebarProfilePicture(displayName) {
    const image = document.getElementById("sidebarProfilePicture");
    const fallback = document.getElementById("sidebarProfilePictureFallback");
    if (!image || !fallback) return;

    fallback.textContent = (displayName || "U").trim().charAt(0).toUpperCase() || "U";
    image.onload = function () {
        image.style.display = "block";
        fallback.style.display = "none";
    };
    image.onerror = function () {
        image.style.display = "none";
        fallback.style.display = "flex";
    };
    image.src = "/api/profile-picture?ts=" + Date.now();
}

function getCurrentUser() {
    const saved = localStorage.getItem("ulkaLoggedUser");
    if (!saved) return null;
    try {
        return JSON.parse(saved);
    } catch {
        return null;
    }
}

/* =========================================================
   CHECK EXISTING LOGIN ON LOAD
========================================================= */

async function checkExistingLogin() {
    const user = getCurrentUser();
    if (!user) return;

    try {
        const endpoint = user.authType === "staff" ? "/api/staff/me" : "/api/customers/me";
        const response = await fetch(endpoint, {
            method: "GET",
            credentials: "same-origin"
        });
        if (response.ok) {
            openApplication(user);
        } else {
            localStorage.removeItem("ulkaLoggedUser");
        }
    } catch (e) {
        console.error("Session check error:", e);
    }
}

document.addEventListener("DOMContentLoaded", () => {
    checkExistingLogin();
});