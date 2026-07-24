const session = requireRoleOrRedirect("admin");
if (session) document.getElementById("userName").textContent = session.user.name;

let products = [];

async function loadStats() {
  try {
    const s = await apiFetch("/api/sales/summary/today");
    document.getElementById("statRevenue").textContent = money(s.revenueToday);
    document.getElementById("statOrders").textContent = s.ordersToday;
    document.getElementById("statUnits").textContent = s.unitsSoldToday;
  } catch (err) {
    console.error(err.message);
  }
}

function stockBadge(p) {
  if (p.stock <= 0) return '<span class="badge badge-out">Out of stock</span>';
  if (p.stock <= p.lowStockThreshold) return '<span class="badge badge-low">Low stock</span>';
  return '<span class="badge badge-ok">In stock</span>';
}

async function loadProducts() {
  try {
    products = await apiFetch("/api/products");
    const rows = document.getElementById("productRows");
    const empty = document.getElementById("productEmpty");

    if (products.length === 0) {
      rows.innerHTML = "";
      empty.style.display = "block";
    } else {
      empty.style.display = "none";
      rows.innerHTML = products.map(p => `
        <tr>
          <td data-label="Product">${p.name}</td>
          <td data-label="SKU" class="mono">${p.sku}</td>
          <td data-label="Category">${p.category || "—"}</td>
          <td data-label="Price" class="mono">${money(p.price)}</td>
          <td data-label="Stock">${p.stock} ${stockBadge(p)}</td>
          <td data-label="">
            <button class="icon-btn" onclick="editProduct('${p._id}')">Edit</button>
            <button class="icon-btn" onclick="deleteProduct('${p._id}')">Delete</button>
          </td>
        </tr>
      `).join("");
    }

    const lowCount = products.filter(p => p.stock <= p.lowStockThreshold).length;
    document.getElementById("statLow").textContent = lowCount;
  } catch (err) {
    console.error(err.message);
  }
}

async function loadSales() {
  try {
    const sales = await apiFetch("/api/sales");
    const rows = document.getElementById("saleRows");
    const empty = document.getElementById("saleEmpty");

    if (sales.length === 0) {
      rows.innerHTML = "";
      empty.style.display = "block";
      return;
    }
    empty.style.display = "none";
    const paymentLabel = { cod: "Cash on delivery", card: "Card", wallet: "Wallet" };

    rows.innerHTML = sales.slice(0, 30).map(s => `
      <tr>
        <td data-label="Date">${new Date(s.createdAt).toLocaleString()}</td>
        <td data-label="Customer">${s.customer ? s.customer.name : "—"}</td>
        <td data-label="Items">${s.items.map(i => `${i.quantity}× ${i.name}`).join(", ")}</td>
        <td data-label="Total" class="mono">${money(s.total)}</td>
        <td data-label="Payment">${paymentLabel[s.paymentMethod] || "Cash on delivery"}${s.paymentReference ? " · " + s.paymentReference : ""}</td>
        <td data-label="Status"><span class="badge ${s.status === "completed" ? "badge-ok" : "badge-out"}">${s.status}</span></td>
      </tr>
    `).join("");
  } catch (err) {
    console.error(err.message);
  }
}

// ---- Product modal ----

function openProductModal() {
  document.getElementById("modalTitle").textContent = "Add product";
  document.getElementById("productForm").reset();
  document.getElementById("productId").value = "";
  document.getElementById("pThreshold").value = 5;
  document.getElementById("modalAlert").classList.remove("show");
  document.getElementById("productModal").classList.add("show");
}

function editProduct(id) {
  const p = products.find(x => x._id === id);
  if (!p) return;
  document.getElementById("modalTitle").textContent = "Edit product";
  document.getElementById("productId").value = p._id;
  document.getElementById("pName").value = p.name;
  document.getElementById("pSku").value = p.sku;
  document.getElementById("pCategory").value = p.category || "";
  document.getElementById("pPrice").value = p.price;
  document.getElementById("pStock").value = p.stock;
  document.getElementById("pThreshold").value = p.lowStockThreshold;
  document.getElementById("pDescription").value = p.description || "";
  document.getElementById("modalAlert").classList.remove("show");
  document.getElementById("productModal").classList.add("show");
}

function closeProductModal() {
  document.getElementById("productModal").classList.remove("show");
}

async function deleteProduct(id) {
  if (!confirm("Delete this product? This cannot be undone.")) return;
  try {
    await apiFetch(`/api/products/${id}`, { method: "DELETE" });
    await loadProducts();
  } catch (err) {
    alert(err.message);
  }
}

document.getElementById("productForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const modalAlert = document.getElementById("modalAlert");
  modalAlert.classList.remove("show");

  const id = document.getElementById("productId").value;
  const payload = {
    name: document.getElementById("pName").value.trim(),
    sku: document.getElementById("pSku").value.trim(),
    category: document.getElementById("pCategory").value.trim(),
    price: parseFloat(document.getElementById("pPrice").value),
    stock: parseInt(document.getElementById("pStock").value, 10),
    lowStockThreshold: parseInt(document.getElementById("pThreshold").value || "5", 10),
    description: document.getElementById("pDescription").value.trim(),
  };

  try {
    if (id) {
      await apiFetch(`/api/products/${id}`, { method: "PUT", body: JSON.stringify(payload) });
    } else {
      await apiFetch("/api/products", { method: "POST", body: JSON.stringify(payload) });
    }
    closeProductModal();
    await loadProducts();
  } catch (err) {
    modalAlert.textContent = err.message;
    modalAlert.classList.add("show");
  }
});

// ---- Init ----
async function init() {
  await Promise.all([loadStats(), loadProducts(), loadSales()]);
}
init();
