// מתאם BTB — הלוואה ללא עו״ש.
// ⚠⚠ 27.08.2026 — ה-DOM לא נמדד בגשש, **אבל התוויות והערכים נמדדו מצילום מסך
// שטל שלח**, וזו ראיה אמיתית. לכן הקריאה כאן היא **לפי תווית ולא לפי סלקטור**:
// מאתרים את הטקסט של התווית, עולים עד שלוש רמות, ולוקחים את הסכום/התאריך
// הראשון שאינו התווית עצמה. אותה טכניקה שעובדת בבינלאומי (`afterLabel`)
// וביהב, והיא עמידה לשינויי מבנה.
// ⚠ מה שנמדד בצילום:
//   פרטי הלוואה | הלוואה #3304 · פעילה
//   יתרת הלוואה 685,056.68 ₪   ·  סכום הלוואה מקורי 1,058,500.00 ₪
//   מועד הקמת ההלוואה 19.09.2023 · מועד סיום ההלוואה 17.09.2053
//   תשלום הבא 3,155.15 ₪ · 17.09.2026 · תשלום קרן וריבית
//   תשלום אחרון שהתקבל 300,000.00 ₪ · 23.08.2026
//   35/360 · תדירות התשלום: חודשי
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
    try{chrome.storage.local.set({bfcacheSeen:{source:'btb',at:new Date().toISOString(),
      url:String(location.href).slice(0,140)}})}catch(err){}}});
}}catch(e){}

if(globalThis.__banksBtbLoaded){try{if(globalThis.__banksBtbLoaded())return}catch(e){}}
const __rt=(()=>{try{return chrome.runtime}catch(e){return null}})();
globalThis.__banksBtbLoaded=()=>{try{return !!(__rt&&__rt.id)}catch(e){return false}};

const T=el=>String(el?.textContent||'').replace(/\s+/g,' ').trim();
const MONEY=/-?[\d,]+\.\d{2}/;
// ⚠⚠⚠ btbProbe הוכיח את השורש. הדף מדביק תווית לערך בלי רווח:
// ₪3,155.1517.09.2026 — ו-\b דורש גבול-מילה. בין הספרה 5 לספרה 1
// **אין גבול**, ולכן התאריך לא נמצא כלל. מועד ההקמה נמצא רק במקרה:
// לפניו יושבת אות עברית (ההלוואה19.09.2023), ואות עברית אינה תו-מילה,
// ולכן שם הגבול קיים. אותה תבנית בדיוק הצליחה בשדה אחד ונכשלה באחר.
// לכן **בלי \b** — צורת התאריך עצמה ייחודית מספיק כדי לעגן את עצמה.
const DATE=/\d{2}[.\/]\d{2}[.\/]\d{4}/;
const money=v=>{const m=String(v||'').match(MONEY);if(!m)return null;
  const n=Number(m[0].replace(/,/g,''));return Number.isFinite(n)?n:null};

// ⚠ „הקטן ביותר שמכיל" — הלקח מבורר דיסקונט: מכל גדול מדי בולע ערכים של שכנים.
function nearLabel(labelRe,valueRe){
  const els=[...document.querySelectorAll('div,span,p,li,td,th,h1,h2,h3,h4,strong,b')];
  const labels=els.filter(el=>labelRe.test(T(el))&&T(el).length<60&&!el.querySelector('div,span,p,li,td'));
  for(const lab of labels){
    let n=lab;
    for(let i=0;i<4&&n;i++,n=n.parentElement){
      const txt=T(n).replace(T(lab),' ');
      const m=txt.match(valueRe);
      if(m)return m[0];
    }
  }
  return '';
}
// ⚠⚠ 27.08.2026 — טל: „אתה לא מציג את תאריך התשלום הקרוב".
// הראיה מהאחסון (לא ניחוש): nextPaymentDate:"" ו-lastPaymentDate:"" — **הסכומים
// נקראו והתאריכים לא.** הטיפוס למעלה מגיע לסכום, שצמוד לתווית, אך לא לתאריך
// שיושב מחוץ ל-4 הרמות.
// **וכשל אחד גרר את כל השאר:** בלי תאריך אין dueMs, בלי dueMs אין lumpPending,
// ולכן היתרה נשארה 685,056.68 והריבית 8% הוצגה לצד יתרה שמכחישה אותה.
// לכן מסלול שני: סריקה **קדימה בטקסט** מן התווית, כפי שהדף נקרא לעין —
// אותה טכניקה שכבר עובדת בבינלאומי. תוספת בלבד: כשהטיפוס מצליח, שום שינוי.
const labelSources=re=>re.source.split('|').map(x=>x.replace(/^\^/,'').replace(/\$$/,''));
function afterLabel(labelRe,valueRe,span){
  const body=T(document.body);
  for(const src of labelSources(labelRe)){
    const finder=new RegExp(src,'g');let m;
    while((m=finder.exec(body))){
      const seg=body.slice(m.index+m[0].length,m.index+m[0].length+(span||140));
      const v=seg.match(valueRe);
      if(v)return v[0];
    }
  }
  return '';
}
const near=(labelRe,valueRe,span)=>nearLabel(labelRe,valueRe)||afterLabel(labelRe,valueRe,span);
// ⚠⚠ 27.08.2026 (סבב 2) — הסריקה קדימה עדיין לא מצאה את תאריך התשלום.
// מתוך `btbProbe` האמיתי: הדף כותב תווית וערך **בלי רווח** —
// „יתרת הלוואה*₪685,056.68סכום הלוואה מקורי₪1,058,500.00" — ולכן אי אפשר
// להניח מרווח, סדר או תבנית. שלוש הרחבות, כל אחת מהן ראיה-מונעת:
//   1. שנה דו-ספרתית מותרת (הבינלאומי כבר מציג „20/09/26").
//   2. סורקים גם **לפני** התווית, לא רק אחריה — הסדר בדף אינו מובטח.
//   3. שם התווית אינו ידוע בוודאות; מנסים כמה ניסוחים.
const DATE_ANY=/\d{1,2}[.\/]\d{1,2}[.\/](?:\d{4}|\d{2})/;
function beforeLabel(labelRe,valueRe,span){
  const body=T(document.body);
  for(const src of labelSources(labelRe)){
    const finder=new RegExp(src,'g');let m,last='';
    while((m=finder.exec(body))){
      const seg=body.slice(Math.max(0,m.index-(span||140)),m.index);
      const all=seg.match(new RegExp(valueRe.source,'g'));
      if(all&&all.length)last=all[all.length-1];   // הקרוב ביותר לתווית
    }
    if(last)return last;
  }
  return '';
}
// ⚠ מחמיר קודם — הוא זה שכבר עובד להקמה/סיום ואסור להרחיב אותו מתחת לרגליים.
const dateNear=labelRe=>near(labelRe,DATE)||beforeLabel(labelRe,DATE)
  ||near(labelRe,DATE_ANY)||beforeLabel(labelRe,DATE_ANY);
