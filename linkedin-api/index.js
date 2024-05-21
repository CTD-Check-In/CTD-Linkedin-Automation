const axios = require('axios');
require('dotenv').config();

// Configuration shared by both requests
const commonConfig = {
  maxBodyLength: Infinity,
  headers: {
    'Authorization': 'Bearer ' + process.env.LINKEDIN_TOKEN,
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
async function createLinkedInPost(studentName, employerName, linkedinAccountLink, userID) {
  const data = JSON.stringify({
    author: `urn:li:person:${userID}`, 
    lifecycleState: "PUBLISHED",
    specificContent: {  "com.linkedin.ugc.ShareContent": {
        "shareCommentary": {
          "text": `We're proud to celebrate ${studentName}, who recently completed an internship at 
          ${employerName}! ${studentName} gained valuable experience in during their internship.`
        },
        "shareMediaCategory": "NONE"
      } },
    visibility: { "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC" }
  });

  try {
    const response = await axios({
      ...commonConfig,
      method: 'post',
      url: 'https://api.linkedin.com/v2/ugcPosts',
      headers: { 
        ...commonConfig.headers, 
        'Content-Type': 'application/json' 
      },
      data
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
    await createLinkedInPost("Atrooba", "Example Corp", "https://www.linkedin.com/in/alice-example/", userID);
  } catch (error) {
    // The error from getUserID would have already been logged
    console.error("Main function error:", error);
  }
}

main(); 