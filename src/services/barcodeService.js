const axios = require('axios');
const fs = require('fs');
const { execSync } = require('child_process');

/**
 * barcodeService.js
 * 1. Decodes barcode number from image (zbarimg CLI)
 * 2. Looks up product details from Open Food Facts
 * 3. Extracts rich product text from the image via Google Vision (like Google Lens)
 * 4. Composes a unique human-readable product description sentence
 */

// ── 1. Barcode Decoding ───────────────────────────────────────────────────────

function decodeBarcode(imagePath) {
  try {
    const output = execSync(`zbarimg --raw -q "${imagePath}" 2>/dev/null`).toString().trim();
    if (output) return output.split('\n')[0].trim();
  } catch (e) {}

  try {
    const output = execSync(`zbarcam --raw "${imagePath}" 2>/dev/null`).toString().trim();
    if (output) return output;
  } catch (e) {}

  return null;
}

// ── 2. Open Food Facts Lookup ─────────────────────────────────────────────────

async function lookupBarcode(barcodeNumber) {
  try {
    const url = `${process.env.OPEN_FOOD_FACTS_API || 'https://world.openfoodfacts.org/api/v0/product'}/${barcodeNumber}.json`;
    const response = await axios.get(url, { timeout: 8000 });

    if (response.data.status === 1) {
      const p = response.data.product;
      return {
        found: true,
        name: p.product_name || p.product_name_en || null,
        brand: p.brands || null,
        category: p.categories_tags ? p.categories_tags[0]?.replace('en:', '') : null,
        quantity: p.quantity || null,          // package size e.g. "100g"
        ingredients: p.ingredients_text || null,
        nutriscore: p.nutriscore_grade ? p.nutriscore_grade.toUpperCase() : null,
        countries: p.countries || null,
        barcodeNumber
      };
    }
    return { found: false, barcodeNumber };
  } catch (err) {
    console.error('Open Food Facts error:', err.message);
    return { found: false, barcodeNumber };
  }
}

// ── 3. Google Vision OCR on the barcode/product image ────────────────────────

async function extractTextFromImageVision(imagePath) {
  if (!process.env.GOOGLE_VISION_API_KEY) return null;

  try {
    const imageBuffer = fs.readFileSync(imagePath);
    const base64 = imageBuffer.toString('base64');

    const response = await axios.post(
      `https://vision.googleapis.com/v1/images:annotate?key=${process.env.GOOGLE_VISION_API_KEY}`,
      {
        requests: [
          {
            image: { content: base64 },
            features: [
              { type: 'TEXT_DETECTION' },
              { type: 'LABEL_DETECTION', maxResults: 5 },
              { type: 'PRODUCT_SEARCH' }          // catches brand logos etc.
            ]
          }
        ]
      },
      { timeout: 10000 }
    );

    const res = response.data.responses[0];
    const fullText = res?.textAnnotations?.[0]?.description || '';
    const labels = (res?.labelAnnotations || []).map(l => l.description);

    return { fullText, labels };
  } catch (err) {
    console.error('Google Vision barcode OCR error:', err.message);
    return null;
  }
}

// ── 4. Parse useful fields from raw OCR text ──────────────────────────────────

