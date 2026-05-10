import PageHeader from '../../components/PageHeader';
import ActionsSetupPanel from '../../components/workflow/ActionsSetupPanel';
import WorkflowRequestsTable from '../../components/workflow/WorkflowRequestsTable';

export default function InboxPage() {
  return (
    <>
      <PageHeader
        title="Inbox"
        subtitle="Requests that need your review, approval, or delegation."
      />
      <div className="mb-8">
        <ActionsSetupPanel />
      </div>
      <WorkflowRequestsTable viewMode="inbox" />
    </>
  );
}
