/* global engine */
'use strict';

const title = {
  'directory-view-1': '...',
  'directory-view-2': '...'
};

/* events */
// persist last visited paths and update title
document.addEventListener('directory-view:path', e => {
  const {detail} = e;
  const id = e.target.getAttribute('id');
  title[id] = detail.arr[detail.arr.length - 1].title;
  document.title = title['directory-view-1'] + ' | ' + title['directory-view-2'];
  engine.storage.set({
    [id]: detail.id
  });
});
// user-action
document.addEventListener('directory-view:submit', e => {
  const {detail} = e;
  detail.entries.forEach(o => {
    if (o.type === 'DIRECTORY' && detail.entries.length === 1) {
      e.target.build(detail.entries[0].id);
    }
    else if (o.type === 'FILE') {
      if (detail.metaKey || detail.ctrlKey) {
        engine.tabs.create({
          url: o.url,
          active: false
        });
      }
      else {
        engine.tabs.create({
          url: o.url
        });
      }
    }
  });
});
document.addEventListener('directory-view:selection-changed', () => views.changed());
document.addEventListener('tools-view:command', e => command(e.detail));

/* views */
const views = {
  'parent': document.getElementById('directories'),
  'left': document.getElementById('directory-view-1'),
  'right': document.getElementById('directory-view-2'),
  active(reverse = false) {
    if (reverse) {
      return document.querySelector('input:not(:checked) + directory-view');
    }
    return document.querySelector('input:checked + directory-view');
  },
  changed() {
    const active = views.active();
    const direction = active === views.left ? 'LEFT' : 'RIGHT';
    const entries = active.entries();

    const readonly = entries.some(o => o.readonly === true);
    const directory = entries.some(o => o.type === 'DIRECTORY');
    const file = entries.some(o => o.type === 'FILE');
    const mirror = views.left.id() === views.right.id();

    // move-left or move-right
    if (readonly || mirror) {
      toolsView.state('move-left', false);
      toolsView.state('move-right', false);
    }
    else {
      /* move-left */
      {
        let move = direction === 'RIGHT';
        // cannot move to the root directory
        if (move && views.left.isRoot()) {
          move = false;
        }
        // cannot move a directory to a child directory
        if (move && directory) {
          const d = views.left.list();
          if (views.right.list().every((node, i) => d[i] && d[i].id === node.id)) {
            move = false;
          }
        }
        toolsView.state('move-left', move);
      }
      /* move-right */
      {
        let move = direction === 'LEFT';
        // cannot move to the root directory
        if (move && views.right.isRoot()) {
          move = false;
        }
        // cannot move a directory to a child directory
        if (move && directory) {
          const d = views.right.list();
          if (views.left.list().every((node, i) => d[i] && d[i].id === node.id)) {
            move = false;
          }
        }
        toolsView.state('move-right', move);
      }
    }
    // delete
    toolsView.state('trash', readonly === false);
    // copy-link
    toolsView.state('copy-link', file);
    // edit-link
    toolsView.state('edit-link', readonly === false && file && entries.length === 1);
    // edit-title
    toolsView.state('edit-title', readonly === false && entries.length === 1);
    // new-file
    toolsView.state('new-file', active.isRoot() === false);
    // new-directory
    toolsView.state('new-directory', active.isRoot() === false);
  },
  update() {
    views.left.update(views.left.id());
    views.right.update(views.right.id());
  }
};
const toolsView = document.getElementById('tools-view');

