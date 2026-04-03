const axios = require('axios');
const fs = require('fs');
const path = require('path');
const JimpModule = require('jimp');
const Tesseract = require('tesseract.js');
const { MultiFormatReader, RGBLuminanceSource, BinaryBitmap, HybridBinarizer, DecodeHintType, BarcodeFormat } = require('@zxing/library');

const Jimp = JimpModule.Jimp || JimpModule;

/**
 * barcodeService.js
 * 1. Decodes barcode number from image (@zxing/library — pure npm, no CLI deps)
 * 2. Looks up product details from Open Food Facts (with 24h in-memory cache)
 * 3. Extracts rich product text from the image via Google Vision
 * 4. Composes a unique human-readable product description sentence
 */

// ── 1. Open Food Facts — in-memory TTL cache ──────────────────────────────────

const offCache = new Map();
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

// ── 2. Barcode Decoding (pure npm — @zxing/library) ──────────────────────────

async function decodeBarcode(imagePath) {
  try {
    // Load image via Jimp and try a few preprocessing variants.
    const baseImage = await Jimp.read(imagePath);

    const hints = new Map();
    hints.set(DecodeHintType.POSSIBLE_FORMATS, [
      BarcodeFormat.EAN_13,
      BarcodeFormat.EAN_8,
      BarcodeFormat.UPC_A,
      BarcodeFormat.UPC_E,
      BarcodeFormat.CODE_128,
      BarcodeFormat.CODE_39,
      BarcodeFormat.ITF
    ]);

    const reader = new MultiFormatReader();
    reader.setHints(hints);

    const variants = [
      img => img,
      img => img.clone().greyscale(),
      img => img.clone().greyscale().contrast(0.35),
      img => img.clone().greyscale().contrast(0.45),
      img => img.clone().greyscale().contrast(0.35).invert()
    ];

    for (const makeVariant of variants) {
      try {
        const image = makeVariant(baseImage);
        const { data, width, height } = image.bitmap;
        const luminanceSource = new RGBLuminanceSource(new Uint8ClampedArray(data), width, height);
        const binaryBitmap = new BinaryBitmap(new HybridBinarizer(luminanceSource));
        const result = reader.decode(binaryBitmap);
        if (result?.getText?.()) return result.getText();
      } catch (innerErr) {
        // Continue to next variant if this attempt cannot decode.
      }
    }

    return null;
  } catch (err) {
    // ZXing throws errors when no barcode found; read errors can also happen.
    console.warn('Barcode decode attempt failed:', err.message);
    return null;
  }
}

function isValidEan13(code) {
  if (!/^\d{13}$/.test(code)) return false;
  const digits = code.split('').map(Number);
  const checksum = digits[12];
  let sum = 0;

  for (let i = 0; i < 12; i += 1) {
    sum += i % 2 === 0 ? digits[i] : digits[i] * 3;
  }

  const expected = (10 - (sum % 10)) % 10;
  return checksum === expected;
}

function isValidUpcA(code) {
  if (!/^\d{12}$/.test(code)) return false;
  const digits = code.split('').map(Number);
  const checksum = digits[11];
  let sum = 0;

  for (let i = 0; i < 11; i += 1) {
    sum += i % 2 === 0 ? digits[i] * 3 : digits[i];
  }

  const expected = (10 - (sum % 10)) % 10;
  return checksum === expected;
}

function isValidEan8(code) {
  if (!/^\d{8}$/.test(code)) return false;
  const digits = code.split('').map(Number);
  const checksum = digits[7];
  let sum = 0;

  for (let i = 0; i < 7; i += 1) {
    sum += i % 2 === 0 ? digits[i] * 3 : digits[i];
  }

  const expected = (10 - (sum % 10)) % 10;
  return checksum === expected;
}

function extractBarcodeFromText(ocrText) {
  if (!ocrText) return null;

  const candidates = [];
  const matches = ocrText.match(/\d[\d\s\-]{6,22}\d/g) || [];

  for (const chunk of matches) {
    const digitsOnly = chunk.replace(/\D/g, '');
    if (digitsOnly.length >= 8 && digitsOnly.length <= 14) {
      candidates.push(digitsOnly);
    }
  }

  // Prefer EAN-13/UPC-A over shorter codes.
  for (const c of candidates) {
    if (isValidEan13(c)) return c;
  }
  for (const c of candidates) {
    if (isValidUpcA(c)) return c;
  }
  for (const c of candidates) {
    if (isValidEan8(c)) return c;
  }

  return null;
}

// ── 3. Open Food Facts Lookup (with cache) ────────────────────────────────────

async function lookupBarcode(barcodeNumber) {
  // Check cache first
  const cached = offCache.get(barcodeNumber);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
    console.log(`📦 OFF cache hit for barcode: ${barcodeNumber}`);
    return cached.data;
  }

  try {
    const baseUrl = process.env.OPEN_FOOD_FACTS_API || 'https://world.openfoodfacts.org/api/v0/product';
    const url = `${baseUrl}/${barcodeNumber}.json`;
    const response = await axios.get(url, { timeout: 8000 });

    let result;
    if (response.data.status === 1) {
      const p = response.data.product;
      result = {
        found: true,
        name: p.product_name || p.product_name_en || null,
        brand: p.brands || null,
        category: p.categories_tags ? p.categories_tags[0]?.replace('en:', '') : null,
        quantity: p.quantity || null,          // package size e.g. "100g"
        ingredients: p.ingredients_text || null,
        nutriscore: p.nutriscore_grade ? p.nutriscore_grade.toUpperCase() : null,
        countries: p.countries || null,
        imageUrl: p.image_url || p.image_front_url || null,
        barcodeNumber
      };
    } else {
      result = { found: false, barcodeNumber };
    }

    // Store in cache
    offCache.set(barcodeNumber, { data: result, ts: Date.now() });
    return result;
  } catch (err) {
    console.error('Open Food Facts error:', err.message);
    return { found: false, barcodeNumber };
  }
}

