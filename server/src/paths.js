/** Map Firestore-style paths onto SQLite tables. */

var COLLECTION_MAP = {
  messages: "messages",
  leaveRequests: "leave_requests",
  leave_requests: "leave_requests",
  reports: "reports",
  attendance: "attendance",
  arrivals: "arrivals",
  employees: "employees",
  customers: "customers",
};

export function parsePath(raw) {
  var parts = String(raw || "")
    .replace(/^\/+|\/+$/g, "")
    .split("/")
    .filter(Boolean);
  return parts;
}

export function classifyDocPath(raw) {
  var parts = parsePath(raw);
  if (!parts.length) return { kind: "unknown", parts: parts };

  if (parts[0] === "users" && parts.length === 2) {
    return { kind: "user", userId: parts[1], parts: parts };
  }

  if (parts[0] === "workspaces" && parts.length >= 2) {
    var orgId = parts[1];
    if (parts.length === 4 && parts[2] === "data" && parts[3] === "main") {
      return { kind: "workspace_main", orgId: orgId, parts: parts };
    }
    if (parts.length === 3) {
      var col = COLLECTION_MAP[parts[2]];
      if (col) return { kind: "collection", orgId: orgId, table: col, parts: parts };
    }
    if (parts.length === 4) {
      var col2 = COLLECTION_MAP[parts[2]];
      if (col2) {
        return {
          kind: "collection_doc",
          orgId: orgId,
          table: col2,
          docId: parts[3],
          parts: parts,
        };
      }
    }
  }

  return { kind: "document", path: parts.join("/"), parts: parts };
}

export function classifyCollectionPath(raw) {
  var parts = parsePath(raw);
  if (parts[0] === "workspaces" && parts.length === 3) {
    var col = COLLECTION_MAP[parts[2]];
    if (col) return { kind: "collection", orgId: parts[1], table: col, parts: parts };
  }
  if (parts[0] === "users" && parts.length === 1) {
    return { kind: "users", parts: parts };
  }
  return { kind: "documents_prefix", prefix: parts.join("/"), parts: parts };
}
