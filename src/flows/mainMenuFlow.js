/**
 * mainMenuFlow.js
 * Shows main menu and routes to sub-flows based on user selection.
 */

const User = require('../models/User');
const Shop = require('../models/Shop');
const { sendMessage } = require('../services/twilioService');
const { setSession, clearSession } = require('../state/sessionManager');

function getMainMenuText(ownerName) {
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
  await clearSession(phoneNumber);

  // If user has multiple shops, ask which shop first
  const activeShops = user.shops.filter((s) => s.isActive);

  if (activeShops.length > 1 && !user.activeShopId) {
    return sendShopSelector(phoneNumber, user);
  }

  await sendMessage(phoneNumber, getMainMenuText(user.ownerName));
}

async function sendShopSelector(phoneNumber, user) {
  const activeShops = user.shops.filter((s) => s.isActive);
  let msg = `👋 Welcome back, *${user.ownerName}*!\n\nWhich shop are you managing today?\n\n`;

  activeShops.forEach((s, i) => {
    msg += `${i + 1}️⃣ ${s.shopName}\n`;
  });

  msg += `${activeShops.length + 1}️⃣ ➕ Add New Shop`;

  await setSession(phoneNumber, { currentFlow: 'SHOP_SELECT', step: 'WAITING_SHOP_CHOICE', tempData: { shops: activeShops } });
  await sendMessage(phoneNumber, msg);
}

async function handleShopSelect(user, messageBody, phoneNumber) {
  const session = user.sessionState;
  const shops = session.tempData?.shops || user.shops.filter((s) => s.isActive);
  const choice = parseInt(messageBody.trim(), 10);

  if (isNaN(choice) || choice < 1) {
    await sendMessage(phoneNumber, `Please reply with a valid number.`);
    return;
  }

  if (choice === shops.length + 1) {
    // Add new shop flow
    await setSession(phoneNumber, { currentFlow: 'ADD_SHOP', step: 'WAITING_SHOP_NAME' });
    await sendMessage(phoneNumber, `What is the name of your new shop?`);
    return;
  }

  const selectedShop = shops[choice - 1];
  if (!selectedShop) {
    await sendMessage(phoneNumber, `Invalid choice. Please try again.`);
    return;
  }

  await User.findOneAndUpdate({ phoneNumber }, { $set: { activeShopId: selectedShop.shopId } });
  await clearSession(phoneNumber);
  await sendMessage(phoneNumber, `✅ Switched to *${selectedShop.shopName}*\n\n` + getMainMenuText(user.ownerName));
}

async function handleAddNewShop(user, messageBody, phoneNumber) {
  const shopName = messageBody.trim();
  if (shopName.length < 2) {
    await sendMessage(phoneNumber, `Please enter a valid shop name.`);
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
  await sendMessage(phoneNumber, `✅ New shop *"${shopName}"* added!\n\n` + getMainMenuText(user.ownerName));
}

module.exports = { sendMainMenu, getMainMenuText, sendShopSelector, handleShopSelect, handleAddNewShop };
