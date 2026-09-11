# Independent fund cost implementation plan

Goal: resolve missing fee provenance without assuming broker availability.
Architecture: bounded exchange parser and independent floor evidence, consumed
only by the existing contribution comparison. Python; existing public HTTP helper.

- [x] Add failing exact-identity, malformed-fee, freshness and cost-bound tests.
- [x] Add exchange parser and connect optional evidence to candidate fetching.
- [x] Preserve broker gates, same-share-class ambiguity and conflicting evidence.
- [x] Verify public source, domain/API/security tests and independent review.
- [x] Deploy, check live recommendation and document remaining investment blockers.
