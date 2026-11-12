import express from 'express';
import { engine } from 'express-handlebars';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import * as business from './business.js';

dotenv.config({ path: ['.env', 'env.exmple'] });

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// 1. Template Engine & Middleware Setup
app.engine('handlebars', engine({
    defaultLayout: 'main',
    layoutsDir: path.join(__dirname, 'views/layouts')
}));
app.set('view engine', 'handlebars');
app.set('views', path.join(__dirname, 'views'));

// Static files (CSS, etc.)
app.use(express.static(path.join(__dirname, 'public')));

// Parse URL-encoded bodies for form submissions
app.use(express.urlencoded({ extended: true }));

// Parse cookies from request headers
app.use((req, res, next) => {
    req.cookies = {};
    const cookieHeader = req.headers.cookie;
    if (cookieHeader) {
        for (const pair of cookieHeader.split(';')) {
            const idx = pair.indexOf('=');
            if (idx !== -1) {
                const key = pair.slice(0, idx).trim();
                const val = decodeURIComponent(pair.slice(idx + 1).trim());
                req.cookies[key] = val;
            }
        }
    }
    next();
});

// Populate session state into req.session and res.locals for layout navigation
app.use(async (req, res, next) => {
    try {
        const sessionKey = req.cookies?.session;
        if (sessionKey) {
            const session = await business.getSession(sessionKey);
            if (session) {
                req.session = session;
                res.locals.session = session;
                res.locals.user = session.data;
                res.locals.userType = session.userType;
                res.locals.isCustomer = session.userType === 'customer';
                res.locals.isStaff = session.userType === 'staff';
            } else {
                res.clearCookie('session');
            }
        }
        next();
    } catch (err) {
        next(err);
    }
});

// 2. Routes & Views

/**
 * Route GET /login (Login Screen)
 * Renders the login form asking for email and password.
 */
app.get('/login', (req, res) => {
    res.render('login');
});

/**
 * Route POST /login (Authentication & Session Start)
 * Checks both customers and staff_users collections.
 * If invalid: displays an error message on the login page.
 * If valid: creates a MongoDB session with a fixed 10-minute expiry and redirects to /dashboard.
 */
app.post('/login', async (req, res, next) => {
    try {
        const email = req.body.email?.trim();
        const password = req.body.password;

        if (!email || !password) {
            return res.render('login', { error: 'Please enter both email and password.' });
        }

        const session = await business.login(email, password);
        if (!session) {
            return res.render('login', { error: 'Invalid email or password.' });
        }

        res.cookie('session', session.sessionKey, {
            expires: session.expiry,
            httpOnly: true
        });

        res.redirect('/dashboard');
    } catch (err) {
        next(err);
    }
});

/**
 * Route GET /dashboard (Customer / Staff Dashboard)
 * For logged-in customers: displays only their specific orders (Order ID, Date, Status, Total QAR).
 * For logged-in staff: displays staff role status.
 */
app.get('/dashboard', async (req, res, next) => {
    try {
        const session = req.session;

        if (!session) {
            return res.redirect('/login');
        }

        if (session.userType === 'customer') {
            const customer = await business.getCustomerInformationById(session.data.userId);
            return res.render('dashboard', {
                isCustomer: true,
                userType: session.userType,
                user: session.data,
                customer: customer,
                orders: customer?.orders || []
            });
        }

        res.render('dashboard', {
            userType: session.userType,
            user: session.data
        });
    } catch (err) {
        next(err);
    }
});

/**
 * Route GET /logout (End Session)
 */
app.get('/logout', async (req, res, next) => {
    try {
        const sessionKey = req.cookies?.session;
        if (sessionKey) {
            await business.logout(sessionKey);
        }
        res.clearCookie('session');
        res.redirect('/login');
    } catch (err) {
        next(err);
    }
});

/**
 * Route / (Landing Page)
 * Renders home view using the shared main layout.
 */
app.get('/', (req, res) => {
    res.render('home');
});

