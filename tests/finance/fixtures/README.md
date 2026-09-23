# Finance test fixtures

`booking-com-finance-statement.sanitized.csv` has the **exact schema** of a live Booking.com
Extranet → Finance statement export (same 15 headers, order, date format "11 Sept 2026", signed
negative Commission / Payments Service Fee, "by_booking" payment status) and the **same monetary
totals** as the real five-row file BoLaGio exported in September 2026:

| | cents | EUR |
|---|---|---|
| Amount (gross) | 249216 | 2,492.16 |
| Commission (source, signed) | −35896 | −358.96 |
| Payments Service Fee (source, signed) | −3489 | −34.89 |
| Net | 209831 | 2,098.31 |
| distinct Payout IDs | 3 | |

Every booking number (`999000000x`), guest name and payout ID is **fictitious**. The real file is
never committed: it contains guest names and real Booking.com reservation numbers.
