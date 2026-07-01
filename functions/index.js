const { onDocumentWritten } = require("firebase-functions/v2/firestore");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const { getMessaging } = require("firebase-admin/messaging");

initializeApp();

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
  const title = "Công việc mới";
  const work =
    asgn.workContent ||
    (proj && proj.name) ||
    "Bạn được giao việc mới";
  const body = `${emp.name}: ${work}`;
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
    const tokens = new Set();

    targets.forEach((asgn) => {
      const emp = empById.get(asgn.empId);
      if (emp && emp.fcmToken) tokens.add(emp.fcmToken);
    });

    if (!tokens.size) return null;

    const results = [];
    for (const token of tokens) {
      const asgn = targets.find((a) => {
        const emp = empById.get(a.empId);
        return emp && emp.fcmToken === token;
      });
      if (!asgn) continue;
      const emp = empById.get(asgn.empId);
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
