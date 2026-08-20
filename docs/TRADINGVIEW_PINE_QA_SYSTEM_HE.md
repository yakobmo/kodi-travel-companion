# מערכת QA לאינדיקטור TradingView Pine

מסמך זה מגדיר מערכת QA מקיפה לאינדיקטור Pine המצורף, עם דגש על סטטיסטיקה, תפעול, הגנות, סנכרון בין שכבות, ועומס חישובי. המטרה היא להפוך את הקוד ממערכת איתותים גדולה למערכת שניתן לבדוק, להשוות, ולתפעל בביטחון.

## שלב נוכחי

הקוד הוא אינדיקטור Pine Script v6 גדול שמכיל:

- איתותי כניסה: `BUY`, `BUY_PLUS`, `PB_PLUS`, `RALLY_BUY`, `FAST_MOMENTUM_BUY`, `FAST_EARLY_BUY`, `TEN_MIN_TURN_BUY`, `EARLY_REBOUND_BUY`, `VWAP_RECLAIM_BUY`, `OPENING_RANGE_RECLAIM`.
- מנוע סטטיסטיקה סימולטיבי לכל האיתותים.
- מנוע תפעולי שבוחר איתות אחד לשליחת webhook.
- שכבות הגנה: `Stats Gate`, `Guard`, `False Signal Pressure`, `Chop Guard`, פילטר שוק, earnings, gap, ATR spike.
- טבלת סטטיסטיקה פנימית ו־JSON payload ל־webhook.

## עקרון QA מרכזי

אסור לערבב בין ארבע שכבות:

| שכבה | משמעות | מקור בקוד | מטרת QA |
| --- | --- | --- | --- |
| RAW | איתות גולמי שנוצר על הגרף | תנאי `buyClean`, `buyPlus`, `showPbPlus` וכו' | לבדוק שהלוגיקה מזהה תבנית נכונה |
| GATED | איתות שעבר או נחסם על ידי סטטיסטיקה והגנות | `*StatsGateOk`, `*FinalGateOk`, `falsePressureAutoBlocked`, `chopBlockActive` | לבדוק שהגייטים חוסמים רק לפי כלל מוגדר |
| SELECTED | האיתות שנבחר בפועל מתוך כמה מועמדים באותו בר | `finalOperationalEntryIndex` | לבדוק קדימות, איכות, ותחרות בין איתותים |
| WEBHOOK | האירוע שנשלח החוצה | `alert(entryJson)` / `alert(pendingJson)` | לבדוק payload, כפילויות, cooldown ו־exit תואם |

כל QA סטטיסטי חייב לציין באיזו שכבה הוא בודק.

## ממצאי סיכון שצריך לבדוק קודם

| עדיפות | נושא | סיכון | בדיקת QA נדרשת |
| --- | --- | --- | --- |
| P0 | סנכרון סטטיסטי | `selectedStatsAuto` מצטבר לכל ההיסטוריה, בזמן שמוני האסטרטגיות מחושבים מחדש לפי `statsWindowDays` | לוודא שהטבלה וה־payload מסמנים במפורש אם נתון הוא windowed או lifetime |
| P0 | Stop rate | `EarlyStopRate` מחושב מול entries ולא מול closed trades | לבדוק תרחיש עם עסקאות פתוחות ולוודא שה־gate לא מקבל החלטה אופטימית מדי |
| P0 | בחירת איתות יחיד | סטטיסטיקה יכולה לספור כמה איתותים באותו בר, אבל webhook שולח אחד | לבדוק RAW מול SELECTED באותו בר |
| P1 | חלון כניסות | `statsWindowEntryTimes` נחתך לפי `statsWindowDays + 90`, סגירות לפי `statsWindowDays` | להחליט אם זה מכוון; אם כן להציג כ־extended entry window |
| P1 | Guard | חיסור הפסדים במצב red market יכול לשנות gate ו־quality | לבדוק שהחישוב לא מוריד רווחים או stops שלא שייכים |
| P1 | False Pressure | מנגנון latch יכול לחסום גם אחרי שהנתונים משתפרים עד שהציון יורד מתחת לסף יציאה | לבדוק hysteresis: כניסה ב־60, יציאה מתחת 30 |
| P1 | Performance | לולאות על מערכים, טבלאות ו־JSON על כל בר | לבדוק 5m/10m עם 180-730 ימים |
| P2 | JSON | בנייה ידנית של payload עלולה להפיק ערכים לא עקביים או `na` כ־0 | לבדוק payload מלא לכל סוג כניסה ויציאה |

