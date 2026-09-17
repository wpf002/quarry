import { EmptyState } from '../../components/ui';
export const dynamic = 'force-dynamic';
export default function Page() {
  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Audit</h1>
          <div className="page-sub">Lands in a later phase.</div>
        </div>
      </div>
      <EmptyState title="Coming soon">This view is built in a later phase.</EmptyState>
    </>
  );
}
