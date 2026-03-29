export interface TocItem {
  level: number;
  text: string;
  id: string;
}

export interface MarkdownResult {
  html: string;
  toc: TocItem[];
  frontmatter: Record<string, string | boolean> | null;
  filePath: string;
}

export interface FileNode {
  name: string;
  path: string;
}

export interface TreeNode {
  name: string;
  children: Record<string, TreeNode>;
  files: FileNode[];
}

export interface NavInfo {
  filename: string;
  breadcrumb: string;
}

export type NotifyType = 'update' | 'add' | 'delete' | 'reload';
