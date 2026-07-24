const express = require("express");
const Product = require("../models/Product");
const { requireAuth, requireRole } = require("../middleware/auth");

const router = express.Router();

// List products - available to any logged-in user (admin or customer)
router.get("/", requireAuth, async (req, res) => {
  try {
    const filter = req.user.role === "customer" ? { active: true } : {};
    const products = await Product.find(filter).sort({ createdAt: -1 });
    res.json(products);
  } catch (err) {
    res.status(500).json({ message: "Could not load products.", error: err.message });
  }
});

// Get one product
router.get("/:id", requireAuth, async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ message: "Product not found." });
    res.json(product);
  } catch (err) {
    res.status(500).json({ message: "Could not load product.", error: err.message });
  }
});

// Admin only: create product
router.post("/", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const { name, sku, category, price, stock, lowStockThreshold, description, imageUrl } = req.body;
    if (!name || !sku || price === undefined || stock === undefined) {
      return res.status(400).json({ message: "Name, SKU, price and stock are required." });
    }
    const product = await Product.create({
      name, sku, category, price, stock, lowStockThreshold, description, imageUrl,
    });
    res.status(201).json(product);
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ message: "A product with this SKU already exists." });
    }
    res.status(500).json({ message: "Could not create product.", error: err.message });
  }
});

// Admin only: update product (details or stock adjustment)
router.put("/:id", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const updates = { ...req.body };
    delete updates._id;

    const product = await Product.findByIdAndUpdate(req.params.id, updates, {
      new: true,
      runValidators: true,
    });
    if (!product) return res.status(404).json({ message: "Product not found." });
    res.json(product);
  } catch (err) {
    res.status(500).json({ message: "Could not update product.", error: err.message });
  }
});

// Admin only: delete product
router.delete("/:id", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const product = await Product.findByIdAndDelete(req.params.id);
    if (!product) return res.status(404).json({ message: "Product not found." });
    res.json({ message: "Product deleted." });
  } catch (err) {
    res.status(500).json({ message: "Could not delete product.", error: err.message });
  }
});

module.exports = router;
