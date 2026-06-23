// A command typed without a prefix may still be a shell command, a SQL/db query, or an agent
// (acp) prompt. Each route has a "command recognizer" that reads the raw command and reports
// whether it looks like that route and how reliable the guess is. The analysis module
// (`analyze.ts`) polls every recognizer and routes by the most reliable match.

export type CommandRoute = 'shell' | 'db' | 'acp';

// Context a recognizer may consult beyond the raw text. The db route is only viable when the
// current tab actually has an open database connection to run against.
export type RecognizerContext = {
  // Names of sqlite databases with an open connection in the current tab.
  openDbs: string[];
};

// A recognizer's verdict: whether the command matches its route, and a 0–1 reliability estimate.
export type Recognition = {
  match: boolean;
  reliability: number;
};

export type CommandRecognizer = {
  route: CommandRoute;
  recognize: (cmd: string, ctx: RecognizerContext) => Recognition;
};

// One option in the route-chooser window. `dbName` is set only for `db` choices (the database
// the query will run against).
export type RouteChoice = {
  label: string;
  route: CommandRoute;
  dbName?: string;
};
