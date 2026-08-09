const { onDocumentWritten, onDocumentCreated } = require("firebase-functions/v2/firestore");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { onCall, onRequest, HttpsError } = require("firebase-functions/v2/https");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const { getAuth } = require("firebase-admin/auth");
const { getMessaging } = require("firebase-admin/messaging");
const { getStorage } = require("firebase-admin/storage");

initializeApp();

const db = getFirestore();
const adminAuth = getAuth();
const adminStorage = getStorage();

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

const ORG_ALIAS = { saree: "cong-trinh" };
const ALL_ORGS = ["cong-trinh", "nha-may"];

function normalizeOrgId(id) {
  const raw = String(id || "").trim().toLowerCase().replace(/[^a-z0-9-]/g, "");
  const normalized = ORG_ALIAS[raw] || raw;
  return ALL_ORGS.includes(normalized) ? normalized : "cong-trinh";
}

function orgLabel(id) {
  return normalizeOrgId(id) === "nha-may" ? "Công trình HCM" : "Công trình tỉnh";
}

function normalizeOrgIds(list, fallback = ["cong-trinh"]) {
  const input = Array.isArray(list) ? list : list ? [list] : fallback;
  return [...new Set(input.map(normalizeOrgId).filter((id) => ALL_ORGS.includes(id)))];
}

function userOrgIds(user) {
  return normalizeOrgIds(user && user.orgIds, [
    normalizeOrgId(user && user.orgId),
  ]);
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
  return `${u}@qlcv.local`;
}

function legacyUserEmail(org, username) {
  const u = sanitizeUsername(username);
  if (u.length < 2) {
    throw new HttpsError("invalid-argument", "Tên đăng nhập cần ít nhất 2 ký tự.");
  }
  return `${normalizeOrgId(org)}.${u}@qlcv.local`;
}

/** Email Auth cũ trước khi đổi mã đội (vd. saree.phuong@qlcv.local). */
function historicalLegacyEmails(username) {
  const u = sanitizeUsername(username);
  if (u.length < 2) return [];
  return Object.keys(ORG_ALIAS).map((alias) => `${alias}.${u}@qlcv.local`);
}

function authEmailCandidates(username, org) {
  const u = sanitizeUsername(username);
  const emails = [userEmail(org, u)];
  for (const o of ALL_ORGS) {
    emails.push(legacyUserEmail(o, u));
  }
  for (const e of historicalLegacyEmails(u)) {
    emails.push(e);
  }
  return [...new Set(emails)];
}

async function findAuthUserByUsername(username, org) {
  const candidates = authEmailCandidates(username, org);
  let lastErr = null;
  for (const email of candidates) {
    try {
      return await adminAuth.getUserByEmail(email);
    } catch (err) {
      lastErr = err;
      if (err.code !== "auth/user-not-found") throw err;
    }
  }
  if (lastErr) throw lastErr;
  const err = new Error("User not found");
  err.code = "auth/user-not-found";
  throw err;
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

async function assertCanOperate(uid) {
  const snap = await db.doc(`users/${uid}`).get();
  if (!docExists(snap)) {
    throw new HttpsError("permission-denied", "Tài khoản không hợp lệ.");
  }
  const user = snap.data();
  if (user.role === "director") return user;
  if (user.empGroup === "Điều hành") return user;
  if (user.empId) {
    const companyEmp = await db.doc(`company/main/employees/${user.empId}`).get();
    if (docExists(companyEmp) && companyEmp.data().group === "Điều hành") {
      await snap.ref.set({ empGroup: "Điều hành" }, { merge: true });
      return { ...user, empGroup: "Điều hành" };
    }
    for (const orgId of userOrgIds(user)) {
      const wsSnap = await db.doc(`workspaces/${orgId}/data/main`).get();
      if (!docExists(wsSnap)) continue;
      const emp = (wsSnap.data().emp || []).find((e) => e && e.id === user.empId);
      if (emp && emp.group === "Điều hành") {
        await snap.ref.set({ empGroup: "Điều hành" }, { merge: true });
        return { ...user, empGroup: "Điều hành" };
      }
    }
  }
  throw new HttpsError(
    "permission-denied",
    "Chỉ giám đốc hoặc Điều hành mới được thực hiện."
  );
}

async function orgHasDirector(orgId) {
  const snap = await db
    .collection("users")
    .where("role", "==", "director")
    .limit(5)
    .get();
  const normalizedOrg = normalizeOrgId(orgId);
  return snap.docs.some((doc) => {
    const user = doc.data();
    return user.orgId === normalizedOrg || userOrgIds(user).includes(normalizedOrg) ||
      userOrgIds(user).length === ALL_ORGS.length;
  });
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

async function clearUserFcmToken(token, orgId) {
  if (!token) return;
  const snap = await db
    .collection("users")
    .where("fcmToken", "==", token)
    .limit(3)
    .get();
  for (const d of snap.docs) {
    await d.ref.set({ fcmToken: null }, { merge: true });
  }
  if (!orgId) return;
  const wsRef = db.doc(`workspaces/${orgId}/data/main`);
  const wsSnap = await wsRef.get();
  if (!docExists(wsSnap)) return;
  const ws = wsSnap.data();
  const empList = ws.emp || [];
  let changed = false;
  const nextEmpList = empList.map((e) => {
    if (e && e.fcmToken === token) {
      changed = true;
      return { ...e, fcmToken: null };
    }
    return e;
  });
  if (!changed) return;
  await wsRef.set(
    { emp: nextEmpList, patch: (ws.patch || 0) + 1, updatedAt: new Date() },
    { merge: true }
  );
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
      targets.push({ asgn: a, kind: "assignment" });
    }
  });

  return targets;
}

function findScheduleNotifyTargets(before, after) {
  const beforeList = (before && before.asgn) || [];
  const afterList = (after && after.asgn) || [];
  const beforeMap = new Map(beforeList.map((a) => [a.id, a]));
  const targets = [];

  afterList.forEach((a) => {
    if (!a || !a.schedNotify || !a.schedNotify.at) return;
    const prev = beforeMap.get(a.id);
    const prevAt = prev && prev.schedNotify && prev.schedNotify.at;
    if (prevAt === a.schedNotify.at) return;
    // New assignment with delay note is already covered by assignment push
    if (!prev && a.status === "active") return;
    targets.push({ asgn: a, kind: "schedule" });
  });

  return targets;
}

/**
 * Notification audience for a users/{uid} doc.
 * director | operate (Điều hành) | supervise (Giám sát) | employee
 */
function notifyAudience(user) {
  if (!user) return "employee";
  if (user.role === "director") return "director";
  const g = String(user.empGroup || "").trim();
  if (g === "Điều hành") return "operate";
  if (g === "Giám sát" || g === "Quản lý") return "supervise";
  if (g === "Chỉ huy trưởng") return "chief";
  return "employee";
}

/** Company-wide / oversight roles that may receive broadcast + company reminders. */
function isOversightAudience(aud) {
  return aud === "director" || aud === "operate" || aud === "supervise" || aud === "chief";
}

/**
 * Roles that get fan-out copies of staff-targeted events (DM / giao việc),
 * excluding the actor's own outbound (caller skips sender uid).
 * GS: all. DH: all. GD: only all-company (not staff-targeted copies).
 */
function wantsStaffEventCopy(aud) {
  return aud === "operate" || aud === "supervise";
}

