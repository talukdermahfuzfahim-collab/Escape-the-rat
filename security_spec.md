# Security Spec: Escape Loop: Puzzle Rooms

## Data Invariants
1. A user can only update their own profile.
2. Level progress can only increment by 1 at a time (basic check, could be hardened if level logic was server-side).
3. Endless high scores can only be updated if the new score is higher.
4. Leaderboard entries must belong to the authenticated user.

## The "Dirty Dozen" Payloads
1. **Identity Spoofing**: Attempt to create a profile for `userB` while logged in as `userA`.
2. **Resource Poisoning**: Use a 1MB string as `displayName`.
3. **Privilege Escalation**: Attempt to set `isAdmin: true` on user profile (not in schema, but good to test).
4. **State Shortcutting**: Update `levelProgress` from 1 to 50 directly.
5. **Score Injection**: Update `endlessHighScore` to a lower value.
6. **Orphaned Write**: Create a leaderboard entry with a `uid` that doesn't match the auth user.
7. **Cross-User Leak**: Try to read another user's PII (if any exists).
8. **Shadow Field**: Add `verified: true` to a profile update.
9. **Junk ID**: Use `../../malicious` as a document ID.
10. **Terminal State Break**: (Not applicable yet, but could be status: 'finished').
11. **PII Blanket Read**: Try to list all users.
12. **Denial of Wallet**: Repeatedly update with large payloads to hit write quotas (mitigated by rules but still a risk).

## Implementation Note
The current rules enforce `isOwner` for profiles and mandate that leaderboard entries match the `auth.uid`. Schema validation ensures types and sizes.
