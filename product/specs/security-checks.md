# Security checks

`npm run security` is the developer security gate. It runs the secrets scan, then the dependency vulnerability audit.

### Secrets scan

`npm run security:secrets` scans the working tree and git history for committed credentials with gitleaks, a standalone tool installed separately from the project's npm dependencies. When gitleaks is installed, its own output appears unchanged and the command exits with gitleaks's own status, so a reported leak fails the command and stops the gate.

When gitleaks is not installed, the command does not fail. It prints a warning that gitleaks is not installed and secrets were not scanned, says how to install it, and exits successfully. The security gate then goes on to the dependency audit.

### Dependency audit

`npm run security:deps` audits the locked production dependencies for known vulnerabilities.
