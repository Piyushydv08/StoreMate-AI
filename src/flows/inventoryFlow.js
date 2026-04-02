/**
 * inventoryFlow.js
 * Handles viewing inventory, marking sales, updating, and deleting products.
 */

const User = require('../models/User');
const Loss = require('../models/Loss');
const { sendMessage } = require('../services/twilioService');
const { setSession, clearSession, setTempData } = require('../state/sessionManager');
const { getProducts, sellProduct, updateProduct, deleteProduct, formatInventoryList, getLowStockProducts } = require('../services/inventoryService');
const { parseQuantity, parsePrice } = require('../services/nlpService');
const { parseExpiryDate, formatDate } = require('../utils/dateParser');
const { isYes, isNo } = require('../utils/hinglishMap');
const { sendMainMenu } = require('./mainMenuFlow');

// ── View Inventory ────────────────────────────────────────────────────────────

async function startInventoryView(phoneNumber) {
  const user = await User.findOne({ phoneNumber });
  const shopId = user.activeShopId;
  const shopName = user.shops.find((s) => String(s.shopId) === String(shopId))?.shopName || 'Your Shop';

  const products = await getProducts(shopId);

  if (!products.length) {
    await sendMessage(phoneNumber, `📦 *${shopName}* has no products yet.\n\nReply:\n1️⃣ ➕ Add Product\n2️⃣ 🏠 Main Menu`);
    await setSession(phoneNumber, { currentFlow: 'INVENTORY', step: 'EMPTY_MENU' });
    return;
  }

  const listMsg = formatInventoryList(products, shopName);
  await sendMessage(phoneNumber, listMsg);
  await sendMessage(
    phoneNumber,
    `What would you like to do?\n\n1️⃣ 💰 Mark as Sold\n2️⃣ ✏️ Update a Product\n3️⃣ 🗑️ Delete a Product\n4️⃣ 📉 Record Loss\n5️⃣ 🏠 Main Menu`
  );

  // Store product list in session for reference by index
  const productRefs = products.map((p) => ({ id: String(p._id), name: p.name, qty: p.quantity, price: p.price }));
  await setSession(phoneNumber, { currentFlow: 'INVENTORY', step: 'WAITING_ACTION', tempData: { products: productRefs, shopName } });
}

// ── Low Stock View ────────────────────────────────────────────────────────────

async function startLowStockView(phoneNumber) {
  const user = await User.findOne({ phoneNumber });
  const shopId = user.activeShopId;
  const shopName = user.shops.find((s) => String(s.shopId) === String(shopId))?.shopName || 'Your Shop';

  const lowItems = await getLowStockProducts(shopId);

  if (!lowItems.length) {
    await sendMessage(phoneNumber, `✅ Great news! No low stock items in *${shopName}* right now.\n\nReply:\n1️⃣ 📋 View All Inventory\n2️⃣ 🏠 Main Menu`);
    await setSession(phoneNumber, { currentFlow: 'INVENTORY', step: 'EMPTY_MENU' });
    return;
  }

  let msg = `⚠️ *Low Stock Alert — ${shopName}*\n\n`;
  lowItems.forEach((p, i) => {
    msg += `${i + 1}. *${p.name}* — only *${p.quantity} units* left\n`;
  });
  msg += `\nReply:\n1️⃣ Add Stock to an Item\n2️⃣ 📋 View Full Inventory\n3️⃣ 🏠 Main Menu`;

  await sendMessage(phoneNumber, msg);
  await setSession(phoneNumber, { currentFlow: 'LOW_STOCK', step: 'WAITING_ACTION' });
}

// ── Main Inventory Flow Router ────────────────────────────────────────────────

