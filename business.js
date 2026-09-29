import * as persistence from './persistence.js'

/**
 * Finds a customer by ID.
 * @param {string} customerId - The customer ID to search for.
 * @returns {Promise<object|null>} The customer object, or null if not found.
 */
export async function findCustomerById(customerId) {
    return await persistence.findCustomer(customerId)
}

/**
 * Finds a laundry service by ID.
 * @param {string} serviceId - The service ID to search for.
 * @returns {Promise<object|null>} The service object, or null if not found.
 */
export async function findServiceById(serviceId) {
    return await persistence.findService(serviceId)
}

/**
 * Finds an order by ID.
 * @param {string} orderId - The order ID to search for.
 * @returns {Promise<object|null>} The order object, or null if not found.
 */
export async function findOrderById(orderId) {
    return await persistence.findOrder(orderId)
}

/**
 * Checks whether an order exists and returns it.
 * @param {string} orderId - The order ID to search for.
 * @returns {Promise<object|null>} The order object, or null if not found.
 */
export async function checkOrder(orderId) {
    return await persistence.findOrder(orderId)
}

/**
 * Returns all available laundry services.
 * @returns {Promise<Array<object>>} The list of laundry services.
 */
export async function showLaundryServices() {
    return await persistence.findAllServices()
}

/**
 * Applies pricing rules to a list of items.
 * @param {Array<object>} items - The order items containing serviceId and quantity.
 * @returns {Promise<object>} An object with items, servicesTotal, minimumOrderAdjustment, deliveryFee, and totalAmount.
 */
async function calculateTotals(items) {
    const rates = persistence.getRates()
    const detailedItems = []
    let servicesTotal = 0

    for (const item of items) {
        const service = await persistence.findService(item.serviceId)
        if (service) {
            const lineTotal = service.price * item.quantity
            servicesTotal += lineTotal
            detailedItems.push({
                serviceId: service.serviceId,
                name: service.name,
                unit: service.unit,
                price: service.price,
                quantity: item.quantity,
                lineTotal: lineTotal
            })
        }
    }

    const minimumOrderAdjustment = servicesTotal < rates.MINIMUM_ORDER_CHARGE
        ? rates.MINIMUM_ORDER_CHARGE - servicesTotal
        : 0

    const adjustedServiceCharge = servicesTotal + minimumOrderAdjustment

    const deliveryFee = servicesTotal < rates.FREE_DELIVERY_THRESHOLD
        ? rates.DELIVERY_CHARGE
        : 0

    const totalAmount = adjustedServiceCharge + deliveryFee

    return {
        items: detailedItems,
        servicesTotal: servicesTotal,
        minimumOrderAdjustment: minimumOrderAdjustment,
        deliveryFee: deliveryFee,
        totalAmount: totalAmount
    }
}

/**
 * Returns a customer's orders with calculated totals.
 * @param {string} customerId - The customer ID whose orders should be returned.
 * @returns {Promise<object|string>} An object with customerName and orders, or an error message.
 */
export async function viewCustomerOrders(customerId) {
    const customer = await persistence.findCustomer(customerId)
    if (!customer) {
        return 'Customer not found.'
    }

    const customerOrders = await persistence.findOrdersByCustomer(customerId)
    const result = []

    for (const order of customerOrders) {
        const totals = await calculateTotals(order.items)
        result.push({
            orderId: order.orderId,
            orderDate: order.orderDate,
            status: order.status,
            total: totals.totalAmount
        })
    }

    return { customerName: customer.name, orders: result }
}

/**
 * Advances an order to a valid new status.
 * @param {object} targetOrder - The order to update.
 * @param {string} newStatus - The desired new status.
 * @returns {Promise<boolean|string>} True on success, or an error message.
 */
export async function updateOrderStatus(targetOrder, newStatus) {
    const statusSequence = ['Received', 'Washing', 'Ready', 'Delivered']
    let currentIndex = -1
    let newIndex = -1

    for (const [index, status] of statusSequence.entries()) {
        if (status === targetOrder.status) {
            currentIndex = index
        }
        if (status === newStatus) {
            newIndex = index
        }
    }

    if (currentIndex === -1) {
        return 'Current status is invalid.'
    }
    if (newIndex === -1) {
        return 'New status is invalid.'
    }
    if (newIndex <= currentIndex) {
        return 'Invalid status transition. Please follow the correct sequence.'
    }

    targetOrder.status = newStatus
    await persistence.updateOrder(targetOrder)
    return true
}

/**
 * Creates and saves a new customer order.
 * @param {string} customerId - The customer placing the order.
 * @param {Array<object>} serviceArray - The selected services with price and quantity.
 * @returns {Promise<object>} An object with nextOrderId and orderTotal.
 */
export async function createNewOrder(customerId, serviceArray) {
    const nextOrderId = await persistence.generateOrderId()
    const orderDate = new Date().toISOString().split('T')[0]
    const status = 'Received'

    const items = []
    for (const service of serviceArray) {
        items.push({
            serviceId: service.serviceId,
            quantity: service.quantity
        })
    }

    const newOrder = {
        orderId: nextOrderId,
        customerId: customerId,
        orderDate: orderDate,
        status: status,
        items: items
    }

    await persistence.createOrder(newOrder)

    const totals = await calculateTotals(items)

    return { nextOrderId, orderTotal: totals.totalAmount }
}

/**
 * Generates invoice details including item breakdowns, fees, and grand total.
 * @param {string} orderId - The order ID to invoice.
 * @returns {Promise<object|string>} An invoice object, or an error message.
 */
export async function viewInvoice(orderId) {
    const order = await persistence.findOrder(orderId)
    if (!order) {
        return 'Order not found.'
    }

    const customer = await persistence.findCustomer(order.customerId)
    if (!customer) {
        return 'Customer not found.'
    }

    const totals = await calculateTotals(order.items)

    return {
        orderId: order.orderId,
        customerName: customer.name,
        orderDate: order.orderDate,
        status: order.status,
        items: totals.items,
        servicesTotal: totals.servicesTotal,
        minimumOrderAdjustment: totals.minimumOrderAdjustment,
        deliveryFee: totals.deliveryFee,
        totalAmount: totals.totalAmount
    }
}