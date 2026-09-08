import * as React from 'react';

const counterKey = Symbol.for('simple-liquid-glass.legacy-id');

// React's version is constant for a mounted tree, so this hook choice never changes.
// React 16/17 delay IDs until mount: server and first client markup stay identical,
// and independently mounted roots receive distinct IDs without shared SSR counters.
function useLegacyId(): string | undefined {
  const [id, setId] = React.useState<string>();
  React.useEffect(() => {
    // Share the counter across independently bundled entry points in this document.
    const scope = document as Document & { [counterKey]?: number };
    const nextId = (scope[counterKey] ?? 0) + 1;
    scope[counterKey] = nextId;
    setId(`legacy-${nextId}`);
  }, []);
  return id;
}

const useId = React.useId ?? useLegacyId;
export function useStableId(): string | undefined {
  const id = useId();
  // Encode rather than strip punctuation, preserving uniqueness in CSS selectors.
  return id === undefined ? undefined : Array.from(id, c => c.charCodeAt(0).toString(16)).join('-');
}
