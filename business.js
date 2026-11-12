import * as persistence from './persistence.js'
import dotenv from 'dotenv'
import crypto from 'crypto'

dotenv.config({ path: ['.env', 'env.exmple'] })

/**
 * Helper to verify a plain-text password against a stored password (plain or SHA-256 hashed).
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
 * If valid, starts a session in MongoDB with a fixed 10-minute expiry time.
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

    // Fixed 10-minute expiry time (10 * 60 * 1000 ms)
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
 * If the session does not exist or has passed its fixed 10-minute expiry, deletes it and returns null.
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
 * Get all services
 * @returns A list of Objects
 */
export async function getServices() {
    return await persistence.getAllServices()
}
export const getAllServices = getServices

/**
 * Get a single service by serviceId
 */
export async function getService(serviceId) {
    return await persistence.getServiceById(serviceId)
}
export const getServiceById = getService

/**
 * Get customer information and their associated orders by phone number
 */
export async function getCustomerInformation(phone) {
    let customer = await persistence.getCustomerByPhone(phone)
    if (!customer) {
        return null
    }
    let orders = await persistence.getOrdersByCustomerId(customer._id)
    for (let ord of orders) {
        ord.orderId = ord.orderId || String(ord._id)
        ord.order = ord.orderId
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
 * Get customer information and their associated orders by customer _id
 */
export async function getCustomerInformationById(customerId) {
    let customer = await persistence.getCustomerById(customerId)
    if (!customer) {
        return null
    }
    let orders = await persistence.getOrdersByCustomerId(customer._id)
    for (let ord of orders) {
        ord._id = String(ord._id)
        ord.orderId = ord.orderId || String(ord._id)
        ord.order = ord.orderId
        ord.date = ord.orderDate
        if (ord.total === undefined) {
            ord.total = await computeOrderTotal(ord.items || [])
        }
    }
    customer.orders = orders
    return customer
}

/**
 * Get a customer by phone number
 */
export async function getCustomerByPhone(phone) {
    return await persistence.getCustomerByPhone(phone)
}

/**
 * Get a customer by customerId (_id)
 */
export async function getCustomerById(cid) {
    return await persistence.getCustomerById(cid)
}

/**
 * Get all customers
 */
export async function getAllCustomers() {
    return await persistence.getAllCustomers()
}
export const getCustomers = getAllCustomers

/**
 * Get all orders
 */
export async function getAllOrders() {
    const orders = await persistence.getAllOrders()
    for (const ord of orders) {
        ord.orderId = ord.orderId || String(ord._id)
    }
    return orders
}
export const getOrders = getAllOrders

/**
 * Get order details by orderId (_id)
 */
export async function getOrderDetails(oid) {
    const order = await persistence.getOrderById(oid)
    if (order) {
        order.orderId = order.orderId || String(order._id)
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
 * Interact with the customer to create a new order then save it to the storage.
 * @returns 
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
    const resolvedOrderId = orderDetails.orderId || String(orderDetails._id)
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