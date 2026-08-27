(()=>{
// שומר הזרקה עמיד למות הקשר — ראה discount-content.js
if(window.__poalimSyncLoaded){try{if(window.__poalimSyncLoaded())return}catch(e){}}
// ⚠ ההפניה נתפסת כאן ולא נקראת מחדש בכל בדיקה: קריאה מחדש
// מחזירה את ה-chrome החדש, והגשש מדווח „חי" גם כשההקשר שלו מת. נתפס בבדיקה.
const __rt__poalimSyncLoaded=(()=>{try{return chrome.runtime}catch(e){return null}})();
window.__poalimSyncLoaded=()=>{try{return !!(__rt__poalimSyncLoaded&&__rt__poalimSyncLoaded.id)}catch(e){return false}};

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if(message?.type==='PING'){sendResponse({ok:true});return}
  if (message?.type === 'EXTRACT_ACCOUNT') extractAccount(message.account).then(sendResponse).catch(error => sendResponse({ ok: false, error: error.message }));
  else if(message?.type==='EXTRACT_ALL_ACCOUNTS')extractAllAccounts().then(sendResponse).catch(error=>sendResponse({ok:false,error:error.message}));
  else if(message?.type==='DISCOVER_ACCOUNTS')discoverAccounts().then(accounts=>sendResponse({ok:true,accounts})).catch(error=>sendResponse({ok:false,error:error.message}));
  else if(message?.type==='EXTRACT_SELECTED')extractSelected(message.keys||[]).then(accounts=>sendResponse({ok:true,accounts})).catch(error=>sendResponse({ok:false,error:error.message}));
  else if(message?.type==='EXTRACT_BALANCE_SUMMARIES')extractBalanceSummaries(message.keys||[]).then(accounts=>sendResponse({ok:true,accounts})).catch(error=>sendResponse({ok:false,error:error.message}));
  else if(message?.type==='EXTRACT_PRODUCT_DETAILS')extractProductDetails(message.keys||[],message.kind).then(accounts=>sendResponse({ok:true,accounts})).catch(error=>sendResponse({ok:false,error:error.message}));
  else if(message?.type==='EXTRACT_OWNER'){sendResponse({ok:true,owner:extractOwnerName()});return}
  else return;
  return true;
});

let lastAuthenticatedPath='';
function reportAuthenticated(){
  if((location.pathname.includes('/ng-portals/biz/')||location.pathname.includes('/ng-portals/rb/'))&&location.pathname!==lastAuthenticatedPath){
    lastAuthenticatedPath=location.pathname;
    chrome.runtime.sendMessage({type:'AUTHENTICATED'}).catch(()=>{});
  }
}
reportAuthenticated();
setInterval(reportAuthenticated,750);
window.addEventListener('popstate',reportAuthenticated);