async function orgUserTokenEntries(orgId) {
  const snap = await db.collection("users").get();
  const org = normalizeOrgId(orgId);
  const tokens = [];
  snap.docs.forEach((d) => {
    const user = d.data() || {};
    if (!userOrgIds(user).includes(org)) return;
    const t = user.fcmToken;
    if (!t) return;
    tokens.push({
      token: t,
      uid: d.id,
      audience: notifyAudience(user),
      empId: user.empId || "",
    });
  });
  return tokens;
}

async function directorFcmTokens(orgId) {
  const all = await orgUserTokenEntries(orgId);
  return all
    .filter((e) => e.audience === "director")
    .map((e) => ({ token: e.token, uid: e.uid }));
}

/** FCM tokens for company reminders / broadcasts: GD + Điều hành + Giám sát. */
async function oversightFcmTokens(orgId) {
  const all = await orgUserTokenEntries(orgId);
  return all
    .filter((e) => isOversightAudience(e.audience))
    .map((e) => ({
      token: e.token,
      uid: e.uid,
      audience: e.audience,
    }));
}

/** Public hosting origin — absolute icons/links improve closed-app & iOS PWA delivery. */
const WEB_APP_ORIGIN = "https://quan-ly-du-an-7d651.web.app";

/**
 * Web push display options + deep link. Top-level `notification` carries title/body;
 * here we set icon/tag/link so closed-app tray notifications work reliably.
 */
function buildWebPush(linkPath, tag) {
  const link = WEB_APP_ORIGIN + (linkPath || "/");
  return {
    headers: { Urgency: "high", TTL: "86400" },
    notification: {
      icon: WEB_APP_ORIGIN + "/icon-192.png",
      badge: WEB_APP_ORIGIN + "/icon-192.png",
      tag: String(tag || "cv3"),
      renotify: true,
      requireInteraction: true,
    },
    fcmOptions: { link },
  };
}

function buildReminderMessage(reminder) {
  const text = String(reminder.text || "Đã đến giờ nhắc").slice(0, 500);
  const rid = String(reminder.id || "");
  const title = "🔔 Nhắc hẹn";
  const tag = "rem_" + (rid || "reminder");
  return {
    notification: { title, body: text },
    data: {
      type: "reminder",
      title,
      body: text,
      reminderId: rid,
      badgeBump: "1",
    },
    webpush: buildWebPush("/?tab=lich", tag),
  };
}

function buildArrivalReminderMessage(reminder) {
  const text = String(reminder.text || "Xác nhận đã đến vị trí mới").slice(0, 500);
  const rid = String(reminder.id || "");
  const asgnId = String(reminder.asgnId || "");
  const empId = String(reminder.empId || "");
  const title = "📍 Xác nhận đến vị trí";
  const tag = "arr_" + (rid || asgnId || "arrival");
  return {
    notification: { title, body: text },
    data: {
      type: "arrival",
      title,
      body: text,
      reminderId: rid,
      asgnId,
      empId,
      badgeBump: "1",
    },
    webpush: buildWebPush("/?tab=mywork", tag),
  };
}

function buildMessage(emp, asgn, proj) {
  const sched = asgn && asgn.schedNotify;
  const isDelay = sched && sched.type === "delay";
  const title = isDelay
    ? "📅 Lịch việc mới đã điều chỉnh"
    : "📋 Bạn được giao việc mới";
  const work =
    asgn.workContent ||
    (proj && proj.name) ||
    "Công việc mới";
  const where = proj ? proj.name : "";
  let body = where ? `${work} · ${where}` : work;
  if (isDelay && sched.msg) body = String(sched.msg).slice(0, 500);
  else if (asgn.startDate || asgn.endDate) {
    const range = [asgn.startDate, asgn.endDate].filter(Boolean).join(" → ");
    if (range) body = `${body} (${range})`;
  }
  const asgnId = asgn.id || "";
  const tag = "asgn_" + (asgnId || "new");
  return {
    notification: { title, body },
    data: {
      type: "assignment",
      title,
      body,
      asgnId,
      empId: asgn.empId || "",
      projId: asgn.projId || "",
      assignedByUid: String(asgn.assignedByUid || ""),
      badgeBump: "1",
    },
    webpush: buildWebPush("/?tab=mywork", tag),
  };
}

function buildScheduleMessage(emp, asgn, proj) {
  const sched = (asgn && asgn.schedNotify) || {};
  const title = "📅 Lịch công việc đã điều chỉnh";
  const work =
    (asgn && asgn.workContent) ||
    (proj && proj.name) ||
    "Công việc";
  const body = String(sched.msg || `«${work}» đã được điều chỉnh lịch.`).slice(
    0,
    500
  );
  const asgnId = (asgn && asgn.id) || "";
  const tag = "sched_" + (asgnId || "adj");
  return {
    notification: { title, body },
    data: {
      type: "schedule",
      title,
      body,
      asgnId,
      empId: (asgn && asgn.empId) || "",
      projId: (asgn && asgn.projId) || "",
      assignedByUid: String((asgn && asgn.assignedByUid) || ""),
      badgeBump: "1",
    },
    webpush: buildWebPush("/?tab=mywork", tag),
  };
}

function buildChatMessage(msg) {
  const isBc = msg.type === "broadcast";
  const from = String(msg.fromName || msg.from || "Tin nhắn").slice(0, 80);
  const body = String(msg.text || "").slice(0, 180);
  const title = isBc ? "📢 Thông báo đội" : "💬 " + from;
  const msgId = String(msg.id || "");
  const tag = "chat_" + (msgId || "new");
  const fromUid = String(msg.uid || "");
  const chatLink = isBc
    ? "/?tab=chat"
    : "/?tab=chat&dm=" + encodeURIComponent(fromUid);
  return {
    notification: { title, body },
    data: {
      type: "chat",
      title,
      body,
      msgId,
      threadId: String(msg.threadId || (isBc ? "broadcast" : "")),
      fromUid,
      toUid: String(msg.toUid || ""),
      chatType: isBc ? "broadcast" : "dm",
      badgeBump: "1",
    },
    webpush: buildWebPush(chatLink, tag),
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
      // arrival → chỉ FCM cho đúng NV; không gửi Giám đốc (kể cả thiếu empId)
      const arrivalDue = due.filter((r) => r && r.kind === "arrival" && r.empId);
      const generalDue = due.filter((r) => r && r.kind !== "arrival");

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
            await clearUserFcmToken(token, orgId);
          }
          console.warn("arrival push:", orgId, reminder.empId, String(err));
        }
      }

      if (generalDue.length) {
        let tokenEntries = tokenCache.get(orgId);
        if (!tokenEntries) {
          // Company reminders → GD + Điều hành + Giám sát (không gửi NV thường)
          tokenEntries = await oversightFcmTokens(orgId);
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
    const orgId = event.params.orgId;
    const before = event.data.before.exists ? event.data.before.data() : null;
    const after = event.data.after.exists ? event.data.after.data() : null;
    if (!after) return null;

    const targets = findNotifyTargets(before, after).concat(
      findScheduleNotifyTargets(before, after)
    );
    if (!targets.length) return null;

    const empList = after.emp || [];
    const projList = after.proj || [];
    const empById = new Map(empList.map((e) => [e.id, e]));
    const projById = new Map(projList.map((p) => [p.id, p]));
    const messaging = getMessaging();

    const oversight = await orgUserTokenEntries(orgId);
    const results = [];

    for (const target of targets) {
      const asgn = target.asgn || target;
      const kind = target.kind || "assignment";
      const emp = empById.get(asgn.empId);
      const proj = projById.get(asgn.projId);
      const payload =
        kind === "schedule"
          ? buildScheduleMessage(emp, asgn, proj)
          : buildMessage(emp, asgn, proj);
      const assignerUid = String(asgn.assignedByUid || "");
      const sentTokens = new Set();

      // 1) Always notify the assigned employee
      const empToken = await empFcmToken(emp);
      if (empToken) {
        try {
          await messaging.send({ ...payload, token: empToken });
          sentTokens.add(empToken);
          results.push({ token: empToken, ok: true, to: "assignee" });
        } catch (err) {
          const code = err && err.code;
          if (
            code === "messaging/registration-token-not-registered" ||
            code === "messaging/invalid-registration-token"
          ) {
            await clearUserFcmToken(empToken, orgId);
          }
          console.warn("assignment push:", asgn.empId, String(err));
          results.push({ token: empToken, ok: false, err: String(err) });
        }
      }

      // 2) Fan-out copies:
      //    - Giám sát: all company giao việc
      //    - Điều hành: all except own outbound to staff
      //    - Giám đốc: not staff-targeted copies (only all-company style elsewhere)
      for (const entry of oversight) {
        if (!entry.token || sentTokens.has(entry.token)) continue;
        if (!wantsStaffEventCopy(entry.audience)) continue;
        // Điều hành: hide own outbound-to-staff; Giám sát keeps all
        if (
          assignerUid &&
          entry.uid === assignerUid &&
          entry.audience === "operate"
        ) {
          continue;
        }
        try {
          await messaging.send({ ...payload, token: entry.token });
          sentTokens.add(entry.token);
          results.push({
            token: entry.token,
            ok: true,
            to: entry.audience,
            uid: entry.uid,
          });
        } catch (err) {
          const code = err && err.code;
          if (
            code === "messaging/registration-token-not-registered" ||
            code === "messaging/invalid-registration-token"
          ) {
            await clearUserFcmToken(entry.token, orgId);
          }
          console.warn("assignment fanout:", entry.uid, String(err));
          results.push({
            token: entry.token,
            ok: false,
            err: String(err),
            uid: entry.uid,
          });
        }
      }
    }
    return results;
  }
);

