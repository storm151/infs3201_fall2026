import * as persistence from './persistence.js'
import dotenv from 'dotenv'
import crypto from 'crypto'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import nodemailer from 'nodemailer'

dotenv.config({ path: ['.env'] })

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

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

    if (newStatus === 'Ready') {
        let pdfPath = null
        try {
            pdfPath = await generateInvoicePDF(oid)
        } catch (err) {
            console.error(`Failed to generate PDF invoice for order ${oid}:`, err)
        }

        if (pdfPath) {
            try {
                await sendInvoiceEmail(oid, pdfPath)
            } catch (err) {
                console.error(`Failed to send invoice email for order ${oid}:`, err)
            }
        }
    }

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
    for (let it of (orderDetails.items || [])) {
        let service = await persistence.getServiceById(it.serviceId)
        if (service) {
            serviceItems.push({
                service: service.name,
                quantity: it.quantity,
                price: service.price,
                lineTotal: it.quantity * service.price
            })
        }
    }
    let totals = computeSubTotals(serviceItems)
    const resolvedOrderId = String(orderDetails._id)
    return {
        order: resolvedOrderId,
        date: orderDetails.orderDate,
        data: orderDetails.orderDate,
        status: orderDetails.status,
        customer: customerDetails?.name || 'N/A',
        customerId: customerDetails?._id ? String(customerDetails._id) : String(orderDetails.customerId || ''),
        customerPhone: customerDetails?.phone || '',
        customerEmail: customerDetails?.email || '',
        serviceItems: serviceItems,
        subTotal: totals.subTotal,
        minimumAdjustment: totals.minOrderAdjustment,
        delivery: totals.deliveryCharge,
        total: totals.total
    }
}

/**
 * Generate a PDF invoice for an order using pdf-lib and save it to disk under invoices/.
 * Reuses existing business logic (generateInvoice and computeSubTotals) and fetches real MongoDB data.
 * @param {string|object} orderId - The order's MongoDB _id.
 * @returns {Promise<string|null>} The absolute path to the saved PDF file, or null if order not found.
 */
