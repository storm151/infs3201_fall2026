import * as persistence from './persistence.js'
import dotenv from 'dotenv'
import crypto from 'crypto'

dotenv.config({ path: ['.env'] })

/**
 * Helper to verify a plain-text password against a stored password (plain or SHA-256 hashed).
 * @param {string} inputPassword - The plain-text password entered by the user.
 * @param {string} storedPassword - The password stored in the database.
 * @returns {boolean} True if the password matches, false otherwise.
 */
function verifyPassword(inputPassword, storedPassword) {
    if (!inputPassword || !storedPassword) {
        return false
    }
    if (storedPassword === inputPassword) {
        return true
    }
    const hashedInput = crypto.createHash('sha256').update(inputPassword).digest('hex')
    return storedPassword === hashedInput
}

/**
 * Authenticate a user by checking both staff_users and customers collections.
 * If valid, starts a session in MongoDB with an initial 10-minute expiry time (sliding window).
 * @param {string} email
 * @param {string} password
 * @returns {Promise<object|null>} Session object if valid, or null if invalid.
 */
export async function login(email, password) {
    if (!email || !password) {
        return null
    }

    let user = null
    let userType = null

    // 1. Check staff_users collection
    const staffUser = await persistence.getStaffUserByEmail(email)
    if (staffUser && verifyPassword(password, staffUser.password)) {
        user = staffUser
        userType = 'staff'
    }

    // 2. Check customers collection if not matched in staff_users
    if (!user) {
        const customer = await persistence.getCustomerByEmail(email)
        if (customer && verifyPassword(password, customer.password)) {
            user = customer
            userType = 'customer'
        }
    }

    if (!user) {
        return null
    }

    // Initial 10-minute expiry time (10 * 60 * 1000 ms), extended on activity
    const sessionKey = crypto.randomUUID()
    const expiry = new Date(Date.now() + 10 * 60 * 1000)

    const sessionData = {
        sessionKey: sessionKey,
        expiry: expiry,
        userType: userType,
        data: {
            userId: user._id,
            email: user.email,
            name: user.name || user.email,
            userType: userType
        }
    }

    await persistence.saveSession(sessionData)
    return sessionData
}
export const authenticateUser = login

/**
 * Retrieve an active session by sessionKey.
 * If the session does not exist or has passed its expiry, deletes it and returns null.
 * If valid, extends the session expiry by 10 minutes (sliding window).
 * @param {string} sessionKey
 * @returns {Promise<object|null>}
 */
export async function getSession(sessionKey) {
    if (!sessionKey) {
        return null
    }
    const session = await persistence.getSession(sessionKey)
    if (!session) {
        return null
    }
    if (new Date() > new Date(session.expiry)) {
        await persistence.deleteSession(sessionKey)
        return null
    }

    // Sliding 10-minute window: extend expiry by 10 minutes from now
    const newExpiry = new Date(Date.now() + 10 * 60 * 1000)
    session.expiry = newExpiry
    await persistence.updateSessionExpiry(sessionKey, newExpiry)

    return session
}

/**
 * Terminate a session by sessionKey.
 * @param {string} sessionKey
 */
export async function logout(sessionKey) {
    if (sessionKey) {
        await persistence.deleteSession(sessionKey)
    }
}

/**
 * Get all services.
 * @returns {Promise<Array<object>>} A list of service objects.
 */
export async function getServices() {
    return await persistence.getAllServices()
}
export const getAllServices = getServices

/**
 * Get a single service by its MongoDB _id.
 * @param {string|object} serviceId - The service _id.
 * @returns {Promise<object|null>} The service document, or null if not found.
 */
export async function getService(serviceId) {
    return await persistence.getServiceById(serviceId)
}
export const getServiceById = getService

/**
 * Get customer information and their associated orders by phone number.
 * @param {string} phone - The customer's phone number.
 * @returns {Promise<object|null>} The customer object with an attached orders array, or null if not found.
 */
