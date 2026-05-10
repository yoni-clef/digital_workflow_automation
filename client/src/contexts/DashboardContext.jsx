import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  createRequest,
  delegateRequest,
  listRequests,
  transitionRequest,
  uploadAttachment,
  listUsers,
  updateUserRole,
  updateUserManager,
  updateUserDepartmentHead,
  createManagerRequest,
  getManagerRequests,
  approveManagerRequest,
  rejectManagerRequest,
} from '../api';
import { useAuth } from '../AuthContext';
import { filterRequests, sortRequests } from '../utils';

const nextActionByStatus = {
  PENDING_MANAGER: { action: 'REVIEW', label: 'Manager Approve', required: 'MANAGER' },
  PENDING_DEPARTMENT: { action: 'APPROVE', label: 'Dept Approve', required: 'DEPT_HEAD' },
  NEEDS_INFO: { action: 'RESUBMIT', label: 'Resubmit', required: 'SUBMITTER' },
  APPROVED: { action: 'ARCHIVE', label: 'Archive', required: 'DEPT_HEAD' },
  ARCHIVED: null,
  REJECTED: null,
};

export function canActOnRequest(user, item, step) {
  if (!user || user.role === 'ADMIN') return true;
  if (!step) return false;
  if (step.required === 'SUBMITTER') {
    return item.submitter?.id === user.id;
  }
  if (step.required === 'MANAGER') {
    return item.submitter?.managerId === user.id || item.assignedTo?.id === user.id;
  }
  if (step.required === 'DEPT_HEAD') {
    return (
      (user.isDepartmentHead && item.submitter?.department === user.department) ||
      item.assignedTo?.id === user.id
    );
  }
  return false;
}

export { nextActionByStatus };

const DashboardContext = createContext(null);