/* restore */
document.addEventListener('DOMContentLoaded', engine.storage.get({
  'directory-view-1': '',
  'directory-view-2': ''
}).then(prefs => {
  Object.entries(prefs).forEach(([name, id], i) => {
    const e = document.getElementById(name);
    if (e) {
      e.build(id);
    }
    if (i === 0) {
      e.click();
    }
  });
}));
/* on command */
const command = async command => {
  const view = views.active();
  if (view) {
    const entries = view.entries();
    // copy-title
    if (command === 'copy-title') {
      engine.clipboard.copy(entries.map(o => o.title).join('\n'));
    }
    // copy-id
    else if (command === 'copy-id') {
      engine.clipboard.copy(entries.map(o => o.id).join('\n'));
    }
    // copy-link
    else if (command === 'copy-link') {
      engine.clipboard.copy(entries.map(o => o.url).filter(a => a).join('\n'));
    }
    // edit-title
    else if (command === 'edit-title' || command === 'edit-link') {
      const entry = entries[0];
      let o = {};
      if (command === 'edit-title') {
        const title = window.prompt('Edit Title', entry.title);
        o = {title};
        if (title === entry.title || title === '') {
          return;
        }
      }
      else {
        const url = window.prompt('Edit Link', entry.url);
        o = {url};
        if (url === entry.url || url === '') {
          return;
        }
      }
      engine.bookmarks.update(entry.id, o).catch(engine.notify).finally(() => {
        // we need to update both views
        views.update();
      });
    }
    else if (command === 'move-left' || command === 'move-right') {
      const s = {
        view: command === 'move-left' ? views.right : views.left
      };
      s.parent = s.view.id();
      s.entries = s.view.entries();
      const d = {
        view: command === 'move-right' ? views.right : views.left
      };
      d.parent = d.view.id();
      d.index = d.view.entries()[0].index + 1;
      for (const entry of s.entries) {
        await engine.bookmarks.move(entry.id, {
          parentId: d.parent,
          index: d.index
        }).catch(engine.notify);
      }
      // update both views
      views.update();
    }
    else if (command === 'root') {
      engine.storage.set({
        'directory-view-1': '',
        'directory-view-2': ''
      }).then(() => location.reload());
    }
    else if (command === 'new-file' || command === 'new-directory') {
      const entry = entries[0];
      const o = {
        parentId: view.id(),
        index: entry.index + 1
      };
      if (command === 'new-file') {
        const [title, url] = (window.prompt(
          'New Bookmark',
          entry.title + ',' + (entry.url || 'https://www.example.com')
        ) || '').split(',').map(a => a.trim());
        if (title && url) {
          o.title = title;
          o.url = url;
        }
        else {
          return;
        }
      }
      else {
        const title = ('' || window.prompt('New Directory', entry.title)).trim();
        if (title) {
          o.title = title;
        }
        else {
          return;
        }
      }
      engine.bookmarks.create(o).then(() => {
        // update both views
        views.update();
      }, engine.notify);
    }
    else if (command === 'trash') {
      for (const entry of entries) {
        await engine.bookmarks.remove(entry.id).catch(e => {
          if (entry.type === 'DIRECTORY') {
            if (window.confirm(`"${entry.title}" directory is not empty. Remove anyway?`)) {
              engine.bookmarks.remove(entry.id, true).catch(engine.notify);
            }
          }
          else {
            engine.notify(e);
          }
        });
      }
      views.update();
    }
  }
};

/* keyboard */
document.addEventListener('keydown', e => {
  // toggle between views by Tab
  if (e.key === 'Tab') {
    const view = views.active(true);
    e.preventDefault();
    if (view) {
      return view.click();
    }
  }
  // move to the left view with arrow key
  else if (e.code === 'ArrowLeft' && e.shiftKey === false && e.ctrlKey === false && e.metaKey === false) {
    views.left.click();
  }
  // move to the left view with arrow key
  else if (e.code === 'ArrowRight' && e.shiftKey === false && e.ctrlKey === false && e.metaKey === false) {
    views.right.click();
  }
  // toggle between views by Ctrl + Digit
  else if (e.code === 'Digit1' && (e.metaKey || e.ctrlKey)) {
    views.left.click();
    e.preventDefault();
  }
  else if (e.code === 'Digit2' && (e.metaKey || e.ctrlKey)) {
    views.right.click();
    e.preventDefault();
  }
  toolsView.command(e, command);
});
// on active view change
views.parent.addEventListener('change', e => {
  [...document.querySelectorAll('label.active')].forEach(e => e.classList.remove('active'));
  const label = e.target.closest('label');
  label.classList.add('active');
  views.changed();
});
