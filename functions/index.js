const { onDocumentWritten } = require("firebase-functions/v2/firestore");
const { onSchedule } = require("firebase-functions/v2/scheduler");
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
  if (emp.id) {
    const snap = await db
      .collection("users")
      .where("empId", "==", emp.id)
      .limit(1)
      .get();
    if (!snap.empty) {
      const t = snap.docs[0].data().fcmToken;
      if (t) return t;
    }
  }
  return null;
}

async function clearUserFcmToken(token) {
  if (!token) return;
  const snap = await db
    .collection("users")
    .where("fcmToken", "==", token)
    .limit(3)
    .get();
  for (const d of snap.docs) {
    await d.ref.set({ fcmToken: null }, { merge: true });
  }
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

async function directorFcmTokens(orgId) {
  const snap = await db
    .collection("users")
    .where("orgId", "==", orgId)
    .where("role", "==", "director")
    .get();
  const tokens = [];
  snap.docs.forEach((d) => {
    const t = d.data().fcmToken;
    if (t) tokens.push({ token: t, uid: d.id });
  });
  return tokens;
}

function buildReminderMessage(reminder) {
  const text = String(reminder.text || "Đã đến giờ nhắc").slice(0, 500);
  const rid = String(reminder.id || "");
  return {
    data: {
      type: "reminder",
      title: "🔔 Nhắc hẹn",
      body: text,
      reminderId: rid,
    },
    webpush: {
      headers: { Urgency: "high", TTL: "86400" },
      fcmOptions: { link: "/?tab=lich" },
    },
  };
}

function buildArrivalReminderMessage(reminder) {
  const text = String(reminder.text || "Xác nhận đã đến vị trí mới").slice(0, 500);
  const rid = String(reminder.id || "");
  const asgnId = String(reminder.asgnId || "");
  return {
    data: {
      type: "arrival",
      title: "📍 Xác nhận đến vị trí",
      body: text,
      reminderId: rid,
      asgnId,
    },
    webpush: {
      headers: { Urgency: "high", TTL: "86400" },
      fcmOptions: { link: "/?tab=mywork" },
    },
  };
}

function buildMessage(emp, asgn, proj) {
  const title = "📋 Bạn được giao việc mới";
  const work =
    asgn.workContent ||
    (proj && proj.name) ||
    "Công việc mới";
  const where = proj ? proj.name : "";
  const body = where ? `${work} · ${where}` : work;
  return {
    data: {
      type: "assignment",
      title,
      body,
      asgnId: asgn.id || "",
      empId: asgn.empId || "",
      projId: asgn.projId || "",
    },
    webpush: {
      headers: { Urgency: "high", TTL: "86400" },
      fcmOptions: { link: "/" },
    },
  };
}

function parseRemindAt(at) {
  if (!at) return NaN;
  const s = String(at);
  if (/Z$|[+-]\d{2}:?\d{2}$/.test(s)) return new Date(s).getTime();
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (!m) return new Date(s).getTime();
  return Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4] - 7, +m[5], 0);
}

