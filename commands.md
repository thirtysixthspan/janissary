commands.md
execute /ai/improve-modularity.md and if changes are successful execute ./ai/merge-change-to-master.md 

schedule improve-modularity in opencode every 15m send quality execute ./ai/improve-modularity.md and if changes are successful execute ./ai/merge-change-to-master.md

schedule fix-it in claude every 30m execute ./ai/fix-a-small-issue.md


schedule improve-test-coverage in opencode every 30m execute ./ai/improve-test-coverage.md and if changes are successful execute ./ai/merge-change-to-master.md

execute ./ai/remove-duplication.md and if changes are successful execute ./ai/merge-change-to-master.md

execute ./ai/reduce-complexity.md and if changes are successful execute ./ai/merge-change-to-master.md

schedule complexity in opencode every 15m execute ./ai/reduce-complexity.md and if changes are successful execute ./ai/merge-change-to-master.md

schedule issues in claude every 15m execute ./ai/fix-a-small-issue.md