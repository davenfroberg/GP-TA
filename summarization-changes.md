# Summarization Changes

## Goals

1. Use **7 days** as the summarization range (when to do "fresh" vs "merge").
2. Let the **user specify how many days** they want when asking for summaries (e.g. "last 2 days", "last 7 days").
3. **Remove `needs_new_summary`** and drive behavior purely by time.

---

## 1. Summarizer (batch job)

**File:** `backend/lambda/summarizer/src/handler.py`

- Remove all use of `needs_new_summary`.
- Use only time-based logic:

  - **If** `last_major_update <= summary_last_updated` → **continue** (no new activity, skip).
  - **Else if** `summary_last_updated` is **more than 7 days ago** → **fresh**: generate a new summary that uses the previous summary as context but outputs only "what's new" (do not merge).
  - **Else** → **merge**: update the existing summary with the new diff so it reads as one coherent post.

- After summarizing, stop writing `needs_new_summary` in the `update_item` (drop it from the `SET` expression). If the schema expects it, you can set it to `False` for backward compatibility or leave the attribute unchanged.
- Replace the current `needs_fresh_summary()` logic (and its 2-day constant) with the 7-day threshold above.

---

## 2. Chat summarize flow

**Files:**

- `backend/lambda/chat/src/endpoints/summarize.py`
- `backend/lambda/chat/src/handler.py`
- Frontend (e.g. `frontend/gp-ta/src/components/chat/PiazzaChat.tsx`)

**Backend:**

- **Handler:** Read a `days` (or similar) value from the WebSocket/request body, e.g. `days = body.get("days", 2)`. Clamp to a sensible range (e.g. 1–7 or 1–14). Pass `days` into `summarize.chat(..., days=days)` when the intent is SUMMARIZE.
- **Summarize endpoint:** Add a parameter `days: int = 2` to `chat()`. Use it in:
  - `get_recent_summaries(course_id, days=days)`
  - The "no updates" message ("…in the last {days} days")
  - The LLM prompt ("…from the last {days} days")
  - `summary_days=days` in `save_student_query()`
- **Remove** any logic that sets or reads `needs_new_summary` in the chat/summarize path (e.g. in `get_recent_summaries`, stop updating `needs_new_summary` on posts).

**Frontend:**

- Add a way for the user to choose the summary window (e.g. "Last 2 days", "Last 7 days", or a numeric control).
- When sending the chat message, include that value in the WebSocket payload (e.g. `days: selectedDays`). Use it only when the backend treats the request as a summarize; the backend can ignore `days` for other intents.

---

## 3. Shared “7 days” constant (optional but useful)

- Define a single constant (e.g. `SUMMARY_RANGE_DAYS = 7`) and use it in:
  - The summarizer for the fresh-vs-merge threshold.
  - Optionally, the max allowed `days` in the chat (e.g. clamp user `days` to `min(user_days, SUMMARY_RANGE_DAYS)` or use it as the default when no `days` is sent).

---

## 4. Scrape / post creation

**File:** `backend/lambda/scrape/src/scrapers/core/PostManager.py`

- When creating a new post, stop setting `needs_new_summary` if you no longer need it for backward compatibility. If the table or other code still expects it, you can keep setting it to `False` until everything is migrated.

---

## 5. Accepted tradeoff

- Merged summaries can sometimes read like “the post was posted twice” (full narrative instead of “what’s new”). That’s acceptable; no separate delta/last_delta_summary or per-user “last seen” logic.
