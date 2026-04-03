/**
 * onboardingFlow.js
 * Handles new user registration: owner name → shop name → main menu
 */

const User = require('../models/User');
const Shop = require('../models/Shop');
const { sendMessage } = require('../services/twilioService');
const { setSession, clearSession } = require('../state/sessionManager');
const { getMainMenuText: getMainMenu, sendMainMenu } = require('./mainMenuFlow');

async function handleOnboarding(user, messageBody, phoneNumber) {
  const step = user.sessionState?.step;
  const language = user?.preferredLanguage || 'en';
  const t = (en, hi) => (language === 'hi' ? hi : en);

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
      t(
        `🙏 *Namaste! Welcome to StoreMate AI!*\n\nI'm your personal inventory assistant. I'll help you manage your shop stock via WhatsApp.\n\nFirst, what is your *name*?`,
        `🙏 *नमस्ते! StoreMate AI में आपका स्वागत है!*\n\nमैं आपका पर्सनल इन्वेंटरी असिस्टेंट हूं। मैं WhatsApp पर आपकी दुकान का स्टॉक मैनेज करने में मदद करूंगा।\n\nसबसे पहले, आपका *नाम* क्या है?`
      )
    );
    console.log('✓ Welcome message sent');
    return;
  }

  // ── Step 2: Save name, ask for shop name ───────────────────────────────────
  if (step === 'WAITING_NAME') {
    console.log('→ Saving name & asking for shop...');
    const ownerName = messageBody.trim();
    if (ownerName.length < 2) {
      await sendMessage(phoneNumber, t(`Please enter a valid name (at least 2 characters).`, `कृपया सही नाम दर्ज करें (कम से कम 2 अक्षर)।`));
      return;
    }
    await User.findOneAndUpdate({ phoneNumber }, { $set: { ownerName } });
    await setSession(phoneNumber, { step: 'WAITING_SHOP', tempData: { ownerName } });
    await sendMessage(
      phoneNumber,
      t(
        `Nice to meet you, *${ownerName}*! 😊\n\nWhat is the name of your *shop*?\n_(You can add more shops later)_`,
        `आपसे मिलकर खुशी हुई, *${ownerName}*! 😊\n\nआपकी *दुकान* का नाम क्या है?\n_(आप बाद में और दुकानें जोड़ सकते हैं)_`
      )
    );
    console.log(`✓ Name saved: ${ownerName}`);
    return;
  }

  // ── Step 3: Save shop, complete onboarding ─────────────────────────────────
  if (step === 'WAITING_SHOP') {
    console.log('→ Saving shop & completing onboarding...');
    const shopName = messageBody.trim();
    if (shopName.length < 2) {
      await sendMessage(phoneNumber, t(`Please enter a valid shop name.`, `कृपया सही दुकान का नाम दर्ज करें।`));
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
      t(
        `✅ Shop *"${shopName}"* created!\n\nYou're all set. Here's what I can do:\n\n1️⃣ ➕ Add Product\n2️⃣ 📋 View Inventory\n3️⃣ ⚠️ Check Low Stock\n4️⃣ 📊 Today's Summary\n5️⃣ ⚙️ Settings & Notifications\n\nReply with a number to continue.`,
        `✅ दुकान *"${shopName}"* बन गई!\n\nअब सब तैयार है। मैं ये कर सकता हूं:\n\n1️⃣ ➕ प्रोडक्ट जोड़ें\n2️⃣ 📋 इन्वेंटरी देखें\n3️⃣ ⚠️ लो स्टॉक देखें\n4️⃣ 📊 आज का सारांश\n5️⃣ ⚙️ सेटिंग्स और नोटिफिकेशन्स\n\nआगे बढ़ने के लिए नंबर भेजें।`
      )
    );
    console.log(`✓ Onboarding complete for ${phoneNumber}`);
  }
}

module.exports = { handleOnboarding };
