// אחסון מקומי לצילומי שיקים, משותף לרקע ולדשבורד.
//
// ⚠ לא ב-chrome.storage.local בכוונה: הדשבורד עושה storage.local.get על כל החשבונות
// בכל רינדור, וצילום שיק שוקל כ-45KB. עשרות שיקים שם היו מייצרים מגה-בייטים של base64
// שנקראים ומפוענחים בכל שינוי — הממשק היה נתקע. IndexedDB נקרא לפי מפתח ובעצלתיים.
const CHEQUE_DB = 'leumi-cheques', CHEQUE_STORE = 'images';

// חיבור אחד לכל חיי הדף/העובד. פתיחת חיבור בכל קריאה עורמת חיבורים פתוחים,
// והם חוסמים מחיקת מסד או שדרוג גרסה בהמשך.
let chequeDbPromise = null;
function chequeDb(){
  if(chequeDbPromise) return chequeDbPromise;
  chequeDbPromise = new Promise((resolve,reject)=>{
    const req = indexedDB.open(CHEQUE_DB, 1);
    req.onupgradeneeded = () => { if(!req.result.objectStoreNames.contains(CHEQUE_STORE)) req.result.createObjectStore(CHEQUE_STORE, {keyPath:'id'}) };
    req.onsuccess = () => { req.result.onclose = () => { chequeDbPromise = null }; resolve(req.result) };
    req.onerror = () => { chequeDbPromise = null; reject(req.error) };
  });
  return chequeDbPromise;
}
function chequeStore(mode){ return chequeDb().then(db => db.transaction(CHEQUE_STORE, mode).objectStore(CHEQUE_STORE)) }
function wrap(request){ return new Promise((resolve,reject)=>{ request.onsuccess=()=>resolve(request.result); request.onerror=()=>reject(request.error) }) }

// המפתח הוא האסמכתא, ולא תאריך+סכום. ב-14.07.2026 יש שלושה שיקים של ₪4,130 באותו יום,
// והאסמכתא היא הדבר היחיד שמבדיל ביניהם.
function chequeId(selectionKey, reference){ return `${selectionKey}|${reference}` }

async function chequeGet(id){ return wrap((await chequeStore('readonly')).get(id)).then(r => r || null) }
async function chequePut(record){ return wrap((await chequeStore('readwrite')).put(record)) }
async function chequeKeys(){ return new Set(await wrap((await chequeStore('readonly')).getAllKeys())) }
async function chequeCount(){ return wrap((await chequeStore('readonly')).count()) }
