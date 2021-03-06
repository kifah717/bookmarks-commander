/* global engine */

class ListView extends HTMLElement {
  constructor() {
    super();
    const shadow = this.attachShadow({
      mode: 'open'
    });
    shadow.innerHTML = `
      <style>
        :host {
          border: solid 1px #cacaca;
          user-select: none;
        }
        :host(.active) {
          background-color: #fff;
        }
        #content {
          outline: none;
          height: 100%;
          overflow: auto;
        }
        div.entry {
          padding: 1px 0;
          display: grid;
          grid-template-columns: 32px minmax(32px, var(--name-width, 200px)) minmax(32px, 1fr) minmax(32px, var(--added-width, 90px)) minmax(32px, var(--modified-width, 90px));
        }
        #content[data-path=true] div.entry {
          grid-template-columns: 32px minmax(32px, 200px) minmax(32px, 1fr) minmax(32px, 1fr);
        }
        div.entry span {
          text-indent: 5px;
          padding: 2px 0;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          pointer-events: none;
        }
        div.entry.hr {
          border-bottom: solid 1px #e8e3e9;
          position: sticky;
          top: 0;
          background: #f5f5f5;
        }
        div.entry.hr span {
          pointer-events: none;
          width: 100%;
        }
        div.entry.hr > div {
          display: flex;
          align-items: center;
        }
        div.entry.hr i {
          width: 2px;
          background-color: #e8e3e9;
          display: inline-block;
          height: 12px;
          cursor: col-resize;
        }
        div.entry:not(.hr):nth-child(even) {
          background-color: #f5f5f5;
        }
        div.entry[data-selected=true] {
          background-color: #c0e7ff !important;
        }
        #content[data-path=true] div.entry [data-id=added],
        #content[data-path=true] div.entry [data-id=modified] {
          display: none;
        }
        #content:not([data-path=true]) div.entry [data-id=path] {
          display: none;
        }
        div.entry [data-id="icon"] {
          background-size: 16px;
          background-repeat: no-repeat;
          background-position: center center;
        }
        div.entry[data-type="DIRECTORY"] [data-id="icon"] {
          background-image: url('/data/commander/images/directory.svg');
        }
        div.entry[data-type="DIRECTORY"][data-readonly="true"] [data-id="icon"] {
          background-image: url('/data/commander/images/directory-readonly.svg');
        }
        div.entry[data-type="ERROR"] [data-id="icon"] {
          background-image: url('/data/commander/images/error.svg');
        }
        div.entry [data-id="added"],
        div.entry [data-id="modified"] {
          text-align: center;
        }
      </style>
      <style id="styles"></style>
      <template>
        <div class="entry">
          <span data-id="icon"></span>
          <span data-id="name"></span>
          <span data-id="path"></span>
          <span data-id="href"></span>
          <span data-id="added"></span>
          <span data-id="modified"></span>
        </div>
      </template>
      <div id="content" tabindex="-1">
        <div class="entry hr">
          <div data-id="icon"><span></span></div>
          <div data-id="name"><i></i><span>Name</span></div>
          <div data-id="path"><i></i><span>Path</span></div>
          <div data-id="href"><i></i><span>Link</span></div>
          <div data-id="added"><i></i><span>Added</span></div>
          <div data-id="modified"><i></i><span>Modified</span></div>
        </div>
      </div>
    `;

    this.template = shadow.querySelector('template');
    this.content = shadow.getElementById('content');

    this.content.addEventListener('focus', () => this.classList.add('active'));
    this.content.addEventListener('blur', () => {
      const active = this.shadowRoot.activeElement;
      // if document is not focused, keep the active view
      if (active === null) {
        this.classList.remove('active');
      }
    });

    this.config = {
      remote: false
    };

    shadow.addEventListener('click', e => {
      const {target} = e;
      if (target.classList.contains('entry') && target.classList.contains('hr') === false) {
        // single-click => toggle selection
        if (e.detail === 1 || e.detail === 0) {
          if (e.ctrlKey === false && e.metaKey === false && e.shiftKey === false) {
            this.items().forEach(e => e.dataset.selected = false);
          }
          // multiple select
          if (e.shiftKey) {
            const e = this.content.querySelector('.entry[data-last-selected=true]');
            const es = [...this.content.querySelectorAll('.entry')];
            if (e) {
              const i = es.indexOf(e);
              const j = es.indexOf(target);

              for (let k = Math.min(i, j); k < Math.max(i, j); k += 1) {
                es[k].dataset.selected = true;
              }
            }
          }
          // select / deselect on meta
          if (e.ctrlKey || e.metaKey) {
            target.dataset.selected = target.dataset.selected !== 'true';
          }
          else {
            target.dataset.selected = true;
          }
          for (const e of [...this.content.querySelectorAll('.entry[data-last-selected=true]')]) {
            e.dataset.lastSelected = false;
          }
          target.dataset.lastSelected = true;

          // scroll (only when e.isTrusted === false)
          if (e.isTrusted === false) {
            this.scroll(target);
          }
          this.emit('selection-changed');
        }
        // double-click => submit selection
        else {
          const e = Object.assign({}, target.node, target.dataset);
          if (e.id.startsWith('{')) {
            e.id = JSON.parse(e.id);
          }
          this.emit('submit', {
            shiftKey: e.shiftKey,
            ctrlKey: e.ctrlKey,
            metaKey: e.metaKey,
            entries: [e]
          });
        }
      }
    });
    // to prevent conflict with command access
    shadow.addEventListener('keyup', e => {
      if (e.code.startsWith('Key') || e.code.startsWith('Digit')) {
        const d = this.content.querySelector(`.entry[data-selected=true] ~ .entry[data-key="${e.key}"]`);
        if (d) {
          d.click();
        }
        else {
          const d = this.content.querySelector(`.entry[data-key="${e.key}"]`);
          if (d) {
            d.click();
          }
        }
      }
      else if (
        e.code === 'Backspace' &&
        e.shiftKey === false && e.altKey === false && e.metaKey === false && e.ctrlKey === false
      ) {
        const d = this.content.querySelector('.entry[data-index="-1"]');
        if (d) {
          this.dbclick(d);
        }
        else {
          engine.notify('beep');
        }
      }
    });
    shadow.addEventListener('keydown', e => {
      if (e.code === 'Enter') {
        const entries = this.entries();
        if (entries.length) {
          this.emit('submit', {
            shiftKey: e.shiftKey,
            ctrlKey: e.ctrlKey,
            metaKey: e.metaKey,
            entries
          });
        }
      }
    });
    // keyboard navigation
    shadow.addEventListener('keydown', e => {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const meta = e.metaKey || e.ctrlKey || e.shiftKey;
        const reverse = (e.metaKey && e.shiftKey) || (e.ctrlKey && e.shiftKey);
        this[e.key === 'ArrowUp' ? 'previous' : 'next'](meta, reverse);
      }
    });
  }
  query(q) {
    return this.content.querySelector(q);
  }
  select(e, metaKey = false) {
    const event = document.createEvent('MouseEvent');
    event.initMouseEvent('click', true, true, window, 0, 0, 0, 0, 0, metaKey, false, false, metaKey, 0, null);
    e.dispatchEvent(event);
  }
  previous(metaKey = false, reverse = false) {
    if (reverse) {
      const es = this.content.querySelectorAll('.entry[data-selected=true]');
      if (es.length > 1) {
        es[0].dataset.selected = false;
      }
    }
    else {
      const e = this.content.querySelector('.entry:not(.hr) + .entry[data-selected=true]');
      if (e) {
        this.select(e.previousElementSibling, metaKey);
      }
    }
  }
  next(metaKey = false, reverse = false) {
    if (reverse) {
      const es = this.content.querySelectorAll('.entry[data-selected=true]');
      if (es.length > 1) {
        es[es.length - 1].dataset.selected = false;
      }
    }
    else {
      const e = [...this.content.querySelectorAll('.entry[data-selected=true] + .entry')].pop();
      if (e) {
        this.select(e, metaKey);
      }
    }
  }
  items(selected = true) {
    if (selected) {
      return [...this.content.querySelectorAll('.entry[data-selected=true]')];
    }
    return [...this.content.querySelectorAll('.entry[data-index]:not([data-index="-1"])')];
  }
  entries(selected = true) {
    return this.items(selected).map(target => {
      const o = Object.assign({}, target.node, target.dataset);
      // id is from search
      if (target.dataset.id.startsWith('{')) {
        o.id = JSON.parse(target.dataset.id);
      }
      return o;
    });
  }
  emit(name, detail) {
    return this.dispatchEvent(new CustomEvent(name, {
      bubbles: true,
      detail
    }));
  }
  dbclick(e) {
    return e.dispatchEvent(new CustomEvent('click', {
      detail: 2,
      bubbles: true
    }));
  }
  favicon(href) {
    if (typeof InstallTrigger !== 'undefined') {
      if (this.config.remote) {
        return 'http://www.google.com/s2/favicons?domain_url=' + href;
      }
      else {
        return '/data/commander/images/page.svg';
      }
    }
    return 'chrome://favicon/' + href;
  }
  date(ms) {
    if (ms) {
      return (new Date(ms)).toLocaleDateString();
    }
    return '';
  }
  clean() {
    [...this.content.querySelectorAll('.entry:not(.hr)')].forEach(e => e.remove());
  }
  // ids of selected elements
  build(nodes, err, ids = []) {
    this.clean();

    // remove unknown ids
    ids = ids.filter(id => nodes.some(n => n.id === id));

    const f = document.createDocumentFragment();
    if (err) {
      const clone = document.importNode(this.template.content, true);
      clone.querySelector('[data-id="name"]').textContent = err.message;
      clone.querySelector('div').dataset.type = 'ERROR';
      f.appendChild(clone);
    }
    else {
      for (const node of nodes) {
        const clone = document.importNode(this.template.content, true);
        clone.querySelector('[data-id="name"]').textContent = node.title;
        clone.querySelector('[data-id="href"]').textContent = node.url;
        clone.querySelector('[data-id="path"]').textContent = node.relativePath;
        clone.querySelector('[data-id="added"]').textContent = this.date(node.dateAdded);
        clone.querySelector('[data-id="modified"]').textContent = this.date(node.dateGroupModified);
        const type = node.url ? 'FILE' : 'DIRECTORY';
        const div = clone.querySelector('div');
        Object.assign(div.dataset, {
          key: node.title ? node.title[0].toLowerCase() : '',
          type,
          index: node.index,
          id: typeof node.id === 'string' ? node.id : JSON.stringify(node.id),
          readonly: node.readonly || false
        });
        div.node = node;
        div.dataset.selected = ids.length ? ids.indexOf(node.id) !== -1 : node === nodes[0];
        if (type === 'FILE') {
          clone.querySelector('[data-id="icon"]').style['background-image'] = `url(${this.favicon(node.url)})`;
        }
        f.appendChild(clone);
      }
    }
    this.content.appendChild(f);
    // scroll the first selected index into the view
    if (ids.length) {
      const e = this.content.querySelector(`[data-id="${ids[0]}"`);
      if (e) {
        this.scroll(e);
      }
    }

    this.emit('selection-changed');
  }
  mode(o) {
    this.content.dataset.path = Boolean(o.path);
  }
  // refresh the list while keeping selections
  update(nodes, err) {
    const ids = [...this.content.querySelectorAll('[data-selected="true"]')]
      .map(e => e.dataset.id)
      // make sure ids are still present
      .filter(id => nodes.some(n => n.id === id));
    return this.build(nodes, err, ids);
  }
  // content is the only focusable element
  focus() {
    this.content.focus();
  }
  scroll(target) {
    const hr = this.content.querySelector('.hr').getBoundingClientRect();
    const bounding = target.getBoundingClientRect();
    // do we need scroll from top
    if (bounding.top < hr.top + hr.height) {
      target.scrollIntoView({
        block: 'start'
      });
      this.content.scrollTop -= bounding.height;
    }
    if (bounding.bottom > hr.top + this.content.clientHeight) {
      target.scrollIntoView({
        block: 'end'
      });
    }
  }
  connectedCallback() {
    const hr = this.content.querySelector('div.entry.hr');
    const entries = [...hr.querySelectorAll('div')];
    entries.forEach((entry, index) => {
      const drag = entry.querySelector('i');
      if (!drag) {
        return;
      }
      drag.onmousedown = () => {
        const resize = e => {
          const widths = entries.map(e => e.getBoundingClientRect().width);
          const total = widths.reduce((p, c) => c + p, 0);

          widths[index] -= e.movementX;
          if (widths[index] < 32) {
            return;
          }
          for (let j = index - 1; j >= 0; j -= 1) {
            if (widths[j] !== 0) {
              widths[j] += e.movementX;
              if (widths[j] < 32) {
                return;
              }
              break;
            }
          }
          this.shadowRoot.getElementById('styles').textContent = `
            #content[data-path=${this.content.dataset.path}] div.entry {
              grid-template-columns: ${widths.filter(w => w).map(w => (w / total * 100) + '%').join(' ')};
            }
          `;
        };
        document.addEventListener('mousemove', resize);
        document.onmouseup = () => {
          document.removeEventListener('mousemove', resize);
        };
      };
    });
  }
}
window.customElements.define('list-view', ListView);
