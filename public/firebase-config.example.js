// Sao chép file này thành firebase-config.js và điền thông tin từ Firebase Console.
// Project Settings → Your apps → Web app → firebaseConfig
// Cloud Messaging → Web Push certificates → Key pair (VAPID)

var FIREBASE_CONFIG = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID",
};

// Bắt buộc cho thông báo trên trình duyệt / điện thoại
var FIREBASE_VAPID_KEY = "YOUR_VAPID_KEY";

// Danh sách đội (Công trình tỉnh / Công trình HCM)
var FIREBASE_ORGS = [
  { id: "cong-trinh", label: "Công trình tỉnh" },
  { id: "nha-may", label: "Công trình HCM" },
];

// Mã đội mặc định khi đăng nhập
var FIREBASE_DEFAULT_ORG = "cong-trinh";
