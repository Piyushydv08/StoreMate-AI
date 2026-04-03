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
  return /^(skip|chodo|chod do|छोड़ो|छोडो)$/i.test(text.trim());
}
const { sendMainMenu } = require('./mainMenuFlow');
const { withNav, isBack, isHome } = require('../utils/navHelper');

function buildUniqueProductName(productInfo) {
  const name = (productInfo?.name || '').trim();
  const brand = (productInfo?.brand || '').trim();

  if (brand && name) {
    return name.toLowerCase().includes(brand.toLowerCase()) ? name : `${brand} ${name}`;
  }
  return name || brand || 'Unknown Product';
}

function toShortDescription(productInfo) {
  const description = (productInfo?.description || '').replace(/\s+/g, ' ').trim();
  if (!description) return '';
  return description.length > 120 ? `${description.slice(0, 117)}...` : description;
}

// ── Entry Point ───────────────────────────────────────────────────────────────

async function startAddProduct(phoneNumber) {
  const user = await User.findOne({ phoneNumber });
  const language = user?.preferredLanguage || 'en';
  await setSession(phoneNumber, { currentFlow: 'ADD_PRODUCT', step: 'CHOOSE_METHOD', tempData: {} });
  await sendMessage(
    phoneNumber,
    withNav(language === 'hi'
      ? `➕ *नया प्रोडक्ट जोड़ें*\n\nआप प्रोडक्ट कैसे जोड़ना चाहेंगे?\n\n1️⃣ 📄 इनवॉइस फोटो अपलोड करें\n2️⃣ 📷 बारकोड फोटो स्कैन करें\n3️⃣ ✍️ मैन्युअली टाइप करें\n\n1, 2 या 3 भेजें।`
      : `➕ *Add New Product*\n\nHow would you like to add the product?\n\n1️⃣ 📄 Upload Invoice Photo\n2️⃣ 📷 Scan Barcode Photo\n3️⃣ ✍️ Type Manually\n\nReply with 1, 2, or 3.`)
  );
}

// ── Main Flow Router ──────────────────────────────────────────────────────────

