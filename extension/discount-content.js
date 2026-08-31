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
    try{chrome.storage.local.set({bfcacheSeen:{source:'discount',at:new Date().toISOString(),
      url:String(location.href).slice(0,140)}})}catch(err){}}});
}}catch(e){}

// ⚠⚠ 25.08.2026 — **שומר הזרקה עמיד למות הקשר.**
// דגל בוליאני פשוט (1.9.0) מנע מאזינים כפולים — אבל יצר תקלה גרועה
// יותר: כשמרעננים את התוסף, ה-content script הישן מת אבל **ה-`window` של
// העולם המבודד שורד** עם הדגל דלוק. ההזרקה החדשה יוצאת מיד
// ו**אינה רושמת מאזין כלל** — ואז הרקע מדווח „לא השיב תוך 60 שניות".
// לכן במקום דגל: **בדיקת חיות.** הסקריפט הקודם משאיר פונקציה
// שנוגעת ב-`chrome.runtime.id` **מתוך הסגור שלו**; כשהקשרו מת הגישה זורקת,
// הבדיקה מחזירה false, והסקריפט החדש נרשם. שני המצבים נפתרים בבת אחת.
if(window.__discountSyncLoaded){try{if(window.__discountSyncLoaded())return}catch(e){}}
// ⚠ ההפניה נתפסת כאן ולא נקראת מחדש בכל בדיקה: קריאה מחדש
// מחזירה את ה-chrome החדש, והגשש מדווח „חי" גם כשההקשר שלו מת. נתפס בבדיקה.
const __rt__discountSyncLoaded=(()=>{try{return chrome.runtime}catch(e){return null}})();
window.__discountSyncLoaded=()=>{try{return !!(__rt__discountSyncLoaded&&__rt__discountSyncLoaded.id)}catch(e){return false}};
// ⚠⚠ 25.08.2026 — **שומר הזרקה.** טל ראה:
// „A listener indicated an asynchronous response by returning true,
//  but the message channel closed before a response was received".
// הרקע מזריק את הקובץ שוב ושוב (`prepareDiscountContent`), ובלי שומר
// **כל הזרקה מוסיפה `onMessage` נוסף באותו דף**. כמה מאזינים
// מחזירים `true` על אותה הודעה, רק אחד עונה, והשאר סוגרים ערוץ
// בלי תשובה — וזו בדיוק ההודעה.
// ⚠ התקדים כבר היה בקובץ: `leumi-content.js` מחזיק `__leumiSyncLoaded`
// מזמן, **ורק הוא** — ולכן לאומי לא סבל מזה ודיסקונט כן.

