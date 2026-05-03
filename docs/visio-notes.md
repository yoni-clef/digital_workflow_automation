# Visio notes (how to draw the workflow)

## Diagram type
- Use a basic **Flowchart** template.

## Swimlanes (optional)
If you want roles:
- Requester
- Reviewer
- Approver
- Records (Archive)

## States and transitions
- **Request** → **Review** → **Approve** → **Archive**
- Use single-direction arrows (left-to-right or top-to-bottom).
- Make **Archive** an end/terminator shape if you want.

## Suggested labels
- Request → Review: "Submit for review"
- Review → Approve: "Approve"
- Approve → Archive: "Archive"

## Data captured in this prototype
- Request: id, title, description, createdBy, status, timestamps
- History: at, from, to, by, note
