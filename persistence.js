import { MongoClient, ObjectId } from 'mongodb';
import dotenv from 'dotenv';
import dns from "dns";

dns.setServers(["8.8.8.8", "8.8.4.4"]);

dotenv.config({ path: ['.env'] });

// Load environment variables safely inside getDatabase
let client;
let db;

/**
 * Helper to convert string IDs to MongoDB ObjectId when valid.
 * @param {string|ObjectId} id - The ID to convert.
 * @returns {ObjectId|string} The converted ObjectId or original value.
 */
function toObjectId(id) {
    if (id instanceof ObjectId) {
        return id;
    }
    if (typeof id === 'string' && ObjectId.isValid(id)) {
        return new ObjectId(id);
    }
    return id;
}

/**
 * Connects to MongoDB and caches the database instance.
 * Returns the cached database connection on subsequent calls.
 * @returns {Promise<import('mongodb').Db>} The MongoDB database instance.
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
 * Finds a single customer by _id.
 * @param {string|ObjectId} customerId - The customer's MongoDB _id.
 * @returns {Promise<object|null>} The customer document, or null if not found.
 */
export async function getCustomerById(customerId) {
    const database = await getDatabase();
    const customer = await database.collection('customers').findOne(
        { _id: toObjectId(customerId) }
    );
    return customer;
}
export const getCustomer = getCustomerById;

/**
 * Finds a single customer by phone number.
 * @param {string} phone - The customer's phone number.
 * @returns {Promise<object|null>} The customer document, or null if not found.
 */
export async function getCustomerByPhone(phone) {
    const database = await getDatabase();
    const customer = await database.collection('customers').findOne(
        { phone: phone }
    );
    return customer;
}

/**
 * Retrieves all customers from the database.
 * @returns {Promise<Array<object>>} A list of all customer documents.
 */
export async function getAllCustomers() {
    const database = await getDatabase();
    const customers = await database.collection('customers')
        .find({})
        .toArray();
    return customers;
}
export const getCustomers = getAllCustomers;

/**
 * Retrieves all laundry services.
 * @returns {Promise<Array<object>>} A list of all service documents.
 */
export async function getAllServices() {
    const database = await getDatabase();
    const services = await database.collection('services')
        .find({})
        .toArray();
    return services;
}
export const getServices = getAllServices;

/**
 * Finds a single service by _id.
 * @param {string|ObjectId} serviceId - The service's MongoDB _id.
 * @returns {Promise<object|null>} The service document, or null if not found.
 */
export async function getServiceById(serviceId) {
    const database = await getDatabase();
    const service = await database.collection('services').findOne(
        { _id: toObjectId(serviceId) }
    );
    return service;
}
export const getService = getServiceById;

/**
 * Retrieves all orders.
 * Converts cursor to array using .toArray().
 * @returns {Promise<Array<object>>} A list of all order documents.
 */
export async function getAllOrders() {
    const database = await getDatabase();
    const orders = await database.collection('orders')
        .find({})
        .toArray();
    return orders;
}
export const getOrders = getAllOrders;

/**
 * Finds a single order by _id.
 * @param {string|ObjectId} orderId - The order's MongoDB _id.
 * @returns {Promise<object|null>} The order document, or null if not found.
 */
export async function getOrderById(orderId) {
    const database = await getDatabase();
    const order = await database.collection('orders').findOne(
        { _id: toObjectId(orderId) }
    );
    return order;
}
export const getOrderDetails = getOrderById;

/**
 * Finds all orders belonging to a specific customer _id.
 * @param {string|ObjectId} customerId - The customer's MongoDB _id.
 * @returns {Promise<Array<object>>} A list of matching order documents.
 */
export async function getOrdersByCustomerId(customerId) {
    const database = await getDatabase();
    const orders = await database.collection('orders')
        .find({ customerId: toObjectId(customerId) })
        .toArray();
    return orders;
}

/**
 * Updates the status of a single order by _id.
 * @param {string|ObjectId} orderId - The order's MongoDB _id.
 * @param {string} newStatus - The new order status.
 * @returns {Promise<boolean>} True if the document was modified, false otherwise.
 */
export async function updateOrderStatus(orderId, newStatus) {
    const database = await getDatabase();
    const result = await database.collection('orders').updateOne(
        { _id: toObjectId(orderId) },
        { $set: { status: newStatus } }
    );
    return result.modifiedCount > 0;
}

/**
 * Inserts a new order document into MongoDB.
 * @param {object} newOrder - The order document to insert.
 * @returns {Promise<boolean>} True if the insert was acknowledged.
 */
export async function saveOrder(newOrder) {
    const database = await getDatabase();
    const result = await database.collection('orders').insertOne(newOrder);
    return result.acknowledged;
}

/**
 * Finds a single customer by email address.
 * @param {string} email - The customer's email address.
 * @returns {Promise<object|null>} The customer document, or null if not found.
 */
export async function getCustomerByEmail(email) {
    const database = await getDatabase();
    const customer = await database.collection('customers').findOne(
        { email: email }
    );
    return customer;
}

/**
 * Finds a single staff user by email address from the staff_users collection.
 * @param {string} email - The staff user's email address.
 * @returns {Promise<object|null>} The staff user document, or null if not found.
 */
export async function getStaffUserByEmail(email) {
    const database = await getDatabase();
    const staffUser = await database.collection('staff_users').findOne(
        { email: email }
    );
    return staffUser;
}

/**
 * Saves a new session document in the sessions collection in MongoDB.
 * @param {object} sessionData - The session object to persist.
 * @returns {Promise<object>} The saved session object.
 */
export async function saveSession(sessionData) {
    const database = await getDatabase();
    await database.collection('sessions').insertOne(sessionData);
    return sessionData;
}

/**
 * Retrieves a session document by its sessionKey.
 * @param {string} sessionKey - The unique session identifier.
 * @returns {Promise<object|null>} The session document, or null if not found.
 */
export async function getSession(sessionKey) {
    const database = await getDatabase();
    const session = await database.collection('sessions').findOne(
        { sessionKey: sessionKey }
    );
    return session;
}

/**
 * Deletes a session document by its sessionKey.
 * @param {string} sessionKey - The unique session identifier to delete.
 * @returns {Promise<void>}
 */
export async function deleteSession(sessionKey) {
    const database = await getDatabase();
    await database.collection('sessions').deleteOne(
        { sessionKey: sessionKey }
    );
}

/**
 * Updates the expiry time of a session document by its sessionKey.
 * @param {string} sessionKey - The unique session identifier.
 * @param {Date} newExpiry - The updated expiration timestamp.
 * @returns {Promise<void>}
 */
export async function updateSessionExpiry(sessionKey, newExpiry) {
    const database = await getDatabase();
    await database.collection('sessions').updateOne(
        { sessionKey: sessionKey },
        { $set: { expiry: newExpiry } }
    );
}