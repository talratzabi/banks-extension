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
if(globalThis.__banksBtbLoaded){try{if(globalThis.__banksBtbLoaded())return}catch(e){}}
const __rt=(()=>{try{return chrome.runtime}catch(e){return null}})();
globalThis.__banksBtbLoaded=()=>{try{return !!(__rt&&__rt.id)}catch(e){return false}};

const T=el=>String(el?.textContent||'').replace(/\s+/g,' ').trim();
const MONEY=/-?[\d,]+\.\d{2}/;
const DATE=/\b\d{2}[.\/]\d{2}[.\/]\d{4}\b/;
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
function readLoan(){
  const body=T(document.body);
  const num=(body.match(/הלווא[הת]\s*#\s*(\d+)/)||[])[1]||'';
  const balance=money(nearLabel(/^יתרת ההלוואה\*?$|^יתרת הלוואה\*?$/,MONEY));
  const original=money(nearLabel(/^סכום ההלוואה מקורי$|^סכום הלוואה מקורי$/,MONEY));
  const start=nearLabel(/^מועד הקמת ההלוואה$/,DATE);
  const end=nearLabel(/^מועד סיום ההלוואה$/,DATE);
  const nextAmount=money(nearLabel(/^תשלום הבא$/,MONEY));
  const nextDate=nearLabel(/^תשלום הבא$/,DATE);
  const paid=(body.match(/(\d{1,3})\s*\/\s*(\d{2,4})/)||[]);
  const freq=/תדירות התשלום[^א-ת]*([א-ת]+)/.exec(body);
  const active=/פעילה/.test(body);
  return{number:num,balance,originalPrincipal:original,startDate:start,endDate:end,
    nextPayment:nextAmount,nextPaymentDate:nextDate,
    paidInstallments:paid[1]?Number(paid[1]):null,totalInstallments:paid[2]?Number(paid[2]):null,
    frequency:freq?freq[1]:'',active,
    // ⚠ דוח: אם משהו לא נקרא, הריצה הבאה תאמר מה היה בדף ולא נצטרך סבב ניחוש.
    __diag:{url:String(location.href).slice(0,140),bodyLen:body.length,head:body.slice(0,300)}};
}
chrome.runtime.onMessage.addListener((m,_s,reply)=>{
  if(m?.type==='BTB_PING'){reply({ok:true});return}
  if(m?.type==='BTB_READ'){try{reply({ok:true,data:readLoan()})}catch(e){reply({ok:false,error:e.message})}return}
});
})();
