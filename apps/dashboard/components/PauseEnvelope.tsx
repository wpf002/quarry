'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiPost } from '../lib/api';

export function PauseEnvelope({ id }: { id: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button className="btn btn-ghost btn-sm" disabled={busy}
      onClick={async () => {
        setBusy(true);
        try { await apiPost(`/envelopes/${id}/pause`, { by: 'will', reason: 'manual pause' }); router.refresh(); }
        finally { setBusy(false); }
      }}>
      Pause
    </button>
  );
}
