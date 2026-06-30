#!/bin/bash
# Check if there are uncommitted changes or commits ahead of master
git status --porcelain 2>&1 && echo "---" && git log --oneline origin/master..HEAD 2>&1
