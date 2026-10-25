import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';

dotenv.config();

const uri = process.env.MONGO_URI;
const dbName = process.env.DB_NAME;

let client;
let db;

export async function connectDB() {
    if (db) return db; // Return existing connection if cached

    try {
        client = new MongoClient(uri);
        await client.connect();
        db = client.db(dbName);
        console.log(`Connected successfully to MongoDB database: ${dbName}`);
        return db;
    } catch (error) {
        console.error('Failed to connect to MongoDB:', error);
        process.exit(1);
    }
}

export function getDB() {
    if (!db) {
        throw new Error('Database not initialized. Call connectDB() first.');
    }
    return db;
}