exports.dispatchReminders = onSchedule(
  {
    schedule: "every 1 minutes",
    timeZone: "Asia/Ho_Chi_Minh",
  },
  async () => {
    const snap = await db.collectionGroup("data").get();
    if (snap.empty) return null;

    const messaging = getMessaging();
    const tokenCache = new Map();
    let workspacesUpdated = 0;
    let pushesSent = 0;

    for (const wsDoc of snap.docs) {
      if (wsDoc.id !== "main") continue;
      const orgRef = wsDoc.ref.parent && wsDoc.ref.parent.parent;
      if (!orgRef) continue;
      const orgId = orgRef.id;
      const data = wsDoc.data() || {};
      const reminders = Array.isArray(data.reminders) ? data.reminders : [];
      if (!reminders.length) continue;

      const now = Date.now();
      const due = [];
      let changed = false;
      const nextReminders = reminders.map((r) => {
        if (!r || r.fired || r.done) return r;
        const t = parseRemindAt(r.at);
        if (!t || Number.isNaN(t) || now < t) return r;
        due.push(r);
        changed = true;
        return {
          ...r,
          fired: true,
          firedAt: new Date().toISOString(),
          seen: false,
          pushSent: true,
        };
      });
      if (!due.length) continue;

      const empList = data.emp || [];
      const empById = new Map(empList.map((e) => [e.id, e]));
      const arrivalDue = due.filter((r) => r && r.kind === "arrival" && r.empId);
      const generalDue = due.filter((r) => !r || r.kind !== "arrival" || !r.empId);

      for (const reminder of arrivalDue) {
        const emp = empById.get(reminder.empId);
        const token = await empFcmToken(emp);
        if (!token) continue;
        try {
          await messaging.send({
            ...buildArrivalReminderMessage(reminder),
            token,
          });
          pushesSent += 1;
        } catch (err) {
          const code = err && err.code;
          if (
            code === "messaging/registration-token-not-registered" ||
            code === "messaging/invalid-registration-token"
          ) {
            await clearUserFcmToken(token);
          }
          console.warn("arrival push:", orgId, reminder.empId, String(err));
        }
      }

      if (generalDue.length) {
        let tokenEntries = tokenCache.get(orgId);
        if (!tokenEntries) {
          tokenEntries = await directorFcmTokens(orgId);
          tokenCache.set(orgId, tokenEntries);
        }

        for (const entry of tokenEntries) {
          for (const reminder of generalDue) {
            try {
              await messaging.send({
                ...buildReminderMessage(reminder),
                token: entry.token,
              });
              pushesSent += 1;
            } catch (err) {
              const code = err && err.code;
              if (
                code === "messaging/registration-token-not-registered" ||
                code === "messaging/invalid-registration-token"
              ) {
                await db
                  .doc(`users/${entry.uid}`)
                  .set({ fcmToken: null }, { merge: true });
              }
              console.warn("reminder push:", orgId, entry.uid, String(err));
            }
          }
        }
      }

      if (changed) {
        await wsDoc.ref.set(
          {
            reminders: nextReminders,
            patch: (data.patch || 0) + 1,
            updatedAt: new Date(),
          },
          { merge: true }
        );
        workspacesUpdated += 1;
      }
    }

    return { workspacesUpdated, pushesSent };
  }
);

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
        const code = err && err.code;
        if (
          code === "messaging/registration-token-not-registered" ||
          code === "messaging/invalid-registration-token"
        ) {
          await clearUserFcmToken(token);
        }
        console.warn("assignment push:", asgn.empId, String(err));
        results.push({ token, ok: false, err: String(err) });
      }
    }
    return results;
  }
);

async function syncFcmToWorkspace(orgId, empId, uid, token) {
  if (!empId || !token) return false;
  const wsRef = db.doc(`workspaces/${orgId}/data/main`);
  const wsSnap = await wsRef.get();
  if (!docExists(wsSnap)) return false;
  const ws = wsSnap.data();
  const empList = [...(ws.emp || [])];
  const idx = empList.findIndex((e) => e.id === empId);
  if (idx < 0) return false;
  const prev = empList[idx];
  if (prev.fcmToken === token && prev.authUid === uid) return false;
  empList[idx] = { ...prev, fcmToken: token, authUid: uid };
  await wsRef.set({
    ...ws,
    emp: empList,
    patch: (ws.patch || 0) + 1,
    updatedAt: new Date(),
  });
  return true;
}

exports.syncFcmToken = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Cần đăng nhập.");
  }
  const data = request.data || {};
  const token = String(data.token || "").trim();
  if (!token) {
    throw new HttpsError("invalid-argument", "Thiếu token thông báo.");
  }
  const uid = request.auth.uid;
  const userRef = db.doc(`users/${uid}`);
  const userSnap = await userRef.get();
  if (!docExists(userSnap)) {
    throw new HttpsError("permission-denied", "Tài khoản không hợp lệ.");
  }
  const user = userSnap.data();
  const orgId =
    String(user.orgId || "saree")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "") || "saree";
  const empId = user.empId || "";
  await userRef.set({ fcmToken: token, empId }, { merge: true });
  let synced = false;
  if (empId) {
    synced = await syncFcmToWorkspace(orgId, empId, uid, token);
  }
  return { ok: true, synced };
});

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
    if (raw.accountRole === "director") {
      changed = true;
      continue;
    }
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

