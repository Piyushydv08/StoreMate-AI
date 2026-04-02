/**
 * notificationFlow.js
 * Handles notification settings: change morning/evening time, enable/disable.
 */

const User = require('../models/User');
const { sendMessage } = require('../services/twilioService');
const { setSession, clearSession } = require('../state/sessionManager');
const { getDailySummary } = require('../services/inventoryService');
const { formatDate, daysUntil: daysUntilExpiry } = require('../utils/dateParser');
const { sendMainMenu } = require('./mainMenuFlow');
const { withNav, isBack, isHome } = require('../utils/navHelper');

// ── Settings Menu ─────────────────────────────────────────────────────────────

async function startSettings(phoneNumber) {
  const user = await User.findOne({ phoneNumber });
  const { morningTime, eveningTime, enabled } = user.notificationSettings;

  await setSession(phoneNumber, { currentFlow: 'SETTINGS', step: 'WAITING_SETTING_CHOICE' });
  await sendMessage(
    phoneNumber,
    `⚙️ *Settings & Notifications*\n\n` +
    `Current schedule:\n` +
    `☀️ Morning reminder: *${morningTime}*\n` +
    `🌙 Evening reminder: *${eveningTime}*\n` +
    `🔔 Notifications: *${enabled ? 'ON ✅' : 'OFF ❌'}*\n\n` +
    `1️⃣ Change Morning Time\n` +
    `2️⃣ Change Evening Time\n` +
    `3️⃣ ${enabled ? 'Disable' : 'Enable'} Notifications\n` +
    `4️⃣ ➕ Add New Shop\n` +
    `5️⃣ 🏠 Main Menu`
  );
}

// ── Daily Summary ─────────────────────────────────────────────────────────────

async function startDailySummary(phoneNumber) {
  const user = await User.findOne({ phoneNumber });
  const shopId = user.activeShopId;
  const shopName = user.shops.find((s) => String(s.shopId) === String(shopId))?.shopName || 'Your Shop';

  const { totalProducts, lowStock, expiring7 } = await getDailySummary(shopId);

  let msg = `📊 *Today's Summary — ${shopName}*\n📅 ${new Date().toDateString()}\n\n`;
  msg += `🏷️ Total Products: *${totalProducts}*\n`;
  msg += `📦 Low Stock (≤3 units): *${lowStock.length} items*\n`;
  msg += `⚠️ Expiring in 7 days: *${expiring7.length} items*\n`;
  msg += `✅ Healthy products: *${totalProducts - lowStock.length - expiring7.length}*\n\n`;

  if (lowStock.length > 0) {
    msg += `⚠️ *Low Stock:*\n`;
    lowStock.slice(0, 5).forEach((p) => { msg += `• ${p.name} — ${p.quantity} units\n`; });
    msg += '\n';
  }

  if (expiring7.length > 0) {
    msg += `📅 *Expiring Soon:*\n`;
    expiring7.slice(0, 5).forEach((p) => {
      const d = daysUntilExpiry(p.expiryDate);
      msg += `• ${p.name} — ${d} days (${formatDate(p.expiryDate)})\n`;
    });
    msg += '\n';
  }

  msg += `1️⃣ Restock Low Items\n2️⃣ View Full Inventory\n3️⃣ View Expiry Alerts\n4️⃣ 🏠 Main Menu`;

  await sendMessage(phoneNumber, withNav(msg));
  await setSession(phoneNumber, { currentFlow: 'SUMMARY', step: 'WAITING_SUMMARY_ACTION' });
}

// ── Main Settings/Notification Flow Router ────────────────────────────────────

