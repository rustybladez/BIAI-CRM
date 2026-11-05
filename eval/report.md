# Extraction eval report

- Date: 2026-11-05 15:30 (Asia/Dhaka)
- Routing: deepseek:deepseek-flash -> gemini:gemini-3.5-flash
- Seed data: backend/seed/ai_results.json kept (report-only run)
- Enquiries: 20 (all)
- Calls that fell back to another provider: 0; failed completely: 0
- Median latency: 2711 ms

| Field | Score | Target | Met |
|---|---|---|---|
| message_type | 20/20 (100%) | ≥ 19/20 | yes |
| language | 20/20 (100%) | ≥ 19/20 | yes |
| status | 20/20 (100%) | ≥ 19/20 | yes |
| interest | 20/20 (100%) | ≥ 17/20 | yes |
| priority (±1) | 20/20 (100%) | ≥ 18/20 | yes |
| name | 20/20 (100%) | ≥ 18/20 | yes |
| follow_up_by date | 3/3 (100%) | ≥ 3/3 | yes |
| flags recall | 9/9 (100%) | ≥ 85% | yes |
| valid JSON first try | 20/20 (100%) | ≥ 19/20 | yes |
| priority (exact) | 18/20 (90%) | - | - |
| team_size | 3/3 (100%) | - | - |
| role | 4/4 (100%) | - | - |
| company | 3/3 (100%) | - | - |

System rules (normalize.py: phone, missing phone, duplicate merge, merged priority): all correct

## Within tolerance (counted as correct)

Priority one level away from the gold label. The scoring rules accept this; listed for transparency.

| id | field | expected | got |
|---|---|---|---|
| 6 | priority | low | medium |
| 15 | priority | medium | low |

## Mismatches

None.

## Messages with mismatches