exports.notifyChatMessage = onDocumentCreated(
  "workspaces/{orgId}/messages/{msgId}",
  async (event) => {
    const orgId = event.params.orgId;
    const snap = event.data;
    if (!snap || !snap.exists) return null;
    const msg = Object.assign({ id: snap.id }, snap.data());
    const messaging = getMessaging();
    const senderUid = String(msg.uid || "");
    const payload = buildChatMessage(msg);
    const sentTokens = new Set();
    const results = [];

    async function sendTo(token, meta) {
      if (!token || sentTokens.has(token)) return;
      try {
        await messaging.send({ ...payload, token });
        sentTokens.add(token);
        results.push({ token, ok: true, ...(meta || {}) });
      } catch (err) {
        const code = err && err.code;
        if (
          code === "messaging/registration-token-not-registered" ||
          code === "messaging/invalid-registration-token"
        ) {
          await clearUserFcmToken(token, orgId);
        }
        console.warn("chat push:", orgId, msg.id, String(err));
        results.push({ token, ok: false, err: String(err), ...(meta || {}) });
      }
    }

    if (msg.type === "broadcast") {
      // All-company: GD + Điều hành + Giám sát. Skip sender. Never NV thường.
      const entries = await oversightFcmTokens(orgId);
      for (const entry of entries) {
        if (entry.uid === senderUid) continue;
        await sendTo(entry.token, { uid: entry.uid, to: entry.audience });
      }
    } else if (msg.type === "dm" && msg.toUid) {
      const toUid = String(msg.toUid);
      // 1) Direct recipient (employee or anyone)
      let recipientToken = null;
      const toSnap = await db.doc(`users/${toUid}`).get();
      if (docExists(toSnap) && toSnap.data().fcmToken) {
        recipientToken = toSnap.data().fcmToken;
      }
      if (!recipientToken) {
        const wsSnap = await db.doc(`workspaces/${orgId}/data/main`).get();
        if (docExists(wsSnap)) {
          const empList = wsSnap.data().emp || [];
          const emp = empList.find((e) => e && e.authUid === toUid);
          recipientToken = await empFcmToken(emp);
        }
      }
      await sendTo(recipientToken, { uid: toUid, to: "recipient" });

      // 2) Fan-out: Điều hành + Giám sát see company DMs (not own outbound)
      //    Giám đốc: only all-company → no DM copies unless they are recipient
      const entries = await orgUserTokenEntries(orgId);
      for (const entry of entries) {
        if (entry.uid === senderUid) continue;
        if (entry.uid === toUid) continue;
        if (!wantsStaffEventCopy(entry.audience)) continue;
        await sendTo(entry.token, { uid: entry.uid, to: entry.audience });
      }
    }

    return results.length ? results : null;
  }
);

exports.ackAssignment = onCall(async (request) => {
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
    throw new HttpsError("permission-denied", "Chỉ nhân viên mới được xác nhận công việc.");
  }

  const data = request.data || {};
  const asgnId = String(data.asgnId || "");
  const kind = data.kind === "read" ? "read" : "delivered";
  if (!asgnId) {
    throw new HttpsError("invalid-argument", "Thiếu mã công việc.");
  }

  const orgId = normalizeOrgId(user.activeOrgId || user.orgId);
  if (!userOrgIds(user).includes(orgId)) {
    throw new HttpsError("permission-denied", "Bạn không thuộc đơn vị này.");
  }
  const wsRef = db.doc(`workspaces/${orgId}/data/main`);
  const wsSnap = await wsRef.get();
  if (!docExists(wsSnap)) {
    throw new HttpsError("not-found", "Chưa có dữ liệu dự án.");
  }
  const ws = wsSnap.data();
  const asgnList = ws.asgn || [];
  const idx = asgnList.findIndex((a) => a.id === asgnId && a.empId === user.empId);
  if (idx < 0) {
    throw new HttpsError("permission-denied", "Bạn không được xác nhận công việc này.");
  }

  const now = new Date().toISOString();
  const asgn = asgnList[idx];
  let changed = false;
  const nextAsgn = { ...asgn };
  if (kind === "delivered" && !nextAsgn.deliveredAt) {
    nextAsgn.deliveredAt = now;
    changed = true;
  }
  if (kind === "read") {
    if (!nextAsgn.deliveredAt) {
      nextAsgn.deliveredAt = now;
      changed = true;
    }
    if (!nextAsgn.readAt) {
      nextAsgn.readAt = now;
      changed = true;
    }
  }

  if (!changed) {
    return { ok: true, asgn };
  }

  const nextAsgnList = asgnList.slice();
  nextAsgnList[idx] = nextAsgn;
  await wsRef.set(
    { asgn: nextAsgnList, patch: (ws.patch || 0) + 1, updatedAt: new Date() },
    { merge: true }
  );

  return { ok: true, asgn: nextAsgn };
});

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
  const orgId = normalizeOrgId(user.activeOrgId || user.orgId);
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
  const orgId = normalizeOrgId(data.orgId);
  return { hasDirector: await orgHasDirector(orgId) };
});

