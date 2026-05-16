import React, { useState, useCallback } from 'react';
import { Check } from 'lucide-react';

interface StepOtherSettingsProps {
  initialExcludeFolders: string;
  initialOcrLanguages: string; // e.g., 'deu+eng', 'deu', 'eng'
  onChange: (data: { excludeFolders: string; ocrLanguages: string }) => void;
}

interface OcrLanguage {
  code: string;
  label: string;
}

const OCR_LANGUAGES: OcrLanguage[] = [
  { code: 'deu', label: 'Deutsch' },
  { code: 'eng', label: 'Englisch' },
];

export const StepOtherSettings: React.FC<StepOtherSettingsProps> = ({
  initialExcludeFolders,
  initialOcrLanguages,
  onChange,
}) => {
  const [excludeFolders, setExcludeFolders] = useState(initialExcludeFolders);
  const [ocrLanguages, setOcrLanguages] = useState<Set<string>>(
    new Set(initialOcrLanguages.split('+').filter(Boolean))
  );

  // Notify parent of changes
  const notifyChange = useCallback(
    (folders: string, languages: Set<string>) => {
      const languageString = Array.from(languages).sort().join('+');
      onChange({ excludeFolders: folders, ocrLanguages: languageString });
    },
    [onChange]
  );

  // Handle exclude folders textarea change
  const handleExcludeFoldersChange = (value: string) => {
    setExcludeFolders(value);
    notifyChange(value, ocrLanguages);
  };

  // Handle OCR language toggle
  const handleLanguageToggle = (code: string) => {
    const newLanguages = new Set(ocrLanguages);

    if (newLanguages.has(code)) {
      // Only allow deselection if at least one other language remains
      if (newLanguages.size > 1) {
        newLanguages.delete(code);
      }
      // Else: ignore the click — at least one language must be selected
    } else {
      newLanguages.add(code);
    }

    setOcrLanguages(newLanguages);
    notifyChange(excludeFolders, newLanguages);
  };

  const isLanguageSelected = (code: string) => ocrLanguages.has(code);

  const languageCardClass = (selected: boolean) =>
    [
      'flex items-center gap-3 px-5 py-4 rounded-xl border-2 cursor-pointer transition-colors',
      selected
        ? 'border-accent-primary bg-accent-primary/10'
        : 'border-border-base bg-bg-surface hover:border-accent-primary/50',
    ].join(' ');

  const textareaClass =
    'w-full px-4 py-2 border border-border-base rounded-lg bg-bg-surface text-text-main outline-none text-sm font-mono focus:ring-2 focus:ring-accent-primary/30';

  const labelClass = 'text-xs font-semibold text-text-main';
  const helperClass = 'text-xs text-text-subtle';

  return (
    <div className="flex flex-col gap-6">
      {/* Section 1: Ausgeschlossene Ordner */}
      <div className="flex flex-col gap-3">
        <label className={labelClass}>Ausgeschlossene Ordner</label>
        <p className={helperClass}>Diese Ordner werden beim Archiv-Scan ignoriert.</p>
        <textarea
          value={excludeFolders}
          onChange={e => handleExcludeFoldersChange(e.target.value)}
          className={textareaClass}
          placeholder="node_modules, .git, Temp"
          rows={4}
        />
      </div>

      {/* Section 2: OCR-Sprache */}
      <div className="flex flex-col gap-3">
        <label className={labelClass}>OCR-Sprache</label>
        <div className="grid grid-cols-2 gap-3">
          {OCR_LANGUAGES.map(lang => (
            <div
              key={lang.code}
              className={languageCardClass(isLanguageSelected(lang.code))}
              onClick={() => handleLanguageToggle(lang.code)}
              role="button"
              tabIndex={0}
              onKeyDown={e => e.key === 'Enter' && handleLanguageToggle(lang.code)}
            >
              {isLanguageSelected(lang.code) && <Check className="w-5 h-5 text-accent-primary shrink-0" />}
              <span className="text-sm font-semibold text-text-main">{lang.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
