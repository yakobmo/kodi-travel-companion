# דו"ח ביצוע QA לאינדיקטור TradingView Pine

תאריך: 2026-08-20

מקור נבדק: `C:\Users\yaako\.codex\attachments\34b38ada-a8d2-4b91-a0f2-fb738d349fbb\pasted-text.txt`

היקף: QA סטטי וחישובי לפי `docs/TRADINGVIEW_PINE_QA_MATRIX.csv`. לא בוצעה קומפילציה ב־TradingView ולא בוצע replay על גרף חי, כי אין קומפיילר Pine/נתוני ברים מקומיים בסביבת העבודה.

## תקציר מנהלים

לא מוכן להפעלה אוטומטית מלאה לפני תיקון הממצאים.

המערכת בנויה טוב מבחינת הפרדת שכבות בסיסית: RAW, GATED, SELECTED, WEBHOOK. עם זאת, נמצאו חוסר סנכרון וסיכון תפעולי סביב False Breakout, חלונות סטטיסטיקה, חישוב stop rate, וסטטיסטיקת opening מול מסלול operational exit.

## תוצאות מטריצה

| אזור | סה"כ בדיקות | סטטוס |
| --- | ---: | --- |
| Operational | 6 | עבר סטטית עם ממצא webhook אחד שמשפיע על FALSE |
| Statistics | 10 | נכשל חלקית: חלונות ו־stop rate דורשים תיקון |
| Protection | 12 | עבר סטטית, דורש replay כדי לאמת התנהגות בזמן אמת |
| Webhook | 3 | נכשל חלקית: False Breakout flag לא נאכף |
| Display | 2 | חסום עד הרצת TradingView |
| Performance | 3 | חסום עד הרצת TradingView על גרף ארוך |

סה"כ במטריצה: 36 בדיקות. מתוכן 25 בדיקות P0 ו־11 בדיקות P1.

## ממצאי P0

### P0-1: `alertFalseBreakoutSignals` מוגדר אך אינו שולט ב־FALSE_BREAKOUT

Evidence:

- הקלט מוגדר בשורה 25: `alertFalseBreakoutSignals`.
- `FALSE_BREAKOUT` נדחף ל־pending alerts בשורה 1652.
- שליחת exit alerts נשלטת בשורה 2434 רק על ידי `alertExitSignals`.

משמעות:

אם המשתמש כיבה False Breakout אבל השאיר Exit alerts פעילים, המערכת עדיין יכולה לשלוח `FALSE_BREAKOUT`.

תיקון מומלץ:

להחליף את בדיקת ההרשאה ל:

```pine
bool pendingAlertAllowed = pendingSignal == "FALSE_BREAKOUT" ? alertFalseBreakoutSignals : alertExitSignals
```

QA חוזר:

- `alertExitSignals=true`, `alertFalseBreakoutSignals=false`, checkpoint מתקיים: אין alert.
- `alertExitSignals=false`, `alertFalseBreakoutSignals=true`, checkpoint מתקיים: יש alert רק אם זו כוונת המוצר.

### P0-2: סטטיסטיקת `selectedStatsAuto` היא lifetime, בעוד סטטיסטיקת tactics היא windowed

Evidence:

- מוני `selectedEntryStatsAuto`, `selectedClosedStatsAuto`, `selectedProfitStatsAuto` מוגדרים כ־`var` בשורות 578-584.
- הם מתעדכנים רק במסלול operational exit/entry בשורות 1608-1616, 1669-1673, 2511.
- אין pruning לפי `statsWindowDays`.
- מנגד, `statsWindowTimes` ו־`statsWindowEntryTimes` נחתכים בשורות 948-961.

משמעות:

ה־payload יכול לערבב selected lifetime עם team/total windowed. זה יוצר החלטות או תצוגות שאינן מאותו חלון מדידה.

תיקון מומלץ:

להחליט אחת משתי אפשרויות:

- להוסיף selected window arrays כמו `selectedWindowTimes`, `selectedWindowProfitPcts`.
- או לשנות שמות payload ל־`selectedLifetimeStats*` כדי שלא יובן כאותו חלון.

### P0-3: `EarlyStopRate` מחושב לפי entries ולא לפי closed trades

Evidence:

- חישובים בשורות 1174-1183 משתמשים ב־`EarlyStopStats / EntryStats`.
- `f_stats_gate_ok` משתמש ב־earlyStopRate כדי לאשר/לחסום gate בשורות 1261-1266.

משמעות:

כאשר יש פוזיציות פתוחות, ה־stop rate עלול להיות נמוך מדי. לדוגמה: 10 כניסות, 2 סגורות, 2 early stops => בפועל 100% מהסגורות נעצרו מוקדם, אבל הקוד יראה 20%.

תיקון מומלץ:

להפריד:

- `earlyStopRatePerEntry` לתצוגת עומס.
- `earlyStopRatePerClosed` ל־Stats Gate.

### P0-4: חלון entries שונה מחלון closed trades

Evidence:

- `statsWindowCutoffTime = time - statsWindowDays`.
- `statsWindowEntryCutoffTime = time - (statsWindowDays + 90)`.
- pruning נפרד בשורות 948-961.