async function handleInventoryFlow(user, messageBody, phoneNumber) {
  const step = user.sessionState?.step;
  const tempData = user.sessionState?.tempData || {};
  const products = tempData.products || [];

  if (step === 'EMPTY_MENU') {
    const choice = parseInt(messageBody.trim(), 10);
    if (choice === 1) {
      const { startAddProduct } = require('./addProductFlow');
      await startAddProduct(phoneNumber);
    } else {
      await sendMainMenu(phoneNumber);
    }
    return;
  }

  if (step === 'WAITING_ACTION') {
    const choice = parseInt(messageBody.trim(), 10);
    if (choice === 1) {
      await setSession(phoneNumber, { step: 'SELL_SELECT_PRODUCT' });
      await sendProductList(phoneNumber, products, `💰 *Mark as Sold*\n\nWhich product was sold? Reply with the number.`);
    } else if (choice === 2) {
      await setSession(phoneNumber, { step: 'UPDATE_SELECT_PRODUCT' });
      await sendProductList(phoneNumber, products, `✏️ *Update Product*\n\nWhich product to update? Reply with the number.`);
    } else if (choice === 3) {
      await setSession(phoneNumber, { step: 'DELETE_SELECT_PRODUCT' });
      await sendProductList(phoneNumber, products, `🗑️ *Delete Product*\n\nWhich product to delete? Reply with the number.`);
    } else if (choice === 4) {
      await setSession(phoneNumber, { step: 'LOSS_SELECT_PRODUCT' });
      await sendProductList(phoneNumber, products, `📉 *Record Loss*\n\nWhich product was lost? Reply with the number.`);
    } else {
      await sendMainMenu(phoneNumber);
    }
    return;
  }

  // ── SELL FLOW ──────────────────────────────────────────────────────────────
  if (step === 'SELL_SELECT_PRODUCT') {
    const idx = parseInt(messageBody.trim(), 10) - 1;
    if (isNaN(idx) || idx < 0 || idx >= products.length) {
      await sendMessage(phoneNumber, `Please enter a valid product number (1–${products.length}).`);
      return;
    }
    const selected = products[idx];
    await setTempData(phoneNumber, { selectedProduct: selected });
    await setSession(phoneNumber, { step: 'SELL_ENTER_QTY' });
    await sendMessage(phoneNumber, `💰 How many units of *${selected.name}* were sold?\n_(Available: ${selected.qty} units)_`);
    return;
  }

  if (step === 'SELL_ENTER_QTY') {
    const qty = parseQuantity(messageBody);
    if (!qty || qty < 1) {
      await sendMessage(phoneNumber, `Please enter a valid number.`);
      return;
    }
    const { selectedProduct } = tempData;
    const user2 = await User.findOne({ phoneNumber });

    try {
      const { newQty } = await sellProduct(selectedProduct.id, qty, phoneNumber);
      await clearSession(phoneNumber);

      const shopName = user2.shops.find((s) => String(s.shopId) === String(user2.activeShopId))?.shopName || 'Your Shop';

      let msg = `✅ *Sale Recorded!*\n\n`;
      msg += `📦 *${selectedProduct.name}*\n`;
      msg += `🔴 Sold: *${qty} units*\n`;
      msg += `🟢 Remaining: *${newQty} units*\n\n`;
      msg += `What next?\n\n1️⃣ ➕ Record Another Sale\n2️⃣ 📋 View Inventory\n3️⃣ 🏠 Main Menu`;

      await sendMessage(phoneNumber, msg);
      await setSession(phoneNumber, { currentFlow: 'POST_SELL', step: 'WAITING_POST_SELL' });
    } catch (err) {
      await sendMessage(phoneNumber, `❌ Error: ${err.message}\n\nPlease try again.`);
    }
    return;
  }

  if (step === 'WAITING_POST_SELL') {
    const choice = parseInt(messageBody.trim(), 10);
    if (choice === 1) {
      await startInventoryView(phoneNumber);
    } else if (choice === 2) {
      await startInventoryView(phoneNumber);
    } else {
      await sendMainMenu(phoneNumber);
    }
    return;
  }

  // ── UPDATE FLOW ────────────────────────────────────────────────────────────
  if (step === 'UPDATE_SELECT_PRODUCT') {
    const idx = parseInt(messageBody.trim(), 10) - 1;
    if (isNaN(idx) || idx < 0 || idx >= products.length) {
      await sendMessage(phoneNumber, `Please enter a valid product number.`);
      return;
    }
    const selected = products[idx];
    await setTempData(phoneNumber, { selectedProduct: selected });
    await setSession(phoneNumber, { step: 'UPDATE_CHOOSE_FIELD' });
    await sendMessage(
      phoneNumber,
      `✏️ *Update: ${selected.name}*\n\nWhat would you like to update?\n\n1️⃣ Quantity\n2️⃣ Price\n3️⃣ Expiry Date\n4️⃣ Cancel`
    );
    return;
  }

  if (step === 'UPDATE_CHOOSE_FIELD') {
    const choice = parseInt(messageBody.trim(), 10);
    const { selectedProduct } = tempData;
    if (choice === 1) {
      await setSession(phoneNumber, { step: 'UPDATE_ENTER_QTY' });
      await sendMessage(phoneNumber, `🔢 Enter new quantity for *${selectedProduct.name}*:`);
    } else if (choice === 2) {
      await setSession(phoneNumber, { step: 'UPDATE_ENTER_PRICE' });
      await sendMessage(phoneNumber, `💰 Enter new price for *${selectedProduct.name}* (₹):`);
    } else if (choice === 3) {
      await setSession(phoneNumber, { step: 'UPDATE_ENTER_EXPIRY' });
      await sendMessage(phoneNumber, `📅 Enter new expiry date for *${selectedProduct.name}* (MM/YYYY):`);
    } else {
      await startInventoryView(phoneNumber);
    }
    return;
  }

  if (step === 'UPDATE_ENTER_QTY') {
    const qty = parseQuantity(messageBody);
    if (!qty || qty < 0) { await sendMessage(phoneNumber, `Please enter a valid number.`); return; }
    await updateProduct(tempData.selectedProduct.id, { quantity: qty });
    await clearSession(phoneNumber);
    await sendMessage(phoneNumber, `✅ Quantity updated to *${qty} units* for *${tempData.selectedProduct.name}*.\n\n1️⃣ 📋 View Inventory\n2️⃣ 🏠 Main Menu`);
    await setSession(phoneNumber, { currentFlow: 'POST_UPDATE', step: 'WAITING_POST_UPDATE' });
    return;
  }

  if (step === 'UPDATE_ENTER_PRICE') {
    const price = parsePrice(messageBody);
    if (!price || price < 0) { await sendMessage(phoneNumber, `Please enter a valid price.`); return; }
    await updateProduct(tempData.selectedProduct.id, { price });
    await clearSession(phoneNumber);
    await sendMessage(phoneNumber, `✅ Price updated to *₹${price}* for *${tempData.selectedProduct.name}*.\n\n1️⃣ 📋 View Inventory\n2️⃣ 🏠 Main Menu`);
    await setSession(phoneNumber, { currentFlow: 'POST_UPDATE', step: 'WAITING_POST_UPDATE' });
    return;
  }

  if (step === 'UPDATE_ENTER_EXPIRY') {
    const expiryDate = parseExpiryDate(messageBody);
    await updateProduct(tempData.selectedProduct.id, { expiryDate });
    await clearSession(phoneNumber);
    await sendMessage(phoneNumber, `✅ Expiry updated to *${formatDate(expiryDate)}* for *${tempData.selectedProduct.name}*.\n\n1️⃣ 📋 View Inventory\n2️⃣ 🏠 Main Menu`);
    await setSession(phoneNumber, { currentFlow: 'POST_UPDATE', step: 'WAITING_POST_UPDATE' });
    return;
  }

  // ── DELETE FLOW ────────────────────────────────────────────────────────────
  if (step === 'DELETE_SELECT_PRODUCT') {
    const idx = parseInt(messageBody.trim(), 10) - 1;
    if (isNaN(idx) || idx < 0 || idx >= products.length) {
      await sendMessage(phoneNumber, `Please enter a valid product number.`);
      return;
    }
    const selected = products[idx];
    await setTempData(phoneNumber, { selectedProduct: selected });
    await setSession(phoneNumber, { step: 'DELETE_CONFIRM' });
    await sendMessage(phoneNumber, `🗑️ Are you sure you want to delete *${selected.name}*?\n\nReply *YES* to confirm or *NO* to cancel.`);
    return;
  }

  if (step === 'DELETE_CONFIRM') {
    if (isYes(messageBody)) {
      await deleteProduct(tempData.selectedProduct.id);
      await clearSession(phoneNumber);
      await sendMessage(phoneNumber, `✅ *${tempData.selectedProduct.name}* has been removed from inventory.\n\n1️⃣ 📋 View Inventory\n2️⃣ 🏠 Main Menu`);
      await setSession(phoneNumber, { currentFlow: 'POST_UPDATE', step: 'WAITING_POST_UPDATE' });
    } else {
      await sendMessage(phoneNumber, `❌ Cancelled. Product was not deleted.\n\n1️⃣ 📋 View Inventory\n2️⃣ 🏠 Main Menu`);
      await setSession(phoneNumber, { currentFlow: 'POST_UPDATE', step: 'WAITING_POST_UPDATE' });
    }
    return;
  }

  // ── LOSS FLOW ──────────────────────────────────────────────────────────────
  if (step === 'LOSS_SELECT_PRODUCT') {
    const idx = parseInt(messageBody.trim(), 10) - 1;
    if (isNaN(idx) || idx < 0 || idx >= products.length) {
      await sendMessage(phoneNumber, `Please enter a valid product number.`); return;
    }
    const selected = products[idx];
    await setTempData(phoneNumber, { selectedProduct: selected });
    await setSession(phoneNumber, { step: 'LOSS_ENTER_QTY' });
    await sendMessage(phoneNumber, `📉 How many units of *${selected.name}* are being written off?`);
    return;
  }

  if (step === 'LOSS_ENTER_QTY') {
    const qty = parseQuantity(messageBody);
    if (!qty || qty < 1) { await sendMessage(phoneNumber, `Please enter a valid number.`); return; }
    await setTempData(phoneNumber, { lossQty: qty });
    await setSession(phoneNumber, { step: 'LOSS_CHOOSE_REASON' });
    await sendMessage(phoneNumber, `📝 What is the reason for loss?\n\n1️⃣ Expired\n2️⃣ Damaged\n3️⃣ Stolen\n4️⃣ Other`);
    return;
  }

  if (step === 'LOSS_CHOOSE_REASON') {
    const reasons = { 1: 'expired', 2: 'damaged', 3: 'stolen', 4: 'other' };
    const choice = parseInt(messageBody.trim(), 10);
    const reason = reasons[choice];
    if (!reason) { await sendMessage(phoneNumber, `Please reply with 1, 2, 3, or 4.`); return; }

    const { selectedProduct, lossQty } = tempData;
    const estimatedLoss = (selectedProduct.price || 0) * lossQty;
    const user2 = await User.findOne({ phoneNumber });

    await Loss.create({
      shopId: user2.activeShopId,
      productId: selectedProduct.id,
      productName: selectedProduct.name,
      unitsLost: lossQty,
      pricePerUnit: selectedProduct.price || 0,
      estimatedLoss,
      reason,
    });

    // Reduce inventory
    const newQty = Math.max(0, selectedProduct.qty - lossQty);
    await updateProduct(selectedProduct.id, { quantity: newQty });

    await clearSession(phoneNumber);
    await sendMessage(
      phoneNumber,
      `✅ *Loss Recorded*\n\n📦 ${selectedProduct.name}\n📉 Units Lost: *${lossQty}*\n💸 Estimated Loss: *₹${estimatedLoss}*\n📝 Reason: *${reason}*\n\nThis will appear in your monthly loss report.\n\n1️⃣ Record Another Loss\n2️⃣ 🏠 Main Menu`
    );
    await setSession(phoneNumber, { currentFlow: 'POST_UPDATE', step: 'WAITING_POST_UPDATE' });
    return;
  }

  // ── Post actions ───────────────────────────────────────────────────────────
  if (step === 'WAITING_POST_UPDATE') {
    const choice = parseInt(messageBody.trim(), 10);
    if (choice === 1) {
      await startInventoryView(phoneNumber);
    } else {
      await sendMainMenu(phoneNumber);
    }
    return;
  }

  await sendMainMenu(phoneNumber);
}

// ── Helper: Send numbered product list ────────────────────────────────────────
async function sendProductList(phoneNumber, products, header) {
  let msg = `${header}\n\n`;
  products.slice(0, 20).forEach((p, i) => {
    msg += `${i + 1}. ${p.name} — ${p.qty} units\n`;
  });
  await sendMessage(phoneNumber, msg);
}

module.exports = { startInventoryView, startLowStockView, handleInventoryFlow };
