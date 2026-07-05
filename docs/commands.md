commands.md
execute /ai/improve-quality.md and if changes are successful execute ./ai/merge-change-to-master.md 

schedule improve-quality in opencode every 15m send quality execute /ai/improve-quality.md and if changes are successful execute ./ai/merge-change-to-master.md



schedule ./ai/improve-test-coverage.md in opencode every 15m execute /ai/improve-coverage.md and if changes are successful execute ./ai/merge-change-to-master.md
