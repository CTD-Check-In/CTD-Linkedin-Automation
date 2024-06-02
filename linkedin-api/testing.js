const express = require('express');
const axios = require('axios');
const qs = require('querystring');
const fs = require('fs'); // For file storage
const nodemailer = require('nodemailer');
require('dotenv').config();

const app = express();
const PORT = 3000;

//Configuration for LinkedIn API calls
const linkedInConfig = {
    maxBodyLength: Infinity,
    headers: {
        'Authorization': 'Bearer ' + process.env.LINKEDIN_TOKEN,
        'Cookie': `bcookie="${process.env.BCOOKIE}"`  
    }
};

//Configuration for Outlook API calls
const outlookConfig = {
    maxBodyLength: Infinity,
    headers: {}
};

// Credentials (better to store securely)
const credentials = {
  clientId: '9e46f14d-4384-4949-91e0-64fb98f47272',
  clientSecret: 'mgP8Q~zypOY5JeWtK-vcCpPss0jB~0fLlEIC_dyG',
  redirectUri: 'http://localhost:3000/auth/callback',
  scopes: ['openid', 'profile', 'email', 'Mail.Read'],
  tokenFilePath: 'token.json' // Store tokens in a file
};

async function getAccessToken() {
    let tokenData = loadTokenData();
  
    // Check if token exists and is still valid
    if (tokenData && isTokenValid(tokenData)) {
      return tokenData.accessToken;
    }
  
    // If token is expired or invalid, try to refresh it
    if (tokenData && tokenData.refreshToken) {
      try {
        tokenData = await refreshAccessToken(tokenData.refreshToken);
        saveTokenData(tokenData);
        return tokenData.accessToken;
      } catch (error) {
        // Handle refresh token errors specifically
        if (error.response && error.response.status === 400 && error.response.data.error === 'invalid_grant') {
          console.error('Refresh token is invalid. Need to re-authorize.');
          // Delete the invalid token file
          fs.unlinkSync(credentials.tokenFilePath);
        } else {
          console.error('Error refreshing access token:', error);
        }
  
        // If refresh fails, proceed to initial authorization
        throw new Error(`Initial authorization required: ${getAuthorizationUrl()}`);
      }
    }
  
    // If no valid token or refresh token, trigger initial authorization
    throw new Error(`Initial authorization required: ${getAuthorizationUrl()}`);
  }
  
  async function refreshAccessToken(refreshToken) {
    const response = await axios.post(
      'https://login.microsoftonline.com/consumers/oauth2/v2.0/token',
      qs.stringify({
        client_id: credentials.clientId,
        client_secret: credentials.clientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
        scope: credentials.scopes.join(' '),
      }),
      {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      }
    );
    return response.data;
  }
  

function getAuthorizationUrl() {
  return `https://login.microsoftonline.com/consumers/oauth2/v2.0/authorize?client_id=${credentials.clientId}&response_type=code&redirect_uri=${encodeURIComponent(
    credentials.redirectUri
  )}&scope=${encodeURIComponent(credentials.scopes.join(' '))}`;
}

function isTokenValid(tokenData) {
  return (
    tokenData.accessToken &&
    tokenData.expiresAt &&
    new Date() < new Date(tokenData.expiresAt)
  );
}

function loadTokenData() {
    try {
        const tokenData = JSON.parse(fs.readFileSync(credentials.tokenFilePath));
        console.log('Loaded token data:', tokenData); // Log for debugging
        return tokenData; 
      } catch (error) {
        console.error('Error loading token data:', error);
        return null; 
      }
}

function saveTokenData(tokenData) {
    const dataToSave = {
        accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token,
        expiresAt: new Date(Date.now() + (tokenData.expires_in - 60) * 1000), // Expire slightly early to account for network delays
      };
    
      fs.writeFileSync(credentials.tokenFilePath, JSON.stringify(dataToSave, null, 2)); // Pretty-print for readability
      console.log('Token data saved:', dataToSave); // Log for debugging
}

// Endpoint to get the access token (automatically refreshes if needed)
app.get('/', async (req, res) => {
    try {
      const token = await getAccessToken();
      res.send(`Access Token: ${token}`);
    } catch (error) {
      res.status(500).send(error.message); 
    }
  });

// Callback endpoint for handling the authorization code and exchanging it for an access token
app.get('/auth/callback', async (req, res) => {
    const { code } = req.query;

    try {
        // Exchange authorization code for tokens
        const tokenResponse = await axios.post('https://login.microsoftonline.com/consumers/oauth2/v2.0/token', qs.stringify({
            client_id: credentials.clientId,  // Use credentials.clientId
            client_secret: credentials.clientSecret, // Use credentials.clientSecret
            code: code,
            redirect_uri: credentials.redirectUri,  // Use credentials.redirectUri
            grant_type: 'authorization_code'
        }), {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            }
        });

        saveTokenData(tokenResponse.data); // Save the access and refresh tokens
        res.send('Authorization successful! You can close this window.'); // Or redirect to another page
    } catch (error) {
        console.error('Error exchanging code for token:', error);
        res.status(500).send('Authorization failed');
    }
});

// Function to get unread emails from Outlook
async function getUnreadEmails() {
    const accessToken = await getAccessToken(); 
    let config = {
        ...outlookConfig, 
        method: 'get',
        url: 'https://graph.microsoft.com/v1.0/me/messages?$filter=isRead eq false and subject eq \'CTD Internship form submission\'',
        headers: {
          ...outlookConfig.headers, 
          'Authorization': 'Bearer ' + accessToken 
        }
      };
    
      try {
        const response = await axios.request(config);
        const responseData = typeof response.data === 'string' ? JSON.parse(response.data) : response.data;
        return responseData.value; // Return the array of messages directly
      } catch (error) {
        console.error("Error fetching unread emails:", error);
        return [];
      }
}

