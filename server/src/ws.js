import { WebSocketServer } from "ws";
import { verifyToken } from "./auth.js";

var wss = null;
var clients = new Set();

export function attachWebSocket(server) {
  wss = new WebSocketServer({ server: server, path: "/ws" });
  wss.on("connection", function (socket, req) {
    var url = new URL(req.url || "", "http://localhost");
    var token = url.searchParams.get("token") || "";
    var payload = token ? verifyToken(token) : null;
    socket.userId = payload && payload.sub;
    clients.add(socket);
    socket.send(
      JSON.stringify({
        type: "hello",
        authenticated: !!socket.userId,
        message: "WebSocket stub — workspace updates sẽ broadcast tại đây.",
      })
    );
    socket.on("close", function () {
      clients.delete(socket);
    });
    socket.on("message", function (raw) {
      try {
        var msg = JSON.parse(String(raw));
        if (msg && msg.type === "ping") {
          socket.send(JSON.stringify({ type: "pong", t: Date.now() }));
        }
      } catch (_) {}
    });
  });
  return wss;
}

export function broadcast(event) {
  var raw = JSON.stringify(event);
  clients.forEach(function (socket) {
    if (socket.readyState === 1) socket.send(raw);
  });
}

export function notifyDocChange(path, data) {
  broadcast({ type: "doc", path: path, data: data, at: new Date().toISOString() });
}
