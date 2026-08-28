(()=>{
// שומר הזרקה עמיד למות הקשר — ראה discount-content.js
if(window.__leumiSyncLoaded){try{if(window.__leumiSyncLoaded())return}catch(e){}}
// ⚠ ההפניה נתפסת כאן ולא נקראת מחדש בכל בדיקה: קריאה מחדש
// מחזירה את ה-chrome החדש, והגשש מדווח „חי" גם כשההקשר שלו מת. נתפס בבדיקה.
const __rt__leumiSyncLoaded=(()=>{try{return chrome.runtime}catch(e){return null}})();
window.__leumiSyncLoaded=()=>{try{return !!(__rt__leumiSyncLoaded&&__rt__leumiSyncLoaded.id)}catch(e){return false}};
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
chrome.runtime.onMessage.addListener((m,_s,reply)=>{if(m?.type==='LEUMI_PING'){reply({ok:true});return}if(m?.type==='LEUMI_SNAPSHOT'){reply({ok:true,debug:snapshot()});return}if(m?.type==='LEUMI_DISCOVER'){discover().then(accounts=>reply({ok:true,accounts,strategy:lastStrategy,optionProbe:lastOptionProbe})).catch(e=>reply({ok:false,error:e.message,debug:snapshot(),strategy:lastStrategy,optionProbe:lastOptionProbe}));return true}if(m?.type==='LEUMI_GO'){goRoute(m.path||'').then(reply).catch(e=>reply({ok:false,error:e.message}));return true}if(m?.type==='LEUMI_SYNC_SELECTED'){syncSelected(m.keys||[],m.balances||{}).then(async accounts=>reply({ok:true,accounts,rangeProbe:rangeProbe(),radios:radioProbe(),grid:gridProbe(),dateMenu:await dateMenuProbe()})).catch(e=>reply({ok:false,error:e.message,debug:snapshot()}));return true}if(m?.type==='LEUMI_LOANS_SELECTED'){syncLoans(m.keys||[]).then(accounts=>reply({ok:true,accounts})).catch(e=>reply({ok:false,error:e.message,debug:snapshot()}));return true}if(m?.type==='LEUMI_CHEQUE_IMAGES'){chequeImages(m.wanted||[],m.key||'',m.offset||0,m.total||0).then(images=>reply({ok:true,images})).catch(e=>reply({ok:false,error:e.message,debug:snapshot()}));return true}if(m?.type==='LEUMI_OPEN_CHEQUE'){openCheque(m).then(()=>reply({ok:true})).catch(e=>reply({ok:false,error:e.message}));return true}});
// הרחבת שורת התנועה מזריקה את צילום השיק כ-data:image ישירות ל-DOM — קדמי ואחורי.
// לכן התמונה נלקחת מהשורה עצמה ואין שום התאמה לפי תאריך וסכום, שממילא אינה חד-ערכית.
// ⚠ בלי בחירת החשבון הקציר רץ על החשבון שבמקרה פעיל, ולכן לכל חשבון פרט לאחרון
// לא נמצאו שורות תואמות ולא נשמר אף צילום.
async function chequeImages(wanted,key,offset=0,total=0){const notFound=[]; const noImage=[];if(key&&accountTabs().length)await selectAccount(key);await openCurrentAccount();
// ⚠⚠ 23.08.2026 — טל: „אין צילומי שיקים". נמדד:
//   leumiChequeReport = {asked:15, saved:0, failed:0, already:0, why:""}
// התבקשו 15 ונשמרו 0, **בלי אף כשל** — כלומר כולם דולגו בשקט בשורת
// `if(!hit)continue` שלמטה. הסיבה: הפונקציה הזו **טוענת את הרשת מחדש**,
// ולא החילה את הטווח שוב — לכן היא חיפשה אסמכתאות מינואר בתוך חלון
// ברירת המחדל („40 התנועות האחרונות"), ולא מצאה אף אחת.
// **זו תופעת לוואי של תיקון הטווח עצמו:** כל עוד החלון היה ממילא
// יולי-אוגוסט, האסמכתאות היו שם והשיקים נשמרו (23, ואז 16).
// ⚠ 25.08.2026 — חלון יחיד לא מספיק גם כאן. אם הטווח המבוקש ארוך
// מחודשיים, שיק מינואר לעולם לא יימצא בחלון של אוגוסט — וזה בדיוק
// הכשל של 1.3.2, בלבוש חדש. לכן מחילים את **החלון שמכיל את השיק**,
// ומחליפים חלון רק כשצריך.
const chqSt=await chrome.storage.local.get({collectSince:''});
const chqUntil=Date.now();
const chqAsked=Date.parse(String(chqSt.collectSince||''));
const chqSince=Number.isFinite(chqAsked)?Math.max(chqAsked,chqUntil-LEUMI_MAX_BACK_MS):NaN;
// ⚠ אותו גבול כמו בקריאת התנועות: הבקשה מחזירה **מקטע אחד** שמתחיל
// בתאריך ה-from. לכן כדי להגיע לשיק מ-15.05 מבקשים טווח שמתחיל ב-14.05,
// והמקטע שיחזור יכיל אותו. בלי זה שיק מחוץ למקטע הראשון לא יימצא לעולם —
// זה כשל 1.3.2 בלבוש חדש.
let curFrom=null,curLatest=null;
const chqProbe={at:new Date().toISOString(),applies:0,misses:[]};
const ensureWindowFor=async(dateStr)=>{
  if(!Number.isFinite(chqSince))return;
  const ms=ilToMs(dateStr);
  if(!Number.isFinite(ms))return;
  if(curFrom!=null&&curLatest!=null&&ms>=curFrom&&ms<=curLatest)return;
  const from=Math.max(ms-864e5,chqSince);
  await applyLeumiRange(from,chqUntil);
  try{await openCurrentAccount();await loadAllRows()}catch(e){}
  // ⚠⚠ **25.08.2026 — כאן היה `curFrom=from`, וזה עלה 30 שיקים.**
  // `from` הוא מה ש**ביקשנו**, לא מה שהדף הציג. כשההחלה נכשלת בשקט
  // (הפאנל סגור, השדות לא נמצאו) הדף ממשיך להציג מקטע מאוחר — אבל
  // הקוד הצהיר „החלון מתחיל בינואר". מאותו רגע **כל שיק שנפל בין
  // ינואר לתאריך המוצג נחשב „כבר בחלון" ולא גרם לטעינה מחדש**, ודולג
  // בשקט. נמדד: asked 94 · saved 64 · notFound 30, וכולם מינואר עד מרץ.
  // **הכלל: חלון נרשם לפי מה שנצפה בדף, לעולם לא לפי מה שהתבקש.**
  curFrom=earliestShown();curLatest=latestShown();
  chqProbe.applies++;
  // אם התאריך עדיין מחוץ למקטע שחזר — נרשם. „דילוג שקט" הוא באג בפני עצמו.
  if(curFrom==null||curLatest==null||ms<curFrom||ms>curLatest)
    chqProbe.misses.push({want:dateStr,
      got:(curFrom==null?'?':ilShort(curFrom))+'..'+(curLatest==null?'?':ilShort(curLatest))});
};
// מיון **מהישן לחדש** — אותו כיוון שבו הבנק מגיש את המקטעים, כך שכל
// מקטע נטען פעם אחת והשיקים שבתוכו נקצרים ברצף.
wanted.sort((a,b)=>(ilToMs(a.date)||0)-(ilToMs(b.date)||0));
if(!Number.isFinite(chqSince)){await applyLeumiRange();await openCurrentAccount();await loadAllRows();}
const out={};const dataSrc=()=>[...document.querySelectorAll('img')].map(i=>i.src).filter(s=>s.startsWith('data:image'));
// ⚠ חלון הצילום נשאר פתוח אחרי שיק: הוא מכסה את הטבלה וחוסם את
// הלחיצה הבאה, וגם מוסיף את תמונותיו ל-before כך שתמונה חדשה
// אינה מזוהה. זה מייצר "חלק כן וחלק לא". סלקטור הסגירה כבר מדוד, מ-discover().
const closeViewer=async()=>{const btn=document.querySelector('[role="dialog"] button[aria-label="סגירה"]')||document.querySelector('[role="dialog"] [aria-label*="סגירה"],[role="dialog"] [aria-label*="סגור"]');if(btn){realClick(btn);await wait(450);return}if(document.querySelector('[role="dialog"]')){document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));await wait(450)}};
for(const item of wanted){const reference=String(item.reference||'');await ensureWindowFor(item.date);const hit=datedRows().find(({cells})=>cells.includes(item.date)&&cells.includes(reference));// ⚠ דילוג שקט הוא באג בפני עצמו: הוא הסתיר 15 כשלים מאחורי „asked:15,
// saved:0, failed:0". עכשיו נספר ומדווח, כדי שלא ייראה שוב כהצלחה.
if(!hit){notFound.push(reference);continue}
chrome.runtime.sendMessage({type:'LEUMI_CHEQUE_PROGRESS',done:offset+wanted.indexOf(item)+1,total:total||wanted.length,reference}).catch(()=>{});
await closeViewer();const before=new Set(dataSrc());hit.row.querySelector('button,[role="button"]')?.click();
// 4 שניות היו קצרות, אבל 12 הוציאו את האצווה מתקרת ה-120 שניות
// וכל ששת השיקים נזרקו. 8 שניות עם יציאה מוקדמת, והתקרה הורחבה ל-300.
let fresh=[];
// WHY 27.08.2026 - טל: "למה הסנכרון של לאומי נורא איטי".
// הלולאה הזאת המתינה 32*250ms = 8 שניות **גם כששום חלון לא נפתח**, כלומר
// כששום תמונה לא יכולה להגיע. שיק כזה עלה 8 שניות ריקות בכל סנכרון מחדש.
// עכשיו: אם אחרי 1.25 שניות אין [role="dialog"] ואין תמונה חדשה - אין מה
// לחכות לו. יש חלון -> ממשיכים את 8 השניות המלאות כדי לא לקצץ טעינה אמיתית.
for(let i=0;i<32;i++){await wait(250);
  fresh=dataSrc().filter(s=>!before.has(s));
  if(fresh.length>=2)break;
  if(i===4&&!fresh.length&&!document.querySelector('[role="dialog"]'))break}
if(!fresh.length)noImage.push(reference);
if(fresh.length){out[reference]={front:fresh[0],back:fresh[1]||''};
// ⚠ שולחים כל צילום מיד ולא רק בסוף האצווה: אצווה שחורגת מהתקרה איבדה עד עכשיו
// גם את מה שכבר צולם בהצלחה (נמדד 18.08.2026 — 14 מתוך 32 אבדו כך).
chrome.runtime.sendMessage({type:'LEUMI_CHEQUE_IMAGE',reference,front:fresh[0],back:fresh[1]||''}).catch(()=>{})}}
await closeViewer();
// ⚠ הדילוגים נשלחים הלאה, אחרת הרשומה תמשיך לומר „failed:0" על כשל מלא.
if(notFound.length)out.__notFound=notFound.slice(0,20);
// WHY: "נלחץ ולא הגיעה תמונה" הוא מצב שונה מ"השורה לא נמצאה", והוא זה
// שעולה זמן. בלי לדווח עליו, הרקע אינו יכול לזכור ולדלג בפעם הבאה.
if(noImage.length)out.__noImage=noImage.slice(0,40);
// ⚠ הגשש נשמר תמיד, גם בהצלחה: „0 החלות" מול „12 החלות ו-0 החטאות"
// הם שני מצבים שונים לגמרי שנראים זהה בדוח השיקים.
try{chqProbe.misses=chqProbe.misses.slice(0,25);
  await chrome.storage.local.set({leumiChequeWindows:chqProbe})}catch{}
return out}
function snapshot(){try{const dated=datedRows(),page=normalized(txt(document.body));return{url:location.href,tables:document.querySelectorAll('table').length,rows:gridRows().length,datedRows:dated.length,cols:dated[0]?dated[0].cells.length:0,firstRow:dated[0]?dated[0].cells.slice(0,10):[],tabs:accountTabs().length,chooser:txt(chooser()).slice(0,140),shekelBefore:/₪\s*-?[\d,]+\.\d{2}/.test(page),shekelAfter:/-?[\d,]+\.\d{2}\s*₪/.test(page),head:page.slice(0,500),...probe()}}catch(e){return{snapshotError:e.message,url:location.href}}}
function probe(){try{const roleCounts={};for(const role of['table','grid','treegrid','row','rowgroup','gridcell','cell','columnheader','list','listitem']){const n=document.querySelectorAll(`[role="${role}"]`).length;if(n)roleCounts[role]=n}
const frames=[...document.querySelectorAll('iframe')].map(f=>{let doc=null;try{doc=f.contentDocument}catch{}return{id:f.id||'',name:f.name||'',src:String(f.src||'').slice(0,140),sameOrigin:Boolean(doc),innerTables:doc?doc.querySelectorAll('table').length:-1,innerRows:doc?doc.querySelectorAll('table tr,[role="row"]').length:-1}});
const dateEls=[...document.querySelectorAll('*')].filter(el=>!el.children.length&&/^\d{2}\.\d{2}\.\d{4}$/.test((el.textContent||'').trim())).slice(0,3);
// WHY: "0 שורות מתוארכות" אינו אומר **למה**. שתי הדגימות האלה מכריעות:
// rawCells מראה מה באמת יש בשורה, ו-dateish מראה איך תאריך נראה בפועל.
const rawCells=gridRows().slice(0,3).map(r=>({
  inside:r.querySelectorAll(CELL).length,
  owns:(r.getAttribute('aria-owns')||'').split(/\s+/).filter(Boolean).length,
  texts:rowCellEls(r).slice(0,10).map(c=>String(c.textContent||'').replace(/\s+/g,' ').trim().slice(0,22))}));
const dateish=[...document.querySelectorAll('*')].filter(el=>!el.children.length
  &&/^\d{1,2}[.\/-]\d{1,2}[.\/-]\d{2,4}$/.test((el.textContent||'').trim()))
  .slice(0,6).map(el=>(el.textContent||'').trim());
const chain=dateEls.map(el=>{const parts=[];let n=el;for(let i=0;i<6&&n&&n.tagName!=='BODY';i++){const role=n.getAttribute?.('role'),cls=typeof n.className==='string'&&n.className.trim()?'.'+n.className.trim().split(/\s+/).slice(0,2).join('.'):'';parts.push(`${n.tagName.toLowerCase()}${role?`[role=${role}]`:''}${cls}`);n=n.parentElement}return{path:parts.join(' < '),near:String(el.parentElement?.parentElement?.innerText||'').replace(/\s+/g,' ').slice(0,240)}});
const flat=s=>String(s||'').replace(/\s+/g,' ').trim();
const headers=[...document.querySelectorAll('[role="columnheader"]')].map(h=>flat(h.innerText||h.textContent)).slice(0,15);
const gridRowEls=[...document.querySelectorAll('[role="row"]')];
const sampleCells=gridRowEls.map(r=>[...r.querySelectorAll('[role="cell"],[role="gridcell"]')].map(c=>({t:flat(c.innerText),a:flat(c.getAttribute('aria-label')),cls:flat(typeof c.className==='string'?c.className:'').slice(0,60)}))).filter(cs=>cs.some(c=>/^\d{2}\.\d{2}\.\d{4}$/.test(c.t))).slice(0,5);
return{roleCounts,frames,rawCells,dateish,dateEls:dateEls.length,chain,headers,gridRowCount:gridRowEls.length,sampleCells,bodyLen:(document.body.innerText||'').length}}catch(e){return{probeError:e.message}}}
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
// WHY 27.08.2026 - טל: "נכשל". ה-snapshot ברגע הכשל מכריע:
//   rows:201 - cell:2017 - columnheader:9 - headers כוללות "תאריך"
//   head: "נמצאו 200 תנועות"        => **הדף מלא ותקין**
//   datedRows:0 - dateEls:0          => **הגלאי עיוור**
// אין במסמך אף עלה שכל הטקסט שלו הוא dd.mm.yyyy. הרשת שם, אנחנו לא רואים.
// (cols:0 ו-firstRow:[] אינם ראיה נוספת - הם נגזרים מ-dated[0] שאינו קיים.)
// ⚠ שלוש אפשרויות, ואין לי מדידה שמכריעה ביניהן:
//   1. שנה דו-ספרתית - שדות הטווח כבר מדווחים placeholder:"dd.mm.yy"
//   2. מפריד אחר (/ במקום .)
//   3. התאים אינם צאצאים של [role=row] - רשת וירטואלית שטוחה עם aria-owns
// **לכן הגלאי נעשה עמיד לשלושתן, ובמקביל נוסף אבחון שיכריע מי מהן זו.**
// הנרמול הוא בתא עצמו ולא בתבניות, כדי שכל /^\d{2}\.\d{2}\.\d{4}$/ שכבר
// קיים בקובץ ימשיך לעבוד בלי שינוי - שינוי רוחבי היה שובר קוד מדוד.
const DATE_CELL=/^(\d{1,2})[.\/](\d{1,2})[.\/](\d{2}|\d{4})$/;
const norm4=v=>{const m=DATE_CELL.exec(String(v==null?'':v).trim());if(!m)return v;
  const y=m[3].length===2?'20'+m[3]:m[3];
  return `${m[1].padStart(2,'0')}.${m[2].padStart(2,'0')}.${y}`};
