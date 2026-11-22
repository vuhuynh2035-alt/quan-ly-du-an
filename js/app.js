(function(){
"use strict";
var GROUPS_DEFAULT=["Hệ thống","Hàn","Điện","Máy trục vít","IQF","Cách nhiệt","Phụ việc","Giám sát","Chỉ huy trưởng","Điều hành","Hành chính"];
var EMP_GRP_ORDER=["Hệ thống","Hàn","Điện","Máy trục vít","IQF","Cách nhiệt","Phụ việc","Giám sát","Chỉ huy trưởng","Điều hành","Hành chính"];
var EMP_GRP_TAIL=["Giám sát","Chỉ huy trưởng","Điều hành","Hành chính"];
var GCOL={"Giám sát":"#6366f1","Chỉ huy trưởng":"#f59e0b","Điều hành":"#0ea5e9","Hành chính":"#14b8a6","Điện":"#f97316","Hàn":"#ef4444","Hệ thống":"#3b82f6","Máy trục vít":"#a855f7","IQF":"#06b6d4","Cách nhiệt":"#06b6d4","Phụ việc":"#6b7280"};
function isOversightGroup(g){return g==="Giám sát"||g==="Điều hành"}
function isOversightEmp(e){return !!(e&&isOversightGroup(e.group))}
function isAdminHrGroup(g){return g==="Hành chính"}
function isAdminHrEmp(e){return !!(e&&isAdminHrGroup(e.group))}
function isChiefGroup(g){return g==="Chỉ huy trưởng"}
function isChiefEmp(e){return !!(e&&isChiefGroup(e.group))}
/** Văn phòng / quản trị: không giao việc hiện trường, không chấm công hiện trường / KPI thi công. */
function isOfficeStaffGroup(g){return isOversightGroup(g)||isChiefGroup(g)||isAdminHrGroup(g)}
function isOfficeStaffEmp(e){return !!(e&&isOfficeStaffGroup(e.group))}
/** Phân công kiểm tra của Chỉ huy trưởng — không tính vào tiến độ / hoàn thành dự án. */
function isChiefAsgn(a){
  if(!a)return false;
  if(a.taskKind==="chief")return true;
  return isChiefEmp(eById(a.empId));
}
function asgnAffectsProjProgress(a){return !!(a&&!isChiefAsgn(a))}
function fieldGroups(){return getGroups().filter(function(g){return !isOfficeStaffGroup(g)})}
function fieldEmp(list){return staffEmp(list).filter(function(e){return !isOfficeStaffEmp(e)})}
function oversightEmpList(){
  return staffEmp().filter(isOversightEmp).sort(function(a,b){
    var ga=a.group||"",gb=b.group||"";
    if(ga!==gb)return ga==="Điều hành"?-1:gb==="Điều hành"?1:ga.localeCompare(gb,"vi");
    return (a.name||"").localeCompare(b.name||"","vi");
  });
}
function chiefEmpList(){
  return staffEmp().filter(isChiefEmp).sort(function(a,b){return (a.name||"").localeCompare(b.name||"","vi")});
}
function defaultFieldGroup(){var g=fieldGroups();return g[0]||"Điện"}
function filterFieldEmpIds(ids){
  return (ids||[]).filter(function(eid){var e=eById(eid);return e&&!isOfficeStaffEmp(e)});
}
var GCOL_EXTRA_PALETTE=["#ec4899","#14b8a6","#8b5cf6","#eab308","#22c55e","#f43f5e","#0ea5e9","#84cc16"];
function orderGroupsList(all){
  all=(all||[]).filter(Boolean);
  var ordered=[],tail=[];
  function isTail(g){return EMP_GRP_TAIL.indexOf(g)>=0}
  EMP_GRP_ORDER.forEach(function(g){if(all.indexOf(g)>=0&&!isTail(g))ordered.push(g)});
  all.forEach(function(g){if(ordered.indexOf(g)<0&&!isTail(g))ordered.push(g)});
  EMP_GRP_TAIL.forEach(function(g){if(all.indexOf(g)>=0)tail.push(g)});
  all.forEach(function(g){if(isTail(g)&&tail.indexOf(g)<0)tail.push(g)});
  return ordered.concat(tail);
}
function ensureCfgGroups(){
  if(!S.cfg.groupColors)S.cfg.groupColors={};
  if(!S.cfg.groups||!Array.isArray(S.cfg.groups)||!S.cfg.groups.length){S.cfg.groups=GROUPS_DEFAULT.slice();return}
  S.cfg.groups=S.cfg.groups.filter(function(g){return g&&g!=="Quản lý"});
  GROUPS_DEFAULT.forEach(function(g){if(S.cfg.groups.indexOf(g)<0)S.cfg.groups.push(g)});
  S.cfg.groups=orderGroupsList(S.cfg.groups);
}
function migrateWorkspace(){
  ensureCfgGroups();
  var changed=false;
  var dirs=S.emp.filter(function(e){return empAccountRole(e)==="director"});
  if(dirs.length){
    var d=dirs[0];
    if(!S.cfg.directorContact||!S.cfg.directorContact.uid){
      S.cfg=Object.assign({},S.cfg,{
        directorContact:{
          uid:d.authUid||"",
          name:d.name||"Giám đốc",
          username:d.loginKey||nameToLoginKey(d.name)
        }
      });
      changed=true;
    }
    S.emp=S.emp.filter(isStaffEmp);
    changed=true;
  }
  S.emp.forEach(function(e){
    if(e&&e.group==="Quản lý"){e.group="Giám sát";changed=true;}
  });
  if(S.cfg.groups&&S.cfg.groups.indexOf("Quản lý")>=0){
    S.cfg.groups=S.cfg.groups.filter(function(g){return g!=="Quản lý"});
    changed=true;
  }
  return changed;
}
function getGroups(){ensureCfgGroups();return S.cfg.groups||GROUPS_DEFAULT.slice()}
function empGroupOrder(){return orderGroupsList(getGroups())}
function groupColor(g){
  if(!g)return"#38bdf8";
  if(GCOL[g])return GCOL[g];
  if(S.cfg.groupColors&&S.cfg.groupColors[g])return S.cfg.groupColors[g];
  var h=0;for(var i=0;i<g.length;i++)h=((h<<5)-h)+g.charCodeAt(i);
  return GCOL_EXTRA_PALETTE[Math.abs(h)%GCOL_EXTRA_PALETTE.length];
}
function nextGroupColor(name){
  var used={};
  getGroups().forEach(function(g){used[groupColor(g)]=1});
  for(var i=0;i<GCOL_EXTRA_PALETTE.length;i++){if(!used[GCOL_EXTRA_PALETTE[i]])return GCOL_EXTRA_PALETTE[i]}
  var h=0;for(var j=0;j<(name||"").length;j++)h=((h<<5)-h)+(name||"").charCodeAt(j);
  return GCOL_EXTRA_PALETTE[Math.abs(h)%GCOL_EXTRA_PALETTE.length];
}
var DAYS=["Chủ nhật","Thứ Hai","Thứ Ba","Thứ Tư","Thứ Năm","Thứ Sáu","Thứ Bảy"];
var PROV_RAW=[["An Giang",10.52,105.13],["Bà Rịa - Vũng Tàu",10.54,107.24],["Bạc Liêu",9.29,105.72],["Bắc Giang",21.27,106.19],["Bắc Kạn",22.15,105.83],["Bắc Ninh",21.19,106.08],["Bến Tre",10.24,106.38],["Bình Dương",11.33,106.48],["Bình Định",13.78,109.22],["Bình Phước",11.75,106.72],["Bình Thuận",11.09,108.07],["Cà Mau",9.18,105.15],["Cần Thơ",10.05,105.75],["Cao Bằng",22.67,106.26],["Đà Nẵng",16.05,108.20],["Đắk Lắk",12.71,108.24],["Đắk Nông",12.00,107.69],["Điện Biên",21.39,103.02],["Đồng Nai",10.94,106.82],["Đồng Tháp",10.49,105.69],["Gia Lai",13.98,108.00],["Hà Giang",22.82,104.98],["Hà Nam",20.58,105.92],["Hà Nội",21.03,105.85],["Hà Tĩnh",18.36,105.89],["Hải Dương",20.94,106.31],["Hải Phòng",20.84,106.69],["Hậu Giang",9.76,105.64],["Hoà Bình",20.81,105.34],["Hưng Yên",20.65,106.05],["Khánh Hoà",12.24,109.20],["Kiên Giang",10.01,105.08],["Kon Tum",14.35,108.00],["Lai Châu",22.40,103.46],["Lâm Đồng",11.94,108.46],["Lạng Sơn",21.85,106.76],["Lào Cai",22.48,103.98],["Long An",10.70,106.24],["Nam Định",20.44,106.16],["Nghệ An",18.68,105.68],["Ninh Bình",20.25,105.97],["Ninh Thuận",11.56,108.99],["Phú Thọ",21.32,105.40],["Phú Yên",13.09,109.09],["Quảng Bình",17.47,106.62],["Quảng Nam",15.54,108.02],["Quảng Ngãi",15.12,108.79],["Quảng Ninh",21.01,107.29],["Quảng Trị",16.79,107.05],["Sóc Trăng",9.60,105.98],["Sơn La",21.10,103.73],["Tây Ninh",11.31,106.10],["Thái Bình",20.45,106.34],["Thái Nguyên",21.59,105.84],["Thanh Hoá",19.81,105.79],["Thừa Thiên Huế",16.46,107.59],["Tiền Giang",10.45,106.34],["TP. Hồ Chí Minh",10.82,106.63],["Trà Vinh",9.93,106.35],["Tuyên Quang",21.82,105.21],["Vĩnh Long",10.25,105.97],["Vĩnh Phúc",21.31,105.60],["Yên Bái",21.72,104.90]];
var PM={};PROV_RAW.forEach(function(p){PM[p[0]]={name:p[0],lat:p[1],lng:p[2]};});
var PROVS=PROV_RAW.map(function(p){return{name:p[0],lat:p[1],lng:p[2]};});
var DP="TP. Hồ Chí Minh";
var ST={available:{l:"Sẵn sàng",c:"#4ade80",s:"rgba(74,222,128,.15)"},busy:{l:"Đang bận",c:"#fbbf24",s:"rgba(251,191,36,.15)"},leave:{l:"Nghỉ",c:"#f87171",s:"rgba(248,113,113,.15)"}};
function leaveEndFrom(start,days){var n=Math.max(1,Math.round(Number(days)||1));return dAdd(start,n-1)}
/** Đơn xin nghỉ phép lịch sự gửi Giám đốc (tự động từ form). */
function composeLeaveRequestLetter(empName,start,days,reason){
  var name=String(empName||"").trim()||"nhân viên";
  var n=Math.max(1,Math.round(Number(days)||1));
  var end=leaveEndFrom(start,n);
  var why=String(reason||"").trim()||"…";
  if(!/[.!?…]$/.test(why))why+=".";
  return[
    "Kính gửi Ban Giám đốc,",
    "",
    "Tôi tên là "+name+", hiện đang công tác tại công ty.",
    "Tôi kính xin phép được nghỉ làm từ ngày "+dFmt(start)+" đến hết ngày "+dFmt(end)+" (tổng cộng "+n+" ngày).",
    "",
    "Lý do xin nghỉ: "+why,
    "",
    "Rất mong Ban Giám đốc xem xét và chấp thuận đơn xin nghỉ phép của tôi.",
    "Xin chân thành cảm ơn Ban Giám đốc đã quan tâm và hỗ trợ.",
    "",
    "Trân trọng,",
    name
  ].join("\n");
}
function composeLeaveApproveLetter(empName,start,end,days){
  var name=String(empName||"").trim()||"anh/chị";
  var n=Math.max(1,Math.round(Number(days)||1));
  return[
    "Kính gửi anh/chị "+name+",",
    "",
    "Ban Giám đốc đã nhận và xem xét đơn xin nghỉ phép của anh/chị từ ngày "+dFmt(start)+" đến hết ngày "+dFmt(end)+" ("+n+" ngày).",
    "",
    "Kết quả: Đồng ý cho anh/chị nghỉ phép theo đề nghị.",
    "",
    "Chúc anh/chị nghỉ ngơi tốt và trở lại làm việc đúng hạn.",
    "",
    "Trân trọng,",
    "Ban Giám đốc"
  ].join("\n");
}
function composeLeaveRejectLetter(empName,start,end,days,rejectReason){
  var name=String(empName||"").trim()||"anh/chị";
  var n=Math.max(1,Math.round(Number(days)||1));
  var why=String(rejectReason||"").trim()||"Điều kiện công việc hiện tại chưa cho phép";
  if(!/[.!?…]$/.test(why))why+=".";
  return[
    "Kính gửi anh/chị "+name+",",
    "",
    "Ban Giám đốc đã nhận và xem xét đơn xin nghỉ phép của anh/chị từ ngày "+dFmt(start)+" đến hết ngày "+dFmt(end)+" ("+n+" ngày).",
    "",
    "Rất tiếc, đơn xin nghỉ phép chưa được chấp thuận trong đợt này.",
    "Lý do: "+why,
    "",
    "Đề nghị anh/chị tiếp tục làm việc theo lịch hiện tại. Khi điều kiện cho phép, anh/chị vui lòng nộp lại đơn vào thời điểm thích hợp.",
    "",
    "Trân trọng,",
    "Ban Giám đốc"
  ].join("\n");
}
function leaveLetterPreviewHTML(){
  var me=eById(S.auth&&S.auth.empId);
  var start=(document.getElementById("leave-start")||{}).value||td();
  var days=Math.max(1,Math.round(Number((document.getElementById("leave-days")||{}).value||1)));
  var reason=((document.getElementById("leave-reason")||{}).value||"").trim();
  return composeLeaveRequestLetter(me?me.name:"",start,days,reason||"(chưa nhập lý do)");
}
function isEmpOnLeave(e){
  if(!e)return false;
  var t=td();
  if(e.leaveStart&&e.leaveEnd&&t>=e.leaveStart&&t<=e.leaveEnd)return true;
  if(e.leaveStart&&e.leaveEnd&&t>e.leaveEnd)return false;
  return e.status==="leave";
}
function empLeaveLabel(e){
  if(!e)return"";
  if(e.leaveStart&&e.leaveEnd){
    var t=td();
    if(t<=e.leaveEnd)return"Nghỉ phép từ "+dFmt(e.leaveStart)+" đến "+dFmt(e.leaveEnd);
  }
  if(e.status==="leave")return"Nghỉ";
  return"";
}
function empStatusInfo(e){
  if(isEmpOnLeave(e)){
    var lbl=empLeaveLabel(e)||"Nghỉ phép";
    return{l:lbl,c:"#f87171",s:"rgba(248,113,113,.15)",key:"leave"};
  }
  return ST[e&&e.status]||ST.available;
}
function leaveReqById(id){return(S.leaveReqs||[]).find(function(r){return r&&r.id===id})||null}
function pendingLeaveReqs(){return(S.leaveReqs||[]).filter(function(r){return r&&r.status==="pending"})}
function syncEmpLeaveStatuses(){
  if(!canOperate())return;
  var changed=0;
  (S.emp||[]).forEach(function(e){
    if(!e||!e.leaveStart||!e.leaveEnd)return;
    var t=td();
    if(t>=e.leaveStart&&t<=e.leaveEnd){
      if(e.status!=="leave"){e.status="leave";changed=1;}
    }else if(t>e.leaveEnd&&e.status==="leave"){
      e.status="available";
      e.leaveStart="";e.leaveEnd="";
      changed=1;
    }
  });
  if(changed)sv();
}
var SEED={"Điện":["Phương","Khoa"],"Hàn":["Hận","Bình","Thoàn","Hiếu"],"Hệ thống":["Liền","Nhu","Tú Nguyên","Sơn Thi"],"Máy trục vít":["Khanh"],"IQF":["Lohl"],"Phụ việc":["A"]};
var DS={wP:4,wA:4,wS:2,cpk:8000,ml:3,wb:"auto",theme:"dark",stdWorkDaysMonth:26,company:{name:"",address:"",website:"",phone:"",email:"",custom:[]}};
function ensureCompanyInfo(){
  if(!S.cfg)S.cfg=Object.assign({},DS);
  var c=S.cfg.company;
  if(!c||typeof c!=="object")c={};
  S.cfg.company={
    name:String(c.name||""),
    address:String(c.address||""),
    website:String(c.website||""),
    phone:String(c.phone||""),
    email:String(c.email||""),
    custom:Array.isArray(c.custom)?c.custom.filter(function(f){return f&&f.label}).map(function(f){
      return{id:f.id||uid(),label:String(f.label||"").trim(),value:String(f.value||"")};
    }):[]
  };
  return S.cfg.company;
}
function companyWebsiteHref(url){
  var u=String(url||"").trim();
  if(!u)return"";
  if(/^https?:\/\//i.test(u))return u;
  return"https://"+u;
}
var APP_BUILD=+(document.querySelector('meta[name="app-build"]')?.getAttribute("content")||0);
var VER_MAJOR=1;
var VER_TAG="-HP";
function isLocalDev(){var h=location.hostname;return h==="localhost"||h==="127.0.0.1"||h==="[::1]"}
function loadPatch(){return loadWs("cv3_patch",0);}
function remotePatchHint(){
  try{
    if(typeof window.__CV3_getRemotePatch==="function")return window.__CV3_getRemotePatch()||0;
  }catch(e){}
  return 0;
}
function bumpPatch(){
  // Luôn vượt patch cloud — tránh sau đổi đội patch local = 0 thì không ghi được / bị remote ghi đè
  var p=Math.max(loadPatch()||0, remotePatchHint()||0)+1;
  ps2Ws("cv3_patch",p);
  return p;
}
function appUrl(p){return(window.__APP_BASE__||"/")+p;}
function verStr(){return"v"+VER_MAJOR+"."+String(APP_BUILD).padStart(3,"0")+VER_TAG;}
function checkAppUpdate(){
  if(isLocalDev())return;
  fetch(appUrl("app-version.json?_="+Date.now()),{cache:"no-store"}).then(function(r){return r.ok?r.json():null}).then(function(v){
    if(!v||typeof v.build!=="number"||v.build<=APP_BUILD)return;
    if(document.getElementById("update-bar"))return;
    var bar=document.createElement("div");
    bar.id="update-bar";
    bar.style.cssText="position:fixed;bottom:max(12px,env(safe-area-inset-bottom));left:50%;transform:translateX(-50%);z-index:9999;padding:12px 18px;border-radius:12px;background:linear-gradient(135deg,#1a6fd4,#0d4fa0);color:#fff;font-size:14px;box-shadow:0 8px 24px rgba(0,0,0,.35);display:flex;gap:14px;align-items:center;flex-wrap:wrap;max-width:min(96vw,420px)";
    var tag=(v.tag?("-"+v.tag):VER_TAG);
    bar.innerHTML='<span>🚀 Đã có phiên bản cập nhật <b>v'+VER_MAJOR+"."+String(v.build).padStart(3,"0")+tag+'</b>!</span><button type="button" class="btn btn-accent btn-sm" style="background:#4ade80;color:#000" onclick="window.location.href=window.location.href.split(\'?\')[0]+\'?_v=\'+Date.now()">Tải lại trang</button>';
    document.body.appendChild(bar);
  }).catch(function(){});
}
setInterval(checkAppUpdate, 300000);
document.addEventListener("visibilitychange", function() {
  if(!document.hidden){
    checkAppUpdate();
    if(typeof updateRemindBadge==="function")updateRemindBadge();
  }
});
function uid(){return Math.random().toString(36).slice(2,8)}
function td(){
  var d=new Date();
  var offset=d.getTimezoneOffset();
  var local=new Date(d.getTime()-(offset*60*1000));
  return local.toISOString().slice(0,10);
}
function esc(s){return String(s==null?"":s).replace(/[&<>"']/g,function(c){return{"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]})}
function pco(s){if(!s)return null;s=s.trim();var m=s.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);if(m)return{lat:parseFloat(m[1]),lng:parseFloat(m[2])};m=s.match(/^\s*(-?\d{1,2}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)\s*$/);if(m)return{lat:parseFloat(m[1]),lng:parseFloat(m[2])};return null}
function nameToLoginKey(name){var s=String(name||"").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/đ/g,"d").replace(/\s+/g,"");return s.replace(/[^a-z0-9._-]/g,"")}
function empLoginKey(e){return e.loginKey||nameToLoginKey(e.name)}
function empNeedsProvision(e){return !e.authUid&&empLoginKey(e).length>=2}
function maybeTriggerProvision(){
  if(!canManageStaff())return;
  if(typeof window.__CV3_provisionAllEmployees!=="function")return;
  if(S.emp.some(empNeedsProvision))window.__CV3_provisionAllEmployees();
}
function empAccountRole(e){return e.accountRole==="director"?"director":"employee"}
function isStaffEmp(e){return empAccountRole(e)!=="director"}
function staffEmp(list){return (list||S.emp).filter(isStaffEmp)}
function directorChatRecipient(){
  var c=S.cfg&&S.cfg.directorContact;
  if(c&&c.uid)return {empId:"director",uid:c.uid,name:c.name||c.username||"Giám đốc",group:"Giám đốc",isDir:true,hasAccount:true,pending:false};
  var d=S.emp.find(function(e){return empAccountRole(e)==="director"&&e.authUid});
  if(d)return {empId:d.id,uid:d.authUid,name:d.name,group:"Giám đốc",isDir:true,hasAccount:true,pending:false};
  return null;
}
function hanhChinhChatRecipients(){
  return staffEmp().filter(function(e){return isAdminHrEmp(e)&&e.authUid}).map(function(e){
    return{empId:e.id,uid:e.authUid,name:e.name||"Hành chính",group:"Hành chính",isDir:false,hasAccount:true,pending:false};
  });
}
/** Giám đốc + Hành chính nhận đơn nghỉ phép / phê duyệt. */
function leaveNotifyRecipients(extra){
  var map={},list=[];
  function add(r){
    if(!r||!r.uid||map[r.uid])return;
    map[r.uid]=1;list.push(r);
  }
  add(directorChatRecipient());
  hanhChinhChatRecipients().forEach(add);
  (extra||[]).forEach(add);
  return list;
}
function leaveRoomKey(reqId){return "leave:"+String(reqId||"").trim()}
function isLeaveChatTo(chatTo){return !!(chatTo&&String(chatTo).indexOf("leave:")===0)}
function leaveIdFromChatTo(chatTo){return isLeaveChatTo(chatTo)?String(chatTo).slice(6):""}
/** Tin DM cũ gắn nghỉ phép — không còn hiện thành khung chat 1–1. */
function isLeaveRelatedDm(m){
  if(!m||m.type!=="dm")return false;
  if(m.leaveReqId)return true;
  var k=String(m.kind||"");
  return k==="leave_req"||k==="leave_decision";
}
function leaveRoomParticipants(req,extraUids){
  var map={},list=[];
  function addUid(u){
    u=String(u||"").trim();
    if(!u||map[u])return;
    map[u]=1;list.push(u);
  }
  if(req&&Array.isArray(req.roomParticipants))req.roomParticipants.forEach(addUid);
  if(req&&req.uid)addUid(req.uid);
  leaveNotifyRecipients(req&&req.uid?[{uid:req.uid,name:req.empName||""}]:[]).forEach(function(r){addUid(r.uid)});
  (extraUids||[]).forEach(addUid);
  if(S.auth&&S.auth.uid)addUid(S.auth.uid);
  list.sort();
  return list;
}
function notifyLeaveRoom(text,req,kind){
  if(!req||!req.id)return Promise.resolve();
  var participants=leaveRoomParticipants(req);
  if(participants.length<2)return Promise.resolve();
  if(typeof window.__CV3_sendChat!=="function"){
    S.chat=(S.chat||[]).concat([{
      id:uid(),text:text,type:"leave",kind:kind||"leave_chat",leaveReqId:req.id,
      threadId:leaveRoomKey(req.id),participants:participants,
      uid:(S.auth&&S.auth.uid)||"",fromName:(S.auth&&(S.auth.displayName||S.auth.username))||"",
      role:(S.auth&&S.auth.role)||"employee",at:new Date().toISOString(),
      _orgId:req._orgId||currentOrgId()
    }]);
    return Promise.resolve();
  }
  return window.__CV3_sendChat(text,{
    type:"leave",
    leaveReqId:req.id,
    participants:participants,
    kind:kind||"leave_chat",
    forOrg:req._orgId||""
  }).catch(function(err){console.warn("leave room",err);});
}
/** @deprecated — giữ tương thích local fallback cũ; ưu tiên notifyLeaveRoom. */
function notifyLeaveChat(text,recipients,kind,leaveReqId){
  var req=leaveReqById(leaveReqId)||{id:leaveReqId,uid:(S.auth&&S.auth.uid)||"",roomParticipants:(recipients||[]).map(function(r){return r.uid}).concat([(S.auth&&S.auth.uid)||""])};
  return notifyLeaveRoom(text,req,kind);
}
function empRoleLabel(e){
  if(empAccountRole(e)==="director")return "Giám đốc";
  if(e&&e.group==="Điều hành")return "Điều hành";
  if(e&&e.group==="Giám sát")return "Giám sát";
  if(e&&e.group==="Chỉ huy trưởng")return "Chỉ huy trưởng";
  if(e&&e.group==="Hành chính")return "Hành chính";
  return "Nhân viên";
}
function isDir(){return S.auth&&S.auth.role==="director"}
function isEmp(){return S.auth&&S.auth.role==="employee"}
function currentEmpGroup(){
  if(S.auth&&S.auth.empGroup)return S.auth.empGroup;
  var e=currentEmp();
  return e&&e.group?e.group:"";
}
function staffLevel(){
  if(isDir())return "operate";
  var g=currentEmpGroup();
  if(g==="Điều hành")return "operate";
  if(g==="Giám sát")return "supervise";
  if(g==="Chỉ huy trưởng")return "chief";
  if(g==="Hành chính")return "admin_hr";
  return "";
}
function hasFullUI(){
  // Offline / chưa đăng nhập cloud: quyền local đã bypass qua __CV3_SKIP_SEED — cần full tab (cfg) thay vì EMP trống.
  if(!window.__CV3_SKIP_SEED&&!(S.auth&&S.auth.role))return true;
  return staffLevel()==="operate"||staffLevel()==="supervise";
}
function canOperate(){return staffLevel()==="operate"}
function isSuperviseOnly(){return staffLevel()==="supervise"}
function isChiefOnly(){return staffLevel()==="chief"}
function isAdminHr(){return staffLevel()==="admin_hr"}
function hasOversightView(){var lv=staffLevel();return lv==="operate"||lv==="supervise"||lv==="chief"}
/** Chỉ giám đốc: hồ sơ nhân sự, tổ/nhóm, trưởng nhóm/thủ kho dự án, đánh giá chất lượng, chấm công công ty. */
function canManageStaff(){if(!window.__CV3_SKIP_SEED)return true;return isDir()}
/** Dữ liệu nhạy cảm công ty (sửa KH, đánh giá sao, thùng rác…). */
function canViewSensitive(){if(!window.__CV3_SKIP_SEED)return true;return isDir()}
/** Tab/danh sách nhân sự + khối Chuyên môn Tổng quan: giám đốc + Điều hành (+ Hành chính xem danh sách). */
function canViewEmpTab(){if(!window.__CV3_SKIP_SEED)return true;return canOperate()||isAdminHr()}
/** Xem danh sách khách hàng: giám đốc + Điều hành (ẩn với Giám sát). */
function canViewCust(){if(!window.__CV3_SKIP_SEED)return true;return canOperate()}
/** Đánh giá / KPI: chỉ giám đốc (ẩn với Điều hành / Giám sát). */
function canViewQual(){if(!window.__CV3_SKIP_SEED)return true;return canViewSensitive()}
/** Lịch sử thao tác / thùng rác: chỉ giám đốc. */
function canViewHist(){if(!window.__CV3_SKIP_SEED)return true;return canViewSensitive()}
/** Sửa/xoá khách hàng: chỉ giám đốc. */
function canManageCust(){if(!window.__CV3_SKIP_SEED)return true;return isDir()}
/** Dùng Lịch hẹn: giám đốc (chung) hoặc cấp nhóm quản trị phần việc (Điều hành/Giám sát/Chỉ huy trưởng). */
function canUseLich(){if(!window.__CV3_SKIP_SEED)return true;return isDir()||hasOversightView()}
/** Tiến độ chung / Gantt dự án: Giám đốc, Điều hành, Giám sát, Chỉ huy trưởng. Nhân viên chỉ xem công việc của mình. */
function canViewSharedProg(){if(!window.__CV3_SKIP_SEED)return true;return hasOversightView()}
/** Sơ đồ: giám đốc, Điều hành, Chỉ huy trưởng (Giám sát không có quyền vào tab này). */
function canViewMap(){if(!window.__CV3_SKIP_SEED)return true;return canOperate()||isChiefOnly()}
/** Chấm công toàn công ty / tính lương: giám đốc + Hành chính. */
function canViewAttCompany(){if(!window.__CV3_SKIP_SEED)return true;return isDir()||isAdminHr()}
/** Theo dõi nghỉ phép trên Tổng quan (ô thống kê): GD + Hành chính. */
function canViewLeaveOverview(){
  if(!window.__CV3_SKIP_SEED)return true;
  return isDir()||isAdminHr();
}
/** Xin nghỉ phép (form gửi giám đốc): NV + DH + GS + HC + CHT. */
function canRequestLeave(){
  if(!window.__CV3_SKIP_SEED)return true;
  if(isDir())return false;
  return !!(S.auth&&S.auth.empId&&(isEmp()||isAdminHr()||canOperate()||isSuperviseOnly()||isChiefOnly()));
}
/** Lịch hẹn cá nhân — độc lập theo uid, không đồng bộ workspace. */
function usesPersonalReminders(){if(!window.__CV3_SKIP_SEED)return false;return (hasOversightView()||isEmpPortal()||isAdminHr())&&!isDir()}
function isEmpPortal(){return isEmp()&&(staffLevel()===""||isChiefOnly())}
/** Nhân viên thường (portal) — không gồm Chỉ huy trưởng (có thêm tab giám sát). */
function isFieldPortal(){return isEmpPortal()&&!isChiefOnly()}
function tabAllowed(t){
  if(isFieldPortal())return empTabOk(t);
  if(t==="map"&&!canViewMap())return false;
  if(t==="emp"&&!canViewEmpTab())return false;
  if(t==="cust"&&!canViewCust())return false;
  if(t==="qual"&&!canViewQual())return false;
  if(t==="hist"&&!canViewHist())return false;
  if(t==="lich"&&!canUseLich())return false;
  if(t==="prog"&&!canViewSharedProg())return false;
  return rawTabs().some(function(x){return x[0]===t;});
}
function dirGuard(){
  if(canOperate())return true;
  if(isSuperviseOnly())alert("Nhóm Giám sát không có quyền điều hành / giao việc.");
  else alert("Chỉ giám đốc hoặc Điều hành mới được thực hiện thao tác này.");
  return false;
}
function staffGuard(){
  if(canManageStaff())return true;
  if(canOperate())alert("Chỉ giám đốc được tạo/sửa hồ sơ nhân sự, tổ nhóm và phân chức vụ dự án (trưởng nhóm / thủ kho).");
  else if(isSuperviseOnly())alert("Nhóm Giám sát không có quyền quản lý nhân sự.");
  else alert("Chỉ giám đốc mới được thực hiện thao tác này.");
  return false;
}
function sensitiveGuard(){
  if(canViewSensitive())return true;
  alert("Chỉ giám đốc được thực hiện thao tác này.");
  return false;
}
function custViewGuard(){
  if(canViewCust())return true;
  return false;
}
function custManageGuard(){
  if(canManageCust())return true;
  alert("Chỉ giám đốc được thêm/sửa/xoá khách hàng.");
  return false;
}
function lichGuard(){
  if(canUseLich())return true;
  return false;
}
function canGiao(){if(!window.__CV3_SKIP_SEED)return true;return canOperate()}
function giaoGuard(){
  if(canGiao())return true;
  if(isSuperviseOnly())alert("Nhóm Giám sát không được giao việc cho nhân viên.");
  else alert("Chỉ giám đốc hoặc Điều hành mới được giao việc.");
  return false;
}
function personalRemindKey(){
  var uid=S.auth&&S.auth.uid;
  return uid?"cv3_pr_"+uid:"cv3_pr_anon";
}
function loadPersonalRemindersForAuth(){
  if(!usesPersonalReminders()){S.personalReminders=[];return;}
  var list=load(personalRemindKey(),[]);
  S.personalReminders=Array.isArray(list)?list:[];
}
function savePersonalReminders(){
  if(!usesPersonalReminders())return;
  ps2(personalRemindKey(),S.personalReminders||[]);
}
function myRemindList(){
  if(usesPersonalReminders())return S.personalReminders||[];
  return S.reminders||[];
}
function persistMyReminds(){
  if(usesPersonalReminders())savePersonalReminders();
  else{ps2Ws("cv3_r",S.reminders||[]);bumpPatch();if(canOperate()&&_fbSv)_fbSv();}
}
function findMyRemind(id){return myRemindList().find(function(r){return r.id===id})||null}
function replaceMyRemind(id,next){
  if(usesPersonalReminders()){
    S.personalReminders=(S.personalReminders||[]).map(function(r){return r.id===id?next:r});
  }else{
    S.reminders=(S.reminders||[]).map(function(r){return r.id===id?next:r});
  }
  persistMyReminds();
}
function removeMyRemind(id){
  if(usesPersonalReminders())S.personalReminders=(S.personalReminders||[]).filter(function(r){return r.id!==id});
  else S.reminders=(S.reminders||[]).filter(function(r){return r.id!==id});
  persistMyReminds();
}
function pushMyRemind(r){
  if(usesPersonalReminders()){
    S.personalReminders=S.personalReminders||[];
    r.ownerUid=S.auth&&S.auth.uid||"";
    r.personal=true;
    S.personalReminders.push(r);
  }else{
    S.reminders=S.reminders||[];
    S.reminders.push(r);
  }
  persistMyReminds();
}
function seedE(){var o=[];GROUPS_DEFAULT.forEach(function(g){(SEED[g]||[]).forEach(function(n){o.push({id:uid(),name:n,group:g,province:DP,skill:3,status:"available",note:"",lastLoc:null,loginKey:nameToLoginKey(n)});});});return o}
function mkProj(name,group,province,opts){opts=opts||{};return{id:uid(),name:name,group:group,province:province,type:"new",priority:"normal",status:opts.status||"in_progress",startDate:opts.startDate||"",deadline:opts.deadline||"",note:"",custId:"",participantIds:[],toTruongId:"",vatTuId:""}}
function projPartIds(p){
  if(!p)return[];
  var ids;
  if(p.participantIds&&p.participantIds.length)ids=p.participantIds.slice();
  else{
    ids=[];
    S.asgn.filter(function(a){return a.projId===p.id&&(a.status==="active"||a.status==="paused")}).forEach(function(a){if(ids.indexOf(a.empId)<0)ids.push(a.empId)});
  }
  return filterFieldEmpIds(ids);
}
function projRoleOf(empId,p){if(!p||!empId)return"";if(p.toTruongId===empId)return"to_truong";if(p.vatTuId===empId)return"vat_tu";return""}
function projRoleName(role){if(role==="to_truong")return"Trưởng nhóm";if(role==="vat_tu")return"Thủ kho";return""}
function projRoleRank(role){return role==="to_truong"?0:role==="vat_tu"?1:2}
function stripEmpProjRoles(proj,empId){
  if(!proj||!empId)return false;
  var oldTT=proj.toTruongId||"",oldVT=proj.vatTuId||"",ch=false;
  if(proj.toTruongId===empId){proj.toTruongId="";ch=true}
  if(proj.vatTuId===empId){proj.vatTuId="";ch=true}
  if(ch)logTeamRoleChanges(proj,oldTT,oldVT);
  return ch;
}
function projRolesSummaryHTML(p){
  if(!p)return "";
  var tt=p.toTruongId?eById(p.toTruongId):null,vt=p.vatTuId?eById(p.vatTuId):null;
  if(!tt&&!vt)return "";
  var h='<div class="row" style="gap:8px;flex-wrap:wrap;margin-bottom:10px">';
  if(tt)h+=bdg("Trưởng nhóm: "+esc(tt.name),"#fbbf24","rgba(251,191,36,.15)");
  if(vt)h+=bdg("Thủ kho: "+esc(vt.name),"#4ade80","rgba(74,222,128,.15)");
  return h+"</div>";
}
function normProjTeam(p,partIds,toTruong,vatTu){partIds=filterFieldEmpIds(partIds||[]);toTruong=toTruong||"";vatTu=vatTu||"";if(toTruong&&isOversightEmp(eById(toTruong)))toTruong="";if(vatTu&&isOversightEmp(eById(vatTu)))vatTu="";if(!canAssignProjRoles(partIds.length)){toTruong="";vatTu="";}if(toTruong&&partIds.indexOf(toTruong)<0)toTruong="";if(vatTu&&partIds.indexOf(vatTu)<0)vatTu="";return{participantIds:partIds,toTruongId:toTruong,vatTuId:vatTu}}
function applyProjTeam(p,partIds,toTruong,vatTu){var t=normProjTeam(p,partIds,toTruong,vatTu);p.participantIds=t.participantIds;p.toTruongId=t.toTruongId;p.vatTuId=t.vatTuId;return p}
function initGiaoTeamState(id){
  var p=pById(id);if(!p)return;
  S.giaoPick={};
  S.giaoItemStaff={};
  var items=normWorkItems(p);
  items.forEach(function(w){S.giaoItemStaff[w.id]={}});
  projPartIds(p).forEach(function(eid){S.giaoPick[eid]=true});
  (S.asgn||[]).forEach(function(a){
    if(a.projId!==p.id)return;
    if(a.status!=="active"&&a.status!=="paused"&&a.status!=="queued")return;
    if(isChiefAsgn(a))return;
    if(!a.empId)return;
    S.giaoPick[a.empId]=true;
  });
  // % gõ tay đã lưu — giữ cố định khi mở lại
  var manual={};
  (S.asgn||[]).forEach(function(a){
    if(a.projId!==p.id)return;
    if(a.status!=="active"&&a.status!=="paused"&&a.status!=="queued")return;
    if(isChiefAsgn(a)||!a.empId||!a.loadPctManual)return;
    var wid=a.workItemId;
    if(!wid&&items.length===1)wid=items[0].id;
    if(!wid)return;
    manual[a.empId+"|"+wid]=a.loadPct!=null&&a.loadPct!==""?a.loadPct:"";
  });
  // Mặc định: gán HẾT hạng mục cho mọi NV trong đội, chia đều (ô trống = auto)
  Object.keys(S.giaoPick).forEach(function(eid){
    if(!S.giaoPick[eid])return;
    items.forEach(function(w){
      var key=eid+"|"+w.id;
      if(Object.prototype.hasOwnProperty.call(manual,key)&&manual[key]!==""){
        S.giaoItemStaff[w.id][eid]={pct:manual[key]};
      }else{
        S.giaoItemStaff[w.id][eid]={pct:""};
      }
    });
  });
  S.teamToTruong=p.toTruongId||"";
  S.teamVatTu=p.vatTuId||"";
}
function initGiaoAssignState(id){var p=pById(id);if(!p)return;S.giaoPick={};S.giaoSched={};S.giaoWarn={};S.giaoArriveAt="";S.teamToTruong=p.toTruongId||"";S.teamVatTu=p.vatTuId||""}
function giaoEffectivePartIds(p){var ids=projPartIds(p).slice();curGiaoPartIds().forEach(function(eid){if(ids.indexOf(eid)<0)ids.push(eid)});return ids}
function projActiveAsgnEmpIds(p){
  var ids={},out=[];
  if(!p)return out;
  (S.asgn||[]).forEach(function(a){
    if(a.projId===p.id&&(a.status==="active"||a.status==="paused"||a.status==="queued")&&a.empId&&!ids[a.empId]){
      ids[a.empId]=1;out.push(a.empId);
    }
  });
  return out;
}
/** Tạo phân công active nếu nhân viên chưa có việc trên dự án.
 *  Bố trí vào đội = đã giao việc: gán tất cả hạng mục, % chia đều. */
function ensureActiveAsgn(p,empId,opts){
  opts=opts||{};
  if(!p||!empId)return null;
  var emp=eById(empId);
  if(!emp||isOversightEmp(emp)||isAdminHrEmp(emp))return null;
  var existing=(S.asgn||[]).find(function(a){return a.projId===p.id&&a.empId===empId&&(a.status==="active"||a.status==="paused"||a.status==="queued")});
  if(existing)return existing;
  var dates=asgnDates(p);
  // Chỉ huy trưởng: việc kiểm tra riêng, không vào hạng mục thi công
  if(isChiefEmp(emp)){
    var naCh=mkAsgn(empId,p.id,0,{
      startDate:opts.startDate||dates.start,
      endDate:opts.endDate||dates.end,
      workContent:opts.workContent||"Kiểm tra / báo cáo tình trạng thi công",
      taskKind:"chief",
      status:"active"
    });
    S.asgn.push(naCh);
    recordAssign(p.id,emp,naCh,opts.logNote||" (kiểm tra Chỉ huy trưởng)");
    applyProjLocToEmp(emp,p,naCh.startDate);
    return naCh;
  }
  var items=normWorkItems(p);
  var first=null;
  if(!items.length){
    first=mkAsgn(empId,p.id,0,{
      startDate:opts.startDate||dates.start,
      endDate:opts.endDate||dates.end,
      workContent:opts.workContent||"",
      status:"active"
    });
    S.asgn.push(first);
    recordAssign(p.id,emp,first,opts.logNote||"");
  }else{
    var itemStaff={};
    items.forEach(function(w){
      itemStaff[w.id]={};
      itemStaff[w.id][empId]={pct:""};
    });
    var norm=normalizeEmpItemLoads(items,itemStaff);
    items.forEach(function(w){
      var pct=norm[w.id]&&norm[w.id][empId]?Number(norm[w.id][empId].pct)||0:0;
      if(pct<=0)return;
      var unlocked=workItemUnlocked(p,w.id);
      var na=mkAsgn(empId,p.id,0,{
        startDate:opts.startDate||dates.start,
        endDate:opts.endDate||dates.end,
        workContent:opts.workContent||w.title||"",
        workItemId:w.id,
        loadPct:pct,
        status:unlocked?"active":"queued"
      });
      S.asgn.push(na);
      if(!first)first=na;
    });
    if(first){
      recordAssign(p.id,emp,first,(opts.logNote||"")+(items.length>1?" · "+items.length+" hạng mục":""));
    }
  }
  if(!first)return null;
  applyProjLocToEmp(emp,p,first.startDate);
  var parts=projPartIds(p).slice();
  if(parts.indexOf(empId)<0){
    parts.push(empId);
    applyProjTeam(p,parts,p.toTruongId,p.vatTuId);
  }
  if(p.status==="open")p.status="in_progress";
  return first;
}
function ensureRoleHoldersHaveAsgn(p){
  if(!p)return 0;
  var n=0;
  if(p.toTruongId){
    var had=projActiveAsgnEmpIds(p).indexOf(p.toTruongId)>=0;
    ensureActiveAsgn(p,p.toTruongId,{logNote:" (trưởng nhóm)"});
    if(!had)n++;
  }
  if(p.vatTuId&&p.vatTuId!==p.toTruongId){
    var had2=projActiveAsgnEmpIds(p).indexOf(p.vatTuId)>=0;
    ensureActiveAsgn(p,p.vatTuId,{logNote:" (thủ kho)"});
    if(!had2)n++;
  }
  return n;
}
/** Bố trí vào dự án = đã giao việc: tạo phân công cho mọi thành viên đội chưa có việc. */
function ensureTeamHaveAsgn(p){
  if(!p)return 0;
  var n=0;
  projPartIds(p).forEach(function(eid){
    var had=projActiveAsgnEmpIds(p).indexOf(eid)>=0;
    ensureActiveAsgn(p,eid,{logNote:" (bố trí dự án)"});
    if(!had)n++;
  });
  return n;
}
function projGiaoMembersHTML(p){
  var partIds=projPartIds(p);
  var asgnIds=projActiveAsgnEmpIds(p);
  if(!partIds.length&&!asgnIds.length)return'<div style="font-size:13px;color:var(--c-muted3);margin-bottom:14px;padding:10px 12px;border-radius:10px;background:rgba(255,255,255,.04)">Chưa có nhân viên nào trong dự án này.</div>';
  var h='<div style="margin-bottom:16px;padding:12px 14px;border-radius:12px;background:rgba(56,189,248,.08);border:1px solid rgba(56,189,248,.2)"><div style="font-size:12px;font-weight:600;color:#38bdf8;margin-bottom:10px;text-transform:uppercase;letter-spacing:.04em">Đã bố trí trong dự án ('+partIds.length+')</div><div class="row" style="gap:8px;flex-wrap:wrap">';
  partIds.forEach(function(eid){
    var e=eById(eid),role=projRoleOf(eid,p),paused=false,hasJob=asgnIds.indexOf(eid)>=0;
    S.asgn.forEach(function(a){if(a.projId===p.id&&a.empId===eid&&a.status==="paused")paused=true});
    h+='<span class="badge" style="font-size:12px;padding:6px 10px;color:var(--c-text);background:rgba(255,255,255,.08);border-color:rgba(255,255,255,.12)">'+esc(e?e.name:"?")+(hasJob?(paused?" · tạm dừng":""):( " · chưa giao việc"))+(role?" · "+projRoleName(role):"")+'</span>';
  });
  return h+'</div>'+(asgnIds.length<partIds.length?'<div style="font-size:12px;color:#fbbf24;margin-top:10px">Đang đồng bộ việc cho người mới trong đội…</div>':"")+'</div>';
}
function giaoEmpLoadSummary(eid,items,preview){
  var tot=0,selN=0;
  (items||[]).forEach(function(w){
    if(!(S.giaoItemStaff&&S.giaoItemStaff[w.id]&&S.giaoItemStaff[w.id][eid]))return;
    selN++;
    tot+=(preview[w.id]&&preview[w.id][eid]?Number(preview[w.id][eid].pct):0)||0;
  });
  return{tot:Math.round(tot*100)/100,selN:selN};
}
/** true = user đã gõ % (cố định); false/empty = app chia đều phần còn lại. */
function giaoPctIsManual(cell){
  if(!cell)return false;
  var raw=cell.pct;
  return !(raw===""||raw==null||raw===undefined);
}
function giaoPctInputHTML(eid,wid,pct,auto){
  var manual=!(pct===""||pct==null||pct===undefined);
  var ph=auto!=null?String(auto):"auto";
  var cls="wi-emp-pct giao-mx-pct"+(manual?"":" is-auto");
  return'<input class="'+cls+'" id="gwip_'+eid+'_'+wid+'" type="number" min="0" max="100" step="0.01" placeholder="'+esc(ph)+'" value="'+(manual?esc(String(pct)):"")+'" onchange="A.giaoWiPct(\''+eid+'\',\''+wid+'\')" onclick="event.stopPropagation()" title="'+(manual?"% do bạn gán (cố định). Xóa hết để về chia đều.":"App tự chia — để trống. Chỉ khóa khi bạn gõ số.")+'">';
}
function giaoEmpWiBlockHTML(eid,p){
  // Bản gọn (dùng ngoài bảng chính): chip hạng mục trên một hàng
  var items=normWorkItems(p);
  if(!items.length){
    return'<div class="giao-wi giao-wi-compact" onclick="event.stopPropagation()"><div class="giao-wi-hint">Chưa có hạng mục.</div></div>';
  }
  if(!S.giaoItemStaff)S.giaoItemStaff={};
  items.forEach(function(w){if(!S.giaoItemStaff[w.id])S.giaoItemStaff[w.id]={}});
  var preview=normalizeEmpItemLoads(items,S.giaoItemStaff);
  var load=giaoEmpLoadSummary(eid,items,preview);
  var h='<div class="giao-wi giao-wi-compact" onclick="event.stopPropagation()"><div class="giao-chips">';
  items.forEach(function(w,idx){
    var sel=!!(S.giaoItemStaff[w.id]&&S.giaoItemStaff[w.id][eid]);
    var pct=sel?(S.giaoItemStaff[w.id][eid].pct):"";
    var auto=preview[w.id]&&preview[w.id][eid]?preview[w.id][eid].pct:null;
    h+='<div class="giao-chip'+(sel?" on":"")+'">';
    h+='<label><input type="checkbox"'+(sel?" checked":"")+' onchange="A.giaoWiTog(\''+eid+'\',\''+w.id+'\',this.checked)"> <span>'+(idx+1)+'. '+esc(shortGanttText(workItemLabel(w,idx),22))+'</span></label>';
    if(sel)h+=giaoPctInputHTML(eid,w.id,pct,auto);
    h+='</div>';
  });
  h+='</div>';
  if(load.selN)h+='<div class="giao-wi-sum">Tổng <b style="color:'+(Math.abs(load.tot-100)<0.2?"#4ade80":"#f87171")+'">'+load.tot+'%</b></div>';
  else h+='<div class="giao-wi-sum" style="color:#fbbf24">Chưa chọn hạng mục</div>';
  h+='</div>';
  return h;
}
/** Bảng phân bổ: hàng = NV đã chọn, cột = hạng mục — quét nhanh, chỉnh % tại chỗ. */
function giaoAllocBoardHTML(p){
  var items=normWorkItems(p);
  var eids=curGiaoPartIds().slice().sort(function(a,b){
    var ea=eById(a),eb=eById(b);
    return (ea?ea.name:"").localeCompare(eb?eb.name:"","vi");
  });
  if(!eids.length){
    return'<div class="giao-board giao-board-empty">Chưa có ai trong đội — tick nhân viên ở danh sách bên dưới để thêm (tự gán mọi hạng mục).</div>';
  }
  if(!items.length){
    return'<div class="giao-board giao-board-empty" style="color:#f87171">Dự án chưa có hạng mục — sửa dự án trước khi giao.</div>';
  }
  if(!S.giaoItemStaff)S.giaoItemStaff={};
  items.forEach(function(w){if(!S.giaoItemStaff[w.id])S.giaoItemStaff[w.id]={}});
  var preview=normalizeEmpItemLoads(items,S.giaoItemStaff);
  var h='<div class="giao-board">';
  h+='<div class="giao-board-bar"><div class="giao-board-title">Phân bổ hạng mục <span class="giao-board-n">'+eids.length+' người · '+items.length+' hạng mục</span></div>';
  h+='<div class="giao-board-btns">';
  h+='<button type="button" class="btn btn-ghost btn-sm" onclick="A.giaoWiAllTeam()">Gán hết hạng mục</button>';
  h+='</div></div>';
  h+='<div class="giao-board-scroll"><table class="giao-matrix"><thead><tr>';
  h+='<th class="giao-mx-sticky">Nhân viên</th>';
  items.forEach(function(w,i){
    var lab=workItemLabel(w,i);
    h+='<th class="giao-mx-wi" title="'+esc(lab)+'"><span class="giao-mx-idx">'+(i+1)+'</span><span class="giao-mx-wilab">'+esc(lab)+'</span></th>';
  });
  h+='<th class="giao-mx-tot">Tổng</th></tr></thead><tbody>';
  eids.forEach(function(eid){
    var e=eById(eid);
    var load=giaoEmpLoadSummary(eid,items,preview);
    var bp=e?busyPct(e):0;
    var totCls=load.selN?(Math.abs(load.tot-100)<0.2?" ok":" bad"):" miss";
    h+='<tr>';
    h+='<td class="giao-mx-sticky"><div class="giao-mx-emp">';
    h+='<button type="button" class="giao-mx-remove" title="Xoá khỏi dự án" onclick="A.giaoTog(\''+eid+'\')">×</button>';
    h+='<div class="giao-mx-empinfo"><div class="giao-mx-name">'+esc(e?e.name:"?")+'</div>';
    h+='<div class="giao-mx-meta">'+bp+'% bận · '+ac(eid)+' việc</div></div></div></td>';
    items.forEach(function(w,idx){
      var sel=!!(S.giaoItemStaff[w.id]&&S.giaoItemStaff[w.id][eid]);
      var pct=sel?(S.giaoItemStaff[w.id][eid].pct):"";
      var auto=preview[w.id]&&preview[w.id][eid]?preview[w.id][eid].pct:null;
      h+='<td class="giao-mx-cell'+(sel?" on":"")+'">';
      h+='<label class="giao-mx-check" title="'+esc(workItemLabel(w,idx))+'"><input type="checkbox"'+(sel?" checked":"")+' onchange="A.giaoWiTog(\''+eid+'\',\''+w.id+'\',this.checked)"><span>'+(sel?"✓":"+")+'</span></label>';
      if(sel){
        h+=giaoPctInputHTML(eid,w.id,pct,auto);
      }else{
        h+='<span class="giao-mx-dash">—</span>';
      }
      h+='</td>';
    });
    h+='<td class="giao-mx-tot'+totCls+'">'+(load.selN?load.tot+"%":'<span class="giao-mx-need">chưa chọn</span>')+'</td>';
    h+='</tr>';
  });
  h+='</tbody></table></div>';
  h+='<div class="giao-board-hint"><b>×</b> = xoá người khỏi dự án · bỏ tick hạng mục = không giao mục đó · ô trống = chia đều · <b>100% tiến độ</b> (ở chi tiết) = hoàn thành phần việc (giữ KPI).</div>';
  h+='</div>';
  return h;
}
function giaoEmpPickRow(e,opts){
  opts=opts||{};
  var onLeave=isEmpOnLeave(e),bp=busyPct(e),sel=!!opts.sel,st=empStatusInfo(e),dis=!!opts.dis||onLeave;
  var h='<div class="giao-pick'+(sel&&!dis?" sel":"")+(dis?" dis":"")+'"'+(dis?"":' onclick="A.giaoTog(\''+e.id+'\')"')+'>';
  h+='<input type="checkbox" class="giao-chk"'+(sel&&!dis?" checked":"")+(dis?" disabled":"")+(dis?"":' onclick="event.stopPropagation();A.giaoTog(\''+e.id+'\')"')+'>';
  h+='<div class="giao-pick-body"><span class="giao-pick-name"'+(onLeave?' style="color:#94a3b8"':"")+'>'+esc(e.name)+'</span>'+bdg(st.l,st.c,st.s);
  h+='<span class="giao-pick-meta">'+(onLeave?esc(empLeaveLabel(e)||"Đang nghỉ phép"):(bp+'% bận · '+ac(e.id)+' việc'))+'</span></div>';
  if(sel&&!dis)h+='<span class="giao-pick-tag">Trong đội</span>';
  h+='</div>';
  return h;
}
function giaoEmpRow(e,opts){
  opts=opts||{};
  if(opts.compact)return giaoEmpPickRow(e,opts);
  var onLeave=isEmpOnLeave(e),bp=busyPct(e),sel=!!opts.sel,st=empStatusInfo(e),dis=!!opts.dis||onLeave;
  var h='<div class="giao-row'+(sel&&!dis?" sel":"")+(dis?" dis":"")+'"'+(dis?"":' onclick="A.giaoTog(\''+e.id+'\')"')+'><div class="giao-row-body"><div class="row" style="gap:8px;align-items:center;margin-bottom:2px"><span class="giao-row-name"'+(onLeave?' style="color:#94a3b8"':"")+'>'+esc(e.name)+'</span>'+bdg(st.l,st.c,st.s)+(dis&&!onLeave?bdg("Đã bố trí","var(--c-muted4)","transparent"):"")+(onLeave?bdg("Không chọn","#f87171","rgba(248,113,113,.12)"):"")+'</div>'+(onLeave?'<div style="font-size:12px;color:#f87171;font-weight:600;margin-top:2px">'+esc(empLeaveLabel(e))+'</div>':busyBar(bp,true)+'<div style="text-align:right;font-family:monospace;font-size:10px;color:rgba(200,225,255,.6);margin-top:3px">'+bp+'% bận rộn · '+ac(e.id)+' việc</div>');
  if(opts.extra&&!dis)h+='<div class="giao-row-extra" onclick="event.stopPropagation()">'+opts.extra+'</div>';
  h+='</div><input type="checkbox" class="giao-chk"'+(sel&&!dis?" checked":"")+(dis?" disabled":"")+(dis?"":' onclick="event.stopPropagation();A.giaoTog(\''+e.id+'\')"')+'></div>';
  return h;
}
function giaoEmpSched(eid,p){
  var dates=asgnDates(p);
  if(!S.giaoSched)S.giaoSched={};
  if(!S.giaoSched[eid])S.giaoSched[eid]={startDate:dates.start,endDate:dates.end};
  return S.giaoSched[eid];
}
function refreshGiaoWarn(eid){
  if(!S.giaoWarn)S.giaoWarn={};
  var p=pById(S.giaoProj);
  if(!p||!S.giaoPick[eid]){delete S.giaoWarn[eid];return null;}
  var sch=giaoEmpSched(eid,p);
  var arriveRaw=S.giaoArriveAt||"";
  var c=checkAssignmentConflict(eid,p.custId,arriveRaw||"",p.province,sch.startDate,sch.endDate);
  if(c&&c.hasWarning){S.giaoWarn[eid]=c;return c;}
  delete S.giaoWarn[eid];
  return null;
}
function refreshAllGiaoWarns(){
  Object.keys(S.giaoPick||{}).forEach(function(eid){if(S.giaoPick[eid])refreshGiaoWarn(eid);});
}
function giaoWarnBlockHTML(eid){
  var w=S.giaoWarn&&S.giaoWarn[eid];
  if(!w)return"";
  var h='<div class="giao-warn">';
  h+='<div class="giao-warn-hd">⚠ Trùng lịch / không kịp thời gian</div>';
  (w.reasonLines||[]).slice(0,5).forEach(function(line){h+='<div class="giao-warn-line">'+esc(line)+'</div>';});
  if(w.suggestStart){
    h+='<div class="giao-warn-sug">Nên bắt đầu từ <b>'+dFmt(w.suggestStart)+'</b> — chỉnh ngày bên dưới hoặc bấm áp dụng.</div>';
    h+=btn("btn-ghost btn-sm","Áp dụng "+dFmtG(w.suggestStart),"A.giaoApplySuggest('"+eid+"')");
  }
  h+='</div>';
  return h;
}
function giaoSchedBlockHTML(eid,p){
  var sch=giaoEmpSched(eid,p);
  return'<div class="giao-sched"><div><div class="lab">Bắt đầu</div><input type="date" id="gsd_'+eid+'" value="'+esc(sch.startDate||"")+'" onchange="A.giaoSchedChange(\''+eid+'\')"></div><div><div class="lab">Hoàn thành</div><input type="date" id="ged_'+eid+'" value="'+esc(sch.endDate||"")+'" onchange="A.giaoSchedChange(\''+eid+'\')"></div></div>';
}
function giaoPickExtraHTML(eid,p){
  if(!S.giaoPick[eid])return"";
  return giaoSchedBlockHTML(eid,p)+giaoWarnBlockHTML(eid);
}
function giaoAlertsSummaryHTML(p){
  var ids=Object.keys(S.giaoPick||{}).filter(function(eid){return S.giaoPick[eid]&&S.giaoWarn&&S.giaoWarn[eid]});
  if(!ids.length)return"";
  var h='<div class="giao-warn" style="margin-bottom:14px"><div class="giao-warn-hd">⚠ Có '+ids.length+' nhân viên cần xem lại lịch trước khi lưu</div>';
  ids.forEach(function(eid){
    var e=eById(eid),w=S.giaoWarn[eid],sch=giaoEmpSched(eid,p);
    h+='<div class="giao-warn-line"><b>'+esc(e?e.name:"?")+'</b>: '+dFmtG(sch.startDate)+' → '+dFmtG(sch.endDate);
    if(w.suggestStart)h+=' · nên từ <b style="color:#4ade80">'+dFmtG(w.suggestStart)+'</b>';
    h+='</div>';
  });
  h+='</div>';
  return h;
}
function collectGiaoItemStaff(p){
  if(!S.giaoItemStaff||typeof S.giaoItemStaff!=="object")S.giaoItemStaff={};
  var items=normWorkItems(p);
  items.forEach(function(w){
    if(!S.giaoItemStaff[w.id])S.giaoItemStaff[w.id]={};
    Object.keys(S.giaoItemStaff[w.id]||{}).forEach(function(eid){
      if(!S.giaoPick[eid]){delete S.giaoItemStaff[w.id][eid];return}
      var el=document.getElementById("gwip_"+eid+"_"+w.id);
      var cell=S.giaoItemStaff[w.id][eid]||{};
      var pct=el?el.value:cell.pct;
      S.giaoItemStaff[w.id][eid]={pct:(pct===""||pct==null)?"":pct};
    });
  });
  return S.giaoItemStaff;
}
function curGiaoPartIds(){return Object.keys(S.giaoPick||{}).filter(function(eid){return S.giaoPick[eid]})}
function canAssignProjRoles(count){return (count|0)>=2}
function projRolePickMin(){return 2}
function projRolePickHint(){
  return "Chọn ít nhất "+projRolePickMin()+" nhân viên trong đội để phân Trưởng nhóm / Thủ kho.";
}
function projRolePartIds(p){
  return projPartIds(p).slice().sort(function(a,b){
    var ea=eById(a),eb=eById(b);
    return (ea?ea.name:"").localeCompare(eb?eb.name:"","vi");
  });
}
function rolePickPartIds(){
  return curGiaoPartIds().slice().sort(function(a,b){
    var ea=eById(a),eb=eById(b);
    return (ea?ea.name:"").localeCompare(eb?eb.name:"","vi");
  });
}
function empRoleOptLabel(e){return e?esc(e.name)+(e.group?" · "+esc(e.group):""):"?"}
function teamRolePickHTML(title,partIds){
  if(!canManageStaff())return "";
  partIds=partIds||curGiaoPartIds();
  partIds=partIds.slice().sort(function(a,b){var ea=eById(a),eb=eById(b);return (ea?ea.name:"").localeCompare(eb?eb.name:"","vi")});
  var hdr=title?'<div style="font-size:13px;font-weight:700;color:#fbbf24;margin:12px 0 8px">'+esc(title)+'</div>':"";
  if(!canAssignProjRoles(partIds.length)){
    return hdr+'<div style="font-size:13px;color:var(--c-muted4);margin-top:8px">'+esc(projRolePickHint())+'</div>';
  }
  var opts=function(sel){var h='<option value="">— Không chọn —</option>';partIds.forEach(function(eid){var e=eById(eid);if(e)h+='<option value="'+eid+'"'+(sel===eid?" selected":"")+'>'+empRoleOptLabel(e)+'</option>'});return h};
  return hdr+'<div class="grid2" style="gap:14px;margin-top:4px"><div>'+fld("Trưởng nhóm",'<select onchange="A.teamTT(this.value)">'+opts(S.teamToTruong||"")+'</select>')+'</div><div>'+fld("Thủ kho",'<select onchange="A.teamVT(this.value)">'+opts(S.teamVatTu||"")+'</select>')+'</div></div>';
}
function teamRolePickBlock(title,partIds){var html=teamRolePickHTML(title,partIds);return html?'<div class="giao-grp giao-grp-main" style="margin-bottom:18px">'+html+'</div>':"";}
function projRoleEditCardHTML(p){
  if(!p||!canManageStaff())return "";
  if(isProjLocked(p)){
    var tt=p.toTruongId?eById(p.toTruongId):null,vt=p.vatTuId?eById(p.vatTuId):null;
    var body='<div style="font-size:13px;color:var(--c-muted2)">Trưởng nhóm: <b style="color:#fbbf24">'+(tt?esc(tt.name):"—")+'</b> · Thủ kho: <b style="color:#4ade80">'+(vt?esc(vt.name):"—")+'</b></div>';
    body+='<div style="font-size:12px;color:var(--c-muted4);margin-top:8px">Dự án đã khoá — không đổi chức vụ.</div>';
    return'<div class="card card-p proj-role-card" style="margin-top:14px;border-color:rgba(148,163,184,.35);background:rgba(148,163,184,.06)"><div style="font-size:14px;font-weight:700;color:#94a3b8;margin-bottom:8px">Chức vụ (đã lưu trữ)</div>'+body+'</div>';
  }
  var partIds=projRolePartIds(p);
  var opts=function(sel){var h='<option value="">— Không chọn —</option>';partIds.forEach(function(eid){var e=eById(eid);if(e)h+='<option value="'+eid+'"'+(sel===eid?" selected":"")+'>'+empRoleOptLabel(e)+'</option>'});return h};
  var body;
  if(!partIds.length){
    body='<div style="font-size:13px;color:var(--c-muted);margin-bottom:12px">Chưa có nhân viên tham gia dự án. Bấm <b>Giao việc</b> để thêm người, rồi phân chức vụ tại đây.</div>'+btn("btn-accent btn-sm","Giao việc","A.giaoOpen('"+p.id+"')");
  }else if(!canAssignProjRoles(partIds.length)){
    body='<div style="font-size:13px;color:var(--c-muted4);margin-bottom:8px">'+esc(projRolePickHint())+'</div>'+btn("btn-accent btn-sm","Giao việc","A.giaoOpen('"+p.id+"')");
  }else{
    if(S._roleProjId!==p.id){S.teamToTruong=p.toTruongId||"";S.teamVatTu=p.vatTuId||"";S._roleProjId=p.id;}
    body='<div class="grid2" style="gap:14px"><div>'+fld("Trưởng nhóm",'<select id="proj-role-tt" onchange="A.teamTT(this.value)">'+opts(S.teamToTruong||"")+'</select>')+'</div><div>'+fld("Thủ kho",'<select id="proj-role-vt" onchange="A.teamVT(this.value)">'+opts(S.teamVatTu||"")+'</select>')+'</div></div><div style="margin-top:14px">'+btn("btn-primary btn-sm","Lưu chức vụ","A.saveProjRoles()")+'</div>';
  }
  return'<div class="card card-p proj-role-card" style="margin-top:14px;border-color:rgba(251,191,36,.35);background:linear-gradient(135deg,rgba(251,191,36,.08),rgba(255,255,255,.03))"><div style="font-size:14px;font-weight:700;color:#fbbf24;margin-bottom:8px">Phân chức vụ — Đội dự án</div>'+body+'</div>';
}
function projTeamListHTML(p,opts){
  opts=opts||{};
  var partIds=projPartIds(p).slice();
  partIds.sort(function(a,b){return projRoleRank(projRoleOf(a,p))-projRoleRank(projRoleOf(b,p))});
  if(!partIds.length)return opts.empty||'<div style="font-size:14px;color:var(--c-muted)">Chưa có nhân viên tham gia.</div>';
  var acts=opts.acts||[];
  var h="";
  partIds.forEach(function(eid){
    var e=eById(eid),role=projRoleOf(eid,p),roleNm=projRoleName(role),asgn=null;
    for(var i=0;i<acts.length;i++){if(acts[i].empId===eid){asgn=acts[i];break}}
    var roleCol=role==="to_truong"?"#fbbf24":role==="vat_tu"?"#4ade80":"";
    h+='<div class="li row" style="justify-content:space-between;align-items:center;gap:8px"><div class="row" style="gap:8px;align-items:center;flex-wrap:wrap"><span style="font-size:13px'+(opts.link?';cursor:pointer;color:var(--c-accent2)" onclick="A.empDet(\''+eid+'\')"':'"')+'>'+(e?esc(e.name):"?")+(roleNm?' · <span style="color:'+roleCol+';font-weight:600">'+esc(roleNm)+'</span>':"")+(asgn&&asgn.status==="paused"?' <span style="color:#ef4444">(tạm hoãn)</span>':"")+'</span>';
    if(!asgn)h+=bdg("Chưa có việc","#fbbf24","rgba(251,191,36,.12)");
    h+='</div>';
    if(asgn){
      var asgnDone=asgn.status==="done";
      h+='<div class="row" style="gap:8px;align-items:center"><span style="font-family:monospace;color:'+(asgnDone?"#4ade80":"#38bdf8")+';font-weight:700">'+(asgnDone?"✓ ":"")+asgn.prog+'%</span>'+(isDir()&&!isProjLocked(p)?'<button class="btn btn-ghost btn-sm" style="padding:2px 6px;color:#ef4444" onclick="A.delAsgn(\''+asgn.id+'\')">Xoá</button>':"")+'</div>';
    }else if(canGiao()&&!isProjLocked(p)){
      h+='<button type="button" class="btn btn-accent btn-sm" onclick="A.ensureEmpJob(\''+p.id+'\',\''+eid+'\')">Giao việc</button>';
    }
    h+='</div>';
  });
  return h;
}
function dParse(s){if(!s)return null;var d=new Date((s.length>10?s:s+"T00:00:00"));return isNaN(d.getTime())?null:d}
function dAdd(s,days){var d=dParse(s)||new Date();d.setDate(d.getDate()+days);return d.getFullYear()+"-"+pad2(d.getMonth()+1)+"-"+pad2(d.getDate())}
function dFmt(s){var d=dParse(s);return d?pad2(d.getDate())+"/"+pad2(d.getMonth()+1)+"/"+d.getFullYear():s||"—"}
function dFmtDM(s){var d=dParse(s);return d?pad2(d.getDate())+"/"+pad2(d.getMonth()+1):s||"—"}
function dFmtG(s){var d=dParse(s);return d?pad2(d.getDate())+"/"+pad2(d.getMonth()+1)+"/"+String(d.getFullYear()).slice(-2):s||"—"}
function dFmtCard(s){var d=dParse(s);return d?pad2(d.getDate())+"/"+pad2(d.getMonth()+1):"—"}
function dFmtWeekday(s){
  var d=dParse(s);
  if(!d)return s||"—";
  var days=["Chủ nhật","Thứ hai","Thứ ba","Thứ tư","Thứ năm","Thứ sáu","Thứ bảy"];
  return days[d.getDay()]+" · "+pad2(d.getDate())+"/"+pad2(d.getMonth()+1)+"/"+d.getFullYear();
}
function dFmtGanttWeek(w){
  if(!w||isNaN(w.getTime()))return"—";
  var s=new Date(w.getTime());s.setHours(0,0,0,0);
  var e=new Date(s);e.setDate(e.getDate()+6);
  return pad2(s.getDate())+"/"+pad2(s.getMonth()+1)+"-"+pad2(e.getDate())+"/"+pad2(e.getMonth()+1);
}
function ganttLblHTML(p,start,end){
  var company=ganttCompanyLbl(p),full=projCompanyShort(p)||projCompanyName(p)||"";
  return '<span class="gantt-name-title gantt-name" data-act="projDet" data-id="'+esc(p.id)+'"'+(full?' title="'+esc(full)+'"':"")+'>'+esc(company)+'</span><span class="gantt-name-dates">'+dFmtCard(start)+' – '+dFmtCard(end)+'</span>';
}
function ganttBarText(p){return ganttWorkShort(p);}
function projDays(start,end){
  var s=dParse(start),e=dParse(end);
  if(!s||!e)return "—";
  return Math.max(1,Math.round((e.getTime()-s.getTime())/86400000)+1)+" ngày";
}
function ganttBarInnerHTML(w,opts){
  opts=opts||{};
  var label=String(opts.label||""),days=opts.days||"",pct=opts.pct!=null?opts.pct+"%":"",tip=opts.tip||"";
  var dShort=days?String(days).replace(/\s*ngày$/,"d"):"";
  var fullTip=tip||[label,days,pct].filter(Boolean).join(" · ");
  if(w<28)return "";
  if(w<48){
    var meta=[dShort,pct].filter(Boolean).join(" · ");
    return '<div class="gantt-bar-inner gantt-bar-inner-compact" title="'+esc(fullTip)+'"><span class="gantt-bar-meta">'+esc(meta||shortGanttText(label,8))+'</span></div>';
  }
  if(w<78){
    return '<div class="gantt-bar-inner" title="'+esc(fullTip)+'"><span class="gantt-bar-label">'+esc(shortGanttText(label,Math.max(4,Math.floor(w/7))))+'</span><span class="gantt-bar-meta">'+esc(pct||dShort)+'</span></div>';
  }
  return '<div class="gantt-bar-inner" title="'+esc(fullTip)+'"><span class="gantt-bar-label">'+esc(shortGanttText(label,Math.max(8,Math.floor(w/7))))+'</span><span class="gantt-bar-meta">'+esc(dShort)+'</span><span class="gantt-bar-meta">'+esc(pct)+'</span></div>';
}
/** Số thứ tự hạng mục cha trên Gantt (1-based), ví dụ [2] → «chờ hạng mục 2». */
function ganttParentNums(p,parentIds){
  var items=normWorkItems(p);
  var nums=[];
  (parentIds||[]).forEach(function(pid){
    var i=items.findIndex(function(x){return x.id===pid});
    if(i>=0&&nums.indexOf(i+1)<0)nums.push(i+1);
  });
  nums.sort(function(a,b){return a-b});
  return nums;
}
function ganttWaitLabel(nums){
  if(!nums||!nums.length)return"";
  if(nums.length===1)return"chờ hạng mục "+nums[0];
  return"chờ hạng mục "+nums.join(", ");
}
function ganttWaitShort(nums){
  if(!nums||!nums.length)return"";
  if(nums.length===1)return"chờ #"+nums[0];
  return"chờ #"+nums.join(",");
}
function defaultProjStart(){return dAdd(td(),1)}
function dateParts(iso){
  var d=dParse(iso||defaultProjStart())||dParse(td());
  return{y:d.getFullYear(),m:d.getMonth()+1,day:d.getDate()};
}
function isoFromDayMonth(day,month,yearHint){
  var y=yearHint||new Date().getFullYear();
  day=Math.max(1,Math.min(31,parseInt(day,10)||1));
  month=Math.max(1,Math.min(12,parseInt(month,10)||1));
  var last=new Date(y,month,0).getDate();
  if(day>last)day=last;
  var iso=y+"-"+pad2(month)+"-"+pad2(day);
  var parsed=dParse(iso);
  if(!parsed)return defaultProjStart();
  return iso;
}
function deadlineFromDuration(start,days){
  days=Math.max(1,parseInt(days,10)||1);
  return dAdd(start,days-1);
}
function isDeadlinePast(iso){return !!(iso&&td()>iso)}
function deadlineWarnStyle(iso){
  if(isDeadlinePast(iso))return{box:"margin-bottom:14px;padding:10px 12px;border-radius:10px;background:rgba(239,68,68,.1);border:1px solid rgba(239,68,68,.45)",color:"#ef4444"};
  return{box:"margin-bottom:14px;padding:10px 12px;border-radius:10px;background:rgba(56,189,248,.08);border:1px solid rgba(56,189,248,.22)",color:"#38bdf8"};
}
/** Không còn hiển thị khối Giám sát & Điều hành trên dự án (luôn có sẵn theo đội). */
function projOversightNoteHTML(){return""}
function deriveProjGroupFromAssign(assignMap,fallback){
  var counts={},best=fallback||defaultFieldGroup(),bc=0;
  Object.keys(assignMap||{}).forEach(function(eid){
    var e=eById(eid);if(!e||!e.group||isOversightGroup(e.group))return;
    counts[e.group]=(counts[e.group]||0)+1;
  });
  Object.keys(counts).forEach(function(g){if(counts[g]>bc){bc=counts[g];best=g;}});
  return best;
}
function projDurationDays(p){
  if(p&&p.durationDays>0)return Math.max(1,parseInt(p.durationDays,10)||1);
  if(p&&p.startDate&&p.deadline)return asgnDaySpan(p.startDate,p.deadline);
  return 7;
}

/* ===== Hạng mục công việc (work items) ===== */
function mkWorkItem(title,order){
  // title rỗng = hiện placeholder mờ trên form; khi lưu sẽ gán mặc định nếu vẫn trống
  return{id:uid(),title:title==null?"":String(title),order:order||0,parentIds:[]};
}
function workItemLabel(w,idx){
  var t=w&&w.title!=null?String(w.title).trim():"";
  if(t)return t;
  return "Hạng mục "+((idx!=null?idx:((w&&w.order)||0))+1);
}
function workItemParentIds(w){
  if(!w)return[];
  var ids=Array.isArray(w.parentIds)?w.parentIds:[];
  return ids.filter(function(id){return !!id});
}
function normWorkItems(p){
  if(!p)return[];
  var list=Array.isArray(p.workItems)?p.workItems.slice():[];
  list=list.filter(function(w){return w&&w.id});
  list.sort(function(a,b){return (a.order||0)-(b.order||0)});
  var idSet={};list.forEach(function(w){idSet[w.id]=1});
  var anyParents=list.some(function(w){return workItemParentIds(w).length>0});
  // Migrate legacy workFlow=sequence → chuỗi parentIds
  var legacySeq=!anyParents&&p&&p.workFlow==="sequence"&&list.length>1;
  list.forEach(function(w,i){
    w.order=i;
    // Giữ title rỗng trên form (placeholder); chỉ mặc định khi null/undefined
    if(w.title==null)w.title="";
    if(!Array.isArray(w.parentIds))w.parentIds=[];
    if(legacySeq&&i>0)w.parentIds=[list[i-1].id];
    w.parentIds=w.parentIds.filter(function(pid){return pid&&pid!==w.id&&idSet[pid]});
  });
  return list;
}
function finalizeWorkItemTitles(items){
  (items||[]).forEach(function(w,i){
    if(!w)return;
    w.order=i;
    if(!String(w.title||"").trim())w.title="Hạng mục "+(i+1);
  });
  return items||[];
}
/** Legacy helper — còn dùng chỗ cũ; suy ra từ phụ thuộc. */
function projWorkFlow(p){
  var items=normWorkItems(p);
  if(items.some(function(w){return workItemParentIds(w).length>0}))return"sequence";
  return (p&&p.workFlow==="sequence")?"sequence":"parallel";
}
function workItemDepthMap(items){
  var byId={};items.forEach(function(w){byId[w.id]=w});
  var memo={},vis={};
  function depth(id){
    if(memo[id]!=null)return memo[id];
    if(vis[id])return 0;
    vis[id]=1;
    var w=byId[id],d=0;
    workItemParentIds(w).forEach(function(pid){d=Math.max(d,depth(pid)+1)});
    vis[id]=0;memo[id]=d;return d;
  }
  var map={};items.forEach(function(w){map[w.id]=depth(w.id)});
  return map;
}
function wiWouldCycle(items,childId,parentId){
  if(!childId||!parentId||childId===parentId)return true;
  // parentId có phụ thuộc (trực tiếp/gián tiếp) vào childId không?
  var byId={};items.forEach(function(w){byId[w.id]=w});
  var seen={};
  function dependsOn(from,to){
    if(from===to)return true;
    if(seen[from])return false;
    seen[from]=1;
    var w=byId[from];if(!w)return false;
    return workItemParentIds(w).some(function(pid){return dependsOn(pid,to)});
  }
  return dependsOn(parentId,childId);
}
function ensureFormWorkItems(f){
  if(!f)return;
  if(!Array.isArray(f.workItems)||!f.workItems.length){
    f.workItems=[mkWorkItem("",0)];
  }
  f.workItems=normWorkItems(f);
  if(!f.itemStaff||typeof f.itemStaff!=="object")f.itemStaff={};
  if(!f.wiOpenGrp||typeof f.wiOpenGrp!=="object")f.wiOpenGrp={};
  f.workItems.forEach(function(w,i){
    w.order=i;
    if(!Array.isArray(w.parentIds))w.parentIds=[];
    if(!f.itemStaff[w.id])f.itemStaff[w.id]={};
  });
}
function formAssignedEmpIds(f){
  var map={};
  Object.keys((f&&f.itemStaff)||{}).forEach(function(wid){
    Object.keys(f.itemStaff[wid]||{}).forEach(function(eid){map[eid]=1});
  });
  return filterFieldEmpIds(Object.keys(map));
}
/** Chuẩn hoá % theo NV: chỉ hạng mục đã chọn; phần đã nhập giữ nguyên; phần còn lại chia đều cho hạng mục chưa nhập. */
function normalizeEmpItemLoads(workItems,itemStaff){
  workItems=workItems||[];
  itemStaff=itemStaff||{};
  var empIds={},out={};
  workItems.forEach(function(w){
    out[w.id]={};
    Object.keys(itemStaff[w.id]||{}).forEach(function(eid){empIds[eid]=1});
  });
  Object.keys(empIds).forEach(function(eid){
    var explicit={},autoList=[],sum=0;
    workItems.forEach(function(w){
      var cell=itemStaff[w.id]&&itemStaff[w.id][eid];
      if(!cell)return;
      var raw=cell.pct;
      if(raw===""||raw==null||raw===undefined){autoList.push(w.id);return}
      var n=Number(raw);
      if(isNaN(n)){autoList.push(w.id);return}
      n=Math.round(Math.max(0,Math.min(100,n))*100)/100;
      explicit[w.id]=n;sum+=n;
    });
    sum=Math.round(sum*100)/100;
    var remain=Math.round((100-sum)*100)/100;
    if(remain<0)remain=0;
    var autoEach=autoList.length?Math.floor((remain/autoList.length)*100)/100:0;
    var autoSum=0;
    workItems.forEach(function(w){
      var cell=itemStaff[w.id]&&itemStaff[w.id][eid];
      if(!cell){out[w.id][eid]={pct:0};return}
      if(Object.prototype.hasOwnProperty.call(explicit,w.id)){
        out[w.id][eid]={pct:explicit[w.id]};
        return;
      }
      var ai=autoList.indexOf(w.id);
      var pct;
      if(ai===autoList.length-1)pct=Math.round((remain-autoSum)*100)/100;
      else{pct=autoEach;autoSum=Math.round((autoSum+autoEach)*100)/100}
      out[w.id][eid]={pct:Math.max(0,pct)};
    });
  });
  return out;
}
/** Kiểm tra phân bổ %: trả về chuỗi lỗi hoặc "". */
function validateEmpItemLoads(workItems,itemStaff,empIds){
  workItems=workItems||[];
  itemStaff=itemStaff||{};
  empIds=empIds||[];
  var i,eid,e,sel,sumEx,nManual,nAuto,raw,n,remain,total,norm,w;
  for(i=0;i<empIds.length;i++){
    eid=empIds[i];
    e=eById(eid);
    sel=[];
    sumEx=0;nManual=0;nAuto=0;
    workItems.forEach(function(wi){
      var cell=itemStaff[wi.id]&&itemStaff[wi.id][eid];
      if(!cell)return;
      sel.push(wi);
      raw=cell.pct;
      if(raw===""||raw==null||raw===undefined){nAuto++;return}
      n=Number(raw);
      if(isNaN(n)){nAuto++;return}
      nManual++;
      sumEx+=Math.max(0,Math.min(100,n));
    });
    if(!sel.length){
      return "Nhân viên «"+(e?e.name:"?")+"» chưa chọn hạng mục nào. Hãy tick hạng mục tham gia.";
    }
    sumEx=Math.round(sumEx*100)/100;
    if(sumEx>100.05){
      return "Tỷ lệ công việc của «"+(e?e.name:"?")+"» đang phân bổ sai (đã nhập "+sumEx+"% > 100%). Hãy chọn lại.";
    }
    if(nAuto===0&&Math.abs(sumEx-100)>0.15){
      return "Tỷ lệ công việc của «"+(e?e.name:"?")+"» đang phân bổ sai (tổng "+sumEx+"%, cần 100%). Hãy chọn lại.";
    }
    remain=Math.round((100-sumEx)*100)/100;
    if(nAuto>0&&remain<0){
      return "Tỷ lệ công việc của «"+(e?e.name:"?")+"» đang phân bổ sai (đã nhập vượt 100%). Hãy chọn lại.";
    }
  }
  norm=normalizeEmpItemLoads(workItems,itemStaff);
  for(i=0;i<empIds.length;i++){
    eid=empIds[i];
    e=eById(eid);
    total=0;
    workItems.forEach(function(wi){
      if(!(itemStaff[wi.id]&&itemStaff[wi.id][eid]))return;
      total+=(norm[wi.id]&&norm[wi.id][eid]?Number(norm[wi.id][eid].pct):0)||0;
    });
    total=Math.round(total*100)/100;
    if(Math.abs(total-100)>0.2){
      return "Tỷ lệ công việc của «"+(e?e.name:"?")+"» đang phân bổ sai (tổng sau chuẩn hoá "+total+"%). Hãy chọn lại.";
    }
  }
  return "";
}
function collectFormItemStaff(f){
  ensureFormWorkItems(f);
  (f.workItems||[]).forEach(function(w){
    var titleEl=document.getElementById("wit_"+w.id);
    if(titleEl)w.title=titleEl.value.trim();
    var parents=[];
    (f.workItems||[]).forEach(function(other){
      if(other.id===w.id)return;
      var cb=document.getElementById("wipar_"+w.id+"_"+other.id);
      if(cb&&cb.checked)parents.push(other.id);
    });
    w.parentIds=parents;
  });
  if(!f.itemStaff||typeof f.itemStaff!=="object")f.itemStaff={};
  return f.itemStaff;
}
function captureModalScroll(){
  var ov=document.querySelector("#modal-root .overlay");
  return ov?ov.scrollTop:0;
}
function restoreModalScroll(y){
  requestAnimationFrame(function(){
    var ov=document.querySelector("#modal-root .overlay");
    if(ov)ov.scrollTop=y||0;
    requestAnimationFrame(function(){
      var ov2=document.querySelector("#modal-root .overlay");
      if(ov2)ov2.scrollTop=y||0;
    });
  });
}
function rerenderProjForm(){
  if(!S.form)return;
  var y=captureModalScroll();
  A.projSyncForm();
  S.modal=projM(S.form);
  render();
  restoreModalScroll(y);
}
function workItemAsgns(projId,wiId){
  return (S.asgn||[]).filter(function(a){
    if(isChiefAsgn(a))return false;
    return a.projId===projId&&a.workItemId===wiId&&(a.status==="active"||a.status==="paused"||a.status==="done"||a.status==="queued");
  });
}
function workItemById(p,wiId){
  return normWorkItems(p).find(function(w){return w.id===wiId})||null;
}
/** Hạng mục đã được GD/TN xác nhận hoàn thành (khoá thống kê). */
function workItemIsConfirmed(p,wiId){
  var w=workItemById(p,wiId);
  return !!(w&&w.confirmedDone);
}
/** Trung bình tiến độ các NV trong hạng mục (không trọng số). Đã xác nhận → 100%. */
function workItemAvgProg(p,wiId){
  if(!p)return 0;
  var acts=workItemAsgns(p.id,wiId).filter(function(a){return a.loadPct==null||Number(a.loadPct)>0});
  if(!acts.length)return 0;
  var sum=0;
  acts.forEach(function(a){
    sum+=a.status==="done"?100:Math.max(0,Math.min(100,Number(a.prog)||0));
  });
  return Math.round(sum/acts.length);
}
function workItemIsDone(p,wiId){
  if(workItemIsConfirmed(p,wiId))return true;
  var acts=workItemAsgns(p.id,wiId).filter(function(a){return a.loadPct==null||Number(a.loadPct)>0});
  if(!acts.length)return false;
  return acts.every(function(a){return a.status==="done"});
}
/** % hiển thị tổng hạng mục: đã xác nhận = 100%; chưa = trung bình NV. */
function workItemProgPct(p,wiId){
  if(!p)return 0;
  if(p.status==="done"||workItemIsConfirmed(p,wiId))return 100;
  return workItemAvgProg(p,wiId);
}
function canConfirmWorkItem(p,wiId){
  if(!p||!wiId||isProjLocked(p))return false;
  if(!canConfirmProjDone(p))return false;
  if(workItemIsConfirmed(p,wiId))return false;
  return true;
}
/** Chỉ giám đốc được sửa khi hạng mục đã xác nhận (tài liệu thống kê). */
function workItemEditLocked(p,wiId){
  return workItemIsConfirmed(p,wiId)&&!isDir();
}
function applyConfirmWorkItemLocal(projId,wiId){
  var p=pById(projId);if(!p)return false;
  var items=normWorkItems(p);
  var w=items.find(function(x){return x.id===wiId});
  if(!w||w.confirmedDone)return false;
  var acts=workItemAsgns(projId,wiId).filter(function(a){return a.loadPct==null||Number(a.loadPct)>0});
  var avg=workItemAvgProg(p,wiId);
  var snap=acts.map(function(a){
    var e=eById(a.empId);
    return{
      empId:a.empId,
      empName:e?e.name:"",
      prog:a.status==="done"?100:Math.max(0,Math.min(100,Number(a.prog)||0)),
      loadPct:a.loadPct!=null?a.loadPct:null,
      status:a.status,
      asgnId:a.id
    };
  });
  w.confirmedDone=true;
  w.confirmedAt=new Date().toISOString();
  w.confirmedBy=logActorName();
  w.confirmedByUid=(S.auth&&S.auth.uid)||"";
  w.confirmedByRole=isDir()?"director":"to_truong";
  w.confirmedAvgBefore=avg;
  w.confirmedSnap=snap;
  // Giữ tiến độ từng NV như cũ — không ép 100%
  p.workItems=items;
  S.proj=S.proj.map(function(x){return x.id===p.id?p:x});
  activateQueuedWorkItems(projId);
  var role=isDir()?"Giám đốc":"Trưởng nhóm";
  logProjEvent(projId,"workitem_done",{
    text:role+" "+logActorName()+" xác nhận hoàn thành hạng mục «"+workItemLabel(w)+"» (tổng 100% · giữ tiến độ từng NV để KPI)",
    meta:{workItemId:wiId,avgBefore:avg,snapN:snap.length,scope:"workitem"}
  });
  return true;
}
function applyReopenWorkItemLocal(projId,wiId){
  if(!isDir())return false;
  var p=pById(projId);if(!p||isProjLocked(p))return false;
  var items=normWorkItems(p);
  var w=items.find(function(x){return x.id===wiId});
  if(!w||!w.confirmedDone)return false;
  w.confirmedDone=false;
  w.reopenedAt=new Date().toISOString();
  w.reopenedBy=logActorName();
  // Giữ confirmedSnap làm lịch sử
  p.workItems=items;
  S.proj=S.proj.map(function(x){return x.id===p.id?p:x});
  logProjEvent(projId,"workitem_reopen",{
    text:"Giám đốc mở lại hạng mục «"+workItemLabel(w)+"» để chỉnh sửa",
    meta:{workItemId:wiId,scope:"workitem_reopen"}
  });
  return true;
}
/** Khối % từng hạng mục trên thẻ dự án. */
function projWorkItemsCardHTML(p){
  if(!p)return"";
  var items=normWorkItems(p);
  var rows=[];
  if(items.length){
    items.forEach(function(w){
      var parents=workItemParentIds(w).map(function(pid){
        var pw=items.find(function(x){return x.id===pid});
        return pw?pw.title:null;
      }).filter(Boolean);
      rows.push({title:w.title||"Hạng mục",pct:workItemProgPct(p,w.id),parents:parents});
    });
  }else{
    rows.push({title:"Tiến độ dự án",pct:projTL(p).prog,parents:[]});
  }
  var h='<div class="proj-card-wi"><div class="proj-card-wi-hd">Hạng mục · % hoàn thành</div>';
  rows.forEach(function(r){
    var pct=Math.max(0,Math.min(100,Number(r.pct)||0));
    var col=pct>=100?"#4ade80":(pct>0?"#38bdf8":"var(--c-muted4)");
    h+='<div class="proj-card-wi-row"><span class="proj-card-wi-name" title="'+esc(r.title+(r.parents&&r.parents.length?" ← "+r.parents.join(", "):""))+'">'+esc(r.title)+'</span>';
    h+='<span class="proj-card-wi-bar"><i style="width:'+pct+'%;background:'+(pct>=100?"linear-gradient(90deg,#4ade80,#86efac)":"linear-gradient(90deg,#38bdf8,#60a5fa)")+'"></i></span>';
    h+='<span class="proj-card-wi-pct" style="color:'+col+'">'+pct+'%</span></div>';
  });
  return h+'</div>';
}
function workItemUnlocked(p,wiId){
  var items=normWorkItems(p);
  var w=items.find(function(x){return x.id===wiId});
  if(!w)return true;
  var parents=workItemParentIds(w);
  if(!parents.length)return true;
  return parents.every(function(pid){return workItemIsDone(p,pid)});
}
function workItemWaitLabel(p,wiId){
  var items=normWorkItems(p);
  var w=items.find(function(x){return x.id===wiId});
  if(!w)return"";
  var parents=workItemParentIds(w);
  if(!parents.length)return"";
  var names=parents.map(function(pid){
    var pw=items.find(function(x){return x.id===pid});
    return pw?(pw.title||"Hạng mục"):"?";
  });
  return"Chờ xong: "+names.join(", ");
}
function activateQueuedWorkItems(projId){
  var p=pById(projId);if(!p)return 0;
  var n=0;
  S.asgn=S.asgn.map(function(a){
    if(a.projId!==projId||a.status!=="queued")return a;
    if(!a.workItemId||!workItemUnlocked(p,a.workItemId))return a;
    n++;
    return Object.assign({},a,{status:"active"});
  });
  return n;
}
function empOpenLoadOnProj(empId,projId){
  return (S.asgn||[]).filter(function(a){
    return a.projId===projId&&a.empId===empId&&(a.status==="active"||a.status==="paused"||a.status==="queued")&&(a.loadPct==null||Number(a.loadPct)>0);
  });
}
function empFinishedOnProj(empId,projId){
  var open=empOpenLoadOnProj(empId,projId);
  return !open.length;
}
/** Số dự án đang chiếm chỗ (không đếm từng hạng mục). */
function ac(eid){
  var seen={};
  allAsgnForEmp(eid).forEach(function(a){
    if(a.status==="active"||a.status==="paused")seen[a.projId||a.id]=1;
  });
  return Object.keys(seen).length;
}
function projFormRolesHTML(f){
  if(!canManageStaff())return"";
  var partIds=formAssignedEmpIds(f);
  var h='<div class="wi-roles"><div class="wi-box-hd" style="color:#fbbf24">Phân chức vụ</div>';
  if(!partIds.length){
    h+='<div style="font-size:12px;color:var(--c-muted4)">Chọn nhân viên vào hạng mục trước, rồi gán Trưởng nhóm / Thủ kho.</div></div>';
    return h;
  }
  if(!canAssignProjRoles(partIds.length)){
    h+='<div style="font-size:12px;color:var(--c-muted4)">'+esc(projRolePickHint())+'</div></div>';
    return h;
  }
  if(S.teamToTruong==null)S.teamToTruong=f.toTruongId||"";
  if(S.teamVatTu==null)S.teamVatTu=f.vatTuId||"";
  // giữ chọn hợp lệ
  if(S.teamToTruong&&partIds.indexOf(S.teamToTruong)<0)S.teamToTruong="";
  if(S.teamVatTu&&partIds.indexOf(S.teamVatTu)<0)S.teamVatTu="";
  f.toTruongId=S.teamToTruong||"";
  f.vatTuId=S.teamVatTu||"";
  var opts=function(sel){
    var o='<option value="">— Không chọn —</option>';
    partIds.slice().sort(function(a,b){var ea=eById(a),eb=eById(b);return (ea?ea.name:"").localeCompare(eb?eb.name:"","vi")}).forEach(function(eid){
      var e=eById(eid);if(e)o+='<option value="'+eid+'"'+(sel===eid?" selected":"")+'>'+empRoleOptLabel(e)+'</option>';
    });
    return o;
  };
  h+='<div class="grid2" style="gap:14px"><div>'+fld("Trưởng nhóm",'<select id="form-role-tt" onchange="A.formTeamTT(this.value)">'+opts(S.teamToTruong||"")+'</select>')+'</div>';
  h+='<div>'+fld("Thủ kho",'<select id="form-role-vt" onchange="A.formTeamVT(this.value)">'+opts(S.teamVatTu||"")+'</select>')+'</div></div></div>';
  return h;
}
function projWorkItemsBlockHTML(f){
  ensureFormWorkItems(f);
  var n=f.workItems.length;
  var h='<div class="wi-box">';
  h+='<div class="wi-box-top"><div class="wi-box-hd">Hạng mục công việc</div><span class="wi-box-count">'+n+' khung</span></div>';
  h+='<p class="wi-hint">Không chọn phụ thuộc = làm <b>song song</b>. Tick hạng mục cha = chỉ mở khi cha đã xong.</p>';
  f.workItems.forEach(function(w,idx){
    var parents=workItemParentIds(w);
    h+='<div class="wi-card'+(parents.length?" has-dep":"")+'" id="wi_card_'+w.id+'">';
    h+='<div class="wi-card-top">';
    h+='<span class="wi-num" aria-hidden="true">'+(idx+1)+'</span>';
    h+='<input type="text" id="wit_'+w.id+'" value="'+esc(w.title||"")+'" placeholder="Tên hạng mục '+(idx+1)+'"'+(S._focusWiTitle===w.id?' autofocus':'')+' onchange="A.wiTitle(\''+w.id+'\')">';
    if(n>1)h+='<button type="button" class="wi-del btn btn-ghost btn-sm" onclick="A.wiRemove(\''+w.id+'\')">Xoá</button>';
    h+='</div>';
    if(n>1){
      h+='<div class="wi-deps">';
      h+='<div class="wi-deps-hd"><span class="wi-deps-title">Phụ thuộc</span><span class="wi-deps-sub">để trống = song song</span></div>';
      var anyDep=false;
      h+='<div class="wi-dep-list">';
      f.workItems.forEach(function(other,oi){
        if(other.id===w.id)return;
        if(wiWouldCycle(f.workItems,w.id,other.id))return;
        anyDep=true;
        var on=parents.indexOf(other.id)>=0;
        h+='<label class="wi-dep'+(on?" on":"")+'">';
        h+='<input type="checkbox" id="wipar_'+w.id+'_'+other.id+'"'+(on?" checked":"")+' onchange="A.wiParentToggle(\''+w.id+'\',\''+other.id+'\',this.checked)">';
        h+='<span class="wi-dep-txt"><span class="wi-dep-idx">'+(oi+1)+'</span> '+esc(workItemLabel(other,oi))+'</span>';
        h+='</label>';
      });
      h+='</div>';
      if(!anyDep)h+='<div class="wi-deps-empty">Không có hạng mục khác để chọn làm cha.</div>';
      else if(parents.length)h+='<div class="wi-deps-note">Chờ xong '+parents.length+' hạng mục cha</div>';
      h+='</div>';
    }
    h+='</div>';
  });
  h+='<div class="wi-add-row">'+btn("btn-ghost btn-sm","+ Thêm hạng mục","A.wiAdd()")+'</div>';
  h+='</div>';
  return h;
}
function projWorkItemsDetailHTML(p){
  var items=normWorkItems(p);
  if(!items.length)return"";
  var locked=isProjLocked(p);
  var dirEdit=!locked&&isDir();
  var hasDeps=items.some(function(w){return workItemParentIds(w).length>0});
  var h='<div class="wi-det"><div style="font-size:13px;font-weight:700;color:var(--c-accent);margin-bottom:8px">Hạng mục thi công'+(hasDeps?" · có phụ thuộc":" · song song")+'</div>';
  items.forEach(function(w,idx){
    var unlocked=workItemUnlocked(p,w.id);
    var confirmed=!!w.confirmedDone;
    var done=workItemIsDone(p,w.id);
    var totPct=workItemProgPct(p,w.id);
    var avgLive=workItemAvgProg(p,w.id);
    var acts=workItemAsgns(p.id,w.id).filter(function(a){return a.loadPct==null||Number(a.loadPct)>0});
    var wait=workItemWaitLabel(p,w.id);
    var wiLocked=workItemEditLocked(p,w.id);
    var canEditAsgn=dirEdit&&!wiLocked;
    var st=confirmed?"Đã xác nhận":(done?"Đủ tiến độ NV":(unlocked?"Đang mở":"Chờ hạng mục cha"));
    var sc=confirmed?"#4ade80":(done?"#86efac":(unlocked?"#fbbf24":"#94a3b8"));
    h+='<div class="wi-det-item'+(confirmed?" wi-det-confirmed":"")+'">';
    h+='<div class="wi-det-hd">';
    h+='<div class="wi-det-title-row">';
    h+='<span class="wi-det-title">'+(idx+1)+'. '+esc(workItemLabel(w,idx))+'</span>';
    h+='<span class="wi-det-tot" title="'+(confirmed?"Đã xác nhận hoàn thành · tiến độ tổng 100% (giữ tiến độ từng NV)":"Tiến độ tổng = trung bình tiến độ các NV ("+avgLive+"%)")+'">';
    h+='<div class="wi-det-totbar'+(confirmed?" done":"")+'"><i style="width:'+totPct+'%"></i></div>';
    h+='<span class="wi-det-totpct'+(confirmed?" done":"")+'">'+totPct+'%</span>';
    h+='</span>';
    h+=' '+bdg(st,sc,sc+"22");
    h+='</div>';
    if(canConfirmWorkItem(p,w.id)){
      h+='<div class="wi-det-actions">'+btn("btn-primary btn-sm","Hoàn thành","A.completeWorkItem('"+p.id+"','"+w.id+"')")+'</div>';
    }else if(confirmed&&isDir()&&!locked){
      h+='<div class="wi-det-actions">'+btn("btn-ghost btn-sm","Mở lại hạng mục","A.reopenWorkItem('"+p.id+"','"+w.id+"')")+'</div>';
    }
    h+='</div>';
    if(confirmed){
      var by=w.confirmedBy||"?";
      var when=w.confirmedAt?dFmt(String(w.confirmedAt).slice(0,10)):"";
      h+='<div class="wi-det-meta wi-det-locknote">Đã lưu thống kê'+(when?" · "+esc(when):"")+' · '+esc(by)+(isDir()?"":" · chỉ giám đốc được sửa")+'</div>';
    }
    if(wait)h+='<div class="wi-det-meta" style="color:#fbbf24">'+esc(wait)+'</div>';
    if(!acts.length)h+='<div class="wi-det-meta">Chưa giao nhân viên</div>';
    else{
      h+='<div class="wi-det-asgns">';
      acts.forEach(function(a){
        var e=eById(a.empId);
        var loadTxt=a.loadPct!=null?("Giao "+a.loadPct+"%"):"";
        var prog=a.status==="done"?100:Math.max(0,Math.min(100,Number(a.prog)||0));
        var queued=a.status==="queued";
        var asgnDone=a.status==="done";
        var ed=S.editAsgnProg;
        var editing=!!(ed&&ed.asgnId===a.id);
        h+='<div class="wi-det-asgn">';
        h+='<div class="wi-det-asgn-info"><span class="wi-det-asgn-name">'+esc(e?e.name:"?")+'</span>';
        if(loadTxt)h+='<span class="wi-det-asgn-load">'+esc(loadTxt)+'</span></div>';
        else h+='</div>';
        if(editing){
          var max=ed.mode==="reopen"?99:100;
          var cur=ed.mode==="reopen"?Math.min(99,prog>=100?80:prog):(a.prog!=null?a.prog:0);
          h+='<div class="wi-det-asgn-edit" onclick="event.stopPropagation()">';
          h+='<input id="ap-prog" class="wi-det-prog-inp" type="number" min="0" max="'+max+'" step="1" value="'+esc(String(cur))+'" inputmode="numeric" aria-label="Tiến độ %" onkeydown="if(event.key===\'Enter\'){event.preventDefault();A.saveAsgnProg()}">';
          h+='<span class="wi-det-prog-unit">%</span>';
          h+='<button type="button" class="btn btn-primary btn-sm wi-det-asgn-btn" onclick="A.saveAsgnProg()">Lưu</button>';
          h+='</div>';
        }else{
          h+='<div class="wi-det-asgn-progwrap'+(queued?" queued":"")+(asgnDone?" done":"")+(canEditAsgn&&(a.status==="active"||a.status==="paused")?" tap":"")+'" title="'+(queued?"Chưa tới lượt":(canEditAsgn&&(a.status==="active"||a.status==="paused")?"Nhấn để nhập tiến độ (100% = hoàn thành phần việc)":("Tiến độ "+prog+"%")))+'"'+(canEditAsgn&&(a.status==="active"||a.status==="paused")?' role="button" tabindex="0" onclick="event.stopPropagation();A.setAsgnProg(\''+a.id+'\')"':"")+'>';
          if(queued)h+='<span class="wi-det-asgn-wait">Chưa tới lượt</span>';
          else{
            h+='<div class="wi-det-pbar"><div class="wi-det-pfill" style="width:'+prog+'%"></div></div>';
            h+='<span class="wi-det-ppct">'+prog+'%</span>';
          }
          h+='</div>';
          if(canEditAsgn&&asgnDone)h+='<button type="button" class="btn btn-ghost btn-sm wi-det-asgn-btn" onclick="event.stopPropagation();A.reopenAsgn(\''+a.id+'\')">Mở lại</button>';
        }
        h+='</div>';
      });
      h+='</div>';
    }
    h+='</div>';
  });
  if(dirEdit)h+='<div style="font-size:12px;color:var(--c-muted4);margin-top:8px;line-height:1.4"><b>Tiến độ tổng</b> = trung bình tiến độ các NV. GD/TN bấm <b>Hoàn thành</b> → tổng 100% + khoá tài liệu (tiến độ từng NV giữ nguyên). Chỉ giám đốc sửa sau khi khoá. <b>Giao %</b> ở «Giao việc».</div>';
  else if(canConfirmProjDone(p)&&!locked)h+='<div style="font-size:12px;color:var(--c-muted4);margin-top:8px;line-height:1.4">Khi hạng mục xong, bấm <b>Hoàn thành</b> để xác nhận — tiến độ tổng thành 100% và lưu thống kê (tiến độ từng NV không đổi).</div>';
  return h+'</div>';
}

function buildAsgnsFromWorkItems(p,workItems,normalizedStaff,dates){
  var created=[],partIds=[];
  workItems.forEach(function(w,idx){
    var unlocked=workItemUnlocked(p,w.id);
    Object.keys(normalizedStaff[w.id]||{}).forEach(function(eid){
      var pct=Number(normalizedStaff[w.id][eid].pct)||0;
      if(pct<=0)return;
      var emp=eById(eid);if(!emp||isOfficeStaffEmp(emp))return;
      if(partIds.indexOf(eid)<0)partIds.push(eid);
      var na=mkAsgn(eid,p.id,0,{
        startDate:dates.start,
        endDate:dates.end,
        workContent:w.title,
        workItemId:w.id,
        loadPct:pct,
        status:unlocked?"active":"queued"
      });
      S.asgn.push(na);
      recordAssign(p.id,emp,na," · "+w.title+" ("+pct+"%)");
      applyProjLocToEmp(emp,p,dates.start);
      created.push(na);
    });
  });
  return{created:created,participantIds:partIds};
}
function projAssignBlockHTML(f){
  // Tạo mới: dùng hạng mục. Sửa: vẫn cho chỉnh hạng mục + nhân sự %.
  return projWorkItemsBlockHTML(f);
}
/** Trạng thái hiển thị — «Hoàn thành» CHỈ khi GD/TN đã xác nhận (p.status=done). NV xong phần việc ≠ dự án xong. */
function projPlanStatus(p){
  if(!p)return{key:"planned",label:"Lên kế hoạch",c:"#38bdf8"};
  if(p.status==="done")return{key:"done",label:"Hoàn thành",c:"#4ade80"};
  // Chỉ tính việc thi công — bỏ việc kiểm tra của Chỉ huy trưởng
  var asgns=S.asgn.filter(function(a){return a.projId===p.id&&asgnAffectsProjProgress(a)&&(a.status==="active"||a.status==="paused"||a.status==="done"||a.status==="queued")});
  var openAsgn=asgns.filter(function(a){return a.status==="active"||a.status==="paused"||a.status==="queued"});
  if(asgns.length&&!openAsgn.length)return{key:"await_close",label:"Chờ GD/TN xác nhận",c:"#38bdf8"};
  var today=td(),start=p.startDate||"",end=p.deadline||"";
  if(start&&today<start)return{key:"planned",label:"Lên kế hoạch",c:"#38bdf8"};
  if(end&&today>end)return{key:"late",label:"Trễ hạn",c:"#ef4444"};
  return{key:"doing",label:"Đang làm",c:"#fbbf24"};
}
function isProjLocked(p){return !!(p&&p.status==="done")}
function projLockedGuard(p){
  if(!isProjLocked(p))return true;
  if(isDir())alert("Dự án đã hoàn thành — bấm «Mở lại để làm bổ sung» nếu cần sửa / thêm hạng mục.");
  else alert("Dự án đã hoàn thành (đã được giám đốc/trưởng nhóm xác nhận) — chỉ lưu trữ tham khảo, không chỉnh sửa được.");
  return false;
}
/** Chỉ Giám đốc được mở lại dự án đã hoàn thành (bổ sung / hư hỏng / khách yêu cầu làm thêm). */
function canReopenProj(p){return !!(p&&p.status==="done"&&isDir())}
/**
 * Mở lại dự án đã done → đang làm.
 * opts.progTarget (0–99): hạ tiến độ các phần việc thi công đã xong và mở lại việc đó.
 * Để null/undefined: chỉ bỏ khoá dự án (giữ việc đã xong) để thêm hạng mục mới.
 */
function applyReopenProjectLocal(projId, opts){
  opts=opts||{};
  var p=pById(projId);if(!p||p.status!=="done")return null;
  var reopened=0;
  var progTarget=opts.progTarget;
  if(progTarget!=null&&progTarget!==""&&!isNaN(Number(progTarget))){
    progTarget=Math.max(0,Math.min(99,Math.round(Number(progTarget))));
    S.asgn=S.asgn.map(function(a){
      if(a.projId!==projId||isChiefAsgn(a))return a;
      if(a.status!=="done")return a;
      if(a.loadPct!=null&&!(Number(a.loadPct)>0))return a;
      reopened++;
      return Object.assign({},a,{
        status:"active",
        prog:progTarget,
        completedAt:"",
        reopenedAt:td(),
        reopenedFromProg:a.prog!=null?a.prog:100
      });
    });
  }
  var nextStatus=(p.startDate&&td()<p.startDate)?"open":"in_progress";
  var prevDone=p.completedAt||"";
  p=Object.assign({},p,{
    status:nextStatus,
    completedAt:"",
    reopenedAt:td(),
    prevCompletedAt:prevDone
  });
  S.proj=S.proj.map(function(x){return x.id===projId?p:x});
  var by=opts.byName||logActorName();
  logProjEvent(projId,"proj_reopen",{
    empId:"",
    empName:by,
    text:"Giám đốc "+by+" mở lại dự án «"+p.name+"» để làm bổ sung"+(reopened?" · hạ "+reopened+" phần việc về "+progTarget+"%":" · giữ việc đã xong, có thể thêm hạng mục"),
    meta:{reopened:reopened,progTarget:reopened?progTarget:null,prevCompletedAt:prevDone,scope:"project"}
  });
  if(S.projView==="done")S.projView="active";
  return{reopened:reopened,status:nextStatus,progTarget:reopened?progTarget:null};
}
/** Giám đốc hạ tiến độ một phần việc đã xong → mở lại việc đó. */
function applyReopenAsgnLocal(asgnId, progTarget){
  var a=asgnById(asgnId);if(!a||a.status!=="done"||isChiefAsgn(a))return false;
  var p=pById(a.projId);
  if(p&&p.status==="done")return false; // cần mở lại dự án trước
  progTarget=Math.max(0,Math.min(99,Math.round(Number(progTarget))));
  if(isNaN(progTarget))progTarget=80;
  var e=eById(a.empId);
  S.asgn=S.asgn.map(function(x){
    if(x.id!==asgnId)return x;
    return Object.assign({},x,{
      status:"active",
      prog:progTarget,
      completedAt:"",
      reopenedAt:td(),
      reopenedFromProg:x.prog!=null?x.prog:100
    });
  });
  logProjEvent(a.projId,"asgn_reopen",{
    empId:a.empId,empName:e?e.name:"",
    text:"Giám đốc mở lại phần việc «"+asgnInfo(a).title+"» của "+(e?e.name:"?")+" → "+progTarget+"%",
    meta:{asgnId:asgnId,prog:progTarget,scope:"asgn_reopen"}
  });
  return true;
}
/** Chỉ Giám đốc hoặc Trưởng nhóm (toTruongId) của dự án — không phải chỉ huy trưởng / NV thường. */
function canConfirmProjDone(p){
  if(!p||isProjLocked(p))return false;
  if(isDir())return true;
  return !!(S.auth&&S.auth.empId&&p.toTruongId&&S.auth.empId===p.toTruongId);
}
function applyCompleteProjectLocal(projId, meta){
  meta=meta||{};
  var p=pById(projId);if(!p||p.status==="done")return 0;
  var closed=0;
  S.asgn=S.asgn.map(function(a){
    if(a.projId!==projId)return a;
    if(a.status!=="active"&&a.status!=="paused"&&a.status!=="queued")return a;
    // Việc kiểm tra Chỉ huy trưởng độc lập — không bắt buộc đóng theo dự án
    if(isChiefAsgn(a))return a;
    closed++;
    return Object.assign({},a,{status:"done",prog:100,completedAt:a.completedAt||td()});
  });
  p=Object.assign({},p,{status:"done",completedAt:p.completedAt||td()});
  S.proj=S.proj.map(function(x){return x.id===projId?p:x});
  var by=meta.byName||logActorName();
  var role=meta.byRole||(isDir()?"Giám đốc":"Trưởng nhóm");
  logProjEvent(projId,"proj_done",{
    empId:meta.empId||(isDir()?"":(S.auth&&S.auth.empId)||""),
    empName:by,
    text:role+" "+by+" xác nhận hoàn thành cả dự án «"+p.name+"»"+(closed?" ("+closed+" phần việc đóng)":""),
    meta:{closed:closed,byRole:isDir()?"director":"to_truong",scope:"project"}
  });
  return closed;
}
/** Danh sách dự án: chưa hoàn thành trước; trong nhóm giữ startDate → tên. */
function projListCmp(a,b){
  var da=projPlanStatus(a).key==="done"?1:0;
  var db=projPlanStatus(b).key==="done"?1:0;
  if(da!==db)return da-db;
  var sa=a.startDate||projTL(a).start||"";
  var sb=b.startDate||projTL(b).start||"";
  if(sa!==sb)return sa<sb?-1:1;
  return (a.name||"").localeCompare(b.name||"","vi");
}
function asgnPlanStatus(a){
  if(!a)return{key:"planned",label:"Lên kế hoạch",c:"#38bdf8"};
  if(a.status==="done")return{key:"done",label:"Hoàn thành",c:"#4ade80"};
  if(a.status==="queued")return{key:"queued",label:"Chờ hạng mục cha",c:"#94a3b8"};
  if(a.status==="paused")return{key:"paused",label:"Tạm dừng",c:"#ef4444"};
  var today=td(),start=a.startDate||"",end=asgnEndDate(a)||"";
  if(start&&today<start)return{key:"planned",label:"Lên kế hoạch",c:"#38bdf8"};
  if(end&&today>end)return{key:"late",label:"Trễ hạn",c:"#ef4444"};
  return{key:"doing",label:"Đang làm",c:"#fbbf24"};
}
function syncProjStatusFromPlan(p){
  // Không bao giờ tự đặt status=done từ tiến độ/NV — chỉ GD/TN qua completeProj.
  if(!p||p.status==="done")return p;
  var ps=projPlanStatus(p);
  if(ps.key==="planned")p.status="open";
  else p.status="in_progress";
  return p;
}
/** Khi gia hạn / đổi kế hoạch dự án: kéo lịch việc đang mở theo hạn mới. */
function syncAsgnsToProjPlan(proj, before){
  if(!proj||!proj.id||!before)return 0;
  var oldStart=before.startDate||"";
  var oldEnd=before.deadline||"";
  var newStart=proj.startDate||"";
  var newEnd=proj.deadline||"";
  if(oldStart===newStart&&oldEnd===newEnd)return 0;
  var n=0;
  S.asgn=S.asgn.map(function(a){
    if(a.projId!==proj.id)return a;
    if(a.status!=="active"&&a.status!=="paused"&&a.status!=="queued")return a;
    var next=Object.assign({},a);
    var touched=false;
    if(newStart&&(!next.startDate||next.startDate===oldStart)){
      next.startDate=newStart;
      touched=true;
    }
    if(newEnd){
      var end=next.endDate||"";
      // Gia hạn: cập nhật nếu chưa có hạn, trùng hạn cũ, hạn cũ đã trễ, hoặc hạn việc ≤ hạn dự án cũ
      if(!end||end===oldEnd||(oldEnd&&end<=oldEnd)||(end&&td()>end)||(end&&newEnd>end)){
        next.endDate=newEnd;
        touched=true;
      }else if(oldEnd&&newEnd<oldEnd&&end>newEnd){
        next.endDate=newEnd;
        touched=true;
      }
    }
    if(next.startDate&&next.endDate&&next.endDate<next.startDate){
      next.endDate=next.startDate;
      touched=true;
    }
    if(touched){n++;return next;}
    return a;
  });
  if(n){
    logProjEvent(proj.id,"plan_sync",{
      text:"Đồng bộ lịch "+n+" công việc theo kế hoạch mới ("+dFmtG(newStart)+" → "+dFmtG(newEnd)+")"
    });
  }
  return n;
}
function lateProjects(){
  return S.proj.filter(function(p){return p.status!=="done"&&projPlanStatus(p).key==="late"});
}
function lateAssignments(){
  return S.asgn.filter(function(a){return !isChiefAsgn(a)&&(a.status==="active"||a.status==="paused")}).filter(function(a){return asgnPlanStatus(a).key==="late"});
}
/** Tên hạng mục hiển thị — không dùng id phân công (tránh lặp tên theo từng người). */
function lateWorkItemLabel(p,a){
  if(a&&a.workItemId){
    var wi=(normWorkItems(p)||[]).find(function(w){return w.id===a.workItemId});
    if(wi&&wi.title)return String(wi.title).trim();
  }
  var wc=a&&String(a.workContent||"").trim();
  if(wc&&wc!==String(p.name||"").trim())return wc;
  var items=normWorkItems(p);
  if(items.length===1&&items[0].title)return String(items[0].title).trim();
  if(items.length>1&&a&&a.workItemId)return "Hạng mục";
  return String((p&&p.name)||"Hạng mục").trim();
}
/**
 * Gom trễ: dự án → từng hạng mục (1 lần) → nhân sự của hạng mục đó.
 * Trước đây lặp tên hạng mục vì mỗi phân công NV bị add 1 dòng (key = asgn.id).
 */
function lateAlertGrouped(){
  var map={},order=[];
  function ensure(pid){
    var p=pById(pid);
    if(!p||p.status==="done")return null;
    if(!map[pid]){
      map[pid]={p:p,company:projCompanyName(p)||p.customer||"",items:{},itemOrder:[]};
      order.push(pid);
    }
    return map[pid];
  }
  function itemKey(p,a,wi){
    if(wi&&wi.id)return "wi:"+wi.id;
    if(a&&a.workItemId)return "wi:"+a.workItemId;
    // Không có hạng mục riêng: 1 nhóm duy nhất / dự án (không tách theo từng NV)
    return "proj:"+p.id;
  }
  function ensureItem(g,key,title){
    if(!g.items[key]){
      g.items[key]={title:title||"Hạng mục",empIds:[],empSeen:{}};
      g.itemOrder.push(key);
    }else if(title&&(!g.items[key].title||g.items[key].title==="Hạng mục")){
      g.items[key].title=title;
    }
    return g.items[key];
  }
  function addEmpToItem(it,eid){
    if(!it||!eid||it.empSeen[eid])return;
    it.empSeen[eid]=1;
    it.empIds.push(eid);
  }
  // Dự án quá hạn kế hoạch → mọi hạng mục chưa xong + NV đang tham gia
  lateProjects().forEach(function(p){
    var g=ensure(p.id);if(!g)return;
    var items=normWorkItems(p);
    if(items.length){
      items.forEach(function(w){
        if(workItemIsDone(p,w.id))return;
        var it=ensureItem(g,itemKey(p,null,w),w.title||("Hạng mục "+((w.order||0)+1)));
        (S.asgn||[]).forEach(function(a){
          if(a.projId!==p.id||a.workItemId!==w.id)return;
          if(isChiefAsgn(a))return;
          if(a.status!=="active"&&a.status!=="paused"&&a.status!=="queued")return;
          if(a.loadPct!=null&&!(Number(a.loadPct)>0))return;
          addEmpToItem(it,a.empId);
        });
      });
    }else{
      var it0=ensureItem(g,itemKey(p,null,null),p.name||"Hạng mục");
      (S.asgn||[]).forEach(function(a){
        if(a.projId!==p.id)return;
        if(isChiefAsgn(a))return;
        if(a.status!=="active"&&a.status!=="paused"&&a.status!=="queued")return;
        addEmpToItem(it0,a.empId);
      });
      if(!it0.empIds.length)projPartIds(p).forEach(function(eid){addEmpToItem(it0,eid)});
    }
  });
  // Việc trễ hạn riêng → gắn đúng hạng mục của việc đó
  lateAssignments().forEach(function(a){
    var g=ensure(a.projId);if(!g)return;
    var p=g.p;
    var title=lateWorkItemLabel(p,a);
    var wi=a.workItemId?(normWorkItems(p)||[]).find(function(w){return w.id===a.workItemId}):null;
    var it=ensureItem(g,itemKey(p,a,wi),title);
    addEmpToItem(it,a.empId);
  });
  return order.map(function(pid){
    var g=map[pid];
    if(!g)return null;
    g.lateItems=g.itemOrder.map(function(k){return g.items[k]}).filter(function(it){return it&&it.empIds.length});
    // Hạng mục trễ nhưng chưa gán NV vẫn hiện
    if(!g.lateItems.length){
      g.lateItems=g.itemOrder.map(function(k){return g.items[k]}).filter(Boolean);
    }
    return g;
  }).filter(function(g){return g&&g.lateItems&&g.lateItems.length});
}
/** Sửa dữ liệu cũ: việc còn hạn sớm hơn hạn dự án (sau gia hạn) → kéo theo hạn dự án. */
function repairStaleAsgnDeadlines(){
  var n=0;
  S.asgn=(S.asgn||[]).map(function(a){
    if(a.status!=="active"&&a.status!=="paused"&&a.status!=="queued")return a;
    var pr=pById(a.projId);
    if(!pr||pr.status==="done"||!pr.deadline)return a;
    var end=a.endDate||"";
    if(!end||end<pr.deadline){
      n++;
      return Object.assign({},a,{endDate:pr.deadline});
    }
    return a;
  });
  return n;
}
function lateAlertBannerHTML(){
  if(!hasFullUI())return"";
  // Tự chữa hạn việc cũ sau khi đã gia hạn dự án — hết báo trễ sai
  if(repairStaleAsgnDeadlines()>0){
    try{sv();}catch(e){}
  }
  var groups=lateAlertGrouped();
  if(!groups.length)return"";
  var h='<div class="late-alert card card-p">';
  h+='<div class="late-alert-hd">⚠ Trễ kế hoạch ('+groups.length+' dự án)</div>';
  groups.slice(0,12).forEach(function(g){
    var p=g.p;
    var deadline=p.deadline||projTL(p).end||"";
    var company=g.company||projCompanyName(p)||"—";
    h+='<div class="late-alert-item" onclick="A.projDet(\''+p.id+'\')">';
    h+='<div class="late-alert-co">'+esc(company)+'</div>';
    h+='<div class="late-alert-name">'+esc(p.name||"Dự án")+'</div>';
    h+='<div class="late-alert-deadline">Đến hạn: '+esc(dFmtG(deadline))+(deadline&&td()>deadline?" · đã quá hạn":"")+'</div>';
    (g.lateItems||[]).forEach(function(it){
      var names=it.empIds.map(function(eid){var e=eById(eid);return e?e.name:null}).filter(Boolean);
      h+='<div class="late-alert-wi">';
      h+='<div class="late-alert-wi-title"><b>Hạng mục:</b> '+esc(it.title||"Hạng mục")+'</div>';
      h+='<div class="late-alert-emps"><b>Nhân sự:</b> '+(names.length?esc(names.join(" · ")):"—")+'</div>';
      h+='</div>';
    });
    h+='</div>';
  });
  if(groups.length>12)h+='<div style="font-size:12px;color:var(--c-muted4);margin-top:8px">… và '+(groups.length-12)+' dự án khác</div>';
  h+='</div>';
  return h;
}
/** Không tự đóng dự án khi mọi người xong phần mình — cần giám đốc / trưởng nhóm xác nhận. */
function maybeMarkProjDone(projId){ /* intentionally no-op */ }
function projTL(p){
  // Tiến độ dự án chỉ từ việc thi công — loại việc kiểm tra Chỉ huy trưởng
  var acts=S.asgn.filter(function(a){return a.projId===p.id&&asgnAffectsProjProgress(a)&&(a.status==="active"||a.status==="paused"||a.status==="done")});
  var openActs=acts.filter(function(a){return a.status==="active"||a.status==="paused"});
  var starts=acts.map(function(a){return a.startDate}).filter(Boolean).sort();
  var start=p.startDate||starts[0]||dAdd(td(),-14);
  var end=p.deadline||dAdd(start,acts.length?50:30);
  if(end<start)end=dAdd(start,21);
  var prog;
  if(p.status==="done")prog=100;
  else if(openActs.length)prog=Math.round(openActs.reduce(function(s,a){return s+a.prog},0)/openActs.length);
  else if(acts.length)prog=Math.round(acts.reduce(function(s,a){return s+a.prog},0)/acts.length);
  else prog=p.status==="in_progress"?30:10;
  return {start:start,end:end,prog:prog};
}
function daySpanNum(start,end){
  var s=dParse(start),e=dParse(end);
  if(!s||!e)return 1;
  return Math.max(1,Math.round((e.getTime()-s.getTime())/86400000)+1);
}
/**
 * Lịch từng hạng mục trên Gantt theo phụ thuộc:
 * cùng tầng (không chờ nhau) = song song; tầng sau = nối tiếp sau tầng trước.
 */
function workItemsGanttSpans(p){
  var items=normWorkItems(p);
  var tl=projTL(p);
  var projStart=p.startDate||tl.start||td();
  var projEnd=p.deadline||tl.end||dAdd(projStart,7);
  if(projEnd<projStart)projEnd=projStart;
  if(!items.length){
    return[{kind:"proj",p:p,wi:null,s:tl.start,e:tl.end,prog:tl.prog,title:p.name||"Dự án",unlocked:true,done:p.status==="done",flow:"parallel",depth:0}];
  }
  var depths=workItemDepthMap(items);
  var maxD=0;items.forEach(function(w){maxD=Math.max(maxD,depths[w.id]||0)});
  var totalDays=daySpanNum(projStart,projEnd);
  var levels=maxD+1;
  var slice=Math.max(1,Math.floor(totalDays/levels));
  var levelStart={},levelEnd={},cursor=projStart;
  for(var lv=0;lv<levels;lv++){
    levelStart[lv]=cursor;
    levelEnd[lv]=(lv===levels-1)?projEnd:dAdd(cursor,slice-1);
    if(levelEnd[lv]<levelStart[lv])levelEnd[lv]=levelStart[lv];
    cursor=dAdd(levelEnd[lv],1);
  }
  return items.map(function(w,idx){
    var d=depths[w.id]||0;
    var parents=workItemParentIds(w);
    var acts=workItemAsgns(p.id,w.id).filter(function(a){return a.loadPct==null||Number(a.loadPct)>0});
    var doneAts=acts.filter(function(a){return a.status==="done"&&a.completedAt}).map(function(a){return a.completedAt}).sort();
    return{
      kind:"wi",p:p,wi:w,idx:idx,depth:d,
      s:levelStart[d]||projStart,
      e:levelEnd[d]||projEnd,
      prog:workItemProgPct(p,w.id),
      title:w.title||("Hạng mục "+(idx+1)),
      unlocked:workItemUnlocked(p,w.id),
      done:workItemIsDone(p,w.id),
      completedAt:doneAts.length?doneAts[doneAts.length-1]:"",
      flow:parents.length?"sequence":"parallel",
      parents:parents
    };
  });
}
/** Các hàng Gantt: dự án 1 hạng mục = 1 hàng; nhiều hạng mục = hàng dự án + hàng từng hạng mục. */
function projGanttRows(p){
  var spans=workItemsGanttSpans(p);
  var tl=projTL(p);
  var anyDeps=spans.some(function(sp){return sp.kind==="wi"&&(sp.parents||[]).length>0});
  var flow=anyDeps?"sequence":"parallel";
  var col=groupColor(p.group);
  if(spans.length<=1&&spans[0]&&spans[0].kind==="proj"){
    return[{type:"proj",p:p,s:spans[0].s,e:spans[0].e,prog:spans[0].prog,col:col,title:p.name||"",flow:"parallel",parents:[]}];
  }
  if(spans.length===1){
    var only=spans[0];
    var onlyParents=only.parents||(only.wi?workItemParentIds(only.wi):[])||[];
    return[{type:"proj",p:p,s:only.s,e:only.e,prog:only.prog,col:col,title:only.title||p.name||"",flow:onlyParents.length?"sequence":"parallel",wi:only.wi,parents:onlyParents}];
  }
  var rows=[{type:"head",p:p,s:tl.start,e:tl.end,prog:tl.prog,col:col,flow:flow,wiCount:spans.length}];
  spans.forEach(function(sp,i){
    var parents=sp.parents||[];
    rows.push({
      type:"wi",p:p,wi:sp.wi,idx:i,s:sp.s,e:sp.e,prog:sp.prog,col:col,
      title:sp.title,unlocked:sp.unlocked,done:sp.done,
      flow:parents.length?"sequence":"parallel",
      parents:parents
    });
  });
  return rows;
}
function weekStart(d){var x=new Date(d.getTime());x.setHours(0,0,0,0);var day=x.getDay(),diff=day===0?-6:1-day;x.setDate(x.getDate()+diff);return x}
function ganttWeekGrid(weeks,wkPx){
  var h="";
  for(var i=0;i<=weeks.length;i++)h+='<div class="gantt-wk-line" style="left:'+(i*wkPx)+'px"></div>';
  return h;
}
function ganttPx(d,tMin,weeks,wkPx){
  var x=dParse(d);if(!x)return 0;
  var dayMs=86400000,totalDays=weeks.length*7;
  var days=(x.getTime()-tMin.getTime())/dayMs;
  return Math.max(0,Math.min(weeks.length*wkPx,days/totalDays*weeks.length*wkPx));
}
function ganttZoomFactor(){
  var z=Number(S.ganttZoom);
  if(!z||isNaN(z))z=1;
  return Math.max(0.75,Math.min(2.5,z));
}
function ganttZoomControlsHTML(){
  var pct=Math.round(ganttZoomFactor()*100);
  return '<div class="gantt-tools">'
    +'<span class="gantt-tools-hint">Kéo thanh vàng để xem ngày · thả về hôm nay</span>'
    +'<div class="gantt-zoom" title="Phóng to để đọc rõ / cuộn ngang">'
    +'<button type="button" class="gantt-zoom-btn" onclick="event.stopPropagation();A.ganttZoom(-1)" aria-label="Thu nhỏ">−</button>'
    +'<span class="gantt-zoom-lbl">'+pct+'%</span>'
    +'<button type="button" class="gantt-zoom-btn" onclick="event.stopPropagation();A.ganttZoom(1)" aria-label="Phóng to">+</button>'
    +'</div></div>';
}
function ganttCardWrap(title,bodyHtml,extraStyle){
  return '<div class="card card-p gantt-card"'+(extraStyle?' style="'+esc(extraStyle)+'"':"")+'><div class="gantt-card-hd"><h3>'+esc(title)+'</h3>'+ganttZoomControlsHTML()+'</div>'+bodyHtml+'</div>';
}
function ganttHTML(){
  if(!canViewSharedProg())return'<p style="color:rgba(255,255,255,.55);font-size:14px">Chỉ Giám sát / Điều hành / Giám đốc / Chỉ huy trưởng được xem biểu đồ Gantt dự án.</p>';
  var projs=S.proj.filter(function(p){return p.status!=="done"});
  if(!projs.length)return'<p style="color:rgba(255,255,255,.55);font-size:14px">Chưa có dự án đang thực hiện.</p>';
  var rows=[];
  projs.forEach(function(p){projGanttRows(p).forEach(function(r){rows.push(r)});});
  var tMin=null,tMax=null;
  rows.forEach(function(it){var a=dParse(it.s),b=dParse(it.e);if(a&&(!tMin||a<tMin))tMin=a;if(b&&(!tMax||b>tMax))tMax=b});
  var todayD=dParse(td());
  if(todayD){if(!tMin||todayD<tMin)tMin=new Date(todayD.getTime());if(!tMax||todayD>tMax)tMax=new Date(todayD.getTime())}
  if(!tMin||!tMax){tMin=dParse(td());tMax=dParse(dAdd(td(),30))}
  tMin=weekStart(tMin);tMin.setDate(tMin.getDate()-7);
  tMax=new Date(tMax.getTime());tMax.setDate(tMax.getDate()+14);
  var wkPx=Math.round(80*ganttZoomFactor()),weeks=[],wcur=new Date(tMin);
  while(wcur<=tMax){weeks.push(new Date(wcur));wcur.setDate(wcur.getDate()+7)}
  if(weeks.length<5){while(weeks.length<5){var w=weeks[weeks.length-1],n=new Date(w);n.setDate(n.getDate()+7);weeks.push(n)}}
  tMin=new Date(weeks[0].getTime());tMin.setHours(0,0,0,0);
  var trackW=weeks.length*wkPx;
  var tMaxMs=tMin.getTime()+weeks.length*7*86400000;
  function px(d){return ganttPx(d,tMin,weeks,wkPx)}
  var h='<div class="gantt-root" style="--gantt-wkpx:'+wkPx+'px" data-tmin="'+tMin.getTime()+'" data-tmax="'+tMaxMs+'" data-twidth="'+trackW+'" data-wkpx="'+wkPx+'" data-weeks="'+weeks.length+'">';
  h+='<div class="gantt-wk-overlay"><div class="gantt-wk-lines" style="width:'+trackW+'px">'+ganttWeekGrid(weeks,wkPx)+'</div></div>';
  h+='<div class="gantt-needle" title="Kéo để xem ngày — thả chuột về hôm nay"><div class="gantt-needle-hit"></div><div class="gantt-needle-line"></div></div>';
  h+='<svg class="gantt-dep-layer" aria-hidden="true"></svg>';
  h+='<div class="gantt-sticky"><div class="gantt-date-tip gantt-date-tip-drag" title="Kéo để xem ngày">—</div><div class="gantt-row-flex"><div class="gantt-lbl-col">Dự án / hạng mục</div><div class="gantt-scroll gantt-sync"><div class="gantt-ruler" style="width:'+trackW+'px">';
  weeks.forEach(function(w,i){h+='<div class="gantt-week" style="left:'+(i*wkPx)+'px;width:'+wkPx+'px">'+dFmtGanttWeek(w)+'</div>'});
  h+='</div></div></div></div>';
  rows.forEach(function(it){
    var l=px(it.s),wbar=Math.max(4,px(it.e)-l),prog=Math.max(0,Math.min(100,Number(it.prog)||0)),pw=Math.max(2,wbar*prog/100);
    var days=projDays(it.s,it.e);
    var parentNums=it.type==="wi"||(it.parents&&it.parents.length)?ganttParentNums(it.p,it.parents||[]):[];
    var waitLbl=ganttWaitLabel(parentNums);
    if(it.type==="head"){
      var company=ganttCompanyLbl(it.p),full=projCompanyShort(it.p)||projCompanyName(it.p)||"";
      var headTip=(it.p.name||"Dự án")+" · "+(it.wiCount||0)+" hạng mục · tiến độ "+prog+"%"+(it.flow==="sequence"?" · có hạng mục nối tiếp":" · song song");
      h+='<div class="gantt-body-row gantt-proj-head"><div class="gantt-lbl" title="'+esc(headTip)+'">';
      h+='<span class="gantt-name-title gantt-name" data-act="projDet" data-id="'+esc(it.p.id)+'"'+(full?' title="'+esc(full)+'"':"")+'>'+esc(company)+'</span>';
      h+='<span class="gantt-name-dates">'+(it.wiCount||0)+' hạng mục'+(it.flow==="sequence"?' · có nối tiếp':" · song song")+'</span>';
      h+='</div><div class="gantt-scroll gantt-sync"><div class="gantt-track-px" style="width:'+trackW+'px;height:28px">';
      h+='<div class="gantt-bar-wrap" style="left:'+l+'px;width:'+wbar+'px;height:12px" title="'+esc(headTip)+'">';
      h+='<div class="gantt-bar-bg" style="background:'+it.col+'18;border-color:'+it.col+'40"></div>';
      h+='<div class="gantt-bar" style="width:'+pw+'px;background:linear-gradient(90deg,'+it.col+'99,'+it.col+'66)"></div>';
      h+='</div></div></div></div>';
      return;
    }
    var locked=it.type==="wi"&&!it.unlocked;
    var label=it.type==="wi"?it.title:(ganttBarText(it.p)||it.p.name||"");
    var barTip;
    if(it.type==="wi"){
      barTip=(it.idx+1)+". "+(it.title||"")+" · "+days+" · "+prog+"%";
      if(waitLbl)barTip+=" · "+waitLbl;
    }else{
      barTip=(it.title||it.p.name||"")+" · "+days+" · "+prog+"%";
      if(waitLbl)barTip+=" · "+waitLbl;
    }
    var lblHtml;
    if(it.type==="wi"){
      lblHtml='<span class="gantt-name-title gantt-name" data-act="projDet" data-id="'+esc(it.p.id)+'" title="'+esc(barTip)+'"><span class="gantt-wi-idx">'+(it.idx+1)+'.</span>'+esc(shortGanttText(it.title,18))+'</span>';
      lblHtml+='<span class="gantt-name-dates">'+dFmtCard(it.s)+' – '+dFmtCard(it.e)+(it.done?" · xong":"")+'</span>';
    }else{
      lblHtml=ganttLblHTML(it.p,it.s,it.e);
    }
    h+='<div class="gantt-body-row'+(it.type==="wi"?" gantt-wi-row":"")+(parentNums.length?" gantt-wi-dep":"")+'"><div class="gantt-lbl" title="'+esc(barTip)+'">'+lblHtml+'</div>';
    h+='<div class="gantt-scroll gantt-sync"><div class="gantt-track-px" style="width:'+trackW+'px">';
    var depAttrs="";
    if(it.type==="wi"&&it.wi){
      depAttrs=' data-gantt-wi="'+esc(it.wi.id)+'" data-gantt-proj="'+esc(it.p.id)+'" data-gantt-parents="'+esc((it.parents||[]).join(","))+'"';
    }
    h+='<div class="gantt-bar-wrap'+(locked?" gantt-wi-locked":"")+(parentNums.length?" gantt-wi-depbar":"")+'" style="left:'+l+'px;width:'+wbar+'px" title="'+esc(barTip)+'"'+depAttrs+'>';
    h+='<div class="gantt-bar-bg" style="background:'+it.col+'28;border-color:'+(parentNums.length?"rgba(251,191,36,.7)":(it.col+"55"))+'"></div>';
    h+='<div class="gantt-bar" style="width:'+pw+'px;background:linear-gradient(90deg,'+it.col+','+it.col+'bb)"></div>';
    h+=ganttBarInnerHTML(wbar,{label:label,days:days,pct:prog,tip:barTip});
    h+='</div></div></div></div>';
  });
  return h+'</div>';
}
function drawGanttDepLinks(root){
  var svg=root.querySelector(".gantt-dep-layer");
  if(!svg)return;
  var rr=root.getBoundingClientRect();
  var h=Math.max(root.offsetHeight||0,rr.height||0);
  var w=Math.max(root.offsetWidth||0,rr.width||0);
  svg.setAttribute("width",String(w));
  svg.setAttribute("height",String(h));
  svg.setAttribute("viewBox","0 0 "+w+" "+h);
  while(svg.firstChild)svg.removeChild(svg.firstChild);
  var bars=root.querySelectorAll(".gantt-bar-wrap[data-gantt-wi]");
  var byKey={};
  Array.prototype.forEach.call(bars,function(el){
    byKey[el.getAttribute("data-gantt-proj")+"|"+el.getAttribute("data-gantt-wi")]=el;
  });
  var NS="http://www.w3.org/2000/svg";
  Array.prototype.forEach.call(bars,function(child){
    var parents=(child.getAttribute("data-gantt-parents")||"").split(",").filter(Boolean);
    if(!parents.length)return;
    var cr=child.getBoundingClientRect();
    if(cr.width<1&&cr.height<1)return;
    var x2=cr.left-rr.left;
    var y2=cr.top+cr.height/2-rr.top;
    var proj=child.getAttribute("data-gantt-proj");
    parents.forEach(function(pid){
      var parent=byKey[proj+"|"+pid];
      if(!parent)return;
      var pr=parent.getBoundingClientRect();
      if(pr.width<1&&pr.height<1)return;
      var x1=pr.right-rr.left;
      var y1=pr.top+pr.height/2-rr.top;
      // Mũi tên nhỏ (~5px) tại đầu hạng mục con; đường dừng trước mũi
      var ah=5,aw=3.2;
      var dir=x2>=x1?1:-1;
      var tipX=x2,tipY=y2;
      var baseX=tipX-dir*ah;
      var lineEndX=baseX;
      var d;
      if(Math.abs(y2-y1)<1){
        d="M "+x1+" "+y1+" L "+lineEndX+" "+y2;
      }else if(Math.abs(x2-x1)<1){
        d="M "+x1+" "+y1+" L "+x1+" "+y2;
        // mũi tên hướng xuống/lên theo hàng
        dir=y2>=y1?1:-1;
        tipX=x2;tipY=y2;
        baseX=tipX;
        var baseY=tipY-dir*ah;
        d="M "+x1+" "+y1+" L "+x2+" "+baseY;
        var pathV=document.createElementNS(NS,"path");
        pathV.setAttribute("class","gantt-dep-path");
        pathV.setAttribute("d",d);
        svg.appendChild(pathV);
        var arrV=document.createElementNS(NS,"path");
        arrV.setAttribute("class","gantt-dep-arrow");
        arrV.setAttribute("d","M "+tipX+" "+tipY+" L "+(tipX-aw)+" "+baseY+" L "+(tipX+aw)+" "+baseY+" Z");
        svg.appendChild(arrV);
        return;
      }else{
        d="M "+x1+" "+y1+" L "+x1+" "+y2+" L "+lineEndX+" "+y2;
      }
      var path=document.createElementNS(NS,"path");
      path.setAttribute("class","gantt-dep-path");
      path.setAttribute("d",d);
      svg.appendChild(path);
      var arr=document.createElementNS(NS,"path");
      arr.setAttribute("class","gantt-dep-arrow");
      arr.setAttribute("d","M "+tipX+" "+tipY+" L "+baseX+" "+(tipY-aw)+" L "+baseX+" "+(tipY+aw)+" Z");
      svg.appendChild(arr);
    });
  });
}
function initGantt(){
  document.querySelectorAll(".gantt-root").forEach(function(root){
    if(root._gOk)return;root._gOk=1;
    var tMin=+root.dataset.tmin,tMax=+root.dataset.tmax,tw=+root.dataset.twidth,weeks=+root.dataset.weeks||1,span=tMax-tMin||1;
    var scrolls=root.querySelectorAll(".gantt-sync"),needle=root.querySelector(".gantt-needle"),tip=root.querySelector(".gantt-date-tip"),sticky=root.querySelector(".gantt-sticky"),wkLines=root.querySelector(".gantt-wk-overlay .gantt-wk-lines");
    if(!scrolls.length||!needle||!tip||!sticky)return;
    var pinX=0,dragging=false,homePin=0;
    function dateAt(cx){var d=new Date(tMin+Math.max(0,Math.min(tw,cx))/tw*span);return dFmtCard(d.getFullYear()+"-"+pad2(d.getMonth()+1)+"-"+pad2(d.getDate()))}
    function defaultPin(sc){return Math.max(48,Math.min(sc.clientWidth-24,sc.clientWidth*0.32))}
    function placeNeedle(sc){
      var rr=root.getBoundingClientRect(),sr=sc.getBoundingClientRect(),sb=sticky.getBoundingClientRect();
      needle.style.left=(sr.left-rr.left+pinX)+"px";
      tip.style.left=(sr.left-sb.left+pinX)+"px";
      tip.textContent=dateAt(sc.scrollLeft+pinX);
      tip.classList.toggle("dragging",dragging);
      needle.classList.toggle("dragging",dragging);
    }
    function refresh(){
      var sc=scrolls[0],rr=root.getBoundingClientRect(),sr=sc.getBoundingClientRect();
      if(!dragging){
        // Giữ kim ở vị trí «hôm nay» trong khung nhìn (không ép 32% khi đang kéo)
        var today=dParse(td());
        if(today){
          var todayX=Math.max(0,Math.min(tw,(today.getTime()-tMin)/span*tw));
          pinX=Math.max(24,Math.min(sr.width-24,todayX-sc.scrollLeft));
        }else{
          pinX=defaultPin(sc);
        }
        homePin=pinX;
      }else{
        pinX=Math.max(24,Math.min(sr.width-24,pinX));
      }
      placeNeedle(sc);
      if(wkLines)wkLines.style.transform="translateX(-"+sc.scrollLeft+"px)";
      drawGanttDepLinks(root);
    }
    function syncScroll(src){scrolls.forEach(function(o){if(o!==src&&o.scrollLeft!==src.scrollLeft)o.scrollLeft=src.scrollLeft});refresh()}
    function scrollToToday(){
      var sc=scrolls[0];
      if(!sc||sc.clientWidth<1)return false;
      dragging=false;
      var prefer=defaultPin(sc);
      var today=dParse(td());
      if(!today)return false;
      var todayX=Math.max(0,Math.min(tw,(today.getTime()-tMin)/span*tw));
      var sl=Math.max(0,Math.min(Math.max(0,tw-sc.clientWidth),todayX-prefer));
      scrolls.forEach(function(s){s.scrollLeft=sl});
      pinX=Math.max(24,Math.min(sc.clientWidth-24,todayX-sl));
      homePin=pinX;
      placeNeedle(sc);
      if(wkLines)wkLines.style.transform="translateX(-"+sc.scrollLeft+"px)";
      drawGanttDepLinks(root);
      return true;
    }
    function startDrag(ev){
      if(ev.button!=null&&ev.button!==0)return;
      ev.preventDefault();
      ev.stopPropagation();
      dragging=true;
      tip.classList.add("dragging");
      needle.classList.add("dragging");
      moveDrag(ev);
      function onMove(e){moveDrag(e)}
      function onUp(e){
        document.removeEventListener("pointermove",onMove,true);
        document.removeEventListener("pointerup",onUp,true);
        document.removeEventListener("pointercancel",onUp,true);
        endDrag(e);
      }
      document.addEventListener("pointermove",onMove,true);
      document.addEventListener("pointerup",onUp,true);
      document.addEventListener("pointercancel",onUp,true);
    }
    function moveDrag(ev){
      if(!dragging)return;
      var sc=scrolls[0],sr=sc.getBoundingClientRect();
      pinX=Math.max(24,Math.min(sr.width-24,ev.clientX-sr.left));
      placeNeedle(sc);
    }
    function endDrag(){
      if(!dragging)return;
      dragging=false;
      tip.classList.remove("dragging");
      needle.classList.remove("dragging");
      scrollToToday();
    }
    needle.addEventListener("pointerdown",startDrag);
    tip.addEventListener("pointerdown",startDrag);
    scrolls.forEach(function(sc){sc.addEventListener("scroll",function(){syncScroll(sc)})});
    root.addEventListener("wheel",function(ev){
      var sc=scrolls[0];
      if(!sc)return;
      // Ctrl + lăn → phóng to / thu nhỏ
      if(ev.ctrlKey||ev.metaKey){
        ev.preventDefault();
        if(ev.deltaY<0)A.ganttZoom(1);
        else if(ev.deltaY>0)A.ganttZoom(-1);
        return;
      }
      var dx=ev.deltaX,dy=ev.deltaY;
      if(Math.abs(dx)<Math.abs(dy))dx=dy;
      if(!dx)return;
      var max=sc.scrollWidth-sc.clientWidth;
      if(max<=0)return;
      var next=Math.max(0,Math.min(max,sc.scrollLeft+dx));
      if(next===sc.scrollLeft)return;
      ev.preventDefault();
      scrolls.forEach(function(s){s.scrollLeft=next});
      refresh();
    },{passive:false});
    scrollToToday();
    requestAnimationFrame(function(){scrollToToday();requestAnimationFrame(scrollToToday)});
    setTimeout(scrollToToday,80);
    setTimeout(scrollToToday,250);
    if(!initGantt._resize){initGantt._resize=1;window.addEventListener("resize",function(){document.querySelectorAll(".gantt-root").forEach(function(r){if(r._gRefresh)r._gRefresh();});});}
    root._gRefresh=refresh;
  });
}
function packEmpGanttByProject(acts){
  var map={},order=[];
  (acts||[]).slice().sort(function(a,b){return (a.startDate||"").localeCompare(b.startDate||"")||(a.endDate||"").localeCompare(b.endDate||"");}).forEach(function(a){
    var pid=a.projId||("_"+a.id);
    if(!map[pid]){map[pid]=[];order.push(pid);}
    map[pid].push(a);
  });
  return order.map(function(pid){
    var p=pid.charAt(0)==="_"?null:pById(pid);
    var laneActs=map[pid];
    var first=laneActs[0]?asgnInfo(laneActs[0]):null;
    var title=(p&&p.name)||(first&&first.title)||"Công việc";
    var sub="";
    if(laneActs.length===1&&first&&first.title&&first.title!==title)sub=shortGanttText(first.title,22);
    else if(laneActs.length>1)sub=laneActs.length+" hạng mục";
    else sub=p&&p.group?p.group:"";
    return{projId:pid,title:title,sub:sub,acts:laneActs};
  });
}
function empGanttHTML(empId,opts){
  opts=opts||{};
  var acts=empActs(empId);
  if(!acts.length)return'<p style="color:var(--c-muted);font-size:13px;margin:0">Chưa có công việc trên lịch.</p>';
  var lanes=packEmpGanttByProject(acts);
  var items=[];
  acts.forEach(function(a){
    items.push({a:a,s:a.startDate||td(),e:asgnEndDate(a)||a.startDate||td(),prog:Math.max(0,Math.min(100,a.prog||0)),col:a.status==="paused"?"#ef4444":groupColor((pById(a.projId)||{}).group||"Hệ thống")});
  });
  var tMin=null,tMax=null;
  items.forEach(function(it){var a=dParse(it.s),b=dParse(it.e);if(a&&(!tMin||a<tMin))tMin=a;if(b&&(!tMax||b>tMax))tMax=b});
  var todayD=dParse(td());
  if(todayD){if(!tMin||todayD<tMin)tMin=new Date(todayD.getTime());if(!tMax||todayD>tMax)tMax=new Date(todayD.getTime())}
  if(!tMin||!tMax){tMin=dParse(td());tMax=dParse(dAdd(td(),30))}
  tMin=weekStart(tMin);tMin.setDate(tMin.getDate()-7);
  tMax=new Date(tMax.getTime());tMax.setDate(tMax.getDate()+14);
  var wkPx=Math.round(72*ganttZoomFactor()),weeks=[],wcur=new Date(tMin);
  while(wcur<=tMax){weeks.push(new Date(wcur));wcur.setDate(wcur.getDate()+7)}
  if(weeks.length<4){while(weeks.length<4){var w=weeks[weeks.length-1],n=new Date(w);n.setDate(n.getDate()+7);weeks.push(n)}}
  tMin=new Date(weeks[0].getTime());tMin.setHours(0,0,0,0);
  var trackW=weeks.length*wkPx;
  var tMaxMs=tMin.getTime()+weeks.length*7*86400000;
  function px(d){return ganttPx(d,tMin,weeks,wkPx)}
  var lblW=150;
  var h='<div class="gantt-root emp-gantt-root" style="--gantt-wkpx:'+wkPx+'px;--gantt-head-h:36px" data-tmin="'+tMin.getTime()+'" data-tmax="'+tMaxMs+'" data-twidth="'+trackW+'" data-wkpx="'+wkPx+'" data-weeks="'+weeks.length+'">';
  h+='<div class="gantt-wk-overlay" style="left:'+lblW+'px"><div class="gantt-wk-lines" style="width:'+trackW+'px">'+ganttWeekGrid(weeks,wkPx)+'</div></div>';
  h+='<div class="gantt-needle" title="Kéo để xem ngày — thả chuột về hôm nay"><div class="gantt-needle-hit"></div><div class="gantt-needle-line"></div></div>';
  h+='<div class="gantt-sticky"><div class="gantt-date-tip gantt-date-tip-drag" title="Kéo để xem ngày">—</div><div class="gantt-row-flex"><div class="gantt-lbl-col" style="width:'+lblW+'px">Dự án</div><div class="gantt-scroll gantt-sync"><div class="gantt-ruler" style="width:'+trackW+'px">';
  weeks.forEach(function(w,i){h+='<div class="gantt-week" style="left:'+(i*wkPx)+'px;width:'+wkPx+'px">'+dFmtGanttWeek(w)+'</div>'});
  h+='</div></div></div></div>';
  lanes.forEach(function(lane){
    var laneActs=lane.acts||[];
    h+='<div class="gantt-body-row emp-gantt-lane"><div class="gantt-lbl" style="width:'+lblW+'px" title="'+esc(lane.title+(lane.sub?" · "+lane.sub:""))+'"><span class="gantt-name-title">'+esc(shortGanttText(lane.title,20))+'</span><span class="gantt-name-dates">'+esc(lane.sub||"")+'</span></div>';
    h+='<div class="gantt-scroll gantt-sync"><div class="gantt-track-px emp-gantt-track" style="width:'+trackW+'px">';
    laneActs.forEach(function(a){
      var info=asgnInfo(a),s=a.startDate||td(),e=asgnEndDate(a)||s,col=a.status==="paused"?"#ef4444":groupColor((pById(a.projId)||{}).group||"Hệ thống");
      var l=px(s),wbar=Math.max(4,px(e)-l),prog=Math.max(0,Math.min(100,a.prog||0)),pw=Math.max(2,wbar*prog/100);
      var barLabel=a.workContent?shortGanttText(a.workContent,28):shortGanttText(info.title,28);
      var tip=info.title+" · "+dFmtG(s)+" → "+dFmtG(e)+(a.status==="paused"?" · Tạm dừng":"");
      h+='<div class="gantt-bar-wrap'+(a.status==="paused"?" emp-gantt-paused":"")+'" style="left:'+l+'px;width:'+wbar+'px'+(opts.clickable?";cursor:pointer":"")+'" title="'+esc(tip)+'"'+(opts.clickable?' onclick="event.stopPropagation();A.empAsgnCard(\''+a.id+'\',\''+(a._orgId||currentOrgId())+'\')"':"")+'>';
      h+='<div class="gantt-bar-bg" style="background:'+col+'28;border-color:'+col+'66"></div>';
      h+='<div class="gantt-bar" style="width:'+pw+'px;background:linear-gradient(90deg,'+col+','+col+'bb)"></div>';
      h+=ganttBarInnerHTML(wbar,{label:barLabel,pct:prog,tip:info.title});
      h+='</div>';
    });
    h+='</div></div></div>';
  });
  return h+'</div>';
}
function mkAsgn(empId,projId,prog,opts){
  opts=opts||{};
  var a={id:uid(),projId:projId,empId:empId,startDate:opts.startDate||td(),endDate:opts.endDate||"",workContent:opts.workContent||"",custName:opts.custName||"",contact:opts.contact||"",prog:prog,status:opts.status||"active",quality:null,qNote:"",completedAt:opts.completedAt||"",reworks:opts.reworks||[],complaint:!!opts.complaint,praise:!!opts.praise};
  if(opts.parentAsgnId)a.parentAsgnId=opts.parentAsgnId;
  if(opts.handoffFrom)a.handoffFrom=opts.handoffFrom;
  if(opts.pauseNote)a.pauseNote=opts.pauseNote;
  if(opts.arriveAt)a.arriveAt=opts.arriveAt;
  if(opts.scheduleAdj)a.scheduleAdj=opts.scheduleAdj;
  if(opts.schedNotify)a.schedNotify=opts.schedNotify;
  if(opts.workItemId)a.workItemId=opts.workItemId;
  if(opts.loadPct!=null&&opts.loadPct!=="")a.loadPct=Number(opts.loadPct)||0;
  if(opts.loadPctManual)a.loadPctManual=true;
  if(opts.taskKind)a.taskKind=opts.taskKind;
  if(opts.assignedBy){a.assignedBy=opts.assignedBy;a.assignedByUid=opts.assignedByUid||"";a.assignedByRole=opts.assignedByRole||"";a.assignedAt=opts.assignedAt||new Date().toISOString();}
  else if(!opts.noAssigner)stampAsgnAssigner(a);
  if(isChiefEmp(eById(empId))){a.taskKind="chief";if(!a.workContent)a.workContent="Kiểm tra / báo cáo tình trạng thi công";}
  return a;
}
function asgnById(id,orgHint){
  if(!id)return null;
  if(orgHint&&orgHint!==currentOrgId()&&S.asgnOther){
    var o=(S.asgnOther||[]).find(function(a){return a.id===id&&(!a._orgId||a._orgId===orgHint)});
    if(o)return Object.assign({},o,{_orgId:o._orgId||orgHint});
  }
  var a=(S.asgn||[]).find(function(x){return x.id===id});
  if(a)return Object.assign({},a,{_orgId:a._orgId||currentOrgId()});
  var other=(S.asgnOther||[]).find(function(x){return x.id===id});
  if(other)return Object.assign({},other,{_orgId:other._orgId||S.otherOrgId||orgHint||""});
  return null;
}
function asgnHandoffLine(a){if(a.handoffFrom){var e=eById(a.handoffFrom);return "Tiếp nối từ "+(e?esc(e.name):"?")+" · giữ "+a.prog+"%";}if(a.parentAsgnId){var p=asgnById(a.parentAsgnId);if(p){var e2=eById(p.empId);return "Làm tiếp phần dở ("+a.prog+"%) từ "+(e2?esc(e2.name):"?");}}return ""}
function asgnDates(proj){var tl=projTL(proj);return{start:proj.startDate||tl.start||td(),end:proj.deadline||tl.end||dAdd(proj.startDate||td(),30)}}
function asgnInfo(a){
  var pr=pById(a.projId),c=pr&&pr.custId?cById(pr.custId):null;
  var wiTitle="";
  if(a.workItemId&&pr){
    var wi=(normWorkItems(pr)||[]).find(function(w){return w.id===a.workItemId});
    if(wi)wiTitle=wi.title||"";
  }
  var title=a.workContent||wiTitle||(pr?pr.name:"Công việc");
  if(wiTitle&&pr&&pr.name&&title===wiTitle)title=pr.name+" · "+wiTitle;
  return{title:title,cust:a.custName||(c?custDisplayName(c):(pr?pr.customer:""))||"",contact:a.contact||(c?c.contact:"")||(pr&&pr.note&&pr.note.indexOf("Liên hệ:")===0?pr.note.replace(/^Liên hệ:\s*/,""):"")};
}
function applyProjLocToEmp(emp,proj,startDate){var pl=pLoc(proj);if(!pl||pl.lat==null)return;emp.lastLoc={label:pl.name||proj.province,lat:pl.lat,lng:pl.lng,date:startDate||td()}}
function seedDemo(){
  if(S.asgn.length)return false;
  var JOB_PLAN=[0,1,2,3,1,2,0];
  function projsFor(g){
    var list=S.proj.filter(function(p){return p.group===g&&p.status!=="done"});
    var names=["Đồng Nai","Bình Dương","Long An"];
    while(list.length<3){
      var idx=list.length,offs=[[-28,42],[-14,35],[3,50]][idx%3];
      var st=dAdd(td(),offs[0]),dl=dAdd(st,offs[1]);
      var p=mkProj("Thi công "+g+" — "+names[idx],g,names[idx],{startDate:st,deadline:dl});
      S.proj.push(p);list.push(p);
    }
    return list;
  }

  getGroups().forEach(function(g){
    if(isOfficeStaffGroup(g))return;
    var emps=S.emp.filter(function(e){return e.group===g});
    var projs=projsFor(g);
    emps.forEach(function(e,i){
      var n=JOB_PLAN[i%JOB_PLAN.length];
      for(var j=0;j<n;j++)S.asgn.push(mkAsgn(e.id,projs[j].id,15+j*20));
    });
  });
  sv();return S.asgn.length>0;
}

function toggleSearch(){
  var sw=document.getElementById("search-wrap");
  sw.style.display=sw.style.display==="none"?"block":"none";
  if(sw.style.display==="block")document.getElementById("search-inp").focus();
}

function showNoti(title, opts, type) {
  try {
    if (opts && !opts.vibrate) {
      opts.vibrate = type === "remind" ? [0, 250, 120, 250, 120, 350, 120, 350] : [0, 280, 140, 280, 140, 280, 140, 400];
    }
    new Notification(title, opts);
  } catch (e) {}
  try {
    var a = new Audio(appUrl(type === "remind" ? "remind.wav" : "noti.wav"));
    a.play().catch(function(){});
  } catch (e) {}
}
var LS=null;try{localStorage.setItem("_t","1");localStorage.removeItem("_t");LS=localStorage}catch(e){}
var mem={};
function load(k,fb){if(!LS)return mem.hasOwnProperty(k)?mem[k]:fb;try{var v=LS.getItem(k);return v?JSON.parse(v):fb}catch(e){return fb}}
function ps2(k,v){if(!LS){mem[k]=v;return}try{LS.setItem(k,JSON.stringify(v))}catch(e){}}
var _persistCacheTimer=null,_persistCachePending=0;
function flushPersistCache(){
  if(_persistCacheTimer){clearTimeout(_persistCacheTimer);_persistCacheTimer=null;}
  if(!_persistCachePending)return;
  _persistCachePending=0;
  try{
    ps2("cv3_e",S.emp);ps2("cv3_c",S.cust);ps2Ws("cv3_p",S.proj);ps2Ws("cv3_a",S.asgn);ps2Ws("cv3_pl",S.projLog);ps2("cv3_s",S.cfg);ps2Ws("cv3_r",S.reminders||[]);ps2Ws("cv3_audit",S.auditLog||[]);ps2Ws("cv3_trash",S.trash||[]);
  }catch(e){}
}
function schedulePersistCache(){
  _persistCachePending=1;
  if(_persistCacheTimer)return;
  _persistCacheTimer=setTimeout(function(){
    _persistCacheTimer=null;
    flushPersistCache();
  },280);
}
document.addEventListener("visibilitychange",function(){
  if(document.visibilityState==="hidden")flushPersistCache();
});
window.addEventListener("pagehide",flushPersistCache);
/** Org đang xem — dùng cho cache local theo đội (tránh lẫn dự án 2 phần). */
function storageOrgId(){
  try{
    if(typeof window.__CV3_getOrgId==="function"){
      var g=window.__CV3_getOrgId();
      if(g)return g==="saree"?"cong-trinh":g;
    }
  }catch(e0){}
  try{
    var a=LS&&LS.getItem("cv3_active_org");
    if(a)return a==="saree"?"cong-trinh":a;
  }catch(e1){}
  if(typeof S!=="undefined"&&S.auth&&S.auth.orgId)return S.auth.orgId==="saree"?"cong-trinh":S.auth.orgId;
  return window.FIREBASE_DEFAULT_ORG||"cong-trinh";
}
function wsKey(base){return base+"@"+storageOrgId()}
function loadWs(base,fb){
  var k=wsKey(base);
  if(LS){
    try{
      var raw=LS.getItem(k);
      if(raw!=null&&raw!=="")return JSON.parse(raw);
    }catch(e){}
  }else if(mem.hasOwnProperty(k))return mem[k];
  // Migrate cache cũ (không gắn org) → Công trình tỉnh lần đầu
  // Không migrate patch=0 (bị reset khi đổi đội) — để applyRemote / bump bắt kịp cloud
  var oid=storageOrgId();
  if(oid==="cong-trinh"){
    var legacy=load(base,null);
    if(legacy!=null){
      if(base==="cv3_patch"&&(+legacy||0)<=0)return fb;
      ps2(k,legacy);
      return legacy;
    }
  }
  return fb;
}
function ps2Ws(base,v){ps2(wsKey(base),v)}
function applyTheme(t){
  t=t||(S&&S.cfg&&S.cfg.theme)||"dark";
  if(t!=="light")t="dark";
  if(S&&S.cfg)S.cfg.theme=t;
  document.documentElement.setAttribute("data-theme",t);
  var meta=document.getElementById("meta-theme-color");
  if(meta)meta.setAttribute("content",t==="light"?"#1a6fd4":"#1a6fd4");
}
function themeModeBody(){
  var t=(S.cfg&&S.cfg.theme)||"dark";
  return ''
    +'<div class="theme-toggle">'
    +'<button type="button" class="theme-opt'+(t==="dark"?" active":"")+'" onclick="A.setTheme(\'dark\')">🌙 Tối</button>'
    +'<button type="button" class="theme-opt'+(t==="light"?" active":"")+'" onclick="A.setTheme(\'light\')">☀️ Sáng</button>'
    +'</div>';
}
var _lsEmp=load("cv3_e",[]);
var _lsCust=load("cv3_c",[]);
var _lsCfg=load("cv3_s",{});
var S={tab:"dash",selProj:"",selProjDet:"",selEmp:"",selCust:"",projView:"active",ganttZoom:1,giaoProj:"",giaoMode:"",goiYReq:{},giaoPick:{},teamToTruong:"",teamVatTu:"",modal:null,form:null,helpOpen:0,helpMode:"annotate",hist:[],histView:"actions",expGrp:{},empPushBusy:0,empPushMsg:"",remindPushBusy:0,remindPushMsg:"",
  kpiPeriod:"month",kpiMonth:"",
  emp:_lsEmp,empAll:_lsEmp,asgnOther:[],projOther:[],otherOrgId:"",cust:_lsCust,proj:loadWs("cv3_p",[]),asgn:loadWs("cv3_a",[]),projLog:loadWs("cv3_pl",[]),cfg:Object.assign({},DS,_lsCfg),auth:{role:null,empId:null,username:"",uid:"",displayName:"",age:null,orgId:"",orgIds:[]},chat:[],chatTo:null,pendingChatDm:"",leaveBoardId:"",reports:[],attendance:[],leaveReqs:loadWs("cv3_leave",[]),leaveReject:null,attFlow:null,arrivalFlow:null,selMyAsgn:"",selMyAsgnOrg:"",reportAsgn:"",reminders:loadWs("cv3_r",null)||(Array.isArray(_lsCfg.reminders)?_lsCfg.reminders.slice():[]),
  personalReminders:[],
  auditLog:loadWs("cv3_audit",[]),trash:loadWs("cv3_trash",[])};
try{if(LS)LS.removeItem("cv3_undo")}catch(e){}
var UNDO=(function(){
  try{var v=sessionStorage.getItem("cv3_undo");return v?JSON.parse(v):[]}catch(e){return []}
})();
if(!Array.isArray(UNDO))UNDO=[];
function saveUndo(){try{sessionStorage.setItem("cv3_undo",JSON.stringify(UNDO||[]))}catch(e){}}
function clearUndo(){UNDO=[];saveUndo();updateUndoBadge();}
ensureCfgGroups();
ensureCompanyInfo();
if(!S.cfg.theme)S.cfg.theme="dark";
applyVapidFromCfg();
applyTheme(S.cfg.theme);
if(migrateWorkspace()){ps2("cv3_e",S.emp);bumpPatch()}
var _fbSv=null;
var PROJ_LOG_MAX=500;
var AUDIT_MAX=800,UNDO_MAX=40,TRASH_DAYS=30;
var PROJ_LOG_LBL={assign:"Giao việc",transfer:"Chuyển dự án",pause:"Tạm dừng",handoff:"Bàn giao",resume:"Quay lại",done:"Hoàn tất việc",proj_done:"Hoàn tất dự án",report:"Báo cáo",arrival:"Đến vị trí",attendance:"Chấm công",role:"Chức vụ",proj_create:"Tạo dự án",proj_edit:"Cập nhật"};
var PROJ_LOG_COL={assign:"#38bdf8",transfer:"#fbbf24",pause:"#fbbf24",handoff:"#a78bfa",resume:"#38c9ff",done:"#4ade80",proj_done:"#4ade80",report:"#60a5fa",arrival:"#4ade80",attendance:"#34d399",role:"#f472b6",proj_create:"#94a3b8",proj_edit:"#94a3b8"};
function logActorName(){if(S.auth&&S.auth.role==="director")return S.auth.displayName||S.auth.username||"Giám đốc";if(S.auth&&S.auth.empId){var e=eById(S.auth.empId);return e?e.name:S.auth.username||"";}return "Hệ thống";}
function actorInfo(){
  var name=logActorName(),au=S.auth||{},uid=au.uid||"",role="";
  if(au.role==="director")role="director";
  else if(au.empGroup)role=au.empGroup;
  else if(au.empId){var e=eById(au.empId);role=e?(e.group||"employee"):"employee";}
  else role=au.role||"";
  return {name:name,uid:uid,role:role};
}
function assignActorRoleLabel(role){
  if(role==="director")return "Giám đốc";
  if(role==="Điều hành")return "Điều hành";
  if(role==="Giám sát")return "Giám sát";
  return role||"";
}
function stampAsgnAssigner(a){
  if(!a)return a;
  var act=actorInfo();
  a.assignedBy=act.name;
  a.assignedByUid=act.uid||"";
  a.assignedByRole=act.role||"";
  a.assignedAt=new Date().toISOString();
  return a;
}
function asgnAssignerLine(a){
  if(!a||!a.assignedBy)return "";
  var role=assignActorRoleLabel(a.assignedByRole);
  return "Giao bởi "+a.assignedBy+(role?" ("+role+")":"")+" · "+fmtHistTime(a.assignedAt);
}
function recordAssign(projId,emp,asgn,extra){
  if(!emp||!asgn)return;
  if(!asgn.assignedBy)stampAsgnAssigner(asgn);
  var by=asgn.assignedBy||logActorName();
  var at=asgn.assignedAt||new Date().toISOString();
  var role=assignActorRoleLabel(asgn.assignedByRole);
  var title=(asgnInfo(asgn).title||"công việc");
  var suffix=extra||"";
  logProjEvent(projId,"assign",{
    empId:emp.id,empName:emp.name,by:by,
    text:"Giao «"+title+"» cho "+emp.name+suffix,
    meta:{asgnId:asgn.id,assignedBy:by,assignedByUid:asgn.assignedByUid||"",assignedAt:at,assignedByRole:asgn.assignedByRole||"",empId:emp.id}
  });
  auditLog("action","assign","Giao «"+title+"» cho "+emp.name+" · bởi "+by+(role?" ("+role+")":"")+" · "+fmtHistTime(at),{projId:projId,asgnId:asgn.id,empId:emp.id,assignedBy:by,assignedAt:at,assignedByRole:asgn.assignedByRole||""});
}
function auditLog(kind,type,text,meta){
  if(!S.auditLog)S.auditLog=[];
  var a=actorInfo();
  S.auditLog.push({id:uid(),at:new Date().toISOString(),kind:kind||"action",type:type||"",by:a.name,byUid:a.uid,text:text||"",meta:meta||{}});
  if(S.auditLog.length>AUDIT_MAX)S.auditLog=S.auditLog.slice(-AUDIT_MAX);
  ps2Ws("cv3_audit",S.auditLog);
}
function pushUndo(label,op,payload){
  UNDO.push({id:uid(),at:new Date().toISOString(),label:label||"Hoàn tác",op:op,payload:payload||{}});
  if(UNDO.length>UNDO_MAX)UNDO=UNDO.slice(-UNDO_MAX);
  saveUndo();
  updateUndoBadge();
}
function fmtHistTime(iso){
  if(!iso)return "—";
  var s=String(iso);
  var d=new Date(s);
  if(!isNaN(d.getTime())&&(/T|Z|[+-]\d{2}:?\d{2}$/.test(s)||s.length>16)){
    return pad2(d.getDate())+"/"+pad2(d.getMonth()+1)+"/"+d.getFullYear()+" "+pad2(d.getHours())+":"+pad2(d.getMinutes());
  }
  var day=dParse(s.slice(0,10)),when=day?dFmt(s.slice(0,10)):"";
  if(s.length>11){var t=s.slice(11,16);if(t)when+=(when?" ":"")+t;}
  return when||s;
}
function purgeExpiredTrash(){
  if(!S.trash||!S.trash.length)return 0;
  var now=new Date().toISOString(),n0=S.trash.length;
  S.trash=S.trash.filter(function(t){return t&&t.expiresAt&&String(t.expiresAt)>=now});
  if(S.trash.length!==n0){ps2Ws("cv3_trash",S.trash);return n0-S.trash.length;}
  return 0;
}
function trashLabelOf(type,item){
  if(!item)return type||"?";
  if(type==="emp")return item.name||"Nhân sự";
  if(type==="cust")return item.name||"Khách hàng";
  if(type==="proj")return item.name||"Dự án";
  if(type==="asgn"){
    var e=item.empId?eById(item.empId):null,p=item.projId?pById(item.projId):null;
    return "Giao việc: "+(e?e.name:(item.empName||"?"))+" → "+(p?p.name:"?");
  }
  if(type==="remind")return item.text||"Nhắc hẹn";
  return item.name||item.text||type;
}
function moveToTrash(type,item,opts){
  opts=opts||{};
  if(!item)return null;
  var at=new Date().toISOString();
  var expiresAt=new Date(Date.now()+TRASH_DAYS*864e5).toISOString();
  var label=opts.label||trashLabelOf(type,item);
  var tid=uid();
  if(!S.trash)S.trash=[];
  S.trash.push({id:tid,at:at,expiresAt:expiresAt,type:type,label:label,data:JSON.parse(JSON.stringify(item)),related:opts.related||null});
  if(S.trash.length>400)S.trash=S.trash.slice(-400);
  auditLog("action","delete","Xoá «"+label+"»",{trashId:tid,itemType:type,itemId:item.id});
  if(!opts.silent)pushUndo("Hoàn tác xoá «"+label+"»","trash_restore",{trashId:tid});
  return tid;
}
function restoreTrash(trashId){
  if(!dirGuard())return false;
  purgeExpiredTrash();
  var t=(S.trash||[]).find(function(x){return x.id===trashId});
  if(!t||!t.data){alert("Không tìm thấy mục trong thùng rác.");return false;}
  if(t.type==="emp"&&!canManageStaff()){alert("Chỉ giám đốc được khôi phục hồ sơ nhân sự.");return false;}
  var d=JSON.parse(JSON.stringify(t.data));
  if(t.type==="emp"){if(eById(d.id)){alert("Nhân sự đã tồn tại.");return false;}S.emp.push(d);}
  else if(t.type==="cust"){if(cById(d.id)){alert("Khách hàng đã tồn tại.");return false;}S.cust.push(d);}
  else if(t.type==="proj"){
    if(pById(d.id)){alert("Dự án đã tồn tại.");return false;}
    S.proj.push(d);
    if(t.related&&t.related.asgn&&t.related.asgn.length){
      t.related.asgn.forEach(function(a){if(a&&a.id&&!asgnById(a.id))S.asgn.push(JSON.parse(JSON.stringify(a)));});
    }
  }
  else if(t.type==="asgn"){if(asgnById(d.id)){alert("Công việc đã tồn tại.");return false;}S.asgn.push(d);}
  else if(t.type==="remind"){
    S.reminders=S.reminders||[];
    if(S.reminders.some(function(r){return r.id===d.id})){alert("Nhắc hẹn đã tồn tại.");return false;}
    S.reminders.push(d);
  }
  else{alert("Loại không hỗ trợ khôi phục.");return false;}
  S.trash=S.trash.filter(function(x){return x.id!==trashId});
  UNDO=UNDO.filter(function(u){return!(u.op==="trash_restore"&&u.payload&&u.payload.trashId===trashId)});
  saveUndo();
  auditLog("action","restore","Khôi phục «"+(t.label||"")+"»",{trashId:trashId,itemType:t.type,itemId:d.id});
  sv();render();
  return true;
}
function emptyTrashItem(trashId){
  if(!dirGuard())return;
  var t=(S.trash||[]).find(function(x){return x.id===trashId});
  if(!t)return;
  if(t.type==="emp"&&!canManageStaff())return alert("Chỉ giám đốc được xoá vĩnh viễn hồ sơ nhân sự.");
  if(!confirm("Xoá vĩnh viễn mục này? Không thể hoàn tác."))return;
  S.trash=S.trash.filter(function(x){return x.id!==trashId});
  UNDO=UNDO.filter(function(u){return!(u.op==="trash_restore"&&u.payload&&u.payload.trashId===trashId)});
  saveUndo();
  auditLog("action","purge","Xoá vĩnh viễn «"+(t.label||"")+"»",{trashId:trashId,itemType:t.type});
  sv();render();
}
function histGetByType(type,id){
  if(type==="emp")return eById(id);
  if(type==="cust")return cById(id);
  if(type==="proj")return pById(id);
  if(type==="asgn")return asgnById(id);
  if(type==="remind")return findMyRemind(id);
  return null;
}
function histRemoveByType(type,id){
  if(type==="emp"){S.emp=S.emp.filter(function(x){return x.id!==id});if(S.selEmp===id)S.selEmp="";}
  else if(type==="cust"){S.cust=S.cust.filter(function(x){return x.id!==id});if(S.selCust===id)S.selCust="";}
  else if(type==="proj"){S.proj=S.proj.filter(function(x){return x.id!==id});if(S.selProjDet===id)S.selProjDet="";S.asgn=S.asgn.filter(function(a){return a.projId!==id});}
  else if(type==="asgn"){S.asgn=S.asgn.filter(function(x){return x.id!==id});}
  else if(type==="remind"){removeMyRemind(id);}
}
function histPutByType(type,item){
  if(!item||!item.id)return;
  var copy=JSON.parse(JSON.stringify(item));
  if(type==="emp"){if(eById(copy.id))S.emp=S.emp.map(function(x){return x.id===copy.id?copy:x});else S.emp.push(copy);}
  else if(type==="cust"){if(cById(copy.id))S.cust=S.cust.map(function(x){return x.id===copy.id?copy:x});else S.cust.push(copy);}
  else if(type==="proj"){if(pById(copy.id))S.proj=S.proj.map(function(x){return x.id===copy.id?copy:x});else S.proj.push(copy);}
  else if(type==="asgn"){if(asgnById(copy.id))S.asgn=S.asgn.map(function(x){return x.id===copy.id?copy:x});else S.asgn.push(copy);}
  else if(type==="remind"){
    if(usesPersonalReminders()||copy.personal){
      S.personalReminders=S.personalReminders||[];
      var ix=-1;for(var i=0;i<S.personalReminders.length;i++){if(S.personalReminders[i].id===copy.id){ix=i;break;}}
      if(ix>=0)S.personalReminders[ix]=copy;else S.personalReminders.push(copy);
      savePersonalReminders();
    }else{
      S.reminders=S.reminders||[];
      var jx=-1;for(var j=0;j<S.reminders.length;j++){if(S.reminders[j].id===copy.id){jx=j;break;}}
      if(jx>=0)S.reminders[jx]=copy;else S.reminders.push(copy);
    }
  }
}
function undoListM(){
  var list=UNDO.slice().reverse();
  var body='';
  if(!list.length)body+='<div style="font-size:13px;color:var(--c-muted3)">Không còn thao tác để hoàn tác.</div>';
  else{
    body+='<div style="display:grid;gap:8px;max-height:min(55vh,420px);overflow:auto">';
    list.forEach(function(u,i){
      var n=list.length-i;
      body+='<button type="button" class="li card card-p" style="width:100%;text-align:left;cursor:pointer;border:1px solid var(--c-border);background:var(--c-surface2)" onclick="A.undoPick(\''+u.id+'\')">';
      body+='<div class="row" style="justify-content:space-between;gap:8px;align-items:flex-start;flex-wrap:wrap">';
      body+='<div style="min-width:0;flex:1"><div style="font-size:14px;font-weight:600">'+esc(u.label||"Hoàn tác")+'</div>';
      body+='<div class="hist-meta">'+fmtHistTime(u.at)+(u.op?' · '+esc(u.op):"")+'</div></div>';
      body+='<span style="font-family:monospace;font-size:12px;color:var(--c-muted4);flex-shrink:0">#'+n+'</span>';
      body+='</div></button>';
    });
    body+='</div>';
  }
  return mw("Hoàn tác — chọn mục",body,btn("btn-ghost","Đóng","A.cm()"),"");
}
function openUndoList(){
  if(!dirGuard())return;
  if(!UNDO.length)return alert("Không còn thao tác để hoàn tác.");
  S.modal=undoListM();
  render();
}
function applyUndoEntry(u){
  if(!u)return false;
  if(u.op==="trash_restore"){
    if(!restoreTrash(u.payload&&u.payload.trashId))return false;
    if(typeof showAppToast==="function")showAppToast("Đã hoàn tác xoá","ok");
    return true;
  }
  if(u.op==="create_revert"){
    var type=u.payload&&u.payload.type,id=u.payload&&u.payload.id;
    if(type==="emp"&&!canManageStaff()){alert("Chỉ giám đốc được hoàn tác thao tác nhân sự.");return false;}
    var item=histGetByType(type,id);
    if(!item){alert("Không tìm thấy mục để hoàn tác.");return false;}
    var rel=null;
    if(type==="proj")rel={asgn:S.asgn.filter(function(a){return a.projId===id})};
    moveToTrash(type,item,{silent:true,related:rel});
    histRemoveByType(type,id);
    sv();
    if(typeof showAppToast==="function")showAppToast(u.label||"Đã hoàn tác tạo","ok");
    return true;
  }
  if(u.op==="edit_revert"){
    var before=u.payload&&u.payload.before,etype=u.payload&&u.payload.type;
    if(etype==="emp"&&!canManageStaff()){alert("Chỉ giám đốc được hoàn tác thao tác nhân sự.");return false;}
    if(!before||!before.id){alert("Không có dữ liệu hoàn tác.");return false;}
    histPutByType(etype,before);
    auditLog("action","undo_edit","Hoàn tác sửa «"+trashLabelOf(etype,before)+"»",{itemType:etype,itemId:before.id});
    sv();
    if(typeof showAppToast==="function")showAppToast(u.label||"Đã hoàn tác sửa","ok");
    return true;
  }
  alert("Thao tác hoàn tác không hỗ trợ.");
  return false;
}
function doUndoById(id){
  if(!dirGuard())return;
  var ix=-1;
  for(var i=0;i<UNDO.length;i++){if(UNDO[i].id===id){ix=i;break;}}
  if(ix<0){alert("Không tìm thấy thao tác.");S.modal=null;render();return;}
  var u=UNDO[ix];
  if(!confirm("Xác nhận thực hiện:\n\n"+(u.label||"Hoàn tác")+"\n\nThao tác này sẽ áp dụng ngay."))return;
  UNDO.splice(ix,1);
  saveUndo();
  updateUndoBadge();
  S.modal=null;
  var ok=applyUndoEntry(u);
  if(!ok){
    UNDO.splice(ix,0,u);
    saveUndo();
    updateUndoBadge();
  }
  render();
}
function doUndo(){openUndoList()}
function updateUndoBadge(){
  var btn=document.getElementById("hdr-undo-btn");
  var el=document.getElementById("hdr-undo-badge");
  if(!btn)return;
  var n=(UNDO&&UNDO.length)||0;
  var show=canOperate()&&n>0;
  btn.style.display=show?"flex":"none";
  if(el){el.textContent=String(n);el.style.display=show?"flex":"none";}
}
function logProjEvent(projId,type,payload){
  if(!projId)return;
  payload=payload||{};
  if(!S.projLog)S.projLog=[];
  S.projLog.push({id:uid(),projId:projId,at:new Date().toISOString(),type:type,empId:payload.empId||"",empName:payload.empName||"",by:payload.by||logActorName(),text:payload.text||"",meta:payload.meta||{}});
  if(S.projLog.length>PROJ_LOG_MAX)S.projLog=S.projLog.slice(-PROJ_LOG_MAX);
}
function logTeamRoleChanges(proj,oldTT,oldVT){
  if(!proj)return;
  if(proj.toTruongId!==oldTT){var e=proj.toTruongId?eById(proj.toTruongId):null;logProjEvent(proj.id,"role",{empId:proj.toTruongId||"",empName:e?e.name:"",text:e?"Phân "+e.name+" làm trưởng nhóm":"Bỏ chức trưởng nhóm",meta:{role:"toTruong"}});}
  if(proj.vatTuId!==oldVT){var e2=proj.vatTuId?eById(proj.vatTuId):null;logProjEvent(proj.id,"role",{empId:proj.vatTuId||"",empName:e2?e2.name:"",text:e2?"Phân "+e2.name+" làm thủ kho":"Bỏ chức thủ kho",meta:{role:"vatTu"}});}
}
function projLogFmtTime(at){
  if(!at)return "—";
  var s=String(at),d=dParse(s.slice(0,10)),when=d?dFmt(s.slice(0,10)):"";
  if(s.length>11){var t=s.slice(11,16);if(t)when+=" "+t;}
  return when||s;
}
function projEventsForProj(projId,limit){
  var events=(S.projLog||[]).filter(function(e){return e.projId===projId}),seen={};
  events.forEach(function(e){if(e.meta&&e.meta.reportId)seen[e.meta.reportId]=1;});
  (S.reports||[]).forEach(function(r){
    if(r.projId!==projId)return;
    var rid=r.id||(r.asgnId+"_"+r.date);
    if(seen[rid])return;
    var at=r.at?(r.at.toDate?r.at.toDate().toISOString():(r.at.seconds?new Date(r.at.seconds*1000).toISOString():(r.date+"T12:00:00.000Z"))):(r.date+"T12:00:00.000Z");
    events.push({id:"rpt_"+rid,projId:projId,at:at,type:"report",empId:r.empId||"",empName:r.fromName||"",by:r.fromName||"",text:(r.fromName||"?")+" báo cáo tiến độ "+r.prog+"%"+(r.date?" ("+dFmt(r.date)+")":""),meta:{reportId:rid,asgnId:r.asgnId,prog:r.prog,note:r.note,date:r.date}});
  });
  events.sort(function(a,b){return (b.at||"").localeCompare(a.at||"")});
  return events.slice(0,limit||40);
}
function renderProjTimeline(projId,limit){
  var events=projEventsForProj(projId,limit||40);
  var h='<div style="font-size:13px;font-weight:600;color:var(--c-accent);margin-bottom:10px">Nhật ký dự án</div>';
  if(!events.length)return h+'<div style="font-size:13px;color:var(--c-muted3)">Chưa có hoạt động nào được ghi nhận.</div>';
  h+='<div class="proj-timeline">';
  events.forEach(function(ev){
    var col=PROJ_LOG_COL[ev.type]||"#94a3b8",lbl=PROJ_LOG_LBL[ev.type]||ev.type;
    h+='<div class="proj-tl-item"><div class="proj-tl-dot" style="background:'+col+';box-shadow:0 0 8px '+col+'55"></div><div style="flex:1;min-width:0">';
    h+='<div class="row" style="gap:8px;margin-bottom:3px;flex-wrap:wrap"><span class="badge" style="color:'+col+';border-color:'+col+'44;font-size:10px">'+lbl+'</span><span class="proj-tl-when">'+projLogFmtTime(ev.at)+'</span></div>';
    h+='<div class="proj-tl-text">'+esc(ev.text||"")+'</div>';
    if(ev.type==="assign"){
      var aby=(ev.meta&&ev.meta.assignedBy)||ev.by||"";
      var arole=assignActorRoleLabel((ev.meta&&ev.meta.assignedByRole)||"");
      var aat=(ev.meta&&ev.meta.assignedAt)||ev.at;
      h+='<div style="font-size:11px;color:#7dd3fc;margin-top:4px">Giao bởi <b>'+esc(aby||"?")+'</b>'+(arole?' <span style="color:var(--c-muted4)">('+esc(arole)+')</span>':"")+' · '+esc(fmtHistTime(aat)||projLogFmtTime(aat))+'</div>';
    }else if(ev.by&&ev.by!==ev.empName){
      h+='<div style="font-size:11px;color:var(--c-muted3);margin-top:3px">bởi '+esc(ev.by)+'</div>';
    }
    if(ev.meta&&ev.meta.note&&(ev.type==="report"||ev.type==="transfer"||ev.type==="handoff"||ev.type==="pause"))h+='<div style="font-size:12px;color:rgba(200,220,255,.75);margin-top:4px;white-space:pre-wrap">'+esc(ev.meta.note)+'</div>';
    h+='</div></div>';
  });
  return h+'</div>';
}
function sv(){ps2("cv3_e",S.emp);ps2("cv3_c",S.cust);ps2Ws("cv3_p",S.proj);ps2Ws("cv3_a",S.asgn);ps2Ws("cv3_pl",S.projLog);ps2("cv3_s",S.cfg);ps2Ws("cv3_r",S.reminders||[]);ps2Ws("cv3_audit",S.auditLog||[]);ps2Ws("cv3_trash",S.trash||[]);bumpPatch();if(canOperate()&&_fbSv)_fbSv();}
function eById(id){
  var e=S.emp.find(function(x){return x.id===id});
  if(e)return e;
  return (S.empAll||[]).find(function(x){return x.id===id})||null;
}
function currentOrgId(){
  if(typeof window.__CV3_getOrgId==="function")return window.__CV3_getOrgId();
  return (S.auth&&S.auth.orgId)||window.FIREBASE_DEFAULT_ORG||"cong-trinh";
}
function listAppOrgs(){
  if(typeof window.__CV3_listOrgs==="function")return window.__CV3_listOrgs();
  return [{id:"cong-trinh",label:"Công trình tỉnh"},{id:"nha-may",label:"Công trình HCM"}];
}
function orgLabelOf(id){
  if(typeof window.__CV3_orgLabel==="function")return window.__CV3_orgLabel(id);
  return id==="nha-may"?"Công trình HCM":"Công trình tỉnh";
}
function empOrgIds(e){
  if(!e)return [currentOrgId()];
  if(Array.isArray(e.orgIds)&&e.orgIds.length)return e.orgIds.slice();
  return [currentOrgId()];
}
function chiefOrgIds(){return ["cong-trinh"]}
function forceChiefScope(group,orgIds){
  return group==="Chỉ huy trưởng"?chiefOrgIds():(orgIds&&orgIds.length?orgIds:[currentOrgId()]);
}
function empInBothOrgs(e){return empOrgIds(e).length>1}
function authAllowedOrgIds(){
  var a=S.auth||{};
  if(a.role==="director")return listAppOrgs().map(function(o){return o.id});
  if(a.empGroup==="Chỉ huy trưởng")return chiefOrgIds();
  if(Array.isArray(a.orgIds)&&a.orgIds.length)return a.orgIds.slice();
  if(a.orgId)return [a.orgId];
  return [currentOrgId()];
}
function viewerCanSeeOrg(orgId){
  return authAllowedOrgIds().indexOf(orgId)>=0;
}
function viewerCanSeeOtherOrg(){
  var other=typeof window.__CV3_otherOrgId==="function"?window.__CV3_otherOrgId(currentOrgId()):(currentOrgId()==="nha-may"?"cong-trinh":"nha-may");
  return viewerCanSeeOrg(other);
}
function allAsgnForEmp(eid){
  var local=(S.asgn||[]).filter(function(x){return x.empId===eid});
  // Gộp việc đội kia khi tài khoản được phép xem (user thuộc cả 2 đội) và đã có snapshot
  if(!viewerCanSeeOtherOrg()||!S.asgnOther||!S.asgnOther.length){
    return local.map(function(a){return Object.assign({},a,{_orgId:a._orgId||currentOrgId()})});
  }
  var seen={},out=[];
  local.forEach(function(a){
    var k=(a._orgId||currentOrgId())+":"+a.id;
    if(seen[k])return;seen[k]=1;out.push(Object.assign({},a,{_orgId:a._orgId||currentOrgId()}));
  });
  S.asgnOther.forEach(function(a){
    if(a.empId!==eid)return;
    if(a._orgId&&!viewerCanSeeOrg(a._orgId))return;
    var k=(a._orgId||S.otherOrgId||"other")+":"+a.id;
    if(seen[k])return;seen[k]=1;out.push(Object.assign({},a,{_orgId:a._orgId||S.otherOrgId||""}));
  });
  return out;
}
function empOrgBadgesHTML(e){
  return empOrgIds(e).map(function(oid){return bdg(orgLabelOf(oid),oid==="nha-may"?"#34d399":"#fbbf24",oid==="nha-may"?"rgba(52,211,153,.15)":"rgba(251,191,36,.15)")}).join("");
}
function empOrgPickHTML(selectedIds,opts){
  opts=opts||{};
  var ids=selectedIds&&selectedIds.length?selectedIds.slice():[currentOrgId()];
  var name=opts.inputName||"forg";
  var cls=opts.inputClass||"forg";
  var h='<div class="emp-org-pick">';
  listAppOrgs().forEach(function(o){
    var on=ids.indexOf(o.id)>=0;
    h+='<label class="emp-org-opt'+(on?" on":"")+'"><input type="checkbox" class="'+cls+'" name="'+name+'" value="'+o.id+'" '+(on?"checked":"")+(opts.onchange?' onchange="'+opts.onchange+'"':"")+'> <span class="emp-org-opt-title">'+esc(o.label)+'</span></label>';
  });
  h+='</div>';
  return h;
}
function pById(id){var p=S.proj.find(function(x){return x.id===id});if(p)return p;return (S.projOther||[]).find(function(x){return x.id===id})}
function cById(id){return S.cust.find(function(c){return c.id===id})}
/** Tên dùng trên app: ưu tiên tên ngắn, không có thì dùng tên đầy đủ. */
function custDisplayName(c){
  if(!c)return "";
  var s=String(c.shortName||"").trim();
  if(s)return s;
  return String(c.name||"").trim();
}
function custFullName(c){return c?String(c.name||"").trim():""}
function custMatchesProj(c,p){
  if(!c||!p)return false;
  if(p.custId===c.id)return true;
  if(!p.custId&&p.customer&&p.customer===c.name)return true;
  return false;
}
function custProjs(c){
  if(!c)return [];
  return S.proj.filter(function(p){return custMatchesProj(c,p)}).sort(function(a,b){
    return (projTL(b).start||"").localeCompare(projTL(a).start||"");
  });
}
function custProjWorkLbl(p){
  var acts=S.asgn.filter(function(a){return a.projId===p.id}),items=[];
  acts.forEach(function(a){var t=(a.workContent||"").trim();if(t&&items.indexOf(t)<0)items.push(t)});
  if(!items.length)return p.name||"—";
  if(p.name&&items.indexOf(p.name)<0)return p.name+(items.length?" · "+items.join(" · "):"");
  return items.join(" · ");
}
function empActs(eid){return allAsgnForEmp(eid).filter(function(x){return x.status==="active"||x.status==="paused"||x.status==="queued"})}
function asgnEndDate(a){
  var pr=pById(a.projId);
  var own=a.endDate||"";
  var projDl=(pr&&pr.deadline)||"";
  // Hạn dự án mới hơn (sau gia hạn) luôn thắng hạn việc cũ — hết báo trễ theo lịch cũ
  if(own&&projDl)return own>projDl?own:projDl;
  return own||projDl||a.startDate||"";
}
function asgnDays(a){var s=dParse(a.startDate),e=dParse(asgnEndDate(a));if(!s||!e)return "—";return Math.max(1,Math.round((e-s)/86400000)+1)+" ngày"}
function asgnTimePct(a){var s=dParse(a.startDate),e=dParse(asgnEndDate(a)),t=dParse(td());if(!s||!e)return 0;var span=e.getTime()-s.getTime();if(span<=0)return 100;if(!t||t<s)return 0;if(t>e)return 100;return Math.round((t.getTime()-s.getTime())/span*100)}
function asgnSchedStatus(a){var prog=Math.max(0,Math.min(100,a.prog||0)),timePct=asgnTimePct(a),end=dParse(asgnEndDate(a)),today=dParse(td());if(prog>=100)return "ok";if(end&&today&&today>end)return "late";var gap=prog-timePct;if(gap>=0)return "ok";if(gap>=-12)return "risk";return "late"}
function asgnSchedLabel(st){return st==="ok"?"Kịp tiến độ":st==="risk"?"Nguy cơ trễ":"Đã trễ tiến độ"}
function stdWorkDaysMonth(){var n=Number(S.cfg&&S.cfg.stdWorkDaysMonth);return n>0?n:26}
function asgnPlannedDays(a){return asgnDaySpan(a.startDate||td(),asgnEndDate(a)||a.startDate||td())}
function asgnBaseActualDays(a){
  var start=a.startDate||td();
  var done=a.completedAt||(a.status==="done"?asgnEndDate(a):"");
  if(!done)return asgnPlannedDays(a);
  return asgnDaySpan(start,done);
}
function asgnReworkDays(a){
  var sum=0;
  (a.reworks||[]).forEach(function(r){sum+=Math.max(0,Number(r.days)||0);});
  return sum;
}
function asgnAdjActualDays(a){return asgnBaseActualDays(a)+asgnReworkDays(a)}
function asgnDeltaDays(a){return asgnPlannedDays(a)-asgnAdjActualDays(a)}
function asgnOutcomeLabel(a){
  var d=asgnDeltaDays(a);
  if(d>0)return{key:"early",label:"Sớm "+d+" ngày",c:"#4ade80"};
  if(d<0)return{key:"late",label:"Trễ "+(-d)+" ngày",c:"#f87171"};
  return{key:"ontime",label:"Đúng hạn",c:"#38bdf8"};
}
function asgnEffScore(a){
  var planned=asgnPlannedDays(a)||1;
  var adj=asgnAdjActualDays(a);
  var delta=(planned-adj)/planned;
  var clamped=Math.max(-1,Math.min(1,delta/0.3));
  return Math.max(0,Math.min(100,Math.round(70+30*clamped)));
}
function asgnQualScore(a){
  var base=a.quality!=null?a.quality*20:60;
  if(a.praise)base+=10;
  if(a.complaint)base-=25;
  if((a.reworks||[]).length)base-=20;
  return Math.max(0,Math.min(100,Math.round(base)));
}
function kpiPeriodRange(kind,anchorYm){
  kind=kind||"month";
  var ym=anchorYm||attMonthKey();
  var parts=ym.split("-");
  var y=parseInt(parts[0],10),m=parseInt(parts[1],10);
  if(!y||!m){y=new Date().getFullYear();m=new Date().getMonth()+1;}
  function pad(n){return (n<10?"0":"")+n}
  if(kind==="year"){
    return{from:y+"-01-01",to:y+"-12-31",stdDays:stdWorkDaysMonth()*12,label:"Năm "+y};
  }
  if(kind==="quarter"){
    var q=Math.floor((m-1)/3)+1;
    var sm=(q-1)*3+1,em=sm+2;
    var lastDay=new Date(y,em,0).getDate();
    return{from:y+"-"+pad(sm)+"-01",to:y+"-"+pad(em)+"-"+pad(lastDay),stdDays:stdWorkDaysMonth()*3,label:"Quý "+q+"/"+y};
  }
  var last=new Date(y,m,0).getDate();
  return{from:y+"-"+pad(m)+"-01",to:y+"-"+pad(m)+"-"+pad(last),stdDays:stdWorkDaysMonth(),label:"Tháng "+pad(m)+"/"+y};
}
function ensureKpiAttendanceHistory(){
  if(typeof window.__CV3_ensureAttendanceRange!=="function")return;
  if(!canViewQual())return;
  var range=kpiPeriodRange(S.kpiPeriod||"month",S.kpiMonth||attMonthKey());
  if(!range||!range.from)return;
  window.__CV3_ensureAttendanceRange(range.from,range.to).then(function(rows){
    if(rows&&rows.length)render();
  }).catch(function(e){console.warn("kpi att history:",e);});
}
function asgnOverlapsPeriod(a,from,to){
  var s=a.startDate||"";
  var e=a.completedAt||asgnEndDate(a)||s;
  if(!s)return false;
  if(!e)e=s;
  return s<=to&&e>=from;
}
function empWorkDaysInPeriod(empId,from,to){
  var days={},d=from;
  var guard=0;
  while(d<=to&&guard<400){
    var recs=attRecordsForDay(empId,d);
    if(recs&&recs.length)days[d]=1;
    d=dAdd(d,1);guard++;
  }
  var n=Object.keys(days).length;
  if(n>0)return n;
  // Fallback: số ngày có việc active/paused/done giao kỳ (gộp cả 2 đội nếu NV thuộc cả hai)
  allAsgnForEmp(empId).forEach(function(a){
    if(a.status!=="active"&&a.status!=="paused"&&a.status!=="done")return;
    if(!asgnOverlapsPeriod(a,from,to))return;
    var s=a.startDate||from;
    var e=(a.status==="done"?(a.completedAt||asgnEndDate(a)):asgnEndDate(a))||s;
    if(s<from)s=from;if(e>to)e=to;
    var cur=s,g=0;
    while(cur<=e&&g<400){days[cur]=1;cur=dAdd(cur,1);g++;}
  });
  return Object.keys(days).length;
}
function empAttPenaltyInPeriod(empId,from,to){
  var late=0,early=0,half=0,full=0;
  var d=from,g=0;
  while(d<=to&&g<400){
    attRecordsForDay(empId,d).forEach(function(r){
      var ev=attRecordEval(r);
      if(ev.flag==="late")late++;
      if(ev.flag==="early")early++;
      if(ev.flag==="half_day")half++;
      if(ev.flag==="full_day")full++;
    });
    d=dAdd(d,1);g++;
  }
  var pen=Math.min(35,late*2+early*2+half*8+full*15);
  return{late:late,early:early,half:half,full:full,pen:pen};
}
function empKpiPeriod(empId,kind,anchorYm){
  var range=kpiPeriodRange(kind,anchorYm);
  var jobs=allAsgnForEmp(empId).filter(function(a){
    return a.status==="done"&&asgnOverlapsPeriod(a,range.from,range.to);
  });
  var eSum=0,eW=0,qSum=0,qW=0;
  jobs.forEach(function(a){
    var w=asgnPlannedDays(a)||1;
    eSum+=asgnEffScore(a)*w;eW+=w;
    qSum+=asgnQualScore(a)*w;qW+=w;
  });
  var E=eW?Math.round(eSum/eW):0;
  var Q=qW?Math.round(qSum/qW):0;
  var workDays=empWorkDaysInPeriod(empId,range.from,range.to);
  var att=empAttPenaltyInPeriod(empId,range.from,range.to);
  var D0=Math.min(100,Math.round(100*workDays/Math.max(1,range.stdDays)));
  var D=Math.max(0,Math.min(100,Math.round(D0*(1-att.pen/100))));
  var total=Math.round((0.5*E+0.5*Q)*(0.35+0.65*D/100));
  return{E:E,Q:Q,D:D,total:total,jobs:jobs.length,workDays:workDays,stdDays:range.stdDays,range:range,att:att};
}
function kpiBoardRows(kind,anchorYm){
  return fieldEmp().map(function(e){
    var k=empKpiPeriod(e.id,kind,anchorYm);
    return{emp:e,kpi:k};
  }).sort(function(a,b){return b.kpi.total-a.kpi.total||b.kpi.workDays-a.kpi.workDays;});
}
function shortCompanyName(s){
  if(s==null||s==="")return "";
  var t=String(s);
  [/công\s*ty/gi,/cty\.?/gi,/tnhh\s*mtv/gi,/tnhh/gi,/cổ\s*phần/gi,/\bctcp\b/gi,/\bcp\b/gi,/nhà\s*máy/gi,/chế\s*biến/gi,/xí\s*nghiệp/gi,/doanh\s*nghiệp/gi].forEach(function(re){t=t.replace(re," ");});
  t=t.replace(/\s+/g," ").replace(/^[\s,.\-–—·]+|[\s,.\-–—·]+$/g,"").trim();
  return t||String(s).trim();
}
function shortGanttText(s,max){
  max=max||16;
  s=String(s||"").trim();
  if(!s)return "—";
  return s.length<=max?s:s.slice(0,Math.max(1,max-1))+"…";
}
function projCompanyName(p){
  if(!p)return "";
  if(p.custId){var c=cById(p.custId);if(c)return custDisplayName(c);}
  return p.customer||"";
}
function projCompanyShort(p){return shortCompanyName(projCompanyName(p));}
function ganttCompanyLbl(p){var s=projCompanyShort(p);return s?shortGanttText(s,14):"—";}
function ganttWorkShort(p){return shortGanttText(p.name||"",22);}
function asgnFactoryName(a){
  // Chỉ giám đốc / quản lý mới thấy nhãn đội khi việc thuộc đội kia
  if(hasFullUI()&&a&&a._orgId&&a._orgId!==currentOrgId())return orgLabelOf(a._orgId);
  var info=asgnInfo(a),pr=pById(a.projId),raw;
  if(info.cust)raw=info.cust;
  else{var pl=pr?pLoc(pr):null;raw=pl&&pl.name?pl.name:(pr?pr.province||"":"")}
  return shortCompanyName(raw);
}
function empJobCnt(eid){return empActs(eid).length}
function asgnLiveDotHTML(a){var on=a.status==="active";return'<span class="emp-card-task-live '+(on?"on":"off")+'" title="'+(on?"Đang làm":"Tạm dừng")+'"></span>'}
function empCardGanttHTML(a){var prog=Math.max(0,Math.min(100,a.prog||0)),timePct=asgnTimePct(a),sched=asgnSchedStatus(a),days=asgnDays(a),start=dFmtCard(a.startDate),end=dFmtCard(asgnEndDate(a)),tip=start+" → "+end+" · Tiến độ "+prog+"% · Thời gian "+timePct+"% · "+asgnSchedLabel(sched);return'<div class="emp-card-gantt" title="'+esc(tip)+'"><div class="emp-card-gantt-bar-wrap sched-'+sched+'"><div class="emp-card-gantt-bar-bg"></div><div class="emp-card-gantt-bar" style="width:'+prog+'%"></div><div class="emp-card-gantt-inner"><span class="emp-card-gantt-days">'+days+' · '+prog+'%</span></div></div></div>'}
function empCardTasksHTML(e){var acts=empActs(e.id).sort(function(a,b){return (b.startDate||"").localeCompare(a.startDate||"")});if(!acts.length)return'<div class="emp-card-tasks-empty">Chưa có việc</div>';var h="";acts.forEach(function(x){var factory=asgnFactoryName(x),work=asgnInfo(x).title,paused=x.status==="paused";h+='<div class="emp-card-task'+(paused?" emp-card-task-paused":"")+'" onclick="event.stopPropagation();A.empAsgnCard(\''+x.id+'\',\''+(x._orgId||currentOrgId())+'\')">'+asgnLiveDotHTML(x)+'<div class="emp-card-task-factory">'+esc(factory)+'</div><div class="emp-card-task-work">'+esc(work)+'</div>'+empCardGanttHTML(x)+'</div>'});return h}
function empNamebarClick(eid){return'event.stopPropagation();var w=this.closest(\'.swipe-wrap\');if(w&&w._swiping)return;A.empDet(\''+eid+'\')'}
function empNameColor(e){if(isEmpOnLeave(e))return"#f87171";if(busyPct(e)>=100)return"#fb923c";return document.documentElement.getAttribute("data-theme")==="light"?"#0d2137":"#fff"}
function busyPct(e){if(isEmpOnLeave(e))return 0;var ml=S.cfg.ml||3;var p=Math.round(Math.min(100,ac(e.id)/ml*100));if(e.status==="busy")p=Math.max(p,40);return p}
function busyBar(p,lg){p=Math.max(0,Math.min(100,p));var h='<div class="busy-bar'+(lg?" busy-bar-lg":"")+'" title="'+(p>0?"Bận rộn "+p+"%":"Rảnh")+'">';if(p>0)h+='<div class="busy-red" style="width:'+p+'%"></div>';if(p<100)h+='<div class="busy-green" style="width:'+(100-p)+'%"></div>';return h+'</div>'}
function aq(eid){var qs=allAsgnForEmp(eid).filter(function(a){return a.quality!=null}).map(function(a){return a.quality});return qs.length?qs.reduce(function(a,b){return a+b},0)/qs.length:null}
function homeBasis(){var b=S.cfg.wb;if(b==="home")return true;if(b==="last")return false;return new Date().getDay()===1}
function curAsgn(eid){var acts=allAsgnForEmp(eid).filter(function(a){return a.status==="active"});if(!acts.length)return null;return acts.reduce(function(b,a){if(!b)return a;if(a.prog!==b.prog)return a.prog>b.prog?a:b;return(a.startDate||"")>=(b.startDate||"")?a:b},null)}
function haversine(lat1, lon1, lat2, lon2) {
  var R = 6371, dLat = (lat2 - lat1) * Math.PI / 180, dLon = (lon2 - lon1) * Math.PI / 180;
  var a = Math.sin(dLat/2) * Math.sin(dLat/2) + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon/2) * Math.sin(dLon/2);
  return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)));
}
function asgnDaySpan(start,end){
  var s=dParse(start),e=dParse(end);
  if(!s||!e)return 1;
  return Math.max(1,Math.round((e.getTime()-s.getTime())/86400000)+1);
}
function asgnRangeOverlap(a,newStart,newEnd,opts){
  opts=opts||{};
  var today=dParse(td());
  var as=dParse(a.startDate)||today;
  var ae=dParse(asgnEndDate(a))||as;
  if(opts.extendPast&&today&&ae<today)ae=new Date(today.getTime()+86400000);
  var ns=dParse(newStart)||today;
  var ne=dParse(newEnd)||new Date(ns.getTime()+86400000*30);
  return ns.getTime()<=ae.getTime()&&ne.getTime()>=as.getTime();
}
function overlapDetail(a){
  var info=asgnInfo(a);
  var pr=pById(a.projId),pl=pr?pLoc(pr):null;
  return{id:a.id,title:info.title,startDate:a.startDate||"",endDate:asgnEndDate(a),status:a.status||"active",cust:info.cust||"",site:pl&&pl.name?pl.name:(info.cust||"")};
}
function latestOverlapEnd(overlaps){
  var max="";
  (overlaps||[]).forEach(function(o){
    var e=o.endDate||o.startDate||"";
    if(e&&(!max||e>max))max=e;
  });
  return max||td();
}
function delayDatesAfterOverlaps(overlaps,startDate,endDate,extraDays){
  var span=asgnDaySpan(startDate,endDate||startDate);
  var gap=Math.max(0,extraDays||0);
  var after=dAdd(latestOverlapEnd(overlaps),1+gap);
  return{startDate:after,endDate:dAdd(after,span-1)};
}
function markSchedNotify(a,type,msg){
  return Object.assign({},a,{schedNotify:{at:Date.now(),type:type,msg:String(msg||"").slice(0,400)}});
}
function applyPauseForNewJob(overlapIds,newStart,newEnd,newTitle){
  var bSpan=asgnDaySpan(newStart,newEnd||newStart);
  var title=newTitle||"việc mới";
  S.asgn=S.asgn.map(function(a){
    if(overlapIds.indexOf(a.id)<0)return a;
    var end=asgnEndDate(a)||a.startDate||td();
    var shifted=dAdd(end,bSpan);
    var note="Tạm dừng để ưu tiên «"+title+"» ("+dFmtG(newStart)+" → "+dFmtG(newEnd||newStart)+"). Quay lại sau khi xong.";
    var next=Object.assign({},a,{
      status:"paused",
      pausedAt:td(),
      pauseNote:note,
      endDate:shifted,
      scheduleAdj:{type:"pause_for_new",prevEnd:end,newEnd:shifted,at:td()}
    });
    return markSchedNotify(next,"pause",note+" Lịch kết thúc dời sang "+dFmtG(shifted)+".");
  });
}
function destSiteLoc(destCustId,destProvince){
  var c=destCustId?cById(destCustId):null;
  if(c){
    if(c.lat!=null&&c.lng!=null)return{lat:c.lat,lng:c.lng,name:custDisplayName(c)};
    if(c.province&&PM[c.province])return{lat:PM[c.province].lat,lng:PM[c.province].lng,name:custDisplayName(c)||c.province};
  }
  if(destProvince&&PM[destProvince])return{lat:PM[destProvince].lat,lng:PM[destProvince].lng,name:destProvince};
  return null;
}
function asgnSiteLoc(a){
  var pr=pById(a.projId);
  return pr?pLoc(pr):null;
}
function travelEstimate(fromLoc,toLoc){
  if(!fromLoc||!toLoc||fromLoc.lat==null||toLoc.lat==null)return null;
  var km=haversine(fromLoc.lat,fromLoc.lng,toLoc.lat,toLoc.lng);
  var mins=Math.ceil((km*1.4/35)*60);
  return{km:km,mins:mins};
}
function fmtTravelDur(mins){
  if(mins==null)return"—";
  if(mins<60)return mins+" phút";
  var h=Math.floor(mins/60),m=mins%60;
  return m?h+" giờ "+m+" phút":h+" giờ";
}
function workdayEndMs(dateStr){
  var d=dParse(dateStr);if(!d)return null;
  d.setHours(17,0,0,0);return d.getTime();
}
function workdayStartMs(dateStr){
  var d=dParse(dateStr);if(!d)return null;
  d.setHours(8,0,0,0);return d.getTime();
}
function earliestAfterTravel(endDateStr,travelMins){
  var endMs=workdayEndMs(endDateStr);if(!endMs)return null;
  var ready=new Date(endMs+(Math.max(0,travelMins||0)*60000));
  // Nếu tới sau 17h hoặc trước 8h ngày sau → đề xuất sáng ngày làm việc kế tiếp
  var hh=ready.getHours()+ready.getMinutes()/60;
  if(hh>17){ready.setDate(ready.getDate()+1);ready.setHours(8,0,0,0);}
  else if(hh<8)ready.setHours(8,0,0,0);
  return ready.getFullYear()+"-"+pad2(ready.getMonth()+1)+"-"+pad2(ready.getDate());
}
function pushReason(arr,type,text,extra){
  arr.push(Object.assign({type:type,text:text},extra||{}));
}
function checkAssignmentConflict(empId, destCustId, arriveRaw, destProvince, newStart, newEnd) {
  var reasons = [];
  var travelMsgs = [];
  var overlapIds = [];
  var overlaps = [];
  var suggestStart = null;
  var suggestTravelDays = 0;
  var dest = destSiteLoc(destCustId, destProvince);
  var destName = dest && dest.name ? dest.name : (destProvince || "điểm việc mới");
  var newStartMs = workdayStartMs(newStart);
  var arriveMs = arriveRaw ? remindAtMs(arriveRaw) : 0;
  if(arriveMs && !isNaN(arriveMs)) newStartMs = arriveMs;
  var acts = S.asgn.filter(function(a){return a.empId===empId && (a.status==="active"||a.status==="paused")});

  // 1) Trùng kế hoạch: việc mới bắt đầu khi việc cũ chưa xong
  if(acts.length && newStart) {
    var hit = acts.filter(function(a){return asgnRangeOverlap(a, newStart, newEnd, {extendPast:true});});
    if(hit.length) {
      overlaps = hit.map(overlapDetail);
      overlapIds = overlaps.map(function(o){return o.id});
      overlaps.forEach(function(o){
        var siteBit = o.site ? " tại «"+o.site+"»" : "";
        pushReason(reasons,"overlap",
          "Việc mới bắt đầu "+dFmtG(newStart)+" trong khi «"+o.title+"»"+siteBit+" kế hoạch còn tới "+dFmtG(o.endDate)+(o.status==="paused"?" (đang tạm dừng)":"")+" — chưa hoàn thành theo kế hoạch.",
          {asgnId:o.id});
      });
      suggestStart = dAdd(latestOverlapEnd(overlaps),1);
      // Cộng thời gian di chuyển từ điểm việc cũ → điểm việc mới khi dời lịch
      if(dest){
        overlaps.forEach(function(o){
          var oa=asgnById(o.id),from=oa?asgnSiteLoc(oa):null;
          var est=travelEstimate(from,dest);
          if(!est||est.mins<20)return;
          var ready=earliestAfterTravel(o.endDate,est.mins);
          if(ready&&ready>suggestStart)suggestStart=ready;
          var tnote="Sau «"+o.title+"» cần ~"+fmtTravelDur(est.mins)+" để tới «"+destName+"» — nếu dời việc mới nên tính cả quãng đường này.";
          pushReason(reasons,"travel_after_overlap",tnote,{asgnId:o.id,suggestStart:ready,travelMins:est.mins});
        });
      }
    }
  }

  // 2) Khoảng trống + di chuyển giữa các điểm (việc cũ kết thúc trước → việc mới)
  acts.forEach(function(a){
    if(overlapIds.indexOf(a.id)>=0)return;
    var aEnd = asgnEndDate(a) || a.startDate;
    if(!aEnd || !newStart || aEnd >= newStart)return;
    var from = asgnSiteLoc(a);
    if(!from || !dest)return;
    var sameSpot = from.lat!=null && dest.lat!=null && Math.abs(from.lat-dest.lat)<0.0008 && Math.abs(from.lng-dest.lng)<0.0008;
    if(sameSpot)return;
    var est = travelEstimate(from, dest);
    if(!est || est.mins < 20)return;
    var leaveMs = workdayEndMs(aEnd);
    var targetMs = newStartMs || workdayStartMs(newStart);
    if(!leaveMs || !targetMs)return;
    if(leaveMs + est.mins * 60000 <= targetMs)return;
    var info = asgnInfo(a);
    var fromName = from.name || info.cust || "điểm việc cũ";
    var readyDate = earliestAfterTravel(aEnd, est.mins);
    var shortBy = Math.ceil((leaveMs + est.mins * 60000 - targetMs) / 60000);
    var tmsg = "Sau khi xong «"+info.title+"» tại «"+fromName+"» ("+dFmtG(aEnd)+"), di chuyển sang «"+destName+"» mất ~"+fmtTravelDur(est.mins)+" (~"+est.km.toFixed(1)+" km) — không kịp bắt đầu việc mới "+(arriveRaw?"lúc "+new Date(targetMs).toLocaleString("vi-VN"):"ngày "+dFmtG(newStart))+" (thiếu ~"+fmtTravelDur(shortBy)+"). Nên bắt đầu từ "+dFmtG(readyDate)+" trở đi.";
    travelMsgs.push(tmsg);
    pushReason(reasons,"travel",tmsg,{asgnId:a.id,suggestStart:readyDate,travelMins:est.mins});
    if(readyDate && (!suggestStart || readyDate > suggestStart))suggestStart = readyDate;
    if(readyDate){
      var gapDays = 0;
      var cur = dAdd(aEnd,1);
      while(cur < readyDate){gapDays++;cur=dAdd(cur,1);if(gapDays>60)break;}
      if(gapDays > suggestTravelDays)suggestTravelDays = gapDays;
    }
  });

  // 3) Việc mới → việc đang có bắt đầu sau đó (không trùng ngày) nhưng không kịp di chuyển
  if(newEnd && dest){
    acts.forEach(function(a){
      if(overlapIds.indexOf(a.id)>=0)return;
      var aStart = a.startDate || "";
      if(!aStart || aStart <= newEnd)return;
      var to = asgnSiteLoc(a);
      if(!to || !dest)return;
      var sameSpot = Math.abs((dest.lat||0)-(to.lat||0))<0.0008 && Math.abs((dest.lng||0)-(to.lng||0))<0.0008;
      if(sameSpot)return;
      var est = travelEstimate(dest, to);
      if(!est || est.mins < 20)return;
      var leaveMs = workdayEndMs(newEnd);
      var targetMs = workdayStartMs(aStart);
      if(!leaveMs || !targetMs)return;
      if(leaveMs + est.mins * 60000 <= targetMs)return;
      var info = asgnInfo(a);
      var toName = to.name || info.cust || "điểm việc kế";
      var tmsg = "Sau việc mới tại «"+destName+"» (đến "+dFmtG(newEnd)+") cần ~"+fmtTravelDur(est.mins)+" để tới «"+info.title+"» tại «"+toName+"» bắt đầu "+dFmtG(aStart)+" — không kịp nối lịch.";
      travelMsgs.push(tmsg);
      pushReason(reasons,"travel_next",tmsg,{asgnId:a.id,travelMins:est.mins});
    });
  }

  // 4) Giờ có mặt từ vị trí hiện tại (nếu chưa bị overlap bao phủ)
  if(arriveRaw && dest){
    var e = eById(empId), el = eLoc(e);
    if(el && el.loc && el.loc.lat!=null){
      var estNow = travelEstimate(el.loc, dest);
      if(estNow){
        var arrDate = new Date(arriveRaw), now = new Date();
        var diffMins = (arrDate - now) / 60000;
        if(diffMins >= 0 && estNow.mins > diffMins){
          var minStart = new Date(now.getTime() + estNow.mins * 60000);
          var tmsg = "Từ vị trí hiện tại ("+el.src.replace(/<[^>]+>/g,"")+") tới «"+destName+"» ~"+estNow.km.toFixed(1)+" km (~"+fmtTravelDur(estNow.mins)+") — không kịp giờ có mặt đã chọn. Nên hẹn từ "+minStart.toLocaleTimeString("vi-VN",{hour:"2-digit",minute:"2-digit"})+" trở đi.";
          travelMsgs.push(tmsg);
          pushReason(reasons,"arrive",tmsg,{travelMins:estNow.mins});
        }
      }
    }
  }

  var reasonLines = reasons.map(function(r){return r.text;});
  var conflictStr = reasonLines.length ? reasonLines.map(function(t){return "• "+t;}).join("\n") : null;
  return {
    msg: conflictStr,
    overlapIds: overlapIds,
    overlaps: overlaps,
    travelMsgs: travelMsgs,
    reasons: reasons,
    reasonLines: reasonLines,
    suggestStart: suggestStart,
    suggestTravelDays: suggestTravelDays,
    hasOverlap: overlapIds.length > 0,
    hasWarning: reasons.length > 0
  };
}
function conflictResolveM(pend){
  if(!pend)return"";
  var hasOverlap = !!(pend.overlapIds&&pend.overlapIds.length);
  var lines = (pend.reasonLines&&pend.reasonLines.length)?pend.reasonLines:(pend.overlapLines||[]).concat(pend.travelLines||[]);
  var body='<div style="margin-bottom:14px;padding:12px;border-radius:12px;background:rgba(251,191,36,.1);border:1px solid rgba(251,191,36,.35)">';
  body+='<div style="font-size:13px;font-weight:700;color:#fbbf24;margin-bottom:8px">'+(hasOverlap?"⚠️ Cảnh báo trùng lịch / không kịp thời gian":"⚠️ Cảnh báo lịch làm việc")+'</div>';
  body+='<div style="font-size:12px;color:var(--c-muted);margin-bottom:8px">Hệ thống đã đối chiếu lịch hiện có của nhân viên. Lý do:</div>';
  lines.forEach(function(line,i){
    body+='<div style="font-size:13px;color:var(--c-muted2);margin-bottom:8px;line-height:1.45;padding:8px 10px;border-radius:8px;background:rgba(0,0,0,.12)"><b style="color:#fbbf24">'+(i+1)+'.</b> '+esc(line)+'</div>';
  });
  if(pend.suggestStart){
    body+='<div style="font-size:12px;color:#4ade80;margin-top:4px">Nên bắt đầu việc mới từ <b>'+dFmtG(pend.suggestStart)+'</b> trở đi.</div>';
  }
  body+='</div>';
  if(hasOverlap){
    body+='<div style="font-size:13px;color:var(--c-muted);margin-bottom:12px">Chọn cách xử lý cho phù hợp:</div>';
    body+='<div style="display:grid;gap:10px">';
    body+='<button type="button" class="btn btn-accent" style="width:100%;text-align:left;padding:14px 16px;white-space:normal;line-height:1.4" onclick="A.resolveConflict(\'delay\')"><b>1. Dời việc mới</b><br><span style="font-size:12px;opacity:.9">Bắt đầu sau khi hoàn tất việc đang làm'+(pend.suggestStart?" (từ "+dFmtG(pend.suggestStart)+")":"")+'. Gantt cập nhật theo lịch mới.</span></button>';
    body+='<button type="button" class="btn btn-primary" style="width:100%;text-align:left;padding:14px 16px;white-space:normal;line-height:1.4" onclick="A.resolveConflict(\'pause\')"><b>2. Tạm dừng việc đang làm</b><br><span style="font-size:12px;opacity:.9">Ưu tiên việc mới; khi xong quay lại việc cũ. Gantt điều chỉnh lịch việc cũ.</span></button>';
    body+='</div>';
  }else{
    body+='<div style="font-size:13px;color:var(--c-muted);margin-bottom:12px">Chưa trùng ngày kế hoạch, nhưng thời gian di chuyển / nối lịch có rủi ro. Hãy chỉnh lại ngày/giờ, áp dụng ngày đề xuất, hoặc xác nhận vẫn giao.</div>';
    if(pend.suggestStart){
      body+='<div style="display:grid;gap:10px;margin-bottom:8px">';
      body+='<button type="button" class="btn btn-accent" style="width:100%;text-align:left;padding:14px 16px;white-space:normal;line-height:1.4" onclick="A.resolveConflict(\'delay\')"><b>Áp dụng ngày đề xuất</b><br><span style="font-size:12px;opacity:.9">Dời bắt đầu việc mới sang '+dFmtG(pend.suggestStart)+' (đủ thời gian sau việc cũ + di chuyển).</span></button>';
      body+='</div>';
    }
  }
  var footR = hasOverlap
    ? ""
    : btn("btn-primary","Vẫn giao việc","A.resolveConflict('continue')");
  var foot='<div class="modal-foot"><div class="modal-foot-l">'+btn("btn-ghost","Quay lại chỉnh","A.cancelConflict()")+'</div><div class="modal-foot-c"></div><div class="modal-foot-r">'+footR+'</div></div>';
  return'<div class="overlay" onmousedown="A.ovDown(event)" onclick="A.cancelConflict(event)"><div class="modal" onclick="event.stopPropagation()" style="max-width:560px"><div class="row" style="justify-content:space-between;margin-bottom:16px"><h3 style="font-size:18px;font-weight:700;background:linear-gradient(90deg,#fff,#a8d4ff);-webkit-background-clip:text;-webkit-text-fill-color:transparent">Kiểm tra lịch khi giao việc</h3><button class="x-btn" onclick="A.cancelConflict()">×</button></div>'+body+foot+'</div></div>';
}
function eLoc(emp){var ca=curAsgn(emp.id);if(ca){var pr=pById(ca.projId);if(pr){var pl=pLoc(pr);if(pl&&pl.lat!=null)return{loc:{lat:pl.lat,lng:pl.lng},src:"nhà máy KH · "+esc(pl.name)}}}if(homeBasis()||!emp.lastLoc||emp.lastLoc.lat==null){var p=PM[emp.province];return{loc:p?{lat:p.lat,lng:p.lng}:null,src:"nhà · "+esc(emp.province)}}return{loc:{lat:emp.lastLoc.lat,lng:emp.lastLoc.lng},src:"gần nhất · "+(emp.lastLoc.label||"?")+(emp.lastLoc.date?" ("+emp.lastLoc.date+")":"")}}
function pLoc(proj){if(proj.custId){var c=cById(proj.custId);if(c){if(c.lat!=null&&c.lng!=null)return{lat:c.lat,lng:c.lng,name:custDisplayName(c)};var cp=PM[c.province];if(cp)return{lat:cp.lat,lng:cp.lng,name:custDisplayName(c)}}}var p=PM[proj.province];return p?{lat:p.lat,lng:p.lng,name:proj.province}:null}
function hav(a,b){if(!a||!b||a.lat==null||b.lat==null)return null;return Math.round(haversine(a.lat,a.lng,b.lat,b.lng))}
function vnd(n){return n==null?"—":Math.round(n).toLocaleString("vi-VN")+" ₫"}
function locBasisNote(){return "đang làm việc → nhà máy KH · khác → "+(homeBasis()?"nhà":"vị trí gần nhất")}
function reco(proj){if(!proj)return[];return recoGrp(proj,proj.group,1)}
function scoreEmp(proj,emp,minSkill){minSkill=minSkill||1;if((emp.skill||3)<minSkill)return null;if(isEmpOnLeave(emp))return null;var sw=(S.cfg.wP+S.cfg.wA+S.cfg.wS)||1,wp=S.cfg.wP/sw,wa=S.cfg.wA/sw,ws=S.cfg.wS/sw,md=1800,pl=pLoc(proj);var el=eLoc(emp),dist=hav(el.loc,pl),act=ac(emp.id),av=Math.max(0,1-act/(S.cfg.ml||3));if(emp.status==="busy")av*=.4;var prx=dist==null?.5:Math.max(0,1-Math.min(dist,md)/md);var sk=(emp.skill||3)/5;var pts={p:wp*prx*100,a:wa*av*100,s:ws*sk*100};return{emp:emp,dist:dist,act:act,sc:pts.p+pts.a+pts.s,tr:dist==null?null:dist*S.cfg.cpk,pts:pts,src:el.src,busy:busyPct(emp)}}
function recoGrp(proj,group,minSkill){if(isOfficeStaffGroup(group))return[];return fieldEmp(S.emp.filter(function(e){return e.group===group})).map(function(e){return scoreEmp(proj,e,minSkill)}).filter(Boolean).sort(function(a,b){return b.sc-a.sc})}
function defaultGoiyReq(proj){var req={};fieldGroups().forEach(function(g){req[g]={on:proj&&g===proj.group,qty:proj&&g===proj.group?1:1,skill:3}});return req}
function goiyAutoPick(proj,reqs){var pick={},asd=S.asgn.filter(function(a){return a.projId===proj.id&&a.status==="active"});asd.forEach(function(a){pick[a.empId]=true});projPartIds(proj).forEach(function(eid){pick[eid]=true});fieldGroups().forEach(function(g){var r=reqs[g];if(!r||!r.on||r.qty<1)return;var already=0;asd.forEach(function(a){var e=eById(a.empId);if(e&&e.group===g)already++});var need=Math.max(0,r.qty-already),n=0;if(!need)return;recoGrp(proj,g,r.skill).forEach(function(x){if(n>=need)return;if(pick[x.emp.id])return;pick[x.emp.id]=true;n++})});return pick}

var DIR_TABS=[["dash","Tổng quan"],["chat","Thảo luận"],["leave","Nghỉ phép"],["map","Sơ đồ"],["emp","Nhân sự"],["lich","Lịch hẹn"],["cust","Khách hàng"],["proj","Dự án"],["prog","Tiến độ"],["qual","Đánh giá"],["hist","Lịch sử"],["cfg","Cài đặt"]];
/** Điều hành: giao việc, nhân sự, KH, tiến độ (không Đánh giá / Lịch sử; không nằm trong bảng KPI). */
var DH_TABS=[["dash","Tổng quan"],["chat","Thảo luận"],["leave","Nghỉ phép"],["map","Sơ đồ"],["emp","Nhân sự"],["lich","Lịch hẹn"],["cust","Khách hàng"],["proj","Dự án"],["prog","Tiến độ"],["cfg","Cài đặt"]];
/** Giám sát: Tổng quan (không Nhân sự/KH/Chuyên môn), Thảo luận, Nghỉ phép, Lịch hẹn, Dự án, Tiến độ. */
var GS_TABS=[["dash","Tổng quan"],["chat","Thảo luận"],["leave","Nghỉ phép"],["lich","Lịch hẹn"],["proj","Dự án"],["prog","Tiến độ"],["cfg","Cài đặt"]];
/** Hành chính: theo dõi chấm công / nghỉ phép / đi trễ-về sớm / CN làm thêm để tính lương. */
var HC_TABS=[["dash","Tổng quan"],["chamcong","Chấm công"],["leave","Nghỉ phép"],["emp","Nhân sự"],["chat","Thảo luận"],["cfg","Cài đặt"]];
var CHT_TABS=[["chamcong","Chấm công"],["mywork","Công việc"],["report","Báo cáo tiến độ"],["chat","Thảo luận"],["map","Sơ đồ"],["dash","Tổng quan"],["proj","Dự án"],["prog","Tiến độ"],["lich","Lịch hẹn"],["leave","Nghỉ phép"],["settings","Cài đặt"]];
var EMP_TABS=[["chamcong","Chấm công"],["mywork","Công việc"],["report","Báo cáo tiến độ"],["chat","Thảo luận"],["leave","Nghỉ phép"],["settings","Cài đặt"]];
var EMP_TAB_IDS=["chamcong","mywork","report","chat","leave","settings"];
function rawTabs(){
  if(isChiefOnly())return CHT_TABS;
  if(isAdminHr())return HC_TABS;
  if(!hasFullUI())return EMP_TABS;
  if(canViewSensitive())return DIR_TABS;
  if(canOperate())return DH_TABS;
  return GS_TABS;
}
/** Chỉ trả về tab được phép — mục không vào được sẽ không hiện trên thanh tab. */
function getTabs(){
  return rawTabs().filter(function(t){return tabAllowed(t[0]);});
}
function empTabOk(t){return EMP_TAB_IDS.indexOf(t)>=0}
function reportsForAsgn(asgnId,empId,orgHint){return (S.reports||[]).filter(function(r){return r.asgnId===asgnId&&(!empId||r.empId===empId)&&(!orgHint||!r._orgId||r._orgId===orgHint)}).sort(function(a,b){var c=(b.date||"").localeCompare(a.date||"");return c||reportAtMs(b)-reportAtMs(a)})}
function reportAtMs(r){
  if(!r||!r.at)return 0;
  if(r.at.toDate)try{return r.at.toDate().getTime()}catch(e){return 0}
  if(r.at.seconds)return r.at.seconds*1000;
  var t=Date.parse(r.at);return isNaN(t)?0:t;
}
function reportsForEmp(empId){return (S.reports||[]).filter(function(r){return r.empId===empId}).sort(function(a,b){var c=(b.date||"").localeCompare(a.date||"");return c||reportAtMs(b)-reportAtMs(a)})}
function todayReport(asgnId,orgHint){return (S.reports||[]).find(function(r){return r.asgnId===asgnId&&r.date===td()&&(!orgHint||!r._orgId||r._orgId===orgHint)})}
function attAtMs(r){
  if(!r||!r.at)return 0;
  var d=r.at.toDate?r.at.toDate():(r.at.seconds?new Date(r.at.seconds*1000):(typeof r.at==="string"?new Date(r.at):null));
  return d&&!isNaN(d.getTime())?d.getTime():0;
}
function attRecordsToday(type){
  var me=S.auth.empId;
  if(!me)return [];
  return (S.attendance||[]).filter(function(r){
    return r.empId===me&&r.date===td()&&(!type||r.type===type);
  }).sort(function(a,b){return attAtMs(a)-attAtMs(b)});
}
function attHasToday(type){return attRecordsToday(type).length>0}
function vnMinsOfDay(d){
  d=d||new Date();
  var m=d.toLocaleTimeString("en-GB",{timeZone:"Asia/Ho_Chi_Minh",hour:"2-digit",minute:"2-digit",hour12:false});
  var p=m.split(":");
  return parseInt(p[0],10)*60+parseInt(p[1],10);
}
var ATT_IN_DEADLINE=8*60+10;
var ATT_OUT_EARLIEST=17*60-10;
var ATT_TOLERANCE_MIN=10;
function attEvalDeviation(type,mins){
  if(type==="in")return mins>ATT_IN_DEADLINE?mins-ATT_IN_DEADLINE:0;
  return mins<ATT_OUT_EARLIEST?ATT_OUT_EARLIEST-mins:0;
}
function attEvalFromDeviation(type,deviation){
  if(deviation<=0)return{deviationMinutes:0,flag:"ok",label:"Đúng giờ",needsReason:false,kpiWeight:1};
  if(deviation>180)return{deviationMinutes:deviation,flag:"full_day",label:"Không đi làm cả ngày",needsReason:true,kpiWeight:0};
  if(deviation>60)return{deviationMinutes:deviation,flag:"half_day",label:"Không làm 1/2 ngày",needsReason:true,kpiWeight:0.5};
  var flag=type==="in"?"late":"early";
  var label=type==="in"?("Đi trễ "+deviation+" phút"):("Về sớm "+deviation+" phút");
  return{deviationMinutes:deviation,flag:flag,label:label,needsReason:true,kpiWeight:1};
}
function attEvaluatePunch(type,when){
  var mins=vnMinsOfDay(when||new Date());
  return attEvalFromDeviation(type,attEvalDeviation(type,mins));
}
function attNeedsReason(type,when){return attEvaluatePunch(type,when||new Date()).needsReason;}
function attReasonHint(type,when){
  var ev=attEvaluatePunch(type,when||new Date());
  if(!ev.needsReason)return"";
  var base=type==="in"
    ?"Giờ quy định chấm vào 08:00 (sai lệch cho phép 10 phút)."
    :"Giờ quy định chấm ra 17:00 (sai lệch cho phép 10 phút).";
  return base+" Hiện tại: <b>"+ev.label+"</b>. Ghi rõ lý do để giám đốc đánh giá KPI thi đua.";
}
function attRecordAt(r){
  if(!r||!r.at)return null;
  var d=r.at.toDate?r.at.toDate():(r.at.seconds?new Date(r.at.seconds*1000):(typeof r.at==="string"?new Date(r.at):null));
  return d&&!isNaN(d.getTime())?d:null;
}
function attRecordEval(r){
  if(!r)return{deviationMinutes:0,flag:"ok",label:"Đúng giờ",needsReason:false,kpiWeight:1};
  if(r.attendanceFlag!=null){
    var base=attEvalFromDeviation(r.type,r.deviationMinutes||0);
    return{
      deviationMinutes:r.deviationMinutes||0,
      flag:r.attendanceFlag,
      label:r.attendanceLabel||base.label,
      needsReason:(r.deviationMinutes||0)>0||!!r.outsideWindow,
      kpiWeight:r.kpiWeight!=null?r.kpiWeight:base.kpiWeight
    };
  }
  var d=attRecordAt(r);
  if(!d)return{deviationMinutes:0,flag:"ok",label:"Đúng giờ",needsReason:!!r.outsideWindow,kpiWeight:1};
  var ev2=attEvaluatePunch(r.type,d);
  if(r.outsideWindow)ev2.needsReason=true;
  return ev2;
}
function attFlagColor(flag){
  return{ok:"#4ade80",late:"#fbbf24",early:"#fbbf24",half_day:"#fb923c",full_day:"#ff4a4a"}[flag]||"var(--c-muted)";
}
function attPunchDetailHTML(r){
  var ev=attRecordEval(r);
  var h="";
  if(ev.flag!=="ok")h+=' <span style="color:'+attFlagColor(ev.flag)+'">· '+esc(ev.label)+'</span>';
  if((ev.needsReason||r.outsideWindow)&&r.lateReason)h+=' · <span style="color:#fbbf24">Giải trình: '+esc(r.lateReason)+'</span>';
  return h;
}
function attCycleNoticeHTML(c){
  var labels = [];
  var reason = "";
  if(c.inRec){
    var evIn = attRecordEval(c.inRec);
    if(evIn.flag !== "ok"){
      var lbl = evIn.label || "";
      lbl = lbl.replace("Không đi làm cả ngày", "Không đi làm").replace("Không làm 1/2 ngày", "Không làm 1/2 ngày");
      labels.push(lbl);
    }
    if(c.inRec.lateReason){
      reason = c.inRec.lateReason;
    }
  }
  if(c.outRec){
    var evOut = attRecordEval(c.outRec);
    if(evOut.flag !== "ok"){
      var lbl = evOut.label || "";
      lbl = lbl.replace("Không đi làm cả ngày", "Không đi làm").replace("Không làm 1/2 ngày", "Không làm 1/2 ngày");
      if(labels.indexOf(lbl) === -1){
        labels.push(lbl);
      }
    }
    if(c.outRec.lateReason && !reason){
      reason = c.outRec.lateReason;
    }
  }
  var missingOut = "";
  if(c.inRec && !c.outRec){
    missingOut = ' · <span style="color:#f87171;font-weight:600">Thiếu chấm công ra</span>';
  }
  if(labels.length === 0 && !reason){
    return missingOut;
  }
  var labelsHTML = "";
  if(labels.length > 0){
    var isFullDay = (labels.indexOf("Không đi làm") >= 0);
    var color = isFullDay ? "#ff4a4a" : "#fbbf24";
    var weight = isFullDay ? "700" : "600";
    labelsHTML = '<span style="color:' + color + ';font-weight:' + weight + '">' + esc(labels.join(" / ")) + '</span>';
  }
  var reasonHTML = "";
  if(reason){
    reasonHTML = (labelsHTML ? ', ' : '') + '<span style="color:#fb923c;font-weight:700">' + esc(reason) + '</span>';
  }
  return ' · ' + labelsHTML + reasonHTML + missingOut;
}
function attSeverityOrder(flag){
  return{ok:0,late:1,early:1,half_day:2,full_day:3}[flag]||0;
}
function attDayWorstEval(recs){
  var worst={flag:"ok",label:"Đúng giờ",deviationMinutes:0,kpiWeight:1};
  (recs||[]).forEach(function(r){
    var ev=attRecordEval(r);
    if(attSeverityOrder(ev.flag)>attSeverityOrder(worst.flag)||(ev.flag===worst.flag&&ev.deviationMinutes>worst.deviationMinutes))worst=ev;
  });
  return worst;
}
function attRecordsForDay(empId,date){
  return (S.attendance||[]).filter(function(r){return r.empId===empId&&r.date===date}).sort(function(a,b){return attAtMs(a)-attAtMs(b)});
}
function attDayStatus(empId,date){
  var recs=attRecordsForDay(empId,date);
  var hasIn=recs.some(function(r){return r.type==="in"});
  var hasOut=recs.some(function(r){return r.type==="out"});
  if(hasIn&&hasOut)return "complete";
  if(hasIn||hasOut)return "incomplete";
  return "off";
}
function attDayStatusLabel(st){
  return {complete:"Đủ công",incomplete:"Chưa đủ (thiếu chấm)",off:"Nghỉ / không chấm"}[st]||st;
}
function attDayStatusUILabel(empId,date,st){
  var recs=attRecordsForDay(empId,date);
  var hasIn=recs.some(function(r){return r.type==="in"});
  var hasOut=recs.some(function(r){return r.type==="out"});
  if(recs.length===0){
    return date===td()?"Chưa chấm công":"Nghỉ / không chấm";
  }
  if(!hasIn||!hasOut){
    return "Chấm công thiếu";
  }
  var worst=attDayWorstEval(recs);
  if(worst.flag==="full_day"){
    return "Không đi làm";
  }
  if(worst.flag==="half_day"){
    return "Làm 1/2 ngày";
  }
  return "Có đi làm";
}
function attDayStatusColor(st,empId,date){
  if(!empId||!date){
    return {complete:"#4ade80",incomplete:"#fbbf24",off:"#ff4a4a"}[st]||"var(--c-muted)";
  }
  var recs=attRecordsForDay(empId,date);
  if(recs.length===0)return "#ff4a4a";
  var hasIn=recs.some(function(r){return r.type==="in"});
  var hasOut=recs.some(function(r){return r.type==="out"});
  if(!hasIn||!hasOut)return "#fbbf24";
  var worst=attDayWorstEval(recs);
  if(worst.flag==="full_day")return "#ff4a4a";
  if(worst.flag==="half_day")return "#fb923c";
  return "#4ade80";
}
function attMonthKey(d){
  d=d||new Date();
  return d.getFullYear()+"-"+pad2(d.getMonth()+1);
}
function attDaysInMonth(mk){
  var p=mk.split("-");
  var y=+p[0],mo=+p[1];
  var n=new Date(y,mo,0).getDate();
  var days=[];
  for(var i=1;i<=n;i++)days.push(y+"-"+pad2(mo)+"-"+pad2(i));
  return days;
}
function attMonthlySummary(empId,mk){
  mk=mk||attMonthKey();
  var days=attDaysInMonth(mk);
  var today=td();
  var rows=[];
  var counts={complete:0,incomplete:0,off:0};
  var kpi={late:0,early:0,half:0,full:0};
  days.forEach(function(date){
    if(date>today)return;
    var dow=new Date(date+"T12:00:00").getDay();
    var recs=attRecordsForDay(empId,date);
    var st=attDayStatus(empId,date);
    var dayKpi=attDayWorstEval(recs);
    recs.forEach(function(r){
      var ev=attRecordEval(r);
      if(ev.flag==="late")kpi.late++;
      if(ev.flag==="early")kpi.early++;
      if(ev.flag==="half_day")kpi.half++;
      if(ev.flag==="full_day")kpi.full++;
    });
    if(dow===0){
      if(!recs.length)return;
      rows.push({date:date,status:st,dow:dow,recs:recs,ot:true,dayKpi:dayKpi});
      return;
    }
    if(dow>=1&&dow<=6){
      if(!(date===today&&st==="off"))counts[st]++;
      rows.push({date:date,status:st,dow:dow,recs:recs,dayKpi:dayKpi});
    }
  });
  return {rows:rows,counts:counts,kpi:kpi,mk:mk};
}
function attMonthlyReportHTML(empId){
  var emp=eById(empId);
  if(isOfficeStaffEmp(emp)){
    return "";
  }
  var mk=S.attMonth||attMonthKey();
  var sum=attMonthlySummary(empId,mk);
  var h='<div class="card card-p" style="margin-top:16px"><h3 style="font-size:16px;font-weight:700;color:var(--c-accent);margin-bottom:12px">Báo cáo chấm công tháng · KPI</h3>';
  h+='<div class="row" style="gap:8px;margin-bottom:12px;align-items:center;flex-wrap:wrap"><input type="month" id="att-month-pick" value="'+mk+'" onchange="A.attMonthPick(this.value)" style="flex:1;min-width:140px"></div>';
  h+='<div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:10px;font-size:12px;font-weight:600">';
  h+='<span style="color:#4ade80">Đủ công: '+sum.counts.complete+'</span>';
  h+='<span style="color:#fbbf24">Chưa đủ: '+sum.counts.incomplete+'</span>';
  h+='<span style="color:#f87171">Nghỉ: '+sum.counts.off+'</span>';
  h+='</div>';
  h+='<div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:14px;font-size:12px">';
  h+='<span style="color:#fbbf24">Đi trễ: '+sum.kpi.late+'</span>';
  h+='<span style="color:#fbbf24">Về sớm: '+sum.kpi.early+'</span>';
  h+='<span style="color:#fb923c">Không làm ½ ngày: '+sum.kpi.half+'</span>';
  h+='<span style="color:#f87171">Không làm cả ngày: '+sum.kpi.full+'</span>';
  h+='</div>';
  if(!sum.rows.length)h+='<div style="font-size:13px;color:var(--c-muted)">Chưa có dữ liệu tháng này.</div>';
  else{
    sum.rows.forEach(function(row){
      var col=attDayStatusColor(row.status,empId,row.date);
      var lbl=attDayStatusUILabel(empId,row.date,row.status);
      if(row.ot)lbl+=" (CN)";
      if(row.dayKpi&&row.dayKpi.flag!=="ok"&&row.recs.length)lbl+=' · <span style="color:'+attFlagColor(row.dayKpi.flag)+'">'+esc(row.dayKpi.label)+'</span>';
      h+='<div style="padding:10px 0;border-bottom:1px solid var(--c-border4)">';
      h+='<div class="row" style="justify-content:space-between;align-items:flex-start;gap:8px"><span style="font-size:13px;font-weight:600">'+dFmt(row.date)+'</span><span style="font-size:12px;font-weight:600;color:'+col+';text-align:right;line-height:1.45">'+lbl+'</span></div>';
      if(row.recs.length){
        h+='<div style="font-size:12px;color:var(--c-muted2);margin-top:4px;line-height:1.55">';
        row.recs.forEach(function(r){
          h+='<div>'+(r.type==="in"?"Vào":"Ra")+' <b>'+attFmtClock(r.at)+'</b>'+attPunchDetailHTML(r)+'</div>';
        });
        h+='</div>';
      }
      h+='</div>';
    });
  }
  return h+'</div>';
}
function attFmtClock(at){
  var d=attRecordAt({at:at});
  if(!d)return "—";
  return d.toLocaleTimeString("en-GB",{timeZone:"Asia/Ho_Chi_Minh",hour:"2-digit",minute:"2-digit",hour12:false});
}
function isAttWorkDay(d){var day=(d||new Date()).getDay();return day>=1&&day<=6}
function attNeedRemind(){
  if(!isEmpPortal()||!S.auth.empId||!isAttWorkDay())return null;
  var h=new Date().getHours();
  if(h>=8&&!attHasToday("in"))return "in";
  if(h>=17&&attHasToday("in")&&!attHasToday("out"))return "out";
  return null;
}
function attRemindText(slot){
  if(slot==="in")return "⚠ Bạn chưa chấm vào hôm nay — bấm «Chấm vào» và chụp ảnh nhà máy / công trường.";
  return "⚠ Bạn chưa chấm ra — bấm «Chấm ra» và chụp ít nhất 3 ảnh công việc.";
}
function checkAttendanceRemind(){
  if(!isEmpPortal()||!S.auth.empId||S.modal||S.attFlow||S.arrivalFlow)return;
  var slot=attNeedRemind();
  if(!slot)return;
  var key="cv3_att_remind_"+td()+"_"+slot;
  try{if(localStorage.getItem(key))return;}catch(e){}
  try{localStorage.setItem(key,"1");}catch(e){}
  playBellSound();
  showAppToast(attRemindText(slot),"warn");
  if("Notification" in window&&Notification.permission==="granted"){
    showNoti("Chấm công",{body:attRemindText(slot),icon:appUrl("icon-192.png"),tag:"att_"+td()+"_"+slot},"remind");
  }
}
function asgnLocLabel(a){
  if(!a)return "vị trí mới";
  var p=pById(a.projId),pl=pLoc(p);
  return pl?pl.name:(p?p.name:(a.workContent||"vị trí mới"));
}
function readArriveAtInput(inputId){
  var el=document.getElementById(inputId);
  var v=el?String(el.value||"").trim():"";
  if(!v)return "";
  var ms=remindAtMs(v);
  if(!ms||isNaN(ms))return "invalid";
  return v;
}
function arriveAtIsFuture(arriveAt){
  var ms=remindAtMs(arriveAt);
  return !!(ms&&!isNaN(ms)&&ms>Date.now());
}
function mkArrivalReminder(empId,asgnId,arriveAt,locName){
  return{id:uid(),kind:"arrival",empId:empId,asgnId:asgnId,at:arriveAt,text:"Xác nhận đã đến «"+(locName||"vị trí mới")+"» chưa?",fired:false,done:false,createdAt:new Date().toISOString()};
}
function addArrivalReminder(empId,asgnId,arriveAt,locName){
  if(!arriveAt||!arriveAtIsFuture(arriveAt))return null;
  S.reminders=S.reminders||[];
  S.reminders=S.reminders.filter(function(r){return!(r.kind==="arrival"&&r.asgnId===asgnId&&!r.done)});
  var r=mkArrivalReminder(empId,asgnId,arriveAt,locName);
  S.reminders.push(r);
  return r;
}
function empArrivalReminders(needAction){
  var me=S.auth.empId;
  if(!me)return [];
  return (S.reminders||[]).filter(function(r){
    if(r.kind!=="arrival"||r.empId!==me||r.done)return false;
    if(needAction)return !!r.fired;
    return true;
  }).sort(function(a,b){
    var ta=remindAtMs(a.at),tb=remindAtMs(b.at);
    if(isNaN(ta)&&isNaN(tb))return 0;
    if(isNaN(ta))return 1;
    if(isNaN(tb))return -1;
    return ta-tb;
  });
}
function arrivalBannerHTML(r){
  if(!r)return "";
  return'<div class="arrival-banner"><div class="arrival-banner-txt">📍 <b>'+esc(r.text||"Xác nhận đã đến vị trí mới")+'</b></div><button type="button" class="btn btn-accent btn-sm" onclick="A.arrivalStart(\''+r.id+'\',\''+r.asgnId+'\')">Xác nhận đã đến vị trí</button></div>';
}
function empArrivalBannersHTML(){
  var list=empArrivalReminders(true);
  if(!list.length)return "";
  return list.map(arrivalBannerHTML).join("");
}
function rptFmtTime(r){
  if(!r)return "";
  if(r.date)return dFmt(r.date);
  if(!r.at)return "";
  var d=r.at.toDate?r.at.toDate():(r.at.seconds?new Date(r.at.seconds*1000):null);
  if(!d||isNaN(d.getTime()))return "";
  return dFmtG(d.getFullYear()+"-"+pad2(d.getMonth()+1)+"-"+pad2(d.getDate()));
}
function renderReportPhotos(photos){
  if(!photos||!photos.length)return "";
  return '<div class="rpt-photos">'+photos.map(function(u){return '<a href="'+esc(u)+'" target="_blank" rel="noopener"><img src="'+esc(u)+'" alt="Ảnh công việc"></a>'}).join("")+'</div>';
}
function renderReportsBlock(asgnId,limit){
  var reps=reportsForAsgn(asgnId).slice(0,limit||5);
  if(!reps.length)return "";
  var h='<div class="rpt-block"><div style="font-size:12px;font-weight:600;color:var(--c-accent);margin-bottom:8px">Báo cáo tiến độ gần đây</div>';
  reps.forEach(function(r){
    h+='<div class="rpt-card"><div class="rpt-head">'+esc(r.fromName||"?")+' · '+rptFmtTime(r)+' · <span style="color:#38bdf8">'+r.prog+'%</span></div>';
    h+='<div style="font-size:13px;color:var(--c-text2);white-space:pre-wrap">'+esc(r.note||"")+'</div>';
    h+=renderReportPhotos(r.photos);
    h+='</div>';
  });
  return h+'</div>';
}
function tabIds(){return getTabs().map(function(t){return t[0]})}
function coworkersOnProj(projId,excludeEmpId){
  var seen={},names=[];
  (S.asgn||[]).forEach(function(x){
    if(!x||x.projId!==projId||x.empId===excludeEmpId)return;
    if(x.status!=="active"&&x.status!=="paused")return;
    if(seen[x.empId])return;
    seen[x.empId]=1;
    var e=eById(x.empId);
    if(e&&e.name)names.push(e.name);
  });
  return names;
}
function canNavPrev(){return S.tab==="lich"||(S.hist&&S.hist.length>0)||tabIds().indexOf(S.tab)>0}
function canNavNext(){var ids=tabIds();return ids.indexOf(S.tab)<ids.length-1}
function initScreenNavSwipe(){
  if(initScreenNavSwipe._ok)return;
  initScreenNavSwipe._ok=1;
  var sx=0,sy=0,dx=0,dy=0,active=0,allow=0,target=null;
  var MIN_X=72,MAX_Y=48;
  function blocked(el){
    if(!el||!el.closest)return false;
    return !!el.closest('input,textarea,select,button,a,[contenteditable="true"],.modal,.gantt-scroll,.swipe-wrap,.tabs');
  }
  document.addEventListener("touchstart",function(e){
    if(isFieldPortal()||S.modal||S.form||S.attFlow||S.arrivalFlow||S.giaoProj||S.helpOpen||!e.touches||e.touches.length!==1)return;
    target=e.target;
    if(blocked(target))return;
    var t=e.touches[0];
    sx=t.clientX;sy=t.clientY;dx=0;dy=0;active=1;allow=1;
  },{passive:true});
  document.addEventListener("touchmove",function(e){
    if(!active||!allow||!e.touches||e.touches.length!==1)return;
    var t=e.touches[0];
    dx=t.clientX-sx;dy=t.clientY-sy;
    if(Math.abs(dy)>MAX_Y&&Math.abs(dy)>Math.abs(dx))allow=0;
  },{passive:true});
  document.addEventListener("touchend",function(){
    if(!active||!allow){active=0;allow=0;return;}
    try{
      var sel=window.getSelection&&window.getSelection();
      if(sel&&!sel.isCollapsed&&String(sel).length){active=0;allow=0;return;}
    }catch(e1){}
    var adx=Math.abs(dx),ady=Math.abs(dy);
    if(adx>=MIN_X&&adx>ady*1.2){
      if(dx>0)A.navPrev();
      else A.navNext();
    }
    active=0;allow=0;target=null;
  },{passive:true});
}
function updateNavBtns(){
  var bp=document.getElementById("btn-prev"),bn=document.getElementById("btn-next");
  var editing=!!(S.modal||S.form||S.attFlow||S.arrivalFlow||S.giaoProj||S.helpOpen||S.conflictPending);
  var hide=isFieldPortal()||editing;
  if(bp)bp.classList.toggle("visible",!hide&&canNavPrev());
  if(bn)bn.classList.toggle("visible",!hide&&canNavNext());
}
function pad2(n){return n<10?"0"+n:""+n}
function unlockAppAudio(){
  if(window.__CV3_audioUnlocked)return;
  window.__CV3_audioUnlocked=1;
  try{
    var Ctx=window.AudioContext||window.webkitAudioContext;
    if(!Ctx)return;
    if(!window.__CV3_audioCtx)window.__CV3_audioCtx=new Ctx();
    if(window.__CV3_audioCtx.state==="suspended")window.__CV3_audioCtx.resume();
  }catch(e){}
}
function playBellSound(){
  try{
    var Ctx=window.AudioContext||window.webkitAudioContext;
    if(!Ctx)return;
    if(!window.__CV3_audioCtx)window.__CV3_audioCtx=new Ctx();
    var ctx=window.__CV3_audioCtx;
    if(ctx.state==="suspended")ctx.resume();
    var master=ctx.createGain();
    master.gain.value=1;
    master.connect(ctx.destination);
    function ding(freq,t0,dur,vol){
      var o=ctx.createOscillator(),g=ctx.createGain();
      o.type="triangle";
      o.frequency.value=freq;
      var t=ctx.currentTime+t0;
      var peak=Math.min(1,vol||1);
      g.gain.setValueAtTime(0.0001,t);
      g.gain.exponentialRampToValueAtTime(peak,t+0.02);
      g.gain.exponentialRampToValueAtTime(0.0001,t+dur);
      o.connect(g);g.connect(master);
      o.start(t);o.stop(t+dur+0.05);
    }
    ding(1174.66,0,0.75,1);
    ding(880,0.14,0.85,1);
    ding(1318.51,0.3,1,1);
    ding(1046.5,0.48,1.15,0.95);
  }catch(e){}
}
function getVapidKey(){
  var k=(S.cfg&&S.cfg.vapidKey)||window.FIREBASE_VAPID_KEY||"";
  k=String(k).trim();
  return k&&k!=="YOUR_VAPID_KEY"?k:"";
}
function applyVapidFromCfg(){
  var k=getVapidKey();
  if(k)window.FIREBASE_VAPID_KEY=k;
}
function remindVapidOk(){return !!getVapidKey()}
function remindVapidFailShort(){return "Chưa bật được — chưa cấu hình VAPID (push)."}
function remindVapidFailDetail(){return "Dán Key pair tại Cài đặt → Thông báo push → Lưu VAPID (đồng bộ cloud). Hoặc cập nhật FIREBASE_VAPID_KEY trong public/firebase-config.js rồi deploy."}
function remindAtToIso(localStr){
  if(!localStr)return "";
  var m=String(localStr).match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if(!m)return localStr;
  var d=new Date(+m[1],+m[2]-1,+m[3],+m[4],+m[5],0,0);
  return isNaN(d.getTime())?localStr:d.toISOString();
}
function remindAtToLocal(at){
  if(!at)return "";
  var d=new Date(at);
  if(isNaN(d.getTime()))return String(at).slice(0,16);
  return d.getFullYear()+"-"+pad2(d.getMonth()+1)+"-"+pad2(d.getDate())+"T"+pad2(d.getHours())+":"+pad2(d.getMinutes());
}
function remindAtMs(at){
  if(!at)return NaN;
  var s=String(at);
  if(/Z$|[+-]\d{2}:?\d{2}$/.test(s))return new Date(s).getTime();
  var m=s.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if(!m)return new Date(s).getTime();
  return new Date(+m[1],+m[2]-1,+m[3],+m[4],+m[5],0,0).getTime();
}
function remindPushOk(){
  return remindVapidOk()&&typeof Notification!=="undefined"&&Notification.permission==="granted"&&window.__CV3_FCM&&window.__CV3_FCM.token;
}
function empPushOk(empId){
  var e=empId?eById(empId):null;
  var isMe=S.auth&&S.auth.empId===empId;
  var token=(e&&e.fcmToken)||(isMe&&window.__CV3_FCM&&window.__CV3_FCM.token)||"";
  return !!(token&&typeof Notification!=="undefined"&&Notification.permission==="granted");
}
function empPushHint(empId){
  if(isLocalDev())return "Đang chạy local (localhost) — dùng để test giao diện. Push khi đóng app cần bản HTTPS: project.saigonref.com";
  if(!window.__CV3_SKIP_SEED)return "Chế độ offline — cần đăng nhập cloud để nhận thông báo.";
  if(!remindVapidOk())return remindVapidFailShort();
  if(empPushOk(empId))return "Đã bật — sẽ nhận push khi giám đốc giao việc mới / tin nhắn (kể cả khi đóng app). Số chưa đọc hiện trên icon nếu cài PWA (Android Chrome / desktop; iOS cần thêm Homescreen).";
  if(typeof Notification!=="undefined"&&Notification.permission==="denied")return "Trình duyệt đã chặn thông báo — mở cài đặt trình duyệt để cho phép.";
  if(!window.isSecureContext)return "Cần mở app qua HTTPS (hoặc localhost) để bật thông báo push.";
  return "Bấm «Bật thông báo giao việc». Trên điện thoại: thêm app vào màn hình chính (PWA) rồi bật thông báo — mới nhận được khi đóng app. iOS Safari chỉ hỗ trợ push khi đã cài PWA (iOS 16.4+).";
}
function empPushFailMsg(res){
  if(res&&res.reason==="local-dev")return "Local dev — push chỉ test được trên bản deploy HTTPS.";
  if(res&&res.reason==="denied")return "Trình duyệt chưa cho phép thông báo — mở cài đặt trình duyệt để bật.";
  if(res&&res.reason==="no-config")return "Chưa cấu hình VAPID — liên hệ giám đốc.";
  if(res&&res.reason==="unsupported")return "Thiết bị/trình duyệt không hỗ trợ thông báo push.";
  if(res&&res.reason==="no-token")return "Không lấy được token thông báo — thử tải lại trang.";
  if(res&&res.reason==="sw-fail")return "Không đăng ký được service worker — tải lại trang hoặc mở bản deploy (HTTPS).";
  if(res&&res.reason==="insecure")return "Cần HTTPS để bật thông báo — mở app qua link deploy, không dùng IP LAN.";
  if(res&&res.reason&&res.reason!=="unknown")return res.reason;
  return "Chưa bật được thông báo — thử lại hoặc kiểm tra cài đặt trình duyệt.";
}
function empPushBlockHTML(empId,opts){
  opts=opts||{};
  var isMe=opts.isMe!==false,showBtn=opts.showBtn!==false,busy=!!S.empPushBusy,status=S.empPushMsg||"";
  var h='<div class="emp-push-block" style="margin-bottom:14px;padding:12px;background:rgba(56,189,248,.08);border:1px solid rgba(56,189,248,.2);border-radius:12px">';
  h+='<div style="font-size:12px;font-weight:600;color:#38bdf8;margin-bottom:6px">📱 Thông báo giao việc & chat</div>';
  if(busy)h+='<div class="emp-push-status busy">⏳ Đang bật thông báo…</div>';
  else if(empPushOk(empId))h+='<div class="emp-push-status ok">✓ Đã bật thông báo nền thành công</div>';
  else if(status)h+='<div class="emp-push-status '+(status.indexOf("✓")===0?"ok":"err")+'">'+esc(status)+'</div>';
  if(showBtn&&isMe&&!empPushOk(empId)){
    if(busy)h+='<button type="button" class="btn btn-accent btn-sm" disabled>Đang bật…</button>';
    else h+=btn("btn-accent btn-sm","Bật thông báo nền","A.notifEmp('"+empId+"')");
  }
  h+='<div class="hint" style="margin-top:8px;font-size:11px;color:var(--c-muted2)">'+esc(empPushHint(empId))+'</div>';
  return h+'</div>';
}
function showAppToast(text,type){
  if(!text)return;
  // Chỉ hiện lỗi + tin chat (info). Bỏ toast xanh «✓ Đã…» sau mỗi thao tác.
  if(type!=="err"&&type!=="info")return;
  var root=document.getElementById("app-toast-root");
  if(!root){root=document.createElement("div");root.id="app-toast-root";root.className="app-toast-root";document.body.appendChild(root);}
  root.innerHTML="";
  var el=document.createElement("div");
  el.className="app-toast "+(type==="info"?"info":"err");
  el.textContent=(type==="err"?"✗ ":"")+text;
  root.appendChild(el);
  setTimeout(function(){if(el.parentElement)el.remove()},type==="info"?4500:5000);
}
var _chatToastAt=0,_chatToastId="";
function toastIncomingChat(m){
  if(!m)return;
  var id=m.id?String(m.id):"";
  var now=Date.now();
  if(id&&id===_chatToastId&&now-_chatToastAt<4500)return;
  _chatToastId=id;_chatToastAt=now;
  var who=m.fromName||m.from||"Tin nhắn";
  var body=String(m.text||"").slice(0,80);
  showAppToast(who+(body?": "+body:""),"info");
}
function empPushNotifyTest(){
  if(typeof Notification==="undefined"||Notification.permission!=="granted")return;
  showNoti("✓ Thông báo giao việc",{body:"Đã bật thành công — bạn sẽ nhận tin khi được giao việc mới.",icon:appUrl("icon-192.png"),tag:"emp_push_ok"},"noti");
}
function remindPushHint(){
  if(!window.__CV3_SKIP_SEED)return "Chế độ offline — nhắc hẹn chỉ kêu khi mở app. Đăng nhập cloud để nhận khi app đóng.";
  if(!remindVapidOk())return remindVapidFailShort()+" "+remindVapidFailDetail();
  if(remindPushOk())return "Đã bật thông báo nền — nhắc hẹn sẽ đến ngay cả khi đóng app (tiếng chuông hệ thống trên điện thoại/máy).";
  if(typeof Notification!=="undefined"&&Notification.permission==="denied")return "Trình duyệt đã chặn thông báo — mở cài đặt trình duyệt để cho phép, rồi bấm «Bật thông báo nền».";
  return "Bấm «Bật thông báo nền» một lần để nhận nhắc hẹn khi app đóng (cần đăng nhập cloud).";
}
var _remindToastShown={};
var REMIND_TOAST_TTL_MS=3*60*1000;
function remindToastKeys(r){
  var keys=[],id,asgn,emp,at,tx;
  if(!r)return keys;
  id=r.id?String(r.id):"";
  if(id)keys.push("id:"+id);
  if(r.kind==="arrival"){
    asgn=r.asgnId?String(r.asgnId):"";
    emp=r.empId!=null?String(r.empId):"";
    if(asgn)keys.push("arr:"+asgn+"|"+emp);
  }else{
    at=r.at?String(r.at).slice(0,16):"";
    tx=r.text?String(r.text).slice(0,80):"";
    if(at||tx)keys.push("tx:"+at+"|"+tx);
  }
  return keys;
}
function remindToastAlreadyVisible(key){
  var root=document.getElementById("remind-toast-root");
  if(!root||!key)return false;
  var nodes=root.querySelectorAll("[data-remind-key]"),i,attr,parts,j;
  for(i=0;i<nodes.length;i++){
    attr=nodes[i].getAttribute("data-remind-key")||"";
    if(attr===key)return true;
    parts=attr.split("\n");
    for(j=0;j<parts.length;j++){if(parts[j]===key)return true;}
  }
  return false;
}
function claimRemindToast(r){
  var keys=remindToastKeys(r),now=Date.now(),i,k,prev;
  if(!keys.length)return true;
  for(i=0;i<keys.length;i++){
    k=keys[i];
    prev=_remindToastShown[k];
    if(prev&&now-prev<REMIND_TOAST_TTL_MS)return false;
    if(remindToastAlreadyVisible(k))return false;
  }
  for(i=0;i<keys.length;i++)_remindToastShown[keys[i]]=now;
  if(Object.keys(_remindToastShown).length>80){
    for(k in _remindToastShown){
      if(Object.prototype.hasOwnProperty.call(_remindToastShown,k)&&now-_remindToastShown[k]>=REMIND_TOAST_TTL_MS)delete _remindToastShown[k];
    }
  }
  return true;
}
function remindToastIsDup(r){
  var keys=remindToastKeys(r),now=Date.now(),i,k,prev;
  if(!keys.length)return false;
  for(i=0;i<keys.length;i++){
    k=keys[i];
    prev=_remindToastShown[k];
    if(prev&&now-prev<REMIND_TOAST_TTL_MS)return true;
    if(remindToastAlreadyVisible(k))return true;
  }
  return false;
}
/** Nhắc đến vị trí (arrival) chỉ cho đúng người được giao.
 *  Nhắc hẹn công ty / cá nhân: không toast cho nhân viên portal (chỉ GD/DH/GS). */
function remindToastRelevant(r){
  if(!r)return false;
  if(r.kind==="arrival"){
    if(!S.auth||!S.auth.empId)return false;
    return String(r.empId||"")===String(S.auth.empId||"");
  }
  if(isEmpPortal())return false;
  return true;
}
function applyIncomingReminders(incoming){
  if(!incoming)return;
  var prevFired={};
  (S.reminders||[]).forEach(function(r){if(r.fired)prevFired[r.id]=true;});
  var newlyFired=[];
  incoming.forEach(function(r){
    if(r.fired&&!r.done&&r.seen!==true&&!prevFired[r.id])newlyFired.push(r);
  });
  S.reminders=incoming;
  if(newlyFired.length){
    var toShow=newlyFired.filter(function(r){return remindToastRelevant(r)&&!remindToastIsDup(r);});
    if(toShow.length){
      unlockAppAudio();
      playBellSound();
      showRemindToast(toShow);
    }
    updateRemindBadge();
    if(isEmp()&&(S.tab==="mywork"||S.tab==="chamcong"))render();
  }
}
function remindFmt(at){
  if(!at)return "—";
  var d=new Date(at);
  if(isNaN(d.getTime()))return at;
  return pad2(d.getDate())+"/"+pad2(d.getMonth()+1)+" "+pad2(d.getHours())+":"+pad2(d.getMinutes());
}
function unreadRemindCount(){return myRemindList().filter(function(r){return r.fired&&!r.done&&r.seen!==true&&remindToastRelevant(r)}).length}
function unreadChatCount(){
  var me=S.auth&&S.auth.uid;
  if(!me)return 0;
  var n=0,i,m,list=S.chat||[];
  for(i=0;i<list.length;i++){
    m=list[i];
    if(!m||!m.id)continue;
    if(m.uid===me)continue;
    if(m.readAt)continue;
    // Nghỉ phép chỉ đếm ở tab Nghỉ phép
    if(m.type==="leave"||isLeaveRelatedDm(m))continue;
    if(m.type==="dm"){
      if(m.toUid&&m.toUid!==me)continue;
      n++;
    }
  }
  return n;
}
function leaveMsgCountsAsUnread(m){
  var me=S.auth&&S.auth.uid;
  if(!m||!me)return false;
  if(m.uid===me)return false;
  if(m.readAt)return false;
  if(m.type==="leave"){
    if(!m.participants||m.participants.indexOf(me)<0)return false;
  }else if(isLeaveRelatedDm(m)){
    if(m.toUid&&m.toUid!==me&&m.uid!==me)return false;
  }else return false;
  var kind=String(m.kind||"");
  // Đơn xin nghỉ: chỉ còn "tin mới" khi đơn còn chờ duyệt.
  // GD đã duyệt/từ chối → đơn gốc không còn là tin mới với GD.
  if(kind==="leave_req"){
    var req=m.leaveReqId?leaveReqById(m.leaveReqId):null;
    if(req&&req.status&&req.status!=="pending")return false;
    return true;
  }
  // Phản hồi duyệt / chat góp ý: tin mới với người nhận (NV, HC…)
  return true;
}
function unreadLeaveCount(){
  var me=S.auth&&S.auth.uid;
  if(!me)return 0;
  var n=0,i,m,list=S.chat||[],seen={};
  for(i=0;i<list.length;i++){
    m=list[i];
    if(!leaveMsgCountsAsUnread(m))continue;
    if(m.leaveReqId){
      if(seen[m.leaveReqId])continue;
      seen[m.leaveReqId]=1;
    }
    n++;
  }
  return n;
}
function unreadLeaveForReq(reqId){
  reqId=String(reqId||"").trim();
  if(!reqId)return 0;
  return unreadChatCountForTo(leaveRoomKey(reqId));
}
function unreadChatCountForTo(chatTo){
  var me=S.auth&&S.auth.uid;
  if(!me||!chatTo||chatTo==="broadcast")return 0;
  var msgs=chatMsgsForTo(chatTo),n=0,i,m;
  for(i=0;i<msgs.length;i++){
    m=msgs[i];
    if(!m)continue;
    if(isLeaveChatTo(chatTo)||m.type==="leave"||isLeaveRelatedDm(m)){
      if(!leaveMsgCountsAsUnread(m))continue;
      n++;
      continue;
    }
    if(m.uid===me)continue;
    if(m.readAt)continue;
    if(m.type==="dm"){
      if(m.toUid&&m.toUid!==me)continue;
    }else continue;
    n++;
  }
  return n;
}
function markLeaveBoardRead(reqId){
  reqId=String(reqId||"").trim();
  if(!reqId||!S.auth||!S.auth.uid)return;
  if(typeof window.__CV3_markChatThreadRead!=="function")return;
  window.__CV3_markChatThreadRead(chatMsgsForTo(leaveRoomKey(reqId)),S.auth.uid);
}
function resolveChatDmTarget(authUid){
  authUid=authUid?String(authUid):"";
  if(!authUid)return"";
  if(authUid==="broadcast")return"broadcast";
  var dir=directorChatRecipient();
  if(dir&&dir.uid&&dir.uid===authUid)return dir.empId;
  var e=(S.emp||[]).find(function(x){return x.authUid===authUid});
  if(e)return e.id;
  var r=chatRecipients().find(function(x){return x.uid===authUid});
  return r?r.empId:"";
}
function applyPendingChatDm(){
  var dm=S.pendingChatDm;
  if(!dm)return false;
  var to=resolveChatDmTarget(dm);
  if(!to)return false;
  S.chatTo=to;
  S.pendingChatDm="";
  return true;
}
function tryApplyChatDeepLink(){
  if(!S.pendingChatDm||S.tab!=="chat")return false;
  if(!applyPendingChatDm())return false;
  setTimeout(markOpenChatRead,80);
  return true;
}
function unreadAsgnCount(){
  var empId=S.auth&&S.auth.empId;
  if(!empId||!isEmp())return 0;
  var n=0,i,a,list=S.asgn||[];
  for(i=0;i<list.length;i++){
    a=list[i];
    if(!a||a.empId!==empId)continue;
    if(a.status!=="active")continue;
    if(a.readAt)continue;
    n++;
  }
  return n;
}
function totalAppBadgeCount(){return unreadRemindCount()+unreadChatCount()+unreadLeaveCount()+unreadAsgnCount()}
function applyAppIconBadge(n){
  n=Math.max(0,n|0);
  if(typeof window.__CV3_syncAppBadge==="function"){
    try{window.__CV3_syncAppBadge(n);return;}catch(e){}
  }
  if(navigator.setAppBadge){
    if(n>0)navigator.setAppBadge(n).catch(function(){});
    else if(navigator.clearAppBadge)navigator.clearAppBadge().catch(function(){});
  }
}
function updateRemindBadge(){
  var rn=unreadRemindCount();
  var n=totalAppBadgeCount();
  var cn=unreadChatCount();
  var ln=unreadLeaveCount();
  var btn=document.getElementById("hdr-remind-btn");
  var el=document.getElementById("hdr-remind-badge");
  if(btn)btn.style.display=canUseLich()?"flex":"none";
  if(el){
    if(rn>0){el.textContent=rn>99?"99+":String(rn);el.style.display="flex";}
    else el.style.display="none";
  }
  var chatBadge=document.getElementById("tab-chat-badge");
  if(chatBadge){
    if(cn>0){chatBadge.textContent=cn>99?"99+":String(cn);chatBadge.style.display="inline-flex";}
    else{chatBadge.textContent="";chatBadge.style.display="none";}
  }
  var leaveBadge=document.getElementById("tab-leave-badge");
  if(leaveBadge){
    if(ln>0){leaveBadge.textContent=ln>99?"99+":String(ln);leaveBadge.style.display="inline-flex";}
    else{leaveBadge.textContent="";leaveBadge.style.display="none";}
  }
  document.title=n>0?"("+n+") Quản lý dự án":"Quản lý dự án";
  applyAppIconBadge(n);
}
function markRemindersSeen(){
  var changed=false;
  var list=myRemindList().map(function(r){
    if(r.fired&&!r.done&&r.seen!==true&&remindToastRelevant(r)){changed=true;return Object.assign({},r,{seen:true});}
    return r;
  });
  if(changed){
    if(usesPersonalReminders()){S.personalReminders=list;savePersonalReminders();}
    else{S.reminders=list;ps2Ws("cv3_r",S.reminders);bumpPatch();if(canOperate()&&_fbSv)_fbSv();}
  }
  updateRemindBadge();
}
function showRemindToast(items){
  var root=document.getElementById("remind-toast-root");
  if(!root){root=document.createElement("div");root.id="remind-toast-root";root.className="remind-toast-root";document.body.appendChild(root);}
  items.forEach(function(r){
    if(!remindToastRelevant(r))return;
    if(!claimRemindToast(r))return;
    var keys=remindToastKeys(r);
    var keyAttr=keys.join("\n");
    if(r.kind==="arrival"&&isEmp()&&String(r.empId||"")===String(S.auth.empId||"")){
      var el=document.createElement("div");
      el.className="remind-toast card card-p";
      if(keyAttr)el.setAttribute("data-remind-key",keyAttr);
      el.innerHTML='<div class="remind-toast-hd">📍 Đến vị trí · '+esc(remindFmt(r.at))+'</div><div class="remind-toast-txt">'+esc(r.text||"")+'</div><div class="row" style="gap:8px;margin-top:8px"><button type="button" class="btn btn-accent btn-sm">Xác nhận đã đến</button><button type="button" class="btn btn-ghost btn-sm">Đóng</button></div>';
      var btns=el.querySelectorAll("button");
      btns[0].onclick=function(){el.remove();A.arrivalStart(r.id,r.asgnId);};
      btns[1].onclick=function(){el.remove()};
      root.appendChild(el);
      setTimeout(function(){if(el.parentElement)el.remove()},60000);
      return;
    }
    var el2=document.createElement("div");
    el2.className="remind-toast card card-p";
    if(keyAttr)el2.setAttribute("data-remind-key",keyAttr);
    el2.innerHTML='<div class="remind-toast-hd">🔔 Nhắc hẹn · '+esc(remindFmt(r.at))+'</div><div class="remind-toast-txt">'+esc(r.text||"")+'</div><button type="button" class="btn btn-ghost btn-sm">Đóng</button>';
    el2.querySelector("button").onclick=function(){el2.remove()};
    root.appendChild(el2);
    setTimeout(function(){if(el2.parentElement)el2.remove()},30000);
  });
}
function checkReminders(){
  var personal=usesPersonalReminders();
  var list=personal?(S.personalReminders||[]):(S.reminders||[]);
  if(!list.length)return;
  var now=Date.now(),changed=false,pending=[],firedAny=false;
  list.forEach(function(r,i){
    if(r.fired||r.done)return;
    var t=remindAtMs(r.at);
    if(!t||isNaN(t))return;
    if(now>=t){
      list[i]=Object.assign({},r,{fired:true,firedAt:new Date().toISOString(),seen:false});
      changed=true;
      firedAny=true;
      if(remindToastRelevant(list[i]))pending.push(list[i]);
    }
  });
  if(!firedAny)return;
  if(personal)S.personalReminders=list;else S.reminders=list;
  if(pending.length){
    var fresh=pending.filter(function(r){return !remindToastIsDup(r);});
    if(fresh.length){
      playBellSound();
      showRemindToast(fresh);
      if("Notification" in window&&Notification.permission==="granted"){
        fresh.forEach(function(r){
          showNoti("🔔 Nhắc hẹn",{body:r.text||"Đã đến giờ nhắc",icon:appUrl("icon-192.png"),tag:"rem_"+r.id},"remind");
        });
      }
    }
  }
  if(changed){
    persistMyReminds();
    updateRemindBadge();
    if(S.tab==="lich"||(isEmp()&&(S.tab==="mywork"||S.tab==="chamcong")))render();
  }
}
function schedCount(){return myRemindList().filter(function(r){return !r.done&&r.kind!=="arrival"}).length}
function remindListHTML(){
  var list=myRemindList().filter(function(r){return !r.done&&r.kind!=="arrival"}).sort(function(a,b){
    var ta=remindAtMs(a.at),tb=remindAtMs(b.at);
    if(isNaN(ta)&&isNaN(tb))return 0;
    if(isNaN(ta))return 1;
    if(isNaN(tb))return -1;
    return ta-tb;
  });
  var h="";
  if(!list.length)h+='<div style="font-size:13px;color:var(--c-muted3)">Chưa có mục nào. Bấm «+ Thêm» để đặt lịch nhắc.</div>';
  else list.forEach(function(r){
    var unread=r.fired&&!r.seen;
    h+='<div class="li row" style="justify-content:space-between;gap:8px;align-items:center'+(unread?';background:rgba(251,191,36,.08);border-radius:10px;padding:6px 8px;margin:0 -8px':"")+'"><div style="min-width:0;flex:1"><div class="row" style="gap:6px;align-items:center;margin-bottom:2px"><span style="font-size:13px;font-weight:600">'+esc(r.text||"Nhắc hẹn")+'</span>'+(unread?bdg("Mới","#f87171","rgba(248,113,113,.15)"):"")+'</div><div style="font-family:monospace;font-size:11px;color:var(--c-muted)">'+remindFmt(r.at)+(r.fired&&!unread?' · <span style="color:#fbbf24">đã xem</span>':r.fired?' · <span style="color:#f87171">chưa xem</span>':"")+'</div></div><div class="row" style="gap:6px;flex-shrink:0">'+btn("btn-ghost btn-sm","Sửa","A.or('"+r.id+"')")+btn("btn-ghost btn-sm","Xoá","A.dr('"+r.id+"')")+'</div></div>';
  });
  return h;
}
function remindPushNotifyTest(){
  if(typeof Notification==="undefined"||Notification.permission!=="granted")return;
  showNoti("🔔 Nhắc hẹn",{body:"Đã bật thông báo nền — nhắc hẹn sẽ đến khi app đóng.",icon:appUrl("icon-192.png"),tag:"remind_push_ok"},"remind");
}
function remindSettingsBody(){
  return ''
    +'<div class="row" style="gap:8px">'+btn("btn-ghost btn-sm","Thử chuông","A.testBell()")+'</div>';
}
function pushStatusRows(){
  var perm=typeof Notification!=="undefined"?Notification.permission:"—";
  var vsrc=(S.cfg&&S.cfg.vapidKey)?"đã lưu cloud":"từ file cấu hình";
  var h='<div style="font-size:12px;line-height:1.8;color:var(--c-muted2);margin-bottom:14px;padding:10px 12px;border-radius:10px;background:rgba(255,255,255,.04)">';
  h+='<div><b>VAPID:</b> '+(remindVapidOk()?'<span style="color:#4ade80">✓ Có ('+vsrc+')</span>':'<span style="color:#f87171">✗ Chưa có</span>')+'</div>';
  h+='<div><b>Trình duyệt:</b> '+esc(perm)+'</div>';
  h+='<div><b>Thông báo nền (giám đốc):</b> '+(remindPushOk()?'<span style="color:#4ade80">✓ Đã bật</span>':'<span style="color:var(--c-muted4)">Chưa bật</span>')+'</div>';
  h+='<div><b>Cloud:</b> '+(window.__CV3_SKIP_SEED?'<span style="color:#4ade80">✓ Đã kết nối</span>':'<span style="color:#fbbf24">Offline</span>')+'</div>';
  return h+'</div>';
}
function pushSettingsBody(){
  var busy=!!S.remindPushBusy,status=S.remindPushMsg||"",ok=remindPushOk(),vk=getVapidKey();
  var h=pushStatusRows();
  h+='<div style="background:rgba(56,189,248,.08);border:1px solid rgba(56,189,248,.2);border-radius:12px;padding:12px;margin-bottom:14px">';
  h+='<div style="font-size:12px;font-weight:600;color:#38bdf8;margin-bottom:8px">VAPID Key (Web Push)</div>';
  h+=fld("Key pair",'<input id="cfg-vapid" value="'+esc(vk)+'" placeholder="Dán Key pair từ Firebase…" autocomplete="off" spellcheck="false" style="font-family:monospace;font-size:11px">');
  h+='<div class="row" style="gap:8px;flex-wrap:wrap;margin-top:10px">';
  h+=btn("btn-primary btn-sm","Lưu VAPID","A.saveVapid()");
  h+=btn("btn-ghost btn-sm","Mở Firebase Console","A.openFirebasePush()");
  h+='</div></div>';
  h+='<div style="font-size:12px;font-weight:600;color:#38bdf8;margin-bottom:6px">Bật thông báo trên thiết bị này</div>';
  if(busy)h+='<div class="emp-push-status busy">⏳ Đang bật thông báo nền…</div>';
  else if(ok)h+='<div class="emp-push-status ok">✓ Đã bật thông báo nền thành công</div>';
  else if(status)h+='<div class="emp-push-status '+(status.indexOf("✓")===0?"ok":"err")+'">'+esc(status).replace(/\n/g,"<br>")+'</div>';
  h+='<div class="row" style="gap:8px;flex-wrap:wrap;margin-top:10px">';
  h+=btn("btn-ghost btn-sm","Thử chuông","A.testBell()");
  if(window.__CV3_SKIP_SEED){
    if(busy)h+='<button type="button" class="btn btn-accent btn-sm" disabled>Đang bật…</button>';
    else if(!ok)h+=btn("btn-accent btn-sm","Bật thông báo nền","A.notifRemind()");
  }
  h+='</div>';
  return h;
}
function vLich(){
  if(!canUseLich())return "";
  var h='<div class="row" style="justify-content:space-between;align-items:center;margin-bottom:16px;flex-wrap:wrap;gap:8px">'+btn("btn-ghost","← Quay lại","A.lichBack()")+btn("btn-accent btn-sm","+ Thêm","A.or()")+'</div>';
  h+='<h2 style="font-size:20px;font-weight:700;margin-bottom:14px">Lịch hẹn</h2>';
  h+='<div class="card card-p">'+remindListHTML()+'</div>';
  return h;
}
function remindM(f){
  var now=new Date();now.setMinutes(now.getMinutes()+30);
  var defAt=remindAtToLocal(f.at)||(now.getFullYear()+"-"+pad2(now.getMonth()+1)+"-"+pad2(now.getDate())+"T"+pad2(now.getHours())+":"+pad2(now.getMinutes()));
  var b=fld("Nội dung",'<input id="rm-txt" value="'+esc(f.text||"")+'" placeholder="VD: Gọi khách hàng ABC xác nhận tiến độ">')
    +fld("Thời gian nhắc",'<input type="datetime-local" id="rm-at" value="'+esc(defAt)+'">');
  return mw(f.id?"Sửa nhắc hẹn":"Thêm nhắc hẹn",b,btn("btn-primary","Lưu","A.sr()"),f.id?btn("btn-danger","Xoá","A.dr('"+f.id+"')"):"");
}
function authSessionLabel(){
  if(!S.auth||!S.auth.role)return "";
  var emp=S.auth.empId?eById(S.auth.empId):null;
  var name="";
  if(isDir())name=S.auth.displayName||S.auth.username||"Giám đốc";
  else name=(emp&&emp.name)||S.auth.displayName||S.auth.username||"";
  if(!name)return "";
  var role="";
  if(isDir())role="Giám đốc";
  else if(staffLevel()==="operate")role="Điều hành";
  else if(staffLevel()==="supervise")role="Giám sát";
  else if(staffLevel()==="chief")role="Chỉ huy trưởng";
  else if(emp&&emp.group)role=emp.group;
  else role="Nhân viên";
  return name+" · "+role;
}
function updateDateTime(){
  var d=document.getElementById("datetime-date"),t=document.getElementById("datetime-time"),et=document.getElementById("hdr-emp-tag");if(!d||!t)return;
  var n=new Date();
  d.textContent=pad2(n.getDate())+"/"+pad2(n.getMonth()+1)+"/"+n.getFullYear();
  t.textContent=pad2(n.getHours())+":"+pad2(n.getMinutes())+":"+pad2(n.getSeconds());
  if(et){
    var label=authSessionLabel();
    et.textContent=label;
    et.title=label?(S.auth.username?"@"+S.auth.username+" — "+label:label):"";
    et.hidden=!label;
  }
  checkReminders();
  checkAttendanceRemind();
}
function currentEmp(){return S.auth&&S.auth.empId?eById(S.auth.empId):null}
function empPortalProfile(){
  var emp=currentEmp();
  if(!emp)return "";
  var ini=emp.name?emp.name.trim().charAt(0).toUpperCase():"?";
  var col=groupColor(emp.group);
  return'<div class="emp-profile-card"><div class="emp-profile-avatar" style="background:linear-gradient(135deg,'+col+','+col+'bb)">'+esc(ini)+'</div><div class="emp-profile-body"><div class="emp-profile-name">'+esc(emp.name)+'</div><div class="emp-profile-meta">'+bdg(emp.group,col,col+"22")+'<span class="emp-profile-user">@'+esc(S.auth.username||empLoginKey(emp))+'</span></div></div></div>';
}
function empProgRowHTML(prog){prog=Math.max(0,Math.min(100,prog||0));return'<div class="emp-work-foot"><div class="emp-prog-bar"><div class="emp-prog-fill" style="width:'+prog+'%"></div></div><span class="emp-prog-pct">'+prog+'%</span></div>'}
function empAcctCardHTML(){
  var emp=currentEmp();
  if(!emp)return "";
  var col=groupColor(emp.group);
  return'<div class="emp-acct-card"><div class="emp-acct-row"><span class="emp-acct-lbl">Họ tên</span><span class="emp-acct-val">'+esc(emp.name)+'</span></div><div class="emp-acct-row"><span class="emp-acct-lbl">Tổ</span><span class="emp-acct-val" style="color:'+col+'">'+esc(emp.group)+'</span></div><div class="emp-acct-row"><span class="emp-acct-lbl">Tên đăng nhập</span><span class="emp-acct-val accent">'+esc(S.auth.username||empLoginKey(emp))+'</span></div><div class="emp-acct-row"><span class="emp-acct-lbl">Vai trò</span><span class="emp-acct-val">Nhân viên</span></div></div>';
}
function bioSettingsBody(){
  return'<div class="bio-settings" id="bio-settings">'
    +'<p class="bio-settings-status" id="bio-status">Đang kiểm tra hỗ trợ sinh trắc học…</p>'
    +'<div id="bio-enable-form" style="display:none">'
    +fld("Xác nhận mật khẩu hiện tại",pwInput("bio-pw",{autocomplete:"current-password",placeholder:"Nhập mật khẩu để bật"}))
    +'</div>'
    +'<div class="bio-settings-actions" id="bio-actions"></div>'
    +'</div>';
}
function refreshBioSettingsUI(){
  var statusEl=document.getElementById("bio-status");
  var formEl=document.getElementById("bio-enable-form");
  var actionsEl=document.getElementById("bio-actions");
  if(!statusEl||!actionsEl)return;
  if(!window.__CV3_bio||typeof window.__CV3_bio.status!=="function"){
    statusEl.textContent="Chức năng sinh trắc học chưa sẵn sàng — cần đăng nhập cloud.";
    actionsEl.innerHTML="";
    if(formEl)formEl.style.display="none";
    return;
  }
  window.__CV3_bio.status().then(function(st){
    if(!document.getElementById("bio-status"))return;
    if(!st.available){
      statusEl.innerHTML="Thiết bị này <b>không hỗ trợ</b> vân tay / khuôn mặt, hoặc cần mở app qua HTTPS / cài như ứng dụng.";
      actionsEl.innerHTML="";
      if(formEl)formEl.style.display="none";
      return;
    }
    if(st.enabled){
      statusEl.innerHTML="Đã bật đăng nhập sinh trắc học"+(st.username?' cho <b>@'+esc(st.username)+'</b>':'')+" trên máy này. Lần sau có thể đăng nhập bằng vân tay hoặc khuôn mặt.";
      if(formEl)formEl.style.display="none";
      actionsEl.innerHTML=btn("btn-danger","Tắt sinh trắc học","A.disableBiometric()");
    }else{
      statusEl.innerHTML="Thiết bị <b>hỗ trợ</b> vân tay / khuôn mặt. Bật để đăng nhập nhanh mà không cần gõ mật khẩu.";
      if(formEl)formEl.style.display="block";
      actionsEl.innerHTML=btn("btn-primary","Bật sinh trắc học","A.enableBiometric()");
    }
  }).catch(function(){
    if(!document.getElementById("bio-status"))return;
    statusEl.textContent="Không kiểm tra được hỗ trợ sinh trắc học trên thiết bị này.";
    actionsEl.innerHTML="";
    if(formEl)formEl.style.display="none";
  });
}
function updateHdrVer(){var el=document.getElementById("hdr-ver");if(el)el.textContent=verStr();}
function render(){
  if(render._busy){render._queued=1;return;}
  render._busy=1;render._queued=0;
  try{
  // Đơn nghỉ phép cũ mở trong Thảo luận → chuyển sang tab Nghỉ phép
  if(isLeaveChatTo(S.chatTo)){
    var _lid=leaveIdFromChatTo(S.chatTo);
    if(_lid)S.leaveBoardId=_lid;
    S.chatTo="";
    if(S.tab==="chat")S.tab="leave";
  }
  if(!tabAllowed(S.tab))S.tab=isAdminHr()?"chamcong":(isFieldPortal()||isChiefOnly()?"mywork":"dash");
  if(hasFullUI()&&(S.tab==="account"||S.tab==="mywork"||S.tab==="chamcong"||S.tab==="report"||S.tab==="settings"))S.tab="dash";
  syncEmpLeaveStatuses();
  if(S.tab==="lich"&&!canUseLich())S.tab=isEmpPortal()?"mywork":"dash";
  if(S.tab==="emp"&&!canViewEmpTab())S.tab="dash";
  if(S.tab==="cust"&&!canViewCust())S.tab="dash";
  if(S.tab==="qual"&&!canViewQual())S.tab="dash";
  if(S.tab==="disp")S.tab="dash";
  if(S.tab==="help")S.tab=isEmpPortal()?"mywork":"dash";
  if(S.tab==="hist"&&!canViewHist())S.tab="dash";
  if(S.tab==="map"&&!canViewMap())S.tab=isEmpPortal()?"mywork":"dash";
  if(S.tab==="prog"&&!canViewSharedProg())S.tab=isEmpPortal()?"mywork":"dash";
  if(hasFullUI()&&!canViewSensitive()&&S.tab==="chamcong")S.tab="dash";
  if(S.tab==="leave"&&!(canViewLeaveOverview()||canRequestLeave()||isEmpPortal()||isFieldPortal()))S.tab="dash";
  if(!tabAllowed(S.tab))S.tab=isAdminHr()?"chamcong":(isFieldPortal()||isChiefOnly()?"mywork":"dash");
  var open=S.proj.filter(function(p){return p.status!=="done"}).length;
  var act=S.asgn.filter(function(a){return a.status==="active"}).length;
  var tabs=getTabs();
  document.getElementById("tabs").innerHTML=tabs.map(function(t){
    var label=t[1];
    if(t[0]==="chat"){
      var cn=unreadChatCount();
      label+=cn>0
        ?'<span class="tab-badge" id="tab-chat-badge" style="display:inline-flex">'+(cn>99?"99+":cn)+'</span>'
        :'<span class="tab-badge" id="tab-chat-badge"></span>';
    }
    if(t[0]==="leave"){
      var ln=unreadLeaveCount();
      label+=ln>0
        ?'<span class="tab-badge" id="tab-leave-badge" style="display:inline-flex">'+(ln>99?"99+":ln)+'</span>'
        :'<span class="tab-badge" id="tab-leave-badge"></span>';
    }
    return'<button type="button" class="tab'+(S.tab===t[0]?" active":"")+'" data-tab="'+t[0]+'" onclick="A.go(\''+t[0]+'\')">'+label+'</button>';
  }).join("");
  updateDateTime();
  updateHdrVer();
  var views={
    mywork:function(){return S.selMyAsgn?vMyWorkDet(S.selMyAsgn,S.selMyAsgnOrg):vMyWork()},
    chamcong:vChamCong,report:vReport,leave:function(){return S.leaveBoardId?vLeaveBoard():vLeave()},settings:vEmpSettings,
    dash:vDash,lich:vLich,chat:function(){return S.chatTo?vChatDet():vChatList()},emp:function(){return S.selEmp?vEmpDet(S.selEmp):vEmp()},cust:function(){return S.selCust?vCustDet(S.selCust):vCust()},
    proj:function(){if(!S.giaoProj)return S.selProjDet?vProjDet(S.selProjDet):vProj();return vTeamEdit(S.giaoProj)},
    prog:vProg,qual:vQual,hist:vHist,cfg:vCfg,map:vMap
  };
  document.getElementById("view").innerHTML=(views[S.tab]||function(){return""})();
  document.getElementById("modal-root").innerHTML=(S.modal||(S.leaveReject?leaveRejectModalHTML():"")||(S.attFlow?attModalHTML():"")||(S.arrivalFlow?arrivalModalHTML():""))||"";
  var helpRoot=document.getElementById("help-root");
  if(helpRoot)helpRoot.innerHTML=S.helpOpen?helpPanelHTML():"";
  updateNavBtns();
  if(S.tab==="emp"||S.tab==="proj"||S.tab==="dash"||S.tab==="prog"||S.tab==="mywork"){
    requestAnimationFrame(function(){try{initGantt();}catch(eG){}});
  }
  initCustPickOutside();
  if(S.tab==="emp"||S.tab==="cust"||S.tab==="proj")initEmpSwipe();
  if(S.tab==="chat")initChatScroll();
  if(S.tab==="leave"&&S.leaveBoardId){setTimeout(function(){initLeaveBoardScroll();markOpenLeaveBoardRead();},30);}
  if(S.tab==="report")initReportPreview();
  if(S.tab==="chamcong")initAttPreview();
  if(S.arrivalFlow)initArrivalPreview();
  updateUndoBadge();
  if(S.tab==="settings"||S.tab==="cfg")refreshBioSettingsUI();
  if(S.tab==="lich"&&canUseLich())markRemindersSeen();
  else updateRemindBadge();
  }finally{
    render._busy=0;
    if(render._queued){
      requestAnimationFrame(function(){
        if(!render._queued)return;
        render._queued=0;
        render();
      });
    }
  }
}
/** Gom nhiều cập nhật cloud (auth/emp/workspace) thành 1 lần vẽ — giảm giật lúc mở app. */
function scheduleRender(){
  render._schedPending=1;
  if(render._schedTimer)return;
  render._schedTimer=setTimeout(function(){
    render._schedTimer=null;
    if(!render._schedPending)return;
    render._schedPending=0;
    render();
  },90);
}
function btn(cls,lbl,onclick){return'<button type="button" class="btn '+cls+'" onclick="'+onclick+'">'+lbl+'</button>'}
function actBtn(cls,lbl,act,id){return'<button type="button" class="btn '+cls+'" data-act="'+act+'"'+(id!=null&&id!==""?' data-id="'+esc(String(id))+'"':"")+'>'+lbl+'</button>'}
function bdg(t,c,bg){return'<span class="badge" style="color:'+c+';background:'+(bg||"transparent")+';border-color:'+c+'44">'+t+'</span>'}
function strs(v,fn,id){var h="";for(var i=1;i<=5;i++)h+='<span class="star'+(i<=v?" on":'"')+(fn?' onclick="A.'+fn+'(\''+id+'\','+i+')"':"")+'>★</span>';return h}
function fld(l,inner,hint){return'<label class="field"><span class="lab">'+l+'</span>'+inner+(hint?'<div class="hint">'+hint+'</div>':"")+'</label>'}
function pwInput(id,attrs){
  attrs=attrs||{};
  var a="";
  if(attrs.autocomplete)a+=' autocomplete="'+attrs.autocomplete+'"';
  if(attrs.placeholder)a+=' placeholder="'+esc(attrs.placeholder)+'"';
  if(attrs.required)a+=" required";
  if(attrs.minlength!=null)a+=' minlength="'+attrs.minlength+'"';
  return'<div class="pw-wrap"><input type="password" id="'+id+'"'+a+'><button type="button" class="pw-toggle" onclick="A.togglePw(\''+id+'\',this)" aria-label="Hiện mật khẩu" title="Hiện mật khẩu">Hiện</button></div>';
}
function po(sel){return PROVS.map(function(p){return'<option '+(p.name===sel?"selected":"")+'>'+esc(p.name)+'</option>'}).join("")}
function go(sel,opts){opts=opts||{};var gs=getGroups(),h=gs.map(function(g){return'<option '+(g===sel?"selected":"")+'>'+esc(g)+'</option>'}).join("");if(opts.allowCreate&&canManageStaff())h+='<option value="__new__"'+(sel==="__new__"?" selected":"")+'>➕ Tạo nhóm mới…</option>';return h}
function empBusyCustIds(empId){
  var ids={};
  if(!empId)return ids;
  S.asgn.filter(function(a){return a.empId===empId&&(a.status==="active"||a.status==="paused")}).forEach(function(a){
    var p=pById(a.projId);
    if(!p||p.status==="done")return;
    if(p.custId)ids[p.custId]=true;
    else if(p.customer){
      S.cust.forEach(function(c){if(c.name===p.customer)ids[c.id]=true});
    }
    var info=asgnInfo(a);
    if(info&&info.cust){
      S.cust.forEach(function(c){if(c.name===info.cust)ids[c.id]=true});
    }
  });
  return ids;
}
function empCustBlocked(empId,custId){return !!(custId&&empBusyCustIds(empId)[custId])}
function egCustOpts(empId,sel){
  var busy=empBusyCustIds(empId);
  return'<option value="">— Chọn khách hàng —</option>'+S.cust.map(function(c){
    var dis=!!busy[c.id]&&c.id!==sel;
    return'<option value="'+c.id+'"'+(c.id===sel?" selected":"")+(dis?" disabled":"")+'>'+esc(custDisplayName(c))+(dis?" (đang làm)":"")+'</option>';
  }).join("");
}
function co(sel){return S.cust.map(function(c){return'<option value="'+c.id+'" '+(c.id===sel?"selected":"")+'>'+esc(custDisplayName(c))+'</option>'}).join("")}
function normSearch(s){
  return String(s||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/đ/g,"d");
}
function custPickLabel(sel,opts){
  opts=opts||{};
  if(!sel)return opts.emptyLabel||"— Không liên kết —";
  var c=cById(sel);
  return c?custDisplayName(c):(opts.emptyLabel||"— Không liên kết —");
}
function custPickListHTML(inputId,q,opts){
  opts=opts||{};
  var busy=opts.empId?empBusyCustIds(opts.empId):{};
  var sel=opts.sel||"";
  var nq=normSearch(q);
  var items=(S.cust||[]).slice().sort(function(a,b){return custDisplayName(a).localeCompare(custDisplayName(b),"vi")});
  if(nq)items=items.filter(function(c){return normSearch(custDisplayName(c)).indexOf(nq)>=0||normSearch(c.name).indexOf(nq)>=0||normSearch(c.shortName).indexOf(nq)>=0||normSearch(c.province).indexOf(nq)>=0||normSearch(c.address).indexOf(nq)>=0;});
  var h="";
  if(!opts.required){
    h+='<button type="button" class="cust-pick-item cust-pick-none" onclick="A.custPickSel(\''+inputId+'\',\'\')">'+(opts.emptyLabel||"— Không liên kết —")+'</button>';
  }
  if(!items.length){
    h+='<div class="cust-pick-empty">Không tìm thấy công ty phù hợp</div>';
    return h;
  }
  items.forEach(function(c){
    var dis=!!busy[c.id]&&c.id!==sel;
    var sub=[];
    var disp=custDisplayName(c),full=custFullName(c);
    if(full&&disp!==full)sub.push(full);
    if(c.province)sub.push(c.province);
    if(dis)sub.push("đang làm");
    h+='<button type="button" class="cust-pick-item'+(c.id===sel?" active":"")+'"'+(dis?" disabled":"")+' onclick="A.custPickSel(\''+inputId+'\',\''+c.id+'\')"><span>'+esc(disp)+(dis?" (đang làm)":"")+'</span>'+(sub.length?'<span class="cust-pick-sub">'+esc(sub.join(" · "))+'</span>':"")+'</button>';
  });
  return h;
}
/** Combobox khách hàng có ô tìm kiếm. Giữ input ẩn #id để form cũ vẫn đọc được. */
function custPickHTML(inputId,sel,opts){
  opts=opts||{};
  var emptyLabel=opts.emptyLabel||"— Không liên kết —";
  var label=custPickLabel(sel,{emptyLabel:emptyLabel});
  var empAttr=opts.empId?' data-emp="'+esc(opts.empId)+'"':"";
  var reqAttr=opts.required?' data-required="1"':"";
  var h='<div class="cust-pick" id="cust-pick-'+inputId+'" data-empty="'+esc(emptyLabel)+'"'+empAttr+reqAttr+'>';
  h+='<input type="hidden" id="'+inputId+'" value="'+esc(sel||"")+'">';
  h+='<button type="button" class="cust-pick-btn" id="'+inputId+'-btn" onclick="A.custPickToggle(\''+inputId+'\')"><span class="cust-pick-label" id="'+inputId+'-lbl">'+esc(label)+'</span><span class="cust-pick-chev">▾</span></button>';
  h+='<div class="cust-pick-drop" id="'+inputId+'-drop">';
  h+='<div class="cust-pick-search"><input type="search" id="'+inputId+'-q" placeholder="Gõ tên công ty để tìm…" autocomplete="off" oninput="A.custPickFilter(\''+inputId+'\')" onclick="event.stopPropagation()"></div>';
  h+='<div class="cust-pick-list" id="'+inputId+'-list">'+custPickListHTML(inputId,"",{sel:sel||"",empId:opts.empId||"",emptyLabel:emptyLabel,required:!!opts.required})+'</div>';
  h+='</div></div>';
  return h;
}
function closeAllCustPicks(exceptId){
  document.querySelectorAll(".cust-pick").forEach(function(wrap){
    var id=(wrap.id||"").replace(/^cust-pick-/,"");
    if(exceptId&&id===exceptId)return;
    var drop=document.getElementById(id+"-drop");
    var btn=document.getElementById(id+"-btn");
    if(drop)drop.classList.remove("open");
    if(btn)btn.classList.remove("open");
  });
}
function initCustPickOutside(){
  var root=document.getElementById("modal-root");
  if(!root||root._custPickOk)return;
  root._custPickOk=1;
  root.addEventListener("click",function(e){
    if(e.target.closest&&e.target.closest(".cust-pick"))return;
    closeAllCustPicks();
  });
}
function listSwipeRow(id,inner,editAction){
  if(!canOperate())return inner;
  return'<div class="swipe-wrap list-swipe" data-sid="'+id+'"><div class="swipe-actions"><button type="button" class="swipe-btn" onclick="event.stopPropagation();'+editAction+'">Sửa</button></div><div class="swipe-front">'+inner+'</div></div>';
}
function empSwipeRow(id,inner){
  if(!canManageStaff())return inner;
  if(inner.indexOf("emp-card-namebar")>=0){
    inner=inner.replace('class="emp-card-namebar"','class="emp-card-namebar swipe-front"');
    return'<div class="swipe-wrap emp-card-swipe" data-eid="'+id+'"><div class="swipe-actions"><button type="button" class="swipe-btn" onclick="event.stopPropagation();A.oe(\''+id+'\')">Sửa</button></div>'+inner+'</div>';
  }
  return'<div class="swipe-wrap" data-eid="'+id+'"><div class="swipe-actions"><button type="button" class="swipe-btn" onclick="event.stopPropagation();A.oe(\''+id+'\')">Sửa</button></div><div class="swipe-front">'+inner+'</div></div>';
}
var SWIPE_W=72;
/** Tránh đóng modal khi kéo chọn chữ rồi thả chuột ra ngoài khung. */
var _ovDown=null;
function overlayPtrDown(ev){
  if(!ev)return;
  _ovDown={backdrop:ev.target===ev.currentTarget,x:ev.clientX||0,y:ev.clientY||0};
}
function overlayDismissOk(ev){
  if(!ev)return true;
  if(ev.type==="click"&&ev.target!==ev.currentTarget)return false;
  var d=_ovDown;_ovDown=null;
  if(d&&!d.backdrop)return false;
  if(d&&(Math.abs((ev.clientX||0)-d.x)>10||Math.abs((ev.clientY||0)-d.y)>10))return false;
  try{
    var sel=window.getSelection&&window.getSelection();
    if(sel&&!sel.isCollapsed&&String(sel).length)return false;
  }catch(e0){}
  return true;
}
function closeSwipes(except){document.querySelectorAll(".swipe-wrap.open").forEach(function(w){if(w!==except){w.classList.remove("open");var f=w.querySelector(".swipe-front");if(f)f.style.transform=""}})}
function initEmpSwipe(){
  document.querySelectorAll(".swipe-wrap").forEach(function(wrap){
    if(wrap._swipeOk)return;wrap._swipeOk=1;
    var front=wrap.querySelector(".swipe-front");if(!front)return;
    var startX=0,startY=0,baseX=0,axis=null;
    function snap(x){if(x<-SWIPE_W/3){closeSwipes(wrap);wrap.classList.add("open");front.style.transform="translateX(-"+SWIPE_W+"px)"}else{wrap.classList.remove("open");front.style.transform=""}}
    function onStart(cx,cy){startX=cx;startY=cy;baseX=wrap.classList.contains("open")?-SWIPE_W:0;axis=null;wrap._swiping=false;wrap.classList.add("dragging")}
    function onMove(cx,cy){
      var dx=cx-startX,dy=cy-startY;
      if(axis==null&&(Math.abs(dx)>8||Math.abs(dy)>8))axis=Math.abs(dx)>Math.abs(dy)?"x":"y";
      if(axis==="y")return;
      if(axis==="x"){wrap._swiping=true;var x=Math.max(-SWIPE_W,Math.min(0,dx+baseX));front.style.transform="translateX("+x+"px)"}
    }
    function onEnd(){
      wrap.classList.remove("dragging");
      if(axis==="x"){var m=front.style.transform.match(/-?\d+/);snap(m?parseFloat(m[0]):0)}
      else front.style.transform=wrap.classList.contains("open")?"translateX(-"+SWIPE_W+"px)":"";
      setTimeout(function(){wrap._swiping=false},80);axis=null;
    }
    front.addEventListener("touchstart",function(e){if(e.touches.length===1)onStart(e.touches[0].clientX,e.touches[0].clientY)},{passive:true});
    front.addEventListener("touchmove",function(e){if(e.touches.length===1)onMove(e.touches[0].clientX,e.touches[0].clientY)},{passive:true});
    front.addEventListener("touchend",onEnd);
    // Desktop (chuột): không bắt drag = vuốt — tránh xung đột kéo chọn; sửa qua trang chi tiết.
    var coarse=false;
    try{coarse=window.matchMedia&&window.matchMedia("(pointer:coarse)").matches;}catch(eM){}
    if(coarse){
      front.addEventListener("mousedown",function(e){
        if(e.button!==0)return;
        onStart(e.clientX,e.clientY);
        function mm(ev){onMove(ev.clientX,ev.clientY)}
        function mu(){document.removeEventListener("mousemove",mm);document.removeEventListener("mouseup",mu);onEnd()}
        document.addEventListener("mousemove",mm);document.addEventListener("mouseup",mu);
      });
    }
    front.addEventListener("click",function(e){if(wrap._swiping){e.preventDefault();e.stopPropagation()}});
  });
  if(!initEmpSwipe._doc){initEmpSwipe._doc=1;document.addEventListener("click",function(e){if(!e.target.closest(".swipe-wrap"))closeSwipes()});}
}
function mw(title,body,saveBtn,delBtn,cancelFn){
  var cancel=cancelFn||"A.cm()";
  var cancelEv=/\(\s*\)\s*$/.test(cancel)?cancel.replace(/\(\s*\)\s*$/,"(event)"):cancel;
  var foot='<div class="modal-foot"><div class="modal-foot-l">'+btn("btn-ghost","Huỷ",cancel)+'</div><div class="modal-foot-c">'+(delBtn||"")+'</div><div class="modal-foot-r">'+saveBtn+'</div></div>';
  return'<div class="overlay" onmousedown="A.ovDown(event)" onclick="'+cancelEv+'"><div class="modal" onclick="event.stopPropagation()"><div class="row" style="justify-content:space-between;margin-bottom:20px"><h3 style="font-size:18px;font-weight:700;background:linear-gradient(90deg,#fff,#a8d4ff);-webkit-background-clip:text;-webkit-text-fill-color:transparent">'+title+'</h3><button class="x-btn" onclick="'+cancel+'">×</button></div>'+body+foot+'</div></div>';
}

function fmtChatTime(m){
  if(!m||!m.at)return "";
  var d=m.at.toDate?m.at.toDate():(m.at.seconds?new Date(m.at.seconds*1000):new Date(m.at));
  if(isNaN(d.getTime()))return "";
  var now=new Date(),same=d.toDateString()===now.toDateString();
  if(same)return pad2(d.getHours())+":"+pad2(d.getMinutes());
  return pad2(d.getDate())+"/"+pad2(d.getMonth()+1)+" "+pad2(d.getHours())+":"+pad2(d.getMinutes());
}
function fmtIsoShort(iso){
  if(!iso)return "";
  var d=new Date(iso);
  if(isNaN(d.getTime()))return String(iso).slice(0,16).replace("T"," ");
  return pad2(d.getDate())+"/"+pad2(d.getMonth()+1)+" "+pad2(d.getHours())+":"+pad2(d.getMinutes());
}
function chatTicksHTML(m){
  if(!m||!S.auth||m.uid!==S.auth.uid||m.type==="broadcast")return "";
  if(m.readAt)return '<span class="chat-ticks read" title="Đã đọc">✓✓</span>';
  if(m.deliveredAt)return '<span class="chat-ticks delivered" title="Đã nhận">✓✓</span>';
  return '<span class="chat-ticks" title="Đã gửi">✓</span>';
}
function asgnReceiptHTML(a){
  if(!a)return "";
  if(a.readAt)return '<div class="asgn-receipt">📩 <span class="ok">Đã đọc</span> · '+esc(fmtIsoShort(a.readAt))+'</div>';
  if(a.deliveredAt)return '<div class="asgn-receipt">📩 Đã nhận · '+esc(fmtIsoShort(a.deliveredAt))+'</div>';
  return '<div class="asgn-receipt">📩 Đã gửi thông báo</div>';
}
function markOpenChatRead(){
  if(S.tab!=="chat"||!S.auth||!S.auth.uid||S.chatTo==="broadcast")return;
  if(typeof window.__CV3_markChatThreadRead!=="function")return;
  var msgs=chatMsgsForTo(S.chatTo);
  window.__CV3_markChatThreadRead(msgs,S.auth.uid);
}
function dmThreadId(a,b){
  if(typeof window.__CV3_dmThreadId==="function")return window.__CV3_dmThreadId(a,b);
  return [a,b].sort().join("_");
}
function chatRecipients(){
  var me=S.auth&&S.auth.uid,myEmpId=S.auth&&S.auth.empId,list=[],seen={};
  staffEmp().forEach(function(e){
    if(me&&e.authUid&&e.authUid===me)return;
    if(myEmpId&&e.id===myEmpId)return;
    list.push({empId:e.id,uid:e.authUid||"",name:e.name,group:e.group||"",isDir:false,hasAccount:!!e.authUid,pending:empNeedsProvision(e)});
    seen[e.id]=1;
  });
  var dir=directorChatRecipient();
  if(dir&&(!me||dir.uid!==me)&&!seen[dir.empId])list.push(dir);
  list.sort(function(a,b){
    if(a.isDir&&!b.isDir)return -1;
    if(!a.isDir&&b.isDir)return 1;
    return a.name.localeCompare(b.name,"vi");
  });
  return list;
}
function chatRecipientById(empId){
  return chatRecipients().find(function(r){return r.empId===empId});
}
function defaultChatTo(){
  if(canOperate())return "broadcast";
  var rec=chatRecipients(),withAcct=rec.filter(function(r){return r.hasAccount});
  return (withAcct[0]||rec[0])?(withAcct[0]||rec[0]).empId:"";
}
function chatToOptions(){
  ensureChatTo();
  var chatTo=S.chatTo,isBc=chatTo==="broadcast",rec=chatRecipients(),h="";
  if(canOperate())h+='<option value="broadcast"'+(isBc?" selected":"")+'>📢 Gửi tất cả</option>';
  rec.forEach(function(r){
    var label=esc(r.name)+(r.isDir?" ★":"")+" · "+esc(r.group);
    if(!r.hasAccount){
      if(r.pending)label+=" (đang tạo TK)";
      else label+=" (chưa có tài khoản)";
    }
    h+='<option value="'+r.empId+'"'+(chatTo===r.empId?" selected":"")+'>'+label+'</option>';
  });
  if(!canOperate()&&!rec.length)h+='<option value="" selected>— Chưa có người nhận —</option>';
  return h;
}
function migrateChatTo(){
  if(S.chatTo)return;
  if(S.chatThread==="broadcast"){S.chatTo="broadcast";return;}
  if(S.chatThread&&S.chatThread.indexOf("dm:")===0){
    var uid=S.chatThread.slice(3),e=S.emp.find(function(x){return x.authUid===uid});
    S.chatTo=e?e.id:defaultChatTo();
    return;
  }
  S.chatTo=defaultChatTo();
}
function ensureChatTo(){
  migrateChatTo();
  // Trao đổi nghỉ phép chỉ nằm ở tab Nghỉ phép
  if(isLeaveChatTo(S.chatTo)){
    var lid=leaveIdFromChatTo(S.chatTo);
    if(lid)S.leaveBoardId=lid;
    S.chatTo="";
    if(S.tab==="chat")S.tab="leave";
  }
  if(!S.chatTo)S.chatTo=defaultChatTo();
  // Nhân viên portal không xem kênh broadcast; GD/DH/GS được xem
  if(isEmpPortal()&&S.chatTo==="broadcast")S.chatTo=defaultChatTo();
  if(S.chatTo!=="broadcast"&&!chatRecipientById(S.chatTo))S.chatTo=defaultChatTo();
}
function chatToThreadKey(chatTo){
  if(!chatTo||chatTo==="broadcast")return "broadcast";
  if(isLeaveChatTo(chatTo))return chatTo;
  var r=chatRecipientById(chatTo);
  if(!r||!r.uid||!S.auth||!S.auth.uid)return null;
  return "dm:"+r.uid;
}
function chatMsgAtMs(m){
  if(!m||m.at==null)return 0;
  if(m.at.toDate)return m.at.toDate().getTime();
  if(m.at.seconds!=null)return m.at.seconds*1000;
  var t=new Date(m.at).getTime();
  return isNaN(t)?0:t;
}
function chatMsgsForThread(thread){
  var msgs=S.chat||[],me=S.auth&&S.auth.uid,out;
  if(!thread||thread==="broadcast"){
    out=msgs.filter(function(m){return m.type==="broadcast"||!m.type;});
  }else if(isLeaveChatTo(thread)){
    var lid=leaveIdFromChatTo(thread);
    // Gộp tin type=leave + DM cũ cùng leaveReqId vào 1 khung
    out=msgs.filter(function(m){
      if(!m)return false;
      if(m.leaveReqId&&m.leaveReqId===lid){
        if(m.type==="leave")return !me||!m.participants||m.participants.indexOf(me)>=0;
        if(m.type==="dm")return true;
      }
      return false;
    });
  }else if(thread.indexOf("dm:")===0&&me){
    var toUid=thread.slice(3),tid=dmThreadId(me,toUid);
    // Ẩn DM nghỉ phép khỏi chat 1–1 — chỉ còn trong bảng tin leave:
    out=msgs.filter(function(m){return m.type==="dm"&&m.threadId===tid&&!isLeaveRelatedDm(m);});
  }else out=[];
  return out.slice().sort(function(a,b){return chatMsgAtMs(a)-chatMsgAtMs(b)});
}
function chatMsgsForTo(chatTo){
  if(isLeaveChatTo(chatTo))return chatMsgsForThread(chatTo);
  var key=chatTo==="broadcast"?"broadcast":chatToThreadKey(chatTo);
  if(chatTo!=="broadcast"&&!key)return [];
  return chatMsgsForThread(key);
}
function leaveRoomTitle(reqId){
  var req=leaveReqById(reqId);
  if(req)return "Nghỉ phép · "+(req.empName||"?");
  return "Nghỉ phép";
}
function leaveRoomPeopleLabel(reqId){
  var req=leaveReqById(reqId);
  var names=[],seen={};
  function addName(n){
    n=String(n||"").trim();
    if(!n||seen[n])return;
    seen[n]=1;names.push(n);
  }
  if(req)addName(req.empName||"Nhân viên");
  var dir=directorChatRecipient();
  if(dir)addName(dir.name||"Giám đốc");
  hanhChinhChatRecipients().forEach(function(r){addName(r.name||"Hành chính");});
  if(names.length<2)return "NV · GD · Hành chính";
  return names.slice(0,4).join(" · ");
}
function chatToLabel(chatTo){
  if(!chatTo||chatTo==="broadcast")return "📢 Gửi tất cả";
  if(isLeaveChatTo(chatTo))return "📋 "+leaveRoomTitle(leaveIdFromChatTo(chatTo));
  var r=chatRecipientById(chatTo);
  if(r)return (r.isDir?"★ ":"")+r.name;
  var key=chatToThreadKey(chatTo);
  if(key&&key.indexOf("dm:")===0){
    var uid=key.slice(3),m=(S.chat||[]).find(function(x){return x.type==="dm"&&!isLeaveRelatedDm(x)&&(x.toUid===uid||x.uid===uid)});
    if(m)return m.toUid===uid?(m.toName||uid):(m.fromName||m.from||uid);
  }
  return "Thảo luận";
}
function leaveRoomIdsFromChat(){
  var me=S.auth&&S.auth.uid,map={},ids=[];
  function addId(id){
    id=String(id||"").trim();
    if(!id||map[id])return;
    map[id]=1;ids.push(id);
  }
  (S.chat||[]).forEach(function(m){
    if(!m||!m.leaveReqId)return;
    if(m.type==="leave"){
      if(me&&m.participants&&m.participants.indexOf(me)<0)return;
      addId(m.leaveReqId);
      return;
    }
    // DM nghỉ phép cũ → vẫn hiện 1 thẻ bảng tin chung
    if(isLeaveRelatedDm(m)){
      if(me&&m.uid!==me&&m.toUid&&m.toUid!==me)return;
      addId(m.leaveReqId);
    }
  });
  (S.leaveReqs||[]).forEach(function(r){
    if(!r||!r.id)return;
    if(canViewAttCompany()||(S.auth&&S.auth.empId&&r.empId===S.auth.empId)||(S.auth&&r.uid===S.auth.uid)){
      addId(r.id);
    }
  });
  return ids;
}
function vChatList(){
  if(!window.__CV3_SKIP_SEED)
    return '<div class="card card-p" style="color:var(--c-muted)">Chat cần kết nối cloud (đăng nhập Firebase).</div>';
  if(!S.auth||!S.auth.username)
    return '<div class="card card-p" style="color:var(--c-muted)">Đăng nhập để thảo luận với đội.</div>';
  
  S.cfg.hiddenChats = S.cfg.hiddenChats || {};
  
  var h='<style>.swipe-wrap.dragging .swipe-actions, .swipe-wrap.open .swipe-actions { opacity: 1 !important; }</style>';
  h+='<div class="row" style="justify-content:space-between;margin-bottom:16px"><h2 style="font-size:20px;font-weight:700">Thảo luận</h2>'+btn("btn-accent btn-sm","+ Thảo luận mới","A.newChat()")+'</div>';
  h+='<div class="dash-grid">';
  
  var rec=chatRecipients();
  var cards=[];
  
  function renderCard(id, label, desc, isDir, col, lastMsgText, unread) {
    unread=unread|0;
    var nameCls="chat-peer-name"+(unread?" chat-peer-unread":"");
    var unreadHtml=unread?'<span class="chat-unread-dot">'+(unread>99?"99+":unread)+'</span>':"";
    var inner = '<div class="card card-p'+(unread?" chat-peer-unread":"")+'" style="cursor:pointer;padding:14px;margin:0;border:none;box-shadow:none" onclick="A.selectChatTo(\''+id+'\')"><div class="row" style="gap:8px;margin-bottom:6px;align-items:center"><span class="'+nameCls+'" style="font-weight:'+(unread?800:700)+';font-size:15px;color:'+(isDir?"#f87171":"#e8f0fe")+'">'+label+'</span>'+unreadHtml+bdg(desc,col)+'</div><div style="font-size:13px;color:var(--c-muted2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-weight:'+(unread?700:400)+'">'+esc(lastMsgText)+'</div></div>';
    return '<div class="swipe-wrap list-swipe" style="margin:0;border-radius:18px;background:linear-gradient(145deg,rgba(255,255,255,.09) 0%,rgba(255,255,255,.04) 100%);border:1px solid rgba(255,255,255,.15);box-shadow:0 8px 32px rgba(0,0,0,.35)"><div class="swipe-actions" style="right:-1px;border-radius:0 18px 18px 0;overflow:hidden;opacity:0;transition:opacity 0.2s"><button type="button" class="swipe-btn" onclick="event.stopPropagation();A.hideChat(\''+id+'\')">Xoá</button></div><div class="swipe-front" style="padding:0;background:transparent;border-radius:18px;box-shadow:none">'+inner+'</div></div>';
  }

  if(canOperate() || hasFullUI()) {
    var bMsgs = chatMsgsForTo("broadcast");
    var lastB = bMsgs.length ? bMsgs[bMsgs.length-1] : null;
    var bTime = lastB ? chatMsgAtMs(lastB) : 0;
    var bFirst = bMsgs.length ? chatMsgAtMs(bMsgs[0]) : 0;
    var bHidden = S.cfg.hiddenChats["broadcast"] || 0;
    
    if (bMsgs.length > 0 && (!bHidden || bTime > bHidden)) {
      cards.push({sortAt:bFirst||bTime,html:renderCard("broadcast", "📢 Gửi tất cả", "Thông báo chung", true, "#f87171", lastB.text || "...")});
    }
  }
  
  rec.forEach(function(r){
    var msgs = chatMsgsForTo(r.empId);
    if (!msgs.length) return;
    var lastM = msgs[msgs.length-1];
    var mTime = chatMsgAtMs(lastM);
    var firstTime = chatMsgAtMs(msgs[0]);
    var hiddenAt = S.cfg.hiddenChats[r.empId] || 0;
    
    if (hiddenAt && mTime <= hiddenAt) return;
    
    var label=esc(r.name)+(r.isDir?" ★":"");
    var desc=esc(r.group);
    if(!r.hasAccount){
      if(r.pending)desc+=" (đang tạo TK)";
      else desc+=" (chưa có tài khoản)";
    }
    var col=r.isDir ? "#f87171" : groupColor(r.group);
    var prefix = (lastM.uid === S.auth.uid) ? "Bạn: " : (lastM.fromName ? lastM.fromName+": " : "");
    var unread = unreadChatCountForTo(r.empId);
    cards.push({sortAt:firstTime||mTime,html:renderCard(r.empId, label, desc, r.isDir, col, prefix + (lastM.text || "..."), unread)});
  });

  cards.sort(function(a,b){return (a.sortAt||0)-(b.sortAt||0);});
  cards.forEach(function(c){h+=c.html;});
  
  if (!cards.length) {
    h+='<div class="card card-p" style="color:rgba(160,195,255,.55);grid-column:1/-1">Chưa có thảo luận nào. Bấm "+ Thảo luận mới" để bắt đầu.</div>';
  }
  h+='</div>';
  return h;
}

function vChatDet(){
  maybeTriggerProvision();
  var chatTo=S.chatTo,isBc=chatTo==="broadcast";
  var rec=chatRecipients(),sel=chatRecipientById(chatTo);
  var msgs=chatMsgsForTo(chatTo),canPostBc=isBc&&canOperate(),canPostDm=!isBc&&sel&&sel.hasAccount;
  var noAcct=!isBc&&sel&&!sel.hasAccount,pendingAcct=noAcct&&sel&&sel.pending;
  var h='<div class="row" style="margin-bottom:16px">'+btn("btn-ghost btn-sm","← Quay lại","A.chatBack()")+'</div>';
  h+='<h2 style="font-size:20px;font-weight:700;margin-bottom:6px">Thảo luận — '+chatToLabel(chatTo)+'</h2>';
  h+='<div class="chat-wrap card">';
  if(pendingAcct)h+='<div class="chat-to-hint" style="margin:12px">«'+esc(sel.name)+'» đang được tạo tài khoản — đợi vài giây rồi thử lại.</div>';
  else if(noAcct)h+='<div class="chat-to-hint" style="margin:12px">«'+esc(sel.name)+'» chưa có tài khoản — giám đốc đăng nhập để hệ thống tự tạo tài khoản từ danh sách nhân sự.</div>';
  h+='<div class="chat-msgs" id="chat-msgs">';
  if(!msgs.length)h+='<div class="chat-empty">'+(isBc?"Chưa có thông báo chung.":'Chưa có tin nhắn. Gửi lời chào đầu tiên!')+'</div>';
  msgs.forEach(function(m){
    var mine=S.auth&&m.uid&&S.auth.uid===m.uid;
    var who=esc(m.fromName||m.from||"?");
    var roleHtml="";
    if(m.role==="director")roleHtml='<span class="dir">Giám đốc</span>';
    else{
      var eFrom=(S.emp||[]).find(function(x){return x&&x.authUid===m.uid});
      if(isAdminHrEmp(eFrom))roleHtml='<span style="color:#14b8a6;font-size:11px;font-weight:700">Hành chính</span>';
    }
    h+='<div class="chat-row '+(mine?"mine":"other")+'"><div class="chat-meta">'+(mine?"Bạn":who)+' '+roleHtml+' · '+fmtChatTime(m)+(mine?chatTicksHTML(m):"")+'</div><div class="chat-bubble">'+esc(m.text||"")+'</div></div>';
  });
  h+='</div>';
  if(isBc&&!canPostBc)h+='<div class="chat-bar-readonly">Chỉ giám đốc hoặc Điều hành mới được gửi thông báo toàn đội.</div>';
  else if(pendingAcct)h+='<div class="chat-bar-readonly">Đang tạo tài khoản cho «'+esc(sel.name)+'» — thử lại sau vài giây.</div>';
  else if(noAcct)h+='<div class="chat-bar-readonly">Không thể gửi — nhân viên chưa có tài khoản đăng nhập.</div>';
  else if(!rec.length&&!canOperate())h+='<div class="chat-bar-readonly">Chưa có người nhận trong danh sách nhân sự.</div>';
  else if(canPostBc||canPostDm){
    var ph=isBc?"Thông báo cho cả đội…":"Nhập tin nhắn riêng…";
    h+='<form class="chat-bar" onsubmit="event.preventDefault();A.chatSend();return false;"><input type="text" id="chat-input" maxlength="2000" placeholder="'+ph+'" autocomplete="off"><button type="submit" class="btn btn-primary">'+(isBc?"Gửi tất cả":"Gửi")+'</button></form>';
  }
  h+='</div></div>';
  return h;
}
function initChatScroll(){
  if(S.tab!=="chat")return;
  var box=document.getElementById("chat-msgs");
  if(box)box.scrollTop=box.scrollHeight;
  markOpenChatRead();
}
function markOpenLeaveBoardRead(){
  if(S.tab!=="leave"||!S.leaveBoardId||!S.auth||!S.auth.uid)return;
  markLeaveBoardRead(S.leaveBoardId);
}
function initLeaveBoardScroll(){
  if(S.tab!=="leave"||!S.leaveBoardId)return;
  var box=document.getElementById("leave-board-msgs");
  if(box)box.scrollTop=box.scrollHeight;
  markOpenLeaveBoardRead();
}
function vLeaveBoard(){
  var leaveId=String(S.leaveBoardId||"").trim();
  if(!leaveId)return vLeave();
  var chatTo=leaveRoomKey(leaveId),leaveReq=leaveReqById(leaveId);
  var msgs=chatMsgsForTo(chatTo);
  var canPost=leaveRoomParticipants(leaveReq||{id:leaveId}).length>=2;
  var h='<div class="emp-portal">';
  h+='<div class="row" style="margin-bottom:16px">'+btn("btn-ghost btn-sm","← Quay lại","A.leaveBoardBack()")+'</div>';
  h+='<h2 style="font-size:20px;font-weight:700;margin-bottom:6px">'+esc(leaveRoomTitle(leaveId))+'</h2>';
  if(leaveReq){
    var st=leaveStatusLabel(leaveReq.status);
    h+='<div class="card card-p" style="margin-bottom:12px;padding:12px"><div class="row" style="justify-content:space-between;gap:8px;flex-wrap:wrap"><div><b>'+esc(leaveReq.empName||"?")+'</b> · <span style="color:'+st.c+'">'+st.l+'</span></div><span style="font-family:monospace;color:#7dd3fc">'+dFmt(leaveReq.startDate)+' → '+dFmt(leaveReq.endDate)+' · '+leaveReq.days+' ngày</span></div>';
    if(isDir()&&leaveReq.status==="pending"){
      h+='<div class="row" style="gap:8px;margin-top:10px;flex-wrap:wrap">'+btn("btn-accent btn-sm","Đồng ý","A.leaveApprove('"+leaveReq.id+"')")+btn("btn-danger btn-sm","Từ chối","A.leaveRejectOpen('"+leaveReq.id+"')")+'</div>';
    }
    h+='</div>';
  }
  h+='<div class="chat-wrap card">';
  h+='<div class="chat-msgs" id="leave-board-msgs">';
  if(!msgs.length)h+='<div class="chat-empty">Chưa có tin trên bảng nghỉ phép.</div>';
  msgs.forEach(function(m){
    var mine=S.auth&&m.uid&&S.auth.uid===m.uid;
    var who=esc(m.fromName||m.from||"?");
    var roleHtml="";
    if(m.role==="director")roleHtml='<span class="dir">Giám đốc</span>';
    else{
      var eFrom=(S.emp||[]).find(function(x){return x&&x.authUid===m.uid});
      if(isAdminHrEmp(eFrom))roleHtml='<span style="color:#14b8a6;font-size:11px;font-weight:700">Hành chính</span>';
    }
    var bubble=(m.kind==="leave_req"||m.kind==="leave_decision")?chatLeaveCardHTML(m):esc(m.text||"");
    h+='<div class="chat-row '+(mine?"mine":"other")+'"><div class="chat-meta">'+(mine?"Bạn":who)+' '+roleHtml+' · '+fmtChatTime(m)+(mine?chatTicksHTML(m):"")+'</div><div class="chat-bubble">'+bubble+'</div></div>';
  });
  h+='</div>';
  if(canPost){
    h+='<form class="chat-bar" onsubmit="event.preventDefault();A.chatSend();return false;"><input type="text" id="chat-input" maxlength="2000" placeholder="Góp ý / trao đổi trên bảng nghỉ phép…" autocomplete="off"><button type="submit" class="btn btn-primary">Gửi</button></form>';
  }else{
    h+='<div class="chat-bar-readonly">Chưa đủ người tham gia (cần giám đốc / Hành chính có tài khoản).</div>';
  }
  h+='</div></div>';
  return h;
}
function initReportPreview(){
  if(S.tab!=="report")return;
  var inp=document.getElementById("rpt-photos");
  var box=document.getElementById("rpt-preview");
  if(!inp||!box||inp._rptOk)return;
  inp._rptOk=1;
  inp.addEventListener("change",function(){
    box.innerHTML="";
    if(!inp.files||!inp.files.length)return;
    Array.prototype.forEach.call(inp.files,function(f){
      if(!f.type||f.type.indexOf("image/")!==0)return;
      var img=document.createElement("img");
      img.src=URL.createObjectURL(f);
      img.alt="Xem trước";
      box.appendChild(img);
    });
  });
  var prog=document.getElementById("rpt-prog");
  var pl=document.getElementById("rpt-prog-lbl");
  if(prog&&pl&&!prog._rptOk){
    prog._rptOk=1;
    prog.addEventListener("input",function(){pl.textContent=prog.value+"%"});
  }
}

function attModalShell(title,body,foot){
  var hd=title?'<div class="row" style="justify-content:space-between;margin-bottom:16px"><h3 style="font-size:18px;font-weight:700">'+title+'</h3><button type="button" class="x-btn" onclick="A.attCancel()">×</button></div>':"";
  return'<div class="overlay" onmousedown="A.ovDown(event)" onclick="A.attCancel(event)"><div class="modal att-modal" onclick="event.stopPropagation()">'+hd+body+(foot?'<div class="modal-foot" style="margin-top:16px"><div class="modal-foot-l">'+btn("btn-ghost","Huỷ","A.attCancel()")+'</div><div class="modal-foot-r">'+foot+'</div></div>':"")+'</div></div>';
}
function attModalHTML(){
  var f=S.attFlow||{};
  var type=f.type||"in";
  var step=f.step||"photo";
  if(step==="done"){
    var lbl=type==="in"?"vào":"ra";
    var t=attFmtClock(f.doneAt||new Date());
    return attModalShell("","<div class='att-done'><div class='att-done-icon'>✓</div><div class='att-done-title'>Chấm "+lbl+" hoàn tất</div><div class='att-done-time'>"+t+"</div><p class='att-done-hint'>Đã lưu vào báo cáo — không thể chỉnh sửa.</p></div>",btn("btn-primary","Xong","A.attDoneClose()"));
  }
  if(step==="photo"){
    var hint=type==="in"?"Chụp <b>1 ảnh</b> nhà máy / công trường":"Chụp <b>ít nhất 3 ảnh</b> công việc đã làm xong";
    var body='<div class="att-step-hint" style="font-size:15px;text-align:center;margin-bottom:18px;line-height:1.55">'+hint+'</div>';
    if(type==="in"){
      body+='<label class="att-camera-btn"><input type="file" id="att-photo-in" accept="image/*" capture="environment"><span>📷 Chụp ảnh</span></label><div id="att-preview-in" class="rpt-preview" style="justify-content:center"></div>';
    }else{
      body+='<label class="att-camera-btn"><input type="file" id="att-photo-out" accept="image/*" capture="environment" multiple><span>📷 Chụp ảnh (≥3)</span></label><div id="att-preview-out" class="rpt-preview" style="justify-content:center"></div><div id="att-photo-cnt" style="text-align:center;font-size:13px;color:var(--c-muted);margin-top:8px"></div>';
    }
    if(attNeedsReason(type,new Date())){
      body+='<div class="field" style="margin-top:14px"><span class="lab">Lý do giải trình KPI <span style="color:#f87171">*</span></span><textarea id="att-late-reason" rows="3" placeholder="Ghi rõ lý do (công tác, ốm, giao thông, việc gia đình…)"></textarea><div style="font-size:12px;color:#fbbf24;margin-top:6px;line-height:1.5">'+attReasonHint(type,new Date())+'</div></div>';
    }else{
      body+='<div style="font-size:12px;color:#4ade80;text-align:center;margin-top:10px">✓ Trong khung cho phép (sai lệch ≤10 phút)</div>';
    }
    return attModalShell(type==="in"?"Chấm vào":"Chấm ra",body,btn("btn-primary","Gửi","A.attSubmit()"));
  }
  return attModalShell("","<div style='text-align:center;padding:40px 16px'><div style='font-size:40px;margin-bottom:12px'>⏳</div><div>Đang lưu…</div></div>","");
}
function initAttPreview(){
  if(!S.attFlow||S.attFlow.step!=="photo")return;
  var type=S.attFlow.type||"in";
  if(type==="in"){
    var inp=document.getElementById("att-photo-in");
    var box=document.getElementById("att-preview-in");
    if(inp&&box&&!inp._attOk){
      inp._attOk=1;
      inp.addEventListener("change",function(){
        box.innerHTML="";
        if(!inp.files||!inp.files.length)return;
        var file=inp.files[0];
        if(!file.type||file.type.indexOf("image/")!==0)return;
        var img=document.createElement("img");
        img.src=URL.createObjectURL(file);
        img.alt="Xem trước";
        box.appendChild(img);
      });
    }
  }else{
    var winp=document.getElementById("att-photo-out");
    var wbox=document.getElementById("att-preview-out");
    var cnt=document.getElementById("att-photo-cnt");
    if(winp&&wbox&&!winp._attOk){
      winp._attOk=1;
      winp.addEventListener("change",function(){
        wbox.innerHTML="";
        if(!winp.files||!winp.files.length){if(cnt)cnt.textContent="";return;}
        var n=0;
        Array.prototype.forEach.call(winp.files,function(file){
          if(!file.type||file.type.indexOf("image/")!==0)return;
          n++;
          var img=document.createElement("img");
          img.src=URL.createObjectURL(file);
          img.alt="Xem trước";
          wbox.appendChild(img);
        });
        if(cnt)cnt.textContent="Đã chọn "+n+" ảnh"+(n<3?" — cần thêm "+(3-n)+" ảnh nữa":"");
      });
    }
  }
}

function arrivalModalShell(title,body,foot){
  return'<div class="overlay" onmousedown="A.ovDown(event)" onclick="A.arrivalCancel(event)"><div class="modal att-modal" onclick="event.stopPropagation()"><div class="row" style="justify-content:space-between;margin-bottom:16px"><h3 style="font-size:18px;font-weight:700">'+title+'</h3><button type="button" class="x-btn" onclick="A.arrivalCancel()">×</button></div>'+body+(foot?'<div class="modal-foot" style="margin-top:16px"><div class="modal-foot-l">'+btn("btn-ghost","Huỷ","A.arrivalCancel()")+'</div><div class="modal-foot-r">'+foot+'</div></div>':"")+'</div></div>';
}
function arrivalModalHTML(){
  var f=S.arrivalFlow||{};
  var step=f.step||"gps";
  var a=asgnById(f.asgnId);
  var loc=asgnLocLabel(a);
  if(step==="gps"){
    var gpsBody=f.gpsErr?'<div class="att-step-hint" style="color:#f87171">'+esc(f.gpsErr)+'</div>':'<div class="att-step-hint">Đang lấy vị trí GPS tại nơi bạn đang đứng…</div>';
    if(f.lat!=null&&f.lng!=null)gpsBody='<div class="att-step-hint">✓ Đã xác định vị trí. Tiếp tục chụp ảnh tại chỗ.</div><div class="att-gps-box">'+f.lat.toFixed(6)+", "+f.lng.toFixed(6)+' · '+esc(loc)+'</div>';
    return arrivalModalShell("Xác nhận đến vị trí",gpsBody,f.lat!=null?btn("btn-primary","Tiếp tục · Chụp ảnh","A.arrivalToPhoto()"):'<button type="button" class="btn btn-primary" disabled>Đang lấy GPS…</button>');
  }
  if(step==="photo"){
    var photoBody='<div class="att-step-hint">Chụp <b>1 ảnh</b> tại vị trí mới để xác nhận đã đến <b>'+esc(loc)+'</b>.</div>';
    photoBody+=fld("Ảnh vị trí",'<input type="file" id="arr-photo" accept="image/*" capture="environment"><div id="arr-preview" class="rpt-preview"></div>');
    if(f.lat!=null)photoBody+='<div class="att-gps-box">📍 '+f.lat.toFixed(6)+", "+f.lng.toFixed(6)+'</div>';
    return arrivalModalShell("Xác nhận đến vị trí",photoBody,btn("btn-primary","Gửi xác nhận","A.arrivalSubmit()"));
  }
  if(step==="submitting"){
    return arrivalModalShell("Xác nhận đến vị trí",'<div class="att-step-hint" style="text-align:center;padding:24px">⏳ Đang gửi xác nhận…</div>',"");
  }
  return "";
}
function initArrivalPreview(){
  if(!S.arrivalFlow||S.arrivalFlow.step!=="photo")return;
  var inp=document.getElementById("arr-photo");
  var box=document.getElementById("arr-preview");
  if(inp&&box&&!inp._arrOk){
    inp._arrOk=1;
    inp.addEventListener("change",function(){
      box.innerHTML="";
      if(!inp.files||!inp.files.length)return;
      var file=inp.files[0];
      if(!file.type||file.type.indexOf("image/")!==0)return;
      var img=document.createElement("img");
      img.src=URL.createObjectURL(file);
      img.alt="Xem trước";
      box.appendChild(img);
    });
  }
}

function hrFieldStaff(){
  return fieldEmp().sort(function(a,b){return (a.name||"").localeCompare(b.name||"","vi");});
}
function vHrAttendance(){
  var mk=S.attMonth||attMonthKey();
  var today=td();
  var staff=hrFieldStaff();
  var lateToday=[],earlyToday=[],onLeave=[],punched=[],missing=[],sundayOt=[];
  staff.forEach(function(e){
    if(isEmpOnLeave(e)){onLeave.push(e);return;}
    var recs=attRecordsForDay(e.id,today);
    if(!recs.length){if(isAttWorkDay())missing.push(e);return;}
    punched.push({e:e,recs:recs});
    recs.forEach(function(r){
      var ev=attRecordEval(r);
      if(ev.flag==="late")lateToday.push({e:e,r:r,ev:ev});
      if(ev.flag==="early")earlyToday.push({e:e,r:r,ev:ev});
    });
  });
  attDaysInMonth(mk).forEach(function(date){
    if(date>today)return;
    if(new Date(date+"T12:00:00").getDay()!==0)return;
    staff.forEach(function(e){
      var recs=attRecordsForDay(e.id,date);
      if(recs.length)sundayOt.push({e:e,date:date,recs:recs});
    });
  });
  var h='<div class="emp-portal">';
  h+='<div class="emp-page-hd"><h2 class="emp-page-title">Chấm công · Hành chính</h2></div>';
  h+='<div style="font-size:13px;color:var(--c-muted2);margin-bottom:12px;line-height:1.45">Theo dõi vào/ra toàn bộ nhân viên: đi trễ, về sớm, nghỉ phép, làm thêm Chủ nhật — căn cứ tính lương.</div>';
  h+='<div class="stat-grid" style="margin-bottom:14px">';
  [[punched.length,"Đã chấm hôm nay","#4ade80"],[lateToday.length,"Đi trễ","#fbbf24"],[earlyToday.length,"Về sớm","#fb923c"],[onLeave.length,"Nghỉ phép","#f87171"],[missing.length,"Chưa chấm","#94a3b8"],[sundayOt.length,"CN làm thêm (tháng)","#38bdf8"]].forEach(function(s){
    h+='<div class="stat-card"><div class="stat-row"><div class="stat-n" style="color:'+s[2]+'">'+s[0]+'</div><div class="stat-l">'+s[1]+'</div></div></div>';
  });
  h+='</div>';
  h+='<div class="card card-p" style="margin-bottom:14px"><div class="row" style="justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:10px"><h3 style="font-size:15px;color:var(--c-accent);margin:0">Hôm nay · '+dFmt(today)+'</h3><input type="month" id="att-month-pick" value="'+mk+'" onchange="A.attMonthPick(this.value)" style="min-width:140px"></div>';
  if(onLeave.length){
    h+='<div style="margin-bottom:12px"><div style="font-size:12px;font-weight:700;color:#f87171;margin-bottom:6px">Đang nghỉ phép</div>';
    onLeave.forEach(function(e){h+='<div style="padding:8px 0;border-bottom:1px solid var(--c-border4);font-size:13px"><b style="color:#94a3b8">'+esc(e.name)+'</b> · <span style="color:#f87171">'+esc(empLeaveLabel(e))+'</span></div>';});
    h+='</div>';
  }
  if(lateToday.length||earlyToday.length){
    h+='<div style="margin-bottom:12px"><div style="font-size:12px;font-weight:700;color:#fbbf24;margin-bottom:6px">Đi trễ / Về sớm</div>';
    lateToday.concat(earlyToday).forEach(function(x){
      h+='<div style="padding:8px 0;border-bottom:1px solid var(--c-border4);font-size:13px"><b>'+esc(x.e.name)+'</b> · <span style="color:'+attFlagColor(x.ev.flag)+'">'+esc(x.ev.label)+'</span> · '+attFmtClock(x.r.at)+(x.r.lateReason?' · <span style="color:#fb923c">'+esc(x.r.lateReason)+'</span>':"")+'</div>';
    });
    h+='</div>';
  }
  h+='<div style="font-size:12px;font-weight:700;color:var(--c-accent);margin-bottom:6px">Vào / ra trong ngày</div>';
  if(!punched.length&&!missing.length)h+='<div style="color:var(--c-muted);font-size:13px">Chưa có dữ liệu.</div>';
  punched.forEach(function(row){
    var e=row.e;
    h+='<div style="padding:10px 0;border-bottom:1px solid var(--c-border4)"><div style="font-size:13px;font-weight:600;margin-bottom:4px">'+esc(e.name)+' <span style="color:var(--c-muted4);font-weight:500">· '+esc(e.group||"")+'</span></div>';
    row.recs.forEach(function(r){h+='<div style="font-size:12px;color:var(--c-muted2)">'+(r.type==="in"?"Vào":"Ra")+' <b>'+attFmtClock(r.at)+'</b>'+attPunchDetailHTML(r)+'</div>';});
    h+='</div>';
  });
  if(missing.length){
    h+='<div style="margin-top:10px;font-size:12px;color:#94a3b8">Chưa chấm: '+esc(missing.map(function(e){return e.name;}).join(", "))+'</div>';
  }
  h+='</div>';
  h+='<div class="card card-p" style="margin-bottom:14px"><h3 style="font-size:15px;color:var(--c-accent);margin-bottom:8px">Làm thêm Chủ nhật · '+mk+'</h3>';
  if(!sundayOt.length)h+='<div style="font-size:13px;color:var(--c-muted)">Chưa có ai chấm công ngày Chủ nhật trong tháng này.</div>';
  else sundayOt.forEach(function(x){
    h+='<div style="padding:8px 0;border-bottom:1px solid var(--c-border4);font-size:13px"><b>'+esc(x.e.name)+'</b> · '+dFmt(x.date)+' · ';
    h+=x.recs.map(function(r){return (r.type==="in"?"Vào":"Ra")+" "+attFmtClock(r.at);}).join(" · ");
    h+='</div>';
  });
  h+='</div>';
  h+='<div class="card card-p"><h3 style="font-size:15px;color:var(--c-accent);margin-bottom:8px">Tóm tắt tháng · từng người</h3>';
  h+='<div style="font-size:12px;color:var(--c-muted);margin-bottom:10px">Đủ công / nghỉ / trễ / sớm — bấm tên để xem chi tiết nhân sự.</div>';
  staff.forEach(function(e){
    var sum=attMonthlySummary(e.id,mk);
    var leaveBit=isEmpOnLeave(e)?' · <span style="color:#f87171">'+esc(empLeaveLabel(e))+'</span>':"";
    h+='<div class="li" style="padding:10px 0;cursor:pointer" onclick="A.empDet(\''+e.id+'\')"><div style="font-size:13px;font-weight:600">'+esc(e.name)+leaveBit+'</div>';
    h+='<div style="font-size:12px;margin-top:4px"><span style="color:#4ade80">Đủ '+sum.counts.complete+'</span> · <span style="color:#f87171">Nghỉ '+sum.counts.off+'</span> · <span style="color:#fbbf24">Trễ '+sum.kpi.late+'</span> · <span style="color:#fbbf24">Sớm '+sum.kpi.early+'</span></div></div>';
  });
  h+='</div></div>';
  return h;
}

function vChamCong(){
  if(canViewAttCompany())return vHrAttendance();
  var me=S.auth.empId;
  if(!me)return '<div class="card card-p" style="color:var(--c-muted)">Không xác định được nhân viên.</div>';
  var remind=attNeedRemind();
  var recs=attRecordsToday();
  var last=recs.length?recs[recs.length-1]:null;
  var nextType=(!last||last.type==="out")?"in":"out";
  var daySt=attDayStatus(me,td());
  var todayAll=attRecordsToday().sort(function(a,b){return attAtMs(b)-attAtMs(a)});
  var h='<div class="emp-portal">';
  h+=empPortalProfile();
  h+='<div class="emp-page-hd" style="display:flex;justify-content:space-between;align-items:baseline;flex-wrap:wrap;gap:8px;margin-bottom:16px"><h2 class="emp-page-title" style="margin:0">Chấm công</h2></div>';
  h+=empArrivalBannersHTML();
  if(remind)h+='<div class="att-remind-banner">'+esc(attRemindText(remind))+'</div>';
  if(isAttWorkDay()&&daySt!=="complete"){
    h+='<div class="att-remind-banner" style="background:rgba(248,113,113,.08);border-color:rgba(248,113,113,.25);color:#fca5a5"><b>'+attDayStatusUILabel(me,td(),daySt)+'</b></div>';
  }
  if(!isAttWorkDay())h+='';
  var promptColor = nextType === "in" ? "#4ade80" : "#f59e0b";
  var promptText = nextType === "in" ? "Bạn hãy chấm công vào" : "Bạn hãy chấm công ra";
  h+='<div style="text-align:center;font-size:14px;font-weight:600;color:var(--c-muted);margin-bottom:-4px"><span style="color:'+promptColor+'">●</span> '+promptText+'</div>';
  h+='<div class="att-fab-wrap" style="padding:20px 0">';
  if(nextType==="in"){
    h+='<button type="button" class="att-btn-3d att-btn-in-3d'+(remind==="in"?" att-btn-pulse-in":"")+'" onclick="A.attStart(\'in\')">Chấm vào</button>';
  }else{
    h+='<button type="button" class="att-btn-3d att-btn-out-3d'+(remind==="out"?" att-btn-pulse-out":"")+'" onclick="A.attStart(\'out\')">Chấm ra</button>';
  }
  h+='</div>';
  var todayCycles = [];
  var todayAsc = todayAll.slice().sort(function(a,b){return attAtMs(a)-attAtMs(b)});
  var currentTodayCycle = null;
  todayAsc.forEach(function(r){
    if(r.type === "in"){
      if(currentTodayCycle) {
        todayCycles.push(currentTodayCycle);
      }
      currentTodayCycle = { date: r.date, inRec: r, outRec: null };
    } else {
      if(currentTodayCycle && currentTodayCycle.date === r.date) {
        currentTodayCycle.outRec = r;
        todayCycles.push(currentTodayCycle);
        currentTodayCycle = null;
      } else {
        if(currentTodayCycle) {
          todayCycles.push(currentTodayCycle);
          currentTodayCycle = null;
        }
        todayCycles.push({ date: r.date, inRec: null, outRec: r });
      }
    }
  });
  if(currentTodayCycle){
    todayCycles.push(currentTodayCycle);
  }
  todayCycles.reverse();

  if(isAttWorkDay()||todayAll.length){
    h+='<div class="att-status-card"><div class="att-status-hd">Hôm nay · '+dFmt(td())+(isAttWorkDay()?' · <span style="color:'+attDayStatusColor(daySt,me,td())+'">'+attDayStatusUILabel(me,td(),daySt)+'</span>':"")+'</div>';
    
    var lastActiveCycle = todayCycles.length ? todayCycles[0] : null;
    var todayNotice = lastActiveCycle ? attCycleNoticeHTML(lastActiveCycle) : "";
    if(todayNotice) {
      h += '<div style="font-size:12px;margin:4px 14px 10px;line-height:1.5">' + todayNotice.replace(/^ · /, "") + '</div>';
    }
    
    if(todayCycles.length){
    h+='<div class="att-today-list">';
    todayCycles.forEach(function(c){
      var tIn = c.inRec ? attFmtClock(c.inRec.at) : "—";
      var tOut = c.outRec ? attFmtClock(c.outRec.at) : "—";
      h+='<div class="att-today-row">';
      h+='<span class="att-today-lbl" style="color:var(--c-muted)">Vào/ra:</span>';
      h+='<span class="att-today-time" style="color:#4ade80">' + tIn + '</span>';
      h+='<span style="color:var(--c-muted2);margin:0 4px">/</span>';
      h+='<span class="att-today-time" style="color:#f59e0b">' + tOut + '</span>';
      h+='</div>';
    });
    h+='</div>';
    }else if(isAttWorkDay())h+='<div style="font-size:13px;color:var(--c-muted);padding:4px 0">Chưa có lần chấm nào hôm nay.</div>';
    h+='</div>';
  }
  var cycles = [];
  var histAsc = (S.attendance || [])
    .filter(function(r){return r.empId===me})
    .sort(function(a,b){return attAtMs(a)-attAtMs(b)});
  
  var currentCycle = null;
  histAsc.forEach(function(r){
    if(r.type === "in"){
      if(currentCycle) {
        cycles.push(currentCycle);
      }
      currentCycle = { date: r.date, inRec: r, outRec: null };
    } else {
      if(currentCycle && currentCycle.date === r.date) {
        currentCycle.outRec = r;
        cycles.push(currentCycle);
        currentCycle = null;
      } else {
        if(currentCycle) {
          cycles.push(currentCycle);
          currentCycle = null;
        }
        cycles.push({ date: r.date, inRec: null, outRec: r });
      }
    }
  });
  if(currentCycle){
    cycles.push(currentCycle);
  }
  cycles.reverse();
  
  var activeCycles = cycles.slice(0, 20);
  if(activeCycles.length){
    h+='<h3 style="font-size:15px;color:var(--c-accent);margin-top:20px;margin-bottom:10px">Lịch sử chấm công</h3>';
    activeCycles.forEach(function(c){
      h+='<div class="att-cycle-card">';
      h+='<div class="att-cycle-date">📅 '+dFmtWeekday(c.date)+'</div>';
      
      var notice = attCycleNoticeHTML(c);
      var tIn = c.inRec ? attFmtClock(c.inRec.at) : "—";
      var tOut = c.outRec ? attFmtClock(c.outRec.at) : "—";
      
      h+='<div class="att-cycle-row">';
      h+='<div>';
      h+='<span class="att-cycle-type" style="color:var(--c-muted)">Vào/ra:</span>';
      h+='<span class="att-cycle-time" style="color:#4ade80">' + tIn + '</span>';
      h+='<span style="color:var(--c-muted2);margin:0 4px">/</span>';
      h+='<span class="att-cycle-time" style="color:#f59e0b">' + tOut + '</span>';
      h+=notice;
      h+='</div>';
      
      if(c.inRec && c.inRec.sitePhoto){
        h+='<div class="rpt-photos" style="margin-top:8px"><a href="'+esc(c.inRec.sitePhoto)+'" target="_blank" rel="noopener"><img src="'+esc(c.inRec.sitePhoto)+'" alt="Ảnh nhà máy" style="max-height:80px;border-radius:6px"></a></div>';
      }
      if(c.outRec && c.outRec.workPhotos && c.outRec.workPhotos.length) {
        h+='<div style="margin-top:8px">'+renderReportPhotos(c.outRec.workPhotos)+'</div>';
      }
      h+='</div>';
      
      h+='</div>';
    });
  }
  h+=attMonthlyReportHTML(me);
  return h+'</div>';
}

function vReport(){
  var me=S.auth.empId;
  if(!me)return '<div class="card card-p" style="color:var(--c-muted)">Không xác định được nhân viên.</div>';
  var acts=empActs(me).sort(function(a,b){return (b.startDate||"").localeCompare(a.startDate||"")});
  var h='<div class="emp-portal">';
  h+=empPortalProfile();
  h+='<div class="emp-page-hd"><h2 class="emp-page-title">Báo cáo tiến độ hàng ngày</h2></div>';
  if(!acts.length)return h+'<div class="card card-p" style="color:var(--c-muted)">Chưa có công việc được giao để báo cáo.</div></div>';
  var sel=S.reportAsgn||acts[0].id;
  var cur=acts.find(function(a){return a.id===sel})||acts[0];
  sel=cur.id;
  var curOrg=cur._orgId||currentOrgId();
  var today=todayReport(cur.id,curOrg);
  h+='<div class="card card-p emp-report-form" style="margin-bottom:16px">';
  h+=fld("Công việc",'<select id="rpt-asgn" onchange="A.rptAsgn(this.value)">'+acts.map(function(a){var info=asgnInfo(a);return'<option value="'+a.id+'" data-org="'+(a._orgId||currentOrgId())+'" '+(a.id===sel&&(a._orgId||currentOrgId())===curOrg?"selected":"")+'>'+esc(info.title)+' ('+a.prog+'%)</option>'}).join("")+'</select>');
  h+=fld("Ngày báo cáo",'<input type="date" id="rpt-date" value="'+td()+'" max="'+td()+'">');
  h+='<div class="field"><span class="lab">Tiến độ hoàn thành</span><div class="row" style="gap:12px;align-items:center"><input type="range" id="rpt-prog" min="0" max="100" step="5" value="'+(today?today.prog:cur.prog)+'" style="flex:1;accent-color:#38bdf8"><span id="rpt-prog-lbl" style="font-family:monospace;font-weight:700;color:#38bdf8;min-width:42px">'+(today?today.prog:cur.prog)+'%</span></div></div>';
  h+=fld("Ghi chú",'<textarea id="rpt-note" rows="4" placeholder="Hôm nay đã làm những gì? Gặp khó khăn, trở ngại gì cần trao đổi với giám đốc?">'+(today?esc(today.note||""):"")+'</textarea>');
  h+=fld("Ảnh công việc",'<input type="file" id="rpt-photos" accept="image/*" capture="environment" multiple><div id="rpt-preview" class="rpt-preview"></div>');
  if(today)h+='<div style="font-size:12px;color:#4ade80;margin-bottom:10px">✓ Đã có báo cáo hôm nay — gửi lại sẽ cập nhật.</div>';
  h+='<button type="button" class="btn btn-primary" id="rpt-submit" style="width:100%;margin-top:8px" onclick="A.submitReport()">Gửi báo cáo</button>';
  h+='</div>';
  var histDays=(typeof window.__CV3_historyWindowDays==="function"?window.__CV3_historyWindowDays():30);
  var hist=reportsForEmp(me).slice(0,40);
  h+='<div class="emp-rpt-hist"><h3 style="font-size:15px;color:var(--c-accent);margin-bottom:6px">Lịch sử báo cáo</h3>';
  h+='<div style="font-size:12px;color:var(--c-muted);margin-bottom:10px">Các lần đã gửi trong khoảng '+histDays+' ngày gần đây — chạm ảnh để xem lớn.</div>';
  if(!hist.length){
    h+='<div class="rpt-card" style="color:var(--c-muted)">Chưa có báo cáo nào. Gửi báo cáo ở trên để lưu lại tại đây.</div>';
  }else{
    hist.forEach(function(r){
      var a=asgnById(r.asgnId,r._orgId);
      var info=asgnInfo(a||{});
      var orgBit="";
      if(r._orgId&&viewerCanSeeOtherOrg()&&r._orgId!==currentOrgId()){
        orgBit=' · <span style="color:#fbbf24">'+esc(orgLabelOf(r._orgId))+'</span>';
      }
      h+='<div class="rpt-card"><div class="rpt-head"><strong style="color:var(--c-text);font-weight:600">'+esc(rptFmtTime(r))+'</strong> · '+esc(info.title||"Công việc")+orgBit+' · <span style="color:#38bdf8">'+r.prog+'%</span></div>';
      if(r.note)h+='<div style="font-size:13px;color:var(--c-text2);white-space:pre-wrap;margin-top:4px">'+esc(r.note)+'</div>';
      else h+='<div style="font-size:12px;color:var(--c-muted);margin-top:4px;font-style:italic">Không có ghi chú</div>';
      h+=renderReportPhotos(r.photos);
      h+='</div>';
    });
  }
  h+='</div>';
  return h+'</div>';
}

function leaveStatusLabel(st){
  if(st==="approved")return{l:"Đã duyệt",c:"#4ade80"};
  if(st==="rejected")return{l:"Từ chối",c:"#f87171"};
  return{l:"Đang chờ",c:"#fbbf24"};
}
function leaveDeciderName(req){
  if(!req)return "";
  var uid=String(req.decidedBy||"").trim();
  if(uid){
    if(S.auth&&S.auth.uid===uid)return S.auth.displayName||S.auth.username||"Giám đốc";
    var e=(S.emp||[]).find(function(x){return x&&x.authUid===uid});
    if(e&&e.name)return e.name;
    var dir=directorChatRecipient();
    if(dir&&dir.uid===uid)return dir.name||"Giám đốc";
  }
  if(req.decidedByName)return String(req.decidedByName);
  if(req.status!=="approved"&&req.status!=="rejected")return "";
  var msgs=chatMsgsForTo(leaveRoomKey(req.id)),i,m;
  for(i=msgs.length-1;i>=0;i--){
    m=msgs[i];
    if(m&&m.kind==="leave_decision"&&m.fromName)return m.fromName;
  }
  return "Giám đốc";
}
/** Thẻ đơn nghỉ gọn: tên · thời gian · tình trạng (bởi ai). Chi tiết khi mở bảng tin. */
function leaveSummaryCardHTML(r,opts){
  opts=opts||{};
  if(!r)return"";
  var st=leaveStatusLabel(r.status);
  var unread=unreadLeaveForReq(r.id)|0;
  var by=leaveDeciderName(r);
  var statusHtml="";
  if(r.status==="approved")statusHtml='Tình trạng: <span style="color:'+st.c+';font-weight:700">Đã duyệt</span>'+(by?' bởi <b>'+esc(by)+'</b>':"");
  else if(r.status==="rejected")statusHtml='Tình trạng: <span style="color:'+st.c+';font-weight:700">Từ chối</span>'+(by?' bởi <b>'+esc(by)+'</b>':"");
  else statusHtml='Tình trạng: <span style="color:'+st.c+';font-weight:700">Đang chờ duyệt</span>';
  var h='<div class="rpt-card'+(unread?" chat-peer-unread":"")+'" style="cursor:pointer" onclick="A.openLeaveRoom(\''+r.id+'\')">';
  h+='<div class="rpt-head" style="align-items:center;gap:8px"><strong>Đơn xin nghỉ «'+esc(r.empName||"?")+'»</strong>'+(unread?'<span class="chat-unread-dot">'+(unread>99?"99+":unread)+'</span>':"")+'</div>';
  h+='<div style="font-size:13px;margin-top:8px;color:#7dd3fc">Từ ngày '+dFmt(r.startDate)+' đến ngày '+dFmt(r.endDate)+(r.days?' ('+r.days+' ngày)':'')+'</div>';
  h+='<div style="font-size:13px;margin-top:6px;color:var(--c-text2)">'+statusHtml+'</div>';
  if(opts.dirActions&&isDir()&&r.status==="pending"){
    h+='<div class="row" style="gap:8px;margin-top:10px;flex-wrap:wrap" onclick="event.stopPropagation()">';
    h+=btn("btn-accent btn-sm","Đồng ý","A.leaveApprove('"+r.id+"')")+btn("btn-danger btn-sm","Từ chối","A.leaveRejectOpen('"+r.id+"')");
    h+='</div>';
  }
  h+='</div>';
  return h;
}
function vLeaveAdmin(){
  var pending=pendingLeaveReqs();
  var recent=(S.leaveReqs||[]).slice().sort(function(a,b){
    var ma=a.createdAt&&a.createdAt.seconds?a.createdAt.seconds*1000:(typeof a.createdAt==="number"?a.createdAt:0);
    var mb=b.createdAt&&b.createdAt.seconds?b.createdAt.seconds*1000:(typeof b.createdAt==="number"?b.createdAt:0);
    return mb-ma;
  }).slice(0,40);
  var h='<div class="emp-portal"><div class="emp-page-hd"><h2 class="emp-page-title">Nghỉ phép</h2></div>';
  h+='<div class="card card-p" style="margin-bottom:14px"><h3 style="font-size:15px;color:#fbbf24;margin-bottom:8px">Chờ duyệt ('+pending.length+')</h3>';
  if(!pending.length)h+='<div style="font-size:13px;color:var(--c-muted)">Không có đơn chờ duyệt.</div>';
  else pending.forEach(function(r){h+=leaveSummaryCardHTML(r,{dirActions:1});});
  h+='</div><div class="emp-rpt-hist"><h3 style="font-size:15px;color:var(--c-accent);margin-bottom:8px">Đơn gần đây</h3>';
  if(!recent.length)h+='<div class="rpt-card" style="color:var(--c-muted)">Chưa có đơn.</div>';
  else recent.forEach(function(r){h+=leaveSummaryCardHTML(r);});
  h+='</div></div>';
  return h;
}

/** Form xin nghỉ phép — dùng cho NV, Điều hành, Giám sát, Hành chính, Chỉ huy trưởng. */
function vLeaveRequestForm(opts){
  opts=opts||{};
  var embedded=!!opts.embedded;
  var me=S.auth&&S.auth.empId;
  if(!me)return '<div class="card card-p" style="color:var(--c-muted)">Không xác định được nhân viên — cần gắn hồ sơ nhân sự với tài khoản.</div>';
  var mine=(S.leaveReqs||[]).filter(function(r){return r&&r.empId===me}).slice(0,30);
  var meEmp=eById(me);
  var onLeave=isEmpOnLeave(meEmp);
  var h=embedded?"":'<div class="emp-portal">';
  if(!embedded){
    h+=empPortalProfile();
    h+='<div class="emp-page-hd"><h2 class="emp-page-title">Xin nghỉ phép</h2></div>';
  }else{
    h+='<div class="card card-p" style="margin-top:16px;margin-bottom:14px"><h3 style="font-size:15px;color:var(--c-accent);margin-bottom:8px">Xin nghỉ phép của tôi</h3></div>';
  }
  if(onLeave)h+='<div class="card card-p" style="margin-bottom:14px;border:1px solid rgba(248,113,113,.35);background:rgba(248,113,113,.1)"><div style="font-size:14px;font-weight:700;color:#f87171">'+esc(empLeaveLabel(meEmp))+'</div><div style="font-size:12px;color:var(--c-muted2);margin-top:4px">Trong thời gian này bạn không được giao việc mới.</div></div>';
  h+='<div class="card card-p" style="margin-bottom:16px">';
  h+=fld("Ngày bắt đầu nghỉ",'<input type="date" id="leave-start" value="'+td()+'" min="'+td()+'" onchange="A.leaveDaysPreview()">');
  h+=fld("Số ngày nghỉ",'<input type="number" id="leave-days" min="1" max="90" value="1" oninput="A.leaveDaysPreview()">');
  h+='<div id="leave-end-hint" style="font-size:12px;color:#38bdf8;margin:-6px 0 12px">Nghỉ đến hết ngày: <b>'+dFmt(leaveEndFrom(td(),1))+'</b></div>';
  h+=fld("Lý do nghỉ (viết đầy đủ câu)",'<textarea id="leave-reason" rows="3" maxlength="1000" placeholder="Ví dụ: Tôi có việc gia đình cần xử lý tại quê nên kính xin phép nghỉ…" oninput="A.leaveDaysPreview()"></textarea>');
  h+='<div class="lab" style="margin-bottom:6px">Nội dung đơn gửi Ban Giám đốc (tự động)</div>';
  h+='<div id="leave-letter-preview" style="font-size:13px;line-height:1.55;color:var(--c-text2);white-space:pre-wrap;padding:12px 14px;border-radius:12px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.1);margin-bottom:14px">'+esc(composeLeaveRequestLetter(meEmp?meEmp.name:"",td(),1,"(chưa nhập lý do)"))+'</div>';
  h+='<button type="button" class="btn btn-primary" id="leave-submit" style="width:100%;margin-top:4px" onclick="A.submitLeave()">Gửi đơn nghỉ phép</button>';
  h+='</div>';
  h+='<div class="emp-rpt-hist"><h3 style="font-size:15px;color:var(--c-accent);margin-bottom:8px">Đơn đã gửi</h3>';
  if(!mine.length)h+='<div class="rpt-card" style="color:var(--c-muted)">Chưa có đơn nghỉ phép.</div>';
  else mine.forEach(function(r){h+=leaveSummaryCardHTML(r);});
  h+='</div>';
  if(!embedded)h+='</div>';
  return h;
}

function vLeave(){
  if(isDir())return vLeaveAdmin();
  if(isAdminHr()){
    var adminHtml=vLeaveAdmin();
    if(adminHtml.slice(-12)==="</div></div>")adminHtml=adminHtml.slice(0,-12);
    return adminHtml+vLeaveRequestForm({embedded:1})+"</div></div>";
  }
  return vLeaveRequestForm();
}
function leaveRejectModalHTML(){
  var f=S.leaveReject||{},req=leaveReqById(f.reqId);
  if(!req)return"";
  var body=fld("Nhân viên",'<div style="font-size:14px;font-weight:600">'+esc(req.empName||"?")+'</div>');
  body+='<div style="font-size:13px;color:var(--c-muted2);margin-bottom:12px">'+dFmt(req.startDate)+' → '+dFmt(req.endDate)+' ('+req.days+' ngày)</div>';
  body+=fld("Lý do từ chối & hướng xử lý",'<textarea id="leave-reject-reason" rows="4" maxlength="1000" placeholder="Ví dụ: Hiện công trình đang gấp tiến độ nên chưa thể bố trí nghỉ trong thời gian này…"></textarea>');
  var foot=btn("btn-primary","Gửi","A.leaveRejectSend()");
  return'<div class="overlay" onmousedown="A.ovDown(event)" onclick="A.leaveRejectCancel(event)"><div class="modal" onclick="event.stopPropagation()"><div class="row" style="justify-content:space-between;margin-bottom:16px"><h3 style="font-size:18px;font-weight:700">Từ chối đơn nghỉ phép</h3><button type="button" class="x-btn" onclick="A.leaveRejectCancel()">×</button></div>'+body+'<div class="modal-foot" style="margin-top:16px"><div class="modal-foot-l">'+btn("btn-ghost","Huỷ","A.leaveRejectCancel()")+'</div><div class="modal-foot-r">'+foot+'</div></div></div></div>';
}
function chatLeaveCardHTML(m){
  var req=m.leaveReqId?leaveReqById(m.leaveReqId):null;
  var start=req?req.startDate:"";
  var end=req?req.endDate:"";
  var days=req?req.days:"";
  var reason=req?req.reason:(m.text||"");
  var status=req?req.status:"pending";
  var st=leaveStatusLabel(status);
  var letter=String(m.text||"").trim();
  if(m.kind==="leave_decision"){
    var hDec='<div class="leave-chat-card" style="min-width:240px;max-width:360px">';
    hDec+='<div style="font-size:13px;font-weight:800;color:'+st.c+';margin-bottom:8px">Phản hồi nghỉ phép · '+st.l+'</div>';
    hDec+='<div style="font-size:12px;color:var(--c-text2);white-space:pre-wrap;line-height:1.5">'+esc(letter||"")+'</div>';
    hDec+='</div>';
    return hDec;
  }
  var h='<div class="leave-chat-card" style="min-width:240px;max-width:360px">';
  h+='<div style="font-size:13px;font-weight:800;color:#fbbf24;margin-bottom:8px">Đơn xin nghỉ phép</div>';
  if(req){
    h+='<div style="font-size:13px;margin-bottom:4px"><b>'+esc(req.empName||"?")+'</b></div>';
    h+='<div style="font-size:12px;font-family:monospace;color:#7dd3fc;margin-bottom:8px">'+dFmt(start)+' → '+dFmt(end)+' · '+days+' ngày</div>';
    h+='<div style="font-size:12px;color:var(--c-text2);white-space:pre-wrap;line-height:1.5;margin-bottom:8px">'+esc(letter||("Lý do: "+reason))+'</div>';
    h+='<div style="font-size:12px;font-weight:700;color:'+st.c+';margin-bottom:8px">'+st.l+'</div>';
    if(status==="rejected"&&req.rejectReason)h+='<div style="font-size:12px;color:#fca5a5;margin-bottom:8px">'+esc(req.rejectReason)+'</div>';
    if(isDir()&&status==="pending"){
      h+='<div class="row" style="gap:8px;flex-wrap:wrap">'+btn("btn-accent btn-sm","Đồng ý","A.leaveApprove('"+req.id+"')")+btn("btn-danger btn-sm","Từ chối","A.leaveRejectOpen('"+req.id+"')")+'</div>';
    }
  }else{
    h+='<div style="font-size:12px;color:var(--c-text2);white-space:pre-wrap;line-height:1.5">'+esc(letter||"")+'</div>';
  }
  h+='</div>';
  return h;
}

function vMyWork(){
  var me=S.auth.empId;
  if(!me)return '<div class="card card-p" style="color:var(--c-muted)">Không xác định được nhân viên — liên hệ giám đốc.</div>';
  var acts=empActs(me).sort(function(a,b){return (b.startDate||"").localeCompare(a.startDate||"")});
  var h='<div class="emp-portal">';
  h+=empPortalProfile();
  h+='<div class="emp-page-hd"><h2 class="emp-page-title">Công việc của tôi</h2></div>';
  h+=empArrivalBannersHTML();
  if(acts.length){
    h+='<div class="card card-p gantt-card" style="margin-bottom:14px"><h3 style="margin-bottom:10px;color:var(--c-accent);font-size:15px">Lịch công việc theo dự án</h3>';
    h+=empGanttHTML(me)+'</div>';
  }
  if(!acts.length) {
    return h+'<div class="card card-p" style="color:var(--c-muted)">Chưa có công việc nào được giao.</div></div>';
  }
  h+='<div class="emp-work-list">';
  acts.forEach(function(a){
    var info=asgnInfo(a),p=pById(a.projId),ps=asgnPlanStatus(a);
    var loc=p?((p.province||"").replace(/^TP\.\s*/,"")||p.name):"—";
    h+='<div class="card card-p emp-work-card" onclick="A.myworkDet(\''+a.id+'\',\''+(a._orgId||currentOrgId())+'\')"><div class="emp-work-card-top"><div class="emp-work-title">'+esc(info.title)+'</div>'+bdg(ps.label,ps.c,ps.c+"18")+'</div>';
    h+='<div class="emp-work-loc">📍 '+esc(loc)+'</div>';
    h+='<div class="emp-work-meta">'+dFmtG(a.startDate)+(a.endDate?" → "+dFmtG(a.endDate):"")+' · '+asgnDays(a)+'</div>';
    h+=empProgRowHTML(a.prog)+'</div>';
  });
  return h+'</div></div>';
}

function vMyWorkDet(asgnId,orgHint){
  var a=asgnById(asgnId,orgHint);
  if(!a||a.empId!==S.auth.empId)return btn("btn-ghost","← Quay lại","A.myworkBack()")+'<div class="card card-p" style="margin-top:12px;color:var(--c-muted)">Không tìm thấy công việc.</div>';
  var info=asgnInfo(a),p=pById(a.projId),pl=pLoc(p),c=p&&p.custId?cById(p.custId):null,mates=coworkersOnProj(a.projId,a.empId);
  var ps=asgnPlanStatus(a);
  var h='<div class="emp-portal"><div class="row" style="justify-content:space-between;margin-bottom:16px">'+btn("btn-ghost","← Quay lại","A.myworkBack()")+'</div>';
  h+='<div class="card card-p"><h2 class="emp-page-title" style="margin-bottom:12px">'+esc(info.title)+'</h2>';
  h+='<div style="margin-bottom:12px">'+bdg(ps.label,ps.c,ps.c+"18")+'</div>';
  if(ps.key==="late")h+='<div style="margin-bottom:12px;padding:10px 12px;border-radius:10px;background:rgba(239,68,68,.12);border:1px solid rgba(239,68,68,.35);color:#f87171;font-size:13px">Công việc đã quá hạn kế hoạch — hãy báo cáo hoàn thành khi xong việc.</div>';
  h+=asgnReceiptHTML(a);
  h+='<div class="emp-detail-grid">';
  h+='<div class="emp-detail-item"><div class="lab">Nội dung / hạng mục</div><div class="emp-detail-val">'+esc(a.workContent||info.title||(p?p.name:"—"))+(a.loadPct!=null?' <span style="color:#38bdf8">('+a.loadPct+'%)</span>':"")+'</div></div>';
  h+='<div class="emp-detail-item"><div class="lab">Làm ở đâu</div><div class="emp-detail-val">📍 '+esc(pl?pl.name:(p?p.province:"—"))+'</div>';
  if(c&&c.address)h+='<div style="font-size:12px;color:var(--c-muted2);margin-top:4px">'+esc(c.address)+'</div>';
  h+='</div>';
  h+='<div class="emp-detail-item"><div class="lab">Thời gian</div><div class="emp-detail-val" style="font-family:monospace;font-size:13px">'+dFmtG(a.startDate)+(a.endDate?" → "+dFmtG(a.endDate):"")+' <span style="color:#38bdf8">('+asgnDays(a)+')</span></div></div>';
  h+='<div class="emp-detail-item"><div class="lab">Tiến độ</div><div style="margin-top:4px">'+empProgRowHTML(a.prog)+'</div></div>';
  h+='</div>';
  if(info.cust||info.contact){h+='<div style="margin-top:14px"><div class="lab">Khách hàng / Liên hệ</div><div class="emp-detail-val">'+esc(info.cust)+(info.cust&&info.contact?" · ☎ ":"")+(info.contact?esc(info.contact):"")+'</div></div>';}
  h+='<div style="margin-top:16px"><div class="lab">Cùng làm chung'+(mates.length?' ('+mates.length+')':'')+'</div>';
  if(!mates.length)h+='<div class="emp-detail-val" style="color:var(--c-muted)">Chỉ bạn trên công việc này.</div>';
  else h+='<div class="row" style="gap:8px;flex-wrap:wrap;margin-top:6px">'+mates.map(function(n){return bdg(n,groupColor(p?p.group:"Hệ thống"),"transparent")}).join("")+'</div>';
  if(asgnHandoffLine(a))h+='<div class="asgn-handoff-note" style="margin-top:12px">'+asgnHandoffLine(a)+'</div>';
  if(p&&p.note)h+='<div style="margin-top:14px"><div class="lab">Ghi chú dự án</div><div class="emp-detail-note">'+esc(p.note)+'</div></div>';
  h+='<div class="row" style="gap:8px;margin-top:16px;flex-wrap:wrap">';
  if(a.status==="queued"){
    h+='<div style="width:100%;padding:10px 12px;border-radius:10px;background:rgba(148,163,184,.12);border:1px solid rgba(148,163,184,.35);color:#cbd5e1;font-size:13px;line-height:1.45">Hạng mục này đang <b>chờ hạng mục cha</b>. Khi mọi hạng mục phụ thuộc đã xong, việc sẽ tự mở.</div>';
  }else{
    h+=btn("btn-primary","Báo cáo tiến độ hôm nay","A.goReport('"+a.id+"','"+(a._orgId||currentOrgId())+"')");
  }
  if(a.status==="active"||a.status==="paused"){
    if(isChiefAsgn(a)){
      h+=btn("btn-accent","Hoàn tất việc kiểm tra","A.empFin('"+a.id+"')");
    }else{
      h+=btn("btn-accent","Hoàn tất phần việc của tôi","A.empFin('"+a.id+"')");
      h+='<div style="width:100%;font-size:12px;color:var(--c-muted4);margin-top:2px">Chỉ hoàn tất <b>phần việc thi công của bạn</b>. Dự án vẫn có thể đang làm — không chuyển sang Hoàn thành.</div>';
    }
  }
  if(p&&canConfirmProjDone(p)&&!isDir()&&(a.status==="active"||a.status==="paused"||a.status==="done")){
    h+='<div style="width:100%;margin-top:10px;padding-top:12px;border-top:1px solid rgba(255,255,255,.08)">';
    h+='<div style="font-size:12px;color:#fbbf24;margin-bottom:8px;line-height:1.4">Riêng quyền <b>Trưởng nhóm</b>: xác nhận hoàn thành <b>cả dự án</b> (khác với hoàn tất phần việc ở trên).</div>';
    h+=btn("btn-primary btn-sm","Hoàn thành","A.completeProj('"+p.id+"')");
    h+='</div>';
  }
  h+='</div>';
  h+=renderReportsBlock(asgnId,5);
  h+='</div>';
  /* Nhân viên không xem nhật ký / tiến độ chung của dự án — chỉ việc của mình. */
  if(p&&canViewSharedProg())h+='<div class="card card-p" style="margin-top:14px">'+renderProjTimeline(p.id)+'</div>';
  return h+'</div>';
}

function vDash(){
  var act=S.asgn.filter(function(a){return a.status==="active"});
  var open=S.proj.filter(function(p){return p.status!=="done"}).length;
  var lateN=lateAlertGrouped().length;
  var h=lateAlertBannerHTML();
  h+='<div class="stat-grid">';
  var stats=[[open,"Dự án","#38bdf8","proj"],[act.length,"Công việc","#fbbf24","prog"]];
  if(canViewEmpTab())stats.unshift([staffEmp().length,"Nhân sự","#a8d4ff","emp"]);
  if(canViewLeaveOverview()||canRequestLeave()){
    var leaveN=canViewLeaveOverview()?pendingLeaveReqs().length:unreadLeaveCount();
    stats.splice(canViewEmpTab()?1:0,0,[leaveN,"Nghỉ phép","#f87171","leave"]);
  }
  if(lateN)stats.push([lateN,"Trễ hạn","#ef4444","proj"]);
  if(canUseLich())stats.push([schedCount(),"Lịch hẹn","#f472b6","lich"]);
  if(canViewCust())stats.push([S.cust.length,"Khách hàng","#38bdf8","cust"]);
  stats.forEach(function(s){
    var click=s[3]==="lich"?"A.openLich()":"A.go('"+s[3]+"')";
    h+='<div class="stat-card" onclick="'+click+'" title="Xem '+s[1]+'"><div class="stat-row"><div class="stat-n" style="color:'+s[2]+'">'+s[0]+'</div><div class="stat-l">'+s[1]+' ↗</div></div></div>';
  });
  h+='</div>';
  if(canViewEmpTab()){
    h+='<div class="card card-p"><h3 style="margin-bottom:12px;color:var(--c-accent)">Chuyên môn</h3><div class="dash-grid">';
    getGroups().forEach(function(g,gi){var list=staffEmp(S.emp.filter(function(e){return e.group===g})).sort(function(a,b){return (a.name||"").localeCompare(b.name||"","vi")});var openG=!!S.expGrp[g];
      h+='<div class="spec-grp"><div class="row spec-hd" style="justify-content:space-between" onclick="A.tgGrp('+gi+')"><div class="row" style="gap:8px"><span class="spec-arr'+(openG?" open":"")+'">▸</span><div class="gdot" style="background:'+groupColor(g)+';color:'+groupColor(g)+'"></div><span style="font-size:14px;font-weight:600">'+esc(g)+'</span></div><span style="font-family:monospace;font-size:13px;color:rgba(180,210,255,.7)">'+list.length+'</span></div>';
      if(openG){h+='<div class="spec-list">';
        if(!list.length)h+='<div class="spec-item" style="color:var(--c-muted3);font-size:13px">Chưa có nhân sự</div>';
        else list.forEach(function(e){var p=busyPct(e);h+='<div class="spec-item"><div class="row" style="justify-content:space-between;align-items:center;gap:10px"><span class="spec-name" style="font-size:13px" onclick="A.empDet(\''+e.id+'\')">'+esc(e.name)+'</span><div class="row" style="gap:6px;align-items:center;flex-shrink:0">'+busyBar(p)+'<span class="busy-pct">'+p+'%</span></div></div></div>';});
        h+='</div>';}
      h+='</div>';});
    h+='</div></div>';
  }
  if(canViewSharedProg())h+=ganttCardWrap("Tiến độ dự án (Gantt)",ganttHTML(),"margin-top:14px");
  return h}

function vEmpDet(id){
  if(!canViewEmpTab())return"";
  var e=eById(id);
  if(!e||!isStaffEmp(e))return btn("btn-ghost","← Quay lại","A.empBack()")+'<div class="card card-p" style="margin-top:12px;color:var(--c-muted)">Không tìm thấy nhân sự.</div>';
  var s=empStatusInfo(e),q=aq(e.id),a=ac(e.id),p=busyPct(e),el=eLoc(e);
  var acts=empActs(e.id);
  var rightBtns=[];
  if(canGiao()&&!isOversightEmp(e)&&!isAdminHrEmp(e)&&!isEmpOnLeave(e))rightBtns.push(btn("btn-primary btn-sm","Giao việc","A.egv()"));
  if(canManageStaff())rightBtns.push(btn("btn-danger btn-sm","Sửa","A.oe('"+e.id+"')"));
  var h='<div class="row" style="justify-content:space-between;margin-bottom:16px;flex-wrap:wrap;gap:8px;align-items:center">'+btn("btn-ghost","← Quay lại","A.empBack()")+(rightBtns.length?'<div class="row" style="gap:8px">'+rightBtns.join("")+'</div>':"")+'</div>';
  h+='<div class="card card-p">'+empSwipeRow(e.id,'<div class="row" style="justify-content:space-between;align-items:flex-start;width:100%;padding:2px 0"><div><h2 style="font-size:22px;font-weight:700;margin-bottom:8px'+(isEmpOnLeave(e)?";color:#94a3b8":"")+'">'+esc(e.name)+'</h2><div class="row" style="gap:8px;flex-wrap:wrap">'+bdg(e.group,groupColor(e.group))+bdg(s.l,s.c,s.s)+'</div></div></div>');
  if(isEmpOnLeave(e))h+='<div style="margin-bottom:14px;padding:10px 12px;border-radius:10px;background:rgba(248,113,113,.12);border:1px solid rgba(248,113,113,.35);color:#f87171;font-size:13px;font-weight:700">'+esc(empLeaveLabel(e))+'</div>';
  h+='<div style="margin-bottom:16px"><div style="font-size:12px;color:var(--c-muted);margin-bottom:5px">Bận rộn</div>'+busyBar(p,true)+'<div style="text-align:right;font-family:monospace;font-size:11px;color:rgba(200,225,255,.75);margin-top:4px">'+p+'%</div></div>';
  h+='<div class="row" style="gap:8px;flex-wrap:wrap;margin-bottom:12px">'+empOrgBadgesHTML(e)+'</div>';
  if(canManageStaff()){
    h+='<div style="margin-bottom:14px;padding:12px;background:rgba(251,191,36,.08);border:1px solid rgba(251,191,36,.25);border-radius:12px"><div style="font-size:12px;font-weight:600;color:#fbbf24;margin-bottom:8px">'+(isOversightEmp(e)||isAdminHrEmp(e)?"Phạm vi đội — "+e.group:"Đội tham gia")+'</div>';
    h+=empOrgPickHTML(empOrgIds(e),{inputClass:"",onchange:"A.toggleEmpOrg('"+e.id+"',this.value,this.checked)"});
    h+='</div>';
  }
  h+='<div class="grid2" style="gap:14px;margin-bottom:14px"><div><div style="font-size:12px;color:var(--c-muted);margin-bottom:4px">Nhà (tỉnh/thành)</div><div style="font-size:14px">🏠 '+esc(e.province)+'</div></div><div style="cursor:pointer" onclick="A.ol(\''+e.id+'\')"><div style="font-size:12px;color:var(--c-muted);margin-bottom:4px">Vị trí hiện tại</div><div style="font-size:14px">📍 '+el.src+'</div></div><div><div style="font-size:12px;color:var(--c-muted);margin-bottom:4px">Tay nghề</div><div>'+strs(e.skill)+'</div></div><div><div style="font-size:12px;color:var(--c-muted);margin-bottom:4px">Đánh giá / Việc đang làm</div><div style="font-family:monospace;font-size:13px">'+(q?q.toFixed(1)+"★":"—")+' · '+a+' việc</div></div></div>';
  if(e.note)h+='<div style="margin-bottom:14px"><div style="font-size:12px;color:var(--c-muted);margin-bottom:4px">Ghi chú</div><div style="font-size:14px;color:rgba(200,220,255,.8)">'+esc(e.note)+'</div></div>';
  h+='<div class="grid2" style="gap:14px;margin-bottom:14px"><div><div style="font-size:12px;color:var(--c-muted);margin-bottom:4px">Chức vụ</div><div style="font-size:14px">'+(empAccountRole(e)==="director"?"★ Giám đốc":"Nhân viên")+'</div></div><div><div style="font-size:12px;color:var(--c-muted);margin-bottom:4px">Tên đăng nhập</div><div style="font-family:monospace;font-size:13px;color:#38bdf8">'+esc(empLoginKey(e))+'</div></div><div><div style="font-size:12px;color:var(--c-muted);margin-bottom:4px">Tài khoản</div><div style="font-size:13px">'+(e.authUid?"✓ Đã đăng ký":"Chưa đăng ký")+'</div></div></div>';
  var isMe=S.auth&&S.auth.empId===e.id;
  if(isMe||canOperate()){
  if(isMe)h+=empPushBlockHTML(e.id);
  else if(e.fcmToken)h+='<div style="margin-bottom:14px;padding:12px;background:rgba(56,189,248,.08);border:1px solid rgba(56,189,248,.2);border-radius:12px"><div style="font-size:12px;font-weight:600;color:#38bdf8">📱 Thông báo giao việc · đã bật</div></div>';
  }
  if(acts.length){
    h+='<div style="margin-bottom:14px;padding-top:4px"><div style="font-size:13px;font-weight:600;color:var(--c-accent);margin-bottom:8px">Lịch công việc theo dự án</div>';
    h+='<div class="emp-gantt-wrap">'+empGanttHTML(e.id,{clickable:true})+'</div></div>';
  }
  if(acts.length){h+='<div style="font-size:13px;font-weight:600;color:var(--c-accent);margin-bottom:8px">Công việc đang làm</div>';acts.forEach(function(x){var info=asgnInfo(x);var stLbl=x.status==="paused"?bdg("Tạm dừng","#ef4444","rgba(239,68,68,.15)"):"";h+='<div class="li" style="padding:10px 0"><div class="row" style="gap:8px;align-items:center;margin-bottom:3px"><span style="font-size:13px;font-weight:600">'+esc(info.title)+'</span>'+stLbl+'</div>';if(asgnHandoffLine(x))h+='<div class="asgn-handoff-note">'+asgnHandoffLine(x)+'</div>';if(x.pauseNote&&x.status==="paused")h+='<div class="asgn-handoff-note">'+esc(x.pauseNote)+'</div>';if(info.cust||info.contact)h+='<div style="font-size:12px;color:var(--c-muted2)">'+esc(info.cust)+(info.cust&&info.contact?" · ":"")+(info.contact?"☎ "+esc(info.contact):"")+'</div>';h+='<div class="row" style="justify-content:space-between;margin-top:4px;align-items:center"><span style="font-family:monospace;font-size:11px;color:var(--c-muted4)">'+dFmtG(x.startDate)+(x.endDate?" → "+dFmtG(x.endDate):"")+' · '+x.prog+'%</span><div class="row" style="gap:8px">'+(x.status==="paused"?btn("btn-accent btn-sm","Quay lại","A.resumeAsgn('"+x.id+"')"):"")+'</div></div></div>';});}
  if(canViewSensitive()||canViewAttCompany()||isMe)h+=attMonthlyReportHTML(e.id);
  h+='</div>';return h}

function vEmp(){
  if(!canViewEmpTab())return"";
  var h='<div class="row" style="justify-content:space-between;margin-bottom:16px;flex-wrap:wrap;gap:8px"><h2 style="font-size:20px;font-weight:700">Nhân sự</h2><div class="row" style="gap:8px;flex-wrap:wrap">'+(canManageStaff()?btn("btn-accent","+ Thêm nhân sự","A.oe()"):"")+'</div></div>';
  h+='<div class="emp-cards-flow">';
  var list=staffEmp().slice().sort(function(a,b){
    var ao=isOfficeStaffEmp(a)?1:0;
    var bo=isOfficeStaffEmp(b)?1:0;
    if(ao!==bo)return ao-bo;
    if(ao){
      var ga=EMP_GRP_TAIL.indexOf(a.group||""),gb=EMP_GRP_TAIL.indexOf(b.group||"");
      if(ga<0)ga=99;if(gb<0)gb=99;
      if(ga!==gb)return ga-gb;
    }
    var ja=empJobCnt(a.id),jb=empJobCnt(b.id);
    if(ja!==jb)return ja-jb;
    return (a.name||"").localeCompare(b.name||"","vi");
  });
  list.forEach(function(e){var g=e.group||"",col=groupColor(g),el=eLoc(e),nc=empNameColor(e),jc=empJobCnt(e.id),onLeave=isEmpOnLeave(e);
    var attS="";
    if(onLeave){
      attS='<span style="font-size:10px;font-weight:700;color:#f87171">'+esc(empLeaveLabel(e))+'</span>';
    }else if(canViewSensitive()&&!isOfficeStaffEmp(e)){
      var ar=attRecordsForDay(e.id,td()), isW=ar.length&&ar[ar.length-1].type==="in";
      attS='<span style="font-size:10px;font-weight:600;color:'+(isW?"#4ade80":"#f87171")+'">● '+(isW?"Đang làm":"Đang nghỉ")+'</span>';
    }
    h+='<div class="card card-p emp-card'+(onLeave?" emp-card-leave":"")+'" style="border-left:3px solid '+(onLeave?"#94a3b8":col)+(onLeave?";opacity:.72":"")+'"><div class="emp-card-grp">'+bdg(g,col,col+"22")+'<span class="emp-card-stars">'+strs(e.skill)+'</span></div>'+empSwipeRow(e.id,'<div class="emp-card-namebar" onclick="'+empNamebarClick(e.id)+'"><span class="spec-name" style="color:'+(onLeave?"#94a3b8":nc)+'">'+esc(e.name)+'</span>'+attS+'<span class="emp-card-jobcnt">'+jc+' việc</span></div>')+'<div class="emp-card-loc" title="'+esc(el.src)+'">📍 '+esc(el.src)+'</div><div class="emp-card-tasks">'+empCardTasksHTML(e)+'</div></div>';
  });
  h+='</div>';return h
}
var mapInstance = null;
/** Màu chấm Sơ đồ theo đội: xanh = HCM, cam = Tỉnh (không trộn thành 1 màu). */
var MAP_ORG_COL_HCM = "#10b981";
var MAP_ORG_COL_TINH = "#f97316";
function empMapOrgFlags(e){
  var ids = empOrgIds(e).map(function(id){return id==="saree"?"cong-trinh":id;});
  var hasHcm = ids.indexOf("nha-may")>=0;
  var hasTinh = ids.indexOf("cong-trinh")>=0;
  if(!hasHcm && !hasTinh){
    if(currentOrgId()==="nha-may")hasHcm=true; else hasTinh=true;
  }
  return {hasHcm:hasHcm, hasTinh:hasTinh, both:hasHcm&&hasTinh};
}
/** Chấm đơn màu hoặc nửa xanh / nửa cam (cả 2 đội) — rõ trên mobile. */
function empMapMarkerHtml(flags, isLeave){
  var border = isLeave ? "#ef4444" : "#fff";
  var shadow = "0 1px 3px rgba(0,0,0,0.5)";
  if(flags.both){
    return '<div style="width:14px;height:14px;border-radius:50%;overflow:hidden;border:1.5px solid '+border+';box-shadow:'+shadow+';display:flex;flex-direction:row" title="Cả 2 đội">'
      +'<span style="display:block;width:50%;height:100%;background:'+MAP_ORG_COL_HCM+'"></span>'
      +'<span style="display:block;width:50%;height:100%;background:'+MAP_ORG_COL_TINH+'"></span>'
      +'</div>';
  }
  var bg = flags.hasHcm ? MAP_ORG_COL_HCM : MAP_ORG_COL_TINH;
  return '<div style="width:12px;height:12px;border-radius:50%;border:1.5px solid '+border+';box-shadow:'+shadow+';background:'+bg+'"></div>';
}
function vMap(){
  var h='<div class="row" style="justify-content:space-between;margin-bottom:16px;flex-wrap:wrap;gap:8px"><h2 style="font-size:20px;font-weight:700">Sơ đồ vị trí</h2><div class="row" style="gap:8px"><button class="btn" onclick="A.mapRefresh()">Làm mới</button></div></div>';
  h+='<div class="row" style="gap:14px;flex-wrap:wrap;margin-bottom:10px;font-size:12px;color:var(--c-muted)">';
  h+='<span class="row" style="gap:6px;align-items:center"><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:'+MAP_ORG_COL_HCM+';border:1px solid #fff;box-shadow:0 0 0 1px rgba(0,0,0,.15)"></span> Công trình HCM</span>';
  h+='<span class="row" style="gap:6px;align-items:center"><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:'+MAP_ORG_COL_TINH+';border:1px solid #fff;box-shadow:0 0 0 1px rgba(0,0,0,.15)"></span> Công trình tỉnh</span>';
  h+='<span class="row" style="gap:6px;align-items:center"><span style="display:inline-flex;width:12px;height:12px;border-radius:50%;overflow:hidden;border:1px solid #fff;box-shadow:0 0 0 1px rgba(0,0,0,.15)"><span style="width:50%;background:'+MAP_ORG_COL_HCM+'"></span><span style="width:50%;background:'+MAP_ORG_COL_TINH+'"></span></span> Cả 2 đội</span>';
  h+='</div>';
  h+='<div id="map-container" style="width: 100%; height: calc(100vh - 160px); min-height: 500px; border-radius: 12px; overflow: hidden; background: #e5e5e5; z-index: 1; position: relative; border: 1px solid var(--c-border);"></div>';
  setTimeout(function(){ensureLeaflet().then(function(){initMapLeaflet();});}, 50);
  return h;
}
var _leafletPromise=null;
function ensureLeaflet(){
  if(typeof L!=="undefined"&&L&&L.map)return Promise.resolve(L);
  if(_leafletPromise)return _leafletPromise;
  _leafletPromise=new Promise(function(resolve,reject){
    var cssId="leaflet-css";
    if(!document.getElementById(cssId)){
      var link=document.createElement("link");
      link.id=cssId;
      link.rel="stylesheet";
      link.href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
      link.integrity="sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=";
      link.crossOrigin="";
      document.head.appendChild(link);
    }
    var s=document.createElement("script");
    s.src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
    s.integrity="sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=";
    s.crossOrigin="";
    s.onload=function(){resolve(L);};
    s.onerror=function(){_leafletPromise=null;reject(new Error("Không tải được Leaflet"));};
    document.head.appendChild(s);
  });
  return _leafletPromise;
}
function initMapLeaflet(force) {
  var el = document.getElementById("map-container");
  if(!el) return;
  if(typeof L==="undefined"||!L||!L.map){
    ensureLeaflet().then(function(){initMapLeaflet(force);}).catch(function(){
      el.innerHTML='<div style="padding:20px;color:#b91c1c">Không tải được bản đồ. Kiểm tra mạng rồi bấm Làm mới.</div>';
    });
    return;
  }
  if(mapInstance) {
    mapInstance.remove();
    mapInstance = null;
  }
  mapInstance = L.map('map-container').setView([10.762622, 106.660172], 12);
  L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; OpenStreetMap',
    maxZoom: 19
  }).addTo(mapInstance);

  var bounds = [];
  var factorySvg = '<svg viewBox="0 0 24 24" style="width:28px;height:28px;fill:#3b82f6;stroke:white;stroke-width:1.5;filter:drop-shadow(0 2px 4px rgba(0,0,0,0.5))"><path d="M2 22 L2 10 L8 6 L8 12 L14 8 L14 14 L20 10 L20 22 Z"/><rect x="4" y="14" width="2" height="3" fill="white"/><rect x="10" y="16" width="2" height="3" fill="white"/><rect x="16" y="14" width="2" height="3" fill="white"/></svg>';
  var custIcon = L.divIcon({className: 'custom-div-icon', html: factorySvg, iconSize: [28, 28], iconAnchor: [14, 14]});

  S.cust.forEach(function(c){
    var la = c.lat, ln = c.lng;
    if(la==null && PM[c.province]) { la = PM[c.province].lat; ln = PM[c.province].lng; }
    if(la!=null) {
      bounds.push([la, ln]);
      var marker = L.marker([la, ln], {icon: custIcon, zIndexOffset: 50}).addTo(mapInstance);
      marker.bindPopup("<b style='color:#000'>Khách hàng:</b> <span style='color:#000'>" + esc(custDisplayName(c)) + "</span>" + (custFullName(c)&&custFullName(c)!==custDisplayName(c) ? "<br><span style='color:#333;font-size:12px'>" + esc(custFullName(c)) + "</span>" : "") + (c.phone ? "<br><span style='color:#000'>ĐT: " + esc(c.phone) + "</span>" : "") + "<br><span style='color:#000'>Địa chỉ: " + esc(c.address||c.province) + "</span>");
    }
  });

  var acts = S.asgn.filter(function(a){return a.status==="active"||a.status==="paused"});
  var locCounts = {};
  
  fieldEmp().forEach(function(e){
    var el = eLoc(e);
    if(el && el.loc && el.loc.lat!=null) {
      bounds.push([el.loc.lat, el.loc.lng]);
      var isWorking = acts.some(function(a){return a.empId===e.id});
      var isLeave = isEmpOnLeave(e);
      var orgFlags = empMapOrgFlags(e);

      var statusText = "<b style='color:#10b981'>Đang rảnh</b>";
      if (isLeave) { statusText = "<b style='color:#ef4444'>"+esc(empLeaveLabel(e)||"Đang nghỉ phép")+"</b>"; }
      else if (isWorking) { statusText = "<b style='color:#f97316'>Đang làm việc</b>"; }

      var locKey = el.loc.lat.toFixed(4) + "_" + el.loc.lng.toFixed(4);
      var idx = locCounts[locKey] || 0;
      locCounts[locKey] = idx + 1;
      
      var dx = 0, dy = 0, r = 18, a = 0;
      if (idx < 8) { a = idx * ((Math.PI * 2) / 8); } 
      else if (idx < 20) { r = 26; a = (idx - 8) * ((Math.PI * 2) / 12); } 
      else { r = 34; a = (idx - 20) * ((Math.PI * 2) / 16); }
      dx = Math.cos(a) * r; dy = Math.sin(a) * r;

      var sz = orgFlags.both ? 14 : 12;
      var half = sz / 2;
      var iconHtml = empMapMarkerHtml(orgFlags, isLeave);
      var icon = L.divIcon({className: 'custom-div-icon', html: iconHtml, iconSize: [sz, sz], iconAnchor: [half - dx, half - dy], popupAnchor: [0, -half + dy]});

      var marker = L.marker([el.loc.lat, el.loc.lng], {icon: icon, zIndexOffset: 100}).addTo(mapInstance);
      var orgLbl = empOrgIds(e).map(orgLabelOf).join(" · ");
      var tooltip = "<b style='color:#000'>" + esc(e.name) + "</b> <span style='color:#666'>(" + esc(e.group) + ")</span>";
      tooltip += "<br><span style='color:#000'>Đội: </span><span style='color:#000'>" + esc(orgLbl) + "</span>";
      tooltip += "<br><span style='color:#000'>Tình trạng: </span>" + statusText;
      tooltip += "<br><span style='color:#000'>Vị trí: </span><span style='color:#000'>" + esc(el.src) + "</span>";
      marker.bindPopup(tooltip);
    }
  });

  if(bounds.length > 0) {
    mapInstance.fitBounds(bounds, {padding: [50, 50]});
  }
}
function vCust(){
  if(!canViewCust())return"";
  var h='<div class="row" style="justify-content:space-between;margin-bottom:6px"><h2 style="font-size:20px;font-weight:700">Khách hàng</h2>'+(canManageCust()?btn("btn-accent","+ Thêm khách hàng","A.oc()"):"")+'</div>';
  if(!S.cust.length)h+='<div class="card card-p" style="color:var(--c-muted)">Chưa có khách hàng.'+(canManageCust()?' Bấm "+ Thêm khách hàng".':"")+'</div>';
  h+='<div class="cards-eq-grid" style="margin-top:12px">';
  S.cust.slice().sort(function(a,b){return custDisplayName(a).localeCompare(custDisplayName(b),"vi")}).forEach(function(c){var hc=c.lat!=null&&c.lng!=null,pc=custProjs(c).length,disp=custDisplayName(c),full=custFullName(c);
    var nameBar='<div class="list-namebar spec-name" style="cursor:pointer" onclick="A.custDet(\''+c.id+'\')">'+esc(disp)+'</div>';
    h+='<div class="card card-p">'+(canManageCust()?listSwipeRow(c.id,nameBar,"A.oc('"+c.id+"')"):nameBar)+(full&&full!==disp?'<div style="font-size:12px;color:var(--c-muted3);margin-bottom:4px">'+esc(full)+'</div>':"")+(c.address?'<div style="font-size:13px;color:var(--c-muted2);margin-bottom:6px">'+esc(c.address)+'</div>':"")+
    '<div style="font-family:monospace;font-size:12px;margin-bottom:8px;color:'+(hc?"#4ade80":"#fbbf24")+'">'+(hc?"📍 "+c.lat.toFixed(4)+", "+c.lng.toFixed(4):"⚠ chưa có toạ độ"+(c.province?" · "+esc(c.province):""))+'</div>'+
    (c.contact?'<div style="font-size:13px;color:var(--c-muted2);margin-bottom:8px">☎ '+esc(c.contact)+'</div>':"")+
    (pc?'<div style="font-size:12px;color:var(--c-muted4);margin-bottom:10px">'+pc+' dự án</div>':"")+
    '<div class="row" style="gap:6px;margin-top:auto">'+(hc?btn("btn-ghost btn-sm","Xem Maps","A.gm("+c.lat+","+c.lng+")"):"")+btn("btn-ghost btn-sm","Chi tiết","A.custDet('"+c.id+"')")+'</div></div>';});
  h+='</div>';return h}

function vCustDet(id){
  if(!canViewCust())return"";
  var c=cById(id);
  if(!c)return btn("btn-ghost","← Quay lại","A.custBack()")+'<div class="card card-p" style="margin-top:12px;color:var(--c-muted)">Không tìm thấy khách hàng.</div>';
  var hc=c.lat!=null&&c.lng!=null,projs=custProjs(c),disp=custDisplayName(c),full=custFullName(c);
  var h='<div class="row proj-toolbar" style="justify-content:space-between;align-items:stretch;margin-bottom:16px">'+actBtn("btn-ghost","← Quay lại","custBack")+(canManageCust()?btn("btn-ghost","Sửa","A.oc('"+c.id+"')"):"")+'</div>';
  h+='<div class="card card-p"><h2 style="font-size:22px;font-weight:700;margin-bottom:6px">'+esc(disp)+'</h2>';
  if(full&&full!==disp)h+='<div style="font-size:13px;color:var(--c-muted2);margin-bottom:12px">'+esc(full)+'</div>';
  h+='<div class="grid2" style="gap:14px;margin-bottom:14px">';
  h+='<div><div style="font-size:12px;color:var(--c-muted);margin-bottom:4px">Tên gọi ngắn</div><div style="font-size:14px">'+(c.shortName?esc(c.shortName):"—")+'</div></div>';
  h+='<div><div style="font-size:12px;color:var(--c-muted);margin-bottom:4px">Tên chính quy</div><div style="font-size:14px">'+(full?esc(full):"—")+'</div></div>';
  h+='<div><div style="font-size:12px;color:var(--c-muted);margin-bottom:4px">Địa chỉ</div><div style="font-size:14px">'+(c.address?esc(c.address):"—")+'</div></div>';
  h+='<div><div style="font-size:12px;color:var(--c-muted);margin-bottom:4px">Tỉnh/thành</div><div style="font-size:14px">'+(c.province?esc(c.province):"—")+'</div></div>';
  h+='<div><div style="font-size:12px;color:var(--c-muted);margin-bottom:4px">Người liên hệ</div><div style="font-size:14px">'+(c.contact?"☎ "+esc(c.contact):"—")+'</div></div>';
  h+='<div><div style="font-size:12px;color:var(--c-muted);margin-bottom:4px">Toạ độ</div><div style="font-family:monospace;font-size:13px;color:'+(hc?"#4ade80":"#fbbf24")+'">'+(hc?"📍 "+c.lat.toFixed(4)+", "+c.lng.toFixed(4):"Chưa có toạ độ")+'</div></div>';
  h+='</div>';
  if(c.note)h+='<div style="margin-bottom:14px"><div style="font-size:12px;color:var(--c-muted);margin-bottom:4px">Ghi chú</div><div style="font-size:14px;color:rgba(200,220,255,.8)">'+esc(c.note)+'</div></div>';
  if(hc)h+='<div class="row" style="gap:8px;margin-bottom:4px;flex-wrap:wrap">'+btn("btn-ghost btn-sm","Xem Google Maps","A.gm("+c.lat+","+c.lng+")")+'</div>';
  h+='</div>';
  h+='<div class="card card-p" style="margin-top:14px"><h3 style="font-size:16px;font-weight:700;color:var(--c-accent);margin-bottom:12px">Dự án đã thực hiện ('+projs.length+')</h3>';
  if(!projs.length)h+='<div style="font-size:14px;color:var(--c-muted)">Chưa có dự án nào liên kết với khách hàng này.</div>';
  else{
    h+='<div style="display:grid;gap:10px">';
    projs.slice().sort(projListCmp).forEach(function(p){
      var tl=projTL(p),ps=projPlanStatus(p),work=custProjWorkLbl(p);
      h+='<div class="li" style="padding:12px 14px;cursor:pointer;border-radius:12px" onclick="A.projDet(\''+p.id+'\')">';
      h+='<div class="row" style="justify-content:space-between;align-items:flex-start;gap:10px;margin-bottom:6px;flex-wrap:wrap">';
      h+='<div style="font-size:14px;font-weight:600">'+esc(p.name)+'</div>'+bdg(ps.label,ps.c,ps.c+"18");
      h+='</div>';
      if(work)h+='<div style="font-size:12px;color:var(--c-muted2);margin-bottom:4px">'+esc(work)+'</div>';
      h+='<div style="font-family:monospace;font-size:12px;color:var(--c-muted4)">'+dFmtG(tl.start)+' → '+dFmtG(tl.end)+' · '+tl.prog+'%</div>';
      h+='</div>';
    });
    h+='</div>';
  }
  h+='</div>';
  return h;
}

function vProjDet(id){
  var p=pById(id);
  if(!p)return btn("btn-ghost","← Quay lại","A.projBack()")+'<div class="card card-p" style="margin-top:12px;color:var(--c-muted)">Không tìm thấy dự án.</div>';
  var locked=isProjLocked(p);
  var PRI={high:["Ưu tiên cao","#f87171"],normal:["Bình thường","rgba(160,195,255,.6)"],low:["Thấp","#4ade80"]};
  var cn=p.custId?(cById(p.custId)?custDisplayName(cById(p.custId)):""):(p.customer||"");
  var c=p.custId?cById(p.custId):null,pl=pLoc(p),tl=projTL(p);
  var acts=S.asgn.filter(function(a){
    if(a.projId!==p.id)return false;
    if(locked)return a.status==="active"||a.status==="paused"||a.status==="done"||a.status==="queued";
    return a.status==="active"||a.status==="paused"||a.status==="queued";
  });
  var pr=PRI[p.priority]||PRI.normal,ps=projPlanStatus(p);
  var actions="";
  if(!locked){
    if(canGiao())actions+=actBtn("btn-primary","Giao việc","giaoOpen",p.id);
    if(canOperate())actions+=btn("btn-ghost","Sửa","A.op('"+p.id+"')");
    if(canConfirmProjDone(p))actions+=btn("btn-accent btn-sm","Hoàn thành","A.completeProj('"+p.id+"')");
  }else if(canReopenProj(p)){
    actions+=btn("btn-accent","Mở lại để làm bổ sung","A.reopenProj('"+p.id+"')");
  }
  var h='<div class="row proj-toolbar" style="justify-content:space-between;align-items:stretch;margin-bottom:16px">'+actBtn("btn-ghost","← Quay lại","projBack")+'<div class="row" style="gap:8px;align-items:stretch">'+actions+'</div></div>';
  h+='<div class="card card-p"><h2 style="font-size:22px;font-weight:700;margin-bottom:10px">'+esc(p.name)+'</h2>';
  h+='<div class="row" style="gap:8px;margin-bottom:16px;flex-wrap:wrap">'+bdg(p.group,groupColor(p.group))+bdg(p.type==="repair"?"Sửa chữa":"Dự án mới",p.type==="repair"?"#fbbf24":"#38bdf8")+bdg(ps.label,ps.c,ps.c+"18")+bdg(pr[0],pr[1])+(locked?bdg("Đã khoá","#94a3b8","rgba(148,163,184,.15)"):"")+'</div>';
  if(ps.key==="await_close"){
    h+='<div style="margin-bottom:14px;padding:10px 12px;border-radius:10px;background:rgba(56,189,248,.08);border:1px solid rgba(56,189,248,.28);font-size:13px;color:#7dd3fc;line-height:1.45">Mọi thành viên đã xong <b>phần việc của họ</b> — dự án vẫn <b>chưa hoàn thành</b> cho đến khi giám đốc hoặc trưởng nhóm bấm <b>Xác nhận hoàn thành dự án</b>.</div>';
  }
  if(canConfirmProjDone(p)){
    h+='<div style="margin-bottom:14px;padding:10px 12px;border-radius:10px;background:rgba(74,222,128,.08);border:1px solid rgba(74,222,128,.28);font-size:13px;color:var(--c-muted2);line-height:1.45">Nút <b style="color:#4ade80">Xác nhận hoàn thành dự án</b> mới chuyển dự án sang mục Hoàn thành và khoá. Nhân viên (kể cả chỉ huy trưởng) hoàn tất phần việc chỉ giải phóng họ — <b>không</b> đóng cả dự án. Giám đốc vẫn có thể mở lại sau nếu phát sinh cần làm thêm.</div>';
  }else if(locked){
    if(canReopenProj(p)){
      h+='<div style="margin-bottom:14px;padding:10px 12px;border-radius:10px;background:rgba(251,191,36,.1);border:1px solid rgba(251,191,36,.4);font-size:13px;color:#fde68a;line-height:1.45">Dự án đã hoàn thành và khoá. Giám đốc có thể bấm <b>Mở lại để làm bổ sung</b> (hư hỏng / khách yêu cầu làm thêm): thêm hạng mục mới hoặc hạ tiến độ (VD 80–90%) để làm tiếp.</div>';
    }else{
      h+='<div style="margin-bottom:14px;padding:10px 12px;border-radius:10px;background:rgba(148,163,184,.1);border:1px solid rgba(148,163,184,.35);font-size:13px;color:#cbd5e1;line-height:1.45">Dự án đã được giám đốc/trưởng nhóm xác nhận hoàn thành và <b>khoá</b> — chỉ xem tham khảo. Chỉ giám đốc được mở lại khi cần làm bổ sung.</div>';
    }
  }
  h+='<div style="margin-bottom:16px"><div style="font-size:12px;color:var(--c-muted);margin-bottom:5px">Tiến độ</div><div class="row" style="gap:10px;align-items:center"><div style="flex:1;height:9px;border-radius:999px;background:rgba(255,255,255,.08);overflow:hidden"><div style="height:100%;width:'+tl.prog+'%;background:linear-gradient(90deg,#38bdf8,#60a5fa);border-radius:999px"></div></div><span style="font-family:monospace;font-weight:700;color:#38bdf8">'+tl.prog+'%</span></div></div>';
  h+='<div class="grid2" style="gap:14px;margin-bottom:14px"><div><div style="font-size:12px;color:var(--c-muted);margin-bottom:4px">Khách hàng</div><div style="font-size:14px">'+(cn?esc(cn):"—")+'</div></div><div><div style="font-size:12px;color:var(--c-muted);margin-bottom:4px">Địa điểm</div><div style="font-size:14px">📍 '+esc(pl?pl.name:p.province)+(c&&c.lat!=null?' <span style="font-family:monospace;font-size:12px;color:var(--c-muted4)">('+c.lat.toFixed(4)+", "+c.lng.toFixed(4)+')</span>':"")+'</div></div><div><div style="font-size:12px;color:var(--c-muted);margin-bottom:4px">Thời gian</div><div style="font-family:monospace;font-size:13px">'+dFmtG(tl.start)+' → '+dFmtG(tl.end)+(p.durationDays?' · '+p.durationDays+' ngày':"")+'</div></div><div><div style="font-size:12px;color:var(--c-muted);margin-bottom:4px">Đội tham gia</div><div style="font-family:monospace;font-size:13px">'+projPartIds(p).length+' người'+(p.toTruongId||p.vatTuId?" · đã phân chức vụ":"")+'</div></div></div>';
  if(p.note)h+='<div style="margin-bottom:14px"><div style="font-size:12px;color:var(--c-muted);margin-bottom:4px">Mô tả</div><div style="font-size:14px;color:rgba(200,220,255,.8)">'+esc(p.note)+'</div></div>';
  h+=projWorkItemsDetailHTML(p);
  h+=projRoleEditCardHTML(p);
  h+='<div style="font-size:13px;font-weight:600;color:var(--c-accent);margin-bottom:8px;margin-top:4px">Đội dự án (thi công)</div>';
  h+=projTeamListHTML(p,{link:canViewEmpTab(),acts:acts});
  h+='</div>';
  h+='<div class="card card-p" style="margin-top:14px">'+renderProjTimeline(p.id)+'</div>';
  return h}

function vGiaoViec(id){
  var p=pById(id);
  if(!p)return btn("btn-ghost","← Quay lại","A.giaoBack()")+'<div class="card card-p" style="margin-top:12px;color:var(--c-muted)">Không tìm thấy dự án.</div>';
  var dates=asgnDates(p),pl=pLoc(p),assignedJobs=projActiveAsgnEmpIds(p),eff=giaoEffectivePartIds(p);
  refreshAllGiaoWarns();
  var h='<div class="row proj-toolbar" style="justify-content:space-between;align-items:stretch;margin-bottom:16px">'+actBtn("btn-ghost","← Quay lại","giaoBack")+'<div class="row" style="gap:8px;align-items:stretch">'+actBtn("btn-primary","Lưu giao việc","giaoSave")+'</div></div>';
  h+='<div class="card card-p" style="margin-bottom:16px"><h2 style="font-size:18px;font-weight:700;margin-bottom:6px">Giao việc — '+esc(p.name)+'</h2>';
  h+='<div style="font-size:13px;color:var(--c-muted2);margin-bottom:12px"><span style="font-family:monospace;color:#38bdf8">'+dFmtG(dates.start)+' → '+dFmtG(dates.end)+'</span>';
  if(pl)h+=' · 📍 '+esc(pl.name);
  h+='</div>';
  h+=giaoAlertsSummaryHTML(p);
  var defArr=new Date();defArr.setHours(defArr.getHours()+2,0,0,0);
  var arriveVal=(S.giaoArriveAt!=null&&S.giaoArriveAt!=="")?S.giaoArriveAt:(defArr.getFullYear()+"-"+pad2(defArr.getMonth()+1)+"-"+pad2(defArr.getDate())+"T"+pad2(defArr.getHours())+":"+pad2(defArr.getMinutes()));
  h+=fld("Giờ có mặt tại điểm (người mới giao)",'<input type="datetime-local" id="giao-arrive" value="'+esc(arriveVal)+'" onchange="A.giaoArriveChange()">');
  h+=projGiaoMembersHTML(p);
  h+='</div>';
  h+=teamRolePickBlock("Bố trí chức vụ",eff);
  fieldGroups().forEach(function(g){
    var list=fieldEmp(S.emp.filter(function(e){return e.group===g})).sort(function(a,b){return (a.name||"").localeCompare(b.name||"","vi")});
    var isProjGrp=g===p.group;
    h+='<div class="giao-grp'+(isProjGrp?" giao-grp-main":"")+'"><div class="giao-grp-hd"><div class="gdot" style="background:'+groupColor(g)+';color:'+groupColor(g)+'"></div><span style="font-size:14px;font-weight:700;color:var(--c-accent2)">'+esc(g)+(isProjGrp?' <span style="color:#fbbf24;font-size:11px">· tổ dự án</span>':"")+'</span><span style="font-size:12px;color:var(--c-muted4)">('+list.length+')</span></div>';
    if(!list.length)h+='<div style="font-size:13px;color:var(--c-muted3);padding:4px 0 8px 4px">Chưa có nhân sự</div>';
    list.forEach(function(e){
      // Chỉ khoá khi đã có phân công active/paused — người chỉ có trong đội (Chỉnh đội) vẫn giao được
      var dis=assignedJobs.indexOf(e.id)>=0||isEmpOnLeave(e);
      var extra=!dis&&S.giaoPick[e.id]?giaoPickExtraHTML(e.id,p):"";
      h+=giaoEmpRow(e,{sel:!!S.giaoPick[e.id],dis:dis,extra:extra});
    });
    h+='</div>';
  });
  return h;
}

function vGoiYReq(id){
  var p=pById(id);
  if(!p)return actBtn("btn-ghost","← Quay lại","giaoBack")+'<div class="card card-p" style="margin-top:12px;color:var(--c-muted)">Không tìm thấy dự án.</div>';
  var pl=pLoc(p),req=S.goiYReq||defaultGoiyReq(p);
  var h='<div class="row proj-toolbar" style="justify-content:space-between;align-items:stretch;margin-bottom:16px">'+actBtn("btn-ghost","← Quay lại","giaoBack")+actBtn("btn-accent","Tính gợi ý","goiYCalc")+'</div>';
  h+='<div class="card card-p" style="margin-bottom:16px"><h2 style="font-size:18px;font-weight:700;margin-bottom:6px">★ Gợi ý — '+esc(p.name)+'</h2>';
  h+='<div style="font-size:13px;color:var(--c-muted2)">Chọn ngành cần cho dự án, nhập số lượng và kỹ năng tối thiểu. Ngành không cần thì bỏ tick.</div>';
  if(pl)h+='<div style="font-size:12px;color:var(--c-muted);margin-top:6px">📍 '+esc(pl.name)+' · Trọng số: gần <b>'+S.cfg.wP+'</b> · rảnh <b>'+S.cfg.wA+'</b> · tay nghề <b>'+S.cfg.wS+'</b></div>';
  h+='</div>';
  fieldGroups().forEach(function(g,i){var r=req[g]||{on:false,qty:1,skill:3},cnt=fieldEmp(S.emp.filter(function(e){return e.group===g})).length;
    h+='<div class="goiy-req-row'+(r.on?" on":"")+'"><div class="row" style="gap:10px;align-items:center"><input type="checkbox" class="giao-chk" data-act="goiYReqTog" data-gi="'+i+'"'+(r.on?" checked":"")+'><div class="gdot" style="background:'+groupColor(g)+';color:'+groupColor(g)+'"></div><span style="font-size:14px;font-weight:600;flex:1">'+esc(g)+'</span><span style="font-size:12px;color:var(--c-muted4)">'+cnt+' người</span></div>';
    if(r.on)h+='<div class="goiy-req-fields"><div><div class="lab">Số lượng cần</div><input type="number" id="gyq_'+i+'" min="1" max="99" value="'+(r.qty||1)+'"></div><div><div class="lab">Kỹ năng tối thiểu</div><select id="gys_'+i+'">'+[1,2,3,4,5].map(function(n){return'<option value="'+n+'" '+(n===(r.skill||3)?"selected":"")+'>'+n+' ★</option>'}).join("")+'</select></div></div>';
    h+='</div>';});
  return h;
}

function vGoiYResult(id){
  var p=pById(id);
  if(!p)return actBtn("btn-ghost","← Quay lại","giaoBack")+'<div class="card card-p" style="margin-top:12px;color:var(--c-muted)">Không tìm thấy dự án.</div>';
  var dates=asgnDates(p),req=S.goiYReq||{},hasReq=false;
  getGroups().forEach(function(g){if(req[g]&&req[g].on&&req[g].qty>0)hasReq=true});
  var h='<div class="row proj-toolbar" style="justify-content:space-between;align-items:stretch;margin-bottom:16px">'+actBtn("btn-ghost","← Yêu cầu","giaoBack")+actBtn("btn-primary","Lưu giao việc","giaoSave")+'</div>';
  h+='<div class="card card-p" style="margin-bottom:16px"><h2 style="font-size:18px;font-weight:700;margin-bottom:6px">Kết quả gợi ý — '+esc(p.name)+'</h2>';
  h+='<div style="font-size:13px;color:var(--c-muted2)">Xếp theo điểm (rảnh · gần · tay nghề). Đã tick sẵn đủ số lượng mỗi ngành — bạn có thể đổi trước khi lưu.</div>';
  h+='<div style="font-size:12px;color:var(--c-muted);margin-top:6px">Thời gian: <span style="font-family:monospace;color:#38bdf8">'+dFmtG(dates.start)+' → '+dFmtG(dates.end)+'</span></div>'+teamRolePickHTML()+'</div>';
  if(!hasReq)return h+'<div class="card card-p" style="color:var(--c-muted)">Chưa chọn ngành nào. Quay lại và tick ít nhất một ngành.</div>';
  getGroups().forEach(function(g){var r=req[g];if(!r||!r.on||r.qty<1)return;
    var ranked=recoGrp(p,g,r.skill);
    h+='<div class="giao-grp"><div class="giao-grp-hd"><div class="gdot" style="background:'+groupColor(g)+';color:'+groupColor(g)+'"></div><span style="font-size:14px;font-weight:700;color:var(--c-accent2)">'+esc(g)+'</span><span style="font-size:12px;color:var(--c-muted4)">Cần '+r.qty+' · '+ranked.length+' ứng viên · tối thiểu '+r.skill+'★</span></div>';
    if(!ranked.length)h+='<div style="font-size:13px;color:var(--c-muted3);padding:4px 0 8px 4px">Không có nhân sự đạt yêu cầu kỹ năng.</div>';
    ranked.forEach(function(x,j){var e=x.emp,st=ST[e.status],sel=!!S.giaoPick[e.id],auto=sel&&j<r.qty;
      h+='<div class="giao-row'+(sel?" sel":"")+(auto?" goiy-pick":"")+'" data-act="giaoTog" data-id="'+esc(e.id)+'"><div class="goiy-score">'+(Math.round(x.sc))+'</div><div class="giao-row-body"><div class="row" style="gap:8px;align-items:center;margin-bottom:2px"><span class="giao-row-name">'+esc(e.name)+'</span>'+bdg(e.group,groupColor(e.group))+bdg(st.l,st.c,st.s)+(auto?bdg("Gợi ý","#4ade80","rgba(74,222,128,.15)"):"")+'</div>'+busyBar(x.busy,true)+'<div style="font-family:monospace;font-size:11px;color:var(--c-muted4);margin-top:4px">'+(x.dist==null?"? km":x.dist+" km")+' · '+x.act+' việc · '+e.skill+'★ · '+x.src+'</div></div><input type="checkbox" class="giao-chk"'+(sel?" checked":"")+' data-act="giaoTog" data-id="'+esc(e.id)+'" onclick="event.stopPropagation()"></div>';
    });
    h+='</div>';});
  return h;
}

function vTeamEdit(id){
  var p=pById(id);
  if(!p)return btn("btn-ghost","← Quay lại","A.giaoBack()")+'<div class="card card-p" style="margin-top:12px;color:var(--c-muted)">Không tìm thấy dự án.</div>';
  var items=normWorkItems(p);
  var picked=curGiaoPartIds().length;
  var h='<div class="row proj-toolbar" style="justify-content:space-between;align-items:stretch;margin-bottom:12px">'+actBtn("btn-ghost","← Quay lại","giaoBack")+actBtn("btn-primary","Lưu giao việc","teamSave")+'</div>';
  h+='<div class="card card-p giao-head" style="margin-bottom:12px">';
  h+='<div class="giao-head-top"><h2>Giao việc — '+esc(p.name)+'</h2>';
  h+='<span class="giao-head-count">'+(picked?picked+" đã chọn":"chưa chọn NV")+'</span></div>';
  h+='<p class="giao-head-hint">Mặc định: <b>gán hết hạng mục · chia đều</b> cho cả đội. Bỏ tick hạng mục hoặc gõ % nếu muốn chỉnh. Ô trống = app tự chia; số gõ tay mới bị khóa. <b>Lưu giao việc</b> để hoàn tất.</p>';
  if(items.length){
    h+='<div class="giao-head-items">';
    items.forEach(function(w,i){
      h+='<span class="giao-head-chip" title="'+esc(workItemLabel(w,i))+'"><b>'+(i+1)+'</b> '+esc(shortGanttText(workItemLabel(w,i),36))+'</span>';
    });
    h+='</div>';
  }else{
    h+='<div class="giao-head-warn">Chưa có hạng mục — hãy sửa dự án trước.</div>';
  }
  h+='</div>';
  h+=giaoAllocBoardHTML(p);
  h+=teamRolePickBlock("Bố trí chức vụ",curGiaoPartIds());
  h+='<div class="giao-pick-sec"><div class="giao-pick-sec-hd">Thêm / bỏ nhân viên</div>';
  fieldGroups().forEach(function(g){
    var list=fieldEmp(S.emp.filter(function(e){return e.group===g})).sort(function(a,b){
      var sa=S.giaoPick[a.id]?1:0,sb=S.giaoPick[b.id]?1:0;
      if(sa!==sb)return sb-sa;
      return (a.name||"").localeCompare(b.name||"","vi");
    });
    var isProjGrp=g===p.group;
    var selN=list.filter(function(e){return S.giaoPick[e.id]}).length;
    h+='<div class="giao-grp'+(isProjGrp?" giao-grp-main":"")+'"><div class="giao-grp-hd"><div class="gdot" style="background:'+groupColor(g)+';color:'+groupColor(g)+'"></div><span style="font-size:13px;font-weight:700;color:var(--c-accent2)">'+esc(g)+(isProjGrp?' <span style="color:#fbbf24;font-size:11px">· tổ dự án</span>':"")+'</span><span style="font-size:12px;color:var(--c-muted4)">'+selN+'/'+list.length+'</span></div>';
    if(!list.length)h+='<div style="font-size:13px;color:var(--c-muted3);padding:4px 0 8px 4px">Chưa có nhân sự</div>';
    else{
      h+='<div class="giao-pick-list">';
      list.forEach(function(e){h+=giaoEmpPickRow(e,{sel:!!S.giaoPick[e.id],dis:isEmpOnLeave(e)});});
      h+='</div>';
    }
    h+='</div>';
  });
  h+='</div>';
  return h;
}

function projDoneCmp(a,b){
  var ca=a.completedAt||a.deadline||a.startDate||"";
  var cb=b.completedAt||b.deadline||b.startDate||"";
  if(ca!==cb)return ca>cb?-1:1;
  return (a.name||"").localeCompare(b.name||"","vi");
}
function vProj(){
  var PRI={high:["Ưu tiên cao","#f87171"],normal:["Bình thường","rgba(160,195,255,.6)"],low:["Thấp","#4ade80"]};
  var view=S.projView==="done"?"done":"active";
  var activeList=S.proj.filter(function(p){return p.status!=="done"}).slice().sort(projListCmp);
  var doneList=S.proj.filter(function(p){return p.status==="done"}).slice().sort(projDoneCmp);
  var awaitN=activeList.filter(function(p){return projPlanStatus(p).key==="await_close"}).length;
  var list=view==="done"?doneList:activeList;
  var h='<div class="row" style="justify-content:space-between;margin-bottom:12px;flex-wrap:wrap;gap:10px"><h2 style="font-size:20px;font-weight:700">Dự án</h2>'+(canOperate()&&view==="active"?btn("btn-accent","+ Thêm dự án","A.op()"):"")+'</div>';
  h+='<div class="proj-view-tabs" role="tablist" aria-label="Lọc dự án">';
  h+='<button type="button" class="proj-view-tab'+(view==="active"?" on":"")+'" onclick="A.projView(\'active\')">Đang làm <span class="proj-view-n">'+activeList.length+'</span></button>';
  h+='<button type="button" class="proj-view-tab'+(view==="done"?" on":"")+'" onclick="A.projView(\'done\')">Hoàn thành <span class="proj-view-n">'+doneList.length+'</span></button>';
  h+='</div>';
  if(view==="active"){
    h+=lateAlertBannerHTML();
    if(awaitN)h+='<div style="margin-bottom:14px;padding:10px 12px;border-radius:10px;background:rgba(56,189,248,.08);border:1px solid rgba(56,189,248,.28);font-size:13px;color:#7dd3fc;line-height:1.45">Có <b>'+awaitN+'</b> dự án <b>Chờ GD/TN xác nhận</b> (NV đã xong phần việc, dự án chưa đóng). Mở Chi tiết → <b>Xác nhận hoàn thành dự án</b>.</div>';
  }else{
    h+='<div style="margin-bottom:14px;padding:10px 12px;border-radius:10px;background:rgba(148,163,184,.1);border:1px solid rgba(148,163,184,.3);font-size:13px;color:#cbd5e1;line-height:1.45">Kho dự án đã hoàn thành — <b>đã khoá</b>.'+(isDir()?' Giám đốc mở Chi tiết → <b>Mở lại để làm bổ sung</b> nếu phát sinh hư hỏng / cần làm thêm.':"")+'</div>';
  }
  if(!list.length){
    h+='<div class="card card-p" style="color:var(--c-muted)">'+(view==="done"?"Chưa có dự án hoàn thành. Chỉ khi giám đốc hoặc trưởng nhóm xác nhận hoàn thành dự án thì mới xuất hiện ở đây.":"Chưa có dự án đang làm.")+'</div>';
    return h;
  }
  h+='<div class="cards-eq-grid">';
  list.forEach(function(p){
    var cn=p.custId?(cById(p.custId)?custDisplayName(cById(p.custId)):""):(p.customer||"");
    var pr=PRI[p.priority]||PRI.normal;
    var ps=projPlanStatus(p);
    var tl=projTL(p);
    var locked=isProjLocked(p);
    var titleHtml=locked
      ?'<div class="list-namebar">'+esc(p.name)+'</div>'
      :listSwipeRow(p.id,'<div class="list-namebar">'+esc(p.name)+'</div>',"A.op('"+p.id+"')");
    h+='<div class="card card-p" style="cursor:pointer'+(ps.key==="late"?";border-color:rgba(239,68,68,.5)":"")+(locked?";opacity:.92;border-color:rgba(148,163,184,.28)":"")+'" onclick="A.projDet(\''+p.id+'\')">'
      +'<div class="proj-card-top">'+titleHtml+'</div>'
      +'<div class="proj-card-tags">'+bdg(pr[0],pr[1])+bdg(p.group,groupColor(p.group))+bdg(p.type==="repair"?"Sửa chữa":"Dự án mới",p.type==="repair"?"#fbbf24":"#38bdf8")+(locked?bdg("Khoá","#94a3b8","rgba(148,163,184,.15)"):"")+'</div>'
      +(cn?'<div class="proj-card-cust">'+esc(cn)+'</div>':"")
      +'<div class="proj-card-time">'+dFmtG(tl.start)+' → '+dFmtG(tl.end)+' · '+projDays(tl.start,tl.end)+(locked&&p.completedAt?' · xong '+dFmtG(p.completedAt):"")+'</div>'
      +projWorkItemsCardHTML(p)
      +'<div class="proj-card-foot">'+bdg(ps.label,ps.c,ps.c+"18")+'<div class="row" style="gap:6px" onclick="event.stopPropagation()">'+btn("btn-ghost btn-sm","Chi tiết","A.projDet('"+p.id+"')")+'</div></div>'
      +'</div>';
  });
  h+='</div>';return h}

function helpContextKey(){
  var t=S.tab||"dash";
  if(t==="emp"&&S.selEmp)return "emp_det";
  if(t==="proj"){
    if(S.giaoProj)return "proj_giao";
    if(S.selProjDet)return "proj_det";
    return "proj";
  }
  if(t==="cust"&&S.selCust)return "cust_det";
  if(t==="chat"&&S.chatTo)return "chat_det";
  if(t==="mywork"&&S.selMyAsgn)return "mywork_det";
  return t;
}
function helpPanelHTML(){
  var cat=window.CV3_HELP;
  var key=helpContextKey();
  var entry=(cat&&typeof cat.get==="function"?cat.get(key):null)||{title:"Hướng dẫn",controls:[],processes:[]};
  var mode=S.helpMode==="process"?"process":"annotate";
  var h='<div class="help-overlay" onmousedown="A.ovDown(event)" onclick="A.closeHelp(event)" role="dialog" aria-modal="true" aria-label="Hướng dẫn">';
  h+='<div class="help-panel" onclick="event.stopPropagation()">';
  h+='<div class="help-panel-hd"><div><div class="help-panel-title">'+esc(entry.title||"Hướng dẫn")+'</div>';
  h+='<div class="help-panel-sub">Trợ giúp theo trang đang mở</div></div>';
  h+='<button type="button" class="x-btn" onclick="A.closeHelp()" aria-label="Đóng">×</button></div>';
  h+='<div class="help-mode-tabs">';
  h+=btn("btn-ghost btn-sm"+(mode==="annotate"?" active":""),"Hướng dẫn","A.helpMode('annotate')");
  h+=btn("btn-ghost btn-sm"+(mode==="process"?" active":""),"Quy trình","A.helpMode('process')");
  h+='</div><div class="help-panel-body">';
  if(mode==="annotate"){
    if(!entry.controls||!entry.controls.length)h+='<div class="help-empty">Chưa có chú thích nút cho trang này.</div>';
    else entry.controls.forEach(function(item){
      h+='<div class="help-ctrl"><div class="help-ctrl-name">'+esc(item.name)+'</div><div class="help-ctrl-desc">'+esc(item.desc)+'</div></div>';
    });
  }else{
    if(!entry.processes||!entry.processes.length)h+='<div class="help-empty">Chưa có quy trình mô tả cho trang này.</div>';
    else entry.processes.forEach(function(proc){
      h+='<div class="help-proc"><div class="help-proc-title">'+esc(proc.title)+'</div><ol>';
      (proc.steps||[]).forEach(function(step){h+='<li>'+esc(step)+'</li>';});
      h+='</ol></div>';
    });
  }
  h+='</div></div></div>';
  return h;
}

function progCard(a){
  var e=eById(a.empId),p=pById(a.projId),info=asgnInfo(a),paused=a.status==="paused",canEdit=canOperate();
  var ps=asgnPlanStatus(a);
  var h='<div class="card card-p'+(paused?" asgn-paused":"")+(ps.key==="late"?" asgn-late":"")+'"'+(ps.key==="late"?' style="border-color:rgba(239,68,68,.5)"':"")+'><div class="row" style="justify-content:space-between;margin-bottom:8px;flex-wrap:wrap;gap:8px"><div><b style="font-size:15px">'+esc(e?e.name:"?")+'</b><span style="color:var(--c-muted);font-size:13px"> — '+esc(info.title)+(p?" · 📍"+esc(p.province):"")+'</span>'+bdg(ps.label,ps.c,ps.c+"18")+'</div><span style="font-family:monospace;font-size:12px;color:var(--c-muted3)">'+dFmtG(a.startDate)+(a.endDate?" → "+dFmtG(a.endDate):"")+'</span></div>';
  if(asgnHandoffLine(a))h+='<div class="asgn-handoff-note">'+asgnHandoffLine(a)+'</div>';
  if(a.pauseNote&&paused)h+='<div class="asgn-handoff-note">'+esc(a.pauseNote)+'</div>';
  if(info.cust||info.contact)h+='<div style="font-size:12px;color:var(--c-muted);margin-bottom:10px">'+esc(info.cust)+(info.cust&&info.contact?" · ":"")+(info.contact?"☎ "+esc(info.contact):"")+'</div>';
  if(asgnAssignerLine(a))h+='<div style="font-size:11px;color:#7dd3fc;margin-bottom:8px">'+esc(asgnAssignerLine(a))+'</div>';
  if(paused){
    h+='<div class="row" style="gap:8px;margin-bottom:8px;align-items:center"><span style="font-family:monospace;font-weight:700;color:#fbbf24">'+a.prog+'%</span><span style="font-size:12px;color:var(--c-muted4)">Tiến độ giữ nguyên khi tạm dừng</span></div>';
    if(canEdit)h+='<div class="row" style="gap:8px">'+btn("btn-accent btn-sm","Quay lại việc này","A.resumeAsgn('"+a.id+"')")+'</div>';
    h+='</div>';
    return h;
  }
  if(canEdit){
    h+='<div class="row" style="gap:8px;margin-bottom:10px;flex-wrap:wrap">'+btn("btn-ghost btn-sm","Sắp xếp lại","A.sxm('"+a.id+"')")+'</div>';
    h+='<div class="row" style="gap:12px"><input type="range" min="0" max="100" step="5" value="'+a.prog+'" style="flex:1;accent-color:#38bdf8" oninput="A.pl(\''+a.id+'\',this.value)" onchange="A.ps2a(\''+a.id+'\',this.value)"><span id="pg_'+a.id+'" style="font-family:monospace;font-weight:700;width:46px;text-align:right;color:#38bdf8;font-size:15px">'+a.prog+'%</span>'+btn("btn-accent btn-sm"+(a.prog<100?" disabled":""),"Hoàn tất phần việc","A.fin('"+a.id+"')")+'</div>';
  }else{
    h+='<div class="row" style="gap:8px;margin-bottom:8px;align-items:center"><span style="font-family:monospace;font-weight:700;color:#38bdf8">'+a.prog+'%</span><span style="font-size:12px;color:var(--c-muted4)">Giám sát chỉ xem</span></div>';
  }
  h+=renderReportsBlock(a.id,3);
  return h+'</div>';
}

function vProg(){
  if(!canViewSharedProg())return'<div class="card card-p" style="color:var(--c-muted)">Chỉ Giám sát, Điều hành, Giám đốc và Chỉ huy trưởng được xem tiến độ công việc chung / Gantt dự án. Nhân viên xem công việc của mình ở tab Công việc.</div>';
  var active=S.asgn.filter(function(a){return a.status==="active"});
  var paused=S.asgn.filter(function(a){return a.status==="paused"});
  var h='<h2 style="font-size:20px;font-weight:700;margin-bottom:8px">Tiến độ công việc</h2>';
  h+=lateAlertBannerHTML();
  h+='<p style="font-size:13px;color:var(--c-muted);margin-bottom:16px">Sắp xếp lại: tạm chuyển người sang việc khác (quay lại sau) hoặc bàn giao phần việc dở cho người khác làm tiếp. Tiến độ dự án tính cả việc đang làm và tạm dừng.</p>';
  h+=ganttCardWrap("Biểu đồ Gantt — dự án đang thực hiện",ganttHTML(),"margin-bottom:16px");
  if(!active.length&&!paused.length)return h+'<div class="card card-p" style="color:var(--c-muted)">Không có công việc nhân sự nào đang chạy.</div>';
  if(active.length){h+='<h3 style="font-size:15px;color:var(--c-accent);margin-bottom:10px">Đang làm ('+active.length+')</h3><div style="display:grid;gap:12px;margin-bottom:20px">';active.forEach(function(a){h+=progCard(a)});h+='</div>';}
  if(paused.length){h+='<h3 style="font-size:15px;color:#fbbf24;margin-bottom:10px">Tạm dừng ('+paused.length+')</h3><div style="display:grid;gap:12px">';paused.forEach(function(a){h+=progCard(a)});h+='</div>';}
  return h;
}

function vQual(){
  if(!canViewQual())return"";
  if(!S.kpiMonth)S.kpiMonth=attMonthKey();
  var kind=S.kpiPeriod||"month";
  var ym=S.kpiMonth;
  var range=kpiPeriodRange(kind,ym);
  var rows=kpiBoardRows(kind,ym);
  var canRate=canViewSensitive();
  var canRework=canOperate();
  var h='<h2 style="font-size:20px;font-weight:700;margin-bottom:8px">Đánh giá &amp; KPI thi đua</h2>';
  h+='<p style="font-size:13px;color:var(--c-muted);margin-bottom:14px">KPI = (0.5·E + 0.5·Q) × (0.35 + 0.65·D/100). Chuẩn chuyên cần: <b>'+stdWorkDaysMonth()+'</b> ngày/tháng. <b>Giám sát / Điều hành / Chỉ huy trưởng / Hành chính</b> không chấm công hiện trường và không nằm trong bảng KPI.</p>';

  h+='<div class="card card-p" style="margin-bottom:16px"><div class="row" style="justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;margin-bottom:12px"><h3 style="font-size:16px;font-weight:700;color:var(--c-accent);margin:0">Bảng thi đua · '+esc(range.label)+'</h3>';
  h+='<div class="hist-sub" style="margin-bottom:0">';
  h+=btn("btn-ghost btn-sm"+(kind==="month"?" active":""),"Tháng","A.kpiPeriod('month')");
  h+=btn("btn-ghost btn-sm"+(kind==="quarter"?" active":""),"Quý","A.kpiPeriod('quarter')");
  h+=btn("btn-ghost btn-sm"+(kind==="year"?" active":""),"Năm","A.kpiPeriod('year')");
  h+='<input type="month" value="'+ym+'" onchange="A.kpiMonthPick(this.value)" style="min-width:140px">';
  h+='</div></div>';
  if(!rows.length)h+='<div style="color:var(--c-muted);font-size:13px">Chưa có nhân sự.</div>';
  else{
    h+='<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:13px"><thead><tr style="text-align:left;color:var(--c-muted);font-size:11px;text-transform:uppercase">';
    h+='<th style="padding:8px 6px">#</th><th style="padding:8px 6px">Nhân viên</th><th style="padding:8px 6px">E</th><th style="padding:8px 6px">Q</th><th style="padding:8px 6px">D</th><th style="padding:8px 6px">KPI</th><th style="padding:8px 6px">Việc</th><th style="padding:8px 6px">Ngày công</th></tr></thead><tbody>';
    rows.forEach(function(r,i){
      var k=r.kpi,e=r.emp;
      h+='<tr style="border-top:1px solid var(--c-border4)"><td style="padding:8px 6px;font-family:monospace;color:var(--c-muted4)">'+(i+1)+'</td>';
      h+='<td style="padding:8px 6px;font-weight:600;cursor:pointer;color:var(--c-accent2)" onclick="A.empDet(\''+e.id+'\')">'+esc(e.name)+'</td>';
      h+='<td style="padding:8px 6px;font-family:monospace">'+k.E+'</td><td style="padding:8px 6px;font-family:monospace">'+k.Q+'</td><td style="padding:8px 6px;font-family:monospace">'+k.D+'</td>';
      h+='<td style="padding:8px 6px;font-family:monospace;font-weight:700;color:#fbbf24">'+k.total+'</td>';
      h+='<td style="padding:8px 6px;font-family:monospace">'+k.jobs+'</td>';
      h+='<td style="padding:8px 6px;font-family:monospace">'+k.workDays+'/'+k.stdDays+'</td></tr>';
    });
    h+='</tbody></table></div>';
  }
  h+='</div>';

  var done=S.asgn.filter(function(a){
    if(a.status!=="done")return false;
    var e=eById(a.empId);
    return e&&!isOversightEmp(e);
  }).slice().sort(function(a,b){return String(b.completedAt||b.endDate||"").localeCompare(String(a.completedAt||a.endDate||""))});
  h+='<div class="row" style="justify-content:space-between;align-items:center;margin-bottom:12px;flex-wrap:wrap;gap:8px"><h3 style="font-size:16px;font-weight:700;color:var(--c-accent);margin:0">Đánh giá từng việc</h3>';
  if(canRework)h+=btn("btn-accent btn-sm","+ Ghi nhận khắc phục / bảo hành","A.openRework()");
  h+='</div>';
  if(!done.length)h+='<div class="card card-p" style="color:var(--c-muted)">Chưa có công việc hoàn thành.</div>';
  else{
    h+='<div style="display:grid;gap:12px">';
    done.forEach(function(a){
      var e=eById(a.empId),p=pById(a.projId),info=asgnInfo(a);
      var planned=asgnPlannedDays(a),base=asgnBaseActualDays(a),rw=asgnReworkDays(a),adj=asgnAdjActualDays(a);
      var out=asgnOutcomeLabel(a);
      h+='<div class="card card-p">';
      h+='<div class="row" style="justify-content:space-between;margin-bottom:8px;gap:8px;flex-wrap:wrap"><div><b>'+esc(e?e.name:"?")+'</b><span style="font-size:13px;color:var(--c-muted)"> — '+esc(info.title)+'</span>';
      if(p)h+='<div style="font-size:12px;color:var(--c-muted4);margin-top:2px">'+esc(p.name)+'</div>';
      h+='</div><div class="row" style="gap:8px;align-items:center">'+(canRate?strs(a.quality||0,"rt",a.id):'<span style="font-family:monospace;color:#fbbf24">'+(a.quality!=null?a.quality+"★":"—")+'</span>')+'</div></div>';
      h+='<div class="row" style="gap:8px;flex-wrap:wrap;margin-bottom:10px;font-size:12px">';
      h+=bdg(out.label,out.c,out.c+"22");
      h+='<span style="font-family:monospace;color:var(--c-muted2)">KH '+planned+' ngày · Thực tế '+adj+(rw?' (gốc '+base+' + KP '+rw+')':'')+'</span>';
      h+='<span style="font-family:monospace;color:var(--c-muted4)">E '+asgnEffScore(a)+' · Q '+asgnQualScore(a)+'</span>';
      h+='</div>';
      if(canRate){
        h+='<div class="row" style="gap:14px;margin-bottom:10px;flex-wrap:wrap">';
        h+='<label style="font-size:13px;display:flex;align-items:center;gap:6px;cursor:pointer"><input type="checkbox" '+(a.praise?"checked":"")+' onchange="A.togPraise(\''+a.id+'\',this.checked)"> Khen / hoàn thành tốt</label>';
        h+='<label style="font-size:13px;display:flex;align-items:center;gap:6px;cursor:pointer"><input type="checkbox" '+(a.complaint?"checked":"")+' onchange="A.togComplaint(\''+a.id+'\',this.checked)"> Khách phàn nàn</label>';
        h+='</div>';
        h+='<textarea placeholder="Nhận xét chất lượng, an toàn, thái độ…" oninput="A.qn(\''+a.id+'\',this.value)">'+esc(a.qNote||"")+'</textarea>';
      }else if(a.qNote){
        h+='<div style="font-size:13px;color:var(--c-muted2);margin-bottom:8px">'+esc(a.qNote)+'</div>';
      }
      if((a.reworks||[]).length){
        h+='<div style="margin-top:10px;padding-top:10px;border-top:1px solid var(--c-border4)"><div style="font-size:12px;font-weight:600;color:#fb923c;margin-bottom:6px">Khắc phục / bảo hành</div>';
        a.reworks.forEach(function(r){
          h+='<div style="font-size:12px;color:var(--c-muted2);margin-bottom:4px">+'+r.days+' ngày · '+esc(r.note||"Không ghi chú")+' <span style="color:var(--c-muted4)">('+(r.byName||"?")+' · '+dFmtG(r.at)+')</span></div>';
        });
        h+='</div>';
      }
      if(canRework)h+='<div class="row" style="margin-top:10px">'+btn("btn-ghost btn-sm","+ Khắc phục việc này","A.openRework('"+a.id+"')")+'</div>';
      h+='</div>';
    });
    h+='</div>';
  }
  return h;
}
function reworkM(f){
  f=f||{};
  var opts=S.asgn.filter(function(a){
    if(a.status!=="done")return false;
    var e=eById(a.empId);
    return e&&!isOversightEmp(e);
  }).map(function(a){
    var e=eById(a.empId),info=asgnInfo(a);
    return'<option value="'+a.id+'"'+(a.id===f.asgnId?" selected":"")+'>'+esc((e?e.name:"?")+" — "+info.title)+'</option>';
  }).join("");
  var body=fld("Việc gốc (đã hoàn thành)",'<select id="rw-asgn">'+opts+'</select>')
    +fld("Số ngày khắc phục",'<input type="number" id="rw-days" min="1" max="90" value="'+(f.days||1)+'">')
    +fld("Ghi chú",'<textarea id="rw-note" rows="3" placeholder="VD: Hỏng sớm — quay lại sửa máy nén, khắc phục cho việc …">'+esc(f.note||"")+'</textarea>');
  return mw("Ghi nhận khắc phục / bảo hành",body,btn("btn-primary","Lưu","A.saveRework()"),"");
}
/** Modal đổi % — bản gọn (hiếm dùng; luồng chính là nhập inline trên chi tiết dự án). */
function asgnProgM(f){
  f=f||{};
  var a=asgnById(f.asgnId);
  var info=a?asgnInfo(a):{title:"?"};
  var e=a?eById(a.empId):null;
  var reopen=f.mode==="reopen";
  var max=reopen?99:100;
  var def=f.prog!=null?f.prog:(reopen?80:(a&&a.prog!=null?a.prog:0));
  var body='<div style="font-size:13px;color:var(--c-muted2);margin-bottom:10px">'+esc(e?e.name:"?")+' — '+esc(info.title)+'</div>'
    +'<div class="wi-det-asgn-edit" style="justify-content:flex-start">'
    +'<input type="number" id="ap-prog" class="wi-det-prog-inp" min="0" max="'+max+'" step="1" value="'+esc(String(def))+'" inputmode="numeric" onkeydown="if(event.key===\'Enter\'){event.preventDefault();A.saveAsgnProg()}">'
    +'<span class="wi-det-prog-unit">%</span>'
    +btn("btn-primary btn-sm","Lưu","A.saveAsgnProg()")
    +'</div>';
  return'<div class="overlay" onmousedown="A.ovDown(event)" onclick="A.cm(event)"><div class="modal modal-compact" onclick="event.stopPropagation()"><div class="row" style="justify-content:space-between;margin-bottom:14px"><h3 style="font-size:16px;font-weight:700">'+(reopen?"Mở lại · nhập %":"Tiến độ")+'</h3><button class="x-btn" onclick="A.cm()">×</button></div>'+body+'</div></div>';
}
function reopenProjProgM(f){
  f=f||{};
  var p=pById(f.projId);
  var body='<div style="font-size:13px;color:var(--c-muted2);margin-bottom:12px;line-height:1.45">Mở lại «'+esc(p?p.name:"?")+'». Để trống ô % nếu chỉ thêm hạng mục mới (giữ việc đã xong).</div>'
    +fld("Hạ tiến độ việc đã xong về (%)",'<input type="number" id="rp-prog" min="0" max="99" step="1" value="'+(f.prog!=null?esc(String(f.prog)):"80")+'" inputmode="numeric" placeholder="Để trống = không hạ %" style="font-size:18px;font-family:monospace">')
    +'<div class="row" style="gap:8px;flex-wrap:wrap;margin-top:12px">'
    +'<button type="button" class="btn btn-ghost btn-sm" onclick="var el=document.getElementById(\'rp-prog\');if(el)el.value=\'\'">Không hạ %</button>'
    +[50,80,90].map(function(x){
      return'<button type="button" class="btn btn-ghost btn-sm" onclick="var el=document.getElementById(\'rp-prog\');if(el)el.value=\''+x+'\'">'+x+'%</button>';
    }).join("")
    +'</div>';
  return mw("Mở lại dự án",body,btn("btn-primary","Mở lại","A.confirmReopenProj()"),"");
}

function vHist(){
  if(!canViewHist())return"";
  purgeExpiredTrash();
  var view=S.histView||"actions";
  var h='<div class="row" style="justify-content:space-between;margin-bottom:14px;flex-wrap:wrap;gap:8px"><h2 style="font-size:20px;font-weight:700">Lịch sử</h2><div class="row" style="gap:8px;flex-wrap:wrap">'+(UNDO.length?btn("btn-accent btn-sm","↶ Hoàn tác ("+UNDO.length+")","A.undo()"):"")+'</div></div>';
  h+='<div class="hist-sub">'
    +btn("btn-ghost btn-sm"+(view==="actions"?" active":""),"Thao tác","A.histView('actions')")
    +btn("btn-ghost btn-sm"+(view==="access"?" active":""),"Truy cập","A.histView('access')")
    +btn("btn-ghost btn-sm"+(view==="trash"?" active":""),"Thùng rác","A.histView('trash')");
  h+='</div>';
  if(view==="trash"){
    var trash=(S.trash||[]).slice().sort(function(a,b){return String(b.at||"").localeCompare(String(a.at||""))});
    if(!trash.length)return h+'<div class="card card-p hist-empty">Thùng rác trống. Mục đã xoá sẽ giữ tối đa 30 ngày.</div>';
    h+='<div style="display:grid;gap:10px">';
    trash.forEach(function(t){
      var typeLbl={emp:"Nhân sự",cust:"Khách hàng",proj:"Dự án",asgn:"Giao việc",remind:"Nhắc hẹn"}[t.type]||t.type;
      var relN=t.related&&t.related.asgn?t.related.asgn.length:0;
      h+='<div class="li card card-p"><div class="row" style="justify-content:space-between;gap:8px;align-items:flex-start;flex-wrap:wrap"><div style="min-width:0;flex:1"><div class="row" style="gap:6px;align-items:center;margin-bottom:4px;flex-wrap:wrap">'+bdg(typeLbl,"#fbbf24","rgba(251,191,36,.12)")+'<span style="font-size:14px;font-weight:600">'+esc(t.label||"?")+'</span></div>';
      h+='<div class="hist-meta">Xoá: '+fmtHistTime(t.at)+' · Hết hạn: '+fmtHistTime(t.expiresAt)+(relN?' · kèm '+relN+' giao việc':"")+'</div></div>';
      h+='<div class="row" style="gap:6px;flex-shrink:0">'+(canOperate()?btn("btn-primary btn-sm","Khôi phục","A.restoreTrash('"+t.id+"')")+btn("btn-danger btn-sm","Xoá vĩnh viễn","A.emptyTrash('"+t.id+"')"):"")+'</div></div></div>';
    });
    return h+'</div>';
  }
  var kind=view==="access"?"access":"action";
  var logs=(S.auditLog||[]).filter(function(x){return x.kind===kind}).slice().sort(function(a,b){return String(b.at||"").localeCompare(String(a.at||""))});
  if(!logs.length)return h+'<div class="card card-p hist-empty">'+(kind==="access"?"Chưa có lịch sử đăng nhập.":"Chưa có lịch sử thao tác.")+'</div>';
  h+='<div style="display:grid;gap:8px">';
  logs.slice(0,200).forEach(function(ev){
    h+='<div class="li card card-p"><div class="row" style="justify-content:space-between;gap:8px;flex-wrap:wrap"><div style="min-width:0;flex:1"><div style="font-size:14px">'+esc(ev.text||ev.type||"—")+'</div><div class="hist-meta">'+fmtHistTime(ev.at)+' · '+esc(ev.by||"?")+(ev.type?' · '+esc(ev.type):"")+'</div></div></div></div>';
  });
  return h+'</div>';
}

function btnSignOut(){return'<div class="divider"></div><div style="margin-top:16px">'+btn("btn-ghost","Đăng xuất","window.__CV3_signOut&&window.__CV3_signOut()")+'</div>';}
function cfgSec(id,title,body){
  var forcedCloud=id==="cfg-cloud"||id==="gate-cloud"||id==="emp-cloud";
  var st=forcedCloud?cloudStatusInfo():null;
  var defOpen=forcedCloud&&!(st&&st.online&&S.auth&&S.auth.role);
  var open=S.cfgOpen&&Object.prototype.hasOwnProperty.call(S.cfgOpen,id)?!!S.cfgOpen[id]:defOpen;
  return'<div class="cfg-acc'+(open?" open":"")+'"><button type="button" class="cfg-acc-hd" onclick="A.cfgTog(\''+id+'\')"><span class="cfg-acc-title">'+title+'</span><span class="cfg-acc-chev" aria-hidden="true">▾</span></button><div class="cfg-acc-bd">'+body+'</div></div>';
}
function cloudStatusInfo(){
  var c=window.__CV3_CLOUD||null;
  var fb=!!(window.FIREBASE_CONFIG&&window.FIREBASE_CONFIG.apiKey&&window.FIREBASE_CONFIG.apiKey!=="YOUR_API_KEY");
  var be=String(window.APP_BACKEND||"firebase").trim().toLowerCase()||"firebase";
  if(c)return{
    online:!!c.online,
    kind:c.kind||be,
    reason:c.reason||"",
    detail:c.detail||"",
    canLogin:!!c.canLogin,
    missingConfig:!!c.missingConfig||(be!=="selfhost"&&!fb),
    selfhostStub:!!c.selfhostStub
  };
  return{
    online:!!window.__CV3_SKIP_SEED&&fb,
    kind:be,
    reason:fb?"":"Thiếu cấu hình Firebase",
    detail:fb?"":"Không có firebase-config.js hợp lệ trên server.",
    canLogin:!!(window.__CV3_openAuth&&window.__CV3_SKIP_SEED&&fb),
    missingConfig:!fb&&be!=="selfhost",
    selfhostStub:be==="selfhost"&&!(window.SELFHOST_API&&String(window.SELFHOST_API).trim())
  };
}
function cloudStatusBody(){
  var st=cloudStatusInfo();
  var authed=!!(S.auth&&S.auth.role);
  var h='<div style="font-size:13px;line-height:1.55;color:var(--c-muted2)">';
  if(st.online&&authed){
    h+='<div style="color:#4ade80;font-weight:600;margin-bottom:8px">✓ Đã kết nối cloud</div>';
    h+='<div>Backend: <b style="color:var(--c-text)">'+esc(st.kind)+'</b></div>';
    h+='<div>Tài khoản: <b style="color:var(--c-text)">'+esc(authSessionLabel()||S.auth.username||"—")+'</b></div>';
  }else if(st.online&&!authed){
    h+='<div style="color:#fbbf24;font-weight:600;margin-bottom:8px">☁ Cloud sẵn sàng — chưa đăng nhập</div>';
    h+='<p style="margin:8px 0 12px">Đăng nhập để tải dữ liệu đội từ server.</p>';
    h+='<div class="row" style="gap:8px;flex-wrap:wrap">'+btn("btn-accent","Đăng nhập","A.openCloudAuth()")+'</div>';
  }else{
    h+='<div style="color:#f87171;font-weight:600;margin-bottom:8px">⚠ '+(esc(st.reason)||"Đang offline")+'</div>';
    if(st.detail)h+='<p style="margin:8px 0 12px">'+esc(st.detail)+'</p>';
    if(st.missingConfig){
      h+='<ol style="margin:0 0 12px 18px;padding:0">';
      h+='<li>Trên máy có Firebase: lấy <code>public/firebase-config.js</code></li>';
      h+='<li>Chép vào thư mục deploy Nginx (cùng cấp <code>index.html</code>, thường dưới <code>/du-an/</code>)</li>';
      h+='<li>Tải lại trang (có thể cần xoá cache / Hard refresh)</li>';
      h+='</ol>';
    }else if(st.selfhostStub){
      h+='<p style="margin:0 0 12px">Selfhost cần <code>window.SELFHOST_API</code> (ví dụ <code>https://host/api</code>). Để dùng Firebase: đặt <code>APP_BACKEND=firebase</code> và kèm <code>firebase-config.js</code>.</p>';
    }else{
      h+='<p style="margin:0 0 12px">Dữ liệu hiện chỉ nằm trên trình duyệt này (localStorage), không đồng bộ đội.</p>';
    }
    h+='<div class="row" style="gap:8px;flex-wrap:wrap">'+btn("btn-primary","Tải lại trang","location.reload()")+btn("btn-ghost","Xem hướng dẫn kết nối","A.openCloudAuth()")+'</div>';
  }
  return h+'</div>';
}
function vSettingsUnauthed(){
  return'<div class="emp-portal"><div class="emp-page-hd"><h2 class="emp-page-title">Cài đặt</h2></div><div class="cfg-wrap">'
    +cfgSec("gate-cloud","Kết nối cloud",cloudStatusBody())
    +cfgSec("gate-theme","Giao diện",themeModeBody())
    +'</div></div>';
}
function vDirAccountFields(){
  var a=S.auth||{};
  var dn=esc(a.displayName||"");
  var age=a.age!=null&&a.age!==""?String(a.age):"";
  var un=esc(a.username||"");
  var canRename=isDir();
  return fld("Họ tên",'<input id="dir-dn" value="'+dn+'" autocomplete="name" placeholder="Nguyễn Văn A">')
    +fld("Tuổi",'<input type="number" id="dir-age" min="1" max="150" value="'+age+'" placeholder="VD: 45">')
    +fld("Tên đăng nhập",'<input id="dir-un" value="'+un+'" autocomplete="username" style="font-family:monospace"'+(canRename?"":" readonly")+'>'
      +(canRename?"":'<span class="hint">Chỉ giám đốc được đổi tên đăng nhập.</span>'))
    +'<h3 style="color:var(--c-accent);margin:20px 0 12px;font-size:15px">Đổi mật khẩu (tuỳ chọn)</h3>'
    +fld("Mật khẩu hiện tại",pwInput("dir-pw-cur",{autocomplete:"current-password",placeholder:"Bắt buộc nếu đổi mật khẩu"}))
    +fld("Mật khẩu mới",pwInput("dir-pw",{autocomplete:"new-password",placeholder:"Để trống nếu không đổi"}))
    +fld("Xác nhận mật khẩu",pwInput("dir-pw2",{autocomplete:"new-password",placeholder:"Nhập lại mật khẩu mới"}));
}

function vEmpSettings(){
  if(!isEmp())return vSettingsUnauthed();
  var pwBody=''
    +fld("Mật khẩu hiện tại",pwInput("set-pw-cur",{autocomplete:"current-password",placeholder:"Nhập mật khẩu đang dùng"}))
    +fld("Mật khẩu mới",pwInput("set-pw",{autocomplete:"new-password",placeholder:"Tối thiểu 6 ký tự"}))
    +fld("Xác nhận mật khẩu",pwInput("set-pw2",{autocomplete:"new-password",placeholder:"Nhập lại mật khẩu mới"}))
    +'<div style="margin-top:16px">'+btn("btn-primary","Lưu","A.savePassword()")+'</div>';
  var pushBody=empPushBlockHTML(S.auth.empId||"");
  var acctBody=empAcctCardHTML()+btnSignOut();
  return'<div class="emp-portal"><div class="emp-page-hd"><h2 class="emp-page-title">Cài đặt</h2></div><div class="cfg-wrap">'
    +cfgSec("emp-cloud","Kết nối cloud",cloudStatusBody())
    +cfgSec("emp-theme","Giao diện",themeModeBody())
    +cfgSec("emp-company","Thông tin công ty",companyInfoViewHTML())
    +cfgSec("emp-push","Thông báo nền",pushBody)
    +cfgSec("emp-bio","Đăng nhập sinh trắc học",bioSettingsBody())
    +cfgSec("emp-pw","Đổi mật khẩu",pwBody)
    +cfgSec("emp-acct","Tài khoản",acctBody)
    +'</div></div>';
}

function companyInfoViewHTML(){
  var co=ensureCompanyInfo();
  var rows=[];
  if(co.name)rows.push(["Tên công ty",esc(co.name)]);
  if(co.address)rows.push(["Địa chỉ",esc(co.address)]);
  if(co.website){
    var href=companyWebsiteHref(co.website);
    rows.push(["Website",'<a href="'+esc(href)+'" target="_blank" rel="noopener noreferrer" style="color:#38bdf8;word-break:break-all">'+esc(co.website)+'</a>']);
  }
  if(co.phone)rows.push(["Điện thoại",esc(co.phone)]);
  if(co.email)rows.push(["Email",esc(co.email)]);
  (co.custom||[]).forEach(function(f){
    if(f.label)rows.push([esc(f.label),esc(f.value||"—")]);
  });
  if(!rows.length)return'<div style="font-size:13px;color:var(--c-muted)">Chưa có thông tin công ty.</div>';
  return rows.map(function(r){return'<div style="margin-bottom:12px"><div class="lab">'+r[0]+'</div><div style="font-size:14px;margin-top:2px">'+r[1]+'</div></div>';}).join("");
}
function companyInfoEditHTML(){
  var co=ensureCompanyInfo();
  var h='<p style="font-size:13px;color:var(--c-muted);margin-bottom:14px">Thông tin công ty đồng bộ theo workspace. Có thể thêm trường tuỳ chỉnh (MST, người đại diện…).</p>';
  h+=fld("Tên công ty",'<input id="co-name" value="'+esc(co.name)+'" placeholder="VD: Công ty TNHH SAREE" autocomplete="organization">');
  h+=fld("Địa chỉ",'<input id="co-address" value="'+esc(co.address)+'" placeholder="Số nhà, đường, quận/huyện, tỉnh/thành" autocomplete="street-address">');
  h+=fld("Website",'<input id="co-website" value="'+esc(co.website)+'" placeholder="https://www.example.com" inputmode="url" autocomplete="url">');
  h+='<div class="grid2" style="gap:14px">'+fld("Điện thoại",'<input id="co-phone" value="'+esc(co.phone)+'" placeholder="0xxx…" inputmode="tel" autocomplete="tel">')+fld("Email",'<input id="co-email" value="'+esc(co.email)+'" placeholder="lienhe@example.com" inputmode="email" autocomplete="email">')+'</div>';
  h+='<div style="margin:18px 0 10px;font-size:13px;font-weight:700;color:var(--c-accent2)">Trường tuỳ chỉnh</div>';
  if(!(co.custom&&co.custom.length))h+='<div style="font-size:12px;color:var(--c-muted);margin-bottom:10px">Chưa có trường thêm. Bấm «+ Thêm trường».</div>';
  (co.custom||[]).forEach(function(f){
    h+='<div class="row" style="gap:8px;align-items:flex-end;margin-bottom:10px;flex-wrap:wrap">';
    h+='<div style="flex:1;min-width:120px">'+fld("Tên trường",'<input id="co-fl-'+f.id+'" value="'+esc(f.label)+'" placeholder="VD: Mã số thuế">')+'</div>';
    h+='<div style="flex:1.4;min-width:140px">'+fld("Nội dung",'<input id="co-fv-'+f.id+'" value="'+esc(f.value)+'" placeholder="Giá trị">')+'</div>';
    h+='<div style="padding-bottom:2px">'+btn("btn-danger btn-sm","Xoá","A.rmCompanyField('"+f.id+"')")+'</div>';
    h+='</div>';
  });
  h+='<div class="row" style="gap:8px;flex-wrap:wrap;margin-top:8px">'+btn("btn-ghost btn-sm","+ Thêm trường","A.addCompanyField()")+btn("btn-primary","Lưu thông tin công ty","A.saveCompany()")+'</div>';
  return h;
}
function companyInfoBody(){
  if(canManageStaff())return companyInfoEditHTML();
  return companyInfoViewHTML();
}
function vCfg(){
  var c=S.cfg,sw=(c.wP+c.wA+c.wS)||1;
  function sl(k,l,col){return'<div style="margin-bottom:14px"><div class="row" style="justify-content:space-between;margin-bottom:4px"><span style="font-size:14px;font-weight:600;color:var(--c-accent2)">'+l+'</span><span id="w_'+k+'" style="font-family:monospace;color:'+col+'">'+Math.round(c[k]/sw*100)+'%</span></div><input type="range" min="0" max="10" value="'+c[k]+'" style="width:100%;accent-color:'+col+'" oninput="A.wl(\''+k+'\',this.value)" onchange="A.ww(\''+k+'\',this.value)"></div>'}
  var weightsBody=sl("wP","Ở gần (ít chi phí)","#60a5fa")+sl("wA","Đang ít việc / sẵn sàng","#4ade80")+sl("wS","Tay nghề cao","#fbbf24");
  var opsBody=fld("Cơ sở vị trí nhân viên",'<select onchange="A.ss(\'wb\',this.value)"><option value="auto" '+(c.wb==="auto"?"selected":"")+'>Tự động (T.Hai = nhà, ngày khác = gần nhất)</option><option value="last" '+(c.wb==="last"?"selected":"")+'>Luôn vị trí gần nhất</option><option value="home" '+(c.wb==="home"?"selected":"")+'>Luôn nhà</option></select>')
    +fld("Ngưỡng bận rộn",'<input type="range" min="1" max="10" value="'+(c.ml||3)+'" style="width:100%;accent-color:#38bdf8" onchange="A.ww(\'ml\',this.value)">')
    +fld("Ngày công chuẩn / tháng (KPI)",'<input type="number" min="1" max="31" value="'+(c.stdWorkDaysMonth||26)+'" onchange="A.ww(\'stdWorkDaysMonth\',this.value)">');
  var lastBk=load("cv3_lastbk","Chưa có");var bkLog=load("cv3_bklog",[]);
  var acctBody=vDirAccountFields()+'<div class="divider"></div><div class="row" style="gap:8px">'+btn("btn-primary","Lưu","A.saveDirProfile()")+btn("btn-ghost","Đăng xuất","window.__CV3_signOut&&window.__CV3_signOut()")+'</div>';
  var backupBody='<div style="background:rgba(74,222,128,.08);border:1px solid rgba(74,222,128,.25);border-radius:12px;padding:14px;margin-bottom:16px"><div style="font-size:13px;font-weight:600;color:#4ade80;margin-bottom:6px">Sao lưu cả 2 đội</div><div style="font-size:12px;color:var(--c-muted4);margin-bottom:3px">Phiên bản: <b style="color:#38bdf8;font-family:monospace">'+verStr()+'</b></div><div style="font-size:12px;color:var(--c-muted2)">Sao lưu gần nhất: <b style="color:var(--c-text);font-family:monospace">'+lastBk+'</b></div></div><div style="margin-bottom:14px"><div class="lab">Lịch sử 7 ngày gần nhất</div>'+(bkLog.length===0?'<div style="font-size:13px;color:var(--c-muted3)">Chưa có lịch sử.</div>':bkLog.slice().reverse().slice(0,7).map(function(b){return'<div class="li" style="font-size:13px;font-family:monospace;color:rgba(160,195,255,.7)">'+b+'</div>';}).join(""))+'</div><div class="divider"></div><div class="row" style="gap:8px;flex-wrap:wrap">'+btn("btn-ghost","⬇ Sao lưu 2 đội","A.exp()")+btn("btn-accent","⬆ Khôi phục từ file","A.imp()")+'<input type="file" id="bk-restore-file" accept="application/json,.json" style="display:none" onchange="A.impFile(this)"></div>';
  var h='<h2 style="font-size:20px;font-weight:700;margin-bottom:14px">Cài đặt</h2><div class="cfg-wrap">';
  h+=cfgSec("cfg-cloud","Kết nối cloud",cloudStatusBody());
  if(!(S.auth&&S.auth.role)){
    h+=cfgSec("cfg-theme","Giao diện",themeModeBody());
    return h+'</div>';
  }
  h+=cfgSec("cfg-theme","Giao diện",themeModeBody());
  if(hasFullUI())h+=cfgSec("cfg-company","Thông tin công ty",companyInfoBody());
  if(hasFullUI())h+=cfgSec("cfg-acct","Tài khoản",acctBody);
  if(hasFullUI())h+=cfgSec("cfg-bio","Đăng nhập sinh trắc học",bioSettingsBody());
  if(hasFullUI())h+=cfgSec("cfg-push","Thông báo push",pushSettingsBody());
  if(canViewSensitive())h+=cfgSec("cfg-remind","Nhắc hẹn",remindSettingsBody());
  if(canManageStaff()){
    h+=cfgSec("cfg-weights","Trọng số gợi ý",weightsBody);
    h+=cfgSec("cfg-ops","Vận hành",opsBody);
    h+=cfgSec("cfg-backup","Cloud &amp; sao lưu",backupBody);
  }
  return h+'</div>';
}

function groupM(){
  var foot='<div class="modal-foot"><div class="modal-foot-l">'+btn("btn-ghost","Huỷ","A.grpCancel()")+'</div><div class="modal-foot-c"></div><div class="modal-foot-r">'+btn("btn-primary","Thêm","A.saveNewGroup()")+'</div></div>';
  return'<div class="overlay" onmousedown="A.ovDown(event)" onclick="A.grpCancel(event)"><div class="modal" onclick="event.stopPropagation()"><div class="row" style="justify-content:space-between;margin-bottom:20px"><h3 style="font-size:18px;font-weight:700;background:linear-gradient(90deg,#fff,#a8d4ff);-webkit-background-clip:text;-webkit-text-fill-color:transparent">Thêm nhóm chuyên môn</h3><button class="x-btn" onclick="A.grpCancel()">×</button></div>'+fld("Tên nhóm",'<input id="fgn" placeholder="VD: Cơ khí" autocomplete="off">')+foot+'</div></div>';
}
function empM(f){
  var lk=f.loginKey||nameToLoginKey(f.name);
  var hasAcct=!!f.authUid;
  var orgs=forceChiefScope(f.group,(Array.isArray(f.orgIds)&&f.orgIds.length)?f.orgIds.slice():[currentOrgId()]);
  var orgLabel=isOversightGroup(f.group)||isAdminHrGroup(f.group)?"Phạm vi đội — "+(f.group||"văn phòng"):"Đội tham gia";
  var b=fld("Họ tên",'<input id="fn" value="'+esc(f.name)+'">')
    +fld("Tổ",'<select id="fg" onchange="A.grpSel(this.value)">'+go(f.group,{allowCreate:true})+'</select>')
    +fld(orgLabel,empOrgPickHTML(orgs))
    +fld("Nhà (tỉnh/thành)",'<select id="fp">'+po(f.province)+'</select>')
    +fld("Tay nghề",'<span id="fsk">'+strs(f.skill,"fst")+'</span>')
    +fld("Trạng thái",'<select id="fs">'+Object.keys(ST).map(function(k){return'<option value="'+k+'" '+(k===f.status?"selected":"")+'>'+ST[k].l+'</option>'}).join("")+'</select>')
    +fld("Tên đăng nhập",'<input id="flu" value="'+esc(lk)+'" autocomplete="off" placeholder="phuong, khoa…">')
    +fld("Ghi chú",'<input id="fno" value="'+esc(f.note||"")+'">');
  if(hasAcct)b+='<div style="margin-top:12px">'+fld("Đổi mật khẩu (tuỳ chọn)",pwInput("fpw",{autocomplete:"new-password",placeholder:"Chỉ điền khi muốn đổi"}))+'</div>';
  if(hasAcct)b='<div style="font-size:12px;color:#4ade80;margin-bottom:12px">✓ Đã có tài khoản đăng nhập cloud</div>'+b;
  return mw(f.id?"Sửa nhân sự":"Thêm nhân sự",b,btn("btn-primary","Lưu","A.se()"),f.id?btn("btn-danger","Xoá","A.de('"+f.id+"')"):"");
}
function syncEmpFormFromDom(){
  if(!S.form)return;
  var el;
  el=document.getElementById("fn");if(el)S.form.name=el.value;
  el=document.getElementById("fp");if(el)S.form.province=el.value;
  el=document.getElementById("fs");if(el)S.form.status=el.value;
  el=document.getElementById("fno");if(el)S.form.note=el.value;
  el=document.getElementById("flu");if(el)S.form.loginKey=String(el.value||"").trim();
  var boxes=document.querySelectorAll(".forg:checked");
  if(boxes&&boxes.length)S.form.orgIds=Array.prototype.map.call(boxes,function(b){return b.value});
  S.form.orgIds=forceChiefScope(S.form.group,S.form.orgIds);
}
function empAsgnCardM(a){
  var info=asgnInfo(a),p=pById(a.projId),e=eById(a.empId),factory=asgnFactoryName(a),pl=p?pLoc(p):null,c=p&&p.custId?cById(p.custId):null,mates=coworkersOnProj(a.projId,a.empId);
  var b="";
  if(a.status==="paused")b+='<div style="margin-bottom:12px">'+bdg("Tạm dừng","#ef4444","rgba(239,68,68,.15)")+'</div>';
  b+='<div class="grid2" style="gap:14px;margin-bottom:14px">';
  b+='<div><div style="font-size:12px;color:var(--c-muted);margin-bottom:4px">Nhân viên</div><div style="font-size:14px;font-weight:600">'+esc(e?e.name:"?")+'</div></div>';
  b+='<div><div style="font-size:12px;color:var(--c-muted);margin-bottom:4px">Nhà máy</div><div style="font-size:14px">'+esc(factory||"—")+'</div></div>';
  b+='<div style="grid-column:1/-1"><div style="font-size:12px;color:var(--c-muted);margin-bottom:4px">Công việc</div><div style="font-size:14px">'+esc(info.title)+'</div></div>';
  if(a.workContent&&a.workContent!==info.title)b+='<div style="grid-column:1/-1"><div style="font-size:12px;color:var(--c-muted);margin-bottom:4px">Nội dung chi tiết</div><div style="font-size:14px;color:var(--c-text2);white-space:pre-wrap">'+esc(a.workContent)+'</div></div>';
  b+='<div><div style="font-size:12px;color:var(--c-muted);margin-bottom:4px">Thời gian</div><div style="font-family:monospace;font-size:13px">'+dFmtG(a.startDate)+" → "+dFmtG(asgnEndDate(a))+' <span style="color:#38bdf8">('+asgnDays(a)+')</span></div></div>';
  b+='<div><div style="font-size:12px;color:var(--c-muted);margin-bottom:4px">Tiến độ</div><div class="row" style="gap:10px;align-items:center"><div style="flex:1;height:8px;border-radius:999px;background:rgba(255,255,255,.08);overflow:hidden"><div style="height:100%;width:'+a.prog+'%;background:linear-gradient(90deg,#38bdf8,#60a5fa);border-radius:999px"></div></div><span style="font-family:monospace;font-weight:700;color:#38bdf8">'+a.prog+'%</span></div></div>';
  if(asgnAssignerLine(a))b+='<div style="grid-column:1/-1"><div style="font-size:12px;color:var(--c-muted);margin-bottom:4px">Người giao</div><div style="font-size:13px;color:#7dd3fc">'+esc(asgnAssignerLine(a))+'</div></div>';
  b+='</div>';
  if(info.cust||info.contact)b+='<div style="margin-bottom:12px"><div style="font-size:12px;color:var(--c-muted);margin-bottom:4px">Khách hàng / Liên hệ</div><div style="font-size:14px">'+esc(info.cust)+(info.cust&&info.contact?" · ☎ ":"")+(info.contact?esc(info.contact):"")+'</div></div>';
  if(pl)b+='<div style="margin-bottom:12px"><div style="font-size:12px;color:var(--c-muted);margin-bottom:4px">Địa điểm</div><div style="font-size:14px">📍 '+esc(pl.name)+(c&&c.address?'<div style="font-size:12px;color:var(--c-muted2);margin-top:4px">'+esc(c.address)+'</div>':"")+'</div></div>';
  if(p)b+='<div style="margin-bottom:12px"><div style="font-size:12px;color:var(--c-muted);margin-bottom:4px">Dự án</div><div style="font-size:14px">'+esc(p.name)+' · '+bdg(p.group,groupColor(p.group))+'</div></div>';
  if(asgnHandoffLine(a))b+='<div class="asgn-handoff-note" style="margin-bottom:12px">'+asgnHandoffLine(a)+'</div>';
  b+=asgnReceiptHTML(a);
  if(mates.length)b+='<div><div style="font-size:12px;color:var(--c-muted);margin-bottom:8px">Cùng làm chung ('+mates.length+')</div><div class="row" style="gap:8px;flex-wrap:wrap">'+mates.map(function(n){return bdg(n,groupColor(p?p.group:"Hệ thống"),"transparent")}).join("")+'</div></div>';
  return mw("Chi tiết công việc",b,btn("btn-primary","Đóng","A.cm()"),"");
}

function editAsgnM(f) {
  var b=fld("Tên khách hàng",'<input id="eacn" value="'+esc(f.custName||"")+'">')
    +fld("Người liên hệ",'<input id="eact" value="'+esc(f.contact||"")+'">')
    +fld("Nội dung công việc",'<textarea id="eawc" rows="3">'+esc(f.workContent||"")+'</textarea>')
    +'<div class="grid2"><div>'+fld("Bắt đầu",'<input type="date" id="easd" value="'+(f.startDate||"")+'">')+'</div><div>'+fld("Kết thúc",'<input type="date" id="eaed" value="'+(f.endDate||"")+'">')+'</div></div>'
    +fld("Giờ có mặt tại điểm",'<input type="datetime-local" id="eaarr" value="'+esc(f.arriveAt||"")+'">');
  return mw("Sửa công việc",b,btn("btn-primary","Lưu thay đổi","A.saveEditAsgn('"+f.id+"')"),btn("btn-danger","Xoá công việc","A.delAsgn('"+f.id+"')"));
}

function empGiaoM(f,empName){
  var empId=S.selEmp;
  var b=fld("Khách hàng",custPickHTML("egcu",f.custId||"",{empId:empId,emptyLabel:"— Chọn khách hàng —",required:false}))
    +fld("Tên khách hàng",'<input id="egcn" value="'+esc(f.custName||"")+'">')
    +fld("Người liên hệ",'<input id="egct" value="'+esc(f.contact||"")+'" placeholder="Số điện thoại, email hoặc tên người liên hệ">')
    +fld("Nội dung công việc",'<textarea id="egw" rows="3">'+esc(f.workContent||"")+'</textarea>')
    +'<div class="grid2"><div>'+fld("Thời gian bắt đầu",'<input type="date" id="egsd" value="'+(f.startDate||td())+'">')+'</div><div>'+fld("Thời gian kết thúc",'<input type="date" id="eged" value="'+(f.endDate||dAdd(td(),14))+'">')+'</div></div>';
  var defArr=new Date();defArr.setHours(defArr.getHours()+2,0,0,0);
  b+=fld("Giờ có mặt tại điểm",'<input type="datetime-local" id="eg-arrive" value="'+esc(f.arriveAt||remindAtToLocal(defArr.toISOString()))+'">');
  return mw("Giao việc — "+esc(empName),b,btn("btn-primary","Lưu giao việc","A.seg()"),"","A.egiaoCancel()");
}
function custM(f){var b=
  '<div style="background:rgba(56,189,248,.08);border:1px solid rgba(56,189,248,.25);border-radius:12px;padding:14px;margin-bottom:18px">'+
  '<div style="font-size:12px;font-weight:600;color:#38bdf8;margin-bottom:8px;text-transform:uppercase;letter-spacing:.05em">📍 Tự động điền từ Google Maps</div>'+
  '<div class="row" style="gap:8px;flex-wrap:nowrap"><input id="fcs" placeholder="Dán link Google Maps vào đây…" style="flex:1;font-size:13px">'+btn("btn-accent btn-sm","Lấy thông tin","A.pc()")+'</div>'+
  '<div id="lookup-status" style="font-size:12px;color:var(--c-muted2);margin-top:8px">Dán link → bấm "Lấy thông tin" → form sẽ tự điền tên, địa chỉ, toạ độ.</div></div>'+
  fld("Tên chính quy (đầy đủ)",'<input id="fn" value="'+esc(f.name||"")+'">')+
  fld("Tên gọi ngắn",'<input id="fshort" value="'+esc(f.shortName||"")+'" placeholder="VD: Tân Phong Phú, IQF Cần Thơ…">')+
  fld("Địa chỉ",'<input id="fa" value="'+esc(f.address||"")+'">')+
  '<div class="grid2"><div>'+fld("Vĩ độ (lat)",'<input id="flat" value="'+(f.lat!=null?f.lat:"")+'">')+'</div><div>'+fld("Kinh độ (lng)",'<input id="flng" value="'+(f.lng!=null?f.lng:"")+'">')+'</div></div>'+
  fld("Tỉnh/thành",'<select id="fpv"><option value="">— Không chọn —</option>'+po(f.province||"")+'</select>')+
  fld("Liên hệ",'<input id="fct" value="'+esc(f.contact||"")+'">')+
  fld("Ghi chú",'<input id="fcn" value="'+esc(f.note||"")+'">');
  return mw(f.id?"Sửa khách hàng":"Thêm khách hàng",b,'<button class="btn btn-ghost btn-sm" onclick="A.ms()">🔎 Mở Google Maps ↗</button>'+btn("btn-primary","Lưu","A.sc()"),f.id?btn("btn-danger","Xoá","A.dc('"+f.id+"')"):"")}
function projM(f){
  var start=f.startDate||defaultProjStart();
  var parts=dateParts(start);
  var days=projDurationDays(f);
  var dl=f.deadline||deadlineFromDuration(start,days);
  var dw=deadlineWarnStyle(dl);
  var b=fld("Tên dự án / công việc",'<input id="fn" value="'+esc(f.name)+'">')
    +fld("Khách hàng",custPickHTML("fcu",f.custId||"",{emptyLabel:"— Không liên kết —"}))
    +'<div class="grid2"><div>'+fld("Tỉnh/thành",'<select id="fp">'+po(f.province)+'</select>')+'</div><div>'+fld("Loại",'<select id="ft"><option value="new" '+(f.type==="new"?"selected":"")+'>Dự án mới</option><option value="repair" '+(f.type==="repair"?"selected":"")+'>Sửa chữa</option></select>')+'</div></div>'
    +fld("Ưu tiên",'<select id="fpr"><option value="high" '+(f.priority==="high"?"selected":"")+'>Cao</option><option value="normal" '+(f.priority==="normal"?"selected":"")+'>Bình thường</option><option value="low" '+(f.priority==="low"?"selected":"")+'>Thấp</option></select>')
    +'<div class="grid2"><div>'+fld("Ngày bắt đầu",'<div class="dm-input"><input type="text" inputmode="numeric" id="fsd-d" maxlength="2" value="'+pad2(parts.day)+'" placeholder="dd" autocomplete="off" onfocus="this.select()" onclick="this.select()" oninput="A.projDateInput(\'d\')" onkeydown="A.projDateKey(\'d\',event)"><span class="dm-sep">/</span><input type="text" inputmode="numeric" id="fsd-m" maxlength="2" value="'+pad2(parts.m)+'" placeholder="mm" autocomplete="off" onfocus="this.select()" onclick="this.select()" oninput="A.projDateInput(\'m\')" onkeydown="A.projDateKey(\'m\',event)"><input type="hidden" id="fsd-y" value="'+parts.y+'"></div>')+'</div><div>'+fld("Số ngày hoàn thành",'<input type="number" id="fdays" min="1" max="365" value="'+days+'" onfocus="this.select()" onclick="this.select()" oninput="A.projFormRecalc()" onchange="A.projFormRecalc()">')+'</div></div>'
    +'<div id="fdl-box" style="'+dw.box+'"><div style="font-size:12px;color:var(--c-muted);margin-bottom:4px">Hạn hoàn thành</div><div id="fdl-disp" style="font-family:monospace;font-size:15px;font-weight:700;color:'+dw.color+'">'+dFmt(dl)+'</div><input type="hidden" id="fdl" value="'+esc(dl)+'"><input type="hidden" id="fsd" value="'+esc(start)+'"></div>'
    +(canOperate()?projWorkItemsBlockHTML(f):"")
    +fld("Mô tả",'<textarea id="fno">'+esc(f.note||"")+'</textarea>');
  return mw(f.id?"Sửa dự án":"Thêm dự án",b,btn("btn-primary","Lưu","A.spr()"),f.id?btn("btn-danger","Xoá","A.dp('"+f.id+"')"):"");
}
function locM(f){var os='<option value="manual">— Toạ độ thủ công —</option>';if(S.cust.length)os+='<optgroup label="Khách hàng">'+S.cust.map(function(c){return'<option value="cust:'+c.id+'">KH: '+esc(custDisplayName(c))+'</option>'}).join("")+'</optgroup>';os+='<optgroup label="Tỉnh/thành">'+PROVS.map(function(p){return'<option value="prov:'+esc(p.name)+'">'+esc(p.name)+'</option>'}).join("")+'</optgroup>';return mw("Vị trí — "+esc(f.name),fld("Đang ở",'<select id="ls" onchange="A.lsc(this.value)">'+os+'</select>')+fld("Toạ độ (nếu thủ công)",'<input id="lc" placeholder="10.95, 106.82 hoặc link Maps">')+fld("Ngày thu thập",'<input type="date" id="ld" value="'+td()+'">'),btn("btn-primary","Lưu","A.sl('"+f.id+"')"),btn("btn-danger","Xoá vị trí","A.clr('"+f.id+"')"))}
function sapXepM(f){
  var a=asgnById(f.asgnId);if(!a)return"";
  var e=eById(a.empId),p=pById(a.projId),info=asgnInfo(a),mode=f.mode||"transfer";
  var projs=S.proj.filter(function(x){return x.status!=="done"&&x.id!==a.projId});
  var emps=p?staffEmp(S.emp.filter(function(x){return x.group===p.group&&x.id!==a.empId&&!isEmpOnLeave(x)})):[];
  var body='<p style="font-size:13px;color:var(--c-muted2);margin-bottom:14px"><b>'+esc(e?e.name:"?")+'</b> · '+esc(info.title)+' · hiện tại <b style="color:#38bdf8">'+a.prog+'%</b></p>';
  body+=fld("Hình thức",'<select id="sxpMode" onchange="A.sxmMode(this.value)"><option value="transfer" '+(mode==="transfer"?"selected":"")+'>Tạm chuyển sang dự án khác (quay lại sau)</option><option value="handoff" '+(mode==="handoff"?"selected":"")+'>Bàn giao phần việc còn dang dở</option></select>');
  if(mode==="transfer"){
    body+=fld("Dự án cần ưu tiên",'<select id="sxpProj"><option value="">— Chọn dự án —</option>'+projs.map(function(x){return'<option value="'+x.id+'" '+(f.targetProj===x.id?"selected":"")+'>'+esc(x.name)+" · "+esc(x.province)+'</option>'}).join("")+'</select>');
    var defArr=new Date();defArr.setHours(defArr.getHours()+2,0,0,0);
    body+=fld("Giờ có mặt tại điểm mới",'<input type="datetime-local" id="sxp-arrive" value="'+esc(f.arriveAt||remindAtToLocal(defArr.toISOString()))+'">');
  }else{
    body+=fld("Người nhận bàn giao",'<select id="sxpEmp"><option value="">— Chọn nhân viên —</option>'+emps.map(function(x){return'<option value="'+x.id+'" '+(f.targetEmp===x.id?"selected":"")+'>'+esc(x.name)+" · "+x.skill+'★</option>'}).join("")+'</select>');
  }
  body+=fld("Ghi chú",'<input id="sxpNote" value="'+esc(f.note||"")+'" placeholder="Lý do chuyển / bàn giao">');
  return mw("Sắp xếp công việc",body,btn("btn-primary","Xác nhận","A.sapXep()"),"");
}

function initViewActions(){
  var app=document.getElementById("app");
  if(!app||app._va)return;app._va=1;
  app.addEventListener("click",function(ev){
    var el=ev.target.closest("[data-act]");
    if(!el||!window.A)return;
    var act=el.dataset.act,id=el.dataset.id;
    if(act==="projDet"&&id)A.projDet(id);
    else if(act==="giaoOpen"&&id)A.giaoOpen(id);
    else if(act==="teamOpen"&&id)A.teamOpen(id);
    else if(act==="giaoTog"&&id)A.giaoTog(id);
    else if(act==="op")A.op(id||undefined);
    else if(act==="oc")A.oc(id||undefined);
    else if(act==="oe")A.oe(id||undefined);
    else if(act==="projBack")A.projBack();
    else if(act==="custBack")A.custBack();
    else if(act==="empBack")A.empBack();
    else if(act==="egv")A.egv();
    else if(act==="giaoBack")A.giaoBack();
    else if(act==="teamBack")A.teamBack();
    else if(act==="giaoSave")A.giaoSave();
    else if(act==="teamSave")A.teamSave();
    else if(act==="goiYOpen"&&id)A.goiYOpen(id);
    else if(act==="goiYReqTog")A.goiYReqTog(+el.dataset.gi);
    else if(act==="goiYFromGiao")A.goiYFromGiao();
    else if(act==="goiYCalc")A.goiYCalc();
  });
}

window.A={
  togglePw:function(id,btn){
    var el=document.getElementById(id);if(!el)return;
    var show=el.type==="password";
    el.type=show?"text":"password";
    if(btn){
      btn.textContent=show?"Ẩn":"Hiện";
      btn.setAttribute("aria-label",show?"Ẩn mật khẩu":"Hiện mật khẩu");
      btn.title=btn.getAttribute("aria-label");
    }
  },
  cfgTog:function(id){S.cfgOpen=S.cfgOpen||{};S.cfgOpen[id]=!S.cfgOpen[id];render()},
  openCloudAuth:function(){
    if(typeof window.__CV3_openAuth==="function"){window.__CV3_openAuth();return;}
    var st=cloudStatusInfo();
    alert((st.reason||"Chưa kết nối cloud")+"\n\n"+(st.detail||"Cần firebase-config.js trên server rồi tải lại trang."));
  },
  openFirebasePush:function(){window.open("https://console.firebase.google.com/project/quan-ly-du-an-7d651/settings/cloudmessaging","_blank","noopener");},
  saveVapid:function(){
    if(!dirGuard())return;
    var k=(document.getElementById("cfg-vapid")||{}).value;
    k=k?String(k).trim():"";
    if(!k)return alert("Dán Key pair (VAPID) từ Firebase Console.");
    if(k.length<60)return alert("Key có vẻ không đúng — copy đủ Key pair từ Firebase.");
    S.cfg.vapidKey=k;
    applyVapidFromCfg();
    sv();
    if(typeof window.__CV3_flushCloud==="function")window.__CV3_flushCloud();
    showAppToast("Đã lưu VAPID key — có thể bật thông báo nền.","ok");
    render();
  },
  go:function(t){if(!tabAllowed(t))return;if(S.tab!==t){S.hist=S.hist||[];S.hist.push(S.tab);if(S.hist.length>20)S.hist=S.hist.slice(-20);}S.tab=t;S.selEmp="";S.selProjDet="";S.selCust="";S.selMyAsgn="";S.selMyAsgnOrg="";S.giaoProj="";S.giaoMode="";S.goiYReq={};S.giaoPick={};S.giaoItemStaff={};S.teamToTruong="";S.teamVatTu="";S.modal=null;S.form=null;S.attFlow=null;S.arrivalFlow=null;S.leaveBoardId="";if(t==="chat"){if(S.pendingChatDm){if(!applyPendingChatDm())S.chatTo="";}else S.chatTo="";}if(t==="hist")purgeExpiredTrash();render();if(t==="chat"){setTimeout(initChatScroll,50);setTimeout(markOpenChatRead,80);}if(t==="report")setTimeout(initReportPreview,50);if(t==="chamcong")setTimeout(initAttPreview,50)},
  histView:function(v){if(!canViewHist())return;S.histView=v||"actions";if(v==="trash")purgeExpiredTrash();render()},
  undo:function(){openUndoList()},
  undoPick:function(id){doUndoById(id)},
  restoreTrash:function(id){restoreTrash(id)},
  emptyTrash:function(id){emptyTrashItem(id)},
  openReminds:function(){A.openLich()},
  openLich:function(){
    if(!lichGuard())return;
    if(S.tab!=="lich"){S.hist=S.hist||[];S.hist.push(S.tab);if(S.hist.length>20)S.hist=S.hist.slice(-20);}
    S.tab="lich";S.selEmp="";S.selProjDet="";S.selCust="";S.selMyAsgn="";S.giaoProj="";S.giaoMode="";S.modal=null;S.form=null;render();
  },
  lichBack:function(){if(S.hist&&S.hist.length)S.tab=S.hist.pop();else S.tab="dash";S.modal=null;S.form=null;render()},
  goReport:function(asgnId,orgHint){
    S._reportReturn={tab:S.tab,selMyAsgn:S.selMyAsgn||asgnId||"",selMyAsgnOrg:S.selMyAsgnOrg||orgHint||""};
    S.reportAsgn=asgnId||"";
    S.selMyAsgn="";S.selMyAsgnOrg="";
    S.tab="report";
    render();
    setTimeout(initReportPreview,50);
  },
  rptAsgn:function(id){S.reportAsgn=id;render();setTimeout(initReportPreview,50)},
  savePassword:function(){
    if(!S.auth||!S.auth.uid)return alert("Cần đăng nhập cloud.");
    var cur=(document.getElementById("set-pw-cur")||{}).value||"";
    var pw=(document.getElementById("set-pw")||{}).value||"";
    var pw2=(document.getElementById("set-pw2")||{}).value||"";
    if(!cur)return alert("Nhập mật khẩu hiện tại để xác nhận.");
    if(!pw||pw.length<6)return alert("Mật khẩu mới cần ít nhất 6 ký tự.");
    if(pw!==pw2)return alert("Mật khẩu xác nhận không khớp.");
    if(cur===pw)return alert("Mật khẩu mới phải khác mật khẩu hiện tại.");
    if(typeof window.__CV3_changePassword!=="function")return alert("Chức năng chưa sẵn sàng — cần deploy Cloud Functions.");
    window.__CV3_changePassword({currentPassword:cur,newPassword:pw})
      .then(function(){
        alert("Đã đổi mật khẩu.");
        var a=document.getElementById("set-pw"),b=document.getElementById("set-pw2"),c=document.getElementById("set-pw-cur");
        if(a)a.value="";if(b)b.value="";if(c)c.value="";
        refreshBioSettingsUI();
      })
      .catch(function(e){alert(e.message||"Không đổi được mật khẩu.");});
  },
  enableBiometric:function(){
    if(!S.auth||!S.auth.uid)return alert("Cần đăng nhập cloud.");
    if(!window.__CV3_bio||typeof window.__CV3_bio.enable!=="function")return alert("Chức năng sinh trắc học chưa sẵn sàng.");
    var pw=(document.getElementById("bio-pw")||{}).value||"";
    if(!pw||pw.length<6)return alert("Nhập mật khẩu hiện tại (≥6 ký tự) để bật sinh trắc học.");
    window.__CV3_bio.enable(pw)
      .then(function(){
        var el=document.getElementById("bio-pw");
        if(el)el.value="";
        alert("Đã bật đăng nhập sinh trắc học trên máy này.");
        refreshBioSettingsUI();
        if(window.__CV3_bio.refreshLoginUI)window.__CV3_bio.refreshLoginUI();
      })
      .catch(function(e){alert((e&&e.message)||"Không bật được sinh trắc học.");});
  },
  disableBiometric:function(){
    if(!window.__CV3_bio||typeof window.__CV3_bio.disable!=="function")return;
    if(!confirm("Tắt đăng nhập sinh trắc học trên máy này?"))return;
    window.__CV3_bio.disable()
      .then(function(){
        alert("Đã tắt sinh trắc học.");
        refreshBioSettingsUI();
        if(window.__CV3_bio.refreshLoginUI)window.__CV3_bio.refreshLoginUI();
      })
      .catch(function(e){alert((e&&e.message)||"Không tắt được.");});
  },
  readCompanyDraft:function(){
    ensureCompanyInfo();
    var co=S.cfg.company;
    var g=function(id){var el=document.getElementById(id);return el?el.value:null;};
    var v;
    v=g("co-name");if(v!=null)co.name=v.trim();
    v=g("co-address");if(v!=null)co.address=v.trim();
    v=g("co-website");if(v!=null)co.website=v.trim();
    v=g("co-phone");if(v!=null)co.phone=v.trim();
    v=g("co-email");if(v!=null)co.email=v.trim();
    (co.custom||[]).forEach(function(f){
      var fl=g("co-fl-"+f.id),fv=g("co-fv-"+f.id);
      if(fl!=null)f.label=fl.trim();
      if(fv!=null)f.value=fv.trim();
    });
  },
  addCompanyField:function(){
    if(!staffGuard())return;
    A.readCompanyDraft();
    ensureCompanyInfo();
    if(S.cfg.company.custom.length>=20)return alert("Tối đa 20 trường tuỳ chỉnh.");
    S.cfg.company.custom.push({id:uid(),label:"",value:""});
    S.cfgOpen=S.cfgOpen||{};S.cfgOpen["cfg-company"]=true;
    render();
    setTimeout(function(){
      var last=S.cfg.company.custom[S.cfg.company.custom.length-1];
      var el=last&&document.getElementById("co-fl-"+last.id);
      if(el)el.focus();
    },30);
  },
  rmCompanyField:function(id){
    if(!staffGuard())return;
    A.readCompanyDraft();
    ensureCompanyInfo();
    S.cfg.company.custom=S.cfg.company.custom.filter(function(f){return f.id!==id});
    S.cfgOpen=S.cfgOpen||{};S.cfgOpen["cfg-company"]=true;
    render();
  },
  saveCompany:function(){
    if(!staffGuard())return;
    A.readCompanyDraft();
    ensureCompanyInfo();
    var co=S.cfg.company;
    co.custom=(co.custom||[]).filter(function(f){return f.label}).map(function(f){return{id:f.id||uid(),label:String(f.label).trim(),value:String(f.value||"").trim()};});
    if(co.email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(co.email))return alert("Email không hợp lệ.");
    auditLog("action","edit_company","Cập nhật thông tin công ty",{name:co.name||""});
    sv();
    S.cfgOpen=S.cfgOpen||{};S.cfgOpen["cfg-company"]=true;
    if(typeof showAppToast==="function")showAppToast("Đã lưu thông tin công ty","ok");
    render();
  },
  saveDirProfile:function(){
    if(!hasFullUI()||!S.auth||!S.auth.uid)return alert("Cần đăng nhập cloud.");
    var dn=(document.getElementById("dir-dn")||{}).value.trim();
    var ageRaw=(document.getElementById("dir-age")||{}).value;
    var age=ageRaw===""?null:Math.round(Number(ageRaw));
    var un=(document.getElementById("dir-un")||{}).value.trim();
    var curPw=(document.getElementById("dir-pw-cur")||{}).value||"";
    var pw=(document.getElementById("dir-pw")||{}).value||"";
    var pw2=(document.getElementById("dir-pw2")||{}).value||"";
    if(!dn)return alert("Nhập họ tên.");
    if(age!==null&&(isNaN(age)||age<1||age>150))return alert("Tuổi phải từ 1 đến 150.");
    if(pw||pw2||curPw){
      if(!curPw)return alert("Nhập mật khẩu hiện tại để đổi mật khẩu.");
      if(pw.length<6)return alert("Mật khẩu mới cần ít nhất 6 ký tự.");
      if(pw!==pw2)return alert("Mật khẩu xác nhận không khớp.");
      if(curPw===pw)return alert("Mật khẩu mới phải khác mật khẩu hiện tại.");
    }
    if(typeof window.__CV3_updateProfile!=="function")return alert("Chức năng chưa sẵn sàng — cần deploy Cloud Functions.");
    var oldUn=S.auth.username||"";
    var chain=window.__CV3_updateProfile({displayName:dn,age:age});
    if(isDir()&&un&&un!==oldUn){
      if(typeof window.__CV3_updateUsername!=="function")return alert("Không đổi được tên đăng nhập — cần deploy Cloud Functions.");
      chain=chain.then(function(res){
        return window.__CV3_updateUsername({username:un}).then(function(u){return Object.assign({},res,u);});
      });
    }
    if(pw)chain=chain.then(function(res){return window.__CV3_changePassword({currentPassword:curPw,newPassword:pw}).then(function(){return res;});});
    chain.then(function(res){
      alert("Đã lưu thông tin tài khoản.");
      if(res.displayName!=null)S.auth.displayName=res.displayName;
      if(res.age!==undefined)S.auth.age=res.age;
      if(res.username)S.auth.username=res.username;
      if(res.empId)S.auth.empId=res.empId;
      if(isDir()){
        S.cfg=Object.assign({},S.cfg,{directorContact:{uid:S.auth.uid,name:res.displayName||S.auth.displayName||"Giám đốc",username:res.username||S.auth.username||""}});
        sv();
      }
      var pwEl=document.getElementById("dir-pw"),pw2El=document.getElementById("dir-pw2"),curEl=document.getElementById("dir-pw-cur");
      if(pwEl)pwEl.value="";if(pw2El)pw2El.value="";if(curEl)curEl.value="";
      render();
    }).catch(function(e){alert(e.message||"Không lưu được.");});
  },
  leaveDaysPreview:function(){
    var start=(document.getElementById("leave-start")||{}).value||td();
    var days=Math.max(1,Math.round(Number((document.getElementById("leave-days")||{}).value||1)));
    var el=document.getElementById("leave-end-hint");
    if(el)el.innerHTML="Nghỉ đến hết ngày: <b>"+dFmt(leaveEndFrom(start,days))+"</b>";
    var prev=document.getElementById("leave-letter-preview");
    if(prev)prev.textContent=leaveLetterPreviewHTML();
  },
  submitLeave:function(){
    if(!S.auth||!S.auth.empId)return alert("Tài khoản chưa gắn hồ sơ nhân sự.");
    if(isDir())return alert("Giám đốc không gửi đơn nghỉ phép tại đây.");
    if(!(isEmp()||isAdminHr()||canOperate()||isSuperviseOnly()||isChiefOnly()))return;
    var start=(document.getElementById("leave-start")||{}).value||"";
    var days=Math.round(Number((document.getElementById("leave-days")||{}).value||0));
    var reason=((document.getElementById("leave-reason")||{}).value||"").trim();
    if(!start)return alert("Chọn ngày bắt đầu nghỉ.");
    if(!(days>=1&&days<=90))return alert("Số ngày nghỉ phải từ 1 đến 90.");
    if(!reason)return alert("Nhập lý do xin nghỉ phép (viết đầy đủ câu).");
    if(reason.length<8)return alert("Vui lòng nêu lý do rõ ràng hơn (ví dụ: Tôi có việc gia đình cần xử lý…).");
    var me=eById(S.auth.empId);
    var recipients=leaveNotifyRecipients();
    if(!recipients.length)return alert("Chưa có giám đốc / Hành chính có tài khoản để nhận đơn.");
    var end=leaveEndFrom(start,days);
    var letter=composeLeaveRequestLetter(me?me.name:"",start,days,reason);
    var btn=document.getElementById("leave-submit");
    if(btn){btn.disabled=true;btn.textContent="Đang gửi…";}
    var finishOk=function(res){
      alert("Đã gửi đơn nghỉ phép — mở bảng tin chung trong tab Nghỉ phép.");
      var rid=res&&res.id;
      S.tab="leave";
      S.leaveBoardId=rid||"";
      S.chatTo="";
      render();
      if(rid)setTimeout(function(){initLeaveBoardScroll();markOpenLeaveBoardRead();},40);
    };
    var finishFail=function(e){
      alert((e&&e.message)||"Không gửi được đơn nghỉ phép.");
      if(btn){btn.disabled=false;btn.textContent="Gửi đơn nghỉ phép";}
    };
    if(typeof window.__CV3_submitLeave==="function"){
      window.__CV3_submitLeave({
        empId:S.auth.empId,
        empName:me?me.name:"",
        startDate:start,
        days:days,
        reason:reason,
        letter:letter,
        notifyTo:recipients
      }).then(finishOk).catch(finishFail);
      return;
    }
    var req={id:uid(),empId:S.auth.empId,empName:me?me.name:"",uid:S.auth.uid||"",startDate:start,endDate:end,days:days,reason:reason,status:"pending",createdAt:Date.now(),rejectReason:"",roomParticipants:leaveRoomParticipants({uid:S.auth.uid})};
    S.leaveReqs=(S.leaveReqs||[]).slice();
    S.leaveReqs.unshift(req);
    ps2Ws("cv3_leave",S.leaveReqs);
    notifyLeaveRoom(letter,req,"leave_req").then(finishOk);
  },
  leaveApprove:function(reqId){
    if(!isDir())return alert("Chỉ giám đốc được duyệt đơn nghỉ phép.");
    var req=leaveReqById(reqId);
    if(!req||req.status!=="pending")return alert("Đơn không còn chờ duyệt.");
    if(!confirm("Đồng ý cho "+(req.empName||"nhân viên")+" nghỉ phép từ "+dFmt(req.startDate)+" đến "+dFmt(req.endDate)+"?"))return;
    var apply=function(){
      var e=eById(req.empId);
      if(e){
        e.leaveStart=req.startDate;
        e.leaveEnd=req.endDate;
        if(td()>=req.startDate&&td()<=req.endDate)e.status="leave";
        sv();
      }
      var text=composeLeaveApproveLetter(req.empName,req.startDate,req.endDate,req.days);
      notifyLeaveRoom(text,req,"leave_decision").then(function(){
        markLeaveBoardRead(req.id);
        alert("Đã duyệt — phản hồi đã vào bảng tin Nghỉ phép.");
        S.tab="leave";S.leaveBoardId=req.id;S.chatTo="";
        render();
        setTimeout(function(){initLeaveBoardScroll();markOpenLeaveBoardRead();},40);
      });
    };
    if(typeof window.__CV3_decideLeave==="function"){
      window.__CV3_decideLeave(reqId,"approved","",req._orgId||"").then(function(){
        req.status="approved";
        req.decidedBy=(S.auth&&S.auth.uid)||"";
        req.decidedByName=(S.auth&&(S.auth.displayName||S.auth.username))||"Giám đốc";
        apply();
      }).catch(function(e){alert(e.message||"Không duyệt được.");});
    }else{
      req.status="approved";
      req.decidedBy=(S.auth&&S.auth.uid)||"";
      req.decidedByName=(S.auth&&(S.auth.displayName||S.auth.username))||"Giám đốc";
      ps2Ws("cv3_leave",S.leaveReqs||[]);
      apply();
    }
  },
  leaveRejectOpen:function(reqId){
    if(!isDir())return;
    var req=leaveReqById(reqId);
    if(!req||req.status!=="pending")return alert("Đơn không còn chờ duyệt.");
    S.leaveReject={reqId:reqId};
    render();
  },
  leaveRejectCancel:function(ev){
    if(ev&&ev.target&&ev.target!==ev.currentTarget)return;
    S.leaveReject=null;render();
  },
  leaveRejectSend:function(){
    if(!isDir())return;
    var f=S.leaveReject||{};
    var req=leaveReqById(f.reqId);
    if(!req||req.status!=="pending")return alert("Đơn không còn chờ duyệt.");
    var reason=((document.getElementById("leave-reject-reason")||{}).value||"").trim();
    if(!reason)return alert("Nhập lý do từ chối và giải pháp bổ sung.");
    var apply=function(){
      S.leaveReject=null;
      var text=composeLeaveRejectLetter(req.empName,req.startDate,req.endDate,req.days,reason);
      notifyLeaveRoom(text,req,"leave_decision").then(function(){
        markLeaveBoardRead(req.id);
        alert("Đã gửi từ chối trên bảng tin Nghỉ phép.");
        S.tab="leave";S.leaveBoardId=req.id;S.chatTo="";
        render();
        setTimeout(function(){initLeaveBoardScroll();markOpenLeaveBoardRead();},40);
      });
    };
    if(typeof window.__CV3_decideLeave==="function"){
      window.__CV3_decideLeave(req.id,"rejected",reason,req._orgId||"").then(function(){
        req.status="rejected";
        req.rejectReason=reason;
        req.decidedBy=(S.auth&&S.auth.uid)||"";
        req.decidedByName=(S.auth&&(S.auth.displayName||S.auth.username))||"Giám đốc";
        apply();
      }).catch(function(e){alert(e.message||"Không từ chối được.");});
    }else{
      req.status="rejected";
      req.rejectReason=reason;
      req.decidedBy=(S.auth&&S.auth.uid)||"";
      req.decidedByName=(S.auth&&(S.auth.displayName||S.auth.username))||"Giám đốc";
      ps2Ws("cv3_leave",S.leaveReqs||[]);
      apply();
    }
  },
  setLeaveReqs:function(rows,opts){
    rows=Array.isArray(rows)?rows:[];
    opts=opts||{};
    if(opts.liveOrg){
      var scope=opts.liveOrg,map={},id;
      (S.leaveReqs||[]).forEach(function(x){
        if(!x||!x.id)return;
        if((x._orgId||"")===scope)return;
        map[(x._orgId||"")+":"+x.id]=x;
      });
      rows.forEach(function(x){
        if(!x||!x.id)return;
        map[(x._orgId||scope)+":"+x.id]=Object.assign({},x,{_orgId:x._orgId||scope});
      });
      rows=[];
      for(id in map){if(Object.prototype.hasOwnProperty.call(map,id))rows.push(map[id]);}
    }
    S.leaveReqs=rows;
    if(S.tab==="leave"||S.tab==="chat"||S.tab==="dash"||S.leaveReject)render();
    else updateRemindBadge();
  },
  submitReport:function(){
    if(!isEmp())return;
    var asgnId=(document.getElementById("rpt-asgn")||{}).value;
    var date=(document.getElementById("rpt-date")||{}).value||td();
    var prog=Number((document.getElementById("rpt-prog")||{}).value||0);
    var note=(document.getElementById("rpt-note")||{}).value.trim();
    var fileInp=document.getElementById("rpt-photos");
    var files=fileInp&&fileInp.files?Array.prototype.slice.call(fileInp.files):[];
    if(!asgnId)return alert("Chọn công việc cần báo cáo.");
    if(!note)return alert("Nhập ghi chú — mô tả đã làm gì và khó khăn gặp phải.");
    if(prog<0||prog>100)return alert("Tiến độ phải từ 0 đến 100%.");
    var selEl=document.getElementById("rpt-asgn");
    var orgHint=(selEl&&selEl.options[selEl.selectedIndex]&&selEl.options[selEl.selectedIndex].getAttribute("data-org"))||"";
    var a=asgnById(asgnId,orgHint);
    if(!a){
      var fromActs=empActs(S.auth.empId).find(function(x){return x.id===asgnId&&(!orgHint||x._orgId===orgHint||!x._orgId)});
      a=fromActs||null;
    }
    if(!a||String(a.empId)!==String(S.auth.empId))return alert("Công việc không hợp lệ.");
    if(typeof window.__CV3_submitReport!=="function")return alert("Cần đăng nhập cloud để gửi báo cáo.");
    var reportOrg=a._orgId||orgHint||currentOrgId();
    var btn=document.getElementById("rpt-submit");
    if(btn){btn.disabled=true;btn.textContent="Đang gửi…";}
    window.__CV3_submitReport({asgnId:asgnId,orgId:reportOrg,date:date,prog:prog,note:note,photos:files})
      .then(function(){
        var ret=S._reportReturn;
        S._reportReturn=null;
        S.reportAsgn="";
        // Quay lại trang trước (chi tiết công việc) — xác nhận đã lưu xong
        S.tab="mywork";
        S.selMyAsgn=(ret&&ret.selMyAsgn)||asgnId;
        S.selMyAsgnOrg=(ret&&ret.selMyAsgnOrg)||reportOrg||"";
        alert("Đã gửi báo cáo ngày "+dFmt(date)+".");
        render();
      })
      .catch(function(e){
        alert(e.message||"Không gửi được báo cáo.");
        if(btn){btn.disabled=false;btn.textContent="Gửi báo cáo";}
      });
  },
  attStart:function(type){
    if(!isEmp())return;
    var recs=attRecordsToday();
    var last=recs.length?recs[recs.length-1]:null;
    var expected=(!last||last.type==="out")?"in":"out";
    if(type!==expected){
      if(expected==="in")return alert("Hãy chấm vào trước.");
      return alert("Bạn đã chấm vào rồi, cần chấm ra trước.");
    }
    S.tab="chamcong";
    S.attFlow={type:type,step:"photo",lat:null,lng:null,punchId:String(Date.now()),needsReason:attNeedsReason(type,new Date())};
    render();
    setTimeout(initAttPreview,50);
    if(navigator.geolocation){
      navigator.geolocation.getCurrentPosition(function(pos){
        if(!S.attFlow)return;
        S.attFlow=Object.assign({},S.attFlow,{lat:pos.coords.latitude,lng:pos.coords.longitude});
      },function(){},{enableHighAccuracy:true,timeout:15000,maximumAge:120000});
    }
  },
  attCancel:function(ev){
    if(!overlayDismissOk(ev))return;
    S.attFlow=null;
    render();
  },
  attDoneClose:function(){
    S.attFlow=null;
    render();
  },
  attMonthPick:function(v){
    S.attMonth=v||attMonthKey();
    render();
    if(typeof window.__CV3_ensureAttendanceMonth==="function"){
      var empId=canViewAttCompany()?undefined:((isEmp()&&S.auth&&S.auth.empId)?S.auth.empId:(S.selEmp||""));
      window.__CV3_ensureAttendanceMonth(S.attMonth,empId||undefined).then(function(rows){
        if(rows&&rows.length)render();
      }).catch(function(e){console.warn("att history:",e);});
    }
  },
  attSubmit:function(){
    if(!isEmp()||!S.attFlow)return;
    var f=S.attFlow;
    var punchId=f.punchId||String(Date.now());
    var payload={type:f.type,date:td(),punchId:punchId,lat:f.lat,lng:f.lng};
    if(f.type==="in"){
      var inp=document.getElementById("att-photo-in");
      if(!inp||!inp.files||!inp.files.length)return alert("Chụp 1 ảnh nhà máy / công trường.");
      payload.sitePhoto=inp.files[0];
    }else{
      var winp=document.getElementById("att-photo-out");
      var files=winp&&winp.files?Array.prototype.slice.call(winp.files):[];
      if(files.length<3)return alert("Chấm ra cần ít nhất 3 ảnh công việc đã làm.");
      payload.workPhotos=files;
    }
    if(attNeedsReason(f.type,new Date())){
      var reasonEl=document.getElementById("att-late-reason");
      var reason=reasonEl?String(reasonEl.value||"").trim():"";
      if(!reason)return alert(attEvaluatePunch(f.type,new Date()).label+" — cần ghi rõ lý do giải trình cho KPI.");
      payload.lateReason=reason;
    }
    if(typeof window.__CV3_submitAttendance!=="function")return alert("Cần đăng nhập cloud để chấm công.");
    S.attFlow=Object.assign({},f,{step:"submitting"});
    render();
    window.__CV3_submitAttendance(payload)
      .then(function(res){
        var doneAt=res&&res.at?new Date(res.at):new Date();
        S.attFlow={type:f.type,step:"done",doneAt:doneAt.toISOString(),punchId:punchId};
        render();
      })
      .catch(function(e){
        alert(e.message||"Không chấm công được.");
        S.attFlow=Object.assign({},f,{step:"photo"});
        render();
        setTimeout(initAttPreview,50);
      });
  },
  arrivalStart:function(reminderId,asgnId){
    if(!isEmp())return;
    S.tab="mywork";
    S.arrivalFlow={reminderId:reminderId||"",asgnId:asgnId,step:"gps",lat:null,lng:null,gpsErr:""};
    S.modal=null;S.attFlow=null;
    render();
    setTimeout(function(){A.arrivalFetchGps();},80);
  },
  arrivalCancel:function(ev){
    if(!overlayDismissOk(ev))return;
    S.arrivalFlow=null;
    render();
  },
  arrivalFetchGps:function(){
    if(!S.arrivalFlow||S.arrivalFlow.step!=="gps")return;
    if(!navigator.geolocation){
      S.arrivalFlow=Object.assign({},S.arrivalFlow,{gpsErr:"Thiết bị không hỗ trợ GPS."});
      render();
      return;
    }
    navigator.geolocation.getCurrentPosition(
      function(pos){
        if(!S.arrivalFlow)return;
        S.arrivalFlow=Object.assign({},S.arrivalFlow,{lat:pos.coords.latitude,lng:pos.coords.longitude,gpsErr:""});
        render();
      },
      function(err){
        if(!S.arrivalFlow)return;
        var msg="Không lấy được vị trí.";
        if(err&&err.code===1)msg="Bạn chưa cho phép truy cập vị trí — bật trong cài đặt trình duyệt.";
        else if(err&&err.code===2)msg="Không xác định được vị trí — thử ra ngoài trời hoặc bật GPS.";
        else if(err&&err.code===3)msg="Hết thời gian chờ GPS — thử lại.";
        S.arrivalFlow=Object.assign({},S.arrivalFlow,{gpsErr:msg});
        render();
      },
      {enableHighAccuracy:true,timeout:20000,maximumAge:60000}
    );
  },
  arrivalToPhoto:function(){
    if(!S.arrivalFlow||S.arrivalFlow.lat==null)return alert("Chưa có vị trí GPS.");
    S.arrivalFlow=Object.assign({},S.arrivalFlow,{step:"photo"});
    render();
    setTimeout(initArrivalPreview,50);
  },
  arrivalSubmit:function(){
    if(!isEmp()||!S.arrivalFlow)return;
    var f=S.arrivalFlow;
    if(f.lat==null||f.lng==null)return alert("Chưa có vị trí GPS.");
    var inp=document.getElementById("arr-photo");
    if(!inp||!inp.files||!inp.files.length)return alert("Chụp ảnh tại vị trí mới.");
    var a=asgnById(f.asgnId);
    if(typeof window.__CV3_confirmArrival!=="function")return alert("Cần đăng nhập cloud để xác nhận.");
    S.arrivalFlow=Object.assign({},f,{step:"submitting"});
    render();
    window.__CV3_confirmArrival({
      asgnId:f.asgnId,
      reminderId:f.reminderId||"",
      lat:f.lat,
      lng:f.lng,
      locationLabel:asgnLocLabel(a),
      photo:inp.files[0]
    }).then(function(){
      showAppToast("Đã xác nhận đến vị trí mới","ok");
      S.arrivalFlow=null;
      render();
    }).catch(function(e){
      alert(e.message||"Không gửi được xác nhận.");
      S.arrivalFlow=Object.assign({},f,{step:"photo"});
      render();
      setTimeout(initArrivalPreview,50);
    });
  },
  selectChatTo:function(val){
    if(isLeaveChatTo(val)){A.openLeaveRoom(leaveIdFromChatTo(val));return;}
    S.chatTo=val||defaultChatTo();render();setTimeout(function(){initChatScroll();markOpenChatRead();},30);
  },
  openLeaveRoom:function(reqId){
    var id=String(reqId||"").trim();
    if(!id)return;
    S.tab="leave";
    S.leaveBoardId=id;
    S.chatTo="";
    render();
    setTimeout(function(){initLeaveBoardScroll();markOpenLeaveBoardRead();},30);
  },
  leaveBoardBack:function(){S.leaveBoardId="";render();},
  chatBack:function(){S.chatTo="";render();},
  hideChat:function(id){
    S.cfg.hiddenChats = S.cfg.hiddenChats || {};
    S.cfg.hiddenChats[id] = Date.now();
    sv();
    render();
  },
  newChat:function(){
    var rec=chatRecipients();
    var opts='<option value="">— Chọn người nhận —</option>';
    if(canOperate()) opts+='<option value="broadcast">📢 Gửi tất cả (Thông báo chung)</option>';
    rec.forEach(function(r){
      opts+='<option value="'+r.empId+'">'+esc(r.name)+(r.isDir?" ★":"")+' · '+esc(r.group)+'</option>';
    });
    var body=fld("Người nhận",'<select id="nc-to">'+opts+'</select>');
    S.modal=mw("Thảo luận mới",body,btn("btn-primary","Bắt đầu","A.startNewChat()"));
    render();
  },
  startNewChat:function(){
    var to=document.getElementById("nc-to").value;
    if(!to) return alert("Vui lòng chọn người nhận.");
    S.modal=null;
    A.selectChatTo(to);
  },
  chatSend:function(){
    var inp=document.getElementById("chat-input");
    var t=inp?inp.value:"";
    if(!t.trim())return;
    var chatTo,opts;
    if(S.tab==="leave"&&S.leaveBoardId){
      chatTo=leaveRoomKey(S.leaveBoardId);
    }else{
      ensureChatTo();
      chatTo=S.chatTo;
    }
    if(chatTo==="broadcast"){
      if(!canOperate())return alert("Chỉ giám đốc hoặc Điều hành mới được gửi thông báo toàn đội.");
      opts={type:"broadcast"};
    }else if(isLeaveChatTo(chatTo)){
      var lid=leaveIdFromChatTo(chatTo);
      var req=leaveReqById(lid)||{id:lid,uid:""};
      var parts=leaveRoomParticipants(req);
      if(parts.length<2)return alert("Chưa đủ người tham gia bảng tin nghỉ phép (cần giám đốc / Hành chính có tài khoản).");
      opts={type:"leave",leaveReqId:lid,participants:parts,kind:"leave_chat",forOrg:req._orgId||""};
    }else{
      var r=chatRecipientById(chatTo);
      if(!r)return alert("Chọn người nhận để gửi tin.");
      if(!r.hasAccount||!r.uid){
        if(r.pending)return alert("«"+r.name+"» đang được tạo tài khoản — đợi vài giây rồi thử lại.");
        return alert("«"+r.name+"» chưa có tài khoản đăng nhập — giám đốc đăng nhập để hệ thống tự tạo tài khoản từ danh sách nhân sự.");
      }
      opts={type:"dm",toUid:r.uid,toName:r.name};
    }
    if(typeof window.__CV3_sendChat==="function"){
      window.__CV3_sendChat(t,opts).then(function(){if(inp)inp.value="";}).catch(function(e){
        var msg=e&&e.message?e.message:"";
        if(!msg||msg.indexOf("Missing or insufficient permissions")>=0){
          msg=opts.type==="broadcast"
            ?"Không có quyền gửi thông báo toàn đội."
            :(opts.type==="leave"
              ?"Không có quyền gửi trên bảng tin nghỉ phép."
              :"Không có quyền gửi tin nhắn riêng. Người nhận cần có tài khoản trong cùng tổ chức.");
        }
        alert(msg||"Không gửi được tin nhắn.");
      });
    }else alert("Chat cần đăng nhập cloud.");
  },
  myworkDet:function(id,orgHint){
    S.selMyAsgn=id;S.selMyAsgnOrg=orgHint||"";render();
    if(id&&typeof window.__CV3_ackAssignment==="function"){
      window.__CV3_ackAssignment(id,"read").catch(function(){});
    }
    if(id&&S.auth&&S.auth.empId){
      var a=asgnById(id,orgHint);
      if(a&&a.empId===S.auth.empId&&!a.readAt){
        a.readAt=new Date().toISOString();
        if(!a.deliveredAt)a.deliveredAt=a.readAt;
        updateRemindBadge();
      }
    }
  },
  myworkBack:function(){S.selMyAsgn="";S.selMyAsgnOrg="";render()},
  empDet:function(id){if(isFieldPortal())return;if(!canViewEmpTab())return;var e=eById(id);if(e&&!isStaffEmp(e))return alert("Hồ sơ giám đốc quản lý tại Cài đặt → Tài khoản.");if(S.tab!=="emp"){S.hist=S.hist||[];S.hist.push(S.tab);if(S.hist.length>20)S.hist=S.hist.slice(-20);}S.tab="emp";S.selEmp=id;S.selProjDet="";S.selCust="";S.modal=null;S.form=null;render()},
  empAsgnCard:function(id,orgHint){var a=asgnById(id,orgHint);if(!a)return;S.modal=empAsgnCardM(a);render()},
  toggleEmpOrg:function(empId,orgId,on){
    if(!canManageStaff())return;
    var e=eById(empId);if(!e)return;
    if(e.group==="Chỉ huy trưởng"){e.orgIds=chiefOrgIds();sv();render();return;}
    var ids=empOrgIds(e).slice();
    var ix=ids.indexOf(orgId);
    if(on&&ix<0)ids.push(orgId);
    if(!on&&ix>=0)ids.splice(ix,1);
    if(!ids.length){alert("Nhân viên phải thuộc ít nhất 1 đội.");render();return;}
    ids=forceChiefScope(e.group,ids);
    e.orgIds=ids;
    S.empAll=(S.empAll||S.emp.slice()).map(function(x){return x.id===empId?Object.assign({},x,{orgIds:ids}):x});
    var cur=currentOrgId();
    S.emp=S.empAll.filter(function(x){return empOrgIds(x).indexOf(cur)>=0});
    sv();
    if(typeof window.__CV3_setEmpOrgMembership==="function"){
      window.__CV3_setEmpOrgMembership(empId,ids).catch(function(err){console.warn(err);});
    }
    render();
  },
  copyCust:function(){
    alert("Khách hàng đã dùng chung cả 2 đội — không cần sao chép.");
  },
  empBack:function(){S.selEmp="";render()},
  custDet:function(id){if(!custViewGuard())return;S.tab="cust";S.selCust=id;S.selEmp="";S.selProjDet="";S.modal=null;S.form=null;render()},
  custBack:function(){S.selCust="";render()},
  provisionAll:function(){
    if(!staffGuard())return;
    if(typeof window.__CV3_provisionAllEmployees!=="function")return alert("Cần đăng nhập cloud để tạo tài khoản.");
    window.__CV3_provisionAllEmployees(true)
      .then(function(data){
        var n=data&&(data.created||data.linked)||0;
        alert(n?"Đã tạo/liên kết "+n+" tài khoản.":"Tất cả nhân viên đã có tài khoản hoặc không thể tạo thêm.");
        render();
      })
      .catch(function(e){alert(e.message||"Không tạo được tài khoản.");});
  },
  egv:function(){
    if(!giaoGuard())return;
    var emp=eById(S.selEmp);if(!emp)return;
    if(isAdminHrEmp(emp))return alert("Hành chính không cần giao việc / chấm công hiện trường — họ theo dõi nghỉ phép và chấm công để tính lương.");
    if(isOversightEmp(emp))return alert("Giám sát / Điều hành không cần giao việc theo dự án — họ theo dõi theo phạm vi đội được gán.");
    var defWork=isChiefEmp(emp)?"Kiểm tra / báo cáo tình trạng thi công":"";
    S.form={type:"egiao",workContent:defWork,startDate:td(),endDate:dAdd(td(),14),custId:"",custName:"",contact:"",taskKind:isChiefEmp(emp)?"chief":""};
    S.modal=empGiaoM(S.form,emp.name);render();
  },
  egc:function(id){var c=cById(id),cn=document.getElementById("egcn"),ct=document.getElementById("egct");if(!cn)return;if(!c){cn.value="";if(ct)ct.value="";return;}cn.value=custDisplayName(c);if(ct)ct.value=c.contact||""},
  custPickToggle:function(inputId){
    var drop=document.getElementById(inputId+"-drop");
    var btn=document.getElementById(inputId+"-btn");
    if(!drop||!btn)return;
    var willOpen=!drop.classList.contains("open");
    closeAllCustPicks(willOpen?inputId:"");
    if(!willOpen){drop.classList.remove("open");btn.classList.remove("open");return;}
    drop.classList.add("open");btn.classList.add("open");
    var q=document.getElementById(inputId+"-q");
    if(q){q.value="";A.custPickFilter(inputId);setTimeout(function(){q.focus();},30);}
  },
  custPickFilter:function(inputId){
    var wrap=document.getElementById("cust-pick-"+inputId);
    var list=document.getElementById(inputId+"-list");
    var qEl=document.getElementById(inputId+"-q");
    var hid=document.getElementById(inputId);
    if(!wrap||!list)return;
    list.innerHTML=custPickListHTML(inputId,qEl?qEl.value:"",{
      sel:hid?hid.value:"",
      empId:wrap.getAttribute("data-emp")||"",
      emptyLabel:wrap.getAttribute("data-empty")||"— Không liên kết —",
      required:wrap.getAttribute("data-required")==="1"
    });
  },
  custPickSel:function(inputId,custId){
    var hid=document.getElementById(inputId);
    var lbl=document.getElementById(inputId+"-lbl");
    var wrap=document.getElementById("cust-pick-"+inputId);
    var emptyLabel=wrap?wrap.getAttribute("data-empty"):"— Không liên kết —";
    if(hid)hid.value=custId||"";
    if(lbl)lbl.textContent=custPickLabel(custId,{emptyLabel:emptyLabel||"— Không liên kết —"});
    if(S.form&&(inputId==="fcu"||inputId==="egcu"))S.form.custId=custId||"";
    closeAllCustPicks();
    if(inputId==="fcu")A.ppc(custId||"");
    if(inputId==="egcu")A.egc(custId||"");
  },
  seg:function(){
    if(!giaoGuard())return;
    if(!S.selEmp||!S.form||S.form.type!=="egiao")return;
    var emp=eById(S.selEmp);if(!emp)return;
    if(isAdminHrEmp(emp))return alert("Hành chính không cần giao việc / chấm công hiện trường — họ theo dõi nghỉ phép và chấm công để tính lương.");
    if(isOversightEmp(emp))return alert("Giám sát / Điều hành không cần giao việc theo dự án — họ xem theo phạm vi đội được gán.");
    var custId=document.getElementById("egcu").value||"";
    if(custId&&empCustBlocked(S.selEmp,custId))return alert("Nhân viên này đang làm dự án chưa hoàn tất tại khách hàng đó — chọn khách hàng khác.");
    var workContent=document.getElementById("egw").value.trim();if(!workContent)return alert("Nhập nội dung công việc");
    var startDate=document.getElementById("egsd").value||td(),endDate=document.getElementById("eged").value||dAdd(startDate,14);
    if(endDate<startDate)return alert("Ngày kết thúc phải sau ngày bắt đầu");
    var custName=document.getElementById("egcn").value.trim(),contact=document.getElementById("egct").value.trim();
    var c=custId?cById(custId):null,prov=c&&c.province?c.province:emp.province;
    var arriveRaw=readArriveAtInput("eg-arrive");
    if(arriveRaw==="invalid")return alert("Giờ có mặt không hợp lệ.");
    var conflictObj = checkAssignmentConflict(emp.id, custId, arriveRaw, prov, startDate, endDate);
    if(conflictObj.hasWarning){
      S.conflictPending={
        kind:"egiao",
        empId:emp.id,custId:custId,custName:custName,contact:contact,workContent:workContent,
        startDate:startDate,endDate:endDate,province:prov,arriveRaw:arriveRaw||"",
        overlapIds:conflictObj.overlapIds.slice(),overlaps:conflictObj.overlaps.slice(),
        overlapLines:conflictObj.reasonLines.slice(),travelLines:conflictObj.travelMsgs||[],
        reasonLines:conflictObj.reasonLines.slice(),suggestStart:conflictObj.suggestStart||"",
        suggestTravelDays:conflictObj.suggestTravelDays||0,
        _origStart:startDate,_origEnd:endDate
      };
      S.modal=conflictResolveM(S.conflictPending);render();return;
    }
    A._commitEgio(null);
  },
  _commitEgio:function(resolution){
    if(!giaoGuard())return;
    var pend=S.conflictPending,emp,custId,workContent,startDate,endDate,custName,contact,prov,arriveRaw;
    if(pend&&pend.kind==="egiao"){
      emp=eById(pend.empId);if(!emp)return;
      custId=pend.custId;workContent=pend.workContent;startDate=pend.startDate;endDate=pend.endDate;
      custName=pend.custName;contact=pend.contact;prov=pend.province;arriveRaw=pend.arriveRaw||"";
    }else{
      emp=eById(S.selEmp);if(!emp||!S.form||S.form.type!=="egiao")return;
      custId=document.getElementById("egcu").value||"";
      workContent=document.getElementById("egw").value.trim();
      startDate=document.getElementById("egsd").value||td();
      endDate=document.getElementById("eged").value||dAdd(startDate,14);
      custName=document.getElementById("egcn").value.trim();
      contact=document.getElementById("egct").value.trim();
      var c0=custId?cById(custId):null;prov=c0&&c0.province?c0.province:emp.province;
      arriveRaw=readArriveAtInput("eg-arrive");
      if(arriveRaw==="invalid")arriveRaw="";
    }
    var c=custId?cById(custId):null;
    var finalStart=startDate,finalEnd=endDate,scheduleAdj=null,schedNotify=null;
    if(resolution==="delay"&&pend&&pend.overlaps&&pend.overlaps.length){
      var delayed=delayDatesAfterOverlaps(pend.overlaps,startDate,endDate,pend.suggestTravelDays||0);
      if(pend.suggestStart&&pend.suggestStart>delayed.startDate){
        var span0=asgnDaySpan(startDate,endDate);
        delayed={startDate:pend.suggestStart,endDate:dAdd(pend.suggestStart,span0-1)};
      }
      finalStart=delayed.startDate;finalEnd=delayed.endDate;
      var delayMsg="Việc «"+workContent+"» được dời sang "+dFmtG(finalStart)+" → "+dFmtG(finalEnd)+" (sau khi hoàn tất việc đang làm / đủ thời gian di chuyển).";
      scheduleAdj={type:"delay_after",prevStart:startDate,prevEnd:endDate,at:td()};
      schedNotify={at:Date.now(),type:"delay",msg:delayMsg};
    }else if(resolution==="pause"&&pend&&pend.overlapIds&&pend.overlapIds.length){
      applyPauseForNewJob(pend.overlapIds,startDate,endDate,workContent);
      pend.overlapIds.forEach(function(oid){
        var oa=asgnById(oid);if(!oa)return;
        logProjEvent(oa.projId,"pause",{empId:emp.id,empName:emp.name,text:"Tạm hoãn ưu tiên việc mới «"+workContent+"»",meta:{asgnId:oid}});
      });
    }
    var projName=workContent.length>60?workContent.slice(0,57)+"…":workContent;
    var isChief=isChiefEmp(emp);
    var proj={id:uid(),name:projName,custId:custId,customer:custName,province:prov,type:"repair",group:isChief?defaultFieldGroup():emp.group,priority:"normal",startDate:finalStart,deadline:finalEnd,status:"in_progress",note:contact?"Liên hệ: "+contact:"",participantIds:isChief?[]:[emp.id],toTruongId:"",vatTuId:""};
    S.proj.push(proj);
    logProjEvent(proj.id,"proj_create",{text:"Tạo dự án «"+projName+"»"+(isChief?" · việc kiểm tra Chỉ huy trưởng":"")});
    var na=mkAsgn(emp.id,proj.id,0,{startDate:finalStart,endDate:finalEnd,workContent:workContent||(isChief?"Kiểm tra / báo cáo tình trạng thi công":""),custName:custName||(c?custDisplayName(c):""),contact:contact||(c?c.contact||"":""),scheduleAdj:scheduleAdj,schedNotify:schedNotify,taskKind:isChief?"chief":undefined});
    if(arriveRaw){na.arriveAt=arriveRaw;addArrivalReminder(emp.id,na.id,arriveRaw,asgnLocLabel(na));}
    S.asgn.push(na);
    recordAssign(proj.id,emp,na,(isChief?" (kiểm tra Chỉ huy trưởng)":"")+(resolution==="delay"?" (dời lịch)":resolution==="pause"?" (ưu tiên, tạm dừng việc cũ)":""));
    applyProjLocToEmp(emp,proj,finalStart);
    S.conflictPending=null;sv();
    var empNameDone=emp.name||"nhân viên";
    A.egiaoExit();
    alert(isChief?("Đã giao việc kiểm tra cho "+empNameDone+" (không tính vào tiến độ dự án)."):("Đã giao việc cho "+empNameDone+"."));
  },
  /** Đóng form giao việc (NV) — về trang chi tiết nhân viên đã mở form. */
  egiaoExit:function(){
    S.modal=null;S.form=null;S.conflictPending=null;S.attFlow=null;S.arrivalFlow=null;
    // Giữ S.selEmp / tab emp → trang chi tiết nhân viên (trang trước của form)
    render();
  },
  /** Huỷ form giao việc NV: không lưu, quay lại trang trước. */
  egiaoCancel:function(ev){
    if(!overlayDismissOk(ev))return;
    A.egiaoExit();
  },
  projDet:function(id){
    if(isFieldPortal())return;
    if(!tabAllowed("proj"))return;
    if(S.tab!=="proj"){S.hist=S.hist||[];S.hist.push(S.tab);if(S.hist.length>20)S.hist=S.hist.slice(-20);}
    S.tab="proj";S.selProjDet=id;S.selEmp="";S.selCust="";S.giaoProj="";S.giaoMode="";S.goiYReq={};S.giaoPick={};S.teamToTruong="";S.teamVatTu="";S.editAsgnProg=null;S.modal=null;S.form=null;
    // Đội dự án = đã giao việc: tự tạo phân công thiếu (vd. đa hạng mục trước đây bỏ sót)
    var pHeal=pById(id);
    if(pHeal&&!isProjLocked(pHeal)&&canGiao()){
      var healed=ensureTeamHaveAsgn(pHeal);
      if(healed){
        S.proj=S.proj.map(function(x){return x.id===pHeal.id?pHeal:x});
        sv();
      }
    }
    render();
  },
  projBack:function(){S.selProjDet="";S.giaoProj="";S.giaoMode="";S.goiYReq={};S.giaoPick={};S.teamToTruong="";S.teamVatTu="";S.editAsgnProg=null;if(S.hist&&S.hist.length)S.tab=S.hist.pop();render()},
  teamOpen:function(id){A.giaoOpen(id)},
  teamBack:function(){A.giaoBack()},
  projView:function(v){S.projView=v==="done"?"done":"active";S.selProjDet="";S.giaoProj="";render()},
  ganttZoom:function(dir){
    var steps=[0.75,1,1.25,1.5,2,2.5];
    var cur=ganttZoomFactor(),i=0,best=1e9;
    for(var k=0;k<steps.length;k++){
      var d=Math.abs(steps[k]-cur);
      if(d<best){best=d;i=k;}
    }
    i=Math.max(0,Math.min(steps.length-1,i+(dir>0?1:-1)));
    if(steps[i]===cur)return;
    S.ganttZoom=steps[i];
    render();
  },
  teamSave:function(){
    if(!giaoGuard())return;
    var p=pById(S.giaoProj);if(!p)return;
    if(!projLockedGuard(p))return;
    var items=normWorkItems(p);
    if(!items.length)return alert("Dự án chưa có hạng mục công việc. Hãy sửa dự án để thêm hạng mục trước khi giao việc.");
    collectGiaoItemStaff(p);
    var oldTT=p.toTruongId||"",oldVT=p.vatTuId||"";
    var keep=filterFieldEmpIds(curGiaoPartIds());
    if(!keep.length)return alert("Chọn ít nhất một nhân viên để giao việc.");
    // Thêm vào đội mà chưa tick hạng mục → mặc định giao tất cả hạng mục
    keep.forEach(function(eid){
      var any=items.some(function(w){return S.giaoItemStaff[w.id]&&S.giaoItemStaff[w.id][eid]});
      if(any)return;
      items.forEach(function(w){
        if(!S.giaoItemStaff[w.id])S.giaoItemStaff[w.id]={};
        S.giaoItemStaff[w.id][eid]={pct:""};
      });
    });
    var loadErr=validateEmpItemLoads(items,S.giaoItemStaff,keep);
    if(loadErr)return alert(loadErr);
    var normLoads=normalizeEmpItemLoads(items,S.giaoItemStaff);
    var keepMap={};keep.forEach(function(id){keepMap[id]=1});
    var tt=canManageStaff()?S.teamToTruong:p.toTruongId;
    var vt=canManageStaff()?S.teamVatTu:p.vatTuId;
    if(tt&&!keepMap[tt])tt="";
    if(vt&&!keepMap[vt])vt="";
    applyProjTeam(p,keep,tt,vt);
    if(canManageStaff())logTeamRoleChanges(p,oldTT,oldVT);
    var dates=asgnDates(p);
    var created=0,updated=0,dropped=0;
    // Bỏ NV khỏi đội → huỷ phân công (không đánh dấu hoàn thành)
    var dropAsgns=[];
    S.asgn=S.asgn.filter(function(a){
      if(a.projId!==p.id||isChiefAsgn(a))return true;
      if(a.status!=="active"&&a.status!=="paused"&&a.status!=="queued")return true;
      if(keepMap[a.empId])return true;
      // Không xoá phân công trên hạng mục đã xác nhận (trừ giám đốc)
      if(!isDir()&&a.workItemId&&workItemIsConfirmed(p,a.workItemId))return true;
      dropAsgns.push(a);
      return false;
    });
    dropAsgns.forEach(function(a){
      moveToTrash("asgn",a);
      logProjEvent(p.id,"unassign",{empId:a.empId,text:"Bỏ khỏi đội — huỷ giao việc (không tính hoàn thành)",meta:{asgnId:a.id,reason:"team_remove"}});
      dropped++;
    });
    // Đồng bộ phân công theo hạng mục + %
    keep.forEach(function(eid){
      var emp=eById(eid);if(!emp||isOfficeStaffEmp(emp))return;
      items.forEach(function(w){
        if(w.confirmedDone&&!isDir())return; // hạng mục đã khoá thống kê
        var pct=normLoads[w.id]&&normLoads[w.id][eid]?Number(normLoads[w.id][eid].pct)||0:0;
        var existing=(S.asgn||[]).find(function(a){
          return a.projId===p.id&&a.empId===eid&&a.workItemId===w.id&&(a.status==="active"||a.status==="paused"||a.status==="queued");
        });
        if(pct>0){
          var unlocked=workItemUnlocked(p,w.id);
          var cell=S.giaoItemStaff[w.id]&&S.giaoItemStaff[w.id][eid];
          var manual=giaoPctIsManual(cell);
          if(existing){
            existing.loadPct=pct;
            existing.loadPctManual=manual;
            existing.workContent=w.title||existing.workContent;
            if(existing.status==="queued"&&unlocked)existing.status="active";
            updated++;
          }else{
            var na=mkAsgn(eid,p.id,0,{
              startDate:dates.start,
              endDate:dates.end,
              workContent:w.title,
              workItemId:w.id,
              loadPct:pct,
              loadPctManual:manual,
              status:unlocked?"active":"queued"
            });
            S.asgn.push(na);
            recordAssign(p.id,emp,na," · "+w.title+" ("+pct+"%"+(manual?"":" · auto")+")");
            applyProjLocToEmp(emp,p,dates.start);
            created++;
          }
        }else if(existing){
          // Bỏ tick hạng mục → huỷ giao việc đó (không tính hoàn thành)
          moveToTrash("asgn",existing);
          S.asgn=S.asgn.filter(function(x){return x.id!==existing.id});
          logProjEvent(p.id,"unassign",{empId:eid,text:"Bỏ hạng mục «"+(w.title||"")+"» — huỷ giao việc",meta:{asgnId:existing.id,reason:"item_uncheck"}});
          dropped++;
        }
      });
      // Đóng asgn legacy (không có workItemId) khi đã có phân công theo hạng mục
      S.asgn=S.asgn.filter(function(a){
        if(a.projId!==p.id||a.empId!==eid||isChiefAsgn(a))return true;
        if(a.status!=="active"&&a.status!=="paused"&&a.status!=="queued")return true;
        if(a.workItemId)return true;
        moveToTrash("asgn",a);
        logProjEvent(p.id,"unassign",{empId:eid,text:"Huỷ giao việc cũ (không hạng mục)",meta:{asgnId:a.id,reason:"legacy_clear"}});
        dropped++;
        return false;
      });
    });
    if(p.status==="open")p.status="in_progress";
    p.group=deriveProjGroupFromAssign(keepMap,p.group||defaultFieldGroup());
    activateQueuedWorkItems(p.id);
    S.proj=S.proj.map(function(x){return x.id===p.id?p:x});
    sv();
    A.giaoBack();
    alert("Đã lưu giao việc — "+keep.length+" người · "+created+" việc mới"+(updated?" · cập nhật "+updated:"")+(dropped?" · bỏ "+dropped:"")+".");
  },
  giaoOpen:function(id){
    if(!giaoGuard())return;
    var p=pById(id);if(!p)return;
    if(!projLockedGuard(p))return;
    S.selProjDet=id;S.giaoProj=id;S.giaoMode="team";S.goiYReq={};initGiaoTeamState(id);
    render();
  },
  goiYOpen:function(id){A.giaoOpen(id)},
  goiYFromGiao:function(){},
  goiYReqTog:function(){},
  goiYCalc:function(){},
  sp:function(id){S.selProj=id;render()},
  asgn:function(eid){
    if(!giaoGuard())return;
    var emp=eById(eid);if(!emp)return;
    if(isAdminHrEmp(emp))return alert("Hành chính không cần giao việc / chấm công hiện trường — họ theo dõi nghỉ phép và chấm công để tính lương.");
    if(isOversightEmp(emp))return alert("Giám sát / Điều hành không cần giao vào dự án — họ xem theo phạm vi đội được gán.");
    var proj=pById(S.selProj);var dates=proj?asgnDates(proj):{start:td(),end:""};
    var na=mkAsgn(eid,S.selProj,0,{startDate:dates.start,endDate:dates.end});
    S.asgn.push(na);
    recordAssign(S.selProj,emp,na,"");
    if(emp&&proj)applyProjLocToEmp(emp,proj,dates.start);
    if(proj&&proj.status==="open"){proj.status="in_progress";S.proj=S.proj.map(function(x){return x.id===proj.id?proj:x})}
    sv();render();
  },
  giaoBack:function(){
    S.giaoProj="";S.giaoMode="";S.goiYReq={};S.giaoPick={};S.giaoItemStaff={};S.giaoSched={};S.giaoWarn={};S.teamToTruong="";S.teamVatTu="";
    render();
  },
  giaoTog:function(eid){
    var emp=eById(eid);
    if(isEmpOnLeave(emp))return alert((empLeaveLabel(emp)||"Nhân viên đang nghỉ phép")+" — không thể chọn giao việc.");
    if(isAdminHrEmp(emp))return alert("Hành chính không cần giao việc / chấm công hiện trường — họ theo dõi nghỉ phép và chấm công để tính lương.");
    if(isOversightEmp(emp))return alert("Giám sát / Điều hành không cần thêm vào đội dự án — họ theo dõi theo phạm vi đội được gán.");
    if(isChiefEmp(emp))return alert("Chỉ huy trưởng không giao vào hạng mục thi công — dùng «Giao việc» riêng nếu cần kiểm tra.");
    var p=pById(S.giaoProj);
    var on=!S.giaoPick[eid];
    S.giaoPick[eid]=on;
    if(!S.giaoItemStaff)S.giaoItemStaff={};
    if(!on){
      delete S.giaoPick[eid];
      if(S.teamToTruong===eid)S.teamToTruong="";
      if(S.teamVatTu===eid)S.teamVatTu="";
      if(S.giaoSched)delete S.giaoSched[eid];
      if(S.giaoWarn)delete S.giaoWarn[eid];
      Object.keys(S.giaoItemStaff).forEach(function(wid){
        if(S.giaoItemStaff[wid])delete S.giaoItemStaff[wid][eid];
      });
    }else if(p){
      var items=normWorkItems(p);
      items.forEach(function(w){
        if(!S.giaoItemStaff[w.id])S.giaoItemStaff[w.id]={};
        // Thêm vào đội = giao tất cả hạng mục (chia đều % khi lưu)
        S.giaoItemStaff[w.id][eid]={pct:""};
      });
    }
    var cnt=curGiaoPartIds().length;
    if(!canAssignProjRoles(cnt)){S.teamToTruong="";S.teamVatTu="";}
    render();
  },
  giaoWiTog:function(eid,wid,on){
    if(!S.giaoPick[eid])return;
    if(!S.giaoItemStaff)S.giaoItemStaff={};
    if(!S.giaoItemStaff[wid])S.giaoItemStaff[wid]={};
    if(on)S.giaoItemStaff[wid][eid]={pct:""};
    else delete S.giaoItemStaff[wid][eid];
    render();
  },
  giaoWiAllTeam:function(){
    var p=pById(S.giaoProj);if(!p)return;
    var items=normWorkItems(p);
    if(!items.length)return;
    if(!S.giaoItemStaff)S.giaoItemStaff={};
    items.forEach(function(w){if(!S.giaoItemStaff[w.id])S.giaoItemStaff[w.id]={}});
    curGiaoPartIds().forEach(function(eid){
      items.forEach(function(w){S.giaoItemStaff[w.id][eid]={pct:""}});
    });
    render();
  },
  giaoWiPct:function(eid,wid){
    if(!S.giaoPick[eid]||!S.giaoItemStaff||!S.giaoItemStaff[wid]||!S.giaoItemStaff[wid][eid])return;
    var el=document.getElementById("gwip_"+eid+"_"+wid);
    var raw=el?String(el.value).trim():"";
    // Xóa hết / để trống → về auto (không khóa)
    if(raw===""){S.giaoItemStaff[wid][eid]={pct:""};render();return;}
    var n=Number(raw);
    if(isNaN(n)){S.giaoItemStaff[wid][eid]={pct:""};render();return;}
    S.giaoItemStaff[wid][eid]={pct:String(Math.round(Math.max(0,Math.min(100,n))*100)/100)};
    render();
  },
  ensureEmpJob:function(projId,empId){
    if(!giaoGuard())return;
    var p=pById(projId);if(!p)return;
    if(!projLockedGuard(p))return;
    var before=projActiveAsgnEmpIds(p).indexOf(empId)>=0;
    var a=ensureActiveAsgn(p,empId,{logNote:" (từ đội dự án)"});
    if(!a)return alert("Không tạo được công việc.");
    S.proj=S.proj.map(function(x){return x.id===p.id?p:x});
    sv();render();
    if(!before)alert("Đã tạo công việc cho "+((eById(empId)||{}).name||"nhân viên")+".");
  },
  teamTT:function(v){S.teamToTruong=v||"";render()},
  teamVT:function(v){S.teamVatTu=v||"";render()},
  saveProjRoles:function(){
    if(!canManageStaff())return alert("Chỉ giám đốc được phân chức vụ dự án (trưởng nhóm / thủ kho).");
    var p=pById(S.selProjDet);if(!p)return;
    if(!projLockedGuard(p))return;
    var oldTT=p.toTruongId||"",oldVT=p.vatTuId||"";
    var parts=projPartIds(p);
    var tt=S.teamToTruong||"",vt=S.teamVatTu||"";
    if(!canAssignProjRoles(parts.length))tt=vt="";
    if(tt&&parts.indexOf(tt)<0)tt="";
    if(vt&&parts.indexOf(vt)<0)vt="";
    applyProjTeam(p,parts,tt,vt);
    ensureTeamHaveAsgn(p);
    logTeamRoleChanges(p,oldTT,oldVT);
    S.proj=S.proj.map(function(x){return x.id===p.id?p:x});
    sv();render();
  },
  giaoSchedChange:function(eid){
    var p=pById(S.giaoProj);if(!p||!S.giaoPick[eid])return;
    var sEl=document.getElementById("gsd_"+eid),eEl=document.getElementById("ged_"+eid);
    if(!S.giaoSched)S.giaoSched={};
    if(!S.giaoSched[eid])S.giaoSched[eid]={};
    if(sEl&&sEl.value)S.giaoSched[eid].startDate=sEl.value;
    if(eEl&&eEl.value)S.giaoSched[eid].endDate=eEl.value;
    if(S.giaoSched[eid].endDate&&S.giaoSched[eid].startDate&&S.giaoSched[eid].endDate<S.giaoSched[eid].startDate){
      S.giaoSched[eid].endDate=S.giaoSched[eid].startDate;
      if(eEl)eEl.value=S.giaoSched[eid].endDate;
    }
    refreshGiaoWarn(eid);
    render();
  },
  giaoApplySuggest:function(eid){
    var p=pById(S.giaoProj);if(!p||!S.giaoPick[eid])return;
    var w=S.giaoWarn&&S.giaoWarn[eid];if(!w||!w.suggestStart)return;
    var sch=giaoEmpSched(eid,p);
    var span=asgnDaySpan(sch.startDate,sch.endDate);
    sch.startDate=w.suggestStart;
    sch.endDate=dAdd(w.suggestStart,Math.max(1,span)-1);
    refreshGiaoWarn(eid);
    render();
  },
  giaoArriveChange:function(){
    var el=document.getElementById("giao-arrive");
    S.giaoArriveAt=el?String(el.value||""):"";
    refreshAllGiaoWarns();
    render();
  },
  giaoSave:function(){
    // Quy trình dự án dùng trang bố trí đội (teamSave)
    if(S.giaoMode==="team"||!document.getElementById("giao-arrive")){A.teamSave();return;}
    if(!giaoGuard())return;
    var p=pById(S.giaoProj);if(!p)return;
    if(!projLockedGuard(p))return;
    var dates=asgnDates(p);
    var arriveRaw=readArriveAtInput("giao-arrive");
    if(arriveRaw==="invalid")return alert("Giờ có mặt không hợp lệ.");
    if(arriveRaw&&arriveRaw!=="invalid")S.giaoArriveAt=arriveRaw;
    else S.giaoArriveAt="";
    var asd={};S.asgn.filter(function(a){return a.projId===p.id&&(a.status==="active"||a.status==="paused")}).forEach(function(a){asd[a.empId]=a});
    var pickIds=[],reasonLines=[],travelLines=[],allOverlapIds=[],perEmp={},suggestStart="",suggestTravelDays=0,perSched={};
    Object.keys(S.giaoPick).forEach(function(eid){
      if(!S.giaoPick[eid]||asd[eid])return;
      var emp=eById(eid);if(!emp||isOfficeStaffEmp(emp))return;
      pickIds.push(eid);
      var sch=giaoEmpSched(eid,p);
      var sEl=document.getElementById("gsd_"+eid),eEl=document.getElementById("ged_"+eid);
      if(sEl&&sEl.value)sch.startDate=sEl.value;
      if(eEl&&eEl.value)sch.endDate=eEl.value;
      perSched[eid]={startDate:sch.startDate||dates.start,endDate:sch.endDate||dates.end};
      var conflictObj=checkAssignmentConflict(eid,p.custId,arriveRaw||"",p.province,perSched[eid].startDate,perSched[eid].endDate);
      if(conflictObj.overlapIds.length){
        perEmp[eid]={overlapIds:conflictObj.overlapIds.slice(),overlaps:conflictObj.overlaps.slice()};
        allOverlapIds=allOverlapIds.concat(conflictObj.overlapIds);
      }
      (conflictObj.reasonLines||[]).forEach(function(line){reasonLines.push(emp.name+": "+line);});
      (conflictObj.travelMsgs||[]).forEach(function(t){travelLines.push(emp.name+": "+t);});
      if(conflictObj.suggestStart&&(!suggestStart||conflictObj.suggestStart>suggestStart))suggestStart=conflictObj.suggestStart;
      if((conflictObj.suggestTravelDays||0)>suggestTravelDays)suggestTravelDays=conflictObj.suggestTravelDays;
    });
    if(!pickIds.length)return alert("Chọn ít nhất một nhân viên để giao việc.");
    if(reasonLines.length){
      S.conflictPending={
        kind:"giao",projId:p.id,arriveRaw:arriveRaw||"",pickIds:pickIds,perSched:perSched,
        startDate:dates.start,endDate:dates.end,perEmp:perEmp,
        overlapIds:allOverlapIds,overlapLines:reasonLines,travelLines:travelLines,
        reasonLines:reasonLines,suggestStart:suggestStart,suggestTravelDays:suggestTravelDays,
        _origStart:dates.start,_origEnd:dates.end
      };
      S.modal=conflictResolveM(S.conflictPending);render();return;
    }
    A._commitGiao(null);
  },
  _commitGiao:function(resolution){
    if(!giaoGuard())return;
    var pend=S.conflictPending;
    var p,arriveRaw,pickIds,dates,perEmp,perSched;
    if(pend&&pend.kind==="giao"){
      p=pById(pend.projId);if(!p)return;
      arriveRaw=pend.arriveRaw||"";
      pickIds=pend.pickIds||[];
      dates={start:pend.startDate,end:pend.endDate};
      perEmp=pend.perEmp||{};
      perSched=pend.perSched||{};
    }else{
      p=pById(S.giaoProj);if(!p)return;
      dates=asgnDates(p);
      arriveRaw=readArriveAtInput("giao-arrive");
      if(arriveRaw==="invalid")arriveRaw="";
      pickIds=Object.keys(S.giaoPick).filter(function(eid){return S.giaoPick[eid]&&!isOfficeStaffEmp(eById(eid));});
      perEmp={};
      perSched={};
      pickIds.forEach(function(eid){
        var sch=giaoEmpSched(eid,p);
        perSched[eid]={startDate:sch.startDate||dates.start,endDate:sch.endDate||dates.end};
      });
    }
    var asd={};S.asgn.filter(function(a){return a.projId===p.id&&(a.status==="active"||a.status==="paused")}).forEach(function(a){asd[a.empId]=a});
    var added=0,newTitle=p.name||"việc mới";
    if(resolution==="pause"){
      var pauseIds=[];
      pickIds.forEach(function(eid){var pe=perEmp[eid];if(pe)pauseIds=pauseIds.concat(pe.overlapIds||[]);});
      if(pauseIds.length){
        applyPauseForNewJob(pauseIds,dates.start,dates.end,newTitle);
        pauseIds.forEach(function(oid){
          var oa=asgnById(oid);if(!oa)return;
          logProjEvent(oa.projId,"pause",{empId:oa.empId,text:"Tạm hoãn ưu tiên «"+newTitle+"»",meta:{asgnId:oid}});
        });
      }
    }
    pickIds.forEach(function(eid){
      if(asd[eid])return;
      var emp=eById(eid);if(!emp)return;
      var sch=perSched[eid]||{startDate:dates.start,endDate:dates.end};
      var finalStart=sch.startDate||dates.start,finalEnd=sch.endDate||dates.end,scheduleAdj=null,schedNotify=null;
      if(resolution==="delay"&&perEmp[eid]&&perEmp[eid].overlaps&&perEmp[eid].overlaps.length){
        var delayed=delayDatesAfterOverlaps(perEmp[eid].overlaps,finalStart,finalEnd,pend&&pend.suggestTravelDays||0);
        if(pend&&pend.suggestStart&&pend.suggestStart>delayed.startDate){
          var spanG=asgnDaySpan(finalStart,finalEnd);
          delayed={startDate:pend.suggestStart,endDate:dAdd(pend.suggestStart,spanG-1)};
        }
        finalStart=delayed.startDate;finalEnd=delayed.endDate;
        var delayMsg="Việc «"+newTitle+"» được dời sang "+dFmtG(finalStart)+" → "+dFmtG(finalEnd)+" (sau khi hoàn tất việc đang làm / đủ thời gian di chuyển).";
        scheduleAdj={type:"delay_after",prevStart:sch.startDate||dates.start,prevEnd:sch.endDate||dates.end,at:td()};
        schedNotify={at:Date.now(),type:"delay",msg:delayMsg};
      }else if(resolution==="delay"&&pend&&pend.suggestStart){
        var spanD=asgnDaySpan(finalStart,finalEnd);
        finalStart=pend.suggestStart;finalEnd=dAdd(pend.suggestStart,spanD-1);
        scheduleAdj={type:"delay_after",prevStart:sch.startDate||dates.start,prevEnd:sch.endDate||dates.end,at:td()};
        schedNotify={at:Date.now(),type:"delay",msg:"Việc «"+newTitle+"» được dời sang "+dFmtG(finalStart)+" → "+dFmtG(finalEnd)+"."};
      }
      var na=mkAsgn(eid,p.id,0,{startDate:finalStart,endDate:finalEnd,scheduleAdj:scheduleAdj,schedNotify:schedNotify});
      if(arriveRaw){na.arriveAt=arriveRaw;addArrivalReminder(eid,na.id,arriveRaw,asgnLocLabel(na));}
      S.asgn.push(na);
      recordAssign(p.id,emp,na,resolution==="delay"?" (dời lịch)":resolution==="pause"?" (ưu tiên)":"");
      applyProjLocToEmp(emp,p,finalStart);
      added++;
    });
    var oldTT=p.toTruongId||"",oldVT=p.vatTuId||"";
    var tt=canManageStaff()?S.teamToTruong:p.toTruongId;
    var vt=canManageStaff()?S.teamVatTu:p.vatTuId;
    applyProjTeam(p,giaoEffectivePartIds(p),tt,vt);
    if(canManageStaff())logTeamRoleChanges(p,oldTT,oldVT);
    // Mọi người trong đội dự án đều có công việc thật (bố trí = giao việc)
    ensureTeamHaveAsgn(p);
    S.proj=S.proj.map(function(x){return x.id===p.id?p:x});
    if(added&&p.status==="open"){p.status="in_progress";S.proj=S.proj.map(function(x){return x.id===p.id?p:x})}
    S.conflictPending=null;sv();S.modal=null;S.giaoArriveAt="";
    A.giaoBack();
    if(added)alert("Đã giao việc cho "+added+" nhân viên.");
    else alert("Đã cập nhật đội dự án — mọi người trong đội đều có công việc.");
  },
  resolveConflict:function(choice){
    if(!giaoGuard())return;
    var pend=S.conflictPending;if(!pend)return;
    if(choice!=="delay"&&choice!=="pause"&&choice!=="continue")return;
    if(choice==="continue")choice=null;
    if(choice==="delay"&&!(pend.overlapIds&&pend.overlapIds.length)){
      var origS=pend._origStart||pend.startDate,origE=pend._origEnd||pend.endDate;
      var spanKeep=asgnDaySpan(origS,origE);
      if(pend.suggestStart){
        pend.startDate=pend.suggestStart;
        pend.endDate=dAdd(pend.suggestStart,Math.max(0,spanKeep-1));
      }
      choice=null;
    }
    if(pend.kind==="egiao")A._commitEgio(choice);
    else if(pend.kind==="giao")A._commitGiao(choice);
  },
  tgGrp:function(i){var g=getGroups()[i];S.expGrp[g]=!S.expGrp[g];render()},
  or:function(id){if(!lichGuard())return;S.form=id?JSON.parse(JSON.stringify(findMyRemind(id)||{})):{text:"",at:""};if(!S.form.id)S.form={text:"",at:""};S.modal=remindM(S.form);render()},
  sr:function(){
    if(!lichGuard())return;
    var f=S.form,text=(document.getElementById("rm-txt")||{}).value.trim(),at=(document.getElementById("rm-at")||{}).value;
    if(!text)return alert("Nhập nội dung nhắc hẹn.");
    if(!at)return alert("Chọn thời gian nhắc.");
    at=remindAtToIso(at);
    var atMs=remindAtMs(at);
    if(!atMs||isNaN(atMs))return alert("Thời gian nhắc không hợp lệ.");
    if(atMs<=Date.now())return alert("Thời gian nhắc phải ở tương lai.");
    unlockAppAudio();
    if("Notification" in window&&Notification.permission==="default")Notification.requestPermission();
    if(typeof window.__CV3_enableRemindPush==="function"&&isDir())window.__CV3_enableRemindPush();
    var isEdit=!!f.id;
    var before=isEdit?JSON.parse(JSON.stringify(findMyRemind(f.id)||null)):null;
    if(f.id){
      replaceMyRemind(f.id,Object.assign({},findMyRemind(f.id)||{},{text:text,at:at,fired:false,done:false,pushSent:false,personal:usesPersonalReminders(),ownerUid:usesPersonalReminders()?(S.auth&&S.auth.uid||""):""}));
    }else{
      f.id=uid();
      pushMyRemind({id:f.id,text:text,at:at,fired:false,done:false,createdAt:new Date().toISOString(),personal:usesPersonalReminders(),ownerUid:usesPersonalReminders()?(S.auth&&S.auth.uid||""):""});
    }
    if(isEdit&&before){pushUndo("Hoàn tác sửa nhắc hẹn","edit_revert",{type:"remind",before:before});if(isDir())auditLog("action","edit_remind","Sửa nhắc hẹn «"+text+"»",{id:f.id});}
    else{pushUndo("Hoàn tác tạo nhắc hẹn","create_revert",{type:"remind",id:f.id});if(isDir())auditLog("action","create_remind","Tạo nhắc hẹn «"+text+"»",{id:f.id});}
    if(!usesPersonalReminders()){
      sv();
      if(typeof window.__CV3_flushCloud==="function")window.__CV3_flushCloud();
    }
    S.modal=null;S.form=null;render();
  },
  dr:function(id){
    if(!lichGuard())return;
    if(!confirm("Xoá nhắc hẹn này?"))return;
    var r=findMyRemind(id);
    if(r&&!usesPersonalReminders())moveToTrash("remind",r);
    else if(r)pushUndo("Hoàn tác xoá nhắc hẹn «"+(r.text||"")+"»","edit_revert",{type:"remind",before:r});
    removeMyRemind(id);
    if(!usesPersonalReminders())sv();
    S.modal=null;S.form=null;render();
  },
  testBell:function(){unlockAppAudio();playBellSound();showRemindToast([{id:"test",at:new Date().toISOString(),text:"Thử tiếng chuông nhắc hẹn"}]);},
  navPrev:function(){
    if(isFieldPortal()){if(S.selMyAsgn){S.selMyAsgn="";S.selMyAsgnOrg="";render()}return;}
    if(!canNavPrev())return;
    if(S.tab==="lich"){A.lichBack();return;}
    if(S.giaoMode==="team"||S.giaoProj){A.giaoBack();return;}
    if(S.selProjDet){S.selProjDet="";render();return;}
    if(S.selCust){S.selCust="";render();return;}
    if(S.selEmp){S.selEmp="";render();return;}
    if(S.selMyAsgn){S.selMyAsgn="";S.selMyAsgnOrg="";render();return;}
    if(S.hist&&S.hist.length){S.tab=S.hist.pop();S.modal=null;S.form=null;render();return;}
    var ids=tabIds(),i=ids.indexOf(S.tab);if(i>0){S.tab=ids[i-1];S.modal=null;S.form=null;render();}},
  navNext:function(){
    if(isFieldPortal())return;
    if(!canNavNext())return;
    var ids=tabIds(),i=ids.indexOf(S.tab);
    if(S.tab!==ids[i+1]){S.hist=S.hist||[];S.hist.push(S.tab);}
    S.tab=ids[i+1];S.modal=null;S.form=null;render();
  },
  cancelConflict:function(ev){
    if(!overlayDismissOk(ev))return;
    var pend=S.conflictPending;
    S.conflictPending=null;
    if(pend&&pend.kind==="egiao"&&S.form&&S.form.type==="egiao"){
      var emp=eById(pend.empId||S.selEmp);
      S.modal=empGiaoM(S.form,emp?emp.name:"");
    }else S.modal=null;
    render();
  },
  cm:function(ev){
    if(!overlayDismissOk(ev))return;
    if(S.conflictPending){
      S.conflictPending=null;S.modal=null;render();
      alert("Chưa lưu giao việc — cần chọn cách xử lý trùng lịch (Dời việc mới / Tạm dừng việc đang làm) rồi xác nhận.");
      return;
    }
    if(S.form&&S.form.type==="egiao"){A.egiaoExit();return;}
    S.modal=null;S.form=null;S.attFlow=null;S.arrivalFlow=null;S._grpParent=null;S.conflictPending=null;render();
  },
  ovDown:function(ev){overlayPtrDown(ev)},
  openHelp:function(){
    function show(){S.helpOpen=1;if(!S.helpMode)S.helpMode="annotate";render();}
    if(window.CV3_HELP){show();return;}
    if(window.__CV3_HELP_LOADING){window.__CV3_HELP_LOADING.then(show);return;}
    window.__CV3_HELP_LOADING=new Promise(function(resolve,reject){
      var s=document.createElement("script");
      s.src=appUrl("js/contextual-help.js");
      s.onload=function(){resolve();};
      s.onerror=function(){reject(new Error("help"));};
      document.head.appendChild(s);
    }).catch(function(){window.__CV3_HELP_LOADING=null;});
    window.__CV3_HELP_LOADING.then(show);
  },
  closeHelp:function(ev){if(!overlayDismissOk(ev))return;S.helpOpen=0;render()},
  helpMode:function(mode){S.helpMode=mode==="process"?"process":"annotate";if(!S.helpOpen)S.helpOpen=1;render()},
  grpSel:function(val){
    if(val==="__new__"){
      if(!staffGuard()){var el=document.getElementById("fg");if(el&&S.form)el.value=S.form.group||getGroups()[0]||"";return}
      syncEmpFormFromDom();
      S.modal=groupM();render();setTimeout(function(){var el=document.getElementById("fgn");if(el)el.focus()},30);
      return;
    }
    if(S.form&&S._grpParent==="emp"){
      syncEmpFormFromDom();
      S.form.group=val;
      S.form.orgIds=forceChiefScope(val,S.form.orgIds);
      if(!S.form.loginKey&&S.form.name)S.form.loginKey=nameToLoginKey(S.form.name);
      S.modal=empM(S.form);
      render();
    }
  },
  grpCancel:function(ev){if(!overlayDismissOk(ev))return;if(S.form){if(S._grpParent==="emp")syncEmpFormFromDom();S.modal=S._grpParent==="proj"?projM(S.form):empM(S.form)}else{S.modal=null}render()},
  mapRefresh:function(){ensureLeaflet().then(function(){initMapLeaflet(true);});},
  saveNewGroup:function(){
    if(!staffGuard())return;
    var name=(document.getElementById("fgn")||{}).value.trim();
    if(!name)return alert("Nhập tên nhóm");
    if(getGroups().some(function(g){return g.toLowerCase()===name.toLowerCase()}))return alert("Nhóm «"+name+"» đã tồn tại.");
    ensureCfgGroups();
    S.cfg.groups.push(name);
    S.cfg.groupColors[name]=nextGroupColor(name);
    sv();
    if(S.form)S.form.group=name;
    if(S.form)S.modal=S._grpParent==="proj"?projM(S.form):empM(S.form);
    else S.modal=null;
    render();
  },
  gm:function(lat,lng){window.open("https://maps.google.com/?q="+lat+","+lng,"_blank")},
  oe:function(id){if(!staffGuard())return;if(id){var cur=eById(id);if(cur&&!isStaffEmp(cur))return alert("Hồ sơ giám đốc quản lý tại Cài đặt → Tài khoản.");}S._grpParent="emp";S.form=id?JSON.parse(JSON.stringify(eById(id))):{name:"",group:defaultFieldGroup(),province:DP,skill:3,status:"available",note:"",loginKey:"",accountRole:"employee",orgIds:[currentOrgId()]};S.modal=empM(S.form);render()},
  fst:function(_,n){S.form.skill=n;document.getElementById("fsk").innerHTML=strs(n,"fst")},
  se:function(){
    if(!staffGuard())return;
    var f=S.form;
    f.name=document.getElementById("fn").value.trim();if(!f.name)return alert("Nhập họ tên");
    f.group=document.getElementById("fg").value;f.province=document.getElementById("fp").value;f.status=document.getElementById("fs").value;f.note=document.getElementById("fno").value;
    f.accountRole="employee";
    var orgBoxes=document.querySelectorAll(".forg:checked");
    var orgIds=[];
    orgBoxes.forEach(function(el){if(el.value)orgIds.push(el.value);});
    if(!orgIds.length)orgIds=[currentOrgId()];
    orgIds=forceChiefScope(f.group,orgIds);
    f.orgIds=orgIds;
    var loginKey=nameToLoginKey((document.getElementById("flu")||{}).value||f.name);
    if(loginKey.length<2)return alert("Tên đăng nhập cần ít nhất 2 ký tự (không dấu).");
    var pool=S.empAll&&S.empAll.length?S.empAll:S.emp;
    if(pool.some(function(x){return x.id!==f.id&&empLoginKey(x)===loginKey}))return alert("Tên đăng nhập «"+loginKey+"» đã được dùng bởi nhân viên khác.");
    if(S.cfg.directorContact&&nameToLoginKey(S.cfg.directorContact.username||"")===loginKey)return alert("Tên đăng nhập «"+loginKey+"» đã được dùng bởi giám đốc.");
    f.loginKey=loginKey;
    var pwEl=document.getElementById("fpw");
    var pw=pwEl?pwEl.value:"";
    if(pw&&pw.length<6)return alert("Mật khẩu cần ít nhất 6 ký tự.");
    var isEdit=!!f.id;
    var before=isEdit?JSON.parse(JSON.stringify(eById(f.id)||null)):null;
    if(f.id){
      S.empAll=(S.empAll&&S.empAll.length?S.empAll:S.emp).map(function(x){return x.id===f.id?f:x});
      if(!S.empAll.some(function(x){return x.id===f.id}))S.empAll.push(f);
    }else{
      f.id=uid();
      S.empAll=(S.empAll&&S.empAll.length?S.empAll.slice():S.emp.slice());
      S.empAll.push(f);
    }
    var cur=currentOrgId();
    S.emp=S.empAll.filter(function(x){return empOrgIds(x).indexOf(cur)>=0});
    if(isEdit&&before){pushUndo("Hoàn tác sửa nhân sự «"+f.name+"»","edit_revert",{type:"emp",before:before});auditLog("action","edit_emp","Sửa nhân sự «"+f.name+"»",{id:f.id});}
    else{pushUndo("Hoàn tác tạo nhân sự «"+f.name+"»","create_revert",{type:"emp",id:f.id});auditLog("action","create_emp","Tạo nhân sự «"+f.name+"»",{id:f.id});}
    var empId=f.id,empName=f.name;
    sv();S.modal=null;S.form=null;render();
    if(typeof window.__CV3_upsertEmpMaster==="function"){
      window.__CV3_upsertEmpMaster(f).catch(function(){});
    }
    if(typeof window.__CV3_setEmpOrgMembership==="function"){
      window.__CV3_setEmpOrgMembership(empId,orgIds).catch(function(){});
    }
    if(typeof window.__CV3_provisionEmp==="function"){
      window.__CV3_provisionEmp({username:loginKey,password:pw,empId:empId,empName:empName,role:"employee",orgId:currentOrgId(),orgIds:orgIds,empGroup:f.group||""})
        .then(function(r){
          if(r&&r.uid){
            S.empAll=(S.empAll||[]).map(function(x){return x.id===empId?Object.assign({},x,{authUid:r.uid}):x});
            S.emp=S.emp.map(function(x){return x.id===empId?Object.assign({},x,{authUid:r.uid}):x});
            sv();
          }
          alert(r&&r.created?"Đã lưu và tạo tài khoản đăng nhập.":r&&(r.updated||r.role)?"Đã lưu nhân sự.":"Đã lưu nhân sự — tài khoản sẽ được tạo tự động.");
          render();
        })
        .catch(function(e){alert(e.message||"Lưu nhân sự xong — tài khoản sẽ được tạo tự động khi đồng bộ.");render()});
    }
  },
  de:function(id){if(!staffGuard())return;var e=eById(id);if(e&&!isStaffEmp(e))return alert("Không xoá hồ sơ giám đốc tại đây.");if(!confirm("Xoá nhân sự này?"))return;if(e)moveToTrash("emp",e);S.emp=S.emp.filter(function(x){return x.id!==id});if(S.selEmp===id)S.selEmp="";sv();S.modal=null;S.form=null;render()},
  ol:function(id){S.form=eById(id);S.modal=locM(S.form);render();setTimeout(function(){var ll=S.form.lastLoc;if(ll){var el=document.getElementById("ls");if(ll.label&&PM[ll.label]){if(el)el.value="prov:"+ll.label}else{var c=S.cust.find(function(x){return x.name===ll.label});if(c){if(el)el.value="cust:"+c.id}else{if(el)el.value="manual";if(ll.lat!=null){var ec=document.getElementById("lc");if(ec)ec.value=ll.lat+", "+ll.lng}}}if(ll.date){var ed=document.getElementById("ld");if(ed)ed.value=ll.date}}},10)},
  lsc:function(v){var ci=document.getElementById("lc");if(ci)ci.disabled=(v!=="manual")},
  sl:function(id){var e=eById(id),sel=document.getElementById("ls").value,date=document.getElementById("ld").value||td(),loc=null;if(sel.indexOf("cust:")===0){var c=cById(sel.slice(5));if(c){var la=c.lat,ln=c.lng;if(la==null&&PM[c.province]){la=PM[c.province].lat;ln=PM[c.province].lng}loc={label:custDisplayName(c),lat:la,lng:ln,date:date}}}else if(sel.indexOf("prov:")===0){var pn=sel.slice(5),p=PM[pn];if(p)loc={label:pn,lat:p.lat,lng:p.lng,date:date}}else{var cc=pco(document.getElementById("lc").value);if(!cc)return alert("Toạ độ không hợp lệ (VD: 10.95, 106.82)");loc={label:"Thủ công",lat:cc.lat,lng:cc.lng,date:date}}e.lastLoc=loc;sv();S.modal=null;S.form=null;render()},
  clr:function(id){eById(id).lastLoc=null;sv();S.modal=null;S.form=null;render()},
  oc:function(id){
    if(!custManageGuard())return;
    if(id){
      var cur=cById(id);
      if(!cur)return alert("Không tìm thấy khách hàng.");
      S.form=JSON.parse(JSON.stringify(cur));
    }else{
      S.form={name:"",shortName:"",address:"",province:"",lat:null,lng:null,contact:"",note:""};
    }
    S.modal=custM(S.form);
    render();
  },
  ms:function(){var n=document.getElementById("fn").value,a=document.getElementById("fa").value;window.open("https://www.google.com/maps/search/?api=1&query="+encodeURIComponent((n+" "+a).trim()||"nhà máy"),"_blank")},
  pc:function(){
    var raw=document.getElementById("fcs").value.trim();
    if(!raw)return;
    var status=document.getElementById("lookup-status");
    // parse name from URL path e.g. /place/T%C3%AAn+Nh%C3%A0+M%C3%A1y/
    function nameFromUrl(url){try{var m=url.match(/\/place\/([^/@]+)/);if(m){var n=decodeURIComponent(m[1].replace(/\+/g," "));if(n.length>2&&n.length<120)return n;}return"";}catch(e){return"";}}
    var cc=pco(raw);
    if(!cc){if(status)status.textContent="⚠ Không đọc được toạ độ từ link. Hãy copy link trực tiếp từ thanh địa chỉ trình duyệt khi đang xem nhà máy trên Maps.";return;}
    document.getElementById("flat").value=cc.lat;
    document.getElementById("flng").value=cc.lng;
    // try fill name from URL
    var guessName=nameFromUrl(raw);
    if(guessName&&!document.getElementById("fn").value.trim())document.getElementById("fn").value=guessName;
    if(status)status.innerHTML='<span style="color:#fbbf24">⏳ Đang lấy địa chỉ từ toạ độ '+cc.lat.toFixed(5)+', '+cc.lng.toFixed(5)+'…</span>';
    // Nominatim reverse geocode (free, no key needed)
    fetch("https://nominatim.openstreetmap.org/reverse?format=json&lat="+cc.lat+"&lon="+cc.lng+"&addressdetails=1&accept-language=vi",{headers:{"Accept-Language":"vi","User-Agent":"QuanLyDuAn/1.0"}})
    .then(function(r){return r.json()})
    .then(function(d){
      if(!d||!d.address){if(status)status.innerHTML='<span style="color:#f87171">Không lấy được địa chỉ. Điền tay ở form bên dưới.</span>';return;}
      var addr=d.address;
      // fill address
      var fullAddr=d.display_name||"";
      var addrEl=document.getElementById("fa");if(addrEl&&!addrEl.value.trim())addrEl.value=fullAddr;
      // fill name if still empty
      var nameEl=document.getElementById("fn");
      if(nameEl&&!nameEl.value.trim()){
        var n=d.name||addr.amenity||addr.building||addr.industrial||addr.office||addr.shop||"";
        if(n)nameEl.value=n;}
      // match province
      var provNames=["An Giang","Bà Rịa - Vũng Tàu","Bạc Liêu","Bắc Giang","Bắc Kạn","Bắc Ninh","Bến Tre","Bình Dương","Bình Định","Bình Phước","Bình Thuận","Cà Mau","Cần Thơ","Cao Bằng","Đà Nẵng","Đắk Lắk","Đắk Nông","Điện Biên","Đồng Nai","Đồng Tháp","Gia Lai","Hà Giang","Hà Nam","Hà Nội","Hà Tĩnh","Hải Dương","Hải Phòng","Hậu Giang","Hoà Bình","Hưng Yên","Khánh Hoà","Kiên Giang","Kon Tum","Lai Châu","Lâm Đồng","Lạng Sơn","Lào Cai","Long An","Nam Định","Nghệ An","Ninh Bình","Ninh Thuận","Phú Thọ","Phú Yên","Quảng Bình","Quảng Nam","Quảng Ngãi","Quảng Ninh","Quảng Trị","Sóc Trăng","Sơn La","Tây Ninh","Thái Bình","Thái Nguyên","Thanh Hoá","Thừa Thiên Huế","Tiền Giang","TP. Hồ Chí Minh","Trà Vinh","Tuyên Quang","Vĩnh Long","Vĩnh Phúc","Yên Bái"];
      var raw2=JSON.stringify(addr).toLowerCase();
      var matched="";
      for(var i=0;i<provNames.length;i++){var pn=provNames[i];var kw=pn.toLowerCase().replace("tp. ","").replace("thừa thiên ","").replace("bà rịa - ","");if(raw2.indexOf(kw)>=0){matched=pn;break;}}
      if(matched){var pvEl=document.getElementById("fpv");if(pvEl)pvEl.value=matched;}
      if(status)status.innerHTML='<span style="color:#4ade80">✓ Đã lấy thông tin! Kiểm tra và bổ sung tên nhà máy nếu cần.</span>';
    })
    .catch(function(){if(status)status.innerHTML='<span style="color:#f87171">Không kết nối được để lấy địa chỉ (cần internet). Toạ độ đã điền, bạn nhập địa chỉ tay.</span>';});},
  sc:function(){if(!custManageGuard())return;var f=S.form;f.name=document.getElementById("fn").value.trim();if(!f.name)return alert("Nhập tên chính quy");f.shortName=(document.getElementById("fshort")||{}).value?document.getElementById("fshort").value.trim():"";f.address=document.getElementById("fa").value;f.lat=parseFloat(document.getElementById("flat").value)||null;f.lng=parseFloat(document.getElementById("flng").value)||null;f.province=document.getElementById("fpv").value;f.contact=document.getElementById("fct").value;f.note=document.getElementById("fcn").value;var isEdit=!!f.id;var before=isEdit?JSON.parse(JSON.stringify(cById(f.id)||null)):null;if(f.id)S.cust=S.cust.map(function(x){return x.id===f.id?f:x});else{f.id=uid();S.cust.push(f)}if(isEdit&&before){pushUndo("Hoàn tác sửa khách «"+(f.shortName||f.name)+"»","edit_revert",{type:"cust",before:before});auditLog("action","edit_cust","Sửa khách hàng «"+(f.shortName||f.name)+"»",{id:f.id});}else{pushUndo("Hoàn tác tạo khách «"+(f.shortName||f.name)+"»","create_revert",{type:"cust",id:f.id});auditLog("action","create_cust","Tạo khách hàng «"+(f.shortName||f.name)+"»",{id:f.id});}sv();if(typeof window.__CV3_upsertCustMaster==="function"){window.__CV3_upsertCustMaster(f).catch(function(){});}S.modal=null;S.form=null;render()},
  dc:function(id){if(!custManageGuard())return;if(!confirm("Xoá khách hàng?"))return;var c=cById(id);if(c)moveToTrash("cust",c);S.cust=S.cust.filter(function(x){return x.id!==id});if(S.selCust===id)S.selCust="";sv();if(typeof window.__CV3_deleteCustMaster==="function"){window.__CV3_deleteCustMaster(id).catch(function(){});}S.modal=null;S.form=null;render()},
  op:function(id){
    if(!dirGuard())return;
    S._grpParent="proj";
    if(id){
      var cur=pById(id);
      if(!cur)return alert("Không tìm thấy dự án.");
      if(!projLockedGuard(cur))return;
      S.form=JSON.parse(JSON.stringify(cur));
      ensureFormWorkItems(S.form);
      S.form.itemStaff={};
      S.form.wiOpenGrp={};
      (S.form.workItems||[]).forEach(function(w){S.form.itemStaff[w.id]={}});
      if(!normWorkItems(S.form).length){
        S.form.workItems=[mkWorkItem(S.form.name||"Hạng mục 1",0)];
        ensureFormWorkItems(S.form);
      }
    }else{
      var st=defaultProjStart();
      S.form={name:"",custId:"",province:DP,type:"new",group:defaultFieldGroup(),priority:"normal",startDate:st,deadline:deadlineFromDuration(st,7),durationDays:7,status:"open",note:"",participantIds:[],toTruongId:"",vatTuId:"",workItems:[mkWorkItem("",0)],itemStaff:{},wiOpenGrp:{}};
      ensureFormWorkItems(S.form);
    }
    S.teamToTruong=S.form.toTruongId||"";
    S.teamVatTu=S.form.vatTuId||"";
    S.modal=projM(S.form);
    render();
  },
  projSyncForm:function(){
    var f=S.form;if(!f)return;
    var fn=document.getElementById("fn");if(fn)f.name=fn.value;
    var fcu=document.getElementById("fcu");if(fcu)f.custId=fcu.value;
    var fp=document.getElementById("fp");if(fp)f.province=fp.value;
    var ft=document.getElementById("ft");if(ft)f.type=ft.value;
    var fpr=document.getElementById("fpr");if(fpr)f.priority=fpr.value;
    var fno=document.getElementById("fno");if(fno)f.note=fno.value;
    A.projFormRecalc();
    collectFormItemStaff(f);
  },
  wiFlow:function(){/* legacy no-op — phụ thuộc theo từng hạng mục */},
  wiAdd:function(){
    if(!S.form)return;
    A.projSyncForm();
    ensureFormWorkItems(S.form);
    var w=mkWorkItem("",S.form.workItems.length);
    S.form.workItems.push(w);
    S.form.itemStaff[w.id]={};
    S._focusWiTitle=w.id;
    S.modal=projM(S.form);render();
    // Cuộn tới khung mới + focus ô tên (placeholder mờ — gõ ngay, không cần xoá)
    var focusNew=function(){
      var id=S._focusWiTitle;if(!id)return;
      var el=document.getElementById("wit_"+id);
      var card=document.getElementById("wi_card_"+id);
      if(card&&card.scrollIntoView)try{card.scrollIntoView({block:"nearest",behavior:"auto"})}catch(e){}
      if(el){
        try{el.focus({preventScroll:true})}catch(e2){try{el.focus()}catch(e3){}}
        try{el.setSelectionRange(0,0)}catch(e4){}
      }
      S._focusWiTitle="";
    };
    requestAnimationFrame(function(){requestAnimationFrame(focusNew)});
    setTimeout(focusNew,50);
  },
  wiRemove:function(wid){
    if(!S.form)return;
    var y=captureModalScroll();
    A.projSyncForm();
    if((S.form.workItems||[]).length<=1)return alert("Cần ít nhất 1 hạng mục.");
    var doomed=(S.form.workItems||[]).find(function(w){return w.id===wid});
    if(doomed&&doomed.confirmedDone&&!isDir())return alert("Hạng mục đã xác nhận hoàn thành — chỉ giám đốc được xoá.");
    if(doomed&&doomed.confirmedDone&&!confirm("Hạng mục «"+workItemLabel(doomed)+"» đã lưu thống kê. Xoá sẽ mất tài liệu này. Tiếp tục?"))return;
    S.form.workItems=S.form.workItems.filter(function(w){return w.id!==wid});
    if(S.form.itemStaff)delete S.form.itemStaff[wid];
    S.form.workItems.forEach(function(w){
      w.parentIds=workItemParentIds(w).filter(function(pid){return pid!==wid});
    });
    S.form.workItems.forEach(function(w,i){w.order=i});
    S.modal=projM(S.form);render();restoreModalScroll(y);
  },
  wiTitle:function(wid){
    if(!S.form)return;
    var el=document.getElementById("wit_"+wid);
    var w=(S.form.workItems||[]).find(function(x){return x.id===wid});
    if(w&&el)w.title=el.value.trim();
  },
  wiParentToggle:function(wid,pid,on){
    if(!S.form)return;
    var y=captureModalScroll();
    A.projSyncForm();
    ensureFormWorkItems(S.form);
    var w=(S.form.workItems||[]).find(function(x){return x.id===wid});
    if(!w)return;
    if(!Array.isArray(w.parentIds))w.parentIds=[];
    if(on){
      if(wiWouldCycle(S.form.workItems,wid,pid)){alert("Không chọn được — sẽ tạo vòng phụ thuộc.");S.modal=projM(S.form);render();restoreModalScroll(y);return;}
      if(w.parentIds.indexOf(pid)<0)w.parentIds.push(pid);
    }else{
      w.parentIds=w.parentIds.filter(function(x){return x!==pid});
    }
    S.modal=projM(S.form);render();restoreModalScroll(y);
  },
  wiToggleGrp:function(wid,g){
    if(!S.form)return;
    var y=captureModalScroll();
    A.projSyncForm();
    if(!S.form.wiOpenGrp)S.form.wiOpenGrp={};
    var key=wid+"|"+g;
    if(S.form.wiOpenGrp[key])delete S.form.wiOpenGrp[key];
    else S.form.wiOpenGrp[key]=1;
    S.modal=projM(S.form);render();restoreModalScroll(y);
  },
  wiToggleEmp:function(wid,eid){
    if(!S.form)return;
    if(isAdminHrEmp(eById(eid)))return alert("Hành chính không cần giao việc / chấm công hiện trường.");
    if(isOversightEmp(eById(eid)))return alert("Giám sát / Điều hành không cần giao vào hạng mục thi công.");
    if(isChiefEmp(eById(eid)))return alert("Chỉ huy trưởng không giao vào hạng mục thi công — dùng «Giao việc» riêng nếu cần kiểm tra.");
    var y=captureModalScroll();
    A.projSyncForm();
    ensureFormWorkItems(S.form);
    if(!S.form.itemStaff[wid])S.form.itemStaff[wid]={};
    if(S.form.itemStaff[wid][eid])delete S.form.itemStaff[wid][eid];
    else S.form.itemStaff[wid][eid]={pct:""};
    var map={};
    Object.keys(S.form.itemStaff).forEach(function(w){
      Object.keys(S.form.itemStaff[w]||{}).forEach(function(id){map[id]=1});
    });
    S.form.group=deriveProjGroupFromAssign(map,S.form.group);
    S.modal=projM(S.form);render();restoreModalScroll(y);
  },
  wiPct:function(wid,eid){
    if(!S.form||!S.form.itemStaff||!S.form.itemStaff[wid]||!S.form.itemStaff[wid][eid])return;
    var el=document.getElementById("wip_"+wid+"_"+eid);
    S.form.itemStaff[wid][eid].pct=el?el.value:"";
    var y=captureModalScroll();
    A.projSyncForm();
    S.modal=projM(S.form);render();restoreModalScroll(y);
  },
  formTeamTT:function(v){
    S.teamToTruong=v||"";
    if(S.form)S.form.toTruongId=v||"";
    if(S.form&&S.modal){var y=captureModalScroll();S.modal=projM(S.form);render();restoreModalScroll(y);}
    else render();
  },
  formTeamVT:function(v){
    S.teamVatTu=v||"";
    if(S.form)S.form.vatTuId=v||"";
    if(S.form&&S.modal){var y=captureModalScroll();S.modal=projM(S.form);render();restoreModalScroll(y);}
    else render();
  },
  projToggleAssign:function(){/* legacy no-op — dùng hạng mục */},
  projAssignDate:function(){},
  projDateKey:function(which,ev){
    var dEl=document.getElementById("fsd-d"),mEl=document.getElementById("fsd-m"),daysEl=document.getElementById("fdays");
    if(!dEl||!mEl)return;
    var k=ev.key;
    if(k==="/"||k==="-"||k==="."){
      ev.preventDefault();
      if(which==="d"){mEl.focus();mEl.select();}
      else if(which==="m"&&daysEl){daysEl.focus();daysEl.select();}
      return;
    }
    if(k==="Backspace"&&!String(ev.target.value||"")&&!ev.target.selectionStart){
      ev.preventDefault();
      if(which==="m"){dEl.focus();dEl.select();}
    }
  },
  projDateInput:function(which){
    var dEl=document.getElementById("fsd-d"),mEl=document.getElementById("fsd-m"),daysEl=document.getElementById("fdays");
    if(!dEl||!mEl)return;
    if(which==="d"){
      var v=String(dEl.value||"").replace(/\D/g,"").slice(0,2);
      dEl.value=v;
      if(v.length===2||(v.length===1&&parseInt(v,10)>3)){mEl.focus();mEl.select();}
    }else if(which==="m"){
      var mv=String(mEl.value||"").replace(/\D/g,"").slice(0,2);
      mEl.value=mv;
      if(mv.length===2||(mv.length===1&&parseInt(mv,10)>1)){if(daysEl){daysEl.focus();daysEl.select();}}
    }
    A.projFormRecalc();
  },
  projFormRecalc:function(){
    var dEl=document.getElementById("fsd-d"),mEl=document.getElementById("fsd-m"),yEl=document.getElementById("fsd-y");
    var daysEl=document.getElementById("fdays"),fsd=document.getElementById("fsd"),fdl=document.getElementById("fdl"),disp=document.getElementById("fdl-disp");
    var box=document.getElementById("fdl-box");
    if(!dEl||!mEl||!daysEl)return;
    var y=yEl?parseInt(yEl.value,10):new Date().getFullYear();
    var start=isoFromDayMonth(dEl.value,mEl.value,y);
    var days=Math.max(1,parseInt(daysEl.value,10)||1);
    var dl=deadlineFromDuration(start,days);
    var dw=deadlineWarnStyle(dl);
    var prevStart=S.form?S.form.startDate:"",prevEnd=S.form?S.form.deadline:"";
    if(fsd)fsd.value=start;
    if(fdl)fdl.value=dl;
    if(disp){disp.textContent=dFmt(dl);disp.style.color=dw.color;}
    if(box)box.style.cssText=dw.box;
    if(S.form){
      S.form.startDate=start;S.form.deadline=dl;S.form.durationDays=days;
      if(S.form.assignMap){
        Object.keys(S.form.assignMap).forEach(function(eid){
          var a=S.form.assignMap[eid];if(!a)return;
          if(!a.startDate||a.startDate===prevStart){
            a.startDate=start;
            var sEl=document.getElementById("pas_"+eid);if(sEl)sEl.value=start;
          }
          if(!a.endDate||a.endDate===prevEnd){
            a.endDate=dl;
            var eEl=document.getElementById("pae_"+eid);if(eEl)eEl.value=dl;
          }
        });
      }
    }
  },
  ppc:function(id){var c=cById(id);if(c&&c.province){var el=document.getElementById("fp");if(el)el.value=c.province}},
  spr:function(){
    var f=S.form;var isNew=!f.id;var before=!isNew?JSON.parse(JSON.stringify(pById(f.id)||null)):null;
    f.name=document.getElementById("fn").value.trim();if(!f.name)return alert("Nhập tên dự án");
    f.custId=document.getElementById("fcu").value;f.province=document.getElementById("fp").value;f.type=document.getElementById("ft").value;f.priority=document.getElementById("fpr").value;
    A.projFormRecalc();
    collectFormItemStaff(f);
    ensureFormWorkItems(f);
    f.startDate=document.getElementById("fsd").value||defaultProjStart();
    f.durationDays=Math.max(1,parseInt((document.getElementById("fdays")||{}).value,10)||7);
    f.deadline=document.getElementById("fdl").value||deadlineFromDuration(f.startDate,f.durationDays);
    f.note=document.getElementById("fno").value;
    f.workItems=normWorkItems(f);
    if(!f.workItems.length)return alert("Cần ít nhất 1 hạng mục công việc.");
    finalizeWorkItemTitles(f.workItems);
    f.workItems.forEach(function(w){w.parentIds=workItemParentIds(w);});
    delete f.workFlow;
    if(!f.group||isOversightGroup(f.group))f.group=defaultFieldGroup();
    if(!Array.isArray(f.participantIds))f.participantIds=[];
    if(f.toTruongId==null)f.toTruongId="";
    if(f.vatTuId==null)f.vatTuId="";
    if(f.status!=="done"){
      if(td()<f.startDate)f.status="open";
      else f.status=f.participantIds&&f.participantIds.length?"in_progress":"open";
    }
    delete f.assignMap;
    delete f.itemStaff;
    delete f.chiefMap;
    delete f.wiOpenGrp;
    if(isNew){
      f.id=uid();
      f.participantIds=[];
      f.toTruongId="";
      f.vatTuId="";
      S.proj.push(f);
      var depN=f.workItems.filter(function(w){return workItemParentIds(w).length}).length;
      logProjEvent(f.id,"proj_create",{text:"Tạo dự án «"+f.name+"» · "+f.workItems.length+" hạng mục"+(depN?" · "+depN+" có phụ thuộc":" · song song")});
      pushUndo("Hoàn tác tạo dự án «"+f.name+"»","create_revert",{type:"proj",id:f.id});
      auditLog("action","create_proj","Tạo dự án «"+f.name+"» · "+f.workItems.length+" hạng mục (chưa giao NV)",{id:f.id,workItems:f.workItems.length});
    }else{
      if(!confirm("Lưu sẽ cập nhật hạng mục / lịch dự án.\nPhân công nhân viên giữ nguyên — điều chỉnh ở «Giao việc».\nTiếp tục?"))return;
      if(before){
        S.proj=S.proj.map(function(x){return x.id===f.id?Object.assign({},x,{startDate:f.startDate,deadline:f.deadline,durationDays:f.durationDays}):x});
        syncAsgnsToProjPlan(f, before);
      }
      // Giữ participant / roles đã có
      var prev=pById(f.id);
      if(prev){
        if(!f.participantIds.length&&prev.participantIds)f.participantIds=prev.participantIds.slice();
        if(!f.toTruongId&&prev.toTruongId)f.toTruongId=prev.toTruongId;
        if(!f.vatTuId&&prev.vatTuId)f.vatTuId=prev.vatTuId;
        if(prev.group)f.group=prev.group;
      }
      var keepWi={};
      f.workItems.forEach(function(w){keepWi[w.id]=1});
      // Đóng việc đang mở gắn hạng mục đã xoá
      S.asgn=S.asgn.map(function(a){
        if(a.projId!==f.id||isChiefAsgn(a))return a;
        if(a.status!=="active"&&a.status!=="paused"&&a.status!=="queued")return a;
        if(a.workItemId&&!keepWi[a.workItemId]){
          return Object.assign({},a,{status:"done",completedAt:a.completedAt||td()});
        }
        // Cập nhật tên hạng mục trên asgn còn sống
        if(a.workItemId&&keepWi[a.workItemId]){
          var wi=f.workItems.find(function(w){return w.id===a.workItemId});
          if(wi&&wi.title)a=Object.assign({},a,{workContent:wi.title});
        }
        return a;
      });
      activateQueuedWorkItems(f.id);
      S.proj=S.proj.map(function(x){return x.id===f.id?f:x});
      logProjEvent(f.id,"proj_edit",{text:"Cập nhật dự án «"+f.name+"» · "+f.workItems.length+" hạng mục"});
      if(before)pushUndo("Hoàn tác sửa dự án «"+f.name+"»","edit_revert",{type:"proj",before:before});
      auditLog("action","edit_proj","Sửa dự án «"+f.name+"»",{id:f.id});
    }
    sv();S.modal=null;S.form=null;render();
    if(isNew)alert("Đã tạo dự án «"+f.name+"». Tiếp theo mở Chi tiết → Giao việc để chọn nhân viên (chọn là đã giao việc).");
  },
  dp:function(id){
    if(!dirGuard())return;
    var p=pById(id);if(!p)return;
    if(!projLockedGuard(p))return;
    if(!confirm("Xoá dự án?"))return;
    var relAsgn=S.asgn.filter(function(a){return a.projId===id});
    moveToTrash("proj",p,{related:{asgn:relAsgn}});
    S.proj=S.proj.filter(function(x){return x.id!==id});
    S.asgn=S.asgn.filter(function(a){return a.projId!==id});
    if(S.selProjDet===id)S.selProjDet="";
    sv();S.modal=null;S.form=null;render();
  },
  pl:function(id,v){var el=document.getElementById("pg_"+id);if(el)el.textContent=v+"%"},
  ps2a:function(id,v){
    var prog=Math.max(0,Math.min(100,Number(v)||0));
    var a0=asgnById(id);
    var p0=a0?pById(a0.projId):null;
    if(a0&&isProjLocked(p0))return alert("Dự án đã hoàn thành — giám đốc cần mở lại trước khi chỉnh tiến độ.");
    if(a0&&a0.workItemId&&workItemEditLocked(p0,a0.workItemId))return alert("Hạng mục đã được xác nhận hoàn thành — chỉ giám đốc được thay đổi (tài liệu thống kê).");
    // Đặt 100% = hoàn thành phần việc (giữ lịch sử KPI) — không xoá khỏi dự án
    if(prog>=100&&a0&&a0.status!=="done"&&(a0.status==="active"||a0.status==="paused")){
      A.fin(id);
      return;
    }
    S.asgn=S.asgn.map(function(a){
      if(a.id!==id)return a;
      var next=Object.assign({},a,{prog:prog});
      // Giám đốc kéo tiến độ xuống dưới 100% trên việc đã xong → mở lại việc
      if(isDir()&&a.status==="done"&&prog<100&&!isChiefAsgn(a)){
        next.status="active";
        next.completedAt="";
        next.reopenedAt=td();
        next.reopenedFromProg=a.prog!=null?a.prog:100;
      }
      return next;
    });
    sv();render();
  },
  fin:function(id){
    var a=asgnById(id);if(!a||a.status==="done")return;
    if(a.status==="queued")return alert("Hạng mục này chưa tới lượt — cần hoàn thành các hạng mục cha trước.");
    if(!projLockedGuard(pById(a.projId)))return;
    if(a.workItemId&&workItemEditLocked(pById(a.projId),a.workItemId))return alert("Hạng mục đã được xác nhận hoàn thành — không đổi tiến độ NV (chỉ giám đốc).");
    var e=eById(a.empId);
    var info=asgnInfo(a);
    var chief=isChiefAsgn(a);
    logProjEvent(a.projId,"done",{
      empId:a.empId,empName:e?e.name:"",
      text:chief
        ?((e?e.name:"Chỉ huy trưởng")+" hoàn tất việc kiểm tra «"+(a.workContent||info.title)+"» (không ảnh hưởng tiến độ dự án)")
        :((e?e.name:"Nhân viên")+" hoàn tất phần việc «"+info.title+"»"+(a.loadPct!=null?" ("+a.loadPct+"%)":"")),
      meta:{asgnId:id,prog:100,scope:chief?"chief_inspect":"self",workItemId:a.workItemId||"",loadPct:a.loadPct,taskKind:chief?"chief":""}
    });
    S.asgn=S.asgn.map(function(x){return x.id===id?Object.assign({},x,{status:"done",prog:100,completedAt:x.completedAt||td(),taskKind:chief?"chief":x.taskKind}):x});
    if(!chief){
      activateQueuedWorkItems(a.projId);
      if(a.empId&&empFinishedOnProj(a.empId,a.projId)){
        logProjEvent(a.projId,"done",{empId:a.empId,empName:e?e.name:"",text:(e?e.name:"Nhân viên")+" đã xong phần việc thi công trong dự án — có thể nhận việc khác",meta:{scope:"emp_proj_done"}});
      }
    }
    sv();render();
  },
  empFin:function(id){
    var a=asgnById(id);
    if(!a||a.empId!==S.auth.empId)return alert("Chỉ nhân viên được giao việc mới hoàn tất phần việc của mình.");
    if(a.status==="done")return alert("Phần việc của bạn đã hoàn tất.");
    if(a.status==="queued")return alert("Hạng mục này chưa tới lượt — cần hoàn thành các hạng mục cha trước.");
    var chief=isChiefAsgn(a);
    var msg;
    if(chief){
      msg="Hoàn tất việc kiểm tra này?\n\nBạn sẽ rảnh để nhận kiểm tra dự án khác.\nViệc này KHÔNG ảnh hưởng tiến độ hay hoàn thành dự án.";
    }else{
      var left=empOpenLoadOnProj(a.empId,a.projId).filter(function(x){return x.id!==id&&!isChiefAsgn(x)}).length;
      msg=left
        ?"Hoàn tất phần việc này của bạn?\n\nBạn còn "+left+" phần việc thi công khác trong dự án. Dự án vẫn có thể đang làm — chỉ giám đốc/trưởng nhóm mới xác nhận hoàn thành cả dự án."
        :"Hoàn tất phần việc cuối của bạn trong dự án này?\n\nBạn sẽ rảnh để nhận việc khác.\nDự án chỉ chuyển Hoàn thành khi giám đốc hoặc trưởng nhóm xác nhận.";
    }
    if(!confirm(msg))return;
    S.selMyAsgn="";S.selMyAsgnOrg="";
    A.fin(id);
    if(typeof window.__CV3_completeMyAssignment==="function"){
      window.__CV3_completeMyAssignment(id, a._orgId||currentOrgId()).catch(function(err){
        alert((err&&err.message)||"Đã lưu trên máy nhưng chưa đồng bộ cloud. Thử lại khi có mạng.");
      });
    }
  },
  completeProj:function(id){
    var p=pById(id);
    if(!p)return alert("Không tìm thấy dự án.");
    if(p.status==="done")return alert("Dự án đã hoàn thành.");
    if(!canConfirmProjDone(p))return alert("Chỉ giám đốc hoặc trưởng nhóm của dự án mới được xác nhận hoàn thành cả dự án.\n\nChỉ huy trưởng / nhân viên chỉ hoàn tất phần việc của mình.");
    var openN=S.asgn.filter(function(a){return a.projId===id&&(a.status==="active"||a.status==="paused"||a.status==="queued")&&!isChiefAsgn(a)}).length;
    var msg="Xác nhận hoàn thành CẢ DỰ ÁN «"+p.name+"»?\n\n• Dự án sẽ chuyển sang mục Hoàn thành và bị khoá.\n• "+openN+" phần việc thi công còn mở sẽ được đóng.\n• Giám đốc vẫn có thể mở lại sau nếu phát sinh cần làm bổ sung.\n\nĐây không phải hoàn tất phần việc cá nhân.";
    if(!confirm(msg))return;
    applyCompleteProjectLocal(id,{
      byName:logActorName(),
      byRole:isDir()?"Giám đốc":"Trưởng nhóm",
      empId:isDir()?"":(S.auth&&S.auth.empId)||""
    });
    if(S.projView)S.projView="done";
    sv();
    render();
    if(!canOperate()&&typeof window.__CV3_completeProject==="function"){
      window.__CV3_completeProject(id, currentOrgId()).catch(function(err){
        alert((err&&err.message)||"Đã lưu trên máy nhưng chưa đồng bộ cloud. Báo giám đốc kiểm tra hoặc thử lại khi có mạng.");
      });
    }
  },
  completeWorkItem:function(projId,wiId){
    var p=pById(projId);
    if(!p)return alert("Không tìm thấy dự án.");
    if(!canConfirmWorkItem(p,wiId)){
      if(workItemIsConfirmed(p,wiId))return alert("Hạng mục này đã được xác nhận hoàn thành.");
      if(!canConfirmProjDone(p))return alert("Chỉ giám đốc hoặc trưởng nhóm của dự án mới xác nhận hoàn thành hạng mục.");
      return alert("Không xác nhận được hạng mục này.");
    }
    var w=workItemById(p,wiId);
    var avg=workItemAvgProg(p,wiId);
    var msg="Xác nhận hoàn thành hạng mục «"+(w?workItemLabel(w):"?")+"»?\n\n"
      +"• Tiến độ tổng sẽ thành 100% (hiện trung bình NV: "+avg+"%).\n"
      +"• Tiến độ từng nhân viên giữ nguyên để KPI.\n"
      +"• Thông tin hạng mục được khoá làm tài liệu thống kê — chỉ giám đốc còn được sửa.";
    if(!confirm(msg))return;
    if(!applyConfirmWorkItemLocal(projId,wiId))return alert("Không xác nhận được hạng mục.");
    sv();render();
  },
  reopenWorkItem:function(projId,wiId){
    if(!isDir())return alert("Chỉ giám đốc được mở lại hạng mục đã xác nhận.");
    var p=pById(projId);
    if(!p)return alert("Không tìm thấy dự án.");
    if(isProjLocked(p))return alert("Dự án đang khoá — mở lại dự án trước.");
    if(!workItemIsConfirmed(p,wiId))return alert("Hạng mục chưa được xác nhận.");
    var w=workItemById(p,wiId);
    if(!confirm("Mở lại hạng mục «"+(w?workItemLabel(w):"?")+"»?\n\nTiến độ tổng sẽ tính lại theo trung bình NV. Snapshot thống kê vẫn giữ trong lịch sử."))return;
    if(!applyReopenWorkItemLocal(projId,wiId))return alert("Không mở lại được hạng mục.");
    sv();render();
  },
  reopenProj:function(id){
    if(!isDir())return alert("Chỉ giám đốc được mở lại dự án đã hoàn thành.");
    var p=pById(id);
    if(!p)return alert("Không tìm thấy dự án.");
    if(p.status!=="done")return alert("Dự án chưa ở trạng thái hoàn thành.");
    S.form={type:"reopen_proj",projId:id,prog:80};
    S.modal=reopenProjProgM(S.form);render();
  },
  confirmReopenProj:function(){
    if(!S.form||S.form.type!=="reopen_proj")return;
    if(!isDir())return alert("Chỉ giám đốc được mở lại dự án đã hoàn thành.");
    var id=S.form.projId;
    var p=pById(id);
    if(!p||p.status!=="done"){S.modal=null;S.form=null;render();return alert("Dự án không còn ở trạng thái hoàn thành.");}
    var el=document.getElementById("rp-prog");
    var t=el?String(el.value||"").trim():"";
    var opts={byName:logActorName()};
    if(t!==""){
      var n=parseInt(t,10);
      if(isNaN(n)||n<0||n>99)return alert("Nhập số từ 0 đến 99, hoặc để trống.");
      opts.progTarget=n;
    }
    var res=applyReopenProjectLocal(id,opts);
    if(!res)return alert("Không mở lại được dự án.");
    S.modal=null;S.form=null;
    sv();
    auditLog("action","reopen_proj","Mở lại dự án «"+p.name+"»"+(res.reopened?" · hạ "+res.reopened+" việc về "+res.progTarget+"%":" · giữ việc đã xong"),{id:id,reopened:res.reopened,progTarget:res.progTarget});
    if(confirm("Đã mở lại dự án.\n\nMở form Sửa để thêm hạng mục bổ sung ngay bây giờ?")){
      A.op(id);
    }else{
      render();
    }
  },
  reopenAsgn:function(id){
    if(!isDir())return alert("Chỉ giám đốc được mở lại phần việc đã hoàn tất.");
    var a=asgnById(id);
    if(!a||a.status!=="done")return alert("Phần việc này không ở trạng thái đã xong.");
    if(isChiefAsgn(a))return alert("Việc kiểm tra Chỉ huy trưởng quản lý riêng — không dùng nút này.");
    var p=pById(a.projId);
    if(p&&p.status==="done")return alert("Hãy mở lại dự án trước (nút «Mở lại để làm bổ sung»).");
    S.editAsgnProg={asgnId:id,mode:"reopen"};
    S.modal=null;S.form=null;
    render();
    setTimeout(function(){var el=document.getElementById("ap-prog");if(el){el.focus();el.select();}},40);
  },
  setAsgnProg:function(id){
    if(!isDir())return alert("Chỉ giám đốc được chỉnh tiến độ phần việc này.");
    var a=asgnById(id);
    if(!a)return alert("Không tìm thấy phần việc.");
    var p=pById(a.projId);
    if(isProjLocked(p))return alert("Dự án đang khoá — mở lại dự án trước.");
    if(a.workItemId&&workItemEditLocked(p,a.workItemId))return alert("Hạng mục đã xác nhận hoàn thành — chỉ giám đốc được sửa (bạn cần đăng nhập giám đốc).");
    S.editAsgnProg={asgnId:id,mode:"set"};
    S.modal=null;S.form=null;
    render();
    setTimeout(function(){var el=document.getElementById("ap-prog");if(el){el.focus();el.select();}},40);
  },
  saveAsgnProg:function(){
    var ed=S.editAsgnProg;
    var fromForm=S.form&&S.form.type==="asgn_prog";
    if(!ed&&!fromForm)return;
    if(!isDir())return alert("Chỉ giám đốc được chỉnh tiến độ phần việc này.");
    var id=ed?ed.asgnId:S.form.asgnId;
    var mode=(ed?ed.mode:(S.form.mode==="reopen"?"reopen":"set"));
    var el=document.getElementById("ap-prog");
    var n=parseInt(el?String(el.value||"").trim():"",10);
    var max=mode==="reopen"?99:100;
    if(isNaN(n)||n<0||n>max)return alert("Nhập số từ 0 đến "+max+".");
    var a=asgnById(id);
    if(!a){S.editAsgnProg=null;S.modal=null;S.form=null;render();return alert("Không tìm thấy phần việc.");}
    var p=pById(a.projId);
    if(isProjLocked(p))return alert("Dự án đang khoá — mở lại dự án trước.");
    if(a.workItemId&&workItemEditLocked(p,a.workItemId))return alert("Hạng mục đã xác nhận — chỉ giám đốc được sửa.");
    S.editAsgnProg=null;S.modal=null;S.form=null;
    if(mode==="reopen"){
      if(a.status!=="done")return alert("Phần việc này không ở trạng thái đã xong.");
      if(!applyReopenAsgnLocal(id,n))return alert("Không mở lại được phần việc.");
      sv();render();
      return;
    }
    A.ps2a(id,n);
  },
  sxm:function(id){var a=asgnById(id);if(!a||a.status!=="active")return;S.form={type:"sapxep",asgnId:id,mode:"transfer",note:"",targetProj:"",targetEmp:""};S.modal=sapXepM(S.form);render()},
  sxmMode:function(mode){if(!S.form||S.form.type!=="sapxep")return;S.form.mode=mode;S.modal=sapXepM(S.form);render()},
  sapXep:function(){
    if(!S.form||S.form.type!=="sapxep")return;
    var src=asgnById(S.form.asgnId);if(!src||src.status!=="active")return;
    var note=(document.getElementById("sxpNote")||{}).value||"",mode=(document.getElementById("sxpMode")||{}).value||S.form.mode;
    var emp=eById(src.empId);if(!emp)return;
    if(mode==="transfer"){
      var tgtId=(document.getElementById("sxpProj")||{}).value;if(!tgtId)return alert("Chọn dự án cần ưu tiên");
      var tgt=pById(tgtId);if(!tgt)return;
      var pauseTxt=note||("Tạm chuyển sang: "+tgt.name);
      var srcProj=pById(src.projId);
      if(srcProj&&stripEmpProjRoles(srcProj,emp.id))S.proj=S.proj.map(function(x){return x.id===srcProj.id?srcProj:x});
      S.asgn=S.asgn.map(function(a){return a.id===src.id?Object.assign({},a,{status:"paused",pausedAt:td(),pauseNote:pauseTxt}):a});
      logProjEvent(src.projId,"transfer",{empId:emp.id,empName:emp.name,text:emp.name+" tạm chuyển sang «"+tgt.name+"»",meta:{asgnId:src.id,toProjId:tgtId,fromProjId:src.projId,note:pauseTxt}});
      var dates=asgnDates(tgt);
      var arriveRaw=readArriveAtInput("sxp-arrive");
      if(arriveRaw==="invalid")return alert("Giờ có mặt không hợp lệ.");
      var na=mkAsgn(emp.id,tgt.id,0,{startDate:td(),endDate:dates.end,workContent:"Chuyển từ: "+asgnInfo(src).title});
      if(arriveRaw){na.arriveAt=arriveRaw;addArrivalReminder(emp.id,na.id,arriveRaw,asgnLocLabel(na));}
      S.asgn.push(na);
      recordAssign(tgt.id,emp,na," (điều sang dự án)");
      applyProjLocToEmp(emp,tgt,td());
      if(tgt.status==="open"){tgt.status="in_progress";S.proj=S.proj.map(function(x){return x.id===tgt.id?tgt:x})}
    }else{
      var newId=(document.getElementById("sxpEmp")||{}).value;if(!newId)return alert("Chọn người nhận bàn giao");
      var newEmp=eById(newId),pr=pById(src.projId);if(!newEmp)return;
      var handTxt=note||("Bàn giao cho "+newEmp.name);
      S.asgn=S.asgn.map(function(a){return a.id===src.id?Object.assign({},a,{status:"handoff",handoffTo:newId,handoffAt:td(),handoffNote:handTxt}):a});
      logProjEvent(src.projId,"handoff",{empId:emp.id,empName:emp.name,text:emp.name+" bàn giao "+src.prog+"% cho "+newEmp.name,meta:{asgnId:src.id,toEmpId:newId,prog:src.prog,note:handTxt}});
      var naHand=mkAsgn(newId,src.projId,src.prog,{startDate:td(),endDate:src.endDate,workContent:src.workContent,custName:src.custName,contact:src.contact,parentAsgnId:src.id,handoffFrom:src.empId});
      S.asgn.push(naHand);
      recordAssign(src.projId,newEmp,naHand," (bàn giao từ "+emp.name+")");
      if(pr)applyProjLocToEmp(newEmp,pr,td());
    }
    sv();S.modal=null;S.form=null;render();
  },
  resumeAsgn:function(id){
    var a=asgnById(id);if(!a||a.status!=="paused")return;
    var emp=eById(a.empId);if(!emp)return;
    var others=S.asgn.filter(function(x){return x.empId===a.empId&&x.status==="active"});
    if(others.length&&!confirm("Tạm dừng "+others.length+" việc đang làm khác để quay lại việc này?"))return;
    S.asgn=S.asgn.map(function(x){
      if(x.empId===a.empId&&x.status==="active")return Object.assign({},x,{status:"paused",pausedAt:td(),pauseNote:"Quay lại: "+asgnInfo(a).title});
      if(x.id===a.id)return Object.assign({},x,{status:"active",pausedAt:null});
      return x;
    });
    var pr=pById(a.projId);if(pr)applyProjLocToEmp(emp,pr,td());
    logProjEvent(a.projId,"resume",{empId:emp.id,empName:emp.name,text:emp.name+" quay lại làm việc",meta:{asgnId:id}});
    sv();render();
  },
  
  editAsgn: function(id) {
    if(!dirGuard()) return;
    var a = asgnById(id);
    if(a) {
      S.form = JSON.parse(JSON.stringify(a));
      S.modal = editAsgnM(S.form);
      render();
    }
  },
  saveEditAsgn: function(id) {
    if(!dirGuard()) return;
    var a = asgnById(id);
    if(!a) return;
    if(!projLockedGuard(pById(a.projId)))return;
    var before=JSON.parse(JSON.stringify(a));
    var wc = document.getElementById("eawc").value;
    var sd = document.getElementById("easd").value;
    var ed = document.getElementById("eaed").value;
    var arr = document.getElementById("eaarr").value;
    var cn = document.getElementById("eacn").value;
    var ct = document.getElementById("eact").value;
    
    S.asgn = S.asgn.map(function(x) {
      return x.id === id ? Object.assign({}, x, {
        workContent: wc, startDate: sd, endDate: ed, arriveAt: arr, custName: cn, contact: ct
      }) : x;
    });
    var emp = eById(a.empId);
    logProjEvent(a.projId, "proj_edit", {text: "Cập nhật công việc giao cho "+(emp?emp.name:"?"), meta:{asgnId:id}});
    pushUndo("Hoàn tác sửa giao việc","edit_revert",{type:"asgn",before:before});
    auditLog("action","edit_asgn","Sửa giao việc cho "+(emp?emp.name:"?"),{asgnId:id,projId:a.projId});
    sv();
    S.modal = null;
    S.form = null;
    render();
  },

  delAsgn:function(id){
    if(!dirGuard())return;
    var a=asgnById(id);
    if(a&&!projLockedGuard(pById(a.projId)))return;
    if(!confirm("Huỷ giao việc này?\nNgười đó sẽ bị bỏ khỏi hạng mục — không tính là đã hoàn thành."))return;
    A._purgeAsgnFromProj(id,"manual_delete");
  },
  /** Huỷ giao việc / xoá nhầm — dùng từ form sửa việc; trên UI chính dùng «Giao việc». */
  dropAsgn:function(id){
    A.delAsgn(id);
  },
  _purgeAsgnFromProj:function(id,reason){
    var a=asgnById(id);if(!a)return;
    var empId=a.empId,projId=a.projId;
    moveToTrash("asgn",a);
    logProjEvent(projId,"unassign",{
      empId:empId,
      text:"Bỏ khỏi hạng mục — huỷ giao việc (không tính hoàn thành)",
      meta:{asgnId:id,reason:reason||"drop"}
    });
    S.asgn=S.asgn.filter(function(x){return x.id!==id});
    var still=S.asgn.some(function(x){
      return x.projId===projId&&x.empId===empId&&(x.status==="active"||x.status==="paused"||x.status==="queued")&&!isChiefAsgn(x);
    });
    if(!still){
      var p=pById(projId);
      if(p){
        if(p.participantIds)p.participantIds=p.participantIds.filter(function(x){return x!==empId});
        if(p.toTruongId===empId)p.toTruongId="";
        if(p.vatTuId===empId)p.vatTuId="";
        S.proj=S.proj.map(function(x){return x.id===p.id?p:x});
      }
    }
    if(S.editAsgnProg&&S.editAsgnProg.asgnId===id)S.editAsgnProg=null;
    sv();render();
  },
  rt:function(id,q){if(!sensitiveGuard())return;S.asgn=S.asgn.map(function(a){return a.id===id?Object.assign({},a,{quality:q}):a});sv();render()},
  qn:function(id,t){if(!canViewSensitive())return;S.asgn=S.asgn.map(function(a){return a.id===id?Object.assign({},a,{qNote:t}):a});sv()},
  togPraise:function(id,on){if(!sensitiveGuard())return;S.asgn=S.asgn.map(function(a){return a.id===id?Object.assign({},a,{praise:!!on}):a});sv();render()},
  togComplaint:function(id,on){if(!sensitiveGuard())return;S.asgn=S.asgn.map(function(a){return a.id===id?Object.assign({},a,{complaint:!!on}):a});sv();render()},
  kpiPeriod:function(kind){
    if(!canViewQual())return;
    S.kpiPeriod=kind||"month";
    render();
    ensureKpiAttendanceHistory();
  },
  kpiMonthPick:function(v){
    if(!canViewQual())return;
    S.kpiMonth=v||attMonthKey();
    render();
    ensureKpiAttendanceHistory();
  },
  openRework:function(asgnId){
    if(!giaoGuard())return;
    var done=S.asgn.filter(function(a){return a.status==="done"});
    if(!done.length)return alert("Chưa có việc hoàn thành để ghi khắc phục.");
    S.form={type:"rework",asgnId:asgnId||done[0].id,days:1,note:""};
    S.modal=reworkM(S.form);render();
  },
  saveRework:function(){
    if(!giaoGuard())return;
    var asgnId=(document.getElementById("rw-asgn")||{}).value;
    var days=Math.max(1,Math.min(90,parseInt((document.getElementById("rw-days")||{}).value,10)||0));
    var note=((document.getElementById("rw-note")||{}).value||"").trim();
    var a=asgnById(asgnId);
    if(!a||a.status!=="done")return alert("Chọn việc đã hoàn thành.");
    if(!days)return alert("Nhập số ngày khắc phục.");
    var by=eById(S.auth&&S.auth.empId)||{};
    var entry={id:uid(),days:days,note:note,at:td(),byEmpId:S.auth&&S.auth.empId||"",byName:by.name||S.auth.displayName||"Điều hành"};
    S.asgn=S.asgn.map(function(x){
      if(x.id!==asgnId)return x;
      var list=(x.reworks||[]).slice();
      list.push(entry);
      return Object.assign({},x,{reworks:list,completedAt:x.completedAt||td()});
    });
    var info=asgnInfo(a);
    logProjEvent(a.projId,"rework",{empId:a.empId,text:"Khắc phục +"+days+" ngày cho «"+info.title+"»"+(note?": "+note:""),meta:{asgnId:asgnId,days:days}});
    auditLog("action","rework","Khắc phục +"+days+" ngày · "+info.title,{asgnId:asgnId,days:days});
    sv();S.modal=null;S.form=null;render();
  },
  ww:function(k,v){if(!staffGuard())return;S.cfg[k]=Number(v);sv()},
  wl:function(k,v){if(!canManageStaff())return;S.cfg[k]=Number(v);var sw=(S.cfg.wP+S.cfg.wA+S.cfg.wS)||1;["wP","wA","wS"].forEach(function(kk){var el=document.getElementById("w_"+kk);if(el)el.textContent=Math.round(S.cfg[kk]/sw*100)+"%"})},
  ns:function(k,v){if(!canManageStaff())return;S.cfg[k]=Number(v);sv()},
  ss:function(k,v){if(!staffGuard())return;S.cfg[k]=v;sv();render()},
  setTheme:function(t){if(t!=="light"&&t!=="dark")return;S.cfg.theme=t;applyTheme(t);sv();if(S.tab==="cfg"||S.tab==="settings")render()},
  exp:function(){if(!canManageStaff())return alert("Chỉ giám đốc được sao lưu dữ liệu.");doBackup(false);},
  imp:function(){
    if(!canManageStaff())return alert("Chỉ giám đốc được khôi phục dữ liệu.");
    var el=document.getElementById("bk-restore-file");
    if(el){el.value="";el.click();}
  },
  impFile:function(input){
    if(!canManageStaff())return;
    var file=input&&input.files&&input.files[0];
    if(!file)return;
    var reader=new FileReader();
    reader.onload=function(){
      try{
        var data=JSON.parse(String(reader.result||""));
        restoreBackupPayload(data).catch(function(e){alert(e.message||"Khôi phục thất bại.");});
      }catch(e){alert("File JSON không hợp lệ.");}
      if(input)input.value="";
    };
    reader.onerror=function(){alert("Không đọc được file.");if(input)input.value="";};
    reader.readAsText(file);
  },
  demo:function(){alert("Chức năng tạo việc test đã tắt — chương trình đang dùng dữ liệu thật.");},
  rst:function(){alert("Dùng «Khôi phục từ file» trong Cài đặt → Cloud & sao lưu để phục hồi cả 2 đội.");},
  notifEmp:function(id){
    function fail(msg){
      S.empPushBusy=0;S.empPushMsg="✗ "+msg;render();
    }
    function ok(msg){
      S.empPushBusy=0;S.empPushMsg="✓ "+msg;showAppToast(msg,"ok");empPushNotifyTest();render();
    }
    if(!id)return fail("Không xác định được nhân viên.");
    if(typeof window.__CV3_enablePush!=="function")return fail("Cần đăng nhập cloud để bật thông báo giao việc.");
    if(!remindVapidOk())return fail(remindVapidFailShort());
    S.empPushBusy=1;S.empPushMsg="";render();
    var done=false;
    var timer=setTimeout(function(){
      if(done)return;
      done=true;
      fail("Hết thời gian chờ — kiểm tra mạng và thử lại.");
    },25000);
    var p=window.__CV3_enablePush(id);
    if(!p||typeof p.then!=="function"){clearTimeout(timer);return fail("Chức năng thông báo chưa sẵn sàng — thử tải lại trang.");}
    p.then(function(res){
      if(done)return;
      done=true;clearTimeout(timer);
      if(res&&res.ok)return ok("Đã bật thông báo giao việc thành công!");
      fail(empPushFailMsg(res));
    }).catch(function(e){
      if(done)return;
      done=true;clearTimeout(timer);
      fail((e&&e.message)||"Không bật được thông báo.");
    });
  },
  notifRemind:function(){
    function fail(msg){
      S.remindPushBusy=0;S.remindPushMsg="✗ "+msg;showAppToast(msg,"err");render();
    }
    function ok(msg){
      S.remindPushBusy=0;S.remindPushMsg="✓ "+msg;showAppToast(msg,"ok");remindPushNotifyTest();render();
    }
    if(!sensitiveGuard())return;
    if(!remindVapidOk())return fail(remindVapidFailShort()+"\n"+remindVapidFailDetail());
    if(typeof window.__CV3_enableRemindPush!=="function")return fail("Cần đăng nhập cloud để nhận nhắc hẹn khi app đóng.");
    S.remindPushBusy=1;S.remindPushMsg="";render();
    var done=false;
    var timer=setTimeout(function(){
      if(done)return;
      done=true;
      fail("Hết thời gian chờ — kiểm tra mạng và thử lại.");
    },25000);
    window.__CV3_enableRemindPush().then(function(res){
      if(done)return;
      done=true;clearTimeout(timer);
      if(res&&res.ok)return ok("Đã bật thông báo nền — nhắc hẹn sẽ đến khi app đóng.");
      fail(empPushFailMsg(res));
    }).catch(function(e){
      if(done)return;
      done=true;clearTimeout(timer);
      fail((e&&e.message)||"Không bật được thông báo nền.");
    });
  }
};

/* ---- auto daily backup ---- */
/** Tên file liền: ngày+tháng+năm(2 số)+CT+giờ+phút (VD: 010826CT1145.json) */
function backupStamp(d){
  d=d||new Date();
  return pad2(d.getDate())+pad2(d.getMonth()+1)+pad2(d.getFullYear()%100)+"CT"+pad2(d.getHours())+pad2(d.getMinutes());
}
function backupFileName(d){return backupStamp(d)+".json";}
function downloadBackupJson(payload,stamp){
  var blob=new Blob([JSON.stringify(payload,null,2)],{type:"application/json"});
  var url=URL.createObjectURL(blob);var a=document.createElement("a");
  a.href=url;a.download=(stamp||backupStamp())+".json";a.click();URL.revokeObjectURL(url);
}
function localDualBackupPayload(){
  var cur=currentOrgId();
  var other=typeof window.__CV3_otherOrgId==="function"?window.__CV3_otherOrgId(cur):(cur==="nha-may"?"cong-trinh":"nha-may");
  var wsCur={
    emp:S.emp,cust:S.cust,proj:S.proj,asgn:S.asgn,projLog:S.projLog||[],
    reminders:S.reminders||[],auditLog:S.auditLog||[],trash:S.trash||[],cfg:S.cfg,patch:loadPatch()
  };
  var workspaces={};workspaces[cur]=wsCur;
  // Không có cloud: đội kia để trống (ghi chú trong file)
  if(!workspaces[other])workspaces[other]={emp:[],cust:[],proj:[],asgn:[],projLog:[],reminders:[],auditLog:[],trash:[],cfg:{},patch:0,_note:"offline-empty"};
  return{
    version:2,kind:"dual-org",at:new Date().toISOString(),
    orgs:listAppOrgs().map(function(o){return o.id}),
    employees:S.empAll&&S.empAll.length?S.empAll:S.emp,
    workspaces:workspaces,
    offlinePartial:true
  };
}
function markBackupDone(stamp,auto,extra){
  var note=stamp+(auto?" (tự động)":" (thủ công)")+(extra||"");
  ps2("cv3_lastbk",note);
  ps2("cv3_lastbk_day",td());
  var log=load("cv3_bklog",[]);log.push(note);if(log.length>30)log=log.slice(-30);
  ps2("cv3_bklog",log);
}
function doBackup(auto){
  var stamp=backupStamp();
  function finishLocal(msg){
    var payload=localDualBackupPayload();
    downloadBackupJson(payload,stamp);
    markBackupDone(stamp,auto,msg||" · local");
    if(!auto)alert("Đã tải file sao lưu (chế độ máy). Nên đăng nhập cloud để sao lưu đủ cả 2 đội từ server.");
  }
  if(typeof window.__CV3_exportCompanyBackup==="function"&&window.__CV3_AUTH&&window.__CV3_AUTH.role==="director"){
    window.__CV3_exportCompanyBackup()
      .then(function(data){
        if(!data||!data.workspaces){finishLocal(" · fallback");return;}
        downloadBackupJson(data,stamp);
        markBackupDone(stamp,auto," · 2 đội");
        if(!auto)showAppToast("Đã sao lưu cả Công trình tỉnh và Công trình HCM","ok");
        if(S.tab==="cfg"||S.tab==="settings")render();
      })
      .catch(function(err){
        console.warn("exportCompanyBackup:",err);
        finishLocal(" · offline");
      });
    return;
  }
  finishLocal("");
}
async function restoreBackupPayload(data){
  if(!data||typeof data!=="object")throw new Error("File không hợp lệ.");
  var isDual=data.kind==="dual-org"||(data.workspaces&&typeof data.workspaces==="object");
  var msg=isDual
    ?"Khôi phục file này sẽ ghi đè dữ liệu cloud của CẢ 2 đội (Công trình tỉnh + Công trình HCM) và danh sách nhân viên dùng chung. Tiếp tục?"
    :"File cũ (1 đội). Sẽ khôi phục vào đội đang xem («"+orgLabelOf(currentOrgId())+"»). Tiếp tục?";
  if(!confirm(msg))return;
  if(typeof window.__CV3_restoreCompanyBackup!=="function"){
    throw new Error("Cần đăng nhập cloud (giám đốc) để khôi phục cả 2 đội.");
  }
  showAppToast("Đang khôi phục…","ok");
  var res=await window.__CV3_restoreCompanyBackup(data,currentOrgId());
  alert((res&&res.message)||"Khôi phục xong.");
  location.reload();
}
function checkAutoBackup(){
  var lastDay=load("cv3_lastbk_day","");
  if(!lastDay){
    var legacy=load("cv3_lastbk","");
    if(legacy&&/^\d{4}-\d{2}-\d{2}/.test(legacy))lastDay=legacy.slice(0,10);
  }
  if(lastDay!==td()){setTimeout(function(){doBackup(true);},1200);}
}
initViewActions();
window.__CV3={
  S:S,render:render,scheduleRender:scheduleRender,seedDemo:seedDemo,seedE:seedE,DS:DS,getVapidKey:getVapidKey,applyVapidFromCfg:applyVapidFromCfg,showAppToast:showAppToast,toastIncomingChat:toastIncomingChat,
  getPatch:function(){return loadPatch();},
  setPatch:function(p){ps2Ws("cv3_patch",p||0);},
  /** Đổi đội: nạp cache local của đội đó (hoặc rỗng), không giữ dự án đội trước. */
  prepareOrgWorkspace:function(){
    S.modal=null;S.form=null;
    S.selProj="";S.selProjDet="";S.selEmp="";S.selCust="";S.giaoProj="";
    S.reports=[];S.attendance=[];S.leaveReqs=[];S.leaveBoardId="";S._reportsSig="";S._attSig="";
    S._empMasterSig="";S._custMasterSig="";
    S.asgnOther=[];S.projOther=[];S.otherOrgId="";
    S.proj=loadWs("cv3_p",[]);
    S.asgn=loadWs("cv3_a",[]);
    S.projLog=loadWs("cv3_pl",[]);
    S.reminders=loadWs("cv3_r",[])||[];
    S.auditLog=loadWs("cv3_audit",[])||[];
    S.trash=loadWs("cv3_trash",[])||[];
    render();
  },
  setSvHook:function(fn){_fbSv=fn;},
  applyRemote:function(data){
    if(data.empAll)S.empAll=data.empAll;
    if(data.emp){
      var keepFcm={};
      S.emp.forEach(function(e){if(e.id&&e.fcmToken)keepFcm[e.id]=e.fcmToken;});
      (S.empAll||[]).forEach(function(e){if(e.id&&e.fcmToken)keepFcm[e.id]=e.fcmToken;});
      var myId=S.auth&&S.auth.empId;
      if(myId&&window.__CV3_FCM&&window.__CV3_FCM.token)keepFcm[myId]=window.__CV3_FCM.token;
      S.emp=data.emp.map(function(e){
        var o=Object.assign({},e,{loginKey:e.loginKey||nameToLoginKey(e.name),accountRole:e.accountRole||"employee",orgIds:e.orgIds&&e.orgIds.length?e.orgIds:[currentOrgId()]});
        if(!o.fcmToken&&keepFcm[e.id])o.fcmToken=keepFcm[e.id];
        return o;
      });
      if(!data.empAll){
        var byId={};
        (S.empAll||[]).forEach(function(e){if(e&&e.id)byId[e.id]=e;});
        S.emp.forEach(function(e){byId[e.id]=Object.assign({},byId[e.id]||{},e);});
        S.empAll=Object.keys(byId).map(function(k){return byId[k];});
      }
    }
    if(migrateWorkspace()){/* group/director fix applied */}
    if(data.cust)S.cust=data.cust;
    // Dùng Array.isArray: [] là falsy — phải nhận workspace trống khi đổi đội
    if(Array.isArray(data.proj))S.proj=data.proj;
    if(Array.isArray(data.asgn))S.asgn=data.asgn;
    if(Array.isArray(data.projLog))S.projLog=data.projLog;
    if(Array.isArray(data.reminders))applyIncomingReminders(data.reminders);
    if(Array.isArray(data.auditLog))S.auditLog=data.auditLog;
    if(Array.isArray(data.trash))S.trash=data.trash;
    if(data.cfg){S.cfg=Object.assign({},DS,data.cfg);ensureCfgGroups();ensureCompanyInfo();applyVapidFromCfg();applyTheme(S.cfg.theme);}
    purgeExpiredTrash();
    schedulePersistCache();
    if(data.patch!=null)ps2Ws("cv3_patch",data.patch);
  },
  applyEmpMaster:function(all,forOrg){
    all=all||[];forOrg=forOrg||[];
    var sig=all.length+"|"+forOrg.map(function(e){
      return (e&&e.id||"")+":"+(e.authUid||"")+":"+(e.name||"")+":"+(e.group||"")+":"+(e.status||"")+":"+String(e.orgIds||[])+":"+(e.fcmToken||"");
    }).join(";");
    if(sig===S._empMasterSig){
      S.empAll=all;S.emp=forOrg;
      if(tryApplyChatDeepLink())render();
      return;
    }
    S._empMasterSig=sig;
    S.empAll=all;
    S.emp=forOrg;
    schedulePersistCache();
    tryApplyChatDeepLink();
    scheduleRender();
  },
  applyCustMaster:function(list){
    list=list||[];
    var sig=list.map(function(c){return (c&&c.id||"")+":"+(c.name||"")+":"+(c.shortName||"")+":"+(c.province||"")+":"+(c.lat||"")+":"+(c.lng||"");}).join(";");
    if(sig===S._custMasterSig){S.cust=list;return;}
    S._custMasterSig=sig;
    S.cust=list;
    schedulePersistCache();
    if(S.tab==="cust"||S.selCust||S.tab==="proj")scheduleRender();
    else if(S.modal)scheduleRender();
  },
  setOtherOrgAsgn:function(asgn,otherId,proj){
    S.asgnOther=asgn||[];
    S.projOther=proj||[];
    S.otherOrgId=otherId||"";
    if(S.tab==="emp"||S.selEmp||S.tab==="kpi"||S.tab==="mywork"||S.tab==="report"||S.tab==="prog"||S.tab==="dash")scheduleRender();
  },
  mergeEmpAuthFromRemote:function(remoteEmp){
    if(!remoteEmp||!remoteEmp.length)return false;
    var byId={};
    remoteEmp.forEach(function(e){if(e.id&&e.authUid)byId[e.id]={authUid:e.authUid,loginKey:e.loginKey||""};});
    var changed=false;
    S.emp=S.emp.map(function(e){
      var r=byId[e.id];
      if(!r||e.authUid===r.authUid)return e;
      changed=true;
      return Object.assign({},e,{authUid:r.authUid,loginKey:r.loginKey||e.loginKey||nameToLoginKey(e.name)});
    });
    if(changed){schedulePersistCache();scheduleRender();}
    return changed;
  },
  mergeProvisionResults:function(data){
    var results=(data&&data.results)||[],patch=data&&data.patch;
    if(!results.length)return;
    var byId={};
    results.forEach(function(r){if(r.empId&&r.uid)byId[r.empId]={authUid:r.uid,loginKey:r.loginKey||""};});
    S.emp=S.emp.map(function(e){
      var u=byId[e.id];
      if(!u)return e;
      return Object.assign({},e,{authUid:u.authUid,loginKey:u.loginKey||e.loginKey||nameToLoginKey(e.name)});
    });
    schedulePersistCache();
    if(patch!=null){var cur=loadPatch();if(patch>cur)ps2Ws("cv3_patch",patch);}
    scheduleRender();
  },
  linkFcmToEmp:function(empId,token){
    var cur=eById(empId);
    if(cur&&cur.fcmToken===token)return;
    S.emp=S.emp.map(function(e){return e.id===empId?Object.assign({},e,{fcmToken:token}):e;});
    sv();
  },
  linkEmpAuth:function(empId,uid){
    if(!empId)return;
    var cur=S.emp.find(function(e){return e.id===empId});
    if(cur&&cur.authUid===uid)return;
    S.emp=S.emp.map(function(e){return e.id===empId?Object.assign({},e,{authUid:uid}):e;});
    sv();
  },
  setAuth:function(a){
    a=a||{role:null,empId:null,empGroup:"",username:"",uid:"",displayName:"",age:null,orgId:"",orgIds:[]};
    var prev=S.auth||{};
    var same=prev.role===a.role&&prev.empId===a.empId&&prev.empGroup===a.empGroup&&prev.uid===a.uid&&prev.username===a.username&&prev.displayName===a.displayName&&prev.age===a.age&&prev.orgId===a.orgId&&String(prev.orgIds||[])===String(a.orgIds||[]);
    S.auth=a;
    loadPersonalRemindersForAuth();
    if(a.role==="director"&&a.uid){
      var dcName=a.displayName||a.username||"Giám đốc";
      var prevDc=(S.cfg&&S.cfg.directorContact)||{};
      var dcCh=prevDc.uid!==a.uid||prevDc.name!==dcName||prevDc.username!==(a.username||"");
      var empBefore=S.emp.length;
      S.cfg=Object.assign({},S.cfg,{
        directorContact:{
          uid:a.uid,
          name:dcName,
          username:a.username||""
        }
      });
      S.emp=S.emp.filter(isStaffEmp);
      if(dcCh||S.emp.length!==empBefore)sv();
    }
    if(a.role==="employee"&&!same){
      var e0=a.empId?eById(a.empId):null;
      var g0=(a.empGroup||(e0&&e0.group)||"");
      var fullUI=g0==="Điều hành"||g0==="Giám sát";
      S.tab=g0==="Hành chính"?"chamcong":(fullUI?"dash":"mywork");
      S.selMyAsgn="";S.selMyAsgnOrg="";S.selEmp="";S.reportAsgn="";S.attFlow=null;S.arrivalFlow=null;S.modal=null;S.form=null;S.empPushMsg="";S.empPushBusy=0;
    }
    if(!same&&a.role&&a.uid){
      var loginName=a.displayName||a.username||logActorName()||"Người dùng";
      auditLog("access","login","Đăng nhập: "+loginName,{role:a.role,empGroup:a.empGroup||""});
      bumpPatch();
      if(canOperate()&&_fbSv)_fbSv();
    }else if(!same&&prev.role&&prev.uid&&(!a.role||!a.uid)){
      if(!S.auditLog)S.auditLog=[];
      S.auditLog.push({id:uid(),at:new Date().toISOString(),kind:"access",type:"logout",by:prev.displayName||prev.username||"?",byUid:prev.uid||"",text:"Đăng xuất: "+(prev.displayName||prev.username||"?"),meta:{role:prev.role||""}});
      if(S.auditLog.length>AUDIT_MAX)S.auditLog=S.auditLog.slice(-AUDIT_MAX);
      ps2Ws("cv3_audit",S.auditLog);
      clearUndo();
    }
    if(!same&&a.role&&a.uid&&(!prev.role||!prev.uid||prev.uid!==a.uid)){
      clearUndo();
    }
    var openedDm=tryApplyChatDeepLink();
    if(!same||openedDm)scheduleRender();
  },
  setChatMsgs:function(msgs){
    msgs=msgs||[];
    var prev=S.chat||[];
    var prevIds={};
    prev.forEach(function(m){if(m&&m.id)prevIds[m.id]=1;});
    var sig=msgs.map(function(m){return (m.id||"")+":"+(m.readAt||"")+":"+(m.deliveredAt||"")}).join("|");
    if(sig===S._chatSig){S.chat=msgs;updateRemindBadge();return;}
    var me=S.auth&&S.auth.uid;
    if(me&&prev.length){
      var openTid="",openLeave="",key;
      if(S.tab==="leave"&&S.leaveBoardId)openLeave=String(S.leaveBoardId);
      else if(S.tab==="chat"&&S.chatTo&&S.chatTo!=="broadcast"){
        if(isLeaveChatTo(S.chatTo))openLeave=leaveIdFromChatTo(S.chatTo);
        else{
          key=chatToThreadKey(S.chatTo);
          if(key&&key.indexOf("dm:")===0)openTid=dmThreadId(me,key.slice(3));
        }
      }
      var i,m;
      for(i=0;i<msgs.length;i++){
        m=msgs[i];
        if(!m||!m.id||prevIds[m.id])continue;
        if(m.uid===me)continue;
        if(m.type==="leave"){
          if(!m.participants||m.participants.indexOf(me)<0)continue;
          if(openLeave&&m.leaveReqId===openLeave)continue;
          toastIncomingChat(m);
          break;
        }
        if(m.type!=="dm")continue;
        if(isLeaveRelatedDm(m)){
          if(openLeave&&m.leaveReqId===openLeave)continue;
          if(m.toUid&&m.toUid!==me&&m.uid!==me)continue;
          toastIncomingChat(m);
          break;
        }
        if(m.toUid&&m.toUid!==me)continue;
        if(openTid&&m.threadId===openTid)continue;
        toastIncomingChat(m);
        break;
      }
    }
    S._chatSig=sig;S.chat=msgs;
    updateRemindBadge();
    if(S.tab==="chat"){render();setTimeout(initChatScroll,30);setTimeout(markOpenChatRead,60);}
    else if(S.tab==="leave"){render();if(S.leaveBoardId)setTimeout(function(){initLeaveBoardScroll();markOpenLeaveBoardRead();},30);}
  },
  syncAppBadge:function(){updateRemindBadge();},
  setLeaveReqs:function(rows,opts){
    rows=Array.isArray(rows)?rows:[];
    opts=opts||{};
    if(opts.liveOrg){
      var scope=opts.liveOrg,map={},id;
      (S.leaveReqs||[]).forEach(function(x){
        if(!x||!x.id)return;
        if((x._orgId||"")===scope)return;
        map[(x._orgId||"")+":"+x.id]=x;
      });
      rows.forEach(function(x){
        if(!x||!x.id)return;
        map[(x._orgId||scope)+":"+x.id]=Object.assign({},x,{_orgId:x._orgId||scope});
      });
      rows=[];
      for(id in map){if(Object.prototype.hasOwnProperty.call(map,id))rows.push(map[id]);}
    }
    S.leaveReqs=rows;
    if(S.tab==="leave"||S.tab==="chat"||S.tab==="dash"||S.leaveReject)render();
    else updateRemindBadge();
  },
  setReports:function(reports,opts){
    reports=reports||[];
    opts=opts||{};
    var map={},id;
    function rKey(x){return (x._orgId||"")+":"+(x.id||"");}
    if(opts.merge){
      (S.reports||[]).forEach(function(x){if(x&&x.id)map[rKey(x)]=x;});
      reports.forEach(function(x){if(x&&x.id)map[rKey(x)]=x;});
      reports=[];
      for(id in map){if(Object.prototype.hasOwnProperty.call(map,id))reports.push(map[id]);}
    }else if(opts.liveSince){
      var scope=opts.orgId||"";
      (S.reports||[]).forEach(function(x){
        if(!x||!x.id)return;
        if(x.date&&x.date<opts.liveSince){map[rKey(x)]=x;return;}
        // Giữ báo cáo đội kia khi snapshot chỉ cập nhật 1 org
        if(scope&&x._orgId&&x._orgId!==scope){map[rKey(x)]=x;return;}
      });
      reports.forEach(function(x){if(x&&x.id)map[rKey(x)]=x;});
      reports=[];
      for(id in map){if(Object.prototype.hasOwnProperty.call(map,id))reports.push(map[id]);}
    }
    var sig=reports.map(function(r){return rKey(r)}).join(",");
    if(sig===S._reportsSig){S.reports=reports;return;}
    S._reportsSig=sig;S.reports=reports;
    if(S.tab==="report"||S.tab==="prog"||S.tab==="mywork"||S.tab==="chamcong"||(S.tab==="proj"&&S.selProjDet))render();
  },
  mergeReports:function(rows){this.setReports(rows,{merge:true});},
  setAttendance:function(rows,opts){
    rows=rows||[];
    opts=opts||{};
    var map={},id;
    if(opts.merge){
      (S.attendance||[]).forEach(function(x){if(x&&x.id)map[x.id]=x;});
      rows.forEach(function(x){if(x&&x.id)map[x.id]=x;});
      rows=[];
      for(id in map){if(Object.prototype.hasOwnProperty.call(map,id))rows.push(map[id]);}
    }else if(opts.liveSince){
      (S.attendance||[]).forEach(function(x){
        if(x&&x.id&&x.date&&x.date<opts.liveSince)map[x.id]=x;
      });
      rows.forEach(function(x){if(x&&x.id)map[x.id]=x;});
      rows=[];
      for(id in map){if(Object.prototype.hasOwnProperty.call(map,id))rows.push(map[id]);}
    }
    var sig=rows.map(function(r){return r.id||""}).join(",");
    if(sig===S._attSig){S.attendance=rows;return;}
    S._attSig=sig;S.attendance=rows;
    if(S.tab==="chamcong"||S.tab==="kpi"||S.tab==="emp"||S.selEmp)render();
  },
  mergeAttendance:function(rows){this.setAttendance(rows,{merge:true});},
  onArrivalPush:function(payload){
    var body=(payload.data&&payload.data.body)||"Xác nhận đã đến vị trí mới";
    var rid=(payload.data&&payload.data.reminderId)||"";
    var asgnId=(payload.data&&payload.data.asgnId)||"";
    var me=S.auth&&S.auth.empId||"";
    var existing=(S.reminders||[]).find(function(x){
      if(!x||x.kind!=="arrival")return false;
      if(rid&&x.id===rid)return true;
      return !!(asgnId&&x.asgnId===asgnId&&String(x.empId||"")===String(me));
    });
    var r=existing
      ?Object.assign({},existing,{fired:true,seen:false,done:false,text:body||existing.text})
      :{id:rid||uid(),kind:"arrival",empId:me,asgnId:asgnId,at:(existing&&existing.at)||new Date().toISOString(),text:body,fired:true,seen:false,done:false};
    if(!remindToastRelevant(r)||remindToastIsDup(r)){updateRemindBadge();return;}
    unlockAppAudio();
    playBellSound();
    showRemindToast([r]);
    updateRemindBadge();
    if(S.tab==="mywork"||S.tab==="chamcong")render();
  },
  playWorkAlert:function(){
    unlockAppAudio();
    playBellSound();
  },
  onReminderPush:function(payload){
    var body=(payload.notification&&payload.notification.body)||(payload.data&&payload.data.body)||"Đã đến giờ nhắc";
    var rid=(payload.data&&payload.data.reminderId)||"";
    var existing=rid?(S.reminders||[]).find(function(x){return x&&x.id===rid}):null;
    var r=existing
      ?Object.assign({},existing,{fired:true,seen:false,text:body||existing.text})
      :{id:rid||uid(),at:new Date().toISOString(),text:body,fired:true,seen:false};
    if(!remindToastRelevant(r)||remindToastIsDup(r)){updateRemindBadge();return;}
    unlockAppAudio();
    playBellSound();
    showRemindToast([r]);
    updateRemindBadge();
    if(S.tab==="lich")render();
  },
  finishBoot:function(){
    try{
      var params=new URLSearchParams(location.search);
      var q=params.get("tab");
      var dm=params.get("dm");
      if(dm)S.pendingChatDm=String(dm);
      if(q==="help")q="";
      if(q==="lich"&&hasFullUI())S.tab="lich";
      else if(q&&tabAllowed(q))S.tab=q;
      if(S.tab==="chat")tryApplyChatDeepLink();
    }catch(e){}
    if(S.tab==="help")S.tab=isEmpPortal()?"mywork":"dash";
    // Cloud: paint từ cache local ngay; purge/trash sau frame đầu.
    render();
    if(S.tab==="chat"&&S.chatTo)setTimeout(markOpenChatRead,80);
    setTimeout(function(){try{purgeExpiredTrash();}catch(eP){}},0);
  }
};
// Offline hoặc lần đầu: paint sớm. Cloud sẽ finishBoot lại từ bootOffline; online dựa vào cache + auth.
if(!window.__CV3_SKIP_SEED)window.__CV3.finishBoot();
else{
  // Hiện UI từ localStorage ngay, không chờ Firebase module parse xong.
  try{window.__CV3.finishBoot();}catch(eBoot){}
}
if("serviceWorker" in navigator){
  navigator.serviceWorker.addEventListener("message",function(ev){
    var p=ev&&ev.data;
    if(!p||p.type!=="cv3-open-chat")return;
    if(p.dm)S.pendingChatDm=String(p.dm);
    else if(p.chatType==="broadcast")S.pendingChatDm="broadcast";
    if(typeof A!=="undefined"&&A.go)A.go("chat");
    else{S.tab="chat";applyPendingChatDm();render();}
  });
}
document.addEventListener("keydown",function(ev){
  if(ev.key!=="Escape"&&ev.key!=="Esc")return;
  if(S.helpOpen){A.closeHelp();ev.preventDefault();return;}
});
setTimeout(function(){try{checkAppUpdate();}catch(e){}},1800);
setTimeout(function(){try{checkAutoBackup();}catch(e){}},2500);
if(isLocalDev()&&!document.getElementById("dev-local-bar")){
  var devBar=document.createElement("div");
  devBar.id="dev-local-bar";
  devBar.style.cssText="position:fixed;top:0;left:0;right:0;z-index:10000;padding:5px 10px;background:#6d28d9;color:#fff;font-size:11px;text-align:center;line-height:1.4";
  devBar.textContent="DEV local — mở bằng npm run dev · http://localhost:5173 · Push/chấm công đầy đủ: dùng bản deploy HTTPS";
  document.body.appendChild(devBar);
}
document.addEventListener("click",unlockAppAudio,{once:true,capture:true});
document.addEventListener("touchstart",unlockAppAudio,{once:true,capture:true});
initScreenNavSwipe();
setInterval(updateDateTime,1000);
})();
