/**
 * inventoryFlow.js
 * Handles viewing inventory, marking sales, updating, and deleting products.
 */

const User = require('../models/User');
const Loss = require('../models/Loss');
const { sendMessage } = require('../services/twilioService');
const { setSession, clearSession, setTempData } = require('../state/sessionManager');
const { getProducts, recordSale, updateQuantity, deleteProduct, formatInventoryList } = require('../services/inventoryService');
const Product = require('../models/Product');

// Alias to match what the flow expects
const sellProduct  = recordSale;        // (shopId, productId, unitsSold) → { product, sale, isLowStock }
const updateProduct = async (productId, fields) => {
  // updateQuantity only handles qty; handle other fields via direct model update
  const update = {};
  if (fields.quantity !== undefined) update.quantity = fields.quantity;
  if (fields.price    !== undefined) update.price    = fields.price;
  if (fields.expiryDate !== undefined) update.expiryDate = fields.expiryDate;
  return Product.findByIdAndUpdate(productId, { $set: update }, { new: true });
};
const getLowStockProducts = async (shopId, threshold = 5) =>
  Product.find({ shopId, isActive: true, quantity: { $lte: threshold } }).sort({ quantity: 1 });
const { parseQuantity, parsePrice } = require('../services/nlpService');
const { parseDate: parseExpiryDate, formatDate } = require('../utils/dateParser');
const hinglishMap = require('../utils/hinglishMap');
function isYes(text) {
  const t = (hinglishMap[text.toLowerCase().trim()] || text).toLowerCase().trim();
  return ['yes', 'ha', 'haan', 'ok', 'theek hai', 'bilkul'].includes(t);
}
function isNo(text) {
  const t = (hinglishMap[text.toLowerCase().trim()] || text).toLowerCase().trim();
  return ['no', 'nahi', 'na', 'cancel', 'mat karo'].includes(t);
}
const { sendMainMenu } = require('./mainMenuFlow');
const { withNav, isBack, isHome } = require('../utils/navHelper');

// ── View Inventory ────────────────────────────────────────────────────────────

async function startInventoryView(phoneNumber) {
  const user = await User.findOne({ phoneNumber });
  const language = user?.preferredLanguage || 'en';
  const shopId = user.activeShopId;
  const shopName = user.shops.find((s) => String(s.shopId) === String(shopId))?.shopName || 'Your Shop';

  const products = await getProducts(shopId);

  if (!products.length) {
    await sendMessage(phoneNumber, language === 'hi'
      ? `📦 *${shopName}* में अभी कोई प्रोडक्ट नहीं है।\n\nउत्तर दें:\n1️⃣ ➕ प्रोडक्ट जोड़ें\n2️⃣ 🏠 मुख्य मेन्यू`
      : `📦 *${shopName}* has no products yet.\n\nReply:\n1️⃣ ➕ Add Product\n2️⃣ 🏠 Main Menu`);
    await setSession(phoneNumber, { currentFlow: 'INVENTORY', step: 'EMPTY_MENU' });
    return;
  }

  const listMsg = formatInventoryList(products, shopName);
  await sendMessage(phoneNumber, listMsg);
  await sendMessage(
    phoneNumber,
    language === 'hi'
      ? `आप क्या करना चाहेंगे?\n\n1️⃣ 💰 बिक्री दर्ज करें\n2️⃣ ✏️ प्रोडक्ट अपडेट करें\n3️⃣ 🗑️ प्रोडक्ट हटाएं\n4️⃣ 📉 नुकसान दर्ज करें\n5️⃣ 🏠 मुख्य मेन्यू`
      : `What would you like to do?\n\n1️⃣ 💰 Mark as Sold\n2️⃣ ✏️ Update a Product\n3️⃣ 🗑️ Delete a Product\n4️⃣ 📉 Record Loss\n5️⃣ 🏠 Main Menu`
  );

  // Store product list in session for reference by index
  const productRefs = products.map((p) => ({ id: String(p._id), name: p.name, qty: p.quantity, price: p.price }));
  await setSession(phoneNumber, { currentFlow: 'INVENTORY', step: 'WAITING_ACTION', tempData: { products: productRefs, shopName } });
}

// ── Low Stock View ────────────────────────────────────────────────────────────

