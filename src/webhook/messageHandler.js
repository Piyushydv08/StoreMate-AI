/**
 * messageHandler.js
 * Central webhook router — receives all WhatsApp messages from Twilio
 * and routes them to the appropriate flow based on session state.
 */

const express = require('express');
const router = express.Router();
const User = require('../models/User');
const { sendMessage } = require('../services/twilioService');
const { getSession, clearSession } = require('../state/sessionManager');
const hinglishMap = require('../utils/hinglishMap');

// Helper: check if message is a menu/home request
function isMenuRequest(text) {
  const t = text.toLowerCase().trim();
  return ['menu', 'home', 'main', 'start', 'back'].includes(t);
}

// Helper: check if message is a yes-like confirmation
function isYes(text) {
  const t = (hinglishMap[text.toLowerCase().trim()] || text).toLowerCase().trim();
  return t === 'yes';
}

// Helper: check if message is a no-like response
function isNo(text) {
  const t = (hinglishMap[text.toLowerCase().trim()] || text).toLowerCase().trim();
  return t === 'no';
}
const { detectIntent } = require('../services/nlpService');
const { isBack, isHome } = require('../utils/navHelper');

// ── Flow Handlers ─────────────────────────────────────────────────────────────
const { handleOnboarding } = require('../flows/onboardingFlow');
const { sendMainMenu, handleShopSelect, handleAddNewShop } = require('../flows/mainMenuFlow');
const { startAddProduct, handleAddProduct } = require('../flows/addProductFlow');
const { startInventoryView, startLowStockView, handleInventoryFlow } = require('../flows/inventoryFlow');
const { startSettings, startDailySummary, handleNotificationFlow } = require('../flows/notificationFlow');

// ── Twilio Webhook POST /webhook ──────────────────────────────────────────────

router.post('/', async (req, res) => {
  // Always respond 200 immediately to Twilio to avoid retries
  res.status(200).send('OK');

  let phoneNumber;
  try {
    const { From, Body, MediaUrl0, MediaContentType0 } = req.body;

    if (!From || !Body === undefined) return;

    phoneNumber = From; // e.g. "whatsapp:+919876543210"
    const messageBody = (Body || '').trim();
    const mediaUrl = MediaUrl0 || null;
    const mediaType = MediaContentType0 || null;

    console.log(`\n💬 ═══════════════════════════════════════════════════════════════════`);
    console.log(`📱 From: ${phoneNumber}`);
    console.log(`💭 Message: "${messageBody}"`);
    if (mediaUrl) console.log(`📷 Media: ${mediaType}`);
    console.log(`💬 ═══════════════════════════════════════════════════════════════════\n`);

    // ── Get or create user ─────────────────────────────────────────────────
    let user = await User.findOne({ phoneNumber });
    if (!user) {
      console.log(`   👤 New user creating...`);
      user = await User.create({ phoneNumber, sessionState: { currentFlow: 'ONBOARDING', step: 'ASK_NAME', tempData: {} } });
      console.log(`   ✓ New user created: ${user._id}`);
    } else {
      console.log(`   👤 Existing user found: isOnboarded=${user.isOnboarded}`);
    }

    // ── Global: "home", "menu" keywords ────────────────────────────────────
    if (isHome(messageBody) && user.isOnboarded) {
      await sendMainMenu(phoneNumber);
      return;
    }

    // ── Global: "help" keyword ────────────────────────────────────────────
    if (/^help$/i.test(messageBody.trim())) {
      await sendMessage(
        phoneNumber,
        `🆘 *StoreMate AI Help*\n\n` +
        `Commands you can use:\n` +
        `• Type *menu* or *home* anytime to return to the main menu\n` +
        `• Type *back* to go to the previous step\n` +
        `• Type *1-5* to choose options\n` +
        `• Type *YES/NO* or *ha/nahi* to confirm\n` +
        `• Type *SKIP* to skip optional fields\n\n` +
        `💡 You can also just type naturally:\n` +
        `   _"add product", "check inventory", "low stock", "today's summary"_\n\n` +
        `🌐 Hinglish supported!\n\nNeed help? Reply *menu* to start over.`
      );
      return;
    }

    const session = await getSession(phoneNumber);
    const currentFlow = session?.currentFlow;

    console.log(`   🎯 Current Flow: ${currentFlow || 'NONE'}`);

    // ── Route based on onboarding status ──────────────────────────────────
    if (!user.isOnboarded || currentFlow === 'ONBOARDING') {
      console.log(`   → Routing to ONBOARDING...`);
      await handleOnboarding(user, messageBody, phoneNumber);
      return;
    }

    // ── Route based on current flow ────────────────────────────────────────
    switch (currentFlow) {
      case 'SHOP_SELECT':
        await handleShopSelect(user, messageBody, phoneNumber);
        break;

      case 'ADD_SHOP':
        await handleAddNewShop(user, messageBody, phoneNumber);
        break;

      case 'ADD_PRODUCT':
      case 'POST_ADD':
      case 'POST_CANCEL':
        // Reload user with fresh session
        user = await User.findOne({ phoneNumber });
        await handleAddProduct(user, messageBody, mediaUrl, mediaType, phoneNumber);
        break;

      case 'INVENTORY':
      case 'LOW_STOCK':
      case 'POST_SELL':
      case 'POST_UPDATE':
        user = await User.findOne({ phoneNumber });
        await handleInventoryFlow(user, messageBody, phoneNumber);
        break;

      case 'SETTINGS':
      case 'SUMMARY':
        user = await User.findOne({ phoneNumber });
        await handleNotificationFlow(user, messageBody, phoneNumber);
        break;

      default:
        // No active flow → treat as main menu selection
        await handleMainMenuSelection(user, messageBody, mediaUrl, mediaType, phoneNumber);
        break;
    }
  } catch (err) {
    console.error('\n❌ ─────────────────────────────────────────────────────────────────');
    console.error('❌ WEBHOOK ERROR - Message not processed');
    console.error('❌ Error:', err.message);
    console.error('❌ Stack:', err.stack);
    console.error('❌ ─────────────────────────────────────────────────────────────────\n');
    
    // Send error message to user
    try {
      await sendMessage(phoneNumber, '❌ Sorry, there was an error processing your message. Please try again or type *menu*');
    } catch (sendErr) {
      console.error('❌ Failed to send error message:', sendErr.message);
    }
  }
});

