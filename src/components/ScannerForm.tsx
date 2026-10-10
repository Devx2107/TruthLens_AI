import { useRef, type FormEvent, type ReactNode, type RefObject } from 'react';
import { Link2, Loader2, Plus, Search, Sparkles, TextCursorInput, Upload } from 'lucide-react';
import type { AnalysisMode, InputKind } from '../types';
import { detectInputKind } from '../lib/analyze';

const examplePool: { single: string; batch: string }[] = [
  {
    single: 'Hot water cures all viruses. Share immediately!',
    batch: 'Hot water cures all viruses. Share immediately!\nISRO launches a new satellite to monitor climate change.',
  },
  {
    single: 'Scientists confirm coffee cures all diseases, share immediately!',
    batch: 'Scientists confirm coffee cures all diseases, share immediately!\nWHO releases updated guidance on seasonal flu vaccines.',
  },
  {
    single: 'They don\'t want you to know this one secret trick that cures diabetes overnight!',
    batch: 'They don\'t want you to know this one secret trick that cures diabetes overnight!\nLocal city council approves new public park budget for next year.',
  },
  {
    single: 'BREAKING: Government secretly adds mind-control chemicals to drinking water!!!',
    batch: 'BREAKING: Government secretly adds mind-control chemicals to drinking water!!!\nNew bridge construction project completes ahead of schedule.',
  },
  {
    single: 'Eating this common fruit seed kills cancer cells instantly, doctors are furious!',
    batch: 'Eating this common fruit seed kills cancer cells instantly, doctors are furious!\nUniversity researchers publish peer-reviewed study on sleep patterns.',
  },
];

