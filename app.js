import express from 'express';
import { engine } from 'express-handlebars';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import * as business from './business.js';

dotenv.config();

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

// 2. Routes & Views

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
 * Renders the search form allowing the user to search by customerId.
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
        const customerId = req.query.customer_id?.trim() || req.query.customerId?.trim();

        if (!customerId) {
            return res.render('customer', { error: 'Please enter a valid Customer ID.' });
        }

        const customer = await business.getCustomerInformation(customerId);
        if (!customer) {
            return res.render('customer', { error: `Customer '${customerId}' not found.` });
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
                    customerName = cust?.name || order.customerId;
                }
                return {
                    ...order,
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
        const orderId = req.query.order?.trim() || req.query.orderId?.trim();

        if (!orderId) {
            return res.status(400).send('Order ID is required.');
        }

        const order = await business.getOrderDetails(orderId);
        if (!order) {
            return res.status(404).send('Order not found.');
        }

        res.render('update-status', {
            orderId: order.orderId,
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
        const orderId = req.body.orderId?.trim() || req.body.order?.trim();
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

