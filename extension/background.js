importScripts('cheque-store.js','card-history.js','yahav.js');
// התקנה או עדכון מבטלים תהליך חלקי ומנקים בורר זמני ישן. במהלך זיהוי פעיל
// הרשימה נשמרת; היא אינה אמורה לחזור לאחר רענון או בזמן חיבור לבנק אחר.
// ⚠ 18.08.2026 — `pendingSources` נוסף לאיפוס. discover מסירה ממנו בנק **רק בהצלחה**
// (§ההערה בשורה ~228), ולכן סנכרון שנקטע השאיר אותו תקוע לצמיתות — וגם הפעלה מחדש
// של הדפדפן לא ניקתה אותו. במצב הזה handleAuthenticatedNavigation נכנס למסלול
// queueDiscover, **שאינו בודק את autoSyncOnLogin ואף צינון**, וכל כניסה לפועלים נחטפה.
const freshStart={pendingIsracard:false,pendingIsracardAt:0,pendingLeumi:false,pendingDiscountBusiness:false,pendingDiscountPrivate:false,pendingMizrahi:false,pendingYahav:false,leumiAttempts:0,leumiOptionProbe:null,discoveredAccounts:[],pendingSources:[]};
// ⚠ 18.08.2026, החלטת טל: הסנכרון האוטומטי **כבוי בברירת מחדל**, ונדלק רק בלחיצה.
// הכניסה לבנק שייכת למשתמש; התוסף אינו לוקח לשונית שהוא לא פתח בלי בקשה מפורשת.
// המעבר מוחל פעם אחת גם על התקנות קיימות — בלעדיו הערך `true` שכבר שמור גובר.
async function applyAutoSyncDefaultOff(){
  const st=await chrome.storage.local.get({autoSyncDefaultOffApplied:false});
  if(st.autoSyncDefaultOffApplied)return;
  await chrome.storage.local.set({autoSyncOnLogin:false,autoSyncDefaultOffApplied:true});
}
chrome.runtime.onInstalled.addListener(details=>{const patch={...freshStart};if(details?.reason==='install')patch.autoSyncOnLogin=false;chrome.storage.local.set(patch).then(applyAutoSyncDefaultOff).then(scanAuthenticatedTabs)});
chrome.runtime.onStartup.addListener(()=>{chrome.storage.local.set(freshStart).then(scanAuthenticatedTabs)});

// ── חיווי מצב על סמל התוסף ────────────────────────────────────────────────
// מאזין ל-syncStatus במקום להוסיף קריאה בכל מסלול — כך כל תהליך מקבל חיווי,
// גם כאלה שנכתבו בסשן אחר ושאיני מכיר.
let badgeClearTimer=null;
function badgeFor(text){
  const t=String(text||'');
  if(!t)return null;
  if(/נכשל|שגיאה|לא נטענ|לא זוה|לא נקרא/.test(t))return{txt:'!',color:'#b42318',keep:true};
  if(/הסתיים|נשמרו|נטענו|אומת/.test(t))return{txt:'✓',color:'#087f5b',keep:false};
  if(/סנכרון|קורא|מזהה|זוהתה|בודק|מעדכן|מחבר|טוען|ממתין|היסטוריה|בתהליך/.test(t))return{txt:'…',color:'#2450bd',keep:true};
  return null;
}
async function paintBadge(text){
  const b=badgeFor(text);
  try{
    await chrome.action.setTitle({title:text?`בנקים — ${String(text).slice(0,180)}`:'בנקים'});
    if(!b){await chrome.action.setBadgeText({text:''});return}
    await chrome.action.setBadgeBackgroundColor({color:b.color});
    await chrome.action.setBadgeText({text:b.txt});
    if(badgeClearTimer)clearTimeout(badgeClearTimer);
    // הצלחה נמחקת מעצמה; כישלון ותהליך רץ נשארים עד השינוי הבא
    if(!b.keep)badgeClearTimer=setTimeout(()=>chrome.action.setBadgeText({text:''}),90000);
  }catch(e){}
}
chrome.storage.onChanged.addListener((changes,area)=>{
  if(area!=='local'||!changes.syncStatus)return;
  paintBadge(changes.syncStatus.newValue);
});
chrome.storage.local.get({syncStatus:''}).then(x=>paintBadge(x.syncStatus));
const SOURCES={
  business:{label:'פועלים עסקי',host:'biz2.bankhapoalim.co.il',root:'https://biz2.bankhapoalim.co.il/ng-portals/biz/he',login:'https://biz2.bankhapoalim.co.il/ng-portals/auth/he/biz-login/authenticate',portal:'/ng-portals/biz/'},
  private:{label:'פועלים פרטי',host:'login.bankhapoalim.co.il',root:'https://login.bankhapoalim.co.il/ng-portals/rb/he',login:'https://login.bankhapoalim.co.il/ng-portals/auth/he/',portal:'/ng-portals/rb/'}
};
let running=false,discoveryChain=Promise.resolve();
const mizrahiFrameData=new Map();
// ברגע שההתחברות הושלמה — המיקוד חוזר לדשבורד והסנכרון ממשיך ברקע.
//
// ⚠ שינוי החלטה, 17.08.2026, בקשת טל: „הדף של פועלים — תחזיר אותו לדפדפן הראשי,
// אבל תמיד שהתוסף יהיה בחזית." לכן הלשונית **חוזרת לחלון של הדשבורד** ואינה מופעלת.
// זו נסיגה מודעת מ-0.60.0: לשונית לא-פעילה היא לשונית מוסתרת, ו-Chrome משהה בה rAF
// ומאט טיימרים. אתר בנק שמרנדר טבלה ב-rAF עלול לא לצייר אותה.
// **הסימן אם זה מתממש: סנכרון שנתקע או מחזיר טבלה ריקה, בלי שרואים דפדוף.**
// אם יקרה — לחזור ל-windows.create({tabId,focused:false}) שהיה כאן.
const returnedToDashboard=new Set();
chrome.tabs.onRemoved.addListener(id=>{returnedToDashboard.delete(id);detachedForSync.delete(id)});
// לשוניות שהוצאו לחלון עבודה נפרד, ויחזרו לחלון הראשי כשהסנכרון ייגמר.
const detachedForSync=new Set();
async function restoreSyncTabs(){
  if(!detachedForSync.size)return;
  let dash=null;try{[dash]=await chrome.tabs.query({url:chrome.runtime.getURL('dashboard.html')+'*'})}catch{}
  for(const id of [...detachedForSync]){
    detachedForSync.delete(id);
    if(!dash)continue;
    try{const t=await chrome.tabs.get(id);if(t.windowId!==dash.windowId)await chrome.tabs.move(id,{windowId:dash.windowId,index:-1})}catch{}
  }
  if(dash)try{await chrome.tabs.update(dash.id,{active:true});await chrome.windows.update(dash.windowId,{focused:true})}catch{}
}
// force=true בכניסות סנכרון מפורשות. הודעת התחברות אינה נורית כשהלשונית כבר מחוברת
// (פועלים שולח AUTHENTICATED רק כשה-pathname משתנה), ולכן שם חייבים לכפות.
async function returnToDashboard(tabId,force=false){
  if(returnedToDashboard.has(tabId)&&!force)return;   // פעם אחת ללשונית — LEUMI_AUTHENTICATED נורה בכל ניווט
  returnedToDashboard.add(tabId);
  const findDash=async()=>{try{const [d]=await chrome.tabs.query({url:chrome.runtime.getURL('dashboard.html')+'*'});return d||null}catch{return null}};
  let dash=await findDash();
  if(!dash){try{await chrome.runtime.openOptionsPage()}catch{}await delay(500);dash=await findDash()}
  if(!dash)return;
  // ⚠ נמדד 17.08.2026: לשונית לא-פעילה היא לשונית מוסתרת, ו-Chrome משהה בה rAF.
  // פועלים פרטי החזיר יתרה ריקה ואז נתקע בהלוואות — הדפים פשוט לא צוירו.
  // לכן בזמן סנכרון הלשונית יושבת בחלון משלה שאינו במוקד: שם היא הפעילה בחלונה
  // ונשארת visible. בסיום `restoreSyncTabs` מחזירה אותה לחלון הראשי, כבקשת טל.
  try{
    const tab=await chrome.tabs.get(tabId),win=await chrome.windows.get(tab.windowId,{populate:true});
    // ⚠ חלון העבודה יורש את מידות החלון המקורי. בלי זה Chrome פותח חלון בגודל
    // ברירת מחדל, צר מהחלון של המשתמש — ואתרי בנק משנים פריסה לפי רוחב.
    // ב-17.08.2026 זה הפיל את יהב: בורר התאריכים לא רונדר בפריסה הצרה,
    // ו-setThreeMonths החזירה false. **גודל החלון הוא חלק מהסביבה שהמתאמים נמדדו מולה.**
    // ⚠ המידות נלקחות מחלון **הדשבורד**, לא מחלון המקור. אם ההתחברות נעשתה
    // בחלונית קטנה, חלון המקור קטן — וירושה ממנו הייתה משחזרת בדיוק את התקלה.
    const dashWin=await chrome.windows.get(dash.windowId).catch(()=>null),src=dashWin||win;
    const box={};
    for(const k of ['left','top','width','height'])if(Number.isFinite(src[k]))box[k]=src[k];
    // ⚠ 18.08.2026: חלון עבודה בגודל ובמיקום **זהים** לדשבורד מכוסה לחלוטין, ו-Chrome
    // מסמן חלון מכוסה כנסתר ומשהה בו rAF — הסיכון שנרשם ב-0.62.0. ישראכרט נפל בדיוק
    // כך: רשימת הכרטיסים רונדרה לפני שהחלון ירד לרקע, ואחרי הניווט מחדש לא רונדרה שוב.
    // היסט קטן משאיר שוליים גלויים בכל צד, בלי לשנות את הפריסה (1720 -> 1664).
    if(Number.isFinite(box.left))box.left+=28;
    if(Number.isFinite(box.top))box.top+=28;
    if(Number.isFinite(box.width))box.width=Math.max(1100,box.width-56);
    if(Number.isFinite(box.height))box.height=Math.max(700,box.height-56);
    if((win.tabs||[]).length>1){await chrome.windows.create({tabId,focused:false,...box});detachedForSync.add(tabId)}
    // לשונית שכבר לבדה בחלון — לא מעבירים, אבל כן מוודאים שהחלון בגודל שולחני.
    else if(Object.keys(box).length)await chrome.windows.update(tab.windowId,box).catch(()=>{});
  }catch{}
  // הדשבורד קדימה. לשונית הבנק **אינה** מופעלת — זה מה שמשאיר את התוסף בחזית.
  try{await chrome.tabs.update(dash.id,{active:true});await chrome.windows.update(dash.windowId,{focused:true})}catch{}
}

// התקדמות הסנכרון: שלב מתוך סך, וזמן ההתחלה — הדשבורד גוזר מהם אחוז והערכת זמן.
let progressState=null;
async function beginProgress(total){progressState={done:0,total,startedAt:Date.now()};await chrome.storage.local.set({syncProgress:progressState})}
// action = הטקסט הקצר שנכתב בתוך הגלגל. נפרד מהסטטוס המלא, שנשאר ארוך ומפורט.
async function syncStep(status,action=''){if(progressState)progressState={...progressState,done:Math.min(progressState.done+1,progressState.total),action};await chrome.storage.local.set({syncStatus:status,syncProgress:progressState})}
async function endProgress(){progressState=null;await chrome.storage.local.set({syncProgress:null})}
// מחיקת כרטיס = היסטוריה **וגם** הכרטיס עצמו. נוסף 18.08.2026 אחרי דיווח:
// „במחק כרטיס החיוב הקרוב נשאר" — כי נמחקה רק ההיסטוריה, בעוד החיוב הקרוב
// מוצג מתוך accounts[].cards. מחיקה חלקית גרועה ממחיקה שלא קרתה: היא נראית
// כאילו עבדה.
async function deleteCardEverywhere(suffix){
  const key=String(suffix||'').replace(/\D/g,'');
  if(!key)return{ok:false,error:'לא צוין מספר כרטיס'};
  const removed=await cardHistDeleteCard(suffix);
  const st=await chrome.storage.local.get({accounts:[],isracardUnassigned:[],calUnassigned:[],maxUnassigned:[],isracardAssignments:{},isracardActiveSince:{},hiddenCards:[]});
  const digits=c=>String((c&&c.suffix)||c||'').replace(/\D/g,'');
  const hit=c=>{const d=digits(c);return d&&(d.endsWith(key)||key.endsWith(d))};
  let cards=0;
  const accounts=st.accounts.map(a=>{const keep=(a.cards||[]).filter(c=>!hit(c));cards+=(a.cards||[]).length-keep.length;return{...a,cards:keep}});
  const strip=list=>(list||[]).filter(c=>!hit(c));
  const assignments={...st.isracardAssignments},activeSince={...st.isracardActiveSince};
  for(const k of Object.keys(assignments))if(hit(k))delete assignments[k];
  for(const k of Object.keys(activeSince))if(hit(k))delete activeSince[k];
  // ⚠ מחיקה מקומית אינה מוחקת את הכרטיס אצל חברת האשראי: הסנכרון הבא מחזיר אותו,
  // והמשתמש רואה כרטיס שמחק „חוזר מהמתים". לכן הסיומת נשמרת ברשימת הסתרה קבועה,
  // והתצוגה מסננת לפיה — גם אחרי סנכרונים הבאים. ניתן להחזרה מהדשבורד.
  const hiddenCards=[...new Set([...(st.hiddenCards||[]).map(x=>String(x).replace(/\D/g,'')),key])].filter(Boolean);
  await chrome.storage.local.set({accounts,isracardUnassigned:strip(st.isracardUnassigned),
    calUnassigned:strip(st.calUnassigned),maxUnassigned:strip(st.maxUnassigned),
    isracardAssignments:assignments,isracardActiveSince:activeSince,hiddenCards});
  return{ok:true,removed,cards};
}
chrome.runtime.onMessage.addListener((m,sender,reply)=>{
  if(/^[A-Z_]*AUTHENTICATED$/.test(m?.type||'')&&sender.tab?.id)returnToDashboard(sender.tab.id);
  if(m?.type==='START_AUTO_SYNC'){start(m.scope||'business',Boolean(m.force)).then(reply).catch(e=>reply({ok:false,error:e.message}));return true}
  if(m?.type==='AUTHENTICATED'&&sender.tab?.id){const source=sourceFromUrl(sender.tab.url);if(source){queueDiscover(sender.tab.id,source);chrome.storage.local.get({pendingSources:[]}).then(x=>{if(!x.pendingSources.includes(source))maybeAutoSync(source,SOURCES[source].label,sender.tab.id).catch(()=>{})})}reply({ok:true});return}
  if(m?.type==='SYNC_SELECTED'){syncSelected(m.keys||[]).then(reply).catch(e=>reply({ok:false,error:e.message}));return true}
  if(m?.type==='OPEN_EXTERNAL_BANK'){chrome.tabs.create({url:m.url,active:true}).then(()=>reply({ok:true}));return true}
  if(m?.type==='START_FIBI'){startFibi(m.slot).then(reply).catch(e=>reply({ok:false,error:e.message}));return true}
  if(m?.type==='FIBI_OPEN_SCHEDULE'&&sender.tab?.id){openFibiSchedule(sender.tab.id,m.args||[]).then(reply).catch(e=>reply({ok:false,error:e.message}));return true}
  if(m?.type==='FIBI_CLOSE_SCHEDULE'&&sender.tab?.id){closeFibiSchedule(sender.tab.id).then(reply).catch(e=>reply({ok:false,error:e.message}));return true}
  if(m?.type==='FIBI_AUTHENTICATED'&&sender.tab?.id){const t=sender.tab.id;chrome.storage.local.get({pendingFibiSlot:''}).then(x=>{if(x.pendingFibiSlot)syncFibi(t).catch(()=>{});else maybeAutoRun('fibi','הבינלאומי',async id=>{const acc=(await chrome.storage.local.get({accounts:[]})).accounts.find(a=>String(a.source).startsWith('fibi-'));if(acc){await chrome.storage.local.set({pendingFibiSlot:acc.source});await syncFibi(id)}},t).catch(()=>{})});reply({ok:true});return}
  if(m?.type==='START_LEUMI'){startLeumi().then(reply).catch(e=>reply({ok:false,error:e.message}));return true}
  if(m?.type==='START_DISCOUNT_BUSINESS'){startDiscountBusiness().then(reply).catch(e=>reply({ok:false,error:e.message}));return true}
  if(m?.type==='START_DISCOUNT_PRIVATE'){startDiscountPrivate().then(reply).catch(e=>reply({ok:false,error:e.message}));return true}
  if(m?.type==='START_MIZRAHI'){startMizrahi().then(reply).catch(e=>reply({ok:false,error:e.message}));return true}
  if(m?.type==='START_YAHAV'){startYahav().then(reply).catch(e=>reply({ok:false,error:e.message}));return true}
  if(m?.type==='START_ISRACARD'){startIsracard().then(reply).catch(e=>reply({ok:false,error:e.message}));return true}
  if(m?.type==='START_CAL'){startCal(m.suffix).then(reply).catch(e=>reply({ok:false,error:e.message}));return true}
  if(m?.type==='START_MAX'){startMax(m.suffix).then(reply).catch(e=>reply({ok:false,error:e.message}));return true}
  if(m?.type==='YAHAV_AUTHENTICATED'&&sender.tab?.id){const t=sender.tab.id;chrome.storage.local.get({pendingYahav:false}).then(x=>{if(x.pendingYahav)runYahav(t).catch(()=>{});else maybeAutoRun('yahav','יהב',runYahav,t).catch(()=>{})});reply({ok:true});return}
  if(m?.type==='MIZRAHI_AUTHENTICATED'&&sender.tab?.id){const t=sender.tab.id;chrome.storage.local.get({pendingMizrahi:false}).then(x=>{if(x.pendingMizrahi)runMizrahi(t).catch(()=>{});else maybeAutoRun('mizrahi','מזרחי־טפחות',runMizrahi,t).catch(()=>{})});reply({ok:true});return}
  if(m?.type==='MIZRAHI_FRAME_REPORT'&&sender.tab?.id){const old=mizrahiFrameData.get(sender.tab.id)||{transactions:[],loans:[]};mizrahiFrameData.set(sender.tab.id,{transactions:Array.isArray(m.transactions)&&m.transactions.length?m.transactions:old.transactions,loans:Array.isArray(m.loans)&&m.loans.length?m.loans:old.loans});reply({ok:true});return}
  if(m?.type==='DISCOUNT_AUTHENTICATED'&&sender.tab?.id){const privateSite=String(sender.tab.url||'').includes('/retail3/'),source=privateSite?'discount-private':'discount-business',label=privateSite?'דיסקונט פרטי':'דיסקונט עסקי';chrome.storage.local.get({pendingDiscountBusiness:false,pendingDiscountPrivate:false}).then(x=>{if(privateSite?!x.pendingDiscountPrivate:!x.pendingDiscountBusiness)maybeAutoSync(source,label,sender.tab.id).catch(()=>{})});handleDiscountAuthenticated(sender.tab.id).catch(()=>{});reply({ok:true});return}
  if(m?.type==='LEUMI_CHEQUE_PROGRESS'){chequeCtx.done++;const at=chequeCtx.base+chequeCtx.done,tot=chequeCtx.total||m.total;chrome.storage.local.set({syncStatus:`לאומי: שומר צילומי שיקים ${at}/${tot}`+(chequeCtx.base?` · ${chequeCtx.base} כבר היו שמורים`:'')+(chequeCtx.noRef?` · ${chequeCtx.noRef} ללא אסמכתא`:'')});reply({ok:true});return}
if(m?.type==='LEUMI_AUTHENTICATED'&&sender.tab?.id){chrome.storage.local.get({pendingLeumi:false}).then(x=>{if(!x.pendingLeumi)maybeAutoSync('leumi','לאומי',sender.tab.id).catch(()=>{})});discoverLeumi(sender.tab.id).catch(async e=>{
// ⚠ תקלת חיבור היא רגעית. כיבוי pendingLeumi כאן גרם לכך שכל אירוע התחברות נוסף
// מהדף נבלע בשקט, והתוסף נראה כאילו הוא לא עושה כלום עד לחיצה חוזרת על סנכרון.
const transient=/Receiving end does not exist|message port closed|No tab with id|Frame with ID/i.test(e.message||'');
await chrome.storage.local.set({pendingLeumi:transient,syncStatus:`שגיאה בלאומי: ${e.message}${transient?' — נשאר דרוך, רענן את לשונית לאומי והוא ימשיך מעצמו':''}`});await chrome.runtime.openOptionsPage()});reply({ok:true});return}
  if(m?.type==='OPEN_LEUMI_CHEQUE'){openLeumiCheque(m).then(reply).catch(e=>reply({ok:false,error:e.message}));return true}
  if(m?.type==='DISCOUNT_PROGRESS'){chrome.storage.local.set({syncStatus:String(m.text||'')});reply({ok:true});return}
  if(m?.type==='PROBE_ACTIVE_TAB'){probeActiveTab().then(reply).catch(e=>reply({ok:false,error:e.message}));return true}
  if(m?.type==='ISRACARD_AUTHENTICATED'&&sender.tab?.id){isracardOnAuth(sender.tab.id,async id=>{// ⚠ runIsracard קורא את רשימת הכרטיסים מדף הסטטוס. startIsracard מנווט לשם קודם,
// והמסלול האוטומטי דילג על כך — ולכן הרשימה 'לא נטענה' כשהמשתמש היה בדף כרטיס בודד.
// ⚠ 18.08.2026 — הניווט הזה הוא שהפיל את הסנכרון האוטומטי. ISRACARD_AUTHENTICATED
// נשלח **רק** מדף שכבר מציג את רשימת הכרטיסים (isracard-content.js דורש
// „נותר לניצול|מסגרת" ופוסל /transactions), ולכן הרענון זרק דף מוכן ונתן לו
// 1800ms + 9 שניות לעלות מחדש — פחות מטעינה קרה של האתר. נמדד באחסון: כניסה
// 10:38:39 · קריאת רשימה 10:38:41 · כשל 10:38:50.
// קוראים קודם מהדף הטעון; הניווט נשאר כמסלול גיבוי, עם תקציב המתנה גדול יותר.
try{return await runIsracard(id,8)}catch{}
await chrome.tabs.update(id,{url:ISRACARD_HOME});await delay(1800);return runIsracard(id,40)}).catch(()=>{});reply({ok:true});return}
  if(m?.type==='CAL_AUTHENTICATED'&&sender.tab?.id){const t=sender.tab.id;chrome.storage.local.get({pendingCal:false,pendingCalSuffix:''}).then(x=>{if(x.pendingCal)runCal(t,x.pendingCalSuffix).catch(()=>{});else maybeAutoRun('cal','כאל',runCal,t).catch(()=>{})});reply({ok:true});return}
  if(m?.type==='MAX_AUTHENTICATED'&&sender.tab?.id){const t=sender.tab.id;chrome.storage.local.get({pendingMax:false,pendingMaxSuffix:''}).then(x=>{if(x.pendingMax)runMax(t,x.pendingMaxSuffix).catch(()=>{});else maybeAutoRun('max','MAX',runMax,t).catch(()=>{})});reply({ok:true});return}
  if(m?.type==='LOAD_CARD_MONTH'){loadIsracardMonth(String(m.month||'')).then(reply).catch(e=>reply({ok:false,error:e.message}));return true}
  if(m?.type==='LOAD_CARD_YEAR'){const suffixes=Array.isArray(m.suffixes)?m.suffixes:[];loadIsracardYear(Number(m.months)||12,suffixes).then(reply).catch(async e=>{const card=suffixes.length?` לכרטיס ${suffixes.join(', ')}`:'';await chrome.storage.local.set({syncStatus:`ישראכרט${card}: הסנכרון לא התחיל — ${e.message}`});reply({ok:false,error:e.message})});return true}
  if(m?.type==='CARD_MONTHS'){cardHistMonths().then(months=>reply({ok:true,months})).catch(e=>reply({ok:false,error:e.message}));return true}
  if(m?.type==='CARD_HISTORY_DELETE_CARD'){deleteCardEverywhere(m.suffix).then(reply).catch(e=>reply({ok:false,error:e.message}));return true}
  if(m?.type==='CARD_HISTORY_STATS'){cardHistStats().then(stats=>reply({ok:true,stats})).catch(e=>reply({ok:false,error:e.message}));return true}
  if(m?.type==='CARD_MONTH_DATA'){cardHistGetMonth(String(m.month||'')).then(rows=>reply({ok:true,rows})).catch(e=>reply({ok:false,error:e.message}));return true}
  if(m?.type==='OPEN_DASHBOARD'){chrome.runtime.openOptionsPage();reply({ok:true});return}
});
async function handleAuthenticatedNavigation(d){if(d.frameId!==0)return;const source=sourceFromUrl(d.url);if(!source||!d.url.includes(SOURCES[source].portal))return;const s=await chrome.storage.local.get({pendingSources:[]});if(s.pendingSources.includes(source))queueDiscover(d.tabId,source);else{await chrome.storage.local.set({syncStatus:`זוהתה כניסה ל${SOURCES[source].label} — בודק עדכונים אוטומטיים`});maybeAutoSync(source,SOURCES[source].label,d.tabId).catch(()=>{})}}
chrome.webNavigation.onCompleted.addListener(handleAuthenticatedNavigation);
chrome.webNavigation.onHistoryStateUpdated.addListener(handleAuthenticatedNavigation);
// webNavigation אינו תמיד נורה כשנכנסים שוב ללשונית בנק שכבר הייתה פתוחה.
// לכן גם עצם המעבר ללשונית קיימת ושינוי הכתובת שלה מפעילים את אותה בדיקה.
// acceptAutoLogin משאיר הגנת debounce, כך שכמה אירועים של אותה כניסה לא
// יוצרים כמה סנכרונים במקביל.
chrome.tabs.onActivated.addListener(async info=>{
  try{
    const tab=await chrome.tabs.get(info.tabId);
    if(tab?.url)await handleAuthenticatedNavigation({frameId:0,tabId:info.tabId,url:tab.url});
  }catch(e){}
});
chrome.tabs.onUpdated.addListener((tabId,changeInfo,tab)=>{
  if((changeInfo.status==='complete'||changeInfo.url)&&tab?.url)
    handleAuthenticatedNavigation({frameId:0,tabId,url:tab.url}).catch(()=>{});
});
async function scanAuthenticatedTabs(){try{for(const source of Object.keys(SOURCES)){const cfg=SOURCES[source],tabs=await chrome.tabs.query({url:[`https://${cfg.host}/*`]});for(const tab of tabs)if(tab.id&&String(tab.url||'').includes(cfg.portal))handleAuthenticatedNavigation({frameId:0,tabId:tab.id,url:tab.url})}}catch(e){}}