export async function generateInvoicePDF(orderId) {
    const invoice = await generateInvoice(orderId)
    if (!invoice) {
        return null
    }

    const pdfDoc = await PDFDocument.create()
    const page = pdfDoc.addPage([595.28, 841.89]) // A4 size in points
    const { width, height } = page.getSize()

    const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica)
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold)

    const margin = 50
    let y = height - margin

    // Header
    page.drawText('INVOICE', {
        x: margin,
        y,
        size: 22,
        font: fontBold,
        color: rgb(0, 0, 0)
    })
    y -= 30

    // Order Metadata Block
    page.drawText(`Order Number: ${invoice.order}`, {
        x: margin,
        y,
        size: 11,
        font: fontBold
    })
    y -= 16

    page.drawText(`Order Date: ${invoice.date || 'N/A'}`, {
        x: margin,
        y,
        size: 11,
        font: fontRegular
    })
    y -= 16

    page.drawText(`Order Status: ${invoice.status || 'Ready'}`, {
        x: margin,
        y,
        size: 11,
        font: fontRegular
    })
    y -= 28

    // Customer Information Block
    page.drawText('Customer Information', {
        x: margin,
        y,
        size: 13,
        font: fontBold
    })
    y -= 18

    page.drawText(`Name: ${invoice.customer}`, {
        x: margin,
        y,
        size: 11,
        font: fontRegular
    })
    y -= 16

    if (invoice.customerId) {
        page.drawText(`Customer ID: ${invoice.customerId}`, {
            x: margin,
            y,
            size: 11,
            font: fontRegular
        })
        y -= 16
    }

    if (invoice.customerPhone) {
        page.drawText(`Phone: ${invoice.customerPhone}`, {
            x: margin,
            y,
            size: 11,
            font: fontRegular
        })
        y -= 16
    }

    if (invoice.customerEmail) {
        page.drawText(`Email: ${invoice.customerEmail}`, {
            x: margin,
            y,
            size: 11,
            font: fontRegular
        })
        y -= 16
    }

    y -= 16

    // Line-Item Table Header
    const colServiceX = margin
    const colQtyX = 310
    const colPriceX = 380
    const colTotalX = 475

    page.drawText('Service / Item', { x: colServiceX, y, size: 11, font: fontBold })
    page.drawText('Qty', { x: colQtyX, y, size: 11, font: fontBold })
    page.drawText('Unit Price (QAR)', { x: colPriceX, y, size: 11, font: fontBold })
    page.drawText('Line Total (QAR)', { x: colTotalX, y, size: 11, font: fontBold })
    y -= 8

    page.drawLine({
        start: { x: margin, y },
        end: { x: width - margin, y },
        thickness: 1,
        color: rgb(0.2, 0.2, 0.2)
    })
    y -= 18

    // Line Items
    for (const item of invoice.serviceItems) {
        page.drawText(String(item.service), {
            x: colServiceX,
            y,
            size: 11,
            font: fontRegular
        })
        page.drawText(String(item.quantity), {
            x: colQtyX,
            y,
            size: 11,
            font: fontRegular
        })
        page.drawText(`${Number(item.price).toFixed(2)} QAR`, {
            x: colPriceX,
            y,
            size: 11,
            font: fontRegular
        })
        page.drawText(`${Number(item.lineTotal).toFixed(2)} QAR`, {
            x: colTotalX,
            y,
            size: 11,
            font: fontRegular
        })
        y -= 18
    }

    y -= 4
    page.drawLine({
        start: { x: margin, y },
        end: { x: width - margin, y },
        thickness: 1,
        color: rgb(0.2, 0.2, 0.2)
    })
    y -= 22

    // Totals Block
    const labelX = 330
    const valueX = colTotalX

    page.drawText('Subtotal:', { x: labelX, y, size: 11, font: fontRegular })
    page.drawText(`${Number(invoice.subTotal).toFixed(2)} QAR`, { x: valueX, y, size: 11, font: fontRegular })
    y -= 16

    page.drawText('Minimum Order Adjustment:', { x: labelX, y, size: 11, font: fontRegular })
    page.drawText(`${Number(invoice.minimumAdjustment).toFixed(2)} QAR`, { x: valueX, y, size: 11, font: fontRegular })
    y -= 16

    page.drawText('Delivery Charge:', { x: labelX, y, size: 11, font: fontRegular })
    page.drawText(`${Number(invoice.delivery).toFixed(2)} QAR`, { x: valueX, y, size: 11, font: fontRegular })
    y -= 20

    page.drawText('Total Amount Payable:', { x: labelX, y, size: 12, font: fontBold })
    page.drawText(`${Number(invoice.total).toFixed(2)} QAR`, { x: valueX, y, size: 12, font: fontBold })

    const pdfBytes = await pdfDoc.save()
    const invoicesDir = path.join(__dirname, 'invoices')
    await fs.promises.mkdir(invoicesDir, { recursive: true })

    const filePath = path.join(invoicesDir, `invoice-${invoice.order}.pdf`)
    await fs.promises.writeFile(filePath, pdfBytes)

    return filePath
}

/**
 * Send the generated PDF invoice as an email attachment to the customer associated with the order.
 * SMTP configuration is read from environment variables.
 * @param {string|object} orderId - The order's MongoDB _id.
 * @param {string|null} [pdfPath=null] - Optional path to the already-generated PDF invoice.
 * @returns {Promise<object|null>} Nodemailer send result info, or null if customer email or invoice is missing.
 */
export async function sendInvoiceEmail(orderId, pdfPath = null) {
    const invoice = await generateInvoice(orderId)
    if (!invoice || !invoice.customerEmail) {
        return null
    }

    const attachmentPath = pdfPath || await generateInvoicePDF(orderId)
    if (!attachmentPath) {
        return null
    }

    const host = process.env.SMTP_HOST || process.env.EMAIL_HOST
    const port = Number(process.env.SMTP_PORT || process.env.EMAIL_PORT) || 587
    const secure = process.env.SMTP_SECURE === 'true' || port === 465
    const user = process.env.SMTP_USER || process.env.EMAIL_USER
    const pass = process.env.SMTP_PASS || process.env.EMAIL_PASS
    const from = process.env.SMTP_FROM || process.env.EMAIL_FROM || user || 'no-reply@laundry.com'

    const transporter = nodemailer.createTransport({
        host: host,
        port: port,
        secure: secure,
        auth: user && pass ? { user, pass } : undefined
    })

    const mailOptions = {
        from: from,
        to: invoice.customerEmail,
        subject: `Order #${invoice.order} Ready - Laundry Invoice`,
        text: `Dear ${invoice.customer},\n\nYour laundry for Order #${invoice.order} is now ready!\nPlease find your PDF invoice attached to this email.\n\nOrder Summary:\n- Order ID: ${invoice.order}\n- Order Date: ${invoice.date || 'N/A'}\n- Status: Ready\n- Total Amount Payable: ${Number(invoice.total).toFixed(2)} QAR\n\nThank you for choosing our laundry service.`,
        attachments: [
            {
                filename: `invoice-${invoice.order}.pdf`,
                path: attachmentPath,
                contentType: 'application/pdf'
            }
        ]
    }

    const info = await transporter.sendMail(mailOptions)
    const previewUrl = nodemailer.getTestMessageUrl(info)
    if (previewUrl) {
        console.log(`Invoice email sent for order ${invoice.order}. Preview URL: ${previewUrl}`)
    }
    return info
}

