// היסטוריית חיובים לכרטיסי אשראי, חודש-חודש, עד שנה אחורה.
//
// ⚠ לא ב-chrome.storage.local בכוונה — אותו שיקול כמו בצילומי השיקים: הדשבורד קורא את כל
// האחסון בכל רינדור, ו-12 חודשים × כרטיסים × עשרות תנועות היו נקראים ומפוענחים כל פעם.
// כאן נקרא רק החודש שנבחר.
const CARDHIST_DB = 'card-history', CARDHIST_STORE = 'months';

let cardHistDbPromise = null;
function cardHistDb(){
  if(cardHistDbPromise) return cardHistDbPromise;
  cardHistDbPromise = new Promise((resolve,reject)=>{
    const req = indexedDB.open(CARDHIST_DB, 1);
    req.onupgradeneeded = () => {
      if(!req.result.objectStoreNames.contains(CARDHIST_STORE)){
        const st = req.result.createObjectStore(CARDHIST_STORE, {keyPath:'id'});
        st.createIndex('month','month',{unique:false});
      }
    };
    req.onsuccess = () => { req.result.onclose = () => { cardHistDbPromise = null }; resolve(req.result) };
    req.onerror = () => { cardHistDbPromise = null; reject(req.error) };
  });
  return cardHistDbPromise;
}
function cardHistStore(mode){ return cardHistDb().then(db => db.transaction(CARDHIST_STORE, mode).objectStore(CARDHIST_STORE)) }
function cardHistWrap(request){ return new Promise((res,rej)=>{ request.onsuccess=()=>res(request.result); request.onerror=()=>rej(request.error) }) }

// המפתח הוא כרטיס+חודש. monthAndYear בפורמט של ישראכרט: MMYYYY.
function cardHistId(suffix, month){ return `${suffix}|${month}` }

async function cardHistPut(record){ return cardHistWrap((await cardHistStore('readwrite')).put(record)) }
async function cardHistGetMonth(month){
  const st = await cardHistStore('readonly');
  return cardHistWrap(st.index('month').getAll(String(month)));
}
async function cardHistMonths(){
  const all = await cardHistWrap((await cardHistStore('readonly')).getAll());
  return [...new Set(all.map(r => r.month))].sort().reverse();
}
async function cardHistStats(){
  const all=await cardHistWrap((await cardHistStore('readonly')).getAll()),out={};
  for(const r of all){const key=String(r.suffix||'');if(!key)continue;const item=out[key]||(out[key]={months:[],lastSync:''});if(!item.months.includes(String(r.month)))item.months.push(String(r.month));if(String(r.savedAt||'')>item.lastSync)item.lastSync=String(r.savedAt||'')}
  for(const item of Object.values(out)){item.months.sort().reverse();item.count=item.months.length}
  return out;
}
// מוחק את כל היסטוריית הכרטיס, בכל החודשים. נוסף 18.08.2026 לבקשת טל:
// כרטיס שנטען בטעות לא היה ניתן להסרה, ורק הצטבר בתצוגה.
async function cardHistDeleteCard(suffix){
  const key=String(suffix||'');if(!key)return 0;
  const db=await cardHistDb();return new Promise((resolve,reject)=>{
    const tx=db.transaction(CARDHIST_STORE,'readwrite'),st=tx.objectStore(CARDHIST_STORE),req=st.getAll();let n=0;
    req.onsuccess=()=>{for(const r of req.result||[])if(String(r.suffix)===key){st.delete(r.id);n++}};
    req.onerror=()=>reject(req.error);tx.oncomplete=()=>resolve(n);tx.onerror=()=>reject(tx.error);
    tx.onabort=()=>reject(tx.error||Error('מחיקת היסטוריית הכרטיס בוטלה'));
  });
}
async function cardHistDeleteMonths(months,suffixes=[]){
  const wanted=new Set((months||[]).map(String)),cards=new Set((suffixes||[]).map(String));if(!wanted.size)return 0;
  const db=await cardHistDb();return new Promise((resolve,reject)=>{
    const tx=db.transaction(CARDHIST_STORE,'readwrite'),st=tx.objectStore(CARDHIST_STORE),req=st.getAll();let n=0;
    req.onsuccess=()=>{for(const r of req.result||[])if(wanted.has(String(r.month))&&(!cards.size||cards.has(String(r.suffix)))){st.delete(r.id);n++}};
    req.onerror=()=>reject(req.error);tx.oncomplete=()=>resolve(n);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||Error('ניקוי היסטוריית הכרטיסים בוטל'));
  });
}
// שומרים שנה אחורה בלבד; מה שמעבר נמחק כדי שהמסד לא יגדל ללא גבול.
async function cardHistPrune(keep = 12){
  const months = await cardHistMonths();
  const drop = months.slice(keep);
  if(!drop.length) return 0;
  const st = await cardHistStore('readwrite');
  const all = await cardHistWrap(st.getAll());
  let n = 0;
  for(const r of all) if(drop.includes(r.month)){ st.delete(r.id); n++ }
  return n;
}