/**
 * Route /services (Services List Page)
 * Fetches all services from the business layer and renders the services table.
 */
app.get('/services', async (req, res, next) => {
    try {
        const services = await business.getServices();
        res.render('services', { services: services || [] });
    } catch (err) {
        next(err);
    }
});

/**
 * Route /customer (Find Customer Search Form)
 * Renders the search form allowing the user to search by phone number.
 */
app.get('/customer', (req, res) => {
    res.render('customer');
});

/**
 * Route /find-results (Customer Search Results)
 * Fetches customer details and orders via the business layer.
 * Displays customer info if found, or an error message if not found.
 */
app.get('/find-results', async (req, res, next) => {
    try {
        const phone = req.query.phone?.trim() || req.query.phone_number?.trim() || req.query.phoneNumber?.trim();

        if (!phone) {
            return res.render('customer', { error: 'Please enter a valid Phone Number.' });
        }

        const customer = await business.getCustomerInformation(phone);
        if (!customer) {
            return res.render('customer', { error: `Customer with phone '${phone}' not found.` });
        }

        res.render('customer', { customer });
    } catch (err) {
        next(err);
    }
});

/**
 * Route /orders (Orders Summary Page)
 * Fetches all orders, populates customer names, and renders the orders table with status classes.
 */
app.get('/orders', async (req, res, next) => {
    try {
        const orders = await business.getAllOrders();

        // Enrich orders with customer names and formatted dates
        const enrichedOrders = await Promise.all(
            (orders || []).map(async (order) => {
                let customerName = order.customerName;
                if (!customerName && order.customerId) {
                    const cust = await business.getCustomerById(order.customerId);
                    customerName = cust?.name || String(order.customerId);
                }
                return {
                    ...order,
                    _id: String(order._id),
                    orderId: String(order._id),
                    customerName: customerName || 'N/A',
                    date: order.orderDate || order.date || 'N/A'
                };
            })
        );

        res.render('orders', { orders: enrichedOrders });
    } catch (err) {
        next(err);
    }
});

/**
 * Route GET /update-status (Status Modification Form)
 * Displays order ID and status selection dropdown.
 */
app.get('/update-status', async (req, res, next) => {
    try {
        const orderId = req.query.order?.trim() || req.query.orderId?.trim() || req.query._id?.trim();

        if (!orderId) {
            return res.status(400).send('Order ID is required.');
        }

        const order = await business.getOrderDetails(orderId);
        if (!order) {
            return res.status(404).send('Order not found.');
        }

        res.render('update-status', {
            _id: String(order._id),
            orderId: String(order._id),
            order: order,
            states: ['Received', 'Washing', 'Ready', 'Delivered']
        });
    } catch (err) {
        next(err);
    }
});

/**
 * Route POST /update-status (Status Modification Action)
 * Validates state transition against business rules.
 * If invalid: responds with "Invalid State".
 * If valid: updates order in database and redirects to /orders (PRG pattern).
 */
app.post('/update-status', async (req, res, next) => {
    try {
        const orderId = req.body.orderId?.trim() || req.body.order?.trim() || req.body._id?.trim();
        const newStatus = req.body.newStatus?.trim() || req.body.status?.trim();

        if (!orderId || !newStatus) {
            return res.status(400).send('Invalid State');
        }

        const success = await business.updateOrderStatus(orderId, newStatus);
        if (!success) {
            return res.status(400).send('Invalid State');
        }

        // Post/Redirect/Get pattern
        res.redirect('/orders');
    } catch (err) {
        next(err);
    }
});

// 3. 404 Handler for undefined routes
app.use((req, res) => {
    res.status(404).send('Page not found');
});

// Global Error Handler to prevent Express server crashes
app.use((err, req, res, next) => {
    console.error('Unhandled Server Error:', err);
    res.status(500).send('Internal Server Error');
});

// Start the Express server
app.listen(PORT, () => {
    console.log(`Laundry App running at http://localhost:${PORT}`);
});