const wait=ms=>new Promise(r=>setTimeout(r,ms));
// הזיהוי עובר בין הישויות ולוקח זמן; בלי משוב הוא נראה תקוע, וזה מה שקרה ב-0.19.
let lastSwitchErrors=[],lastTxProbe=null;
const note=t=>{try{chrome.runtime.sendMessage({type:'DISCOUNT_PROGRESS',text:t}).catch(()=>{})}catch{}};
const text=el=>(el?.innerText||el?.textContent||'').replace(/\s+/g,' ').trim();
// ⚠⚠ 25.08.2026 — **`innerText` כופה חישוב פריסה מלא של הדף.**
// נמדד: „קריאת התנועות לא השיב תוך 150 שניות", שלושה ניסיונות, וגלאי
// הזהות לבדו סיים ב-155 שניות. הסיבה: `bodyText()` נקרא
// ~32 פעמים (הגלאי + `activeAccount` בכל אחד מ-8 הסבבים, פעמיים עם
// מסלול התיקון), ובדף דיסקונט עם מאות שורות כל קריאה כזו עולה שניות.
// `textContent` **אינו כופה פריסה** ומחזיר את אותו טקסט לצרכים כאן:
// חיפוש רצף ספרות ובדיקת `includes` על מספר חשבון. הפרש: הוא כולל גם
// טקסט מוסתר — וזה דווקא לטובה כשמחפשים מספר חשבון שאולי אינו גלוי.
// ⚠ **לא לשנות את `text()` עצמו** — הוא משמש לקריאת תוויות וערכים
// שבהם ההבדל בין גלוי למוסתר כן משנה.
// ⚠ `textContent` אינו מנרמל רווחים כמו `text()`, ותווית שמפוצלת בין
// צמתים (רווח או שורה חדשה בין המילים) לא הייתה מתאימה יותר.
// הנרמול נשאר; רק חישוב הפריסה נעלם.
const tc=el=>(el?.textContent||'').replace(/\s+/g,' ').trim();
const bodyText=()=>(document.body?.textContent||'').replace(/\s+/g,' ').trim();
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
    .filter(el=>ENTITY.test(text(el))&&text(el).length<90&&el!==trigger&&!(trigger&&el.contains(trigger))
      // ⚠⚠ 25.08.2026 — טל: „מאיפה החשבון החמישי?" נמדד:
      //   {entity:"000213991", owner:"העברה ממשה ושרונה מיכאל חשבון
      //    12-544-0005- שכירות צרכניה", resolved:false}
      // **שורת תנועה נקראה כישות.** התיאור קצר מ-90 תווים, והאסמכתא היא
      // מספר בן 9 ספרות — כלומר היא עונה על ההגדרה במדויק. התוצאה:
      // „4 מתוך 5 חשבונות זוהו", וניסיונות מעבר לישות שאינה קיימת.
      // ⚠ **הסינון כאן מבני ולא דירוגי, במכוון.** ההערה שמעל מתעדת
      // שדירוג שהעדיף a/button על li **הפיל את הזיהוי כולו** ב-21.08.
      // אפשרות בבורר הישויות לעולם אינה יושבת **בתוך שורת תנועה**, ולכן
      // המבחן הזה אינו יכול לפסול אפשרות אמיתית.
      &&!el.closest('[role="row"],div.rc-strip-row,table tr'));
  // הפנימי ביותר: אלמנט שמכיל מועמד אחר הוא מכולה, לא אפשרות.
  // ⚠ 21.08.2026 — **הוחזר.** דירוג שהעדיף a/button על li הפיל את הזיהוי כולו:
  // discoveredAccounts התרוקן ל-0 ו-discountDiscoverError רשם „לא השיב תוך 60 שניות".
  // הסינון הוצא; הטיפוס בשרשרת ב-selectEntity הוא המנגנון שעובד, והוא נשאר.
  return raw.filter(el=>!raw.some(other=>other!==el&&el.contains(other)));
};
// ⚠⚠ 22.08.2026 — נמדד משתי ריצות של אותה ישות באותו יום, ולא שוער:
//   08:35 discountSelectWorked = {entity:"514220276", path:"a.dropdown-item"}   ✔
//   16:53 discountSelectFailed = {entity:"514220276", candidates:["li.accountComboLinks"]}  ✘
// בכשל נמצא **מועמד יחיד**, ולכן „נסה את כל המועמדים" (1.0.26) לא היה מה לנסות.
// השורש: היציאה המוקדמת. menuEntities מחפש בין השאר `[role="menu"] li`, ותפס את
// li.accountComboLinks **בזמן שהתפריט סגור** — ומכיוון שהיא יצאה מיד, realClick
// על הבורר מעולם לא רץ, התפריט לא נפתח, ו-a.dropdown-item לא נוצר כלל.
// **הכלל החדש, מדיד ובלי ניחוש סלקטורים:** יש כמה ישויות בחשבון, ולכן רשימה
// שיש בה **מזהה אחד בלבד** אינה רשימת הישויות — היא שריד של תפריט סגור.
// במקרה כזה לא יוצאים מוקדם אלא לוחצים וממשיכים במסלול המלא.
// ⚠ אין כאן סינון של li — זה מה שהוחזר ב-21.08 והפיל את הזיהוי. כאן רק
// **בוחרים בין רשימות שלמות**, ואם אף אחת אינה נראית מלאה מוחזרת העשירה שבהן,
// כדי שגם חשבון עם ישות אחת בלבד ימשיך לעבוד.
async function entityOptions(){const trigger=entityButton();if(!trigger)throw Error('לא נמצא בורר הישויות בדיסקונט עסקי');
const distinct=els=>new Set((els||[]).map(el=>entityId(text(el))).filter(Boolean)).size;
const already=menuEntities();if(distinct(already)>1)return already;
realClick(trigger);
// ⚠ menus/listboxes נמדדו 0 בכל ריצה מאז 18.08 — 10 שניות המתנה כאן היו 40 שניות
// מבוזבזות על ארבע ישויות. שתי שניות מספיקות למסלול התקין, והנפילה לאחור מיד אחריו.
for(let i=0;i<8;i++){await wait(250);const opts=menuEntities();if(distinct(opts)>1)return opts}
const loose=menuEntitiesLoose();if(distinct(loose)>1)return loose;
return [already,menuEntities(),loose].sort((a,b)=>distinct(b)-distinct(a)||b.length-a.length)[0]||[]}
// ⚠ מעבר בין ישויות טוען מחדש את הדף והורג את ה-content script — הערוץ נסגר באמצע
// ('message channel closed'). לכן הזיהוי אינו עובר בין ישויות: הוא מונה אותן בלבד.
// מספר החשבון והיתרה נקראים בסנכרון, ישות אחת בכל קריאה.
async function ready(){for(let i=0;i<120;i++){const t=bodyText();if(t.length>200&&ENTITY.test(t))return true;await wait(250)}return false}
async function discover(){if(!await ready())throw Error(`דף דיסקונט לא נטען בתוך 30 שניות (${bodyText().length} תווים) — ייתכן שההתחברות פגה`);const options=await entityOptions(),entities=[],seen=new Set();for(const b of options){const label=text(b),id=entityId(label);if(id&&!seen.has(id)){seen.add(id);entities.push({id,owner:label.replace(ENTITY,'').replace(/\s{2,}/g,' ').trim()})}}const back=entityButton();if(back)realClick(back);if(!entities.length)throw Error('לא זוהו ישויות בחיבור דיסקונט עסקי');const here=activeAccount(),cur=entityId(text(entityButton()));return entities.map(e=>({key:e.id,entityId:e.id,nickname:e.owner,owner:e.owner,branch:e.id===cur?here.branch:'',accountNumber:e.id===cur?here.accountNumber:'',balance:null}))}
// ⚠ מקבלת deadline מבחוץ: בלעדיו סבב יחיד כאן בלע את כל תקציב
// הזיהוי (עד 10 שניות), והלולאה החיצונית חשבה שהיא זולה.
// ⚠⚠ 25.08.2026 — נמדד חי: „בורר החשבונות הפרטיים לא נמצא".
// כלומר הסלקטור `button.accountDropdownMenu` **אינו מתאים לדף הפרטי**
// (`apollo/retail3`, אפליקציה אחרת מן העסקי).
// ⚠ **לא ניחשתי סלקטור חדש.** הגשש רושם מה **באמת** יש בדף כשהוא לא
// נמצא — מחלקות, id, aria, וטקסט קצר — ומן הרשומה הזו נכתוב סלקטור
// לפי מדידה. **קריאה בלבד: אפס לחיצות, אפס ניווט.**
function privateTriggerProbe(){
  const f=t=>String(t||'').replace(/\s+/g,' ').trim();
  const pick=el=>({tag:el.tagName.toLowerCase(),cls:f(el.className).slice(0,60),
    id:el.id||'',role:el.getAttribute('role')||'',
    haspopup:el.getAttribute('aria-haspopup')||'',expanded:el.getAttribute('aria-expanded')||'',
    label:f(el.getAttribute('aria-label')).slice(0,40),
    text:f(el.textContent).slice(0,60)});
  const out={url:location.hash||location.pathname,at:new Date().toISOString()};
  // מועמדים לפי תפקיד ולפי שם מחלקה מרמז
  out.byRole=[...document.querySelectorAll('[role="combobox"],[aria-haspopup],[role="listbox"],select')]
    .slice(0,10).map(pick);
  out.byClass=[...document.querySelectorAll('[class*="account" i],[class*="dropdown" i],[class*="select" i]')]
    .filter(el=>f(el.textContent).length<120).slice(0,10).map(pick);
  // כפתורים שיש בהם מספר חשבון (רצף ספרות) — הבורר כמעט תמיד מציג אחד
  out.withDigits=[...document.querySelectorAll('button,[role="button"],a')]
    .filter(el=>/\d{4}/.test(f(el.textContent))&&f(el.textContent).length<90).slice(0,10).map(pick);
  out.menus=document.querySelectorAll('[role="menu"],[role="listbox"]').length;
  out.radios=document.querySelectorAll('[role="radio"]').length;
  // ⚠⚠ טל, 25.08: „אין בורר חשבונות." כלומר ההנחה שבבסיס
  // `privateAccountOptions` — שיש תפריט נפתח — **שגויה מיסודה**,
  // ולא רק שהסלקטור התיישן. לכן הגשש חייב לרשום גם **איך החשבונות
  // כן מוצגים**: אולי כרטיסים, שורות, או לשוניות.
  // מחפשים תבנית של מספר חשבון (3 ספרות סניף + 6–9 ספרות), ורושמים
  // את המכיל **הקטן ביותר** שמחזיק אותה — הוא הכרטיס/השורה.
  const seen=new Set();out.accountLike=[];
  const RX=/\b\d{2,3}[-\/]\d{5,9}\b|\b\d{9,10}\b/;
  for(const el of document.querySelectorAll('div,li,article,section,td,a,button')){
    if(el.children.length>6)continue;
    const t=f(el.textContent);
    if(t.length>120||!RX.test(t))continue;
    const key=t.slice(0,40);
    if(seen.has(key))continue;seen.add(key);
    out.accountLike.push({...pick(el),match:(t.match(RX)||[''])[0]});
    if(out.accountLike.length>=12)break;
  }
  // כמה מספרי חשבון שונים בכלל בדף — מבחין בין „חשבון אחד" ל„כמה"
  out.distinctNumbers=[...new Set((f(document.body.textContent).match(/\b\d{2,3}[-\/]\d{5,9}\b/g)||[]))].slice(0,10);
  return out;
}
// ⚠⚠ 25.08.2026 — **הסלקטורים נכתבו מן המדידה, לא מהשערה.**
// `discountPrivateTriggerProbe` מן הדף החי (`#/MY_ACCOUNT_HOMEPAGE`):
//   <button class="dropdown-toggle commonDropdown__button">0113392534 רצבי טל…
//   <li class="commonDropdown__menuItem selected">113392534 רצבי טל
//   <li class="commonDropdown__menuItem">150497352 רצבי טל,קידר אושר
//   <li class="commonDropdown__menuItem">163327612 רצבי טל,רצבי סופי טל
// **שלושה חשבונות**, ו-`menus=0` — כלומר `[role="menu"] [role="radio"]`
// שהקוד חיכה לו **אינו קיים בדף הזה כלל**, ולכן הזיהוי לא הצליח לעולם.
// ⚠ הסלקטורים הישנים נשארים כנפילה-לאחור: לא נמדדו ככושלים בפריסה אחרת.
// ⚠ הרשימה כבר ב-DOM (Angular מרנדר סגור). לוחצים **רק** אם אין פריטים —
// לחיצה על בורר פתוח הייתה סוגרת אותו.
const PRIVATE_TRIGGER='button.commonDropdown__button,.dropdown-toggle.commonDropdown__button,button.accountDropdownMenu,[role="combobox"].accountDropdownMenu';
// ⚠⚠ 25.08.2026 — טל: „הבורר רושם כפול את החשבונות."
// **השורש: סלקטור מאוחד בפסיקים תופס גם את ה-`<li>` וגם את ה-`<button>`
// שבתוכו** — כל חשבון נספר פעמיים.
// ⚠ **וזה היה בפלט הבדיקה שלי ולא פעלתי לפיו:** נרשם „li=3 סה״כ=6",
// ואני בדקתי רק את תת-הקבוצה של ה-`li`. **בדיקה שמסננת את הרעש
// מסתירה אותו.** מעכשיו — לבדוק את מה שהפונקציה **מחזירה**, לא את
// מה שנוח לי לקרוא ממנו.
// התיקון: רשימת סלקטורים **בסדר עדיפות**, והראשון שמחזיר משהו מנצח.
// כך שתי רמות של אותו פריט לעולם אינן מעורבבות.
const PRIVATE_ITEM_SETS=['li.commonDropdown__menuItem','button.commonDropdown__menuItemBtn','[role="menu"] [role="radio"]'];
async function privateAccountOptions(deadline=0){
  // ⚠⚠ 31.08.2026 - טל: "בדיסקונט פרטי הוא לא מזהה את כל החשבונות."
  // **כאן ישבה יציאה מוקדמת אחרי הסלקטור הראשון שמצא משהו,**
  // וכל מה שהסלקטורים האחרים היו מוצאים נזרק. אם רשימת הבנק מרנדרת חלק
  // מהחשבונות ב-li וחלק אחרת, החלק השני אבד **בשקט** - בלי שגיאה, כי
  // "נמצאו חשבונות" נראה כמו הצלחה.
  // **התיקון: איחוד כל הסלקטורים.** זה אינו ניחוש על ה-DOM של דיסקונט:
  // שורה שאינה חשבון מוחזרת כ-null מ-privateAccountFromRow ונזרקת ממילא,
  // וכפילות מנוכה לפי מפתח החשבון. כלומר האיחוד יכול רק **להוסיף**
  // חשבונות אמיתיים, לעולם לא להמציא.
  const perSel={};
  const found=()=>{const out=[],seen=new Set();
    for(const sel of PRIVATE_ITEM_SETS){
      const hit=[...document.querySelectorAll(sel)];
      perSel[sel]=hit.length;
      for(const el of hit){if(seen.has(el))continue;seen.add(el);out.push(el)}
    }
    return out};
  // ⚠⚠ 31.08.2026 - טל: "אין בורר ואין חשבונות דיסקונט פרטי". **זו הייתה
  // רגרסיה שלי מ-1.94.0.** התנאי לפתיחת הבורר היה "לא נמצאו שורות", ואחרי
  // שאיחדתי את הסלקטורים `[role="menu"] [role="radio"]` תפס אלמנטים
  // שקיימים בדף **עוד לפני** שהבורר נפתח - ולכן `rows.length` היה חיובי,
  // הפותחן לא נלחץ, ורשימת החשבונות האמיתית לא נפתחה מעולם.
  // **הקריטריון הנכון הוא "כמה שורות נותחו לחשבון", לא "כמה שורות נמצאו".**
  // שורה שאינה חשבון אינה עדות לכך שהבורר פתוח.
  const accountsIn=list=>list.filter(r=>privateAccountFromRow(r)).length;
  let rows=found();
  if(!accountsIn(rows)){
    const trigger=document.querySelector(PRIVATE_TRIGGER);
    if(!trigger){try{await chrome.storage.local.set({discountPrivateTriggerProbe:privateTriggerProbe()})}catch(e){}
      throw Error('בורר החשבונות הפרטיים לא נמצא')}
    realClick(trigger);
    for(let i=0;i<40;i++){
      if(deadline&&Date.now()>deadline)break;
      await wait(250);
      rows=found();
      if(accountsIn(rows))break;
    }
  }
  // ⚠ הגשש רושם עכשיו **כמה כל סלקטור מצא בנפרד**, וכמה מהשורות נותחו
  // בהצלחה לחשבון. בלי זה "נמצאו 2" ו"נמצאו 2 מתוך 6" נראים זהה.
  try{await chrome.storage.local.set({discountPrivateOptions:{n:rows.length,perSel,
    parsed:rows.map(r=>privateAccountFromRow(r)).filter(Boolean).length,at:new Date().toISOString(),
    sample:rows.slice(0,4).map(r=>String(r.textContent||'').replace(/\s+/g,' ').trim().slice(0,44))}})}catch(e){}
  return rows;
}
const // ⚠ הפרסור הסתמך על <p> בתוך השורה. בדף שנמדד הטקסט **מחובר**
// („113392534רצבי טל") ואין <p>, ולכן נוספה נפילה-לאחור:
// המספר נלקח מכל הטקסט, והבעלים הוא מה שנשאר אחרי הסרתו.
// ⚠⚠ 31.08.2026 - התנאי היה `full?`, ו-`full` הוא `raw.padStart(10,"0")`.
// שורה **בלי ספרות כלל** נתנה raw="" ולכן full="0000000000" - ערך אמיתי
// לכל דבר - והוחזר **חשבון מזויף 000-0000000**. זה נחשף רק כשאיחוד
// הסלקטורים הביא שורות שאינן חשבון ("בחר חשבון", כותרת וכד'). התנאי
// נבדק עכשיו על `raw`, שהוא ההתאמה עצמה.
privateAccountFromRow=row=>{const parts=[...row.querySelectorAll("p")].map(text).filter(Boolean),whole=text(row),raw=(parts[0]?.match(/\b\d{9,10}\b/)||whole.match(/\b\d{9,10}\b/)||[])[0]||"",full=raw.padStart(10,"0"),owner=parts[1]||whole.replace(raw,"").replace(/^[\s,:-]+/,"").trim()||"דיסקונט פרטי";return raw?{key:`${full.slice(0,3)}-${full.slice(3)}`,nickname:owner,owner,branch:full.slice(0,3),accountNumber:full.slice(3),balance:null}:null};
// ⚠⚠ 25.08.2026 — טל: „הסנכרון נכשל." נמדד פעמיים:
// „שגיאה בדיסקונט פרטי: זיהוי חשבון פרטי לא השיב תוך 30 שניות".
// **השורש — אותו באג בדיוק שעלה שבעה סבבים היום (1.10.5):**
// הלולאה כאן חסומה ב-120 סבבים, **בספירה בלבד**, והניחה שכל סבב עולה
// 250 מ״ש. אבל `privateAccountOptions()` מכילה לולאה משלה של
// 40 × 250 מ״ש — **עד 10 שניות לסבב.** במקרה הגרוע 120 × 10 = 20 דקות,
// בעוד התקציב ברקע הוא **30 שניות**. לכן המטפל לא השיב לעולם, וההודעה
// שהמשתמש ראה הייתה timeout ולא סיבה אמיתית.
// **תקרת סבבים אינה תקרת זמן.** גבול שעון־קיר, ומתחת לתקציב הרקע.
// ⚠ 20 שניות ולא 30: חייבים **להספיק לזרוק ולהשיב** בתוך התקציב,
// אחרת הכשל שוב ייראה כשתיקה במקום כשגיאה מוסברת.
const PRIVATE_DISCOVER_MS=20000;
async function discoverPrivate(){
  const deadline=Date.now()+PRIVATE_DISCOVER_MS;
  let lastErr='';
  for(let i=0;i<120;i++){
    try{
      const rows=await privateAccountOptions(deadline);
      // ⚠ חגורה שנייה: ניכוי כפילויות **לפי מפתח החשבון**, גם אם
      // הסלקטור החזיר שתי רמות של אותו פריט. הסלקטור כבר מסודר לפי
      // עדיפות — אבל כפילות בנתוני בנק גרועה מספיק כדי להצדיק שתיים.
      const seenKeys=new Set(),accounts=[];
      for(const r of rows){const a=privateAccountFromRow(r);
        if(!a||!a.key||seenKeys.has(a.key))continue;
        seenKeys.add(a.key);accounts.push(a)}
      if(accounts.length)return accounts;
    }catch(e){lastErr=String(e&&e.message||e).slice(0,80)}
    if(Date.now()>deadline)break;
    await wait(250);
  }
  // ⚠ השגיאה נושאת עכשיו את הסיבה האחרונה שנתפסה. קודם היא נבלעה
  // ב-`catch{}` ריק, והמשתמש קיבל „לא נמצאה" בלי לדעת למה.
  throw Error(`רשימת החשבונות הפרטיים לא נמצאה לאחר ההתחברות${lastErr?` — ${lastErr}`:''}`);
}
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
// מועמד שנמדד כמצליח (a.dropdown-item) קודם, li אחרון. אין כאן סינון — רק סדר.
const rankOption=el=>{const tag=el.tagName.toLowerCase();if(tag==='a'||tag==='button')return 0;if(el.getAttribute('role')==='option'||el.getAttribute('role')==='menuitem')return 1;return 2};
const brief=el=>`${el.tagName.toLowerCase()}${el.id?'#'+el.id:''}${(String(el.className||'').trim().split(/\s+/)[0]||'')?'.'+String(el.className).trim().split(/\s+/)[0]:''}`;
// המתנה אחרי לחיצה: הישות בבורר **וגם** מספר חשבון אחר. אם הבורר התחלף אבל
// המספר לא — נותנים לדף עוד חלון, ורק בסופו מקבלים החלפה בלי שינוי מספר.
// ⚠⚠ 25.08.2026 — **כאן נשרפו שניות רבות, ומאותו שורש כמו כל השאר היום.**
// התנאי דרש `account!==previous`, ו-`previous` מגיע מ-`activeAccount()` —
// אותו קורא שנמדד כמחזיר `0690300`, מספר החשבון של הנעבר בשורת תנועה.
// כשהמספר הזר אינו משתנה התנאי **לעולם אינו מתקיים**, והלולאה שורפת את
// מלוא ה-3 שניות **גם כשהמעבר הצליח מיד** — ואז נופלת לשורה האחרונה
// שמחזירה true בדיוק על סמך `entityNow()`.
// **בורר הישות הוא האות האמין** (נקבע היום ב-1.6.1, `discountIdentityPass`).
// לכן: שינוי מספר חשבון נשאר האות החזק ומחזיר מיד; ובהיעדרו די בבורר
// שמצביע על הישות **שלוש בדיקות ברציפות** (750 מ״ש), במקום 3 שניות מלאות.
async function switched(id,previous,ms){const until=Date.now()+ms;let steady=0;
  while(Date.now()<until){await wait(250);const account=activeAccount().accountNumber;
    if(entityNow()===id&&account&&account!==previous)return true;
    if(entityNow()===id){if(++steady>=3)return true}else steady=0}
  const account=activeAccount().accountNumber;return entityNow()===id&&!!account}
