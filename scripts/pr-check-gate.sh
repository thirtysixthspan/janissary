#!/bin/bash
# Run the full check gate. Exit non-zero if it fails.
# This is the end-of-work gate (lint, typecheck, full test suite, quality,
# duplication, dead-code) — correct to run here, unlike during development.

npm run check 2>&1
