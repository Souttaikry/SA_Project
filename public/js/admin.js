const session = requireRoleOrRedirect("admin");
if (session) document.getElementById("userName").textContent = session.user.name;

let products = [];
let todaySummary = null;
let stockFilter = "all";

async function loadStats() {
  try {
    todaySummary = await apiFetch("/api/sales/summary/today");
    document.getElementById("statRevenue").textContent = money(todaySummary.revenueToday);
    document.getElementById("statOrders").textContent = todaySummary.ordersToday;
    document.getElementById("statUnits").textContent = todaySummary.unitsSoldToday;
  } catch (err) {
    console.error(err.message);
  }
}

function stockBadge(p) {
  if (p.stock <= 0) return '<span class="badge badge-out">Out of stock</span>';
  if (p.stock <= p.lowStockThreshold) return '<span class="badge badge-low">Low stock</span>';
  return '<span class="badge badge-ok">In stock</span>';
}

function renderProductRows(list) {
  const rows = document.getElementById("productRows");
  const empty = document.getElementById("productEmpty");

  if (list.length === 0) {
    rows.innerHTML = "";
    empty.style.display = "block";
  } else {
    empty.style.display = "none";
    rows.innerHTML = list.map(p => `
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
}

async function loadProducts() {
  try {
    products = await apiFetch("/api/products");
    renderProductRows(products);

    const lowCount = products.filter(p => p.stock <= p.lowStockThreshold).length;
    document.getElementById("statLow").textContent = lowCount;
  } catch (err) {
    console.error(err.message);
  }
}

document.getElementById("productSearch")?.addEventListener("input", (e) => {
  const term = e.target.value.trim().toLowerCase();
  const filtered = term
    ? products.filter(p =>
        p.name.toLowerCase().includes(term) ||
        p.sku.toLowerCase().includes(term) ||
        (p.category || "").toLowerCase().includes(term)
      )
    : products;
  renderProductRows(filtered);
});

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

// ---- Generic modal helpers ----
function closeModal(id) {
  document.getElementById(id).classList.remove("show");
}

document.querySelectorAll(".modal-backdrop").forEach((backdrop) => {
  backdrop.addEventListener("click", (e) => {
    if (e.target === backdrop) backdrop.classList.remove("show");
  });
});

const paymentLabel = { cod: "Cash on delivery", card: "Card", wallet: "Wallet" };

// ---- Revenue today modal ----
function openRevenueModal() {
  document.getElementById("revenueModal").classList.add("show");
  if (!todaySummary) return;

  document.getElementById("revenueTotal").textContent = money(todaySummary.revenueToday);
  const breakdown = document.getElementById("revenueBreakdown");
  const empty = document.getElementById("revenueEmpty");
  const paymentColor = { cod: "var(--gray)", card: "var(--green)", wallet: "var(--pink)" };

  const entries = Object.entries(todaySummary.revenueByPayment || {}).filter(([, amt]) => amt > 0);

  if (entries.length === 0) {
    breakdown.innerHTML = "";
    empty.style.display = "block";
    return;
  }
  empty.style.display = "none";
  const max = Math.max(...entries.map(([, amt]) => amt));
  breakdown.innerHTML = entries
    .sort((a, b) => b[1] - a[1])
    .map(([method, amt]) => `
      <div class="rev-row">
        <div class="rev-row-top">
          <span>${paymentLabel[method] || method}</span>
          <span class="amt">${money(amt)}</span>
        </div>
        <div class="rev-track"><div class="rev-fill" style="width:${(amt / max) * 100}%; background:${paymentColor[method] || "var(--green)"}"></div></div>
      </div>
    `).join("");
}

// ---- Orders today modal ----
function openOrdersModal() {
  document.getElementById("ordersModal").classList.add("show");
  if (!todaySummary) return;

  const orders = todaySummary.orders || [];
  document.getElementById("ordersSub").textContent = `${orders.length} order${orders.length === 1 ? "" : "s"} placed.`;

  const list = document.getElementById("ordersList");
  const empty = document.getElementById("ordersEmpty");

  if (orders.length === 0) {
    list.innerHTML = "";
    empty.style.display = "block";
    return;
  }
  empty.style.display = "none";
  list.innerHTML = orders.map((o) => `
    <div class="stock-row">
      <div class="stock-thumb">🧾</div>
      <div class="stock-info">
        <div class="stock-name">${o.customerName}</div>
        <div class="stock-meta">${o.items.map(i => `${i.quantity}× ${i.name}`).join(", ")} · ${paymentLabel[o.paymentMethod] || o.paymentMethod}</div>
      </div>
      <div class="stock-qty">${money(o.total)}<small>${new Date(o.time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</small></div>
    </div>
  `).join("");
}

// ---- Units sold today modal ----
function openUnitsModal() {
  document.getElementById("unitsModal").classList.add("show");
  if (!todaySummary) return;

  const items = todaySummary.unitsByProduct || [];
  document.getElementById("unitsSub").textContent =
    `${todaySummary.unitsSoldToday} unit${todaySummary.unitsSoldToday === 1 ? "" : "s"} across ${items.length} product${items.length === 1 ? "" : "s"}.`;

  const list = document.getElementById("unitsList");
  const empty = document.getElementById("unitsEmpty");

  if (items.length === 0) {
    list.innerHTML = "";
    empty.style.display = "block";
    return;
  }
  empty.style.display = "none";
  list.innerHTML = items.map((p) => `
    <div class="stock-row">
      <div class="stock-thumb">📦</div>
      <div class="stock-info">
        <div class="stock-name">${p.name}</div>
        <div class="stock-meta">${money(p.revenue)} in sales today</div>
      </div>
      <div class="stock-qty">${p.quantity}<small>units</small></div>
    </div>
  `).join("");
}

// ---- Low / out of stock modal ----
function openStockModal() {
  setStockFilter(stockFilter);
  document.getElementById("stockModal").classList.add("show");
}

function setStockFilter(filter) {
  stockFilter = filter;
  document.querySelectorAll(".stock-tab").forEach((tab) => {
    tab.classList.toggle("active", tab.dataset.filter === filter);
  });
  renderStockList();
}

function renderStockList() {
  const outItems = products.filter(p => p.stock <= 0);
  const lowItems = products.filter(p => p.stock > 0 && p.stock <= p.lowStockThreshold);
  const allItems = [...outItems, ...lowItems];

  document.getElementById("countAll").textContent = allItems.length;
  document.getElementById("countOut").textContent = outItems.length;
  document.getElementById("countLow").textContent = lowItems.length;

  const shown = stockFilter === "out" ? outItems : stockFilter === "low" ? lowItems : allItems;

  const list = document.getElementById("stockList");
  const empty = document.getElementById("stockEmpty");

  if (shown.length === 0) {
    list.innerHTML = "";
    empty.style.display = "block";
    return;
  }
  empty.style.display = "none";
  list.innerHTML = shown.map((p) => {
    const isOut = p.stock <= 0;
    return `
      <div class="stock-row ${isOut ? "out" : "low"}">
        <div class="stock-thumb">${isOut ? "🚫" : "⚠️"}</div>
        <div class="stock-info">
          <div class="stock-name">${p.name}</div>
          <div class="stock-meta">${p.sku} · ${p.category || "General"}</div>
        </div>
        <div class="stock-qty">${p.stock}<small>threshold ${p.lowStockThreshold}</small></div>
      </div>
    `;
  }).join("");
}

// ---- Init ----
async function init() {
  await Promise.all([loadStats(), loadProducts(), loadSales()]);
}
init();