import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitepress";
import { trimAndScaleSprite } from "./sprite-trim";

// Decorative agent sprites floated in the doc pages (see .vitepress/theme/custom.css). They
// live in the repo's agent-images/ directory; copy the used facings into public/agents/ when
// the config loads, so `docs:dev` and `docs:build` both serve them at /agents/<name>.png
// without committing a second copy of the binaries (public/agents/ is gitignored). Each PNG is
// trimmed to the figure (dropping the source's transparent padding, so wrapped text sits close)
// and upscaled 2x with the pixels kept sharp; pages show them at this natural size.
const FACINGS = ["south", "south-east", "south-west"];
const SPRITE_SCALE = 2;

const pkg = JSON.parse(
  readFileSync(path.resolve(fileURLToPath(import.meta.url), "..", "..", "..", "package.json"), "utf-8"),
) as { version: string };

function copyAgentImages() {
  const docsRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const source = path.resolve(docsRoot, "..", "agent-images");
  if (!existsSync(source)) return;
  const target = path.join(docsRoot, "public", "agents");
  mkdirSync(target, { recursive: true });
  for (const character of readdirSync(source)) {
    if (character === "idris") continue;
    const characterDir = path.join(source, character);
    if (!statSync(characterDir).isDirectory()) continue;
    const sheet = readdirSync(characterDir).find((entry) =>
      statSync(path.join(characterDir, entry)).isDirectory(),
    );
    if (!sheet) continue;
    for (const facing of FACINGS) {
      const rotation = path.join(characterDir, sheet, "rotations", `${facing}.png`);
      if (!existsSync(rotation)) continue;
      const sprite = trimAndScaleSprite(readFileSync(rotation), SPRITE_SCALE);
      writeFileSync(path.join(target, `${character}-${facing}.png`), sprite);
    }
  }
  const animated = path.join(source, "archer-firing.gif");
  if (existsSync(animated)) cpSync(animated, path.join(target, "archer-firing.gif"));
}

copyAgentImages();

export default defineConfig({
  base: "/janissary/",
  title: "Janissary",
  description:
    "Documentation for Janissary, a tab-based terminal shell for working with AI agents — user guide and developer/contributor docs",
  srcDir: ".",
  themeConfig: {
    siteTitle: `Janissary (${pkg.version})`,
    nav: [
      { text: "User Docs", link: "/user-documentation/getting-started/application" },
      { text: "Developer Docs", link: "/developer-documentation/" },
    ],
    sidebar: {
      "/user-documentation/": [
        {
          text: "Getting Started",
          items: [
            { text: "What is Janissary?", link: "/user-documentation/getting-started/application" },
            { text: "Design principles", link: "/user-documentation/getting-started/design-principles" },
            { text: "Why the name \"Janissary\"?", link: "/user-documentation/getting-started/why-the-name" },
            { text: "Installing", link: "/user-documentation/getting-started/install" },
            { text: "Starting the app", link: "/user-documentation/getting-started/startup" },
            { text: "Tabs", link: "/user-documentation/getting-started/tabs" },
            { text: "Tab groups", link: "/user-documentation/getting-started/groups" },
            { text: "Agents", link: "/user-documentation/getting-started/agents" },
            { text: "Keyboard shortcuts", link: "/user-documentation/getting-started/keyboard" },
            { text: "License", link: "/user-documentation/getting-started/license" },
          ],
        },
        {
          text: "Command Bar",
          items: [
            { text: "Application commands", link: "/user-documentation/command-bar/commands" },
            { text: "Tab completion", link: "/user-documentation/command-bar/tab-completion" },
            { text: "Shell commands", link: "/user-documentation/command-bar/shell" },
            { text: "Browser automation", link: "/user-documentation/command-bar/browser" },
            { text: "Databases", link: "/user-documentation/command-bar/database" },
            { text: "Connections", link: "/user-documentation/command-bar/connections" },
            { text: "Command history", link: "/user-documentation/command-bar/history" },
            { text: "Command queue", link: "/user-documentation/command-bar/queue" },
            { text: "Task picker", link: "/user-documentation/command-bar/tasks" },
            { text: "Tab navigator", link: "/user-documentation/command-bar/tab-navigator" },
            { text: "Quick open", link: "/user-documentation/command-bar/quick-open" },
          ],
        },
        {
          text: "Tab Types",
          items: [
            { text: "Opening files and pages", link: "/user-documentation/tab-types/opening-files" },
            { text: "Image viewer", link: "/user-documentation/tab-types/image-viewer" },
            { text: "Markdown preview", link: "/user-documentation/tab-types/markdown-preview" },
            { text: "Embedded web pages", link: "/user-documentation/tab-types/web-pages" },
            { text: "Editor", link: "/user-documentation/tab-types/editor" },
            { text: "File navigator", link: "/user-documentation/tab-types/file-navigator" },
            { text: "Notifications", link: "/user-documentation/tab-types/notifications" },
          ],
        },
        {
          text: "Advanced Agents",
          items: [
            { text: "Harness tabs", link: "/user-documentation/advanced-agents/harness" },
            { text: "Workspacing", link: "/user-documentation/advanced-agents/workspacing" },
            { text: "Workspaced agents", link: "/user-documentation/advanced-agents/workspaced-agent" },
            { text: "ACP agents", link: "/user-documentation/advanced-agents/acp-agent" },
          ],
        },
        {
          text: "Automation",
          items: [
            { text: "Scheduling", link: "/user-documentation/automation/scheduling" },
            { text: "Profiles", link: "/user-documentation/automation/profiles" },
          ],
        },
        {
          text: "Workflows",
          items: [
            { text: "Product development workflow", link: "/user-documentation/workflows/product-development" },
          ],
        },
      ],
      "/developer-documentation/": [
        {
          text: "Developer Docs",
          items: [
            { text: "Overview", link: "/developer-documentation/" },
            { text: "Contributing", link: "/developer-documentation/contributing" },
            { text: "Documentation", link: "/developer-documentation/documentation" },
            { text: "Release process", link: "/developer-documentation/release-process" },
            { text: "Testing", link: "/developer-documentation/testing" },
            { text: "Checking changes", link: "/developer-documentation/checking-changes" },
            { text: "Code coverage", link: "/developer-documentation/code-coverage" },
            { text: "Code quality", link: "/developer-documentation/code-quality" },
            { text: "Code duplication", link: "/developer-documentation/code-duplication" },
            { text: "CSS linting", link: "/developer-documentation/css-linting" },
            { text: "Dead code", link: "/developer-documentation/dead-code" },
            { text: "Security checks", link: "/developer-documentation/security-checks" },
            { text: "Linting", link: "/developer-documentation/linting" },
            { text: "Commit conventions", link: "/developer-documentation/commit-conventions" },
            { text: "Workspace sandbox", link: "/developer-documentation/workspace-sandbox" },
          ],
        },
      ],
    },
    socialLinks: [
      { icon: "github", link: "https://github.com/thirtysixthspan/janissary" },
    ],
  },
});