// ── Main Menu Selection Handler ───────────────────────────────────────────────

async function handleMainMenuSelection(user, messageBody, mediaUrl, mediaType, phoneNumber) {
  // If user has multiple shops and no active shop, show shop selector first
  const activeShops = user.shops.filter((s) => s.isActive);
  if (activeShops.length > 1 && !user.activeShopId) {
    const { sendShopSelector } = require('../flows/mainMenuFlow');
    await sendShopSelector(phoneNumber, user);
    return;
  }

  // Try numeric choice first
  const choice = parseInt(messageBody.trim(), 10);
  if (!isNaN(choice) && choice >= 1 && choice <= 5) {
    switch (choice) {
      case 1: return startAddProduct(phoneNumber);
      case 2: return startInventoryView(phoneNumber);
      case 3: return startLowStockView(phoneNumber);
      case 4: return startDailySummary(phoneNumber);
      case 5: return startSettings(phoneNumber);
    }
  }

  // Fallback: NLP intent detection for free-text messages
  const intent = detectIntent(messageBody);
  console.log(`   🧠 NLP Intent detected: ${intent} for message: "${messageBody}"`);

  switch (intent) {
    case 'ADD_PRODUCT':    return startAddProduct(phoneNumber);
    case 'VIEW_INVENTORY': return startInventoryView(phoneNumber);
    case 'LOW_STOCK':      return startLowStockView(phoneNumber);
    case 'DAILY_SUMMARY':  return startDailySummary(phoneNumber);
    case 'SETTINGS':       return startSettings(phoneNumber);
    case 'MAIN_MENU':      return sendMainMenu(phoneNumber);
    case 'HELP':
      await sendMessage(
        phoneNumber,
        `🆘 *StoreMate AI Help*\n\nCommands:\n• *menu* / *home* — main menu\n• *back* — previous step\n• *1-5* — choose options\n• *YES/NO* — confirm\n• *SKIP* — skip fields\n\n💡 Or just type naturally: _"add product"_, _"check stock"_, _"today's sales"_`
      );
      return;
    default:
      // Truly unknown — gently guide back to menu
      await sendMessage(
        phoneNumber,
        `🤔 I didn't quite understand that.\n\n` +
        `You can type:\n• *menu* to see options\n• *add product* to add a product\n• *inventory* to view stock\n• *help* for more commands`
      );
  }
}

module.exports = router;
