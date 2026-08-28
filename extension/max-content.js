(()=>{
// WHY 28.08.2026 - חיסון מאותה תקלה שאכלה יומיים בלאומי:
//   "The page keeping the extension port is moved into back/forward cache,
//    so the message channel is closed."
// דף שנכנס ל-bfcache **סוגר את כל ערוצי ההודעות של התוסף**, והתשובה
// לעולם אינה מגיעה - בלי שגיאה ובלי סיבה. זה נראה בדיוק כמו "הדף מת".
// ⚠ זו אינה תקלה של לאומי אלא של **כל מתאם שמנווט תוך כדי עבודה**.
// ואכן: "message channel closed" רשום ב-statusBySource של דיסקונט עסקי
// מ-18.08 ולא הובן אז.
// דף שיש לו מאזין unload אינו כשיר ל-bfcache. מאזין ריק אחד, ותו לא.
// ⚠ pageshow עם persisted=true נרשם, כדי שאם זה יקרה בכל זאת - נדע.
// WHY: הרישום חייב להיות חד-פעמי. ההזרקה מחדש (שהיא חלק מהתיקון!)
// רצה **לפני** שומר הטעינה הכפולה בקבצים האלה, ובלי הדגל הזה כל
// הזרקה הייתה מוסיפה מאזין נוסף. דגל על window פותר בלי להזיז קוד.
try{if(!window.__bfcacheGuard){window.__bfcacheGuard=1;
  window.addEventListener('unload',()=>{});
  window.addEventListener('pageshow',e=>{if(e.persisted){
    try{chrome.storage.local.set({bfcacheSeen:{source:'max',at:new Date().toISOString(),
      url:String(location.href).slice(0,140)}})}catch(err){}}});
}}catch(e){}

// שומר הזרקה עמיד למות הקשר — ראה discount-content.js
if(window.__maxSyncLoaded){try{if(window.__maxSyncLoaded())return}catch(e){}}
// ⚠ ההפניה נתפסת כאן ולא נקראת מחדש בכל בדיקה: קריאה מחדש
// מחזירה את ה-chrome החדש, והגשש מדווח „חי" גם כשההקשר שלו מת. נתפס בבדיקה.
const __rt__maxSyncLoaded=(()=>{try{return chrome.runtime}catch(e){return null}})();
window.__maxSyncLoaded=()=>{try{return !!(__rt__maxSyncLoaded&&__rt__maxSyncLoaded.id)}catch(e){return false}};

const clean=v=>String(v||'').replace(/[\u200e\u200f\u202a-\u202e]/g,'').replace(/\s+/g,' ').trim(),wait=ms=>new Promise(r=>setTimeout(r,ms));
const money=v=>{const m=clean(v).replace(/[−–]/g,'-').match(/-?[\d,]+(?:\.\d{1,2})?/);return m?Number(m[0].replace(/,/g,'')):null};
// ⚠⚠ 28.08.2026 - "התחברתי והסנכרון לא התחיל": מקס החליפו את הממשק - אין עוד
// "היי <שם> (:" גלוי (אווטאר במקום ברכה), ו"התנתקו" ירד לתפריט מוסתר. הגלאי
// הישן נשאר עיוור, והתוסף חיכה להתחברות שכבר קרתה.
// ⚠ "התנתק" באלמנטים מוסתרים קיים **גם בדף ההתחברות** (נמדד 28.08) - פסול כסימן.
// המבחן שנמדד משני הצדדים: דפדפן לא מחובר מועף מ-transaction-details ל-/login
// מיידית; מחובר נשאר. לכן ישיבה בעמוד אישי (או בורר החודשים) = מחובר.
function authenticated(){
  if(!/(^|\.)max\.co\.il$/.test(location.hostname))return false;
  if(/^\/login/.test(location.pathname))return false;
  if(/היי\s+[^\n(]+\s*\(:|התנתקו/.test(document.body?.innerText||''))return true; // הממשק הישן
  if(document.querySelector('.combo.dates'))return true; // בורר החודשים - קיים רק בפנים
  return /^\/transaction-details/.test(location.pathname);
}
function report(){if(authenticated())chrome.runtime.sendMessage({type:'MAX_AUTHENTICATED'}).catch(()=>{})}report();setInterval(report,5000);
function monthKey(){const t=clean(document.querySelector('.combo-text.dates')?.textContent),names={ינואר:'01',פברואר:'02',מרץ:'03',אפריל:'04',מאי:'05',יוני:'06',יולי:'07',אוגוסט:'08',ספטמבר:'09',אוקטובר:'10',נובמבר:'11',דצמבר:'12'},m=t.match(/(ינואר|פברואר|מרץ|אפריל|מאי|יוני|יולי|אוגוסט|ספטמבר|אוקטובר|נובמבר|דצמבר)\s+(\d{4})/);return m?`${names[m[1]]}.${m[2]}`:''}
function rows(){return[...document.querySelectorAll('.row.body')].map(r=>{const date=clean(r.querySelector('.cell.date')?.textContent),merchant=clean(r.querySelector('.cell.name')?.textContent),category=clean(r.querySelector('.cell.category')?.textContent),suffix=clean(r.querySelector('.cell.card-number')?.textContent).replace(/\D/g,'').slice(-4),type=clean(r.querySelector('.cell.type')?.textContent),sumText=clean(r.querySelector('.cell.sum')?.textContent),ils=[...sumText.matchAll(/₪\s*(-?[\d,]+(?:\.\d{1,2})?)/g)],amount=ils.length?Number(ils.at(-1)[1].replace(/,/g,'')):money(sumText);return/^\d{2}\.\d{2}\.\d{2,4}$/.test(date)&&merchant&&Number.isFinite(amount)?{date,merchant,category,suffix,type,amount}:null}).filter(Boolean)}
function read(){const transactions=rows(),body=clean(document.querySelector('main')?.innerText),cards={};for(const t of transactions)(cards[t.suffix]||(cards[t.suffix]=[])).push(t);const total=money((body.match(/סה"כ\s*₪?\s*([\d,.-]+)/)||[])[1]);return{ok:true,month:monthKey(),total,transactions,cards,fingerprint:`${monthKey()}|${transactions.length}|${transactions.slice(0,3).map(x=>`${x.date}:${x.merchant}:${x.amount}`).join('|')}`}}
async function selectMonth(label){const open=document.querySelector('.combo.dates .open-menu');if(!open)return{ok:false,error:'בורר החודשים של MAX לא נמצא'};open.click();await wait(250);const item=[...document.querySelectorAll('li.month,[role="button"]')].find(e=>clean(e.textContent)===clean(label));if(!item)return{ok:false,error:`החודש ${label} לא נמצא בבורר MAX`};item.click();return{ok:true}}
chrome.runtime.onMessage.addListener((m,s,reply)=>{if(m?.type==='MAX_PING'){reply({ok:true});return}if(m?.type==='MAX_READ'){reply(read());return}if(m?.type==='MAX_SELECT_MONTH'){selectMonth(m.label).then(reply);return true}});
})();
