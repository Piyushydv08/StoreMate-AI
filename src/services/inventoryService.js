const Product = require('../models/Product');
const Loss = require('../models/Loss');
const Sale = require('../models/Sale');
const { sendMessage } = require('./twilioService');
const { formatDate, daysUntil } = require('../utils/dateParser');

/**
 * Add a new product to a shop
 */
async function addProduct(shopId, data) {
  const barcode = (data.barcode || '').trim();
  const normalisedName = (data.name || '').trim();

  // Keep barcode entries unique per shop: update existing stock instead of creating duplicates.
  if (barcode || normalisedName) {
    const duplicateQuery = { shopId, isActive: true };
    if (barcode) {
      duplicateQuery.barcode = barcode;
    } else {
      duplicateQuery.name = normalisedName;
    }

    const existing = await Product.findOne(duplicateQuery);
    if (existing) {
      existing.quantity = (existing.quantity || 0) + (data.quantity || 0);
      existing.price = data.price || existing.price || 0;
      existing.expiryDate = data.expiryDate || existing.expiryDate || null;
      existing.brand = (data.brand || existing.brand || '').trim();
      existing.category = (data.category || existing.category || '').trim();
      existing.description = (data.description || existing.description || '').trim();
      await existing.save();
      return existing;
    }
  }

  const product = new Product({
    shopId,
    name: normalisedName,
    brand: data.brand || '',
    description: data.description || '',
    barcode,
    category: data.category || '',
    quantity: data.quantity || 0,
    price: data.price || 0,
    expiryDate: data.expiryDate || null,
    addedVia: data.addedVia || 'manual'
  });
  await product.save();
  return product;
}

/**
 * Get all active products for a shop
 */
async function getProducts(shopId) {
  return Product.find({ shopId, isActive: true }).sort({ createdAt: -1 });
}

/**
 * Update product quantity
 */
async function updateQuantity(productId, newQty) {
  return Product.findByIdAndUpdate(
    productId,
    { quantity: newQty, updatedAt: new Date() },
    { new: true }
  );
}

/**
 * Record a sale — decrements quantity and saves sale record
 * Returns { product, sale, isLowStock }
 */
async function recordSale(shopId, productId, unitsSold) {
  const product = await Product.findById(productId);
  if (!product) throw new Error('Product not found');

  const newQty = Math.max(0, product.quantity - unitsSold);
  product.quantity = newQty;
  await product.save();

  const sale = new Sale({
    shopId,
    productId,
    productName: product.name,
    unitsSold,
    pricePerUnit: product.price,
    totalAmount: unitsSold * product.price
  });
  await sale.save();

  const isLowStock = newQty <= 3;
  return { product, sale, isLowStock };
}

/**
 * Record a loss
 */
async function recordLoss(shopId, productId, unitsLost, reason) {
  const product = await Product.findById(productId);
  if (!product) throw new Error('Product not found');

  const newQty = Math.max(0, product.quantity - unitsLost);
  product.quantity = newQty;
  if (reason === 'expired') product.isActive = false;
  await product.save();

  const loss = new Loss({
    shopId,
    productId,
    productName: product.name,
    unitsLost,
    pricePerUnit: product.price,
    estimatedLoss: unitsLost * product.price,
    reason
  });
  await loss.save();

  return { product, loss };
}

/**
 * Delete a product (soft delete)
 */
async function deleteProduct(productId) {
  return Product.findByIdAndUpdate(productId, { isActive: false });
}

/**
 * Get daily summary stats for a shop
 */
async function getDailySummary(shopId) {
  const products = await Product.find({ shopId, isActive: true });
  const today = new Date();

  const lowStock = products.filter(p => p.quantity <= 3);
  const expiring7 = products.filter(p => p.expiryDate && daysUntil(p.expiryDate) <= 7 && daysUntil(p.expiryDate) >= 0);
  const expiring3 = products.filter(p => p.expiryDate && daysUntil(p.expiryDate) <= 3 && daysUntil(p.expiryDate) >= 0);
  const expiring1 = products.filter(p => p.expiryDate && daysUntil(p.expiryDate) <= 1 && daysUntil(p.expiryDate) >= 0);

  // Today's sales
  const startOfDay = new Date(today.setHours(0, 0, 0, 0));
  const todaySales = await Sale.find({ shopId, saleDate: { $gte: startOfDay } });
  const totalSold = todaySales.reduce((sum, s) => sum + s.unitsSold, 0);
  const totalRevenue = todaySales.reduce((sum, s) => sum + s.totalAmount, 0);

  return {
    totalProducts: products.length,
    lowStock,
    expiring7,
    expiring3,
    expiring1,
    todaySales: todaySales.length,
    totalSold,
    totalRevenue,
    products
  };
}

/**
 * Format inventory list as WhatsApp message
 */
function formatInventoryList(products, shopName) {
  if (!products.length) return shopName
    ? `📦 *${shopName}* has no products yet.`
    : 'No products found in inventory.';

  const header = shopName ? `📋 *Inventory — ${shopName}* (${products.length} items)\n\n` : '';
  const lines = products.map((p, i) => {
    const expStr = p.expiryDate ? `| Exp: ${formatDate(p.expiryDate)}` : '';
    const lowStr = p.quantity <= 3 ? ' ⚠️' : '';
    const description = (p.description || '').replace(/\s+/g, ' ').trim();
    const shortDescription = description
      ? `\n   📝 ${description.length > 90 ? `${description.slice(0, 87)}...` : description}`
      : '';
    return `${i + 1}. ${p.name} — ${p.quantity} units ${expStr}${lowStr}${shortDescription}`;
  }).join('\n');

  return header + lines;
}

module.exports = {
  addProduct,
  getProducts,
  updateQuantity,
  recordSale,
  recordLoss,
  deleteProduct,
  getDailySummary,
  formatInventoryList
};
