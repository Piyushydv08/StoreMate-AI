/**
 * addProductFlow.js
 * Full conversational flow for adding products via:
 *  1. Invoice photo (OCR)
 *  2. Barcode photo (ZXing + Open Food Facts)
 *  3. Manual text entry (NLP)
 */

const User = require('../models/User');
const { sendMessage } = require('../services/twilioService');
const { setSession, clearSession, setTempData } = require('../state/sessionManager');
const { downloadMedia, deleteTempFile } = require('../utils/imageDownloader');
const { performOCR } = require('../services/ocrService');
const { processBarcode } = require('../services/barcodeService');
const { parseProductText, parseQuantity, parsePrice } = require('../services/nlpService');
const { parseDate: parseExpiryDate, formatDate } = require('../utils/dateParser');
const { addProduct } = require('../services/inventoryService');
const hinglishMap = require('../utils/hinglishMap');

function isYes(text) {
  const t = (hinglishMap[text.toLowerCase().trim()] || text).toLowerCase().trim();
  return ['yes', 'ha', 'haan', 'ok', 'theek hai', 'bilkul'].includes(t);
}
function isNo(text) {
  const t = (hinglishMap[text.toLowerCase().trim()] || text).toLowerCase().trim();
  return ['no', 'nahi', 'na', 'cancel', 'mat karo'].includes(t);
}
function isSkip(text) {
  return /^skip$/i.test(text.trim());
}
const { sendMainMenu } = require('./mainMenuFlow');
const { withNav, isBack, isHome } = require('../utils/navHelper');

// ── Entry Point ───────────────────────────────────────────────────────────────

async function startAddProduct(phoneNumber) {
  await setSession(phoneNumber, { currentFlow: 'ADD_PRODUCT', step: 'CHOOSE_METHOD', tempData: {} });
  await sendMessage(
    phoneNumber,
    withNav(`➕ *Add New Product*\n\nHow would you like to add the product?\n\n1️⃣ 📄 Upload Invoice Photo\n2️⃣ 📷 Scan Barcode Photo\n3️⃣ ✍️ Type Manually\n\nReply with 1, 2, or 3.`)
  );
}

// ── Main Flow Router ──────────────────────────────────────────────────────────

