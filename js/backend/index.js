/**
 * Chọn backend theo window.APP_BACKEND ("firebase" mặc định | "selfhost").
 *
 * Adapter shape (mọi backend phải giống):
 *   kind, isConfigured(), init()
 *   auth:    currentUser (getter), onAuthChange(cb) -> unsub, signIn(email, pass) -> { user },
 *            signUp(email, pass) -> { user }, updateProfile(user, { displayName }), signOut(),
 *            reauthenticate(user, password), updatePassword(user, newPassword)
 *   data:    getDoc(path) -> { id, exists, data }, setDoc(path, value, options?),
 *            updateDoc(path, patch), deleteDoc(path), addDoc(colPath, value) -> { id },
 *            getQuery(colPath, spec?) -> [{ id, data }],
 *            subscribeDoc(path, onNext({ id, exists, data }), onError) -> unsub,
 *            subscribeQuery(colPath, spec, onNext([{ id, data }]), onError) -> unsub,
 *            batchSet([{ path, data }], options?)
 *            spec = { where: [[field, op, value]], orderBy: [[field, "asc"|"desc"]], limit: n }
 *   callable(name, region?) -> fn(payload) -> { data }; call(name, payload, { region }?) -> data
 *   storage: prepare(), upload(path, file, { contentType }) -> url
 *   push:    swUrl, isSupported(), getClient(), getToken(client, { vapidKey, serviceWorkerRegistration }),
 *            onForegroundMessage(client, cb) -> unsub
 *   time:    serverTime(), toMillis(v), toDate(v)
 */
import { firebaseAdapter } from "./firebase-adapter.js";

export function backendKind() {
  var k = String(window.APP_BACKEND || "firebase").trim().toLowerCase();
  return k === "selfhost" ? "selfhost" : "firebase";
}

export async function loadBackend() {
  if (backendKind() === "selfhost") {
    var mod = await import("./selfhost-adapter.js");
    return mod.selfhostAdapter;
  }
  return firebaseAdapter;
}
