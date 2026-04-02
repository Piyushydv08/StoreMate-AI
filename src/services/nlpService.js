const hinglishMap = require('../utils/hinglishMap');
const { parseDate } = require('../utils/dateParser');

/**
 * Normalise Hinglish text → English
 */
function normalise(text) {
  let t = text.toLowerCase().trim();
  for (const [hindi, english] of Object.entries(hinglishMap)) {
    t = t.replace(new RegExp(`\\b${hindi}\\b`, 'gi'), english);
  }
  return t;
}

/**
 * Extract product details from a free-form text message.
 * Returns { name, quantity, price, expiryRaw }
 */
function parseProductText(text) {
  const norm = normalise(text);
  const result = { name: null, quantity: null, price: null, expiryRaw: null };

  // ── Quantity ────────────────────────────────────────────────────────────────
  // Matches: "50 units", "30 packets", "12 pieces", bare number + optional unit
  const qtyMatch = norm.match(
    /(\d+)\s*(units?|packets?|pieces?|pcs?|boxes?|kg|gm|ltr?|ml|bags?|bottles?|cans?|jars?|rolls?|pairs?)?/
  );
  if (qtyMatch) {
    result.quantity = parseInt(qtyMatch[1]);
  }

  // ── Price ──────────────────────────────────────────────────────────────────
  const priceMatch = norm.match(/(?:rs\.?|₹|price|mrp)\s*(\d+(?:\.\d{1,2})?)/i);
  if (priceMatch) result.price = parseFloat(priceMatch[1]);

  // ── Expiry date ─────────────────────────────────────────────────────────────
  // "expiry march 2026" / "valid till 03/2026" / "exp 12/2025"
  const expiryMatch = norm.match(
    /(?:expir(?:y|es?)|exp|valid till?|khatam|tak chalega)\s+(\d{1,2}\s+[a-z]+\s+\d{2,4}|\d{1,2}[\/\-]\d{2,4}|[a-z]+\s+\d{2,4}|\d{4}[\/\-]\d{1,2})/i
  );
  if (expiryMatch) result.expiryRaw = expiryMatch[1].trim();

  // ── Product name ────────────────────────────────────────────────────────────
  // Remove quantity, price, expiry tokens → rest is the name
  let namePart = text
    .replace(/(\d+)\s*(units?|packets?|pieces?|pcs?|boxes?|kg|gm|ltr?|ml|bags?|bottles?|cans?|jars?|rolls?|pairs?)?/gi, '')
    .replace(/(?:rs\.?|₹|price|mrp)\s*\d+(?:\.\d+)?/gi, '')
    .replace(/(?:expir(?:y|es?)|exp|valid till?|khatam|tak chalega)\s+[\w\/\-\s]+/gi, '')
    .replace(/\b(add|karo|jodo|daalo|of)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();

  result.name = namePart || null;

  return result;
}

/**
 * Detect intent from a message
 */
function detectIntent(text) {
  const norm = normalise(text).trim();

  if (/^(yes|haan|ha|bilkul|theek hai|confirm|ok|sure)$/i.test(norm)) return 'YES';
  if (/^(no|nahi|na|cancel|band karo|mat karo)$/i.test(norm)) return 'NO';
  if (/^[1-5]$/.test(norm)) return `OPTION_${norm}`;
  if (/\b(add|jodo|daalo)\b/.test(norm)) return 'ADD_PRODUCT';
  if (/\b(show|dikhao|dekho|inventory|stock)\b/.test(norm)) return 'VIEW_INVENTORY';
  if (/\b(sell|becho|sold|bika)\b/.test(norm)) return 'MARK_SOLD';
  if (/\b(summary|report|daily)\b/.test(norm)) return 'DAILY_SUMMARY';
  if (/\b(settings?|notification|reminder|time)\b/.test(norm)) return 'SETTINGS';
  if (/\b(menu|home|back|main)\b/.test(norm)) return 'MAIN_MENU';
  if (/\b(loss|nuksaan|kharab|expired|waste)\b/.test(norm)) return 'RECORD_LOSS';
  if (/\b(low stock|kam stock|khatam ho raha)\b/.test(norm)) return 'LOW_STOCK';
  if (/\b(help|madad|kya kare)\b/.test(norm)) return 'HELP';

  return 'UNKNOWN';
}

module.exports = { parseProductText, detectIntent, normalise };