exports.claimDirectorRole = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Cần đăng nhập.");
  }
  const data = request.data || {};
  const username = sanitizeUsername(data.username);
  const orgId = normalizeOrgId(data.orgId);

  if (!username || username.length < 2) {
    throw new HttpsError("invalid-argument", "Tên đăng nhập không hợp lệ.");
  }
  const existingDirectors = await db
    .collection("users")
    .where("role", "==", "director")
    .limit(1)
    .get();
  if (!existingDirectors.empty) {
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
      activeOrgId: orgId,
      orgIds: ALL_ORGS,
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
  orgIds,
  empGroup,
}) {
  const normalizedOrgIds = normalizeOrgIds(orgIds, [orgId]);
  const activeOrgId = normalizeOrgId(orgId || normalizedOrgIds[0]);
  const email = userEmail(activeOrgId, username);
  let uid;
  let created = false;
  let updated = false;

  try {
    const existing = await findAuthUserByUsername(username, activeOrgId);
    uid = existing.uid;
    const patch = { displayName: empName };
    if (rawPassword && rawPassword.length >= 6) {
      patch.password = rawPassword;
    }
    // Chuẩn hoá email cũ (saree.x / cong-trinh.x) → x@qlcv.local khi còn trống
    if (existing.email && existing.email !== email) {
      try {
        await adminAuth.updateUser(uid, { ...patch, email });
        updated = true;
      } catch (emailErr) {
        if (emailErr.code === "auth/email-already-exists") {
          await adminAuth.updateUser(uid, patch);
          updated = true;
        } else {
          throw emailErr;
        }
      }
    } else {
      await adminAuth.updateUser(uid, patch);
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

  const group =
    role === "director"
      ? ""
      : String(empGroup || "").trim() === "Quản lý"
        ? "Giám sát"
        : String(empGroup || "").trim();

  await db.doc(`users/${uid}`).set(
    {
      username,
      orgId: activeOrgId,
      activeOrgId,
      orgIds: role === "director" ? ALL_ORGS : normalizedOrgIds,
      role,
      empId: role === "director" ? "" : empId,
      empGroup: group,
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
  const orgId = normalizeOrgId(data.orgId);
  const orgIds = normalizeOrgIds(data.orgIds, [orgId]);

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
    orgIds,
    empGroup: data.empGroup || "",
  });
});

exports.provisionAllEmployees = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Cần đăng nhập.");
  }
  const operator = await assertCanOperate(request.auth.uid);

  const data = request.data || {};
  const orgId = normalizeOrgId(data.orgId || operator.activeOrgId || operator.orgId);

  const wsRef = db.doc(`workspaces/${orgId}/data/main`);
  const wsSnap = await wsRef.get();
  const ws = docExists(wsSnap) ? wsSnap.data() : { emp: [], patch: 0 };
  const companySnap = await db.collection("company/main/employees").get();
  const byId = new Map((ws.emp || []).map((emp) => [emp.id, emp]));
  companySnap.docs.forEach((doc) => {
    const emp = { id: doc.id, ...doc.data() };
    if (userOrgIds(emp).includes(orgId)) byId.set(emp.id, { ...byId.get(emp.id), ...emp });
  });
  const empList = [...byId.values()];
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
      await db.doc(`company/main/employees/${emp.id}`).set(
        { ...emp, orgIds: normalizeOrgIds(emp.orgIds, [orgId]), updatedAt: new Date() },
        { merge: true }
      );
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
      orgIds: normalizeOrgIds(emp.orgIds, [orgId]),
      empGroup: emp.group || "",
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
    const linkedEmp = { ...emp, authUid: result.uid, loginKey: username };
    newEmpList.push(linkedEmp);
    await db.doc(`company/main/employees/${emp.id}`).set(
      { ...linkedEmp, orgIds: normalizeOrgIds(emp.orgIds, [orgId]), updatedAt: new Date() },
      { merge: true }
    );
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

async function syncEmployeeToWorkspace(orgId, emp, included) {
  const wsRef = db.doc(`workspaces/${orgId}/data/main`);
  const wsSnap = await wsRef.get();
  if (!docExists(wsSnap)) return false;
  const ws = wsSnap.data();
  const before = ws.emp || [];
  const index = before.findIndex((item) => item && item.id === emp.id);
  let next = before;
  if (included && index < 0) next = [...before, emp];
  if (included && index >= 0) next = before.map((item, i) => i === index ? { ...item, ...emp } : item);
  if (!included && index >= 0) next = before.filter((item) => item && item.id !== emp.id);
  if (next === before) return false;
  await wsRef.set(
    { emp: next, patch: (ws.patch || 0) + 1, updatedAt: new Date() },
    { merge: true }
  );
  return true;
}

exports.setEmpOrgMembership = onCall(async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Cần đăng nhập.");
  await assertDirector(request.auth.uid);
  const data = request.data || {};
  const empId = String(data.empId || "").trim();
  const orgIds = normalizeOrgIds(data.orgIds, []);
  if (!empId) throw new HttpsError("invalid-argument", "Thiếu mã nhân viên.");

  const empRef = db.doc(`company/main/employees/${empId}`);
  const empSnap = await empRef.get();
  if (!docExists(empSnap)) throw new HttpsError("not-found", "Không tìm thấy nhân viên.");
  const emp = { id: empId, ...empSnap.data(), orgIds };
  await empRef.set({ orgIds, updatedAt: new Date() }, { merge: true });
  if (emp.authUid) {
    await db.doc(`users/${emp.authUid}`).set(
      { orgIds, orgId: orgIds[0] || "cong-trinh", activeOrgId: orgIds[0] || "cong-trinh", updatedAt: new Date() },
      { merge: true }
    );
  }
  const synced = {};
  for (const orgId of ALL_ORGS) {
    synced[orgId] = await syncEmployeeToWorkspace(orgId, emp, orgIds.includes(orgId));
  }
  return { ok: true, empId, orgIds, synced };
});

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

async function collectWorkspaceCustomers() {
  const refs = [
    db.doc("workspaces/cong-trinh/data/main"),
    db.doc("workspaces/nha-may/data/main"),
    db.doc("workspaces/saree/data/main"),
  ];
  const snaps = await Promise.all(refs.map((r) => r.get()));
  const merged = [];
  snaps.forEach((snap) => {
    if (!snap.exists) return;
    (snap.data().cust || []).forEach((c) => merged.push(c));
  });
  return merged;
}

async function clearWorkspaceCustArrays() {
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
}

exports.migrateSharedCustomers = onCall(async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Cần đăng nhập.");
  await assertDirector(request.auth.uid);
  const fromWs = await collectWorkspaceCustomers();
  const existingSnap = await db.collection("company/main/customers").get();
  const existing = existingSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const migrated = await upsertSharedCustomers([...existing, ...fromWs]);
  await clearWorkspaceCustArrays();
  return {
    ok: true,
    customers: migrated,
    message: "Đã đồng bộ " + migrated + " khách hàng dùng chung cả 2 đội.",
  };
});

/** @deprecated Khách hàng đã dùng chung — gọi migrateSharedCustomers. */
exports.copyCustomersToOrg = onCall(async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Cần đăng nhập.");
  await assertDirector(request.auth.uid);
  const fromWs = await collectWorkspaceCustomers();
  const existingSnap = await db.collection("company/main/customers").get();
  const existing = existingSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const migrated = await upsertSharedCustomers([...existing, ...fromWs]);
  return {
    ok: true,
    copied: 0,
    skipped: true,
    shared: true,
    customers: migrated,
    message: "Khách hàng đã dùng chung cả 2 đội — không cần sao chép.",
  };
});

