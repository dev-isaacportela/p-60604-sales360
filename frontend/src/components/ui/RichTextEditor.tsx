import { useEffect, useMemo, useRef, useState, type ComponentType } from 'react';
import {
  Bold,
  Eraser,
  Heading2,
  Heading3,
  ImagePlus,
  Italic,
  Link2,
  List,
  ListOrdered,
  Quote,
  Redo2,
  Strikethrough,
  Underline,
  Undo2,
  Unlink,
  Upload,
} from 'lucide-react';
import { uploadFilePublicMitra } from 'mitra-interactions-sdk';

const PROJECT_ID = Number(import.meta.env.VITE_MITRA_PROJECT_ID);

interface RichTextEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  minHeight?: number;
  className?: string;
  /** Mostra também o botão de subtítulo (h3). */
  comSubtitulo?: boolean;
}

function decodeEntities(input: string): string {
  return input
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
}

export function richTextToPlainText(value: string): string {
  const withoutTags = value
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<\/(p|div|li|h1|h2|h3|h4|h5|h6|blockquote)>/gi, ' ')
    .replace(/<[^>]*>/g, ' ');

  return decodeEntities(withoutTags).replace(/\s+/g, ' ').trim();
}

interface ToolbarAction {
  key: string;
  label: string;
  command?: string;
  value?: string;
  icon: ComponentType<{ size?: number }>;
  isActive?: (state: FormatState) => boolean;
  onClick?: (runCommand: (command: string, value?: string) => void) => void;
}

interface FormatState {
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strike: boolean;
  unorderedList: boolean;
  orderedList: boolean;
  blockquote: boolean;
  heading: boolean;
  link: boolean;
}

const INITIAL_FORMAT_STATE: FormatState = {
  bold: false,
  italic: false,
  underline: false,
  strike: false,
  unorderedList: false,
  orderedList: false,
  blockquote: false,
  heading: false,
  link: false,
};

function queryState(command: string): boolean {
  try {
    return document.queryCommandState(command);
  } catch {
    return false;
  }
}