function rowCellEls(row){
  let cells=[...row.querySelectorAll(CELL)];
  if(cells.length)return cells;
  // אפשרות 3: התא מקושר ולא מקונן
  const owns=(row.getAttribute('aria-owns')||'').split(/\s+/).filter(Boolean);
  if(owns.length){cells=owns.map(id=>document.getElementById(id)).filter(Boolean);if(cells.length)return cells}
  // נפילה אחרונה: העלים של השורה עצמה
  return [...row.querySelectorAll('*')].filter(el=>!el.children.length);
}
function cellsOf(row){return rowCellEls(row).map(c=>norm4(cellText(c)))}
function datedRows(){return gridRows().map(row=>({row,cells:cellsOf(row)})).filter(x=>x.cells.some(v=>/^\d{2}\.\d{2}\.\d{4}$/.test(v)))}
// ⚠ מספר החשבון מופיע ב-DOM לפני שכרטיס היתרה נטען. בחלון הזה קריאה מטקסט כל הדף
// תופסת את ה-₪ הראשון שנקרה בדרך — יתרה מצטברת של שורת תנועה — ומחזירה מספר שגוי בשקט.
// לכן ממתינים לכרטיס עצמו: האלמנט הקטן ביותר שמכיל את מספר החשבון וגם סכום ב-₪.
async function accountCard(a){const key=`${a.branch}-${a.accountNumber}`;for(let i=0;i<60;i++){const hits=[...document.querySelectorAll('div,section,button')].filter(el=>{const t=normalized(cellText(el));return t.length<400&&t.includes(key)&&/₪\s*-?[\d,]+\.\d{2}/.test(t)});if(hits.length)return hits.sort((x,y)=>cellText(x).length-cellText(y).length)[0];await wait(250)}return null}
function columnIndex(){const idx={};[...document.querySelectorAll('[role="columnheader"]')].forEach((h,i)=>{const label=cellText(h);if(label&&!(label in idx))idx[label]=i});return idx}
// הרשת נבנית מעצמה ברגע שנבחר חשבון ספציפי — אין כפתור לפתוח, ואין ללחוץ על כפתור לא מזוהה בדף בנק מחובר.
// WHY 27.08.2026 - כאן נמצא השקט. leumiAttempts הראה 46 שניות בלי סימן
// חיים, וזה **בדיוק** 180*250ms של הלולאה הזאת: היא ממתינה לרשת שלא
// נטענת, ואינה משמיעה קול. עכשיו היא פועמת, כדי שהסטטוס יראה במה מדובר
// ושהשומר לא יפרש המתנה מוצהרת כמוות.
async function openCurrentAccount(){for(let i=0;i<180;i++){if(datedRows().length)return;
  if(i%8===0)beat('ממתין לרשת התנועות',gridRows().length);
  await wait(250)}throw Error(`רשת התנועות לא נטענה בתוך 45 שניות (שורות ${gridRows().length}, תאים ${document.querySelectorAll(CELL).length})`)}
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
// WHY 27.08.2026 - טל: "עדיין איטי". המדידה מהאחסון הראתה שהסטטוס תקוע
// על "קורא תנועות, ניסיון 2 מתוך 3" - כלומר **ניסיון 1 נכשל**, וכל ניסiון
// כזה שורף את leumiSyncBudget במלואו (7 דקות לחשבון אחד) לפני שנודע שנכשל.
// שליחת התנועות היא הודעה **אחת** ארוכה, ולכן לרקע אין שום דרך לדעת אם
// העמוד עובד או מת - הוא רק ממתין לתקרה. פעימה קלה כל סבב פותרת את זה.
// WHY 28.08.2026 - **סוף-סוף השגיאה האמיתית**, אחרי יומיים של "מוות בשקט":
//   "The page keeping the extension port is moved into back/forward cache,
//    so the message channel is closed."
// דף שנכנס ל-back/forward cache **סוגר את כל ערוצי ההודעות של התוסף**.
// זה מסביר הכול למפרע: התשובה לעולם לא הגיעה, בלי שגיאה ובלי סיבה, תמיד
// אחרי ניווט (selectAccount / prepareLeumiRoute). השומר של 45 השניות רק
// דיווח על התסמין - "הפסיק להגיב" - כי הוא ירה לפני שהשגיאה הזאת הגיעה.
// ⚠ דף שיש לו מאזין unload **אינו כשיר ל-bfcache**. זה הפתח, והוא מוגבל
// לדף הבנק בזמן שהסקריפט שלנו חי - לא שינוי גלובלי בדפדפן.
// ⚠ pageshow עם persisted=true מסמן דף שחזר מהמטמון; אם זה יקרה בכל זאת,
// הוא נרשם במקום להיעלם.
// WHY: הרישום חייב להיות חד-פעמי. ההזרקה מחדש (שהיא חלק מהתיקון!)
// רצה **לפני** שומר הטעינה הכפולה בקבצים האלה, ובלי הדגל הזה כל
// הזרקה הייתה מוסיפה מאזין נוסף. דגל על window פותר בלי להזיז קוד.
try{if(!window.__bfcacheGuard){window.__bfcacheGuard=1;
  window.addEventListener('unload',()=>{});
  window.addEventListener('pageshow',e=>{if(e.persisted){
    try{chrome.storage.local.set({leumiBfcache:{at:new Date().toISOString(),url:String(location.href).slice(0,140)}})}catch{}}});
}}catch(e){}
const beat=(stage,rows)=>{try{chrome.runtime.sendMessage({type:'LEUMI_SYNC_PROGRESS',stage,rows}).catch(()=>{})}catch{}};
async function loadAllRows(){let last=0,stable=0;for(let i=0;i<120;i++){const rows=datedRows();if(rows.length===last){if(++stable>=5)break}else{stable=0;last=rows.length}
beat('טוען שורות',rows.length);
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
async function discover(){if(!await ready())throw Error(`דף לאומי לא נטען בתוך 45 שניות ונשאר ריק (${normalized(txt(document.body)).length} תווים בדף). ברוב המקרים זה אומר שההתחברות ללאומי פגה — התחבר מחדש באתר והרץ שוב.`);const opts=await discoverAccounts();
// WHY 28.08.2026 - טל שלח צילום: ברשימת החשבונות הופיע **שיק** -
//   "הפקדת שיק ... תאריך ערך ... אסמכתא 73416 מס' שיק 80000766 ערוץ
//    הפקדה אפליקציית לאומי חשבון משלם 11- ייצוא הדפסה"
// והוא נקרא כחשבון 153-54074.
// ⚠ parseAccount עושה את שלו **נכון** - יש בטקסט רצף שנראה כמו חשבון.
// מה שחסר הוא שהאפשרות עצמה תיבחן: חשבון או תנועה? מספר תקין בתוך
// טקסט לא נכון הוא עדיין מספר לא נכון.
// שני סימנים בלתי תלויים, ולא אחד:
//   1. אוצר מילים של תנועה - שאינו מופיע בשם חשבון
//   2. אורך חריג - שמות החשבונות האמיתיים כאן קצרים
//      ("דפנה מלכה- מלכה משק חקלאי מניב", "מתיישבי קדרון-אגג'")
// ⚠ הנדחים **נרשמים** ולא נזרקים בשקט: אם יום אחד ייפסל חשבון אמיתי,
// זה יופיע ברשומה במקום להיעלם.
const TX_WORDS=/הפקדת\s*שיק|אסמכתא|תאריך\s*ערך|מס['׳]?\s*שיק|ערוץ\s*הפקדה|חשבון\s*משלם|ייצוא\s*הדפסה/;
const rejected=[];
const looksLikeTransaction=v=>{const t=normalized(v);
  return TX_WORDS.test(t)||t.length>120};
const accounts=uniqueAccounts(opts).map(o=>{const value=txt(o),a=parseAccount(value);if(!a)return null;
if(looksLikeTransaction(value)){rejected.push({key:a.key,text:normalized(value).slice(0,120)});return null}
const name=accountName(o)||`חשבון ${a.accountNumber}`;const values=value.match(/-?[\d,]+\.\d{2}/g);return{...a,nickname:name,balance:values?.length?money(values.at(-1)):null}}).filter(Boolean);document.querySelector('[role="dialog"] button[aria-label="סגירה"]')?.click();
if(rejected.length)try{await chrome.storage.local.set({leumiRejectedOptions:{at:new Date().toISOString(),rejected}})}catch{}
return accounts}
// ⚠ selectAccount שקט לגמרי והוא רץ **בין** חשבונות - בדיוק המקום שבו
// שתיקה נראית כמו מוות. פעימה אחת בכניסה מספיקה כדי להבדיל.
async function selectAccount(key){beat(`בוחר חשבון · ${key}`,0);const current=parseAccount(txt(chooser()));if(current?.key===key)return;let option=accountTabs().find(o=>parseAccount(txt(o))?.key===key);if(!option){const opts=await options();option=opts.find(o=>parseAccount(txt(o))?.key===key)}if(!option){
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
// ⚠ 25.08.2026 — כאן היה `applyLeumiRange` יחיד, וזה מה שהגביל ל-29 שורות:
// לאומי חותך לחודשיים, וחלון אחד החזיר חודש. עכשיו נקראים כל החלונות.
const collected=await collectRangeRows(expectedKey),raw=collected.cells;const c=chooser(),a=parseAccount(expectedKey)||parseAccount(txt(c));if(!a)throw Error('לא זוהה החשבון הפעיל בלאומי');// ⚠ בדלתא, אפס שורות חדשות הוא מצב חוקי — חשבון בלי תנועה בחודש.
// הכישלון הוא רק כשאין **כלום**: לא חדש ולא שמור.
if(!raw.length&&!(collected.prev||[]).length)throw Error(`לא נטענו תנועות בחשבון ${a.key}`);const selected=[...document.querySelectorAll('[role="tab"][aria-selected="true"]')].map(txt).find(v=>parseAccount(v)?.key===a.key)||txt(c);const card=await accountCard(a);const cardText=card?normalized(cellText(card)):'';const balanceMatch=cardText.match(new RegExp(`${a.branch}-${a.accountNumber}(?:\\/\\d+)?[^₪]{0,20}₪\\s*(-?[\\d,]+\\.\\d{2})`));let balance=balanceMatch?money(balanceMatch[1]):null;// היתרה כבר נקראה מבורר החשבונות בזיהוי; אין סיבה להיכשל אם כרטיס היתרה לא רונדר.
if(balance==null&&Number.isFinite(fallbackBalance))balance=fallbackBalance;if(balance==null)throw Error(`לא זוהתה יתרת עו״ש בחשבון ${a.key} — לא בכרטיס היתרה ולא בבורר`);const limitMatch=cardText.match(/מסגרת אשראי\s*₪?\s*(-?[\d,]+\.\d{2})/);const creditLimit=limitMatch?money(limitMatch[1]):null;// העמודות נקראות לפי כותרת ולא לפי היסט קבוע. נמדד מול הדף החי: תאריך|תנועות|אסמכתא|חובה|זכות|יתרה מצטברת.
const idx=columnIndex(),col=(label,fallback)=>Number.isInteger(idx[label])?idx[label]:fallback;
const iDate=col('תאריך',1),iAction=col('תנועות',2),iRef=col('אסמכתא',3),iDebit=col('חובה',4),iCredit=col('זכות',5),iBalance=col('יתרה מצטברת',6);
// שורה עתידית ממלאת גם חובה וגם זכות ומשאירה את היתרה המצטברת ריקה — זה המבחן, ולא השוואת תאריכים.
// WHY 27.08.2026 - טל: "נכשל הסנכרון" עם הודעה חדשה: "200 שורות, מהן 200
// עתידיות". rawCells ו-dateish הכריעו בין שלוש ההשערות:
//   dateish: ["01.01.26",...]      => אפשרות 1, שנה דו-ספרתית. norm4 תיקן.
//   rawCells: inside:10, owns:0    => התאים **כן** מקוננים. אפשרות 3 נשללה.
// ומיד נחשף השלב הבא: עמודת "יתרה מצטברת" אינה מספר אלא טקסט מאוחד -
//   "סכום ₪ 3,540.00 יתרה מצטברת ₪ 44,079.56"
// money() מסיר תווים ומקבל "3540.0044079.56" => NaN => null. ומכיוון
// ש-future נקבע לפי rowBalance==null, **כל 200 השורות סווגו כעתידיות.**
// ⚠ שים לב שהמבחן עצמו נכון ולא שונה: שורה עתידית באמת אין לה יתרה
// מצטברת. מה שנשבר הוא **הקריאה** של הערך, לא הכלל.
// WHY: הבדיקה שלי תפסה השחתה שקטה. בשורה **עתידית** התא המאוחד מכיל
// רק "סכום ₪ -100.00" בלי "יתרה מצטברת", ו-money() היה מפרש את הסכום
// כיתרה מצטברת - כלומר שורה עתידית הייתה נספרת כמבוצעת עם יתרה מומצאת,
// ושרשרת היתרות (gapOf) הייתה נשברת בלי שאיש ידע.
// לכן: תא מאוחד נקרא **רק** לפי התווית; תא רגיל כמו קודם.
const MERGED_CELL=/סכום|יתרה\s*מצטברת/;
const runningBalance=cells=>{for(const v of cells){
  const m=String(v||'').match(/יתרה\s*מצטברת\s*₪?\s*(-?[\d,]+\.\d{2})/);
  if(m)return money(m[1])}return null};
const parsed=raw.map(cells=>{const date=cells[iDate]||'';if(!/^\d{2}\.\d{2}\.\d{4}$/.test(date))return null;const action=cells[iAction]||'',credit=money(cells[iCredit]),rowBalance=MERGED_CELL.test(String(cells[iBalance]||''))?runningBalance(cells):money(cells[iBalance]);return{date,action,details:'',reference:cells[iRef]||'',debit:money(cells[iDebit]),credit,balance:rowBalance,future:rowBalance==null,cheque:/שיק/.test(action)&&credit>0,chequeAmount:credit}}).filter(Boolean);
// ⚠ המיזוג עם מה שכבר שמור. בקריאה מלאה `collected.prev` ריק והתוצאה
// זהה לקודם; בדלתא זה מה שמשלים את התקופה שלא נקראה שוב.
const rows=mergeRows(collected.prev||[],parsed.filter(r=>!r.future)),future=parsed.filter(r=>r.future);
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
// ⚠ 25.08.2026 — התאריך המאוחר ביותר, מול המוקדם ביותר. בלעדיו לא ניתן
// לדעת אם הקצה העליון של הטווח (`to`) בכלל כובד, ו„הטווח נחתך" נראה
// זהה ל„הטווח הוחל אבל נקראו מעט שורות".
function latestShown(){
  let best=null;
  for(const r of datedRows()){
    const m=String((r.cells||[]).join(' ')).match(/(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})/);
    if(!m)continue;
    let y=Number(m[3]);if(y<100)y+=2000;
    const ms=Date.UTC(y,Number(m[2])-1,Number(m[1]));
    if(best==null||ms>best)best=ms;
  }
  return best;
}
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
// ⚠ 25.08.2026 — הגשש הוחזר. הוא הוסר ב„חזרה ל-1.2.5", והפריט שהוא נועד
// למדוד נשאר פתוח מאז. הוא **קריאה בלבד** ורץ אחרי שהקריאה הסתיימה.
// ⚠ ההשערה שהוא נבנה לבדוק (רשת וירטואלית) כנראה שגויה — טל דיווח
// שהטווח חסום לחודשיים, וזה מסביר את המספר. הגשש נשאר כדי **להפריך**:
// אם אחרי החלונות עדיין ייקרא מספר קבוע, הוא יגיד אם יש בכלל וירטואליזציה.
// ⚠⚠ 22.08.2026 — גשש מבנה הרשת. **קריאה בלבד: אפס לחיצות, אפס גלילה.**
// הרקע: הקריאה נעצרת על ~29 שורות גם כשהטווח רחב, ו**שני ניסיונות תיקון
// עיוורים נכשלו** — האחרון אף החמיר (13 שורות ו-70 שניות, ראה 1.2.5).
// לכן לפני ניסיון שלישי מודדים **מה בכלל מפעיל טעינת עמוד נוסף**:
//   · האם הרשת מווירטואלית (aria-rowcount מול שורות ב-DOM, transform/top
//     על השורות, data-index) — אם כן, שורות מתחלפות ואין „לגלול עד הסוף";
//   · האם יש „זקיף" של IntersectionObserver בתחתית (אלמנט זעיר/ריק,
//     או שם מחלקה עם sentinel/loader/spinner/observer);
//   · האם יש פקדי עימוד או ספירה מוצהרת („מוצגות X מתוך Y");
//   · מי האב הנגלל בפועל, ומה היחס scrollHeight/clientHeight.
// כל אלה **תצפית**. שום מסקנה לא תיכתב לקוד לפני שהמספרים יגיעו.
// ⚠ רץ **אחרי** שהקריאה הסתיימה, ולכן אינו יכול לשבש אותה.
function gridProbe(){
  const f=t=>String(t||'').replace(/\s+/g,' ').trim();
  try{
    const rows=datedRows();
    const tail=rows.at(-1)?.row,head=rows[0]?.row;
    // האבות הנגללים בפועל, עם המידות — בלי לגעת בהם
    const chain=[];let n=tail;
    for(let i=0;i<10&&n&&n!==document.body;i++,n=n.parentElement){
      const st=getComputedStyle(n);
      chain.push({tag:n.tagName.toLowerCase(),cls:f(n.className).slice(0,38),
        role:n.getAttribute&&n.getAttribute('role')||'',
        sh:n.scrollHeight,ch:n.clientHeight,top:n.scrollTop,
        ov:`${st.overflowY}`,scrollable:n.scrollHeight>n.clientHeight+8});
    }
    // סימני וירטואליזציה
    const grid=tail&&tail.closest('[role="grid"],[role="table"],table');
    const rowStyle=tail?getComputedStyle(tail):null;
    const declared=(()=>{for(const el of document.querySelectorAll('[aria-rowcount],[data-total],[data-count]')){
      const v=el.getAttribute('aria-rowcount')||el.getAttribute('data-total')||el.getAttribute('data-count');
      if(v)return {attr:v,on:f(el.className).slice(0,30)}}return null})();
    const totalText=(f(document.body.innerText).match(/(מוצג\w*|מתוך)[^.]{0,40}\d+[^.]{0,25}/)||[''])[0].slice(0,90);
    // מועמדים ל„זקיף" בתחתית הרשימה: אלמנט אחרון, זעיר או בעל שם מרמז
    const sentinels=[...document.querySelectorAll('div,span,li')]
      .filter(el=>/sentinel|observer|loader|spinner|infinite|load-more|end-of/i.test(String(el.className||'')))
      .map(el=>({cls:f(el.className).slice(0,40),h:el.getBoundingClientRect().height})).slice(0,8);
    const afterTail=tail&&tail.nextElementSibling;
    return{
      rowsInDom:rows.length,
      firstDate:head?f(rows[0].cells.join(' ')).match(/\d{1,2}[./]\d{1,2}[./]\d{2,4}/)?.[0]||'':'',
      lastDate:tail?f(rows.at(-1).cells.join(' ')).match(/\d{1,2}[./]\d{1,2}[./]\d{2,4}/)?.[0]||'':'',
      declared,totalText,
      gridRole:grid?`${grid.tagName.toLowerCase()}[${grid.getAttribute('role')||''}]`:'',
      gridAriaRowCount:grid?grid.getAttribute('aria-rowcount')||'':'',
      rowPosition:rowStyle?rowStyle.position:'',
      rowTransform:rowStyle?String(rowStyle.transform).slice(0,30):'',
      rowHasIndex:tail?!!(tail.getAttribute('data-index')||tail.getAttribute('aria-rowindex')):false,
      siblingAfterTail:afterTail?{tag:afterTail.tagName.toLowerCase(),
        cls:f(afterTail.className).slice(0,40),h:afterTail.getBoundingClientRect().height,
        text:f(afterTail.textContent).slice(0,40)}:null,
      sentinels,
      chain,
      at:new Date().toISOString()};
  }catch(e){return{probeError:String(e&&e.message||e)}}
}

// ⚠⚠ **היסטוריית ההנחות כאן, כי כל אחת מהן עלתה סבב שלם:**
//  1. „הרשת מווירטואלית / צריך לגלול" — **הופרך** ב-25.08 ע"י `gridProbe`:
//     אין וירטואליזציה, אין זקיף, ואף אב אינו נגלל.
//  2. „לאומי חוסם את הטווח לחודשיים" (1.5.0, שלי) — **הופרך** ע"י טל:
//     „אין מגבלה עד שנתיים אחורה וברצף."
//  3. „התאריכים לא נבררים נכון" — **נבדק ונשלל**: `wrote` זהה למבוקש,
//     `placeholder` הוא dd.mm.yy, והדף מציג „01.01.26 - 25.08.26".
// **מה שנשאר, ונמדד:** הטווח מתקבל במלואו, אבל הבנק מחזיר **מקטע אחד**
// שמתחיל בקצה המוקדם שלו (01.01 → 03.02, 29 שורות). לכן ההליכה קדימה.
// מעבר לשנתיים אין נתונים בבנק. אין טעם לבקש, וזה גם מונע ניסיון חוזר עקר.
const LEUMI_MAX_BACK_MS=730*864e5;
// dd.mm.yyyy → ms. חייב פרסור מפורש; Date.parse קורא את זה כאמריקאי.
function ilToMs(v){const m=String(v||'').match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  return m?Date.UTC(+m[3],+m[2]-1,+m[1]):NaN}
// ⚠⚠ **25.08.2026 — נמדד חי, וזה מפריך גם את 1.5.0 וגם את הנחת הגלילה.**
// ביקשנו `01.01.26 - 25.08.26`, והדף **קיבל את הטווח במלואו**:
//   wrote:{from:"01.01.26",to:"25.08.26"} · rangeText:"01.01.26 - 25.08.26"
//   „1 סננים פעילים" · כל ה-filterRadioList ב-checked:false
//   earliestAfter: 2026-01-01   ← הקצה התחתון כובד במדויק
// ואף על פי כן: **latestAfter: 2026-02-02, ורק 29 שורות.**
// `gridProbe` סגר את הכיוון השני: rowsInDom 29, sentinels [],
// siblingAfterTail null, rowTransform "none", rowHasIndex false,
// ו**אף אב אינו נגלל** (table-scroll: scrollHeight === clientHeight).
// **אין וירטואליזציה, אין זקיף, ואין לאן לגלול.** הדף החזיר מקטע אחד.
//
// **המסקנה:** הבנק מגיש עד שנתיים (טל, 25.08) אבל **מחזיר מקטע אחד לכל
// בקשה**, מהקצה המוקדם של הטווח. לכן אין „לטעון עוד שורות" — צריך
// **לבקש שוב, החל מהמקום שבו המקטע נגמר.**
//
// ⚠ החלון אינו קבוע בכוונה. גודל המקטע (~חודש? ~29 שורות?) **לא נמדד**,
// וכל קבוע שאבחר יהיה ניחוש. ההליכה מתקדמת לפי **התאריך האחרון שהוחזר
// בפועל**, ולכן היא מתכווננת מעצמה יהיה הגבול אשר יהיה.
// ⚠ 25.08.2026, בקשת טל — **סנכרון דלתא.** קריאה מלאה מ-01.01 היא תשעה
// מקטעים ו-129 שיקים בכל ריצה, כש-99 מהם כבר שמורים. הדלתא קוראת רק
// מ-`lastSync` פחות חפיפה.
// ⚠ החפיפה אינה קישוט: תנועה בלאומי משנה תאריך רטרואקטיבית (נמדד —
// `action` נושא תאריך שונה מ-`date`), ודלתא מ-`lastSync` המדויק הייתה
// מפספסת תיקון בתנועה ישנה.
// ⚠ ההרחבה **גיאומטרית ולא זוחלת**: 60 יום, אחר כך 180, ואז ישר לרצפה.
// הרחבה בקפיצות קבועות הייתה יכולה לדרוש חמש הליכות מלאות — כלומר
// **איטית יותר מקריאה מלאה אחת**, וזה מפספס את כל מטרת הדלתא.
// ארבע הליכות במקרה הגרוע, אחת במקרה הרגיל.
const DELTA_OVERLAP_DAYS=30,DELTA_WIDEN_DAYS=60,DELTA_MAX_WIDEN=4;
// מפתח שורה משותף לשני העולמות: שורה גולמית מן הדף, ותנועה מפוענחת
// שכבר שמורה. **היתרה המצטברת חלק מן המפתח** — היא מה שהופך „אותה
// תנועה" ל„אותו מצב חשבון", וזו כל הבדיקה.
// ⚠⚠ 28.08.2026 - נמדד בגשש המפתחות (freshKeys הסתיימו כולם ב-"||"):
// התא המאוחד של 1.42.0 ("סכום ₪ X יתרה מצטברת ₪ Y") שבר את קריאת היתרה
// **כאן** - money() על הטקסט המאוחד מחזיר NaN - בעוד הקורא הראשי (~441)
// כבר תוקן. לכן העוגן לא נתפס אף פעם והדלתא ניוונה לקריאה מלאה.
// העתק מכוון של הלוגיקה מהקורא הראשי (MERGED_CELL/runningBalance חיים
// בסקופ אחר): תא מאוחד נקרא רק לפי התווית; תא רגיל כמו קודם. כל תיקון
// עתידי חייב לעבור על שני המקומות.
function keyBalanceOfCells(cells,col){
  const v=String(cells[col('יתרה מצטברת',6)]||'');
  if(/סכום|יתרה\s*מצטברת/.test(v)){
    for(const c of cells){const m=String(c||'').match(/יתרה\s*מצטברת\s*₪?\s*(-?[\d,]+\.\d{2})/);if(m)return money(m[1])}
    return null;
  }
  return money(v);
}
function rowKeyOfCells(cells,col){
  return [cells[col('תאריך',1)]||'',cells[col('אסמכתא',3)]||'',
    money(cells[col('חובה',4)]),money(cells[col('זכות',5)]),
    keyBalanceOfCells(cells,col)].join('|');
}
const rowKeyOfSaved=r=>[r.date||'',r.reference||'',r.debit,r.credit,r.balance].join('|');
// ההליכה עצמה, שאומתה חי (9 מקטעים, 196 תנועות): מבקשת מקטע, קוראת,
// ומקדמת את `from` לתאריך האחרון שחזר בפועל.
async function walkFrom(fromMs,untilMs){
  const seen=new Set(),out=[],log=[];
  let from=fromMs,prevLatest=null,stop='';
  for(let step=0;step<24;step++){
    await applyLeumiRange(from,untilMs);
    let empty=false;
    if(!datedRows().length){for(let i=0;i<32;i++){await wait(250);if(datedRows().length)break}}
    if(!datedRows().length)empty=true;else{try{await loadAllRows()}catch(e){empty=true}}
    const cells=empty?[]:datedRows().map(x=>x.cells);
    let added=0;
    for(const c of cells){const k=c.join('|');if(seen.has(k))continue;seen.add(k);out.push(c);added++}
    const latest=empty?null:latestShown();
    log.push({from:ilShort(from),read:cells.length,added,
      latest:latest==null?'':ilShort(latest),empty});
    if(empty||latest==null){stop='מקטע ריק';break}
    if(latest>=untilMs-864e5){stop='הגיע להיום';break}
    if(prevLatest!=null&&latest<=prevLatest){stop='אין התקדמות';break}
    prevLatest=latest;from=latest;
  }
  return{cells:out,steps:log,stop};
}
// ⚠⚠ **„אם אין התאמה ליתרות — ללכת עוד אחורה עד שתהיה" (טל, 25.08).**
// המבחן: **השורה הישנה ביותר שנקראה חייבת להיות שורה שכבר שמורה אצלנו,
// זהה לחלוטין כולל היתרה המצטברת.** אם כן — התפר מעוגן, ואין חור בין
// מה שיש למה שנקרא. אם לא — התנועות הישנות השתנו, או שהחלון קצר מדי,
// ואז מרחיבים 60 יום אחורה ומנסים שוב, עד `collectSince`.
// ⚠ הרחבה נעצרת ב-`collectSince` ולא נמשכת לנצח: שם ממילא נקראת כל
// התקופה, ואין „עוד אחורה" שיש בו טעם.
async function collectRangeRows(expectedKey){
  const st=await chrome.storage.local.get({collectSince:'',accounts:[]});
  const untilMs=Date.now();
  const asked=Date.parse(String(st.collectSince||''));
  const floorMs=Number.isFinite(asked)?Math.max(asked,untilMs-LEUMI_MAX_BACK_MS):asked;
  if(!Number.isFinite(floorMs)){
    await applyLeumiRange();await openCurrentAccount();await loadAllRows();
    return{cells:datedRows().map(x=>x.cells),prev:[]};
  }
  const acc=(st.accounts||[]).find(a=>a&&a.source==='leumi'&&a.selectionKey===`leumi|${expectedKey}`);
  const prev=Array.isArray(acc&&acc.transactions)?acc.transactions.filter(r=>r&&r.date):[];
  const lastSyncMs=Date.parse(String((acc&&acc.lastSync)||''));
  // מיפוי מפתח→מיקום, כדי לדעת לא רק **אם** יש הסכמה אלא **היכן** —
  // ומשם לקצץ את השמור.
  const prevIndex=new Map();prev.forEach((r,i)=>{prevIndex.set(rowKeyOfSaved(r),i)});
  let keep=prev;
  const idx=columnIndex(),col=(l,f)=>Number.isInteger(idx[l])?idx[l]:f;
  const useDelta=prev.length>0&&Number.isFinite(lastSyncMs);
  let from=useDelta?Math.max(floorMs,lastSyncMs-DELTA_OVERLAP_DAYS*864e5):floorMs;
  const report={at:new Date().toISOString(),key:String(expectedKey||''),
    mode:useDelta?'דלתא':'מלא',prevRows:prev.length,
    lastSync:Number.isFinite(lastSyncMs)?ilShort(lastSyncMs):'',attempts:[]};
  let result={cells:[],steps:[],stop:''};
  for(let attempt=0;attempt<DELTA_MAX_WIDEN;attempt++){
    result=await walkFrom(from,untilMs);
    // ⚠⚠ **„לחפש את היתרה האחרונה בבנק התואמת, ומשם להריץ עדכון"
    // (טל, 25.08).** העיגון הוא על **נקודת ההסכמה האחרונה** — השורה
    // החדשה ביותר שהבנק מחזיר ושכבר שמורה אצלנו זהה לחלוטין, כולל
    // היתרה המצטברת.
    // ⚠ **זה עדיף על עיגון בשורה הישנה ביותר, וזה לא ניואנס:** שורה
    // שתוקנה רטרואקטיבית הייתה נכנסת **פעמיים** — הגרסה הישנה מן
    // השמור והחדשה מן הבנק — כי המפתח כולל את היתרה ולכן הן שונות.
    // עכשיו כל מה ששמור **אחרי** נקודת ההסכמה נזרק, והבנק הוא המקור
    // היחיד משם והלאה.
    const full=from<=floorMs;
    let anchorPos=-1,pIdx=-1;
    for(let i=result.cells.length-1;i>=0&&anchorPos<0;i--){
      const k=rowKeyOfCells(result.cells[i],col);
      const at=prevIndex.get(k);
      if(at!=null){anchorPos=i;pIdx=at}
    }
    const anchored=anchorPos>=0||full;
    report.attempts.push({from:ilShort(from),rows:result.cells.length,
      anchored,full,anchorAt:anchorPos>=0?String(result.cells[anchorPos][col('תאריך',1)]||''):'',
      droppedFromSaved:pIdx>=0?prev.length-(pIdx+1):0,stop:result.stop,
      // ⚠ 28.08.2026 - טל: "למה הוא טוען הכל מחדש?" נמדד: העוגן לא נתפס אף
      // פעם (anchored:false בכל הניסיונות) והדלתא ניוונה לקריאה מלאה. כשל
      // עיגון רושם את המפתחות משני הצדדים - ההשוואה תגיד איזה שדה שבור,
      // במקום לנחש. נשאר מקומי כמו כל האבחון.
      ...(anchored?{}:{freshKeys:result.cells.slice(-3).map(c=>rowKeyOfCells(c,col)),
        savedKeys:[...prev.slice(0,2),...prev.slice(-2)].map(rowKeyOfSaved)})});
    if(anchored){
      report.anchoredAt=ilShort(from);
      // ⚠⚠ **בתוך החלון שנקרא, הבנק הוא המקור היחיד.**
      // עיגון על „ההסכמה האחרונה" בלבד לא הספיק, ובדיקה תפסה זאת:
      // שורה שתוקנה רטרואקטיבית **לפני** נקודת ההסכמה נשארה בשמור
      // בגרסתה הישנה, והבנק החזיר את החדשה — **שתי גרסאות של אותה
      // תנועה** (נמדד: כפילות אחת בדיוק).
      // לכן נשמר רק מה שישן מן השורה הראשונה שהבנק החזיר; כל השאר
      // נקרא מחדש ממילא. נקודת ההסכמה נשארת **מבחן התקינות** — היא
      // מוכיחה שהחלון חופף למה שיש לנו ואין חור באמצע.
      const oldestMs=result.cells.length?ilToMs(String(result.cells[0][col('תאריך',1)]||'')):NaN;
      keep=Number.isFinite(oldestMs)
        ?prev.filter(r=>{const t=ilToMs(String(r.date||''));return Number.isFinite(t)&&t<oldestMs})
        :(full?[]:prev);
      report.oldestFromBank=Number.isFinite(oldestMs)?ilShort(oldestMs):'';
      break}
    if(full)break;
    from=Math.max(floorMs,from-DELTA_WIDEN_DAYS*Math.pow(3,attempt)*864e5);
  }
  report.total=result.cells.length;report.steps=result.steps;
  report.keptFromSaved=keep.length;
  try{await chrome.storage.local.set({leumiDelta:report})}catch{}
  return{cells:result.cells,prev:keep};
}
// מיזוג: מה שכבר שמור, ומה שנקרא עכשיו. **המפתח כולל את היתרה
// המצטברת**, ולכן תנועה שתוקנה רטרואקטיבית נכנסת כשורה נפרדת ולא
// נבלעת בישנה. מיון עולה בתאריך, כי `gapOf` ברקע משווה את **האחרונה**
// ליתרת החשבון.
function mergeRows(prev,fresh){
  const seen=new Set(),out=[];
  for(const r of [...prev,...fresh]){const k=rowKeyOfSaved(r);if(seen.has(k))continue;seen.add(k);out.push(r)}
  const stamp=v=>{const m=String(v||'').match(/^(\d{2})\.(\d{2})\.(\d{4})$/);return m?Date.UTC(+m[3],+m[2]-1,+m[1]):0};
  return out.sort((a,b)=>stamp(a.date)-stamp(b.date));
}
async function applyLeumiRange(winFrom,winTo){
  const report=async(reason,extra)=>{try{await chrome.storage.local.set(
    {leumiRangeApplied:{reason,at:new Date().toISOString(),...extra}})}catch{}};
  try{
    // ⚠ 25.08.2026 — הפונקציה מקבלת עכשיו חלון מפורש. בלי ארגומנטים
    // ההתנהגות זהה לקודם (collectSince → היום), כדי שקוראים ישנים לא ישתנו.
    let sinceMs=Number(winFrom);
    const untilMs=Number.isFinite(Number(winTo))?Number(winTo):Date.now();
    if(!Number.isFinite(sinceMs)){
      const st=await chrome.storage.local.get({collectSince:''});
      sinceMs=Date.parse(String(st.collectSince||''));
    }
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
      nativeSet(fields.to,ilShort(untilMs));
      await wait(250);
      const panel0=fields.from.closest('form')||fields.from.closest('[role="radiogroup"]')?.parentElement||document.body;
      const apply0=applyButtonIn(panel0)||applyButtonIn(panel0.parentElement)||applyButtonIn(document.body);
      if(apply0){
        realClick(apply0);
        let last0=-1,stable0=0;
        for(let i=0;i<30;i++){await wait(600);const n=datedRows().length,e=earliestShown();
          // ⚠ 25.08.2026 — היה כאן `e<earlyBefore0`, כלומר „זז אחורה בלבד".
          // ההליכה קדימה מזיזה את התאריך המוקדם **קדימה**, ולכן היציאה
          // המוקדמת לא נתפסה והמקטע חיכה 18 שניות ליציבות. כל שינוי נחשב.
          if(e!=null&&earlyBefore0!=null&&e!==earlyBefore0)break;
          // ⚠ 25.08.2026 — התנאי `n>0` גרם ל**18 שניות המתנה מלאה בכל מקטע
          // ריק**: כשהתוצאה 0 שורות היציבות לא נספרה לעולם והלולאה מיצתה
          // את כל 30 הסיבובים. מקטע ריק הוא תוצאה לגיטימית, לא כישלון.
          // סף גבוה יותר לאפס (6 מול 2) כי „עדיין לא רונדר" נראה כמו „ריק".
          if(n>0&&n===last0){if(++stable0>=2)break}
          else if(n===0&&last0===0){if(++stable0>=6)break}
          else stable0=0;
          last0=n}
        const eAfter0=earliestShown(),iso0=ms=>ms==null?'':new Date(ms).toISOString().slice(0,10);
        // ⚠ ההצלחה נמדדת ב**תזוזה אחורה**, לא בהגעה מדויקת ל-collectSince:
        // לחשבון פשוט אין בהכרח תנועה ב-1 בינואר, ודרישת שוויון סימנה ריצה
        // מוצלחת ככשל. תופס גם את המקרה שבו כן הגענו לגבול או מעברו.
        // ⚠ ההצלחה נמדדת עכשיו ב„המקטע מתחיל היכן שביקשנו" (בסבילות של
        // שלושה ימים — לחשבון אין בהכרח תנועה בדיוק בתאריך המבוקש),
        // או בכל תזוזה מהמצב הקודם. הדרישה הישנה `eAfter0<=sinceMs`
        // סימנה כל הליכה קדימה ככישלון.
        const moved0=earlyBefore0!=null&&eAfter0!==earlyBefore0;
        const landed0=eAfter0!=null&&eAfter0>=sinceMs-3*864e5;
        return report(eAfter0!=null&&(moved0||landed0)?'טווח מדויק הופעל':'טווח מדויק ללא שינוי מספיק',
          {from:ilShort(sinceMs),to:ilShort(untilMs),
           // ⚠ **מה שבאמת יושב בשדות אחרי ההחלה, ולא מה שביקשנו לכתוב.**
           // טל, 25.08: „צריך לברור נכון את תאריכי הצפיה בנתונים." זו
           // המדידה שתכריע — אם `wrote` שונה מ-`from`/`to`, הדף דחה או
           // תיקן את מה שהוזן, וזה השורש. `placeholder` יגלה אם השדה
           // מצפה ל-yyyy בעוד `ilShort` כותב yy.
           wrote:{from:fields.from.value||'',to:fields.to.value||''},
           placeholder:fields.from.placeholder||'',
           earliestBefore:iso0(earlyBefore0),earliestAfter:iso0(eAfter0),
           latestAfter:iso0(latestShown()),rows:datedRows().length});
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
// WHY 28.08.2026 - נמדד בשטח: התנועות עברו ב-60 שניות, וההלוואות שרפו
// 362 שניות מתוך 422. הסיבה זהה לזו שתוקנה בתנועות אתמול - **ההודעה
// הזאת שקטה לגמרי**, ולכן הרקע ממתין לתקרה של 120 שניות במקום לדעת
// אם העמוד עובד. הלולאה כאן לבדה היא 180*250ms = 45 שניות **לכל חשבון**,
// ולכן בשני חשבונות היא חורגת מהתקרה **בזמן שהיא עובדת כשורה**.
async function syncLoans(keys){const out=[];for(const key of keys){if(accountTabs().length)await selectAccount(key);
// WHY 28.08.2026 - טל: "ההלוואה מהחשבון החדש הועתקה לחשבון הישן במקום
// להתייחס לכל חשבון ולכל הלוואה בנפרד."
// ⚠⚠ `selectAccount` יכול **להיכשל בשקט**: אם האפשרות לא נמצאה או שהמעבר
// לא הספיק לרנדר, הדף נשאר על החשבון הקודם - ואז נקראות **ההלוואות שלו**
// ונרשמות תחת המפתח החדש. מספר שנקרא מהחשבון הלא נכון גרוע מהיעדר מספר.
// (בתנועות זה כבר מאומת דרך expectedKey; ההלוואות נשארו בלי אימות.)
// ⚠ ההמתנה היא לתוכן ולא לשניות: עד 8 שניות, עם יציאה ברגע שהבורר מתחלף.
{let shown=null;
 for(let i=0;i<32;i++){shown=parseAccount(txt(chooser()))?.key||null;
   if(shown===key)break; if(i%8===0)beat(`מוודא חשבון · ${key}`,0); await wait(250)}
 if(shown!==key){
   try{await chrome.storage.local.set({leumiLoanMismatch:{want:key,got:shown||'',at:new Date().toISOString()}})}catch{}
   throw Error(`בורר החשבונות נשאר על ${shown||'לא ידוע'} כשביקשנו ${key} — ההלוואות לא נקראו כדי לא לשייך אותן לחשבון הלא נכון`);}}
beat('קורא הלוואות',0);
let rows=[];for(let i=0;i<180;i++){rows=gridRows().map(row=>({row,cells:cellsOf(row)})).filter(x=>x.cells.some(v=>/%/.test(v))&&x.cells.filter(v=>/^\d{2}\.\d{2}\.\d{4}$/.test(v)).length>=2);if(rows.length)break;
if(i%8===0)beat(`ממתין לרשת ההלוואות · ${key}`,gridRows().length);
await wait(250)}const page=txt(document.body),declaredTotal=money((page.match(/סך יתרת הלוואות[\s\S]{0,200}?₪\s*([\d,]+\.\d{2})/)||[])[1]);if(declaredTotal>0&&!rows.length)throw Error(`לא נטען פירוט ההלוואות בחשבון ${key}`);const loans=[];let prevStamp='',missingPayment=0;for(const {row,cells:c} of rows){const end=c.findIndex(v=>/^\d{2}\.\d{2}\.\d{4}$/.test(v)),interest=c.findIndex(v=>/%/.test(v));if(end<1||interest<0)continue;// WHY 28.08.2026 - המדידה: הפעימה האחרונה לפני 45 שניות השקט היא
// "פותח הלוואה", ואחריה **כלום**. כלומר התקיעה היא בתוך הבלוק הזה, אחרי
// הפעימה ולפני הבאה. הזריקות כאן ("חסר תשלום קרוב") היו מדווחות מיד,
// ולכן מה שקורה אינו שגיאה אלא **היעלמות** - ככל הנראה ה-SPA מרנדר מחדש
// והסקריפט מת, ואז ההודעה לעולם אינה נענית.
// ⚠ פעימה אחת לכל הלוואה אינה מספיקה כדי לדעת **איפה** - צריך פעימה בכל צעד.
beat(`פותח הלוואה · ${key}`,loans.length);row.querySelector('button,[role="button"]')?.click();
beat(`נלחץ · ${key}`,loans.length);await wait(800);
beat(`קורא הרחבה · ${key}`,loans.length);const panel=txt(document.querySelector('[aria-label="הרחבת הלוואה"]')||document.querySelector('[role="complementary"]')||document.body);const nextPayment=money((panel.match(/התשלום הבא\s*₪?\s*([\d,]+\.\d{2})/)||[])[1]),nextPaymentDate=(panel.match(/תאריך התשלום הבא\s*(\d{2}\.\d{2}\.\d{4})/)||[])[1]||'';// WHY 28.08.2026 - ה-chain ב-leumiDebug מראה שהשורה עצמה **מכילה כמעט הכול**:
//   "מט\"י ז\"א לא צמוד ר.משתנה 741611 | 10.03.2042 | ₪1,940,000.00 |
//    ₪585,882.38 | ₪587,656.08 | 6.5% | 30.03.2022"
// סוג, תאריך סיום, קרן מקורית, יתרה, ריבית ותאריך התחלה - הכול בשורה.
// **רק** התשלום הקרוב דורש הרחבה, וההרחבה היא בדיוק מה שהורג את הסקריפט.
// ⚠⚠ לכן ההרחבה הופכת מ**תנאי** ל**העשרה**: הלוואה בלי תשלום קרוב היא
// הלוואה חסרה, אבל **אפס הלוואות זו קריסה**. אותו כלל שהוחל על לאומי
// ב-22.08 ("לא זורקים את הנתונים") ועל יהב ("מגבלת בנק אינה באג").
// המספר החסר נספר ומדווח, כדי שזה לא ייראה כהצלחה מלאה.
if(nextPayment==null||!nextPaymentDate)missingPayment++;
// ההרחבה יושבת מחוץ לשורה, ולחיצה שנייה אינה מקפלת אותה. אם שתי שורות מחזירות את אותו תשלום — עוצרים במקום לשכפל.
beat(`נקרא תשלום · ${key}`,loans.length);// ⚠ שמירת הכפילות רק כששני הערכים קיימים: שתי הלוואות בלי הרחבה יראו
// שתיהן "null|" ויתפסו בטעות ככפילות.
const stamp=`${nextPayment}|${nextPaymentDate}`;if(rows.length>1&&nextPayment!=null&&nextPaymentDate&&stamp===prevStamp)throw Error(`הרחבת ההלוואה בחשבון ${key} לא התחלפה בין שורות (אותו תשלום קרוב ${nextPaymentDate}) — נעצר כדי לא לשכפל נתון`);prevStamp=stamp;
loans.push({type:c[0],endDate:c[end],originalPrincipal:money(c[end+1]),balance:money(c[interest-1]),interest:c[interest],startDate:c[interest+1]||'',nextPayment,nextPaymentDate});document.querySelector('button[aria-label="סגירה חלון"]')?.click();beat(`סוגר הרחבה · ${key}`,loans.length);await wait(180)}if(declaredTotal>0&&!loans.length)throw Error(`לא אומתו הלוואות בחשבון ${key}`);if(missingPayment)try{await chrome.storage.local.set({leumiLoanGaps:{key,missingPayment,of:loans.length,at:new Date().toISOString()}})}catch{}
out.push({key,loans,loansTotal:loans.reduce((sum,l)=>sum+(l.balance||0),0),loanCount:loans.length,missingPayment})}return out}
async function openCheque(m){await selectAccount(`${m.branch}-${m.accountNumber}`);const date=String(m.date||'').replace(/\//g,'.'),amount=Number(m.amount)||0;for(let i=0;i<40;i++){if(datedRows().length)break;await wait(250)}
// בדף השיקים הכותרות שונות, ולכן ההתאמה סמנטית: אותה שורה מכילה את התאריך וגם סכום זהה.
const hit=datedRows().find(({cells})=>cells.some(v=>v===date)&&cells.some(v=>Math.abs((money(v)||0)-amount)<0.01));if(!hit)throw Error('לא נמצא צילום שיק תואם לפי תאריך וסכום');hit.row.querySelector('button,[role="button"]')?.click();await wait(900)}
})();
