/** Maps RequestStatus to badge class from index.css */
export function requestStatusBadgeClass(status) {
  switch (status) {
    case 'PENDING_MANAGER':
      return 'badge badge-REQUEST';
    case 'PENDING_DEPARTMENT':
      return 'badge badge-REVIEW';
    case 'APPROVED':
      return 'badge badge-APPROVE';
    case 'REJECTED':
      return 'badge badge-REJECTED';
    case 'NEEDS_INFO':
      return 'badge badge-NEEDS_INFO';
    case 'ARCHIVED':
      return 'badge badge-ARCHIVE';
    default:
      return 'badge';
  }
}