## QA תפעולי

| ID | תרחיש | תנאי כניסה | ציפייה | שכבה |
| --- | --- | --- | --- | --- |
| OPS-001 | webhook כבוי | `enableWebhookAlerts=false` | אין alert, אין פתיחת פוזיציה תפעולית | WEBHOOK |
| OPS-002 | בר לא סגור | `barstate.isconfirmed=false` | אין כניסה לסטטיסטיקה ואין alert | RAW/GATED/WEBHOOK |
| OPS-003 | cooldown פעיל | alert קודם באותו חלון `minAlertInterval` | לא נשלח alert כניסה נוסף | WEBHOOK |
| OPS-004 | כפילות entry | אותו `entryFingerprint` | נשלח פעם אחת בלבד | WEBHOOK |
| OPS-005 | יציאה אחרי כניסה | קיימת פוזיציה תפעולית פתוחה | exit payload כולל `entryId`, `entryType`, `entryPrice`, `exitPrice`, `exitProfitPct` | WEBHOOK |
| OPS-006 | כמה איתותים באותו בר | שני מועמדים או יותר | נשלח רק המועמד עם quality גבוה יותר; שוויון נשבר לפי net/trade | SELECTED |
| OPS-007 | `falsePressureAutoBlocked=true` | איתות תקין אבל pressure חסום | לא נבחר איתות תפעולי | GATED |
| OPS-008 | `chopBlockActive=true` | איתות תקין אבל chop חוסם | לא נוצרים pending entries תפעוליים | GATED |

## QA סטטיסטיקה

טבלת הבסיס לכל אסטרטגיה:

| Metric | נוסחה צפויה | מקור | הערת QA |
| --- | --- | --- | --- |
| Entries | מספר כניסות בחלון המדידה | `statsWindowEntryTimes` לפי `f_window_key` | לבדוק אם החלון הוא `statsWindowDays` או `statsWindowDays + 90` |
| Closed | מספר עסקאות שנסגרו | `statsWindowTimes` לפי `f_window_key` | חייב להיות קטן או שווה ל־entries אחרי התאמת חלונות |
| Wins | עסקאות עם `pnl > 0` | `statsWindowProfitPcts` | עלות `estRoundTripCostPct` כבר מופחתת |
| Net % | סכום PnL נטו | `statsWindowProfitPcts` | חייב להיות סכום מדויק של כל הסגירות |
| Net/Trade | `Net / Closed` | מחושב לכל tactic | אין לחלק ב־entries |
| Best Trade | מקסימום PnL | `wBest` | אם כל העסקאות שליליות, צריך להגדיר אם הערך נשאר 0 או העסקה הפחות גרועה |
| Net Without Best | `Net - max(Best, 0)` | `f_net_without_best` | נדרש ל־consistency gate |
| Best Trade Share | `Best / Net` כאשר שניהם חיוביים | `f_best_trade_share` | אם Net לא חיובי, צפוי 0 |
| Early Stop Rate | `EarlyStops / Entries` בקוד הנוכחי | `*EarlyStopRate` | לבדוק בנפרד גם `EarlyStops / Closed` |
| Run Profit | סכום רווחים של exits שלא היו early stop | `*SurvivedProfitStats` | לוודא ש־checkpoint timeout נספר כ־early stop |
| Unique Days | ימים שונים עם closed trades | `f_unique_days_count` | תצוגה בלבד, לא gate |