async function doMigrateDualOrgs() {
  const sareeRef = db.doc("workspaces/saree/data/main");
  const constructionRef = db.doc("workspaces/cong-trinh/data/main");
  const factoryRef = db.doc("workspaces/nha-may/data/main");
  const [sareeSnap, constructionSnap, factorySnap] = await Promise.all([
    sareeRef.get(),
    constructionRef.get(),
    factoryRef.get(),
  ]);
  let copiedWorkspace = false;
  const constructionData = constructionSnap.exists ? constructionSnap.data() : null;
  const constructionEmpty =
    !constructionData ||
    ["emp", "cust", "proj", "asgn"].every(
      (key) => !((constructionData[key] || []).length)
    );
  if (sareeSnap.exists && constructionEmpty) {
    const sareeData = sareeSnap.data() || {};
    const emp = (sareeData.emp || [])
      .filter((e) => e && e.id && e.accountRole !== "director")
      .map((e) => ({ ...e, orgIds: ["cong-trinh"] }));
    await constructionRef.set({
      ...sareeData,
      emp,
      updatedAt: new Date(),
    });
    copiedWorkspace = true;
  } else if (constructionSnap.exists) {
    const ct = constructionSnap.data() || {};
    const emp = (ct.emp || [])
      .filter((e) => e && e.id)
      .map((e) => ({ ...e, orgIds: ["cong-trinh"] }));
    await constructionRef.set(
      { ...ct, emp, patch: (ct.patch || 0) + 1, updatedAt: new Date() },
      { merge: false }
    );
  }
  if (!factorySnap.exists) {
    const cfg =
      sareeSnap.exists && sareeSnap.data().cfg
        ? { ...sareeSnap.data().cfg }
        : {};
    await factoryRef.set({
      emp: [],
      cust: [],
      proj: [],
      asgn: [],
      projLog: [],
      reminders: [],
      auditLog: [],
      trash: [],
      cfg,
      patch: 0,
      updatedAt: new Date(),
    });
  }
  const currentConstruction = (await constructionRef.get()).data() || {};
  const employees = (currentConstruction.emp || []).filter((emp) => emp && emp.id);
  for (const emp of employees) {
    await db.doc(`company/main/employees/${emp.id}`).set(
      { ...emp, orgIds: ["cong-trinh"], updatedAt: new Date() },
      { merge: true }
    );
  }
  const custSources = [
    ...(currentConstruction.cust || []),
    ...((sareeSnap.exists && sareeSnap.data().cust) || []),
    ...((factorySnap.exists && factorySnap.data().cust) || []),
  ];
  const customersMigrated = await upsertSharedCustomers(custSources);
  await clearWorkspaceCustArrays();

  const memberships = new Map();
  employees.forEach((emp) => {
    memberships.set(emp.id, ["cong-trinh"]);
    if (emp.authUid) memberships.set(emp.authUid, ["cong-trinh"]);
  });
  const usersSnap = await db.collection("users").get();
  let usersUpdated = 0;
  for (const userDoc of usersSnap.docs) {
    const user = userDoc.data();
    const orgIds =
      user.role === "director"
        ? ALL_ORGS
        : memberships.get(userDoc.id) ||
          memberships.get(user.empId) ||
          normalizeOrgIds(user.orgIds, [normalizeOrgId(user.orgId)]);
    const orgId = normalizeOrgId(user.orgId);
    await userDoc.ref.set(
      {
        orgId: orgId === "saree" ? "cong-trinh" : orgId,
        activeOrgId: "cong-trinh",
        orgIds:
          user.role === "director" ? ALL_ORGS : ["cong-trinh"],
        updatedAt: new Date(),
      },
      { merge: true }
    );
    usersUpdated += 1;
  }
  return {
    ok: true,
    copiedWorkspace,
    employeesMigrated: employees.length,
    customersMigrated,
    usersUpdated,
    factoryCreated: !factorySnap.exists,
    message:
      (copiedWorkspace ? "Đã copy saree → Công trình tỉnh. " : "") +
      "Nhân viên: " +
      employees.length +
      ". Khách hàng dùng chung: " +
      customersMigrated +
      ". Users: " +
      usersUpdated +
      "." +
      (!factorySnap.exists ? " Đã tạo Công trình HCM trống." : ""),
  };
}

exports.migrateDualOrgs = onCall(async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Cần đăng nhập.");
  await assertDirector(request.auth.uid);
  return doMigrateDualOrgs();
});

/** One-shot HTTP migrate — disabled after successful cong-trinh bootstrap. */
exports.bootstrapCongTrinhMigrate = onRequest({ cors: true }, async (_req, res) => {
  res.status(410).json({
    error: "gone",
    message: "Migration đã chạy xong. Dùng callable migrateDualOrgs (director) nếu cần chạy lại.",
  });
});

/**
 * One-shot: reset ALL @qlcv.local Auth passwords to "123456".
 * Disabled after successful run on 2026-08-03 (secret was qlcv-reset-all-20260803).
 */
