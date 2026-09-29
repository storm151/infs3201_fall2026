import promptSync from 'prompt-sync'
import * as business from './business.js'

const prompt = promptSync()

/** Displays all available laundry services. */
async function showLaundryServices() {
    const services = await business.showLaundryServices()
    console.log('Service ID  Service                    Unit      Price')
    console.log('----------  -------------------------  --------  --------')
    for (const service of services) {
        const priceFormatted = service.price.toFixed(2)
        console.log(`${service.serviceId.padEnd(10)}  ${service.name.padEnd(25)}  ${service.unit.padEnd(8)}  ${priceFormatted.padStart(8)}`)
    }
}

/** Displays orders belonging to a customer. */
async function viewCustomerOrders() {
    const customerId = prompt('Enter customer ID: ')
    const customerOrders = await business.viewCustomerOrders(customerId)

    if (typeof customerOrders === 'string') {
        console.log(customerOrders)
        return
    }

    console.log(`Orders for ${customerOrders.customerName}`)
    console.log('Order ID  Order Date    Status       Total')
    console.log('--------  ----------    ---------    --------')

    for (const order of customerOrders.orders) {
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

/** Displays a formatted invoice for an order. */
async function viewInvoice() {
    const orderId = prompt('Enter order ID: ')
    const invoice = await business.viewInvoice(orderId)

    if (typeof invoice === 'string') {
        console.log(invoice)
        return
    }

    console.log(`Order: ${invoice.orderId}  Date: ${invoice.orderDate}  Status: ${invoice.status}`)
    console.log(`Customer: ${invoice.customerName}`)
    console.log('')
    console.log('Service                    Qty      Price   Line Total')
    console.log('-------------------------  -----  --------  -----------')

    for (const item of invoice.items) {
        console.log(`${item.name.padEnd(25)}  ${item.quantity.toString().padStart(3)}  ${item.price.toFixed(2).padStart(8)}  ${item.lineTotal.toFixed(2).padStart(11)}`)
    }

    console.log('')
    console.log(`Service subtotal:          ${invoice.servicesTotal.toFixed(2).padStart(8)}`)
    console.log(`Minimum-order adjustment:  ${invoice.minimumOrderAdjustment.toFixed(2).padStart(8)}`)
    console.log(`Delivery charge:           ${invoice.deliveryFee.toFixed(2).padStart(8)}`)
    console.log(`Final total:               ${invoice.totalAmount.toFixed(2).padStart(8)} QAR`)
}

/** Runs the application's main menu. */
async function main() {
    while (true) {
        console.log('\n1. Show laundry services')
        console.log('2. View customer orders')
        console.log('3. Update order status')
        console.log('4. Create new order')
        console.log('5. View invoice')
        console.log('6. Exit')

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
            await viewInvoice()
        } else if (choice === '6') {
            console.log('Exiting...')
            break
        } else {
            console.log('Invalid choice. Please try again.')
        }
    }
}

main()