function sourceFromUrl(url=''){if(url.includes(SOURCES.business.host))return'business';if(url.includes(SOURCES.private.host))return'private';return null}
function chosenSources(scope){return scope==='both'?['business','private']:[scope==='private'?'private':'business']}
async function start(scope,force=false){
  const requested=chosenSources(scope),saved=await chrome.storage.local.get({accounts:[]});const sources=force?requested:requested.filter(source=>!sourceFreshToday(source,saved.accounts));const skipped=requested.filter(source=>!sources.includes(source));
  if(!sources.length){await chrome.storage.local.set({syncScope:scope,pendingSources:[],discoveredAccounts:[],syncStatus:'כל החשבונות שנבחרו כבר סונכרנו היום'});await chrome.runtime.openOptionsPage();return{ok:true,status:'already_synced_today'}}
  await chrome.storage.local.set({syncScope:scope,pendingSources:sources,discoveredAccounts:[],syncStatus:skipped.length?`${skipped.map(s=>SOURCES[s].label).join(', ')} כבר עודכן היום; ממשיך לשאר החיבורים`:'מחפש חיבורים פעילים'});
  discoverTries.clear();   // סבב חדש שהמשתמש ביקש — התקרה נפתחת מחדש
  for(const source of sources)await openSource(source);
  return{ok:true,status:'waiting_login'};
}
async function openSource(source){
  const cfg=SOURCES[source],tabs=await chrome.tabs.query({url:[`https://${cfg.host}/*`]});const active=tabs.find(t=>t.url?.includes(cfg.portal));
  if(active){await returnToDashboard(active.id,true);queueDiscover(active.id,source);return}
  await chrome.storage.local.set({syncStatus:`ממתין להתחברות אל ${cfg.label}`});const tab=tabs[0];
  // ⚠ לשונית פועלים קיימת — מנווטים אותה במקום, ולא פותחים חלונית שנייה. אחרת
  // נוצרות שתי לשוניות על אותו מארח, ו-syncSource בוחר `tabs[0]` שעלול להיות הישנה.
  if(tab)await chrome.tabs.update(tab.id,{url:cfg.login,active:true});
  // אין לשונית — חלונית כניסה, כמו בשאר היעדים. אחרי ההתחברות `returnToDashboard`
  // מגדילה את החלון הזה למידות הדשבורד, ולכן הסנכרון אינו רץ בפריסה צרה (0.73.0).
  else await chrome.windows.create({url:cfg.login,type:'popup',width:560,height:780,focused:true});
}
// ⚠ שומר לולאה — אל תסיר (§9). discover מסירה את הבנק מ-pendingSources רק בהצלחה;
// בכישלון הוא נשאר, prepareRoute מנווטת, הניווט משנה pathname, reportAuthenticated
// יורה שוב וזה חוזר בלי סוף. עד 0.64.0 גם לא היה דיווח — catch ריק בלע את הסיבה.
const discoverTries=new Map();
chrome.tabs.onRemoved.addListener(id=>{for(const k of [...discoverTries.keys()])if(k.endsWith(`|${id}`))discoverTries.delete(k)});
function queueDiscover(tabId,source){
  const key=`${source}|${tabId}`,tries=discoverTries.get(key)||0;
  if(tries>=3)return discoveryChain;
  discoverTries.set(key,tries+1);
  discoveryChain=discoveryChain.then(()=>discover(tabId,source)).catch(async e=>{
    const label=SOURCES[source]?.label||source,attempt=tries+1;
    await chrome.storage.local.set({syncStatus:attempt>=3
      ?`זיהוי החשבונות ב${label} נכשל אחרי 3 ניסיונות ונעצר: ${e.message}`
      :`זיהוי החשבונות ב${label} נכשל (ניסיון ${attempt} מתוך 3): ${e.message}`});
  });
  return discoveryChain;
}
async function discover(tabId,source){
  const state=await chrome.storage.local.get({pendingSources:[]});if(!state.pendingSources.includes(source)||running)return;
  try{
    await prepareRoute(tabId,route(source,'current-account/transactions'),'/current-account/transactions');await chrome.storage.local.set({syncStatus:`מזהה חשבונות ב${SOURCES[source].label}`});
    const r=await chrome.tabs.sendMessage(tabId,{type:'DISCOVER_ACCOUNTS'});if(!r?.ok)throw Error(r?.error||'גילוי החשבונות נכשל');
    const latest=await chrome.storage.local.get({discoveredAccounts:[],pendingSources:[]});const others=latest.discoveredAccounts.filter(a=>a.source!==source);const found=r.accounts.map(a=>({...a,source,sourceLabel:SOURCES[source].label,key:`${source}|${a.key}`}));const pending=latest.pendingSources.filter(x=>x!==source);
    const combined=[...others,...found];await chrome.storage.local.set({discoveredAccounts:combined,pendingSources:pending,syncStatus:pending.length?`התחבר גם אל ${SOURCES[pending[0]].label}`:'בודק אם נדרשת בחירת חשבונות'});
    // אין סנכרון אוטומטי, גם לא כשנמצא חשבון יחיד. הבחירה היא של המשתמש, תמיד.
if(!pending.length){await chrome.storage.local.set({syncStatus:`נמצאו ${combined.length} חשבונות — בחר אילו לסנכרן ואשר`});await chrome.runtime.openOptionsPage()}
  }catch(e){await chrome.storage.local.set({syncStatus:`שגיאה ב${SOURCES[source].label}: ${e.message}`});await chrome.runtime.openOptionsPage()}
}