function vnMinsOfDay(d) {
  const m = d.toLocaleTimeString("en-GB", {
    timeZone: "Asia/Ho_Chi_Minh",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const p = m.split(":");
  return parseInt(p[0], 10) * 60 + parseInt(p[1], 10);
}

const ATT_IN_DEADLINE = 8 * 60 + 10;
const ATT_OUT_EARLIEST = 17 * 60 - 10;
const ATT_TOLERANCE_MIN = 10;

function attEvalDeviationServer(type, mins) {
  if (type === "in") {
    return mins > ATT_IN_DEADLINE ? mins - ATT_IN_DEADLINE : 0;
  }
  return mins < ATT_OUT_EARLIEST ? ATT_OUT_EARLIEST - mins : 0;
}

function attEvaluatePunchServer(type, when) {
  const mins = vnMinsOfDay(when || new Date());
  const deviation = attEvalDeviationServer(type, mins);
  if (deviation <= 0) {
    return {
      deviationMinutes: 0,
      flag: "ok",
      label: "Đúng giờ",
      needsReason: false,
      kpiWeight: 1,
    };
  }
  if (deviation > 180) {
    return {
      deviationMinutes: deviation,
      flag: "full_day",
      label: "Không đi làm cả ngày",
      needsReason: true,
      kpiWeight: 0,
    };
  }
  if (deviation > 60) {
    return {
      deviationMinutes: deviation,
      flag: "half_day",
      label: "Không làm 1/2 ngày",
      needsReason: true,
      kpiWeight: 0.5,
    };
  }
  const flag = type === "in" ? "late" : "early";
  const label =
    type === "in"
      ? `Đi trễ ${deviation} phút`
      : `Về sớm ${deviation} phút`;
  return {
    deviationMinutes: deviation,
    flag,
    label,
    needsReason: true,
    kpiWeight: 1,
  };
}

exports.submitAttendance = onCall(async (request) => {
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
    throw new HttpsError("permission-denied", "Chỉ nhân viên mới được chấm công.");
  }

  const data = request.data || {};
  const orgId =
    String(data.orgId || user.orgId || "saree")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "") || "saree";
  const type = data.type === "out" ? "out" : "in";
  const date = String(data.date || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new HttpsError("invalid-argument", "Ngày không hợp lệ.");
  }

  const punchId = String(data.punchId || Date.now()).replace(/[^0-9]/g, "") || String(Date.now());
  const recordId = `${user.empId}_${punchId}`;

  const latRaw = data.lat;
  const lngRaw = data.lng;
  const lat =
    latRaw != null && Number.isFinite(Number(latRaw)) ? Number(latRaw) : null;
  const lng =
    lngRaw != null && Number.isFinite(Number(lngRaw)) ? Number(lngRaw) : null;

  const sitePhoto = String(data.sitePhoto || "").trim();
  let workPhotos = [];

  const todaySnap = await db
    .collection(`workspaces/${orgId}/attendance`)
    .where("empId", "==", user.empId)
    .where("date", "==", date)
    .get();
  const todayRecs = todaySnap.docs.map(doc => doc.data());
  todayRecs.sort((a, b) => {
    const tA = a.at && a.at.toDate ? a.at.toDate().getTime() : (a.at && a.at.seconds ? a.at.seconds * 1000 : 0);
    const tB = b.at && b.at.toDate ? b.at.toDate().getTime() : (b.at && b.at.seconds ? b.at.seconds * 1000 : 0);
    return tA - tB;
  });
  const lastRec = todayRecs.length ? todayRecs[todayRecs.length - 1] : null;

  if (type === "out") {
    if (!lastRec || lastRec.type !== "in") {
      throw new HttpsError(
        "failed-precondition",
        "Phải chấm vào trước khi chấm ra."
      );
    }
  } else {
    if (lastRec && lastRec.type === "in") {
      throw new HttpsError(
        "failed-precondition",
        "Bạn đã chấm vào rồi, cần chấm ra trước."
      );
    }
  }

  if (type === "in") {
    if (!sitePhoto) {
      throw new HttpsError("invalid-argument", "Chấm vào cần 1 ảnh nhà máy / công trường.");
    }
  } else {
    workPhotos = Array.isArray(data.workPhotos)
      ? data.workPhotos
          .filter((u) => typeof u === "string" && u.length < 2000)
          .slice(0, 12)
      : [];
    if (workPhotos.length < 3) {
      throw new HttpsError(
        "invalid-argument",
        "Chấm ra cần ít nhất 3 ảnh công việc đã hoàn thành."
      );
    }
  }

  const wsRef = db.doc(`workspaces/${orgId}/data/main`);
  const wsSnap = await wsRef.get();
  if (!docExists(wsSnap)) {
    throw new HttpsError("not-found", "Chưa có dữ liệu dự án.");
  }
  const ws = wsSnap.data();
  const emp = (ws.emp || []).find((e) => e.id === user.empId);
  const fromName = emp ? emp.name : user.username || "";
  const punchedAt = new Date();

  const evalResult = attEvaluatePunchServer(type, punchedAt);
  const lateReason = String(data.lateReason || "").trim().slice(0, 500);
  if (evalResult.needsReason && !lateReason) {
    throw new HttpsError(
      "invalid-argument",
      evalResult.label + " — cần ghi rõ lý do giải trình cho KPI."
    );
  }

  await db.doc(`workspaces/${orgId}/attendance/${recordId}`).set({
    empId: user.empId,
    empName: fromName,
    date,
    type,
    at: punchedAt,
    lat,
    lng,
    locationLabel: String(data.locationLabel || "").slice(0, 200),
    sitePhoto: type === "in" ? sitePhoto : "",
    workPhotos: type === "out" ? workPhotos : [],
    uid,
    punchId,
    immutable: true,
    outsideWindow: !!evalResult.needsReason,
    deviationMinutes: evalResult.deviationMinutes,
    attendanceFlag: evalResult.flag,
    attendanceLabel: evalResult.label,
    kpiWeight: evalResult.kpiWeight,
    lateReason: evalResult.needsReason ? lateReason : "",
    scheduledTime: type === "in" ? "08:00" : "17:00",
    toleranceMinutes: ATT_TOLERANCE_MIN,
  });

  const projLogEntry = {
    id: `${recordId}_log`,
    projId: "",
    at: punchedAt.toISOString(),
    type: "attendance",
    empId: user.empId,
    empName: fromName,
    by: fromName,
    text: `${fromName} chấm ${type === "in" ? "vào" : "ra"} lúc ${punchedAt.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Ho_Chi_Minh" })}${evalResult.flag !== "ok" ? " · " + evalResult.label : ""}`,
    meta: {
      attendanceId: recordId,
      punchType: type,
      date,
      punchId,
    },
  };
  const projLog = [...(ws.projLog || []), projLogEntry].slice(-500);
  const patch = (ws.patch || 0) + 1;
  await wsRef.set({ ...ws, projLog, patch, updatedAt: punchedAt });

  return {
    ok: true,
    id: recordId,
    at: punchedAt.toISOString(),
    type,
  };
});

