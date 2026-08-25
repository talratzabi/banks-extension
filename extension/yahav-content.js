(()=>{
  // ⚠⚠ 25.08.2026 — **היה כאן דגל בוליאני, והוא מסוכן.** נמדד היום
  // בדיסקונט: כשמרעננים את התוסף ה-content script הישן מת, אבל
  // ה-`window`/`globalThis` של העולם המבודד **שורד עם הדגל דלוק** —
  // וההזרקה החדשה יוצאת מיד **בלי לרשום מאזין כלל**. התוצאה שנרשמה
  // שם: „זיהוי הישויות לא השיב תוך 60 שניות", וזה עלה כמה סבבים.
  // ⚠ **יהב היה הקובץ האחרון שנשאר עם התבנית הזו** (נבדק: שמונת
  // האחרים כבר עברו ב-1.9.6). הוא לא הופיע ברשימה שתיקנתי אז כי
  // הוא רושם מאזין אחד גם בלי שומר — ולכן הבדיקה לא סימנה אותו.
  // **בדיקת חיות:** ההפניה ל-`chrome.runtime` נתפסת **בסגור** בזמן
  // הטעינה; כשההקשר מת הגישה זורקת, הבדיקה מחזירה false, והסקריפט
  // החדש נרשם. שני המצבים נפתרים יחד.
  if(globalThis.__banksYahavLoaded){try{if(globalThis.__banksYahavLoaded())return}catch(e){}}
  const __rtYahav=(()=>{try{return chrome.runtime}catch(e){return null}})();
  globalThis.__banksYahavLoaded=()=>{try{return !!(__rtYahav&&__rtYahav.id)}catch(e){return false}};
  const clean=v=>String(v??'').replace(/[\u200e\u200f\u202a-\u202e]/g,'').replace(/\s+/g,' ').trim();
  const num=v=>{const m=clean(v).replace(/[−–]/g,'-').match(/-?[\d,]+(?:\.\d{1,2})?/);if(!m)return null;const n=Number(m[0].replace(/,/g,''));return Number.isFinite(n)?n:null};
  const body=()=>clean(document.body?.innerText||'');
  const account=()=>{const m=body().match(/(?:החשבונות שלי\s*)?(\d{2,4})\s*[-–]\s*(\d{3,12})/);return m?{branch:m[1],accountNumber:m[2]}:null};
  const owner=()=>{const m=body().match(/שלום,\s*([^\n]{1,40})/);return clean(m?.[1]||'').split(' ')[0]||''};
  const transactions=()=>{const out=[];for(const row of document.querySelectorAll('[role="row"]')){const cells=[...row.querySelectorAll('[role="gridcell"]')].map(x=>clean(x.innerText));if(cells.length<5||!/^\d{2}\/\d{2}\/\d{4}$/.test(cells[0]))continue;const hasReference=cells.length>=6;out.push({date:cells[0],action:cells[hasReference?2:1],details:hasReference?cells[1]:'',debit:num(cells[hasReference?3:2]),credit:num(cells[hasReference?4:3]),balance:num(cells[hasReference?5:4])})}return out};
  const loans=()=>{const out=[];for(const row of document.querySelectorAll('[role="row"]')){const c=[...row.querySelectorAll('[role="gridcell"]')].map(x=>clean(x.innerText));if(c.length<6||!c[0]||num(c[2])==null)continue;out.push({type:c[0],interest:c[1]?`${c[1]}%`:'',balance:num(c[2]),originalPrincipal:num(c[3]),nextPaymentDate:c[4],nextPayment:num(c[5])})}return out};
  const field=(label,nextLabels)=>{const t=body(),i=t.indexOf(label);if(i<0)return'';let s=t.slice(i+label.length);for(const n of nextLabels){const p=s.indexOf(n);if(p>=0)s=s.slice(0,p)}return clean(s)};
  const detail=()=>{const t=body(),match=re=>(t.match(re)||[])[1]||'';return{type:match(/סוג הלוואה\s+(.+?)\s+קרן הלוואה מקורית/),originalPrincipal:num(match(/קרן הלוואה מקורית\s+([\d,.]+)/)),endDate:match(/תאריך סיום ההלוואה\s+(\d{2}\/\d{2}\/\d{4})/),nextPaymentDate:match(/תאריך התשלום הבא\s+(\d{2}\/\d{2}\/\d{4})/),startDate:match(/תאריך תחילת ההלוואה\s+(\d{2}\/\d{2}\/\d{4})/),balance:num(match(/יתרה משוערת\s+([\d,.]+)/)),nextPayment:num(match(/סכום התשלום הבא\s+([\d,.]+)/)),interest:match(/ריבית נוכחית \(%\)\s+([\d.]+)/)}};
  const summary=()=>{let balance=null,creditLimit=null,loanBalance=null;for(const row of document.querySelectorAll('table [role="row"],table tr')){const c=[...row.querySelectorAll('[role="gridcell"],td')].map(x=>clean(x.innerText));if(c[0]==='חשבון עו״ש'&&balance==null)balance=num(c[1]);if(c[0]==='הלוואות'&&loanBalance==null)loanBalance=num(c[1])}const m=body().match(/מסגרת אשראי\s+([\d,.]+)/);if(m)creditLimit=num(m[1]);return{balance,creditLimit,loanBalance}};
  const setRangeFrom=async()=>{
  // ⚠⚠ 25.08.2026 — טל: „יש רק תנועות שלושה חודשים, אין התייחסות
  // לבורר [התאריך]." צודק, ונמדד: הפונקציה לחצה „חודש קודם" **שלוש
  // פעמים בדיוק**, ו-`collectSince` הופיע **אפס פעמים** בשני קבצי יהב.
  // כלומר יהב התעלם לגמרי מהגדרת „תחילת איסוף נתונים" הגלובלית,
  // בעוד לאומי ודיסקונט מכבדים אותה.
  // ⚠ הבחירה נשארת **קליקים על הבורר** ולא הזנת טקסט: זה מה שנמדד
  // כעובד באתר הזה, ואין סיבה להחליף מנגנון שעובד.
  const st=await chrome.storage.local.get({collectSince:''});
  const want=new Date(String(st.collectSince||''));
  const now=new Date();
  const valid=!isNaN(want.getTime());
  // כמה חודשים אחורה צריך ללחוץ. ⚠ תקרה של 36 — שומר לולאה, ובלעדיו
  // תאריך שגוי בהגדרות היה מייצר מאות לחיצות על הבורר.
  let back=valid?((now.getFullYear()-want.getFullYear())*12+(now.getMonth()-want.getMonth())):3;
  if(!Number.isFinite(back)||back<0)back=0;
  // ⚠ נמדד 25.08.2026 (טל): **ביהב יש נתונים רק כחצי שנה אחורה.**
  // התקרה נשארת 36 ולא 6 במכוון — הגבול האמיתי הוא של האתר, והוא
  // עוצר את הבורר מעצמו. קיבוע 6 כאן היה הופך הנחה לקוד, ואם יהב
  // ירחיב את הטווח נפסיד אותו בלי לדעת. **הבורר הוא מקור האמת.**
  if(back>36)back=36;
  const wantDay=valid?want.getDate():now.getDate();
  const report=async(ok,why,extra)=>{try{await chrome.storage.local.set({yahavRangeApplied:
    {ok,why,at:new Date().toISOString(),from:String(st.collectSince||''),monthsBack:back,day:wantDay,...extra}})}catch(e){}};
  const input=[...document.querySelectorAll('input.date-picker-input,input[placeholder="dd/MM/y"]')][0];
  if(!input){await report(false,'שדה התאריך לא נמצא');return false}
  const box=input.closest('.date-picker-box')||input.parentElement?.parentElement;
  const group=input.closest('[role="group"],.input-group')||input.parentElement;
  const open=group?.querySelector('a.datepicker-button,[role="button"]');
  if(!open||!box){await report(false,'כפתור הבורר לא נמצא');return false}
  open.click();
  await new Promise(r=>setTimeout(r,220));
  const dialog=box.querySelector('[role="dialog"]');
  if(!dialog){await report(false,'הבורר לא נפתח');return false}
  for(let i=0;i<back;i++){
    const prev=dialog.querySelector('.datepicker-month-prev:not(.disabled)');
    // ⚠ אם הבורר נעצר מוקדם — לא נכשלים. בוחרים את הישן ביותר שאפשר
    // ומדווחים כמה חודשים באמת הושגו; חודשיים אחורה עדיף מכלום.
    if(!prev){await report(true,'הבורר נעצר מוקדם',{reached:i});break}
    prev.click();
    await new Promise(r=>setTimeout(r,260));
  }
  const cells=[...dialog.querySelectorAll('[role="gridcell"].selectable')]
    .filter(c=>c.getAttribute('aria-disabled')!=='true');
  // ⚠ היום המבוקש אינו קיים בהכרח (31 בפברואר). לוקחים את הקרוב ביותר
  // שאינו מאוחר ממנו, ואם אין — את הראשון שיש.
  let target=cells.find(c=>c.dataset.value===String(wantDay));
  if(!target){
    const nums=cells.map(c=>({c,v:Number(c.dataset.value)})).filter(x=>Number.isFinite(x.v));
    const earlier=nums.filter(x=>x.v<=wantDay).sort((a,b)=>b.v-a.v)[0];
    target=(earlier||nums[0])?.c;
  }
  if(!target){await report(false,'לא נמצא יום לבחירה');return false}
  target.click();
  await new Promise(r=>setTimeout(r,700));
  await report(true,'הוחל',{chose:target.dataset.value,value:input.value||''});
  return true};
  chrome.runtime.onMessage.addListener((m,s,r)=>{if(m?.type==='YAHAV_READ'){r({ok:true,account:account(),owner:owner(),transactions:transactions(),loans:loans(),detail:detail(),summary:summary(),text:body()});return}if(m?.type==='YAHAV_SET_3_MONTHS'){setRangeFrom().then(ok=>r({ok}));return true}if(m?.type==='PING')r({ok:true})});
  chrome.runtime.sendMessage({type:'YAHAV_AUTHENTICATED'}).catch(()=>{});
})();