async function extractAllAccounts(){
  const found=await discoverAccounts();return{ok:true,accounts:await extractSelected(found.map(a=>a.key))};
}
function extractOwnerName(){
  const hello=[...document.querySelectorAll('h1,h2,h3,[role="heading"]')].find(el=>el.textContent.replace(/\s+/g,' ').trim()==='שלום');
  if(!hello)return'';
  let node=hello.nextElementSibling;
  while(node){const text=node.textContent.replace(/\s+/g,' ').trim();if(text&&!/ביקורך האחרון/.test(text)&&text.length<100)return text;node=node.nextElementSibling}
  const parentText=hello.parentElement?.innerText?.split('\n').map(x=>x.trim()).filter(Boolean)||[];return parentText.find(x=>x!=='שלום'&&!/ביקורך האחרון/.test(x))||'';
}
async function discoverAccounts(){
  const chooser=findAccountChooser();if(!chooser)throw new Error('לא נמצא בורר החשבונות בדף. ודא שאתה בדף תנועות בחשבון.');
  const currentLabel=chooser.textContent.replace(/\s+/g,' ').trim(),currentMatch=currentLabel.match(/(\d+)\s*-\s*(\d+)/);
  if(chooser.disabled&&currentMatch)return[{key:`${currentMatch[1]}-${currentMatch[2]}`,branch:currentMatch[1],accountNumber:currentMatch[2],nickname:`חשבון ${currentMatch[2]}`}];
  chooser.click();await wait(450);
  const labels=[...document.querySelectorAll('[role="option"], [role="listbox"] li')].map(el=>el.textContent.replace(/\s+/g,' ').trim()).filter(label=>/\d+\s*-\s*\d+/.test(label));
  document.body.click();if(!labels.length)throw new Error('לא נמצאו חשבונות זמינים למשתמש.');return[...new Set(labels)].map(label=>{const m=label.match(/(\d+)\s*-\s*(\d+)/);return m?{key:`${m[1]}-${m[2]}`,branch:m[1],accountNumber:m[2],nickname:label.replace(m[0],'').replace(/^[\s,]+/,'')||`חשבון ${m[2]}`} : null}).filter(Boolean);
}
async function extractSelected(keys){
  if(!findAccountChooser())throw new Error('לא נמצא בורר החשבונות');const accounts=[];
  for(const key of keys){
    const match=String(key).match(/(\d+)\s*-\s*(\d+)/);if(!match)continue;const branch=match[1],accountNumber=match[2],expected=normalize(`${branch}-${accountNumber}`);
    let chooser=findAccountChooser();if(!chooser)throw new Error('בורר החשבונות נעלם מהדף');
    if(!normalize(chooser.textContent).includes(expected)){chooser.click();await wait(350);const option=[...document.querySelectorAll('[role="option"], [role="listbox"] li')].find(el=>normalize(el.textContent).includes(expected));if(!option)throw new Error(`החשבון ${branch}-${accountNumber} נעלם מהבורר.`);option.click();await waitFor(()=>{const fresh=findAccountChooser();return fresh&&normalize(fresh.textContent).includes(expected)},12000,`לא ניתן לבחור חשבון ${branch}-${accountNumber}.`);await wait(1100)}
    chooser=findAccountChooser();if(!chooser||!normalize(chooser.textContent).includes(expected))throw new Error(`אימות חשבון ${branch}-${accountNumber} נכשל.`);// יתרה חסרה אינה מפילה את הסנכרון. קודם המתנה לרינדור, ואם עדיין אין —
// החשבון נשמר עם balance:null ומסומן; דף ריכוז היתרות ממלא אותה בהמשך ב-syncSource.
    let balance=extractBalance();
    if(balance===null){try{await waitFor(()=>extractBalance()!==null,3000,'')}catch{}balance=extractBalance()}
    const rows=extractTransactions();
    const label=chooser.textContent.replace(/\s+/g,' ').trim();accounts.push({branch,accountNumber,nickname:label.replace(new RegExp(`${branch}\\s*-\\s*${accountNumber}`),'').replace(/^[\s,]+/,'')||`חשבון ${accountNumber}`,verifiedLabel:label,balance,balanceMissing:balance===null,transactions:rows,txProbe:rows.length?'':txFingerprint()});
  }
  return accounts;
}

async function extractBalanceSummaries(keys){
  if(!findAccountChooser())throw new Error('לא נמצא בורר החשבונות בריכוז היתרות');
  const accounts=[];
  for(const key of keys){
    const match=String(key).match(/(\d+)\s*-\s*(\d+)/);if(!match)continue;
    const branch=match[1],accountNumber=match[2],expected=normalize(`${branch}-${accountNumber}`);
    await selectAccount(expected,`${branch}-${accountNumber}`);
    const chooser=findAccountChooser();
    const verifiedLabel=chooser?.textContent?.replace(/\s+/g,' ').trim()||'';
    const summary=extractBalanceSummary();
    accounts.push({key:`${branch}-${accountNumber}`,verifiedLabel,...summary});
  }
  return accounts;
}

async function selectAccount(expected,display){
  let chooser=findAccountChooser();if(!chooser)throw new Error('בורר החשבונות נעלם מהדף');
  if(!normalize(chooser.textContent).includes(expected)){
    chooser.click();await wait(350);
    const option=[...document.querySelectorAll('[role="option"], [role="listbox"] li')].find(el=>normalize(el.textContent).includes(expected));
    if(!option)throw new Error(`החשבון ${display} אינו מופיע בריכוז היתרות.`);
    option.click();
    await waitFor(()=>{const fresh=findAccountChooser();return fresh&&normalize(fresh.textContent).includes(expected)},12000,`לא ניתן לבחור חשבון ${display} בריכוז היתרות.`);
    await wait(1300);
  }
  chooser=findAccountChooser();
  if(!chooser||!normalize(chooser.textContent).includes(expected))throw new Error(`אימות חשבון ${display} נכשל בריכוז היתרות.`);
}

