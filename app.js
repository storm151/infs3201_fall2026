import express from 'express';
import { engine } from 'express-handlebars';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import multer from 'multer';
import * as business from './business.js';

dotenv.config({ path: ['.env'] });

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 8000;

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
                // Refresh the cookie expiration in the browser to match the sliding window
                res.cookie('session', session.sessionKey, {
                    expires: session.expiry,
                    httpOnly: true
                });
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

/**
 * Middleware to protect staff-only routes.
 * Blocks unauthenticated users and logged-in customers.
 */
function requireStaff(req, res, next) {
    if (!req.session) {
        return res.redirect('/login');
    }
    if (req.session.userType !== 'staff') {
        return res.status(403).send('Access Denied: Staff only.');
    }
    next();
}

/**
 * Middleware to protect customer-only routes.
 * Blocks unauthenticated users and logged-in staff.
 */
function requireCustomer(req, res, next) {
    if (!req.session) {
        return res.redirect('/login');
    }
    if (req.session.userType !== 'customer') {
        return res.status(403).send('Access Denied: Customers only.');
    }
    next();
}

/**
 * Multer configuration for pickup-location image upload:
 * - Enforces maximum file size of 2 MB
 * - Accepts only JPG (.jpg / .jpeg) files
 */
const pickupImageUpload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: business.MAX_PICKUP_IMAGE_SIZE,
        files: 1
    },
    fileFilter: (req, file, cb) => {
        const mime = (file.mimetype || '').toLowerCase();
        const ext = path.extname(file.originalname || '').toLowerCase();
        if ((mime === 'image/jpeg' || mime === 'image/jpg') && (ext === '.jpg' || ext === '.jpeg')) {
            return cb(null, true);
        }
        cb(new Error('Only JPG (.jpg / .jpeg) image files are accepted.'));
    }
});

/**
 * Helper to fetch all orders and enrich them with customer names and formatted dates.
 */
async function getEnrichedOrders() {
    const orders = await business.getAllOrders();
    return await Promise.all(
        (orders || []).map(async (order) => {
            let customerName = order.customerName;
            if (!customerName && order.customerId) {
                const cust = await business.getCustomerById(order.customerId);
                customerName = cust?.name || String(order.customerId);
            }
            return {
                ...order,
                _id: String(order._id),
                customerName: customerName || 'N/A',
                date: order.orderDate || order.date || 'N/A'
            };
        })
    );
}

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
 * If valid: creates a MongoDB session with a 10-minute sliding window expiry and redirects to /dashboard.
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
 * For logged-in staff: displays all current orders with status update actions.
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
                orders: customer?.orders || [],
                uploadSuccess: req.query.uploaded === '1' ? 'Pickup location image uploaded successfully.' : null
            });
        }

        if (session.userType === 'staff') {
            const enrichedOrders = await getEnrichedOrders();
            return res.render('dashboard', {
                isStaff: true,
                userType: session.userType,
                user: session.data,
                orders: enrichedOrders
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
 * Route POST /upload-pickup-image (Authenticated Customer Pickup-Location Image Upload)
 * Accepts a single JPG image up to 2 MB, stores it on the server filesystem with a
 * server-managed filename, and updates the customer's record in MongoDB.
 */
app.post('/upload-pickup-image', requireCustomer, (req, res, next) => {
    const singleUpload = pickupImageUpload.single('pickupImage');
    singleUpload(req, res, async (uploadErr) => {
        try {
            const customerId = req.session.data.userId;

            if (uploadErr) {
                const errorMessage = uploadErr.code === 'LIMIT_FILE_SIZE'
                    ? 'File size exceeds the maximum limit of 2 MB.'
                    : (uploadErr.message || 'Invalid image upload.');
                const customer = await business.getCustomerInformationById(customerId);
                return res.status(400).render('dashboard', {
                    isCustomer: true,
                    userType: req.session.userType,
                    user: req.session.data,
                    customer: customer,
                    orders: customer?.orders || [],
                    uploadError: errorMessage
                });
            }

            const result = await business.saveCustomerPickupImage(customerId, req.file);
            if (!result.success) {
                const customer = await business.getCustomerInformationById(customerId);
                return res.status(400).render('dashboard', {
                    isCustomer: true,
                    userType: req.session.userType,
                    user: req.session.data,
                    customer: customer,
                    orders: customer?.orders || [],
                    uploadError: result.error
                });
            }

            res.redirect('/dashboard?uploaded=1');
        } catch (err) {
            next(err);
        }
    });
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
 * Route /customer (Find Customer Search Form - Staff Only)
 * Renders the search form allowing staff to search by phone number.
 */
app.get('/customer', requireStaff, (req, res) => {
    res.render('customer');
});

/**
 * Route /find-results (Customer Search Results - Staff Only)
 * Fetches customer details and orders via the business layer.
 * Displays customer info if found, or an error message if not found.
 */
app.get('/find-results', requireStaff, async (req, res, next) => {
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
 * Route /orders (Orders Summary Page - Staff Only)
 * Fetches all orders, populates customer names, and renders the orders table with status classes.
 */
app.get('/orders', requireStaff, async (req, res, next) => {
    try {
        const enrichedOrders = await getEnrichedOrders();
        res.render('orders', { orders: enrichedOrders });
    } catch (err) {
        next(err);
    }
});

/**
 * Route GET /update-status (Status Modification Form - Staff Only)
 * Displays order ID and status selection dropdown.
 */
app.get('/update-status', requireStaff, async (req, res, next) => {
    try {
        const orderId = req.query.order?.trim() || req.query._id?.trim();

        if (!orderId) {
            return res.status(400).send('Order ID is required.');
        }

        const order = await business.getOrderDetails(orderId);
        if (!order) {
            return res.status(404).send('Order not found.');
        }

        res.render('update-status', {
            _id: String(order._id),
            order: order,
            states: ['Received', 'Washing', 'Ready', 'Delivered']
        });
    } catch (err) {
        next(err);
    }
});

/**
 * Route POST /update-status (Status Modification Action - Staff Only)
 * Validates state transition against business rules.
 * If invalid: responds with "Invalid State".
 * If valid: updates order in database and redirects to /dashboard (PRG pattern).
 */
app.post('/update-status', requireStaff, async (req, res, next) => {
    try {
        const orderId = req.body._id?.trim() || req.body.order?.trim();
        const newStatus = req.body.newStatus?.trim() || req.body.status?.trim();

        if (!orderId || !newStatus) {
            return res.status(400).send('Invalid State');
        }

        const success = await business.updateOrderStatus(orderId, newStatus);
        if (!success) {
            return res.status(400).send('Invalid State');
        }

        // Post/Redirect/Get pattern
        res.redirect('/dashboard');
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

