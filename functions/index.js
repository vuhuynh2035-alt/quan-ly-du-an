const { onDocumentWritten } = require("firebase-functions/v2/firestore");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const { getAuth } = require("firebase-admin/auth");
const { getMessaging } = require("firebase-admin/messaging");

initializeApp();

const db = getFirestore();
const adminAuth = getAuth();

function sanitizeUsername(name) {
  return String(name || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/\s+/g, "")
    .replace(/[^a-z0-9._-]/g, "");
}

function defaultEmployeePassword(username, password) {
  const pw = String(password || "");
  if (pw.length >= 6) return pw;
  const u = String(username || "");
  if (u.length >= 6) return u;
  return "123456";
}

function userEmail(org, username) {
  const u = sanitizeUsername(username);
  if (u.length < 2) {
    throw new HttpsError("invalid-argument", "Tên đăng nhập cần ít nhất 2 ký tự.");
  }
  const o =
    String(org || "saree")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "") || "saree";
  return `${o}.${u}@qlcv.local`;
}

function docExists(snap) {
  return !!(snap && snap.exists);
}

async function assertDirector(uid) {
  const snap = await db.doc(`users/${uid}`).get();
  if (!docExists(snap) || snap.data().role !== "director") {
    throw new HttpsError("permission-denied", "Chỉ giám đốc mới được thực hiện.");
  }
  return snap.data();
}

async function orgHasDirector(orgId) {
  const snap = await db
    .collection("users")
    .where("orgId", "==", orgId)
    .where("role", "==", "director")
    .limit(1)
    .get();
  return !snap.empty;
}

async function empFcmToken(emp) {
  if (!emp) return null;
  if (emp.fcmToken) return emp.fcmToken;
  if (emp.authUid) {
    const u = await db.doc(`users/${emp.authUid}`).get();
    if (docExists(u) && u.data().fcmToken) return u.data().fcmToken;
  }
  return null;
}

function asgnKey(a) {
  return `${a.id}|${a.empId}|${a.status}|${a.prog || 0}`;
}

function findNotifyTargets(before, after) {
  const beforeList = (before && before.asgn) || [];
  const afterList = (after && after.asgn) || [];
  const beforeMap = new Map(beforeList.map((a) => [a.id, a]));
  const targets = [];

  afterList.forEach((a) => {
    if (!a || a.status !== "active") return;
    const prev = beforeMap.get(a.id);
    const isNew = !prev;
    const reactivated =
      prev && prev.status !== "active" && a.status === "active";
    const handoff =
      prev &&
      prev.empId !== a.empId &&
      a.status === "active" &&
      (a.handoffFrom || prev.handoffTo);
    if (isNew || reactivated || handoff) {
      targets.push(a);
    }
  });

  return targets;
}

function buildMessage(emp, asgn, proj) {
  const title = "Bạn được giao việc mới";
  const work =
    asgn.workContent ||
    (proj && proj.name) ||
    "Công việc mới";
  const where = proj ? proj.name : "";
  const body = where ? `${work} · ${where}` : work;
  return {
    notification: { title, body },
    data: {
      type: "assignment",
      asgnId: asgn.id || "",
      empId: asgn.empId || "",
      projId: asgn.projId || "",
    },
    webpush: {
      fcmOptions: { link: "/" },
      notification: { icon: "/icon-192.png", badge: "/icon-192.png" },
    },
  };
}

exports.notifyAssignment = onDocumentWritten(
  "workspaces/{orgId}/data/{docId}",
  async (event) => {
    const before = event.data.before.exists ? event.data.before.data() : null;
    const after = event.data.after.exists ? event.data.after.data() : null;
    if (!after) return null;

    const targets = findNotifyTargets(before, after);
    if (!targets.length) return null;

    const empList = after.emp || [];
    const projList = after.proj || [];
    const empById = new Map(empList.map((e) => [e.id, e]));
    const projById = new Map(projList.map((p) => [p.id, p]));
    const messaging = getMessaging();

    const tokenEntries = [];
    for (const asgn of targets) {
      const emp = empById.get(asgn.empId);
      const token = await empFcmToken(emp);
      if (token) tokenEntries.push({ token, asgn, emp });
    }

    if (!tokenEntries.length) return null;

    const results = [];
    for (const entry of tokenEntries) {
      const { token, asgn, emp } = entry;
      const proj = projById.get(asgn.projId);
      try {
        await messaging.send({ ...buildMessage(emp, asgn, proj), token });
        results.push({ token, ok: true });
      } catch (err) {
        results.push({ token, ok: false, err: String(err) });
      }
    }
    return results;
  }
);