### נוסחת בדיקה ידנית לסטטיסטיקה

לכל tactic, בודקים ידנית קבוצה קטנה של עסקאות:

| Trade | Entry | Exit | Gross % | Cost % | Net % | Win | Early Stop | Runner |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| T1 | 100 | 104 | 4.00 | 0.15 | 3.85 | כן | לא | כן/לא |
| T2 | 100 | 98 | -2.00 | 0.15 | -2.15 | לא | כן | לא |
| T3 | 100 | 101 | 1.00 | 0.15 | 0.85 | כן | checkpoint אם לא הגיע target | לא |

Expected:

- `Closed=3`
- `Wins=2`
- `Net=2.55`
- `Net/Trade=0.85`
- `EarlyStops` לפי תרחיש היציאה בפועל
- `BestTrade=3.85`
- `NetWithoutBest=-1.30`
- אם `statsGateMinNetPerTradePct=2.0`, gate צריך להיכשל למרות win rate חיובי.

## QA הגנות קיימות

| הגנה | תפקיד | בדיקה חיובית | בדיקה שלילית |
| --- | --- | --- | --- |
| Stats Gate | מאשר tactic לפי win rate, sample, net/trade, consistency, stop rate | tactic עם מדגם מספיק, net/trade חיובי, best share נמוך | tactic שנשען על trade אחד גדול |
| Guard | מסיר הפסדי red market אם זה משפר gate | הפסדי red market מוסרים וה־final gate משתפר | guard לא מופעל אם לא מוסיף ערך או אין removed losses |
| False Pressure | חוסם אוטומציה כשהרצף הכללי חלש | 4 הפסדים מתוך 4 מפעילים clean sweep | חזרה מתחת 30 משחררת latch |
| Chop Guard | חוסם רק אם היסטוריית choppy גרועה מהרגיל | choppy net/trade נמוך ו־confidence מספיק | sample לא מספיק משאיר standby |
| Market Risk Off | חוסם איתותים מסוימים כאשר QQQ מתחת EMA21 | `isMarketRiskOff=true` מסמן red market | לא לחסום `BUY` אם הקוד לא הגדיר זאת במפורש |
| Earnings Veto | מגן סביב אירועים קרובים | `daysToEarnings<=2` חוסם `PB_PLUS` ו־signals תלויים | `daysToEarnings=999` לא חוסם |
| Gap Risk | מזהה gap חיובי מעל 2% | `gapPct>2` משפיע על `isHighExecutionRisk` | gap קטן לא חוסם |
| ATR Spike | מזהה תנודתיות חריגה | ATR% חריג חוסם לפי `isHighExecutionRisk` | ATR רגיל לא חוסם |

## QA סנכרון סטטיסטי

בדיקות חובה לפני אמון בטבלה:

| ID | בדיקה | נוסחה צפויה |
| --- | --- | --- |
| SYNC-001 | סכימת Total | `TOTAL.closed = sum(all tactic closed)` |
| SYNC-002 | סכימת Protected/Team | `TEAM.closed = sum(final-gated tactic closed)` |
| SYNC-003 | Selected מול Webhook | `selectedEntryStatsAuto` עולה רק אחרי alert כניסה שנשלח בפועל |
| SYNC-004 | Exit selected | `selectedClosedStatsAuto` עולה רק אחרי exit של entry תפעולי קיים |
| SYNC-005 | Raw מול selected | כאשר שני איתותים מופיעים באותו בר, RAW יכול לספור יותר מ־1, SELECTED חייב לספור 1 |
| SYNC-006 | חלונות זמן | כל metric בטבלה מסומן כ־windowed, extended-entry, protected או selected-lifetime |
| SYNC-007 | Guard display | ערכי display משתמשים ב־guard רק כאשר `*UseGuard=true` |
| SYNC-008 | Payload מול Table | עבור signal שנשלח, `signalStats*` ב־payload שווה לשורה המתאימה בטבלה |

## QA עומס וחישובים כבדים

