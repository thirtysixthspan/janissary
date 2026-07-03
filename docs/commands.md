commands.md
execute /ai/improve-quality.md and if changes are successful execute ./ai/merge-change-to-master.md 

schedule improve-quality in opencode every 15m send quality execute /ai/improve-quality.md and if changes are successful execute ./ai/merge-change-to-master.md

schedule small-fix in opencode every 30m execute ./ai/fix-a-small-issue.md