// Function to extract details from email body preview
function extractDetailsFromBody(bodyPreview) {
    const lines = bodyPreview.split('\r\n').filter(line => line.trim() !== "");



    // Check if the first line indicates it was sent from iPhone
    const iPhoneIndex = lines.findIndex(line => line.includes("Sent from my iPhone"));

    // Adjust indices to account for "Sent from my iPhone" line
    const studentName = (lines[iPhoneIndex + 1] + ' ' + lines[iPhoneIndex + 2]).trim();
    const employerName = lines[iPhoneIndex + 3];
    const studentLinkedInLinkMatch = lines[iPhoneIndex + 4];
    const employerLinkedInLinkMatch = bodyPreview.match(/(https:\/\/www\.linkedin\.com\/company\/\S+)/);

  return {
    studentName,
    employerName,
    studentLinkedInAccountLink: studentLinkedInLinkMatch || null,
    employerLinkedInAccountLink: employerLinkedInLinkMatch ? employerLinkedInLinkMatch[1] : null
  };
}

// Function to get the user ID (sub) for LinkedIn
async function getUserID() {
    try {
        const response = await axios({
          ...linkedInConfig,
          method: 'get',
          url: 'https://api.linkedin.com/v2/userinfo'
        });
        return response.data.sub; // Extract and return the sub (id)
      } catch (error) {
        console.error("Error fetching user ID:", error.response ? error.response.data : error.message);
        throw error; 
      }
}


// Function to create the LinkedIn post 
async function createLinkedInPost(studentName, employerName, studentLinkedInAccountLink, employerLinkedInAccountLink, userID) {
    const commentaries = [
        `We're proud to celebrate ${studentName}, who recently completed an internship at ${employerName}! ${studentName} gained valuable experience in during their internship.`,
        `Congratulations to ${studentName} on a successful internship at ${employerName}!`,
        `Big shoutout to ${studentName} for their dedication and hard work during their internship at ${employerName}!`,
        `We wish ${studentName} all the best as they continue their career journey after a rewarding internship at ${employerName}.`
      ];
    
      // Choose a random template
      const randomCommentary = commentaries[Math.floor(Math.random() * commentaries.length)];
    
      // Add LinkedIn links to the commentary (if available)
      let commentaryWithLinks = randomCommentary;
      if (studentLinkedInAccountLink) {
        commentaryWithLinks += `\n\nConnect with ${studentName}: ${studentLinkedInAccountLink}`;
      }
      if (employerLinkedInAccountLink) {
        commentaryWithLinks += `\nCheck out ${employerName}: ${employerLinkedInAccountLink}`;
      }
    
      const data = JSON.stringify({
        author: `urn:li:person:${userID}`, 
        lifecycleState: "PUBLISHED",
        specificContent: {  "com.linkedin.ugc.ShareContent": {
            "shareCommentary": {
              "text": commentaryWithLinks // Use the commentary with links (if any)
            },
            "shareMediaCategory": "NONE"
          } },
        visibility: { "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC" }
      });
    
      try {
        const response = await axios({
          ...linkedInConfig,
          method: 'post',
          url: 'https://api.linkedin.com/v2/ugcPosts',
          headers: { 
            ...linkedInConfig.headers, 
            'Content-Type': 'application/json' 
          },
          data
        });
        console.log("Post created:", response.data);
      } catch (error) {
        console.error("Error creating LinkedIn post:", error.response ? error.response.data : error.message);
      }
}

// Function to mark an email as read
async function markMessageAsRead(messageId) {
    const accessToken = await getAccessToken();

  const config = {
    ...outlookConfig, // Use the common configuration
    method: 'patch',
    url: `https://graph.microsoft.com/v1.0/me/messages/${messageId}`,
    headers: {
      ...outlookConfig.headers, // Use the common headers
      'Authorization': 'Bearer ' + accessToken, // Microsoft Graph authorization
      'Content-Type': 'application/json'
    },
    data: JSON.stringify({ isRead: true })
  };

  try {
    const response = await axios.request(config);
    console.log(`Message ${messageId} marked as read.`);
  } catch (error) {
    console.error(`Error marking message ${messageId} as read:`, error.response ? error.response.data : error.message);
  }
}

// Main Function
async function main() {
    try {
        await getAccessToken();
        const userID = await getUserID();

        while (true) {
            const unreadEmails = await getUnreadEmails();
            for (const email of unreadEmails) {
                const details = extractDetailsFromBody(email.bodyPreview);
                if (details.studentName && details.employerName) {
                    try {
                        await createLinkedInPost(details, userID);
                        await markMessageAsRead(email.id);
                    } catch (error) {
                        console.error(`Error processing email ${email.id}:`, error);
                        await sendErrorNotificationEmail(error, email);
                    }
                } else {
                    console.warn("Skipping email with incomplete details:", email.bodyPreview);
                }
            }
            await new Promise(resolve => setTimeout(resolve, 60 * 1000)); 
        }
    } catch (error) {
        console.error("Main function error:", error);
        // Handle the error here (e.g., send a notification, retry, or exit gracefully)
    }
}

// Start Server (for initial authorization)
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
    main().catch(console.error); // Start the main loop
});