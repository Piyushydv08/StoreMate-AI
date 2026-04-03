/**
 * test-barcode.js
 * ─────────────────────────────────────────────────────────────────
 * Standalone barcode tester — no WhatsApp / Twilio needed.
 *
 * Usage:
 *   node test-barcode.js                   → scans ALL images in ./temp/
 *   node test-barcode.js temp/myimage.jpg  → scans a specific file
 * ─────────────────────────────────────────────────────────────────
 */

require('dotenv').config();

const path = require('path');
const fs   = require('fs');
const { processBarcode } = require('./src/services/barcodeService');

const TEMP_DIR = path.join(__dirname, 'temp');
const IMAGE_EXTS = ['.jpg', '.jpeg', '.png', '.bmp', '.webp'];

// ── Resolve which file(s) to test ─────────────────────────────────
function getTargetFiles() {
  const arg = process.argv[2];

  if (arg) {
    const absPath = path.isAbsolute(arg) ? arg : path.join(__dirname, arg);
    if (!fs.existsSync(absPath)) {
      console.error(`❌ File not found: ${absPath}`);
      process.exit(1);
    }
    return [absPath];
  }

  // No arg → scan entire temp/ folder
  if (!fs.existsSync(TEMP_DIR)) {
    console.error(`❌ Temp directory not found: ${TEMP_DIR}`);
    process.exit(1);
  }

  const files = fs.readdirSync(TEMP_DIR)
    .filter(f => IMAGE_EXTS.includes(path.extname(f).toLowerCase()))
    .map(f => path.join(TEMP_DIR, f));

  if (files.length === 0) {
    console.error(`❌ No image files found in ${TEMP_DIR}`);
    console.error(`   Supported formats: ${IMAGE_EXTS.join(', ')}`);
    process.exit(1);
  }

  return files;
}

// ── Pretty-print a single result ──────────────────────────────────
function printResult(filePath, result) {
  const label = path.basename(filePath);
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`📸 File : ${label}`);
  console.log(`${'─'.repeat(60)}`);

  if (!result.success) {
    console.log(`❌ Barcode NOT detected`);
    console.log(`   Reason: ${result.error}`);
    return;
  }

  console.log(`✅ Barcode detected: ${result.barcodeNumber}`);

  if (!result.found) {
    console.log(`⚠️  Product NOT found in Open Food Facts`);
  }

  const p = result.productInfo;
  if (p.name)        console.log(`📦 Name        : ${p.name}`);
  if (p.brand)       console.log(`🏷️  Brand       : ${p.brand}`);
  if (p.category)    console.log(`📁 Category    : ${p.category}`);
  if (p.weight)      console.log(`⚖️  Weight      : ${p.weight}`);
  if (p.mrp)         console.log(`💰 MRP         : ₹${p.mrp}`);
  if (p.country)     console.log(`🌍 Country     : ${p.country}`);
  if (p.nutriscore)  console.log(`🥗 Nutri-Score : ${p.nutriscore}`);
  if (p.fssai)       console.log(`✅ FSSAI       : ${p.fssai}`);
  if (p.expiryRaw)   console.log(`📅 Expiry      : ${p.expiryRaw}`);
  if (p.imageUrl)    console.log(`🔗 Image URL   : ${p.imageUrl}`);

  if (p.description) {
    console.log(`\n📝 Description:\n   ${p.description}`);
  }

  if (p.ingredients) {
    const snippet = p.ingredients.substring(0, 120).replace(/\n/g, ' ');
    console.log(`\n🧪 Ingredients (first 120 chars):\n   ${snippet}${p.ingredients.length > 120 ? '...' : ''}`);
  }

  if (p.rawOcrText) {
    const snippet = p.rawOcrText.substring(0, 200);
    console.log(`\n🔍 OCR Text (first 200 chars):\n   ${snippet}${p.rawOcrText.length > 200 ? '...' : ''}`);
  }
}

// ── Main ─────────────────────────────────────────────────────────
async function main() {
  const files = getTargetFiles();
  console.log(`\n🚀 StoreMate AI — Barcode Test Runner`);
  console.log(`   Testing ${files.length} image(s)...\n`);

  for (const filePath of files) {
    try {
      const result = await processBarcode(filePath);
      printResult(filePath, result);
    } catch (err) {
      console.log(`\n❌ Unexpected error for ${path.basename(filePath)}: ${err.message}`);
    }
  }

  console.log(`\n${'═'.repeat(60)}`);
  console.log(`✔  Done testing ${files.length} image(s).`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
