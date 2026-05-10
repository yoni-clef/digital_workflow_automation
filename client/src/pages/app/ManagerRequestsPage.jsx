import PageHeader from '../../components/PageHeader';
import ManagerRequestsTable from '../../components/admin/ManagerRequestsTable';

export default function ManagerRequestsPage() {
  return (
    <>
      <PageHeader title="Manager requests" subtitle="Approve or reject user requests for a reporting manager." />
      <ManagerRequestsTable />
    </>
  );
}
