// מתאם יהב — חולץ מ-background.js ללא שינוי תוכן (פיילוט פיצול, 16.08.2026).
//
// ⚠ המצב המשותף נשאר ב-background.js בכוונה: running, autoBusy, מאזין ההודעות
// ושומרי הלולאה. העברתם היא החלק המסוכן ביותר ונדחית עד שהמבנה יוכיח את עצמו.
//
// תלויות מ-background.js: delay, autoBusy. שתיהן נקראות רק בתוך פונקציות שרצות
// בתגובה להודעות — הרבה אחרי סיום הטעינה — ולכן סדר ה-importScripts אינו בעיה.
//
// אין עטיפת IIFE במתכוון: service worker קלאסי חולק גלובל אחד, ועטיפה הייתה
// מחייבת לשנות את כל נקודות הקריאה ב-background.js ולהגדיל את ה-diff של הפיילוט.

const YAHAV_ROOT='https://digital.yahav.co.il/BaNCSDigitalUI/app/index.html';
// מסך הכניסה עצמו. נמדד 17.08.2026: digital.yahav.co.il מפנה לכאן, והדף הזה עומד
// בפני עצמו ומרנדר מיד את השדות #username · #pinno · #password. פתיחה ישירה חוסכת
// את שרשרת ההפניות ומנחיתה את המשתמש על הטופס.
// ⚠ login.yahav.co.il **אינו** ב-host_permissions, וזה מכוון: לתוסף אין ולא תהיה
// גישה לדף שבו מוקלדת הסיסמה. פתיחת לשונית אינה דורשת הרשאה.
const YAHAV_LOGIN='https://login.yahav.co.il/login/';
let yahavBusy=false;
async function yahavTab(){const tabs=await chrome.tabs.query({url:['https://digital.yahav.co.il/*']});return tabs.find(t=>t.url?.includes('/app/index.html'))||null}
async function prepareYahav(tabId){await delay(650);try{const p=await chrome.tabs.sendMessage(tabId,{type:'PING'});if(p?.ok)return}catch{}await chrome.scripting.executeScript({target:{tabId},files:['yahav-content.js']});await delay(250)}
async function yahavRead(tabId){await prepareYahav(tabId);const tab=await chrome.tabs.get(tabId),waitForTransactions=tab.url?.includes('#/main/home'),attempts=waitForTransactions?24:1;let r=null;for(let i=0;i<attempts;i++){try{r=await chrome.tabs.sendMessage(tabId,{type:'YAHAV_READ'});if(r?.ok&&(!waitForTransactions||r.transactions?.length))return r}catch{}await delay(500)}if(r?.ok)return r;throw Error('לא ניתן לקרוא את דף יהב')}
async function readYahavTotals(tabId){for(let attempt=0;attempt<24;attempt++){const reads=await chrome.scripting.executeScript({target:{tabId},func:()=>{const clean=v=>String(v||'').replace(/[\u200e\u200f\u202a-\u202e]/g,'').replace(/\s+/g,' ').trim(),num=v=>{const m=clean(v).replace(/[−–]/g,'-').match(/-?[\d,]+(?:\.\d{1,2})?/);if(!m)return null;const n=Number(m[0].replace(/,/g,''));return Number.isFinite(n)?n:null};let balance=null,creditLimit=null,loanBalance=null;for(const row of document.querySelectorAll('table [role="row"],table tr')){const c=[...row.querySelectorAll('[role="gridcell"],td')].map(x=>clean(x.innerText));if(c[0]==='חשבון עו״ש'&&balance==null)balance=num(c[1]);if(c[0]==='הלוואות'&&loanBalance==null)loanBalance=num(c[1])}/* ⚠⚠ 25.08.2026 — **עותק שני של אותה לוגיקה.** תיקנתי תחילה את
   `summary()` ב-yahav-content.js — **וזה לא הקוד שרץ.** `readYahavTotals`
   מזריק עותק משלו דרך `executeScript`, ובו היה אותו רגקס נוקשה.
   הגשש הראה `near:0` ו-`balance:null` — כלומר `summary()` רצה על
   דף אחר לגמרי. ⚠ **לוגיקה משוכפלת: כל תיקון כאן חייב להיעשות
   גם שם, ולהפך.** הפונקציה המוזרקת חייבת להיות עצמאית
   ואינה יכולה לקרוא לעוזרי ה-content script. */
const text=clean(document.body?.innerText);
for(const lab of ['מסגרת אשראי','מסגרת עו״ש','מסגרת מאושרת','מסגרת']){
  const mm=text.match(new RegExp(lab+'[\\s:\\u00a0\\u20aa]{0,12}(-?[\\d,]+(?:\\.\\d{1,2})?)'));
  if(mm){creditLimit=num(mm[1]);break}}
if(creditLimit!=null&&balance!=null&&Math.abs(creditLimit-balance)<0.011)creditLimit=null;
const near=[];for(const el of document.querySelectorAll('td,th,div,span,li,p')){
  if(el.children.length)continue;
  const t=clean(el.innerText||el.textContent||'');
  if(t&&t.length<70&&t.indexOf('מסגרת')>=0){const s2=el.nextElementSibling;
  near.push({text:t,next:s2?clean(s2.innerText||s2.textContent||'').slice(0,40):''});if(near.length>=6)break}}
return{balance,creditLimit,loanBalance,near,heading:document.querySelector('h1')?.innerText||''}}});const value=reads[0]?.result;
// ⚠ הגשש נשמר **בכל ניסיון**, גם כשהיתרה עדיין ריקה — אחרת
// המידע על הניסיונות שנכשלו אובד, והוא בדיוק מה שמעניין כשאין מסגרת.
try{await chrome.storage.local.set({yahavCreditProbe:{value:value?.creditLimit??null,
  balance:value?.balance??null,near:value?.near||[],heading:value?.heading||'',
  attempt,at:new Date().toISOString()}})}catch(e){}
if(value?.balance!=null)return value;await delay(450)}throw Error('ריכוז היתרות לא נטען')}
async function yahavRoute(tabId,hash){await chrome.tabs.update(tabId,{active:true});const clicked=await chrome.scripting.executeScript({target:{tabId},args:[hash],func:(route)=>{const links=[...document.querySelectorAll('a[href]')],exact=links.find(a=>a.getAttribute('href')===`#${route}`),loose=links.find(a=>String(a.getAttribute('href')||'').replace(/\/$/,'')===`#${route}`.replace(/\/$/,'')),target=exact||loose;if(target){target.click();return true}location.hash=route;return false}});await delay(clicked.some(x=>x.result)?1700:2600);await prepareYahav(tabId)}
function yahavInstallments(startDate,nextDate,endDate){const parse=v=>{const m=String(v||'').match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);return m?{d:+m[1],m:+m[2],y:+m[3]}:null},s=parse(startDate),n=parse(nextDate),e=parse(endDate);if(!s||!n||!e)return{};const total=(e.y-s.y)*12+e.m-s.m+1,remaining=(e.y-n.y)*12+e.m-n.m+1;if(total<=0||remaining<=0||remaining>total)return{};return{installments:`${remaining}/${total}`,remainingInstallments:remaining,totalInstallments:total}}
// ⚠⚠ 25.08.2026 — טל: „יהב רץ וסיים אבל הבורר לא עבד."
// **השורש:** הסנכרון של בנק בודד מחק את `discoveredAccounts` **כולו** —
// כלומר גם את רשימת הבחירה של לאומי ושל דיסקונט. אומת באחסון:
// אחרי ריצת יהב, `discoveredAccounts` הוא `[]`.
// ⚠ **התקדים כבר בקובץ:** `startLeumi` מסנן
// `filter(a=>a.source!=='leumi')` — מוחק רק את שלו. כאן לא הוחל.
async function startYahav(){
const __prevY=await chrome.storage.local.get({discoveredAccounts:[]});
await chrome.storage.local.set({pendingYahav:true,
  discoveredAccounts:(__prevY.discoveredAccounts||[]).filter(a=>a&&a.source!=='yahav'),
  syncStatus:'יהב: בודק את החיבור'});const tab=await yahavTab();if(!tab){await chrome.storage.local.set({syncStatus:'ממתין להתחברות ליהב — הזן קוד משתמש, ת״ז וסיסמה במסך שנפתח'});await chrome.windows.create({url:YAHAV_LOGIN,type:'popup',width:560,height:780,focused:true});return{ok:true,status:'waiting_login'}}await chrome.storage.local.set({pendingYahav:false,syncStatus:'יהב: מרענן את החיבור'});await returnToDashboard(tab.id,true);await chrome.tabs.reload(tab.id);await delay(3000);await chrome.storage.local.set({pendingYahav:true,syncStatus:'יהב: החיבור מוכן, מתחיל סנכרון'});runYahav(tab.id).catch(async e=>{await chrome.storage.local.set({pendingYahav:false,syncStatus:`שגיאה ביהב: ${e.message}`});await chrome.runtime.openOptionsPage()});return{ok:true,status:'syncing'}}
