importScripts('cheque-store.js','card-history.js','yahav.js');

// ═════════ תשתית יציבות — 28.08.2026, לפי AUDIT.md ═════════
// סעיף 3: גרסת נתונים. כל שינוי מבנה עתידי מקבל כאן בלוק מיגרציה מפורש.
// גרסה שהקוד אינו מכיר — נעצרת ואומרת, לא מנחשת.
const DATA_VERSION=2;
async function migrateData(){try{
  const st=await chrome.storage.local.get({dataVersion:0});
  if(st.dataVersion===DATA_VERSION)return;
  if(st.dataVersion>DATA_VERSION){await chrome.storage.local.set({syncStatus:
    `הנתונים נכתבו על ידי גרסה חדשה יותר (v${st.dataVersion}) — עדכן את התוסף לפני סנכרון`});return}
  // v0/v1 -> v2: אין שינוי מבנה, רק החתמה. הרשומות הקיימות תקינות כמו שהן.
  await chrome.storage.local.set({dataVersion:DATA_VERSION});
}catch(e){}}
migrateData();

// סעיף 2: מנעול כתיבה גלובלי על accounts. 12 אתרי קרא-שנה-כתוב רצו בלי
// סנכרון ביניהם, והאחרון דרס את קודמיו בשקט. כל חלון RMW עובר עכשיו כאן.
// ⚠ המנעול על **חלון הקריאה-כתיבה בלבד**, לא על סנכרון שלם (דקות) —
// אחרת stashLeumi שבתוך syncLeumi היה נתקע על עצמו.
const accountsMutex=(()=>{let q=Promise.resolve();
  return fn=>{const r=q.then(fn,fn);q=r.then(()=>{},()=>{});return r}})();

// סעיף 6: catch ריק משתיק — אבל דחייה לא-מטופלת לא תיעלם יותר.
// נשמרות 20 האחרונות בלבד, כדי לא ליצור בעצמנו גידול בלתי מוגבל (סעיף 4).
async function logWorkerError(kind,message){try{
  const st=await chrome.storage.local.get({workerErrors:[]});
  await chrome.storage.local.set({workerErrors:[...(st.workerErrors||[]),
    {at:new Date().toISOString(),kind,message:String(message||'').slice(0,200)}].slice(-20)});
}catch(e){}}
self.addEventListener('unhandledrejection',e=>{logWorkerError('unhandledrejection',e?.reason?.message||e?.reason)});
self.addEventListener('error',e=>{logWorkerError('error',e?.message||e)});

// סעיף 4: מפתחות האבחון של מקור נמחקים בתחילת הסנכרון שלו. רשומת אבחון
// ישנה שנשארת מתחזה לממצא טרי — זה בדיוק מה שקרה עם "message channel
// closed" של דיסקונט מ-18.08 שבלבל את האבחון עשרה ימים אחר כך.
const SOURCE_DIAG_KEYS={
  leumi:['leumiDebug','leumiAttempts','leumiLoanAttempts','leumiTiming','leumiChequeReport',
    'leumiChequeWindows','leumiRangeApplied','leumiDelta','leumiRejectedOptions','leumiLoanMismatch',
    'leumiLoanDuplicate','leumiLoadRows','leumiGap','leumiBfcache','leumiRangeProbe','leumiDateMenu',
    'leumiRadios','leumiGridProbe','leumiAccountMatch','chequeError'],
  btb:['btbProbe'],fibi:['fibiPages'],mizrahi:['mizrahiRangeProbe'],discount:['discountTabNote'],
};
async function clearSourceDiags(source){try{await chrome.storage.local.remove(SOURCE_DIAG_KEYS[source]||[])}catch(e){}}

// סעיף 9: מצב הסנכרון חי בזיכרון ה-worker ומת איתו — ריצה שנקטעה השאירה
// "בתהליך" קפוא לנצח. דגל באחסון + אזעקה הופכים מוות שקט להודעה.
async function markSyncInFlight(on,what){try{
  if(on){await chrome.storage.local.set({syncInFlight:{at:Date.now(),what:String(what||'')}});
    chrome.alarms?.create('syncWatch',{periodInMinutes:1});}
  else{await chrome.storage.local.remove('syncInFlight');chrome.alarms?.clear('syncWatch');}
}catch(e){}}
chrome.alarms?.onAlarm.addListener(async a=>{if(a.name!=='syncWatch')return;
  try{const st=await chrome.storage.local.get({syncInFlight:null});
    if(!st.syncInFlight){chrome.alarms.clear('syncWatch');return}
    // ⚠ 20 דקות — מעל כל תקציב קיים. מעבר לזה הריצה מתה בלי לדווח.
    if(Date.now()-st.syncInFlight.at>20*60*1000){
      await chrome.storage.local.set({syncStatus:
        `הסנכרון (${st.syncInFlight.what}) נקטע — תהליך הרקע הופסק באמצע. מה שנשמר עד הקטיעה נשאר; הרץ שוב.`});
      await chrome.storage.local.remove('syncInFlight');chrome.alarms.clear('syncWatch');}
  }catch(e){}});
// עליית worker כשהדגל דלוק ועתיק => הריצה הקודמת מתה בלי finally.
(async()=>{try{const st=await chrome.storage.local.get({syncInFlight:null});
  if(st.syncInFlight&&Date.now()-st.syncInFlight.at>90*1000){
    await chrome.storage.local.set({syncStatus:
      `הסנכרון (${st.syncInFlight.what}) נקטע — תהליך הרקע אותחל באמצע. מה שנשמר נשאר; הרץ שוב.`});
    await chrome.storage.local.remove('syncInFlight');}}catch(e){}})();
// ═════════ סוף תשתית ═════════

// התקנה או עדכון מבטלים תהליך חלקי ומנקים בורר זמני ישן. במהלך זיהוי פעיל
// הרשימה נשמרת; היא אינה אמורה לחזור לאחר רענון או בזמן חיבור לבנק אחר.
// ⚠ 18.08.2026 — `pendingSources` נוסף לאיפוס. discover מסירה ממנו בנק **רק בהצלחה**
// (§ההערה בשורה ~228), ולכן סנכרון שנקטע השאיר אותו תקוע לצמיתות — וגם הפעלה מחדש
// של הדפדפן לא ניקתה אותו. במצב הזה handleAuthenticatedNavigation נכנס למסלול
// queueDiscover, **שאינו בודק את autoSyncOnLogin ואף צינון**, וכל כניסה לפועלים נחטפה.
// ⚠⚠ 25.08.2026 — טל: „לא מופיע חשבונות הבנק לסנכרון." **השורש כאן.**
// `onInstalled` יורה עם `reason:'update'` **בכל ⟳ של תוסף unpacked**,
// ולכן כל רענון מחק את רשימת החשבונות לבחירה. ביום אחד עם כמה גרסאות
// זה אומר לזהות מחדש שוב ושוב — וזיהוי דורש סשן חי בבנק.
// **ההפרדה:** הדגלים נוקו מסיבה טובה (תהליך חלקי שנקטע, `pendingSources`
// תקוע שגרם לחטיפת לשוניות ב-18.08) — **הם ממשיכים להתנקות תמיד.**
// אבל `discoveredAccounts` היא רשימת בחירה, לא תהליך.
// ⚠ היא כן נמחקת ב**התקנה** וב**הפעלה מחדש של הדפדפן** — שם באמת אין
// סשן חי מאחוריה. ברענון תוסף הדפדפן ממשיך לרוץ ולשונית הבנק עדיין
// מחוברת, ולכן הרשימה תקפה.
const freshFlags={pendingIsracard:false,pendingIsracardAt:0,pendingLeumi:false,pendingDiscountBusiness:false,pendingDiscountPrivate:false,pendingMizrahi:false,pendingYahav:false,leumiAttempts:0,leumiOptionProbe:null,pendingSources:[]};
const freshStart={...freshFlags,discoveredAccounts:[]};
// ⚠ 18.08.2026, החלטת טל: הסנכרון האוטומטי **כבוי בברירת מחדל**, ונדלק רק בלחיצה.
// הכניסה לבנק שייכת למשתמש; התוסף אינו לוקח לשונית שהוא לא פתח בלי בקשה מפורשת.
// המעבר מוחל פעם אחת גם על התקנות קיימות — בלעדיו הערך `true` שכבר שמור גובר.
// ⚠⚠ 25.08.2026 — **מיגרציה חד-פעמית: נרמול סדר התנועות השמורות.**
// טל: „לא מחקתי, רק סינכרנתי." והסנכרון סיים ב„אין תנועות חדשות" —
// כלומר **כל החשבונות דולגו**, `extract` לא רץ, ו-`orderedAscending`
// (1.10.7) לא נגע בהם. **הדילוג מונע בדיוק את הקריאה שהייתה מתקנת.**
// מחיקת החשבונות והסנכרון מחדש הייתה עובדת — אבל היא יקרה ומיותרת:
// אותה בדיקה עצמה יכולה לרוץ על מה שכבר שמור.
// ⚠ הכיוון נקבע לפי **שרשרת היתרה, שמאמתת את עצמה** — בסדר הנכון
// מתקיים `balance[i]-balance[i-1] == credit-debit`. **לא לפי תאריכים.**
// ⚠ **הופכים רק כשהציון ההפוך טוב ממש**, לא בשוויון. חשבון שכבר
// תקין, או שאי אפשר להכריע לגביו, נשאר בדיוק כפי שהוא.
// ⚠ דגל משלה (`rowOrderNormalizedApplied`) — התקדים הוא
// `autoSyncDefaultOffApplied`: מיגרציה בלי דגל תרוץ שוב בכל טעינה.
function chainScoreOf(rows){
  let good=0;
  for(let i=1;i<rows.length;i++){
    const p=rows[i-1],c=rows[i];
    if(p?.balance==null||c?.balance==null)continue;
    const delta=Math.round((Number(c.balance)-Number(p.balance))*100)/100;
    const move=Math.round(((Number(c.credit)||0)-(Number(c.debit)||0))*100)/100;
    if(Math.abs(delta-move)<0.011)good++;
  }
  return good;
}
async function normalizeStoredRowOrder(){
  const st=await chrome.storage.local.get({rowOrderNormalizedApplied:false,accounts:[]});
  if(st.rowOrderNormalizedApplied)return;
  const report=[];let changed=false;
  const accounts=(st.accounts||[]).map(a=>{
    const tx=Array.isArray(a?.transactions)?a.transactions:null;
    if(!tx||tx.length<3)return a;
    const fwd=chainScoreOf(tx),rev=chainScoreOf(tx.slice().reverse());
    report.push({id:a.id||a.selectionKey||'',n:tx.length,forward:fwd,reversed:rev,flipped:rev>fwd});
    if(rev<=fwd)return a;
    changed=true;
    return{...a,transactions:tx.slice().reverse()};
  });
  const patch={rowOrderNormalizedApplied:true,
    rowOrderMigration:{at:new Date().toISOString(),changed,accounts:report}};
  if(changed)patch.accounts=accounts;
  await chrome.storage.local.set(patch);
}
async function applyAutoSyncDefaultOff(){
  const st=await chrome.storage.local.get({autoSyncDefaultOffApplied:false});
  if(st.autoSyncDefaultOffApplied)return;
  await chrome.storage.local.set({autoSyncOnLogin:false,autoSyncDefaultOffApplied:true});
}
chrome.runtime.onInstalled.addListener(details=>{
  // עדכון/רענון: הדגלים בלבד. התקנה: גם הרשימה, וגם סנכרון אוטומטי כבוי.
  const patch=details?.reason==='update'?{...freshFlags}:{...freshStart};
  if(details?.reason==='install')patch.autoSyncOnLogin=false;
  chrome.storage.local.set(patch).then(applyAutoSyncDefaultOff).then(normalizeStoredRowOrder).then(scanAuthenticatedTabs)});
chrome.runtime.onStartup.addListener(()=>{openedByExtension.clear();openedParent.clear();chrome.storage.local.set({...freshStart,openedTabs:{}}).then(normalizeStoredRowOrder).then(scanAuthenticatedTabs)});

// ── חיווי מצב על סמל התוסף ────────────────────────────────────────────────
// מאזין ל-syncStatus במקום להוסיף קריאה בכל מסלול — כך כל תהליך מקבל חיווי,
// גם כאלה שנכתבו בסשן אחר ושאיני מכיר.
let badgeClearTimer=null;
function badgeFor(text){
  const t=String(text||'');
  if(!t)return null;
  if(/נכשל|שגיאה|לא נטענ|לא זוה|לא נקרא/.test(t))return{txt:'!',color:'#b42318',keep:true};
  if(/הסתיים|נשמרו|נטענו|אומת/.test(t))return{txt:'✓',color:'#087f5b',keep:false};
  // ⚠⚠ 27.08.2026 — טל: הבנק היה מנותק ולא הייתה הודעה; הבין רק בדיעבד.
  // **השורש:** המצב הזה נפל לענף הכללי וקיבל בדיוק אותו „…" כחול כמו סנכרון
  // שרץ. כלומר „חסום וממתין לך" ו„עובד עכשיו" נראו זהים. אותו דבר בדיוק
  // קרה עם „בחר אילו לסנכרן ואשר", ששם נראה כאילו כלום לא קורה.
  // מצב שדורש פעולה של המשתמש מקבל כתום ואייקון אחר, ולפני הענף הכללי.
  if(/ממתין להתחברות|התחבר|בחר אילו לסנכרן|הזן משתמש|נדרשת בחירת/.test(t))return{txt:'⏸',color:'#b54708',keep:true};
  // ⚠ המילה מסנכרן לא נתפסה כאן, כי סנכרון אינו תת-מחרוזת של מסנכרן — ולכן
  // הסטטוס של פועלים בזמן קריאת התנועות לא הדליק באדג* כלל. נמדד 27.08.
  if(/סנכרון|מסנכרן|קורא|מזהה|זוהתה|בודק|מעדכן|מחבר|טוען|ממתין|היסטוריה|בתהליך|שומר|נקרא/.test(t))return{txt:'…',color:'#2450bd',keep:true};
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

// ⚠⚠ 27.08.2026 — טל: „למה מופיעים כרטיסי אשראי לא מזוהים? אם יש סנכרון בבנק
// עם הכרטיסים שלו הם צריכים להיות משויכים." **נמדד, לא נוחש:** השיוך רץ **רק
// בתוך סנכרון המנפיק** (ישראכרט/כאל/MAX), ולכן הוא תלוי-סדר. ישראכרט רץ
// 25.08 17:47Z, ודיסקונט פרטי **48 דקות אחריו** (18:35Z). שלושה חיובי
// „ישראכרט חיוב" ב-10/08/26 — 2,535.32 · 2,585.28 · 853.98 — מזהים שלושה
// כרטיסים חד-ערכית, אבל בזמן ריצת ישראכרט הם עוד לא היו באחסון,
// **ואיש לא חזר לבדוק.** מכאן: השיוך חייב לרוץ גם אחרי סנכרון בנק.
const cardDigits=v=>String(v||'').replace(/\D/g,'');
// יום/חודש מתוך תאריך בנק, בשני הפורמטים שנמדדו: „10.08.2026" (לאומי) ו„10/08/26" (דיסקונט).
function dayMonthOf(v){const m=String(v||'').match(/(\d{1,2})[.\/-](\d{1,2})/);return m?[Number(m[1]),Number(m[2])]:null}
// ⚠ תאריך החיוב הקודם נגזר **מן הכרטיס** — `previousChargeMonth` („08.2026")
// ו-`chargeDate` („10.9", היום בחודש). הקוד הישן חיפש `10[./-]0?8` **קבוע בקוד**,
// כלומר היה מפסיק לעבוד ב-1 בספטמבר. זה נמדד: כל שבעת הכרטיסים chargeDate="10.9".
function previousChargeDayMonth(card){
  const day=Number((String(card.chargeDate||'').match(/^\s*(\d{1,2})/)||[])[1]||10);
  const month=Number((String(card.previousChargeMonth||'').match(/^\s*(\d{1,2})/)||[])[1]||0);
  return month?[day,month]:null;
}
// ארבעה מסלולי שיוך, מהחזק לחלש. **מקור אמת אחד** — הלקח על שלושת העותקים ביהב.
function accountForCard(accounts,card,savedId){
  const same=c=>cardDigits(c.suffix).endsWith(cardDigits(card.suffix));
  let target=accounts.find(a=>(a.cards||[]).some(same));                       // הבנק כבר מכיר את הכרטיס
  if(!target&&savedId)target=accounts.find(a=>a.id===savedId);                 // שיוך ידני שנשמר
  if(!target&&card.debitAccount){                                             // חשבון החיוב שהמנפיק מדווח (כאל/MAX)
    const wanted=cardDigits(card.debitAccount);
    const m=accounts.filter(a=>wanted.endsWith(cardDigits(a.accountNumber))||cardDigits(a.accountNumber).endsWith(wanted));
    if(m.length===1)target=m[0];
  }
  const when=previousChargeDayMonth(card);
  if(!target&&when&&card.previousCharge>0){                                    // חיוב בסכום ובתאריך של הכרטיס
    // ⚠ 28.08.2026 - "גם ישראכרט לא מזהים": חיוב חודש-כרטיס X נוחת בבנק
    // ב-X+1 (נמדד ב-1.57.1: chargeDate '10.9' על כרטיסי 08). ההתאמה המקורית
    // חיפשה רק ב-X והחמיצה תמיד. כמו ב-viewer: בודקים את X וגם את X+1,
    // והחד-ערכיות נמדדת על שני החלונות יחד.
    // ⚠ 03.09.2026 - היום אינו מדויק: כשה-10 נופל בשבת הבנק רושם את החיוב
    // ב-11 (נמדד: 11/01/26 בדיסקונט ובבינלאומי, 11.01.2026). לכן חלון של
    // עד שלושה ימים אחרי יום החיוב, באותו חודש.
    const nextM=when[1]===12?1:when[1]+1;
    const m=accounts.filter(a=>(a.transactions||[]).some(t=>{
      const dm=dayMonthOf(t.date||t.valueDate||t.transactionDate);
      if(!dm||dm[0]<when[0]||dm[0]>when[0]+3||(dm[1]!==when[1]&&dm[1]!==nextM))return false;
      const amount=Number(t.amount??t.debit??t.credit??0);
      return Math.abs(Math.abs(amount)-card.previousCharge)<.02;
    }));
    if(m.length===1)target=m[0];                                              // ⚠ חד-ערכי בלבד; שניים = לא יודעים
  }
  // מסלול 5 (28.08.2026) - "כרטיסי האשראי לא מזהים לאיזה חשבונות הם שייכים":
  // מקס אינו מוסר debitAccount/chargeDate/previousCharge, ולכן מסלולים 3-4
  // חסרי חומר עבורו. במקומם runMax מצרף bankChargeProbe: סכום חיוב החודש
  // שכבר ירד בבנק + חודש הנחיתה + שם המנפיק. בלי יום מדויק - ולכן הדרישה
  // המפצה: שם המנפיק חייב להופיע בתנועת הבנק, וההתאמה חד-ערכית בלבד.
  // ⚠ 03.09.2026 - נמדד אצל טל: הגשש היחיד הצביע על חיוב שטרם נחת בבנק
  // (חודש-כרטיס 08 -> נחיתה 10/09, והיום 03/09). לכן bankChargeProbes -
  // כמה חודשים אחורה, מהחדש לישן; הראשון שמתאים חד-ערכית מנצח.
  const probes=[...(card.bankChargeProbes||[]),card.bankChargeProbe].filter(p=>p&&Number(p.amount)>0);
  if(!target&&probes.length){
    const monthKeyOf=v=>{const m2=String(v||'').match(/(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{2,4})/);if(!m2)return null;const y=m2[3].length===2?2000+Number(m2[3]):Number(m2[3]);return`${String(Number(m2[2])).padStart(2,'0')}.${y}`};
    for(const p of probes){
      const re=new RegExp(p.textRe||'.','i');
      const m=accounts.filter(a=>(a.transactions||[]).some(t=>{
        if(monthKeyOf(t.date||t.valueDate||t.transactionDate)!==p.monthKey)return false;
        if(!re.test(`${t.action||''} ${t.details||''}`))return false;
        const amount=Number(t.amount??t.debit??t.credit??0);
        return Math.abs(Math.abs(amount)-Number(p.amount))<=1;                // ±1 ש"ח - הלקח מהתאמת ה-viewer
      }));
      if(m.length===1){target=m[0];break}                                     // ⚠ חד-ערכי בלבד
    }
  }
  return target||null;
}
// ⚠⚠ 03.09.2026 - טל: "כשאני מעדכן כרטיסי אשראי הם לא מזהים מאיזה חשבון בנק."
// **נמדד מהאחסון:** דיסקונט/לאומי/מזרחי/יהב/הבינלאומי מחזירים רשומת חשבון
// **בלי** `cards`, ו-syncSelected מחליף את הרשומה כולה. כלומר כל סנכרון בנק
// מחק את הכרטיסים שהמנפיק שייך לחשבון (9238/9012 שויכו ב-28.08 ונעלמו
// ב-31.08; MAX 2910 יצא מהחשבון ולא חזר לשום רשימה). הפונקציה מחזירה את
// הכרטיסים שהיו על הרשומה הקודמת ושהבנק לא דיווח עליהם עכשיו.
function keepAssignedCards(prevList,fresh){
  const prev=(prevList||[]).find(a=>a&&fresh&&a.id===fresh.id);
  if(!prev||!(prev.cards||[]).length)return fresh;
  const have=new Set((fresh.cards||[]).map(c=>cardDigits(c.suffix)).filter(Boolean));
  const kept=prev.cards.filter(c=>cardDigits(c.suffix)&&!have.has(cardDigits(c.suffix)));
  return kept.length?{...fresh,cards:[...(fresh.cards||[]),...kept]}:fresh;
}
// ⚠ 03.09.2026 - טל: "חשוב שיהיה רשום מתחת לשם הכרטיס: זוהה חיוב אחרון
// בחשבון זה וזה, ואת תאריך הזיהוי." findLastCharge מחזיר את התנועה
// **האחרונה** בחשבון שמתאימה לחיוב הכרטיס: previousCharge ±0.02 או אחד
// הגששים ±1 ש"ח. עדיפות להתאמה שגם שם המנפיק מופיע בה (דיסקונט "ישראכרט
// חיוב", הבינלאומי/פועלים "ישראכרט בע"מ"); לאומי כותב "ל.מאסטרקרד)יש(" בלי
// "ישראכרט", ולכן יש נפילה להתאמת סכום בלבד. הרישום נשמר על הכרטיס
// כ-chargeMatch {accountId,date,amount,text,at} ומתעדכן רק כשהחיוב משתנה.
function issuerTextRe(card){const s=`${card?.issuer||''} ${card?.name||''}`;return /כאל|\bCAL\b|ויזה/i.test(s)?'כאל|ויזה|cal':/מקס|\bMAX\b/i.test(s)?'מקס|max':/ישראכרט/i.test(s)?'ישראכרט':''}
function findLastCharge(account,card){
  const probes=[...(card?.bankChargeProbes||[]),card?.bankChargeProbe].filter(p=>p&&Number(p.amount)>0);
  const textRe=issuerTextRe(card),re=textRe?new RegExp(textRe,'i'):null,prev=Number(card?.previousCharge)||0;
  let withText=null,any=null;
  for(const t of account?.transactions||[]){
    const amount=Math.abs(Number(t.amount??t.debit??t.credit??0));if(!(amount>0))continue;
    const text=`${t.action||''} ${t.details||''}`.replace(/\s+/g,' ').trim();
    const hit=(prev>0&&Math.abs(amount-prev)<.02)||probes.some(p=>Math.abs(amount-Number(p.amount))<=1&&(!p.textRe||new RegExp(p.textRe,'i').test(text)));
    if(!hit)continue;
    const day=txDayMs(t.date||t.valueDate||t.transactionDate);if(!Number.isFinite(day))continue;
    const row={day,date:String(t.date||''),amount,text:text.slice(0,60)};
    if(re&&re.test(text)){if(!withText||day>withText.day)withText=row}
    if(!any||day>any.day)any=row;
  }
  return withText||any;
}
// גששי חיוב מן ההיסטוריה השמורה: עד ארבעה חודשי-כרטיס שהושלמו, מהחדש לישן,
// כל אחד עם חודש הנחיתה בבנק (החודש שאחריו) ורגקס שם המנפיק.
function chargeProbesFromHistory(hist,suffix,issuerRe,textRe,nowNorm){
  const out=[];
  for(const r of hist||[]){
    const norm=String(r.month||'').replace(/\D/g,'');
    if(String(r.suffix)!==String(suffix)||!issuerRe.test(String(r.issuer||''))||norm===nowNorm||norm.length!==6||!(Number(r.amount)>0))continue;
    out.push({key:norm.slice(2)+norm.slice(0,2),norm,amount:Number(r.amount)});
  }
  out.sort((a,b)=>b.key.localeCompare(a.key));
  return out.slice(0,4).map(x=>{const m1=Number(x.norm.slice(0,2)),y1=Number(x.norm.slice(2));
    return{amount:x.amount,monthKey:m1===12?`01.${y1+1}`:`${String(m1+1).padStart(2,'0')}.${y1}`,textRe}});
}
let reconcileBusy=false;
async function reconcileUnassignedCards(){
  if(reconcileBusy)return 0;
  reconcileBusy=true;
  try{
    // ⚠ בתוך המנעול (AUDIT סעיף 2): חלון קרא-שנה-כתוב קצר, מסודר בתור.
    return await accountsMutex(async()=>{
    const st=await chrome.storage.local.get({accounts:[],isracardUnassigned:[],calUnassigned:[],maxUnassigned:[],isracardAssignments:{},isracardLastCards:[],calLastCards:[],maxLastCards:[],hiddenCards:[]});
    const accounts=(st.accounts||[]).map(a=>({...a,cards:[...(a.cards||[])]}));
    const patch={};let moved=0;
    const PROBE_RE={isracardUnassigned:'ישראכרט',calUnassigned:'כאל|ויזה|cal',maxUnassigned:'מקס|max'};
    const LAST={isracardUnassigned:'isracardLastCards',calUnassigned:'calLastCards',maxUnassigned:'maxLastCards'};
    const lists=Object.keys(PROBE_RE);
    // ⚠ 03.09.2026 - "יתומים": כרטיס שהמנפיק דיווח עליו (xxxLastCards), שאינו
    // בשום חשבון ואינו ברשימת הממתינים - זה מה שנשאר אחרי שסנכרון בנק מחק
    // את השיוך (נמדד: MAX 2910). בלי זה הוא מוצג "ממתין לשיוך" לנצח, ואיש
    // לא מנסה לשייך אותו שוב. כרטיס שהוסר בידי המשתמש (hiddenCards) לא חוזר.
    {
      const hidden=(st.hiddenCards||[]).map(x=>String(x).replace(/\D/g,'')).filter(Boolean);
      const isHidden=s=>hidden.some(h=>s.endsWith(h)||h.endsWith(s));
      const inAccount=s=>accounts.some(a=>(a.cards||[]).some(c=>cardDigits(c.suffix).endsWith(s)));
      for(const k of lists){
        const list=[...(st[k]||[])],known=new Set(list.map(c=>cardDigits(c.suffix)));let added=false;
        for(const c of st[LAST[k]]||[]){
          const s=cardDigits(c?.suffix);
          if(!s||known.has(s)||isHidden(s)||inAccount(s))continue;
          list.push(c);known.add(s);added=true;
        }
        if(added){st[k]=list;patch[k]=list}
      }
    }
    // ⚠ 28.08.2026 - העשרה למסלול 5 לכל המנפיקים: כרטיסים שממתינים לשיוך
    // מקבלים גששי חיוב מן ההיסטוריה השמורה - סכומי חודשי-הכרטיס שהושלמו,
    // שחיובם נחת בבנק **בחודש שאחריו** (הלקח המדוד מ-1.57.1), ורגקס
    // שם-המנפיק כפי שהוא מופיע בתנועת הבנק. ההתאמה עצמה במסלול 5 - חד-ערכית.
    // ⚠ 03.09.2026 - הגששים מחושבים מחדש בכל סבב (ולא רק כשחסרים): ההיסטוריה
    // גדלה בכל סנכרון מנפיק, וגשש יחיד שנשמר פעם אחת הצביע לנצח על חיוב
    // שטרם נחת. ארבעה חודשים אחורה, כדי שלפחות אחד כבר יהיה בבנק.
    const d0=new Date(),nowNorm=String(d0.getMonth()+1).padStart(2,'0')+d0.getFullYear();
    let histP=null;const getHist=()=>histP||(histP=cardHistAll().catch(()=>[]));
    if(lists.some(k=>(st[k]||[]).length)){
      try{
        const hist=await getHist();
        for(const k of lists)for(const c of st[k]||[]){
          const probes=chargeProbesFromHistory(hist,c.suffix,new RegExp(PROBE_RE[k],'i'),PROBE_RE[k],nowNorm);
          if(probes.length)c.bankChargeProbes=probes;
        }
      }catch(e){}
    }
    for(const key of lists){
      const list=st[key]||[],left=[];
      for(const card of list){
        const savedId=key==='isracardUnassigned'?(st.isracardAssignments||{})[card.suffix]:null;
        const target=accountForCard(accounts,card,savedId);
        if(!target){left.push(card);continue}
        const i=target.cards.findIndex(c=>cardDigits(c.suffix).endsWith(cardDigits(card.suffix)));
        if(i>=0)target.cards[i]={...target.cards[i],...card};else target.cards.push(card);
        moved++;
      }
      if(left.length!==list.length||patch[key])patch[key]=left;
    }
    // "זוהה חיוב אחרון בחשבון X" - לכל כרטיס משויך, בכל סבב. נכתב רק כשהחיוב
    // שזוהה השתנה (חשבון/תאריך/סכום) - אחרת המאזין על accounts היה מסתובב לנצח.
    let stamped=0;
    try{
      const hist=await getHist();
      for(const a of accounts)for(let i=0;i<a.cards.length;i++){
        const c=a.cards[i],textRe=issuerTextRe(c);if(!textRe)continue;
        const probes=chargeProbesFromHistory(hist,c.suffix,new RegExp(textRe,'i'),textRe,nowNorm);
        const hit=findLastCharge(a,probes.length?{...c,bankChargeProbes:probes}:c);
        if(!hit)continue;
        const cur=c.chargeMatch;
        if(cur&&cur.accountId===a.id&&cur.date===hit.date&&Math.abs(Number(cur.amount)-hit.amount)<.005)continue;
        a.cards[i]={...c,chargeMatch:{accountId:a.id,date:hit.date,amount:hit.amount,text:hit.text,at:new Date().toISOString()}};stamped++;
      }
    }catch(e){}
    if(!moved&&!stamped&&!Object.keys(patch).length)return 0;
    if(!moved&&!stamped){await chrome.storage.local.set(patch);return 0}
    patch.accounts=accounts;
    await chrome.storage.local.set(patch);
    return moved;});
  }finally{reconcileBusy=false}
}
chrome.storage.onChanged.addListener((changes,area)=>{
  // ⚠ רק על `accounts`. הכתיבה שלנו מדליקה את המאזין שוב — וזה בסדר: בסבב
  // השני אין מועמדים, `moved=0`, ואין כתיבה. ההתכנסות היא התנאי, לא הדגל.
  if(area!=='local'||!changes.accounts)return;
  reconcileUnassignedCards().catch(()=>{});
});
reconcileUnassignedCards().catch(()=>{});
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
chrome.tabs.onRemoved.addListener(id=>{returnedToDashboard.delete(id);detachedForSync.delete(id);syncTabsToClose.delete(id);unmarkOpened(id).catch(()=>{})});
// לשוניות שהוצאו לחלון עבודה נפרד, ויחזרו לחלון הראשי כשהסנכרון ייגמר.
const detachedForSync=new Set();
// ⚠ 03.09.2026 - טל: "בסיום הסנכרון שנגמר בהצלחה שייסגר הדף של הבנק או חברת
// האשראי." כל מסלול רושם את הלשונית שהוא עובד עליה (noteSyncTab) ברגע שקיבל
// אותה, ובנקודת ההצלחה **בלבד** קורא closeSyncTabs. אחרי שגיאה הדף נשאר פתוח
// כדי שאפשר יהיה לראות מה קרה, ו-restoreSyncTabs (שרץ ב-finally) מנקה את
// הרישום כדי שהצלחה של מסלול אחר לא תסגור לשונית זרה.
// ⚠ 03.09.2026 - טל: "תבצע רק כשאני נכנס מהתוסף תהיה סגירה. בשום מצב אחר אין
// סגירה." לכן נסגרות **רק** לשוניות שהתוסף עצמו פתח - חלון ההתחברות שנפתח
// מלחיצה בדשבורד (openLoginWindow). לשונית שהמשתמש פתח בעצמו, גם אם הסנכרון
// רץ עליה והצליח, נשארת.
const openedByExtension=new Set();
// ⚠⚠ 03.09.2026 - טל: "לוחץ על חיבור 1 והוא רושם שנמצא חיבור פעיל למרות שאין
// אחד כזה." נמדד באחסון: הסנכרון של חיבור 1 **הצליח** ב-14:11 (6 תנועות
// חדשות) - כלומר לשונית מחוברת כן הייתה, בחלון שטל לא רואה: שריד מסנכרון
// קודם שלא נסגר. ולמה לא נסגר? service worker של MV3 נרדם אחרי ~30 שניות
// חוסר פעילות, וההתחברות באתר לוקחת דקות. ה-Set בזיכרון נמחק לפני שהסנכרון
// הסתיים, ו-closeSyncTabs לא הכיר את הלשונית. לכן הרישום נשמר גם ב-
// chrome.storage.session: שורד הירדמות, נמחק בסגירת הדפדפן (כמו הלשוניות).
// ⚠ 03.09.2026 - טל: "לאומי ופועלים פרטי לא נסגרו בסוף הסינכרון." נמדד ביומן
// האחסון: פועלים פרטי נפתח מהתוסף ב-18:15 (חלון התחברות), הסנכרון נכשל פעמיים,
// ואז התוסף **נטען מחדש** (2.3.7). הסנכרון של 18:35 הצליח על אותה לשונית -
// ולא סגר אותה. chrome.storage.session נמחק בטעינה מחדש של התוסף, ולא רק
// בסגירת הדפדפן, ולכן הרישום אבד. עכשיו ב-storage.local: שורד טעינה מחדש,
// ונמחק ב-onStartup (הפעלת דפדפן - מזהי לשוניות מתחילים מחדש ואסור להתבלבל).
async function loadOpened(){try{const s=await chrome.storage.local.get({openedTabs:{}});for(const [id,p] of Object.entries(s.openedTabs||{})){openedByExtension.add(Number(id));if(Number.isInteger(p))openedParent.set(Number(id),p)}}catch(e){}}
async function saveOpened(){try{const o={};for(const id of openedByExtension)o[id]=openedParent.get(id)??null;await chrome.storage.local.set({openedTabs:o})}catch(e){}}
async function markOpened(id,parent){await loadOpened();openedByExtension.add(id);if(Number.isInteger(parent))openedParent.set(id,parent);await saveOpened()}
async function unmarkOpened(id){await loadOpened();openedByExtension.delete(id);openedParent.delete(id);await saveOpened()}
async function openLoginWindow(opts){const w=await chrome.windows.create(opts);for(const t of w?.tabs||[])if(Number.isInteger(t.id))await markOpened(t.id);return w}
// ⚠ 03.09.2026 - טל: "בבינלאומי לא נפתח פופאפ, נפתחת לשונית לצד התוסף."
// נמדד בקוד: startFibi כן פותח פופאפ (openLoginWindow) - אבל **האתר** פותח את
// הפורטל בלשונית חדשה (window.open מדף ההתחברות), ו-Chrome מציב אותה בחלון
// הרגיל האחרון שהיה במוקד - ליד הדשבורד. הלשונית הזאת היא בת של הפופאפ
// (openerTabId), ולכן היא נחשבת "נפתחה ע"י התוסף" ונסגרת בהצלחה יחד עם
// הפופאפ שהוליד אותה. לשונית בלי opener מוכר - נשארת.
const openedParent=new Map();
chrome.tabs.onCreated.addListener(async t=>{if(!Number.isInteger(t?.id)||!Number.isInteger(t?.openerTabId))return;await loadOpened();if(openedByExtension.has(t.openerTabId))await markOpened(t.id,t.openerTabId)});
const syncTabsToClose=new Set();
function noteSyncTab(id){if(Number.isInteger(id))syncTabsToClose.add(id)}
async function closeSyncTabs(){
  await loadOpened();
  const noted=[...syncTabsToClose].filter(id=>openedByExtension.has(id));syncTabsToClose.clear();
  const ids=[...new Set([...noted,...noted.map(id=>openedParent.get(id)).filter(p=>openedByExtension.has(p))])];
  for(const id of ids){detachedForSync.delete(id);returnedToDashboard.delete(id);try{await chrome.tabs.remove(id)}catch{}await unmarkOpened(id)}
  return ids.length;
}
async function restoreSyncTabs(){
  syncTabsToClose.clear();
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
// ⚠ „עצור סנכרון" — נוסף 18.08.2026 לבקשת טל, ליד הגלגל. הדגל נבדק בנקודות
// שהלולאות עוברות בהן בכל צעד: syncStep (בנקים וכרטיסים), אצוות השיקים, לולאת
// חודשי ישראכרט ולולאת הישויות בדיסקונט. אין הרג באמצע כתיבה — הבדיקה תמיד
// לפני הצעד הבא, ולכן מה שנשמר עד העצירה נשאר שמור.
let abortFlag=false;
function abortIfRequested(){if(abortFlag)throw Error(ABORT_MESSAGE)}
// ⚠ „עצור" לא שיחרר המתנות ארוכות (DISCOUNT_DISCOVER עד 120 שנ'), ולכן הדגל
// discountBusy נשאר דלוק וכל לחיצה נוספת נבלעה. raceAbort הופך כל המתנה לניתנת
// לעצירה: בודק את הדגל כל 400ms ודוחה מיד כשהוא נדלק.
function raceAbort(promise){
  let timer=null;
  const watch=new Promise((_,reject)=>{timer=setInterval(()=>{if(abortFlag){clearInterval(timer);reject(Error(ABORT_MESSAGE))}},400)});
  return Promise.race([promise,watch]).finally(()=>{if(timer)clearInterval(timer)});
}
const ABORT_MESSAGE='הסנכרון נעצר לבקשתך';
async function clearAbort(){abortFlag=false;await chrome.storage.local.set({syncAbort:false})}
async function requestAbort(){abortFlag=true;await chrome.storage.local.set({syncAbort:true,syncStatus:'עוצר את הסנכרון…'});return{ok:true}}
async function beginProgress(total){await clearAbort();progressState={done:0,total,startedAt:Date.now()};await chrome.storage.local.set({syncProgress:progressState})}
// action = הטקסט הקצר שנכתב בתוך הגלגל. נפרד מהסטטוס המלא, שנשאר ארוך ומפורט.
async function syncStep(status,action=''){abortIfRequested();if(progressState)progressState={...progressState,done:Math.min(progressState.done+1,progressState.total),action};await chrome.storage.local.set({syncStatus:status,syncProgress:progressState})}
async function endProgress(){progressState=null;await chrome.storage.local.set({syncProgress:null})}
// מחיקת כרטיס = היסטוריה **וגם** הכרטיס עצמו. נוסף 18.08.2026 אחרי דיווח:
// „במחק כרטיס החיוב הקרוב נשאר" — כי נמחקה רק ההיסטוריה, בעוד החיוב הקרוב
// מוצג מתוך accounts[].cards. מחיקה חלקית גרועה ממחיקה שלא קרתה: היא נראית
// כאילו עבדה.
async function deleteCardEverywhere(suffix){
  const key=String(suffix||'').replace(/\D/g,'');
  if(!key)return{ok:false,error:'לא צוין מספר כרטיס'};
  const removed=await cardHistDeleteCard(suffix);
  // ⚠ בתוך המנעול (AUDIT סעיף 2): חלון קרא-שנה-כתוב קצר, מסודר בתור.
  return await accountsMutex(async()=>{
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
  return{ok:true,removed,cards};});
}
chrome.runtime.onMessage.addListener((m,sender,reply)=>{
  // ⚠ 18.08.2026 — דגל העצירה נוקה רק ב-beginProgress ובסיום syncSelected, ולכן
  // אחרי לחיצה על „עצור" מסלולים שאין להם גלגל (זיהוי דיסקונט, למשל) נעצרו מיד
  // בפעם הבאה. **כל בקשה חדשה של המשתמש מנקה את הדגל.**
  if(/^START_/.test(m?.type||'')||['SYNC_SELECTED','LOAD_CARD_YEAR','LOAD_CARD_MONTH'].includes(m?.type||''))clearAbort();
  if(/^[A-Z_]*AUTHENTICATED$/.test(m?.type||'')&&sender.tab?.id){const src=sourceFromUrl(sender.tab.url);userAskedFor(src||'').then(ok=>{if(ok)returnToDashboard(sender.tab.id)}).catch(()=>{});}
  if(m?.type==='START_AUTO_SYNC'){start(m.scope||'business',Boolean(m.force)).then(reply).catch(e=>reply({ok:false,error:e.message}));return true}
  if(m?.type==='AUTHENTICATED'&&sender.tab?.id){const source=sourceFromUrl(sender.tab.url);if(source){chrome.storage.local.get({pendingSources:[]}).then(x=>{if(x.pendingSources.includes(source))queueDiscover(sender.tab.id,source);else maybeAutoSync(source,SOURCES[source].label,sender.tab.id).catch(()=>{})});}reply({ok:true});return}
  if(m?.type==='SYNC_SELECTED'){syncSelected(m.keys||[]).then(reply).catch(e=>reply({ok:false,error:e.message}));return true}
  if(m?.type==='OPEN_EXTERNAL_BANK'){chrome.tabs.create({url:m.url,active:true}).then(async t=>{if(Number.isInteger(t?.id))await markOpened(t.id);reply({ok:true})});return true}
  if(m?.type==='START_FIBI'){startFibi(m.slot).then(reply).catch(e=>reply({ok:false,error:e.message}));return true}
  if(m?.type==='FIBI_OPEN_SCHEDULE'&&sender.tab?.id){openFibiSchedule(sender.tab.id,m.args||[]).then(reply).catch(e=>reply({ok:false,error:e.message}));return true}
  if(m?.type==='FIBI_CLOSE_SCHEDULE'&&sender.tab?.id){closeFibiSchedule(sender.tab.id).then(reply).catch(e=>reply({ok:false,error:e.message}));return true}
  if(m?.type==='FIBI_AUTHENTICATED'&&sender.tab?.id){const t=sender.tab.id;chrome.storage.local.get({pendingFibiSlot:''}).then(x=>{if(x.pendingFibiSlot)syncFibi(t).catch(()=>{});else maybeAutoRun('fibi','הבינלאומי',async id=>{
    // ⚠ 03.09.2026 - טל: "יתכן וזה בגלל שיש שני חיבורים לבינלאומי." נכון: כאן
    // נבחר תמיד החיבור **הראשון** (fibi-1, טל), וכניסה לחשבון של סופי (fibi-2)
    // הייתה נופלת ב-syncFibi על "זהו אותו חשבון שכבר נשמר בחיבור האחר".
    // עכשיו 'auto': syncFibi קורא את מספר החשבון מהדף ובוחר את החיבור שתואם.
    const acc=(await chrome.storage.local.get({accounts:[]})).accounts.find(a=>String(a.source).startsWith('fibi-'));if(acc){await chrome.storage.local.set({pendingFibiSlot:'auto'});await syncFibi(id)}},t).catch(()=>{})});reply({ok:true});return}
  if(m?.type==='START_LEUMI'){startLeumi().then(reply).catch(e=>reply({ok:false,error:e.message}));return true}
  if(m?.type==='START_DISCOUNT_BUSINESS'){startDiscountBusiness().then(reply).catch(e=>reply({ok:false,error:e.message}));return true}
  if(m?.type==='START_DISCOUNT_PRIVATE'){startDiscountPrivate().then(reply).catch(e=>reply({ok:false,error:e.message}));return true}
  if(m?.type==='START_MIZRAHI'){startMizrahi().then(reply).catch(e=>reply({ok:false,error:e.message}));return true}
  if(m?.type==='START_YAHAV'){startYahav().then(reply).catch(e=>reply({ok:false,error:e.message}));return true}
  if(m?.type==='START_ISRACARD'){startIsracard().then(reply).catch(e=>reply({ok:false,error:e.message}));return true}
  if(m?.type==='START_BTB'){startBtb().then(reply).catch(e=>reply({ok:false,error:e.message}));return true}
  if(m?.type==='START_CAL'){startCal(m.suffix).then(reply).catch(e=>reply({ok:false,error:e.message}));return true}
  if(m?.type==='START_MAX'){startMax(m.suffix).then(reply).catch(e=>reply({ok:false,error:e.message}));return true}
  if(m?.type==='YAHAV_AUTHENTICATED'&&sender.tab?.id){const t=sender.tab.id;chrome.storage.local.get({pendingYahav:false}).then(x=>{if(x.pendingYahav)runYahav(t).catch(()=>{});else maybeAutoRun('yahav','יהב',runYahav,t).catch(()=>{})});reply({ok:true});return}
  // ⚠ 27.08.2026 — „דף רגיל, לא מוקטן, לא מסתנכרן ברקע". המסלול הזה לא קרא ל-returnToDashboard,
  // והקישור הגנרי של AUTHENTICATED מת עבור מזרחי: sourceFromUrl מכיר רק את
  // פועלים ומחזיר null, ואז userAskedFor('') מחזיר false. startMizrahi כן קורא לו —
  // אבל רק בענף „לשונית קיימת", וכניסה דרך התחברות אינה עוברת שם.
  if(m?.type==='MIZRAHI_AUTHENTICATED'&&sender.tab?.id){const t=sender.tab.id;const bgRun=async id=>{await returnToDashboard(id,true);await runMizrahi(id)};chrome.storage.local.get({pendingMizrahi:false}).then(x=>{if(x.pendingMizrahi)bgRun(t).catch(()=>{});else maybeAutoRun('mizrahi','מזרחי־טפחות',bgRun,t).catch(()=>{})});reply({ok:true});return}
  if(m?.type==='MIZRAHI_FRAME_REPORT'&&sender.tab?.id){const old=mizrahiFrameData.get(sender.tab.id)||{transactions:[],loans:[]};mizrahiFrameData.set(sender.tab.id,{transactions:Array.isArray(m.transactions)&&m.transactions.length?m.transactions:old.transactions,loans:Array.isArray(m.loans)&&m.loans.length?m.loans:old.loans});reply({ok:true});return}
  if(m?.type==='DISCOUNT_AUTHENTICATED'&&sender.tab?.id){const privateSite=String(sender.tab.url||'').includes('/retail3/'),source=privateSite?'discount-private':'discount-business',label=privateSite?'דיסקונט פרטי':'דיסקונט עסקי';chrome.storage.local.get({pendingDiscountBusiness:false,pendingDiscountPrivate:false}).then(x=>{if(privateSite?!x.pendingDiscountPrivate:!x.pendingDiscountBusiness)maybeAutoSync(source,label,sender.tab.id).catch(()=>{})});handleDiscountAuthenticated(sender.tab.id).catch(()=>{});reply({ok:true});return}
  // ⚠ 18.08.2026 — צילום שנשמר רק בסוף האצווה אבד כולו כשהאצווה חרגה מהתקרה.
  // נמדד: total 32 · saved 18 · failed 14 · why „לא השיב תוך 300 שניות". כל שיק
  // שנקלט נשמר עכשיו מיד, ולכן timeout מאבד לכל היותר את זה שבאוויר.
  if(m?.type==='LEUMI_CHEQUE_IMAGE'&&m.reference&&m.front){
    saveChequeInfo(chequeId(chequeCtx.selectionKey||'',String(m.reference)),m.info);
    const key=chequeCtx.selectionKey;
    if(key){const id=chequeId(key,String(m.reference));
      chequePut({id,selectionKey:key,reference:String(m.reference),front:m.front,back:m.back||'',info:String(m.info||''),savedAt:new Date().toISOString()})
        .then(()=>{chequeCtx.savedRefs.add(String(m.reference))}).catch(()=>{})}
    reply({ok:true});return}
  // WHY: הפעימה היא ההוכחה היחידה שהעמוד חי. בלעדיה "ממתין" ו"מת" נראים זהה.
  if(m?.type==='LEUMI_SYNC_PROGRESS'){leumiBeat={at:Date.now(),stage:m.stage||'',rows:m.rows||0};
    chrome.storage.local.set({syncStatus:`לאומי: ${m.stage||'קורא תנועות'} — ${m.rows||0} שורות`});
    reply?.({ok:true});return}
  if(m?.type==='LEUMI_CHEQUE_PROGRESS'){chequeCtx.done++;const at=chequeCtx.base+chequeCtx.done,tot=chequeCtx.total||m.total;chrome.storage.local.set({syncStatus:`לאומי: שומר צילומי שיקים ${at}/${tot}`+(chequeCtx.base?` · ${chequeCtx.base} כבר היו שמורים`:'')+(chequeCtx.noRef?` · ${chequeCtx.noRef} ללא אסמכתא`:'')});reply({ok:true});return}
// ⚠ ערוץ שני לגשש של דיסקונט: אם כתיבת האחסון **מן הדף** נבלעת
// (הקשר מת), ההודעה לרקע עדיין עשויה לעבור — ולהפך. שני ערוצים
// בלתי תלויים, כי בדיוק את הכשל הזה אנחנו מנסים לתפוס.
if(m?.type==='DISCOUNT_TRACE'){try{chrome.storage.local.set({discountSyncTraceBg:{where:m.where,ms:m.ms,at:new Date().toISOString()}})}catch(e){}reply({ok:true});return}
if(m?.type==='LEUMI_AUTHENTICATED'&&sender.tab?.id){chrome.storage.local.get({pendingLeumi:false}).then(x=>{if(!x.pendingLeumi)maybeAutoSync('leumi','לאומי',sender.tab.id).catch(()=>{})});discoverLeumi(sender.tab.id).catch(async e=>{
// ⚠ תקלת חיבור היא רגעית. כיבוי pendingLeumi כאן גרם לכך שכל אירוע התחברות נוסף
// מהדף נבלע בשקט, והתוסף נראה כאילו הוא לא עושה כלום עד לחיצה חוזרת על סנכרון.
const transient=/Receiving end does not exist|message port closed|No tab with id|Frame with ID/i.test(e.message||'');
await chrome.storage.local.set({pendingLeumi:transient,syncStatus:`שגיאה בלאומי: ${e.message}${transient?' — נשאר דרוך, רענן את לשונית לאומי והוא ימשיך מעצמו':''}`});await chrome.runtime.openOptionsPage()});reply({ok:true});return}
  if(m?.type==='OPEN_LEUMI_CHEQUE'){openLeumiCheque(m).then(reply).catch(e=>reply({ok:false,error:e.message}));return true}
  if(m?.type==='DISCOUNT_PROGRESS'){chrome.storage.local.set({syncStatus:String(m.text||'')});reply({ok:true});return}
  if(m?.type==='ABORT_SYNC'){requestAbort().then(reply).catch(e=>reply({ok:false,error:e.message}));return true}
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
  if(m?.type==='MAX_AUTHENTICATED'&&sender.tab?.id){const t=sender.tab.id;chrome.storage.local.get({pendingMax:false,pendingMaxSuffix:''}).then(x=>{if(x.pendingMax)runMax(t,x.pendingMaxSuffix).catch(e=>noteMaxError(e));else maybeAutoRun('max','MAX',runMax,t).catch(()=>{})});reply({ok:true});return}
  if(m?.type==='LOAD_CARD_MONTH'){loadIsracardMonth(String(m.month||'')).then(reply).catch(e=>reply({ok:false,error:e.message}));return true}
  if(m?.type==='LOAD_CARD_YEAR'){const suffixes=Array.isArray(m.suffixes)?m.suffixes:[];loadIsracardYear(Number(m.months)||12,suffixes,!!m.onlyMissing).then(reply).catch(async e=>{const card=suffixes.length?` לכרטיס ${suffixes.join(', ')}`:'';await chrome.storage.local.set({syncStatus:`ישראכרט${card}: הסנכרון לא התחיל — ${e.message}`});reply({ok:false,error:e.message})});return true}
  if(m?.type==='CARD_MONTHS'){cardHistMonths().then(months=>reply({ok:true,months})).catch(e=>reply({ok:false,error:e.message}));return true}
  if(m?.type==='CARD_HISTORY_DELETE_CARD'){deleteCardEverywhere(m.suffix).then(reply).catch(e=>reply({ok:false,error:e.message}));return true}
  if(m?.type==='CARD_HISTORY_STATS'){cardHistStats().then(stats=>reply({ok:true,stats})).catch(e=>reply({ok:false,error:e.message}));return true}
  if(m?.type==='CARD_MONTH_DATA'){cardHistGetMonth(String(m.month||'')).then(rows=>reply({ok:true,rows})).catch(e=>reply({ok:false,error:e.message}));return true}
  if(m?.type==='OPEN_DASHBOARD'){chrome.runtime.openOptionsPage();reply({ok:true});return}
});
async function handleAuthenticatedNavigation(d){if(d.frameId!==0)return;const source=sourceFromUrl(d.url);if(!source||!d.url.includes(SOURCES[source].portal))return;const s=await chrome.storage.local.get({pendingSources:[]});if(s.pendingSources.includes(source))queueDiscover(d.tabId,source);else{
  // ⚠ אותה הגנה: הודעה **אינפורמטיבית** לא דורסת תוצאה סופית שכבר על המסך.
  const cur=(await chrome.storage.local.get({syncStatus:''})).syncStatus||'';
  if(!TERMINAL_STATUS.test(cur))await chrome.storage.local.set({syncStatus:`זוהתה כניסה ל${SOURCES[source].label} — בודק עדכונים אוטומטיים`});
  maybeAutoSync(source,SOURCES[source].label,d.tabId).catch(()=>{})}}
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
  // ⚠⚠ 25.08.2026 — טל: „ומה עם פועלים?" צודק. **לפועלים אין
// `startPoalim` — הוא עובר דרך `start()` הגנרית**, וזו מחקה את
// `discoveredAccounts` **כולו**, גם עבור בנקים שכלל אינם בריצה הזו.
// כלומר סנכרון פועלים בלבד הרס את בורר החשבונות של לאומי ודיסקונט.
// ⚠ **שומרים מה שאינו נוגע לריצה:** נמחקות רק הרשומות של המקורות
// שמתחילים עכשיו — הם ייבנו מחדש בזיהוי ממילא.
// ⚠ בענף „כבר סונכרנו היום" **לא מתחיל שום מקור**, ולכן שם לא נמחק
// דבר. קודם הוא מחק הכל בלי שרץ אפילו סנכרון אחד.
const requested=chosenSources(scope),saved=await chrome.storage.local.get({accounts:[],discoveredAccounts:[]});
const keepChooser=list=>(saved.discoveredAccounts||[]).filter(a=>a&&!list.includes(a.source));const sources=force?requested:requested.filter(source=>!sourceFreshToday(source,saved.accounts));const skipped=requested.filter(source=>!sources.includes(source));
  if(!sources.length){await chrome.storage.local.set({syncScope:scope,pendingSources:[],discoveredAccounts:keepChooser([]),syncStatus:'כל החשבונות שנבחרו כבר סונכרנו היום'});await chrome.runtime.openOptionsPage();return{ok:true,status:'already_synced_today'}}
  await chrome.storage.local.set({syncScope:scope,pendingSources:sources,discoveredAccounts:keepChooser(sources),syncStatus:skipped.length?`${skipped.map(s=>SOURCES[s].label).join(', ')} כבר עודכן היום; ממשיך לשאר החיבורים`:'מחפש חיבורים פעילים'});
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
  else await openLoginWindow({url:cfg.login,type:'popup',width:560,height:780,focused:true});
}
// ⚠ שומר לולאה — אל תסיר (§9). discover מסירה את הבנק מ-pendingSources רק בהצלחה;
// בכישלון הוא נשאר, prepareRoute מנווטת, הניווט משנה pathname, reportAuthenticated
// יורה שוב וזה חוזר בלי סוף. עד 0.64.0 גם לא היה דיווח — catch ריק בלע את הסיבה.
const discoverTries=new Map();
chrome.tabs.onRemoved.addListener(id=>{for(const k of [...discoverTries.keys()])if(k.endsWith(`|${id}`))discoverTries.delete(k)});
// ⚠⚠ 23.08.2026 — טל: „אני מנסה לעבוד על בנק הפועלים, לא קשור לתוסף,
// והתוסף חוטף לי את החשבון." **צודק, וזה היה חמור.**
// `poalim-content.js` שולח `AUTHENTICATED` בכל שינוי נתיב, **כל 750ms**.
// שני מטפלים הגיבו לו **בלי שום תנאי**:
//   1. `returnToDashboard(tab.id)` — **מנווט את הלשונית של המשתמש** בחזרה
//      לדף הבית של הבנק, בזמן שהוא עובד בה.
//   2. `queueDiscover(...)` — מריץ זיהוי, שפותח את בורר החשבונות ומחליף
//      חשבון. **זו „חטיפת החשבון".**
// המסלול המקביל, `handleAuthenticatedNavigation`, **כן** בודק
// `pendingSources` לפני `queueDiscover`. מסלול ההודעה פשוט לא — אי-עקביות
// שאיש לא שם לב אליה.
// **הכלל: התוסף נוגע בלשונית של המשתמש רק כשהמשתמש ביקש פעולה מול אותו
// בנק.** נוכחות בדף בנק אינה בקשה.
async function userAskedFor(source){
  if(running)return true;                       // סנכרון שהמשתמש יזם
  const st=await chrome.storage.local.get({pendingSources:[]});
  if((st.pendingSources||[]).includes(source))return true;
  const flags={leumi:'pendingLeumi','discount-business':'pendingDiscountBusiness',
    'discount-private':'pendingDiscountPrivate',mizrahi:'pendingMizrahi',yahav:'pendingYahav',
    isracard:'pendingIsracard'};
  const f=flags[source];
  if(!f)return false;
  return Boolean((await chrome.storage.local.get({[f]:false}))[f]);
}
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
    const latest=await chrome.storage.local.get({discoveredAccounts:[],pendingSources:[]});const others=latest.discoveredAccounts.filter(a=>a.source!==source);const found=r.accounts.map(a=>({...a,source,sourceLabel:SOURCES[source].label,key:`${source}|${a.key}`,at:Date.now()}));const pending=latest.pendingSources.filter(x=>x!==source);
    const combined=[...others,...found];await chrome.storage.local.set({discoveredAccounts:combined,chooserFocus:{source,label:SOURCES[source]?.label||source,at:Date.now()},pendingSources:pending,syncStatus:pending.length?`התחבר גם אל ${SOURCES[pending[0]].label}`:'בודק אם נדרשת בחירת חשבונות'});
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
  if(!st.autoSyncOnLogin){await noteAutoSyncOff(label);return false}const wait_=autoSyncTooSoon(st,source);if(wait_){if(AUTO_SYNC_MIN_GAP_MS-wait_<60000)return false;if(/שגיאה|נכשל/.test((await chrome.storage.local.get({syncStatus:''})).syncStatus||''))return false;await chrome.storage.local.set({syncStatus:`${label}: סונכרן לאחרונה לפני פחות מ-6 שעות — הבא בעוד ${gapText(wait_)}. לעדכון מיידי לחץ על הבנק בדשבורד`});return false}
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
// ⚠ 22.08.2026 — ההודעה „הסנכרון האוטומטי כבוי" דרסה כשל זיהוי טרי של לאומי
// והשאירה את המשתמש בלי שום רמז למה „אין חשבונות לבחירה". היא מופיעה בשני
// מסלולי כניסה (autoSyncFromLogin ו-maybeAutoRun) ולכן אוחדה לכאן.
// **הכלל: הודעה שגרתית אינה מוחקת שגיאה.**
// ⚠⚠ 27.08.2026 — טל: „סונכרן, למה לא רושם הסנכרון הסתיים." נמדד ברצף
// הסטטוסים: פועלים פרטי **כן** סונכרן (645-301975, 150 תנועות) ו**כן** נכתב
// „הסתיים בהצלחה: סונכרנו 1 חשבון" — ומיד אחריו נדרס פעמיים:
//   „זוהתה כניסה לפועלים פרטי — בודק עדכונים אוטומטיים"
//   „זוהתה כניסה לפועלים פרטי, אך הסנכרון האוטומטי כבוי"
// הניווטים שהסנכרון עצמו יוצר מדליקים את שער הסנכרון האוטומטי **אחרי**
// שהוא הסתיים, והכתיבה האחרונה מנצחת. `statusBySource` נגזר מ-`syncStatus`
// בדשבורד, ולכן גם האריח הראה „הסנכרון דולג".
// ⚠ ההגנה כבר הייתה קיימת — **אבל רק לשגיאות.** הצלחה לא הוגנה. אסימטריה.
const TERMINAL_STATUS=/הסתיים|סונכרנו|סונכרן|נשמרו|הושלם|שגיאה|נכשל/;
async function noteAutoSyncOff(label){
  const st=await chrome.storage.local.get({syncStatus:'',lastAutoSync:'',lastSyncError:null}),cur=st.syncStatus||'';
  // ⚠ 03.09.2026 - פועלים פרטי: "שגיאה: לא נמצא בורר החשבונות" נדרסה תוך שנייה
  // ע"י "זוהתה כניסה…" (נמדד ביומן האחסון, שלוש פעמים). lastAutoSync נכתב רק
  // בהצלחה, והשגיאה לא כללה את שם הבנק - ולכן ההגנה שלמטה לא תפסה אותה.
  // שגיאת סנכרון מ-10 הדקות האחרונות נשארת על המסך, מכל בנק שהוא.
  if(/^שגיאה/.test(cur)&&Date.now()-(Date.parse(st.lastSyncError?.at||'')||0)<10*60*1000)return;
  // ⚠ 03.09.2026 - "לא זוהתה התחברות": ההודעה נבלעה כי כל סטטוס סופי (גם של
  // בנק אחר, גם מלפני שעות) דיכא אותה. עכשיו הדיכוי רק כשהסטטוס הסופי הוא של
  // **אותו בנק** ומ-10 הדקות האחרונות - כדי לא לדרוס תוצאה טרייה בגלל
  // ניווט באתר אחרי הסנכרון (הבינלאומי מדווח על כל שינוי hash).
  const fresh=Date.now()-(Date.parse(st.lastAutoSync||'')||0)<10*60*1000;
  if(TERMINAL_STATUS.test(cur)&&cur.includes(label)&&fresh)return;
  await chrome.storage.local.set({syncStatus:`זוהתה כניסה ל${label}, אך הסנכרון האוטומטי כבוי`});
}
async function maybeAutoRun(source,label,fn,tabId){
  if(running)return false;
  const st=await chrome.storage.local.get({autoSyncOnLogin:false,accounts:[],autoSyncLast:{}});
  if(!st.autoSyncOnLogin){await noteAutoSyncOff(label);return false}const wait_=autoSyncTooSoon(st,source);if(wait_){if(AUTO_SYNC_MIN_GAP_MS-wait_<60000)return false;if(/שגיאה|נכשל/.test((await chrome.storage.local.get({syncStatus:''})).syncStatus||''))return false;await chrome.storage.local.set({syncStatus:`${label}: סונכרן לאחרונה לפני פחות מ-6 שעות — הבא בעוד ${gapText(wait_)}. לעדכון מיידי לחץ על הבנק בדשבורד`});return false}
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
// ⚠ „תחילת איסוף נתונים" — הגדרה גלובלית אחת (collectSince, YYYY-MM-DD) שחלה על
// כל הבנקים והכרטיסים. נוספה 18.08.2026 לבקשת טל. הכלל: תנועה שתאריכה קודם לגבול
// אינה נשמרת, וחודש שקודם לו אינו נקרא בכלל. תאריך שלא ניתן לפענוח **נשמר** —
// עדיף להשאיר רשומה מסופקת מאשר למחוק בשקט.
async function collectSinceMs(){const st=await chrome.storage.local.get({collectSince:''});const t=Date.parse(String(st.collectSince||''));return Number.isFinite(t)?t:0}
function txDateMs(v){const s=String(v||'').trim();
  let m=s.match(/^(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{2,4})$/);
  if(m){const y=Number(m[3]);return Date.UTC(y<100?2000+y:y,Number(m[2])-1,Number(m[1]))}
  m=s.match(/^(\d{4})-(\d{2})-(\d{2})/);if(m)return Date.UTC(Number(m[1]),Number(m[2])-1,Number(m[3]));
  const t=Date.parse(s);return Number.isFinite(t)?t:NaN}
function keepSince(value,since){if(!since)return true;const ms=txDateMs(value);return !Number.isFinite(ms)||ms>=since}
// ⚠ applyCollectSince הוסרה ב-22.08.2026. היא הייתה הצרכן היחיד שמחק
// נתונים שכבר נשמרו, והוחלפה בסינון תצוגה בדשבורד (viewSince).
// keepSince ו-txDateMs נשארות — הן משמשות את גבול הורדת השיקים בלאומי.
const mmYYYY=d=>`${String(d.getMonth()+1).padStart(2,'0')}${d.getFullYear()}`;
// ── סימון "חדש" לעסקאות כרטיס (ישראכרט · כאל · MAX) ──────────────────
// storeCardMonth הוא הפתח היחיד שדרכו נשמרות עסקאות של שלוש החברות, ולכן
// ההשוואה יושבת כאן ולא בשלושה זרימות נפרדות.
//
// ⚠ "ריצה" ולא "קריאה": כאל ו-MAX קוראים ל-storeCardMonth פעם לכל חודש,
// עד 12 פעמים ברצף. אילו כל קריאה הייתה חותם נפרד, רק החודש האחרון היה
// נחשב "הסנכרון האחרון". לכן החותם נקבע פעם אחת ב-beginCardRun.
// ⚠ נמדד בבדיקה: שתי ריצות באותה מילישנייה קיבלו חותם זהה, והשנייה ירשה
// את הסימונים של הראשונה במקום להחליף אותם. לכן מונה ולא זמן בלבד.
let cardRunStamp='',cardRunKnown=null,cardRunSeen=null,cardRunSeq=0;
function beginCardRun(){cardRunStamp=`${new Date().toISOString()}#${++cardRunSeq}`;cardRunKnown=null;cardRunSeen=null;return cardRunStamp}
async function storeCardMonth(month,cards){
  const rawMonth=String(month||''),normalizedMonth=rawMonth.replace(/\D/g,'');
  if(!cardRunStamp)beginCardRun();
  const stamp=cardRunStamp,stampMs=Date.parse(stamp.split('#')[0])||Date.now();
  // הקודם נקרא לפי אינדקס החודש בלבד - לא getAll על כל המסד, שרץ עד 12 פעמים.
  const prevBySuffix=new Map((await cardHistGetMonth(normalizedMonth)).map(r=>[String(r.suffix),r]));
  const store=await chrome.storage.local.get({cardNewMarks:{}}),marks=store.cardNewMarks||{};
  // ⚠ "מוכר" נקבע מהתמונה שלפני הריצה. אילו נבדק מול marks המתעדכן, החודש
  // הראשון בריצה היה הופך את הכרטיס ל"מוכר" ו-11 החודשים שאחריו היו נצבעים
  // חדשים במלואם בסנכרון הראשון בחיי הכרטיס.
  if(!cardRunKnown)cardRunKnown=new Set(Object.keys(marks));
  // ⚠⚠ 03.09.2026 - טל: "רק התנועות החדשות ... של 72 השעות האחרונות מהסנכרון
  // האחרון, וגם תנועה שמופיעה בפעם הראשונה." נמדד באחסון: ב-03/09 כל 35
  // העסקאות של 4719 סומנו "חדש" - כי ההשוואה הייתה מול רשומת **אותו חודש**
  // בלבד, וחודש חדש = רשומה ריקה = הכול חדש, גם עסקאות מאוגוסט שכבר נראו
  // בדף 08. לכן "מוכר" נמדד מול **כל** חודשי הכרטיס (getAll פעם אחת לריצה),
  // ובתוך אותו חודש נשמר מונה המופעים (כפילות זהה נשארת חדשה).
  if(!cardRunSeen){cardRunSeen=new Map();try{for(const r of await cardHistAll()){const s=String(r.suffix||''),m=String(r.month||'');if(!s)continue;const bym=cardRunSeen.get(s)||new Map(),set=bym.get(m)||new Set();for(const t of r.transactions||[])set.add(cardTxKey(t));bym.set(m,set);cardRunSeen.set(s,bym)}}catch(e){}}
  for(const c of cards||[]){
    if(!c?.suffix)continue;
    const suffix=String(c.suffix),known=cardRunKnown.has(suffix),remaining=cardTxCounts(prevBySuffix.get(suffix)?.transactions),fresh=[];
    // "נראה בחודש אחר": דף 09 של ישראכרט חוזר על עסקאות אוגוסט שכבר נשמרו ב-08.
    const seenElsewhere=k=>{const bym=cardRunSeen.get(suffix);if(!bym)return false;for(const [m,set] of bym)if(m!==normalizedMonth&&set.has(k))return true;return false};
    for(const t of c.transactions||[]){const k=cardTxKey(t),left=remaining.get(k)||0;
      if(left>0){remaining.set(k,left-1);continue}
      if(seenElsewhere(k))continue;
      if(known)fresh.push(k)}
    // סנכרון ראשון של כרטיס הוא **קו הבסיס** ולא "הכול חדש": הרשומה נוצרת
    // ריקה, ומהסנכרון הבא ואילך ההפרש אמיתי.
    // "חדש" = נראה לראשונה ב-72 השעות שלפני הסנכרון הזה, **או** שתאריך העסקה
    // בתוך 72 השעות האלה. firstSeen נשמר לכל מפתח (30 יום), כדי שסנכרון
    // חוזר מחר לא יכבה את מה שנצבע היום.
    const prevMark=marks[suffix]||{},carry=prevMark.at===stamp?prevMark.keys||[]:[],firstSeen={};
    for(const [k,at] of Object.entries(prevMark.firstSeen||{}))if(stampMs-(Date.parse(at)||0)<=30*86400000)firstSeen[k]=at;
    for(const k of fresh)if(!firstSeen[k])firstSeen[k]=new Date(stampMs).toISOString();
    const since=stampMs-NEW_WINDOW_MS,recent=Object.keys(firstSeen).filter(k=>(Date.parse(firstSeen[k])||0)>=since),
      byDate=(c.transactions||[]).filter(t=>{const d=txDayMs(t.date);return Number.isFinite(d)&&d+86400000>since}).map(cardTxKey);
    marks[suffix]={at:stamp,keys:[...new Set([...carry,...recent,...byDate])].slice(0,800),firstSeen};
    if(rawMonth!==normalizedMonth)await cardHistDeleteMonths([rawMonth],[c.suffix]);
    await cardHistPut({id:cardHistId(c.suffix,normalizedMonth),suffix:c.suffix,month:normalizedMonth,
      name:c.name||'',issuer:c.issuer||'',amount:c.amount??null,chargeDate:c.chargeDate||'',
      transactions:c.transactions||[],savedAt:new Date().toISOString()});
  }
  await chrome.storage.local.set({cardNewMarks:marks});
  await cardHistPrune(12);
}
let isracardHistoryBusy=false;
const DISCONNECT_STREAK=6;
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
  // ⚠ 18.08.2026 — „אינו זמין בבורר" מוחזר **רק** כשהבורר כבר טעון והחודש פשוט אינו
  // ברשימה (selectedIndex>=0 הוא תנאי מוקדם). זו תשובה סופית, ו-24 ניסיונות ×
  // 500ms שרפו 12 שניות לכל חודש שאינו קיים — בדיוק מה שהאט כרטיס חדש או ריק.
  if(/אינו זמין בבורר/.test(String(last.error||'')))return last;
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
  if(!tab){await openLoginWindow({url:ISRACARD_HOME,type:'popup',width:560,height:780,focused:true});
    await chrome.storage.local.set({syncStatus:'ישראכרט: נפתח האתר — התחבר ואז בחר את החודש שוב'});
    return{ok:false,error:'נפתח אתר ישראכרט. התחבר, ואז נסה שוב.'}}
  if(running||autoBusy||isracardHistoryBusy)throw Error('סנכרון אחר כבר רץ — המתן לסיומו ונסה שוב');
  isracardHistoryBusy=true;beginCardRun();
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
async function loadIsracardYear(months=12,suffixes=[],onlyMissing=false){
  // ⚠ אם אין לשונית מחוברת — פותחים את האתר במקום לזרוק שגיאה. isracardTab מתעלם
  // מדפי התחברות, ולכן גם כשהמשתמש עומד על מסך הכניסה נראה כאילו "אין לשונית".
  let tab=await isracardTab();
  if(!tab){await openLoginWindow({url:ISRACARD_HOME,type:'popup',width:560,height:780,focused:true});
    await chrome.storage.local.set({syncStatus:'ישראכרט: נפתח האתר — התחבר ואז לחץ שוב על "טען שנה אחורה"'});
    return{ok:false,error:'נפתח אתר ישראכרט. התחבר, ואז לחץ שוב.'}}
  if(running||autoBusy||isracardHistoryBusy)throw Error('סנכרון אחר כבר רץ — המתן לסיומו ונסה שוב');
  isracardHistoryBusy=true;beginCardRun();
  try{
  const requested=new Set(suffixes.map(v=>String(v).replace(/\D/g,'').slice(-4)).filter(Boolean));
  await chrome.storage.local.set({syncStatus:requested.size?`ישראכרט: מאתר את כרטיס ${[...requested].join(', ')}`:'ישראכרט: קורא את רשימת הכרטיסים'});
  // ⚠ כשהסנכרון הרגיל כבר קרא את הרשימה, אין סיבה שכשל בקריאה חוזרת של
  // הקרוסלה יחסום טעינת שנה לכרטיס שכבר מוכר. isracardLastCards נכתב בסוף
  // כל סנכרון מוצלח, ומשמש כאן כרשת ביטחון.
  let summary=null;
  try{summary=await isracardSummaryFromHome(tab.id)}
  catch(e){
    const fallback=(await chrome.storage.local.get({isracardLastCards:[]})).isracardLastCards||[];
    const usable=fallback.filter(c=>c?.suffix&&(!requested.size||requested.has(String(c.suffix))));
    if(!usable.length)throw e;
    summary={ok:true,cards:usable};
    await chrome.storage.local.set({syncStatus:`ישראכרט: רשימת הכרטיסים לא נקראה מהדף — ממשיך לפי הרשימה מהסנכרון האחרון`});
  }
  const active=summary.cards.filter(c=>!c.cancelled&&(!requested.size||requested.has(String(c.suffix))));
  if(!active.length)throw Error(requested.size?'הכרטיס שנבחר לא נמצא בחיבור ישראכרט הפעיל':'לא נמצאו כרטיסים פעילים');
  let wanted=[];const d=new Date();
  for(let i=0;i<months;i++){wanted.push(mmYYYY(d));d.setMonth(d.getMonth()-1)}
  // גבול האיסוף חל גם כאן: אין טעם לפתוח דף של חודש שהמשתמש ביקש לא לאסוף.
  {const since=await collectSinceMs();
   if(since){const bound=new Date(since),boundOrd=bound.getUTCFullYear()*100+bound.getUTCMonth()+1;
     const before=wanted.length;
     wanted=wanted.filter(m=>Number(String(m).slice(2))*100+Number(String(m).slice(0,2))>=boundOrd);
     if(wanted.length<before)await chrome.storage.local.set({syncStatus:`ישראכרט: ${before-wanted.length} חודשים קודמים לתחילת איסוף הנתונים ולא ייקראו`});
     if(!wanted.length){await chrome.storage.local.set({syncStatus:'כל 12 החודשים קודמים לתאריך תחילת איסוף הנתונים — אין מה לאסוף'});return{ok:true,loaded:0,failed:[],skipped:0}}}}
  // טעינת שנה היא רענון מלא. אין לדלג לפי קיום חודש במסד: ריצה ישנה עלולה הייתה
  // לשמור את אותו דף תחת חודשים שונים. מוחקים רק את 12 חודשי המטמון המבוקשים;
  // כל חודש חוזר לתצוגה רק לאחר שהקריאה החדשה שלו הסתיימה ואומתה.
  // ⚠ ברירת המחדל נשארה רענון מלא, מהסיבה המתועדת למעלה. „השלם חסרים בלבד" הוא
  // בחירה מפורשת של המשתמש בדשבורד, ונוסף 18.08.2026 כי גם כרטיס בודד לוקח דקה
  // ארוכה כשאין מה לקרוא מחדש. הדילוג נשען על cardHistStats, שמחזיק months לכל סיומת.
  // ⚠ 28.08.2026 - טל: "שיזהה מראש איזה חודשים כבר סונכרנו ושאפילו לא ינסה
  // לסנכרן שוב - חוץ מהקרוב והקודם תמיד." שני החודשים החדשים ביותר נקראים
  // תמיד טרי, גם במצב "חסרים בלבד" - הם היחידים שעוד משתנים (עסקאות
  // מצטברות ותיקוני חיוב). קודם המצב הזה דילג גם עליהם - פער רעננות אמיתי.
  const alwaysFresh=new Set(wanted.slice(0,2));
  let todo=wanted;
  let histStats=null; // AUDIT (קטנות): cardHistStats סורק את כל המסד — נקרא פעם אחת וישרת גם את haveMonths למטה.
  if(onlyMissing){
    histStats=await cardHistStats().catch(()=>({}));
    const stats=histStats;
    todo=wanted.filter(month=>alwaysFresh.has(month)||!active.every(c=>(stats[String(c.suffix)]?.months||[]).includes(month)));
    if(!todo.length){await endProgress();await chrome.storage.local.set({syncStatus:`ישראכרט: כל ${wanted.length} החודשים כבר שמורים ל${active.length>1?`-${active.length} הכרטיסים`:`כרטיס ${active[0].suffix}`} — אין מה להשלים`});
      return{ok:true,loaded:0,failed:[],skipped:wanted.length}}
    await chrome.storage.local.set({syncStatus:`ישראכרט: ${wanted.length-todo.length} חודשים כבר שמורים — קורא ${todo.length} (הקרוב והקודם תמיד, והחסרים)`});
  }
  await chrome.storage.local.set({syncStatus:`ישראכרט: כרטיס ${active.map(c=>c.suffix).join(', ')} זוהה — מכין 12 חודשים`});
  // ⚠ 18.08.2026 — כאן עמדה מחיקה גורפת של 12 החודשים **לפני** הקריאה, ולכן ריצה
  // שנכשלה בקריאת הרשימה מחקה את ההיסטוריה הקיימת ולא העמידה דבר במקומה.
  // cardHistPut משתמש ב-id של `suffix|month` ודורס ממילא, לכן המחיקה עברה לתוך הלולאה:
  // חודש נמחק רק ברגע שיש לו מחליף טרי. כישלון לא מוחק עוד שום דבר.
  {const already=Object.values(haveMonths).reduce((s,v)=>s+v.size,0);
   await chrome.storage.local.set({syncStatus:already
     ?`ישראכרט: ${already} צירופי כרטיס־חודש כבר שמורים ויידולגו — קורא ${todo.length} חודשים עבור ${active.length} כרטיסים`
     :`ישראכרט: מתחיל קריאה של ${todo.length} חודשים עבור ${active.length} כרטיסים`});}
    // הגלגל גם בטעינת השנה, לא רק בסנכרון הרגיל. כל צעד = כרטיס בחודש.
  await beginProgress(todo.length*Math.max(1,active.length));
  // ⚠ 18.08.2026 — 8 כרטיסים × 12 חודשים = 96 דפים, וכל דף מחויב בשהייה של 4 שניות.
  // הסשן של ישראכרט נסגר באמצע, וכל שאר הקריאות חזרו ריקות: הגלגל הראה 96/96
  // בעוד שנשמרו 6 חודשים בלבד. רצף כשלים על כרטיסים שונים אינו תקלת כרטיס אלא
  // ניתוק — עוצרים ואומרים זאת, במקום לטחון עוד 40 דפים ריקים.
  // ⚠ 18.08.2026 — „פעיל מחודש X" כבר נשמר ב-isracardActiveSince מריצות קודמות,
  // אבל הריצה לא השתמשה בו והיתה מגלה אותו מחדש בכל פעם — כלומר משלמת שוב את
  // מחיר החודשים שאינם קיימים. עכשיו הידע הזה מזריע את הסריקה מראש.
  const knownSince=(await chrome.storage.local.get({isracardActiveSince:{}})).isracardActiveSince||{};
  const ord=m=>{const v=String(m||'').replace(/\D/g,'');return v.length===6?Number(v.slice(2)+v.slice(0,2)):0};
  let done=0,failed=[],oldestLoaded={},inactiveBefore=new Set(),streak=0,disconnected=false,preSkipped=0,cardSkipped=0;
  // ⚠ נקרא **פעם אחת** לפני הלולאה: `cardHistStats` סורק את כל המסד, ובתוך
  // לולאה של 12×8 זה היה 96 סריקות.
  const haveMonths={};
  if(onlyMissing){const stats=histStats||await cardHistStats().catch(()=>({}));
    for(const c of active)haveMonths[String(c.suffix)]=new Set(stats[String(c.suffix)]?.months||[]);}
  for(const month of todo){
    const out=[];
    for(let i=0;i<active.length;i++){
      const card=active[i];
      // כרטיס חדש אינו קיים בחודשים שקדמו להנפקתו. לאחר שבורר החודשים של
      // ישראכרט מודיע שהחודש אינו זמין, מפסיקים לבקש חודשים ישנים יותר עבורו.
      abortIfRequested();
      if(inactiveBefore.has(String(card.suffix)))continue;
      // כרטיס שכבר ידוע כפעיל רק מחודש מסוים — אין טעם לבקש חודשים שקדמו לו.
      if(knownSince[String(card.suffix)]&&ord(month)<ord(knownSince[String(card.suffix)])){preSkipped++;continue}
      // ⚠⚠ 27.08.2026 — טל: „עושה סנכרון לכל הכרטיסים, הוא אמור לדלג על כל
      // הכרטיסים שכבר סונכרנו." **נמדד:** הצ׳קבוקס „השלם חסרים בלבד" כבר מסומן
      // כברירת מחדל — אבל הדילוג היה **ברמת חודש בלבד**:
      //   todo=wanted.filter(month=>!active.every(c=>…includes(month)))
      // כלומר חודש שחסר **לכרטיס אחד** נקרא מחדש **לכל שמונת הכרטיסים**.
      // מכאן „סורק הכול" למרות שכמעט הכול שמור. **הדילוג עובר לרמת כרטיס.**
      if(onlyMissing&&!alwaysFresh.has(month)&&(haveMonths[String(card.suffix)]||new Set()).has(month)){cardSkipped++;continue}
      const pageStarted=Date.now();let pageOk=false;
      await syncStep(`היסטוריה ${month} · כרטיס ${i+1}/${active.length} (${card.suffix}) · חודש ${done+1}/${todo.length}`,`כרטיס ${card.suffix} · ${String(month).slice(0,2)}/${String(month).slice(2)}`);
      try{
        out.push(await readIsracardCardMonth(tab.id,card,month));oldestLoaded[String(card.suffix)]=month;streak=0;pageOk=true;
      }catch(e){
        // ⚠ הסריקה יורדת מהחודש החדש לישן, ולכן חודש שאינו בבורר מבטיח שגם כל
        // הקודמים לו אינם שם. עד 18.08.2026 נדרש כאן חודש שנטען קודם, ולכן כרטיס
        // חדש או כרטיס בלי חיובים שנפל כבר בחודש הראשון סרק את כל 12 החודשים
        // אחד-אחד — כל אחד מהם בעלות מלאה. עכשיו די בסימן אחד כדי לסגור אותו.
        if(/אינו זמין בבורר/.test(String(e?.message||''))){
          const suffix=String(card.suffix),since=oldestLoaded[suffix];
          inactiveBefore.add(suffix);
          await chrome.storage.local.set({syncStatus:since
            ?`כרטיס ${suffix}: פעיל מחודש ${since} — לא נדרשת קריאה לחודשים קודמים`
            :`כרטיס ${suffix}: ישראכרט אינו מציע את חודש ${month} — הכרטיס חדש או ללא חיובים, מדלג על החודשים הקודמים`});
        }else{failed.push(`${month}/${card.suffix}`);streak++}
      }
      finally{
        // זמן שהייה מינימלי מחייב לכל דף, גם אם בחירת החודש או הקריאה נכשלו.
        // בלי finally כשל עבר מיד לדף הבא ונראה כאילו המנגנון מדלג על הכול.
        // ⚠ הרצפה הזו נכתבה כדי שכישלון לא יזנק מיד לדף הבא ויראה כאילו מדלגים על הכול.
        // בקריאה שהצליחה כבר המתנו לטעינה אמיתית, ולכן שם היא רק מאריכה את הריצה.
        const remaining=(pageOk?1500:4000)-(Date.now()-pageStarted);if(remaining>0)await delay(remaining);
      }
      if(streak>=DISCONNECT_STREAK){disconnected=true;break}
    }
    if(out.length){await cardHistDeleteMonths([month],[...requested]);await storeCardMonth(month,out);done++}
    else failed.push(month);
    if(disconnected)break;
  }
  await endProgress();
  const state=await chrome.storage.local.get({isracardActiveSince:{}}),activeSince={...(state.isracardActiveSince||{})};
  for(const card of active){const suffix=String(card.suffix);if(inactiveBefore.has(suffix)&&oldestLoaded[suffix])activeSince[suffix]=oldestLoaded[suffix];else delete activeSince[suffix]}
  await chrome.storage.local.set({isracardActiveSince:activeSince});
  if(preSkipped)await chrome.storage.local.set({syncStatus:`ישראכרט: דילג על ${preSkipped} קריאות לחודשים שקדמו למועד הפתיחה הידוע של הכרטיסים`});
  await chrome.storage.local.set({syncStatus:disconnected
    ?`ישראכרט ניתק את הסשן — נשמרו ${done} חודשים ונעצרנו. התחבר שוב ולחץ על טעינת השנה; מה שנשמר נשאר.`
    :`היסטוריית כרטיסים: נטענו ${done} חודשים${failed.length?`, נכשלו ${failed.join(', ')}`:''}`});
  return{ok:true,loaded:done,failed,disconnected,cardSkipped,preSkipped};
  }finally{isracardHistoryBusy=false;await restoreSyncTabs()}
}
async function syncSelected(selectionKeys){
  if(!selectionKeys.length)throw Error('לא נבחרו חשבונות');if(running)throw Error('תהליך אחר כבר מתבצע');running=true;await markSyncInFlight(true,'חשבונות נבחרים');
  try{
    const grouped={business:[],private:[],leumi:[],'discount-business':[],'discount-private':[],mizrahi:[]};for(const selectionKey of selectionKeys){const parts=String(selectionKey).split('|');if(parts.length===2&&grouped[parts[0]])grouped[parts[0]].push(parts[1]);else grouped.business.push(selectionKey)}
    const saved=await chrome.storage.local.get({accounts:[],selectedAccountKeys:[],discoveredAccounts:[]});const syncedSources=['business','private','leumi','discount-business','discount-private','mizrahi'].filter(source=>grouped[source].length);
    // ⚠ 21.08.2026 — סנכרון ישות אחת מחק את כל השאר. הסינון כאן היה לפי **מקור**
    // (`!syncedSources.includes(a.source)`), ולכן סנכרון ישות אחת בדיסקונט עסקי סילק מן
    // האחסון את **כל** חשבונות discount-business השמורים — ובהם ישויות שלא
    // נגענו בהן — ודחף בחזרה רק את מה שנקרא עכשיו. זה „מחק את הסנכרון של
    // טל" מ-1.0.17. עכשיו מוסרים רק את מה ש**נתבקש** בריצה הזאת, לפי selectionKey.
    // לחשבונות שנשמרו לפני שהיה selectionKey יש שתי נפילות לאחור: entityId
    // (דיסקונט עסקי, שבו מפתח אחד נושא כמה חשבונות) וסניף-חשבון (פועלים, לאומי, מזרחי).
    // מפתח בלי `|` הולך ל-grouped.business למעלה, ולכן גם כאן הוא צריך לקבל את אותה
    // קידומת. בלעדיו החשבון הישן לא היה מזוהה כמוחלף, והנקרא היה נוסף לצידו ככפילות.
    const requested=new Set(selectionKeys.map(k=>{const key=String(k);return key.includes('|')?key:`business|${key}`}));
    const wasRequested=a=>{const source=a?.source||'business';return requested.has(String(a?.selectionKey||''))||(a?.entityId!=null&&requested.has(`${source}|${a.entityId}`))||requested.has(`${source}|${a?.branch||''}-${a?.accountNumber||''}`)};
    const fresh=[];
    for(const source of syncedSources)fresh.push(...(source==='leumi'?await syncLeumi(grouped[source]):source==='discount-business'?await syncDiscountBusiness(grouped[source]):source==='discount-private'?await syncDiscountPrivate(grouped[source]):source==='mizrahi'?await syncMizrahiSelected(grouped[source]):await syncSource(source,grouped[source])));
    // ⚠ 18.08.2026 — „דיסקונט לא מסיים את הסנכרון": הסנכרון דווקא הסתיים („הסתיים
    // בהצלחה: 10 חשבונות · 6 תנועות חדשות"), אבל discoverDiscountBusiness המשיך
    // אחריו וכתב „מזהה מספר חשבון 3 מתוך 4". הזיהוי מיותר ברגע שהמשתמש כבר סנכרן
    // את החשבונות — ולכן דגל הזיהוי נסגר כאן, והלולאה שלו יוצאת באמצע.
    if(syncedSources.includes('discount-business'))await chrome.storage.local.set({pendingDiscountBusiness:false,discountAttempts:0});
    if(syncedSources.includes('discount-private'))await chrome.storage.local.set({pendingDiscountPrivate:false});
    // ⚠ סימון „תנועה חדשה" חל רק על מה שנקרא עכשיו. מרגע שהחשבונות שלא נגענו
    // בהם שורדים את הסנכרון, הרצה של הסימון גם עליהם היתה מוצאת כל תנועה
    // זהה לעצמה ומכבה לה את סימן החדשות. גם newCount נספר על הריצה בלבד, כפי שהמסר מעיד.
    const markedFresh=markNewTransactions(saved.accounts,fresh,syncedSources),newCount=markedFresh.reduce((n,a)=>n+(a.transactions||[]).filter(t=>t.isNew).length,0);// ⚠⚠ 22.08.2026 — **סנכרון אינו מוחק נתונים.** עד כאן רץ במקום הזה
    // applyCollectSince על **כל** הרשימה — כולל חשבונות שלא סונכרנו — ולכן
    // סנכרון של ישות אחת גזם את החודשים הישנים של כל שאר החשבונות בכל
    // הבנקים. נמדד אצל טל: סנכרון יובל לבדו עם גבול מרץ מוחק 70 תנועות
    // משלוש ישויות שלא נגע בהן.
    // „תחילת איסוף נתונים" מפצלת עכשיו לשתיים: collectSince הוא **טווח
    // משיכה** בלבד (מאיזה חודש לבקש מהבנק — עדיין בתוקף ב-storeCardMonth,
    // בשיקים ובטווח שנשלח לאתר דיסקונט), ו-viewSince הוא **סינון תצוגה**
    // בדשבורד. שיקול המקום שיכול היה להצדיק מחיקה אינו קיים: יש
    // unlimitedStorage, ו-503 תנועות שוקלות 80KB.
    // WHY (AUDIT סעיף 2): 'untouched' חושב עד כה מקריאה שנעשתה לפני דקות,
    // וכל מה שנכתב לאחסון בזמן הסנכרון — שיוך כרטיסים, ה-stash של לאומי,
    // סנכרון מקביל — נדרס כאן בשקט. עכשיו הרשימה נקראת מחדש ברגע השמירה,
    // בתוך המנעול, והסינון wasRequested רץ עליה.
    let marked,sanityAlerts=[];const savedResult=await accountsMutex(async()=>{
    const accountsNow=((await chrome.storage.local.get({accounts:[]})).accounts)||[];
    // ⚠ 03.09.2026 - הכרטיסים שהמנפיק שייך לחשבון שורדים את החלפת הרשומה (ראה keepAssignedCards).
    for(let i=0;i<markedFresh.length;i++)markedFresh[i]=keepAssignedCards(accountsNow,markedFresh[i]);
    marked=[...accountsNow.filter(a=>!wasRequested(a)),...markedFresh];
    // AUDIT סעיף 8: שער שפיות. כשבנק משנה עיצוב, שדות חוזרים ריקים ונשמרים
    // כאמת — "200 שורות, 200 עתידיות" של 27.08 היה בדיוק זה. ההשוואה מול
    // מה שהיה שמור הופכת שקט חשוד להתרעה. לא חוסמים שמירה — מסמנים ואומרים.
    {const prevById=new Map(accountsNow.map(a=>[a.id,a]));sanityAlerts=[];
    for(const a of markedFresh){const old=prevById.get(a.id);if(!old)continue;
      const oldTx=(old.transactions||[]).length,newTx=(a.transactions||[]).length;
      const bad=[];
      if(old.balance!=null&&a.balance==null)bad.push('היתרה נעלמה');
      if(oldTx>=20&&newTx<oldTx*0.2)bad.push(`התנועות צנחו ${oldTx}→${newTx}`);
      if((old.loans||[]).length>0&&(a.loans||[]).length===0)bad.push(`${old.loans.length} הלוואות נעלמו`);
      if(bad.length){sanityAlerts.push(`${a.sourceLabel||a.source} ${a.branch}-${a.accountNumber}: ${bad.join(' · ')}`);
        a.status=`${a.status||'מסונכרן'} · ⚠ ${bad.join(' · ')}`;}}}
    // ⚠ אותה תקלה בבחירה עצמה: הסינון לפי מקור מחק מ-selectedAccountKeys את
// מפתחות הישויות שלא סונכרנו בריצה הזאת, וכך הן נשרו גם מן הסנכרון
// האוטומטי. ביטול בחירה נעשה בדשבורד ונכתב לאחסון ישירות, ולכן כאן איחוד פשוט.
const finalKeys=[...new Set([...saved.selectedAccountKeys.map(String),...selectionKeys.map(String)])],leumiAccounts=marked.filter(a=>a.source==='leumi'),leumiPartial=leumiAccounts.filter(a=>/חלקית/.test(a.status||'')).length,leumiStatus=`${leumiPartial?`הסתיים חלקית (${leumiPartial} מתוך ${leumiAccounts.length} חסרים תנועות)`:'הסתיים ואומת'}: ${leumiAccounts.length} חשבונות, ${leumiAccounts.reduce((s,a)=>s+(a.transactions?.length||0),0)} תנועות, ${leumiAccounts.reduce((s,a)=>s+(a.loans?.length||0),0)} הלוואות, ${leumiAccounts.reduce((s,a)=>s+(a.chequeCount||0),0)} הפקדות שיקים`;// ⚠ 18.08.2026 — טל: „מאיפה מצא 10 חשבונות? יש רק 4 וביקשתי לסנכרן אחד."
// marked.length הוא **כל** מה ששמור בכל הבנקים (10 רשומות), ולא מה שסונכרן בריצה.
// המסר אמר „הסתיים בהצלחה: 10 חשבונות" והשתמע שסונכרנו עשרה. עכשיו שני המספרים
// נפרדים ומסומנים.
const now=new Date().toISOString(),baseStatus=syncedSources.includes('leumi')?leumiStatus:`הסתיים בהצלחה: סונכרנו ${selectionKeys.length} ${selectionKeys.length===1?'חשבון':'חשבונות'} · סך הכל שמורים ${marked.length}`;await chrome.storage.local.set({accounts:marked,
// ⚠ בסיום מוצלח הבורר אכן נצרך — אבל **רק של המקורות שסונכרנו**.
// קודם נמחקה הרשימה כולה, ולכן סיום סנכרון בבנק אחד הרג בורר של בנק
// אחר שהמתין לבחירה. `syncedSources` כבר קיים כאן, ומדויק לצורך.
discoveredAccounts:((await chrome.storage.local.get({discoveredAccounts:[]})).discoveredAccounts||[]).filter(a=>a&&!syncedSources.includes(a.source)),
selectedAccountKeys:finalKeys,accountFilter:'both',syncStatus:`${baseStatus}${newCount?` · ${newCount} תנועות חדשות`:' · אין תנועות חדשות'}`,lastNewTransactionCount:newCount,lastAutoSync:now});
    if(sanityAlerts.length)await chrome.storage.local.set({sanityAlerts:{at:now,alerts:sanityAlerts},
      syncStatus:`${baseStatus} · ⚠ ${sanityAlerts.length} בדיקות שפיות נכשלו — ראה סטטוס החשבונות`});
    else await chrome.storage.local.remove('sanityAlerts');});{const s=await chrome.storage.local.get({autoSyncLast:{}}),t=Date.now();for(const k of selectionKeys)s.autoSyncLast[String(k).split('|')[0]]=t;await chrome.storage.local.set({autoSyncLast:s.autoSyncLast})}await closeSyncTabs();if(!autoBusy)await chrome.runtime.openOptionsPage();return{ok:true,count:marked.length,newCount};
  }catch(e){await chrome.storage.local.set({syncStatus:e.message===ABORT_MESSAGE?`${ABORT_MESSAGE} — מה שנקרא עד כאן נשמר`:`שגיאה: ${e.message}`,lastSyncError:{at:new Date().toISOString(),text:String(e.message||'').slice(0,300)}});throw e}finally{running=false;await markSyncInFlight(false);await endProgress();await clearAbort();await restoreSyncTabs()}
}
function accountSyncKey(a){return`${a?.source||'business'}|${a?.branch||''}-${a?.accountNumber||''}`}
// ⚠⚠ 03.09.2026 - טל: "הבינלאומי חיבור 1 מצא את כל התנועות כחדשות למרות שהיו
// תנועות עבר שמורות." נמדד ביומן האחסון (שלוש גרסאות עוקבות של accounts):
//   14:16  89 שורות  "21.06.2026" · "ריבית על הלוואה 28/05 00650" · balance 10143.74
//   14:26  30 שורות  "21/06/2026" · "00650 28/05 ריבית על הלוואה" · balance null
//   14:29  89 שורות  "21.06.2026" · …                                       -> 89 "חדש"
// אותה תנועה, שני ענפי קריאה של המסך החדש: תאריך בלוכסנים, מילות התיאור
// בסדר הפוך, יתרה חסרה. המפתח הישן כלל את שלושתם ולכן נשבר. עכשיו: כשיש
// אסמכתא - המפתח הוא תאריך (מנורמל) + אסמכתא + חובה + זכות; בלי אסמכתא -
// תאריך + פעולה + פרטים + סכומים. היתרה אינה חלק מהמפתח בשום מקרה.
function transactionSyncKey(t){
  const date=String(t?.date||'').trim().replace(/[\/@-]/g,'.'),ref=String(t?.reference||'').replace(/\D/g,''),debit=Number(t?.debit)||0,credit=Number(t?.credit)||0;
  if(ref)return JSON.stringify([date,ref,debit,credit]);
  const norm=v=>String(v||'').replace(/\s+/g,' ').trim();
  return JSON.stringify([date,norm(t?.action),norm(t?.details),debit,credit]);
}
// ⚠⚠ 03.09.2026 - טל: "שיוצגו רק התנועות החדשות עם המילה חדש ... רק של ה-72
// שעות האחרונות מהסנכרון האחרון. גם תנועה שמופיעה בפעם הראשונה."
// עד כאן הדגל חושב מחדש בכל סנכרון: מה שלא היה שמור = חדש, וכל השאר כבוי.
// כלומר סנכרון חוזר כיבה הכול, ו-newAt נשמר אך איש לא קרא אותו.
// הכלל עכשיו: תנועה היא "חדש" אם נראתה לראשונה ב-72 השעות שלפני הסנכרון
// (newAt נגרר משורה לשורה), **או** שתאריך התנועה בתוך 72 השעות האלה.
// תאריך בנק הוא יום בלי שעה, ולכן יום שמסתיים אחרי תחילת החלון נחשב בפנים.
const NEW_WINDOW_MS=72*3600*1000;
function txDayMs(v){const m=String(v||'').match(/(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{2,4})/);if(!m)return NaN;let y=Number(m[3]);if(y<100)y+=2000;return new Date(y,Number(m[2])-1,Number(m[1])).getTime()}
function isRecentNew(row,atMs){const since=atMs-NEW_WINDOW_MS,seen=Date.parse(row?.newAt||'');if(Number.isFinite(seen)&&seen>=since)return true;const day=txDayMs(row?.date);return Number.isFinite(day)&&day+86400000>since}
function markNewTransactions(previous,next,syncedSources){
  const oldByAccount=new Map((previous||[]).map(a=>[accountSyncKey(a),a])),allowed=new Set(syncedSources||[]),markedAt=new Date().toISOString(),atMs=Date.parse(markedAt);
  return(next||[]).map(account=>{
    if(!allowed.has(account.source||'business'))return account;
    const old=oldByAccount.get(accountSyncKey(account)),oldRows=old?.transactions||[];
    // סנכרון ראשון של חשבון הוא קו בסיס: אין "נראה לראשונה", רק כלל התאריך.
    if(!old||!oldRows.length)return{...account,transactions:(account.transactions||[]).map(t=>{const{newAt,...rest}=t;return{...rest,isNew:isRecentNew(rest,atMs)}})};
    // ⚠ 04.09.2026 - מזרחי מקבל עכשיו details (שם ההעברה) לשורות שבעבר נשמרו
    // בלי. המפתח המלא כולל details, ולכן כל השורות היו נראות "חדש" פעם אחת -
    // בדיוק הלקח מ-2.3.6. התאמה רופפת (בלי details) כשאחד הצדדים ריק.
    const norm=v=>String(v||'').replace(/\s+/g,' ').trim(),loose=t=>JSON.stringify([String(t?.date||'').trim().replace(/[\/@-]/g,'.'),norm(t?.action),Number(t?.debit)||0,Number(t?.credit)||0]);
    const push=(m,k,v)=>{if(!m.has(k))m.set(k,[]);m.get(k).push(v)},byKey=new Map(),byLoose=new Map(),used=new Set();
    for(const row of oldRows){push(byKey,transactionSyncKey(row),row);push(byLoose,loose(row),row)}
    const take=(list,pred)=>{const hit=(list||[]).find(r=>!used.has(r)&&(!pred||pred(r)));if(hit)used.add(hit);return hit||null};
    return{...account,transactions:(account.transactions||[]).map(row=>{
      const prev=take(byKey.get(transactionSyncKey(row)))||take(byLoose.get(loose(row)),p=>!norm(p.details)||!norm(row.details));
      if(prev){const{newAt,...rest}=row,kept=prev.newAt?{...rest,newAt:prev.newAt}:rest;return{...kept,isNew:isRecentNew(kept,atMs)}}
      return{...row,isNew:true,newAt:markedAt}})};
  })
}
async function syncSource(source,keys){
  const cfg=SOURCES[source],tabs=await chrome.tabs.query({url:[`https://${cfg.host}${cfg.portal}*`]});if(!tabs.length)throw Error(`החיבור אל ${cfg.label} אינו פעיל`);const tab=tabs[0];noteSyncTab(tab.id);await returnToDashboard(tab.id,true);await beginProgress(source==='private'?5:4);const skippedParts=[];
  let owner='';if(source==='private'){await syncStep(`${cfg.label}: מזהה את בעל החשבון`,'מזהה בעל חשבון');await prepareRoute(tab.id,route(source,'homepage'),'/homepage');const ownerResult=await chrome.tabs.sendMessage(tab.id,{type:'EXTRACT_OWNER'});owner=ownerResult?.owner||'';if(owner)await chrome.storage.local.set({privateOwnerName:owner})}
  await syncStep(`${cfg.label}: מסנכרן תנועות`,'מוריד תנועות');await prepareRoute(tab.id,route(source,'current-account/transactions'),'/current-account/transactions');
  // ⚠⚠ 27.08.2026 — טל: „יש בעיה עם הבורר תנועות" ⇐ „מעט תנועות". נמדד:
  // ל-`poalim-content.js` **אין שום טיפול בטווח תאריכים** (`grep collectSince` → 0),
  // ולכן נקרא רק מה שהדף מציג כברירת מחדל: 4 תנועות ב-645-690309 ו-6 ב-645-690300,
  // מול `collectSince=2026-01-01`. **ה-DOM של דף התנועות בפועלים לא נמדד מעולם.**
  // ⚠ כתבתי כאן גשש חדש ומחקתי אותו: `probe-content.js` כבר עושה את זה, וה-
  // `dateControls()` שבו נכתב **בדיוק** לשאלה הזו. גשש רביעי לאותו רעיון הוא בדיוק
  // הכשל שנרשם על שלושת העותקים ביהב. **לבדוק יכולת קיימת לפני שכותבים חדשה.**
  try{
    await chrome.scripting.executeScript({target:{tabId:tab.id},files:['probe-content.js']});
    await delay(400);
    const pr=await chrome.tabs.sendMessage(tab.id,{type:'BANK_PROBE'});
    // ⚠ נשמר **לפני** הקריאה — הלקח מ-1.8.0, שם הרשומה אבדה כשהשלב הבא נפל.
    if(pr?.ok)await chrome.storage.local.set({poalimTxProbe:{at:new Date().toISOString(),source,...pr.probe}});
  }catch{}
  // ⚠ גבול האיסוף נשלח לקובץ התוכן — שם נקבעת התקופה, בתוך לולאת החשבונות.
  const tx=await chrome.tabs.sendMessage(tab.id,{type:'EXTRACT_SELECTED',keys,since:await collectSinceMs()});
  try{const reports=(tx?.accounts||[]).map(a=>({key:`${a.branch}-${a.accountNumber}`,...(a.periodProbe||{})}));
    if(reports.length)await chrome.storage.local.set({poalimPeriodProbe:{at:new Date().toISOString(),reports}})}catch{}
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
async function startFibi(slot){
// ⚠ אותו תיקון כמו ביהב, ומאותה סיבה. **הוחל לפי דפוס ולא לפי מדידה** —
// לא נמדדה תקלה בבינלאומי, אבל המבנה זהה והתקדים (`startLeumi`) ברור.
const __prevF=await chrome.storage.local.get({discoveredAccounts:[]});
await chrome.storage.local.set({pendingFibiSlot:slot,pendingFibiName:'',
  discoveredAccounts:(__prevF.discoveredAccounts||[]).filter(a=>a&&a.source!=='fibi'),pendingDiscountBusiness:false,syncStatus:'בודק חיבור פעיל לבינלאומי'});const tabs=await chrome.tabs.query({url:['https://online.fibi.co.il/*']});const connected=tabs.find(tab=>tab.url?.includes('/shell/#/'));
// ⚠⚠ 03.09.2026 - טל (פעמיים): "נמצא חיבור פעיל למרות שאין אחד כזה." עד כאן
// "מחובר" נקבע לפי **כתובת** בלבד: כל לשונית על /shell/#/ - גם דף שהסשן שלו
// פג, גם לשונית מושהית בחלון נסתר. עכשיו הלשונית נבדקת **חי**: קריאת
// FIBI_SUMMARY חייבת להחזיר מספר חשבון. נכשלה - הלשונית אינה מחוברת,
// הגשש נשמר (fibiConnectedProbe) ונפתח חלון התחברות כרגיל.
if(connected){
  const probe={id:connected.id,windowId:connected.windowId,title:connected.title||'',url:String(connected.url||'').slice(0,160),discarded:!!connected.discarded,at:new Date().toISOString()};
  let alive=false,why='';
  try{if(!String(connected.url||'').includes('#/accountSummary')){await chrome.tabs.update(connected.id,{url:'https://online.fibi.co.il/appsng/Resources/PortalNG/shell/#/accountSummary'});await delay(2000)}
    const r=await fibiRead(connected.id,'FIBI_SUMMARY','אימות חיבור לבינלאומי',5);alive=!!r?.data?.accountNumber;if(!alive)why='הדף לא מציג מספר חשבון'}catch(e){why=e.message}
  await chrome.storage.local.set({fibiConnectedProbe:{...probe,alive,why}});
  if(alive){await returnToDashboard(connected.id,true);syncFibi(connected.id).catch(()=>{});return{ok:true,status:'syncing_connected',tab:{title:probe.title,windowId:probe.windowId}}}
  await chrome.storage.local.set({syncStatus:`נמצאה לשונית של הבינלאומי שאינה מחוברת (${why}) — נפתח חלון התחברות`});
}
if(!connected)await chrome.storage.local.set({syncStatus:'ממתין להתחברות לבינלאומי'});await openLoginWindow({url:FIBI_LOGIN,type:'popup',width:560,height:780,focused:true});return{ok:true,status:'waiting_login'}}
async function openFibiSchedule(tabId,args){const results=await chrome.scripting.executeScript({target:{tabId,allFrames:true},world:'MAIN',args:[args],func:(values)=>{if(typeof window.luachSilukin!=='function')return false;window.luachSilukin(...values);return true}});if(!results.some(x=>x.result===true))throw Error('פונקציית לוח הסילוקין לא נמצאה במסגרת הבנק');return{ok:true}}
async function closeFibiSchedule(tabId){await chrome.scripting.executeScript({target:{tabId,allFrames:true},world:'MAIN',func:()=>{const close=document.querySelector('[role="dialog"] a[href="#"], .ui-dialog a[href="#"]');if(close){close.click();return true}return false}});return{ok:true}}
async function enrichFibiInstallments(tabId,loans){for(const loan of loans||[]){if(!loan.scheduleArgs?.length)continue;try{await closeFibiSchedule(tabId);await delay(500);await openFibiSchedule(tabId,loan.scheduleArgs);let current=0;const expected=`${loan.scheduleArgs[2]}-${loan.scheduleArgs[0]}`;for(let n=0;n<50&&!current;n++){await delay(250);const reads=await chrome.scripting.executeScript({target:{tabId,allFrames:true},args:[expected],func:(loanCode)=>{const frame=document.querySelector('#myFrame'),doc=frame?.contentDocument;if(!doc||!doc.body?.innerText?.includes(loanCode))return 0;for(const row of doc.querySelectorAll('[role="row"]')){const first=row.querySelector('[role="gridcell"]')?.textContent?.trim();if(/^\d+$/.test(first||''))return Number(first)}return 0}});current=Number(reads.find(x=>Number(x.result)>0)?.result||0)}const parse=v=>{const m=String(v||'').match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);if(!m)return null;let y=Number(m[3]);if(y<100)y+=2000;return{m:Number(m[2]),y}};const from=parse(loan.nextPaymentDate),to=parse(loan.endDate);if(current&&from&&to){const remaining=(to.y-from.y)*12+to.m-from.m+1,total=current-1+remaining;if(remaining>0&&total>=remaining){loan.installments=`${current-1}/${total}`;loan.remainingInstallments=remaining;loan.totalInstallments=total}}await closeFibiSchedule(tabId);await delay(500)}catch(e){try{await closeFibiSchedule(tabId)}catch{}}delete loan.scheduleArgs}return loans}
async function fibiRead(tabId,type,label,attempts=24){let last='';const responseTimeout=type==='FIBI_LOANS'?60000:12000;for(let i=0;i<attempts;i++){try{const r=await withTimeout(chrome.tabs.sendMessage(tabId,{type}),responseTimeout,label);if(r?.ok)return r;last=r?.error||'הדף עדיין לא מוכן'}catch(e){last=e.message;try{await chrome.scripting.executeScript({target:{tabId},files:['fibi-content.js']})}catch{}}await delay(750)}throw Error(`${label}: ${last}`)}
async function syncFibi(tabId){noteSyncTab(tabId);
  const state=await chrome.storage.local.get({pendingFibiSlot:'',accounts:[]});if(!state.pendingFibiSlot||running)return;running=true;
  try{
    await delay(1800);const tab=await chrome.tabs.get(tabId);if(!tab.url?.includes('#/accountSummary')){await chrome.tabs.update(tabId,{url:'https://online.fibi.co.il/appsng/Resources/PortalNG/shell/#/accountSummary'});await delay(2200)}
    const s=await fibiRead(tabId,'FIBI_SUMMARY','קריאת סיכום הבינלאומי');
    await chrome.tabs.update(tabId,{url:'https://online.fibi.co.il/appsng/Resources/PortalNG/shell/#/Online/OnAccountMngment/OnSummaryReports/createOwnerApproval'});await delay(1800);
    const ownerResult=await fibiRead(tabId,'FIBI_OWNER','קריאת שם בעל החשבון');const owner=ownerResult.data||{fullName:'',firstName:''};
    if(state.pendingFibiSlot==='auto'){                                       // כניסה עצמאית: החיבור נקבע לפי מספר החשבון שבדף
      const match=state.accounts.find(a=>a.source?.startsWith('fibi-')&&a.accountNumber===s.data.accountNumber);
      if(!match)throw Error(`חשבון ${s.data.accountNumber} אינו אחד מחיבורי הבינלאומי שנשמרו`);
      state.pendingFibiSlot=match.source;await chrome.storage.local.set({pendingFibiSlot:match.source});
    }
    const existingSame=state.accounts.find(a=>a.source?.startsWith('fibi-')&&a.accountNumber===s.data.accountNumber&&a.source!==state.pendingFibiSlot);if(existingSame)throw Error('זהו אותו חשבון שכבר נשמר בחיבור האחר');
    // ⚠ 28.08.2026 - DELTA-AUDIT פער 4: יתרה זהה לשמור => ההלוואות ולוחות
    // הסילוקין (החלק הכבד - דיאלוג לכל הלוואה, עד 50 סבבים×250ms) נלקחים
    // מהשמור. תשלום הלוואה משנה את יתרת העו"ש, ולכן יתרה-זהה מכסה גם אותן.
    // התנועות עדיין נקראות תמיד - יתרה זהה אינה מוכיחה היעדר תנועות
    // (שתי נגדיות באותו סכום), והלקח הזה נקבע ע"י טל בדיסקונט.
    const savedFibi=state.accounts.find(a=>a.source===state.pendingFibiSlot);
    const fibiBalSame=!!(savedFibi&&savedFibi.balance!=null&&Number.isFinite(Number(s.data.balance))&&Math.abs(Number(s.data.balance)-Number(savedFibi.balance))<0.005);
    let loanResult;
    if(fibiBalSame&&(savedFibi.loans||[]).length){
      loanResult={data:{loans:savedFibi.loans.map(l=>({...l}))}};
      await chrome.storage.local.set({syncStatus:'הבינלאומי: היתרה לא השתנתה — ההלוואות ולוחות הסילוקין נלקחו מהמסד'});
    }else{
      await chrome.storage.local.set({syncStatus:'הבינלאומי: קורא פירוט הלוואות ומשכנתאות'});
      await chrome.tabs.update(tabId,{url:'https://online.fibi.co.il/appsng/Resources/PortalNG/shell/#/Online/OnLoansMortgageMenu/OnLoans/AuthLoansDetails'});await delay(2200);
      loanResult=await fibiRead(tabId,'FIBI_LOANS','קריאת פירוט ההלוואות');loanResult.data.loans=await enrichFibiInstallments(tabId,loanResult.data.loans||[]);
    }
    // ⚠⚠ קודם מנסים את המסך החדש („תנועות בחשבון"), לפי בקשת טל: שם הטווח
    // נבחר בחלונית רגילה **וכל התנועות בעמוד אחד**. ⚠ הנתיב אינו ידוע ולכן
    // אינו מנוחש — נלחץ פריט התפריט, והמדידה נשמרת כדי שייכתב לו מתאם.
    // המסך הישן נשאר המסלול הפעיל עד שהחדש נכתב ואומת.
    // ⚠⚠ המסלול המועדף: המסך החדש. אם הוא מספק תנועות — **דילוג מוחלט על
    // המסך הישן**, על `LinkForm077` ועל הדפדוף. אם לא — נופלים לישן, שעדיין עובד.
    let newTx=null,newReport=null;
    try{const opened=await fibiOpenNewScreen(tabId);
      if(opened?.navigated){
        await delay(2500);
        const rng=await fibiNewRange(tabId,await collectSinceMs());
        await delay(1200);
        let read=null;try{read=await fibiRead(tabId,'FIBI_NEW_TX','קריאת תנועות מהמסך החדש',8)}catch(e){}
        const rows=read?.data?.transactions||[];
        const dg=read?.data?.__diag||{};
        newReport={opened,rng,rows:rows.length,headers:dg.headers||[],aligned:dg.aligned,rawSample:dg.rawSample||[]};
        // ⚠ האבחון נשאר בדוח ואינו נכנס לחשבון; קודם נשמרו בו
        // `headers`/`rawSample`/`rowCount` כשדות זרים.
        // ⚠ 03.09.2026 - נמדד: קריאה מהמסך החדש החזירה 30 שורות במקום 89 (הטווח
        // לא הוחל - "תנועות אחרונות") והחליפה את כל השמור. קריאה שמחזירה פחות
        // ממחצית מהשמור נדחית, והמסלול הישן (עם הדפדוף) רץ במקומה.
        const savedN=(savedFibi?.transactions||[]).length;
        if(rows.length&&savedN>=20&&rows.length<savedN*0.5)newReport.rejected=`${rows.length} שורות מול ${savedN} שמורות — נופלים למסך הישן`;
        else if(rows.length){newTx={...read.data};delete newTx.__diag;}
      }else newReport={opened};
      await chrome.storage.local.set({fibiNewScreen:{at:new Date().toISOString(),...newReport}});
    }catch(e){try{await chrome.storage.local.set({fibiNewScreen:{at:new Date().toISOString(),error:String(e?.message||e).slice(0,120)}})}catch(e2){}}
    if(newTx){
      const dg=(await chrome.storage.local.get({bankDiagnostics:{}})).bankDiagnostics||{};
      delete dg.fibi;await chrome.storage.local.set({bankDiagnostics:dg});
    }
    // ⚠⚠ 27.08 — טל: „הוא עדיין פונה גם ללשונית עם התנועות הישנות ומבזבז
    // זמן סנכרון." צודק: הניווט ל-`PrivateAccountFlow`, הגשש, ו-`fibiSetRangeMain`
    // רצו **תמיד** — גם כשהמסך החדש כבר החזיר תנועות. זה ניווט מיותר, קביעת
    // טווח מיותרת, וכ-10 שניות לחינם. **כל מסלול המסך הישן מותנה עכשיו.**
    if(!newTx){
      await chrome.tabs.update(tabId,{url:'https://online.fibi.co.il/appsng/Resources/PortalNG/shell/#/Online/OnAccountMngment/OnBalanceTrans/PrivateAccountFlow'});await delay(2200);
      // ⚠ מדידה בלבד, לפני הקריאה. `fibi-content.js` אינו מזכיר `collectSince`
      // אף פעם (grep → 0), כלומר לבינלאומי אין טווח תאריכים בכלל — אותו מחדל
      // שהיה בפועלים. **לא נכתב כאן שום סלקטור** לפני שנדע מה יש בדף ובמסגרת.
      try{const frames=await probeAllFrames(tabId);
        await chrome.storage.local.set({fibiTxProbe:{at:new Date().toISOString(),frames}})}catch(e){}
      // ⚠ קביעת הטווח לפני הקריאה. הלשונית הפעילה היא „תנועות אחרונות" ולכן
      // נשמרו 30 תנועות מ-01/06 בלבד. הדוח נשמר תמיד — גם כשלא הוחל — כדי
      // שכשל יהיה ניתן לאבחון בקריאה אחת.
      try{const since=await collectSinceMs();
        // ⚠ המסלול הראשי הוא `world:'MAIN'`; מסלול קובץ התוכן נשאר כנפילה בלבד,
        // אחרי שהוכח שהוא אינו יכול להפעיל את הלשונית.
        let rng=await fibiSetRangeMain(tabId,since);
        if(!rng||rng.ok===false||!rng.panelOpen)
          {const alt=await withTimeout(chrome.tabs.sendMessage(tabId,{type:'FIBI_SET_RANGE',since}),45000,'טווח התאריכים בבינלאומי').catch(e=>({applied:false,why:String(e?.message||e).slice(0,80)}));
           rng={...alt,main:rng};}
        await chrome.storage.local.set({fibiRangeApplied:{at:new Date().toISOString(),...(rng||{})}});
        // ⚠⚠ 27.08 — האחסון עבר דחיסה (`.ldb` דחוס ב-Snappy) ו-`fibiRangeApplied`
        // לא היה קריא לי אחרי הריצה. **אבחון שאי אפשר לקרוא אינו אבחון.**
        // שורה אחת קריאה נכנסת ל-`bankDiagnostics`, שהדשבורד כבר מציג.
        {const dg=(await chrome.storage.local.get({bankDiagnostics:{}})).bankDiagnostics||{};
         const m=rng?.main||rng;
         dg.fibi=(rng?.panelOpen||rng?.applied)
           ?`הבינלאומי: לשונית ${m?.after?.active||'?'} · ${m?.how||''} · שיגור ${m?.submitted||rng?.submitPath||'?'} · שורות ${m?.before?.rows??rng?.before?.rows??'?'}→${m?.after?.rows??rng?.after?.rows??'?'}`
           :`הבינלאומי: הטווח לא הוחל — ${rng?.why||rng?.error||m?.error||'סיבה לא ידועה'}`;
         await chrome.storage.local.set({bankDiagnostics:dg});}
        await delay(1500);
      }catch(e){try{await chrome.storage.local.set({fibiRangeApplied:{at:new Date().toISOString(),ok:false,error:String(e?.message||e).slice(0,120)}})}catch(e2){}}
      // ⚠ אם המסך החדש כבר סיפק תנועות, לא נוגעים במסך הישן בכלל.
    }
    const t=newTx?{ok:true,data:{...newTx}}:await fibiRead(tabId,'FIBI_TRANSACTIONS','קריאת תנועות הבינלאומי');
    if(newTx)await chrome.storage.local.set({syncStatus:`הבינלאומי: ${newTx.transactions.length} תנועות מהמסך החדש`});
    // ⚠⚠ דפדוף: התוצאה מחולקת לעמודים („עמוד - 3" בצילום), וקריאת עמוד אחד
    // מחזירה טווח חלקי. ⚠ **הקורא נשאר `FIBI_TRANSACTIONS`** — אין עותק שני
    // של הפרסר; העולם הראשי רק מתקדם עמוד, וכל עמוד נקרא במסלול הקיים.
    if(!newTx){const pages=[{n:1,count:(t.data?.transactions||[]).length}];
     const seen=new Set((t.data?.transactions||[]).map(x=>`${x.date}|${x.reference||''}|${x.debit??''}|${x.credit??''}|${x.description||x.action||''}`));
     let guard=0;
     while(guard++<40){
       const step=await fibiPager(tabId,'next');
       if(!step?.ok||!step.advanced)break;
       await chrome.storage.local.set({syncStatus:`הבינלאומי: קורא עמוד ${guard+1}`});
       let more=null;
       try{more=await fibiRead(tabId,'FIBI_TRANSACTIONS',`קריאת עמוד ${guard+1} בבינלאומי`)}catch(e){break}
       const rows=more?.data?.transactions||[];
       let added=0;
       for(const x of rows){const k=`${x.date}|${x.reference||''}|${x.debit??''}|${x.credit??''}|${x.description||x.action||''}`;
         if(seen.has(k))continue;seen.add(k);t.data.transactions.push(x);added++}
       pages.push({n:guard+1,count:rows.length,added});
       if(!added)break;   // ⚠ עמוד שלא הוסיף דבר = סוף, גם אם הדפדוף טוען אחרת
     }
     const scan=await fibiPager(tabId,'scan');
     try{await chrome.storage.local.set({fibiPages:{at:new Date().toISOString(),pages,total:(t.data?.transactions||[]).length,lastScan:scan}})}catch(e){}}
    const now=new Date().toISOString(),source=state.pendingFibiSlot,label=`הבינלאומי — ${owner.firstName||t.data.accountNumber}`;
    const bankNumber=v=>String(v??'').replace(/\D/g,'').replace(/^0+(?=\d)/,'');
    if(bankNumber(s.data.branch)!==bankNumber(t.data.branch)||bankNumber(s.data.accountNumber)!==bankNumber(t.data.accountNumber))throw Error(`החשבון השתנה במהלך הסנכרון (${s.data.branch}-${s.data.accountNumber} לעומת ${t.data.branch}-${t.data.accountNumber})`);
    const loanAccountKey=`${t.data.branch}-${t.data.accountNumber}`,account={...s.data,...loanResult.data,...t.data,loans:(loanResult.data.loans||[]).map(l=>({...l,accountKey:loanAccountKey})),nickname:owner.firstName||`חשבון ${t.data.accountNumber}`,owner:owner.fullName||'',source,sourceLabel:label,selectionKey:`${source}|${loanAccountKey}`,id:`${source}-${loanAccountKey}`,lastSync:now,status:'מסונכרן'};
    // WHY (AUDIT סעיף 2): state נקרא בתחילת הסנכרון, לפני דקות. קוראים מחדש.
    await accountsMutex(async()=>{
    const allNow=((await chrome.storage.local.get({accounts:[]})).accounts)||[],accounts=allNow.filter(a=>a.source!==source);accounts.push(markNewTransactions(allNow,[keepAssignedCards(allNow,account)],[account.source||source])[0]);const names=(await chrome.storage.local.get({fibiConnectionNames:{}})).fibiConnectionNames;names[source]=owner.firstName||t.data.accountNumber;
    // "אין נתונים חדשים" - השוואת מפתחות מול השמור, אותו מפתח כמו דדופ הדפדוף.
    const fibiKey=x=>transactionSyncKey({...x,action:x.description||x.action||''});   // 2.3.6: אותו מפתח סובלני כמו בסימון "חדש"
    const savedKeys=new Set(((savedFibi&&savedFibi.transactions)||[]).map(fibiKey));
    const freshFibi=(t.data.transactions||[]).filter(x=>!savedKeys.has(fibiKey(x))).length;
    await chrome.storage.local.set({accounts,fibiConnectionNames:names,pendingFibiSlot:'',syncStatus:`${label} סונכרן בהצלחה${savedFibi?(freshFibi?` — ${freshFibi} תנועות חדשות`:' — אין נתונים חדשים'):''}${fibiBalSame&&(savedFibi.loans||[]).length?' · ההלוואות מהמסד':''}`,lastAutoSync:now});});await closeSyncTabs();if(!autoBusy)await chrome.runtime.openOptionsPage();
  }catch(e){await chrome.storage.local.set({pendingFibiSlot:'',syncStatus:`שגיאה בבינלאומי: ${e.message}`});if(!autoBusy)await chrome.runtime.openOptionsPage()}finally{running=false;await restoreSyncTabs()}
}

async function startLeumi(){if(running)return{ok:false,error:'סנכרון כבר רץ — המתן לסיומו לפני הפעלה מחדש'};leumiLastRun=0;
// רשימת החשבונות נמחקת כבר בלחיצה. היא תוצר של התחברות אחת ואין להציג אותה בלעדיה —
// אחרת נבחרים חשבונות מרשימה ישנה שאין מאחוריה שום סשן פעיל.
const prev=await chrome.storage.local.get({discoveredAccounts:[]});
await chrome.storage.local.set({pendingLeumi:true,leumiAttempts:0,leumiOptionProbe:null,discoveredAccounts:prev.discoveredAccounts.filter(a=>a.source!=='leumi'),syncStatus:'טוען את החיבור הפעיל ללאומי ומזהה חשבונות'});const tabs=leumiSession(await chrome.tabs.query({url:['https://hb2.bankleumi.co.il/*']}));if(tabs.length){const tab=leumiTab(tabs);await returnToDashboard(tab.id,true);discoverLeumi(tab.id).catch(async e=>{
  // ⚠⚠ 22.08.2026 — טל: „אין חשבונות לבחירה". נמדד באחסון: leumiAttempts=1,
  // pendingLeumi=false, discoveredAccounts=0 — הזיהוי רץ ונכשל — אבל
  // `syncStatus` הראה „זוהתה כניסה ללאומי, אך הסנכרון האוטומטי כבוי",
  // ו-`leumiDebug`/`leumiOptionProbe` היו null. **הודעת הכשל נדרסה על ידי
  // גלאי הכניסה שרץ אחריה, ולא נשארו עקבות לומר למה.** התקדים כבר קיים
  // בדיסקונט (`discountDiscoverError`): כשל נרשם למפתח ייעודי שאיש אינו
  // כותב עליו, ולא רק לשורת סטטוס חולפת.
  const tabNow=await chrome.tabs.get(tab.id).catch(()=>null);
  await chrome.storage.local.set({pendingLeumi:false,
    leumiDiscoverError:{message:String(e?.message||e).slice(0,240),url:String(tabNow?.url||'').slice(0,200),at:new Date().toISOString()},
    syncStatus:`זיהוי החשבונות בלאומי נכשל: ${e.message}`});
  // ⚠⚠ 22.08.2026 — נמדד: `הניווט בתפריט נכשל: A listener indicated an
  // asynchronous response... message channel closed`, כשהלשונית כבר על
  // /nis-transactions/. כלומר ניווט הרג את ה-content script באמצע הודעה.
  // זה חולף ותלוי-תזמון, **אבל הוא חסם פעולה שכלל אינה זקוקה לזיהוי**:
  // `selectedAccountKeys` כבר החזיק `leumi|921-348300` והחשבון כבר שמור.
  // הזיהוי נועד למצוא חשבונות **חדשים**; מי שכבר נבחר ונשמר אינו צריך
  // אותו. לכן כשל בזיהוי נופל עכשיו לאחור לסנכרון של מה שכבר אושר,
  // במקום להשאיר את המשתמש בלי כלום.
  // ⚠ נופלים לאחור **רק על מפתחות שהמשתמש כבר אישר** — לא בוחרים
  // חשבונות בשמו, ולא נוגעים בבורר. אם אין מפתחות שמורים, הכשל נשאר כשל.
  try{
    const saved=await chrome.storage.local.get({selectedAccountKeys:[],accounts:[]});
    const keys=(saved.selectedAccountKeys||[]).filter(k=>String(k).startsWith('leumi|'));
    const known=(saved.accounts||[]).some(a=>(a.source||'')==='leumi');
    if(keys.length&&known&&!running){
      await chrome.storage.local.set({syncStatus:`הזיהוי נכשל — מסנכרן את ${keys.length} החשבונות שכבר אושרו`});
      await syncSelected(keys);
    }
  }catch(err){await chrome.storage.local.set({syncStatus:`זיהוי נכשל, וגם הסנכרון החלופי נכשל: ${err.message}`})}});return{ok:true,status:'discovering'}}await chrome.storage.local.set({syncStatus:'ממתין להתחברות ללאומי'});await openLoginWindow({url:LEUMI_LOGIN,type:'popup',width:560,height:780,focused:true});return{ok:true,status:'waiting_login'}}
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
// ⚠ 25.08.2026 — התקציב היה קבוע (420 שניות) ונקבע כשהקריאה הייתה **בקשה
// אחת לחשבון**. מאז 1.5.2 כל חשבון הוא הליכה של עד תשעה מקטעים, ו-6
// חשבונות נבחרים חרגו מכל תקרה קבועה. עכשיו הוא נגזר ממספר החשבונות.
// ⚠ תקרה מוחלטת נשמרת בכוונה: בלעדיה סנכרון תקוע ממתין לנצח, וזה גרוע
// יותר מכישלון מוצהר.
const leumiSyncBudget=n=>Math.min(1200000,180000+Math.max(1,n)*240000);
// WHY 28.08.2026 - 120 שניות היו **קצרות מדי לעבודה תקינה**: הלולאה בדף
// היא 45 שניות לכל חשבון, ובשניים היא חורגת מהתקרה בזמן שהיא מצליחה.
// התקרה גדלה לפי מספר החשבונות, והשומר (45 שניות שקט) הוא זה שמזהה מוות -
// **תקרה גדולה עם שומר בטוחה יותר מתקרה קטנה בלי שומר.**
leumiLoanBudget=n=>Math.min(600000,120000+Math.max(1,n)*90000);
async function runDiscoverLeumi(tabId,state){
// הזיהוי רץ בעבר על הדף שבמקרה היה פתוח, ולכן נחת על gate-keeper והחזיר "לא נמצאה רשימת החשבונות".
await prepareLeumiRoute(tabId,LEUMI_TX_URL);await delay(1200);
// הזרקה חוזרת אחת לא הספיקה: ניווט של ה-SPA הורג את ה-content script בדיוק בין הבדיקה לשליחה.
let r=null,lastErr='',lastProbe=null;for(let attempt=1;attempt<=5;attempt++){try{r=await withTimeout(chrome.tabs.sendMessage(tabId,{type:'LEUMI_DISCOVER'}),90000,'זיהוי חשבונות בלאומי');if(r)break}catch(e){lastErr=e.message;await chrome.storage.local.set({syncStatus:`לאומי: מחבר מחדש לעמוד, ניסיון ${attempt} מתוך 5`});try{await chrome.scripting.executeScript({target:{tabId},files:['leumi-content.js']})}catch(e2){lastErr=e2.message}await delay(1500)}}
if(!r)throw Error(`אין חיבור לעמוד לאומי אחרי 5 ניסיונות: ${lastErr}`);// ⚠ 23.08.2026 — טל: „למה יש את ההודעות האלה כל פעם". צודק.
// `dbgText` בונה אבחון עשיר — כתובת מלאה, מספר טבלאות, שורה ראשונה,
// פתיח הדף — והוא הודבק **להודעת השגיאה עצמה**, שמוצגת למשתמש
// על אריח הבנק. התוצאה: עמודת מלל של אלף תווים בכרטיס לאומי.
// והכפילות מיותרת לחלוטין: **אותו אבחון כבר נשמר ב-`leumiDebug`**,
// ומשם קוראים אותו. **למשתמש — משפט אחד קריא; למפתח — הכל, באחסון.**
// ⚠⚠ 25.08.2026 — **כאן ה-throw ברח מן ה-if.** לפני f7aed41 השורה הייתה
// `if(!r?.ok)throw Error(...)` — משפט אחד. הריפקטור שהוציא את האבחון
// להודעה עטף את כתיבת `leumiDebug` בבלוק, וה-throw נשאר **מחוץ לתנאי**.
// התוצאה: **כל זיהוי לאומי נכשל, גם כשהצליח** — כולל החשבונות שכבר
// היו ביד — וכל הקוד שמתחת (בניית `found`, שמירת `discoveredAccounts`,
// „נמצאו N חשבונות") הפך ל**קוד מת שלא רץ מעולם מאז 23.08**.
// **החתימה באחסון שהכריעה:** הודעת הכשל הייתה בדיוק מחרוזת ברירת המחדל
// (`r.error` היה undefined — כלומר לא הייתה שגיאה), ו**לא נכתב `leumiDebug`
// כלל** — כי הבלוק שכותב אותו הוא היחיד שכן נשאר בתוך התנאי.
// **הלקח: כשעוטפים גוף של `if` חסר-סוגריים בבלוק — לספור מה נכנס פנימה.**
if(!r?.ok){try{await chrome.storage.local.set({leumiDebug:{stage:'discover',error:r?.error||'',text:dbgText('',r?.debug),...(r?.debug||{})}})}catch{}
throw Error(r?.error||'זיהוי חשבונות לאומי נכשל')}const others=state.discoveredAccounts.filter(a=>a.source!=='leumi'),found=r.accounts.map(a=>({...a,source:'leumi',sourceLabel:'לאומי',key:`leumi|${a.key}`,at:Date.now()}));// כשהזיהוי מחזיר חשבון בודד, שומרים את צילום הרשימה הנפתחת — שם התשובה למה השאר חסרים.
if(found.length<2&&r.optionProbe)await chrome.storage.local.set({leumiOptionProbe:r.optionProbe});
await chrome.storage.local.set({pendingLeumi:false,leumiAttempts:0,discoveredAccounts:[...others,...found],chooserFocus:{source:'leumi',label:'לאומי',at:Date.now()},syncStatus:`נמצאו ${found.length} חשבונות בלאומי${r.strategy?` (${r.strategy})`:''} — בחר אילו לסנכרן ואשר`});await chrome.runtime.openOptionsPage()}
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
// ⚠ אחרי שגיאת bfcache הדף עשוי לענות ל-ping ועדיין להיות מנותק. הזרקה
// מחדש היא זולה, והיא מה שמחזיר את מאזין ה-unload שמונע כניסה חוזרת למטמון.
if(leumiForceInject){leumiForceInject=false;
  try{await chrome.scripting.executeScript({target:{tabId},files:['leumi-content.js']});await delay(300)}catch{}}
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
// ⚠⚠ 27.08.2026 — הגשש רץ עד היום על **המסמך העליון בלבד**. בבינלאומי
// התנועות וההלוואות יושבות בתוך `#iframe-old-pages` (ראה `fibi-content.js`),
// ולכן `dateControls()` היה מדווח „אין שדות תאריך" על דף שיש בו בורר —
// **בדיוק סוג התוצאה השלילית-כוזבת שהחזירה אותנו לניחוש ביהב.**
// ⚠ אין דרך למסר מסגרת אחת עם `sendMessage` רגיל: כמה מסגרות עונות ורק
// הראשונה נספרת. לכן מונים מסגרות ב-`webNavigation` וממסרים לכל אחת לפי
// `frameId`. הגשש עצמו לא שונה — הוא כבר מוגן בשומר הזרקה.
// ⚠⚠ 27.08.2026 — טל: „תתקן את הטווח, תפעיל את הלשונית המתאימה."
// **השורש שנמדד:** קובץ תוכן רץ ב-isolated world, ולכן `showDateFilterTab`
// ו-`submitLinkForm` **אינן נראות לו** — `submitFns:[]` אמר זאת פעמיים.
// הלחיצה על `<a href="javascript:showDateFilterTab()">` לא שינתה את הלשונית
// הפעילה (`tabsBefore == tabsAfter`), ולכן כל שיגור יצא מ„תנועות אחרונות".
// ⚠ **הפתרון אינו סלקטור נוסף אלא `world:'MAIN'`** — שם פונקציות הדף חיות.
// זה יכול לצאת רק מכאן; קובץ תוכן לא יוכל לעשות זאת לעולם.
// ⚠ רץ על **כל המסגרות**, והמסגרת שאין בה לשונית טווח מחזירה null — כך אין
// צורך לנחש מזהה מסגרת, והתוצאה נבחרת לפי מי שבאמת פעל.
async function fibiSetRangeMain(tabId,sinceMs){
  if(!sinceMs)return{ok:false,error:'לא הוגדרה תחילת איסוף'};
  const f=new Date(sinceMs),t=new Date(),p=n=>String(n).padStart(2,'0');
  let results=[];
  // ⚠⚠ 27.08 — הריצה הראשונה של 1.20.0 החזירה „לא נמצאה מסגרת עם לשונית
  // טווח התאריכים", ומסלול הנפילה מדד `rows:0` — כלומר **מסגרת הלגסי הייתה
  // ריקה**, לא חסרה. `syncFibi` ממתין `delay(2200)` **קבוע** אחרי הניווט,
  // וזה ניחוש. טל דיווח שהלשונית כן נבחרה — כלומר הדף עלה, רק מאוחר יותר.
  // ⚠ **ממתינים למה שצריך להיות שם, לא למספר שניות.** גבול שעון־קיר, וניסיון
  // חוזר עד שמסגרת כלשהי מחזירה תשובה. אותו לקח שכבר נרשם ב-1.12.1.
  const deadline=Date.now()+25000;let attempts=0,waited=0;
  const runOnce=async()=>{
    attempts++;
    try{ return await chrome.scripting.executeScript({
      target:{tabId,allFrames:true},world:'MAIN',
      args:[String(f.getFullYear()),p(f.getMonth()+1),p(f.getDate()),
            String(t.getFullYear()),p(t.getMonth()+1),p(t.getDate())],
      func:async(fy,fm,fd,ty,tm,td)=>{
        const nap=ms=>new Promise(r=>setTimeout(r,ms));
        const clean=v=>String(v||'').replace(/\s+/g,' ').trim();
        const tabEl=[...document.querySelectorAll('a')]
          .find(a=>/תנועות\s*בטווח\s*תאריכים/.test(clean(a.textContent)));
        if(!tabEl)return null;                       // אין לשונית — לא המסגרת הזו
        const vis=el=>!!(el&&(el.offsetParent||el.getClientRects().length));
        const activeTab=()=>clean((document.querySelector('a.active')||{}).textContent);
        const rows=()=>document.querySelectorAll('table tr').length;
        const before={active:activeTab(),rows:rows()};
        // ⚠ קודם קריאה ישירה לפונקציית הדף; `typeof` על מזהה לא מוגדר אינו זורק.
        let how='';
        try{if(typeof showDateFilterTab==='function'){showDateFilterTab();how='showDateFilterTab()'}}catch(e){how='שגיאה: '+e.message}
        if(!how){tabEl.click();how='click'}
        const dl=Date.now()+8000;
        while(Date.now()<dl&&!vis(document.querySelector('#fromDate')))await nap(300);
        const panelOpen=vis(document.querySelector('#fromDate'));
        // ⚠⚠ 27.08 — צילום מסך של טל: הלשונית פעילה, הפאנל פתוח, **ו„מ" עדיין
        // 01/08/2026**. כתבתי רק ל-`LinkForm077`, ולא לשדות שהמשתמש רואה —
        // והאתר קורא מהם. ⚠ **ובעולם הראשי jQuery כן זמין**: המדידה
        // `hasJQuery:false` נעשתה מן העולם המבודד, ולכן הייתה מטעה.
        const fromStr=fd+'/'+fm+'/'+fy,tillStr=td+'/'+tm+'/'+ty;
        const setVisible=(sel,y,m,d,txt)=>{const el=document.querySelector(sel);if(!el)return 'אין שדה';
          try{const $=window.jQuery||window.$;
            if($&&/hasDatepicker/.test(el.className||'')){
              $(el).datepicker('setDate',new Date(Number(y),Number(m)-1,Number(d)));
              try{$(el).trigger('change')}catch(e){}
              if(el.value)return 'datepicker';}
          }catch(e){}
          el.value=txt;
          for(const ev of ['input','change','blur'])el.dispatchEvent(new Event(ev,{bubbles:true}));
          return 'value';};
        const visible={from:setVisible('#fromDate',fy,fm,fd,fromStr),
                       till:setVisible('#tillDate',ty,tm,td,tillStr)};
        const form=document.querySelector('form[name^="LinkForm"]');
        const set=(n,v)=>{const el=form&&form.querySelector('[name="'+n+'"]');if(!el)return false;el.value=v;return true};
        const wrote={fromYY:set('I-FROM-YY',fy),fromMM:set('I-FROM-MM',fm),fromDD:set('I-FROM-DD',fd),
                     tillYY:set('I-TILL-YY',ty),tillMM:set('I-TILL-MM',tm),tillDD:set('I-TILL-DD',td),
                     formFound:!!form};
        // ⚠ הפאנל חייב להיות פתוח לפני שיגור — הלקח מ-1.19.3. אחרת מדווחים ולא משגרים.
        let submitted='';
        if(panelOpen){
          try{if(typeof submitLinkForm==='function'){
            submitLinkForm('077','1','','','','','','','','','');submitted='submitLinkForm()'}}catch(e){submitted='שגיאה: '+e.message}
          if(!submitted&&form){try{form.submit();submitted='form.submit'}catch(e){submitted='שגיאה: '+e.message}}
        }
        await nap(2000);
        return{ok:true,how,panelOpen,wrote,submitted,before,visible,
          jq:!!(window.jQuery||window.$),
          shown:{from:document.querySelector('#fromDate')?.value||'',till:document.querySelector('#tillDate')?.value||''},
          after:{active:activeTab(),rows:rows(),
            from:document.querySelector('#fromDate')?.value||'',till:document.querySelector('#tillDate')?.value||''},
          url:String(location.href).slice(0,110)};
      }});
    }catch(e){return[{result:{ok:false,error:String(e&&e.message||e).slice(0,140)}}]}
  };
  while(Date.now()<deadline){
    results=await runOnce();
    const hit=results.map(r=>r&&r.result).find(Boolean);
    // ⚠ „נמצאה מסגרת ופעלנו" מול „המסגרת עדיין ריקה" — רק הראשון עוצר את הלולאה.
    if(hit&&hit.ok!==false)return{...hit,attempts,waitedMs:waited};
    if(hit&&hit.error&&!/לא נמצאה/.test(String(hit.error)))return{...hit,attempts,waitedMs:waited};
    await new Promise(r=>setTimeout(r,1200));waited+=1200;
  }
  return{ok:false,error:'מסגרת התנועות לא נטענה בזמן',attempts,waitedMs:waited};
}
// ⚠⚠ 27.08.2026 — טל: „תשים לב לכמות הדפים ולפי זה להתקדם." בצילום מופיע
// **„עמוד - 3"**: הטווח כבר נקבע נכון (01/01/2026 → 27/08/2026, גם בכותרת),
// אבל התוצאה **מחולקת לדפים** ואנחנו קוראים אחד. מכאן „הטווח לא תקין".
// ⚠ הדפדוף נעשה בעולם הראשי מאותה סיבה בדיוק כמו הלשונית.
// `action:'scan'` מדווח מה קיים; `action:'next'` מתקדם דף. **הסריקה מדווחת
// תמיד**, כך שגם כישלון ייסגר בקריאה אחת ולא בעוד סבב.
async function fibiPager(tabId,action){
  let results=[];
  try{
    results=await chrome.scripting.executeScript({
      target:{tabId,allFrames:true},world:'MAIN',args:[action],
      func:async(act)=>{
        const nap=ms=>new Promise(r=>setTimeout(r,ms));
        const clean=v=>String(v||'').replace(/\s+/g,' ').trim();
        // ⚠ נתפס בבדיקה: `pageAfter` דיווח את הערך **לפני** הלחיצה, כי הטקסט
        // נלכד פעם אחת בראש הפונקציה. הזרימה הייתה תקינה (`advanced` נמדד
        // מתוכן השורות החי), אבל **דוח שמשקר מייצר סבב מיותר.** נקרא חי.
        const bodyText=()=>clean(document.body&&document.body.textContent);
        const body=bodyText();
        if(!/עמוד/.test(body)&&!document.querySelector('form[name^="LinkForm"]'))return null;
        const rowsText=()=>[...document.querySelectorAll('table tr')].map(r=>clean(r.textContent)).join('|');
        const pageLabel=()=>{const m=bodyText().match(/עמוד\s*-?\s*(\s*[\s0-9]{1,4})/);return m?clean(m[1]):''};
        const cands=[...document.querySelectorAll('a,input[type="button"],input[type="submit"],button')]
          .map(el=>({el,t:clean(el.value||el.textContent),
            oc:clean(el.getAttribute&&el.getAttribute('onclick')||'').slice(0,120),
            hr:clean(el.getAttribute&&el.getAttribute('href')||'').slice(0,120)}));
        const NEXT=/^(הבא|הבאה|הדף הבא|עמוד הבא|>|>>|»|›)$/;
        const nextEl=cands.find(c=>NEXT.test(c.t))
          ||cands.find(c=>/הבא/.test(c.t)&&!/הצג|קודם/.test(c.t))
          ||cands.find(c=>/next|nextPage|pageDown/i.test(c.oc+' '+c.hr));
        const scan={page:pageLabel(),
          controls:cands.filter(c=>c.t&&c.t.length<=14).map(c=>({t:c.t,oc:c.oc,hr:c.hr})).slice(0,20),
          rows:document.querySelectorAll('table tr').length,
          hasNext:!!nextEl,nextText:nextEl?nextEl.t:''};
        if(act!=='next')return{ok:true,...scan};
        if(!nextEl)return{ok:true,advanced:false,...scan};
        const before=rowsText(),beforePage=pageLabel();
        try{nextEl.el.click()}catch(e){return{ok:false,error:'לחיצה נכשלה: '+e.message,...scan}}
        // ⚠ גבול שעון־קיר; „הדף התחלף" נמדד בתוכן השורות **או** במספר העמוד.
        const dl=Date.now()+12000;
        while(Date.now()<dl){
          if(rowsText()!==before||pageLabel()!==beforePage)break;
          await nap(400);
        }
        await nap(800);
        return{ok:true,advanced:rowsText()!==before||pageLabel()!==beforePage,
          pageBefore:beforePage,pageAfter:pageLabel(),rows:document.querySelectorAll('table tr').length,
          hasNext:scan.hasNext,nextText:scan.nextText,controls:scan.controls};
      }});
  }catch(e){return{ok:false,error:String(e&&e.message||e).slice(0,140)}}
  return results.map(r=>r&&r.result).find(Boolean)||{ok:false,error:'לא נמצאה מסגרת עם דפדוף'};
}
// ⚠⚠ 27.08.2026 — טל: „הוא לא נכנס מלשונית תנועות בחשבון חדש." נכון:
// `syncFibi` מנווט **בכוח** ל-`OnBalanceTrans/PrivateAccountFlow`, המסך הישן,
// גם כשטל עומד על החדש. ⚠ **את הנתיב של המסך החדש איני יודע**, ולכן לא
// מנחשים אותו: מאתרים את פריט התפריט „תנועות בחשבון" ולוחצים עליו, בדיוק
// כמו משתמש. הפונקציה מדווחת מה נמצא ומה נבחר.
async function fibiOpenNewScreen(tabId){
  let results=[];
  try{
    results=await chrome.scripting.executeScript({
      target:{tabId,allFrames:true},world:'MAIN',
      func:async()=>{
        const nap=ms=>new Promise(r=>setTimeout(r,ms));
        const clean=v=>String(v||'').replace(/\s+/g,' ').trim();
        const items=[...document.querySelectorAll('a,[role="menuitem"],button')]
          .map(el=>({el,t:clean(el.textContent),href:String(el.getAttribute&&el.getAttribute('href')||'').slice(0,140)}))
          .filter(x=>/תנועות\s*בחשבון/.test(x.t));
        if(!items.length)return null;
        // ⚠ בתפריט של טל מופיע „תנועות בחשבון" **פעמיים**, ורק לאחד תג „חדש".
        // מעדיפים את זה שהטקסט שלו כולל „חדש"; אחרת הראשון, ומדווחים הכל.
        const pick=items.find(x=>/חדש/.test(x.t))||items[0];
        const before=String(location.href);
        try{pick.el.click()}catch(e){return{ok:false,error:'לחיצה נכשלה: '+e.message,
          candidates:items.map(x=>({t:x.t,href:x.href}))}}
        const dl=Date.now()+12000;
        while(Date.now()<dl&&String(location.href)===before)await nap(400);
        await nap(1500);
        return{ok:true,chosen:{t:pick.t,href:pick.href},
          candidates:items.map(x=>({t:x.t,href:x.href})),
          before,after:String(location.href).slice(0,140),
          navigated:String(location.href)!==before};
      }});
  }catch(e){return{ok:false,error:String(e&&e.message||e).slice(0,140)}}
  return results.map(r=>r&&r.result).find(Boolean)||{ok:false,error:'פריט התפריט „תנועות בחשבון" לא נמצא'};
}
// ⚠⚠ 27.08.2026 — המסך החדש נמדד: `#/accountTransactions`, הכול במסמך העליון.
// הפילים הם `button[role="tab"].filter-button` בתוך `q077-filters-list`,
// ו„טווח תאריכים" נושא `aria-expanded` — כלומר הוא פותח חלונית.
// ⚠ החלונית עצמה **לא נמדדה** (היא נפתחת בלחיצה), ולכן שדותיה מאותרים
// בזמן ריצה לפי תבנית תאריך ולפי התוויות „מ-תאריך"/„עד תאריך" שבצילום,
// **וכל מה שנמצא מדווח** כדי שכשל ייסגר בקריאה אחת.
async function fibiNewRange(tabId,sinceMs){
  if(!sinceMs)return{ok:false,error:'לא הוגדרה תחילת איסוף'};
  const f=new Date(sinceMs),t=new Date(),p=n=>String(n).padStart(2,'0');
  let results=[];
  try{
    results=await chrome.scripting.executeScript({
      target:{tabId,allFrames:true},world:'MAIN',
      args:[`${p(f.getDate())}/${p(f.getMonth()+1)}/${f.getFullYear()}`,
            `${p(t.getDate())}/${p(t.getMonth()+1)}/${t.getFullYear()}`],
      func:async(fromStr,tillStr)=>{
        const nap=ms=>new Promise(r=>setTimeout(r,ms));
        const clean=v=>String(v||'').replace(/\s+/g,' ').trim();
        const pills=[...document.querySelectorAll('button[role="tab"],button.filter-button')]
          .map(el=>({el,t:clean(el.textContent)}));
        const pill=pills.find(x=>/טווח\s*תאריכים/.test(x.t));
        if(!pill)return null;                       // לא המסמך הזה
        const rowsNow=()=>document.querySelectorAll('q077-table tbody tr,table tbody tr').length;
        const before={rows:rowsNow(),pills:pills.map(x=>x.t).slice(0,8)};
        pill.el.click();
        // ⚠ ממתינים שהחלונית תופיע — נראוּת, לא קיום. הלקח מ-1.19.3.
        const vis=el=>!!(el&&(el.offsetParent||el.getClientRects().length));
        // ⚠⚠ 27.08 — בחיבור „בינלאומי 2" הדוח החזיר „שדות התאריך בחלונית לא
        // נמצאו", בעוד בחיבור 1 זה עבד. ההבדל: בחיבור 1 הטווח כבר היה מוגדר
        // ולכן **בשדות היו ערכי תאריך**; בחלונית טרייה הם **ריקים**, והתווית
        // „מ-תאריך" היא אלמנט נפרד ולא `aria-label` על ה-input.
        // כלומר סיננתי לפי ערך או aria בלבד — ופסלתי בדיוק את המקרה הנפוץ.
        // עכשיו נבדקת גם התווית המשויכת וגם המכל שסביב השדה.
        const labelOf=el=>{const bits=[el.getAttribute('aria-label')||'',el.placeholder||'',
            el.id||'',el.name||'',(typeof el.className==='string'?el.className:'')];
          if(el.id){const l=document.querySelector('label[for="'+el.id+'"]');if(l)bits.push(l.textContent||'')}
          const lab=el.closest&&el.closest('label');if(lab)bits.push(lab.textContent||'');
          let p=el.parentElement;for(let i=0;i<3&&p;i++,p=p.parentElement)bits.push(clean(p.textContent||'').slice(0,60));
          return clean(bits.join(' '))};
        const dateInputs=()=>[...document.querySelectorAll('input')]
          .filter(el=>vis(el)&&el.type!=='checkbox'&&el.type!=='radio'&&
            (/\d{2}[.@/]\d{2}[.@/]\d{4}/.test(el.value||'')||/תארי|date/i.test(labelOf(el))));
        let dl=Date.now()+10000;
        while(Date.now()<dl&&dateInputs().length<2)await nap(300);
        const ins=dateInputs();
        if(ins.length<2)return{ok:false,error:'שדות התאריך בחלונית לא נמצאו',
          found:ins.map(el=>({v:el.value,al:clean(el.getAttribute('aria-label')||''),ph:el.placeholder||''})),
          // ⚠ בכישלון מדווחים **כל** שדות הקלט הנראים — כך הסבב הבא אינו ניחוש.
          allVisible:[...document.querySelectorAll('input')].filter(vis).slice(0,12)
            .map(el=>({t:el.type||'',id:el.id||'',cls:clean(typeof el.className==='string'?el.className:'').slice(0,40),
              ph:el.placeholder||'',al:clean(el.getAttribute('aria-label')||''),v:String(el.value||'').slice(0,12),
              lab:labelOf(el).slice(0,60)})),before};
        // ⚠ סדר: הראשון „מ-תאריך", השני „עד תאריך" — כפי שנראה בצילום.
        const set=(el,v)=>{el.focus&&el.focus();el.value=v;
          for(const ev of ['input','change','blur'])el.dispatchEvent(new Event(ev,{bubbles:true}));};
        set(ins[0],fromStr);set(ins[1],tillStr);
        await nap(400);
        const ok=[...document.querySelectorAll('button')].map(el=>({el,t:clean(el.textContent)}))
          .find(x=>/^אישור$/.test(x.t))||null;
        if(ok)ok.el.click();
        const beforeRows=before.rows;
        dl=Date.now()+15000;
        while(Date.now()<dl&&rowsNow()===beforeRows)await nap(400);
        await nap(1200);
        return{ok:true,pill:pill.t,confirmed:!!ok,wrote:{from:ins[0].value,till:ins[1].value},
          before,after:{rows:rowsNow()},url:String(location.href).slice(0,110)};
      }});
  }catch(e){return{ok:false,error:String(e&&e.message||e).slice(0,140)}}
  return results.map(r=>r&&r.result).find(Boolean)||{ok:false,error:'לא נמצא פיל „טווח תאריכים"'};
}
// ⚠⚠ 27.08.2026 — טל: „כרטיסים חדשים שפעילים מספר חודשים — למה טעינת שנה
// אחורה לא מפסיקה כשהכרטיס לא היה קיים." **נמדד:** לישראכרט **כבר יש** את זה
// (`isracardActiveSince` · „פעיל מחודש X", נוסף 18.08) — **ולכאל ול-MAX אין.**
// שם הלולאה רצה 12 חודשים תמימים ומושכת דפים ריקים.
// ⚠ **מדיניות אחת ומקום אחד**, כדי שלא ייווצר עותק שלישי של אותו רעיון.
// שני חודשים ריקים ברצף = הכרטיס לא היה קיים. **אחד אינו מספיק** — חודש בלי
// שימוש הוא לגיטימי, ועצירה עליו הייתה מאבדת היסטוריה אמיתית.
const EMPTY_MONTHS_STOP=2;
async function cardActiveSince(){try{return (await chrome.storage.local.get({cardActiveSince:{}})).cardActiveSince||{}}catch(e){return {}}}
async function noteCardActiveSince(suffix,month){
  try{const all=await cardActiveSince(),k=String(suffix||'');if(!k||!month)return;
    // נשמר החודש **המוקדם ביותר שידוע כפעיל**; ריצה הבאה לא תשלם עליו שוב.
    const ordOf=m=>{const v=String(m||'').replace(/\D/g,'');return v.length===6?Number(v.slice(2)+v.slice(0,2)):0};
    if(!all[k]||ordOf(month)<ordOf(all[k])){all[k]=month;await chrome.storage.local.set({cardActiveSince:all})}
  }catch(e){}
}
// ⚠⚠ 27.08.2026 — BTB: **הלוואה ללא עו״ש.** אין חשבון, אין יתרה, ואין תנועות —
// ולכן נוצר „חשבון" סינתטי שכל תפקידו לשאת את ההלוואה אל מסך ההלוואות.
// ⚠ `renderAllLoans` מסנן לפי `accountKey===`${branch}-${accountNumber}``, ולכן
// שני אלה חייבים להיות עקביים, אחרת ההלוואה נקראת ולא מוצגת.
// ⚠ `balance:null` במכוון: סכום ההלוואה **אינו** יתרת חשבון, וסיכום היתרות
// בדשבורד לא יזייף בגללו (`Number(null)||0`).
// ⚠⚠ 27.08.2026 — טל: „מכיוון שאין את שיעור הריבית, תצטרך לחשב אותו ביחס
// להחזר, לשארית התקופה ולערך הנוכחי." **דף BTB אינו מציג ריבית**, אבל היא
// נגזרת חד-משמעית משלושת אלה: פותרים את נוסחת האנונה
//     pmt = PV · i / (1 − (1+i)^−n)
// עבור i בחיפוש בינארי (אין פתרון סגור). מוחזר **נומינלי שנתי (i×12)**,
// כמקובל בישראל, ולצידו האפקטיבי.
// ⚠ **מסומן „מחושבת"** — זה נתון שגזרנו ולא נתון שהבנק מסר, והבחנה זו
// חשובה יותר מהמספר עצמו.
function annuityRate(pv,pmt,n){
  pv=Number(pv);pmt=Number(pmt);n=Number(n);
  if(!Number.isFinite(pv)||!Number.isFinite(pmt)||!Number.isFinite(n))return null;
  if(pv<=0||pmt<=0||n<=0)return null;
  // ⚠ אם סך התשלומים אינו עולה על הקרן — אין ריבית חיובית, ואין להמציא אחת.
  if(pmt*n<=pv)return null;
  // ⚠ ואם התשלום אינו מכסה אפילו ריבית בגבול העליון — נעצרים ומדווחים null.
  let lo=0,hi=1;                     // 100% לחודש כגבול עליון בטוח
  const f=i=>i>0?pv*i/(1-Math.pow(1+i,-n)):pv/n;
  if(f(hi)<pmt)return null;
  for(let k=0;k<200;k++){const mid=(lo+hi)/2;if(f(mid)<pmt)lo=mid;else hi=mid}
  const m=(lo+hi)/2;
  return{monthly:m,nominal:m*12,effective:Math.pow(1+m,12)-1};
}
const BTB_LOGIN='https://auth.btbisrael.co.il/auth/signin/id?appType=borrower&callbackUrl=https%3A%2F%2Fborrowers.btbisrael.co.il%2Fdashboard';
async function btbTab(){const tabs=await chrome.tabs.query({url:['https://*.btbisrael.co.il/*']});
  return tabs.find(t=>String(t.url||'').includes('borrowers.'))||tabs[0]||null}
async function startBtb(){
  const tab=await btbTab();
  if(!tab){await chrome.storage.local.set({syncStatus:'ממתין להתחברות ל-BTB — הזן תעודת זהות וקוד לנייד במסך שנפתח'});
    await openLoginWindow({url:BTB_LOGIN,type:'popup',width:560,height:780,focused:true});
    return{ok:true,status:'waiting_login'}}
  noteSyncTab(tab.id);await returnToDashboard(tab.id,true);
  const r=await runBtb(tab.id);
  // ⚠ לשונית BTB פתוחה אך מנותקת — בדיוק המצב שנפל. פותחים את אותו חלון
  // התחברות שכבר עבד כשלא הייתה לשונית כלל, במקום להחזיר „נכשל".
  if(r?.status==='waiting_login')
    await openLoginWindow({url:BTB_LOGIN,type:'popup',width:560,height:780,focused:true});
  return r;
}
let btbBusy=false;
async function runBtb(tabId){
  if(btbBusy)return{ok:false,error:'סנכרון BTB כבר מתבצע'};
  btbBusy=true;
  try{
    await clearSourceDiags('btb');
    await chrome.storage.local.set({syncStatus:'BTB: קורא את פרטי ההלוואה'});
    let tab=await chrome.tabs.get(tabId);
    if(!String(tab.url||'').includes('borrowers.btbisrael.co.il')){
      await chrome.tabs.update(tabId,{url:'https://borrowers.btbisrael.co.il/dashboard'});
      await waitTab(tabId,'borrowers.btbisrael.co.il');
    }
    // ⚠⚠ 27.08.2026 — טל: „הסנכרון נכשל · פרטי ההלוואה לא נקראו מדף BTB."
    // `btbProbe` הכריע: הקוד היה תקין והדף היה **מסך ההתחברות** של
    // auth.btbisrael („אנא הזינו מספר תעודת זהות"). זו בדיוק ההערה של טל
    // מ-24.08 על בנק מנותק: „אם הבנק לא מנותק למה אין הודעה, רק בדיעבד הבנתי".
    // **ניתוק חייב להיאמר במפורש ומיד — לא להתחפש לכשל קריאה אחרי 25 שניות.**
    const LOGIN_URL=/auth\.btbisrael|\/signin/i;
    const LOGIN_TEXT=/הזינו מספר תעודת זהות|כניסה לאזור האישי/;
    const needsLogin=async read=>{
      const cur=await chrome.tabs.get(tabId).catch(()=>null);
      return LOGIN_URL.test(String(cur?.url||''))||LOGIN_TEXT.test(String(read?.data?.__diag?.head||''));
    };
    // ⚠ המסך נפתח ב-startBtb ולא כאן, כי `finally` מריץ restoreSyncTabs
    // שמחזיר חלונות למקומם — מיקוד שנעשה כאן היה נמחק מיד אחר כך.
    const sayLogin=async()=>{
      await chrome.storage.local.set({syncStatus:'BTB: החיבור נותק — התחבר במסך שנפתח ולחץ שוב על „התחלת סנכרון"'});
      return{ok:true,status:'waiting_login'};
    };
    if(await needsLogin(null))return await sayLogin();
    // ⚠ המתנה לתוכן ולא למספר שניות — הלקח מ-1.20.1.
    let read=null;const deadline=Date.now()+25000;
    while(Date.now()<deadline){
      try{await chrome.scripting.executeScript({target:{tabId},files:['btb-content.js']})}catch(e){}
      await delay(600);
      try{read=await chrome.tabs.sendMessage(tabId,{type:'BTB_READ'})}catch(e){read=null}
      if(read?.ok&&(read.data.balance!=null||read.data.number))break;
      if(await needsLogin(read))return await sayLogin();
      await delay(1200);
    }
    await chrome.storage.local.set({btbProbe:{at:new Date().toISOString(),data:read?.data||null,error:read?.error||''}});
    if(!read?.ok||read.data.balance==null)throw Error(read?.error||'פרטי ההלוואה לא נקראו מדף BTB');
    const d=read.data,number=d.number||'BTB';
    // ⚠ שארית התקופה = סך התשלומים פחות ששולמו; אם המונה חסר — אין על מה לחשב.
    const remaining=(d.totalInstallments&&d.paidInstallments!=null)?d.totalInstallments-d.paidInstallments:null;
    // ⚠⚠ 27.08.2026 — טל: „BTB לא מעדכנים במועד התשלום אלא רק אחרי מועד התשלום
    // הבא. מכיוון שה-300 אלף נכנס אחרי התשלום החודשי, הוא יעודכן רק ב-17/9/26."
    // כלומר **היתרה שמוצגת מפגרת אחרי המציאות**: 685,056.68 עדיין אינה מכילה
    // את הפירעון, והיתרה האמיתית היא 385,056.68.
    // ⚠ **הריבית מחושבת דווקא מן היתרה המוצגת** — היא והתשלום הם הזוג העקבי
    // שהאתר מציג (3.20%). מול היתרה האמיתית אותו תשלום היה משתמע 8.96%,
    // כי הוא שייך ללוח הישן. **בדיקה הפוכה זו היא שאישרה את הכיוון.**
    // ⚠⚠⚠ 27.08.2026 — טל: „תבדוק בתיקייה BTB את ההסכם ותראה." **ההסכם מכריע,
    // והוא הפריך את מה שחישבתי.** `הסכם חדש חתום btb.pdf` נוקב במפורש:
    // „ריבית הפריים הינה 5.00%, ומכאן שהריבית השנתית הינה 8%" — כלומר **פריים + 3%**.
    // (המסמך סרוק ואין בו שכבת טקסט; הציטוט רשום ב-CLAUDE.md של המסלקה מ-10.08.)
    //
    // ⚠ **מבחן הכרעה שמוכיח שהיתרה המוצגת מיושנת, בלי להסתמך על דיווח:**
    //     ריבית חודשית על 685,056.68 ב-8% = 4,567.04
    //     התשלום החודשי                    = 3,155.15
    //   התשלום **אינו מכסה אפילו את הריבית** — הלוואה כזו רק תופחת. בלתי אפשרי.
    // ומול היתרה האמיתית הכול נסגר לאגורה:
    //     ריבית 2,567.04 + קרן 588.11 = **3,155.15** בדיוק.
    //
    // ⚠⚠ **ולכן החישוב הקודם היה שגוי:** גזירת ריבית מ-(685,057 · 3,155.15 · 325)
    // נתנה 3.20%, מספר שנראה סביר ולכן לא עורר חשד — **אבל הוא נגזר מנתון
    // שהתיישן.** גזירה מאותו תשלום מול היתרה האמיתית נותנת **8.00% בדיוק.**
    // **נתון שנראה סביר אינו נתון נכון.** המקור החוזי גובר על הגזירה.
    // AUDIT סעיף 7: הפריים אינו קבוע בקוד יותר — הוא נקרא מהאחסון, ניתן
    // לעדכון מהדשבורד, ומזדקן בקול: אחרי 60 יום בלי עדכון מופיעה התרעה.
    const primeSt=await chrome.storage.local.get({btbPrime:0.05,btbPrimeSetAt:''});
    const BTB_PRIME=Number(primeSt.btbPrime)||0.05,BTB_SPREAD=0.03;
    const primeAge=primeSt.btbPrimeSetAt?Math.round((Date.now()-Date.parse(primeSt.btbPrimeSetAt))/86400000):null;
    const primeStale=primeAge==null||primeAge>60;
    const contractual=BTB_PRIME+BTB_SPREAD;
    // ⚠ העמודה צרה ועוברת דרך `short()`, ולכן המספר לבדו בתא והמקור בריחוף.
    // מחרוזת ארוכה הייתה נחתכת ל„8.00% (פריים 5.0…" — גרוע מלא להציג כלום.
    const rateText=`${(contractual*100).toFixed(2)}%`;
    const effective=Math.pow(1+contractual/12,12)-1;
    const rateNote=`פריים ${(BTB_PRIME*100).toFixed(2)}% + ${(BTB_SPREAD*100).toFixed(2)}% — מההסכם החתום · אפקטיבית ${(effective*100).toFixed(2)}%${primeStale?' · ⚠ הפריים לא עודכן מעל 60 יום — עדכן בשורת הגיבוי בדשבורד':''}`;
    // ⚠ מתי מפחיתים? רק כשמדובר בפירעון ולא בתשלום חודשי רגיל, **וכל עוד לא
    // הגיע מועד העדכון**. סף של פי 2 מהתשלום הרגיל מפריד ביניהם; בלעדיו היינו
    // מפחיתים גם תשלום שוטף ומציגים יתרה נמוכה מדי.
    const dmy=v=>{const m=String(v||'').match(/(\d{2})[.\/](\d{2})[.\/](\d{4})/);
      return m?Date.UTC(+m[3],+m[2]-1,+m[1]):null};
    const lump=Number(d.lastPayment)||0,regular=Number(d.nextPayment)||0,dueMs=dmy(d.nextPaymentDate);
    // ⚠⚠ 27.08.2026 — התנאי הקודם היה `!!dueMs&&Date.now()<dueMs`, ולכן **תאריך
    // שלא נקרא ביטל את כל ההיגיון**: היתרה נשארה 685,056.68 והריבית 8% הוצגה
    // לצד יתרה שמכחישה אותה. תאריך חסר אינו ראיה לכך שהפירעון כבר נקלט.
    // המבחן הכלכלי גובר: אם התשלום אינו מכסה את הריבית על היתרה המוצגת,
    // אותה יתרה **אינה יכולה** להיות נכונה — וזה נכון גם בלי שום תאריך.
    const impossible=regular>0&&d.balance*(contractual/12)>=regular;
    const lumpPending=lump>0&&regular>0&&lump>=regular*2&&((!!dueMs&&Date.now()<dueMs)||impossible);
    const trueBalance=lumpPending?Number((d.balance-lump).toFixed(2)):d.balance;
    // ההחזר הצפוי אחרי שהפירעון ייושם, אם התקופה נשמרת
    // ⚠ טל: „ההחזר הבא הוא נכון" — כלומר התשלום אינו יורד, **התקופה מתקצרת.**
    // לכן מחשבים כמה תשלומים נותרו, ולא איזה תשלום יהיה.
    const im=contractual/12,cover=trueBalance*im;
    const monthsLeft=(cover<d.nextPayment)
      ?Math.ceil(-Math.log(1-trueBalance*im/d.nextPayment)/Math.log(1+im)):null;
    // ⚠ אם התשלום אינו מכסה את הריבית — לא מחזירים מספר, מדווחים את הבעיה.
    const coverageWarning=cover>=d.nextPayment
      ?`התשלום ${d.nextPayment} אינו מכסה ריבית של ${cover.toFixed(2)} — היתרה שנקראה כנראה מיושנת`:'';
    const loan={type:`הלוואת BTB${d.number?` #${d.number}`:''}`,balance:trueBalance,
      // ⚠ מה שהאתר הציג נשמר לצד האמת, כדי שתמיד אפשר יהיה להסביר את הפער.
      shownBalance:d.balance,lumpPending,monthsLeft,coverageWarning,
      interestNote:rateNote,rateSource:'הסכם BTB — פריים + 3%',
      originalPrincipal:d.originalPrincipal,startDate:d.startDate,endDate:d.endDate,
      nextPayment:d.nextPayment,nextPaymentDate:d.nextPaymentDate,interest:rateText,
      // ⚠ הפירעון החד-פעמי נשמר על ההלוואה — הוא מסביר את הפער בין הסכום
      // המקורי ליתרה, ובלעדיו התשלום החודשי נראה בלתי אפשרי.
      lastPayment:d.lastPayment,lastPaymentDate:d.lastPaymentDate,      rateContractual:{prime:BTB_PRIME,spread:BTB_SPREAD,nominal:contractual,effective},
      installments:d.totalInstallments||null,totalInstallments:d.totalInstallments||null,
      // ⚠ המונה שבאתר (35/360) מפגר בדיוק כמו היתרה, ולכן 325 סותר את 8%.
      // כשיש חישוב מן היתרה האמיתית — הוא מה שמוצג, והמספר של האתר נשמר לצדו.
      siteRemainingInstallments:(d.totalInstallments&&d.paidInstallments!=null)?d.totalInstallments-d.paidInstallments:null,
      remainingInstallments:monthsLeft??((d.totalInstallments&&d.paidInstallments!=null)?d.totalInstallments-d.paidInstallments:null),
      accountKey:`BTB-${number}`};
    const now=new Date().toISOString();
    const account={source:'btb',sourceLabel:'BTB',branch:'BTB',accountNumber:number,
      id:`btb-${number}`,selectionKey:`btb|BTB-${number}`,nickname:`BTB — הלוואה ${number}`,
      owner:'',balance:null,creditLimit:null,availableCredit:null,transactions:[],cards:[],
      loans:[loan],lastSync:now,status:d.active?'מסונכרן':'מסונכרן — ההלוואה אינה פעילה'};
    // ⚠ בתוך המנעול (AUDIT סעיף 2): חלון קרא-שנה-כתוב קצר, מסודר בתור.
    await accountsMutex(async()=>{
    const state=await chrome.storage.local.get({accounts:[],selectedAccountKeys:[]});
    const accounts=[...state.accounts.filter(a=>a.source!=='btb'),account];
    const selectedAccountKeys=[...new Set([...state.selectedAccountKeys,account.selectionKey])];
    await chrome.storage.local.set({accounts,selectedAccountKeys,lastAutoSync:now,
      syncStatus:lumpPending
        ?`BTB: הסנכרון הסתיים — הלוואה ${number}, יתרה ${trueBalance} (פירעון ${lump} טרם עודכן באתר)`
        :`BTB: הסנכרון הסתיים — הלוואה ${number}, יתרה ${trueBalance}`});});
    await closeSyncTabs();if(!autoBusy)await chrome.runtime.openOptionsPage();
    return{ok:true,balance:d.balance,number};
  }catch(e){await chrome.storage.local.set({syncStatus:`שגיאה ב-BTB: ${e.message}`});throw e}
  finally{btbBusy=false;await restoreSyncTabs()}
}
async function probeAllFrames(tabId){
  let frames=[];
  try{frames=await chrome.webNavigation.getAllFrames({tabId})||[]}catch(e){frames=[]}
  if(!frames.length)frames=[{frameId:0,url:''}];
  const out=[];
  for(const f of frames.slice(0,12)){
    try{
      await chrome.scripting.executeScript({target:{tabId,frameIds:[f.frameId]},files:['probe-content.js']});
      const r=await withTimeout(chrome.tabs.sendMessage(tabId,{type:'BANK_PROBE'},{frameId:f.frameId}),15000,'מדידת מסגרת');
      if(r?.ok)out.push({frameId:f.frameId,...r.probe});
    }catch(e){out.push({frameId:f.frameId,url:String(f.url||'').slice(0,120),probeError:String(e?.message||e).slice(0,90)})}
  }
  return out;
}
async function probeActiveTab(){
  // ⚠ 18.08.2026 — היה כאן {active:true,currentWindow:true}, ולכן הכפתור מדד **את
  // הדשבורד עצמו**: הלחיצה מתבצעת בחלון הדשבורד, ושם הלשונית הפעילה היא הדשבורד.
  // התוצאה הייתה תמיד „הלשונית הפעילה אינה דף בנק (chrome-extension://…)".
  // הבחירה הנכונה: הלשונית ה-https הפעילה שנצפתה לאחרונה, בכל החלונות.
  // ⚠ 18.08.2026 — lastAccessed אינו קיים בכל גרסאות Chrome, ואז המיון שרירותי
  // והמדידה נופלת על לשונית זרה. לכן קודם כל **מארחי בנק מוכרים** מתוך
  // host_permissions, ורק אחר כך כל https אחר.
  // ⚠ 27.08.2026 — בלי `btbisrael` כאן, „מדוד לשונית פעילה" היה משיב
// „הלשונית שנמצאה אינה אתר בנק מוכר" — כלומר לא היינו יכולים למדוד את BTB בכלל.
const BANK_HOST=/(bankhapoalim|bankhapoalim\.biz|leumi|bankleumi|bank-yahav|yahav|discountbank|telebank|fibi|mizrahi-tefahot|isracard|cal-online|max|btbisrael)\./i;
  const open_=(await chrome.tabs.query({})).filter(t=>t?.id&&/^https:/.test(t.url||''));
  const rank=t=>(BANK_HOST.test(new URL(t.url).hostname)?0:1);
  open_.sort((a,b)=>rank(a)-rank(b)||(b.lastAccessed||0)-(a.lastAccessed||0)||(b.active?1:0)-(a.active?1:0));
  const tab=open_[0];
  if(!tab?.id)throw Error('לא נמצאה לשונית בנק פתוחה — פתח את דף הבנק ונסה שוב');
  if(rank(tab))throw Error(`הלשונית שנמצאה אינה אתר בנק מוכר (${new URL(tab.url).hostname}) — פתח את דף הבנק ונסה שוב`);
  // ⚠ המדידה נתקעה אצל טל והכפתור נשאר „מודד…" בלי סוף: לא היה טיימאאוט ולא היה
  // שום סימן איזו לשונית נבחרה. שני הדברים מטופלים כאן — קודם מדווחים, ואז מודדים.
  await chrome.storage.local.set({syncStatus:`מודד את ${new URL(tab.url).hostname}…`});
  if(!/^https:/.test(tab.url||''))throw Error(`הלשונית הפעילה אינה דף בנק (${tab.url||'ללא כתובת'})`);
  try{await withTimeout(chrome.scripting.executeScript({target:{tabId:tab.id},files:['probe-content.js']}),15000,'הזרקת הגשש')}
  catch(e){throw Error(`הגשש לא נטען ב-${new URL(tab.url).hostname}: ${e.message}`)}
  await delay(400);
  const r=await withTimeout(chrome.tabs.sendMessage(tab.id,{type:'BANK_PROBE'}),20000,'המדידה');
  if(!r?.ok)throw Error(r?.error||'המדידה לא החזירה דבר');
  // ⚠⚠ 27.08.2026 — טל מבקש לעבור למסך „תנועות בחשבון" **החדש** בבינלאומי:
  // שם, אחרי בחירת הטווח, **כל התנועות בעמוד אחד** — בלי מסגרת לגסי, בלי
  // `LinkForm077` ובלי דפדוף. **המסך הזה לא נמדד מעולם.**
  // כדי לכתוב לו מתאם צריך את ה-DOM שלו, ולכן כפתור „מדוד לשונית פעילה"
  // אוסף עכשיו **את כל המסגרות** ולא את העליונה בלבד, ובעולם הראשי גם את
  // הכתובת המדויקת. ⚠ קריאה בלבד — בלי לחיצות ובלי ניווט.
  let frames=[];
  try{frames=await probeAllFrames(tab.id)}catch(e){frames=[]}
  await chrome.storage.local.set({bankProbe:r.probe,bankProbeFrames:{at:new Date().toISOString(),url:tab.url,frames},
    syncStatus:`נמדד: ${r.probe.host} · ${r.probe.grid?.datedRows||0} שורות עם תאריך · ${frames.length} מסגרות`});
  return{ok:true,host:r.probe.host};
}
async function leumiSnapshot(tabId){try{const s=await withTimeout(chrome.tabs.sendMessage(tabId,{type:'LEUMI_SNAPSHOT'}),20000,'צילום דף לאומי');return s?.debug||null}catch{return null}}
function dbgText(asked,d){if(!d)return' | אבחון: לא התקבל צילום מצב מהעמוד';const landed=d.url===asked?'הכתובת שביקשנו':`הדפדפן נחת ב-${d.url}`;return` | אבחון: ${landed}; טבלאות ${d.tables}, שורות ${d.rows}, מהן עם תאריך ${d.datedRows} (${d.cols} עמודות); לשוניות חשבון ${d.tabs}; ₪ לפני מספר ${d.shekelBefore}, ₪ אחרי מספר ${d.shekelAfter}; שורה ראשונה ${JSON.stringify(d.firstRow)}; פתיח ${String(d.head||'').slice(0,220)}`}
async function syncLeumi(keys){const tabs=leumiSession(await chrome.tabs.query({url:['https://hb2.bankleumi.co.il/*']}));if(!tabs[0])throw Error('החיבור ללאומי אינו פעיל');
// היתרות שנקראו מבורר החשבונות בזיהוי משמשות נפילה לאחור, כדי שכרטיס יתרה שלא רונדר
// לא יפיל את הסנכרון כולו אחרי שלושה ניסיונות של שתי דקות וחצי כל אחד.
await clearSourceDiags('leumi');
const disc=(await chrome.storage.local.get({discoveredAccounts:[]})).discoveredAccounts;
const balances={};for(const a of disc)if(a.source==='leumi'&&a.balance!=null)balances[`${a.branch}-${a.accountNumber}`]=a.balance;const tabId=leumiTab(tabs).id,txUrl=LEUMI_TX_URL,loanUrl=LEUMI_LOAN_URL;noteSyncTab(tabId);let r,lastError='',lastDebug=null;
// ⚠⚠ 28.08.2026 - טל צפה חי: "כשהדף מוצג זה עובר, כשהדף מוקטן זה לא עובר."
// מזעור = rAF קפוא = רשת התנועות לא נבנית (הלקח המדוד מ-17-18.08, הפעם
// נצפה בעיניים על המעבר בין חשבונות). שומר: כל 2 שניות, חלון עבודה ממוזער
// מוחזר ל-normal בלי פוקוס. נעצר לבד אחרי 15 דקות או בסיום התקין.
const visGuard0=Date.now();
const visGuard=setInterval(async()=>{try{
  if(Date.now()-visGuard0>15*60e3)return clearInterval(visGuard);
  const t=await chrome.tabs.get(tabId),w=await chrome.windows.get(t.windowId);
  if(w.state==='minimized'){await chrome.windows.update(t.windowId,{state:'normal'});
    await chrome.storage.local.set({syncStatus:'לאומי: חלון העבודה היה ממוזער והוחזר — מזעור מקפיא את רשת התנועות'});}
}catch(e){}},2000);
// WHY 27.08.2026 - "למה הסנכרון של לאומי נורא איטי". במקום להתווכח על
// ההערכה, כל שלב נמדד ונרשם ל-leumiTiming. הריצה הבאה תענה בעצמה.
const t0=Date.now();const stageMs={};const stamp=(k,from)=>{stageMs[k]=Date.now()-from};const attempts=[];
// ⚠⚠ 28.08.2026 - נמדד חי: חשבון 348300 עבר בדלתא (22 שורות) ואז 876000
// נתקע ב"ממתין לרשת התנועות" - והניסיון החוזר קרא מחדש **גם את מה שכבר
// הצליח**. כשל של חשבון אחד לא זורק עוד את עבודת השאר: תוצאות חלקיות
// נאספות בין הניסיונות, וניסיון חוזר מבקש רק את החשבונות החסרים.
const collectedLeumi=new Map();let lastGoodR=null;
for(let attempt=1;attempt<=3;attempt++){const missingKeys=keys.filter(k=>!collectedLeumi.has(k));const attemptStart=Date.now();await chrome.storage.local.set({syncStatus:`לאומי: סנכרון בתהליך — קורא תנועות, ניסיון ${attempt} מתוך 3${collectedLeumi.size?` (${collectedLeumi.size} חשבונות כבר בידיים, ממשיך ב-${missingKeys.length})`:''}`});try{await prepareLeumiRoute(tabId,txUrl);// WHY: לדף עצמו יש המתנה מוצהרת של 45 שניות (openCurrentAccount), והשומר
// ב-45 ירה **באותו רגע** ובלע את ההודעה המדויקת שלו ("רשת התנועות לא
// נטענה") לטובת "הפסיק להגיב" הכללי. 75 שניות נותנות לדף לומר את שלו קודם.
// ⚠ שומר שמקדים את השגיאה האמיתית גרוע משומר שאין - הוא מוחק ראיה.
const rr=await withHeartbeat(chrome.tabs.sendMessage(tabId,{type:'LEUMI_SYNC_SELECTED',keys:missingKeys,balances}),leumiSyncBudget(missingKeys.length),'קריאת תנועות בלאומי',75000);
for(const a of (rr?.accounts||[]))if(a&&a.balance!=null&&Array.isArray(a.transactions))collectedLeumi.set(a.key,a);
if(rr?.ok)lastGoodR=rr;
if(collectedLeumi.size===keys.length){r={...(lastGoodR||rr||{}),ok:true,accounts:keys.map(k=>collectedLeumi.get(k))};break}
lastError=rr?.error||'לא התקבלו תנועות ויתרות מלאות';lastDebug=rr?.debug||await leumiSnapshot(tabId)}catch(e){lastError=e.message;lastDebug=await leumiSnapshot(tabId)}
// WHY: עד עכשיו רק הסיבה של הניסיון האחרון שרדה, ולכן לא היה אפשר לדעת
// אם הראשון נפל אחרת. שלוש הסיבות והזמנים נשמרים.
if(BFCACHE.test(String(lastError||'')))leumiForceInject=true;
attempts.push({attempt,seconds:Math.round((Date.now()-attemptStart)/1000),error:String(lastError||'').slice(0,160)});
await chrome.storage.local.set({leumiAttempts:attempts});
// WHY: נמדד - שלושת הניסיונות נפלו על **אותה שגיאה בדיוק**, 48 ו-47 שניות.
// חזרה שלישית על תנאים זהים אינה ניסיון נוסף, היא רק המתנה נוספת.
// ⚠ שתי שגיאות שונות כן מצדיקות ניסיון שלישי - זה עשוי להיות רעש חולף.
if(attempts.length>=2&&!BFCACHE.test(String(lastError||''))&&attempts[attempts.length-1].error===attempts[attempts.length-2].error){
  lastError=`${lastError} (שני ניסיונות נפלו זהה — הופסק)`;r=null;break}
r=null}
// חלקי עדיף על כלום: מה שנקרא בהצלחה ממשיך בצנרת (נשמר, מקבל הלוואות),
// והחשבונות שנכשלו נאמרים במפורש בסוף במקום להפיל את כולם.
let leumiMissingKeys=[];
if(!r&&collectedLeumi.size){leumiMissingKeys=keys.filter(k=>!collectedLeumi.has(k));
  r={...(lastGoodR||{}),ok:true,accounts:[...collectedLeumi.values()]};
  await chrome.storage.local.set({syncStatus:`לאומי: ${collectedLeumi.size} חשבונות נקראו; ${leumiMissingKeys.length} נכשלו (${String(lastError||'').slice(0,80)}) — ממשיך עם מה שבידיים`});}
if(!r){await chrome.storage.local.set({leumiDebug:{stage:'transactions',asked:txUrl,error:lastError,text:dbgText(txUrl,lastDebug),...(lastDebug||{})}});throw Error(`קריאת תנועות לאומי נכשלה לאחר 3 ניסיונות: ${String(lastError||'').slice(0,120)}`)}stamp('transactions',t0);
const syncedLeumiKeys=r.accounts.map(a=>a.key);
// WHY 28.08.2026 - טל: "לא הצליח, אין עדכון". והמדידה הראתה שהכול **כן**
// נקרא: 200 שורות תנועות, ושתי הלוואות משני חשבונות, עד "סוגר הרחבה".
// ואז הריצה נעלמה - **וכל העבודה נזרקה.** הסיבה מבנית: `syncLeumi` מחזיר
// את התוצאה, והשמירה לאחסון מתרחשת **פעם אחת בלבד, בסוף כל הזרימה**.
// 113 שניות של תנועות תקינות אבדו בגלל שלב שבא אחריהן.
// ⚠⚠ הכלל: **מה שנקרא בהצלחה נשמר מיד.** שלב מאוחר שנכשל רשאי לגרוע
// העשרה, לא למחוק עבודה שכבר הושלמה. זה גם מקצר את החשיפה: כל הודעה
// בודדת קצרה יותר, ו-service worker שנרדם באמצע אינו מוחק הכול.
// ⚠ השמירה הזאת עוקפת את markNewTransactions/applyCollectSince שרצים
// אצל הקורא - וזה בסדר: היא רשת ביטחון, והשמירה הסופית תדרוס אותה
// דרך המסלול המלא.
const stashLeumi=async list=>{try{await accountsMutex(async()=>{
  const st=await chrome.storage.local.get({accounts:[]});
  const ids=new Set(list.map(a=>a.id));
  await chrome.storage.local.set({accounts:[...st.accounts.filter(a=>!ids.has(a.id)),...list.map(a=>keepAssignedCards(st.accounts,a))]});});
}catch(e){}};
{const now0=new Date().toISOString();
 const partial=r.accounts.map(a=>({...a,owner:a.nickname,source:'leumi',sourceLabel:'לאומי',
   selectionKey:`leumi|${a.key}`,id:`leumi-${a.key}`,lastSync:now0,
   status:'מסונכרן — תנועות ויתרות (הלוואות בהמשך)'}));
 await stashLeumi(partial);leumiStashed=partial.length;
 const txSoFar=partial.reduce((sum,a)=>sum+(a.transactions?.length||0),0);
 await chrome.storage.local.set({syncStatus:`לאומי: ${partial.length} חשבונות ו-${txSoFar} תנועות נשמרו — ממשיך להלוואות`});}
const tLoans=Date.now();let lr=null;lastError='';lastDebug=null;const loanAttempts=[];
// ⚠ 28.08.2026 - DELTA-AUDIT פער 5: כל היתרות זהות לשמורות => ההלוואות
// (החלק הכבד - עד 3×120 שניות) נלקחות מהמסד. תשלום הלוואה משנה את יתרת
// העו"ש, ולכן יתרות-זהות בכל החשבונות מכסות גם אותן. די בחשבון אחד שהשתנה
// או שחסר לו רישום שמור - וקוראים מהאתר כרגיל. התנועות כבר נקראו מלאות.
{const stL=await chrome.storage.local.get({accounts:[]});
 const savedBy=new Map(stL.accounts.filter(a=>a.source==='leumi').map(a=>[a.id,a]));
 const allSame=r.accounts.length>0&&r.accounts.every(a=>{const s=savedBy.get(`leumi-${a.key}`);
   return s&&s.balance!=null&&a.balance!=null&&Math.abs(Number(a.balance)-Number(s.balance))<0.005&&Array.isArray(s.loans)});
 if(allSame){
   lr={ok:true,accounts:r.accounts.map(a=>{const s=savedBy.get(`leumi-${a.key}`);
     return{key:a.key,loans:(s.loans||[]).map(l=>({...l})),
       ...(s.loansTotal!=null?{loansTotal:s.loansTotal}:{}),...(s.loanCount!=null?{loanCount:s.loanCount}:{})}})};
   await chrome.storage.local.set({syncStatus:'לאומי: היתרות לא השתנו — ההלוואות נלקחו מהמסד'});
 }}
if(!lr)for(let attempt=1;attempt<=3;attempt++){const loanStart=Date.now();await chrome.storage.local.set({syncStatus:`לאומי: סנכרון בתהליך — קורא הלוואות, ניסיון ${attempt} מתוך 3`});try{await prepareLeumiRoute(tabId,loanUrl);lr=await withHeartbeat(chrome.tabs.sendMessage(tabId,{type:'LEUMI_LOANS_SELECTED',keys:syncedLeumiKeys}),leumiLoanBudget(syncedLeumiKeys.length),'קריאת הלוואות בלאומי',45000);if(lr?.ok&&lr.accounts?.length===syncedLeumiKeys.length&&lr.accounts.every(a=>Array.isArray(a.loans)))break;lastError=lr?.error||'לא התקבל פירוט הלוואות מלא';lastDebug=lr?.debug||await leumiSnapshot(tabId)}catch(e){lastError=e.message;lastDebug=await leumiSnapshot(tabId)}
// ⚠ נמדד: שלושת הניסיונות נפלו על אותה שגיאה, 120/120/121 שניות.
// חזרה שלישית על תנאים זהים אינה ניסיון - היא רק עוד שתי דקות.
if(BFCACHE.test(String(lastError||'')))leumiForceInject=true;
loanAttempts.push({attempt,seconds:Math.round((Date.now()-loanStart)/1000),error:String(lastError||'').slice(0,160)});
await chrome.storage.local.set({leumiLoanAttempts:loanAttempts});
if(loanAttempts.length>=2&&!BFCACHE.test(String(lastError||''))&&loanAttempts[loanAttempts.length-1].error===loanAttempts[loanAttempts.length-2].error){
  lastError=`${lastError} (שני ניסיונות נפלו זהה — הופסק)`;lr=null;break}
lr=null}if(!lr){await chrome.storage.local.set({leumiDebug:{stage:'loans',asked:loanUrl,error:lastError,text:dbgText(loanUrl,lastDebug),...(lastDebug||{})}});throw Error(`קריאת הלוואות לאומי נכשלה לאחר 3 ניסיונות: ${String(lastError||'').slice(0,120)}${leumiStashed?` — אבל ${leumiStashed} חשבונות עם התנועות והיתרות כבר נשמרו`:''}`)}// ⚠⚠ 22.08.2026 — טל: „הסנכרון בלאומי לא נראה לי תקין." הוא צדק, ונמדד:
// חשבון 921-348300 נשמר עם status „מסונכרן ומאומת" — ובפועל 28 תנועות
// שמשתרעות על 06.07 עד 02.08 בלבד, בעוד היום 22.08. שרשרת היתרות שלהן
// **תקינה לחלוטין** (0 שברים ב-27 מעברים), כלומר הקריאה נכונה אבל **חסרה**:
// יתרת התנועה האחרונה 50,176.99 מול יתרת החשבון 18,487.92 — **פער של
// 31,689.07 ש״ח ו-20 יום** שלא נקראו.
// **מה שהאימות באמת בדק:** שמספר החשבונות תואם, שיש balance, ושה-transactions
// הוא מערך. הוא **מעולם לא בדק שהתנועות מגיעות עד היתרה** — ולכן „ומאומת"
// היה הבטחה שהקוד אינו מקיים. זה הדבר המסוכן כאן: קריאה חלקית שנראית שלמה.
// **לא זורקים את הנתונים** — 28 התנועות נכונות ושימושיות, בשונה מתקלת הזהות
// בדיסקונט שבה שמירה הייתה מייחסת כסף לחשבון אחר. כאן רק מפסיקים לשקר:
// המצב נאמר כפי שהוא, והפער נרשם כדי שהסבב הבא ייבנה ממדידה.
// ⚠ 22.08.2026 — השלמה לתיקון שלמטה: גם שורת הסטטוס העליונה
// (leumiStatus) אמרה הסתיים ואומת, בעוד רשומת החשבון עצמה נשמרה
// כ-מסונכרן חלקית. תיקנתי את הרשומה ושכחתי את הכותרת —
// והכותרת היא מה שהמשתמש רואה קודם. הבטחה חצאית גרועה מכלום.
const gapOf=a=>{const rows=a.transactions||[];if(!rows.length||a.balance==null)return null;
  const last=rows[rows.length-1],diff=Math.round(((Number(a.balance)||0)-(Number(last.balance)||0))*100)/100;
  return Math.abs(diff)<0.01?null:{diff,until:last.date||'',rows:rows.length}};
const money=n=>Number(n).toLocaleString('he-IL',{minimumFractionDigits:2,maximumFractionDigits:2});
// ⚠ רשת שנייה, בלתי תלויה באימות שבדף: אם שני חשבונות חזרו עם **אותן
// הלוואות בדיוק**, אחד מהם קיבל את של השני. שומרים לראשון, ומרוקנים את
// השני במקום להציג את אותה הלוואה פעמיים תחת שני בעלים.
{const fp=a=>JSON.stringify((a.loans||[]).map(l=>[l.type,l.balance,l.endDate,l.nextPayment]));
 const byFp=new Map();
 for(const a of (lr.accounts||[])){const f=fp(a);if(!(a.loans||[]).length)continue;
   if(byFp.has(f)){a.loans=[];a.loansTotal=0;a.loanCount=0;a.loanDuplicateOf=byFp.get(f);
     try{await chrome.storage.local.set({leumiLoanDuplicate:{key:a.key,sameAs:byFp.get(f),at:new Date().toISOString()}})}catch{}}
   else byFp.set(f,a.key);}}
const loansByKey=new Map((lr.accounts||[]).map(a=>[a.key,a])),now=new Date().toISOString(),gaps={},
result=r.accounts.map(a=>{const gap=gapOf(a);if(gap)gaps[a.key]=gap;
  return{...a,...(loansByKey.get(a.key)||{}),owner:a.nickname,source:'leumi',sourceLabel:'לאומי',
  selectionKey:`leumi|${a.key}`,id:`leumi-${a.key}`,lastSync:now,
  status:gap?`מסונכרן חלקית — התנועות עד ${gap.until}, פער ${money(gap.diff)} ₪ עד היתרה`:'מסונכרן ומאומת'}});
await chrome.storage.local.set({leumiGap:Object.keys(gaps).length?{at:now,accounts:gaps}:null,leumiRangeProbe:r.rangeProbe||null,leumiDateMenu:r.dateMenu||null,leumiRadios:r.radios||null,leumiGridProbe:r.grid||null});const txCount=result.reduce((sum,a)=>sum+(a.transactions?.length||0),0),loanCount=result.reduce((sum,a)=>sum+(a.loans?.length||0),0),chequeCount=result.reduce((sum,a)=>sum+(a.chequeCount||0),0);
    // ⚠ הלוואה שנקראה בלי תשלום קרוב נאמרת. "הסתיים" על נתון חלקי הוא
    // בדיוק ההבטחה החצאית שתוקנה ב-22.08.
    const missingPay=result.reduce((sum,a)=>sum+(Number(a.missingPayment)||0),0);
// שמירת הצילומים לא מסכנת את הסנכרון: אם היא נכשלת, היתרות והתנועות כבר בידינו.
stamp('loans',tLoans);const tCheques=Date.now();
// ⚠ ההלוואות נשמרות לפני קציר השיקים, שהוא השלב הארוך והפחות קריטי.
// עד עכשיו כשל בקציר היה מאבד גם אותן.
await stashLeumi(result);
let saved=0;try{saved=await harvestLeumiCheques(tabId,result,txUrl)}catch(e){await chrome.storage.local.set({chequeError:e.message})}
stamp('cheques',tCheques);stageMs.total=Date.now()-t0;
await chrome.storage.local.set({leumiTiming:{at:new Date().toISOString(),seconds:
  Object.fromEntries(Object.entries(stageMs).map(([k,v])=>[k,Math.round(v/100)/10]))}});
// WHY: אם נשארו צילומים, זה נאמר. "הסתיים" בלי לומר שמשהו נדחה הוא
// בדיוק ההבטחה החצאית שתוקנה ב-22.08 בשורת הסטטוס של לאומי.
const rep=(await chrome.storage.local.get({leumiChequeReport:null})).leumiChequeReport;
const left=Number(rep?.remaining)||0;
await chrome.storage.local.set({syncStatus:`הסתיים ואומת: ${result.length} חשבונות, ${txCount} תנועות, ${loanCount} הלוואות, ${chequeCount} הפקדות שיקים${saved?`, ${saved} צילומי שיקים נשמרו מקומית`:''}${left?` — נותרו ${left} צילומים לסנכרון הבא`:''}${missingPay?` · ${missingPay} הלוואות ללא תשלום קרוב (ההרחבה לא נפתחה)`:''}${leumiMissingKeys.length?` ⚠ ${leumiMissingKeys.length} חשבונות לא נקראו הפעם (${leumiMissingKeys.join(', ')}) — נסה שוב`:''}`});clearInterval(visGuard);return result}
let chequeCtx={base:0,total:0,noRef:0,done:0,selectionKey:'',savedRefs:new Set()};
let notFoundAll=[];
// WHY 27.08.2026 - טל: "ואיך מסדרים את זה".
// הזיכרון והיציאה המוקדמת מתקנים את **המצב היציב**, אבל לא את הריצה
// הראשונה: 129 שיקים כפול כמה שניות זה עדיין סנכרון ארוך, והמשתמש ממתין
// לתנועות וליתרות שכבר מוכנות מזמן.
// **הצילומים אינם חוסמים כלום** - היתרות, התנועות וההלוואות כבר נשמרו
// לפני שהקציר מתחיל. לכן הוא מקבל **תקציב זמן** ולא כמות: קוצר עד
// CHEQUE_BUDGET_MS ואז עוצר בנקודה נקייה וממשיך בסנכרון הבא.
// זה בדיוק הכלל שנלמד בבינלאומי: "תקרת סבבים אינה תקרת זמן" - כאן
// התקרה היא זמן, כי הזמן הוא מה שהמשתמש מרגיש.
const CHEQUE_BUDGET_MS=90000;
async function harvestLeumiCheques(tabId,accounts,txUrl){const have=await chequeKeys();let saved=0,routed=false,asked=0,failed=0,why='',stuck=0;
const budgetStart=Date.now();let outOfTime=0;const bfRetried=new Set();
{let total=0,noRef=0,already=0;
for(const a of accounts)for(const t of(a.transactions||[]))if(t.cheque){total++;
if(!t.reference)noRef++;else if(have.has(chequeId(a.selectionKey,t.reference)))already++}
chequeCtx={base:already,total,noRef,done:0,selectionKey:'',savedRefs:new Set()}}
const chequeSince=await collectSinceMs();
  // WHY 27.08.2026 - טל: "למה הסנכרון של לאומי נורא איטי".
  // שיק שנשמר פעם אחת מדולג (have), אבל שיק ש**אין לו צילום בבנק** לא נשמר
  // לעולם - ולכן נוסה מחדש בכל סנכרון, לנצח. במדידה שרשומה בקוד:
  // asked 94 - saved 64 - notFound 30, כלומר כשליש מהעבודה חוזרת לריק.
  // עכשיו נזכר מתי ניסינו, ומדלגים ל-30 יום. לא לתמיד: צילום עשוי להתווסף.
  const missingRaw=(await chrome.storage.local.get({leumiChequeMissing:{}})).leumiChequeMissing||{};
  // ⚠⚠ 31.08.2026 - טל לחץ "העתקת אבחון" וקיבל "אין עדיין אבחון".
  // **זו הייתה מגבלת תכנון ולא תקלה בכפתור:** הביקורת נכתבת רק בתוך קציר
  // צילומים, והקציר מדלג על כל שיק ש-`have` כבר מכיל. אצל טל כל הצילומים
  // שמורים (הם פשוט משויכים לא נכון) - ולכן `wanted` ריק תמיד, הקציר לא
  // רץ אף פעם, והאבחון לא היה נכתב **לעולם**.
  // הפתרון: מכסה מפורשת שמכריחה את הקציר לכלול מחדש כמה שיקים שכבר
  // שמורים, לצורך אבחון בלבד. נצרכת פעם אחת ומתאפסת.
  let auditForce=Number((await chrome.storage.local.get({chequeAuditForce:0})).chequeAuditForce)||0;
  const auditForced=auditForce;
  // AUDIT סעיף 4: הרשומות עצמן פגות אחרי 90 יום — לא רק הדילוג. בלעדיה
  // המפה גדלה לנצח, שיק אחד בכל פעם.
  const EXPIRE_MS=90*24*3600*1000;
  const missing=Object.fromEntries(Object.entries(missingRaw).filter(([,v])=>{
    const at=typeof v==='number'?v:(v?.at||0);return Date.now()-at<EXPIRE_MS}));
  const RETRY_MS=30*24*3600*1000,nowMs=Date.now();
  let skippedMissing=0;
  for(const a of accounts){const wanted=(a.transactions||[]).filter(t=>{
      if(!t.cheque||!t.reference)return false;
      if(!keepSince(t.date,chequeSince))return false;
      const id=chequeId(a.selectionKey,t.reference);
      // הצילום נשמר שוב תחת אותו מפתח, ולכן אין כאן נזק - רק מדידה.
      if(have.has(id)){if(auditForce<=0)return false;auditForce--;return true}
      // WHY 28.08.2026 - טל: "לא צילם חלק מהשיקים החדשים".
      // ⚠ הזיכרון שהוספתי ב-1.38.0 רשם **כישלון אחד** כ"אין צילום" ודילג
      // ל-30 יום. אבל הריצות האחרונות נפלו על bfcache באמצע הקציר -
      // כישלון **חולף** - ושיק חדש היה נקבר לחודש בגלל תקלה רגעית.
      // **מכה אחת אינה ראיה.** שתיים כן, וגם הן נבדקות מחדש אחרי 30 יום.
      // (התאימות לאחור נשמרת: ערך מספרי ישן נקרא כמכה אחת.)
      const rec=missing[id],tried=typeof rec==='number'?{at:rec,n:1}:rec;
      if(tried&&(tried.n||1)>=2&&nowMs-(tried.at||0)<RETRY_MS){skippedMissing++;return false}
      return true}).map(t=>({date:t.date,reference:t.reference}));
// ניווט אחד לכל הקציר; מעבר בין חשבונות נעשה בתוך הדף ולא בטעינה מחדש.
if(!wanted.length)continue;asked+=wanted.length;chequeCtx.selectionKey=a.selectionKey;
if(auditForced)try{await chrome.storage.local.set({chequeAuditForce:0})}catch(e){}
if(!routed){try{await prepareLeumiRoute(tabId,txUrl);routed=true}catch(e){why=`המעבר לדף התנועות נכשל: ${e.message}`;break}}
// באצוות, כדי שכשל באמצע לא יזרוק את מה שכבר ירד
for(let i=0;i<wanted.length;i+=6){if(abortFlag){why=why||ABORT_MESSAGE;break}
// WHY: הבדיקה **בין אצוות** ולא באמצע אחת - אצווה שנקטעת באמצע מאבדת
// את מה שכבר צולם בה. עצירה נקייה בלבד.
if(Date.now()-budgetStart>CHEQUE_BUDGET_MS){outOfTime+=wanted.length-i;
  why=why||'תקציב הזמן לצילומים נגמר - יימשך בסנכרון הבא';break}
const batch=wanted.slice(i,i+6);let r=null;
try{r=await withTimeout(chrome.tabs.sendMessage(tabId,{type:'LEUMI_CHEQUE_IMAGES',wanted:batch,key:a.key,offset:i,total:wanted.length}),300000,'צילומי שיקים בלאומי')}catch(e){why=why||e.message}
if(!r?.ok){
      // WHY 28.08.2026 - הסנכרון הסתיים (163.7 שניות, 2 חשבונות, 2 הלוואות)
      // אבל `leumiChequeReport` הראה asked:3 saved:0 failed:3 עם
      // why: "back/forward cache". כלומר **רק שלב השיקים** עדיין נופל שם -
      // הוא זה שמנווט בין חלונות תאריכים בתוך הקציר.
      // ⚠ שגיאת bfcache אינה "האצווה נכשלה" אלא "הערוץ נסגר": הזרקה מחדש
      // מחזירה את הסקריפט **ואת מאזין ה-unload איתו**, ואותה אצווה עשויה
      // להצליח. לכן ניסיון חוזר אחד לאצווה, בלי להתקדם.
      if(BFCACHE.test(String(r?.error||why||''))&&!bfRetried.has(i)){
        bfRetried.add(i);
        try{await chrome.scripting.executeScript({target:{tabId},files:['leumi-content.js']});await delay(500);
            await prepareLeumiRoute(tabId,txUrl)}catch(e){}
        i-=6;continue}
      // ⚠ מה שנשמר חי אינו כישלון, גם אם האצווה כולה לא חזרה.
      failed+=batch.filter(x=>!chequeCtx.savedRefs.has(String(x.reference))).length;
      why=why||r?.error||'הדף לא החזיר צילומים';
      // אצווה שנתקעה משאירה את הדף תקוע, והבאה אחריה תיתקע גם היא — 300 שניות כל אחת.
      // ניתוב מחדש נותן הזדמנות אחת; שתי תקיעות רצופות עוצרות את הקציר.
      if(++stuck>=2){why=`${why} — נעצר אחרי שתי אצוות תקועות`;break}
      try{await prepareLeumiRoute(tabId,txUrl)}catch(err){why=why||err.message;break}
      continue}
    stuck=0;
if(r?.images&&r.images.__notFound){notFoundAll.push(...r.images.__notFound);delete r.images.__notFound}
    // WHY: שני סוגי כישלון נרשמים לזיכרון - שורה שלא נמצאה ושיק שנלחץ ולא
    // החזיר צילום. שניהם עולים זמן בכל ריצה, ושניהם לא ישתנו מחר.
    // ⚠ רק "נלחץ ולא הגיע צילום" נספר. "השורה לא נמצאה" הוא כשל **חלון**
    // ולא כשל צילום - החלון עשוי לכסות את התאריך בריצה הבאה, ורישום שלו
    // כ"אין צילום" היה מסתיר שיקים תקינים.
    for(const ref of (r?.images?.__noImage||[])){
      const id=chequeId(a.selectionKey,ref),prev=missing[id];
      const n=(typeof prev==='number'?1:(prev?.n||0))+1;
      missing[id]={at:nowMs,n};}
    if(r?.images)delete r.images.__noImage;
for(const[reference,img]of Object.entries(r.images||{})){if(!img?.front)continue;await chequePut({id:chequeId(a.selectionKey,reference),selectionKey:a.selectionKey,reference,front:img.front,back:img.back||'',info:String(img.info||''),savedAt:new Date().toISOString()});saveChequeInfo(chequeId(a.selectionKey,reference),img.info);chequeCtx.savedRefs.add(String(reference));saved++}}}
  saved=Math.max(saved,chequeCtx.savedRefs.size);
await chrome.storage.local.set({leumiChequeMissing:missing,
  leumiChequeReport:{total:chequeCtx.total,already:chequeCtx.base,noReference:chequeCtx.noRef,asked,saved,failed,skippedMissing,remaining:outOfTime,notFound:notFoundAll.length,notFoundRefs:notFoundAll.slice(0,15),why,at:new Date().toISOString()}});
if(asked&&!saved)await chrome.storage.local.set({syncStatus:`לאומי: לא נשמר אף צילום שיק מתוך ${asked} מבוקשים — ${why||'ללא סיבה'}`});
return saved}
// טקסט חלון הצילום של לאומי, לפי מזהה שיק. נשמר בנפרד מהתמונות כדי
// שהדשבורד יוכל להציג אותו בכל שורה בלי לקרוא base64.
let chequeInfoQueue=Promise.resolve();
function saveChequeInfo(id,info){
  const text=String(info||'').trim();if(!id||!text)return;
  chequeInfoQueue=chequeInfoQueue.then(async()=>{
    const st=await chrome.storage.local.get({chequeInfo:{}}),map=st.chequeInfo||{};
    map[id]=text.slice(0,400);
    await chrome.storage.local.set({chequeInfo:map});
  }).catch(()=>{});
}
async function openLeumiCheque(m){const tabs=leumiSession(await chrome.tabs.query({url:['https://hb2.bankleumi.co.il/*']}));if(!tabs[0])throw Error('יש להתחבר ללאומי כדי להציג צילום שיק');await chrome.tabs.update(tabs[0].id,{url:'https://hb2.bankleumi.co.il/staticcontent/digitalfront/he/checks/cleared-checks/'});await delay(1600);const r=await chrome.tabs.sendMessage(tabs[0].id,{type:'LEUMI_OPEN_CHEQUE',branch:m.branch,accountNumber:m.accountNumber,date:m.date,amount:m.amount});if(!r?.ok)throw Error(r?.error||'צילום השיק לא נמצא');return{ok:true}}

// ⚠ tabs[0] בחר לשונית שרירותית — לעיתים ישנה, מנותקת או בחלון אחר. המשתמש ראה
// "לא קורה כלום" בזמן שהתוסף דפדף בלשונית אחרת. סדר העדיפות: הלשונית הפעילה עכשיו,
// אחר כך פעילה בחלון כלשהו, ורק אז האחרונה שנצפתה.
// ⚠ נסיגה שתוקנה 18.08.2026: עד 0.75.0 מסך הכניסה של דיסקונט היה על
// discountbank.co.il, מארח אחר, ולכן לא נתפס כאן. משהעברתי את הכניסה ל-
// start.telebank.co.il, **חלונית ההתחברות עצמה נראתה כמו סשן מחובר** —
// דיסקונט עסקי „מצא חיבור", לא פתח חלון, וניסה לזהות חשבונות על דף הכניסה.
// **לשונית על /login/ אינה סשן.**
// ⚠⚠ 31.08.2026 - טל: "דיסקונט עסקי לא פותח לבנק". **השורש: הפונקציה
// הזאת תפסה גם את הלשונית של דיסקונט הפרטי.** היא מחפשת את כל
// start.telebank.co.il, ולכן מיד אחרי סנכרון פרטי היא מצאה את הלשונית
// שלו, `if(tab)` היה אמת, **חלון ההתחברות העסקי לא נפתח מעולם**,
// והזיהוי העסקי רץ על סשן פרטי.
// נמדד: פרטי יושב תחת `apollo/retail3`, עסקי תחת `apollo/business2`.
// ⚠ **מוציאים את הפרטי ולא מצמצמים ל-business2**: אחרי התחברות יש רגע
// שבו הלשונית העסקית עדיין לא הגיעה ל-business2, וצמצום היה מפספס אותה.
const isPrivateDiscountUrl=u=>/\/apollo\/retail3\//.test(String(u||''));
async function discountTab(){const all=await chrome.tabs.query({url:['https://start.telebank.co.il/*']});
const tabs=all.filter(t=>!/\/login\//.test(t.url||'')&&!isPrivateDiscountUrl(t.url));
if(!tabs.length)return null;
const [active]=await chrome.tabs.query({active:true,currentWindow:true});
const pick=tabs.find(t=>t.id===active?.id)||tabs.find(t=>t.active)||[...tabs].sort((a,b)=>(b.lastAccessed||0)-(a.lastAccessed||0))[0];
if(tabs.length>1)await chrome.storage.local.set({discountTabNote:`נמצאו ${tabs.length} לשוניות דיסקונט — נבחרה ${pick.id}`});
return pick}
// לקח מלאומי: ניווט של ה-SPA הורג את ה-content script, והזרקה חוזרת אחת אינה מספיקה.
// ⚠ content script שמת באמצע ניווט לא שולח תשובה לעולם, ו-sendMessage ממתין ללא הגבלה.
// בלי המעטפת הזו הסנכרון נראה "רץ" לנצח במקום להיכשל ולדווח.
// ⚠⚠ 25.08.2026 — **ה-service worker מת באמצע, וזה השבית סנכרון שלם.**
// נמדד: אפס כתיבות לאחסון במשך 9.5 דקות בזמן „קורא תנועות", ו**אפילו
// ה-timeout לא ירה** — כי ה-`setTimeout` שלו חי בתוך אותו worker שנהרג.
// ב-MV3 ה-worker נהרג אחרי ~30 שניות **ללא קריאת API**, וכל זמן שהרקע
// רק ממתין ל-`sendMessage` הוא אינו קורא לשום API.
// עד 1.5.2 הקריאה הייתה בקשה אחת ונכנסה בתקציב; **ההליכה של 1.5.2
// חרגה ממנו, וזה מה שחשף את היעדר ה-keepalive.**
// הפתרון: קריאת API זולה כל 20 שניות **כל עוד יש פעולה ארוכה באוויר**.
// ⚠ נספר בעומק ולא בדגל — שתי פעולות ארוכות במקביל, והראשונה שנגמרת
// הייתה מכבה את ה-keepalive של השנייה.
let kaTimer=null,kaDepth=0;
function keepAlive(on){
  if(on){kaDepth++;if(!kaTimer)kaTimer=setInterval(()=>{try{chrome.runtime.getPlatformInfo(()=>{})}catch{}},20000);return}
  kaDepth=Math.max(0,kaDepth-1);
  if(!kaDepth&&kaTimer){clearInterval(kaTimer);kaTimer=null}
}
// WHY 27.08.2026 - "עדיין איטי". התקרה של 7 דקות היא **גג ולא גילוי**:
// כשהניסיון עתיד להיכשל, ממתינים את כל 7 הדקות רק כדי לגלות זאת, וכפול 3
// ניסיונות זה 21 דקות. עם פעימה אפשר לוותר אחרי 45 שניות של שקט - והתקרה
// נשארת רק כרשת ביטחון אחרונה.
// ⚠ שקט אינו איטיות: כל עוד יש פעימה, ההמתנה נמשכת ללא הגבלת סבבים.
var leumiBeat=null,leumiForceInject=false,leumiStashed=0;
const withHeartbeat=(promise,ms,what,idleMs=45000)=>{keepAlive(true);
  leumiBeat={at:Date.now(),stage:'',rows:0};
  let timer=null;
  const idle=new Promise((_,reject)=>{timer=setInterval(()=>{
    const quiet=Date.now()-(leumiBeat?.at||0);
    if(quiet>idleMs)reject(Error(`${what} הפסיק להגיב — ${Math.round(quiet/1000)} שניות בלי סימן חיים${leumiBeat?.rows?` (נעצר על ${leumiBeat.rows} שורות)`:''}`));
  },2000)});
  return Promise.race([promise,
    new Promise((_,reject)=>setTimeout(()=>reject(Error(`${what} לא השיב תוך ${Math.round(ms/1000)} שניות`)),ms)),
    idle])
    .finally(()=>{clearInterval(timer);keepAlive(false)})};
// ⚠ שגיאת bfcache אינה "אותה שגיאה" לצורך העצירה אחרי שניים: היא תלוית
// תזמון ניווט, וניסיון נוסף אחרי הזרקה מחדש **כן** עשוי להצליח.
const BFCACHE=/back\/forward cache|message channel (is )?closed|Extension context invalidated/i;
const withTimeout=(promise,ms,what)=>{keepAlive(true);
  return Promise.race([promise,new Promise((_,reject)=>setTimeout(()=>reject(Error(`${what} לא השיב תוך ${Math.round(ms/1000)} שניות`)),ms))])
    .finally(()=>keepAlive(false))};
// WHY 28.08.2026 - טל: "דיסקונט פרטי לא עובד".
// השגיאה שנשמרה: "Could not establish connection. Receiving end does not exist."
// ⚠ `prepareDiscountContent` **הצליח** - ואז ההודעה הבאה נכשלה: ה-SPA של
// דיסקונט מרנדר מחדש אחרי שינוי ה-hash, והסקריפט נהרג **בין ההזרקה
// לשליחה**. זה מרוץ, לא היעדר סקריפט, ולכן הפתרון הוא ניסיון חוזר עם
// הזרקה מחדש - ולא הזרקה אחת "חזקה יותר".
// ⚠⚠ והממצא: מתוך שש קריאות ההודעה בזרימת דיסקונט פרטי, **חמש עטופות
// ב-try או ב-withTimeout ואחת הייתה חשופה.** מספיק אחת כדי להפיל הכול.
const NO_RECEIVER=/Could not establish connection|Receiving end does not exist/i;
async function discountSend(tabId,msg,what,tries=3){
  let last='';
  for(let n=1;n<=tries;n++){
    try{return await withTimeout(chrome.tabs.sendMessage(tabId,msg),20000,what)}
    catch(e){last=String(e?.message||e);
      // ⚠ שגיאה שאינה "אין מאזין" אינה מרוץ - ניסיון שני ודי, בלי להתעקש.
      if(!NO_RECEIVER.test(last)&&n>=2)break;
      try{await prepareDiscountContent(tabId)}catch(err){last=String(err?.message||err)}
      await delay(600);}
  }
  throw Error(`${what}: ${last}`);
}
async function prepareDiscountContent(tabId){let last='';for(let attempt=1;attempt<=5;attempt++){
try{const p=await chrome.tabs.sendMessage(tabId,{type:'DISCOUNT_PING'});if(p?.ok)return}catch(e){last=e.message}
try{await chrome.scripting.executeScript({target:{tabId},files:['discount-content.js']})}catch(e){last=e.message}
await delay(attempt===1?500:1500)}
throw Error(`אין חיבור לעמוד דיסקונט אחרי 5 ניסיונות: ${last}`)}
// ⚠⚠ 25.08.2026 — טל: „מסנכרן דיסקונט פרטי והחשבון פתוח
// מהסנכרון הקודם — הוא פותח עוד דף, בניגוד לבנקים האחרים."
// **נמדד, וההשוואה חד-משמעית:**
//   `startDiscountBusiness` → `discountTab()` ואם קיימת — מזהה בה.
//   `startLeumi` · `startYahav` → אותו דפוס.
//   `startDiscountPrivate` → **פתח חלון כניסה ללא תנאי.**
// ⚠ `discountTab()` לא שימש כאן מסיבה טובה: הוא תופס כל
// `start.telebank.co.il/*` — **גם עסקי וגם פרטי** — ועלול לבחור
// את הלשונית הלא נכונה. לכן מסננים ל-`/apollo/retail3/`,
// בדיוק כפי ש-`syncDiscountPrivate` כבר עושה.
async function discountPrivateTab(){
const all=await chrome.tabs.query({url:['https://start.telebank.co.il/apollo/retail3/*']});
const tabs=all.filter(t=>!/\/login\//.test(t.url||''));
if(!tabs.length)return null;
const [active]=await chrome.tabs.query({active:true,currentWindow:true});
return tabs.find(t=>t.id===active?.id)||tabs.find(t=>t.active)||[...tabs].sort((a,b)=>(b.lastAccessed||0)-(a.lastAccessed||0))[0];
}
async function startDiscountPrivate(){
await chrome.storage.local.set({pendingDiscountPrivate:true,pendingDiscountBusiness:false,syncStatus:'דיסקונט פרטי: בודק את החיבור'});
// ⚠ מחזרים לשונית קיימת במקום לפתוח אחת. לא נוסף כאן
// `returnToDashboard` — העסקי משתמש בו, אבל המסלול הפרטי
// מנווט בעצמו ל-`#/MY_ACCOUNT_HOMEPAGE`, **ולא נמדד שהוא נדרש כאן.**
const tab=await discountPrivateTab();
if(tab){await prepareDiscountContent(tab.id);await discoverDiscountPrivate(tab.id);return{ok:true,status:'discovering'}}
await chrome.storage.local.set({syncStatus:'ממתין להתחברות לדיסקונט פרטי'});
await openLoginWindow({url:DISCOUNT_LOGIN_PRIVATE,type:'popup',width:560,height:780,focused:true});
return{ok:true,status:'waiting_login'}}
async function handleDiscountAuthenticated(tabId){const state=await chrome.storage.local.get({pendingDiscountBusiness:false,pendingDiscountPrivate:false});
if(state.pendingDiscountPrivate){await discoverDiscountPrivate(tabId);return}
if(state.pendingDiscountBusiness){await chrome.storage.local.set({syncStatus:'דיסקונט עסקי: מזהה ישויות וחשבונות'});await discoverDiscountBusiness(tabId)}}
async function discoverDiscountPrivate(tabId){try{await chrome.storage.local.set({syncStatus:'דיסקונט פרטי: מזהה את החשבון הפעיל'});await prepareDiscountContent(tabId);const r=await withTimeout(chrome.tabs.sendMessage(tabId,{type:'DISCOUNT_PRIVATE_DISCOVER'}),30000,'זיהוי חשבון פרטי');if(!r?.ok)throw Error(r?.error||'החשבון הפרטי לא זוהה');const state=await chrome.storage.local.get({discoveredAccounts:[]});const others=state.discoveredAccounts.filter(a=>a.source!=='discount-private');const found=(r.accounts||[]).map(a=>({...a,source:'discount-private',sourceLabel:'דיסקונט פרטי',key:`discount-private|${a.key}`,balance:null,at:Date.now()}));if(!found.length)throw Error('לא נמצא מספר חשבון בדף');await chrome.storage.local.set({pendingDiscountPrivate:false,discountPrivateTabId:tabId,discoveredAccounts:[...others,...found],chooserFocus:{source:'discount-private',label:'דיסקונט פרטי',at:Date.now()},syncStatus:`דיסקונט פרטי: נמצא ${found.length} חשבון — בחר ואשר סנכרון`});await chrome.runtime.openOptionsPage()}catch(e){await chrome.storage.local.set({pendingDiscountPrivate:false,syncStatus:`שגיאה בדיסקונט פרטי: ${e.message}`});await chrome.runtime.openOptionsPage()}}
async function syncDiscountPrivate(keys){
const state=await chrome.storage.local.get({discountPrivateTabId:null});let tab=null;if(state.discountPrivateTabId)try{tab=await chrome.tabs.get(state.discountPrivateTabId)}catch{}if(!tab){const tabs=await chrome.tabs.query({url:['https://start.telebank.co.il/apollo/retail3/*']});tab=tabs.find(t=>t.active)||tabs[0]}if(!tab)throw Error('החיבור לדיסקונט פרטי אינו פעיל');
const saved=await chrome.storage.local.get({discoveredAccounts:[],accounts:[]}),names=new Map(saved.discoveredAccounts.filter(a=>a.source==='discount-private').map(a=>[String(a.key).replace(/^discount-private\|/,''),a.owner||a.nickname]));const out=[],now=new Date().toISOString();
for(let i=0;i<keys.length;i++){const key=keys[i];await chrome.storage.local.set({syncStatus:`דיסקונט פרטי: עובר לחשבון ${i+1} מתוך ${keys.length}`});await chrome.tabs.update(tab.id,{url:'https://start.telebank.co.il/apollo/retail3/#/MY_ACCOUNT_HOMEPAGE'});await delay(1600);await discountSend(tab.id,{type:'DISCOUNT_SELECT_PRIVATE_ACCOUNT',key},'בחירת חשבון בדיסקונט פרטי');const wanted=String(key).replace(/\D/g,'').padStart(10,'0');for(let w=0;w<25;w++){await delay(700);await prepareDiscountContent(tab.id);let st=null;try{st=await chrome.tabs.sendMessage(tab.id,{type:'DISCOUNT_STATE'})}catch{}if(`${st?.branch||''}${st?.accountNumber||''}`===wanted)break}
await chrome.storage.local.set({syncStatus:`דיסקונט פרטי: קורא תנועות חשבון ${i+1}`});await chrome.tabs.update(tab.id,{url:'https://start.telebank.co.il/apollo/retail3/#/OSH_LENTRIES_ALTAMIRA'});for(let w=0;w<30;w++){await delay(1000);await prepareDiscountContent(tab.id);let st=null;try{st=await chrome.tabs.sendMessage(tab.id,{type:'DISCOUNT_STATE'})}catch{}if(st?.rows>0)break}
// ⚠ 28.08.2026 - DELTA-AUDIT פער 3: דילוג-היתרה של העסקי, מיושם כאן על מסך
// התנועות (שם יש שורות לסכימה). אותם שומרים: זהות החשבון מול הבורר, יתרה
// וגם סכומי חובה/זכות בטווח המוצג מול השמור; בספק - מסנכרנים. אם המסך
// הפרטי לא מחזיר יתרה/סכומים (טרם נמדד שם) - לא מדלגים וההתנהגות כקודם.
{const savedPriv=(saved.accounts||[]).find(a=>a.id===`discount-private-${key}`);
if(savedPriv&&Array.isArray(savedPriv.transactions)&&savedPriv.transactions.length){
  let live=null,lt=null;
  try{const sb=await withTimeout(chrome.tabs.sendMessage(tab.id,{type:'DISCOUNT_STATE',withBalance:true}),15000,'יתרה');
    const ident=`${sb?.branch||''}${sb?.accountNumber||''}`===wanted;
    live=ident&&sb?sb.balance:null;lt=ident&&sb?sb.totals:null}catch(e){}
  const balSame=live!=null&&Number.isFinite(Number(live))&&Math.abs(Number(live)-Number(savedPriv.balance))<0.005;
  let sumSame=false;
  if(lt&&lt.n&&Number.isFinite(lt.fromMs)&&Number.isFinite(lt.toMs)){
    const toMs2=v=>{const q=String(v||'').match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}(?:\d{2})?)$/);if(!q)return NaN;let y=Number(q[3]);if(y<100)y+=2000;return Date.UTC(y,Number(q[2])-1,Number(q[1]))};
    let d=0,c=0,inR=0;
    for(const t of savedPriv.transactions){const ms=toMs2(t.date);if(!Number.isFinite(ms)||ms<lt.fromMs||ms>lt.toMs)continue;d+=Number(t.debit)||0;c+=Number(t.credit)||0;inR++}
    sumSame=inR>0&&Math.abs(Math.round(d*100)/100-lt.debit)<0.005&&Math.abs(Math.round(c*100)/100-lt.credit)<0.005;
  }
  if(balSame&&sumSame){
    await chrome.storage.local.set({syncStatus:`דיסקונט פרטי: חשבון ${i+1} — היתרה לא השתנתה, מדלג`});
    out.push({...savedPriv,lastSync:now,status:`${savedPriv.status||'מסונכרן'} · היתרה לא השתנתה`});
    continue;
  }
}}
noteSyncTab(tab.id);const r=await withTimeout(chrome.tabs.sendMessage(tab.id,{type:'DISCOUNT_SYNC_SELECTED',keys:[key],private:true}),90000,'קריאת תנועות דיסקונט פרטי');if(!r?.ok||!(r.accounts||[]).length)throw Error(r?.error||`לא נקראו תנועות בחשבון ${key}`);
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
// ⚠⚠ 03.09.2026 - טל: "אין סנכרון במזרחי" (ניסיון 18:48). נמדד ביומן האחסון,
// לפי סדר הכתיבה: "פותח את חלון ההתחברות" -> "קובע את טווח התאריכים" (הסנכרון
// כבר רץ! הלשונית שנפתחה על עמוד הבית עברה לבד ל-/OnlineApp/ כי הסשן היה
// חי, ו-MIZRAHI_AUTHENTICATED הפעיל את runMizrahi) -> בורר הטווח נלחץ בהצלחה ->
// "ממתין להתחברות — נפתח דף ההתחברות" (**הנפילה לאחור כאן ניווטה את אותה
// לשונית לדף ההתחברות באמצע הסנכרון**) -> "פרטי החשבון הפעיל לא זוהו (הלשונית
// עמדה על …/login/…)". הניסיון השני, דקה אחר כך, הצליח (49 תנועות).
// לכן: לשונית שכבר הגיעה ל-mto.mizrahi-tefahot.co.il אינה נוגעים בה - לא
// לוחצים בה ולא מנווטים אותה. הסנכרון כבר בדרך.
async function mizrahiPortalTab(tabId){try{return /mto\.mizrahi-tefahot\.co\.il/.test((await chrome.tabs.get(tabId)).url||'')}catch{return false}}
async function openMizrahiLogin(tabId){
  for(let attempt=0;attempt<6;attempt++){
    if(await mizrahiPortalTab(tabId))return true;
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
  // ⚠ אבל לא על לשונית שכבר מחוברת או שסנכרון רץ עליה - זה מה שהפיל את 18:48.
  if(mizrahiBusy||await mizrahiPortalTab(tabId))return true;
  await chrome.tabs.update(tabId,{url:MIZRAHI_LOGIN});
  return false;
}
let mizrahiBusy=false;
// ⚠ 03.09.2026 - נמדד ב-mizrahiRangeProbe: דף התנועות יושב היום על
// mto.mizrahi-tefahot.co.il/ngOnline/index.html#/main/uis/osh/p428New/ (הכתובת
// הישנה /OnlineApp/osh/legacy/… מפנה לשם). לשונית מחוברת שעומדת על /ngOnline/
// לא נמצאה, ו-startMizrahi פתח לשונית חדשה במקום להשתמש בה.
async function mizrahiTab(){const tabs=await chrome.tabs.query({url:['https://mto.mizrahi-tefahot.co.il/OnlineApp/*','https://mto.mizrahi-tefahot.co.il/ngOnline/*']});return tabs.find(t=>/\/(OnlineApp|ngOnline)\//.test(t.url||''))||null}
async function prepareMizrahi(tabId){await delay(900);try{await chrome.scripting.executeScript({target:{tabId,allFrames:true},files:['mizrahi-content.js']})}catch{try{await chrome.scripting.executeScript({target:{tabId},files:['mizrahi-content.js']})}catch{}}await delay(500)}
/* ⚠⚠ 25.08.2026 — טל: „יש חשבון אחד וצריך לוודא שבורר התאריך עובד."
   **הכשל שנמדד:** הפונקציה לחצה תמיד „3 חודשים אחרונים" ולא קראה
   `collectSince` כלל. זו אותה תלונה בדיוק שהייתה ביהב ובדיסקונט פרטי.
   ⚠ **ותיקון להסקה מוקדמת שלי:** אמרתי ש„הטווח אינו נקבע כלל" כי
   `MIZRAHI_SET_RANGE` אין לו שולח. **הטווח כן נקבע** — דרך
   `executeScript` כאן, לא דרך ההודעה. המאזין בקובץ התוכן אכן מת,
   אבל המסקנה שלי הייתה שגויה. `MIZRAHI_SET_RANGE` הוא קוד מת בלבד.
   ⚠ **בוחרים את האפשרות הקטנה ביותר שעדיין מכסה** את גבול האיסוף,
   כדי לא למשוך שנתיים כשצריך חודשיים.
   ⚠ **נשמר פרוב `mizrahiRangeProbe` עם כל האפשרויות שנמצאו בדף** —
   כי לא מדדתי את ה-DOM של מזרחי, וניחוש סלקטור עולה סבב שלם.
   אם לא נמצאה אף אפשרות — **הנפילה לאחור היא בדיוק ההתנהגות הישנה**,
   כלומר במקרה הגרוע לא נשבר דבר. */
async function setMizrahiRange(tabId){
  const wantMs=await collectSinceMs();
  const reads=await chrome.scripting.executeScript({target:{tabId,allFrames:true},func:(wantMs)=>{
    const clean=v=>String(v??'').replace(/\s+/g,' ').trim();
    const monthsOf=t=>{const mm=t.match(/(\d{1,2})\s*חודשים/);if(mm)return Number(mm[1]);
      if(/חודש\s*אחרון/.test(t))return 1;
      if(/שנתיים/.test(t))return 24;
      /* ⚠ נמדד 27.08: „שנתי" תפס את הקישור „ת.ז בנקאית - דו''ח שנתי"
         במסגרת legacy — ולחצנו על דוח שנתי במקום על בורר טווח.
         האפשרויות האמיתיות שנמדדו: „3 חודשים אחרונים" ו„שנה אחורה". */
      if(/(^|[^א-ת])[הבמלו]?שנה([^א-ת]|$)/.test(t))return 12;return null};
    const need=wantMs?Math.max(1,Math.ceil((Date.now()-wantMs)/(30.4375*864e5))):3;
    /* ⚠ עלים בלבד. הלקח מהבורר של דיסקונט: סלקטור שמאחד רמות
       תופס גם את המכל וגם את הכפתור שבתוכו, והתוצאה כפולה. */
    const leafish=el=>!el.querySelector('button,[role="button"],a,option');
    const pick=sel=>{const out=[];
      for(const el of document.querySelectorAll(sel)){
        const t=clean(el.textContent||'');
        if(!t||t.length>40||!leafish(el))continue;
        const m=monthsOf(t);if(m==null)continue;out.push({el,t,m})}
      return out};
    /* ⚠ קודם בדיוק מה שהיה קודם (כפתורים), ורק אם אין — מרחיבים. */
    let cands=pick('button,[role="button"]');
    if(!cands.length)cands=pick('a,li,option,label,[role="tab"],[role="option"]');
    const seen=new Set(),list=[];
    for(const c of cands){if(seen.has(c.t))continue;seen.add(c.t);list.push(c)}
    const covering=list.filter(c=>c.m>=need).sort((a,b)=>a.m-b.m);
    const chosen=covering[0]||list.slice().sort((a,b)=>b.m-a.m)[0]||null;
    if(chosen)chosen.el.click();
    return{clicked:!!chosen,months:chosen?chosen.m:null,need,
      covered:!!covering.length,options:list.map(c=>c.t).slice(0,25),
      href:String(location.href).slice(0,120)};
  },args:[wantMs]});
  const hits=reads.map(r=>r?.result).filter(r=>r&&r.options&&r.options.length);
  const best=hits.find(r=>r.clicked)||hits[0]||null;
  try{await chrome.storage.local.set({mizrahiRangeProbe:{at:new Date().toISOString(),
    collectSince:wantMs?new Date(wantMs).toISOString().slice(0,10):'',
    frames:reads.length,result:best,all:hits.slice(0,4)}})}catch{}
  return best}
// ⚠ 04.09.2026 - טל: "במזרחי בכל התנועות מסוג העברה בנקאית (או העברה אינטרנט)
// כשלוחצים על התנועה יש פירוט לאן עבר - ליד כל תנועה לתת את שם התנועה ולא רק
// העברה." ה-DOM של הפירוט **לא נמדד** (הסשן במזרחי פג - הדף תקוע על "אנא
// המתן", ואין לי דרך להתחבר). לכן שני דברים יחד, בלי לנחש סלקטור:
// 1. לכל שורת "העברה" לוחצים על התא הראשון, ממתינים, ולוקחים את **שורות הטקסט
//    שנוספו לדף** (הפרש innerText של body לפני/אחרי) בתור details. זה תופס
//    הרחבה בתוך הטבלה וגם חלונית. אחר כך סוגרים (כפתור סגור/Escape, או לחיצה
//    חוזרת). ניווט מהדף עוצר את הלולאה; השורות עצמן כבר נאספו לפני הלחיצות.
// 2. גשש mizrahiDetailProbe: עד 3 דוגמאות של הטקסט שנוסף (ספרות ממוסכות),
//    מחלקות האלמנט שנפתח, והאם זו חלונית - כדי לכתוב חילוץ מדויק מהמדידה.
// ⚠ תקציב: עד 60 לחיצות ועד 25 שניות. שאר השורות נשארות בלי פירוט.
// ⚠⚠ 04.09.2026 - נמדד ב-mizrahiDetailProbe אחרי הסנכרון של טל: 3 העברות, 3
// לחיצות, **0 שורות נוספו** - הרשת היא Kendo Grid (`k-master-row ng-scope`),
// ולחיצה על התא הראשון לא פותחת כלום. הפותחן הוא המשולש בצד שמאל
// (`td.k-hierarchy-cell`), והפירוט נפתח כשורת `tr.k-detail-row` מתחת לשורה:
// "בנק: … / חשבון: … / תאריך ביצוע: … / שם מוטב: … / סניף: … / מהות העברה: …"
// (צילום של טל). טל: "מכל הפרטים צריך להופיע רק המוטב" - ולכן details = שם
// המוטב בלבד. וגם "העב.מידית באינטרנט" היא העברה - הזיהוי לפי /העב/.
async function readMizrahiTransactions(tabId){let rows=[],probe=null;try{const results=await chrome.scripting.executeScript({target:{tabId,allFrames:true},func:async()=>{const clean=v=>String(v??'').replace(/[\u200e\u200f\u202a-\u202e]/g,'').replace(/\s+/g,' ').trim();const money=v=>{const m=clean(v).replace(/[−–]/g,'-').match(/-?[\d,]+(?:\.\d{1,2})?/);if(!m)return null;const n=Number(m[0].replace(/,/g,''));return Number.isFinite(n)?n:null};const rows=[],els=[];for(const row of document.querySelectorAll('[role="row"],tr')){const cells=[...row.querySelectorAll('[role="gridcell"],td')].map(x=>({text:clean(x.innerText),label:clean(x.getAttribute('aria-label'))})),dateCell=cells.find(c=>/^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(c.text));if(!dateCell)continue;const actionCell=cells.find(c=>/סוג תנועה/.test(c.label)),amountCell=cells.find(c=>/זכות\s*\/\s*חובה/.test(c.label)),balanceCell=cells.find(c=>/יתרה/.test(c.label));const amount=money(amountCell?.text),balance=money(balanceCell?.text);rows.push({date:dateCell.text,action:actionCell?.text||'',details:'',debit:amount!=null&&amount<0?Math.abs(amount):null,credit:amount!=null&&amount>=0?amount:null,balance});els.push(row)}
  const probe={samples:[],transfers:0,clicked:0,enriched:0,navigated:false,dialogs:0,href:String(location.href).slice(0,100),ms:0};
  const started=Date.now(),wait=ms=>new Promise(r=>setTimeout(r,ms));
  const lines=()=>new Set(String(document.body?.innerText||'').split('\n').map(clean).filter(Boolean));
  const visible=el=>!!el&&el.offsetParent!==null;
  const closeBtn=()=>[...document.querySelectorAll('button,[role="button"],a')].find(b=>visible(b)&&(/^(סגור|סגירה|×|x|✕)$/i.test(clean(b.innerText))||/סגור|close/i.test(b.getAttribute('aria-label')||'')));
  const dialogSel='[role="dialog"],.modal.show,.modal.in,[class*="dialog"],[class*="popup"]';
  const href0=location.href;
  const detailOf=row=>{const n=row.nextElementSibling;return n&&/k-detail-row/.test(String(n.className||''))?n:null};
  // ⚠ 04.09.2026 - נמדד בגשש: "העברה באינטרנט" נפתחת ל"בנק / סניף / חשבון / מהות העברה /
  // תאריך ביצוע / שעת ביצוע / שם מוטב" (כל שדה בשורה), ו"העברת יומן לבנק זר" נפתחת
  // לשורה אחת: "בנק מזוכה : ##-<בנק> סניף מזוכה : … חשבון מזוכה : … אופן העברה : … שעת
  // ביצוע : … סניף מבצע : …" - **בלי שם מוטב**. שם: "לבנק: <בנק>". טל: הנוסח "למוטב: <שם>".
  const LABELS='בנק מזוכה|סניף מזוכה|חשבון מזוכה|אופן העברה|סניף מבצע|מספר חשבון|בנק|חשבון|תאריך ביצוע|תאריך|שעת ביצוע|סניף|מהות העברה|מהות|סכום|אסמכתא|הערות?|פרטים';
  const cut=v=>clean(String(v||'').replace(new RegExp(`\\s+(?:${LABELS})\\s*:.*$`),''));
  // טל (04.09): "איפה שמופיע טל רצבי או סופי רצבי תציין את שם הבנק" - העברה לחשבון עצמי:
  // "למוטב: טל רצבי (בנק יהב לעובדי המדינה)". הבנק מ"בנק: ##-<שם>" (בלי קוד הבנק).
  const bankName=t=>{const m=String(t||'').match(/(?:^|\n|\s)בנק\s*(?:מזוכה)?\s*:\s*(?:\d+\s*-\s*)?([^\n]+)/);return m?cut(m[1]).slice(0,60):''};
  const payee=t=>{const m=String(t||'').match(/(?:שם\s*ה?מוטב|ה?מוטב|לזכות|שם\s*ה?מקבל|ה?מקבל|לטובת)\s*:\s*([^\n]+)/);if(!m)return '';const v=cut(m[1]).slice(0,80);if(!v)return '';const bank=/רצבי/.test(v)?bankName(t):'';return `למוטב: ${v}${bank?` (${bank})`:''}`};
  const bankOf=t=>{const m=String(t||'').match(/בנק\s*מזוכה\s*:\s*(?:\d+\s*-\s*)?([^\n]+)/);if(!m)return '';const v=cut(m[1]).slice(0,60);return v?`לבנק: ${v}`:''};
  const press=el=>{for(const type of['mousedown','mouseup','click'])el.dispatchEvent(new MouseEvent(type,{bubbles:true,cancelable:true,view:window}))};
  // ⚠ נמדד 04.09 (07:40, 2.3.13): נלחץ `td.k-hierarchy-cell` ולא האייקון - querySelector עם
  // רשימת סלקטורים מחזיר את הראשון בסדר המסמך, וה-td קודם לילד שלו. Kendo מאזין על האייקון.
  const iconOf=row=>{const h=row.querySelector('.k-hierarchy-cell');return h?(h.querySelector('a,button,span,i,svg,[class*="icon"],[class*="expand"]')||h):null};
  // מדידת כפילויות (טל, 04.09: 41,000 ו-83,000 מופיעים פעמיים-שלוש בלי יתרה): מאפייני מבנה
  // לכל שורה שנקראה - מחלקה, טבלה, נראות. בלי סכומים.
  probe.rowsMeta=els.slice(0,24).map((row,i)=>{const tbl=row.closest('table,[role="grid"]');return{d:rows[i].date,bal:rows[i].balance!=null,cls:clean(row.className).slice(0,50),tbl:clean(tbl?.id||tbl?.className).slice(0,50),vis:row.offsetParent!==null}});
  probe.hidden=els.filter(r=>r.offsetParent===null).length;probe.total=els.length;
  // ⚠⚠ נמדד 04.09 (07:50, 2.3.14): 4 לחיצות = 43 שניות גם בלי innerText של body - כל פתיחה
  // היא קריאת שרת של ~10 שניות. לכן לא אחת-אחת: **פותחים את כולן בבת אחת**, ממתינים פעם
  // אחת עד שכל שורות הפירוט יציבות (עד 20 שניות), קוראים, ואז סוגרים.
  const targets=[];
  for(let i=0;i<rows.length&&targets.length<60;i++){if(!/העב/.test(rows[i].action))continue;probe.transfers++;const el=iconOf(els[i]);if(!el)continue;if(detailOf(els[i])){targets.push(i);continue}try{press(el);probe.clicked++;targets.push(i)}catch{}await wait(120)}
  const seenText=new Map();
  for(let k=0;k<40;k++){await wait(500);if(location.href!==href0){probe.navigated=true;break}let pending=0;for(const i of targets){const d=detailOf(els[i]),t=d?String(d.innerText||''):'';if(!d||!t||t!==seenText.get(i))pending++;seenText.set(i,t)}if(!pending)break}
  for(const i of targets){const d=detailOf(els[i]),text=d?String(d.innerText||''):'',name=payee(text)||bankOf(text);if(name){rows[i].details=name;probe.enriched++}
    if(probe.samples.length<3)probe.samples.push({action:rows[i].action,detailRow:!!d,lines:text.split('\n').map(clean).filter(Boolean).slice(0,20).map(l=>l.replace(/\d/g,'#').slice(0,140))});
    const el=iconOf(els[i]);if(d&&el)try{press(el)}catch{}}
  probe.ms=Date.now()-started;return{rows,probe}}});
rows=results.flatMap(x=>Array.isArray(x.result?.rows)?x.result.rows:[]);const probes=results.map(x=>x.result?.probe).filter(Boolean);probe=probes.find(p=>p.transfers)||probes[0]||null}catch(e){probe={error:String(e&&e.message)}}
try{await chrome.storage.local.set({mizrahiDetailProbe:{at:new Date().toISOString(),...(probe||{})}})}catch{}
if(!rows.length)rows=mizrahiFrameData.get(tabId)?.transactions||[];return rows}
async function readMizrahiSummary(tabId){const results=await chrome.scripting.executeScript({target:{tabId,allFrames:true},func:()=>{const clean=v=>String(v??'').replace(/[\u200e\u200f\u202a-\u202e]/g,'').replace(/\s+/g,' ').trim();const money=v=>{const m=clean(v).replace(/[−–]/g,'-').match(/-?[\d,]+(?:\.\d{1,2})?/);if(!m)return null;const n=Number(m[0].replace(/,/g,''));return Number.isFinite(n)?n:null};const buttons=[...document.querySelectorAll('button')].map(x=>clean(x.innerText)),hit=buttons.find(t=>/\b\d{3}\s*-\s*\d{5,9}\b/.test(t));if(!hit)return null;const m=hit.match(/\b(\d{3})\s*-\s*(\d{5,9})\b/);if(!m)return null;const text=clean(document.body?.innerText),owner=hit.replace(m[0],'').trim()||'חשבון מזרחי',balance=money((text.match(/יתרת עו["״']ש\s*([\d,.-]+)\s*₪/)||[])[1]),creditLimit=money((text.match(/מסגרת אשראי בחשבון\s*([\d,.-]+)\s*₪/)||[])[1]);return{branch:m[1],accountNumber:m[2],owner,nickname:owner,balance,creditLimit}}});return results.map(x=>x.result).find(Boolean)||null}
async function startMizrahi(){if(mizrahiBusy)return{ok:false,error:'סנכרון מזרחי־טפחות כבר מתבצע'};await chrome.storage.local.set({pendingMizrahi:true,syncStatus:'מזרחי־טפחות: בודק את החיבור ומזהה חשבונות'});const tab=await mizrahiTab();if(!tab){await chrome.storage.local.set({syncStatus:'מזרחי־טפחות: פותח את חלון ההתחברות'});const opened=await chrome.tabs.create({url:MIZRAHI_HOME,active:true});if(Number.isInteger(opened?.id))await markOpened(opened.id);try{await waitTab(opened.id,'mizrahi-tefahot.co.il')}catch{}const shown=await openMizrahiLogin(opened.id);await chrome.storage.local.set({syncStatus:shown?'ממתין להתחברות למזרחי־טפחות — הזן משתמש וסיסמה בחלונית שנפתחה':'ממתין להתחברות למזרחי־טפחות — נפתח דף ההתחברות'});return{ok:true,status:'waiting_login'}}await returnToDashboard(tab.id,true);runMizrahi(tab.id).catch(async e=>{await chrome.storage.local.set({pendingMizrahi:false,syncStatus:`שגיאה במזרחי־טפחות: ${e.message}`});await chrome.runtime.openOptionsPage()});return{ok:true,status:'syncing'}}
// ⚠ 03.09.2026 - טל: "אין סנכרון במזרחי." נמדד ביומן האחסון: הסטטוס האחרון
// "מזרחי־טפחות: קובע את טווח התאריכים" (18:39:42) ואחריו **שום כתיבה** - לא
// mizrahiRangeProbe ולא שגיאה. הקורא (MIZRAHI_AUTHENTICATED) עשה
// bgRun(t).catch(()=>{}) - כל שגיאה נבלעה בשקט, והסטטוס קפא. עכשיו השגיאה
// נכתבת עם הכתובת שבה הלשונית עמדה, כדי שהפעם הבאה תאמר מה קרה.
async function runMizrahi(tabId){if(mizrahiBusy)return;mizrahiBusy=true;try{await prepareMizrahi(tabId);const detected=await readMizrahiSummary(tabId);if(!detected)throw Error('לא זוהה חשבון פעיל בעמוד מזרחי');const found=[{...detected,key:`mizrahi|${detected.branch}-${detected.accountNumber}`,source:'mizrahi',sourceLabel:'מזרחי־טפחות',balance:null}];const result=await syncMizrahiSelected([`${detected.branch}-${detected.accountNumber}`],tabId);// ⚠ בתוך המנעול (AUDIT סעיף 2): חלון קרא-שנה-כתוב קצר, מסודר בתור.
await accountsMutex(async()=>{
const state=await chrome.storage.local.get({accounts:[],selectedAccountKeys:[]});const accounts=[...state.accounts.filter(a=>a.source!=='mizrahi'),...markNewTransactions(state.accounts,result.map(a=>keepAssignedCards(state.accounts,a)),['mizrahi'])],selectedAccountKeys=[...new Set([...state.selectedAccountKeys.filter(k=>!String(k).startsWith('mizrahi|')),result[0].selectionKey])];await chrome.storage.local.set({accounts,
  // ⚠ מוחק רק את מזרחי. הוחל לפי דפוס; לא נמדדה תקלה כאן.
  discoveredAccounts:(await chrome.storage.local.get({discoveredAccounts:[]})).discoveredAccounts.filter(a=>a&&a.source!=='mizrahi'),
  selectedAccountKeys,pendingMizrahi:false,syncStatus:(()=>{
    // "אין נתונים חדשים" גם במסלול הישיר - השוואת מפתחות מול השמור (DELTA-AUDIT פער 7).
    const prevMiz=state.accounts.find(a=>a.source==='mizrahi'&&a.id===result[0].id);
    const k=t=>`${t.date}|${t.reference||''}|${t.debit??''}|${t.credit??''}|${t.action||t.details||''}`;
    const prevSet=new Set(((prevMiz&&prevMiz.transactions)||[]).map(k));
    const mizNew=(result[0].transactions||[]).filter(t=>!prevSet.has(k(t))).length;
    return`מזרחי־טפחות: סונכרן בהצלחה — ${mizNew?`${mizNew} תנועות חדשות`:'אין נתונים חדשים'} · ${result[0].transactions.length} תנועות · ${result[0].loans.length} הלוואות`})()});});await closeSyncTabs();if(!autoBusy)await chrome.runtime.openOptionsPage()}
  catch(e){let where='';try{where=String((await chrome.tabs.get(tabId)).url||'').slice(0,100)}catch{where='הלשונית נסגרה'}
    const text=`שגיאה במזרחי־טפחות: ${e.message} (הלשונית עמדה על ${where})`;
    await chrome.storage.local.set({syncStatus:text,lastSyncError:{at:new Date().toISOString(),text:text.slice(0,300)}});if(!autoBusy)try{await chrome.runtime.openOptionsPage()}catch{}throw e}
  finally{mizrahiBusy=false;await restoreSyncTabs()}}
async function syncMizrahiSelected(keys,knownTabId=null){const tab=knownTabId?await chrome.tabs.get(knownTabId):await mizrahiTab();if(tab)noteSyncTab(tab.id);if(!tab)throw Error('החיבור למזרחי־טפחות אינו פעיל');if(keys.length!==1)throw Error('בחיבור מזרחי הנוכחי ניתן לסנכרן חשבון פעיל אחד בכל פעם');await chrome.storage.local.set({syncStatus:'מזרחי־טפחות: קובע את טווח התאריכים'});if(!tab.url?.includes('root-main-osh-p428New')){await chrome.tabs.update(tab.id,{url:MIZRAHI_TX});try{await waitTab(tab.id,'root-main-osh-p428New')}catch(e){let now='';try{now=String((await chrome.tabs.get(tab.id)).url||'').slice(0,100)}catch{}throw Error(`דף התנועות של מזרחי לא נטען תוך 30 שניות (הדף שהגיע: ${now||'לא ידוע'})`)}}await prepareMizrahi(tab.id);await delay(1200);await setMizrahiRange(tab.id);await delay(4200);const account=await readMizrahiSummary(tab.id),transactions=await readMizrahiTransactions(tab.id);if(!account)throw Error('פרטי החשבון הפעיל לא זוהו בעמוד מזרחי');if(`${account.branch}-${account.accountNumber}`!==keys[0])throw Error(`החשבון הפעיל הוא ${account.branch}-${account.accountNumber}, ולא החשבון שנבחר`);if(!transactions.length)throw Error('לא נקראו תנועות ישירות מטבלת שלושת החודשים — הסנכרון נעצר ולא נשמרו נתונים חלקיים');let loans=[];await chrome.storage.local.set({syncStatus:`מזרחי־טפחות: נקראו ${transactions.length} תנועות; קורא הלוואות`});try{await chrome.tabs.update(tab.id,{url:MIZRAHI_LOANS});await waitTab(tab.id,'legacy-Loan-P060');await prepareMizrahi(tab.id);await delay(2200);const lr=await chrome.tabs.sendMessage(tab.id,{type:'MIZRAHI_LOANS'});if(lr?.ok)loans=lr.loans||[]}catch{}const now=new Date().toISOString(),availableCredit=account.balance==null||account.creditLimit==null?null:account.balance+account.creditLimit;return[{...account,availableCredit,transactions,loans,source:'mizrahi',sourceLabel:'מזרחי־טפחות',selectionKey:`mizrahi|${account.branch}-${account.accountNumber}`,id:`mizrahi-${account.branch}-${account.accountNumber}`,lastSync:now,status:loans.length?'מסונכרן':'מסונכרן ללא פירוט הלוואות'}]}

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
async function startIsracard(){await chrome.storage.local.set({pendingIsracard:true,pendingIsracardAt:Date.now()});const tab=await isracardTab();if(!tab){await chrome.storage.local.set({syncStatus:'ממתין להתחברות לישראכרט — חיבור 1'});await openLoginWindow({url:ISRACARD_HOME,type:'popup',width:560,height:780,focused:true});return{ok:true,status:'waiting_login'}}await returnToDashboard(tab.id,true);await chrome.tabs.update(tab.id,{url:ISRACARD_HOME});await delay(1800);
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
async function runIsracard(tabId,attempts=40){beginCardRun();noteSyncTab(tabId);await chrome.storage.local.set({syncStatus:'ישראכרט: קורא את רשימת הכרטיסים'});let summary=null;for(let attempt=0;attempt<attempts;attempt++){await prepareIsracard(tabId);try{summary=await chrome.tabs.sendMessage(tabId,{type:'ISRACARD_SUMMARY'})}catch{}if(summary?.cards?.length)break;await delay(750)}if(!summary?.ok||!summary.cards?.length){await saveIsracardMiss(tabId);throw Error('רשימת הכרטיסים לא נטענה לאחר המתנה');}const active=summary.cards.filter(c=>!c.cancelled),details=[];
  // הגלגל מציג את ארבע הספרות של הכרטיס הנקרא כרגע, לבקשת טל.
const chargeMonthRaw=mmYYYY(new Date()),chargeMonthLabel=`${chargeMonthRaw.slice(0,2)}/${chargeMonthRaw.slice(2)}`;
// דלתא (28.08.2026): שורות החודש הקודם שכבר במסד - מפתח לדילוג על דף לכרטיס;
// ותמונת החודש הנוכחי שלפני הכתיבה - הבסיס ל"אין נתונים חדשים" בסיום.
const beforeCurrent=new Map();
try{for(const r of await cardHistGetMonth(chargeMonthRaw))beforeCurrent.set(String(r.suffix),(r.transactions||[]).length)}catch(e){}
let prevSkipped=0;const freshPrev=[];
await beginProgress(active.length);
for(let i=0;i<active.length;i++){const card=active[i];await syncStep(`ישראכרט: קורא כרטיס ${i+1} מתוך ${active.length} · ${card.suffix}`,`כרטיס ${card.suffix} · ${chargeMonthLabel}`);await chrome.tabs.update(tabId,{url:`https://web.isracard.co.il/transactions?cardSuffix=${encodeURIComponent(card.suffix)}`});await waitIsracardReady(tabId,card.suffix);let read={ok:true,transactions:[]};try{read=await chrome.tabs.sendMessage(tabId,{type:'ISRACARD_TRANSACTIONS_V3'})}catch{}
// ⚠⚠ 28.08.2026 - **נמדד חי ע"י טל, שתי איטרציות**: monthAndYear של ישראכרט
// הוא **חודש החיוב** - דף 07 הראה את חיוב 10/7, לא את 10/8. לכן דף החיוב
// הקודם האמיתי (10/8) הוא monthAndYear=החודש הנוכחי. ניסיון קודם לקרוא את
// "חודש העסקאות הקודם" (07) החזיר חיוב ישן מדי - תוקן כאן לפי המדידה.
// ⚠ המסד לעומת זאת שומר לפי **חודש העסקאות** (נמדד 1.57.1: שורות 08 עם
// chargeDate 10.9) - לכן דף חיוב 08 (עסקאות יולי) נשמר תחת 07, ובדילוג
// מחפשים את 07 במסד. שני לוחות שנה שונים - אסור לערבב את המפתחות.
// דלתא: חיוב קודם שכבר נחת אינו משתנה - אם עסקאות החודש הקודם שמורות עם
// סכום, הדף לא נפתח והסכום נלקח מהמסד. הדף הנוכחי (חיוב קרוב) נקרא תמיד.
// ⚠⚠ 03.09.2026 - נמדד באחסון של טל: ב-03/09 הקוד קרא את דף 09 (חיוב 10/09)
// כ"חיוב קודם" - חיוב **שעוד לא נחת בבנק**, ולכן מסלול 4 לא מצא כלום ושום
// כרטיס לא שויך (9238: 3,150.30 של 10/09 מול 2,585.28 של 10/08 בדיסקונט).
// החיוב שכבר נחת הוא של החודש הקודם כל עוד היום בחודש קטן מיום החיוב של
// הכרטיס ('10.9' -> 10). מיום החיוב ואילך - החודש הנוכחי, כמו קודם.
const chargeDay=Number((String(card.chargeDate||'').match(/^\s*(\d{1,2})/)||[])[1]||10);
const landed=new Date();landed.setDate(1);if(new Date().getDate()<chargeDay)landed.setMonth(landed.getMonth()-1);
const chargePageKey=`${String(landed.getMonth()+1).padStart(2,'0')}.${landed.getFullYear()}`;
const prevTxDate=new Date(landed);prevTxDate.setMonth(prevTxDate.getMonth()-1);
const prevTxKey=`${String(prevTxDate.getMonth()+1).padStart(2,'0')}.${prevTxDate.getFullYear()}`;
let storedPrev=null;try{storedPrev=(await cardHistGetMonth(prevTxKey.replace(/\D/g,''))).find(r=>String(r.suffix)===String(card.suffix)&&Number(r.amount)>0)||null}catch(e){}
let previousCharge=0;
if(storedPrev){previousCharge=Number(storedPrev.amount)||0;prevSkipped++}
else{
  await chrome.tabs.update(tabId,{url:`https://web.isracard.co.il/transactions?monthAndYear=${chargePageKey}&cardSuffix=${encodeURIComponent(card.suffix)}`});await delay(1400);await prepareIsracard(tabId);await chrome.tabs.sendMessage(tabId,{type:'ISRACARD_SELECT_MONTH_V3',month:chargePageKey});await waitIsracardReady(tabId,card.suffix,chargePageKey);
  let previousRead={total:0};try{previousRead=await chrome.tabs.sendMessage(tabId,{type:'ISRACARD_TRANSACTIONS_V3'})}catch{}
  previousCharge=Number(previousRead?.total)||0;
  if(previousCharge>0)freshPrev.push({...card,amount:previousCharge,transactions:previousRead?.transactions||[],month:prevTxKey});
}
details.push({...card,transactions:read?.transactions||[],previousCharge,previousChargeMonth:chargePageKey})}
await endProgress();
// חודשים קודמים שנקראו טרי נשמרים להיסטוריה - הם שיזינו את הדילוג בפעם הבאה.
if(freshPrev.length)try{for(const m of new Set(freshPrev.map(c=>c.month)))await storeCardMonth(m,freshPrev.filter(c=>c.month===m))}catch(e){}
// ⚠ בתוך המנעול (AUDIT סעיף 2): חלון קרא-שנה-כתוב קצר, מסודר בתור.
return await accountsMutex(async()=>{
const state=await chrome.storage.local.get({accounts:[],isracardAssignments:{}}),accounts=state.accounts.map(a=>({...a,cards:[...(a.cards||[])]})),assigned=[],unassigned=[];
const normalized=v=>String(v||'').replace(/\D/g,'');
for(const card of details){const target=accountForCard(accounts,card,state.isracardAssignments[card.suffix]);
if(!target){unassigned.push(card);continue}const index=target.cards.findIndex(c=>normalized(c.suffix).endsWith(card.suffix));if(index>=0){const old=target.cards[index];target.cards[index]={...old,...card,transactions:old.transactions?.length?old.transactions:card.transactions}}else target.cards.push(card);assigned.push({suffix:card.suffix,accountId:target.id})}
const now=new Date().toISOString();// כל סנכרון רגיל נשמר גם כחודש בהיסטוריה — כך היא נבנית מעצמה מהיום ואילך.
try{await storeCardMonth(mmYYYY(new Date()),details)}catch(e){}
// "אין נתונים חדשים" נמדד מול תמונת החודש הנוכחי שלפני הכתיבה - לא מנוחש.
const freshCount=details.reduce((s,c)=>s+Math.max(0,(c.transactions||[]).length-(beforeCurrent.get(String(c.suffix))||0)),0);
await chrome.storage.local.set({accounts,isracardUnassigned:unassigned,isracardLastCards:details,syncStatus:`ישראכרט: סונכרן בהצלחה — ${details.length} כרטיסים${freshCount?` · ${freshCount} עסקאות חדשות`:' · אין נתונים חדשים'}${prevSkipped?` · ${prevSkipped} חודשי חיוב נלקחו מהמסד בלי לפתוח דף`:''} · ${assigned.length} שויכו לחשבונות${unassigned.length?` · ${unassigned.length} ממתינים לשיוך`:''}`,lastAutoSync:now});await closeSyncTabs();if(!autoBusy)await chrome.runtime.openOptionsPage();return{cards:details.length,assigned:assigned.length,unassigned:unassigned.length}});}
const CAL_HOME='https://digital-web.cal-online.co.il/dashboard',CAL_TX='https://digital-web.cal-online.co.il/transactions-all';
let calBusy=false;
// ⚠ כתובת הכניסה של כאל יושבת על digital-web — בדיוק המארח שמועדף כאן כסשן.
// בלי הסינון חלונית ההתחברות הייתה נבחרת כחיבור פעיל (תקלת דיסקונט, 0.75.1).
async function calTab(){const all=await chrome.tabs.query({url:['https://digital-web.cal-online.co.il/*','https://www.cal-online.co.il/*']});
const tabs=all.filter(t=>!/\/login\b/i.test(String(t.url||'')));
return tabs.find(t=>String(t.url||'').includes('digital-web.cal-online.co.il'))||tabs[0]||null}
async function prepareCal(tabId){await delay(600);try{const p=await chrome.tabs.sendMessage(tabId,{type:'CAL_PING'});if(p?.ok)return}catch{}await chrome.scripting.executeScript({target:{tabId},files:['cal-content.js']});await delay(300)}
async function startCal(suffix=''){suffix=String(suffix||'').replace(/\D/g,'').slice(-4);await chrome.storage.local.set({pendingCal:true,pendingCalSuffix:suffix,syncStatus:suffix?`כאל: מכין טעינת שנה לכרטיס ${suffix}`:'כאל: בודק את החיבור'});const tab=await calTab();if(!tab||!String(tab.url||'').includes('digital-web.cal-online.co.il')){await chrome.storage.local.set({syncStatus:suffix?`ממתין להתחברות לכאל עבור כרטיס ${suffix}`:'ממתין להתחברות לכאל'});if(tab)await chrome.tabs.update(tab.id,{url:'https://www.cal-online.co.il/',active:true});else await openLoginWindow({url:CAL_LOGIN,type:'popup',width:560,height:780,focused:true});return{ok:true,status:'waiting_login'}}await returnToDashboard(tab.id,true);runCal(tab.id,suffix).catch(async e=>{await chrome.storage.local.set({pendingCal:false,pendingCalSuffix:'',syncStatus:`שגיאה בכאל: ${e.message}`});if(!autoBusy)await chrome.runtime.openOptionsPage()});return{ok:true,status:'syncing'}}
async function runCal(tabId,requestedSuffix=''){beginCardRun();noteSyncTab(tabId);
  if(calBusy)return;calBusy=true;
  try{
    await chrome.storage.local.set({syncStatus:'כאל: קורא חיוב קרוב וחשבון חיוב'});let current=await chrome.tabs.get(tabId);if(!String(current.url||'').includes('digital-web.cal-online.co.il'))throw Error('החיבור לכאל אינו פעיל — יש להתחבר מחדש');await prepareCal(tabId);if(!String(current.url||'').includes('/dashboard')){const go=await chrome.tabs.sendMessage(tabId,{type:'CAL_GO_HOME'});
    if(!go?.ok){
      // ⚠ 28.08.2026 - "לא נמצא קישור דף הבית בכאל": הלשונית ישבה על עמוד
      // ביניים (סשן שפג?) בלי הקישור. נמדד 28.08: בדף ההתחברות אין "דף הבית".
      // במקום להיכשל - ניווט ישיר לדשבורד; אם כאל מפנה להתחברות, נרשם
      // "ממתין להתחברות" והלשונית מוקפצת. אחרי הכניסה CAL_AUTHENTICATED
      // (נורה כל 5 שניות) ימשיך את הסנכרון לבד - pendingCal נשאר דלוק.
      await chrome.tabs.update(tabId,{url:'https://digital-web.cal-online.co.il/dashboard'});
      const goStart=Date.now();let landedLogin=false;
      while(Date.now()-goStart<30000){const t=await chrome.tabs.get(tabId);
        if(t.status==='complete'&&/\/login/.test(String(t.url||''))){landedLogin=true;break}
        if(t.status==='complete'&&String(t.url||'').includes('/dashboard'))break;
        await delay(250)}
      if(landedLogin){await chrome.storage.local.set({syncStatus:'ממתין להתחברות לכאל'});
        try{const t=await chrome.tabs.get(tabId);await chrome.windows.update(t.windowId,{focused:true});await chrome.tabs.update(tabId,{active:true})}catch{}
        return}
    }
    await waitTab(tabId,'/dashboard');await prepareCal(tabId)}await delay(1200);
    const hr=await chrome.tabs.sendMessage(tabId,{type:'CAL_HOME'});if(!hr?.ok)throw Error('דף הבית של כאל לא נקרא');const home=hr.data||{};
    await chrome.storage.local.set({syncStatus:'כאל: פותח עסקאות לפי מועד חיוב'});const opened=await chrome.tabs.sendMessage(tabId,{type:'CAL_OPEN_MONTHLY'});
    if(!opened?.ok){
      // ⚠ 28.08.2026 - התפריט לא נמצא (הגשש בצד התוכן כבר תיעד את הדף).
      // נפילה לניווט ישיר - ההמתנה ל-/transactions שמיד אחרי בודקת ממילא
      // אם המסך אכן נפתח, והיא זו שתכשיל עם הודעה ברורה אם לא.
      await chrome.tabs.update(tabId,{url:'https://digital-web.cal-online.co.il/transactions'});
    }for(let w=0;w<30;w++){current=await chrome.tabs.get(tabId);if(new URL(current.url).pathname==='/transactions')break;await delay(300)}current=await chrome.tabs.get(tabId);if(new URL(current.url).pathname!=='/transactions')throw Error('דף העסקאות החודשי של כאל לא נפתח');await prepareCal(tabId);await delay(1800);
    const wanted=String(requestedSuffix||'').replace(/\D/g,'').slice(-4),monthly=[],seenMonths=new Set();let previous='';
    // ⚠ 28.08.2026 - סנכרון מצטבר (טל: "רצינו רק את חודש החיוב הקרוב והקודם").
    // הניווט בכאל הוא עמוד-אחרי-עמוד, ולכן במקום לדלג - עוצרים: אחרי שהחודש
    // הנוכחי והקודם נקראו טרי, אם החודש הישן הבא כבר שמור עם עסקאות -
    // ההיסטוריה שמשם והלאה כבר בידינו. חור עמוק יותר יושלם רק אחרי מחיקתו.
    const calPrevMonth=k=>{const m=Number(String(k).slice(0,2)),y=Number(String(k).slice(2));return m===1?`12${y-1}`:`${String(m-1).padStart(2,'0')}${y}`};
    const storedCalMonths=new Set();
    // תמונת החודש הנוכחי לפני הכתיבה - הבסיס ל"אין נתונים חדשים" בסיום.
    const calNow=mmYYYY(new Date()),beforeCurrentCal=new Map();
    try{for(const r of await cardHistAll()){const norm=String(r.month||'').replace(/\D/g,'');
      if(norm.length!==6||!/כאל|cal/i.test(String(r.issuer||'')))continue;
      if(norm===calNow)beforeCurrentCal.set(String(r.suffix),(r.transactions||[]).length);
      if((r.transactions||[]).length&&(!wanted||String(r.suffix)===wanted))storedCalMonths.add(norm)}}catch(e){}
    let calEmptyStreak=0;
    for(let i=0;i<12;i++){let page=null,candidate='',stable=0;for(let wait=0;wait<25;wait++){await prepareCal(tabId);try{page=await chrome.tabs.sendMessage(tabId,{type:'CAL_MONTHLY_READ'})}catch{}const ready=page?.ok&&page.month&&!seenMonths.has(page.month)&&page.fingerprint!==previous;if(ready&&page.fingerprint===candidate)stable++;else{candidate=ready?page.fingerprint:'';stable=ready?1:0}if(stable>=3)break;await delay(400)}if(!page?.ok||!page.month||seenMonths.has(page.month)||stable<3)break;if(wanted&&page.suffix&&page.suffix!==wanted)throw Error(`הכרטיס הפעיל בכאל הוא ${page.suffix}, ולא ${wanted}`);const suffix=wanted||page.suffix||home.suffix;if(!suffix)throw Error('מספר הכרטיס הפעיל לא זוהה בדף החודשי');const card={suffix,name:'כרטיס כאל',issuer:'כאל',amount:page.total,chargeDate:page.chargeDate,transactions:page.transactions||[],debitAccount:home.debitAccount||'',month:page.month};await storeCardMonth(page.month,[card]);monthly.push(card);seenMonths.add(page.month);previous=page.fingerprint;await chrome.storage.local.set({syncStatus:`כאל: נשמר חודש ${i+1} מתוך 12 · ${page.month} · ${card.transactions.length} תנועות`});
      // ⚠ חודש ריק אינו מפיל, אבל שניים ברצף אומרים שהכרטיס עוד לא היה קיים.
      if(card.transactions.length)  {calEmptyStreak=0;await noteCardActiveSince(suffix,page.month)}
      else if(++calEmptyStreak>=EMPTY_MONTHS_STOP){
        await chrome.storage.local.set({syncStatus:`כאל: הכרטיס ${suffix} אינו פעיל לפני ${page.month} — נעצר אחרי ${i+1} חודשים במקום 12`});
        break;
      }
      if(i>=1&&storedCalMonths.has(calPrevMonth(page.month))){
        await chrome.storage.local.set({syncStatus:`כאל: ${page.month} נשמר; ההיסטוריה שלפניו כבר שמורה — נעצר אחרי ${i+1} עמודים במקום 12`});
        break;
      }
      if(!page.canPrev||i===11)break;const moved=await chrome.tabs.sendMessage(tabId,{type:'CAL_MONTHLY_PREV'});if(!moved?.ok)break;await delay(1800)}
    // כל החודשים כבר נשמרו בנפרד ב-IndexedDB. בכרטיס החיוב הקרוב מציגים רק
    // את דף החיוב הנוכחי; איחוד כל העסקאות כאן גרם לכל השנה להיראות כחודש אחד.
    if(!monthly.length)throw Error('לא נקראו דפי חיוב חודשיים מכאל');const details=[{...monthly[0],amount:home.amount??monthly[0].amount,chargeDate:home.chargeDate||monthly[0].chargeDate,transactions:monthly[0].transactions||[]}];
    // ⚠ בתוך המנעול (AUDIT סעיף 2): חלון קרא-שנה-כתוב קצר, מסודר בתור.
    return await accountsMutex(async()=>{
    const state=await chrome.storage.local.get({accounts:[]}),accounts=state.accounts.map(a=>({...a,cards:[...(a.cards||[])]})),unassigned=[],digits=v=>String(v||'').replace(/\D/g,'');let assigned=0;
    for(const card of details){let target=accounts.find(a=>(a.cards||[]).some(c=>digits(c.suffix).endsWith(card.suffix)));if(!target&&home.debitAccount){const wanted=digits(home.debitAccount);const matches=accounts.filter(a=>wanted.endsWith(digits(a.accountNumber))||digits(a.accountNumber).endsWith(wanted));if(matches.length===1)target=matches[0]}if(!target){unassigned.push(card);continue}const index=target.cards.findIndex(c=>digits(c.suffix).endsWith(card.suffix));if(index>=0)target.cards[index]={...target.cards[index],...card};else target.cards.push(card);assigned++}
    const now=new Date().toISOString(),savedCal=await chrome.storage.local.get({calLastCards:[],calUnassigned:[]}),merge=(oldRows,newRows)=>{const by=new Map((oldRows||[]).map(c=>[String(c.suffix),c]));for(const c of newRows)by.set(String(c.suffix),c);return[...by.values()]},monthCount=monthly.length;autoLoginRuns.set(`cal|${tabId}`,Date.now());await chrome.storage.local.set({accounts,calLastCards:merge(savedCal.calLastCards,details),calUnassigned:merge(savedCal.calUnassigned,unassigned),pendingCal:false,pendingCalSuffix:'',syncStatus:(()=>{const freshCal=details.reduce((s,c)=>s+Math.max(0,(c.transactions||[]).length-(beforeCurrentCal.get(String(c.suffix))||0)),0);
    return`כאל: סונכרן בהצלחה — ${details.length} כרטיסים${freshCal?` · ${freshCal} עסקאות חדשות`:' · אין נתונים חדשים'} · ${monthCount} דפי חיוב נקראו · ${assigned} שויכו לחשבונות${unassigned.length?` · ${unassigned.length} ממתינים לשיוך`:''}`})(),lastAutoSync:now});await closeSyncTabs();if(!autoBusy)await chrome.runtime.openOptionsPage();return{cards:details.length,months:monthCount,assigned,unassigned:unassigned.length}});
  }finally{calBusy=false;await restoreSyncTabs()}
}
const MAX_TX='https://www.max.co.il/transaction-details/personal';
let maxBusy=false;
// ⚠ אותו שיקול: www.max.co.il/login נמצא בטווח השאילתה, ו-tabs[0] היה בוחר אותו.
async function maxTab(){const all=await chrome.tabs.query({url:['https://www.max.co.il/*','https://online.max.co.il/*']});
const tabs=all.filter(t=>!/\/login\b/i.test(String(t.url||'')));
return tabs.find(t=>String(t.url||'').includes('/transaction-details/personal'))||tabs[0]||null}
async function prepareMax(tabId){await delay(500);try{const p=await chrome.tabs.sendMessage(tabId,{type:'MAX_PING'});if(p?.ok)return}catch{}await chrome.scripting.executeScript({target:{tabId},files:['max-content.js']});await delay(250)}
// ⚠⚠ 03.09.2026 - טל: "מנסה לסנכרן מקס, פתח [חלונית] והתחברתי ולא עושה כלום."
// נמדד ביומן האחסון: "ממתין להתחברות ל‑MAX" + חלונית נפתחה, ואחר כך **שום
// כתיבה** - MAX_AUTHENTICATED לא הגיע מהחלונית. הסנכרון התחיל רק כשלשונית
// אחרת הגיעה ל-/transaction-details (ואז maxUiProbe נכתב, כלומר הסקריפט חי).
// נמדד בדף המחובר: הברכה היא "היי (:" **בלי שם** - הביטוי /היי\s+[^\n(]+\(:/
// דורש שם ולכן עיוור; .combo.dates איננו; והחלונית לא ישבה על transaction-details.
// לכן שער שאינו תלוי ב-DOM: לשונית **שהתוסף פתח** להתחברות, שיצאה מ-/login
// ונשארה על max.co.il - הסנכרון מתחיל, ו-runMax בודק בעצמו אם הסשן אמיתי
// (ניווט ל-transaction-details; לא-מחובר מועף ל-/login - המבחן שנמדד 28.08).
async function noteMaxError(e){await chrome.storage.local.set({pendingMax:false,pendingMaxSuffix:'',syncStatus:`שגיאה ב‑MAX: ${e.message}`,lastSyncError:{at:new Date().toISOString(),text:`שגיאה ב‑MAX: ${e.message}`.slice(0,300)}});if(!autoBusy)try{await chrome.runtime.openOptionsPage()}catch{}}
chrome.tabs.onUpdated.addListener((tabId,info,tab)=>{(async()=>{
  const url=String(info.url||(info.status==='complete'?tab?.url:'')||'');
  if(!/^https:\/\/(www|online)\.max\.co\.il\//.test(url)||/\/login\b/i.test(url))return;
  if(maxBusy||running)return;
  const st=await chrome.storage.local.get({pendingMax:false,pendingMaxSuffix:''});if(!st.pendingMax)return;
  await loadOpened();if(!openedByExtension.has(tabId))return;
  await chrome.storage.local.set({syncStatus:'MAX: זוהתה יציאה מדף ההתחברות — בודק את הסשן'});
  await runMax(tabId,st.pendingMaxSuffix).catch(e=>noteMaxError(e));
})().catch(()=>{})});
async function startMax(suffix=''){suffix=String(suffix||'').replace(/\D/g,'').slice(-4);await chrome.storage.local.set({pendingMax:true,pendingMaxSuffix:suffix,syncStatus:suffix?`MAX: מכין טעינת שנה לכרטיס ${suffix}`:'MAX: בודק את החיבור'});const tab=await maxTab();if(!tab){await chrome.storage.local.set({syncStatus:'ממתין להתחברות ל‑MAX'});await openLoginWindow({url:MAX_LOGIN,type:'popup',width:560,height:780,focused:true});return{ok:true,status:'waiting_login'}}await returnToDashboard(tab.id,true);runMax(tab.id,suffix).catch(async e=>{await chrome.storage.local.set({pendingMax:false,pendingMaxSuffix:'',syncStatus:`שגיאה ב‑MAX: ${e.message}`});if(!autoBusy)await chrome.runtime.openOptionsPage()});return{ok:true,status:'syncing'}}
async function runMax(tabId,requestedSuffix=''){beginCardRun();noteSyncTab(tabId);
 if(maxBusy)return;maxBusy=true;
 try{
  await chrome.storage.local.set({syncStatus:'MAX: פותח פירוט חיובים'});let tab=await chrome.tabs.get(tabId);if(!String(tab.url||'').includes('/transaction-details/personal')){await chrome.tabs.update(tabId,{url:MAX_TX});for(let i=0;i<40;i++){await delay(300);tab=await chrome.tabs.get(tabId);if(String(tab.url||'').includes('/transaction-details/personal'))break}}
  // ⚠ 03.09.2026 - המבחן שנמדד 28.08: לא-מחובר מועף מ-transaction-details ל-/login. אם הגענו לשם - אין סשן, ואומרים זאת במקום ליפול בהמשך על "רשימת הכרטיסים".
  if(/\/login\b/i.test(String(tab.url||'')))throw Error('ההתחברות ל‑MAX לא הושלמה — האתר החזיר לדף ההתחברות. התחבר בחלונית ונסה שוב');
  await delay(1700);await prepareMax(tabId);const he=['ינואר','פברואר','מרץ','אפריל','מאי','יוני','יולי','אוגוסט','ספטמבר','אוקטובר','נובמבר','דצמבר'],wanted=String(requestedSuffix||'').replace(/\D/g,'').slice(-4),monthly=[],seen=new Set();
  const months=Array.from({length:13},(x,i)=>{const d=new Date();d.setDate(1);d.setMonth(d.getMonth()+1-i);return{label:`${he[d.getMonth()]} ${d.getFullYear()}`,key:`${String(d.getMonth()+1).padStart(2,'0')}.${d.getFullYear()}`,optional:i===0}});let firstRead=null;
  // ⚠ 28.08.2026 - טל: "רצינו להוריד רק את חודש החיוב הקרוב והקודם". סנכרון
  // מצטבר: שלושת הראשונים (גישוש החודש הבא, הנוכחי והקודם) נקראים תמיד - הם
  // עדיין משתנים; חודש ישן שכבר שמור עם עסקאות מדולג, וחור בהיסטוריה מושלם.
  // דילוג הוא חודש-עם-נתונים לצורך רצף העצירה. הסיכון המתועד: חודש שנשמר
  // חלקית (כרטיס אחד מתוך שניים) ידולג - מחיקת החודש מההיסטוריה תגרום
  // לסנכרון הבא להשלימו.
  const storedMaxMonths=new Set(),storedWantedMonths=new Set();
  // תמונת החודש הנוכחי לפני הכתיבה - הבסיס ל"אין נתונים חדשים" בסיום.
  const maxCalNow=mmYYYY(new Date()),beforeCurrentMax=new Map();
  try{for(const r of await cardHistAll()){
    const norm=String(r.month||'').replace(/\D/g,'');
    if(norm.length!==6||!/max|מקס/i.test(String(r.issuer||'')))continue;
    if(norm===maxCalNow)beforeCurrentMax.set(String(r.suffix),(r.transactions||[]).length);
    if(!(r.transactions||[]).length)continue;
    const k=`${norm.slice(0,2)}.${norm.slice(2)}`;
    storedMaxMonths.add(k);
    if(wanted&&String(r.suffix)===wanted)storedWantedMonths.add(k);
  }}catch(e){}
  let skippedStored=0;
  let maxEmptyStreak=0;
  for(let i=0;i<months.length;i++){const {label,key,optional}=months[i];
    if(i>=3&&(wanted?storedWantedMonths:storedMaxMonths).has(key)){skippedStored++;maxEmptyStreak=0;continue}
    await chrome.storage.local.set({syncStatus:`MAX: טוען ${key}${optional?' — בודק אם החודש הבא קיים':''}`});const sel=await chrome.tabs.sendMessage(tabId,{type:'MAX_SELECT_MONTH',label});if(!sel?.ok){if(optional)continue;if(!firstRead)throw Error(sel?.error||'בורר החודשים לא נטען');break}let page=null,candidate='',stable=0;for(let w=0;w<30;w++){await delay(350);await prepareMax(tabId);try{page=await chrome.tabs.sendMessage(tabId,{type:'MAX_READ'})}catch{}const ready=page?.ok&&page.month===key&&page.fingerprint;if(ready&&candidate===page.fingerprint)stable++;else{candidate=ready?page.fingerprint:'';stable=ready?1:0}if(stable>=3)break}if(!page?.ok||page.month!==key||stable<3){if(optional)continue;throw Error(`דף ${key} לא התייצב לקריאה`)}if(seen.has(key)){if(optional)continue;throw Error(`MAX נשאר בחודש ${key}`)}seen.add(key);if(!firstRead)firstRead={label,key};const groups=Object.entries(page.cards||{}).filter(([suffix])=>suffix&&suffix!=='unknown'&&(!wanted||suffix===wanted)),cards=groups.map(([suffix,transactions])=>({suffix,name:'כרטיס MAX',issuer:'MAX',amount:transactions.reduce((s,t)=>s+Math.abs(Number(t.amount)||0),0),transactions,month:key}));if(wanted&&!cards.length&&page.transactions?.length)throw Error(`כרטיס ${wanted} לא נמצא בדף ${key}`);if(cards.length){await storeCardMonth(key,cards);monthly.push(...cards)}
    // ⚠ אותה מדיניות כמו בכאל ובישראכרט, ומאותו מקום: שני חודשים ריקים ברצף
    // אומרים שהכרטיס לא היה קיים. ⚠ **חודשים ש„optional" מדלג עליהם אינם
    // נספרים** — הם אינם עדות לכלום.
    if(cards.length&&cards.some(c=>(c.transactions||[]).length)){
      maxEmptyStreak=0;
      for(const c of cards)if((c.transactions||[]).length)await noteCardActiveSince(c.suffix,key);
    }else if(!optional&&++maxEmptyStreak>=EMPTY_MONTHS_STOP){
      await chrome.storage.local.set({syncStatus:`MAX: אין תנועות לפני ${key} — נעצר במקום להמשיך לחודשים שבהם הכרטיס לא היה קיים`});
      break;
    }
  }
  if(!monthly.length)throw Error('לא נקראו עסקאות חודשיות מ‑MAX');const latestBySuffix=new Map();for(const c of monthly)if(!latestBySuffix.has(c.suffix))latestBySuffix.set(c.suffix,c);const nowLabel=firstRead.label,nowKey=firstRead.key;await chrome.storage.local.set({syncStatus:`MAX: החיוב הקרוב — ${nowLabel}`});await chrome.tabs.sendMessage(tabId,{type:'MAX_SELECT_MONTH',label:nowLabel});await delay(1800);await prepareMax(tabId);let currentPage=await chrome.tabs.sendMessage(tabId,{type:'MAX_READ'});if(!currentPage?.ok||currentPage.month!==nowKey)currentPage={ok:true,month:nowKey,total:0,cards:{}};
  // ⚠⚠ 31.08.2026 - טל: "למה בכרטיס הזה אין סיכום?" כרטיס MAX 2910 הציג
  // 0.00 ₪ בכותרת מעל טבלה מלאה של 12 עסקאות. **השורש הוא Number(null)===0:**
  // max-content מחזיר total=null כשהתווית "סה\"כ" לא נמצאת בדף (מקס החליפו
  // ממשק ב-28.08.2026 - ראה ההערה בראש max-content.js), null עבר את
  // Number.isFinite(Number(null)) כאילו היה מספר תקין, וה-0 שלו דרס את סכום
  // העסקאות. אותה מלכודת קיימת ל-'' ול-undefined.
  // שני תיקונים: הסכום מהאתר נבדק לפני ההמרה, ואפס מול עסקאות שסכומן חיובי
  // נדחה - חודש עם תנועות אינו חודש של אפס.
  const details=[...latestBySuffix.keys()].map(suffix=>{
    const base=latestBySuffix.get(suffix),pageTx=currentPage.cards?.[suffix]||[],
    // אם הקריאה החוזרת של חודש החיוב נכשלה - מה שנקרא בלולאה עדיף על ריק.
      transactions=pageTx.length?pageTx:(base.transactions||[]),
      sum=transactions.reduce((x,t)=>x+Math.abs(Number(t.amount)||0),0),
      raw=currentPage.total,site=raw==null||raw===''?NaN:Number(raw),
      onlyCard=latestBySuffix.size===1,
      amount=onlyCard&&Number.isFinite(site)&&(site!==0||!sum)?site:sum;
    return{...base,amount,transactions,month:currentPage.month}});
  // ⚠ 28.08.2026 - חומר למסלול 5 של מנוע השיוך: מקס אינו מוסר חשבון חיוב או
  // previousCharge. במקומם - סכום חודש-הכרטיס האחרון שהושלם, שחיובו כבר נחת
  // בבנק **בחודש שאחריו** (הלקח מ-1.57.1), ודרישת "מקס" בטקסט התנועה.
  {const newer=(a,b)=>{const[p1,p2]=a.split('.'),[q1,q2]=b.split('.');return(Number(p2)*12+Number(p1))-(Number(q2)*12+Number(q1))};
   const nextMonthKey=k=>{const[m1,y1]=k.split('.').map(Number);return m1===12?`01.${y1+1}`:`${String(m1+1).padStart(2,'0')}.${y1}`};
   const prevBySuffix=new Map();
   for(const c of monthly){if(!c.month||c.month===nowKey)continue;
     const cur=prevBySuffix.get(c.suffix);
     if(!cur||newer(c.month,cur.month)>0)prevBySuffix.set(c.suffix,c)}
   for(const d of details){const prev=prevBySuffix.get(d.suffix);
     if(prev&&Number(prev.amount)>0)d.bankChargeProbe={amount:Number(prev.amount),monthKey:nextMonthKey(prev.month),textRe:'מקס|max'}}}
  // ⚠ בתוך המנעול (AUDIT סעיף 2): חלון קרא-שנה-כתוב קצר, מסודר בתור.
  return await accountsMutex(async()=>{
  const state=await chrome.storage.local.get({accounts:[],maxLastCards:[]}),accounts=state.accounts.map(a=>({...a,cards:[...(a.cards||[])]})),unassigned=[];let assigned=0;const digits=v=>String(v||'').replace(/\D/g,'');
  for(const card of details){const target=accounts.find(a=>(a.cards||[]).some(c=>digits(c.suffix).endsWith(card.suffix)));if(!target){unassigned.push(card);continue}const index=target.cards.findIndex(c=>digits(c.suffix).endsWith(card.suffix));if(index>=0)target.cards[index]={...target.cards[index],...card};else target.cards.push(card);assigned++}
  const merge=(oldRows,newRows)=>{const by=new Map((oldRows||[]).map(c=>[String(c.suffix),c]));for(const c of newRows)by.set(String(c.suffix),c);return[...by.values()]};autoLoginRuns.set(`max|${tabId}`,Date.now());await chrome.storage.local.set({accounts,maxLastCards:merge(state.maxLastCards,details),maxUnassigned:unassigned,pendingMax:false,pendingMaxSuffix:'',syncStatus:(()=>{const freshMax=details.reduce((s,c)=>s+Math.max(0,(c.transactions||[]).length-(beforeCurrentMax.get(String(c.suffix))||0)),0);
    return`MAX: סונכרן בהצלחה — ${details.length} כרטיסים${freshMax?` · ${freshMax} עסקאות חדשות`:' · אין נתונים חדשים'} · ${seen.size} דפי חיוב נקראו${skippedStored?` · ${skippedStored} חודשים שמורים דולגו`:''} · ${assigned} שויכו לחשבונות${unassigned.length?` · ${unassigned.length} ממתינים לשיוך`:''}`})(),lastAutoSync:new Date().toISOString()});await closeSyncTabs();if(!autoBusy)await chrome.runtime.openOptionsPage();return{cards:details.length,months:seen.size,assigned,unassigned:unassigned.length}});
 }finally{maxBusy=false;await restoreSyncTabs()}
}
async function startDiscountBusiness(){const saved=await chrome.storage.local.get({discoveredAccounts:[]});
// לחיצה ידנית היא התחלה חדשה. קודם נשארו discountLastRun/discountAttempts מהריצה
// הקודמת, ולכן הלחיצה החזירה "discovering" אף שהזיהוי נבלם בצינון והבורר לא הופיע.
discountLastRun=0;
// לא מוחקים את הטבלה הקודמת בתחילת הזיהוי. היא מוחלפת רק אחרי שהבנק החזיר
// רשימת ישויות חדשה, ולכן כשל או עיכוב לא משאירים מסך ריק.
await chrome.storage.local.set({pendingDiscountBusiness:true,discountAttempts:0,syncStatus:'דיסקונט עסקי: מזהה ישויות וחשבונות — הרשימה הקודמת נשמרת עד לעדכון'});const tab=await discountTab();if(tab){await returnToDashboard(tab.id,true);await prepareDiscountContent(tab.id);await discoverDiscountBusiness(tab.id);return{ok:true,status:'discovering'}}await chrome.storage.local.set({syncStatus:'ממתין להתחברות לדיסקונט עסקי'});await openLoginWindow({url:DISCOUNT_LOGIN_BUSINESS,type:'popup',width:560,height:780,focused:true});return{ok:true,status:'waiting_login'}}
// שלושת השומרים של לאומי, מועתקים במכוון: נעילה, צינון ותקרת ניסיונות.
let discountBusy=false,discountLastRun=0;
const DISCOUNT_MAX_ATTEMPTS=3,DISCOUNT_COOLDOWN_MS=30000;
// מסכי הכניסה של דיסקונט. נמדדו 17.08.2026 מתוך ה-href של „כניסה לחשבון" באתר:
// קישור רגיל, בלי מודאל ובלי לחיצה — רק לנווט. הדף מרנדר #tzId · #tzPassword · #aidnum.
// ⚠ העסקי הוא **t=s** ולא t=b. ניחוש סביר היה שולח את המשתמש לדף הלא נכון.
const DISCOUNT_LOGIN_PRIVATE='https://start.telebank.co.il/login/?multilang=he&bank=d&t=p';
const DISCOUNT_LOGIN_BUSINESS='https://start.telebank.co.il/login/?multilang=he&bank=d&t=s';
async function discoverDiscountBusiness(tabId){const state=await chrome.storage.local.get({pendingDiscountBusiness:false,discoveredAccounts:[],discountAttempts:0});if(!state.pendingDiscountBusiness)return;
// ⚠ 18.08.2026 — „לא עושה כלום דיסקונט עסקים". נמדד: discountEntityReport אפס
// כתיבות, כלומר הזיהוי לא הגיע ללולאת הישויות בכלל. שתי היציאות האלה היו **שקטות**,
// ולחיצה בזמן שהזיהוי הקודם עוד תלוי (DISCOUNT_DISCOVER ממתין עד 2 דקות) נבלעה
// בלי שום סימן על המסך. יציאה שקטה היא באג בפני עצמו — עכשיו היא מדווחת.
if(discountBusy){await chrome.storage.local.set({syncStatus:'דיסקונט עסקי: זיהוי כבר מתבצע — המתן לסיומו, או לחץ „עצור סנכרון" ואז נסה שוב'});return}
if(running){await chrome.storage.local.set({syncStatus:'דיסקונט: סנכרון כבר רץ — הזיהוי ימתין לסיומו'});return}
if(Date.now()-discountLastRun<DISCOUNT_COOLDOWN_MS){const wait=Math.ceil((DISCOUNT_COOLDOWN_MS-(Date.now()-discountLastRun))/1000);await chrome.storage.local.set({syncStatus:`דיסקונט עסקי: זיהוי רץ לפני רגע — נסה שוב בעוד ${wait} שניות`});return}
if(state.discountAttempts>=DISCOUNT_MAX_ATTEMPTS){await chrome.storage.local.set({pendingDiscountBusiness:false,discountAttempts:0,syncStatus:`דיסקונט עסקי: ${DISCOUNT_MAX_ATTEMPTS} ניסיונות נכשלו — נעצר כדי לא להיכנס ללולאה. התחבר ידנית והפעל שוב.`});await chrome.runtime.openOptionsPage();return}
discountBusy=true;discountLastRun=Date.now();
await chrome.storage.local.set({discountAttempts:state.discountAttempts+1});
// ⚠ 18.08.2026 — „טענתי, לחצתי, לא עובד". נמדד: הסטטוס קפא על „מזהה ישויות
// וחשבונות" ולא נכתב אחריו **דבר**, וגם discountEntityReport נשאר ריק. הסיבה:
// כשל כאן חזר רק ב-reply → טוסט חולף בדשבורד, ולא נכתב לשום מקום. כלומר לא היה
// שום עקבות למדוד. עכשיו כל כשל נכתב לסטטוס **ולאחסון, עם כתובת הלשונית**.
try{return await runDiscoverDiscount(tabId,state)}
catch(e){const tab=await chrome.tabs.get(tabId).catch(()=>null);
  await chrome.storage.local.set({discountDiscoverError:{message:String(e?.message||e).slice(0,200),url:String(tab?.url||'').slice(0,200),at:new Date().toISOString()},
    syncStatus:`דיסקונט עסקי: ${String(e?.message||'הזיהוי נכשל').slice(0,140)}`});
  throw e}
finally{discountBusy=false;await restoreSyncTabs()}}
async function runDiscoverDiscount(tabId,state){abortIfRequested();await prepareDiscountContent(tabId);// ⚠ ההמתנה הזו הייתה אילמת: עד 120 שניות בלי אף כתיבת סטטוס, ולכן „תקוע" ו„נכשל"
// נראו זהים. פעימה כל 5 שניות, ותקרה של 60 שניות — די והותר לדף שכבר טעון.
let beat=0;const heartbeat=setInterval(()=>{beat+=5;chrome.storage.local.set({syncStatus:`דיסקונט עסקי: ממתין לתשובת הדף (${beat} שנ' מתוך 60)`})},5000);
// ⚠ 21.08.2026 — „אם הסשן התנתק למה הוא לא מקפיץ את דף ההתחברות, ככה הוא סתם ממתין".
// נמדד: כשהסשן פג דיסקונט מעביר ל-www.discountbank.co.il/messages/exit-page — **מארח
// אחר**, ו-content_scripts מוגדר רק ל-start.telebank.co.il. הסקריפט לא רץ שם, אף אחד
// לא עונה, והרקע ממתין 60 שניות ואז אומר „לא השיב". ההודעה „ההתחברות פגה" קיימת
// בסקריפט — ולכן לא יכולה להיאמר בדיוק כשצריך אותה.
// לכן: שומר סשן שמסתכל על כתובת הלשונית במקביל להמתנה, ועוצר ברגע שהיא עוזבת.
const sessionWatch=tab=>{let timer=null;const promise=new Promise((_,reject)=>{timer=setInterval(async()=>{let url='';try{url=(await chrome.tabs.get(tab))?.url||''}catch{}
  if(!url)return;
  const off=!/^https:\/\/start\.telebank\.co\.il\//.test(url),login=/\/login\//.test(url);
  // ⚠⚠ 21.08.2026 — טל: „לא מצליח להתחבר לדיסקונט, האם אתה משבש את הכניסה?"
  // **כן, ובצדק.** הגרסה הקודמת ניווטה את הלשונית לדף הכניסה ברגע שראתה `/login/` —
  // כלומר **בזמן שטל הקליד בדף הכניסה עצמו**, הדף נטען מחדש והמלל נמחק. זו בדיוק
  // לולאת הניווט שהכללים אוסרים. **השומר מדווח בלבד, ולעולם אינו מנווט.**
  if(off||login){clearInterval(timer);
    reject(Error(login?'ההתחברות לדיסקונט פגה — התחבר בלשונית ולחץ שוב':'ההתחברות לדיסקונט פגה — הדפדפן יצא מהסשן, התחבר ונסה שוב'))}},2000)});
  return{promise,stop:()=>clearInterval(timer)}};
const watch=sessionWatch(tabId);
let r=null;
try{r=await raceAbort(Promise.race([withTimeout(chrome.tabs.sendMessage(tabId,{type:'DISCOUNT_DISCOVER'}),60000,'זיהוי הישויות'),watch.promise]))}
finally{clearInterval(heartbeat);watch.stop()}
// שומרים את צילום המצב לפני שזורקים, כדי שהתיקון הבא ייכתב ממדידה ולא מהשערה.
if(r?.probe)await chrome.storage.local.set({discountProbe:r.probe});
if(!r?.ok)throw Error(r?.error||'זיהוי החשבונות נכשל');const raw=r.accounts||[];
// ⚠ 22.08.2026 — טל: „אין עדיין זיהוי לינון". נמדד מ-discountEntityReport:
// ישות 570012930 — passes:2, seenEntities:["514649565"], resolved:false. כלומר
// בשני המעברים ובכל 12 הדגימות הדף עדיין הציג את הישות הקודמת. אבל
// discountSelectWorked מאותה ריצה אומר {entity:"570012930", path:"a.dropdown-item"}
// — **המעבר כן הצליח, רק אחרי שהלולאה כבר ויתרה.** מעבר ישות טוען מחדש את הדף
// והורג את ה-content script, ולכן חלון הדגימה לא מספיק והמצב לא נקרא שוב.
// המספר עצמו כבר ידוע: הסנכרון של ינון הצליח ושמר 015-9832685, אחרי
// assertEntityMatches שאימת אותו מול הדף. אין שום סיבה לרוץ אחרי הדף כדי
// לגלות מחדש מה שכבר אומת ונשמר — מזריעים, בדיוק כפי ש-isracardActiveSince
// מזריע את סריקת החודשים. ישות שהוזרעה מדלגת על הניווט כולו בלולאה שלמטה.
// ⚠ מוזרעים **מספרים בלבד**. השמות נקראים מתוויות הבורר בקריאה אחת ולכן
// אמינים, בעוד שם שמור עלול להיות הישן והשגוי (ראה תקלת השם ב-1.0.23).
// ⚠ שני מקורות: הזיכרון הנפרד (שורד מחיקת חשבונות) ו-`accounts` (טרי יותר).
// הסדר מכוון — accounts נטען שני ולכן דורס רשומה ישנה בזיכרון.
const seedState=await chrome.storage.local.get({accounts:[],discountKnownNumbers:{}});
const knownNumbers=new Map();
for(const [id,v] of Object.entries(seedState.discountKnownNumbers||{}))
  if(v&&v.branch&&v.accountNumber)knownNumbers.set(String(id),{branch:String(v.branch),accountNumber:String(v.accountNumber)});
for(const acc of seedState.accounts||[]){
  if((acc.source||'')!=='discount-business'||!acc.branch||!acc.accountNumber)continue;
  const id=String(acc.entityId||String(acc.selectionKey||'').replace(/^.*\|/,''));
  if(id)knownNumbers.set(id,{branch:String(acc.branch),accountNumber:String(acc.accountNumber)});
}
let seededCount=0;
for(const a of raw){
  if(a.branch&&a.accountNumber)continue;
  const hit=knownNumbers.get(String(a.entityId||a.key||''));
  if(!hit)continue;
  a.branch=hit.branch;a.accountNumber=hit.accountNumber;seededCount++;
}

// מציגים את כל הישויות מיד. בשלב הזה אין קריאת יתרות/תנועות/הלוואות — רק שמות
// הישויות, ובהמשך מספרי החשבון מתמלאים שורה-שורה.
const otherBanks=state.discoveredAccounts.filter(a=>a.source!=='discount-business');
const asChoice=a=>({...a,balance:null,source:'discount-business',sourceLabel:'דיסקונט עסקי',key:`discount-business|${a.key}`,identifying:!(a.branch&&a.accountNumber),at:Date.now()});
await chrome.storage.local.set({discoveredAccounts:[...otherBanks,...raw.map(asChoice)],chooserFocus:{source:'discount-business',label:'דיסקונט עסקי',at:Date.now()},syncStatus:`דיסקונט עסקי: נמצאו ${raw.length} ישויות — מזהה מספרי חשבון בלבד`});
await chrome.runtime.openOptionsPage();
const entityReport=[];
for(let i=0;i<raw.length;i++){const a=raw[i],want=a.entityId||a.key;
// ⚠ יציאה באמצע: אם הדגל נסגר (סנכרון שהמשתמש סיים, או עצירה), אין להמשיך לנווט.
if(abortFlag)break;
if(!(await chrome.storage.local.get({pendingDiscountBusiness:false})).pendingDiscountBusiness)break;
await chrome.storage.local.set({syncStatus:`דיסקונט עסקי: מזהה מספר חשבון ${i+1} מתוך ${raw.length}`});if(a.branch&&a.accountNumber)continue;
// מעבר ישות הוא SPA ולעיתים ההודעה הראשונה חוזרת לפני שהכותרת ומספר החשבון
// התחלפו. מנסים פעמיים ומאמתים גם את הישות וגם מספר חשבון בן 10 ספרות.
// ⚠ 18.08.2026 — „דיסקונט עסקים לא עובד": הסנכרון עצמו מסתיים, אבל נמדד ש**רק
// ישות אחת מארבע** מקבלת מספר חשבון, ולכן רק היא מסונכרנת. השורש לא היה ידוע כי
// שני הכשלים כאן שקטים: `catch(e){}` על מעבר הישות, ולולאה שמסתיימת בלי לספר מה ראתה.
// לכן נאסף דוח פר-ישות ל-discountEntityReport — הריצה הבאה תגיד בעצמה מה נשבר.
const attempt={entity:want,owner:a.owner||'',selectError:'',passes:0,lastState:null,seenEntities:[]};
for(let pass=1;pass<=2&&!a.accountNumber;pass++){attempt.passes=pass;await prepareDiscountContent(tabId);
try{await withTimeout(chrome.tabs.sendMessage(tabId,{type:'DISCOUNT_SELECT_ENTITY',entity:want}),20000,`מעבר ישות ${pass}`)}catch(e){attempt.selectError=String(e?.message||e).slice(0,120)}
for(let w=0;w<12;w++){await delay(1000);await prepareDiscountContent(tabId);let st=null;try{st=await withTimeout(chrome.tabs.sendMessage(tabId,{type:'DISCOUNT_STATE'}),6000,'קריאת מספר חשבון')}catch(e){attempt.lastState={error:String(e?.message||e).slice(0,120)}}
if(st){attempt.lastState={entity:st.entity||'',branch:st.branch||'',accountNumber:st.accountNumber||'',owner:st.owner||''};if(st.entity&&!attempt.seenEntities.includes(st.entity))attempt.seenEntities.push(st.entity)}
if(st?.entity===want&&st?.branch&&st?.accountNumber){a.branch=st.branch;a.accountNumber=st.accountNumber;a.owner=st.owner||a.owner;a.nickname=st.owner||a.nickname;break}}}
attempt.resolved=Boolean(a.branch&&a.accountNumber);entityReport.push(attempt);
await chrome.storage.local.set({discountEntityReport:entityReport});
// מעדכנים את השורה מיד, בלי להמתין לשאר הישויות.
const live=await chrome.storage.local.get({discoveredAccounts:[]});await chrome.storage.local.set({discoveredAccounts:live.discoveredAccounts.map(x=>x.key===`discount-business|${a.key}`?asChoice(a):x)});}
const missing=raw.filter(a=>!a.branch||!a.accountNumber),resolved=raw.length-missing.length;
// ⚠ עד 18.08.2026 ישות אחת שלא נטענה זרקה את כל הריצה, הדגל נשאר דלוק, וכל כניסה
// הבאה לדיסקונט הפעילה זיהוי מחדש — כך „הסנכרון לא נגמר" הפך למצב קבוע.
// עכשיו: מה שזוהה מוצג ונשמר, הדגל נסגר, והחסר נאמר במפורש. רק אפס זיהויים הוא כישלון.
if(!resolved)throw Error(`אף ישות לא נטענה מתוך ${raw.length} — הרשימה החלקית לא הוצגה`);
const found=raw.map(asChoice);await chrome.storage.local.set({pendingDiscountBusiness:false,discountAttempts:0,discoveredAccounts:[...otherBanks,...found],chooserFocus:{source:'discount-business',label:'דיסקונט עסקי',at:Date.now()},syncStatus:missing.length
  ?`דיסקונט עסקי: ${resolved} מתוך ${raw.length} חשבונות זוהו — ${missing.map(a=>a.owner||a.entityId).join(', ')} טרם נטענו. בחר מה שיש, או לחץ שוב להשלמה`
  :`דיסקונט עסקי: נמצאו ואומתו ${found.length} חשבונות${seededCount?` (${seededCount} ממספרי חשבון שנשמרו בסנכרון קודם)`:''} — בחר לפי מספר חשבון`})}
const DISCOUNT_TX_URL='https://start.telebank.co.il/apollo/business2/#/OSH_LENTRIES_ALTAMIRA';
const DISCOUNT_LOANS_URL='https://start.telebank.co.il/apollo/business2/#/LOANS_WORLD';
async function syncDiscountBusiness(keys){const tab=await discountTab();if(!tab)throw Error('החיבור לדיסקונט עסקי אינו פעיל');noteSyncTab(tab.id);await returnToDashboard(tab.id,true);const all=await chrome.tabs.query({url:['https://start.telebank.co.il/*']});await chrome.storage.local.set({syncStatus:`דיסקונט עסקי: עובד בלשונית ${tab.id}${all.length>1?` (מתוך ${all.length} פתוחות)`:''}`});
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
// ⚠⚠ 25.08.2026 — **ישות ללא תנועות בטווח שרפה כאן 155 שניות.**
// הלולאה ממתינה ל-`rows>0`, ולחשבון ריק זה לעולם לא קורה — ולכן היא
// מיצתה את כל 12 הסבבים. עכשיו: אם הדף **ענה** שלוש פעמים ברציפות
// עם 0 שורות, הוא טעון ופשוט ריק, ואין טעם להמשיך להמתין.
// ⚠ אין כאן סיכון לקיצור מוקדם: `extract` עצמו ממתין לטעינה בשנית
// (עד 30 שניות), ולכן אם השורות יופיעו מאוחר יותר הן ייקראו.
// ⚠⚠ 25.08.2026 — **מדידה, אחרי שניחשתי כאן פעמיים.** הלולאה הזו
// אחראית ל-155 שניות שחוזרות בכל ריצה, ואין לי נתון מתוכה: לא כמה
// סבבים רצו, לא כמה עלה כל אחד, ולא אם `DISCOUNT_STATE` בכלל השיב.
// `discountWaitProbe` רושם את שלושת אלה. **בלי זה כל תיקון נוסף כאן
// הוא ניחוש רביעי.**
let emptyAnswers=0;const waitProbe={at:new Date().toISOString(),entity:String(key),rounds:[]};
const waitT0=Date.now();
for(let w=0;w<12;w++){
const rt0=Date.now();
await delay(2000);
const tPrep=Date.now();let prepErr='';
try{await prepareDiscountContent(tab.id)}catch(e){prepErr=String(e?.message||e).slice(0,60)}
const tPrepDone=Date.now();
let st=null,stErr='';
try{st=await withTimeout(chrome.tabs.sendMessage(tab.id,{type:'DISCOUNT_STATE'}),15000,'מצב')}catch(e){stErr=String(e?.message||e).slice(0,60)}
waitProbe.rounds.push({r:w+1,ms:Date.now()-rt0,
  prepMs:tPrepDone-tPrep,stateMs:Date.now()-tPrepDone,
  rows:st?st.rows:null,prepErr,stErr});
try{await chrome.storage.local.set({discountWaitProbe:{...waitProbe,total:Date.now()-waitT0}})}catch{}
if(st?.rows>0)break;
if(st&&st.rows===0){if(++emptyAnswers>=3)break}else emptyAnswers=0}
// ⚠⚠ 25.08.2026, בקשת טל: „להשוות את היתרות — אם זהה, לדלג; אם לא,
// לסנכרן מה שהשתנה." **וזה גם עוקף את התקלה הפתוחה:**
// `DISCOUNT_SYNC_SELECTED` אינו נענה (נמדד: 60ש׳ ואז 150ש׳, שניהם
// נכשלו), בעוד `DISCOUNT_STATE` **כן** עונה — שש מילישניות.
// לכן ההשוואה נשענת על ההודעה שעובדת, ולא על זו שנתקעת.
// ⚠ הפשרה מוצהרת: שתי תנועות נגדיות באותו סכום ביום אחד ישאירו את
// היתרה זהה והשינוי יפוספס. **טל ביקש זאת במפורש**, וזה המחיר.
// ⚠ מדלגים **רק** כשיש כבר תנועות שמורות — אחרת אין מה לשמר.
{
  const prevSt=await chrome.storage.local.get({accounts:[]});
  const saved=(prevSt.accounts||[]).find(a=>a&&a.source==='discount-business'&&String(a.entityId)===String(key));
  if(saved&&Array.isArray(saved.transactions)&&saved.transactions.length&&saved.balance!=null){
    let live=null,liveErr='';
    let liveTotals=null;
    let liveEntity='';
    // ⚠⚠ 25.08.2026 — **ממתינים שהבורר יתייצב על הישות המבוקשת.**
    // נמדד במדידה הראשונה של החסימה: `{entity:"024844714",
    // liveEntity:"570012930", entityMatch:false}` — הדף עדיין הציג את
    // הישות מהריצה הקודמת. החסימה סירבה נכון, **אבל אז הדילוג לא
    // מנוצל והישות מסתנכרנת לחינם.**
    // הבדיקה עולה **שש מילישניות** (נמדד), ולכן אפשר פשוט לדגום אותה
    // עד 12 פעמים. ⚠ זו המתנה **קצרה ומוגבלת**: אם הבורר לא מתייצב,
    // ממשיכים לסנכרון הרגיל ולא מדלגים — ספק פועל לטובת סנכרון.
    for(let w=0;w<12;w++){
      let probeEnt='';
      try{const pe=await withTimeout(chrome.tabs.sendMessage(tab.id,{type:'DISCOUNT_STATE'}),8000,'זהות');probeEnt=String(pe&&pe.entity||'')}catch(e){}
      if(probeEnt===String(key))break;
      await delay(500);
    }
    // ⚠⚠ 25.08.2026 — **היתרה נקראה מישות אחרת, ונתפס בגשש.**
    // נמדד: `{entity:"570012930", live:93188.32, saved:285292.66}` —
    // ו-93,188.32 היא היתרה של **514649565**, הישות הקודמת. הדף עדיין
    // לא סיים להחליף ישות כשהיתרה נקראה.
    // הפעם זה יצא `same:false` במקרה — **אבל אילו היתרה הישנה הייתה
    // מתלכדת עם השמורה, היינו מדלגים על סמך נתון של ישות אחרת.**
    // זו אותה משפחת באג של 21.08 („סנכרן את החשבון של יובל, נתן לו
    // שם של ינון"), ושם היא כבר גרמה לשמירת כסף בחשבון הלא נכון.
    // לכן: **הבורר חייב להצביע על הישות המבוקשת**, אחרת אין מדלגים.
    try{const sb=await withTimeout(chrome.tabs.sendMessage(tab.id,{type:'DISCOUNT_STATE',withBalance:true}),15000,'יתרה');
      liveEntity=String(sb&&sb.entity||'');
      const trust=liveEntity===String(key);
      live=trust&&sb?sb.balance:null;liveTotals=trust&&sb?sb.totals:null}
    catch(e){liveErr=String(e?.message||e).slice(0,60)}
    const balSame=live!=null&&Number.isFinite(Number(live))&&Math.abs(Number(live)-Number(saved.balance))<0.005;
    // ⚠⚠ בקשת טל: היתרה לבדה אינה מספיקה — שתי תנועות נגדיות באותו
    // סכום משאירות אותה זהה. לכן גם **סכום חובה וסכום זכות**, ורק
    // בתוך טווח התאריכים שהדף באמת מציג (`fromMs`..`toMs`); השמור
    // מכסה טווח רחב יותר, וסכום עליו היה חסר משמעות.
    // ⚠ אם אי אפשר לחשב סכומים — **לא מדלגים.** ספק פועל לטובת סנכרון.
    const lt=liveTotals;
    let sumSame=false,savedD=null,savedC=null,inRange=0;
    if(lt&&lt.n&&Number.isFinite(lt.fromMs)&&Number.isFinite(lt.toMs)){
      const toMs=v=>{const q=String(v||'').match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}(?:\d{2})?)$/);
        if(!q)return NaN;let y=Number(q[3]);if(y<100)y+=2000;return Date.UTC(y,Number(q[2])-1,Number(q[1]))};
      let d=0,c=0;
      for(const t of saved.transactions){const ms=toMs(t.date);
        if(!Number.isFinite(ms)||ms<lt.fromMs||ms>lt.toMs)continue;
        d+=Number(t.debit)||0;c+=Number(t.credit)||0;inRange++}
      savedD=Math.round(d*100)/100;savedC=Math.round(c*100)/100;
      sumSame=inRange>0&&Math.abs(savedD-lt.debit)<0.005&&Math.abs(savedC-lt.credit)<0.005;
    }
    const same=balSame&&sumSame;
    try{await chrome.storage.local.set({discountSkip:{entity:String(key),live,saved:saved.balance,
      balSame,sumSame,same,liveErr,inRange,liveEntity,entityMatch:liveEntity===String(key),
      liveDebit:lt?lt.debit:null,liveCredit:lt?lt.credit:null,savedDebit:savedD,savedCredit:savedC,
      at:new Date().toISOString()}})}catch{}
    if(same){
      await chrome.storage.local.set({syncStatus:`דיסקונט עסקי: ${key} — היתרה לא השתנתה, מדלג`});
      out.push({...saved,lastSync:now,status:`${saved.status||'מסונכרן'} · היתרה לא השתנתה`});
      continue;
    }
  }
}
let r=null,lastErr='',lastProbe=null;
// ⚠⚠ 25.08.2026 — **התקציב היה 150 שניות בכל שלושת הניסיונות, וזה
// היה רוב זמן הסנכרון.** נמדד אצל ישות 514220276: זמן קיר 155 שניות,
// מתוכם לולאת ההמתנה 2 שניות ו-`extract` **26 מילישניות** — כלומר
// **ניסיון 1 נתקע ומיצה את מלוא 150 השניות, וניסיון 2 הצליח מיד.**
// המקסימום האמיתי של `extract` אחרי תיקוני 1.8.x הוא כ-46 שניות
// (ישות 024844714, הגדולה). לכן ניסיון ראשון מקבל 75 שניות — פי 1.6
// מהמקסימום הנמדד — והבאים מקבלים את המלוא.
// ⚠ **לא קיצרתי מתחת ל-46 שניות במכוון:** קיצור אגרסיבי היה הופך ישות
// גדולה לכישלון קבוע. הראיה למקסימום היא `discountPhases` מ-19 ריצות.
// ⚠ `discountSyncAttempts` רושם **מה קרה בכל ניסיון** — עד עכשיו רק
// `lastErr` שרד, ולא היה אפשר לדעת אם הניסיון פג בזמן או החזיר שגיאה.
// ⚠ 75 שניות היו **קצרות מדי והחמירו**: נמדד `{n:1, ms:75003, ok:false}`
// ואחריו `{n:2, ms:129626, ok:true}` — כלומר הקיצור הבטיח בזבוז של
// 75 שניות לפני הניסיון שמצליח. **המדידה שעליה התבססתי (מקסימום 46
// שניות) הייתה מוטה** — סיננתי רשומות בצורה ששללה בדיוק את הריצות
// הארוכות. המקסימום האמיתי היה 129.6 שניות.
// 120 מכסה גם את המקרה הישן, למקרה שתיקון `rowDates` לא יספיק.
// ⚠⚠ 25.08.2026 — **ההודעה הראשונה אובדת, וכל העלות היא ה-timeout.**
// נמדד ב-`discountSyncAttempts` לשתי ישויות באותה ריצה:
//   {n:1, ms:120001, ok:false}  ואז  {n:2, ms:40, ok:true}
// כלומר ניסיון 1 **לא נענה כלל**, וניסיון 2 — הודעה זהה — הצליח
// ב-40 מילישניות. `discountPhases` של המוצלח: „סיום הקריאה" ב-72 מ״ש.
// **העבודה עצמה זניחה; מה שעולה 120 שניות הוא ההמתנה להודעה שאבדה.**
// ⚠ **הסיבה לאובדן טרם אותרה** — הערוץ חי (PING מילישנייה אחת, ו-
// `DISCOUNT_STATE` שש מ״ש, שניות ספורות קודם). לכן זה **מיטיגציה
// ולא תיקון שורש**: מקצרים את המחיר, לא מונעים את האובדן.
// ⚠ בחירת 60: המדגם המלא של הניסיונות שהצליחו הוא
// 0.3 · 4.8 · 15.6 · 19.3 · 19.6 · 20.7 · 26.6 · 27.2 · 41.9 · 129.6 שניות.
// **129.6 הוא חריג היסטורי מלפני תיקון `rowDates`**, והמקסימום העדכני
// הוא 41.9. 60 נותנות 43% מרווח מעליו.
// ⚠⚠ ב-1.9.2 קיצרתי ל-75 על סמך „מקסימום 46" — **מדגם שסיננתי בשקט
// והחריג נשמט ממנו** — והקיצור החמיר. הפעם המדגם מוצג במלואו כאן,
// והנפילה בטוחה: אם ניסיון 1 יפוג, ניסיון 2 מקבל 150 שניות מלאות.
const SYNC_BUDGET=[60000,150000,150000];
const attemptLog=[];
for(let attempt=1;attempt<=3;attempt++){
const at0=Date.now();
// ⚠ שומרים את הצילום לפני איפוס r, אחרת האבחון של הניסיון הכושל נמחק ואי אפשר לדעת למה נכשל.
let threw=false;
try{r=await withTimeout(chrome.tabs.sendMessage(tab.id,{type:'DISCOUNT_SYNC_SELECTED',keys:[key]}),SYNC_BUDGET[attempt-1],'קריאת התנועות');if(r?.probe)lastProbe=r.probe;
attemptLog.push({n:attempt,ms:Date.now()-at0,ok:Boolean(r?.ok),err:r?.ok?'':String(r?.error||'קריאה ריקה').slice(0,70)})}
catch(e){threw=true;lastErr=e.message;attemptLog.push({n:attempt,ms:Date.now()-at0,ok:false,err:String(e.message).slice(0,70)})}
// ⚠ הכתיבה **לפני** ה-break. קודם היא ישבה אחריו, ולכן **הניסיון
// המוצלח — המקרה הנפוץ ביותר — לא נרשם מעולם.** אותו לקח כמו ב-1.8.0:
// גשש שאינו שורד את המסלול הנפוץ אינו גשש.
try{await chrome.storage.local.set({discountSyncAttempts:{entity:String(key),at:new Date().toISOString(),attempts:attemptLog}})}catch{}
if(!threw&&r?.ok)break;
if(!threw)lastErr=r?.error||'קריאה ריקה';else await prepareDiscountContent(tab.id);
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
// ⚠ 22.08.2026 — טל: „מה יקרה אם אמחק את החשבונות ואסנכרן מחודש פברואר?"
// נמדד: ההזרעה של 1.0.24 קוראת את `accounts`, ומחיקת חשבון בדשבורד מסלקת
// אותו משם — כלומר **המחיקה משמידה את מספר החשבון היחיד שממנו אפשר לזהות
// את ינון**, והתיבה שלו חוזרת להיות disabled. כלומר ההזרעה נשענה על נתונים
// שהמשתמש רשאי למחוק. זיכרון נפרד, שהמחיקה אינה נוגעת בו, סוגר את הפער.
// נכתב **רק אחרי סנכרון שעבר assertEntityMatches** — כלומר מספר שאומת מול
// הדף, לא ניחוש. נכתב לפני בדיקת השלמות שלמטה בכוונה: ריצה חלקית עדיין
// מפקידה את מה שהספיקה לאמת.
// רשומה מתיישנת מתקנת את עצמה: כל סנכרון מוצלח דורס אותה, ואם מספר בבנק
// באמת השתנה, assertEntityMatches יעצור את הסנכרון במקום לשמור חשבון אחר.
{const prev=(await chrome.storage.local.get({discountKnownNumbers:{}})).discountKnownNumbers||{},next={...prev};
 for(const a of out)if(a.entityId&&a.branch&&a.accountNumber)next[String(a.entityId)]={branch:String(a.branch),accountNumber:String(a.accountNumber),at:now};
 await chrome.storage.local.set({discountKnownNumbers:next});}
if(out.length!==keys.length)throw Error(`נקראו ${out.length} ישויות מתוך ${keys.length}`);
return out}
