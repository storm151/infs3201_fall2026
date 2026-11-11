import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';
import dns from "dns";

dns.setServers(["8.8.8.8", "8.8.4.4"]);

dotenv.config({ path: ['.env', 'env.exmple'] });

// Load environment variables safely inside getDatabase
let client;
let db;

/**
 * Connects to MongoDB and caches the database instance.
 * Returns the cached database connection on subsequent calls.
 */
async function getDatabase() {
    if (db) {
        return db;
    }

    const uri = process.env.MONGO_URI
    const dbName = process.env.MONGO_DB_NAME

    client = new MongoClient(uri);
    await client.connect();
    db = client.db(dbName);
    return db;
}

/**
 * Finds a single customer by customerId.
 */
export async function getCustomerById(customerId) {
    const database = await getDatabase();
    const customer = await database.collection('customers').findOne(
        { customerId: customerId },
        { projection: { _id: 0 } } // Exclude MongoDB internal _id
    );
    return customer;
}
export const getCustomer = getCustomerById;

/**
 * Finds a single customer by phone number.
 */
export async function getCustomerByPhone(phone) {
    const database = await getDatabase();
    const customer = await database.collection('customers').findOne(
        { phone: phone },
        { projection: { _id: 0 } } // Exclude MongoDB internal _id
    );
    return customer;
}

/**
 * Retrieves all customers from the database.
 */
export async function getAllCustomers() {
    const database = await getDatabase();
    const customers = await database.collection('customers')
        .find({}, { projection: { _id: 0 } })
        .toArray();
    return customers;
}
export const getCustomers = getAllCustomers;

/**
 * Retrieves all laundry services.
 */
export async function getAllServices() {
    const database = await getDatabase();
    const services = await database.collection('services')
        .find({}, { projection: { _id: 0 } })
        .toArray();
    return services;
}
export const getServices = getAllServices;

/**
 * Finds a single service by serviceId.
 */
export async function getServiceById(serviceId) {
    const database = await getDatabase();
    const service = await database.collection('services').findOne(
        { serviceId: serviceId },
        { projection: { _id: 0 } }
    );
    return service;
}
export const getService = getServiceById;

/**
 * Retrieves all orders.
 * Converts cursor to array using .toArray().
 */
export async function getAllOrders() {
    const database = await getDatabase();
    const orders = await database.collection('orders')
        .find({}, { projection: { _id: 0 } })
        .toArray();
    return orders;
}
export const getOrders = getAllOrders;

/**
 * Finds a single order by orderId.
 */
export async function getOrderById(orderId) {
    const database = await getDatabase();
    const order = await database.collection('orders').findOne(
        { orderId: orderId },
        { projection: { _id: 0 } }
    );
    return order;
}
export const getOrderDetails = getOrderById;

/**
 * Finds all orders belonging to a specific customerId.
 */
export async function getOrdersByCustomerId(customerId) {
    const database = await getDatabase();
    const orders = await database.collection('orders')
        .find({ customerId: customerId }, { projection: { _id: 0 } })
        .toArray();
    return orders;
}

/**
 * Updates the status of a single order by orderId.
 */
export async function updateOrderStatus(orderId, newStatus) {
    const database = await getDatabase();
    const result = await database.collection('orders').updateOne(
        { orderId: orderId },
        { $set: { status: newStatus } }
    );
    return result.modifiedCount > 0;
}

/**
 * Inserts a new order document into MongoDB.
 */
export async function saveOrder(newOrder) {
    const database = await getDatabase();
    const result = await database.collection('orders').insertOne(newOrder);
    return result.acknowledged;
}

