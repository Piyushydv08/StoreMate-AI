const express = require('express');
const router = express.Router();
const Product = require('../models/Product');
const Shop = require('../models/Shop');
const Sale = require('../models/Sale');
const Loss = require('../models/Loss');
const inventoryService = require('../services/inventoryService');
const { sendMessage } = require('../services/twilioService');
const alertService = require('../services/alertService');

// ─────────────────────────────────────────────────────────────────────────────
// MIDDLEWARE
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Validate shop existence and ownership (if userId provided)
 */
const validateShop = async (req, res, next) => {
  try {
    const { shopId } = req.params;
    const shop = await Shop.findById(shopId);
    if (!shop) {
      return res.status(404).json({ error: 'Shop not found' });
    }
    req.shop = shop;
    next();
  } catch (err) {
    res.status(400).json({ error: 'Invalid shop ID' });
  }
};

/**
 * Validate product existence
 */
const validateProduct = async (req, res, next) => {
  try {
    const { productId } = req.params;
    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }
    req.product = product;
    next();
  } catch (err) {
    res.status(400).json({ error: 'Invalid product ID' });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// PRODUCT ENDPOINTS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/inventory/:shopId
 * Get all products for a shop with filtering & pagination
 * Query params: category, search, page, limit, sortBy
 */
router.get('/inventory/:shopId', validateShop, async (req, res) => {
  try {
    const { shopId } = req.params;
    const { category, search, page = 1, limit = 20, sortBy = 'createdAt' } = req.query;

    let query = { shopId, isActive: true };

    // Apply filters
    if (category) query.category = category;
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { barcode: { $regex: search, $options: 'i' } },
        { brand: { $regex: search, $options: 'i' } }
      ];
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const sortObj = {};
    sortObj[sortBy] = sortBy.startsWith('-') ? -1 : -1; // Default descending

    const products = await Product.find(query)
      .sort(sortObj)
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Product.countDocuments(query);

    res.json({
      success: true,
      data: products,
      pagination: {
        total,
        pages: Math.ceil(total / limit),
        currentPage: parseInt(page),
        limit: parseInt(limit)
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/inventory/:shopId/:productId
 * Get single product details
 */
router.get('/inventory/:shopId/:productId', validateShop, validateProduct, async (req, res) => {
  try {
    const product = req.product;
    
    // Get related sales and losses
    const sales = await Sale.find({ productId: product._id }).sort({ createdAt: -1 }).limit(10);
    const losses = await Loss.find({ productId: product._id }).sort({ createdAt: -1 }).limit(10);

    res.json({
      success: true,
      data: {
        product,
        recentSales: sales,
        recentLosses: losses
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/inventory/:shopId
 * Add new product
 * Body: { name, brand?, barcode?, category?, quantity?, price?, expiryDate?, addedVia? }
 */
router.post('/inventory/:shopId', validateShop, async (req, res) => {
  try {
    const { shopId } = req.params;
    const { name, brand, barcode, category, quantity, price, expiryDate, addedVia } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Product name is required' });
    }

    const product = await inventoryService.addProduct(shopId, {
      name,
      brand: brand || '',
      barcode: barcode || '',
      category: category || '',
      quantity: quantity || 0,
      price: price || 0,
      expiryDate: expiryDate || null,
      addedVia: addedVia || 'manual'
    });

    res.status(201).json({
      success: true,
      message: 'Product added successfully',
      data: product
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * PUT /api/inventory/:shopId/:productId
 * Update product details
 * Body: { name?, brand?, barcode?, category?, price?, expiryDate?, isDiscounted?, discountPercent? }
 */
router.put('/inventory/:shopId/:productId', validateShop, validateProduct, async (req, res) => {
  try {
    const { productId } = req.params;
    const { name, brand, barcode, category, price, expiryDate, isDiscounted, discountPercent } = req.body;

    const updateData = {};
    if (name !== undefined) updateData.name = name;
    if (brand !== undefined) updateData.brand = brand;
    if (barcode !== undefined) updateData.barcode = barcode;
    if (category !== undefined) updateData.category = category;
    if (price !== undefined) updateData.price = price;
    if (expiryDate !== undefined) updateData.expiryDate = expiryDate;
    if (isDiscounted !== undefined) updateData.isDiscounted = isDiscounted;
    if (discountPercent !== undefined) updateData.discountPercent = discountPercent;

    updateData.updatedAt = new Date();

    const product = await Product.findByIdAndUpdate(productId, updateData, { new: true });

    res.json({
      success: true,
      message: 'Product updated successfully',
      data: product
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * DELETE /api/inventory/:shopId/:productId
 * Soft delete product (mark as inactive)
 */
router.delete('/inventory/:shopId/:productId', validateShop, validateProduct, async (req, res) => {
  try {
    const { productId } = req.params;

    const product = await Product.findByIdAndUpdate(
      productId,
      { isActive: false, updatedAt: new Date() },
      { new: true }
    );

    res.json({
      success: true,
      message: 'Product deleted successfully',
      data: product
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// INVENTORY ADJUSTMENT ENDPOINTS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * POST /api/inventory/:shopId/:productId/adjust
 * Adjust product quantity
 * Body: { quantity, reason? }
 */
router.post('/inventory/:shopId/:productId/adjust', validateShop, validateProduct, async (req, res) => {
  try {
    const { productId } = req.params;
    const { quantity, reason } = req.body;

    if (quantity === undefined || quantity < 0) {
      return res.status(400).json({ error: 'Valid quantity is required' });
    }

    const product = await inventoryService.updateQuantity(productId, quantity);

    res.json({
      success: true,
      message: 'Inventory adjusted successfully',
      data: product,
      adjustmentReason: reason || 'manual'
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/inventory/:shopId/:productId/increment
 * Increase quantity by amount
 * Body: { amount, reason? }
 */
router.post('/inventory/:shopId/:productId/increment', validateShop, validateProduct, async (req, res) => {
  try {
    const { productId } = req.params;
    const product = req.product;
    const { amount, reason } = req.body;

    if (amount === undefined || amount <= 0) {
      return res.status(400).json({ error: 'Amount must be positive' });
    }

    const newQty = product.quantity + parseInt(amount);
    const updated = await inventoryService.updateQuantity(productId, newQty);

    res.json({
      success: true,
      message: 'Quantity increased',
      data: updated,
      previousQuantity: product.quantity,
      newQuantity: newQty,
      reason: reason || 'restock'
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/inventory/:shopId/:productId/decrement
 * Decrease quantity by amount
 * Body: { amount, reason? }
 */
router.post('/inventory/:shopId/:productId/decrement', validateShop, validateProduct, async (req, res) => {
  try {
    const { productId } = req.params;
    const product = req.product;
    const { amount, reason } = req.body;

    if (amount === undefined || amount <= 0) {
      return res.status(400).json({ error: 'Amount must be positive' });
    }

    const newQty = Math.max(0, product.quantity - parseInt(amount));
    const updated = await inventoryService.updateQuantity(productId, newQty);

    res.json({
      success: true,
      message: 'Quantity decreased',
      data: updated,
      previousQuantity: product.quantity,
      newQuantity: newQty,
      reason: reason || 'sale'
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// SALES RECORDING
// ─────────────────────────────────────────────────────────────────────────────

/**
 * POST /api/inventory/:shopId/:productId/sale
 * Record a sale and update inventory
 * Body: { unitsSold, customerPhone? }
 */
router.post('/inventory/:shopId/:productId/sale', validateShop, validateProduct, async (req, res) => {
  try {
    const { shopId, productId } = req.params;
    const { unitsSold, customerPhone } = req.body;

    if (!unitsSold || unitsSold <= 0) {
      return res.status(400).json({ error: 'Units sold must be positive' });
    }

    const { product, sale, isLowStock } = await inventoryService.recordSale(
      shopId,
      productId,
      parseInt(unitsSold)
    );

    // Alert if low stock
    if (isLowStock && !product.lowStockAlerted) {
      await alertService.sendLowStockAlert(shopId, product);
      product.lowStockAlerted = true;
      await product.save();
    }

    res.status(201).json({
      success: true,
      message: 'Sale recorded successfully',
      data: {
        product,
        sale,
        isLowStock,
        alert: isLowStock ? 'Low stock warning' : null
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// LOSS RECORDING
// ─────────────────────────────────────────────────────────────────────────────

/**
 * POST /api/inventory/:shopId/:productId/loss
 * Record product loss
 * Body: { unitsLost, reason: 'expired'|'damaged'|'stolen'|'other', notes? }
 */
router.post('/inventory/:shopId/:productId/loss', validateShop, validateProduct, async (req, res) => {
  try {
    const { shopId, productId } = req.params;
    const { unitsLost, reason, notes } = req.body;

    if (!unitsLost || unitsLost <= 0) {
      return res.status(400).json({ error: 'Units lost must be positive' });
    }

    const validReasons = ['expired', 'damaged', 'stolen', 'other'];
    if (!reason || !validReasons.includes(reason)) {
      return res.status(400).json({ error: `Reason must be one of: ${validReasons.join(', ')}` });
    }

    const { product, loss } = await inventoryService.recordLoss(
      shopId,
      productId,
      parseInt(unitsLost),
      reason
    );

    res.status(201).json({
      success: true,
      message: 'Loss recorded successfully',
      data: {
        product,
        loss,
        estimatedLoss: loss.estimatedLoss
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// INVENTORY ANALYTICS & REPORTS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/inventory/:shopId/statistics/overview
 * Get inventory statistics dashboard
 */
router.get('/inventory/:shopId/statistics/overview', validateShop, async (req, res) => {
  try {
    const { shopId } = req.params;

    const totalProducts = await Product.countDocuments({ shopId, isActive: true });
    const lowStockProducts = await Product.countDocuments({ 
      shopId, 
      isActive: true, 
      quantity: { $lte: 3 } 
    });
    const expiredProducts = await Product.countDocuments({
      shopId,
      isActive: true,
      expiryDate: { $lt: new Date() }
    });

    const products = await Product.find({ shopId, isActive: true });
    const totalInventoryValue = products.reduce((sum, p) => sum + (p.quantity * p.price), 0);

    const totalSales = await Sale.aggregate([
      { $match: { shopId: require('mongoose').Types.ObjectId(shopId) } },
      { $group: { _id: null, total: { $sum: '$totalAmount' }, count: { $sum: 1 } } }
    ]);

    const totalLosses = await Loss.aggregate([
      { $match: { shopId: require('mongoose').Types.ObjectId(shopId) } },
      { $group: { _id: null, total: { $sum: '$estimatedLoss' }, count: { $sum: 1 } } }
    ]);

    res.json({
      success: true,
      data: {
        totalProducts,
        lowStockProducts,
        expiredProducts,
        totalInventoryValue,
        salesData: totalSales[0] || { total: 0, count: 0 },
        lossesData: totalLosses[0] || { total: 0, count: 0 }
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/inventory/:shopId/low-stock
 * Get products with low stock
 * Query params: threshold (default 3)
 */
router.get('/inventory/:shopId/low-stock', validateShop, async (req, res) => {
  try {
    const { shopId } = req.params;
    const threshold = parseInt(req.query.threshold) || 3;

    const lowStockProducts = await Product.find({
      shopId,
      isActive: true,
      quantity: { $lte: threshold }
    }).sort({ quantity: 1 });

    res.json({
      success: true,
      threshold,
      count: lowStockProducts.length,
      data: lowStockProducts
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/inventory/:shopId/expiring
 * Get products expiring soon
 * Query params: daysUntil (default 7)
 */
router.get('/inventory/:shopId/expiring', validateShop, async (req, res) => {
  try {
    const { shopId } = req.params;
    const daysUntil = parseInt(req.query.daysUntil) || 7;

    const today = new Date();
    const expiryThreshold = new Date(today.getTime() + daysUntil * 24 * 60 * 60 * 1000);

    const expiringProducts = await Product.find({
      shopId,
      isActive: true,
      expiryDate: {
        $gte: today,
        $lte: expiryThreshold
      }
    }).sort({ expiryDate: 1 });

    res.json({
      success: true,
      daysUntil,
      count: expiringProducts.length,
      data: expiringProducts
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/inventory/:shopId/top-products
 * Get top selling products
 * Query params: limit (default 10), days (default 30)
 */
router.get('/inventory/:shopId/top-products', validateShop, async (req, res) => {
  try {
    const { shopId } = req.params;
    const limit = parseInt(req.query.limit) || 10;
    const days = parseInt(req.query.days) || 30;

    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const topProducts = await Sale.aggregate([
      {
        $match: {
          shopId: require('mongoose').Types.ObjectId(shopId),
          createdAt: { $gte: since }
        }
      },
      {
        $group: {
          _id: '$productId',
          productName: { $first: '$productName' },
          totalUnits: { $sum: '$unitsSold' },
          totalRevenue: { $sum: '$totalAmount' },
          saleCount: { $sum: 1 }
        }
      },
      { $sort: { totalRevenue: -1 } },
      { $limit: limit }
    ]);

    res.json({
      success: true,
      period: `Last ${days} days`,
      count: topProducts.length,
      data: topProducts
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/inventory/:shopId/categories
 * Get inventory breakdown by category
 */
router.get('/inventory/:shopId/categories', validateShop, async (req, res) => {
  try {
    const { shopId } = req.params;

    const categories = await Product.aggregate([
      { $match: { shopId: require('mongoose').Types.ObjectId(shopId), isActive: true } },
      {
        $group: {
          _id: '$category',
          count: { $sum: 1 },
          totalQuantity: { $sum: '$quantity' },
          totalValue: { $sum: { $multiply: ['$quantity', '$price'] } },
          avgPrice: { $avg: '$price' }
        }
      },
      { $sort: { totalValue: -1 } }
    ]);

    res.json({
      success: true,
      count: categories.length,
      data: categories
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// SALES & LOSS HISTORY
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/inventory/:shopId/sales
 * Get sales history
 * Query params: page, limit, productId, startDate, endDate
 */
router.get('/inventory/:shopId/sales', validateShop, async (req, res) => {
  try {
    const { shopId } = req.params;
    const { page = 1, limit = 20, productId, startDate, endDate } = req.query;

    let query = { shopId };
    if (productId) query.productId = productId;
    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate);
      if (endDate) query.createdAt.$lte = new Date(endDate);
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const sales = await Sale.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Sale.countDocuments(query);

    res.json({
      success: true,
      data: sales,
      pagination: {
        total,
        pages: Math.ceil(total / limit),
        currentPage: parseInt(page)
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/inventory/:shopId/losses
 * Get loss history
 * Query params: page, limit, productId, reason, startDate, endDate
 */
router.get('/inventory/:shopId/losses', validateShop, async (req, res) => {
  try {
    const { shopId } = req.params;
    const { page = 1, limit = 20, productId, reason, startDate, endDate } = req.query;

    let query = { shopId };
    if (productId) query.productId = productId;
    if (reason) query.reason = reason;
    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate);
      if (endDate) query.createdAt.$lte = new Date(endDate);
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const losses = await Loss.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Loss.countDocuments(query);

    res.json({
      success: true,
      data: losses,
      pagination: {
        total,
        pages: Math.ceil(total / limit),
        currentPage: parseInt(page)
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// BULK OPERATIONS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * POST /api/inventory/:shopId/bulk-import
 * Import multiple products
 * Body: { products: [{ name, brand?, barcode?, category?, quantity?, price?, expiryDate?, addedVia? }] }
 */
router.post('/inventory/:shopId/bulk-import', validateShop, async (req, res) => {
  try {
    const { shopId } = req.params;
    const { products } = req.body;

    if (!Array.isArray(products) || products.length === 0) {
      return res.status(400).json({ error: 'Products array is required' });
    }

    const imported = [];
    const errors = [];

    for (let i = 0; i < products.length; i++) {
      try {
        const product = await inventoryService.addProduct(shopId, products[i]);
        imported.push(product);
      } catch (err) {
        errors.push({
          index: i,
          product: products[i].name,
          error: err.message
        });
      }
    }

    res.status(201).json({
      success: true,
      message: `${imported.length} products imported, ${errors.length} failed`,
      data: {
        imported: imported.length,
        failed: errors.length,
        products: imported,
        errors: errors.length > 0 ? errors : null
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/inventory/:shopId/transfer
 * Transfer inventory between two shops (same owner)
 * Body: { productId, fromShopId, toShopId, quantity }
 */
router.post('/inventory/:shopId/transfer', validateShop, async (req, res) => {
  try {
    const { shopId } = req.params;
    const { productId, targetShopId, quantity } = req.body;

    if (!quantity || quantity <= 0) {
      return res.status(400).json({ error: 'Quantity must be positive' });
    }

    // Get source and target products
    const sourceProduct = await Product.findOne({ _id: productId, shopId });
    const targetProduct = await Product.findOne({ _id: productId, shopId: targetShopId });

    if (!sourceProduct) {
      return res.status(404).json({ error: 'Product not found in source shop' });
    }

    if (sourceProduct.quantity < quantity) {
      return res.status(400).json({ error: 'Insufficient quantity in source shop' });
    }

    // Update source
    sourceProduct.quantity -= quantity;
    await sourceProduct.save();

    // Update or create target
    if (targetProduct) {
      targetProduct.quantity += quantity;
      await targetProduct.save();
    } else {
      // Create copy in target shop
      const newProduct = new Product({...sourceProduct.toObject(), _id: undefined, shopId: targetShopId, quantity});
      await newProduct.save();
    }

    res.json({
      success: true,
      message: `Transferred ${quantity} units from shop ${shopId} to ${targetShopId}`,
      data: {
        sourceShopId: shopId,
        targetShopId,
        productId,
        quantity,
        transferredAt: new Date()
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// ERROR HANDLER
// ─────────────────────────────────────────────────────────────────────────────

router.use((err, req, res, next) => {
  console.error('❌ Route error:', err);
  res.status(500).json({ error: err.message || 'Internal server error' });
});

module.exports = router;
