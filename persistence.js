import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';

dotenv.config();

// Load environment variables
const uri = process.env.MONGO_URI
const dbName = process.env.MONGO_DB_NAME || process.env.dbname || process.env.DB_NAME 

// Global variables for caching the client and database connection
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