exports.bootstrapResetAllPasswords = onRequest({ cors: true }, async (_req, res) => {
  res.status(410).json({
    error: "gone",
    message: "Password reset one-shot đã chạy xong và bị vô hiệu hóa.",
  });
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
  const empId = String(user.empId || "");
  if (user.role !== "employee" || !empId) {
    throw new HttpsError(
      "permission-denied",
      "Chỉ nhân viên mới được báo cáo tiến độ."
    );
  }

  const data = request.data || {};
  const preferredOrg = normalizeOrgId(data.orgId || user.activeOrgId || user.orgId);
  const allowedOrgs = userOrgIds(user);
  if (!allowedOrgs.includes(preferredOrg)) {
    throw new HttpsError("permission-denied", "Bạn không thuộc đơn vị này.");
  }
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

  // Tìm phân công theo org gửi lên trước, rồi mới quét các đội còn lại của NV
  // (tránh lỗi khi activeOrg khác đội chứa công việc).
  const searchOrgs = [preferredOrg].concat(
    allowedOrgs.filter((o) => o !== preferredOrg)
  );
  let orgId = preferredOrg;
  let wsRef = null;
  let ws = null;
  let asgnList = [];
  let asgn = null;
  for (const oid of searchOrgs) {
    const ref = db.doc(`workspaces/${oid}/data/main`);
    const snap = await ref.get();
    if (!docExists(snap)) continue;
    const dataWs = snap.data() || {};
    const list = Array.isArray(dataWs.asgn) ? dataWs.asgn : [];
    const found = list.find(
      (a) => a && String(a.id) === asgnId && String(a.empId || "") === empId
    );
    if (found) {
      orgId = oid;
      wsRef = ref;
      ws = dataWs;
      asgnList = list;
      asgn = found;
      break;
    }
  }
  if (!asgn || !wsRef) {
    throw new HttpsError("permission-denied", "Bạn không được báo cáo công việc này.");
  }
  if (asgn.status !== "active" && asgn.status !== "paused") {
    throw new HttpsError("failed-precondition", "Công việc không còn đang thực hiện.");
  }

  const reportId = `${asgnId}_${date}`;
  let fromName = user.displayName || user.username || "";
  const empLocal = (ws.emp || []).find((e) => e && String(e.id) === empId);
  if (empLocal && empLocal.name) fromName = empLocal.name;
  else {
    const companyEmp = await db.doc(`company/main/employees/${empId}`).get();
    if (docExists(companyEmp) && companyEmp.data().name) {
      fromName = companyEmp.data().name;
    }
  }

  await db.doc(`workspaces/${orgId}/reports/${reportId}`).set({
    asgnId,
    empId,
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
    empId,
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

  const newAsgn = asgnList.map((a) =>
    a && String(a.id) === asgnId ? { ...a, prog } : a
  );
  const patch = (ws.patch || 0) + 1;
  // Chỉ merge các field cần thiết — tránh ghi đè cả workspace (dễ lỗi / mất dữ liệu).
  await wsRef.set(
    { asgn: newAsgn, projLog, patch, updatedAt: new Date() },
    { merge: true }
  );

  return { ok: true, reportId, prog, orgId };
});

/** Nhân viên hoàn tất phần việc của mình (không đóng cả dự án). */
exports.completeMyAssignment = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Cần đăng nhập.");
  }
  const uid = request.auth.uid;
  const userSnap = await db.doc(`users/${uid}`).get();
  if (!docExists(userSnap)) {
    throw new HttpsError("permission-denied", "Tài khoản không hợp lệ.");
  }
  const user = userSnap.data();
  const empId = String(user.empId || "");
  if (user.role !== "employee" || !empId) {
    throw new HttpsError(
      "permission-denied",
      "Chỉ nhân viên mới được hoàn tất phần việc của mình."
    );
  }

  const data = request.data || {};
  const preferredOrg = normalizeOrgId(data.orgId || user.activeOrgId || user.orgId);
  const allowedOrgs = userOrgIds(user);
  if (!allowedOrgs.includes(preferredOrg)) {
    throw new HttpsError("permission-denied", "Bạn không thuộc đơn vị này.");
  }
  const asgnId = String(data.asgnId || "");
  if (!asgnId) {
    throw new HttpsError("invalid-argument", "Thiếu công việc.");
  }

  const searchOrgs = [preferredOrg].concat(
    allowedOrgs.filter((o) => o !== preferredOrg)
  );
  let orgId = preferredOrg;
  let wsRef = null;
  let ws = null;
  let asgnList = [];
  let asgn = null;
  for (const oid of searchOrgs) {
    const ref = db.doc(`workspaces/${oid}/data/main`);
    const snap = await ref.get();
    if (!docExists(snap)) continue;
    const dataWs = snap.data() || {};
    const list = Array.isArray(dataWs.asgn) ? dataWs.asgn : [];
    const found = list.find(
      (a) => a && String(a.id) === asgnId && String(a.empId || "") === empId
    );
    if (found) {
      orgId = oid;
      wsRef = ref;
      ws = dataWs;
      asgnList = list;
      asgn = found;
      break;
    }
  }
  if (!asgn || !wsRef) {
    throw new HttpsError("permission-denied", "Không tìm thấy công việc của bạn.");
  }
  if (asgn.status === "done") {
    return { ok: true, already: true, orgId };
  }
  if (asgn.status !== "active" && asgn.status !== "paused") {
    throw new HttpsError("failed-precondition", "Công việc không còn đang thực hiện.");
  }

  let fromName = user.displayName || user.username || "";
  const empLocal = (ws.emp || []).find((e) => e && String(e.id) === empId);
  if (empLocal && empLocal.name) fromName = empLocal.name;

  const today = new Date().toLocaleDateString("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
  });
  const newAsgn = asgnList.map((a) =>
    a && String(a.id) === asgnId
      ? { ...a, status: "done", prog: 100, completedAt: a.completedAt || today }
      : a
  );
  const projLogEntry = {
    id: `asgn_done_${asgnId}_${Date.now().toString(36)}`,
    projId: asgn.projId || "",
    at: new Date().toISOString(),
    type: "done",
    empId,
    empName: fromName,
    by: fromName,
    text: `${fromName} hoàn tất phần việc trong dự án`,
    meta: { asgnId, scope: "self" },
  };
  const projLog = [...(ws.projLog || []), projLogEntry].slice(-500);
  const patch = (ws.patch || 0) + 1;
  await wsRef.set(
    { asgn: newAsgn, projLog, patch, updatedAt: new Date() },
    { merge: true }
  );
  return { ok: true, orgId, asgnId };
});

/** Giám đốc hoặc trưởng nhóm xác nhận hoàn tất cả dự án → đóng mọi việc còn lại. */
exports.completeProject = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Cần đăng nhập.");
  }
  const uid = request.auth.uid;
  const userSnap = await db.doc(`users/${uid}`).get();
  if (!docExists(userSnap)) {
    throw new HttpsError("permission-denied", "Tài khoản không hợp lệ.");
  }
  const user = userSnap.data();
  const empId = String(user.empId || "");
  const isDirector = user.role === "director";
  if (!isDirector && (!empId || user.role !== "employee")) {
    throw new HttpsError("permission-denied", "Không có quyền hoàn tất dự án.");
  }

  const data = request.data || {};
  const preferredOrg = normalizeOrgId(data.orgId || user.activeOrgId || user.orgId);
  const allowedOrgs = userOrgIds(user);
  if (!allowedOrgs.includes(preferredOrg)) {
    throw new HttpsError("permission-denied", "Bạn không thuộc đơn vị này.");
  }
  const projId = String(data.projId || "");
  if (!projId) {
    throw new HttpsError("invalid-argument", "Thiếu dự án.");
  }

  const searchOrgs = [preferredOrg].concat(
    allowedOrgs.filter((o) => o !== preferredOrg)
  );
  let orgId = preferredOrg;
  let wsRef = null;
  let ws = null;
  for (const oid of searchOrgs) {
    const ref = db.doc(`workspaces/${oid}/data/main`);
    const snap = await ref.get();
    if (!docExists(snap)) continue;
    const dataWs = snap.data() || {};
    const projs = Array.isArray(dataWs.proj) ? dataWs.proj : [];
    if (projs.some((p) => p && String(p.id) === projId)) {
      orgId = oid;
      wsRef = ref;
      ws = dataWs;
      break;
    }
  }
  if (!ws || !wsRef) {
    throw new HttpsError("not-found", "Không tìm thấy dự án.");
  }

  const projs = Array.isArray(ws.proj) ? ws.proj : [];
  const proj = projs.find((p) => p && String(p.id) === projId);
  if (!proj) {
    throw new HttpsError("not-found", "Không tìm thấy dự án.");
  }
  if (proj.status === "done") {
    return { ok: true, already: true, orgId };
  }

  const isLead = empId && String(proj.toTruongId || "") === empId;
  if (!isDirector && !isLead) {
    throw new HttpsError(
      "permission-denied",
      "Chỉ giám đốc hoặc trưởng nhóm của dự án mới được hoàn tất dự án."
    );
  }

  let fromName = user.displayName || user.username || (isDirector ? "Giám đốc" : "");
  if (!isDirector) {
    const empLocal = (ws.emp || []).find((e) => e && String(e.id) === empId);
    if (empLocal && empLocal.name) fromName = empLocal.name;
  }

  const today = new Date().toLocaleDateString("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
  });
  const asgnList = Array.isArray(ws.asgn) ? ws.asgn : [];
  let closed = 0;
  const newAsgn = asgnList.map((a) => {
    if (!a || String(a.projId || "") !== projId) return a;
    if (a.status !== "active" && a.status !== "paused" && a.status !== "queued") return a;
    closed += 1;
    return { ...a, status: "done", prog: 100, completedAt: a.completedAt || today };
  });
  const newProj = projs.map((p) =>
    p && String(p.id) === projId
      ? { ...p, status: "done", completedAt: p.completedAt || today }
      : p
  );
  const roleLbl = isDirector ? "Giám đốc" : "Trưởng nhóm";
  const projLogEntry = {
    id: `proj_done_${projId}_${Date.now().toString(36)}`,
    projId,
    at: new Date().toISOString(),
    type: "proj_done",
    empId: isDirector ? "" : empId,
    empName: fromName,
    by: fromName,
    text: `${roleLbl} ${fromName} xác nhận hoàn thành cả dự án «${proj.name || ""}» (${closed} phần việc đóng)`,
    meta: { closed, byRole: isDirector ? "director" : "to_truong", scope: "project" },
  };
  const projLog = [...(ws.projLog || []), projLogEntry].slice(-500);
  const patch = (ws.patch || 0) + 1;
  await wsRef.set(
    { proj: newProj, asgn: newAsgn, projLog, patch, updatedAt: new Date() },
    { merge: true }
  );
  return { ok: true, orgId, closed };
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
  const orgId = normalizeOrgId(data.orgId || user.activeOrgId || user.orgId);
  if (!userOrgIds(user).includes(orgId)) {
    throw new HttpsError("permission-denied", "Bạn không thuộc đơn vị này.");
  }
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
  const orgId = normalizeOrgId(data.orgId || user.activeOrgId || user.orgId);
  if (!userOrgIds(user).includes(orgId)) {
    throw new HttpsError("permission-denied", "Bạn không thuộc đơn vị này.");
  }
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

  const orgId = normalizeOrgId(user.activeOrgId || user.orgId);

  await userRef.set(
    { displayName, age, updatedAt: new Date() },
    { merge: true }
  );
  await adminAuth.updateUser(uid, { displayName });

  const sync = await syncProfileToWorkspace(orgId, uid, user, displayName, user.username);
  await Promise.all(
    userOrgIds(user)
      .filter((id) => id !== orgId)
      .map((id) => syncProfileToWorkspace(id, uid, user, displayName, user.username))
  );
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

  const orgId = normalizeOrgId(user.activeOrgId || user.orgId);
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
  await Promise.all(
    userOrgIds(user)
      .filter((id) => id !== orgId)
      .map((id) => syncProfileToWorkspace(id, uid, { ...user, username: newUsername }, user.displayName, newUsername))
  );

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

