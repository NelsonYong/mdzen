import { dirname, basename, extname } from 'node:path';

import { SUPPORTED_EXTENSIONS } from './config.ts';
import { getMdFiles, buildFileTree, renderTree, serveStaticFile } from './files.ts';
import { getMarkdownWithToc, renderToc, renderFrontmatter } from './markdown.ts';
import { getHtmlTemplate, getPreviewTemplate, logoSvg } from './templates.ts';

const treeScript = `
<script>
  function getExpandedFolders() {
    try { return JSON.parse(localStorage.getItem('expandedFolders') || '[]'); }
    catch { return []; }
  }

  function saveExpandedFolders(folders) {
    localStorage.setItem('expandedFolders', JSON.stringify(folders));
  }

  function toggleFolder(folderId) {
    const content = document.getElementById(folderId);
    const arrow = document.getElementById('arrow-' + folderId);
    const isHidden = content.style.display === 'none';
    content.style.display = isHidden ? 'block' : 'none';
    arrow.textContent = isHidden ? '▼' : '▶';
    arrow.classList.toggle('expanded', isHidden);

    const folders = getExpandedFolders();
    if (isHidden) {
      if (!folders.includes(folderId)) folders.push(folderId);
    } else {
      const idx = folders.indexOf(folderId);
      if (idx > -1) folders.splice(idx, 1);
    }
    saveExpandedFolders(folders);
  }

  function expandAll() {
    const ids = [];
    document.querySelectorAll('.tree-folder-content').forEach(el => {
      el.style.display = 'block';
      ids.push(el.id);
    });
    document.querySelectorAll('.tree-arrow').forEach(el => {
      el.textContent = '▼';
      el.classList.add('expanded');
    });
    saveExpandedFolders(ids);
  }

  function collapseAll() {
    document.querySelectorAll('.tree-folder-content').forEach(el => { el.style.display = 'none'; });
    document.querySelectorAll('.tree-arrow').forEach(el => {
      el.textContent = '▶';
      el.classList.remove('expanded');
    });
    saveExpandedFolders([]);
  }

  (function restoreState() {
    getExpandedFolders().forEach(folderId => {
      const content = document.getElementById(folderId);
      const arrow = document.getElementById('arrow-' + folderId);
      if (content && arrow) {
        content.style.display = 'block';
        arrow.textContent = '▼';
        arrow.classList.add('expanded');
      }
    });

    const savedY = sessionStorage.getItem('indexScrollY');
    if (savedY) setTimeout(() => window.scrollTo(0, parseInt(savedY, 10)), 0);
  })();

  document.addEventListener('click', function(e) {
    const link = e.target.closest('a');
    if (link && link.href) sessionStorage.setItem('indexScrollY', window.scrollY.toString());
  });
</script>`;

export function renderIndex(): string {
  const files = getMdFiles();
  const tree = buildFileTree(files);

  return getHtmlTemplate(
    'Markdown 预览',
    `
    <div class="nav">
      <div class="nav-header">
        <div class="nav-logo">
          ${logoSvg}
          <h1>Markdown 预览器</h1>
        </div>
        <p class="file-count">共 ${files.length} 个文件</p>
      </div>
      <div class="tree-actions">
        <button onclick="expandAll()" class="tree-btn">展开全部</button>
        <button onclick="collapseAll()" class="tree-btn">折叠全部</button>
      </div>
      <div class="tree-container">
        ${renderTree(tree)}
      </div>
    </div>
    ${treeScript}
  `,
  );
}

export function renderMarkdown(filename: string): string {
  const result = getMarkdownWithToc(filename);
  if (!result) {
    return getHtmlTemplate('404', '<div class="content"><h1>文件不存在</h1></div>');
  }

  const { html, toc, frontmatter, filePath } = result;
  const dir = dirname(filename);
  const breadcrumb = dir !== '.' ? `<span class="breadcrumb">${dir}/</span>` : '';
  const allFiles = getMdFiles();

  return getPreviewTemplate(
    basename(filename),
    renderFrontmatter(frontmatter) + html,
    renderToc(toc),
    { filename: basename(filename), breadcrumb },
    filePath,
    allFiles,
  );
}
