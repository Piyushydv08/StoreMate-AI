const Tesseract = require('tesseract.js');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

/**
 * OCR using Tesseract.js locally
 */
async function tesseractOCR(imagePath) {
  try {
    const { data: { text } } = await Tesseract.recognize(imagePath, 'eng+hin', {
      logger: () => {}
    });
    return text;
  } catch (err) {
    console.error('Tesseract error:', err.message);
    return null;
  }
}

/**
 * OCR using Google Vision API
 */
async function googleVisionOCR(imagePath) {
  try {
    const imageBuffer = fs.readFileSync(imagePath);
    const base64 = imageBuffer.toString('base64');

    const response = await axios.post(
      `https://vision.googleapis.com/v1/images:annotate?key=${process.env.GOOGLE_VISION_API_KEY}`,
      {
        requests: [
          {
            image: { content: base64 },
            features: [{ type: 'TEXT_DETECTION' }]
          }
        ]
      }
    );

    const annotations = response.data.responses[0].textAnnotations;
    if (annotations && annotations.length > 0) {
      return annotations[0].description;
    }
    return null;
  } catch (err) {
    console.error('Google Vision error:', err.message);
    return null;
  }
}

/**
 * Extract structured product info from OCR text (invoice)
 */
function extractInvoiceData(ocrText) {
  const lines = ocrText.split('\n').map(l => l.trim()).filter(Boolean);
  const result = { productName: null, quantity: null, price: null, expiryRaw: null, rawLines: lines };

  for (const line of lines) {
    // Price patterns: Rs. 120, ₹120, MRP: 120
    if (!result.price) {
      const priceMatch = line.match(/(?:rs\.?|₹|mrp|rate|price)[:\s]*(\d+(?:\.\d{1,2})?)/i);
      if (priceMatch) result.price = parseFloat(priceMatch[1]);
    }

    // Quantity patterns: 50 units, qty: 30, 12 pcs
    if (!result.quantity) {
      const qtyMatch = line.match(/(?:qty|quantity|units?|nos?)[:\s]*(\d+)/i);
      if (qtyMatch) result.quantity = parseInt(qtyMatch[1]);
    }

    // Expiry patterns
    if (!result.expiryRaw) {
      const expMatch = line.match(/(?:exp(?:iry)?|best before|bb|use by)[:\s]*([0-9\/\-a-zA-Z\s]+)/i);
      if (expMatch) result.expiryRaw = expMatch[1].trim();
    }
  }

  // Product name: usually first meaningful line that isn't a number/address
  for (const line of lines) {
    if (
      line.length > 3 &&
      !/^\d+$/.test(line) &&
      !/(?:invoice|bill|tax|gst|total|amount|date|address|phone)/i.test(line) &&
      !/^(?:rs|₹|\d)/i.test(line)
    ) {
      result.productName = line;
      break;
    }
  }

  return result;
}

/**
 * Main OCR function: tries Google Vision, falls back to Tesseract
 */
async function performOCR(imagePath) {
  let text = null;

  if (process.env.GOOGLE_VISION_API_KEY) {
    text = await googleVisionOCR(imagePath);
  }

  if (!text) {
    console.log('Falling back to Tesseract...');
    text = await tesseractOCR(imagePath);
  }

  if (!text) return null;

  return extractInvoiceData(text);
}

module.exports = { performOCR, extractInvoiceData };
