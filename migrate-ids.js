import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';
import dns from 'dns';

dns.setServers(['8.8.8.8', '8.8.4.4']);
dotenv.config({ path: ['.env', 'env.exmple'] });

async function migrateDatabaseIds() {
    const uri = process.env.MONGO_URI;
    const dbName = process.env.MONGO_DB_NAME;

    if (!uri || !dbName) {
        console.error('Error: MONGO_URI and MONGO_DB_NAME must be defined in .env');
        process.exit(1);
    }

    const client = new MongoClient(uri);

    try {
        await client.connect();
        console.log(`Connected to MongoDB database: ${dbName}`);
        const db = client.db(dbName);

        const customersCol = db.collection('customers');
        const servicesCol = db.collection('services');
        const ordersCol = db.collection('orders');

        // 1. Build lookup maps from old string IDs to MongoDB _id (ObjectId)
        const customers = await customersCol.find({}).toArray();
        const customerIdMap = new Map();
        for (const customer of customers) {
            if (customer.customerId) {
                customerIdMap.set(customer.customerId, customer._id);
            }
        }
        console.log(`Mapped ${customerIdMap.size} customerId(s) to _id.`);

        const services = await servicesCol.find({}).toArray();
        const serviceIdMap = new Map();
        for (const service of services) {
            if (service.serviceId) {
                serviceIdMap.set(service.serviceId, service._id);
            }
        }
        console.log(`Mapped ${serviceIdMap.size} serviceId(s) to _id.`);

        // 2. Update orders to reference customer._id and service._id, and remove old orderId
        const orders = await ordersCol.find({}).toArray();
        let updatedOrdersCount = 0;

        for (const order of orders) {
            const newCustomerId = customerIdMap.get(order.customerId) ?? order.customerId;

            const updatedItems = Array.isArray(order.items)
                ? order.items.map((item) => ({
                    ...item,
                    serviceId: serviceIdMap.get(item.serviceId) ?? item.serviceId
                }))
                : order.items;

            await ordersCol.updateOne(
                { _id: order._id },
                {
                    $set: {
                        customerId: newCustomerId,
                        items: updatedItems
                    },
                    $unset: {
                        orderId: ''
                    }
                }
            );
            updatedOrdersCount++;
        }
        console.log(`Updated relationships and removed orderId on ${updatedOrdersCount} order(s).`);

        // 3. Delete old customerId field from customers collection
        const custResult = await customersCol.updateMany(
            { customerId: { $exists: true } },
            { $unset: { customerId: '' } }
        );
        console.log(`Removed customerId field from ${custResult.modifiedCount} customer(s).`);

        // 4. Delete old serviceId field from services collection
        const servResult = await servicesCol.updateMany(
            { serviceId: { $exists: true } },
            { $unset: { serviceId: '' } }
        );
        console.log(`Removed serviceId field from ${servResult.modifiedCount} service(s).`);

        console.log('Migration completed successfully.');
    } catch (err) {
        console.error('Migration failed:', err);
    } finally {
        await client.close();
        console.log('Database connection closed.');
    }
}

migrateDatabaseIds();

