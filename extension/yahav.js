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
let yahavBusy=false;
async function yahavTab(){const tabs=await chrome.tabs.query({url:['https://digital.yahav.co.il/*']});return tabs.find(t=>t.url?.includes('/app/index.html'))||null}
async function prepareYahav(tabId){await delay(650);try{const p=await chrome.tabs.sendMessage(tabId,{type:'PING'});if(p?.ok)return}catch{}await chrome.scripting.executeScript({target:{tabId},files:['yahav-content.js']});await delay(250)}
async function yahavRead(tabId){await prepareYahav(tabId);const tab=await chrome.tabs.get(tabId),waitForTransactions=tab.url?.includes('#/main/home'),attempts=waitForTransactions?24:1;let r=null;for(let i=0;i<attempts;i++){try{r=await chrome.tabs.sendMessage(tabId,{type:'YAHAV_READ'});if(r?.ok&&(!waitForTransactions||r.transactions?.length))return r}catch{}await delay(500)}if(r?.ok)return r;throw Error('לא ניתן לקרוא את דף יהב')}
async function readYahavTotals(tabId){for(let attempt=0;attempt<24;attempt++){const reads=await chrome.scripting.executeScript({target:{tabId},func:()=>{const clean=v=>String(v||'').replace(/[\u200e\u200f\u202a-\u202e]/g,'').replace(/\s+/g,' ').trim(),num=v=>{const m=clean(v).replace(/[−–]/g,'-').match(/-?[\d,]+(?:\.\d{1,2})?/);if(!m)return null;const n=Number(m[0].replace(/,/g,''));return Number.isFinite(n)?n:null};let balance=null,creditLimit=null,loanBalance=null;for(const row of document.querySelectorAll('table [role="row"],table tr')){const c=[...row.querySelectorAll('[role="gridcell"],td')].map(x=>clean(x.innerText));if(c[0]==='חשבון עו״ש'&&balance==null)balance=num(c[1]);if(c[0]==='הלוואות'&&loanBalance==null)loanBalance=num(c[1])}const text=clean(document.body?.innerText),m=text.match(/מסגרת אשראי\s+([\d,.]+)/);if(m)creditLimit=num(m[1]);return{balance,creditLimit,loanBalance,heading:document.querySelector('h1')?.innerText||''}}});const value=reads[0]?.result;if(value?.balance!=null)return value;await delay(450)}throw Error('ריכוז היתרות לא נטען')}
async function yahavRoute(tabId,hash){await chrome.tabs.update(tabId,{active:true});const clicked=await chrome.scripting.executeScript({target:{tabId},args:[hash],func:(route)=>{const links=[...document.querySelectorAll('a[href]')],exact=links.find(a=>a.getAttribute('href')===`#${route}`),loose=links.find(a=>String(a.getAttribute('href')||'').replace(/\/$/,'')===`#${route}`.replace(/\/$/,'')),target=exact||loose;if(target){target.click();return true}location.hash=route;return false}});await delay(clicked.some(x=>x.result)?1700:2600);await prepareYahav(tabId)}
function yahavInstallments(startDate,nextDate,endDate){const parse=v=>{const m=String(v||'').match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);return m?{d:+m[1],m:+m[2],y:+m[3]}:null},s=parse(startDate),n=parse(nextDate),e=parse(endDate);if(!s||!n||!e)return{};const total=(e.y-s.y)*12+e.m-s.m+1,remaining=(e.y-n.y)*12+e.m-n.m+1;if(total<=0||remaining<=0||remaining>total)return{};return{installments:`${remaining}/${total}`,remainingInstallments:remaining,totalInstallments:total}}
async function startYahav(){await chrome.storage.local.set({pendingYahav:true,discoveredAccounts:[],syncStatus:'יהב: בודק את החיבור'});const tab=await yahavTab();if(!tab){await chrome.storage.local.set({syncStatus:'ממתין להתחברות ליהב'});await chrome.tabs.create({url:YAHAV_ROOT,active:true});return{ok:true,status:'waiting_login'}}await chrome.storage.local.set({pendingYahav:false,syncStatus:'יהב: מרענן את החיבור'});await chrome.tabs.update(tab.id,{active:true});await chrome.tabs.reload(tab.id);await delay(3000);await chrome.storage.local.set({pendingYahav:true,syncStatus:'יהב: החיבור מוכן, מתחיל סנכרון'});runYahav(tab.id).catch(async e=>{await chrome.storage.local.set({pendingYahav:false,syncStatus:`שגיאה ביהב: ${e.message}`});await chrome.runtime.openOptionsPage()});return{ok:true,status:'syncing'}}
async function yahavOpenLoans(tabId){await yahavRoute(tabId,'/main/home');const clicked=await chrome.scripting.executeScript({target:{tabId},func:()=>{const clean=v=>String(v||'').replace(/\s+/g,' ').trim(),a=[...document.querySelectorAll('a[href]')].find(x=>clean(x.textContent)==='הלוואות וערבויות');if(!a)return false;a.click();return true}});if(!clicked.some(x=>x.result))throw Error('הקישור הראשי להלוואות וערבויות לא נמצא בדף הבית');await delay(1800);await prepareYahav(tabId)}
async function runYahav(tabId){
  if(yahavBusy)return; yahavBusy=true;
  try{
    await chrome.storage.local.set({syncStatus:'יהב: מגדיר טווח של 3 חודשים וקורא תנועות'});
    await yahavRoute(tabId,'/main/accounts/current/');
    const range=await chrome.tabs.sendMessage(tabId,{type:'YAHAV_SET_3_MONTHS'});
    if(!range?.ok)throw Error('לא ניתן היה להגדיר טווח של שלושה חודשים');
    await delay(2800);
    const home=await yahavRead(tabId),account=home.account;
    if(!account)throw Error('לא זוהה מספר החשבון הפעיל');
    if(!home.transactions?.length)throw Error('לא נקראו תנועות עו״ש');

    const creditMatch=String(home.text||'').match(/מסגרת אשראי\s+([\d,.]+)/),creditLimit=creditMatch?Number(creditMatch[1].replace(/,/g,'')):null,balance=home.transactions[0].balance;
    if(balance==null)throw Error('יתרת העו״ש לא נקראה מהתנועה האחרונה');

    await chrome.storage.local.set({syncStatus:'יהב: קורא הלוואות ופירוט ריבית'});
    await yahavOpenLoans(tabId);
    let list=await yahavRead(tabId),loans=list.loans||[];
    for(let i=0;i<16&&!loans.length;i++){await delay(400);list=await yahavRead(tabId);loans=list.loans||[]}
    if(loans.length){const clicked=await chrome.scripting.executeScript({target:{tabId},func:()=>{const clean=v=>String(v||'').replace(/\s+/g,' ').trim(),rows=[...document.querySelectorAll('[role="row"],tr')],loanRow=rows.find(r=>{const cells=[...r.querySelectorAll('[role="gridcell"],td')];return cells.length>=6&&!/סוג האשראי/.test(clean(r.textContent))}),link=[...document.querySelectorAll('a')].find(x=>clean(x.textContent).includes('קישור לעמוד'))||loanRow?.querySelector('a,button,[role="button"]');if(link){link.click();return true}if(loanRow){loanRow.click();return true}return false}});if(!clicked.some(x=>x.result))throw Error('שורת ההלוואה לא נפתחה');let d=null;for(let i=0;i<20;i++){await delay(350);await prepareYahav(tabId);const details=await yahavRead(tabId);if(details.detail?.balance!=null&&details.detail?.endDate){d=details.detail;break}}if(!d)throw Error('פירוט ההלוואה לא נטען לאחר לחיצה');loans[0]={...loans[0],...Object.fromEntries(Object.entries(d).filter(([,v])=>v!==''&&v!=null)),...yahavInstallments(d.startDate,d.nextPaymentDate,d.endDate)}}

    const now=new Date().toISOString(),selectionKey=`yahav|${account.branch}-${account.accountNumber}`,availableCredit=creditLimit==null?null:balance+creditLimit;
    const row={...account,nickname:home.owner||'טל',owner:home.owner||'טל',balance,creditLimit,availableCredit,transactions:home.transactions,loans,source:'yahav',sourceLabel:'יהב',selectionKey,id:`yahav-${account.branch}-${account.accountNumber}`,lastSync:now,status:'מסונכרן'};
    const state=await chrome.storage.local.get({accounts:[],selectedAccountKeys:[],accountKinds:{}}),accounts=[...state.accounts.filter(a=>a.source!=='yahav'),row],selectedAccountKeys=[...new Set([...state.selectedAccountKeys.filter(k=>!String(k).startsWith('yahav|')),selectionKey])],accountKinds={...state.accountKinds,[selectionKey]:'private'};
    await chrome.storage.local.set({accounts,selectedAccountKeys,accountKinds,accountFilter:'both',pendingYahav:false,discoveredAccounts:[],syncStatus:`יהב: הסנכרון הסתיים — ${home.transactions.length} תנועות ו־${loans.length} הלוואות`,lastAutoSync:now});
    if(!autoBusy)await chrome.runtime.openOptionsPage();
  }finally{yahavBusy=false}
}