async function startLowStockView(phoneNumber) {
  const user = await User.findOne({ phoneNumber });
  const language = user?.preferredLanguage || 'en';
  const shopId = user.activeShopId;
  const shopName = user.shops.find((s) => String(s.shopId) === String(shopId))?.shopName || 'Your Shop';

  const lowItems = await getLowStockProducts(shopId);

  if (!lowItems.length) {
    await sendMessage(phoneNumber, language === 'hi'
      ? `✅ अच्छी खबर! *${shopName}* में अभी कोई low stock item नहीं है।\n\nउत्तर दें:\n1️⃣ 📋 पूरी इन्वेंटरी देखें\n2️⃣ 🏠 मुख्य मेन्यू`
      : `✅ Great news! No low stock items in *${shopName}* right now.\n\nReply:\n1️⃣ 📋 View All Inventory\n2️⃣ 🏠 Main Menu`);
    await setSession(phoneNumber, { currentFlow: 'INVENTORY', step: 'EMPTY_MENU' });
    return;
  }

  let msg = language === 'hi' ? `⚠️ *लो स्टॉक अलर्ट — ${shopName}*\n\n` : `⚠️ *Low Stock Alert — ${shopName}*\n\n`;
  lowItems.forEach((p, i) => {
    msg += language === 'hi'
      ? `${i + 1}. *${p.name}* — केवल *${p.quantity} यूनिट* बचे हैं\n`
      : `${i + 1}. *${p.name}* — only *${p.quantity} units* left\n`;
  });
  msg += language === 'hi'
    ? `\nउत्तर दें:\n1️⃣ किसी आइटम में स्टॉक जोड़ें\n2️⃣ 📋 पूरी इन्वेंटरी देखें\n3️⃣ 🏠 मुख्य मेन्यू`
    : `\nReply:\n1️⃣ Add Stock to an Item\n2️⃣ 📋 View Full Inventory\n3️⃣ 🏠 Main Menu`;

  await sendMessage(phoneNumber, msg);
  await setSession(phoneNumber, { currentFlow: 'LOW_STOCK', step: 'WAITING_ACTION' });
}

// ── Main Inventory Flow Router ────────────────────────────────────────────────