exports.confirmArrival = onCall(async (request) => {
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
    throw new HttpsError("permission-denied", "Chỉ nhân viên mới xác nhận đến vị trí.");
  }

  const data = request.data || {};
  const orgId =
    String(data.orgId || user.orgId || "saree")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "") || "saree";
  const asgnId = String(data.asgnId || "");
  const reminderId = String(data.reminderId || "");
  const lat = Number(data.lat);
  const lng = Number(data.lng);
  const photo = String(data.photo || "").trim();
  const locationLabel = String(data.locationLabel || "").slice(0, 200);

  if (!asgnId) {
    throw new HttpsError("invalid-argument", "Thiếu mã công việc.");
  }
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    throw new HttpsError("invalid-argument", "Cần vị trí GPS.");
  }
  if (!photo) {
    throw new HttpsError("invalid-argument", "Cần ảnh tại vị trí mới.");
  }

  const wsRef = db.doc(`workspaces/${orgId}/data/main`);
  const wsSnap = await wsRef.get();
  if (!docExists(wsSnap)) {
    throw new HttpsError("not-found", "Chưa có dữ liệu dự án.");
  }
  const ws = wsSnap.data();
  const asgn = (ws.asgn || []).find(
    (a) => a.id === asgnId && a.empId === user.empId
  );
  if (!asgn) {
    throw new HttpsError("permission-denied", "Bạn không được xác nhận công việc này.");
  }
  if (asgn.status !== "active" && asgn.status !== "paused") {
    throw new HttpsError("failed-precondition", "Công việc không còn đang thực hiện.");
  }

  const emp = (ws.emp || []).find((e) => e.id === user.empId);
  const fromName = emp ? emp.name : user.username || "";
  const proj = (ws.proj || []).find((p) => p.id === asgn.projId);
  const locName =
    locationLabel ||
    (proj && proj.name) ||
    asgn.workContent ||
    "vị trí mới";
  const now = new Date();
  const recordId = `${asgnId}_${now.getTime()}`;

  await db.doc(`workspaces/${orgId}/arrivals/${recordId}`).set({
    empId: user.empId,
    empName: fromName,
    asgnId,
    projId: asgn.projId || "",
    reminderId,
    at: now,
    lat,
    lng,
    locationLabel: locName,
    photo,
    uid,
  });

  let empList = [...(ws.emp || [])];
  const empIdx = empList.findIndex((e) => e.id === user.empId);
  if (empIdx >= 0) {
    empList[empIdx] = {
      ...empList[empIdx],
      lastLoc: {
        label: locName,
        lat,
        lng,
        date: (() => {
          const vnStr = now.toLocaleDateString("en-GB", { timeZone: "Asia/Ho_Chi_Minh" });
          const parts = vnStr.split("/");
          return `${parts[2]}-${parts[1].padStart(2, "0")}-${parts[0].padStart(2, "0")}`;
        })(),
      },
    };
  }

  let reminders = [...(ws.reminders || [])];
  let reminderDone = false;
  if (reminderId) {
    reminders = reminders.map((r) => {
      if (r && r.id === reminderId) {
        reminderDone = true;
        return { ...r, done: true, doneAt: now.toISOString(), seen: true };
      }
      return r;
    });
  } else {
    reminders = reminders.map((r) => {
      if (
        r &&
        r.kind === "arrival" &&
        r.asgnId === asgnId &&
        r.empId === user.empId &&
        !r.done
      ) {
        reminderDone = true;
        return { ...r, done: true, doneAt: now.toISOString(), seen: true };
      }
      return r;
    });
  }

  const projLogEntry = {
    id: `${recordId}_log`,
    projId: asgn.projId || "",
    at: now.toISOString(),
    type: "arrival",
    empId: user.empId,
    empName: fromName,
    by: fromName,
    text: `${fromName} xác nhận đã đến ${locName}`,
    meta: {
      asgnId,
      arrivalId: recordId,
      lat,
      lng,
      locationLabel: locName,
      photo,
    },
  };
  const projLog = [...(ws.projLog || []), projLogEntry].slice(-500);
  const patch = (ws.patch || 0) + 1;

  await wsRef.set({
    ...ws,
    emp: empList,
    reminders,
    projLog,
    patch,
    updatedAt: now,
  });

  return { ok: true, id: recordId, reminderDone };
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
  let empList = [...(ws.emp || [])];
  let changed = false;
  let empId = user.empId || "";

  if (user.role === "director") {
    const lk = sanitizeUsername(username || user.username);
    const contact = {
      uid,
      name: displayName || user.displayName || user.username || "Giám đốc",
      username: lk,
    };
    const prev = (ws.cfg && ws.cfg.directorContact) || {};
    const nextCfg = { ...(ws.cfg || {}), directorContact: contact };
    const stripped = empList.filter((e) => e.accountRole !== "director");
    if (
      stripped.length !== empList.length ||
      prev.uid !== contact.uid ||
      prev.name !== contact.name ||
      prev.username !== contact.username
    ) {
      changed = true;
    }
    empList = stripped;
    if (changed) {
      await wsRef.set({
        ...ws,
        emp: empList,
        cfg: nextCfg,
        patch: (ws.patch || 0) + 1,
        updatedAt: new Date(),
      });
    }
    return { changed, empId: "" };
  }

  const idx = findDirectorEmpIndex(empList, uid, username || user.username, user.empId);
  if (idx >= 0) {
    empList.splice(idx, 1);
    changed = true;
  }

  if (user.empId) {
    const ei = empList.findIndex((e) => e.id === user.empId);
    if (ei >= 0 && displayName && displayName !== empList[ei].name) {
      empList[ei] = { ...empList[ei], name: displayName };
      changed = true;
      empId = user.empId;
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
