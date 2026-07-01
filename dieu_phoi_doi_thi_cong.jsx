import React, { useState, useEffect, useMemo } from "react";

/* ============================================================
   ĐIỀU PHỐI ĐỘI THI CÔNG  —  Field Crew Dispatch Console
   Điều động nhân sự thi công / sửa chữa theo dự án ở các tỉnh
   ============================================================ */

const C = {
  bg: "#EEF1F5", surface: "#FFFFFF", ink: "#16202E", muted: "#62707F", line: "#DCE2EA",
  primary: "#2A5C8A", primarySoft: "#E7EFF6", accent: "#E8902A",
  good: "#2E9E6B", warn: "#D98324", bad: "#C4493D",
  goodSoft: "#E3F3EC", warnSoft: "#FBEEDD", badSoft: "#F8E6E3",
};
const SANS = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
const MONO = 'ui-monospace, "SF Mono", Menlo, Consolas, monospace';

const GROUPS = ["Điện", "Hàn", "Hệ thống", "Máy trục vít", "IQF", "Phụ việc"];
const GROUP_COLOR = {
  "Điện": "#E8902A", "Hàn": "#C4493D", "Hệ thống": "#2A5C8A",
  "Máy trục vít": "#7A4FB5", "IQF": "#1E96A8", "Phụ việc": "#62707F",
};

const PROVINCES = [
  ["An Giang",10.5216,105.1259],["Bà Rịa - Vũng Tàu",10.5417,107.2428],["Bạc Liêu",9.2941,105.7216],
  ["Bắc Giang",21.2731,106.1947],["Bắc Kạn",22.1470,105.8348],["Bắc Ninh",21.1861,106.0763],
  ["Bến Tre",10.2433,106.3756],["Bình Dương",11.3254,106.4770],["Bình Định",13.7820,109.2197],
  ["Bình Phước",11.7512,106.7235],["Bình Thuận",11.0904,108.0721],["Cà Mau",9.1768,105.1524],
  ["Cần Thơ",10.0452,105.7469],["Cao Bằng",22.6657,106.2570],["Đà Nẵng",16.0544,108.2022],
  ["Đắk Lắk",12.7100,108.2378],["Đắk Nông",12.0044,107.6906],["Điện Biên",21.3860,103.0231],
  ["Đồng Nai",10.9447,106.8243],["Đồng Tháp",10.4938,105.6882],["Gia Lai",13.9833,108.0000],
  ["Hà Giang",22.8233,104.9836],["Hà Nam",20.5835,105.9230],["Hà Nội",21.0285,105.8542],
  ["Hà Tĩnh",18.3559,105.8877],["Hải Dương",20.9373,106.3146],["Hải Phòng",20.8449,106.6881],
  ["Hậu Giang",9.7579,105.6413],["Hoà Bình",20.8133,105.3383],["Hưng Yên",20.6464,106.0511],
  ["Khánh Hoà",12.2388,109.1967],["Kiên Giang",10.0125,105.0809],["Kon Tum",14.3497,108.0005],
  ["Lai Châu",22.3964,103.4587],["Lâm Đồng",11.9404,108.4583],["Lạng Sơn",21.8537,106.7615],
  ["Lào Cai",22.4809,103.9755],["Long An",10.6956,106.2431],["Nam Định",20.4388,106.1621],
  ["Nghệ An",18.6796,105.6813],["Ninh Bình",20.2506,105.9745],["Ninh Thuận",11.5645,108.9899],
  ["Phú Thọ",21.3227,105.4019],["Phú Yên",13.0882,109.0929],["Quảng Bình",17.4659,106.6222],
  ["Quảng Nam",15.5394,108.0191],["Quảng Ngãi",15.1205,108.7922],["Quảng Ninh",21.0064,107.2925],
  ["Quảng Trị",16.7943,107.0451],["Sóc Trăng",9.6037,105.9800],["Sơn La",21.1023,103.7289],
  ["Tây Ninh",11.3100,106.0989],["Thái Bình",20.4500,106.3400],["Thái Nguyên",21.5928,105.8442],
  ["Thanh Hoá",19.8067,105.7852],["Thừa Thiên Huế",16.4637,107.5909],["Tiền Giang",10.4493,106.3420],
  ["TP. Hồ Chí Minh",10.8231,106.6297],["Trà Vinh",9.9347,106.3453],["Tuyên Quang",21.8233,105.2140],
  ["Vĩnh Long",10.2537,105.9722],["Vĩnh Phúc",21.3089,105.6049],["Yên Bái",21.7168,104.8986],
].map(([name, lat, lng]) => ({ name, lat, lng }));
const PROV_MAP = Object.fromEntries(PROVINCES.map((p) => [p.name, p]));
const DEFAULT_PROV = "TP. Hồ Chí Minh";

function haversine(a, b) {
  if (!a || !b) return null;
  const R = 6371, toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat), dLng = toRad(b.lng - a.lng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return Math.round(R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s)));
}
const uid = () => Math.random().toString(36).slice(2, 9);
const fmtVND = (n) => (n == null ? "—" : Math.round(n).toLocaleString("vi-VN") + " ₫");
const today = () => new Date().toISOString().slice(0, 10);