// ── סנכרון אוטומטי בזיהוי התחברות ─────────────────────────────────────────
// נדרש שהמשתמש כבר בחר פעם אחת אילו חשבונות לסנכרן: בחירה נשארת ידנית, האיסוף אוטומטי.
// כל התחברות חדשה מפעילה קריאה עדכנית. אין מגבלת שש שעות. נשארת רק הגנת
// debounce קצרה מפני כמה אירועי AUTHENTICATED שאותה טעינת SPA שולחת ברצף.
const AUTO_LOGIN_DEBOUNCE_MS=90*1000;
const AUTO_SYNC_MIN_GAP_MS=6*60*60*1000;
const gapText=ms=>{const m=Math.max(0,Math.round(ms/60000));return m<60?`${m} דק'`:`${Math.floor(m/60)} שע'${m%60?` ו-${m%60} דק'`:''}`};
// ⚠ הצלחה וכישלון אינם אותו דבר. ב-0.64.0 רשמתי כישלון לתוך autoSyncLast כדי לעצור
// לולאה, והתוצאה הייתה שהתוסף הודיע „סונכרן לאחרונה" בדיוק כששום דבר לא נשמר —
// וחסם ניסיון אוטומטי ל-6 שעות. כישלון מקבל צינון קצר משלו, ומחרוזת אחרת.
const AUTO_RETRY_AFTER_FAIL_MS=15*60*1000;
function autoRetryTooSoon(st,source){const last=Number(st.autoSyncFailed?.[source]||0);if(!last)return 0;const since=Date.now()-last;return since<AUTO_RETRY_AFTER_FAIL_MS?AUTO_RETRY_AFTER_FAIL_MS-since:0}
function autoSyncTooSoon(st,source){const last=Number(st.autoSyncLast?.[source]||0);if(!last)return 0;const since=Date.now()-last;return since<AUTO_SYNC_MIN_GAP_MS?AUTO_SYNC_MIN_GAP_MS-since:0}
const autoLoginRuns=new Map();
let autoBusy=false;
function acceptAutoLogin(source,tabId){const key=`${source}|${tabId||0}`,now=Date.now(),last=Number(autoLoginRuns.get(key)||0);if(now-last<AUTO_LOGIN_DEBOUNCE_MS)return false;autoLoginRuns.set(key,now);return true}
// ⚠ סנכרון אוטומטי לא מדבר בזמן שסנכרון אחר רץ. בלי זה הודעה על בנק א' נכתבת
// מעל הסטטוס של בנק ב' שבאמצע עבודה — וזה הסתיר מהמשתמש את סיבת הכישלון האמיתית.
async function maybeAutoSync(source,label,tabId){
  if(running)return false;
  const st=await chrome.storage.local.get({autoSyncOnLogin:false,selectedAccountKeys:[],accounts:[],autoSyncLast:{},autoSyncFailed:{}});
  if(autoRetryTooSoon(st,source))return false;   // ניסיון קודם נכשל — שקט, ההודעה שלו עדיין על המסך
  if(!st.autoSyncOnLogin){await chrome.storage.local.set({syncStatus:`זוהתה כניסה ל${label}, אך הסנכרון האוטומטי כבוי`});return false}const wait_=autoSyncTooSoon(st,source);if(wait_){if(AUTO_SYNC_MIN_GAP_MS-wait_<60000)return false;if(/שגיאה|נכשל/.test((await chrome.storage.local.get({syncStatus:''})).syncStatus||''))return false;await chrome.storage.local.set({syncStatus:`${label}: סונכרן לאחרונה לפני פחות מ-6 שעות — הבא בעוד ${gapText(wait_)}. לעדכון מיידי לחץ על הבנק בדשבורד`});return false}
  // גרסאות קודמות יכלו להשאיר חשבונות מסונכרנים בלי selectedAccountKeys.
  // במקרה כזה משחזרים את הבחירה רק מן החשבונות שכבר אושרו ונשמרו, בלי לבחור
  // חשבונות חדשים שהמשתמש מעולם לא ביקש לסנכרן.
  const selected=st.selectedAccountKeys.filter(k=>String(k).startsWith(source+'|'));
  const restored=st.accounts.filter(a=>(a.source||'business')===source).map(a=>
    a.selectionKey||`${source}|${a.branch}-${a.accountNumber}`
  ).filter(k=>!/[|](?:undefined|null)-/.test(String(k)));
  const keys=[...new Set(selected.length?selected:restored)];
  if(!keys.length){await chrome.storage.local.set({syncStatus:`זוהתה כניסה ל${label}, אך לא נשמרו חשבונות מאושרים לעדכון`});return false}
  if(!selected.length&&restored.length)await chrome.storage.local.set({selectedAccountKeys:[...new Set([...st.selectedAccountKeys,...restored])]});
  if(!acceptAutoLogin(source,tabId))return false;
  for(let wait=0;(running||autoBusy)&&wait<300;wait++)await delay(1000);
  if(running||autoBusy){await chrome.storage.local.set({syncStatus:`${label}: ההתחברות זוהתה, אך תור הסנכרון עדיין תפוס`});return false}
  autoBusy=true;
  try{
    // אירוע הכניסה מגיע לעיתים לפני שה-SPA של הבנק סיים לצייר את הבורר
    // והטבלאות. לא מסמנים הצלחה על עצם הזיהוי: מנסים עד שהקריאה והשמירה
    // השלמות מסתיימות, ורק אז מעדכנים את זמן הסנכרון.
    let lastError=null;
    for(let attempt=1;attempt<=3;attempt++){
      try{
        await chrome.storage.local.set({syncStatus:`${label}: סנכרון אוטומטי ${attempt}/3 — קורא ${keys.length} חשבונות`});
        if(attempt===1)await delay(2200);else await delay(3500);
        await syncSelected(keys);lastError=null;break;
      }catch(e){lastError=e;if(attempt<3)await chrome.storage.local.set({syncStatus:`${label}: הקריאה טרם הושלמה — מנסה שוב (${attempt+1}/3)`})}
    }
    if(lastError)throw lastError;
    await chrome.storage.local.set({autoSyncLast:{...st.autoSyncLast,[source]:Date.now()},autoSyncFailed:{...st.autoSyncFailed,[source]:0}});
    return true;
  // ⚠ שומר לולאה — אל תסיר (§9). כאן עמד releaseAutoLogin, שמחק את הדיבאונס של 90 השניות
  // בדיוק כשהסנכרון נכשל. autoSyncLast נכתב רק בהצלחה, ולכן לא נותר שום שומר: הניווטים
  // של הסנכרון עצמו יורים AUTHENTICATED, acceptAutoLogin עובר, וזה רץ שוב ונכשל שוב.
  // עכשיו הצינון נרשם גם בכישלון — ריצה אוטומטית אחת, ואז הכדור אצל המשתמש.
  }catch(e){await chrome.storage.local.set({autoSyncFailed:{...st.autoSyncFailed,[source]:Date.now()},syncStatus:`סנכרון אוטומטי ב${label} נכשל ולא נשמר עדכון: ${e.message} · לעדכון ידני לחץ על הבנק בדשבורד`});return false}
  finally{autoBusy=false}
}

// אותם שומרים, לבנקים שיש להם מסלול ריצה משלהם ואינם עוברים דרך syncSelected.
// התנאי המקביל ל"כבר בחרת": קיים חשבון שמור מאותו מקור — כלומר סנכרנת אותו בעבר.
// ⚠ 18.08.2026 — ישראכרט הוא היעד היחיד שלא היה לו דגל pending משלו, ולכן
// ISRACARD_AUTHENTICATED נכנס ישירות לשער הסנכרון האוטומטי. מרגע ש-0.87.0 כיבתה
// את autoSyncOnLogin בברירת מחדל, **גם סנכרון שהמשתמש ביקש נבלע שם ומעולם לא התחיל**
// — נמדד באחסון: „זוהתה כניסה לישראכרט, אך הסנכרון האוטומטי כבוי" באמצע לחיצה
// של טל. התקדים הנכון הוא pendingCal: דגל שהמשתמש הדליק גובר על השער.
// ⚠ הדגל פג אחרי PENDING_TTL_MS ונצרך פעם אחת — דגל ישן שנשאר דלוק הוא
// בדיוק המנגנון שחוטף כניסה מאוחרת שאינה קשורה לתוסף.
const PENDING_TTL_MS=15*60*1000;
async function isracardOnAuth(tabId,fn){
  const st=await chrome.storage.local.get({pendingIsracard:false,pendingIsracardAt:0});
  const fresh=st.pendingIsracard&&Date.now()-Number(st.pendingIsracardAt||0)<PENDING_TTL_MS;
  if(st.pendingIsracard)await chrome.storage.local.set({pendingIsracard:false,pendingIsracardAt:0});
  if(!fresh)return maybeAutoRun('isracard','ישראכרט',fn,tabId);
  try{return await fn(tabId)}
  catch(e){await chrome.storage.local.set({syncStatus:`שגיאה בישראכרט: ${e.message}`});await chrome.runtime.openOptionsPage();return false}
}
async function maybeAutoRun(source,label,fn,tabId){
  if(running)return false;
  const st=await chrome.storage.local.get({autoSyncOnLogin:false,accounts:[],autoSyncLast:{}});
  if(!st.autoSyncOnLogin){await chrome.storage.local.set({syncStatus:`זוהתה כניסה ל${label}, אך הסנכרון האוטומטי כבוי`});return false}const wait_=autoSyncTooSoon(st,source);if(wait_){if(AUTO_SYNC_MIN_GAP_MS-wait_<60000)return false;if(/שגיאה|נכשל/.test((await chrome.storage.local.get({syncStatus:''})).syncStatus||''))return false;await chrome.storage.local.set({syncStatus:`${label}: סונכרן לאחרונה לפני פחות מ-6 שעות — הבא בעוד ${gapText(wait_)}. לעדכון מיידי לחץ על הבנק בדשבורד`});return false}
  // ⚠ ישראכרט אינו יוצר שורת חשבון משלו — הכרטיסים נתלים על חשבונות הבנק. לכן
  // "כבר סונכרן פעם" נמדד אצלו לפי קיום כרטיס שהמנפיק שלו ישראכרט, ולא לפי source.
  const synced=source==='isracard'
    ? st.accounts.some(a=>(a.cards||[]).some(c=>/ישראכרט/.test(String(c.issuer||''))))
    : source==='cal'?st.accounts.some(a=>(a.cards||[]).some(c=>/כאל|CAL/i.test(String(c.issuer||''))))
    : st.accounts.some(a=>String(a.source||'').startsWith(source));
  if(!synced){await chrome.storage.local.set({syncStatus:`זוהתה כניסה ל${label}, אך אין חיבור שאושר וסונכרן בעבר`});return false}
  if(!acceptAutoLogin(source,tabId))return false;
  for(let wait=0;(running||autoBusy)&&wait<300;wait++)await delay(1000);
  if(running||autoBusy){await chrome.storage.local.set({syncStatus:`${label}: ההתחברות זוהתה, אך תור הסנכרון עדיין תפוס`});return false}
  autoBusy=true;
  try{
    await chrome.storage.local.set({syncStatus:`כניסה חדשה ל${label}: מעדכן אוטומטית`});
    await fn(tabId);await chrome.storage.local.set({autoSyncLast:{...st.autoSyncLast,[source]:Date.now()}});return true;
  }catch(e){await chrome.storage.local.set({syncStatus:`סנכרון אוטומטי ב${label} נכשל: ${e.message}`});return false}
  finally{autoBusy=false}
}

// ── היסטוריית חיובים לכרטיסים ─────────────────────────────────────────────
// הכתובת של ישראכרט כבר תומכת בחודש (monthAndYear=MMYYYY) ו-waitIsracardReady כבר מאמת
// שהחודש שנטען הוא זה שביקשנו. לכן קריאת חודש היסטורי היא אותו מסלול בדיוק, עם פרמטר.
const mmYYYY=d=>`${String(d.getMonth()+1).padStart(2,'0')}${d.getFullYear()}`;
async function storeCardMonth(month,cards){
  const rawMonth=String(month||''),normalizedMonth=rawMonth.replace(/\D/g,'');
  for(const c of cards||[]){
    if(!c?.suffix)continue;
    if(rawMonth!==normalizedMonth)await cardHistDeleteMonths([rawMonth],[c.suffix]);
    await cardHistPut({id:cardHistId(c.suffix,normalizedMonth),suffix:c.suffix,month:normalizedMonth,
      name:c.name||'',issuer:c.issuer||'',amount:c.amount??null,chargeDate:c.chargeDate||'',
      transactions:c.transactions||[],savedAt:new Date().toISOString()});
  }
  await cardHistPrune(12);
}
let isracardHistoryBusy=false;
async function isracardSummaryFromHome(tabId){
  // בדיוק כמו הסנכרון הראשי: מתחילים תמיד מדף ריכוז הכרטיסים. בעמוד עסקות של
  // כרטיס יחיד אין רשימת כרטיסים ולכן טעינת שנה נכשלה או קראה רק כרטיס אחד.
  await chrome.tabs.update(tabId,{url:ISRACARD_HOME});
  await delay(2200);
  let summary=null;
  for(let attempt=0;attempt<20;attempt++){
    await prepareIsracard(tabId);
    // קוראים את הקרוסלה ישירות מהדף. בלשוניות ישראכרט ותיקות עלול להישאר
    // content-script מהגרסה הקודמת, ואז הודעת הסיכום חוזרת ריקה אף שהכרטיסים
    // כבר מוצגים. הקריאה הישירה אינה תלויה בגרסת הסקריפט שבאותה לשונית.
    try{summary=(await chrome.scripting.executeScript({target:{tabId},func:()=>{
      const clean=s=>String(s||'').replace(/\s+/g,' ').trim(),out=[];
      document.querySelectorAll('button,[role="option"],[role="button"]').forEach(option=>{
        const text=clean(option.getAttribute('aria-label')||option.innerText),suffix=text.match(/\|\s*(\d{4})(?!\d)/)?.[1]||text.match(/מסתיים ב\s*(\d{4})/)?.[1];
        if(!suffix||!/(?:נותר לניצול|חיוב קרוב|מסגרת)/.test(text))return;
        out.push({suffix,name:clean(text.split('|')[0]),issuer:'ישראכרט',cancelled:/מבוטל/.test(text)});
      });
      return{ok:true,cards:[...new Map(out.map(x=>[x.suffix,x])).values()]};
    }}))[0]?.result}catch{}
    if(!summary?.cards?.length)try{summary=await chrome.tabs.sendMessage(tabId,{type:'ISRACARD_SUMMARY'})}catch{}
    if(summary?.cards?.length)return summary;
    await delay(750);
  }
  throw Error('רשימת הכרטיסים לא נטענה — ודא שאתה מחובר לישראכרט');
}
async function clickIsracardMonth(tabId,month){
  let last={ok:false,error:'בורר החודשים עדיין לא נטען'};
  for(let attempt=0;attempt<24;attempt++){
  const result=await chrome.scripting.executeScript({target:{tabId},args:[month],func:wanted=>{
    const names=['ינואר','פברואר','מרץ','אפריל','מאי','יוני','יולי','אוגוסט','ספטמבר','אוקטובר','נובמבר','דצמבר'],clean=v=>String(v||'').replace(/\s+/g,' ').trim(),target=String(wanted||'').replace(/\D/g,''),buttons=[...document.querySelectorAll('button')],months=buttons.filter(b=>names.includes(clean(b.innerText).replace(/\s+\d{2,4}$/,''))),selectedIndex=months.findIndex(b=>b.getAttribute('aria-selected')==='true');if(!/^\d{6}$/.test(target)||selectedIndex<0)return{ok:false,error:'החודש הפעיל לא זוהה'};const selectedText=clean(months[selectedIndex].innerText),name=names.find(x=>selectedText.includes(x)),year=selectedText.match(/(?:^|\s)(\d{2,4})(?:\s|$)/)?.[1];if(!name||!year)return{ok:false,error:'שנת החודש הפעיל לא זוהתה'};const current=`${String(names.indexOf(name)+1).padStart(2,'0')}${year.length===2?'20'+year:year}`;if(current===target)return{ok:true,month:current,clicked:false};const offset=(Number(target.slice(2))-Number(current.slice(2)))*12+Number(target.slice(0,2))-Number(current.slice(0,2)),button=months[selectedIndex+offset];if(!button)return{ok:false,error:`החודש ${target} אינו זמין בבורר`};button.click();return{ok:true,clicked:true,from:current,target};
  }});last=result[0]?.result||{ok:false,error:'הלחיצה על החודש לא בוצעה'};
  if(last.ok)return last;
  await chrome.storage.local.set({syncStatus:`ישראכרט: ממתין לבורר החודשים (${attempt+1}/24)`});
  await delay(500);
  }
  return last;
}
async function readIsracardCardMonth(tabId,card,month){
  // מצלמים את הטבלה הישנה לפני ניווט. צילום אחרי שינוי הכתובת תפס לעיתים בורר
  // שכבר השתנה לצד טבלה ישנה, ולכן אותה טבלה נשמרה לכל החודשים.
  await prepareIsracard(tabId);let before=null;try{before=await chrome.tabs.sendMessage(tabId,{type:'ISRACARD_READY_V3'})}catch{}
  // האתר עצמו כותב את החודש בפורמט MM.YYYY לאחר לחיצה ידנית. הפורמט הישן
  // MMYYYY התקבל בכתובת אך לא הזיז את הבורר. ניווט בפורמט המקורי של האתר הוא
  // המסלול הראשי; לחיצה ישירה נשארת רק כגיבוי.
  const normalized=String(month||'').replace(/\D/g,''),urlMonth=`${normalized.slice(0,2)}.${normalized.slice(2)}`;
  await chrome.tabs.update(tabId,{url:`https://web.isracard.co.il/transactions?cardSuffix=${encodeURIComponent(card.suffix)}&monthAndYear=${urlMonth}`});
  await delay(1800);await prepareIsracard(tabId);
  let current=null;try{current=await chrome.tabs.sendMessage(tabId,{type:'ISRACARD_READY_V3'})}catch{}
  const selected=String(current?.month||'').replace(/\D/g,'')===normalized?{ok:true,clicked:false}:await clickIsracardMonth(tabId,month);
  if(!selected?.ok)throw Error(`כרטיס ${card.suffix}: ${selected?.error||'בחירת החודש נכשלה'}`);
  await waitIsracardReady(tabId,card.suffix,month,before?.fingerprint||'');
  // ישראכרט מעדכן את התוכן אחרי שהכתובת והכותרת כבר התחלפו. ההשהיה מונעת
  // מעבר מהיר לכרטיס הבא לפני שטבלת העסקאות הנוכחית התייצבה.
  await delay(1800);
  const read=await chrome.tabs.sendMessage(tabId,{type:'ISRACARD_TRANSACTIONS_V3'});
  if(!read?.ok)throw Error(`כרטיס ${card.suffix}: העסקאות לא נקראו`);
  // לא עוברים מיד. ישראכרט מעדכן את ה-SPA ואת המטמון גם אחרי שהטבלה כבר נראית.
  // מרווח זה מונע מהניווט הבא לבטל את קריאת החודש שזה עתה הסתיימה.
  await delay(2000);
  return{...card,amount:Number(read.total)||0,transactions:read.transactions||[]};
}
async function loadIsracardMonth(month){
  let tab=await isracardTab();
  if(!tab){await chrome.windows.create({url:ISRACARD_HOME,type:'popup',width:560,height:780,focused:true});
    await chrome.storage.local.set({syncStatus:'ישראכרט: נפתח האתר — התחבר ואז בחר את החודש שוב'});
    return{ok:false,error:'נפתח אתר ישראכרט. התחבר, ואז נסה שוב.'}}
  if(running||autoBusy||isracardHistoryBusy)throw Error('סנכרון אחר כבר רץ — המתן לסיומו ונסה שוב');
  isracardHistoryBusy=true;
  try{
    const summary=await isracardSummaryFromHome(tab.id),active=summary.cards.filter(c=>!c.cancelled),out=[];
    for(let i=0;i<active.length;i++){
      const card=active[i];
      await chrome.storage.local.set({syncStatus:`היסטוריית כרטיסים ${month}: ${i+1} מתוך ${active.length} · ${card.suffix}`});
      out.push(await readIsracardCardMonth(tab.id,card,month));
    }
    await storeCardMonth(month,out);
    await chrome.storage.local.set({syncStatus:`היסטוריית כרטיסים ${month}: נשמרו ${out.length} כרטיסים`});
    return{ok:true,month,cards:out.length};
  }finally{isracardHistoryBusy=false;await restoreSyncTabs()}
}

// טעינת שנה אחורה. רשימת הכרטיסים נקראת פעם אחת בלבד — לא 12 פעמים — ומדלגים על כל
// חודש ששמור כבר. כישלון בחודש בודד אינו עוצר את השאר, וכל חודש נשמר מיד עם סיומו,
// כך שגם אם התהליך נקטע באמצע, לחיצה חוזרת ממשיכה מהנקודה שנעצרה.
async function loadIsracardYear(months=12,suffixes=[]){
  // ⚠ אם אין לשונית מחוברת — פותחים את האתר במקום לזרוק שגיאה. isracardTab מתעלם
  // מדפי התחברות, ולכן גם כשהמשתמש עומד על מסך הכניסה נראה כאילו "אין לשונית".
  let tab=await isracardTab();
  if(!tab){await chrome.windows.create({url:ISRACARD_HOME,type:'popup',width:560,height:780,focused:true});
    await chrome.storage.local.set({syncStatus:'ישראכרט: נפתח האתר — התחבר ואז לחץ שוב על "טען שנה אחורה"'});
    return{ok:false,error:'נפתח אתר ישראכרט. התחבר, ואז לחץ שוב.'}}
  if(running||autoBusy||isracardHistoryBusy)throw Error('סנכרון אחר כבר רץ — המתן לסיומו ונסה שוב');
  isracardHistoryBusy=true;
  try{
  const requested=new Set(suffixes.map(v=>String(v).replace(/\D/g,'').slice(-4)).filter(Boolean));
  await chrome.storage.local.set({syncStatus:requested.size?`ישראכרט: מאתר את כרטיס ${[...requested].join(', ')}`:'ישראכרט: קורא את רשימת הכרטיסים'});
  const summary=await isracardSummaryFromHome(tab.id),active=summary.cards.filter(c=>!c.cancelled&&(!requested.size||requested.has(String(c.suffix))));
  if(!active.length)throw Error(requested.size?'הכרטיס שנבחר לא נמצא בחיבור ישראכרט הפעיל':'לא נמצאו כרטיסים פעילים');
  const wanted=[];const d=new Date();
  for(let i=0;i<months;i++){wanted.push(mmYYYY(d));d.setMonth(d.getMonth()-1)}
  // טעינת שנה היא רענון מלא. אין לדלג לפי קיום חודש במסד: ריצה ישנה עלולה הייתה
  // לשמור את אותו דף תחת חודשים שונים. מוחקים רק את 12 חודשי המטמון המבוקשים;
  // כל חודש חוזר לתצוגה רק לאחר שהקריאה החדשה שלו הסתיימה ואומתה.
  const todo=wanted;
  await chrome.storage.local.set({syncStatus:`ישראכרט: כרטיס ${active.map(c=>c.suffix).join(', ')} זוהה — מכין 12 חודשים`});
  const removed=await cardHistDeleteMonths(todo,[...requested]);
  await chrome.storage.local.set({syncStatus:`היסטוריית כרטיסים: נוקו ${removed} רשומות ישנות עבור ${active.length} כרטיסים — מתחיל קריאה מחדש`});
    // הגלגל גם בטעינת השנה, לא רק בסנכרון הרגיל. כל צעד = כרטיס בחודש.
  await beginProgress(todo.length*Math.max(1,active.length));
  let done=0,failed=[],oldestLoaded={},inactiveBefore=new Set();
  for(const month of todo){
    const out=[];
    for(let i=0;i<active.length;i++){
      const card=active[i];
      // כרטיס חדש אינו קיים בחודשים שקדמו להנפקתו. לאחר שבורר החודשים של
      // ישראכרט מודיע שהחודש אינו זמין, מפסיקים לבקש חודשים ישנים יותר עבורו.
      if(inactiveBefore.has(String(card.suffix)))continue;
      const pageStarted=Date.now();
      await syncStep(`היסטוריה ${month} · כרטיס ${i+1}/${active.length} (${card.suffix}) · חודש ${done+1}/${todo.length}`,`כרטיס ${card.suffix}`);
      try{
        out.push(await readIsracardCardMonth(tab.id,card,month));oldestLoaded[String(card.suffix)]=month;
      }catch(e){
        if(/אינו זמין בבורר/.test(String(e?.message||''))&&oldestLoaded[String(card.suffix)]){
          inactiveBefore.add(String(card.suffix));
          await chrome.storage.local.set({syncStatus:`כרטיס ${card.suffix}: פעיל מחודש ${oldestLoaded[String(card.suffix)]} — לא נדרשת קריאה לחודשים קודמים`});
        }else failed.push(`${month}/${card.suffix}`)
      }
      finally{
        // זמן שהייה מינימלי מחייב לכל דף, גם אם בחירת החודש או הקריאה נכשלו.
        // בלי finally כשל עבר מיד לדף הבא ונראה כאילו המנגנון מדלג על הכול.
        const remaining=4000-(Date.now()-pageStarted);if(remaining>0)await delay(remaining);
      }
    }
    if(out.length){await storeCardMonth(month,out);done++}
    else failed.push(month);
  }
  await endProgress();
  const state=await chrome.storage.local.get({isracardActiveSince:{}}),activeSince={...(state.isracardActiveSince||{})};
  for(const card of active){const suffix=String(card.suffix);if(inactiveBefore.has(suffix))activeSince[suffix]=oldestLoaded[suffix];else delete activeSince[suffix]}
  await chrome.storage.local.set({isracardActiveSince:activeSince});
  await chrome.storage.local.set({syncStatus:`היסטוריית כרטיסים: נטענו ${done} חודשים${failed.length?`, נכשלו ${failed.join(', ')}`:''}`});
  return{ok:true,loaded:done,failed};
  }finally{isracardHistoryBusy=false;await restoreSyncTabs()}
}
async function syncSelected(selectionKeys){
  if(!selectionKeys.length)throw Error('לא נבחרו חשבונות');if(running)throw Error('תהליך אחר כבר מתבצע');running=true;
  try{
    const grouped={business:[],private:[],leumi:[],'discount-business':[],'discount-private':[],mizrahi:[]};for(const selectionKey of selectionKeys){const parts=String(selectionKey).split('|');if(parts.length===2&&grouped[parts[0]])grouped[parts[0]].push(parts[1]);else grouped.business.push(selectionKey)}
    const saved=await chrome.storage.local.get({accounts:[],selectedAccountKeys:[],discoveredAccounts:[]});const syncedSources=['business','private','leumi','discount-business','discount-private','mizrahi'].filter(source=>grouped[source].length);const all=saved.accounts.filter(a=>!syncedSources.includes(a.source||'business'));for(const source of syncedSources)all.push(...(source==='leumi'?await syncLeumi(grouped[source]):source==='discount-business'?await syncDiscountBusiness(grouped[source]):source==='discount-private'?await syncDiscountPrivate(grouped[source]):source==='mizrahi'?await syncMizrahiSelected(grouped[source]):await syncSource(source,grouped[source])));
    const marked=markNewTransactions(saved.accounts,all,syncedSources),newCount=marked.reduce((n,a)=>n+(a.transactions||[]).filter(t=>t.isNew).length,0);
    const preservedKeys=saved.selectedAccountKeys.filter(key=>!syncedSources.includes(String(key).includes('|')?String(key).split('|')[0]:'business'));const finalKeys=[...new Set([...preservedKeys,...selectionKeys])],leumiAccounts=marked.filter(a=>a.source==='leumi'),leumiStatus=`הסתיים ואומת: ${leumiAccounts.length} חשבונות, ${leumiAccounts.reduce((s,a)=>s+(a.transactions?.length||0),0)} תנועות, ${leumiAccounts.reduce((s,a)=>s+(a.loans?.length||0),0)} הלוואות, ${leumiAccounts.reduce((s,a)=>s+(a.chequeCount||0),0)} הפקדות שיקים`;const now=new Date().toISOString(),baseStatus=syncedSources.includes('leumi')?leumiStatus:`הסתיים בהצלחה: ${marked.length} חשבונות`;await chrome.storage.local.set({accounts:marked,discoveredAccounts:[],selectedAccountKeys:finalKeys,accountFilter:'both',syncStatus:`${baseStatus}${newCount?` · ${newCount} תנועות חדשות`:' · אין תנועות חדשות'}`,lastNewTransactionCount:newCount,lastAutoSync:now});{const s=await chrome.storage.local.get({autoSyncLast:{}}),t=Date.now();for(const k of selectionKeys)s.autoSyncLast[String(k).split('|')[0]]=t;await chrome.storage.local.set({autoSyncLast:s.autoSyncLast})}if(!autoBusy)await chrome.runtime.openOptionsPage();return{ok:true,count:marked.length,newCount};
  }catch(e){await chrome.storage.local.set({syncStatus:`שגיאה: ${e.message}`});throw e}finally{running=false;await endProgress();await restoreSyncTabs()}
}
function accountSyncKey(a){return`${a?.source||'business'}|${a?.branch||''}-${a?.accountNumber||''}`}
function transactionSyncKey(t){return JSON.stringify([t?.date||'',t?.action||'',t?.details||'',t?.reference||'',Number(t?.debit)||0,Number(t?.credit)||0,t?.balance==null?'':Number(t.balance)])}
function markNewTransactions(previous,next,syncedSources){
  const oldByAccount=new Map((previous||[]).map(a=>[accountSyncKey(a),a])),allowed=new Set(syncedSources||[]),markedAt=new Date().toISOString();
  return(next||[]).map(account=>{
    if(!allowed.has(account.source||'business'))return account;
    const old=oldByAccount.get(accountSyncKey(account)),oldRows=old?.transactions||[];
    if(!old||!oldRows.length)return{...account,transactions:(account.transactions||[]).map(t=>({...t,isNew:false}))};
    const counts=new Map();for(const row of oldRows){const key=transactionSyncKey(row);counts.set(key,(counts.get(key)||0)+1)}
    return{...account,transactions:(account.transactions||[]).map(row=>{const key=transactionSyncKey(row),left=counts.get(key)||0;if(left){counts.set(key,left-1);return{...row,isNew:false}}return{...row,isNew:true,newAt:markedAt}})};
  })
}
async function syncSource(source,keys){
  const cfg=SOURCES[source],tabs=await chrome.tabs.query({url:[`https://${cfg.host}${cfg.portal}*`]});if(!tabs.length)throw Error(`החיבור אל ${cfg.label} אינו פעיל`);const tab=tabs[0];await returnToDashboard(tab.id,true);await beginProgress(source==='private'?5:4);const skippedParts=[];
  let owner='';if(source==='private'){await syncStep(`${cfg.label}: מזהה את בעל החשבון`,'מזהה בעל חשבון');await prepareRoute(tab.id,route(source,'homepage'),'/homepage');const ownerResult=await chrome.tabs.sendMessage(tab.id,{type:'EXTRACT_OWNER'});owner=ownerResult?.owner||'';if(owner)await chrome.storage.local.set({privateOwnerName:owner})}
  await syncStep(`${cfg.label}: מסנכרן תנועות`,'מוריד תנועות');await prepareRoute(tab.id,route(source,'current-account/transactions'),'/current-account/transactions');const tx=await chrome.tabs.sendMessage(tab.id,{type:'EXTRACT_SELECTED',keys});
  // אבחון: אילו חשבונות לא נקראה להם יתרה בדף התנועות. דף ריכוז היתרות עוד עשוי למלא.
  await chrome.storage.local.set({poalimNoBalance:(tx.accounts||[]).filter(a=>a.balanceMissing).map(a=>`${source}|${a.branch}-${a.accountNumber}`)});
  // אבחון: חשבון בלי ולו תנועה אחת. טביעת האצבע המבנית מוצגת על אריח הבנק,
  // כדי שאפשר יהיה למדוד את מבנה הרשת בלי שהמשתמש ייגע בקונסול.
  {
    const empty=(tx.accounts||[]).find(a=>a.txProbe);
    const diags=(await chrome.storage.local.get({bankDiagnostics:{}})).bankDiagnostics||{};
    if(empty)diags[source]=`0 תנועות · ${empty.txProbe}`;else delete diags[source];
    await chrome.storage.local.set({bankDiagnostics:diags});
  }if(!tx?.ok)throw Error(tx?.error||'סנכרון התנועות נכשל');
  await syncStep(`${cfg.label}: מסנכרן ריכוז יתרות`,'מוריד יתרות');await prepareRoute(tab.id,route(source,'current-account/balances'),'/current-account/balances');const summaries=await chrome.tabs.sendMessage(tab.id,{type:'EXTRACT_BALANCE_SUMMARIES',keys});if(!summaries?.ok)throw Error(summaries?.error||'סנכרון ריכוז היתרות נכשל');
  // ⚠ מוצר משני שנכשל לא ימחק את הליבה. תנועות ויתרות כבר נאספו, ואין שום סיבה
  // לאבד אותן בגלל דף הלוואות. וחובה withTimeout — sendMessage בלי תקרה נתקע לנצח,
  // וזה מה שדווח כ„נעצר בהלוואות" בפועלים פרטי (17.08.2026).
  await syncStep(`${cfg.label}: קורא הלוואות`,'מוריד הלוואות');
  let loans={accounts:[]};
  try{
    await prepareRoute(tab.id,route(source,'credit-and-mortgage'),'/credit-and-mortgage');
    const r=await withTimeout(chrome.tabs.sendMessage(tab.id,{type:'EXTRACT_PRODUCT_DETAILS',kind:'loans',keys}),45000,'קריאת ההלוואות');
    if(!r?.ok)throw Error(r?.error||'קריאת ההלוואות נכשלה');
    loans=r;
  }catch(e){skippedParts.push(`הלוואות: ${e.message}`)}
  await syncStep(`${cfg.label}: קורא כרטיסי אשראי`,'מוריד כרטיסי אשראי');
  let cards={accounts:[]};
  try{
    await prepareRoute(tab.id,route(source,'plastic-cards/current-debit'),'/plastic-cards/current-debit');
    const r=await withTimeout(chrome.tabs.sendMessage(tab.id,{type:'EXTRACT_PRODUCT_DETAILS',kind:'cards',keys}),45000,'קריאת הכרטיסים');
    if(!r?.ok)throw Error(r?.error||'קריאת הכרטיסים נכשלה');
    cards=r;
  }catch(e){skippedParts.push(`כרטיסי אשראי: ${e.message}`)}
  await chrome.storage.local.set({poalimSkipped:skippedParts.length?`${cfg.label} — ${skippedParts.join(' · ')}`:''});
  const byKey=new Map((summaries.accounts||[]).map(a=>[a.key,a]));for(const a of loans.accounts||[])byKey.set(a.key,{...(byKey.get(a.key)||{}),...a});for(const a of cards.accounts||[])byKey.set(a.key,{...(byKey.get(a.key)||{}),...a});const now=new Date().toISOString();
  return tx.accounts.map(a=>({...a,...(byKey.get(`${a.branch}-${a.accountNumber}`)||{}),nickname:owner||a.nickname,owner:owner||a.nickname,source,sourceLabel:cfg.label,selectionKey:`${source}|${a.branch}-${a.accountNumber}`,id:`${source}-${a.branch}-${a.accountNumber}`,lastSync:now,status:'מסונכרן'}));
}
function route(source,path){return`${SOURCES[source].root}/${path}`}
function sourceFreshToday(source,accounts){const relevant=accounts.filter(a=>(a.source||'business')===source);return relevant.length>0&&relevant.every(a=>sameLocalDay(a.lastSync,new Date()))}
function sameLocalDay(value,now){const d=new Date(value);return Number.isFinite(d.getTime())&&d.getFullYear()===now.getFullYear()&&d.getMonth()===now.getMonth()&&d.getDate()===now.getDate()}
async function prepareRoute(tabId,url,path){let tab=await chrome.tabs.get(tabId);if(!tab.url?.includes(path)){await chrome.tabs.update(tabId,{url});await waitTab(tabId,path)}await delay(1700);try{const p=await chrome.tabs.sendMessage(tabId,{type:'PING'});if(p?.ok)return}catch{}await chrome.scripting.executeScript({target:{tabId},files:['poalim-content.js']});await delay(300)}
async function waitTab(id,path){const start=Date.now();while(Date.now()-start<30000){const t=await chrome.tabs.get(id);if(t.status==='complete'&&t.url?.includes(path))return;await delay(250)}throw Error('דף הבנק לא נטען בזמן')}
const delay=ms=>new Promise(r=>setTimeout(r,ms));

// מסך הכניסה של הבינלאומי. נמדד 18.08.2026: הטריגר באתר הוא a.login-trigger שפותח
// מודאל, וה-iframe שבתוכו (#loginFrame) טוען את הכתובת הזו — עמוד עצמאי לכל דבר.
// ⚠ הכתובת יושבת על online.fibi.co.il, אותו מארח שבו מזוהה סשן מחובר. **אין כאן
// מלכודת כמו בדיסקונט**, כי הזיהוי דורש `/shell/#/` בנתיב ולא רק את המארח.
// אם מישהו יחליף אי-פעם את הזיהוי לבדיקת מארח בלבד — הוא ישבור את זה.
const FIBI_LOGIN='https://online.fibi.co.il/MatafLoginService/MatafLoginServlet?bankId=FIBIPORTAL&site=Private&KODSAFA=HE';
async function startFibi(slot){await chrome.storage.local.set({pendingFibiSlot:slot,pendingFibiName:'',discoveredAccounts:[],pendingDiscountBusiness:false,syncStatus:'בודק חיבור פעיל לבינלאומי'});const tabs=await chrome.tabs.query({url:['https://online.fibi.co.il/*']});const connected=tabs.find(tab=>tab.url?.includes('/shell/#/'));if(connected){await returnToDashboard(connected.id,true);syncFibi(connected.id).catch(()=>{});return{ok:true,status:'syncing_connected'}}await chrome.storage.local.set({syncStatus:'ממתין להתחברות לבינלאומי'});await chrome.windows.create({url:FIBI_LOGIN,type:'popup',width:560,height:780,focused:true});return{ok:true,status:'waiting_login'}}
async function openFibiSchedule(tabId,args){const results=await chrome.scripting.executeScript({target:{tabId,allFrames:true},world:'MAIN',args:[args],func:(values)=>{if(typeof window.luachSilukin!=='function')return false;window.luachSilukin(...values);return true}});if(!results.some(x=>x.result===true))throw Error('פונקציית לוח הסילוקין לא נמצאה במסגרת הבנק');return{ok:true}}
async function closeFibiSchedule(tabId){await chrome.scripting.executeScript({target:{tabId,allFrames:true},world:'MAIN',func:()=>{const close=document.querySelector('[role="dialog"] a[href="#"], .ui-dialog a[href="#"]');if(close){close.click();return true}return false}});return{ok:true}}
async function enrichFibiInstallments(tabId,loans){for(const loan of loans||[]){if(!loan.scheduleArgs?.length)continue;try{await closeFibiSchedule(tabId);await delay(500);await openFibiSchedule(tabId,loan.scheduleArgs);let current=0;const expected=`${loan.scheduleArgs[2]}-${loan.scheduleArgs[0]}`;for(let n=0;n<50&&!current;n++){await delay(250);const reads=await chrome.scripting.executeScript({target:{tabId,allFrames:true},args:[expected],func:(loanCode)=>{const frame=document.querySelector('#myFrame'),doc=frame?.contentDocument;if(!doc||!doc.body?.innerText?.includes(loanCode))return 0;for(const row of doc.querySelectorAll('[role="row"]')){const first=row.querySelector('[role="gridcell"]')?.textContent?.trim();if(/^\d+$/.test(first||''))return Number(first)}return 0}});current=Number(reads.find(x=>Number(x.result)>0)?.result||0)}const parse=v=>{const m=String(v||'').match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);if(!m)return null;let y=Number(m[3]);if(y<100)y+=2000;return{m:Number(m[2]),y}};const from=parse(loan.nextPaymentDate),to=parse(loan.endDate);if(current&&from&&to){const remaining=(to.y-from.y)*12+to.m-from.m+1,total=current-1+remaining;if(remaining>0&&total>=remaining){loan.installments=`${current-1}/${total}`;loan.remainingInstallments=remaining;loan.totalInstallments=total}}await closeFibiSchedule(tabId);await delay(500)}catch(e){try{await closeFibiSchedule(tabId)}catch{}}delete loan.scheduleArgs}return loans}
async function fibiRead(tabId,type,label,attempts=24){let last='';const responseTimeout=type==='FIBI_LOANS'?60000:12000;for(let i=0;i<attempts;i++){try{const r=await withTimeout(chrome.tabs.sendMessage(tabId,{type}),responseTimeout,label);if(r?.ok)return r;last=r?.error||'הדף עדיין לא מוכן'}catch(e){last=e.message;try{await chrome.scripting.executeScript({target:{tabId},files:['fibi-content.js']})}catch{}}await delay(750)}throw Error(`${label}: ${last}`)}
async function syncFibi(tabId){
  const state=await chrome.storage.local.get({pendingFibiSlot:'',accounts:[]});if(!state.pendingFibiSlot||running)return;running=true;
  try{
    await delay(1800);const tab=await chrome.tabs.get(tabId);if(!tab.url?.includes('#/accountSummary')){await chrome.tabs.update(tabId,{url:'https://online.fibi.co.il/appsng/Resources/PortalNG/shell/#/accountSummary'});await delay(2200)}
    const s=await fibiRead(tabId,'FIBI_SUMMARY','קריאת סיכום הבינלאומי');
    await chrome.tabs.update(tabId,{url:'https://online.fibi.co.il/appsng/Resources/PortalNG/shell/#/Online/OnAccountMngment/OnSummaryReports/createOwnerApproval'});await delay(1800);
    const ownerResult=await fibiRead(tabId,'FIBI_OWNER','קריאת שם בעל החשבון');const owner=ownerResult.data||{fullName:'',firstName:''};
    const existingSame=state.accounts.find(a=>a.source?.startsWith('fibi-')&&a.accountNumber===s.data.accountNumber&&a.source!==state.pendingFibiSlot);if(existingSame)throw Error('זהו אותו חשבון שכבר נשמר בחיבור האחר');
    await chrome.storage.local.set({syncStatus:'הבינלאומי: קורא פירוט הלוואות ומשכנתאות'});
    await chrome.tabs.update(tabId,{url:'https://online.fibi.co.il/appsng/Resources/PortalNG/shell/#/Online/OnLoansMortgageMenu/OnLoans/AuthLoansDetails'});await delay(2200);
    const loanResult=await fibiRead(tabId,'FIBI_LOANS','קריאת פירוט ההלוואות');loanResult.data.loans=await enrichFibiInstallments(tabId,loanResult.data.loans||[]);
    await chrome.tabs.update(tabId,{url:'https://online.fibi.co.il/appsng/Resources/PortalNG/shell/#/Online/OnAccountMngment/OnBalanceTrans/PrivateAccountFlow'});await delay(2200);
    const t=await fibiRead(tabId,'FIBI_TRANSACTIONS','קריאת תנועות הבינלאומי');
    const now=new Date().toISOString(),source=state.pendingFibiSlot,label=`הבינלאומי — ${owner.firstName||t.data.accountNumber}`;
    const bankNumber=v=>String(v??'').replace(/\D/g,'').replace(/^0+(?=\d)/,'');
    if(bankNumber(s.data.branch)!==bankNumber(t.data.branch)||bankNumber(s.data.accountNumber)!==bankNumber(t.data.accountNumber))throw Error(`החשבון השתנה במהלך הסנכרון (${s.data.branch}-${s.data.accountNumber} לעומת ${t.data.branch}-${t.data.accountNumber})`);
    const loanAccountKey=`${t.data.branch}-${t.data.accountNumber}`,account={...s.data,...loanResult.data,...t.data,loans:(loanResult.data.loans||[]).map(l=>({...l,accountKey:loanAccountKey})),nickname:owner.firstName||`חשבון ${t.data.accountNumber}`,owner:owner.fullName||'',source,sourceLabel:label,selectionKey:`${source}|${loanAccountKey}`,id:`${source}-${loanAccountKey}`,lastSync:now,status:'מסונכרן'};
    const accounts=state.accounts.filter(a=>a.source!==source);accounts.push(account);const names=(await chrome.storage.local.get({fibiConnectionNames:{}})).fibiConnectionNames;names[source]=owner.firstName||t.data.accountNumber;
    await chrome.storage.local.set({accounts,fibiConnectionNames:names,pendingFibiSlot:'',syncStatus:`${label} סונכרן`,lastAutoSync:now});if(!autoBusy)await chrome.runtime.openOptionsPage();
  }catch(e){await chrome.storage.local.set({pendingFibiSlot:'',syncStatus:`שגיאה בבינלאומי: ${e.message}`});if(!autoBusy)await chrome.runtime.openOptionsPage()}finally{running=false;await restoreSyncTabs()}
}

