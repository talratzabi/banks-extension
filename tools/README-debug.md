# עיניים לסוכן — Chrome ייעודי + CDP

מטרה: שהסוכן יקרא DOM, קונסולה ואחסון בעצמו, במקום שטל ידווח.

## הפעלה

1. `tools\chrome-debug.cmd` — פותח Chrome נפרד על פרופיל `%LOCALAPPDATA%\banks-debug-profile`,
   עם פורט דיבוג 9222. **הפרופיל הראשי של טל אינו נוגע ואינו נסגר.**
2. **פעם אחת בלבד בפרופיל הזה:** `chrome://extensions` → „מצב מפתח" → „טען פריט לא ארוז" →
   `<repo>\extension`. אחרי זה ההתקנה נשמרת בפרופיל וחוזרת בכל הפעלה.

## למה לא הפרופיל הראשי, ולמה לא --load-extension

**נמדד 20.08.2026, Chrome 151:**
- Chrome ‎136+ **מסרב** לפתוח פורט דיבוג על `User Data` הראשי. לכן פרופיל נפרד.
- `--load-extension` **מבוטל בשקט** כשקיים `--remote-debugging-port` (הרצה בלי הפורט —
  התוסף נטען; עם הפורט — אפס תוספים). `--enable-unsafe-extension-debugging` לא עזר.
- תוסף שנטען ב-`--load-extension` **אינו נשמר** ב-`Preferences` — הוא זמני להרצה.
  לכן „טען פריט לא ארוז" ידני, פעם אחת.

## פקודות

```
python tools/cdp.py targets                  # מה פתוח
python tools/cdp.py open <url>               # פתיחת לשונית
python tools/cdp.py nav <חלק-מכתובת> <url>
python tools/cdp.py eval <חלק-מכתובת> "<js>"  # או @קובץ.js
python tools/cdp.py dom  <חלק-מכתובת> [selector] --out fixtures/x.html
python tools/cdp.py console <חלק-מכתובת> [שניות]
python tools/cdp.py storage [key1,key2]      # chrome.storage.local מתוך ה-service worker
```

## גבולות שאינם ניתנים למשא ומתן

- **אין הזנת סיסמאות או קודי אימות. אין פעולות כספיות.** ההתחברות לבנק היא של טל.
- `dom` שומר HTML גולמי — **לנקות מספרי חשבון, שמות וסכומים לפני קומיט.**
  נתוני בנק אינם נכנסים ל-GitHub.