async function yahavOpenLoans(tabId){await yahavRoute(tabId,'/main/home');const clicked=await chrome.scripting.executeScript({target:{tabId},func:()=>{const clean=v=>String(v||'').replace(/\s+/g,' ').trim(),a=[...document.querySelectorAll('a[href]')].find(x=>clean(x.textContent)==='הלוואות וערבויות');if(!a)return false;a.click();return true}});if(!clicked.some(x=>x.result))throw Error('הקישור הראשי להלוואות וערבויות לא נמצא בדף הבית');await delay(1800);await prepareYahav(tabId)}
async function runYahav(tabId){
  if(yahavBusy)return; yahavBusy=true;
  try{
    await chrome.storage.local.set({syncStatus:'יהב: מחיל את טווח האיסוף וקורא תנועות'});
    await yahavRoute(tabId,'/main/accounts/current/');
    // טווח שלא נקבע אינו מוחק סנכרון שלם — קוראים את מה שהדף מציג, ומדווחים
    // שהתקופה מקוצרת כדי שהמשתמש לא יחשוב שקיבל שלושה חודשים. אותו עיקרון
    // שכבר יושם ביתרה חסרה (0.64.0) ובהלוואות פועלים (0.67.0).
    // ⚠⚠ 27.08.2026 — נמדד באחסון, שלוש ריצות ברציפות:
    //   yahavRangeApplied {ok:false, why:"שדה התאריך לא נמצא", monthsBack:7}
    // הכוונה נכונה — 7 חודשים נגזרים מ-collectSince — אבל הסלקטור
    //   input.date-picker-input , input[placeholder="dd/MM/y"]
    // אינו מוצא דבר, ולכן נקראת רק התקופה שהדף מציג (10 תנועות מ-04/06).
    // ⚠ אין לנחש סלקטור חדש. אותו גשש שסגר את פועלים בסבב אחד מוזרק כאן,
    // ו-dateControls() יחזיר את בורר התאריכים האמיתי. **מדידה בלבד.**
    // ⚠⚠ 27.08 — הגשש הזה נוסף ב-1.16.1 **ומעולם לא כתב דבר**: `yahavTxProbe`
    // אינו באחסון אף שהריצה עברה כאן. הסיבה אינה ידועה — וה-`catch(e){}` הריק
    // בלע אותה. **גשש שנכשל בשקט גרוע מגשש שאינו קיים**, כי הוא מייצר אשליה
    // שנמדד. שתי מסקנות מיושמות כאן:
    //   1. אותו מנגנון שהצליח פעמיים היום — `probeAllFrames`: הזרקה **לכל
    //      מסגרת** ומסירה לפי `frameId`, במקום הזרקה יחידה שמסתמכת על כך
    //      שהמאזין הראשון שיענה הוא הנכון (ל-`yahav-content.js` יש מאזין משלו).
    //   2. **השגיאה נשמרת** ולא נבלעת.
    try{
      const frames=await probeAllFrames(tabId);
      await chrome.storage.local.set({yahavTxProbe:{at:new Date().toISOString(),frames}});
    }catch(e){try{await chrome.storage.local.set({yahavTxProbe:{at:new Date().toISOString(),
      error:String(e?.message||e).slice(0,140)}})}catch(e2){}}
    let range=null;
    try{range=await withTimeout(chrome.tabs.sendMessage(tabId,{type:'YAHAV_SET_3_MONTHS'}),30000,'הגדרת טווח התאריכים')}catch(e){range={ok:false,error:e.message}}
    {
      const diags=(await chrome.storage.local.get({bankDiagnostics:{}})).bankDiagnostics||{};
      // ⚠⚠ 27.08 — „הצליח" ביהב אינו בהכרח „הגיע לינואר": הבורר עצמו חוסם
      // מעבר לכחצי שנה אחורה (נמדד `cells:[27,28]` — שני ימים בני-בחירה בלבד).
      // **מגבלת בנק אינה תקלה, אבל היא כן צריכה להיאמר** — אחרת טל רואה
      // „הסתיים בהצלחה" ותוהה למה אין ינואר.
      const rep=(await chrome.storage.local.get({yahavRangeApplied:null})).yahavRangeApplied;
      if(!range?.ok)diags.yahav='טווח 3 חודשים לא נקבע — נקראה התקופה שהדף הציג';
      else if(rep&&rep.limited)diags.yahav=`יהב מאפשר לחזור עד ${rep.value||'?'} בלבד — התנועות נקראו מהתאריך הזה ולא מ-${rep.wanted||'?'}`;
      else delete diags.yahav;
      await chrome.storage.local.set({bankDiagnostics:diags});
    }
    await delay(2800);
    const home=await yahavRead(tabId),account=home.account;
    if(!account)throw Error('לא זוהה מספר החשבון הפעיל');
    if(!home.transactions?.length)throw Error('לא נקראו תנועות עו״ש');

    /* ⚠⚠ 25.08.2026 — **עותק שלישי של אותה לוגיקה, והוא זה שקובע.**
   המסגרת שנשמרת לחשבון מגיעה מכאן — מ-`home.text` של `YAHAV_READ` —
   ולא מ-`summary()` (תוקן 1.12.5) ולא מ-`readYahavTotals` (תוקן 1.12.7).
   ⚠ **שלושה עותקים של אותו רגקס נוקשה.** כל תיקון חייב לעבור על
   שלושתם. טל: „ביהב המסגרת עבדה בעבר" — והלוגיקה לא שונתה
   מאז פיצול הקובץ (נבדק ב-`git log -S`), כלומר **הדף השתנה**. */
const creditFrom=t=>{const txt=String(t||'');
  for(const lab of ['מסגרת אשראי','מסגרת עו״ש','מסגרת מאושרת','מסגרת']){
    const mm=txt.match(new RegExp(lab+'[\\s:\\u00a0\\u20aa]{0,12}(-?[\\d,]+(?:\\.\\d{1,2})?)'));
    if(mm){const n=Number(String(mm[1]).replace(/,/g,''));if(Number.isFinite(n))return n}}
  return null};
let creditLimit=creditFrom(home.text),balance=home.transactions[0].balance;
    if(balance==null)throw Error('יתרת העו״ש לא נקראה מהתנועה האחרונה');

    await chrome.storage.local.set({syncStatus:'יהב: קורא הלוואות ופירוט ריבית'});
    await yahavOpenLoans(tabId);
    let list=await yahavRead(tabId),loans=list.loans||[];
    for(let i=0;i<16&&!loans.length;i++){await delay(400);list=await yahavRead(tabId);loans=list.loans||[]}
    if(loans.length){const clicked=await chrome.scripting.executeScript({target:{tabId},func:()=>{const clean=v=>String(v||'').replace(/\s+/g,' ').trim(),rows=[...document.querySelectorAll('[role="row"],tr')],loanRow=rows.find(r=>{const cells=[...r.querySelectorAll('[role="gridcell"],td')];return cells.length>=6&&!/סוג האשראי/.test(clean(r.textContent))}),link=[...document.querySelectorAll('a')].find(x=>clean(x.textContent).includes('קישור לעמוד'))||loanRow?.querySelector('a,button,[role="button"]');if(link){link.click();return true}if(loanRow){loanRow.click();return true}return false}});if(!clicked.some(x=>x.result))throw Error('שורת ההלוואה לא נפתחה');let d=null;for(let i=0;i<20;i++){await delay(350);await prepareYahav(tabId);const details=await yahavRead(tabId);if(details.detail?.balance!=null&&details.detail?.endDate){d=details.detail;break}}if(!d)throw Error('פירוט ההלוואה לא נטען לאחר לחיצה');loans[0]={...loans[0],...Object.fromEntries(Object.entries(d).filter(([,v])=>v!==''&&v!=null)),...yahavInstallments(d.startDate,d.nextPaymentDate,d.endDate)}}

    /* ⚠⚠ 25.08.2026 — טל: „הרצתי, נעלמה המסגרת."
       **המסגרת לא נשברה — היא נמחקה.** הרשומה נבנית מחדש בכל סנכרון,
       ולכן קריאה שלא מצאה מסגרת דרסה את הערך הידוע ב-null.
       ⚠ נמדד מן האחסון: הפרוב החזיר `near:[]` — כלומר סריקה של **כל**
       אלמנט-עלה בדף לא מצאה את המחרוזת „מסגרת" ולו פעם אחת.
       `document.body.innerText` פשוט אינו מכיל אותה ברגע הקריאה,
       **ולכן שום רגקס לא היה עוזר.** זה גם מסביר למה „עבד בעבר":
       תלוי במסך שבו הדף נמצא, לא בקוד.
       הכלל כאן: **ערך ידוע אינו נמחק בגלל קריאה שנכשלה** — אותו כלל
       של „כרטיס מחוק לא יחזור מהסנכרון", בכיוון ההפוך. */
    const prevYahav=((await chrome.storage.local.get({accounts:[]})).accounts||[]).find(a=>a&&a.source==='yahav'&&String(a.accountNumber)===String(account.accountNumber));
    let creditKept=false;
    if(creditLimit==null&&prevYahav&&prevYahav.creditLimit!=null){creditLimit=prevYahav.creditLimit;creditKept=true}
    const now=new Date().toISOString(),selectionKey=`yahav|${account.branch}-${account.accountNumber}`,availableCredit=creditLimit==null?null:balance+creditLimit;
    const row={...account,nickname:home.owner||'טל',owner:home.owner||'טל',balance,creditLimit,availableCredit,transactions:home.transactions,loans,source:'yahav',sourceLabel:'יהב',selectionKey,id:`yahav-${account.branch}-${account.accountNumber}`,lastSync:now,status:'מסונכרן'};
    const state=await chrome.storage.local.get({accounts:[],selectedAccountKeys:[],accountKinds:{}}),accounts=[...state.accounts.filter(a=>a.source!=='yahav'),row],selectedAccountKeys=[...new Set([...state.selectedAccountKeys.filter(k=>!String(k).startsWith('yahav|')),selectionKey])],accountKinds={...state.accountKinds,[selectionKey]:'private'};
    await chrome.storage.local.set({accounts,selectedAccountKeys,accountKinds,accountFilter:'both',pendingYahav:false,
  /* ⚠ פרוב שאומר **באיזה מסך היינו**, לא רק מה לא נמצא. */
  yahavTextProbe:{at:now,len:String(home.text||'').length,
    hasMasgeret:String(home.text||'').indexOf('מסגרת')>=0,
    hasOshRow:String(home.text||'').indexOf('חשבון עו״ש')>=0,
    creditLimit,creditKept,head:String(home.text||'').slice(0,220)},

  // ⚠ גם בסיום — מוחקים רק את יהב, לא את הבורר של בנקים אחרים.
  discoveredAccounts:(await chrome.storage.local.get({discoveredAccounts:[]})).discoveredAccounts.filter(a=>a&&a.source!=='yahav'),
  syncStatus:`יהב: הסנכרון הסתיים — ${home.transactions.length} תנועות ו־${loans.length} הלוואות`,lastAutoSync:now});
    if(!autoBusy)await chrome.runtime.openOptionsPage();
  }catch(e){await chrome.storage.local.set({syncStatus:`שגיאה ביהב: ${e.message}`});if(!autoBusy)await chrome.runtime.openOptionsPage()}finally{yahavBusy=false;await restoreSyncTabs()}
}
