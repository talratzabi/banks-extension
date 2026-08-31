// חילוץ שם מוסר השיק מתוך הסריקה השמורה.
//
// למה כאן ולא בשום קובץ קיים (§4): זו יכולת חדשה עם תלות חיצונית אחת
// (המודל המובנה של Chrome), והיא לא צריכה לנפח את dashboard.js.
//
// ⚠⚠ מה נמדד לפני הכתיבה, ב-Chrome 148.0.7778.280 של טל:
//   TextDetector (Shape Detection) - **לא קיים**.
//   LanguageModel (Gemini Nano מובנה) - קיים, availability עם קלט תמונה
//   החזיר "downloadable": המודל עובד, אבל דורש הורדה חד-פעמית.
// ⚠ ההורדה **אינה מופעלת מעצמה** בשום מקום - רק מלחיצה מפורשת של טל,
// כי היא צורכת ג'יגה-בייטים מהמחשב שלו.
// ⚠ לפי התיעוד של Chrome, ההרשאה aiLanguageModelOriginTrial **פגה** ואין
// להוסיף אותה ל-manifest. אין הרשאה נדרשת.

// השם מודפס בפינה הימנית-העליונה של השיק. הגזרה נדיבה בכוונה: סריקות
// אינן מיושרות, וחיתוך צר מדי מוריד את השם ומחזיר "לא זוהה" שנראה כמו
// "לבנק אין את המידע". פי 2 הגדלה - טקסט קטן בסריקה מטושטשת.
const CHQ_CROP={right:0.55,top:0.34,scale:2};

function chequeCropTopRight(src,box=CHQ_CROP){
  return new Promise((resolve,reject)=>{
    const img=new Image();
    img.onload=()=>{
      const w=Math.round(img.naturalWidth*box.right),h=Math.round(img.naturalHeight*box.top);
      const x=img.naturalWidth-w; // ימין, לא שמאל - השיק בעברית אבל התמונה לא מתהפכת
      const c=document.createElement('canvas');
      c.width=Math.round(w*box.scale);c.height=Math.round(h*box.scale);
      const g=c.getContext('2d');
      g.imageSmoothingQuality='high';
      g.drawImage(img,x,0,w,h,0,0,c.width,c.height);
      c.toBlob(b=>b?resolve(b):reject(Error('החיתוך לא הופק')),'image/png');
    };
    img.onerror=()=>reject(Error('הצילום לא נטען'));
    img.src=src;
  });
}

const CHQ_SYSTEM='אתה קורא שיקים ישראליים סרוקים. אתה מחזיר טקסט קצר בלבד, בלי הסברים.';
const CHQ_ASK=[
  'בתמונה מופיע החלק הימני-העליון של שיק ישראלי, שבו מודפסים פרטי בעל החשבון.',
  'החזר **אך ורק את השם** של בעל החשבון (מוסר השיק), בדיוק כפי שהוא מודפס.',
  'אל תחזיר כתובת, ת.ד, מיקוד, טלפון, ח.פ, מספר עוסק מורשה, מספר חשבון או סניף.',
  'אל תוסיף שום מילה משלך, בלי מרכאות ובלי ניקוד.',
  'אם אין שם קריא בתמונה, החזר בדיוק: לא זוהה'
].join(' ');

