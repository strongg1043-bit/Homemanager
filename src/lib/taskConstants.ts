// Shared display constants for task cards — single source of truth.
// Previously duplicated between ParentTaskCard.tsx and ChildTaskCard.tsx (QUAL-3).

export const TYPE_STYLES: Record<string, string> = {
  daily: 'bg-green-100 text-green-800',
  weekly: 'bg-blue-100 text-blue-800',
  monthly: 'bg-pink-100 text-pink-800',
  adhoc_date: 'bg-amber-100 text-amber-800',
  adhoc_kpi: 'bg-purple-100 text-purple-800',
};

// Parent-facing status labels
export const STATUS_LABELS: Record<string, string> = {
  pending: 'Waiting to start',
  accepted: 'In progress',
  submitted: 'Ready for review',
  approved: 'Approved ✓',
  needs_retry: 'Re-do requested',
  missed: 'Missed deadline',
  forfeited: 'Forfeited',
};

// Child-friendly status labels (used in ChildTaskCard)
export const CHILD_STATUS_LABELS: Record<string, string> = {
  pending: 'Waiting for you to start!',
  accepted: 'Mission in progress',
  submitted: 'Ready for review',
  approved: 'Well done! ✓',
  needs_retry: 'Give it another go',
  missed: 'Missed — want to try again?',
  forfeited: 'Missed — want to try again?',
};
