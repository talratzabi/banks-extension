(()=>{
if(window.__leumiSyncLoaded)return;window.__leumiSyncLoaded=true;
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const txt=el=>{if(!el)return'';let visible=el.innerText||el.textContent||'';const isAccountArrow=el.matches?.('main button,button[aria-expanded],button[aria-haspopup]')&&!/\d/.test(visible);if(isAccountArrow)visible+=` ${el.parentElement?.innerText||''} ${el.parentElement?.parentElement?.innerText||''}`;const meta=['aria-label','title','data-account','data-account-number','data-value'].map(name=>el.getAttribute?.(name)||'').filter(Boolean).join(' ');return`${visible} ${meta}`.replace(/\s+/g,' ').trim()};
const money=value=>{const s=String(value||'').replace(/[−–]/g,'-');if(!/\d/.test(s))return null;const neg=s.includes('-'),n=Number(s.replace(/[,₪\s-]/g,'').replace(/[^0-9.]/g,''));return Number.isFinite(n)?(neg?-n:n):null};
// ⚠ נמדד 17.08.2026: ניווט לפי כתובת נוחת על מעטפת ריקה — אותו דף נתן
// 0 בוררים ו-0 שורות, מול 2 ו-22 כשמגיעים אליו מהתפריט. בלי בורר
// בדף, syncSelected מדלג על selectAccount לגמרי וקורא את החשבון הלא נכון.
const MENU_ROUTES=[
 {path:'/nis-accounts/nis-transactions',parent:'עובר ושב שקלים',child:'תנועות בחשבון שקלים'},
 {path:'/credits/loans',parent:'אשראי',child:'הלוואות'},
 {path:'/checks/cleared-checks',parent:'שיקים',child:'שיקים מזומנים'}];
// ⚠ אין להשתמש כאן ב-txt/normalized: normalized אינו מקצץ רווחים ואינו
// מכווץ אותם, ו-txt מוסיף טקסט של אלמנט האב לכפתורים מסוימים.
// שניהם נועדו לשורות חשבון, והשוואה ב-=== מול שם פריט תפריט לעולם לא תתאים.
// זה הכשיל את goRoute ב-0.56.0–0.57.4 עם "הפריט לא נמצא בתפריט".
const menuText=el=>String(el?.innerText||el?.textContent||'').replace(/\s+/g,' ').trim();
const menuItem=name=>[...document.querySelectorAll('a,button,[role="link"],[role="menuitem"]')].find(el=>menuText(el)===name);
async function goRoute(path){
const route=MENU_ROUTES.find(r=>String(path).includes(r.path));
if(!route)return{ok:false,error:`אין מסלול תפריט ל-${path}`};
if(location.pathname.includes(route.path)&&accountTabs().length)return{ok:true,already:true};
let child=menuItem(route.child);
if(!child){const parent=menuItem(route.parent);
if(!parent)return{ok:false,error:`הפריט ${route.parent} לא נמצא בתפריט`};
realClick(parent);
for(let i=0;i<14&&!child;i++){await wait(300);child=menuItem(route.child)}}
if(!child)return{ok:false,error:`הפריט ${route.child} לא נמצא בתפריט`};
realClick(child);
for(let i=0;i<50;i++){await wait(300);if(location.pathname.includes(route.path))return{ok:true}}
return{ok:false,error:`הניווט ל-${route.child} לא הגיע ל-${route.path}`}}
chrome.runtime.onMessage.addListener((m,_s,reply)=>{if(m?.type==='LEUMI_PING'){reply({ok:true});return}if(m?.type==='LEUMI_SNAPSHOT'){reply({ok:true,debug:snapshot()});return}if(m?.type==='LEUMI_DISCOVER'){discover().then(accounts=>reply({ok:true,accounts,strategy:lastStrategy,optionProbe:lastOptionProbe})).catch(e=>reply({ok:false,error:e.message,debug:snapshot(),strategy:lastStrategy,optionProbe:lastOptionProbe}));return true}if(m?.type==='LEUMI_GO'){goRoute(m.path||'').then(reply).catch(e=>reply({ok:false,error:e.message}));return true}if(m?.type==='LEUMI_SYNC_SELECTED'){syncSelected(m.keys||[],m.balances||{}).then(async accounts=>reply({ok:true,accounts,rangeProbe:rangeProbe(),radios:radioProbe(),dateMenu:await dateMenuProbe()})).catch(e=>reply({ok:false,error:e.message,debug:snapshot()}));return true}if(m?.type==='LEUMI_LOANS_SELECTED'){syncLoans(m.keys||[]).then(accounts=>reply({ok:true,accounts})).catch(e=>reply({ok:false,error:e.message,debug:snapshot()}));return true}if(m?.type==='LEUMI_CHEQUE_IMAGES'){chequeImages(m.wanted||[],m.key||'',m.offset||0,m.total||0).then(images=>reply({ok:true,images})).catch(e=>reply({ok:false,error:e.message,debug:snapshot()}));return true}if(m?.type==='LEUMI_OPEN_CHEQUE'){openCheque(m).then(()=>reply({ok:true})).catch(e=>reply({ok:false,error:e.message}));return true}});
// הרחבת שורת התנועה מזריקה את צילום השיק כ-data:image ישירות ל-DOM — קדמי ואחורי.
// לכן התמונה נלקחת מהשורה עצמה ואין שום התאמה לפי תאריך וסכום, שממילא אינה חד-ערכית.
// ⚠ בלי בחירת החשבון הקציר רץ על החשבון שבמקרה פעיל, ולכן לכל חשבון פרט לאחרון
// לא נמצאו שורות תואמות ולא נשמר אף צילום.
async function chequeImages(wanted,key,offset=0,total=0){if(key&&accountTabs().length)await selectAccount(key);await openCurrentAccount();await loadAllRows();const out={};const dataSrc=()=>[...document.querySelectorAll('img')].map(i=>i.src).filter(s=>s.startsWith('data:image'));
// ⚠ חלון הצילום נשאר פתוח אחרי שיק: הוא מכסה את הטבלה וחוסם את
// הלחיצה הבאה, וגם מוסיף את תמונותיו ל-before כך שתמונה חדשה
// אינה מזוהה. זה מייצר "חלק כן וחלק לא". סלקטור הסגירה כבר מדוד, מ-discover().
const closeViewer=async()=>{const btn=document.querySelector('[role="dialog"] button[aria-label="סגירה"]')||document.querySelector('[role="dialog"] [aria-label*="סגירה"],[role="dialog"] [aria-label*="סגור"]');if(btn){realClick(btn);await wait(450);return}if(document.querySelector('[role="dialog"]')){document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));await wait(450)}};
for(const item of wanted){const reference=String(item.reference||'');const hit=datedRows().find(({cells})=>cells.includes(item.date)&&cells.includes(reference));if(!hit)continue;
chrome.runtime.sendMessage({type:'LEUMI_CHEQUE_PROGRESS',done:offset+wanted.indexOf(item)+1,total:total||wanted.length,reference}).catch(()=>{});
await closeViewer();const before=new Set(dataSrc());hit.row.querySelector('button,[role="button"]')?.click();
// 4 שניות היו קצרות, אבל 12 הוציאו את האצווה מתקרת ה-120 שניות
// וכל ששת השיקים נזרקו. 8 שניות עם יציאה מוקדמת, והתקרה הורחבה ל-300.
let fresh=[];for(let i=0;i<32;i++){await wait(250);fresh=dataSrc().filter(s=>!before.has(s));if(fresh.length>=2)break}
if(fresh.length){out[reference]={front:fresh[0],back:fresh[1]||''};
// ⚠ שולחים כל צילום מיד ולא רק בסוף האצווה: אצווה שחורגת מהתקרה איבדה עד עכשיו
// גם את מה שכבר צולם בהצלחה (נמדד 18.08.2026 — 14 מתוך 32 אבדו כך).
chrome.runtime.sendMessage({type:'LEUMI_CHEQUE_IMAGE',reference,front:fresh[0],back:fresh[1]||''}).catch(()=>{})}}
await closeViewer();return out}
function snapshot(){try{const dated=datedRows(),page=normalized(txt(document.body));return{url:location.href,tables:document.querySelectorAll('table').length,rows:gridRows().length,datedRows:dated.length,cols:dated[0]?dated[0].cells.length:0,firstRow:dated[0]?dated[0].cells.slice(0,10):[],tabs:accountTabs().length,chooser:txt(chooser()).slice(0,140),shekelBefore:/₪\s*-?[\d,]+\.\d{2}/.test(page),shekelAfter:/-?[\d,]+\.\d{2}\s*₪/.test(page),head:page.slice(0,500),...probe()}}catch(e){return{snapshotError:e.message,url:location.href}}}
function probe(){try{const roleCounts={};for(const role of['table','grid','treegrid','row','rowgroup','gridcell','cell','columnheader','list','listitem']){const n=document.querySelectorAll(`[role="${role}"]`).length;if(n)roleCounts[role]=n}
const frames=[...document.querySelectorAll('iframe')].map(f=>{let doc=null;try{doc=f.contentDocument}catch{}return{id:f.id||'',name:f.name||'',src:String(f.src||'').slice(0,140),sameOrigin:Boolean(doc),innerTables:doc?doc.querySelectorAll('table').length:-1,innerRows:doc?doc.querySelectorAll('table tr,[role="row"]').length:-1}});
const dateEls=[...document.querySelectorAll('*')].filter(el=>!el.children.length&&/^\d{2}\.\d{2}\.\d{4}$/.test((el.textContent||'').trim())).slice(0,3);
const chain=dateEls.map(el=>{const parts=[];let n=el;for(let i=0;i<6&&n&&n.tagName!=='BODY';i++){const role=n.getAttribute?.('role'),cls=typeof n.className==='string'&&n.className.trim()?'.'+n.className.trim().split(/\s+/).slice(0,2).join('.'):'';parts.push(`${n.tagName.toLowerCase()}${role?`[role=${role}]`:''}${cls}`);n=n.parentElement}return{path:parts.join(' < '),near:String(el.parentElement?.parentElement?.innerText||'').replace(/\s+/g,' ').slice(0,240)}});
const flat=s=>String(s||'').replace(/\s+/g,' ').trim();
const headers=[...document.querySelectorAll('[role="columnheader"]')].map(h=>flat(h.innerText||h.textContent)).slice(0,15);
const gridRowEls=[...document.querySelectorAll('[role="row"]')];
const sampleCells=gridRowEls.map(r=>[...r.querySelectorAll('[role="cell"],[role="gridcell"]')].map(c=>({t:flat(c.innerText),a:flat(c.getAttribute('aria-label')),cls:flat(typeof c.className==='string'?c.className:'').slice(0,60)}))).filter(cs=>cs.some(c=>/^\d{2}\.\d{2}\.\d{4}$/.test(c.t))).slice(0,5);
return{roleCounts,frames,dateEls:dateEls.length,chain,headers,gridRowCount:gridRowEls.length,sampleCells,bodyLen:(document.body.innerText||'').length}}catch(e){return{probeError:e.message}}}
// ⚠ 18.08.2026 — הפריט שנרשם כפתוח ב-0.58.0: ההודעה נשלחה בלי לוודא שהמשתמש מחובר.
// הגייט היחיד היה „מארח hb2 + קיים <main>", ודף ההתחברות עונה על שניהם. כל עוד
// הכניסה הייתה על www.leumi.co.il (בלי content script) הבאג היה רדום; ברגע שהכניסה
// עברה ל-hb2 ב-0.79.0 הוא התעורר — התוסף הכריז „מחובר" בזמן שהמשתמש מקליד, הזיהוי
// התחיל וניווט את הדף מתחת לידיו. **דף התחברות ושער אינם סשן.**
let reported=false;function report(){if(reported)return;
if(location.hostname!=='hb2.bankleumi.co.il')return;
if(/\/H\/Login\.html/i.test(location.pathname)||/\/gate-keeper\//i.test(location.pathname))return;
if(!document.querySelector('main'))return;
reported=true;chrome.runtime.sendMessage({type:'LEUMI_AUTHENTICATED'}).catch(()=>{})}setInterval(report,800);report();
function normalized(value){return String(value||'').replace(/(?<=\d)\s+(?=\d)/g,'').replace(/\s*([-\/])\s*/g,'$1')}
// ⚠⚠ 23.08.2026 — טל: „יש התעלמות מהסלש ושתי הספרות" (החשבון הוא 348300/77).
// **המנגנון אומת בבדיקה**, על ארבע צורות טקסט סבירות:
//   "921-348300/77"            → key=921-348300 suffix=77   ✔
//   "921 - 348300 / 77"        → key=921-348300 suffix=77   ✔
//   "921 348300 77"            → normalized="92134830077"   ✗ null
//   "עו״ש שקלים 921 348300/77" → normalized="…921348300/77" ✗ null
// הסיבה: `normalized()` מוחק רווחים **בין ספרות** — הוא נועד לאחות מספר
// שפוצל בין אלמנטים, אבל הוא גם **מוחק את הגבול בין הסניף לחשבון**. בלי
// מקף אין התאמה, `parseAccount` מחזיר null, ו-`selectAccount` זורק
// „החשבון לא נמצא" — בדיוק מה שטל ראה.
// **הנפילה לאחור שמרנית בכוונה**, כי הרחבה גורפת כאן כבר הפילה את הזיהוי
// פעם אחת („עשרות חשבונות מדומים", ראה ההערה מעל menuEntitiesLoose):
//   · רצה **רק** אם הפירוק המחמיר נכשל;
//   · על הטקסט **הגולמי**, שבו הרווח עוד קיים;
//   · מחייבת מפריד מפורש (מקף או רווח), חשבון בן 5–9 ספרות, וסיומת של
//     **בדיוק שתי ספרות** — ולא `\d+` פתוח.
function parseAccount(value){
  // ⚠ 23.08.2026 — `(\d{3})-(\d+)` תפס `026-01` בתוך „23.08.2026-01.01.2026"
  // והמציא חשבון. `(?<!\d)` פוסל התחלה בתוך מספר ארוך, ו-`{4,9}` דורש חשבון
  // באורך סביר (הקיימים: 88154, 348300). נמדד ב-leumiAccountMatch.
  const m=normalized(value).match(/(?<!\d)(\d{3})-(\d{4,9})(?:\/(\d{1,3}))?(?!\d)/);
  if(m)return{branch:m[1],accountNumber:m[2],accountSuffix:m[3]||'',key:`${m[1]}-${m[2]}`};
  const raw=String(value||'').match(/(?:^|[^\d])(\d{3})[-\s](\d{5,9})(?:\s*\/\s*(\d{2}))?(?!\d)/);
  return raw?{branch:raw[1],accountNumber:raw[2],accountSuffix:raw[3]||'',key:`${raw[1]}-${raw[2]}`}:null;
}
// ⚠ שורות הרשת מכילות את מספרי החשבון של מושכי השיקים (12-645-0000099426), והם תואמים
// לתבנית של parseAccount. בלי ההחרגה הזו הזיהוי מחזיר את החשבון האמיתי ועוד עשרות מדומים.
// ⚠ ההחרגה מכוונת לרשת הנתונים בלבד — זו שיש בה כותרות עמודה — כי שורותיה מכילות את
// מספרי החשבון של מושכי השיקים. הרשימה הנפתחת של החשבונות בנויה גם היא משורות, ובלי
// ההבחנה הזו היא נמחקת כולה ונשאר חשבון אחד.
const dataGrids=()=>[...document.querySelectorAll('[role="table"],[role="grid"],[role="treegrid"]')].filter(g=>g.querySelector('[role="columnheader"]'));
const inDataGrid=el=>dataGrids().some(g=>g.contains(el));
function accountTabs(){return[...document.querySelectorAll('[role="tab"],button,[role="button"],[role="combobox"]')].filter(el=>!inDataGrid(el)&&parseAccount(txt(el)))}
function chooser(){return accountTabs().find(el=>el.getAttribute('aria-selected')==='true')||accountTabs()[0]}
function uniqueAccounts(elements){const seen=new Set();return elements.filter(el=>{const key=parseAccount(txt(el))?.key;if(!key||seen.has(key))return false;seen.add(key);return true})}
// לאומי בונה את הטבלאות כרשת ARIA מ-div, לא כ-<table>. ראה "רשת ARIA" ב-README.
const CELL='[role="cell"],[role="gridcell"]';
const cellText=el=>String(el?.innerText||'').replace(/\s+/g,' ').trim();
function gridRows(){return[...document.querySelectorAll('[role="row"]')]}
function cellsOf(row){return[...row.querySelectorAll(CELL)].map(cellText)}
function datedRows(){return gridRows().map(row=>({row,cells:cellsOf(row)})).filter(x=>x.cells.some(v=>/^\d{2}\.\d{2}\.\d{4}$/.test(v)))}
// ⚠ מספר החשבון מופיע ב-DOM לפני שכרטיס היתרה נטען. בחלון הזה קריאה מטקסט כל הדף
// תופסת את ה-₪ הראשון שנקרה בדרך — יתרה מצטברת של שורת תנועה — ומחזירה מספר שגוי בשקט.
// לכן ממתינים לכרטיס עצמו: האלמנט הקטן ביותר שמכיל את מספר החשבון וגם סכום ב-₪.
async function accountCard(a){const key=`${a.branch}-${a.accountNumber}`;for(let i=0;i<60;i++){const hits=[...document.querySelectorAll('div,section,button')].filter(el=>{const t=normalized(cellText(el));return t.length<400&&t.includes(key)&&/₪\s*-?[\d,]+\.\d{2}/.test(t)});if(hits.length)return hits.sort((x,y)=>cellText(x).length-cellText(y).length)[0];await wait(250)}return null}
function columnIndex(){const idx={};[...document.querySelectorAll('[role="columnheader"]')].forEach((h,i)=>{const label=cellText(h);if(label&&!(label in idx))idx[label]=i});return idx}
// הרשת נבנית מעצמה ברגע שנבחר חשבון ספציפי — אין כפתור לפתוח, ואין ללחוץ על כפתור לא מזוהה בדף בנק מחובר.
async function openCurrentAccount(){for(let i=0;i<180;i++){if(datedRows().length)return;await wait(250)}throw Error(`רשת התנועות לא נטענה בתוך 45 שניות (שורות ${gridRows().length}, תאים ${document.querySelectorAll(CELL).length})`)}
// ⚠ הרשת מרנדרת חלק מהשורות וטוענת עוד בגלילה. בלי זה נקראות רק השורות הראשונות
// והתנועות האחרונות נראות כאילו אינן קיימות — הן פשוט עוד לא נכנסו ל-DOM.
// ⚠⚠ 22.08.2026 — **הוחזר. הניסיון לתקן כאן החמיר את המצב, נמדד.**
// הרקע: הקריאה נעצרת על ~29 שורות (גודל עמוד) גם כשהטווח רחב, וזה עדיין
// פתוח. הניסיון שלי: לגלול את כל האבות הנגללים, להרים-ולהוריד כדי לייצר
// אירוע, לשלוח `scroll` מסונתז, ולהמתין עד 70 שניות.
// **התוצאה שנמדדה בשטח (leumiLoadRows):**
//   {loops:5, rows:15, timedOut:true, moreClicks:0}
// חמישה סיבובים בלבד בתוך 70 שניות — כלומר **כל סיבוב ארך ~14 שניות**,
// כנראה בגלל סערת רינדור שהאירועים המסונתזים גררו — והתוצאה הסופית הייתה
// **13 תנועות במקום 29**. כלומר גם איטי בהרבה וגם גרוע יותר.
// **הלקח: אל תשלחו אירועי scroll מסונתזים לרשת הזו, ואל תגללו כל אב.**
// המימוש המקורי חוזר כלשונו. `leumiLoadRows` נשאר — הוא זה שגילה את זה.
// ⚠ הפריט „נקראות ~29 שורות בלבד" **נשאר פתוח**, וצריך מדידה חיה של
// המנגנון האמיתי (מה בעצם מפעיל טעינת עמוד נוסף) לפני ניסיון נוסף.
async function loadAllRows(){let last=0,stable=0;for(let i=0;i<120;i++){const rows=datedRows();if(rows.length===last){if(++stable>=5)break}else{stable=0;last=rows.length}
const tail=rows.at(-1)?.row;try{tail?.scrollIntoView({block:'end'})}catch{}
const box=tail?.closest('[role="table"],[role="grid"]')||document.scrollingElement;if(box)box.scrollTop=box.scrollHeight;window.scrollTo(0,document.documentElement.scrollHeight);
await wait(400)}
try{await chrome.storage.local.set({leumiLoadRows:{rows:last,at:new Date().toISOString()}})}catch{}
return last}
// ⚠ el.click() אינו פותח את בורר החשבונות של לאומי — נמדד בדפדפן חי. הרכיב מאזין
// לאירועי pointer, ובלי הרצף המלא הזיהוי נופל חזרה לחשבון המסומן בלבד ומחזיר אחד מתוך רבים.
function realClick(el){const o={bubbles:true,cancelable:true,composed:true,view:window,button:0,buttons:1,pointerId:1,pointerType:'mouse',isPrimary:true};try{el.scrollIntoView({block:'center'})}catch{}
for(const type of['pointerover','pointerenter','pointermove','pointerdown'])el.dispatchEvent(new PointerEvent(type,o));
el.dispatchEvent(new MouseEvent('mousedown',o));try{el.focus()}catch{}
for(const type of['pointerup'])el.dispatchEvent(new PointerEvent(type,{...o,buttons:0}));
el.dispatchEvent(new MouseEvent('mouseup',{...o,buttons:0}));el.dispatchEvent(new MouseEvent('click',{...o,buttons:0}));
try{el.click()}catch{}}
// שורות הבורר מזוהות לפי התוכן שלהן עצמן — מספר חשבון וסכום באותו אלמנט — ולא לפי role,
// כי בלאומי הן div-ים רגילים. נבחר האלמנט הקטן ביותר בכל שרשרת כדי לא לתפוס עטיפות.
const OPTION_ROLE='[role="option"],[role="menuitem"],[role="menuitemradio"],[role="radio"]';
function optionPool(){const best=new Map();
for(const el of document.querySelectorAll(OPTION_ROLE+',[role="listitem"],li,tr,div,button,a')){
if(inDataGrid(el))continue;
const own=ownText(el);if(!own||own.length>200)continue;
const a=parseAccount(own);if(!a)continue;
const isOpt=el.matches(OPTION_ROLE);
// ⚠ נמדד 17.08.2026: הבורר של לאומי מציג שם ומספר חשבון בלבד, **בלי יתרה**.
// דרישת הסכום דחתה את כל שש האפשרויות והזיהוי נפל לחשבון אחד.
// סכום נדרש עכשיו מאלמנט כללי בלבד, כמסנן רעש.
if(!isOpt&&!/-?[\d,]+\.\d{2}/.test(own))continue;
const prev=best.get(a.key);
// אפשרות אמיתית גוברת על אלמנט כללי — אחרת שורת המטבע בדף
// תמונת המצב תופסת את החשבון ונותנת לו את השם "NIS".
if(!prev||(isOpt&&!prev.matches(OPTION_ROLE))||(isOpt===prev.matches(OPTION_ROLE)&&ownText(prev).length>own.length))best.set(a.key,el)}
return[...best.values()]}
// שם החשבון הוא כל מה שנשאר אחרי הסרת הסכום, מספר החשבון וברכת הפתיחה — ולא "המילה
// האחרונה לפני הספרות", שהפכה את "דפנה מלכה- מלכה משק חקלאי מניב" ל-"מניב".
function accountName(el){let s=ownText(el);
s=s.replace(/₪/g,' ').replace(/-?[\d,]+\.\d{2}/g,' ');
s=s.replace(/\d{3}\s*-\s*\d+(?:\s*\/\s*\d+)?/g,' ');
s=s.replace(/(?:\d\s+){3,}\d/g,' ');
s=s.replace(/^\s*(?:אחר\s+)?(?:בוקר טוב|צהריים טובים|ערב טוב|לילה טוב|שלום)\s*,?\s*/,'');
return s.replace(/[\s\/\d]+$/,'').replace(/\s{2,}/g,' ').trim()}
// המדידה של הרשימה הנפתחת רצה בתוך הסשן של המשתמש בזמן הזיהוי הרגיל. פתיחת סשן שני
// כדי למדוד מבחוץ הפילה את הסשן פעמיים, ולכן הצילום הזה הוא הדרך היחידה לראות את המבנה.
let lastOptionProbe=null;
function captureOptionProbe(chooser){try{const f=s=>String(s||'').replace(/\s+/g,' ').trim();
const pool=[...document.querySelectorAll('body *')].filter(el=>!el.closest('[role="row"],[role="table"],[role="grid"],[role="treegrid"]')&&el.children.length<=2&&parseAccount(f(el.innerText)));
const chain=el=>{const p=[];let n=el;for(let i=0;i<5&&n&&n.tagName!=='BODY';i++){p.push(n.tagName.toLowerCase()+(n.getAttribute?.('role')?`[role=${n.getAttribute('role')}]`:''));n=n.parentElement}return p.join(' < ')};
return{chooserText:f(chooser?.innerText).slice(0,90),expanded:chooser?.getAttribute('aria-expanded'),
counts:{dialog:document.querySelectorAll('[role="dialog"]').length,listbox:document.querySelectorAll('[role="listbox"]').length,menu:document.querySelectorAll('[role="menu"]').length,option:document.querySelectorAll('[role="option"]').length,radio:document.querySelectorAll('[role="radio"]').length,tab:document.querySelectorAll('[role="tab"]').length},
accountLike:pool.slice(0,12).map(el=>({tag:el.tagName.toLowerCase(),role:el.getAttribute('role')||'',cls:f(typeof el.className==='string'?el.className:'').slice(0,70),txt:f(el.innerText).slice(0,60),path:chain(el)}))}}catch(e){return{probeError:e.message}}}
// ⚠ txt() מצרף טקסט של ההורה, ולכן accountTabs מחזיר גם עטיפות שה-innerText שלהן ריק.
// הצילום הראה שנלחצה עטיפה כזו ולא הבורר, ולכן שום רשימה לא נפתחה. קודם מנסים אלמנטים
// שמספר החשבון נמצא בטקסט שלהם עצמם, ורק אחר כך את השאר.
const ownText=el=>String(el?.innerText||'').replace(/\s+/g,' ').trim();
async function options(){const direct=uniqueAccounts(accountTabs());if(direct.length>1)return direct;
const clickable=accountTabs().filter(el=>el.matches('button,[role="button"],[role="combobox"]'));
const ordered=[...clickable.filter(el=>parseAccount(ownText(el))),...clickable.filter(el=>!parseAccount(ownText(el)))];
if(!ordered.length&&!direct.length)throw Error('לא נמצאה רשימת החשבונות בלאומי');
for(const c of ordered.slice(0,3)){realClick(c);
for(let i=0;i<24;i++){await wait(250);const found=optionPool();if(found.length>Math.max(1,direct.length)){lastOptionProbe=null;return found}}
lastOptionProbe=captureOptionProbe(c)}
if(direct.length)return direct;throw Error('רשימת החשבונות בלאומי לא נפתחה')}
// ⚠ הדף הזה נטען 20–35 שניות. בלי ההמתנה הזו הזיהוי קורא שלד ריק ומדווח
// "לא נמצאה רשימת החשבונות" — שגיאה שנראית כמו בעיית מבנה אבל היא בעיית תזמון.
async function ready(){for(let i=0;i<180;i++){if(accountTabs().length&&/₪\s*-?[\d,]+\.\d{2}/.test(txt(document.body)))return true;await wait(250)}return accountTabs().length>0}
// ⚠ כשההתחברות ללאומי פגה הדף אינו מפנה למסך התחברות — הוא נשאר על ספינר לנצח.
// בלי ההבחנה הזו זה נראה כמו תקלת מבנה, ומחפשים את הבאג במקום להתחבר מחדש.
// מסלול שני לאיתור חשבונות, שאינו תלוי בבורר: דף "תמונת מצב" מציג את כל החשבונות
// כרשימה רגילה. אם הבורר לא נפתח מלחיצה, הזיהוי לא נופל אלא עובר לשם.
let lastStrategy='';
async function fromOverview(){const link=[...document.querySelectorAll('a,button,[role="link"],[role="button"],[role="menuitem"],[role="tab"]')].find(el=>/^תמונת מצב$/.test(ownText(el)));
if(!link)return[];realClick(link);
for(let i=0;i<40;i++){await wait(500);const pool=optionPool();if(pool.length>1)return pool}
return optionPool()}
async function discoverAccounts(){let opts=[];
try{opts=await options();lastStrategy='בורר החשבונות'}catch(e){lastStrategy=`בורר נכשל (${e.message})`}
if(uniqueAccounts(opts).length<2){const alt=await fromOverview();if(uniqueAccounts(alt).length>uniqueAccounts(opts).length){opts=alt;lastStrategy='דף תמונת מצב'}}
if(!opts.length)throw Error('לא נמצאה רשימת החשבונות בלאומי — לא בבורר ולא בתמונת מצב');
return opts}
async function discover(){if(!await ready())throw Error(`דף לאומי לא נטען בתוך 45 שניות ונשאר ריק (${normalized(txt(document.body)).length} תווים בדף). ברוב המקרים זה אומר שההתחברות ללאומי פגה — התחבר מחדש באתר והרץ שוב.`);const opts=await discoverAccounts(),accounts=uniqueAccounts(opts).map(o=>{const value=txt(o),a=parseAccount(value);if(!a)return null;
const name=accountName(o)||`חשבון ${a.accountNumber}`;const values=value.match(/-?[\d,]+\.\d{2}/g);return{...a,nickname:name,balance:values?.length?money(values.at(-1)):null}}).filter(Boolean);document.querySelector('[role="dialog"] button[aria-label="סגירה"]')?.click();return accounts}
async function selectAccount(key){const current=parseAccount(txt(chooser()));if(current?.key===key)return;let option=accountTabs().find(o=>parseAccount(txt(o))?.key===key);if(!option){const opts=await options();option=opts.find(o=>parseAccount(txt(o))?.key===key)}if(!option){
  // ⚠⚠ 23.08.2026 — טל: „החשבון לא נכון, בלאומי יש 348300/77, יש התעלמות
  // מהסלש ושתי הספרות." ההודעה „החשבון X לא נמצא" לא אמרה **מה כן נמצא**,
  // ולכן אי אפשר היה לדעת אם הבעיה בהתאמה, בפירוק, או בטקסט עצמו.
  // חשד מוביל, לא מאומת: `normalized()` מוחק רווחים **בין ספרות**
  // (`(?<=\d)\s+(?=\d)`). אם לאומי מפצל את מספר החשבון לאלמנטים נפרדים,
  // הטקסט „921 348300 77" הופך ל-„92134830077", וב-`parseAccount` אין מקף
  // ולכן אין התאמה כלל. **זו השערה — הרישום כאן יכריע אותה.**
  // ⚠ האבחון נכתב לאחסון בלבד. הודעת המשתמש נשארת משפט אחד (הלקח מ-1.2.8).
  try{
    const seen=[...accountTabs(),...(await options().catch(()=>[]))].slice(0,25).map(el=>{
      const t=String(txt(el)||'').replace(/\s+/g,' ').trim().slice(0,60);
      const p=parseAccount(t);
      return{raw:t,norm:normalized(t).slice(0,60),key:p?p.key:null,suffix:p?p.accountSuffix:null};
    });
    await chrome.storage.local.set({leumiAccountMatch:{want:key,tabs:accountTabs().length,
      chooser:String(txt(chooser())||'').replace(/\s+/g,' ').trim().slice(0,80),
      chooserKey:parseAccount(txt(chooser()))?.key||null,seen,at:new Date().toISOString()}});
  }catch{}
  throw Error(`החשבון ${key} לא נמצא בחיבור לאומי`);
}realClick(option);for(let i=0;i<60;i++){await wait(250);const active=parseAccount(txt(chooser()));if(active?.key===key)return;
if(!chooser()&&normalized(txt(document.body)).includes(key))return}throw Error(`לאומי לא עבר לחשבון ${key}`)}
async function extract(expectedKey='',fallbackBalance=null){await openCurrentAccount();
// ⚠⚠ 23.08.2026 — **מיקום. הוכח במדידה, לא בהשערה.** `leumiAccountMatch` הראה:
//   want:"921-348300"  chooser:"…921-88154/39"  tabs:5  — כל הלשוניות אותו חשבון
// כלומר החשבון המבוקש **לא היה בדף כלל**: הסינון רץ לפני `selectAccount`,
// רינדר את הדף מחדש, והרס את לשוניות החשבון לפני שחיפשו בהן. ראיה נוספת
// באותה רשומה: `"תאריך23.08.2026-01.01.2026"` נקרא כחשבון מדומה `026-01` —
// **זה טווח התאריכים שהקוד הזה עצמו כתב לדף.**
// התיקון נעשה כבר ב-1.2.7 והוחזר ב„חזרה ל-1.2.5" לבקשת טל; זו החזרתו.
await applyLeumiRange();await openCurrentAccount();await loadAllRows();const raw=datedRows().map(x=>x.cells);const c=chooser(),a=parseAccount(expectedKey)||parseAccount(txt(c));if(!a)throw Error('לא זוהה החשבון הפעיל בלאומי');if(!raw.length)throw Error(`לא נטענו תנועות בחשבון ${a.key}`);const selected=[...document.querySelectorAll('[role="tab"][aria-selected="true"]')].map(txt).find(v=>parseAccount(v)?.key===a.key)||txt(c);const card=await accountCard(a);const cardText=card?normalized(cellText(card)):'';const balanceMatch=cardText.match(new RegExp(`${a.branch}-${a.accountNumber}(?:\\/\\d+)?[^₪]{0,20}₪\\s*(-?[\\d,]+\\.\\d{2})`));let balance=balanceMatch?money(balanceMatch[1]):null;// היתרה כבר נקראה מבורר החשבונות בזיהוי; אין סיבה להיכשל אם כרטיס היתרה לא רונדר.
if(balance==null&&Number.isFinite(fallbackBalance))balance=fallbackBalance;if(balance==null)throw Error(`לא זוהתה יתרת עו״ש בחשבון ${a.key} — לא בכרטיס היתרה ולא בבורר`);const limitMatch=cardText.match(/מסגרת אשראי\s*₪?\s*(-?[\d,]+\.\d{2})/);const creditLimit=limitMatch?money(limitMatch[1]):null;// העמודות נקראות לפי כותרת ולא לפי היסט קבוע. נמדד מול הדף החי: תאריך|תנועות|אסמכתא|חובה|זכות|יתרה מצטברת.
const idx=columnIndex(),col=(label,fallback)=>Number.isInteger(idx[label])?idx[label]:fallback;
const iDate=col('תאריך',1),iAction=col('תנועות',2),iRef=col('אסמכתא',3),iDebit=col('חובה',4),iCredit=col('זכות',5),iBalance=col('יתרה מצטברת',6);
// שורה עתידית ממלאת גם חובה וגם זכות ומשאירה את היתרה המצטברת ריקה — זה המבחן, ולא השוואת תאריכים.
const parsed=raw.map(cells=>{const date=cells[iDate]||'';if(!/^\d{2}\.\d{2}\.\d{4}$/.test(date))return null;const action=cells[iAction]||'',credit=money(cells[iCredit]),rowBalance=money(cells[iBalance]);return{date,action,details:'',reference:cells[iRef]||'',debit:money(cells[iDebit]),credit,balance:rowBalance,future:rowBalance==null,cheque:/שיק/.test(action)&&credit>0,chequeAmount:credit}}).filter(Boolean);
const rows=parsed.filter(r=>!r.future),future=parsed.filter(r=>r.future);
if(!rows.length)throw Error(`רשת התנועות בחשבון ${a.key} נקראה ללא שורות שבוצעו (${parsed.length} שורות, מהן ${future.length} עתידיות)`);const nickname=(selected.match(/^(.+?)\s+\d(?:\s+\d){2,}/)||[])[1]?.trim()||(txt(c).match(/^(.+?)\s+\d(?:\s+\d){2,}/)||[])[1]?.trim()||`חשבון ${a.accountNumber}`;return{...a,nickname,balance,creditLimit,availableCredit:creditLimit==null?null:creditLimit+balance,transactions:rows,transactionCount:rows.length,futureTransactions:future,futureCount:future.length,chequeCount:rows.filter(r=>r.cheque).length}}
// ⚠ 22.08.2026 — גשש תקופה, **קריאה בלבד**. שתי ריצות לאומי שעות זו מזו החזירו
// חלון זהה בדיוק — 28 תנועות, 06.07 עד 02.08, פער קבוע של 31,689.07 ש״ח מול
// היתרה. חזרתיות מדויקת שוללת „loadAllRows עוצר מוקדם" (מרוץ היה משתנה) ומצביעה
// על כך שהאתר מגיש חלון קבוע. מה שעוד לא ידוע: מהו הפקד שקובע אותו, והאם לאומי
// זוכר טווח מסשן קודם — בדיוק כפי שנמדד בדיסקונט („האתר זוכר את הטווח הקודם").
// ⚠ לא נוגע בבורר החשבונות ולא משנה שום מסלול. אחרי ניסיון 20.08 שהפיל את
// הבורר, כל מה שנכנס לכאן חייב להיות תצפית בלבד — וזה מה שזה.
// ⚠⚠ 22.08.2026 — שלב שני של הגשש, ו**כאן הוא כבר לוחץ**. מה שהשלב הראשון
// החזיר: כפתור שהמלל שלו „תאריך · 40 תנועות אחרונות · טווח תאריכים · מתאריך ·
// עד תאריך", ו-`inputs` שמצא **רק** fromAmount/toAmount. כלומר ברירת המחדל של
// לאומי היא חלון **לפי מספר שורות** („40 תנועות אחרונות") ולא לפי תאריך — וזה
// מסביר למה החלון חוזר זהה ולמה collectSince אינו משפיע. מה שעדיין לא ידוע:
// האם „מתאריך"/„עד תאריך" הופכים לשדות אמיתיים כשהבורר נפתח, או שצריך לוח שנה.
// ⚠ גבולות שנשמרים כאן, אחרי מה שקרה ב-20.08: נוגעים **רק** בכפתור התאריך,
// שמזוהה לפי המלל שלו ולא לפי סלקטור מנוחש; **לא נוגעים בבורר החשבונות**;
// רץ רק אחרי שהתנועות כבר נקראו, ולכן אינו יכול לשבש את הקריאה; והבורר
// **נסגר בחזרה** ב-Escape ובלחיצה על הרקע, כדי לא להשאיר את הדף פתוח לשלב
// ההלוואות. כל כולו בתוך try — כשל בגשש לא יפיל סנכרון.
// ⚠⚠ 22.08.2026 — **התגלית שמשנה את כיוון המימוש.** `leumiDateMenu` החזיר:
//   inputs: radio name="filterRadioList" values 40, 7, 30.2, 3, 365
//           + שני input[type=text] עם placeholder "dd.mm.yy"
//   calendarCells: 0        inputsBefore: 18 == inputsAfter
// כלומר **אין לוח שנה**, ובורר התקופה הוא **קבוצת רדיו רגילה** עם ערכים
// מוכנים, לצד שני שדות טקסט לטווח מותאם. זה הרבה יותר קל ממה שחששנו.
// ⚠ ומה שנכשל: כל השדות חזרו `shown:false` ומספר הקלטים לא השתנה — כלומר
// **הלחיצה שלי לא פתחה את הפאנל**. הסיבה נמדדת מן המלל של הכפתור שמצאתי:
// „תאריך40 תנועות אחרונותטווח תאריכיםמתאריךעד תאריך7 ימים אחרונים…" —
// זהו **מכולה שמכילה את כל הפאנל המוסתר**, לא הפקד שפותח אותו. זה בדיוק
// הלקח שכבר נרשם בדיסקונט: „האלמנט הפנימי ביותר שמכיל את המזהה הוא טקסט,
// לא הפקד הלחיץ."
// **המסקנה המעשית: אין צורך לפתוח כלום כדי למדוד.** האלמנטים כבר ב-DOM,
// מוסתרים (`peer sr-only` של Tailwind — קלט מוסתר עם label נראה לצדו),
// ו-textContent קריא גם כשהם מוסתרים. לכן כאן **קריאה בלבד**: מה כל ערך
// רדיו אומר, ואיזה שדה הוא „מתאריך" ואיזה „עד תאריך".
// ⚠⚠ 22.08.2026 — הרחבת טווח בלאומי, **בנויה כולה על מדידה**. `leumiRadios`
// החזיר את המיפוי המלא של `input[name="filterRadioList"]`:
//   40   → „40 תנועות אחרונות"      ← ברירת המחדל, ואין לה שום משמעות תאריכית
//   7    → „7 ימים אחרונים"
//   30.2 → „מתחילת החודש"
//   3    → „מתחילת הרבעון"
//   365  → „שנה קלנדרית אחרונה"
// והשרשרת הראתה שהפקד הלחיץ הוא ה-`label` שעוטף את הרדיו (`cursor-pointer`),
// בתוך `div[role="radiogroup"]`. **אין לוח שנה**, ולכן אין צורך לנווט בתאים.
// ⚠ למה זה לא מנחש: הבחירה נעשית לפי `value` של רדיו אמיתי ולפי `name` שנמדד,
// והלחיצה על ה-`label` שלו — לא על סלקטור מומצא, ולא על מכולה שבמקרה מכילה
// את המלל (זו הייתה השגיאה ב-1.1.5, ולפניה בדיסקונט ב-20.08).
// ⚠ גבולות: נוגעים **רק** בתוך ה-radiogroup של המסננים. **לא בבורר החשבונות.**
// כל הפונקציה בתוך try, וכשל בה אינו מפיל סנכרון — הוא רק משאיר את חלון
// ברירת המחדל, בדיוק כפי שהיה עד היום. וכל מסלול, כולל יציאה מוקדמת, נרשם
// ל-`leumiRangeApplied` — כי רשומה חסרה נראית כמו „הקוד לא רץ", וכבר בזבזנו
// על זה סבב שלם בדיסקונט.
// ⚠⚠ 22.08.2026 — **בחירת הרדיו אינה מחילה את הסינון.** נמדד ב-1.2.0:
//   leumiRangeApplied = {reason:"הופעל", value:"365", rowsBefore:29, rowsAfter:29}
// כלומר `target.checked` אכן הפך ל-true — הבחירה עבדה — אבל **הרשת לא
// נטענה מחדש**, ולכן נקרא שוב אותו חלון ישן (06.07–02.08, 28 שורות)
// ומכאן שתי התלונות של טל: „אין סנכרון מינואר" ו„היתרה לא נכונה" (התנועות
// נעצרות ב-50,176.99 בעוד היתרה 18,487.92).
// **החסר: כפתור ההחלה.** `leumiRangeProbe` כבר צילם אותו — ברשימת ה-controls
// הופיע „סינון" שלוש פעמים. לאומי דורש לחיצה מפורשת אחרי בחירת התקופה.
// ⚠ ולמה זה לא חוזר על טעות המכולה: מחפשים אלמנט שה-**טקסט העצמי שלו קצר**
// ושווה למילה עצמה. מכולה מכילה את כל מלל הפאנל ולכן נפסלת על אורך —
// זה בדיוק מה שהכשיל את 1.1.5, וכאן הוא נמדד ונחסם.
// ⚠ „נקה"/„איפוס" מוחרגים במפורש: לחיצה עליהם הייתה מבטלת את הבחירה.
const APPLY_WORDS=/^(סינון|הצג|החל|אישור|חפש|עדכן)$/;
const REJECT_WORDS=/נקה|איפוס|ביטול|סגור/;
function applyButtonIn(scope){
  if(!scope)return null;
  return [...scope.querySelectorAll('button,[role="button"],input[type="submit"]')]
    .map(el=>({el,t:String(el.textContent||el.value||'').replace(/\s+/g,' ').trim()}))
    .filter(x=>x.t.length<=10&&APPLY_WORDS.test(x.t)&&!REJECT_WORDS.test(x.t))
    .map(x=>x.el)[0]||null;
}
// התאריך המוקדם ביותר שמוצג כרגע — הסימן האמין לכך שהרשת באמת התרעננה.
// מספר השורות אינו סימן: הוא נשאר 29 גם כשהסינון לא הוחל.
function earliestShown(){
  let best=null;
  for(const r of datedRows()){
    const m=String((r.cells||[]).join(' ')).match(/(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})/);
    if(!m)continue;
    let y=Number(m[3]);if(y<100)y+=2000;
    const ms=Date.UTC(y,Number(m[2])-1,Number(m[1]));
    if(best==null||ms<best)best=ms;
  }
  return best;
}
// ⚠⚠ 22.08.2026 — **„365" אינו „365 ימים אחרונים".** נמדד ב-1.2.1: הבחירה
// והלחיצה על „סינון" עבדו — `earliestBefore 2026-07-06 → earliestAfter
// 2025-01-01` — אבל **כל 28 השורות שנקראו הן מינואר 2025**. הגבול
// 01.01.2025 הוא בדיוק תחילת שנה קלנדרית, ולכן „שנה קלנדרית אחרונה"
// פירושה **השנה שעברה (2025)** ולא „שנה אחורה מהיום". עבור
// collectSince=2026-01-01 זו קפיצה לכיוון הלא נכון.
// **התוצאה אצל טל:** נשמרו 28 תנועות מינואר 2025, וכיוון ש-viewSince הוא
// 2026-01-01 הדשבורד הסתיר את כולן — „אין תנועות בכלל".
// **המסקנה: אין preset שמכסה „מתחילת השנה הנוכחית".** 7/30.2/3 קצרים
// מדי, ו-365 קופץ לשנה הקודמת. לכן ברירת המחדל היא עכשיו **הטווח
// המדויק** דרך שני שדות ה-dd.mm.yy שנמדדו ב-leumiDateMenu, והפריסטים
// נשארים רק כשאחד מהם מכסה בדיוק. **„365" לא נבחר יותר לעולם** —
// הוא נמדד כמוביל לשנה הלא נכונה.
// ⚠ שדה מבוקר של React אינו מגיב להשמה ישירה ל-value; חייבים את הסטר
// הנייטיב ואז input+change. זה בדיוק מה שנעשה בדיסקונט (`nativeSet`).
function nativeSet(el,value){
  const proto=Object.getPrototypeOf(el);
  const desc=Object.getOwnPropertyDescriptor(proto,'value');
  if(desc&&desc.set)desc.set.call(el,value);else el.value=value;
  el.dispatchEvent(new Event('input',{bubbles:true}));
  el.dispatchEvent(new Event('change',{bubbles:true}));
}
const ilShort=ms=>{const d=new Date(ms),p=n=>String(n).padStart(2,'0');
  return `${p(d.getDate())}.${p(d.getMonth()+1)}.${String(d.getFullYear()).slice(2)}`};
