/**
 * Gán toàn bộ dữ liệu hiện có (saree) sang đội Công trình tỉnh (cong-trinh),
 * tạo Công trình HCM (nha-may) trống, đưa emp lên company/main/employees,
 * đưa khách hàng lên company/main/customers (dùng chung cả 2 đội).
 *
 * Chạy từ thư mục functions (cần ADC / firebase login):
 *   cd functions
 *   node ../scripts/migrate-to-cong-trinh.cjs
 */
const path = require("path");
const admin = require(path.join(__dirname, "..", "functions", "node_modules", "firebase-admin"));

admin.initializeApp({ projectId: "quan-ly-du-an-7d651" });
const db = admin.firestore();

const ALL_ORGS = ["cong-trinh", "nha-may"];

function normalizeOrgId(id) {
  const o = String(id || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "");
  if (o === "saree") return "cong-trinh";
  return ALL_ORGS.includes(o) ? o : "cong-trinh";
}

async function upsertSharedCustomers(custList) {
  const byId = new Map();
  (custList || []).forEach((cust) => {
    if (!cust || !cust.id) return;
    const id = String(cust.sharedCustId || cust.id);
    if (!byId.has(id)) {
      const row = { ...cust, id };
      delete row.sharedCustId;
      byId.set(id, row);
    }
  });
  let n = 0;
  for (const [id, cust] of byId) {
    await db.doc(`company/main/customers/${id}`).set(
      { ...cust, id, updatedAt: new Date() },
      { merge: true }
    );
    n += 1;
  }
  return n;
}

async function main() {
  const sareeRef = db.doc("workspaces/saree/data/main");
  const ctRef = db.doc("workspaces/cong-trinh/data/main");
  const nmRef = db.doc("workspaces/nha-may/data/main");

  const [sareeSnap, ctSnap, nmSnap] = await Promise.all([
    sareeRef.get(),
    ctRef.get(),
    nmRef.get(),
  ]);

  if (!sareeSnap.exists && !ctSnap.exists) {
    console.error("Không tìm thấy workspaces/saree hoặc cong-trinh — không có gì để migrate.");
    process.exit(1);
  }

  const sareeData = sareeSnap.exists ? sareeSnap.data() || {} : {};
  const ctEmpty =
    !ctSnap.exists ||
    ["emp", "cust", "proj", "asgn"].every((k) => !((ctSnap.data() || {})[k] || []).length);

  if (sareeSnap.exists && ctEmpty) {
    await ctRef.set({
      ...sareeData,
      emp: (sareeData.emp || []).map((e) =>
        e && e.id
          ? { ...e, orgIds: ["cong-trinh"], accountRole: e.accountRole === "director" ? undefined : e.accountRole || "employee" }
          : e
      ).filter((e) => e && e.accountRole !== "director"),
      updatedAt: new Date(),
    });
    console.log("OK: đã copy saree → cong-trinh (Công trình tỉnh)");
  } else if (ctSnap.exists) {
    const ct = ctSnap.data() || {};
    const emp = (ct.emp || []).map((e) =>
      e && e.id ? { ...e, orgIds: ["cong-trinh"] } : e
    );
    await ctRef.set({ ...ct, emp, patch: (ct.patch || 0) + 1, updatedAt: new Date() });
    console.log("OK: cong-trinh đã có dữ liệu — đã gắn orgIds = cong-trinh cho emp");
  }

  if (!nmSnap.exists) {
    await nmRef.set({
      emp: [],
      cust: [],
      proj: [],
      asgn: [],
      projLog: [],
      reminders: [],
      auditLog: [],
      trash: [],
      cfg: (sareeData.cfg && typeof sareeData.cfg === "object" ? { ...sareeData.cfg } : {}) || {},
      patch: 0,
      updatedAt: new Date(),
    });
    console.log("OK: đã tạo nha-may (Công trình HCM) trống");
  } else {
    console.log("OK: nha-may đã tồn tại — giữ nguyên");
  }

  const currentCt = (await ctRef.get()).data() || {};
  const employees = (currentCt.emp || []).filter((e) => e && e.id);
  for (const emp of employees) {
    await db.doc(`company/main/employees/${emp.id}`).set(
      { ...emp, orgIds: ["cong-trinh"], updatedAt: new Date() },
      { merge: true }
    );
  }
  console.log("OK: đã ghi", employees.length, "nhân viên → company/main/employees (orgIds: cong-trinh)");

  const custSources = [
    ...(currentCt.cust || []),
    ...(sareeData.cust || []),
    ...((nmSnap.exists && (nmSnap.data().cust || [])) || []),
  ];
  const customersMigrated = await upsertSharedCustomers(custSources);
  console.log("OK: đã ghi", customersMigrated, "khách hàng → company/main/customers (dùng chung)");

  for (const orgId of ["cong-trinh", "nha-may", "saree"]) {
    const ref = db.doc(`workspaces/${orgId}/data/main`);
    const snap = await ref.get();
    if (!snap.exists) continue;
    const data = snap.data() || {};
    if (!(data.cust || []).length) continue;
    await ref.set(
      { cust: [], patch: (data.patch || 0) + 1, updatedAt: new Date() },
      { merge: true }
    );
  }
  console.log("OK: đã xoá cust[] khỏi workspace (nguồn sự thật là shared)");

  const usersSnap = await db.collection("users").get();
  let n = 0;
  for (const doc of usersSnap.docs) {
    const user = doc.data() || {};
    const role = user.role;
    let orgIds;
    if (role === "director") {
      orgIds = ALL_ORGS.slice();
    } else if (user.empId) {
      orgIds = ["cong-trinh"];
    } else {
      orgIds = ["cong-trinh"];
    }
    const orgId = normalizeOrgId(user.orgId || "cong-trinh");
    await doc.ref.set(
      {
        orgId: orgId === "saree" ? "cong-trinh" : orgId,
        activeOrgId: "cong-trinh",
        orgIds,
        updatedAt: new Date(),
      },
      { merge: true }
    );
    n += 1;
  }
  console.log("OK: đã cập nhật", n, "users → activeOrgId/orgId cong-trinh");

  console.log("\nXong. Dữ liệu thuộc Công trình tỉnh; KH dùng chung; nha-may trống (proj/asgn).");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
