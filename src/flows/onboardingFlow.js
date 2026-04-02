/**
 * onboardingFlow.js
 * Handles new user registration: owner name → shop name → main menu
 */

const User = require('../models/User');
const Shop = require('../models/Shop');
const { sendMessage } = require('../services/twilioService');
const { setSession, clearSession } = require('../state/sessionManager');
const { getMainMenu } = require('./mainMenuFlow');

async function handleOnboarding(user, messageBody, phoneNumber) {
  const step = user.sessionState?.step;

  console.log(`\n🎯 ─────────────────────────────────────────────────────────────────`);
  console.log(`🎯 ONBOARDING FLOW`);
  console.log(`   📱 User: ${phoneNumber}`);
  console.log(`   👤 Onboarded: ${user.isOnboarded}`);
  console.log(`   📍 Step: ${step || 'INITIAL'}`);
  console.log(`🎯 ─────────────────────────────────────────────────────────────────\n`);

  // ── Step 1: Ask for owner name ─────────────────────────────────────────────
  if (!step || step === 'ASK_NAME') {
    console.log('→ Sending welcome message & asking for name...');
    await setSession(phoneNumber, { currentFlow: 'ONBOARDING', step: 'WAITING_NAME' });
    await sendMessage(
      phoneNumber,
      `🙏 *Namaste! Welcome to StoreMate AI!*\n\nI'm your personal inventory assistant. I'll help you manage your shop stock via WhatsApp.\n\nFirst, what is your *name*?`
    );
    console.log('✓ Welcome message sent');
    return;
  }

  // ── Step 2: Save name, ask for shop name ───────────────────────────────────
  if (step === 'WAITING_NAME') {
    console.log('→ Saving name & asking for shop...');
    const ownerName = messageBody.trim();
    if (ownerName.length < 2) {
      await sendMessage(phoneNumber, `Please enter a valid name (at least 2 characters).`);
      return;
    }
    await User.findOneAndUpdate({ phoneNumber }, { $set: { ownerName } });
    await setSession(phoneNumber, { step: 'WAITING_SHOP', tempData: { ownerName } });
    await sendMessage(
      phoneNumber,
      `Nice to meet you, *${ownerName}*! 😊\n\nWhat is the name of your *shop*?\n_(You can add more shops later)_`
    );
    console.log(`✓ Name saved: ${ownerName}`);
    return;
  }

  // ── Step 3: Save shop, complete onboarding ─────────────────────────────────
  if (step === 'WAITING_SHOP') {
    console.log('→ Saving shop & completing onboarding...');
    const shopName = messageBody.trim();
    if (shopName.length < 2) {
      await sendMessage(phoneNumber, `Please enter a valid shop name.`);
      return;
    }

    const user2 = await User.findOne({ phoneNumber });

    // Create shop document
    const shop = await Shop.create({ ownerId: user2._id, shopName });

    // Update user
    await User.findOneAndUpdate(
      { phoneNumber },
      {
        $push: { shops: { shopId: shop._id, shopName, isActive: true } },
        $set: { activeShopId: shop._id, isOnboarded: true },
      }
    );

    await clearSession(phoneNumber);

    console.log(`✓ Shop created: ${shopName}`);
    await sendMessage(
      phoneNumber,
      `✅ Shop *"${shopName}"* created!\n\nYou're all set. Here's what I can do:\n\n1️⃣ ➕ Add Product\n2️⃣ 📋 View Inventory\n3️⃣ ⚠️ Check Low Stock\n4️⃣ 📊 Today's Summary\n5️⃣ ⚙️ Settings & Notifications\n\nReply with a number to continue.`
    );
    console.log(`✓ Onboarding complete for ${phoneNumber}`);
  }
}

module.exports = { handleOnboarding };
