import * as persistence from './persistence.js'

/** Finds a customer by ID. */
export async function findCustomerById(customerId) {
    const customers = await persistence.readJsonFile('customers.json')
    for (const customer of customers) {
        if (customer.customerId === customerId) {
            return customer
        }
    }
    return null
}

/** Finds a laundry service by ID. */
export async function findServiceById(serviceId) {
    const services = await persistence.readJsonFile('services.json')
    for (const service of services) {
        if (service.serviceId === serviceId) {
            return service
        }
    }
    return null
}

/** Finds an order by ID. */
export async function findOrderById(orderId) {
    const orders = await persistence.readJsonFile('orders.json')
    for (const order of orders) {
        if (order.orderId === orderId) {
            return order
        }
    }
    return null
}

/** Checks whether an order exists and returns it. */
export async function checkOrder(orderId) {
    const orders = await persistence.readJsonFile('orders.json')
    for (const order of orders) {
        if (order.orderId === orderId) {
            return order
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

    for (const order of orders) {
        if (order.customerId !== customerId) {
            continue
        }

        let orderTotal = 0
        for (const item of order.items) {
            for (const service of services) {
                if (service.serviceId === item.serviceId) {
                    orderTotal += service.price * item.quantity
                }
            }
        }

        // NOTE: these pricing rules look suspicious — see note below.
        if (orderTotal < 25) {
            orderTotal = 25
        }
        if (orderTotal < 50) {
            orderTotal += 10
        }

        customerOrders.push({
            orderId: order.orderId,
            orderDate: order.orderDate,
            status: order.status,
            total: orderTotal
        })
    }

    return customerOrders
}

/** Advances an order to a valid new status. */
export async function updateOrderStatus(targetOrder, newStatus) {
    const orders = await persistence.readJsonFile('orders.json')

    const statusSequence = ['Received', 'Washing', 'Ready', 'Delivered']
    let currentIndex = -1
    let newIndex = -1

    // for...of with index via entries() so we still know the position
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

    for (const order of orders) {
        if (order.orderId === targetOrder.orderId) {
            order.status = newStatus
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

    // Original code was buggy: `parseInt(ordersData[order].orderId...)` used the
    // index as a key and `order` was an implicit global. Fixed here.
    for (const order of ordersData) {
        const numericPart = parseInt(order.orderId.substring(1))
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

    for (const service of serviceArray) {
        orderTotal += service.price * service.quantity

        items.push({
            serviceId: service.serviceId,
            quantity: service.quantity
        })
    }

    // NOTE: pricing rules were previously applied *inside* the loop, which
    // caused them to be applied repeatedly and inconsistently. Moved outside
    // so the total matches viewCustomerOrders().
    if (orderTotal < 25) {
        orderTotal = 25
    }
    if (orderTotal < 50) {
        orderTotal += 10
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

/* Generates invoice details including item breakdowns, fees, and grand total. */
export async function viewInvoice(orderId) {
    const order = await findOrderById(orderId)

    if (!order) {
        return 'Order not found.'
    }

    let customer = await findCustomerById(order.customerId)

    const invoice = {
        orderId: order.orderId, 
        customerName: customer.name,
        orderDate: order.orderDate, 
        status: order.status, 
        items: [],
        servicesTotal: 0,
        minimumOrderFee: 0,
        deliveryFee: 0,
        totalAmount: 0
    }

    let servicesTotal = 0

    for (const item of order.items) {
        const service = await findServiceById(item.serviceId)
        if (service) {
            const lineTotal = service.price * item.quantity
            servicesTotal += lineTotal

            invoice.items.push({
                serviceId: service.serviceId,
                name: service.name,
                unit: service.unit,
                price: service.price,
                quantity: item.quantity,
                lineTotal: lineTotal
            })
        }
    }

    let minimumOrderFee = 0
    if (servicesTotal < 25) {
        minimumOrderFee = 25 - servicesTotal
    } else {
        minimumOrderFee = 0
    }

    let deliveryFee = 0
    if (servicesTotal < 50) {
        deliveryFee = 10
    } else {
        deliveryFee = 0
    }

    const totalAmount = servicesTotal + minimumOrderFee + deliveryFee

    invoice.servicesTotal = servicesTotal
    invoice.minimumOrderFee = minimumOrderFee
    invoice.deliveryFee = deliveryFee
    invoice.totalAmount = totalAmount

    return invoice
}
