import React, { useState } from 'react';
import { Wand2, X, ChevronLeft, ChevronRight, Check } from 'lucide-react';
import { StepAiBackend } from './onboarding/StepAiBackend';
import { StepFolderPaths } from './onboarding/StepFolderPaths';
import { StepOtherSettings } from './onboarding/StepOtherSettings';

interface OnboardingModalProps {
  initialSettings: {
    AI_BACKEND: string;
    AI_URL: string;
    AI_MODEL_NAME: string;
    GGUF_MODEL_PATH: string;
    INBOX_PATH: string;
    PROCESSING_PATH: string;
    ARCHIVE_PATH: string;
    EXCLUDE_FOLDERS: string;
    OCR_LANGUAGES: string;
  };
  isFirstRun: boolean;
  onClose: () => void;
}

type BackendType = 'ollama' | 'gguf' | 'managed';

const TOTAL_STEPS = 3;

const STEP_LABELS = ['KI-Backend', 'Ordnerpfade', 'Weitere Einstellungen'];

export const OnboardingModal: React.FC<OnboardingModalProps> = ({
  initialSettings,
  isFirstRun,
  onClose,
}) => {
  const [currentStep, setCurrentStep] = useState(0);

  const [data, setData] = useState({
    backend: (initialSettings.AI_BACKEND as BackendType) || 'ollama',
    ollamaUrl: initialSettings.AI_URL || 'http://localhost:11434',
    ollamaModel: initialSettings.AI_MODEL_NAME || 'llama3.2',
    ggufPath: initialSettings.GGUF_MODEL_PATH || '',
    managedModel: '',
    inbox: initialSettings.INBOX_PATH || '',
    sortieren: initialSettings.PROCESSING_PATH || '',
    archiv: initialSettings.ARCHIVE_PATH || '',
    excludeFolders: initialSettings.EXCLUDE_FOLDERS || '',
    ocrLanguages: initialSettings.OCR_LANGUAGES || 'deu+eng',
  });

  const [stepValid, setStepValid] = useState<[boolean, boolean, boolean]>([true, false, true]);

  const setStepValidAt = (index: 0 | 1 | 2, valid: boolean) => {
    setStepValid(prev => {
      const next = [...prev] as [boolean, boolean, boolean];
      next[index] = valid;
      return next;
    });
  };

  const handleFinish = async () => {
    await window.electronAPI.updateSettings({
      AI_BACKEND: data.backend,
      AI_URL: data.ollamaUrl,
      AI_MODEL_NAME: data.managedModel || data.ollamaModel,
      GGUF_MODEL_PATH: data.ggufPath,
      INBOX_PATH: data.inbox,
      PROCESSING_PATH: data.sortieren,
      ARCHIVE_PATH: data.archiv,
      EXCLUDE_FOLDERS: data.excludeFolders,
      OCR_LANGUAGES: data.ocrLanguages,
      // Legacy keys for backward compat
      OLLAMA_URL: data.ollamaUrl,
      OLLAMA_MODEL: data.ollamaModel,
    });
    onClose();
  };

  const isLastStep = currentStep === TOTAL_STEPS - 1;
  const canAdvance = stepValid[currentStep as 0 | 1 | 2];

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-bg-surface rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[90vh] overflow-hidden">

        {/* Header */}
        <div className="px-8 pt-8 pb-0 flex flex-col gap-4">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <Wand2 className="w-6 h-6 text-accent-primary shrink-0" />
              <div className="flex flex-col gap-0.5">
                <h2 className="text-lg font-semibold text-text-main leading-tight">
                  Einrichtungsassistent
                </h2>
                <p className="text-sm text-text-subtle">
                  Schritt {currentStep + 1} von {TOTAL_STEPS} — {STEP_LABELS[currentStep]}
                </p>
              </div>
            </div>

            {!isFirstRun && (
              <button
                onClick={onClose}
                className="p-1.5 rounded-lg text-text-subtle hover:bg-bg-app transition-colors"
                aria-label="Schließen"
              >
                <X className="w-5 h-5" />
              </button>
            )}
          </div>

          {/* Progress bar */}
          <div className="flex gap-1.5 mt-2">
            {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
              <div
                key={i}
                className={[
                  'flex-1 h-1 rounded-full transition-colors',
                  i <= currentStep ? 'bg-accent-primary' : 'bg-border-base',
                ].join(' ')}
              />
            ))}
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-8">
          {currentStep === 0 && (
            <StepAiBackend
              initialBackend={data.backend}
              initialOllamaUrl={data.ollamaUrl}
              initialOllamaModel={data.ollamaModel}
              initialGgufPath={data.ggufPath}
              initialManagedModel={data.managedModel}
              onChange={stepData =>
                setData(prev => ({ ...prev, ...stepData }))
              }
              onValidChange={valid => setStepValidAt(0, valid)}
            />
          )}

          {currentStep === 1 && (
            <StepFolderPaths
              initialInbox={data.inbox}
              initialSortieren={data.sortieren}
              initialArchiv={data.archiv}
              onChange={stepData =>
                setData(prev => ({ ...prev, ...stepData }))
              }
              onValidChange={valid => setStepValidAt(1, valid)}
            />
          )}

          {currentStep === 2 && (
            <StepOtherSettings
              initialExcludeFolders={data.excludeFolders}
              initialOcrLanguages={data.ocrLanguages}
              onChange={stepData =>
                setData(prev => ({ ...prev, ...stepData }))
              }
            />
          )}
        </div>

        {/* Footer */}
        <div className="px-8 py-6 border-t border-border-base flex items-center justify-between">
          {/* Back button — hidden on step 0 */}
          {currentStep > 0 ? (
            <button
              onClick={() => setCurrentStep(s => s - 1)}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border border-border-base text-text-subtle hover:bg-bg-app transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
              Zurück
            </button>
          ) : (
            <div />
          )}

          {/* Next / Finish */}
          {isLastStep ? (
            <button
              onClick={handleFinish}
              disabled={!canAdvance}
              className={[
                'flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-semibold bg-accent-primary text-white hover:bg-accent-primary/90 transition-colors',
                !canAdvance ? 'opacity-50 cursor-not-allowed' : '',
              ].join(' ')}
            >
              <Check className="w-4 h-4" />
              Fertigstellen
            </button>
          ) : (
            <button
              onClick={() => setCurrentStep(s => s + 1)}
              disabled={!canAdvance}
              className={[
                'flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-semibold bg-accent-primary text-white hover:bg-accent-primary/90 transition-colors',
                !canAdvance ? 'opacity-50 cursor-not-allowed' : '',
              ].join(' ')}
            >
              Weiter
              <ChevronRight className="w-4 h-4" />
            </button>
          )}
        </div>

      </div>
    </div>
  );
};
