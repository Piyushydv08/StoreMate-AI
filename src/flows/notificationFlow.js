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

function getSettingsText(user) {
  const { morningTime, eveningTime, enabled } = user.notificationSettings;
  const language = user.preferredLanguage || 'en';

  if (language === 'hi') {
    return (
      `⚙️ *सेटिंग्स और नोटिफिकेशन्स*\n\n` +
      `मौजूदा शेड्यूल:\n` +
      `☀️ सुबह रिमाइंडर: *${morningTime}*\n` +
      `🌙 शाम रिमाइंडर: *${eveningTime}*\n` +
      `🔔 नोटिफिकेशन्स: *${enabled ? 'चालू ✅' : 'बंद ❌'}*\n` +
      `🌐 भाषा: *हिंदी*\n\n` +
      `1️⃣ सुबह का समय बदलें\n` +
      `2️⃣ शाम का समय बदलें\n` +
      `3️⃣ ${enabled ? 'नोटिफिकेशन्स बंद करें' : 'नोटिफिकेशन्स चालू करें'}\n` +
      `4️⃣ ➕ नई दुकान जोड़ें\n` +
      `5️⃣ 🌐 भाषा बदलें\n` +
      `6️⃣ 🏠 मुख्य मेन्यू`
    );
  }

  return (
    `⚙️ *Settings & Notifications*\n\n` +
    `Current schedule:\n` +
    `☀️ Morning reminder: *${morningTime}*\n` +
    `🌙 Evening reminder: *${eveningTime}*\n` +
    `🔔 Notifications: *${enabled ? 'ON ✅' : 'OFF ❌'}*\n` +
    `🌐 Language: *${language === 'hi' ? 'Hindi' : 'English'}*\n\n` +
    `1️⃣ Change Morning Time\n` +
    `2️⃣ Change Evening Time\n` +
    `3️⃣ ${enabled ? 'Disable' : 'Enable'} Notifications\n` +
    `4️⃣ ➕ Add New Shop\n` +
    `5️⃣ 🌐 Change Language\n` +
    `6️⃣ 🏠 Main Menu`
  );
}

// ── Settings Menu ─────────────────────────────────────────────────────────────

async function startSettings(phoneNumber) {
  const user = await User.findOne({ phoneNumber });

  await setSession(phoneNumber, { currentFlow: 'SETTINGS', step: 'WAITING_SETTING_CHOICE' });
  await sendMessage(phoneNumber, getSettingsText(user));
}

// ── Daily Summary ─────────────────────────────────────────────────────────────