function parseOcrProductDetails(ocrText) {
  if (!ocrText) return {};

  const lines = ocrText.split('\n').map(l => l.trim()).filter(Boolean);
  const details = {};

  // Weight / net content: "200g", "500 ml", "1 kg", "Net Wt. 100g"
  const weightMatch = ocrText.match(/(?:net\s*(?:wt\.?|weight|content|qty)?[:\s]*)?([\d.]+\s*(?:g|gm|gms|kg|ml|l|ltr|oz|lb))\b/i);
  if (weightMatch) details.weight = weightMatch[1].trim();

  // MRP / Price: "MRP ₹45", "Rs. 120", "Price: 50"
  const priceMatch = ocrText.match(/(?:mrp|rs\.?|₹|price)[:\s]*([\d]+(?:\.[0-9]{1,2})?)/i);
  if (priceMatch) details.mrp = parseFloat(priceMatch[1]);

  // Expiry / Best Before
  const expiryMatch = ocrText.match(/(?:exp(?:iry)?\.?|best before|bb|mfg\.?\s+date|use by)[:\s]*([0-9]{1,2}[\/\-][0-9]{2,4}(?:[\/\-][0-9]{2,4})?|[a-z]+\s+\d{4})/i);
  if (expiryMatch) details.expiryRaw = expiryMatch[1].trim();

  // Manufacture date
  const mfgMatch = ocrText.match(/(?:mfg\.?|manufactured on|date of mfg)[:\s]*([0-9]{1,2}[\/\-][0-9]{2,4})/i);
  if (mfgMatch) details.mfgDate = mfgMatch[1].trim();

  // Country of origin
  const countryMatch = ocrText.match(/(?:country of origin|made in|origin)[:\s]*([a-zA-Z]+(?:\s[a-zA-Z]+)?)/i);
  if (countryMatch) details.country = countryMatch[1].trim();

  // FSSAI / License number (India-specific)
  const fssaiMatch = ocrText.match(/fssai[:\s#]*(\d{14})/i);
  if (fssaiMatch) details.fssai = fssaiMatch[1];

  // Try to extract product name — often the largest / first prominent line
  // Heuristic: first line that is >4 chars, not all digits, not a price/date line
  for (const line of lines) {
    if (
      line.length > 4 &&
      !/^\d+$/.test(line) &&
      !/(?:mrp|rs\.|₹|exp|mfg|fssai|gst|batch|lot|www\.|@)/i.test(line) &&
      !details.ocrName
    ) {
      details.ocrName = line;
    }
  }

  return details;
}

// ── 5. Compose a rich, unique product description sentence ────────────────────

function composeProductDescription(offData, ocrDetails, visionLabels = []) {
  const parts = [];

  // Product name + brand
  const name = offData.name || ocrDetails.ocrName || 'This product';
  const brand = offData.brand || null;

  let intro = name;
  if (brand && !name.toLowerCase().includes(brand.toLowerCase())) {
    intro = `${brand} ${name}`;
  }
  parts.push(intro);

  // Package size / weight
  const size = offData.quantity || ocrDetails.weight;
  if (size) parts.push(`comes in a ${size} pack`);

  // Category / type from labels or OFF
  const category = offData.category || (visionLabels.length ? visionLabels[0] : null);
  if (category) parts.push(`categorised as ${category}`);

  // Country of origin
  const country = ocrDetails.country || offData.countries;
  if (country) parts.push(`made in ${country}`);

  // MRP
  if (ocrDetails.mrp) parts.push(`with an MRP of ₹${ocrDetails.mrp}`);

  // Nutriscore
  if (offData.nutriscore) parts.push(`Nutri-Score: ${offData.nutriscore}`);

  // Expiry
  if (ocrDetails.expiryRaw) parts.push(`best before ${ocrDetails.expiryRaw}`);

  // FSSAI
  if (ocrDetails.fssai) parts.push(`FSSAI licensed`);

  // Ingredients snippet (first 60 chars)
  if (offData.ingredients) {
    const ing = offData.ingredients.replace(/\n/g, ' ').substring(0, 60).trim();
    parts.push(`ingredients include ${ing}${offData.ingredients.length > 60 ? '...' : ''}`);
  }

  // Compose final sentence
  if (parts.length === 1) return parts[0]; // just the name, no extra info
  const [first, ...rest] = parts;
  return `${first} — ${rest.join(', ')}.`;
}

// ── Main Export ───────────────────────────────────────────────────────────────

async function processBarcode(imagePath) {
  // Step 1: decode barcode number
  const barcodeNumber = decodeBarcode(imagePath);
  if (!barcodeNumber) {
    return { success: false, error: 'Could not read barcode from image' };
  }

  // Step 2: Open Food Facts lookup (parallel with Vision OCR)
  const [offData, visionResult] = await Promise.all([
    lookupBarcode(barcodeNumber),
    extractTextFromImageVision(imagePath)
  ]);

  // Step 3: Parse OCR text into structured details
  const ocrDetails = parseOcrProductDetails(visionResult?.fullText || '');
  const visionLabels = visionResult?.labels || [];

  // Step 4: Determine best product name
  const name = offData.name || ocrDetails.ocrName || null;
  const brand = offData.brand || null;
  const category = offData.category || (visionLabels.length ? visionLabels[0] : null);

  // Step 5: Compose descriptive sentence
  const description = composeProductDescription(offData, ocrDetails, visionLabels);

  return {
    success: true,
    found: !!(offData.found || name),
    barcodeNumber,
    productInfo: {
      name,
      brand,
      category,
      weight: ocrDetails.weight || offData.quantity || null,
      mrp: ocrDetails.mrp || null,
      expiryRaw: ocrDetails.expiryRaw || null,
      country: ocrDetails.country || offData.countries || null,
      fssai: ocrDetails.fssai || null,
      nutriscore: offData.nutriscore || null,
      ingredients: offData.ingredients || null,
      description,                   // ← rich sentence like Google Lens
      rawOcrText: visionResult?.fullText || null
    }
  };
}

module.exports = { processBarcode, decodeBarcode, lookupBarcode };
