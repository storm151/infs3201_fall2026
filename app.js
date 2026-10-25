import * as business from './business.js'
import promptSync from 'prompt-sync'
import dotenv from 'dotenv'
const prompt = promptSync()

dotenv.config()

/**
 * Display the laundry services in a nicely formatted table.
 */
async function showLaundryServices() {
    let services = await business.getServices()

    console.log('\n')
    console.log('Service ID Service                    Unit    Price')
    console.log('---------- -------------------------- ------- ------')
    for (let s of services) {
        console.log(`${s.serviceId.padEnd(10)} ${s.name.padEnd(26)} ${s.unit.padEnd(5)} ${s.price.toFixed(2).padStart(8)}`)
    }
    console.log('\n')
}


/**
 * Display a list of orders per customer in a structure way
 * @returns nothing
 */
async function showCustomerOrders() {
    let customerId = prompt('Enter customer ID: ')
    let details = await business.getCustomerInformation(customerId)
    if (!details) {
        console.log("**** customer not found")
        return
    }
    console.log(`Orders for ${details.name}`)
    console.log('Order ID  Order Date  Status      Total')
    console.log('--------  ----------  ----------- -----')
    for (let ord of details.orders) {
        console.log(`${ord.order.padEnd(8)}  ${ord.date.padEnd(10)}  ${ord.status.padEnd(11)} ${ord.total.toFixed(2).padStart(5)}`)
    }
}

/**
 * Interact with the customer to create a new order then save it to the storage.
 * @returns 
 */
async function createNewOrder() {
    let customerId = prompt('Enter customer ID: ')
    let customer = await business.getCustomerInformation(customerId)
    if (!customer) {
        console.log('**** customer not found')
        return
    }

    let items = []
    while (true) {
        let serviceId = prompt('Enter service ID (blank to finish): ')
        if (serviceId == '') {
            break
        }

        let service = await business.getService(serviceId)
        if (!service) {
            console.log('**** service not found')
            continue
        }

        let quantity = Number(prompt('Enter quantity: '))
        items.push({
            serviceId: serviceId,
            quantity: quantity
        })
    }

    if (items.length == 0) {
        console.log('**** order must contain at least one service')
        return
    }
    let orderDetails = await business.createNewOrder(customerId, items)

    console.log(`Order ${orderDetails.orderId} created`)
    console.log(`Total price: ${orderDetails.total.toFixed(2)} QAR`)
}

/**
 * Interact with the customer to determine the current status of an order and update it with a 
 * new status if allowed.
 */
async function changeOrderStatus() {
    let oid = prompt('Enter order ID: ')
    let details = await business.getOrderDetails(oid)
    console.log(`Current status: ${details.status}`)
    let newStatus = prompt('Enter new status: ')
    let result = await business.updateOrderStatus(details.orderId, newStatus)
    if (!result) {
        console.log('New status not accepted')
    }
    else {
        console.log('Status updated')
    }
}

function formatMoney(amount, width=0) {
    let fixed = amount.toFixed(2)
    return String(fixed).padStart(width)
}

async function showInvoice() {
    let orderId = prompt('Enter order ID: ')
    let invoice = await business.generateInvoice(orderId)
    if (!invoice) {
        console.log("****** not found*****")
        return
    }
    console.log(invoice)
    console.log(`Order: ${invoice.order}     Date: ${invoice.data}      Status: ${invoice.status}`)
    console.log(`Customer: ${invoice.customer}`)
    console.log()
    console.log('Service            Qty      Price      Line Total')
    console.log('------------------ ------ -----------  ----------')
    for (let it of invoice.serviceItems) {
        console.log(`${it.service.padEnd(18)} ${String(it.quantity).padEnd(7)} `+ 
        `${formatMoney(it.price,10)} ${formatMoney(it.lineTotal,11)}`)
    }
    console.log()
    console.log(`        Service subtotal: ${formatMoney(invoice.subTotal,23)}`)
    console.log(`Minimum-order adjustment: ${formatMoney(invoice.minimumAdjustment, 23)}`)
    console.log(`         Delivery charge: ${formatMoney(invoice.delivery, 23)}`)
    console.log(`             Final total: ${formatMoney(invoice.total, 23)} QAR`)
}

/**
 * Display the menu to the user and wait for their input.  If the input is invalid the function
 * displays a message and prompts again.  If the user enters a valid value then the function stops and
 * returns the selection number.
 * @returns A valid selection number.
 */
function showMenu() {
    while (true) {
        console.log('1. Show laundry services')
        console.log('2. View customer orders')
        console.log('3. Update order status')
        console.log('4. Create new order')
        console.log('5. View order details')
        console.log('6. Exit\n')
        let selection = Number(prompt('What is your choice> '))
        if (selection >= 1 && selection <= 6) {
            return selection
        }
        console.log("*** Invalid input.. try again! ***")
    }
}


while (true) {
    let option = showMenu()
    if (option === 1) {
        await showLaundryServices()
    }
    else if (option === 2) {
        await showCustomerOrders()
    }
    else if (option === 3) {
        await changeOrderStatus()
    }
    else if (option === 4) {
        await createNewOrder()
    }
    else if (option === 5) {
        await showInvoice()
    }
    else {
        break
    }
}
console.log("Thank you")