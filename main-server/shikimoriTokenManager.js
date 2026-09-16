// shikimoriTokenManager.js

require('dotenv').config();
const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');

// Путь к файлу, где будет храниться токен и время его истечения
const tokenDataPath = path.join(__dirname, 'shikimoriToken.json');

// Функция для получения нового токена доступа
async function fetchAccessToken() {
  const tokenUrl = 'https://shikimori.one/oauth/token';
  const params = new URLSearchParams();
  params.append('grant_type', 'client_credentials');
  params.append('client_id', process.env.SHIKIMORI_CLIENT_ID);
  params.append('client_secret', process.env.SHIKIMORI_CLIENT_SECRET);

  try {
    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch access token: ${response.status}`);
    }

    const data = await response.json();
    const accessToken = data.access_token;
    const expiresIn = data.expires_in; // Время жизни токена в секундах
    const expiresAt = Date.now() + expiresIn * 1000; // Время истечения токена в миллисекундах

    // Сохраняем токен и время его истечения в файл
    const tokenData = {
      accessToken,
      expiresAt,
    };
    fs.writeFileSync(tokenDataPath, JSON.stringify(tokenData));

    console.log('Access token fetched and saved.');
    return accessToken;
  } catch (error) {
    console.error('Error fetching access token:', error);
    throw error;
  }
}

// Функция для получения актуального токена доступа
async function getAccessToken() {
  try {
    if (fs.existsSync(tokenDataPath)) {
      const tokenData = JSON.parse(fs.readFileSync(tokenDataPath, 'utf8'));

      if (Date.now() < tokenData.expiresAt) {
        // Токен ещё действителен
        return tokenData.accessToken;
      } else {
        // Токен истёк, получаем новый
        console.log('Access token expired, fetching a new one.');
        return await fetchAccessToken();
      }
    } else {
      // Файл не существует, получаем новый токен
      console.log('No access token found, fetching a new one.');
      return await fetchAccessToken();
    }
  } catch (error) {
    console.error('Error reading or parsing token data:', error);
    // В случае ошибки пытаемся получить новый токен
    return await fetchAccessToken();
  }
}

module.exports = {
  getAccessToken,
};