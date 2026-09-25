import type { CalculatorMeta } from '../types';

// `npm run new-calc <id>` copies this folder and replaces __ID__ and __TITLE__.
export default {
  id: '__ID__',
  title: '__TITLE__',
  category: 'filters',
  summary:
    'One sentence describing what this calculator designs; it is shown on the home page card and in search results.',
  keywords: ['keyword', 'another keyword', 'common misspelling'],
} satisfies CalculatorMeta;