const store = (typeof window !== "undefined" && window.storage) ? window.storage : null;
async function loadKey(key, fb) { if (!store) return fb; try { const r = await store.get(key); return r && r.value != null ? JSON.parse(r.value) : fb; } catch { return fb; } }
async function saveKey(key, v) { if (!store) return; try { await store.set(key, JSON.stringify(v)); } catch {} }

const SEED_TEAM = {
  "Điện": ["Phương", "Khoa"], "Hàn": ["Hận", "Bình", "Thoàn", "Hiếu"],
  "Hệ thống": ["Liền", "Nhu", "Tú Nguyên", "Sơn Thi"], "Máy trục vít": ["Khanh"],
  "IQF": ["Lohl"], "Phụ việc": ["A"],
};
function seedEmployees() {
  const out = [];
  for (const g of GROUPS) for (const name of (SEED_TEAM[g] || []))
    out.push({ id: uid(), name, group: g, province: DEFAULT_PROV, skill: 3, status: "available", note: "" });
  return out;
}
const DEFAULT_SETTINGS = { wProximity: 4, wAvailability: 4, wSkill: 2, costPerKm: 8000, maxLoad: 3 };

function recommend(project, employees, assignments, settings) {
  if (!project) return [];
  const sw = (settings.wProximity + settings.wAvailability + settings.wSkill) || 1;
  const wp = settings.wProximity / sw, wa = settings.wAvailability / sw, ws = settings.wSkill / sw;
  const maxDist = 1800, pc = PROV_MAP[project.province];
  return employees.filter((e) => e.group === project.group).map((e) => {
    const dist = haversine(PROV_MAP[e.province], pc);
    const active = assignments.filter((a) => a.employeeId === e.id && a.status === "active").length;
    let avail = Math.max(0, 1 - active / (settings.maxLoad || 3));
    if (e.status === "leave") avail = 0; else if (e.status === "busy") avail *= 0.4;
    const prox = dist == null ? 0.5 : Math.max(0, 1 - Math.min(dist, maxDist) / maxDist);
    const skill = (e.skill || 3) / 5;
    const parts = { prox: wp * prox * 100, avail: wa * avail * 100, skill: ws * skill * 100 };
    const score = parts.prox + parts.avail + parts.skill;
    const transport = dist == null ? null : dist * (settings.costPerKm || 0);
    return { emp: e, dist, active, avail, prox, skill, score, transport, parts };
  }).sort((x, y) => y.score - x.score);
}

