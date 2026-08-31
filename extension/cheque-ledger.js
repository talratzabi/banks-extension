// ייצוא הנהלת החשבונות כאוצר מילים סגור לסריקת השיקים.
//
// ⚠⚠ למה זה קיים (31.08.2026): המודל המובנה נמדד וטעה בשלושה מקרים -
// "מופז גל" במקום ועד מקומי יד נתן, "יצחק שומר" במקום פרידמן מאיר,
// "יפרה אלישע" במקום יפרח מזל. **אבל הספרות שעל הצילום תאמו את הייצוא
// במדויק בכל המקרים.** כלומר הבעיה אינה בתמונה - היא בכך שהקורא ניחש
// מתוך אינסוף אפשרויות.
//
// **הרעיון: לצמצם את מרחב האפשרויות.** בייצוא יש 141 המחאות, 32 חשבונות
// ו-33 שמות, ו-**141 מתוך 141 מספרי השיק ייחודיים**. כשהקריאה חייבת
// לבחור מתוך רשימה סגורה במקום להמציא - טעות של ספרה אחת כבר לא הורסת.
// זה בדיוק מה ש-OCR מקצועי עושה מול לקסיקון.

// --- ייבוא -------------------------------------------------------------
// תומך ב-JSON (המבנה שהופק מה-PDF) וב-CSV שתוכנות הנהלת חשבונות מייצאות.
function ledgerParse(text){
  const raw=String(text||'').trim();
  if(!raw)return[];
  if(raw[0]==='{'||raw[0]==='['){
    const j=JSON.parse(raw);
    return ledgerNormalize(Array.isArray(j)?j:(j.rows||[]));
  }
  const lines=raw.split(/\r?\n/).filter(l=>l.trim());
  if(!lines.length)return[];
  const sep=(lines[0].match(/\t/g)||[]).length>(lines[0].match(/,/g)||[]).length?'\t':',';
  const head=ledgerSplit(lines[0],sep);
  const idx=names=>head.findIndex(h=>names.some(n=>h.includes(n)));
  const col={date:idx(['תאריך','date']),name:idx(['שם','לקוח','מוסר','name']),
    amount:idx(['סכום','amount']),cheque:idx(['שיק','המחאה','אסמכתא','cheque']),
    bank:idx(['בנק','bank']),branch:idx(['סניף','branch']),account:idx(['חשבון','account'])};
  const out=[];
  for(const line of lines.slice(1)){
    const c=ledgerSplit(line,sep);
    out.push({date:c[col.date]||'',name:c[col.name]||'',amount:c[col.amount]||'',
      cheque:c[col.cheque]||'',bank:c[col.bank]||'',branch:c[col.branch]||'',account:c[col.account]||''});
  }
  return ledgerNormalize(out);
}
// ⚠ פיצול שמכבד מרכאות: תוכנות הנהלת חשבונות מייצאות סכומים כ-"4,720.00",
// ופיצול נאיבי על פסיק הזיז את **כל** העמודות והפך 4,720 ל-4.
function ledgerSplit(line,sep){
  const out=[];let cur='',q=false;
  for(let i=0;i<line.length;i++){
    const ch=line[i];
    if(ch==='"'){if(q&&line[i+1]==='"'){cur+='"';i++}else q=!q;continue}
    if(ch===sep&&!q){out.push(cur.trim());cur='';continue}
    cur+=ch;
  }
  out.push(cur.trim());
  return out.map(v=>v.replace(/^'|'$/g,'').trim());
}
const ledgerDigits=v=>String(v==null?'':v).replace(/\D/g,'');
function ledgerNormalize(rows){
  const out=[];
  for(const r of rows||[]){
    const amount=Number(String(r.amount==null?'':r.amount).replace(/[^\d.-]/g,''));
    const name=String(r.name||'').replace(/\s+/g,' ').trim();
    if(!name||!Number.isFinite(amount)||!amount)continue;
    out.push({date:String(r.date||'').trim(),due:String(r.due||'').trim(),name,amount,
      cheque:ledgerDigits(r.cheque),bank:ledgerDigits(r.bank),branch:ledgerDigits(r.branch),
      account:ledgerDigits(r.account)});
  }
  return out;
}
const ledgerKey=r=>r&&r.bank&&r.account?`${r.bank}-${r.branch}-${r.account}`:'';