function extractBalanceSummary(){
  const products=[];
  for(const table of document.querySelectorAll('table')){
    const heading=table.querySelector('caption h1,caption h2,caption h3')?.textContent?.replace(/\s+/g,' ').trim();
    if(!heading)continue;
    const captionText=table.querySelector('caption')?.textContent?.replace(/\s+/g,' ').trim()||'';
    const totalMatch=captionText.match(/סה["״']?כ\s*([‎\-−–]?\s*[\d,]+(?:\.\d{1,2})?)/);
    const rows=[...table.querySelectorAll('tbody tr')].map(row=>{
      const cells=[...row.querySelectorAll('td')].map(cell=>cell.innerText.replace(/\s+/g,' ').trim());
      if(cells.length<2)return null;
      const amount=parseMoney(cells[cells.length-1]);
      if(amount===null)return null;
      return {name:cells[0],date:cells.find(x=>/\d{2}\/\d{2}\/\d{2,4}/.test(x))||'',amount};
    }).filter(Boolean);
    if(rows.length||totalMatch)products.push({category:heading,total:totalMatch?parseMoney(totalMatch[1]):rows.reduce((s,r)=>s+r.amount,0),items:rows});
  }
  const bodyText=document.body.innerText.replace(/\s+/g,' ');
  const netMatch=bodyText.match(/סה["״']?כ נכסים[^\n]*?([‎\-−–]?\s*[\d,]+(?:\.\d{1,2})?)\s*₪/);
  const nearMatch=bodyText.match(/סה["״']?כ חיובים קרובים:\s*([\d,]+(?:\.\d{1,2})?)/);
  const checking=products.flatMap(p=>p.items||[]).find(i=>/עו["״']?ש/.test(i.name));
  const checkingTable=[...document.querySelectorAll('table')].find(t=>/חשבונות שוטפים/.test(t.querySelector('caption')?.innerText||''));
  const checkingRow=checkingTable?[...checkingTable.querySelectorAll('tbody tr')].find(r=>/עו["״']?ש/.test(r.innerText)):null;
  const checkingCells=checkingRow?[...checkingRow.querySelectorAll('td')].map(c=>c.innerText.replace(/\s+/g,' ').trim()):[];
  const creditLimit=checkingCells.length>=4?parseMoney(checkingCells[checkingCells.length-2]):null;
  const checkingBalance=checking?.amount??(checkingCells.length?parseMoney(checkingCells[checkingCells.length-1]):null);
  const availableCredit=creditLimit==null||checkingBalance==null?null:creditLimit+checkingBalance;
  return {netBalance:netMatch?parseMoney(netMatch[1]):null,upcomingCardCharges:nearMatch?parseMoney(nearMatch[1]):null,creditLimit,availableCredit,products};
}

async function extractProductDetails(keys,kind){
  const accounts=[];
  for(const key of keys){
    const match=String(key).match(/(\d+)\s*-\s*(\d+)/);if(!match)continue;
    const display=`${match[1]}-${match[2]}`,expected=normalize(display);
    await selectAccount(expected,display);
    accounts.push({key:display,[kind]:kind==='cards'?extractCardDetails():await extractLoanDetails()});
  }
  return accounts;
}

async function extractLoanDetails(){
  const table=[...document.querySelectorAll('table')].find(t=>/סוג אשראי/.test(t.innerText)&&/יתרה משוערכת/.test(t.innerText));
  if(!table)return[];
  const headerRow=[...table.querySelectorAll('tr')].find(row=>/סוג אשראי/.test(row.innerText)&&/יתרה משוערכת/.test(row.innerText));
  const headers=[...(headerRow?.children||[])].map(cell=>cell.innerText.replace(/\s+/g,' ').trim());
  const interestIndex=headers.findIndex(header=>/ריבית/.test(header));
  const rows=[...table.querySelectorAll('tbody tr')].filter(row=>{
    const cells=[...row.querySelectorAll(':scope > td')];return cells.length>=7&&!/לא נמצאו/.test(row.innerText);
  });
  const loans=[];
  for(const row of rows){
    const cells=[...row.querySelectorAll('td')].map(cell=>cell.innerText.replace(/\s+/g,' ').trim());
    if(cells.length<5)continue;
    const interestFromCell=interestIndex>=0?(cells[interestIndex]||''):'';
    let interest=interestFromCell||cells.find(value=>/%/.test(value)&&!/^\d{1,2}\/\d{1,2}\//.test(value))||'';
    // הפירוט שמתחת לשורה נפתח פעם אחת ומשמש לשני השדות.
    let detailText='';
    const detail=async()=>{if(detailText)return detailText;row.querySelector(':scope > td:last-child')?.click();await wait(250);detailText=(row.nextElementSibling?.innerText||row.parentElement?.innerText||'').replace(/\s+/g,' ');return detailText};
    if(!interest)interest=((await detail()).match(/ריבית נוכחית\s*([0-9.]+\s*%)/)||[])[1]||'';
    // ⚠ "תשלום קרן:63מתוך71" — 63 הוא מספר התשלומים שנותרו, לא ששולמו.
    // אומת על שתי הלוואות 16.08.2026: 71-63=8 ו-71-66=5, בדיוק מספר החודשים שחלפו.
    // הדשבורד מצפה ל-paid/total, לכן מחסרים.
    const pay=(await detail()).match(/תשלום\s*קרן\s*:?\s*(\d+)\s*מתוך\s*(\d+)/)||(await detail()).match(/תשלום\s*ריבית\s*:?\s*(\d+)\s*מתוך\s*(\d+)/);
    const installments=pay&&Number(pay[2])>=Number(pay[1])?`${Number(pay[2])-Number(pay[1])}/${Number(pay[2])}`:'';
    loans.push({type:cells[0],startDate:cells[1]||'',endDate:cells[2]||'',originalPrincipal:parseMoney(cells[3]),balance:parseMoney(cells[4]),nextPayment:parseMoney(cells[5]),nextPaymentDate:cells[6]||'',interest,installments});
  }
  return loans;
}

function extractCardDetails(){
  const cards=[];
  const seen=new Set();
  for(const table of document.querySelectorAll('table')){
    if(!/בית עסק/.test(table.innerText)||!/סכום חיוב/.test(table.innerText))continue;
    const scope=table.closest('li')||table.parentElement;
    const exportLink=scope?.querySelector('a[href*="cardSuffix="]')||table.parentElement?.querySelector('a[href*="cardSuffix="]');
    const suffix=new URL(exportLink?.href||location.href).searchParams.get('cardSuffix')||((scope?.innerText||'').match(/\b\d{4}\b/)||[])[0]||'';
    const scopeText=(scope?.innerText||'').replace(/\s+/g,' ');
    const dateAmount=scopeText.match(/חיוב לתאריך\s*(\d{2}\/\d{2}\/\d{2,4})\s*([\d,]+(?:\.\d{1,2})?)/);
    const transactions=[...table.querySelectorAll('tbody tr')].map(row=>{const c=[...row.querySelectorAll('td')].map(x=>x.innerText.replace(/\s+/g,' ').trim());return c.length>=3&&/\d{2}\/\d{2}\/\d{2,4}/.test(c[0])?{date:c[0],merchant:c[1],amount:parseMoney(c[2]),payments:c[3]||''}:null}).filter(Boolean);
    const id=`bank-${suffix}-${dateAmount?.[1]||''}`;if(seen.has(id))continue;seen.add(id);
    cards.push({suffix,name:(scopeText.match(new RegExp(`${suffix}\\s+([^₪]{2,40}?)(?:חיוב קודם|חיוב לתאריך)`))||[])[1]?.trim()||'כרטיס בנקאי',issuer:'בנק הפועלים',chargeDate:dateAmount?.[1]||'',amount:dateAmount?parseMoney(dateAmount[2]):transactions.reduce((s,t)=>s+(t.amount||0),0),transactions});
  }
  const text=document.body.innerText.replace(/\s+/g,' ');
  const external=/\b(\d{4})\s+(ישראכרט|MAX|מקס|כאל)[\s\S]{0,180}?חיוב לתאריך\s*(\d{2}\/\d{2}\/\d{2,4})\s*₪?\s*([\d,]+(?:\.\d{1,2})?)/g;
  for(const m of text.matchAll(external)){const id=`external-${m[1]}-${m[3]}`;if(seen.has(id))continue;seen.add(id);cards.push({suffix:m[1],name:`כרטיס חוץ בנקאי ${m[2]}`,issuer:m[2],chargeDate:m[3],amount:parseMoney(m[4]),transactions:[]})}
  const grouped=new Map();
  for(const card of cards){
    const key=`${card.issuer}-${card.suffix}`;
    if(!grouped.has(key)){grouped.set(key,{...card,transactions:[...(card.transactions||[])]});continue}
    const existing=grouped.get(key);existing.amount=(existing.amount||0)+(card.amount||0);existing.transactions.push(...(card.transactions||[]));
    if(card.chargeDate&&(!existing.chargeDate||toDateNumber(card.chargeDate)>toDateNumber(existing.chargeDate)))existing.chargeDate=card.chargeDate;
  }
  return [...grouped.values()];
}
function toDateNumber(value){const m=String(value||'').match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);if(!m)return 0;let y=Number(m[3]);if(y<100)y+=2000;return new Date(y,Number(m[2])-1,Number(m[1])).getTime()}

async function extractAccount(account) {
  const expected = normalize(`${account.branch}-${account.accountNumber}`);
  const chooser = findByTextOrAria('בחירת חשבון', '[role="combobox"],button');
  if (!chooser) throw new Error('לא נמצא בורר החשבונות בדף.');

  if (!normalize(chooser.textContent).includes(expected)) {
    chooser.click();
    await wait(350);
    const candidates = [...document.querySelectorAll('[role="option"], [role="listbox"] li')];
    const option = candidates.find(el => normalize(el.textContent).includes(expected));
    if (!option) throw new Error(`החשבון ${account.branch}-${account.accountNumber} אינו מופיע בהרשאות המשתמש.`);
    option.click();
    await waitFor(() => normalize(chooser.textContent).includes(expected), 9000, 'האתר לא עבר לחשבון המבוקש.');
    await wait(900);
  }

  const verifiedLabel = chooser.textContent.replace(/\s+/g, ' ').trim();
  if (!normalize(verifiedLabel).includes(expected)) throw new Error('אימות החשבון נכשל; לא נקראו נתונים.');

  const balance = extractBalance();
  if (balance === null) throw new Error('לא נמצאה יתרת החשבון.');
  const transactions = extractTransactions();
  return { ok: true, balance, transactions, verifiedLabel, accountKey: expected };
}

function extractBalance() {
  const labels = [...document.querySelectorAll('body *')].filter(el => directTextOnly(el).trim()==='יתרה בחשבון');
  for (const label of labels) {
    let scope=label.closest('li');
    if(!scope)scope=label.parentElement;
    for(let i=0;i<4&&scope;i++,scope=scope.parentElement){
      const text=scope.innerText||'';const matches=text.match(/[-−‎]?\s*[\d,]+(?:\.\d{1,2})?/g)||[];
      const numbers=matches.map(parseMoney).filter(Number.isFinite);
      if(numbers.length)return numbers[0];
    }
  }
  return null;
}

// טביעת אצבע מבנית לדף התנועות, לשימוש כשלא נקראה ולו שורה אחת.
// ⚠ מבנה בלבד — ספירות וכותרות עמודות. אין כאן שום נתון פיננסי, ובכוונה:
// המשתמש מצלם את השורה הזו ושולח אותה.
function txFingerprint(){
  const n=s=>document.querySelectorAll(s).length;
  const heads=[...document.querySelectorAll('th,[role="columnheader"]')]
    .map(h=>(h.innerText||'').replace(/\s+/g,' ').trim()).filter(Boolean).slice(0,8);
  return `טבלאות:${n('table')} · grid:${n('[role="grid"]')} · role=row:${n('[role="row"]')} · tr:${n('tr')} · כותרות: ${heads.join(' | ')||'—'}`;
}
// קורא שני, לרשת שאינה <table>. נכתב 17.08.2026 אחרי שפועלים פרטי החזיר אפס תנועות
// בעוד הדף מציג אותן. הכותרות נמדדו מצילום של הדף: תאריך | הפעולה | חובה | זכות | יתרה בש"ח.
// ⚠ מיפוי לפי טקסט הכותרת ולא לפי היסט קבוע — הדפוס שכבר מוכח בלאומי. היסט קבוע
// נשבר ברגע שהבנק מוסיף עמודת אייקון, וכאן יש כאלה.
function gridTransactions(){
  const t=s=>String(s||'').replace(/[‎‏‪-‮]/g,'').replace(/\s+/g,' ').trim();
  const rows=[...document.querySelectorAll('[role="row"]')];
  const headRow=rows.find(r=>r.querySelector('[role="columnheader"]'));
  if(!headRow)return [];
  const heads=[...headRow.querySelectorAll('[role="columnheader"]')].map(h=>t(h.innerText));
  const at=re=>heads.findIndex(h=>re.test(h));
  const iDate=at(/תאריך/),iAction=at(/פעולה|תנועה|תיאור/),iDebit=at(/חובה/),iCredit=at(/זכות/),iBal=at(/יתרה/);
  if(iDate<0||iBal<0)return [];
  const out=[];
  for(const row of rows){
    if(row.querySelector('[role="columnheader"]'))continue;
    const cells=[...row.querySelectorAll('[role="cell"],[role="gridcell"]')].map(c=>t(c.innerText));
    if(!cells.length)continue;
    const date=(cells[iDate]||'').match(/\d{1,2}\/\d{1,2}\/\d{2,4}/);   // „ו׳ 14/08/26" → 14/08/26
    if(!date)continue;
    out.push({date:date[0],action:iAction<0?'':cells[iAction]||'',details:'',reference:'',
      debit:iDebit<0?null:parseMoney(cells[iDebit]),credit:iCredit<0?null:parseMoney(cells[iCredit]),
      balance:parseMoney(cells[iBal])});
  }
  return out.slice(0,100);
}
function extractTransactions() {
  const table = [...document.querySelectorAll('table')].find(t => /תאריך/.test(t.innerText) && /(חובה|זכות)/.test(t.innerText));
  if (!table) return gridTransactions();
  const fromTable = [...table.querySelectorAll('tbody tr, [role="rowgroup"] [role="row"]')].map(row => {
    const cells = [...row.querySelectorAll('td,[role="cell"]')].map(cell => cell.innerText.replace(/\s+/g, ' ').trim());
    if (cells.length < 5 || !/\d{2}\/\d{2}\/\d{2,4}/.test(cells[0])) return null;
    if(cells.length<7)return{date:(cells[0].match(/\d{2}\/\d{2}\/\d{2,4}/)||[])[0]||cells[0],action:cells[1]||'',details:'',reference:'',debit:parseMoney(cells[2]),credit:parseMoney(cells[3]),balance:parseMoney(cells[4])};
    return {
      date: cells[0],
      action: cells[1] || '',
      details: cells[2] || '',
      reference: cells[4] || '',
      debit: parseMoney(cells[cells.length - 3]),
      credit: parseMoney(cells[cells.length - 2]),
      balance: parseMoney(cells[cells.length - 1])
    };
  }).filter(Boolean).slice(0, 100);
  // טבלה שנמצאה אך לא הניבה שורות — עדיין ייתכן שהנתונים ברשת role שלצידה.
  return fromTable.length ? fromTable : gridTransactions();
}

function findByTextOrAria(text, selector) {
  return [...document.querySelectorAll(selector)].find(el => el.getAttribute('aria-label')?.includes(text) || directText(el).includes(text));
}
function findAccountChooser(){
  const controls=[...document.querySelectorAll('[role="combobox"],button,[aria-haspopup="listbox"]')];
  return controls.find(el=>/\d+\s*-\s*\d+/.test(el.innerText||el.textContent||''))
    || controls.find(el=>{const id=el.getAttribute('aria-labelledby');if(!id)return false;return id.split(/\s+/).some(x=>document.getElementById(x)?.textContent?.includes('בחירת חשבון'))})
    || controls.find(el=>el.getAttribute('aria-label')?.includes('בחירת חשבון'));
}
function directText(el) { return [...el.childNodes].filter(n => n.nodeType === Node.TEXT_NODE).map(n => n.textContent).join(' ').trim() || el.textContent?.trim() || ''; }
function directTextOnly(el){return[...el.childNodes].filter(n=>n.nodeType===Node.TEXT_NODE).map(n=>n.textContent).join(' ')}
function normalize(value) { return String(value || '').replace(/[\s,\-]/g, '').replace(/^0+/, ''); }
function parseMoney(value) { let text=String(value||'').replace(/[−–]/g,'-');const negative=text.includes('-');const clean=text.replace(/[₪\s,]/g,'').replace(/[^0-9.\-]/g,'');if(!clean||clean==='-')return null;const n=Number(clean.replace(/-/g,''));return Number.isFinite(n)?(negative?-n:n):null; }
function wait(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
async function waitFor(test, timeout, message) { const start=Date.now(); while(Date.now()-start<timeout){if(test())return;await wait(250)}throw new Error(message); }
})();
