import * as persistence from './persistence.js'
import dotenv from 'dotenv'

dotenv.config()

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
 * Get customer information and their associated orders
 */
export async function getCustomerInformation(cid) {
    let customer = await persistence.getCustomerById(cid)
    if (!customer) {
        return null
    }
    let orders = await persistence.getOrdersByCustomerId(cid)
    for (let ord of orders) {
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

/**
 * Get a customer by customerId
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
    return await persistence.getAllOrders()
}
export const getOrders = getAllOrders

/**
 * Get order details by orderId
 */
export async function getOrderDetails(oid) {
    return await persistence.getOrderById(oid)
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
        pricedItems.push({ ...item, price: service.price })
    }
    let totals = computeSubTotals(pricedItems)
    let today = new Date()
    let orderDate = today.toISOString().substring(0, 10)

    const allOrders = await persistence.getAllOrders()
    let maxId = 0
    for (const o of allOrders) {
        if (o.orderId && o.orderId.startsWith('O')) {
            const num = parseInt(o.orderId.substring(1), 10)
            if (!isNaN(num) && num > maxId) maxId = num
        }
    }
    const orderId = `O${String(maxId + 1).padStart(3, '0')}`

    let order = {
        orderId: orderId,
        customerId: customerId,
        orderDate: orderDate,
        status: 'Received',
        items: orderItems,
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
        subTotal += it.quantity*it.price
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
            lineTotal: it.quantity*service.price
        })
    }
    let totals = computeSubTotals(serviceItems)
    return {
        order: orderDetails.orderId,
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
