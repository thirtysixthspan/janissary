import { defineConfig } from "vitepress";

export default defineConfig({
  title: "Janissary",
  description: "Public documentation for Janissary",
  srcDir: ".",
  themeConfig: {
    nav: [{ text: "Guide", link: "/" }],
    sidebar: [
      {
        text: "Introduction",
        items: [{ text: "Getting Started", link: "/" }],
      },
    ],
    socialLinks: [],
  },
});
