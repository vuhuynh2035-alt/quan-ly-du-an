import { initializeApp } from "firebase/app";
import { getFirestore, doc, getDoc } from "firebase/firestore";
import fs from "fs";

// Read firebase-config
const configStr = fs.readFileSync("../public/firebase-config.js", "utf8");
// Extract the FIREBASE_CONFIG object
const match = configStr.match(/var FIREBASE_CONFIG = ({[\s\S]+?});/);
if (!match) {
  console.error("Could not find config");
  process.exit(1);
}
const config = eval("(" + match[1] + ")");

const app = initializeApp(config);
const db = getFirestore(app);

async function run() {
  const ref = doc(db, "workspaces", "saree", "data", "main");
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    console.log("No workspace data found.");
    process.exit(1);
  }
  const data = snap.data();
  const empList = data.emp || [];
  const asgnList = data.asgn || [];
  
  const lien = empList.find(e => e.name.toLowerCase().includes("liền") || e.loginKey === "lien");
  if (!lien) {
    console.log("Could not find employee Lien");
    process.exit(1);
  }
  console.log("Lien empId:", lien.id);
  console.log("Lien authUid:", lien.authUid);
  
  const lienAsgns = asgnList.filter(a => a.empId === lien.id);
  console.log(`Found ${lienAsgns.length} assignments for Lien`);
  for (const a of lienAsgns) {
    console.log(`- ID: ${a.id}, Status: ${a.status}, Work: ${a.workContent}`);
  }
  
  // also check users collection to see what empId Lien's uid points to
  if (lien.authUid) {
    const uref = doc(db, "users", lien.authUid);
    const usnap = await getDoc(uref);
    if (usnap.exists()) {
      console.log("User doc empId:", usnap.data().empId);
    } else {
      console.log("User doc not found!");
    }
  }
  
  process.exit(0);
}

run().catch(console.error);
