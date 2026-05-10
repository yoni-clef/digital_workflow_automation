import PageHeader from '../../components/PageHeader';
import UserManagementTable from '../../components/admin/UserManagementTable';

export default function UserManagementPage() {
  return (
    <>
      <PageHeader
        title="User management"
        subtitle="Assign roles, managers, and department heads."
      />
      <UserManagementTable />
    </>
  );
}
