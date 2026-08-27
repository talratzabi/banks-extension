(()=>{
// שומר הזרקה עמיד למות הקשר — ראה discount-content.js
if(window.__fibiSyncLoaded){try{if(window.__fibiSyncLoaded())return}catch(e){}}
// ⚠ ההפניה נתפסת כאן ולא נקראת מחדש בכל בדיקה: קריאה מחדש
// מחזירה את ה-chrome החדש, והגשש מדווח „חי" גם כשההקשר שלו מת. נתפס בבדיקה.
const __rt__fibiSyncLoaded=(()=>{try{return chrome.runtime}catch(e){return null}})();
window.__fibiSyncLoaded=()=>{try{return !!(__rt__fibiSyncLoaded&&__rt__fibiSyncLoaded.id)}catch(e){return false}};

chrome.runtime.onMessage.addListener((m,_s,reply)=>{
  if(m?.type==='FIBI_PING'){reply({ok:true});return}
  if(m?.type==='FIBI_SUMMARY'){try{reply({ok:true,data:summary()})}catch(e){reply({ok:false,error:e.message})}return}
  if(m?.type==='FIBI_TRANSACTIONS'){try{reply({ok:true,data:transactions()})}catch(e){reply({ok:false,error:e.message})}return}
  if(m?.type==='FIBI_SET_RANGE'){setRange(m.since||0).then(r=>reply({ok:true,...r})).catch(e=>reply({ok:false,error:e.message}));return true}
  if(m?.type==='FIBI_OWNER'){try{reply({ok:true,data:owner()})}catch(e){reply({ok:false,error:e.message})}return}
  if(m?.type==='FIBI_LOANS'){try{reply({ok:true,data:loans()})}catch(e){reply({ok:false,error:e.message})}return}
});
let reported='';function report(){if(location.hostname==='online.fibi.co.il'&&location.hash&&location.hash!==reported){reported=location.hash;chrome.runtime.sendMessage({type:'FIBI_AUTHENTICATED'}).catch(()=>{})}}report();setInterval(report,1000);
function text(el){return(el?.innerText||el?.textContent||'').replace(/\s+/g,' ').trim()}
function money(v){const s=String(v||'').replace(/[−–]/g,'-'),neg=s.includes('-'),clean=s.replace(/[,₪\s]/g,'').replace(/[^0-9.\-]/g,'');if(!clean||clean==='-')return null;const n=Number(clean.replace(/-/g,''));return Number.isFinite(n)?(neg?-n:n):null}
function afterLabel(label){const all=[...document.querySelectorAll('body *')];const el=all.find(x=>text(x)===label);if(!el)return null;let p=el.parentElement;for(let i=0;i<4&&p;i++,p=p.parentElement){const vals=[...p.querySelectorAll('*')].map(text).filter(x=>/^-?[\d,]+\.\d{2}$/.test(x));if(vals.length)return money(vals[0])}return null}
function account(){const body=text(document.body),m=body.match(/\b(\d{3})-(\d{5,7})\b/);if(!m)throw Error('לא נמצא מספר החשבון בבינלאומי');return{branch:m[1],accountNumber:m[2]}}
function summary(){const a=account(),balance=afterLabel('יתרת עו״ש עדכנית');const body=text(document.body);const loanMatch=body.match(/הלוואות\s*([\d,]+(?:\.\d{2})?)/);const cardMatch=body.match(/סך החיובים הבאים:[\s\S]{0,60}?([\d,]+\.\d{2})/);const suffix=(body.match(/החיוב הבא:[\s\S]{0,80}?\b(\d{4})\b/)||body.match(/\b(\d{4})\b[\s\S]{0,40}?החיוב הבא/))?.[1]||'';return{...a,balance,loansTotal:loanMatch?money(loanMatch[1]):null,upcomingCardCharges:cardMatch?money(cardMatch[1]):null,cards:suffix?[{suffix,name:'כרטיס הבינלאומי',issuer:'הבינלאומי',amount:cardMatch?money(cardMatch[1]):0,transactions:[]}]:[]}}
function transactions(){const frame=document.querySelector('#iframe-old-pages'),doc=frame?.contentDocument;if(!doc)throw Error('דף התנועות של הבינלאומי עדיין לא נטען');const body=text(doc.body);const branch=(body.match(/סניף:\s*(\d+)/)||[])[1],accountNumber=(body.match(/מספר חשבון:\s*(\d+)/)||[])[1];const current=money((body.match(/יתרה עדכנית\s*([\d,.-]+)₪/)||[])[1]);const withdraw=money((body.match(/יתרה למשיכה\s*([\d,.-]+)₪/)||[])[1]);const table=[...doc.querySelectorAll('table')].find(t=>[...t.querySelectorAll('tr')].some(r=>/^\d{2}\/\d{2}\/\d{4}/.test(text(r))));if(!table)throw Error('לא נמצאה טבלת התנועות בבינלאומי');const rows=[...table.querySelectorAll('tr')].map(r=>{const c=[...r.querySelectorAll('td')].map(text);if(c.length<6||!/^\d{2}\/\d{2}\/\d{4}$/.test(c[0]))return null;return{date:c[0],action:c[1],details:'',reference:c[2],credit:money(c[3]),debit:money(c[4]),balance:money(c[5])}}).filter(Boolean);return{branch,accountNumber,balance:current,creditLimit:current!=null&&withdraw!=null?withdraw-current:null,availableCredit:withdraw,transactions:rows}}
function owner(){const result=name=>{const fullName=String(name||'').replace(/\s+/g,' ').trim(),parts=fullName.split(/\s+/).filter(Boolean);return{fullName,firstName:parts.length>1?parts.slice(1).join(' '):parts[0]||''}};const doc=document.querySelector('#iframe-old-pages')?.contentDocument;if(!doc)throw Error('אישור ניהול החשבון עדיין לא נטען');const line=[...doc.querySelectorAll('body *')].map(el=>(el.innerText||el.textContent||'').trim()).find(v=>/^לכבוד\s*:\s*[^\r\n]+/.test(v));if(line){const fullName=(line.match(/^לכבוד\s*:\s*([^\r\n]+)/)||[])[1];if(fullName)return result(fullName)}const tables=[...doc.querySelectorAll('table')];for(const table of tables){const rows=[...table.querySelectorAll('tr')],index=rows.findIndex(r=>/שם לקוח/.test(text(r)));if(index<0)continue;const cells=[...(rows[index+1]?.querySelectorAll('td')||[])].map(text);if(cells[0])return result(cells[0])}throw Error('לא נמצא שם בעל החשבון אחרי לכבוד באישור')}
function loans(){const doc=document.querySelector('#iframe-old-pages')?.contentDocument;if(!doc)throw Error('דף פירוט ההלוואות עדיין לא נטען');const tables=[...doc.querySelectorAll('table')].filter(t=>/שם ההלוואה/.test(text(t))&&/סכום הלוואה מקורי/.test(text(t))&&/סך החוב/.test(text(t))).sort((a,b)=>a.querySelectorAll('tr').length-b.querySelectorAll('tr').length);const table=tables[0];if(!table)return{loans:[],loansTotal:0};
// רק שורות שהטבלה היא האב הקרוב שלהן. querySelectorAll('tr') כלל בעבר גם טבלאות
// פנימיות של פירוט ויצר אותה הלוואה פעמיים.
const rows=[...table.querySelectorAll('tr')].filter(r=>r.closest('table')===table),seen=new Set(),items=[];
for(const r of rows){const cells=[...r.children].filter(el=>el.tagName==='TD'),c=cells.map(text);if(c.length!==9||!c[0]||c[0]==='סה"כ')continue;const item={type:c[0],originalPrincipal:money(c[1]),startDate:c[2],interest:c[3],balance:money(c[4]),endDate:c[5],nextPayment:money(c[6]),nextPaymentDate:c[7]};if(!(item.balance>0&&item.nextPayment>0))continue;const key=[item.type,item.originalPrincipal,item.balance,item.endDate,item.nextPayment,item.nextPaymentDate,item.interest].join('|');if(seen.has(key))continue;seen.add(key);
// לוח הסילוקין חושף את מספר התשלום הקרוב (למשל 16). מספר התשלומים שנותרו
// מחושב באופן כולל בין מועד התשלום הקרוב למועד הסופי, והסה"כ הוא ששולמו + נותרו.
const schedule=cells[8]?.querySelector('a[href*="luachSilukin"]'),args=(schedule?.getAttribute('href')?.match(/luachSilukin\(([^)]+)\)/)||[])[1]?.split(',').map(v=>Number(String(v).trim()));if(args?.length===3)item.scheduleArgs=args;
items.push(item)}return{loans:items,loansTotal:items.reduce((sum,x)=>sum+(x.balance||0),0)}}
// ⚠⚠ 27.08.2026 — טל: „סינכרנתי, מוריד נתונים רק מיוני." נמדד: fibi-1 נשמר עם
// 30 תנועות, 01/06/26 → 20/08/26, כי הלשונית הפעילה היא „תנועות אחרונות".
// **כל מה שלהלן נלקח מ-`fibiTxProbe` — מסגרת 157, לא נוחש:**
//   לשוניות (a): „תנועות אחרונות" · „מתחילת חודש נוכחי" · „מתחילת חודש קודם"
//                · **„תנועות בטווח תאריכים"** ← זו שנדרשת
//   שדות: #fromDate=01/08/2026 · #tillDate=27/08/2026  (jQuery UI datepicker)
//   ⚠ ולצידם **שדות נסתרים** FromdateValue(name=fromDate) ו-toDateValue(name=toDate),
//     שניהם ריקים — ייתכן שהם מה שנשלח בפועל. לכן נכתבים **גם** הם.
//   כפתור „הצג" קיים בדף (נמדד בטקסט הראש).
async function setRange(sinceMs){
  const nap=ms=>new Promise(r=>setTimeout(r,ms));
  // ⚠ נתפס בבדיקה: לחיצה על הלשונית מנווטת את מסגרת הלגסי, המסמך הישן מתנתק,
  // וכל שימוש בהפניה שמורה זורק. לכן המסמך נקרא **מחדש בכל פעם**.
  const fdoc=()=>document.querySelector('#iframe-old-pages')?.contentDocument||null;
  if(!fdoc())return{applied:false,why:'מסגרת דפי הלגסי לא נטענה'};
  const clean=v=>String(v??'').replace(/\s+/g,' ').trim();
  const dmy=d=>`${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
  const val=id=>fdoc()?.querySelector('#'+id)?.value||'';
  const rowsNow=()=>fdoc()?.querySelectorAll('table tr').length||0;
  // ⚠ הטקסט נקרא מ-textContent: הטקסט המרונדר תלוי בפריסה ומחזיר ריק במסגרת
  // שאינה מוצגת — נתפס בבדיקה, והיה מייצר „הטווח לא השתנה" כוזב.
  const earliest=()=>{const all=(clean(fdoc()?.body?.textContent).match(/\b\d{2}\/\d{2}\/\d{4}\b/g)||[])
      .map(x=>{const q=x.split('/');return new Date(+q[2],+q[1]-1,+q[0]).getTime()}).filter(Number.isFinite);
    return all.length?new Date(Math.min(...all)).toISOString().slice(0,10):''};
  const before={rows:rowsNow(),earliest:earliest(),from:val('fromDate'),till:val('tillDate')};
  if(!sinceMs)return{applied:false,why:'לא הוגדרה תחילת איסוף',before};
  const tabs=[...fdoc().querySelectorAll('a')].map(a=>({a,t:clean(a.textContent)}));
  const tab=tabs.find(x=>/תנועות\s*בטווח\s*תאריכים/.test(x.t));
  if(!tab)return{applied:false,why:'לשונית טווח התאריכים לא נמצאה',
    tabs:tabs.map(x=>x.t).filter(Boolean).slice(0,12),before};
  tab.a.click();
  // ⚠ גבול שעון־קיר ולא תקרת סבבים — הלקח מ-1.12.1.
  const ready=Date.now()+10000;
  while(Date.now()<ready&&!fdoc()?.querySelector('#fromDate'))await nap(300);
  await nap(600);
  // ⚠ האירוע נוצר בחלון העליון ולא במסגרת: אותו מקור, והדיספאץ' תקף גם אחרי
  // שהמסגרת נוּוטה.
  const set=(el,v)=>{if(!el)return false;el.value=v;
    for(const ev of ['input','change','blur'])el.dispatchEvent(new Event(ev,{bubbles:true}));return true};
  // ⚠⚠ 27.08 — `submitInfo` הכריע: `#fromDate` **אינו בתוך שום טופס**
  // (`form:null`, `formFieldCount:0`), והכפתור הוא `type=button` שקורא
  // `submitLinkForm('077','1',…)` — כלומר משוגר `LinkForm077`, טופס אחר לגמרי.
  // לכן השמה ישירה ל-`#fromDate` אינה מגיעה לשרת לעולם. השדה נושא
  // `class="hasDatepicker"`, כלומר **jQuery UI**, וזה מעדכן מצב פנימי ומריץ
  // מטפלים שמעתיקים את הערך לטופס המשוגר. השמה ל-`.value` עוקפת את שניהם.
  const setDate=(sel,d,txt)=>{const w=fdoc()?.defaultView,el=fdoc()?.querySelector(sel);
    if(!el)return 'אין שדה';
    // ⚠ הסימן הקובע הוא **המחלקה `hasDatepicker`** — זה מה שנמדד בדף. לא
    // מתנים ב-`data('datepicker')`: גרסאות jQuery UI שומרות את המצב במפתחות
    // שונים, ובדיקה צרה מדי הייתה מפילה אותנו חזרה להשמה הישירה שכבר הוכחה
    // כמי שאינה מגיעה לשרת.
    try{const $=w&&(w.jQuery||w.$);
      if($&&/hasDatepicker/.test(el.className||'')){
        $(el).datepicker('setDate',d);
        try{$(el).trigger('change')}catch(e2){}
        if(el.value)return 'datepicker';
      }
    }catch(e){}
    set(el,txt);return 'value';};
  const fromStr=dmy(new Date(sinceMs)),tillStr=dmy(new Date());
  const dd2=d=>String(d.getDate()).padStart(2,'0'),mm2=d=>String(d.getMonth()+1).padStart(2,'0');
  const fromD=new Date(sinceMs),tillD=new Date();
  const byName=(nm)=>fdoc()?.querySelector(`[name="${nm}"]`);
  // ⚠ `submitLinkForm('077',…)` משגר את `LinkForm077`. שם יושבים שדות התאריך
  // המפוצלים שהשרת קורא בפועל — ולכן כותבים לתוכו, לפי שם ובתוך הטופס.
  const linkForm=()=>fdoc()?.querySelector('form[name^="LinkForm"]')||null;
  const inForm=(nm)=>{const f=linkForm();return f?f.querySelector(`[name="${nm}"]`):byName(nm)};
  const linkFormDates=()=>({
    fromYY:set(inForm('I-FROM-YY'),String(fromD.getFullYear())),
    fromMM:set(inForm('I-FROM-MM'),mm2(fromD)),
    fromDD:set(inForm('I-FROM-DD'),dd2(fromD)),
    tillYY:set(inForm('I-TILL-YY'),String(tillD.getFullYear())),
    tillMM:set(inForm('I-TILL-MM'),mm2(tillD)),
    tillDD:set(inForm('I-TILL-DD'),dd2(tillD)),
    formFound:!!linkForm()});
  // ⚠⚠ 27.08 — הריצה עם הכפתור הנכון עדיין החזירה יוני. השערה שנבדקת כאן:
  // **הטופס אינו קורא את `#fromDate` אלא את השדות המפוצלים.** בגשש נמדדו
  // `I_FROM_YY/MM/DD` עם `0000/00/00` ו-`T20C0256-DATE-FROM/TO` ריקים —
  // ערכי ברירת מחדל שאיש לא מילא. זהו טופס IBM Portal ותיק, ושם זה הדפוס.
  // מילוי שדה שאינו בשימוש אינו מזיק; אי-מילוי שדה שכן בשימוש מסביר בדיוק
  // את מה שראינו. **לכן ממלאים את כולם ומדווחים מה נשאר אחרי השיגור.**
  const writeDates=()=>{const d=fdoc();return{
    fromDate:setDate('#fromDate',fromD,fromStr),
    tillDate:setDate('#tillDate',tillD,tillStr),
    hiddenFrom:set(d?.querySelector('#FromdateValue'),fromStr),
    hiddenTo:set(d?.querySelector('#toDateValue'),tillStr),
    // ⚠⚠ 27.08 — הדוח הראה את `LinkForm077`, הטופס שבאמת משוגר, ובתוכו:
    //   I-FROM-YY=2026  I-FROM-MM=01  I-FROM-DD=01   ← הכתיבה שלנו **כן** נחתה
    //   I-TILL-YY=0000  I-TILL-MM=00  I-TILL-DD=00   ← **לא מולאו מעולם**
    // תאריך התחלה בלי תאריך סיום = „הטווח לא תקין", והשרת חוזר לתצוגת ברירת
    // המחדל. גיליתי את קיום `I-TILL-*` בדוח של 1.18.2 **ולא מילאתי אותם** —
    // זה הפער היחיד שנשאר, והוא שלי.
    // ⚠ הכתיבה מכוונת אל הטופס המשוגר ולפי **שם**, ולא לפי id בדף כולו.
    ...linkFormDates(),
    tFrom:set(byName('T20C0256-DATE-FROM'),fromStr),
    tTo:set(byName('T20C0256-DATE-TO'),tillStr)}};
  // ⚠⚠ נמדד בריצה החיה 27.08: נכתב 01/01/2026, וב-`after.from` חזר **01/08/2026**.
  // כלומר הלשונית מאתחלת את השדה לתחילת החודש **אחרי** הכתיבה — הלולאה
  // הקודמת יצאה מיד כי `#fromDate` היה בדף עוד לפני הלחיצה, ולכן לא המתינה
  // כלל. **כותבים, מוודאים שהערך נדבק, וכותבים שוב עד שהוא נדבק.**
  let wrote=writeDates(),rewrites=0;
  // ⚠ הלולאה **אינה** יוצאת ברגע שהערך נכון: נמדד שהאתחול מגיע מאוחר, ויציאה
  // מוקדמת הייתה מחזירה „נכתב" בעוד הדף דורס אחר כך. לכן חלון קבוע שבו כל
  // סטייה נכתבת מחדש — נתפס בבדיקה, שבה `rewrites` נשאר 0 והשדה נדרס.
  const stick=Date.now()+3000;
  while(Date.now()<stick){await nap(400);if(val('fromDate')!==fromStr){wrote=writeDates();rewrites++}}
  const fromAfterWrite=val('fromDate');
  // ⚠⚠ ובעיה שנייה מאותו דוח: **יש שני כפתורי „הצג"**. הרשימה שנמדדה מתחילה
  // ב„הצג" **לפני** שמות הלשוניות — הוא שייך לבורר „סוג חשבון" בראש הדף —
  // והשני, שאחרי הלשוניות, הוא של פאנל הטווח. `find` הראשון בחר את הלא נכון.
  // לכן מחפשים כפתור **בתוך המכל שמכיל את `#fromDate`**, ורק אם אין — נופלים
  // לחיפוש הגורף.
  const scoped=(()=>{let n=fdoc()?.querySelector('#fromDate');
    for(let i=0;i<8&&n;i++,n=n.parentElement){
      const hit=[...(n.querySelectorAll?.('input[type="submit"],input[type="button"],button,a')||[])]
        .map(el=>({el,t:clean(el.value||el.textContent)}))
        .find(x=>/^(הצג|חפש|אישור|עדכן)$/.test(x.t));
      if(hit)return hit;
    }
    return null})();
  const cands=[...(fdoc()?.querySelectorAll('input[type="submit"],input[type="button"],button,a')||[])]
    .map(el=>({el,t:clean(el.value||el.textContent)}));
  const show=scoped||cands.find(x=>/^הצג$/.test(x.t))||cands.find(x=>/^(הצג|חפש|אישור|עדכן)/.test(x.t));
  // ⚠⚠ הכרעה: **כותבים שוב מיד לפני הלחיצה.** לולאה מבוססת-זמן אינה אמינה —
  // בבדיקה היא לא תפסה אתחול מאוחר (`rewrites:0` והשדה נדרס), והתזמון תלוי
  // בוויסות טיימרים. הרגע היחיד שחשוב הוא רגע השיגור, ולכן כותבים בו.
  wrote=writeDates();
  const fromAtClick=val('fromDate');
  // ⚠⚠ 27.08 — `LinkForm077` נמדד **מלא ונכון ברגע הלחיצה**:
  //   I-FROM 2026/01/01 · I-TILL 2026/08/27
  // ובכל זאת הדף חזר לברירת מחדל וכל השדות לאפסים. כלומר **הערכים נכונים,
  // והשיגור הוא שמאפס אותם.** החשוד היחיד שנשאר הוא הכפתור עצמו:
  //   onclick="submitLinkForm('077','1','','','','','','','','','')"
  // **אחת-עשרה ארגומנטים, תשעה מהם ריקים.** בטפסי IBM Portal הדפוס הוא
  // שהפונקציה **כותבת את הארגומנטים לתוך שדות הטופס** ואז משגרת — כלומר
  // היא מוחקת את מה שמילאנו רגע לפני ה-POST.
  // **לכן: לא לוחצים. משגרים את הטופס ישירות עם מה שכתבנו בו.**
  // ⚠⚠ 27.08 — הדוח הקודם הכריע: `fromAtClick` היה 01/01/2026, תשעת השדות
  // נכתבו, הכפתור הנכון נלחץ — **ואחרי הלחיצה כל השדות חזרו לברירת המחדל**
  // (`I_FROM_YY=0000`, `FromdateValue=""`, `fromDate=01/08/2026`) והשורות
  // נשארו 37. זו חתימה של **טעינה מחדש של המסגרת**, לא של סינון שנכשל.
  // כלומר הערכים אינם „נדרסים" — הטופס פשוט אינו זה שמשוגר.
  // **לפני שנכתבת שורת קוד נוספת: מה המנגנון.** נאסף כאן, קריאה בלבד.
  const attrs=el=>{if(!el)return null;const o={tag:el.tagName.toLowerCase()};
    for(const a of ['id','name','href','onclick','type','value','action','method','target','class'])
      {const v=el.getAttribute?.(a);if(v)o[a]=String(v).slice(0,180)}
    return o};
  const form=show?.el?.closest?.('form')||fdoc()?.querySelector('#fromDate')?.closest('form');
  const submitInfo={
    tabAnchor:attrs(tab.a),
    button:attrs(show?.el),
    // ⚠ יש בדף כמה טפסים; זה שמכיל את שדה התאריך הוא הרלוונטי.
    form:attrs(form),
    formFieldCount:form?form.querySelectorAll('input,select,textarea').length:0,
    formFields:form?[...form.querySelectorAll('input,select,textarea')]
      .map(el=>({n:el.name||el.id||'',t:el.type||el.tagName.toLowerCase(),v:String(el.value||'').slice(0,14)}))
      .slice(0,40):[],
    // פונקציות שיגור שהדף חושף — בטפסי IBM Portal השיגור הוא לרוב קריאה מפורשת
    globals:(()=>{const w=fdoc()?.defaultView;if(!w)return[];
      return ['doSubmit','submitForm','Search','doSearch','showTnuot','SubmitForm','goSubmit']
        .filter(k=>{try{return typeof w[k]==='function'}catch(e){return false}})})(),
    // ⚠ שדות **כל** הטפסים: `submitLinkForm('077',…)` משגר את `LinkForm077`,
    // ושם — ולא ב-`#fromDate` — יושבים הערכים שמגיעים לשרת.
    formsInDoc:[...(fdoc()?.querySelectorAll('form')||[])].map(f=>({name:f.getAttribute('name')||'',
      action:String(f.getAttribute('action')||'').slice(0,60),
      fields:[...f.querySelectorAll('input,select')].map(el=>({n:el.name||el.id||'',v:String(el.value||'').slice(0,12)}))
        .filter(x=>x.n).slice(0,24)})).slice(0,8),
    hasJQuery:(()=>{try{const w=fdoc()?.defaultView;return !!(w&&(w.jQuery||w.$))}catch(e){return false}})(),
    submitFns:(()=>{const w=fdoc()?.defaultView;if(!w)return[];
      return ['submitLinkForm','showDateFilterTab','goToBackasha','doSubmit']
        .filter(k=>{try{return typeof w[k]==='function'}catch(e){return false}})})()};
  let submitPath='none';
  const lf=linkForm();
  if(lf&&typeof lf.submit==='function'){
    try{lf.submit();submitPath='form.submit'}
    catch(e){submitPath='form.submit נכשל: '+String(e&&e.message||e).slice(0,60)}
  }
  // ⚠ נפילה ללחיצה רק אם השיגור הישיר לא היה אפשרי — היא המסלול שכבר הוכח
  // כמי שמאפס את השדות, ולכן היא מוצא אחרון ולא ברירת מחדל.
  if(submitPath!=='form.submit'&&show){show.el.click();submitPath+=' → לחיצה'}
  // ⚠ ההמתנה נשענת על **שני** סימנים ולא על אחד: התאריך המוקדם השתנה, **או**
  // מספר השורות השתנה. בבדיקה `earliest()` חזר ריק בסביבה מלאכותית, וקריאה
  // שנשענת רק עליו הייתה מתנוונת להמתנה קבועה בלי להודיע. שינוי שורות הוא
  // סימן עצמאי, והדוח נושא את שניהם כדי שהריצה החיה תכריע מי מהם עבד.
  const deadline=Date.now()+15000;
  while(Date.now()<deadline){
    const e=earliest();
    if(rowsNow()>0&&((e&&e!==before.earliest)||rowsNow()!==before.rows))break;
    await nap(400);
  }
  await nap(800);
  // ⚠ צילום של **כל** שדות התאריך אחרי השיגור — כך הריצה הבאה תאמר מי נשמר
  // ומי נדרס, בלי עוד סבב השערות.
  return{applied:true,tab:tab.t,wrote,rewrites,fromAfterWrite,fromAtClick,submitPath,formAction:String(lf?.getAttribute('action')||'').slice(0,80),formMethod:String(lf?.getAttribute('method')||''),scoped:!!scoped,submitInfo,from:fromStr,till:tillStr,
    fields:[...(fdoc()?.querySelectorAll('input')||[])].map(el=>({id:el.id||'',name:el.name||'',v:String(el.value||'').slice(0,12)}))
      .filter(x=>/date|FROM|TO|from|till/i.test(x.id+' '+x.name)).slice(0,14),
    clicked:show?show.t:'',buttons:cands.map(x=>x.t).filter(Boolean).slice(0,14),
    before,after:{rows:rowsNow(),earliest:earliest(),from:val('fromDate'),till:val('tillDate')}};
}
})();