async function handleAddProduct(user, messageBody, mediaUrl, mediaType, phoneNumber) {
  const step = user.sessionState?.step;
  const tempData = user.sessionState?.tempData || {};

  // ── Global: HOME returns to main menu from anywhere ────────────────────────
  if (isHome(messageBody)) {
    return sendMainMenu(phoneNumber);
  }

  // ── Global: BACK navigates to previous meaningful step ──────────────────
  if (isBack(messageBody)) {
    // Step-specific back mapping
    const backMap = {
      WAITING_INVOICE_IMAGE:      'CHOOSE_METHOD',
      WAITING_BARCODE_IMAGE:      'CHOOSE_METHOD',
      WAITING_MANUAL_TEXT:        'CHOOSE_METHOD',
      WAITING_EXPIRY_AFTER_INVOICE: 'WAITING_INVOICE_IMAGE',
      WAITING_QTY_AFTER_INVOICE:  'WAITING_EXPIRY_AFTER_INVOICE',
      WAITING_NAME_BARCODE:       'WAITING_BARCODE_IMAGE',
      WAITING_QTY_BARCODE:        'WAITING_NAME_BARCODE',
      WAITING_EXPIRY_BARCODE:     'WAITING_QTY_BARCODE',
      WAITING_PRICE_BARCODE:      'WAITING_EXPIRY_BARCODE',
      WAITING_QTY_MANUAL:         'WAITING_MANUAL_TEXT',
      WAITING_EXPIRY_MANUAL:      'WAITING_QTY_MANUAL',
      WAITING_CONFIRM:            'CHOOSE_METHOD',
    };
    const prevStep = backMap[step] || 'CHOOSE_METHOD';
    if (prevStep === 'CHOOSE_METHOD') {
      return startAddProduct(phoneNumber); // re-show the method picker
    }
    await setSession(phoneNumber, { step: prevStep });
    await sendMessage(phoneNumber, withNav(`↩️ Going back...\n\nPlease re-send your response for the previous step.`));
    return;
  }

  // ── Choose method ──────────────────────────────────────────────────────────
  if (step === 'CHOOSE_METHOD') {
    const choice = parseInt(messageBody.trim(), 10);
    if (choice === 1) {
      await setSession(phoneNumber, { step: 'WAITING_INVOICE_IMAGE' });
      await sendMessage(phoneNumber, withNav(`📸 Please send a clear photo of the *invoice*.\n\nMake sure all text is visible and in focus.`));
    } else if (choice === 2) {
      await setSession(phoneNumber, { step: 'WAITING_BARCODE_IMAGE' });
      await sendMessage(phoneNumber, withNav(`📷 Please send a clear photo of the *barcode*.\n\nMake sure the barcode is fully visible and not blurry.`));
    } else if (choice === 3) {
      await setSession(phoneNumber, { step: 'WAITING_MANUAL_TEXT' });
      await sendMessage(
        phoneNumber,
        withNav(`✍️ *Manual Entry*\n\nType product details like:\n\n_"50 units Parle-G expiry March 2026 price 120"_\n\nOr just:\n_"Tata Salt 30 packets ₹18 exp 12/2025"_\n\nHinglish is fine too! 😊`)
      );
    } else {
      await sendMessage(phoneNumber, withNav(`Please reply with *1*, *2*, or *3* to choose an option.`));
    }
    return;
  }

  // ── Invoice Image Received ─────────────────────────────────────────────────
  if (step === 'WAITING_INVOICE_IMAGE') {
    if (!mediaUrl) {
      await sendMessage(phoneNumber, withNav(`⚠️ Please send an *image* of the invoice, not text.`));
      return;
    }

    await sendMessage(phoneNumber, `🔍 Reading invoice... Please wait a moment.`);
    let filePath = null;

    try {
      filePath = await downloadMedia(mediaUrl);
      const parsed = await performOCR(filePath);
      // ocrService returns { productName, quantity, price, expiryRaw }
      if (parsed) parsed.name = parsed.name || parsed.productName;

      if (!parsed || !parsed.name) {
        throw new Error('Could not extract product info');
      }

      await setTempData(phoneNumber, { ...parsed, addedVia: 'invoice' });

      let msg = `✅ *I found the following from the invoice:*\n\n`;
      msg += `📦 Product: *${parsed.name}*\n`;
      msg += parsed.quantity ? `🔢 Quantity: *${parsed.quantity} units*\n` : `🔢 Quantity: _Not found_\n`;
      msg += parsed.price ? `💰 Price: *₹${parsed.price}*\n` : `💰 Price: _Not found_\n`;
      msg += parsed.expiryDate ? `📅 Expiry: *${formatDate(parsed.expiryDate)}*\n` : ``;

      if (!parsed.expiryDate) {
        msg += `\n❓ I could not find an *expiry date* on this invoice.\nPlease enter the expiry date:\n_(Format: MM/YYYY or Month YYYY — type SKIP if no expiry)_`;
        await setSession(phoneNumber, { step: 'WAITING_EXPIRY_AFTER_INVOICE' });
      } else if (!parsed.quantity) {
        msg += `\n❓ Please enter the *quantity* (number of units):`;
        await setSession(phoneNumber, { step: 'WAITING_QTY_AFTER_INVOICE' });
      } else {
        await setSession(phoneNumber, { step: 'WAITING_CONFIRM' });
        msg += `\n\nConfirm? Reply *YES* to save or *NO* to cancel.`;
      }

      await sendMessage(phoneNumber, withNav(msg));
    } catch (err) {
      console.error('OCR Error:', err.message);
      await sendMessage(
        phoneNumber,
        withNav(`⚠️ Could not read the invoice clearly.\n\nWhat would you like to do?\n\n1️⃣ Try Again with a clearer photo\n2️⃣ Scan Barcode instead\n3️⃣ Type product details manually`)
      );
      await setSession(phoneNumber, { step: 'CHOOSE_METHOD' });
    } finally {
      if (filePath) deleteTempFile(filePath);
    }
    return;
  }

  // ── Expiry after invoice OCR ───────────────────────────────────────────────
  if (step === 'WAITING_EXPIRY_AFTER_INVOICE') {
    const expiryDate = isSkip(messageBody) ? null : parseExpiryDate(messageBody);
    await setTempData(phoneNumber, { expiryDate });

    if (!tempData.quantity) {
      await setSession(phoneNumber, { step: 'WAITING_QTY_AFTER_INVOICE' });
      await sendMessage(phoneNumber, withNav(`🔢 How many units are you adding? _(Enter a number)_`));
    } else {
      await setSession(phoneNumber, { step: 'WAITING_CONFIRM' });
      await sendConfirmation(phoneNumber, { ...tempData, expiryDate });
    }
    return;
  }

  // ── Quantity after invoice OCR ────────────────────────────────────────────
  if (step === 'WAITING_QTY_AFTER_INVOICE') {
    const qty = parseQuantity(messageBody);
    if (!qty || qty < 1) {
      await sendMessage(phoneNumber, withNav(`Please enter a valid number (e.g., 50).`));
      return;
    }
    await setTempData(phoneNumber, { quantity: qty });
    await setSession(phoneNumber, { step: 'WAITING_CONFIRM' });
    await sendConfirmation(phoneNumber, { ...tempData, quantity: qty });
    return;
  }

  // ── Barcode Image Received ─────────────────────────────────────────────────
  if (step === 'WAITING_BARCODE_IMAGE') {
    if (!mediaUrl) {
      await sendMessage(phoneNumber, withNav(`⚠️ Please send an *image* of the barcode.`));
      return;
    }

    await sendMessage(phoneNumber, `🔍 Scanning barcode & extracting product details... Please wait.`);
    let filePath = null;

    try {
      filePath = await downloadMedia(mediaUrl);
      const result = await processBarcode(filePath);

      if (!result.success) {
        throw new Error(result.error || 'Barcode not readable');
      }

      const { barcodeNumber, productInfo } = result;

      // Persist product info into session tempData
      await setTempData(phoneNumber, {
        name: productInfo.name,
        brand: productInfo.brand,
        category: productInfo.category,
        price: productInfo.mrp || 0,
        expiryRaw: productInfo.expiryRaw,
        description: productInfo.description,
        addedVia: 'barcode'
      });

      let msg = `✅ *Barcode scanned:* \`${barcodeNumber}\`\n\n`;

      if (productInfo.name || productInfo.description) {
        // ── Rich product info (Google-Lens style) ──
        if (productInfo.name) msg += `📦 *${productInfo.name}*\n`;
        if (productInfo.brand) msg += `🏷️ Brand: *${productInfo.brand}*\n`;
        if (productInfo.category) msg += `📁 Category: ${productInfo.category}\n`;
        if (productInfo.weight) msg += `⚖️ Size/Weight: ${productInfo.weight}\n`;
        if (productInfo.mrp) msg += `💰 MRP: ₹${productInfo.mrp}\n`;
        if (productInfo.country) msg += `🌍 Origin: ${productInfo.country}\n`;
        if (productInfo.nutriscore) msg += `🥗 Nutri-Score: ${productInfo.nutriscore}\n`;
        if (productInfo.fssai) msg += `✅ FSSAI Licensed\n`;
        if (productInfo.expiryRaw) msg += `📅 Best Before: ${productInfo.expiryRaw}\n`;

        // Descriptive sentence
        if (productInfo.description) {
          msg += `\n📝 *About this product:*\n_${productInfo.description}_\n`;
        }

        msg += `\n🔢 How many units are you adding? _(Enter a number)_`;
        await setSession(phoneNumber, { step: 'WAITING_QTY_BARCODE' });
      } else {
        msg += `⚠️ Could not identify product from barcode \`${barcodeNumber}\`.\n\nPlease enter the product name:`;
        await setSession(phoneNumber, { step: 'WAITING_NAME_BARCODE' });
      }

      await sendMessage(phoneNumber, withNav(msg));
    } catch (err) {
      console.error('Barcode Error:', err.message);
      await sendMessage(
        phoneNumber,
        withNav(`⚠️ Could not read the barcode clearly.\n\n1️⃣ Try Again with a clearer photo\n2️⃣ Upload Invoice instead\n3️⃣ Type product details manually`)
      );
      await setSession(phoneNumber, { step: 'CHOOSE_METHOD' });
    } finally {
      if (filePath) deleteTempFile(filePath);
    }
    return;
  }

  // ── Product name after unknown barcode ─────────────────────────────────────
  if (step === 'WAITING_NAME_BARCODE') {
    const name = messageBody.trim();
    await setTempData(phoneNumber, { name });
    await setSession(phoneNumber, { step: 'WAITING_QTY_BARCODE' });
    await sendMessage(phoneNumber, withNav(`🔢 How many units of *${name}* are you adding?`));
    return;
  }

  // ── Quantity for barcode product ───────────────────────────────────────────
  if (step === 'WAITING_QTY_BARCODE') {
    const qty = parseQuantity(messageBody);
    if (!qty || qty < 1) {
      await sendMessage(phoneNumber, withNav(`Please enter a valid number (e.g., 24).`));
      return;
    }
    await setTempData(phoneNumber, { quantity: qty });
    await setSession(phoneNumber, { step: 'WAITING_EXPIRY_BARCODE' });
    await sendMessage(
      phoneNumber,
      withNav(`📅 What is the *expiry date* of this batch?\n_(Format: MM/YYYY or Month YYYY)_\n\nType *SKIP* if no expiry date.`)
    );
    return;
  }

  // ── Expiry for barcode product ─────────────────────────────────────────────
  if (step === 'WAITING_EXPIRY_BARCODE') {
    const expiryDate = isSkip(messageBody) ? null : parseExpiryDate(messageBody);
    await setTempData(phoneNumber, { expiryDate });
    await setSession(phoneNumber, { step: 'WAITING_PRICE_BARCODE' });
    await sendMessage(phoneNumber, withNav(`💰 What is the price/MRP per unit? _(e.g., 45 or ₹45)_\n\nType *SKIP* to skip.`));
    return;
  }

  // ── Price for barcode product ──────────────────────────────────────────────
  if (step === 'WAITING_PRICE_BARCODE') {
    const price = isSkip(messageBody) ? 0 : parsePrice(messageBody);
    await setTempData(phoneNumber, { price: price || 0 });
    await setSession(phoneNumber, { step: 'WAITING_CONFIRM' });
    await sendConfirmation(phoneNumber, { ...tempData, price: price || 0 });
    return;
  }

  // ── Manual Text Entry ─────────────────────────────────────────────────────
  if (step === 'WAITING_MANUAL_TEXT') {
    const parsed = parseProductText(messageBody);

    if (!parsed.name) {
      await sendMessage(
        phoneNumber,
        withNav(`⚠️ Could not understand product details.\n\nPlease try again like:\n_"50 units Parle-G expiry March 2026"_`)
      );
      return;
    }

    await setTempData(phoneNumber, { ...parsed, addedVia: 'manual' });

    if (!parsed.quantity) {
      await setSession(phoneNumber, { step: 'WAITING_QTY_MANUAL' });
      await sendMessage(phoneNumber, withNav(`📦 Got *${parsed.name}*!\n\n🔢 How many units are you adding?`));
      return;
    }

    if (!parsed.expiryDate) {
      await setSession(phoneNumber, { step: 'WAITING_EXPIRY_MANUAL' });
      await sendMessage(
        phoneNumber,
        withNav(`📅 What is the expiry date for *${parsed.name}*?\n_(Format: MM/YYYY)_\n\nType *SKIP* if no expiry.`)
      );
      return;
    }

    await setSession(phoneNumber, { step: 'WAITING_CONFIRM' });
    await sendConfirmation(phoneNumber, { ...parsed, addedVia: 'manual' });
    return;
  }

  // ── Manual quantity ────────────────────────────────────────────────────────
  if (step === 'WAITING_QTY_MANUAL') {
    const qty = parseQuantity(messageBody);
    if (!qty || qty < 1) {
      await sendMessage(phoneNumber, withNav(`Please enter a valid number.`));
      return;
    }
    await setTempData(phoneNumber, { quantity: qty });

    if (!tempData.expiryDate) {
      await setSession(phoneNumber, { step: 'WAITING_EXPIRY_MANUAL' });
      await sendMessage(
        phoneNumber,
        withNav(`📅 What is the expiry date?\n_(Format: MM/YYYY or Month YYYY)_\n\nType *SKIP* if no expiry.`)
      );
    } else {
      await setSession(phoneNumber, { step: 'WAITING_CONFIRM' });
      await sendConfirmation(phoneNumber, { ...tempData, quantity: qty });
    }
    return;
  }

  // ── Manual expiry ─────────────────────────────────────────────────────────
  if (step === 'WAITING_EXPIRY_MANUAL') {
    const expiryDate = isSkip(messageBody) ? null : parseExpiryDate(messageBody);
    await setTempData(phoneNumber, { expiryDate });
    await setSession(phoneNumber, { step: 'WAITING_CONFIRM' });
    await sendConfirmation(phoneNumber, { ...tempData, expiryDate });
    return;
  }

  // ── Confirmation ──────────────────────────────────────────────────────────
  if (step === 'WAITING_CONFIRM') {
    if (isYes(messageBody)) {
      // Save to DB
      const updatedUser = await User.findOne({ phoneNumber });
      const shopId = updatedUser.activeShopId;
      const shopName = updatedUser.shops.find((s) => String(s.shopId) === String(shopId))?.shopName || 'Your Shop';

      try {
        await addProduct(shopId, tempData);
        await clearSession(phoneNumber);
        await sendMessage(
          phoneNumber,
          `✅ *Product saved successfully!*\n\n📦 *${tempData.name}* added to *${shopName}*.\n\nWhat would you like to do next?\n\n1️⃣ ➕ Add Another Product\n2️⃣ 📋 View Inventory\n3️⃣ 🏠 Main Menu`
        );
        await setSession(phoneNumber, { currentFlow: 'POST_ADD', step: 'WAITING_POST_ADD' });
      } catch (err) {
        await sendMessage(phoneNumber, withNav(`❌ Error saving product: ${err.message}\n\nPlease try again or type *home*.`));
      }
    } else if (isNo(messageBody)) {
      await clearSession(phoneNumber);
      await sendMessage(
        phoneNumber,
        withNav(`❌ Cancelled. No product was saved.\n\n1️⃣ Try Again\n2️⃣ 🏠 Main Menu`)
      );
      await setSession(phoneNumber, { currentFlow: 'POST_CANCEL', step: 'WAITING_POST_CANCEL' });
    } else {
      await sendMessage(phoneNumber, withNav(`Please reply *YES* to save or *NO* to cancel.`));
    }
    return;
  }

  // ── Post-add options ───────────────────────────────────────────────────────
  if (step === 'WAITING_POST_ADD' || step === 'WAITING_POST_CANCEL') {
    const choice = parseInt(messageBody.trim(), 10);
    if (choice === 1) {
      await startAddProduct(phoneNumber);
    } else {
      await sendMainMenu(phoneNumber);
    }
    return;
  }
}

// ── Build confirmation message ─────────────────────────────────────────────────

async function sendConfirmation(phoneNumber, data) {
  const user = await User.findOne({ phoneNumber });
  const shopId = user.activeShopId;
  const shopName = user.shops.find((s) => String(s.shopId) === String(shopId))?.shopName || 'Your Shop';

  let msg = `📋 *Here's the product summary:*\n\n`;
  msg += `📦 *${data.name || 'Unknown'}*\n`;
  if (data.brand) msg += `🏷️ Brand: ${data.brand}\n`;
  msg += `🔢 Qty: *${data.quantity || 0} units*\n`;
  msg += `💰 Price: *₹${data.price || 0}*\n`;
  msg += `📅 Expiry: *${data.expiryDate ? formatDate(data.expiryDate) : 'No Expiry'}*\n`;
  msg += `🏪 Shop: *${shopName}*\n\n`;
  msg += `Confirm? Reply *YES* to save or *NO* to cancel.`;
  await sendMessage(phoneNumber, withNav(msg));
}


module.exports = { startAddProduct, handleAddProduct };