export default function RichTextEditor({
  value,
  onChange,
  placeholder = 'Digite o relato...',
  disabled = false,
  minHeight = 130,
  className = '',
  comSubtitulo = false,
}: RichTextEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [focused, setFocused] = useState(false);
  const [formatState, setFormatState] = useState<FormatState>(INITIAL_FORMAT_STATE);
  const [uploadingImage, setUploadingImage] = useState(false);

  useEffect(() => {
    if (!editorRef.current) return;
    if (editorRef.current.innerHTML !== value) {
      editorRef.current.innerHTML = value || '';
    }
  }, [value]);

  useEffect(() => {
    function syncSelectionState() {
      if (!editorRef.current) return;
      const selection = window.getSelection();
      const hasSelectionInside = !!selection
        && selection.rangeCount > 0
        && editorRef.current.contains(selection.anchorNode);

      if (!hasSelectionInside) {
        setFormatState(INITIAL_FORMAT_STATE);
        return;
      }

      setFormatState({
        bold: queryState('bold'),
        italic: queryState('italic'),
        underline: queryState('underline'),
        strike: queryState('strikeThrough'),
        unorderedList: queryState('insertUnorderedList'),
        orderedList: queryState('insertOrderedList'),
        blockquote: queryState('formatBlock'),
        heading: queryState('heading'),
        link: queryState('createLink'),
      });
    }

    document.addEventListener('selectionchange', syncSelectionState);
    return () => document.removeEventListener('selectionchange', syncSelectionState);
  }, []);

  function runCommand(command: string, commandValue?: string) {
    if (disabled) return;
    editorRef.current?.focus();
    document.execCommand(command, false, commandValue);
    const html = editorRef.current?.innerHTML || '';
    onChange(html);
  }

  async function uploadAndInsertImage(file: File) {
    if (disabled) return;

    setUploadingImage(true);
    try {
      const uploadResult = await uploadFilePublicMitra({
        projectId: PROJECT_ID,
        file,
      });

      const publicUrl = (uploadResult as any)?.result?.publicUrl || (uploadResult as any)?.publicUrl;
      if (!publicUrl) {
        throw new Error('URL pública não retornada no upload.');
      }

      runCommand('insertImage', String(publicUrl));
    } catch (error) {
      console.error('Erro ao fazer upload da imagem:', error);
      window.alert('Não foi possível enviar a imagem. Tente novamente.');
    } finally {
      setUploadingImage(false);
    }
  }

  const actions = useMemo<ToolbarAction[]>(() => {
    return [
      { key: 'bold', label: 'Negrito', command: 'bold', icon: Bold, isActive: (state) => state.bold },
      { key: 'italic', label: 'Itálico', command: 'italic', icon: Italic, isActive: (state) => state.italic },
      { key: 'underline', label: 'Sublinhado', command: 'underline', icon: Underline, isActive: (state) => state.underline },
      { key: 'strike', label: 'Tachado', command: 'strikeThrough', icon: Strikethrough, isActive: (state) => state.strike },
      { key: 'heading', label: 'Título', command: 'formatBlock', value: 'h2', icon: Heading2, isActive: (state) => state.heading },
      ...(comSubtitulo ? [{ key: 'subheading', label: 'Subtítulo', command: 'formatBlock', value: 'h3', icon: Heading3 }] : []),
      { key: 'quote', label: 'Citação', command: 'formatBlock', value: 'blockquote', icon: Quote, isActive: (state) => state.blockquote },
      { key: 'ul', label: 'Lista com marcadores', command: 'insertUnorderedList', icon: List, isActive: (state) => state.unorderedList },
      { key: 'ol', label: 'Lista numerada', command: 'insertOrderedList', icon: ListOrdered, isActive: (state) => state.orderedList },
      {
        key: 'link',
        label: 'Inserir link',
        icon: Link2,
        isActive: (state) => state.link,
        onClick: (exec) => {
          const href = window.prompt('Informe a URL do link:', 'https://');
          if (!href) return;
          const normalized = /^https?:\/\//i.test(href) ? href : `https://${href}`;
          exec('createLink', normalized);
        },
      },
      {
        key: 'image',
        label: 'Inserir imagem',
        icon: ImagePlus,
        onClick: (exec) => {
          const src = window.prompt('Informe a URL da imagem:', 'https://');
          if (!src) return;

          const normalized = /^(https?:\/\/|data:image\/)/i.test(src)
            ? src
            : `https://${src}`;

          exec('insertImage', normalized);
        },
      },
      {
        key: 'upload-image',
        label: uploadingImage ? 'Enviando imagem...' : 'Enviar imagem do computador',
        icon: Upload,
        onClick: () => {
          if (uploadingImage) return;
          fileInputRef.current?.click();
        },
      },
      { key: 'unlink', label: 'Remover link', command: 'unlink', icon: Unlink },
      { key: 'undo', label: 'Desfazer', command: 'undo', icon: Undo2 },
      { key: 'redo', label: 'Refazer', command: 'redo', icon: Redo2 },
      { key: 'clear', label: 'Limpar formatação', command: 'removeFormat', icon: Eraser },
    ];
  }, [uploadingImage, comSubtitulo]);

  const isEmpty = richTextToPlainText(value).length === 0;

  return (
    <div className={`rounded-xl border ${className}`} style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-surface)' }}>
      <div className="flex flex-wrap gap-1 p-2 border-b" style={{ borderColor: 'var(--color-border)' }}>
        {actions.map((action) => {
          const Icon = action.icon;
          const active = action.isActive ? action.isActive(formatState) : false;
          const actionDisabled = disabled || (action.key === 'upload-image' && uploadingImage);

          return (
            <button
              key={action.key}
              type="button"
              title={action.label}
              onMouseDown={(event) => {
                event.preventDefault();
                if (actionDisabled) return;
                if (action.onClick) {
                  action.onClick(runCommand);
                  return;
                }
                if (action.command) {
                  runCommand(action.command, action.value);
                }
              }}
              className="w-8 h-8 rounded-md flex items-center justify-center transition-colors"
              style={{
                backgroundColor: active ? 'var(--color-primary-bg)' : 'transparent',
                color: active ? 'var(--color-primary)' : 'var(--color-text-secondary)',
                opacity: actionDisabled ? 0.5 : 1,
                cursor: actionDisabled ? 'not-allowed' : 'pointer',
              }}
              disabled={actionDisabled}
            >
              <Icon size={14} />
            </button>
          );
        })}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (!file) return;
          void uploadAndInsertImage(file);
        }}
      />

      <div className="relative">
        {isEmpty && !focused && (
          <span className="absolute pointer-events-none left-3 top-3 text-sm" style={{ color: 'var(--color-text-secondary)' }}>
            {placeholder}
          </span>
        )}

        <div
          ref={editorRef}
          contentEditable={!disabled}
          suppressContentEditableWarning
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onInput={(event) => onChange(event.currentTarget.innerHTML)}
          className="p-3 text-sm outline-none rich-text-editor-content"
          style={{
            minHeight,
            color: 'var(--color-text)',
            cursor: disabled ? 'not-allowed' : 'text',
          }}
        />
      </div>
    </div>
  );
}