export function DashboardProvider({ children }) {
  const { user } = useAuth();
  const [items, setItems] = useState([]);
  const [users, setUsers] = useState([]);
  const [managerRequests, setManagerRequests] = useState([]);
  const [loadingRequests, setLoadingRequests] = useState(false);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [loadingManagerRequests, setLoadingManagerRequests] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState({ message: null, variant: 'success' });

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('GENERAL');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [delegateRole, setDelegateRole] = useState('USER');
  const [delegateName, setDelegateName] = useState('');
  const [delegateEmail, setDelegateEmail] = useState('');
  const [managerRequestReason, setManagerRequestReason] = useState('');
  const [managerPickByRequestId, setManagerPickByRequestId] = useState({});
  const [file, setFile] = useState(null);
  const [creatingRequest, setCreatingRequest] = useState(false);
  const [submittingManagerRequest, setSubmittingManagerRequest] = useState(false);

  const [filterStatus, setFilterStatus] = useState('ALL');
  const [filterCategory, setFilterCategory] = useState('ALL');
  const [sortBy, setSortBy] = useState('updatedAt');

  const showToast = useCallback((message, variant = 'success') => {
    setToast({ message, variant });
    window.setTimeout(() => setToast({ message: null, variant: 'success' }), 5000);
  }, []);

  const dismissToast = useCallback(() => {
    setToast({ message: null, variant: 'success' });
  }, []);

  const refresh = useCallback(async () => {
    if (!user) return;
    setError('');
    setLoadingRequests(true);
    try {
      const list = await listRequests();
      setItems(list);
    } catch (e) {
      setError(e?.message ?? 'Failed to load');
    } finally {
      setLoadingRequests(false);
    }
  }, [user]);

  const refreshUsers = useCallback(async () => {
    if (!user) return;
    setError('');
    setLoadingUsers(true);
    try {
      const userList = await listUsers();
      setUsers(userList);
    } catch (e) {
      setError(e?.message ?? 'Failed to load users');
    } finally {
      setLoadingUsers(false);
    }
  }, [user]);

  const loadManagerRequests = useCallback(async () => {
    if (!user || user.role !== 'ADMIN') return;
    setError('');
    setLoadingManagerRequests(true);
    try {
      const requests = await getManagerRequests();
      setManagerRequests(requests);
    } catch (e) {
      setError(e?.message ?? 'Failed to load manager requests');
    } finally {
      setLoadingManagerRequests(false);
    }
  }, [user]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const filterListByView = useCallback(
    (list, viewMode) => {
      if (viewMode === 'my') {
        return list.filter(
          (i) => i.submitter?.id === user?.id || i.submitter?.email === user?.email
        );
      }
      if (viewMode === 'inbox') {
        return list.filter((i) => {
          const step = nextActionByStatus[i.status];
          if (canActOnRequest(user, i, step)) return true;
          if (i.assignedTo && i.assignedTo.email === user?.email) return true;
          if (i.status === 'PENDING_MANAGER' && i.submitter?.managerId === user?.id) return true;
          if (
            i.status === 'PENDING_DEPARTMENT' &&
            user?.isDepartmentHead &&
            i.submitter?.department === user?.department
          )
            return true;
          return false;
        });
      }
      return list;
    },
    [user]
  );

  const getFilteredItems = useCallback(
    (viewMode) => {
      const list = filterListByView(items, viewMode);
      return sortRequests(filterRequests(list, { status: filterStatus, category: filterCategory }), sortBy);
    },
    [items, filterStatus, filterCategory, sortBy, filterListByView]
  );

  const canCreate = useMemo(() => {
    return (
      Boolean(user) &&
      title.trim().length >= 3 &&
      (amount.trim() === '' || Number.isFinite(Number(amount))) &&
      user?.managerId
    );
  }, [user, title, amount]);

  async function onCreate(e) {
    e.preventDefault();
    if (!canCreate) return;
    setError('');
    setCreatingRequest(true);
    try {
      const createdItem = await createRequest({
        title: title.trim(),
        description: description.trim(),
        category,
        amountCents: amount.trim() ? Math.round(Number(amount) * 100) : undefined,
      });
      if (file) {
        await uploadAttachment(createdItem.id, file);
      }
      setTitle('');
      setDescription('');
      setAmount('');
      setFile(null);
      await refresh();
      showToast('Request created successfully.');
    } catch (e2) {
      setError(e2?.message ?? 'Failed to create');
    } finally {
      setCreatingRequest(false);
    }
  }

  async function onDelegate(item) {
    if (delegateName.trim().length < 2) {
      setError('Enter a delegate name.');
      return;
    }
    setError('');
    try {
      await delegateRequest(item.id, {
        displayName: delegateName.trim(),
        email: delegateEmail.trim(),
        role: delegateRole,
        department: user.department ?? '',
        note: note.trim() ? note.trim() : undefined,
      });
      await refresh();
      showToast('Delegated successfully.');
    } catch (e2) {
      setError(e2?.message ?? 'Failed to delegate');
    }
  }

  async function onTransition(item, step) {
    if (!step) return;
    setError('');
    try {
      await transitionRequest(item.id, {
        action: step.action,
        note: note.trim() ? note.trim() : undefined,
      });
      await refresh();
      showToast('Request updated.');
    } catch (e2) {
      setError(e2?.message ?? 'Failed to transition');
    }
  }

  async function submitManagerRequest(e) {
    e.preventDefault();
    if (!managerRequestReason.trim()) {
      setError('Please enter a reason.');
      return;
    }
    setError('');
    setSubmittingManagerRequest(true);
    try {
      await createManagerRequest(managerRequestReason.trim());
      setManagerRequestReason('');
      showToast('Manager request submitted. An admin will review it.');
    } catch (err) {
      setError(err?.message || 'Failed to submit request');
    } finally {
      setSubmittingManagerRequest(false);
    }
  }

  const value = {
    user,
    items,
    users,
    managerRequests,
    loadingRequests,
    loadingUsers,
    loadingManagerRequests,
    creatingRequest,
    submittingManagerRequest,
    error,
    setError,
    toast,
    dismissToast,
    showToast,
    refresh,
    refreshUsers,
    loadManagerRequests,
    getFilteredItems,
    canActOnRequest,
    nextActionByStatus,
    canCreate,
    onCreate,
    onDelegate,
    onTransition,
    title,
    setTitle,
    description,
    setDescription,
    category,
    setCategory,
    amount,
    setAmount,
    note,
    setNote,
    delegateRole,
    setDelegateRole,
    delegateName,
    setDelegateName,
    delegateEmail,
    setDelegateEmail,
    managerRequestReason,
    setManagerRequestReason,
    managerPickByRequestId,
    setManagerPickByRequestId,
    file,
    setFile,
    filterStatus,
    setFilterStatus,
    filterCategory,
    setFilterCategory,
    sortBy,
    setSortBy,
    updateUserRole,
    updateUserManager,
    updateUserDepartmentHead,
    approveManagerRequest,
    rejectManagerRequest,
    submitManagerRequest,
  };

  return <DashboardContext.Provider value={value}>{children}</DashboardContext.Provider>;
}

export function useDashboard() {
  const ctx = useContext(DashboardContext);
  if (!ctx) {
    throw new Error('useDashboard must be used within DashboardProvider');
  }
  return ctx;
}