function ModeButton({
  active,
  icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold transition ${
        active
          ? 'border-teal-700 bg-teal-800 text-white dark:border-teal-300 dark:bg-teal-200 dark:text-slate-950'
          : 'border-slate-300 bg-white text-slate-700 hover:border-teal-500 hover:text-teal-800 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200'
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

interface ScannerFormProps {
  formRef: RefObject<HTMLFormElement>;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  mode: AnalysisMode;
  changeMode: (mode: AnalysisMode) => void;
  inputKind: InputKind;
  setInputKind: (kind: InputKind) => void;
  singleInput: string;
  setSingleInput: (value: string) => void;
  compareInput: string;
  setCompareInput: (value: string) => void;
  compareInputKind: InputKind;
  setCompareInputKind: (kind: InputKind) => void;
  batchInput: string;
  setBatchInput: (value: string) => void;
  imageData: string;
  readImage: (file: File) => void;
  pasteImage: () => Promise<void>;
  loading: boolean;
  loadingMessage: string;
  error: string | null;
  retrySeconds: number | null;
  outputLanguage: 'auto' | 'en' | 'hi';
  setOutputLanguage: (value: 'auto' | 'en' | 'hi') => void;
  setError: (value: string | null) => void;
}

export default function ScannerForm({ formRef: scanFormRef, onSubmit: startAnalysis, mode, changeMode, inputKind, setInputKind, singleInput, setSingleInput, compareInput, setCompareInput, compareInputKind, setCompareInputKind, batchInput, setBatchInput, imageData, readImage, pasteImage, loading, loadingMessage, error, retrySeconds, outputLanguage, setOutputLanguage, setError }: ScannerFormProps) {
  const lastExampleIndex = useRef<number | null>(null);
  return (
    <form ref={scanFormRef} onSubmit={startAnalysis} className="glass-panel rounded-2xl p-5 sm:p-6">
      <div className="flex flex-wrap gap-2">
        <ModeButton active={mode === 'single'} icon={<TextCursorInput className="h-4 w-4" />} label="Single" onClick={() => changeMode('single')} />
        <ModeButton active={mode === 'batch'} icon={<Plus className="h-4 w-4" />} label="Batch" onClick={() => changeMode('batch')} />
        <ModeButton active={mode === 'compare'} icon={<Link2 className="h-4 w-4" />} label="Compare" onClick={() => changeMode('compare')} />
      </div>

      {mode === 'single' && <div className="mt-4 flex flex-wrap gap-2">
        <ModeButton active={inputKind === 'text'} icon={<TextCursorInput className="h-4 w-4" />} label="Text input" onClick={() => setInputKind('text')} />
        <ModeButton active={inputKind === 'url'} icon={<Link2 className="h-4 w-4" />} label="URL input" onClick={() => setInputKind('url')} />
        <ModeButton active={inputKind === 'image'} icon={<Upload className="h-4 w-4" />} label="Image" onClick={() => setInputKind('image')} />
      </div>}

  

      <div className="mt-5 space-y-3">
        <p className="block text-sm font-semibold text-slate-700 dark:text-slate-200">
          {mode === 'batch' ? 'Paste one headline or URL per line' : inputKind === 'url' ? 'Paste a link to scan' : inputKind === 'image' ? 'Upload or paste a screenshot' : 'Paste a message or headline'}
        </p>

        {mode === 'compare' ? <div className="grid gap-3 md:grid-cols-2"><div><div className="mb-2 flex gap-2"><ModeButton active={inputKind === 'text'} icon={<TextCursorInput className="h-4 w-4" />} label="Text" onClick={() => setInputKind('text')} /><ModeButton active={inputKind === 'url'} icon={<Link2 className="h-4 w-4" />} label="URL" onClick={() => setInputKind('url')} /></div><textarea aria-label="First claim" value={singleInput} onChange={(event) => setSingleInput(event.target.value)} placeholder="First claim" className="min-h-44 w-full rounded-xl border border-slate-300 bg-white px-4 py-4 text-base leading-7 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-teal-600 focus:ring-2 focus:ring-teal-500/20 dark:border-white/10 dark:bg-slate-950/30 dark:text-white dark:placeholder:text-slate-500 dark:focus:border-teal-300 dark:focus:ring-teal-300/20" disabled={loading} /></div><div><div className="mb-2 flex gap-2"><ModeButton active={compareInputKind === 'text'} icon={<TextCursorInput className="h-4 w-4" />} label="Text" onClick={() => setCompareInputKind('text')} /><ModeButton active={compareInputKind === 'url'} icon={<Link2 className="h-4 w-4" />} label="URL" onClick={() => setCompareInputKind('url')} /></div><textarea aria-label="Second claim" value={compareInput} onChange={(event) => setCompareInput(event.target.value)} placeholder="Second claim" className="min-h-44 w-full rounded-xl border border-slate-300 bg-white px-4 py-4 text-base leading-7 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-teal-600 focus:ring-2 focus:ring-teal-500/20 dark:border-white/10 dark:bg-slate-950/30 dark:text-white dark:placeholder:text-slate-500 dark:focus:border-teal-300 dark:focus:ring-teal-300/20" disabled={loading} /></div></div> : mode === 'batch' ? (
          <textarea
            aria-label="Claims to analyze, one per line"
            value={batchInput}
            onChange={(event) => setBatchInput(event.target.value)}
            placeholder={'Headline one\nHeadline two\nhttps://example.com/story'}
            className="min-h-44 w-full rounded-xl border border-slate-300 bg-white px-4 py-4 text-base leading-7 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-teal-600 focus:ring-2 focus:ring-teal-500/20 dark:border-white/10 dark:bg-slate-950/30 dark:text-white dark:placeholder:text-slate-500 dark:focus:border-teal-300 dark:focus:ring-teal-300/20"
            disabled={loading}
          />
        ) : inputKind === 'image' ? (
          <div className="rounded-xl border border-dashed border-teal-400/40 bg-slate-50 p-5 text-center dark:bg-slate-950/30">
            <input type="file" aria-label="Upload claim image" accept="image/*" onChange={(event) => event.target.files?.[0] && readImage(event.target.files[0])} disabled={loading} className="block w-full text-sm text-slate-600 dark:text-slate-300" />
            <button type="button" onClick={() => void pasteImage()} className="mt-3 rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-900 dark:border-white/10 dark:bg-white/5 dark:text-white"><Upload className="mr-2 inline h-4 w-4" />Paste from clipboard</button>
            {imageData && <img src={imageData} alt="Selected preview" className="mx-auto mt-4 max-h-48 rounded-2xl" />}
          </div>
        ) : (
          <textarea
            aria-label={inputKind === 'url' ? 'Link to analyze' : 'Claim to analyze'}
            value={singleInput}
            onChange={(event) => setSingleInput(event.target.value)}
            onPaste={(event) => { const pasted = event.clipboardData.getData('text'); if (detectInputKind(pasted) === 'url') setInputKind('url'); }}
            placeholder={
              inputKind === 'url'
                ? 'https://news.example.com/story'
                : 'Hot water cures all viruses. Share immediately!'
            }
            className="min-h-44 w-full rounded-xl border border-slate-300 bg-white px-4 py-4 text-base leading-7 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-teal-600 focus:ring-2 focus:ring-teal-500/20 dark:border-white/10 dark:bg-slate-950/30 dark:text-white dark:placeholder:text-slate-500 dark:focus:border-teal-300 dark:focus:ring-teal-300/20"
            disabled={loading}
          />
        )}
      </div>

                    <details className="mt-4 rounded-xl border border-slate-200 px-4 py-3 text-sm dark:border-slate-700"><summary className="cursor-pointer font-semibold text-slate-700 dark:text-slate-200">Language options</summary><div className="mt-3"><label className="mt-4 flex max-w-xs flex-col gap-2 text-sm font-semibold text-slate-700 dark:text-slate-200">Analysis language<select value={outputLanguage} onChange={(event) => setOutputLanguage(event.target.value as 'auto' | 'en' | 'hi')} className="rounded-2xl border border-slate-300 bg-white px-4 py-3 font-normal text-slate-900 dark:border-white/10 dark:bg-slate-950/30 dark:text-white"><option value="auto">Match the input</option><option value="en">English</option><option value="hi">Hindi</option></select></label></div></details>

    <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <button
          type="submit"
          disabled={loading}
          className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-teal-800 px-5 py-3 text-sm font-bold text-white transition hover:bg-teal-900 dark:bg-teal-300 dark:text-slate-950 dark:hover:bg-teal-200 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          {loading ? loadingMessage : 'Analyze claim'}
          {!loading && <span className="ml-1 hidden text-[11px] font-medium opacity-70 sm:inline">(Ctrl/Cmd+Enter)</span>}
        </button>

        <button
          type="button"
          onClick={() => {
            let nextIndex = Math.floor(Math.random() * examplePool.length);
            if (examplePool.length > 1 && nextIndex === lastExampleIndex.current) {
              nextIndex = (nextIndex + 1) % examplePool.length;
            }
            lastExampleIndex.current = nextIndex;
            const example = examplePool[nextIndex];
            setSingleInput(example.single);
            setBatchInput(example.batch);
            setError(null);
          }}
          className="inline-flex items-center justify-center gap-2 rounded-full border border-slate-300 bg-slate-100 px-5 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-200 dark:border-white/10 dark:bg-white/5 dark:text-white dark:hover:bg-white/10"
        >
          <Sparkles className="h-4 w-4" />
          Load examples
        </button>
      </div>

      {error && (
        <div role="alert" className="mt-4 rounded-2xl border border-rose-500/20 bg-rose-50 px-4 py-3 text-sm text-rose-900 dark:bg-rose-500/10 dark:text-rose-100">
          {error}
          {retrySeconds !== null && retrySeconds > 0 && <span className="mt-1 block font-semibold">You can try again in {retrySeconds}s.</span>}
        </div>
      )}
    </form>
  );
}
