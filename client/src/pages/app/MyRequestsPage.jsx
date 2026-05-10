import PageHeader from '../../components/PageHeader';
import CreateRequestPanel from '../../components/workflow/CreateRequestPanel';
import WorkflowRequestsTable from '../../components/workflow/WorkflowRequestsTable';

export default function MyRequestsPage() {
  return (
    <>
      <PageHeader
        title="My requests"
        subtitle="Create workflow requests and track items you submitted."
      />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        <div className="lg:col-span-2">
          <CreateRequestPanel />
        </div>
      </div>
      <WorkflowRequestsTable viewMode="my" />
    </>
  );
}
