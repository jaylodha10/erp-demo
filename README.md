# Radius 9 ERP - Frontend Prototype Demo (`radius-9-erp-proto-demo`)

A standalone, database-free, interactive frontend prototype of the **Radius 9 ERP** system designed for client and stakeholder demonstrations.

---

## 🚀 Key Highlights

- **Zero Backend / Database Dependency**: Runs anywhere without PostgreSQL, Prisma, Supabase, or external server containers.
- **Rich Preloaded Test Data**: Complete dataset for **WonderKids Toy Emporium, Udaipur** (Project `R9-2026-015`) alongside multi-branch data (Jaipur, Delhi NCR, Mumbai).
- **Interactive 1-Click Persona Switcher**:
  - Rohit Sainik (Director / CEO) — Complete P&L, executive dashboards, high-value approvals
  - Vikram Rathore (Project Head) — Multi-project oversight, large PO approvals
  - Amit Verma (Sr. Project Manager) — Site execution, extra work, petty cash, PM inbox
  - Priya Nair (Purchase Manager) — Purchase queue, RFQs, purchase orders
  - Karan Mehta (Commercial & Estimation) — Client enquiries, BOQ builder, quotations
  - Deepak Agarwal (Accounts Head) — 3-way invoice matching, client billing, payments
  - System Admin — Master data catalogs, users, approval rules
- **Live In-Memory State**: Approving workflows, creating enquiries, issuing POs, and updating records immediately reflect in real-time across screens.

---

## 📦 Getting Started

### 1. Install Dependencies
```bash
npm install
```

### 2. Run the Development Server
```bash
npm run dev
```

### 3. Open in Browser
Visit [http://localhost:3000](http://localhost:3000)

---

## 🧭 Interactive Screens Available

1. **Executive Dashboard (`/erp/dashboard`)**
   - CEO summary: order book, pipeline, receivables, payables, project margin risk alerts.
   - Live Project Profitability matrix with breakdown (Materials, Labour, Subcontractor, Petty Cash, Direct Expenses, EAC, Margin %).

2. **Approval Inbox (`/erp/inbox`)**
   - Multi-role pending approvals with 1-click **Approve** and **Reject**.

3. **Enquiries & Sales (`/erp/enquiries`)**
   - Pipeline filter by status (New, Site visit, BOQ submitted, Quotation sent, Won, Lost).
   - Enquiry detail view, BOQs, Quotations, and Client Work Orders.

4. **Projects (`/erp/projects`)**
   - Complete project overview, milestone schedule tracking, budget vs. actuals, and site workspace.

5. **BOQ Builder (`/erp/boq/:id`)**
   - Trade-wise work item breakups, labour norms, material norms, unit selling rates, and baseline locking.

6. **Procurement (`/erp/procurement/queue` & `/orders`)**
   - Purchase queue with site material requests.
   - Purchase orders list, detail views, line items, and delivery status.

7. **Inventory & Stock Explorer (`/erp/inventory`)**
   - Multi-warehouse balances (Jaipur Central Store, Udaipur Site Store, Delhi Site Store), ledger transactions.

8. **Subcontractors (`/erp/subcontractors`)**
   - Subcontractor work orders, measurements, running bills, retention, and TDS deductions.

9. **Accounts & Finance (`/erp/finance/...`)**
   - **Purchase Invoices**: 3-way PO & GRN matching with tolerance flags.
   - **Client Billing**: Sales Invoices (RA Bills), GST and retention deductions.
   - **Receipts**: Client payment logging and bank reconciliations.
   - **Vendor Payments**: Payment runs and remittances.
   - **Direct Expenses**: Site overhead vouchers with bill photos.
   - **Petty Cash**: Site supervisor imprest float management and replenishments.

10. **Administration (`/erp/admin/...`)**
    - User access management with role permissions.
    - Configurable approval matrix rules by document type and monetary slabs.
    - Master data catalogs (Items, UOMs, HSN/SAC, Trades, Cost Centres, Tax).