async function handleInventoryFlow(user, messageBody, phoneNumber) {
  const step = user.sessionState?.step;
  const tempData = user.sessionState?.tempData || {};
  const products = tempData.products || [];
  const language = user?.preferredLanguage || 'en';
  const t = (en, hi) => (language === 'hi' ? hi : en);

  // Global HOME / BACK
  if (isHome(messageBody)) return sendMainMenu(phoneNumber);
  if (isBack(messageBody)) return sendMainMenu(phoneNumber);

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
      await sendProductList(phoneNumber, products, t(`💰 *Mark as Sold*\n\nWhich product was sold? Reply with the number.`, `💰 *बिक्री दर्ज करें*\n\nकौन-सा प्रोडक्ट बिका? नंबर भेजें।`), language);
    } else if (choice === 2) {
      await setSession(phoneNumber, { step: 'UPDATE_SELECT_PRODUCT' });
      await sendProductList(phoneNumber, products, t(`✏️ *Update Product*\n\nWhich product to update? Reply with the number.`, `✏️ *प्रोडक्ट अपडेट करें*\n\nकौन-सा प्रोडक्ट अपडेट करना है? नंबर भेजें।`), language);
    } else if (choice === 3) {
      await setSession(phoneNumber, { step: 'DELETE_SELECT_PRODUCT' });
      await sendProductList(phoneNumber, products, t(`🗑️ *Delete Product*\n\nWhich product to delete? Reply with the number.`, `🗑️ *प्रोडक्ट हटाएं*\n\nकौन-सा प्रोडक्ट हटाना है? नंबर भेजें।`), language);
    } else if (choice === 4) {
      await setSession(phoneNumber, { step: 'LOSS_SELECT_PRODUCT' });
      await sendProductList(phoneNumber, products, t(`📉 *Record Loss*\n\nWhich product was lost? Reply with the number.`, `📉 *नुकसान दर्ज करें*\n\nकौन-सा प्रोडक्ट नुकसान में गया? नंबर भेजें।`), language);
    } else {
      await sendMainMenu(phoneNumber);
    }
    return;
  }

  // ── SELL FLOW ──────────────────────────────────────────────────────────────
  if (step === 'SELL_SELECT_PRODUCT') {
    const idx = parseInt(messageBody.trim(), 10) - 1;
    if (isNaN(idx) || idx < 0 || idx >= products.length) {
      await sendMessage(phoneNumber, t(`Please enter a valid product number (1–${products.length}).`, `कृपया सही प्रोडक्ट नंबर लिखें (1–${products.length})।`));
      return;
    }
    const selected = products[idx];
    await setTempData(phoneNumber, { selectedProduct: selected });
    await setSession(phoneNumber, { step: 'SELL_ENTER_QTY' });
    await sendMessage(phoneNumber, t(`💰 How many units of *${selected.name}* were sold?\n_(Available: ${selected.qty} units)_`, `💰 *${selected.name}* के कितने यूनिट बिके?\n_(उपलब्ध: ${selected.qty} यूनिट)_`));
    return;
  }

  if (step === 'SELL_ENTER_QTY') {
    const qty = parseQuantity(messageBody);
    if (!qty || qty < 1) {
      await sendMessage(phoneNumber, t(`Please enter a valid number.`, `कृपया सही संख्या लिखें।`));
      return;
    }
    const { selectedProduct } = tempData;
    const user2 = await User.findOne({ phoneNumber });
    const shopId = user2.activeShopId;

    try {
      const { product, isLowStock } = await sellProduct(shopId, selectedProduct.id, qty);
      const newQty = product.quantity;
      await clearSession(phoneNumber);

      const shopName = user2.shops.find((s) => String(s.shopId) === String(user2.activeShopId))?.shopName || 'Your Shop';

      let msg = language === 'hi' ? `✅ *बिक्री दर्ज हो गई!*\n\n` : `✅ *Sale Recorded!*\n\n`;
      msg += `📦 *${selectedProduct.name}*\n`;
      msg += language === 'hi' ? `🔴 बिका: *${qty} यूनिट*\n` : `🔴 Sold: *${qty} units*\n`;
      msg += language === 'hi' ? `🟢 शेष: *${newQty} यूनिट*\n\n` : `🟢 Remaining: *${newQty} units*\n\n`;
      msg += language === 'hi'
        ? `अब क्या करें?\n\n1️⃣ ➕ एक और बिक्री दर्ज करें\n2️⃣ 📋 इन्वेंटरी देखें\n3️⃣ 🏠 मुख्य मेन्यू`
        : `What next?\n\n1️⃣ ➕ Record Another Sale\n2️⃣ 📋 View Inventory\n3️⃣ 🏠 Main Menu`;

      await sendMessage(phoneNumber, msg);
      await setSession(phoneNumber, { currentFlow: 'POST_SELL', step: 'WAITING_POST_SELL' });
    } catch (err) {
      await sendMessage(phoneNumber, t(`❌ Error: ${err.message}\n\nPlease try again.`, `❌ त्रुटि: ${err.message}\n\nकृपया फिर से कोशिश करें।`));
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
      await sendMessage(phoneNumber, t(`Please enter a valid product number.`, `कृपया सही प्रोडक्ट नंबर लिखें।`));
      return;
    }
    const selected = products[idx];
    await setTempData(phoneNumber, { selectedProduct: selected });
    await setSession(phoneNumber, { step: 'UPDATE_CHOOSE_FIELD' });
    await sendMessage(
      phoneNumber,
      t(`✏️ *Update: ${selected.name}*\n\nWhat would you like to update?\n\n1️⃣ Quantity\n2️⃣ Price\n3️⃣ Expiry Date\n4️⃣ Cancel`, `✏️ *अपडेट: ${selected.name}*\n\nआप क्या अपडेट करना चाहेंगे?\n\n1️⃣ मात्रा\n2️⃣ कीमत\n3️⃣ एक्सपायरी तारीख\n4️⃣ रद्द करें`)
    );
    return;
  }

  if (step === 'UPDATE_CHOOSE_FIELD') {
    const choice = parseInt(messageBody.trim(), 10);
    const { selectedProduct } = tempData;
    if (choice === 1) {
      await setSession(phoneNumber, { step: 'UPDATE_ENTER_QTY' });
      await sendMessage(phoneNumber, t(`🔢 Enter new quantity for *${selectedProduct.name}*:`, `🔢 *${selectedProduct.name}* के लिए नई मात्रा दर्ज करें:`));
    } else if (choice === 2) {
      await setSession(phoneNumber, { step: 'UPDATE_ENTER_PRICE' });
      await sendMessage(phoneNumber, t(`💰 Enter new price for *${selectedProduct.name}* (₹):`, `💰 *${selectedProduct.name}* की नई कीमत (₹) दर्ज करें:`));
    } else if (choice === 3) {
      await setSession(phoneNumber, { step: 'UPDATE_ENTER_EXPIRY' });
      await sendMessage(phoneNumber, t(`📅 Enter new expiry date for *${selectedProduct.name}* (MM/YYYY):`, `📅 *${selectedProduct.name}* की नई expiry date (MM/YYYY) दर्ज करें:`));
    } else {
      await startInventoryView(phoneNumber);
    }
    return;
  }

  if (step === 'UPDATE_ENTER_QTY') {
    const qty = parseQuantity(messageBody);
    if (!qty || qty < 0) { await sendMessage(phoneNumber, t(`Please enter a valid number.`, `कृपया सही संख्या लिखें।`)); return; }
    await updateProduct(tempData.selectedProduct.id, { quantity: qty });
    await clearSession(phoneNumber);
    await sendMessage(phoneNumber, t(`✅ Quantity updated to *${qty} units* for *${tempData.selectedProduct.name}*.\n\n1️⃣ 📋 View Inventory\n2️⃣ 🏠 Main Menu`, `✅ *${tempData.selectedProduct.name}* की मात्रा *${qty} यूनिट* अपडेट कर दी गई।\n\n1️⃣ 📋 इन्वेंटरी देखें\n2️⃣ 🏠 मुख्य मेन्यू`));
    await setSession(phoneNumber, { currentFlow: 'POST_UPDATE', step: 'WAITING_POST_UPDATE' });
    return;
  }

  if (step === 'UPDATE_ENTER_PRICE') {
    const price = parsePrice(messageBody);
    if (!price || price < 0) { await sendMessage(phoneNumber, t(`Please enter a valid price.`, `कृपया सही कीमत दर्ज करें।`)); return; }
    await updateProduct(tempData.selectedProduct.id, { price });
    await clearSession(phoneNumber);
    await sendMessage(phoneNumber, t(`✅ Price updated to *₹${price}* for *${tempData.selectedProduct.name}*.\n\n1️⃣ 📋 View Inventory\n2️⃣ 🏠 Main Menu`, `✅ *${tempData.selectedProduct.name}* की कीमत *₹${price}* अपडेट कर दी गई।\n\n1️⃣ 📋 इन्वेंटरी देखें\n2️⃣ 🏠 मुख्य मेन्यू`));
    await setSession(phoneNumber, { currentFlow: 'POST_UPDATE', step: 'WAITING_POST_UPDATE' });
    return;
  }

  if (step === 'UPDATE_ENTER_EXPIRY') {
    const expiryDate = parseExpiryDate(messageBody);
    await updateProduct(tempData.selectedProduct.id, { expiryDate });
    await clearSession(phoneNumber);
    await sendMessage(phoneNumber, t(`✅ Expiry updated to *${formatDate(expiryDate)}* for *${tempData.selectedProduct.name}*.\n\n1️⃣ 📋 View Inventory\n2️⃣ 🏠 Main Menu`, `✅ *${tempData.selectedProduct.name}* की expiry *${formatDate(expiryDate)}* अपडेट कर दी गई।\n\n1️⃣ 📋 इन्वेंटरी देखें\n2️⃣ 🏠 मुख्य मेन्यू`));
    await setSession(phoneNumber, { currentFlow: 'POST_UPDATE', step: 'WAITING_POST_UPDATE' });
    return;
  }

  // ── DELETE FLOW ────────────────────────────────────────────────────────────
  if (step === 'DELETE_SELECT_PRODUCT') {
    const idx = parseInt(messageBody.trim(), 10) - 1;
    if (isNaN(idx) || idx < 0 || idx >= products.length) {
      await sendMessage(phoneNumber, t(`Please enter a valid product number.`, `कृपया सही प्रोडक्ट नंबर लिखें।`));
      return;
    }
    const selected = products[idx];
    await setTempData(phoneNumber, { selectedProduct: selected });
    await setSession(phoneNumber, { step: 'DELETE_CONFIRM' });
    await sendMessage(phoneNumber, t(`🗑️ Are you sure you want to delete *${selected.name}*?\n\nReply *YES* to confirm or *NO* to cancel.`, `🗑️ क्या आप निश्चित हैं कि *${selected.name}* हटाना चाहते हैं?\n\nपुष्टि के लिए *YES* या रद्द करने के लिए *NO* लिखें।`));
    return;
  }

  if (step === 'DELETE_CONFIRM') {
    if (isYes(messageBody)) {
      await deleteProduct(tempData.selectedProduct.id);
      await clearSession(phoneNumber);
      await sendMessage(phoneNumber, t(`✅ *${tempData.selectedProduct.name}* has been removed from inventory.\n\n1️⃣ 📋 View Inventory\n2️⃣ 🏠 Main Menu`, `✅ *${tempData.selectedProduct.name}* इन्वेंटरी से हटा दिया गया है।\n\n1️⃣ 📋 इन्वेंटरी देखें\n2️⃣ 🏠 मुख्य मेन्यू`));
      await setSession(phoneNumber, { currentFlow: 'POST_UPDATE', step: 'WAITING_POST_UPDATE' });
    } else {
      await sendMessage(phoneNumber, t(`❌ Cancelled. Product was not deleted.\n\n1️⃣ 📋 View Inventory\n2️⃣ 🏠 Main Menu`, `❌ रद्द किया गया। प्रोडक्ट नहीं हटाया गया।\n\n1️⃣ 📋 इन्वेंटरी देखें\n2️⃣ 🏠 मुख्य मेन्यू`));
      await setSession(phoneNumber, { currentFlow: 'POST_UPDATE', step: 'WAITING_POST_UPDATE' });
    }
    return;
  }

  // ── LOSS FLOW ──────────────────────────────────────────────────────────────
  if (step === 'LOSS_SELECT_PRODUCT') {
    const idx = parseInt(messageBody.trim(), 10) - 1;
    if (isNaN(idx) || idx < 0 || idx >= products.length) {
      await sendMessage(phoneNumber, t(`Please enter a valid product number.`, `कृपया सही प्रोडक्ट नंबर लिखें।`)); return;
    }
    const selected = products[idx];
    await setTempData(phoneNumber, { selectedProduct: selected });
    await setSession(phoneNumber, { step: 'LOSS_ENTER_QTY' });
    await sendMessage(phoneNumber, t(`📉 How many units of *${selected.name}* are being written off?`, `📉 *${selected.name}* के कितने यूनिट नुकसान में दर्ज करने हैं?`));
    return;
  }

  if (step === 'LOSS_ENTER_QTY') {
    const qty = parseQuantity(messageBody);
    if (!qty || qty < 1) { await sendMessage(phoneNumber, t(`Please enter a valid number.`, `कृपया सही संख्या लिखें।`)); return; }
    await setTempData(phoneNumber, { lossQty: qty });
    await setSession(phoneNumber, { step: 'LOSS_CHOOSE_REASON' });
    await sendMessage(phoneNumber, t(`📝 What is the reason for loss?\n\n1️⃣ Expired\n2️⃣ Damaged\n3️⃣ Stolen\n4️⃣ Other`, `📝 नुकसान का कारण क्या है?\n\n1️⃣ एक्सपायर\n2️⃣ खराब\n3️⃣ चोरी\n4️⃣ अन्य`));
    return;
  }

  if (step === 'LOSS_CHOOSE_REASON') {
    const reasons = { 1: 'expired', 2: 'damaged', 3: 'stolen', 4: 'other' };
    const choice = parseInt(messageBody.trim(), 10);
    const reason = reasons[choice];
    if (!reason) { await sendMessage(phoneNumber, t(`Please reply with 1, 2, 3, or 4.`, `कृपया 1, 2, 3 या 4 में से जवाब दें।`)); return; }

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
      t(`✅ *Loss Recorded*\n\n📦 ${selectedProduct.name}\n📉 Units Lost: *${lossQty}*\n💸 Estimated Loss: *₹${estimatedLoss}*\n📝 Reason: *${reason}*\n\nThis will appear in your monthly loss report.\n\n1️⃣ Record Another Loss\n2️⃣ 🏠 Main Menu`, `✅ *नुकसान दर्ज हो गया*\n\n📦 ${selectedProduct.name}\n📉 खोई मात्रा: *${lossQty}*\n💸 अनुमानित नुकसान: *₹${estimatedLoss}*\n📝 कारण: *${reason}*\n\nयह आपकी मासिक नुकसान रिपोर्ट में दिखेगा।\n\n1️⃣ एक और नुकसान दर्ज करें\n2️⃣ 🏠 मुख्य मेन्यू`)
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
async function sendProductList(phoneNumber, products, header, language = 'en') {
  let msg = `${header}\n\n`;
  products.slice(0, 20).forEach((p, i) => {
    msg += language === 'hi'
      ? `${i + 1}. ${p.name} — ${p.qty} यूनिट\n`
      : `${i + 1}. ${p.name} — ${p.qty} units\n`;
  });
  await sendMessage(phoneNumber, msg);
}

module.exports = { startInventoryView, startLowStockView, handleInventoryFlow };