async function startLeumi(){if(running)return{ok:false,error:'סנכרון כבר רץ — המתן לסיומו לפני הפעלה מחדש'};leumiLastRun=0;
// רשימת החשבונות נמחקת כבר בלחיצה. היא תוצר של התחברות אחת ואין להציג אותה בלעדיה —
// אחרת נבחרים חשבונות מרשימה ישנה שאין מאחוריה שום סשן פעיל.
const prev=await chrome.storage.local.get({discoveredAccounts:[]});
await chrome.storage.local.set({pendingLeumi:true,leumiAttempts:0,leumiOptionProbe:null,discoveredAccounts:prev.discoveredAccounts.filter(a=>a.source!=='leumi'),syncStatus:'טוען את החיבור הפעיל ללאומי ומזהה חשבונות'});const tabs=leumiSession(await chrome.tabs.query({url:['https://hb2.bankleumi.co.il/*']}));if(tabs.length){const tab=leumiTab(tabs);await returnToDashboard(tab.id,true);discoverLeumi(tab.id).catch(async e=>{await chrome.storage.local.set({pendingLeumi:false,syncStatus:`זיהוי החשבונות בלאומי נכשל: ${e.message}`})});return{ok:true,status:'discovering'}}await chrome.storage.local.set({syncStatus:'ממתין להתחברות ללאומי'});await chrome.windows.create({url:LEUMI_LOGIN,type:'popup',width:560,height:780,focused:true});return{ok:true,status:'waiting_login'}}
// ⚠⚠ שלושת השומרים כאן מונעים לולאת ניווט, ואין להסיר אף אחד מהם.
// prepareLeumiRoute מנווט את הלשונית; הניווט טוען מחדש את הדף; הדף שולח LEUMI_AUTHENTICATED;
// וזה קורא שוב ל-discoverLeumi. בלי תקרת ניסיונות, נעילה וצינון — זו לולאה אינסופית
// שמנווטת את הלשונית ללא הרף, הופכת את הדפדפן לבלתי שמיש ומפציצה את הבנק.
let leumiBusy=false,leumiLastRun=0;
const LEUMI_MAX_ATTEMPTS=3,LEUMI_COOLDOWN_MS=30000;
async function discoverLeumi(tabId){const state=await chrome.storage.local.get({pendingLeumi:false,discoveredAccounts:[],leumiAttempts:0});if(!state.pendingLeumi)return;
if(leumiBusy)return;
// ⚠ זיהוי וסנכרון חולקים את אותה לשונית, ושניהם מנווטים אותה. זיהוי שרץ באמצע סנכרון
// דורס אותו באמצע קריאת התנועות — וזה נראה כמו סנכרון שרץ ולא מסתיים לעולם.
if(running){await chrome.storage.local.set({syncStatus:'לאומי: סנכרון כבר רץ — הזיהוי ימתין לסיומו'});return}
if(Date.now()-leumiLastRun<LEUMI_COOLDOWN_MS)return;
if(state.leumiAttempts>=LEUMI_MAX_ATTEMPTS){await chrome.storage.local.set({pendingLeumi:false,leumiAttempts:0,syncStatus:`לאומי: ${LEUMI_MAX_ATTEMPTS} ניסיונות נכשלו — נעצר כדי לא להיכנס ללולאה. התחבר ידנית באתר עד שרואים תנועות, ואז הפעל סנכרון מחדש.`});await chrome.runtime.openOptionsPage();return}
leumiBusy=true;leumiLastRun=Date.now();
await chrome.storage.local.set({leumiAttempts:state.leumiAttempts+1});
try{return await runDiscoverLeumi(tabId,state)}finally{leumiBusy=false;await restoreSyncTabs()}}
async function runDiscoverLeumi(tabId,state){
// הזיהוי רץ בעבר על הדף שבמקרה היה פתוח, ולכן נחת על gate-keeper והחזיר "לא נמצאה רשימת החשבונות".
await prepareLeumiRoute(tabId,LEUMI_TX_URL);await delay(1200);
// הזרקה חוזרת אחת לא הספיקה: ניווט של ה-SPA הורג את ה-content script בדיוק בין הבדיקה לשליחה.
let r=null,lastErr='',lastProbe=null;for(let attempt=1;attempt<=5;attempt++){try{r=await withTimeout(chrome.tabs.sendMessage(tabId,{type:'LEUMI_DISCOVER'}),90000,'זיהוי חשבונות בלאומי');if(r)break}catch(e){lastErr=e.message;await chrome.storage.local.set({syncStatus:`לאומי: מחבר מחדש לעמוד, ניסיון ${attempt} מתוך 5`});try{await chrome.scripting.executeScript({target:{tabId},files:['leumi-content.js']})}catch(e2){lastErr=e2.message}await delay(1500)}}
if(!r)throw Error(`אין חיבור לעמוד לאומי אחרי 5 ניסיונות: ${lastErr}`);if(!r?.ok)throw Error(`${r?.error||'זיהוי חשבונות לאומי נכשל'}${dbgText('',r?.debug)}`);const others=state.discoveredAccounts.filter(a=>a.source!=='leumi'),found=r.accounts.map(a=>({...a,source:'leumi',sourceLabel:'לאומי',key:`leumi|${a.key}`}));// כשהזיהוי מחזיר חשבון בודד, שומרים את צילום הרשימה הנפתחת — שם התשובה למה השאר חסרים.
if(found.length<2&&r.optionProbe)await chrome.storage.local.set({leumiOptionProbe:r.optionProbe});
await chrome.storage.local.set({pendingLeumi:false,leumiAttempts:0,discoveredAccounts:[...others,...found],syncStatus:`נמצאו ${found.length} חשבונות בלאומי${r.strategy?` (${r.strategy})`:''} — בחר אילו לסנכרן ואשר`});await chrome.runtime.openOptionsPage()}
const LEUMI_TX_URL='https://hb2.bankleumi.co.il/staticcontent/digitalfront/he/nis-accounts/nis-transactions/',LEUMI_LOAN_URL='https://hb2.bankleumi.co.il/staticcontent/digitalfront/he/credits/loans/';
// ⚠ LEUMI_PING עונה מכל דף ב-hb2, כולל gate-keeper. בלי בדיקת הנתיב הקוד המשיך לדף השגוי
// ודיווח "לא נמצאה רשימת החשבונות" במקום פשוט לנווט שוב.
async function prepareLeumiRoute(tabId,url){const path=new URL(url).pathname;
// ניווט מתוך האפליקציה קודם. ניווט לפי כתובת מאבד את הקשר הסשן
// ומגיע למעטפת ריקה; אם התפריט נכשל — נופלים למסלול הישן כמו שהיה.
// ⚠ חובה withTimeout: goRoute לוחץ בתפריט, ה-SPA מנווט וה-content script מת
// באמצע — ואז התשובה לא מגיעה לעולם והסנכרון תלוי בלי להיכשל.
// ⚠ רענון התוסף (↻) הורג את ה-content script בלשוניות שכבר פתוחות.
// הלשונית נשארת מחוברת אבל LEUMI_GO לא מגיע לאף אחד, ולפני 0.57.2
// התוצאה הייתה כישלון. מזריקים מחדש — בלי לנווט ובלי להרוס את הסשן.
try{await withTimeout(chrome.tabs.sendMessage(tabId,{type:'LEUMI_PING'}),5000,'בדיקת סקריפט לאומי')}
catch{try{await chrome.scripting.executeScript({target:{tabId},files:['leumi-content.js']});await delay(400)}catch{}}
let goWhy='';
try{const go=await withTimeout(chrome.tabs.sendMessage(tabId,{type:'LEUMI_GO',path}),30000,'ניווט בתפריט לאומי');
if(go?.ok){const ping=await withTimeout(chrome.tabs.sendMessage(tabId,{type:'LEUMI_PING'}),8000,'בדיקת דף לאומי');
if(ping?.ok)return;goWhy='הניווט הצליח אבל הדף לא השיב'}
else goWhy=go?.error||'ללא סיבה'}
catch(e){goWhy=e.message}
{const cur=await chrome.tabs.get(tabId).catch(()=>null);
if(String(cur?.url||'').includes('hb2.bankleumi.co.il'))throw Error(`הניווט בתפריט נכשל: ${goWhy}. הלשונית על ${String(cur?.url||'?').replace(/[?#].*/,'')}. אין לנווט לכתובת — זה היה מנתק אותך מהחשבון`);}
await chrome.tabs.update(tabId,{url});const started=Date.now();let last='העמוד עדיין נטען',renav=0;let seen='';
// ⚠ אין להתנות על tab.status==='complete'. באתר של לאומי בקשה תלויה משאירה את הלשונית
// ב-loading לצמיתות, והתנאי הזה חסם את כל התהליך גם כשהדף עצמו שמיש לחלוטין.
while(Date.now()-started<60000){await delay(500);try{const tab=await chrome.tabs.get(tabId);seen=`${tab.status} · ${tab.url}`;
if(!tab.url?.includes(path)){last=`הדפדפן נחת ב-${tab.url}`;if(renav<4&&!String(tab.url||'').includes('hb2.bankleumi.co.il')){renav++;await delay(1500);await chrome.tabs.update(tabId,{url})}continue}
const ping=await withTimeout(chrome.tabs.sendMessage(tabId,{type:'LEUMI_PING'}),8000,'בדיקת דף לאומי');if(ping?.ok)return}
catch(e){last=e.message;try{await chrome.scripting.executeScript({target:{tabId},files:['leumi-content.js']})}catch(e2){last=`${e.message} / הזרקה נכשלה: ${e2.message}`}}}
throw Error(`עמוד לאומי לא היה מוכן בתוך דקה (${seen||'הלשונית לא נקראה'}): ${last}. אם הדף מסתובב בלי להיטען — ההתחברות ללאומי פגה ויש להתחבר מחדש.`)}
// מעדיפים לשונית שכבר בתוך הפורטל, כדי לא לחטוף לשונית לאומי אקראית שפתוחה במקרה
// ⚠ מסך הכניסה של לאומי יושב על **אותו מארח** שבו מזוהה סשן מחובר, ולכן חלונית
// ההתחברות הייתה נחשבת חיבור פעיל — התקלה שהפילה את דיסקונט ב-0.75.1.
// **דף Login.html אינו סשן.** נכתב 18.08.2026, כשהכניסה עברה לחלונית.
const leumiSession=tabs=>tabs.filter(t=>!/\/H\/Login\.html/i.test(t.url||''));
function leumiTab(tabs){return tabs.find(t=>t.url?.includes('/digitalfront/'))||tabs[0]}
// מדידה של הלשונית הפעילה, לצורך כתיבת מתאם לבנק חדש. קריאה בלבד: אין לחיצות,
// אין ניווט, ואין שינוי מצב באתר. הצילום נשמר ל-bankProbe ונקרא משם.
async function probeActiveTab(){
  const [tab]=await chrome.tabs.query({active:true,currentWindow:true});
  if(!tab?.id)throw Error('לא נמצאה לשונית פעילה');
  if(!/^https:/.test(tab.url||''))throw Error(`הלשונית הפעילה אינה דף בנק (${tab.url||'ללא כתובת'})`);
  try{await chrome.scripting.executeScript({target:{tabId:tab.id},files:['probe-content.js']})}
  catch(e){throw Error(`אין הרשאה למדוד את ${new URL(tab.url).hostname} — יש להוסיף אותו ל-host_permissions. (${e.message})`)}
  await delay(400);
  const r=await chrome.tabs.sendMessage(tab.id,{type:'BANK_PROBE'});
  if(!r?.ok)throw Error(r?.error||'המדידה לא החזירה דבר');
  await chrome.storage.local.set({bankProbe:r.probe,syncStatus:`נמדד: ${r.probe.host} · ${r.probe.grid?.datedRows||0} שורות עם תאריך · ${r.probe.accounts?.length||0} מספרי חשבון`});
  return{ok:true,host:r.probe.host};
}
async function leumiSnapshot(tabId){try{const s=await withTimeout(chrome.tabs.sendMessage(tabId,{type:'LEUMI_SNAPSHOT'}),20000,'צילום דף לאומי');return s?.debug||null}catch{return null}}
function dbgText(asked,d){if(!d)return' | אבחון: לא התקבל צילום מצב מהעמוד';const landed=d.url===asked?'הכתובת שביקשנו':`הדפדפן נחת ב-${d.url}`;return` | אבחון: ${landed}; טבלאות ${d.tables}, שורות ${d.rows}, מהן עם תאריך ${d.datedRows} (${d.cols} עמודות); לשוניות חשבון ${d.tabs}; ₪ לפני מספר ${d.shekelBefore}, ₪ אחרי מספר ${d.shekelAfter}; שורה ראשונה ${JSON.stringify(d.firstRow)}; פתיח ${String(d.head||'').slice(0,220)}`}
async function syncLeumi(keys){const tabs=leumiSession(await chrome.tabs.query({url:['https://hb2.bankleumi.co.il/*']}));if(!tabs[0])throw Error('החיבור ללאומי אינו פעיל');
// היתרות שנקראו מבורר החשבונות בזיהוי משמשות נפילה לאחור, כדי שכרטיס יתרה שלא רונדר
// לא יפיל את הסנכרון כולו אחרי שלושה ניסיונות של שתי דקות וחצי כל אחד.
const disc=(await chrome.storage.local.get({discoveredAccounts:[]})).discoveredAccounts;
const balances={};for(const a of disc)if(a.source==='leumi'&&a.balance!=null)balances[`${a.branch}-${a.accountNumber}`]=a.balance;const tabId=leumiTab(tabs).id,txUrl=LEUMI_TX_URL,loanUrl=LEUMI_LOAN_URL;let r,lastError='',lastDebug=null;for(let attempt=1;attempt<=3;attempt++){await chrome.storage.local.set({syncStatus:`לאומי: סנכרון בתהליך — קורא תנועות, ניסיון ${attempt} מתוך 3`});try{await prepareLeumiRoute(tabId,txUrl);r=await withTimeout(chrome.tabs.sendMessage(tabId,{type:'LEUMI_SYNC_SELECTED',keys,balances}),180000,'קריאת תנועות בלאומי');if(r?.ok&&r.accounts?.length===keys.length&&r.accounts.every(a=>a.balance!=null&&Array.isArray(a.transactions)))break;lastError=r?.error||'לא התקבלו תנועות ויתרות מלאות';lastDebug=r?.debug||await leumiSnapshot(tabId)}catch(e){lastError=e.message;lastDebug=await leumiSnapshot(tabId)}r=null}if(!r){await chrome.storage.local.set({leumiDebug:{stage:'transactions',asked:txUrl,error:lastError,...(lastDebug||{})}});throw Error(`קריאת תנועות לאומי נכשלה לאחר 3 ניסיונות: ${lastError}${dbgText(txUrl,lastDebug)}`)}let lr;lastError='';lastDebug=null;for(let attempt=1;attempt<=3;attempt++){await chrome.storage.local.set({syncStatus:`לאומי: סנכרון בתהליך — קורא הלוואות, ניסיון ${attempt} מתוך 3`});try{await prepareLeumiRoute(tabId,loanUrl);lr=await withTimeout(chrome.tabs.sendMessage(tabId,{type:'LEUMI_LOANS_SELECTED',keys}),120000,'קריאת הלוואות בלאומי');if(lr?.ok&&lr.accounts?.length===keys.length&&lr.accounts.every(a=>Array.isArray(a.loans)))break;lastError=lr?.error||'לא התקבל פירוט הלוואות מלא';lastDebug=lr?.debug||await leumiSnapshot(tabId)}catch(e){lastError=e.message;lastDebug=await leumiSnapshot(tabId)}lr=null}if(!lr){await chrome.storage.local.set({leumiDebug:{stage:'loans',asked:loanUrl,error:lastError,...(lastDebug||{})}});throw Error(`קריאת הלוואות לאומי נכשלה לאחר 3 ניסיונות: ${lastError}${dbgText(loanUrl,lastDebug)}`)}const loansByKey=new Map((lr.accounts||[]).map(a=>[a.key,a])),now=new Date().toISOString(),result=r.accounts.map(a=>({...a,...(loansByKey.get(a.key)||{}),owner:a.nickname,source:'leumi',sourceLabel:'לאומי',selectionKey:`leumi|${a.key}`,id:`leumi-${a.key}`,lastSync:now,status:'מסונכרן ומאומת'}));const txCount=result.reduce((sum,a)=>sum+(a.transactions?.length||0),0),loanCount=result.reduce((sum,a)=>sum+(a.loans?.length||0),0),chequeCount=result.reduce((sum,a)=>sum+(a.chequeCount||0),0);
// שמירת הצילומים לא מסכנת את הסנכרון: אם היא נכשלת, היתרות והתנועות כבר בידינו.
let saved=0;try{saved=await harvestLeumiCheques(tabId,result,txUrl)}catch(e){await chrome.storage.local.set({chequeError:e.message})}
await chrome.storage.local.set({syncStatus:`הסתיים ואומת: ${result.length} חשבונות, ${txCount} תנועות, ${loanCount} הלוואות, ${chequeCount} הפקדות שיקים${saved?`, ${saved} צילומי שיקים נשמרו מקומית`:''}`});return result}
let chequeCtx={base:0,total:0,noRef:0,done:0};
async function harvestLeumiCheques(tabId,accounts,txUrl){const have=await chequeKeys();let saved=0,routed=false,asked=0,failed=0,why='';
{let total=0,noRef=0,already=0;
for(const a of accounts)for(const t of(a.transactions||[]))if(t.cheque){total++;
if(!t.reference)noRef++;else if(have.has(chequeId(a.selectionKey,t.reference)))already++}
chequeCtx={base:already,total,noRef,done:0}}
for(const a of accounts){const wanted=(a.transactions||[]).filter(t=>t.cheque&&t.reference&&!have.has(chequeId(a.selectionKey,t.reference))).map(t=>({date:t.date,reference:t.reference}));
// ניווט אחד לכל הקציר; מעבר בין חשבונות נעשה בתוך הדף ולא בטעינה מחדש.
if(!wanted.length)continue;asked+=wanted.length;
if(!routed){try{await prepareLeumiRoute(tabId,txUrl);routed=true}catch(e){why=`המעבר לדף התנועות נכשל: ${e.message}`;break}}
// באצוות, כדי שכשל באמצע לא יזרוק את מה שכבר ירד
for(let i=0;i<wanted.length;i+=6){const batch=wanted.slice(i,i+6);let r=null;
try{r=await withTimeout(chrome.tabs.sendMessage(tabId,{type:'LEUMI_CHEQUE_IMAGES',wanted:batch,key:a.key,offset:i,total:wanted.length}),300000,'צילומי שיקים בלאומי')}catch(e){why=why||e.message}
if(!r?.ok){failed+=batch.length;why=why||r?.error||'הדף לא החזיר צילומים';continue}
for(const[reference,img]of Object.entries(r.images||{})){if(!img?.front)continue;await chequePut({id:chequeId(a.selectionKey,reference),selectionKey:a.selectionKey,reference,front:img.front,back:img.back||'',savedAt:new Date().toISOString()});saved++}}}
await chrome.storage.local.set({leumiChequeReport:{total:chequeCtx.total,already:chequeCtx.base,noReference:chequeCtx.noRef,asked,saved,failed,why,at:new Date().toISOString()}});
if(asked&&!saved)await chrome.storage.local.set({syncStatus:`לאומי: לא נשמר אף צילום שיק מתוך ${asked} מבוקשים — ${why||'ללא סיבה'}`});
return saved}
async function openLeumiCheque(m){const tabs=leumiSession(await chrome.tabs.query({url:['https://hb2.bankleumi.co.il/*']}));if(!tabs[0])throw Error('יש להתחבר ללאומי כדי להציג צילום שיק');await chrome.tabs.update(tabs[0].id,{url:'https://hb2.bankleumi.co.il/staticcontent/digitalfront/he/checks/cleared-checks/'});await delay(1600);const r=await chrome.tabs.sendMessage(tabs[0].id,{type:'LEUMI_OPEN_CHEQUE',branch:m.branch,accountNumber:m.accountNumber,date:m.date,amount:m.amount});if(!r?.ok)throw Error(r?.error||'צילום השיק לא נמצא');return{ok:true}}