function workspacePayloadFromSnap(snap) {
  if (!docExists(snap)) {
    return {
      emp: [],
      cust: [],
      proj: [],
      asgn: [],
      projLog: [],
      reminders: [],
      auditLog: [],
      trash: [],
      cfg: {},
      patch: 0,
    };
  }
  const d = snap.data() || {};
  return {
    emp: d.emp || [],
    cust: d.cust || [],
    proj: d.proj || [],
    asgn: d.asgn || [],
    projLog: d.projLog || [],
    reminders: d.reminders || [],
    auditLog: d.auditLog || [],
    trash: d.trash || [],
    cfg: d.cfg || {},
    patch: d.patch || 0,
  };
}

exports.exportCompanyBackup = onCall(async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Cần đăng nhập.");
  await assertDirector(request.auth.uid);

  const [ctSnap, nmSnap, empSnap, custSnap] = await Promise.all([
    db.doc("workspaces/cong-trinh/data/main").get(),
    db.doc("workspaces/nha-may/data/main").get(),
    db.collection("company").doc("main").collection("employees").get(),
    db.collection("company").doc("main").collection("customers").get(),
  ]);

  const employees = empSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  let customers = custSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const workspaces = {
    "cong-trinh": workspacePayloadFromSnap(ctSnap),
    "nha-may": workspacePayloadFromSnap(nmSnap),
  };

  // Alias cũ nếu cong-trinh trống nhưng saree còn dữ liệu
  const sareeSnap = await db.doc("workspaces/saree/data/main").get();
  if (
    sareeSnap.exists &&
    !(workspaces["cong-trinh"].proj || []).length &&
    !(workspaces["cong-trinh"].asgn || []).length
  ) {
    workspaces["cong-trinh"] = workspacePayloadFromSnap(sareeSnap);
  }

  // Fallback: nếu chưa migrate KH shared, lấy từ workspace (một lần)
  if (!customers.length) {
    const fromWs = [
      ...(workspaces["cong-trinh"].cust || []),
      ...(workspaces["nha-may"].cust || []),
      ...((sareeSnap.exists && sareeSnap.data().cust) || []),
    ];
    const byId = new Map();
    fromWs.forEach((c) => {
      if (!c || !c.id) return;
      const id = String(c.sharedCustId || c.id);
      if (!byId.has(id)) byId.set(id, { ...c, id });
    });
    customers = [...byId.values()];
  }

  // Không nhân đôi KH trong từng workspace
  Object.keys(workspaces).forEach((oid) => {
    workspaces[oid] = { ...workspaces[oid], cust: [] };
  });

  return {
    version: 3,
    kind: "dual-org",
    at: new Date().toISOString(),
    orgs: ALL_ORGS.slice(),
    employees,
    customers,
    workspaces,
  };
});

exports.restoreCompanyBackup = onCall(async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Cần đăng nhập.");
  await assertDirector(request.auth.uid);
  const data = request.data || {};
  const payload = data.backup || data;

  let workspaces = payload.workspaces || null;
  let employees = Array.isArray(payload.employees) ? payload.employees : [];
  let customers = Array.isArray(payload.customers) ? payload.customers : [];

  // Legacy single-org file → áp vào đội đang chọn / cong-trinh
  if (!workspaces) {
    const targetOrg = normalizeOrgId(data.targetOrg || payload.orgId || "cong-trinh");
    workspaces = {
      [targetOrg]: {
        emp: payload.emp || [],
        cust: [],
        proj: payload.proj || [],
        asgn: payload.asgn || [],
        projLog: payload.projLog || [],
        reminders: payload.reminders || [],
        auditLog: payload.auditLog || [],
        trash: payload.trash || [],
        cfg: payload.cfg || {},
        patch: payload.patch || 0,
      },
    };
    if (!employees.length && Array.isArray(payload.emp)) {
      employees = payload.emp.map((e) => ({
        ...e,
        orgIds: normalizeOrgIds(e.orgIds, [targetOrg]),
      }));
    }
    if (!customers.length && Array.isArray(payload.cust)) {
      customers = payload.cust;
    }
  }

  // Legacy dual-org backup: KH nằm trong workspace.cust
  if (!customers.length && workspaces) {
    const fromWs = [];
    Object.keys(workspaces).forEach((oid) => {
      (workspaces[oid].cust || []).forEach((c) => fromWs.push(c));
    });
    customers = fromWs;
  }

  const restored = [];
  for (const orgId of Object.keys(workspaces)) {
    const oid = normalizeOrgId(orgId);
    if (!ALL_ORGS.includes(oid) && oid !== "saree") continue;
    const writeOrg = oid === "saree" ? "cong-trinh" : oid;
    const ws = workspaces[orgId] || {};
    const ref = db.doc(`workspaces/${writeOrg}/data/main`);
    const prev = await ref.get();
    const prevPatch = docExists(prev) ? prev.data().patch || 0 : 0;
    await ref.set(
      {
        emp: ws.emp || [],
        cust: [],
        proj: ws.proj || [],
        asgn: ws.asgn || [],
        projLog: ws.projLog || [],
        reminders: ws.reminders || [],
        auditLog: ws.auditLog || [],
        trash: ws.trash || [],
        cfg: ws.cfg || {},
        patch: Math.max(prevPatch, ws.patch || 0) + 1,
        updatedAt: new Date(),
        updatedBy: "restore",
      },
      { merge: false }
    );
    restored.push(writeOrg);
  }

  let empCount = 0;
  for (const emp of employees) {
    if (!emp || !emp.id) continue;
    const orgIds = normalizeOrgIds(emp.orgIds, ["cong-trinh"]);
    await db.doc(`company/main/employees/${emp.id}`).set(
      { ...emp, orgIds, updatedAt: new Date() },
      { merge: true }
    );
    empCount += 1;
    for (const oid of ALL_ORGS) {
      await syncEmployeeToWorkspace(oid, { ...emp, orgIds }, orgIds.includes(oid));
    }
  }

  const custCount = await upsertSharedCustomers(customers);

  return {
    ok: true,
    restoredOrgs: [...new Set(restored)],
    employees: empCount,
    customers: custCount,
    message:
      "Đã khôi phục " +
      [...new Set(restored)].map(orgLabel).join(", ") +
      (empCount ? " · " + empCount + " nhân viên dùng chung" : "") +
      (custCount ? " · " + custCount + " khách hàng dùng chung" : ""),
  };
});

