import { describe, expect, it } from 'vitest';
import {
  commandReferenceSidebar,
  renderCommandPage,
  renderCommandPageContent,
} from '../documentation/.vitepress/command-reference.ts';

describe('commandReferenceSidebar', () => {
  it('escapes markup from help-page filenames and preserves route names', () => {
    const maliciousFilename = '`<img src=x onerror="alert(1)">.md';
    const maliciousName = maliciousFilename.slice(0, -'.md'.length);
    const sidebar = commandReferenceSidebar([maliciousName, 'profile']);

    expect(sidebar.items).toEqual([
      {
        text: '<code>`&lt;img src=x onerror=&quot;alert(1)&quot;&gt;</code>',
        link: `/user-documentation/command-reference/${maliciousName}`,
      },
      {
        text: '<code>profile</code>',
        link: '/user-documentation/command-reference/profile',
      },
    ]);
  });
});

describe('renderCommandPage', () => {
  it('escapes Markdown and HTML from filenames in generated headings', () => {
    const maliciousName = '`<img src=x onerror="alert(1)">';
    const page = renderCommandPageContent(maliciousName, '### command\n\nDescription', 0);

    expect(page).toContain(
      '# <code>`&lt;img src=x onerror=&quot;alert(1)&quot;&gt;</code>\n\n<img class="agent-float"',
    );
    expect(page).not.toMatch(/<img\b[^>]*\bonerror\s*=/i);
  });

  it('renders the ordinary profile page with its code heading and sprite', () => {
    const page = renderCommandPage('profile');

    expect(page).toMatch(/^# <code>profile<\/code>\n\n<img class="agent-float"/);
  });
});
