const axios = require('axios');
require('dotenv').config();
      
const GROUP_ID = process.env.GROUP_ID;   

// Configuration shared by both requests
const commonConfig = {
  maxBodyLength: Infinity,
  headers: {
    'Authorization': 'Bearer ' + process.env.LINKEDIN_TOKEN,
    'X-Restli-Protocol-Version': '2.0.0', // Required for LinkedIn API
    'Cookie': `bcookie="${process.env.BCOOKIE}"` 
  }
};

// Function to get the user ID (sub)
async function getUserID() {
  try {
    const response = await axios({
      ...commonConfig,
      method: 'get',
      url: 'https://api.linkedin.com/v2/userinfo'
    });
    return response.data.sub; // Extract and return the sub
  } catch (error) {
    console.error("Error fetching user ID:", error.response ? error.response.data : error.message);
    throw error; // Re-throw the error to stop further execution
  }
}

// Function to create the LinkedIn post
async function createLinkedInPost(studentName, employerName, userID) {
    const commentaries = [
        `We're proud to celebrate ${studentName}, who recently completed an internship at ${employerName}! ${studentName} gained valuable experience in during their internship.`,
        `Congratulations to ${studentName} on a successful internship at ${employerName}!`,
        `Big shoutout to ${studentName} for their dedication and hard work during their internship at ${employerName}!`,
        `We wish ${studentName} all the best as they continue their career journey after a rewarding internship at ${employerName}.`
      ]
  
    const randomCommentary = commentaries[Math.floor(Math.random() * commentaries.length)];
  
    const data = {
      "author": `urn:li:person:${userID}`,
      "containerEntity": `urn:li:group:${GROUP_ID}`, 
      "lifecycleState": "PUBLISHED",
      "specificContent": {
        "com.linkedin.ugc.ShareContent": {
          "shareCommentary": {
            "text": randomCommentary
          },
          "shareMediaCategory": "NONE"
        }
      },
      "visibility": {
        "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC"
      }
    };
  
    try {
      const response = await axios({
        ...commonConfig,
        method: 'post',
        url: 'https://api.linkedin.com/v2/ugcPosts',
        headers: {
          ...commonConfig.headers,
          'Content-Type': 'application/json' 
        },
        data: JSON.stringify(data) // Important: Stringify the data object
      });
  
      console.log("Post created:", response.data);
    } catch (error) {
      console.error("Error creating LinkedIn post:", error.response ? error.response.data : error.message);
    }
  }

// Main function 
async function main() {
  try {
    const userID = await getUserID();
    console.log("Fetched user ID:", userID);

    // Example:
    await createLinkedInPost("Atrooba", "Example Corp", userID);
  } catch (error) {
    // The error from getUserID would have already been logged
    console.error("Main function error:", error);
  }
}

main(); 