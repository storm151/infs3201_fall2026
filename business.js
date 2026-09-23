import * as persistence from './persistence.js'

/** Finds a customer by ID. */
export async function findCustomerById(customerId) {
    const customers = await persistence.readJsonFile('customers.json')
    for (let i = 0; i < customers.length; i++) {
        if (customers[i].customerId === customerId) {
            return customers[i]
        }
    }
    return null
}

/** Finds a laundry service by ID. */
export async function findServiceById(serviceId) {
    const services = await persistence.readJsonFile('services.json')
    for (let i = 0; i < services.length; i++) {
        if (services[i].serviceId === serviceId) {
            return services[i]
        }
    }
    return null
}

/** Finds an order by ID. */
export async function findOrderById(orderId) {
    const orders = await persistence.readJsonFile('orders.json')
    for (let i = 0; i < orders.length; i++) {
        if (orders[i].orderId === orderId) {
            return orders[i]
        }
    }
    return null
}

/** Checks whether an order exists and returns it. */
export async function checkOrder(orderId) {
    const orders = await persistence.readJsonFile('orders.json')
    for (let i = 0; i < orders.length; i++) {
        if (orders[i].orderId === orderId) {
            return orders[i]
        }
    }
    return null
}

/** Returns all available laundry services. */
export async function showLaundryServices() {
    return await persistence.readJsonFile('services.json')
}

/** Returns a customer's orders with calculated totals. */
export async function viewCustomerOrders(customerId) {
    const orders = await persistence.readJsonFile('orders.json')
    const services = await persistence.readJsonFile('services.json')

    const customerOrders = []

    for (let i = 0; i < orders.length; i++) {
        const order = orders[i]
        if (order.customerId === customerId) {
            let orderTotal = 0
            for (let j = 0; j < order.items.length; j++) {
                const item = order.items[j]
                for (let k = 0; k < services.length; k++) {
                    if (services[k].serviceId === item.serviceId) {
                        orderTotal += services[k].price * item.quantity
                    }
                }
            }
            customerOrders.push({
                orderId: order.orderId,
                orderDate: order.orderDate,
                status: order.status,
                total: orderTotal
            })
        }
    }

    return customerOrders
}

/** Advances an order to a valid new status. */
export async function updateOrderStatus(targetOrder, newStatus) {
    const orders = await persistence.readJsonFile('orders.json')

    const statusSequence = ['Received', 'Washing', 'Ready', 'Delivered']
    let currentIndex = -1
    let newIndex = -1

    for (let i = 0; i < statusSequence.length; i++) {
        if (statusSequence[i] === targetOrder.status) {
            currentIndex = i
        }
        if (statusSequence[i] === newStatus) {
            newIndex = i
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

    for (let i = 0; i < orders.length; i++) {
        if (orders[i].orderId === targetOrder.orderId) {
            orders[i].status = newStatus
            break
        }
    }

    await persistence.writeJsonFile('orders.json', orders)
    return true
}

/** Creates and saves a new customer order. */
export async function createNewOrder(customerId, serviceArray) {
    const ordersData = await persistence.readJsonFile('orders.json')
    let maxNumber = 0

    for (let i = 0; i < ordersData.length; i++) {
        const numericPart = parseInt(ordersData[i].orderId.substring(1))
        if (numericPart > maxNumber) {
            maxNumber = numericPart
        }
    }

    const nextNumber = maxNumber + 1
    const nextOrderId = 'O' + String(nextNumber).padStart(3, '0')

    const orderDate = new Date().toISOString().split('T')[0]
    const status = 'Received'

    let orderTotal = 0
    const items = []

    for (let i = 0; i < serviceArray.length; i++) {
        const service = serviceArray[i]
        orderTotal += service.price * service.quantity
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

    ordersData.push(newOrder)
    await persistence.writeJsonFile('orders.json', ordersData)

    return { nextOrderId, orderTotal }
}