// --- התאמה -------------------------------------------------------------
// ⚠ הסכום הוא העוגן: הוא מגיע **מהבנק**, לא מקריאת תמונה, ולכן הוא הדבר
// היחיד כאן שאינו יכול להיות שגוי. התאריך מסייע, והספרות מהצילום מכריעות
// בין מועמדים שנשארו - גם כשהן רועשות.
function ledgerSameAmount(a,b){return Math.abs(Number(a)-Number(b))<0.005}
function ledgerDateMs(v){const m=String(v||'').match(/(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{2,4})/);
  if(!m)return NaN;let y=Number(m[3]);if(y<100)y+=2000;
  return Date.UTC(y,Number(m[2])-1,Number(m[1]))}
// כמה ספרות של b מופיעות ברצף בתוך a. משמש לניקוד רך של קריאה רועשת.
function ledgerDigitScore(readDigits,target){
  const a=ledgerDigits(readDigits),b=ledgerDigits(target);
  if(!a||!b)return 0;
  if(a.includes(b))return b.length;          // התאמה מלאה - החזק ביותר
  let best=0;
  for(let len=b.length-1;len>=3;len--)
    for(let i=0;i+len<=b.length;i++)
      if(a.includes(b.slice(i,i+len))){best=len;len=0;break}
  return best;
}
// ⚠ טווח הימים: השיק נכתב בתאריך אחד ומופקד באחר. בדוגמאות של טל ההפרש
// היה 0-2 ימים, אבל שיק דחוי מרחיק הרבה יותר - ולכן זה מרכך ולא פוסל.
const LEDGER_DAYS=45;
function ledgerPick(rows,{amount,date,micr,nameGuess}={}){
  const all=rows||[];
  let cands=all.filter(r=>ledgerSameAmount(r.amount,amount));
  if(!cands.length)return{row:null,confidence:'none',reason:'אין בייצוא שורה בסכום הזה',candidates:0};
  const t=ledgerDateMs(date);
  const scored=cands.map(r=>{
    let s=0;const why=[];
    const dd=Number.isFinite(t)?Math.abs(ledgerDateMs(r.date)-t)/864e5:NaN;
    if(Number.isFinite(dd)){
      if(dd===0){s+=6;why.push('תאריך זהה')}
      else if(dd<=LEDGER_DAYS){s+=Math.max(0,4-dd/15);why.push(`הפרש ${Math.round(dd)} ימים`)}
      else s-=3;
    }
    // ⚠ מספר השיק הוא המפתח החזק ביותר: 141 מתוך 141 ייחודיים בייצוא.
    const cs=ledgerDigitScore(micr,r.cheque);
    if(cs){s+=cs>=r.cheque.length?5:2;why.push(`מס' שיק ${r.cheque}`)}
    const as=ledgerDigitScore(micr,r.account);
    if(as){s+=as>=r.account.length?4:1.5;why.push(`חשבון ${r.account}`)}
    if(nameGuess&&r.name&&ledgerNameClose(nameGuess,r.name)){s+=2;why.push('שם דומה')}
    return{row:r,s,why};
  }).sort((x,y)=>y.s-x.s);
  const top=scored[0],second=scored[1];
  // ⚠ ההבדל בין הראשון לשני הוא מה שקובע ודאות, לא הציון המוחלט.
  const gap=second?top.s-second.s:99;
  const confidence=cands.length===1?'single':gap>=3?'high':gap>=1?'medium':'low';
  return{row:top.row,confidence,gap:Math.round(gap*10)/10,reason:top.why.join(' · '),
    candidates:cands.length,alternatives:scored.slice(1,4).map(x=>x.row)};
}
// השוואת שמות רכה: "יפרה אלישע" מול "יפרח מזל" חולקות מילה כמעט זהה.
function ledgerNameClose(a,b){
  const norm=v=>String(v||'').replace(/["'׳״\-]/g,'').replace(/\s+/g,' ').trim();
  const x=norm(a),y=norm(b);
  if(!x||!y)return false;
  if(x===y||x.includes(y)||y.includes(x))return true;
  const wx=x.split(' '),wy=y.split(' ');
  return wx.some(p=>p.length>=3&&wy.some(q=>q.length>=3&&(p===q||ledgerEdit1(p,q))));
}
function ledgerEdit1(a,b){
  if(Math.abs(a.length-b.length)>1)return false;
  let i=0,j=0,diff=0;
  while(i<a.length&&j<b.length){
    if(a[i]===b[j]){i++;j++;continue}
    if(++diff>1)return false;
    if(a.length>b.length)i++;else if(b.length>a.length)j++;else{i++;j++}
  }
  return diff+(a.length-i)+(b.length-j)<=1;
}