// ⚠ tabs[0] בחר לשונית שרירותית — לעיתים ישנה, מנותקת או בחלון אחר. המשתמש ראה
// "לא קורה כלום" בזמן שהתוסף דפדף בלשונית אחרת. סדר העדיפות: הלשונית הפעילה עכשיו,
// אחר כך פעילה בחלון כלשהו, ורק אז האחרונה שנצפתה.
// ⚠ נסיגה שתוקנה 18.08.2026: עד 0.75.0 מסך הכניסה של דיסקונט היה על
// discountbank.co.il, מארח אחר, ולכן לא נתפס כאן. משהעברתי את הכניסה ל-
// start.telebank.co.il, **חלונית ההתחברות עצמה נראתה כמו סשן מחובר** —
// דיסקונט עסקי „מצא חיבור", לא פתח חלון, וניסה לזהות חשבונות על דף הכניסה.
// **לשונית על /login/ אינה סשן.**
async function discountTab(){const all=await chrome.tabs.query({url:['https://start.telebank.co.il/*']});
const tabs=all.filter(t=>!/\/login\//.test(t.url||''));
if(!tabs.length)return null;
const [active]=await chrome.tabs.query({active:true,currentWindow:true});
const pick=tabs.find(t=>t.id===active?.id)||tabs.find(t=>t.active)||[...tabs].sort((a,b)=>(b.lastAccessed||0)-(a.lastAccessed||0))[0];
if(tabs.length>1)await chrome.storage.local.set({discountTabNote:`נמצאו ${tabs.length} לשוניות דיסקונט — נבחרה ${pick.id}`});
return pick}
// לקח מלאומי: ניווט של ה-SPA הורג את ה-content script, והזרקה חוזרת אחת אינה מספיקה.
// ⚠ content script שמת באמצע ניווט לא שולח תשובה לעולם, ו-sendMessage ממתין ללא הגבלה.
// בלי המעטפת הזו הסנכרון נראה "רץ" לנצח במקום להיכשל ולדווח.
const withTimeout=(promise,ms,what)=>Promise.race([promise,new Promise((_,reject)=>setTimeout(()=>reject(Error(`${what} לא השיב תוך ${Math.round(ms/1000)} שניות`)),ms))]);
async function prepareDiscountContent(tabId){let last='';for(let attempt=1;attempt<=5;attempt++){
try{const p=await chrome.tabs.sendMessage(tabId,{type:'DISCOUNT_PING'});if(p?.ok)return}catch(e){last=e.message}
try{await chrome.scripting.executeScript({target:{tabId},files:['discount-content.js']})}catch(e){last=e.message}
await delay(attempt===1?500:1500)}
throw Error(`אין חיבור לעמוד דיסקונט אחרי 5 ניסיונות: ${last}`)}
async function startDiscountPrivate(){
await chrome.storage.local.set({pendingDiscountPrivate:true,pendingDiscountBusiness:false,syncStatus:'ממתין להתחברות לדיסקונט פרטי'});
await chrome.windows.create({url:DISCOUNT_LOGIN_PRIVATE,type:'popup',width:560,height:780,focused:true});
return{ok:true,status:'waiting_login'}}
async function handleDiscountAuthenticated(tabId){const state=await chrome.storage.local.get({pendingDiscountBusiness:false,pendingDiscountPrivate:false});
if(state.pendingDiscountPrivate){await discoverDiscountPrivate(tabId);return}
if(state.pendingDiscountBusiness){await chrome.storage.local.set({syncStatus:'דיסקונט עסקי: מזהה ישויות וחשבונות'});await discoverDiscountBusiness(tabId)}}
async function discoverDiscountPrivate(tabId){try{await chrome.storage.local.set({syncStatus:'דיסקונט פרטי: מזהה את החשבון הפעיל'});await prepareDiscountContent(tabId);const r=await withTimeout(chrome.tabs.sendMessage(tabId,{type:'DISCOUNT_PRIVATE_DISCOVER'}),30000,'זיהוי חשבון פרטי');if(!r?.ok)throw Error(r?.error||'החשבון הפרטי לא זוהה');const state=await chrome.storage.local.get({discoveredAccounts:[]});const others=state.discoveredAccounts.filter(a=>a.source!=='discount-private');const found=(r.accounts||[]).map(a=>({...a,source:'discount-private',sourceLabel:'דיסקונט פרטי',key:`discount-private|${a.key}`,balance:null}));if(!found.length)throw Error('לא נמצא מספר חשבון בדף');await chrome.storage.local.set({pendingDiscountPrivate:false,discountPrivateTabId:tabId,discoveredAccounts:[...others,...found],syncStatus:`דיסקונט פרטי: נמצא ${found.length} חשבון — בחר ואשר סנכרון`});await chrome.runtime.openOptionsPage()}catch(e){await chrome.storage.local.set({pendingDiscountPrivate:false,syncStatus:`שגיאה בדיסקונט פרטי: ${e.message}`});await chrome.runtime.openOptionsPage()}}
async function syncDiscountPrivate(keys){
const state=await chrome.storage.local.get({discountPrivateTabId:null});let tab=null;if(state.discountPrivateTabId)try{tab=await chrome.tabs.get(state.discountPrivateTabId)}catch{}if(!tab){const tabs=await chrome.tabs.query({url:['https://start.telebank.co.il/apollo/retail3/*']});tab=tabs.find(t=>t.active)||tabs[0]}if(!tab)throw Error('החיבור לדיסקונט פרטי אינו פעיל');
const saved=await chrome.storage.local.get({discoveredAccounts:[]}),names=new Map(saved.discoveredAccounts.filter(a=>a.source==='discount-private').map(a=>[String(a.key).replace(/^discount-private\|/,''),a.owner||a.nickname]));const out=[],now=new Date().toISOString();
for(let i=0;i<keys.length;i++){const key=keys[i];await chrome.storage.local.set({syncStatus:`דיסקונט פרטי: עובר לחשבון ${i+1} מתוך ${keys.length}`});await chrome.tabs.update(tab.id,{url:'https://start.telebank.co.il/apollo/retail3/#/MY_ACCOUNT_HOMEPAGE'});await delay(1600);await prepareDiscountContent(tab.id);await chrome.tabs.sendMessage(tab.id,{type:'DISCOUNT_SELECT_PRIVATE_ACCOUNT',key});const wanted=String(key).replace(/\D/g,'').padStart(10,'0');for(let w=0;w<25;w++){await delay(700);await prepareDiscountContent(tab.id);let st=null;try{st=await chrome.tabs.sendMessage(tab.id,{type:'DISCOUNT_STATE'})}catch{}if(`${st?.branch||''}${st?.accountNumber||''}`===wanted)break}
await chrome.storage.local.set({syncStatus:`דיסקונט פרטי: קורא תנועות חשבון ${i+1}`});await chrome.tabs.update(tab.id,{url:'https://start.telebank.co.il/apollo/retail3/#/OSH_LENTRIES_ALTAMIRA'});for(let w=0;w<30;w++){await delay(1000);await prepareDiscountContent(tab.id);let st=null;try{st=await chrome.tabs.sendMessage(tab.id,{type:'DISCOUNT_STATE'})}catch{}if(st?.rows>0)break}const r=await withTimeout(chrome.tabs.sendMessage(tab.id,{type:'DISCOUNT_SYNC_SELECTED',keys:[key],private:true}),90000,'קריאת תנועות דיסקונט פרטי');if(!r?.ok||!(r.accounts||[]).length)throw Error(r?.error||`לא נקראו תנועות בחשבון ${key}`);
await chrome.storage.local.set({syncStatus:`דיסקונט פרטי: קורא הלוואות חשבון ${i+1}`});await chrome.tabs.update(tab.id,{url:'https://start.telebank.co.il/apollo/retail3/#/LOANS_WORLD'});await delay(2200);await prepareDiscountContent(tab.id);let regular={loans:[]};try{regular=await withTimeout(chrome.tabs.sendMessage(tab.id,{type:'DISCOUNT_READ_LOANS'}),30000,'קריאת הלוואות')}catch{}
await chrome.storage.local.set({syncStatus:`דיסקונט פרטי: קורא משכנתאות חשבון ${i+1}`});await chrome.tabs.update(tab.id,{url:'https://start.telebank.co.il/apollo/retail3/#/MORTGAGES_WORLD'});await delay(2500);await prepareDiscountContent(tab.id);let mortgage={loans:[]};try{mortgage=await withTimeout(chrome.tabs.sendMessage(tab.id,{type:'DISCOUNT_READ_MORTGAGES'}),30000,'קריאת משכנתאות')}catch{}
const allLoans=[...(regular.loans||[]),...(mortgage.loans||[])];for(const a of r.accounts||[])out.push({...a,nickname:names.get(key)||'דיסקונט פרטי',owner:names.get(key)||'',creditLimit:null,availableCredit:null,loans:allLoans,source:'discount-private',sourceLabel:'דיסקונט פרטי',selectionKey:`discount-private|${key}`,id:`discount-private-${key}`,lastSync:now,status:`מסונכרן · ${allLoans.length} הלוואות ומשכנתאות`})}
return out}

const MIZRAHI_TX='https://mto.mizrahi-tefahot.co.il/OnlineApp/osh/legacy/root-main-osh-p428New';
const MIZRAHI_LOANS='https://mto.mizrahi-tefahot.co.il/OnlineApp/mashkanta/legacy/legacy-Loan-P060';
const MIZRAHI_HOME='https://www.mizrahi-tefahot.co.il/';
const MIZRAHI_LOGIN='https://www.mizrahi-tefahot.co.il/login/index.html#/login-he';
// פותח את חלונית ההתחברות של הבנק. המשתמש מקליד — התוסף רק פותח את הדלת.
// נמדד 17.08.2026: a#logInBtn[href="#logInModal"] · click() רגיל מספיק · החלונית div#logInModal
// עוברת display:none→block ומטעינה iframe#iframeLogIn עם login/index.html.
async function openMizrahiLogin(tabId){
  for(let attempt=0;attempt<6;attempt++){
    let state='';
    try{const [r]=await chrome.scripting.executeScript({target:{tabId},func:()=>{
      const modal=document.querySelector('#logInModal');
      if(modal&&getComputedStyle(modal).display!=='none')return 'open';
      const trigger=document.querySelector('#logInBtn')||document.querySelector('a[href="#logInModal"]');
      if(!trigger)return 'no-trigger';
      trigger.click();
      return 'clicked';
    }});state=r?.result||''}catch{}
    if(state==='open')return true;
    await delay(1200);
  }
  // נפילה לאחור: דף ההתחברות עומד בפני עצמו, בלי תלות ב-DOM של עמוד הבית.
  await chrome.tabs.update(tabId,{url:MIZRAHI_LOGIN});
  return false;
}
let mizrahiBusy=false;
async function mizrahiTab(){const tabs=await chrome.tabs.query({url:['https://mto.mizrahi-tefahot.co.il/OnlineApp/*']});return tabs.find(t=>t.url?.includes('/OnlineApp/'))||null}
async function prepareMizrahi(tabId){await delay(900);try{await chrome.scripting.executeScript({target:{tabId,allFrames:true},files:['mizrahi-content.js']})}catch{try{await chrome.scripting.executeScript({target:{tabId},files:['mizrahi-content.js']})}catch{}}await delay(500)}
async function setMizrahiRange(tabId){await chrome.scripting.executeScript({target:{tabId,allFrames:true},func:()=>{const clean=v=>String(v??'').replace(/\s+/g,' ').trim();const b=[...document.querySelectorAll('button,[role="button"]')].find(x=>/3\s*חודשים\s*אחרונים/.test(clean(x.innerText)));if(!b)return false;b.click();return true}})}
async function readMizrahiTransactions(tabId){let rows=[];try{const results=await chrome.scripting.executeScript({target:{tabId,allFrames:true},func:()=>{const clean=v=>String(v??'').replace(/[\u200e\u200f\u202a-\u202e]/g,'').replace(/\s+/g,' ').trim();const money=v=>{const m=clean(v).replace(/[−–]/g,'-').match(/-?[\d,]+(?:\.\d{1,2})?/);if(!m)return null;const n=Number(m[0].replace(/,/g,''));return Number.isFinite(n)?n:null};const rows=[];for(const row of document.querySelectorAll('[role="row"],tr')){const cells=[...row.querySelectorAll('[role="gridcell"],td')].map(x=>({text:clean(x.innerText),label:clean(x.getAttribute('aria-label'))})),dateCell=cells.find(c=>/^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(c.text));if(!dateCell)continue;const actionCell=cells.find(c=>/סוג תנועה/.test(c.label)),amountCell=cells.find(c=>/זכות\s*\/\s*חובה/.test(c.label)),balanceCell=cells.find(c=>/יתרה/.test(c.label));const amount=money(amountCell?.text),balance=money(balanceCell?.text);rows.push({date:dateCell.text,action:actionCell?.text||'',details:'',debit:amount!=null&&amount<0?Math.abs(amount):null,credit:amount!=null&&amount>=0?amount:null,balance})}return rows}});rows=results.flatMap(x=>Array.isArray(x.result)?x.result:[])}catch{}if(!rows.length)rows=mizrahiFrameData.get(tabId)?.transactions||[];return rows}
async function readMizrahiSummary(tabId){const results=await chrome.scripting.executeScript({target:{tabId,allFrames:true},func:()=>{const clean=v=>String(v??'').replace(/[\u200e\u200f\u202a-\u202e]/g,'').replace(/\s+/g,' ').trim();const money=v=>{const m=clean(v).replace(/[−–]/g,'-').match(/-?[\d,]+(?:\.\d{1,2})?/);if(!m)return null;const n=Number(m[0].replace(/,/g,''));return Number.isFinite(n)?n:null};const buttons=[...document.querySelectorAll('button')].map(x=>clean(x.innerText)),hit=buttons.find(t=>/\b\d{3}\s*-\s*\d{5,9}\b/.test(t));if(!hit)return null;const m=hit.match(/\b(\d{3})\s*-\s*(\d{5,9})\b/);if(!m)return null;const text=clean(document.body?.innerText),owner=hit.replace(m[0],'').trim()||'חשבון מזרחי',balance=money((text.match(/יתרת עו["״']ש\s*([\d,.-]+)\s*₪/)||[])[1]),creditLimit=money((text.match(/מסגרת אשראי בחשבון\s*([\d,.-]+)\s*₪/)||[])[1]);return{branch:m[1],accountNumber:m[2],owner,nickname:owner,balance,creditLimit}}});return results.map(x=>x.result).find(Boolean)||null}
async function startMizrahi(){if(mizrahiBusy)return{ok:false,error:'סנכרון מזרחי־טפחות כבר מתבצע'};await chrome.storage.local.set({pendingMizrahi:true,syncStatus:'מזרחי־טפחות: בודק את החיבור ומזהה חשבונות'});const tab=await mizrahiTab();if(!tab){await chrome.storage.local.set({syncStatus:'מזרחי־טפחות: פותח את חלון ההתחברות'});const opened=await chrome.tabs.create({url:MIZRAHI_HOME,active:true});try{await waitTab(opened.id,'mizrahi-tefahot.co.il')}catch{}const shown=await openMizrahiLogin(opened.id);await chrome.storage.local.set({syncStatus:shown?'ממתין להתחברות למזרחי־טפחות — הזן משתמש וסיסמה בחלונית שנפתחה':'ממתין להתחברות למזרחי־טפחות — נפתח דף ההתחברות'});return{ok:true,status:'waiting_login'}}await returnToDashboard(tab.id,true);runMizrahi(tab.id).catch(async e=>{await chrome.storage.local.set({pendingMizrahi:false,syncStatus:`שגיאה במזרחי־טפחות: ${e.message}`});await chrome.runtime.openOptionsPage()});return{ok:true,status:'syncing'}}
async function runMizrahi(tabId){if(mizrahiBusy)return;mizrahiBusy=true;try{await prepareMizrahi(tabId);const detected=await readMizrahiSummary(tabId);if(!detected)throw Error('לא זוהה חשבון פעיל בעמוד מזרחי');const found=[{...detected,key:`mizrahi|${detected.branch}-${detected.accountNumber}`,source:'mizrahi',sourceLabel:'מזרחי־טפחות',balance:null}];const result=await syncMizrahiSelected([`${detected.branch}-${detected.accountNumber}`],tabId);const state=await chrome.storage.local.get({accounts:[],selectedAccountKeys:[]});const accounts=[...state.accounts.filter(a=>a.source!=='mizrahi'),...result],selectedAccountKeys=[...new Set([...state.selectedAccountKeys.filter(k=>!String(k).startsWith('mizrahi|')),result[0].selectionKey])];await chrome.storage.local.set({accounts,discoveredAccounts:[],selectedAccountKeys,pendingMizrahi:false,syncStatus:`מזרחי־טפחות: הסנכרון הסתיים — ${result[0].transactions.length} תנועות ו־${result[0].loans.length} הלוואות`});if(!autoBusy)await chrome.runtime.openOptionsPage()}finally{mizrahiBusy=false;await restoreSyncTabs()}}
async function syncMizrahiSelected(keys,knownTabId=null){const tab=knownTabId?await chrome.tabs.get(knownTabId):await mizrahiTab();if(!tab)throw Error('החיבור למזרחי־טפחות אינו פעיל');if(keys.length!==1)throw Error('בחיבור מזרחי הנוכחי ניתן לסנכרן חשבון פעיל אחד בכל פעם');await chrome.storage.local.set({syncStatus:'מזרחי־טפחות: טוען תנועות של 3 חודשים אחרונים'});if(!tab.url?.includes('root-main-osh-p428New')){await chrome.tabs.update(tab.id,{url:MIZRAHI_TX});await waitTab(tab.id,'root-main-osh-p428New')}await prepareMizrahi(tab.id);await delay(1200);await setMizrahiRange(tab.id);await delay(4200);const account=await readMizrahiSummary(tab.id),transactions=await readMizrahiTransactions(tab.id);if(!account)throw Error('פרטי החשבון הפעיל לא זוהו בעמוד מזרחי');if(`${account.branch}-${account.accountNumber}`!==keys[0])throw Error(`החשבון הפעיל הוא ${account.branch}-${account.accountNumber}, ולא החשבון שנבחר`);if(!transactions.length)throw Error('לא נקראו תנועות ישירות מטבלת שלושת החודשים — הסנכרון נעצר ולא נשמרו נתונים חלקיים');let loans=[];await chrome.storage.local.set({syncStatus:`מזרחי־טפחות: נקראו ${transactions.length} תנועות; קורא הלוואות`});try{await chrome.tabs.update(tab.id,{url:MIZRAHI_LOANS});await waitTab(tab.id,'legacy-Loan-P060');await prepareMizrahi(tab.id);await delay(2200);const lr=await chrome.tabs.sendMessage(tab.id,{type:'MIZRAHI_LOANS'});if(lr?.ok)loans=lr.loans||[]}catch{}const now=new Date().toISOString(),availableCredit=account.balance==null||account.creditLimit==null?null:account.balance+account.creditLimit;return[{...account,availableCredit,transactions,loans,source:'mizrahi',sourceLabel:'מזרחי־טפחות',selectionKey:`mizrahi|${account.branch}-${account.accountNumber}`,id:`mizrahi-${account.branch}-${account.accountNumber}`,lastSync:now,status:loans.length?'מסונכרן':'מסונכרן ללא פירוט הלוואות'}]}

const ISRACARD_HOME='https://web.isracard.co.il/StatusPage';
// מסך הכניסה. נמדד 18.08.2026 מתוך ה-href של „כניסה לחשבון שלי" באתר isracard.co.il.
// הועתק כלשונו, בלי returnUrl מורכב — הזרימה ממילא מנווטת ל-StatusPage בעצמה.
// ⚠ מארח **אחר** (digital) מזה שבו מזוהה סשן (web), ולכן חלונית ההתחברות אינה
// יכולה להיחשב סשן מחובר. זו המלכודת שהפילה את דיסקונט ב-0.75.1 — כאן היא לא קיימת.
// ⚠ 18.08.2026 — הכתובת נמדדה נכון, אבל **המארח שגוי לזרימה**. ההתחברות עליו
// אינה מבטיחה סשן על web.isracard.co.il, שם הסנכרון קורא את רשימת הכרטיסים,
// והתוצאה הייתה "רשימת הכרטיסים לא נטענה" לסירוגין. נשמר לתיעוד; אינו בשימוש.
// **הפתיחה חזרה ל-ISRACARD_HOME, שממנו האתר מפנה להתחברות ומחזיר לאותו מארח.**
const ISRACARD_LOGIN_UNUSED='https://digital.isracard.co.il/personalarea/Login/';
// שלוש כתובות כניסה נוספות, כולן נמדדו 18.08.2026 מתוך ה-href באתרי הבנקים.
// כאל ולאומי יושבות על מארחי הסשן שלהן, ולכן `calTab` ו-`leumiSession` מסננים
// אותן במפורש. מקס — `/login` בטווח השאילתה של `maxTab`, ולכן גם שם.
const CAL_LOGIN='https://digital-web.cal-online.co.il/login?returnedUrl=%2Ftransactions#top';
const MAX_LOGIN='https://www.max.co.il/login';
const LEUMI_LOGIN='https://hb2.bankleumi.co.il/H/Login.html';
async function isracardTab(){const tabs=await chrome.tabs.query({url:['https://web.isracard.co.il/*']});return tabs.find(t=>!/login|signin/i.test(t.url||''))||null}
async function prepareIsracard(tabId){try{const p=await chrome.tabs.sendMessage(tabId,{type:'ISRACARD_PING_V3'});if(p?.ok&&p.adapterVersion===3)return}catch{}await chrome.scripting.executeScript({target:{tabId},files:['isracard-content.js']});await delay(350);const p=await chrome.tabs.sendMessage(tabId,{type:'ISRACARD_PING_V3'});if(!p?.ok||p.adapterVersion!==3)throw Error('מתאם ישראכרט החדש לא נטען')}
// ⚠ 18.08.2026 — כשהרשימה אינה נטענת יש שני חשודים: הדף לא הספיק לעלות, או ש-cards()
// כבר אינו מזהה את ה-DOM. בלי דגימה אי אפשר להכריע, וכל סבב הבא מתחיל שוב מניחוש.
// הדגימה נשמרת מקומית ב-bankDiagnostics.isracard ואינה נשלחת לשום מקום.
async function saveIsracardMiss(tabId){
  try{
    const sample=await chrome.tabs.sendMessage(tabId,{type:'ISRACARD_BUTTONS_SAMPLE'});
    const st=await chrome.storage.local.get({bankDiagnostics:{}});
    await chrome.storage.local.set({bankDiagnostics:{...st.bankDiagnostics,isracard:{at:Date.now(),...sample}}});
  }catch{}
}
async function waitIsracardReady(tabId,suffix,month='',previousFingerprint=''){
  const wanted=String(month||'').replace(/\D/g,'');let candidate='',stable=0,firstMatch=0;
  for(let i=0;i<60;i++){
    await delay(750);await prepareIsracard(tabId);
    try{
      const state=await chrome.tabs.sendMessage(tabId,{type:'ISRACARD_READY_V3'}),rightMonth=!wanted||String(state.month||'').replace(/\D/g,'')===wanted,changed=!previousFingerprint||state.fingerprint!==previousFingerprint;
      if(!state?.ready||state.suffix!==String(suffix)||!rightMonth||!changed){candidate='';stable=0;firstMatch=0;continue}
      if(!firstMatch)firstMatch=Date.now();
      if(state.fingerprint===candidate)stable++;else{candidate=state.fingerprint;stable=1}
      // לפחות 3.5 שניות אחרי בחירת החודש וארבע קריאות זהות ברצף. כך מצב הביניים
      // שבו הטבלה ריקה אינו נחשב לטעינה שהסתיימה.
      if(Date.now()-firstMatch>=3500&&stable>=4)return;
    }catch{candidate='';stable=0;firstMatch=0}
  }
  throw Error(`כרטיס ${suffix}: חודש ${month||'נוכחי'} סומן אך טבלת העסקאות לא התייצבה`)
}
async function startIsracard(){await chrome.storage.local.set({pendingIsracard:true,pendingIsracardAt:Date.now()});const tab=await isracardTab();if(!tab){await chrome.storage.local.set({syncStatus:'ממתין להתחברות לישראכרט — חיבור 1'});await chrome.windows.create({url:ISRACARD_HOME,type:'popup',width:560,height:780,focused:true});return{ok:true,status:'waiting_login'}}await returnToDashboard(tab.id,true);await chrome.tabs.update(tab.id,{url:ISRACARD_HOME});await delay(1800);
  // ⚠ 18.08.2026 — לשונית על StatusPage **אינה הוכחה שהמשתמש מחובר**: זו בדיוק
  // הכתובת שנפתחת גם להתחברות, ו-isracardTab מסנן רק כתובות עם login/signin.
  // בלי הבדיקה הזו הסנכרון התחיל לפני שהמשתמש הקליד, לא מצא כרטיסים, ונכשל
  // אחרי 12 ניסיונות — „רשימת הכרטיסים לא נטענה". **דף אינו סשן עד שהוא מוכיח זאת.**
  // הגייט של ISRACARD_AUTHENTICATED כבר דורש שהרשימה מרונדרת, ולכן פשוט ממתינים לו.
  let ready=null;
  try{await prepareIsracard(tab.id);ready=await chrome.tabs.sendMessage(tab.id,{type:'ISRACARD_SUMMARY'})}catch{}
  if(!ready?.cards?.length){
    await chrome.storage.local.set({syncStatus:'ממתין להתחברות לישראכרט — התחבר בחלון שנפתח, והסנכרון יתחיל מעצמו'});
    return{ok:true,status:'waiting_login'};
  }
  try{const result=await runIsracard(tab.id);return{ok:true,status:'done',...result}}catch(e){await chrome.storage.local.set({syncStatus:`שגיאה בישראכרט: ${e.message}`});await chrome.runtime.openOptionsPage();throw e}}
async function runIsracard(tabId,attempts=40){await chrome.storage.local.set({syncStatus:'ישראכרט: קורא את רשימת הכרטיסים'});let summary=null;for(let attempt=0;attempt<attempts;attempt++){await prepareIsracard(tabId);try{summary=await chrome.tabs.sendMessage(tabId,{type:'ISRACARD_SUMMARY'})}catch{}if(summary?.cards?.length)break;await delay(750)}if(!summary?.ok||!summary.cards?.length){await saveIsracardMiss(tabId);throw Error('רשימת הכרטיסים לא נטענה לאחר המתנה');}const active=summary.cards.filter(c=>!c.cancelled),details=[];
  // הגלגל מציג את ארבע הספרות של הכרטיס הנקרא כרגע, לבקשת טל.
await beginProgress(active.length);
for(let i=0;i<active.length;i++){const card=active[i];await syncStep(`ישראכרט: קורא כרטיס ${i+1} מתוך ${active.length} · ${card.suffix}`,`כרטיס ${card.suffix}`);await chrome.tabs.update(tabId,{url:`https://web.isracard.co.il/transactions?cardSuffix=${encodeURIComponent(card.suffix)}`});await waitIsracardReady(tabId,card.suffix);let read={ok:true,transactions:[]};try{read=await chrome.tabs.sendMessage(tabId,{type:'ISRACARD_TRANSACTIONS_V3'})}catch{}
const nowDate=new Date(),previous=new Date(nowDate.getFullYear(),nowDate.getMonth(),1),monthAndYear=`${String(previous.getMonth()+1).padStart(2,'0')}.${previous.getFullYear()}`;await chrome.tabs.update(tabId,{url:`https://web.isracard.co.il/transactions?monthAndYear=${monthAndYear}&cardSuffix=${encodeURIComponent(card.suffix)}`});await delay(1400);await prepareIsracard(tabId);await chrome.tabs.sendMessage(tabId,{type:'ISRACARD_SELECT_MONTH_V3',month:monthAndYear});await waitIsracardReady(tabId,card.suffix,monthAndYear);let previousRead={total:0};try{previousRead=await chrome.tabs.sendMessage(tabId,{type:'ISRACARD_TRANSACTIONS_V3'})}catch{}details.push({...card,transactions:read?.transactions||[],previousCharge:Number(previousRead?.total)||0,previousChargeMonth:monthAndYear})}
await endProgress();
const state=await chrome.storage.local.get({accounts:[],isracardAssignments:{}}),accounts=state.accounts.map(a=>({...a,cards:[...(a.cards||[])]})),assigned=[],unassigned=[];
const normalized=v=>String(v||'').replace(/\D/g,'');
for(const card of details){let target=accounts.find(a=>(a.cards||[]).some(c=>normalized(c.suffix).endsWith(card.suffix)));const savedId=state.isracardAssignments[card.suffix];if(!target&&savedId)target=accounts.find(a=>a.id===savedId);
if(!target&&card.previousCharge>0){const candidates=accounts.filter(a=>(a.transactions||[]).some(t=>{const date=String(t.date||t.valueDate||t.transactionDate||''),bankAmount=Number(t.amount??t.debit??t.credit??0);return /(^|\D)10[.\/-]0?8(?:[.\/-]|$)/.test(date)&&Math.abs(Math.abs(bankAmount)-card.previousCharge)<.02}));if(candidates.length===1)target=candidates[0]}
if(!target){unassigned.push(card);continue}const index=target.cards.findIndex(c=>normalized(c.suffix).endsWith(card.suffix));if(index>=0){const old=target.cards[index];target.cards[index]={...old,...card,transactions:old.transactions?.length?old.transactions:card.transactions}}else target.cards.push(card);assigned.push({suffix:card.suffix,accountId:target.id})}
const now=new Date().toISOString();// כל סנכרון רגיל נשמר גם כחודש בהיסטוריה — כך היא נבנית מעצמה מהיום ואילך.
try{await storeCardMonth(mmYYYY(new Date()),details)}catch(e){}
await chrome.storage.local.set({accounts,isracardUnassigned:unassigned,isracardLastCards:details,syncStatus:`ישראכרט: הסנכרון הסתיים — נקראו ${details.length} כרטיסים, ${assigned.length} שויכו לחשבונות${unassigned.length?`, ${unassigned.length} ממתינים לשיוך`:''}`,lastAutoSync:now});if(!autoBusy)await chrome.runtime.openOptionsPage();return{cards:details.length,assigned:assigned.length,unassigned:unassigned.length}}
const CAL_HOME='https://digital-web.cal-online.co.il/dashboard',CAL_TX='https://digital-web.cal-online.co.il/transactions-all';
let calBusy=false;
// ⚠ כתובת הכניסה של כאל יושבת על digital-web — בדיוק המארח שמועדף כאן כסשן.
// בלי הסינון חלונית ההתחברות הייתה נבחרת כחיבור פעיל (תקלת דיסקונט, 0.75.1).
async function calTab(){const all=await chrome.tabs.query({url:['https://digital-web.cal-online.co.il/*','https://www.cal-online.co.il/*']});
const tabs=all.filter(t=>!/\/login\b/i.test(String(t.url||'')));
return tabs.find(t=>String(t.url||'').includes('digital-web.cal-online.co.il'))||tabs[0]||null}
async function prepareCal(tabId){await delay(600);try{const p=await chrome.tabs.sendMessage(tabId,{type:'CAL_PING'});if(p?.ok)return}catch{}await chrome.scripting.executeScript({target:{tabId},files:['cal-content.js']});await delay(300)}
async function startCal(suffix=''){suffix=String(suffix||'').replace(/\D/g,'').slice(-4);await chrome.storage.local.set({pendingCal:true,pendingCalSuffix:suffix,syncStatus:suffix?`כאל: מכין טעינת שנה לכרטיס ${suffix}`:'כאל: בודק את החיבור'});const tab=await calTab();if(!tab||!String(tab.url||'').includes('digital-web.cal-online.co.il')){await chrome.storage.local.set({syncStatus:suffix?`ממתין להתחברות לכאל עבור כרטיס ${suffix}`:'ממתין להתחברות לכאל'});if(tab)await chrome.tabs.update(tab.id,{url:'https://www.cal-online.co.il/',active:true});else await chrome.windows.create({url:CAL_LOGIN,type:'popup',width:560,height:780,focused:true});return{ok:true,status:'waiting_login'}}await returnToDashboard(tab.id,true);runCal(tab.id,suffix).catch(async e=>{await chrome.storage.local.set({pendingCal:false,pendingCalSuffix:'',syncStatus:`שגיאה בכאל: ${e.message}`});if(!autoBusy)await chrome.runtime.openOptionsPage()});return{ok:true,status:'syncing'}}
async function runCal(tabId,requestedSuffix=''){
  if(calBusy)return;calBusy=true;
  try{
    await chrome.storage.local.set({syncStatus:'כאל: קורא חיוב קרוב וחשבון חיוב'});let current=await chrome.tabs.get(tabId);if(!String(current.url||'').includes('digital-web.cal-online.co.il'))throw Error('החיבור לכאל אינו פעיל — יש להתחבר מחדש');await prepareCal(tabId);if(!String(current.url||'').includes('/dashboard')){const go=await chrome.tabs.sendMessage(tabId,{type:'CAL_GO_HOME'});if(!go?.ok)throw Error('לא נמצא קישור דף הבית בכאל');await waitTab(tabId,'/dashboard');await prepareCal(tabId)}await delay(1200);
    const hr=await chrome.tabs.sendMessage(tabId,{type:'CAL_HOME'});if(!hr?.ok)throw Error('דף הבית של כאל לא נקרא');const home=hr.data||{};
    await chrome.storage.local.set({syncStatus:'כאל: פותח עסקאות לפי מועד חיוב'});const opened=await chrome.tabs.sendMessage(tabId,{type:'CAL_OPEN_MONTHLY'});if(!opened?.ok)throw Error('לא נמצא המסלול עסקאות בכרטיס לפי מועד חיוב');for(let w=0;w<30;w++){current=await chrome.tabs.get(tabId);if(new URL(current.url).pathname==='/transactions')break;await delay(300)}current=await chrome.tabs.get(tabId);if(new URL(current.url).pathname!=='/transactions')throw Error('דף העסקאות החודשי של כאל לא נפתח');await prepareCal(tabId);await delay(1800);
    const wanted=String(requestedSuffix||'').replace(/\D/g,'').slice(-4),monthly=[],seenMonths=new Set();let previous='';
    for(let i=0;i<12;i++){let page=null,candidate='',stable=0;for(let wait=0;wait<25;wait++){await prepareCal(tabId);try{page=await chrome.tabs.sendMessage(tabId,{type:'CAL_MONTHLY_READ'})}catch{}const ready=page?.ok&&page.month&&!seenMonths.has(page.month)&&page.fingerprint!==previous;if(ready&&page.fingerprint===candidate)stable++;else{candidate=ready?page.fingerprint:'';stable=ready?1:0}if(stable>=3)break;await delay(400)}if(!page?.ok||!page.month||seenMonths.has(page.month)||stable<3)break;if(wanted&&page.suffix&&page.suffix!==wanted)throw Error(`הכרטיס הפעיל בכאל הוא ${page.suffix}, ולא ${wanted}`);const suffix=wanted||page.suffix||home.suffix;if(!suffix)throw Error('מספר הכרטיס הפעיל לא זוהה בדף החודשי');const card={suffix,name:'כרטיס כאל',issuer:'כאל',amount:page.total,chargeDate:page.chargeDate,transactions:page.transactions||[],debitAccount:home.debitAccount||'',month:page.month};await storeCardMonth(page.month,[card]);monthly.push(card);seenMonths.add(page.month);previous=page.fingerprint;await chrome.storage.local.set({syncStatus:`כאל: נשמר חודש ${i+1} מתוך 12 · ${page.month} · ${card.transactions.length} תנועות`});if(!page.canPrev||i===11)break;const moved=await chrome.tabs.sendMessage(tabId,{type:'CAL_MONTHLY_PREV'});if(!moved?.ok)break;await delay(1800)}
    // כל החודשים כבר נשמרו בנפרד ב-IndexedDB. בכרטיס החיוב הקרוב מציגים רק
    // את דף החיוב הנוכחי; איחוד כל העסקאות כאן גרם לכל השנה להיראות כחודש אחד.
    if(!monthly.length)throw Error('לא נקראו דפי חיוב חודשיים מכאל');const details=[{...monthly[0],amount:home.amount??monthly[0].amount,chargeDate:home.chargeDate||monthly[0].chargeDate,transactions:monthly[0].transactions||[]}];
    const state=await chrome.storage.local.get({accounts:[]}),accounts=state.accounts.map(a=>({...a,cards:[...(a.cards||[])]})),unassigned=[],digits=v=>String(v||'').replace(/\D/g,'');let assigned=0;
    for(const card of details){let target=accounts.find(a=>(a.cards||[]).some(c=>digits(c.suffix).endsWith(card.suffix)));if(!target&&home.debitAccount){const wanted=digits(home.debitAccount);const matches=accounts.filter(a=>wanted.endsWith(digits(a.accountNumber))||digits(a.accountNumber).endsWith(wanted));if(matches.length===1)target=matches[0]}if(!target){unassigned.push(card);continue}const index=target.cards.findIndex(c=>digits(c.suffix).endsWith(card.suffix));if(index>=0)target.cards[index]={...target.cards[index],...card};else target.cards.push(card);assigned++}
    const now=new Date().toISOString(),savedCal=await chrome.storage.local.get({calLastCards:[],calUnassigned:[]}),merge=(oldRows,newRows)=>{const by=new Map((oldRows||[]).map(c=>[String(c.suffix),c]));for(const c of newRows)by.set(String(c.suffix),c);return[...by.values()]},monthCount=monthly.length;autoLoginRuns.set(`cal|${tabId}`,Date.now());await chrome.storage.local.set({accounts,calLastCards:merge(savedCal.calLastCards,details),calUnassigned:merge(savedCal.calUnassigned,unassigned),pendingCal:false,pendingCalSuffix:'',syncStatus:`כאל: הסנכרון הסתיים — ${details.length} כרטיסים, ${monthCount} דפי חיוב חודשיים נשמרו, ${assigned} שויכו לחשבונות${unassigned.length?`, ${unassigned.length} ממתינים לשיוך`:''}`,lastAutoSync:now});if(!autoBusy)await chrome.runtime.openOptionsPage();return{cards:details.length,months:monthCount,assigned,unassigned:unassigned.length}
  }finally{calBusy=false;await restoreSyncTabs()}
}
const MAX_TX='https://www.max.co.il/transaction-details/personal';
let maxBusy=false;
// ⚠ אותו שיקול: www.max.co.il/login נמצא בטווח השאילתה, ו-tabs[0] היה בוחר אותו.
async function maxTab(){const all=await chrome.tabs.query({url:['https://www.max.co.il/*','https://online.max.co.il/*']});
const tabs=all.filter(t=>!/\/login\b/i.test(String(t.url||'')));
return tabs.find(t=>String(t.url||'').includes('/transaction-details/personal'))||tabs[0]||null}
async function prepareMax(tabId){await delay(500);try{const p=await chrome.tabs.sendMessage(tabId,{type:'MAX_PING'});if(p?.ok)return}catch{}await chrome.scripting.executeScript({target:{tabId},files:['max-content.js']});await delay(250)}
async function startMax(suffix=''){suffix=String(suffix||'').replace(/\D/g,'').slice(-4);await chrome.storage.local.set({pendingMax:true,pendingMaxSuffix:suffix,syncStatus:suffix?`MAX: מכין טעינת שנה לכרטיס ${suffix}`:'MAX: בודק את החיבור'});const tab=await maxTab();if(!tab){await chrome.storage.local.set({syncStatus:'ממתין להתחברות ל‑MAX'});await chrome.windows.create({url:MAX_LOGIN,type:'popup',width:560,height:780,focused:true});return{ok:true,status:'waiting_login'}}await returnToDashboard(tab.id,true);runMax(tab.id,suffix).catch(async e=>{await chrome.storage.local.set({pendingMax:false,pendingMaxSuffix:'',syncStatus:`שגיאה ב‑MAX: ${e.message}`});if(!autoBusy)await chrome.runtime.openOptionsPage()});return{ok:true,status:'syncing'}}
async function runMax(tabId,requestedSuffix=''){
 if(maxBusy)return;maxBusy=true;
 try{
  await chrome.storage.local.set({syncStatus:'MAX: פותח פירוט חיובים'});let tab=await chrome.tabs.get(tabId);if(!String(tab.url||'').includes('/transaction-details/personal')){await chrome.tabs.update(tabId,{url:MAX_TX});for(let i=0;i<40;i++){await delay(300);tab=await chrome.tabs.get(tabId);if(String(tab.url||'').includes('/transaction-details/personal'))break}}
  await delay(1700);await prepareMax(tabId);const he=['ינואר','פברואר','מרץ','אפריל','מאי','יוני','יולי','אוגוסט','ספטמבר','אוקטובר','נובמבר','דצמבר'],wanted=String(requestedSuffix||'').replace(/\D/g,'').slice(-4),monthly=[],seen=new Set();
  const months=Array.from({length:13},(x,i)=>{const d=new Date();d.setDate(1);d.setMonth(d.getMonth()+1-i);return{label:`${he[d.getMonth()]} ${d.getFullYear()}`,key:`${String(d.getMonth()+1).padStart(2,'0')}.${d.getFullYear()}`,optional:i===0}});let firstRead=null;
  for(let i=0;i<months.length;i++){const {label,key,optional}=months[i];await chrome.storage.local.set({syncStatus:`MAX: טוען ${key}${optional?' — בודק אם החודש הבא קיים':''}`});const sel=await chrome.tabs.sendMessage(tabId,{type:'MAX_SELECT_MONTH',label});if(!sel?.ok){if(optional)continue;if(!firstRead)throw Error(sel?.error||'בורר החודשים לא נטען');break}let page=null,candidate='',stable=0;for(let w=0;w<30;w++){await delay(350);await prepareMax(tabId);try{page=await chrome.tabs.sendMessage(tabId,{type:'MAX_READ'})}catch{}const ready=page?.ok&&page.month===key&&page.fingerprint;if(ready&&candidate===page.fingerprint)stable++;else{candidate=ready?page.fingerprint:'';stable=ready?1:0}if(stable>=3)break}if(!page?.ok||page.month!==key||stable<3){if(optional)continue;throw Error(`דף ${key} לא התייצב לקריאה`)}if(seen.has(key)){if(optional)continue;throw Error(`MAX נשאר בחודש ${key}`)}seen.add(key);if(!firstRead)firstRead={label,key};const groups=Object.entries(page.cards||{}).filter(([suffix])=>suffix&&suffix!=='unknown'&&(!wanted||suffix===wanted)),cards=groups.map(([suffix,transactions])=>({suffix,name:'כרטיס MAX',issuer:'MAX',amount:transactions.reduce((s,t)=>s+Math.abs(Number(t.amount)||0),0),transactions,month:key}));if(wanted&&!cards.length&&page.transactions?.length)throw Error(`כרטיס ${wanted} לא נמצא בדף ${key}`);if(cards.length){await storeCardMonth(key,cards);monthly.push(...cards)}
  }
  if(!monthly.length)throw Error('לא נקראו עסקאות חודשיות מ‑MAX');const latestBySuffix=new Map();for(const c of monthly)if(!latestBySuffix.has(c.suffix))latestBySuffix.set(c.suffix,c);const nowLabel=firstRead.label,nowKey=firstRead.key;await chrome.storage.local.set({syncStatus:`MAX: החיוב הקרוב — ${nowLabel}`});await chrome.tabs.sendMessage(tabId,{type:'MAX_SELECT_MONTH',label:nowLabel});await delay(1800);await prepareMax(tabId);let currentPage=await chrome.tabs.sendMessage(tabId,{type:'MAX_READ'});if(!currentPage?.ok||currentPage.month!==nowKey)currentPage={ok:true,month:nowKey,total:0,cards:{}};const details=[...latestBySuffix.keys()].map(suffix=>{const transactions=currentPage.cards?.[suffix]||[],onlyCard=latestBySuffix.size===1,amount=onlyCard&&Number.isFinite(Number(currentPage.total))?Number(currentPage.total):transactions.reduce((s,t)=>s+Math.abs(Number(t.amount)||0),0);return{...latestBySuffix.get(suffix),amount,transactions,month:currentPage.month}}),state=await chrome.storage.local.get({accounts:[],maxLastCards:[]}),accounts=state.accounts.map(a=>({...a,cards:[...(a.cards||[])]})),unassigned=[];let assigned=0;const digits=v=>String(v||'').replace(/\D/g,'');
  for(const card of details){const target=accounts.find(a=>(a.cards||[]).some(c=>digits(c.suffix).endsWith(card.suffix)));if(!target){unassigned.push(card);continue}const index=target.cards.findIndex(c=>digits(c.suffix).endsWith(card.suffix));if(index>=0)target.cards[index]={...target.cards[index],...card};else target.cards.push(card);assigned++}
  const merge=(oldRows,newRows)=>{const by=new Map((oldRows||[]).map(c=>[String(c.suffix),c]));for(const c of newRows)by.set(String(c.suffix),c);return[...by.values()]};autoLoginRuns.set(`max|${tabId}`,Date.now());await chrome.storage.local.set({accounts,maxLastCards:merge(state.maxLastCards,details),maxUnassigned:unassigned,pendingMax:false,pendingMaxSuffix:'',syncStatus:`MAX: הסנכרון הסתיים — ${details.length} כרטיסים, ${seen.size} דפי חיוב חודשיים נשמרו, ${assigned} שויכו לחשבונות${unassigned.length?`, ${unassigned.length} ממתינים לשיוך`:''}`,lastAutoSync:new Date().toISOString()});if(!autoBusy)await chrome.runtime.openOptionsPage();return{cards:details.length,months:seen.size,assigned,unassigned:unassigned.length}
 }finally{maxBusy=false;await restoreSyncTabs()}
}
async function startDiscountBusiness(){const saved=await chrome.storage.local.get({discoveredAccounts:[]});
// לחיצה ידנית היא התחלה חדשה. קודם נשארו discountLastRun/discountAttempts מהריצה
// הקודמת, ולכן הלחיצה החזירה "discovering" אף שהזיהוי נבלם בצינון והבורר לא הופיע.
discountLastRun=0;
// לא מוחקים את הטבלה הקודמת בתחילת הזיהוי. היא מוחלפת רק אחרי שהבנק החזיר
// רשימת ישויות חדשה, ולכן כשל או עיכוב לא משאירים מסך ריק.
await chrome.storage.local.set({pendingDiscountBusiness:true,discountAttempts:0,syncStatus:'דיסקונט עסקי: מזהה ישויות וחשבונות — הרשימה הקודמת נשמרת עד לעדכון'});const tab=await discountTab();if(tab){await returnToDashboard(tab.id,true);await prepareDiscountContent(tab.id);await discoverDiscountBusiness(tab.id);return{ok:true,status:'discovering'}}await chrome.storage.local.set({syncStatus:'ממתין להתחברות לדיסקונט עסקי'});await chrome.windows.create({url:DISCOUNT_LOGIN_BUSINESS,type:'popup',width:560,height:780,focused:true});return{ok:true,status:'waiting_login'}}
// שלושת השומרים של לאומי, מועתקים במכוון: נעילה, צינון ותקרת ניסיונות.
let discountBusy=false,discountLastRun=0;
const DISCOUNT_MAX_ATTEMPTS=3,DISCOUNT_COOLDOWN_MS=30000;
// מסכי הכניסה של דיסקונט. נמדדו 17.08.2026 מתוך ה-href של „כניסה לחשבון" באתר:
// קישור רגיל, בלי מודאל ובלי לחיצה — רק לנווט. הדף מרנדר #tzId · #tzPassword · #aidnum.
// ⚠ העסקי הוא **t=s** ולא t=b. ניחוש סביר היה שולח את המשתמש לדף הלא נכון.
const DISCOUNT_LOGIN_PRIVATE='https://start.telebank.co.il/login/?multilang=he&bank=d&t=p';
const DISCOUNT_LOGIN_BUSINESS='https://start.telebank.co.il/login/?multilang=he&bank=d&t=s';
async function discoverDiscountBusiness(tabId){const state=await chrome.storage.local.get({pendingDiscountBusiness:false,discoveredAccounts:[],discountAttempts:0});if(!state.pendingDiscountBusiness)return;
if(discountBusy)return;
if(running){await chrome.storage.local.set({syncStatus:'דיסקונט: סנכרון כבר רץ — הזיהוי ימתין לסיומו'});return}
if(Date.now()-discountLastRun<DISCOUNT_COOLDOWN_MS)return;
if(state.discountAttempts>=DISCOUNT_MAX_ATTEMPTS){await chrome.storage.local.set({pendingDiscountBusiness:false,discountAttempts:0,syncStatus:`דיסקונט עסקי: ${DISCOUNT_MAX_ATTEMPTS} ניסיונות נכשלו — נעצר כדי לא להיכנס ללולאה. התחבר ידנית והפעל שוב.`});await chrome.runtime.openOptionsPage();return}
discountBusy=true;discountLastRun=Date.now();
await chrome.storage.local.set({discountAttempts:state.discountAttempts+1});
try{return await runDiscoverDiscount(tabId,state)}finally{discountBusy=false;await restoreSyncTabs()}}
async function runDiscoverDiscount(tabId,state){await prepareDiscountContent(tabId);const r=await withTimeout(chrome.tabs.sendMessage(tabId,{type:'DISCOUNT_DISCOVER'}),120000,'זיהוי הישויות');
// שומרים את צילום המצב לפני שזורקים, כדי שהתיקון הבא ייכתב ממדידה ולא מהשערה.
if(r?.probe)await chrome.storage.local.set({discountProbe:r.probe});
if(!r?.ok)throw Error(r?.error||'זיהוי החשבונות נכשל');const raw=r.accounts||[];
// מציגים את כל הישויות מיד. בשלב הזה אין קריאת יתרות/תנועות/הלוואות — רק שמות
// הישויות, ובהמשך מספרי החשבון מתמלאים שורה-שורה.
const otherBanks=state.discoveredAccounts.filter(a=>a.source!=='discount-business');
const asChoice=a=>({...a,balance:null,source:'discount-business',sourceLabel:'דיסקונט עסקי',key:`discount-business|${a.key}`,identifying:!(a.branch&&a.accountNumber)});
await chrome.storage.local.set({discoveredAccounts:[...otherBanks,...raw.map(asChoice)],syncStatus:`דיסקונט עסקי: נמצאו ${raw.length} ישויות — מזהה מספרי חשבון בלבד`});
await chrome.runtime.openOptionsPage();
for(let i=0;i<raw.length;i++){const a=raw[i],want=a.entityId||a.key;await chrome.storage.local.set({syncStatus:`דיסקונט עסקי: מזהה מספר חשבון ${i+1} מתוך ${raw.length}`});if(a.branch&&a.accountNumber)continue;
// מעבר ישות הוא SPA ולעיתים ההודעה הראשונה חוזרת לפני שהכותרת ומספר החשבון
// התחלפו. מנסים פעמיים ומאמתים גם את הישות וגם מספר חשבון בן 10 ספרות.
for(let pass=1;pass<=2&&!a.accountNumber;pass++){await prepareDiscountContent(tabId);try{await withTimeout(chrome.tabs.sendMessage(tabId,{type:'DISCOUNT_SELECT_ENTITY',entity:want}),20000,`מעבר ישות ${pass}`)}catch(e){}
for(let w=0;w<20;w++){await delay(1000);await prepareDiscountContent(tabId);let st=null;try{st=await withTimeout(chrome.tabs.sendMessage(tabId,{type:'DISCOUNT_STATE'}),10000,'קריאת מספר חשבון')}catch(e){}if(st?.entity===want&&st?.branch&&st?.accountNumber){a.branch=st.branch;a.accountNumber=st.accountNumber;a.owner=st.owner||a.owner;a.nickname=st.owner||a.nickname;break}}}
// מעדכנים את השורה מיד, בלי להמתין לשאר הישויות.
const live=await chrome.storage.local.get({discoveredAccounts:[]});await chrome.storage.local.set({discoveredAccounts:live.discoveredAccounts.map(x=>x.key===`discount-business|${a.key}`?asChoice(a):x)});}
const missing=raw.filter(a=>!a.branch||!a.accountNumber);if(missing.length)throw Error(`זוהו ${raw.length} ישויות, אך מספר החשבון טרם נטען עבור ${missing.map(a=>a.owner||a.entityId).join(', ')} — הרשימה החלקית לא הוצגה`);
const found=raw.map(asChoice);await chrome.storage.local.set({pendingDiscountBusiness:false,discountAttempts:0,discoveredAccounts:[...otherBanks,...found],syncStatus:`דיסקונט עסקי: נמצאו ואומתו ${found.length} חשבונות — בחר לפי מספר חשבון`})}
const DISCOUNT_TX_URL='https://start.telebank.co.il/apollo/business2/#/OSH_LENTRIES_ALTAMIRA';
const DISCOUNT_LOANS_URL='https://start.telebank.co.il/apollo/business2/#/LOANS_WORLD';
async function syncDiscountBusiness(keys){const tab=await discountTab();if(!tab)throw Error('החיבור לדיסקונט עסקי אינו פעיל');await returnToDashboard(tab.id,true);const all=await chrome.tabs.query({url:['https://start.telebank.co.il/*']});await chrome.storage.local.set({syncStatus:`דיסקונט עסקי: עובד בלשונית ${tab.id}${all.length>1?` (מתוך ${all.length} פתוחות)`:''}`});
// ⚠ מעבר בין ישויות טוען מחדש את הדף והורג את ה-content script. לכן ישות אחת בכל
// קריאה, עם הזרקה מחדש ביניהן — במקום לולאה אחת שנקטעת באמצע ('message channel closed').
const out=[],now=new Date().toISOString();
for(let i=0;i<keys.length;i++){const key=keys[i];
await chrome.storage.local.set({syncStatus:`דיסקונט עסקי: קורא ישות ${i+1} מתוך ${keys.length}`});
await prepareDiscountContent(tab.id);
// ⚠ הסדר קריטי: בוחרים ישות, ורק אחר כך מנווטים לתנועות. מעבר ישות טוען מחדש את הדף
// ומחזיר לדף הבית, ולכן ניווט שקודם לבחירה נמחק על ידה — וזה מה שקרה בכל הריצות.
// כל שלב מנוהל מהרקע, עם המתנה והזרקה מחדש, כי כל ניווט הורג את ה-content script.
await chrome.storage.local.set({syncStatus:`דיסקונט עסקי: עובר לישות ${key}`});
try{await withTimeout(chrome.tabs.sendMessage(tab.id,{type:'DISCOUNT_SELECT_ENTITY',entity:key}),20000,'מעבר ישות')}catch(e){}
for(let w=0;w<12;w++){await delay(2000);await prepareDiscountContent(tab.id);
let st=null;try{st=await withTimeout(chrome.tabs.sendMessage(tab.id,{type:'DISCOUNT_STATE'}),15000,'מצב')}catch(e){}
if(st?.entity===key)break}
await chrome.storage.local.set({syncStatus:`דיסקונט עסקי: פותח תנועות (${key})`});
// ⚠ ניווט ישיר לנתיב במקום חיפוש קישור ולחיצה. הנתיב נמדד בדפדפן והחזיר 32 תנועות,
// ושינוי hash מנתב את Angular בלי לטעון מחדש — כלומר ה-content script שורד.
try{await chrome.tabs.update(tab.id,{url:DISCOUNT_TX_URL})}catch(e){}
await delay(2500);
try{await withTimeout(chrome.tabs.sendMessage(tab.id,{type:'DISCOUNT_GOTO_TX'}),20000,'מעבר לתנועות')}catch(e){}
for(let w=0;w<12;w++){await delay(2000);await prepareDiscountContent(tab.id);
let st=null;try{st=await withTimeout(chrome.tabs.sendMessage(tab.id,{type:'DISCOUNT_STATE'}),15000,'מצב')}catch(e){}
if(st?.rows>0)break}
let r=null,lastErr='',lastProbe=null;
for(let attempt=1;attempt<=3;attempt++){
// ⚠ שומרים את הצילום לפני איפוס r, אחרת האבחון של הניסיון הכושל נמחק ואי אפשר לדעת למה נכשל.
try{r=await withTimeout(chrome.tabs.sendMessage(tab.id,{type:'DISCOUNT_SYNC_SELECTED',keys:[key]}),90000,'קריאת התנועות');if(r?.probe)lastProbe=r.probe;if(r?.ok)break;lastErr=r?.error||'קריאה ריקה'}
catch(e){lastErr=e.message;await prepareDiscountContent(tab.id)}
r=null}
if(lastProbe)await chrome.storage.local.set({discountTxProbe:lastProbe});
if(!r?.ok)throw Error(`ישות ${key} נכשלה אחרי 3 ניסיונות: ${lastErr}`);
await chrome.storage.local.set({syncStatus:`דיסקונט עסקי: קורא מסגרת אשראי והלוואות (${key})`});
// הנתיב נמדד בדף החי. ניווט ישיר אמין יותר מלחיצה על תפריט Angular שנפתח רק
// בחלק מן הפריסות, ושבכשל השאיר אותנו בדף התנועות עם אפס הלוואות.
try{await chrome.tabs.update(tab.id,{url:DISCOUNT_LOANS_URL})}catch(e){}
let loanState=null;for(let w=0;w<20;w++){await delay(1500);await prepareDiscountContent(tab.id);try{loanState=await withTimeout(chrome.tabs.sendMessage(tab.id,{type:'DISCOUNT_LOAN_STATE'}),10000,'מצב הלוואות')}catch(e){}if(loanState?.url?.includes('LOANS_WORLD')&&loanState?.loanCount>0)break}
let loanResult={ok:true,loans:[]};try{loanResult=await withTimeout(chrome.tabs.sendMessage(tab.id,{type:'DISCOUNT_READ_LOANS'}),30000,'קריאת הלוואות')}catch(e){loanResult={ok:false,loans:[],error:e.message}}
await chrome.storage.local.set({discountLoanProbe:loanResult?.probe||loanState,discountLoanError:loanResult?.ok?'':loanResult?.error||''});
for(const a of r.accounts||[])out.push({...a,loans:loanResult?.ok?(loanResult.loans||[]):[],source:'discount-business',sourceLabel:'דיסקונט עסקי',selectionKey:`discount-business|${a.entityId}`,id:`discount-business-${a.entityId}`,lastSync:now,status:loanResult?.ok?'מסונכרן':'מסונכרן ללא פירוט הלוואות'})}
if(out.length!==keys.length)throw Error(`נקראו ${out.length} ישויות מתוך ${keys.length}`);
return out}