/* ---------- UI atoms ---------- */
const card = { background: C.surface, border: `1px solid ${C.line}`, borderRadius: 12 };
function Badge({ children, color = C.muted, soft }) {
  return <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12, fontWeight: 600,
    color, background: soft || "transparent", border: `1px solid ${color}33`, padding: "2px 8px", borderRadius: 999 }}>{children}</span>;
}
const STATUS = {
  available: { label: "Sẵn sàng", color: C.good, soft: C.goodSoft },
  busy: { label: "Đang bận", color: C.warn, soft: C.warnSoft },
  leave: { label: "Nghỉ", color: C.bad, soft: C.badSoft },
};
function Field({ label, children }) {
  return <label style={{ display: "block", marginBottom: 12 }}>
    <div style={{ fontSize: 12, fontWeight: 600, color: C.muted, marginBottom: 5, textTransform: "uppercase", letterSpacing: ".04em" }}>{label}</div>
    {children}</label>;
}
const inputStyle = { width: "100%", boxSizing: "border-box", padding: "9px 11px", fontSize: 14, fontFamily: SANS, color: C.ink, background: "#fff", border: `1px solid ${C.line}`, borderRadius: 8, outline: "none" };
function Btn({ children, onClick, variant = "primary", small, disabled }) {
  const v = { primary: { background: C.primary, color: "#fff", border: `1px solid ${C.primary}` },
    accent: { background: C.accent, color: "#fff", border: `1px solid ${C.accent}` },
    ghost: { background: "#fff", color: C.ink, border: `1px solid ${C.line}` },
    danger: { background: "#fff", color: C.bad, border: `1px solid ${C.bad}55` } }[variant];
  return <button onClick={onClick} disabled={disabled} style={{ ...v, opacity: disabled ? 0.5 : 1, cursor: disabled ? "default" : "pointer",
    fontFamily: SANS, fontWeight: 600, fontSize: small ? 13 : 14, padding: small ? "6px 12px" : "9px 16px", borderRadius: 8 }}>{children}</button>;
}
function Modal({ title, children, onClose }) {
  return <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "#16202E99", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "40px 16px", overflowY: "auto", zIndex: 50 }}>
    <div onClick={(e) => e.stopPropagation()} style={{ ...card, width: "100%", maxWidth: 540, padding: 24 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
        <h3 style={{ margin: 0, fontSize: 18 }}>{title}</h3>
        <button onClick={onClose} style={{ border: "none", background: "none", fontSize: 24, cursor: "pointer", color: C.muted, lineHeight: 1 }}>×</button>
      </div>{children}
    </div></div>;
}
function Stars({ value, onChange, size = 18 }) {
  return <span style={{ display: "inline-flex", gap: 2 }}>{[1, 2, 3, 4, 5].map((n) =>
    <span key={n} onClick={onChange ? () => onChange(n) : undefined} style={{ cursor: onChange ? "pointer" : "default", color: n <= value ? C.accent : C.line, fontSize: size }}>★</span>)}</span>;
}
const ProvSelect = (props) => <select {...props} style={inputStyle}>{PROVINCES.map((p) => <option key={p.name} value={p.name}>{p.name}</option>)}</select>;

/* ===================== APP ===================== */
export default function App() {
  const [tab, setTab] = useState("dash");
  const [loaded, setLoaded] = useState(false);
  const [employees, setEmployees] = useState([]);
  const [projects, setProjects] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [selProjId, setSelProjId] = useState(null);

  useEffect(() => { (async () => {
    setEmployees(await loadKey("crew_employees_v1", seedEmployees()));
    setProjects(await loadKey("crew_projects_v1", []));
    setAssignments(await loadKey("crew_assignments_v1", []));
    setSettings(await loadKey("crew_settings_v1", DEFAULT_SETTINGS));
    setLoaded(true);
  })(); }, []);
  useEffect(() => { if (loaded) saveKey("crew_employees_v1", employees); }, [employees, loaded]);
  useEffect(() => { if (loaded) saveKey("crew_projects_v1", projects); }, [projects, loaded]);
  useEffect(() => { if (loaded) saveKey("crew_assignments_v1", assignments); }, [assignments, loaded]);
  useEffect(() => { if (loaded) saveKey("crew_settings_v1", settings); }, [settings, loaded]);

  const empById = useMemo(() => Object.fromEntries(employees.map((e) => [e.id, e])), [employees]);
  const projById = useMemo(() => Object.fromEntries(projects.map((p) => [p.id, p])), [projects]);
  const activeCount = (eid) => assignments.filter((a) => a.employeeId === eid && a.status === "active").length;
  const avgQuality = (eid) => {
    const qs = assignments.filter((a) => a.employeeId === eid && a.quality != null).map((a) => a.quality);
    return qs.length ? qs.reduce((s, x) => s + x, 0) / qs.length : null;
  };

  const TABS = [["dash", "Tổng quan"], ["emp", "Nhân sự"], ["proj", "Dự án"], ["dispatch", "Điều động"], ["progress", "Tiến độ"], ["quality", "Đánh giá"], ["set", "Cài đặt"]];
  if (!loaded) return <div style={{ fontFamily: SANS, padding: 40, color: C.muted }}>Đang tải dữ liệu…</div>;

  return (
    <div style={{ fontFamily: SANS, background: C.bg, color: C.ink, minHeight: "100vh" }}>
      <div style={{ background: C.ink, color: "#fff", padding: "14px 22px", display: "flex", alignItems: "center", gap: 14 }}>
        <div style={{ width: 34, height: 34, borderRadius: 8, background: C.accent, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontFamily: MONO }}>◧</div>
        <div>
          <div style={{ fontWeight: 800, letterSpacing: ".02em" }}>ĐIỀU PHỐI ĐỘI THI CÔNG</div>
          <div style={{ fontSize: 12, color: "#9DB0C2", fontFamily: MONO }}>{employees.length} nhân sự · {projects.filter((p) => p.status !== "done").length} dự án đang mở · {assignments.filter((a) => a.status === "active").length} điều động</div>
        </div>
      </div>
      <div style={{ display: "flex", gap: 4, padding: "0 12px", background: C.surface, borderBottom: `1px solid ${C.line}`, overflowX: "auto" }}>
        {TABS.map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)} style={{ border: "none", background: "none", cursor: "pointer", fontFamily: SANS, fontSize: 14, fontWeight: 600, padding: "13px 14px", whiteSpace: "nowrap", color: tab === k ? C.primary : C.muted, borderBottom: `2px solid ${tab === k ? C.primary : "transparent"}` }}>{label}</button>
        ))}
      </div>
      <div style={{ maxWidth: 1080, margin: "0 auto", padding: 20 }}>
        {tab === "dash" && <Dashboard {...{ employees, projects, assignments, activeCount, avgQuality, empById, projById, setTab, setSelProjId }} />}
        {tab === "emp" && <Employees {...{ employees, setEmployees, activeCount, avgQuality }} />}
        {tab === "proj" && <Projects {...{ projects, setProjects, onDispatch: (id) => { setSelProjId(id); setTab("dispatch"); } }} />}
        {tab === "dispatch" && <Dispatch {...{ projects, employees, assignments, setAssignments, settings, selProjId, setSelProjId }} />}
        {tab === "progress" && <Progress {...{ assignments, setAssignments, empById, projById }} />}
        {tab === "quality" && <Quality {...{ assignments, setAssignments, empById, projById }} />}
        {tab === "set" && <Settings {...{ settings, setSettings, employees, projects, assignments, setEmployees, setProjects, setAssignments }} />}
      </div>
    </div>
  );
}

