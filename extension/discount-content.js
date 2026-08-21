(()=>{
const wait=ms=>new Promise(r=>setTimeout(r,ms));
// הזיהוי עובר בין הישויות ולוקח זמן; בלי משוב הוא נראה תקוע, וזה מה שקרה ב-0.19.
let lastSwitchErrors=[],lastTxProbe=null;
const note=t=>{try{chrome.runtime.sendMessage({type:'DISCOUNT_PROGRESS',text:t}).catch(()=>{})}catch{}};
const text=el=>(el?.innerText||el?.textContent||'').replace(/\s+/g,' ').trim();
const money=v=>{const s=String(v??'').replace(/[−–]/g,'-');const m=s.match(/-?[\d,]+(?:\.\d{1,2})?/);if(!m)return null;const n=Number(m[0].replace(/,/g,''));return Number.isFinite(n)?n:null};
// ⚠ לחיצה רגילה אינה פותחת את בורר הישויות — אותו כשל בדיוק כמו בלאומי. הרכיב מאזין
// לאירועי pointer, ובלי הרצף המלא התפריט נשאר סגור והזיהוי מדווח "לא זוהו ישויות".
function realClick(el){const o={bubbles:true,cancelable:true,composed:true,view:window,button:0,buttons:1,pointerId:1,pointerType:'mouse',isPrimary:true};try{el.scrollIntoView({block:'center'})}catch{}
for(const t of['pointerover','pointerenter','pointermove','pointerdown'])el.dispatchEvent(new PointerEvent(t,o));
el.dispatchEvent(new MouseEvent('mousedown',o));try{el.focus()}catch{}
el.dispatchEvent(new PointerEvent('pointerup',{...o,buttons:0}));el.dispatchEvent(new MouseEvent('mouseup',{...o,buttons:0}));
// לחיצה אחת בלבד. dispatchEvent('click') ואחריו el.click() הפעילו את מתג הבורר
// פעמיים: פתיחה ומיד סגירה, ולכן לא נמצאו אפשרויות אף שהן קיימות בדף.
el.dispatchEvent(new MouseEvent('click',{...o,buttons:0}));}
// ח.פ בן 9 ספרות בכל מקום בטקסט, ולא רק בתחילתו: אם התווית היא "שם החברה 123456789"
// העיגון לתחילת המחרוזת מפספס את כל הישויות.
const ENTITY=/\b\d{9}\b/;
const menuEntities=()=>[...document.querySelectorAll('[role="menu"] button,[role="menu"] [role="menuitem"],[role="menu"] li,[role="listbox"] [role="option"],[role="dialog"] button')].filter(b=>ENTITY.test(text(b)));
// צילום מצב לכשל, כדי שהתיקון הבא ייכתב ממדידה ולא מהשערה
function probe(){try{const f=s=>String(s||'').replace(/\s+/g,' ').trim();
return{url:location.href,menus:document.querySelectorAll('[role="menu"]').length,listboxes:document.querySelectorAll('[role="listbox"]').length,dialogs:document.querySelectorAll('[role="dialog"]').length,
trigger:f(text(entityButton())).slice(0,80),expanded:entityButton()?.getAttribute('aria-expanded'),
menuItems:[...document.querySelectorAll('[role="menu"] *,[role="listbox"] *')].map(el=>f(text(el))).filter(Boolean).slice(0,15),
nineDigit:[...new Set((f(document.body.innerText).match(/\b\d{9}\b/g)||[]))].slice(0,12),
buttons:[...document.querySelectorAll('button,[role="button"],[role="combobox"]')].map(b=>({t:f(text(b)).slice(0,60),pop:b.getAttribute('aria-haspopup'),exp:b.getAttribute('aria-expanded')})).filter(x=>x.t).slice(0,20),
head:f(document.body.innerText).slice(0,500)}}catch(e){return{probeError:e.message}}}
const entityButton=()=>{const all=[...document.querySelectorAll('button[aria-haspopup],[role="combobox"],button,[role="button"]')].filter(b=>ENTITY.test(text(b))&&!b.closest('[role="menu"],[role="listbox"],[role="dialog"]'));return all.find(b=>b.hasAttribute('aria-haspopup')||b.hasAttribute('aria-expanded'))||all[0]};
const entityId=v=>(String(v).match(/\b(\d{9})\b/)||[])[1]||'';
// ⚠ 18.08.2026 — נמדד מתוך discountProbe של הריצה שנכשלה, ולא שוחזר בהשערה:
//   trigger="024844714 טל רצבי" · expanded=true · menus=0 · listboxes=0 · menuItems=[]
//   ובטקסט הדף היו כל חמש הישויות. כלומר **הבורר נפתח, אבל האפשרויות אינן בתוך
//   role=menu/listbox** — ולכן menuEntities החזיר ריק ו„לא זוהו ישויות" הוצג.
// לכן נוספה נפילה לאחור רחבה: כל אלמנט לחיץ שמכיל מזהה בן 9 ספרות, שאינו הבורר
// עצמו ואינו עוטף מועמד אחר (הפנימי ביותר בלבד). המסלול המקורי נשאר ראשון.
const menuEntitiesLoose=()=>{
  const trigger=entityButton();
  const raw=[...document.querySelectorAll('button,[role="button"],[role="option"],[role="menuitem"],li,a,div[tabindex]')]
    .filter(el=>ENTITY.test(text(el))&&text(el).length<90&&el!==trigger&&!(trigger&&el.contains(trigger)));
  // הפנימי ביותר: אלמנט שמכיל מועמד אחר הוא מכולה, לא אפשרות.
  // ⚠ 21.08.2026 — **הוחזר.** דירוג שהעדיף a/button על li הפיל את הזיהוי כולו:
  // discoveredAccounts התרוקן ל-0 ו-discountDiscoverError רשם „לא השיב תוך 60 שניות".
  // הסינון הוצא; הטיפוס בשרשרת ב-selectEntity הוא המנגנון שעובד, והוא נשאר.
  return raw.filter(el=>!raw.some(other=>other!==el&&el.contains(other)));
};
async function entityOptions(){const trigger=entityButton();if(!trigger)throw Error('לא נמצא בורר הישויות בדיסקונט עסקי');
const already=menuEntities();if(already.length)return already;
realClick(trigger);
// ⚠ menus/listboxes נמדדו 0 בכל ריצה מאז 18.08 — 10 שניות המתנה כאן היו 40 שניות
// מבוזבזות על ארבע ישויות. שתי שניות מספיקות למסלול התקין, והנפילה לאחור מיד אחריו.
for(let i=0;i<8;i++){await wait(250);const opts=menuEntities();if(opts.length)return opts}
const loose=menuEntitiesLoose();if(loose.length)return loose;
return menuEntities()}
// ⚠ מעבר בין ישויות טוען מחדש את הדף והורג את ה-content script — הערוץ נסגר באמצע
// ('message channel closed'). לכן הזיהוי אינו עובר בין ישויות: הוא מונה אותן בלבד.
// מספר החשבון והיתרה נקראים בסנכרון, ישות אחת בכל קריאה.
async function ready(){for(let i=0;i<120;i++){const t=text(document.body);if(t.length>200&&ENTITY.test(t))return true;await wait(250)}return false}
async function discover(){if(!await ready())throw Error(`דף דיסקונט לא נטען בתוך 30 שניות (${text(document.body).length} תווים) — ייתכן שההתחברות פגה`);const options=await entityOptions(),entities=[],seen=new Set();for(const b of options){const label=text(b),id=entityId(label);if(id&&!seen.has(id)){seen.add(id);entities.push({id,owner:label.replace(ENTITY,'').replace(/\s{2,}/g,' ').trim()})}}const back=entityButton();if(back)realClick(back);if(!entities.length)throw Error('לא זוהו ישויות בחיבור דיסקונט עסקי');const here=activeAccount(),cur=entityId(text(entityButton()));return entities.map(e=>({key:e.id,entityId:e.id,nickname:e.owner,owner:e.owner,branch:e.id===cur?here.branch:'',accountNumber:e.id===cur?here.accountNumber:'',balance:null}))}
async function privateAccountOptions(){const trigger=document.querySelector('button.accountDropdownMenu,[role="combobox"].accountDropdownMenu');if(!trigger)throw Error('בורר החשבונות הפרטיים לא נמצא');if(!document.querySelector('[role="menu"] [role="radio"]'))realClick(trigger);for(let i=0;i<40;i++){await wait(250);const rows=[...document.querySelectorAll('[role="menu"] [role="radio"]')];if(rows.length)return rows}return[]}
const privateAccountFromRow=row=>{const parts=[...row.querySelectorAll('p')].map(text).filter(Boolean),raw=(parts[0]?.match(/\b\d{9,10}\b/)||[])[0]||'',full=raw.padStart(10,'0'),owner=parts[1]||'דיסקונט פרטי';return full?{key:`${full.slice(0,3)}-${full.slice(3)}`,nickname:owner,owner,branch:full.slice(0,3),accountNumber:full.slice(3),balance:null}:null};
async function discoverPrivate(){for(let i=0;i<120;i++){try{const rows=await privateAccountOptions(),accounts=rows.map(privateAccountFromRow).filter(Boolean);if(accounts.length)return accounts}catch{}await wait(250)}throw Error('רשימת החשבונות הפרטיים לא נמצאה לאחר ההתחברות')}
async function selectPrivateAccount(key){const wanted=String(key).replace(/\D/g,'').padStart(10,'0'),current=activeAccount();if(`${current.branch}${current.accountNumber}`===wanted)return;const rows=await privateAccountOptions(),row=rows.find(r=>{const a=privateAccountFromRow(r);return a&&`${a.branch}${a.accountNumber}`===wanted});if(!row)throw Error(`החשבון ${key} לא נמצא בבורר דיסקונט פרטי`);realClick(row);for(let i=0;i<50;i++){await wait(300);const a=activeAccount();if(`${a.branch}${a.accountNumber}`===wanted)return}throw Error(`דיסקונט לא עבר לחשבון ${key}`)}
// ⚠ 20.08.2026 — נמדד מ-discountEntityReport ולא שוחזר בהשערה: לשלוש הישויות
//   passes=2 · resolved=false · seenEntities=["024844714"] · selectError ריק.
//   כלומר הלחיצה על מועמד „הנפילה לאחור" מדווחת הצלחה, והאתר פשוט לא מחליף ישות:
//   האלמנט הפנימי ביותר שמכיל את המזהה הוא טקסט, לא הפקד הלחיץ.
//   לכן **לא מנחשים סלקטור** — מטפסים בשרשרת ההורים ומאמתים אחרי כל רמה,
//   ורושמים לאחסון איזו רמה עבדה, כדי שהסבב הבא ילך ישר לשם.
const clickChain=el=>{const out=[];let n=el;for(let i=0;i<5&&n&&n!==document.body;i++){out.push(n);n=n.parentElement}return out};
const entityNow=()=>entityId(text(entityButton()));
const idsIn=el=>new Set([...text(el).matchAll(/\b\d{9}\b/g)].map(m=>m[0])).size;
const brief=el=>`${el.tagName.toLowerCase()}${el.id?'#'+el.id:''}${(String(el.className||'').trim().split(/\s+/)[0]||'')?'.'+String(el.className).trim().split(/\s+/)[0]:''}`;
// המתנה אחרי לחיצה: הישות בבורר **וגם** מספר חשבון אחר. אם הבורר התחלף אבל
// המספר לא — נותנים לדף עוד חלון, ורק בסופו מקבלים החלפה בלי שינוי מספר.
async function switched(id,previous,ms){const until=Date.now()+ms;while(Date.now()<until){await wait(250);const account=activeAccount().accountNumber;if(entityNow()===id&&account&&account!==previous)return true}const account=activeAccount().accountNumber;return entityNow()===id&&!!account}
async function selectEntity(id){if(entityNow()===id)return;const previous=activeAccount().accountNumber,options=await entityOptions(),option=options.find(b=>entityId(text(b))===id);if(!option)throw Error(`הישות ${id} לא נמצאה בדיסקונט עסקי`);
const chain=clickChain(option),tried=[];
for(let level=0;level<chain.length;level++){const el=chain[level];
  // הורה שמכיל יותר ממזהה אחד הוא הרשימה כולה, לא האפשרות — לחיצה עליו תפגע במקום אחר.
  if(level&&idsIn(el)>1)break;
  tried.push(`${level}:${brief(el)}`);realClick(el);
  if(await switched(id,previous,3000)){try{chrome.storage.local.set({discountSelectWorked:{entity:id,level,path:brief(el),chain:tried,at:new Date().toISOString()}})}catch{}return}}
try{chrome.storage.local.set({discountSelectFailed:{entity:id,tried,seen:entityNow(),account:activeAccount().accountNumber,at:new Date().toISOString()}})}catch{}
throw Error(`דיסקונט לא עבר לישות ${id} — נוסו ${tried.length} רמות לחיצה (${tried.join(' | ')})`)}
function valueAfter(label){const nodes=[...document.querySelectorAll('button,p,div,span')].filter(el=>text(el).includes(label)).sort((a,b)=>text(a).length-text(b).length);for(const el of nodes){const own=money(text(el).slice(text(el).indexOf(label)+label.length));if(own!=null)return own;for(const near of [el.nextElementSibling,el.previousElementSibling,...(el.parentElement?.children||[])]){const n=money(text(near));if(n!=null)return n}}return null}
function activeAccount(){const body=text(document.body);const candidates=[...body.matchAll(/\b(\d{10})\b/g)].map(m=>m[1]);const visible=(body.match(/\b(\d{10})\s+[^\d\n]{2,60}/)||[])[1]||'';const full=visible||candidates[0]||entityId(text(entityButton()));return{branch:full.length>=10?full.slice(0,3):'',accountNumber:full.length>=10?full.slice(3):full}}
// לקח מלאומי: לא להניח <table>. קוראים גם רשת ARIA וגם טבלה אמיתית, ובוחרים את מה שיש.
const CELL='[role="cell"],[role="gridcell"]';
const DATEV=/\d{1,2}[.\/]\d{1,2}[.\/]\d{2,4}/;
function rowsOf(){const strips=[...document.querySelectorAll('div.rc-strip-row')].map(r=>({row:r,cells:leavesOf(r)})).filter(x=>x.cells.some(v=>TXDATE.test(v)));if(strips.length)return strips;const aria=[...document.querySelectorAll('[role="row"]')].map(r=>({row:r,cells:[...r.querySelectorAll(CELL)].map(text)}));
const html=[...document.querySelectorAll('table tr')].map(r=>({row:r,cells:[...r.querySelectorAll('td')].map(text)}));
const pick=aria.filter(x=>x.cells.length).length>=html.filter(x=>x.cells.length).length?aria:html;
return pick.filter(x=>x.cells.some(v=>DATEV.test(v)))}
// לקח מלאומי: לנווט לדף שממנו קוראים, ולא לקרוא מהדף שבמקרה פתוח.
// בדף הבית של דיסקונט אין תנועות — יש קישור 'לצפייה בתנועות עו"ש'.
// קביעת טווח לחודשיים אחורה. מנסה קודם בורר טווח מוכן, ואחרת ממלאת שדות תאריך.
// ⚠ דף התנועות של דיסקונט טרם נמדד — לכן כל ניסיון מתועד ב-rangeNote, ואם שניהם
// נכשלים הקריאה ממשיכה עם טווח ברירת המחדל במקום להיכשל.
let rangeNote='';
function setNative(el,value){const proto=el instanceof HTMLTextAreaElement?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;
const setter=Object.getOwnPropertyDescriptor(proto,'value')?.set;setter?setter.call(el,value):el.value=value;
for(const t of['input','change'])el.dispatchEvent(new Event(t,{bubbles:true}))}
const pad=n=>String(n).padStart(2,'0');
async function setRange(days=62){
const wanted=[/חודשיים/,/60 יום/,/3 חודשים|שלושה חודשים/,/רבעון/];
const clickable=[...document.querySelectorAll('button,[role="option"],[role="menuitem"],[role="radio"],label,a')];
for(const rx of wanted){const hit=clickable.find(el=>rx.test(text(el))&&text(el).length<40);
if(hit){realClick(hit);await wait(1800);rangeNote=`בורר טווח: ${text(hit).slice(0,30)}`;return true}}
const inputs=[...document.querySelectorAll('input[placeholder*="dd/mm" i],input[type="date"],input[placeholder*="תאריך"],input[name*="date" i],input[id*="date" i]')];
// ⚠ הטווח בדף כבר היה 01/05/2026 — רחב מחודשיים. הרחבה בלבד, אחרת נצמצם בטעות.
if(inputs.length>=2){const cur=String(inputs[0].value||'').match(/(\d{2})\/(\d{2})\/(\d{4})/);
if(cur){const curFrom=new Date(+cur[3],+cur[2]-1,+cur[1]);
if(curFrom.getTime()<=Date.now()-days*864e5){rangeNote=`טווח קיים רחב דיו: מ-${inputs[0].value}`;return true}}}
if(inputs.length>=2){const to=new Date(),from=new Date(to.getTime()-days*864e5);
const iso=d=>`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
const loc=d=>`${pad(d.getDate())}/${pad(d.getMonth()+1)}/${d.getFullYear()}`;
const fmt=el=>el.type==='date'?iso:loc;
setNative(inputs[0],fmt(inputs[0])(from));setNative(inputs[1],fmt(inputs[1])(to));
const go=clickable.find(el=>/^(הצג|חפש|עדכן|אישור|סנן)$/.test(text(el)));if(go)realClick(go);
await wait(2000);rangeNote=`שדות תאריך: ${loc(from)} — ${loc(to)}`;return true}
rangeNote='לא נמצא פקד טווח — נקרא טווח ברירת המחדל';return false}
async function openTransactions(){if(rowsOf().length){await setRange();return true}
const link=[...document.querySelectorAll('a,button,[role="button"],[role="link"]')].find(el=>/לצפייה בתנועות|תנועות עו"ש|תנועות עוש|עובר ושב/.test(text(el)));
if(link)realClick(link);
for(let i=0;i<80;i++){await wait(250);if(rowsOf().length){await setRange();for(let j=0;j<40;j++){await wait(250);if(rowsOf().length)break}return true}}return false}
function txProbe(){try{const f=t=>String(t||'').replace(/\s+/g,' ').trim();const rows=rowsOf();
return{url:location.href,rangeNote,tables:document.querySelectorAll('table').length,ariaRows:document.querySelectorAll('[role="row"]').length,
datedRows:rows.length,headers:[...document.querySelectorAll('[role="columnheader"],table th')].map(x=>f(x.innerText)).filter(Boolean).slice(0,15),
sample:rows.slice(0,3).map(r=>r.cells.map((v,i)=>i+'|'+v.slice(0,40))),
links:[...document.querySelectorAll('a,button')].map(el=>f(text(el))).filter(t=>t&&t.length<45).slice(0,25),
head:f(text(document.body)).slice(0,400)}}catch(e){return{probeError:e.message}}}
// נמדד חי ב-#/OSH_LENTRIES_ALTAMIRA: כל תנועה היא div.rc-strip-row ובתוכה ארבעה עלים —
// תאריך dd/MM/yy, תיאור, סכום חתום, יתרה. שורות הודעות הדואר נראות דומה אך חסר בהן ₪,
// ותאריכן בן ארבע ספרות שנה — לכן הסינון על ₪ מפריד ביניהן.
const TXDATE=/^\d{1,2}\/\d{1,2}\/\d{2}(?:\d{2})?$/;
const leavesOf=el=>[...el.querySelectorAll('*')].filter(x=>!x.children.length&&text(x)).map(text);
// ⚠ לדיסקונט שתי פריסות: מובייל (div.rc-strip-row) ודסקטופ (<tr> בטבלה). מדדתי בחלון צר
// וראיתי רק את המובייל, ולכן הפרסר הראשון החזיר אפס שורות אצל המשתמש. קוראים את שתיהן.
// המבחן שמפריד תנועות משורות הודעות הדואר: תאריך dd/MM/yy קצר וגם סכום ב-₪.
function txCandidates(){const groups=[[...document.querySelectorAll('div.rc-strip-row')],[...document.querySelectorAll('table tr')],[...document.querySelectorAll('[role="row"]')]];
let best=[];for(const g of groups){const rows=g.map(el=>({el,leaves:leavesOf(el)}))
.filter(x=>x.leaves.some(v=>TXDATE.test(v))&&x.leaves.filter(v=>/^-?[\d,]+\.\d{2}$/.test(v.replace(/₪/g,'').trim())).length>=2);
if(rows.length>best.length)best=rows}
return best}
function rowsOf(){return txCandidates().map(x=>({row:x.el,cells:x.leaves}))}
function transactions(){return txCandidates().map(({leaves})=>{
const date=leaves.find(v=>TXDATE.test(v));
const amounts=leaves.filter(v=>/^-?[\d,]+\.\d{2}$/.test(v.replace(/₪/g,'').trim()));
if(!date||!amounts.length)return null;
const amount=money(amounts[0]),balance=amounts.length>1?money(amounts[amounts.length-1]):null;
const action=leaves.find(v=>v!==date&&!/₪/.test(v)&&!/^-?[\d,]+\.\d{2}$/.test(v))||'';
return{date,action,details:'',reference:'',debit:amount<0?Math.abs(amount):null,credit:amount>0?amount:null,balance}}).filter(Boolean)}
function currentBalance(){
// בדף התנועות הכרטיס העליון מציג את יתרת העו״ש עצמה. קוראים אותו קודם ורק אם
// אינו קיים נופלים ליתרה המצטברת של התנועה החדשה ביותר. כך ח.פ/ת״ז לא יכולים
// להפוך בטעות ליתרה, וגם לא נציג "יתרה זמינה" הכוללת את מסגרת האשראי.
const headings=[...document.querySelectorAll('h1,h2,h3,h4,[role="heading"]')].filter(el=>/עובר ושב|יתרת עו[״"']?ש/.test(text(el)));
for(const h of headings){for(const el of [h,h.parentElement,h.parentElement?.parentElement]){const s=text(el);const after=s.match(/(?:עובר ושב|יתרת עו[״"']?ש)[^₪\d-]{0,35}₪?\s*(-?[\d,]+\.\d{2})/);if(after){const n=money(after[1]);if(n!=null&&Math.abs(n)<1e8)return n}}}
const rows=transactions().filter(r=>r.balance!=null);if(rows.length){const latest=latestRowBalance(rows);if(latest!=null&&Math.abs(latest)<1e8)return latest}
return valueAfter('יתרת עו"ש')}
// ⚠ 18.08.2026 — היתרה נקראה כ„שורה הראשונה של התאריך האחרון" ולא כאחרונה שבו.
// sort יציב, ולכן בתאריך עם כמה תנועות ניצחה הראשונה. נמדד אצל טל ב-17/08/2026:
// העברה 250,000- (יתרה 267,664.63-) · הקמת הלוואה 300,000+ (32,335.37) ·
// עמלה 1,350- (30,985.37). היתרה שנשמרה הייתה **267,664.63-** — בדיוק הראשונה.
// הבחירה עכשיו: התאריך המאוחר ביותר, ובתוכו **המופע האחרון לפי סדר הטבלה**
// (הטבלה מסודרת מהישן לחדש — כך נשמר מערך התנועות באחסון).
function latestRowBalance(rows){
  const stamp=s=>{const p=String(s).split(/[./]/).map(Number),y=p[2]<100?2000+p[2]:p[2];return new Date(y,p[1]-1,p[0]).getTime()||0};
  let best=null;
  for(let i=0;i<rows.length;i++){const t=stamp(rows[i].date);if(best===null||t>=best.t)best={t,balance:rows[i].balance}}
  return best?best.balance:null;
}
function labelMoney(labels){for(const label of labels){const value=valueAfter(label);if(value!=null)return value}return null}
function loanValue(s,labels){for(const label of labels){const m=s.match(new RegExp(`${label}[^\\d-]{0,35}(-?[\\d,]+(?:\\.\\d{1,2})?)`));if(m)return money(m[1])}return null}
function loanDate(s,labels){for(const label of labels){const m=s.match(new RegExp(`${label}[^\\d]{0,30}(\\d{1,2}[./]\\d{1,2}[./]\\d{2,4})`));if(m)return m[1]}return''}
function finalPaymentDate(next,installments){const d=String(next||'').match(/^(\d{1,2})[./](\d{1,2})[./](\d{2,4})$/),p=String(installments||'').match(/(\d+)\s*\/\s*(\d+)/);if(!d||!p)return'';let year=Number(d[3]);if(year<100)year+=2000;const paid=Number(p[1]),total=Number(p[2]),remainingAfterNext=total-paid-1;if(remainingAfterNext<0)return'';const date=new Date(year,Number(d[2])-1+remainingAfterNext,Number(d[1]));return`${String(date.getDate()).padStart(2,'0')}/${String(date.getMonth()+1).padStart(2,'0')}/${date.getFullYear()}`}
function loans(){const tables=[...document.querySelectorAll('table')],detail=tables.find(t=>/מספר הלוואה/.test(text(t))&&/יתרת הלוואה/.test(text(t))&&/תשלום קרוב/.test(text(t)));if(detail){return[...detail.querySelectorAll('tbody tr')].map((row,i)=>{const c=[...row.querySelectorAll('td,[role="cell"],[role="gridcell"]')].map(text);if(c.length<8)return null;const installments=c[4]||'',nextPaymentDate=c[6]||'';return{id:c[1]||String(i+1),type:c[0]||'הלוואה',balance:money(c[2]),originalPrincipal:null,repaymentMethod:c[3]||'',installments,interest:c[5]||'',nextPaymentDate,nextPayment:money(c[7]),endDate:finalPaymentDate(nextPaymentDate,installments)}}).filter(Boolean)}const candidates=[...document.querySelectorAll('tr,[role="row"],article,.card,[class*="loan" i],[class*="credit" i],li')].map(el=>({el,s:text(el)})).filter(x=>/הלווא|אשראי/.test(x.s)&&(/\b\d{8,14}\b/.test(x.s)||/יתרה|ריבית|החזר/.test(x.s)));const out=[],seen=new Set();for(const{x,s}of candidates){const id=(s.match(/\b\d{8,14}\b/)||[])[0]||String(out.length+1);if(seen.has(id))continue;const balance=loanValue(s,['יתרת הלוואה','יתרה לסילוק','יתרת קרן','יתרה']),nextPayment=loanValue(s,['החזר קרוב','תשלום קרוב','החזר חודשי','סכום החיוב הקרוב']),originalPrincipal=loanValue(s,['סכום הלוואה','קרן מקורית']);const interest=(s.match(/(?:שיעור )?ריבית[^%]{0,45}([A-Za-z+ .\d%-]*%)/)||[])[1]?.trim()||'';if(balance==null&&nextPayment==null&&!interest)continue;seen.add(id);out.push({id,type:'הלוואה',balance,originalPrincipal,nextPayment,nextPaymentDate:loanDate(s,['מועד תשלום קרוב','תשלום קרוב','חיוב קרוב']),endDate:loanDate(s,['מועד תשלום סופי','תאריך סיום','סיום ההלוואה']),interest})}return out}
function mortgages(){const out=[];for(const row of document.querySelectorAll('[role="grid"] [role="row"]')){const c=[...row.querySelectorAll('[role="cell"],[role="gridcell"]')].map(text);if(c.length<6||!/הלווא|הלואה/.test(c[0]))continue;const installments=c[2]||'',near=c[5]||'',date=(near.match(/\d{1,2}[./]\d{1,2}[./]\d{2,4}/)||[])[0]||'';out.push({id:`mortgage-${out.length+1}`,type:`משכנתא · ${c[0]}`,originalPrincipal:money(c[1]),installments,balance:money(c[3]),interest:c[4]||'',nextPayment:money(near),nextPaymentDate:date,endDate:finalPaymentDate(date,installments),isMortgage:true})}return out}
function loanProbe(){return{url:location.href,heading:[...document.querySelectorAll('h1,h2,h3')].map(text).filter(Boolean).slice(0,12),loanCount:loans().length,mortgageCount:mortgages().length,head:text(document.body).slice(0,700)}}
function gotoLoans(){const top=document.querySelector('#LOANS_MAIN_WORLD-link');if(!top)throw Error('לא נמצא תפריט הלוואות וערבויות');realClick(top.querySelector('img')||top);setTimeout(()=>{const links=[...document.querySelectorAll('a,button,[role="menuitem"],[role="option"],li')];const target=links.find(el=>/^(פירוט הלוואות|הלוואות|ריכוז הלוואות|הלוואות פעילות)$/.test(text(el)))||links.find(el=>/פירוט הלוואות|ריכוז הלוואות|הלוואות פעילות/.test(text(el)));const clickable=target?.closest?.('a,button')||target;if(clickable)realClick(clickable)},700)}
// ⚠ 20.08.2026 — נמדד חי דרך CDP על הדף עצמו, ולא נוחש:
//   input#fromDate (רכיב db-datepicker, placeholder dd/mm/yyyy, ערך התחלתי 01/05/2026)
//   ו-button.advanced-search-btn. הזרקת ערך + input/change/blur + לחיצה הרחיבה את
//   הטבלה מ-69 שורות (המוקדמת 20.5.26) ל-149 (המוקדמת 31.12.25) תוך 0.7 שניות.
// ⚠ Angular מתעלם מ-el.value=... ישיר. חייבים את ה-setter המקורי של HTMLInputElement,
//   אחרת ngModel לא מתעדכן והחיפוש רץ על הערך הישן.
const nativeSet=(el,v)=>{const d=Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el),'value');if(d&&d.set)d.set.call(el,v);else el.value=v;for(const t of['input','change','blur'])el.dispatchEvent(new Event(t,{bubbles:true}))};
const ilDate=iso=>{const m=String(iso||'').match(/^(\d{4})-(\d{2})-(\d{2})$/);return m?`${m[3]}/${m[2]}/${m[1]}`:''};
const rowDates=()=>{const out=[];for(const r of document.querySelectorAll('tr,[role="row"],.rc-table-row'))for(const m of text(r).matchAll(/\b(\d{2})\/(\d{2})\/(\d{2,4})\b/g)){const y=m[3].length===2?2000+Number(m[3]):Number(m[3]);out.push(new Date(y,Number(m[2])-1,Number(m[1])).getTime())}return out};
const earliestRow=()=>{const d=rowDates();return d.length?Math.min(...d):0};
// „תחילת איסוף נתונים" חדלה להיות מסננת בלבד: כאן היא נשלחת לאתר.
// מבודד לחלוטין — רץ אחרי בחירת החשבון ורק בדף התנועות. דף בלי הפקדים האלה
// (פרטי, מסך אחר) יוצא בשקט וממשיך בסינון הקיים, בלי רגרסיה.
async function applyCollectSince(){
  try{
    const st=await chrome.storage.local.get({collectSince:''}),want=ilDate(st.collectSince);
    // ⚠ 20.08.2026 — הדיווח חייב להיכתב **בכל מסלול**, כולל יציאה מוקדמת. בלי זה
    // רשומה חסרה נראית כמו „הקוד לא רץ", ובזבזנו על זה סבב: לא ידענו אם היציאה
    // הייתה מפני שאין תאריך, שאין פקדים, או שהערך כבר היה נכון.
    const report=async(reason,extra)=>{try{await chrome.storage.local.set({discountRangeApplied:{reason,from:want,at:new Date().toISOString(),url:location.hash,...extra}})}catch{}};
    if(!want)return report('אין תאריך התחלה');
    const from=document.querySelector('input#fromDate'),to=document.querySelector('input#toDate'),btn=[...document.querySelectorAll('button')].find(b=>/advanced-search-btn/.test(String(b.className||'')));
    if(!from||!to||!btn)return report('פקדים חסרים',{hasFrom:!!from,hasTo:!!to,hasBtn:!!btn});
    // ⚠⚠ 20.08.2026 — **השורש האמיתי, ומה שהופרך.** נמדד חי: בקשה 01/01/2026 עד
    // 20/08/2026 מחזירה 73 שורות **בכל שמונת החודשים** (1:7, 2:7, 3:10, 4:7, 5:14,
    // 6:10, 7:11, 8:6). כלומר **אין תקרת 3 חודשים** — ההשערה הזו שגויה, אל תחזור אליה.
    // הכשל היה ש-toDate **לא נכתב כלל**: האתר זוכר את הטווח הקודם בסשן, ולכן
    // „מ-01/01" נחתך ב-31/03 שנשאר משם, וזו בדיוק השורה „ד.נ לתקופה 31/03/26-01/01/26".
    const now=new Date(),pad=n=>String(n).padStart(2,'0'),today=`${pad(now.getDate())}/${pad(now.getMonth()+1)}/${now.getFullYear()}`;
    // ⚠ הערך בשדה אינו הוכחה שהטבלה מציגה את הטווח: האתר זוכר את החיפוש הקודם,
    // אבל אחרי ניווט הטבלה חוזרת לברירת המחדל. לכן לוחצים גם כשהערך כבר נכון,
    // אלא אם התנועה המוקדמת כבר קודמת לתאריך המבוקש.
    const wantMs=Date.parse(String(st.collectSince)),cur=earliestRow();
    if(from.value===want&&to.value===today&&cur&&cur<=wantMs)return report('כבר בטווח',{earliest:new Date(cur).toISOString().slice(0,10),rows:document.querySelectorAll('.rc-table-row').length});
    const rowCount=()=>document.querySelectorAll('.rc-table-row').length;
    const before=earliestRow(),beforeRows=rowCount();
    from.focus();nativeSet(from,want);await wait(300);
    to.focus();nativeSet(to,today);await wait(300);
    btn.click();
    // ⚠ 20.08.2026 — הריצה הראשונה רשמה rows:0: הטבלה מתרוקנת בזמן הבקשה, והקריאה
    // חזרה לפני שהיא התמלאה. לכן לא מספיק „המוקדמת השתנתה" — ממתינים לטבלה
    // **לא ריקה ויציבה** בשתי דגימות רצופות, ואם נשארה ריקה — לוחצים שוב פעם אחת.
    let stable=0,last=-1,retried=false;
    // ⚠ 15 שניות ולא 30 — אותו תקציב. הטבלה נמדדה חיה כמתמלאת תוך פחות משנייה.
    for(let i=0;i<25;i++){
      await wait(600);const n=rowCount();
      if(n>0&&n===last){if(++stable>=2)break}else stable=0;
      last=n;
      if(!retried&&n===0&&i===10){retried=true;btn.click()}
    }
    await report('הופעל',{to:today,toValue:to.value,rows:rowCount(),beforeRows,earliest:earliestRow()?new Date(earliestRow()).toISOString().slice(0,10):'',earliestBefore:before?new Date(before).toISOString().slice(0,10):'',retried,value:from.value})
    note(`דיסקונט: טווח מ-${want}`);
  }catch(e){note(`דיסקונט: הרחבת הטווח נכשלה — ${e.message}`)}
}
// שומר הזהות: מוודא שהדף באמת מציג את הישות שביקשנו, לפי מספרי החשבון שהזיהוי כבר קרא.
async function assertEntityMatches(id,repaired=false){
  let known={};
  try{const st=await chrome.storage.local.get({discoveredAccounts:[]});
    for(const a of st.discoveredAccounts||[])if(a.source==='discount-business'&&a.accountNumber)known[String(a.entityId||a.key).replace(/^.*\|/,'')]=String(a.accountNumber)}catch{}
  const mine=known[String(id)]||'';
  const others=Object.entries(known).filter(([k])=>k!==String(id)).map(([,v])=>v);
  let seen='',label='';
  // ⚠ 8 שניות ולא 15: יחד עם הרחבת הטווח זה חרג מתקציב 90 השניות של הרקע.
  for(let i=0;i<8;i++){
    seen=String(activeAccount().accountNumber||'');label=entityId(text(entityButton()));
    const okLabel=!label||label===String(id);
    const okNumber=mine?seen===mine:(seen&&!others.includes(seen));
    if(okLabel&&okNumber&&seen)return;
    await wait(1000)}
  // ⚠ 21.08.2026 — נמדד: {want:"024844714", expected:"2556371", seen:"9832685",
  //   label:"570012930"} — הדף היה על ינון והסנכרון ביקש את טל. כלומר הסנכרון
  //   מתחיל על הישות שבה הדף במקרה נמצא. במקום להיכשל, מבצעים כאן את המעבר עצמו:
  //   selectEntity הוא המנגנון שכבר אומת (a.dropdown-item, discountSelectWorked).
  if(!repaired){
    repaired=true;
    note(`דיסקונט: מעביר לישות ${id} לפני הקריאה`);
    try{await selectEntity(String(id))}catch(e){note(`דיסקונט: המעבר נכשל — ${e.message}`)}
    return assertEntityMatches(id,true);
  }
  try{await chrome.storage.local.set({discountIdentityBlock:{want:String(id),expected:mine,seen,label,at:new Date().toISOString()}})}catch{}
  throw Error(`הדף לא עבר לישות ${id}: מוצג חשבון ${seen||'לא ידוע'}${mine?` במקום ${mine}`:''}${label&&label!==String(id)?` (הבורר מציג ${label})`:''} — הסנכרון נעצר כדי לא לשמור נתונים של חשבון אחר`);
}
async function extract(id,isPrivate=false){// ⚠ הלקח שחזר שלוש פעמים: להמתין לטעינה לפני קריאה. אחרי הניווט וההזרקה מחדש הדף
// עדיין מתרנדר, וקריאה מיידית מחזירה null ומפילה את הסנכרון.
for(let i=0;i<120;i++){if(txCandidates().length||valueAfter('יתרת עו"ש')!=null)break;await wait(250)}
// ⚠⚠ 21.08.2026 — **הבאג החמור ביותר עד כה.** טל: „הוא סנכרן את החשבון של יובל,
// נתן לו שם של ינון, ומחק את הסנכרון של טל." נמדד מהמסך: בעלים „ינון" עם
// סניף 008 חשבון 3920651 — **המספר של אביסידריס יובל.** הסיבה: `owner` נקרא
// מתווית הבורר ו-`activeAccount()` מהטקסט בדף, ושניהם נקראו כשהדף עוד הציג את
// הישות הקודמת. תווית שהתחלפה **אינה** הוכחה שהנתונים התחלפו.
// לכן: לא קוראים ישות שלא אומתה מול מספר חשבון ידוע. עדיף להיכשל מלשמור שקר.
if(!isPrivate)await assertEntityMatches(id);
// הטווח נשלח לאתר לפני קריאת השורות — אחרת נקרא את חלון ברירת המחדל (3 חודשים).
if(!isPrivate)await applyCollectSince();
// ⚠ נמדד חי: בדף התנועות התווית היא "עובר ושב", ו-"יתרת עו\"ש" קיימת רק בדף הבית.
// מרגע שהתחלנו לנווט לתנועות לפני הקריאה, החיפוש אחר התווית הישנה החזיר null תמיד.
// ⚠ 21.08.2026 — נמדד חי: ישות 514220276 נשמרה בשם „טל רצבי" — השם של
// הישות שקדמה לה בלולאה. `owner` נקרא במקור בשורה הראשונה של extract —
// לפני ההמתנה לטעינה ולפני assertEntityMatches — ולכן תפס את תווית הבורר
// הישנה. שומר הזהות מ-1.0.17 אימת את **מספר החשבון** בלבד, והשם עקף אותו:
// הכסף היה נכון והתווית שיקרה. עכשיו השם נקרא באותו רגע שבו נקראים היתרה,
// מספר החשבון והתנועות — אחרי שהמעבר אומת — ולכן כולם מאותו מצב של הדף.
const owner=isPrivate?'':text(entityButton()).replace(/\b\d{9}\b/,'').replace(/\s{2,}/g,' ').trim();const account=activeAccount(),balance=currentBalance(),creditLimit=isPrivate?null:labelMoney(['מסגרת אשראי','מסגרת עו"ש','מסגרת מאושרת']),liabilities=valueAfter('התחייבויות'),rows=transactions();if(balance==null){lastTxProbe=txProbe();throw Error(`לא זוהתה יתרת עו״ש עבור ${owner} | דף ${location.hash} | שורות ${txCandidates().length} | ${text(document.body).slice(0,150)}`)}if(!rows.length){lastTxProbe=txProbe();throw Error(`לא נקראו תנועות עבור ${owner} | דף ${location.hash} | טבלאות ${document.querySelectorAll('table').length}`)}return{...account,entityId:id,nickname:owner||'דיסקונט פרטי',owner,balance,creditLimit,availableCredit:creditLimit==null?null:creditLimit+balance,liabilities,products:liabilities==null?[]:[{category:'התחייבויות',total:-Math.abs(liabilities),items:[]}],transactions:rows,loans:[],cards:[]}}
async function sync(keys,isPrivate=false){const out=[];for(const key of keys)out.push(await extract(key,isPrivate));return out}
chrome.runtime.onMessage.addListener((m,_s,reply)=>{if(m?.type==='DISCOUNT_PING'){reply({ok:true});return}if(m?.type==='DISCOUNT_PRIVATE_DISCOVER'){discoverPrivate().then(accounts=>reply({ok:true,accounts})).catch(e=>reply({ok:false,error:e.message,probe:probe()}));return true}if(m?.type==='DISCOUNT_SELECT_PRIVATE_ACCOUNT'){reply({ok:true});selectPrivateAccount(m.key).catch(e=>note(`דיסקונט פרטי: ${e.message}`));return}if(m?.type==='DISCOUNT_READ_MORTGAGES'){reply({ok:true,loans:mortgages(),probe:loanProbe()});return}if(m?.type==='DISCOUNT_STATE'){const account=activeAccount();reply({ok:true,entity:entityId(text(entityButton())),owner:text(entityButton()).replace(ENTITY,'').replace(/\s{2,}/g,' ').trim(),branch:account.branch,accountNumber:account.accountNumber,url:location.hash,rows:txCandidates().length,balance:currentBalance()});return}if(m?.type==='DISCOUNT_SELECT_ENTITY'){const want=String(m.entity||'');// עונים לפני הבחירה: המעבר טוען מחדש את הדף והורג את הסקריפט
reply({ok:true,already:entityId(text(entityButton()))===want});if(entityId(text(entityButton()))!==want)selectEntity(want).catch(e=>note(`דיסקונט עסקי: ${e.message}`));return}if(m?.type==='DISCOUNT_GOTO_TX'){const has=txCandidates().length>0;// עונים לפני הלחיצה: הניווט הורג את הסקריפט, ותשובה שנשלחת אחריו לא תגיע לעולם
reply({ok:true,already:has});if(!has){const link=[...document.querySelectorAll('a,button,[role="button"],[role="link"]')].find(el=>/לצפייה בתנועות|תנועות עו"ש/.test(text(el)));if(link)realClick(link)}return}if(m?.type==='DISCOUNT_GOTO_LOANS'){reply({ok:true});try{gotoLoans()}catch(e){note(`דיסקונט: ${e.message}`)}return}if(m?.type==='DISCOUNT_LOAN_STATE'){reply({ok:true,...loanProbe()});return}if(m?.type==='DISCOUNT_READ_LOANS'){reply({ok:true,loans:loans(),probe:loanProbe()});return}if(m?.type==='DISCOUNT_DISCOVER'){discover().then(accounts=>reply({ok:true,accounts})).catch(e=>reply({ok:false,error:e.message,probe:probe()}));return true}if(m?.type==='DISCOUNT_SYNC_SELECTED'){sync(m.keys||[],Boolean(m.private)).then(accounts=>reply({ok:true,accounts})).catch(e=>reply({ok:false,error:e.message,probe:lastTxProbe}));return true}});
let reported=false;const reportAuthenticated=()=>{if(!reported&&location.hash.includes('MY_ACCOUNT_HOMEPAGE')){reported=true;chrome.runtime.sendMessage({type:'DISCOUNT_AUTHENTICATED'}).catch(()=>{})}};setInterval(reportAuthenticated,800);reportAuthenticated();
})();
