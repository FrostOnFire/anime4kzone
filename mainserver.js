const redis = require('redis');

// Подключение к Redis
const redisClient = redis.createClient({
    host: 'localhost', // или IP адрес вашего Redis сервера
    port: 6379,        // стандартный порт Redis
    // password: 'your_redis_password', // если установлен пароль
});

redisClient.on('error', (err) => {
    console.error('Redis error:', err);
});