async function startDailySummary(phoneNumber) {
  const user = await User.findOne({ phoneNumber });
  const language = user?.preferredLanguage || 'en';
  const shopId = user.activeShopId;
  const shopName = user.shops.find((s) => String(s.shopId) === String(shopId))?.shopName || 'Your Shop';

  const { totalProducts, lowStock, expiring7 } = await getDailySummary(shopId);

  let msg = language === 'hi'
    ? `📊 *आज का सारांश — ${shopName}*\n📅 ${new Date().toDateString()}\n\n`
    : `📊 *Today's Summary — ${shopName}*\n📅 ${new Date().toDateString()}\n\n`;
  msg += language === 'hi' ? `🏷️ कुल प्रोडक्ट: *${totalProducts}*\n` : `🏷️ Total Products: *${totalProducts}*\n`;
  msg += language === 'hi' ? `📦 लो स्टॉक (≤3 units): *${lowStock.length} आइटम*\n` : `📦 Low Stock (≤3 units): *${lowStock.length} items*\n`;
  msg += language === 'hi' ? `⚠️ 7 दिनों में एक्सपायर: *${expiring7.length} आइटम*\n` : `⚠️ Expiring in 7 days: *${expiring7.length} items*\n`;
  msg += language === 'hi'
    ? `✅ स्वस्थ प्रोडक्ट: *${totalProducts - lowStock.length - expiring7.length}*\n\n`
    : `✅ Healthy products: *${totalProducts - lowStock.length - expiring7.length}*\n\n`;

  if (lowStock.length > 0) {
    msg += language === 'hi' ? `⚠️ *लो स्टॉक:*\n` : `⚠️ *Low Stock:*\n`;
    lowStock.slice(0, 5).forEach((p) => {
      msg += language === 'hi'
        ? `• ${p.name} — ${p.quantity} यूनिट\n`
        : `• ${p.name} — ${p.quantity} units\n`;
    });
    msg += '\n';
  }

  if (expiring7.length > 0) {
    msg += language === 'hi' ? `📅 *जल्द एक्सपायर होने वाले:*\n` : `📅 *Expiring Soon:*\n`;
    expiring7.slice(0, 5).forEach((p) => {
      const d = daysUntilExpiry(p.expiryDate);
      msg += language === 'hi'
        ? `• ${p.name} — ${d} दिन (${formatDate(p.expiryDate)})\n`
        : `• ${p.name} — ${d} days (${formatDate(p.expiryDate)})\n`;
    });
    msg += '\n';
  }

  msg += language === 'hi'
    ? `1️⃣ लो स्टॉक आइटम में स्टॉक जोड़ें\n2️⃣ पूरी इन्वेंटरी देखें\n3️⃣ एक्सपायरी अलर्ट देखें\n4️⃣ 🏠 मुख्य मेन्यू`
    : `1️⃣ Restock Low Items\n2️⃣ View Full Inventory\n3️⃣ View Expiry Alerts\n4️⃣ 🏠 Main Menu`;

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
    const language = user?.preferredLanguage || 'en';
    const choice = parseInt(messageBody.trim(), 10);
    if (choice === 1) {
      await setSession(phoneNumber, { step: 'WAITING_MORNING_TIME' });
      await sendMessage(phoneNumber, withNav(language === 'hi'
        ? `☀️ नया *सुबह रिमाइंडर समय* दर्ज करें:\n_(Format: HH:MM, जैसे 07:30 या 08:00)_`
        : `☀️ Enter new *morning reminder time*:\n_(Format: HH:MM in 24h, e.g., 07:30 or 08:00)_`));
    } else if (choice === 2) {
      await setSession(phoneNumber, { step: 'WAITING_EVENING_TIME' });
      await sendMessage(phoneNumber, withNav(language === 'hi'
        ? `🌙 नया *शाम रिमाइंडर समय* दर्ज करें:\n_(Format: HH:MM, जैसे 20:00 या 21:30)_`
        : `🌙 Enter new *evening reminder time*:\n_(Format: HH:MM in 24h, e.g., 20:00 or 21:30)_`));
    } else if (choice === 3) {
      const current = user.notificationSettings.enabled;
      await User.findOneAndUpdate({ phoneNumber }, { $set: { 'notificationSettings.enabled': !current } });
      await clearSession(phoneNumber);
      await sendMessage(phoneNumber, withNav(language === 'hi'
        ? `🔔 नोटिफिकेशन्स सफलतापूर्वक *${!current ? 'चालू ✅' : 'बंद ❌'}* किए गए।\n\n1️⃣ ⚙️ सेटिंग्स पर वापस जाएं\n2️⃣ 🏠 मुख्य मेन्यू`
        : `🔔 Notifications *${!current ? 'enabled ✅' : 'disabled ❌'}* successfully.\n\n1️⃣ ⚙️ Back to Settings\n2️⃣ 🏠 Main Menu`));
      await setSession(phoneNumber, { currentFlow: 'SETTINGS', step: 'WAITING_POST_SETTINGS' });
    } else if (choice === 4) {
      await setSession(phoneNumber, { currentFlow: 'ADD_SHOP', step: 'WAITING_SHOP_NAME' });
      await sendMessage(phoneNumber, withNav(language === 'hi' ? `🏪 अपनी नई दुकान का नाम दर्ज करें:` : `🏪 Enter the name of your new shop:`));
    } else if (choice === 5) {
      await setSession(phoneNumber, { currentFlow: 'SETTINGS', step: 'WAITING_LANGUAGE_CHOICE' });
      await sendMessage(phoneNumber, withNav(
        language === 'hi'
          ? `🌐 भाषा चुनें:\n1️⃣ English\n2️⃣ हिंदी\n\nनंबर भेजें (1 या 2)।`
          : `🌐 Choose language:\n1️⃣ English\n2️⃣ हिंदी\n\nReply with 1 or 2.`
      ));
    } else if (choice === 6) {
      await sendMainMenu(phoneNumber);
    } else {
      await sendMainMenu(phoneNumber);
    }
    return;
  }

  if (step === 'WAITING_LANGUAGE_CHOICE') {
    const norm = messageBody.trim().toLowerCase();
    const nextLang = (norm === '2' || norm === 'hindi' || norm === 'hi') ? 'hi'
      : (norm === '1' || norm === 'english' || norm === 'en') ? 'en'
        : null;

    if (!nextLang) {
      const language = user?.preferredLanguage || 'en';
      await sendMessage(phoneNumber, withNav(
        language === 'hi'
          ? `कृपया 1 (English) या 2 (हिंदी) भेजें।`
          : `Please reply with 1 (English) or 2 (हिंदी).`
      ));
      return;
    }

    await User.findOneAndUpdate({ phoneNumber }, { $set: { preferredLanguage: nextLang } });
    await clearSession(phoneNumber);
    await sendMessage(
      phoneNumber,
      withNav(nextLang === 'hi'
        ? `✅ भाषा *हिंदी* में बदल दी गई।\n\n1️⃣ ⚙️ सेटिंग्स पर वापस जाएं\n2️⃣ 🏠 मुख्य मेन्यू`
        : `✅ Language changed to *English*.\n\n1️⃣ ⚙️ Back to Settings\n2️⃣ 🏠 Main Menu`)
    );
    await setSession(phoneNumber, { currentFlow: 'SETTINGS', step: 'WAITING_POST_SETTINGS' });
    return;
  }

  if (step === 'WAITING_MORNING_TIME') {
    const language = user?.preferredLanguage || 'en';
    const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;
    if (!timeRegex.test(messageBody.trim())) {
      await sendMessage(phoneNumber, language === 'hi'
        ? `❌ गलत फॉर्मेट। कृपया HH:MM इस्तेमाल करें (जैसे 08:00 या 07:30)।`
        : `❌ Invalid format. Please use HH:MM (e.g., 08:00 or 07:30).`);
      return;
    }
    await User.findOneAndUpdate({ phoneNumber }, { $set: { 'notificationSettings.morningTime': messageBody.trim() } });
    await clearSession(phoneNumber);
    await sendMessage(phoneNumber, language === 'hi'
      ? `✅ सुबह रिमाइंडर समय *${messageBody.trim()}* सेट हो गया।\n\n1️⃣ ⚙️ सेटिंग्स पर वापस जाएं\n2️⃣ 🏠 मुख्य मेन्यू`
      : `✅ Morning reminder set to *${messageBody.trim()}*.\n\n1️⃣ ⚙️ Back to Settings\n2️⃣ 🏠 Main Menu`);
    await setSession(phoneNumber, { currentFlow: 'SETTINGS', step: 'WAITING_POST_SETTINGS' });
    return;
  }

  if (step === 'WAITING_EVENING_TIME') {
    const language = user?.preferredLanguage || 'en';
    const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;
    if (!timeRegex.test(messageBody.trim())) {
      await sendMessage(phoneNumber, language === 'hi'
        ? `❌ गलत फॉर्मेट। कृपया HH:MM इस्तेमाल करें (जैसे 21:00)।`
        : `❌ Invalid format. Please use HH:MM (e.g., 21:00).`);
      return;
    }
    await User.findOneAndUpdate({ phoneNumber }, { $set: { 'notificationSettings.eveningTime': messageBody.trim() } });
    await clearSession(phoneNumber);
    await sendMessage(phoneNumber, language === 'hi'
      ? `✅ शाम रिमाइंडर समय *${messageBody.trim()}* सेट हो गया।\n\n1️⃣ ⚙️ सेटिंग्स पर वापस जाएं\n2️⃣ 🏠 मुख्य मेन्यू`
      : `✅ Evening reminder set to *${messageBody.trim()}*.\n\n1️⃣ ⚙️ Back to Settings\n2️⃣ 🏠 Main Menu`);
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
