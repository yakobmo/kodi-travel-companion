# תיקוני QA ממוקדים לאינדיקטור Pine

תאריך: 2026-08-20

קובץ מתוקן: `tradingview/one_qa_fixed.pine`

המקור המודבק לא שונה. נוצרה גרסת עבודה מתוקנת כדי לשמור נקודת חזרה ברורה.

## מה תוקן

### 1. FALSE_BREAKOUT מכבד את ה־toggle שלו

לפני:

- `alertFalseBreakoutSignals` היה מוגדר כ־input, אבל שליחת `FALSE_BREAKOUT` נשלטה בפועל על ידי `alertExitSignals`.

אחרי:

- `FALSE_BREAKOUT` נשלח רק אם `alertFalseBreakoutSignals=true`.
- שאר יציאות ה־ATR עדיין נשלטות על ידי `alertExitSignals`.

### 2. selected stats עברו לחלון `statsWindowDays`

לפני:

- `selectedStatsAuto` היה lifetime מצטבר.
- `TEAM`, `TOTAL`, ו־tactic stats היו windowed.

אחרי:

- נוספו arrays לחלון selected:
  - `selectedWindowEntryTimes`
  - `selectedWindowExitTimes`
  - `selectedWindowProfitPcts`
  - `selectedWindowEarlyStopFlags`
- `selectedStats*` ב־payload מחושב עכשיו לפי חלון `statsWindowDays`.
- מוני ה־Auto נשארו בקוד כתאימות פנימית, אבל אינם מקור ה־payload לאחר החישוב מחדש.

### 3. Gate משתמש ב־Early Stop לפי עסקאות סגורות

לפני:

- ה־gate השתמש ב־`EarlyStops / Entries`.
- זה יכול להקטין מלאכותית stop rate כאשר יש עסקאות פתוחות.

אחרי:

- נוספו חישובי `*EarlyStopRateClosed`.
- `f_quality_score` ו־`f_stats_gate_ok` משתמשים ב־stop rate לפי closed trades.
- תצוגת stop rate לפי entries נשמרה למסך, כדי לא לשנות משמעות UI קיימת.

### 4. חלון entries אוחד עם חלון closed

לפני:

- `statsWindowTimes` נחתך לפי `statsWindowDays`.
- `statsWindowEntryTimes` נחתך לפי `statsWindowDays + 90`.

אחרי:

- `statsWindowEntryCutoffTime = statsWindowCutoffTime`.
- entries ו־closed נמצאים באותו חלון סטטיסטי.

### 5. OPENING timeout סונכרן עם המסלול התפעולי

לפני:

- `openingStatsTimeoutBars` סגר עסקה בסטטיסטיקה בלבד.
- מסלול webhook/operational exit המשיך לפי ATR או checkpoint כללי.

אחרי:

- פוזיציית `OPENING_RANGE_RECLAIM` מקבלת timeout תפעולי לפי `openingStatsTimeoutBars`.
- ה־payload mode הוא `OPENING_STATS_TIMEOUT`.
- timeout זה לא מסומן כ־`FALSE_BREAKOUT` ולא מוזן ל־False Pressure כאילו היה false signal.

## בדיקות שבוצעו

- חיפוש עקביות לתיקונים המרכזיים בקובץ Pine.
- בדיקת whitespace לקובץ Pine.
- `scripts/qa.ps1`: עבר.
- `scripts/build.mjs`: עבר עם Node המובנה של Codex.

## מה עדיין חייב TradingView

הקובץ צריך לעבור:

1. Add to chart / compile ב־TradingView.
2. Replay קצר על סימבול נזיל ב־5m.
3. בדיקת alert payload עבור:
   - כניסה רגילה.
   - ATR exit.
   - `FALSE_BREAKOUT` עם toggle כבוי/דלוק.
   - `OPENING_STATS_TIMEOUT`.
4. השוואת שורת TEAM/TOTAL מול payload באותו בר.

## רמת אמון אחרי התיקון

הערכת QA סטטית:

- לפני התיקון: כ־65/100 לאוטומציה מלאה.
- אחרי התיקון: כ־82/100 סטטית.
- אחרי קומפילציה ו־Replay ב־TradingView ללא חריגות: 88-90/100.

לא מדובר בחתירה לשלמות אינסופית. אלה היו תיקוני סף שמונעים השוואת חלונות לא אחידה ושליחת alert בניגוד להגדרה.