exports.hasDirectorInOrg = onCall(async (request) => {
  const data = request.data || {};
  const orgId =
    String(data.orgId || "saree")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "") || "saree";
  return { hasDirector: await orgHasDirector(orgId) };
});

exports.claimDirectorRole = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Cần đăng nhập.");
  }
  const data = request.data || {};
  const username = sanitizeUsername(data.username);
  const orgId =
    String(data.orgId || "saree")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "") || "saree";

  if (!username || username.length < 2) {
    throw new HttpsError("invalid-argument", "Tên đăng nhập không hợp lệ.");
  }
  if (await orgHasDirector(orgId)) {
    throw new HttpsError(
      "failed-precondition",
      "Đội này đã có giám đốc — không thể thiết lập lần đầu."
    );
  }

  const userRef = db.doc(`users/${request.auth.uid}`);
  const snap = await userRef.get();
  if (docExists(snap) && snap.data().role === "director") {
    return { ok: true };
  }
  if (docExists(snap) && snap.data().role && snap.data().role !== "director") {
    throw new HttpsError("permission-denied", "Tài khoản này không phải giám đốc.");
  }

  await userRef.set(
    {
      username,
      orgId,
      role: "director",
      empId: "",
      createdAt: new Date(),
    },
    { merge: true }
  );
  return { ok: true };
});

async function doProvisionEmployee({
  username,
  rawPassword,
  empId,
  empName,
  role,
  orgId,
}) {
  const email = userEmail(orgId, username);
  let uid;
  let created = false;
  let updated = false;

  try {
    const existing = await adminAuth.getUserByEmail(email);
    uid = existing.uid;
    if (rawPassword && rawPassword.length >= 6) {
      await adminAuth.updateUser(uid, {
        password: rawPassword,
        displayName: empName,
      });
      updated = true;
    } else if (empName) {
      await adminAuth.updateUser(uid, { displayName: empName });
      updated = true;
    }
  } catch (err) {
    if (err.code !== "auth/user-not-found") throw err;
    const password = defaultEmployeePassword(username, rawPassword);
    const user = await adminAuth.createUser({
      email,
      password,
      displayName: empName,
      emailVerified: true,
    });
    uid = user.uid;
    created = true;
  }

  await db.doc(`users/${uid}`).set(
    {
      username,
      orgId,
      role,
      empId: role === "director" ? "" : empId,
      updatedAt: new Date(),
      ...(created ? { createdAt: new Date() } : {}),
    },
    { merge: true }
  );

  return { uid, created, updated, role };
}

function empLoginKey(emp) {
  if (emp.loginKey) return sanitizeUsername(emp.loginKey);
  return sanitizeUsername(emp.name);
}

exports.provisionEmployee = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Cần đăng nhập.");
  }
  await assertDirector(request.auth.uid);

  const data = request.data || {};
  const username = sanitizeUsername(data.username);
  const rawPassword = String(data.password || "");
  const empId = String(data.empId || "");
  const empName = String(data.empName || username);
  const role = data.role === "director" ? "director" : "employee";
  const orgId =
    String(data.orgId || "saree")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "") || "saree";

  if (!username || username.length < 2) {
    throw new HttpsError("invalid-argument", "Tên đăng nhập không hợp lệ.");
  }
  if (!empId) {
    throw new HttpsError("invalid-argument", "Thiếu mã nhân viên.");
  }

  return doProvisionEmployee({
    username,
    rawPassword,
    empId,
    empName,
    role,
    orgId,
  });
});

