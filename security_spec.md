# Security Specification - Home Anchor

## Data Invariants
1. A Task must belong to a valid Household that the creator/assignee is a member of.
2. A Redemption must deduct points from the child who created it.
3. Only parents can approve/reject/pay redemptions.
4. Only children can create tasks (no, only parents create tasks).
5. Only assigned children can submit tasks.

## The Dirty Dozen Payloads

1. **Identity Spoofing**: Child attempts to create a task assigned to themselves but sets the `pointValue` to 1,000,000.
2. **Identity Spoofing**: Child attempts to update their own `totalPoints` directly in the `users` collection.
3. **Identity Spoofing**: Parent attempts to read another household's data by guessing the ID.
4. **State Shortcutting**: Child attempts to mark a task as `approved` without parent interaction.
5. **State Shortcutting**: Child attempts to mark a redemption as `paid` or `approved`.
6. **Resource Poisoning**: User attempts to create a household with a 2MB name string.
7. **Resource Poisoning**: User attempts to create a task with a document ID containing special characters that could break URL structures.
8. **Bypassing Membership**: User attempts to join a household they are not invited to (by guessing the ID and adding themselves to `members`).
9. **PII Leak**: Non-member authenticated user attempts to list all users in the system to find email addresses.
10. **The Update Gap**: Child attempts to update a task they don't own by changing the `assignedTo` field.
11. **Orphaned Write**: Child creates a redemption but doesn't deduct points from their profile (enforced by existsAfter/getAfter).
12. **The "Update-Gap" Injection**: User updates a household and injects a `secretAdmin: true` field.

## Test Runner Logic (Conceptual for firestore.rules)
- Verify `isMember(householdId)` for all read/write in households.
- Verify `isParent()` for sensitive write operations (create task, approve redemption).
- Verify `isChild() && isOwner()` for submitting tasks.
- Verify `isValidUser()`, `isValidTask()`, etc. match schemas.
