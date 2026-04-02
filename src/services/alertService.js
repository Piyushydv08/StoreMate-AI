const Product = require('../models/Product');
const User = require('../models/User');
const { sendMessage } = require('./twilioService');
const { formatDate, daysUntil } = require('../utils/dateParser');

/**
 * Check all products and send expiry alerts where needed
 */
async function sendExpiryAlerts() {
  const products = await Product.find({ isActive: true, expiryDate: { $ne: null } });

  for (const product of products) {
    const days = daysUntil(product.expiryDate);
    const shopUsers = await User.find({ 'shops.shopId': product.shopId });

    for (const user of shopUsers) {
      if (!user.notificationSettings.enabled) continue;

      let alertKey = null;
      let urgency = '';

      if (days <= 1 && !product.expiryAlertSent.includes('1day')) {
        alertKey = '1day';
        urgency = '🚨 EXPIRES TOMORROW!';
      } else if (days <= 3 && !product.expiryAlertSent.includes('3days')) {
        alertKey = '3days';
        urgency = '⚠️ Expires in 3 days';
      } else if (days <= 7 && !product.expiryAlertSent.includes('7days')) {
        alertKey = '7days';
        urgency = '📅 Expires in 7 days';
      }

      if (alertKey) {
        const msg =
          `${urgency}\n\n` +
          `📦 *${product.name}*\n` +
          `🔢 Qty: ${product.quantity} units\n` +
          `📅 Expiry: ${formatDate(product.expiryDate)}\n\n` +
          `💡 Consider offering a discount to clear stock!\n\n` +
          `Reply:\n` +
          `1️⃣ Mark as Discounted\n` +
          `2️⃣ Record as Loss\n` +
          `3️⃣ Dismiss`;

        await sendMessage(user.phoneNumber, msg);
        product.expiryAlertSent.push(alertKey);
        await product.save();
      }
    }
  }
}

/**
 * Send low stock alert immediately
 */
async function sendLowStockAlert(user, product) {
  const msg =
    `⚠️ *LOW STOCK ALERT!*\n\n` +
    `📦 ${product.name} is running low.\n` +
    `Only *${product.quantity} units* remaining.\n\n` +
    `Reply:\n` +
    `1️⃣ Add / Reorder Stock\n` +
    `2️⃣ Ignore`;

  await sendMessage(user.phoneNumber, msg);
  product.lowStockAlerted = true;
  await product.save();
}

/**
 * Send morning daily summary to a user
 */
async function sendMorningSummary(user) {
  const { getDailySummary } = require('./inventoryService');
  const shop = user.shops.find(s => s.shopId.toString() === user.activeShopId?.toString());
  const shopName = shop ? shop.shopName : 'Your Shop';

  const summary = await getDailySummary(user.activeShopId);
  const today = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

  let lowStockLines = '';
  if (summary.lowStock.length) {
    lowStockLines = '\n\n⚠️ *Low Stock Items:*\n' +
      summary.lowStock.map(p => `• ${p.name} — ${p.quantity} units left`).join('\n');
  }

  const msg =
    `☀️ *Good Morning, ${user.ownerName}!*\n\n` +
    `📊 *Daily Summary — ${shopName}*\n` +
    `📅 ${today}\n\n` +
    `🏷️ Total Products: ${summary.totalProducts}\n` +
    `📦 Low Stock (≤3 units): ${summary.lowStock.length} items\n` +
    `⚠️ Expiring in 7 days: ${summary.expiring7.length} items\n` +
    `💰 Today's Sales: ${summary.todaySales} transactions` +
    lowStockLines +
    `\n\nReply:\n` +
    `1️⃣ Restock Low Items\n` +
    `2️⃣ View Full Inventory\n` +
    `3️⃣ View Expiry Alerts\n` +
    `4️⃣ Dismiss`;

  await sendMessage(user.phoneNumber, msg);
}

/**
 * Send evening expiry + suggestion summary
 */
async function sendEveningSummary(user) {
  const { getDailySummary } = require('./inventoryService');
  const summary = await getDailySummary(user.activeShopId);
  const shop = user.shops.find(s => s.shopId.toString() === user.activeShopId?.toString());
  const shopName = shop ? shop.shopName : 'Your Shop';

  if (!summary.expiring7.length && !summary.lowStock.length) return; // nothing urgent

  let expiryLines = '✅ No items expiring soon.';
  let suggestions = '';

  if (summary.expiring7.length) {
    expiryLines = summary.expiring7.map(p => {
      const d = daysUntil(p.expiryDate);
      const emoji = d <= 1 ? '🚨' : d <= 3 ? '⚠️' : '📅';
      const label = d <= 1 ? 'Expires TOMORROW!' : d <= 3 ? `Expires in ${d} days` : `Expires in ${d} days`;
      return `${emoji} ${p.name} — ${label} (Qty: ${p.quantity})`;
    }).join('\n');

    const nearExpiry = summary.expiring7.filter(p => daysUntil(p.expiryDate) <= 3);
    if (nearExpiry.length) {
      suggestions = `\n\n💡 *Smart Suggestion:*\nOffer 10–15% discount on ` +
        nearExpiry.map(p => p.name).join(' & ') +
        ` before they expire.`;
    }
  }

  const msg =
    `🌙 *Evening Update — ${shopName}*\n\n` +
    `📅 *Expiry Alerts:*\n${expiryLines}` +
    suggestions +
    `\n\nReply:\n` +
    `1️⃣ Mark Items as Discounted\n` +
    `2️⃣ Record Items as Loss\n` +
    `3️⃣ View Full Inventory\n` +
    `4️⃣ Dismiss`;

  await sendMessage(user.phoneNumber, msg);
}

module.exports = { sendExpiryAlerts, sendLowStockAlert, sendMorningSummary, sendEveningSummary };