async function testPersistence() {
    console.log('--- Starting Persistence Tests ---');
    try {
        // 1. Check Configuration & Connection
        console.log('\n[1] Environment & Connection:');
        console.log('  MONGO_URI defined:', !!process.env.MONGO_URI);
        console.log('  MONGO_DB_NAME env:', process.env.MONGO_DB_NAME);
        console.log('  dbname env:', process.env.dbname);

        const database = await getDatabase();
        if (!database) {
            console.error('  Could not connect to database!');
            return;
        }
        console.log('  Connected database name:', database.databaseName);

        // List collections in active database
        const collections = await database.listCollections().toArray();
        const collectionNames = collections.map(c => c.name);
        console.log('  Collections in connected DB:', collectionNames);

        // Check if database name mismatch is likely
        if (process.env.MONGO_DB_NAME === undefined && process.env.dbname) {
            console.warn('\n⚠️  WARNING: process.env.MONGO_DB_NAME is undefined in environment variables.');
            console.warn(`    Your .env file defines "dbname=${process.env.dbname}" instead of "MONGO_DB_NAME".`);
            console.warn(`    Because of this, MongoDB is connecting to the fallback database "${database.databaseName}", which is empty!`);

            console.log(`\n  Inspecting "${process.env.dbname}" directly to verify:`);
            const targetDb = client.db(process.env.dbname);
            const targetCollections = (await targetDb.listCollections().toArray()).map(c => c.name);
            console.log(`  Collections in "${process.env.dbname}":`, targetCollections);
            const targetCustomers = await targetDb.collection('customers').find({}, { projection: { _id: 0 } }).toArray();
            console.log(`  Customers count in "${process.env.dbname}": ${targetCustomers.length}`);
            if (targetCustomers.length > 0) {
                console.log('  Customer IDs found in correct DB:', targetCustomers.map(c => c.customerId));
            }
        }

        // 2. Test getAllCustomers()
        console.log('\n[2] Testing getAllCustomers():');
        const allCustomers = await getAllCustomers();
        console.log(`  Total customers found: ${allCustomers.length}`);
        if (allCustomers.length > 0) {
            console.log('  Available customer IDs:', allCustomers.map(c => c.customerId));
            console.log('  Sample customer:', allCustomers[0]);
        }

        // 3. Test getCustomerById()
        console.log('\n[3] Testing getCustomerById():');
        const targetId = 'C002';
        const customer = await getCustomerById(targetId);
        console.log(`  getCustomerById('${targetId}'):`, customer);

        if (!customer && allCustomers.length > 0) {
            console.log(`  Target '${targetId}' was not found, but trying first existing customer:`);
            const firstExisting = await getCustomerById(allCustomers[0].customerId);
            console.log(`  getCustomerById('${allCustomers[0].customerId}'):`, firstExisting);
        }

        // 4. Test getAllServices() and getServiceById()
        console.log('\n[4] Testing Services:');
        const allServices = await getAllServices();
        console.log(`  Total services found: ${allServices.length}`);
        if (allServices.length > 0) {
            console.log('  Sample service:', allServices[0]);
            const service = await getServiceById(allServices[0].serviceId);
            console.log(`  getServiceById('${allServices[0].serviceId}'):`, service);
        }

        // 5. Test getAllOrders(), getOrderById(), and getOrdersByCustomerId()
        console.log('\n[5] Testing Orders:');
        const allOrders = await getAllOrders();
        console.log(`  Total orders found: ${allOrders.length}`);
        if (allOrders.length > 0) {
            console.log('  Sample order:', allOrders[0]);
            const order = await getOrderById(allOrders[0].orderId);
            console.log(`  getOrderById('${allOrders[0].orderId}'):`, order);

            const customerOrders = await getOrdersByCustomerId(allOrders[0].customerId);
            console.log(`  getOrdersByCustomerId('${allOrders[0].customerId}'): count = ${customerOrders.length}`);
        }

    } catch (error) {
        console.error('\n❌ Persistence Test Error:', error);
    } finally {
        if (client) {
            await client.close();
            console.log('\n--- Database connection closed. Tests complete. ---');
        }
    }
}

//testPersistence();