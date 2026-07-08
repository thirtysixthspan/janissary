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
  title: "Janissary",
  description: "User documentation for Janissary, a tab-based terminal shell for working with AI agents",
  srcDir: ".",
  themeConfig: {
    nav: [{ text: "Guide", link: "/getting-started/application" }],
    sidebar: [
      {
        text: "Getting Started",
        items: [
          { text: "What is Janissary?", link: "/getting-started/application" },
          { text: "Design principles", link: "/getting-started/design-principles" },
          { text: "Why the name \"Janissary\"?", link: "/getting-started/why-the-name" },
          { text: "Prerequisites", link: "/getting-started/prerequisites" },
          { text: "Starting the app", link: "/getting-started/startup" },
          { text: "Tabs", link: "/getting-started/tabs" },
          { text: "Tab groups", link: "/getting-started/groups" },
          { text: "Agents", link: "/getting-started/agents" },
          { text: "Keyboard shortcuts", link: "/getting-started/keyboard" },
        ],
      },
      {
        text: "Command Bar",
        items: [
          { text: "Application commands", link: "/command-bar/commands" },
          { text: "Tab completion", link: "/command-bar/tab-completion" },
          { text: "Shell commands", link: "/command-bar/shell" },
          { text: "Command history", link: "/command-bar/history" },
          { text: "Tab navigator", link: "/command-bar/tab-navigator" },
        ],
      },
      {
        text: "Tab Types",
        items: [
          { text: "Opening files and pages", link: "/tab-types/opening-files" },
          { text: "Image viewer", link: "/tab-types/image-viewer" },
          { text: "Markdown preview", link: "/tab-types/markdown-preview" },
          { text: "Embedded web pages", link: "/tab-types/web-pages" },
          { text: "Editor", link: "/tab-types/editor" },
          { text: "File navigator", link: "/tab-types/file-navigator" },
        ],
      },
      {
        text: "Advanced Agents",
        items: [
          { text: "Harness tabs", link: "/advanced-agents/harness" },
          { text: "Workspacing", link: "/advanced-agents/workspacing" },
          { text: "Workspaced agents", link: "/advanced-agents/workspaced-agent" },
        ],
      },
      {
        text: "Automation",
        items: [
          { text: "Scheduling", link: "/automation/scheduling" },
          { text: "Profiles", link: "/automation/profiles" },
        ],
      },
    ],
    socialLinks: [],
  },
});
