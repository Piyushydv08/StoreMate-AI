const twilio = require('twilio');

const client = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

const FROM = process.env.TWILIO_WHATSAPP_NUMBER; // whatsapp:+14155238886

/**
 * Send a WhatsApp message via Twilio
 * @param {string} to - phone number like "whatsapp:+919876543210"
 * @param {string} body - message text
 */
async function sendMessage(to, body) {
  try {
    // Ensure 'whatsapp:' prefix
    const toFormatted = to.startsWith('whatsapp:') ? to : `whatsapp:${to}`;
    const msg = await client.messages.create({
      from: FROM,
      to: toFormatted,
      body
    });
    console.log(`\n📤 ─────────────────────────────────────────────────────────────────`);
    console.log(`📤 MESSAGE SENT TO WHATSAPP`);
    console.log(`📱 To: ${toFormatted}`);
    console.log(`💬 Message: ${body.substring(0, 100)}${body.length > 100 ? '...' : ''}`);
    console.log(`🆔 MessageSid: ${msg.sid}`);
    console.log(`📤 ─────────────────────────────────────────────────────────────────\n`);
    return msg;
  } catch (err) {
    console.error('❌ Twilio send error:', err.message);
    throw err;
  }
}

module.exports = { sendMessage };
