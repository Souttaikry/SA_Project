const mongoose = require("mongoose");

const saleItemSchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },
    name: { type: String, required: true }, // snapshot of product name at sale time
    unitPrice: { type: Number, required: true },
    quantity: { type: Number, required: true, min: 1 },
    subtotal: { type: Number, required: true },
  },
  { _id: false }
);

const saleSchema = new mongoose.Schema(
  {
    customer: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    items: { type: [saleItemSchema], required: true },
    total: { type: Number, required: true },
    status: { type: String, enum: ["completed", "cancelled"], default: "completed" },
    paymentMethod: {
      type: String,
      enum: ["cod", "card", "wallet"],
      default: "cod",
    },
    paymentReference: { type: String, default: "" }, // e.g. masked card last 4, wallet id - display only
  },
  { timestamps: true }
);

module.exports = mongoose.model("Sale", saleSchema);
