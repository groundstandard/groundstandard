// ArticleEditor — the body of an article, edited the way a writer expects.
//
// TipTap rather than a bare contentEditable, because what comes out goes
// straight onto client websites: it is always clean HTML in a fixed set of
// elements — paragraphs, headings, lists, quotes, links — whatever was pasted
// in. A paste from Google Docs arrives as spans and inline styles and leaves
// as plain paragraphs and links.
//
// Links carry no target and no rel unless asked for. TipTap's default is
// target="_blank" with rel="nofollow", and nofollow on a link to the client's
// own pages is exactly what an SEO article must not do.

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { EditorContent, useEditor, useEditorState } from '@tiptap/react';
import type { Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import {
  Bold, Heading2, Heading3, Italic, Link2, List, ListOrdered, Minus, Pilcrow, Quote,
  Redo2, Strikethrough, Underline, Undo2, Unlink,
} from 'lucide-react';
import './article-cms.css';

const htmlOf = (editor: Editor) => (editor.isEmpty ? '' : editor.getHTML());

// What Kris types into the link box, made into an address a browser follows.
// Paths and anchors stay as they are, so links to the site's own pages work.
function normaliseHref(input: string): string {
  const v = input.trim();
  if (!v) return '';
  if (/^(https?:|mailto:|tel:|\/|#)/i.test(v)) return v;
  if (/^[^\s@/]+@[^\s@/]+\.[^\s@/]+$/.test(v)) return `mailto:${v}`;
  return `https://${v}`;
}

export default function ArticleEditor({ initialContent, onChange, onReady }: {
  initialContent: string;
  onChange: (html: string) => void;
  // The content as the editor normalised it, once, right after it loads.
  onReady?: (html: string) => void;
}) {
  const changeRef = useRef(onChange);
  const readyRef = useRef(onReady);
  useEffect(() => { changeRef.current = onChange; readyRef.current = onReady; }, [onChange, onReady]);

  const [linkOpen, setLinkOpen] = useState(false);
  const openLinkRef = useRef<() => void>(() => {});

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3, 4] },
        code: false,
        codeBlock: false,
        link: {
          openOnClick: false,
          autolink: true,
          defaultProtocol: 'https',
          HTMLAttributes: { target: null, rel: null, class: null },
        },
      }),
    ],
    content: initialContent || '',
    editorProps: {
      attributes: { class: 'gs-article gs-article-editing', spellcheck: 'true' },
      handleKeyDown: (_view, event) => {
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
          event.preventDefault();
          openLinkRef.current();
          return true;
        }
        return false;
      },
    },
    onCreate: ({ editor: e }) => readyRef.current?.(htmlOf(e)),
    onUpdate: ({ editor: e }) => changeRef.current(htmlOf(e)),
  });

  const on = useEditorState({
    editor,
    selector: ({ editor: e }) => (e ? {
      bold: e.isActive('bold'),
      italic: e.isActive('italic'),
      underline: e.isActive('underline'),
      strike: e.isActive('strike'),
      paragraph: e.isActive('paragraph'),
      h2: e.isActive('heading', { level: 2 }),
      h3: e.isActive('heading', { level: 3 }),
      bullet: e.isActive('bulletList'),
      ordered: e.isActive('orderedList'),
      quote: e.isActive('blockquote'),
      link: e.isActive('link'),
      canUndo: e.can().undo(),
      canRedo: e.can().redo(),
    } : null),
  });

  const openLink = useCallback(() => setLinkOpen(true), []);
  useEffect(() => { openLinkRef.current = openLink; }, [openLink]);

  if (!editor) return null;
  const run = () => editor.chain().focus();

  return (
    <div className="relative rounded-2xl border border-slate-200 bg-white shadow-sm shadow-slate-200/50">
      <div className="sticky top-[7.5rem] z-10 flex flex-wrap items-center gap-0.5 rounded-t-2xl border-b border-slate-100 bg-white/95 px-2 py-1.5 backdrop-blur">
        <Tool title="Paragraph" on={!!on?.paragraph && !on?.h2 && !on?.h3} onClick={() => run().setParagraph().run()}><Pilcrow className="h-4 w-4" /></Tool>
        <Tool title="Heading" on={!!on?.h2} onClick={() => run().toggleHeading({ level: 2 }).run()}><Heading2 className="h-4 w-4" /></Tool>
        <Tool title="Subheading" on={!!on?.h3} onClick={() => run().toggleHeading({ level: 3 }).run()}><Heading3 className="h-4 w-4" /></Tool>
        <Sep />
        <Tool title="Bold (Ctrl+B)" on={!!on?.bold} onClick={() => run().toggleBold().run()}><Bold className="h-4 w-4" /></Tool>
        <Tool title="Italic (Ctrl+I)" on={!!on?.italic} onClick={() => run().toggleItalic().run()}><Italic className="h-4 w-4" /></Tool>
        <Tool title="Underline (Ctrl+U)" on={!!on?.underline} onClick={() => run().toggleUnderline().run()}><Underline className="h-4 w-4" /></Tool>
        <Tool title="Strikethrough" on={!!on?.strike} onClick={() => run().toggleStrike().run()}><Strikethrough className="h-4 w-4" /></Tool>
        <Sep />
        <Tool title="Bulleted list" on={!!on?.bullet} onClick={() => run().toggleBulletList().run()}><List className="h-4 w-4" /></Tool>
        <Tool title="Numbered list" on={!!on?.ordered} onClick={() => run().toggleOrderedList().run()}><ListOrdered className="h-4 w-4" /></Tool>
        <Tool title="Quote" on={!!on?.quote} onClick={() => run().toggleBlockquote().run()}><Quote className="h-4 w-4" /></Tool>
        <Tool title="Divider" onClick={() => run().setHorizontalRule().run()}><Minus className="h-4 w-4" /></Tool>
        <Sep />
        <Tool title="Add or edit a link (Ctrl+K)" on={!!on?.link || linkOpen} onClick={openLink}>
          <Link2 className="h-4 w-4" />
          <span className="text-xs font-semibold">Link</span>
        </Tool>
        <Tool title="Remove link" disabled={!on?.link} onClick={() => run().extendMarkRange('link').unsetLink().run()}><Unlink className="h-4 w-4" /></Tool>
        <div className="ml-auto flex items-center gap-0.5">
          <Tool title="Undo (Ctrl+Z)" disabled={!on?.canUndo} onClick={() => run().undo().run()}><Undo2 className="h-4 w-4" /></Tool>
          <Tool title="Redo (Ctrl+Shift+Z)" disabled={!on?.canRedo} onClick={() => run().redo().run()}><Redo2 className="h-4 w-4" /></Tool>
        </div>
      </div>

      {linkOpen && <LinkBox editor={editor} onClose={() => setLinkOpen(false)} />}

      <div className="px-6 py-6 sm:px-10 sm:py-8">
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}

