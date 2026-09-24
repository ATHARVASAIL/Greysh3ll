# Security Policy

GreySh3ll is a static, client-side application. It has no backend, no
accounts and no telemetry, so the realistic vulnerability classes are
cross-site scripting through rendered test-case content, a weakness in the
Content-Security-Policy, or a supply-chain issue in the test tooling.

## Reporting

Please report security issues privately rather than opening a public issue:
use GitHub's **Report a vulnerability** button under the Security tab, or
contact the maintainer directly.

Include the affected file or page, the steps to reproduce, and what you were
able to demonstrate. A proof of concept is welcome but not required.

## Scope

In scope:

- Cross-site scripting or HTML injection via test-case data, imported
  progress files, or assessor notes
- Content-Security-Policy bypass
- Anything causing data loss from a user's saved engagement
- Supply-chain issues in `tests/` or `tools/`

Not in scope:

- Findings that require a compromised browser or a malicious extension
- The absence of a backend security control, since there is no backend
- Content accuracy of individual test cases — please open a normal issue
  for those, they are welcome

## Expectations

This is a personally maintained open-source project, not a funded programme.
There is no bounty. Reports will be acknowledged and addressed on a
best-effort basis, and credit is given in the changelog unless you prefer
otherwise.
