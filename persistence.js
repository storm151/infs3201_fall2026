import * as fs from 'fs/promises'
import * as dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const configuration = {
    env: path.resolve(__dirname, '.env'),
    customers: path.resolve(__dirname, 'customers.json'),
    services: path.resolve(__dirname, 'services.json'),
    orders: path.resolve(__dirname, 'orders.json')
}

/**
 * Loads the .env file into process.env once at startup.
 * Missing values default to zero.
 */
export function loadConfiguration() {
    dotenv.config({ path: configuration.env })
}

/**
 * Returns the pricing rates from the environment.
 * @returns {object} An object with MINIMUM_ORDER_CHARGE, FREE_DELIVERY_THRESHOLD, and DELIVERY_CHARGE.
 */
export function getRates() {
    return {
        MINIMUM_ORDER_CHARGE: Number(process.env.MINIMUM_ORDER_CHARGE) || 0,
        FREE_DELIVERY_THRESHOLD: Number(process.env.FREE_DELIVERY_THRESHOLD) || 0,
        DELIVERY_CHARGE: Number(process.env.DELIVERY_CHARGE) || 0
    }
}

/**
 * Reads and parses a JSON file.
 * @param {string} filePath - The path to the JSON file.
 * @returns {Promise<any>} The parsed JSON contents.
 */
async function readJsonFile(filePath) {
    const fileContents = await fs.readFile(filePath, 'utf8')
    return JSON.parse(fileContents)
}

/**
 * Writes data to a JSON file.
 * @param {string} filePath - The path to the JSON file.
 * @param {any} data - The data to serialize.
 * @returns {Promise<void>} Resolves when the write completes.
 */
async function writeJsonFile(filePath, data) {
    await fs.writeFile(filePath, JSON.stringify(data, null, 4))
}

/**
 * Finds a customer by ID.
 * @param {string} customerId - The customer ID to search for.
 * @returns {Promise<object|null>} The customer object, or null if not found.
 */
export async function findCustomer(customerId) {
    const customers = await readJsonFile(configuration.customers)
    for (const customer of customers) {
        if (customer.customerId === customerId) {
            return customer
        }
    }
    return null
}

/**
 * Finds a laundry service by ID.
 * @param {string} serviceId - The service ID to search for.
 * @returns {Promise<object|null>} The service object, or null if not found.
 */
export async function findService(serviceId) {
    const services = await readJsonFile(configuration.services)
    for (const service of services) {
        if (service.serviceId === serviceId) {
            return service
        }
    }
    return null
}

/**
 * Returns all laundry services.
 * @returns {Promise<Array<object>>} The list of services.
 */
export async function findAllServices() {
    return await readJsonFile(configuration.services)
}

/**
 * Finds an order by ID.
 * @param {string} orderId - The order ID to search for.
 * @returns {Promise<object|null>} The order object, or null if not found.
 */
export async function findOrder(orderId) {
    const orders = await readJsonFile(configuration.orders)
    for (const order of orders) {
        if (order.orderId === orderId) {
            return order
        }
    }
    return null
}

/**
 * Finds all orders belonging to a customer.
 * @param {string} customerId - The customer ID whose orders should be returned.
 * @returns {Promise<Array<object>>} The list of orders for the customer.
 */
export async function findOrdersByCustomer(customerId) {
    const orders = await readJsonFile(configuration.orders)
    const result = []
    for (const order of orders) {
        if (order.customerId === customerId) {
            result.push(order)
        }
    }
    return result
}

/**
 * Appends a new order to the orders file.
 * @param {object} order - The order object to save.
 * @returns {Promise<void>} Resolves when the order is saved.
 */
export async function createOrder(order) {
    const orders = await readJsonFile(configuration.orders)
    orders.push(order)
    await writeJsonFile(configuration.orders, orders)
}

/**
 * Updates an existing order in the orders file.
 * @param {object} order - The order object to update.
 * @returns {Promise<void>} Resolves when the order is updated.
 */
export async function updateOrder(order) {
    const orders = await readJsonFile(configuration.orders)
    for (let i = 0; i < orders.length; i++) {
        if (orders[i].orderId === order.orderId) {
            orders[i] = order
            break
        }
    }
    await writeJsonFile(configuration.orders, orders)
}

/**
 * Generates the next order ID based on existing orders.
 * @returns {Promise<string>} The next order ID.
 */
export async function generateOrderId() {
    const orders = await readJsonFile(configuration.orders)
    let maxNumber = 0

    for (const order of orders) {
        const numericPart = parseInt(order.orderId, 10)
        if (!isNaN(numericPart) && numericPart > maxNumber) {
            maxNumber = numericPart
        }
    }

    const nextNumber = maxNumber + 1
    return String(nextNumber).padStart(4, '0')
}