// The link box: the address, and whether it opens in a new tab. Opened from
// the toolbar or with Ctrl+K, filled in when the cursor is already in a link.
function LinkBox({ editor, onClose }: { editor: Editor; onClose: () => void }) {
  const current = editor.getAttributes('link') as { href?: string; target?: string | null };
  const [href, setHref] = useState(current.href ?? '');
  const [newTab, setNewTab] = useState(current.target === '_blank');
  const inputRef = useRef<HTMLInputElement>(null);
  const hasSelection = !editor.state.selection.empty;
  const editing = editor.isActive('link');

  useEffect(() => { inputRef.current?.focus(); inputRef.current?.select(); }, []);

  const apply = () => {
    const url = normaliseHref(href);
    const attrs = { target: newTab ? '_blank' : null, rel: newTab ? 'noopener' : null };
    if (!url) {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
    } else if (!hasSelection && !editing) {
      // Nothing selected: put the address in as its own linked text.
      editor.chain().focus().insertContent({ type: 'text', text: url, marks: [{ type: 'link', attrs: { href: url, ...attrs } }] }).run();
    } else {
      editor.chain().focus().extendMarkRange('link').setLink({ href: url, ...attrs }).run();
    }
    onClose();
  };

  return (
    <div className="absolute left-1/2 top-14 z-20 w-[min(460px,calc(100%-2rem))] -translate-x-1/2 rounded-xl border border-slate-200 bg-white p-4 shadow-xl">
      <div className="mb-2 text-xs font-semibold text-slate-700">
        {editing ? 'Edit link' : hasSelection ? 'Link the selected words' : 'Add a link'}
      </div>
      <input
        ref={inputRef}
        value={href}
        onChange={(e) => setHref(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); apply(); }
          if (e.key === 'Escape') { e.preventDefault(); onClose(); editor.commands.focus(); }
        }}
        placeholder="https://www.example.com/page or /page on the same site"
        className="w-full rounded-lg border border-slate-200 px-3 py-2 font-mono text-[12px] text-slate-800 outline-none transition placeholder:text-slate-300 focus:border-blue-400 focus:ring-4 focus:ring-blue-50"
      />
      <label className="mt-3 flex items-center gap-2 text-xs text-slate-600">
        <input type="checkbox" checked={newTab} onChange={(e) => setNewTab(e.target.checked)} className="h-3.5 w-3.5 rounded border-slate-300" />
        Open in a new tab
        <span className="text-slate-400">— for links to other websites</span>
      </label>
      <div className="mt-4 flex items-center justify-between gap-2">
        {editing ? (
          <button
            type="button"
            onClick={() => { editor.chain().focus().extendMarkRange('link').unsetLink().run(); onClose(); }}
            className="text-xs font-semibold text-red-600 hover:underline"
          >
            Remove link
          </button>
        ) : <span />}
        <div className="flex gap-2">
          <button type="button" onClick={() => { onClose(); editor.commands.focus(); }} className="rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100">Cancel</button>
          <button type="button" onClick={apply} className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800">Apply</button>
        </div>
      </div>
    </div>
  );
}

function Tool({ title, on, disabled, onClick, children }: {
  title: string; on?: boolean; disabled?: boolean; onClick: () => void; children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      aria-pressed={on}
      disabled={disabled}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={`inline-flex h-8 items-center gap-1 rounded-lg px-2 transition disabled:pointer-events-none disabled:opacity-30 ${
        on ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
      }`}
    >
      {children}
    </button>
  );
}

function Sep() {
  return <span className="mx-1 h-5 w-px bg-slate-200" />;
}
