import PageHeader from '../../components/PageHeader';
import CreateRequestPanel from '../../components/workflow/CreateRequestPanel';
import ActionsSetupPanel from '../../components/workflow/ActionsSetupPanel';
import WorkflowRequestsTable from '../../components/workflow/WorkflowRequestsTable';

export default function AdminOverviewPage() {
  return (
    <>
      <PageHeader
        title="Admin overview"
        subtitle="Full request queue and actions — admin visibility across the workflow."
      />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        <div className="lg:col-span-2">
          <CreateRequestPanel />
        </div>
        <div>
          <ActionsSetupPanel />
        </div>
      </div>
      <WorkflowRequestsTable viewMode="admin" />
    </>
  );
}