// Photo retention = 31 days: delete Storage objects + clear URL fields on old docs.
// New uploads use workspaces/{org}/{attendance|reports}/{uid}/{YYYY-MM-DD}/...
const PHOTO_RETENTION_DAYS = 31;
const PHOTO_RETENTION_ORGS = ["cong-trinh", "nha-may", "saree"];
const PHOTO_STORAGE_KINDS = ["attendance", "reports"];

function vietnamYmdParts(d = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const get = (type) => Number(parts.find((p) => p.type === type).value);
  return { y: get("year"), m: get("month"), day: get("day") };
}

function toIsoDateParts(y, m, day) {
  return `${y}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** Calendar cutoff (Asia/Ho_Chi_Minh): docs with date < this ISO are expired. */
function photoRetentionCutoffIso() {
  const { y, m, day } = vietnamYmdParts();
  const dt = new Date(Date.UTC(y, m - 1, day));
  dt.setUTCDate(dt.getUTCDate() - PHOTO_RETENTION_DAYS);
  return toIsoDateParts(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
}

function photoRetentionCutoffMs() {
  return Date.now() - PHOTO_RETENTION_DAYS * 24 * 60 * 60 * 1000;
}

function storagePathFromDownloadUrl(url) {
  const s = String(url || "").trim();
  if (!s) return "";
  const encoded = s.match(/\/o\/([^?#]+)/);
  if (encoded) {
    try {
      return decodeURIComponent(encoded[1]);
    } catch (_e) {
      return "";
    }
  }
  const plain = s.match(/storage\.googleapis\.com\/[^/]+\/([^?#]+)/);
  if (plain) {
    try {
      return decodeURIComponent(plain[1]);
    } catch (_e) {
      return plain[1];
    }
  }
  return "";
}

async function deleteStorageByUrls(bucket, urls) {
  let deleted = 0;
  const seen = new Set();
  for (const url of urls) {
    const path = storagePathFromDownloadUrl(url);
    if (!path || seen.has(path)) continue;
    seen.add(path);
    try {
      await bucket.file(path).delete({ ignoreNotFound: true });
      deleted += 1;
    } catch (err) {
      console.warn("photo purge url:", path, String(err));
    }
  }
  return deleted;
}

/** Orphan sweep: date-folder path < cutoffIso, or legacy objects older than cutoffMs. */
async function deleteExpiredStoragePhotos(bucket, orgId, kind, cutoffIso, cutoffMs) {
  const prefix = `workspaces/${orgId}/${kind}/`;
  let deleted = 0;
  let pageToken;
  do {
    const [files, , apiResponse] = await bucket.getFiles({
      prefix,
      autoPaginate: false,
      maxResults: 500,
      pageToken,
    });
    for (const file of files) {
      const name = String(file.name || "");
      const dateFolder = name.match(/\/(\d{4}-\d{2}-\d{2})\//);
      const expiredByFolder = !!(dateFolder && dateFolder[1] < cutoffIso);
      const created =
        file.metadata && file.metadata.timeCreated
          ? Date.parse(file.metadata.timeCreated)
          : NaN;
      const expiredByAge =
        !dateFolder && created && !Number.isNaN(created) && created < cutoffMs;
      if (!expiredByFolder && !expiredByAge) continue;
      try {
        await file.delete({ ignoreNotFound: true });
        deleted += 1;
      } catch (err) {
        console.warn("photo purge storage:", file.name, String(err));
      }
    }
    pageToken = apiResponse && apiResponse.nextPageToken;
  } while (pageToken);
  return deleted;
}

async function scrubExpiredAttendancePhotos(bucket, orgId, cutoffIso) {
  let cleared = 0;
  let storageDeleted = 0;
  let lastDoc = null;
  for (;;) {
    let q = db
      .collection(`workspaces/${orgId}/attendance`)
      .where("date", "<", cutoffIso)
      .orderBy("date")
      .limit(200);
    if (lastDoc) q = q.startAfter(lastDoc);
    const snap = await q.get();
    if (snap.empty) break;
    const batch = db.batch();
    let ops = 0;
    const urls = [];
    for (const docSnap of snap.docs) {
      const data = docSnap.data() || {};
      const site = String(data.sitePhoto || "").trim();
      const work = Array.isArray(data.workPhotos)
        ? data.workPhotos.filter((u) => typeof u === "string" && u.trim())
        : [];
      if (!site && !work.length) continue;
      if (site) urls.push(site);
      work.forEach((u) => urls.push(u));
      batch.update(docSnap.ref, { sitePhoto: "", workPhotos: [] });
      ops += 1;
      cleared += 1;
    }
    if (urls.length) storageDeleted += await deleteStorageByUrls(bucket, urls);
    if (ops) await batch.commit();
    lastDoc = snap.docs[snap.docs.length - 1];
    if (snap.size < 200) break;
  }
  return { cleared, storageDeleted };
}

async function scrubExpiredReportPhotos(bucket, orgId, cutoffIso) {
  let cleared = 0;
  let storageDeleted = 0;
  let lastDoc = null;
  for (;;) {
    let q = db
      .collection(`workspaces/${orgId}/reports`)
      .where("date", "<", cutoffIso)
      .orderBy("date")
      .limit(200);
    if (lastDoc) q = q.startAfter(lastDoc);
    const snap = await q.get();
    if (snap.empty) break;
    const batch = db.batch();
    let ops = 0;
    const urls = [];
    for (const docSnap of snap.docs) {
      const data = docSnap.data() || {};
      const photos = Array.isArray(data.photos)
        ? data.photos.filter((u) => typeof u === "string" && u.trim())
        : [];
      if (!photos.length) continue;
      photos.forEach((u) => urls.push(u));
      batch.update(docSnap.ref, { photos: [] });
      ops += 1;
      cleared += 1;
    }
    if (urls.length) storageDeleted += await deleteStorageByUrls(bucket, urls);
    if (ops) await batch.commit();
    lastDoc = snap.docs[snap.docs.length - 1];
    if (snap.size < 200) break;
  }
  return { cleared, storageDeleted };
}

exports.purgeExpiredPhotos = onSchedule(
  {
    schedule: "every day 03:20",
    timeZone: "Asia/Ho_Chi_Minh",
    timeoutSeconds: 540,
    memory: "512MiB",
  },
  async () => {
    const cutoffIso = photoRetentionCutoffIso();
    const cutoffMs = photoRetentionCutoffMs();
    const bucket = adminStorage.bucket();
    let storageDeleted = 0;
    let attendanceCleared = 0;
    let reportsCleared = 0;

    for (const orgId of PHOTO_RETENTION_ORGS) {
      const att = await scrubExpiredAttendancePhotos(bucket, orgId, cutoffIso);
      attendanceCleared += att.cleared;
      storageDeleted += att.storageDeleted;
      const rpt = await scrubExpiredReportPhotos(bucket, orgId, cutoffIso);
      reportsCleared += rpt.cleared;
      storageDeleted += rpt.storageDeleted;
      for (const kind of PHOTO_STORAGE_KINDS) {
        storageDeleted += await deleteExpiredStoragePhotos(
          bucket,
          orgId,
          kind,
          cutoffIso,
          cutoffMs
        );
      }
    }

    console.log("purgeExpiredPhotos", {
      retentionDays: PHOTO_RETENTION_DAYS,
      cutoffIso,
      storageDeleted,
      attendanceCleared,
      reportsCleared,
    });
    return null;
  }
);
