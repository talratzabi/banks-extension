const status=document.querySelector('#status');document.querySelector('#dashboard').onclick=()=>chrome.runtime.sendMessage({type:'OPEN_DASHBOARD'});async function refreshStatus(){const x=await chrome.storage.local.get({syncStatus:''});// ⚠⚠ 22.08.2026 — **זה מה שטל ראה כ„אין תוסף" ו„הדשבורד לא נפתח".**
// הפופ-אפ רחב 290px (`.popup{width:290px}`), ו-`syncStatus` הגיע ל-1,052
// תווים: הודעת כשל לאומי הנושאת כתובת עם פרמטר `?q=` דחוס, בלי רווח אחד.
// מחרוזת כזו אינה נשברת, ולכן היא מתחה את הפופ-אפ לרוחב ו**דחפה את כפתור
// „פתיחת הדשבורד" מחוץ למסך** — ומכאן שהדשבורד לא נפתח. הצילום שנראה
// כדף ריק עם מחרוזת אחת היה הפופ-אפ, לא הדשבורד.
// ⚠ בסבב קודם תיקנתי את `dashboard.js` בהנחה שזה הדשבורד — **הקובץ הלא
// נכון.** המדידה שסתרה אותי: הדשבורד לא גלש באף רוחב שנבדק.
// כאן 160 תווים ולא 320, כי 290px הם כשליש מרוחב הדשבורד.
const short=t=>{t=String(t||'');return t.length>160?t.slice(0,160)+'…':t};
status.textContent=short(x.syncStatus)}refreshStatus();setInterval(refreshStatus,700);