function readLoan(){
  const body=T(document.body);
  const num=(body.match(/הלווא[הת]\s*#\s*(\d+)/)||[])[1]||'';
  const balance=money(near(/^יתרת ההלוואה\*?$|^יתרת הלוואה\*?$/,MONEY));
  const original=money(near(/^סכום ההלוואה מקורי$|^סכום הלוואה מקורי$/,MONEY));
  const start=near(/^מועד הקמת ההלוואה$/,DATE);
  const end=near(/^מועד סיום ההלוואה$/,DATE);
  const nextAmount=money(near(/^תשלום הבא$/,MONEY));
  const nextDate=dateNear(/^תשלום הבא$|^מועד התשלום הבא$|^תאריך התשלום הבא$|^תשלום הבא\*?$/);
  // ⚠⚠ 27.08.2026 — טל: „אין איזה תשלום שאתה מתעלם ממנו?" **כן, והוא מכריע:**
  // „תשלום אחרון שהתקבל 300,000.00₪ · 23.08.2026" — פירעון חלקי חד-פעמי.
  // בלעדיו המספרים אינם מסתדרים: 3,155.15 על 1,058,500 ל-360 חודשים משתמע
  // כ-0.475% שנתי (לא קיים), ועל היתרה 685,057 ל-325 חודשים משתמע 3.2% — הגיוני.
  // כלומר **התשלום החודשי הופחת אחרי הפירעון**, וקריאת „תשלום הבא" לבדה
  // מתארת הלוואה אחרת מזו שהייתה. הסכום הזה נקרא ונשמר.
  const lastAmount=money(near(/^תשלום אחרון שהתקבל$/,MONEY));
  const lastDate=dateNear(/^תשלום אחרון שהתקבל$|^מועד התשלום האחרון$|^תשלום אחרון$/);
  // ⚠ אותה מחלת הדבקה: התאריך שלפניו נדבק למונה — „...2026"+„35/360"
  // נקרא „202635/360". מונה גדול מהמכנה הוא בלתי אפשרי, ולכן מקלפים
  // ספרה משמאל עד שהיחס חוזר להיות אפשרי, במקום לקבל מספר מופרך.
  const paid=(()=>{const m=body.match(/(\d{1,6})\s*\/\s*(\d{2,4})/);if(!m)return[];
    let a=m[1];const b=Number(m[2]);while(a.length>1&&Number(a)>b)a=a.slice(1);
    return Number(a)<=b?[m[0],a,String(b)]:[m[0],"",String(b)]})();
  const freq=/תדירות התשלום[^א-ת]*([א-ת]+)/.exec(body);
  const active=/פעילה/.test(body);
  return{number:num,balance,originalPrincipal:original,startDate:start,endDate:end,
    nextPayment:nextAmount,nextPaymentDate:nextDate,
    lastPayment:lastAmount,lastPaymentDate:lastDate,
    paidInstallments:paid[1]?Number(paid[1]):null,totalInstallments:paid[2]?Number(paid[2]):null,
    frequency:freq?freq[1]:'',active,
    // ⚠ דוח: אם משהו לא נקרא, הריצה הבאה תאמר מה היה בדף ולא נצטרך סבב ניחוש.
    __diag:{url:String(location.href).slice(0,140),bodyLen:body.length,head:body.slice(0,300),
      // ⚠ הגוף המלא נשמר מקומית בלבד, כדי שסבב אבחון אחד יספיק במקום שלושה.
      body:body.slice(0,8000)}};
}
chrome.runtime.onMessage.addListener((m,_s,reply)=>{
  if(m?.type==='BTB_PING'){reply({ok:true});return}
  if(m?.type==='BTB_READ'){try{reply({ok:true,data:readLoan()})}catch(e){reply({ok:false,error:e.message})}return}
});
})();
