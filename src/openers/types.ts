import type { EditorView } from '../tab/types.js';

// Capabilities an opener may use, supplied by the dispatcher (the Controller). Kept deliberately
// narrow so an opener can only use its declared presentation capabilities and never reaches into
// controller internals. This is what keeps the
// dispatcher closed for modification while the opener registry stays open for extension.
export type OpenContext = {
  // Append a confirmation/error line to the originating tab's transcript.
  note: (text: string) => void;
  // Create and focus an in-app plain-text editor tab.
  openEditorTab: (view: EditorView) => string;
  // Register a local file to be served to the web client; returns the app-relative ref to load it.
  registerFile: (absPath: string) => string;
  // Hand a file to the operating system's default viewer (detached). Returns false when no viewer
  // could be launched on this platform.
  openExternally: (absPath: string) => boolean;
  runPluginOpener: (
    pluginId: string,
    presentation: 'inline' | 'external' | 'edit',
    file: string,
  ) => Promise<void>;
};

// An opener handles one family of file types. Supporting a new type means registering one new
// opener (in `src/openers/index.ts`) — nothing else changes.
export interface Opener {
  // Identifier for the opener (e.g. 'markdown').
  name: string;
  // The file extensions this opener claims, lowercased and dot-prefixed (e.g. '.png').
  extensions: string[];
  // Whether `edit <file>` belongs to this opener rather than to the plain-text editor. Read from the
  // registry alone, so resolving it never activates the plugin behind a claim.
  editsOwnFiles?: boolean;
  editGesture?: 'open external';
  // Hand the file to a program outside the app.
  external: (file: string, context: OpenContext) => void | Promise<void>;
  // Perform an in-app UI action for the file (e.g. open a tab).
  inline: (file: string, context: OpenContext) => void | Promise<void>;
}
