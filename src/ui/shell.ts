// Shared by every page: styles and the theme control in the header.

import '../styles/tokens.css';
import '../styles/base.css';
import '../styles/components.css';
import { initThemeControl } from './settings';

export function initShell(): void {
  initThemeControl();
}
