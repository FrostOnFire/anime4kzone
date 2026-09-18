// shikimoriTokenManager.js

require('dotenv').config();
const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');

// Where the token and its expiry are cached between runs
const tokenDataPath = path.join(__dirname, 'shikimoriToken.json');

// Request a fresh access token
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
    const expiresIn = data.expires_in; // token lifetime, in seconds
    const expiresAt = Date.now() + expiresIn * 1000; // expiry as a timestamp, in ms

    // Cache the token and its expiry
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

// Return a valid token, refreshing it when needed
async function getAccessToken() {
  try {
    if (fs.existsSync(tokenDataPath)) {
      const tokenData = JSON.parse(fs.readFileSync(tokenDataPath, 'utf8'));

      if (Date.now() < tokenData.expiresAt) {
        // still valid
        return tokenData.accessToken;
      } else {
        // expired, so fetch a new one
        console.log('Access token expired, fetching a new one.');
        return await fetchAccessToken();
      }
    } else {
      // nothing cached yet
      console.log('No access token found, fetching a new one.');
      return await fetchAccessToken();
    }
  } catch (error) {
    console.error('Error reading or parsing token data:', error);
    // on any read error, fall back to fetching a new token
    return await fetchAccessToken();
  }
}

module.exports = {
  getAccessToken,
};