import { useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { describeAiError } from '../lib/aiError';

// The box the Create, Write and Rewrite forms show when a request fails: what
// happened, what to do about it, and the error itself, ready to copy and pass
// on to whoever looks after n8n.
export default function AiErrorNotice({ error, model, className = '' }: { error: string; model?: string; className?: string }) {
  const e = describeAiError(error, model);
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(`${e.title}\n${e.message}${model ? `\nModel: ${model}` : ''}\n\n${e.detail}`);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch { /* the details are on screen to select by hand */ }
  };
  return (
    <div className={`rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800 ${className}`}>
      <div className="flex items-start gap-2">
        <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <div className="font-medium text-amber-900 mb-1">{e.title}</div>
          <p className="leading-relaxed">{e.message}</p>
          {e.detail && (
            <details className="mt-2">
              <summary className="cursor-pointer select-none text-xs font-medium text-amber-900">Error details</summary>
              <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap break-words rounded bg-white/70 p-2 font-mono text-xs text-gray-700">{e.detail}</pre>
              <button type="button" onClick={copy} className="mt-1 text-xs font-medium text-amber-900 underline hover:no-underline">
                {copied ? 'Copied' : 'Copy error'}
              </button>
            </details>
          )}
        </div>
      </div>
    </div>
  );
}
