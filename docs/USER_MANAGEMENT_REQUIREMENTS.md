# Enterprise User Management & Role Assignment Requirements

## Executive Summary

The current user registration and role assignment system contains critical security and governance flaws. This document establishes proper enterprise-grade user management logic that aligns with organizational hierarchy best practices and security principles.

---

## 1. Core Principles

### 1.1 Principle of Least Privilege
- Users should only have the minimum permissions necessary to perform their job functions
- Role assignment must be controlled and audited
- Self-privilege escalation is prohibited

### 1.2 Separation of Duties
- User creation ≠ Role assignment
- Manager assignment ≠ User creation
- Department head designation ≠ User registration

### 1.3 Organizational Hierarchy Integrity
- Manager relationships reflect actual organizational structure
- Department boundaries are enforced
- Role assignments follow business logic, not user preference

---

## 2. User Registration Logic

### 2.1 Public Registration (Self-Service)
**Who can register:** Any new employee
**What they can provide:**
- Full name (displayName)
- Email address (corporate email domain validated)
- Password
- Department (optional, from predefined list)

**What they CANNOT control:**
- ❌ Role selection (always defaults to USER)
- ❌ Manager assignment (assigned by admin later)
- ❌ Department head status (admin-only)
- ❌ Admin role (admin-only)

**Default state for new users:**
- Role: `USER`
- Manager: `null` (unassigned)
- Department Head: `false`
- Status: Active but requires manager assignment for workflow

### 2.2 Admin-Only User Creation
**Who can create:** System Administrators only
**Additional capabilities:**
- Pre-assign manager relationship
- Set initial role (USER/ADMIN)
- Designate department head status
- Assign to specific department
- Bulk user creation via CSV import

---

## 3. Role Assignment Matrix

### 3.1 USER Role (Default)
- **Can be assigned by:** Admin
- **Can request:** Create workflow requests
- **Can see:** Own requests only
- **Cannot:** See others' requests, approve, manage users

### 3.2 ADMIN Role
- **Can be assigned by:** Existing Admin only
- **Can do:** Everything system-wide
- **Restriction:** Cannot demote the last admin
- **Audit trail:** All admin actions logged with IP/user-agent

### 3.3 Department Head Status (Not a role, but a privilege)
- **Can be assigned by:** Admin only
- **Requirements:** Must be USER role + same department
- **Can do:** Approve/reject department requests, see department inbox
- **Limitation:** Only for assigned department

### 3.4 Manager Assignment (Relationship, not role)
- **Can be assigned by:** Admin only
- **Requirements:** Must be USER role, can be department head
- **Logic:** Reflects actual organizational reporting structure
- **Validation:** Cannot create circular manager relationships

---

## 4. Organizational Hierarchy Rules

### 4.1 Manager-Subordinate Relationships
```
Manager (USER) ── manages ──> Subordinate (USER)
     │                           │
     ▼                           ▼
Can see subordinate's     Can see own requests
requests in inbox         Can be managed by manager
```

### 4.2 Department Structure
```
Department Head (USER + isDepartmentHead=true)
     │
     ▼
Manages all PENDING_DEPARTMENT requests
for specific department only
```

### 4.3 Admin Oversight
```
Admin (ADMIN role)
     │
     ▼
Global visibility of all requests
Can assign any role/relationship
Cannot be restricted by department
```

---

## 5. Implementation Requirements

### 5.1 Registration Form Changes
- [ ] Remove role dropdown (always USER)
- [ ] Remove manager ID field (admin assigns later)
- [ ] Remove department head checkbox (admin assigns)
- [ ] Keep department field (optional, from predefined list)
- [ ] Add email domain validation
- [ ] Add "Your account will require manager assignment" message

### 5.2 Admin User Management Endpoints
- [ ] `PUT /api/admin/users/:id/role` - Change user role
- [ ] `PUT /api/admin/users/:id/manager` - Assign manager
- [ ] `PUT /api/admin/users/:id/department-head` - Toggle department head
- [ ] `GET /api/admin/users` - List all users with management UI
- [ ] `POST /api/admin/users/bulk` - Bulk user creation

### 5.3 Validation Rules
- [ ] Prevent users from assigning themselves as manager
- [ ] Prevent circular manager relationships
- [ ] Validate department head is in same department
- [ ] Prevent removing last admin user
- [ ] Validate email domain during registration

### 5.4 Workflow Integration
- [ ] Users without manager assigned → `PENDING_DEPARTMENT` (skip manager level)
- [ ] Users with manager assigned → `PENDING_MANAGER` (normal workflow)
- [ ] Department heads only see their department's requests

---

## 6. Security & Audit Requirements

### 6.1 Audit Trail
- All role changes logged with:
  - Admin who made the change
  - Previous and new values
  - Timestamp and IP address
  - Reason (required field)

### 6.2 Access Controls
- Admin-only endpoints protected by middleware
- Role changes require admin authentication
- Manager assignments validated for hierarchy integrity

### 6.3 Data Validation
- Email domain must match corporate domain
- Department must be from predefined list
- Manager must exist and be USER role
- Department head must be in same department

---

## 7. Migration Strategy

### 7.1 Phase 1: Fix Registration
1. Update registration form to remove role/manager selections
2. Update backend validation to enforce USER role only
3. Add admin-only user management endpoints

### 7.2 Phase 2: Admin Management UI
1. Create admin user management interface
2. Add bulk user import functionality
3. Implement organizational hierarchy visualization

### 7.3 Phase 3: Data Cleanup
1. Review existing user assignments
2. Fix any self-assigned roles or managers
3. Ensure all users follow proper hierarchy

---

## 8. Testing Requirements

### 8.1 Registration Tests
- New user registration creates USER role only
- Cannot self-assign admin or department head
- Email domain validation works
- Manager assignment is null initially

### 8.2 Admin Management Tests
- Admin can assign manager to user
- Admin can promote user to department head
- Admin cannot create circular manager relationships
- Admin cannot remove last admin

### 8.3 Workflow Tests
- User without manager goes directly to department level
- User with manager follows normal workflow
- Department head only sees department requests

---

## 9. Success Metrics

- Zero self-privilege escalation incidents
- Clear audit trail for all role changes
- Proper organizational hierarchy enforcement
- Separation of duties maintained
- Admin-controlled user management

---

*This requirements document ensures the system follows enterprise security best practices while maintaining functional workflow automation capabilities.*