/* ===================== DASHBOARD ===================== */
function Dashboard({ employees, projects, assignments, activeCount, avgQuality, empById, projById, setTab, setSelProjId }) {
  const [expGrp, setExpGrp] = useState({});
  const BusyBar = ({ p, lg }) => {
    const pct = Math.max(0, Math.min(100, p));
    return (
      <div title={pct > 0 ? `Bận rộn ${pct}%` : "Rảnh"} style={{
        display: "flex", width: lg ? "100%" : 72, height: lg ? 9 : 7, borderRadius: 999, overflow: "hidden", flexShrink: 0,
        boxShadow: "0 0 0 1px rgba(255,255,255,.14), 0 0 8px rgba(34,197,94,.3)", marginTop: lg ? 4 : 0,
      }}>
        {pct > 0 && <div style={{ width: `${pct}%`, height: "100%", background: "#ef4444", boxShadow: "inset 0 0 4px rgba(255,100,100,.4)" }} />}
        {pct < 100 && <div style={{ width: `${100 - pct}%`, height: "100%", background: "#22c55e" }} />}
      </div>
    );
  };
  const busyPct = (e) => {
    if (e.status === "leave") return 0;
    const ml = 3;
    let p = Math.round(Math.min(100, (activeCount(e.id) / ml) * 100));
    if (e.status === "busy") p = Math.max(p, 40);
    return p;
  };
  const byStatus = { available: 0, busy: 0, leave: 0 };
  employees.forEach((e) => { byStatus[e.status] = (byStatus[e.status] || 0) + 1; });
  const open = projects.filter((p) => p.status !== "done");
  const active = assignments.filter((a) => a.status === "active");
  const needsLoc = employees.filter((e) => e.province === DEFAULT_PROV).length;
  const Stat = ({ n, label, color }) => (
    <div style={{ ...card, padding: "16px 18px", flex: 1, minWidth: 140 }}>
      <div style={{ fontSize: 30, fontWeight: 800, fontFamily: MONO, color: color || C.ink }}>{n}</div>
      <div style={{ fontSize: 13, color: C.muted, marginTop: 2 }}>{label}</div>
    </div>
  );
  return (
    <div>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
        <Stat n={employees.length} label="Nhân sự" />
        <Stat n={byStatus.available || 0} label="Sẵn sàng" color={C.good} />
        <Stat n={open.length} label="Dự án đang mở" color={C.primary} />
        <Stat n={active.length} label="Đang điều động" color={C.accent} />
      </div>
      {needsLoc > 0 && (
        <div style={{ ...card, padding: "12px 16px", borderColor: C.accent + "66", background: C.warnSoft, marginBottom: 16, fontSize: 14 }}>
          ⚠︎ {needsLoc} nhân sự đang để mặc định ở <b>{DEFAULT_PROV}</b>. Hãy mở tab <b>Nhân sự</b> đặt đúng tỉnh/thành nơi từng người ở để gợi ý theo khoảng cách & chi phí chính xác.
        </div>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <div style={{ ...card, padding: 18 }}>
          <h3 style={{ marginTop: 0, fontSize: 15 }}>Chuyên môn</h3>
          {GROUPS.map((g) => {
            const list = employees.filter((e) => e.group === g);
            const free = list.filter((e) => e.status === "available").length;
            const open = !!expGrp[g];
            return (
              <div key={g} style={{ borderBottom: `1px solid ${C.line}` }}>
                <div
                  onClick={() => setExpGrp((p) => ({ ...p, [g]: !p[g] }))}
                  style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 0", cursor: "pointer", userSelect: "none" }}
                >
                  <span style={{ fontSize: 11, color: C.muted, transform: open ? "rotate(90deg)" : "none", transition: "transform .2s", width: 12 }}>▸</span>
                  <span style={{ width: 9, height: 9, borderRadius: 3, background: GROUP_COLOR[g] }} />
                  <span style={{ flex: 1, fontWeight: 600, fontSize: 14 }}>{g}</span>
                  <span style={{ fontFamily: MONO, fontSize: 13, color: C.muted }}>{free}/{list.length}</span>
                </div>
                {open && (
                  <div style={{ padding: "2px 0 8px 28px" }}>
                    {list.length === 0 ? (
                      <div style={{ fontSize: 13, color: C.muted, padding: "4px 0" }}>Chưa có nhân sự</div>
                    ) : list.map((e) => {
                      const p = busyPct(e);
                      return (
                        <div key={e.id} style={{ padding: "6px 0", borderBottom: `1px solid ${C.line}` }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                            <span style={{ fontSize: 13, flex: 1, minWidth: 0 }}>{e.name}</span>
                            <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                              <BusyBar p={p} />
                              <span style={{ fontFamily: MONO, fontSize: 11, color: "rgba(200,225,255,.75)", minWidth: 30, textAlign: "right" }}>{p}%</span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <div style={{ ...card, padding: 18 }}>
          <h3 style={{ marginTop: 0, fontSize: 15 }}>Điều động đang chạy</h3>
          {active.length === 0 && <div style={{ color: C.muted, fontSize: 14 }}>Chưa có điều động nào. Mở tab <b>Dự án</b> → <b>Gợi ý</b> để bắt đầu.</div>}
          {active.map((a) => {
            const e = empById[a.employeeId], p = projById[a.projectId];
            return (
              <div key={a.id} style={{ padding: "8px 0", borderBottom: `1px solid ${C.line}` }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14 }}>
                  <b>{e ? e.name : "?"}</b><span style={{ fontFamily: MONO, color: C.primary }}>{a.progress}%</span>
                </div>
                <div style={{ fontSize: 12, color: C.muted }}>{p ? `${p.name} · ${p.province}` : "Dự án đã xoá"}</div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ===================== EMPLOYEES ===================== */
function Employees({ employees, setEmployees, activeCount, avgQuality }) {
  const [edit, setEdit] = useState(null);
  const blank = { name: "", group: "Điện", province: DEFAULT_PROV, skill: 3, status: "available", note: "" };
  const save = (e) => {
    if (!e.name.trim()) return;
    if (e.id) setEmployees((arr) => arr.map((x) => (x.id === e.id ? e : x)));
    else setEmployees((arr) => [...arr, { ...e, id: uid() }]);
    setEdit(null);
  };
  const del = (id) => { if (confirm("Xoá nhân sự này?")) setEmployees((arr) => arr.filter((x) => x.id !== id)); };
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <h2 style={{ margin: 0, fontSize: 20 }}>Nhân sự</h2>
        <Btn variant="accent" onClick={() => setEdit(blank)}>+ Thêm nhân sự</Btn>
      </div>
      {GROUPS.map((g) => {
        const list = employees.filter((e) => e.group === g);
        if (!list.length) return null;
        return (
          <div key={g} style={{ marginBottom: 18 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <span style={{ width: 10, height: 10, borderRadius: 3, background: GROUP_COLOR[g] }} />
              <h3 style={{ margin: 0, fontSize: 15 }}>{g}</h3><span style={{ color: C.muted, fontSize: 13 }}>({list.length})</span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(240px,1fr))", gap: 10 }}>
              {list.map((e) => {
                const q = avgQuality(e.id), s = STATUS[e.status];
                return (
                  <div key={e.id} style={{ ...card, padding: 14 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                      <div style={{ fontWeight: 700, fontSize: 15 }}>{e.name}</div>
                      <Badge color={s.color} soft={s.soft}>{s.label}</Badge>
                    </div>
                    <div style={{ fontSize: 13, color: C.muted, margin: "6px 0" }}>📍 {e.province}</div>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13, color: C.muted }}>
                      <span>Tay nghề</span><Stars value={e.skill} size={14} />
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8, fontSize: 12 }}>
                      <span style={{ fontFamily: MONO, color: activeCount(e.id) >= 3 ? C.bad : C.muted }}>{activeCount(e.id)} việc đang làm</span>
                      <span style={{ color: C.muted }}>{q ? `CL ${q.toFixed(1)}★` : "chưa đánh giá"}</span>
                    </div>
                    <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
                      <Btn small variant="ghost" onClick={() => setEdit(e)}>Sửa</Btn>
                      <Btn small variant="danger" onClick={() => del(e.id)}>Xoá</Btn>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
      {edit && <EmpForm emp={edit} onSave={save} onClose={() => setEdit(null)} />}
    </div>
  );
}
function EmpForm({ emp, onSave, onClose }) {
  const [f, setF] = useState(emp);
  const up = (k, v) => setF((s) => ({ ...s, [k]: v }));
  return (
    <Modal title={emp.id ? "Sửa nhân sự" : "Thêm nhân sự"} onClose={onClose}>
      <Field label="Họ tên"><input style={inputStyle} value={f.name} onChange={(e) => up("name", e.target.value)} /></Field>
      <Field label="Tổ / chuyên môn"><select style={inputStyle} value={f.group} onChange={(e) => up("group", e.target.value)}>{GROUPS.map((g) => <option key={g}>{g}</option>)}</select></Field>
      <Field label="Nơi ở (tỉnh/thành — dùng để tính khoảng cách)"><ProvSelect value={f.province} onChange={(e) => up("province", e.target.value)} /></Field>
      <Field label="Tay nghề"><Stars value={f.skill} onChange={(v) => up("skill", v)} size={24} /></Field>
      <Field label="Trạng thái"><select style={inputStyle} value={f.status} onChange={(e) => up("status", e.target.value)}>
        {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select></Field>
      <Field label="Ghi chú"><input style={inputStyle} value={f.note} onChange={(e) => up("note", e.target.value)} /></Field>
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 6 }}>
        <Btn variant="ghost" onClick={onClose}>Huỷ</Btn><Btn onClick={() => onSave(f)}>Lưu</Btn>
      </div>
    </Modal>
  );
}

/* ===================== PROJECTS ===================== */
function Projects({ projects, setProjects, onDispatch }) {
  const [edit, setEdit] = useState(null);
  const blank = { name: "", customer: "", province: DEFAULT_PROV, type: "new", group: "Điện", priority: "normal", deadline: "", status: "open", note: "" };
  const save = (p) => {
    if (!p.name.trim()) return;
    if (p.id) setProjects((arr) => arr.map((x) => (x.id === p.id ? p : x)));
    else setProjects((arr) => [...arr, { ...p, id: uid() }]);
    setEdit(null);
  };
  const del = (id) => { if (confirm("Xoá dự án này?")) setProjects((arr) => arr.filter((x) => x.id !== id)); };
  const PRI = { high: { l: "Ưu tiên cao", c: C.bad }, normal: { l: "Bình thường", c: C.muted }, low: { l: "Thấp", c: C.good } };
  const PST = { open: { l: "Đang mở", c: C.primary }, in_progress: { l: "Đang làm", c: C.accent }, done: { l: "Hoàn thành", c: C.good } };
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <h2 style={{ margin: 0, fontSize: 20 }}>Dự án</h2>
        <Btn variant="accent" onClick={() => setEdit(blank)}>+ Thêm dự án</Btn>
      </div>
      {projects.length === 0 && <div style={{ ...card, padding: 24, color: C.muted }}>Chưa có dự án. Thêm dự án mới hoặc một việc sửa chữa để bắt đầu điều động.</div>}
      <div style={{ display: "grid", gap: 10 }}>
        {projects.map((p) => (
          <div key={p.id} style={{ ...card, padding: 16, display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center" }}>
            <div style={{ flex: 1, minWidth: 220 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <b style={{ fontSize: 16 }}>{p.name}</b>
                <Badge color={GROUP_COLOR[p.group]}>{p.group}</Badge>
                <Badge color={p.type === "repair" ? C.warn : C.primary}>{p.type === "repair" ? "Sửa chữa" : "Dự án mới"}</Badge>
              </div>
              <div style={{ fontSize: 13, color: C.muted, marginTop: 4 }}>
                {p.customer && `${p.customer} · `}📍 {p.province}{p.deadline && ` · hạn ${p.deadline}`}
              </div>
            </div>
            <Badge color={PRI[p.priority].c}>{PRI[p.priority].l}</Badge>
            <Badge color={PST[p.status].c} soft={PST[p.status].c + "18"}>{PST[p.status].l}</Badge>
            <div style={{ display: "flex", gap: 6 }}>
              <Btn small variant="accent" onClick={() => onDispatch(p.id)}>Gợi ý</Btn>
              <Btn small variant="ghost" onClick={() => setEdit(p)}>Sửa</Btn>
              <Btn small variant="danger" onClick={() => del(p.id)}>Xoá</Btn>
            </div>
          </div>
        ))}
      </div>
      {edit && <ProjForm proj={edit} onSave={save} onClose={() => setEdit(null)} />}
    </div>
  );
}
function ProjForm({ proj, onSave, onClose }) {
  const [f, setF] = useState(proj);
  const up = (k, v) => setF((s) => ({ ...s, [k]: v }));
  return (
    <Modal title={proj.id ? "Sửa dự án" : "Thêm dự án"} onClose={onClose}>
      <Field label="Tên dự án / công việc"><input style={inputStyle} value={f.name} onChange={(e) => up("name", e.target.value)} /></Field>
      <Field label="Khách hàng / nhà máy"><input style={inputStyle} value={f.customer} onChange={(e) => up("customer", e.target.value)} /></Field>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Field label="Tỉnh/thành"><ProvSelect value={f.province} onChange={(e) => up("province", e.target.value)} /></Field>
        <Field label="Loại"><select style={inputStyle} value={f.type} onChange={(e) => up("type", e.target.value)}><option value="new">Dự án mới</option><option value="repair">Sửa chữa</option></select></Field>
        <Field label="Cần tổ"><select style={inputStyle} value={f.group} onChange={(e) => up("group", e.target.value)}>{GROUPS.map((g) => <option key={g}>{g}</option>)}</select></Field>
        <Field label="Ưu tiên"><select style={inputStyle} value={f.priority} onChange={(e) => up("priority", e.target.value)}><option value="high">Cao</option><option value="normal">Bình thường</option><option value="low">Thấp</option></select></Field>
        <Field label="Hạn hoàn thành"><input type="date" style={inputStyle} value={f.deadline} onChange={(e) => up("deadline", e.target.value)} /></Field>
        <Field label="Trạng thái"><select style={inputStyle} value={f.status} onChange={(e) => up("status", e.target.value)}><option value="open">Đang mở</option><option value="in_progress">Đang làm</option><option value="done">Hoàn thành</option></select></Field>
      </div>
      <Field label="Mô tả công việc"><textarea style={{ ...inputStyle, minHeight: 60, resize: "vertical" }} value={f.note} onChange={(e) => up("note", e.target.value)} /></Field>
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <Btn variant="ghost" onClick={onClose}>Huỷ</Btn><Btn onClick={() => onSave(f)}>Lưu</Btn>
      </div>
    </Modal>
  );
}

/* ===================== DISPATCH (recommendation) ===================== */
function Dispatch({ projects, employees, assignments, setAssignments, settings, selProjId, setSelProjId }) {
  const open = projects.filter((p) => p.status !== "done");
  const proj = projects.find((p) => p.id === selProjId) || null;
  const recos = useMemo(() => recommend(proj, employees, assignments, settings), [proj, employees, assignments, settings]);
  const assignedIds = new Set(assignments.filter((a) => a.projectId === selProjId && a.status === "active").map((a) => a.employeeId));

  const assign = (eid) => {
    setAssignments((arr) => [...arr, { id: uid(), projectId: selProjId, employeeId: eid, startDate: today(), progress: 0, status: "active", quality: null, qualityNote: "" }]);
  };

  return (
    <div>
      <h2 style={{ margin: "0 0 14px", fontSize: 20 }}>Điều động & gợi ý</h2>
      <Field label="Chọn dự án cần điều người">
        <select style={inputStyle} value={selProjId || ""} onChange={(e) => setSelProjId(e.target.value || null)}>
          <option value="">— Chọn dự án —</option>
          {open.map((p) => <option key={p.id} value={p.id}>{p.name} · {p.province} · cần {p.group}</option>)}
        </select>
      </Field>
      {!proj && <div style={{ ...card, padding: 24, color: C.muted }}>Chọn một dự án để xem danh sách nhân sự phù hợp nhất, đã chấm điểm theo khoảng cách, khối lượng việc và tay nghề.</div>}
      {proj && (
        <>
          <div style={{ ...card, padding: 14, marginBottom: 12, background: C.primarySoft, borderColor: C.primary + "44", fontSize: 14 }}>
            Cần tổ <b>{proj.group}</b> tại <b>{proj.province}</b>. Trọng số hiện tại — gần: {settings.wProximity} · ít việc: {settings.wAvailability} · tay nghề: {settings.wSkill} (đổi ở tab Cài đặt).
          </div>
          {recos.length === 0 && <div style={{ ...card, padding: 20, color: C.muted }}>Không có nhân sự nào thuộc tổ <b>{proj.group}</b>.</div>}
          <div style={{ display: "grid", gap: 10 }}>
            {recos.map((r, i) => {
              const s = STATUS[r.emp.status], assigned = assignedIds.has(r.emp.id);
              return (
                <div key={r.emp.id} style={{ ...card, padding: 14, borderColor: i === 0 ? C.accent + "88" : C.line, borderWidth: i === 0 ? 2 : 1 }}>
                  <div style={{ display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
                    <div style={{ width: 44, textAlign: "center" }}>
                      <div style={{ fontFamily: MONO, fontSize: 22, fontWeight: 800, color: i === 0 ? C.accent : C.ink }}>{Math.round(r.score)}</div>
                      <div style={{ fontSize: 10, color: C.muted }}>điểm</div>
                    </div>
                    <div style={{ flex: 1, minWidth: 180 }}>
                      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                        <b style={{ fontSize: 16 }}>{r.emp.name}</b>
                        {i === 0 && <Badge color={C.accent} soft={C.warnSoft}>★ Đề xuất</Badge>}
                        <Badge color={s.color} soft={s.soft}>{s.label}</Badge>
                      </div>
                      <div style={{ fontSize: 12, color: C.muted, marginTop: 3, fontFamily: MONO }}>
                        📍 {r.emp.province} · {r.dist == null ? "?" : r.dist + " km"} · vận chuyển ~{fmtVND(r.transport)} · {r.active} việc · tay nghề {r.emp.skill}★
                      </div>
                      {/* equalizer of score components */}
                      <div style={{ display: "flex", height: 8, borderRadius: 4, overflow: "hidden", marginTop: 8, background: C.line }}>
                        <div title="Gần" style={{ width: `${r.parts.prox}%`, background: C.primary }} />
                        <div title="Ít việc" style={{ width: `${r.parts.avail}%`, background: C.good }} />
                        <div title="Tay nghề" style={{ width: `${r.parts.skill}%`, background: C.accent }} />
                      </div>
                      <div style={{ display: "flex", gap: 12, fontSize: 11, color: C.muted, marginTop: 4 }}>
                        <span><span style={{ color: C.primary }}>■</span> gần {Math.round(r.parts.prox)}</span>
                        <span><span style={{ color: C.good }}>■</span> ít việc {Math.round(r.parts.avail)}</span>
                        <span><span style={{ color: C.accent }}>■</span> tay nghề {Math.round(r.parts.skill)}</span>
                      </div>
                    </div>
                    <div>{assigned ? <Badge color={C.good} soft={C.goodSoft}>✓ Đã điều</Badge> : <Btn small onClick={() => assign(r.emp.id)}>Điều người này</Btn>}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

/* ===================== PROGRESS ===================== */
function Progress({ assignments, setAssignments, empById, projById }) {
  const active = assignments.filter((a) => a.status === "active");
  const setProg = (id, v) => setAssignments((arr) => arr.map((a) => (a.id === id ? { ...a, progress: v } : a)));
  const finish = (id) => setAssignments((arr) => arr.map((a) => (a.id === id ? { ...a, status: "done", progress: 100 } : a)));
  return (
    <div>
      <h2 style={{ margin: "0 0 14px", fontSize: 20 }}>Tiến độ công việc</h2>
      {active.length === 0 && <div style={{ ...card, padding: 24, color: C.muted }}>Không có công việc nào đang chạy.</div>}
      <div style={{ display: "grid", gap: 10 }}>
        {active.map((a) => {
          const e = empById[a.employeeId], p = projById[a.projectId];
          return (
            <div key={a.id} style={{ ...card, padding: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
                <div><b>{e ? e.name : "?"}</b> <span style={{ color: C.muted, fontSize: 13 }}>— {p ? p.name : "dự án đã xoá"} · 📍{p?.province}</span></div>
                <span style={{ fontFamily: MONO, color: C.muted, fontSize: 12 }}>từ {a.startDate}</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 12 }}>
                <input type="range" min="0" max="100" step="5" value={a.progress} onChange={(e2) => setProg(a.id, Number(e2.target.value))} style={{ flex: 1 }} />
                <span style={{ fontFamily: MONO, fontWeight: 700, width: 48, textAlign: "right", color: C.primary }}>{a.progress}%</span>
                <Btn small variant="accent" onClick={() => finish(a.id)} disabled={a.progress < 100}>Hoàn thành</Btn>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ===================== QUALITY ===================== */
function Quality({ assignments, setAssignments, empById, projById }) {
  const done = assignments.filter((a) => a.status === "done");
  const rate = (id, q) => setAssignments((arr) => arr.map((a) => (a.id === id ? { ...a, quality: q } : a)));
  const note = (id, t) => setAssignments((arr) => arr.map((a) => (a.id === id ? { ...a, qualityNote: t } : a)));
  return (
    <div>
      <h2 style={{ margin: "0 0 14px", fontSize: 20 }}>Đánh giá chất lượng</h2>
      {done.length === 0 && <div style={{ ...card, padding: 24, color: C.muted }}>Chưa có công việc hoàn thành để đánh giá.</div>}
      <div style={{ display: "grid", gap: 10 }}>
        {done.map((a) => {
          const e = empById[a.employeeId], p = projById[a.projectId];
          return (
            <div key={a.id} style={{ ...card, padding: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
                <div><b>{e ? e.name : "?"}</b> <span style={{ color: C.muted, fontSize: 13 }}>— {p ? p.name : "dự án đã xoá"}</span></div>
                <Stars value={a.quality || 0} onChange={(q) => rate(a.id, q)} size={22} />
              </div>
              <textarea placeholder="Nhận xét chất lượng, an toàn, thái độ…" value={a.qualityNote || ""} onChange={(ev) => note(a.id, ev.target.value)} style={{ ...inputStyle, minHeight: 48, marginTop: 10, resize: "vertical" }} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ===================== SETTINGS ===================== */
function Settings({ settings, setSettings, employees, projects, assignments, setEmployees, setProjects, setAssignments }) {
  const up = (k, v) => setSettings((s) => ({ ...s, [k]: v }));
  const sw = settings.wProximity + settings.wAvailability + settings.wSkill || 1;
  const Slider = ({ k, label, color }) => (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, fontWeight: 600, marginBottom: 4 }}>
        <span>{label}</span><span style={{ fontFamily: MONO, color }}>{Math.round((settings[k] / sw) * 100)}%</span>
      </div>
      <input type="range" min="0" max="10" value={settings[k]} onChange={(e) => up(k, Number(e.target.value))} style={{ width: "100%", accentColor: color }} />
    </div>
  );
  const reset = () => { if (confirm("Khôi phục dữ liệu mẫu? Toàn bộ dữ liệu hiện tại sẽ bị xoá.")) { setEmployees(seedEmployees()); setProjects([]); setAssignments([]); setSettings(DEFAULT_SETTINGS); } };
  const exportJson = () => {
    const blob = new Blob([JSON.stringify({ employees, projects, assignments, settings }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob); const a = document.createElement("a");
    a.href = url; a.download = "doi_thi_cong_backup.json"; a.click(); URL.revokeObjectURL(url);
  };
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
      <div style={{ ...card, padding: 20 }}>
        <h3 style={{ marginTop: 0, fontSize: 16 }}>Trọng số gợi ý điều động</h3>
        <p style={{ fontSize: 13, color: C.muted, marginTop: 0 }}>Quyết định điểm số ưu tiên ai. Tăng "ở gần" nếu muốn tiết kiệm chi phí đi lại; tăng "ít việc" để dàn đều khối lượng.</p>
        <Slider k="wProximity" label="Ở gần (ít chi phí vận chuyển)" color={C.primary} />
        <Slider k="wAvailability" label="Đang ít việc / sẵn sàng" color={C.good} />
        <Slider k="wSkill" label="Tay nghề cao" color={C.accent} />
      </div>
      <div style={{ ...card, padding: 20 }}>
        <h3 style={{ marginTop: 0, fontSize: 16 }}>Thông số</h3>
        <Field label="Chi phí vận chuyển ước tính (₫/km)"><input type="number" style={inputStyle} value={settings.costPerKm} onChange={(e) => up("costPerKm", Number(e.target.value))} /></Field>
        <Field label="Số việc tối đa / người (để tính mức bận)"><input type="number" style={inputStyle} value={settings.maxLoad} onChange={(e) => up("maxLoad", Number(e.target.value))} /></Field>
        <div style={{ borderTop: `1px solid ${C.line}`, marginTop: 8, paddingTop: 14, display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Btn variant="ghost" onClick={exportJson}>Tải sao lưu (.json)</Btn>
          <Btn variant="danger" onClick={reset}>Khôi phục dữ liệu mẫu</Btn>
        </div>
        <p style={{ fontSize: 12, color: C.muted }}>Dữ liệu được lưu tự động trên thiết bị/tài khoản của bạn.</p>
      </div>
    </div>
  );
}
