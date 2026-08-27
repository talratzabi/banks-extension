// גשש מדידה גנרי. אינו מפרסר ואינו מניח דבר על מבנה האתר — הוא רק מצלם אותו,
// כדי שהמתאם ייכתב מתוך מדידה ולא מתוך ניחוש. אין בו לחיצות ואין בו שינוי מצב.
(()=>{
// ⚠ שומר הזרקה — פריט שהיה פתוח מאז 18.08. הגשש מוזרק עכשיו גם בתוך סנכרון
// ולא רק מכפתור המדידה, ובלי השומר כל הזרקה היתה מוסיפה מאזין נוסף,
// ושני מאזינים עונים לאותה הודעה.
if(window.__bankProbeLoaded)return;
window.__bankProbeLoaded=true;
const flat=s=>String(s||'').replace(/\s+/g,' ').trim();
const own=el=>flat(el?.innerText);
const DATE=/^\d{1,2}[.\/]\d{1,2}[.\/]\d{2,4}$/;
const MONEY=/-?[\d,]+\.\d{2}/;
// תבניות מספרי חשבון שונות בין הבנקים: 921-348300, 065-123456, 12-345-678901
const ACCT=/\b\d{2,3}\s*-\s*\d{3,}(?:\s*-\s*\d{3,})?(?:\s*\/\s*\d+)?\b/;
const chain=el=>{const p=[];let n=el;for(let i=0;i<5&&n&&n.tagName!=='BODY';i++){const r=n.getAttribute?.('role'),c=typeof n.className==='string'&&n.className.trim()?'.'+n.className.trim().split(/\s+/).slice(0,2).join('.'):'';p.push(n.tagName.toLowerCase()+(r?`[role=${r}]`:'')+c);n=n.parentElement}return p.join(' < ')};

function roleCounts(){const out={};for(const r of['table','grid','treegrid','row','rowgroup','cell','gridcell','columnheader','option','listbox','menu','menuitem','dialog','tab','tablist','combobox'])
{const n=document.querySelectorAll(`[role="${r}"]`).length;if(n)out[r]=n}return out}

function gridShape(){
  // גם רשת ARIA וגם <table> אמיתי — לא מניחים מי מהם
  const aria=[...document.querySelectorAll('[role="row"]')].map(r=>({el:r,cells:[...r.querySelectorAll('[role="cell"],[role="gridcell"]')].map(own)}));
  const html=[...document.querySelectorAll('table tr')].map(r=>({el:r,cells:[...r.children].filter(c=>c.tagName==='TD').map(own)}));
  const rows=aria.filter(r=>r.cells.length).length>=html.length?aria:html;
  const dated=rows.filter(r=>r.cells.some(v=>DATE.test(v)));
  return{kind:rows===aria?'aria':'html',totalRows:rows.length,datedRows:dated.length,
    headers:[...document.querySelectorAll('[role="columnheader"],table th')].map(own).filter(Boolean).slice(0,20),
    sample:dated.slice(0,4).map(r=>r.cells.map((v,i)=>i+'|'+v.slice(0,50))),
    path:dated[0]?chain(dated[0].el):''};
}

// ⚠ נוסף 18.08.2026 — כדי לממש „תחילת איסוף נתונים" צריך לבקש מהאתר טווח תאריכים,
// ואת בורר התאריכים אין לנחש. pickers() מסנן לפי „חשבון" ולכן פספס אותו לגמרי.
// כאן מצולם כל שדה, בורר, כפתור ותווית שנראים כמו בקרת תקופה. קריאה בלבד.
const RANGE=/תארי|טווח|תקופה|מתאריך|עד תאריך|חודש|לתקופה|\b(?:from|to|date|period|range)\b/i;
// fromDate / dateFrom הם השמות הנפוצים, ולכן מפרידים camelCase לפני ההתאמה.
const deCamel=v=>String(v||'').replace(/([a-z])([A-Z])/g,'$1 $2');
function dateControls(){
  const inputs=[...document.querySelectorAll('input')].map(el=>({
    type:el.type||'',id:el.id||'',name:el.name||'',placeholder:el.placeholder||'',
    aria:flat(el.getAttribute('aria-label')),value:String(el.value||'').slice(0,20),
    // ⚠ 27.08.2026 — ה-class לא נכלל בהתאמה, והסלקטור המוכר של יהב הוא
    // בדיוק class: `input.date-picker-input`. גשש שאינו רואה class היה
    // מחזיר „אין שדות תאריך" על דף שיש בו אחד, ומחזיר אותנו לניחוש.
    cls:flat(typeof el.className==='string'?el.className:'').slice(0,60),
    readOnly:!!el.readOnly,path:chain(el)}))
    .filter(x=>x.type==='date'||RANGE.test(deCamel(`${x.id} ${x.name} ${x.placeholder} ${x.aria} ${x.value} ${x.cls}`)))
    .slice(0,20);
  const selects=[...document.querySelectorAll('select')].map(el=>({
    id:el.id||'',name:el.name||'',aria:flat(el.getAttribute('aria-label')),
    options:[...el.options].slice(0,14).map(op=>flat(op.textContent)),path:chain(el)})).slice(0,20);
  const triggers=[...document.querySelectorAll('button,[role="button"],[role="tab"],[role="combobox"],a')]
    .map(el=>({tag:el.tagName.toLowerCase(),txt:own(el).slice(0,40),
      aria:flat(el.getAttribute('aria-label')),expanded:el.getAttribute('aria-expanded'),path:chain(el)}))
    .filter(x=>RANGE.test(deCamel(`${x.txt} ${x.aria}`))).slice(0,25);
  const labels=[...document.querySelectorAll('label,legend,[role="heading"]')]
    .map(el=>own(el).slice(0,50)).filter(t=>RANGE.test(t)).slice(0,25);
  return{inputs,selects,triggers,labels};
}

function pickers(){
  return[...document.querySelectorAll('button,[role="button"],[role="combobox"],select,a')]
    .map(el=>({tag:el.tagName.toLowerCase(),role:el.getAttribute('role')||'',txt:own(el).slice(0,80),
      expanded:el.getAttribute('aria-expanded'),haspopup:el.getAttribute('aria-haspopup'),
      hasAccount:ACCT.test(own(el)),cls:flat(typeof el.className==='string'?el.className:'').slice(0,60)}))
    .filter(o=>o.hasAccount||o.expanded!==null||o.haspopup||/חשבון|חשבונות|בחיר/.test(o.txt))
    .slice(0,20);
}

function accountLike(){
  const best=new Map();
  for(const el of document.querySelectorAll('div,span,li,td,tr,button,a,option')){
    const t=own(el);if(!t||t.length>160)continue;
    const m=t.match(ACCT);if(!m)continue;
    const key=m[0].replace(/\s/g,'');
    const prev=best.get(key);
    if(!prev||own(prev).length>t.length)best.set(key,el);
  }
  return[...best.entries()].slice(0,15).map(([key,el])=>({account:key,txt:own(el).slice(0,90),hasMoney:MONEY.test(own(el)),path:chain(el)}));
}

function snapshot(){
  try{
    return{url:location.href,host:location.hostname,title:document.title.slice(0,90),
      bodyLen:(document.body.innerText||'').length,
      roleCounts:roleCounts(),tables:document.querySelectorAll('table').length,
      grid:gridShape(),pickers:pickers(),dateControls:dateControls(),accounts:accountLike(),
      frames:[...document.querySelectorAll('iframe')].map(f=>{let d=null;try{d=f.contentDocument}catch{}
        return{id:f.id||'',src:String(f.src||'').slice(0,120),sameOrigin:!!d,innerRows:d?d.querySelectorAll('tr,[role="row"]').length:-1}}),
      nav:[...document.querySelectorAll('a,[role="menuitem"],[role="tab"],nav button')].map(own).filter(t=>t&&t.length<40).slice(0,40),
      head:flat(document.body.innerText).slice(0,700)};
  }catch(e){return{probeError:e.message,url:location.href}}
}
chrome.runtime.onMessage.addListener((m,_s,reply)=>{if(m?.type==='BANK_PROBE'){reply({ok:true,probe:snapshot()});return}});
})();
