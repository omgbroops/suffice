import {connectOverlayScrollbar} from './overlay-scrollbar.js';
import { icon } from './ui.js';
import {showPopover,hidePopover} from './popover-motion.js';
import {createCollectionNavigation} from './components/ui/collection-navigation.js';

// Shared compact menus, including hover/click submenus and keyboard traversal.
export function createMenu(element) {
  const lifecycle=new AbortController();
  const listen=(target,type,callback,options={})=>target.addEventListener(type,callback,{...options,signal:lifecycle.signal});
  let trigger = null, keyboard = false, panels = [], hoverTimer;
  const headings = { 'model-menu': 'Model speed', 'agent-menu': 'Mode', 'repo-menu': 'Repository', shortcuts: 'Prompt shortcuts', attach: 'Add context', 'workspace-menu': 'Workspace', 'send-menu': 'Session' };
  const escape = (value) => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const cancelHover = () => clearTimeout(hoverTimer);
  function closeFrom(depth) {
    cancelHover();
    while (panels.length > depth) {
      const panel = panels.pop();
      panel.navigation?.destroy();panel.disposeEdges?.();
      panel.trigger?.setAttribute('aria-expanded', 'false');
      if (panel.element === element) hidePopover(element);
      else hidePopover(panel.element,()=>panel.element.remove());
    }
  }
  function close(restoreFocus = false) {
    closeFrom(0);
    trigger?.setAttribute('aria-expanded', 'false');
    if (restoreFocus) trigger?.focus({ preventScroll: true });
  }
  function focusPanel(panel) {
    (panel.element.querySelector('[aria-checked="true"]') || panel.element.querySelector('button'))?.focus();
  }
  function child(button, item, depth, focus = false) {
    cancelHover();
    if (panels[depth]?.trigger === button) { if (focus) focusPanel(panels[depth]); return; }
    closeFrom(depth);
    const node = document.createElement('div');
    node.className = 'popover popover--submenu'; node.id = `popover-submenu-${depth}`;
    document.body.append(node);
    const panel = { element: node, trigger: button, depth };
    panels.push(panel);
    render(panel, typeof item.children === 'function' ? item.children() : item.children, item.label, false);
    button.setAttribute('aria-expanded', 'true');
    button.setAttribute('aria-controls', node.id);
    const rect = button.getBoundingClientRect();
    const viewport = document.documentElement.clientWidth;
    const right = rect.right + 6;
    const left = right + node.offsetWidth <= viewport - 12 ? right : rect.left - node.offsetWidth - 6;
    node.style.left = `${Math.max(12, left)}px`;
    node.style.top = `${Math.max(12, Math.min(rect.top - 6, innerHeight - node.offsetHeight - 12))}px`;
    node.style.setProperty('--popover-origin', left < rect.left ? 'top right' : 'top left');
    showPopover(node);
    if (focus) focusPanel(panel);
  }
  function render(panel, items, heading, showHeading = true) {
    const node = panel.element;
    node.setAttribute('role', 'menu'); node.setAttribute('aria-label', heading);
    node.dataset.menuLevel = String(panel.depth); node.dataset.keyboard = String(keyboard);
    node.innerHTML = (showHeading ? `<div class="popover-heading" aria-hidden="true">${escape(heading)}</div>` : '') + '<div class="menu-options">' + items.map((item, index) => {
      const { label, detail, action, selected, separator, children } = item;
      const selectable = typeof selected === 'boolean';
      return `${separator ? '<div class="menu-separator" role="separator"></div>' : ''}<button type="button" role="${selectable ? 'menuitemradio' : 'menuitem'}" ${selectable ? `aria-checked="${selected}"` : ''} aria-label="${escape(label)}" ${detail ? `title="${escape(detail)}" aria-description="${escape(detail)}"` : ''} ${children ? 'aria-haspopup="menu" aria-expanded="false"' : ''} tabindex="-1" ${item.disabled ? 'disabled aria-disabled="true"' : ''} class="menu-item" data-menu-index="${index}" ${children ? 'data-submenu-trigger' : `data-menu-action="${escape(action)}"`}><span class="menu-label">${escape(label)}</span>${selectable ? icon('tick', selected ? 'menu-check' : 'menu-check menu-check--empty') : ''}${children ? icon('chevron', 'menu-chevron') : ''}</button>`;
    }).join('')+'</div>';
    panel.disposeEdges=connectOverlayScrollbar(node.querySelector('.menu-options'),{variant:'menu'});
    node.addEventListener('pointerenter', cancelHover);
    for (const button of node.querySelectorAll('button')) {
      const item = items[Number(button.dataset.menuIndex)];
      if(item.leading)button.prepend(item.leading());
      if(!button.title)button.title=item.label;
      if(item.icon)button.insertAdjacentHTML('afterbegin',icon(item.icon));
      button.addEventListener('pointerenter', e => {
        if (e.pointerType !== 'mouse') return;
        cancelHover();
        hoverTimer = setTimeout(() => item.children ? child(button, item, panel.depth + 1) : closeFrom(panel.depth + 1), item.children ? 90 : 160);
      });
      if (item.children) {
        button.addEventListener('click', () => child(button, item, panel.depth + 1, keyboard));
        button.addEventListener('keydown', e => {
          if (e.key === 'ArrowRight') { e.preventDefault(); child(button, item, panel.depth + 1, true); }
        });
      }
    }
    panel.navigation=createCollectionNavigation(node);
    panel.navigation.sync();
  }
  function open(button, items, title) {
    if (trigger?.getAttribute('aria-expanded')==='true' && trigger === button) { close(true); return; }
    close(); trigger = button;
    const owner = button.dataset.action;
    button.setAttribute('aria-haspopup', 'menu'); button.setAttribute('aria-expanded', 'true'); button.setAttribute('aria-controls', element.id);
    const panel = { element, trigger: button, depth: 0 }; panels.push(panel);
    render(panel, items, title || headings[owner] || 'Options');
    element.hidden = false;element.style.setProperty('--menu-max-height',`${Math.min(420,innerHeight-24)}px`);
    const rect = button.getBoundingClientRect();
    const endAligned = ['model-menu', 'repo-menu', 'send-menu'].includes(owner);
    const left = Math.max(12, Math.min(endAligned ? rect.right - element.offsetWidth : rect.left, document.documentElement.clientWidth - element.offsetWidth - 12));
    const aboveRoom=Math.max(80,rect.top-20),belowRoom=Math.max(80,innerHeight-rect.bottom-20);const above=belowRoom<Math.min(element.scrollHeight,260)&&aboveRoom>belowRoom;element.style.setProperty('--menu-max-height',`${Math.min(420,above?aboveRoom:belowRoom)}px`);
    element.style.left = `${left}px`;
    element.style.top = `${Math.max(12, above ? rect.top - element.offsetHeight - 8 : rect.bottom + 8)}px`;
    element.style.setProperty('--popover-origin', `${above ? 'bottom' : 'top'} ${endAligned ? 'right' : 'left'}`);
    showPopover(element);
    if (keyboard) focusPanel(panel);
  }
  listen(document,'pointerdown', e => {
    keyboard = false;
    if (!element.hidden && !panels.some(p => p.element.contains(e.target)) && !trigger?.contains(e.target)) close();
  }, {capture:true});
  listen(document,'keydown', e => {
    keyboard = true;
    if (element.hidden || !panels.length) return;
    const depth = Number(e.target.closest?.('[data-menu-level]')?.dataset.menuLevel || 0);
    const panel = panels[depth] || panels[0];
    if (e.key === 'Escape' || (e.key === 'ArrowLeft' && depth > 0)) {
      e.preventDefault();
      if (depth > 0) { const parent = panel.trigger; closeFrom(depth); parent.focus(); }
      else close(true);
      return;
    }
    if (e.key === 'Tab') { close(); return; }
    panel.navigation.keydown(e);
  });
  listen(window,'resize', () => close());
  listen(window,'scroll', () => close(), { passive: true });
  return { open, close, destroy(){close();lifecycle.abort();} };
}
