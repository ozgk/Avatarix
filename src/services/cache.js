import { createClient } from 'redis';
import dotenv from 'dotenv';

dotenv.config();

const redisClient = createClient({
    url: process.env.REDIS_URL || 'redis://localhost:6379',
    disableOfflineQueue: true
});

redisClient.on('error', (err) => console.error('Redis Client Error', err));
redisClient.on('connect', () => console.log('Redis Client Connected'));

// Conectar ao cache (será invocado no server.js)
export const connectCache = async () => {
    if (!redisClient.isOpen) {
        await redisClient.connect();
    }
};

export const getCache = async (key) => {
    if (!redisClient.isReady) return null;
    try {
        return await redisClient.get(key);
    } catch (error) {
        console.error('Redis get error:', error);
        return null;
    }
};

export const setCache = async (key, value, expirySeconds = 86400) => {
    if (!redisClient.isReady) return;
    try {
        await redisClient.set(key, value, {
            EX: expirySeconds
        });
    } catch (error) {
        console.error('Redis set error:', error);
    }
};

export default redisClient;