async function handleAddProduct(user, messageBody, mediaUrl, mediaType, phoneNumber) {
  const step = user.sessionState?.step;
  const tempData = user.sessionState?.tempData || {};
  const language = user?.preferredLanguage || 'en';
  const t = (en, hi) => (language === 'hi' ? hi : en);

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
    await sendMessage(phoneNumber, withNav(t(`↩️ Going back...\n\nPlease re-send your response for the previous step.`, `↩️ वापस जा रहे हैं...\n\nकृपया पिछले स्टेप का उत्तर फिर से भेजें।`)));
    return;
  }

  // ── Choose method ──────────────────────────────────────────────────────────
  if (step === 'CHOOSE_METHOD') {
    const choice = parseInt(messageBody.trim(), 10);
    if (choice === 1) {
      await setSession(phoneNumber, { step: 'WAITING_INVOICE_IMAGE' });
      await sendMessage(phoneNumber, withNav(t(`📸 Please send a clear photo of the *invoice*.\n\nMake sure all text is visible and in focus.`, `📸 कृपया *इनवॉइस* की साफ फोटो भेजें।\n\nसारा टेक्स्ट स्पष्ट और फोकस में होना चाहिए।`)));
    } else if (choice === 2) {
      await setSession(phoneNumber, { step: 'WAITING_BARCODE_IMAGE' });
      await sendMessage(phoneNumber, withNav(t(`📷 Please send a clear photo of the *barcode*.\n\nMake sure the barcode is fully visible and not blurry.`, `📷 कृपया *बारकोड* की साफ फोटो भेजें।\n\nबारकोड पूरा दिखना चाहिए और धुंधला नहीं होना चाहिए।`)));
    } else if (choice === 3) {
      await setSession(phoneNumber, { step: 'WAITING_MANUAL_TEXT' });
      await sendMessage(
        phoneNumber,
        withNav(t(
          `✍️ *Manual Entry*\n\nType product details like:\n\n_"50 units Parle-G expiry March 2026 price 120"_\n\nOr just:\n_"Tata Salt 30 packets ₹18 exp 12/2025"_\n\nHinglish is fine too! 😊`,
          `✍️ *मैन्युअल एंट्री*\n\nप्रोडक्ट डिटेल ऐसे लिखें:\n\n_"50 units Parle-G expiry March 2026 price 120"_\n\nया ऐसे:\n_"Tata Salt 30 packets ₹18 exp 12/2025"_\n\nहिंग्लिश भी चलेगी! 😊`
        ))
      );
    } else {
      await sendMessage(phoneNumber, withNav(t(`Please reply with *1*, *2*, or *3* to choose an option.`, `कृपया विकल्प चुनने के लिए *1*, *2* या *3* भेजें।`)));
    }
    return;
  }

  // ── Invoice Image Received ─────────────────────────────────────────────────
  if (step === 'WAITING_INVOICE_IMAGE') {
    if (!mediaUrl) {
      await sendMessage(phoneNumber, withNav(t(`⚠️ Please send an *image* of the invoice, not text.`, `⚠️ कृपया टेक्स्ट नहीं, इनवॉइस की *इमेज* भेजें।`)));
      return;
    }

    await sendMessage(phoneNumber, t(`🔍 Reading invoice... Please wait a moment.`, `🔍 इनवॉइस पढ़ा जा रहा है... कृपया थोड़ी देर प्रतीक्षा करें।`));
    let filePath = null;

    try {
      filePath = await downloadMedia(mediaUrl);
      const parsed = await performOCR(filePath);
      // ocrService returns { productName, brand, description, quantity, price, expiryRaw }
      if (parsed) parsed.name = parsed.name || parsed.productName;

      if (!parsed || !parsed.name) {
        throw new Error('Could not extract product info');
      }

      const uniqueName = buildUniqueProductName(parsed);
      const shortDescription = toShortDescription(parsed);
      const expiryDate = parsed.expiryRaw ? parseExpiryDate(parsed.expiryRaw) : null;

      await setTempData(phoneNumber, {
        name: uniqueName,
        brand: parsed.brand || '',
        description: shortDescription,
        quantity: parsed.quantity || null,
        price: parsed.price || 0,
        expiryRaw: parsed.expiryRaw || null,
        expiryDate,
        addedVia: 'invoice'
      });

      let msg = `✅ *I found the following from the invoice:*\n\n`;
      if (language === 'hi') msg = `✅ *इनवॉइस से ये जानकारी मिली:*\n\n`;
      msg += language === 'hi' ? `📦 प्रोडक्ट: *${uniqueName}*\n` : `📦 Product: *${uniqueName}*\n`;
      if (parsed.brand) msg += language === 'hi' ? `🏷️ ब्रांड: *${parsed.brand}*\n` : `🏷️ Brand: *${parsed.brand}*\n`;
      if (shortDescription) msg += language === 'hi' ? `📝 विवरण: _${shortDescription}_\n` : `📝 About: _${shortDescription}_\n`;
      msg += parsed.quantity
        ? (language === 'hi' ? `🔢 मात्रा: *${parsed.quantity} यूनिट*\n` : `🔢 Quantity: *${parsed.quantity} units*\n`)
        : (language === 'hi' ? `🔢 मात्रा: _नहीं मिली_\n` : `🔢 Quantity: _Not found_\n`);
      msg += parsed.price
        ? (language === 'hi' ? `💰 कीमत: *₹${parsed.price}*\n` : `💰 Price: *₹${parsed.price}*\n`)
        : (language === 'hi' ? `💰 कीमत: _नहीं मिली_\n` : `💰 Price: _Not found_\n`);
      msg += expiryDate ? (language === 'hi' ? `📅 एक्सपायरी: *${formatDate(expiryDate)}*\n` : `📅 Expiry: *${formatDate(expiryDate)}*\n`) : ``;

      if (!expiryDate) {
        msg += t(`\n❓ I could not find an *expiry date* on this invoice.\nPlease enter the expiry date:\n_(Format: MM/YYYY or Month YYYY — type SKIP if no expiry)_`, `\n❓ मुझे इस इनवॉइस में *expiry date* नहीं मिली।\nकृपया expiry date भेजें:\n_(Format: MM/YYYY या Month YYYY — नहीं है तो SKIP लिखें)_`);
        await setSession(phoneNumber, { step: 'WAITING_EXPIRY_AFTER_INVOICE' });
      } else if (!parsed.quantity) {
        msg += t(`\n❓ Please enter the *quantity* (number of units):`, `\n❓ कृपया *quantity* (units की संख्या) दर्ज करें:`);
        await setSession(phoneNumber, { step: 'WAITING_QTY_AFTER_INVOICE' });
      } else {
        await setSession(phoneNumber, { step: 'WAITING_CONFIRM' });
        msg += t(`\n\nConfirm? Reply *YES* to save or *NO* to cancel.`, `\n\nकन्फर्म करें? सेव करने के लिए *YES* या कैंसल के लिए *NO* लिखें।`);
      }

      await sendMessage(phoneNumber, withNav(msg));
    } catch (err) {
      console.error('OCR Error:', err.message);
      await sendMessage(
        phoneNumber,
        withNav(t(`⚠️ Could not read the invoice clearly.\n\nWhat would you like to do?\n\n1️⃣ Try Again with a clearer photo\n2️⃣ Scan Barcode instead\n3️⃣ Type product details manually`, `⚠️ इनवॉइस साफ़ पढ़ा नहीं गया।\n\nअब आप क्या करना चाहेंगे?\n\n1️⃣ और साफ फोटो के साथ दोबारा कोशिश करें\n2️⃣ बारकोड स्कैन करें\n3️⃣ डिटेल मैन्युअली टाइप करें`))
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
      await sendMessage(phoneNumber, withNav(t(`🔢 How many units are you adding? _(Enter a number)_`, `🔢 आप कितने यूनिट जोड़ रहे हैं? _(एक संख्या लिखें)_`)));
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
      await sendMessage(phoneNumber, withNav(t(`Please enter a valid number (e.g., 50).`, `कृपया सही संख्या दर्ज करें (जैसे 50)।`)));
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
      await sendMessage(phoneNumber, withNav(t(`⚠️ Please send an *image* of the barcode.`, `⚠️ कृपया बारकोड की *इमेज* भेजें।`)));
      return;
    }

    // Validate that the attachment is actually an image (not audio/video)
    if (mediaType && !mediaType.startsWith('image/')) {
      await sendMessage(
        phoneNumber,
        withNav(t(`⚠️ Please send an *image* file (JPG or PNG), not a video or audio file.`, `⚠️ कृपया केवल *image* फाइल (JPG/PNG) भेजें, वीडियो या ऑडियो नहीं।`))
      );
      return;
    }

    await sendMessage(phoneNumber, t(`🔍 Scanning barcode & extracting product details... Please wait.`, `🔍 बारकोड स्कैन करके प्रोडक्ट डिटेल निकाली जा रही है... कृपया प्रतीक्षा करें।`));
    let filePath = null;

    try {
      filePath = await downloadMedia(mediaUrl);
      const result = await processBarcode(filePath);

      if (!result.success) {
        throw new Error(result.error || 'Barcode not readable');
      }

      const { barcodeNumber, productInfo } = result;
      const uniqueName = buildUniqueProductName(productInfo);
      const shortDescription = toShortDescription(productInfo);

      // Persist product info into session tempData (barcodeNumber kept for DB de-dup/re-lookup)
      await setTempData(phoneNumber, {
        barcode: barcodeNumber,
        name: uniqueName,
        brand: productInfo.brand,
        category: productInfo.category,
        price: productInfo.mrp || 0,
        expiryRaw: productInfo.expiryRaw,
        description: shortDescription,
        addedVia: 'barcode'
      });

      // Always collect expiry from user for barcode flow because packaging batch expiry varies.

      let msg = `✅ *Barcode scanned:* \`${barcodeNumber}\`\n\n`;
      if (language === 'hi') msg = `✅ *बारकोड स्कैन हुआ:* \`${barcodeNumber}\`\n\n`;

      if (productInfo.name || productInfo.description) {
        // ── Rich product info (Google-Lens style) ──
        if (uniqueName) msg += `📦 *${uniqueName}*\n`;
        if (productInfo.brand) msg += language === 'hi' ? `🏷️ ब्रांड: *${productInfo.brand}*\n` : `🏷️ Brand: *${productInfo.brand}*\n`;
        if (productInfo.category) msg += language === 'hi' ? `📁 श्रेणी: ${productInfo.category}\n` : `📁 Category: ${productInfo.category}\n`;
        if (productInfo.weight) msg += language === 'hi' ? `⚖️ वजन/आकार: ${productInfo.weight}\n` : `⚖️ Size/Weight: ${productInfo.weight}\n`;
        if (productInfo.mrp) msg += language === 'hi' ? `💰 एमआरपी: ₹${productInfo.mrp}\n` : `💰 MRP: ₹${productInfo.mrp}\n`;
        if (productInfo.country) msg += language === 'hi' ? `🌍 मूल देश: ${productInfo.country}\n` : `🌍 Origin: ${productInfo.country}\n`;
        if (productInfo.nutriscore) msg += language === 'hi' ? `🥗 न्यूट्री-स्कोर: ${productInfo.nutriscore}\n` : `🥗 Nutri-Score: ${productInfo.nutriscore}\n`;
        if (productInfo.fssai) msg += language === 'hi' ? `✅ एफएसएसएआई लाइसेंस प्राप्त\n` : `✅ FSSAI Licensed\n`;
        if (productInfo.expiryRaw) msg += language === 'hi' ? `📅 उपभोग सीमा: ${productInfo.expiryRaw}\n` : `📅 Best Before: ${productInfo.expiryRaw}\n`;

        // Descriptive sentence
        if (shortDescription) {
          msg += language === 'hi'
            ? `\n📝 *इस प्रोडक्ट के बारे में:*\n_${shortDescription}_\n`
            : `\n📝 *About this product:*\n_${shortDescription}_\n`;
        }

        msg += t(`\n🔢 How many units are you adding? _(Enter a number)_`, `\n🔢 आप कितने यूनिट जोड़ रहे हैं? _(एक संख्या लिखें)_`);
        await setSession(phoneNumber, { step: 'WAITING_QTY_BARCODE' });
      } else {
        msg += t(`⚠️ Could not identify product from barcode \`${barcodeNumber}\`.\n\nPlease enter the product name:`, `⚠️ बारकोड \`${barcodeNumber}\` से प्रोडक्ट पहचान नहीं पाया।\n\nकृपया प्रोडक्ट का नाम लिखें:`);
        await setSession(phoneNumber, { step: 'WAITING_NAME_BARCODE' });
      }

      await sendMessage(phoneNumber, withNav(msg));
    } catch (err) {
      console.error('Barcode Error:', err.message);
      await sendMessage(
        phoneNumber,
        withNav(t(`⚠️ Could not read the barcode clearly.\n\n1️⃣ Try Again with a clearer photo\n2️⃣ Upload Invoice instead\n3️⃣ Type product details manually`, `⚠️ बारकोड साफ पढ़ा नहीं गया।\n\n1️⃣ और साफ फोटो के साथ दोबारा कोशिश करें\n2️⃣ इनवॉइस अपलोड करें\n3️⃣ डिटेल मैन्युअली टाइप करें`))
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
    await sendMessage(phoneNumber, withNav(t(`🔢 How many units of *${name}* are you adding?`, `🔢 आप *${name}* के कितने यूनिट जोड़ रहे हैं?`)));
    return;
  }

  // ── Quantity for barcode product ───────────────────────────────────────────
  if (step === 'WAITING_QTY_BARCODE') {
    const qty = parseQuantity(messageBody);
    if (!qty || qty < 1) {
      await sendMessage(phoneNumber, withNav(t(`Please enter a valid number (e.g., 24).`, `कृपया सही संख्या दर्ज करें (जैसे 24)।`)));
      return;
    }
    await setTempData(phoneNumber, { quantity: qty });
    await setSession(phoneNumber, { step: 'WAITING_EXPIRY_BARCODE' });
    await sendMessage(
      phoneNumber,
      withNav(t(`📅 What is the *expiry date* of this batch?\n_(Format: MM/YYYY or Month YYYY)_\n\nType *SKIP* if no expiry date.`, `📅 इस बैच की *expiry date* क्या है?\n_(Format: MM/YYYY या Month YYYY)_\n\nअगर expiry नहीं है तो *SKIP* लिखें।`))
    );
    return;
  }

  // ── Expiry for barcode product ─────────────────────────────────────────────
  if (step === 'WAITING_EXPIRY_BARCODE') {
    const expiryDate = isSkip(messageBody) ? null : parseExpiryDate(messageBody);
    await setTempData(phoneNumber, { expiryDate });
    await setSession(phoneNumber, { step: 'WAITING_PRICE_BARCODE' });
    await sendMessage(phoneNumber, withNav(t(`💰 What is the price/MRP per unit? _(e.g., 45 or ₹45)_\n\nType *SKIP* to skip.`, `💰 प्रति यूनिट कीमत/एमआरपी कितनी है? _(जैसे 45 या ₹45)_\n\nछोड़ने के लिए *SKIP* लिखें।`)));
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
        withNav(t(`⚠️ Could not understand product details.\n\nPlease try again like:\n_"50 units Parle-G expiry March 2026"_`, `⚠️ प्रोडक्ट डिटेल समझ नहीं आई।\n\nकृपया ऐसे दोबारा लिखें:\n_"50 units Parle-G expiry March 2026"_`))
      );
      return;
    }

    await setTempData(phoneNumber, { ...parsed, addedVia: 'manual' });

    if (!parsed.quantity) {
      await setSession(phoneNumber, { step: 'WAITING_QTY_MANUAL' });
      await sendMessage(phoneNumber, withNav(t(`📦 Got *${parsed.name}*!\n\n🔢 How many units are you adding?`, `📦 *${parsed.name}* मिल गया!\n\n🔢 आप कितने यूनिट जोड़ रहे हैं?`)));
      return;
    }

    if (!parsed.expiryDate) {
      await setSession(phoneNumber, { step: 'WAITING_EXPIRY_MANUAL' });
      await sendMessage(
        phoneNumber,
        withNav(t(`📅 What is the expiry date for *${parsed.name}*?\n_(Format: MM/YYYY)_\n\nType *SKIP* if no expiry.`, `📅 *${parsed.name}* की एक्सपायरी तारीख क्या है?\n_(Format: MM/YYYY)_\n\nअगर एक्सपायरी नहीं है तो *SKIP* लिखें।`))
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
      await sendMessage(phoneNumber, withNav(t(`Please enter a valid number.`, `कृपया सही संख्या दर्ज करें।`)));
      return;
    }
    await setTempData(phoneNumber, { quantity: qty });

    if (!tempData.expiryDate) {
      await setSession(phoneNumber, { step: 'WAITING_EXPIRY_MANUAL' });
      await sendMessage(
        phoneNumber,
        withNav(t(`📅 What is the expiry date?\n_(Format: MM/YYYY or Month YYYY)_\n\nType *SKIP* if no expiry.`, `📅 एक्सपायरी तारीख क्या है?\n_(Format: MM/YYYY या Month YYYY)_\n\nअगर एक्सपायरी नहीं है तो *SKIP* लिखें।`))
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
          t(`✅ *Product saved successfully!*\n\n📦 *${tempData.name}* added to *${shopName}*.\n\nWhat would you like to do next?\n\n1️⃣ ➕ Add Another Product\n2️⃣ 📋 View Inventory\n3️⃣ 🏠 Main Menu`, `✅ *प्रोडक्ट सफलतापूर्वक सेव हो गया!*\n\n📦 *${tempData.name}* को *${shopName}* में जोड़ दिया गया।\n\nअब आप क्या करना चाहेंगे?\n\n1️⃣ ➕ एक और प्रोडक्ट जोड़ें\n2️⃣ 📋 इन्वेंटरी देखें\n3️⃣ 🏠 मुख्य मेन्यू`)
        );
        await setSession(phoneNumber, { currentFlow: 'POST_ADD', step: 'WAITING_POST_ADD' });
      } catch (err) {
        await sendMessage(phoneNumber, withNav(t(`❌ Error saving product: ${err.message}\n\nPlease try again or type *home*.`, `❌ प्रोडक्ट सेव करते समय त्रुटि: ${err.message}\n\nकृपया फिर से कोशिश करें या *home* लिखें।`)));
      }
    } else if (isNo(messageBody)) {
      await clearSession(phoneNumber);
      await sendMessage(
        phoneNumber,
        withNav(t(`❌ Cancelled. No product was saved.\n\n1️⃣ Try Again\n2️⃣ 🏠 Main Menu`, `❌ रद्द किया गया। कोई प्रोडक्ट सेव नहीं हुआ।\n\n1️⃣ फिर से कोशिश करें\n2️⃣ 🏠 मुख्य मेन्यू`))
      );
      await setSession(phoneNumber, { currentFlow: 'POST_CANCEL', step: 'WAITING_POST_CANCEL' });
    } else {
      await sendMessage(phoneNumber, withNav(t(`Please reply *YES* to save or *NO* to cancel.`, `सेव करने के लिए *YES* या कैंसल करने के लिए *NO* लिखें।`)));
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
  const language = user?.preferredLanguage || 'en';
  const shopId = user.activeShopId;
  const shopName = user.shops.find((s) => String(s.shopId) === String(shopId))?.shopName || 'Your Shop';

  let msg = language === 'hi' ? `📋 *प्रोडक्ट का सारांश:*\n\n` : `📋 *Here's the product summary:*\n\n`;
  msg += `📦 *${data.name || (language === 'hi' ? 'अज्ञात' : 'Unknown')}*\n`;
  if (data.brand) msg += language === 'hi' ? `🏷️ ब्रांड: ${data.brand}\n` : `🏷️ Brand: ${data.brand}\n`;
  msg += language === 'hi' ? `🔢 मात्रा: *${data.quantity || 0} यूनिट*\n` : `🔢 Qty: *${data.quantity || 0} units*\n`;
  msg += language === 'hi' ? `💰 कीमत: *₹${data.price || 0}*\n` : `💰 Price: *₹${data.price || 0}*\n`;
  msg += language === 'hi'
    ? `📅 एक्सपायरी: *${data.expiryDate ? formatDate(data.expiryDate) : 'नहीं है'}*\n`
    : `📅 Expiry: *${data.expiryDate ? formatDate(data.expiryDate) : 'No Expiry'}*\n`;
  msg += language === 'hi' ? `🏪 दुकान: *${shopName}*\n\n` : `🏪 Shop: *${shopName}*\n\n`;
  msg += language === 'hi'
    ? `कन्फर्म करें? सेव करने के लिए *YES* या कैंसल के लिए *NO* लिखें।`
    : `Confirm? Reply *YES* to save or *NO* to cancel.`;
  await sendMessage(phoneNumber, withNav(msg));
}


module.exports = { startAddProduct, handleAddProduct };
