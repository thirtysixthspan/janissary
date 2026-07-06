commands.md
execute /ai/improve-modularity.md and if changes are successful execute ./ai/merge-change-to-master.md 

schedule improve-modularity in opencode every 15m send quality execute /ai/improve-modularity.md and if changes are successful execute ./ai/merge-change-to-master.md



schedule improve-test-coverage in claude every 15m execute ./ai/improve-test-coverage.md and if changes are successful execute ./ai/merge-change-to-master.md
