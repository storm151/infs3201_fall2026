const fs = require('fs').promises
const prompt = require('prompt-sync')()

/**
 * Reads and parses a JSON file asynchronously.
 *
 * @param {string} filePath The path to the JSON file.
 * @returns {Promise<Array|Object>} The parsed JSON data.
 */
async function readJsonFile(filePath) {
    const fileContents = await fs.readFile(filePath, 'utf8')
    return JSON.parse(fileContents)
}

/**
 * Writes data to a JSON file asynchronously.
 *
 * @param {string} filePath The path to the JSON file.
 * @param {Array|Object} data The data to stringify and write.
 * @returns {Promise<void>}
 */
async function writeJsonFile(filePath, data) {
    await fs.writeFile(filePath, JSON.stringify(data, null, 4))
}

/**
 * Finds a customer by their customer ID using a loop.
 *
 * @param {string} customerId The customer ID to search for.
 * @returns {Promise<Object|null>} The customer object or null if not found.
 */
async function findCustomerById(customerId) {
    const customers = await readJsonFile('customers.json')
    for (let i = 0; i < customers.length; i++) {
        if (customers[i].customerId === customerId) {
            return customers[i]
        }
    }
    return null
}

/**
 * Finds a service by its service ID using a loop.
 *
 * @param {string} serviceId The service ID to search for.
 * @returns {Promise<Object|null>} The service object or null if not found.
 */
async function findServiceById(serviceId) {
    const services = await readJsonFile('services.json')
    for (let i = 0; i < services.length; i++) {
        if (services[i].serviceId === serviceId) {
            return services[i]
        }
    }
    return null
}

/**
 * Finds an order by its order ID using a loop.
 *
 * @param {string} orderId The order ID to search for.
 * @returns {Promise<Object|null>} The order object or null if not found.
 */
async function findOrderById(orderId) {
    const orders = await readJsonFile('orders.json')
    for (let i = 0; i < orders.length; i++) {
        if (orders[i].orderId === orderId) {
            return orders[i]
        }
    }
    return null
}

/**
 * Displays all available laundry services in formatted columns.
 *
 * @returns {Promise<void>}
 */
async function showLaundryServices() {
    const services = await readJsonFile('services.json')
    console.log('Service ID  Service                    Unit      Price')
    console.log('----------  -------------------------  --------  --------')
    for (let i = 0; i < services.length; i++) {
        const service = services[i]
        const priceFormatted = service.price.toFixed(2)
        console.log(`${service.serviceId.padEnd(10)}  ${service.name.padEnd(25)}  ${service.unit.padEnd(8)}  ${priceFormatted.padStart(8)}`)
    }
}

/**
 * Displays all orders belonging to a specific customer along with calculated totals.
 *
 * @returns {Promise<void>}
 */
async function viewCustomerOrders() {
    const customerId = prompt('Enter customer ID: ')
    const customer = await findCustomerById(customerId)
    
    if (!customer) {
        console.log('Customer not found.')
        return
    }

    const orders = await readJsonFile('orders.json')
    const services = await readJsonFile('services.json')

    console.log(`Orders for ${customer.name}`)
    console.log('Order ID  Order Date    Status       Total')
    console.log('--------  ----------    ---------    --------')

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
            console.log(`${order.orderId.padEnd(8)}  ${order.orderDate.padEnd(10)}    ${order.status.padEnd(11)}  ${orderTotal.toFixed(2).padStart(8)}`)
        }
    }
}

/**
 * Updates the progression status of an existing order using forward sequence verification.
 *
 * @returns {Promise<void>}
 */
async function updateOrderStatus() {
    const orderId = prompt('Enter order ID: ')
    const orders = await readJsonFile('orders.json')
    
    let targetOrder = null
    for (let i = 0; i < orders.length; i++) {
        if (orders[i].orderId === orderId) {
            targetOrder = orders[i]
            break
        }
    }

    if (!targetOrder) {
        console.log('Order not found.')
        return
    }

    console.log(`Current status: ${targetOrder.status}`)
    const newStatus = prompt('Enter new status: ')

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

    if (newIndex === -1 || newIndex <= currentIndex) {
        console.log('New status not accepted')
        return
    }

    targetOrder.status = newStatus
    await writeJsonFile('orders.json', orders)
    console.log('Order status updated')
}

/**
 * Creates a new order for an existing customer and saves it to JSON storage.
 *
 * @returns {Promise<void>}
 */
async function createNewOrder() {
    const customerId = prompt('Enter customer ID: ')
    const customer = await findCustomerById(customerId)

    if (!customer) {
        console.log('Customer not found.')
        return
    }

    const ordersData = await readJsonFile('orders.json')
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

    const items = []
    let orderTotal = 0

    while (true) {
        const serviceId = prompt('Enter service ID (blank to finish): ')

        if (serviceId === '') {
            break
        }

        const service = await findServiceById(serviceId)
        if (!service) {
            console.log('Service ID not found. Please try again.')
            continue
        }

        const quantityInput = prompt('Enter quantity: ')
        const quantity = parseFloat(quantityInput)

        items.push({
            serviceId: serviceId,
            quantity: quantity
        })

        orderTotal += service.price * quantity
    }

    const newOrder = {
        orderId: nextOrderId,
        customerId: customerId,
        orderDate: orderDate,
        status: status,
        items: items
    }

    ordersData.push(newOrder)
    await writeJsonFile('orders.json', ordersData)

    console.log(`Order ${nextOrderId} created`)
    console.log(`Total price: ${orderTotal.toFixed(2)} QAR`)
}

/**
 * Main application loop executing the interactive console UI.
 *
 * @returns {Promise<void>}
 */
async function main() {
    while (true) {
        console.log('\n1. Show laundry services')
        console.log('2. View customer orders')
        console.log('3. Update order status')
        console.log('4. Create new order')
        console.log('5. Exit')
        
        const choice = prompt('What is your choice> ')

        if (choice === '1') {
            await showLaundryServices()
        } else if (choice === '2') {
            await viewCustomerOrders()
        } else if (choice === '3') {
            await updateOrderStatus()
        } else if (choice === '4') {
            await createNewOrder()
        } else if (choice === '5') {
            break
        } else {
            console.log('Invalid choice. Please try again.')
        }
    }
}

main()