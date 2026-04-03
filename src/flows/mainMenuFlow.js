/**
 * mainMenuFlow.js
 * Shows main menu and routes to sub-flows based on user selection.
 */

const User = require('../models/User');
const Shop = require('../models/Shop');
const { sendMessage } = require('../services/twilioService');
const { setSession, clearSession } = require('../state/sessionManager');

function getMainMenuText(ownerName, language = 'en') {
  if (language === 'hi') {
    return (
      `👋 फिर से स्वागत है, *${ownerName}*!\n\n` +
      `आप क्या करना चाहेंगे?\n\n` +
      `1️⃣ ➕ प्रोडक्ट जोड़ें\n` +
      `2️⃣ 📋 इन्वेंटरी देखें\n` +
      `3️⃣ ⚠️ लो स्टॉक देखें\n` +
      `4️⃣ 📊 आज का सारांश\n` +
      `5️⃣ ⚙️ सेटिंग्स और नोटिफिकेशन्स\n\n` +
      `कृपया एक नंबर भेजें।`
    );
  }

  return (
    `👋 Welcome back, *${ownerName}*!\n\n` +
    `What would you like to do?\n\n` +
    `1️⃣ ➕ Add Product\n` +
    `2️⃣ 📋 View Inventory\n` +
    `3️⃣ ⚠️ Check Low Stock\n` +
    `4️⃣ 📊 Today's Summary\n` +
    `5️⃣ ⚙️ Settings & Notifications\n\n` +
    `Reply with a number.`
  );
}

async function sendMainMenu(phoneNumber) {
  const user = await User.findOne({ phoneNumber });
  const language = user?.preferredLanguage || 'en';
  await clearSession(phoneNumber);

  // If user has multiple shops, ask which shop first
  const activeShops = user.shops.filter((s) => s.isActive);

  if (activeShops.length > 1 && !user.activeShopId) {
    return sendShopSelector(phoneNumber, user);
  }

  await sendMessage(phoneNumber, getMainMenuText(user.ownerName, language));
}

async function sendShopSelector(phoneNumber, user) {
  const activeShops = user.shops.filter((s) => s.isActive);
  const language = user?.preferredLanguage || 'en';
  let msg = language === 'hi'
    ? `👋 फिर से स्वागत है, *${user.ownerName}*!\n\nआज आप कौन-सी दुकान मैनेज कर रहे हैं?\n\n`
    : `👋 Welcome back, *${user.ownerName}*!\n\nWhich shop are you managing today?\n\n`;

  activeShops.forEach((s, i) => {
    msg += `${i + 1}️⃣ ${s.shopName}\n`;
  });

  msg += language === 'hi' ? `${activeShops.length + 1}️⃣ ➕ नई दुकान जोड़ें` : `${activeShops.length + 1}️⃣ ➕ Add New Shop`;

  await setSession(phoneNumber, { currentFlow: 'SHOP_SELECT', step: 'WAITING_SHOP_CHOICE', tempData: { shops: activeShops } });
  await sendMessage(phoneNumber, msg);
}

async function handleShopSelect(user, messageBody, phoneNumber) {
  const session = user.sessionState;
  const shops = session.tempData?.shops || user.shops.filter((s) => s.isActive);
  const choice = parseInt(messageBody.trim(), 10);

  if (isNaN(choice) || choice < 1) {
    await sendMessage(phoneNumber, user?.preferredLanguage === 'hi' ? `कृपया सही नंबर भेजें।` : `Please reply with a valid number.`);
    return;
  }

  if (choice === shops.length + 1) {
    // Add new shop flow
    await setSession(phoneNumber, { currentFlow: 'ADD_SHOP', step: 'WAITING_SHOP_NAME' });
    await sendMessage(phoneNumber, user?.preferredLanguage === 'hi' ? `आपकी नई दुकान का नाम क्या है?` : `What is the name of your new shop?`);
    return;
  }

  const selectedShop = shops[choice - 1];
  if (!selectedShop) {
    await sendMessage(phoneNumber, user?.preferredLanguage === 'hi' ? `गलत विकल्प। कृपया फिर से कोशिश करें।` : `Invalid choice. Please try again.`);
    return;
  }

  await User.findOneAndUpdate({ phoneNumber }, { $set: { activeShopId: selectedShop.shopId } });
  await clearSession(phoneNumber);
  const language = user?.preferredLanguage || 'en';
  const switched = language === 'hi'
    ? `✅ *${selectedShop.shopName}* पर स्विच किया गया\n\n`
    : `✅ Switched to *${selectedShop.shopName}*\n\n`;
  await sendMessage(phoneNumber, switched + getMainMenuText(user.ownerName, language));
}

async function handleAddNewShop(user, messageBody, phoneNumber) {
  const shopName = messageBody.trim();
  if (shopName.length < 2) {
    await sendMessage(phoneNumber, user?.preferredLanguage === 'hi' ? `कृपया सही दुकान का नाम दर्ज करें।` : `Please enter a valid shop name.`);
    return;
  }

  const shop = await Shop.create({ ownerId: user._id, shopName });
  await User.findOneAndUpdate(
    { phoneNumber },
    {
      $push: { shops: { shopId: shop._id, shopName, isActive: true } },
      $set: { activeShopId: shop._id },
    }
  );
  await clearSession(phoneNumber);
  const language = user?.preferredLanguage || 'en';
  const added = language === 'hi'
    ? `✅ नई दुकान *"${shopName}"* जोड़ दी गई!\n\n`
    : `✅ New shop *"${shopName}"* added!\n\n`;
  await sendMessage(phoneNumber, added + getMainMenuText(user.ownerName, language));
}

module.exports = { sendMainMenu, getMainMenuText, sendShopSelector, handleShopSelect, handleAddNewShop };