// ── 4. Google Vision OCR on the barcode/product image ────────────────────────

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
              { type: 'PRODUCT_SEARCH' }
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

async function extractTextFromImageTesseract(imagePath) {
  try {
    const { data } = await Tesseract.recognize(imagePath, 'eng', {
      logger: () => {}
    });

    return {
      fullText: data?.text || '',
      labels: []
    };
  } catch (err) {
    console.error('Tesseract barcode OCR error:', err.message);
    return null;
  }
}

// ── 5. Parse useful fields from raw OCR text ──────────────────────────────────

function parseOcrProductDetails(ocrText) {
  if (!ocrText) return {};

  const lines = ocrText.split('\n').map(l => l.trim()).filter(Boolean);
  const details = {};

  // Weight / net content
  const weightMatch = ocrText.match(/(?:net\s*(?:wt\.?|weight|content|qty)?[:\s]*)?(?<w>[\d.]+\s*(?:g|gm|gms|kg|ml|l|ltr|oz|lb))\b/i);
  if (weightMatch) details.weight = weightMatch.groups?.w?.trim() || weightMatch[1]?.trim();

  // MRP / Price
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

  // FSSAI
  const fssaiMatch = ocrText.match(/fssai[:\s#]*(\d{14})/i);
  if (fssaiMatch) details.fssai = fssaiMatch[1];

  // Product name heuristic — first prominent non-metadata line
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

// ── 6. Compose a rich product description ─────────────────────────────────────

function composeProductDescription(offData, ocrDetails, visionLabels = []) {
  const parts = [];

  const name = offData.name || ocrDetails.ocrName || 'This product';
  const brand = offData.brand || null;

  let intro = name;
  if (brand && !name.toLowerCase().includes(brand.toLowerCase())) {
    intro = `${brand} ${name}`;
  }
  parts.push(intro);

  const size = offData.quantity || ocrDetails.weight;
  if (size) parts.push(`comes in a ${size} pack`);

  const category = offData.category || (visionLabels.length ? visionLabels[0] : null);
  if (category) parts.push(`categorised as ${category}`);

  const country = ocrDetails.country || offData.countries;
  if (country) parts.push(`made in ${country}`);

  if (ocrDetails.mrp) parts.push(`with an MRP of ₹${ocrDetails.mrp}`);
  if (offData.nutriscore) parts.push(`Nutri-Score: ${offData.nutriscore}`);
  if (ocrDetails.expiryRaw) parts.push(`best before ${ocrDetails.expiryRaw}`);
  if (ocrDetails.fssai) parts.push(`FSSAI licensed`);

  if (offData.ingredients) {
    const ing = offData.ingredients.replace(/\n/g, ' ').substring(0, 60).trim();
    parts.push(`ingredients include ${ing}${offData.ingredients.length > 60 ? '...' : ''}`);
  }

  if (parts.length === 1) return parts[0];
  const [first, ...rest] = parts;
  return `${first} — ${rest.join(', ')}.`;
}

// ── Main Export ───────────────────────────────────────────────────────────────

async function processBarcode(imagePath) {
  // Step 1: decode barcode number from image
  let barcodeNumber = await decodeBarcode(imagePath);

  // Step 1b: fallback to OCR text-based barcode extraction when ZXing fails.
  let visionResult = null;
  if (!barcodeNumber) {
    visionResult = await extractTextFromImageVision(imagePath);
    barcodeNumber = extractBarcodeFromText(visionResult?.fullText || '');
  }

  if (!barcodeNumber) {
    const tesseractResult = await extractTextFromImageTesseract(imagePath);
    if (tesseractResult && !visionResult) {
      visionResult = tesseractResult;
    }
    barcodeNumber = extractBarcodeFromText(tesseractResult?.fullText || '');
  }

  if (!barcodeNumber) {
    return { success: false, error: 'Could not read barcode from image' };
  }

  console.log(`🔢 Barcode detected: ${barcodeNumber}`);

  // Step 2: Open Food Facts lookup + OCR (parallel if OCR not already fetched)
  let offData;
  if (visionResult) {
    offData = await lookupBarcode(barcodeNumber);
  } else {
    [offData, visionResult] = await Promise.all([
      lookupBarcode(barcodeNumber),
      extractTextFromImageVision(imagePath)
    ]);
  }

  // Step 3: Parse OCR text into structured details
  const ocrDetails = parseOcrProductDetails(visionResult?.fullText || '');
  const visionLabels = visionResult?.labels || [];

  // Step 4: Resolve best product data
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
      imageUrl: offData.imageUrl || null,
      description,
      rawOcrText: visionResult?.fullText || null
    }
  };
}

module.exports = { processBarcode, decodeBarcode, lookupBarcode };