| ID | בדיקה | סט ציפיות |
| --- | --- | --- |
| PERF-001 | סימבול נזיל, 5m, 180 ימים | אין חריגת זמן, אין labels עודפים, הטבלה מתעדכנת |
| PERF-002 | סימבול נזיל, 10m, 730 ימים | arrays נחתכים לפי window, אין צמיחה בלתי מוגבלת ב־stats arrays |
| PERF-003 | יום עם הרבה איתותים | pending arrays נשארים תואמים באורך, אין remove לא מסונכרן |
| PERF-004 | `max_labels_count=500` | labels לא מונעים עבודה; אם צריך, לעבור לטבלת diagnostics במקום labels |
| PERF-005 | `request.security` | אין repaint: כל daily/QQQ value משתמש ב־`lookahead_off` וב־bar קודם כאשר נדרש |

## QA טבלת תצוגה

| Row | תוכן | בדיקה |
| --- | --- | --- |
| TEAM Fit | `protectedFitScore`, `protectedFitLabel` | מתאים ל־protected metrics, לא ל־total raw |
| TEAM | protected stats | סכום gated/guarded בלבד |
| TOTAL | raw/windowed stats | סכום כל tactics בלי final gate |
| tactic rows | quality/net/stop/run לכל tactic | כל שורה תואמת ל־display vars שלה |
| GUARD | guard score/delta/detail | `guardBlockedLosses` ו־`guardUsedTactics` עקביים |
| TEAM FALSE | false pressure | label, score, PF, losses תואמים ל־lookback |
| CHOP GUARD/PF | chop comparison | choppy/normal samples ו־PF מוצגים רק לפי closed trades |
| DATA COVERAGE | היסטוריית גרף | `TRUNCATED` אם אין לפחות 90% מ־statsWindowDays |

## QA JSON/Webhook

לכל alert כניסה:

- `signal` מתאים לאיתות שנבחר.
- `entryType` מתאים למפתח הסטטיסטי.
- `entryId` כולל ticker, type, time, bar_index.
- `autoAction="BUY"`.
- `autoExecutable=true`.
- `signalStatsGatePassed=true`.
- `selectedFalsePressureAutoBlocked=false`.
- `teamStats*`, `totalStats*`, `signalStats*` עקביים עם הטבלה.

לכל alert יציאה:

- `autoAction="EXIT"`.
- `entryId` זהה לכניסה שנפתחה.
- `exitPrice` ו־`exitProfitPct` אינם 0 מלאכותי אם יש ערך אמיתי.
- `atrExitMode` הוא `EARLY_PROTECTION`, `RUNNER_ATR`, או `CHECK_POINT_TIMEOUT`.
- `exitBatchCount` נכון אם כמה exits באותו בר.

## סדר עבודה מומלץ

1. להעתיק את קוד ה־Pine לסביבת QA נפרדת ב־TradingView.
2. להוסיף `QA Mode` כ־input שמפעיל תצוגת diagnostics מורחבת.
3. לבנות 10 תרחישי בדיקה קבועים לפי `docs/TRADINGVIEW_PINE_QA_MATRIX.csv`.
4. לבדוק קודם סטטיסטיקה קטנה ידנית, ואז סימבולים חיים.
5. רק אחרי שהסטטיסטיקה מסונכרנת, לאפשר שימוש ב־Stats Gate/Guard לאוטומציה.

## Definition Of Done

מערכת QA נחשבת מוכנה כאשר:

- לכל tactic יש לפחות 5 תרחישי בדיקה ידניים עם expected values.
- `TOTAL`, `TEAM`, `SELECTED`, ו־`WEBHOOK` מוגדרים ומופרדים.
- כל payload שנשלח מכיל stats שתואמים לטבלה.
- יש סימון ברור אם metric הוא windowed או lifetime.
- בדיקות guard/false pressure/chop מוכיחות גם חסימה וגם שחרור.
- בדיקת עומס על 180 ימים לפחות לא שוברת את האינדיקטור.
