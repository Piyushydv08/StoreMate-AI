const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const TEMP_DIR = path.join(__dirname, '../../temp');

// Ensure temp dir exists
if (!fs.existsSync(TEMP_DIR)) {
  fs.mkdirSync(TEMP_DIR, { recursive: true });
}

/**
 * Download a Twilio media URL (authenticated) to a temp file
 * @param {string} mediaUrl - Twilio media URL
 * @param {string} ext - File extension (jpg, png)
 * @returns {string} Local file path
 */
async function downloadMedia(mediaUrl, ext = 'jpg') {
  const filename = `${uuidv4()}.${ext}`;
  const filePath = path.join(TEMP_DIR, filename);

  const response = await axios({
    method: 'GET',
    url: mediaUrl,
    responseType: 'stream',
    auth: {
      username: process.env.TWILIO_ACCOUNT_SID,
      password: process.env.TWILIO_AUTH_TOKEN,
    },
  });

  return new Promise((resolve, reject) => {
    const writer = fs.createWriteStream(filePath);
    response.data.pipe(writer);
    writer.on('finish', () => resolve(filePath));
    writer.on('error', reject);
  });
}

/**
 * Delete a temp file (cleanup after processing)
 */
function deleteTempFile(filePath) {
  try {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  } catch (err) {
    console.warn('Could not delete temp file:', filePath);
  }
}

module.exports = { downloadMedia, deleteTempFile };