export async function getCustomerInformation(phone) {
    let customer = await persistence.getCustomerByPhone(phone)
    if (!customer) {
        return null
    }
    let orders = await persistence.getOrdersByCustomerId(customer._id)
    for (let ord of orders) {
        ord._id = String(ord._id)
        ord.date = ord.orderDate
        if (ord.total === undefined) {
            ord.total = await computeOrderTotal(ord.items || [])
        }
    }
    customer.orders = orders
    return customer
}
export const getCustomer = getCustomerInformation
export const getCustomerInformationByPhone = getCustomerInformation

/**
 * Get customer information and their associated orders by customer _id.
 * @param {string|object} customerId - The customer's MongoDB _id.
 * @returns {Promise<object|null>} The customer object with an attached orders array, or null if not found.
 */
export async function getCustomerInformationById(customerId) {
    let customer = await persistence.getCustomerById(customerId)
    if (!customer) {
        return null
    }
    let orders = await persistence.getOrdersByCustomerId(customer._id)
    for (let ord of orders) {
        ord._id = String(ord._id)
        ord.date = ord.orderDate
        if (ord.total === undefined) {
            ord.total = await computeOrderTotal(ord.items || [])
        }
    }
    customer.orders = orders
    return customer
}

/**
 * Get a customer by phone number.
 * @param {string} phone - The customer's phone number.
 * @returns {Promise<object|null>} The customer document, or null if not found.
 */
export async function getCustomerByPhone(phone) {
    return await persistence.getCustomerByPhone(phone)
}

/**
 * Get a customer by their MongoDB _id.
 * @param {string|object} cid - The customer's _id.
 * @returns {Promise<object|null>} The customer document, or null if not found.
 */
export async function getCustomerById(cid) {
    return await persistence.getCustomerById(cid)
}

/**
 * Get all customers.
 * @returns {Promise<Array<object>>} A list of all customer documents.
 */
export async function getAllCustomers() {
    return await persistence.getAllCustomers()
}
export const getCustomers = getAllCustomers

/**
 * Get all orders with stringified _id values.
 * @returns {Promise<Array<object>>} A list of all order documents.
 */
export async function getAllOrders() {
    const orders = await persistence.getAllOrders()
    for (const ord of orders) {
        ord._id = String(ord._id)
    }
    return orders
}
export const getOrders = getAllOrders

/**
 * Get order details by MongoDB _id.
 * @param {string|object} oid - The order's _id.
 * @returns {Promise<object|null>} The order document, or null if not found.
 */
export async function getOrderDetails(oid) {
    const order = await persistence.getOrderById(oid)
    if (order) {
        order._id = String(order._id)
    }
    return order
}
export const getOrderById = getOrderDetails

/**
 * Attempt to update the order status to a new status level following the ordering rules. 
 * The newly updated state will be written to the database if the state change is allowed.
 * 
 * @param {*} oid Order ID
 * @param {*} newStatus The new state that we would like to switch to.
 * @returns true if the operation is successful, false otherwise
 */
export async function updateOrderStatus(oid, newStatus) {
    let statusList = ['Received', 'Washing', 'Ready', 'Delivered']
    let order = await persistence.getOrderById(oid)
    if (!order) {
        return false
    }
    let currentPos = statusList.indexOf(order.status)
    let newPos = statusList.indexOf(newStatus)
    if (newPos === -1 || newPos <= currentPos) {
        return false
    }
    await persistence.updateOrderStatus(oid, newStatus)
    return true
}

/**
 * Compute the total price in QAR for an array of order items, applying minimum order and delivery charges.
 * @param {Array<{serviceId: string|object, quantity: number}>} orderItems - The items in the order.
 * @returns {Promise<number>} The total order amount in QAR.
 */
