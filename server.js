const express = require('express');
const axios = require('axios');
const cors = require('cors');
require('dotenv').config();

const app = express();
const port = 3000;

// Enable CORS for all routes
app.use(cors());

// Middleware to parse JSON bodies
app.use(express.json());

// Environment variables for Openverse credentials
const CLIENT_ID = process.env.OPENVERSE_CLIENT_ID;
const CLIENT_SECRET = process.env.OPENVERSE_CLIENT_SECRET;

// Valid licenses for Openverse API
const validLicenses = ['CC0', 'BY', 'BY-SA', 'BY-NC', 'BY-ND', 'BY-NC-SA', 'BY-NC-ND'];

// Function to get OAuth2 access token
async function getAccessToken() {
  if (!CLIENT_ID || !CLIENT_SECRET) {
    console.error('Environment variables missing:', {
      clientIdSet: !!CLIENT_ID,
      clientSecretSet: !!CLIENT_SECRET
    });
    throw new Error('Missing OPENVERSE_CLIENT_ID or OPENVERSE_CLIENT_SECRET in .env file');
  }

  try {
    const params = new URLSearchParams();
    params.append('client_id', CLIENT_ID);
    params.append('client_secret', CLIENT_SECRET);
    params.append('grant_type', 'client_credentials');

    const response = await axios.post('https://api.openverse.org/v1/auth_tokens/token/', params, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    });
    console.log('Access token obtained successfully');
    return response.data.access_token;
  } catch (error) {
    console.error('Error fetching access token:', {
      message: error.message,
      status: error.response?.status,
      data: error.response?.data,
      url: 'https://api.openverse.org/v1/auth_tokens/token/'
    });

    let errorMessage = 'Failed to obtain access token';
    if (error.response?.status === 400 && error.response?.data?.error === 'unsupported_grant_type') {
      errorMessage = 'Unsupported grant_type. Contact openverse@wordpress.org for the correct grant_type.';
    } else if (error.response?.status === 401) {
      errorMessage = 'Authentication failed: Invalid client_id or client_secret';
    } else if (error.response?.status === 429) {
      errorMessage = 'Rate limit exceeded. Please try again later.';
    }
    throw new Error(errorMessage);
  }
}

// Proxy endpoint for Openverse API
app.get('/api/search', async (req, res) => {
  const { q, mediaType, license } = req.query;

  // Validate mediaType
  const validMediaTypes = ['images', 'audio'];
  if (!validMediaTypes.includes(mediaType)) {
    console.error(`Invalid mediaType: ${mediaType}`);
    return res.status(400).json({ error: `Invalid mediaType. Must be one of: ${validMediaTypes.join(', ')}` });
  }

  // Validate and map license
  let apiLicense = license;
  if (license && !validLicenses.includes(license)) {
    console.error(`Invalid license: ${license}`);
    return res.status(400).json({ error: `Invalid license. Must be one of: ${validLicenses.join(', ')}` });
  }

  const apiUrl = `https://api.openverse.org/v1/${mediaType}?q=${encodeURIComponent(q)}${apiLicense ? `&license=${apiLicense}` : ''}`;

  try {
    const accessToken = await getAccessToken();
    const response = await axios.get(apiUrl, {
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    });
    res.json(response.data);
  } catch (error) {
    console.error('Error fetching from Openverse:', {
      message: error.message,
      status: error.response?.status,
      data: error.response?.data,
      url: apiUrl
    });

    let errorMessage = error.message;
    if (error.response?.status === 400) {
      errorMessage = `Bad request: ${error.response?.data?.detail || 'Invalid parameters, possibly license'}`;
    } else if (error.response?.status === 401) {
      errorMessage = 'Authentication failed: Invalid or expired access token';
    } else if (error.response?.status === 429) {
      errorMessage = 'Rate limit exceeded. Please try again later.';
    }
    res.status(error.response?.status || 500).json({ error: errorMessage });
  }
});

// Health check endpoint to verify server is running
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', message: 'Server is running' });
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});