exports.provisionAllEmployees = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Cần đăng nhập.");
  }
  const director = await assertDirector(request.auth.uid);

  const data = request.data || {};
  const orgId =
    String(data.orgId || director.orgId || "saree")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "") || "saree";

  const wsRef = db.doc(`workspaces/${orgId}/data/main`);
  const wsSnap = await wsRef.get();
  if (!docExists(wsSnap)) {
    return { created: 0, updated: 0, linked: 0, results: [], patch: 0 };
  }

  const ws = wsSnap.data();
  const empList = ws.emp || [];
  let created = 0;
  let updated = 0;
  let linked = 0;
  const results = [];
  let changed = false;
  const newEmpList = [];

  for (const raw of empList) {
    const username = empLoginKey(raw);
    const emp = raw.loginKey ? raw : { ...raw, loginKey: username };
    if (!raw.loginKey && username) {
      changed = true;
    }
    if (emp.authUid) {
      newEmpList.push(emp);
      continue;
    }
    if (!username || username.length < 2) {
      newEmpList.push(emp);
      continue;
    }
    const role = emp.accountRole === "director" ? "director" : "employee";
    const result = await doProvisionEmployee({
      username,
      rawPassword: "",
      empId: emp.id,
      empName: emp.name || username,
      role,
      orgId,
    });
    if (result.created) created += 1;
    if (result.updated) updated += 1;
    linked += 1;
    results.push({
      empId: emp.id,
      uid: result.uid,
      loginKey: username,
      created: result.created,
      updated: result.updated,
    });
    newEmpList.push({ ...emp, authUid: result.uid, loginKey: username });
    changed = true;
  }

  let patch = ws.patch || 0;
  if (changed) {
    patch = patch + 1;
    await wsRef.set({
      ...ws,
      emp: newEmpList,
      patch,
      updatedAt: new Date(),
    });
  }

  return { created, updated, linked, results, patch };
});

exports.submitDailyReport = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Cần đăng nhập.");
  }

  const uid = request.auth.uid;
  const userSnap = await db.doc(`users/${uid}`).get();
  if (!docExists(userSnap)) {
    throw new HttpsError("permission-denied", "Tài khoản không hợp lệ.");
  }
  const user = userSnap.data();
  if (user.role !== "employee" || !user.empId) {
    throw new HttpsError(
      "permission-denied",
      "Chỉ nhân viên mới được báo cáo tiến độ."
    );
  }

  const data = request.data || {};
  const orgId =
    String(data.orgId || user.orgId || "saree")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "") || "saree";
  const asgnId = String(data.asgnId || "");
  const date = String(data.date || "").slice(0, 10);
  const prog = Math.min(100, Math.max(0, Math.round(Number(data.prog) || 0)));
  const note = String(data.note || "").trim().slice(0, 5000);
  const photos = Array.isArray(data.photos)
    ? data.photos.filter((u) => typeof u === "string" && u.length < 2000).slice(0, 8)
    : [];

  if (!asgnId || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new HttpsError("invalid-argument", "Thiếu công việc hoặc ngày không hợp lệ.");
  }
  if (!note) {
    throw new HttpsError(
      "invalid-argument",
      "Cần ghi chú — mô tả đã làm gì và khó khăn gặp phải."
    );
  }

  const wsRef = db.doc(`workspaces/${orgId}/data/main`);
  const wsSnap = await wsRef.get();
  if (!docExists(wsSnap)) {
    throw new HttpsError("not-found", "Chưa có dữ liệu dự án.");
  }
  const ws = wsSnap.data();
  const asgnList = ws.asgn || [];
  const asgn = asgnList.find((a) => a.id === asgnId && a.empId === user.empId);
  if (!asgn) {
    throw new HttpsError("permission-denied", "Bạn không được báo cáo công việc này.");
  }
  if (asgn.status !== "active" && asgn.status !== "paused") {
    throw new HttpsError("failed-precondition", "Công việc không còn đang thực hiện.");
  }

  const reportId = `${asgnId}_${date}`;
  const emp = (ws.emp || []).find((e) => e.id === user.empId);
  const fromName = emp ? emp.name : user.username || "";

  await db.doc(`workspaces/${orgId}/reports/${reportId}`).set({
    asgnId,
    empId: user.empId,
    projId: asgn.projId || "",
    date,
    prog,
    note,
    photos,
    uid,
    fromName,
    username: user.username || "",
    at: new Date(),
  });

  const projLogEntry = {
    id: `${reportId}_log`,
    projId: asgn.projId || "",
    at: new Date().toISOString(),
    type: "report",
    empId: user.empId,
    empName: fromName,
    by: fromName,
    text: `${fromName} báo cáo tiến độ ${prog}% (${date})`,
    meta: {
      asgnId,
      reportId,
      prog,
      note: note.slice(0, 500),
      date,
    },
  };
  const projLog = [...(ws.projLog || []), projLogEntry].slice(-500);

  const newAsgn = asgnList.map((a) => (a.id === asgnId ? { ...a, prog } : a));
  const patch = (ws.patch || 0) + 1;
  await wsRef.set({ ...ws, asgn: newAsgn, projLog, patch, updatedAt: new Date() });

  return { ok: true, reportId, prog };
});

