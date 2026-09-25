// Markdown + TeX → static HTML at build time. KaTeX runs here, never in the browser.

import katex from 'katex';
import markdownit, { type MarkdownIt, type StateBlock, type StateInline } from 'markdown-it';
import type { Plugin } from 'vite';

function mathInline(state: StateInline, silent: boolean): boolean {
  const src = state.src;
  if (src[state.pos] !== '$' || src[state.pos + 1] === '$') return false;
  const start = state.pos + 1;
  if (start >= state.posMax || /\s/.test(src[start]!)) return false;
  let end = start;
  for (;;) {
    end = src.indexOf('$', end);
    if (end < 0 || end > state.posMax) return false;
    if (src[end - 1] === '\\') {
      end++;
      continue;
    }
    break;
  }
  if (/\s/.test(src[end - 1]!)) return false;
  if (!silent) {
    const token = state.push('math_inline', 'math', 0);
    token.content = src.slice(start, end);
  }
  state.pos = end + 1;
  return true;
}

function mathBlock(state: StateBlock, startLine: number, endLine: number, silent: boolean): boolean {
  const lineText = (n: number): string =>
    state.src.slice(state.bMarks[n]! + state.tShift[n]!, state.eMarks[n]);
  const first = lineText(startLine);
  if (!first.startsWith('$$')) return false;
  if (silent) return true;
  let content = '';
  let last = startLine;
  let found = false;
  const rest = first.slice(2).trim();
  if (rest.endsWith('$$') && rest.length >= 2) {
    content = rest.slice(0, -2);
    found = true;
  } else {
    if (rest) content = rest + '\n';
    for (let n = startLine + 1; n < endLine; n++) {
      const line = lineText(n).trim();
      if (line.endsWith('$$')) {
        content += line.slice(0, -2);
        last = n;
        found = true;
        break;
      }
      content += line + '\n';
    }
  }
  if (!found) return false;
  state.line = last + 1;
  const token = state.push('math_block', 'math', 0);
  token.block = true;
  token.content = content;
  token.map = [startLine, state.line];
  return true;
}

let md: MarkdownIt | null = null;

function renderer(): MarkdownIt {
  if (md) return md;
  md = markdownit({ html: false, typographer: true });
  md.inline.ruler.after('escape', 'math_inline', mathInline);
  md.block.ruler.after('blockquote', 'math_block', mathBlock, {
    alt: ['paragraph', 'reference', 'blockquote', 'list'],
  });
  md.renderer.rules.math_inline = (tokens, idx) =>
    katex.renderToString(tokens[idx]!.content, { throwOnError: true });
  md.renderer.rules.math_block = (tokens, idx) =>
    `<div class="math-block">${katex.renderToString(tokens[idx]!.content, { displayMode: true, throwOnError: true })}</div>\n`;
  return md;
}

/** Render a derivation. Throws on invalid TeX so a broken derivation fails the build. */
export function renderDerivation(source: string, file = 'derivation.md'): string {
  try {
    return renderer().render(source);
  } catch (e) {
    throw new Error(`${file}: ${(e as Error).message}`, { cause: e });
  }
}

/** In dev, reload the page when a derivation changes (derivations are not part of the module graph). */
export function derivationPlugin(): Plugin {
  return {
    name: 'ec-derivation',
    configureServer(server) {
      server.watcher.on('change', (file) => {
        if (file.replace(/\\/g, '/').endsWith('/derivation.md')) server.ws.send({ type: 'full-reload' });
      });
    },
  };
}
