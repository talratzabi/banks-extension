# חוזה API לדשבורד היתרות

הדף `bank-balance-dashboard.html` אינו שומר פרטי כניסה לבנק. בחיבור אמיתי הוא מצפה לשרת Backend שמיישם OAuth/Open Banking.

## התחלת חיבור

`POST /connections/start`

```json
{
  "provider": "provider-id",
  "returnUrl": "https://your-app.example/dashboard"
}
```

תשובה:

```json
{
  "authorizationUrl": "https://provider.example/oauth/authorize?..."
}
```

השרת יוצר `state` חד־פעמי, שומר אותו בצד השרת ומחזיר כתובת הזדהות רשמית. אסור להעביר `client_secret` לדפדפן.

## קבלת יתרות

`GET /accounts/balances`

התשובה היא מערך:

```json
[
  {
    "id": "opaque-account-id",
    "bank": "שם הבנק",
    "nickname": "חשבון עסקי",
    "last4": "0309",
    "balance": 49124.00,
    "updated": "15.08.2026",
    "status": "מחובר"
  }
]
```

מומלץ שהשרת ישמור אסימוני גישה מוצפנים, ירענן אותם בצד השרת, יבדוק הרשאות/תוקף הסכמה, ויחזיר לדפדפן רק נתונים מצומצמים. יש להגדיר CORS רק לדומיין של הדשבורד ולהשתמש בעוגיית Session מסוג `HttpOnly`, `Secure`, `SameSite`.