async function computeOrderTotal(orderItems) {
    let total = 0
    for (let item of orderItems) {
        let service = await persistence.getServiceById(item.serviceId)
        if (service) {
            total += service.price * item.quantity
        }
    }
    if (total < 25) {
        total = 25
    }

    let delivery = 10
    if (total > 50) {
        delivery = 0
    }
    total += delivery
    return total
}

/**
 * Create a new order for a customer and save it to MongoDB.
 * @param {string|object} customerId - The customer's MongoDB _id.
 * @param {Array<{serviceId: string|object, quantity: number}>} orderItems - The items to include in the order.
 * @returns {Promise<object|null>} The newly created order object, or null if customer or service is invalid.
 */
export async function createNewOrder(customerId, orderItems) {
    let customer = await persistence.getCustomerById(customerId)
    if (!customer) {
        return null
    }

    const pricedItems = []
    for (const item of orderItems) {
        const service = await persistence.getServiceById(item.serviceId)
        if (!service) return null
        pricedItems.push({ ...item, serviceId: service._id, price: service.price })
    }
    let totals = computeSubTotals(pricedItems)
    let today = new Date()
    let orderDate = today.toISOString().substring(0, 10)

    let order = {
        customerId: customer._id,
        orderDate: orderDate,
        status: 'Received',
        items: orderItems.map(item => ({ ...item, serviceId: pricedItems.find(p => String(p.serviceId) === String(item.serviceId))?.serviceId ?? item.serviceId })),
        total: totals.total
    }
    await persistence.saveOrder(order)
    return order
}

/**
 * Compute subtotal, minimum order adjustment, delivery charge, and grand total for priced order items.
 * @param {Array<{quantity: number, price: number}>} items - Priced items in the order.
 * @returns {{subTotal: number, minOrderAdjustment: number, deliveryCharge: number, total: number}} Calculated totals breakdown.
 */
function computeSubTotals(items) {
    const minimum_charge = Number(process.env.MINIMUM_ORDER_CHARGE) || 0
    const free_delivery_threshold = Number(process.env.FREE_DELIVERY_THRESHOLD) || 0
    const delivery_fee = Number(process.env.DELIVERY_CHARGE) || 0
    let subTotal = 0
    for (let it of items) {
        subTotal += it.quantity * it.price
    }
    let minOrderAdjustment = 0
    if (minimum_charge && subTotal < minimum_charge) {
        minOrderAdjustment = minimum_charge - subTotal
    }
    let deliveryCharge = delivery_fee
    if (subTotal > free_delivery_threshold) {
        deliveryCharge = 0
    }
    let total = subTotal + minOrderAdjustment + deliveryCharge

    return {
        subTotal,
        minOrderAdjustment,
        deliveryCharge,
        total
    }
}

/**
 * Generate a detailed invoice object for a given order _id.
 * @param {string|object} orderId - The order's MongoDB _id.
 * @returns {Promise<object|null>} The formatted invoice details, or null if the order does not exist.
 */
export async function generateInvoice(orderId) {
    let orderDetails = await persistence.getOrderById(orderId)
    if (!orderDetails) {
        return null
    }
    let customerDetails = await persistence.getCustomerById(orderDetails.customerId)
    let serviceItems = []
    for (let it of orderDetails.items) {
        let service = await persistence.getServiceById(it.serviceId)
        serviceItems.push({
            service: service.name,
            quantity: it.quantity,
            price: service.price,
            lineTotal: it.quantity * service.price
        })
    }
    let totals = computeSubTotals(serviceItems)
    const resolvedOrderId = String(orderDetails._id)
    return {
        order: resolvedOrderId,
        date: orderDetails.orderDate,
        data: orderDetails.orderDate,
        status: orderDetails.status,
        customer: customerDetails.name,
        serviceItems: serviceItems,
        subTotal: totals.subTotal,
        minimumAdjustment: totals.minOrderAdjustment,
        delivery: totals.deliveryCharge,
        total: totals.total
    }
}