// ⚠ מדידת שלבים. 154 שניות במעבר ישות אינן מוסברות ע"י `switched` לבדו
// (51 קריאות?), ואין לי מדידה בפירוט הזה. **לא מנחשים — מודדים.**
let phaseT0=0,phases=[],phaseEntity='';
// ⚠ השלבים של ריצה קודמת נשמרים לפני האיפוס. בלי זה **הניסיון החוזר
// דורס בדיוק את העקבות של הריצה שנתקעה** — וזו הריצה שמעניינת.
function phaseStart(id){
  if(phases.length){try{chrome.storage.local.set({discountPrevPhases:{entity:phaseEntity,phases,total:Date.now()-phaseT0,at:new Date().toISOString()}})}catch(e){}}
  phaseT0=Date.now();phases=[];phaseEntity=String(id||'')}
// ⚠ נכתב **מיד**, ולא רק בסוף `extract`. הריצה שנכשלה ב-timeout לא
// הגיעה לשמירה, ולכן המדידה שהייתי צריך בדיוק אז — אבדה.
// גשש ששורד רק בהצלחה אינו גשש.
// ⚠ `selectEntity` נקרא גם **מחוץ** ל-`extract` (מעבר ישות ברקע), ואז
// `phaseT0` היה 0 ו-`ms` יצא חותמת זמן מוחלטת (1.787e12) במקום משך.
// גשש שמדווח מספר חסר פשר גרוע מגשש שותק.
function phase(name){if(!phaseT0)return;phases.push({name,ms:Date.now()-phaseT0});
  try{chrome.storage.local.set({discountPhases:{entity:phaseEntity,at:new Date().toISOString(),
    total:Date.now()-phaseT0,phases}})}catch{}}
async function phaseSave(id){try{await chrome.storage.local.set(
  {discountPhases:{entity:String(id||''),at:new Date().toISOString(),
   total:Date.now()-phaseT0,phases}})}catch{}}
