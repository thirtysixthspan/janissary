commands.md
execute /ai/tasks/hygiene/improve-modularity.md and if changes are successful execute ./ai/tasks/merge-change-to-master.md 

schedule improve-modularity in opencode every 15m send quality execute ./ai/tasks/hygiene/improve-modularity.md and if changes are successful execute ./ai/tasks/merge-change-to-master.md

schedule fix-it in claude every 30m execute ./ai/tasks/fix-an-issue.md


schedule improve-test-coverage in opencode every 30m execute ./ai/tasks/hygiene/improve-test-coverage.md and if changes are successful execute ./ai/tasks/merge-change-to-master.md

execute ./ai/tasks/hygiene/remove-duplication.md and if changes are successful execute ./ai/tasks/merge-change-to-master.md

execute ./ai/tasks/hygiene/reduce-complexity.md and if changes are successful execute ./ai/tasks/merge-change-to-master.md

schedule complexity in opencode every 15m execute ./ai/tasks/hygiene/reduce-complexity.md and if changes are successful execute ./ai/tasks/merge-change-to-master.md

schedule issues in claude every 15m execute ./ai/tasks/fix-an-issue.md