const MARKDOWN_EXTENSION = /\.(md|markdown)$/i;

// The one rule for what activating a file row asks the opener registry for, shared by double-click
// and the keyboard so the two cannot drift: `true` asks for the file's edit route, `false` for its
// open route. Shift flips the default. A Markdown file is the exception — its plain activation edits
// the text and Shift reaches the rendered preview — so the default is inverted for it.
export function fileActivation(path: string, shift: boolean): boolean {
  return MARKDOWN_EXTENSION.test(path) !== shift;
}