משמעות:

אותו tactic יכול להציג closed ב־180 ימים, אבל entries ב־270 ימים. זה משפיע על stop rate, display, protected stats ו־payload.

תיקון מומלץ:

אם זה מכוון, להציג בטבלה וב־payload `entryWindowDays`. אם לא מכוון, לאחד את החלון.

## ממצאי P1

### P1-1: `openingStatsTimeoutBars` חל רק על סטטיסטיקת OPENING, לא על exit התפעולי

Evidence:

- מנוע opening stats סוגר לפי `openingStatsTimeoutBars` בשורות 916-918.
- מנוע operational exit משתמש במסלול הכללי: ATR exit או `checkPointBars` בשורות 1591-1650.

משמעות:

שורת `RS PB+` בטבלה יכולה להיסגר סטטיסטית אחרי 24 ברים, בעוד פוזיציה operational שנשלחה ב־webhook תישאר במסלול exit אחר. זה חוסר סנכרון בין סטטיסטיקה לביצוע.

תיקון מומלץ:

להוסיף timeout תפעולי ייעודי ל־`OPENING_RANGE_RECLAIM`, או לתעד ש־opening timeout הוא סטטיסטי בלבד ולא operational.

### P1-2: `BestTrade` מאותחל ל־0 ולכן במדגם שכולו הפסדים הוא לא מייצג את העסקה הטובה ביותר

Evidence:

- `wBest = 0.0` בשורה 980.
- עדכון עם `math.max(wBest, kProfit)` בשורה 997.

משמעות:

אם כל העסקאות שליליות, `BestTrade=0`. זה לא פוגע ב־gate כי net/trade וה־consistency יכשילו, אבל התצוגה יכולה להסתיר את העסקה הכי פחות גרועה.

תיקון מומלץ:

לאתחל best trade ל־`na` או לעסקה הראשונה במדגם.

### P1-3: `RunPct` ב־payload הוא סכום רווחי runners, לא אחוז ממוצע

Evidence:

- `signalStatsRunPct` מקבל `f_signal_stats_run`.
- `selectedStatsRunPct`, `teamStatsRunPct`, `totalStatsRunPct` מקבלים סכומי `*SurvivedProfitStats`.

משמעות:

שם השדה כולל `Pct`, אבל הערך הוא סכום אחוזי רווח, לא ממוצע. זה יכול להטעות צרכן webhook.

תיקון מומלץ:

לשנות שמות ל־`RunNetPct` או להוסיף `RunAvgPct`.

## בדיקות שעברו סטטית

- `enableWebhookAlerts=false` מונע פתיחת pending operational entries דרך `teamEntryExecutableBase`.
- `barstate.isconfirmed` נאכף בסטטיסטיקה וב־webhook.
- cooldown ו־fingerprint קיימים לכניסה.
- exit payload שומר `entryId`, `entryType`, `entryPrice`, `entryTime`, `entryBar`.
- בחירת איתות יחיד קיימת דרך `finalOperationalEntryIndex`.
- `TOTAL` מחושב כסכימת כל tactics.
- `TEAM/protected` מחושב כסכימת tactics שעברו final gate.
- מיפוי מפתחות בין `f_window_key` ו־`f_entry_stats_key` עקבי עבור כל סוגי האיתותים המרכזיים.
- Guard, False Pressure ו־Chop Guard קיימים עם hysteresis/thresholds ברורים.
- כל `request.security` שנבדק משתמש ב־`barmerge.lookahead_off`.

## בדיקות חסומות עד TradingView

הבדיקות הבאות דורשות קומפילציה והרצה בפועל על גרפים:

- סימולציית 3 עסקאות ידנית לכל tactic.
- בדיקת טבלת display מול ערכי payload בזמן alert אמיתי.
- בדיקת ביצועים על 180/730 ימים.
- בדיקת מגבלת `max_labels_count=500`.
- replay של יום עם צפיפות איתותים גבוהה.
- בדיקת repaint בפועל סביב daily/QQQ/earnings.

## פעולות תיקון מומלצות לפני QA חוזר

1. לתקן את `alertFalseBreakoutSignals`.
2. להפריד selected lifetime מ־windowed stats או להוסיף selected window pruning.
3. להחליף Gate stop rate ל־closed denominator.
4. להכריע אם `statsWindowDays + 90` ל־entries הוא מכוון; אם כן להציג זאת מפורשות.
5. לסנכרן opening timeout בין stats ל־operational exits או לתעד הבדל.
6. להריץ TradingView replay על 5m ו־10m עם טבלת QA פתוחה.

## אימות שבוצע בריפו

- `docs/TRADINGVIEW_PINE_QA_MATRIX.csv` נטען תקין: 36 שורות, ללא Priority ריק.
- בדיקת whitespace על קבצי QA החדשים: עברה.
- `scripts/qa.ps1`: עבר.
- `scripts/build.mjs`: עבר כאשר PATH כולל את Node המובנה של Codex.

הערה: `git diff --check` כללי עדיין נחסם בגלל שינוי קיים שלא נוצר במסגרת QA זה: `scripts/smoke-local.mjs` מכיל blank line at EOF.