export const MAX_PICKUP_IMAGE_SIZE = 2 * 1024 * 1024 // 2 MB

/**
 * Validate and save a customer's pickup-location JPG image to the server filesystem
 * and store its location metadata on the customer's MongoDB document.
 * Enforces:
 * - Authenticated customer exists
 * - Up to 1 pickup-location image per customer (replaces any previous image)
 * - Only JPG image files accepted (MIME type, extension, and JPEG magic bytes)
 * - Maximum file size of 2 MB
 * - Server-managed filename using UUID to prevent collisions and path traversal
 *
 * @param {string|object} customerId - The customer's MongoDB _id.
 * @param {{buffer: Buffer, mimetype: string, originalname: string, size: number}} file - The uploaded file object.
 * @returns {Promise<{success: boolean, error?: string, pickupImage?: string, filename?: string}>}
 */
export async function saveCustomerPickupImage(customerId, file) {
    if (!customerId) {
        return { success: false, error: 'Customer authentication is required.' }
    }

    const customer = await persistence.getCustomerById(customerId)
    if (!customer) {
        return { success: false, error: 'Customer record not found.' }
    }

    if (!file || !file.buffer || file.buffer.length === 0) {
        return { success: false, error: 'Please select a JPG image file to upload.' }
    }

    // Enforce maximum file size of 2 MB
    if (file.size > MAX_PICKUP_IMAGE_SIZE || file.buffer.length > MAX_PICKUP_IMAGE_SIZE) {
        return { success: false, error: 'File size exceeds the maximum limit of 2 MB.' }
    }

    // Enforce JPG only: check MIME type, file extension, and JPEG magic bytes (FF D8 FF)
    const mime = (file.mimetype || '').toLowerCase()
    const ext = path.extname(file.originalname || '').toLowerCase()
    const isJpegMime = mime === 'image/jpeg' || mime === 'image/jpg'
    const isJpegExt = ext === '.jpg' || ext === '.jpeg'
    const buf = file.buffer
    const hasJpegMagicBytes = buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff

    if (!isJpegMime || !isJpegExt || !hasJpegMagicBytes) {
        return { success: false, error: 'Only JPG (.jpg / .jpeg) image files are accepted.' }
    }

    const uploadsDir = path.join(__dirname, 'public', 'uploads')
    await fs.promises.mkdir(uploadsDir, { recursive: true })

    // Server-managed filename to prevent collisions and unsafe paths
    const safeCustomerId = String(customer._id).replace(/[^a-fA-F0-9]/g, '')
    const safeFilename = `pickup-${safeCustomerId}-${crypto.randomUUID()}.jpg`
    const destPath = path.join(uploadsDir, safeFilename)

    // Write new image file to server filesystem
    await fs.promises.writeFile(destPath, buf)

    // Remove previous image file if the customer already had one (up to one image per customer)
    const oldFilename = customer.pickupImageFilename || (customer.pickupImage ? path.basename(customer.pickupImage) : null)
    if (oldFilename && oldFilename !== safeFilename) {
        const safeOldPath = path.join(uploadsDir, path.basename(oldFilename))
        try {
            await fs.promises.unlink(safeOldPath)
        } catch {
            // Ignore if old file no longer exists on disk
        }
    }

    const imageLocation = `/uploads/${safeFilename}`
    await persistence.updateCustomerPickupImage(customer._id, imageLocation, safeFilename)

    return {
        success: true,
        pickupImage: imageLocation,
        filename: safeFilename
    }
}