function findDirectorEmpIndex(empList, uid, username, empId) {
  if (empId) {
    const i = empList.findIndex((e) => e.id === empId);
    if (i >= 0) return i;
  }
  let i = empList.findIndex((e) => e.authUid === uid);
  if (i >= 0) return i;
  const lk = sanitizeUsername(username);
  return empList.findIndex(
    (e) => e.accountRole === "director" && sanitizeUsername(e.loginKey || e.name) === lk
  );
}

async function syncProfileToWorkspace(orgId, uid, user, displayName, username) {
  const wsRef = db.doc(`workspaces/${orgId}/data/main`);
  const wsSnap = await wsRef.get();
  if (!docExists(wsSnap)) return { changed: false, empId: user.empId || "" };
  const ws = wsSnap.data();
  const empList = [...(ws.emp || [])];
  const idx = findDirectorEmpIndex(empList, uid, username || user.username, user.empId);
  let changed = false;
  let empId = user.empId || "";

  if (idx >= 0) {
    const e = empList[idx];
    const next = { ...e };
    if (displayName && displayName !== e.name) {
      next.name = displayName;
      changed = true;
    }
    if (username && sanitizeUsername(username) !== sanitizeUsername(e.loginKey || e.name)) {
      next.loginKey = sanitizeUsername(username);
      changed = true;
    }
    if (!e.authUid) {
      next.authUid = uid;
      changed = true;
    }
    if (user.role === "director" && e.accountRole !== "director") {
      next.accountRole = "director";
      changed = true;
    }
    if (user.role === "director" && e.group === "Phụ việc") {
      next.group = "Quản lý";
      changed = true;
    }
    empList[idx] = next;
    empId = next.id;
  } else if (user.role === "director") {
    const lk = sanitizeUsername(username || user.username);
    const stubId = `dir_${uid.slice(0, 8)}`;
    empList.unshift({
      id: stubId,
      name: displayName || user.username || "Giám đốc",
      group: "Quản lý",
      province: "TP. Hồ Chí Minh",
      skill: 5,
      status: "available",
      note: "",
      lastLoc: null,
      loginKey: lk,
      authUid: uid,
      accountRole: "director",
    });
    changed = true;
    empId = stubId;
  } else if (user.empId) {
    const ei = empList.findIndex((e) => e.id === user.empId);
    if (ei >= 0 && displayName && displayName !== empList[ei].name) {
      empList[ei] = { ...empList[ei], name: displayName };
      changed = true;
    }
  }

  if (changed) {
    await wsRef.set({
      ...ws,
      emp: empList,
      patch: (ws.patch || 0) + 1,
      updatedAt: new Date(),
    });
  }
  return { changed, empId };
}