// ⚠⚠ 22.08.2026 — טל: „עשיתי סנכרון ממרץ ליובל" → „דיסקונט לא עבר לישות
// 514220276 — נוסו 1 רמות לחיצה (0:li.commonDropdown__menuItem)".
// **נמדד משלוש רשומות שהקוד כתב לעצמו, ולא משוער:**
//   discountSelectWorked = {entity:"570012930", path:"a.dropdown-item"}   ✔
//   discountSelectFailed = {entity:"514220276", tried:["0:li.commonDropdown__menuItem"]}
//   וכשל קודם          = {entity:"514220276", tried:["0:li.accountComboLinks"]}
// כלומר בדף יש **כמה** אלמנטים שונים הנושאים את אותו מזהה ישות, ורק
// `a.dropdown-item` באמת מחליף ישות. `options.find(...)` לקח את **הראשון
// בסדר ה-DOM**, וסדר זה משתנה בין ריצות — לכן אותה ישות פעם עוברת ופעם לא.
// אחרי מועמד כושל השרשרת נשברת מיד (`idsIn(el)>1` על ההורה), ולכן נוסתה
// רמה אחת בלבד ושאר המועמדים מעולם לא נבדקו.
// **מה שהשתנה: עוברים על כל המועמדים התואמים, לא על הראשון בלבד.**
// ⚠ הערה למי שיבוא: זה **אינו** הדירוג שהוחזר ב-21.08. שם `entityOptions`
// **סינן** li והפיל את הזיהוי כולו (discoveredAccounts=0), כי discover()
// נשען על אותה רשימה. כאן לא מסננים דבר — הרשימה נשארת שלמה, רק סדר
// הניסיון משתנה, והשינוי מקומי ל-selectEntity ואינו נוגע ב-discover().
async function selectEntity(id){if(entityNow()===id){phase('הישות כבר פעילה');return}phase('תחילת מעבר ישות');const previous=activeAccount().accountNumber,options=await entityOptions();
const matches=options.filter(b=>entityId(text(b))===id);
if(!matches.length)throw Error(`הישות ${id} לא נמצאה בדיסקונט עסקי`);
// a/button לפני li — `a.dropdown-item` הוא היחיד שנמדד כמצליח. זו העדפת
// סדר בלבד: מועמד li עדיין ינוסה, רק אחרי שהמבטיחים מיצו את עצמם.
const ranked=[...matches].sort((x,y)=>rankOption(x)-rankOption(y));
const tried=[];
for(const option of ranked){const chain=clickChain(option);
for(let level=0;level<chain.length;level++){const el=chain[level];
  // הורה שמכיל יותר ממזהה אחד הוא הרשימה כולה, לא האפשרות — לחיצה עליו תפגע במקום אחר.
  if(level&&idsIn(el)>1)break;
  tried.push(`${level}:${brief(el)}`);realClick(el);
  if(await switched(id,previous,3000)){phase(`מעבר הצליח אחרי ${tried.length} לחיצות`);try{chrome.storage.local.set({discountSelectWorked:{entity:id,level,path:brief(el),chain:tried,at:new Date().toISOString()}})}catch{}return}}}
try{chrome.storage.local.set({discountSelectFailed:{entity:id,tried,candidates:ranked.map(brief),seen:entityNow(),account:activeAccount().accountNumber,at:new Date().toISOString()}})}catch{}
throw Error(`דיסקונט לא עבר לישות ${id} — נוסו ${tried.length} לחיצות על ${ranked.length} מועמדים (${tried.join(' | ')})`)}
// ⚠ הסינון עבר ל-`textContent`: הוא רץ על **כל** button/p/div/span,
// ו-`innerText` שם הוא חישוב פריסה לכל אלמנט בנפרד. הערך עצמו עדיין
// נקרא ב-`text()` — שם דיוק התצוגה כן חשוב, ושם מדובר במעטים.
function valueAfter(label){const nodes=[...document.querySelectorAll('button,p,div,span')].filter(el=>tc(el).includes(label)).sort((a,b)=>tc(a).length-tc(b).length);for(const el of nodes){const own=money(text(el).slice(text(el).indexOf(label)+label.length));if(own!=null)return own;for(const near of [el.nextElementSibling,el.previousElementSibling,...(el.parentElement?.children||[])]){const n=money(text(near));if(n!=null)return n}}return null}
function activeAccount(){const body=bodyText();const candidates=[...body.matchAll(/\b(\d{10})\b/g)].map(m=>m[1]);const visible=(body.match(/\b(\d{10})\s+[^\d\n]{2,60}/)||[])[1]||'';const full=visible||candidates[0]||entityId(text(entityButton()));return{branch:full.length>=10?full.slice(0,3):'',accountNumber:full.length>=10?full.slice(3):full}}
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
head:f(bodyText()).slice(0,400)}}catch(e){return{probeError:e.message}}}
// נמדד חי ב-#/OSH_LENTRIES_ALTAMIRA: כל תנועה היא div.rc-strip-row ובתוכה ארבעה עלים —
// תאריך dd/MM/yy, תיאור, סכום חתום, יתרה. שורות הודעות הדואר נראות דומה אך חסר בהן ₪,
// ותאריכן בן ארבע ספרות שנה — לכן הסינון על ₪ מפריד ביניהן.
const TXDATE=/^\d{1,2}\/\d{1,2}\/\d{2}(?:\d{2})?$/;
const leavesOf=el=>[...el.querySelectorAll('*')].filter(x=>!x.children.length&&text(x)).map(text);
// ⚠ לדיסקונט שתי פריסות: מובייל (div.rc-strip-row) ודסקטופ (<tr> בטבלה). מדדתי בחלון צר
// וראיתי רק את המובייל, ולכן הפרסר הראשון החזיר אפס שורות אצל המשתמש. קוראים את שתיהן.
// המבחן שמפריד תנועות משורות הודעות הדואר: תאריך dd/MM/yy קצר וגם סכום ב-₪.
// ⚠⚠ 25.08.2026 — **ספירה זולה, בלי `innerText`.**
// `leavesOf` קורא `text(x)` על **כל עלה של כל שורה מועמדת**, ופעמיים
// (גם ב-`filter` וגם ב-`map`), ו-`txCandidates` מריץ זאת על שלוש
// קבוצות. `text` בנוי על `innerText`, שכופה חישוב פריסה — ובדף עם
// אלפי עלים זו הפעולה היקרה ביותר בקובץ.
// **ולולאת ההמתנה ברקע צריכה רק מספר.** נמדד: ישות ללא תנועות בטווח
// (יתרה 154.92) שרפה 155 שניות — 12 סבבים × ~13 שניות — רק כדי לגלות
// שוב ושוב ש-`rows` הוא 0.
// ⚠ **`txCandidates` עצמו לא שונה במכוון:** `transactions()` בונה ממנו
// את התנועות, וטקסט מוסתר היה נכנס לתיאורים ולסכומים. המסלול המדויק
// נשאר לקריאה (פעם אחת), והזול משרת את הסקר (12 פעמים).
function txRowCount(){
  const groups=[[...document.querySelectorAll('div.rc-strip-row')],
    [...document.querySelectorAll('table tr')],
    [...document.querySelectorAll('[role="row"]')]];
  let best=0;
  for(const g of groups){
    let n=0;
    for(const el of g){
      const leaves=[];
      for(const x of el.querySelectorAll('*')){
        if(x.children.length)continue;
        const t=(x.textContent||'').replace(/\s+/g,' ').trim();
        if(t)leaves.push(t);
      }
      if(leaves.some(v=>TXDATE.test(v))&&
         leaves.filter(v=>/^-?[\d,]+\.\d{2}$/.test(v.replace(/₪/g,'').trim())).length>=2)n++;
    }
    if(n>best)best=n;
  }
  return best;
}
function txCandidates(){const groups=[[...document.querySelectorAll('div.rc-strip-row')],[...document.querySelectorAll('table tr')],[...document.querySelectorAll('[role="row"]')]];
let best=[];for(const g of groups){const rows=g.map(el=>({el,leaves:leavesOf(el)}))
.filter(x=>x.leaves.some(v=>TXDATE.test(v))&&x.leaves.filter(v=>/^-?[\d,]+\.\d{2}$/.test(v.replace(/₪/g,'').trim())).length>=2);
if(rows.length>best.length)best=rows}
return best}
function rowsOf(){return txCandidates().map(x=>({row:x.el,cells:x.leaves}))}
// ⚠⚠ 25.08.2026 — **סדר השורות בדף אינו קבוע, והקוד הניח שהוא כן.**
// נמדד באחסון: חשבון 024844714 (שסונכרן היום) שמור **יורד** —
// 25/08 → 21/08 → 17/08, ורק 2 מתוך 75 מעברי יתרה עקביים.
// חשבון 514220276 (שדולג ונשארו בו נתונים ישנים) שמור **עולה**,
// 32 מתוך 32 עקביים. **שני חשבונות בסדר הפוך זה מזה.**
// הדשבורד שובר שוויון בתוך תאריך לפי אינדקס המקור (`b.i-a.i`,
// תיקון 1.0.21), וזה **מניח סדר עולה** — ולכן על חשבון ששמור יורד
// הוא הופך אותו דווקא לרעה. ⚠ **תיקון התצוגה לבדו לא יכול לעבוד
// כשהקלט אינו עקבי.** לכן מנרמלים במקור.
// ⚠ הכיוון **אינו נקבע לפי תאריכים** אלא לפי **שרשרת היתרה**, שמאמתת
// את עצמה: בסדר הנכון מתקיים `balance[i]-balance[i-1] == credit-debit`.
// סופרים את המעברים העקביים בשני הכיוונים ובוחרים את הטוב. כך זה עובד
// גם כשכל השורות באותו תאריך, וגם אם הדף ישנה סדר שוב.
function chainScore(rows){
  let good=0;
  for(let i=1;i<rows.length;i++){
    const p=rows[i-1],c=rows[i];
    if(p.balance==null||c.balance==null)continue;
    const delta=Math.round((Number(c.balance)-Number(p.balance))*100)/100;
    const move=Math.round(((Number(c.credit)||0)-(Number(c.debit)||0))*100)/100;
    if(Math.abs(delta-move)<0.011)good++;
  }
  return good;
}
function orderedAscending(rows){
  if(!Array.isArray(rows)||rows.length<3)return rows;
  const rev=rows.slice().reverse();
  const f=chainScore(rows),r=chainScore(rev);
  try{chrome.storage.local.set({discountRowOrder:{forward:f,reversed:r,
    n:rows.length,chose:r>f?'הפוך':'כמות שהוא',at:new Date().toISOString()}})}catch(e){}
  return r>f?rev:rows;
}
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
// ⚠⚠ 25.08.2026 — טל: „בדיסקונט, בחשבונות ללא מסגרת אשראי הוא רושם סתם מספרים."
// **השורש ב-`valueAfter`, והוא מבני:** כשאין סכום באלמנט של התווית הוא סורק
// `nextElementSibling`, `previousElementSibling` ו**את כל ילדי ההורה**,
// ומחזיר את **המספר הראשון שנקרה**. `money` בתורו תופס כל ספרה במחרוזת —
// ולכן מספר חשבון בן עשר ספרות חוזר כ„מסגרת אשראי של 514,220,276 ₪".
// בחשבון שאין בו מסגרת התווית עדיין על הדף ואין לידה סכום, ולכן זו כמעט ודאות.
//
// ⚠ `valueAfter` **לא שונה בכוונה** — היתרה וההתחייבויות עוברות דרכו ועובדות.
// מסגרת האשראי בלבד יוצאת ממנו למסלול קפדני:
//   · שלילה מפורשת („לא קיימת", „אין", „ללא") → null מיידי, בלי לחפש מספר.
//   · הסכום מתקבל רק אם הוא **באותו אלמנט אחרי התווית**, או **באח שכל
//     הטקסט שלו הוא סכום**. אח עם טקסט חופשי אינו ראיה — הוא בדיוק המקור
//     למספרי האשפה.
//   · `discountCreditProbe` רושם מה נמצא ומאיזה מסלול, כדי שאפשר יהיה
//     להכריע מן האחסון במקום לשאול.
// ⚠ חגורה שנייה: מסגרת אשראי בשקלים אינה בת תשע ספרות ומעלה ללא אגורות.
// מספר חשבון בדיסקונט הוא בן עשר ספרות ומזהה ישות בן תשע — בדיוק הצורה
// שנקראה בטעות. זה **אינו** תחליף לכלל המיקום, אלא רשת ביטחון אחריו.
const plausibleLimit=n=>Number.isFinite(n)&&Math.abs(n)<1e8;
// ⚠⚠ 25.08.2026 — **מסגרת שזהה ליתרה בדיוק היא היתרה, לא מסגרת.**
// נמדד פעמיים אצל טל, ובשני המקרים ההתאמה הייתה לאגורה:
//   „אביסידריס יובל" מסגרת 154.92 = יתרה 154.92
//   „ינון מושב"      מסגרת 285,292.66 = יתרה 285,292.66
// והגשש הראה איך: `{t:"₪285,292.66", why:"אח שכולו סכום"}` — בחשבון
// **ללא** מסגרת, התווית „מסגרת אשראי" יושבת ליד סכום היתרה, והסריקה
// הרחבה תופסת אותו כי הוא אכן „אלמנט שכולו סכום".
// ⚠ אין דרך להבחין ביניהם לפי מבנה — **רק לפי הערך**. ההסתברות
// שמסגרת אשראי אמיתית תהיה זהה ליתרה עד האגורה זניחה, והנפילה
// בטוחה: ריק במקום מספר שגוי.
function creditLimitValue(labels,balance){
  const probe={at:new Date().toISOString(),tried:[]},NEG=/(לא\s+קיימ|לא\s+קיים|אין\s|ללא\s)/;
  const PURE=/^[₪\s]*-?[\d,]+(?:\.\d{1,2})?[₪\s]*$/;
  let found=null,negated=false;
  for(const label of labels){
    const nodes=[...document.querySelectorAll('button,p,div,span')]
      .filter(el=>tc(el).includes(label)).sort((a,b)=>tc(a).length-tc(b).length);
    for(const el of nodes){
      const t=text(el),after=t.slice(t.indexOf(label)+label.length);
      if(NEG.test(t)){negated=true;probe.tried.push({label,why:'שלילה מפורשת',t:t.slice(0,90)});break}
      // ⚠⚠ **גם „באותו אלמנט" היה לא בטוח, ונתפס בבדיקה.** רשימת המועמדים
      // כוללת גם את ה-div ההורה, ושם הטקסט שאחרי התווית הוא חופשי:
      // „מסגרת אשראי **חשבון 514220276 עו״ש**" החזיר 514,220,276.
      // הכלל: הסכום חייב לבוא **מיד** אחרי התווית (אחרי רווח/נקודתיים/₪
      // בלבד), ולא להימצא איפשהו בהמשך המשפט.
      const im=after.match(/^[\s:₪]*(-?[\d,]+(?:\.\d{1,2})?)/);
      const own=im?money(im[1]):null;
      if(own!=null&&!plausibleLimit(own)){probe.tried.push({label,why:'נדחה — לא נראה כמסגרת',v:own});continue}
      if(own!=null){found=own;probe.tried.push({label,why:'מיד אחרי התווית',t:after.slice(0,40),v:own});break}
      // ⚠ ילדי ההורה **נשארים בסריקה** — החשבון שכן יש לו מסגרת נקרא נכון
      // (50,000) ולא ידוע דרך איזה מסלול; הוצאתם הייתה מסכנת אותו.
      // מה שהשתנה הוא **המבחן**, לא הרוחב: רק אלמנט שכל הטקסט שלו סכום.
      for(const near of [el.nextElementSibling,el.previousElementSibling,...(el.parentElement?.children||[])]){
        if(near===el)continue;
        if(!near)continue;
        const nt=text(near).trim();
        if(!PURE.test(nt)){probe.tried.push({label,why:'אח נדחה — לא סכום נקי',t:nt.slice(0,50)});continue}
        const n=money(nt);
        if(n!=null&&!plausibleLimit(n)){probe.tried.push({label,why:'אח נדחה — לא נראה כמסגרת',v:n});continue}
        if(n!=null){found=n;probe.tried.push({label,why:'אח שכולו סכום',t:nt.slice(0,40),v:n});break}
      }
      if(found!=null)break;
    }
    if(found!=null||negated)break;
  }
  if(found!=null&&Number.isFinite(Number(balance))&&Math.abs(found-Number(balance))<0.005){
    probe.tried.push({why:'נדחה — זהה ליתרה',v:found,balance:Number(balance)});
    found=null;
  }
  probe.value=found;probe.negated=negated;
  try{chrome.storage.local.set({discountCreditProbe:probe})}catch{}
  return found;
}
function labelMoney(labels){for(const label of labels){const value=valueAfter(label);if(value!=null)return value}return null}
function loanValue(s,labels){for(const label of labels){const m=s.match(new RegExp(`${label}[^\\d-]{0,35}(-?[\\d,]+(?:\\.\\d{1,2})?)`));if(m)return money(m[1])}return null}
function loanDate(s,labels){for(const label of labels){const m=s.match(new RegExp(`${label}[^\\d]{0,30}(\\d{1,2}[./]\\d{1,2}[./]\\d{2,4})`));if(m)return m[1]}return''}
function finalPaymentDate(next,installments){const d=String(next||'').match(/^(\d{1,2})[./](\d{1,2})[./](\d{2,4})$/),p=String(installments||'').match(/(\d+)\s*\/\s*(\d+)/);if(!d||!p)return'';let year=Number(d[3]);if(year<100)year+=2000;const paid=Number(p[1]),total=Number(p[2]),remainingAfterNext=total-paid-1;if(remainingAfterNext<0)return'';const date=new Date(year,Number(d[2])-1+remainingAfterNext,Number(d[1]));return`${String(date.getDate()).padStart(2,'0')}/${String(date.getMonth()+1).padStart(2,'0')}/${date.getFullYear()}`}
function loans(){const tables=[...document.querySelectorAll('table')],detail=tables.find(t=>/מספר הלוואה/.test(text(t))&&/יתרת הלוואה/.test(text(t))&&/תשלום קרוב/.test(text(t)));if(detail){return[...detail.querySelectorAll('tbody tr')].map((row,i)=>{const c=[...row.querySelectorAll('td,[role="cell"],[role="gridcell"]')].map(text);if(c.length<8)return null;const installments=c[4]||'',nextPaymentDate=c[6]||'';return{id:c[1]||String(i+1),type:c[0]||'הלוואה',balance:money(c[2]),originalPrincipal:null,repaymentMethod:c[3]||'',installments,interest:c[5]||'',nextPaymentDate,nextPayment:money(c[7]),endDate:finalPaymentDate(nextPaymentDate,installments)}}).filter(Boolean)}const candidates=[...document.querySelectorAll('tr,[role="row"],article,.card,[class*="loan" i],[class*="credit" i],li')].map(el=>({el,s:text(el)})).filter(x=>/הלווא|אשראי/.test(x.s)&&(/\b\d{8,14}\b/.test(x.s)||/יתרה|ריבית|החזר/.test(x.s)));const out=[],seen=new Set();for(const{x,s}of candidates){const id=(s.match(/\b\d{8,14}\b/)||[])[0]||String(out.length+1);if(seen.has(id))continue;const balance=loanValue(s,['יתרת הלוואה','יתרה לסילוק','יתרת קרן','יתרה']),nextPayment=loanValue(s,['החזר קרוב','תשלום קרוב','החזר חודשי','סכום החיוב הקרוב']),originalPrincipal=loanValue(s,['סכום הלוואה','קרן מקורית']);const interest=(s.match(/(?:שיעור )?ריבית[^%]{0,45}([A-Za-z+ .\d%-]*%)/)||[])[1]?.trim()||'';if(balance==null&&nextPayment==null&&!interest)continue;seen.add(id);out.push({id,type:'הלוואה',balance,originalPrincipal,nextPayment,nextPaymentDate:loanDate(s,['מועד תשלום קרוב','תשלום קרוב','חיוב קרוב']),endDate:loanDate(s,['מועד תשלום סופי','תאריך סיום','סיום ההלוואה']),interest})}return out}
function mortgages(){const out=[];for(const row of document.querySelectorAll('[role="grid"] [role="row"]')){const c=[...row.querySelectorAll('[role="cell"],[role="gridcell"]')].map(text);if(c.length<6||!/הלווא|הלואה/.test(c[0]))continue;const installments=c[2]||'',near=c[5]||'',date=(near.match(/\d{1,2}[./]\d{1,2}[./]\d{2,4}/)||[])[0]||'';out.push({id:`mortgage-${out.length+1}`,type:`משכנתא · ${c[0]}`,originalPrincipal:money(c[1]),installments,balance:money(c[3]),interest:c[4]||'',nextPayment:money(near),nextPaymentDate:date,endDate:finalPaymentDate(date,installments),isMortgage:true})}return out}
function loanProbe(){return{url:location.href,heading:[...document.querySelectorAll('h1,h2,h3')].map(text).filter(Boolean).slice(0,12),loanCount:loans().length,mortgageCount:mortgages().length,head:bodyText().slice(0,700)}}
function gotoLoans(){const top=document.querySelector('#LOANS_MAIN_WORLD-link');if(!top)throw Error('לא נמצא תפריט הלוואות וערבויות');realClick(top.querySelector('img')||top);setTimeout(()=>{const links=[...document.querySelectorAll('a,button,[role="menuitem"],[role="option"],li')];const target=links.find(el=>/^(פירוט הלוואות|הלוואות|ריכוז הלוואות|הלוואות פעילות)$/.test(text(el)))||links.find(el=>/פירוט הלוואות|ריכוז הלוואות|הלוואות פעילות/.test(text(el)));const clickable=target?.closest?.('a,button')||target;if(clickable)realClick(clickable)},700)}
// ⚠ 20.08.2026 — נמדד חי דרך CDP על הדף עצמו, ולא נוחש:
//   input#fromDate (רכיב db-datepicker, placeholder dd/mm/yyyy, ערך התחלתי 01/05/2026)
//   ו-button.advanced-search-btn. הזרקת ערך + input/change/blur + לחיצה הרחיבה את
//   הטבלה מ-69 שורות (המוקדמת 20.5.26) ל-149 (המוקדמת 31.12.25) תוך 0.7 שניות.
// ⚠ Angular מתעלם מ-el.value=... ישיר. חייבים את ה-setter המקורי של HTMLInputElement,
//   אחרת ngModel לא מתעדכן והחיפוש רץ על הערך הישן.
const nativeSet=(el,v)=>{const d=Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el),'value');if(d&&d.set)d.set.call(el,v);else el.value=v;for(const t of['input','change','blur'])el.dispatchEvent(new Event(t,{bubbles:true}))};
const ilDate=iso=>{const m=String(iso||'').match(/^(\d{4})-(\d{2})-(\d{2})$/);return m?`${m[3]}/${m[2]}/${m[1]}`:''};
const rowDates=()=>{const out=[];
// ⚠⚠ 25.08.2026 — **115.7 מתוך 129.6 שניות של סנכרון ישות היו כאן.**
// נמדד מ-`discountPhases`: „אחרי החלת הטווח" ב-115,688 מ״ש, וכל שאר
// השלבים מילישניות. `applyCollectSince` קורא ל-`earliestRow()` ארבע
// פעמים, וכל קריאה מריצה `text(r)` — כלומר **`innerText` על כל שורה
// בטבלה**, וכל אחת כופה חישוב פריסה.
// ⚠ זו השכבה **הרביעית** של אותו באג, ובמקום שלא הגעתי אליו קודם:
// טיפלתי ב-`bodyText`, ב-`valueAfter`, וב-`txRowCount` — ולא כאן.
// **הלקח: אחרי שמוצאים `innerText` בנתיב חם, לחפש את כל אחיו.**
// `textContent` מספיק כאן לחלוטין — מחפשים תבנית dd/mm/yyyy בטקסט.
for(const r of document.querySelectorAll('tr,[role="row"],.rc-table-row'))for(const m of tc(r).matchAll(/\b(\d{2})\/(\d{2})\/(\d{2,4})\b/g)){const y=m[3].length===2?2000+Number(m[3]):Number(m[3]);out.push(new Date(y,Number(m[2])-1,Number(m[1])).getTime())}return out};
const earliestRow=()=>{const d=rowDates();return d.length?Math.min(...d):0};
// „תחילת איסוף נתונים" חדלה להיות מסננת בלבד: כאן היא נשלחת לאתר.
// מבודד לחלוטין — רץ אחרי בחירת החשבון ורק בדף התנועות. דף בלי הפקדים האלה
// (פרטי, מסך אחר) יוצא בשקט וממשיך בסינון הקיים, בלי רגרסיה.
// ⚠⚠ 25.08.2026 — טל: „דיסקונט פרטי — חשוב שיזכור את התאריך."
// נמדד: `if(!isPrivate)await applyCollectSince()` — **בפרטי הטווח לא
// הוחל מעולם.** ההערה שמעל כבר צפתה שבפרטי אין את הפקדים ותכננה
// יציאה שקטה, ולכן התנאי היה **חגורה על חגורה** — והוא זה שמנע
// מהניסיון לקרות בכלל.
// ⚠ לא ניחשתי סלקטורים חדשים לדף הפרטי. מפעילים את אותה פונקציה
// המוגנת, והגשש ידווח: אם „פקדים חסרים" — נדע שצריך למדוד את הדף.
// ⚠ `private` נכנס לרשומה, אחרת רשומת פרטי דורסת את של עסקי ואי אפשר
// לדעת איזה מסך היא מתארת.
async function applyCollectSince(isPrivate=false){
  try{
    const st=await chrome.storage.local.get({collectSince:''}),want=ilDate(st.collectSince);
    // ⚠ 20.08.2026 — הדיווח חייב להיכתב **בכל מסלול**, כולל יציאה מוקדמת. בלי זה
    // רשומה חסרה נראית כמו „הקוד לא רץ", ובזבזנו על זה סבב: לא ידענו אם היציאה
    // הייתה מפני שאין תאריך, שאין פקדים, או שהערך כבר היה נכון.
    const report=async(reason,extra)=>{try{await chrome.storage.local.set({discountRangeApplied:{reason,from:want,private:!!isPrivate,at:new Date().toISOString(),url:location.hash,...extra}})}catch{}};
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
    phase('טווח: פקדים נמצאו');
    const wantMs=Date.parse(String(st.collectSince)),cur=earliestRow();
    phase('טווח: earliestRow #1');
    if(from.value===want&&to.value===today&&cur&&cur<=wantMs)return report('כבר בטווח',{earliest:new Date(cur).toISOString().slice(0,10),rows:document.querySelectorAll('.rc-table-row').length});
    const rowCount=()=>document.querySelectorAll('.rc-table-row').length;
    const before=earliestRow(),beforeRows=rowCount();
    phase('טווח: earliestRow #2');
    from.focus();nativeSet(from,want);await wait(300);
    phase('טווח: שדה מתאריך הוזן');
    to.focus();nativeSet(to,today);await wait(300);
    phase('טווח: שדה עד תאריך הוזן');
    btn.click();
    phase('טווח: השדות הוזנו והכפתור נלחץ');
    // ⚠ 20.08.2026 — הריצה הראשונה רשמה rows:0: הטבלה מתרוקנת בזמן הבקשה, והקריאה
    // חזרה לפני שהיא התמלאה. לכן לא מספיק „המוקדמת השתנתה" — ממתינים לטבלה
    // **לא ריקה ויציבה** בשתי דגימות רצופות, ואם נשארה ריקה — לוחצים שוב פעם אחת.
    // ⚠⚠ 25.08.2026 — **כאן נתקע הסנכרון, ונמדד במדויק.**
    // `discountPrevPhases` של הריצה שנתקעה:
    //   11,298 מ״ש „השדות הוזנו והכפתור נלחץ" → ואז **שקט עד 60,010**.
    // ובריצה שהצליחה: 2,165 → 27,143 „לולאת ההמתנה נגמרה (0 שורות)",
    // כלומר **25 שניות**.
    // הלולאה חסומה ב-25 סבבים × 600 מ״ש = 15 שניות **לפי ספירה בלבד**,
    // אבל כשהדף עסוק כל סבב עולה 1–2 שניות — ואז היא רצה 25 ואפילו
    // 48 שניות, ומפילה את `DISCOUNT_SYNC_SELECTED` ל-timeout ולניסיון חוזר.
    // ⚠ **תקרת סבבים אינה תקרת זמן.** נוסף גבול שעון־קיר, שאינו תלוי
    // במחיר הסבב.
    // ⚠ 12 שניות ולא פחות: בריצה שהצליחה הלולאה מיצתה 25 סבבים
    // והסתיימה עם **0 שורות** — כלומר המתנה ארוכה יותר ממילא לא עזרה,
    // ו-`extract` המשיך וקרא בהצלחה. הקיצור אינו גורע נתונים.
    const loopDeadline=Date.now()+12000;
    let stable=0,last=-1,retried=false,hitDeadline=false;
    // ⚠ 15 שניות ולא 30 — אותו תקציב. הטבלה נמדדה חיה כמתמלאת תוך פחות משנייה.
    for(let i=0;i<25;i++){
      await wait(600);const n=rowCount();
      // ⚠⚠ 25.08.2026 — **תנאי היציאה הוא עכשיו היעד עצמו, לא פרוקסי.**
      // נמדד: הלולאה רצה **28 שניות** ומיצתה את כל 25 הסבבים, בעוד
      // הטבלה כבר הציגה 75 שורות. הסיבה: היציאה דרשה **יציבות ספירה**
      // (`n===last` פעמיים ברציפות), ובטבלה שמתרנדרת מחדש הספירה
      // מתנודדת ולכן התנאי לעולם אינו מתקיים.
      // מה שבאמת רצינו לדעת: **האם הטבלה מגיעה לתאריך המבוקש.**
      // עד היום זו הייתה שאלה יקרה — `earliestRow` הריץ `innerText` על
      // כל שורה. אחרי המעבר ל-`textContent` היא עולה **2 מילישניות**
      // (נמדד: „earliestRow #1" ב-15 מ״ש, „#2" ב-16). ⚠ כלומר תיקון
      // הביצועים הוא מה שאיפשר את תיקון הנכונות — לא רק זירז אותו.
      if(n>0&&Number.isFinite(wantMs)){const e=earliestRow();if(e&&e<=wantMs)break}
      // יציבות הספירה נשארת כנפילה-לאחור, לחשבון שאין בו תנועה עד
      // התאריך המבוקש ולכן היעד לעולם לא יושג.
      if(n>0&&n===last){if(++stable>=2)break}else stable=0;
      last=n;
      if(!retried&&n===0&&i===10){retried=true;btn.click()}
      if(Date.now()>loopDeadline){hitDeadline=true;break}
    }
    phase(`טווח: לולאת ההמתנה נגמרה (${last} שורות${hitDeadline?', גבול זמן':''})`);
    await report('הופעל',{to:today,toValue:to.value,rows:rowCount(),beforeRows,earliest:(()=>{const e=earliestRow();return e?new Date(e).toISOString().slice(0,10):''})(),earliestBefore:before?new Date(before).toISOString().slice(0,10):'',retried,value:from.value})
    phase('טווח: הדיווח נכתב');
    note(`דיסקונט: טווח מ-${want}`);
  }catch(e){note(`דיסקונט: הרחבת הטווח נכשלה — ${e.message}`)}
}
// שומר הזהות: מוודא שהדף באמת מציג את הישות שביקשנו, לפי מספרי החשבון שהזיהוי כבר קרא.
// ⚠⚠ 25.08.2026 — **מספר החשבון לא נקרא יותר מן הדף כשהוא כבר ידוע.**
// נמדד: `activeAccount()` החזיר `0690300` — מספר החשבון של הנעבר בשורת
// תנועה („העברה לטל רצבי בנק 12 ל 12-645-0000690300"), כי הוא גורף
// רצפים בני 10 ספרות מטקסט הגוף. מסך התנועות **אינו מציג את מספר
// החשבון של הישות כלל**, ולכן אין שם מה למצוא.
// ⚠ זו לא הייתה רק חסימה: `extract` מחזיר `{...activeAccount()}` —
// כלומר החשבון היה **נשמר כ-0690300**. הזיהוי כבר קרא את המספר הנכון
// פעם אחת, ואין שום סיבה לנחש אותו שוב בכל סנכרון.
async function knownAccountFor(id){
  try{const st=await chrome.storage.local.get({discoveredAccounts:[]});
    for(const a of st.discoveredAccounts||[]){
      if(a.source!=='discount-business'||!a.accountNumber)continue;
      if(String(a.entityId||a.key).replace(/^.*\|/,'')===String(id))
        return{branch:String(a.branch||''),accountNumber:String(a.accountNumber)};
    }}catch{}
  return null;
}
async function assertEntityMatches(id,repaired=false){
  let known={};
  try{const st=await chrome.storage.local.get({discoveredAccounts:[]});
    for(const a of st.discoveredAccounts||[])if(a.source==='discount-business'&&a.accountNumber)known[String(a.entityId||a.key).replace(/^.*\|/,'')]=String(a.accountNumber)}catch{}
  const mine=known[String(id)]||'';
  const others=Object.entries(known).filter(([k])=>k!==String(id)).map(([,v])=>v);
  // ⚠⚠ 25.08.2026 — נמדד חסימה עם {want:"024844714", label:"024844714",
  // expected:"2556371", seen:"0690300"}. **הבורר היה על הישות הנכונה**,
  // ו-`0690300` **אינו אף אחד מארבעת החשבונות שהזיהוי מצא** — כלומר
  // `activeAccount()` חטף מספר זר מן הדף (אותה משפחת באג כמו מסגרת
  // האשראי: regex גורף על טקסט הגוף).
  // לכן נוספה ראיה שנייה, **בלי להחליש את הגלאי**: אם מספר החשבון שלנו
  // מופיע בדף ו**אף חשבון של ישות אחרת אינו מופיע** — זו הישות הנכונה,
  // גם אם הקורא המספרי טעה. שתי ישויות בדף בבת אחת = דו-משמעות = חסימה.
  // ⚠ 25.08.2026 — היה `bodyText()` **בתוך** הפונקציה, כלומר
  // קריאת `innerText` על כל הגוף **לכל מועמד בנפרד**: פעם ל-`mine` ועוד
  // אחת לכל ישות אחרת, בכל אחד מ-8 הסבבים, ופעמיים עם מסלול התיקון.
  // `innerText` כופה חישוב פריסה מלא. הגוף נקרא עכשיו **פעם אחת לסבב**.
  const onPage=(v,body)=>!!v&&!!body&&body.includes(v);
  let seen='',label='';
  // ⚠ 8 שניות ולא 15: יחד עם הרחבת הטווח זה חרג מתקציב 90 השניות של הרקע.
  for(let i=0;i<8;i++){
    // ⚠ שם מקומי שונה מן העוזר הגלובלי `bodyText()` — הצללה כאן יצרה
    // `const bodyText=bodyText()`, הפניה עצמית ו-TDZ בזמן ריצה.
    const pageText=bodyText();
    seen=String(activeAccount().accountNumber||'');label=entityId(text(entityButton()));
    const okLabel=!label||label===String(id);
    const othersOnPage=others.filter(v=>onPage(v,pageText));
    // ⚠⚠ **בורר הישות הוא ראיה חיובית, ולא רק בדיקת שלילה.**
    // נמדד: {label:"024844714"=want, minePresent:false, othersPresent:[]}
    // — הבורר על הישות הנכונה, מספר החשבון שלנו פשוט **אינו על המסך**
    // הזה, ואף חשבון של ישות אחרת אינו שם. דרישת `onPage(mine)` חסמה
    // סנכרון תקין לחלוטין.
    // ⚠ **זו החלשה מכוונת, וזה הגבול שלה:** בכשל שנמדד ב-21.08
    // ({want:"024844714", label:"570012930"}) הבורר הצביע על הישות
    // ה**לא** נכונה — ושם `labelConfirms` שקר והחסימה נשארת. וכל עוד
    // חשבון של ישות אחרת נראה בדף, `othersOnPage` חוסם כמו קודם.
    const labelConfirms=!!label&&label===String(id);
    const okNumber=mine
      ?(seen===mine||((onPage(mine,pageText)||labelConfirms)&&!othersOnPage.length))
      :(seen&&!others.includes(seen));
    if(okLabel&&okNumber&&(seen||onPage(mine,pageText)||labelConfirms)){
      // ⚠ נרשם **איך** התקבל האישור. „עבר" דרך הבורר בלבד הוא מצב חלש
      // יותר מ„עבר" דרך התאמת מספר, ואם אי פעם יישמרו נתונים של ישות
      // אחרת — זו הרשומה שתגיד מאיזה מסלול זה הגיע.
      try{await chrome.storage.local.set({discountIdentityPass:{want:String(id),
        via:seen===mine?'מספר תואם':(onPage(mine,pageText)?'החשבון בדף':'בורר הישות בלבד'),
        seen,label,minePresent:onPage(mine,pageText),at:new Date().toISOString()}})}catch{}
      return}
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
  // ⚠ הגשש רושם **מה בדיוק נראה בדף**, כדי שלא נצטרך לנחש מה היה
  // `0690300`: כל מספרי החשבון שהזיהוי מכיר ומי מהם נוכח, וכל רצף בן
  // 10 ספרות שנמצא. בלי זה „מוצג חשבון X" הוא מבוי סתום.
  try{const body=bodyText();
    await chrome.storage.local.set({discountIdentityBlock:{want:String(id),expected:mine,seen,label,
      minePresent:onPage(mine,body),othersPresent:others.filter(v=>onPage(v,body)),
      tenDigits:[...new Set(body.match(/\d{10}/g)||[])].slice(0,12),
      near:seen?(body.match(new RegExp(`.{0,40}${seen}.{0,40}`))||[''])[0]:'',
      at:new Date().toISOString()}})}catch{}
  throw Error(`הדף לא עבר לישות ${id}: מוצג חשבון ${seen||'לא ידוע'}${mine?` במקום ${mine}`:''}${label&&label!==String(id)?` (הבורר מציג ${label})`:''} — הסנכרון נעצר כדי לא לשמור נתונים של חשבון אחר`);
}
async function extract(id,isPrivate=false){phaseStart(id);// ⚠ הלקח שחזר שלוש פעמים: להמתין לטעינה לפני קריאה. אחרי הניווט וההזרקה מחדש הדף
// עדיין מתרנדר, וקריאה מיידית מחזירה null ומפילה את הסנכרון.
// ⚠⚠ 25.08.2026 — **הלולאה הזו היא רוב זמן הסנכרון בדיסקונט.**
// נמדד: 304 שניות בין „פותח תנועות" ל-`discountIdentityPass`.
// `valueAfter` סורק **כל button/p/div/span בדף** וקורא `innerText` על כל
// אחד — וזה כופה חישוב פריסה מלא. בדף תנועות עם מאות שורות זו פעולה
// יקרה, והיא רצה כאן עד 120 פעם.
// ⚠ **וההערה שלמטה בקוד עצמו כבר אמרה את זה:** „בדף התנועות התווית היא
// „עובר ושב", ו-„יתרת עו״ש" קיימת רק בדף הבית." כלומר בדף התנועות
// הקריאה מחזירה `null` תמיד — **120 סריקות יקרות שאינן יכולות להצליח.**
// `txCandidates()` הוא הבדיקה שבאמת עוצרת את הלולאה, והוא זול.
// לכן: הזול בכל סבב, והיקר אחת ל-2 שניות בלבד — הנפילה-לאחור לדף הבית
// נשמרת, ומחירה יורד פי שמונה.
for(let i=0;i<120;i++){
  if(txCandidates().length)break;
  if(i%8===7&&valueAfter('יתרת עו"ש')!=null)break;
  await wait(250)}
phase('המתנה לטעינת הדף');
// ⚠⚠ 21.08.2026 — **הבאג החמור ביותר עד כה.** טל: „הוא סנכרן את החשבון של יובל,
// נתן לו שם של ינון, ומחק את הסנכרון של טל." נמדד מהמסך: בעלים „ינון" עם
// סניף 008 חשבון 3920651 — **המספר של אביסידריס יובל.** הסיבה: `owner` נקרא
// מתווית הבורר ו-`activeAccount()` מהטקסט בדף, ושניהם נקראו כשהדף עוד הציג את
// הישות הקודמת. תווית שהתחלפה **אינה** הוכחה שהנתונים התחלפו.
// לכן: לא קוראים ישות שלא אומתה מול מספר חשבון ידוע. עדיף להיכשל מלשמור שקר.
if(!isPrivate)await assertEntityMatches(id);
// הטווח נשלח לאתר לפני קריאת השורות — אחרת נקרא את חלון ברירת המחדל (3 חודשים).
await applyCollectSince(isPrivate);phase('אחרי החלת הטווח');
// ⚠ נמדד חי: בדף התנועות התווית היא "עובר ושב", ו-"יתרת עו\"ש" קיימת רק בדף הבית.
// מרגע שהתחלנו לנווט לתנועות לפני הקריאה, החיפוש אחר התווית הישנה החזיר null תמיד.
// ⚠ 21.08.2026 — נמדד חי: ישות 514220276 נשמרה בשם „טל רצבי" — השם של
// הישות שקדמה לה בלולאה. `owner` נקרא במקור בשורה הראשונה של extract —
// לפני ההמתנה לטעינה ולפני assertEntityMatches — ולכן תפס את תווית הבורר
// הישנה. שומר הזהות מ-1.0.17 אימת את **מספר החשבון** בלבד, והשם עקף אותו:
// הכסף היה נכון והתווית שיקרה. עכשיו השם נקרא באותו רגע שבו נקראים היתרה,
// מספר החשבון והתנועות — אחרי שהמעבר אומת — ולכן כולם מאותו מצב של הדף.
const owner=isPrivate?'':text(entityButton()).replace(/\b\d{9}\b/,'').replace(/\s{2,}/g,' ').trim();phase('אחרי גלאי הזהות');const known=isPrivate?null:await knownAccountFor(id);
// ⚠ המספר שהזיהוי קרא גובר על גריפה מטקסט הדף. נפילה-לאחור נשמרת
// לדיסקונט פרטי ולכל מקרה שבו הישות אינה ברשימה.
const account=known||activeAccount(),balance=currentBalance(),creditLimit=isPrivate?null:creditLimitValue(['מסגרת אשראי','מסגרת עו"ש','מסגרת מאושרת'],balance),liabilities=valueAfter('התחייבויות'),rows=orderedAscending(transactions());if(balance==null){lastTxProbe=txProbe();throw Error(`לא זוהתה יתרת עו״ש עבור ${owner} | דף ${location.hash} | שורות ${txCandidates().length} | ${bodyText().slice(0,150)}`)}if(!rows.length){lastTxProbe=txProbe();throw Error(`לא נקראו תנועות עבור ${owner} | דף ${location.hash} | טבלאות ${document.querySelectorAll('table').length}`)}phase('סיום הקריאה');await phaseSave(id);
return{...account,entityId:id,nickname:owner||'דיסקונט פרטי',owner,balance,creditLimit,availableCredit:creditLimit==null?null:creditLimit+balance,liabilities,products:liabilities==null?[]:[{category:'התחייבויות',total:-Math.abs(liabilities),items:[]}],transactions:rows,loans:[],cards:[]}}
async function sync(keys,isPrivate=false){const out=[];for(const key of keys)out.push(await extract(key,isPrivate));return out}
chrome.runtime.onMessage.addListener((m,_s,reply)=>{if(m?.type==='DISCOUNT_PING'){reply({ok:true});return}if(m?.type==='DISCOUNT_PRIVATE_DISCOVER'){discoverPrivate().then(accounts=>reply({ok:true,accounts})).catch(e=>reply({ok:false,error:e.message,probe:probe()}));return true}if(m?.type==='DISCOUNT_SELECT_PRIVATE_ACCOUNT'){reply({ok:true});selectPrivateAccount(m.key).catch(e=>note(`דיסקונט פרטי: ${e.message}`));return}if(m?.type==='DISCOUNT_READ_MORTGAGES'){reply({ok:true,loans:mortgages(),probe:loanProbe()});return}if(m?.type==='DISCOUNT_STATE'){const account=activeAccount();reply({ok:true,entity:entityId(text(entityButton())),owner:text(entityButton()).replace(ENTITY,'').replace(/\s{2,}/g,' ').trim(),branch:account.branch,accountNumber:account.accountNumber,url:location.hash,rows:txRowCount(),
// ⚠⚠ 25.08.2026 — **`currentBalance()` הוסר מכאן, וזה היה 154 שניות.**
// לולאת ההמתנה ברקע („פותח תנועות" → קריאה) שולחת `DISCOUNT_STATE`
// **12 פעמים**, וקוראת מן התשובה **רק את `rows`**. אבל `currentBalance()`
// נופל ל-`latestRowBalance(transactions())` — **פרסור מלא של כל התנועות**
// — בכל אחת מ-12 הקריאות, בשביל ערך שאיש אינו קורא.
// וכשהחישוב חורג מתקרת 15 השניות של ההודעה, `st` הוא `null`,
// `st?.rows>0` שקר, **והלולאה ממצה את כל 12 הסבבים.** נמדד: 154 שניות
// בין „פותח תנועות" לתחילת `extract`, בעוד `extract` עצמו לוקח 8 מ״ש.
// ⚠ אומת שאף קורא ברקע אינו נוגע ב-`balance` מן התשובה הזו. הוא נשאר
// זמין לפי בקשה מפורשת, כדי שלא לשבור קורא עתידי בשקט.
balance:m.withBalance?currentBalance():null,
// ⚠⚠ 25.08.2026, טל: „היתרה לבדה יוצרת בעיה — צריך גם סכום חובה
// וסכום זכות." צודק: שתי תנועות נגדיות באותו סכום משאירות את היתרה
// זהה. סכומי החובה והזכות **כן** משתנים, ולכן הם סוגרים את החור.
// ⚠ הסכומים מלווים ב-`fromMs`/`toMs` **של השורות שבאמת מוצגות**.
// בלעדיהם ההשוואה חסרת משמעות: הדף מציג חלון ברירת מחדל, והשמור
// מכסה מ-`collectSince` — שני טווחים שונים, וסכומים שלא ניתן להשוות.
// הרקע מסכם את השמור **רק בתוך אותו טווח**.
totals:m.withBalance?(()=>{const rows=transactions();
  const toMs=v=>{const q=String(v||'').match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}(?:\d{2})?)$/);
    if(!q)return NaN;let y=Number(q[3]);if(y<100)y+=2000;return Date.UTC(y,Number(q[2])-1,Number(q[1]))};
  let d=0,c=0,lo=null,hi=null;
  for(const r of rows){d+=Number(r.debit)||0;c+=Number(r.credit)||0;
    const t=toMs(r.date);if(Number.isFinite(t)){if(lo==null||t<lo)lo=t;if(hi==null||t>hi)hi=t}}
  return{debit:Math.round(d*100)/100,credit:Math.round(c*100)/100,fromMs:lo,toMs:hi,n:rows.length};
})():null});return}if(m?.type==='DISCOUNT_SELECT_ENTITY'){const want=String(m.entity||'');// עונים לפני הבחירה: המעבר טוען מחדש את הדף והורג את הסקריפט
reply({ok:true,already:entityId(text(entityButton()))===want});if(entityId(text(entityButton()))!==want)selectEntity(want).catch(e=>note(`דיסקונט עסקי: ${e.message}`));return}if(m?.type==='DISCOUNT_GOTO_TX'){const has=txCandidates().length>0;// עונים לפני הלחיצה: הניווט הורג את הסקריפט, ותשובה שנשלחת אחריו לא תגיע לעולם
reply({ok:true,already:has});if(!has){const link=[...document.querySelectorAll('a,button,[role="button"],[role="link"]')].find(el=>/לצפייה בתנועות|תנועות עו"ש/.test(text(el)));if(link)realClick(link)}return}if(m?.type==='DISCOUNT_GOTO_LOANS'){reply({ok:true});try{gotoLoans()}catch(e){note(`דיסקונט: ${e.message}`)}return}if(m?.type==='DISCOUNT_LOAN_STATE'){reply({ok:true,...loanProbe()});return}if(m?.type==='DISCOUNT_READ_LOANS'){reply({ok:true,loans:loans(),probe:loanProbe()});return}if(m?.type==='DISCOUNT_DISCOVER'){discover().then(accounts=>reply({ok:true,accounts})).catch(e=>reply({ok:false,error:e.message,probe:probe()}));return true}if(m?.type==='DISCOUNT_SYNC_SELECTED'){
// ⚠⚠ 25.08.2026 — **מדידה בגבול המטפל.** נמדד שוב ושוב: המטפל הזה
// **אינו משיב** (60ש׳ ואז 150ש׳, שניהם), בעוד `DISCOUNT_STATE` באותו
// `onMessage`, באותה לשונית ובאותו רגע, משיב בשש מילישניות.
// `sync()` עצמה טריוויאלית (`for … await extract`), וכל ההמתנות
// בתוך `extract` חסומות ומסתכמות בכ-60 שניות — **כלומר 150 שניות
// ללא תשובה אינן מוסברות בקוד שאני רואה.**
// ⚠ שלוש אפשרויות שלא ניתן להפריד ביניהן בלי מדידה:
//   1. המטפל לא נכנס כלל (ההודעה לא הגיעה),
//   2. `sync()` זורק **סינכרונית** ולכן `.then/.catch` לא נבנים,
//   3. ה-promise אינו נפתר לעולם,
//   4. `reply()` נקרא אך נבלע (הקשר מת).
// `discountSyncTrace` מפריד את ארבעתן. **הוא נכתב בכל נקודה, מיד.**
const __t0=Date.now();
const __mark=w=>{try{chrome.runtime.sendMessage({type:'DISCOUNT_TRACE',where:w,ms:Date.now()-__t0}).catch(()=>{})}catch(e){}
  try{chrome.storage.local.set({discountSyncTrace:{at:new Date().toISOString(),where:w,ms:Date.now()-__t0,keys:m.keys||[]}})}catch(e){}};
__mark('נכנס למטפל');
try{
  const __p=sync(m.keys||[],Boolean(m.private));
  __mark('sync() החזיר promise');
  __p.then(accounts=>{__mark('sync() נפתר');reply({ok:true,accounts});__mark('reply נשלח')})
     .catch(e=>{__mark('sync() נדחה: '+String(e&&e.message||e).slice(0,50));reply({ok:false,error:e.message,probe:lastTxProbe})});
}catch(e){__mark('sync() זרק סינכרונית: '+String(e&&e.message||e).slice(0,50));reply({ok:false,error:e.message,probe:lastTxProbe})}
return true}});
let reported=false;const reportAuthenticated=()=>{if(!reported&&location.hash.includes('MY_ACCOUNT_HOMEPAGE')){reported=true;chrome.runtime.sendMessage({type:'DISCOUNT_AUTHENTICATED'}).catch(()=>{})}};setInterval(reportAuthenticated,800);reportAuthenticated();
})();