async function handleNotificationFlow(user, messageBody, phoneNumber) {
  const step = user.sessionState?.step;

  // Global HOME / BACK
  if (isHome(messageBody)) return sendMainMenu(phoneNumber);
  if (isBack(messageBody)) return sendMainMenu(phoneNumber);

  if (step === 'WAITING_SETTING_CHOICE') {
    const choice = parseInt(messageBody.trim(), 10);
    if (choice === 1) {
      await setSession(phoneNumber, { step: 'WAITING_MORNING_TIME' });
      await sendMessage(phoneNumber, withNav(`☀️ Enter new *morning reminder time*:\n_(Format: HH:MM in 24h, e.g., 07:30 or 08:00)_`));
    } else if (choice === 2) {
      await setSession(phoneNumber, { step: 'WAITING_EVENING_TIME' });
      await sendMessage(phoneNumber, withNav(`🌙 Enter new *evening reminder time*:\n_(Format: HH:MM in 24h, e.g., 20:00 or 21:30)_`));
    } else if (choice === 3) {
      const current = user.notificationSettings.enabled;
      await User.findOneAndUpdate({ phoneNumber }, { $set: { 'notificationSettings.enabled': !current } });
      await clearSession(phoneNumber);
      await sendMessage(phoneNumber, withNav(`🔔 Notifications *${!current ? 'enabled ✅' : 'disabled ❌'}* successfully.\n\n1️⃣ ⚙️ Back to Settings\n2️⃣ 🏠 Main Menu`));
      await setSession(phoneNumber, { currentFlow: 'SETTINGS', step: 'WAITING_POST_SETTINGS' });
    } else if (choice === 4) {
      await setSession(phoneNumber, { currentFlow: 'ADD_SHOP', step: 'WAITING_SHOP_NAME' });
      await sendMessage(phoneNumber, withNav(`🏪 Enter the name of your new shop:`));
    } else {
      await sendMainMenu(phoneNumber);
    }
    return;
  }

  if (step === 'WAITING_MORNING_TIME') {
    const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;
    if (!timeRegex.test(messageBody.trim())) {
      await sendMessage(phoneNumber, `❌ Invalid format. Please use HH:MM (e.g., 08:00 or 07:30).`);
      return;
    }
    await User.findOneAndUpdate({ phoneNumber }, { $set: { 'notificationSettings.morningTime': messageBody.trim() } });
    await clearSession(phoneNumber);
    await sendMessage(phoneNumber, `✅ Morning reminder set to *${messageBody.trim()}*.\n\n1️⃣ ⚙️ Back to Settings\n2️⃣ 🏠 Main Menu`);
    await setSession(phoneNumber, { currentFlow: 'SETTINGS', step: 'WAITING_POST_SETTINGS' });
    return;
  }

  if (step === 'WAITING_EVENING_TIME') {
    const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;
    if (!timeRegex.test(messageBody.trim())) {
      await sendMessage(phoneNumber, `❌ Invalid format. Please use HH:MM (e.g., 21:00).`);
      return;
    }
    await User.findOneAndUpdate({ phoneNumber }, { $set: { 'notificationSettings.eveningTime': messageBody.trim() } });
    await clearSession(phoneNumber);
    await sendMessage(phoneNumber, `✅ Evening reminder set to *${messageBody.trim()}*.\n\n1️⃣ ⚙️ Back to Settings\n2️⃣ 🏠 Main Menu`);
    await setSession(phoneNumber, { currentFlow: 'SETTINGS', step: 'WAITING_POST_SETTINGS' });
    return;
  }

  if (step === 'WAITING_POST_SETTINGS') {
    const choice = parseInt(messageBody.trim(), 10);
    if (choice === 1) await startSettings(phoneNumber);
    else await sendMainMenu(phoneNumber);
    return;
  }

  if (step === 'WAITING_SUMMARY_ACTION') {
    const choice = parseInt(messageBody.trim(), 10);
    if (choice === 1 || choice === 2) {
      const { startInventoryView } = require('./inventoryFlow');
      await startInventoryView(phoneNumber);
    } else if (choice === 3) {
      // View expiry alerts — route to low stock / expiry view
      const { startLowStockView } = require('./inventoryFlow');
      await startLowStockView(phoneNumber);
    } else {
      await sendMainMenu(phoneNumber);
    }
    return;
  }

  await sendMainMenu(phoneNumber);
}

module.exports = { startSettings, startDailySummary, handleNotificationFlow };
