export function hasHelpMarkdownChanges(files) {
  return files.some((file) => file.startsWith('help/') && file.endsWith('.md'));
}
