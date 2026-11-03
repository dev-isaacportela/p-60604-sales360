import { useState, useRef, useEffect } from 'react';
import { ChevronDown, Check } from 'lucide-react';

interface SelectOption {
  value: string;
  label: string;
  searchText?: string;
}

interface SelectProps {
  label?: string;
  error?: string;
  options: SelectOption[];
  placeholder?: string;
  value?: string;
  onChange?: (value: string) => void;
  disabled?: boolean;
  className?: string;
  id?: string;
  searchable?: boolean;
  searchPlaceholder?: string;
  onSearchChange?: (value: string) => void;
  searching?: boolean;
}

export default function Select({
  label,
  error,
  options,
  placeholder = 'Selecione...',
  value,
  onChange,
  disabled = false,
  className = '',
  id,
  searchable = false,
  searchPlaceholder = 'Pesquisar...',
  onSearchChange,
  searching = false,
}: SelectProps) {
  const [open, setOpen] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const [search, setSearch] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const selectId = id || label?.toLowerCase().replace(/\s+/g, '-');

  const selected = options.find((o) => o.value === value);
  const normalizedSearch = search.trim().toLowerCase();
  const filteredOptions = !searchable || !normalizedSearch
    ? options
    : options.filter((opt) => `${opt.label} ${opt.value} ${opt.searchText || ''}`.toLowerCase().includes(normalizedSearch));

  // Close on click outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [open]);

  useEffect(() => {
    if (!open) {
      setSearch('');
      onSearchChange?.('');
    }
  }, [onSearchChange, open]);

  useEffect(() => {
    if (focusedIndex >= filteredOptions.length) {
      setFocusedIndex(filteredOptions.length - 1);
    }
  }, [filteredOptions.length, focusedIndex]);

  // Scroll focused item into view
  useEffect(() => {
    if (open && focusedIndex >= 0 && listRef.current) {
      const item = listRef.current.children[focusedIndex] as HTMLElement;
      item?.scrollIntoView({ block: 'nearest' });
    }
  }, [focusedIndex, open]);

  function handleKeyDown(e: React.KeyboardEvent) {
    if (disabled) return;

    switch (e.key) {
      case 'Enter':
      case ' ':
        e.preventDefault();
        if (!open) {
          setOpen(true);
          setFocusedIndex(options.findIndex((o) => o.value === value));
        } else if (focusedIndex >= 0) {
          onChange?.(filteredOptions[focusedIndex].value);
          setOpen(false);
        }
        break;
      case 'Escape':
        setOpen(false);
        break;
      case 'ArrowDown':
        e.preventDefault();
        if (!open) {
          setOpen(true);
          setFocusedIndex(0);
        } else {
          setFocusedIndex((prev) => Math.min(prev + 1, filteredOptions.length - 1));
        }
        break;
      case 'ArrowUp':
        e.preventDefault();
        if (open) {
          setFocusedIndex((prev) => Math.max(prev - 1, 0));
        }
        break;
    }
  }

  return (
    <div className={`flex flex-col gap-1.5 ${className}`} ref={containerRef}>
      {label && (
        <label htmlFor={selectId} className="text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>
          {label}
        </label>
      )}
      <div className="relative">
        <button
          type="button"
          id={selectId}
          role="combobox"
          aria-expanded={open}
          aria-haspopup="listbox"
          disabled={disabled}
          onClick={() => !disabled && setOpen(!open)}
          onKeyDown={handleKeyDown}
          className={`
            w-full px-3 py-2 text-sm rounded-lg border text-left
            focus:outline-none focus:ring-2 focus:border-transparent
            disabled:opacity-50 disabled:cursor-not-allowed
            transition-all duration-200 flex items-center justify-between gap-2
            ${error ? 'border-red-500 focus:ring-red-500' : ''}
          `}
          style={{
            backgroundColor: 'var(--color-surface)',
            borderColor: error ? undefined : 'var(--color-border)',
            color: selected ? 'var(--color-text)' : 'var(--color-text-secondary)',
            ...(!error ? { '--tw-ring-color': 'var(--color-primary-light)' } as React.CSSProperties : {}),
          }}
        >
          <span className="truncate">{selected ? selected.label : placeholder}</span>
          <ChevronDown
            size={16}
            className={`shrink-0 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
            style={{ color: 'var(--color-text-secondary)' }}
          />
        </button>

        {open && (
          <div
            className="absolute z-50 w-full mt-1 rounded-lg border shadow-lg overflow-hidden"
            style={{
              backgroundColor: 'var(--color-surface)',
              borderColor: 'var(--color-border)',
            }}
          >
            {searchable && (
              <div className="p-2 border-b" style={{ borderColor: 'var(--color-border)' }}>
                <input
                  type="text"
                  value={search}
                  onChange={(e) => {
                    const nextSearch = e.target.value;
                    setSearch(nextSearch);
                    onSearchChange?.(nextSearch);
                    setFocusedIndex(0);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') setOpen(false);
                    if (e.key === 'ArrowDown') {
                      e.preventDefault();
                      setFocusedIndex((prev) => Math.min(prev + 1, filteredOptions.length - 1));
                    }
                    if (e.key === 'ArrowUp') {
                      e.preventDefault();
                      setFocusedIndex((prev) => Math.max(prev - 1, 0));
                    }
                    if (e.key === 'Enter' && focusedIndex >= 0 && filteredOptions[focusedIndex]) {
                      e.preventDefault();
                      onChange?.(filteredOptions[focusedIndex].value);
                      setOpen(false);
                    }
                  }}
                  placeholder={searchPlaceholder}
                  autoFocus
                  className="w-full rounded-md border px-3 py-2 text-sm outline-none"
                  style={{
                    backgroundColor: 'var(--color-bg)',
                    borderColor: 'var(--color-border)',
                    color: 'var(--color-text)',
                  }}
                />
              </div>
            )}
            <ul ref={listRef} role="listbox" className="py-1 max-h-60 overflow-auto">
            {searching && (
              <li className="px-3 py-2 text-sm" style={{ color: 'var(--color-text-secondary)' }}>
                Buscando...
              </li>
            )}
            {filteredOptions.map((opt, idx) => (
              <li
                key={opt.value}
                role="option"
                aria-selected={opt.value === value}
                className={`
                  px-3 py-2 text-sm cursor-pointer flex items-center justify-between gap-2
                  transition-colors duration-100
                `}
                style={{
                  backgroundColor: focusedIndex === idx ? 'var(--color-primary-bg)' : undefined,
                  color: opt.value === value ? 'var(--color-primary)' : 'var(--color-text)',
                }}
                onMouseEnter={() => setFocusedIndex(idx)}
                onMouseDown={(e) => {
                  e.preventDefault();
                  onChange?.(opt.value);
                  setOpen(false);
                }}
              >
                <span className="truncate">{opt.label}</span>
                {opt.value === value && <Check size={16} style={{ color: 'var(--color-primary)' }} />}
              </li>
            ))}
            {filteredOptions.length === 0 && !searching && (
              <li className="px-3 py-2 text-sm" style={{ color: 'var(--color-text-secondary)' }}>
                Nenhum resultado encontrado.
              </li>
            )}
          </ul>
          </div>
        )}
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