// שורות שהן רק ספרות/סימנים, או שנפתחות בתווית של פרט שאינו שם, נזרקות.
// זו רשת ביטחון על תשובת המודל, לא תחליף להנחיה.
const CHQ_DROP=/^(ת\.?ד|טל|טלפון|פקס|מיקוד|ח\.?פ|ע\.?מ|עוסק|מס['׳]?\s|רח['׳]?\s|רחוב|סניף|בנק|d\.?n|p\.?o)/i;
function chequeCleanName(raw){
  const lines=String(raw||'').split(/[\n\r]+/).map(x=>x.replace(/\s+/g,' ').trim()).filter(Boolean);
  for(const line of lines){
    if(/לא זוהה/.test(line))return '';
    if(CHQ_DROP.test(line))continue;
    if(!/[A-Za-z֐-׿]{2}/.test(line))continue; // בלי אותיות זה לא שם
    return line.replace(/^["'׳״]+|["'׳״]+$/g,'').slice(0,80);
  }
  return '';
}

async function chequeOcrAvailability(){
  if(!('LanguageModel' in self))return 'unsupported';
  try{return await LanguageModel.availability({expectedInputs:[{type:'image'}]})}
  catch(e){return 'unsupported'}
}

// סשן בסיס אחד, ושכפול לכל שיק: בלי השכפול ההקשר נערם משיק לשיק, והמודל
// מתחיל לענות לפי מה שראה קודם במקום לפי התמונה שלפניו.
async function chequeOcrSession(onDownload){
  return LanguageModel.create({
    expectedInputs:[{type:'image'}],
    initialPrompts:[{role:'system',content:CHQ_SYSTEM}],
    monitor(m){m.addEventListener('downloadprogress',e=>{try{onDownload?.(e.loaded)}catch(x){}})}
  });
}

// ⚠⚠ 31.08.2026 - טל צירף שיק של מזרחי טפחות שבו הבלוק המודפס אומר
// "ועד מקומי מושב יד-נתן", והחותמת ליד החתימה אומרת את אותו דבר - והתוסף
// רשם **"מופז גל"**. שם שאינו מופיע בשיק בשום מקום.
// **הלקח:** קריאה אחת של מודל אינה ראיה. שתי קריאות בלתי-תלויות שמסכימות
// הן ראיה סבירה; שתיים שחלוקות פירושן "לא יודע", ו"לא יודע" עדיף בהרבה
// על שם שגוי שנכנס לחיפוש ומזהם אותו בשקט.
const chqNorm=v=>String(v||'').replace(/[\s"'׳״,.\-–—]/g,'').toLocaleLowerCase('he');
function chequeNamesAgree(a,b){
  const x=chqNorm(a),y=chqNorm(b);
  if(!x||!y)return false;
  // הכלה ולא שוויון: קריאה אחת עשויה לקצר ("ועד מקומי מושב יד-נתן" מול
  // "ועד מקומי מושב יד-נתן תאגיד לא רשום"), וזו עדיין אותה ישות.
  return x===y||x.includes(y)||y.includes(x);
}

async function chequeReadPayer(session,front){
  const ask=async blob=>{
    const s=await session.clone();
    try{return chequeCleanName(await s.prompt([{role:'user',content:[
      {type:'text',value:CHQ_ASK},{type:'image',value:blob}]}]))}
    finally{try{s.destroy()}catch(e){}}
  };
  const cropped=await chequeCropTopRight(front);
  const fromCrop=await ask(cropped);
  // ⚠ **שתי הקריאות רצות תמיד**, גם כשהראשונה החזירה משהו. הגרסה הקודמת
  // עצרה בהצלחה הראשונה - ולכן קריאה שגויה אחת התקבלה בלי שום ערעור.
  const whole=await (await fetch(front)).blob();
  const fromFull=await ask(whole);
  if(chequeNamesAgree(fromCrop,fromFull))
    // הארוך מהשניים: הוא זה שנשא את הפרטים המלאים.
    return{name:chqNorm(fromCrop).length>=chqNorm(fromFull).length?fromCrop:fromFull,agree:true,crop:fromCrop,full:fromFull};
  return{name:'',agree:false,crop:fromCrop,full:fromFull};
}

// מעבר על כל הצילומים השמורים שאין להם עדיין שם. נקרא רק מלחיצה מפורשת.
// ⚠ chequeKeys ואז chequeGet אחד-אחד, ולא chequeAll: אחרת כל התמונות
// (45KB לשיק) יושבות בזיכרון בבת אחת.
// ⚠ שמירה אחרי כל שיק ולא בסוף: הריצה יכולה לקחת דקות, וטל עלול לסגור
// את הדף באמצע. מה שכבר הוכרע - נשאר.
async function chequeOcrRunAll({onProgress,onDownload,limit=0,retryDoubt=false}={}){
  const st=await chrome.storage.local.get({chequePayers:{},chequePayerDoubt:{}});
  const payers=st.chequePayers||{},doubt=st.chequePayerDoubt||{};
  const ids=[...await chequeKeys()].filter(id=>!payers[id]&&(retryDoubt||!doubt[id]));
  if(!ids.length)return{total:0,done:0,found:0,unsure:Object.keys(doubt).length,already:Object.keys(payers).length};
  const session=await chequeOcrSession(onDownload);
  let done=0,found=0,unsure=0;
  try{
    for(const id of ids){
      if(limit&&done>=limit)break;
      const rec=await chequeGet(id).catch(()=>null);
      done++;
      if(rec?.front){
        try{
          const r=await chequeReadPayer(session,rec.front);
          // ⚠ שם נשמר **רק** כששתי הקריאות מסכימות. חלוקות = ספק מתועד,
          // לא ניחוש. הספק מוצג לטל עם שני המועמדים, והוא מכריע.
          if(r.agree&&r.name){payers[id]=r.name;delete doubt[id];found++}
          else{doubt[id]={crop:r.crop||'',full:r.full||''};unsure++}
          await chrome.storage.local.set({chequePayers:payers,chequePayerDoubt:doubt});
        }catch(e){}
      }
      onProgress?.({done,total:ids.length,found,unsure});
    }
  }finally{try{session.destroy()}catch(e){}}
  return{total:ids.length,done,found,unsure,already:Object.keys(payers).length};
}