function dateRangeFields(){
  const all=[...document.querySelectorAll('input[type="text"],input:not([type])')]
    .filter(el=>/dd[.\/]mm/i.test(el.placeholder||''));
  return all.length>=2?{from:all[0],to:all[1]}:null;
}
function leumiRangeOption(sinceMs,now){
  // כמה אחורה כל אפשרות מגיעה, נכון להיום. „40" אינה תאריכית ולכן לעולם לא נבחרת.
  const y=now.getFullYear(),m=now.getMonth();
  const cover={
    '7':  new Date(y,m,now.getDate()-7).getTime(),
    '30.2':new Date(y,m,1).getTime(),
    '3':  new Date(y,Math.floor(m/3)*3,1).getTime(),
  };
  // ⚠ „365" הוסר במכוון: נמדד שהוא „שנה קלנדרית אחרונה" = השנה הקודמת,
  // ולא 365 יום אחורה. בחירתו החזירה את ינואר 2025 במקום את 2026.
  // הקטנה ביותר שמכסה את המבוקש — כדי לא למשוך יותר ממה שביקשו
  const covering=Object.entries(cover).filter(([,from])=>from<=sinceMs)
    .sort((a,b)=>b[1]-a[1]);
  if(covering.length)return{value:covering[0][0],capped:false};
  // אף preset אינו מגיע אחורה מספיק. **לא לוקחים את הרחב ביותר** — הוא
  // עדיין קצר מהמבוקש, והחלפת חלון טוב בחלון קצר יותר גורעת. מחזירים
  // null, והקורא מדווח במקום לפעול.
  return null;
}
async function applyLeumiRange(){
  const report=async(reason,extra)=>{try{await chrome.storage.local.set(
    {leumiRangeApplied:{reason,at:new Date().toISOString(),...extra}})}catch{}};
  try{
    const st=await chrome.storage.local.get({collectSince:''});
    const sinceMs=Date.parse(String(st.collectSince||''));
    if(!Number.isFinite(sinceMs))return report('אין גבול איסוף — נשאר חלון ברירת המחדל');
    const radios=[...document.querySelectorAll('input[name="filterRadioList"]')];
    if(!radios.length)return report('בורר התקופה לא נמצא בדף');
    // ── קודם כול: טווח מדויק, אם השדות קיימים. זה המסלול היחיד שמכסה
    // „מתחילת השנה הנוכחית", שאף preset אינו מכסה. ──
    const fields=dateRangeFields();
    if(fields){
      const earlyBefore0=earliestShown();
      nativeSet(fields.from,ilShort(sinceMs));
      await wait(250);
      nativeSet(fields.to,ilShort(Date.now()));
      await wait(250);
      const panel0=fields.from.closest('form')||fields.from.closest('[role="radiogroup"]')?.parentElement||document.body;
      const apply0=applyButtonIn(panel0)||applyButtonIn(panel0.parentElement)||applyButtonIn(document.body);
      if(apply0){
        realClick(apply0);
        let last0=-1,stable0=0;
        for(let i=0;i<30;i++){await wait(600);const n=datedRows().length,e=earliestShown();
          if(e!=null&&earlyBefore0!=null&&e<earlyBefore0)break;
          if(n>0&&n===last0){if(++stable0>=2)break}else stable0=0;last0=n}
        const eAfter0=earliestShown(),iso0=ms=>ms==null?'':new Date(ms).toISOString().slice(0,10);
        // ⚠ ההצלחה נמדדת ב**תזוזה אחורה**, לא בהגעה מדויקת ל-collectSince:
        // לחשבון פשוט אין בהכרח תנועה ב-1 בינואר, ודרישת שוויון סימנה ריצה
        // מוצלחת ככשל. תופס גם את המקרה שבו כן הגענו לגבול או מעברו.
        return report(eAfter0!=null&&((earlyBefore0!=null&&eAfter0<earlyBefore0)||eAfter0<=sinceMs)?'טווח מדויק הופעל':'טווח מדויק ללא שינוי מספיק',
          {from:ilShort(sinceMs),to:ilShort(Date.now()),
           earliestBefore:iso0(earlyBefore0),earliestAfter:iso0(eAfter0),rows:datedRows().length});
      }
      await report('שדות הטווח נמצאו אך אין כפתור החלה',{});
    }
    const pick=leumiRangeOption(sinceMs,new Date());
    if(!pick)return report('אין preset שמכסה, ואין שדות טווח',{since:new Date(sinceMs).toISOString().slice(0,10)});
    const target=radios.find(r=>String(r.value)===pick.value);
    if(!target)return report('האפשרות לא קיימת',{want:pick.value,have:radios.map(r=>r.value)});
    if(target.checked)return report('כבר בטווח המבוקש',{value:pick.value,capped:pick.capped});
    const before=datedRows().length;
    // הפקד הלחיץ הוא ה-label שעוטף את הרדיו — כך נמדד בשרשרת ההורים
    const label=target.closest('label')||target.parentElement;
    realClick(label);
    await wait(500);
    // אם הלחיצה לא נקלטה, ייתכן שהפאנל סגור: פותחים אותו דרך הפקד שלפני
    // ה-radiogroup, ומנסים שוב — פעם אחת בלבד.
    if(!target.checked){
      const group=target.closest('[role="radiogroup"]');
      const opener=group&&(group.closest('div')?.previousElementSibling||group.parentElement?.previousElementSibling);
      if(opener){realClick(opener);await wait(600);realClick(label);await wait(500)}
    }
    if(!target.checked)return report('הרדיו לא נבחר',{value:pick.value,rows:datedRows().length});
    // ── ההחלה: בלעדיה הבחירה נשארת על המסך והרשת לא נטענת מחדש ──
    const earlyBefore=earliestShown();
    const panel=target.closest('[role="radiogroup"]')?.parentElement||target.closest('form')||document.body;
    let apply=applyButtonIn(panel)||applyButtonIn(panel.parentElement)||applyButtonIn(document.body);
    if(!apply)return report('כפתור ההחלה לא נמצא',{value:pick.value,
      seen:[...document.querySelectorAll('button')].map(b=>String(b.textContent||'').replace(/\s+/g,' ').trim())
        .filter(t=>t&&t.length<=14).slice(0,15)});
    realClick(apply);
    // ממתינים לרשת: לא ריקה, יציבה בשתי דגימות, **או** שהמוקדמת זזה אחורה
    let last=-1,stable=0;
    for(let i=0;i<30;i++){await wait(600);const n=datedRows().length,e=earliestShown();
      if(e!=null&&earlyBefore!=null&&e<earlyBefore)break;
      if(n>0&&n===last){if(++stable>=2)break}else stable=0;last=n}
    const earlyAfter=earliestShown(),iso=ms=>ms==null?'':new Date(ms).toISOString().slice(0,10);
    await report(earlyAfter!=null&&earlyBefore!=null&&earlyAfter<earlyBefore?'הופעל':'הופעל ללא שינוי נראה',
      {value:pick.value,capped:pick.capped,rowsBefore:before,rowsAfter:datedRows().length,
       earliestBefore:iso(earlyBefore),earliestAfter:iso(earlyAfter),applyText:String(apply.textContent||'').trim().slice(0,20)});
  }catch(e){await report('נכשל',{error:String(e&&e.message||e)})}
}
function radioProbe(){
  const f=t=>String(t||'').replace(/\s+/g,' ').trim();
  // textContent ולא innerText — אלמנט מוסתר מחזיר innerText ריק
  const deep=el=>f(el&&el.textContent);
  const labelFor=el=>{
    if(!el)return'';
    if(el.id){const l=document.querySelector(`label[for="${CSS.escape(el.id)}"]`);if(l)return deep(l)}
    const own=el.closest('label');if(own)return deep(own);
    for(const sib of [el.nextElementSibling,el.previousElementSibling])if(sib&&deep(sib))return deep(sib);
    let n=el.parentElement;
    for(let i=0;i<3&&n;i++,n=n.parentElement){const t=deep(n);if(t&&t.length<60)return t}
    return'';
  };
  try{
    const radios=[...document.querySelectorAll('input[type="radio"]')].map(el=>({
      name:el.name||'',value:el.value||'',checked:!!el.checked,
      label:labelFor(el).slice(0,60)}));
    const dateFields=[...document.querySelectorAll('input[type="text"]')]
      .filter(el=>/dd[.\/]mm/i.test(el.placeholder||''))
      .map(el=>({ph:el.placeholder,value:el.value||'',label:labelFor(el).slice(0,60),
        cls:f(el.className).slice(0,40)}));
    // מועמדים לפקד שפותח את הפאנל: מטפסים מן הרדיו כלפי מעלה ורושמים מה יש בדרך,
    // כדי שהסבב הבא ידע במה ללחוץ במקום לנחש — אותה שיטה שעבדה בדיסקונט.
    const first=document.querySelector('input[name="filterRadioList"]');
    const chain=[];let n=first;
    for(let i=0;i<8&&n&&n!==document.body;i++,n=n.parentElement){
      chain.push({tag:n.tagName.toLowerCase(),cls:f(n.className).slice(0,44),
        role:n.getAttribute&&n.getAttribute('role')||'',
        exp:n.getAttribute&&n.getAttribute('aria-expanded')||'',
        hidden:!(n.offsetParent||n.getClientRects&&n.getClientRects().length),
        ownText:deep(n).slice(0,40)});
    }
    return{radios,dateFields,chain,at:new Date().toISOString()};
  }catch(e){return{probeError:String(e&&e.message||e)}}
}
async function dateMenuProbe(){
  const f=t=>String(t||'').replace(/\s+/g,' ').trim();
  const out={opened:false,closed:false};
  try{
    const btn=[...document.querySelectorAll('button,[role="button"]')]
      .find(b=>/40 תנועות אחרונות|טווח תאריכים/.test(f(txt(b))));
    if(!btn)return{...out,why:'כפתור התאריך לא נמצא'};
    out.button=f(txt(btn)).slice(0,70);
    const before=document.querySelectorAll('input').length;
    realClick(btn);
    await wait(900);
    out.opened=true;
    const DATE=/\d{1,2}[./-]\d{1,2}[./-]\d{2,4}/;
    // כל קלט שנוסף או שנראה כתאריך — כאן מתברר אם „מתאריך" הוא שדה או לוח שנה
    out.inputsAfter=[...document.querySelectorAll('input')].map(el=>({
      type:el.type||'',name:el.name||'',id:el.id||'',cls:f(el.className).slice(0,36),
      value:f(el.value).slice(0,24),ph:f(el.placeholder).slice(0,24),
      shown:!!(el.offsetParent||el.getClientRects().length)}));
    out.inputsBefore=before;
    // האפשרויות שנראות עכשיו — הטקסט בלבד, בלי לנחש מבנה
    out.options=[...document.querySelectorAll('button,[role="option"],[role="menuitem"],li,label')]
      .filter(el=>(el.offsetParent||el.getClientRects().length)&&f(txt(el)).length<44)
      .map(el=>({tag:el.tagName.toLowerCase(),cls:f(el.className).slice(0,30),t:f(txt(el))}))
      .filter(x=>x.t&&/תנועות אחרונות|טווח|מתאריך|עד תאריך|חודש|שנה|שבוע|ימים|אישור|החל|נקה/.test(x.t))
      .slice(0,20);
    out.calendarCells=document.querySelectorAll('[role="gridcell"],[class*="calendar"],[class*="datepicker"]').length;
  }catch(e){out.error=String(e&&e.message||e)}
  // סוגרים בחזרה — הדף חייב לחזור למצב שבו מצאנו אותו
  try{
    document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
    await wait(250);
    document.body.click();
    await wait(250);
    out.closed=true;
  }catch(e){out.closeError=String(e&&e.message||e)}
  return out;
}
function rangeProbe(){try{
  const f=s=>String(s||'').replace(/\s+/g,' ').trim();
  const DATE=/\d{1,2}[./-]\d{1,2}[./-]\d{2,4}/;
  const rows=datedRows(),cellDate=r=>(f(r.cells.join(' ')).match(DATE)||[''])[0];
  return{
    url:location.href,
    rows:rows.length,
    firstRowDate:rows[0]?cellDate(rows[0]):'',
    lastRowDate:rows.length?cellDate(rows[rows.length-1]):'',
    // כל קלט שנראה כשדה תאריך — סוג, ערך, וזיהוי
    inputs:[...document.querySelectorAll('input')].map(el=>({
      type:el.type||'',id:el.id||'',name:el.name||'',cls:f(el.className).slice(0,40),
      value:f(el.value).slice(0,30),ph:f(el.placeholder).slice(0,30)}))
      .filter(x=>x.type==='date'||DATE.test(x.value)||/date|tarich|from|to|period/i.test(x.id+x.name+x.cls+x.ph)).slice(0,12),
    // פקדים שנראים כבוררי תקופה, לפי המלל שלהם ולא לפי סלקטור מנוחש
    controls:[...document.querySelectorAll('button,select,[role="button"],[role="combobox"],a')]
      .map(el=>({tag:el.tagName.toLowerCase(),cls:f(el.className).slice(0,40),t:f(txt(el)).slice(0,50)}))
      .filter(x=>x.t&&/תקופה|טווח|מתאריך|עד תאריך|חודש|שנה|חיפוש מתקדם|סינון|תאריכים/.test(x.t)).slice(0,15),
    // מלל שנראה כהצהרת טווח שהדף מציג
    rangeText:(f(txt(document.body)).match(new RegExp('[^.]{0,40}'+DATE.source+'[^.]{0,20}'+DATE.source+'[^.]{0,20}'))||[''])[0].slice(0,140),
    selects:[...document.querySelectorAll('select')].map(el=>({cls:f(el.className).slice(0,30),
      value:f(el.value).slice(0,30),opts:[...el.options].map(o=>f(o.text).slice(0,24)).slice(0,10)})).slice(0,6),
    at:new Date().toISOString()};
}catch(e){return{probeError:String(e&&e.message||e)}}}
async function syncSelected(keys,balances={}){const out=[];// ⚠ הטווח נשלח **לפני** קריאת השורות. הפוך מזה — והקריאה תקדים את הבקשה,

for(const key of keys){if(accountTabs().length)await selectAccount(key);out.push(await extract(key,Number(balances[key])))}return out}
async function syncLoans(keys){const out=[];for(const key of keys){if(accountTabs().length)await selectAccount(key);let rows=[];for(let i=0;i<180;i++){rows=gridRows().map(row=>({row,cells:cellsOf(row)})).filter(x=>x.cells.some(v=>/%/.test(v))&&x.cells.filter(v=>/^\d{2}\.\d{2}\.\d{4}$/.test(v)).length>=2);if(rows.length)break;await wait(250)}const page=txt(document.body),declaredTotal=money((page.match(/סך יתרת הלוואות[\s\S]{0,200}?₪\s*([\d,]+\.\d{2})/)||[])[1]);if(declaredTotal>0&&!rows.length)throw Error(`לא נטען פירוט ההלוואות בחשבון ${key}`);const loans=[];let prevStamp='';for(const {row,cells:c} of rows){const end=c.findIndex(v=>/^\d{2}\.\d{2}\.\d{4}$/.test(v)),interest=c.findIndex(v=>/%/.test(v));if(end<1||interest<0)continue;row.querySelector('button,[role="button"]')?.click();await wait(800);const panel=txt(document.querySelector('[aria-label="הרחבת הלוואה"]')||document.querySelector('[role="complementary"]')||document.body);const nextPayment=money((panel.match(/התשלום הבא\s*₪?\s*([\d,]+\.\d{2})/)||[])[1]),nextPaymentDate=(panel.match(/תאריך התשלום הבא\s*(\d{2}\.\d{2}\.\d{4})/)||[])[1]||'';if(nextPayment==null||!nextPaymentDate)throw Error(`חסר תשלום קרוב בהלוואה בחשבון ${key}`);
// ההרחבה יושבת מחוץ לשורה, ולחיצה שנייה אינה מקפלת אותה. אם שתי שורות מחזירות את אותו תשלום — עוצרים במקום לשכפל.
const stamp=`${nextPayment}|${nextPaymentDate}`;if(rows.length>1&&stamp===prevStamp)throw Error(`הרחבת ההלוואה בחשבון ${key} לא התחלפה בין שורות (אותו תשלום קרוב ${nextPaymentDate}) — נעצר כדי לא לשכפל נתון`);prevStamp=stamp;
loans.push({type:c[0],endDate:c[end],originalPrincipal:money(c[end+1]),balance:money(c[interest-1]),interest:c[interest],startDate:c[interest+1]||'',nextPayment,nextPaymentDate});document.querySelector('button[aria-label="סגירה חלון"]')?.click();await wait(180)}if(declaredTotal>0&&!loans.length)throw Error(`לא אומתו הלוואות בחשבון ${key}`);out.push({key,loans,loansTotal:loans.reduce((sum,l)=>sum+(l.balance||0),0),loanCount:loans.length})}return out}
async function openCheque(m){await selectAccount(`${m.branch}-${m.accountNumber}`);const date=String(m.date||'').replace(/\//g,'.'),amount=Number(m.amount)||0;for(let i=0;i<40;i++){if(datedRows().length)break;await wait(250)}
// בדף השיקים הכותרות שונות, ולכן ההתאמה סמנטית: אותה שורה מכילה את התאריך וגם סכום זהה.
const hit=datedRows().find(({cells})=>cells.some(v=>v===date)&&cells.some(v=>Math.abs((money(v)||0)-amount)<0.01));if(!hit)throw Error('לא נמצא צילום שיק תואם לפי תאריך וסכום');hit.row.querySelector('button,[role="button"]')?.click();await wait(900)}
})();
