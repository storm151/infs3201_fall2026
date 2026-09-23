import promptSync from 'prompt-sync'
import * as business from './business.js'

const prompt = promptSync()

/** Displays all available laundry services. */
async function showLaundryServices() {
    const services = await business.showLaundryServices()
    console.log('Service ID  Service                    Unit      Price')
    console.log('----------  -------------------------  --------  --------')
    for (let i = 0; i < services.length; i++) {
        const service = services[i]
        const priceFormatted = service.price.toFixed(2)
        console.log(`${service.serviceId.padEnd(10)}  ${service.name.padEnd(25)}  ${service.unit.padEnd(8)}  ${priceFormatted.padStart(8)}`)
    }
}

/** Displays orders belonging to a customer. */
async function viewCustomerOrders() {
    const customerId = prompt('Enter customer ID: ')
    const customer = await business.findCustomerById(customerId)
    
    if (!customer) {
        console.log('Customer not found.')
        return
    }

    console.log(`Orders for ${customer.name}`)
    console.log('Order ID  Order Date    Status       Total')
    console.log('--------  ----------    ---------    --------')

    const customerOrders = await business.viewCustomerOrders(customerId)

    for (let i = 0; i < customerOrders.length; i++) {
        const order = customerOrders[i]
        console.log(`${order.orderId.padEnd(8)}  ${order.orderDate.padEnd(10)}    ${order.status.padEnd(11)}  ${order.total.toFixed(2).padStart(8)}`)
    }
}

/** Prompts for and updates an order's status. */
async function updateOrderStatus() {
    const orderId = prompt('Enter order ID: ')

    const targetOrder = await business.checkOrder(orderId)

    if (!targetOrder) {
        console.log('Order not found.')
        return
    }

    console.log(`Current status: ${targetOrder.status}`)
    console.log('Status sequence: Received -> Washing -> Ready -> Delivered')
    const newStatus = prompt('Enter new status: ')

    const result = await business.updateOrderStatus(targetOrder, newStatus)
    if (typeof result === 'string') {
        console.log(result)
    } else {
        console.log(`Order ${orderId} status updated to ${newStatus}`)
    }
}

/** Prompts for and creates a new order. */
async function createNewOrder() {
    const customerId = prompt('Enter customer ID: ')
    const customer = await business.findCustomerById(customerId)

    if (!customer) {
        console.log('Customer not found.')
        return
    }

    const serviceArray = []
    while (true) {
        const serviceId = prompt('Enter service ID (blank to finish): ')

        if (serviceId === '') {
            break
        }

        const service = await business.findServiceById(serviceId)
        if (!service) {
            console.log('Service ID not found. Please try again.')
            continue
        }

        const quantityInput = prompt('Enter quantity: ')
        const quantity = parseFloat(quantityInput)

        if (isNaN(quantity) || quantity <= 0) {
            console.log('Invalid quantity. Please enter a positive number.')
            continue
        }

        serviceArray.push({ serviceId: service.serviceId, price: service.price, quantity })
    }

    if (serviceArray.length === 0) {
        console.log('No services selected. Order cancelled.')
        return
    }

    const { nextOrderId, orderTotal } = await business.createNewOrder(customerId, serviceArray)

    console.log(`Order ${nextOrderId} created`)
    console.log(`Total price: ${orderTotal.toFixed(2)} QAR`)
}

/** Runs the application's main menu. */
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