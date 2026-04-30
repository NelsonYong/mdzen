import { dirname, basename } from 'node:path';

import {
  getMdFiles,
  buildFileTree,
  renderTree,
} from './files.ts';
import {
  getMarkdownWithToc,
  renderToc,
  renderFrontmatter,
} from './markdown.ts';
import { getHtmlTemplate, getPreviewTemplate, logoSvg } from './templates.ts';
import { html, raw, safeJsonForScript } from './utils/security.ts';

const treeScript = `
<script>
  (function() {
    function getExpandedFolders() {
      try { return JSON.parse(localStorage.getItem('mdzen-expanded-folders') || '[]'); }
      catch { return []; }
    }

    function saveExpandedFolders(folders) {
      try { localStorage.setItem('mdzen-expanded-folders', JSON.stringify(folders)); } catch {}
    }

    function setFolder(folderId, expanded) {
      var content = document.getElementById(folderId);
      var arrow = document.getElementById('arrow-' + folderId);
      var btn = document.querySelector('[data-folder="' + folderId + '"]');
      if (!content || !arrow) return;
      content.hidden = !expanded;
      arrow.textContent = expanded ? '▼' : '▶';
      arrow.classList.toggle('expanded', expanded);
      if (btn) btn.setAttribute('aria-expanded', String(expanded));
    }

    function toggleFolder(folderId) {
      var content = document.getElementById(folderId);
      if (!content) return;
      var willExpand = content.hidden;
      setFolder(folderId, willExpand);
      var folders = getExpandedFolders();
      var idx = folders.indexOf(folderId);
      if (willExpand) {
        if (idx === -1) folders.push(folderId);
      } else {
        if (idx > -1) folders.splice(idx, 1);
      }
      saveExpandedFolders(folders);
    }

    document.addEventListener('click', function(e) {
      var btn = e.target.closest('[data-folder]');
      if (btn) {
        e.preventDefault();
        toggleFolder(btn.getAttribute('data-folder'));
        return;
      }
      var action = e.target.closest('[data-tree-action]');
      if (action) {
        e.preventDefault();
        var act = action.getAttribute('data-tree-action');
        if (act === 'expand') expandAll();
        else if (act === 'collapse') collapseAll();
        return;
      }
      var link = e.target.closest('a');
      if (link && link.href) {
        try { sessionStorage.setItem('mdzen-index-scroll-y', String(window.scrollY)); } catch {}
      }
    });

    function expandAll() {
      var ids = [];
      document.querySelectorAll('.tree-folder-content').forEach(function(el) {
        setFolder(el.id, true);
        ids.push(el.id);
      });
      saveExpandedFolders(ids);
    }

    function collapseAll() {
      document.querySelectorAll('.tree-folder-content').forEach(function(el) {
        setFolder(el.id, false);
      });
      saveExpandedFolders([]);
    }

    (function restoreState() {
      getExpandedFolders().forEach(function(id) { setFolder(id, true); });
      try {
        var savedY = sessionStorage.getItem('mdzen-index-scroll-y');
        if (savedY) requestAnimationFrame(function() { window.scrollTo(0, parseInt(savedY, 10) || 0); });
      } catch {}
    })();
  })();
</script>`;

export function renderIndex(): string {
  const files = getMdFiles();
  const tree = buildFileTree(files);
  const treeHtml = renderTree(tree);

  const navBlock = html`
    <div class="nav">
      <div class="nav-header">
        <div class="nav-logo">
          ${raw(logoSvg)}
          <h1>MD Zen</h1>
        </div>
        <p class="file-count">共 ${files.length} 个文件</p>
      </div>
      <div class="tree-actions">
        <button type="button" data-tree-action="expand" class="tree-btn">展开全部</button>
        <button type="button" data-tree-action="collapse" class="tree-btn">折叠全部</button>
      </div>
      <div class="tree-container">${raw(treeHtml)}</div>
    </div>
    ${raw(`<script>window.__allFiles=${safeJsonForScript(files)};</script>`)}
    ${raw(treeScript)}
  `;

  return getHtmlTemplate('MD Zen', navBlock);
}

export function renderMarkdown(filename: string): string {
  const result = getMarkdownWithToc(filename);
  if (!result) {
    const notFound = html`<div class="content"><h1>文件不存在</h1><p><a class="back-link" href="/">← 返回首页</a></p></div>`;
    return getHtmlTemplate('404', notFound);
  }

  const { html: bodyHtml, toc, frontmatter, filePath } = result;
  const dir = dirname(filename);
  const breadcrumb = dir !== '.' ? html`<span class="breadcrumb">${dir}/</span>` : '';
  const allFiles = getMdFiles();
  const main = renderFrontmatter(frontmatter) + bodyHtml;

  return getPreviewTemplate(
    basename(filename),
    main,
    renderToc(toc),
    { filename: basename(filename), breadcrumb },
    filePath,
    allFiles,
  );
}