exports.updateMyProfile = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Cần đăng nhập.");
  }

  const data = request.data || {};
  const displayName = String(data.displayName || "").trim().slice(0, 100);
  const ageRaw = data.age;
  let age = null;
  if (ageRaw !== null && ageRaw !== undefined && ageRaw !== "") {
    age = Math.round(Number(ageRaw));
    if (!Number.isFinite(age) || age < 1 || age > 150) {
      throw new HttpsError("invalid-argument", "Tuổi phải từ 1 đến 150.");
    }
  }
  if (!displayName) {
    throw new HttpsError("invalid-argument", "Nhập họ tên.");
  }

  const uid = request.auth.uid;
  const userRef = db.doc(`users/${uid}`);
  const userSnap = await userRef.get();
  if (!docExists(userSnap)) {
    throw new HttpsError("permission-denied", "Tài khoản không hợp lệ.");
  }
  const user = userSnap.data();
  if (user.role !== "employee" && user.role !== "director") {
    throw new HttpsError("permission-denied", "Không được phép cập nhật hồ sơ.");
  }

  const orgId =
    String(user.orgId || "saree")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "") || "saree";

  await userRef.set(
    { displayName, age, updatedAt: new Date() },
    { merge: true }
  );
  await adminAuth.updateUser(uid, { displayName });

  const sync = await syncProfileToWorkspace(orgId, uid, user, displayName, user.username);
  if (sync.empId && sync.empId !== user.empId) {
    await userRef.set({ empId: sync.empId }, { merge: true });
  }

  return {
    ok: true,
    displayName,
    age,
    username: user.username || "",
    empId: sync.empId || user.empId || "",
  };
});

exports.updateMyUsername = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Cần đăng nhập.");
  }

  const data = request.data || {};
  const newUsername = sanitizeUsername(data.username);
  if (!newUsername || newUsername.length < 2) {
    throw new HttpsError("invalid-argument", "Tên đăng nhập cần ít nhất 2 ký tự.");
  }

  const uid = request.auth.uid;
  const userRef = db.doc(`users/${uid}`);
  const userSnap = await userRef.get();
  if (!docExists(userSnap)) {
    throw new HttpsError("permission-denied", "Tài khoản không hợp lệ.");
  }
  const user = userSnap.data();
  if (user.role !== "director") {
    throw new HttpsError("permission-denied", "Chỉ giám đốc mới được đổi tên đăng nhập.");
  }
  if (sanitizeUsername(user.username) === newUsername) {
    return { ok: true, username: newUsername };
  }

  const orgId =
    String(user.orgId || "saree")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "") || "saree";
  const newEmail = userEmail(orgId, newUsername);

  try {
    const existing = await adminAuth.getUserByEmail(newEmail);
    if (existing.uid !== uid) {
      throw new HttpsError("already-exists", "Tên đăng nhập đã có người dùng trong đội này.");
    }
  } catch (err) {
    if (err.code !== "auth/user-not-found") {
      if (err instanceof HttpsError) throw err;
      throw err;
    }
  }

  await adminAuth.updateUser(uid, { email: newEmail });
  await userRef.set({ username: newUsername, updatedAt: new Date() }, { merge: true });
  await syncProfileToWorkspace(orgId, uid, { ...user, username: newUsername }, user.displayName, newUsername);

  return { ok: true, username: newUsername };
});

exports.changeMyPassword = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Cần đăng nhập.");
  }

  const newPassword = String((request.data && request.data.newPassword) || "");
  if (newPassword.length < 6) {
    throw new HttpsError("invalid-argument", "Mật khẩu mới cần ít nhất 6 ký tự.");
  }

  const uid = request.auth.uid;
  const userSnap = await db.doc(`users/${uid}`).get();
  if (!docExists(userSnap)) {
    throw new HttpsError("permission-denied", "Tài khoản không hợp lệ.");
  }

  const role = userSnap.data().role;
  if (role !== "employee" && role !== "director") {
    throw new HttpsError("permission-denied", "Không được phép đổi mật khẩu.");
  }

  await adminAuth.updateUser(uid, { password: newPassword });
  return { ok: true };
});
