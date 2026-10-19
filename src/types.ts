import { Timestamp } from 'firebase/firestore';

export type Role = 'parent' | 'child';
export type TaskType = 'daily' | 'weekly' | 'monthly' | 'adhoc_date' | 'adhoc_kpi';
export type EvidenceType = 'photo' | 'document' | 'grade' | 'any';
export type TaskStatus = 'pending' | 'accepted' | 'submitted' | 'approved' | 'needs_retry' | 'missed' | 'forfeited' | 'proposed';

export interface UserProfile {
  uid: string;
  displayName: string;
  role: Role;
  householdId: string;
  totalPoints: number;
  createdAt: Timestamp;
  profilePhoto: string | null;
  avatarColour: string;
  trustScore: number;
  badges: string[];
  email?: string;
  showOnboarding?: boolean;       // parent: show wizard on first login
  showChildOnboarding?: boolean;  // child: show welcome screen on first login
  fcmTokens?: string[];           // registered push notification device tokens
}

export interface RewardItem {
  id: string;
  title: string;
  pointCost: number;
}

export type SubscriptionStatus = 'trialing' | 'active' | 'past_due' | 'cancelled' | 'expired';

export interface Household {
  id: string;
  name: string;
  createdBy: string;
  members: string[];
  rewardStore: RewardItem[];
  currency: string;
  currencyName: string;
  cashOutEnabled: boolean;
  minCashOut: number;
  emailNotificationsEnabled?: boolean;
  createdAt: Timestamp;
  inviteCode: string;
  familyColour: string;
  familyLogo: string | null;
  familyMotto: string | null;
  timezone?: string;
  onboardingTaskPoints?: number;

  // Subscription billing — written only server-side (trial-init trigger, the
  // daily expiry sweep, and the Lemon Squeezy webhook). Never client-writable.
  subscriptionStatus?: SubscriptionStatus;
  trialEndsAt?: Timestamp;
  currentPeriodEnd?: Timestamp | null;
  lemonSqueezy?: {
    customerId?: number;
    subscriptionId?: number;
  } | null;
}

export interface Task {
  id: string;
  householdId: string;
  title: string;
  description: string;
  assignedTo: string;
  assignedToName: string;
  pointValue: number;
  taskType: TaskType;
  status: TaskStatus;
  
  // KPI system
  kpi: string;
  kpiLocked: boolean;
  targetMetric?: string;
  evidenceType: 'photo' | 'document' | 'grade' | 'any';
  
  // Recurrence
  recurrence?: {
    weekday?: string | null;
    dayOfMonth?: number | null;
    lastReset?: Timestamp;
    endDate?: Timestamp | null;
    expired?: boolean;
  };
  
  dueDate: Timestamp | null;
  requiresProof: boolean;
  beforePhotoUrl: string | null;
  proofPhotoUrl: string | null;
  
  // Agreement tracking
  proposedBy: 'parent' | 'child' | null;
  rewardLocked: boolean;
  rewardLockedAt?: Timestamp;
  childAcceptedAt?: Timestamp;
  
  // Retry feedback
  retryNote?: string | null;

  // Missed tracking (for recurring tasks)
  missedCount?: number;
  lastMissedAt?: Timestamp | null;

  // Onboarding task (auto-created when child joins household)
  isOnboardingTask?: boolean;

  completedAt: Timestamp | null;
  approvedAt: Timestamp | null;
  createdAt: Timestamp;

  // Push notification nudges (written only server-side, by the scheduled function
  // or the sendNudge callable)
  lastDueSoonNudgeAt?: Timestamp | null;
  lastStaleNudgeAt?: Timestamp | null;
  lastManualNudgeAt?: Timestamp | null;
}

export type RedemptionType = 'reward' | 'cash';
export type RedemptionStatus = 'pending' | 'approved' | 'rejected' | 'paid';

export interface Redemption {
  id: string;
  householdId: string;
  type: RedemptionType;
  title: string;
  pointsSpent: number;
  cashValue: number;
  childId: string;
  childName: string;
  status: RedemptionStatus;
  
  // Payment Proof Fields
  paidAt: Timestamp | null;
  paidBy: string | null;
  paidByName: string | null;
  paymentMethod: 'cash' | 'bank_transfer' | 'eft' | 'other' | null;
  paymentReference: string | null;
  paymentNote: string | null;
  proofPhotoUrl: string | null;
  
  note: string | null;
  createdAt: Timestamp;
  approvedAt: Timestamp | null;
}

export type NotificationType = 'task_submitted' | 'task_approved' | 'task_needs_retry' | 'task_assigned' |
  'cashout_requested' | 'cashout_paid' | 'reward_redeemed' | 'task_due_soon' | 'welcome' | 'payment_reminder' | 'dispute_raised' |
  'task_stale' | 'parent_nudge';

export interface Dispute {
  id: string;
  householdId: string;
  taskId?: string | null;
  redemptionId?: string | null;
  raisedBy: string;
  raisedByName: string;
  raisedByRole: 'parent' | 'child';
  reason: string;
  desiredOutcome: string;
  status: 'open' | 'resolved';
  createdAt: Timestamp;
  resolvedAt?: Timestamp | null;
  resolvedBy?: string | null;
  resolution?: string | null;
}

export interface Notification {
  id: string;
  householdId: string;
  recipientId: string;
  recipientRole: 'parent' | 'child';
  type: NotificationType;
  title: string;
  message: string;
  read: boolean;
  createdAt: Timestamp;
  relatedTaskId?: string | null;
  relatedRedemptionId?: string | null;
  emoji: string;
}
